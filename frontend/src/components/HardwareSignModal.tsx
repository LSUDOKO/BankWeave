"use client";
import { useEffect, useState } from "react";
import { get, post } from "@/lib/api";
import { keyFingerprint, signVaultKey, signWebAuthn, Signed, submitSignature } from "@/lib/hwsign";

/** Approve an action with a hardware key: the key signs the case's Merkle root (every claim,
 *  piece of evidence with its query and state, and report sentence), the server verifies the
 *  ES256 signature, stores (:HardwareAttestation)-[:ATTESTS]->(:Action), then records the approval. */
export default function HardwareSignModal({ caseId, actions, onClose, onDone }: {
  caseId: string; actions: any[]; onClose: () => void; onDone: () => void;
}) {
  const pending = actions.filter((a) => a.status === "proposed");
  const [target, setTarget] = useState(pending[0]?.id ?? actions[0]?.id ?? "");
  const [ch, setCh] = useState<any>(null);
  const [premise, setPremise] = useState<any>(null);
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"vaultkey" | "webauthn">("vaultkey");
  const [phase, setPhase] = useState<"idle" | "touch" | "signing" | "done" | "error">("idle");
  const [receipt, setReceipt] = useState<any>(null);
  const [raw, setRaw] = useState<Signed["raw"] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get(`/hardware/challenge/${caseId}`).then(setCh); }, [caseId]);
  useEffect(() => { if (target) get(`/cases/${caseId}/premise?action_id=${target}`).then(setPremise).catch(() => setPremise(null)); }, [caseId, target]);
  const stale = premise && !premise.ok;

  const run = async (how: "vaultkey" | "webauthn") => {
    if (stale && !note.trim()) { setErr("This action rests on superseded evidence: write an override note first."); return; }
    setErr(null); setPhase("signing");
    try {
      const s = how === "webauthn" ? await signWebAuthn(ch.merkle_root) : await signVaultKey(ch.merkle_root);
      const r = await submitSignature(caseId, target, ch.merkle_root, s);
      const act = pending.find((a) => a.id === target);
      let approval = null;
      if (act) approval = await post(`/actions/${caseId}/${target}/approve`, { analyst: "analyst", note: note || `hardware-signed ${r.id}`, override_stale: !!stale });
      setRaw(s.raw ?? null);
      setReceipt({ ...r, fingerprint: await keyFingerprint(s.assertion.public_key), approval });
      setPhase("done");
      onDone();
    } catch (e: any) {
      setErr(e.data?.detail?.message ?? e.data?.detail ?? e.message); setPhase("error");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label="Hardware key signing">
      <div className="glass w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5 space-y-4 bg-[#0b1220]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-verify">FIDO2 / WebAuthn · ES256</p>
            <h2 className="text-lg">Sign and approve with a hardware key</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-paper text-sm">Close</button>
        </div>
        <div className="grid gap-2 sm:grid-cols-[140px_1fr] text-sm">
          <span className="text-muted">Action</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded bg-ink border border-line px-2 py-1 mono text-xs">
            {actions.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.kind} ({a.status})</option>)}
          </select>
          <span className="text-muted">Graph Merkle root</span>
          <span className="mono text-xs text-cyan break-all">{ch?.merkle_root ?? "…"} <span className="text-muted">({ch?.leaves} records, SHA-256)</span></span>
        </div>
        {stale && (
          <div className="glass-2 p-3 border-ring/60 text-sm space-y-2">
            <p className="text-ring">{premise.message}</p>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Override note (required): why approving anyway is justified"
              className="w-full rounded bg-ink border border-line p-2 text-xs" />
          </div>
        )}
        <div role="tablist" className="flex gap-2 text-sm">
          {(["vaultkey", "webauthn"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1.5 border ${tab === t ? "border-verify bg-panel-2" : "border-line text-muted"}`}>
              {t === "vaultkey" ? "VaultKey FIPS (virtual USB-C key)" : "Passkey / TouchID / Windows Hello / USB key"}
            </button>
          ))}
        </div>
        {tab === "vaultkey" ? (
          <div className="grid gap-4 sm:grid-cols-[220px_1fr] items-center">
            <VaultKey phase={phase} onTouch={() => run("vaultkey")} disabled={!ch || phase === "signing"} />
            <p className="text-sm text-muted">Touch the gold capacitive ring to sign. VaultKey is a simulated security key: a non-extractable ECDSA P-256 key held by WebCrypto in this tab. The signature and its verification on the server are real.</p>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-muted">Uses <span className="mono">navigator.credentials</span> with the Merkle root as the challenge. No key on this machine? In Chrome: DevTools → ⋮ → More tools → WebAuthn → “Enable virtual authenticator environment”, protocol ctap2, transport usb, Add.</p>
            <button onClick={() => run("webauthn")} disabled={!ch || phase === "signing"} className="rounded-md bg-verify/15 border border-verify text-verify px-3 py-1.5 disabled:opacity-40">
              {phase === "signing" ? "Waiting for the authenticator…" : "Sign with WebAuthn"}
            </button>
            <p className="text-xs"><a className="link" href="https://developer.chrome.com/docs/devtools/webauthn" target="_blank" rel="noreferrer">How to enable Chrome&apos;s virtual USB key ↗</a></p>
          </div>
        )}
        {err && <p className="text-ring text-sm">{err}</p>}
        {receipt && (
          <div className="glass-2 p-4 border-ok/60 text-xs space-y-2">
            <p className="text-ok text-sm font-semibold">Cryptographic hardware receipt: signature verified{receipt.approval ? `, ${receipt.approval.id} approved` : ""}</p>
            <dl className="grid grid-cols-[170px_1fr] gap-y-1">
              <dt className="text-muted">Attestation node</dt><dd className="mono">{receipt.id} -[:ATTESTS]-&gt; {receipt.target}</dd>
              <dt className="text-muted">Graph Merkle root</dt><dd className="mono break-all">{receipt.merkle_root}</dd>
              <dt className="text-muted">COSE algorithm</dt><dd>ES256 (-7)</dd>
              <dt className="text-muted">Authenticator</dt><dd>{receipt.method === "webauthn" ? "WebAuthn" : "VaultKey FIPS (virtual)"} · key fp <span className="mono">{receipt.fingerprint}</span></dd>
              <dt className="text-muted">AAGUID</dt><dd className="mono">{receipt.aaguid ?? "–"}</dd>
              <dt className="text-muted">Signature counter</dt><dd>{receipt.counter}</dd>
              {receipt.user_verified != null && <><dt className="text-muted">User verified</dt><dd>{String(receipt.user_verified)}</dd></>}
            </dl>
            {raw && (
              <details open className="pt-1">
                <summary className="cursor-pointer text-muted">Raw FIDO2 payload</summary>
                <p className="mt-1 text-muted">authenticatorData</p><pre className="mono break-all whitespace-pre-wrap">{raw.authenticatorData}</pre>
                <p className="mt-1 text-muted">clientDataJSON</p><pre className="mono break-all whitespace-pre-wrap">{raw.clientDataJSON}</pre>
                <p className="mt-1 text-muted">signature (DER/raw hex)</p><pre className="mono break-all whitespace-pre-wrap">{raw.signature}</pre>
              </details>
            )}
            <p className="flex flex-wrap gap-3 pt-1">
              <a className="link" href="https://webauthn.me/debugger" target="_blank" rel="noreferrer">Inspect FIDO2 proof on WebAuthn.me ↗</a>
              <a className="link" href="https://app.falkordb.cloud" target="_blank" rel="noreferrer">See the (:HardwareAttestation) node in FalkorDB Cloud ↗</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** On-screen USB-C security key with a gold capacitive touch ring. */
function VaultKey({ phase, onTouch, disabled }: { phase: string; onTouch: () => void; disabled: boolean }) {
  const glow = phase === "done" ? "#10b981" : phase === "error" ? "#ef4444" : "#f5b942";
  return (
    <button onClick={onTouch} disabled={disabled} aria-label="Touch the VaultKey gold pad to sign" className="group justify-self-center disabled:opacity-60">
      <svg width="200" height="96" viewBox="0 0 200 96">
        <rect x="2" y="30" width="34" height="36" rx="6" fill="#94a3b8" />
        <rect x="8" y="40" width="22" height="16" rx="3" fill="#475569" />
        <rect x="34" y="14" width="160" height="68" rx="20" fill="#111827" stroke="#334155" strokeWidth="2" />
        <text x="58" y="40" fill="#e2e8f0" fontSize="11" fontFamily="monospace" fontWeight="700">VaultKey</text>
        <text x="58" y="54" fill="#94a3b8" fontSize="8" fontFamily="monospace">FIPS 140-3 · SIM</text>
        <circle cx="160" cy="48" r="20" fill="none" stroke={glow} strokeWidth="5" className={phase === "signing" ? "pulse-soft" : "group-hover:opacity-80"}>
          {phase === "idle" && <animate attributeName="stroke-opacity" values="1;0.35;1" dur="1.6s" repeatCount="indefinite" />}
        </circle>
        <circle cx="160" cy="48" r="11" fill={glow} fillOpacity="0.25" />
        <circle cx="66" cy="66" r="3" fill={phase === "done" ? "#10b981" : phase === "signing" ? "#f59e0b" : "#334155"} />
      </svg>
      <span className="block text-center text-xs text-verify mt-1">{phase === "signing" ? "Signing…" : phase === "done" ? "Signed" : "Touch the gold ring"}</span>
    </button>
  );
}
