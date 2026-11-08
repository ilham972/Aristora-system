// The whole-class lesson (convex/teach.ts, 3 Nov 2026): everyone here in that grade, Taught saved only for those who
// have the book and still need it, Undo puts back exactly what one tap changed, and the teacher card counts the lesson
// as her work (convex/lib/boss.ts, board events). The page's rules: src/wholeClassData.ts.

import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { BOARD_FIRST_MS, digestOf, type DEvent } from "../convex/lib/boss";
import { KNOWN_WORKBOOKS, levelOutOf, PILOT_FIGHTER } from "../convex/lib/book";
import type { MState } from "../convex/lib/master";
import schema from "../convex/schema";
import { canTick, doneAll, firstLesson, firstQ, lessonsOf, pageTick, pillWords, squareOf, toDo, type Roster, type RosterStudent } from "../src/wholeClassData";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const G7U08 = KNOWN_WORKBOOKS[0].data;

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type T = Awaited<ReturnType<typeof setup>>;

const unitId = (t: T, key: string) => t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
async function add(t: T, name: string, grade: number, stage: "fighter" | "master", key: string, present = true) {
  const id = await t.mutation(api.students.add, { name, grade, term: grade === 7 ? 1 : 2, stage, unitId: await unitId(t, key) });
  if (present) await t.mutation(api.students.setPresent, { id, present: true });
  return id;
}
const marksOf = (t: T, id: Id<"students">, key: string, stage: "fighter" | "master") =>
  t.run(async (ctx) => {
    const u = (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!;
    const p = await ctx.db
      .query("progress")
      .withIndex("by_student_unit_stage", (q) => q.eq("studentId", id).eq("unitId", u._id).eq("stage", stage))
      .first();
    return { marks: p?.marks ?? {}, m: (p?.m ?? { q: {}, lv: {} }) as MState };
  });
const stats = (t: T) => t.run(async (ctx) => (await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first())?.stats ?? {});

describe("the whole-class lesson on a theory book", () => {
  test("everyone here in the grade; Taught for those who have the book and need it; Undo; the history; seen today", async () => {
    const t = await setup();
    const asha = await add(t, "Asha", 11, "fighter", "G11-U13");
    const bala = await add(t, "Bala", 11, "fighter", "G11-U13");
    const chitra = await add(t, "Chitra", 11, "fighter", "G11-U01"); // another unit: no work in U13's theory book
    await add(t, "Dinesh", 11, "fighter", "G11-U13", false); // not here today
    await add(t, "Eva", 10, "fighter", "G10-U01"); // another grade
    await t.mutation(api.marks.setMany, { studentId: bala, items: [1, 2, 3, 4].map((q) => ({ q, s: "taught" as const })), by: "theory" });
    await t.mutation(api.marks.setMany, { studentId: asha, items: [{ q: 2, s: "skip" }], by: "theory" });
    const u13 = await unitId(t, "G11-U13");

    const r = (await t.query(api.teach.roster, { unitId: u13, stage: "fighter" }))!;
    expect(r.students.map((s) => [s.name, s.has, s.now])).toEqual([
      ["Asha", true, true],
      ["Bala", true, true],
      ["Chitra", false, false],
    ]);
    expect(r.students[1].marks).toEqual({ "1": "taught", "2": "taught", "3": "taught", "4": "taught" });
    expect(r.students[0].marks).toEqual({ "2": "skip" });

    // Q1 for all three: Asha changes; Bala had it already; Chitra has no work in this book (nothing to save).
    const res = await t.mutation(api.teach.taught, { unitId: u13, stage: "fighter", q: 1, studentIds: [asha, bala, chitra], lesson: true, by: "theory" });
    expect(res.changed.map((c) => [c.name, c.was])).toEqual([["Asha", "none"]]);
    expect(res.nothing).toEqual(["Chitra"]);
    expect((await marksOf(t, asha, "G11-U13", "fighter")).marks["1"]?.s).toBe("taught");
    // Her score: one question, one lesson, one student taught. He was seen by Theory (no "no teacher yet" dot).
    expect((await stats(t)).theory).toMatchObject({ qs: 1, lessons: 1, done: 1 });
    const a = await t.run(async (ctx) => (await ctx.db.get(asha))!);
    expect(a.seen?.theory).toBeDefined();
    // Q2: Asha's "skip" becomes taught, and Undo puts the skip back (not an empty circle).
    const r2 = await t.mutation(api.teach.taught, { unitId: u13, stage: "fighter", q: 2, studentIds: [asha], by: "theory" });
    expect(r2.changed.map((c) => c.was)).toEqual(["skip"]);
    expect((await stats(t)).theory).toMatchObject({ qs: 2, lessons: 1 });
    await t.mutation(api.teach.untaught, { unitId: u13, stage: "fighter", q: 2, items: r2.changed.map((c) => ({ studentId: c.studentId, was: c.was })), by: "theory" });
    expect((await marksOf(t, asha, "G11-U13", "fighter")).marks["2"]?.s).toBe("skip");
    expect((await stats(t)).theory).toMatchObject({ qs: 1 });
    // Undo of Q1: empty again.
    await t.mutation(api.teach.untaught, { unitId: u13, stage: "fighter", q: 1, items: [{ studentId: asha, was: "none" }], by: "theory" });
    expect((await marksOf(t, asha, "G11-U13", "fighter")).marks["1"]).toBeUndefined();
    // The history: one line per student and question, by the teacher; undone too.
    const ev = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("board")));
    expect(ev.map((e) => [e.kind, e.name, e.q, e.value, e.by, e.who])).toEqual([
      ["board", "Asha", 1, "taught", "theory", "Owner"],
      ["board", "Asha", 2, "taught", "theory", "Owner"],
      ["board-undo", "Asha", 2, "taught", "theory", "Owner"],
      ["board-undo", "Asha", 1, "taught", "theory", "Owner"],
    ]);
  });

  test("only teacher questions are taught; a corrector can neither read nor teach it", async () => {
    const t = await setup();
    const asha = await add(t, "Asha", 11, "fighter", "G11-U13");
    const u13 = await unitId(t, "G11-U13");
    await expect(t.mutation(api.teach.taught, { unitId: u13, stage: "fighter", q: 5, studentIds: [asha], by: "theory" })).rejects.toThrow(/teacher question/);
    await addPerson(t, { name: "Kavi", token: "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwx", tabs: ["correction"] });
    const kavi = asPhone(t, "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwx");
    await expect(kavi.query(api.teach.roster, { unitId: u13, stage: "fighter" })).rejects.toThrow(/Theory|Evaluation/);
    await expect(kavi.mutation(api.teach.taught, { unitId: u13, stage: "fighter", q: 1, studentIds: [asha], by: "correction" })).rejects.toThrow();
    // An Evaluation teacher may (her score gets it, as Evaluation).
    await addPerson(t, { name: "Nila", token: "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx", tabs: ["evaluation"] });
    const nila = asPhone(t, "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx");
    await nila.mutation(api.teach.taught, { unitId: u13, stage: "fighter", q: 1, studentIds: [asha], lesson: true, by: "evaluation" });
    expect((await stats(t)).evaluation).toMatchObject({ qs: 1, done: 1 });
    expect((await stats(t)).evaluation?.lessons).toBeUndefined();
  });
});

