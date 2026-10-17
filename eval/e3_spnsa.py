"""E3 - hunt mode: reproduce the SPNSA feed comparison (arXiv 2610.13280) inside FalkorDB.

Seed feeds: motif-coherent vs degree-imbalance vs random (mean over runs).
Metric: illicit ratio (IR) of the shortest-path investigation subgraph, and its size.
Paper, IBM HI-Small, k=200, r=1: random ~2.4%, degree 13.7%, motif 22.6% (Table).
"""
from __future__ import annotations

import argparse
import statistics
import time

from common import ground_truth, write


def main(k: int, r: int, random_runs: int) -> None:
    from app import db
    from detection import motif_seeds as ms
    from detection import spnsa

    gt = ground_truth(db.PREFIX)
    illicit = set(gt["illicit_accounts"])
    n_acc = db.ro(db.CONSORTIUM, "MATCH (a:Account) RETURN count(a) AS c")[0]["c"]
    res = {}
    for method in ("motif", "degree"):
        t0 = time.time()
        sub = spnsa.subgraph(db.CONSORTIUM, ms.seeds_from_graph(db.CONSORTIUM, k, method), r)
        nodes = sub["nodes"]
        res[method] = {"nodes": len(nodes), "illicit": sum(x in illicit for x in nodes),
                       "illicit_ratio": round(sum(x in illicit for x in nodes) / max(1, len(nodes)), 4),
                       "seconds": round(time.time() - t0, 1)}
    irs, sizes = [], []
    for i in range(random_runs):
        sub = spnsa.subgraph(db.CONSORTIUM, ms.seeds_from_graph(db.CONSORTIUM, k, "random", i), r)
        nodes = sub["nodes"]
        irs.append(sum(x in illicit for x in nodes) / max(1, len(nodes)))
        sizes.append(len(nodes))
    res["random"] = {"nodes": round(statistics.mean(sizes), 1),
                     "illicit_ratio": round(statistics.mean(irs), 4),
                     "illicit_ratio_sd": round(statistics.pstdev(irs), 4), "runs": random_runs}
    res["base_rate"] = round(len(illicit & set(
        x["id"] for x in db.ro_all(db.CONSORTIUM, "MATCH (a:Account) RETURN a.id AS id ORDER BY id "
                                        "SKIP $skip LIMIT $limit"))) / n_acc, 4)
    res["paper_hi_small_k200_r1"] = {"random": 0.024, "degree": 0.137, "motif": 0.226}
    write("E3_spnsa_hunt", db.PREFIX or "demo", {"k": k, "r": r, "accounts": n_acc}, res,
          ["We use FalkorDB PageRank in place of eigenvector centrality (not available natively).",
           "Our graph is the top-20-bank consortium slice of HI-Small, not the paper's full "
           "largest WCC, so absolute ratios are not directly comparable."])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--k", type=int, default=200)
    ap.add_argument("--r", type=int, default=1)
    ap.add_argument("--random-runs", type=int, default=10)
    a = ap.parse_args()
    main(a.k, a.r, a.random_runs)
