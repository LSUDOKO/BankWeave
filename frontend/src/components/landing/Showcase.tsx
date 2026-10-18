"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Arrow, BrowserFrame, SectionHead, delay, useReveal } from "./parts";

// Landing sections built from real captures: the newest features (NewIn3), the GIF recordings on
// third-party tools (RealTools) and the stills from FalkorDB's own browser (BrowserProof).

const MCP_URL = "https://bankweave-api.onrender.com/mcp";
const INSTALL = `claude mcp add --transport http bankweave ${MCP_URL}`;
const MCP_DOC = "https://github.com/LSUDOKO/BankWeave/blob/main/docs/MCP.md";
const CARD = "group relative flex flex-col overflow-hidden rounded-[28px] border border-line bg-[#f6f8fb] transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(12,26,46,.35)]";

function Shot({ src, alt, w = 1440, h = 900, className = "" }: { src: string; alt: string; w?: number; h?: number; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static capture, served as-is
  return <img src={src} alt={alt} width={w} height={h} loading="lazy" decoding="async" className={`block h-auto w-full ${className}`} />;
}

function CardText({ kicker, title, body, cta }: { kicker: string; title: string; body: ReactNode; cta: string }) {
  return (
    <div className="p-7 pb-0 sm:p-8 sm:pb-0">
      <p className="mono text-[11px] font-medium uppercase tracking-[.12em] text-cyan">{kicker}</p>
      <h3 className="mt-3 text-[24px] font-semibold leading-tight sm:text-[28px]" style={{ letterSpacing: "-0.035em" }}>{title}</h3>
      <p className="mt-2.5 max-w-[52ch] text-[15px] leading-relaxed text-muted">{body}</p>
      <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan">{cta} <Arrow /></span>
    </div>
  );
}

/* ---------------------------------------------------------------- What's new */

const TOOLS: [string, string][] = [
  ["engine_overview", "INFO memory, GRAPH.LIST"],
  ["get_case", "one graph per case"],
  ["explain_claim", "DERIVED_FROM*0..5"],
  ["trace_money_path", "algo.SPpaths"],
  ["find_rings", "algo.labelPropagation"],
  ["top_hubs", "algo.pageRank"],
  ["similar_accounts", "HNSW vector index"],
  ["run_readonly_cypher", "GRAPH.RO_QUERY"],
];

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard blocked: the line stays selectable */ }
  };
  return (
    <button type="button" onClick={copy} aria-label="Copy the install command"
      className="shrink-0 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-white transition hover:bg-white/20">
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function McpTerminal() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#071a3a] shadow-[0_30px_60px_-30px_rgba(4,20,48,.8)]">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/5 px-3.5 py-2">
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <i key={c} className="size-2.5 rounded-full" style={{ background: c }} />)}
        <span className="mono mx-auto text-[11px] text-white/55">terminal</span>
        <span className="w-[42px]" aria-hidden />
      </div>
      <div className="mono flex-1 space-y-4 p-5 text-[12.5px] leading-relaxed text-[#cfe2ff]">
        <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.04] p-3">
          <code className="min-w-0 flex-1 select-all break-all"><span className="text-[#8ad8fc]">$ </span>{INSTALL}</code>
          <CopyButton text={INSTALL} />
        </div>
        <p className="text-white/50"># 17 read-only tools; each one returns the Cypher it ran</p>
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {TOOLS.map(([t, f]) => (
            <li key={t} className="flex min-w-0 items-baseline justify-between gap-3 border-b border-white/5 pb-1.5">
              <span className="truncate text-white">{t}</span>
              <span className="truncate text-[11px] text-[#8ad8fc]/80">{f}</span>
            </li>
          ))}
        </ul>
        <p className="text-white/50"># and 9 more: list_graphs, graph_schema, list_cases, account_network, …</p>
      </div>
    </div>
  );
}

