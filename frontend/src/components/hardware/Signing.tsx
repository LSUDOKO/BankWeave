"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { get } from "@/lib/api";
import { keyFingerprint, signVaultKey, signWebAuthn, Signed, submitSignature } from "@/lib/hwsign";
import { btn, Card, Chip } from "@/components/ui";
import { CopyButton } from "./CodeBlock";
import { SecurityKey } from "./devices";

const field = "rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-cyan";

/** Approval signing over the case Merkle root: real WebAuthn, or the simulated VaultKey. */
export default function Signing() {
  const [cases, setCases] = useState<any[]>([]);
  const [caseId, setCaseId] = useState("");
  const [ch, setCh] = useState<any>(null);
  const [target, setTarget] = useState("");
  const [receipt, setReceipt] = useState<any>(null);
  const [raw, setRaw] = useState<Signed["raw"] | null>(null);
  const [seal, setSeal] = useState<any>(null);
  const [phase, setPhase] = useState<"idle" | "signing" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { get("/cases").then((d) => { setCases(d.cases); if (d.cases[0]) setCaseId(d.cases[0].id); }).catch((e) => setErr(e.message)); }, []);
  const loadCase = useCallback(() => {
    if (!caseId) return;
    get(`/hardware/challenge/${caseId}`).then((c) => { setCh(c); setTarget(c.targets.find((t: any) => t.type === "Action")?.id ?? c.targets[0]?.id ?? ""); }).catch((e) => setErr(e.message));
    get(`/hardware/seal/${caseId}`).then(setSeal).catch(() => {});
  }, [caseId]);
  useEffect(() => { setReceipt(null); setRaw(null); setPhase("idle"); loadCase(); }, [loadCase]);

  const sign = async (how: "webauthn" | "vaultkey") => {
    setErr(null); setPhase("signing");
    try {
      const s = how === "webauthn" ? await signWebAuthn(ch.merkle_root) : await signVaultKey(ch.merkle_root);
      const r = await submitSignature(caseId, target, ch.merkle_root, s);
      setRaw(s.raw ?? null);
      setReceipt({ ...r, fingerprint: await keyFingerprint(s.assertion.public_key) });
      setPhase("done");
      loadCase();
    } catch (e: any) {
      const d = e.data?.detail;
      setErr(typeof d === "string" ? d : d?.message ?? e.message); setPhase("error");
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <Card title="Sign an approval over the evidence" action={<Chip tone="blue">ES256 · P-256</Chip>}>
        <p className="text-sm text-muted">
          The approver signs the case&apos;s Merkle root: one hash over every claim, piece of evidence (with its query and state) and report
          sentence. If any of it changes later, the signature no longer matches and the seal breaks.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">Case
            <select value={caseId} onChange={(e) => setCaseId(e.target.value)} className={`${field} mono mt-1 w-full text-xs`}>
              {cases.map((c) => <option key={c.id} value={c.id}>{c.id} · {c.title?.slice(0, 40)}</option>)}
            </select>
          </label>
          <label className="text-xs text-muted">Signs for
            <select value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} mono mt-1 w-full text-xs`}>
              {ch?.targets.map((t: any) => <option key={t.id} value={t.id}>{t.type} {t.id} ({t.kind})</option>)}
            </select>
          </label>
        </div>
        {ch && (
          <div className="glass-2 mt-3 px-3.5 py-2.5">
            <p className="flex items-center justify-between text-[11px] text-muted"><span>Merkle root · WebAuthn challenge</span><span>{ch.leaves} records</span></p>
            <p className="mono mt-0.5 break-all text-[12px] text-cyan">{ch.merkle_root}</p>
          </div>
        )}
        <div className="mt-5 flex flex-col items-center gap-5 rounded-2xl border border-line bg-[linear-gradient(180deg,#f7faff_0%,#fff_100%)] p-5 sm:flex-row">
          <SecurityKey active={phase === "signing"} done={phase === "done"} className="w-[210px] shrink-0" />
          <div className="flex w-full flex-col gap-2">
            <button onClick={() => sign("webauthn")} disabled={!ch || !target || phase === "signing"} className={btn.primary}>Sign with passkey (WebAuthn)</button>
            <button onClick={() => sign("vaultkey")} disabled={!ch || !target || phase === "signing"} className={btn.ghost}>Sign with VaultKey (virtual)</button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">
          No security key? Chrome DevTools → More tools → WebAuthn → “Enable virtual authenticator environment”
          (<a className="link" href="https://developer.chrome.com/docs/devtools/webauthn" target="_blank" rel="noreferrer">guide ↗</a>).
          VaultKey is simulated: a non-extractable WebCrypto P-256 key in this tab. The server verifies both with the same ES256 check.
        </p>
        {err && <p className="mt-2 text-sm text-ring">{err}</p>}
      </Card>

      <div className="space-y-4">
        {receipt ? (
          <section className="fill-deep relative overflow-hidden rounded-[22px] p-5">
            <span className="lines" />
            <div className="relative flex items-center justify-between gap-2">
              <h2 className="text-[17px] font-medium text-white">Signature verified by the server</h2>
              <span className="rounded-full bg-[#3ee08f]/15 px-2.5 py-1 text-[11px] font-semibold text-[#3ee08f]">verified</span>
            </div>
            <dl className="relative mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-y-1.5 text-xs">
              {([
                ["Attestation", `${receipt.id} → ${receipt.target}`], ["Method", receipt.method], ["Algorithm", receipt.alg],
                ["Merkle root", receipt.merkle_root], ["Key fingerprint", receipt.fingerprint], ["AAGUID", receipt.aaguid ?? "–"],
                ["Counter", String(receipt.counter)], ...(receipt.user_verified != null ? [["User verified", String(receipt.user_verified)]] : []),
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-white/55">{k}</dt><dd className="mono break-all text-white">{v}</dd></div>
              ))}
            </dl>
            {raw && (
              <div className="relative mt-4 space-y-2">
                <div className="flex items-center justify-between"><p className="text-[11px] text-white/55">clientDataJSON</p><CopyButton text={raw.clientDataJSON} dark /></div>
                <pre className="mono max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-black/30 p-2.5 text-[11px] text-sky">{raw.clientDataJSON}</pre>
                <div className="flex items-center justify-between"><p className="text-[11px] text-white/55">signature (DER, hex)</p><CopyButton text={raw.signature} dark /></div>
                <pre className="mono max-h-20 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-black/30 p-2.5 text-[11px] text-white/80">{raw.signature}</pre>
              </div>
            )}
            <p className="relative mt-3 text-xs text-white/60">Writes <span className="mono">(:HardwareAttestation)-[:ATTESTS]-&gt;({receipt.target})</span>. Inspect WebAuthn payloads at <a className="text-sky underline underline-offset-2" href="https://webauthn.me/debugger" target="_blank" rel="noreferrer">webauthn.me/debugger ↗</a>.</p>
          </section>
        ) : (
          <section className="hatch flex min-h-[180px] flex-col justify-center rounded-[22px] p-5 text-center">
            <p className="mx-auto max-w-[36ch] rounded-xl bg-white/90 px-3 py-2 text-sm text-muted">The server&apos;s receipt appears here: attestation id, algorithm, counter and the raw clientDataJSON.</p>
          </section>
        )}

        <Card title="Seals on this case" action={seal?.attestations?.length ? <Chip tone="muted">{seal.attestations.length}</Chip> : undefined}>
          {!seal?.attestations?.length && <p className="text-sm text-muted">No signatures yet.</p>}
          <ul className="space-y-2">
            {seal?.attestations?.map((a: any) => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs">
                <Chip tone={a.intact ? "ok" : "ring"}>{a.intact ? "seal intact" : "Merkle seal broken"}</Chip>
                <span className="mono font-semibold">{a.id}</span>
                <span className="text-muted">{a.method} on {a.target} · root {a.merkle_root.slice(0, 12)}…</span>
              </li>
            ))}
          </ul>
          {seal?.broken?.length > 0 && <p className="mt-3 rounded-xl bg-[#fdecec] px-3 py-2 text-xs text-ring">Evidence changed after signing: the current root {seal.current_root.slice(0, 12)}… no longer matches. Re-review and sign again.</p>}
          {caseId && <p className="mt-3 text-xs text-muted">Revoke a piece of evidence on the <Link className="link" href={`/cases/${caseId}`}>case page</Link> and come back: the seal breaks.</p>}
        </Card>
      </div>
    </div>
  );
}
