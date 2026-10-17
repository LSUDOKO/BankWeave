"""E1 - alert triage vs baselines (account level), time-based dev/test split.

baseline_escalate_all : what rule-based monitoring does today (every alerted account escalated)
no_graph_rules        : escalate accounts that trip >= k rules (own-account features, no graph)
bankweave_triage      : Triage agent signals from the graph; cutoff tuned on dev only
"""
from __future__ import annotations

import argparse
import random
import time

from common import ground_truth, prf, write


def main(sample: int, seed: int) -> None:
    from agents import triage
    from app import db
    from app.services import baseline

    gt = ground_truth(db.PREFIX)
    illicit = set(gt["illicit_accounts"])
    gen = baseline.generate(db.CONSORTIUM)
    alerts = db.ro_all(db.CONSORTIUM, "MATCH (al:Alert) RETURN al.id AS id, al.account_id AS a, "
                                      "al.ts AS ts, al.rule AS rule ORDER BY id "
                                      "SKIP $skip LIMIT $limit")
    ts = sorted(a["ts"] for a in alerts)
    split = ts[len(ts) // 2]
    by_acct: dict[str, dict] = {}
    for a in alerts:
        d = by_acct.setdefault(a["a"], {"rules": set(), "ts": a["ts"]})
        d["rules"].add(a["rule"])
        d["ts"] = min(d["ts"], a["ts"])
    dev = [k for k, v in by_acct.items() if v["ts"] < split]
    test = [k for k, v in by_acct.items() if v["ts"] >= split]
    rng = random.Random(seed)
    dev = rng.sample(dev, min(sample, len(dev)))
    test = rng.sample(test, min(sample, len(test)))

    def scores(accts):
        out, t0 = {}, time.time()
        for a in accts:
            out[a] = triage.risk_score(triage.signals(a))
        return out, (time.time() - t0) / max(1, len(accts))

    dev_s, _ = scores(dev)
    cutoffs = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]

    def evaluate(sc: dict, cut: float):
        tp = sum(1 for a, s in sc.items() if s >= cut and a in illicit)
        fp = sum(1 for a, s in sc.items() if s >= cut and a not in illicit)
        fn = sum(1 for a, s in sc.items() if s < cut and a in illicit)
        return prf(tp, fp, fn)

    tuning = {c: evaluate(dev_s, c) for c in cutoffs}
    best = max(cutoffs, key=lambda c: (tuning[c]["f1"], -c))
    test_s, per_alert = scores(test)
    bw = evaluate(test_s, best)
    n = len(test)
    bw["escalated"] = sum(1 for s in test_s.values() if s >= best)
    bw["alert_reduction"] = round(1 - bw["escalated"] / n, 4) if n else 0
    bw["mean_triage_seconds"] = round(per_alert, 4)

    ill_n = sum(1 for a in test if a in illicit)
    base = prf(ill_n, n - ill_n, 0)
    base.update({"escalated": n, "alert_reduction": 0.0})

    rule_cut = {k: prf(sum(1 for a in test if len(by_acct[a]["rules"]) >= k and a in illicit),
                       sum(1 for a in test if len(by_acct[a]["rules"]) >= k and a not in illicit),
                       sum(1 for a in test if len(by_acct[a]["rules"]) < k and a in illicit))
                for k in (1, 2, 3)}
    dev_rule = {k: prf(sum(1 for a in dev if len(by_acct[a]["rules"]) >= k and a in illicit),
                       sum(1 for a in dev if len(by_acct[a]["rules"]) >= k and a not in illicit),
                       sum(1 for a in dev if len(by_acct[a]["rules"]) < k and a in illicit))
                for k in (1, 2, 3)}
    k_best = max(dev_rule, key=lambda k: dev_rule[k]["f1"])
    ng = rule_cut[k_best]
    ng["escalated"] = sum(1 for a in test if len(by_acct[a]["rules"]) >= k_best)
    ng["alert_reduction"] = round(1 - ng["escalated"] / n, 4) if n else 0

    write("E1_alert_triage", gt.get("source", db.PREFIX or "demo"),
          {"sample_per_split": sample, "seed": seed, "cutoff_tuned_on_dev": best,
           "no_graph_rules_k": k_best, "alerts_total": gen["alerts"],
           "alerted_accounts": len(by_acct), "test_accounts": n, "illicit_in_test": ill_n,
           "split_ts": split},
          {"baseline_escalate_all": base, "no_graph_rules": ng, "bankweave_triage": bw,
           "dev_tuning": {str(c): tuning[c] for c in cutoffs}},
          ["Account-level: an account is illicit if it is an endpoint of >=1 laundering "
           "transaction (IBM labels).",
           "Cutoff chosen on the earlier half of alerts (dev); numbers reported on the later "
           "half (test).",
           "Triage here is the deterministic graph policy; the LLM decision path is not "
           "evaluated in this run."])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=1500)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    main(a.sample, a.seed)
