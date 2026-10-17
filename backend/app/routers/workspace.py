"""Case workspace: evidence independence, revocation with cascade, freeze simulation on a
GRAPH.COPY sandbox, the provenance DAG, the Merkle seal and FinCEN-style exports."""
from __future__ import annotations

import json
import secrets
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

from app import db
from app.cypher import cy
from app.services import merkle
from trust import echo, validity

router = APIRouter(prefix="/cases", tags=["workspace"])


def _g(case_id: str) -> str:
    g = db.case_graph(case_id)
    if g not in db.list_graphs():
        raise HTTPException(404, f"case {case_id} not found")
    return g


CLAIM_LIST = cy("ws_claims", "Claims with stored echo numbers", """
MATCH (c:Claim)
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.state AS state, c.confidence AS confidence,
       c.naive_confidence AS naive, c.created_at AS created_at
ORDER BY created_at
""")


@router.get("/{case_id}/independence")
def independence(case_id: str):
    """Every claim's supporting paths grouped by the atomic fact (origin) they rest on."""
    g = _g(case_id)
    claims, paths, origins = [], 0, set()
    for c in db.ro(g, CLAIM_LIST):
        sup = db.ro(g, echo.SUPPORTS, {"id": c["id"]})
        chal = db.ro(g, echo.CHALLENGES, {"id": c["id"]})
        s = echo.score(sup, chal)
        paths += s["paths"]
        origins |= {x["origin"] for x in sup}
        claims.append({**c, "paths": s["paths"], "origins": s["independent_sources"],
                       "confidence": s["confidence"], "naive": s["naive_confidence"],
                       "groups": s["groups"], "challenge_groups": s["challenge_groups"],
                       "evidence": {e["id"]: e["summary"] for e in sup + chal}})
    n = len(claims) or 1
    return {"case_id": case_id, "paths": paths, "origins": len(origins), "claims": claims,
            "mean_confidence": round(sum(c["confidence"] for c in claims) / n, 3),
            "mean_naive": round(sum(c["naive"] for c in claims) / n, 3),
            "cypher": echo.COUNTS}


class Revoke(BaseModel):
    reason: str


@router.post("/{case_id}/evidence/{evidence_id}/revoke")
def revoke(case_id: str, evidence_id: str, body: Revoke):
    """Supersede one piece of evidence; the validity cascade flags everything resting on it
    and confidence is recomputed. Returns before/after numbers for the ripple animation."""
    g = _g(case_id)
    before = {c["id"]: c for c in db.ro(g, CLAIM_LIST)}
    seal_before = merkle.case_root(case_id)["root"]
    try:
        res = validity.invalidate_evidence(case_id, evidence_id, body.reason)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    after = {c["id"]: c for c in db.ro(g, CLAIM_LIST)}
    changes = [{"claim": cid, "text": a["text"], "state_before": before[cid]["state"],
                "state_after": a["state"], "confidence_before": before[cid]["confidence"],
                "confidence_after": a["confidence"]}
               for cid, a in after.items() if cid in before and
               (a["state"] != before[cid]["state"] or a["confidence"] != before[cid]["confidence"])]
    actions = db.ro(g, "MATCH (a:Action) RETURN a.id AS id, a.kind AS kind, a.status AS status")
    premises = {a["id"]: validity.premise_check(case_id, action_id=a["id"])["ok"] for a in actions}
    return {**res, "changes": changes, "approval_locked": [k for k, ok in premises.items() if not ok],
            "merkle_before": seal_before, "merkle_after": merkle.case_root(case_id)["root"]}


FLOW_ENDS = cy("freeze_flow_ends", "Sources and sinks of the collapsed FLOWS graph", """
MATCH (a:Account)
OPTIONAL MATCH (a)-[o:FLOWS]->()
OPTIONAL MATCH ()-[i:FLOWS]->(a)
WITH a, count(DISTINCT o) AS outs, count(DISTINCT i) AS ins
RETURN a.id AS id, outs, ins
""")

