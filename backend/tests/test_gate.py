import pytest

from app import db
from trust import gate, store


@pytest.fixture
def case(loaded):
    cons = loaded["consortium"]
    acct = db.q(cons, "MATCH (a:Account) RETURN a.id AS id LIMIT 1")[0]["id"]
    db.q(cons, "MATCH (a:Account {id:$a}) MERGE (al:Alert {id:'AL-G'}) MERGE (al)-[:RAISED_FOR]->(a)",
         {"a": acct})
    cid = store.open_case("AL-G", acct, ["001"], "gate", consortium=cons)
    e = store.add_evidence(cid, "typology_match", "typ:cycle:" + acct,
                           f"{acct} sent 49000.00 around a 3-account cycle",
                           {"amount": 49000.0, "hops": 3}, None, "investigator")
    c = store.add_claim(cid, "cycle", "ring", [e], "investigator", [acct], consortium=cons)
    yield cid, acct, e, c
    db.drop_graph(db.case_graph(cid))


def test_deterministic_verdicts():
    cited = [{"text": "abcdef0123456789 sent 49000.0", "payload": "{\"hops\": 3}"}]
    assert gate._deterministic_verdict("abcdef0123456789 moved $49,000.00 in 3 hops", cited)[0]
    assert not gate._deterministic_verdict("abcdef0123456789 moved $51,000", cited)[0]


def test_gate_publishes_good_draft(case, monkeypatch):
    monkeypatch.setattr("agents.llm.enabled", lambda: False)
    cid, acct, e, c = case
    res = gate.run(cid, lambda b, h: [{"text": f"Account {acct} moved 49,000.00 in a cycle.",
                                       "cites": [e]}])
    assert res["status"] == "published" and res["pf"] == 1.0
    n = db.q(db.case_graph(cid), "MATCH (:SAR)-[:CONTAINS]->(t:Sentence)-[:CITES]->(x) "
                                 "RETURN count(x) AS c")[0]["c"]
    assert n == 1


def test_gate_repairs_then_diverges(case, monkeypatch):
    monkeypatch.setattr("agents.llm.enabled", lambda: False)
    cid, acct, e, c = case
    calls = []

    def bad_draft(bundle, hint):
        calls.append(hint)
        return [{"text": f"Account {acct} moved 75,000 offshore.", "cites": [e]},
                {"text": "It is definitely a terrorist.", "cites": ["E-missing"]}]
    res = gate.run(cid, bad_draft)
    assert res["status"] == "divergent" and len(calls) == 4      # 1 draft + 3 repairs
    assert calls[1] and not calls[0]                             # repair hints passed back
    assert len(res["divergence"]["unresolved"]) == 2
