"use client";
// Graph explorer: the FalkorDB Browser, inside BankWeave. Any read-only Cypher on any of our
// graphs, drawn as an Obsidian-style force graph, plus presets that exercise the engine.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GraphCanvas, { GRAPH_PALETTE, type GraphEdge, type GraphGroup, type GraphNode } from "@/components/GraphCanvas";
import ModeBadge from "@/components/ModeBadge";
import { Card, Chip, Empty, PageHeader, StatCard, Tabs, btn } from "@/components/ui";
import { API } from "@/lib/api";
import { bankHex, setBankOrder } from "@/lib/banks";
import { live } from "@/lib/snapshot";

type ApiNode = { id: string; labels: string[]; props: Record<string, unknown> };
type ApiEdge = { id: string; type: string; source: string; target: string; props: Record<string, unknown> };
type Result = {
  graph: string; cypher: string; ms: number; row_count: number; truncated: boolean;
  columns: string[]; rows: Record<string, unknown>[]; nodes: ApiNode[]; edges: ApiEdge[];
};
type Preset = { key: string; title: string; why: string; graph: string; cypher: string; tags: string[] };
type Snapshot = { captured_at: string; source: string; presets: Preset[]; results: Record<string, Result> };
type GraphInfo = { name: string; kind: string; nodes?: number; edges?: number };
type ColorBy = "label" | "bank" | "community";
type View = "graph" | "table";

const BANKS = ["001", "003", "010", "012", "020", "070"];
const FALLBACK_GRAPHS: GraphInfo[] = [
  { name: "consortium", kind: "consortium" }, ...BANKS.map((b) => ({ name: `bank_${b}`, kind: "bank" })),
  { name: "typology_kb", kind: "system" }, { name: "procedures", kind: "system" },
];

/** One colour per node label, stable across presets (app palette). */
const LABEL_COLOR: Record<string, string> = {
  Account: "#087cf8", Bank: "#0b2a5b", Person: "#0e8c95", Company: "#3d55c4", Device: "#c97a06",
  IP: "#a8792a", Address: "#7a5ad8", Case: "#d93a3f", Alert: "#c2418f", Claim: "#c97a06",
  Evidence: "#0c9466", SAR: "#0b2a5b", Sentence: "#5f6f84", Typology: "#d93a3f", Chunk: "#5f6f84",
  Indicator: "#c97a06", Procedure: "#0b2a5b", Step: "#087cf8", Event: "#8a98ab", Decision: "#0c9466",
  Action: "#c2418f", Terminal: "#a8792a", ExternalAccount: "#5f6f84", OtherBank: "#5f6f84",
};

const TIMEOUT_MS = 45000;
const FIELD = "rounded-xl border border-line bg-white px-3 py-2 text-sm";
const TH = "sticky top-0 bg-white py-2.5 pr-4 text-left text-[11px] font-medium uppercase tracking-wide text-muted";

const s = (v: unknown) => (v == null ? "" : String(v));
const cut = (t: string, n: number) => (t.length > n ? t.slice(0, n - 1) + "…" : t);

function labelFor(n: ApiNode): string {
  const p = n.props, l = n.labels[0] ?? "";
  switch (l) {
    case "Account": case "ExternalAccount": return s(p.id).slice(0, 6) || n.id;
    case "Bank": return s(p.name || `Bank ${p.id}`);
    case "Sentence": case "Indicator": return cut(s(p.text), 34);
    case "Claim": return `${s(p.kind || "claim")} ${s(p.id).slice(3, 9)}`.trim();
    case "Evidence": return `${s(p.kind || "evidence").replace(/_/g, " ")}`;
    case "Alert": return s(p.rule || p.id).replace(/_/g, " ");
    case "Step": return s(p.tool || "step").replace(/_/g, " ");
    case "Procedure": return s(p.typology || p.name).replace(/_/g, " ");
    case "Decision": return s(p.outcome || p.id);
    case "Typology": return cut(s(p.name || p.id), 34);
    case "Device": case "IP": case "Address": return s(p.text) || s(p.id);
    default: return cut(s(p.name ?? p.title ?? p.id ?? n.id), 34) || n.id;
  }
}

