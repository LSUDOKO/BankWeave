import json

from app import events


def test_local_bus_without_redis(monkeypatch):
    monkeypatch.setattr(events, "use_redis", lambda: False)
    q = events.LOCAL.subscribe()
    events.publish("claim", "case_x", "CL-1", {"text": "t"}, agent="investigator")
    e = json.loads(q.get(timeout=1))
    assert e["type"] == "claim" and e["agent"] == "investigator"
    events.LOCAL.unsubscribe(q)
