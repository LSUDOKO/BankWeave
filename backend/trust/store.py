"""Investigation store: cases, claims, evidence, actions and episodic events.

Each case lives in its own `case_<id>` graph (per-case memory). A light mirror in the
consortium graph (Case, claim summaries, ABOUT links) powers cross-case recall.

Every Evidence carries an `origin`: the atomic, independent fact it rests on. Echo-proof
confidence counts distinct origins, not paths (see trust/echo.py).
"""
from __future__ import annotations

import hashlib
import json
import time
import uuid

from app import db, events
from app.cypher import cy

VALID_STATES = ("active", "needs_verification", "historical_only", "superseded")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def origin_for(kind: str, **k) -> str:
    """Canonical independent-source atom for an evidence item."""
    if kind == "path":  # many shortest paths between the same endpoints = one fact
        return f"flow:{k['src']}->{k['dst']}"
    if kind == "shared_attr":
        return f"attr:{k['attr']}"
    if kind == "algo_score":
        return f"algo:{k['algo']}:{k['case']}:{k['account']}"
    if kind == "typology_match":
        return f"typ:{k['pattern']}:{k['account']}"
    if kind == "kyc_fact":
        return f"kyc:{k['row']}"
    if kind == "doc":
        return f"doc:{k['chunk']}"
    if kind == "passthrough":
        return f"pt:{k['account']}"
    if kind == "behavior_similarity":
        return f"beh:{k['account']}:{k['other']}"
    if kind == "txnset":
        return "txnset:" + hashlib.sha1(",".join(sorted(k["txns"])).encode()).hexdigest()[:12]
    raise ValueError(f"unknown evidence kind {kind}")


CREATE_CASE = cy("case_create", "Open a case in its own graph", """
CREATE (c:Case {id:$id, status:'open', opened_at:timestamp(), seed_alert:$alert,
                seed_account:$account, bank_scope:$banks, title:$title})
""")

MIRROR_CASE = cy("case_mirror_consortium", "Mirror a case in the consortium for recall", """
MATCH (al:Alert {id:$alert})
MERGE (c:Case {id:$id})
SET c.status = 'open', c.opened_at = timestamp(), c.seed_account = $account, c.title = $title
MERGE (c)-[:OPENED_FROM]->(al)
SET al.status = 'case', al.case_id = $id
""")

ADD_EVIDENCE = cy("evidence_add", "Record evidence with its origin and producing query", """
MERGE (e:Evidence {id:$id})
ON CREATE SET e.kind = $kind, e.origin = $origin, e.summary = $summary, e.payload = $payload,
              e.cypher = $cypher, e.state = 'active', e.created_at = timestamp(),
              e.author_agent = $agent, e.accounts = $accounts
RETURN e.id AS id
""")

ADD_CLAIM = cy("claim_add", "Create a claim supported by existing evidence", """
CREATE (c:Claim {id:$id, text:$text, kind:$kind, about:$about, author_agent:$agent,
                 state:'active', created_at:timestamp(), confidence:0.0,
                 independent_sources:0, paths:0})
WITH c
UNWIND $evidence AS eid
MATCH (e:Evidence {id:eid})
CREATE (c)-[:SUPPORTED_BY {weight:1.0}]->(e)
RETURN c.id AS id, count(e) AS linked
""")

LINK_ABOUT = cy("claim_about_accounts", "Attach a claim to the accounts it is about", """
MATCH (c:Claim {id:$claim})
UNWIND $accounts AS aid
MERGE (a:Account {id:aid})
MERGE (c)-[:ABOUT]->(a)
""")

SUPPORT = cy("claim_support", "Add supporting evidence to a claim", """
MATCH (c:Claim {id:$claim}), (e:Evidence {id:$evidence})
MERGE (c)-[:SUPPORTED_BY {weight:1.0}]->(e)
""")

CHALLENGE = cy("claim_challenge", "Attach challenging evidence to a claim", """
MATCH (c:Claim {id:$claim}), (e:Evidence {id:$evidence})
MERGE (c)-[:CHALLENGED_BY]->(e)
""")

DERIVE = cy("claim_derive", "Record that a claim is derived from another claim", """
MATCH (a:Claim {id:$child}), (b:Claim {id:$parent})
MERGE (a)-[:DERIVED_FROM]->(b)
""")

MIRROR_CLAIM = cy("claim_mirror_consortium", "Mirror a claim summary for cross-case recall", """
MATCH (k:Case {id:$case})
MERGE (c:Claim {id:$id})
SET c.text = $text, c.kind = $kind, c.state = 'active', c.case_id = $case
MERGE (k)-[:HAS_CLAIM]->(c)
WITH c
UNWIND $accounts AS aid
MATCH (a:Account {id:aid})
MERGE (c)-[:ABOUT]->(a)
""")

ADD_ACTION = cy("action_propose", "Propose a human-approved action justified by claims", """
CREATE (a:Action {id:$id, kind:$kind, status:'proposed', state:'active', ts:timestamp(),
                  rationale:$rationale, target:$target})
WITH a
UNWIND $claims AS cid
MATCH (c:Claim {id:cid})
CREATE (a)-[:JUSTIFIED_BY]->(c)
RETURN a.id AS id
""")

