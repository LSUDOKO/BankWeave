"use client";
// Scroll-driven explainer: text panels scroll on the left, the 3D stage stays pinned on the right
// (above the text on phones). The panel crossing the reading line picks the scene; scrolling
// through the lower half of a two-step panel advances its step.
import dynamic from "next/dynamic";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ModeBadge from "@/components/ModeBadge";
import { Chip, PageHeader, btn } from "@/components/ui";
import { bankHex } from "@/lib/banks";
import { useExplainerData, useMerkle } from "./data";
import { buildModel, facts } from "./model";
import { buildScenes, type Scene, type Stat } from "./scenes";

const Stage = dynamic(() => import("./Stage"), { ssr: false, loading: () => null });

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

export default function Explainer() {
  const loaded = useExplainerData();
  const reduced = useReducedMotion();
  const data = loaded.state === "ok" ? loaded.data : null;
  const model = useMemo(() => (data ? buildModel(data) : null), [data]);
  const f = useMemo(() => (data ? facts(data) : null), [data]);
  const merkle = useMerkle(data?.scenarios.C.case_id);
  const scenes = useMemo(() => (data && f ? buildScenes(data, f, merkle) : []), [data, f, merkle]);

  const [scene, setScene] = useState(0);
  const [step, setStep] = useState(0);
  const panels = useRef<(HTMLElement | null)[]>([]);

  // which panel crosses the reading line, and how far through it we are
  useEffect(() => {
    if (!scenes.length) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const mobile = window.innerWidth < 1024;
      const line = window.innerHeight * (mobile ? 0.72 : 0.5);
      let s = 0, p = 0;
      panels.current.forEach((el, i) => {
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (r.top <= line) { s = i; p = (line - r.top) / Math.max(1, r.height); }
      });
      setScene(s);
      setStep(scenes[s]?.steps && p > 0.52 ? 1 : 0);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [scenes]);

  const go = useCallback((i: number, st = 0) => {
    const el = panels.current[i];
    if (!el) return;
    const mobile = window.innerWidth < 1024;
    const line = window.innerHeight * (mobile ? 0.72 : 0.5);
    const r = el.getBoundingClientRect();
    const into = scenes[i]?.steps ? (st ? 0.7 : 0.18) : 0.18;
    window.scrollTo({ top: window.scrollY + r.top - line + r.height * into, behavior: reduced ? "auto" : "smooth" });
  }, [scenes, reduced]);

  const overrides = useMemo(() => (merkle ? { root: { sub: `${merkle.root.slice(0, 10)}…${merkle.root.slice(-6)} · ${merkle.count} records` } } : undefined), [merkle]);
  const cur = scenes[scene];

  return (
    <div className="space-y-6">
      <PageHeader
        crumb="Explore · 3D explainer"
        title="How BankWeave finds a ring no bank can see"
        sub="Eight scenes, each one FalkorDB feature from a real investigation: the graphs, the algorithm, and the exact Cypher it ran. Scroll to move through them."
        actions={<>
          {data?.replay && <ModeBadge mode="replay" />}
          <Link href="/scenarios" className={btn.ghost}>Golden scenarios</Link>
          <Link href="/consortium-3d" className={btn.primary}>Explore in 3D</Link>
        </>}
      />

      {loaded.state === "error" && <p className="text-verify">{loaded.error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        {/* the stage: pinned on the right; on phones pinned above the text */}
        <div className="sticky top-2 z-20 h-[44svh] min-h-[280px] lg:order-2 lg:top-3 lg:h-[calc(100svh-24px)]">
          <div className="relative h-full overflow-hidden rounded-[24px] border border-white shadow-[0_30px_70px_-34px_rgba(11,42,91,.45),0_2px_6px_rgba(11,42,91,.06)]"
            style={{ background: "radial-gradient(120% 80% at 50% 0%, #ffffff 0%, #eef5ff 55%, #e2eefc 100%)" }}>
            {model ? <Stage model={model} scene={scene} step={step} reduced={reduced} overrides={overrides} /> : <StageSkeleton />}
            {cur && (
              <div className="pointer-events-none absolute left-3 right-3 top-3 flex flex-wrap items-center gap-2 md:left-4 md:top-4">
                <span className="kpi rounded-full bg-deep px-2.5 py-1 text-[11.5px] text-white">{String(scene + 1).padStart(2, "0")} / {String(scenes.length).padStart(2, "0")}</span>
                <span className="mono rounded-full bg-white/90 px-2.5 py-1 text-[11.5px] text-cyan shadow-[var(--shadow)]">{cur.feature}</span>
                {cur.steps && <span className="rounded-full bg-white/90 px-2.5 py-1 text-[11.5px] text-muted shadow-[var(--shadow)]">{cur.steps[step]}</span>}
              </div>
            )}
            {f && scene <= 1 && (
              <div className="pointer-events-none absolute bottom-14 left-3 flex flex-wrap gap-1.5 md:left-4">
                {f.banks.map((b) => (
                  <span key={b} className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-paper shadow-[var(--shadow)]">
                    <i className="inline-block size-2 rounded-full" style={{ background: bankHex(b) }} />{b}
                  </span>
                ))}
                <span className="flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 text-[11px] text-muted shadow-[var(--shadow)]">
                  <i className="inline-block size-2 rounded-full bg-[#a9b6c8]" />stub
                </span>
              </div>
            )}
            {scenes.length > 0 && (
              <nav aria-label="Scenes" className="absolute bottom-3 left-3 right-3 flex items-center gap-1 md:left-4 md:right-4">
                {scenes.map((s, i) => (
                  <button key={s.id} onClick={() => go(i)} title={s.title} aria-label={`Scene ${i + 1}: ${s.title}`} aria-current={i === scene ? "step" : undefined}
                    className="group flex h-7 flex-1 items-center">
                    <span className={`block h-1.5 w-full rounded-full transition-colors duration-500 ${i < scene ? "bg-cyan/55" : i === scene ? "bg-cyan" : "bg-[#c9d8ea] group-hover:bg-sky"}`} />
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>

        {/* the story */}
        <div className="lg:order-1">
          {!scenes.length && loaded.state === "loading" && <PanelSkeleton />}
          {scenes.map((s, i) => (
            <section key={s.id} ref={(el) => { panels.current[i] = el; }} aria-labelledby={`scene-${s.id}`}
              className={`flex flex-col justify-center py-[9vh] ${s.steps ? "min-h-[150vh]" : "min-h-[92vh]"}`}>
              <div className={s.steps ? "lg:sticky lg:top-6" : ""}>
                <Panel s={s} i={i} active={i === scene} step={i === scene ? step : 0} onStep={(st) => go(i, st)} />
              </div>
            </section>
          ))}
          {scenes.length > 0 && (
            <section className="glass mb-[20vh] mt-4 p-6">
              <h2 className="text-[22px] font-semibold" style={{ letterSpacing: "-0.03em" }}>See it run</h2>
              <p className="mt-1.5 text-muted">Every scene above is one call in a live investigation. Open the scenarios to replay them, or the lab to run the queries yourself.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/scenarios" className={btn.primary}>Golden scenarios</Link>
                <Link href="/lab" className={btn.ghost}>FalkorDB Lab</Link>
                <Link href="/approvals" className={btn.ghost}>Approvals</Link>
                <button onClick={() => go(0)} className={btn.soft}>Back to scene 1</button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Panel({ s, i, active, step, onStep }: { s: Scene; i: number; active: boolean; step: number; onStep: (st: number) => void }) {
  return (
    <article className={`glass p-5 transition-[opacity,transform,box-shadow] duration-700 md:p-6 ${active ? "opacity-100 shadow-[0_24px_60px_-30px_rgba(8,124,248,.45)]" : "opacity-55 lg:translate-y-1"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`kpi grid size-8 place-items-center rounded-full text-[13px] ${active ? "bg-cyan text-white" : "bg-panel-2 text-muted"}`}>{String(i + 1).padStart(2, "0")}</span>
        <Chip tone="blue" className="mono">{s.feature}</Chip>
      </div>
      <h2 id={`scene-${s.id}`} className="mt-3 text-[24px] font-semibold leading-[1.15] md:text-[27px]" style={{ letterSpacing: "-0.035em" }}>{s.title}</h2>
      {s.steps && (
        <div role="tablist" aria-label="Step" className="mt-3 inline-flex gap-1 rounded-full bg-panel-2 p-1">
          {s.steps.map((label, k) => (
            <button key={label} role="tab" aria-selected={active && step === k} onClick={() => onStep(k)}
              className={`rounded-full px-3 py-1 text-[12.5px] font-medium transition-colors ${active && step === k ? "bg-deep text-white" : "text-muted hover:text-paper"}`}>
              {k + 1}. {label}
            </button>
          ))}
        </div>
      )}
      <p className="mt-3 text-[15px] leading-relaxed text-paper/85 [&_code]:mono [&_code]:rounded [&_code]:bg-panel-2 [&_code]:px-1 [&_code]:py-px [&_code]:text-[12.5px] [&_code]:text-deep">{s.body}</p>
      {s.stats.length > 0 && <Stats stats={s.stats} />}
      {s.extra && <div className="mt-3">{s.extra}</div>}
      <Cypher code={s.cypher} source={s.source} />
    </article>
  );
}

const TONE: Record<NonNullable<Stat["tone"]>, string> = { ok: "text-ok", warn: "text-verify", ring: "text-ring", blue: "text-cyan" };

function Stats({ stats }: { stats: Stat[] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {stats.map((x) => (
        <div key={x.label} className="flex flex-col rounded-2xl bg-panel-2 px-3 py-2.5">
          <dt className="order-2 mt-1.5 text-[11.5px] leading-snug text-muted">{x.label}</dt>
          <dd className={`kpi order-1 truncate text-[21px] leading-none md:text-[24px] ${x.tone ? TONE[x.tone] : "text-paper"}`}>{x.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const KW = /\b(CALL|MATCH|OPTIONAL|WHERE|WITH|RETURN|YIELD|CREATE|SET|UNION|ALL|UNWIND|ORDER BY|LIMIT|DISTINCT|AS|AND|OR|IN|IS|NULL|STARTS WITH|DESC|MERGE|ACL SETUSER|GRAPH\.RO_QUERY|GRAPH\.QUERY)\b/g;

function highlight(line: string): ReactNode[] {
  if (line.trimStart().startsWith("#")) return [<span key="c" className="text-white/45">{line}</span>];
  const out: ReactNode[] = [];
  // algo.* procedures, then keywords, then strings and $params
  const re = /(algo\.[A-Za-z]+)|('[^']*')|("[^"]*")|(\$[a-z_]+)|(:[A-Z][A-Za-z_]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const kw = (t: string, k: string) => t.split(KW).map((p, j) => (j % 2 ? <span key={`${k}-${j}`} className="font-semibold text-sky">{p}</span> : <Fragment key={`${k}-${j}`}>{p}</Fragment>));
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(...kw(line.slice(last, m.index), `t${last}`));
    const cls = m[1] ? "font-semibold text-[#ffd27a]" : m[2] || m[3] ? "text-[#9ee6c4]" : m[4] ? "text-[#f5a3c7]" : "text-[#bcd7ff]";
    out.push(<span key={`m${m.index}`} className={cls}>{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push(...kw(line.slice(last), `t${last}`));
  return out;
}

function Cypher({ code, source }: { code: string; source: string }) {
  if (!code) return null;
  return (
    <figure className="mt-4 overflow-hidden rounded-2xl bg-deep shadow-[0_18px_40px_-26px_rgba(11,42,91,.9)]">
      <figcaption className="flex items-center gap-2 border-b border-white/10 px-4 py-2 text-[11.5px] text-white/60">
        <span className="flex gap-1"><i className="size-2 rounded-full bg-white/25" /><i className="size-2 rounded-full bg-white/25" /><i className="size-2 rounded-full bg-white/25" /></span>
        <span className="font-medium text-white/85">Cypher on FalkorDB</span>
        <span className="mono ml-auto truncate" title={source}>{source}</span>
      </figcaption>
      <pre className="mono scroll-thin max-h-[260px] overflow-auto !bg-transparent px-4 py-3 text-[11.5px] leading-[1.65] text-white/90">
        {code.split("\n").map((l, i) => <span key={i} className="block min-h-[1em] whitespace-pre">{highlight(l)}</span>)}
      </pre>
    </figure>
  );
}

function StageSkeleton() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="flex flex-col items-center gap-3 text-sm text-muted">
        <span className="size-10 animate-spin rounded-full border-2 border-sky border-t-cyan motion-reduce:animate-none" />
        Loading the consortium graph…
      </div>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="space-y-4 py-[9vh]">
      {[0, 1].map((k) => (
        <div key={k} className="glass space-y-3 p-6">
          <div className="h-5 w-40 animate-pulse rounded-full bg-panel-2" />
          <div className="h-7 w-3/4 animate-pulse rounded-full bg-panel-2" />
          <div className="h-24 animate-pulse rounded-2xl bg-panel-2" />
        </div>
      ))}
    </div>
  );
}
