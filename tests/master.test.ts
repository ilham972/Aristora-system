// Grades, units, stages and the Master workbook, on the real backend functions.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { checkMaster, KNOWN_WORKBOOKS, levelOutOf, type MasterData } from "../convex/lib/book";
import { computeMaster, levelWaits, teachState, type MState } from "../convex/lib/master";
import { SYLLABUS } from "../convex/lib/syllabus";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-10-27T14:00:00+05:30").getTime();
const G7U08 = KNOWN_WORKBOOKS[0].data;

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type T = Awaited<ReturnType<typeof setup>>;

async function unitId(t: T, key: string) {
  return await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
}
async function addMaster(t: T, name: string) {
  const id = await t.mutation(api.students.add, { name, grade: 7, term: 1, stage: "master", unitId: await unitId(t, "G7-U08") });
  await t.mutation(api.students.setPresent, { id, present: true });
  return id;
}
async function work(t: T, id: Id<"students">) {
  return await t.run(async (ctx) => {
    const s = (await ctx.db.get(id))!;
    const p = await ctx.db
      .query("progress")
      .withIndex("by_student_unit_stage", (q) => q.eq("studentId", id).eq("unitId", s.unitId!).eq("stage", "master"))
      .first();
    return { s, m: (p?.m ?? { q: {}, lv: {} }) as MState };
  });
}
/** Full marks for a level, except the listed questions get 0. */
function items(book: MasterData, n: number, zero: number[] = []) {
  const l = book.levels.find((x) => x.n === n)!;
  const each = levelOutOf(book, l)!;
  return Array.from({ length: l.to - l.from + 1 }, (_, i) => {
    const q = l.from + i;
    return { q, got: zero.includes(q) ? 0 : each[i] };
  });
}
function advance(min: number) {
  vi.setSystemTime(Date.now() + min * MIN);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the syllabus and the books", () => {
  test("Grade 6-11 units load once, in term order; setup runs any number of times", async () => {
    const t = await setup();
    const units = await t.query(api.catalog.units, {});
    expect(units).toHaveLength(SYLLABUS.length);
    const count = (g: number) => units.filter((u) => u.grade === g && u.term > 0).length;
    expect([6, 7, 8, 9, 10, 11].map(count)).toEqual([25, 29, 31, 28, 32, 25]);
    expect(units.find((u) => u.key === "G8-U31")?.en).toBe("Tessellation");
    expect(units.find((u) => u.key === "G11-U13")?.term).toBe(2);
    const again = await t.mutation(api.setup.ensure, {});
    expect(again.changed).toBe(false);
    expect(await t.query(api.catalog.units, {})).toHaveLength(SYLLABUS.length);
    const books = await t.query(api.catalog.books, {});
    expect(books.map((b) => b.stage).sort()).toEqual(["fighter", "master"]);
    expect(books.find((b) => b.stage === "master")?.master?.total).toBe(146);
  });

  test("students from before stages move onto the pilot book with their marks", async () => {
    const t = await asOwner(convexTest(schema, modules));
    const old = await t.run(async (ctx) =>
      ctx.db.insert("students", {
        name: "Old Timer",
        archived: false,
        present: false,
        marks: { "1": { s: "taught", t: START }, "5": { s: "wrong", n: 1, t: START } },
        idleMs: 0,
      }),
    );
    expect((await t.query(api.state.get, {})).legacy).toBe(true);
    await t.mutation(api.setup.ensure, {});
    const st = await t.query(api.state.get, {});
    expect(st.legacy).toBe(false);
    const s = st.students.find((x) => x._id === old)!;
    expect([s.grade, s.term, s.stage]).toEqual([11, 2, "fighter"]);
    expect(s.marks).toBeUndefined();
    expect(st.progress[old].marks["5"]).toMatchObject({ s: "wrong", n: 1 });
  });

  test("the Grade 7 U08 workbook adds up exactly as printed: 74 + 72 = 146", () => {
    expect(checkMaster(G7U08)).toEqual([]);
    const ms = computeMaster({ q: {}, lv: {} }, G7U08);
    expect(ms.current?.n).toBe(1);
    expect(ms.unit.max).toBe(146);
  });

  test("saving a workbook from its marks table: checked, and question marks kept", async () => {
    const t = await setup();
    const u = await unitId(t, "G8-U01");
    await expect(
      t.mutation(api.catalog.saveWorkbook, {
        unitId: u,
        parts: [{ id: "I", to: 20 }, { id: "II", to: 26 }],
        levels: [{ to: 10, max: 20 }, { to: 20, max: 19 }, { to: 26, max: 30 }],
      }),
    ).rejects.toThrow(/Level 2: its questions add up to 20, not 19/);
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u,
      parts: [{ id: "I", to: 20 }, { id: "II", to: 26 }],
      levels: [{ to: 10, max: 20 }, { to: 20, max: 20 }, { to: 26, max: 30 }],
      marks: { "21": 5 },
    });
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u,
      parts: [{ id: "I", to: 20 }, { id: "II", to: 26 }],
      levels: [{ to: 10, max: 20 }, { to: 20, max: 20 }, { to: 26, max: 30 }],
    });
    const b = (await t.query(api.catalog.books, {})).find((x) => x.unitId === u)!;
    expect(b.master?.marksKnown).toBe(1);
    expect(b.master?.total).toBe(70);
    await expect(
      t.mutation(api.catalog.saveWorkbook, { unitId: u, parts: [{ id: "IA", to: 10 }], levels: [{ to: 10, max: 20 }] }),
    ).rejects.toThrow(/no Paper I A/);
  });
});

