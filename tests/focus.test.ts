// The Focus tab's rules (src/focusData.ts), from plain views as the phones build them: who is offered, which level
// a paper can be, the part taps, moving on to the next question, where lost marks go, and Take back's snapshot.

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import type { View } from "../src/derive";
import {
  beforeOf,
  candidates,
  CARRY_MS,
  carryLevel,
  draftOf,
  extendQueue,
  fighterQueue,
  focusLists,
  focusNeeds,
  fromDraft,
  itemsOf,
  markedParts,
  nextIndex,
  nothingWhy,
  openLevels,
  questionsOf,
  resumeAt,
  routeOf,
  sumOf,
  type Carry,
  type Draft,
} from "../src/focusData";

const G7U08 = KNOWN_WORKBOOKS[0].data;
const U08 = { _id: "u08", code: "U08", grade: 7 };
const level = (n: number) => G7U08.levels.find((l) => l.n === n)!;

/** A workbook student: `lv` = his levels (done/fixed times), in class unless `where` says otherwise. */
function wb(name: string, lv: MState["lv"] = {}, opts: { where?: View["where"]; q?: MState["q"]; unitId?: string; grade?: number } = {}): View {
  const m: MState = { q: opts.q ?? {}, lv };
  return {
    s: { _id: name, name, unitId: opts.unitId ?? U08._id, grade: opts.grade ?? 7, stage: "master", lastSeenAt: 0 },
    unit: U08,
    stage: "master",
    kind: "master",
    where: opts.where ?? "hall",
    calls: [],
    st: null,
    f: null,
    mb: G7U08,
    ms: computeMaster(m, G7U08),
    mm: m,
  } as unknown as View;
}
const PILOT = fighter(PILOT_FIGHTER);
/** A theory-book student (the G11 pilot book) with these circles. */
function th(name: string, marks: Marks = {}, where: View["where"] = "hall"): View {
  return {
    s: { _id: name, name, unitId: "u13", grade: 11, stage: "fighter", lastSeenAt: 0 },
    stage: "fighter",
    kind: "fighter",
    where,
    f: PILOT,
    st: computeStatus(marks, PILOT),
    marks,
    mb: null,
    ms: null,
    mm: { q: {}, lv: {} },
  } as unknown as View;
}
const taught = (from: number, to: number): Marks =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), { s: "taught" as const, t: 1 }]));
const noTheoryBook = (name: string) =>
  ({ s: { _id: name, name, stage: "fighter", grade: 11 }, stage: "fighter", kind: "none", where: "hall", f: null, st: null, mb: null, ms: null, mm: { q: {}, lv: {} } }) as unknown as View;
const noBook = (name: string) =>
  ({ s: { _id: name, name, stage: "master", grade: 9 }, stage: "master", kind: "none", where: "hall", mb: null, ms: null, mm: { q: {}, lv: {} } }) as unknown as View;
/** Every level corrected: nothing left to correct. */
const allFixed = () => Object.fromEntries(G7U08.levels.map((l) => [String(l.n), { done: 1, fixed: 2, got: l.max }]));

