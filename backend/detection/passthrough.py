"""Exact pass-through (layering) matcher (arXiv 2609.20737).

For an account x, an (incoming, outgoing) transfer pair qualifies if
  same asset, 0 < gap <= T, similarity = 1 - |p_out - p_in| / max >= eps, min amount >= p_min.
A maximum-cardinality, maximum-weight bipartite matching (weights = similarity) uses each
transfer at most once. x is flagged when matched pairs >= m_min.

Chain de-duplication (paper Appendix A): when one pair's outgoing transfer is the next
pair's incoming transfer, the chain carries the same money; it counts once, at its minimum.
"""
from __future__ import annotations

import networkx as nx

from app import db
from app.cypher import cy
from detection.settings import cfg

EDGES = cy("passthrough_edges", "Incoming and outgoing transfers of one account", """
MATCH (x:Account {id:$id})
OPTIONAL MATCH (s)-[i:TRANSFERS]->(x)
WITH x, collect({txn:i.txn_id, ts:i.ts, amt:i.amount_recv, cur:i.cur_recv, cp:s.id}) AS ins
OPTIONAL MATCH (x)-[o:TRANSFERS]->(d)
RETURN ins, collect({txn:o.txn_id, ts:o.ts, amt:o.amount, cur:o.cur, cp:d.id}) AS outs
""")

CANDIDATES = cy("passthrough_candidates", "Accounts with enough in and out transfers to scan", """
MATCH (x:Account) WHERE x.in_deg >= $m AND x.out_deg >= $m
  AND x.in_deg <= $max_deg AND x.out_deg <= $max_deg
RETURN x.id AS id ORDER BY id SKIP $skip LIMIT $limit
""")

WRITE = cy("passthrough_write", "Store pass-through results on the account", """
MATCH (x:Account {id:$id})
SET x.passthrough_pairs = $pairs, x.passthrough_value = $value
""")


def match_pairs(ins: list[dict], outs: list[dict], p: dict | None = None) -> list[dict]:
    p = p or cfg()["passthrough"]
    g = nx.Graph()
    for a in ins:
        if a.get("txn") is None:
            continue
        for b in outs:
            if b.get("txn") is None or a["cur"] != b["cur"]:
                continue
            gap = b["ts"] - a["ts"]
            if not 0 < gap <= p["max_gap_seconds"]:
                continue
            hi, lo = max(a["amt"], b["amt"]), min(a["amt"], b["amt"])
            if lo < p["min_amount"] or hi == 0:
                continue
            sim = 1 - (hi - lo) / hi
            if sim >= p["min_similarity"]:
                g.add_edge(("in", a["txn"]), ("out", b["txn"]), weight=sim,
                           data={"in": a, "out": b, "sim": round(sim, 4)})
    pairs = []
    for u, v in nx.max_weight_matching(g, maxcardinality=True):
        d = g.edges[u, v]["data"]
        pairs.append({"in_txn": d["in"]["txn"], "out_txn": d["out"]["txn"],
                      "amount_in": d["in"]["amt"], "amount_out": d["out"]["amt"],
                      "gap": d["out"]["ts"] - d["in"]["ts"], "similarity": d["sim"],
                      "src": d["in"]["cp"], "dst": d["out"]["cp"]})
    return sorted(pairs, key=lambda x: x["in_txn"])


def check(graph: str, account_id: str) -> dict:
    p = cfg()["passthrough"]
    rows = db.ro(graph, EDGES, {"id": account_id}, timeout=30000)
    if not rows:
        return {"result": {"pairs": [], "flagged": False, "value": 0.0}, "cypher": EDGES,
                "params": {"id": account_id}}
    pairs = match_pairs(rows[0]["ins"], rows[0]["outs"], p)
    value = sum(min(x["amount_in"], x["amount_out"]) for x in pairs)
    return {"result": {"pairs": pairs, "n_pairs": len(pairs), "flagged": len(pairs) >= p["min_pairs"],
                       "value": round(value, 2)},
            "cypher": EDGES, "params": {"id": account_id, **p}}


def chain_value(pairs_by_account: dict[str, list[dict]]) -> dict:
    """Deduplicate value along chains: out_txn of one pair == in_txn of another."""
    by_in = {}
    for acct, pairs in pairs_by_account.items():
        for pr in pairs:
            by_in[pr["in_txn"]] = pr
    has_pred = {pr["out_txn"] for prs in pairs_by_account.values() for pr in prs} & set(by_in)
    chains, total = [], 0.0
    for start in [pr for prs in pairs_by_account.values() for pr in prs
                  if pr["in_txn"] not in has_pred]:
        chain, cur = [start], start
        while cur["out_txn"] in by_in and len(chain) < 50:
            cur = by_in[cur["out_txn"]]
            chain.append(cur)
        v = min(min(x["amount_in"], x["amount_out"]) for x in chain)
        chains.append({"length": len(chain), "value": round(v, 2),
                       "txns": [chain[0]["in_txn"]] + [x["out_txn"] for x in chain]})
        total += v
    return {"chains": chains, "total_value": round(total, 2)}


def scan(graph: str = db.CONSORTIUM) -> dict:
    p = cfg()["passthrough"]
    flagged: dict[str, list[dict]] = {}
    # hubs (payroll, merchants) are skipped: pair matching is quadratic and hubs aren't relays
    for r in db.ro_all(graph, CANDIDATES, {"m": p["min_pairs"],
                                           "max_deg": p.get("max_degree", 500)}):
        res = check(graph, r["id"])["result"]
        db.q(graph, WRITE, {"id": r["id"], "pairs": res["n_pairs"] if res["pairs"] else 0,
                            "value": res["value"]})
        if res["flagged"]:
            flagged[r["id"]] = res["pairs"]
    cv = chain_value(flagged)
    return {"flagged": sorted(flagged), "n_flagged": len(flagged),
            "chain_value": cv["total_value"], "n_chains": len(cv["chains"])}