describe("Master: levels and marks", () => {
  test("level done waits; marks per question; lost marks wait for Evaluation; he goes on meanwhile", async () => {
    const t = await setup();
    const id = await addMaster(t, "Malik");
    await t.mutation(api.workbook.levelDone, { studentId: id, level: 1 });
    let { m } = await work(t, id);
    let ms = computeMaster(m, G7U08);
    expect(ms.current?.n).toBe(2); // working on Level 2 while Level 1 waits
    expect(ms.waiting.map((l) => l.n)).toEqual([1]);
    advance(6);
    const res = await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: items(G7U08, 1, [4, 7]) });
    expect(res).toMatchObject({ got: 16, max: 20 });
    ({ m } = await work(t, id));
    ms = computeMaster(m, G7U08);
    expect(ms.pending).toEqual([4, 7]);
    expect(ms.sofar.pct).toBe(80);
    expect(ms.unit).toMatchObject({ got: 16, max: 146, pct: 11 });
    await t.mutation(api.workbook.explain, { studentId: id, qs: [4], on: true });
    ({ m } = await work(t, id));
    expect(computeMaster(m, G7U08).pending).toEqual([7]);
    // the session report counts the level and how long it waited
    const report = await t.mutation(api.sessions.end, {});
    expect(report.master).toMatchObject({ levels: 1, pct: 80, avgWaitMin: 6 });
  });

  test("bad marks are refused; correcting again replaces the marks", async () => {
    const t = await setup();
    const id = await addMaster(t, "Priya");
    await expect(
      t.mutation(api.workbook.correct, { studentId: id, level: 5, items: items(G7U08, 5).slice(1) }),
    ).rejects.toThrow(/all 11 questions/);
    const bad = items(G7U08, 5);
    bad[3] = { q: 41, got: 4 }; // Q41 is out of 3
    await expect(t.mutation(api.workbook.correct, { studentId: id, level: 5, items: bad })).rejects.toThrow(/Question 41: marks must be 0 to 3/);
    await t.mutation(api.workbook.correct, { studentId: id, level: 5, items: items(G7U08, 5, [41]) });
    await t.mutation(api.workbook.correct, { studentId: id, level: 5, items: items(G7U08, 5) });
    const { m } = await work(t, id);
    expect(m.lv["5"]?.got).toBe(20);
    expect(computeMaster(m, G7U08).pending).toEqual([]);
  });

  test("a workbook without each question's marks: the level total and which questions lost marks", async () => {
    const t = await setup();
    const u = await unitId(t, "G8-U02");
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u,
      parts: [{ id: "I", to: 10 }, { id: "II", to: 13 }],
      levels: [{ to: 10, max: 20 }, { to: 13, max: 30 }],
    });
    const id = await t.mutation(api.students.add, { name: "Hana", grade: 8, term: 1, stage: "master", unitId: u });
    const lost = [{ q: 11, lost: false }, { q: 12, lost: true }, { q: 13, lost: false }];
    await expect(t.mutation(api.workbook.correct, { studentId: id, level: 2, items: lost })).rejects.toThrow(/type the marks, 0 to 30/);
    await expect(
      t.mutation(api.workbook.correct, { studentId: id, level: 2, items: lost.map((x) => ({ ...x, lost: false })), total: 25 }),
    ).rejects.toThrow(/Which questions lost marks/);
    await t.mutation(api.workbook.correct, { studentId: id, level: 2, items: lost, total: 25 });
    const s = await t.run(async (ctx) => (await ctx.db.query("progress").collect()).find((p) => p.studentId === id)!);
    expect(s.m?.lv["2"]).toMatchObject({ got: 25 });
    expect(s.m?.q["12"]).toMatchObject({ lost: true });
  });

  test("every level handed in and waiting = out of work (waiting for correction)", async () => {
    const t = await setup();
    const id = await addMaster(t, "Vimal");
    for (const l of G7U08.levels) await t.mutation(api.workbook.levelDone, { studentId: id, level: l.n });
    const s = (await work(t, id)).s;
    expect(s.idleSince! - START).toBeLessThan(1000);
    expect(s.idleReason).toBe("correction");
    await t.mutation(api.workbook.undoDone, { studentId: id, level: 8 });
    expect((await work(t, id)).s.idleSince).toBeUndefined();
  });

  test("Evaluation calls a Master student and explains in the room; Theory re-teaches when asked", async () => {
    const t = await setup();
    const id = await addMaster(t, "Malik");
    const none = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    expect(none.rejected[0].reason).toMatch(/no lost marks/);
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: items(G7U08, 1, [2, 3]) });
    const ev = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    await t.mutation(api.calls.finish, { items: [{ callId: ev.created[0].callId, explained: [2] }] });
    let { m } = await work(t, id);
    expect(computeMaster(m, G7U08).pending).toEqual([3]);

    const th0 = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(th0.rejected[0].reason).toMatch(/re-teaching/);
    await t.mutation(api.workbook.reteach, { studentId: id, on: true });
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(th.created).toHaveLength(1);
    await t.mutation(api.calls.send, { callIds: [th.created[0].callId] });
    // Sent back before the re-teach: still asked.
    await t.mutation(api.calls.finish, { items: [{ callId: th.created[0].callId, taught: [], skip: [] }] });
    ({ m } = await work(t, id));
    expect(m.reteach).toBeDefined();
    const th2 = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [th2.created[0].callId] });
    await t.mutation(api.calls.finish, { items: [{ callId: th2.created[0].callId }] });
    ({ m } = await work(t, id));
    expect(m.reteach).toBeUndefined();
  });
});

