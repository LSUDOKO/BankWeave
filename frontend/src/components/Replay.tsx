"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { get } from "@/lib/api";
import ProvenanceDag, { DagEdge, DagNode } from "./ProvenanceDag";
import Icon from "./Icon";
import { Card, Chip, Empty, btn } from "./ui";

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
  if (!events.length) return <Empty>No timeline recorded for this case.</Empty>;
  const ev = events[i];
  const t0 = events[0].ts;
  return (
    <div className="space-y-4">
      <div className="glass flex flex-wrap items-center gap-3 p-4">
        <button onClick={() => { if (i >= events.length - 1) setI(0); setPlaying(!playing); }} className={btn.primary}>
          {!playing && <Icon name={i >= events.length - 1 ? "refresh" : "play"} className="size-4" strokeWidth={2.2} />}
          {playing ? "Pause" : i >= events.length - 1 ? "Replay" : "Play"}
        </button>
        <input type="range" min={0} max={events.length - 1} value={i} onChange={(e) => { setPlaying(false); setI(+e.target.value); }} className="min-w-[160px] flex-1 accent-[var(--cyan)]" aria-label="Timeline position" />
        <Chip tone="blue"><span className="mono">step {i + 1}/{events.length} · +{((ev.ts - t0) / 1000).toFixed(1)} s</span></Chip>
      </div>
      <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card title="Revealed so far" pad="p-4">
          <div className="-mt-1 flex flex-wrap gap-1.5 text-xs">
            <Chip tone="warn">{counts.Evidence ?? 0} evidence</Chip><Chip tone="blue">{counts.Claim ?? 0} claims</Chip>
            <Chip tone="deep">{counts.Action ?? 0} actions</Chip><Chip>{counts.Sentence ?? 0} report sentences</Chip>
          </div>
          <ol className="scroll-thin mt-3 max-h-[440px] space-y-1.5 overflow-y-auto text-xs">
            {events.slice(0, i + 1).map((e, k) => (
              <li key={e.id} className={`rounded-xl px-2.5 py-1.5 ${k === i ? "bg-panel-2 text-paper" : "text-muted"}`}>
                <span className="font-semibold">{e.agent}</span> {e.action.replace("tool:", "called ")}
                {e.payload?.summary ? <span className="text-paper/70"> ({String(e.payload.summary).slice(0, 80)})</span> : null}
              </li>
            )).reverse()}
          </ol>
        </Card>
        <Card title="Provenance as it formed" pad="p-4" className="min-w-0">
          {dag ? <ProvenanceDag nodes={dag.nodes} edges={dag.edges} upTo={now} height={520} /> : <p className="text-sm text-muted">Loading DAG…</p>}
        </Card>
      </div>
    </div>
  );
}
