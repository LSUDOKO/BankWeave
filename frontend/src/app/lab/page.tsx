"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import ModeBadge from "@/components/ModeBadge";
import { Card, Chip, Empty, PageHeader, StatCard, Tabs, btn, type Tone } from "@/components/ui";
import { post } from "@/lib/api";
import { live } from "@/lib/snapshot";
import dynamic from "next/dynamic";

const MemoryGraph = dynamic(() => import("@/components/MemoryGraph"), { ssr: false });

type Graph = { name: string; kind: string; nodes: number; edges: number; labels: string[]; relationships: string[];
  indexes: { label: string; properties: string[]; types: Record<string, string[]>; entitytype: string }[];
  memory_mb: number; index_mb: number; error?: string };
type Algo = { key: string; family: string; title: string; cypher: string; default_graph: string };
type PlanNode = { depth: number; op: string; detail: string; records: number | null; ms: number | null };
type Tool = { name: string; description: string; agents: string[]; mode: string; input_schema: any };

const TABS = ["Graphs", "Algorithms & indexes", "Inspector", "MCP tools", "Engine features", "Agent memory"] as const;

const WELL = "mono overflow-auto scroll-thin rounded-xl border border-line bg-ink p-3 text-[11px] leading-snug";
const FIELD = "rounded-xl border border-line bg-white px-3 py-2 text-sm";
const TH = "py-2.5 pr-3 text-[11px] font-medium uppercase tracking-wide text-muted";

export default function Lab() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Graphs");
  const [replay, setReplay] = useState(false);
  const [gs, setGs] = useState<Graph[] | null>(null);
  const [gErr, setGErr] = useState(false);
  useEffect(() => {
    live<{ graphs: Graph[] }>("/lab/graphs").then(({ data, replay }) => { setGs(data.graphs); setReplay(replay); }).catch(() => setGErr(true));
  }, []);
  const totals = useMemo(() => (gs ?? []).reduce((a, g) => ({ n: a.n + (g.nodes || 0), e: a.e + (g.edges || 0), mb: a.mb + (g.memory_mb || 0) }), { n: 0, e: 0, mb: 0 }), [gs]);
  const byKind = (k: string) => gs?.filter((g) => g.kind === k).length ?? 0;
  return (
    <div className="space-y-5">
      <PageHeader
        title="FalkorDB Lab"
        sub="The engine behind every agent decision, opened up: every graph in the instance, every algorithm and index the agents use, the execution plan of any read query, and every MCP tool the agents use."
        actions={replay && <ModeBadge mode="replay" />}
      />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled i={0} label="Graphs in the instance" value={gs ? gs.length : "–"} chip={`${byKind("case")} case`} sub={`${byKind("consortium")} consortium, ${byKind("bank")} bank, ${byKind("system")} system`} />
        <StatCard i={1} label="Nodes" value={gs ? totals.n.toLocaleString() : "–"} chip="all graphs" sub="summed across every graph" />
        <StatCard i={2} label="Edges" value={gs ? totals.e.toLocaleString() : "–"} chip="all graphs" sub="summed across every graph" />
        <StatCard i={3} label="Graph memory" value={gs ? (totals.mb < 1 ? "<1" : Math.round(totals.mb).toLocaleString()) : "–"} chip="MB" sub="per-graph memory, summed" />
      </section>
      <Tabs value={tab} onChange={setTab} items={TABS.map((t) => [t, t] as [(typeof TABS)[number], string])} />
      {tab === "Graphs" && <Graphs gs={gs} err={gErr} totals={totals} />}
      {tab === "Algorithms & indexes" && <Algorithms onReplay={setReplay} />}
      {tab === "Inspector" && <Inspector names={gs?.map((g) => g.name) ?? []} />}
      {tab === "MCP tools" && <Tools onReplay={setReplay} />}
      {tab === "Engine features" && <Features />}
      {tab === "Agent memory" && <Memory />}
    </div>
  );
}

