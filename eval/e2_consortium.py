"""E2 - consortium vs single bank: how much of a cross-bank ring can one bank see?

For every laundering attempt with members at >= 2 selected banks (>= 3 members):
  accounts_held      share of the ring's accounts that are this bank's own customers
                     (the only ones it can run KYC on and investigate)
  transfers_visible  share of the ring's laundering transfers that touch this bank's accounts
  connected_view     largest connected piece of the ring using only transfers in this view
We report the best-placed single bank per attempt. The consortium sees 100% of each by
construction; the question is how far below that a single bank sits.
"""
from __future__ import annotations

import statistics

import networkx as nx

from common import ground_truth, write, dataset_label

EDGES = """MATCH (s)-[t:TRANSFERS]->(d) WHERE s.id IN $ids AND d.id IN $ids
RETURN s.id AS s, d.id AS d, t.txn_id AS txn"""
OWN = """MATCH (a:Account) WHERE a.id IN $ids RETURN a.id AS id"""


def largest(members, edges):
    g = nx.Graph()
    g.add_nodes_from(members)
    g.add_edges_from((e["s"], e["d"]) for e in edges)
    return max((len(c) for c in nx.connected_components(g)), default=0)


def main() -> None:
    from app import db

    gt = ground_truth(db.PREFIX)
    laundering = set(gt["laundering_txns"])
    rows = []
    for att in gt["attempts"]:
        m = att["members"]
        if not att["cross_bank"] or len(m) < 3:
            continue
        cons_edges = [e for e in db.ro(db.CONSORTIUM, EDGES, {"ids": m}) if e["txn"] in laundering]
        if not cons_edges:
            continue
        best = {"accounts_held": 0.0, "transfers_visible": 0.0, "connected_view": 0.0}
        for b in att["banks"]:
            g = db.bank_graph(b)
            if g not in db.list_graphs():
                continue
            own = {r["id"] for r in db.ro(g, OWN, {"ids": m})}
            edges = [e for e in db.ro(g, EDGES, {"ids": m}) if e["txn"] in laundering]
            best["accounts_held"] = max(best["accounts_held"], len(own) / len(m))
            best["transfers_visible"] = max(best["transfers_visible"], len(edges) / len(cons_edges))
            best["connected_view"] = max(best["connected_view"], largest(m, edges) / len(m))
        rows.append({"attempt": att["id"], "size": len(m), "banks": len(att["banks"]),
                     "laundering_transfers": len(cons_edges),
                     **{k: round(v, 3) for k, v in best.items()},
                     "consortium_connected": round(largest(m, cons_edges) / len(m), 3)})
    n = len(rows)

    def mean(k):
        return round(statistics.mean(r[k] for r in rows), 4) if n else 0

    def share_full(k):
        return round(sum(1 for r in rows if r[k] >= 0.999) / n, 4) if n else 0

    write("E2_consortium_vs_single_bank", dataset_label(),
          {"min_members": 3, "banks": gt["banks"]},
          {"attempts": n,
           "best_single_bank": {"mean_accounts_held": mean("accounts_held"),
                                "mean_transfers_visible": mean("transfers_visible"),
                                "mean_connected_view": mean("connected_view"),
                                "attempts_fully_held": share_full("accounts_held"),
                                "attempts_all_transfers_visible": share_full("transfers_visible")},
           "consortium": {"mean_accounts_held": 1.0, "mean_transfers_visible": 1.0,
                          "mean_connected_view": mean("consortium_connected")},
           "mean_banks_per_attempt": mean("banks"), "per_attempt": rows[:300]},
          ["A bank can only investigate (KYC, other transfers) its own customers; accounts held "
           "is the share of the ring it can actually work on.",
           f"Attempt ground truth: {gt.get('attempt_source', 'patterns_file')}; laundering "
           "transfers identified by IBM's per-transaction label."])


if __name__ == "__main__":
    main()
