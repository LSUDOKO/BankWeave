"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import ModeBadge from "@/components/ModeBadge";
import WeaveGraph from "@/components/WeaveGraph";
import { Card, Chip, Empty, PageHeader, StatCard, Tabs, btn, stateTone, type Tone } from "@/components/ui";
import { post } from "@/lib/api";
import { setBankOrder } from "@/lib/banks";
import { capturedAt, live } from "@/lib/snapshot";

const ProvenanceDag = dynamic(() => import("@/components/ProvenanceDag"), { ssr: false });

const pct = (x?: number | null) => (x == null ? "–" : `${Math.round(x * 1000) / 10}%`);
const TH = "py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted";

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
  const a = d?.A, b = d?.B, c = d?.C;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Golden scenarios"
        sub={<>Three investigations that show what the graph decides and why. Computed live from FalkorDB{d?.ms ? ` (${d.ms} ms)` : ""};
          when the free-tier API is asleep, the same responses load from a snapshot{capturedAt ? ` captured ${capturedAt}` : ""}.</>}
        actions={<>
          {replay && <ModeBadge mode="replay" />}
          {(["A", "B", "C"] as const).map((k) => <a key={k} href={`#${k}`} className={btn.soft}>Scenario {k}</a>)}
        </>}
      />
      {err && <p className="text-verify">{err}</p>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled i={0} label="Best single bank sees" value={b?.best_bank?.holds_pct != null ? `${b.best_bank.holds_pct}%` : "–"}
          chip="Scenario B" sub={b ? `of the ring's ${b.accounts} accounts` : "loading"} />
        <StatCard i={1} label="Consortium sees" value={b ? "100%" : "–"} chip={b ? `${b.consortium_links} links` : "B"} sub="the whole ring in one structure" />
        <StatCard i={2} label="Alert cleared by wcc" value={a ? String(a.wcc?.size ?? a.alert.component_size ?? "–") : "–"} chip="Scenario A"
          sub={a ? `accounts at ${a.wcc?.n_banks ?? 1} bank, no cross-bank links` : "loading"} />
        <StatCard i={3} label="Evidence paths → origins" value={c ? `${c.independence.paths}→${c.independence.origins}` : "–"} chip="Scenario C"
          sub={c ? `echo-proof ${pct(c.independence.mean_confidence)} vs ${pct(c.independence.mean_naive)}` : "loading"} />
      </section>

      {!d && !err && (
        <div className="grid gap-4 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="glass h-40 animate-pulse" />)}
        </div>
      )}
      {a && <ScenarioA a={a} />}
      {b && <ScenarioB b={b} />}
      {c && <ScenarioC c={c} replay={replay} />}
    </div>
  );
}

function Head({ k, title, tone, tag, children }: { k: string; title: string; tone: Tone; tag: string; children?: React.ReactNode }) {
  return (
    <div id={k} className="flex scroll-mt-24 flex-wrap items-center gap-3 pt-3">
      <span className="kpi grid size-10 place-items-center rounded-xl bg-deep text-lg text-white">{k}</span>
      <h2 className="text-[22px] font-semibold" style={{ letterSpacing: "-0.02em" }}>{title}</h2>
      <Chip tone={tone}>{tag}</Chip>
      {children}
    </div>
  );
}

function ScenarioA({ a }: { a: any }) {
  const s = a.alert.signals ?? {};
  return (
    <section className="space-y-4">
      <Head k="A" title="An innocent alert, cleared by algo.wcc" tone="ok" tag="cleared" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="What triage decided" className="lg:col-span-2">
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Chip tone="blue">alert <span className="mono">{a.alert.id}</span></Chip>
            <Chip>rule <span className="mono">{a.alert.rule}</span></Chip>
            <Chip>bank {a.alert.bank}</Chip>
          </p>
          <p className="mt-3 text-[17px] font-medium leading-snug text-deep">{a.alert.reason}</p>
          <p className="mt-3 text-sm">Triage ran weakly connected components over the consortium. The account belongs to a component of
            <b className="text-ok"> {a.wcc?.size ?? a.alert.component_size} accounts at {a.wcc?.n_banks ?? 1} bank</b>, with no cross-bank counterparties, so it
            cannot be part of a layering ring. Decision: <b className="text-ok">cleared</b> ({a.alert.cleared}).</p>
          <p className="mt-3 rounded-xl bg-panel-2 px-3 py-2 text-xs text-muted">The rule alone would have sent this to an analyst. Of the alerts in this dataset, most are cleared the same way.</p>
        </Card>
        <Card title="Signals the agent used" action={<Chip tone="blue">wcc {a.wcc_ms} ms</Chip>}>
          <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
            {Object.entries(s).filter(([, v]) => typeof v !== "object").slice(0, 8).map(([k, v]) => (
              <Fragment key={k}>
                <dt className="text-muted">{k.replace(/_/g, " ")}</dt>
                <dd className="mono text-right">{typeof v === "number" ? Math.round(v * 1000) / 1000 : String(v)}</dd>
              </Fragment>
            ))}
          </dl>
        </Card>
      </div>
      <details className="glass group p-4 text-xs">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium">
          <Icon name="lab" className="size-4 text-cyan" />Cypher behind the decision
          <span className="ml-auto text-xs text-muted group-open:hidden">show</span><span className="ml-auto hidden text-xs text-muted group-open:inline">hide</span>
        </summary>
        <pre className="mono mt-3 overflow-x-auto rounded-xl border border-line bg-ink p-3">{a.cypher.join("\n\n")}</pre>
      </details>
    </section>
  );
}

