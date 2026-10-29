// The Focus tab's rules (src/focusData.ts), from plain views as the phones build them: who is offered, which level
// a paper can be, the part taps, moving on to the next question, where lost marks go, and Take back's snapshot.

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import type { View } from "../src/derive";
import {
  autoLevel,
  beforeOf,
  blankWords,
  candidates,
  CARRY_MS,
  carryLevel,
  draftOf,
  extendQueue,
  fighterQueue,
  focusNeeds,
  focusPills,
  fromDraft,
  itemsOf,
  levelLook,
  markedParts,
  nextBook,
  nextIndex,
  nextOpen,
  nothingWhy,
  openLevels,
  questionsOf,
  resumeAt,
  routeOf,
  sameGiven,
  savedGiven,
  sumOf,
  unitDone,
  unitNo,
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
  test("every student in class (any stage, a book or not) by grade then A–Z; then gone home with levels to correct", () => {
    const allIn = Object.fromEntries(G7U08.levels.map((l) => [String(l.n), { done: l.n }]));
    const pills = focusPills([
      wb("vimal"),
      wb("Ahamed"),
      wb("Malik", { "1": { done: 5 }, "2": { done: 6 } }),
      wb("Dry", allIn),
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
    // Grade 7 (A–Z, then gone home), Grade 9, Grade 11: whatever the case; a student in a room is offered too.
    expect(pills.map((p) => `${p.v.s.name}${p.tone ? ` ${p.tone}` : ""}${p.waiting ? ` ${p.waiting}` : ""}`)).toEqual([
      "Ahamed",
      "Done",
      "Dry red 8",
      "Malik amber 2",
      "Priya",
      "vimal",
      "Nila home 1",
      "Zainab nb",
      "Arun",
      "Kumar th",
      "Ravi nb",
    ]);
    expect(nothingWhy(th("Arun"))).toBe("waits for A theory");
    expect(nothingWhy(wb("Done", allFixed()))).toBe("finished");
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

describe("one page: which level opens, the level bar, the next level after Save", () => {
  const draft = (name: string, level: number, at: number): Draft => ({ studentId: name, unitId: U08._id, level, q: { [String(level * 10 - 9)]: { g: 2 } }, updatedAt: at });

  test("a level he was marking first, then the oldest handed in, then the one he is on; all corrected: none", () => {
    const malik = wb("Malik", { "1": { done: 1, fixed: 2, got: 20 }, "3": { done: 9 }, "2": { done: 5 } });
    expect(autoLevel(malik, [])?.n).toBe(2); // the oldest handed in
    expect(autoLevel(malik, [draft("Malik", 3, 50), draft("Malik", 4, 40)])?.n).toBe(3); // the latest he was marking
    expect(autoLevel(wb("Priya", { "1": { done: 1, fixed: 2, got: 20 } }), [])?.n).toBe(2); // the one he is on
    expect(autoLevel(wb("Done", allFixed()), [])).toBeNull();
    // Gone home: only what he handed in.
    expect(autoLevel(wb("Nila", { "1": { done: 5 } }, { where: "absent" }), [])?.n).toBe(1);
  });

  test("after a save: the next level not corrected (he did two or three without correcting), then one left earlier", () => {
    const v = wb("Vimal", { "1": { done: 1, fixed: 2, got: 20 }, "3": { done: 3, fixed: 4, got: 20 } });
    expect(nextOpen(v, 2)?.n).toBe(4); // 3 is corrected: on to 4
    expect(nextOpen(v, 8)?.n).toBe(2); // nothing after 8: the one left earlier
    // Levels the server just closed (the board may not show them yet) are skipped.
    expect(nextOpen(v, 4, [5, 6])?.n).toBe(7);
    const last = wb("Last", Object.fromEntries(G7U08.levels.filter((l) => l.n < 8).map((l) => [String(l.n), { done: 1, fixed: 2, got: l.max }])));
    expect(nextOpen(last, 8)).toBeNull();
    expect(unitDone(last, [8])).toBe(true);
    expect(unitDone(last)).toBe(false);
  });

  test("levels done on paper before the app count as done: not opened, not 'on it now'", () => {
    const v = wb("Priya", { "1": { pre: 9 }, "2": { pre: 9 }, "3": { pre: 9 }, "4": { done: 9, fixed: 9, got: 14 } });
    expect(autoLevel(v, [])?.n).toBe(5);
    expect(nextOpen(v, 4)?.n).toBe(5);
    expect([1, 4, 5, 6].map((n) => levelLook(v, level(n), []))).toEqual(["pre", "fixed", "current", "later"]);
    expect(levelLook(wb("M", { "2": { done: 5 } }), level(2), [draft("M", 2, 1)])).toBe("draft");
    expect(levelLook(wb("M", { "2": { done: 5 } }), level(2), [])).toBe("waiting");
    expect(v.ms!.pre).toBe(3);
  });

  test("a corrected level opened again shows its saved marks; nothing changed = nothing to save", () => {
    const q = {
      "21": { got: 2, max: 2, lost: false, t: 1 },
      "22": { got: 0, max: 2, lost: true, t: 1, dk: true },
      "23": { got: 1, max: 2, lost: true, t: 1 },
    };
    const v = wb("Malik", { "3": { done: 1, fixed: 2, got: 15 } }, { q });
    const g = savedGiven(v, level(3));
    expect([g[21], g[22], g[23]]).toEqual([{ g: 2 }, { g: 0, dk: true }, { g: 1 }]);
    const qs = questionsOf(level(3));
    expect(sameGiven(qs, g, { ...g })).toBe(true);
    expect(sameGiven(qs, g, { ...g, 23: { g: 2 } })).toBe(false);
    expect(unitNo("U04")).toBe(4);
    expect(unitNo("U31")).toBe(31);
  });

  test("'?' on one part: the answered parts keep their marks; it counts, goes to the server and to the draft as such", () => {
    const qs = [56, 57];
    const given = { 56: { g: 2, dk: true, dkp: ["ii"] }, 57: { g: 0, dk: true } };
    expect(sumOf(qs, given)).toBe(2);
    expect(itemsOf(qs, given)).toEqual([
      { q: 56, got: 2, dk: true, dkp: ["ii"] },
      { q: 57, got: 0, dk: true },
    ]);
    expect(blankWords(qs, given)).toBe("Q56 (ii), Q57");
    const d: Draft = { studentId: "V", unitId: U08._id, level: 8, q: { "56": { g: 2, dk: true, dkp: ["ii"], p: [2, 0] } }, updatedAt: 1 };
    expect(fromDraft(d)).toEqual({ given: { 56: { g: 2, dk: true, dkp: ["ii"] } }, parts: { 56: [2, 0] } });
  });

  test("a unit finished: the next workbook of that term in book order, Legend after the term's last, nothing outside the terms", () => {
    const u = (id: string, grade: number, term: number, order: number) => ({ _id: id, grade, term, order });
    const units = [u("g7u09", 7, 1, 9), u("g7u08", 7, 1, 8), u("g7u10", 7, 2, 10), u("g8u01", 8, 1, 1), u("g9u00", 9, 0, 0)];
    expect(nextBook(units, units[1])).toEqual({ stage: "master", unit: units[0] });
    expect(nextBook(units, units[0])).toEqual({ stage: "legend", unit: units[0] });
    expect(nextBook(units, units[2])).toEqual({ stage: "legend", unit: units[2] });
    expect(nextBook(units, units[4])).toBeNull();
    expect(nextBook(units, null)).toBeNull();
  });
});
