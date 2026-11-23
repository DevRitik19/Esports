"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

export interface StaffNavItem {
  href: string;
  label: string;
  /** Game accent colour, shown as a dot. */
  accent?: string;
}

export interface StaffNavSection {
  title?: string;
  items: StaffNavItem[];
}

/**
 * The control room's only menu: a sidebar on wide screens, one scrolling row
 * on phones. A game link stays lit on every page of that game.
 */
export function StaffNav({ sections, who }: { sections: StaffNavSection[]; who: React.ReactNode }) {
  const pathname = usePathname();
  const active = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  const strip = useRef<HTMLDivElement>(null);

  // On phones the menu is one scrolling row: keep the current page in view.
  useEffect(() => {
    const row = strip.current;
    const on = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (row && on && row.scrollWidth > row.clientWidth) row.scrollTo({ left: on.offsetLeft - 16 });
  }, [pathname]);

  return (
    <nav aria-label="Control room" className="lg:sticky lg:top-24">
      <div ref={strip} className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 pb-3 lg:mx-0 lg:flex-col lg:gap-5 lg:overflow-visible lg:border-0 lg:px-0 lg:pb-0">
        {sections.map((s, i) => (
          <div key={i} className="flex shrink-0 gap-1 lg:flex-col lg:gap-0.5">
            {s.title && <p className="caps hidden px-3 pb-1 text-[0.65rem] font-bold text-faint lg:block">{s.title}</p>}
            {s.items.map((item) => {
              const on = active(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={on ? "page" : undefined}
                  style={on && item.accent ? { borderColor: item.accent } : undefined}
                  className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm lg:border-b-0 lg:border-l-2 ${
                    on ? "border-signal bg-surface-2 font-semibold text-text" : "border-transparent text-muted hover:bg-surface hover:text-text"
                  }`}
                >
                  {item.accent && <span className="size-2 shrink-0" style={{ background: item.accent }} aria-hidden />}
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-6 hidden border-t border-line pt-4 text-xs text-muted lg:block">{who}</div>
    </nav>
  );
}
