"use client";
import { useCallback, useEffect, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import { get, post } from "@/lib/api";
import { useLiveReload } from "@/lib/useEvents";

export default function Demo() {
  const [s, setS] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(() => { get("/demo/status").then(setS).catch(() => setS(null)); }, []);
  useEffect(() => { load(); const t = setInterval(load, 3000); return () => clearInterval(t); }, [load]);
  useLiveReload(load, (e) => e.type === "worker");
  const act = async (path: string, body: any = {}, label = "") => {
    setMsg(`${label}…`);
    try { const r = await post(path, body); setMsg(`${label}: done ${JSON.stringify(r).slice(0, 140)}`); }
    catch (e: any) { setMsg(`${label} failed: ${e.message}`); }
    load();
  };
  const bb = (s?.blackboard ?? []) as any[];
  const by = (st: string) => bb.filter((x) => x.status === st).reduce((n, x) => n + x.n, 0);
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="max-w-3xl">
        <h1>Demo control</h1>
        <p className="mt-2 text-muted">Reset to a known state, run the agents, and crash them on purpose to show they resume from the graph.</p>
        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-6 text-sm">
          <div><dt className="text-muted">Agents</dt><dd className={`text-lg ${s?.worker.running ? "text-ok" : "text-verify"}`}>{s?.worker.running ? "Running" : "Stopped"}</dd></div>
          <div><dt className="text-muted">Tasks waiting / claimed</dt><dd className="text-lg">{by("todo")} / {by("claimed")}</dd></div>
          <div><dt className="text-muted">Graphs in FalkorDB</dt><dd className="text-lg">{s?.graphs.total ?? "—"} <span className="text-muted text-sm">({s?.graphs.cases ?? 0} cases)</span></dd></div>
          <div><dt className="text-muted">Reasoning</dt><dd className="text-lg">{s?.llm.enabled ? "LLM agents" : "Deterministic"}</dd></div>
        </dl>
        {s?.llm && <p className="mt-2 text-xs text-muted">Writer {s.llm.writer.replace("openrouter/", "")}; auditor {s.llm.auditor.replace("openrouter/", "")}{s.llm.enabled ? "" : " (no OpenRouter key set, using the deterministic policy)"}</p>}

        <div className="mt-8 space-y-6">
          <Step title="Reset" body="Drops every case graph and task, regenerates rule-based alerts. Transaction graphs stay.">
            <button onClick={() => act("/demo/reset", {}, "Reset")} className="btn">Reset demo</button>
          </Step>
          <Step title="Run the agents" body="Starts Orchestrator, Triage, Investigator, Skeptic and Reporter threads that claim tasks from the graph blackboard.">
            <button onClick={() => act("/demo/worker/start", {}, "Start agents")} className="btn">Start agents</button>
            <button onClick={() => act("/demo/stream", { rate_per_sec: 3, seconds: 60 }, "Stream alerts")} className="btn-quiet">Stream alerts in gradually</button>
          </Step>
          <Step title="Kill and resume" body="Stops the agents mid-task without releasing their claims. Restart them: stale tasks are reset from their heartbeats and the work continues from the graph.">
            <button onClick={() => act("/demo/worker/kill", {}, "Kill agents")} className="rounded border border-ring text-ring px-3 py-1.5">Kill agents</button>
            <button onClick={() => act("/demo/worker/start", {}, "Restart agents")} className="btn-quiet">Restart agents</button>
          </Step>
        </div>
        {msg && <p className="mt-6 text-sm text-muted mono break-all" aria-live="polite">{msg}</p>}
        <style>{`.btn{border-radius:.25rem;background:var(--paper);color:var(--ink);padding:.375rem .75rem;font-weight:500}.btn-quiet{border-radius:.25rem;border:1px solid var(--line);padding:.375rem .75rem}.btn-quiet:hover{border-color:var(--paper)}`}</style>
      </div>
      <ActivityFeed />
    </div>
  );
}

function Step({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="border-l-2 border-line pl-4">
      <h2>{title}</h2>
      <p className="mt-1 text-sm text-muted max-w-[60ch]">{body}</p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">{children}</div>
    </section>
  );
}
