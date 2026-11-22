"use client";

import { useEffect, useState } from "react";

/**
 * Highlights one team's rows on a board: rows carry data-teams="<id> <id>".
 * The pick is kept in the URL (?team=) so a captain can share their view.
 */
export function TeamFilter({ teams, scope }: { teams: { id: string; name: string }[]; scope: string }) {
  const [team, setTeam] = useState("");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("team") ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable after hydration
    if (teams.some((t) => t.id === fromUrl)) setTeam(fromUrl);
  }, [teams]);

  const pick = (id: string) => {
    setTeam(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("team", id);
    else url.searchParams.delete("team");
    window.history.replaceState(null, "", url);
  };

  // Ids are slugs, so they're safe inside an attribute selector.
  const css = team
    ? `[data-board="${scope}"] [data-teams]:not([data-teams~="${team}"]) { opacity: .32; }
       [data-board="${scope}"] [data-teams~="${team}"] { box-shadow: inset 3px 0 0 var(--game, var(--color-signal)); background: color-mix(in oklab, var(--game, var(--color-signal)) 10%, transparent); }
       [data-board="${scope}"] [data-wave]:not(:has([data-teams~="${team}"])) { opacity: .5; }`
    : "";

  return (
    <label className="flex flex-wrap items-center gap-3 text-sm text-muted">
      Find your team
      <select value={team} onChange={(e) => pick(e.target.value)} className="min-w-56 border border-line-strong bg-deep px-3 py-2 text-text">
        <option value="">All teams</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      {css && <style>{css}</style>}
    </label>
  );
}
