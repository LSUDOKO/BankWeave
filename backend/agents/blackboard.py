"""Graph blackboard: agents coordinate through Task nodes in FalkorDB.

Agents hold only ids in memory. A task is claimed atomically (FalkorDB serialises writes per
graph, so one MATCH+SET query has a single winner), heartbeats while running, and is reset to
`todo` when its heartbeat goes stale - which is what makes kill-and-resume work.
"""
from __future__ import annotations

import json
import time
import uuid

from app import db, events
from app.cypher import cy

CREATE = cy("task_create", "Put a task on the blackboard", """
CREATE (t:Task {id:$id, type:$type, case_id:$case, alert_id:$alert, status:'todo',
                created_at:timestamp(), payload:$payload, attempts:0, round:$round})
RETURN t.id AS id
""")

CLAIM = cy("task_claim_atomic", "Claim the next task: open cases before new triage (one winner)", """
MATCH (t:Task {status:'todo'}) WHERE t.type IN $types
WITH t ORDER BY CASE t.type WHEN 'triage' THEN 1 ELSE 0 END, t.created_at LIMIT 1
SET t.status = 'claimed', t.assignee = $agent, t.claimed_at = timestamp(),
    t.hb = timestamp(), t.attempts = t.attempts + 1
RETURN t.id AS id, t.type AS type, t.case_id AS case_id, t.alert_id AS alert_id,
       t.payload AS payload, t.assignee AS assignee, t.round AS round
""")

HEARTBEAT = cy("task_heartbeat", "Worker heartbeat on a claimed task", """
MATCH (t:Task {id:$id, assignee:$agent, status:'claimed'}) SET t.hb = timestamp()
RETURN t.id AS id
""")

DONE = cy("task_done", "Mark a task done with a result reference", """
MATCH (t:Task {id:$id}) SET t.status = 'done', t.done_at = timestamp(), t.result = $result
""")

FAIL = cy("task_fail", "Return a failed task to the queue (or park it after 3 attempts)", """
MATCH (t:Task {id:$id})
SET t.status = CASE WHEN t.attempts >= 3 THEN 'failed' ELSE 'todo' END,
    t.error = $error, t.assignee = null
""")

RESET_STALE = cy("task_reset_stale", "Reset tasks whose worker stopped heart-beating", """
MATCH (t:Task {status:'claimed'}) WHERE t.hb < timestamp() - $stale_ms
SET t.status = 'todo', t.reset_from = t.assignee, t.assignee = null, t.resets = coalesce(t.resets, 0) + 1
RETURN t.id AS id, t.type AS type, t.case_id AS case_id, t.reset_from AS from_agent
""")

PENDING_FOR_CASE = cy("task_pending_for_case", "Open tasks of a case", """
MATCH (t:Task) WHERE t.case_id = $case AND t.status IN ['todo', 'claimed']
RETURN t.id AS id, t.type AS type, t.status AS status, t.assignee AS assignee
""")

STATS = cy("task_stats", "Blackboard counts by type and status", """
MATCH (t:Task) RETURN t.type AS type, t.status AS status, count(t) AS n
""")


class Blackboard:
    def __init__(self, graph: str = db.CONSORTIUM):
        self.graph = graph
        db.try_query(graph, "CREATE INDEX FOR (t:Task) ON (t.status)")
        db.try_query(graph, "CREATE INDEX FOR (t:Task) ON (t.id)")

    def create(self, type_: str, case_id: str | None = None, alert_id: str | None = None,
               payload: dict | None = None, round_: int = 0) -> str:
        tid = f"T-{uuid.uuid4().hex[:8]}"
        db.q(self.graph, CREATE, {"id": tid, "type": type_, "case": case_id, "alert": alert_id,
                                  "payload": json.dumps(payload or {}), "round": round_})
        events.publish("task", self.graph, tid, {"type": type_, "case": case_id,
                                                  "status": "todo"})
        return tid

    def claim(self, agent: str, types: list[str]) -> dict | None:
        rows = db.q(self.graph, CLAIM, {"agent": agent, "types": types})
        if not rows or rows[0]["assignee"] != agent:  # re-check winner after the write
            return None
        t = rows[0]
        t["payload"] = json.loads(t["payload"] or "{}")
        events.publish("task", self.graph, t["id"], {"type": t["type"], "case": t["case_id"],
                                                      "status": "claimed"}, agent=agent)
        return t

    def heartbeat(self, task_id: str, agent: str) -> bool:
        return bool(db.q(self.graph, HEARTBEAT, {"id": task_id, "agent": agent}))

    def done(self, task_id: str, result: str = "") -> None:
        db.q(self.graph, DONE, {"id": task_id, "result": result})
        events.publish("task", self.graph, task_id, {"status": "done"})

    def fail(self, task_id: str, error: str) -> None:
        db.q(self.graph, FAIL, {"id": task_id, "error": error[:500]})

    def reset_stale(self, stale_seconds: int) -> list[dict]:
        rows = db.q(self.graph, RESET_STALE, {"stale_ms": stale_seconds * 1000})
        for r in rows:
            events.publish("task", self.graph, r["id"], {"status": "reset", **r})
        return rows

    def pending(self, case_id: str) -> list[dict]:
        return db.ro(self.graph, PENDING_FOR_CASE, {"case": case_id})

    def stats(self) -> list[dict]:
        return db.ro(self.graph, STATS)


def wait(seconds: float) -> None:
    time.sleep(seconds)
