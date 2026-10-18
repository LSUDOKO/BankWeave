"use client";
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";

// Shared pieces for the landing sections in this folder: scroll reveal, the section heading
// (same type scale as the landing's Head) and a browser-chrome frame for screenshots and GIFs.

/** Adds `.in` to every [data-reveal] inside the returned ref once it scrolls into view.
 *  The landing page runs the same observer; this keeps the sections working wherever they mount. */
export function useReveal<T extends HTMLElement = HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return ref;
}

/** Stagger delay for a [data-reveal] block. */
export const delay = (i: number, step = 90): CSSProperties => ({ ["--d" as string]: `${i * step}ms` });

export function SectionHead({ kicker, title, sub }: { kicker: string; title: string; sub: ReactNode }) {
  return (
    <div data-reveal className="mx-auto max-w-[760px] px-4 text-center">
      <p className="mono font-medium text-cyan">{kicker}</p>
      <h2 className="mt-3 text-[34px] leading-[1.05] sm:text-[46px]" style={{ letterSpacing: "-0.045em", fontWeight: 700 }}>{title}</h2>
      <p className="mt-4 text-[17px] text-muted">{sub}</p>
    </div>
  );
}

export function BrowserFrame({ url, children, className = "", dark = false }: { url: string; children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[18px] border ${dark ? "border-white/10 bg-[#0d1b33]" : "border-line bg-white"} shadow-[0_30px_60px_-34px_rgba(4,38,84,.45),0_2px_6px_rgba(4,38,84,.06)] ${className}`}>
      <div className={`flex items-center gap-1.5 border-b px-3.5 py-2 ${dark ? "border-white/10 bg-white/5" : "border-line bg-[#f6f8fb]"}`}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => <i key={c} className="size-2.5 shrink-0 rounded-full" style={{ background: c }} />)}
        <span className={`mono mx-auto max-w-[75%] truncate rounded-md px-3 py-0.5 text-[11px] ${dark ? "bg-white/5 text-white/60" : "bg-white text-muted ring-1 ring-line"}`}>{url}</span>
        <span className="w-[42px] shrink-0" aria-hidden />
      </div>
      {children}
    </div>
  );
}

export function Arrow() {
  return <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span>;
}
