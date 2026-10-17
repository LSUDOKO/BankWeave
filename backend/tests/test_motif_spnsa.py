from app import db
from detection import motif_seeds as ms
from detection import spnsa


def test_motif_score_components():
    out_ = {"a": {"b"}, "b": {"c"}, "c": {"a"}, "x": set()}
    in_ = {"a": {"c"}, "b": {"a"}, "c": {"b"}, "x": set()}
    from collections import defaultdict
    o, i = defaultdict(set, out_), defaultdict(set, in_)
    sc = ms.scores(o, i, ["a", "b", "c", "x"])
    assert sc["a"]["cycle3"] == 1 and sc["x"]["cycle3"] == 0
    assert sc["a"]["score"] > sc["x"]["score"] - 1e-9


def test_store_seed_and_subgraph(loaded):
    g = loaded["consortium"]
    assert ms.compute_and_store(g)["scored"] > 0
    assert ms.motif_score(g, db.q(g, "MATCH (a:Account) RETURN a.id AS id LIMIT 1")[0]["id"])[
        "result"]["score"] is not None
    for method in ("motif", "degree", "random"):
        seeds = ms.seeds_from_graph(g, 10, method)
        assert len(seeds) == 10 and len(set(seeds)) == 10
    sub = spnsa.subgraph(g, ms.seeds_from_graph(g, 5), r=1)
    assert len(sub["nodes"]) >= 5
    assert "spnsa_scratch" not in db.list_graphs()
