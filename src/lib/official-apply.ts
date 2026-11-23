import "server-only";
import { normaliseSettings } from "@/components/lobby/settings";
import { MODE_DAYS, matchOfficialTeams, officialFixtures, OFFICIAL_GROUPS, picksFromFixtures } from "@/content/codm-schedule";
import { matchOfficialGroups, OFFICIAL_LOBBY_GROUPS, officialGroupOf } from "@/content/lobby-groups";
import { GAMES, type GameId } from "@/games/registry";
import { matchTime, planStageMatches, schedulePools } from "@/lib/lobby/deal";
import type { LobbyEntrant } from "@/lib/lobby/types";
import type { createClient } from "@/lib/supabase/server";

// Putting the organisers' published groups and fixtures into the database.
// Not a server action module: callers check who is asking first.

type Db = Awaited<ReturnType<typeof createClient>>;

const check = <T,>(r: { error: { message: string } | null; data?: T | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
};

/** A game's registered teams in registration order (numbered twins like "ZERO MERCY (2)" rely on it). */
async function registered(db: Db, game: GameId) {
  return check<{ id: string; name: string }[]>(await db.from("teams").select("id, name").eq("game_id", game).order("created_at").order("id"));
}

/** CODM: each team's official group and the 138 published group matches. */
export async function applyCodm(db: Db, chosen: Record<string, string> = {}): Promise<string> {
  const teams = await registered(db, "codm");
  if (!teams.length) throw new Error("Sync the CODM registrations first.");
  const applied = check<{ id: string; side_a: string; side_b: string }[]>(await db.from("matches").select("id, side_a, side_b").eq("game_id", "codm").like("id", "HP-W%"));
  const earlier = picksFromFixtures(applied.map((m) => ({ id: m.id, a: { teamId: m.side_a }, b: { teamId: m.side_b } })));
  const { ids, missing } = matchOfficialTeams(teams, { ...earlier, ...chosen });
  if (missing.length) throw new Error(`Pick the registered team for: ${missing.join(", ")}.`);

  const group = check<{ id: string }[]>(await db.from("matches").select("id").eq("game_id", "codm").in("stage", ["group", "tiebreak"]));
  if (group.length) {
    const played = check<{ match_id: string }[]>(await db.from("maps").select("match_id").in("match_id", group.map((m) => m.id)).limit(1));
    if (played.length) throw new Error("Group results are already in. Fix single matches on their own pages instead.");
    check(await db.from("matches").delete().in("id", group.map((m) => m.id)));
  }

  const official = new Map([...ids].map(([name, id]) => [id, name]));
  const groupOf = new Map(Object.entries(OFFICIAL_GROUPS).flatMap(([g, names]) => names.map((n) => [n, g])));
  check(await db.from("teams").update({ group_name: null }).eq("game_id", "codm"));
  for (const g of Object.keys(OFFICIAL_GROUPS)) {
    check(await db.from("teams").update({ group_name: g }).in("id", [...official].filter(([, n]) => groupOf.get(n) === g).map(([id]) => id)));
  }

  const { fixtures } = officialFixtures((n) => ids.get(n));
  check(await db.from("matches").insert(fixtures.map((f) => ({
    id: f.id, game_id: "codm", stage: "group", group_name: f.group, round: f.wave, lobby: f.lobby, mode: f.mode, map: f.map,
    best_of: 1, side_a: f.a, side_b: f.b, scheduled_at: f.scheduledAt ?? null,
  }))));
  check(await db.from("config").upsert([
    { key: "qualifiers_per_group", value: "1" },
    { key: "best_runners_up", value: "1" },
    { key: "tiebreakers", value: "h2h, playoff" },
  ]));
  check(await db.from("match_days").upsert(MODE_DAYS.map((d) => ({ day: d.date, mode: d.mode, map: d.map }))));
  const unlisted = teams.length - official.size;
  return `${fixtures.length} group matches for 29 teams in 7 groups.${unlisted ? ` ${unlisted} other registered team(s) have no group.` : ""}`;
}

/**
 * Free Fire, BGMI: creates the stages if there are none, then puts every
 * registered team in its published group and creates every match of the
 * first stage at its published time.
 */
export async function applyLobbyGroups(db: Db, game: GameId, chosen: Record<string, string> = {}): Promise<string> {
  const official = OFFICIAL_LOBBY_GROUPS[game];
  const templates = GAMES[game].stages ?? [];
  const template = templates.find((s) => s.id === official?.stage);
  if (!official || !template?.schedule) throw new Error(`${GAMES[game].name} has no published groups.`);

  const stages = check<{ id: string }[]>(await db.from("lobby_stages").select("id").eq("game_id", game));
  if (!stages.length) {
    check(await db.from("lobby_stages").insert(
      templates.map((t, i) => ({ id: `${game}-${t.id}`, game_id: game, ord: i + 1, name: t.name, settings: t.settings, status: "upcoming" })),
    ));
  }
  const stageId = `${game}-${template.id}`;
  const row = check<{ settings: unknown } | null>(await db.from("lobby_stages").select("settings").eq("id", stageId).maybeSingle());
  if (!row) throw new Error(`${GAMES[game].name} has no ${template.name} stage.`);
  const settings = normaliseSettings(row.settings as never);

  const existing = check<{ id: string; results: string }[]>(await db.from("lobby_matches").select("id, results").eq("stage_id", stageId));
  if (existing.some((m) => m.results !== "none")) throw new Error("Results are already entered for this stage, so its groups can't change.");

  const teams = await registered(db, game);
  const before = check<{ team_id: string; pool: string | null }[]>(await db.from("lobby_entrants").select("team_id, pool").eq("stage_id", stageId));
  const { ids, missing } = matchOfficialGroups(game, teams, before.map((e) => ({ teamId: e.team_id, pool: e.pool ?? undefined })), chosen);
  if (missing.length) throw new Error(`Pick the registered team for: ${missing.join(", ")}.`);

  const groupOf = officialGroupOf(game);
  const entrants: LobbyEntrant[] = [...ids].map(([name, teamId]) => ({ teamId, pool: groupOf.get(name)! }));
  if (existing.length) check(await db.from("lobby_matches").delete().eq("stage_id", stageId));
  check(await db.from("lobby_entrants").delete().eq("stage_id", stageId));
  check(await db.from("lobby_entrants").insert(entrants.map((e) => ({ stage_id: stageId, team_id: e.teamId, pool: e.pool }))));

  const plan = planStageMatches({ gameId: game, stage: { id: template.id, settings }, entrants });
  const { firstDay, start, gap, perDay } = template.schedule;
  const starts = schedulePools(Object.keys(official.groups).sort(), { firstDay, poolsPerDay: perDay, start });
  check(await db.from("lobby_matches").insert(plan.map((m) => ({
    id: m.id, stage_id: stageId, round: m.round, lobby: m.lobby, map: m.map ?? null,
    scheduled_at: matchTime(starts.get(m.lobby)!, m.round, gap), team_ids: m.teamIds,
  }))));
  return `${entrants.length} teams in ${Object.keys(official.groups).length} groups, ${plan.length} matches at the published times.`;
}

/** Has this game's published schedule already been put in? (Re-applying would wipe rooms and check-ins.) */
export async function isApplied(db: Db, game: GameId): Promise<boolean> {
  if (game === "codm") {
    const r = await db.from("matches").select("id", { count: "exact", head: true }).eq("game_id", "codm").eq("stage", "group");
    return (r.count ?? 0) > 0;
  }
  const og = OFFICIAL_LOBBY_GROUPS[game];
  if (!og) return false;
  const r = await db.from("lobby_matches").select("id", { count: "exact", head: true }).eq("stage_id", `${game}-${og.stage}`);
  return (r.count ?? 0) > 0;
}

/** Games with a published online schedule. */
export const OFFICIAL_GAMES: GameId[] = ["codm", "freefire", "bgmi"];
