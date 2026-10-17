"""E2 - consortium vs single bank: can the laundering structure be seen at all?

For every laundering attempt spanning >= 2 selected banks (>= 3 members):
  visibility  = largest connected piece of the attempt's members, using only transfers the
                view can see, divided by attempt size. Best single bank vs consortium.
  detected    = >= 50% of the attempt's members are connected in one piece in that view.
Same Cypher, same members; only the graph (bank_<id> vs consortium) changes.
"""
from __future__ import annotations

from common import ground_truth, write

EDGES = """MATCH (s)-[t:TRANSFERS]->(d) WHERE s.id IN $ids AND d.id IN $ids
RETURN DISTINCT s.id AS s, d.id AS d"""


def largest_piece(members: list[str], edges: list[dict]) -> int:
    import networkx as nx

    g = nx.Graph()
    g.add_nodes_from(members)
    g.add_edges_from((e["s"], e["d"]) for e in edges)
    return max((len(c) for c in nx.connected_components(g)), default=0)


def main() -> None:
    from app import db

    gt = ground_truth(db.PREFIX)
    banks = gt["banks"]
    rows = []
    for att in gt["attempts"]:
        m = att["members"]
        if not att["cross_bank"] or len(m) < 3:
            continue
        cons = largest_piece(m, db.ro(db.CONSORTIUM, EDGES, {"ids": m})) / len(m)
        best_bank, best = None, 0.0
        for b in att["banks"]:
            if b not in banks:
                continue
            v = largest_piece(m, db.ro(db.bank_graph(b), EDGES, {"ids": m})) / len(m)
            # a bank only knows its own customers: count only members it actually holds
            if v > best:
                best, best_bank = v, b
        rows.append({"attempt": att["id"], "pattern": att["pattern"], "size": len(m),
                     "banks": att["banks"], "consortium": round(cons, 3),
                     "best_single_bank": round(best, 3), "best_bank": best_bank})
    n = len(rows)
    det_c = sum(1 for r in rows if r["consortium"] >= 0.5)
    det_b = sum(1 for r in rows if r["best_single_bank"] >= 0.5)
    mean = lambda k: round(sum(r[k] for r in rows) / n, 4) if n else 0  # noqa: E731
    write("E2_consortium_vs_single_bank", gt.get("attempt_source", ""),
          {"min_members": 3, "detect_threshold": 0.5, "banks": banks},
          {"attempts": n, "detected_consortium": det_c, "detected_best_single_bank": det_b,
           "detection_rate_consortium": round(det_c / n, 4) if n else 0,
           "detection_rate_best_single_bank": round(det_b / n, 4) if n else 0,
           "mean_visibility_consortium": mean("consortium"),
           "mean_visibility_best_single_bank": mean("best_single_bank"),
           "per_attempt": rows[:200]},
          ["Visibility is purely structural: it measures whether the laundering transfers "
           "between members are observable in that view, before any detector runs.",
           f"Attempt ground truth source: {gt.get('attempt_source', 'patterns_file')}."])


if __name__ == "__main__":
    main()