FREEZE_FLOW = cy("freeze_max_flow", "Liquidity: max flow from sources to sinks over FLOWS", """
MATCH (s:Account) WHERE s.id IN $sources
WITH collect(s) AS srcs
MATCH (t:Account) WHERE t.id IN $sinks
WITH srcs, collect(t) AS tgts
CALL algo.maxFlow({sourceNodes:srcs, targetNodes:tgts, relationshipTypes:['FLOWS'],
                   capacityProperty:'capacity', nodeLabels:['Account']})
YIELD maxFlow
RETURN maxFlow
""")

FREEZE_WCC = cy("freeze_components", "Connected components of the case money graph", """
CALL algo.wcc({nodeLabels:['Account'], relationshipTypes:['FLOWS']})
YIELD node, componentId
WITH componentId, count(node) AS size
RETURN count(componentId) AS components, max(size) AS largest
""")

FREEZE_DROP = cy("freeze_remove_account", "Remove the frozen account in the sandbox copy", """
MATCH (a:Account {id:$id}) DETACH DELETE a
""")


def _measure(graph: str, sources: list[str], sinks: list[str]) -> dict:
    flow = db.ro(graph, FREEZE_FLOW, {"sources": sources, "sinks": sinks}, timeout=10000)
    w = db.ro(graph, FREEZE_WCC, timeout=10000)[0]
    return {"max_flow": round(flow[0]["maxFlow"] if flow else 0.0, 2),
            "components": w["components"], "largest_component": w["largest"]}


class Freeze(BaseModel):
    account: str | None = None


@router.post("/{case_id}/simulate-freeze")
def simulate_freeze(case_id: str, body: Freeze):
    """Copy the case graph with GRAPH.COPY, delete the account in the copy, and measure how
    much money can still move from the ring's sources to its sinks. The case is untouched."""
    g = _g(case_id)
    account = body.account
    if not account:
        rec = db.ro(g, "MATCH (a:Action {kind:'freeze_rec'}) RETURN a.target AS t LIMIT 1")
        account = rec[0]["t"] if rec else None
    if not account:
        pr = db.ro(g, "CALL algo.pageRank('Account', 'FLOWS') YIELD node, score "
                      "RETURN node.id AS id ORDER BY score DESC LIMIT 1")
        account = pr[0]["id"] if pr else None
    if not account:
        raise HTTPException(400, "case graph has no accounts")
    ends = db.ro(g, FLOW_ENDS)
    sources = [e["id"] for e in ends if e["outs"] and not e["ins"] and e["id"] != account]
    sinks = [e["id"] for e in ends if e["ins"] and not e["outs"] and e["id"] != account]
    if not sources or not sinks:  # a closed cycle has no pure sources or sinks
        movers = sorted((e for e in ends if e["id"] != account),
                        key=lambda e: e["outs"] - e["ins"])
        sinks = sinks or [m["id"] for m in movers[:2]]
        sources = sources or [m["id"] for m in movers[-2:]]
    sandbox = f"{g}__freeze_{secrets.token_hex(3)}"
    conn = db.get_db().connection
    t = time.perf_counter()
    conn.execute_command("GRAPH.COPY", g, sandbox)
    copy_ms = round((time.perf_counter() - t) * 1000, 2)
    try:
        before = _measure(sandbox, sources, sinks)
        db.q(sandbox, FREEZE_DROP, {"id": account})
        after = _measure(sandbox, sources, sinks)
    finally:
        db.drop_graph(sandbox)
    cut = before["max_flow"] - after["max_flow"]
    return {"account": account, "sandbox": sandbox, "copy_ms": copy_ms,
            "sources": sources, "sinks": sinks, "before": before, "after": after,
            "liquidity_blocked": round(cut, 2),
            "liquidity_blocked_pct": round(100 * cut / before["max_flow"], 1) if before["max_flow"] else 0.0,
            "cypher": [f"GRAPH.COPY {g} {sandbox}", FREEZE_FLOW, FREEZE_WCC, FREEZE_DROP]}


