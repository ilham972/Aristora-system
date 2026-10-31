// Her taps in her room, kept on the phone until Done (src/roomDecisions.ts; the audit, 31 Oct 2026).

import { describe, expect, test } from "vitest";
import { loadDecisions, saveDecisions } from "../src/roomDecisions";

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 9, 31, 10, 0);

describe("Her decisions survive another page or a reload, per call", () => {
  test("what she tapped comes back for the same calls; a student with nothing decided keeps no entry", () => {
    const calls = [
      { id: "c1", key: "Raza:u09:master" },
      { id: "c2", key: "Umair:u09:master" },
    ];
    saveDecisions("t-a", calls, { "Raza:u09:master": { 14: "x", 17: "th" }, "Umair:u09:master": { 14: undefined } }, T0);
    expect(loadDecisions("t-a", calls)).toEqual({ "Raza:u09:master": { 14: "x", 17: "th" } });
  });

  test("a new call for the same student starts empty; Done (his decisions gone) drops his entry", () => {
    const first = [{ id: "c1", key: "Raza:u09:master" }];
    saveDecisions("t-b", first, { "Raza:u09:master": { 14: "skip" } }, T0);
    // Later he is called again: another call id, nothing decided yet (yesterday's "not now" decides nothing).
    expect(loadDecisions("t-b", [{ id: "c9", key: "Raza:u09:master" }])).toEqual({});
    // Done for the first call: her page drops his decisions.
    saveDecisions("t-b", first, {}, T0 + 60_000);
    expect(loadDecisions("t-b", first)).toEqual({});
  });

  test("calls that ended stay a while (another tap never wipes them), then go after 12 hours", () => {
    saveDecisions("t-c", [{ id: "c1", key: "A:u1:master" }], { "A:u1:master": { 3: "x" } }, T0);
    // A tap for someone else (c1 no longer in her room): c1's entry is kept, young.
    saveDecisions("t-c", [{ id: "c2", key: "B:u1:master" }], { "B:u1:master": { 4: "x" } }, T0 + HOUR);
    expect(loadDecisions("t-c", [{ id: "c1", key: "A:u1:master" }])).toEqual({ "A:u1:master": { 3: "x" } });
    saveDecisions("t-c", [{ id: "c2", key: "B:u1:master" }], { "B:u1:master": { 4: "x" } }, T0 + 13 * HOUR);
    expect(loadDecisions("t-c", [{ id: "c1", key: "A:u1:master" }])).toEqual({});
    expect(loadDecisions("t-c", [{ id: "c2", key: "B:u1:master" }])).toEqual({ "B:u1:master": { 4: "x" } });
  });

  test("Theory's decisions (by question as text, the whole unit too) and another room's are kept apart", () => {
    const calls = [{ id: "t1", key: "Malik:u08:master" }];
    saveDecisions("theory-x", calls, { "Malik:u08:master": { "13": "t", whole: "n" } }, T0);
    expect(loadDecisions("theory-x", calls)).toEqual({ "Malik:u08:master": { "13": "t", whole: "n" } });
    expect(loadDecisions("evaluation-x", calls)).toEqual({});
  });
});
