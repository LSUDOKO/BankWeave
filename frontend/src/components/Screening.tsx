"use client";
import { useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import { Card, Chip, Empty, btn } from "./ui";

/** Sanctions / PEP screening of everyone who owns an account in the case. */
export default function Screening({ caseId }: { caseId: string }) {
  const [r, setR] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get(`/integrations/sanctions/case/${caseId}`).then(setR).catch((e) => setErr(e.message)); }, [caseId]);
  if (err) return <Empty><span className="text-ring">{err}</span></Empty>;
  if (!r) return <div className="glass h-32 animate-pulse" />;
  return (
    <div className="space-y-4 text-sm">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="fill-deep relative overflow-hidden rounded-[22px] p-5">
          <span className="lines" />
          <p className="relative text-[16px] font-medium">Owners screened</p>
          <p className="kpi relative mt-3 text-[40px] leading-none">{r.screened}</p>
          <p className="relative mt-3 text-xs text-sky">{r.hits.length} possible match(es)</p>
        </div>
        <div className="glass flex flex-col justify-center gap-2 p-5">
          <p className="flex flex-wrap items-center gap-2">
            <Chip tone={r.mode === "bundled" ? "warn" : "ok"}>{r.mode === "bundled" ? "bundled synthetic watchlist" : "OpenSanctions API"}</Chip>
            <span>{r.screened} owner name(s) screened · {r.hits.length} possible match(es)</span>
          </p>
          <p className="text-xs text-muted">Name-only matching: a hit needs date of birth or country to confirm before it means anything.</p>
        </div>
      </div>
      {r.hits.map((h: any) => (
        <Card key={h.person + h.account} title={<span>{h.name} <span className="text-sm font-normal text-muted">({h.schema}, account <span className="mono">{h.account.slice(0, 10)}</span>)</span></span>}
          action={<Chip tone="warn">{h.hits.length} candidate{h.hits.length === 1 ? "" : "s"}</Chip>}>
          <ul className="-mt-1 space-y-2 text-xs">
            {h.hits.map((x: any) => (
              <li key={x.entity_id} className="rounded-2xl border border-line p-3">
                <p className="flex flex-wrap items-center gap-1.5"><span className="font-medium text-verify">{x.caption}</span><Chip>score {x.score}</Chip><Chip>{x.program}</Chip><Chip>{x.country}</Chip></p>
                <span className="mt-1.5 block text-muted">source: {x.provenance.source} / {x.provenance.dataset} ({x.provenance.version ?? x.provenance.fetched_at}){x.provenance.url ? <> · <a className="link" href={x.provenance.url} target="_blank" rel="noreferrer">OpenSanctions record ↗</a></> : <> · <a className="link" href={`https://www.opensanctions.org/search/?q=${encodeURIComponent(x.caption)}`} target="_blank" rel="noreferrer">search real lists on OpenSanctions ↗</a></>}</span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {!r.hits.length && <Empty>No owner of a case account matches the watchlist.</Empty>}
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
    <Card title="Crypto off-ramp bridge" className="space-y-3">
      <p className="-mt-2 text-xs text-muted">Link a case account to a wallet the analyst found (exchange withdrawal, chat log). Public on-chain facts are fetched (EVM via public RPC; Solana via Helius with a key) and stored as evidence with origin <span className="mono">chain:&lt;net&gt;:&lt;address&gt;</span>.</p>
      <div className="flex flex-wrap gap-2 text-xs">
        <select value={acct} onChange={(e) => setAcct(e.target.value)} className="mono max-w-full rounded-full border border-line bg-white px-3 py-2">{accts.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <select value={chain} onChange={(e) => setChain(e.target.value)} className="rounded-full border border-line bg-white px-3 py-2"><option value="evm">Ethereum (EVM)</option><option value="solana">Solana</option></select>
        <input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="0x… wallet address" className="mono min-w-[260px] flex-1 rounded-full border border-line bg-white px-3 py-2" />
        <button onClick={go} disabled={busy || !addr} className={btn.primary}>{busy ? "Looking up…" : "Link and record"}</button>
      </div>
      {res && (res.ok ? <p className="rounded-xl bg-[#e8f7f0] px-3 py-2 text-xs text-ok">Recorded {res.evidence_id}: {JSON.stringify(res.facts)} · {res.provenance.source}</p>
        : <p className="rounded-xl bg-[#fff6e6] px-3 py-2 text-xs text-verify">{res.error}{res.evidence_id ? ` (link recorded as ${res.evidence_id})` : ""}</p>)}
    </Card>
  );
}
