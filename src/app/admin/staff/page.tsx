import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { StaffContactFields } from "@/components/StaffContactFields";
import { GAME_LIST, isGameId } from "@/games/registry";
import { getStaffList } from "@/lib/admin";
import { requireAdmin } from "@/lib/auth";
import { covers, staffTags, type StaffRow } from "@/lib/staff";
import { removeStaff, saveStaff } from "../actions";

export const metadata: Metadata = { title: "Staff" };

export default function StaffPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading staff…</p>}>
      <Staff />
    </Suspense>
  );
}

/** Tag colour: the game's accent, or the signal colour for admins. */
function tagColor(tag: string): string {
  const g = GAME_LIST.find((x) => tag.startsWith(`${x.handle}-`));
  return g?.accent ?? "var(--color-signal)";
}

function Tag({ tag }: { tag: string }) {
  const c = tagColor(tag);
  return (
    <span className="tag" style={{ color: c, borderColor: `color-mix(in oklab, ${c} 45%, transparent)` }}>
      {tag}
    </span>
  );
}

/**
 * Admin, then games. A referee runs the games picked; an admin runs every
 * game anyway, so for them the games say which game pages list them as the
 * point of contact.
 */
function AccessFields({ role = "referee", games = [] as string[] | null, idPrefix }: { role?: string; games?: string[] | null; idPrefix: string }) {
  const all = games === null;
  return (
    <>
      <label className="flex cursor-pointer items-start gap-3 border border-line p-3 has-[:checked]:border-signal">
        <input type="checkbox" name="admin" defaultChecked={role === "admin"} className="mt-1 size-4 accent-signal" />
        <span>
          <span className="block font-semibold">Admin</span>
          <span className="block text-xs text-muted">Runs every game, the staff list and announcements. Leave off for a referee.</span>
        </span>
      </label>
      <fieldset>
        <legend className="mb-2 text-xs text-muted">
          <span className="group-has-[[name=admin]:checked]:hidden">Games they run (and are the contact for)</span>
          <span className="hidden group-has-[[name=admin]:checked]:inline">Point of contact for (listed on these game pages)</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {GAME_LIST.map((g) => (
            <label key={g.id} htmlFor={`${idPrefix}-${g.id}`} className="chip" style={{ "--chip": g.accent } as React.CSSProperties}>
              <input id={`${idPrefix}-${g.id}`} type="checkbox" name="game" value={g.id} defaultChecked={!all && !!games?.includes(g.id)} className="sr-only" />
              {g.short}
            </label>
          ))}
          <label htmlFor={`${idPrefix}-all`} className="chip" style={{ "--chip": "var(--color-signal)" } as React.CSSProperties}>
            <input id={`${idPrefix}-all`} type="checkbox" name="game" value="all" defaultChecked={all} className="sr-only" />
            All games
          </label>
        </div>
        <p className="mt-2 hidden text-xs text-faint group-has-[[name=admin]:checked]:block">Pick none to keep an admin off the game pages.</p>
      </fieldset>
    </>
  );
}

async function Staff() {
  const viewer = await requireAdmin();
  const staff = await getStaffList();
  const rows = (staff as StaffRow[]).map((s) => ({ ...s, games: s.games?.filter(isGameId) ?? null }));
  const me = viewer.email.toLowerCase();

  return (
    <>
      <h1 className="font-display text-4xl">Staff</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Add someone by email; they log in with it like a team leader. A referee only runs their games, so a{" "}
        <span className="font-semibold text-text">valo-ref</span> can&apos;t touch CODM. Admins run every game and choose which game pages list
        them as the point of contact.
      </p>

      <section aria-labelledby="coverage" className="mt-8">
        <h2 id="coverage" className="sr-only">Referees per game</h2>
        <ul className="grid grid-cols-2 gap-px overflow-hidden border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
          {GAME_LIST.map((g) => {
            const refs = rows.filter((s) => s.role === "referee" && covers(s, g.id)).length;
            return (
              <li key={g.id} className="bg-surface p-4">
                <p className="flex items-center gap-2 text-sm">
                  <span className="size-2" style={{ background: g.accent }} aria-hidden />
                  {g.short}
                </p>
                <p className="mt-1 font-display text-3xl leading-none">{refs}</p>
                <p className={`mt-1 text-xs ${refs ? "text-muted" : "text-warn"}`}>{refs === 1 ? "referee" : refs ? "referees" : "No referee yet"}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
        <section aria-labelledby="team">
          <h2 id="team" className="font-display text-2xl">Everyone ({rows.length})</h2>
          <ul className="mt-4 flex flex-col border-t border-line">
            {rows.map((s) => (
              <li key={s.email} className="border-b border-line py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block truncate font-bold">
                      {s.name || s.email.split("@")[0]}
                      {s.email === me && <span className="ml-2 text-xs font-normal text-faint">you</span>}
                      {s.listed === false && <span className="ml-2 text-xs font-normal text-faint">not listed</span>}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {[s.email, s.phone, s.discord && `Discord ${s.discord}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {staffTags(s).map((t) => <Tag key={t} tag={t} />)}
                  </span>
                </div>
                <details className="group/edit mt-2">
                  <summary className="cursor-pointer text-xs text-muted hover:text-text">Edit</summary>
                  <div className="mt-3 flex flex-col gap-4 border-l-2 border-line pl-4">
                    <ActionForm action={saveStaff} submit="Save" className="group flex flex-col gap-4">
                      <input type="hidden" name="email" value={s.email} />
                      <AccessFields role={s.role} games={s.games} idPrefix={s.email} />
                      <StaffContactFields name={s.name} phone={s.phone} discord={s.discord} listed={s.listed} />
                    </ActionForm>
                    {s.email !== me && (
                      <ActionForm action={removeStaff} submit={`Remove ${s.email}`} tone="danger">
                        <input type="hidden" name="email" value={s.email} />
                      </ActionForm>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="add" className="panel p-5">
          <h2 id="add" className="font-display text-2xl">Add someone</h2>
          <ActionForm action={saveStaff} submit="Add to staff" className="group mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Email
              <input name="email" type="email" required placeholder="name@college.edu" className={inputClass} />
            </label>
            <AccessFields idPrefix="new" />
            <details className="group/contact">
              <summary className="cursor-pointer text-xs text-muted hover:text-text">Contact details (optional)</summary>
              <div className="mt-3">
                <StaffContactFields stacked />
              </div>
            </details>
          </ActionForm>
          <p className="mt-4 text-xs text-faint">Already on staff? Adding them again replaces their access.</p>
        </section>
      </div>
    </>
  );
}
