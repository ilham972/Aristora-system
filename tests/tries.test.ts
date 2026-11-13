// Teaching by skill (13 Nov 2026, his "build completely in the app as complete system"; convex/lib/path.ts,
// convex/tries.ts): a question that lost marks goes second try → lesson of the skill he lacks → try after the lesson →
// one-to-one. Made-up skills on the G7 U08 workbook (the repo is public).

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { KNOWN_WORKBOOKS, levelOutOf } from "../convex/lib/book";
import type { MState } from "../convex/lib/master";
import { bySkill, needsSkill, paperNo, pathOf, provenOf, questionSkills, shownIn, skillOrder } from "../convex/lib/path";
import type { SkillTag } from "../convex/lib/skills";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const fresh = () => convexTest(schema, modules);
const BOOK = KNOWN_WORKBOOKS[0].data;
const START = new Date("2026-11-13T16:00:00+05:30").getTime();
const MIN = 60_000;
const S = (n: number) => `G7-U08-S${n}`;
const MALA = "mala-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const NILA = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";

/** Made-up tags: Q1–4 need S1; Q5 needs S2 and S1; Q6–8 S2; Q9–20 S3; Q51's parts i (S1) and ii (S5, and S4: nowhere else). */
const TAGS: SkillTag[] = [
  ...[1, 2, 3, 4].map((q) => ({ q, s: S(1) })),
  { q: 5, s: S(2), x: [S(1)] },
  ...[6, 7, 8].map((q) => ({ q, s: S(2) })),
  ...[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((q) => ({ q, s: S(3) })),
  { q: 51, p: "i", s: S(1) },
  { q: 51, p: "ii", s: S(5), x: [S(4)] },
];
const SKILLS = [1, 2, 3, 4, 5].map((n) => ({ id: S(n), ta: `திறன் ${n}`, en: `A made-up skill ${n}` }));

describe("the rules (convex/lib/path.ts)", () => {
  const lv = (ns: number[]) => Object.fromEntries(ns.map((n) => [String(n), { fixed: 1, got: 0 }]));
  const ok = { got: 2, max: 2, lost: false, t: 1 };
  const no = { got: 0, max: 2, lost: true, t: 1 };

  test("a skill's place among all skills, and its number on a paper", () => {
    expect(skillOrder("G8-U04-S7")).toEqual([8, 4, 7]);
    expect(skillOrder("OL-U44-S2")).toEqual([12, 44, 2]);
    expect(["G8-U05-S1", "G10-U01-S1", "G8-U04-S10", "G8-U04-S2", "G7-U30-S9"].sort(bySkill)).toEqual(["G7-U30-S9", "G8-U04-S2", "G8-U04-S10", "G8-U05-S1", "G10-U01-S1"]);
    expect(paperNo("G8-U04", "G8-U04-S7")).toBe("7");
    expect(paperNo("G8-U05", "G8-U04-S2")).toBe("4·2");
    expect(questionSkills(TAGS, 5)).toEqual([S(1), S(2)]);
    expect(questionSkills(TAGS, 51)).toEqual([S(1), S(4), S(5)]);
    expect(questionSkills(TAGS, 51, ["ii"])).toEqual([S(4), S(5)]);
    expect(questionSkills(TAGS, 99)).toEqual([]);
  });

  test("shown: right three times and twice as often as lost; a weak student's easy ones prove nothing", () => {
    const m: MState = { lv: lv([1]), q: { 1: ok, 2: ok, 3: no, 4: no, 5: no, 6: ok, 7: ok, 8: ok } };
    const shown = shownIn(m, BOOK, TAGS);
    expect(shown.get(S(1))).toEqual({ right: 2, lost: 3 });
    expect(shown.get(S(2))).toEqual({ right: 3, lost: 1 });
    expect([...provenOf(shown)]).toEqual([S(2)]);
    // Three right but four lost: not shown.
    expect(provenOf(new Map([["a", { right: 3, lost: 2 }]])).has("a")).toBe(false);
    expect(provenOf(new Map([["a", { right: 4, lost: 2 }]])).has("a")).toBe(true);
    // A level not corrected yet says nothing; parts known to be wrong count alone.
    expect(shownIn({ lv: {}, q: { 1: ok } }, BOOK, TAGS).size).toBe(0);
    const part: MState = { lv: lv([6]), q: { 51: { ...no, max: 7, rp: ["ii"] } } };
    expect([...shownIn(part, BOOK, TAGS).keys()].sort()).toEqual([S(4), S(5)]);
  });

  test("the four steps: fix, lesson (the lowest skill first), redo, stuck", () => {
    const m: MState = { lv: lv([1]), q: { 1: ok, 2: ok, 3: no, 4: { ...no, rt: 5 }, 5: { ...no, rt: 6 }, 6: ok, 7: ok, 8: ok, 9: { ...no, x: 3 }, 10: { ...no, th: 3 } } };
    expect(pathOf(m, BOOK, TAGS)).toEqual([
      { q: 3, n: 1, step: "fix", skills: [], parts: [], since: 1 },
      { q: 4, n: 1, step: "lesson", skills: [S(1)], parts: [], since: 5 },
      // Q5 needs S2 too, but he has shown S2 (Q6–8): only S1 is suspected.
      { q: 5, n: 1, step: "lesson", skills: [S(1)], parts: [], since: 6 },
    ]);
    // S2 not shown (Q8 lost too): both are suspected, the lower one is taught first; one taught, the other still waits.
    const weak: MState = { ...m, q: { ...m.q, 8: no } };
    expect(pathOf(weak, BOOK, TAGS)[2].skills).toEqual([S(1), S(2)]);
    expect(pathOf({ ...weak, sk: { [S(1)]: 9 } }, BOOK, TAGS)[2]).toMatchObject({ q: 5, step: "lesson", skills: [S(2)] });
    // His lesson given: he does them again. Wrong after it: one-to-one.
    const taught: MState = { ...m, sk: { [S(1)]: 9 } };
    expect(pathOf(taught, BOOK, TAGS).map((x) => [x.q, x.step, x.since])).toEqual([[3, "fix", 1], [4, "redo", 9], [5, "redo", 9]]);
    expect(pathOf({ ...taught, q: { ...m.q, 4: { ...no, rt: 5, lt: 12 } } }, BOOK, TAGS)[1]).toMatchObject({ q: 4, step: "stuck", since: 12 });
    // Wrong twice on a question whose every skill he has shown: its own first skill's lesson all the same.
    const strong: MState = { lv: lv([1]), q: { 1: ok, 2: ok, 3: ok, 5: { ...no, rt: 4 }, 6: ok, 7: ok, 8: ok } };
    expect(pathOf(strong, BOOK, TAGS)).toEqual([{ q: 5, n: 1, step: "lesson", skills: [S(2)], parts: [], since: 4 }]);
    // A question with no skill at all (its tags were lost): nothing to teach, one-to-one.
    expect(pathOf({ lv: lv([4]), q: { 31: { ...no, rt: 4 } } }, BOOK, TAGS)).toEqual([{ q: 31, n: 4, step: "stuck", skills: [], parts: [], since: 4 }]);
    expect(needsSkill(TAGS, S(4))).toBe(true);
    expect(needsSkill(TAGS, "G7-U08-S9")).toBe(false);
  });
});

describe("in class (convex/tries.ts)", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u08: Id<"units">;
  let kumar: Id<"students">;
  let now = START;
  const tick = (min = 1) => vi.setSystemTime((now += min * MIN));
  const m = () =>
    raw.run(async (ctx) => {
      const p = (await ctx.db.query("progress").collect()).find((x) => x.studentId === kumar && x.unitId === u08 && x.stage === "master")!;
      return p.m as MState;
    });
  const steps = async () => {
    const st = await m();
    return Object.fromEntries(pathOf(st, BOOK, TAGS).map((x) => [x.q, x.step]));
  };

  /** A level corrected: these questions lost every mark, the others got theirs. */
  async function correct(level: number, lost: number[]) {
    const l = BOOK.levels.find((x) => x.n === level)!;
    const each = levelOutOf(BOOK, l)!;
    const items = Array.from({ length: l.to - l.from + 1 }, (_, i) => ({ q: l.from + i, got: lost.includes(l.from + i) ? 0 : each[i] }));
    await t.mutation(api.workbook.correct, { studentId: kumar, unitId: u08, level, items, by: "correction" });
  }

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime((now = START));
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u08 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
    kumar = await t.mutation(api.students.add, { name: "Kumar", grade: 7, term: 1, stage: "master", unitId: u08 });
    await t.mutation(api.students.setPresent, { id: kumar, present: true });
    await raw.run(async (ctx) => {
      await ctx.db.insert("skillTags", { unitId: u08, stage: "master", skills: SKILLS, tags: TAGS, by: "Owner", updatedAt: START });
    });
    await addPerson(raw, { name: "Mala", token: MALA, tabs: ["correction"] });
    await addPerson(raw, { name: "Nila", token: NILA, tabs: ["theory"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test("second try, the lesson, the try after it, one-to-one; the marks; who may", async () => {
    const mala = asPhone(raw, MALA);
    const nila = asPhone(raw, NILA);
    await correct(1, [3, 4, 5]);
    expect(await steps()).toEqual({ 3: "fix", 4: "fix", 5: "fix" });
    expect((await m()).lv["1"].got).toBe(14);
    // The tags reach every teacher's phone; nobody else's.
    expect((await nila.query(api.tries.tags, {}))[0]).toMatchObject({ key: "G7-U08", grade: 7, skills: SKILLS });
    await expect(raw.query(api.tries.tags, {})).rejects.toThrow();

    // The second try. Right: half the marks, explained, closed. A teacher without Correction or Evaluation: no.
    tick();
    await expect(nila.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 3, right: true })).rejects.toThrow();
    expect(await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 3, right: true, by: "correction" })).toMatchObject({ add: 1, step: "closed", write: [] });
    let st = await m();
    expect(st.q["3"]).toMatchObject({ got: 0, lost: true, rt: now, rg: 2, rh: 1, x: now });
    expect(st.lv["1"].got).toBe(15);
    await expect(mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 3, right: true })).rejects.toThrow(/no try to mark/);
    await expect(mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 1, right: true })).rejects.toThrow(/no try to mark/);

    // Wrong again: she is told the numbers to write. Q5 needs S2 too, but his Q6–8 showed S2.
    tick();
    expect(await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 4, right: false })).toMatchObject({ add: 0, step: "lesson", write: ["1"] });
    expect(await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 5, right: false })).toMatchObject({ step: "lesson", write: ["1"] });
    expect((await m()).q["4"]).toMatchObject({ rt: now, rg: 0 });
    expect((await m()).q["4"].x).toBeUndefined();
    expect(await steps()).toEqual({ 4: "lesson", 5: "lesson" });

    // The skill teacher's Done: Correction alone may not; a skill that isn't one: no.
    tick(10);
    await expect(mala.mutation(api.tries.taught, { skill: S(1), studentIds: [kumar] })).rejects.toThrow();
    await expect(nila.mutation(api.tries.taught, { skill: "G7-U08-S9", studentIds: [kumar] })).rejects.toThrow(/not in the app/);
    const done = await nila.mutation(api.tries.taught, { skill: S(1), studentIds: [kumar], by: "theory" });
    expect(done).toMatchObject({ at: now, done: [{ name: "Kumar" }], errors: [] });
    expect((await m()).sk).toEqual({ [S(1)]: now });
    expect(await steps()).toEqual({ 4: "redo", 5: "redo" });
    const taughtAt = now;

    // The try after the lesson. Right: the same half marks, explained. Wrong: one-to-one.
    tick();
    expect(await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 4, right: true })).toMatchObject({ add: 1, step: "closed" });
    st = await m();
    expect(st.q["4"]).toMatchObject({ rt: now, rg: 2, rh: 1, x: now, lt: now });
    expect(st.lv["1"].got).toBe(16);
    expect(await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 5, right: false })).toMatchObject({ add: 0, step: "stuck", write: [] });
    expect(await steps()).toEqual({ 5: "stuck" });

    // Taken back within five minutes: as before. Later: no.
    await mala.mutation(api.tries.back, { studentId: kumar, unitId: u08, q: 4 });
    st = await m();
    expect(st.q["4"].x).toBeUndefined();
    expect(st.q["4"].lt).toBeUndefined();
    expect(st.q["4"].rh).toBeUndefined();
    expect(st.q["4"].rb).toBeUndefined();
    expect(st.q["4"]).toMatchObject({ rt: taughtAt - 10 * MIN, rg: 0 });
    expect(st.lv["1"].got).toBe(15);
    await mala.mutation(api.tries.back, { studentId: kumar, unitId: u08, q: 5 });
    expect(await steps()).toEqual({ 4: "redo", 5: "redo" });
    tick(6);
    await expect(mala.mutation(api.tries.back, { studentId: kumar, unitId: u08, q: 4 })).rejects.toThrow(/Too late/);
    await expect(nila.mutation(api.tries.untaught, { skill: S(1), studentIds: [kumar], at: taughtAt })).rejects.toThrow(/Too late/);

    // One-to-one's Explained closes a stuck question, as on every page.
    expect(await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 5, right: false })).toMatchObject({ step: "stuck" });
    await t.mutation(api.workbook.explain, { studentId: kumar, unitId: u08, qs: [5], on: true, by: "evaluation" });
    expect(await steps()).toEqual({ 4: "redo" });

    // The history says each step.
    const lines = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("try") || e.kind.startsWith("skill-lesson")).map((e) => [e.kind, e.q, e.value].filter((x) => x !== undefined).join(" ")));
    expect(lines).toEqual(["try 3 second right 1", "try 4 second wrong 0", "try 5 second wrong 0", "skill-lesson 1 A made-up skill 1", "try 4 lesson right 1", "try 5 lesson wrong 0", "try-undo 4", "try-undo 5", "try 5 lesson wrong 0"]);
  });

  test("Undo of a lesson; a second try taken back; a long question's parts; a book with no skills", async () => {
    const mala = asPhone(raw, MALA);
    const nila = asPhone(raw, NILA);
    // (Q3 lost too: with three of S1's four right he would have shown the skill, and Q4 would be one-to-one's.)
    await correct(1, [3, 4]);
    tick();
    await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 4, right: false });
    tick();
    const done = await nila.mutation(api.tries.taught, { skill: S(1), studentIds: [kumar] });
    expect(await steps()).toEqual({ 3: "fix", 4: "redo" });
    // A level corrected after his lesson keeps the lesson (every copy of his marks carries it).
    await correct(2, [11]);
    expect((await m()).sk).toEqual({ [S(1)]: done.at });
    expect(await nila.mutation(api.tries.untaught, { skill: S(1), studentIds: [kumar], at: done.at })).toEqual({ n: 1 });
    expect((await m()).sk).toEqual({});
    expect(await steps()).toEqual({ 3: "fix", 4: "lesson", 11: "fix" });
    // The second try itself taken back: he tries again.
    await mala.mutation(api.tries.back, { studentId: kumar, unitId: u08, q: 4 });
    expect((await m()).q["4"].rt).toBeUndefined();
    expect(await steps()).toEqual({ 3: "fix", 4: "fix", 11: "fix" });
    tick();
    // A right second try taken back gives its mark back.
    await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 4, right: true });
    expect((await m()).lv["1"].got).toBe(17);
    await mala.mutation(api.tries.back, { studentId: kumar, unitId: u08, q: 4 });
    expect((await m()).lv["1"].got).toBe(16);
    expect((await m()).q["4"].x).toBeUndefined();

    // A long question: the parts still wrong decide the lesson. Q51 (ii) needs S5 and S4, shown nowhere yet.
    const l51 = BOOK.levels.find((x) => 51 >= x.from && 51 <= x.to)!;
    await correct(l51.n, [51]);
    tick();
    await expect(mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 51, right: false, parts: ["iii"] })).rejects.toThrow(/no such part/);
    expect(await mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 51, right: false, parts: ["ii"] })).toMatchObject({ step: "lesson", write: ["4", "5"] });
    expect((await m()).q["51"].rp).toEqual(["ii"]);
    tick();
    await nila.mutation(api.tries.taught, { skill: S(4), studentIds: [kumar] });
    expect(pathOf(await m(), BOOK, TAGS).find((x) => x.q === 51)).toMatchObject({ step: "lesson", skills: [S(5)], parts: ["ii"] });
    // The same lesson twice for him: nothing to write.
    expect((await nila.mutation(api.tries.taught, { skill: S(4), studentIds: [kumar] })).errors[0]).toMatch(/Kumar has no workbook that needs it \(or got this lesson already\)/);

    // A workbook whose questions carry no skills keeps the way of before.
    await raw.run(async (ctx) => {
      for (const r of await ctx.db.query("skillTags").collect()) await ctx.db.delete(r._id);
    });
    await expect(mala.mutation(api.tries.mark, { studentId: kumar, unitId: u08, q: 4, right: true })).rejects.toThrow(/no skills in the app yet/);
  });
});
