from fastapi import APIRouter, HTTPException

from app import db
from app.cypher import cy

router = APIRouter(prefix="/alerts", tags=["alerts"])

LIST = cy("api_alerts_list", "Alert queue with status and decision", """
MATCH (al:Alert) WHERE $status IS NULL OR al.status = $status
OPTIONAL MATCH (al)-[:DECIDED]->(d:Decision)
RETURN al.id AS id, al.account_id AS account, al.bank_id AS bank, al.rule AS rule,
       al.reason AS reason, al.status AS status, al.ts AS ts, al.case_id AS case_id,
       al.reason_cleared AS cleared_reason, al.decided_at AS decided_at
ORDER BY coalesce(al.decided_at, 0) DESC, al.ts DESC
SKIP $skip LIMIT $limit
""")

COUNTS = cy("api_alerts_counts", "Alert counts by status", """
MATCH (al:Alert) RETURN al.status AS status, count(al) AS n
""")

ONE = cy("api_alert_detail", "One alert with triage signals", """
MATCH (al:Alert {id:$id})
RETURN al.id AS id, al.account_id AS account, al.bank_id AS bank, al.rule AS rule,
       al.reason AS reason, al.status AS status, al.ts AS ts, al.case_id AS case_id,
       al.reason_cleared AS cleared_reason, al.signals AS signals
""")


@router.get("")
def list_alerts(status: str | None = None, limit: int = 200, skip: int = 0):
    rows = db.ro(db.CONSORTIUM, LIST, {"status": status, "limit": limit, "skip": skip})
    counts = {r["status"]: r["n"] for r in db.ro(db.CONSORTIUM, COUNTS)}
    return {"alerts": rows, "counts": counts, "total": sum(counts.values())}


@router.get("/{alert_id}")
def get_alert(alert_id: str):
    rows = db.ro(db.CONSORTIUM, ONE, {"id": alert_id})
    if not rows:
        raise HTTPException(404, "alert not found")
    return {**rows[0], "cypher": {"triage_tools": ["algo_wcc_component_of", "motif_read_score",
                                                   "identity_cross_bank_links",
                                                   "typology_shared_identity"]}}
