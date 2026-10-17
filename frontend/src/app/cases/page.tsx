"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { get, short } from "@/lib/api";
import { bankColor, setBankOrder } from "@/lib/banks";
import { useLiveReload } from "@/lib/useEvents";

const STATUS: Record<string, string> = {
  open: "Agents investigating", awaiting_approval: "Waiting for your approval",
  closed: "Closed", insufficient: "Closed: not enough evidence",
};

export default function Cases() {
  const [cases, setCases] = useState<any[] | null>(null);
  const load = useCallback(() => { get("/cases").then((d) => setCases(d.cases)).catch(() => setCases([])); }, []);
  useEffect(() => { load(); get("/network/banks").then((b) => setBankOrder(b.banks ?? [])).catch(() => {}); }, [load]);
  useLiveReload(load, (e) => e.type === "case");
  return (
    <div className="max-w-5xl">
      <h1>Cases</h1>
      <p className="mt-2 text-muted max-w-[65ch]">Each case is its own FalkorDB graph: the accounts under investigation, every claim, the evidence behind it and the agents&apos; timeline.</p>
      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-muted"><tr className="border-b border-line">
          <th className="py-2 pr-3 font-normal">Case</th><th className="py-2 pr-3 font-normal">What triggered it</th>
          <th className="py-2 pr-3 font-normal">Banks</th><th className="py-2 font-normal">Status</th></tr></thead>
        <tbody>
          {cases?.map((c) => (
            <tr key={c.id} className="border-b border-line/60 hover:bg-panel/60">
              <td className="py-2 pr-3"><Link href={`/cases/${c.id}`} className="mono text-paper hover:underline">{c.id}</Link></td>
              <td className="py-2 pr-3 text-paper/85">{c.title} <span className="text-muted">· {c.accounts} accounts, {c.alerts} alert(s)</span></td>
              <td className="py-2 pr-3">{c.banks.map((b: string) => <span key={b} className="inline-block size-2.5 rounded-full mr-1" style={{ background: bankColor(b) }} title={`Bank ${b}`} />)}</td>
              <td className={`py-2 ${c.status === "awaiting_approval" ? "text-verify" : c.status === "open" ? "text-paper" : "text-muted"}`}>{STATUS[c.status] ?? c.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cases && !cases.length && <p className="mt-6 text-muted">No cases yet. Start the agents from Demo control and escalated alerts will open cases here.</p>}
      {cases && cases.length > 0 && <p className="mt-4 text-xs text-muted">Seed accounts: {cases.slice(0, 3).map((c) => short(c.seed)).join(", ")}…</p>}
    </div>
  );
}