describe("Master: Theory comes after Correction and Evaluation", () => {
  test("'?' goes straight to Theory; the other lost marks wait for Evaluation", async () => {
    const t = await setup();
    const id = await addMaster(t, "Malik");
    const it = items(G7U08, 1, [4, 7]).map((x) => (x.q === 7 ? { q: 7, got: 0, dk: true } : x));
    const res = await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: it, by: "correction" });
    expect(res).toMatchObject({ got: 16, theory: [7], evaluation: [4] });
    const { m } = await work(t, id);
    expect(m.q["7"]).toMatchObject({ got: 0, lost: true, dk: true, tb: "correction" });
    const ms = computeMaster(m, G7U08);
    expect([ms.pending, ms.theory, ms.reteach, ms.wholeUnit]).toEqual([[4], [7], true, false]);
    const bad = it.map((x) => (x.q === 7 ? { q: 7, got: 2, dk: true } : x));
    await expect(t.mutation(api.workbook.correct, { studentId: id, level: 1, items: bad })).rejects.toThrow(/couldn't start it, so 0 marks/);
  });

  test("a level he mostly got wrong: its lost marks go to Theory instead of Evaluation", async () => {
    const t = await setup();
    const id = await addMaster(t, "Priya");
    const res = await t.mutation(api.workbook.correct, {
      studentId: id,
      level: 1,
      items: items(G7U08, 1, [1, 2, 3, 4, 5, 6]),
      to: "theory",
      by: "correction",
    });
    expect(res).toMatchObject({ got: 8, theory: [1, 2, 3, 4, 5, 6], evaluation: [] });
    const ms = computeMaster((await work(t, id)).m, G7U08);
    expect([ms.pending, ms.theory, ms.dry]).toEqual([[], [1, 2, 3, 4, 5, 6], false]); // he carries on with Level 2
    const ev = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    expect(ev.rejected[0].reason).toMatch(/no lost marks/);
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(th.created).toHaveLength(1);
  });

  test("Evaluation sends questions to Theory and takes them back; only lost questions go", async () => {
    const t = await setup();
    const id = await addMaster(t, "Vimal");
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: items(G7U08, 1, [2, 3, 9]) });
    await t.mutation(api.workbook.explain, { studentId: id, qs: [9], on: true });
    await expect(t.mutation(api.workbook.toTheory, { studentId: id, qs: [5], on: true })).rejects.toThrow(/hasn't lost marks/);
    expect(await t.mutation(api.workbook.toTheory, { studentId: id, qs: [2, 3, 9], on: true, by: "evaluation" })).toBe(true);
    let { m } = await work(t, id);
    let ms = computeMaster(m, G7U08);
    expect([ms.theory, ms.pending, ms.dry]).toEqual([[2, 3, 9], [], false]);
    expect(m.q["2"]).toMatchObject({ tb: "evaluation" });
    await t.mutation(api.workbook.toTheory, { studentId: id, qs: [9], on: false });
    ({ m } = await work(t, id));
    ms = computeMaster(m, G7U08);
    expect([ms.theory, ms.pending]).toEqual([[2, 3], []]); // Q9 was explained already
    const line = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "to-theory").at(-1));
    expect(line).toMatchObject({ value: "Q2, Q3, Q9", who: "Owner" });
  });

  test("Theory taps taught; Send back keeps the rest; All taught clears them; marking again keeps what happened", async () => {
    const t = await setup();
    const id = await addMaster(t, "Malik");
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: items(G7U08, 1, [3, 6]), to: "theory" });
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [th.created[0].callId] });
    await t.mutation(api.workbook.taught, { studentId: id, qs: [3], on: true });
    await t.mutation(api.calls.finish, { items: [{ callId: th.created[0].callId, taught: [], skip: [] }] });
    let ms = computeMaster((await work(t, id)).m, G7U08);
    expect(ms.theory).toEqual([6]);
    const th2 = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [th2.created[0].callId] });
    await t.mutation(api.calls.finish, { items: [{ callId: th2.created[0].callId }] });
    let { m } = await work(t, id);
    ms = computeMaster(m, G7U08);
    expect([ms.theory, ms.reteach]).toEqual([[], false]);
    const done = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "done-theory").at(-1));
    expect(done?.value).toBe("taught 6");
    // Correcting the level again the same way keeps "taught"; nothing goes back to Theory.
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: items(G7U08, 1, [3, 6]) });
    ({ m } = await work(t, id));
    expect(m.q["6"]).toMatchObject({ th: expect.any(Number), tt: expect.any(Number) });
    expect(computeMaster(m, G7U08).theory).toEqual([]);
  });

  test("every level done and only Theory left: out of work, waiting for Theory", async () => {
    const t = await setup();
    const id = await addMaster(t, "Priya");
    for (const l of G7U08.levels) await t.mutation(api.workbook.correct, { studentId: id, level: l.n, items: items(G7U08, l.n) });
    expect(computeMaster((await work(t, id)).m, G7U08).finished).toBe(true);
    const it = items(G7U08, 1).map((x) => (x.q === 1 ? { q: 1, got: 0, dk: true } : x));
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: it });
    const { s, m } = await work(t, id);
    const ms = computeMaster(m, G7U08);
    expect([ms.finished, ms.dry, ms.needs]).toEqual([false, true, ["theory"]]);
    expect(s.idleReason).toBe("theory");
  });
});

