import pytest

from app import db
from app.routers import lab
from app.services import engine, udf


def test_parse_plan_depth_and_stats():
    lines = ["Results | Records produced: 2, Execution time: 0.001 ms",
             "    Project | Records produced: 2, Execution time: 0.003 ms",
             "        Conditional Traverse | (a)->(b) | Records produced: 2, Execution time: 2.3 ms"]
    plan = engine.parse_plan(lines)
    assert [n["depth"] for n in plan] == [0, 1, 2]
    assert plan[2]["op"] == "Conditional Traverse" and plan[2]["detail"] == "(a)->(b)"
    assert plan[2]["records"] == 2 and plan[2]["ms"] == 2.3


def test_inspect_refuses_writes():
    db.q("lab_test", "CREATE (:T {id:1})")
    try:
        with pytest.raises(engine.NotReadOnly):
            engine.xray("lab_test", "CREATE (:Hack)")
        out = engine.xray("lab_test", "MATCH (t:T) RETURN t.id")
        assert out["rows"] == 1 and out["profile"][0]["op"] == "Results"
        assert db.ro("lab_test", "MATCH (h:Hack) RETURN count(h) AS n")[0]["n"] == 0
    finally:
        db.drop_graph("lab_test")


def test_clamp_bounds_path_searches():
    p = {"max_len": 9, "direction": "both", "k": 500}
    lab._clamp(p, db.CONSORTIUM)
    assert p == {"max_len": 3, "direction": "outgoing", "k": 25}
    p = {"max_len": 9, "direction": "both"}
    lab._clamp(p, db.case_graph("X"))
    assert p == {"max_len": 5, "direction": "both"}


def test_udf_libraries_load_and_run():
    assert all(r["loaded"] for r in udf.ensure())
    db.q("lab_udf", "CREATE (a:Account {id:'a'})-[:TRANSFERS {ts:10, amount:5}]->"
                    "(b:Account {id:'b'})-[:TRANSFERS {ts:20, amount:4}]->(c:Account {id:'c'}),"
                    "(c)-[:TRANSFERS {ts:5, amount:1}]->(:Account {id:'d'})")
    try:
        rows = db.ro("lab_udf", "MATCH (a:Account {id:'a'}) "
                                "UNWIND aml_temporal.timeRespectingReach(a, 4, 100) AS r "
                                "RETURN r.account AS acct ORDER BY acct")
        # d is reached only by a transfer that happened before money arrived at c
        assert [r["acct"] for r in rows] == ["b", "c"]
        assert db.ro("lab_udf", "RETURN flex.text.levenshtein('kitten','sitting') AS d")[0]["d"] == 3
    finally:
        db.drop_graph("lab_udf")
