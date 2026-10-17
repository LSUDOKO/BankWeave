"use client";
import { useState } from "react";
import { money, post } from "@/lib/api";

/** Simulate Freeze: GRAPH.COPY sandbox, delete the account, rerun maxFlow and wcc. */
export default function FreezeSim({ caseId, accounts }: { caseId: string; accounts: string[] }) {
  const [acct, setAcct] = useState("");
  const [r, setR] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setR(await post(`/cases/${caseId}/simulate-freeze`, acct ? { account: acct } : {})); }
    catch (e: any) { setR({ error: e.message }); }
    setBusy(false);
  };
  return (
    <section className="glass p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2>Simulate freeze</h2>
        <span className="text-xs text-muted">sandboxed with <span className="mono">GRAPH.COPY</span>; the case graph is never touched</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <select value={acct} onChange={(e) => setAcct(e.target.value)} className="rounded bg-ink border border-line px-2 py-1 mono text-xs">
          <option value="">Recommended freeze target (or hub)</option>
          {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={run} disabled={busy} className="rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1 disabled:opacity-50">{busy ? "Simulating…" : "Run simulation"}</button>
      </div>
      {r?.error && <p className="mt-2 text-ring text-sm">{r.error}</p>}
      {r && !r.error && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          <div className="glass-2 p-3">
            <p className="text-xs text-muted">Liquidity before</p>
            <p className="kpi text-xl">{money(r.before.max_flow)}</p>
            <p className="text-xs text-muted">{r.before.components} component(s), largest {r.before.largest_component}</p>
          </div>
          <div className="glass-2 p-3">
            <p className="text-xs text-muted">After freezing <span className="mono">{r.account.slice(0, 10)}</span></p>
            <p className="kpi text-xl">{money(r.after.max_flow)}</p>
            <p className="text-xs text-muted">{r.after.components} component(s), largest {r.after.largest_component}</p>
          </div>
          <div className="glass-2 p-3 border-ok/50">
            <p className="text-xs text-muted">Money flow blocked</p>
            <p className="kpi text-xl text-ok">{r.liquidity_blocked_pct}%</p>
            <p className="text-xs text-muted">{money(r.liquidity_blocked)} of max flow · copy {r.copy_ms} ms</p>
          </div>
          <details className="sm:col-span-3 text-xs">
            <summary className="cursor-pointer text-muted">What ran ({r.sources.length} sources → {r.sinks.length} sinks over FLOWS)</summary>
            <pre className="mono mt-1 overflow-x-auto rounded bg-ink/70 p-2">{r.cypher.join("\n\n")}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
