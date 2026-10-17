"use client";
import { useCallback, useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import { StateBadge } from "./Trust";

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

  if (!d) return <p className="text-muted">Loading evidence…</p>;
  return (
    <div className="space-y-4">
      <div className="glass p-4 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted">Evidence independence</p>
          <p className="kpi text-2xl mt-0.5"><span className="text-paper">{d.paths} paths</span> <span className="text-muted">→</span> <span className="text-ok">{d.origins} origins</span></p>
        </div>
        <div className="text-sm">
          <p>Echo-proof confidence <b className="text-ok">{pct(d.mean_confidence)}</b> vs path counting <b className="text-muted">{pct(d.mean_naive)}</b></p>
          <p className="text-xs text-muted">Confidence counts each origin once (GraphEcho, arXiv 2609.17695); repeated paths to one fact add nothing.</p>
        </div>
      </div>
      {d.claims.map((c) => (
        <article key={c.id} className="glass p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="uppercase tracking-wider">{c.kind}</span><span className="mono">{c.id}</span>
            <span className="badge text-cyan">{c.paths} paths → {c.origins} origins</span>
            <span className="ml-auto"><StateBadge state={c.state} /></span>
          </div>
          <p className="mt-1">{c.text}</p>
          <p className="mt-1 text-xs text-muted">confidence <span className="text-ok">{pct(c.confidence)}</span> · naive {pct(c.naive)}</p>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {[...c.groups.map((g) => ({ g, ch: false })), ...c.challenge_groups.map((g) => ({ g, ch: true }))].map(({ g, ch }) => (
              <li key={(ch ? "c" : "s") + g.origin} className={`glass-2 p-2.5 relative overflow-hidden ${ch ? "border-verify/60" : ""}`}>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={ch ? "text-verify" : "text-ok"}>{ch ? "challenges" : "supports"}</span>
                  <span className="mono text-muted truncate">{g.origin}</span>
                  {g.multiplicity > 1 && <span className="ml-auto badge text-verify">{g.multiplicity}× same fact</span>}
                </div>
                <ul className="mt-1 space-y-1">
                  {g.evidence_ids.map((eid) => (
                    <li key={eid} className="flex items-start gap-2 text-xs relative">
                      {ripple === eid && <span className="ripple absolute -left-2 top-0 size-6 rounded-full border-2 border-ring" />}
                      <span className="flex-1 text-paper/85">{c.evidence[eid]} <span className="mono text-muted">{eid}</span></span>
                      {revoking === eid ? (
                        <span className="flex gap-1">
                          <button onClick={() => revoke(eid)} className="rounded border border-ring text-ring px-1.5">confirm</button>
                          <button onClick={() => setRevoking(null)} className="text-muted">cancel</button>
                        </span>
                      ) : (
                        <button onClick={() => setRevoking(eid)} className="shrink-0 rounded border border-line px-1.5 text-muted hover:border-ring hover:text-ring">Revoke</button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </article>
      ))}
      <label className="block text-xs text-muted">Reason recorded when revoking
        <input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded bg-ink border border-line px-2 py-1 text-sm text-paper" />
      </label>
    </div>
  );
}