function ScenarioB({ b }: { b: any }) {
  const [view, setView] = useState<"bank" | "consortium">("bank");
  const banks = useMemo(() => [...new Set<string>((b.views.consortium.nodes ?? []).map((n: any) => n.bank))].sort(), [b]);
  const v = b.views[view] ?? b.views.consortium;
  const e2 = b.e2?.best_single_bank;
  return (
    <section className="space-y-4">
      <Head k="B" title={`A ring across ${b.case.banks.length} banks`} tone="ring" tag="ring">
        <Link href={`/cases/${b.case.id}`} className={btn.small}>Open case <span className="mono">{b.case.id}</span></Link>
      </Head>
      <div className="grid gap-4 lg:grid-cols-4">
        <Card title={`Best single bank (bank ${b.best_bank?.bank})`}>
          <p className="kpi text-[44px] leading-none text-verify">{b.best_bank?.holds_pct}%</p>
          <p className="mt-2 text-xs text-muted">of this ring&apos;s {b.accounts} accounts are its own customers</p>
          <Bar v={(b.best_bank?.holds_pct ?? 0) / 100} tone="bg-verify" />
        </Card>
        <Card title="Consortium graph">
          <p className="kpi text-[44px] leading-none text-ok">100%</p>
          <p className="mt-2 text-xs text-muted">{b.accounts} accounts and {b.consortium_links} money links in one structure</p>
          <Bar v={1} tone="bg-ok" />
        </Card>
        <div className="fill-deep relative overflow-hidden rounded-[22px] p-5 lg:col-span-2">
          <span className="lines" />
          <div className="relative flex items-center justify-between gap-2">
            <h3 className="text-[17px] font-medium text-white">Across the IBM HI-Small evaluation (E2)</h3>
            <Link href="/evaluation" className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-sky hover:bg-white/20">Evaluation →</Link>
          </div>
          {e2 ? (
            <div className="relative mt-4 grid grid-cols-3 gap-2">
              {[[pct(e2.mean_accounts_held), "ring accounts the best bank holds"], [pct(e2.attempts_fully_held), "rings one bank holds entirely"], ["100%", "held by the consortium"]].map(([val, l]) => (
                <div key={l} className="rounded-xl bg-white/[.07] p-3">
                  <p className="kpi text-2xl text-white">{val}</p>
                  <p className="mt-1 text-[11px] leading-snug text-white/65">{l}</p>
                </div>
              ))}
            </div>
          ) : <p className="relative mt-4 text-sm text-white/70">Run eval/e2 to fill this.</p>}
          {b.e2 && <p className="relative mt-3 text-xs text-white/60">{b.e2.attempts} laundering groups spanning banks, {b.e2.mean_banks_per_attempt} banks each; {b.e2.dataset}</p>}
        </div>
      </div>
      <Card
        title="The same ring, two views"
        action={<Tabs value={view} onChange={setView} items={[["bank", `Bank ${b.best_bank?.bank} alone`], ["consortium", "Consortium"]]} />}
      >
        <p className="-mt-1 mb-3 flex flex-wrap gap-2 text-xs">
          <Chip tone="blue">{v.stats.nodes} accounts</Chip><Chip tone="blue">{v.stats.edges} links</Chip>
          <Chip tone={v.stats.isolated ? "warn" : "ok"}>{v.stats.isolated} look isolated</Chip>
        </p>
        <div className="overflow-hidden rounded-2xl border border-line"><WeaveGraph nodes={v.nodes} edges={v.edges} banks={banks} height={340} /></div>
        <table className="mt-4 w-full text-sm">
          <thead className="text-left"><tr><th className={TH}>Bank</th><th className={`${TH} text-right`}>Ring accounts it holds</th><th className={`${TH} text-right`}>Ring transfers it can see</th></tr></thead>
          <tbody>{b.banks.map((x: any) => (
            <tr key={x.bank} className="border-t border-line hover:bg-panel-2/50">
              <td className="py-2.5 font-medium">Bank {x.bank}</td>
              <td className="py-2.5 text-right tabular-nums">{x.holds} of {b.accounts} <span className="text-muted">({x.holds_pct}%)</span></td>
              <td className="py-2.5 text-right tabular-nums">{x.links}</td>
            </tr>
          ))}</tbody>
        </table>
      </Card>
    </section>
  );
}

