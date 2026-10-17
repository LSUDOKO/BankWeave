"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import ModeBadge from "@/components/ModeBadge";
import WeaveGraph from "@/components/WeaveGraph";
import { post } from "@/lib/api";
import { setBankOrder } from "@/lib/banks";
import { capturedAt, live } from "@/lib/snapshot";

const ProvenanceDag = dynamic(() => import("@/components/ProvenanceDag"), { ssr: false });

const pct = (x?: number | null) => (x == null ? "–" : `${Math.round(x * 1000) / 10}%`);

export default function Scenarios() {
  const [d, setD] = useState<any>(null);
  const [replay, setReplay] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    live("/scenarios", 8000).then(({ data, replay }) => {
      setD(data); setReplay(replay);
      const banks = [...new Set<string>((data?.B?.views?.consortium?.nodes ?? []).map((n: any) => n.bank))].sort();
      setBankOrder(banks);
    }).catch(() => setErr("The API is unreachable and no snapshot is bundled."));
  }, []);
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Golden scenarios</h1>
          <p className="mt-1.5 max-w-[75ch] text-muted">
            Three investigations that show what the graph decides and why. Computed live from FalkorDB
            {d?.ms ? ` (${d.ms} ms)` : ""}; when the free-tier API is asleep, the same responses load from a snapshot
            {capturedAt ? ` captured ${capturedAt}` : ""}.
          </p>
        </div>
        <ModeBadge mode={replay ? "replay" : undefined} />
      </header>
      {err && <p className="text-verify">{err}</p>}
      {!d && !err && <p className="text-muted">Loading scenarios…</p>}
      {d?.A && <ScenarioA a={d.A} />}
      {d?.B && <ScenarioB b={d.B} />}
      {d?.C && <ScenarioC c={d.C} replay={replay} />}
    </div>
  );
}

function Head({ k, title, tone, children }: { k: string; title: string; tone: string; children?: React.ReactNode }) {
  return (
    <div id={k} className="flex flex-wrap items-baseline gap-3 scroll-mt-6">
      <span className={`kpi text-3xl ${tone}`}>{k}</span>
      <h2 className="text-xl">{title}</h2>
      {children}
    </div>
  );
}

