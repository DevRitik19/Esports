import { cacheLife, cacheTag } from "next/cache";
import { KEY_DATES } from "@/content/event";
import { GAMES, type GameId } from "@/games/registry";
import { gameTag, TOURNAMENT_TAG } from "./data";
import { supabaseConfigured } from "./supabase/env";
import { createPublicClient } from "./supabase/server";

// A game page's key dates and notice. Staff can change them from the control
// room (table game_pages); without a change the published ones in the code show.

export interface KeyDate {
  when: string;
  what: string;
  where: string;
}

export interface GamePage {
  keyDates: readonly KeyDate[];
  /** True when staff replaced the published key dates. */
  edited: boolean;
  notice?: string;
}

/** The key dates published in the code. CODM's come from its tournament doc. */
export function defaultKeyDates(game: GameId): readonly KeyDate[] {
  return game === "codm" ? KEY_DATES : GAMES[game].keyDates;
}

function isKeyDates(v: unknown): v is KeyDate[] {
  return Array.isArray(v) && v.every((d) => d && typeof d.when === "string" && typeof d.what === "string" && typeof d.where === "string");
}

/** Uncached, for the staff form. */
export async function loadGamePage(game: GameId): Promise<GamePage> {
  const fallback = { keyDates: defaultKeyDates(game), edited: false };
  if (!supabaseConfigured()) return fallback;
  const { data, error } = await createPublicClient().from("game_pages").select("key_dates, notice").eq("game_id", game).maybeSingle();
  // Before the table exists, or if it can't be read, the page shows the published dates.
  if (error || !data) return fallback;
  const custom = isKeyDates(data.key_dates) && data.key_dates.length > 0;
  return { keyDates: custom ? data.key_dates : fallback.keyDates, edited: custom, notice: data.notice || undefined };
}

export async function getGamePage(game: GameId): Promise<GamePage> {
  "use cache";
  cacheLife("tournament");
  cacheTag(TOURNAMENT_TAG, gameTag(game));
  return loadGamePage(game);
}