export function NewIn3() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} id="new" className="mx-auto mt-32 max-w-[1180px] scroll-mt-24 px-4 md:px-8">
      <SectionHead kicker="What's new in v3" title="Look inside the graph yourself"
        sub="A Cypher explorer over every graph, a 3D walkthrough where each scene is one FalkorDB call, a live dashboard and an MCP server you can add to Claude." />

      <div className="mt-14 grid gap-4 lg:grid-cols-12">
        {/* Graph explorer: the ring, with the PageRank view overlapping it */}
        <Link href="/explorer" data-reveal style={delay(0)} className={`${CARD} lg:col-span-7`}>
          <CardText kicker="Graph explorer" title="Any read-only Cypher, on any graph"
            body="Twelve presets run live against FalkorDB Cloud: a cross-bank ring laid out by bank, algo.pageRank over the consortium, shared devices. Edit the query and run your own."
            cta="Open /explorer" />
          <div className="relative mt-8 min-h-[240px] flex-1 sm:min-h-[340px]">
            <BrowserFrame url="bankweave.vercel.app/explorer" className="absolute left-7 right-[-12%] top-0 transition-transform duration-700 group-hover:-translate-y-1 sm:left-8">
              <Shot src="/media/landing/explorer-ring.webp" alt="Graph explorer on the live site showing a cross-bank ring coloured by bank" />
            </BrowserFrame>
            <BrowserFrame url="bankweave.vercel.app/explorer" className="absolute bottom-[-24%] left-4 hidden w-[54%] sm:left-5 transition-transform duration-700 group-hover:-translate-y-2 sm:block">
              <Shot src="/media/landing/explorer-pagerank.webp" alt="Graph explorer running algo.pageRank, hubs sized by score" />
            </BrowserFrame>
          </div>
        </Link>

        {/* 3D explainer */}
        <Link href="/explainer" data-reveal style={delay(1)} className={`${CARD} lg:col-span-5`}>
          <CardText kicker="3D explainer" title="How it works, in eight scenes"
            body="Six bank graphs, the consortium joining them and the ring that only appears there. Each scene is one FalkorDB call you can read."
            cta="Open /explainer" />
          <div className="relative mt-8 flex-1 px-7 sm:px-8">
            <BrowserFrame url="bankweave.vercel.app/explainer" className="relative z-[1] -mb-px rounded-b-none transition-transform duration-700 group-hover:-translate-y-1">
              <Shot src="/media/landing/explainer-ring.webp" alt="3D explainer scene: the laundering ring lit up across bank layers" />
            </BrowserFrame>
            <div className="absolute right-4 top-[-26px] hidden w-[40%] rotate-[3deg] overflow-hidden rounded-xl border-4 border-white shadow-[0_20px_40px_-20px_rgba(4,38,84,.6)] transition-transform duration-700 group-hover:rotate-[1deg] sm:block">
              <Shot src="/media/landing/explainer-banks.webp" alt="3D explainer scene: six bank graphs stacked as layers" />
            </div>
          </div>
        </Link>

        {/* Dashboard */}
        <Link href="/command" data-reveal style={delay(2)} className={`${CARD} lg:col-span-5`}>
          <CardText kicker="Dashboard" title="The whole consortium on one screen"
            body="Alert queue, open cases, approvals waiting for a signature, FalkorDB health and what each agent is doing, refreshed from the live API."
            cta="Open /command" />
          <div className="mt-8 flex-1 pl-7 sm:pl-8">
            <BrowserFrame url="bankweave.vercel.app/command" className="-mr-px rounded-b-none rounded-r-none border-r-0 transition-transform duration-700 group-hover:-translate-y-1">
              <Shot src="/media/landing/dashboard.webp" alt="BankWeave dashboard with live counters, FalkorDB health and agent activity" />
            </BrowserFrame>
          </div>
        </Link>

        {/* Hosted MCP: the card links to the docs; the copy button sits outside the link */}
        <div data-reveal style={delay(3)} className={`${CARD} bg-[linear-gradient(160deg,#0b2a5b_0%,#071c40_100%)] lg:col-span-7`}>
          <div className="p-7 pb-0 sm:p-8 sm:pb-0">
            <p className="mono text-[11px] font-medium uppercase tracking-[.12em] text-sky">Hosted MCP</p>
            <h3 className="mt-3 text-[24px] font-semibold leading-tight text-white sm:text-[28px]" style={{ letterSpacing: "-0.035em" }}>Ask Claude about the graph</h3>
            <p className="mt-2.5 max-w-[56ch] text-[15px] leading-relaxed text-[#a9bcd8]">
              One line adds BankWeave to Claude. No install, no key: the server is the live API, read-only, with 3 prompts and 2 resources besides the tools.
            </p>
            <a href={MCP_DOC} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-sky hover:text-white">
              Read docs/MCP.md <Arrow />
            </a>
          </div>
          <div className="flex-1 p-4 pt-6 sm:p-6">
            <McpTerminal />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- Real tools */

const RECORDINGS: { src: string; w: number; h: number; url: string; title: string; caption: string }[] = [
  {
    src: "/media/hw/wokwi-esp32.gif", w: 1200, h: 552, url: "wokwi.com",
    title: "Our ESP32 sketch, running in Wokwi",
    caption: "The sketch posts a card tap over HTTPS to the live API, which answers 00 APPROVED, writes the CARD_TXN edge into FalkorDB Cloud and returns ISO 8583 field 55 to the serial monitor.",
  },
  {
    src: "/media/hw/emvlab-decode.gif", w: 1200, h: 552, url: "emvlab.org/tlvutils",
    title: "EMVLab decodes that exact TLV",
    caption: "The field 55 printed by the board, pasted into EMVLab.org's decoder: amount, currency, IFD serial, transaction counter and cryptogram all parse.",
  },
  {
    src: "/media/hw/falkordb-browser.gif", w: 1100, h: 485, url: "browser.falkordb.com",
    title: "FalkorDB's own browser on our Cloud instance",
    caption: "The cross-bank ring, algo.pageRank, the card-tap edges, a SAR's provenance chain and vector KNN, typed in as read-only queries. The hostname bar is cropped.",
  },
  {
    src: "/media/hw/falkordb-cloud-instance.gif", w: 1100, h: 506, url: "app.falkordb.cloud",
    title: "The FalkorDB Cloud console",
    caption: "The instance the live site runs on: Free tier, ap-south-1, FalkorDB v4.22.0, status healthy.",
  },
];