DAG_NODES = cy("ws_dag_nodes", "Provenance DAG nodes: claims, evidence, sentences, actions, SAR", """
MATCH (n) WHERE n:Claim OR n:Evidence OR n:Sentence OR n:Action OR n:SAR
RETURN labels(n)[0] AS type, n.id AS id, coalesce(n.text, n.summary, n.rationale, n.status) AS label,
       n.kind AS kind, coalesce(n.state, 'active') AS state, n.confidence AS confidence,
       n.origin AS origin, n.status AS status, n.supported AS supported, n.section AS section,
       coalesce(n.created_at, n.ts) AS ts
""")

DAG_EDGES = cy("ws_dag_edges", "Provenance DAG edges", """
MATCH (a)-[r]->(b)
WHERE type(r) IN ['SUPPORTED_BY', 'CHALLENGED_BY', 'DERIVED_FROM', 'JUSTIFIED_BY',
                  'SUPERSEDES', 'CITES', 'CONTAINS']
RETURN a.id AS source, type(r) AS type, b.id AS target
""")


@router.get("/{case_id}/dag")
def dag(case_id: str):
    g = _g(case_id)
    nodes = db.ro(g, DAG_NODES)
    sar_ts = {n["id"]: n["ts"] for n in nodes if n["type"] == "SAR"}
    edges = db.ro(g, DAG_EDGES)
    for n in nodes:  # sentences are written with their SAR
        if n["type"] == "Sentence" and n["ts"] is None:
            n["ts"] = next((sar_ts[e["source"]] for e in edges
                            if e["type"] == "CONTAINS" and e["target"] == n["id"]
                            and e["source"] in sar_ts), None)
    return {"nodes": nodes, "edges": edges, "cypher": [DAG_NODES, DAG_EDGES]}


@router.get("/{case_id}/merkle")
def merkle_root(case_id: str):
    _g(case_id)
    return merkle.case_root(case_id)


EXPORT = cy("ws_export_bundle", "Everything a SAR export needs from a case graph", """
MATCH (k:Case)
OPTIONAL MATCH (k)-[:HAS_SAR]->(s:SAR)
WITH k, s ORDER BY s.created_at DESC
WITH k, collect(s)[0] AS s
RETURN k.id AS id, k.title AS title, k.seed_account AS seed, k.bank_scope AS banks,
       k.opened_at AS opened_at, s.id AS sar, s.status AS sar_status, s.pf_score AS pf,
       s.auditor AS auditor, s.repairs AS repairs
""")


