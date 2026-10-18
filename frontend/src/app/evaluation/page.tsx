"use client";
import { useEffect, useMemo, useState } from "react";
import ModeBadge from "@/components/ModeBadge";
import { Card, Chip, Empty, PageHeader, StatCard, type Tone } from "@/components/ui";
import { live } from "@/lib/snapshot";

type Prf = { precision: number; recall: number; f1: number; escalated?: number; tp?: number; fp?: number; fn?: number };
type Curve = { dataset: string; threshold: number; threshold_source?: string; hand_cutoff: number; rules_k: number; rows: [number, number, number, number][] };

const p1 = (x?: number | null) => (x == null ? "–" : `${(Math.round(x * 1000) / 10).toFixed(1)}%`);
const f3 = (x?: number | null) => (x == null ? "–" : x.toFixed(3));
const TH = "py-2.5 text-[11px] font-medium uppercase tracking-wide text-muted";

export default function Evaluation() {
  const [ex, setEx] = useState<Record<string, any> | null>(null);
  const [curve, setCurve] = useState<Curve | null>(null);
  const [replay, setReplay] = useState(false);
  useEffect(() => {
    live<{ experiments: Record<string, any> }>("/eval").then(({ data, replay }) => { setEx(data.experiments); setReplay(replay); }).catch(() => setEx({}));
    live<Curve>("/eval/curve").then(({ data }) => setCurve(data)).catch(() => setCurve(null));
  }, []);
  const e1 = ex?.E1_alert_triage, e2 = ex?.E2_consortium_vs_single_bank, e3 = ex?.E3_spnsa_hunt,
    e4 = ex?.E4_passthrough, e5 = ex?.E5_clue_expansion, e6 = ex?.E6_trust_layer, e7 = ex?.E7_performance;
  const b2 = e2?.results?.best_single_bank, cal = e1?.results?.graph_calibrated, gate = e6?.results?.gate;
  return (
    <div className="space-y-5">
      <PageHeader
        title="Evaluation"
        sub={<>Every number is read from <span className="mono">eval/results/*.json</span>, written by the scripts in <span className="mono">eval/</span> on IBM&apos;s AMLworld HI-Small data (synthetic, labelled). Misses are reported as misses.</>}
        actions={replay && <ModeBadge mode="replay" />}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled i={0} label="Best single bank holds" value={p1(b2?.mean_accounts_held)} chip="E2" sub="of a ring's accounts, on average" />
        <StatCard i={1} label="Rings one bank holds" value={p1(b2?.attempts_fully_held)} chip="E2" sub={e2 ? `entirely, of ${e2.results.attempts} cross-bank groups` : "entirely"} />
        <StatCard i={2} label="Triage F1, held out" value={f3(cal?.f1)} chip="E1" sub={cal ? `precision ${p1(cal.precision)}, recall ${p1(cal.recall)}` : "calibrated graph score"} />
        <StatCard i={3} label="SARs through the gate" value={gate ? `${gate.published}/${gate.sars}` : "–"} chip="E6" sub={gate ? `mean provenance fidelity ${gate.mean_pf}` : "provenance gate"} />
      </section>

      {!ex && <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <div key={i} className="glass h-48 animate-pulse" />)}</div>}
      {ex && !Object.keys(ex).length && <Empty>No results available: the API is unreachable and no snapshot is bundled.</Empty>}
      {e2 && <E2 r={e2.results} d={e2.dataset} />}
      {e1 && <E1 r={e1.results} params={e1.params} curve={curve} />}
      {e6 && <E6 r={e6.results} />}
      <section className="grid gap-4 lg:grid-cols-3">
        {e3 && <Small title="E3 · Feed-guided seeds" sub="paper reproduction" tone="ring" badge="miss">
          <Row k="Motif seeds (paper 22.6%)" v={p1(e3.results.motif.illicit_ratio)} />
          <Row k="Degree seeds (paper 13.7%)" v={p1(e3.results.degree.illicit_ratio)} />
          <Row k="Random seeds (paper 2.4%)" v={p1(e3.results.random.illicit_ratio)} />
          <p className="mt-3 text-xs text-muted">Illicit share of the investigation subgraphs. The motif score&apos;s degree penalty inverts on this data (account AUC {e3.results.account_auc.motif_paper_params}). Reported as a miss, not tuned on test labels.</p>
        </Small>}
        {e4 && <Small title="E4 · Pass-through matching" sub="money in, money out" tone="ok" badge="lift">
          <Row k="Flagged accounts" v={String(e4.results.flagged)} />
          <Row k="Illicit among flagged" v={p1(e4.results.precision)} />
          <Row k="Base rate" v={p1(e4.results.base_rate)} />
        </Small>}
        {e5 && <Small title="E5 · Clue expansion" sub="graph signals, no GNN" tone="muted" badge="weak">
          {(() => { const best: any = Object.values(e5.results.per_round ?? {}).sort((a: any, b: any) => b.f1 - a.f1)[0] ?? {}; return (<>
            <Row k="Precision (best round)" v={p1(best.precision)} />
            <Row k="Recall" v={p1(best.recall)} /></>); })()}
          <p className="mt-3 text-xs text-muted">Graph signals instead of the paper&apos;s GNN; kept in the report because it is weak.</p>
        </Small>}
      </section>
      {e7 && <E7 r={e7.results} notes={e7.notes} />}
    </div>
  );
}

function E2({ r, d }: { r: any; d: string }) {
  const b = r.best_single_bank;
  const bars: [string, number, string, string][] = [
    ["Best-placed single bank: ring accounts held", b.mean_accounts_held, "bg-sky", "text-verify"],
    ["Rings held entirely by any one bank", b.attempts_fully_held, "bg-ring/80", "text-ring"],
    ["Consortium graph: ring accounts held", r.consortium.mean_accounts_held, "bg-deep", "text-ok"],
  ];
  return (
    <Card title="E2 · Why a consortium graph" action={<Chip tone="blue">{r.attempts} cross-bank groups</Chip>}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="grid grid-cols-3 gap-3">
          {bars.map(([l, v, , tone]) => (
            <div key={l}>
              <p className={`kpi text-[40px] leading-none ${tone}`}>{p1(v)}</p>
              <p className="mt-2 text-xs text-muted">{l.toLowerCase()}</p>
            </div>
          ))}
        </div>
        <div className="space-y-3">
          {bars.map(([l, v, fill]) => (
            <div key={l}>
              <div className="flex justify-between text-xs"><span className="text-muted">{l}</span><b className="tabular-nums">{p1(v)}</b></div>
              <div className="hatch mt-1.5 h-4 overflow-hidden rounded-full">
                <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(0, Math.min(1, v ?? 0)) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-5 rounded-xl bg-panel-2 px-3 py-2 text-xs text-muted">{r.attempts} laundering groups that span banks ({r.mean_banks_per_attempt} banks each). The best single bank still sees {p1(b.mean_transfers_visible)} of the laundering transfers, but most counterparties are other banks&apos; customers it cannot run KYC on. {d}.</p>
    </Card>
  );
}

function stats(rows: Curve["rows"], pred: (r: Curve["rows"][number]) => boolean) {
  let tp = 0, fp = 0, fn = 0;
  for (const r of rows) { const p = pred(r); if (p && r[3]) tp++; else if (p) fp++; else if (r[3]) fn++; }
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, escalated: tp + fp };
}

function E1({ r, params, curve }: { r: any; params: any; curve: Curve | null }) {
  // the explorer escalates the k highest-scoring accounts; k is what an analyst team can absorb
  const n = curve?.rows.length ?? 0;
  const liveK = useMemo(() => (curve ? curve.rows.filter((x) => x[0] >= curve.threshold).length : 0), [curve]);
  const [k, setK] = useState<number | null>(null);
  useEffect(() => { if (curve && k == null) setK(Math.max(1, liveK)); }, [curve, k, liveK]);
  const at = (kk: number) => (curve ? stats(curve.rows.map((x, i) => [x[0], x[1], x[2], x[3], i] as any), (x: any) => x[4] < kk) : null);
  const live = useMemo(() => (k != null ? at(k) : null), [k, curve]); // eslint-disable-line react-hooks/exhaustive-deps
  const rules = useMemo(() => (curve ? stats(curve.rows, (x) => x[2] >= curve.rules_k) : null), [curve]);
  const base = curve ? curve.rows.filter((x) => x[3]).length / Math.max(1, n) : 0;
  const sweep = useMemo(() => {
    if (!curve) return [];
    return Array.from({ length: 61 }, (_, i) => {
      const kk = Math.max(1, Math.round((i / 60) * n));
      const s = at(kk)!;
      return { t: kk / n, p: s.precision, r: s.recall, f: s.f1 };
    });
  }, [curve]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows: [string, Prf, boolean][] = [
    ["Rule-based: escalate every alert", r.baseline_escalate_all, false],
    [`Rules without the graph (≥${params?.no_graph_rules_k ?? 3} rules)`, r.no_graph_rules, false],
    ["Graph score, hand weights", r.graph_hand_weights, false],
    ["Graph score, calibrated on the dev split", r.graph_calibrated, true],
  ];
  const W = 520, H = 180, X = (v: number) => 30 + v * (W - 40), Y = (v: number) => H - 20 - v * (H - 40);
  const line = (key: "p" | "r" | "f") => sweep.map((s, i) => `${i ? "L" : "M"}${X(s.t)},${Y(s[key])}`).join(" ");
  return (
    <Card title={`E1 · Alert triage on ${params?.test_accounts?.toLocaleString() ?? "–"} later-period alerted accounts`}
      action={<Chip tone="warn">tuned on the earlier half only</Chip>}>
      <p className="-mt-2 mb-3 text-xs text-muted">{params?.illicit_in_test} illicit in the test period, IBM HI-Small.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left"><tr><th className={TH}>Method</th><th className={`${TH} text-right`}>Precision</th><th className={`${TH} text-right`}>Recall</th><th className={`${TH} text-right`}>F1</th><th className={`${TH} text-right`}>Escalated</th></tr></thead>
          <tbody>{rows.map(([kk, v, best]) => (
            <tr key={kk} className={`border-t border-line ${best ? "bg-panel-2/70 font-medium" : ""}`}>
              <td className="py-2.5 pl-2">{kk}{best && <Chip tone="ok" className="ml-2">held-out result</Chip>}</td>
              <td className="py-2.5 text-right tabular-nums">{p1(v?.precision)}</td><td className="py-2.5 text-right tabular-nums">{p1(v?.recall)}</td>
              <td className={`py-2.5 text-right tabular-nums ${best ? "text-ok" : ""}`}>{f3(v?.f1)}</td><td className="py-2.5 pr-2 text-right tabular-nums">{v?.escalated?.toLocaleString()}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!curve ? <p className="mt-4 text-sm text-muted">Threshold explorer: run <span className="mono">eval/e1_slice_scores.py</span> to export per-account scores.</p> : (
        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[15px] font-medium">Threshold explorer</h3>
            <p className="text-xs text-muted">{curve.dataset}: {n.toLocaleString()} alerted accounts, {curve.rows.filter((x) => x[3]).length} illicit ({p1(base)} base rate)</p>
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="rounded-2xl border border-line p-4">
              <label className="text-sm text-muted">Escalate the top <span className="mono font-semibold text-paper">{k}</span> accounts by model score
                {k !== liveK && <button onClick={() => setK(liveK)} className="link ml-2 text-xs">reset to the live cutoff ({liveK})</button>}
              </label>
              <input type="range" min={1} max={n} step={1} value={k ?? 1} onChange={(e) => setK(+e.target.value)} className="mt-2 w-full accent-[var(--cyan)]" aria-label="Accounts escalated" />
              <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Precision, recall and F1 by share escalated">
                {[0, 0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={30} x2={W - 10} y1={Y(g)} y2={Y(g)} stroke="#e3e8ef" />)}
                <path d={line("p")} fill="none" stroke="#087cf8" strokeWidth={2.2} strokeLinecap="round" />
                <path d={line("r")} fill="none" stroke="#8ad8fc" strokeWidth={2.2} strokeLinecap="round" />
                <path d={line("f")} fill="none" stroke="#0b2a5b" strokeWidth={2.8} strokeLinecap="round" />
                {k != null && <line x1={X(k / n)} x2={X(k / n)} y1={10} y2={H - 20} stroke="#0c1a2e" strokeDasharray="3 3" />}
                <line x1={X(liveK / n)} x2={X(liveK / n)} y1={10} y2={H - 20} stroke="#0c946688" />
                {[0, 0.5, 1].map((g) => <text key={g} x={X(g)} y={H - 4} fill="#5b6b80" fontSize={10} textAnchor="middle">{Math.round(g * 100)}% escalated</text>)}
              </svg>
              <p className="mt-1 flex flex-wrap gap-4 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-cyan" />Precision</span>
                <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-sky" />Recall</span>
                <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-deep" />F1</span>
                <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-px bg-ok" />Live cutoff</span>
              </p>
            </div>
            {live && (
              <div className="fill-deep relative overflow-hidden rounded-[22px] p-5 text-sm">
                <span className="lines" />
                <div className="relative">
                  <p className="text-[15px] font-medium">Escalating {k} <span className="text-white/60">({p1((k ?? 0) / n)})</span></p>
                  <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                    {[["Precision", p1(live.precision)], ["Recall", p1(live.recall)], ["F1", f3(live.f1)]].map(([kk, v]) => (
                      <div key={kk} className="rounded-xl bg-white/[.07] py-2"><dt className="text-[10.5px] text-white/60">{kk}</dt><dd className="kpi text-lg">{v}</dd></div>
                    ))}
                  </dl>
                  <p className="mt-3 text-xs text-sky">{(live.precision / Math.max(base, 1e-9)).toFixed(1)}× the base rate</p>
                  {rules && <p className="mt-2 text-xs text-white/65">Rules alone (≥{curve.rules_k} rules) on the same accounts: P {p1(rules.precision)}, R {p1(rules.recall)}, {rules.escalated} escalated.</p>}
                  <p className="mt-2 text-xs text-white/65">Computed in your browser from exported scores; the live cutoff comes from {curve.threshold_source ?? "the calibration"}.</p>
                  <p className="mt-2 rounded-lg bg-[#c97a06]/25 px-2 py-1.5 text-xs text-[#ffd59a]">The slice overlaps the data the model was trained on, so these numbers are optimistic. The held-out result is the table above (F1 0.205).</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function E6({ r }: { r: any }) {
  const tiles: [string, string, Tone, string][] = [
    [p1(r.echo.echo_rate), "of evidence items repeated an origin already seen", "warn", "echo"],
    [`${r.echo.claims_with_more_paths_than_sources}/${r.echo.claims}`, "claims had more paths than independent sources", "warn", "echo"],
    [`${p1(r.echo.mean_confidence_naive)} → ${p1(r.echo.mean_confidence_echo_proof)}`, "mean confidence, path counting → distinct origins", "blue", "echo"],
    [`${r.gate.published}/${r.gate.sars}`, `SARs passed the provenance gate (mean fidelity ${r.gate.mean_pf}); ${r.gate.divergent} became divergence reports`, "ok", "gate"],
    [`${p1(r.invalidation.affected_recall)} / ${p1(r.invalidation.affected_precision)}`, `cascade recall / precision on ${r.invalidation.trials} scripted dependency graphs`, "ok", "cascade"],
    [String(r.stale_actions_approved_without_override), "stale approvals without an override note", "ok", "premise"],
  ];
  return (
    <Card title={`E6 · Trust layer on the ${r.cases} cases the agents built`}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([v, l, tone, tag]) => (
          <div key={l} className="rounded-2xl border border-line p-4">
            <Chip tone={tone}>{tag}</Chip>
            <p className="kpi mt-2 text-[26px] leading-tight">{v}</p>
            <p className="mt-1 text-xs text-muted">{l}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted">The cascade figure comes from scripted dependency graphs with known ground truth, not from live cases.</p>
    </Card>
  );
}

function E7({ r, notes }: { r: Record<string, any>; notes?: string[] }) {
  const entries = Object.entries(r);
  const max = Math.max(0.001, ...entries.map(([, v]) => v.median_ms ?? v.ms ?? 0));
  return (
    <Card title="E7 · Tool latency" action={<Chip tone="warn">local benchmark</Chip>}>
      {notes?.[0] && <p className="-mt-2 mb-3 text-xs text-muted">{notes[0]}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left"><tr><th className={TH}>Tool / query</th><th className={`${TH} w-[38%]`}>Median, relative</th><th className={`${TH} text-right`}>median</th><th className={`${TH} text-right`}>p95</th></tr></thead>
          <tbody>{entries.map(([k, v]) => {
            const m = v.median_ms ?? v.ms ?? 0;
            return (
              <tr key={k} className="border-t border-line hover:bg-panel-2/50">
                <td className="mono py-2.5 text-xs">{k}</td>
                <td className="py-2.5 pr-4"><div className="h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-cyan" style={{ width: `${Math.max(2, (m / max) * 100)}%` }} /></div></td>
                <td className="py-2.5 text-right tabular-nums">{m} ms</td>
                <td className="py-2.5 text-right tabular-nums text-muted">{v.p95_ms != null ? `${v.p95_ms} ms` : ""}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </Card>
  );
}

function Small({ title, sub, tone, badge, children }: { title: string; sub: string; tone: Tone; badge: string; children: React.ReactNode }) {
  return (
    <Card title={<span>{title}<span className="block text-xs font-normal text-muted">{sub}</span></span>} action={<Chip tone={tone}>{badge}</Chip>}>
      <div className="space-y-2 text-sm">{children}</div>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <p className="flex justify-between border-b border-line/60 pb-2 last:border-0"><span className="text-muted">{k}</span><span className="font-semibold tabular-nums">{v}</span></p>;
}
