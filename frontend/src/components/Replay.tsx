"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { get } from "@/lib/api";
import ProvenanceDag, { DagEdge, DagNode } from "./ProvenanceDag";

type Ev = { id: string; ts: number; agent: string; action: string; payload?: any };

/** Replay Investigation: steps through the case's HAD_EVENT -> NEXT timeline and reveals the
 *  claims, evidence and actions in the order the agents created them. */
export default function Replay({ caseId, dag }: { caseId: string; dag: { nodes: DagNode[]; edges: DagEdge[] } | null }) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { get(`/cases/${caseId}/timeline`).then((d) => { setEvents(d.events); setI(0); }); }, [caseId]);
  useEffect(() => {
    if (!playing) return;
    timer.current = setInterval(() => setI((x) => {
      if (x >= events.length - 1) { setPlaying(false); return x; }
      return x + 1;
    }), 650);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, events.length]);
  const now = events[i]?.ts ?? null;
  const counts = useMemo(() => {
    const vis = (dag?.nodes ?? []).filter((n) => now == null || n.ts == null || n.ts <= now);
    const c: Record<string, number> = {};
    for (const n of vis) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [dag, now]);
  if (!events.length) return <p className="text-muted">No timeline recorded for this case.</p>;
  const ev = events[i];
  const t0 = events[0].ts;
  return (
    <div className="space-y-3">
      <div className="glass p-3 flex flex-wrap items-center gap-3">
        <button onClick={() => { if (i >= events.length - 1) setI(0); setPlaying(!playing); }}
          className="rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1 text-sm">{playing ? "Pause" : i >= events.length - 1 ? "Replay" : "Play"}</button>
        <input type="range" min={0} max={events.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(+e.target.value); }} className="flex-1 accent-[var(--cyan)]" aria-label="Timeline position" />
        <span className="mono text-xs text-muted">step {i + 1}/{events.length} · +{((ev.ts - t0) / 1000).toFixed(1)} s</span>
      </div>
      <div className="grid gap-3 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="glass p-3">
          <p className="text-xs text-muted">Revealed so far</p>
          <p className="mt-1 text-sm">{counts.Evidence ?? 0} evidence · {counts.Claim ?? 0} claims · {counts.Action ?? 0} actions · {counts.Sentence ?? 0} report sentences</p>
          <ol className="mt-3 max-h-[440px] overflow-y-auto scroll-thin space-y-1 text-xs">
            {events.slice(0, i + 1).map((e, k) => (
              <li key={e.id} className={k === i ? "text-paper" : "text-muted"}>
                <span className="font-semibold">{e.agent}</span> {e.action.replace("tool:", "called ")}
                {e.payload?.summary ? <span className="text-paper/70"> ({String(e.payload.summary).slice(0, 80)})</span> : null}
              </li>
            )).reverse()}
          </ol>
        </div>
        {dag && <ProvenanceDag nodes={dag.nodes} edges={dag.edges} upTo={now} height={520} />}
      </div>
    </div>
  );
}
