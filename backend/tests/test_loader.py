from app import db


def test_consortium_and_bank_graphs(loaded):
    meta = loaded["meta"]
    assert len(meta["banks"]) == 4
    cons = loaded["consortium"]
    n_acc = db.q(cons, "MATCH (a:Account) RETURN count(a) AS c")[0]["c"]
    assert n_acc > 100
    # ids are hashed: 16 hex chars, never raw IBM account ids
    ids = db.q(cons, "MATCH (a:Account) RETURN a.id AS id LIMIT 5")
    assert all(len(r["id"]) == 16 for r in ids)
    # a bank graph sees fewer transfers than the consortium
    total = db.q(cons, "MATCH ()-[t:TRANSFERS]->() RETURN count(t) AS c")[0]["c"]
    b = "test_" + db.bank_graph(meta["banks"][0])
    part = db.q(b, "MATCH ()-[t:TRANSFERS]->() RETURN count(t) AS c")[0]["c"]
    assert 0 < part < total
    # no labels leak into graphs
    assert db.q(cons, "MATCH ()-[t:TRANSFERS]->() WHERE t.label IS NOT NULL "
                      "RETURN count(t) AS c")[0]["c"] == 0


def test_ground_truth_has_cross_bank_attempts(loaded):
    gt = loaded["gt"]
    assert gt["illicit_accounts"]
    assert any(a["cross_bank"] for a in gt["attempts"])


def test_timestamps_are_epoch_seconds(loaded):
    ts = db.q(loaded["consortium"], "MATCH ()-[t:TRANSFERS]->() RETURN min(t.ts) AS lo")[0]["lo"]
    assert 1_600_000_000 < ts < 1_800_000_000
