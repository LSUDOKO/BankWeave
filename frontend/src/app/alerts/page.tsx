"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import Icon from "@/components/Icon";
import { Card, Chip, Empty, PageHeader, StatCard, Tabs, btn } from "@/components/ui";
import { get, short } from "@/lib/api";
import { bankColor, setBankOrder } from "@/lib/banks";
import { useLiveReload } from "@/lib/useEvents";

type Alert = { id: string; account: string; bank: string; rule: string; reason: string; status: string;
  case_id?: string; cleared_reason?: string };
type Filter = "all" | "open" | "cleared" | "case";

const FILTERS: [Filter, string][] = [["all", "All"], ["open", "Waiting"], ["cleared", "Cleared"], ["case", "Escalated to a case"]];

const n = (x?: number) => (x == null ? "–" : Math.round(x).toLocaleString());
const ruleName = (r: string) => r.replace(/_/g, " ").replace(/^\w/, (m) => m.toUpperCase());

export default function Queue() {
  const [data, setData] = useState<{ alerts: Alert[]; counts: Record<string, number>; total: number } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    get(`/alerts?limit=300${filter === "all" ? "" : `&status=${filter}`}`)
      .then((d) => { setData(d); setError(null); })
      .catch(() => setError("The API isn't reachable. Start the backend with `uvicorn app.main:app`."));
  }, [filter]);
  useEffect(() => { load(); get("/network/banks").then((b) => setBankOrder(b.banks ?? [])).catch(() => {}); }, [load]);
  useLiveReload(load, (e) => e.type === "alert" || e.type === "case");

  const c = data?.counts ?? {};
  const total = data?.total;
  const escalated = c.case ?? 0;
  const cleared = c.cleared ?? 0;
  const waiting = c.open ?? 0;
  const decided = cleared + escalated;
  const share = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : "–");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alert queue"
        sub={<>Rule-based monitoring would send all <b className="text-paper">{total ?? "…"}</b> alerts to analysts.
          BankWeave has decided <b className="text-paper">{data ? decided : "…"}</b> so far and escalated{" "}
          <b className="text-ring">{data ? escalated : "…"}</b>, each with a reason you can open.</>}
        actions={<>
          <button onClick={load} className={btn.soft}><Icon name="refresh" className="size-4" strokeWidth={2.2} />Refresh</button>
          <Link href="/demo" className={btn.ghost}>Generate alerts</Link>
          <Link href="/cases" className={btn.primary}><Icon name="cases" className="size-4" strokeWidth={2.2} />Open cases</Link>
        </>}
      />
      {error && <p className="text-verify">{error}</p>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled label="Raised by rules" value={n(total)} chip="rules" sub="alerts in the consortium graph" i={0} />
        <StatCard label="Cleared by agents" value={data ? n(cleared) : "–"} chip={share(cleared)} sub="closed with a stated reason" i={1} />
        <StatCard label="Escalated to cases" value={data ? n(escalated) : "–"} chip={share(escalated)} sub="opened as a case graph" href="/cases" i={2} />
        <StatCard label="Waiting for triage" value={data ? n(waiting) : "–"} chip={share(waiting)} sub="not decided yet" i={3} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card pad="p-0" className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
            <h2 className="text-[17px] font-medium">Alerts</h2>
            <Tabs value={filter} onChange={(k) => { setFilter(k); setOpen(null); }}
              items={FILTERS.map(([k, label]) => [k, <>{label} <span className="ml-0.5 opacity-60">{k === "all" ? total ?? "" : c[k] ?? 0}</span></>])} />
          </div>
          <div className="mt-4 hidden grid-cols-[180px_minmax(0,1fr)_220px] gap-4 border-y border-line bg-panel-2/60 px-5 py-2 text-xs font-medium text-muted md:grid">
            <span>Account</span><span>Rule that fired</span><span>Outcome</span>
          </div>
          {!data && !error && <SkeletonRows />}
          {data && !data.alerts.length && (
            <div className="p-5"><Empty action={<Link href="/demo" className={btn.small}>Open demo control</Link>}>No alerts here. Generate alerts from Demo control.</Empty></div>
          )}
          <ul className="divide-y divide-line">
            {data?.alerts.map((a) => (
              <AlertRow key={a.id} a={a} open={open === a.id} toggle={() => setOpen(open === a.id ? null : a.id)} />
            ))}
          </ul>
          {data && data.alerts.length > 0 && (
            <p className="border-t border-line px-5 py-3 text-xs text-muted">
              Showing the {data.alerts.length} most recent{filter === "all" ? "" : ` ${FILTERS.find(([k]) => k === filter)?.[1].toLowerCase()}`} alerts. Click a row to see the graph signals triage used.
            </p>
          )}
        </Card>

        <div className="space-y-4">
          <TriageSplit cleared={cleared} escalated={escalated} waiting={waiting} total={total ?? 0} ready={!!data} />
          <RuleBars alerts={data?.alerts ?? []} filter={filter} />
          <div className="glass p-5"><ActivityFeed height="max-h-[420px]" /></div>
        </div>
      </section>
    </div>
  );
}

function SkeletonRows() {
  return (
    <ul className="divide-y divide-line" aria-label="Loading alerts">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="grid gap-4 px-5 py-4 md:grid-cols-[180px_minmax(0,1fr)_220px]">
          <span className="h-3.5 w-28 animate-pulse rounded-full bg-panel-2" />
          <span className="h-3.5 w-full animate-pulse rounded-full bg-panel-2" />
          <span className="h-3.5 w-24 animate-pulse rounded-full bg-panel-2" />
        </li>
      ))}
    </ul>
  );
}

