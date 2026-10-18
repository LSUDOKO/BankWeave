"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import ActivityFeed from "@/components/ActivityFeed";
import EvidenceExplorer from "@/components/EvidenceExplorer";
import FreezeSim from "@/components/FreezeSim";
import Icon from "@/components/Icon";
import SarView from "@/components/SarView";
import { Confidence, StateBadge } from "@/components/Trust";
import WeaveGraph from "@/components/WeaveGraph";
import { Card, Chip, Empty, PageHeader, StatCard, Tabs, btn, stateTone } from "@/components/ui";
import { API, get, post, short } from "@/lib/api";
import { setBankOrder } from "@/lib/banks";
import { useLiveReload } from "@/lib/useEvents";

const ProvenanceDag = dynamic(() => import("@/components/ProvenanceDag"), { ssr: false, loading: () => <p className="text-muted">Loading DAG…</p> });
const Replay = dynamic(() => import("@/components/Replay"), { ssr: false });
const TraceWaterfall = dynamic(() => import("@/components/TraceWaterfall"), { ssr: false });
const HardwareSignModal = dynamic(() => import("@/components/HardwareSignModal"), { ssr: false });
const TimeMachine = dynamic(() => import("@/components/TimeMachine"), { ssr: false });
const Screening = dynamic(() => import("@/components/Screening"), { ssr: false });

const KIND: Record<string, string> = { ring: "Ring", hub: "Hub", mule: "Mule", structuring: "Structuring", innocent: "Innocent explanation", layering: "Layering" };
const TABS = { claims: "Claims", evidence: "Evidence independence", dag: "Provenance DAG", replay: "Replay", time: "Time machine", sar: "Report", freeze: "Simulate freeze", screening: "Sanctions", trace: "Agent trace" } as const;
type Tab = keyof typeof TABS;

