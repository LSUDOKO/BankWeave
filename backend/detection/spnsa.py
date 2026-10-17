"""Shortest-path investigation subgraph (SPNSA) from a seed feed (arXiv 2610.13280).

For each seed s:
  1. out-ego network of radius r (FLOWS edges)            - Cypher
  2. copy it into a scratch graph                          - FalkorDB multigraph
  3. intermediaries = argmax betweenness, argmax PageRank  - algo.betweenness / algo.pageRank
     (PageRank stands in for eigenvector centrality, which FalkorDB doesn't ship)
  4. shortest paths s -> intermediaries and s -> other seeds inside the ego network
                                                           - algo.SPpaths
The union of all paths is the investigation subgraph handed to agents ("hunt mode").
"""
from __future__ import annotations

from app import db
from app.cypher import cy

EGO = cy("spnsa_out_ego", "Out-ego network of a seed (radius r, simple digraph)", """
MATCH p = (s:Account {id:$id})-[:FLOWS*1..2]->(x:Account)
WHERE length(p) <= $r
UNWIND relationships(p) AS f
RETURN DISTINCT startNode(f).id AS s, endNode(f).id AS d
LIMIT $limit
""")

SCRATCH_WRITE = cy("spnsa_scratch_write", "Write an ego network into the scratch graph", """
UNWIND $rows AS r
MERGE (a:Account {id:r.s})
MERGE (b:Account {id:r.d})
MERGE (a)-[:FLOWS]->(b)
""")

SCRATCH_BTW = cy("spnsa_scratch_betweenness", "Most central bridge inside the ego network", """
CALL algo.betweenness({nodeLabels:['Account'], relationshipTypes:['FLOWS']})
YIELD node, score RETURN node.id AS id, score ORDER BY score DESC LIMIT 1
""")

SCRATCH_PR = cy("spnsa_scratch_pagerank", "Most central sink inside the ego network", """
CALL algo.pageRank('Account', 'FLOWS') YIELD node, score
RETURN node.id AS id, score ORDER BY score DESC LIMIT 1
""")

SCRATCH_SP = cy("spnsa_scratch_sppaths", "Shortest path seed -> target inside the ego network", """
MATCH (s:Account {id:$s}), (t:Account {id:$t})
CALL algo.SPpaths({sourceNode:s, targetNode:t, relTypes:['FLOWS'], maxLen:$max_len,
                   pathCount:1})
YIELD path
RETURN [n IN nodes(path) | n.id] AS nodes
""")

SCRATCH = "spnsa_scratch"


def subgraph(graph: str, seeds: list[str], r: int = 1, ego_limit: int = 2000) -> dict:
    if r not in (1, 2):
        raise ValueError("r must be 1 or 2")
    seed_set = set(seeds)
    union: set[str] = set()
    paths: list[list[str]] = []
    for s in seeds:
        edges = db.ro(graph, EGO, {"id": s, "r": r, "limit": ego_limit})
        union.add(s)
        if not edges:
            continue
        ego_nodes = {e["s"] for e in edges} | {e["d"] for e in edges}
        db.drop_graph(SCRATCH)
        db.q(SCRATCH, SCRATCH_WRITE, {"rows": edges})
        targets = set()
        for qy in (SCRATCH_BTW, SCRATCH_PR):
            row = db.ro(SCRATCH, qy)
            if row and row[0]["id"] != s:
                targets.add(row[0]["id"])
        targets |= (seed_set & ego_nodes) - {s}
        for t in targets:
            for row in db.ro(SCRATCH, SCRATCH_SP, {"s": s, "t": t, "max_len": r + 1}):
                paths.append(row["nodes"])
                union.update(row["nodes"])
    db.drop_graph(SCRATCH)
    return {"nodes": sorted(union), "paths": paths, "n_seeds": len(seeds),
            "cypher": [EGO, SCRATCH_BTW, SCRATCH_PR, SCRATCH_SP]}
