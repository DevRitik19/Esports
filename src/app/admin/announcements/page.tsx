import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { GAME_LIST, GAMES, isGameId } from "@/games/registry";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addAnnouncement, deleteAnnouncement } from "../actions";

export const metadata: Metadata = { title: "Announcements" };

export default function AnnouncementsPage() {
  return (
    <Suspense fallback={<div className="panel h-64 animate-pulse" />}>
      <Announcements />
    </Suspense>
  );
}

async function Announcements() {
  await requireAdmin();
  const db = await createClient();
  const { data } = await db.from("announcements").select("id, date, title, body, game_id").order("date", { ascending: false }).order("id", { ascending: false });
  const rows = (data ?? []) as { id: number; date: string; title: string; body: string; game_id: string | null }[];
  return (
    <>
      <h1 className="font-display text-4xl">Announcements</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">Post to every game&apos;s pages, or to one game. They show on the game&apos;s Overview, newest first.</p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <section className="panel p-5">
          <h2 className="font-cond text-lg font-bold">New announcement</h2>
          <ActionForm action={addAnnouncement} submit="Publish" className="mt-4 flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              For
              <select name="game" defaultValue="" className={inputClass}>
                <option value="">Every game</option>
                {GAME_LIST.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">Title<input name="title" required className={inputClass} /></label>
            <label className="flex flex-col gap-1 text-xs text-muted">Details<textarea name="body" rows={4} className={inputClass} /></label>
          </ActionForm>
        </section>

        <section>
          <h2 className="mb-3 font-cond text-lg font-bold">Published ({rows.length})</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {rows.map((a) => (
                <li key={a.id} className="panel flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="text-xs text-faint">
                      {a.date} · {a.game_id && isGameId(a.game_id) ? GAMES[a.game_id].short : "Every game"}
                    </p>
                    <p className="font-semibold">{a.title}</p>
                    {a.body && <p className="mt-1 text-sm text-muted">{a.body}</p>}
                  </div>
                  <ActionForm action={deleteAnnouncement} submit="Delete" tone="quiet">
                    <input type="hidden" name="id" value={a.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
