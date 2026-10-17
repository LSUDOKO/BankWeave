"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import SarView from "@/components/SarView";
import { Confidence, Pill, StateBadge } from "@/components/Trust";
import WeaveGraph from "@/components/WeaveGraph";
import { get, post, short } from "@/lib/api";
import { setBankOrder } from "@/lib/banks";
import { useLiveReload } from "@/lib/useEvents";

const KIND: Record<string, string> = { ring: "Ring", hub: "Hub", mule: "Mule", structuring: "Structuring", innocent: "Innocent explanation", layering: "Layering" };

export default function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [c, setC] = useState<any>(null);
  const [graph, setGraph] = useState<any>(null);
  const [banks, setBanks] = useState<string[]>([]);
  const [tab, setTab] = useState<"claims" | "sar" | "timeline">("claims");
  const [selClaim, setSelClaim] = useState<string | null>(null);
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [chain, setChain] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [resume, setResume] = useState<any>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    get(`/cases/${id}`).then(setC).catch(() => setC({ error: true }));
    get(`/cases/${id}/graph`).then(setGraph).catch(() => {});
    setVersion((v) => v + 1);
  }, [id]);
  useEffect(() => { load(); get("/network/banks").then((b) => { setBankOrder(b.banks ?? []); setBanks(b.banks ?? []); }).catch(() => {}); }, [load]);
  useLiveReload(load, (e) => e.graph === `case_${id}` && e.type !== "agent_step");
  useEffect(() => { if (tab === "timeline") get(`/cases/${id}/timeline`).then((d) => setTimeline(d.events)); }, [tab, id, version]);

  const evById = useMemo(() => new Map((c?.evidence ?? []).map((e: any) => [e.id, e])), [c]);
  function pickClaim(cl: any) {
    setSelClaim(cl.id);
    const accts = new Set<string>(cl.about ?? []);
    for (const eid of cl.evidence) for (const a of (evById.get(eid) as any)?.accounts ?? []) accts.add(a);
    setLit(accts);
    get(`/cases/${id}/claims/${cl.id}/evidence_chain`).then(setChain);
  }

  if (c?.error) return <p className="text-verify">Case {id} doesn&apos;t exist. <Link href="/cases" className="underline">Back to cases</Link></p>;
  if (!c) return <p className="text-muted">Loading case…</p>;
  const nodes = (graph?.nodes ?? []).map((n: any) => ({ ...n, kind: "account", cases: [id] }));

  return (
    <div className="grid gap-8 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <p className="text-sm text-muted"><Link href="/cases" className="hover:text-paper">Cases</Link> / <span className="mono">{id}</span></p>
        <h1 className="mt-1">{c.case.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <Pill tone={c.case.status === "awaiting_approval" ? "verify" : "muted"}>{c.case.status.replace("_", " ")}</Pill>
          <span className="text-muted">Seed account <span className="mono text-paper">{short(c.case.seed, 10)}</span>, alert <span className="mono">{c.case.alert}</span></span>
          <button onClick={() => get(`/cases/${id}/resume`).then(setResume)} className="ml-auto rounded border border-line px-2.5 py-1 hover:border-paper">Resume from graph</button>
          <button onClick={() => post(`/cases/${id}/rerun`).then(load)} className="rounded border border-line px-2.5 py-1 hover:border-paper">Re-investigate</button>
        </div>
        {resume && <p className="mt-3 rounded bg-panel p-3 text-sm">{resume.text}</p>}
        {c.pending_tasks.length > 0 && <p className="mt-2 text-sm text-muted">Pending on the blackboard: {c.pending_tasks.map((t: any) => `${t.type} (${t.status})`).join(", ")}</p>}

        <div className="mt-5">
          {graph && <WeaveGraph nodes={nodes} edges={graph.edges} banks={banks} highlight={lit} height={360} />}
          <p className="mt-1 text-xs text-muted">{nodes.length} accounts copied into graph <span className="mono">case_{id}</span>; algorithms run here, isolated from other cases.</p>
        </div>

        <div role="tablist" className="mt-6 flex gap-2 text-sm border-b border-line">
          {(["claims", "sar", "timeline"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-3 py-2 -mb-px border-b-2 ${tab === t ? "border-paper text-paper" : "border-transparent text-muted hover:text-paper"}`}>
              {{ claims: `Claims (${c.claims.length})`, sar: "Report", timeline: "Timeline" }[t]}
            </button>
          ))}
        </div>

        {tab === "claims" && (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <ul className="space-y-3">
              {c.claims.map((cl: any) => (
                <li key={cl.id}>
                  <button onClick={() => pickClaim(cl)} className={`w-full text-left rounded-md border p-3 ${selClaim === cl.id ? "border-paper bg-panel-2" : "border-line hover:border-muted"} ${cl.kind === "innocent" ? "border-l-4 border-l-verify" : cl.kind === "ring" ? "border-l-4 border-l-ring" : ""}`}>
                    <div className="flex items-center gap-2 text-xs text-muted">{KIND[cl.kind] ?? cl.kind} by {cl.author} <span className="ml-auto"><StateBadge state={cl.state} /></span></div>
                    <p className="mt-1">{cl.text}</p>
                    <div className="mt-2"><Confidence confidence={cl.confidence} naive={cl.naive_confidence} paths={cl.paths} sources={cl.independent_sources} /></div>
                    {cl.challenges.length > 0 && <p className="mt-1 text-xs text-verify">Challenged by {cl.challenges.length} piece(s) of evidence</p>}
                  </button>
                </li>
              ))}
              {!c.claims.length && <li className="text-muted">No claims yet.</li>}
            </ul>
            <div className="text-sm">
              {!chain && <p className="text-muted">Select a claim to see the evidence chain an auditor would review.</p>}
              {chain && (
                <div>
                  <h3>Evidence chain</h3>
                  <ul className="mt-2 space-y-2">
                    {chain.evidence.map((e: any) => (
                      <li key={e.id} className={`border-l-2 pl-3 ${e.rel === "CHALLENGED_BY" ? "border-verify" : "border-line"}`}>
                        <p className={e.state === "superseded" ? "line-through text-muted" : ""}>{e.summary}</p>
                        <p className="text-xs text-muted"><span className="mono">{e.id}</span> · origin <span className="mono">{e.origin}</span> {e.rel === "CHALLENGED_BY" ? "· challenges" : ""} <StateBadge state={e.state} /></p>
                        {e.cypher && <details className="mt-1"><summary className="text-xs text-muted cursor-pointer">Query that produced it</summary><pre className="mono mt-1 overflow-x-auto rounded bg-panel p-2">{e.cypher}</pre></details>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {tab === "sar" && <div className="mt-4"><SarView caseId={id} version={version} onCite={(accts) => setLit(new Set(accts))} /></div>}
        {tab === "timeline" && (
          <ol className="mt-4 space-y-1.5 text-sm">
            {timeline.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="text-muted w-20 shrink-0">{new Date(e.ts).toLocaleTimeString()}</span>
                <span className="w-24 shrink-0 font-medium">{e.agent}</span>
                <span className="text-paper/85">{e.action.replace("tool:", "called ")}{e.payload?.summary ? ` (${e.payload.summary})` : ""}</span>
              </li>
            ))}
          </ol>
        )}

        {c.actions.length > 0 && (
          <section className="mt-8">
            <h2>Proposed actions</h2>
            <ul className="mt-2 text-sm space-y-1">
              {c.actions.map((a: any) => <li key={a.id}>{a.kind.replace("_", " ")} <span className="text-muted">({a.status})</span> <StateBadge state={a.state} /> {a.rationale}</li>)}
            </ul>
            <Link href="/approvals" className="mt-2 inline-block text-sm underline underline-offset-4">Review in Approvals</Link>
          </section>
        )}
      </div>
      <ActivityFeed caseId={id} height="h-[80vh]" />
    </div>
  );
}
