"""KYC lookups against Postgres (banks keep identity data in relational systems).

Fixed, parameterized SQL tools (the documented fallback for QueryWeaver). Each result
returns the SQL used so the UI can show exactly what was asked.
"""
from __future__ import annotations

import psycopg
from psycopg.rows import dict_row

from app.config import get_settings

BY_ACCOUNT = """SELECT customer_id, name, dob, address_id, address_text, address_units,
       onboarding_date, occupation, risk_rating, bank_id, customer_type
FROM kyc_customers WHERE account_id = %(account_id)s"""

ADDRESS_OCCUPANCY = """SELECT address_id, max(address_text) AS address_text,
       max(address_units) AS units, count(*) AS registered_customers,
       count(DISTINCT bank_id) AS banks
FROM kyc_customers WHERE address_id = %(address_id)s GROUP BY address_id"""

SAME_NAME = """SELECT customer_id, name, bank_id, account_id, onboarding_date
FROM kyc_customers WHERE lower(name) = lower(%(name)s)"""

QUERIES = {"kyc_by_account": BY_ACCOUNT, "kyc_address_occupancy": ADDRESS_OCCUPANCY,
           "kyc_same_name": SAME_NAME}


def _run(sql: str, params: dict) -> list[dict]:
    try:
        with psycopg.connect(get_settings().postgres_url, row_factory=dict_row,
                             connect_timeout=5) as conn:
            rows = conn.execute(sql, params).fetchall()
    except psycopg.Error as exc:
        return [{"error": str(exc)[:200]}]
    return [{k: (str(v) if hasattr(v, "isoformat") else v) for k, v in r.items()} for r in rows]


def kyc_by_account(account_id: str) -> dict:
    return {"result": _run(BY_ACCOUNT, {"account_id": account_id}), "sql": BY_ACCOUNT}


def address_occupancy(address_id: str) -> dict:
    return {"result": _run(ADDRESS_OCCUPANCY, {"address_id": address_id}),
            "sql": ADDRESS_OCCUPANCY}


def same_name(name: str) -> dict:
    return {"result": _run(SAME_NAME, {"name": name}), "sql": SAME_NAME}
