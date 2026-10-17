"""Scores for the evaluation page's threshold explorer, on the live demo slice.

The headline E1 table comes from the IBM HI-Small 20-bank evaluation graphs. This script
applies the deployed triage model (backend/detection/triage_weights.json, trained on the E1
dev split) to every alerted account of the live 6-bank slice and writes one row per account:
[model probability, hand score, rules fired, illicit]. It changes no weights or results.
"""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor

from common import RESULTS, commit, ground_truth


def main(workers: int = 8) -> None:
    from agents import triage
    from app import db
    gt = ground_truth(db.PREFIX)
    illicit = set(gt["illicit_accounts"])
    alerts = db.ro_all(db.CONSORTIUM, "MATCH (al:Alert) WHERE al.source IS NULL "
                                      "RETURN al.account_id AS a, al.rule AS rule ORDER BY a "
                                      "SKIP $skip LIMIT $limit")
    rules: dict[str, set] = {}
    for a in alerts:
        rules.setdefault(a["a"], set()).add(a["rule"])

    def score(a):
        s = triage.signals(a)
        return [triage.model_probability(triage.features(a, s)) or 0.0, triage.risk_score(s)]

    t0 = time.time()
    accts = sorted(rules)
    with ThreadPoolExecutor(workers) as ex:
        scores = list(ex.map(score, accts))
    rows = sorted(([round(p, 5), round(h, 3), len(rules[a]), int(a in illicit)]
                   for a, (p, h) in zip(accts, scores)), key=lambda r: -r[0])
    cutoff = triage._cutoff()
    out = {"dataset": f"live demo slice ({len(gt['banks'])} banks), deployed triage model",
           "commit": commit(), "threshold": round(cutoff if cutoff is not None else 0.818, 4),
           "threshold_source": "alert-budget calibration stored in the consortium Meta node",
           "hand_cutoff": 2.5, "rules_k": 3, "illicit": sum(r[3] for r in rows),
           "seconds": round(time.time() - t0, 1), "rows": rows}
    (RESULTS / "E1_test_scores.json").write_text(json.dumps(out, separators=(",", ":")))
    print({k: v for k, v in out.items() if k != "rows"}, len(rows))


if __name__ == "__main__":
    main()