function ScenarioA({ a }: { a: any }) {
  const s = a.alert.signals ?? {};
  return (
    <section className="space-y-3">
      <Head k="A" title="An innocent alert, cleared by algo.wcc" tone="text-ok" />
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="glass p-4 lg:col-span-2">
          <p className="text-sm text-muted">Alert <span className="mono">{a.alert.id}</span> · rule <span className="mono">{a.alert.rule}</span> · bank {a.alert.bank}</p>
          <p className="mt-1">{a.alert.reason}</p>
          <p className="mt-3 text-sm">Triage ran weakly connected components over the consortium. The account belongs to a component of
            <b className="text-ok"> {a.wcc?.size ?? a.alert.component_size} accounts at {a.wcc?.n_banks ?? 1} bank</b>, with no cross-bank counterparties, so it
            cannot be part of a layering ring. Decision: <b className="text-ok">cleared</b> ({a.alert.cleared}).</p>
          <p className="mt-2 text-xs text-muted">The rule alone would have sent this to an analyst. Of the alerts in this dataset, most are cleared the same way.</p>
        </div>
        <div className="glass p-4 text-sm">
          <p className="text-xs uppercase tracking-wider text-muted">Signals the agent used</p>
          <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1">
            {Object.entries(s).filter(([, v]) => typeof v !== "object").slice(0, 8).map(([k, v]) => (
              <Fragment key={k}><dt className="text-muted">{k.replace(/_/g, " ")}</dt><dd className="mono text-right">{typeof v === "number" ? Math.round(v * 1000) / 1000 : String(v)}</dd></Fragment>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">algo.wcc lookup {a.wcc_ms} ms</p>
        </div>
      </div>
      <details className="glass p-3 text-xs"><summary className="cursor-pointer text-muted">Cypher</summary><pre className="mono mt-2 overflow-x-auto">{a.cypher.join("\n\n")}</pre></details>
    </section>
  );
}

function ScenarioB({ b }: { b: any }) {
  const [view, setView] = useState<"bank" | "consortium">("bank");
  const banks = useMemo(() => [...new Set<string>((b.views.consortium.nodes ?? []).map((n: any) => n.bank))].sort(), [b]);
  const v = b.views[view] ?? b.views.consortium;
  const e2 = b.e2?.best_single_bank;
  return (
    <section className="space-y-3">
      <Head k="B" title={`A ring across ${b.case.banks.length} banks`} tone="text-ring">
        <Link href={`/cases/${b.case.id}`} className="link text-sm mono">{b.case.id}</Link>
      </Head>
      <div className="grid gap-3 lg:grid-cols-4">
        <div className="glass p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Best single bank (bank {b.best_bank?.bank})</p>
          <p className="kpi text-4xl text-verify mt-1">{b.best_bank?.holds_pct}%</p>
          <p className="text-xs text-muted">of this ring&apos;s {b.accounts} accounts are its own customers</p>
        </div>
        <div className="glass p-4">
          <p className="text-xs uppercase tracking-wider text-muted">Consortium graph</p>
          <p className="kpi text-4xl text-ok mt-1">100%</p>
          <p className="text-xs text-muted">{b.accounts} accounts and {b.consortium_links} money links in one structure</p>
        </div>
        <div className="glass p-4 lg:col-span-2">
          <p className="text-xs uppercase tracking-wider text-muted">Across the IBM HI-Small evaluation (E2)</p>
          {e2 ? (
            <div className="mt-1 grid grid-cols-3 gap-2">
              <div><p className="kpi text-2xl text-verify">{pct(e2.mean_accounts_held)}</p><p className="text-xs text-muted">ring accounts the best bank holds</p></div>
              <div><p className="kpi text-2xl text-ring">{pct(e2.attempts_fully_held)}</p><p className="text-xs text-muted">rings one bank holds entirely</p></div>
              <div><p className="kpi text-2xl text-ok">100%</p><p className="text-xs text-muted">held by the consortium</p></div>
            </div>
          ) : <p className="text-sm text-muted">Run eval/e2 to fill this.</p>}
          {b.e2 && <p className="mt-1 text-xs text-muted">{b.e2.attempts} laundering groups spanning banks, {b.e2.mean_banks_per_attempt} banks each; {b.e2.dataset}</p>}
        </div>
      </div>
      <div className="glass p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" className="flex gap-1 text-sm">
            {(["bank", "consortium"] as const).map((k) => (
              <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}
                className={`rounded-md px-3 py-1 border ${view === k ? "border-cyan bg-panel-2" : "border-line text-muted"}`}>
                {k === "bank" ? `Bank ${b.best_bank?.bank} alone` : "Consortium"}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">{v.stats.nodes} accounts · {v.stats.edges} links · {v.stats.isolated} look isolated</span>
        </div>
        <div className="mt-3"><WeaveGraph nodes={v.nodes} edges={v.edges} banks={banks} height={340} /></div>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-muted"><tr className="border-b border-line"><th className="py-1.5 font-normal">Bank</th><th className="py-1.5 font-normal text-right">Ring accounts it holds</th><th className="py-1.5 font-normal text-right">Ring transfers it can see</th></tr></thead>
          <tbody>{b.banks.map((x: any) => (
            <tr key={x.bank} className="border-b border-line/40"><td className="py-1.5">Bank {x.bank}</td><td className="py-1.5 text-right tabular-nums">{x.holds} of {b.accounts} ({x.holds_pct}%)</td><td className="py-1.5 text-right tabular-nums">{x.links}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </section>
  );
}

function ScenarioC({ c, replay }: { c: any; replay: boolean }) {
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const reach = useMemo(() => {
    const s = new Set<string>();
    for (const e of c.evidence) {
      s.add(e.id);
      for (const k of ["claims", "derived", "actions", "sentences"]) for (const x of e.reach?.[k] ?? []) s.add(x);
    }
    return s;
  }, [c]);
  const push = async () => {
    setBusy(true);
    try { setRes(await post("/trust/kyc_update", { address_id: c.building, fact: `Address ${c.building} is a 200-unit residential building` })); }
    catch (e: any) { setRes({ error: e.message }); }
    setBusy(false);
  };
  const ind = c.independence;
  return (
    <section className="space-y-3">
      <Head k="C" title={`Shared building ${c.building}: the Skeptic and the cascade`} tone="text-verify">
        <Link href={`/cases/${c.case_id}`} className="link text-sm mono">{c.case_id}</Link>
      </Head>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="glass p-4 lg:col-span-2 space-y-2">
          <p className="text-sm">{c.title}. The Investigator&apos;s claims cite shared identity attributes. The Skeptic checked KYC and found
            that <span className="mono">{c.building}</span> is a large residential building, which explains why unrelated customers share it.</p>
          <ul className="space-y-2 text-sm">
            {c.evidence.map((e: any) => (
              <li key={e.id} className="glass-2 p-2.5">
                <p><span className="mono text-cyan">{e.origin}</span> <span className="text-muted">({e.id}, {e.state})</span></p>
                <p className="text-paper/85">{e.summary}</p>
                <p className="mt-1 text-xs text-muted">If this fact is superseded, the cascade reaches {e.reach.claims.length} claim(s), {e.reach.derived.length} derived claim(s),
                  {" "}{e.reach.actions.length} action(s) and {e.reach.sentences.length} report sentence(s).</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass p-4 space-y-3">
          <p className="text-xs uppercase tracking-wider text-muted">Evidence independence in this case</p>
          <p className="kpi text-2xl">{ind.paths} paths → <span className="text-ok">{ind.origins} origins</span></p>
          <p className="text-sm text-muted">echo-proof {pct(ind.mean_confidence)} vs path counting {pct(ind.mean_naive)}</p>
          <button onClick={push} disabled={busy || replay}
            className="w-full rounded-md bg-verify/15 border border-verify text-verify px-3 py-2 text-sm disabled:opacity-40">
            {busy ? "Pushing KYC update…" : `Push KYC update for ${c.building} (live)`}
          </button>
          {replay && <p className="text-xs text-muted">Live actions need the API; this view is a replay.</p>}
          {res?.error && <p className="text-ring text-sm">{res.error}</p>}
          {res && !res.error && (
            <p className="text-sm">Superseded in {res.affected.length} case(s): <b className="text-verify">{res.totals.claims}</b> claims,{" "}
              <b className="text-verify">{res.totals.actions}</b> actions and <b className="text-verify">{res.totals.sentences}</b> sentences now need verification.
              Approvals resting on them are locked until an override note is written.</p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted">Provenance DAG of the case; highlighted nodes are what a KYC update to {c.building} would reach.</p>
      <ProvenanceDag nodes={c.dag.nodes} edges={c.dag.edges} focus={reach} height={520} />
    </section>
  );
}
