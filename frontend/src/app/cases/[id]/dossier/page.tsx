"use client";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import Icon from "@/components/Icon";
import { Card, Chip, Empty, PageHeader, StatCard, btn, stateTone } from "@/components/ui";
import { API, get } from "@/lib/api";

/** Printable audit dossier: every sentence, the evidence it cites, the query behind each piece
 *  of evidence with its execution hash, and the signed Merkle root. Print to save as PDF. */
export default function Dossier({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [b, setB] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { get(`/cases/${id}/export/dossier`).then(setB).catch((e) => setErr(e.message)); }, [id]);
  if (err) return (
    <div className="space-y-5">
      <PageHeader crumb={<Link href={`/cases/${id}`} className="hover:text-paper">Case <span className="mono">{id}</span></Link>} title="Audit dossier" />
      <Empty action={<Link href={`/cases/${id}`} className={btn.ghost}>Back to case</Link>}><span className="text-ring">{err}</span></Empty>
    </div>
  );
  if (!b) return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-white" />
      <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="glass h-32 animate-pulse" />)}</div>
      <p className="text-sm text-muted">Building dossier…</p>
    </div>
  );
  const ev = new Map(b.evidence.map((e: any) => [e.id, e]));
  const cl = new Map(b.claims.map((c: any) => [c.id, c]));
  const supported = b.sentences.filter((s: any) => s.supported).length;
  const live = b.evidence.filter((e: any) => e.state !== "superseded").length;
  return (
    <article className="dossier mx-auto max-w-5xl space-y-5 print:text-black">
      <style>{`@media print { nav, aside, header:not(.dossier header), .no-print { display: none !important; } html, body { background: white !important; color: black !important; }
        .dossier .glass, .dossier .glass-2, .dossier .fill-blue { background: white !important; border: 1px solid #ccc !important; box-shadow: none !important; backdrop-filter: none; }
        .dossier .lines { display: none !important; }
        .dossier pre { white-space: pre-wrap; color: #111 !important; background: #f4f4f4 !important; } .dossier * { color: #111 !important; } }`}</style>

      <PageHeader
        crumb={<><Link href="/cases" className="hover:text-paper">Cases</Link> / <Link href={`/cases/${id}`} className="mono hover:text-paper">{id}</Link> / dossier</>}
        title={b.case.title}
        sub={<>BankWeave audit dossier · synthetic data · generated {b.generated_at}</>}
        actions={<span className="no-print flex flex-wrap gap-2">
          <Link href={`/cases/${id}`} className={btn.soft}>Back to case</Link>
          <a href={`${API}/cases/${id}/export/fincen.xml`} className={btn.ghost}><Icon name="doc" className="size-4" />FinCEN-style XML</a>
          <button onClick={() => window.print()} className={btn.primary}>Print / save as PDF</button>
        </span>}
      />

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Chip tone="blue">Case <span className="mono">{b.case.id}</span></Chip>
        <Chip tone={b.case.sar ? stateTone(b.case.sar_status) : "muted"}>SAR <span className="mono">{b.case.sar ?? "none"}</span> ({b.case.sar_status ?? "not drafted"})</Chip>
        <Chip>provenance fidelity {b.case.pf ?? "–"}</Chip>
        <Chip>auditor {b.case.auditor ?? "–"}</Chip>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <StatCard filled i={0} label="Report sentences" value={b.sentences.length} chip={`${supported} supported`} sub="each cites graph evidence" />
        <StatCard i={1} label="Evidence items" value={b.evidence.length} chip={`${live} current`} sub="with query and execution hash" />
        <StatCard i={2} label="Records sealed" value={b.integrity.leaves} chip={b.integrity.hash_algorithm} sub="under one signed Merkle root" />
      </section>

      <Card title="Integrity seal" action={<Chip tone="ok">signed</Chip>}>
        <dl className="grid gap-x-4 gap-y-2.5 text-xs sm:grid-cols-[150px_1fr]">
          <dt className="text-muted">Merkle root</dt><dd className="mono break-all rounded-lg bg-panel-2 px-2 py-1">{b.integrity.merkle_root}</dd>
          <dt className="text-muted">Records sealed</dt><dd>{b.integrity.leaves} (claims, evidence with its query and state, report sentences)</dd>
          <dt className="text-muted">Hashing</dt><dd>{b.integrity.hash_algorithm}</dd>
          <dt className="text-muted">Signature</dt><dd className="mono break-all">{b.integrity.signature_algorithm}: {b.integrity.signature}</dd>
          <dt className="text-muted">Public key</dt><dd className="mono break-all">{b.integrity.public_key} ({b.integrity.key_source})</dd>
        </dl>
        <p className="mt-4 rounded-xl bg-panel-2 px-3 py-2 text-xs text-muted">Verify: recompute the root from <span className="mono">GET /cases/{id}/merkle</span> and check the Ed25519 signature over its 32 bytes. If any evidence is superseded later, the root changes.</p>
      </Card>

      <Card title="Report" action={<Chip tone="blue">{b.sentences.length} sentences</Chip>}>
        <ol className="space-y-3">
          {b.sentences.map((s: any) => (
            <li key={s.id} className="rounded-2xl border border-line p-4">
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span className="font-medium text-paper">{s.section}</span> · <span className="mono">{s.id}</span>
                <Chip tone={s.supported ? "ok" : "ring"}>{s.supported ? "supported" : "unsupported"}</Chip>
                <Chip tone={stateTone(s.state)}>{String(s.state).replace(/_/g, " ")}</Chip>
              </p>
              <p className="mt-2 leading-relaxed">{s.text}</p>
              <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-xs text-muted">
                {s.cites.map((c: string) => {
                  const e: any = ev.get(c); const k: any = cl.get(c);
                  return <li key={c}><span className="mono text-paper/80">{c}</span> {e ? `${e.summary} [execution sha256 ${e.execution_hash.slice(0, 16)}…]` : k ? `claim: ${k.text}` : ""}</li>;
                })}
              </ul>
            </li>
          ))}
          {!b.sentences.length && <li><Empty>No report drafted for this case.</Empty></li>}
        </ol>
      </Card>

      <Card title="Evidence register" action={<Chip tone="blue">{b.evidence.length} items</Chip>}>
        <ol className="space-y-3">
          {b.evidence.map((e: any) => (
            <li key={e.id} className="rounded-2xl border border-line p-4 text-sm">
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                <span className="mono">{e.id}</span> · {e.kind} · origin <span className="mono">{e.origin}</span> · by {e.agent}
                <Chip tone={stateTone(e.state)} className="ml-auto">{String(e.state).replace(/_/g, " ")}</Chip>
              </p>
              <p className={`mt-2 ${e.state === "superseded" ? "text-muted line-through" : ""}`}>{e.summary}</p>
              <p className="mono mt-2 break-all text-[11px] text-muted">execution sha256 {e.execution_hash}</p>
              {e.cypher && <pre className="mono mt-2 overflow-x-auto rounded-xl border border-line bg-ink p-2.5 text-[11px]">{e.cypher}</pre>}
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Accounts and actions">
        <p className="-mt-2 text-sm">{b.accounts.length} accounts (salted hashes) across banks {b.case.banks?.join(", ")}.</p>
        <ul className="mt-3 divide-y divide-line text-sm">
          {b.actions.map((a: any) => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 py-2.5">
              <span className="mono text-xs text-muted">{a.id}</span>
              <span className="font-medium">{a.kind}</span> on <span className="mono">{a.target}</span>
              <Chip tone={stateTone(a.status)}>{a.status}</Chip>
              <span className="basis-full text-muted">{a.rationale}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">FinCEN-style structure for review; not a BSA E-Filing submission.</p>
      </Card>
    </article>
  );
}