const bankOf = (n: ApiNode) => s(n.labels[0] === "Bank" ? n.props.id : n.props.bank_id);

async function postJson<T>(path: string, body: unknown, ms = TIMEOUT_MS): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: ctl.signal,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(typeof data?.detail === "string" ? data.detail : r.statusText), { status: r.status });
    return data as T;
  } finally { clearTimeout(t); }
}

async function getJson<T>(path: string, ms = 15000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(API + path, { cache: "no-store", signal: ctl.signal });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as T;
  } finally { clearTimeout(t); }
}

// the captured results are ~0.5 MB, so they load only when the API cannot answer
let snapPromise: Promise<Snapshot> | null = null;
const loadSnapshot = () => (snapPromise ??= import("@/snapshots/explorer.json").then((m) => (m.default ?? m) as unknown as Snapshot));

export default function Explorer() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [graphs, setGraphs] = useState<GraphInfo[]>(FALLBACK_GRAPHS);
  const [graph, setGraph] = useState("consortium");
  const [cypher, setCypher] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null>(null);
  const [replay, setReplay] = useState<string | null>(null); // captured_at when showing a snapshot
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>("graph");
  const [colorBy, setColorBy] = useState<ColorBy>("label");
  const [picked, setPicked] = useState<GraphNode | null>(null);
  const runId = useRef(0);

  const run = useCallback(async (g: string, q: string, preset?: Preset | null) => {
    const id = ++runId.current;
    setBusy(true); setErr(null);
    try {
      const r = await postJson<Result>("/lab/graph", { graph: g, cypher: q });
      if (id !== runId.current) return;
      setRes(r); setReplay(null);
    } catch (e) {
      if (id !== runId.current) return;
      const status = (e as { status?: number }).status;
      // FastAPI's bare "Not Found" means an older API without this route: treat it like an outage
      const noRoute = status === 404 && (e as Error).message === "Not Found";
      // the API answered with a query error: show it, never paper over it with a replay
      if (status && !noRoute && status !== 502 && status !== 503 && status !== 504) {
        setErr((e as Error).message || "Query failed");
      } else {
        const snap = await loadSnapshot().catch(() => null);
        const hit = preset && snap?.results[preset.key];
        if (hit && preset && q.trim() === preset.cypher.trim()) {
          setRes(hit); setReplay(snap!.captured_at);
        } else {
          setErr("The API is unreachable, and only the preset queries have captured results to replay.");
        }
      }
    } finally {
      if (id === runId.current) setBusy(false);
    }
  }, []);

  const choose = useCallback((p: Preset, autorun = true) => {
    setActive(p.key); setGraph(p.graph); setCypher(p.cypher); setPicked(null);
    if (autorun) run(p.graph, p.cypher, p);
  }, [run]);

  // presets (live, else the captured ones), then the first preset runs on load
  useEffect(() => {
    let off = false;
    (async () => {
      let list: Preset[] = [];
      try {
        list = (await getJson<{ presets: Preset[] }>("/lab/graph/presets")).presets;
      } catch {
        const snap = await loadSnapshot().catch(() => null);
        list = snap?.presets ?? [];
      }
      if (off || !list.length) return;
      setPresets(list);
      choose(list[0]);
    })();
    live<{ graphs: GraphInfo[] }>("/lab/graphs").then(({ data }) => { if (!off && data.graphs?.length) setGraphs(data.graphs); }).catch(() => {});
    return () => { off = true; };
  }, [choose]);

  const preset = presets.find((p) => p.key === active) ?? null;
  const edited = !!preset && (cypher.trim() !== preset.cypher.trim() || graph !== preset.graph);
  const submit = () => { if (cypher.trim() && !busy) run(graph, cypher, edited ? null : preset); };

  // ---- shape the result for the canvas
  const hasCommunity = useMemo(() => !!res?.nodes.some((n) => typeof n.props.community === "number"), [res]);
  useEffect(() => {
    if (!res) return;
    const labels = new Set(res.nodes.map((n) => n.labels[0]));
    const banked = res.nodes.filter((n) => bankOf(n)).length;
    setColorBy(hasCommunity ? "community" : labels.size >= 3 || banked < res.nodes.length * 0.5 ? "label" : "bank");
  }, [res, hasCommunity]);

  const { nodes, edges, groups } = useMemo(() => {
    if (!res) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[], groups: [] as GraphGroup[] };
    const banks = [...new Set([...BANKS, ...res.nodes.map(bankOf).filter(Boolean)])].sort();
    setBankOrder(banks);
    const groupOf = (n: ApiNode) => colorBy === "bank" ? bankOf(n)
      : colorBy === "community" ? s(n.props.community) : (n.labels[0] ?? "");
    const nodes: GraphNode[] = res.nodes.map((n) => ({
      id: n.id, label: labelFor(n), group: groupOf(n),
      size: typeof n.props.score === "number" ? n.props.score : undefined,
      props: { label: n.labels.join(":"), ...n.props },
    }));
    const edges: GraphEdge[] = res.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, type: e.type, props: e.props }));
    let groups: GraphGroup[];
    if (colorBy === "bank") {
      groups = [...banks.map((b) => ({ key: b, label: `Bank ${b}`, color: bankHex(b) })), { key: "", label: "not a bank account", color: "#b5bcc6" }];
    } else if (colorBy === "community") {
      const ids = [...new Set(nodes.map((n) => n.group ?? ""))];
      groups = ids.map((k, i) => ({ key: k, label: k ? `community ${k}` : "none", color: k ? GRAPH_PALETTE[i % GRAPH_PALETTE.length] : "#b5bcc6" }));
    } else {
      groups = [...new Set(nodes.map((n) => n.group ?? ""))].map((k) => ({ key: k, label: k || "unlabelled", color: LABEL_COLOR[k] ?? "#5f6f84" }));
    }
    return { nodes, edges, groups };
  }, [res, colorBy]);

  const relTypes = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of res?.edges ?? []) m.set(e.type, (m.get(e.type) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [res]);

  const graphOptions = useMemo(() => {
    const names = new Set(graphs.map((g) => g.name));
    const extra: GraphInfo[] = presets.filter((p) => !names.has(p.graph)).map((p) => ({ name: p.graph, kind: "case" }));
    return [...graphs, ...extra];
  }, [graphs, presets]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Graph explorer"
        sub="Run read-only Cypher on any BankWeave graph in FalkorDB and see the answer as a graph. Each preset is a live query on the real consortium, bank, case and knowledge graphs."
        actions={<>
          {replay && <ModeBadge mode="replay" />}
          <a href="https://app.falkordb.cloud" target="_blank" rel="noreferrer" className={btn.ghost}>
            Open FalkorDB Cloud browser
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
          </a>
        </>}
      />

      <Card title="Presets" action={<span className="text-xs text-muted">algorithms, indexes and provenance on our real data</span>}>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {presets.map((p) => {
            const on = p.key === active;
            return (
              <button key={p.key} type="button" onClick={() => choose(p)} disabled={busy && on}
                className={`group flex flex-col items-start gap-1 rounded-2xl border px-3.5 py-2.5 text-left transition-colors ${on ? "border-deep bg-deep text-white" : "border-line bg-white hover:border-cyan/50 hover:bg-panel-2"}`}>
                <span className="text-[13.5px] font-semibold leading-tight">{p.title}</span>
                <span className="flex flex-wrap items-center gap-1">
                  {p.tags.map((t) => (
                    <span key={t} className={`mono rounded-md px-1.5 py-px text-[10px] ${on ? "bg-white/15 text-sky" : "bg-panel-2 text-cyan"}`}>{t}</span>
                  ))}
                  <span className={`text-[10.5px] ${on ? "text-white/70" : "text-muted"}`}>{p.graph}</span>
                </span>
              </button>
            );
          })}
          {!presets.length && Array.from({ length: 8 }).map((_, i) => <span key={i} className="hatch h-[58px] rounded-2xl opacity-40" />)}
        </div>
        {preset && <p className="mt-4 max-w-[110ch] text-sm text-muted"><span className="font-medium text-paper">{preset.title}.</span> {preset.why}</p>}
      </Card>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2.1fr)]">
        <div className="space-y-4">
          <Card title="Cypher" action={<Chip tone="ok">read-only · GRAPH.RO_QUERY</Chip>}>
            <label className="mb-1 block text-xs font-medium text-muted" htmlFor="graph">Graph</label>
            <select id="graph" value={graph} onChange={(e) => setGraph(e.target.value)} className={`${FIELD} mb-3 w-full`}>
              {graphOptions.map((g) => (
                <option key={g.name} value={g.name}>
                  {g.name}{g.nodes != null ? `  ·  ${g.nodes.toLocaleString()} nodes, ${(g.edges ?? 0).toLocaleString()} edges` : ""}
                </option>
              ))}
            </select>
            <textarea value={cypher} onChange={(e) => setCypher(e.target.value)} spellCheck={false} aria-label="Cypher query"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); submit(); }
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  const el = e.currentTarget, a = el.selectionStart, b = el.selectionEnd;
                  setCypher(cypher.slice(0, a) + "  " + cypher.slice(b));
                  requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = a + 2; });
                }
              }}
              className="mono scroll-thin block h-[300px] w-full resize-y rounded-xl border border-line bg-ink p-3 text-[12px] leading-relaxed text-paper outline-none focus:border-cyan/60" />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={submit} disabled={busy || !cypher.trim()} className={btn.primary}>
                {busy ? "Running…" : "Run query"}
              </button>
              <span className="text-xs text-muted"><kbd className="mono rounded border border-line bg-white px-1">Ctrl</kbd> + <kbd className="mono rounded border border-line bg-white px-1">Enter</kbd></span>
              {edited && preset && (
                <button type="button" onClick={() => choose(preset, false)} className="ml-auto text-xs text-muted hover:text-cyan">Reset to preset</button>
              )}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Writes are rejected by FalkorDB itself. Results are capped at 500 rows and 900 nodes; nodes, relationships
              and paths anywhere in the result (also inside lists) are drawn.
            </p>
          </Card>

          <div className="grid grid-cols-2 gap-4 xl:grid-cols-1 2xl:grid-cols-2">
            <StatCard filled i={0} label="Nodes" value={res ? res.nodes.length.toLocaleString() : "–"} chip={res ? `${new Set(res.nodes.map((n) => n.labels[0])).size} labels` : "–"} sub="drawn on the canvas" />
            <StatCard i={1} label="Relationships" value={res ? res.edges.length.toLocaleString() : "–"} chip={res ? `${relTypes.length} types` : "–"} sub={relTypes.slice(0, 2).map(([t]) => t).join(", ") || "between returned nodes"} />
            <StatCard i={2} label="Query time" value={res ? (res.ms < 10 ? res.ms.toFixed(1) : Math.round(res.ms).toLocaleString()) : "–"} chip="ms" sub={replay ? "as captured" : "round trip to FalkorDB Cloud"} />
            <StatCard i={3} label="Rows" value={res ? res.row_count.toLocaleString() : "–"} chip={res?.truncated ? "capped" : "all"} sub={res ? `${res.columns.length} columns` : "returned by the query"} />
          </div>
        </div>

        <Card pad="p-4 sm:p-5"
          title={<span className="flex flex-wrap items-center gap-2">Result{res && <span className="mono text-xs font-normal text-muted">{res.graph}</span>}{busy && <span className="pulse-soft text-xs font-normal text-cyan">querying FalkorDB…</span>}</span>}
          action={<Tabs<View> value={view} onChange={setView} items={[["graph", "Graph"], ["table", "Table"]]} />}>
          {replay && (
            <p className="mb-3 rounded-xl bg-[#fff6e6] px-3 py-2 text-xs text-verify">
              Replay: the API is unreachable, so this is the real result of this preset captured from FalkorDB Cloud on {new Date(replay).toLocaleString()}.
            </p>
          )}
          {err && <p className="mb-3 rounded-xl bg-[#fdecec] px-3 py-2 text-sm text-ring">{err}</p>}

          {view === "graph" ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>Colour by</span>
                {(["label", "bank", ...(hasCommunity ? ["community"] : [])] as ColorBy[]).map((c) => (
                  <button key={c} type="button" onClick={() => setColorBy(c)}
                    className={`rounded-full px-3 py-1 font-medium capitalize ${colorBy === c ? "bg-deep text-white" : "bg-panel-2 text-paper hover:text-cyan"}`}>{c}</button>
                ))}
                <span className="ml-auto hidden md:inline">hover to focus · click to inspect · drag · scroll to zoom</span>
              </div>
              <GraphCanvas nodes={nodes} edges={edges} groups={groups} colorBy={colorBy === "label" ? "Node label" : colorBy === "bank" ? "Bank" : "Community"}
                height={640} onSelect={setPicked}
                emptyText={busy ? "Running the query…" : res ? "The query returned no nodes. Switch to Table for scalar results." : "Pick a preset or run a query."} />
              {relTypes.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                  <span>Relationships</span>
                  {relTypes.map(([t, n]) => <Chip key={t} tone="blue"><span className="mono">{t}</span> {n}</Chip>)}
                  {picked && <span className="ml-auto">selected <span className="mono text-paper">{s(picked.props?.id ?? picked.id)}</span></span>}
                </p>
              )}
            </>
          ) : (
            <ResultTable res={res} />
          )}

          {res && (
            <details className="mt-4 rounded-xl border border-line bg-white" open>
              <summary className="cursor-pointer select-none px-3 py-2 text-xs text-muted">
                Executed on <span className="mono text-paper">{res.graph}</span> via GRAPH.RO_QUERY · {Math.round(res.ms).toLocaleString()} ms · {res.row_count.toLocaleString()} rows{res.truncated ? " (capped)" : ""}
              </summary>
              <pre className="mono scroll-thin max-h-[260px] overflow-auto border-t border-line bg-ink p-3 text-[11.5px] leading-relaxed text-paper">{res.cypher}</pre>
            </details>
          )}
        </Card>
      </section>
    </div>
  );
}

