from app import db
from app.services import baseline


def test_baseline_generates_alerts_idempotently(loaded):
    g = loaded["consortium"]
    first = baseline.generate(g)
    assert first["alerts"] > 0
    assert set(first["by_rule"]) <= {"large_transfer", "near_threshold_burst",
                                     "new_counterparty_big", "high_risk_format"}
    again = baseline.generate(g, reset=False)
    n = db.q(g, "MATCH (al:Alert) RETURN count(al) AS c")[0]["c"]
    assert n == again["alerts"] == first["alerts"]
    assert db.q(g, "MATCH (al:Alert)-[:RAISED_FOR]->(:Account) RETURN count(al) AS c")[0]["c"] == n
