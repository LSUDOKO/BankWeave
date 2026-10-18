"use client";
import { useEffect, useMemo, useState } from "react";
import { get } from "@/lib/api";
import { Card, Chip, Empty } from "./ui";

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
  if (!d) return <div className="glass h-48 animate-pulse" />;
  if (!rows.length) return <Empty>No spans recorded yet. Spans are written when an agent task on this case finishes (cases opened before telemetry existed have none).</Empty>;
  const t0 = Math.min(...d.spans.map((s) => s.start_ns));
  const t1 = Math.max(...d.spans.map((s) => s.end_ns));
  const span = Math.max(1, t1 - t0);
  const ms = (ns: number) => (ns / 1e6).toFixed(ns > 1e8 ? 0 : 1);
  const totals = d.spans.reduce<Record<string, number>>((a, s) => { const k = s.name.split(".")[0]; a[k] = (a[k] ?? 0) + (s.end_ns - s.start_ns); return a; }, {});
  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center gap-2 p-4 text-sm">
        <span>Trace <span className="mono text-cyan">{d.trace_id.slice(0, 16)}</span></span>
        <Chip>{d.spans.length} spans over {ms(span)} ms</Chip>
        <Chip tone="ok"><i className="size-2 rounded-full bg-ok" />agents {ms(totals.agent ?? 0)} ms</Chip>
        <Chip tone="blue"><i className="size-2 rounded-full bg-cyan" />tools {ms(totals.tool ?? 0)} ms</Chip>
        <span className="inline-flex items-center gap-1 rounded-md bg-[#f1ecfd] px-1.5 py-px text-[11px] font-medium text-[var(--bank-1)]"><i className="size-2 rounded-full bg-[var(--bank-1)]" />LLM {ms(totals.llm ?? 0)} ms</span>
        <span className="ml-auto text-xs text-muted">OpenTelemetry span shape; exported over OTLP when OTEL_EXPORTER_OTLP_ENDPOINT is set</span>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card title="Waterfall" pad="p-4" className="min-w-0 overflow-x-auto">
          <ol className="min-w-[640px] space-y-0.5">
            {rows.map(({ s, depth }) => (
              <li key={s.span_id} className={`grid cursor-pointer grid-cols-[260px_1fr] items-center gap-2 rounded-lg px-1.5 py-0.5 text-xs hover:bg-panel-2/60 ${sel?.span_id === s.span_id ? "bg-panel-2" : ""}`} onClick={() => setSel(s)}>
                <span className="mono truncate" style={{ paddingLeft: depth * 14 }} title={s.name}>{s.name}</span>
                <span className="relative h-5">
                  <span className={`absolute top-1.5 h-2 rounded-full ${TONE(s.name, s.status)}`}
                    style={{ left: `${((s.start_ns - t0) / span) * 100}%`, width: `max(4px, ${((s.end_ns - s.start_ns) / span) * 100}%)` }} />
                  <span className="absolute right-0 top-0.5 text-[10px] text-muted">{ms(s.end_ns - s.start_ns)} ms</span>
                </span>
              </li>
            ))}
          </ol>
        </Card>
        <Card title="Span" pad="p-4" className="h-fit text-xs">
          {!sel ? <Empty>Select a span to see its attributes.</Empty> : (
            <>
              <p className="mono text-sm">{sel.name}</p>
              <p className="mt-1 flex flex-wrap gap-1.5 text-muted"><Chip tone={sel.status === "error" ? "ring" : "ok"}>{sel.status}</Chip><Chip>{sel.kind}</Chip></p>
              <p className="mt-1.5 text-muted">span <span className="mono">{sel.span_id}</span> · parent <span className="mono">{sel.parent_id ?? "none"}</span></p>
              <pre className="mono scroll-thin mt-3 max-h-80 overflow-auto rounded-xl border border-line bg-ink p-2.5">{JSON.stringify(sel.attrs, null, 2)}</pre>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
