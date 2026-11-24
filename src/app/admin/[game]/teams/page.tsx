import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { gameOf } from "@/games/params";
import { GAME_IDS, GAMES } from "@/games/registry";
import { createClient } from "@/lib/supabase/server";
import { addTeam } from "./actions";
import { TeamSearch } from "./TeamSearch";

export function generateStaticParams() {
  return GAME_IDS.map((game) => ({ game }));
}

export const metadata: Metadata = { title: "Teams" };

export default function TeamsPage({ params }: PageProps<"/admin/[game]/teams">) {
  return (
    <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
      <Body params={params} />
    </Suspense>
  );
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: "text-win",
  forming: "text-warn",
  withdrawn: "text-faint line-through",
  disqualified: "text-live line-through",
};

/** Lowercase letters, digits and spaces: what TeamSearch matches against. */
const searchKey = (...parts: (string | null)[]) => parts.filter(Boolean).join(" ").toLowerCase().replace(/[^a-z0-9 ]/g, "");

async function Body({ params }: Pick<PageProps<"/admin/[game]/teams">, "params">) {
  const game = gameOf((await params).game);
  const db = await createClient();
  const { data } = await db
    .from("teams")
    .select("id, name, tag, status, eligible, group_name, college, locked_fields, missing_since, sheet_key, players(count)")
    .eq("game_id", game)
    .order("name");
  const teams = (data ?? []) as unknown as {
    id: string; name: string; tag: string; status: string; eligible: boolean; group_name: string | null; college: string | null;
    locked_fields: string[]; missing_since: string | null; sheet_key: string | null; players: { count: number }[];
  }[];
  const counts = Object.fromEntries(["confirmed", "forming", "withdrawn", "disqualified"].map((s) => [s, teams.filter((t) => t.status === s).length]));

  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-cond text-lg font-bold">{teams.length} teams</h2>
            <p className="text-xs text-muted">
              {counts.confirmed} confirmed, {counts.forming} still forming{counts.withdrawn ? `, ${counts.withdrawn} withdrawn` : ""}
              {counts.disqualified ? `, ${counts.disqualified} disqualified` : ""}. Changes you make here stay when the registration sheet syncs.
            </p>
          </div>
          <TeamSearch scope="teams" />
        </div>
        {teams.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No teams yet. Sync the registrations, or add one below.</p>
        ) : (
          <ul data-list="teams" className="mt-4 divide-y divide-line">
            {teams.map((t) => (
              <li key={t.id} data-name={searchKey(t.name, t.tag, t.college)}>
                <Link href={`/admin/${game}/teams/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-2 py-2.5 hover:bg-surface-2">
                  <span className="w-12 font-cond text-sm text-steel">{t.tag}</span>
                  <span className="min-w-40 flex-1 font-semibold">{t.name}</span>
                  {t.group_name && <span className="text-xs text-muted">Group {t.group_name}</span>}
                  <span className="text-xs text-muted">{t.players[0]?.count ?? 0} players</span>
                  {!t.eligible && <span className="text-xs text-warn">Not eligible</span>}
                  {t.locked_fields.length > 0 && <span className="text-xs text-steel" title={`Edited by staff: ${t.locked_fields.join(", ")}`}>Edited</span>}
                  {!t.sheet_key && <span className="text-xs text-steel">Added by staff</span>}
                  {t.missing_since && <span className="text-xs text-warn">Off the sheet</span>}
                  <span className={`w-24 text-right text-xs font-semibold capitalize ${STATUS_STYLE[t.status] ?? ""}`}>{t.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="font-cond text-lg font-bold">Add a team</h2>
        <p className="mt-1 text-xs text-muted">For a team that registered some other way. You can add its players on the next page.</p>
        <ActionForm action={addTeam} submit="Add team" className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <input type="hidden" name="game" value={game} />
          <label className="flex flex-col gap-1 text-xs text-muted">Team name<input name="name" required className={inputClass} /></label>
          <label className="flex flex-col gap-1 text-xs text-muted">College (optional)<input name="college" className={inputClass} /></label>
        </ActionForm>
        <p className="mt-3 text-xs text-faint">{GAMES[game].name} teams only. Fixtures don&apos;t change on their own; put a new team into the groups or bracket from Setup.</p>
      </section>
    </div>
  );
}
