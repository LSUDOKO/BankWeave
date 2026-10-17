"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import WeaveGraph, { type GEdge, type GNode } from "@/components/WeaveGraph";
import { get, short } from "@/lib/api";
import { bankColor, setBankOrder } from "@/lib/banks";
import { useLiveReload } from "@/lib/useEvents";

type Net = { view: string; nodes: GNode[]; edges: GEdge[]; cypher: string[]; stats: Record<string, number> };

function pieces(nodes: GNode[], edges: GEdge[]) {
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
  for (const e of edges) if (parent.has(e.source) && parent.has(e.target)) parent.set(find(e.source), find(e.target));
  const sizes = new Map<string, number>();
  for (const n of nodes) sizes.set(find(n.id), (sizes.get(find(n.id)) ?? 0) + 1);
  return { count: sizes.size, largest: Math.max(0, ...sizes.values()) };
}

export default function NetworkPage() {
  const [banks, setBanks] = useState<string[]>([]);
  const [view, setView] = useState("consortium");
  const [net, setNet] = useState<Net | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [showQuery, setShowQuery] = useState(false);

  useEffect(() => {
    get("/network/banks").then((b) => {
      setBankOrder(b.banks ?? []); setBanks(b.banks ?? []);
      if (b.banks?.length) setView(`bank_${b.banks[0]}`);
    }).catch(() => {});
  }, []);
  const load = useCallback(() => { get(`/network?view=${view}`).then(setNet).catch(() => {}); }, [view]);
  useEffect(load, [load]);
  useLiveReload(load, (e) => e.type === "case");
  useEffect(() => { if (sel) get(`/network/account/${sel}`).then(setDetail).catch(() => setDetail(null)); else setDetail(null); }, [sel]);

  const p = useMemo(() => (net ? pieces(net.nodes.filter((n) => n.kind !== "external"), net.edges) : null), [net]);
  const own = net?.nodes.filter((n) => n.kind !== "external").length ?? 0;
  const stubs = net?.nodes.filter((n) => n.kind === "external").length ?? 0;
  const isCons = view === "consortium";

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0">
        <h1>No bank can see the ring alone</h1>
        <p className="mt-2 max-w-[68ch] text-muted">
          The same accounts, seen two ways. A single bank sees its own customers and stubs for everyone else, so
          money moving between two outside accounts is invisible. The consortium graph links every bank&apos;s view.
        </p>

        <div role="tablist" aria-label="Whose view" className="mt-5 flex flex-wrap gap-2 text-sm">
          {banks.map((b) => (
            <button key={b} role="tab" aria-selected={view === `bank_${b}`} onClick={() => setView(`bank_${b}`)}
              className={`rounded px-3 py-1.5 border ${view === `bank_${b}` ? "text-paper" : "border-line text-muted hover:text-paper"}`}
              style={view === `bank_${b}` ? { borderColor: bankColor(b) } : undefined}>
              Bank {b} only
            </button>
          ))}
          <button role="tab" aria-selected={isCons} onClick={() => setView("consortium")}
            className={`rounded px-3 py-1.5 border font-semibold ${isCons ? "border-ring text-ring" : "border-line text-paper hover:border-ring"}`}>
            Consortium
          </button>
        </div>

        <p className="mt-4 text-sm min-h-[1.5em]" aria-live="polite">
          {net && p && (isCons
            ? <>All banks together: <b>{own}</b> accounts in <b>{p.count}</b> connected piece{p.count === 1 ? "" : "s"}; the largest holds <b className="text-ring">{p.largest}</b>.</>
            : <>Bank {view.slice(5)} sees <b>{own}</b> of its own accounts and <b>{stubs}</b> outside stubs, broken into <b>{p.count}</b> pieces (largest {p.largest}).</>)}
        </p>

        <div className="mt-3">
          {net && <WeaveGraph nodes={net.nodes} edges={net.edges} banks={banks} onSelect={setSel} highlight={sel ? new Set([sel]) : undefined} />}
        </div>
        <button onClick={() => setShowQuery(!showQuery)} className="mt-3 text-sm text-muted hover:text-paper underline underline-offset-4">
          {showQuery ? "Hide" : "Show"} the Cypher behind this view
        </button>
        {showQuery && net && <pre className="mt-2 mono overflow-x-auto rounded bg-panel p-3 text-paper/90">{net.cypher.join("\n\n")}</pre>}
      </div>

      <aside className="text-sm">
        <h2 className="mb-2">Account</h2>
        {!detail && <p className="text-muted">Click an account to see its scores, shared identity and cases.</p>}
        {detail && (
          <div className="space-y-3">
            <p><span className="mono">{detail.id}</span><br /><span className="text-muted">Bank {detail.bank}</span></p>
            <dl className="grid grid-cols-2 gap-y-1.5">
              <dt className="text-muted">PageRank</dt><dd>{detail.pagerank?.toFixed(4) ?? "—"}</dd>
              <dt className="text-muted">Motif score</dt><dd>{detail.motif?.toFixed(3) ?? "—"}</dd>
              <dt className="text-muted">In / out transfers</dt><dd>{detail.in_deg} / {detail.out_deg}</dd>
              <dt className="text-muted">Community</dt><dd>{detail.community ?? "—"}</dd>
              <dt className="text-muted">Pass-through pairs</dt><dd>{detail.passthrough_pairs ?? 0}</dd>
            </dl>
            <div>
              <h3 className="mb-1">Shared identity</h3>
              <ul className="space-y-0.5">
                {detail.identity.map((x: any) => (
                  <li key={x.id}>{x.kind} <span className="mono">{x.id}</span> <span className="text-muted">shared by {x.shared}{x.units > 1 ? `, ${x.units} units` : ""}</span></li>
                ))}
              </ul>
            </div>
            {detail.cases.length > 0 && (
              <div>
                <h3 className="mb-1">Cases</h3>
                {detail.cases.map((c: string) => <Link key={c} href={`/cases/${c}`} className="block text-ring hover:underline mono">{c}</Link>)}
              </div>
            )}
            {detail.alerts.length > 0 && <p className="text-muted">{detail.alerts.length} alert(s): {detail.alerts.map((a: any) => a.rule).join(", ")}</p>}
            <p className="text-muted">Account ids are salted hashes: banks share structure, not raw identifiers. <span className="mono">{short(detail.id, 4)}…</span></p>
          </div>
        )}
      </aside>
    </div>
  );
}
