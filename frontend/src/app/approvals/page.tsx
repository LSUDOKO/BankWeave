"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { Card, Chip, Empty, PageHeader, StatCard, btn, stateTone } from "@/components/ui";
import { get, pct, post } from "@/lib/api";
import { useLiveReload } from "@/lib/useEvents";

type Claim = { id?: string; text: string; confidence?: number | null; sources?: number | null; paths?: number | null; state?: string };
type Action = { id: string; case_id: string; kind: string; state: string; status?: string; rationale: string; claims: Claim[];
  premise: { ok: boolean; message: string } };

const LABEL: Record<string, string> = { file_sar: "File the SAR", freeze_rec: "Freeze the account", escalate: "Escalate to a senior analyst", close: "Close the case" };
const ICON: Record<string, string> = { file_sar: "doc", freeze_rec: "approve", escalate: "alert", close: "cases" };
const STATE_LABEL: Record<string, string> = { active: "Active", needs_verification: "Needs verification", historical_only: "Historical", superseded: "Superseded" };

export default function Approvals() {
  const [actions, setActions] = useState<Action[] | null>(null);
  const load = useCallback(() => { get("/actions").then((d) => setActions(d.actions)).catch(() => setActions([])); }, []);
  useEffect(load, [load]);
  useLiveReload(load, (e) => e.type === "action" || e.type === "state_change");

  const list = actions ?? [];
  const stale = list.filter((a) => !a.premise.ok).length;
  const cases = new Set(list.map((a) => a.case_id)).size;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        sub="Agents recommend; you decide. Each action shows the claims that justify it and whether any of their evidence has since been overturned."
        actions={<>
          <button onClick={load} className={btn.soft}><Icon name="refresh" className="size-4" strokeWidth={2.2} />Refresh</button>
          <Link href="/trust" className={btn.ghost}>Trust layer</Link>
          <Link href="/cases" className={btn.primary}><Icon name="cases" className="size-4" strokeWidth={2.2} />All cases</Link>
        </>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled label="Waiting for a decision" value={actions ? list.length : "–"} chip="human" sub="proposed by the agents" i={0} />
        <StatCard label="Evidence current" value={actions ? list.length - stale : "–"} chip="ready" sub="all premises still hold" i={1} />
        <StatCard label="Stale evidence" value={actions ? stale : "–"} chip="note required" sub="premise overturned since proposed" href="/trust" i={2} />
        <StatCard label="Cases affected" value={actions ? cases : "–"} chip="cases" sub="with at least one open action" href="/cases" i={3} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {!actions && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="glass space-y-3 p-5" aria-label="Loading actions">
              <span className="block h-5 w-56 animate-pulse rounded-full bg-panel-2" />
              <span className="block h-3.5 w-full animate-pulse rounded-full bg-panel-2" />
              <span className="block h-3.5 w-2/3 animate-pulse rounded-full bg-panel-2" />
            </div>
          ))}
          {actions && !list.length && (
            <div className="glass p-5"><Empty action={<Link href="/cases" className={btn.small}>Browse cases</Link>}>Nothing waiting for a decision.</Empty></div>
          )}
          <ul className="space-y-4">
            {list.map((a, i) => <ActionItem key={a.id} a={a} done={load} i={i} />)}
          </ul>
        </div>

        <div className="space-y-4">
          <QueueByKind actions={list} ready={!!actions} />
          <div className="fill-deep relative overflow-hidden rounded-[22px] p-5">
            <span className="lines" />
            <div className="relative">
              <span className="grid size-10 place-items-center rounded-full bg-white/10 text-sky"><Icon name="approve" className="size-5" strokeWidth={2} /></span>
              <h2 className="mt-4 text-[17px] font-medium text-white">Nothing happens without a signature</h2>
              <p className="mt-2 text-sm text-white/70">Approving or rejecting records your decision and note on the action in the case graph. When a premise is stale, approval needs a written reason.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function QueueByKind({ actions, ready }: { actions: Action[]; ready: boolean }) {
  const kinds = Object.entries(actions.reduce<Record<string, { all: number; stale: number }>>((m, a) => {
    const k = (m[a.kind] ??= { all: 0, stale: 0 });
    k.all += 1; if (!a.premise.ok) k.stale += 1;
    return m;
  }, {})).sort((a, b) => b[1].all - a[1].all);
  const max = Math.max(1, ...kinds.map(([, v]) => v.all));
  return (
    <Card title="Queue by kind">
      {!ready ? <span className="block h-24 animate-pulse rounded-2xl bg-panel-2" /> : !kinds.length ? <p className="text-sm text-muted">The queue is empty.</p> : (
        <ul className="space-y-3.5">
          {kinds.map(([k, v], i) => (
            <li key={k}>
              <div className="flex justify-between gap-2 text-[13px]"><span>{LABEL[k] ?? k}</span><span className="kpi font-semibold">{v.all}</span></div>
              <div className="mt-1.5 flex h-3 overflow-hidden rounded-full bg-panel-2" style={{ width: `${(v.all / max) * 100}%`, minWidth: 16 }}>
                <span className={`h-full ${i === 0 ? "bg-deep" : "bg-cyan"}`} style={{ width: `${((v.all - v.stale) / v.all) * 100}%` }} />
                {v.stale > 0 && <span className="hatch h-full border-0" style={{ width: `${(v.stale / v.all) * 100}%` }} title={`${v.stale} with stale evidence`} />}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-cyan" />Evidence current</span>
        <span className="inline-flex items-center gap-1.5"><i className="hatch size-2.5 rounded-full" />Stale evidence</span>
      </p>
    </Card>
  );
}

function ConfBar({ c }: { c: Claim }) {
  const v = c.confidence ?? 0;
  return (
    <div className="w-full sm:w-44">
      <div className="h-2 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-cyan" style={{ width: pct(v) }} /></div>
      <p className="mt-1 text-[11px] text-muted">
        <span className="font-semibold text-paper">{pct(v)}</span>
        {c.paths != null && <> from {c.paths} path{c.paths === 1 ? "" : "s"}, {c.sources} independent source{c.sources === 1 ? "" : "s"}</>}
      </p>
    </div>
  );
}

function ActionItem({ a, done, i }: { a: Action; done: () => void; i: number }) {
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stale = !a.premise.ok;
  async function decide(kind: "approve" | "reject", override = false) {
    setErr(null); setBusy(true);
    try { await post(`/actions/${a.case_id}/${a.id}/${kind}`, { note, override_stale: override }); done(); }
    catch (e: unknown) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  const claims = a.claims.filter((c) => c.id);
  return (
    <li className={`glass fade-up p-5 ${stale ? "!border-verify/60 ring-2 ring-verify/15" : ""}`} style={{ animationDelay: `${Math.min(i, 6) * 60}ms` }}>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${stale ? "bg-[#fff6e6] text-verify" : "bg-panel-2 text-cyan"}`}>
          <Icon name={ICON[a.kind] ?? "approve"} className="size-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-medium">{LABEL[a.kind] ?? a.kind}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
            <span className="mono">{a.id}</span>
            <Chip tone={stateTone(a.state)}>{STATE_LABEL[a.state] ?? a.state}</Chip>
          </p>
        </div>
        <Link href={`/cases/${a.case_id}`} className={btn.small}><span className="mono">{a.case_id}</span><Icon name="arrow" className="size-3" strokeWidth={2.4} /></Link>
      </div>
      <p className="mt-3 text-sm text-paper/85">{a.rationale}</p>

      {claims.length > 0 && (
        <div className="mt-4 rounded-2xl bg-panel-2/60 p-3">
          <h3 className="px-1 text-xs font-medium text-muted">Justified by {claims.length} claim{claims.length === 1 ? "" : "s"}</h3>
          <ul className="mt-2 space-y-2">
            {claims.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 rounded-xl bg-white p-3 text-sm sm:flex-row sm:items-start sm:justify-between">
                <p className="min-w-0 flex-1">{c.text} <Chip tone={stateTone(c.state)} className="ml-1 align-middle">{STATE_LABEL[c.state ?? "active"] ?? c.state}</Chip></p>
                <ConfBar c={c} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {stale && (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-[#fff6e6] px-3 py-2 text-sm text-verify">
          <Icon name="alert" className="mt-0.5 size-4 shrink-0" strokeWidth={2} />{a.premise.message}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={stale ? "Why approve anyway? (required)" : "Note (optional)"}
          className="min-w-48 flex-1 rounded-full border border-line bg-white px-4 py-2.5 outline-none focus:border-cyan" aria-label="Decision note" />
        {!stale && <button disabled={busy} onClick={() => decide("approve")} className={btn.primary}><Icon name="approve" className="size-4" strokeWidth={2.2} />Approve</button>}
        {stale && (
          <button disabled={!note.trim() || busy} onClick={() => decide("approve", true)}
            className="inline-flex items-center justify-center gap-2 rounded-full border-[1.5px] border-verify px-4 py-2 text-sm font-semibold text-verify hover:bg-[#fff6e6] disabled:opacity-40">
            Approve despite stale evidence
          </button>
        )}
        <button disabled={busy} onClick={() => decide("reject")} className={btn.danger}>Reject</button>
      </div>
      {err && <p className="mt-2 text-sm text-ring">{err}</p>}
    </li>
  );
}
