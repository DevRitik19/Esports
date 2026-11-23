import Link from "next/link";
import { Suspense } from "react";
import { gameOf } from "@/games/params";
import { GAMES, type GameId } from "@/games/registry";
import { canStaff, requireStaff } from "@/lib/auth";
import { AdminGameTabs } from "./GameTabs";

/** Every game's control room has the same header and tabs, whatever its format. */
function adminTabs(game: GameId): { href: string; label: string }[] {
  const base = `/admin/${game}`;
  if (game === "codm") return [{ href: base, label: "Matches" }, { href: `${base}/setup`, label: "Setup" }, { href: `${base}/settings`, label: "Settings" }];
  if (GAMES[game].shape === "lobby") return [{ href: base, label: "Lobbies" }, { href: `${base}/setup`, label: "Setup" }];
  return [{ href: base, label: "Matches" }];
}

export default function GameAdminLayout({ children, params }: LayoutProps<"/admin/[game]">) {
  return (
    <Suspense fallback={<div className="mb-6 h-16" />}>
      <Gate params={params}>{children}</Gate>
    </Suspense>
  );
}

/** Referees only reach their own games; the pages and the database check again. */
async function Gate({ params, children }: Pick<LayoutProps<"/admin/[game]">, "params" | "children">) {
  const game = gameOf((await params).game);
  const def = GAMES[game];
  const viewer = await requireStaff();
  if (!canStaff(viewer, game)) {
    return <p className="panel p-5 text-sm text-muted">You don&apos;t run {def.name}. Ask an admin to add it to your tags on the Staff page.</p>;
  }
  return (
    <>
      <header className="mb-6" style={{ "--game": def.accent } as React.CSSProperties}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="flex items-center gap-3 font-display text-4xl">
            <span className="size-3 bg-[var(--game)]" aria-hidden />
            {def.name}
          </h1>
          <Link href={`/${game}`} className="link text-sm">Public page</Link>
        </div>
        <AdminGameTabs tabs={adminTabs(game)} accent={def.accent} />
      </header>
      {children}
    </>
  );
}
