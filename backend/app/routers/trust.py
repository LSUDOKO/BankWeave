"""Trust panel endpoints: KYC update push (cascade demo), echo overview."""
from fastapi import APIRouter
from pydantic import BaseModel

from app import db, events
from app.cypher import cy
from knowledge import kyc
from trust import validity

router = APIRouter(prefix="/trust", tags=["trust"])

ECHO_OVERVIEW = cy("trust_echo_overview", "Naive vs echo-proof confidence for every claim", """
MATCH (c:Claim) WHERE c.paths IS NOT NULL
RETURN c.id AS id, c.text AS text, c.kind AS kind, c.state AS state, c.paths AS paths,
       c.independent_sources AS sources, c.confidence AS confidence,
       c.naive_confidence AS naive
""")

STATE_COUNTS = cy("trust_state_counts", "Validity states across a case graph", """
MATCH (n) WHERE n.state IS NOT NULL AND (n:Claim OR n:Evidence OR n:Action OR n:SAR)
RETURN labels(n)[0] AS label, n.state AS state, count(n) AS n
""")


class KycUpdate(BaseModel):
    address_id: str = "A-77"
    fact: str = "Address A-77 is a 200-unit residential building"


@router.post("/kyc_update")
def kyc_update(body: KycUpdate):
    """A new KYC fact supersedes every shared-address evidence item resting on it."""
    occ = kyc.address_occupancy(body.address_id)
    row = occ["result"][0] if occ["result"] and "error" not in occ["result"][0] else {}
    results = validity.invalidate_origin(
        f"attr:{body.address_id}", body.fact,
        {"origin": f"kyc:update:{body.address_id}", "summary": body.fact,
         "payload": {"address": body.address_id, **row}, "cypher": occ["sql"]})
    events.publish("kyc_update", db.CONSORTIUM, body.address_id,
                   {"fact": body.fact, "cases": len(results)})
    return {"fact": body.fact, "affected": results,
            "totals": {k: sum(len(r[k]) for r in results)
                       for k in ("claims", "actions", "sentences", "sars")}}


@router.get("/echo")
def echo_overview():
    out = []
    for g in db.list_graphs():
        if g.startswith("case_"):
            for r in db.ro(g, ECHO_OVERVIEW):
                out.append({**r, "case_id": g[5:]})
    return {"claims": out}


@router.get("/states")
def states():
    out: dict[str, dict[str, int]] = {}
    for g in db.list_graphs():
        if g.startswith("case_"):
            for r in db.ro(g, STATE_COUNTS):
                key = f"{r['label']}:{r['state']}"
                out[key] = out.get(key, 0) + r["n"]
    return {"states": out}


@router.get("/kyc_candidates")
def kyc_candidates():
    """Shared addresses that agents are currently relying on (for the demo button)."""
    seen: dict[str, int] = {}
    for g in db.list_graphs():
        if not g.startswith("case_"):
            continue
        for r in db.ro(g, "MATCH (e:Evidence {kind:'shared_attr'}) WHERE e.state <> 'superseded' "
                          "AND e.origin STARTS WITH 'attr:A' RETURN e.origin AS o"):
            seen[r["o"][5:]] = seen.get(r["o"][5:], 0) + 1
    return {"addresses": sorted(seen.items(), key=lambda x: -x[1])}