def bundle(case_id: str) -> dict:
    g = _g(case_id)
    head = db.ro(g, EXPORT)[0]
    sentences = db.ro(g, """MATCH (:SAR {id:$sar})-[:CONTAINS]->(t:Sentence)
                            OPTIONAL MATCH (t)-[:CITES]->(n)
                            RETURN t.id AS id, t.text AS text, t.section AS section,
                                   t.supported AS supported, t.state AS state, t.order AS ord,
                                   collect(n.id) AS cites ORDER BY ord""", {"sar": head["sar"]})
    evidence = db.ro(g, """MATCH (e:Evidence) RETURN e.id AS id, e.kind AS kind, e.origin AS origin,
                           e.summary AS summary, e.cypher AS cypher, e.payload AS payload,
                           e.state AS state, e.agent AS agent, e.created_at AS created_at
                           ORDER BY created_at""")
    for e in evidence:
        e["execution_hash"] = merkle.execution_hash(e["cypher"], e["payload"])
    accounts = db.ro(g, "MATCH (a:Account) RETURN a.id AS id, a.bank_id AS bank, "
                        "a.pagerank AS pagerank ORDER BY id")
    claims = db.ro(g, CLAIM_LIST)
    actions = db.ro(g, "MATCH (a:Action) RETURN a.id AS id, a.kind AS kind, a.status AS status, "
                       "a.rationale AS rationale, a.target AS target")
    seal = merkle.case_root(case_id)
    sig = merkle.sign(bytes.fromhex(seal["root"]))
    return {"case": head, "sentences": sentences, "evidence": evidence, "claims": claims,
            "accounts": accounts, "actions": actions,
            "integrity": {"merkle_root": seal["root"], "leaves": seal["count"],
                          "hash_algorithm": seal["algorithm"],
                          "signature_algorithm": sig["algorithm"], "signature": sig["signature"],
                          "public_key": sig["public_key"], "key_source": sig["key_source"]},
            "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}


@router.get("/{case_id}/export/dossier")
def dossier(case_id: str):
    return bundle(case_id)


@router.get("/{case_id}/export/fincen.xml")
def fincen_xml(case_id: str):
    b = bundle(case_id)
    h = b["case"]
    root = ET.Element("SuspiciousActivityReport", {
        "format": "FinCEN-style export (not a BSA E-Filing submission)",
        "caseId": h["id"], "sarId": str(h["sar"]), "status": str(h["sar_status"]),
        "provenanceFidelity": str(h["pf"]), "generated": b["generated_at"]})
    fi = ET.SubElement(root, "FilingInstitution", {"name": "BankWeave consortium (synthetic)",
                                                    "banks": ",".join(h["banks"] or [])})
    ET.SubElement(fi, "Note").text = "Synthetic data from IBM AMLworld; account ids are salted hashes."
    subj = ET.SubElement(root, "Subjects")
    for a in b["accounts"]:
        ET.SubElement(subj, "Subject", {"accountHash": a["id"], "bank": str(a["bank"]),
                                        "seed": str(a["id"] == h["seed"]).lower()})
    act = ET.SubElement(root, "SuspiciousActivity")
    for c in b["claims"]:
        ET.SubElement(act, "Finding", {"claimId": c["id"], "kind": str(c["kind"]),
                                       "state": str(c["state"]),
                                       "confidence": str(c["confidence"])}).text = c["text"]
    nar = ET.SubElement(root, "Narrative")
    for s in b["sentences"]:
        el = ET.SubElement(nar, "Sentence", {"id": s["id"], "section": str(s["section"]),
                                             "supported": str(bool(s["supported"])).lower(),
                                             "state": str(s["state"])})
        ET.SubElement(el, "Text").text = s["text"]
        cites = ET.SubElement(el, "Cites")
        for c in s["cites"]:
            ET.SubElement(cites, "Cite", {"ref": c})
    ev = ET.SubElement(root, "Evidence")
    for e in b["evidence"]:
        it = ET.SubElement(ev, "Item", {"id": e["id"], "kind": str(e["kind"]),
                                        "origin": str(e["origin"]), "state": str(e["state"]),
                                        "agent": str(e["agent"]),
                                        "executionHash": "sha256:" + e["execution_hash"]})
        ET.SubElement(it, "Summary").text = e["summary"]
        ET.SubElement(it, "Cypher").text = e["cypher"] or ""
    acts = ET.SubElement(root, "RecommendedActions")
    for a in b["actions"]:
        ET.SubElement(acts, "Action", {"id": a["id"], "kind": a["kind"], "status": a["status"],
                                       "target": str(a["target"])}).text = a["rationale"]
    i = b["integrity"]
    ET.SubElement(root, "Integrity", {"merkleRoot": i["merkle_root"], "leaves": str(i["leaves"]),
                                      "hashAlgorithm": i["hash_algorithm"],
                                      "signatureAlgorithm": i["signature_algorithm"],
                                      "signature": i["signature"], "publicKey": i["public_key"],
                                      "keySource": i["key_source"]})
    ET.indent(root)
    xml = ET.tostring(root, encoding="unicode", xml_declaration=True)
    return Response(xml, media_type="application/xml", headers={
        "Content-Disposition": f'attachment; filename="bankweave-{case_id}-sar.xml"'})


@router.get("/{case_id}/trace")
def trace(case_id: str):
    """OpenTelemetry-shaped spans of every agent task, tool call and LLM call in the case."""
    from app.services import telemetry
    _g(case_id)
    spans = telemetry.case_trace(case_id)
    return {"trace_id": telemetry.trace_id_for(case_id), "spans": spans,
            "cypher": telemetry.READ}
