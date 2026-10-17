"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Confidence, StateBadge } from "@/components/Trust";
import { get, post } from "@/lib/api";
import { useLiveReload } from "@/lib/useEvents";

const LABEL: Record<string, string> = { file_sar: "File the SAR", freeze_rec: "Freeze the account", escalate: "Escalate to a senior analyst", close: "Close the case" };

export default function Approvals() {
  const [actions, setActions] = useState<any[] | null>(null);
  const load = useCallback(() => { get("/actions").then((d) => setActions(d.actions)).catch(() => setActions([])); }, []);
  useEffect(load, [load]);
  useLiveReload(load, (e) => e.type === "action" || e.type === "state_change");
  return (
    <div className="max-w-4xl">
      <h1>Approvals</h1>
      <p className="mt-2 text-muted max-w-[65ch]">Agents recommend; you decide. Each action shows the claims that justify it and whether any of their evidence has since been overturned.</p>
      <ul className="mt-6 space-y-4">
        {actions?.map((a) => <ActionItem key={a.id} a={a} done={load} />)}
      </ul>
      {actions && !actions.length && <p className="mt-6 text-muted">Nothing waiting for a decision.</p>}
    </div>
  );
}

function ActionItem({ a, done }: { a: any; done: () => void }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const stale = !a.premise.ok;
  async function decide(kind: "approve" | "reject", override = false) {
    setErr(null);
    try { await post(`/actions/${a.case_id}/${a.id}/${kind}`, { note, override_stale: override }); done(); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <li className={`rounded-md border p-4 ${stale ? "border-verify" : "border-line"}`}>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2>{LABEL[a.kind] ?? a.kind}</h2>
        <StateBadge state={a.state} />
        <Link href={`/cases/${a.case_id}`} className="ml-auto text-sm text-muted hover:text-paper mono">{a.case_id}</Link>
      </div>
      <p className="mt-1 text-sm text-paper/85">{a.rationale}</p>
      <h3 className="mt-3 text-sm text-muted font-normal">Justified by</h3>
      <ul className="mt-1 space-y-2">
        {a.claims.filter((c: any) => c.id).map((c: any) => (
          <li key={c.id} className="text-sm">
            <p>{c.text} <StateBadge state={c.state} /></p>
            <Confidence confidence={c.confidence} paths={c.paths} sources={c.sources} compact />
          </li>
        ))}
      </ul>
      {stale && <p className="mt-3 text-sm text-verify">{a.premise.message}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={stale ? "Why approve anyway? (required)" : "Note (optional)"}
          className="flex-1 min-w-48 rounded border border-line bg-ink px-2.5 py-1.5" aria-label="Decision note" />
        {!stale && <button onClick={() => decide("approve")} className="rounded bg-paper text-ink px-3 py-1.5 font-medium">Approve</button>}
        {stale && <button disabled={!note.trim()} onClick={() => decide("approve", true)} className="rounded border border-verify text-verify px-3 py-1.5 disabled:opacity-40">Approve despite stale evidence</button>}
        <button onClick={() => decide("reject")} className="rounded border border-line px-3 py-1.5 hover:border-paper">Reject</button>
      </div>
      {err && <p className="mt-2 text-sm text-ring">{err}</p>}
    </li>
  );
}
