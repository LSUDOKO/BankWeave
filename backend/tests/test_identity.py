from app import db
from app.services import kyc_synth
from detection import identity as idn


def test_identity_tools(loaded):
    g = loaded["consortium"]
    kyc_synth.run(prefix="test_", with_postgres=False)
    v = db.q(g, "MATCH (p:Person) WHERE p.id ENDS WITH 'v' RETURN p.name AS n LIMIT 1")
    if v:  # a spelling variant should find its original identity phonetically
        res = idn.resolve_entity(g, v[0]["n"])["result"]
        assert len(res) >= 2
    acct = db.q(g, "MATCH (a:Account) RETURN a.id AS id LIMIT 1")[0]["id"]
    nb = idn.behavior_neighbors(g, acct, 5)["result"]
    assert nb and all(r["account"] != acct for r in nb)
    assert idn.shared_attr_context(g, acct)["result"]
    assert isinstance(idn.cross_bank_links(g, acct)["result"], list)
