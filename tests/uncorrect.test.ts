// Take back (workbook.uncorrect): a level saved on the wrong student goes back to exactly how it was, its
// "corrected" line leaves the class report, and it is refused once it is too late or someone worked on the marks.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { KNOWN_WORKBOOKS, levelOutOf, type MasterData } from "../convex/lib/book";
import type { MState } from "../convex/lib/master";
import schema from "../convex/schema";
import { beforeOf } from "../src/focusData";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-10-29T15:00:00+05:30").getTime();
const G7U08 = KNOWN_WORKBOOKS[0].data;
const BOOK = { ...G7U08 } as MasterData;

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type T = Awaited<ReturnType<typeof setup>>;

async function addMaster(t: T, name: string) {
  const unitId = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
  const id = await t.mutation(api.students.add, { name, grade: 7, term: 1, stage: "master", unitId });
  await t.mutation(api.students.setPresent, { id, present: true });
  return { id, unitId };
}
async function work(t: T, id: Id<"students">) {
  return await t.run(async (ctx) => {
    const s = (await ctx.db.get(id))!;
    const p = await ctx.db
      .query("progress")
      .withIndex("by_student_unit_stage", (q) => q.eq("studentId", id).eq("unitId", s.unitId!).eq("stage", "master"))
      .first();
    return (p?.m ?? { q: {}, lv: {} }) as MState;
  });
}
/** Full marks for a level, except these questions get 0. */
function items(n: number, zero: number[] = [], dk: number[] = []) {
  const l = BOOK.levels.find((x) => x.n === n)!;
  const each = levelOutOf(BOOK, l)!;
  return Array.from({ length: l.to - l.from + 1 }, (_, i) => {
    const q = l.from + i;
    return dk.includes(q) ? { q, got: 0, dk: true } : { q, got: zero.includes(q) ? 0 : each[i] };
  });
}
const level = (n: number) => BOOK.levels.find((l) => l.n === n)!;
const events = (t: T) => t.run(async (ctx) => await ctx.db.query("events").collect());

/** Correct a level the way the Focus tab does: snapshot first, then save; returns what Take back needs. */
async function save(t: T, who: { id: Id<"students">; unitId: Id<"units"> }, n: number, opts: { zero?: number[]; dk?: number[] } = {}) {
  const before = beforeOf(await work(t, who.id), level(n));
  await t.mutation(api.workbook.correct, { studentId: who.id, unitId: who.unitId, level: n, items: items(n, opts.zero, opts.dk), by: "correction" });
  const fixed = (await work(t, who.id)).lv[String(n)]!.fixed!;
  return { studentId: who.id, unitId: who.unitId, level: n, fixed, before, by: "correction" };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Take back a saved level", () => {
  test("a handed-in level goes back to waiting, its marks gone, and it leaves the class report", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    await t.mutation(api.workbook.levelDone, { studentId: malik.id, unitId: malik.unitId, level: 1, by: "correction" });
    const doneAt = (await work(t, malik.id)).lv["1"].done!;
    vi.setSystemTime(Date.now() + 4 * MIN);
    const back = await save(t, malik, 1, { zero: [3] });
    expect((await work(t, malik.id)).lv["1"]).toMatchObject({ fixed: back.fixed, got: 18 });
    expect((await events(t)).filter((e) => e.kind === "level-marks")).toHaveLength(1);

    vi.setSystemTime(Date.now() + 2 * MIN);
    expect(await t.mutation(api.workbook.uncorrect, back)).toBe(true);
    const m = await work(t, malik.id);
    expect(m.lv["1"]).toEqual({ done: doneAt }); // waiting again, since the same moment
    for (let q = 1; q <= 10; q++) expect(m.q[String(q)]).toBeUndefined();
    const all = await events(t);
    expect(all.filter((e) => e.kind === "level-marks")).toHaveLength(0);
    expect(all.find((e) => e.kind === "level-unmarked")).toMatchObject({ value: "1 18/20", name: "Malik", by: "correction" });
    // The report counts no level for Malik (the save never happened).
    const report = (await t.mutation(api.sessions.end, { by: "correction" }))!;
    expect(report.master.levels).toBe(0);
  });

  test("a level corrected straight away (not handed in) is the one he works on again; another student's save stays", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    const priya = await addMaster(t, "Priya");
    const wrong = await save(t, malik, 1);
    await save(t, priya, 1);
    expect(await t.mutation(api.workbook.uncorrect, wrong)).toBe(true);
    expect((await work(t, malik.id)).lv["1"]).toBeUndefined();
    expect((await work(t, priya.id)).lv["1"]).toMatchObject({ got: 20 });
    expect((await events(t)).filter((e) => e.kind === "level-marks").map((e) => e.name)).toEqual(["Priya"]);
    const report = (await t.mutation(api.sessions.end, { by: "correction" }))!;
    expect(report.master.levels).toBe(1);
  });

  test("a level marked again: its earlier marks come back exactly (explained ones stay explained)", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    await save(t, malik, 1, { zero: [3, 4] });
    await t.mutation(api.workbook.explain, { studentId: malik.id, unitId: malik.unitId, qs: [3], on: true, by: "evaluation" });
    const was = await work(t, malik.id);
    vi.setSystemTime(Date.now() + MIN);
    const back = await save(t, malik, 1);
    expect((await work(t, malik.id)).lv["1"].got).toBe(20);
    await t.mutation(api.workbook.uncorrect, back);
    const m = await work(t, malik.id);
    expect(m.lv["1"]).toEqual(was.lv["1"]);
    for (let q = 1; q <= 10; q++) expect(m.q[String(q)]).toEqual(was.q[String(q)]);
    // Only the second save's line left the history; the first is still there.
    expect((await events(t)).filter((e) => e.kind === "level-marks" || e.kind === "level-remarks").map((e) => e.kind)).toEqual(["level-marks"]);
  });

  test("'?' sent to Theory by that save goes with it; questions outside the level in the snapshot are ignored", async () => {
    const t = await setup();
    const vimal = await addMaster(t, "Vimal");
    const back = await save(t, vimal, 2, { dk: [15] });
    expect((await work(t, vimal.id)).q["15"]).toMatchObject({ dk: true, th: back.fixed });
    await t.mutation(api.workbook.uncorrect, {
      ...back,
      before: { ...back.before, q: { ...back.before.q, "40": { got: 0, max: 1, lost: true, t: 1 } } },
    });
    const m = await work(t, vimal.id);
    expect(m.q["15"]).toBeUndefined();
    expect(m.q["40"]).toBeUndefined();
    expect(m.lv["2"]).toBeUndefined();
  });
});

