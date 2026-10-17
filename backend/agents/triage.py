"""Triage agent: clear an alert in seconds, or open a case (its own graph)."""
from __future__ import annotations

import json

from agents import llm, prompts, tools
from agents.tools import Ctx
from app import db, events
from app.cypher import cy
from detection.casegraph import copy_to_case
from detection.settings import cfg
from trust import store

CLEAR = cy("alert_clear", "Clear an alert with a reason (Decision node)", """
MATCH (al:Alert {id:$id})
SET al.status = 'cleared', al.reason_cleared = $reason, al.cleared_by = $by,
    al.decided_at = timestamp(), al.signals = $signals
CREATE (d:Decision {id:'D-' + $id, outcome:'cleared', reason:$reason, ts:timestamp(),
                    agent:$by})
CREATE (al)-[:DECIDED]->(d)
""")

OPEN_CASE_OF = cy("alert_existing_case", "Open case already covering an account", """
MATCH (a:Account {id:$id})<-[:CONCERNS]-(c:Case) WHERE c.status <> 'closed'
RETURN c.id AS id LIMIT 1
""")

MERGE_INTO = cy("alert_merge_into_case", "Attach an alert to an existing case", """
MATCH (al:Alert {id:$alert}), (c:Case {id:$case})
SET al.status = 'case', al.case_id = $case, al.reason_cleared = null
MERGE (c)-[:OPENED_FROM]->(al)
""")

CONCERNS = cy("case_concerns_accounts", "Link a case to the accounts it covers", """
MATCH (c:Case {id:$case})
UNWIND $ids AS aid
MATCH (a:Account {id:aid})
MERGE (c)-[:CONCERNS]->(a)
""")

ALERT = cy("alert_get", "Read one alert", """
MATCH (al:Alert {id:$id}) RETURN al.id AS id, al.account_id AS account, al.bank_id AS bank,
       al.rule AS rule, al.reason AS reason, al.status AS status
""")


def signals(account: str) -> dict:
    ctx = Ctx(agent="triage", record=False)
    comp = tools.call("find_islands", ctx, account_id=account)["result"] or {}
    motif = tools.call("motif_score", ctx, account_id=account)["result"] or {}
    xb = tools.call("cross_bank_links", ctx, account_id=account)["result"]
    shared = tools.call("shared_identity", ctx, account_id=account)["matches"]
    typ = tools.call("typology_patterns", ctx, account_id=account)["result"]
    prior = tools.call("recall_similar_cases", ctx, account_id=account)["result"]
    pt = db.ro(db.CONSORTIUM, "MATCH (a:Account {id:$id}) RETURN coalesce(a.passthrough_pairs,0) "
               "AS pt, a.community_size AS community", {"id": account})[0]
    small_shared = [s for s in shared if (s.get("shared") or 0) <= 5 and (s.get("units") or 1) <= 5]
    return {
        "component_size": comp.get("size", 1), "component_banks": comp.get("n_banks", 1),
        "motif_score": round(motif.get("score") or 0.0, 3),
        "cross_bank_counterparties": len(xb),
        "typologies": [k for k, v in typ.items() if v["found"]],
        "shared_identity_tight": len(small_shared),
        "shared_identity_broad": len(shared) - len(small_shared),
        "prior_cases": [p["case_id"] for p in prior], "passthrough_pairs": pt["pt"],
        "community_size": pt["community"],
        "_members": sorted({x["account"] for x in xb[:8]}
                           | {o for s in small_shared for o in s["others"]}),
        "_typology_detail": typ,
    }


def risk_score(s: dict) -> float:
    t = cfg()["triage"]
    if s["component_size"] < t["clear_if_component_size_below"]:
        return 0.0
    score = 0.0
    score += 1.0 * len([x for x in s["typologies"] if x != "rapid_passthrough"])
    score += 0.5 if "rapid_passthrough" in s["typologies"] else 0
    score += 1.0 if s["motif_score"] > t["case_if_motif_score_above"] else 0
    score += 0.5 if s["cross_bank_counterparties"] >= 3 else 0
    score += 1.0 if s["shared_identity_tight"] else 0
    score += 1.0 if s["prior_cases"] else 0
    score += 0.5 if s["passthrough_pairs"] >= cfg()["passthrough"]["min_pairs"] else 0
    return score


def decide(s: dict) -> dict:
    public = {k: v for k, v in s.items() if not k.startswith("_")}
    score = risk_score(s)
    out = llm.complete_json("writer", prompts.TRIAGE, json.dumps(public), 300, "triage")
    if isinstance(out, dict) and out.get("decision") in ("clear", "case"):
        return {"decision": out["decision"], "reason": str(out.get("reason", ""))[:240],
                "mode": "llm", "score": score}
    if score >= 2.0:
        why = ", ".join(s["typologies"]) or "structural signals"
        return {"decision": "case", "score": score, "mode": "deterministic",
                "reason": f"risk {score:.1f}: {why}; {s['cross_bank_counterparties']} cross-bank "
                          f"counterparties; motif {s['motif_score']}"}
    reason = ("isolated cluster" if s["component_size"] < 3 else
              f"no laundering motifs (risk {score:.1f})")
    if not s["cross_bank_counterparties"]:
        reason += ", no cross-bank links"
    return {"decision": "clear", "score": score, "mode": "deterministic", "reason": reason}


def run(alert_id: str) -> dict:
    al = db.ro(db.CONSORTIUM, ALERT, {"id": alert_id})
    if not al or al[0]["status"] != "open":
        return {"next": [], "skipped": True}
    al = al[0]
    existing = db.ro(db.CONSORTIUM, OPEN_CASE_OF, {"id": al["account"]})
    if existing:
        db.q(db.CONSORTIUM, MERGE_INTO, {"alert": alert_id, "case": existing[0]["id"]})
        events.publish("alert", db.CONSORTIUM, alert_id, {"status": "case",
                                                          "case": existing[0]["id"]})
        return {"next": [], "merged_into": existing[0]["id"]}
    s = signals(al["account"])
    d = decide(s)
    public = {k: v for k, v in s.items() if not k.startswith("_")}
    if d["decision"] == "clear":
        db.q(db.CONSORTIUM, CLEAR, {"id": alert_id, "reason": d["reason"], "by": "triage",
                                    "signals": json.dumps(public)})
        events.publish("alert", db.CONSORTIUM, alert_id,
                       {"status": "cleared", "reason": d["reason"], "mode": d["mode"]},
                       agent="triage")
        return {"next": [], "decision": d}
    members = sorted({al["account"], *s["_members"]})
    for name, r in s["_typology_detail"].items():
        for m in r.get("matches", [])[:2]:
            members += m.get("counterparties", [])[:10] + m.get("accounts", [])[:10]
    members = sorted(set(members))[:60]
    banks = sorted({r["bank"] for r in db.ro(db.CONSORTIUM, "MATCH (a:Account) WHERE a.id IN $ids"
                                             " RETURN DISTINCT a.bank_id AS bank",
                                             {"ids": members})})
    cid = store.open_case(alert_id, al["account"], banks,
                          f"{al['rule']} on {al['account'][:6]} ({len(banks)} banks)")
    db.q(db.CONSORTIUM, CONCERNS, {"case": cid, "ids": members})
    copy_to_case(db.CONSORTIUM, members, db.case_graph(cid))
    store.log_event(cid, "triage", "open_case", {"alert": alert_id, "decision": d,
                                                 "signals": public, "members": members})
    return {"next": [("investigate", cid, 0)], "decision": d, "case_id": cid}
