import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { formatAdvanceRule, TIEBREAKERS } from "@/components/lobby/settings";
import { ResultChip, type ResultState } from "@/components/lobby/ResultChip";
import { StageTabs } from "@/components/lobby/StageTabs";
import { StandingsTable } from "@/components/lobby/StandingsTable";
import { applyOfficialGroups, createStages, fillEntrants, removeEntrant, saveStageSettings } from "@/app/admin/[game]/lobby/actions";
import { matchOfficialGroups, OFFICIAL_LOBBY_GROUPS, officialGroupOf, officialNames } from "@/content/lobby-groups";
import { loadResultStates } from "@/app/admin/[game]/lobby/data";
import { ScheduleForm } from "@/app/admin/[game]/lobby/ScheduleForm";
import { GAMES, type GameId } from "@/games/registry";
import { canStaff, requireStaff } from "@/lib/auth";
import { loadTournament, teamMap } from "@/lib/data";
import { dayKey, fmtDateTime } from "@/lib/format";
import { currentStage, loadLobbyGame, type LobbyGame } from "@/lib/lobby/data";
import type { LobbyMatch, LobbyStage } from "@/lib/lobby/types";
import type { Team } from "@/lib/types";

/**
 * Lobby games. "lobbies" is match night: every lobby's result state and the
 * standings. "setup" is the groups, entrants, draw and stage settings.
 */
export function LobbyAdmin({ game, view = "lobbies" }: { game: GameId; view?: LobbyView }) {
  return (
    <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
      <ControlRoom game={game} view={view} />
    </Suspense>
  );
}

type LobbyView = "lobbies" | "setup";

const timeIST = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

async function ControlRoom({ game, view }: { game: GameId; view: LobbyView }) {
  const viewer = await requireStaff();
  const def = GAMES[game];
  if (!canStaff(viewer, game)) return <p className="panel p-5 text-sm text-muted">You aren&apos;t on the staff for {def.name}.</p>;
  const [g, t] = await Promise.all([loadLobbyGame(game), loadTournament(game)]);
  const states = await loadResultStates(g.stages.map((s) => s.id));
  const teams = teamMap(t);
  const current = currentStage(g);

  return (
    <div style={{ "--game": def.accent } as React.CSSProperties}>
      {g.stages.length === 0 ? (
        view === "setup" ? (
          <section className="panel p-5">
            <p className="text-sm text-muted">
              No stages yet. {def.name} runs {(def.stages ?? []).map((s) => s.name).join(", then ")}.
            </p>
            <div className="mt-4">
              <ActionForm action={createStages} submit="Create stages">
                <input type="hidden" name="game" value={game} />
              </ActionForm>
            </div>
          </section>
        ) : (
          <p className="panel p-5 text-sm text-muted">
            No stages yet. Create them on <Link href={`/admin/${game}/setup`} className="link">Setup</Link>.
          </p>
        )
      ) : (
        <StageTabs
          initial={current?.id}
          tabs={g.stages.map((s) => {
            const p = g.standings[s.id]?.progress ?? { done: 0, total: 0 };
            return {
              id: s.id,
              label: s.name,
              meta: `${s.status} · ${(g.entrants[s.id] ?? []).length} in · ${p.done}/${p.total}`,
              content: <StageAdmin game={game} g={g} stage={s} teams={teams} states={states} view={view} />,
            };
          })}
        />
      )}
    </div>
  );
}