describe("moving students between units and stages", () => {
  test("next stage keeps the old work; Exam Sprint remembers where he was; wrong grade refused", async () => {
    const t = await setup();
    const g11u13 = await unitId(t, "G11-U13");
    const id = await t.mutation(api.students.add, { name: "Ahamed", grade: 11, term: 2, stage: "fighter", unitId: g11u13 });
    await t.mutation(api.marks.set, { studentId: id, q: 1, s: "taught" });
    await t.mutation(api.students.move, { id, grade: 11, term: 2, stage: "master", unitId: g11u13 });
    await t.mutation(api.students.move, { id, grade: 11, term: 2, stage: "sprint" });
    let s = await t.run((ctx) => ctx.db.get(id));
    expect(s?.back).toMatchObject({ stage: "master", unitId: g11u13, term: 2 });
    await t.mutation(api.students.move, { id, grade: 11, term: 2, stage: "fighter", unitId: g11u13 });
    s = await t.run((ctx) => ctx.db.get(id));
    expect(s?.back).toBeUndefined();
    const st = await t.query(api.state.get, {});
    expect(st.progress[id].marks["1"]?.s).toBe("taught"); // his Fighter work is still there
    await expect(
      t.mutation(api.students.move, { id, grade: 10, term: 1, stage: "fighter", unitId: g11u13 }),
    ).rejects.toThrow(/Grade 11 unit, not Grade 10/);
    await expect(t.mutation(api.students.move, { id, grade: 11, term: 2, stage: "master" })).rejects.toThrow(/Choose the unit/);
  });

  test("a student whose unit has no book: no marks, no calls, not counted as idle", async () => {
    const t = await setup();
    const u = await unitId(t, "G9-U01");
    const id = await t.mutation(api.students.add, { name: "Nobook", grade: 9, term: 1, stage: "fighter", unitId: u });
    await t.mutation(api.students.setPresent, { id, present: true });
    await expect(t.mutation(api.marks.set, { studentId: id, q: 1, s: "taught" })).rejects.toThrow(/has no theory book/);
    const c = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(c.rejected[0].reason).toMatch(/no book/);
    const s = await t.run((ctx) => ctx.db.get(id));
    expect(s?.idleSince).toBeUndefined();
  });

  test("new students start on the first unit of the current term", async () => {
    const t = await setup();
    const id = await t.mutation(api.students.add, { name: "Newbie", grade: 8 });
    const s = await t.run((ctx) => ctx.db.get(id));
    const u = await t.run((ctx) => ctx.db.get(s!.unitId!));
    expect([s?.term, s?.stage, u?.key]).toEqual([3, "fighter", "G8-U22"]); // 27 October = Term 3
  });
});