function Bar({ v, tone }: { v: number; tone: string }) {
  return (
    <div className="hatch mt-4 h-3 overflow-hidden rounded-full">
      <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%` }} />
    </div>
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
    <section className="space-y-4">
      <Head k="C" title={`Shared building ${c.building}: the Skeptic and the cascade`} tone="warn" tag="cascade">
        <Link href={`/cases/${c.case_id}`} className={btn.small}>Open case <span className="mono">{c.case_id}</span></Link>
      </Head>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="What the Skeptic found" className="lg:col-span-2">
          <p className="text-sm">{c.title}. The Investigator&apos;s claims cite shared identity attributes. The Skeptic checked KYC and found
            that <span className="mono">{c.building}</span> is a large residential building, which explains why unrelated customers share it.</p>
          <ul className="mt-4 space-y-2.5 text-sm">
            {c.evidence.map((e: any) => (
              <li key={e.id} className="rounded-2xl border border-line p-3.5">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="mono text-cyan">{e.origin}</span>
                  <span className="mono text-xs text-muted">{e.id}</span>
                  <Chip tone={stateTone(e.state)} className="ml-auto">{String(e.state).replace(/_/g, " ")}</Chip>
                </p>
                <p className="mt-1.5 text-paper/85">{e.summary}</p>
                <p className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted">
                  <span>If superseded, the cascade reaches</span>
                  <Chip>{e.reach.claims.length} claim(s)</Chip><Chip>{e.reach.derived.length} derived</Chip>
                  <Chip>{e.reach.actions.length} action(s)</Chip><Chip>{e.reach.sentences.length} sentence(s)</Chip>
                </p>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Evidence independence">
          <p className="kpi text-[40px] leading-none">{ind.paths}<span className="mx-2 text-2xl text-muted">→</span><span className="text-ok">{ind.origins}</span></p>
          <p className="mt-1 text-xs text-muted">paths → independent origins</p>
          <div className="mt-4 space-y-2 text-xs">
            <div><div className="flex justify-between"><span className="text-muted">Echo-proof confidence</span><b>{pct(ind.mean_confidence)}</b></div><Bar v={ind.mean_confidence ?? 0} tone="bg-cyan" /></div>
            <div><div className="flex justify-between"><span className="text-muted">Path counting</span><b>{pct(ind.mean_naive)}</b></div><Bar v={ind.mean_naive ?? 0} tone="bg-sky" /></div>
          </div>
          <button onClick={push} disabled={busy || replay} className={`${btn.primary} mt-5 w-full`}>
            {busy ? "Pushing KYC update…" : `Push KYC update for ${c.building} (live)`}
          </button>
          {replay && <p className="mt-2 text-xs text-muted">Live actions need the API; this view is a replay.</p>}
          {res?.error && <p className="mt-2 text-sm text-ring">{res.error}</p>}
          {res && !res.error && (
            <p className="mt-3 rounded-xl bg-[#fff6e6] p-3 text-sm">Superseded in {res.affected.length} case(s): <b className="text-verify">{res.totals.claims}</b> claims,{" "}
              <b className="text-verify">{res.totals.actions}</b> actions and <b className="text-verify">{res.totals.sentences}</b> sentences now need verification.
              Approvals resting on them are locked until an override note is written.</p>
          )}
        </Card>
      </div>
      <Card title="Provenance DAG" action={<span className="text-xs text-muted">highlighted: what a KYC update to {c.building} would reach</span>}>
        {c.dag?.nodes?.length
          ? <ProvenanceDag nodes={c.dag.nodes} edges={c.dag.edges} focus={reach} height={520} />
          : <Empty>No provenance recorded for this case.</Empty>}
      </Card>
    </section>
  );
}