APPEND_EVENT = cy("event_append", "Append an episodic event to the case timeline", """
MATCH (c:Case {id:$case})
OPTIONAL MATCH (c)-[:HAD_EVENT]->(last:Event) WHERE NOT (last)-[:NEXT]->()
CREATE (e:Event {id:$id, ts:timestamp(), agent:$agent, action:$action, payload:$payload,
                 cypher:$cypher})
CREATE (c)-[:HAD_EVENT]->(e)
FOREACH (_ IN CASE WHEN last IS NULL THEN [] ELSE [1] END | CREATE (last)-[:NEXT]->(e))
RETURN e.id AS id
""")

SET_CASE_STATUS = cy("case_set_status", "Update case status", """
MATCH (c:Case {id:$id}) SET c.status = $status, c.updated_at = timestamp()
""")


def case_graph(case_id: str) -> str:
    return db.case_graph(case_id)


def open_case(alert_id: str, account_id: str, banks: list[str], title: str,
              consortium: str = db.CONSORTIUM, case_id: str | None = None) -> str:
    cid = case_id or new_id("C")
    g = case_graph(cid)
    for label in ("Claim", "Evidence", "Action", "Event", "Account", "SAR", "Sentence"):
        db.try_query(g, f"CREATE INDEX FOR (n:{label}) ON (n.id)")
    db.q(g, CREATE_CASE, {"id": cid, "alert": alert_id, "account": account_id,
                          "banks": banks, "title": title})
    db.q(consortium, MIRROR_CASE, {"id": cid, "alert": alert_id, "account": account_id,
                                   "title": title})
    events.publish("case", g, cid, {"status": "open", "alert": alert_id, "title": title})
    return cid


def add_evidence(case_id: str, kind: str, origin: str, summary: str, payload: dict,
                 cypher: str | None, agent: str, accounts: list[str] | None = None,
                 evidence_id: str | None = None) -> str:
    eid = evidence_id or new_id("E")
    db.q(case_graph(case_id), ADD_EVIDENCE, {
        "id": eid, "kind": kind, "origin": origin, "summary": summary,
        "payload": json.dumps(payload, default=str)[:20000], "cypher": cypher or "",
        "agent": agent, "accounts": accounts or []})
    events.publish("evidence", case_graph(case_id), eid,
                   {"kind": kind, "origin": origin, "summary": summary}, agent=agent,
                   cypher=cypher)
    return eid


def add_claim(case_id: str, text: str, kind: str, evidence_ids: list[str], agent: str,
              about: list[str], consortium: str = db.CONSORTIUM) -> str:
    if not evidence_ids:
        raise ValueError("a claim needs at least one evidence id")
    g = case_graph(case_id)
    found = db.q(g, "MATCH (e:Evidence) WHERE e.id IN $ids RETURN count(e) AS c",
                 {"ids": evidence_ids})[0]["c"]
    if found != len(set(evidence_ids)):
        raise ValueError("claim cites evidence that does not exist in this case")
    cid = new_id("CL")
    db.q(g, ADD_CLAIM, {"id": cid, "text": text, "kind": kind, "about": about,
                        "agent": agent, "evidence": list(set(evidence_ids))})
    db.q(g, LINK_ABOUT, {"claim": cid, "accounts": about})
    db.q(consortium, MIRROR_CLAIM, {"id": cid, "case": case_id, "text": text, "kind": kind,
                                    "accounts": about})
    events.publish("claim", g, cid, {"text": text, "kind": kind, "evidence": evidence_ids},
                   agent=agent)
    return cid


def support(case_id: str, claim_id: str, evidence_id: str) -> None:
    db.q(case_graph(case_id), SUPPORT, {"claim": claim_id, "evidence": evidence_id})


def challenge(case_id: str, claim_id: str, evidence_id: str, agent: str = "skeptic") -> None:
    db.q(case_graph(case_id), CHALLENGE, {"claim": claim_id, "evidence": evidence_id})
    events.publish("claim", case_graph(case_id), claim_id,
                   {"challenged_by": evidence_id}, agent=agent)


def derive(case_id: str, child: str, parent: str) -> None:
    db.q(case_graph(case_id), DERIVE, {"child": child, "parent": parent})


def propose_action(case_id: str, kind: str, claim_ids: list[str], rationale: str,
                   target: str, agent: str) -> str:
    if kind not in ("freeze_rec", "escalate", "file_sar", "close"):
        raise ValueError("unknown action kind")
    if not claim_ids:
        raise ValueError("an action must be justified by at least one claim")
    aid = new_id("A")
    db.q(case_graph(case_id), ADD_ACTION, {"id": aid, "kind": kind, "claims": claim_ids,
                                           "rationale": rationale, "target": target})
    events.publish("action", case_graph(case_id), aid,
                   {"kind": kind, "status": "proposed", "target": target}, agent=agent)
    return aid


def log_event(case_id: str, agent: str, action: str, payload: dict | None = None,
              cypher: str | None = None) -> str:
    eid = new_id("EV")
    db.q(case_graph(case_id), APPEND_EVENT, {
        "case": case_id, "id": eid, "agent": agent, "action": action,
        "payload": json.dumps(payload or {}, default=str)[:8000], "cypher": cypher or ""})
    events.publish("agent_step", case_graph(case_id), eid,
                   {"action": action, **(payload or {})}, agent=agent, cypher=cypher)
    return eid


def set_status(case_id: str, status: str, consortium: str = db.CONSORTIUM) -> None:
    db.q(case_graph(case_id), SET_CASE_STATUS, {"id": case_id, "status": status})
    db.q(consortium, SET_CASE_STATUS, {"id": case_id, "status": status})
    events.publish("case", case_graph(case_id), case_id, {"status": status})


def now_ms() -> int:
    return int(time.time() * 1000)
