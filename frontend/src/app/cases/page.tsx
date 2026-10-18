"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { Card, Chip, Empty, PageHeader, StatCard, Tabs, btn, type Tone } from "@/components/ui";
import { get, short } from "@/lib/api";
import { bankColor, setBankOrder } from "@/lib/banks";
import { useLiveReload } from "@/lib/useEvents";

type Case = { id: string; status: string; title: string; opened_at?: number; seed?: string; alerts: number; accounts: number; banks: string[] };
type Filter = "all" | "open" | "awaiting_approval" | "closed";

const STATUS: Record<string, [string, Tone]> = {
  open: ["Agents investigating", "blue"], awaiting_approval: ["Waiting for your approval", "warn"],
  closed: ["Closed", "ok"], insufficient: ["Closed: not enough evidence", "muted"],
};
const isClosed = (s: string) => s === "closed" || s === "insufficient";
const n = (x?: number) => (x == null ? "–" : x.toLocaleString());

function ago(ms?: number) {
  if (!ms) return "";
  const s = Math.max(0, (Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function Cases() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const load = useCallback(() => { get("/cases").then((d) => setCases(d.cases)).catch(() => setCases([])); }, []);
  useEffect(() => { load(); get("/network/banks").then((b) => setBankOrder(b.banks ?? [])).catch(() => {}); }, [load]);
  useLiveReload(load, (e) => e.type === "case");

  const all = useMemo(() => cases ?? [], [cases]);
  const count = (f: Filter) => (f === "all" ? all.length : f === "closed" ? all.filter((c) => isClosed(c.status)).length : all.filter((c) => c.status === f).length);
  const shown = filter === "all" ? all : all.filter((c) => (filter === "closed" ? isClosed(c.status) : c.status === filter));
  const cross = all.filter((c) => c.banks.length > 1).length;
  const insufficient = all.filter((c) => c.status === "insufficient").length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Cases"
        sub="Each case is its own FalkorDB graph: the accounts under investigation, every claim, the evidence behind it and the agents' timeline."
        actions={<>
          <button onClick={load} className={btn.soft}><Icon name="refresh" className="size-4" strokeWidth={2.2} />Refresh</button>
          <Link href="/alerts" className={btn.ghost}>Alert queue</Link>
          <Link href="/demo" className={btn.primary}><Icon name="plus" className="size-4" strokeWidth={2.4} />Run agents</Link>
        </>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled label="Case graphs" value={cases ? n(all.length) : "–"} chip={`${count("open")} investigating`} sub="opened by the agents" i={0} />
        <StatCard label="Waiting for approval" value={cases ? n(count("awaiting_approval")) : "–"} chip="sign" sub="actions need a human" href="/approvals" i={1} />
        <StatCard label="Cross-bank" value={cases ? n(cross) : "–"} chip={all.length ? `${Math.round((cross / all.length) * 100)}%` : "–"} sub="span two or more banks" i={2} />
        <StatCard label="Closed" value={cases ? n(count("closed")) : "–"} chip={`${insufficient} insufficient`} sub="decided or not enough evidence" i={3} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card pad="p-0" className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <h2 className="text-[17px] font-medium">All cases</h2>
            <Tabs value={filter} onChange={setFilter} items={([
              ["all", "All"], ["open", "Investigating"], ["awaiting_approval", "Awaiting approval"], ["closed", "Closed"],
            ] as [Filter, string][]).map(([k, l]) => [k, <>{l} <span className="ml-0.5 opacity-60">{cases ? count(k) : ""}</span></>])} />
          </div>
          <div className="mt-4 hidden grid-cols-[minmax(0,1fr)_120px_190px_28px] gap-4 border-y border-line bg-panel-2/60 px-5 py-2 text-xs font-medium text-muted md:grid">
            <span>Case and what triggered it</span><span>Banks</span><span>Status</span><span />
          </div>
          {!cases && (
            <ul className="divide-y divide-line" aria-label="Loading cases">
              {Array.from({ length: 6 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-4">
                  <span className="size-10 animate-pulse rounded-xl bg-panel-2" />
                  <span className="h-3.5 flex-1 animate-pulse rounded-full bg-panel-2" />
                </li>
              ))}
            </ul>
          )}
          {cases && !all.length && (
            <div className="p-5"><Empty action={<Link href="/demo" className={btn.small}>Open demo control</Link>}>No cases yet. Start the agents from Demo control and escalated alerts will open cases here.</Empty></div>
          )}
          {cases && all.length > 0 && !shown.length && <div className="p-5"><Empty>No cases with this status.</Empty></div>}
          <ul className="divide-y divide-line">
            {shown.map((c) => {
              const [label, tone] = STATUS[c.status] ?? [c.status.replace(/_/g, " "), "muted" as Tone];
              return (
                <li key={c.id}>
                  <Link href={`/cases/${c.id}`} className="group grid items-center gap-3 px-5 py-3.5 transition-colors hover:bg-panel-2/60 md:grid-cols-[minmax(0,1fr)_120px_190px_28px] md:gap-4">
                    <span className="flex min-w-0 items-start gap-3">
                      <span className={`grid size-10 shrink-0 place-items-center rounded-xl text-xs font-bold ${c.banks.length > 1 ? "bg-deep text-white" : "bg-panel-2 text-cyan"}`}>{c.banks.length}×</span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium group-hover:text-cyan">{c.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-muted">
                          <span className="mono text-paper/80">{c.id}</span>
                          <span>{c.accounts} accounts</span>
                          <span>{c.alerts} alert(s)</span>
                          {c.opened_at ? <span>opened {ago(c.opened_at)}</span> : null}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      {c.banks.map((b) => <span key={b} className="inline-block size-3 rounded-full ring-2 ring-white" style={{ background: bankColor(b) }} title={`Bank ${b}`} />)}
                    </span>
                    <span><Chip tone={tone}>{label}</Chip></span>
                    <span className="hidden size-7 place-items-center rounded-full border border-paper/40 text-paper transition-transform group-hover:rotate-45 md:grid">
                      <Icon name="arrow" className="size-3.5" strokeWidth={2} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {cases && all.length > 0 && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">Seed accounts: {all.slice(0, 3).map((c) => short(c.seed)).join(", ")}…</p>
          )}
        </Card>

        <div className="space-y-4">
          <StatusSplit cases={all} ready={!!cases} />
          <BankBars cases={all} />
        </div>
      </section>
    </div>
  );
}

function StatusSplit({ cases, ready }: { cases: Case[]; ready: boolean }) {
  const rows: [string, number, string][] = [
    ["Investigating", cases.filter((c) => c.status === "open").length, "bg-cyan"],
    ["Awaiting approval", cases.filter((c) => c.status === "awaiting_approval").length, "bg-deep"],
    ["Closed", cases.filter((c) => c.status === "closed").length, "bg-sky"],
    ["Not enough evidence", cases.filter((c) => c.status === "insufficient").length, "hatch"],
  ];
  const total = cases.length;
  return (
    <Card title="Where cases stand">
      <div className="flex h-4 w-full gap-1 overflow-hidden rounded-full">
        {!total ? <span className="hatch h-full w-full rounded-full opacity-60" /> :
          rows.filter(([, v]) => v > 0).map(([k, v, cls]) => (
            <span key={k} title={`${k}: ${v}`} className={`h-full rounded-full ${cls}`} style={{ width: `${(v / total) * 100}%`, minWidth: 8 }} />
          ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map(([k, v, cls]) => (
          <li key={k} className="flex items-center gap-2.5">
            <i className={`size-2.5 rounded-full ${cls}`} />
            <span className="flex-1 text-muted">{k}</span>
            <span className="kpi font-semibold">{ready ? v : "–"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BankBars({ cases }: { cases: Case[] }) {
  const banks = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cases) for (const b of c.banks) m.set(b, (m.get(b) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [cases]);
  const max = Math.max(1, ...banks.map(([, v]) => v));
  return (
    <Card title="Cases per bank" action={<span className="text-xs text-muted">{banks.length ? `${banks.length} banks` : ""}</span>}>
      {!banks.length ? <p className="text-sm text-muted">No cases yet.</p> : (
        <div className="flex h-[150px] items-end justify-between gap-2">
          {banks.map(([b, v], i) => (
            <div key={b} className="flex h-full flex-1 flex-col items-center justify-end" title={`Bank ${b}: ${v} case(s)`}>
              <span className="kpi mb-1 text-[11px] font-semibold">{v}</span>
              <span className="grow-up w-full max-w-[40px] rounded-full" style={{ height: `${Math.max(12, (v / max) * 82)}%`, background: bankColor(b), animationDelay: `${i * 60}ms` }} />
              <span className="mono mt-2 text-[10.5px] text-muted">{b}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">A cross-bank case counts once for each bank it touches.</p>
    </Card>
  );
}
