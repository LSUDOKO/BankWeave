"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import Icon from "@/components/Icon";
import ModeBadge from "@/components/ModeBadge";
import { live } from "@/lib/snapshot";
import { useLiveReload } from "@/lib/useEvents";

type Case = { id: string; title: string; status: string; claims: number; independent: number; flagged: number; pending_actions: number; sar: string | null };
type Overview = {
  alerts: { total: number; open?: number; cleared?: number; case?: number };
  cases: { total: number; open: number; pending_actions: number; recent: Case[] };
  claims: { claims: number; independent: number; flagged: number; paths: number; origins: number };
  evidence: { total: number; awaiting_review: number; by_state: Record<string, number> };
  falkordb: { region: string; graphs: number; case_graphs: number; version: string | null;
    memory: { used_mb: number; max_mb: number | null; pct: number | null } };
  agents: { worker: boolean; llm: boolean };
  ms: number;
};

const n = (x?: number) => (x == null ? "–" : Math.round(x).toLocaleString());

export default function Dashboard() {
  const [d, setD] = useState<Overview | null>(null);
  const [replay, setReplay] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);
  const load = useCallback(() => {
    live<Overview>("/overview").then(({ data, replay }) => { setD(data); setReplay(replay); setErr(null); setAt(new Date()); })
      .catch(() => setErr("The API is unreachable and no snapshot is bundled."));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveReload(load, (e) => ["case", "claim", "alert", "state_change", "action", "sar"].includes(e.type));

  const a = d?.alerts;
  const decided = (a?.cleared ?? 0) + (a?.case ?? 0);
  const next = d?.cases.recent.find((c) => c.pending_actions > 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[40px] font-semibold" style={{ letterSpacing: "-0.04em" }}>Dashboard</h1>
          <p className="mt-1 text-muted">Investigate, prove and approve cross-bank cases, live on FalkorDB Cloud.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {replay && <ModeBadge mode="replay" />}
          <Link href="/demo" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-[#1a8bff] to-[#0a63cf] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(8,124,248,.9)] hover:brightness-110">
            <Icon name="plus" className="size-4" strokeWidth={2.4} />Run agents
          </Link>
          <Link href="/scenarios" className="rounded-full border-[1.5px] border-deep px-5 py-2.5 text-sm font-semibold text-deep hover:bg-white">Golden scenarios</Link>
        </div>
      </header>
      {err && <p className="text-verify">{err}</p>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi filled label="Open cases" value={n(d?.cases.open)} chip={`${n(d?.cases.total)} total`} sub="opened by the agents" href="/cases" i={0} />
        <Kpi label="Alerts decided" value={n(decided)} chip={a?.total ? `${Math.round((decided / a.total) * 100)}%` : "–"} sub={`of ${n(a?.total)} raised by the rules`} href="/alerts" i={1} />
        <Kpi label="Independent claims" value={n(d?.claims.independent)} chip={`${n(d?.claims.claims)}`} sub="claims, counted by origin" href="/trust" i={2} />
        <Kpi label="Awaiting a human" value={n(d?.cases.pending_actions)} chip="approve" sub="actions need a signature" href="/approvals" i={3} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <ClaimsChart cases={d?.cases.recent ?? []} />
        <NextApproval c={next} />
        <CasesList cases={d?.cases.recent ?? []} className="xl:row-span-2" />
        <AgentTeam d={d} />
        <TriageGauge a={a} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,2.35fr)_minmax(0,1fr)]">
        <div className="glass p-5"><ActivityFeed height="max-h-[300px]" /></div>
        <EngineTile d={d} at={at} onRefresh={load} />
      </section>
    </div>
  );
}

function Kpi({ label, value, sub, chip, href, filled = false, i }: { label: string; value: string; sub: string; chip: string; href: string; filled?: boolean; i: number }) {
  return (
    <Link href={href} style={{ animationDelay: `${i * 70}ms` }}
      className={`fade-up group relative overflow-hidden rounded-[22px] p-5 transition-transform hover:-translate-y-0.5 ${filled ? "fill-blue shadow-[0_24px_40px_-24px_rgba(10,99,207,.9)]" : "glass"}`}>
      {filled && <span className="lines" />}
      <div className="relative flex items-start justify-between">
        <p className={`text-[17px] font-medium ${filled ? "text-white" : "text-paper"}`}>{label}</p>
        <span className={`grid size-9 place-items-center rounded-full border transition-transform group-hover:rotate-45 ${filled ? "border-white bg-white text-deep" : "border-paper/70 text-paper"}`}>
          <Icon name="arrow" className="size-4" strokeWidth={2} />
        </span>
      </div>
      <p className={`kpi relative mt-3 text-[52px] font-semibold leading-none ${filled ? "text-white" : "text-paper"}`}>{value}</p>
      <p className={`relative mt-4 flex items-center gap-2 text-xs ${filled ? "text-sky" : "text-cyan"}`}>
        <span className={`rounded-md border px-1.5 py-px text-[10.5px] font-semibold ${filled ? "border-sky/60" : "border-cyan/40"}`}>{chip}</span>{sub}
      </p>
    </Link>
  );
}

function ClaimsChart({ cases }: { cases: Case[] }) {
  const rows = cases.slice(0, 7).reverse();
  const max = Math.max(1, ...rows.map((c) => c.claims));
  const top = rows.reduce((b, c, i) => (c.independent > (rows[b]?.independent ?? -1) ? i : b), 0);
  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-medium">Claim support, latest cases</h2>
        <Link href="/trust" className="text-xs text-muted hover:text-cyan">Trust layer →</Link>
      </div>
      <div className="mt-5 flex h-[176px] items-end justify-between gap-2.5 px-1">
        {!rows.length && Array.from({ length: 7 }).map((_, i) => <span key={i} className="hatch h-1/2 flex-1 rounded-full opacity-50" />)}
        {rows.map((c, i) => {
          const h = Math.max(22, (c.claims / max) * 100);
          const share = c.claims ? Math.round((c.independent / c.claims) * 100) : 0;
          const style = c.independent === 0 ? "hatch" : i === top ? "bg-deep" : share >= 50 ? "bg-cyan" : "bg-sky";
          return (
            <Link key={c.id} href={`/cases/${c.id}`} title={`${c.id}: ${c.claims} claims, ${Math.round(c.independent)} independently supported${c.flagged ? `, ${c.flagged} flagged` : ""}`}
              className="group relative flex h-full flex-1 flex-col items-center justify-end">
              {i === top && <span className="absolute -top-1 z-10 rounded-md border border-line bg-white px-1.5 text-[10.5px] font-semibold shadow-sm" style={{ bottom: `calc(${h}% + 26px)`, top: "auto" }}>{share}%</span>}
              <span style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }} className={`grow-up w-full max-w-[54px] rounded-full ${style} transition-opacity group-hover:opacity-80`} />
              <span className="mono mt-2 text-[10.5px] text-muted">{c.id.slice(2, 6)}</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-cyan" />Most claims independent</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-sky" />Partly independent</span>
        <span className="inline-flex items-center gap-1.5"><i className="hatch size-2.5 rounded-full" />Echo only, flagged</span>
      </p>
    </div>
  );
}

function NextApproval({ c }: { c?: Case }) {
  return (
    <div className="glass flex flex-col p-5">
      <h2 className="text-[17px] font-medium">Next approval</h2>
      {c ? (
        <>
          <p className="mt-3 line-clamp-3 text-[22px] font-semibold leading-tight text-deep" style={{ letterSpacing: "-0.02em" }}>{c.title}</p>
          <p className="mt-2 text-sm text-muted"><span className="mono">{c.id}</span> · {c.pending_actions} action{c.pending_actions > 1 ? "s" : ""} · SAR {c.sar ?? "draft"}</p>
          <Link href={`/cases/${c.id}`} className="mt-auto inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#1a8bff] to-[#0a63cf] py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(8,124,248,.9)] hover:brightness-110">
            <Icon name="approve" className="size-4" strokeWidth={2.2} />Review and sign
          </Link>
        </>
      ) : <p className="mt-3 text-sm text-muted">Nothing is waiting for a signature.</p>}
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  awaiting_approval: ["Awaiting approval", "text-verify bg-[#fff6e6]"], closed: ["Closed", "text-ok bg-[#e8f7f0]"],
  investigating: ["Investigating", "text-cyan bg-panel-2"], open: ["Open", "text-cyan bg-panel-2"],
};

function CasesList({ cases, className = "" }: { cases: Case[]; className?: string }) {
  return (
    <div className={`glass p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-medium">Cases</h2>
        <Link href="/cases" className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-deep px-3 py-1 text-xs font-semibold text-deep hover:bg-panel-2"><Icon name="plus" className="size-3.5" strokeWidth={2.4} />All</Link>
      </div>
      <ul className="mt-4 space-y-3.5">
        {cases.slice(0, 8).map((c) => {
          const [label, cls] = STATUS[c.status] ?? [c.status.replace(/_/g, " "), "text-muted bg-panel-2"];
          const banks = Number(/across (\d+) bank/.exec(c.title)?.[1] ?? 1);
          return (
            <li key={c.id}>
              <Link href={`/cases/${c.id}`} className="group flex items-start gap-3">
                <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${banks > 1 ? "bg-deep text-white" : "bg-panel-2 text-cyan"}`}>
                  <span className="text-xs font-bold">{banks}×</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium group-hover:text-cyan">{c.title.replace(/ by [0-9a-f]{6}/, "")}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-[11px] text-muted">
                    <span className="mono">{c.id}</span><span className={`rounded px-1.5 py-px font-medium ${cls}`}>{label}</span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AgentTeam({ d }: { d: Overview | null }) {
  const llm = !!d?.agents.llm, run = !!d?.agents.worker;
  const team: [string, string, string, boolean][] = [
    ["Triage", "Clears alerts with algo.wcc and graph signals", "TR", false],
    ["Investigator", "Expands the ring, writes claims with evidence", "IN", false],
    ["Skeptic", "Builds the innocent explanation, challenges claims", "SK", false],
    ["Reporter", "Drafts the SAR, every sentence cited", "RE", llm],
    ["Auditor", "A second model checks the report", "AU", llm],
  ];
  const tint = ["from-[#8ad8fc] to-[#087cf8]", "from-[#b9c8ff] to-[#3d55c4]", "from-[#ffd59a] to-[#c97a06]", "from-[#9be3c6] to-[#0c9466]", "from-[#d8c8ff] to-[#7a5ad8]"];
  return (
    <div className="glass p-5 xl:col-span-1">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-medium">Agent team</h2>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${run ? "bg-[#e8f7f0] text-ok" : "bg-panel-2 text-muted"}`}>{run ? "Worker running" : "Worker stopped"}</span>
      </div>
      <ul className="mt-4 space-y-3">
        {team.map(([name, job, ini, usesLlm], i) => (
          <li key={name} className="flex items-center gap-3">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br ${tint[i]} text-[11px] font-bold text-white`}>{ini}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{name}</span>
              <span className="block truncate text-[11.5px] text-muted">{job}</span>
            </span>
            <span className={`shrink-0 rounded-md border px-1.5 py-px text-[10.5px] font-semibold ${usesLlm ? "border-cyan/40 text-cyan" : "border-line text-muted"}`}>{usesLlm ? "LLM" : "Cypher"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TriageGauge({ a }: { a?: Overview["alerts"] }) {
  const total = a?.total ?? 0, cleared = a?.cleared ?? 0, esc = a?.case ?? 0, open = Math.max(0, total - cleared - esc);
  const pct = total ? Math.round((cleared / total) * 100) : 0;
  // semicircle from 180° to 0°, three arcs: cleared, escalated, open
  const R = 80, C = Math.PI * R;
  const seg = (v: number) => (total ? (v / total) * C : 0);
  return (
    <div className="glass p-5">
      <h2 className="text-[17px] font-medium">Alert triage</h2>
      <div className="relative mx-auto mt-3 w-full max-w-[260px]">
        <svg viewBox="0 0 200 112" className="w-full">
          <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#fff" /><line x1="0" y1="0" x2="0" y2="6" stroke="#9fb3cc" strokeWidth="2.4" /></pattern></defs>
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="url(#hatch)" strokeWidth="26" />
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#087cf8" strokeWidth="26" strokeDasharray={`${seg(cleared)} ${C}`} style={{ transition: "stroke-dasharray 1s" }} />
          <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="#0b2a5b" strokeWidth="26" strokeDasharray={`0 ${seg(cleared)} ${seg(esc)} ${C}`} />
        </svg>
        <div className="absolute inset-x-0 bottom-0 text-center">
          <p className="kpi text-[38px] font-semibold leading-none">{pct}%</p>
          <p className="text-xs text-muted">cleared by agents</p>
        </div>
      </div>
      <p className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-cyan" />Cleared {n(cleared)}</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-deep" />Escalated {n(esc)}</span>
        <span className="inline-flex items-center gap-1.5"><i className="hatch size-2.5 rounded-full" />Open {n(open)}</span>
      </p>
    </div>
  );
}

function EngineTile({ d, at, onRefresh }: { d: Overview | null; at: Date | null; onRefresh: () => void }) {
  const m = d?.falkordb.memory;
  const pct = m?.pct ?? null;
  return (
    <div className="fill-deep relative overflow-hidden rounded-[22px] p-5">
      <span className="lines" />
      <div className="relative flex items-center justify-between">
        <h2 className="text-[17px] font-medium text-white">FalkorDB Cloud</h2>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-sky">{d?.falkordb.region ?? "…"}</span>
      </div>
      <p className="kpi relative mt-5 text-center text-[46px] font-semibold leading-none tabular-nums">{d ? `${Math.round(d.ms)}` : "…"}<span className="ml-1 text-xl text-white/60">ms</span></p>
      <p className="relative mt-1 text-center text-xs text-white/60">overview query{at ? ` · ${at.toLocaleTimeString()}` : ""}</p>
      <dl className="relative mt-5 grid grid-cols-3 gap-2 text-center">
        {[["Graphs", n(d?.falkordb.graphs)], ["Cases", n(d?.falkordb.case_graphs)], ["Engine", d?.falkordb.version ? `v${d.falkordb.version}` : "managed"]].map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white/[.07] py-2"><dt className="text-[10.5px] text-white/60">{k}</dt><dd className="text-sm font-semibold">{v}</dd></div>
        ))}
      </dl>
      <div className="relative mt-4">
        <div className="flex justify-between text-[11px] text-white/65"><span>Memory {m ? `${m.used_mb} / ${m.max_mb ?? "∞"} MB` : ""}</span>{pct != null && <span>{Math.round(pct * 100)}%</span>}</div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/15"><div className={`h-full rounded-full ${pct != null && pct > 0.85 ? "bg-ring" : "bg-sky"}`} style={{ width: `${Math.min(100, (pct ?? 0) * 100)}%` }} /></div>
      </div>
      <div className="relative mt-5 flex justify-center gap-3">
        <button onClick={onRefresh} aria-label="Refresh" className="grid size-11 place-items-center rounded-full bg-white text-deep hover:bg-sky"><Icon name="refresh" className="size-5" strokeWidth={2.2} /></button>
        <Link href="/lab" aria-label="Open FalkorDB Lab" className="grid size-11 place-items-center rounded-full bg-cyan text-white hover:bg-[#1a8bff]"><Icon name="lab" className="size-5" strokeWidth={2.2} /></Link>
      </div>
    </div>
  );
}
