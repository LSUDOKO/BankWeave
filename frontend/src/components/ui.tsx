// Shared building blocks for every console page, matching the dashboard:
// rounded white cards on the grey workspace, one filled-blue stat per row, pill buttons, soft status chips.
import Link from "next/link";
import Icon from "@/components/Icon";

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#1a8bff] to-[#0a63cf] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(8,124,248,.9)] hover:brightness-110 disabled:opacity-40 disabled:shadow-none",
  ghost: "inline-flex items-center justify-center gap-2 rounded-full border-[1.5px] border-deep px-5 py-2.5 text-sm font-semibold text-deep hover:bg-white disabled:opacity-40",
  soft: "inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-paper shadow-[var(--shadow)] hover:text-cyan disabled:opacity-40",
  danger: "inline-flex items-center justify-center gap-2 rounded-full border-[1.5px] border-ring/70 px-4 py-2 text-sm font-semibold text-ring hover:bg-[#fdecec] disabled:opacity-40",
  small: "inline-flex items-center gap-1 rounded-full border-[1.5px] border-deep px-3 py-1 text-xs font-semibold text-deep hover:bg-panel-2",
};

export function PageHeader({ title, sub, actions, crumb }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; crumb?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {crumb && <p className="mb-1 text-sm text-muted">{crumb}</p>}
        <h1 className="text-[34px] font-semibold leading-[1.08] md:text-[40px]" style={{ letterSpacing: "-0.04em" }}>{title}</h1>
        {sub && <p className="mt-1.5 max-w-[80ch] text-muted">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function StatCard({ label, value, sub, chip, href, filled = false, i = 0 }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; chip?: React.ReactNode; href?: string; filled?: boolean; i?: number;
}) {
  const body = (
    <>
      {filled && <span className="lines" />}
      <div className="relative flex items-start justify-between gap-2">
        <p className={`text-[16px] font-medium ${filled ? "text-white" : "text-paper"}`}>{label}</p>
        {href && (
          <span className={`grid size-9 shrink-0 place-items-center rounded-full border transition-transform group-hover:rotate-45 ${filled ? "border-white bg-white text-deep" : "border-paper/70 text-paper"}`}>
            <Icon name="arrow" className="size-4" strokeWidth={2} />
          </span>
        )}
      </div>
      <p className={`kpi relative mt-3 text-[44px] font-semibold leading-none ${filled ? "text-white" : "text-paper"}`}>{value}</p>
      {(chip || sub) && (
        <p className={`relative mt-4 flex flex-wrap items-center gap-2 text-xs ${filled ? "text-sky" : "text-cyan"}`}>
          {chip != null && <span className={`rounded-md border px-1.5 py-px text-[10.5px] font-semibold ${filled ? "border-sky/60" : "border-cyan/40"}`}>{chip}</span>}
          {sub}
        </p>
      )}
    </>
  );
  const cls = `fade-up group relative block overflow-hidden rounded-[22px] p-5 transition-transform ${href ? "hover:-translate-y-0.5" : ""} ${filled ? "fill-blue shadow-[0_24px_40px_-24px_rgba(10,99,207,.9)]" : "glass"}`;
  return href
    ? <Link href={href} className={cls} style={{ animationDelay: `${i * 70}ms` }}>{body}</Link>
    : <div className={cls} style={{ animationDelay: `${i * 70}ms` }}>{body}</div>;
}

export function Card({ title, action, children, className = "", pad = "p-5" }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; pad?: string }) {
  return (
    <section className={`glass ${pad} ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[17px] font-medium">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE = {
  ok: "text-ok bg-[#e8f7f0]", warn: "text-verify bg-[#fff6e6]", ring: "text-ring bg-[#fdecec]",
  blue: "text-cyan bg-panel-2", deep: "text-white bg-deep", muted: "text-muted bg-panel-2",
} as const;
export type Tone = keyof typeof TONE;

export function Chip({ tone = "muted", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[11px] font-medium ${TONE[tone]} ${className}`}>{children}</span>;
}

/** Map the system's state words onto chip tones so every page colours them the same way. */
export function stateTone(s?: string | null): Tone {
  const v = (s ?? "").toLowerCase();
  if (/(active|cleared|approved|published|closed|verified|intact|ok|pass)/.test(v)) return "ok";
  if (/(needs|awaiting|pending|proposed|review|draft|stale|open)/.test(v)) return "warn";
  if (/(superseded|rejected|flagged|broken|fail|blocked|quarantin|suspicious)/.test(v)) return "ring";
  return "blue";
}

export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
      {children}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Segmented tabs in a white pill track. */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, React.ReactNode][] }) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-[var(--shadow)]">
      {items.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${value === k ? "bg-deep text-white" : "text-muted hover:text-paper"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
