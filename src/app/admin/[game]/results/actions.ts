"use server";

import { refresh, updateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { GAMES, isGameId, type GameId } from "@/games/registry";
import { canStaff, requireStaff } from "@/lib/auth";
import { gameTag, TOURNAMENT_TAG } from "@/lib/data";
import { dayKey } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "../../actions";

// A whole match day at once: publishing best-of-one winners from a results
// sheet, and moving every match of a day to a new start time.

type Db = Awaited<ReturnType<typeof createClient>>;
type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

const check = <T,>(r: { error: { message: string } | null; data?: T | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

function dayAction(fn: (form: FormData, ctx: { db: Db; game: GameId; email: string }) => Promise<string>): Action {
  return async (_prev, form) => {
    try {
      const viewer = await requireStaff();
      const game = str(form, "game");
      if (!isGameId(game) || GAMES[game].shape === "lobby") throw new Error("That game doesn't have head-to-head matches.");
      if (!canStaff(viewer, game)) throw new Error(`You aren't on the staff for ${GAMES[game].name}.`);
      const db = await createClient();
      const ok = await fn(form, { db, game, email: viewer.email });
      updateTag(TOURNAMENT_TAG);
      updateTag(gameTag(game));
      refresh();
      return { ok };
    } catch (e) {
      unstable_rethrow(e);
      const msg = (e as { message?: string }).message ?? String(e);
      return { error: msg.includes("row-level security") ? "You don't have permission to do that." : msg };
    }
  };
}

const score = (s: string) => (/^\d+$/.test(s) ? Number(s) : null);

/**
 * Publishes the picked winner of each best-of-one match. Scores are optional:
 * without them a win is recorded 1–0. Rows left on "Skip" are untouched.
 */
export const publishWinners = dayAction(async (form, { db, game, email }) => {
  const ids = str(form, "ids").split(",").filter(Boolean);
  const matches = check<{ id: string; best_of: number; mode: string | null; map: string | null }[]>(
    await db.from("matches").select("id, best_of, mode, map").eq("game_id", game).in("id", ids),
  );
  const rows = [];
  for (const m of matches) {
    const w = str(form, `w_${m.id}`);
    if (w !== "A" && w !== "B") continue;
    if (m.best_of !== 1) throw new Error(`${m.id} is best of ${m.best_of}: enter its maps on the match page.`);
    let a = score(str(form, `a_${m.id}`));
    let b = score(str(form, `b_${m.id}`));
    if (a === null || b === null) [a, b] = w === "A" ? [1, 0] : [0, 1];
    if ((w === "A") !== (a > b)) throw new Error(`${m.id}: the scores don't match the winner you picked.`);
    rows.push({
      match_id: m.id, game: 1, mode: m.mode, map: m.map ?? "", score_a: a, score_b: b,
      status: "final", entered_by: email, approved_by: email, updated_at: new Date().toISOString(),
    });
  }
  if (!rows.length) return "Nothing to publish: pick a winner for at least one match.";
  check(await db.from("maps").upsert(rows));
  return `${rows.length} result${rows.length === 1 ? "" : "s"} published.`;
});

/** Moves every match of a day by the same amount, so its first match starts at the new time. */
export const moveDay = dayAction(async (form, { db, game }) => {
  const day = str(form, "day");
  const time = str(form, "time");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Pick a day.");
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Pick the new start time.");
  const all = check<{ id: string; scheduled_at: string | null }[]>(
    await db.from("matches").select("id, scheduled_at").eq("game_id", game).not("scheduled_at", "is", null),
  );
  const onDay = all.filter((m) => dayKey(m.scheduled_at!) === day);
  if (!onDay.length) throw new Error("No matches on that day.");
  const first = Math.min(...onDay.map((m) => Date.parse(m.scheduled_at!)));
  const shift = Date.parse(`${day}T${time}:00+05:30`) - first;
  if (shift === 0) return "That's already the start time.";
  // Grouped by start time so a wave of seven matches is one update.
  const byTime = new Map<string, string[]>();
  for (const m of onDay) byTime.set(m.scheduled_at!, [...(byTime.get(m.scheduled_at!) ?? []), m.id]);
  for (const [at, ids] of byTime) {
    check(await db.from("matches").update({ scheduled_at: new Date(Date.parse(at) + shift).toISOString() }).in("id", ids));
  }
  const mins = Math.round(Math.abs(shift) / 60_000);
  const by = mins % 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins / 60} h`;
  return `${onDay.length} matches moved ${shift > 0 ? "later" : "earlier"} by ${by}. Tell the teams on Discord too.`;
});
