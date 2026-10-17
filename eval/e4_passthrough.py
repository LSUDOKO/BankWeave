"""E4 - exact pass-through matcher (arXiv 2609.20737): precision of flagged accounts."""
from __future__ import annotations

from common import ground_truth, write


def main() -> None:
    from app import db
    from detection import passthrough
    from detection.settings import cfg

    gt = ground_truth(db.PREFIX)
    illicit = set(gt["illicit_accounts"])
    res = passthrough.scan(db.CONSORTIUM)
    flagged = res["flagged"]
    hits = sum(1 for a in flagged if a in illicit)
    n_acc = db.ro(db.CONSORTIUM, "MATCH (a:Account) RETURN count(a) AS c")[0]["c"]
    base = len(illicit) / n_acc if n_acc else 0
    write("E4_passthrough", db.PREFIX or "demo", cfg()["passthrough"],
          {"flagged": len(flagged), "illicit_among_flagged": hits,
           "precision": round(hits / len(flagged), 4) if flagged else 0.0,
           "base_rate": round(base, 4), "chain_deduplicated_value": res["chain_value"],
           "chains": res["n_chains"]},
          ["Parameters are the paper's Ethereum settings adapted to IBM data (T=24h, "
           "similarity 0.98, min amount 1000, min 3 pairs); not tuned on test labels."])


if __name__ == "__main__":
    main()