describe("the whole-class lesson on a workbook", () => {
  test("a lost question waiting for Theory = taught, waiting for Evaluation = explained; full marks: nothing; Undo", async () => {
    const t = await setup();
    const malik = await add(t, "Malik", 7, "master", "G7-U08");
    const u08 = await unitId(t, "G7-U08");
    // Level 1 corrected: Q3 lost its marks (waits for Evaluation), Q4 "?" (he couldn't start it), sent to Theory.
    const l1 = G7U08.levels[0];
    const each = levelOutOf(G7U08, l1)!;
    const items = Array.from({ length: l1.to - l1.from + 1 }, (_, i) => {
      const q = l1.from + i;
      return q === 4 ? { q, got: 0, dk: true } : { q, got: q === 3 ? 0 : each[i] };
    });
    await t.mutation(api.workbook.correct, { studentId: malik, unitId: u08, level: 1, items, by: "correction" });
    // A blank is a wrong answer since 8 Nov 2026: Theory gets it only when a teacher sends it there.
    await t.mutation(api.workbook.toTheory, { studentId: malik, unitId: u08, qs: [4], on: true, by: "correction" });

    const r = (await t.query(api.teach.roster, { unitId: u08, stage: "master" }))!;
    expect(r.students[0].waits).toEqual({ "3": "eval", "4": "theory" });
    const a = await t.mutation(api.teach.taught, { unitId: u08, stage: "master", q: 3, studentIds: [malik], by: "theory" });
    const b = await t.mutation(api.teach.taught, { unitId: u08, stage: "master", q: 4, studentIds: [malik], by: "theory" });
    const c = await t.mutation(api.teach.taught, { unitId: u08, stage: "master", q: 5, studentIds: [malik], by: "theory" });
    expect([a.changed[0]?.was, b.changed[0]?.was, c.changed.length, c.nothing]).toEqual(["eval", "theory", 0, ["Malik"]]);
    let m = (await marksOf(t, malik, "G7-U08", "master")).m;
    expect(m.q["3"].x).toBeDefined();
    expect(m.q["4"].tt).toBeDefined();
    // Taught again: nothing changes (already done).
    expect((await t.mutation(api.teach.taught, { unitId: u08, stage: "master", q: 4, studentIds: [malik], by: "theory" })).changed).toEqual([]);
    await t.mutation(api.teach.untaught, { unitId: u08, stage: "master", q: 4, items: [{ studentId: malik, was: "theory" }], by: "theory" });
    m = (await marksOf(t, malik, "G7-U08", "master")).m;
    expect(m.q["4"].tt).toBeUndefined();
    expect(m.q["4"].th).toBeDefined(); // still waiting for Theory
    expect(m.q["3"].x).toBeDefined(); // the other tap stays
  });
});

