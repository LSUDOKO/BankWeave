"""Agent telemetry as OpenTelemetry-shaped spans.

Each blackboard task opens a root span; tool calls and LLM calls inside it become child
spans. One case is one trace (trace id derived from the case id), so the waterfall shows the
whole investigation across workers. Spans are buffered per task and written to the case
graph as `(:Span)` nodes in one query when the task ends. If OTEL_EXPORTER_OTLP_ENDPOINT is
set (Langfuse, Jaeger, any OTLP/HTTP collector) they are also exported as OTLP JSON.
"""
from __future__ import annotations

import contextvars
import hashlib
import json
import logging
import os
import secrets
import threading
import time
from contextlib import contextmanager

from app import db
from app.cypher import cy

log = logging.getLogger(__name__)

_task: contextvars.ContextVar[dict | None] = contextvars.ContextVar("bw_task", default=None)
_parent: contextvars.ContextVar[str | None] = contextvars.ContextVar("bw_span", default=None)

WRITE = cy("telemetry_write_spans", "Store a task's spans in the case graph", """
UNWIND $spans AS s
CREATE (:Span {trace_id:s.trace_id, span_id:s.span_id, parent_id:s.parent_id, name:s.name,
               kind:s.kind, start_ns:s.start_ns, end_ns:s.end_ns, status:s.status,
               attrs:s.attrs})
""")

READ = cy("telemetry_read_spans", "Spans of a case trace, in start order", """
MATCH (s:Span)
RETURN s.trace_id AS trace_id, s.span_id AS span_id, s.parent_id AS parent_id, s.name AS name,
       s.kind AS kind, s.start_ns AS start_ns, s.end_ns AS end_ns, s.status AS status,
       s.attrs AS attrs
ORDER BY start_ns
""")


def trace_id_for(case_id: str) -> str:
    return hashlib.sha256(case_id.encode()).hexdigest()[:32]


@contextmanager
def span(name: str, kind: str = "internal", case_id: str | None = None, **attrs):
    """Open a span. With case_id and no active task it becomes a root span that owns the
    buffer and writes all spans to the case graph on exit."""
    task = _task.get()
    root = task is None and case_id is not None
    if root:
        task = {"case_id": case_id, "trace_id": trace_id_for(case_id), "spans": []}
        tok_task = _task.set(task)
    sid = secrets.token_hex(8)
    parent = None if root else _parent.get()
    tok_parent = _parent.set(sid)
    rec = {"trace_id": task["trace_id"] if task else None, "span_id": sid,
           "parent_id": parent, "name": name, "kind": kind,
           "start_ns": time.time_ns(), "end_ns": None, "status": "ok", "attrs": dict(attrs)}
    try:
        yield rec["attrs"]
    except Exception as exc:
        rec["status"] = "error"
        rec["attrs"]["error"] = f"{type(exc).__name__}: {str(exc)[:200]}"
        raise
    finally:
        rec["end_ns"] = time.time_ns()
        _parent.reset(tok_parent)
        if task is not None:
            task["spans"].append(rec)
        if root:
            _task.reset(tok_task)
            _flush(task)


def _flush(task: dict) -> None:
    spans = [{**s, "attrs": json.dumps(s["attrs"], default=str)[:4000]} for s in task["spans"]]
    g = db.case_graph(task["case_id"])
    try:
        if g in db.list_graphs():
            db.q(g, WRITE, {"spans": spans})
    except Exception as exc:  # noqa: BLE001  (telemetry must never break an agent)
        log.warning("span write failed: %s", exc)
    if os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT"):
        threading.Thread(target=_export, args=(spans,), daemon=True).start()


def _export(spans: list[dict]) -> None:
    import httpx
    endpoint = os.environ["OTEL_EXPORTER_OTLP_ENDPOINT"].rstrip("/") + "/v1/traces"
    headers = dict(h.split("=", 1) for h in os.getenv("OTEL_EXPORTER_OTLP_HEADERS", "").split(",")
                   if "=" in h)

    def attr(k, v):
        return {"key": k, "value": {"stringValue": str(v)}}
    body = {"resourceSpans": [{
        "resource": {"attributes": [attr("service.name", "bankweave-agents")]},
        "scopeSpans": [{"scope": {"name": "bankweave"}, "spans": [{
            "traceId": s["trace_id"], "spanId": s["span_id"],
            **({"parentSpanId": s["parent_id"]} if s["parent_id"] else {}),
            "name": s["name"], "kind": 1, "startTimeUnixNano": str(s["start_ns"]),
            "endTimeUnixNano": str(s["end_ns"]),
            "status": {"code": 2 if s["status"] == "error" else 1},
            "attributes": [attr(k, v) for k, v in json.loads(s["attrs"]).items()],
        } for s in spans]}]}]}
    try:
        httpx.post(endpoint, json=body, headers=headers, timeout=5)
    except Exception as exc:  # noqa: BLE001
        log.warning("OTLP export failed: %s", exc)


def case_trace(case_id: str) -> list[dict]:
    rows = db.ro(db.case_graph(case_id), READ)
    for r in rows:
        try:
            r["attrs"] = json.loads(r["attrs"] or "{}")
        except ValueError:
            r["attrs"] = {}
    return rows
