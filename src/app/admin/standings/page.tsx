import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { requireAdmin } from "@/lib/auth";
import { loadTournament } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { addStandingAdjustment, deleteStandingAdjustment } from "../actions";

export const metadata: Metadata = { title: "Standings and penalties" };

export default function StandingsAdminPage() {
  return <Suspense fallback={<div className="panel h-80 animate-pulse" />}><Body /></Suspense>;
}

async function Body() {
  await requireAdmin();
  const game = "codm";
  const [t, db] = await Promise.all([loadTournament(game), createClient()]);
  const { data: adjustments, error } = await db.from("team_point_adjustments")
    .select("id, team_id, points_delta, reason, created_at")
    .eq("game_id", game).order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const names = new Map(t.teams.map((team) => [team.id, team.name]));
  return <>
    <h1 className="font-display text-4xl">Standings & penalties</h1>
    <p className="mt-2 max-w-2xl text-sm text-muted">Apply an approved CODM points correction or disciplinary penalty. Positive values add points; negative values deduct points. Standings, rankings and qualification recalculate automatically.</p>
    <section className="panel mt-6 p-5">
      <h2 className="font-cond text-lg font-bold">Add adjustment</h2>
      <ActionForm action={addStandingAdjustment} submit="Apply adjustment" className="mt-4 grid gap-3">
        <input type="hidden" name="game_id" value={game} />
        <label className="flex flex-col gap-1 text-xs text-muted">Team
          <select name="team_id" required defaultValue="" className={inputClass}>
            <option value="" disabled>Choose team</option>
            {t.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">Points (+/-)
          <input name="points_delta" type="number" step="1" min="-100" max="100" required placeholder="-1" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">Reason / official decision
          <textarea name="reason" required rows={3} maxLength={500} placeholder="Record the approved decision..." className={inputClass} />
        </label>
      </ActionForm>
    </section>
    <section className="mt-8">
      <h2 className="font-display text-2xl">Adjustment history ({adjustments?.length ?? 0})</h2>
      {!adjustments?.length ? <p className="mt-3 text-sm text-muted">No manual adjustments recorded.</p> : <ul className="mt-3 divide-y divide-line border-y border-line">
        {adjustments.map((a) => <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{names.get(a.team_id) ?? a.team_id} <span className={a.points_delta < 0 ? "text-warn" : "text-win"}>{a.points_delta > 0 ? "+" : ""}{a.points_delta} pts</span></p>
            <p className="text-xs text-muted">{a.reason}</p>
            <p className="text-[11px] text-faint">{new Date(a.created_at).toLocaleString("en-IN")}</p>
          </div>
          <ActionForm action={deleteStandingAdjustment} submit="Remove" tone="danger"><input type="hidden" name="id" value={a.id} /></ActionForm>
        </li>)}
      </ul>}
    </section>
  </>;
}
