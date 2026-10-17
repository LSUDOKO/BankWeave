"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Handle, Layers, View } from "@/components/Consortium3D";
import ModeBadge from "@/components/ModeBadge";
import { get, post } from "@/lib/api";
import { setBankOrder } from "@/lib/banks";
import { live } from "@/lib/snapshot";

const Consortium3D = dynamic(() => import("@/components/Consortium3D"), {
  ssr: false, loading: () => <div className="h-[620px] grid place-items-center text-muted">Loading the 3D engine…</div>,
});

export default function Consortium3DPage() {
  const [data, setData] = useState<Layers | null>(null);
  const [replay, setReplay] = useState(false);
  const [view, setView] = useState<View>({ bank: true, consortium: true, cases: true });
  const [caseId, setCaseId] = useState("");
  const [locked, setLocked] = useState<string | null>(null);
  const g = useRef<Handle>(null);
  useEffect(() => {
    live<Layers>("/network/layers", 10000).then(({ data, replay }) => {
      setBankOrder(data.banks); setData(data); setReplay(replay);
      const best = [...data.cases].sort((a, b) => b.claims.length - a.claims.length)[0];
      if (best) setCaseId(best.id);
      // prefer the case whose claim repeats one origin the most: the clearest echo
      get("/trust/echo").then((e) => {
        const top = e.claims.filter((c: any) => data.cases.some((k) => k.id === c.case_id))
          .sort((a: any, b: any) => (b.paths - b.sources) - (a.paths - a.sources))[0];
        if (top && top.paths > top.sources) setCaseId(top.case_id);
      }).catch(() => {});
    }).catch(() => {});
  }, []);
  const shock = async () => {
    setLocked(null);
    await g.current?.shockwave(caseId);
    setLocked(caseId);
  };
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>3D consortium</h1>
          <p className="mt-1.5 max-w-[80ch] text-muted">
            Bottom: each bank&apos;s own slice, walled in by external stubs it cannot investigate. Middle: the consortium graph,
            where hashed ids join the slices into one money network (particles are FLOWS, the cyan node is the PageRank hub).
            Top: the cases the agents opened and their claims. Vertical threads are the same account seen at two levels.
          </p>
        </div>
        <ModeBadge mode={replay ? "replay" : undefined} />
      </header>
      <div className="glass p-3 flex flex-wrap items-center gap-2 text-sm">
        {(["bank", "consortium", "cases"] as const).map((k) => (
          <label key={k} className="flex items-center gap-1.5 rounded border border-line px-2 py-1">
            <input type="checkbox" checked={view[k]} onChange={(e) => setView((v) => ({ ...v, [k]: e.target.checked }))} className="accent-[var(--cyan)]" />
            {k === "bank" ? "Bank slices" : k === "consortium" ? "Consortium" : "Cases & claims"}
          </label>
        ))}
        <button onClick={() => setView({ bank: true, consortium: false, cases: false })} className="rounded border border-line px-2 py-1 hover:border-cyan">Bank view only</button>
        <button onClick={() => setView({ bank: true, consortium: true, cases: true })} className="rounded border border-line px-2 py-1 hover:border-cyan">Everything</button>
        <span className="mx-1 h-5 w-px bg-line" />
        <button onClick={() => g.current?.flyThrough()} className="rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1">Fly through</button>
        <button onClick={() => g.current?.focusHub()} className="rounded border border-line px-2 py-1 hover:border-cyan">Hub</button>
      </div>
      {data ? <Consortium3D ref={g} data={data} view={view} height={620} /> : <div className="h-[620px] glass grid place-items-center text-muted">Loading graph layers…</div>}
      {data && (
        <p className="text-xs text-muted">{data.accounts.length} focus accounts across {data.banks.length} banks · {data.consortium_edges.length} consortium money links ·
          {" "}{data.bank_edges.length} links visible inside single banks · {data.externals.length} external stubs · {data.cases.length} cases</p>
      )}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="glass p-4 space-y-2 text-sm">
          <h2>Invalidation shockwave</h2>
          <p className="text-muted">A superseded fact spreads up the provenance graph: evidence to claims to actions. Watch the case go emerald → amber → crimson.</p>
          <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className="w-full rounded bg-ink border border-line px-2 py-1 mono text-xs">
            {data?.cases.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.claims.length} claims</option>)}
          </select>
          <button onClick={shock} disabled={!caseId} className="rounded-md bg-ring/10 border border-ring text-ring px-3 py-1.5 disabled:opacity-40">Send shockwave</button>
          {locked && <p className="text-ring text-xs"><b>Approve SAR locked</b> for {locked} until the premises are re-verified. This is the animation; the real cascade runs when you revoke evidence on the <Link href={`/cases/${locked}`} className="link">case page</Link>.</p>}
        </div>
        <EchoCollapse caseId={caseId} />
        <KillResume />
      </div>
    </div>
  );
}

