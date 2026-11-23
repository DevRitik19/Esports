"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** A game's control-room tabs. The first tab also covers pages below it (a lobby's result entry). */
export function AdminGameTabs({ tabs, accent }: { tabs: { href: string; label: string }[]; accent: string }) {
  const pathname = usePathname();
  const rest = tabs.slice(1).map((t) => t.href);
  const active = (href: string, i: number) =>
    i === 0 ? !rest.some((r) => pathname === r || pathname.startsWith(`${r}/`)) : pathname === href || pathname.startsWith(`${href}/`);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Game sections" className="flex gap-1 border-b border-line">
      {tabs.map((t, i) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t.href, i) ? "page" : undefined}
          style={active(t.href, i) ? { borderColor: accent } : undefined}
          className={`caps -mb-px border-b-2 px-4 py-2.5 text-[0.72rem] font-bold ${active(t.href, i) ? "text-text" : "border-transparent text-muted hover:text-text"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
