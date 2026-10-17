"""E6 - trust layer: echo rate, invalidation correctness, provenance gate outcomes.

Echo and gate numbers come from the cases the agents actually produced in this graph.
Invalidation correctness uses scripted random dependency graphs with a known answer.
"""
from __future__ import annotations

import argparse
import random

from common import write, dataset_label


def echo_and_gate() -> dict:
    from app import db

    ev_total = ev_rep = 0
    claims = []
    sars = []
    for g in db.case_graphs():
        for r in db.ro(g, "MATCH (e:Evidence) RETURN e.origin AS o"):
            ev_total += 1
        ev_rep += sum(r["n"] - 1 for r in db.ro(g, "MATCH (e:Evidence) WITH e.origin AS o, "
                                                    "count(*) AS n RETURN n"))
        claims += db.ro(g, "MATCH (c:Claim) WHERE c.paths IS NOT NULL RETURN c.paths AS p, "
                           "c.independent_sources AS s, c.confidence AS c, c.naive_confidence AS n")
        sars += db.ro(g, "MATCH (s:SAR) RETURN s.status AS status, s.pf_score AS pf, "
                         "s.repairs AS repairs")
    inflated = [c for c in claims if (c["p"] or 0) > (c["s"] or 0)]
    return {
        "cases": len(db.case_graphs()),
        "echo": {"evidence_items": ev_total, "repeated_origin_items": ev_rep,
                 "echo_rate": round(ev_rep / ev_total, 4) if ev_total else 0,
                 "claims": len(claims), "claims_with_more_paths_than_sources": len(inflated),
                 "mean_paths": round(sum(c["p"] for c in claims) / max(1, len(claims)), 2),
                 "mean_independent_sources": round(sum(c["s"] for c in claims) / max(1, len(claims)), 2),
                 "mean_confidence_echo_proof": round(sum(c["c"] or 0 for c in claims) / max(1, len(claims)), 3),
                 "mean_confidence_naive": round(sum(c["n"] or 0 for c in claims) / max(1, len(claims)), 3)},
        "gate": {"sars": len(sars),
                 "published": sum(1 for s in sars if s["status"] == "published"),
                 "divergent": sum(1 for s in sars if s["status"] == "divergent"),
                 "mean_pf": round(sum(s["pf"] or 0 for s in sars) / max(1, len(sars)), 3),
                 "needed_repair": sum(1 for s in sars if (s["repairs"] or 0) > 0)},
    }


def invalidation(trials: int, seed: int) -> dict:
    """Random evidence/claim/action DAGs; the cascade must flag exactly the true dependents."""
    from app import db
    from trust import validity

    rng = random.Random(seed)
    g = "eval_cascade"
    recall_sum = prec_sum = 0.0
    for t in range(trials):
        db.drop_graph(g)
        ev = [f"E{i}" for i in range(6)]
        cl = [f"C{i}" for i in range(8)]
        ac = [f"A{i}" for i in range(4)]
        db.q(g, "UNWIND $e AS x CREATE (:Evidence {id:x, state:'active'})", {"e": ev})
        db.q(g, "UNWIND $c AS x CREATE (:Claim {id:x, state:'active'})", {"c": cl})
        db.q(g, "UNWIND $a AS x CREATE (:Action {id:x, state:'active'})", {"a": ac})
        deps: dict[str, set[str]] = {x: set() for x in ev + cl + ac}
        for c in cl:
            for e in rng.sample(ev, rng.randint(1, 2)):
                db.q(g, "MATCH (c:Claim {id:$c}),(e:Evidence {id:$e}) CREATE (c)-[:SUPPORTED_BY]->(e)",
                     {"c": c, "e": e})
                deps[e].add(c)
        for i, c in enumerate(cl[2:], 2):
            if rng.random() < 0.4:
                p = rng.choice(cl[:i])
                db.q(g, "MATCH (a:Claim {id:$a}),(b:Claim {id:$b}) CREATE (a)-[:DERIVED_FROM]->(b)",
                     {"a": c, "b": p})
                deps[p].add(c)
        for a in ac:
            c = rng.choice(cl)
            db.q(g, "MATCH (a:Action {id:$a}),(c:Claim {id:$c}) CREATE (a)-[:JUSTIFIED_BY]->(c)",
                 {"a": a, "c": c})
            deps[c].add(a)
        target = rng.choice(ev)
        truth, stack = set(), [target]
        while stack:
            for d in deps[stack.pop()]:
                if d not in truth:
                    truth.add(d)
                    stack.append(d)
        db.q(g, "MATCH (e:Evidence {id:$id}) SET e.state='superseded'", {"id": target})
        got = validity.cascade(g, target, "scripted")
        flagged = set(got["claims"]) | set(got["actions"])
        recall_sum += len(flagged & truth) / len(truth) if truth else 1.0
        prec_sum += len(flagged & truth) / len(flagged) if flagged else 1.0
    db.drop_graph(g)
    return {"trials": trials, "affected_recall": round(recall_sum / trials, 4),
            "affected_precision": round(prec_sum / trials, 4)}


def main(trials: int, seed: int) -> None:
    from app import db

    res = echo_and_gate()
    res["invalidation"] = invalidation(trials, seed)
    stale = 0
    for g in db.case_graphs():
        stale += db.ro(g, """MATCH (a:Action {status:'approved'})-[:JUSTIFIED_BY]->(c:Claim)
            MATCH (c)-[:SUPPORTED_BY|DERIVED_FROM*1..5]->(e:Evidence {state:'superseded'})
            WHERE e.superseded_at < a.decided_at AND coalesce(a.override_stale, false) = false
            RETURN count(DISTINCT a) AS n""")[0]["n"]
    res["stale_actions_approved_without_override"] = stale
    write("E6_trust_layer", dataset_label(), {"trials": trials, "seed": seed}, res,
          ["Echo and gate figures are measured over the cases the agents produced in this graph.",
           "Writer-vs-auditor ablation needs an OpenRouter key and is reported separately when run."])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--trials", type=int, default=50)
    ap.add_argument("--seed", type=int, default=11)
    a = ap.parse_args()
    main(a.trials, a.seed)
