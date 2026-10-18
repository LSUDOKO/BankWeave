"use client";
import { useEffect, useMemo, useState } from "react";
import { get } from "@/lib/api";
import WeaveGraph from "./WeaveGraph";
import { Card, Chip, Empty } from "./ui";

/** Bi-temporal view of a case. Transaction time: which transfers had happened by T.
 *  Knowledge time: what the agents believed at T (claims, support, validity state), using the
 *  history the validity lattice keeps instead of overwriting. */
export default function TimeMachine({ caseId, graph, banks }: { caseId: string; graph: any; banks: string[] }) {
  const edges = graph?.edges ?? [];
  const [tTx, setTx] = useState<number | null>(null);
  const [tKn, setKn] = useState<number | null>(null);
  const [events, setEvents] = useState<{ ts: number }[]>([]);
  const [beliefs, setBeliefs] = useState<any[]>([]);
  const txRange = useMemo(() => {
    const ts = edges.map((e: any) => e.ts).filter(Boolean);
    return ts.length ? [Math.min(...ts), Math.max(...ts)] : [0, 0];
  }, [edges]);
  useEffect(() => { setTx(txRange[1] || null); }, [txRange]);
  useEffect(() => { get(`/cases/${caseId}/timeline`).then((d) => { setEvents(d.events); const last = d.events.at(-1)?.ts; setKn(last ?? null); }); }, [caseId]);
  useEffect(() => { if (tKn) get(`/cases/${caseId}/as_of?ts=${Math.round(tKn)}`).then((d) => setBeliefs(d.beliefs)); }, [caseId, tKn]);
  const knRange = events.length ? [events[0].ts, Math.max(events.at(-1)!.ts, Date.now())] : [0, 0];
  const shown = edges.filter((e: any) => tTx == null || !e.ts || e.ts <= tTx);
  const nodes = (graph?.nodes ?? []).map((n: any) => ({ ...n, kind: "account" }));
  const fmt = (s: number) => new Date(s * 1000).toISOString().slice(0, 16).replace("T", " ");
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card title="Transaction time" action={<Chip tone="blue">{shown.length} / {edges.length} transfers</Chip>} className="space-y-3 text-sm">
        <p className="-mt-2 text-muted">When the money moved. Drag to replay the ring forming: {shown.length} of {edges.length} transfers by {tTx ? fmt(tTx) : "–"} UTC.</p>
        <input type="range" min={txRange[0]} max={txRange[1]} value={tTx ?? txRange[1]} onChange={(e) => setTx(+e.target.value)} className="w-full accent-[var(--cyan)]" aria-label="Transaction time" />
        <div className="overflow-hidden rounded-2xl border border-line"><WeaveGraph nodes={nodes} edges={shown} banks={banks} height={300} /></div>
      </Card>
      <Card title="Knowledge time" action={<Chip tone="deep">{beliefs.length} claims existed</Chip>} className="space-y-3 text-sm">
        <p className="-mt-2 text-muted">What the agents believed. Superseded evidence is kept with its timestamps, so any past state can be asked for.</p>
        <input type="range" min={knRange[0]} max={knRange[1]} value={tKn ?? knRange[1]} onChange={(e) => setKn(+e.target.value)} className="w-full accent-[var(--cyan)]" aria-label="Knowledge time" />
        <p className="text-xs text-muted">as of {tKn ? new Date(tKn).toLocaleString() : "–"} · {beliefs.length} claims existed</p>
        <ul className="scroll-thin max-h-[300px] space-y-2 overflow-y-auto">
          {beliefs.map((b) => (
            <li key={b.claim} className="rounded-2xl border border-line p-3 text-xs">
              <p className="flex items-center gap-2"><Chip tone={b.state_then === "active" ? "ok" : "warn"}>{b.state_then}</Chip><span className="text-muted">{b.support_then} supporting item(s)</span></p>
              <p className="mt-1.5 text-paper/85">{b.text}</p>
            </li>
          ))}
          {!beliefs.length && <li><Empty>No claims yet at this time.</Empty></li>}
        </ul>
      </Card>
    </div>
  );
}