describe("Correction's unit sheet: what the teachers did, each unit's progress, the books given", () => {
  test("each lost question: waiting for Evaluation, explained; sent to Theory, taught (the E and T on Correction)", async () => {
    const t = await setup();
    const id = await addMaster(t, "Malik");
    const l1 = G7U08.levels[0];
    // Q2 and Q3 lost marks, Q7 "?" (couldn't start it): no Theory unless picked, even on a poor level.
    const it = items(G7U08, 1, [2, 3, 7]).map((x) => (x.q === 7 ? { q: 7, got: 0, dk: true } : x));
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: it, by: "correction" });
    let { m } = await work(t, id);
    expect([teachState(m.q["1"]), teachState(m.q["2"]), teachState(m.q["7"]), teachState(undefined)]).toEqual([null, "eval", "theory", null]);
    expect(levelWaits(m, l1)).toEqual({ evaluation: 2, theory: 1 });
    await t.mutation(api.workbook.explain, { studentId: id, qs: [2], on: true });
    await t.mutation(api.workbook.toTheory, { studentId: id, qs: [3], on: true });
    await t.mutation(api.workbook.taught, { studentId: id, qs: [7], on: true });
    ({ m } = await work(t, id));
    expect([teachState(m.q["2"]), teachState(m.q["3"]), teachState(m.q["7"])]).toEqual(["explained", "theory", "taught"]);
    expect(levelWaits(m, l1)).toEqual({ evaluation: 0, theory: 1 });
    // Q2 re-marked full: nothing to explain any more.
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: it.map((x) => (x.q === 2 ? items(G7U08, 1)[1] : x)) });
    ({ m } = await work(t, id));
    expect(teachState(m.q["2"])).toBeNull();
  });

  test("his units: levels done of the book, marks %, waiting for Evaluation / Theory; theory-book questions", async () => {
    const t = await setup();
    const id = await addMaster(t, "Priya");
    const u08 = await unitId(t, "G7-U08");
    expect(await t.query(api.progress.student, { studentId: id })).toEqual({
      cells: [{ unitId: u08, stage: "master", done: 0, total: 8, pct: null, evaluation: 0, theory: 0, finished: false }],
      given: [],
    });
    const it = items(G7U08, 1, [2, 3]);
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: it, to: "theory" });
    await t.mutation(api.workbook.correct, { studentId: id, level: 2, items: items(G7U08, 2, [12]) });
    const got = it.reduce((a, x) => a + x.got, 0) + items(G7U08, 2, [12]).reduce((a, x) => a + x.got, 0);
    const max = G7U08.levels[0].max + G7U08.levels[1].max;
    const r = (await t.query(api.progress.student, { studentId: id }))!;
    expect(r.cells).toEqual([
      { unitId: u08, stage: "master", done: 2, total: 8, pct: Math.round((got / max) * 100), evaluation: 1, theory: 2, finished: false },
    ]);
    // The theory book (Grade 11 U13): solo questions done, wrong answers waiting for Evaluation.
    const u13 = await unitId(t, "G11-U13");
    const nila = await t.mutation(api.students.add, { name: "Nila", grade: 11, term: 2, stage: "fighter", unitId: u13 });
    const solo = await t.run(async (ctx) => {
      const b = (await ctx.db
        .query("books")
        .withIndex("by_unit_stage", (q) => q.eq("unitId", u13).eq("stage", "fighter"))
        .first())!;
      return b.data.kind === "fighter" ? b.data.sections.flatMap((x) => x.solo) : [];
    });
    await t.mutation(api.marks.set, { studentId: nila, q: solo[0], s: "right" });
    await t.mutation(api.marks.set, { studentId: nila, q: solo[1], s: "wrong" });
    const f = (await t.query(api.progress.student, { studentId: nila }))!.cells;
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ unitId: u13, stage: "fighter", done: 1, pct: null, evaluation: 1, theory: 0, finished: false });
    expect(f[0].total).toBeGreaterThan(20);
  });

  test("books given: on and off per unit and book, logged, his grade only; Correction's phones only", async () => {
    const t = await setup();
    const id = await addMaster(t, "Vimal");
    const u08 = await unitId(t, "G7-U08");
    const u09 = await unitId(t, "G7-U09");
    await t.mutation(api.students.setGiven, { id, unitId: u08, stage: "master", given: true, by: "correction" });
    await t.mutation(api.students.setGiven, { id, unitId: u08, stage: "master", given: true }); // twice: still one
    await t.mutation(api.students.setGiven, { id, unitId: u09, stage: "fighter", given: true });
    let r = (await t.query(api.progress.student, { studentId: id }))!;
    expect(r.given.map((g) => `${g.unitId === u08 ? "U08" : "U09"} ${g.stage}`).sort()).toEqual(["U08 master", "U09 fighter"]);
    expect(r.given[0].at).toBeGreaterThanOrEqual(START);
    await t.mutation(api.students.setGiven, { id, unitId: u09, stage: "fighter", given: false });
    await t.mutation(api.students.setGiven, { id, unitId: u09, stage: "fighter", given: false }); // already off
    r = (await t.query(api.progress.student, { studentId: id }))!;
    expect(r.given.map((g) => g.stage)).toEqual(["master"]);
    const log = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("book-given")));
    expect(log.map((e) => `${e.kind} ${e.value}`)).toEqual(["book-given G7-U08 workbook", "book-given G7-U09 theory book", "book-given-off G7-U09 theory book"]);
    // Another grade's unit is refused; so is a phone without Correction (Theory may look, not change).
    await expect(t.mutation(api.students.setGiven, { id, unitId: await unitId(t, "G8-U01"), stage: "master", given: true })).rejects.toThrow(
      /Grade 8 unit, not Grade 7/,
    );
    const theory = "theory-token-0123456789abcdefghijklmnopqrstuvwxyz";
    await addPerson(t, { name: "Ravi", token: theory, tabs: ["theory"] });
    await expect(asPhone(t, theory).mutation(api.students.setGiven, { id, unitId: u09, stage: "master", given: true })).rejects.toThrow();
    expect((await asPhone(t, theory).query(api.progress.student, { studentId: id }))!.given).toHaveLength(1);
    const reports = "reports-token-0123456789abcdefghijklmnopqrstuvwxyz";
    await addPerson(t, { name: "Sana", token: reports, tabs: [], can: ["reports"] });
    await expect(asPhone(t, reports).query(api.progress.student, { studentId: id })).rejects.toThrow(/This needs/);
  });
});

