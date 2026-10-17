"use client";
import { useEffect, useState } from "react";
import { get, money } from "@/lib/api";

// validated with the dataviz palette checker on the #0f1b2d surface (dark band, CVD, contrast)
const BLUE = "#3889cc";
const GREEN = "#1f9b74";
const BASE = "#5b6b82";

type Exp = { experiment: string; commit: string; dataset: string; generated_at: string; params: any; results: any; notes: string[]; _file: string };

const pct = (x?: number) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);

export default function Scoreboard() {
  const [ex, setEx] = useState<Record<string, Exp> | null>(null);
  useEffect(() => { get("/eval").then((d) => setEx(d.experiments)).catch(() => setEx({})); }, []);
  if (!ex) return <p className="text-muted">Loading results…</p>;
  const e1 = ex.E1_alert_triage, e2 = ex.E2_consortium_vs_single_bank, e3 = ex.E3_spnsa_hunt,
    e4 = ex.E4_passthrough, e5 = ex.E5_clue_expansion, e6 = ex.E6_trust_layer, e7 = ex.E7_performance;
  return (
    <div className="max-w-5xl">
      <h1>Scoreboard</h1>
      <p className="mt-2 text-muted max-w-[68ch]">Every number here is read from <span className="mono">eval/results/*.json</span>, written by the scripts in <span className="mono">eval/</span> against IBM&apos;s labels. Each section names its file and the commit that produced it.</p>
      {!Object.keys(ex).length && <p className="mt-6 text-verify">No results yet. Run <span className="mono">eval/run_all.sh</span> to produce them.</p>}

      {e1 && (
        <Section e={e1} title="Fewer alerts escalated, more of them real">
          <p className="text-sm text-muted max-w-[68ch]">Alerted accounts in the later half of the period ({e1.params.test_accounts.toLocaleString()}, of which {e1.params.illicit_in_test} illicit). Weights and thresholds came from the earlier half only.</p>
          <MetricTable rows={[
            ["Rule-based: escalate everything", e1.results.baseline_escalate_all, BASE],
            [`Rules without the graph (≥${e1.params.no_graph_rules_k} rules fired)`, e1.results.no_graph_rules, BASE],
            ["Graph score, hand weights (no labels)", e1.results.graph_hand_weights, BASE],
            ["Graph score, calibrated on the dev split", e1.results.graph_calibrated, BLUE],
          ]} />
        </Section>
      )}

      {e2 && (
        <Section e={e2} title="Rings a single bank can't see">
          <div className="flex flex-wrap gap-10">
            <Tile label="Laundering groups spanning banks" value={String(e2.results.attempts)} />
            <Tile label="Share of a ring's accounts the best-placed bank holds" value={pct(e2.results.best_single_bank.mean_accounts_held)} accent />
            <Tile label="Rings fully held by one bank" value={pct(e2.results.best_single_bank.attempts_fully_held)} />
          </div>
          <Bars max={1} rows={[
            ["Consortium: ring accounts it can investigate", e2.results.consortium.mean_accounts_held, BLUE],
            ["Best single bank: ring accounts it can investigate", e2.results.best_single_bank.mean_accounts_held, BASE],
            ["Best single bank: laundering transfers it observes", e2.results.best_single_bank.mean_transfers_visible, BASE],
          ]} />
        </Section>
      )}

      {e3 && (
        <Section e={e3} title="Hunt mode: where to look without an alert">
          <p className="text-sm text-muted max-w-[68ch]">Share of illicit accounts in the shortest-path investigation subgraph built from {e3.params.k} seeds (r={e3.params.r}). Ticks show the paper&apos;s HI-Small numbers; base rate in this graph is {pct(e3.results.base_rate)}.</p>
          <Bars max={Math.max(0.3, e3.results.motif.illicit_ratio, e3.results.degree.illicit_ratio) * 1.1} rows={[
            [`Random seeds (mean of ${e3.results.random.runs})`, e3.results.random.illicit_ratio, BASE, e3.results.paper_hi_small_k200_r1.random],
            ["Degree-imbalance seeds", e3.results.degree.illicit_ratio, BASE, e3.results.paper_hi_small_k200_r1.degree],
            ["Motif-coherent seeds (paper parameters)", e3.results.motif.illicit_ratio, BLUE, e3.results.paper_hi_small_k200_r1.motif],
            ...(e3.results.motif_no_degree_penalty ? [["Motif, no degree penalty (post-hoc ablation)", e3.results.motif_no_degree_penalty.illicit_ratio, BASE] as [string, number, string]] : []),
          ]} />
          <p className="text-sm text-muted max-w-[68ch]">We did not reproduce the paper&apos;s ranking on this slice: with its parameters the degree penalty inverts the motif score (account-level AUC {e3.results.account_auc?.motif_paper_params ?? "—"}).</p>
        </Section>
      )}

      {e4 && (
        <Section e={e4} title="Pass-through matching">
          <div className="flex flex-wrap gap-10">
            <Tile label="Accounts flagged" value={String(e4.results.flagged)} />
            <Tile label="Illicit among flagged" value={pct(e4.results.precision)} accent />
            <Tile label="Base rate" value={pct(e4.results.base_rate)} />
            <Tile label="Value moved (chains counted once)" value={money(e4.results.chain_deduplicated_value)} />
          </div>
        </Section>
      )}

      {e5 && (
        <Section e={e5} title="Growing a ring from two clues">
          <RoundsChart table={e5.results.per_round} />
        </Section>
      )}

      {e6 && (
        <Section e={e6} title="Trust layer, measured">
          <div className="grid gap-6 sm:grid-cols-3 text-sm">
            <div>
              <h3>Echo</h3>
              <p className="mt-1 text-muted">{e6.results.echo.claims_with_more_paths_than_sources} of {e6.results.echo.claims} claims had more supporting paths than independent sources; {pct(e6.results.echo.echo_rate)} of evidence items repeated an origin.</p>
              <p className="mt-1">Mean confidence {pct(e6.results.echo.mean_confidence_echo_proof)} echo-proof vs {pct(e6.results.echo.mean_confidence_naive)} naive.</p>
            </div>
            <div>
              <h3>Cascading invalidation</h3>
              <p className="mt-1">Affected-node recall {pct(e6.results.invalidation.affected_recall)}, precision {pct(e6.results.invalidation.affected_precision)} over {e6.results.invalidation.trials} scripted dependency graphs.</p>
              <p className="mt-1 text-muted">Actions approved on overturned evidence without an override: {e6.results.stale_actions_approved_without_override}.</p>
            </div>
            <div>
              <h3>Provenance gate</h3>
              <p className="mt-1">{e6.results.gate.published} of {e6.results.gate.sars} reports published, {e6.results.gate.divergent} divergent; mean provenance fidelity {e6.results.gate.mean_pf}.</p>
              <p className="mt-1 text-muted">{e6.results.gate.needed_repair} needed at least one repair round.</p>
            </div>
          </div>
        </Section>
      )}

      {e7 && (
        <Section e={e7} title="Speed on this machine">
          <p className="text-sm text-muted">{money(e7.params.accounts)} accounts and {money(e7.params.transfers)} transfers in the consortium graph; {e7.params.cpus} CPUs.</p>
          <table className="mt-3 text-sm">
            <thead className="text-muted text-left"><tr><th className="pr-6 font-normal py-1">Tool</th><th className="pr-6 font-normal">Median</th><th className="font-normal">95th percentile</th></tr></thead>
            <tbody>{Object.entries(e7.results).map(([k, v]: [string, any]) => (
              <tr key={k} className="border-t border-line/60"><td className="pr-6 py-1">{k.replaceAll("_", " ")}</td><td className="pr-6">{v.median_ms ?? v.ms} ms</td><td>{v.p95_ms != null ? `${v.p95_ms} ms` : ""}</td></tr>
            ))}</tbody>
          </table>
        </Section>
      )}
    </div>
  );
}

function Section({ e, title, children }: { e: Exp; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2>{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
      <details className="mt-3 text-xs text-muted">
        <summary className="cursor-pointer">Source: <span className="mono">{e._file}</span> at commit <span className="mono">{e.commit}</span>, {e.generated_at.slice(0, 16)}</summary>
        <ul className="mt-2 list-disc pl-5 space-y-1">{e.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <pre className="mono mt-2 overflow-x-auto rounded bg-panel p-2">{JSON.stringify(e.params, null, 2)}</pre>
      </details>
    </section>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return <div><p className={`text-3xl font-semibold ${accent ? "" : "text-paper/80"}`}>{value}</p><p className="text-sm text-muted max-w-[22ch]">{label}</p></div>;
}

function MetricTable({ rows }: { rows: [string, any, string][] }) {
  const cols: [string, string][] = [["precision", "Precision"], ["recall", "Recall"], ["f1", "F1"], ["alert_reduction", "Alerts not escalated"]];
  return (
    <table className="w-full text-sm">
      <thead className="text-muted text-left"><tr className="border-b border-line"><th className="py-2 pr-4 font-normal">Method</th>{cols.map(([, l]) => <th key={l} className="py-2 pr-4 font-normal">{l}</th>)}</tr></thead>
      <tbody>{rows.map(([name, r, color]) => (
        <tr key={name} className="border-b border-line/60">
          <td className="py-2 pr-4">{name}</td>
          {cols.map(([k]) => (
            <td key={k} className="py-2 pr-4 w-36" title={`TP ${r.tp ?? "—"}, FP ${r.fp ?? "—"}, FN ${r.fn ?? "—"}, escalated ${r.escalated ?? "—"}`}>
              <span className="tabular-nums">{pct(r[k])}</span>
              <span className="mt-1 block h-1 rounded bg-line"><span className="block h-1 rounded" style={{ width: pct(r[k]), background: color }} /></span>
            </td>
          ))}
        </tr>
      ))}</tbody>
    </table>
  );
}

function Bars({ rows, max }: { rows: [string, number, string, number?][]; max: number }) {
  return (
    <div className="space-y-3 max-w-2xl">
      {rows.map(([label, v, color, ref]) => (
        <div key={label} className="text-sm">
          <div className="flex justify-between"><span>{label}</span><span className="tabular-nums">{pct(v)}{ref != null && <span className="text-muted"> (paper {pct(ref)})</span>}</span></div>
          <div className="relative mt-1 h-2 rounded bg-line">
            <div className="h-2 rounded" style={{ width: `${(v / max) * 100}%`, background: color }} />
            {ref != null && <div className="absolute -top-1 h-4 w-0.5 bg-paper" style={{ left: `${(ref / max) * 100}%` }} title={`paper: ${pct(ref)}`} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function RoundsChart({ table }: { table: Record<string, any> }) {
  const rounds = Object.keys(table).map(Number).sort((a, b) => a - b);
  const W = 560, H = 200, P = 32;
  const x = (r: number) => P + ((r - rounds[0]) / Math.max(1, rounds.length - 1)) * (W - 2 * P - 60);
  const y = (v: number) => H - P - v * (H - 2 * P);
  const line = (k: string) => rounds.map((r, i) => `${i ? "L" : "M"}${x(r)},${y(table[r][k])}`).join(" ");
  const last = rounds[rounds.length - 1];
  return (
    <figure>
      <div className="flex gap-5 text-sm" aria-hidden>
        <span className="flex items-center gap-2"><span className="inline-block h-0.5 w-5" style={{ background: BLUE }} />Precision</span>
        <span className="flex items-center gap-2"><span className="inline-block h-0.5 w-5 border-t-2 border-dashed" style={{ borderColor: GREEN }} />Recall</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full max-w-2xl" role="img" aria-label="Precision and recall per expansion round">
        {[0, 0.5, 1].map((t) => <g key={t}><line x1={P} x2={W - P - 60} y1={y(t)} y2={y(t)} stroke="#2a3f5f" strokeWidth="1" /><text x={4} y={y(t) + 4} fill="#9aa7b8" fontSize="11">{t * 100}%</text></g>)}
        {rounds.map((r) => <text key={r} x={x(r)} y={H - 8} fill="#9aa7b8" fontSize="11" textAnchor="middle">{r}</text>)}
        <path d={line("precision")} fill="none" stroke={BLUE} strokeWidth="2" />
        <path d={line("recall")} fill="none" stroke={GREEN} strokeWidth="2" strokeDasharray="5 4" />
        {rounds.map((r) => (["precision", "recall"] as const).map((k) => (
          <circle key={k + r} cx={x(r)} cy={y(table[r][k])} r="5" fill={k === "precision" ? BLUE : GREEN} stroke="#0f1b2d" strokeWidth="2">
            <title>{`Round ${r}: ${k} ${pct(table[r][k])}`}</title>
          </circle>
        )))}
        <text x={x(last) + 10} y={y(table[last].precision) + 4} fill="#e9e4d4" fontSize="12">Precision</text>
        <text x={x(last) + 10} y={y(table[last].recall) + 4} fill="#e9e4d4" fontSize="12">Recall</text>
      </svg>
      <figcaption className="text-xs text-muted">Expansion round (x) vs share (y). Hover a point for its value.</figcaption>
      <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted">Show as table</summary>
        <table className="mt-2"><tbody>{rounds.map((r) => <tr key={r}><td className="pr-4">Round {r}</td><td className="pr-4">P {pct(table[r].precision)}</td><td>R {pct(table[r].recall)}</td></tr>)}</tbody></table>
      </details>
    </figure>
  );
}
