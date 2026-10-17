"""Triage agent: clear an alert in seconds, or open a case (its own graph)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

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


RULE_LABEL = {"large_transfer": "Large transfer", "near_threshold_burst": "Near-threshold burst",
              "new_counterparty_big": "Large payment to a new counterparty",
              "high_risk_format": "Cash or crypto transfer"}


HUB = cy("triage_hub_profile", "Precomputed profile for a high-volume account", """
MATCH (a:Account {id:$id})
OPTIONAL MATCH (a)-[f:FLOWS]-(b:Account) WHERE b.bank_id <> a.bank_id
RETURN a.in_deg + a.out_deg AS degree, a.component_size AS component,
       coalesce(a.motif_score, 0.0) AS motif, coalesce(a.passthrough_pairs, 0) AS pt,
       a.community_size AS community, count(DISTINCT b) AS cross_bank
""")


def _safe(fn, default):
    try:
        return fn()
    except Exception:  # noqa: BLE001 - one slow or failing signal must not fail the alert
        return default


def signals(account: str) -> dict:
    ctx = Ctx(agent="triage", record=False)
    prof = db.ro(db.CONSORTIUM, HUB, {"id": account})[0]
    hub_deg = cfg()["triage"].get("hub_degree", 2000)
    if (prof["degree"] or 0) > hub_deg:
        # high-volume (clearing / processor-like) account: per-transfer typology scans are
        # skipped; triage uses the precomputed graph profile instead
        return {"component_size": prof["component"] or 1, "component_banks": 0,
                "motif_score": round(prof["motif"], 3),
                "cross_bank_counterparties": prof["cross_bank"], "typologies": [],
                "shared_identity_tight": 0, "shared_identity_broad": 0, "prior_cases": [],
                "passthrough_pairs": prof["pt"], "community_size": prof["community"],
                "high_volume_account": prof["degree"], "_members": [], "_typology_detail": {}}
    comp = {"size": prof["component"], "n_banks": 0} if prof["component"] is not None else \
        (_safe(lambda: tools.call("find_islands", ctx, account_id=account)["result"], None) or {})
    motif = _safe(lambda: tools.call("motif_score", ctx, account_id=account)["result"], None) or {}
    xb = _safe(lambda: tools.call("cross_bank_links", ctx, account_id=account)["result"], [])
    shared = _safe(lambda: tools.call("shared_identity", ctx, account_id=account)["matches"], [])
    typ = _safe(lambda: tools.call("typology_patterns", ctx, account_id=account)["result"], {})
    prior = _safe(lambda: tools.call("recall_similar_cases", ctx, account_id=account)["result"], [])
    small_shared = [s for s in shared if (s.get("shared") or 0) <= 5 and (s.get("units") or 1) <= 5]
    return {
        "component_size": comp.get("size", 1), "component_banks": comp.get("n_banks", 1),
        "motif_score": round(motif.get("score") or 0.0, 3),
        "cross_bank_counterparties": len(xb),
        "typologies": [k for k, v in typ.items() if v["found"]],
        "shared_identity_tight": len(small_shared),
        "shared_identity_broad": len(shared) - len(small_shared),
        "prior_cases": [p["case_id"] for p in prior], "passthrough_pairs": prof["pt"],
        "community_size": prof["community"],
        "_members": sorted({x["account"] for x in xb[:8]}
                           | {o for s in small_shared for o in s["others"]}),
        "_typology_detail": typ,
    }


PROFILE = cy("triage_feature_profile", "Graph features of an account for the triage model", """
MATCH (a:Account {id:$id})
RETURN a.in_deg AS in_deg, a.out_deg AS out_deg, coalesce(a.pagerank, 0.0) AS pagerank,
       coalesce(a.motif_cycle3, 0) AS cycle3, coalesce(a.motif_recip, 0) AS recip,
       coalesce(a.motif_relay, 0) AS relay, coalesce(a.motif_fanin, 0) AS fanin,
       coalesce(a.motif_fanout, 0) AS fanout, coalesce(a.motif_leaf, 0) AS leaf,
       a.behavior_vec AS vec
