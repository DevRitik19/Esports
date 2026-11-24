import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { gameOf } from "@/games/params";
import { GAME_IDS, GAMES } from "@/games/registry";
import { canStaff, requireStaff } from "@/lib/auth";
import { loadGamePage } from "@/lib/game-page";
import { saveGamePage } from "./actions";

export function generateStaticParams() {
  return GAME_IDS.map((game) => ({ game }));
}

export const metadata: Metadata = { title: "Game page" };

export default function GamePageContent({ params }: PageProps<"/admin/[game]/page-content">) {
  return (
    <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: Pick<PageProps<"/admin/[game]/page-content">, "params">) {
  const game = gameOf((await params).game);
  const viewer = await requireStaff();
  if (!canStaff(viewer, game)) return <p className="panel p-5 text-sm text-muted">You aren&apos;t on the staff for {GAMES[game].name}.</p>;
  const page = await loadGamePage(game);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="panel p-5">
        <h2 className="font-cond text-lg font-bold">Notice</h2>
        <p className="mt-1 text-xs text-muted">
          Shown at the top of every tab of the <Link href={`/${game}`} className="link">{GAMES[game].name} page</Link>, for things like a changed start time. Clear it to take it down.
        </p>
        <ActionForm action={saveGamePage} submit="Save notice" className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="game" value={game} />
          <textarea name="notice" rows={4} maxLength={600} defaultValue={page.notice ?? ""} placeholder="Tonight's matches start at 9:30 PM; check in by 9:00 PM." className={inputClass} />
        </ActionForm>
      </section>

      <section className="panel p-5">
        <h2 className="font-cond text-lg font-bold">Key dates</h2>
        <p className="mt-1 text-xs text-muted">
          One per line: <span className="font-cond text-text">when | what | where</span>. Where is Online unless you write something else, like Campus.
          {page.edited ? " These replace the published dates." : " These are the published dates."}
        </p>
        <ActionForm action={saveGamePage} submit="Save key dates" className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="game" value={game} />
          <textarea
            name="key_dates"
            rows={Math.max(6, page.keyDates.length + 1)}
            defaultValue={page.keyDates.map((d) => `${d.when} | ${d.what} | ${d.where}`).join("\n")}
            className={`${inputClass} font-mono text-xs`}
          />
        </ActionForm>
        {page.edited && (
          <ActionForm action={saveGamePage} submit="Use the published dates again" tone="quiet" className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="game" value={game} />
            <input type="hidden" name="reset" value="1" />
          </ActionForm>
        )}
      </section>
    </div>
  );
}
