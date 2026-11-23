import Link from "next/link";
import { ResultChip, type ResultState } from "@/components/lobby/ResultChip";
import { eveningsOf, lobbyLabel } from "@/components/lobby/slots";
import { StatusChip } from "@/components/StatusChip";
import type { GameDef } from "@/games/registry";
import { dayKey, fmtTime } from "@/lib/format";
import type { LobbyGame } from "@/lib/lobby/data";
import type { Match, Team } from "@/lib/types";

export type GameNight =
  | { def: GameDef; kind: "lobby"; g: LobbyGame; states: Map<string, ResultState> }
  | { def: GameDef; kind: "h2h"; matches: Match[]; teams: Team[] };

/** Matches still to play or being played, from `from` (YYYY-MM-DD, IST) on. */
export function upcomingDays(n: GameNight, from: string): string[] {
  const ms = n.kind === "lobby" ? n.g.matches : n.matches;
  return ms.filter((m) => m.scheduledAt && (m.status === "scheduled" || m.status === "live") && dayKey(m.scheduledAt) >= from).map((m) => dayKey(m.scheduledAt!));
}

/** One game's lobbies or matches on one match day, each opening its staff page. */
export function GameMatchDay({ n, day }: { n: GameNight; day: string }) {
  const accent = { "--game": n.def.accent } as React.CSSProperties;
  const heading = (
    <h3 className="mb-3 flex items-center gap-2.5 font-cond text-xl font-bold">
      <span className="size-2.5 bg-[var(--game)]" aria-hidden />
      {n.def.name}
    </h3>
  );

  if (n.kind === "lobby") {
    const evening = eveningsOf(n.g.matches, n.g.stages).find((e) => e.day === day);
    if (!evening) return null;
    return (
      <section style={accent}>
        {heading}
        <div className="flex flex-col gap-4">
          {evening.slots.map((s) => (
            <div key={s.key}>
              <p className="mb-2 text-sm text-muted">
                <span className="tnum font-cond text-base font-semibold text-text">{s.at ? fmtTime(s.at) : "TBA"}</span>
                {" · "}{s.stage?.name} match {s.round}{s.map ? ` · ${s.map}` : ""}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {s.lobbies.map((m) => (
                  <Link key={m.id} href={`/admin/${n.def.id}/lobby/${m.id}`} className="panel flex min-h-16 flex-col justify-between gap-2 p-3 hover:border-[var(--game)]">
                    <span className="font-cond text-lg font-bold">{lobbyLabel(m.lobby)}</span>
                    <span className="flex items-center justify-between gap-2">
                      <ResultChip state={n.states.get(m.id) ?? "none"} status={m.status} />
                      <span className="tnum font-cond text-xs text-faint">{m.entries.length} teams</span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  const teams = new Map(n.teams.map((t) => [t.id, t.name]));
  const name = (id?: string, label?: string) => (id ? teams.get(id) ?? id : label ?? "TBD");
  const matches = n.matches
    .filter((m) => m.scheduledAt && dayKey(m.scheduledAt) === day)
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!) || a.id.localeCompare(b.id));
  if (!matches.length) return null;
  // Matches starting together (a CODM wave, a Valorant round) share a row of cards.
  const slots = new Map<string, Match[]>();
  for (const m of matches) slots.set(m.scheduledAt!, [...(slots.get(m.scheduledAt!) ?? []), m]);
  return (
    <section style={accent}>
      {heading}
      <div className="flex flex-col gap-4">
        {[...slots].map(([at, ms]) => (
          <div key={at}>
            <p className="mb-2 text-sm text-muted">
              <span className="tnum font-cond text-base font-semibold text-text">{fmtTime(at)}</span>
              {ms[0].round && ms[0].lobby ? ` · Wave ${ms[0].round}` : ""}
              {" · "}{ms.length} match{ms.length === 1 ? "" : "es"}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {ms.map((m) => (
                <li key={m.id}>
                  <Link href={`/admin/matches/${m.id}`} className="panel flex h-full flex-col gap-2 p-3 hover:border-[var(--game)]">
                    <span className="flex items-center justify-between gap-2 text-xs text-faint">
                      <span>{m.lobby ? `Lobby ${m.lobby}` : m.id}</span>
                      <StatusChip status={m.status} />
                    </span>
                    <span className="text-sm leading-snug">
                      <span className="font-medium">{name(m.a.teamId, m.a.label)}</span>
                      <span className="text-faint"> vs </span>
                      <span className="font-medium">{name(m.b.teamId, m.b.label)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
