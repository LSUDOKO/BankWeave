"use client";
import { useCallback, useEffect, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import Icon from "@/components/Icon";
import { Card, Chip, PageHeader, StatCard, btn } from "@/components/ui";
import { get, post } from "@/lib/api";
import { useLiveReload } from "@/lib/useEvents";

type Task = { type: string; status: string; n: number };
type Status = {
  worker: { running: boolean; name?: string; processed?: number };
  blackboard: Task[];
  llm: { enabled: boolean; writer: string; auditor: string };
  graphs: { total: number; cases: number; banks?: string[] };
};

const warnBtn = "inline-flex items-center justify-center gap-2 rounded-full border-[1.5px] border-verify/70 px-4 py-2 text-sm font-semibold text-verify hover:bg-[#fff6e6] disabled:opacity-40";

export default function Demo() {
  const [s, setS] = useState<Status | null>(null);
  const [msg, setMsg] = useState("");
  const [running, setRunning] = useState<string | null>(null);
  const load = useCallback(() => { get("/demo/status").then(setS).catch(() => setS(null)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  useLiveReload(load, (e) => e.type === "worker");
  const act = async (path: string, body: unknown = {}, label = "") => {
    setMsg(`${label}…`); setRunning(label);
    try { const r = await post(path, body); setMsg(`${label}: done ${JSON.stringify(r).slice(0, 140)}`); }
    catch (e: unknown) { setMsg(`${label} failed: ${e instanceof Error ? e.message : String(e)}`); }
    setRunning(null);
    load();
  };
  const bb = s?.blackboard ?? [];
  const by = (st: string) => bb.filter((x) => x.status === st).reduce((n, x) => n + x.n, 0);
  const on = !!s?.worker.running;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Demo control"
        sub="Reset to a known state, run the agents, and crash them on purpose to show they resume from the graph."
        actions={<>
          <button onClick={load} className={btn.soft}><Icon name="refresh" className="size-4" strokeWidth={2.2} />Refresh</button>
          {on
            ? <button onClick={() => act("/demo/worker/kill", {}, "Kill agents")} className={btn.danger}>Kill agents</button>
            : <button onClick={() => act("/demo/worker/start", {}, "Start agents")} className={btn.primary}><Icon name="play" className="size-4" strokeWidth={2.2} />Start agents</button>}
        </>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard filled label="Agents" value={s ? (on ? "Running" : "Stopped") : "–"} chip={s?.worker.name ?? "worker"} sub={on ? "claiming tasks from the graph" : "no worker thread"} i={0} />
        <StatCard label="Tasks waiting / claimed" value={s ? `${by("todo")} / ${by("claimed")}` : "–"} chip={`${by("done").toLocaleString()} done`} sub="on the graph blackboard" i={1} />
        <StatCard label="Graphs in FalkorDB" value={s?.graphs.total ?? "–"} chip={`${s?.graphs.cases ?? 0} cases`} sub={s?.graphs.banks ? `${s.graphs.banks.length} bank graphs` : "bank and case graphs"} i={2} />
        <StatCard label="Reasoning" value={s ? (s.llm.enabled ? "LLM" : "Policy") : "–"} chip={s?.llm.enabled ? "LLM agents" : "Deterministic"} sub={s?.llm.enabled ? "writer and auditor models" : "no OpenRouter key set"} i={3} />
      </section>
      {s?.llm && (
        <p className="-mt-1 text-xs text-muted">Writer <span className="mono">{s.llm.writer.replace("openrouter/", "")}</span>; auditor <span className="mono">{s.llm.auditor.replace("openrouter/", "")}</span>{s.llm.enabled ? "" : " (no OpenRouter key set, using the deterministic policy)"}</p>
      )}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Step n={1} title="Reset" body="Drops every case graph and task, regenerates rule-based alerts. Transaction graphs stay.">
              <button onClick={() => act("/demo/reset", {}, "Reset")} className={btn.primary}><Icon name="refresh" className="size-4" strokeWidth={2.2} />Reset demo</button>
            </Step>
            <Step n={2} title="Run the agents" body="Starts Orchestrator, Triage, Investigator, Skeptic and Reporter threads that claim tasks from the graph blackboard.">
              <button onClick={() => act("/demo/worker/start", {}, "Start agents")} className={btn.primary}><Icon name="play" className="size-4" strokeWidth={2.2} />Start agents</button>
              <button onClick={() => act("/demo/stream", { rate_per_sec: 3, seconds: 60 }, "Stream alerts")} className={btn.ghost}>Stream alerts in gradually</button>
            </Step>
            <Step n={3} title="Red team, then hunt" body="Inject a new cross-bank ring that keeps every amount under the alert rules, so no alert fires. Then run hunt mode: motif seeds and shortest-path subgraphs find suspicious regions with no alert at all and hand them to the agents.">
              <button onClick={() => act("/demo/red_team", { size: 5 }, "Inject evasive ring")} className={btn.danger}>Inject evasive ring</button>
              <button onClick={() => act("/demo/red_team/smurf", {}, "Inject smurfing")} className={warnBtn}>Inject smurfing (25 transfers)</button>
              <button onClick={() => act("/demo/hunt", {}, "Hunt")} className={btn.ghost}><Icon name="search" className="size-4" strokeWidth={2.2} />Run hunt mode</button>
            </Step>
            <Step n={4} title="Kill and resume" body="Stops the agents mid-task without releasing their claims. Restart them: stale tasks are reset from their heartbeats and the work continues from the graph.">
              <button onClick={() => act("/demo/worker/kill", {}, "Kill agents")} className={btn.danger}>Kill agents</button>
              <button onClick={() => act("/demo/worker/start", {}, "Restart agents")} className={btn.ghost}>Restart agents</button>
            </Step>
          </div>

          <div className="fill-deep relative overflow-hidden rounded-[22px] p-5">
            <span className="lines" />
            <div className="relative flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-medium text-white">Last command</h2>
              {running && <span className="pulse-soft rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-sky">Running {running}</span>}
            </div>
            <p className="mono relative mt-3 min-h-[2.5rem] break-all text-sm text-white/80" aria-live="polite">{msg || "Nothing run yet. Responses from the API appear here."}</p>
          </div>

          <Blackboard tasks={bb} ready={!!s} />
        </div>

        <div className="glass p-5"><ActivityFeed height="max-h-[760px]" /></div>
      </section>
    </div>
  );
}

function Step({ n, title, body, children }: { n: number; title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="glass fade-up flex flex-col p-5" style={{ animationDelay: `${n * 60}ms` }}>
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-deep text-sm font-bold text-white">{n}</span>
        <h2 className="text-[17px] font-medium">{title}</h2>
      </div>
      <p className="mt-2 text-sm text-muted">{body}</p>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">{children}</div>
    </section>
  );
}

function Blackboard({ tasks, ready }: { tasks: Task[]; ready: boolean }) {
  const types = Object.entries(tasks.reduce<Record<string, Record<string, number>>>((m, t) => {
    const row = (m[t.type] ??= {});
    row[t.status] = (row[t.status] ?? 0) + t.n;
    return m;
  }, {})).map(([type, st]) => ({ type, st, total: Object.values(st).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...types.map((t) => t.total));
  const tone: Record<string, string> = { done: "bg-cyan", claimed: "bg-deep", todo: "hatch" };
  return (
    <Card title="Graph blackboard" action={<span className="text-xs text-muted">tasks by type since the last reset</span>}>
      {!ready ? <span className="block h-28 animate-pulse rounded-2xl bg-panel-2" /> : !types.length ? (
        <p className="text-sm text-muted">No tasks on the blackboard. Reset or start the agents to create some.</p>
      ) : (
        <ul className="space-y-3">
          {types.map(({ type, st, total }) => (
            <li key={type} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-3 text-sm">
              <span className="capitalize text-muted">{type}</span>
              <span className="flex h-3 overflow-hidden rounded-full bg-panel-2" style={{ width: `${Math.max(6, (total / max) * 100)}%` }}>
                {Object.entries(st).map(([k, v]) => (
                  <span key={k} title={`${k}: ${v}`} className={`h-full border-0 ${tone[k] ?? "bg-sky"}`} style={{ width: `${(v / total) * 100}%` }} />
                ))}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="kpi font-semibold">{total.toLocaleString()}</span>
                {Object.entries(st).filter(([k]) => k !== "done").map(([k, v]) => <Chip key={k} tone={k === "todo" ? "warn" : "blue"}>{v} {k}</Chip>)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 flex flex-wrap gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-cyan" />Done</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-full bg-deep" />Claimed</span>
        <span className="inline-flex items-center gap-1.5"><i className="hatch size-2.5 rounded-full" />Waiting</span>
      </p>
    </Card>
  );
}
