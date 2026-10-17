"""Human approval of agent-proposed actions. Agents recommend; humans approve."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.blackboard import Blackboard
from app import db, events
from app.cypher import cy
from trust import store, validity

router = APIRouter(prefix="/actions", tags=["actions"])

PENDING = cy("api_actions_pending", "Proposed actions across all cases", """
MATCH (k:Case) WHERE k.status IN ['awaiting_approval', 'open']
RETURN k.id AS case_id, k.title AS title
""")

DECIDE = cy("action_decide", "Record a human decision on an action", """
MATCH (a:Action {id:$id})
SET a.status = $status, a.approved_by = $by, a.decided_at = timestamp(), a.note = $note,
    a.override_stale = $override
RETURN a.id AS id, a.kind AS kind, a.status AS status
""")

OPEN_ACTIONS = cy("api_case_open_actions", "Undecided actions in a case", """
MATCH (a:Action {status:'proposed'}) RETURN count(a) AS n
""")

CASE_ACTIONS = cy("api_case_actions_for_approval", "Actions with justification for approval UI", """
MATCH (a:Action)
OPTIONAL MATCH (a)-[:JUSTIFIED_BY]->(c:Claim)
RETURN a.id AS id, a.kind AS kind, a.status AS status, a.state AS state, a.target AS target,
       a.rationale AS rationale, collect({id:c.id, text:c.text, confidence:c.confidence,
       sources:c.independent_sources, paths:c.paths, state:c.state}) AS claims
""")


class Decision(BaseModel):
    analyst: str = "analyst"
    note: str = ""
    override_stale: bool = False


@router.get("")
def pending():
    out = []
    for k in db.ro(db.CONSORTIUM, PENDING):
        g = db.case_graph(k["case_id"])
        if g not in db.list_graphs():
            continue
        for a in db.ro(g, CASE_ACTIONS):
            if a["status"] == "proposed":
                a["premise"] = validity.premise_check(k["case_id"], action_id=a["id"])
                out.append({**a, "case_id": k["case_id"], "case_title": k["title"]})
    return {"actions": out}


def _decide(case_id: str, action_id: str, status: str, d: Decision) -> dict:
    g = db.case_graph(case_id)
    if g not in db.list_graphs():
        raise HTTPException(404, "case not found")
    pc = validity.premise_check(case_id, action_id=action_id)
    if status == "approved" and not pc["ok"] and not (d.override_stale and d.note.strip()):
        raise HTTPException(409, {"message": pc["message"], "stale": pc["stale"],
                                  "hint": "approve with override_stale=true and a note"})
    rows = db.q(g, DECIDE, {"id": action_id, "status": status, "by": d.analyst,
                            "note": d.note, "override": d.override_stale})
    if not rows:
        raise HTTPException(404, "action not found")
    store.log_event(case_id, "human", f"action_{status}",
                    {"action": action_id, "by": d.analyst, "note": d.note,
                     "stale_premises": pc["stale"]})
    events.publish("action", g, action_id, {"status": status, "by": d.analyst})
    if db.ro(g, OPEN_ACTIONS)[0]["n"] == 0:  # all decided -> Archivist turns it into memory
        Blackboard().create("archive", case_id=case_id)
    return {**rows[0], "premise": pc}


@router.post("/{case_id}/{action_id}/approve")
def approve(case_id: str, action_id: str, d: Decision):
    return _decide(case_id, action_id, "approved", d)


@router.post("/{case_id}/{action_id}/reject")
def reject(case_id: str, action_id: str, d: Decision):
    return _decide(case_id, action_id, "rejected", d)
