"""End-to-end: alert -> triage -> case -> claims -> challenge -> SAR, through the flow."""
from app import db
from agents import flow, triage
from agents.blackboard import Blackboard


def test_case_runs_to_sar_through_blackboard(loaded, monkeypatch):
    monkeypatch.setattr("agents.llm.enabled", lambda: False)
    monkeypatch.setattr(db, "CONSORTIUM", loaded["consortium"])
    import agents.investigator as inv, agents.skeptic as sk, agents.tools as tl, trust.store as st
    for m in (triage, inv, sk, tl, st):
        monkeypatch.setattr(m.db, "CONSORTIUM", loaded["consortium"], raising=False)
    from app.services import baseline
    baseline.generate(loaded["consortium"])
    cyc = next(a for a in loaded["gt"]["attempts"] if a["pattern"] == "CYCLE")
    acct = cyc["members"][0]
    db.q(loaded["consortium"], "MERGE (al:Alert {id:'AL-PIPE'}) SET al.status='open', "
         "al.account_id=$a, al.rule='test', al.bank_id='x' WITH al MATCH (a:Account {id:$a}) "
         "MERGE (al)-[:RAISED_FOR]->(a)", {"a": acct})
    monkeypatch.setattr(triage, "risk_score", lambda s: 5.0)  # force a case for this test
    bb = Blackboard("test_bb_pipe")
    f = flow.build(bb)
    out = f.invoke({"task_type": "triage", "alert_id": "AL-PIPE"})
    case_id = out["result"]["case_id"]
    for _ in range(6):
        t = bb.claim("t", ["investigate", "challenge", "report"])
        if not t:
            break
        f.invoke({"task_type": t["type"], "case_id": t["case_id"], "round": t["round"]})
        bb.done(t["id"])
    g = db.case_graph(case_id)
    assert db.q(g, "MATCH (c:Claim)-[:SUPPORTED_BY]->(:Evidence) RETURN count(c) AS c")[0]["c"] > 0
    sar = db.q(g, "MATCH (s:SAR) RETURN s.status AS s, s.pf_score AS pf")[0]
    assert sar["s"] in ("published", "divergent")
    assert db.q(g, "MATCH (a:Action)-[:JUSTIFIED_BY]->(:Claim) RETURN count(a) AS c")[0]["c"] >= 1
    assert db.q(g, "MATCH (:Case)-[:HAD_EVENT]->(e:Event) RETURN count(e) AS c")[0]["c"] > 5
    db.drop_graph(g)
    db.drop_graph("test_bb_pipe")
