"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/Icon";
import ModeBadge from "@/components/ModeBadge";
import LandingNav, { Logo } from "@/components/TopNav";
import { live } from "@/lib/snapshot";

type Item = { href: string; label: string; icon: string; hint: string; badge?: "alerts" | "approvals" | "cases" };
export const NAV: [string, Item[]][] = [
  ["Investigate", [
    { href: "/command", label: "Dashboard", icon: "dashboard", hint: "Live counts and engine health" },
    { href: "/alerts", label: "Alert queue", icon: "alert", hint: "What triage decided and why", badge: "alerts" },
    { href: "/cases", label: "Cases", icon: "cases", hint: "Claims, evidence and reports", badge: "cases" },
    { href: "/approvals", label: "Approvals", icon: "approve", hint: "Actions waiting for a human", badge: "approvals" },
  ]],
  ["Explore", [
    { href: "/explainer", label: "How it works, 3D", icon: "cube", hint: "Eight scenes, each one FalkorDB call" },
    { href: "/scenarios", label: "Golden scenarios", icon: "scenarios", hint: "Three investigations, end to end" },
    { href: "/network", label: "Bank vs consortium", icon: "network", hint: "What each bank can see" },
    { href: "/consortium-3d", label: "3D consortium", icon: "cube", hint: "Bank slices, consortium, cases" },
    { href: "/explorer", label: "Graph explorer", icon: "search", hint: "Run Cypher on FalkorDB, see the graph" },
    { href: "/trust", label: "Trust layer", icon: "trust", hint: "Echo-proof confidence and cascades" },
  ]],
  ["Prove", [
    { href: "/lab", label: "FalkorDB Lab", icon: "lab", hint: "Graphs, algorithms, query plans" },
    { href: "/evaluation", label: "Evaluation", icon: "chart", hint: "Measured results on IBM data" },
    { href: "/hardware-lab", label: "Hardware Lab", icon: "chip", hint: "Terminals, keys, enclave, PSI" },
    { href: "/demo", label: "Demo control", icon: "play", hint: "Run agents and red-team injections" },
  ]],
];
const ALL = NAV.flatMap(([, i]) => i);

type Counts = { alerts: number; approvals: number; cases: number; recent: { id: string; title: string }[] };

