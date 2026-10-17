"""Integration fixtures: a real FalkorDB with a small synthetic dataset.

Graphs are prefixed `test_` so they never collide with demo data.
"""
import json

import pytest

from app import db
from app.config import ROOT
from app.services.loader import load
from app.services.synth_ibm import generate

PREFIX = "test_"


@pytest.fixture(scope="session")
def loaded(tmp_path_factory):
    out = tmp_path_factory.mktemp("synth")
    trans, pats = generate(out, "T", seed=3, n_accounts=250, n_txn=1500, attempts_per_pattern=1)
    meta = load(trans, pats, top_n=4, prefix=PREFIX)
    gt = json.loads((ROOT / "eval" / f"{PREFIX}ground_truth.json").read_text())
    yield {"meta": meta, "gt": gt, "consortium": PREFIX + db.CONSORTIUM}
    for g in db.list_graphs():
        if g.startswith(PREFIX):
            db.drop_graph(g)
