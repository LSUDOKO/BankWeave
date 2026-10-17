"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import EvidenceExplorer from "@/components/EvidenceExplorer";
import FreezeSim from "@/components/FreezeSim";
import SarView from "@/components/SarView";
import { Confidence, Pill, StateBadge } from "@/components/Trust";
import WeaveGraph from "@/components/WeaveGraph";
import { API, get, post, short } from "@/lib/api";
import { setBankOrder } from "@/lib/banks";
import { useLiveReload } from "@/lib/useEvents";

const ProvenanceDag = dynamic(() => import("@/components/ProvenanceDag"), { ssr: false, loading: () => <p className="text-muted">Loading DAG…</p> });
const Replay = dynamic(() => import("@/components/Replay"), { ssr: false });
const TraceWaterfall = dynamic(() => import("@/components/TraceWaterfall"), { ssr: false });

const KIND: Record<string, string> = { ring: "Ring", hub: "Hub", mule: "Mule", structuring: "Structuring", innocent: "Innocent explanation", layering: "Layering" };
const TABS = { claims: "Claims", evidence: "Evidence independence", dag: "Provenance DAG", replay: "Replay", sar: "Report", freeze: "Simulate freeze", trace: "Agent trace" } as const;
type Tab = keyof typeof TABS;

export default function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [c, setC] = useState<any>(null);
  const [graph, setGraph] = useState<any>(null);
  const [dag, setDag] = useState<any>(null);
  const [seal, setSeal] = useState<any>(null);
  const [banks, setBanks] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("claims");
  const [selClaim, setSelClaim] = useState<string | null>(null);
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [chain, setChain] = useState<any>(null);
  const [resume, setResume] = useState<any>(null);
  const [revoked, setRevoked] = useState<any>(null);
  const [version, setVersion] = useState(0);

  const load = useCallback(() => {
    get(`/cases/${id}`).then(setC).catch(() => setC({ error: true }));
    get(`/cases/${id}/graph`).then(setGraph).catch(() => {});
    get(`/cases/${id}/dag`).then(setDag).catch(() => {});
    get(`/cases/${id}/merkle`).then(setSeal).catch(() => {});
    setVersion((v) => v + 1);
  }, [id]);
  useEffect(() => { load(); get("/network/banks").then((b) => { setBankOrder(b.banks ?? []); setBanks(b.banks ?? []); }).catch(() => {}); }, [load]);
  useLiveReload(load, (e) => e.graph === `case_${id}` && e.type !== "agent_step");

  const evById = useMemo(() => new Map((c?.evidence ?? []).map((e: any) => [e.id, e])), [c]);
  const focus = useMemo(() => {
    if (!revoked || revoked.error) return undefined;
    return new Set<string>([revoked.evidence, ...revoked.claims, ...revoked.actions, ...revoked.sentences, ...revoked.sars]);
  }, [revoked]);
  function pickClaim(cl: any) {
    setSelClaim(cl.id);
    const accts = new Set<string>(cl.about ?? []);
    for (const eid of cl.evidence) for (const a of (evById.get(eid) as any)?.accounts ?? []) accts.add(a);
    setLit(accts);
    get(`/cases/${id}/claims/${cl.id}/evidence_chain`).then(setChain);
  }

  if (c?.error) return <p className="text-verify">Case {id} doesn&apos;t exist. <Link href="/cases" className="link">Back to cases</Link></p>;
  if (!c) return <p className="text-muted">Loading case…</p>;
  const nodes = (graph?.nodes ?? []).map((n: any) => ({ ...n, kind: "account", cases: [id] }));

  return (
    <div className="grid gap-8 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0">
        <p className="text-sm text-muted"><Link href="/cases" className="hover:text-paper">Cases</Link> / <span className="mono">{id}</span></p>
        <h1 className="mt-1">{c.case.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
          <Pill tone={c.case.status === "awaiting_approval" ? "verify" : "muted"}>{c.case.status.replace("_", " ")}</Pill>
          <span className="text-muted">Seed <span className="mono text-paper">{short(c.case.seed, 10)}</span> · alert <span className="mono">{c.case.alert}</span></span>
          {seal && <span className="badge text-cyan" title={`${seal.count} records sealed (${seal.algorithm})`}>Merkle {seal.root.slice(0, 12)}…</span>}
          <span className="ml-auto flex flex-wrap gap-2">
            <button onClick={() => get(`/cases/${id}/resume`).then(setResume)} className="rounded border border-line px-2.5 py-1 hover:border-cyan">Resume from graph</button>
            <button onClick={() => post(`/cases/${id}/rerun`).then(load)} className="rounded border border-line px-2.5 py-1 hover:border-cyan">Re-investigate</button>
            <a href={`${API}/cases/${id}/export/fincen.xml`} className="rounded border border-line px-2.5 py-1 hover:border-cyan">FinCEN-style XML</a>
            <Link href={`/cases/${id}/dossier`} className="rounded border border-line px-2.5 py-1 hover:border-cyan">Audit dossier</Link>
          </span>
        </div>
        {resume && <p className="mt-3 glass p-3 text-sm">{resume.text}</p>}
        {c.pending_tasks.length > 0 && <p className="mt-2 text-sm text-muted">Pending on the blackboard: {c.pending_tasks.map((t: any) => `${t.type} (${t.status})`).join(", ")}</p>}
        {revoked && !revoked.error && (
          <div className="mt-3 glass p-3 text-sm border-verify/60">
            <p><b className="text-ring">Evidence {revoked.evidence} superseded.</b> The cascade flagged {revoked.claims.length} claim(s), {revoked.actions.length} action(s) and {revoked.sentences.length} report sentence(s).</p>
            {revoked.changes?.map((ch: any) => (
              <p key={ch.claim} className="text-xs text-muted">{ch.claim}: {ch.state_before} → <span className="text-verify">{ch.state_after}</span>, confidence {Math.round((ch.confidence_before ?? 0) * 100)}% → {Math.round((ch.confidence_after ?? 0) * 100)}%</p>
            ))}
            {revoked.approval_locked?.length > 0 && <p className="mt-1 text-xs text-verify">Approval locked for {revoked.approval_locked.join(", ")} until an analyst writes an override note.</p>}
            <p className="mt-1 text-xs text-muted">Merkle root {revoked.merkle_before.slice(0, 12)}… → {revoked.merkle_after.slice(0, 12)}…: signatures over the old root no longer verify.</p>
          </div>
        )}

        <div className="mt-5">
          {graph && <WeaveGraph nodes={nodes} edges={graph.edges} banks={banks} highlight={lit} height={320} />}
          <p className="mt-1 text-xs text-muted">{nodes.length} accounts copied into graph <span className="mono">case_{id}</span>; algorithms run here, isolated from other cases.</p>
        </div>

        <div role="tablist" className="mt-6 flex flex-wrap gap-1 text-sm border-b border-line">
          {(Object.keys(TABS) as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`px-3 py-2 -mb-px border-b-2 ${tab === t ? "border-cyan text-paper" : "border-transparent text-muted hover:text-paper"}`}>
              {t === "claims" ? `Claims (${c.claims.length})` : TABS[t]}
            </button>
          ))}
        </div>

        {tab === "claims" && (
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <ul className="space-y-3">
              {c.claims.map((cl: any) => (
                <li key={cl.id}>
                  <button onClick={() => pickClaim(cl)} className={`w-full text-left glass p-3 ${selClaim === cl.id ? "border-cyan" : "hover:border-muted"} ${cl.kind === "innocent" ? "border-l-4 border-l-verify" : cl.kind === "ring" ? "border-l-4 border-l-ring" : ""}`}>
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
                        {e.cypher && <details className="mt-1"><summary className="text-xs text-muted cursor-pointer">Query that produced it</summary><pre className="mono mt-1 overflow-x-auto rounded bg-ink/70 p-2">{e.cypher}</pre></details>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
        {tab === "evidence" && <div className="mt-4"><EvidenceExplorer caseId={id} version={version} onRevoked={(r) => { setRevoked(r); load(); setTab("dag"); }} /></div>}
        {tab === "dag" && dag && (
          <div className="mt-4 space-y-2">
            <p className="text-sm text-muted">Claims rest on evidence (<span className="text-ok">SUPPORTED_BY</span>, <span className="text-verify">CHALLENGED_BY</span>), actions on claims (<span className="text-[var(--bank-1)]">JUSTIFIED_BY</span>), report sentences cite both. Evidence is stacked by origin so repeated paths to one fact sit together.{focus ? " Highlighted: what the last revocation reached." : ""}</p>
            <ProvenanceDag nodes={dag.nodes} edges={dag.edges} focus={focus} />
          </div>
        )}
        {tab === "replay" && <div className="mt-4"><Replay caseId={id} dag={dag} /></div>}
        {tab === "sar" && <div className="mt-4"><SarView caseId={id} version={version} onCite={(accts) => setLit(new Set(accts))} /></div>}
        {tab === "freeze" && <div className="mt-4"><FreezeSim caseId={id} accounts={nodes.map((n: any) => n.id)} /></div>}
        {tab === "trace" && <div className="mt-4"><TraceWaterfall caseId={id} /></div>}

        {c.actions.length > 0 && (
          <section className="mt-8">
            <h2>Proposed actions</h2>
            <ul className="mt-2 text-sm space-y-1">
              {c.actions.map((a: any) => <li key={a.id}>{a.kind.replace("_", " ")} <span className="text-muted">({a.status})</span> <StateBadge state={a.state} /> {a.rationale}</li>)}
            </ul>
            <Link href="/approvals" className="mt-2 inline-block text-sm link">Review in Approvals</Link>
          </section>
        )}
      </div>
      <ActivityFeed caseId={id} height="h-[80vh]" />
    </div>
  );
}
