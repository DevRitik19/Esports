import { Suspense } from "react";
import { ActionForm, inputClass } from "@/components/ActionForm";
import { canStaff, requireStaff } from "@/lib/auth";
import { loadTournament } from "@/lib/data";
import { MODE_NAME } from "@/content/event";
import { dayKey, fmtDay } from "@/lib/format";
import { saveConfig, saveMapPool, saveMatchDays } from "@/app/admin/actions";

/** CODM: qualifying and tiebreak settings, mode days and the map pool. */
export function CodmSettings() {
  return (
    <Suspense fallback={<div className="panel h-96 animate-pulse" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const viewer = await requireStaff();
  if (!canStaff(viewer, "codm")) return <p className="panel p-5 text-sm text-muted">These are CODM settings, for CODM staff.</p>;
  const t = await loadTournament();
  const c = t.config;
  const groupDays = [...new Set(t.matches.filter((m) => m.stage === "group" && m.scheduledAt).map((m) => dayKey(m.scheduledAt!)))].sort();
  const dayIso = (day: string) => `${day}T12:00:00+05:30`;
  const field = (name: string, label: string, value?: string | number, placeholder?: string) => (
    <label className="flex flex-col gap-1 text-xs text-muted">{label}<input name={name} defaultValue={value ?? ""} placeholder={placeholder} className={inputClass} /></label>
  );

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-cond text-lg font-bold">Settings</h2>
          <ActionForm action={saveConfig} submit="Save settings" className="mt-4 grid gap-3 sm:grid-cols-2">
            {field("qualifiers_per_group", "Qualifiers per group", c.qualifiersPerGroup)}
            {field("best_runners_up", "Best runners-up who also qualify", c.bestRunnersUp ?? 0)}
            {field("tiebreakers", "Tiebreakers (h2h, playoff, diff, scored)", c.tiebreakers.join(", "))}
            {field("coin_toss", "Coin tosses (winner first: t03 > t07; t01 > t05)", (c.coinToss ?? []).map((o) => o.join(" > ")).join("; "))}
            {field("perspective", "Perspective", c.perspective, "TPP")}
            {field("event_dates", "Event dates", c.eventDates, "6–15 Nov 2026")}
            {field("registration_deadline", "Registration deadline", c.registrationDeadline)}
            {field("registration_url", "Registration link", c.registrationUrl, "https://…")}
          </ActionForm>
        </section>

        <section className="panel p-5">
          <h2 className="font-cond text-lg font-bold">Group stage match days</h2>
          <p className="mt-1 text-xs text-muted">One decisive mode per match day. Setting a mode publishes it on the schedule and players&apos; dashboards.</p>
          {groupDays.length === 0 ? (
            <p className="mt-4 text-sm text-muted">Generate group fixtures first.</p>
          ) : (
            <ActionForm action={saveMatchDays} submit="Save match days" className="mt-4 flex flex-col gap-2">
              <input type="hidden" name="days" value={groupDays.join(",")} />
              {groupDays.map((day) => {
                const current = t.matchDays?.find((d) => d.day === day);
                return (
                  <div key={day} className="grid grid-cols-[6.5rem_11rem_1fr] items-center gap-2 text-sm">
                    <span>{fmtDay(dayIso(day))}</span>
                    <select name={`mode_${day}`} defaultValue={current?.mode ?? ""} className={inputClass}>
                      <option value="">Not announced</option>
                      {(["HP", "SND", "DOM"] as const).map((mode) => <option key={mode} value={mode}>{MODE_NAME[mode]}</option>)}
                    </select>
                    <input name={`note_${day}`} defaultValue={current?.note ?? ""} placeholder="Note (optional)" className={inputClass} />
                  </div>
                );
              })}
            </ActionForm>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="font-cond text-lg font-bold">Map pool</h2>
          <p className="mt-1 text-xs text-muted">One map per line, announced at least 48 hours before the Quarterfinals. Each offline veto needs exactly 5 maps per mode; group-stage maps are fixed per day.</p>
          <ActionForm action={saveMapPool} submit="Save map pool" className="mt-4 grid gap-3 sm:grid-cols-3">
            {(["HP", "SND", "DOM"] as const).map((mode) => (
              <label key={mode} className="flex flex-col gap-1 text-xs text-muted">
                {mode === "SND" ? "S&D" : mode}
                <textarea name={mode} rows={5} defaultValue={t.mapPool.filter((m) => m.mode === mode).map((m) => m.map).join("\n")} className={inputClass} />
              </label>
            ))}
          </ActionForm>
        </section>

      </div>
    </>
  );
}
