"""Investigator agent: picks graph tools, gathers evidence, writes evidence-linked claims.

LLM mode: the writer model chooses tools one at a time (tool selection over the registry).
Deterministic mode: follow the best procedure from procedural memory, else a default plan.
Round >= 1 is a rebuttal round: look for NEW independent origins (unexplored kinds).
"""
from __future__ import annotations

import json

from agents import llm, prompts, tools
from agents.tools import Ctx
from app import db
from app.cypher import cy
from memory import procedural
from trust import echo, store

MEMBERS = cy("case_members", "Accounts in a case graph ranked by motif score", """
MATCH (a:Account) WHERE a.bank_id IS NOT NULL
RETURN a.id AS id, a.bank_id AS bank, coalesce(a.motif_score, 0.0) AS motif
ORDER BY motif DESC
""")

CASE_INFO = cy("case_info", "Seed account and title of a case", """
MATCH (c:Case) RETURN c.id AS id, c.seed_account AS seed, c.title AS title
""")

EVIDENCE = cy("case_evidence_list", "Evidence gathered so far in a case", """
MATCH (e:Evidence) WHERE e.state <> 'superseded'
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.summary AS summary,
       e.accounts AS accounts, e.author_agent AS author
""")

CLAIMS = cy("case_claims_list", "Claims of a case", """
MATCH (c:Claim) RETURN c.id AS id, c.kind AS kind, c.text AS text, c.about AS about,
       c.confidence AS confidence, c.state AS state
""")

INVESTIGATOR_TOOLS = ["typology_patterns", "cross_bank_links", "find_hub", "find_bridges",
                      "find_orchestrator", "trace_flow", "money_at_risk", "shared_identity",
                      "passthrough_check", "behavior_neighbors", "find_rings",
                      "recall_similar_cases", "reach", "bfs_reach", "backbone", "kb_query"]
MAX_LLM_STEPS = 8


def _ctx(case_id: str) -> Ctx:
    return Ctx(graph=db.CONSORTIUM, case_id=case_id, agent="investigator")


def _hub(case_id: str, seed: str) -> str | None:
    r = tools.call("find_hub", _ctx(case_id), top_k=3)["result"]
    for row in r:
        if row["account"] != seed:
            return row["account"]
    return None


def default_plan(case_id: str, seed: str, members: list[dict]) -> list[dict]:
    others = [m["id"] for m in members if m["id"] != seed][:2]
    plan = [{"tool": "typology_patterns", "params": {"account_id": seed}},
            {"tool": "cross_bank_links", "params": {"account_id": seed}},
            {"tool": "find_hub", "params": {"top_k": 5}},
            {"tool": "find_bridges", "params": {"top_k": 5}},
            {"tool": "trace_flow", "params": {"src": seed, "dst": "$hub", "direction": "both"}},
            {"tool": "money_at_risk", "params": {"sources": [seed], "targets": ["$hub"]}},
            {"tool": "shared_identity", "params": {"account_id": seed}},
            {"tool": "passthrough_check", "params": {"account_id": seed}}]
    plan += [{"tool": "typology_patterns", "params": {"account_id": o}} for o in others]
    return plan


def rebuttal_plan(case_id: str, seed: str, members: list[dict]) -> list[dict]:
    hub = _hub(case_id, seed) or seed
    return [{"tool": "behavior_neighbors", "params": {"account_id": seed}},
            {"tool": "passthrough_check", "params": {"account_id": hub}},
            {"tool": "typology_patterns", "params": {"account_id": hub}},
            {"tool": "find_orchestrator", "params": {"top_k": 3}}]


def _resolve(params: dict, hub: str | None) -> dict | None:
    out = {}
    for k, v in params.items():
        if v == "$hub" or (isinstance(v, list) and "$hub" in v):
            if not hub:
                return None
            v = hub if v == "$hub" else [hub if x == "$hub" else x for x in v]
        out[k] = v
    return out


def execute(case_id: str, plan: list[dict], seed: str) -> list[dict]:
    ctx, hub, done = _ctx(case_id), None, []
    for step in plan:
        if "$hub" in json.dumps(step["params"]) and hub is None:
            hub = _hub(case_id, seed)
        params = _resolve(step["params"], hub)
        if params is None:
            continue
        try:
            out = tools.call(step["tool"], ctx, **params)
            done.append({"tool": step["tool"], "params": step["params"],
                         "evidence": out.get("evidence_ids", [])})
        except Exception as exc:  # noqa: BLE001 - one failing tool must not stop the case
            store.log_event(case_id, "investigator", f"tool_error:{step['tool']}",
                            {"error": str(exc)[:300]})
    return done


