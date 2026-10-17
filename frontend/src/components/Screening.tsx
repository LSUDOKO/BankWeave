"use client";
import { useEffect, useState } from "react";
import { get } from "@/lib/api";

/** Sanctions / PEP screening of everyone who owns an account in the case. */
export default function Screening({ caseId }: { caseId: string }) {
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get(`/integrations/sanctions/case/${caseId}`).then(setR).catch((e) => setErr(e.message)); }, [caseId]);
  if (err) return <p className="text-ring">{err}</p>;
  if (!r) return <p className="text-muted">Screening account owners…</p>;
  return (
    <div className="space-y-3 text-sm">
      <div className="glass p-3 flex flex-wrap items-center gap-3">
        <span className={`badge ${r.mode === "bundled" ? "text-verify" : "text-ok"}`}>{r.mode === "bundled" ? "bundled synthetic watchlist" : "OpenSanctions API"}</span>
        <span>{r.screened} owner name(s) screened · {r.hits.length} possible match(es)</span>
        <span className="text-xs text-muted">Name-only matching: a hit needs date of birth or country to confirm before it means anything.</span>
      </div>
      {r.hits.map((h: any) => (
        <div key={h.person + h.account} className="glass p-3">
          <p><b>{h.name}</b> <span className="text-muted">({h.schema}, account <span className="mono">{h.account.slice(0, 10)}</span>)</span></p>
          <ul className="mt-1 space-y-1 text-xs">
            {h.hits.map((x: any) => (
              <li key={x.entity_id}>
                <span className="text-verify">{x.caption}</span> · score {x.score} · {x.program} · {x.country}
                <span className="block text-muted">source: {x.provenance.source} / {x.provenance.dataset} ({x.provenance.version ?? x.provenance.fetched_at}){x.provenance.url ? <> · <a className="link" href={x.provenance.url} target="_blank" rel="noreferrer">entity</a></> : null}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!r.hits.length && <p className="text-muted">No owner of a case account matches the watchlist.</p>}
    </div>
  );
}
