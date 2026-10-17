"""Golden scenarios, computed live from the graphs (and captured as snapshots for replay).

A. An innocent alert cleared by algo.wcc: the account sits in a tiny isolated component.
B. A multi-bank ring: what each bank holds alone vs what the consortium graph holds.
C. A shared building address (and device) behind a claim: the Skeptic's innocent
   explanation and the validity cascade a KYC update would trigger.
"""
from __future__ import annotations

import json
import time

from fastapi import APIRouter

from app import db
from app.config import ROOT
from app.cypher import cy
from app.routers import network, workspace
from detection import algorithms as A

router = APIRouter(prefix="/scenarios", tags=["scenarios"])

CLEARED = cy("scenario_cleared_isolated", "Alerts the triage agent cleared as isolated", """
MATCH (al:Alert {status:'cleared'})-[:RAISED_FOR]->(a:Account)
WHERE al.reason_cleared STARTS WITH 'isolated cluster'
RETURN al.id AS id, al.rule AS rule, al.reason AS reason, al.reason_cleared AS cleared,
       al.signals AS signals, a.id AS account, a.bank_id AS bank,
       coalesce(a.component_size, 0) AS component_size
ORDER BY component_size DESC, id LIMIT 1
""")

RING_CASE = cy("scenario_ring_case", "The case spanning the most banks", """
MATCH (c:Case)-[:CONCERNS]->(a:Account)
WITH c, collect(DISTINCT a.bank_id) AS banks, collect(DISTINCT a.id) AS ids
WHERE size(banks) >= 3
RETURN c.id AS id, c.title AS title, banks, ids
ORDER BY size(banks) DESC, size(ids) DESC LIMIT 1
""")

BANK_HOLDS = cy("scenario_bank_holds", "Ring accounts a bank holds and transfers it can see", """
OPTIONAL MATCH (a:Account) WHERE a.id IN $ids
WITH count(a) AS own
OPTIONAL MATCH (s)-[t:TRANSFERS]->(d) WHERE s.id IN $ids AND d.id IN $ids
RETURN own, count(DISTINCT [s.id, d.id]) AS links
""")

CONS_LINKS = cy("scenario_consortium_links", "Ring account pairs linked in the consortium", """
MATCH (s:Account)-[:FLOWS]->(d:Account) WHERE s.id IN $ids AND d.id IN $ids
RETURN count(*) AS links
""")

SHARED_CASE = cy("scenario_shared_attr_evidence", "Shared-attribute evidence in one case", """
MATCH (e:Evidence {kind:'shared_attr'})
OPTIONAL MATCH (c:Claim)-[r:SUPPORTED_BY|CHALLENGED_BY]->(e)
RETURN e.id AS id, e.origin AS origin, e.summary AS summary, e.state AS state,
       collect(DISTINCT {claim:c.id, text:c.text, rel:type(r), confidence:c.confidence}) AS claims
""")

REACH = cy("scenario_cascade_reach", "What rests on an evidence item (read-only preview)", """
MATCH (e:Evidence {id:$id})
OPTIONAL MATCH (c:Claim)-[:SUPPORTED_BY|CHALLENGED_BY]->(e)
OPTIONAL MATCH (d:Claim)-[:DERIVED_FROM*1..3]->(c)
OPTIONAL MATCH (x:Action)-[:JUSTIFIED_BY]->(c)
OPTIONAL MATCH (s:Sentence)-[:CITES]->(e)
RETURN collect(DISTINCT c.id) AS claims, collect(DISTINCT d.id) AS derived,
       collect(DISTINCT x.id) AS actions, collect(DISTINCT s.id) AS sentences
""")


def _timed(graph, cypher, params=None):
    t = time.perf_counter()
    rows = db.ro(graph, cypher, params or {}, timeout=10000)
    return rows, round((time.perf_counter() - t) * 1000, 2)


def scenario_a() -> dict | None:
    rows, _ = _timed(db.CONSORTIUM, CLEARED)
    if not rows:
        return None
    al = rows[0]
    wcc, ms = _timed(db.CONSORTIUM, A.WCC_OF, {"id": al["account"]})
    try:
        al["signals"] = json.loads(al["signals"] or "{}")
    except ValueError:
        pass
    return {"alert": al, "wcc": wcc[0] if wcc else None, "wcc_ms": ms, "cypher": [CLEARED, A.WCC_OF]}


def scenario_b() -> dict | None:
    rows, _ = _timed(db.CONSORTIUM, RING_CASE)
    if not rows:
        return None
    case = rows[0]
    ids = case["ids"]
    banks = []
    for b in sorted(case["banks"]):
        g = db.bank_graph(b)
        if g not in db.list_graphs():
            continue
        r, ms = _timed(g, BANK_HOLDS, {"ids": ids})
        banks.append({"bank": b, "holds": r[0]["own"], "links": r[0]["links"],
                      "holds_pct": round(100 * r[0]["own"] / len(ids), 1), "ms": ms})
    cons, cms = _timed(db.CONSORTIUM, CONS_LINKS, {"ids": ids})
    best = max(banks, key=lambda x: x["holds"]) if banks else None
    views = {"consortium": network.network("consortium", case["id"])}
    if best:
        views["bank"] = network.network(f"bank_{best['bank']}", case["id"])
    e2 = None
    f = ROOT / "eval" / "results" / "E2_consortium_vs_single_bank.json"
    if f.exists():
        r = json.loads(f.read_text())
        e2 = {"dataset": r["dataset"], **{k: v for k, v in r["results"].items()
                                          if k != "per_attempt"}}
    return {"case": {k: case[k] for k in ("id", "title", "banks")}, "accounts": len(ids),
            "banks": banks, "best_bank": best, "consortium_links": cons[0]["links"],
            "consortium_ms": cms, "views": views, "e2": e2,
            "cypher": [RING_CASE, BANK_HOLDS, CONS_LINKS]}


def scenario_c() -> dict | None:
    best = None
    for g in db.case_graphs():
        ev = db.ro(g, SHARED_CASE)
        building = [e for e in ev if e["origin"] == "attr:A-77"]
        if not building:
            continue
        score = len(building) * 10 + len(ev)
        if not best or score > best[0]:
            best = (score, g, ev)
    if not best:
        return None
    _, g, ev = best
    cid = db.case_id_of(g)
    for e in ev:
        e["claims"] = [c for c in e["claims"] if c.get("claim")]
        e["reach"] = db.ro(g, REACH, {"id": e["id"]})[0]
    dag = workspace.dag(cid)
    return {"case_id": cid, "title": db.ro(g, "MATCH (k:Case) RETURN k.title AS t")[0]["t"],
            "evidence": ev, "building": "A-77", "dag": {"nodes": dag["nodes"], "edges": dag["edges"]},
            "independence": workspace.independence(cid), "cypher": [SHARED_CASE, REACH]}


@router.get("")
def scenarios():
    t = time.perf_counter()
    out = {"A": scenario_a(), "B": scenario_b(), "C": scenario_c()}
    out["ms"] = round((time.perf_counter() - t) * 1000, 1)
    return out
