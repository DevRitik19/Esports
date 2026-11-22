// Knockout bracket generation for the admin panel. Pure, so it's unit-tested.
// Group fixtures are the published schedule (src/content/codm-schedule.ts).

import type { Stage } from "./types.ts";

/** Knockout bracket from overall seeds: 8 → QF/SF/F, 4 → SF/F, 2 → F. */
export function knockoutSkeleton(qualifiers: number, thirdPlace: boolean): { id: string; stage: Stage; bestOf: 3 | 5; a: string; b: string }[] {
  const out: { id: string; stage: Stage; bestOf: 3 | 5; a: string; b: string }[] = [];
  if (qualifiers >= 8) {
    out.push(
      { id: "QF1", stage: "qf", bestOf: 3, a: "S1", b: "S8" },
      { id: "QF2", stage: "qf", bestOf: 3, a: "S4", b: "S5" },
      { id: "QF3", stage: "qf", bestOf: 3, a: "S2", b: "S7" },
      { id: "QF4", stage: "qf", bestOf: 3, a: "S3", b: "S6" },
      { id: "SF1", stage: "sf", bestOf: 3, a: "W:QF1", b: "W:QF2" },
      { id: "SF2", stage: "sf", bestOf: 3, a: "W:QF3", b: "W:QF4" },
    );
  } else if (qualifiers >= 4) {
    out.push({ id: "SF1", stage: "sf", bestOf: 3, a: "S1", b: "S4" }, { id: "SF2", stage: "sf", bestOf: 3, a: "S2", b: "S3" });
  }
  if (qualifiers >= 4) {
    if (thirdPlace) out.push({ id: "THIRD", stage: "third", bestOf: 3, a: "L:SF1", b: "L:SF2" });
    out.push({ id: "FINAL", stage: "final", bestOf: 5, a: "W:SF1", b: "W:SF2" });
  } else if (qualifiers >= 2) {
    out.push({ id: "FINAL", stage: "final", bestOf: 5, a: "S1", b: "S2" });
  }
  return out;
}