describe("the teacher card counts a board lesson as her work", () => {
  const T0 = Date.UTC(2026, 10, 3, 10, 0);
  const min = (n: number) => T0 + n * 60_000;
  const team = [{ id: "u-fat", name: "Fathima", jobs: ["theory"] }];
  const stays = [{ userId: "u-fat", inAt: min(0) }];
  const students = [{ _id: "s1", stage: "fighter" }, { _id: "s2", stage: "fighter" }];
  const visits = students.map((s) => ({ studentId: s._id, inAt: min(0), outAt: min(60) }));
  // Taught at 10, 13, 17 (both students each time), then again at 45 (a new lesson after a 28-minute gap).
  const tap = (at: number, unit = "G11-U13"): DEvent[] =>
    students.map((s) => ({ at: min(at), kind: "board", studentId: s._id, unit, value: "taught", by: "theory", who: "Fathima" }));
  const events: DEvent[] = [
    // s1 waited for Theory 0 → 17 (the lesson's last tap gave him work).
    { at: min(17), kind: "idle", studentId: "s1", ms: 17 * 60_000, value: "theory" },
    ...tap(10),
    ...tap(13),
    ...tap(17),
    ...tap(45),
  ];
  const d = digestOf({ start: min(0), end: min(60), events, calls: [], visits, students, team, stays, segs: true });
  const p = d.people.find((x) => x.name === "Fathima")!;

  test("each tap is her work since the last (the first of a run 4 minutes); a run on one unit is one lesson", () => {
    const first = BOARD_FIRST_MS / 60_000;
    // 6 → 17 (the first tap counts 4 minutes, then 3 and 4 since the last) and 41 → 45.
    expect(p.segs!.filter((x) => x.k === "w").map((x) => [(x.s - min(0)) / 60_000, (x.e - min(0)) / 60_000])).toEqual([
      [10 - first, 17],
      [45 - first, 45],
    ]);
    expect(p).toMatchObject({ workMin: 11 + first, lessons: 2, students: 2, room: "theory" });
    expect(d.rooms.theory.lessons).toBe(2);
    // Free while s1 waited for Theory: 0 → 6 less the 2-minute grace = 4 (her board minutes are not "free": without
    // the board events it would be 2 → 17 = 15).
    expect(p.missedMin).toBe(4);
    const without = digestOf({ start: min(0), end: min(60), events: events.filter((e) => e.kind !== "board"), calls: [], visits, students, team, stays });
    expect(without.people.find((x) => x.name === "Fathima")!.missedMin).toBe(15);
  });
});

