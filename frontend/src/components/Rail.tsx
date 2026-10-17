"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ModeBadge from "@/components/ModeBadge";
import { useEvents } from "@/lib/useEvents";

const NAV: [string, [string, string][]][] = [
  ["Operate", [["/", "Command Center"], ["/alerts", "Alert queue"], ["/cases", "Cases"], ["/approvals", "Approvals"]]],
  ["Explore", [["/scenarios", "Golden scenarios"], ["/network", "Bank vs consortium"], ["/consortium-3d", "3D consortium"], ["/trust", "Trust layer"]]],
  ["Prove", [["/lab", "FalkorDB Lab"], ["/evaluation", "Evaluation"], ["/hardware-lab", "Hardware Lab"], ["/demo", "Demo control"]]],
];

export default function Rail() {
  const path = usePathname();
  const { connected } = useEvents(1);
  return (
    <nav className="md:w-56 md:min-h-screen md:sticky md:top-0 border-b md:border-b-0 md:border-r border-line bg-panel/50 backdrop-blur px-4 py-4 md:py-6 flex md:flex-col gap-4 md:gap-5 overflow-x-auto">
      <Link href="/" className="shrink-0"><Logo /></Link>
      <div className="hidden md:block"><ModeBadge /></div>
      {NAV.map(([group, items]) => (
        <div key={group} className="flex md:block gap-1">
          <p className="hidden md:block px-2.5 pb-1 text-[11px] uppercase tracking-wider text-muted/70">{group}</p>
          <ul className="flex md:flex-col gap-0.5 text-sm">
            {items.map(([href, label]) => {
              const active = href === "/" ? path === "/" : path.startsWith(href);
              return (
                <li key={href}>
                  <Link href={href}
                    className={`block whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors ${
                      active ? "bg-panel-2 text-paper shadow-[inset_2px_0_0_var(--cyan)]" : "text-muted hover:text-paper"}`}>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <p className="hidden md:flex mt-auto items-center gap-2 text-xs text-muted">
        <span className={`size-2 rounded-full ${connected ? "bg-ok" : "bg-verify"}`} />
        {connected ? "Live event stream" : "Event stream offline"}
      </p>
    </nav>
  );
}

function Logo() {
  // three bank lanes crossed by one thread: the weave
  return (
    <span className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden>
        {[5, 13, 21].map((x, i) => (
          <line key={x} x1={x} y1="2" x2={x} y2="24" stroke={["#56b4e9", "#a78bfa", "#e879b9"][i]} strokeWidth="2.5" />
        ))}
        <path d="M2 18 C 8 4, 18 22, 24 8" stroke="#06b6d4" strokeWidth="2.5" fill="none" />
      </svg>
      <span className="font-bold text-lg tracking-tight">BankWeave</span>
    </span>
  );
}
