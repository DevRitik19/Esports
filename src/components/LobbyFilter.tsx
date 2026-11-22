"use client";

import { useEffect, useState } from "react";

const MODES = [["HP", "Hardpoint"], ["DOM", "Domination"], ["SND", "Search & Destroy"]] as const;

/**
 * Narrows a referee's CODM match list to one mode day and one lobby; rows
 * carry data-mode and data-lobby. Remembered per browser, since a referee
 * keeps the same lobby all three days.
 */
export function LobbyFilter({ scope, lobbies }: { scope: string; lobbies: number }) {
  const [mode, setMode] = useState("");
  const [lobby, setLobby] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(`lobby-filter:${scope}`) ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- storage is only readable after hydration
      setMode(saved.mode ?? "");
      setLobby(saved.lobby ?? "");
    } catch {}
  }, [scope]);

  const save = (next: { mode: string; lobby: string }) => {
    setMode(next.mode);
    setLobby(next.lobby);
    try {
      localStorage.setItem(`lobby-filter:${scope}`, JSON.stringify(next));
    } catch {}
  };

  const rules = [
    mode && `[data-board="${scope}"] [data-mode]:not([data-mode="${mode}"]) { display: none; }`,
    lobby && `[data-board="${scope}"] [data-lobby]:not([data-lobby="${lobby}"]) { display: none; }`,
  ].filter(Boolean);

  const select = "border border-line-strong bg-deep px-3 py-2 text-sm text-text";
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
      <label className="flex items-center gap-2">
        Day
        <select value={mode} onChange={(e) => save({ mode: e.target.value, lobby })} className={select}>
          <option value="">All days</option>
          {MODES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2">
        Lobby
        <select value={lobby} onChange={(e) => save({ mode, lobby: e.target.value })} className={select}>
          <option value="">All lobbies</option>
          {Array.from({ length: lobbies }, (_, i) => <option key={i} value={i + 1}>Lobby {i + 1}</option>)}
        </select>
      </label>
      {rules.length > 0 && <style>{rules.join("\n")}</style>}
    </div>
  );
}
