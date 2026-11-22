import { test } from "node:test";
import assert from "node:assert/strict";
import { disputeOpen, groupCheckInBy, groupCheckInOpen, lateKind, lateTier, mapsNeeded, resolveVeto, roomOverdue, roomReleased, sameDayGroupMatches, selfCheckInOpen, seriesModes, validVeto, vetoOpen, vetoPlayed, vetoTurns } from "./rules.ts";
import type { Match } from "./types.ts";

const T = "2026-11-14T15:00:00+05:30";
const t = (min: number) => Date.parse(T) + min * 60_000;
const match = (over: Partial<Match> = {}): Match => ({
  id: "SF1", stage: "sf", bestOf: 3, maps: [], scheduledAt: T, status: "scheduled", mapWinsA: 0, mapWinsB: 0,
  a: { ref: "x", teamId: "x", label: "X", projected: false }, b: { ref: "y", teamId: "y", label: "Y", projected: false },
  ...over,
});

test("room details release 15 minutes before and hide after the match", () => {
  assert.equal(roomReleased(match(), t(-16)), false);
  assert.equal(roomReleased(match(), t(-15)), true);
  assert.equal(roomReleased(match({ status: "completed" }), t(0)), false);
});

test("veto closes 30 minutes before the semifinal", () => {
  assert.equal(vetoOpen(match(), t(-30)), true);
  assert.equal(vetoOpen(match(), t(-29)), false);
  assert.equal(vetoOpen(match({ stage: "qf" }), t(-60)), false);
});

test("dispute window is 10 minutes from match end", () => {
  assert.equal(disputeOpen(T, t(10)), true);
  assert.equal(disputeOpen(T, t(11)), false);
  assert.equal(disputeOpen(undefined, t(0)), false);
  assert.equal(disputeOpen(T, t(-5)), false); // result timestamp in the future

});

test("late penalty tiers from the 30-minute check-in deadline", () => {
  assert.equal(lateTier(T, new Date(t(-31)).toISOString(), 0).penalty, "on time");
  assert.equal(lateTier(T, new Date(t(-28)).toISOString(), 0).penalty, "warning");
  assert.equal(lateTier(T, new Date(t(-24)).toISOString(), 0).penalty, "forfeit first map");
  assert.equal(lateTier(T, new Date(t(-19)).toISOString(), 0).penalty, "forfeit match");
  assert.equal(lateTier(T, undefined, t(-10)).penalty, "disqualification");
});

test("veto: reorder or swap exactly one mode", () => {
  assert.equal(validVeto(["DOM", "HP", "SND"]), true); // reorder
  assert.equal(validVeto(["HP", "SND", "HP"]), true); // swap Domination for HP
  assert.equal(validVeto(["SND", "SND", "SND"]), false); // two swaps
  assert.equal(validVeto(["HP", "SND"]), false);
});

test("lobby join counts as a second late window", () => {
  const onTime = new Date(t(-35)).toISOString();
  const invitedAt = new Date(t(-3)).toISOString();
  assert.equal(lateTier(T, onTime, t(0), { invitedAt }).penalty, "on time"); // still inside the 10 min
  assert.deepEqual(lateTier(T, onTime, t(13), { invitedAt }), { minutesLate: 6, penalty: "forfeit first map", window: "lobby" });
  assert.equal(lateTier(T, onTime, 0, { invitedAt, joinedAt: new Date(t(5)).toISOString() }).penalty, "on time");
  // Late on both: the worse one decides.
  const lateCheckIn = new Date(t(-18)).toISOString(); // 12 min late
  assert.deepEqual(lateTier(T, lateCheckIn, 0, { invitedAt, joinedAt: new Date(t(9)).toISOString() }), { minutesLate: 12, penalty: "forfeit match", window: "check-in" });
});

test("self check-in window and overdue room", () => {
  assert.equal(selfCheckInOpen(match(), t(-61)), false);
  assert.equal(selfCheckInOpen(match(), t(-60)), true);
  assert.equal(selfCheckInOpen(match(), t(16)), false);
  assert.equal(roomOverdue(match(), false, t(-6)), false);
  assert.equal(roomOverdue(match(), false, t(-5)), true);
  assert.equal(roomOverdue(match(), true, t(-5)), false);
});

