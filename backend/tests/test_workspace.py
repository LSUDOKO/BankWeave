import hashlib

from app import db
from app.routers import workspace
from app.services import merkle
from trust import store


def test_merkle_rfc6962_shape():
    a, b, c = (merkle.leaf_hash(x) for x in (b"a", b"b", b"c"))
    assert merkle.root_of([a]) == a
    assert merkle.root_of([a, b]) == hashlib.sha256(b"\x01" + a + b).digest()
    # odd node is carried up, not duplicated
    assert merkle.root_of([a, b, c]) == merkle.node_hash(merkle.node_hash(a, b), c)


def _case():
    cid = store.open_case("AL-ws", "ws-a", ["001"], "workspace test", case_id="WS-1")
    g = db.case_graph(cid)
    db.q(g, "CREATE (:Account {id:'ws-a', bank_id:'001'})-[:FLOWS {capacity:100.0}]->"
            "(:Account {id:'ws-hub', bank_id:'002'})-[:FLOWS {capacity:80.0}]->"
            "(:Account {id:'ws-z', bank_id:'003'})")
    e1 = store.add_evidence(cid, "path", "flow:ws-a->ws-hub", "a pays hub", {}, "MATCH ...", "t")
    e2 = store.add_evidence(cid, "shared_attr", "attr:D1", "shared device", {}, "MATCH ...", "t")
    store.add_claim(cid, "hub collects funds", "hub", [e1, e2], "t", ["ws-hub"])
    return cid, e2


def test_seal_breaks_when_evidence_is_revoked_and_freeze_blocks_flow():
    cid, e2 = _case()
    try:
        before = merkle.case_root(cid)["root"]
        assert merkle.case_root(cid)["root"] == before  # deterministic
        out = workspace.revoke(cid, e2, workspace.Revoke(reason="device belongs to a hotel"))
        assert out["merkle_before"] == before and out["merkle_after"] != before
        assert out["changes"] and out["changes"][0]["state_after"] == "needs_verification"
        f = workspace.simulate_freeze(cid, workspace.Freeze(account="ws-hub"))
        assert f["before"]["max_flow"] == 80.0 and f["after"]["max_flow"] == 0.0
        assert f["liquidity_blocked_pct"] == 100.0
        assert not any(g.startswith(db.case_graph(cid) + "__freeze") for g in db.list_graphs())
        ind = workspace.independence(cid)
        assert ind["paths"] == 1 and ind["origins"] == 1  # superseded evidence no longer counts
    finally:
        from app.services import capacity
        capacity.drop_case(cid)
