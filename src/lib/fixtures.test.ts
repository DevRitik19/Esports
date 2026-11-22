import { test } from "node:test";
import assert from "node:assert/strict";
import { knockoutSkeleton } from "./fixtures.ts";

test("knockout skeleton sizes", () => {
  assert.deepEqual(knockoutSkeleton(8, true).map((m) => m.id), ["QF1", "QF2", "QF3", "QF4", "SF1", "SF2", "THIRD", "FINAL"]);
  assert.deepEqual(knockoutSkeleton(8, false).map((m) => m.id), ["QF1", "QF2", "QF3", "QF4", "SF1", "SF2", "FINAL"]);
  assert.deepEqual(knockoutSkeleton(4, true).map((m) => m.id), ["SF1", "SF2", "THIRD", "FINAL"]);
  assert.deepEqual(knockoutSkeleton(2, false).map((m) => `${m.a}-${m.b}`), ["S1-S2"]);
});
