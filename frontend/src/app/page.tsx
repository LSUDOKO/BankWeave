"use client";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import WeaveField from "@/components/WeaveField";
import { Logo } from "@/components/TopNav";
import { API } from "@/lib/api";
import { live } from "@/lib/snapshot";
import shotCommand from "@/assets/shots/01-command-center.webp";
import shotEvidence from "@/assets/shots/08-case-evidence.webp";
import shotTrace from "@/assets/shots/11-case-trace.webp";
import shotDossier from "@/assets/shots/12-audit-dossier.webp";
import shot3d from "@/assets/shots/13-consortium-3d.webp";
import shotWebauthn from "@/assets/shots/21-hw-webauthn-receipt.webp";

// Landing: the shader hero and call to action frame a product tour built from real
// live-site screenshots, live API numbers and the measured results in eval/results.
type Overview = {
  alerts: { total: number; cleared?: number; case?: number };
  cases: { total: number; pending_actions: number };
  claims: { independent: number; paths: number; origins: number };
  falkordb: { region: string; graphs: number; version: string | null; memory: { used_mb: number; max_mb: number | null } };
  ms: number;
};

const BLEED = { width: "100vw", marginLeft: "calc(50% - 50vw)" };
const INSET = { width: "calc(100vw - 24px)", marginLeft: "calc(50% - 50vw + 12px)" }; // same 12px frame as the hero card
const ONE_BANK = "#0c9aa6"; // validated against --cyan for CVD and normal-vision separation
const n = (x?: number) => (x == null ? "…" : Math.round(x).toLocaleString());

export default function Landing() {
  const [d, setD] = useState<Overview | null>(null);
  const [replay, setReplay] = useState(false);
  useEffect(() => { live<Overview>("/overview").then(({ data, replay }) => { setD(data); setReplay(replay); }).catch(() => {}); }, []);
  return (
    <>
      <Hero />
      <ProductReveal d={d} replay={replay} />
      <Results />
      <CaseTour />
      <AgentFlow />
      <Faqs />
      <CallToAction />
      <Footer />
    </>
  );
}

function Hero() {
  // an inset card exactly one viewport tall: the first screen is complete, with rounded edges instead of a hard cut
  return (
    <section className="hero-card hero-blue relative flex items-center justify-center overflow-hidden rounded-[28px] shadow-[0_30px_80px_-40px_rgba(4,38,84,.6)]"
      style={{ width: "calc(100vw - 24px)", marginLeft: "calc(50% - 50vw + 12px)", marginTop: -20, height: "calc(100svh - 24px)" }}>
      <WeaveField />
      <div className="hero-par relative flex flex-col items-center justify-center px-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-white sm:whitespace-nowrap md:text-6xl lg:text-7xl" style={{ letterSpacing: "-0.05em" }}>
          Find the laundering ring <br />
          no single bank can see
        </h1>
        <p className="mt-4 max-w-2xl text-center text-lg leading-relaxed text-white/90 lg:text-xl">
          BankWeave is a team of AI agents that investigates alerts across banks in one FalkorDB instance: each bank keeps its
          own graph, rings appear where those graphs join, and every sentence of a report points to the query that proves it.
        </p>
        <div className="mt-6 scale-110">
          <Link href="/command" className="inline-block rounded-xl bg-white px-5 py-2.5 font-semibold text-cyan shadow-lg shadow-black/10 hover:bg-white/90">Open the console</Link>
        </div>
      </div>
      <a href="#product" aria-label="Scroll to the product" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/70 hover:text-white">
        <span className="scroll-cue block h-9 w-5 rounded-full border-2 border-current" />
      </a>
    </section>
  );
}

function ProductReveal({ d, replay }: { d: Overview | null; replay: boolean }) {
  const decided = (d?.alerts.cleared ?? 0) + (d?.alerts.case ?? 0);
  return (
    <section id="product" className="mx-auto max-w-[1180px] pt-28">
      <Head kicker="The console" title="Every bank's investigators, one live picture" sub="Alerts, cases, evidence and engine health from the same FalkorDB Cloud instance the agents write to." />
      <div className="tilt-stage relative mt-14">
        <div className="tilt">
          <Shot src={shotCommand} alt="BankWeave Command Center on the live site" label="bankweave.vercel.app/command" />
        </div>
        <Float className="float-a -left-4 top-[18%] hidden md:block" label="Alerts decided by agents" value={n(decided)} sub={`of ${n(d?.alerts.total)} raised`} tone="text-paper" />
        <Float className="float-b -right-4 top-[38%] hidden md:block" label="Independent claims" value={n(d?.claims.independent)} sub={`${n(d?.claims.paths)} paths · ${n(d?.claims.origins)} origins`} tone="text-ok" />
        <Float className="float-a bottom-[10%] left-[12%] hidden md:block" label={replay ? "Seeded replay" : "Live API"} value={d ? `${Math.round(d.ms)} ms` : "…"} sub="overview query" tone="text-cyan" />
      </div>
    </section>
  );
}

