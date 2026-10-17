import json

from fastapi import APIRouter, HTTPException
from fastapi.responses import PlainTextResponse

from app import db
from app.cypher import cy

router = APIRouter(prefix="/sar", tags=["sar"])

LATEST = cy("api_sar_latest", "Latest SAR of a case with sentences and citations", """
MATCH (s:SAR) WITH s ORDER BY s.version DESC LIMIT 1
MATCH (s)-[:CONTAINS]->(t:Sentence)
OPTIONAL MATCH (t)-[:CITES]->(x)
WITH s, t, collect({id:x.id, label:labels(x)[0], text:coalesce(x.summary, x.text),
                    state:x.state, accounts:x.accounts}) AS cites
ORDER BY t.order
RETURN s.id AS id, s.status AS status, s.pf_score AS pf, s.version AS version,
       s.repairs AS repairs, s.state AS state, s.divergence AS divergence, s.auditor AS auditor,
       s.created_at AS created_at,
       collect({id:t.id, text:t.text, supported:t.supported, section:t.section,
                verdict:t.verdict, state:t.state, cites:cites}) AS sentences
""")

VERSIONS = cy("api_sar_versions", "All SAR versions of a case", """
MATCH (s:SAR) RETURN s.id AS id, s.status AS status, s.pf_score AS pf, s.version AS version,
       s.state AS state, s.created_at AS created_at ORDER BY version
""")


@router.get("/{case_id}")
def latest(case_id: str):
    g = db.case_graph(case_id)
    if g not in db.list_graphs():
        raise HTTPException(404, "case not found")
    rows = db.ro(g, LATEST)
    if not rows:
        return {"sar": None, "versions": []}
    sar = rows[0]
    sar["divergence"] = json.loads(sar["divergence"]) if sar.get("divergence") else None
    for s in sar["sentences"]:
        s["cites"] = [c for c in s["cites"] if c.get("id")]
    return {"sar": sar, "versions": db.ro(g, VERSIONS)}


@router.get("/{case_id}/markdown", response_class=PlainTextResponse)
def markdown(case_id: str):
    sar = latest(case_id)["sar"]
    if not sar:
        raise HTTPException(404, "no SAR yet")
    lines = [f"# Suspicious Activity Report — case {case_id}",
             f"Status: **{sar['status']}** · provenance fidelity {sar['pf']} · "
             f"version {sar['version']} · auditor {sar['auditor']}", ""]
    section = None
    for s in sar["sentences"]:
        if s["section"] != section:
            section = s["section"]
            lines += ["", f"## {section.replace('_', ' ').title()}"]
        mark = "" if s["supported"] else " ⚠ unsupported"
        lines.append(f"- {s['text']} [{', '.join(c['id'] for c in s['cites'])}]{mark}")
    if sar["divergence"]:
        lines += ["", "## Divergence report", "```json",
                  json.dumps(sar["divergence"], indent=2), "```"]
    return "\n".join(lines)
