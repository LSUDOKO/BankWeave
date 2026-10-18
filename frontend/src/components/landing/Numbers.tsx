"use client";
import Link from "next/link";
import { Arrow, BrowserFrame, SectionHead, delay, useReveal } from "./parts";

// "The numbers, not the pitch": element screenshots of the live /evaluation page, each with the
// figure to read outlined on the page itself before capture. Every number here is in eval/results/*.json.

type Shot = { id: string; tag: string; figure: string; caption: string; src: string; w: number; h: number; alt: string };

const SHOTS: Shot[] = [
  {
    id: "e2", tag: "E2 · Consortium vs single bank", figure: "43.8%",
    caption: "The best-placed single bank holds 43.8% of a ring's accounts on average and holds none of the 36 cross-bank rings whole. The consortium graph holds all of them.",
    src: "/media/landing/eval-e2.png", w: 1600, h: 492,
    alt: "Evaluation page, E2 card: best-placed single bank 43.8%, rings held entirely by one bank 0.0%, consortium graph 100.0%",
  },
  {
    id: "e1", tag: "E1 · Alert triage, held out", figure: "0.205",
    caption: "On 4,000 later-period alerted accounts, the calibrated graph score reaches F1 0.205 while escalating 174. Escalating every alert scores 0.063.",
    src: "/media/landing/eval-e1.png", w: 1600, h: 456,
    alt: "Evaluation page, E1 table: escalate every alert F1 0.063 with 4,000 escalations; calibrated graph score F1 0.205 with 174",
  },
  {
    id: "e6", tag: "E6 · Trust layer, 28 agent cases", figure: "27.8%",
    caption: "27.8% of evidence items repeated an origin already counted. 25 of 28 reports passed the provenance gate at mean fidelity 0.988, and cascading invalidation found every affected item.",
    src: "/media/landing/eval-e6.png", w: 1600, h: 563,
    alt: "Evaluation page, E6 card: 27.8% echo, 25/28 SARs through the provenance gate with mean fidelity 0.988, cascade recall and precision 100.0%",
  },
  {
    id: "e7", tag: "E7 · Tool latency, 1.3M transfers", figure: "0.4 ms",
    caption: "Median tool latency on one machine over 1.3M transfers: 0.4 ms for vector neighbours, 57.5 ms for PageRank across the whole consortium.",
    src: "/media/landing/eval-e7.png", w: 1600, h: 809,
    alt: "Evaluation page, E7 table: behavior_neighbors 0.4 ms median, pagerank_consortium 57.5 ms",
  },
];

const TILES: [string, string, string][] = [
  ["27.8%", "of evidence items repeated an origin already counted", "E6 · echo"],
  ["25 / 28", "SARs passed the provenance gate", "E6 · gate"],
  ["0.988", "mean provenance fidelity", "E6 · gate"],
  ["100%", "recall on cascading invalidation, 50 scripted graphs", "E6 · cascade"],
];

export default function Numbers() {
  const ref = useReveal<HTMLElement>();
  return (
    <section ref={ref} id="results" className="mt-20 bg-[#f6f8fb] py-24">
      <div className="mx-auto max-w-[1180px] px-4 md:px-8">
        <SectionHead kicker="Measured on IBM's laundering data" title="The numbers, not the pitch"
          sub="Screenshots of the live Evaluation page; every figure comes from eval/results in the repo." />

        {/* cards stack as you scroll on large screens; on small screens they simply follow each other */}
        <div className="mt-14 flex flex-col gap-6">
          {SHOTS.map((s, i) => (
            <article key={s.id} data-reveal style={{ top: `${96 + i * 18}px` }}
              className="rounded-[28px] border border-line bg-white p-4 shadow-[0_-12px_40px_-28px_rgba(4,38,84,.35),0_30px_60px_-40px_rgba(4,38,84,.35)] sm:p-6 lg:sticky">
              <header className="mb-4 grid gap-3 px-1 sm:mb-5 md:grid-cols-[auto_1fr_auto] md:items-center md:gap-6">
                <div>
                  <p className="mono text-[11px] font-medium uppercase tracking-[.12em] text-muted">{s.tag}</p>
                  <p className="kpi mt-1.5 whitespace-nowrap text-[34px] leading-none text-cyan md:text-[40px]">{s.figure}</p>
                </div>
                <p className="max-w-[62ch] text-[15px] leading-relaxed text-[#3b5272] md:border-l md:border-line md:pl-6">{s.caption}</p>
                <Link href="/evaluation" className="group hidden whitespace-nowrap text-sm font-semibold text-cyan md:inline-block">
                  See it live <Arrow />
                </Link>
              </header>
              <BrowserFrame url="bankweave.vercel.app/evaluation">
                {/* on phones the capture keeps a readable width and scrolls sideways */}
                <div className="scroll-thin overflow-x-auto">
                  <a href={s.src} target="_blank" rel="noopener noreferrer" aria-label={`Open the full-size screenshot: ${s.tag}`} className="block max-sm:w-[680px]">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static screenshot served as-is */}
                    <img src={s.src} width={s.w} height={s.h} alt={s.alt} loading="lazy" decoding="async" className="block h-auto w-full" />
                  </a>
                </div>
              </BrowserFrame>
              <p className="mt-2 text-center text-xs text-muted sm:hidden">Scroll sideways, or tap for the full-size capture.</p>
            </article>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {TILES.map(([v, l, k], i) => (
            <div key={l} data-reveal style={delay(i)}
              className="relative overflow-hidden rounded-[24px] border border-line bg-white p-5 shadow-[var(--shadow)] transition-[transform,box-shadow] duration-500 hover:-translate-y-1 hover:shadow-[0_24px_50px_-30px_rgba(12,26,46,.4)] sm:p-6">
              <span aria-hidden className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-gradient-to-r from-[#087cf8] to-[#8ad8fc]" />
              <p className="kpi text-[32px] leading-none text-deep sm:text-[38px]">{v}</p>
              <p className="mt-2.5 text-sm leading-snug text-muted">{l}</p>
              <p className="mono mt-4 text-[11px] text-muted/80">{k}</p>
            </div>
          ))}
        </div>

        <div data-reveal className="mt-10 text-center">
          <Link href="/evaluation" className="group inline-flex items-center gap-2 rounded-xl bg-cyan px-6 py-3 font-semibold text-white shadow-[0_14px_34px_-12px_rgba(8,124,248,.85)] transition hover:bg-[#1a8bff]">
            Open the Evaluation page <Arrow />
          </Link>
          <p className="mt-3 text-sm text-muted">Misses are reported there too, such as E3, a paper reproduction that did not hold on this data.</p>
        </div>
      </div>
    </section>
  );
}
