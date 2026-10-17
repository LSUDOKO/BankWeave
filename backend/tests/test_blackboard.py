import threading
import time

from app import db
from agents.blackboard import Blackboard


def test_claim_is_exclusive_under_concurrency():
    g = "test_bb"
    db.drop_graph(g)
    bb = Blackboard(g)
    ids = [bb.create("triage", alert_id=f"A{i}") for i in range(20)]
    won: list[str] = []
    lock = threading.Lock()

    def worker(name):
        while True:
            t = bb.claim(name, ["triage"])
            if not t:
                return
            with lock:
                won.append(t["id"])
            bb.done(t["id"])

    threads = [threading.Thread(target=worker, args=(f"w{i}",)) for i in range(6)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(won) == sorted(ids)           # every task done exactly once
    db.drop_graph(g)


def test_stale_claim_is_reset_for_resume():
    g = "test_bb2"
    db.drop_graph(g)
    bb = Blackboard(g)
    tid = bb.create("investigate", case_id="C-1")
    t = bb.claim("dead-worker", ["investigate"])
    assert t["id"] == tid
    assert bb.claim("other", ["investigate"]) is None
    time.sleep(1.1)
    reset = bb.reset_stale(1)
    assert [r["id"] for r in reset] == [tid] and reset[0]["from_agent"] == "dead-worker"
    assert bb.claim("new-worker", ["investigate"])["id"] == tid
    db.drop_graph(g)