/** Echo collapse: a claim's supporting paths fold into the origins they rest on. */
function EchoCollapse({ caseId }: { caseId: string }) {
  const [d, setD] = useState<any>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(false);
    if (caseId) get(`/cases/${caseId}/independence`).then((x) => {
      const c = [...x.claims].sort((a: any, b: any) => b.paths - b.origins - (a.paths - a.origins))[0];
      setD(c ?? null);
    }).catch(() => setD(null));
  }, [caseId]);
  const paths: { g: number; i: number }[] = [];
  d?.groups.forEach((gr: any, gi: number) => gr.evidence_ids.forEach((_: string, i: number) => paths.push({ g: gi, i })));
  const W = 300, H = 150;
  const nG = Math.max(1, d?.groups.length ?? 1);
  return (
    <div className="glass p-4 space-y-2 text-sm">
      <h2>Echo collapse</h2>
      {!d ? <p className="text-muted">Pick a case with claims.</p> : (
        <>
          <p className="text-muted">{d.paths} paths behind “{d.text.slice(0, 70)}…” rest on {d.origins} origins. Confidence counts origins.</p>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
            {d.groups.map((gr: any, gi: number) => (
              <g key={gr.origin}>
                <circle cx={((gi + 0.5) / nG) * W} cy={H - 22} r={7} fill="#10b981" />
                <text x={((gi + 0.5) / nG) * W} y={H - 4} fontSize={8} fill="#94a3b8" textAnchor="middle">{gr.kind}</text>
              </g>
            ))}
            {paths.map((p, k) => {
              const x0 = ((k + 0.5) / paths.length) * W, x1 = ((p.g + 0.5) / nG) * W;
              return <circle key={k} r={4} fill="#06b6d4" style={{ transition: "all 1.2s cubic-bezier(.4,0,.2,1)" }}
                cx={collapsed ? x1 : x0} cy={collapsed ? H - 22 : 24} opacity={collapsed ? 0.25 : 1} />;
            })}
          </svg>
          <div className="flex items-center gap-3">
            <button onClick={() => setCollapsed(!collapsed)} className="rounded-md border border-line px-3 py-1 hover:border-cyan">{collapsed ? "Expand paths" : "Collapse to origins"}</button>
            <span className="text-xs text-muted">naive {Math.round(d.naive * 100)}% → echo-proof <span className="text-ok">{Math.round(d.confidence * 100)}%</span></span>
          </div>
        </>
      )}
    </div>
  );
}

/** Kill the agent worker mid-investigation; stale tasks are reset after the heartbeat
 *  timeout and a fresh worker resumes from the case graph. */
function KillResume() {
  const [s, setS] = useState<any>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const poll = () => get("/demo/status").then(setS).catch(() => {});
  useEffect(() => { poll(); const id = setInterval(poll, 3000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (left == null) return;
    if (left <= 0) {
      post("/demo/worker/start").then(() => { setLog((l) => ["fresh worker started: it claims the reset tasks and resumes from the case graph", ...l]); poll(); });
      setLeft(null);
      return;
    }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  const kill = async () => {
    await post("/demo/worker/kill");
    setLog(["worker killed mid-task: heartbeats stop", ...log]);
    setLeft(32);
    poll();
  };
  const running = s?.worker?.running;
  return (
    <div className="glass p-4 space-y-2 text-sm">
      <h2>Kill and resume</h2>
      <p className="text-muted">Agents coordinate through Task nodes with heartbeats. Kill the worker: after 30 s without a heartbeat the orchestrator resets its tasks and another worker continues.</p>
      <div className="flex items-center gap-2">
        <span className={`size-3 rounded-full ${running ? "bg-ok pulse-soft" : "bg-ring"}`} />
        <span>{running ? `worker ${s.worker.name} running (${s.worker.processed} tasks done)` : "worker stopped"}</span>
      </div>
      <p className="text-xs text-muted">Blackboard: {s?.blackboard?.map((b: any) => `${b.type} ${b.status} ${b.n}`).join(" · ") || "empty"}</p>
      <div className="flex items-center gap-3">
        <button onClick={kill} disabled={!running || left != null} className="rounded-md bg-ring/10 border border-ring text-ring px-3 py-1.5 disabled:opacity-40">Kill worker</button>
        {left != null && <span className="kpi text-2xl text-verify tabular-nums">{left}s</span>}
        {left != null && <span className="text-xs text-muted">heartbeat timeout, then resume</span>}
      </div>
      <ul className="text-xs text-muted space-y-0.5">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>
    </div>
  );
}
