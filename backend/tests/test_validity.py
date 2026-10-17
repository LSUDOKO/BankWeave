import time

import pytest

from app import db
from trust import store, validity


@pytest.fixture
def case(loaded):
    cons = loaded["consortium"]
    acct = db.q(cons, "MATCH (a:Account) RETURN a.id AS id LIMIT 1")[0]["id"]
    db.q(cons, "MATCH (a:Account {id:$a}) MERGE (al:Alert {id:'AL-V'}) MERGE (al)-[:RAISED_FOR]->(a)",
         {"a": acct})
    cid = store.open_case("AL-V", acct, ["001"], "validity", consortium=cons)
    yield cid, acct, cons
    db.drop_graph(db.case_graph(cid))


def test_cascade_reaches_claims_actions_and_sar(case):
    cid, acct, cons = case
    g = db.case_graph(cid)
    addr = store.add_evidence(cid, "shared_attr", "attr:A-77", "share address A-77",
                              {"shared": 15, "units": 200}, None, "investigator")
    flow = store.add_evidence(cid, "path", "flow:x->y", "x pays y", {}, None, "investigator")
    c1 = store.add_claim(cid, "ring via shared address", "ring", [addr], "investigator", [acct],
                         consortium=cons)
    c2 = store.add_claim(cid, "derived mule claim", "mule", [flow], "investigator", [acct],
                         consortium=cons)
    store.derive(cid, c2, c1)
    act = store.propose_action(cid, "freeze_rec", [c2], "freeze", acct, "reporter")
    db.q(g, "CREATE (s:SAR {id:'S1', state:'active'})-[:CONTAINS]->"
            "(t:Sentence {id:'T1', state:'active', text:'shares an address'})")
    db.q(g, "MATCH (t:Sentence {id:'T1'}),(e:Evidence {id:$e}) CREATE (t)-[:CITES]->(e)",
         {"e": addr})
    t_before = int(time.time() * 1000)
    time.sleep(0.01)

    res = validity.invalidate_evidence(cid, addr, "A-77 is a 200-unit residential building")
    assert set(res["claims"]) == {c1, c2}          # derived claim reached transitively
    assert res["actions"] == [act]
    assert res["sentences"] == ["T1"] and res["sars"] == ["S1"]
    states = {r["id"]: r["s"] for r in db.q(g, "MATCH (n) WHERE n.state IS NOT NULL "
                                               "RETURN n.id AS id, n.state AS s")}
    assert states[addr] == "superseded" and states[c1] == states[act] == "needs_verification"
    assert states[flow] == "active"                 # unrelated evidence untouched
    # history preserved: superseded evidence still exists
    assert db.q(g, "MATCH (e:Evidence {id:$e}) RETURN count(e) AS c", {"e": addr})[0]["c"] == 1
    pc = validity.premise_check(cid, action_id=act)
    assert not pc["ok"] and "200-unit" in pc["message"]
    then = {r["claim"]: r for r in validity.beliefs_as_of(cid, t_before)}
    assert then[c1]["state_then"] == "active"


def test_superseded_is_never_downgraded(case):
    cid, acct, cons = case
    e = store.add_evidence(cid, "kyc_fact", "kyc:9", "fact", {}, None, "skeptic")
    validity.invalidate_evidence(cid, e, "wrong")
    g = db.case_graph(cid)
    assert not validity._raise(g, e, "superseded", "needs_verification", "x")
