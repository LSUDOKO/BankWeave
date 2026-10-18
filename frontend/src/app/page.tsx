"use client";
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import WeaveField from "@/components/WeaveField";
import Numbers from "@/components/landing/Numbers";
import { BrowserProof, NewIn3, RealTools } from "@/components/landing/Showcase";
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
const n = (x?: number) => (x == null ? "…" : Math.round(x).toLocaleString());

export default function Landing() {
  const [d, setD] = useState<Overview | null>(null);
  const [replay, setReplay] = useState(false);
  useEffect(() => { live<Overview>("/overview").then(({ data, replay }) => { setD(data); setReplay(replay); }).catch(() => {}); }, []);
  // reveal-on-scroll for every [data-reveal] block, in every browser
  useEffect(() => {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div className="bg-white">
      <Hero d={d} replay={replay} />
      <div className="mt-16"><Stack /></div>
      <Statement />
      <NewIn3 />
      <Bento d={d} />
      <Numbers />
      <CaseTour />
      <RealTools />
      <BrowserProof />
      <AgentFlow />
      <Faqs />
      <CallToAction />
      <Footer />
    </div>
  );
}

function useScrollProgress(range: number) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const f = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setP(Math.min(1, Math.max(0, window.scrollY / range)))); };
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => { window.removeEventListener("scroll", f); cancelAnimationFrame(raf); };
  }, [range]);
  return p;
}

function Words({ text, from = 0, className = "" }: { text: string; from?: number; className?: string }) {
  // each word rises in on its own beat; the line still reads as one sentence to assistive tech
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i} aria-hidden className={`hero-word ${className}`} style={{ animationDelay: `${(from + i) * 70}ms` }}>{w}&nbsp;</span>
      ))}
    </>
  );
}

