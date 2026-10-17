"""Offline precompute: store graph-wide scores on Account nodes in FalkorDB.

Agents then read cheap properties instead of re-running whole-graph algorithms per alert.
"""
from __future__ import annotations

import json
import time

from app import db
from app.cypher import cy
from detection import motif_seeds, passthrough
from detection.settings import cfg

STORE_PAGERANK = cy("precompute_pagerank", "Store global PageRank on every account", """
CALL algo.pageRank('Account', 'TRANSFERS') YIELD node, score
SET node.pagerank = score
RETURN count(node) AS n
""")

STORE_WCC = cy("precompute_wcc", "Store component id and size on every account", """
CALL algo.wcc({nodeLabels:['Account'], relationshipTypes:['TRANSFERS']})
YIELD node, componentId
WITH componentId, collect(node) AS ns
UNWIND ns AS n
SET n.component = componentId, n.component_size = size(ns)
RETURN count(n) AS n
""")

STORE_COMMUNITY = cy("precompute_label_propagation", "Store community id and size", """
CALL algo.labelPropagation({nodeLabels:['Account'], relationshipTypes:['FLOWS'],
                            maxIterations:$iters})
YIELD node, communityId
WITH communityId, collect(node) AS ns
UNWIND ns AS n
SET n.community = communityId, n.community_size = size(ns)
RETURN count(n) AS n
""")


def run(graph: str = db.CONSORTIUM) -> dict:
    t0 = time.time()
    out = {
        "pagerank": db.q(graph, STORE_PAGERANK, timeout=300000)[0]["n"],
        "wcc": db.q(graph, STORE_WCC, timeout=300000)[0]["n"],
        "community": db.q(graph, STORE_COMMUNITY,
                          {"iters": cfg()["algorithms"]["label_propagation_iterations"]},
                          timeout=300000)[0]["n"],
        "motif": motif_seeds.compute_and_store(graph),
        "passthrough": passthrough.scan(graph),
    }
    out["seconds"] = round(time.time() - t0, 2)
    db.q(graph, "MERGE (m:Meta {id:'precompute'}) SET m.json = $j", {"j": json.dumps(out)})
    return out


if __name__ == "__main__":
    print(run())
