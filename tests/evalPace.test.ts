// Evaluation's "free in ~N min" and call ahead (src/evalPace.ts; his pick, 1 Nov 2026).

import { describe, expect, test } from "vitest";
import { CALL_AHEAD_MS, callAhead, evalPaceMs, freeIn, noteExplained, noteStart, PACE_DEFAULT_MS, paceOf } from "../src/evalPace";

const MIN = 60_000;

describe("Her pace, learnt on her phone", () => {
  test("3 minutes until she has explained 3; then the middle of her recent explanations", () => {
    expect(paceOf([])).toBe(PACE_DEFAULT_MS);
    expect(paceOf([MIN, 2 * MIN])).toBe(PACE_DEFAULT_MS);
    expect(paceOf([MIN, 5 * MIN, 2 * MIN])).toBe(2 * MIN);
    expect(paceOf([MIN, 2 * MIN, 4 * MIN, 9 * MIN])).toBe(3 * MIN);
  });

  test("timed from Arrived, then from her last Explained; a quick run (< 15 s) and a break (> 10 min) don't count", () => {
    const t0 = Date.UTC(2026, 10, 1, 10, 0);
    noteStart(t0);
    noteExplained(t0 + 2 * MIN); // 2 min
    noteExplained(t0 + 2 * MIN + 5000); // 5 s: a quick run, not counted
    noteExplained(t0 + 4 * MIN); // ~2 min
    noteExplained(t0 + 20 * MIN); // 16 min: a break, not counted
    noteExplained(t0 + 23 * MIN); // 3 min
    // Learnt: 2 min, 1 min 55 s (from the quick tap), 3 min: her pace is the middle one, 2 minutes.
    expect(evalPaceMs()).toBe(2 * MIN);
  });
});

describe("Free in, and call the next ones now", () => {
  test("every open question with her once, and those on the way, at her pace", () => {
    expect(freeIn({ open: 2, coming: 0, pace: 3 * MIN })).toBe(6 * MIN);
    expect(freeIn({ open: 1, coming: 2, pace: 2 * MIN })).toBe(6 * MIN);
  });

  test("call now: free within 4 minutes, nobody on the way, room left, someone ticked", () => {
    const ok = { live: true, freeInMs: 3 * MIN, coming: 0, left: 4, ticked: 2 };
    expect(callAhead(ok)).toBe(true);
    expect(callAhead({ ...ok, freeInMs: CALL_AHEAD_MS + 1 })).toBe(false);
    expect(callAhead({ ...ok, coming: 1 })).toBe(false);
    expect(callAhead({ ...ok, left: 0 })).toBe(false);
    expect(callAhead({ ...ok, ticked: 0 })).toBe(false);
    expect(callAhead({ ...ok, live: false })).toBe(false);
  });
});