describe("the page's rules (src/wholeClassData.ts)", () => {
  const st = (o: Partial<RosterStudent> & { name: string }): RosterStudent => ({
    id: o.name,
    grade: 11,
    unitId: "u13",
    stage: "fighter",
    has: true,
    now: true,
    ...o,
  });
  const roster: Roster = {
    unitId: "u13",
    stage: "fighter",
    data: PILOT_FIGHTER,
    keyCount: 0,
    qCount: 0,
    students: [
      st({ name: "Asha", marks: {} }),
      st({ name: "Bala", marks: { "1": "taught", "2": "taught", "3": "taught", "4": "taught" } }),
      st({ name: "Chitra", has: false, now: false, unitId: "u01" }),
      st({ name: "Devi", now: false, unitId: "u14", marks: {} }), // moved past U13: has it, not on it
    ],
  };
  const ls = lessonsOf(PILOT_FIGHTER);
  const A = ls[0];

  test("a theory book's lessons: its sections with teacher questions only (no past papers, no final)", () => {
    expect(ls.map((l) => `${l.label}:${l.qs.join(",")}`)).toEqual(["A:1,2,3,4", "B:9,10,11", "C:15,16,17", "D:23,24,25,26", "E:34,35,36", "F:41,42,43"]);
    expect(firstLesson(roster, ls)?.key).toBe("SA");
  });

  test("ticked by the page: on that book and not all taught; tickable: has the book; a student without it only listens", () => {
    expect(roster.students.map((s) => pageTick(s, "fighter", A))).toEqual([true, false, false, false]);
    expect(roster.students.map((s) => canTick(s, "fighter", A))).toEqual([true, true, false, true]);
    const code = (id: string) => ({ u01: "U01", u14: "U14" })[id] ?? null;
    // Words only where he isn't on this book; the taught are pale green (counted in the box's line), not labelled.
    expect(roster.students.map((s) => pillWords(s, "fighter", "u13", code))).toEqual(["", "", "on 1", "on 14"]);
    expect(roster.students.map((s) => doneAll(s, "fighter", A))).toEqual([false, true, false, false]);
  });

  test("a square: how many it saves for among the ticked; ✓ once it is done for them; the first open question", () => {
    const ticked = [roster.students[0], roster.students[1]];
    expect(squareOf(1, "fighter", ticked)).toEqual({ n: 1, done: false });
    expect(squareOf(1, "fighter", [roster.students[1]])).toEqual({ n: 0, done: true });
    expect(firstQ(A, "fighter", ticked)).toBe(1);
    expect(firstQ(A, "fighter", [roster.students[1]])).toBe(1); // nothing to save: the first
    expect(toDo(roster.students[2], "fighter", 1)).toBe(false);
  });

  test("a workbook: its levels; the level with the most waiting opens; only those with something waiting count", () => {
    const wb: Roster = {
      unitId: "u08",
      stage: "master",
      data: G7U08,
      keyCount: 0,
      qCount: 0,
      students: [
        { id: "m", name: "Malik", grade: 7, unitId: "u08", stage: "master", has: true, now: true, waits: { "13": "eval", "17": "theory", "3": "explained" } },
        { id: "v", name: "Vimal", grade: 7, unitId: "u08", stage: "master", has: true, now: true, waits: {} },
      ],
    };
    const wl = lessonsOf(G7U08);
    expect(wl.map((l) => l.label)).toEqual(["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"]);
    expect(firstLesson(wb, wl)?.label).toBe("L2");
    expect(wb.students.map((s) => canTick(s, "master", wl[1]))).toEqual([true, false]);
    expect(wb.students.map((s) => pillWords(s, "master", "u08", () => null))).toEqual(["", ""]);
    expect(wb.students.map((s) => doneAll(s, "master", wl[0]))).toEqual([true, false]); // Malik's Q3 explained; Vimal had nothing lost
    expect(squareOf(3, "master", wb.students)).toEqual({ n: 0, done: true });
  });
});
