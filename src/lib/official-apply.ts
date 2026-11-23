import "server-only";
import { normaliseSettings } from "@/components/lobby/settings";
import { MODE_DAYS, matchOfficialTeams, officialFixtures, OFFICIAL_GROUPS, picksFromFixtures } from "@/content/codm-schedule";
import { matchOfficialGroups, OFFICIAL_LOBBY_GROUPS, officialGroupOf } from "@/content/lobby-groups";
import { GAMES, type GameId } from "@/games/registry";
import { valorantBestOf, VALORANT_SCHEDULE, VALORANT_TEAMS } from "@/content/valorant-bracket";
import { scheduleKnockout, singleElimination } from "@/lib/knockout";
import { matchTime, planStageMatches, schedulePools } from "@/lib/lobby/deal";
import { matchNames } from "@/lib/match-names";
import { normName, tagFor, teamIdFor } from "@/lib/sync/parse";
import type { LobbyEntrant } from "@/lib/lobby/types";
import type { PostgrestClient } from "@supabase/postgrest-js";

// Putting the organisers' published groups and fixtures into the database.
// Not a server action module: callers check who is asking first.

/** The signed-in client (staff) or the service client (the sync endpoint); only tables are used. */
type Db = Pick<PostgrestClient, "from">;

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

/**
 * Valorant: the published 32-team bracket. Round of 32 pairs as published,
 * later rounds fed by the winners, every online match at its published time.
 * Replaces an earlier bracket only if no result has been entered.
 */
export async function applyValorant(db: Db, chosen: Record<string, string> = {}): Promise<string> {
  const teams = await registered(db, "valorant");
  if (!teams.length) throw new Error("Sync the Valorant registrations first.");
  const { ids, missing } = matchNames(VALORANT_TEAMS, teams, chosen);
  // The published bracket is the official list: a team in it that isn't on
  // the registration sheet is added under its published name. Its sheet key
  // lets the sync adopt it if it registers later.
  if (missing.length) {
    const taken = new Set(teams.map((t) => t.id));
    const added = missing.map((name) => {
      const id = teamIdFor("valorant", name, taken);
      taken.add(id);
      ids.set(name, id);
      return { id, game_id: "valorant", name, tag: tagFor(name), status: "confirmed", eligible: true, sheet_key: normName(name) };
    });
    check(await db.from("teams").insert(added));
  }

  const old = check<{ id: string }[]>(await db.from("matches").select("id").eq("game_id", "valorant"));
  if (old.length) {
    const played = check<{ match_id: string }[]>(await db.from("maps").select("match_id").in("match_id", old.map((m) => m.id)).limit(1));
    if (played.length) throw new Error("Valorant results are already in, so its bracket can't be replaced.");
    check(await db.from("matches").delete().eq("game_id", "valorant"));
  }
  const rows = singleElimination({ prefix: "VAL", entrants: VALORANT_TEAMS.map((n) => ids.get(n)!), bestOf: valorantBestOf, thirdPlace: false });
  const times = scheduleKnockout(rows, VALORANT_SCHEDULE);
  check(await db.from("matches").insert(rows.map((r) => ({
    id: r.id, game_id: "valorant", stage: r.stage, round: r.round, best_of: r.bestOf,
    side_a: r.sideA, side_b: r.sideB, scheduled_at: times.get(r.id) ?? null,
  }))));
  const note = missing.length ? ` Added ${missing.length} team(s) not on the registration sheet: ${missing.join(", ")}.` : "";
  return `${rows.length} matches: 16 in the Round of 32, then the Round of 16 and 8 at the published times; Semifinals and Final offline.${note}`;
}

/** Has this game's published schedule already been put in? (Re-applying would wipe rooms and check-ins.) */
export async function isApplied(db: Db, game: GameId): Promise<boolean> {
  if (game === "codm") {
    const r = await db.from("matches").select("id", { count: "exact", head: true }).eq("game_id", "codm").eq("stage", "group");
    return (r.count ?? 0) > 0;
  }
  if (game === "valorant") {
    // The published bracket has a Round of 32 and nothing bigger.
    const [r32, bigger] = await Promise.all([
      db.from("matches").select("id", { count: "exact", head: true }).eq("id", "VAL-R32-16"),
      db.from("matches").select("id", { count: "exact", head: true }).eq("game_id", "valorant").in("stage", ["r64", "r128"]),
    ]);
    return (r32.count ?? 0) > 0 && (bigger.count ?? 0) === 0;
  }
  const og = OFFICIAL_LOBBY_GROUPS[game];
  if (!og) return false;
  const r = await db.from("lobby_matches").select("id", { count: "exact", head: true }).eq("stage_id", `${game}-${og.stage}`);
  return (r.count ?? 0) > 0;
}

/** Games with a published online schedule. */
export const OFFICIAL_GAMES: GameId[] = ["codm", "valorant", "freefire", "bgmi"];

/** Sets up one game's published schedule. */
export function applyOfficial(db: Db, game: GameId): Promise<string> {
  if (game === "codm") return applyCodm(db);
  if (game === "valorant") return applyValorant(db);
  return applyLobbyGroups(db, game);
}