def llm_loop(case_id: str, seed: str, members: list[dict], rebuttal: bool) -> list[dict] | None:
    if not llm.enabled():
        return None
    ctx = _ctx(case_id)
    allowed = [t for t in tools.describe("investigator") if t["name"] in INVESTIGATOR_TOOLS]
    transcript = []
    done = []
    for _ in range(MAX_LLM_STEPS):
        ev = db.ro(db.case_graph(case_id), EVIDENCE)
        grouped = echo.group_by_origin([{**e, "state": "active"} for e in ev])
        user = json.dumps({
            "case": case_id, "seed_account": seed, "members": members[:25],
            "rebuttal_round": rebuttal, "tools": allowed,
            "evidence_by_origin": [{"origin": g["origin"], "kind": g["kind"],
                                    "summary": g["summary"], "ids": g["evidence_ids"][:3],
                                    "multiplicity": g["multiplicity"]} for g in grouped][:40],
            "history": transcript[-8:]})
        out = llm.complete_json("writer", prompts.INVESTIGATOR, user, 1200, "investigator",
                                db.case_graph(case_id))
        if not isinstance(out, dict):
            return done or None
        if out.get("done"):
            done.append({"claims": out.get("claims", [])})
            return done
        name, params = out.get("tool"), out.get("params") or {}
        if name not in INVESTIGATOR_TOOLS:
            transcript.append({"error": f"unknown tool {name}"})
            continue
        try:
            res = tools.call(name, ctx, **params)
            transcript.append({"tool": name, "params": params, "why": out.get("why"),
                               "evidence_ids": res.get("evidence_ids", []),
                               "summary": tools._summarize(res)})
            done.append({"tool": name, "params": params, "evidence": res.get("evidence_ids", [])})
        except Exception as exc:  # noqa: BLE001
            transcript.append({"tool": name, "error": str(exc)[:200]})
    return done


def build_claims(case_id: str, seed: str, members: list[dict]) -> list[str]:
    """Deterministic claim builder over recorded evidence (used when no LLM claims)."""
    ev = db.ro(db.case_graph(case_id), EVIDENCE)
    existing = {c["kind"]: c for c in db.ro(db.case_graph(case_id), CLAIMS)}
    # shared attributes are taken at face value here; echo weighting discounts broadly shared
    # ones and the Skeptic challenges them - that is the intended division of labour
    ring_ev = [e for e in ev if e["kind"] in ("path", "typology_match", "passthrough",
                                               "behavior_similarity", "shared_attr")]
    made = []
    if ring_ev:
        accts = sorted({a for e in ring_ev for a in (e["accounts"] or [])})
        banks = sorted({m["bank"] for m in members if m["id"] in accts and m["bank"]})
        typs = sorted({e["origin"].split(":")[1] for e in ev if e["kind"] == "typology_match"})
        text = (f"{len(accts)} accounts across {len(banks)} bank(s) form a connected laundering "
                f"structure around {seed[:6]}"
                + (f" (typologies: {', '.join(typs)})" if typs else ""))
        if "ring" in existing:
            for e in ring_ev:
                store.support(case_id, existing["ring"]["id"], e["id"])
            ring = existing["ring"]["id"]
        else:
            ring = store.add_claim(case_id, text, "ring", [e["id"] for e in ring_ev],
                                   "investigator", accts or [seed])
            made.append(ring)
        hub_ev = [e for e in ev if e["kind"] == "algo_score" and
                  (e["origin"].startswith("algo:pagerank") or e["origin"].startswith("algo:maxflow"))]
        if hub_ev and "hub" not in existing:
            hub = next((e["accounts"][0] for e in hub_ev if e["origin"].startswith("algo:pagerank")),
                       hub_ev[0]["accounts"][-1])
            hc = store.add_claim(case_id, f"Account {hub[:6]} is where funds in the structure "
                                          f"pool (collection hub)", "hub",
                                 [e["id"] for e in hub_ev], "investigator", [hub])
            store.derive(case_id, hc, ring)
            made.append(hc)
        br_ev = [e for e in ev if e["origin"].startswith("algo:betweenness")]
        hub_acct = next((e["accounts"][0] for e in hub_ev
                         if e["origin"].startswith("algo:pagerank")), None)
        if br_ev and "mule" not in existing and br_ev[0]["accounts"][0] != hub_acct:
            acct = br_ev[0]["accounts"][0]
            mc = store.add_claim(case_id, f"Account {acct[:6]} bridges the groups in the "
                                          f"structure (likely mule)", "mule",
                                 [e["id"] for e in br_ev], "investigator", [acct])
            store.derive(case_id, mc, ring)
            made.append(mc)
    struct = [e for e in ev if e["origin"].startswith("typ:structuring")]
    if struct and "structuring" not in existing:
        made.append(store.add_claim(case_id, f"Account {seed[:6]} structures transfers just "
                                             f"under the reporting threshold", "structuring",
                                    [e["id"] for e in struct], "investigator", [seed]))
    return made


