"use client";
import { useCallback, useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import { StateBadge } from "./Trust";
import { Chip, Empty } from "./ui";

type Group = { origin: string; kind: string; multiplicity: number; evidence_ids: string[]; summary: string; weight: number };
type Claim = { id: string; text: string; kind: string; state: string; paths: number; origins: number; confidence: number; naive: number;
  groups: Group[]; challenge_groups: Group[]; evidence: Record<string, string> };
type Indep = { paths: number; origins: number; mean_confidence: number; mean_naive: number; claims: Claim[] };

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

/** Evidence Independence Explorer: paths grouped by the atomic fact they rest on. */
export default function EvidenceExplorer({ caseId, version, onRevoked }: { caseId: string; version: number; onRevoked: (r: any) => void }) {
  const [d, setD] = useState<Indep | null>(null);
  const [ripple, setRipple] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("KYC update: the shared fact has an innocent explanation");
  const load = useCallback(() => { get<Indep>(`/cases/${caseId}/independence`).then(setD).catch(() => {}); }, [caseId]);
  useEffect(() => { load(); }, [load, version]);

  const revoke = async (eid: string) => {
    setRipple(eid);
    try {
      const r = await post(`/cases/${caseId}/evidence/${eid}/revoke`, { reason });
      onRevoked(r);
      load();
    } catch (e: any) { onRevoked({ error: e.message }); }
    setRevoking(null);
    setTimeout(() => setRipple(null), 1200);
  };

  if (!d) return <div className="space-y-4">{[0, 1, 2].map((i) => <div key={i} className="glass h-32 animate-pulse" />)}</div>;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="fill-blue relative overflow-hidden rounded-[22px] p-5 shadow-[0_24px_40px_-24px_rgba(10,99,207,.9)]">
          <span className="lines" />
          <p className="relative text-[16px] font-medium">Evidence independence</p>
          <p className="kpi relative mt-3 text-[40px] leading-none">{d.paths}<span className="mx-2 text-2xl text-white/60">→</span>{d.origins}</p>
          <p className="relative mt-3 text-xs text-sky">paths → independent origins</p>
        </div>
        <div className="glass p-5 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-xs text-muted">Echo-proof confidence</p><p className="kpi text-2xl text-ok">{pct(d.mean_confidence)}</p><Meter v={d.mean_confidence} tone="bg-ok" /></div>
            <div><p className="text-xs text-muted">Path counting</p><p className="kpi text-2xl text-muted">{pct(d.mean_naive)}</p><Meter v={d.mean_naive} tone="bg-[#b5bcc6]" /></div>
          </div>
          <p className="mt-3 text-xs text-muted">Confidence counts each origin once (GraphEcho, arXiv 2609.17695); repeated paths to one fact add nothing.</p>
        </div>
      </div>
      {!d.claims.length && <Empty>No claims to analyse yet.</Empty>}
      {d.claims.map((c) => (
        <article key={c.id} className="glass p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <Chip tone="blue">{c.kind}</Chip><span className="mono">{c.id}</span>
            <Chip tone="deep">{c.paths} paths → {c.origins} origins</Chip>
            <span className="ml-auto"><StateBadge state={c.state} /></span>
          </div>
          <p className="mt-2 text-[15px] leading-snug">{c.text}</p>
          <p className="mt-1 text-xs text-muted">confidence <span className="font-semibold text-ok">{pct(c.confidence)}</span> · naive {pct(c.naive)}</p>
          <ul className="mt-4 grid gap-2.5 md:grid-cols-2">
            {[...c.groups.map((g) => ({ g, ch: false })), ...c.challenge_groups.map((g) => ({ g, ch: true }))].map(({ g, ch }) => (
              <li key={(ch ? "c" : "s") + g.origin} className={`relative overflow-hidden rounded-2xl border p-3 pl-4 ${ch ? "border-verify/50 bg-[#fffaf0]" : "border-line"}`}>
                <span className={`absolute inset-y-0 left-0 w-1 ${ch ? "bg-verify" : "bg-ok"}`} />
                <div className="flex items-center gap-2 text-[11px]">
                  <Chip tone={ch ? "warn" : "ok"}>{ch ? "challenges" : "supports"}</Chip>
                  <span className="mono truncate text-muted">{g.origin}</span>
                  {g.multiplicity > 1 && <Chip tone="warn" className="ml-auto shrink-0">{g.multiplicity}× same fact</Chip>}
                </div>
                <ul className="mt-2 space-y-1.5">
                  {g.evidence_ids.map((eid) => (
                    <li key={eid} className="relative flex items-start gap-2 text-xs">
                      {ripple === eid && <span className="ripple absolute -left-2 top-0 size-6 rounded-full border-2 border-ring" />}
                      <span className="flex-1 text-paper/85">{c.evidence[eid]} <span className="mono text-muted">{eid}</span></span>
                      {revoking === eid ? (
                        <span className="flex shrink-0 gap-1">
                          <button onClick={() => revoke(eid)} className="rounded-full bg-ring px-2 py-0.5 font-semibold text-white">confirm</button>
                          <button onClick={() => setRevoking(null)} className="px-1 text-muted hover:text-paper">cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setRevoking(eid)} className="shrink-0 rounded-full border border-line px-2 py-0.5 text-muted hover:border-ring hover:text-ring">Revoke</button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </article>
      ))}
      <label className="glass block p-4 text-xs font-medium text-muted">Reason recorded when revoking
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm font-normal text-paper" />
      </label>
    </div>
  );
}

function Meter({ v, tone }: { v: number; tone: string }) {
  return <div className="hatch mt-2 h-2.5 overflow-hidden rounded-full"><div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.max(0, Math.min(1, v ?? 0)) * 100}%` }} /></div>;
}
