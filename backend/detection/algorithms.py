"""Native FalkorDB graph algorithms (CALL algo.*) wrapped as investigation tools.

Syntax verified live against FalkorDB 4.22 (see docs/QUERIES.md). Every function returns
{"result", "cypher", "params"}.
"""
from __future__ import annotations

from app import db
from app.cypher import cy
from detection.settings import cfg

WCC = cy("algo_wcc_islands", "Weakly connected components: islands clear instantly", """
CALL algo.wcc({nodeLabels:['Account'], relationshipTypes:['TRANSFERS']})
YIELD node, componentId
WITH componentId, collect(node.id) AS ids, collect(DISTINCT node.bank_id) AS banks
RETURN componentId, size(ids) AS size, size(banks) AS n_banks, ids[0..50] AS sample
ORDER BY size DESC
""")

WCC_OF = cy("algo_wcc_component_of", "Component id and size for one account", """
CALL algo.wcc({nodeLabels:['Account'], relationshipTypes:['TRANSFERS']})
YIELD node, componentId
WITH componentId, collect(node.id) AS ids, collect(DISTINCT node.bank_id) AS banks
WHERE $id IN ids
RETURN componentId, size(ids) AS size, size(banks) AS n_banks
""")

LABEL_PROP = cy("algo_label_propagation_rings", "Community detection: candidate rings", """
CALL algo.labelPropagation({nodeLabels:['Account'], relationshipTypes:['TRANSFERS'],
                            maxIterations:$iters})
YIELD node, communityId
WITH communityId, collect(node.id) AS members, collect(DISTINCT node.bank_id) AS banks
WHERE size(members) >= $min_size AND size(members) <= $max_size
RETURN communityId, members, banks, size(members) AS size
ORDER BY size DESC LIMIT $limit
""")

PAGERANK = cy("algo_pagerank_hub", "PageRank: collection hub where money pools", """
CALL algo.pageRank('Account', 'TRANSFERS') YIELD node, score
RETURN node.id AS account, node.bank_id AS bank, score
ORDER BY score DESC LIMIT $k
""")

BETWEENNESS = cy("algo_betweenness_bridges", "Betweenness: mule bridges between groups", """
CALL algo.betweenness({nodeLabels:['Account'], relationshipTypes:['TRANSFERS'],
                       samplingSize:$samples, samplingSeed:$seed})
YIELD node, score
RETURN node.id AS account, node.bank_id AS bank, score
ORDER BY score DESC LIMIT $k
""")

HARMONIC = cy("algo_harmonic_orchestrator", "Harmonic centrality: orchestrator candidates", """
CALL algo.HarmonicCentrality({nodeLabels:['Account'], relationshipTypes:['TRANSFERS']})
YIELD node, score, reachable
RETURN node.id AS account, node.bank_id AS bank, score, reachable
ORDER BY score DESC LIMIT $k
""")

SPPATHS = cy("algo_sppaths_trace_flow", "Shortest money paths between two accounts (evidence)", """
MATCH (s:Account {id:$src}), (d:Account {id:$dst})
CALL algo.SPpaths({sourceNode:s, targetNode:d, relTypes:['TRANSFERS'],
                   maxLen:$max_len, pathCount:$path_count, relDirection:$direction})
YIELD path, pathWeight
RETURN [n IN nodes(path) | n.id] AS accounts,
       [t IN relationships(path) | t.txn_id] AS txn_ids,
       [t IN relationships(path) | t.amount] AS amounts,
       pathWeight AS hops
""")

SSPATHS = cy("algo_sspaths_reach", "Where money from one account can reach", """
MATCH (s:Account {id:$src})
CALL algo.SSpaths({sourceNode:s, relTypes:['TRANSFERS'], maxLen:$max_len, pathCount:1})
YIELD path, pathWeight
WITH last(nodes(path)) AS n, pathWeight
RETURN n.id AS account, n.bank_id AS bank, min(pathWeight) AS hops
ORDER BY hops LIMIT $limit
""")

MAXFLOW = cy("algo_maxflow_money_at_risk", "Max flow: value movable from flagged accounts to hub", """
MATCH (s:Account) WHERE s.id IN $sources
WITH collect(s) AS srcs
MATCH (t:Account) WHERE t.id IN $targets
WITH srcs, collect(t) AS tgts
CALL algo.maxFlow({sourceNodes:srcs, targetNodes:tgts, relationshipTypes:['FLOWS'],
                   capacityProperty:'capacity', nodeLabels:['Account']})
YIELD maxFlow, edges, edgeFlows
RETURN maxFlow, [e IN edges | [startNode(e).id, endNode(e).id]] AS flow_edges, edgeFlows
""")

