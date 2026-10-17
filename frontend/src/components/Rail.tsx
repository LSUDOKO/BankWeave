"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEvents } from "@/lib/useEvents";

const NAV = [
  ["/", "Alert queue"],
  ["/network", "Network"],
  ["/cases", "Cases"],
  ["/approvals", "Approvals"],
  ["/trust", "Trust"],
  ["/scoreboard", "Scoreboard"],
  ["/demo", "Demo control"],
];

export default function Rail() {
  const path = usePathname();
  const { connected } = useEvents(1);
  return (
    <nav className="md:w-52 md:min-h-screen border-b md:border-b-0 md:border-r border-line bg-panel/60 px-4 py-4 md:py-6 flex md:flex-col gap-4 md:gap-6 overflow-x-auto">
      <Link href="/" className="shrink-0">
        <Logo />
      </Link>
      <ul className="flex md:flex-col gap-1 text-sm">
        {NAV.map(([href, label]) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`block whitespace-nowrap rounded px-2.5 py-1.5 transition-colors ${
                  active ? "bg-panel-2 text-paper" : "text-muted hover:text-paper"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="hidden md:flex mt-auto items-center gap-2 text-xs text-muted">
        <span className={`size-2 rounded-full ${connected ? "bg-ok" : "bg-verify"}`} />
        {connected ? "Live from the graph" : "Reconnecting…"}
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
          <line key={x} x1={x} y1="2" x2={x} y2="24" stroke={["#0072b2", "#56b4e9", "#009e73"][i]} strokeWidth="2.5" />
        ))}
        <path d="M2 18 C 8 4, 18 22, 24 8" stroke="#e5484d" strokeWidth="2.5" fill="none" />
      </svg>
      <span className="font-bold text-lg tracking-tight">BankWeave</span>
    </span>
  );
}
