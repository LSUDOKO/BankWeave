"""Procedural memory: investigation strategies that worked, reused on similar cases.

(:Procedure {typology, success_count, fail_count, learned_from})-[:STEP {order}]->(:Step)
(:Step)-[:FAILED_BEFORE]->(:Pitfall)  lives in its own `procedures` graph.
"""
from __future__ import annotations

import json
import uuid

from app import db
from app.cypher import cy

G = db.PROCEDURES

UPSERT = cy("procedure_upsert", "Save or reinforce a successful tool sequence", """
MERGE (p:Procedure {signature:$sig})
ON CREATE SET p.id = $id, p.name = $name, p.typology = $typology, p.success_count = 0,
              p.fail_count = 0, p.learned_from = [], p.created_at = timestamp()
SET p.success_count = p.success_count + CASE WHEN $ok THEN 1 ELSE 0 END,
    p.fail_count = p.fail_count + CASE WHEN $ok THEN 0 ELSE 1 END,
    p.learned_from = p.learned_from + [$case], p.updated_at = timestamp()
WITH p
OPTIONAL MATCH (p)-[:STEP]->(old:Step)
WITH p, count(old) AS n
FOREACH (s IN CASE WHEN n = 0 THEN $steps ELSE [] END |
  CREATE (p)-[:STEP {order:s.order}]->(:Step {tool:s.tool, params_template:s.params, why:s.why}))
RETURN p.id AS id, p.success_count AS success, p.fail_count AS fail
""")

BEST = cy("procedure_best", "Best procedure for a typology guess", """
MATCH (p:Procedure) WHERE p.typology = $typology OR $typology IS NULL
WITH p ORDER BY p.success_count - p.fail_count DESC, p.success_count DESC LIMIT 1
MATCH (p)-[r:STEP]->(s:Step)
OPTIONAL MATCH (s)-[:FAILED_BEFORE]->(x:Pitfall)
RETURN p.id AS id, p.name AS name, p.typology AS typology, p.success_count AS success,
       p.learned_from AS learned_from,
       collect({order:r.order, tool:s.tool, params:s.params_template, why:s.why,
                pitfall:x.note}) AS steps
""")

PITFALL = cy("procedure_pitfall", "Record a pitfall on a procedure step", """
MATCH (p:Procedure {id:$pid})-[:STEP]->(s:Step {tool:$tool})
CREATE (s)-[:FAILED_BEFORE]->(:Pitfall {note:$note, ts:timestamp()})
""")

LIST = cy("procedure_list", "All procedures", """
MATCH (p:Procedure) RETURN p.id AS id, p.name AS name, p.typology AS typology,
       p.success_count AS success, p.fail_count AS fail, p.learned_from AS learned_from
ORDER BY success DESC
""")


def save(case_id: str, typology: str, steps: list[dict], ok: bool) -> dict:
    sig = typology + ":" + ">".join(s["tool"] for s in steps)
    rows = [{"order": i, "tool": s["tool"], "params": json.dumps(s.get("params", {})),
             "why": s.get("why", "")} for i, s in enumerate(steps)]
    return db.q(G, UPSERT, {"sig": sig, "id": f"P-{uuid.uuid4().hex[:6]}",
                            "name": f"{typology} via {len(steps)} steps", "typology": typology,
                            "ok": ok, "case": case_id, "steps": rows})[0]


def best(typology: str | None) -> dict | None:
    rows = db.ro(G, BEST, {"typology": typology}) if G in db.list_graphs() else []
    if not rows or not rows[0]["id"]:
        return None
    r = rows[0]
    r["steps"] = sorted(r["steps"], key=lambda s: s["order"])
    for s in r["steps"]:
        s["params"] = json.loads(s["params"] or "{}")
    return r


def add_pitfall(procedure_id: str, tool: str, note: str) -> None:
    db.q(G, PITFALL, {"pid": procedure_id, "tool": tool, "note": note})


def list_all() -> list[dict]:
    return db.ro(G, LIST) if G in db.list_graphs() else []