function cell(v: unknown): React.ReactNode {
  if (v == null) return <span className="text-muted">null</span>;
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    if ("_node" in o) return <Chip tone="blue">{s(o.label)} <span className="mono">{cut(s(o.id), 18)}</span></Chip>;
    if ("_edge" in o) return <Chip tone="muted"><span className="mono">:{s(o.type)}</span></Chip>;
    if ("_path" in o) return <Chip tone="deep">path · {(o._path as unknown[]).length} nodes</Chip>;
    return <span className="mono">{cut(JSON.stringify(o), 80)}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length && typeof v[0] === "object" && v[0] && "_node" in (v[0] as object)) return <Chip tone="blue">{v.length} nodes</Chip>;
    return <span className="mono">{cut(JSON.stringify(v), 80)}</span>;
  }
  if (typeof v === "number") return <span className="mono tabular-nums">{Number.isInteger(v) ? v.toLocaleString() : v.toPrecision(5)}</span>;
  return <span className="mono">{cut(String(v), 80)}</span>;
}

function ResultTable({ res }: { res: Result | null }) {
  if (!res) return <Empty>Run a query to see its rows.</Empty>;
  if (!res.rows.length) return <Empty>The query returned no rows.</Empty>;
  return (
    <div className="scroll-thin max-h-[640px] overflow-auto rounded-xl border border-line">
      <table className="w-full text-[12.5px]">
        <thead><tr className="border-b border-line">
          <th className={`${TH} pl-3`}>#</th>
          {res.columns.map((c) => <th key={c} className={TH}><span className="mono normal-case">{c}</span></th>)}
        </tr></thead>
        <tbody>
          {res.rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70 last:border-0 hover:bg-panel-2/60">
              <td className="py-1.5 pl-3 pr-4 text-muted tabular-nums">{i + 1}</td>
              {res.columns.map((c) => <td key={c} className="max-w-[280px] truncate py-1.5 pr-4 align-top">{cell(r[c])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {res.row_count > res.rows.length && (
        <p className="border-t border-line px-3 py-2 text-xs text-muted">Showing {res.rows.length.toLocaleString()} of {res.row_count.toLocaleString()} rows.</p>
      )}
    </div>
  );
}
