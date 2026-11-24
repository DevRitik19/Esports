"use server";

import { refresh, updateTag } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { GAMES, isGameId, type GameId } from "@/games/registry";
import { canStaff, requireStaff } from "@/lib/auth";
import { gameTag, TOURNAMENT_TAG } from "@/lib/data";
import { tagFor, teamIdFor } from "@/lib/sync/parse";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "../../actions";

// Editing teams and players by hand. The registration sync fills these from
// the Unstop sheet; a field changed here is locked so the next sync keeps it,
// until "Follow the sheet again" unlocks it.

type Db = Awaited<ReturnType<typeof createClient>>;
type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

const check = <T,>(r: { error: { message: string } | null; data?: T | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

const STATUSES = ["confirmed", "forming", "withdrawn", "disqualified"] as const;

/** Wraps a team write: admins, or staff of this game, then refreshes every page showing it. */
function teams(fn: (form: FormData, ctx: { db: Db; game: GameId }) => Promise<string>): Action {
  return async (_prev, form) => {
    try {
      const viewer = await requireStaff();
      const game = str(form, "game");
      if (!isGameId(game)) throw new Error("Unknown game.");
      if (!canStaff(viewer, game)) throw new Error(`You aren't on the staff for ${GAMES[game].name}.`);
      const db = await createClient();
      const ok = await fn(form, { db, game });
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

/** Fields that differ from the stored row, added to its locks. */
function lock(old: Record<string, unknown>, next: Record<string, unknown>, synced: string[], locked: string[]): string[] {
  const changed = synced.filter((f) => f in next && (next[f] ?? null) !== (old[f] ?? null));
  return [...new Set([...locked, ...changed])];
}

const TEAM_SYNCED = ["name", "status", "college", "eligible", "eligibility_note"];
const PLAYER_SYNCED = ["ign", "game_uid", "discord", "role", "is_captain"];

export const saveTeam = teams(async (form, { db, game }) => {
  const id = str(form, "id");
  const old = check<Record<string, unknown> & { locked_fields: string[] }>(
    await db.from("teams").select("name, tag, status, college, eligible, eligibility_note, logo_url, locked_fields").eq("id", id).eq("game_id", game).single(),
  );
  const name = str(form, "name");
  if (!name) throw new Error("A team needs a name.");
  const tag = str(form, "tag").toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(tag)) throw new Error("Tag: 1 to 6 letters or digits.");
  const status = str(form, "status");
  if (!STATUSES.includes(status as never)) throw new Error("Pick a status.");
  const logo = str(form, "logo_url");
  if (logo && !/^https:\/\//.test(logo)) throw new Error("Logo: an https:// image link.");
  const next = {
    name, tag, status,
    college: str(form, "college") || null,
    eligible: form.get("eligible") === "on",
    eligibility_note: str(form, "eligibility_note") || null,
    logo_url: logo || null,
  };
  check(await db.from("teams").update({ ...next, locked_fields: lock(old, next, TEAM_SYNCED, old.locked_fields) }).eq("id", id));
  return `${name} saved.`;
});

/** Drops a team's or player's locks, so the next sync takes the sheet's values again. */
export const followSheet = teams(async (form, { db, game }) => {
  const id = str(form, "id");
  if (str(form, "kind") === "player") {
    check(await db.from("players").update({ locked_fields: [] }).eq("id", id));
    return "This player follows the sheet again from the next sync.";
  }
  check(await db.from("teams").update({ locked_fields: [] }).eq("id", id).eq("game_id", game));
  return "This team follows the sheet again from the next sync.";
});

export const addTeam = teams(async (form, { db, game }) => {
  const name = str(form, "name");
  if (!name) throw new Error("Enter the team's name.");
  const ids = check<{ id: string; name: string }[]>(await db.from("teams").select("id, name").eq("game_id", game));
  if (ids.some((t) => t.name.toLowerCase() === name.toLowerCase())) throw new Error(`${GAMES[game].name} already has a team called ${name}.`);
  const id = teamIdFor(game, name, new Set(ids.map((t) => t.id)));
  check(await db.from("teams").insert({ id, game_id: game, name, tag: tagFor(name), status: "confirmed", eligible: true, college: str(form, "college") || null }));
  redirect(`/admin/${game}/teams/${id}`);
});

/** Removes a team added by mistake. Teams with matches or results can only be withdrawn. */
export const deleteTeam = teams(async (form, { db, game }) => {
  const id = str(form, "id");
  const t = check<{ name: string; sheet_key: string | null }>(await db.from("teams").select("name, sheet_key").eq("id", id).eq("game_id", game).single());
  if (t.sheet_key) throw new Error("This team is on the registration sheet, so the sync would bring it back. Set it to Withdrawn instead.");
  const [h2h, lobby] = await Promise.all([
    db.from("matches").select("id", { count: "exact", head: true }).or(`side_a.eq.${id},side_b.eq.${id}`),
    db.from("lobby_entrants").select("team_id", { count: "exact", head: true }).eq("team_id", id),
  ]);
  if ((h2h.count ?? 0) + (lobby.count ?? 0) > 0) throw new Error("This team is in the fixtures. Set it to Withdrawn instead.");
  check(await db.from("teams").delete().eq("id", id));
  redirect(`/admin/${game}/teams`);
});

async function teamOf(db: Db, game: GameId, teamId: string) {
  const t = check<{ id: string } | null>(await db.from("teams").select("id").eq("id", teamId).eq("game_id", game).maybeSingle());
  if (!t) throw new Error("That team isn't in this game.");
}

function playerFields(form: FormData) {
  const ign = str(form, "ign");
  if (!ign) throw new Error("Enter the in-game name.");
  return {
    ign,
    game_uid: str(form, "game_uid"),
    discord: str(form, "discord") || null,
    role: str(form, "role") === "sub" ? "sub" : "main",
    is_captain: form.get("is_captain") === "on",
  };
}

export const savePlayer = teams(async (form, { db, game }) => {
  const id = str(form, "id");
  const old = check<Record<string, unknown> & { team_id: string; locked_fields: string[] }>(
    await db.from("players").select("team_id, ign, game_uid, discord, role, is_captain, locked_fields").eq("id", id).single(),
  );
  await teamOf(db, game, old.team_id);
  const next = playerFields(form);
  const email = str(form, "email").toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email, or leave it blank.");
  check(await db.from("players").update({ ...next, locked_fields: lock(old, next, PLAYER_SYNCED, old.locked_fields) }).eq("id", id));
  if (form.has("email")) {
    check(await db.from("player_contacts").upsert({ player_id: id, email: email || null, phone: str(form, "phone") || null }));
  }
  return `${next.ign} saved.`;
});

export const addPlayer = teams(async (form, { db, game }) => {
  const teamId = str(form, "team");
  await teamOf(db, game, teamId);
  const p = playerFields(form);
  const row = check<{ id: string }>(await db.from("players").insert({ team_id: teamId, ...p, locked_fields: PLAYER_SYNCED }).select("id").single());
  const email = str(form, "email").toLowerCase();
  if (email) check(await db.from("player_contacts").upsert({ player_id: row.id, email, phone: str(form, "phone") || null }));
  return `${p.ign} added.`;
});

export const removePlayer = teams(async (form, { db, game }) => {
  const id = str(form, "id");
  const p = check<{ team_id: string; ign: string }>(await db.from("players").select("team_id, ign").eq("id", id).single());
  await teamOf(db, game, p.team_id);
  check(await db.from("players").delete().eq("id", id));
  return `${p.ign} removed. If they're still on the registration sheet, the next sync adds them back.`;
});
