import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { gameOf } from "@/games/params";
import { GAMES } from "@/games/registry";
import { createClient } from "@/lib/supabase/server";
import { addPlayer, deleteTeam, followSheet, removePlayer, savePlayer, saveTeam } from "../actions";

export const metadata: Metadata = { title: "Edit team" };

export default function TeamPage({ params }: PageProps<"/admin/[game]/teams/[team]">) {
  return (
    <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
      <Body params={params} />
    </Suspense>
  );
}

interface Player {
  id: string; ign: string; game_uid: string; discord: string | null; role: "main" | "sub"; is_captain: boolean;
  locked_fields: string[]; missing_since: string | null; player_contacts: { email: string | null; phone: string | null } | null;
}

const label = "flex flex-col gap-1 text-xs text-muted";
const check = "flex items-center gap-2 text-sm";

async function Body({ params }: Pick<PageProps<"/admin/[game]/teams/[team]">, "params">) {
  const p = await params;
  const game = gameOf(p.game);
  const db = await createClient();
  const { data: team } = await db
    .from("teams")
    .select("id, name, tag, status, eligible, eligibility_note, college, logo_url, group_name, locked_fields, sheet_key, missing_since, synced_at")
    .eq("id", p.team)
    .eq("game_id", game)
    .maybeSingle();
  if (!team) notFound();
  const { data } = await db
    .from("players")
    .select("id, ign, game_uid, discord, role, is_captain, locked_fields, missing_since, player_contacts(email, phone)")
    .eq("team_id", team.id)
    .order("is_captain", { ascending: false })
    .order("role")
    .order("ign");
  const players = (data ?? []) as unknown as Player[];
  const def = GAMES[game];
  const idLabel = `${def.short} ID`;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/admin/${game}/teams`} className="link self-start text-sm">All teams</Link>

      <section className="panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-cond text-2xl font-bold">{team.name}</h2>
          <p className="text-xs text-muted">
            {team.sheet_key ? (team.missing_since ? "No longer on the registration sheet." : "From the registration sheet.") : "Added by staff."}
            {team.group_name ? ` Group ${team.group_name}.` : ""}
          </p>
        </div>
        <ActionForm action={saveTeam} submit="Save team" className="mt-4 grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="id" value={team.id} />
          <label className={label}>Team name<input name="name" defaultValue={team.name} required className={inputClass} /></label>
          <label className={label}>Tag (shown on boards)<input name="tag" defaultValue={team.tag} maxLength={6} required className={`${inputClass} uppercase`} /></label>
          <label className={label}>
            Status
            <select name="status" defaultValue={team.status} className={inputClass}>
              <option value="confirmed">Confirmed</option>
              <option value="forming">Still forming</option>
              <option value="withdrawn">Withdrawn</option>
              <option value="disqualified">Disqualified</option>
            </select>
          </label>
          <label className={label}>College<input name="college" defaultValue={team.college ?? ""} className={inputClass} /></label>
          <label className={label}>Logo (https:// image link)<input name="logo_url" defaultValue={team.logo_url ?? ""} placeholder="https://…" className={inputClass} /></label>
          <div className="flex flex-col gap-2">
            <label className={check}><input type="checkbox" name="eligible" defaultChecked={team.eligible} className="accent-signal" /> Eligible to play</label>
            <input name="eligibility_note" defaultValue={team.eligibility_note ?? ""} placeholder="Why not, if not eligible" aria-label="Eligibility note" className={inputClass} />
          </div>
        </ActionForm>
        {team.locked_fields.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-xs text-muted">
            <span>Kept when the sheet syncs: {team.locked_fields.join(", ").replaceAll("_", " ")}.</span>
            <ActionForm action={followSheet} submit="Follow the sheet again" tone="quiet" className="contents">
              <input type="hidden" name="game" value={game} />
              <input type="hidden" name="id" value={team.id} />
            </ActionForm>
          </div>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-cond text-lg font-bold">Players</h2>
        <p className="mt-1 text-xs text-muted">Emails and phone numbers are visible to {def.name} staff only. The leader&apos;s email is the one that can log in.</p>
        <div className="mt-4 flex flex-col gap-3">
          {players.length === 0 && <p className="text-sm text-muted">No players yet.</p>}
          {players.map((pl) => (
            <div key={pl.id} className="border border-line p-3">
              <ActionForm action={savePlayer} submit="Save" tone="quiet" className="grid gap-2 sm:grid-cols-3">
                <input type="hidden" name="game" value={game} />
                <input type="hidden" name="id" value={pl.id} />
                <label className={label}>In-game name<input name="ign" defaultValue={pl.ign} required className={inputClass} /></label>
                <label className={label}>{idLabel}<input name="game_uid" defaultValue={pl.game_uid} className={inputClass} /></label>
                <label className={label}>Discord<input name="discord" defaultValue={pl.discord ?? ""} className={inputClass} /></label>
                <label className={label}>Email<input name="email" type="email" defaultValue={pl.player_contacts?.email ?? ""} className={inputClass} /></label>
                <label className={label}>Phone<input name="phone" defaultValue={pl.player_contacts?.phone ?? ""} className={inputClass} /></label>
                <div className="flex flex-wrap items-center gap-4 pt-4">
                  <label className={check}><input type="checkbox" name="is_captain" defaultChecked={pl.is_captain} className="accent-signal" /> Leader</label>
                  <label className={check}>
                    <select name="role" defaultValue={pl.role} aria-label="Role" className="border border-line-strong bg-deep px-2 py-1 text-sm">
                      <option value="main">Main</option>
                      <option value="sub">Substitute</option>
                    </select>
                  </label>
                </div>
              </ActionForm>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-faint">
                {pl.missing_since && <span className="text-warn">No longer on the sheet.</span>}
                {pl.locked_fields.length > 0 && (
                  <ActionForm action={followSheet} submit="Follow the sheet again" tone="quiet" className="contents">
                    <input type="hidden" name="game" value={game} />
                    <input type="hidden" name="id" value={pl.id} />
                    <input type="hidden" name="kind" value="player" />
                  </ActionForm>
                )}
                <ActionForm action={removePlayer} submit="Remove player" tone="danger" className="contents">
                  <input type="hidden" name="game" value={game} />
                  <input type="hidden" name="id" value={pl.id} />
                </ActionForm>
              </div>
            </div>
          ))}
        </div>

        <h3 className="mt-6 font-cond text-base font-bold">Add a player</h3>
        <ActionForm action={addPlayer} submit="Add player" className="mt-3 grid gap-2 sm:grid-cols-3">
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="team" value={team.id} />
          <label className={label}>In-game name<input name="ign" required className={inputClass} /></label>
          <label className={label}>{idLabel}<input name="game_uid" className={inputClass} /></label>
          <label className={label}>Discord<input name="discord" className={inputClass} /></label>
          <label className={label}>Email<input name="email" type="email" className={inputClass} /></label>
          <label className={label}>Phone<input name="phone" className={inputClass} /></label>
          <div className="flex flex-wrap items-center gap-4 pt-4">
            <label className={check}><input type="checkbox" name="is_captain" className="accent-signal" /> Leader</label>
            <select name="role" defaultValue="main" aria-label="Role" className="border border-line-strong bg-deep px-2 py-1 text-sm">
              <option value="main">Main</option>
              <option value="sub">Substitute</option>
            </select>
          </div>
        </ActionForm>
      </section>

      {!team.sheet_key && (
        <section className="panel p-5">
          <h2 className="font-cond text-lg font-bold">Remove this team</h2>
          <p className="mt-1 text-xs text-muted">Only for a team added by mistake that isn&apos;t in any fixtures. Otherwise set it to Withdrawn.</p>
          <ActionForm action={deleteTeam} submit="Remove team" tone="danger" className="mt-3 flex flex-col gap-3">
            <input type="hidden" name="game" value={game} />
            <input type="hidden" name="id" value={team.id} />
          </ActionForm>
        </section>
      )}
    </div>
  );
}
