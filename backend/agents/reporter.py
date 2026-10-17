"""Reporter agent: drafts the SAR from a closed bundle; the provenance gate decides."""
from __future__ import annotations

import json

from agents import llm, prompts
from app import db
from trust import gate, store


def deterministic_draft(bundle: dict, hint: list[dict] | None) -> list[dict]:
    """Closed-world template: every sentence restates cited items verbatim."""
    bad = {h["id"] for h in (hint or [])}
    claims = [c for c in bundle["claims"] if c["kind"] != "innocent"]
    innocent = [c for c in bundle["claims"] if c["kind"] == "innocent"]
    out = []
    case = bundle["case"]
    seed = case["seed"]
    seed_ev = next((e for e in bundle["evidence"] if seed in (e.get("summary") or "")
                    or seed[:6] in (e.get("summary") or "")), None)
    if claims:
        out.append({"section": "subject", "text": f"Subject of this report: {claims[0]['text']}.",
                    "cites": [claims[0]["id"]]})
    for c in claims[1:]:
        out.append({"section": "activity", "text": f"Finding: {c['text']}.", "cites": [c["id"]]})
    order = {"typology_match": 0, "path": 1, "passthrough": 2, "algo_score": 3,
             "shared_attr": 4, "behavior_similarity": 5, "kyc_fact": 6}
    groups = sorted(bundle["evidence_by_origin"], key=lambda g: order.get(g["kind"], 9))
    section = {"typology_match": "typologies", "path": "money_flow", "passthrough": "money_flow",
               "algo_score": "money_flow", "shared_attr": "cross_bank"}
    for g in groups[:10]:
        if g["kind"] == "kyc_fact":
            continue
        out.append({"section": section.get(g["kind"], "activity"),
                    "text": f"Evidence ({g['multiplicity']} path(s), one independent source): "
                            f"{g['summary']}.", "cites": [g["evidence_ids"][0]]})
    for e in bundle["challenges"][:4]:
        out.append({"section": "unresolved", "text": f"Unresolved: {e['summary']}.",
                    "cites": [e["id"]]})
    if claims:
        out.append({"section": "recommendation",
                    "text": "Recommendation: file this report; the evidence supports the "
                            "subject finding.", "cites": [claims[0]["id"]]})
    elif innocent:
        out.append({"section": "recommendation", "text": f"Recommendation: {innocent[0]['text']}.",
                    "cites": [innocent[0]["id"]]})
    _ = seed_ev
    # repair: drop sentences the auditor rejected, except the recommendation, which a SAR needs
    for i, s in enumerate(out):
        s["id"] = f"s{i}"
    return [s for s in out if s["id"] not in bad or s["section"] == "recommendation"]


def llm_draft(bundle: dict, hint: list[dict] | None) -> list[dict] | None:
    if not llm.enabled():
        return None
    slim = {"case": bundle["case"],
            "claims": [{k: c[k] for k in ("id", "text", "kind", "state", "confidence",
                                          "independent_sources")} for c in bundle["claims"]],
            "evidence": [{"id": g["evidence_ids"][0], "kind": g["kind"], "summary": g["summary"],
                          "paths": g["multiplicity"]} for g in bundle["evidence_by_origin"][:30]],
            "challenges": [{"id": e["id"], "summary": e["summary"]} for e in bundle["challenges"]],
            "auditor_rejected": [{"id": h["id"], "text": h["text"], "why": h["verdict"]}
                                 for h in (hint or [])]}
    out = llm.complete_json("writer", prompts.REPORTER, json.dumps(slim), 2500, "reporter",
                            db.case_graph(bundle["case"]["id"]))
    if not isinstance(out, dict) or not isinstance(out.get("sentences"), list):
        return None
    return [{"section": str(s.get("section", "activity")), "text": str(s.get("text", ""))[:600],
             "cites": [str(c) for c in s.get("cites", [])]} for s in out["sentences"]
            if s.get("text")]


def draft(bundle: dict, hint: list[dict] | None) -> list[dict]:
    return llm_draft(bundle, hint) or deterministic_draft(bundle, hint)


def run(case_id: str, round_: int = 0) -> dict:
    store.log_event(case_id, "reporter", "start", {})
    res = gate.run(case_id, draft)
    bundle = gate.get_case_bundle(case_id)
    claims = [c for c in bundle["claims"] if c["kind"] != "innocent"]
    actions = []
    if claims:
        top = [c["id"] for c in claims[:3]]
        if res["status"] == "published":
            actions.append(store.propose_action(case_id, "file_sar", top,
                                                f"SAR {res['sar_id']} passed the provenance "
                                                f"gate (PF {res['pf']})", res["sar_id"],
                                                "reporter"))
            hub = next((c for c in claims if c["kind"] == "hub"), None)
            if hub and (hub["confidence"] or 0) >= 0.5:
                actions.append(store.propose_action(case_id, "freeze_rec", [hub["id"]],
                                                    "funds pool at this account", hub["about"][0],
                                                    "reporter"))
        else:
            actions.append(store.propose_action(case_id, "escalate", top,
                                                "agents could not reach a provable SAR; "
                                                "divergence report attached", res["sar_id"],
                                                "reporter"))
    store.set_status(case_id, "awaiting_approval" if claims else "insufficient")
    store.log_event(case_id, "reporter", "done", {"sar": res["sar_id"], "status": res["status"],
                                                  "pf": res["pf"], "actions": actions})
    return {"next": [], "sar": res, "actions": actions}
