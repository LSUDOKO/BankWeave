from detection import clue_expand


def test_expand_respects_negatives_and_round_cap(loaded):
    g = loaded["consortium"]
    from detection import precompute
    precompute.run(g)
    att = max(loaded["gt"]["attempts"], key=lambda a: len(a["members"]))
    clues = att["members"][:2]
    r = clue_expand.expand(g, clues, theta=0.0, max_rounds=3, per_round=2)["result"]
    assert len(r["rounds"]) <= 3
    assert not set(r["members"]) & set(clues)
    if r["members"]:
        neg = r["members"][0]
        r2 = clue_expand.expand(g, clues, negatives=[neg], theta=0.0, max_rounds=3)["result"]
        assert neg not in r2["members"]
