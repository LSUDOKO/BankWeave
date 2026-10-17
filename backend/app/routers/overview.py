"""Command Center: one call that summarises the whole system for the landing page."""
from __future__ import annotations

import time

from fastapi import APIRouter, Request

from app import db
from app.config import get_settings
from app.cypher import cy
from app.services import capacity

router = APIRouter(prefix="/overview", tags=["overview"])

ALERTS = cy("overview_alerts", "Alert counts by status", """
MATCH (al:Alert) RETURN al.status AS status, count(al) AS n
""")

CASE_CLAIMS = cy("overview_case_claims", "Claim support summary inside one case graph", """
MATCH (c:Claim)
RETURN count(c) AS claims,
       sum(CASE WHEN coalesce(c.independent_sources, 0) >= 2 AND c.state = 'active'
                THEN 1 ELSE 0 END) AS independent,
       sum(CASE WHEN c.state <> 'active' THEN 1 ELSE 0 END) AS flagged,
       sum(coalesce(c.paths, 0)) AS paths, sum(coalesce(c.independent_sources, 0)) AS origins
""")

CASE_EVIDENCE = cy("overview_case_evidence", "Evidence by validity state inside one case graph", """
MATCH (e:Evidence) RETURN e.state AS state, count(e) AS n
""")

CASE_HEAD = cy("overview_case_head", "Case header and pending actions inside one case graph", """
MATCH (k:Case)
OPTIONAL MATCH (a:Action {status:'proposed'})
OPTIONAL MATCH (s:SAR)
RETURN k.id AS id, k.title AS title, k.status AS status, k.opened_at AS opened_at,
       count(DISTINCT a) AS pending_actions, collect(DISTINCT s.status)[0] AS sar
""")


def _engine() -> dict:
    conn = db.get_db().connection
    try:
        mods = conn.execute_command("MODULE", "LIST")
        ver = next((m.get(b"ver") or m.get("ver") for m in mods
                    if (m.get(b"name") or m.get("name")) in (b"graph", "graph")), None)
    except Exception:  # noqa: BLE001  (managed instances may not allow MODULE LIST)
        ver = None
    if isinstance(ver, int):
        ver = f"{ver // 10000}.{ver // 100 % 100}.{ver % 100}"
    return {"version": ver, "memory": capacity.memory()}


@router.get("")
def overview(request: Request):
    t0 = time.perf_counter()
    alerts = {r["status"]: r["n"] for r in db.ro(db.CONSORTIUM, ALERTS)}
    cases, ev, totals = [], {}, {"claims": 0, "independent": 0, "flagged": 0, "paths": 0,
                                  "origins": 0}
    for g in db.case_graphs():
        try:
            head = db.ro(g, CASE_HEAD, timeout=3000)
            cl = db.ro(g, CASE_CLAIMS, timeout=3000)[0]
            for r in db.ro(g, CASE_EVIDENCE, timeout=3000):
                ev[r["state"]] = ev.get(r["state"], 0) + r["n"]
        except Exception:  # noqa: BLE001  (a case being written right now)
            continue
        if not head:
            continue
        for k in totals:
            totals[k] += cl.get(k) or 0
        cases.append({**head[0], **{k: cl.get(k) or 0 for k in ("claims", "independent",
                                                               "flagged")}})
    cases.sort(key=lambda c: c.get("opened_at") or 0, reverse=True)
    graphs = db.list_graphs()
    w = getattr(request.app.state, "worker", None)
    s = get_settings()
    return {
        "alerts": {"total": sum(alerts.values()), **alerts},
        "cases": {"total": len(cases), "open": sum(c["status"] != "closed" for c in cases),
                  "pending_actions": sum(c["pending_actions"] for c in cases),
                  "recent": cases[:8]},
        "claims": totals,
        "evidence": {"total": sum(ev.values()), "by_state": ev,
                     "awaiting_review": ev.get("needs_verification", 0)},
        "falkordb": {"region": s.falkordb_region, "graphs": len(graphs),
                     "case_graphs": len(cases), **_engine()},
        "agents": {"worker": bool(w), "llm": s.llm_enabled},
        "ms": round((time.perf_counter() - t0) * 1000, 1),
    }
