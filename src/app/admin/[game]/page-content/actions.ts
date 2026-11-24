"use server";

import { refresh, updateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { GAMES, isGameId } from "@/games/registry";
import { canStaff, requireStaff } from "@/lib/auth";
import { gameTag, TOURNAMENT_TAG } from "@/lib/data";
import type { KeyDate } from "@/lib/game-page";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "../../actions";

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** "when | what | where", one per line; where defaults to Online. */
function parseKeyDates(text: string): KeyDate[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const [when, what, where] = line.split("|").map((p) => p.trim());
    if (!when || !what) throw new Error(`Key dates, line ${i + 1}: write it as "when | what | where".`);
    return { when, what, where: where || "Online" };
  });
}

/** Saves the notice and key dates; "reset" puts the published key dates back. */
export async function saveGamePage(_prev: ActionState, form: FormData): Promise<ActionState> {
  try {
    const viewer = await requireStaff();
    const game = str(form, "game");
    if (!isGameId(game)) throw new Error("Unknown game.");
    if (!canStaff(viewer, game)) throw new Error(`You aren't on the staff for ${GAMES[game].name}.`);
    const reset = str(form, "reset") === "1";
    const keyDates = reset ? null : parseKeyDates(str(form, "key_dates"));
    const notice = str(form, "notice");
    if (notice.length > 600) throw new Error("Keep the notice under 600 characters.");
    const db = await createClient();
    const { error } = await db.from("game_pages").upsert({
      game_id: game,
      ...(form.has("key_dates") || reset ? { key_dates: keyDates?.length ? keyDates : null } : {}),
      ...(form.has("notice") ? { notice: notice || null } : {}),
      updated_by: viewer.email,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    updateTag(TOURNAMENT_TAG);
    updateTag(gameTag(game));
    refresh();
    if (reset) return { ok: "Back to the published key dates." };
    return { ok: form.has("notice") ? (notice ? "Notice is up on every tab of the game page." : "Notice taken down.") : "Key dates saved." };
  } catch (e) {
    unstable_rethrow(e);
    const msg = (e as { message?: string }).message ?? String(e);
    return { error: msg.includes("row-level security") ? "You don't have permission to do that." : msg };
  }
}
