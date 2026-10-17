"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import { get, short } from "@/lib/api";
import { bankColor, setBankOrder } from "@/lib/banks";
import { useLiveReload } from "@/lib/useEvents";

type Alert = { id: string; account: string; bank: string; rule: string; reason: string; status: string;
  case_id?: string; cleared_reason?: string };

const FILTERS = [["all", "All"], ["open", "Waiting"], ["cleared", "Cleared"], ["case", "Escalated to a case"]] as const;

export default function Queue() {
  const [data, setData] = useState<{ alerts: Alert[]; counts: Record<string, number>; total: number } | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    get(`/alerts?limit=300${filter === "all" ? "" : `&status=${filter}`}`)
      .then((d) => { setData(d); setError(null); })
      .catch(() => setError("The API isn't reachable. Start the backend with `uvicorn app.main:app`."));
  }, [filter]);
  useEffect(() => { load(); get("/network/banks").then((b) => setBankOrder(b.banks ?? [])).catch(() => {}); }, [load]);
  useLiveReload(load, (e) => e.type === "alert" || e.type === "case");

  const c = data?.counts ?? {};
  const escalated = c.case ?? 0;
  const decided = (c.cleared ?? 0) + escalated;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        <h1>Alert queue</h1>
        <p className="mt-2 max-w-[65ch] text-muted">
          Rule-based monitoring would send all <b className="text-paper">{data?.total ?? "…"}</b> alerts to analysts.
          BankWeave has decided <b className="text-paper">{decided}</b> so far and escalated{" "}
          <b className="text-ring">{escalated}</b>, each with a reason you can open.
        </p>

        <div role="tablist" className="mt-6 flex flex-wrap gap-2 text-sm">
          {FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
              className={`rounded px-3 py-1.5 border ${filter === k ? "border-paper text-paper" : "border-line text-muted hover:text-paper"}`}>
              {label} <span className="text-muted">{k === "all" ? data?.total ?? "" : c[k] ?? 0}</span>
            </button>
          ))}
        </div>

        {error && <p className="mt-6 text-verify">{error}</p>}
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-muted">
            <tr className="border-b border-line">
              <th className="py-2 pr-3 font-normal">Account</th>
              <th className="py-2 pr-3 font-normal">Rule that fired</th>
              <th className="py-2 font-normal">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {data?.alerts.map((a) => (
              <AlertRow key={a.id} a={a} open={open === a.id} toggle={() => setOpen(open === a.id ? null : a.id)} />
            ))}
          </tbody>
        </table>
        {data && !data.alerts.length && <p className="mt-6 text-muted">No alerts here. Generate alerts from Demo control.</p>}
      </div>
      <ActivityFeed />
    </div>
  );
}

function AlertRow({ a, open, toggle }: { a: Alert; open: boolean; toggle: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { if (open && !detail) get(`/alerts/${a.id}`).then(setDetail).catch(() => {}); }, [open, detail, a.id]);
  const signals = detail?.signals ? JSON.parse(detail.signals) : null;
  return (
    <>
      <tr className="border-b border-line/60 hover:bg-panel/60 cursor-pointer" onClick={toggle}>
        <td className="py-2 pr-3 whitespace-nowrap">
          <span className="inline-block size-2 rounded-full mr-2 align-middle" style={{ background: bankColor(a.bank) }} />
          <span className="mono">{short(a.account, 8)}</span>
          <span className="ml-2 text-muted">bank {a.bank}</span>
        </td>
        <td className="py-2 pr-3 text-paper/85">{a.reason}</td>
        <td className="py-2">
          {a.status === "open" && <span className="text-muted">Waiting for triage</span>}
          {a.status === "cleared" && <span className="text-ok">Cleared: <span className="text-paper/80">{a.cleared_reason}</span></span>}
          {a.status === "case" && (
            <Link href={`/cases/${a.case_id}`} onClick={(e) => e.stopPropagation()} className="text-ring hover:underline">
              Case <span className="mono">{a.case_id}</span>
            </Link>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-panel/40">
          <td colSpan={3} className="px-4 py-3 text-sm">
            {!signals && <span className="text-muted">{a.status === "open" ? "Not triaged yet." : "Loading the signals triage used…"}</span>}
            {signals && (
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
                <Sig k="Connected component" v={`${signals.component_size} accounts, ${signals.component_banks} bank(s)`} />
                <Sig k="Motif score" v={signals.motif_score} />
                <Sig k="Cross-bank counterparties" v={signals.cross_bank_counterparties} />
                <Sig k="Typologies" v={signals.typologies.join(", ") || "none"} />
                <Sig k="Tight shared identity" v={signals.shared_identity_tight} />
                <Sig k="Broad shared identity" v={signals.shared_identity_broad} />
                <Sig k="Pass-through pairs" v={signals.passthrough_pairs} />
                <Sig k="Prior cases" v={signals.prior_cases.join(", ") || "none"} />
              </dl>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

const Sig = ({ k, v }: { k: string; v: any }) => (
  <div><dt className="text-muted text-xs">{k}</dt><dd>{String(v)}</dd></div>
);
