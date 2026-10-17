"""Orchestrator: turns open alerts into triage tasks and keeps the blackboard healthy."""
from __future__ import annotations

from agents.blackboard import Blackboard
from app import db
from app.config import get_settings
from app.cypher import cy

UNTASKED = cy("orchestrator_untasked_alerts", "Open alerts that have no triage task yet", """
MATCH (al:Alert {status:'open'}) WHERE al.tasked IS NULL
WITH al ORDER BY al.ts LIMIT $limit
SET al.tasked = timestamp()
RETURN al.id AS id
""")


def tick(bb: Blackboard, batch: int = 20) -> dict:
    reset = bb.reset_stale(get_settings().task_stale_seconds)
    created = [bb.create("triage", alert_id=r["id"])
               for r in db.q(db.CONSORTIUM, UNTASKED, {"limit": batch})]
    return {"reset": reset, "created": len(created)}
