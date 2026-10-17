"""Motif suspicion score + coherent seed selection (arXiv 2610.13280).

s(v) = log(1+cycle3) + a*log(1+recip) + b*log(1+relay) + s_in*log(1+fanin)
     + s_out*log(1+fanout) + s_leaf*log(1+leaf) - g*log(1+deg)

Computed on the simple directed graph (FLOWS edges, one per ordered pair), from local
structure only - no labels. Scores are written back to Account.motif_score so every
other tool (and the UI) reads them from FalkorDB.
"""
from __future__ import annotations

import math
from collections import defaultdict

from app import db
from app.cypher import cy
from detection.settings import cfg

ADJACENCY = cy("motif_adjacency", "Export the simple digraph for motif precompute", """
MATCH (a:Account)-[:FLOWS]->(b:Account)
RETURN a.id AS s, b.id AS d ORDER BY s, d SKIP $skip LIMIT $limit
""")

ALL_ACCOUNTS = cy("motif_all_accounts", "Accounts for motif precompute", """
MATCH (a:Account) RETURN a.id AS id ORDER BY id SKIP $skip LIMIT $limit
""")

WRITE_SCORES = cy("motif_write_scores", "Store motif score and its components on accounts", """
UNWIND $rows AS r
MATCH (a:Account {id:r.id})
SET a.motif_score = r.score, a.motif_cycle3 = r.cycle3, a.motif_recip = r.recip,
    a.motif_relay = r.relay, a.motif_fanin = r.fanin, a.motif_fanout = r.fanout,
    a.motif_leaf = r.leaf
""")

READ_SCORE = cy("motif_read_score", "Motif score components for one account", """
MATCH (a:Account {id:$id})
RETURN a.motif_score AS score, a.motif_cycle3 AS cycle3, a.motif_recip AS recip,
       a.motif_relay AS relay, a.motif_fanin AS fanin, a.motif_fanout AS fanout,
       a.motif_leaf AS leaf
""")

TOP_SCORES = cy("motif_top", "Highest motif scores", """
MATCH (a:Account) WHERE a.motif_score IS NOT NULL
RETURN a.id AS id, a.motif_score AS score ORDER BY score DESC LIMIT $k
""")


def load_digraph(graph: str) -> tuple[dict[str, set], dict[str, set], list[str]]:
    out_, in_ = defaultdict(set), defaultdict(set)
    for r in db.ro_all(graph, ADJACENCY):
        out_[r["s"]].add(r["d"])
        in_[r["d"]].add(r["s"])
    nodes = [r["id"] for r in db.ro_all(graph, ALL_ACCOUNTS)]
    return out_, in_, nodes


def scores(out_: dict, in_: dict, nodes: list[str], p: dict | None = None) -> dict[str, dict]:
    p = p or cfg()["motif"]
    deg = {v: len(out_[v]) + len(in_[v]) for v in nodes}
    res = {}
    for v in nodes:
        o, i = out_[v], in_[v]
        recip = len(o & i)
        relay = len(i) * len(o)
        cycle3 = sum(len(out_[w] & i) for w in o)
        fanin = len(i) if len(i) >= p["tau"] * (len(o) + 1) else 0
        fanout = len(o) if len(o) >= p["tau"] * (len(i) + 1) else 0
        leaf = sum(1 for n in (o | i) if deg.get(n, 0) <= p["d_leaf"])
        s = (math.log1p(cycle3) + p["alpha"] * math.log1p(recip) + p["beta"] * math.log1p(relay)
             + p["s_in"] * math.log1p(fanin) + p["s_out"] * math.log1p(fanout)
             + p["s_leaf"] * math.log1p(leaf) - p["gamma"] * math.log1p(deg[v]))
        res[v] = {"id": v, "score": round(s, 5), "cycle3": cycle3, "recip": recip,
                  "relay": relay, "fanin": fanin, "fanout": fanout, "leaf": leaf}
    return res


def compute_and_store(graph: str = db.CONSORTIUM) -> dict:
    out_, in_, nodes = load_digraph(graph)
    sc = scores(out_, in_, nodes)
    rows = list(sc.values())
    for k in range(0, len(rows), 5000):
        db.q(graph, WRITE_SCORES, {"rows": rows[k:k + 5000]})
    return {"scored": len(rows)}


def motif_score(graph: str, account_id: str) -> dict:
    p = {"id": account_id}
    rows = db.ro(graph, READ_SCORE, p)
    return {"result": rows[0] if rows else None, "cypher": READ_SCORE, "params": p}


def _undirected_ball(start: str, out_: dict, in_: dict, radius: int) -> set[str]:
    seen, frontier = {start}, {start}
    for _ in range(radius):
        nxt = set()
        for v in frontier:
            nxt |= out_[v] | in_[v]
        frontier = nxt - seen
        seen |= frontier
    return seen


def coherent_seeds(ranked: list[str], out_: dict, in_: dict, k: int,
                   m: int | None = None, d_max: int | None = None) -> list[str]:
    """Algorithm 2: m centers, each grown with top-scoring nearby nodes, then fill."""
    p = cfg()["motif"]
    m, d_max = m or p["centers"], d_max or p["d_max"]
    rank = {v: i for i, v in enumerate(ranked)}
    feed: list[str] = []
    per_center = max(1, k // m)
    for c in ranked[:m]:
        if c in feed:
            continue
        ball = sorted(_undirected_ball(c, out_, in_, d_max), key=lambda v: rank.get(v, 10**9))
        for v in ball[:per_center]:
            if v not in feed and v in rank:
                feed.append(v)
            if len(feed) >= k:
                return feed
    for v in ranked:
        if len(feed) >= k:
            break
        if v not in feed:
            feed.append(v)
    return feed


def seeds_from_graph(graph: str, k: int, method: str = "motif", rng_seed: int = 0) -> list[str]:
    """Seed feeds compared in evaluation: motif-coherent, degree-imbalance, random."""
    import random

    out_, in_, nodes = load_digraph(graph)
    if method == "random":
        r = random.Random(rng_seed)
        return r.sample(nodes, min(k, len(nodes)))
    if method == "degree":
        ranked = sorted(nodes, key=lambda v: -abs(len(out_[v]) - len(in_[v])))
        return ranked[:k]
    sc = scores(out_, in_, nodes)
    ranked = sorted(nodes, key=lambda v: -sc[v]["score"])
    return coherent_seeds(ranked, out_, in_, k)
