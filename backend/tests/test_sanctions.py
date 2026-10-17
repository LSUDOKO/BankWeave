from app.services import sanctions


def test_name_matching_needs_every_part():
    assert sanctions.name_score("Aysha Tanaka", "Aisha Tanaka") > 0.9
    assert sanctions.name_score("Tanaka, Aisha", "Aisha Tanaka") == 1.0
    assert sanctions.name_score("Aisha Garcia", "Aisha Ali") == 0.0  # shared first name only


def test_bundled_screen_carries_provenance(monkeypatch):
    monkeypatch.delenv("OPENSANCTIONS_API_KEY", raising=False)
    out = sanctions.screen("Aisha Tanaka")
    assert out["mode"] == "bundled" and out["hits"]
    prov = out["hits"][0]["provenance"]
    assert prov["synthetic"] is True and prov["dataset"] == "bankweave_synthetic_watchlist"