describe("Take back refused", () => {
  test("too late, corrected again since, nothing corrected, or someone already worked on the marks", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");

    // Nothing corrected.
    await expect(
      t.mutation(api.workbook.uncorrect, { studentId: malik.id, unitId: malik.unitId, level: 1, fixed: 1, before: { q: {} }, by: "correction" }),
    ).rejects.toThrow(/nothing to take back/);

    // Corrected again since (another phone): the older save can't be taken back over it.
    const first = await save(t, malik, 1, { zero: [2] });
    vi.setSystemTime(Date.now() + MIN);
    await save(t, malik, 1);
    await expect(t.mutation(api.workbook.uncorrect, first)).rejects.toThrow(/corrected again since/);

    // Over 30 minutes.
    const late = await save(t, malik, 2);
    vi.setSystemTime(Date.now() + 31 * MIN);
    await expect(t.mutation(api.workbook.uncorrect, late)).rejects.toThrow(/Too late/);

    // Evaluation explained one of its lost marks.
    const explained = await save(t, malik, 3, { zero: [24] });
    vi.setSystemTime(Date.now() + MIN);
    await t.mutation(api.workbook.explain, { studentId: malik.id, unitId: malik.unitId, qs: [24], on: true, by: "evaluation" });
    await expect(t.mutation(api.workbook.uncorrect, explained)).rejects.toThrow(/already explained Q24/);

    // Evaluation sent one to Theory.
    const sent = await save(t, malik, 4, { zero: [31] });
    vi.setSystemTime(Date.now() + MIN);
    await t.mutation(api.workbook.toTheory, { studentId: malik.id, unitId: malik.unitId, qs: [31], on: true, by: "evaluation" });
    await expect(t.mutation(api.workbook.uncorrect, sent)).rejects.toThrow(/Q31 already went to Theory/);
    // Nothing was changed by any refusal.
    expect((await work(t, malik.id)).lv["4"]).toMatchObject({ fixed: sent.fixed });
  });

  test("only Correction or Evaluation, signed in", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    const back = await save(t, malik, 1);
    await addPerson(t, { name: "Thilak", token: "theory-phone-token-0123456789abcdefghijklmnop", tabs: ["theory"] });
    const theory = asPhone(t, "theory-phone-token-0123456789abcdefghijklmnop");
    await expect(theory.mutation(api.workbook.uncorrect, { ...back, by: "theory" })).rejects.toThrow();
    const nobody = asPhone(t, "not-a-signed-in-phone-0123456789abcdefghijklmnop");
    await expect(nobody.mutation(api.workbook.uncorrect, back)).rejects.toThrow();
    expect((await work(t, malik.id)).lv["1"]).toMatchObject({ fixed: back.fixed });
  });
});

