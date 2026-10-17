from detection.passthrough import chain_value, match_pairs

P = {"max_gap_seconds": 100, "min_similarity": 0.98, "min_amount": 10, "min_pairs": 2}


def e(txn, ts, amt, cp="z", cur="USD"):
    return {"txn": txn, "ts": ts, "amt": amt, "cur": cur, "cp": cp}


def test_matching_uses_each_transfer_once_and_respects_rules():
    ins = [e("i1", 0, 1000), e("i2", 5, 1000), e("i3", 0, 500, cur="EUR")]
    outs = [e("o1", 10, 995), e("o2", 500, 1000), e("o3", 20, 990)]
    pairs = match_pairs(ins, outs, P)
    assert len(pairs) == 2                      # o2 too late, i3 wrong currency
    assert len({p["in_txn"] for p in pairs}) == 2 and len({p["out_txn"] for p in pairs}) == 2


def test_chain_value_counts_chain_once():
    a = [{"in_txn": "t1", "out_txn": "t2", "amount_in": 1000, "amount_out": 990}]
    b = [{"in_txn": "t2", "out_txn": "t3", "amount_in": 990, "amount_out": 980}]
    cv = chain_value({"A": a, "B": b})
    assert cv["total_value"] == 980 and cv["chains"][0]["length"] == 2