export default function CaseWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [c, setC] = useState<any>(null);
  const [graph, setGraph] = useState<any>(null);
  const [dag, setDag] = useState<any>(null);
  const [seal, setSeal] = useState<any>(null);
  const [hwSeal, setHwSeal] = useState<any>(null);
  const [signing, setSigning] = useState(false);
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
    get(`/hardware/seal/${id}`).then(setHwSeal).catch(() => {});
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

  if (c?.error) return (
    <div className="space-y-5">
      <PageHeader crumb={<Link href="/cases" className="hover:text-paper">Cases</Link>} title="Case not found" />
      <Empty action={<Link href="/cases" className={btn.ghost}>Back to cases</Link>}>Case <span className="mono">{id}</span> doesn&apos;t exist.</Empty>
    </div>
  );
  if (!c) return (
    <div className="space-y-5">
      <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-white" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="glass h-36 animate-pulse" />)}</div>
      <div className="glass h-80 animate-pulse" />
      <p className="text-sm text-muted">Loading case…</p>
    </div>
  );
  const nodes = (graph?.nodes ?? []).map((n: any) => ({ ...n, kind: "account", cases: [id] }));
  const activeClaims = c.claims.filter((cl: any) => (cl.state ?? "active") === "active").length;
  const origins = new Set(c.evidence.map((e: any) => e.origin)).size;
  const caseBanks: string[] = c.case.banks ?? [];

  return (
    <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-5">
        <PageHeader
          crumb={<><Link href="/cases" className="hover:text-paper">Cases</Link> / <span className="mono">{id}</span></>}
          title={<span className="block max-w-[34ch]">{c.case.title}</span>}
          sub={<>Seed <span className="mono text-paper">{short(c.case.seed, 10)}</span> · alert <span className="mono">{c.case.alert}</span>{caseBanks.length ? ` · banks ${caseBanks.join(", ")}` : ""}</>}
          actions={<>
            {c.actions.length > 0 && <button onClick={() => setSigning(true)} className={btn.primary}><Icon name="approve" className="size-4" strokeWidth={2.2} />Sign &amp; approve with hardware key</button>}
            <Link href={`/cases/${id}/dossier`} className={btn.ghost}><Icon name="doc" className="size-4" />Audit dossier</Link>
          </>}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={stateTone(c.case.status)}>{c.case.status.replace(/_/g, " ")}</Chip>
          {seal && <Chip tone="blue"><span title={`${seal.count} records sealed (${seal.algorithm})`}>Merkle <span className="mono">{seal.root.slice(0, 12)}…</span></span></Chip>}
          {hwSeal?.attestations?.length > 0 && (hwSeal.broken.length
            ? <Chip tone="ring" className="pulse-soft"><span title="Evidence changed after the hardware signature">Hardware Merkle seal broken · re-attestation required</span></Chip>
            : <Chip tone="ok"><span title={`${hwSeal.attestations.length} hardware signature(s) over the current root`}>Hardware-sealed ({hwSeal.attestations[0].method})</span></Chip>)}
          <span className="ml-auto flex flex-wrap gap-2">
            <button onClick={() => get(`/cases/${id}/resume`).then(setResume)} className={btn.soft}><Icon name="play" className="size-4" />Resume from graph</button>
            <button onClick={() => post(`/cases/${id}/rerun`).then(load)} className={btn.soft}><Icon name="refresh" className="size-4" />Re-investigate</button>
            <a href={`${API}/cases/${id}/export/fincen.xml`} className={btn.soft}><Icon name="doc" className="size-4" />FinCEN-style XML</a>
          </span>
        </div>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard filled i={0} label="Claims" value={c.claims.length} chip={`${activeClaims} active`} sub="written by the agents" />
          <StatCard i={1} label="Evidence" value={c.evidence.length} chip={`${origins} origins`} sub="items behind the claims" />
          <StatCard i={2} label="Accounts" value={graph ? nodes.length : "–"} chip={`${caseBanks.length} bank${caseBanks.length === 1 ? "" : "s"}`} sub={<>in graph <span className="mono">case_{id}</span></>} />
          <StatCard i={3} label="Actions" value={c.actions.length} chip={`${c.pending_tasks.length} tasks pending`} sub="proposed by the agents" href="/approvals" />
        </section>

        {resume && <Card title="Resumed from the graph" action={<button onClick={() => setResume(null)} className="text-xs text-muted hover:text-paper">Dismiss</button>}><p className="-mt-2 text-sm">{resume.text}</p></Card>}
        {c.pending_tasks.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">Pending on the blackboard:
            {c.pending_tasks.map((t: any, i: number) => <Chip key={i} tone="warn">{t.type} ({t.status})</Chip>)}
          </p>
        )}
        {revoked && !revoked.error && (
          <section className="glass relative overflow-hidden p-5 text-sm">
            <span className="absolute inset-y-0 left-0 w-1.5 bg-ring" />
            <p><b className="text-ring">Evidence {revoked.evidence} superseded.</b> The cascade flagged {revoked.claims.length} claim(s), {revoked.actions.length} action(s) and {revoked.sentences.length} report sentence(s).</p>
            <div className="mt-2 space-y-1">
              {revoked.changes?.map((ch: any) => (
                <p key={ch.claim} className="text-xs text-muted"><span className="mono">{ch.claim}</span>: {ch.state_before} → <span className="text-verify">{ch.state_after}</span>, confidence {Math.round((ch.confidence_before ?? 0) * 100)}% → {Math.round((ch.confidence_after ?? 0) * 100)}%</p>
              ))}
            </div>
            {revoked.approval_locked?.length > 0 && <p className="mt-2 rounded-xl bg-[#fff6e6] px-3 py-1.5 text-xs text-verify">Approval locked for {revoked.approval_locked.join(", ")} until an analyst writes an override note.</p>}
            <p className="mt-2 text-xs text-muted">Merkle root <span className="mono">{revoked.merkle_before.slice(0, 12)}…</span> → <span className="mono">{revoked.merkle_after.slice(0, 12)}…</span>: signatures over the old root no longer verify.</p>
          </section>
        )}

        <Card title="Case graph" action={<span className="text-xs text-muted">{lit.size ? `${lit.size} account${lit.size === 1 ? "" : "s"} highlighted` : "select a claim or report sentence to highlight"}</span>}>
          <div className="overflow-hidden rounded-2xl border border-line">
            {graph
              ? <WeaveGraph nodes={nodes} edges={graph.edges} banks={banks} highlight={lit} height={320} />
              : <div className="hatch grid h-[320px] place-items-center text-sm text-muted"><span className="rounded-full bg-white px-3 py-1">Loading graph…</span></div>}
          </div>
          <p className="mt-2 text-xs text-muted">{nodes.length} accounts copied into graph <span className="mono">case_{id}</span>; algorithms run here, isolated from other cases.</p>
        </Card>

        <div className="overflow-x-auto pb-1">
          <Tabs value={tab} onChange={setTab} items={(Object.keys(TABS) as Tab[]).map((t) => [t, t === "claims" ? `Claims (${c.claims.length})` : TABS[t]] as [Tab, string])} />
        </div>

        {tab === "claims" && (
          <div className="grid gap-4 lg:grid-cols-2">
            <ul className="space-y-3">
              {c.claims.map((cl: any) => (
                <li key={cl.id}>
                  <button onClick={() => pickClaim(cl)}
                    className={`glass relative block w-full overflow-hidden p-4 pl-5 text-left transition-transform hover:-translate-y-0.5 ${selClaim === cl.id ? "outline-2 outline-offset-0 outline-cyan" : ""}`}>
                    <span className={`absolute inset-y-0 left-0 w-1.5 ${cl.kind === "innocent" ? "bg-verify" : cl.kind === "ring" ? "bg-ring" : "bg-sky"}`} />
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                      <Chip tone={cl.kind === "innocent" ? "warn" : cl.kind === "ring" ? "ring" : "blue"}>{KIND[cl.kind] ?? cl.kind}</Chip>
                      <span>by {cl.author}</span>
                      <span className="ml-auto"><StateBadge state={cl.state} /></span>
                    </div>
                    <p className="mt-2 text-[15px] leading-snug">{cl.text}</p>
                    <div className="mt-3"><Confidence confidence={cl.confidence} naive={cl.naive_confidence} paths={cl.paths} sources={cl.independent_sources} /></div>
                    {cl.challenges.length > 0 && <p className="mt-2 text-xs text-verify">Challenged by {cl.challenges.length} piece(s) of evidence</p>}
                  </button>
                </li>
              ))}
              {!c.claims.length && <li><Empty>No claims yet.</Empty></li>}
            </ul>
            <Card title="Evidence chain" className="h-fit text-sm lg:sticky lg:top-4" action={chain && <Chip tone="blue">{chain.evidence.length} items</Chip>}>
              {!chain && <Empty>Select a claim to see the evidence chain an auditor would review.</Empty>}
              {chain && (
                <ul className="space-y-2.5">
                  {chain.evidence.map((e: any) => (
                    <li key={e.id} className={`rounded-2xl border p-3 ${e.rel === "CHALLENGED_BY" ? "border-verify/50 bg-[#fffaf0]" : "border-line"}`}>
                      <p className={e.state === "superseded" ? "text-muted line-through" : ""}>{e.summary}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                        <span className="mono">{e.id}</span> · origin <span className="mono">{e.origin}</span>
                        {e.rel === "CHALLENGED_BY" && <Chip tone="warn">challenges</Chip>}
                        <StateBadge state={e.state} />
                      </p>
                      {e.cypher && <details className="mt-1.5"><summary className="cursor-pointer text-xs text-muted hover:text-cyan">Query that produced it</summary><pre className="mono mt-1.5 overflow-x-auto rounded-xl border border-line bg-ink p-2.5">{e.cypher}</pre></details>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
        {tab === "evidence" && <EvidenceExplorer caseId={id} version={version} onRevoked={(r) => { setRevoked(r); load(); setTab("dag"); }} />}
        {tab === "dag" && (
          <Card title="Provenance DAG" action={focus && <Chip tone="ring">last revocation highlighted</Chip>}>
            <p className="-mt-2 mb-3 text-sm text-muted">Claims rest on evidence (<span className="text-ok">SUPPORTED_BY</span>, <span className="text-verify">CHALLENGED_BY</span>), actions on claims (<span className="text-[var(--bank-1)]">JUSTIFIED_BY</span>), report sentences cite both. Evidence is stacked by origin so repeated paths to one fact sit together.{focus ? " Highlighted: what the last revocation reached." : ""}</p>
            {dag ? <ProvenanceDag nodes={dag.nodes} edges={dag.edges} focus={focus} /> : <p className="text-sm text-muted">Loading DAG…</p>}
          </Card>
        )}
        {tab === "replay" && <Replay caseId={id} dag={dag} />}
        {tab === "sar" && <SarView caseId={id} version={version} onCite={(accts) => setLit(new Set(accts))} />}
        {tab === "freeze" && <FreezeSim caseId={id} accounts={nodes.map((n: any) => n.id)} />}
        {tab === "trace" && <TraceWaterfall caseId={id} />}
        {tab === "time" && <TimeMachine caseId={id} graph={graph} banks={banks} />}
        {tab === "screening" && <Screening caseId={id} />}

        {c.actions.length > 0 && (
          <Card title="Proposed actions" action={<Link href="/approvals" className={btn.small}>Review in Approvals</Link>}>
            <ul className="divide-y divide-line text-sm">
              {c.actions.map((a: any) => (
                <li key={a.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-deep text-white"><Icon name="approve" className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="font-medium capitalize">{a.kind.replace(/_/g, " ")}</span>
                      <Chip tone={stateTone(a.status)}>{a.status}</Chip>
                      <StateBadge state={a.state} />
                    </p>
                    <p className="mt-1 text-muted">{a.rationale}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
      <div className="glass h-fit p-5 2xl:sticky 2xl:top-4"><ActivityFeed caseId={id} height="h-[80vh]" /></div>
      {signing && <HardwareSignModal caseId={id} actions={c.actions} onClose={() => setSigning(false)} onDone={load} />}
    </div>
  );
}
