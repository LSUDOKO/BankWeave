from app import db


def test_ro_all_reads_past_resultset_limit():
    g = "test_paging"
    db.drop_graph(g)
    db.q(g, "UNWIND range(1, 12345) AS i CREATE (:N {id:i})")
    capped = db.ro(g, "MATCH (n:N) RETURN n.id AS id")
    assert len(capped) == 10000                        # FalkorDB default RESULTSET_SIZE
    rows = db.ro_all(g, "MATCH (n:N) RETURN n.id AS id ORDER BY id SKIP $skip LIMIT $limit")
    assert len(rows) == 12345 and len({r["id"] for r in rows}) == 12345
    db.drop_graph(g)
