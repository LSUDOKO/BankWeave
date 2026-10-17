"""Provenance gate on the SAR (Active Provenance Gate, arXiv 2609.31422).

closed evidence bundle -> writer drafts sentences with cites -> auditor checks each sentence
-> publish only if PF = supported/total >= 0.95, else <= 3 repair rounds, else a divergence
report that shows the disagreement instead of inventing consensus.

Code checks run first (cite exists, belongs to this case, is active). Only sentences that
pass them reach the auditor model. Without an LLM key a deterministic auditor checks that
every number and account id in a sentence appears in its cited items.
"""
from __future__ import annotations

import json
import re
from typing import Callable

from agents import llm
from app import db, events
from app.cypher import cy
from trust import echo, store

PF_THRESHOLD = 0.95
MAX_REPAIRS = 3

BUNDLE_CLAIMS = cy("bundle_claims", "Active claims of a case with confidence", """
MATCH (c:Claim) WHERE c.state IN ['active', 'needs_verification']
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.state AS state,
       c.confidence AS confidence, c.paths AS paths,
       c.independent_sources AS independent_sources, c.author_agent AS author, c.about AS about
ORDER BY c.created_at
""")

BUNDLE_EVIDENCE = cy("bundle_evidence", "Evidence of a case (closed corpus for the SAR)", """
MATCH (e:Evidence) WHERE e.state <> 'superseded'
OPTIONAL MATCH (c:Claim)-[r:SUPPORTED_BY|CHALLENGED_BY]->(e)
RETURN e.id AS id, e.kind AS kind, e.origin AS origin, e.summary AS summary,
       e.payload AS payload, e.state AS state, e.author_agent AS author,
       collect(DISTINCT {claim:c.id, rel:type(r)}) AS links
""")

BUNDLE_ACTIONS = cy("bundle_actions", "Proposed and approved actions of a case", """
MATCH (a:Action)-[:JUSTIFIED_BY]->(c:Claim)
RETURN a.id AS id, a.kind AS kind, a.status AS status, a.state AS state,
       a.target AS target, collect(c.id) AS claims
""")

CITE_CHECK = cy("gate_cite_check", "Code-level check: cited items exist and are active", """
MATCH (n) WHERE (n:Evidence OR n:Claim) AND n.id IN $ids
RETURN n.id AS id, n.state AS state, labels(n)[0] AS label,
       coalesce(n.summary, n.text) AS text, n.payload AS payload, n.confidence AS confidence
""")

MIN_CONCLUSION_CONFIDENCE = 0.5

WRITE_SAR = cy("sar_write", "Write a SAR with sentences citing evidence and claims", """
MATCH (k:Case)
CREATE (s:SAR {id:$sar, case_id:k.id, status:$status, pf_score:$pf, version:$v,
               repairs:$repairs, created_at:timestamp(), state:'active',
               divergence:$divergence, auditor:$auditor})
CREATE (k)-[:HAS_SAR]->(s)
WITH s
UNWIND $sentences AS x
CREATE (s)-[:CONTAINS]->(t:Sentence {id:x.id, text:x.text, supported:x.supported,
                                     order:x.order, state:'active', verdict:x.verdict,
                                     section:x.section})
WITH t, x
UNWIND x.cites AS cid
MATCH (n) WHERE (n:Evidence OR n:Claim) AND n.id = cid
CREATE (t)-[:CITES]->(n)
""")

AUDITOR_SYSTEM = """You are a strict compliance auditor checking a suspicious activity report.
For each sentence you get ONLY the evidence items it cites. Decide if the cited items ENTAIL
the sentence (every factual detail - accounts, amounts, counts, typology names, banks - must
be stated or directly computable from the cited items). Unstated inference = unsupported.
Return {"verdicts":[{"id":"<sentence id>","supported":true|false,"reason":"..."}]}"""



