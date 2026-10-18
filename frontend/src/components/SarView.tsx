"use client";
import { useEffect, useState } from "react";
import { API, get } from "@/lib/api";
import { StateBadge } from "./Trust";
import { Card, Chip, Empty } from "./ui";

const SECTIONS: Record<string, string> = {
  subject: "Subject", activity: "Activity", typologies: "Typologies matched", money_flow: "Money flow",
  cross_bank: "Cross-bank links", unresolved: "Unresolved points", recommendation: "Recommendation", body: "Report",
};

export default function SarView({ caseId, onCite, version }: { caseId: string; onCite: (accounts: string[], ids: string[]) => void; version: number }) {
  const [sar, setSar] = useState<any>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => { get(`/sar/${caseId}`).then((d) => setSar(d.sar)).catch(() => {}); }, [caseId, version]);
  if (!sar) return <Empty>No report yet. The Reporter drafts one after the Skeptic&apos;s review.</Empty>;
  const published = sar.status === "published";
  let section = "";
  return (
    <div className="space-y-4">
      <article className="glass p-5 md:p-6">
        <header className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-[20px] font-semibold" style={{ letterSpacing: "-0.02em" }}>Suspicious activity report</h2>
          <Chip tone={published ? "ok" : "ring"}>{published ? "Published" : "Divergent: not filed"}</Chip>
          <StateBadge state={sar.state} />
          <a className="ml-auto inline-flex items-center gap-1 rounded-full border-[1.5px] border-deep px-3 py-1 text-xs font-semibold text-deep hover:bg-panel-2" href={`${API}/sar/${caseId}/markdown`} target="_blank">Export Markdown</a>
        </header>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Chip tone="blue">provenance fidelity {sar.pf}</Chip>
          <Chip>{sar.repairs} repair{sar.repairs === 1 ? "" : "s"}</Chip>
          <Chip>audited by {sar.auditor}</Chip>
        </div>
        <p className="mt-3 max-w-[70ch] text-sm text-muted">Every sentence links to the graph evidence it rests on. Select one to light up its accounts.</p>
        <div className="mt-4 max-w-[78ch] space-y-1">
          {sar.sentences.map((s: any) => {
            const head = s.section !== section ? (section = s.section, <h3 key={s.id + "h"} className="pb-1 pt-4 text-[11px] font-medium uppercase tracking-wide text-muted">{SECTIONS[s.section] ?? s.section}</h3>) : null;
            return (
              <div key={s.id}>
                {head}
                <button
                  onClick={() => { setActive(s.id); onCite(s.cites.flatMap((c: any) => c.accounts ?? []), s.cites.map((c: any) => c.id)); }}
                  className={`rounded-lg px-1.5 py-0.5 text-left leading-relaxed underline decoration-dotted underline-offset-4 hover:bg-panel-2 ${s.supported ? "decoration-paper/40" : "text-ring decoration-ring"} ${active === s.id ? "bg-panel-2" : ""} ${s.state === "needs_verification" ? "decoration-verify" : ""}`}
                >
                  {s.text}
                </button>
                {active === s.id && (
                  <ul className="mb-2 ml-4 mt-1 space-y-1 border-l-2 border-cyan/40 pl-3 text-sm text-muted">
                    {s.cites.map((c: any) => <li key={c.id}><span className="mono text-paper/80">{c.id}</span> {c.text} <StateBadge state={c.state} /></li>)}
                    <li>Auditor: {s.verdict}</li>
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </article>
      {sar.divergence && (
        <Card title="Divergence report" action={<Chip tone="ring">not filed</Chip>}>
          <p className="-mt-2 max-w-[70ch] text-sm text-muted">The agents could not produce a report where every sentence is proven, so this shows the disagreement instead of inventing consensus.</p>
          <div className="mt-4 grid gap-4 text-sm md:grid-cols-2">
            <div className="rounded-2xl border border-line p-4"><h3 className="mb-2 text-sm font-medium">Investigator</h3>{sar.divergence.investigator.map((c: any) => <p key={c.id} className="mb-1.5">{c.text} <span className="text-muted">({Math.round((c.confidence ?? 0) * 100)}%)</span></p>)}</div>
            <div className="rounded-2xl border border-verify/50 bg-[#fffaf0] p-4"><h3 className="mb-2 text-sm font-medium text-verify">Skeptic</h3>{sar.divergence.skeptic.map((c: any) => <p key={c.id} className="mb-1.5">{c.text ?? c.summary}</p>)}</div>
          </div>
          <h3 className="mb-2 mt-5 text-sm font-medium">Unresolved sentences</h3>
          <ul className="space-y-1.5 text-sm">{sar.divergence.unresolved.map((u: any) => <li key={u.id}>{u.text} <Chip tone="ring">{u.why}</Chip></li>)}</ul>
        </Card>
      )}
    </div>
  );
}
