"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import ModeBadge from "@/components/ModeBadge";
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

export default function Lab() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Graphs");
  const [replay, setReplay] = useState(false);
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>FalkorDB Lab</h1>
          <p className="mt-1.5 max-w-[75ch] text-muted">
            The engine behind every agent decision, opened up: every graph in the instance, every algorithm and index the
            agents use, the execution plan of any read query, and every MCP tool the agents use.
          </p>
        </div>
        {replay && <ModeBadge mode="replay" />}
      </header>
      <div role="tablist" className="flex flex-wrap gap-2 text-sm">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 border ${tab === t ? "border-cyan text-paper bg-panel-2" : "border-line text-muted hover:text-paper"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Graphs" && <Graphs onReplay={setReplay} />}
      {tab === "Algorithms & indexes" && <Algorithms onReplay={setReplay} />}
      {tab === "Inspector" && <Inspector />}
      {tab === "MCP tools" && <Tools onReplay={setReplay} />}
      {tab === "Engine features" && <Features />}
      {tab === "Agent memory" && <Memory />}
    </div>
  );
}

const KIND_TONE: Record<string, string> = { consortium: "text-cyan", bank: "text-[var(--bank-1)]", case: "text-verify", system: "text-muted" };

function Graphs({ onReplay }: { onReplay: (b: boolean) => void }) {
  const [gs, setGs] = useState<Graph[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { live<{ graphs: Graph[] }>("/lab/graphs").then(({ data, replay }) => { setGs(data.graphs); onReplay(replay); }); }, [onReplay]);
  const totals = useMemo(() => (gs ?? []).reduce((a, g) => ({ n: a.n + (g.nodes || 0), e: a.e + (g.edges || 0) }), { n: 0, e: 0 }), [gs]);
  return (
    <section className="glass p-4">
      <h2>One instance, many graphs</h2>
      <p className="mt-1 text-sm text-muted">
        {gs ? `${gs.length} graphs · ${totals.n.toLocaleString()} nodes · ${totals.e.toLocaleString()} edges. ` : "Loading… "}
        A bank only sees its own graph; the consortium holds hashed ids for everyone; each case gets its own graph.
      </p>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-muted">
          <tr className="border-b border-line">
            <th className="py-2 pr-3 font-normal">Graph</th><th className="py-2 pr-3 font-normal text-right">Nodes</th>
            <th className="py-2 pr-3 font-normal text-right">Edges</th><th className="py-2 pr-3 font-normal text-right">Indexes</th>
            <th className="py-2 font-normal text-right">Memory</th>
          </tr>
        </thead>
        <tbody>
          {gs?.map((g) => (
            <Fragment key={g.name}>
              <tr className="border-b border-line/50 hover:bg-panel-2/40 cursor-pointer" onClick={() => setOpen(open === g.name ? null : g.name)}>
                <td className="py-1.5 pr-3"><span className={`mono ${KIND_TONE[g.kind]}`}>{g.name}</span> <span className="text-xs text-muted">{g.kind}</span></td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{g.nodes?.toLocaleString()}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{g.edges?.toLocaleString()}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{g.indexes?.length ?? 0}</td>
                <td className="py-1.5 text-right tabular-nums text-muted">{g.memory_mb == null ? "–" : g.memory_mb < 1 ? "<1" : g.memory_mb} MB</td>
              </tr>
              {open === g.name && (
                <tr><td colSpan={5} className="pb-3">
                  <div className="glass-2 p-3 text-xs grid gap-2 md:grid-cols-3">
                    <div><p className="text-muted mb-1">Labels</p><p className="mono">{g.labels?.join(", ")}</p></div>
                    <div><p className="text-muted mb-1">Relationships</p><p className="mono">{g.relationships?.join(", ")}</p></div>
                    <div><p className="text-muted mb-1">Indexes</p>
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
    </section>
  );
}

const FAMILY: Record<string, string> = { algorithm: "Native algorithm", index: "Index", udf: "JS UDF", query: "Composite query" };

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
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Each run executes live through <span className="mono">GRAPH.RO_QUERY</span> with defaults picked from the graph itself.</p>
        <button onClick={runAll} disabled={!!busy} className="rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1.5 text-sm disabled:opacity-50">Run all {algos.length}</button>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {algos.map((a) => {
          const r = res[a.key];
          return (
            <article key={a.key} className="glass p-4 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium text-muted">{FAMILY[a.family]}</p>
                  <h3 className="mt-0.5">{a.title}</h3>
                </div>
                <button onClick={() => run(a.key)} disabled={busy === a.key}
                  className="shrink-0 rounded-md border border-line px-2.5 py-1 text-xs hover:border-cyan disabled:opacity-50">
                  {busy === a.key ? "Running…" : "Run"}
                </button>
              </div>
              <pre className="mt-2 max-h-28 overflow-auto scroll-thin rounded bg-ink/70 p-2 text-[11px] leading-snug text-paper/80 mono">{a.cypher.trim()}</pre>
              {r?.error && <p className="mt-2 text-sm text-ring">{r.error}</p>}
              {r && !r.error && (
                <div className="mt-2 text-xs">
                  <p className="text-muted"><span className="text-ok">{r.row_count} rows</span> in <span className="text-paper">{r.ms} ms</span> on <span className="mono text-cyan">{r.graph}</span></p>
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
  if (!rows?.length) return <p className="mt-1 text-muted">No rows.</p>;
  const cols = Object.keys(rows[0]);
  const fmt = (v: any) => (Array.isArray(v) ? `[${v.slice(0, 4).map((x) => (typeof x === "string" ? x.slice(0, 8) : JSON.stringify(x))).join(", ")}${v.length > 4 ? ", …" : ""}]`
    : typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(4)) : typeof v === "string" ? v.slice(0, 40) : JSON.stringify(v));
  return (
    <div className="mt-1 max-h-40 overflow-auto scroll-thin">
      <table className="w-full mono text-[11px]">
        <thead className="text-muted text-left"><tr>{cols.map((c) => <th key={c} className="pr-2 font-normal">{c}</th>)}</tr></thead>
        <tbody>{rows.slice(0, 8).map((r, i) => <tr key={i}>{cols.map((c) => <td key={c} className="pr-2 align-top">{String(fmt(r[c]))}</td>)}</tr>)}</tbody>
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

function Inspector() {
  const [graph, setGraph] = useState("consortium");
  const [cypher, setCypher] = useState(SAMPLES[1][2]);
  const [mode, setMode] = useState<"profile" | "explain">("profile");
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cases, setCases] = useState<string[]>([]);
  useEffect(() => { live<{ graphs: Graph[] }>("/lab/graphs").then(({ data }) => setCases(data.graphs.map((g) => g.name))).catch(() => {}); }, []);
  const go = async () => {
    setErr(null); setOut(null);
    try { setOut(await post("/lab/inspect", { graph, cypher, mode })); } catch (e: any) { setErr(e.data?.detail ?? e.message); }
  };
  const plan: PlanNode[] = out?.[mode] ?? out?.explain ?? [];
  const maxMs = Math.max(0.001, ...plan.map((n) => n.ms ?? 0));
  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="glass p-4 space-y-3">
        <h2>GRAPH.PROFILE / GRAPH.EXPLAIN</h2>
        <p className="text-sm text-muted">Read-only: the query must pass <span className="mono">GRAPH.RO_QUERY</span> (FalkorDB rejects writes there) before it is profiled.</p>
        <div className="flex flex-wrap gap-2 text-xs">
          {SAMPLES.map(([t, g, c]) => (
            <button key={t} onClick={() => { setCypher(c); setGraph(g || cases.find((x) => x.startsWith("case_")) || "consortium"); }}
              className="rounded border border-line px-2 py-1 hover:border-cyan">{t}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <select value={graph} onChange={(e) => setGraph(e.target.value)} className="rounded bg-ink border border-line px-2 py-1 text-sm mono">
            {(cases.length ? cases : ["consortium"]).map((g) => <option key={g}>{g}</option>)}
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="rounded bg-ink border border-line px-2 py-1 text-sm">
            <option value="profile">PROFILE (runs it)</option><option value="explain">EXPLAIN (plan only)</option>
          </select>
          <button onClick={go} className="ml-auto rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1 text-sm">Inspect</button>
        </div>
        <textarea value={cypher} onChange={(e) => setCypher(e.target.value)} rows={7}
          className="w-full rounded bg-ink border border-line p-2 mono text-xs" spellCheck={false} />
        {err && <p className="text-ring text-sm">{err}</p>}
      </div>
      <div className="glass p-4">
        <h2>Execution plan</h2>
        {!out && <p className="mt-2 text-sm text-muted">Run a query to see its operator tree, rows per operator and time.</p>}
        {out && (
          <>
            <p className="mt-1 text-xs text-muted">{out.rows} rows · RO_QUERY {out.ro_query_ms} ms · graph {out.memory?.total_graph_sz_mb} MB (indexes {out.memory?.indices_sz_mb} MB)</p>
            <ol className="mt-3 space-y-1 text-xs">
              {plan.map((n, i) => (
                <li key={i} style={{ paddingLeft: n.depth * 16 }}>
                  <div className="glass-2 px-2 py-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-paper">{n.op}</span>
                      {n.ms != null && <span className="mono text-muted">{n.records} rows · {n.ms.toFixed(3)} ms</span>}
                    </div>
                    {n.detail && <p className="mono text-cyan/90 break-all">{n.detail}</p>}
                    {n.ms != null && <div className="mt-1 h-1 rounded bg-panel"><div className="h-1 rounded bg-verify" style={{ width: `${(n.ms / maxMs) * 100}%` }} /></div>}
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

const MODE_TONE: Record<string, string> = { "read-only": "text-ok", "records evidence": "text-verify", mutating: "text-ring" };

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
      <div className="glass p-3">
        <div className="flex flex-wrap gap-1.5 text-xs">
          {["all", "read-only", "records evidence", "mutating"].map((m) => (
            <button key={m} onClick={() => setFilter(m)} className={`rounded px-2 py-1 border ${filter === m ? "border-cyan" : "border-line text-muted"}`}>
              {m} {m === "all" ? ts.length : counts[m] ?? 0}
            </button>
          ))}
        </div>
        <ul className="mt-2 max-h-[60vh] overflow-y-auto scroll-thin text-sm">
          {ts.filter((t) => filter === "all" || t.mode === filter).map((t) => (
            <li key={t.name}>
              <button onClick={() => pick(t)} className={`w-full text-left rounded px-2 py-1.5 hover:bg-panel-2 ${sel?.name === t.name ? "bg-panel-2" : ""}`}>
                <span className="mono">{t.name}</span> <span className={`text-[10px] ${MODE_TONE[t.mode]}`}>{t.mode}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="glass p-4 min-w-0">
        {!sel ? <p className="text-muted text-sm">The same tools the agents call are served over MCP (Claude Desktop can use them). Pick one to see its schema and run it live; nothing is recorded.</p> : (
          <>
            <div className="flex items-center gap-2"><h2 className="mono">{sel.name}</h2><span className={`badge ${MODE_TONE[sel.mode]}`}>{sel.mode}</span></div>
            <p className="mt-1 text-sm text-paper/85">{sel.description}</p>
            <p className="mt-1 text-xs text-muted">Used by: {sel.agents.join(", ")}</p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div><p className="text-xs text-muted mb-1">Input schema</p><pre className="rounded bg-ink/70 p-2 text-[11px] mono overflow-auto max-h-48">{JSON.stringify(sel.input_schema, null, 2)}</pre></div>
              <div><p className="text-xs text-muted mb-1">Arguments</p>
                <textarea value={args} onChange={(e) => setArgs(e.target.value)} rows={8} className="w-full rounded bg-ink border border-line p-2 mono text-[11px]" />
                <button onClick={run} disabled={sel.mode === "mutating"} className="mt-1 rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1 text-sm disabled:opacity-40">Run live</button>
              </div>
            </div>
            {out && (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div><p className="text-xs text-muted mb-1">Payload {out.ms != null && `(${out.ms} ms)`}</p><pre className="rounded bg-ink/70 p-2 text-[11px] mono overflow-auto max-h-72">{JSON.stringify(out.error ?? out.result ?? out, null, 2).slice(0, 6000)}</pre></div>
                <div><p className="text-xs text-muted mb-1">Cypher it ran</p><pre className="rounded bg-ink/70 p-2 text-[11px] mono overflow-auto max-h-72 text-cyan/90">{typeof out.cypher === "string" ? out.cypher : JSON.stringify(out.cypher, null, 2)}</pre>
                  {typeof out.cypher === "string" && <button onClick={runXray} className="mt-1 rounded border border-line px-2 py-0.5 text-xs hover:border-cyan">Engine X-Ray (PROFILE + memory)</button>}
                </div>
              </div>
            )}
            {xray && (xray.error ? <p className="mt-2 text-sm text-ring">{xray.error}</p> : (
              <div className="mt-3 glass-2 p-3 text-xs">
                <p className="text-muted">{xray.rows} rows · RO_QUERY {xray.ro_query_ms} ms · graph <span className="mono">{xray.graph}</span> {xray.memory?.total_graph_sz_mb} MB, indexes {xray.memory?.indices_sz_mb} MB</p>
                <ol className="mt-1 space-y-0.5 mono">{(xray.profile ?? []).map((n: any, i: number) => (
                  <li key={i} style={{ paddingLeft: n.depth * 14 }}>{n.op} <span className="text-cyan/80">{n.detail}</span> <span className="text-muted">{n.records} rows · {n.ms?.toFixed(3)} ms</span></li>
                ))}</ol>
              </div>
            ))}
          </>
        )}
      </div>
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
      <div className="glass p-4">
        <h2>JavaScript UDFs inside FalkorDB</h2>
        <p className="mt-1 text-sm text-muted">FalkorDB&apos;s FLEX library and BankWeave&apos;s <span className="mono">aml_temporal</span> run in the engine&apos;s QuickJS runtime and walk the graph with <span className="mono">getNeighbors</span>.</p>
        <ul className="mt-2 text-xs space-y-1">
          {udfs?.libraries?.map((l: any) => <li key={l.library}><span className="mono text-cyan">{l.library}</span> <span className="text-muted">{l.functions?.length} functions</span></li>)}
        </ul>
        <div className="mt-2 flex gap-2">
          <button className="rounded border border-line px-2.5 py-1 text-xs hover:border-cyan" onClick={() => post("/lab/udf/load").then(setUdfs)}>Load / reload libraries</button>
          <button className="rounded border border-line px-2.5 py-1 text-xs hover:border-cyan" onClick={() => post("/lab/run", { key: "udf_reach" }).then(setReach).catch((e) => setReach({ error: e.message }))}>Run time-respecting reach</button>
        </div>
        {reach && (reach.error ? <p className="mt-2 text-ring text-sm">{reach.error}</p> :
          <div className="mt-2 text-xs"><p className="text-muted">{reach.row_count} accounts reachable in time order from <span className="mono">{reach.params.id.slice(0, 8)}</span> ({reach.ms} ms)</p><Rows rows={reach.rows} /></div>)}
      </div>
      <div className="glass p-4">
        <h2>Single-pass tri-modal query</h2>
        <p className="mt-1 text-sm text-muted">One Cypher statement: phonetic full-text finds a person by a misspelt name, the HNSW vector index finds accounts that behave like theirs, and <span className="mono">algo.SPpaths</span> shows how money connects them.</p>
        <button className="mt-2 rounded border border-line px-2.5 py-1 text-xs hover:border-cyan" onClick={() => post("/lab/run", { key: "trimodal" }).then(setTri).catch((e) => setTri({ error: e.message }))}>Run</button>
        {tri && (tri.error ? <p className="mt-2 text-ring text-sm">{tri.error}</p> : <div className="mt-2 text-xs"><p className="text-muted">{tri.row_count} rows in {tri.ms} ms</p><Rows rows={tri.rows} /></div>)}
      </div>
      <div className="glass p-4 lg:col-span-2">
        <h2>Per-bank access control (ACL)</h2>
        <p className="mt-1 text-sm text-muted">Creates a user that may only <span className="mono">GRAPH.RO_QUERY</span> its own bank graph (<span className="mono">~bank_001</span>), proves the consortium, other banks and writes are denied, shows <span className="mono">ACL LOG</span>, then deletes the user.</p>
        <button className="mt-2 rounded border border-line px-2.5 py-1 text-xs hover:border-cyan" onClick={() => post("/lab/acl-demo", { bank: "001" }).then(setAcl).catch((e) => setAcl({ error: e.message }))}>Run ACL demo</button>
        {acl && (acl.supported === false ? <p className="mt-2 text-sm text-verify">{acl.note} ({acl.reason})</p> : acl.error ? <p className="mt-2 text-ring">{acl.error}</p> : (
          <div className="mt-2 grid gap-3 md:grid-cols-2 text-xs">
            <ul className="space-y-1">{acl.attempts?.map((a: any, i: number) => (
              <li key={i} className={a.allowed ? "text-ok" : "text-ring"}>{a.allowed ? "✓" : "✗"} {a.write ? "write to" : "read"} <span className="mono">{a.graph}</span> {a.allowed ? `(${a.accounts ?? "ok"} accounts)` : `: ${a.error}`}</li>
            ))}</ul>
            <div><p className="text-muted mb-1">ACL LOG</p><pre className="rounded bg-ink/70 p-2 mono text-[11px]">{JSON.stringify(acl.acl_log, null, 2)}</pre></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Memory() {
  const [m, setM] = useState<any>(null);
  useEffect(() => { live("/lab/memory").then(({ data }) => setM(data)).catch(() => setM({ procedures: [], episodic: [] })); }, []);
  if (!m) return <p className="text-muted">Loading memory…</p>;
  return (
    <section className="space-y-4">
      <div className="glass p-4 text-sm">
        <h2>Procedural memory</h2>
        <p className="mt-1 text-muted">When an analyst approves an action, the Archivist turns the tool sequence that produced the case into a reusable procedure in its own <span className="mono">procedures</span> graph, templated (<span className="mono">$seed</span>, <span className="mono">$hub</span>) so it applies to the next case of the same typology. Investigators load the best one before planning.</p>
      </div>
      {m.procedures.length ? <MemoryGraph procedures={m.procedures} /> : <p className="text-muted text-sm">No procedures yet: approve an action on the Approvals page and the Archivist will learn one.</p>}
      <div className="glass p-4 text-sm">
        <h2>Episodic memory</h2>
        <p className="mt-1 text-muted">Each case keeps its own timeline (<span className="mono">HAD_EVENT</span> → <span className="mono">NEXT</span>): the record a resumed worker reads to continue, and the input to Replay.</p>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{m.episodic.slice(0, 24).map((e: any) => (
          <a key={e.case_id} href={`/cases/${e.case_id}`} className="glass-2 px-2 py-1 hover:border-cyan"><span className="mono">{e.case_id}</span> <span className="text-muted">{e.events} events</span></a>
        ))}</div>
      </div>
    </section>
  );
}
