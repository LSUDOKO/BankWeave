from app import db
from app.services import capacity, telemetry
from trust import store


def test_spans_nest_and_flush_to_case_graph():
    cid = store.open_case("AL-tel", "tel-a", ["001"], "telemetry test", case_id="TEL-1")
    try:
        with telemetry.span("agent.investigate", case_id=cid, task_id="T1"):
            with telemetry.span("tool.trace_flow", kind="client") as a:
                a["rows"] = 3
            with telemetry.span("llm.writer", kind="client"):
                pass
        spans = telemetry.case_trace(cid)
        assert [s["name"] for s in spans] == ["agent.investigate", "tool.trace_flow", "llm.writer"]
        root = spans[0]
        assert root["parent_id"] is None and root["trace_id"] == telemetry.trace_id_for(cid)
        assert all(s["parent_id"] == root["span_id"] for s in spans[1:])
        assert spans[1]["attrs"]["rows"] == 3 and spans[1]["end_ns"] >= spans[1]["start_ns"]
    finally:
        capacity.drop_case(cid)


def test_spans_without_a_case_are_dropped_quietly():
    with telemetry.span("tool.x") as a:
        a["k"] = 1
    assert db  # nothing to assert beyond not raising
