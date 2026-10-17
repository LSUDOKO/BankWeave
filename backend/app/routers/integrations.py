"""Optional external integrations with keyless fallbacks: sanctions screening."""
from fastapi import APIRouter, HTTPException

from app import db
from app.services import sanctions

router = APIRouter(prefix="/integrations", tags=["integrations"])


@router.get("/sanctions/screen")
def screen(name: str, schema: str = "Person"):
    if not 2 <= len(name) <= 120:
        raise HTTPException(400, "name length 2-120")
    return sanctions.screen(name, schema)


@router.get("/sanctions/case/{case_id}")
def screen_case(case_id: str):
    ids = [r["id"] for r in db.ro(db.CONSORTIUM, "MATCH (:Case {id:$id})-[:CONCERNS]->(a:Account) "
                                                 "RETURN a.id AS id", {"id": case_id})]
    if not ids:
        raise HTTPException(404, "case not found or has no accounts")
    return {"case_id": case_id, **sanctions.screen_accounts(db.CONSORTIUM, ids)}


@router.get("/crypto/offramps")
def crypto_offramps(limit: int = 25):
    from app.services import crypto_bridge
    return crypto_bridge.offramps(min(limit, 100))


@router.get("/crypto/{chain}/{address}")
def crypto_lookup(chain: str, address: str):
    from app.services import crypto_bridge
    return crypto_bridge.lookup(chain, address)


from pydantic import BaseModel  # noqa: E402


class ChainLink(BaseModel):
    case_id: str
    account: str
    chain: str
    address: str


@router.post("/crypto/link")
def crypto_link(body: ChainLink):
    from app.services import crypto_bridge
    if db.case_graph(body.case_id) not in db.list_graphs():
        raise HTTPException(404, "case not found")
    return crypto_bridge.link(body.case_id, body.account, body.chain, body.address)
