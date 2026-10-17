"""Skeptic agent: argue the innocent explanation, with evidence.

Gathers KYC facts (Postgres) and attribute-sharing context, attaches CHALLENGED_BY evidence
to claims it can explain innocently, optionally writes an `innocent` claim, then recomputes
echo-proof confidence. Bounded debate: at most 2 Investigator <-> Skeptic rounds.
"""
from __future__ import annotations

import json

from agents import llm, prompts, tools
from agents.tools import Ctx
from app import db
from app.cypher import cy
from trust import echo, store

MAX_ROUNDS = 2
CASH_INTENSIVE = {"Restaurant owner", "Import/Export", "Self-employed"}

CLAIMS_WITH_SUPPORT = cy("skeptic_claims_support", "Claims with their supporting evidence", """
MATCH (c:Claim) WHERE c.kind <> 'innocent' AND c.state <> 'superseded'
OPTIONAL MATCH (c)-[:SUPPORTED_BY]->(e:Evidence)
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.about AS about,
       collect({id:e.id, kind:e.kind, origin:e.origin, payload:e.payload,
                summary:e.summary}) AS support
""")


def _ctx(case_id: str) -> Ctx:
    return Ctx(graph=db.CONSORTIUM, case_id=case_id, agent="skeptic")


def gather(case_id: str, claims: list[dict]) -> dict:
    """Collect innocent-explanation facts as evidence (KYC + attribute context)."""
    ctx = _ctx(case_id)
    facts: dict[str, list[dict]] = {}
    for c in claims:
        out = []
        for e in c["support"]:
            if e.get("kind") != "shared_attr":
                continue
            p = json.loads(e.get("payload") or "{}")
            if p.get("kind") == "Address" or str(p.get("attr", "")).startswith(("A", "AD")):
                r = tools.call("address_occupancy", ctx, address_id=p.get("attr"))
                for row in r["result"]:
                    if row.get("units", 1) > 5 or row.get("registered_customers", 1) > 5:
                        out.append({"evidence": r["evidence_ids"], "why": "broad_address",
                                    "detail": row, "challenges": e["id"]})
            elif (p.get("shared") or 0) > 5:
                out.append({"evidence": [], "why": "broad_attr", "detail": p,
                            "challenges": e["id"]})
        for acct in (c.get("about") or [])[:3]:
            r = tools.call("kyc_lookup", ctx, account_id=acct)
            for row, eid in zip(r["result"], r["evidence_ids"]):
                if row.get("occupation") in CASH_INTENSIVE and c["kind"] in ("hub", "structuring"):
                    out.append({"evidence": [eid], "why": "cash_business", "detail": row})
        facts[c["id"]] = out
    return facts


def deterministic(case_id: str, claims: list[dict], facts: dict) -> dict:
    objections, innocent_ev = [], []
    for c in claims:
        for f in facts.get(c["id"], []):
            for eid in f["evidence"]:
                store.challenge(case_id, c["id"], eid)
                innocent_ev.append(eid)
                why = {"broad_address": "the shared address is a large residential building",
                       "cash_business": "the account holder runs a cash-intensive business",
                       "broad_attr": "the shared attribute is common to many customers"}[f["why"]]
                objections.append({"claim_id": c["id"], "text": f"Innocent explanation: {why}.",
                                   "evidence_ids": [eid]})
    innocent = None
    if innocent_ev:
        about = sorted({a for c in claims for a in (c.get("about") or [])})[:10]
        innocent = store.add_claim(case_id, "Part of the activity has a plausible innocent "
                                            "explanation (shared residential building / cash "
                                            "business) and needs analyst review",
                                   "innocent", sorted(set(innocent_ev)), "skeptic", about)
    return {"objections": objections, "innocent_claim": innocent, "mode": "deterministic"}


def with_llm(case_id: str, claims: list[dict], facts: dict) -> dict | None:
    if not llm.enabled():
        return None
    allowed = sorted({e for fs in facts.values() for f in fs for e in f["evidence"]})
    user = json.dumps({"claims": [{"id": c["id"], "text": c["text"], "kind": c["kind"],
                                   "support": [{"id": e["id"], "summary": e["summary"],
                                                "origin": e["origin"]} for e in c["support"]]}
                                  for c in claims],
                       "innocent_facts": facts, "evidence_ids_you_may_cite": allowed})
    out = llm.complete_json("writer", prompts.SKEPTIC, user, 1200, "skeptic",
                            db.case_graph(case_id))
    if not isinstance(out, dict):
        return None
    objections = []
    for o in out.get("objections", []):
        ids = [e for e in o.get("evidence_ids", []) if e in allowed]
        if not ids or o.get("claim_id") not in {c["id"] for c in claims}:
            continue  # objections must cite real innocent evidence
        for eid in ids:
            store.challenge(case_id, o["claim_id"], eid)
        objections.append({**o, "evidence_ids": ids})
    innocent = None
    ic = out.get("innocent_claim")
    if isinstance(ic, dict):
        ids = [e for e in ic.get("evidence_ids", []) if e in allowed]
        if ids:
            innocent = store.add_claim(case_id, str(ic.get("text"))[:400], "innocent", ids,
                                       "skeptic", list(ic.get("about") or [])[:10] or ["?"])
    return {"objections": objections, "innocent_claim": innocent, "mode": "llm"}


def run(case_id: str, round_: int = 0) -> dict:
    g = db.case_graph(case_id)
    store.log_event(case_id, "skeptic", "start", {"round": round_})
    claims = [c for c in db.ro(g, CLAIMS_WITH_SUPPORT)]
    for c in claims:
        c["support"] = [e for e in c["support"] if e.get("id")]
    before = {c["id"]: echo.echo_check(case_id, c["id"])["confidence"] for c in claims}
    facts = gather(case_id, claims)
    res = with_llm(case_id, claims, facts) or deterministic(case_id, claims, facts)
    after = {c["id"]: echo.echo_check(case_id, c["id"]) for c in claims}
    store.log_event(case_id, "skeptic", "done", {
        "round": round_, "mode": res["mode"], "objections": res["objections"],
        "innocent_claim": res["innocent_claim"],
        "confidence": {k: {"before": before[k], "after": v["confidence"],
                           "paths": v["paths"], "sources": v["independent_sources"]}
                       for k, v in after.items()}})
    if res["objections"] and round_ + 1 < MAX_ROUNDS:
        return {"next": [("investigate", case_id, round_ + 1)], **res}
    return {"next": [("report", case_id, round_)], **res}
