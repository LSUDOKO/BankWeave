"""E5 - clue-guided ring recovery (arXiv 2606.26189, graph-signal version, no GNN).

Start from 2 clue members of a cross-bank attempt; measure precision / recall of the
recovered group per round, clue nodes excluded.
"""
from __future__ import annotations

import argparse
import random

from common import ground_truth, prf, write


def main(n_attempts: int, rounds: int, seed: int) -> None:
    from app import db
    from detection import clue_expand

    gt = ground_truth(db.PREFIX)
    atts = [a for a in gt["attempts"] if len(a["members"]) >= 5]
    random.Random(seed).shuffle(atts)
    atts = atts[:n_attempts]
    per_round = {r: [0, 0, 0] for r in range(1, rounds + 1)}
    for a in atts:
        clues = a["members"][:2]
        truth = set(a["members"][2:])
        res = clue_expand.expand(db.CONSORTIUM, clues, max_rounds=rounds, theta=0.0)["result"]
        group: set[str] = set()
        for r in range(1, rounds + 1):
            step = next((x for x in res["rounds"] if x["round"] == r), None)
            if step:
                group |= {x["account"] for x in step["added"]}
            tp = len(group & truth)
            per_round[r][0] += tp
            per_round[r][1] += len(group) - tp
            per_round[r][2] += len(truth) - tp
    table = {str(r): prf(*v) for r, v in per_round.items()}
    best = max(table, key=lambda r: table[r]["f1"]) if table else None
    write("E5_clue_expansion", db.PREFIX or "demo",
          {"attempts": len(atts), "rounds": rounds, "clues_per_attempt": 2, "seed": seed},
          {"per_round": table, "best_round": best},
          ["No GNN: risk field = motif score, PageRank, pass-through pairs and behaviour-vector "
           "similarity; context = time/amount-consistent transfer pairs.",
           "theta=0 so every round adds nodes, exposing the precision/recall trade-off."])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--attempts", type=int, default=40)
    ap.add_argument("--rounds", type=int, default=8)
    ap.add_argument("--seed", type=int, default=3)
    a = ap.parse_args()
    main(a.attempts, a.rounds, a.seed)
