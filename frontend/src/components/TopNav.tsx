"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

const LINKS: [string, string][] = [["Product", "#product"], ["What's new", "#new"], ["Results", "#results"], ["Recorded", "#recorded"], ["FalkorDB proof", "#falkordb-browser"], ["FAQ", "#faqs"]];

/** Landing-page nav: glass over the light hero, a white floating pill once you scroll. */
export default function LandingNav() {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const f = () => setSolid(window.scrollY > 40);
    f(); window.addEventListener("scroll", f, { passive: true });
    return () => window.removeEventListener("scroll", f);
  }, []);
  return (
    <header className="fixed inset-x-0 top-4 z-40 px-3">
      <div className={`mx-auto flex items-center gap-2 rounded-2xl border py-2 pl-4 pr-2 transition-all duration-500 ease-out ${solid
        ? "max-w-[1080px] border-line bg-white/85 text-paper shadow-[0_20px_50px_-24px_rgba(12,26,46,.35)] backdrop-blur-xl"
        : "max-w-[1240px] border-white/60 bg-white/40 text-deep backdrop-blur-md"}`}>
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight" aria-label="BankWeave home">
          <Logo light={false} /><span className="text-[15px]">BankWeave</span>
        </Link>
        <nav className="mx-auto hidden items-center gap-1 text-sm md:flex" aria-label="Sections">
          {LINKS.map(([t, h]) => (
            <a key={h} href={h} className={`rounded-lg px-3 py-1.5 transition-colors ${solid ? "text-muted hover:bg-panel-2 hover:text-paper" : "text-deep/75 hover:bg-white/60 hover:text-deep"}`}>{t}</a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <a href="https://github.com/LSUDOKO/BankWeave" target="_blank" rel="noreferrer"
            className={`hidden rounded-xl px-3 py-1.5 text-sm font-medium sm:block ${solid ? "text-paper hover:bg-panel-2" : "text-deep hover:bg-white/60"}`}>GitHub</a>
          <Link href="/command" className="rounded-xl bg-cyan px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(8,124,248,.8)] hover:bg-[#1a8bff]">Open console</Link>
        </div>
      </div>
    </header>
  );
}

export function Logo({ light, size = 24 }: { light: boolean; size?: number }) {
  // the BankWeave mark: a B whose bowls are split by one thread, the weave across banks
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={light ? "/logo-white.png" : "/logo.png"} width={size} height={size} alt="" aria-hidden className="shrink-0" />;
}
