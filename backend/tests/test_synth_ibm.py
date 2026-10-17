from app.services.ibm_format import parse_patterns, parse_row
from app.services.synth_ibm import generate


def test_generate_is_valid_ibm_format_and_deterministic(tmp_path):
    t1, p1 = generate(tmp_path / "a", seed=7, n_accounts=200, n_txn=500)
    t2, _ = generate(tmp_path / "b", seed=7, n_accounts=200, n_txn=500)
    assert t1.read_text() == t2.read_text()
    lines = t1.read_text().splitlines()
    assert lines[0].startswith("Timestamp,From Bank")
    rows = [parse_row(line.split(","), i) for i, line in enumerate(lines[1:])]
    assert any(r["label"] == 1 for r in rows)
    attempts = parse_patterns(p1)
    assert {a["pattern"] for a in attempts} >= {"FAN-OUT", "CYCLE", "STACK", "SCATTER-GATHER"}
    # every attempt row is also present in the transactions file with label 1
    ids = {(r["ts"], r["src_acct"], r["dst_acct"]) for r in rows if r["label"] == 1}
    for a in attempts:
        for r in a["rows"]:
            assert (r["ts"], r["src_acct"], r["dst_acct"]) in ids
