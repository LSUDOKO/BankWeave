"""Clue-guided ring recovery (arXiv 2606.26189), graph-signal version (no GNN).

1. context: 2-hop neighbourhood of the clue accounts
2. risk field: w1*motif + w2*pagerank + w3*passthrough + w4*behaviour-similarity-to-clue
3. greedy assembly: add the boundary node with the highest gain (risk + cohesion with the
   current group); stop when gain < theta or after max_rounds (paper: peak around 4-6)
4. analyst feedback: negatives are excluded and their neighbours down-weighted
"""
from __future__ import annotations

from app import db
from app.cypher import cy
from detection.settings import cfg

CONTEXT = cy("clue_context", "Two-hop context around clue accounts with risk signals", """
MATCH (c:Account) WHERE c.id IN $clues
MATCH (c)-[:FLOWS]-(m:Account) WHERE m.in_deg + m.out_deg <= $hub
OPTIONAL MATCH (m)-[:FLOWS]-(x:Account) WHERE x.in_deg + x.out_deg <= $hub
WITH collect(DISTINCT m) + collect(DISTINCT x) AS ns
UNWIND ns AS n
WITH DISTINCT n
RETURN n.id AS id, n.bank_id AS bank, coalesce(n.motif_score, 0.0) AS motif,
       coalesce(n.pagerank, 0.0) AS pagerank, coalesce(n.passthrough_pairs, 0) AS pt
LIMIT 3000
""")

MEMBER_TRANSFERS = cy("clue_member_transfers", "Transfers of group members (for consistency)", """
MATCH (g:Account)-[t:TRANSFERS]-(y:Account)
WHERE g.id IN $ids AND g.in_deg + g.out_deg <= $hub
RETURN g.id AS g, y.id AS y, t.ts AS ts, t.amount AS amount
""")

SIMILAR = cy("clue_behavior_similarity", "Behaviour similarity of context accounts to a clue", """
MATCH (c:Account {id:$clue})
CALL db.idx.vector.queryNodes('Account', 'behavior_vec', $k, c.behavior_vec)
YIELD node, score
RETURN node.id AS id, score
""")

W = {"motif": 0.2, "pagerank": 0.1, "pt": 0.2, "sim": 0.5}  # sim strongest in ablation


def _norm(vals: dict[str, float]) -> dict[str, float]:
    if not vals:
        return {}
    lo, hi = min(vals.values()), max(vals.values())
    return {k: (v - lo) / (hi - lo) if hi > lo else 0.0 for k, v in vals.items()}


def expand(graph: str, clues: list[str], negatives: list[str] | None = None,
           max_rounds: int = 6, per_round: int = 2, theta: float = 0.4,
           win: int = 6 * 3600, tol: float = 0.2) -> dict:
    negatives = set(negatives or [])
    hub = cfg()["triage"].get("hub_degree", 2000)  # hubs aren't ring members; skip them
    ctx = {r["id"]: r for r in db.ro(graph, CONTEXT, {"clues": clues, "hub": hub}, timeout=30000)}
    sim: dict[str, float] = {}
    for c in clues:
        for r in db.ro(graph, SIMILAR, {"clue": c, "k": 200}):
            # cosine distance -> similarity
            sim[r["id"]] = max(sim.get(r["id"], 0.0), 1.0 - float(r["score"]))
    motif = _norm({k: v["motif"] for k, v in ctx.items()})
    pr = _norm({k: v["pagerank"] for k, v in ctx.items()})
    pt = _norm({k: float(v["pt"]) for k, v in ctx.items()})
    sm = _norm({k: sim.get(k, 0.0) for k in ctx})
    risk = {k: W["motif"] * motif.get(k, 0) + W["pagerank"] * pr.get(k, 0)
            + W["pt"] * pt.get(k, 0) + W["sim"] * sm.get(k, 0) for k in ctx}

    adj: dict[str, set] = {}

    def consistent_neighbors(members: set[str]) -> None:
        """Structure-aware context: counterparties linked through a pair of transfers at a
        member that agree in time (<= win) and amount (within tol). Sliding window, O(n log n)."""
        todo = [m for m in members if m not in adj]
        for m in todo:
            adj[m] = set()
        if not todo:
            return
        by_g: dict[str, list] = {}
        for r in db.ro(graph, MEMBER_TRANSFERS, {"ids": todo, "hub": hub}, timeout=30000):
            by_g.setdefault(r["g"], []).append((r["ts"], r["amount"], r["y"]))
        for g, txs in by_g.items():
            txs.sort()
            lo = 0
            for i, (ts, amt, y) in enumerate(txs):
                while txs[lo][0] < ts - win:
                    lo += 1
                for ts2, amt2, z in txs[lo:i]:
                    if z != y and abs(amt - amt2) <= tol * max(amt, amt2):
                        for x in (y, z):
                            adj[g].add(x)
                            adj.setdefault(x, set()).add(g)

    consistent_neighbors(set(negatives))
    for n in negatives:  # analyst said "innocent": down-weight its neighbourhood
        for nb in adj.get(n, ()):
            risk[nb] = risk.get(nb, 0) * 0.5

    group, rounds = set(clues), []
    for rnd in range(1, max_rounds + 1):
        consistent_neighbors(group)
        boundary = {nb for g in group for nb in adj.get(g, ())} - group - negatives
        scored = []
        for b in boundary:
            links = sum(1 for g in group if b in adj.get(g, ()))
            cohesion = links / len(group)
            scored.append((risk.get(b, 0) + 0.5 * cohesion, b, cohesion))
        scored.sort(reverse=True)
        added = [(g, b, c) for g, b, c in scored[:per_round] if g >= theta]
        if not added:
            break
        for _, b, _ in added:
            group.add(b)
        rounds.append({"round": rnd, "added": [{"account": b, "gain": round(g, 3),
                                                 "cohesion": round(c, 3)} for g, b, c in added]})
    members = sorted(group - set(clues))
    return {"result": {"clues": clues, "members": members, "rounds": rounds,
                       "banks": sorted({ctx[m]["bank"] for m in members if m in ctx})},
            "cypher": [CONTEXT, MEMBER_TRANSFERS, SIMILAR], "params": {"clues": clues}}
