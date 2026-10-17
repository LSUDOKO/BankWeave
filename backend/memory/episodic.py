"""Episodic memory: the Event timeline of a case, and resume-from-graph summaries."""
from __future__ import annotations

import json

from app import db
from app.cypher import cy

TIMELINE = cy("episodic_timeline", "Case timeline in order (follows NEXT)", """
MATCH (c:Case)-[:HAD_EVENT]->(e:Event)
RETURN e.id AS id, e.ts AS ts, e.agent AS agent, e.action AS action, e.payload AS payload,
       e.cypher AS cypher
ORDER BY e.ts, e.id
""")

STATE = cy("episodic_resume_state", "What a resuming agent needs to know about a case", """
MATCH (c:Case)
OPTIONAL MATCH (cl:Claim)
WITH c, collect(cl) AS claims
OPTIONAL MATCH (e:Evidence)
WITH c, claims, collect(e) AS evs
OPTIONAL MATCH (x:Claim)-[:CHALLENGED_BY]->(:Evidence {state:'active'})
WITH c, claims, evs, count(DISTINCT x) AS challenged
OPTIONAL MATCH (s:SAR)
RETURN c.id AS id, c.status AS status, c.title AS title, size(claims) AS claims,
       size(evs) AS evidence, challenged, count(s) AS sars,
       [cl IN claims | cl.text][0..5] AS claim_texts
""")


def timeline(case_id: str, limit: int = 500) -> list[dict]:
    rows = db.ro(db.case_graph(case_id), TIMELINE)[-limit:]
    for r in rows:
        try:
            r["payload"] = json.loads(r["payload"] or "{}")
        except ValueError:
            pass
    return rows


def resume_summary(case_id: str, pending: list[dict]) -> dict:
    st = db.ro(db.case_graph(case_id), STATE)[0]
    last = timeline(case_id)[-3:]
    nxt = pending[0]["type"] if pending else "none"
    text = (f"Resuming case {case_id} from the graph: {st['claims']} claim(s), "
            f"{st['evidence']} evidence item(s), {st['challenged']} open challenge(s), "
            f"{st['sars']} SAR draft(s). Last step: "
            f"{last[-1]['agent'] + ' ' + last[-1]['action'] if last else 'none'}. "
            f"Next step: {nxt}.")
    return {"text": text, "state": st, "last_events": last, "pending": pending}
