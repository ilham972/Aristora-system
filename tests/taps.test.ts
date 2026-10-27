import { describe, expect, test } from "vitest";
import type { MarkState } from "../convex/lib/status";
import { nextState } from "../src/taps";

/** Tap n times starting from `base`; returns the states seen after each tap. */
function taps(role: "correction" | "theory" | "evaluation", q: number, base: MarkState | null, n: number) {
  const seen: (MarkState | null | undefined)[] = [];
  let cur: MarkState | null = base;
  for (let i = 0; i < n; i++) {
    const next = nextState(role, q, cur, base);
    seen.push(next);
    if (next === undefined) break;
    cur = next;
  }
  return seen;
}

describe("tap cycles", () => {
  test("Correction on an empty ladder circle: right, wrong, slip, empty", () => {
    expect(taps("correction", 5, null, 5)).toEqual(["right", "wrong", "slip", null, "right"]);
  });
  test("Correction on an explained circle (redo): right, wrong, slip, back to explained", () => {
    expect(taps("correction", 5, "explained", 4)).toEqual(["right", "wrong", "slip", "explained"]);
  });
  test("Correction fixing a mark: from right goes wrong, slip, empty, right", () => {
    expect(taps("correction", 5, "right", 4)).toEqual(["wrong", "slip", null, "right"]);
  });
  test("Correction can't change a teacher question", () => {
    expect(taps("correction", 1, null, 1)).toEqual([undefined]);
  });
  test("Theory on a teacher question: taught, skip, empty", () => {
    expect(taps("theory", 1, null, 4)).toEqual(["taught", "skip", null, "taught"]);
  });
  test("Theory can skip a ladder question only before it's done", () => {
    expect(taps("theory", 5, null, 2)).toEqual(["skip", null]);
    expect(taps("theory", 5, "right", 1)).toEqual([undefined]);
  });
  test("Evaluation: wrong <-> explained, nothing else", () => {
    expect(taps("evaluation", 5, "wrong", 3)).toEqual(["explained", "wrong", "explained"]);
    expect(taps("evaluation", 5, "right", 1)).toEqual([undefined]);
    expect(taps("evaluation", 5, null, 1)).toEqual([undefined]);
  });
  test("Evaluation can clear a taught circle (re-teach) and put it back", () => {
    expect(taps("evaluation", 1, "taught", 2)).toEqual([null, "taught"]);
    expect(taps("evaluation", 1, null, 1)).toEqual([undefined]);
  });
});