function Results() {
  return (
    <section className="mt-32 bg-panel-2/70 py-24" style={BLEED}>
      <div className="mx-auto max-w-[1180px] px-4 md:px-8">
        <Head kicker="Measured on IBM's laundering data" title="The numbers, not the pitch" sub="Every figure below comes from eval/results in the repo, against IBM's labelled synthetic AML transactions." />
        <div className="mt-14 grid gap-4 md:grid-cols-2">
          <ChartCard title="No bank can see the ring alone" note="E2 · 36 cross-bank laundering groups, 3.5 banks each">
            <RingChart />
          </ChartCard>
          <ChartCard title="Triage F1 against IBM's labels" note="E1 · 4,000 held-out alerted accounts, base rate 3.2%">
            <TriageChart />
          </ChartCard>
          <ChartCard title="Median query latency" note="E7 · 1.3M transfers, one local machine, log scale" className="md:col-span-2">
            <LatencyChart />
          </ChartCard>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[["27.8%", "of evidence echoed an origin already seen", "E6 echo"], ["25 / 28", "SARs passed the provenance gate", "E6 gate"],
            ["0.988", "mean provenance fidelity", "E6 gate"], ["100%", "recall on cascading invalidation", "E6 cascade"]].map(([v, l, k]) => (
            <div key={l} className="glass reveal p-5">
              <p className="kpi text-[34px] leading-none text-paper">{v}</p>
              <p className="mt-2 text-sm text-muted">{l}</p>
              <p className="mono mt-3 text-muted/80">{k}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CaseTour() {
  const steps: [string, string, string, string, StaticImageData, string][] = [
    ["Evidence", "Evidence,\ncounted once", "Ten paths to one shared device are one fact. Confidence is computed over independent origins, not paths.", "bankweave.vercel.app/cases", shotEvidence, "/cases"],
    ["Consortium", "Every bank,\none picture", "Six bank graphs below, the consortium where they meet, and the cases the agents built on top, in 3D.", "bankweave.vercel.app/consortium-3d", shot3d, "/consortium-3d"],
    ["Trace", "Every call,\non the record", "OpenTelemetry spans from the live agents: which tool ran, how long it took, where the LLM was rate-limited.", "bankweave.vercel.app/cases", shotTrace, "/cases"],
    ["Dossier", "Reports you\ncan verify", "Every sentence, the evidence it cites and each query's hash, under an Ed25519-signed Merkle root.", "bankweave.vercel.app/cases", shotDossier, "/cases"],
    ["Approval", "A human signs\nfirst", "Approvals are signed with WebAuthn over the Merkle root; change any evidence later and the seal breaks.", "bankweave.vercel.app/hardware-lab", shotWebauthn, "/hardware-lab"],
  ];
  const N = steps.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % N), 6000);
    return () => clearInterval(t);
  }, [paused, N]);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") setActive((a) => (a + 1) % N);
    if (e.key === "ArrowLeft") setActive((a) => (a + N - 1) % N);
  };
  return (
    <section className="mx-auto mt-32 max-w-[1180px]" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <Head kicker="Inside a case" title="Open any case and check it yourself" sub="Screens from the live site, running on FalkorDB Cloud with the agents on Groq." />
      <div role="tablist" aria-label="Case features" onKeyDown={onKey} className="mt-8 flex flex-wrap justify-center gap-2">
        {steps.map(([tab], i) => (
          <button key={tab} role="tab" aria-selected={i === active} aria-controls="case-tour" onClick={() => setActive(i)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${i === active
              ? "border-cyan bg-cyan text-white shadow-[0_8px_20px_-8px_rgba(8,124,248,.6)]" : "border-line bg-white text-muted hover:text-paper"}`}>{tab}</button>
        ))}
      </div>
      {/* looping carousel: the active card centred and bright, its neighbours smaller and dimmed at the edges */}
      <div id="case-tour" className="tour relative mt-6 h-[calc(var(--h)+48px)] overflow-x-clip" style={BLEED}>
        {steps.map(([tab, title, body, url, src, href], i) => {
          let off = (((i - active) % N) + N) % N;
          if (off > N / 2) off -= N;
          const on = off === 0, near = Math.abs(off) === 1;
          return (
            <article key={tab} aria-hidden={!on} onClick={() => setActive(i)}
              className={`tour-card absolute left-1/2 top-4 flex h-[var(--h)] flex-col overflow-hidden rounded-[32px] border p-5 sm:p-6 ${on
                ? "border-white bg-white shadow-[0_40px_90px_-40px_rgba(4,38,84,.5)]" : "cursor-pointer border-line bg-white/70"}`}
              style={{ transform: `translateX(calc(-50% + ${off} * (var(--w) * 0.925 + 24px))) scale(${on ? 1 : 0.85})`,
                opacity: on ? 1 : near ? 0.45 : 0, zIndex: on ? 2 : 1, pointerEvents: on || near ? "auto" : "none" }}>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line shadow-[0_20px_40px_-28px_rgba(4,38,84,.45)] [mask-image:linear-gradient(180deg,#000_88%,transparent)]">
                <div className="flex items-center gap-1.5 border-b border-line bg-panel-2/70 px-3 py-1.5">
                  {["#ff5f57", "#febc2e", "#28c840"].map((c) => <i key={c} className="size-2 rounded-full" style={{ background: c }} />)}
                  <span className="mono mx-auto truncate text-[10px] text-muted">{url}</span>
                </div>
                <div className="relative min-h-0 flex-1">
                  <Image src={src} alt={`${tab} on the live site`} placeholder="blur" sizes="(min-width: 900px) 820px, 90vw" className="absolute inset-0 h-full w-full object-cover object-top" />
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-8">
                <h3 className="whitespace-pre-line text-[26px] font-semibold leading-[1.05] sm:text-[30px]" style={{ letterSpacing: "-0.035em" }}>{title}</h3>
                <div>
                  <p className="text-muted">{body}</p>
                  <Link href={href} tabIndex={on ? 0 : -1} className={`link mt-2 inline-block text-sm font-medium transition-opacity ${on ? "" : "opacity-0"}`}>See it live →</Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AgentFlow() {
  const nodes: [string, string, number, number, string?][] = [
    ["Orchestrator", "alerts → tasks", 70, 130], ["Triage", "clear or open", 230, 130], ["Investigator", "claims + evidence", 400, 70],
    ["Skeptic", "innocent case", 400, 190], ["Reporter", "SAR draft", 570, 130], ["Auditor", "other model", 720, 130],
    ["Human", "signs approval", 870, 70, "var(--ok)"], ["Archivist", "saves procedure", 870, 190],
  ];
  const edges = ["M120 130 H180", "M280 130 C330 130 330 70 350 70", "M450 70 C480 70 480 130 520 130", "M400 92 V168", "M620 130 H670", "M770 130 C800 130 800 70 820 70", "M870 92 V168"];
  return (
    <section className="hero-blue mt-24 rounded-[28px] py-24" style={INSET}>
      <div className="mx-auto max-w-[1180px] px-4 md:px-8">
        <Head light kicker="How it works" title="Seven agents, one blackboard in the graph" sub="LLMs plan and write. Cypher and FalkorDB's algorithms compute. A human approves every action." />
        <div className="glass reveal mt-14 overflow-hidden p-6">
          <svg viewBox="0 0 960 260" className="hidden w-full md:block" role="img" aria-label="Agent pipeline: Orchestrator, Triage, Investigator and Skeptic, Reporter, Auditor, Human approval, Archivist">
            <defs>
              <linearGradient id="flow" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="960" y2="0"><stop offset="0" stopColor="var(--sky)" /><stop offset="1" stopColor="var(--cyan)" /></linearGradient>
            </defs>
            {edges.map((e) => <path key={e} d={e} fill="none" stroke="var(--line)" strokeWidth="2" />)}
            {edges.map((e) => <path key={e + "f"} d={e} fill="none" stroke="url(#flow)" strokeWidth="2" strokeLinecap="round" className="flow-dash" />)}
            {nodes.map(([t, s, x, y, c]) => (
              <g key={t} transform={`translate(${x - 52},${y - 22})`}>
                <rect width="104" height="44" rx="12" fill="white" stroke={c ?? "var(--line)"} strokeWidth={c ? 2 : 1} />
                <text x="52" y="19" textAnchor="middle" fontSize="13" fontWeight="650" fill="var(--paper)">{t}</text>
                <text x="52" y="34" textAnchor="middle" fontSize="10.5" fill="var(--muted)">{s}</text>
              </g>
            ))}
            <text x="412" y="134" fontSize="10.5" fill="var(--verify)">≤ 2 rounds</text>
          </svg>
          <ol className="grid gap-2 md:hidden">
            {nodes.map(([t, s], i) => (
              <li key={t} className="flex items-center gap-3 rounded-xl border border-line bg-white px-3 py-2">
                <span className="mono text-cyan">{i + 1}</span><span className="font-semibold">{t}</span><span className="ml-auto text-sm text-muted">{s}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function Faqs() {
  const items: [string, string][] = [
    ["What is BankWeave?", "A multi-agent anti-money-laundering system. It loads IBM's public synthetic AML data into one FalkorDB graph per bank plus a consortium graph, lets agents work the alert queue, and publishes reports where every sentence cites its evidence and query."],
    ["Do banks share raw customer data?", "No. Each bank's transfers stay in its own graph, and the consortium links accounts by salted, enclave-blinded ids. Per-bank ACLs let a bank read only its own graph."],
    ["What do the LLMs actually decide?", "They plan, choose tools and write prose. Paths, flows, centrality and communities are computed by Cypher and FalkorDB's algorithms. Without an API key the agents follow a deterministic policy, and the UI says so."],
    ["How do you stop a report from inventing agreement?", "Confidence counts independent origins, overturned evidence cascades to every claim resting on it, and a provenance gate blocks any sentence without a citation. A different, larger model audits the result."],
    ["Is any of this mocked?", "The data is IBM's synthetic AML set and the live site runs on FalkorDB Cloud. The card terminals, enclave and security key are labelled simulations; their hashes, signatures and graph writes are real."],
    ["Why does a page say \"Seeded replay\"?", "The API runs on Render's free plan, which sleeps when idle. While it wakes, pages render from snapshots of real API responses."],
  ];
  return (
    <section id="faqs" className="py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-16">
          <h2 className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl">Frequently<br />asked<br />questions</h2>
          <div className="space-y-6">
            {items.map(([q, a]) => (
              <details key={q} name="faq" className="faq border-b border-line pb-6">
                <summary className="flex w-full cursor-pointer list-none items-center space-x-4 text-left transition-colors hover:text-cyan">
                  <span className="faq-sign text-2xl font-bold text-cyan" />
                  <h3 className="text-xl font-semibold">{q}</h3>
                </summary>
                <div className="mt-4 pl-10 text-muted">{a}</div>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section className="py-16 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="hero-blue relative overflow-hidden rounded-3xl px-8 py-16 md:px-12 md:py-20">
          <WeaveField />
          <div className="relative flex flex-col items-center justify-center px-4 text-center">
            <h2 className="text-5xl font-bold tracking-tight text-white sm:whitespace-nowrap md:text-6xl lg:text-7xl" style={{ letterSpacing: "-0.05em" }}>Watch It Work Live</h2>
            <p className="mt-4 max-w-2xl text-center text-lg leading-relaxed text-white/90 lg:text-xl">
              Agents opening cases on FalkorDB Cloud right now, with every claim one click from the query that proves it.
            </p>
            <div className="mt-6">
              <Link href="/command" className="inline-block rounded-xl bg-white px-5 py-2.5 font-semibold text-cyan shadow-lg shadow-black/10 hover:bg-white/90">Open the console</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const links: [string, [string, string][]][] = [
    ["Explore", [["Golden scenarios", "/scenarios"], ["3D consortium", "/consortium-3d"], ["FalkorDB Lab", "/lab"], ["Evaluation", "/evaluation"]]],
    ["Resources", [["Source on GitHub", "https://github.com/LSUDOKO/BankWeave"], ["API docs", `${API}/docs`], ["FAQ", "#faqs"]]],
    ["Project", [["Hardware Lab", "/hardware-lab"], ["Demo control", "/demo"], ["MIT License", "https://github.com/LSUDOKO/BankWeave/blob/main/LICENSE"]]],
  ];
  // a navy card that closes the page the way the hero opens it, ending in the oversized wordmark
  return (
    <footer className="hero-blue relative mt-8 overflow-hidden rounded-t-[28px] text-white"
      style={{ width: "calc(100vw - 24px)", marginLeft: "calc(50% - 50vw + 12px)", marginBottom: -64 }}>
      <div className="relative mx-auto max-w-[1180px] px-6 pt-16 md:px-10">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          <div className="max-w-sm space-y-5">
            <Link href="/" aria-label="go home" className="flex size-fit items-center gap-2"><Logo light /><span className="text-xl font-bold">BankWeave</span></Link>
            <p className="text-white/80">Cross-bank money-laundering investigations on FalkorDB, with every claim proven.</p>
            <Link href="/command" className="inline-block rounded-xl bg-white px-4 py-2 text-sm font-semibold text-cyan hover:bg-white/90">Open the console</Link>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
            {links.map(([group, items]) => (
              <div key={group} className="space-y-4">
                <span className="block text-sm font-semibold text-white">{group}</span>
                <div className="flex flex-col gap-3">
                  {items.map(([title, href]) => (
                    <Link key={title} href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-sm text-white/75 duration-150 hover:text-white">{title}</Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-2 border-t border-white/20 pt-6 text-xs text-white/70 sm:flex-row sm:justify-between">
          <span>BankWeave · Banks · Graphs · Proof · © {new Date().getFullYear()} · MIT · not a FalkorDB product</span>
          <span>Triaged, investigated, cited, signed, approved.</span>
        </div>
      </div>
      <p aria-hidden className="footer-mark relative select-none text-center">BankWeave</p>
    </footer>
  );
}

function Head({ kicker, title, sub, light = false }: { kicker: string; title: string; sub: string; light?: boolean }) {
  return (
    <div className="reveal mx-auto max-w-[760px] px-4 text-center">
      <p className={`mono font-medium ${light ? "text-white/80" : "text-cyan"}`}>{kicker}</p>
      <h2 className={`mt-3 text-[34px] leading-[1.05] sm:text-[46px] ${light ? "text-white" : ""}`} style={{ letterSpacing: "-0.045em", fontWeight: 700 }}>{title}</h2>
      <p className={`mt-4 text-[17px] ${light ? "text-white/85" : "text-muted"}`}>{sub}</p>
    </div>
  );
}

function Shot({ src, alt, label }: { src: StaticImageData; alt: string; label: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_40px_80px_-40px_rgba(4,38,84,.45),0_2px_6px_rgba(4,38,84,.08)]">
      <div className="flex items-center gap-1.5 border-b border-line bg-panel-2/70 px-3 py-2">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <i key={c} className="size-2.5 rounded-full" style={{ background: c }} />)}
        <span className="mono mx-auto truncate text-muted">{label}</span>
      </div>
      <Image src={src} alt={alt} placeholder="blur" sizes="(min-width: 1180px) 1100px, 100vw" className="block h-auto w-full" />
    </figure>
  );
}

function Float({ className, label, value, sub, tone }: { className: string; label: string; value: string; sub: string; tone: string }) {
  return (
    <div className={`absolute z-10 w-[200px] rounded-2xl border border-white/70 bg-white/85 p-4 shadow-[0_24px_50px_-20px_rgba(4,38,84,.45)] backdrop-blur-xl ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className={`kpi mt-1 text-[28px] leading-none ${tone}`}>{value}</p>
      <p className="mt-1.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

function ChartCard({ title, note, className = "", children }: { title: string; note: string; className?: string; children: React.ReactNode }) {
  return (
    <figure className={`glass reveal p-6 ${className}`}>
      <figcaption>
        <h3 className="text-[17px]">{title}</h3>
        <p className="mono mt-1 text-muted">{note}</p>
      </figcaption>
      <div className="mt-5">{children}</div>
    </figure>
  );
}

type Bar = { label: string; v: number; text: string; color: string; head?: string };

// horizontal bars: thin marks, 4px rounded data end on a square baseline, value labelled at the end, <title> tooltip on hover
// W should match the card's inner width so 12px text renders at 12px
function Bars({ rows, x, ticks = [], label = 190, W = 500 }: { rows: Bar[]; x: (v: number) => number; ticks?: [number, string][]; label?: number; W?: number }) {
  const R = 64, BW = W - label - R, H = 16;
  let y = ticks.length ? 18 : 4;
  const laid = rows.map((r) => { if (r.head) y += 22; const at = y; y += H + 12; return { ...r, at }; });
  return (
    <svg viewBox={`0 0 ${W} ${y}`} className="w-full" role="img" aria-label={rows.map((r) => `${r.head ? r.head + ", " : ""}${r.label}: ${r.text}`).join("; ")}>
      {ticks.map(([t, s]) => (
        <g key={s}>
          <line x1={label + x(t) * BW} x2={label + x(t) * BW} y1={12} y2={y - 8} stroke="var(--line)" />
          <text x={label + x(t) * BW} y={9} textAnchor="middle" fontSize="11" fill="var(--muted)">{s}</text>
        </g>
      ))}
      {laid.map((r, i) => {
        const w = Math.max(0, x(r.v) * BW), rr = Math.min(4, w);
        return (
          <g key={i} className="bar">
            <title>{`${r.head ? r.head + " · " : ""}${r.label}: ${r.text}`}</title>
            {r.head && <text x={0} y={r.at - 9} fontSize="12" fontWeight="650" fill="var(--paper)">{r.head}</text>}
            <text x={label - 10} y={r.at + H / 2 + 4} textAnchor="end" fontSize="12.5" fill="var(--muted)">{r.label}</text>
            <rect x={label} y={r.at - 3} width={BW + R} height={H + 6} fill="transparent" />
            {w > 0 && <path d={`M${label} ${r.at} h${w - rr} a${rr} ${rr} 0 0 1 ${rr} ${rr} v${H - 2 * rr} a${rr} ${rr} 0 0 1 ${-rr} ${rr} h${-(w - rr)} z`} fill={r.color} />}
            <text x={label + w + 6} y={r.at + H / 2 + 4} fontSize="12.5" fontWeight="650" fill="var(--paper)">{r.text}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Legend({ items }: { items: [string, string][] }) {
  return (
    <p className="mb-3 flex flex-wrap gap-4 text-xs text-muted">
      {items.map(([c, t]) => <span key={t} className="inline-flex items-center gap-1.5"><i className="size-2.5 rounded-sm" style={{ background: c }} />{t}</span>)}
    </p>
  );
}

function RingChart() {
  const pct = (v: number) => v / 100;
  return (
    <>
      <Legend items={[[ONE_BANK, "Best-placed single bank"], ["var(--cyan)", "Consortium graph"]]} />
      <Bars label={120} x={pct} rows={[
        { head: "Share of a ring's accounts held", label: "One bank", v: 43.8, text: "43.8%", color: ONE_BANK },
        { label: "Consortium", v: 100, text: "100%", color: "var(--cyan)" },
        { head: "Rings seen whole", label: "One bank", v: 0, text: "0%", color: ONE_BANK },
        { label: "Consortium", v: 100, text: "100%", color: "var(--cyan)" },
      ]} />
    </>
  );
}

function TriageChart() {
  const rows: [string, number][] = [["Escalate everything", 0.062], ["Rules, no graph", 0.126], ["Graph score, hand weights", 0.161], ["Graph score, calibrated", 0.205]];
  return (
    <>
      <Bars x={(v) => v / 0.25} ticks={[[0, "0"], [0.1, "0.10"], [0.2, "0.20"]]} rows={rows.map(([label, v]) => ({ label, v, text: v.toFixed(3), color: "var(--cyan)" }))} />
      <p className="mt-2 text-sm text-muted">Calibrated graph score: <b className="text-paper">3.3×</b> the F1 of escalating every alert, at 174 escalations instead of 4,000.</p>
    </>
  );
}

function LatencyChart() {
  const rows: [string, number][] = [["behaviour neighbours (HNSW)", 0.4], ["cross-bank links", 0.6], ["shared identity", 0.7], ["pass-through check", 2.8],
    ["expand neighbourhood", 3.1], ["typology patterns", 12.5], ["triage signals", 15.4], ["algo.wcc, whole consortium", 39.5], ["algo.pageRank, whole consortium", 57.5]];
  const log = (v: number) => (Math.log10(v) + 1) / 3; // 0.1 ms .. 100 ms
  return <Bars label={240} W={1080} x={log} ticks={[[0.1, "0.1 ms"], [1, "1 ms"], [10, "10 ms"], [100, "100 ms"]]} rows={rows.map(([label, v]) => ({ label, v, text: `${v} ms`, color: "var(--cyan)" }))} />;
}
