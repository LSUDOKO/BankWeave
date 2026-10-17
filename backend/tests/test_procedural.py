from agents.archivist import _template
from memory import procedural
from app import db


def test_template_generalises_accounts():
    seed, other = "a" * 16, "b" * 16
    t = _template({"src": seed, "dst": other, "sources": [seed], "targets": [other], "k": 3}, seed)
    assert t == {"src": "$seed", "dst": "$hub", "sources": ["$seed"], "targets": ["$hub"], "k": 3}


def test_procedure_saved_and_reinforced(monkeypatch):
    monkeypatch.setattr(procedural, "G", "test_procedures")
    db.drop_graph("test_procedures")
    steps = [{"tool": "typology_patterns", "params": {"account_id": "$seed"}},
             {"tool": "trace_flow", "params": {"src": "$seed", "dst": "$hub"}}]
    procedural.save("C-1", "cycle", steps, True)
    procedural.save("C-2", "cycle", steps, True)
    best = procedural.best("cycle")
    assert best["success"] == 2 and best["learned_from"] == ["C-1", "C-2"]
    assert [s["tool"] for s in best["steps"]] == ["typology_patterns", "trace_flow"]
    assert best["steps"][1]["params"] == {"src": "$seed", "dst": "$hub"}
    db.drop_graph("test_procedures")