export default function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<Counts | null>(null);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (path === "/") return;
    live<any>("/overview").then(({ data }) => setCounts({
      alerts: data.alerts?.open ?? 0, approvals: data.cases?.pending_actions ?? 0, cases: data.cases?.open ?? 0,
      recent: (data.cases?.recent ?? []).map((c: any) => ({ id: c.id, title: c.title })),
    })).catch(() => {});
  }, [path]);

  if (path === "/") return <><LandingNav />{children}</>;

  const sidebar = (
    <aside className="flex h-full flex-col rounded-[26px] bg-ink px-4 pb-4 pt-5">
      <Link href="/" className="flex items-center gap-2.5 px-3 text-[19px] font-semibold tracking-tight" aria-label="BankWeave home">
        <span className="grid size-9 place-items-center rounded-full border-2 border-cyan/80"><Logo light={false} /></span>BankWeave
      </Link>
      <nav className="shell-nav mt-4 min-h-0 flex-1 space-y-3.5 overflow-y-auto scroll-thin" aria-label="Main">
        {NAV.map(([g, items]) => (
          <div key={g}>
            <p className="px-3 text-[11px] font-medium uppercase tracking-[.12em] text-muted/80">{g}</p>
            <ul className="mt-1.5 space-y-px">
              {items.map((it) => {
                const on = path === it.href || path.startsWith(it.href + "/");
                const b = it.badge && counts ? counts[it.badge] : 0;
                return (
                  <li key={it.href} className="relative">
                    {on && <span className="absolute -left-4 top-1 h-7 w-1.5 rounded-r-full bg-cyan" />}
                    <Link href={it.href} title={it.hint} aria-current={on ? "page" : undefined}
                      className={`flex items-center gap-3 rounded-xl px-3 py-[6px] text-[14.5px] ${on ? "font-semibold text-paper" : "text-muted hover:bg-white hover:text-paper"}`}>
                      <Icon name={it.icon} className={`size-[19px] ${on ? "text-cyan" : ""}`} strokeWidth={on ? 2.2 : 1.8} />
                      {it.label}
                      {b > 0 && <span className="ml-auto rounded-md bg-deep px-1.5 py-0.5 text-[10.5px] font-semibold text-white">{b > 99 ? "99+" : b}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="fill-deep relative mt-3 shrink-0 overflow-hidden rounded-2xl p-4 [@media(max-height:960px)]:hidden">
        <span className="lines" />
        <span className="relative grid size-8 place-items-center rounded-full bg-white/15"><Icon name="play" className="size-4" /></span>
        <p className="relative mt-2.5 text-[15px] font-semibold leading-snug">Watch the agents work live</p>
        <p className="relative mt-1 text-xs text-white/70">Raise alerts, run the worker, inject a red-team case.</p>
        <Link href="/demo" className="relative mt-3 block rounded-xl bg-cyan py-2 text-center text-sm font-semibold text-white hover:bg-[#1a8bff]">Open demo control</Link>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-frame p-2 md:p-3">
      <div className="mx-auto flex max-w-[1680px] gap-3">
        <div className="sticky top-3 hidden h-[calc(100vh-24px)] w-[252px] shrink-0 lg:block">{sidebar}</div>
        {open && (
          <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
            <div className="h-full w-[280px] p-2" onClick={(e) => e.stopPropagation()}>{sidebar}</div>
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-3">
          <TopBar onMenu={() => setOpen(true)} counts={counts} />
          <main className="min-h-[calc(100vh-112px)] rounded-[26px] bg-ink px-4 pb-14 pt-6 md:px-7 md:pt-7">{children}</main>
        </div>
      </div>
    </div>
  );
}

function TopBar({ onMenu, counts }: { onMenu: () => void; counts: Counts | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); input.current?.focus(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pages = ALL.filter((i) => !s || i.label.toLowerCase().includes(s) || i.hint.toLowerCase().includes(s))
      .map((i) => ({ href: i.href, label: i.label, sub: i.hint, icon: i.icon }));
    const cases = (counts?.recent ?? []).filter((c) => s && (c.id.toLowerCase().includes(s) || c.title.toLowerCase().includes(s)))
      .map((c) => ({ href: `/cases/${c.id}`, label: c.id, sub: c.title, icon: "cases" }));
    if (/^c-[0-9a-f]{8}$/.test(s) && !cases.length) cases.push({ href: `/cases/C-${s.slice(2)}`, label: q.trim(), sub: "Open case", icon: "cases" });
    return [...cases, ...pages].slice(0, 8);
  }, [q, counts]);
  useEffect(() => setSel(0), [q]);
  const go = (href: string) => { setQ(""); input.current?.blur(); router.push(href); };
  return (
    <header className="flex items-center gap-3 rounded-[22px] bg-ink px-3 py-2.5 md:px-4">
      <button onClick={onMenu} className="grid size-10 place-items-center rounded-full bg-white lg:hidden" aria-label="Open menu"><Icon name="menu" /></button>
      <div className="relative w-full max-w-[420px]">
        <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 shadow-[var(--shadow)]">
          <Icon name="search" className="size-[18px] text-muted" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
              if (e.key === "Enter" && results[sel]) go(results[sel].href);
              if (e.key === "Escape") input.current?.blur();
            }}
            placeholder="Search pages and cases" aria-label="Search pages and cases" className="w-full bg-transparent text-sm outline-none placeholder:text-muted" />
          <kbd className="hidden whitespace-nowrap rounded-md bg-panel-2 px-1.5 py-0.5 font-sans text-[11px] text-muted sm:block">Ctrl K</kbd>
        </div>
        {focus && results.length > 0 && (
          <ul className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 rounded-2xl border border-line bg-white p-1.5 shadow-[0_24px_60px_-20px_rgba(12,26,46,.35)]">
            {results.map((r, i) => (
              <li key={r.href}>
                <button onMouseDown={() => go(r.href)} onMouseEnter={() => setSel(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${i === sel ? "bg-panel-2" : ""}`}>
                  <Icon name={r.icon} className="size-4 text-cyan" />
                  <span className="text-sm font-medium">{r.label}</span>
                  <span className="truncate text-xs text-muted">{r.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden md:inline-flex"><ModeBadge /></span>
        <a href="https://github.com/LSUDOKO/BankWeave" target="_blank" rel="noreferrer" aria-label="Source on GitHub"
          className="grid size-10 place-items-center rounded-full bg-white shadow-[var(--shadow)] hover:text-cyan"><Icon name="github" className="size-[18px]" /></a>
        <Link href="/approvals" aria-label={`${counts?.approvals ?? 0} approvals waiting`}
          className="relative grid size-10 place-items-center rounded-full bg-white shadow-[var(--shadow)] hover:text-cyan">
          <Icon name="bell" className="size-[18px]" />
          {!!counts?.approvals && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-ring ring-2 ring-white" />}
        </Link>
        <div className="hidden items-center gap-2.5 pl-1 sm:flex">
          <span className="grid size-10 place-items-center rounded-full bg-gradient-to-br from-sky to-cyan text-sm font-semibold text-white">AN</span>
          <span className="leading-tight">
            <span className="block text-sm font-semibold">Compliance analyst</span>
            <span className="block text-xs text-muted">Consortium · 6 banks</span>
          </span>
        </div>
      </div>
    </header>
  );
}
