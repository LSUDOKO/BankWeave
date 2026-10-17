import pytest

from app import db
from detection import typologies as ty


@pytest.fixture(scope="module")
def tg():
    """Hand-built graph with known shapes."""
    name = "test_typ"
    db.drop_graph(name)
    db.q(name, "UNWIND $ids AS i CREATE (:Account {id:i, bank_id:'001'})",
         {"ids": ["c1", "c2", "c3", "hub", "s1", "s2", "s3", "s4", "s5", "s6", "p", "x", "y"]})
    edges = [("c1", "c2", 100, 50000.0), ("c2", "c3", 200, 49500.0), ("c3", "c1", 300, 49000.0)]
    edges += [("hub", f"s{i}", 1000 + i * 60, 9500.0) for i in range(1, 7)]  # fan-out + struct
    edges += [("x", "p", 5000, 20000.0), ("p", "y", 6000, 19900.0)]          # pass-through
    for i, (s, d, ts, amt) in enumerate(edges):
        db.q(name, """MATCH (s:Account {id:$s}),(d:Account {id:$d})
             CREATE (s)-[:TRANSFERS {txn_id:$id, ts:$ts, amount:$a, amount_recv:$a,
             cur:'USD', cur_recv:'USD', format:'Wire', capacity:$a}]->(d)""",
             {"s": s, "d": d, "id": f"e{i}", "ts": ts, "a": amt})
    db.q(name, "CREATE (d:Device {id:'D1', kind:'device', shared_count:2})")
    db.q(name, "MATCH (a:Account {id:'c1'}),(b:Account {id:'c2'}),(d:Device {id:'D1'}) "
               "CREATE (a)-[:USES_DEVICE]->(d), (b)-[:USES_DEVICE]->(d)")
    yield name
    db.drop_graph(name)


def test_circular_flow(tg):
    r = ty.circular_flow(tg, "c1")
    assert r["found"] and r["matches"][0]["accounts"] == ["c1", "c2", "c3", "c1"]
    assert r["matches"][0]["txn_ids"] == ["e0", "e1", "e2"]
    assert not ty.circular_flow(tg, "hub")["found"]


def test_fan_out_and_structuring(tg):
    f = ty.fan_out(tg, "hub")
    assert f["found"] and f["matches"][0]["fan"] == 6
    s = ty.structuring(tg, "hub")
    assert s["found"] and s["matches"][0]["near_threshold"] == 6
    assert not ty.fan_in(tg, "hub")["found"]


def test_passthrough_quick(tg):
    r = ty.rapid_passthrough(tg, "p")
    assert r["found"] and r["matches"][0]["in_txn"] == "e9"


def test_shared_identity(tg):
    r = ty.shared_identity(tg, "c1")
    assert r["found"] and r["matches"][0]["others"] == ["c2"]


def test_follow_money_bounded(tg):
    r = ty.follow_money(tg, "c1", 2)
    assert r["found"]
    with pytest.raises(ValueError):
        ty.follow_money(tg, "c1", 99)
