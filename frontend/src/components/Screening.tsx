"use client";
import { useEffect, useState } from "react";
import { get, post } from "@/lib/api";

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
                <span className="block text-muted">source: {x.provenance.source} / {x.provenance.dataset} ({x.provenance.version ?? x.provenance.fetched_at}){x.provenance.url ? <> · <a className="link" href={x.provenance.url} target="_blank" rel="noreferrer">OpenSanctions record ↗</a></> : <> · <a className="link" href={`https://www.opensanctions.org/search/?q=${encodeURIComponent(x.caption)}`} target="_blank" rel="noreferrer">search real lists on OpenSanctions ↗</a></>}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {!r.hits.length && <p className="text-muted">No owner of a case account matches the watchlist.</p>}
      <ChainLink caseId={caseId} />
    </div>
  );
}

/** Crypto off-ramp bridge: attach a wallet to a case account and record on-chain facts. */
function ChainLink({ caseId }: { caseId: string }) {
  const [acct, setAcct] = useState("");
  const [accts, setAccts] = useState<string[]>([]);
  const [chain, setChain] = useState("evm");
  const [addr, setAddr] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { get(`/cases/${caseId}/graph`).then((g) => { const ids = g.nodes.map((n: any) => n.id); setAccts(ids); setAcct(ids[0] ?? ""); }).catch(() => {}); }, [caseId]);
  const go = async () => {
    setBusy(true);
    try { setRes(await post("/integrations/crypto/link", { case_id: caseId, account: acct, chain, address: addr.trim() })); }
    catch (e: any) { setRes({ ok: false, error: e.message }); }
    setBusy(false);
  };
  return (
    <div className="glass p-3 space-y-2">
      <h3>Crypto off-ramp bridge</h3>
      <p className="text-xs text-muted">Link a case account to a wallet the analyst found (exchange withdrawal, chat log). Public on-chain facts are fetched (EVM via public RPC; Solana via Helius with a key) and stored as evidence with origin <span className="mono">chain:&lt;net&gt;:&lt;address&gt;</span>.</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <select value={acct} onChange={(e) => setAcct(e.target.value)} className="rounded bg-ink border border-line px-2 py-1 mono">{accts.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={chain} onChange={(e) => setChain(e.target.value)} className="rounded bg-ink border border-line px-2 py-1"><option value="evm">Ethereum (EVM)</option><option value="solana">Solana</option></select>
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x… wallet address" className="flex-1 min-w-[260px] rounded bg-ink border border-line px-2 py-1 mono" />
        <button onClick={go} disabled={busy || !addr} className="rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1 disabled:opacity-40">{busy ? "Looking up…" : "Link and record"}</button>
      </div>
      {res && (res.ok ? <p className="text-xs text-ok">Recorded {res.evidence_id}: {JSON.stringify(res.facts)} · {res.provenance.source}</p>
        : <p className="text-xs text-verify">{res.error}{res.evidence_id ? ` (link recorded as ${res.evidence_id})` : ""}</p>)}
    </div>
  );
}
