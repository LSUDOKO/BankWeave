"use client";
import { useState } from "react";
import { post } from "@/lib/api";
import { Card, Chip, Empty } from "@/components/ui";
import { BankLinks, EnclaveChip } from "./devices";

/** Consortium enclave: PCR attestation, simulated tamper/reset, HSM facts and bank sync links. */
export default function Enclave({ a, reload }: { a: any; reload: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const act = async (path: string) => { setBusy(true); try { await post(path); } catch { /* status reload shows the result */ } await reload(); setBusy(false); };
  if (!a) return <Empty>Attesting…</Empty>;
  const ok = a.status === "ATTESTED";
  const open = a.bank_links?.filter((l: any) => l.sync === "open").length ?? 0;
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <section className="fill-deep relative overflow-hidden rounded-[22px] p-5">
          <span className="lines" />
          <div className="relative flex flex-wrap items-center gap-5">
            <EnclaveChip ok={ok} className="size-[112px] shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white/60">Consortium enclave</p>
              <p className={`kpi text-[34px] leading-tight ${ok ? "text-white" : "text-[#ff8a8d]"}`}>{ok ? "Attested" : "Quarantined"}</p>
              <p className="mono mt-0.5 truncate text-[11.5px] text-sky/80">{a.document.module_id} · {a.document.digest}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={busy || !ok} onClick={() => act("/hardware/enclave-tamper")}
                  className="rounded-full border-[1.5px] border-[#ff8a8d] px-4 py-1.5 text-xs font-semibold text-[#ffb3b5] hover:bg-[#ff5a5f]/15 disabled:opacity-35">Simulate PCR0 memory tamper</button>
                <button disabled={busy || ok} onClick={() => act("/hardware/enclave-reset")}
                  className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-deep hover:bg-sky disabled:opacity-35">Reset enclave hardware root</button>
              </div>
            </div>
          </div>
          {!ok && <p className="relative mt-4 rounded-xl bg-[#ff5a5f]/15 px-3 py-2 text-sm text-[#ffc2c4]">{a.reason}. Blinding and PSI are refused, and card taps answer HTTP 423, until reset.</p>}
          {a.bank_links && (
            <div className="relative mt-5 rounded-2xl bg-white/[.05] p-3 ring-1 ring-white/10">
              <div className="mb-1 flex items-center justify-between px-1 text-[11px] text-white/60">
                <span>Bank graphs syncing through the enclave</span><span>{open}/{a.bank_links.length} open</span>
              </div>
              <BankLinks links={a.bank_links} ok={ok} />
            </div>
          )}
        </section>

        <Card title="Measurements" action={<Chip tone={ok ? "ok" : "ring"}>{ok ? "all PCRs match" : "PCR mismatch"}</Chip>}>
          <p className="text-sm text-muted">
            The enclave holds the key that turns bank account ids into consortium ids (HMAC-SHA256). Before it blinds anything it measures
            its own code (SHA-384) and compares it with the value recorded at boot. A changed image quarantines it.
          </p>
          <table className="mt-3 w-full text-xs">
            <thead className="text-left text-muted"><tr><th className="pb-1.5 font-normal">PCR</th><th className="pb-1.5 font-normal">Measured (SHA-384)</th><th className="pb-1.5 text-right font-normal">Reference</th></tr></thead>
            <tbody>{Object.entries<string>(a.document.pcrs).map(([k, v]) => {
              const match = v === a.reference_pcrs[k];
              return (
                <tr key={k} className="border-t border-line">
                  <td className="py-2 pr-3 font-semibold">PCR{k}</td>
                  <td className="mono py-2 pr-3 text-muted"><span className="hidden sm:inline">{v.slice(0, 40)}…</span><span className="sm:hidden">{v.slice(0, 16)}…</span></td>
                  <td className="py-2 text-right"><Chip tone={match ? "ok" : "ring"}>{match ? "match" : "NO MATCH"}</Chip></td>
                </tr>
              );
            })}</tbody>
          </table>
          {a.hsm && (
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              {[["HSM interface", a.hsm.interface], ["PKCS#11 slot", String(a.hsm.pkcs11_slot_id)], ["Signer fingerprint", a.hsm.enclave_signer_fingerprint], ["Blinding key", a.hsm.key]].map(([k, v]) => (
                <div key={k} className="glass-2 min-w-0 px-3 py-2"><dt className="text-[11px] text-muted">{k}</dt><dd className="mono break-all text-[12px]">{v}</dd></div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-xs text-muted">Each attestation is recorded as an <span className="mono">(:EnclaveAttestation)</span> node in the consortium graph ({a.history?.length ?? 0} recent).</p>
        </Card>
      </div>

      <Card title="Attestation document" action={<Chip tone="warn">simulated</Chip>} className="min-w-0">
        <p className="text-xs text-muted">AWS Nitro-style schema, signed with ES384. There is no TEE hardware or Nitro PKI chain behind it: the certificate field says so.</p>
        <pre className="mono scroll-thin mt-3 max-h-[640px] overflow-auto rounded-2xl bg-[#071530] p-4 text-[11.5px] leading-relaxed text-[#d6e4f5]">
          {JSON.stringify({ ...a.document, signature_es384: a.signature_es384.slice(0, 48) + "…" }, null, 2)}
        </pre>
      </Card>
    </div>
  );
}
