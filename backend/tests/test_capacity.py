from app import db
from app.services import capacity
from trust import store


def test_memory_reports_used():
    m = capacity.memory()
    assert m["used_mb"] > 0


def test_prune_drops_oldest_unpinned(monkeypatch):
    a = store.open_case("AL-cap-1", "acct-cap", ["001"], "cap test a", case_id="CAP-old")
    b = store.open_case("AL-cap-2", "acct-cap", ["001"], "cap test b", case_id="CAP-new")
    assert db.case_graph("CAP-old") in db.list_graphs()
    pct = iter([0.9, 0.8, 0.7, 0.7, 0.7])
    monkeypatch.setattr(capacity, "memory", lambda: {"pct": next(pct), "used_mb": 1})
    monkeypatch.setattr(capacity, "_opened_at", lambda g: 0 if g.endswith("CAP-old") else 1)
    monkeypatch.setattr(db, "case_graphs", lambda: [db.case_graph("CAP-old"), db.case_graph("CAP-new")])
    out = capacity.prune()
    assert out["pruned"] == ["CAP-old"]
    assert db.case_graph("CAP-old") not in db.list_graphs()
    capacity.drop_case("CAP-new")
    assert a and b