function Hero({ d, replay }: { d: Overview | null; replay: boolean }) {
  const p = useScrollProgress(620);
  const decided = (d?.alerts.cleared ?? 0) + (d?.alerts.case ?? 0);
  const [wide, setWide] = useState(true);
  useEffect(() => { const f = () => setWide(window.innerWidth >= 900); f(); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  const line1 = "Find the laundering ring", line2 = "no single bank can see";
  return (
    // one rounded card: glossy bubbles drift across the whole field, the copy sits centred on a soft veil,
    // and the live console rises out of the bottom edge, flattening as you scroll
    <section className="hero-light relative mx-2 mt-2 overflow-hidden rounded-[28px] pt-32 md:mx-3 md:mt-3 md:pt-40">
      <WeaveField zoom={wide ? 2.35 : 1.7} spread={wide ? 2.05 : 1.45} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_52%_40%_at_50%_30%,rgba(248,251,255,.9)_0%,rgba(248,251,255,.6)_45%,rgba(248,251,255,0)_75%)]" />
      <div className="relative mx-auto max-w-[1040px] px-5 text-center" style={{ transform: `translateY(${p * -40}px)`, opacity: 1 - p * 0.6 }}>
        <a href="#product" className="hero-in inline-flex items-center gap-2 rounded-full border border-cyan/20 bg-white/85 py-1 pl-1.5 pr-3.5 text-[13px] text-deep shadow-[var(--shadow)] backdrop-blur hover:border-cyan/40">
          <span className="rounded-full bg-cyan px-2 py-0.5 text-[11px] font-semibold text-white">{replay ? "Replay" : "Live"}</span>
          Running on FalkorDB Cloud · 6 banks · {d ? `${n(d.falkordb.graphs)} graphs` : "…"} · hosted MCP
        </a>
        <h1 aria-label={`${line1} ${line2}`} className="mx-auto mt-7 text-[42px] font-semibold leading-[1.04] text-deep sm:text-[60px] lg:text-[78px]" style={{ letterSpacing: "-0.05em" }}>
          <Words text={line1} from={1} /><br className="hidden sm:block" />
          <Words text={line2} from={1 + line1.split(" ").length} className="bg-gradient-to-r from-[#087cf8] to-[#0a508f] bg-clip-text text-transparent" />
        </h1>
        <p style={{ animationDelay: "720ms" }} className="hero-in mx-auto mt-6 max-w-[660px] text-[17px] leading-relaxed text-[#34496a] md:text-[19px]">
          AI agents investigate alerts across banks in one FalkorDB instance. Each bank keeps its own graph, rings appear where
          the graphs join, and every sentence of a report points to the query that proves it.
        </p>
        <div style={{ animationDelay: "820ms" }} className="hero-in mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/command" className="group inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-3 font-semibold text-white shadow-[0_14px_34px_-12px_rgba(8,124,248,.85)] transition hover:bg-[#1a8bff]">
            Open the console <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
          <Link href="/explainer" className="rounded-xl border-[1.5px] border-deep/80 bg-white/80 px-6 py-3 font-semibold text-deep backdrop-blur transition hover:bg-white">How it works, in 3D</Link>
          <Link href="/explorer" className="rounded-xl px-4 py-3 font-semibold text-deep/80 transition hover:text-deep">Graph explorer →</Link>
        </div>
        <dl style={{ animationDelay: "920ms" }} className="hero-in mx-auto mt-10 grid max-w-[640px] grid-cols-3 gap-2">
          {[[n(decided), "alerts decided by agents"], [n(d?.claims.independent), "independent claims"], [d ? `${Math.round(d.ms)} ms` : "…", "live overview query"]].map(([v, l]) => (
            <div key={l} className="rounded-2xl border border-white bg-white/80 px-3 py-3 shadow-[var(--shadow)] backdrop-blur">
              <dt className="sr-only">{l}</dt><dd className="kpi text-[24px] text-deep md:text-[28px]">{v}</dd><p className="text-[12px] text-muted">{l}</p>
            </div>
          ))}
        </dl>
      </div>
      <div id="product" className="hero-in relative mx-auto mt-14 max-w-[1180px] scroll-mt-24 px-4 md:mt-16" style={{ perspective: "1600px", animationDelay: "1000ms" }}>
        <div className="pointer-events-none absolute inset-x-[12%] -top-6 h-48 rounded-full bg-cyan/25 blur-[90px]" />
        <div style={{ transform: `rotateX(${(1 - p) * 24}deg) scale(${0.9 + p * 0.1}) translateY(${(1 - p) * 30}px)`, transformOrigin: "50% 0%" }} className="will-change-transform">
          <Shot src={shotCommand} alt="BankWeave dashboard on the live site" label="bankweave.vercel.app/command" />
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-[#e9f2ff]" />
    </section>
  );
}


function Stack() {
  const items = ["FalkorDB", "GraphBLAS algorithms", "LangGraph agents", "Groq", "OpenRouter", "HNSW vector index", "Full-text index", "WebAuthn / FIDO2",
    "Ed25519 Merkle seals", "X25519 PSI", "OpenTelemetry", "IBM AML data", "Next.js"];
  return (
    <section aria-label="Built with" className="relative overflow-hidden border-b border-line bg-white py-7">
      <p className="mb-5 text-center text-xs font-medium uppercase tracking-[.16em] text-muted">Built on</p>
      <div className="flex w-max marquee gap-12 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        {[...items, ...items].map((t, i) => <span key={i} className="whitespace-nowrap text-[19px] font-semibold tracking-tight text-[#9aa8bb]">{t}</span>)}
      </div>
    </section>
  );
}

/** A statement whose words light up as it scrolls through the viewport. */
function Statement() {
  const text = "A laundering ring spreads its accounts across banks, so each bank sees a few harmless customers. BankWeave joins their graphs without sharing raw data, and agents prove every link before a human signs.";
  const words = text.split(" ");
  const ref = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    const f = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const vh = window.innerHeight;
      setP(Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35))));
    };
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <section className="mx-auto max-w-[1080px] px-5 py-28 md:py-40">
      <p className="mono mb-6 text-center font-medium text-cyan">Why a consortium graph</p>
      <div ref={ref} className="text-center text-[30px] font-semibold leading-[1.18] md:text-[50px]" style={{ letterSpacing: "-0.04em" }}>
        {words.map((w, i) => (
          <span key={i} className="transition-colors duration-300" style={{ color: i / words.length < p ? "var(--paper)" : "#d3dbe6" }}>{w} </span>
        ))}
      </div>
    </section>
  );
}