describe("Several books at once (30 Oct 2026): every book reaches the rooms, one book per call", () => {
  /** Malik on G7 U08 with Q4 lost on Level 1, then moved on to U09 (a copy of the U08 skeleton) with Q2 lost there. */
  async function twoBooks() {
    const t = await setup();
    const u08 = await unitId(t, "G7-U08");
    const u09 = await unitId(t, "G7-U09");
    await t.run(async (ctx) => {
      await ctx.db.insert("books", { unitId: u09, stage: "master", data: G7U08, updatedAt: Date.now() });
    });
    const id = await addMaster(t, "Malik");
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: items(G7U08, 1, [4]), by: "correction" });
    await t.mutation(api.students.move, { id, grade: 7, term: 1, stage: "master", unitId: u09 });
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: items(G7U08, 1, [2]), by: "correction" });
    return { t, id, u08, u09 };
  }
  const book = async (t: T, id: Id<"students">, unit: Id<"units">) =>
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", id)).collect()).find((x) => x.unitId === unit);
      return (p?.m ?? { q: {}, lv: {} }) as MState;
    });

  test("the board sends his other books with something waiting (in class only), and the books given with work", async () => {
    const { t, id, u08, u09 } = await twoBooks();
    let b = await t.query(api.state.get, {});
    expect(b.progress[id].unitId).toBe(u09);
    expect((b.more?.[id] ?? []).map((p) => p.unitId)).toEqual([u08]);
    expect(Object.keys(b.books)).toContain(`${u08}:master`);
    // Explained: nothing waits in U08 any more, so it stops travelling.
    await t.mutation(api.workbook.explain, { studentId: id, unitId: u08, qs: [4], on: true });
    b = await t.query(api.state.get, {});
    expect(b.more?.[id]).toBeUndefined();
    // Books given: a fresh book has work; a book with no workbook in the app counts as work too.
    await t.mutation(api.students.setGiven, { id, unitId: u08, stage: "master", given: true });
    await t.mutation(api.students.setGiven, { id, unitId: await unitId(t, "G7-U10"), stage: "master", given: true });
    b = await t.query(api.state.get, {});
    expect(b.given?.[id]?.map((g) => g.work)).toEqual([true, true]);
    await t.mutation(api.students.setPresent, { id, present: false });
    b = await t.query(api.state.get, {});
    expect(b.more?.[id]).toBeUndefined();
    expect(b.given?.[id]).toBeUndefined();
  });

  test("Evaluation calls him for his U08 book while he is on U09; Done writes into U08; Keep him for U09", async () => {
    const { t, id, u08, u09 } = await twoBooks();
    await expect(t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", books: [{ studentId: id, unitId: await unitId(t, "G7-U10"), stage: "master" }] })).resolves.toMatchObject({
      created: [],
      rejected: [{ reason: "has no book in the app for that unit" }],
    });
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", books: [{ studentId: id, unitId: u08, stage: "master" }] });
    const callId = res.created[0].callId;
    expect((await t.run(async (ctx) => (await ctx.db.get(callId))!)).unitId).toBe(u08);
    // One book per call: he can't be called for U09 at the same time.
    const again = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    expect(again.rejected[0].reason).toMatch(/already called/);
    await t.mutation(api.calls.send, { callIds: [callId] });
    await expect(t.mutation(api.calls.keep, { item: { callId, explained: [4] }, unitId: u08, stage: "master" })).rejects.toThrow(/the book you just finished/);
    const kept = await t.mutation(api.calls.keep, { item: { callId, explained: [4] }, unitId: u09, stage: "master" });
    expect((await book(t, id, u08)).q["4"]?.x).toBeGreaterThan(0);
    expect((await book(t, id, u09)).q["2"]?.x).toBeUndefined();
    const next = await t.run(async (ctx) => (await ctx.db.get(kept.callId))!);
    expect(next).toMatchObject({ status: "sent", room: "evaluation", unitId: u09 });
    const s = await t.run(async (ctx) => (await ctx.db.get(id))!);
    expect(s.room).toBe("evaluation");
    expect(s.seen?.evaluation).toBeGreaterThan(0);
    await t.mutation(api.calls.finish, { items: [{ callId: kept.callId, explained: [2] }] });
    expect((await book(t, id, u09)).q["2"]?.x).toBeGreaterThan(0);
    // Nothing left to explain in U09 now: a call for that book is refused.
    const r2 = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", books: [{ studentId: id, unitId: u09, stage: "master" }] });
    expect(r2.rejected[0].reason).toMatch(/no lost marks/);
  });

  test("teachers act on any book he has work in: explain, to Theory and taught in U08 while he is on U09", async () => {
    const { t, id, u08 } = await twoBooks();
    await t.mutation(api.workbook.toTheory, { studentId: id, unitId: u08, qs: [4], on: true, by: "evaluation" });
    expect((await book(t, id, u08)).q["4"]).toMatchObject({ th: expect.any(Number), tb: "evaluation" });
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory", books: [{ studentId: id, unitId: u08, stage: "master" }] });
    expect(th.created).toHaveLength(1);
    await t.mutation(api.workbook.taught, { studentId: id, unitId: u08, qs: [4], on: true });
    expect((await book(t, id, u08)).q["4"]?.tt).toBeGreaterThan(0);
    // A book he never started: refused, nothing created.
    await expect(t.mutation(api.workbook.explain, { studentId: id, unitId: await unitId(t, "G7-U10"), qs: [1], on: true })).rejects.toThrow();
  });

  test("out of work only when every book given to him is blocked: a given book with work stops the idle clock", async () => {
    const t = await setup();
    const id = await addMaster(t, "Vimal");
    for (const l of G7U08.levels) await t.mutation(api.workbook.levelDone, { studentId: id, level: l.n });
    let s = (await work(t, id)).s;
    expect(s.idleSince).toBeDefined(); // every level handed in: no work until corrected
    expect(s.idleReason).toBe("correction");
    await t.mutation(api.students.setGiven, { id, unitId: await unitId(t, "G7-U09"), stage: "master", given: true });
    s = (await work(t, id)).s;
    expect(s.idleSince).toBeUndefined();
    await t.mutation(api.students.setGiven, { id, unitId: await unitId(t, "G7-U09"), stage: "master", given: false });
    s = (await work(t, id)).s;
    expect(s.idleSince).toBeDefined();
  });
});
