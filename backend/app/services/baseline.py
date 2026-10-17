"""Rule-based alert generator: what a legacy monitoring system does.

These alerts form the queue the agents triage, and the "escalate everything" baseline
in evaluation. Rules (per account, deduplicated):
  R1 large_transfer        any transfer above the reporting threshold
  R2 near_threshold_burst  >= 3 transfers within 24h in [0.85*thr, thr)
  R3 new_counterparty_big  first-ever transfer to a counterparty, amount >= 0.5*thr
  R4 high_risk_format      Cash / Bitcoin transfer >= 0.3*thr
"""
from __future__ import annotations

import hashlib

from app import db, events
from app.cypher import cy
from detection.settings import cfg

R1 = cy("baseline_r1_large_transfer", "Baseline rule: transfer above threshold", """
MATCH (a:Account)-[t:TRANSFERS]->()
WHERE t.amount > $thr
RETURN a.id AS account, a.bank_id AS bank, min(t.ts) AS ts, count(t) AS hits
""")

R2 = cy("baseline_r2_near_threshold", "Baseline rule: bursts just under threshold", """
MATCH (a:Account)-[t:TRANSFERS]->()
WHERE t.amount >= $thr * 0.85 AND t.amount < $thr
WITH a, t ORDER BY t.ts
WITH a, collect(t.ts) AS ts
WHERE size(ts) >= 3
RETURN a.id AS account, a.bank_id AS bank, ts
""")

R3 = cy("baseline_r3_new_counterparty", "Baseline rule: first transfer to a new counterparty, large", """
MATCH (a:Account)-[f:FLOWS]->(b:Account)
WHERE f.n_txn = 1 AND f.capacity >= $thr * 0.5
MATCH (a)-[t:TRANSFERS]->(b)
RETURN a.id AS account, a.bank_id AS bank, min(t.ts) AS ts, count(DISTINCT b) AS hits
""")

R4 = cy("baseline_r4_high_risk_format", "Baseline rule: cash / crypto above 30% of threshold", """
MATCH (a:Account)-[t:TRANSFERS]->()
WHERE t.format IN ['Cash', 'Bitcoin'] AND t.amount >= $thr * 0.3
RETURN a.id AS account, a.bank_id AS bank, min(t.ts) AS ts, count(t) AS hits
""")

WRITE_ALERTS = cy("alerts_write", "Create Alert nodes linked to their account", """
UNWIND $rows AS r
MATCH (a:Account {id:r.account})
MERGE (al:Alert {id:r.id})
ON CREATE SET al.account_id = r.account, al.bank_id = r.bank, al.rule = r.rule,
              al.ts = r.ts, al.status = 'open', al.reason = r.reason, al.hits = r.hits
MERGE (al)-[:RAISED_FOR]->(a)
""")

CLEAR_ALERTS = cy("alerts_clear_all", "Remove all alerts (demo reset)", """
MATCH (al:Alert) DETACH DELETE al
""")


def _id(account: str, rule: str) -> str:
    return "AL-" + hashlib.sha1(f"{account}|{rule}".encode()).hexdigest()[:8].upper()


def generate(graph: str = db.CONSORTIUM, reset: bool = True) -> dict:
    thr = float(cfg()["reporting_threshold"])
    if reset:
        db.q(graph, CLEAR_ALERTS)
    db.try_query(graph, "CREATE INDEX FOR (al:Alert) ON (al.id)")
    db.try_query(graph, "CREATE INDEX FOR (al:Alert) ON (al.status)")
    rows: list[dict] = []
    for r in db.ro(graph, R1, {"thr": thr}):
        rows.append({**r, "rule": "large_transfer",
                     "reason": f"{r['hits']} transfer(s) above {thr:,.0f}"})
    for r in db.ro(graph, R2, {"thr": thr}):
        ts = r["ts"]
        burst = max(sum(1 for y in ts if 0 <= y - x <= 86400) for x in ts)
        if burst >= 3:
            rows.append({"account": r["account"], "bank": r["bank"], "ts": ts[0], "hits": burst,
                         "rule": "near_threshold_burst",
                         "reason": f"{burst} near-threshold transfers within 24h"})
    for r in db.ro(graph, R3, {"thr": thr}):
        rows.append({**r, "rule": "new_counterparty_big",
                     "reason": f"large first transfer to {r['hits']} new counterparty(ies)"})
    for r in db.ro(graph, R4, {"thr": thr}):
        rows.append({**r, "rule": "high_risk_format",
                     "reason": f"{r['hits']} cash/crypto transfer(s)"})
    for r in rows:
        r["id"] = _id(r["account"], r["rule"])
    db.q(graph, WRITE_ALERTS, {"rows": rows})
    by_rule: dict[str, int] = {}
    for r in rows:
        by_rule[r["rule"]] = by_rule.get(r["rule"], 0) + 1
    events.publish("alert", graph, "batch", {"count": len(rows), "by_rule": by_rule})
    return {"alerts": len(rows), "accounts": len({r["account"] for r in rows}),
            "by_rule": by_rule}


if __name__ == "__main__":
    print(generate())
