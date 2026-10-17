import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.blackboard import Blackboard
from app import db, events
from app.cypher import cy
from memory import episodic
from trust import echo, store, validity

router = APIRouter(prefix="/cases", tags=["cases"])

LIST = cy("api_cases_list", "Cases with headline numbers", """
MATCH (c:Case)
OPTIONAL MATCH (c)-[:OPENED_FROM]->(al:Alert)
OPTIONAL MATCH (c)-[:CONCERNS]->(a:Account)
RETURN c.id AS id, c.status AS status, c.title AS title, c.opened_at AS opened_at,
       c.seed_account AS seed, count(DISTINCT al) AS alerts, count(DISTINCT a) AS accounts,
       collect(DISTINCT a.bank_id) AS banks
ORDER BY opened_at DESC
""")

CLAIMS = cy("api_case_claims", "Claims with echo-proof numbers and state", """
MATCH (c:Claim)
OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(e:Evidence)
OPTIONAL MATCH (c)-[:CHALLENGED_BY]->(x:Evidence)
OPTIONAL MATCH (c)-[:DERIVED_FROM]->(p:Claim)
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.state AS state, c.about AS about,
       c.confidence AS confidence, c.naive_confidence AS naive_confidence, c.paths AS paths,
       c.independent_sources AS independent_sources,
       c.independent_challenges AS independent_challenges, c.author_agent AS author,
       collect(DISTINCT e.id) AS evidence, collect(DISTINCT x.id) AS challenges,
       collect(DISTINCT p.id) AS derived_from, c.created_at AS created_at
ORDER BY created_at
""")

EVIDENCE = cy("api_case_evidence", "All evidence of a case including superseded history", """
MATCH (e:Evidence)
OPTIONAL MATCH (n:Evidence)-[s:SUPERSEDES]->(e)
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.summary AS summary, e.state AS state,
       e.accounts AS accounts, e.cypher AS cypher, e.author_agent AS author,
       e.created_at AS created_at, e.superseded_reason AS superseded_reason,
       e.superseded_at AS superseded_at, collect(n.id) AS superseded_by
ORDER BY created_at
""")

ACTIONS = cy("api_case_actions", "Actions with justification", """
MATCH (a:Action)
OPTIONAL MATCH (a)-[:JUSTIFIED_BY]->(c:Claim)
RETURN a.id AS id, a.kind AS kind, a.status AS status, a.state AS state, a.target AS target,
       a.rationale AS rationale, a.approved_by AS approved_by, a.note AS note,
       collect(c.id) AS claims, a.ts AS ts
ORDER BY ts
""")

GRAPH_NODES = cy("api_case_graph_nodes", "Accounts of a case graph for the UI", """
MATCH (a:Account) WHERE a.bank_id IS NOT NULL
RETURN a.id AS id, a.bank_id AS bank, coalesce(a.motif_score, 0.0) AS motif,
       coalesce(a.pagerank_global, 0.0) AS pagerank
""")

GRAPH_EDGES = cy("api_case_graph_edges", "Transfers of a case graph for the UI", """
MATCH (s:Account)-[t:TRANSFERS]->(d:Account)
RETURN s.id AS source, d.id AS target, t.txn_id AS txn_id, t.amount AS amount, t.ts AS ts
""")

CHAIN = cy("api_evidence_chain", "Full chain behind a claim: claims, evidence, queries", """
MATCH (c:Claim {id:$id})
OPTIONAL MATCH (c)-[:DERIVED_FROM*0..5]->(k:Claim)
OPTIONAL MATCH (k)-[r:SUPPORTED_BY|CHALLENGED_BY]->(e:Evidence)
RETURN collect(DISTINCT {id:k.id, text:k.text, state:k.state}) AS claims,
       collect(DISTINCT {id:e.id, rel:type(r), kind:e.kind, origin:e.origin, summary:e.summary,
                         state:e.state, cypher:e.cypher, payload:e.payload}) AS evidence
""")


def _exists(case_id: str) -> str:
    g = db.case_graph(case_id)
    if g not in db.list_graphs():
        raise HTTPException(404, "case not found")
    return g


@router.get("")
def list_cases():
    return {"cases": db.ro(db.CONSORTIUM, LIST)}


@router.get("/{case_id}")
def get_case(case_id: str):
    g = _exists(case_id)
    case = db.ro(g, "MATCH (c:Case) RETURN c.id AS id, c.status AS status, c.title AS title, "
                    "c.seed_account AS seed, c.seed_alert AS alert, c.bank_scope AS banks, "
                    "c.opened_at AS opened_at")[0]
    return {"case": case, "claims": db.ro(g, CLAIMS), "evidence": db.ro(g, EVIDENCE),
            "actions": db.ro(g, ACTIONS), "pending_tasks": Blackboard().pending(case_id)}


@router.get("/{case_id}/graph")
def case_graph(case_id: str):
    g = _exists(case_id)
    return {"nodes": db.ro(g, GRAPH_NODES), "edges": db.ro(g, GRAPH_EDGES)}


@router.get("/{case_id}/timeline")
def timeline(case_id: str):
    _exists(case_id)
    return {"events": episodic.timeline(case_id)}


@router.get("/{case_id}/resume")
def resume(case_id: str):
    _exists(case_id)
    return episodic.resume_summary(case_id, Blackboard().pending(case_id))


@router.get("/{case_id}/claims/{claim_id}/echo")
def claim_echo(case_id: str, claim_id: str):
    _exists(case_id)
    return echo.echo_check(case_id, claim_id)


@router.get("/{case_id}/claims/{claim_id}/evidence_chain")
def evidence_chain(case_id: str, claim_id: str):
    g = _exists(case_id)
    rows = db.ro(g, CHAIN, {"id": claim_id})
    if not rows:
        raise HTTPException(404, "claim not found")
    r = rows[0]
    for e in r["evidence"]:
        try:
            e["payload"] = json.loads(e.get("payload") or "null")
        except ValueError:
            pass
    r["evidence"] = [e for e in r["evidence"] if e.get("id")]
    return {"claim_id": claim_id, **r, "query": CHAIN}


@router.get("/{case_id}/premise")
def premise(case_id: str, action_id: str | None = None, claim_id: str | None = None):
    _exists(case_id)
    return validity.premise_check(case_id, action_id, claim_id)


@router.get("/{case_id}/as_of")
def as_of(case_id: str, ts: int):
    _exists(case_id)
    return {"beliefs": validity.beliefs_as_of(case_id, ts)}


class Invalidate(BaseModel):
    evidence_id: str
    reason: str


@router.post("/{case_id}/invalidate")
def invalidate(case_id: str, body: Invalidate):
    _exists(case_id)
    return validity.invalidate_evidence(case_id, body.evidence_id, body.reason)


@router.post("/{case_id}/rerun")
def rerun(case_id: str):
    """Ask the agents to re-investigate (e.g. after a cascade)."""
    _exists(case_id)
    store.set_status(case_id, "open")
    tid = Blackboard().create("investigate", case_id=case_id, round_=1)
    events.publish("case", db.case_graph(case_id), case_id, {"status": "open", "rerun": tid})
    return {"task": tid}
