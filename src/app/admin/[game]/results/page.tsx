import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { gameOf } from "@/games/params";
import { GAME_IDS, GAMES } from "@/games/registry";
import { canStaff, requireStaff } from "@/lib/auth";
import { loadTournament } from "@/lib/data";
import { dayKey, fmtDay, fmtTime } from "@/lib/format";
import type { Match } from "@/lib/types";
import { moveDay, publishWinners } from "./actions";

export function generateStaticParams() {
  return GAME_IDS.map((game) => ({ game }));
}

export const metadata: Metadata = { title: "Quick results" };

export default function QuickResultsPage(props: PageProps<"/admin/[game]/results">) {
  return (
    <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
      <Body {...props} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: PageProps<"/admin/[game]/results">) {
  const game = gameOf((await params).game);
  if (GAMES[game].shape === "lobby") notFound();
  const viewer = await requireStaff();
  if (!canStaff(viewer, game)) return <p className="panel p-5 text-sm text-muted">You aren&apos;t on the staff for {GAMES[game].name}.</p>;

  const t = await loadTournament(game);
  const timed = t.matches.filter((m) => m.scheduledAt && !m.a.bye && !m.b.bye);
  const days = [...new Set(timed.map((m) => dayKey(m.scheduledAt!)))].sort();
  if (!days.length) return <p className="panel p-5 text-sm text-muted">No scheduled matches yet.</p>;

  // Today if it has matches, else the next match day, else the last one.
  const today = dayKey(new Date().toISOString());
  const q = (await searchParams).day;
  const asked = typeof q === "string" && days.includes(q) ? q : undefined;
  const day = asked ?? days.find((d) => d >= today) ?? days.at(-1)!;

  const matches = timed.filter((m) => dayKey(m.scheduledAt!) === day).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!) || a.id.localeCompare(b.id));
  const names = new Map(t.teams.map((x) => [x.id, x.name]));
  const side = (s: Match["a"]) => (s.teamId ? names.get(s.teamId) ?? s.teamId : s.label);
  const slots = new Map<string, Match[]>();
  for (const m of matches) slots.set(m.scheduledAt!, [...(slots.get(m.scheduledAt!) ?? []), m]);
  const done = matches.filter((m) => m.winner).length;
  const firstTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }).format(new Date(matches[0].scheduledAt!));

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-2" aria-label="Match days">
        {days.map((d) => (
          <Link
            key={d}
            href={`/admin/${game}/results?day=${d}`}
            aria-current={d === day ? "page" : undefined}
            className={`border px-3 py-1.5 text-sm ${d === day ? "border-[var(--game,var(--color-signal))] text-text" : "border-line text-muted hover:text-text"}`}
          >
            {fmtDay(`${d}T12:00:00+05:30`)}
          </Link>
        ))}
      </nav>

      <section className="panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-cond text-lg font-bold">Winners for {fmtDay(`${day}T12:00:00+05:30`)}</h2>
          <p className="text-xs text-muted">{done} of {matches.length} have a result.</p>
        </div>
        <p className="mt-1 text-xs text-muted">
          Pick each winner and publish them together. Scores are optional; without them a win is recorded 1–0. Best-of-three and longer matches are entered on their match page.
        </p>
        <ActionForm action={publishWinners} submit="Publish results" className="mt-4 flex flex-col gap-5">
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="ids" value={matches.filter((m) => m.bestOf === 1).map((m) => m.id).join(",")} />
          {[...slots].map(([at, ms]) => (
            <fieldset key={at} className="flex flex-col gap-1.5">
              <legend className="mb-2 text-sm text-muted">
                <span className="tnum font-cond text-base font-semibold text-text">{fmtTime(at)}</span>
                {ms[0].round && ms[0].lobby ? ` · Wave ${ms[0].round}` : ""}
              </legend>
              {ms.map((m) => <ResultRow key={m.id} m={m} a={side(m.a)} b={side(m.b)} game={game} />)}
            </fieldset>
          ))}
        </ActionForm>
      </section>

      <section className="panel p-5">
        <h2 className="font-cond text-lg font-bold">Move this day</h2>
        <p className="mt-1 text-xs text-muted">
          Every match on {fmtDay(`${day}T12:00:00+05:30`)} moves by the same amount, so the gaps between them stay. It starts at {fmtTime(matches[0].scheduledAt!)} now.
        </p>
        <ActionForm action={moveDay} submit="Move matches" className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="game" value={game} />
          <input type="hidden" name="day" value={day} />
          <label className="flex flex-col gap-1 text-xs text-muted">
            New start time (IST)
            <input type="time" name="time" defaultValue={firstTime} required className={`${inputClass} w-36`} />
          </label>
        </ActionForm>
      </section>
    </div>
  );
}

function ResultRow({ m, a, b, game }: { m: Match; a: string; b: string; game: string }) {
  const map = m.maps[0];
  if (m.bestOf !== 1) {
    return (
      <div className="flex flex-wrap items-center gap-3 border border-line px-3 py-2 text-sm">
        <span className="flex-1">{a} <span className="text-faint">vs</span> {b}</span>
        <span className="text-xs text-muted">BO{m.bestOf}{m.winner ? `, ${m.mapWinsA}–${m.mapWinsB}` : ""}</span>
        <Link href={`/admin/matches/${m.id}`} className="link text-sm">Enter maps</Link>
      </div>
    );
  }
  const pick = (v: "A" | "B" | "", text: string, cls = "") => (
    <label className={`flex cursor-pointer items-center gap-2 border border-line px-2.5 py-1.5 has-[:checked]:border-signal has-[:checked]:bg-signal/10 has-[:checked]:text-text ${cls}`}>
      <input type="radio" name={`w_${m.id}`} value={v} defaultChecked={(m.winner ?? "") === v} className="accent-signal" />
      {text}
    </label>
  );
  return (
    <div className="grid items-center gap-2 text-sm sm:grid-cols-[1fr_auto_1fr_auto_auto]">
      {pick("A", a, "text-muted")}
      <span className="hidden text-center text-xs text-faint sm:block">vs</span>
      {pick("B", b, "text-muted")}
      <span className="flex items-center gap-1">
        <input name={`a_${m.id}`} inputMode="numeric" defaultValue={map ? map.scoreA : ""} aria-label={`${a} score`} placeholder="–" className={`${inputClass} w-16 text-center`} />
        <input name={`b_${m.id}`} inputMode="numeric" defaultValue={map ? map.scoreB : ""} aria-label={`${b} score`} placeholder="–" className={`${inputClass} w-16 text-center`} />
      </span>
      <span className="flex items-center gap-3">
        {pick("", "Skip", "text-xs text-faint")}
        <Link href={`/admin/matches/${m.id}`} className="link text-xs" title={`Open ${m.id} (${game})`}>{m.id}</Link>
      </span>
    </div>
  );
}
