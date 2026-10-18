"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { Card, Chip, Empty, PageHeader, StatCard, btn, stateTone } from "@/components/ui";
import { get, pct, post } from "@/lib/api";
import { useLiveReload } from "@/lib/useEvents";

type Claim = { id: string; text: string; kind?: string; state?: string; paths: number; sources: number; confidence: number; naive: number; case_id: string };
type KycResult = { affected: { case: string }[]; totals: { claims: number; actions: number; sentences: number } };

const STATE_LABEL: Record<string, string> = { active: "Active", needs_verification: "Needs verification", historical_only: "Historical", superseded: "Superseded" };

export default function TrustPage() {
  const [echo, setEcho] = useState<Claim[]>([]);
  const [states, setStates] = useState<Record<string, number>>({});
  const [naive, setNaive] = useState(false);
  const [cands, setCands] = useState<[string, number][]>([]);
  const [addr, setAddr] = useState("A-77");
  const [result, setResult] = useState<KycResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    get("/trust/echo").then((d) => { setEcho(d.claims); setLoaded(true); }).catch(() => setLoaded(true));
    get("/trust/states").then((d) => setStates(d.states)).catch(() => {});
    get("/trust/kyc_candidates").then((d) => setCands(d.addresses)).catch(() => {});
  }, []);
  useEffect(load, [load]);
  useLiveReload(load, (e) => e.type === "state_change" || e.type === "claim");

  async function push() {
    setBusy(true);
    try {
      setResult(await post("/trust/kyc_update", { address_id: addr, fact: `Address ${addr} is a 200-unit residential building` }));
    } finally { setBusy(false); load(); }
  }
  const rows = [...echo].sort((a, b) => (b.paths - b.sources) - (a.paths - a.sources)).slice(0, 30);
  const sum = (s: string) => Object.entries(states).filter(([k]) => k.endsWith(":" + s)).reduce((n, [, v]) => n + v, 0);
  const echoed = echo.filter((c) => c.paths > c.sources).length;
  const hasStates = Object.keys(states).length > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trust layer"
        sub="Agents that can't fool themselves. Three checks from 2026 research, each running as graph queries: count independent sources rather than paths, flag every belief that rests on overturned evidence, and refuse to publish a report that can't be proven."
        actions={<>
          <button onClick={load} className={btn.soft}><Icon name="refresh" className="size-4" strokeWidth={2.2} />Refresh</button>
          <Link href="/approvals" className={btn.ghost}>Approvals</Link>
          <a href="#cascade" className={btn.primary}><Icon name="trust" className="size-4" strokeWidth={2.2} />Push a KYC update</a>
        </>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled label="Active" value={hasStates ? sum("active").toLocaleString() : "–"} chip="current" sub="claims, evidence, actions, reports" i={0} />
        <StatCard label="Needs verification" value={hasStates ? sum("needs_verification").toLocaleString() : "–"} chip="flagged" sub="rest on overturned evidence" href="/approvals" i={1} />
        <StatCard label="Superseded (kept)" value={hasStates ? sum("superseded").toLocaleString() : "–"} chip="history" sub="overturned, kept for audit" i={2} />
        <StatCard label="Echoed claims" value={loaded ? echoed : "–"} chip={`of ${echo.length}`} sub="more paths than independent origins" i={3} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card pad="p-0" className="min-w-0 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
            <div className="min-w-0">
              <h2 className="text-[17px] font-medium">Five paths can be one fact</h2>
              <p className="mt-1 max-w-[68ch] text-sm text-muted">Many graph paths often lead back to the same origin, like one shared device reached from several accounts. BankWeave scores confidence on distinct origins.</p>
            </div>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-full bg-panel-2 py-1.5 pl-3 pr-1.5 text-sm">
              Show naive path counting
              <input type="checkbox" checked={naive} onChange={(e) => setNaive(e.target.checked)} className="peer sr-only" />
              <span aria-hidden className={`relative h-6 w-11 rounded-full transition-colors ${naive ? "bg-deep" : "bg-mist"} peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-cyan`}>
                <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-[left] ${naive ? "left-[22px]" : "left-0.5"}`} />
              </span>
            </label>
          </div>
          <div className="mt-4 hidden grid-cols-[minmax(0,1fr)_64px_84px_176px] gap-4 border-y border-line bg-panel-2/60 px-5 py-2 text-xs font-medium text-muted md:grid">
            <span>Claim</span><span className="text-right">Paths</span><span className="text-right">Independent</span><span>{naive ? "Naive confidence" : "Confidence"}</span>
          </div>
          {!loaded && (
            <ul className="divide-y divide-line" aria-label="Loading claims">
              {Array.from({ length: 5 }).map((_, i) => <li key={i} className="px-5 py-4"><span className="block h-3.5 w-full animate-pulse rounded-full bg-panel-2" /></li>)}
            </ul>
          )}
          {loaded && !rows.length && <div className="p-5"><Empty>No claims yet.</Empty></div>}
          <ul className="divide-y divide-line">
            {rows.map((c) => (
              <li key={c.id} className="grid items-center gap-2 px-5 py-3 text-sm md:grid-cols-[minmax(0,1fr)_64px_84px_176px] md:gap-4">
                <span className="min-w-0">
                  <Link href={`/cases/${c.case_id}`} className="hover:text-cyan">{c.text}</Link>{" "}
                  <Chip tone={stateTone(c.state)} className="align-middle">{STATE_LABEL[c.state ?? "active"] ?? c.state}</Chip>
                </span>
                <span className="kpi text-right font-semibold"><span className="mr-1 text-xs font-normal text-muted md:hidden">paths</span>{c.paths}</span>
                <span className={`kpi text-right font-semibold ${c.paths > c.sources ? "text-verify" : ""}`}><span className="mr-1 text-xs font-normal text-muted md:hidden">independent</span>{c.sources}</span>
                <ConfBar confidence={naive ? c.naive : c.confidence} naive={c.naive} />
              </li>
            ))}
          </ul>
          {rows.length > 0 && <p className="border-t border-line px-5 py-3 text-xs text-muted">Sorted by the gap between paths and independent sources. The pale bar is what naive path counting would claim.</p>}
        </Card>

        <PathsVsSources rows={rows.filter((c) => c.paths > c.sources).slice(0, 8)} loaded={loaded} />
      </section>

      <section id="cascade" className="grid scroll-mt-24 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <h2 className="text-[17px] font-medium">When evidence dies, everything resting on it is flagged</h2>
          <p className="mt-1 max-w-[68ch] text-sm text-muted">Push a KYC fact that overturns shared-address evidence. The evidence is superseded (kept for history), and every claim, action and report sentence that depended on it turns amber.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <label htmlFor="addr" className="text-muted">Address</label>
            <select id="addr" value={addr} onChange={(e) => setAddr(e.target.value)} className="rounded-full border border-line bg-white px-4 py-2.5 outline-none focus:border-cyan">
              {[["A-77", 0] as [string, number], ...cands.filter(([a]) => a !== "A-77")].map(([a, n]) => <option key={a} value={a}>{a}{n ? ` (relied on by ${n} evidence items)` : ""}</option>)}
            </select>
            <button onClick={push} disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-verify px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(201,122,6,.9)] hover:brightness-110 disabled:opacity-50">
              {busy ? "Pushing update…" : `Push KYC update: ${addr} is a 200-unit building`}
            </button>
          </div>
          {result && (
            <div className="mt-4 rounded-2xl bg-[#fff6e6] p-4 text-sm" aria-live="polite">
              <p>Superseded evidence in {result.affected.length} case(s). Flagged for verification:</p>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {([["Claims", result.totals.claims], ["Actions", result.totals.actions], ["Report sentences", result.totals.sentences]] as [string, number][]).map(([k, v]) => (
                  <div key={k} className="rounded-xl bg-white py-2"><dt className="text-[11px] text-muted">{k}</dt><dd className="kpi text-xl font-semibold text-verify">{v}</dd></div>
                ))}
              </dl>
              {result.affected[0] && <Link href={`/cases/${result.affected[0].case}`} className={`${btn.small} mt-3`}>Open {result.affected[0].case}<Icon name="arrow" className="size-3" strokeWidth={2.4} /></Link>}
            </div>
          )}
          <StateMatrix states={states} />
        </Card>

        <div className="fill-deep relative overflow-hidden rounded-[22px] p-5">
          <span className="lines" />
          <div className="relative flex h-full flex-col">
            <span className="grid size-10 place-items-center rounded-full bg-white/10 text-sky"><Icon name="doc" className="size-5" strokeWidth={2} /></span>
            <h2 className="mt-4 text-[17px] font-medium text-white">No report without proof</h2>
            <p className="mt-2 text-sm text-white/70">A different, stronger model audits every report sentence against only the evidence it cites. Reports publish at 95% supported sentences or better, after up to three repairs; otherwise BankWeave files a divergence report showing the disagreement. Open any case&apos;s Report tab to see it.</p>
            <div className="mt-5 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-white/[.07] py-2"><p className="text-[10.5px] text-white/60">Publish bar</p><p className="text-sm font-semibold">95% supported</p></div>
              <div className="rounded-xl bg-white/[.07] py-2"><p className="text-[10.5px] text-white/60">Repairs</p><p className="text-sm font-semibold">up to 3</p></div>
            </div>
            <div className="mt-auto pt-5">
              <Link href="/cases" className="flex items-center justify-center gap-2 rounded-full bg-white py-2.5 text-sm font-semibold text-deep hover:bg-sky">
                Open a case report<Icon name="arrow" className="size-4" strokeWidth={2.2} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function ConfBar({ confidence, naive }: { confidence: number; naive: number }) {
  return (
    <div className="w-full" title={`naive path counting would say ${pct(naive)}`}>
      <div className="relative h-2 overflow-hidden rounded-full bg-panel-2">
        <div className="absolute inset-y-0 left-0 rounded-full bg-sky/60" style={{ width: pct(naive) }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-cyan" style={{ width: pct(confidence) }} />
      </div>
      <p className="mt-1 text-[11px] text-muted"><span className="font-semibold text-paper">{pct(confidence)}</span></p>
    </div>
  );
}

function PathsVsSources({ rows, loaded }: { rows: Claim[]; loaded: boolean }) {
  const max = Math.max(1, ...rows.map((c) => c.paths));
  return (
    <Card title="Paths vs independent origins">
      {!loaded ? <span className="block h-40 animate-pulse rounded-2xl bg-panel-2" /> : !rows.length ? (
        <p className="text-sm text-muted">No claim has more paths than independent origins.</p>
      ) : (
        <div className="flex h-[190px] items-end justify-between gap-2">
          {rows.map((c, i) => (
            <Link key={c.id} href={`/cases/${c.case_id}`} title={`${c.text}: ${c.paths} paths, ${c.sources} independent`}
              className="group flex h-full flex-1 flex-col items-center justify-end">
              <span className="flex h-full w-full max-w-[40px] items-end gap-0.5">
                <span className="hatch grow-up w-1/2 rounded-full" style={{ height: `${(c.paths / max) * 100}%`, animationDelay: `${i * 50}ms` }} />
                <span className="grow-up w-1/2 rounded-full bg-cyan group-hover:bg-deep" style={{ height: `${Math.max(6, (c.sources / max) * 100)}%`, animationDelay: `${i * 50 + 80}ms` }} />
              </span>
              <span className="kpi mt-2 text-[11px] font-semibold">{c.paths}:{c.sources}</span>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="hatch size-2.5 rounded-full" />Paths found</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-cyan" />Independent origins</span>
      </p>
      <p className="mt-2 text-xs text-muted">Most echoed claims first. Confidence follows the blue bar, not the striped one.</p>
    </Card>
  );
}

function StateMatrix({ states }: { states: Record<string, number> }) {
  const types = ["Evidence", "Claim", "Action", "SAR"].filter((t) => Object.keys(states).some((k) => k.startsWith(t + ":")));
  if (!types.length) return null;
  const segs: [string, string, string][] = [["active", "Active", "bg-ok"], ["needs_verification", "Needs verification", "bg-verify"], ["superseded", "Superseded", "hatch"]];
  return (
    <div className="mt-6 border-t border-line pt-5">
      <h3 className="text-sm font-medium">State of every node the cascade can reach</h3>
      <ul className="mt-3 space-y-3">
        {types.map((t) => {
          const total = segs.reduce((n, [s]) => n + (states[`${t}:${s}`] ?? 0), 0) || 1;
          return (
            <li key={t} className="grid grid-cols-[76px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="text-muted">{t}</span>
              <span className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-panel-2">
                {segs.map(([s, label, cls]) => {
                  const v = states[`${t}:${s}`] ?? 0;
                  return v ? <span key={s} title={`${label}: ${v}`} className={`h-full rounded-full border-0 ${cls}`} style={{ width: `${(v / total) * 100}%`, minWidth: 6 }} /> : null;
                })}
              </span>
              <span className="kpi text-xs text-muted">
                {states[`${t}:active`] ?? 0}
                {states[`${t}:needs_verification`] ? <span className="text-verify"> / {states[`${t}:needs_verification`]}</span> : null}
                {states[`${t}:superseded`] ? <span> / {states[`${t}:superseded`]}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        {segs.map(([s, label, cls]) => <span key={s} className="inline-flex items-center gap-1.5"><i className={`size-2.5 rounded-full ${cls}`} />{label}</span>)}
      </p>
    </div>
  );
}
