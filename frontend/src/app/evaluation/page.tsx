"use client";
import { useEffect, useMemo, useState } from "react";
import ModeBadge from "@/components/ModeBadge";
import { live } from "@/lib/snapshot";

type Prf = { precision: number; recall: number; f1: number; escalated?: number; tp?: number; fp?: number; fn?: number };
type Curve = { dataset: string; threshold: number; hand_cutoff: number; rules_k: number; rows: [number, number, number, number][] };

const p1 = (x?: number | null) => (x == null ? "–" : `${(Math.round(x * 1000) / 10).toFixed(1)}%`);
const f3 = (x?: number | null) => (x == null ? "–" : x.toFixed(3));

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
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>Evaluation</h1>
          <p className="mt-1.5 max-w-[75ch] text-muted">Every number is read from <span className="mono">eval/results/*.json</span>, written by the scripts in <span className="mono">eval/</span> on IBM&apos;s AMLworld HI-Small data (synthetic, labelled). Misses are reported as misses.</p>
        </div>
        <ModeBadge mode={replay ? "replay" : undefined} />
      </header>
      {!ex && <p className="text-muted">Loading results…</p>}
      {e2 && <E2 r={e2.results} d={e2.dataset} />}
      {e1 && <E1 r={e1.results} params={e1.params} curve={curve} />}
      {e6 && <E6 r={e6.results} />}
      <section className="grid gap-3 lg:grid-cols-3">
        {e3 && <Card title="E3 · Feed-guided seeds (paper reproduction)" tone="text-verify" badge="miss">
          <Row k="Motif seeds (paper 22.6%)" v={p1(e3.results.motif.illicit_ratio)} />
          <Row k="Degree seeds (paper 13.7%)" v={p1(e3.results.degree.illicit_ratio)} />
          <Row k="Random seeds (paper 2.4%)" v={p1(e3.results.random.illicit_ratio)} />
          <p className="mt-2 text-xs text-muted">Illicit share of the investigation subgraphs. The motif score&apos;s degree penalty inverts on this data (account AUC {e3.results.account_auc.motif_paper_params}). Reported as a miss, not tuned on test labels.</p>
        </Card>}
        {e4 && <Card title="E4 · Pass-through matching" tone="text-ok" badge="lift">
          <Row k="Flagged accounts" v={String(e4.results.flagged)} />
          <Row k="Illicit among flagged" v={p1(e4.results.precision)} />
          <Row k="Base rate" v={p1(e4.results.base_rate)} />
        </Card>}
        {e5 && <Card title="E5 · Clue expansion" tone="text-muted" badge="weak">
          {(() => { const best: any = Object.values(e5.results.per_round ?? {}).sort((a: any, b: any) => b.f1 - a.f1)[0] ?? {}; return (<>
            <Row k="Precision (best round)" v={p1(best.precision)} />
            <Row k="Recall" v={p1(best.recall)} /></>); })()}
          <p className="mt-2 text-xs text-muted">Graph signals instead of the paper&apos;s GNN; kept in the report because it is weak.</p>
        </Card>}
      </section>
      {e7 && <E7 r={e7.results} notes={e7.notes} />}
    </div>
  );
}

function E2({ r, d }: { r: any; d: string }) {
  const b = r.best_single_bank;
  return (
    <section className="glass p-6">
      <p className="text-xs uppercase tracking-wider text-muted">E2 · Why a consortium graph</p>
      <div className="mt-3 grid gap-6 md:grid-cols-3">
        <div><p className="kpi text-6xl text-verify">{p1(b.mean_accounts_held)}</p><p className="mt-1 text-sm text-muted">of a laundering ring&apos;s accounts are held by the best-placed single bank</p></div>
        <div><p className="kpi text-6xl text-ring">{p1(b.attempts_fully_held)}</p><p className="mt-1 text-sm text-muted">of rings are held entirely by any one bank</p></div>
        <div><p className="kpi text-6xl text-ok">{p1(r.consortium.mean_accounts_held)}</p><p className="mt-1 text-sm text-muted">held by the consortium graph</p></div>
      </div>
      <p className="mt-4 text-xs text-muted">{r.attempts} laundering groups that span banks ({r.mean_banks_per_attempt} banks each). The best single bank still sees {p1(b.mean_transfers_visible)} of the laundering transfers, but most counterparties are other banks&apos; customers it cannot run KYC on. {d}.</p>
    </section>
  );
}

function stats(rows: Curve["rows"], pred: (r: Curve["rows"][number]) => boolean) {
  let tp = 0, fp = 0, fn = 0;
  for (const r of rows) { const p = pred(r); if (p && r[3]) tp++; else if (p) fp++; else if (r[3]) fn++; }
  const precision = tp + fp ? tp / (tp + fp) : 0, recall = tp + fn ? tp / (tp + fn) : 0;
  return { precision, recall, f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, escalated: tp + fp };
}

function E1({ r, params, curve }: { r: any; params: any; curve: Curve | null }) {
  const [t, setT] = useState<number | null>(null);
  useEffect(() => { if (curve && t == null) setT(curve.threshold); }, [curve, t]);
  const live = useMemo(() => (curve && t != null ? stats(curve.rows, (x) => x[0] >= t) : null), [curve, t]);
  const sweep = useMemo(() => {
    if (!curve) return [];
    const pts = [] as { t: number; p: number; r: number; f: number }[];
    for (let i = 0; i <= 60; i++) {
      const th = i / 60;
      const s = stats(curve.rows, (x) => x[0] >= th);
      pts.push({ t: th, p: s.precision, r: s.recall, f: s.f1 });
    }
    return pts;
  }, [curve]);
  const rows: [string, Prf, string][] = [
    ["Rule-based: escalate every alert", r.baseline_escalate_all, "text-muted"],
    [`Rules without the graph (≥${params?.no_graph_rules_k ?? 3} rules)`, r.no_graph_rules, "text-paper"],
    ["Graph score, hand weights", r.graph_hand_weights, "text-paper"],
    ["Graph score, calibrated on the dev split", r.graph_calibrated, "text-ok"],
  ];
  const W = 520, H = 180, X = (v: number) => 30 + v * (W - 40), Y = (v: number) => H - 20 - v * (H - 40);
  const line = (k: "p" | "r" | "f") => sweep.map((s, i) => `${i ? "L" : "M"}${X(s.t)},${Y(s[k])}`).join(" ");
  return (
    <section className="glass p-6 space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-muted">E1 · Alert triage on {params?.test_accounts?.toLocaleString()} later-period alerted accounts ({params?.illicit_in_test} illicit)</p>
        <p className="text-xs text-muted">weights and thresholds tuned on the earlier half only</p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-muted"><tr className="border-b border-line"><th className="py-1.5 font-normal">Method</th><th className="py-1.5 font-normal text-right">Precision</th><th className="py-1.5 font-normal text-right">Recall</th><th className="py-1.5 font-normal text-right">F1</th><th className="py-1.5 font-normal text-right">Escalated</th></tr></thead>
        <tbody>{rows.map(([k, v, tone]) => (
          <tr key={k} className={`border-b border-line/40 ${tone}`}><td className="py-1.5">{k}</td><td className="py-1.5 text-right tabular-nums">{p1(v.precision)}</td><td className="py-1.5 text-right tabular-nums">{p1(v.recall)}</td><td className="py-1.5 text-right tabular-nums">{f3(v.f1)}</td><td className="py-1.5 text-right tabular-nums">{v.escalated?.toLocaleString()}</td></tr>
        ))}</tbody>
      </table>
      {!curve ? <p className="text-sm text-muted">Threshold explorer: per-account scores have not been exported yet (rerun <span className="mono">eval/e1_alert_triage.py</span>).</p> : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] items-start">
          <div>
            <label className="text-sm text-muted">Calibrated model threshold <span className="mono text-paper">{t?.toFixed(3)}</span>
              {t != null && Math.abs(t - curve.threshold) > 1e-6 && <button onClick={() => setT(curve.threshold)} className="ml-2 link text-xs">reset to dev-tuned {curve.threshold}</button>}
            </label>
            <input type="range" min={0} max={1} step={0.002} value={t ?? 0} onChange={(e) => setT(+e.target.value)} className="mt-1 w-full accent-[var(--cyan)]" aria-label="Triage threshold" />
            <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full" role="img" aria-label="Precision, recall and F1 by threshold">
              {[0, 0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={30} x2={W - 10} y1={Y(g)} y2={Y(g)} stroke="#243247" />)}
              <path d={line("p")} fill="none" stroke="#06b6d4" strokeWidth={2} />
              <path d={line("r")} fill="none" stroke="#f59e0b" strokeWidth={2} />
              <path d={line("f")} fill="none" stroke="#10b981" strokeWidth={2.5} />
              {t != null && <line x1={X(t)} x2={X(t)} y1={10} y2={H - 20} stroke="#e2e8f0" strokeDasharray="3 3" />}
              <line x1={X(curve.threshold)} x2={X(curve.threshold)} y1={10} y2={H - 20} stroke="#10b98166" />
              {[0, 0.5, 1].map((g) => <text key={g} x={X(g)} y={H - 4} fill="#94a3b8" fontSize={10} textAnchor="middle">{g}</text>)}
              <text x={W - 12} y={18} fill="#06b6d4" fontSize={10} textAnchor="end">precision</text>
              <text x={W - 12} y={32} fill="#f59e0b" fontSize={10} textAnchor="end">recall</text>
              <text x={W - 12} y={46} fill="#10b981" fontSize={10} textAnchor="end">F1</text>
            </svg>
          </div>
          {live && (
            <div className="glass-2 p-4 text-sm space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted">At this threshold</p>
              <p>Precision <b className="text-cyan">{p1(live.precision)}</b></p>
              <p>Recall <b className="text-verify">{p1(live.recall)}</b></p>
              <p>F1 <b className="text-ok">{f3(live.f1)}</b></p>
              <p>Escalated <b>{live.escalated.toLocaleString()}</b> of {curve.rows.length.toLocaleString()} ({p1(live.escalated / curve.rows.length)})</p>
              <p className="pt-1 text-xs text-muted">Computed in your browser from {curve.rows.length.toLocaleString()} exported test scores.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function E6({ r }: { r: any }) {
  const tiles: [string, string, string, string][] = [
    [p1(r.echo.echo_rate), "of evidence items repeated an origin already seen", "text-verify", "echo"],
    [`${r.echo.claims_with_more_paths_than_sources}/${r.echo.claims}`, "claims had more paths than independent sources", "text-verify", "echo"],
    [`${p1(r.echo.mean_confidence_naive)} → ${p1(r.echo.mean_confidence_echo_proof)}`, "mean confidence, path counting → distinct origins", "text-cyan", "echo"],
    [`${r.gate.published}/${r.gate.sars}`, `SARs passed the provenance gate (mean fidelity ${r.gate.mean_pf}); ${r.gate.divergent} became divergence reports`, "text-ok", "gate"],
    [`${p1(r.invalidation.affected_recall)} / ${p1(r.invalidation.affected_precision)}`, `cascade recall / precision on ${r.invalidation.trials} scripted dependency graphs`, "text-ok", "cascade"],
    [String(r.stale_actions_approved_without_override), "stale approvals without an override note", "text-ok", "premise"],
  ];
  return (
    <section className="glass p-6">
      <p className="text-xs uppercase tracking-wider text-muted">E6 · Trust layer on the {r.cases} cases the agents built</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map(([v, l, tone, tag]) => (
          <div key={l} className="glass-2 p-4"><p className="text-[10px] uppercase tracking-wider text-muted">{tag}</p><p className={`kpi text-2xl ${tone}`}>{v}</p><p className="mt-1 text-xs text-muted">{l}</p></div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">The cascade figure comes from scripted dependency graphs with known ground truth, not from live cases.</p>
    </section>
  );
}

function E7({ r, notes }: { r: Record<string, any>; notes?: string[] }) {
  return (
    <section className="glass p-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs uppercase tracking-wider text-muted">E7 · Tool latency</p>
        <span className="badge text-verify">local benchmark</span>
        <span className="text-xs text-muted">{notes?.[0]}</span>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-muted"><tr className="border-b border-line"><th className="py-1.5 font-normal">Tool / query</th><th className="py-1.5 font-normal text-right">median</th><th className="py-1.5 font-normal text-right">p95</th></tr></thead>
        <tbody>{Object.entries(r).map(([k, v]) => (
          <tr key={k} className="border-b border-line/40"><td className="py-1.5 mono text-xs">{k}</td><td className="py-1.5 text-right tabular-nums">{v.median_ms ?? v.ms} ms</td><td className="py-1.5 text-right tabular-nums text-muted">{v.p95_ms != null ? `${v.p95_ms} ms` : ""}</td></tr>
        ))}</tbody>
      </table>
    </section>
  );
}

function Card({ title, tone, badge, children }: { title: string; tone: string; badge: string; children: React.ReactNode }) {
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm">{title}</h3><span className={`badge ${tone}`}>{badge}</span></div>
      <div className="mt-2 text-sm space-y-1">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <p className="flex justify-between"><span className="text-muted">{k}</span><span className="tabular-nums">{v}</span></p>;
}
