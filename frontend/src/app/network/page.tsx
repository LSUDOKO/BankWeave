"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import WeaveGraph, { type GEdge, type GNode } from "@/components/WeaveGraph";
import { Card, Chip, Empty, PageHeader, StatCard, Tabs, btn } from "@/components/ui";
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

const fx = (x: number | null | undefined, d: number) => (x == null ? "—" : x.toFixed(d));

export default function NetworkPage() {
  const [banks, setBanks] = useState<string[]>([]);
  const [view, setView] = useState("consortium");
  const [net, setNet] = useState<Net | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [showQuery, setShowQuery] = useState(false);
  const [cases, setCases] = useState<any[]>([]);
  const [focus, setFocus] = useState<string>("");

  useEffect(() => {
    get("/network/banks").then((b) => {
      setBankOrder(b.banks ?? []); setBanks(b.banks ?? []);
      if (b.banks?.length) setView(`bank_${b.banks[0]}`);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    get("/cases").then((d) => {
      const cs = [...d.cases].sort((a, b) => b.banks.length - a.banks.length || b.accounts - a.accounts);
      setCases(cs);
      if (cs[0]) setFocus((f) => f || cs[0].id);
    }).catch(() => {});
  }, []);
  const load = useCallback(() => {
    get(`/network?view=${view}${focus && focus !== "all" ? `&case=${focus}` : ""}`).then(setNet).catch(() => {});
  }, [view, focus]);
  useEffect(load, [load]);
  useLiveReload(load, (e) => e.type === "case");
  useEffect(() => { if (sel) get(`/network/account/${sel}`).then(setDetail).catch(() => setDetail(null)); else setDetail(null); }, [sel]);

  const p = useMemo(() => (net ? pieces(net.nodes.filter((n) => n.kind !== "external"), net.edges) : null), [net]);
  const own = net?.nodes.filter((n) => n.kind !== "external").length ?? 0;
  const stubs = net?.nodes.filter((n) => n.kind === "external").length ?? 0;
  const isCons = view === "consortium";
  const who = isCons ? "All banks" : `Bank ${view.slice(5)}`;

  const tabs: [string, React.ReactNode][] = [
    ...banks.map((b): [string, React.ReactNode] => [`bank_${b}`, <span key={b} className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: bankColor(b) }} />Bank {b} only</span>]),
    ["consortium", <span key="c" className="font-semibold">Consortium</span>],
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        crumb="Network"
        title="No bank can see the ring alone"
        sub={<>The same accounts, seen two ways. A single bank sees its own customers and stubs for everyone else, so
          money moving between two outside accounts is invisible. The consortium graph links every bank&apos;s view.</>}
        actions={cases.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-muted">
            Accounts shown
            <select value={focus} onChange={(e) => setFocus(e.target.value)}
              className="max-w-[320px] rounded-full border border-line bg-white px-3 py-2 text-sm text-paper shadow-[var(--shadow)]">
              {cases.map((c) => <option key={c.id} value={c.id}>Case {c.id}: {c.accounts} accounts, {c.banks.length} banks</option>)}
              <option value="all">Every case at once</option>
            </select>
          </label>
        )}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled i={0} label="Accounts in view" value={net ? own.toLocaleString() : "–"} chip={who} sub={isCons ? "every bank's customers, linked" : "its own customers only"} />
        <StatCard i={1} label="Connected pieces" value={p ? p.count.toLocaleString() : "–"} chip={p ? (p.count === 1 ? "one structure" : "unconnected") : "–"} sub="groups of accounts money connects" />
        <StatCard i={2} label="Largest piece" value={p ? p.largest.toLocaleString() : "–"} chip={own ? `${Math.round(((p?.largest ?? 0) / own) * 100)}%` : "–"} sub="accounts in the biggest group" />
        <StatCard i={3} label="Outside stubs" value={net ? stubs.toLocaleString() : "–"} sub={isCons ? "accounts outside every member bank" : "counterparties at other banks it cannot see into"} />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card
          className="min-w-0"
          title="Whose view"
          action={<button onClick={() => setShowQuery(!showQuery)} className={btn.small}>{showQuery ? "Hide" : "Show"} Cypher</button>}
        >
          <div aria-label="Whose view"><Tabs value={view} onChange={setView} items={tabs} /></div>
          <p className="mt-4 min-h-[1.5em] text-sm" aria-live="polite">
            {net && p && (isCons
              ? <>All banks together: <b>{own}</b> accounts in <b>{p.count}</b> connected piece{p.count === 1 ? "" : "s"}; the largest holds <b className="text-ring">{p.largest}</b>.</>
              : <>Bank {view.slice(5)} sees <b>{own}</b> of its own accounts and <b>{stubs}</b> outside stubs, and its own accounts form <b>{p.count}</b> unconnected group{p.count === 1 ? "" : "s"}. Nothing here looks like a ring.</>)}
          </p>
          <div className="mt-3 overflow-hidden rounded-2xl border border-line">
            {net
              ? <WeaveGraph nodes={net.nodes} edges={net.edges} banks={banks} onSelect={setSel} highlight={sel ? new Set([sel]) : undefined} />
              : <div className="hatch grid h-[420px] place-items-center border-0 text-sm text-muted"><span className="rounded-full bg-white px-3 py-1">Loading graph…</span></div>}
          </div>
          {showQuery && net && <pre className="mono mt-4 overflow-x-auto rounded-xl border border-line bg-ink p-3 text-paper/90">{net.cypher.join("\n\n")}</pre>}
        </Card>

        <Card title="Account" className="h-fit text-sm" action={detail && <Chip tone="blue">Bank {detail.bank}</Chip>}>
          {!detail && <Empty>Click an account in the graph to see its scores, shared identity and cases.</Empty>}
          {detail && (
            <div className="space-y-4">
              <p className="mono break-all rounded-xl bg-panel-2 px-3 py-2 text-[13px]">{detail.id}</p>
              <dl className="grid grid-cols-2 gap-2">
                {([["PageRank", fx(detail.pagerank, 4)], ["Motif score", fx(detail.motif, 3)], ["In / out", `${detail.in_deg} / ${detail.out_deg}`],
                  ["Community", detail.community ?? "—"], ["Pass-through pairs", detail.passthrough_pairs ?? 0]] as [string, React.ReactNode][]).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-line px-3 py-2">
                    <dt className="text-[11px] text-muted">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              <div>
                <h3 className="mb-2 text-sm font-medium">Shared identity</h3>
                {detail.identity.length ? (
                  <ul className="space-y-1.5">
                    {detail.identity.map((x: any) => (
                      <li key={x.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                        <Chip tone="blue">{x.kind}</Chip><span className="mono">{x.id}</span>
                        <span className="text-muted">shared by {x.shared}{x.units > 1 ? `, ${x.units} units` : ""}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted">No shared identity attributes.</p>}
              </div>
              {detail.cases.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Cases</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.cases.map((c: string) => <Link key={c} href={`/cases/${c}`} className={`${btn.small} mono`}>{c}</Link>)}
                  </div>
                </div>
              )}
              {detail.alerts.length > 0 && <p className="text-xs text-muted">{detail.alerts.length} alert(s): {detail.alerts.map((a: any) => a.rule).join(", ")}</p>}
              <p className="border-t border-line pt-3 text-xs text-muted">Account ids are salted hashes: banks share structure, not raw identifiers. <span className="mono">{short(detail.id, 4)}…</span></p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
