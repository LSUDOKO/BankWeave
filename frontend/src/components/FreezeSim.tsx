"use client";
import { useState } from "react";
import { money, post } from "@/lib/api";
import { Chip, btn } from "./ui";

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
    <section className="glass p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[17px] font-medium">Simulate freeze</h2>
        <Chip tone="blue">sandboxed with <span className="mono">GRAPH.COPY</span></Chip>
        <span className="text-xs text-muted">the case graph is never touched</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <select value={acct} onChange={(e) => setAcct(e.target.value)} className="mono min-w-0 max-w-full rounded-full border border-line bg-white px-3 py-2 text-xs">
          <option value="">Recommended freeze target (or hub)</option>
          {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <button onClick={run} disabled={busy} className={btn.primary}>{busy ? "Simulating…" : "Run simulation"}</button>
      </div>
      {r?.error && <p className="mt-3 text-sm text-ring">{r.error}</p>}
      {r && !r.error && (
        <div className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
          <div className="rounded-[22px] border border-line p-4">
            <p className="text-xs text-muted">Liquidity before</p>
            <p className="kpi mt-1 text-2xl">{money(r.before.max_flow)}</p>
            <p className="mt-1 text-xs text-muted">{r.before.components} component(s), largest {r.before.largest_component}</p>
          </div>
          <div className="rounded-[22px] border border-line p-4">
            <p className="text-xs text-muted">After freezing <span className="mono">{r.account.slice(0, 10)}</span></p>
            <p className="kpi mt-1 text-2xl">{money(r.after.max_flow)}</p>
            <p className="mt-1 text-xs text-muted">{r.after.components} component(s), largest {r.after.largest_component}</p>
          </div>
          <div className="fill-blue relative overflow-hidden rounded-[22px] p-4 shadow-[0_24px_40px_-24px_rgba(10,99,207,.9)]">
            <span className="lines" />
            <p className="relative text-xs text-white/75">Money flow blocked</p>
            <p className="kpi relative mt-1 text-2xl text-white">{r.liquidity_blocked_pct}%</p>
            <p className="relative mt-1 text-xs text-sky">{money(r.liquidity_blocked)} of max flow · copy {r.copy_ms} ms</p>
          </div>
          <details className="text-xs sm:col-span-3">
            <summary className="cursor-pointer text-muted hover:text-cyan">What ran ({r.sources.length} sources → {r.sinks.length} sinks over FLOWS)</summary>
            <pre className="mono mt-2 overflow-x-auto rounded-xl border border-line bg-ink p-2.5">{r.cypher.join("\n\n")}</pre>
          </details>
        </div>
      )}
    </section>
  );
}