LINK_TYPOLOGY = cy("claim_matches_typology", "Link a claim to a named typology (mirrored)", """
MATCH (c:Claim {id:$claim})
MERGE (t:Typology {id:$typology}) SET t.name = $name, t.source_doc = $chunk
MERGE (c)-[m:MATCHES_TYPOLOGY]->(t) SET m.score = $score
""")


def cite_typologies(case_id: str) -> list[str]:
    """Map detector hits to named typologies and cite the guidance as `doc:` evidence."""
    from knowledge import typology_kb
    g = db.case_graph(case_id)
    ring = db.ro(g, "MATCH (c:Claim {kind:'ring'}) RETURN c.id AS id LIMIT 1")
    if not ring:
        return []
    pats = {r["p"] for r in db.ro(g, "MATCH (e:Evidence {kind:'typology_match'}) "
                                     "RETURN split(e.origin, ':')[1] AS p")}
    out = []
    for p in sorted(pats):
        tid = typology_kb.DETECTOR_TO_TYPOLOGY.get(p)
        t = typology_kb.typology(tid) if tid else None
        if not t:
            continue
        eid = store.add_evidence(case_id, "doc", store.origin_for("doc", chunk=t["chunk"]),
                                 f"matches named typology '{t['name']}' "
                                 f"(guidance: {t['sources'].split(' ; ')[0]})",
                                 {"typology": tid, "indicators": t["indicators"]},
                                 typology_kb.GET, "investigator")
        store.support(case_id, ring[0]["id"], eid)
        db.q(g, LINK_TYPOLOGY, {"claim": ring[0]["id"], "typology": tid, "name": t["name"],
                                "chunk": t["chunk"], "score": 1.0})
        out.append(tid)
    return out


def _llm_claims(case_id: str, steps: list[dict]) -> list[str]:
    made = []
    for s in steps:
        for c in s.get("claims", []):
            try:
                made.append(store.add_claim(case_id, str(c["text"])[:400], c.get("kind", "ring"),
                                            list(c.get("evidence_ids", [])), "investigator",
                                            list(c.get("about", [])) or ["?"]))
            except (ValueError, KeyError):
                continue  # tool layer rejects claims without real evidence ids
    return made


def run(case_id: str, round_: int = 0) -> dict:
    g = db.case_graph(case_id)
    seed = db.ro(g, CASE_INFO)[0]["seed"]
    members = db.ro(g, MEMBERS)
    rebuttal = round_ > 0
    store.log_event(case_id, "investigator", "start", {"round": round_})
    steps = llm_loop(case_id, seed, members, rebuttal)
    mode = "llm" if steps else "deterministic"
    proc = None
    if not steps:
        if rebuttal:
            plan = rebuttal_plan(case_id, seed, members)
        else:
            proc = procedural.best(None)
            def bind(v):
                if isinstance(v, list):
                    return [seed if x == "$seed" else x for x in v]
                return seed if v == "$seed" else v
            plan = ([{"tool": s["tool"], "params": {k: bind(v) for k, v in s["params"].items()}}
                     for s in proc["steps"]] if proc else default_plan(case_id, seed, members))
            if proc:
                store.log_event(case_id, "investigator", "using_procedure",
                                {"procedure": proc["id"], "learned_from": proc["learned_from"]})
        steps = execute(case_id, plan, seed)
    made = _llm_claims(case_id, steps)
    if not made:
        made = build_claims(case_id, seed, members)
    typs = cite_typologies(case_id) if not rebuttal else []
    if typs:
        store.log_event(case_id, "investigator", "cited_typologies", {"typologies": typs})
    for cid in [c["id"] for c in db.ro(g, CLAIMS)]:
        echo.echo_check(case_id, cid)
    store.log_event(case_id, "investigator", "done",
                    {"round": round_, "mode": mode, "claims": made,
                     "tools": [s.get("tool") for s in steps if s.get("tool")]})
    if not db.ro(g, CLAIMS):
        return {"next": [("report", case_id, round_)], "claims": [], "mode": mode}
    return {"next": [("challenge", case_id, round_)], "claims": made, "mode": mode,
            "steps": [s for s in steps if s.get("tool")], "procedure": proc and proc["id"]}
