"""Deployment calibration of triage: an alert budget, no labels.

The triage model was fitted on the evaluation graph's dev split. Some features are relative to
graph size (PageRank, community size), so a probability threshold doesn't transfer between
graphs. What transfers is the escalation rate the dev split chose. This scores every alerted
account in the current graph and sets the cutoff at that quantile - the way banks size an
alert queue to analyst capacity. The cutoff is stored in the graph (Meta {id:'triage_cutoff'}).
"""
from __future__ import annotations

import json
from concurrent.futures import ThreadPoolExecutor

from agents import triage
from app import db
from app.cypher import cy

ALERTED = cy("calibrate_alerted_accounts", "Distinct alerted accounts in the current graph", """
MATCH (al:Alert) RETURN DISTINCT al.account_id AS id ORDER BY id SKIP $skip LIMIT $limit
""")

STORE = cy("calibrate_store_cutoff", "Store the triage cutoff for this graph", """
MERGE (m:Meta {id:'triage_cutoff'}) SET m.json = $j
""")


def run(workers: int = 8) -> dict:
    w = triage._weights()
    if not w:
        return {"skipped": "no triage_weights.json"}
    accts = [r["id"] for r in db.ro_all(db.CONSORTIUM, ALERTED)]

    def score(a):
        s = triage.signals(a)
        return triage.model_probability(triage.features(a, s))

    with ThreadPoolExecutor(workers) as ex:
        ps = sorted((p for p in ex.map(score, accts) if p is not None), reverse=True)
    rate = w.get("escalation_rate", 0.05)
    k = max(1, int(round(rate * len(ps))))
    cutoff = ps[k - 1] if ps else w["threshold"]
    # the next band below the cutoff (same size as the budget) goes to the LLM for review
    llm_floor = ps[min(len(ps), 2 * k) - 1] if ps else cutoff
    out = {"cutoff": cutoff, "llm_floor": llm_floor, "escalation_rate": rate,
           "alerted_accounts": len(ps), "expected_escalations": k}
    db.q(db.CONSORTIUM, STORE, {"j": json.dumps(out)})
    triage._cutoff.cache_clear()
    return out


if __name__ == "__main__":
    print(run())