function Panel({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel p-4 sm:p-5">
      <h2 className="font-cond text-lg font-bold">{title}</h2>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** The organisers' published groups: who matched, pickers for the rest, one button to apply them with the schedule. */
function OfficialGroups({ game, stageId, entrants, teams, locked, drawn }: {
  game: GameId;
  stageId: string;
  entrants: { teamId: string; pool?: string }[];
  teams: Map<string, Team>;
  locked: boolean;
  drawn: number;
}) {
  const official = OFFICIAL_LOBBY_GROUPS[game]!;
  const names = officialNames(game);
  const all = [...teams.values()];
  const { ids, missing } = matchOfficialGroups(game, all, entrants);
  const used = new Set(ids.values());
  const free = all.filter((t) => !used.has(t.id)).sort((a, b) => a.name.localeCompare(b.name));
  const groupOf = officialGroupOf(game);
  const applied = entrants.length === names.length && entrants.every((e) => e.pool);

  return (
    <Panel title="Official groups" note={official.note}>
      <p className="text-sm">
        {ids.size} of {names.length} teams found in the registrations.
        {applied && drawn > 0 && <span className="text-win"> Applied: {drawn} matches scheduled.</span>}
      </p>
      {locked ? (
        <p className="mt-3 text-sm text-muted">Results are in, so the groups are locked.</p>
      ) : (
        <ActionForm action={applyOfficialGroups} submit={applied ? "Apply again" : "Apply groups and schedule"} tone={applied ? "quiet" : "primary"} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="stage" value={stageId} />
          {missing.length > 0 && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-xs text-warn">These names didn&apos;t match one registered team. Pick each one:</legend>
              {missing.map((name) => (
                <label key={name} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3 text-sm">
                  <span className="truncate"><span className="mr-2 font-cond text-xs text-faint">{groupOf.get(name)}</span>{name}</span>
                  <select name={`pick${names.indexOf(name)}`} defaultValue="" className={inputClass}>
                    <option value="">Choose a team</option>
                    {free.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
              ))}
            </fieldset>
          )}
          {applied && <p className="text-xs text-faint">Applying again replaces this stage&apos;s entrants and matches, room details included.</p>}
        </ActionForm>
      )}
    </Panel>
  );
}

function StageAdmin({
  game,
  g,
  stage,
  teams,
  states,
  view,
}: {
  game: GameId;
  g: LobbyGame;
  stage: LobbyStage;
  teams: Map<string, Team>;
  states: Map<string, ResultState>;
  view: LobbyView;
}) {
  const unit = GAMES[game].solo ? "player" : "team";
  const entrants = g.entrants[stage.id] ?? [];
  const matches = g.matches.filter((m) => m.stageId === stage.id);
  const st = g.standings[stage.id];
  const hasResults = matches.some((m) => (states.get(m.id) ?? "none") !== "none");
  const earlier = g.stages.filter((s) => s.ord < stage.ord);
  const feeding = earlier.filter((s) => s.settings.advance.some((r) => r.to === stage.name));
  const sources = feeding.length ? feeding : earlier.slice(-1);
  const unfinished = sources.filter((s) => !g.standings[s.id]?.complete);
  const firstAt = matches.map((m) => m.scheduledAt).filter((x): x is string => Boolean(x)).sort()[0];
  const name = (id: string) => teams.get(id)?.name ?? id;

  const rounds = new Map<number, LobbyMatch[]>();
  for (const m of matches) rounds.set(m.round, [...(rounds.get(m.round) ?? []), m]);

  const official = OFFICIAL_LOBBY_GROUPS[game];
  const isOfficialStage = !!official && stage.id === `${game}-${official.stage}`;

  return (
    <div className="flex flex-col gap-5">
      {view === "setup" && (<>
      {isOfficialStage && <OfficialGroups game={game} stageId={stage.id} entrants={entrants} teams={teams} locked={hasResults} drawn={matches.length} />}
      <Panel title={`Entrants · ${entrants.length}`}>
        {matches.length === 0 && (
          sources.length === 0 ? (
            <ActionForm action={fillEntrants} submit="Fill from eligible teams" tone={entrants.length ? "quiet" : "primary"}>
              <input type="hidden" name="game" value={game} />
              <input type="hidden" name="stage" value={stage.id} />
            </ActionForm>
          ) : unfinished.length ? (
            <p className="text-sm text-warn">
              {unfinished.map((s) => s.name).join(" and ")} isn&apos;t finished yet. Fill this stage once every lobby there is published.
            </p>
          ) : (
            <ActionForm action={fillEntrants} submit={`Fill from ${sources.map((s) => s.name).join(" and ")}`} tone={entrants.length ? "quiet" : "primary"}>
              <input type="hidden" name="game" value={game} />
              <input type="hidden" name="stage" value={stage.id} />
            </ActionForm>
          )
        )}
        {entrants.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-muted hover:text-text">Show all {entrants.length}</summary>
            <ul className="mt-3 divide-y divide-line text-sm">
              {[...entrants].sort((a, b) => (a.pool ?? "").localeCompare(b.pool ?? "") || name(a.teamId).localeCompare(name(b.teamId))).map((e) => (
                <li key={e.teamId} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">
                    {e.pool && <span className="mr-2 font-cond text-xs text-faint">{e.pool}</span>}
                    {name(e.teamId)}
                  </span>
                  {matches.length === 0 && (
                    <ActionForm action={removeEntrant} submit="Remove" tone="quiet" className="flex items-center gap-2">
                      <input type="hidden" name="game" value={game} />
                      <input type="hidden" name="stage" value={stage.id} />
                      <input type="hidden" name="team" value={e.teamId} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Panel>

      <Panel
        title="Lobbies & schedule"
        note={stage.settings.reshuffle ? "Lobbies are dealt fresh for every match, so teams rarely meet the same lobby twice." : "Each pool keeps its lobby for every match of the stage."}
      >
        <ScheduleForm
          game={game}
          stageId={stage.id}
          entrants={entrants.length}
          lobbySize={stage.settings.lobbySize}
          matches={stage.settings.matches}
          reshuffle={stage.settings.reshuffle}
          drawn={matches.length}
          locked={hasResults}
          defaults={(() => {
            const plan = GAMES[game].stages?.find((x) => `${game}-${x.id}` === stage.id || x.id === stage.id)?.schedule;
            return firstAt
              ? { firstDay: dayKey(firstAt), start: timeIST(firstAt), gap: plan?.gap, perDay: plan?.perDay, skip: plan?.skip }
              : { firstDay: plan?.firstDay ?? "", start: plan?.start ?? "20:30", gap: plan?.gap, perDay: plan?.perDay, skip: plan?.skip };
          })()}
          unit={unit}
        />
      </Panel>

      <Panel title="Stage settings">
        <SettingsForm game={game} stage={stage} />
      </Panel>
      </>)}

      {view === "lobbies" && (<>
      <Panel title="Matches" note={matches.length ? undefined : <>No lobbies yet. Draw them on <Link href={`/admin/${game}/setup`} className="link">Setup</Link>.</>}>
        {[...rounds.entries()].sort((a, b) => a[0] - b[0]).map(([round, ms]) => (
          <div key={round} className="mb-5 last:mb-0">
            <h3 className="mb-2 font-cond text-base font-semibold text-muted">Match {round}</h3>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-sm sm:min-w-[560px]">
                <tbody>
                  {ms.map((m) => (
                    <tr key={m.id} className="border-t border-line">
                      <td className="hidden py-2 pr-3 font-cond text-xs text-faint sm:table-cell">{m.id}</td>
                      <td className="py-2 pr-3">Lobby {m.lobby}</td>
                      <td className="py-2 pr-3 text-muted">{m.map ?? "–"}</td>
                      <td className="py-2 pr-3 text-muted">{m.scheduledAt ? fmtDateTime(m.scheduledAt) : "TBA"}</td>
                      <td className="tnum py-2 pr-3 font-cond text-muted">{m.entries.length}</td>
                      <td className="py-2 pr-3"><ResultChip state={states.get(m.id) ?? "none"} status={m.status} /></td>
                      <td className="py-2 text-right">
                        <Link href={`/admin/${game}/lobby/${m.id}`} className="link">Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Panel>

      {st && st.rows.length > 0 && (
        <Panel title="Standings" note="Published results only, as the public sees them.">
          {st.pools.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {st.pools.map((pool) => (
                <StandingsTable
                  key={pool}
                  id={`adm-${stage.id}-${pool}`}
                  game={game}
                  title={`Lobby ${pool}`}
                  rows={st.rows.filter((r) => r.pool === pool)}
                  teams={teams}
                  rounds={stage.settings.matches}
                  complete={st.complete}
                  unit={unit}
                />
              ))}
            </div>
          ) : (
            <StandingsTable id={`adm-${stage.id}`} game={game} rows={st.rows} teams={teams} rounds={stage.settings.matches} complete={st.complete} unit={unit} />
          )}
        </Panel>
      )}
      </>)}
    </div>
  );
}

function SettingsForm({ game, stage }: { game: GameId; stage: LobbyStage }) {
  const s = stage.settings;
  return (
    // Remount when saved settings change, so the fields show what's stored.
    <ActionForm key={JSON.stringify(s) + stage.status} action={saveStageSettings} submit="Save stage" className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="game" value={game} />
      <input type="hidden" name="stage" value={stage.id} />
      <label className="flex flex-col gap-1 text-xs text-muted">
        Status
        <select name="status" defaultValue={stage.status} className={inputClass}>
          <option value="upcoming">Upcoming</option>
          <option value="live">Live</option>
          <option value="complete">Complete</option>
        </select>
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-muted">
        <input type="checkbox" name="reshuffle" defaultChecked={s.reshuffle} className="accent-[var(--game)]" />
        Deal new lobbies every match
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Lobby size
        <input name="lobby_size" inputMode="numeric" defaultValue={s.lobbySize} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Matches per entrant
        <input name="matches" inputMode="numeric" defaultValue={s.matches} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Maps, in match order
        <input name="maps" defaultValue={s.maps.join(", ")} placeholder="Leave empty for the referee's choice" className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Points by placement, 1st first
        <input name="points" defaultValue={s.points.placement.join(", ")} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        Points per kill
        <input name="per_kill" inputMode="numeric" defaultValue={s.points.perKill} className={inputClass} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Tiebreakers, in order
        <input name="tiebreakers" defaultValue={s.tiebreakers.join(", ")} className={inputClass} />
        <span className="text-faint">Any of: {TIEBREAKERS.join(", ")}</span>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted sm:col-span-2">
        Who goes through, one rule per line
        <textarea name="advance" rows={3} defaultValue={s.advance.map(formatAdvanceRule).join("\n")} className={`${inputClass} font-cond`} />
        <span className="text-faint">top 2 per pool -&gt; Semifinals · top 5 per pool in A-D -&gt; Semifinals · best 1 at rank 4 -&gt; Semifinals · top 6 overall -&gt; Grand Final</span>
      </label>
    </ActionForm>
  );
}
