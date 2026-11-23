import "server-only";
import { GAMES, isGameId, type GameId } from "@/games/registry";
import { createClient } from "./supabase/server";

/** Staff-only reads. Uses the signed-in client, so RLS enforces staff access. */
export async function getMatchPrivate(matchId: string) {
  const db = await createClient();
  const [maps, room, checkIns, disputes, veto, subs, mapVetoes] = await Promise.all([
    db.from("maps").select("*").eq("match_id", matchId).order("game"),
    db.from("match_rooms").select("*").eq("match_id", matchId).maybeSingle(),
    db.from("check_ins").select("*").eq("match_id", matchId),
    db.from("disputes").select("*").eq("match_id", matchId).order("created_at", { ascending: false }),
    db.from("veto_choices").select("*").eq("match_id", matchId).maybeSingle(),
    db.from("sub_requests").select("*, out:players!sub_requests_player_out_fkey(ign), in:players!sub_requests_player_in_fkey(ign)").eq("match_id", matchId),
    db.from("map_vetoes").select("*").eq("match_id", matchId),
  ]);
  return {
    maps: maps.data ?? [],
    room: room.data,
    checkIns: checkIns.data ?? [],
    disputes: disputes.data ?? [],
    veto: veto.data,
    subs: subs.data ?? [],
    mapVetoes: mapVetoes.data ?? [],
  };
}

/** What needs a staff member's attention in one game. */
export interface GameTodo {
  /** Results entered but not yet public. */
  pending: number;
  openDisputes: number;
}

/**
 * Counts only (no rows), one pair of small queries per game: unpublished
 * results and open disputes. RLS already hides games a referee doesn't run.
 */
export async function getTodos(games: GameId[]): Promise<Map<GameId, GameTodo>> {
  const db = await createClient();
  const count = (r: { count: number | null; error: { message: string } | null }) => (r.error ? 0 : (r.count ?? 0));
  const rows = await Promise.all(
    games.map(async (game): Promise<[GameId, GameTodo]> => {
      if (GAMES[game].shape === "lobby") {
        const [pending, disputes] = await Promise.all([
          db.from("lobby_matches").select("id, lobby_stages!inner(game_id)", { count: "exact", head: true }).eq("results", "draft").eq("lobby_stages.game_id", game),
          db.from("lobby_disputes").select("id, lobby_matches!inner(lobby_stages!inner(game_id))", { count: "exact", head: true }).eq("status", "open").eq("lobby_matches.lobby_stages.game_id", game),
        ]);
        return [game, { pending: count(pending), openDisputes: count(disputes) }];
      }
      const [pending, disputes] = await Promise.all([
        db.from("maps").select("match_id, matches!inner(game_id)", { count: "exact", head: true }).eq("status", "pending").eq("matches.game_id", game),
        db.from("disputes").select("id, matches!inner(game_id)", { count: "exact", head: true }).eq("status", "open").eq("matches.game_id", game),
      ]);
      return [game, { pending: count(pending), openDisputes: count(disputes) }];
    }),
  );
  return new Map(rows);
}

/** Unapproved map results per match, for one head-to-head game's list. */
export async function getPendingByMatch(game: GameId): Promise<Record<string, number>> {
  const db = await createClient();
  const { data } = await db.from("maps").select("match_id, matches!inner(game_id)").eq("status", "pending").eq("matches.game_id", game);
  const out: Record<string, number> = {};
  for (const r of data ?? []) out[r.match_id] = (out[r.match_id] ?? 0) + 1;
  return out;
}

export interface DisputeRow {
  id: string;
  game: GameId;
  matchId: string;
  teamId: string;
  reason: string;
  evidenceUrl: string | null;
  status: "open" | "upheld" | "rejected";
  resolution: string | null;
  createdAt: string;
  /** Where staff resolve it. */
  href: string;
}

/** Every dispute the viewer can see, head-to-head and lobby, open ones first, newest first. */
export async function getDisputes(): Promise<DisputeRow[]> {
  const db = await createClient();
  const [h2h, lobby] = await Promise.all([
    db.from("disputes").select("id, match_id, team_id, reason, evidence_url, status, resolution, created_at, matches!inner(game_id)").order("created_at", { ascending: false }).limit(200),
    db.from("lobby_disputes").select("id, match_id, team_id, reason, evidence_url, status, resolution, created_at, lobby_matches!inner(lobby_stages!inner(game_id))").order("created_at", { ascending: false }).limit(200),
  ]);
  type Base = { id: string; match_id: string; team_id: string; reason: string; evidence_url: string | null; status: DisputeRow["status"]; resolution: string | null; created_at: string };
  const one = <T,>(x: T | T[]) => (Array.isArray(x) ? x[0] : x);
  const rows: DisputeRow[] = [];
  for (const d of (h2h.data ?? []) as (Base & { matches: { game_id: string } | { game_id: string }[] })[]) {
    const game = one(d.matches)?.game_id;
    if (!game || !isGameId(game)) continue;
    rows.push({ id: d.id, game, matchId: d.match_id, teamId: d.team_id, reason: d.reason, evidenceUrl: d.evidence_url, status: d.status, resolution: d.resolution, createdAt: d.created_at, href: `/admin/matches/${d.match_id}` });
  }
  for (const d of (lobby.data ?? []) as (Base & { lobby_matches: { lobby_stages: { game_id: string } | { game_id: string }[] } | { lobby_stages: { game_id: string } | { game_id: string }[] }[] })[]) {
    const game = one(one(d.lobby_matches)?.lobby_stages)?.game_id;
    if (!game || !isGameId(game)) continue;
    rows.push({ id: d.id, game, matchId: d.match_id, teamId: d.team_id, reason: d.reason, evidenceUrl: d.evidence_url, status: d.status, resolution: d.resolution, createdAt: d.created_at, href: `/admin/${game}/lobby/${d.match_id}` });
  }
  return rows.sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.createdAt.localeCompare(a.createdAt));
}

export async function getStaffList() {
  const db = await createClient();
  const { data } = await db.from("staff").select("*").order("email");
  return data ?? [];
}