def get_case_bundle(case_id: str) -> dict:
    g = db.case_graph(case_id)
    claims = db.ro(g, BUNDLE_CLAIMS)
    evidence = db.ro(g, BUNDLE_EVIDENCE)
    for e in evidence:
        e["links"] = [x for x in e["links"] if x.get("claim")]
    grouped = echo.group_by_origin([{**e, "state": e["state"]} for e in evidence])
    case = db.ro(g, "MATCH (c:Case) RETURN c.id AS id, c.title AS title, "
                    "c.seed_account AS seed, c.bank_scope AS banks")[0]
    return {"case": case, "claims": claims, "evidence": evidence, "evidence_by_origin": grouped,
            "actions": db.ro(g, BUNDLE_ACTIONS),
            "challenges": [e for e in evidence
                           if any(x["rel"] == "CHALLENGED_BY" for x in e["links"])]}


_ACCT = re.compile(r"\b[0-9a-f]{16}\b")
_NUM = re.compile(r"(?<![\w.])\d[\d,]*(?:\.\d+)?")


def _numbers(text: str) -> set[float]:
    out = set()
    for m in _NUM.findall(_ACCT.sub(" ", text)):
        try:
            out.add(round(float(m.replace(",", "")), 2))
        except ValueError:
            pass
    return out


def _deterministic_verdict(sentence: str, cited: list[dict]) -> tuple[bool, str]:
    """Every account id and number in the sentence must appear in its cited items."""
    corpus = " ".join(f"{c.get('text') or ''} {c.get('payload') or ''}" for c in cited)
    have_nums = _numbers(corpus) | {round(x) for x in _numbers(corpus)}
    missing = [a for a in _ACCT.findall(sentence) if a not in corpus]
    missing += [str(n) for n in _numbers(sentence) if n not in have_nums and n > 1]
    if missing:
        return False, f"not found in cited items: {', '.join(missing[:4])}"
    return True, "all numbers and account ids appear in cited items"


def _weak_conclusion(cites: list[str], items: dict) -> str:
    for c in cites:
        it = items[c]
        if it["label"] != "Claim":
            continue
        if it["state"] != "active":
            return f"conclusion rests on claim {c} in state {it['state']}"
        if (it.get("confidence") or 0) < MIN_CONCLUSION_CONFIDENCE:
            return (f"conclusion rests on claim {c} with echo-proof confidence "
                    f"{it.get('confidence') or 0:.2f} < {MIN_CONCLUSION_CONFIDENCE}")
    return ""


def audit(case_id: str, sentences: list[dict]) -> list[dict]:
    g = db.case_graph(case_id)
    all_ids = sorted({c for s in sentences for c in s.get("cites", [])})
    items = {r["id"]: r for r in db.ro(g, CITE_CHECK, {"ids": all_ids})}
    verdicts, to_llm = [], []
    for s in sentences:
        cites = s.get("cites") or []
        bad = [c for c in cites if c not in items]
        stale = [c for c in cites if c in items and items[c]["state"] == "superseded"]
        if not cites:
            verdicts.append({**s, "supported": False, "verdict": "no citations"})
        elif bad:
            verdicts.append({**s, "supported": False, "verdict": f"unknown ids {bad}"})
        elif stale:
            verdicts.append({**s, "supported": False, "verdict": f"cites superseded {stale}"})
        elif s.get("section") == "recommendation" and _weak_conclusion(cites, items):
            # a conclusion may not assert more than the (echo-proof) evidence supports
            verdicts.append({**s, "supported": False, "verdict": _weak_conclusion(cites, items)})
        else:
            verdicts.append({**s, "supported": None, "verdict": ""})
            to_llm.append(s)
    if to_llm and llm.enabled():
        payload = [{"id": s["id"], "sentence": s["text"],
                    "cited_items": [{"id": c, "text": items[c]["text"],
                                     "data": (items[c].get("payload") or "")[:1500]}
                                    for c in s["cites"]]} for s in to_llm]
        out = llm.complete_json("auditor", AUDITOR_SYSTEM, json.dumps(payload),
                                max_tokens=3000, agent="auditor", case_graph=g)
        got = {v.get("id"): v for v in (out or {}).get("verdicts", [])} if isinstance(out, dict) else {}
        for v in verdicts:
            if v["supported"] is None and v["id"] in got:
                v["supported"] = bool(got[v["id"]].get("supported"))
                v["verdict"] = str(got[v["id"]].get("reason", ""))[:300]
                v["auditor"] = llm.model_for("auditor")
    for v in verdicts:  # deterministic auditor for anything the model didn't judge
        if v["supported"] is None:
            ok, why = _deterministic_verdict(v["text"], [items[c] for c in v["cites"]])
            v["supported"], v["verdict"], v["auditor"] = ok, why, "deterministic"
    return verdicts