""")
TYPOLOGY_KEYS = ["circular_flow", "fan_out", "fan_in", "structuring", "rapid_passthrough"]
WEIGHTS_FILE = Path(__file__).resolve().parents[1] / "detection" / "triage_weights.json"


def features(account: str, s: dict) -> dict[str, float]:
    """Numeric graph features for the calibrated triage model (no labels involved here)."""
    import math
    p = db.ro(db.CONSORTIUM, PROFILE, {"id": account})[0]
    f = {
        "log_component": math.log1p(s["component_size"] or 1),
        "motif": s["motif_score"], "log_cross_bank": math.log1p(s["cross_bank_counterparties"]),
        "shared_tight": float(s["shared_identity_tight"]),
        "shared_broad": float(s["shared_identity_broad"]),
        "log_passthrough": math.log1p(s["passthrough_pairs"] or 0),
        "log_community": math.log1p(s["community_size"] or 1),
        "prior_cases": float(len(s["prior_cases"])),
        "pagerank_e4": (p["pagerank"] or 0) * 1e4,
        "log_in": math.log1p(p["in_deg"] or 0), "log_out": math.log1p(p["out_deg"] or 0),
        **{f"log_{k}": math.log1p(p[k] or 0) for k in ("cycle3", "recip", "relay", "fanin",
                                                       "fanout", "leaf")},
        **{f"typ_{k}": float(k in s["typologies"]) for k in TYPOLOGY_KEYS},
    }
    vec = list(p["vec"] or [0.0] * 16)
    f.update({f"beh_{i}": float(v) for i, v in enumerate(vec)})
    return f


@lru_cache
def _weights() -> dict | None:
    if WEIGHTS_FILE.exists():
        return json.loads(WEIGHTS_FILE.read_text())
    return None


def model_probability(f: dict[str, float]) -> float | None:
    """Logistic model calibrated on the dev split by eval/e1_alert_triage.py."""
    import math
    w = _weights()
    if not w:
        return None
    z = w["bias"] + sum(w["coef"].get(k, 0.0) * (v - w["mean"].get(k, 0.0)) / w["std"].get(k, 1.0)
                        for k, v in f.items())
    return 1 / (1 + math.exp(-max(-30, min(30, z))))


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


def decide(s: dict, f: dict[str, float] | None = None) -> dict:
    public = {k: v for k, v in s.items() if not k.startswith("_")}
    w = _weights()
    prob = model_probability(f) if (f is not None and w) else None
    if prob is not None:
        thr = w["threshold"]
        score, lo, hi = prob, thr * 0.5, thr * 1.5
        public["model_probability"] = round(prob, 4)
    else:
        score = risk_score(s)
        lo, hi = cfg()["triage"].get("llm_band", [1.0, 3.0])
        thr = 2.0
    # the graph score is decisive at the extremes; the LLM judges only the ambiguous band
    out = (llm.complete_json("writer", prompts.TRIAGE, json.dumps(public), 300, "triage")
           if lo <= score < hi else None)
    if isinstance(out, dict) and out.get("decision") in ("clear", "case"):
        return {"decision": out["decision"], "reason": str(out.get("reason", ""))[:240],
                "mode": "llm", "score": score}
    why = ", ".join(s["typologies"]) or "structural signals"
    basis = (f"model {prob:.2f} (threshold {thr:.2f})" if prob is not None
             else f"risk {score:.1f}")
    if score >= thr:
        return {"decision": "case", "score": score, "mode": "graph",
                "reason": f"{basis}: {why}; {s['cross_bank_counterparties']} cross-bank "
                          f"counterparties; motif {s['motif_score']}"}
    reason = ("isolated cluster" if (s["component_size"] or 1) < 3 else
              f"no strong laundering structure ({basis})")
    if not s["cross_bank_counterparties"]:
        reason += ", no cross-bank links"
    return {"decision": "clear", "score": score, "mode": "graph", "reason": reason}


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
    d = decide(s, features(al["account"], s))
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
                          f"{RULE_LABEL.get(al['rule'], al['rule'])} by {al['account'][:6]}, "
                          f"{len(members)} accounts across {len(banks)} banks")
    db.q(db.CONSORTIUM, CONCERNS, {"case": cid, "ids": members})
    copy_to_case(db.CONSORTIUM, members, db.case_graph(cid))
    store.log_event(cid, "triage", "open_case", {"alert": alert_id, "decision": d,
                                                 "signals": public, "members": members})
    return {"next": [("investigate", cid, 0)], "decision": d, "case_id": cid}
