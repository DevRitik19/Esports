// CODM group stage as published: the official groups and the 7-lobby timed
// schedule (docs/CODM_Carnage_2_Rift_Ops_7_Lobbies_Timed_Schedule.docx).
// The same match-ups, waves and lobbies repeat on all three mode days; only
// the mode, map and start time change. Pure, so it runs under plain Node.

import type { Mode } from "../lib/types.ts";

export const OFFICIAL_GROUPS: Record<string, string[]> = {
  A: ["LIQUID", "Nuclear", "Barrel House", "ThaiyirSaadham"],
  B: ["J²•D•Y•S", "Team Zero", "Blitz Raiders", "TF141"],
  C: ["Team Lost", "EDGE", "Team Crackillusion", "Kid Slayers"],
  D: ["Offset", "Darkhold", "Sapne Suhane...", "Bawts"],
  E: ["Freakuency", "beAtBreAkers@!", "Money_follows", "Gobi Ke Parathe"],
  F: ["THE COMRADES", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "Free Kills", "$500"],
  G: ["Last Warning", "Smoke", "cod vinashak", "Clutch crew", "RVCE"],
};

/** Wave by wave, lobby 1 first: [group, side A, side B]. An idle lobby is left out. */
export const WAVES: [string, string, string][][] = [
  [
    ["G", "Clutch crew", "RVCE"],
    ["G", "Last Warning", "Smoke"],
    ["A", "Barrel House", "ThaiyirSaadham"],
    ["A", "LIQUID", "Nuclear"],
    ["B", "Blitz Raiders", "TF141"],
    ["B", "J²•D•Y•S", "Team Zero"],
    ["C", "EDGE", "Kid Slayers"],
  ],
  [
    ["G", "Last Warning", "cod vinashak"],
    ["C", "Team Lost", "Team Crackillusion"],
    ["D", "Darkhold", "Bawts"],
    ["D", "Offset", "Sapne Suhane..."],
    ["E", "Freakuency", "Gobi Ke Parathe"],
    ["E", "beAtBreAkers@!", "Money_follows"],
    ["F", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "$500"],
  ],
  [
    ["F", "THE COMRADES", "Free Kills"],
    ["G", "Smoke", "Clutch crew"],
    ["G", "cod vinashak", "RVCE"],
    ["A", "LIQUID", "Barrel House"],
    ["A", "Nuclear", "ThaiyirSaadham"],
    ["B", "J²•D•Y•S", "Blitz Raiders"],
    ["B", "Team Zero", "TF141"],
  ],
  [
    ["C", "EDGE", "Team Crackillusion"],
    ["C", "Team Lost", "Kid Slayers"],
    ["D", "Darkhold", "Sapne Suhane..."],
    ["D", "Offset", "Bawts"],
    ["E", "Freakuency", "Money_follows"],
    ["E", "beAtBreAkers@!", "Gobi Ke Parathe"],
    ["F", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "Free Kills"],
  ],
  [
    ["F", "THE COMRADES", "$500"],
    ["G", "Last Warning", "Clutch crew"],
    ["G", "Smoke", "RVCE"],
    ["A", "LIQUID", "ThaiyirSaadham"],
    ["A", "Nuclear", "Barrel House"],
    ["B", "J²•D•Y•S", "TF141"],
    ["B", "Team Zero", "Blitz Raiders"],
  ],
  [
    ["G", "Smoke", "cod vinashak"],
    ["C", "Team Crackillusion", "Kid Slayers"],
    ["C", "Team Lost", "EDGE"],
    ["D", "Offset", "Darkhold"],
    ["D", "Sapne Suhane...", "Bawts"],
    ["E", "Freakuency", "beAtBreAkers@!"],
    ["E", "Money_follows", "Gobi Ke Parathe"],
  ],
  [
    ["F", "Free Kills", "$500"],
    ["F", "THE COMRADES", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
    ["G", "Last Warning", "RVCE"],
    ["G", "cod vinashak", "Clutch crew"],
  ],
];

export const LOBBIES = 7;

/** Teams that play two waves in a row: their late clock starts when the earlier match ends. */
export const BACK_TO_BACK = ["Last Warning", "Smoke", "cod vinashak", "Free Kills"];

export interface ModeDay {
  /** YYYY-MM-DD, IST */
  date: string;
  mode: Mode;
  map: string;
  /** First wave, HH:MM IST; undefined while the organisers haven't set it. */
  firstWave?: string;
  waveMinutes: number;
  /** Breaks come after these waves (1-based). */
  breaksAfter: number[];
  breakMinutes: number;
  endBufferMinutes: number;
  /** Tiebreakers and final standings follow this day's last wave. */
  final?: boolean;
}

export const MODE_DAYS: ModeDay[] = [
  { date: "2026-11-23", mode: "HP", map: "Summit", firstWave: "21:30", waveMinutes: 20, breaksAfter: [], breakMinutes: 0, endBufferMinutes: 0 },
  { date: "2026-11-24", mode: "DOM", map: "Raid", firstWave: "12:30", waveMinutes: 20, breaksAfter: [3, 5], breakMinutes: 15, endBufferMinutes: 20 },
  { date: "2026-11-25", mode: "SND", map: "Firing Range", waveMinutes: 35, breaksAfter: [3, 5], breakMinutes: 15, endBufferMinutes: 25, final: true },
];

export const CHECK_IN_BEFORE_FIRST_WAVE_MIN = 30;

const MIN = 60_000;
const ist = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+05:30`);

/** Start of each wave as an ISO string, or undefined for a day without a start time yet. */
export function waveStarts(day: ModeDay, firstWave = day.firstWave): string[] | undefined {
  if (!firstWave) return undefined;
  let t = ist(day.date, firstWave);
  return WAVES.map((_, i) => {
    if (i > 0) t += day.waveMinutes * MIN + (day.breaksAfter.includes(i) ? day.breakMinutes * MIN : 0);
    return new Date(t).toISOString();
  });
}

export interface DayPlan {
  checkIn?: string;
  waves?: string[];
  /** Breaks as [start, end] ISO pairs. */
  breaks: [string, string][];
  /** When the last wave (plus the end buffer) is over. */
  ends?: string;
}

export function dayPlan(day: ModeDay, firstWave = day.firstWave): DayPlan {
  const waves = waveStarts(day, firstWave);
  if (!waves) return { breaks: [] };
  const end = (i: number) => Date.parse(waves[i]) + day.waveMinutes * MIN;
  return {
    checkIn: new Date(Date.parse(waves[0]) - CHECK_IN_BEFORE_FIRST_WAVE_MIN * MIN).toISOString(),
    waves,
    breaks: day.breaksAfter.map((w) => [new Date(end(w - 1)).toISOString(), new Date(end(w - 1) + day.breakMinutes * MIN).toISOString()]),
    ends: new Date(end(waves.length - 1) + day.endBufferMinutes * MIN).toISOString(),
  };
}

/** Comparable form of a team name: case, spacing and punctuation don't matter. */
export function nameKey(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}$]+/gu, "");
}

export interface OfficialFixture {
  id: string;
  group: string;
  wave: number;
  lobby: number;
  a: string;
  b: string;
  mode: Mode;
  map: string;
  scheduledAt?: string;
}

/**
 * All 138 group matches, named by mode, wave and lobby (HP-W1-L3). `teamId`
 * maps an official team name to the team's id; unknown names are reported.
 */
export function officialFixtures(
  teamId: (name: string) => string | undefined,
  firstWaves: Partial<Record<string, string>> = {},
): { fixtures: OfficialFixture[]; missing: string[] } {
  const missing = new Set<string>();
  const id = (name: string) => {
    const t = teamId(name);
    if (!t) missing.add(name);
    return t ?? "";
  };
  const fixtures = MODE_DAYS.flatMap((day) => {
    const starts = waveStarts(day, firstWaves[day.date] ?? day.firstWave);
    return WAVES.flatMap((wave, w) =>
      wave.map(([group, a, b], l) => ({
        id: `${day.mode}-W${w + 1}-L${l + 1}`,
        group,
        wave: w + 1,
        lobby: l + 1,
        a: id(a),
        b: id(b),
        mode: day.mode,
        map: day.map,
        scheduledAt: starts?.[w],
      })),
    );
  });
  return { fixtures, missing: [...missing] };
}

/**
 * Matches the official team names to registered teams: same name ignoring
 * case and punctuation, else the one team whose name starts with the
 * official one (the doc shortens "Sapne Suhane..."). `chosen` holds a
 * referee's picks for names that didn't match on their own.
 */
export function matchOfficialTeams(
  teams: { id: string; name: string }[],
  chosen: Partial<Record<string, string>> = {},
): { ids: Map<string, string>; missing: string[] } {
  const ids = new Map<string, string>();
  const taken = new Set<string>();
  const official = Object.values(OFFICIAL_GROUPS).flat();
  for (const name of official) {
    const pick = chosen[name];
    if (pick && teams.some((t) => t.id === pick)) {
      ids.set(name, pick);
      taken.add(pick);
    }
  }
  for (const name of official) {
    if (ids.has(name)) continue;
    const key = nameKey(name);
    const free = teams.filter((t) => !taken.has(t.id));
    const exact = free.filter((t) => nameKey(t.name) === key);
    const prefix = free.filter((t) => key.length >= 4 && nameKey(t.name).startsWith(key));
    const hit = exact.length === 1 ? exact[0] : exact.length === 0 && prefix.length === 1 ? prefix[0] : undefined;
    if (hit) {
      ids.set(name, hit.id);
      taken.add(hit.id);
    }
  }
  return { ids, missing: official.filter((n) => !ids.has(n)) };
}

/** Which registered team holds each official name, read back from applied fixtures. */
export function picksFromFixtures(matches: { id: string; a: { teamId?: string }; b: { teamId?: string } }[]): Record<string, string> {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const out: Record<string, string> = {};
  WAVES.forEach((wave, w) =>
    wave.forEach(([, a, b], l) => {
      const m = byId.get(`${MODE_DAYS[0].mode}-W${w + 1}-L${l + 1}`);
      if (m?.a.teamId) out[a] ??= m.a.teamId;
      if (m?.b.teamId) out[b] ??= m.b.teamId;
    }),
  );
  return out;
}
