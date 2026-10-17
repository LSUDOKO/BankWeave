"""Echo-proof confidence (GraphEcho, arXiv 2609.17695).

Many graph paths can lead to the same evidential origin. Counting paths inflates belief.
Confidence here is computed over DISTINCT origins (strongest item per origin), minus
distinct challenging origins, and evidence is handed to LLMs grouped by origin.
"""
from __future__ import annotations

import json
import math

from app import db, events
from app.cypher import cy

KIND_WEIGHT = {"typology_match": 1.0, "path": 1.0, "passthrough": 1.0, "algo_score": 0.6,
               "shared_attr": 0.8, "kyc_fact": 0.7, "behavior_similarity": 0.4, "doc": 0.3,
               "txnset": 0.8}
SCALE = 0.5  # one strong independent source -> 0.39, three -> 0.78
ORIGIN_KINDS = ["path", "typology_match", "algo_score", "shared_attr", "kyc_fact",
                "passthrough", "behavior_similarity", "doc"]

SUPPORTS = cy("echo_supports", "Supporting evidence of a claim (active or pending check)", """
MATCH (c:Claim {id:$id})-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.state IN ['active', 'needs_verification']
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.payload AS payload,
       e.summary AS summary, e.state AS state
""")

CHALLENGES = cy("echo_challenges", "Active challenging evidence of a claim", """
MATCH (c:Claim {id:$id})-[:CHALLENGED_BY]->(e:Evidence)
WHERE e.state = 'active'
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.payload AS payload,
       e.summary AS summary
""")

COUNTS = cy("echo_independent_sources", "Paths vs independent sources for a claim", """
MATCH (c:Claim {id:$id})-[:SUPPORTED_BY]->(e:Evidence)
WHERE e.state IN ['active', 'needs_verification']
RETURN count(e) AS paths, count(DISTINCT e.origin) AS independent_sources,
       collect(DISTINCT e.kind) AS kinds
""")

STORE = cy("echo_store_confidence", "Store echo-proof confidence on a claim", """
MATCH (c:Claim {id:$id})
SET c.confidence = $confidence, c.naive_confidence = $naive, c.paths = $paths,
    c.independent_sources = $sources, c.independent_challenges = $challenges
""")

CLAIMS = cy("echo_case_claims", "All claims in a case", """
MATCH (c:Claim) RETURN c.id AS id
""")


def _weight(ev: dict) -> float:
    w = KIND_WEIGHT.get(ev["kind"], 0.5)
    if ev["kind"] == "shared_attr":  # a 200-unit building address is weak evidence
        try:
            shared = json.loads(ev.get("payload") or "{}").get("shared", 1) or 1
            units = json.loads(ev.get("payload") or "{}").get("units", 1) or 1
        except (TypeError, ValueError):
            shared, units = 1, 1
        w = w / (1 + math.log(max(shared, units)))
    if ev.get("state") == "needs_verification":
        w *= 0.5
    return w


def group_by_origin(items: list[dict]) -> list[dict]:
    groups: dict[str, dict] = {}
    for ev in items:
        g = groups.setdefault(ev["origin"], {"origin": ev["origin"], "kind": ev["kind"],
                                            "multiplicity": 0, "evidence_ids": [],
                                            "summary": ev.get("summary"), "weight": 0.0})
        g["multiplicity"] += 1
        g["evidence_ids"].append(ev["id"])
        g["weight"] = max(g["weight"], _weight(ev))
    return sorted(groups.values(), key=lambda g: -g["weight"])


def score(supports: list[dict], challenges: list[dict]) -> dict:
    sup = group_by_origin(supports)
    chal = group_by_origin(challenges)
    s = sum(g["weight"] for g in sup)
    c = sum(g["weight"] for g in chal)
    naive = 1 - math.exp(-SCALE * sum(_weight(e) for e in supports))
    return {"confidence": round(1 - math.exp(-SCALE * (s - c)) if s > c else 0.0, 3),
            "naive_confidence": round(naive, 3), "paths": len(supports),
            "independent_sources": len(sup), "independent_challenges": len(chal),
            "groups": sup, "challenge_groups": chal,
            "kinds_explored": sorted({g["kind"] for g in sup}),
            "kinds_unexplored": [k for k in ORIGIN_KINDS if k not in {g["kind"] for g in sup}]}


def echo_check(case_id: str, claim_id: str) -> dict:
    g = db.case_graph(case_id)
    res = score(db.ro(g, SUPPORTS, {"id": claim_id}), db.ro(g, CHALLENGES, {"id": claim_id}))
    db.q(g, STORE, {"id": claim_id, "confidence": res["confidence"],
                    "naive": res["naive_confidence"], "paths": res["paths"],
                    "sources": res["independent_sources"],
                    "challenges": res["independent_challenges"]})
    events.publish("state_change", g, claim_id,
                   {"confidence": res["confidence"], "naive": res["naive_confidence"],
                    "paths": res["paths"], "sources": res["independent_sources"]})
    res["cypher"] = COUNTS
    res["nudge"] = (f"independent sources: {res['independent_sources']} from "
                    f"{len(res['kinds_explored'])} of {len(ORIGIN_KINDS)} origin kinds; "
                    f"unexplored: {', '.join(res['kinds_unexplored'][:4])}")
    return res


def recompute_case(case_id: str) -> list[dict]:
    g = db.case_graph(case_id)
    return [{"claim": r["id"], **{k: v for k, v in echo_check(case_id, r["id"]).items()
                                  if k in ("confidence", "paths", "independent_sources")}}
            for r in db.ro(g, CLAIMS)]
