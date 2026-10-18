"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { API, get } from "@/lib/api";

/** Printable audit dossier: every sentence, the evidence it cites, the query behind each piece
 *  of evidence with its execution hash, and the signed Merkle root. Print to save as PDF. */
export default function Dossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [b, setB] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get(`/cases/${id}/export/dossier`).then(setB).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <p className="text-ring">{err}</p>;
  if (!b) return <p className="text-muted">Building dossier…</p>;
  const ev = new Map(b.evidence.map((e: any) => [e.id, e]));
  const cl = new Map(b.claims.map((c: any) => [c.id, c]));
  return (
    <article className="dossier max-w-4xl mx-auto space-y-6 print:text-black">
      <style>{`@media print { nav, .no-print { display: none !important; } html, body { background: white !important; color: black !important; }
        .dossier .glass, .dossier .glass-2 { background: white !important; border-color: #ccc !important; backdrop-filter: none; }
        .dossier pre { white-space: pre-wrap; color: #111 !important; background: #f4f4f4 !important; } .dossier * { color: #111 !important; } }`}</style>
      <div className="no-print flex flex-wrap gap-2 text-sm">
        <Link href={`/cases/${id}`} className="link">Back to case</Link>
        <button onClick={() => window.print()} className="ml-auto rounded-md bg-cyan/15 border border-cyan text-cyan px-3 py-1">Print / save as PDF</button>
        <a href={`${API}/cases/${id}/export/fincen.xml`} className="rounded-md border border-line px-3 py-1">FinCEN-style XML</a>
      </div>
      <header>
        <p className="text-xs font-medium text-muted">BankWeave audit dossier · synthetic data</p>
        <h1 className="mt-1">{b.case.title}</h1>
        <p className="mt-1 text-sm text-muted">Case <span className="mono">{b.case.id}</span> · SAR <span className="mono">{b.case.sar ?? "none"}</span> ({b.case.sar_status ?? "not drafted"}) · provenance fidelity {b.case.pf ?? "–"} · auditor {b.case.auditor ?? "–"} · generated {b.generated_at}</p>
      </header>

      <section className="glass p-4">
        <h2>Integrity seal</h2>
        <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-[160px_1fr]">
          <dt className="text-muted">Merkle root</dt><dd className="mono break-all">{b.integrity.merkle_root}</dd>
          <dt className="text-muted">Records sealed</dt><dd>{b.integrity.leaves} (claims, evidence with its query and state, report sentences)</dd>
          <dt className="text-muted">Hashing</dt><dd>{b.integrity.hash_algorithm}</dd>
          <dt className="text-muted">Signature</dt><dd className="mono break-all">{b.integrity.signature_algorithm}: {b.integrity.signature}</dd>
          <dt className="text-muted">Public key</dt><dd className="mono break-all">{b.integrity.public_key} ({b.integrity.key_source})</dd>
        </dl>
        <p className="mt-2 text-xs text-muted">Verify: recompute the root from <span className="mono">GET /cases/{id}/merkle</span> and check the Ed25519 signature over its 32 bytes. If any evidence is superseded later, the root changes.</p>
      </section>

      <section>
        <h2>Report</h2>
        <ol className="mt-2 space-y-3">
          {b.sentences.map((s: any) => (
            <li key={s.id} className="glass-2 p-3">
              <p className="text-xs text-muted">{s.section} · <span className="mono">{s.id}</span> · {s.supported ? "supported" : "unsupported"} · {s.state}</p>
              <p className="mt-1">{s.text}</p>
              <ul className="mt-1 text-xs text-muted space-y-0.5">
                {s.cites.map((c: string) => {
                  const e: any = ev.get(c); const k: any = cl.get(c);
                  return <li key={c}><span className="mono">{c}</span> {e ? `${e.summary} [execution sha256 ${e.execution_hash.slice(0, 16)}…]` : k ? `claim: ${k.text}` : ""}</li>;
                })}
              </ul>
            </li>
          ))}
          {!b.sentences.length && <li className="text-muted">No report drafted for this case.</li>}
        </ol>
      </section>

      <section>
        <h2>Evidence register</h2>
        <ol className="mt-2 space-y-3">
          {b.evidence.map((e: any) => (
            <li key={e.id} className="glass-2 p-3 text-sm">
              <p className="text-xs text-muted"><span className="mono">{e.id}</span> · {e.kind} · origin <span className="mono">{e.origin}</span> · {e.state} · by {e.agent}</p>
              <p className={`mt-1 ${e.state === "superseded" ? "line-through" : ""}`}>{e.summary}</p>
              <p className="mt-1 mono text-[11px] text-muted break-all">execution sha256 {e.execution_hash}</p>
              {e.cypher && <pre className="mt-1 mono text-[11px] rounded bg-ink/70 p-2 overflow-x-auto">{e.cypher}</pre>}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Accounts and actions</h2>
        <p className="mt-1 text-sm">{b.accounts.length} accounts (salted hashes) across banks {b.case.banks?.join(", ")}.</p>
        <ul className="mt-2 text-sm space-y-1">
          {b.actions.map((a: any) => <li key={a.id}><span className="mono">{a.id}</span> {a.kind} on <span className="mono">{a.target}</span> ({a.status}): {a.rationale}</li>)}
        </ul>
        <p className="mt-4 text-xs text-muted">FinCEN-style structure for review; not a BSA E-Filing submission.</p>
      </section>
    </article>
  );
}
