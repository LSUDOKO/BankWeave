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
