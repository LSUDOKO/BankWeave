"use client";
import { useEffect, useState } from "react";
import { API, get } from "@/lib/api";
import { StateBadge } from "./Trust";

const SECTIONS: Record<string, string> = {
  subject: "Subject", activity: "Activity", typologies: "Typologies matched", money_flow: "Money flow",
  cross_bank: "Cross-bank links", unresolved: "Unresolved points", recommendation: "Recommendation", body: "Report",
};

export default function SarView({ caseId, onCite, version }: { caseId: string; onCite: (accounts: string[], ids: string[]) => void; version: number }) {
  const [sar, setSar] = useState<any>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => { get(`/sar/${caseId}`).then((d) => setSar(d.sar)).catch(() => {}); }, [caseId, version]);
  if (!sar) return <p className="text-muted">No report yet. The Reporter drafts one after the Skeptic&apos;s review.</p>;
  const published = sar.status === "published";
  let section = "";
  return (
    <article>
      <header className="flex flex-wrap items-center gap-3">
        <h2>Suspicious activity report</h2>
        <span className={`rounded px-2 py-0.5 text-sm border ${published ? "text-ok border-ok/50" : "text-ring border-ring/60"}`}>
          {published ? "Published" : "Divergent: not filed"}
        </span>
        <span className="text-sm text-muted">Provenance fidelity {sar.pf} after {sar.repairs} repair{sar.repairs === 1 ? "" : "s"}, audited by {sar.auditor}</span>
        <StateBadge state={sar.state} />
        <a className="ml-auto text-sm text-muted hover:text-paper underline underline-offset-4" href={`${API}/sar/${caseId}/markdown`} target="_blank">Export Markdown</a>
      </header>
      <p className="mt-2 text-sm text-muted max-w-[70ch]">Every sentence links to the graph evidence it rests on. Select one to light up its accounts.</p>
      <div className="mt-4 max-w-[75ch] space-y-1">
        {sar.sentences.map((s: any) => {
          const head = s.section !== section ? (section = s.section, <h3 key={s.id + "h"} className="pt-3 text-muted font-medium">{SECTIONS[s.section] ?? s.section}</h3>) : null;
          return (
            <div key={s.id}>
              {head}
              <button
                onClick={() => { setActive(s.id); onCite(s.cites.flatMap((c: any) => c.accounts ?? []), s.cites.map((c: any) => c.id)); }}
                className={`text-left leading-relaxed underline decoration-dotted underline-offset-4 ${s.supported ? "decoration-paper/40" : "decoration-ring text-ring"} ${active === s.id ? "bg-panel-2" : ""} ${s.state === "needs_verification" ? "decoration-verify" : ""}`}
              >
                {s.text}
              </button>
              {active === s.id && (
                <ul className="mt-1 mb-2 ml-4 border-l border-line pl-3 text-sm text-muted space-y-1">
                  {s.cites.map((c: any) => <li key={c.id}><span className="mono text-paper/80">{c.id}</span> {c.text} <StateBadge state={c.state} /></li>)}
                  <li>Auditor: {s.verdict}</li>
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {sar.divergence && (
        <section className="mt-8">
          <h2>Divergence report</h2>
          <p className="mt-1 text-sm text-muted max-w-[70ch]">The agents could not produce a report where every sentence is proven, so this shows the disagreement instead of inventing consensus.</p>
          <div className="mt-3 grid gap-6 md:grid-cols-2 text-sm">
            <div><h3 className="mb-1">Investigator</h3>{sar.divergence.investigator.map((c: any) => <p key={c.id} className="mb-1">{c.text} <span className="text-muted">({Math.round((c.confidence ?? 0) * 100)}%)</span></p>)}</div>
            <div><h3 className="mb-1 text-verify">Skeptic</h3>{sar.divergence.skeptic.map((c: any) => <p key={c.id} className="mb-1">{c.text ?? c.summary}</p>)}</div>
          </div>
          <h3 className="mt-4 mb-1">Unresolved sentences</h3>
          <ul className="text-sm space-y-1">{sar.divergence.unresolved.map((u: any) => <li key={u.id}>{u.text} <span className="text-ring">({u.why})</span></li>)}</ul>
        </section>
      )}
    </article>
  );
}
