"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Confidence, StateBadge } from "@/components/Trust";
import { get, post } from "@/lib/api";
import { useLiveReload } from "@/lib/useEvents";

export default function TrustPage() {
  const [echo, setEcho] = useState<any[]>([]);
  const [states, setStates] = useState<Record<string, number>>({});
  const [naive, setNaive] = useState(false);
  const [cands, setCands] = useState<[string, number][]>([]);
  const [addr, setAddr] = useState("A-77");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    get("/trust/echo").then((d) => setEcho(d.claims)).catch(() => {});
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

  return (
    <div className="max-w-5xl">
      <h1>Agents that can&apos;t fool themselves</h1>
      <p className="mt-2 text-muted max-w-[68ch]">Three checks from 2026 research, each running as graph queries: count independent sources rather than paths, flag every belief that rests on overturned evidence, and refuse to publish a report that can&apos;t be proven.</p>

      <section className="mt-8">
        <div className="flex flex-wrap items-baseline gap-4">
          <h2>Five paths can be one fact</h2>
          <label className="ml-auto text-sm flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={naive} onChange={(e) => setNaive(e.target.checked)} />
            Show naive path counting
          </label>
        </div>
        <p className="mt-1 text-sm text-muted max-w-[68ch]">Many graph paths often lead back to the same origin, like one shared device reached from several accounts. BankWeave scores confidence on distinct origins.</p>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-muted"><tr className="border-b border-line">
            <th className="py-2 pr-3 font-normal">Claim</th><th className="py-2 pr-3 font-normal">Paths</th><th className="py-2 pr-3 font-normal">Independent sources</th><th className="py-2 font-normal">Confidence</th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-b border-line/60">
                <td className="py-2 pr-3"><Link href={`/cases/${c.case_id}`} className="hover:underline">{c.text}</Link> <StateBadge state={c.state} /></td>
                <td className="py-2 pr-3">{c.paths}</td>
                <td className="py-2 pr-3">{c.sources}</td>
                <td className="py-2 w-44"><Confidence confidence={naive ? c.naive : c.confidence} naive={c.naive} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="mt-3 text-muted">No claims yet.</p>}
      </section>

      <section className="mt-10">
        <h2>When evidence dies, everything resting on it is flagged</h2>
        <p className="mt-1 text-sm text-muted max-w-[68ch]">Push a KYC fact that overturns shared-address evidence. The evidence is superseded (kept for history), and every claim, action and report sentence that depended on it turns amber.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <label htmlFor="addr" className="text-muted">Address</label>
          <select id="addr" value={addr} onChange={(e) => setAddr(e.target.value)} className="rounded border border-line bg-ink px-2 py-1.5">
            {[["A-77", 0] as [string, number], ...cands.filter(([a]) => a !== "A-77")].map(([a, n]) => <option key={a} value={a}>{a}{n ? ` (relied on by ${n} evidence items)` : ""}</option>)}
          </select>
          <button onClick={push} disabled={busy} className="rounded bg-verify text-ink px-3 py-1.5 font-medium disabled:opacity-50">
            {busy ? "Pushing update…" : `Push KYC update: ${addr} is a 200-unit building`}
          </button>
        </div>
        {result && (
          <p className="mt-3 text-sm" aria-live="polite">
            Superseded evidence in {result.affected.length} case(s). Flagged for verification: <b className="text-verify">{result.totals.claims}</b> claims, <b className="text-verify">{result.totals.actions}</b> actions, <b className="text-verify">{result.totals.sentences}</b> report sentences.
            {result.affected[0] && <> <Link href={`/cases/${result.affected[0].case}`} className="underline">Open {result.affected[0].case}</Link></>}
          </p>
        )}
        <dl className="mt-4 flex flex-wrap gap-8 text-sm">
          <div><dt className="text-muted">Active</dt><dd className="text-xl text-ok">{sum("active")}</dd></div>
          <div><dt className="text-muted">Needs verification</dt><dd className="text-xl text-verify">{sum("needs_verification")}</dd></div>
          <div><dt className="text-muted">Superseded (kept)</dt><dd className="text-xl text-muted">{sum("superseded")}</dd></div>
        </dl>
      </section>

      <section className="mt-10">
        <h2>No report without proof</h2>
        <p className="mt-1 text-sm text-muted max-w-[68ch]">A different, stronger model audits every report sentence against only the evidence it cites. Reports publish at 95% supported sentences or better, after up to three repairs; otherwise BankWeave files a divergence report showing the disagreement. Open any case&apos;s Report tab to see it.</p>
      </section>
    </div>
  );
}
