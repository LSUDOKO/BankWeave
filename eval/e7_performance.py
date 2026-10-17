"""E7 - tool latency on the consortium graph and on case graphs (this machine)."""
from __future__ import annotations

import argparse
import os
import platform
import random
import statistics
import time

from common import write


def main(n: int) -> None:
    from agents import tools
    from app import db

    accts = [r["id"] for r in db.ro(db.CONSORTIUM, "MATCH (a:Account) WHERE a.out_deg > 2 "
                                                   "RETURN a.id AS id LIMIT 3000")]
    rng = random.Random(5)
    ctx = tools.Ctx(graph=db.CONSORTIUM, record=False)
    calls = {
        "expand_neighborhood": lambda a: tools.REGISTRY["expand_neighborhood"].fn(ctx, account_id=a),
        "typology_patterns": lambda a: tools.REGISTRY["typology_patterns"].fn(ctx, account_id=a),
        "cross_bank_links": lambda a: tools.REGISTRY["cross_bank_links"].fn(ctx, account_id=a),
        "shared_identity": lambda a: tools.REGISTRY["shared_identity"].fn(ctx, account_id=a),
        "behavior_neighbors": lambda a: tools.REGISTRY["behavior_neighbors"].fn(ctx, account_id=a),
        "passthrough_check": lambda a: tools.REGISTRY["passthrough_check"].fn(ctx, account_id=a),
    }
    res = {}
    for name, fn in calls.items():
        lat = []
        for a in rng.sample(accts, min(n, len(accts))):
            t0 = time.perf_counter()
            fn(a)
            lat.append((time.perf_counter() - t0) * 1000)
        lat.sort()
        res[name] = {"median_ms": round(statistics.median(lat), 1),
                     "p95_ms": round(lat[int(0.95 * (len(lat) - 1))], 1), "calls": len(lat)}
    cases = db.case_graphs()[:20]
    for name in ("find_hub", "find_bridges", "find_orchestrator"):
        lat = []
        for g in cases:
            c = tools.Ctx(graph=g, record=False)
            t0 = time.perf_counter()
            tools.REGISTRY[name].fn(c)
            lat.append((time.perf_counter() - t0) * 1000)
        if lat:
            lat.sort()
            res[f"{name}_case_graph"] = {"median_ms": round(statistics.median(lat), 1),
                                         "p95_ms": round(lat[int(0.95 * (len(lat) - 1))], 1),
                                         "calls": len(lat)}
    for name, q in [("pagerank_consortium", "CALL algo.pageRank('Account','TRANSFERS') YIELD node "
                                            "RETURN count(node) AS n"),
                    ("wcc_consortium", "CALL algo.wcc({nodeLabels:['Account'], "
                                       "relationshipTypes:['TRANSFERS']}) YIELD node "
                                       "RETURN count(node) AS n")]:
        t0 = time.perf_counter()
        db.ro(db.CONSORTIUM, q)
        res[name] = {"ms": round((time.perf_counter() - t0) * 1000, 1)}
    size = db.ro(db.CONSORTIUM, "MATCH (a:Account) WITH count(a) AS n MATCH ()-[t:TRANSFERS]->() "
                                "RETURN n AS accounts, count(t) AS transfers")[0]
    write("E7_performance", db.PREFIX or "demo",
          {"samples_per_tool": n, **size, "machine": platform.processor() or platform.machine(),
           "cpus": os.cpu_count(), "falkordb": "docker falkordb/falkordb:latest (4.22.1)"},
          res, ["Single local machine; no comparison with other databases was run."])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=100)
    a = ap.parse_args()
    main(a.n)