test("one-map veto: four alternating bans leave the played map", () => {
  const pool = ["Summit", "Raid", "Standoff", "Firing Range", "Takeoff"];
  assert.deepEqual(vetoTurns(1, "B").map((x) => x.side), ["B", "A", "B", "A"]);
  const r = resolveVeto(pool, 1, ["Raid", "Summit", "Takeoff", "Standoff"]);
  assert.deepEqual(r, { ok: true, played: ["Firing Range"], bans: ["Raid", "Summit", "Takeoff", "Standoff"] });
  assert.equal(resolveVeto(pool, 1, ["Raid", "Raid", "Takeoff", "Standoff"]).ok, false);
  assert.equal(resolveVeto(pool.slice(0, 4), 1, ["Raid", "Summit", "Takeoff"]).ok, false);
});

test("two-map veto: Ban–Ban–Pick–Pick, higher seed's pick first, one map unused", () => {
  const pool = ["M1", "M2", "M3", "M4", "M5"];
  assert.deepEqual(vetoTurns(2, "A").map((x) => `${x.side}${x.action}`), ["Aban", "Bban", "Apick", "Bpick"]);
  assert.deepEqual(resolveVeto(pool, 2, ["M1", "M2", "M3", "M4"]), { ok: true, played: ["M3", "M4"], bans: ["M1", "M2"] });
  assert.deepEqual(vetoPlayed(2, ["M1", "M2", "M3", "M4"], "M3"), ["M3", "M4"]);
  assert.equal(mapsNeeded(5, "HP"), 2);
  assert.equal(mapsNeeded(5, "DOM"), 1);
  assert.equal(mapsNeeded(3, "SND"), 1);
  assert.deepEqual(seriesModes(5), ["HP", "SND", "DOM", "HP", "SND"]);
});

test("late penalties: 5–10 min depends on mode and stage", () => {
  const due = "2026-11-24T12:30:00+05:30";
  const checkInBy = "2026-11-24T12:00:00+05:30";
  const late = (min: number, kind: Parameters<typeof lateKind>[0]) =>
    lateTier(due, undefined, Date.parse(checkInBy) + min * 60_000, {}, { kind: lateKind(kind), checkInBy }).penalty;
  assert.equal(late(3, { bestOf: 1, mode: "SND" }), "warning");
  assert.equal(late(7, { bestOf: 1, mode: "SND" }), "forfeit first round");
  assert.equal(late(7, { bestOf: 1, mode: "DOM" }), "warning");
  assert.equal(late(7, { bestOf: 3 }), "forfeit first map");
  assert.equal(late(12, { bestOf: 1, mode: "HP" }), "forfeit match");
  assert.equal(late(15, { bestOf: 5 }), "disqualification");
});

test("group days: one check-in, 30 min before the day's first wave, covers every match that day", () => {
  const g = (id: string, at: string, a = "x", b = "y"): Match => ({ ...match(), id, stage: "group", bestOf: 1, scheduledAt: at, a: { ref: a, teamId: a, label: a, projected: false }, b: { ref: b, teamId: b, label: b, projected: false } });
  const day = [g("W1", "2026-11-23T21:30:00+05:30", "p", "q"), g("W2", "2026-11-23T21:50:00+05:30"), g("W5", "2026-11-23T22:50:00+05:30"), g("N1", "2026-11-24T12:30:00+05:30")];
  assert.equal(groupCheckInBy(day, day[2]), new Date("2026-11-23T21:00:00+05:30").toISOString());
  assert.deepEqual(sameDayGroupMatches(day, day[1], "x").map((m) => m.id), ["W2", "W5"]);
  assert.equal(groupCheckInOpen(day, day[2], Date.parse("2026-11-23T19:59:00+05:30")), false);
  assert.equal(groupCheckInOpen(day, day[2], Date.parse("2026-11-23T20:00:00+05:30")), true);
  assert.equal(groupCheckInOpen(day, day[2], Date.parse("2026-11-23T23:06:00+05:30")), false);
});