const KIND_TONE: Record<string, Tone> = { consortium: "deep", bank: "blue", case: "warn", system: "muted" };

function Graphs({ gs, err, totals }: { gs: Graph[] | null; err: boolean; totals: { n: number; e: number } }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card title="One instance, many graphs" action={gs && <span className="text-xs text-muted">click a row for labels, relationships and indexes</span>}>
      <p className="-mt-2 text-sm text-muted">
        {gs ? `${gs.length} graphs · ${totals.n.toLocaleString()} nodes · ${totals.e.toLocaleString()} edges. ` : err ? "The API is unreachable and no snapshot is bundled. " : "Loading… "}
        A bank only sees its own graph; the consortium holds hashed ids for everyone; each case gets its own graph.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left">
            <tr>
              <th className={TH}>Graph</th><th className={`${TH} text-right`}>Nodes</th>
              <th className={`${TH} text-right`}>Edges</th><th className={`${TH} text-right`}>Indexes</th>
              <th className={`${TH} pr-0 text-right`}>Memory</th>
            </tr>
          </thead>
          <tbody>
            {gs?.map((g) => (
              <Fragment key={g.name}>
                <tr className={`cursor-pointer border-t border-line hover:bg-panel-2/50 ${open === g.name ? "bg-panel-2/60" : ""}`} onClick={() => setOpen(open === g.name ? null : g.name)}>
                  <td className="py-2.5 pr-3"><span className="mono font-medium">{g.name}</span> <Chip tone={KIND_TONE[g.kind] ?? "muted"} className="ml-1">{g.kind}</Chip></td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{g.nodes?.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{g.edges?.toLocaleString()}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums">{g.indexes?.length ?? 0}</td>
                  <td className="py-2.5 text-right tabular-nums text-muted">{g.memory_mb == null ? "–" : g.memory_mb < 1 ? "<1" : g.memory_mb} MB</td>
                </tr>
                {open === g.name && (
                  <tr><td colSpan={5} className="pb-3">
                    <div className="grid gap-3 rounded-2xl bg-panel-2 p-4 text-xs md:grid-cols-3">
                      <div><p className="mb-1 font-medium text-muted">Labels</p><p className="mono">{g.labels?.join(", ")}</p></div>
                      <div><p className="mb-1 font-medium text-muted">Relationships</p><p className="mono">{g.relationships?.join(", ")}</p></div>
                      <div><p className="mb-1 font-medium text-muted">Indexes</p>
                        <ul className="mono space-y-0.5">{g.indexes?.map((i, k) => (
                          <li key={k}>{i.entitytype === "RELATIONSHIP" ? `()-[:${i.label}]-()` : `(:${i.label})`} {Object.entries(i.types).map(([p, t]) => `${p}:${t.join("/")}`).join(", ")}</li>
                        ))}</ul>
                      </div>
                    </div>
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!gs && !err && <div className="mt-3 space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-xl bg-panel-2" />)}</div>}
    </Card>
  );
}

const FAMILY: Record<string, string> = { algorithm: "Native algorithm", index: "Index", udf: "JS UDF", query: "Composite query" };
const FAMILY_TONE: Record<string, Tone> = { algorithm: "blue", index: "ok", udf: "warn", query: "deep" };

function Algorithms({ onReplay }: { onReplay: (b: boolean) => void }) {
  const [algos, setAlgos] = useState<Algo[]>([]);
  const [res, setRes] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { live<{ algorithms: Algo[] }>("/lab/algorithms").then(({ data, replay }) => { setAlgos(data.algorithms); onReplay(replay); }); }, [onReplay]);
  const run = async (key: string) => {
    setBusy(key);
    try { setRes((r) => ({ ...r, [key]: undefined })); const out = await post("/lab/run", { key }); setRes((r) => ({ ...r, [key]: out })); }
    catch (e: any) { setRes((r) => ({ ...r, [key]: { error: e.message } })); }
    setBusy(null);
  };
  const runAll = async () => { for (const a of algos) await run(a.key); };
  return (
    <section className="space-y-4">
      <div className="glass flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="text-sm text-muted">Each run executes live through <span className="mono">GRAPH.RO_QUERY</span> with defaults picked from the graph itself.</p>
        <button onClick={runAll} disabled={!!busy || !algos.length} className={btn.primary}><Icon name="play" className="size-4" strokeWidth={2.2} />Run all {algos.length}</button>
      </div>
      {!algos.length && <div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <div key={i} className="glass h-44 animate-pulse" />)}</div>}
      <div className="grid gap-4 lg:grid-cols-2">
        {algos.map((a) => {
          const r = res[a.key];
          return (
            <article key={a.key} className="glass min-w-0 p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Chip tone={FAMILY_TONE[a.family] ?? "muted"}>{FAMILY[a.family] ?? a.family}</Chip>
                  <h3 className="mt-1.5 text-[15px] font-medium">{a.title}</h3>
                </div>
                <button onClick={() => run(a.key)} disabled={busy === a.key} className={`${btn.small} shrink-0 disabled:opacity-50`}>
                  {busy === a.key ? "Running…" : "Run"}
                </button>
              </div>
              <pre className={`${WELL} mt-3 max-h-28 text-paper/80`}>{a.cypher.trim()}</pre>
              {r?.error && <p className="mt-2 text-sm text-ring">{r.error}</p>}
              {r && !r.error && (
                <div className="mt-3 text-xs">
                  <p className="flex flex-wrap items-center gap-1.5 text-muted"><Chip tone="ok">{r.row_count} rows</Chip><Chip tone="blue">{r.ms} ms</Chip>on <span className="mono text-cyan">{r.graph}</span></p>
                  <Rows rows={r.rows} />
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Rows({ rows }: { rows: Record<string, any>[] }) {
  if (!rows?.length) return <p className="mt-2 text-muted">No rows.</p>;
  const cols = Object.keys(rows[0]);
  const fmt = (v: any) => (Array.isArray(v) ? `[${v.slice(0, 4).map((x) => (typeof x === "string" ? x.slice(0, 8) : JSON.stringify(x))).join(", ")}${v.length > 4 ? ", …" : ""}]`
    : typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(4)) : typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v));
  return (
    <div className="scroll-thin mt-2 max-h-40 overflow-auto rounded-xl border border-line">
      <table className="mono w-full text-[11px]">
        <thead className="sticky top-0 bg-panel-2 text-left text-muted"><tr>{cols.map((c) => <th key={c} className="px-2 py-1.5 font-medium">{c}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-line">{cols.map((c) => <td key={c} className="px-2 py-1 align-top">{String(fmt(r[c]))}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const SAMPLES = [
  ["Accounts by bank", "consortium", "MATCH (a:Account) RETURN a.bank_id AS bank, count(a) AS accounts ORDER BY accounts DESC"],
  ["Indexed lookup + traverse", "consortium", "MATCH (a:Account)-[t:TRANSFERS]->(b:Account) WHERE a.pagerank > 0.001 RETURN a.id, b.id, t.amount LIMIT 20"],
  ["Shared device", "consortium", "MATCH (a:Account)-[:USES_DEVICE]->(d:Device)<-[:USES_DEVICE]-(b:Account) WHERE a.id < b.id RETURN d.id, a.id, b.id LIMIT 20"],
  ["Claims and support", "", "MATCH (c:Claim)-[:SUPPORTED_BY]->(e:Evidence) RETURN c.id, count(e) AS paths, count(DISTINCT e.origin) AS origins"],
];

function Inspector({ names }: { names: string[] }) {
  const [graph, setGraph] = useState("consortium");
  const [cypher, setCypher] = useState(SAMPLES[1][2]);
  const [mode, setMode] = useState<"profile" | "explain">("profile");
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cases = names;
  const go = async () => {
    setErr(null); setOut(null); setBusy(true);
    try { setOut(await post("/lab/inspect", { graph, cypher, mode })); } catch (e: any) { setErr(e.data?.detail ?? e.message); }
    setBusy(false);
  };
  const plan: PlanNode[] = out?.[mode] ?? out?.explain ?? [];
  const maxMs = Math.max(0.001, ...plan.map((n) => n.ms ?? 0));
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card title={<span className="mono text-[15px]">GRAPH.PROFILE / GRAPH.EXPLAIN</span>} className="space-y-3">
        <p className="-mt-2 text-sm text-muted">Read-only: the query must pass <span className="mono">GRAPH.RO_QUERY</span> (FalkorDB rejects writes there) before it is profiled.</p>
        <div className="flex flex-wrap gap-1.5">
          {SAMPLES.map(([t, g, c]) => (
            <button key={t} onClick={() => { setCypher(c); setGraph(g || cases.find((x) => x.startsWith("case_")) || "consortium"); }}
              className="rounded-full border border-line px-3 py-1 text-xs font-medium text-muted hover:border-cyan hover:text-cyan">{t}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={graph} onChange={(e) => setGraph(e.target.value)} className={`${FIELD} mono`}>
            {(cases.length ? cases : ["consortium"]).map((g) => <option key={g}>{g}</option>)}
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className={FIELD}>
            <option value="profile">PROFILE (runs it)</option><option value="explain">EXPLAIN (plan only)</option>
          </select>
          <button onClick={go} disabled={busy} className={`${btn.primary} ml-auto`}>{busy ? "Inspecting…" : "Inspect"}</button>
        </div>
        <textarea value={cypher} onChange={(e) => setCypher(e.target.value)} rows={7}
          className="mono w-full rounded-xl border border-line bg-ink p-3 text-xs" spellCheck={false} />
        {err && <p className="text-sm text-ring">{err}</p>}
      </Card>
      <Card title="Execution plan" action={out && <Chip tone="blue">{out.rows} rows · {out.ro_query_ms} ms</Chip>}>
        {!out && <Empty>Run a query to see its operator tree, rows per operator and time.</Empty>}
        {out && (
          <>
            <p className="-mt-2 text-xs text-muted">RO_QUERY {out.ro_query_ms} ms · graph {out.memory?.total_graph_sz_mb} MB (indexes {out.memory?.indices_sz_mb} MB)</p>
            <ol className="mt-3 space-y-1.5 text-xs">
              {plan.map((n, i) => (
                <li key={i} style={{ paddingLeft: n.depth * 16 }}>
                  <div className="rounded-xl border border-line px-3 py-2">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-paper">{n.op}</span>
                      {n.ms != null && <span className="mono text-muted">{n.records} rows · {n.ms.toFixed(3)} ms</span>}
                    </div>
                    {n.detail && <p className="mono break-all text-cyan/90">{n.detail}</p>}
                    {n.ms != null && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full rounded-full bg-cyan" style={{ width: `${(n.ms / maxMs) * 100}%` }} /></div>}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </Card>
    </section>
  );
}

const MODE_TONE: Record<string, Tone> = { "read-only": "ok", "records evidence": "warn", mutating: "ring" };

function Tools({ onReplay }: { onReplay: (b: boolean) => void }) {
  const [ts, setTs] = useState<Tool[]>([]);
  const [sel, setSel] = useState<Tool | null>(null);
  const [args, setArgs] = useState("{}");
  const [out, setOut] = useState<any>(null);
  const [xray, setXray] = useState<any>(null);
  const [filter, setFilter] = useState("all");
  useEffect(() => { live<{ tools: Tool[] }>("/lab/tools").then(({ data, replay }) => { setTs(data.tools); onReplay(replay); }); }, [onReplay]);
  const pick = (t: Tool) => {
    setSel(t); setOut(null);
    const ex: Record<string, any> = {};
    for (const [k, v] of Object.entries<any>(t.input_schema.properties ?? {})) if (t.input_schema.required?.includes(k)) ex[k] = v.type === "integer" ? 3 : v.type === "array" ? [] : "";
    if (t.name === "resolve_entity") ex.name = "Jon Smyth";
    if (t.name === "kb_query") ex.question = "structuring below reporting threshold";
    if (t.name === "cypher_readonly") Object.assign(ex, { graph: "consortium", query: "MATCH (b:Bank) RETURN b.id" });
    setArgs(JSON.stringify(ex, null, 2));
  };
  const run = async () => {
    if (!sel) return;
    setXray(null);
    try { setOut(await post("/lab/tools/run", { name: sel.name, params: JSON.parse(args) })); }
    catch (e: any) { setOut({ error: e.data?.detail ?? e.message }); }
  };
  // Engine X-Ray: PROFILE the exact query the tool ran, with its parameters, plus graph memory
  const runXray = async () => {
    try { setXray(await post("/lab/inspect", { graph: out.graph ?? "consortium", cypher: out.cypher, params: out.params ?? {}, mode: "profile" })); }
    catch (e: any) { setXray({ error: e.data?.detail ?? e.message }); }
  };
  const counts = ts.reduce<Record<string, number>>((a, t) => ({ ...a, [t.mode]: (a[t.mode] ?? 0) + 1 }), {});
  return (
    <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card title="MCP tools" action={<Chip tone="blue">{ts.length}</Chip>} pad="p-4">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {["all", "read-only", "records evidence", "mutating"].map((m) => (
            <button key={m} onClick={() => setFilter(m)}
              className={`rounded-full px-3 py-1 font-medium transition-colors ${filter === m ? "bg-deep text-white" : "bg-panel-2 text-muted hover:text-paper"}`}>
              {m} {m === "all" ? ts.length : counts[m] ?? 0}
            </button>
          ))}
        </div>
        <ul className="scroll-thin mt-3 max-h-[60vh] space-y-0.5 overflow-y-auto text-sm">
          {ts.filter((t) => filter === "all" || t.mode === filter).map((t) => (
            <li key={t.name}>
              <button onClick={() => pick(t)} className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left hover:bg-panel-2 ${sel?.name === t.name ? "bg-panel-2" : ""}`}>
                <span className="mono truncate">{t.name}</span> <Chip tone={MODE_TONE[t.mode] ?? "muted"} className="shrink-0">{t.mode}</Chip>
              </button>
            </li>
          ))}
          {!ts.length && [0, 1, 2, 3, 4].map((i) => <li key={i} className="h-9 animate-pulse rounded-xl bg-panel-2" />)}
        </ul>
      </Card>
      <Card className="min-w-0">
        {!sel ? <Empty>The same tools the agents call are served over MCP (Claude Desktop can use them). Pick one to see its schema and run it live; nothing is recorded.</Empty> : (
          <>
            <div className="flex flex-wrap items-center gap-2"><h2 className="mono text-[17px] font-medium">{sel.name}</h2><Chip tone={MODE_TONE[sel.mode] ?? "muted"}>{sel.mode}</Chip></div>
            <p className="mt-1 text-sm text-paper/85">{sel.description}</p>
            <p className="mt-1 text-xs text-muted">Used by: {sel.agents.join(", ")}</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div><p className="mb-1 text-xs font-medium text-muted">Input schema</p><pre className={`${WELL} max-h-48`}>{JSON.stringify(sel.input_schema, null, 2)}</pre></div>
              <div><p className="mb-1 text-xs font-medium text-muted">Arguments</p>
                <textarea value={args} onChange={(e) => setArgs(e.target.value)} rows={8} className="mono w-full rounded-xl border border-line bg-white p-3 text-[11px]" />
                <button onClick={run} disabled={sel.mode === "mutating"} className={`${btn.primary} mt-2`}><Icon name="play" className="size-4" strokeWidth={2.2} />Run live</button>
              </div>
            </div>
            {out && (
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <div><p className="mb-1 text-xs font-medium text-muted">Payload {out.ms != null && `(${out.ms} ms)`}</p><pre className={`${WELL} max-h-72`}>{JSON.stringify(out.error ?? out.result ?? out, null, 2).slice(0, 6000)}</pre></div>
                <div><p className="mb-1 text-xs font-medium text-muted">Cypher it ran</p><pre className={`${WELL} max-h-72 text-cyan/90`}>{typeof out.cypher === "string" ? out.cypher : JSON.stringify(out.cypher, null, 2)}</pre>
                  {typeof out.cypher === "string" && <button onClick={runXray} className={`${btn.small} mt-2`}>Engine X-Ray (PROFILE + memory)</button>}
                </div>
              </div>
            )}
            {xray && (xray.error ? <p className="mt-2 text-sm text-ring">{xray.error}</p> : (
              <div className="mt-4 rounded-2xl bg-panel-2 p-4 text-xs">
                <p className="text-muted">{xray.rows} rows · RO_QUERY {xray.ro_query_ms} ms · graph <span className="mono">{xray.graph}</span> {xray.memory?.total_graph_sz_mb} MB, indexes {xray.memory?.indices_sz_mb} MB</p>
                <ol className="mono mt-2 space-y-0.5">{(xray.profile ?? []).map((n: any, i: number) => (
                  <li key={i} style={{ paddingLeft: n.depth * 14 }}>{n.op} <span className="text-cyan/80">{n.detail}</span> <span className="text-muted">{n.records} rows · {n.ms?.toFixed(3)} ms</span></li>
                ))}</ol>
              </div>
            ))}
          </>
        )}
      </Card>
    </section>
  );
}

function Features() {
  const [udfs, setUdfs] = useState<any>(null);
  const [acl, setAcl] = useState<any>(null);
  const [tri, setTri] = useState<any>(null);
  const [reach, setReach] = useState<any>(null);
  useEffect(() => { live("/lab/udf").then(({ data }) => setUdfs(data)).catch(() => {}); }, []);
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <Card title="JavaScript UDFs inside FalkorDB" action={udfs?.libraries && <Chip tone="blue">{udfs.libraries.length} libraries</Chip>}>
        <p className="-mt-2 text-sm text-muted">FalkorDB&apos;s FLEX library and BankWeave&apos;s <span className="mono">aml_temporal</span> run in the engine&apos;s QuickJS runtime and walk the graph with <span className="mono">getNeighbors</span>.</p>
        <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
          {udfs?.libraries?.map((l: any) => <li key={l.library} className="rounded-full border border-line px-3 py-1"><span className="mono text-cyan">{l.library}</span> <span className="text-muted">{l.functions?.length} functions</span></li>)}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={btn.small} onClick={() => post("/lab/udf/load").then(setUdfs)}>Load / reload libraries</button>
          <button className={btn.small} onClick={() => post("/lab/run", { key: "udf_reach" }).then(setReach).catch((e) => setReach({ error: e.message }))}>Run time-respecting reach</button>
        </div>
        {reach && (reach.error ? <p className="mt-2 text-sm text-ring">{reach.error}</p> :
          <div className="mt-3 text-xs"><p className="text-muted">{reach.row_count} accounts reachable in time order from <span className="mono">{reach.params.id.slice(0, 8)}</span> ({reach.ms} ms)</p><Rows rows={reach.rows} /></div>)}
      </Card>
      <Card title="Single-pass tri-modal query" action={<button className={btn.small} onClick={() => post("/lab/run", { key: "trimodal" }).then(setTri).catch((e) => setTri({ error: e.message }))}>Run</button>}>
        <p className="-mt-2 text-sm text-muted">One Cypher statement: phonetic full-text finds a person by a misspelt name, the HNSW vector index finds accounts that behave like theirs, and <span className="mono">algo.SPpaths</span> shows how money connects them.</p>
        <div className="mt-3 flex flex-wrap gap-1.5"><Chip tone="blue">full-text</Chip><Chip tone="blue">vector (HNSW)</Chip><Chip tone="blue">algo.SPpaths</Chip></div>
        {tri && (tri.error ? <p className="mt-2 text-sm text-ring">{tri.error}</p> : <div className="mt-3 text-xs"><p className="text-muted">{tri.row_count} rows in {tri.ms} ms</p><Rows rows={tri.rows} /></div>)}
      </Card>
      <Card title="Per-bank access control (ACL)" className="lg:col-span-2"
        action={<button className={btn.small} onClick={() => post("/lab/acl-demo", { bank: "001" }).then(setAcl).catch((e) => setAcl({ error: e.message }))}>Run ACL demo</button>}>
        <p className="-mt-2 text-sm text-muted">Creates a user that may only <span className="mono">GRAPH.RO_QUERY</span> its own bank graph (<span className="mono">~bank_001</span>), proves the consortium, other banks and writes are denied, shows <span className="mono">ACL LOG</span>, then deletes the user.</p>
        {acl && (acl.supported === false ? <p className="mt-3 text-sm text-verify">{acl.note} ({acl.reason})</p> : acl.error ? <p className="mt-3 text-ring">{acl.error}</p> : (
          <div className="mt-4 grid gap-3 text-xs md:grid-cols-2">
            <ul className="space-y-1.5">{acl.attempts?.map((a: any, i: number) => (
              <li key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2">
                <Chip tone={a.allowed ? "ok" : "ring"}>{a.allowed ? "allowed" : "denied"}</Chip>
                <span>{a.write ? "write to" : "read"} <span className="mono">{a.graph}</span></span>
                <span className="text-muted">{a.allowed ? `(${a.accounts ?? "ok"} accounts)` : a.error}</span>
              </li>
            ))}</ul>
            <div><p className="mb-1 font-medium text-muted">ACL LOG</p><pre className={WELL}>{JSON.stringify(acl.acl_log, null, 2)}</pre></div>
          </div>
        ))}
      </Card>
    </section>
  );
}

function Memory() {
  const [m, setM] = useState<any>(null);
  useEffect(() => { live("/lab/memory").then(({ data }) => setM(data)).catch(() => setM({ procedures: [], episodic: [] })); }, []);
  if (!m) return <div className="grid gap-4">{[0, 1].map((i) => <div key={i} className="glass h-32 animate-pulse" />)}</div>;
  return (
    <section className="space-y-4">
      <Card title="Procedural memory" action={<Chip tone="ok">{m.procedures.length} procedure{m.procedures.length === 1 ? "" : "s"}</Chip>}>
        <p className="-mt-2 text-sm text-muted">When an analyst approves an action, the Archivist turns the tool sequence that produced the case into a reusable procedure in its own <span className="mono">procedures</span> graph, templated (<span className="mono">$seed</span>, <span className="mono">$hub</span>) so it applies to the next case of the same typology. Investigators load the best one before planning.</p>
        <div className="mt-4">
          {m.procedures.length ? <MemoryGraph procedures={m.procedures} /> : <Empty>No procedures yet: approve an action on the Approvals page and the Archivist will learn one.</Empty>}
        </div>
      </Card>
      <Card title="Episodic memory" action={<Chip tone="blue">{m.episodic.length} case timelines</Chip>}>
        <p className="-mt-2 text-sm text-muted">Each case keeps its own timeline (<span className="mono">HAD_EVENT</span> → <span className="mono">NEXT</span>): the record a resumed worker reads to continue, and the input to Replay.</p>
        <div className="mt-3 flex flex-wrap gap-1.5 text-xs">{m.episodic.slice(0, 24).map((e: any) => (
          <a key={e.case_id} href={`/cases/${e.case_id}`} className="rounded-full border border-line px-3 py-1 hover:border-cyan hover:text-cyan"><span className="mono">{e.case_id}</span> <span className="text-muted">{e.events} events</span></a>
        ))}</div>
        {!m.episodic.length && <Empty>No case timelines recorded yet.</Empty>}
      </Card>
    </section>
  );
}