def pf_score(verdicts: list[dict]) -> float:
    return round(sum(1 for v in verdicts if v["supported"]) / max(1, len(verdicts)), 3)


def divergence_report(bundle: dict, verdicts: list[dict]) -> dict:
    investigator = [c for c in bundle["claims"] if c["kind"] != "innocent"]
    skeptic = [c for c in bundle["claims"] if c["kind"] == "innocent"]
    skeptic_ev = [{"id": e["id"], "summary": e["summary"]} for e in bundle["challenges"]]
    return {"unresolved": [{"id": v["id"], "text": v["text"], "why": v["verdict"]}
                           for v in verdicts if not v["supported"]],
            "investigator": [{"id": c["id"], "text": c["text"], "confidence": c["confidence"]}
                             for c in investigator],
            "skeptic": [{"id": c["id"], "text": c["text"]} for c in skeptic] + skeptic_ev}


def run(case_id: str, draft: Callable[[dict, list[dict] | None], list[dict]]) -> dict:
    """draft(bundle, unsupported_from_last_round) -> [{id, text, cites, section}]"""
    bundle = get_case_bundle(case_id)
    hint, history = None, []
    for attempt in range(MAX_REPAIRS + 1):
        sentences = draft(bundle, hint)
        for i, s in enumerate(sentences):
            s.setdefault("id", f"s{i}")
            s["order"] = i
            s.setdefault("section", "body")
        verdicts = audit(case_id, sentences)
        pf = pf_score(verdicts)
        history.append({"attempt": attempt, "pf": pf})
        store.log_event(case_id, "auditor", "audit_sar", {"attempt": attempt, "pf": pf})
        if pf >= PF_THRESHOLD:
            return _write(case_id, verdicts, "published", pf, attempt, None, history)
        hint = [v for v in verdicts if not v["supported"]]
    return _write(case_id, verdicts, "divergent", pf, MAX_REPAIRS,
                  divergence_report(bundle, verdicts), history)


def _write(case_id, verdicts, status, pf, repairs, divergence, history) -> dict:
    g = db.case_graph(case_id)
    sar_id = store.new_id("SAR")
    version = db.ro(g, "MATCH (s:SAR) RETURN count(s) AS c")[0]["c"] + 1
    auditors = sorted({v.get("auditor", "code") for v in verdicts})
    rows = [{"id": f"{sar_id}-{v['order']}", "text": v["text"], "supported": bool(v["supported"]),
             "order": v["order"], "cites": v.get("cites", []), "verdict": v["verdict"],
             "section": v.get("section", "body")} for v in verdicts]
    db.q(g, WRITE_SAR, {"sar": sar_id, "status": status, "pf": pf, "v": version,
                        "repairs": repairs, "sentences": rows,
                        "divergence": json.dumps(divergence) if divergence else "",
                        "auditor": ",".join(auditors)})
    events.publish("sar", g, sar_id, {"status": status, "pf": pf, "repairs": repairs})
    return {"sar_id": sar_id, "status": status, "pf": pf, "repairs": repairs,
            "sentences": rows, "divergence": divergence, "history": history,
            "auditor": auditors}
