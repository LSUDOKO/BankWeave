"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import ModeBadge from "@/components/ModeBadge";
import { live } from "@/lib/snapshot";
import { useLiveReload } from "@/lib/useEvents";

type Overview = {
  alerts: { total: number; open?: number; cleared?: number; case?: number };
  cases: { total: number; open: number; pending_actions: number;
    recent: { id: string; title: string; status: string; claims: number; independent: number; flagged: number;
      pending_actions: number; sar: string | null }[] };
  claims: { claims: number; independent: number; flagged: number; paths: number; origins: number };
  evidence: { total: number; awaiting_review: number; by_state: Record<string, number> };
  falkordb: { region: string; graphs: number; case_graphs: number; version: string | null;
    memory: { used_mb: number; max_mb: number | null; pct: number | null } };
  agents: { worker: boolean; llm: boolean };
  ms: number;
};

export default function CommandCenter() {
  const [d, setD] = useState<Overview | null>(null);
  const [replay, setReplay] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(() => {
    live<Overview>("/overview").then(({ data, replay }) => { setD(data); setReplay(replay); setErr(null); })
      .catch(() => setErr("The API is unreachable and no snapshot is bundled."));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveReload(load, (e) => ["case", "claim", "alert", "state_change", "action", "sar"].includes(e.type));

  const a = d?.alerts;
  const decided = (a?.cleared ?? 0) + (a?.case ?? 0);
  const n = (x?: number) => Math.round(x ?? 0).toLocaleString();

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1>Command Center</h1>
            <p className="mt-1.5 max-w-[70ch] text-muted">
              Six agents work a shared FalkorDB graph: one graph per bank, one consortium graph, one graph per case.
              Every number below is a live query{d ? <> ({d.ms} ms)</> : null}.
            </p>
          </div>
          <ModeBadge mode={replay ? "replay" : undefined} />
        </header>
        {err && <p className="text-verify">{err}</p>}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Alerts waiting" value={n(a?.open)} sub={`${n(decided)} of ${n(a?.total)} decided by agents`} href="/alerts" />
          <Kpi label="Open cases" value={n(d?.cases.open)} sub={`${n(d?.cases.pending_actions)} actions await a human`} href="/cases" tone="text-cyan" />
          <Kpi label="Independently supported claims" value={`${n(d?.claims.independent)}`}
            sub={`of ${n(d?.claims.claims)} claims · ${n(d?.claims.paths)} paths → ${n(d?.claims.origins)} origins`} tone="text-ok" href="/trust" />
          <Kpi label="Evidence awaiting review" value={n(d?.evidence.awaiting_review)}
            sub={`${n(d?.claims.flagged)} claims flagged by the validity cascade`} tone="text-verify" href="/approvals" />
        </section>

        <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Engine d={d} />
          <div className="glass p-4">
            <h2>Golden scenarios</h2>
            <p className="mt-1 text-sm text-muted">Three captured investigations that open instantly, even when the API sleeps.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                ["A", "Innocent alert cleared by algo.wcc", "text-ok"],
                ["B", "Four-bank ring: 43.8% seen by one bank, 100% by the consortium", "text-ring"],
                ["C", "Shared address A-77 and device D00063: Skeptic challenge and cascade", "text-verify"],
              ].map(([k, t, c]) => (
                <li key={k}>
                  <Link href={`/scenarios#${k}`} className="glass-2 flex items-center gap-3 px-3 py-2 hover:border-cyan">
                    <span className={`kpi text-lg ${c}`}>{k}</span><span>{t}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="glass p-4">
          <div className="flex items-center justify-between">
            <h2>Recent cases</h2>
            <Link href="/cases" className="link text-sm">All cases</Link>
          </div>
          <table className="mt-3 w-full text-sm">
            <thead className="text-left text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-normal">Case</th>
                <th className="py-2 pr-3 font-normal">Claims (independent)</th>
                <th className="py-2 pr-3 font-normal">Status</th>
              </tr>
            </thead>
            <tbody>
              {d?.cases.recent.map((c) => (
                <tr key={c.id} className="border-b border-line/50">
                  <td className="py-2 pr-3">
                    <Link href={`/cases/${c.id}`} className="link mono">{c.id}</Link>
                    <span className="ml-2 text-paper/85">{c.title}</span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {c.claims} <span className="text-ok">({Math.round(c.independent)})</span>
                    {c.flagged > 0 && <span className="ml-2 text-verify">{c.flagged} flagged</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted">
                    {c.status.replace(/_/g, " ")}{c.pending_actions ? <span className="ml-2 text-cyan">approve</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d && !d.cases.recent.length && <p className="mt-3 text-muted">No cases yet. Start the agents from Demo control.</p>}
        </section>
      </div>
      <ActivityFeed />
    </div>
  );
}

function Kpi({ label, value, sub, tone = "text-paper", href }: { label: string; value: string; sub: string; tone?: string; href: string }) {
  return (
    <Link href={href} className="glass p-4 block hover:border-cyan transition-colors">
      <p className="text-xs uppercase tracking-wider text-muted">{label}</p>
      <p className={`kpi mt-1 text-3xl ${tone}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </Link>
  );
}

function Engine({ d }: { d: Overview | null }) {
  const m = d?.falkordb.memory;
  const pct = m?.pct ?? null;
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between">
        <h2>FalkorDB health</h2>
        <span className="badge text-cyan">{d?.falkordb.region ?? "…"}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-muted text-xs">Graphs</dt><dd className="kpi text-xl">{d?.falkordb.graphs ?? "…"}</dd></div>
        <div><dt className="text-muted text-xs">Case graphs</dt><dd className="kpi text-xl">{d?.falkordb.case_graphs ?? "…"}</dd></div>
        <div><dt className="text-muted text-xs">Engine</dt><dd className="kpi text-xl">{d?.falkordb.version ? `v${d.falkordb.version}` : "managed"}</dd></div>
      </dl>
      <div className="mt-4">
        <div className="flex justify-between text-xs text-muted">
          <span>Memory {m ? `${m.used_mb} MB` : ""}{m?.max_mb ? ` of ${m.max_mb} MB` : " (no cap)"}</span>
          {pct != null && <span>{Math.round(pct * 100)}%</span>}
        </div>
        <div className="relative mt-1 h-2 rounded bg-panel-2 overflow-hidden">
          <div className={`h-full ${pct != null && pct > 0.85 ? "bg-ring" : "bg-cyan"}`} style={{ width: `${Math.min(100, (pct ?? 0.2) * 100)}%` }} />
          {pct != null && <span className="absolute top-0 h-full w-px bg-verify" style={{ left: "85%" }} title="capacity guard prunes old cases above 85%" />}
        </div>
        <p className="mt-2 text-xs text-muted">
          Agents: {d ? (d.agents.worker ? "worker running" : "worker stopped") : "…"} · {d?.agents.llm ? "LLM reasoning on" : "deterministic plans"}
        </p>
      </div>
    </div>
  );
}
