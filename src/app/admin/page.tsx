import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { loadResultStates } from "@/app/admin/[game]/lobby/data";
import { ActionForm } from "@/components/ActionForm";
import { GAME_LIST, GAMES } from "@/games/registry";
import { isApplied, OFFICIAL_GAMES } from "@/lib/official-apply";
import { createClient } from "@/lib/supabase/server";
import { applyAllOfficial } from "./actions";
import { getTodos } from "@/lib/admin";
import { canStaff, requestNow, requireStaff } from "@/lib/auth";
import { getTournament } from "@/lib/data";
import { dayKey, fmtDateTime, fmtDay } from "@/lib/format";
import { getLobbyGame } from "@/lib/lobby/data";
import { GameMatchDay, upcomingDays, type GameNight } from "@/views/admin/MatchDay";

export const metadata: Metadata = { title: "Control room" };

export default function Overview() {
  return (
    <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
      <OverviewBody />
    </Suspense>
  );
}

/** Evenings run past midnight, so until 6 AM it is still the previous day's evening. */
const EVENING_ROLLOVER_MS = 6 * 3600_000;

async function OverviewBody() {
  const viewer = await requireStaff();
  const now = await requestNow();
  const today = dayKey(new Date(now - EVENING_ROLLOVER_MS).toISOString());
  const games = GAME_LIST.filter((g) => canStaff(viewer, g.id));

  // Public data comes from the same cache the public pages use (cleared on
  // every staff write); only unpublished-result counts are read live.
  const [nights, todos] = await Promise.all([
    Promise.all(
      games.map(async (def): Promise<GameNight | null> => {
        try {
          if (def.shape === "lobby") {
            const g = await getLobbyGame(def.id);
            return { def, kind: "lobby", g, states: new Map() };
          }
          const t = await getTournament(def.id);
          return { def, kind: "h2h", matches: t.matches, teams: t.teams };
        } catch {
          return null;
        }
      }),
    ).then((x) => x.filter((n): n is GameNight => n !== null)),
    getTodos(games.map((g) => g.id)),
  ]);

  const day = nights.flatMap((n) => upcomingDays(n, today)).sort()[0];
  // Draft states only for the lobbies on that day.
  await Promise.all(
    nights.map(async (n) => {
      if (n.kind !== "lobby" || !day) return;
      const stageIds = [...new Set(n.g.matches.filter((m) => m.scheduledAt && dayKey(m.scheduledAt) === day).map((m) => m.stageId))];
      if (stageIds.length) n.states = await loadResultStates(stageIds);
    }),
  );

  return (
    <>
      <h1 className="font-display text-4xl">Overview</h1>
      <p className="mt-1 text-sm text-muted">
        {viewer.staffRole === "admin" ? "You run every game." : `You run ${games.map((g) => g.short).join(" and ")}.`}
      </p>

      {viewer.staffRole === "admin" && <OfficialSchedules />}

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {nights.map((n) => {
          const todo = todos.get(n.def.id) ?? { pending: 0, openDisputes: 0 };
          const next = (n.kind === "lobby" ? n.g.matches : n.matches)
            .filter((m) => m.scheduledAt && (m.status === "scheduled" || m.status === "live") && dayKey(m.scheduledAt) >= today)
            .map((m) => m.scheduledAt!)
            .sort()[0];
          return (
            <li key={n.def.id}>
              <Link href={`/admin/${n.def.id}`} className="panel flex h-full flex-col gap-3 p-4 hover:border-[var(--game)]" style={{ "--game": n.def.accent } as React.CSSProperties}>
                <span className="flex items-center gap-2.5 font-cond text-lg font-bold">
                  <span className="size-2.5 bg-[var(--game)]" aria-hidden />
                  {n.def.name}
                </span>
                <span className="text-sm text-muted">{next ? `Next: ${fmtDateTime(next)}` : "Nothing scheduled"}</span>
                <span className="mt-auto flex flex-wrap gap-2 text-xs">
                  {todo.pending > 0 && <span className="tag text-warn">{todo.pending} to publish</span>}
                  {todo.openDisputes > 0 && <span className="tag text-live">{todo.openDisputes} open dispute{todo.openDisputes === 1 ? "" : "s"}</span>}
                  {!todo.pending && !todo.openDisputes && <span className="text-faint">All clear</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      <section className="mt-12">
        <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-3">
          <h2 className="font-display text-3xl">{day === today ? "Tonight" : day ? "Next match day" : "Tonight"}</h2>
          {day && <p className="font-cond text-lg font-semibold text-muted">{fmtDay(`${day}T12:00:00+05:30`)}</p>}
        </div>
        {!day ? (
          <p className="text-sm text-muted">Nothing is scheduled for your games yet.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {nights.map((n) => <GameMatchDay key={n.def.id} n={n} day={day} />)}
          </div>
        )}
      </section>
    </>
  );
}

/** Admins: whether CODM, Free Fire and BGMI's published fixtures are in, and one button for the rest. */
async function OfficialSchedules() {
  const db = await createClient();
  const done = await Promise.all(OFFICIAL_GAMES.map(async (g) => [g, await isApplied(db, g)] as const));
  const todo = done.filter(([, ok]) => !ok);
  return (
    <section className={`panel mt-6 p-5 ${todo.length ? "border-warn/50" : ""}`}>
      <h2 className="font-cond text-lg font-bold">Published schedules</h2>
      <ul className="mt-3 flex flex-wrap gap-2 text-sm">
        {done.map(([g, ok]) => (
          <li key={g} className={`tag ${ok ? "text-win" : "text-warn"}`}>{GAMES[g].short}: {ok ? "fixtures in" : "not set up"}</li>
        ))}
      </ul>
      {todo.length > 0 ? (
        <ActionForm action={applyAllOfficial} submit={`Set up ${todo.map(([g]) => GAMES[g].short).join(", ")}`} className="mt-4 flex flex-col gap-2">
          <p className="text-sm text-muted">
            Puts every registered team in its published group and creates each match at its published time, so referees can run tonight.
            Games already set up are left alone.
          </p>
        </ActionForm>
      ) : (
        <p className="mt-2 text-sm text-muted">Every published group and fixture is in. Change a game&apos;s on its Setup tab.</p>
      )}
    </section>
  );
}