function Bento({ d }: { d: Overview | null }) {
  const cards: [string, string, string, string, string][] = [
    ["One graph per bank", "Each bank's transfers live in its own FalkorDB graph with its own ACL. The consortium links accounts by blinded ids.", "/network", "network", "lg:col-span-2"],
    ["Echo-proof confidence", "Ten paths to one shared device count once. Confidence is computed over independent origins.", "/trust", "trust", ""],
    ["Cascading invalidation", "Overturn one fact and every claim, action and sentence resting on it is flagged in one traversal.", "/scenarios#C", "scenarios", ""],
    ["Signed with a hardware key", "Approvals are WebAuthn signatures over the case's Merkle root. Change any evidence and the seal breaks.", "/hardware-lab", "approve", "lg:col-span-2"],
  ];
  return (
    <section className="mx-auto max-w-[1180px] px-5 pb-10">
      <div className="grid gap-4 lg:grid-cols-3">
        {cards.map(([t, b, href, icon, span], i) => (
          <Link key={t} href={href} data-reveal style={{ ["--d" as string]: `${i * 90}ms` }}
            className={`group relative overflow-hidden rounded-[28px] border border-line bg-[#f6f8fb] p-7 transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(12,26,46,.35)] ${span}`}>
            <span className="grid size-11 place-items-center rounded-2xl bg-white text-cyan shadow-[var(--shadow)]"><Icon name={icon} className="size-5" /></span>
            <h3 className="mt-10 text-[24px] font-semibold" style={{ letterSpacing: "-0.03em" }}>{t}</h3>
            <p className="mt-2 max-w-[46ch] text-muted">{b}</p>
            <span className="mt-5 inline-block text-sm font-semibold text-cyan opacity-0 transition-opacity group-hover:opacity-100">Open it live →</span>
            {i === 0 && <span className="kpi absolute right-7 top-6 text-[56px] font-semibold text-[#dbe4ef]">{d ? n(d.falkordb.graphs) : "36"}</span>}
          </Link>
        ))}
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
    <section id="tour" className="mx-auto mt-32 max-w-[1180px] scroll-mt-24" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
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
    <section id="how" className="hero-night relative mx-2 mt-24 overflow-hidden rounded-[32px] py-24 md:mx-3"><div className="dot-grid absolute inset-0" />
      <div className="relative mx-auto max-w-[1180px] px-4 md:px-8">
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
        <div className="hero-light relative overflow-hidden rounded-[32px] px-8 py-16 md:px-12 md:py-24">
          <WeaveField zoom={1.2} /><div className="absolute inset-0 bg-[radial-gradient(closest-side,rgba(255,255,255,.82),rgba(255,255,255,0))]" />
          <div className="relative flex flex-col items-center justify-center px-4 text-center">
            <h2 className="text-5xl font-semibold text-deep md:text-6xl lg:text-7xl" style={{ letterSpacing: "-0.05em" }}>Watch it work <span className="bg-gradient-to-r from-[#087cf8] to-[#0a508f] bg-clip-text text-transparent">live</span></h2>
            <p className="mt-4 max-w-2xl text-center text-lg leading-relaxed text-[#3b5272] lg:text-xl">
              Agents opening cases on FalkorDB Cloud right now, with every claim one click from the query that proves it.
            </p>
            <div className="mt-6">
              <Link href="/command" className="inline-block rounded-xl bg-cyan px-6 py-3 font-semibold text-white shadow-[0_14px_40px_-12px_rgba(8,124,248,.95)] hover:bg-[#1a8bff]">Open the console →</Link>
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
    <footer className="hero-night relative mx-2 overflow-hidden rounded-t-[32px] text-white md:mx-3">
      <div className="relative mx-auto max-w-[1180px] px-6 pt-16 md:px-10">
        <div className="flex flex-col gap-12 lg:flex-row lg:justify-between">
          <div className="max-w-sm space-y-5">
            <Link href="/" aria-label="go home" className="flex size-fit items-center gap-2"><Logo light size={30} /><span className="text-xl font-bold">BankWeave</span></Link>
            <p className="text-[#a9bcd8]">Cross-bank money-laundering investigations on FalkorDB, with every claim proven.</p>
            <Link href="/command" className="inline-block rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a8bff]">Open the console</Link>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:gap-16">
            {links.map(([group, items]) => (
              <div key={group} className="space-y-4">
                <span className="block text-sm font-semibold text-white">{group}</span>
                <div className="flex flex-col gap-3">
                  {items.map(([title, href]) => (
                    <Link key={title} href={href} {...(href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="text-sm text-[#a9bcd8] duration-150 hover:text-white">{title}</Link>
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
      <p className={`mono font-medium ${light ? "text-sky" : "text-cyan"}`}>{kicker}</p>
      <h2 className={`mt-3 text-[34px] leading-[1.05] sm:text-[46px] ${light ? "text-white" : ""}`} style={{ letterSpacing: "-0.045em", fontWeight: 700 }}>{title}</h2>
      <p className={`mt-4 text-[17px] ${light ? "text-[#a9bcd8]" : "text-muted"}`}>{sub}</p>
    </div>
  );
}

function Shot({ src, alt, label, dark = false }: { src: StaticImageData; alt: string; label: string; dark?: boolean }) {
  return (
    <figure className={`overflow-hidden rounded-2xl border bg-white ${dark ? "border-white/15 shadow-[0_60px_120px_-40px_rgba(0,0,0,.7),0_0_0_8px_rgba(255,255,255,.04)]" : "border-line shadow-[0_40px_80px_-40px_rgba(4,38,84,.45),0_2px_6px_rgba(4,38,84,.08)]"}`}>
      <div className="flex items-center gap-1.5 border-b border-line bg-panel-2/70 px-3 py-2">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <i key={c} className="size-2.5 rounded-full" style={{ background: c }} />)}
        <span className="mono mx-auto truncate text-muted">{label}</span>
      </div>
      <Image src={src} alt={alt} placeholder="blur" sizes="(min-width: 1180px) 1100px, 100vw" className="block h-auto w-full" />
    </figure>
  );
}