describe("levels done on paper before the app, and '?' on one part", () => {
  test("correcting Level 4 first: Levels 1–3 count as done before the app; he is on Level 5, not Level 1", async () => {
    const t = await setup();
    const who = await addMaster(t, "Priya");
    const r = await t.mutation(api.workbook.correct, { studentId: who.id, unitId: who.unitId, level: 4, items: items(4), by: "correction" });
    expect(r.pre).toEqual([1, 2, 3]);
    const m = await work(t, who.id);
    expect([1, 2, 3].map((n) => !!m.lv[String(n)]?.pre)).toEqual([true, true, true]);
    const { computeMaster } = await import("../convex/lib/master");
    const st = computeMaster(m, BOOK);
    expect(st.current?.n).toBe(5);
    expect(st.waiting).toEqual([]);
    expect([st.corrected, st.pre]).toEqual([1, 3]);
    // Marking Level 2 now (the paper turned up): it is corrected, no longer "before".
    await t.mutation(api.workbook.correct, { studentId: who.id, unitId: who.unitId, level: 2, items: items(2), by: "correction" });
    const m2 = await work(t, who.id);
    expect(m2.lv["2"]).toMatchObject({ fixed: expect.any(Number), got: 20 });
    expect(m2.lv["2"].pre).toBeUndefined();
    // Every level corrected or done before: the unit is finished.
    for (const n of [5, 6, 7, 8]) await t.mutation(api.workbook.correct, { studentId: who.id, unitId: who.unitId, level: n, items: items(n), by: "correction" });
    expect(computeMaster(await work(t, who.id), BOOK).finished).toBe(true);
  });

  test("Take back of that save, and an undone hand-in, put the earlier levels back to no record", async () => {
    const t = await setup();
    const who = await addMaster(t, "Malik");
    const back = await save(t, who, 3);
    expect(!!(await work(t, who.id)).lv["1"]?.pre).toBe(true);
    await t.mutation(api.workbook.uncorrect, back);
    const m = await work(t, who.id);
    expect([m.lv["1"], m.lv["2"], m.lv["3"]]).toEqual([undefined, undefined, undefined]);
    // Handed in (Later) on Level 2 marks Level 1; undoing the hand-in takes it back.
    await t.mutation(api.workbook.levelDone, { studentId: who.id, unitId: who.unitId, level: 2, by: "correction" });
    expect(!!(await work(t, who.id)).lv["1"]?.pre).toBe(true);
    await t.mutation(api.workbook.undoDone, { studentId: who.id, unitId: who.unitId, level: 2, by: "correction" });
    expect((await work(t, who.id)).lv).toEqual({});
  });

  test("'?' on one part: the parts he answered keep their marks, the question goes to Theory with the part's name", async () => {
    const t = await setup();
    const who = await addMaster(t, "Vimal");
    // Level 8 = Q56 (4 marks) and Q57 (11 marks). Q56: part ii left blank, part i right (2 of 4).
    const it = [
      { q: 56, got: 2, dk: true, dkp: ["ii"] },
      { q: 57, got: 11 },
    ];
    const r = await t.mutation(api.workbook.correct, { studentId: who.id, unitId: who.unitId, level: 8, items: it, by: "correction" });
    expect(r.got).toBe(13);
    expect(r.theory).toEqual([56]);
    const m = await work(t, who.id);
    expect(m.q["56"]).toMatchObject({ got: 2, max: 4, lost: true, dk: true, dkp: ["ii"], tb: "correction" });
    // Refused: a blank part with full marks; a whole "?" with marks; blank parts without "?".
    const bad = async (x: { q: number; got: number; dk?: boolean; dkp?: string[] }) =>
      await expect(t.mutation(api.workbook.correct, { studentId: who.id, unitId: who.unitId, level: 8, items: [x, { q: 57, got: 11 }], by: "correction" })).rejects.toThrow();
    await bad({ q: 56, got: 4, dk: true, dkp: ["ii"] });
    await bad({ q: 56, got: 2, dk: true });
    await bad({ q: 56, got: 2, dkp: ["ii"] });
    // The same in a Focus draft (kept as he marks).
    await t.mutation(api.workbook.uncorrect, { studentId: who.id, unitId: who.unitId, level: 8, fixed: m.lv["8"].fixed!, before: { q: {} }, by: "correction" });
    await t.mutation(api.focus.mark, { studentId: who.id, unitId: who.unitId, level: 8, set: [{ q: 56, g: 2, dk: true, dkp: ["ii"], p: [2, 0] }], by: "correction" });
    const d = await t.run(async (ctx) => (await ctx.db.query("drafts").collect())[0]);
    expect(d.q["56"]).toEqual({ g: 2, dk: true, dkp: ["ii"], p: [2, 0] });
  });
});
