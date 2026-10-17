"use client";
import { useEffect, useMemo, useState } from "react";
import { get } from "@/lib/api";

type Span = { trace_id: string; span_id: string; parent_id: string | null; name: string; kind: string;
  start_ns: number; end_ns: number; status: string; attrs: Record<string, any> };

const TONE = (name: string, status: string) =>
  status === "error" ? "bg-ring" : name.startsWith("llm.") ? "bg-[var(--bank-1)]" : name.startsWith("tool.") ? "bg-cyan" : "bg-ok";

/** Trace waterfall of OpenTelemetry-shaped spans: agent task → tool calls and LLM calls. */
export default function TraceWaterfall({ caseId }: { caseId: string }) {
  const [d, setD] = useState<{ trace_id: string; spans: Span[] } | null>(null);
  const [sel, setSel] = useState<Span | null>(null);
  useEffect(() => { get(`/cases/${caseId}/trace`).then(setD).catch(() => setD({ trace_id: "", spans: [] })); }, [caseId]);
  const rows = useMemo(() => {
    if (!d?.spans.length) return [];
    const kids = new Map<string | null, Span[]>();
    for (const s of d.spans) kids.set(s.parent_id, [...(kids.get(s.parent_id) ?? []), s]);
    const out: { s: Span; depth: number }[] = [];
    const walk = (p: string | null, depth: number) => {
      for (const s of (kids.get(p) ?? []).sort((a, b) => a.start_ns - b.start_ns)) { out.push({ s, depth }); walk(s.span_id, depth + 1); }
    };
    walk(null, 0);
    return out;
  }, [d]);
  if (!d) return <p className="text-muted">Loading trace…</p>;
  if (!rows.length) return <p className="text-muted">No spans recorded yet. Spans are written when an agent task on this case finishes (cases opened before telemetry existed have none).</p>;
  const t0 = Math.min(...d.spans.map((s) => s.start_ns));
  const t1 = Math.max(...d.spans.map((s) => s.end_ns));
  const span = Math.max(1, t1 - t0);
  const ms = (ns: number) => (ns / 1e6).toFixed(ns > 1e8 ? 0 : 1);
  const totals = d.spans.reduce<Record<string, number>>((a, s) => { const k = s.name.split(".")[0]; a[k] = (a[k] ?? 0) + (s.end_ns - s.start_ns); return a; }, {});
  return (
    <div className="space-y-3">
      <div className="glass p-3 flex flex-wrap gap-4 text-sm">
        <span>Trace <span className="mono text-cyan">{d.trace_id.slice(0, 16)}</span></span>
        <span className="text-muted">{d.spans.length} spans over {ms(span)} ms</span>
        <span className="text-ok">agents {ms(totals.agent ?? 0)} ms</span>
        <span className="text-cyan">tools {ms(totals.tool ?? 0)} ms</span>
        <span className="text-[var(--bank-1)]">LLM {ms(totals.llm ?? 0)} ms</span>
        <span className="text-xs text-muted ml-auto">OpenTelemetry span shape; exported over OTLP when OTEL_EXPORTER_OTLP_ENDPOINT is set</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="glass p-3 overflow-x-auto">
          <ol className="min-w-[640px] space-y-0.5">
            {rows.map(({ s, depth }) => (
              <li key={s.span_id} className={`grid grid-cols-[260px_1fr] items-center gap-2 text-xs cursor-pointer rounded hover:bg-panel-2/60 ${sel?.span_id === s.span_id ? "bg-panel-2" : ""}`} onClick={() => setSel(s)}>
                <span className="truncate mono" style={{ paddingLeft: depth * 14 }} title={s.name}>{s.name}</span>
                <span className="relative h-4">
                  <span className={`absolute top-1 h-2 rounded ${TONE(s.name, s.status)}`}
                    style={{ left: `${((s.start_ns - t0) / span) * 100}%`, width: `max(2px, ${((s.end_ns - s.start_ns) / span) * 100}%)` }} />
                  <span className="absolute right-0 text-[10px] text-muted">{ms(s.end_ns - s.start_ns)} ms</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="glass p-3 text-xs">
          {!sel ? <p className="text-muted">Select a span to see its attributes.</p> : (
            <>
              <p className="mono text-sm">{sel.name}</p>
              <p className="text-muted">span {sel.span_id} · parent {sel.parent_id ?? "none"} · {sel.kind} · {sel.status}</p>
              <pre className="mt-2 mono rounded bg-ink/70 p-2 overflow-auto max-h-80">{JSON.stringify(sel.attrs, null, 2)}</pre>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