function TriageSplit({ cleared, escalated, waiting, total, ready }: { cleared: number; escalated: number; waiting: number; total: number; ready: boolean }) {
  const rows: [string, number, string][] = [["Cleared", cleared, "bg-cyan"], ["Escalated", escalated, "bg-deep"], ["Waiting", waiting, "hatch"]];
  return (
    <Card title="Triage decisions">
      <div className="flex h-4 w-full gap-1 overflow-hidden rounded-full">
        {!ready || !total ? <span className="hatch h-full w-full rounded-full opacity-60" /> :
          rows.filter(([, v]) => v > 0).map(([k, v, cls]) => (
            <span key={k} title={`${k}: ${v}`} className={`h-full rounded-full ${cls} transition-[width] duration-700`} style={{ width: `${(v / total) * 100}%`, minWidth: 8 }} />
          ))}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {rows.map(([k, v, cls]) => (
          <li key={k} className="flex items-center gap-2.5">
            <i className={`size-2.5 rounded-full ${cls}`} />
            <span className="flex-1 text-muted">{k}</span>
            <span className="kpi font-semibold">{ready ? v.toLocaleString() : "–"}</span>
            <span className="w-10 text-right text-xs text-muted">{ready && total ? `${Math.round((v / total) * 100)}%` : ""}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RuleBars({ alerts, filter }: { alerts: Alert[]; filter: Filter }) {
  const rules = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of alerts) m.set(a.rule, (m.get(a.rule) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7);
  }, [alerts]);
  const max = Math.max(1, ...rules.map(([, v]) => v));
  return (
    <Card title="Rules that fired" action={<span className="text-xs text-muted">{alerts.length ? `in ${alerts.length} ${filter === "all" ? "listed" : "filtered"}` : ""}</span>}>
      {!alerts.length ? <p className="text-sm text-muted">No alerts in this view.</p> : (
        <ul className="space-y-3">
          {rules.map(([r, v], i) => (
            <li key={r}>
              <div className="flex justify-between gap-2 text-[12.5px]"><span className="truncate">{ruleName(r)}</span><span className="kpi font-semibold">{v}</span></div>
              <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-panel-2">
                <div className={`h-full rounded-full ${i === 0 ? "bg-deep" : "bg-cyan"} transition-[width] duration-700`} style={{ width: `${(v / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AlertRow({ a, open, toggle }: { a: Alert; open: boolean; toggle: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { if (open && !detail) get(`/alerts/${a.id}`).then(setDetail).catch(() => {}); }, [open, detail, a.id]);
  const signals = detail?.signals ? JSON.parse(detail.signals) : null;
  return (
    <li className={open ? "bg-panel-2/50" : ""}>
      <div role="button" tabIndex={0} aria-expanded={open} onClick={toggle} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
        className="grid cursor-pointer gap-2 px-5 py-3.5 text-sm transition-colors hover:bg-panel-2/60 md:grid-cols-[180px_minmax(0,1fr)_220px] md:gap-4">
        <span className="flex items-center gap-2 whitespace-nowrap">
          <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: bankColor(a.bank) }} />
          <span className="mono font-medium">{short(a.account, 8)}</span>
          <Chip>bank {a.bank}</Chip>
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted">{ruleName(a.rule)}</span>
          <span className="block text-paper/85">{a.reason}</span>
        </span>
        <span className="flex min-w-0 items-start gap-2">
          {a.status === "open" && <Chip tone="warn">Waiting for triage</Chip>}
          {a.status === "cleared" && (
            <span className="min-w-0"><Chip tone="ok">Cleared</Chip><span className="mt-1 block text-xs text-muted">{a.cleared_reason}</span></span>
          )}
          {a.status === "case" && (
            <Link href={`/cases/${a.case_id}`} onClick={(e) => e.stopPropagation()} className="group inline-flex items-center gap-1.5">
              <Chip tone="ring">Case <span className="mono">{a.case_id}</span></Chip>
              <Icon name="arrow" className="size-3.5 text-ring transition-transform group-hover:rotate-45" strokeWidth={2.2} />
            </Link>
          )}
        </span>
      </div>
      {open && (
        <div className="px-5 pb-4">
          <div className="rounded-2xl border border-line bg-white p-4 text-sm">
            {!signals && <span className="text-muted">{a.status === "open" ? "Not triaged yet." : "Loading the signals triage used…"}</span>}
            {signals && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                <Sig k="Connected component" v={`${signals.component_size} accounts, ${signals.component_banks} bank(s)`} />
                <Sig k="Motif score" v={signals.motif_score} />
                <Sig k="Cross-bank counterparties" v={signals.cross_bank_counterparties} />
                <Sig k="Typologies" v={signals.typologies.join(", ") || "none"} />
                <Sig k="Tight shared identity" v={signals.shared_identity_tight} />
                <Sig k="Broad shared identity" v={signals.shared_identity_broad} />
                <Sig k="Pass-through pairs" v={signals.passthrough_pairs} />
                <Sig k="Prior cases" v={signals.prior_cases.join(", ") || "none"} />
              </dl>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

const Sig = ({ k, v }: { k: string; v: unknown }) => (
  <div><dt className="text-[11px] text-muted">{k}</dt><dd className="font-medium">{String(v)}</dd></div>
);
