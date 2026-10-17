import pytest

from app import db
from trust import echo, store


@pytest.fixture
def case(loaded):
    acct = db.q(loaded["consortium"], "MATCH (a:Account) RETURN a.id AS id LIMIT 1")[0]["id"]
    al = "AL-TEST"
    db.q(loaded["consortium"], "MATCH (a:Account {id:$a}) MERGE (al:Alert {id:$al}) "
         "MERGE (al)-[:RAISED_FOR]->(a)", {"a": acct, "al": al})
    cid = store.open_case(al, acct, ["001"], "test", consortium=loaded["consortium"])
    yield cid, acct, loaded["consortium"]
    db.drop_graph(db.case_graph(cid))


def test_echo_counts_origins_not_paths(case):
    cid, acct, cons = case
    # six paths between the same two accounts + one shared device seen twice
    path_ids = [store.add_evidence(cid, "path", store.origin_for("path", src="a", dst="b"),
                                   f"path {i}", {"i": i}, "MATCH ...", "investigator")
                for i in range(6)]
    dev = [store.add_evidence(cid, "shared_attr", store.origin_for("shared_attr", attr="D1"),
                              "shared device", {"shared": 2}, None, "investigator")
           for _ in range(2)]
    claim = store.add_claim(cid, "a and b form a ring", "ring", path_ids + dev, "investigator",
                            [acct], consortium=cons)
    res = echo.echo_check(cid, claim)
    assert res["paths"] == 8 and res["independent_sources"] == 2
    assert res["confidence"] < res["naive_confidence"]
    stored = db.q(db.case_graph(cid), "MATCH (c:Claim {id:$id}) RETURN c.paths AS p, "
                  "c.independent_sources AS s", {"id": claim})[0]
    assert stored == {"p": 8, "s": 2}


def test_challenges_lower_confidence_and_claims_need_evidence(case):
    cid, acct, cons = case
    e = store.add_evidence(cid, "typology_match", store.origin_for(
        "typology_match", pattern="cycle", account=acct), "cycle", {}, None, "investigator")
    claim = store.add_claim(cid, "cycle", "ring", [e], "investigator", [acct], consortium=cons)
    before = echo.echo_check(cid, claim)["confidence"]
    ch = store.add_evidence(cid, "kyc_fact", "kyc:r1", "family", {}, None, "skeptic")
    store.challenge(cid, claim, ch)
    assert echo.echo_check(cid, claim)["confidence"] < before
    with pytest.raises(ValueError):
        store.add_claim(cid, "x", "ring", [], "investigator", [acct], consortium=cons)
    with pytest.raises(ValueError):
        store.add_claim(cid, "x", "ring", ["E-nope"], "investigator", [acct], consortium=cons)