NEIGHBORHOOD = cy("neighborhood_expand", "Bounded undirected neighborhood (triage)", """
MATCH (a:Account {id:$id})-[t:TRANSFERS]-(b)
WITH a, collect(DISTINCT b)[0..$limit] AS hop1
UNWIND hop1 AS b
OPTIONAL MATCH (b)-[:TRANSFERS]-(c:Account) WHERE $depth >= 2 AND c <> a
WITH a, hop1, collect(DISTINCT c)[0..$limit] AS hop2
RETURN a.id AS center, [x IN hop1 | x.id] AS hop1, [x IN hop2 | x.id] AS hop2,
       [x IN hop1 + hop2 | x.bank_id] AS banks
""")

BFS = cy("algo_bfs_reach", "BFS from an account along outgoing transfers", """
MATCH (s:Account {id:$id})
CALL algo.bfs(s, $depth, 'TRANSFERS') YIELD nodes
RETURN [n IN nodes | n.id] AS reached
""")

MSF = cy("algo_msf_backbone", "Minimum spanning forest: simplified ring backbone for the UI", """
CALL algo.MSF({nodeLabels:['Account'], relationshipTypes:['TRANSFERS'],
               weightAttribute:'amount'})
YIELD edges
UNWIND edges AS e
RETURN startNode(e).id AS src, endNode(e).id AS dst, e.txn_id AS txn_id, e.amount AS amount
""")


def _r(result, cypher, params):
    return {"result": result, "cypher": cypher, "params": params}


def find_islands(graph: str, limit: int = 20) -> dict:
    rows = db.ro(graph, WCC)
    small = sum(1 for r in rows if r["size"] < cfg()["triage"]["clear_if_component_size_below"])
    return _r({"components": rows[:limit], "n_components": len(rows), "n_small": small}, WCC, {})


def component_of(graph: str, account_id: str) -> dict:
    p = {"id": account_id}
    rows = db.ro(graph, WCC_OF, p)
    return _r(rows[0] if rows else None, WCC_OF, p)


def find_rings(graph: str, max_iter: int | None = None, min_size: int = 3,
               max_size: int = 60, limit: int = 20) -> dict:
    p = {"iters": max_iter or cfg()["algorithms"]["label_propagation_iterations"],
         "min_size": min_size, "max_size": max_size, "limit": limit}
    return _r(db.ro(graph, LABEL_PROP, p), LABEL_PROP, p)


def find_hub(graph: str, top_k: int = 5) -> dict:
    p = {"k": top_k}
    return _r(db.ro(graph, PAGERANK, p), PAGERANK, p)


def find_bridges(graph: str, top_k: int = 5, seed: int | None = None) -> dict:
    a = cfg()["algorithms"]
    p = {"k": top_k, "samples": a["betweenness_sampling_size"],
         "seed": seed if seed is not None else a["betweenness_seed"]}
    return _r(db.ro(graph, BETWEENNESS, p), BETWEENNESS, p)


def find_orchestrator(graph: str, top_k: int = 5) -> dict:
    p = {"k": top_k}
    return _r(db.ro(graph, HARMONIC, p), HARMONIC, p)


def trace_flow(graph: str, src: str, dst: str, max_len: int = 6, path_count: int = 3,
               direction: str = "outgoing") -> dict:
    if direction not in ("outgoing", "incoming", "both"):
        raise ValueError("direction must be outgoing, incoming or both")
    p = {"src": src, "dst": dst, "max_len": max_len, "path_count": path_count,
         "direction": direction}
    return _r(db.ro(graph, SPPATHS, p), SPPATHS, p)


def reach(graph: str, src: str, max_len: int = 4, limit: int = 50) -> dict:
    p = {"src": src, "max_len": max_len, "limit": limit}
    return _r(db.ro(graph, SSPATHS, p), SSPATHS, p)


def money_at_risk(graph: str, sources: list[str], targets: list[str]) -> dict:
    p = {"sources": sources, "targets": targets}
    rows = db.ro(graph, MAXFLOW, p)
    res = rows[0] if rows else {"maxFlow": 0.0, "flow_edges": [], "edgeFlows": []}
    return _r(res, MAXFLOW, p)


def expand_neighborhood(graph: str, account_id: str, depth: int = 2, limit: int = 60) -> dict:
    depth = max(1, min(int(depth), 2))
    p = {"id": account_id, "depth": depth, "limit": limit}
    rows = db.ro(graph, NEIGHBORHOOD, p)
    res = rows[0] if rows else {"center": account_id, "hop1": [], "hop2": [], "banks": []}
    res["n_banks"] = len(set(res.get("banks") or []))
    return _r(res, NEIGHBORHOOD, p)


def bfs(graph: str, account_id: str, depth: int = 2) -> dict:
    p = {"id": account_id, "depth": max(1, min(int(depth), 4))}
    rows = db.ro(graph, BFS, p)
    return _r(rows[0]["reached"] if rows else [], BFS, p)


def backbone(graph: str) -> dict:
    return _r(db.ro(graph, MSF), MSF, {})
