"""Archivist agent: turns a decided case into memory.

Saves the tool sequence that worked as a procedure (procedural memory) and closes the case.
Cross-case recall needs no extra work: claim summaries are mirrored into the consortium.
"""
from __future__ import annotations

import re

from app import db
from app.cypher import cy
from memory import episodic, procedural
from trust import store

ACTIONS = cy("archivist_actions", "Decided actions of a case", """
MATCH (a:Action) RETURN a.kind AS kind, a.status AS status
""")

TYPOLOGIES = cy("archivist_typologies", "Typologies matched in a case", """
MATCH (e:Evidence {kind:'typology_match'}) WHERE e.state = 'active'
RETURN DISTINCT split(e.origin, ':')[1] AS typology
""")


_ACCT = re.compile(r"^[0-9a-f]{16}$")


def _template(params: dict, seed: str) -> dict:
    """Generalise a tool call: the seed account -> $seed, any other account -> $hub."""
    def one(v):
        if isinstance(v, str) and _ACCT.match(v):
            return "$seed" if v == seed else "$hub"
        return v
    return {k: ([one(x) for x in v] if isinstance(v, list) else one(v)) for k, v in params.items()}


def run(case_id: str, round_: int = 0) -> dict:
    g = db.case_graph(case_id)
    acts = db.ro(g, ACTIONS)
    approved = any(a["status"] == "approved" and a["kind"] in ("file_sar", "freeze_rec")
                   for a in acts)
    rejected = any(a["status"] == "rejected" for a in acts)
    steps = []
    for e in episodic.timeline(case_id):
        if e["agent"] == "investigator" and e["action"].startswith("tool:"):
            p = e["payload"].get("params", {}) if isinstance(e["payload"], dict) else {}
            seed = db.ro(g, "MATCH (c:Case) RETURN c.seed_account AS s")[0]["s"]
            steps.append({"tool": e["action"][5:], "params": _template(p, seed)})
    typs = [r["typology"] for r in db.ro(g, TYPOLOGIES)]
    saved = None
    if steps and (approved or rejected):
        dedup, seen = [], set()
        for s in steps:
            key = (s["tool"], str(sorted(s["params"].items())))
            if key not in seen:
                seen.add(key)
                dedup.append(s)
        saved = procedural.save(case_id, typs[0] if typs else "general", dedup[:12], approved)
    store.set_status(case_id, "closed")
    store.log_event(case_id, "archivist", "archived",
                    {"approved": approved, "procedure": saved, "typologies": typs})
    return {"next": [], "procedure": saved}
