"""Memory guard for small FalkorDB instances.

FalkorDB Cloud's free tier has a 100 MB `maxmemory` with `noeviction`: once it is full every
write fails with OOM. Case graphs are the only thing that grows, so when used memory passes
the high-water mark the oldest unpinned cases are dropped (graph plus consortium mirror).
"""
from __future__ import annotations

from app import db
from app.config import get_settings

HIGH = 0.85
TARGET = 0.75


def memory() -> dict:
    info = db.get_db().connection.info("memory")
    used = int(info.get("used_memory", 0))
    cap = int(info.get("maxmemory", 0))
    return {"used_mb": round(used / 2**20, 1), "max_mb": round(cap / 2**20, 1) if cap else None,
            "pct": round(used / cap, 3) if cap else None,
            "policy": info.get("maxmemory_policy")}


def _opened_at(graph_name: str) -> int:
    try:
        rows = db.ro(graph_name, "MATCH (c:Case) RETURN c.opened_at AS t LIMIT 1", timeout=2000)
        return int(rows[0]["t"] or 0) if rows else 0
    except Exception:  # noqa: BLE001
        return 0


def drop_case(case_id: str) -> None:
    db.drop_graph(db.case_graph(case_id))
    db.q(db.CONSORTIUM, "MATCH (k:Case {id:$id}) OPTIONAL MATCH (k)-[:HAS_CLAIM]->(c:Claim) "
                        "DETACH DELETE k, c", {"id": case_id})
    db.q(db.CONSORTIUM, "MATCH (l:CaseLock {case_id:$id}) DELETE l", {"id": case_id})


def prune(high: float = HIGH, target: float = TARGET) -> dict:
    """Drop the oldest unpinned case graphs while memory is above `high`, down to `target`."""
    m = memory()
    if m["pct"] is None or m["pct"] < high:
        return {"pruned": [], "memory": m}
    pinned = {c.strip() for c in get_settings().pinned_cases.split(",") if c.strip()}
    cases = sorted((g for g in db.case_graphs() if db.case_id_of(g) not in pinned),
                   key=_opened_at)
    pruned = []
    for g in cases:
        if memory()["pct"] < target:
            break
        drop_case(db.case_id_of(g))
        pruned.append(db.case_id_of(g))
    return {"pruned": pruned, "memory": memory()}
