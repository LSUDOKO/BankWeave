"""E1 - alert triage vs baselines (account level), time-based dev/test split.

baseline_escalate_all   : what rule-based monitoring does today (every alerted account escalated)
no_graph_rules          : escalate accounts that trip >= k rules (own-account features, no graph)
graph_hand_weights      : Triage's hand-weighted graph risk score; cutoff tuned on dev (no labels
                          used for the weights)
graph_calibrated        : logistic model over Triage's graph feature vector, fitted on the dev
                          split only; threshold tuned on dev; evaluated on test. The fitted weights
                          are written to backend/detection/triage_weights.json and used by the agent.
"""
from __future__ import annotations

import argparse
import json
import random
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from common import ROOT, commit, ground_truth, prf, write


def fit_logistic(X: np.ndarray, y: np.ndarray, l2: float = 1.0, iters: int = 3000,
                 lr: float = 0.1) -> tuple[np.ndarray, float]:
    """Class-balanced L2 logistic regression by gradient descent (standardised X)."""
    n, d = X.shape
    w, b = np.zeros(d), 0.0
    pos = max(1, y.sum())
    sw = np.where(y == 1, n / (2 * pos), n / (2 * max(1, n - pos)))
    for _ in range(iters):
        p = 1 / (1 + np.exp(-(X @ w + b)))
        g = (p - y) * sw
        w -= lr * (X.T @ g / n + l2 * w / n)
        b -= lr * g.mean()
    return w, b


def best_threshold(p: np.ndarray, y: np.ndarray) -> tuple[float, dict]:
    best = (0.5, prf(0, 0, int(y.sum())))
    for t in np.unique(np.round(p, 3)):
        pred = p >= t
        m = prf(int((pred & (y == 1)).sum()), int((pred & (y == 0)).sum()),
                int((~pred & (y == 1)).sum()))
        if m["f1"] > best[1]["f1"]:
            best = (float(t), m)
    return best


def main(sample: int, seed: int, workers: int) -> None:
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
    rng = random.Random(seed)
    dev = sorted(k for k, v in by_acct.items() if v["ts"] < split)
    test = sorted(k for k, v in by_acct.items() if v["ts"] >= split)
    dev = rng.sample(dev, min(sample, len(dev)))
    test = rng.sample(test, min(sample, len(test)))

    def compute(a):
        t0 = time.time()
        s = triage.signals(a)
        return a, triage.risk_score(s), triage.features(a, s), time.time() - t0

    t0 = time.time()
    with ThreadPoolExecutor(workers) as ex:
        rows = {a: (r, f, dt) for a, r, f, dt in ex.map(compute, dev + test)}
    wall = time.time() - t0
    keys = sorted(next(iter(rows.values()))[1])

    def mat(accts):
        X = np.array([[rows[a][1][k] for k in keys] for a in accts], dtype=float)
        y = np.array([1 if a in illicit else 0 for a in accts])
        return X, y

    Xd, yd = mat(dev)
    Xt, yt = mat(test)
    mu, sd = Xd.mean(0), Xd.std(0)
    sd[sd == 0] = 1
    w, b = fit_logistic((Xd - mu) / sd, yd)
    pd_ = 1 / (1 + np.exp(-(((Xd - mu) / sd) @ w + b)))
    pt = 1 / (1 + np.exp(-(((Xt - mu) / sd) @ w + b)))
    thr, dev_cal = best_threshold(pd_, yd)
    pred = pt >= thr
    cal = prf(int((pred & (yt == 1)).sum()), int((pred & (yt == 0)).sum()),
              int((~pred & (yt == 1)).sum()))
    n = len(test)
    cal["escalated"] = int(pred.sum())
    cal["alert_reduction"] = round(1 - cal["escalated"] / n, 4)
    order = np.argsort(-pt)
    k = max(1, int(0.05 * n))  # precision among the top 5% the model ranks highest
    cal["precision_at_top_5pct"] = round(float(yt[order[:k]].mean()), 4)

    (ROOT / "backend" / "detection" / "triage_weights.json").write_text(json.dumps({
        "bias": float(b), "threshold": thr,
        "coef": {k_: float(v) for k_, v in zip(keys, w)},
        "mean": {k_: float(v) for k_, v in zip(keys, mu)},
        "std": {k_: float(v) for k_, v in zip(keys, sd)},
        "trained_on": f"E1 dev split ({len(dev)} alerted accounts before ts {split}), "
                      f"{db.PREFIX or 'demo'} graph, commit {commit()}"}, indent=2))

    cutoffs = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]

    def ev(accts, c):
        tp = sum(1 for a in accts if rows[a][0] >= c and a in illicit)
        fp = sum(1 for a in accts if rows[a][0] >= c and a not in illicit)
        fn = sum(1 for a in accts if rows[a][0] < c and a in illicit)
        return prf(tp, fp, fn)
    hand_c = max(cutoffs, key=lambda c: (ev(dev, c)["f1"], -c))
    hand = ev(test, hand_c)
    hand["escalated"] = sum(1 for a in test if rows[a][0] >= hand_c)
    hand["alert_reduction"] = round(1 - hand["escalated"] / n, 4)

    ill_n = int(yt.sum())
    base = prf(ill_n, n - ill_n, 0)
    base.update({"escalated": n, "alert_reduction": 0.0})

    def rules_eval(accts, kk):
        return prf(sum(1 for a in accts if len(by_acct[a]["rules"]) >= kk and a in illicit),
                   sum(1 for a in accts if len(by_acct[a]["rules"]) >= kk and a not in illicit),
                   sum(1 for a in accts if len(by_acct[a]["rules"]) < kk and a in illicit))
    k_best = max((1, 2, 3), key=lambda kk: rules_eval(dev, kk)["f1"])
    ng = rules_eval(test, k_best)
    ng["escalated"] = sum(1 for a in test if len(by_acct[a]["rules"]) >= k_best)
    ng["alert_reduction"] = round(1 - ng["escalated"] / n, 4)

    top = sorted(zip(keys, w), key=lambda kv: -abs(kv[1]))[:8]
    write("E1_alert_triage", db.PREFIX or "demo",
          {"sample_per_split": sample, "seed": seed, "alerts_total": gen["alerts"],
           "alerted_accounts": len(by_acct), "dev_accounts": len(dev), "test_accounts": n,
           "illicit_in_dev": int(yd.sum()), "illicit_in_test": ill_n, "split_ts": split,
           "hand_cutoff_tuned_on_dev": hand_c, "model_threshold_tuned_on_dev": round(thr, 4),
           "no_graph_rules_k": k_best, "features": len(keys),
           "mean_signal_seconds": round(float(np.mean([r[2] for r in rows.values()])), 4),
           "wall_seconds": round(wall, 1), "workers": workers},
          {"baseline_escalate_all": base, "no_graph_rules": ng, "graph_hand_weights": hand,
           "graph_calibrated": cal, "dev_calibrated": dev_cal,
           "top_model_weights": {k_: round(float(v), 3) for k_, v in top}},
          ["Account level: an account is illicit if it is an endpoint of >=1 laundering "
           "transaction (IBM labels).",
           "Dev = alerted accounts whose first alert falls in the earlier half of the period; "
           "test = the later half. Weights and thresholds come from dev only.",
           "graph_calibrated uses labels from the dev split to fit 41 feature weights; "
           "graph_hand_weights uses none.",
           "These rows evaluate the graph decision; the LLM only reviews scores near the "
           "threshold in the live agent and is not part of these numbers."])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample", type=int, default=4000)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--workers", type=int, default=8)
    a = ap.parse_args()
    main(a.sample, a.seed, a.workers)