export function RealTools() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} id="recorded" className="mx-auto mt-32 max-w-[1180px] scroll-mt-24 px-4 md:px-8">
      <SectionHead kicker="Not a mock-up" title="Recorded on the real tools"
        sub="Screen recordings on third-party sites. The terminal and the ESP32 are simulations; the HTTPS call, the graph write and the TLV are real." />
      <div className="mt-14 grid gap-5 md:grid-cols-2">
        {RECORDINGS.map((r, i) => (
          <figure key={r.src} data-reveal style={delay(i % 2)}
            className="group rounded-[28px] border border-line bg-[#f6f8fb] p-3 transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(12,26,46,.35)] sm:p-4">
            <BrowserFrame url={r.url}>
              <div className="bg-white" style={{ aspectRatio: `${r.w} / ${r.h}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- plain img so the GIF animates */}
                <img src={r.src} width={r.w} height={r.h} alt={r.title} loading="lazy" decoding="async" className="block h-full w-full object-contain" />
              </div>
            </BrowserFrame>
            <figcaption className="px-2 pb-2 pt-5 sm:px-3">
              <h3 className="text-[18px] font-semibold" style={{ letterSpacing: "-0.025em" }}>{r.title}</h3>
              <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{r.caption}</p>
            </figcaption>
          </figure>
        ))}
      </div>
      <p data-reveal className="mt-6 text-center text-sm text-muted">
        Try the terminals and the security key on the <Link href="/hardware-lab" className="link font-medium">Hardware Lab</Link>.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------- FalkorDB Browser stills */

const STILLS: { file: string; title: string; ms?: string; detail: string; span: string }[] = [
  { file: "01-browser-cross-bank-ring", title: "The cross-bank ring", ms: "1.85 ms", detail: "12 nodes, 166 edges", span: "md:col-span-2 lg:col-span-2 lg:row-span-2" },
  { file: "02-browser-pagerank", title: "algo.pageRank, top 12", ms: "3.55 ms", detail: "native GraphBLAS", span: "" },
  { file: "03-browser-card-taps", title: "Card taps into terminals", ms: "0.41 ms", detail: "29 CARD_TXN edges", span: "" },
  { file: "04-browser-terminal-node", title: "The Mumbai POS node", detail: "with its GPS, 19.076, 72.8777", span: "" },
  { file: "05-browser-sar-provenance", title: "SAR → sentence → claim → evidence", ms: "0.61 ms", detail: "the provenance gate as a pattern", span: "" },
  { file: "06-browser-vector-knn", title: "Vector KNN", ms: "0.36 ms", detail: "behaviour twins at five banks", span: "lg:col-span-2" },
  { file: "07-browser-shared-identity", title: "Shared devices and IPs", ms: "2.79 ms", detail: "291 nodes, 220 edges", span: "lg:col-span-2" },
];

export function BrowserProof() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} id="falkordb-browser" className="mx-auto mt-32 max-w-[1180px] scroll-mt-24 px-4 md:px-8">
      <SectionHead kicker="FalkorDB Browser" title="Open it in FalkorDB's own browser"
        sub="The graphs the agents use, queried in browser.falkordb.com against our Cloud instance (v4.22, 36 graphs). Timings are the engine's own readout." />
      <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STILLS.map((s, i) => (
          <figure key={s.file} data-reveal style={delay(i, 60)}
            className={`group flex flex-col overflow-hidden rounded-[24px] border border-line bg-white shadow-[var(--shadow)] transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-30px_rgba(12,26,46,.4)] ${s.span}`}>
            <a href={`/media/falkordb/${s.file}.png`} target="_blank" rel="noopener noreferrer" aria-label={`Open the full-size capture: ${s.title}`}
              className="relative block min-h-0 flex-1 overflow-hidden bg-[#f6f8fb]">
              {/* eslint-disable-next-line @next/next/no-img-element -- static capture, served as-is */}
              <img src={`/media/landing/fdb-${s.file}.webp`} width={1568} height={692} alt={`FalkorDB Browser: ${s.title}`} loading="lazy" decoding="async"
                className="block h-full w-full object-cover object-left-top transition-transform duration-700 group-hover:scale-[1.02]" style={{ aspectRatio: "1568 / 692" }} />
            </a>
            <figcaption className="flex items-start justify-between gap-3 border-t border-line px-4 py-3">
              <div className="min-w-0">
                <h3 className="text-[14px] font-semibold leading-snug">{s.title}</h3>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.detail}</p>
              </div>
              {s.ms && <span className="mono shrink-0 rounded-full bg-[#eef5ff] px-2.5 py-1 text-[11px] font-semibold text-cyan ring-1 ring-cyan/15">{s.ms}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