describe("who the Focus tab offers", () => {
  test("workbook and theory-book students in class with something to mark, A–Z; the rest say why", () => {
    const lists = focusLists([
      wb("vimal"),
      wb("Ahamed"),
      wb("Malik", { "1": { done: 5 } }),
      wb("Done", allFixed()),
      wb("Gone, nothing in", {}, { where: "absent" }),
      wb("Nila", { "3": { done: 7 } }, { where: "absent" }),
      wb("Priya", {}, { where: "evaluation" }),
      th("Kumar", taught(1, 4)), // section A taught: Q5-8 open
      th("Arun"), // nothing taught yet: waits for A theory
      th("Away", taught(1, 4), "absent"), // his notebook went home with him
      noBook("Zainab"),
      noTheoryBook("Ravi"),
    ]);
    // A–Z whatever the case; a student in a room still has papers to correct.
    expect(lists.here.map((v) => v.s.name)).toEqual(["Ahamed", "Kumar", "Malik", "Priya", "vimal"]);
    expect(lists.gone.map((v) => v.s.name)).toEqual(["Nila"]);
    expect(lists.noBook.map((v) => v.s.name)).toEqual(["Ravi", "Zainab"]);
    expect(lists.nothing.map((v) => [v.s.name, nothingWhy(v)])).toEqual([
      ["Arun", "waits for A theory"],
      ["Done", "finished"],
    ]);
  });

  test("a paper's possible levels: handed in (oldest first), then the one he works on; gone home: handed in only", () => {
    const malik = wb("Malik", { "1": { done: 1, fixed: 2, got: 20 }, "3": { done: 9 }, "2": { done: 5 } });
    expect(candidates(malik).map((l) => l.n)).toEqual([2, 3, 4]);
    expect(candidates(wb("Priya")).map((l) => l.n)).toEqual([1]); // one: the paper opens at once
    expect(candidates(wb("Nila", { "1": { done: 5 } }, { where: "absent" })).map((l) => l.n)).toEqual([1]);
    expect(candidates(wb("Done", allFixed()))).toEqual([]);
    // "Another level": every level not corrected yet, in book order.
    expect(openLevels(malik).map((l) => l.n)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  test("pill colours: red when he has nothing to do until it's corrected, amber when a level waits", () => {
    const allIn = Object.fromEntries(G7U08.levels.map((l) => [String(l.n), { done: l.n }]));
    const needs = focusNeeds([wb("Dry", allIn), wb("Waits", { "1": { done: 1 } }), wb("Working"), wb("Gone dry", allIn, { where: "absent" })]);
    expect(Object.fromEntries(needs)).toEqual({ Dry: "red", Waits: "amber", "Gone dry": "amber" });
  });
});

describe("marking one question at a time", () => {
  const l3 = level(3); // Q21–30, 2 marks each

  test("the next question is the next one not marked; then the ones skipped; then the level's marks", () => {
    const qs = questionsOf(l3);
    expect(qs).toEqual([21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    expect(nextIndex(qs, { 21: { g: 2 } }, 0)).toBe(1);
    // He jumped to Q25 and marked it: on to Q26, and Q22–24 come after Q30.
    const some = { 21: { g: 2 }, 25: { g: 0 } };
    expect(nextIndex(qs, some, 4)).toBe(5);
    const allButEarly = Object.fromEntries(qs.filter((q) => q !== 22).map((q) => [q, { g: 2 }]));
    expect(nextIndex(qs, allButEarly, 9)).toBe(1);
    const all = Object.fromEntries(qs.map((q) => [q, { g: 2 }]));
    expect(nextIndex(qs, all, 3)).toBe(qs.length); // changing a mark from the summary goes back to it
  });

  test("the level's sum, what the server gets, and '?' counts 0 and goes as dk", () => {
    const qs = questionsOf(level(8)); // Q56 (4 marks), Q57 (11)
    const given = { 56: { g: 2 }, 57: { g: 0, dk: true } };
    expect(sumOf(qs, given)).toBe(2);
    expect(itemsOf(qs, given)).toEqual([
      { q: 56, got: 2 },
      { q: 57, got: 0, dk: true },
    ]);
  });

  test("lost marks go to Theory when the level is under half, else Evaluation; the corrector can change it", () => {
    expect(routeOf(9, 20, "auto")).toBe("theory");
    expect(routeOf(10, 20, "auto")).toBe("evaluation"); // exactly half: Evaluation, as on the Correction tab
    expect(routeOf(19, 20, "theory")).toBe("theory");
    expect(routeOf(2, 20, "evaluation")).toBe("evaluation");
  });

  test("part taps only when every part has its marks and they add up to the question's marks", () => {
    const parts = [
      { p: "i", a: "6", m: 1 },
      { p: "ii", a: "**12**", m: 2 },
    ];
    expect(markedParts({ q: 41, parts }, 3)).toEqual(parts);
    expect(markedParts({ q: 41, parts }, 4)).toBeNull(); // the key is for another version of the book
    expect(markedParts({ q: 41, parts: [{ p: "i", a: "6", m: 1 }, { p: "ii", a: "12" }] }, 3)).toBeNull();
    expect(markedParts({ q: 41, parts: [{ p: "i", a: "6", m: 3 }] }, 3)).toBeNull(); // one part = the question
    expect(markedParts({ q: 21, a: "15" }, 2)).toBeNull();
    expect(markedParts(undefined, 2)).toBeNull();
  });
});

describe("Take back", () => {
  test("the snapshot holds only that level: its questions and its level line", () => {
    const m: MState = {
      q: { "20": { got: 2, max: 2, lost: false, t: 1 }, "24": { got: 0, max: 2, lost: true, t: 3, x: 4 }, "31": { got: 1, max: 2, lost: true, t: 5 } },
      lv: { "3": { done: 2, fixed: 3, got: 18 }, "4": { done: 5 } },
    };
    expect(beforeOf(m, level(3))).toEqual({ lv: { done: 2, fixed: 3, got: 18 }, q: { "24": { got: 0, max: 2, lost: true, t: 3, x: 4 } } });
    // A level he hadn't handed in: no level line (it goes back to being the one he works on).
    expect(beforeOf(m, level(5))).toEqual({ q: {} });
  });

  test("taken-back marks open for the right student: same workbook and same questions, for 10 minutes", () => {
    const c: Carry = { unitId: U08._id, from: 21, to: 30, given: { 21: { g: 2 } }, fromName: "Malik", at: 1_000 };
    const priya = wb("Priya", { "1": { done: 1, fixed: 2, got: 20 }, "2": { done: 3, fixed: 4, got: 20 } }); // on Level 3
    expect(carryLevel(c, priya, 2_000)?.n).toBe(3);
    expect(carryLevel(c, priya, 1_000 + CARRY_MS + 1)).toBeNull();
    expect(carryLevel(c, wb("Other unit", {}, { unitId: "u09" }), 2_000)).toBeNull();
    // His Level 3 is already corrected: nowhere to put them.
    expect(carryLevel(c, wb("Ahead", allFixed()), 2_000)).toBeNull();
    expect(carryLevel(null, priya, 2_000)).toBeNull();
  });
});

describe("theory books (Fighter) in Focus", () => {
  test("his questions in book order: what he can do now, redo ones included; questions that open later join the end", () => {
    // A taught: Q5-8. Q5 slipped (redo), Q6 right.
    const kumar = th("Kumar", { ...taught(1, 4), "5": { s: "slip", t: 2 }, "6": { s: "right", t: 2 } });
    expect(fighterQueue(kumar)).toEqual([5, 7, 8]);
    // B taught later: Q12-14 join after the ones on the paper, never the ones before.
    expect(extendQueue([5, 7, 8], [5, 7, 8, 12, 13, 14])).toEqual([5, 7, 8, 12, 13, 14]);
    expect(extendQueue([7, 8], [5, 7, 8])).toEqual([7, 8]);
    expect(extendQueue([], [5])).toEqual([5]);
  });
});

describe("a workbook level marked part of the way (drafts)", () => {
  const d = (over: Partial<Draft> = {}): Draft => ({
    studentId: "Malik",
    unitId: U08._id,
    level: 3,
    q: { "21": { g: 2 }, "22": { g: 0, dk: true }, "23": { g: 1, p: [1, 0] } },
    updatedAt: 5,
    ...over,
  });
  test("his draft counts while his level isn't corrected and he is on the same workbook", () => {
    const malik = wb("Malik", { "3": { done: 2 } });
    expect(draftOf([d()], malik, 3)?.updatedAt).toBe(5);
    expect(draftOf([d()], malik, 4)).toBeNull();
    expect(draftOf([d({ unitId: "u09" })], malik, 3)).toBeNull(); // he moved on
    expect(draftOf([d()], wb("Malik", { "3": { done: 2, fixed: 3, got: 20 } }), 3)).toBeNull(); // corrected elsewhere
    expect(draftOf(undefined, malik, 3)).toBeNull(); // not loaded yet
  });
  test("the paper opens with his marks, at the first question not marked yet", () => {
    const { given, parts } = fromDraft(d());
    expect(given).toEqual({ 21: { g: 2 }, 22: { g: 0, dk: true }, 23: { g: 1 } });
    expect(parts).toEqual({ 23: [1, 0] });
    const qs = questionsOf(level(3));
    expect(resumeAt(qs, given)).toBe(3); // Q24
    expect(resumeAt(qs, {})).toBe(0);
    expect(resumeAt(qs, Object.fromEntries(qs.map((q) => [q, { g: 2 }])))).toBe(qs.length); // all marked: the level's marks
    expect(fromDraft(null)).toEqual({ given: {}, parts: {} });
  });
});
