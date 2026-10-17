from app import db
from detection import algorithms as al
from detection.casegraph import copy_to_case


def test_algorithms_run_on_consortium(loaded):
    g = loaded["consortium"]
    isl = al.find_islands(g)["result"]
    assert isl["n_components"] >= 1 and isl["components"][0]["size"] > 10
    assert len(al.find_hub(g, 3)["result"]) == 3
    b1 = al.find_bridges(g, 3)["result"]
    assert b1 == al.find_bridges(g, 3)["result"]  # seeded => reproducible
    assert al.find_orchestrator(g, 3)["result"][0]["reachable"] > 0
    assert isinstance(al.find_rings(g)["result"], list)


def test_trace_flow_and_money_at_risk_on_attempt(loaded):
    g = loaded["consortium"]
    cyc = next(a for a in loaded["gt"]["attempts"] if a["pattern"] == "CYCLE")
    a, b = cyc["members"][0], cyc["members"][1]
    paths = al.trace_flow(g, a, b, direction="both")["result"]
    assert paths and paths[0]["accounts"][0] == a and paths[0]["accounts"][-1] == b
    mf = al.money_at_risk(g, [a], [b])["result"]
    assert mf["maxFlow"] >= 0


def test_copy_to_case_graph(loaded):
    g = loaded["consortium"]
    att = loaded["gt"]["attempts"][0]
    stats = copy_to_case(g, att["members"], "test_case_x")
    assert stats["accounts"] == len(att["members"])
    n = db.q("test_case_x", "MATCH (a:Account) RETURN count(a) AS c")[0]["c"]
    assert n == len(att["members"])
    assert al.find_hub("test_case_x", 1)["result"]
    db.drop_graph("test_case_x")
