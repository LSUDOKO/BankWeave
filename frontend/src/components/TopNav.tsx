"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ModeBadge from "@/components/ModeBadge";

const GROUPS: [string, [string, string, string][]][] = [
  ["Investigate", [["/command", "Command Center", "Live counts and engine health"], ["/alerts", "Alert queue", "What triage decided and why"],
    ["/cases", "Cases", "Claims, evidence and reports"], ["/approvals", "Approvals", "Actions waiting for a human"]]],
  ["Explore", [["/scenarios", "Golden scenarios", "Three investigations, end to end"], ["/network", "Bank vs consortium", "What each bank can see"],
    ["/consortium-3d", "3D consortium", "Bank slices, consortium, cases"], ["/trust", "Trust layer", "Echo-proof confidence and cascades"]]],
  ["Prove", [["/lab", "FalkorDB Lab", "Graphs, algorithms, query plans, tools"], ["/evaluation", "Evaluation", "Measured results on IBM data"],
    ["/hardware-lab", "Hardware Lab", "Terminals, keys, enclave, PSI"], ["/demo", "Demo control", "Run agents and red-team injections"]]],
];

export default function TopNav() {
  const path = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { setOpen(null); }, [path]);
  useEffect(() => {
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, []);
  const onHero = path === "/";
  return (
    <header className="sticky top-3 z-40 px-3">
      <div ref={ref} className={`mx-auto flex max-w-[1180px] items-center gap-2 rounded-2xl border px-3 py-2 backdrop-blur-xl transition-colors ${
        onHero ? "border-white/25 bg-white/12 text-white" : "border-line bg-white/85 text-paper shadow-[var(--shadow)]"}`}>
        <Link href="/" className="flex items-center gap-2 pr-2 font-semibold tracking-tight" aria-label="BankWeave home">
          <Logo light={onHero} /><span className="text-[15px]">BankWeave</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Main">
          {GROUPS.map(([g, items]) => {
            const active = items.some(([h]) => path.startsWith(h));
            return (
              <div key={g} className="relative">
                <button onClick={() => setOpen(open === g ? null : g)} aria-expanded={open === g}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${onHero ? "hover:bg-white/15" : "hover:bg-panel-2"} ${active && !onHero ? "text-cyan" : ""}`}>
                  {g}
                </button>
                {open === g && (
                  <div className="absolute left-0 top-full mt-2 w-[300px] rounded-2xl border border-line bg-white p-2 text-paper shadow-[0_24px_60px_-20px_rgba(10,80,143,.35)]">
                    {items.map(([href, label, hint]) => (
                      <Link key={href} href={href} className={`block rounded-xl px-3 py-2 hover:bg-panel-2 ${path.startsWith(href) ? "bg-panel-2" : ""}`}>
                        <span className="block text-sm font-medium">{label}</span>
                        <span className="block text-xs text-muted">{hint}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:inline-flex"><ModeBadge /></span>
          <Link href="/command" className={`rounded-xl px-3.5 py-1.5 text-sm font-semibold ${onHero ? "bg-white text-cyan" : "bg-cyan text-white"}`}>Open console</Link>
        </div>
      </div>
    </header>
  );
}

export function Logo({ light }: { light: boolean }) {
  // three bank lanes crossed by one thread: the weave
  return (
    <svg width="24" height="24" viewBox="0 0 26 26" aria-hidden>
      {[5, 13, 21].map((x) => <line key={x} x1={x} y1="3" x2={x} y2="23" stroke={light ? "rgba(255,255,255,.75)" : "#b5bcc6"} strokeWidth="2.5" strokeLinecap="round" />)}
      <path d="M2 18 C 8 4, 18 22, 24 8" stroke={light ? "#ffffff" : "#087cf8"} strokeWidth="2.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}
