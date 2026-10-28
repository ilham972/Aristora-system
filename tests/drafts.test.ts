// Focus drafts (convex/focus.ts): a workbook level marked part of the way is kept on the server, question by question,
// until the level is saved. It counts nowhere meanwhile, refuses bad marks, and stale drafts clean themselves up.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { MState } from "../convex/lib/master";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const START = new Date("2026-10-29T15:00:00+05:30").getTime();

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type T = Awaited<ReturnType<typeof setup>>;

async function unit(t: T, key: string) {
  return await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
}
async function addMaster(t: T, name: string) {
  const unitId = await unit(t, "G7-U08");
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
    return { s, m: (p?.m ?? { q: {}, lv: {} }) as MState };
  });
}
const rows = (t: T) => t.run(async (ctx) => await ctx.db.query("drafts").collect());
/** Full marks for every question of a G7 U08 Part I level (2 marks each). */
const full = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ q: from + i, got: 2 }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a level marked part of the way", () => {
  test("kept question by question, merged, cleared, and gone when empty; it counts nowhere", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    const at = { studentId: malik.id, unitId: malik.unitId, level: 3, by: "correction" };
    // He marked Q21-23 (Q22 blank, Q23 one part lost), then stopped.
    await t.mutation(api.focus.mark, { ...at, set: [{ q: 21, g: 2 }, { q: 22, g: 0, dk: true }, { q: 23, g: 1, p: [1, 0] }] });
    let all = await t.query(api.focus.drafts, {});
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ studentId: malik.id, level: 3, q: { "21": { g: 2 }, "22": { g: 0, dk: true }, "23": { g: 1, p: [1, 0] } } });
    // Later (another phone): Q23 changed, Q24 added, Q21 forgotten.
    vi.setSystemTime(Date.now() + 60_000);
    await t.mutation(api.focus.mark, { ...at, set: [{ q: 23, g: 2 }, { q: 24, g: 0 }], clear: [21] });
    all = await t.query(api.focus.drafts, {});
    expect(all[0].q).toEqual({ "22": { g: 0, dk: true }, "23": { g: 2 }, "24": { g: 0 } });
    expect(all[0].updatedAt).toBe(Date.now());
    // Nothing counts yet: no level marks, no lost marks for Evaluation, no "corrected" line, but he is active.
    const { s, m } = await work(t, malik.id);
    expect(m.lv["3"]).toBeUndefined();
    expect(m.q["24"]).toBeUndefined();
    expect(s.lastActivityAt).toBe(Date.now());
    const kinds = (await t.run(async (ctx) => await ctx.db.query("events").collect())).map((e) => e.kind);
    expect(kinds.filter((k) => k.startsWith("level"))).toEqual([]);
    // Every question cleared: the draft is gone.
    await t.mutation(api.focus.mark, { ...at, set: [], clear: [22, 23, 24] });
    expect(await rows(t)).toHaveLength(0);
  });

  test("bad marks are refused, and a level already corrected takes no draft", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    const at = { studentId: malik.id, unitId: malik.unitId, level: 3, by: "correction" };
    await expect(t.mutation(api.focus.mark, { ...at, set: [{ q: 31, g: 2 }] })).rejects.toThrow(/not in Level 3/);
    await expect(t.mutation(api.focus.mark, { ...at, set: [{ q: 21, g: 3 }] })).rejects.toThrow(/0 to 2/);
    await expect(t.mutation(api.focus.mark, { ...at, set: [{ q: 21, g: 1, dk: true }] })).rejects.toThrow(/couldn't start it/);
    await expect(t.mutation(api.focus.mark, { ...at, set: [{ q: 21, g: 2, p: [1, 0] }] })).rejects.toThrow(/don't add up/);
    await expect(t.mutation(api.focus.mark, { ...at, level: 9, set: [{ q: 21, g: 2 }] })).rejects.toThrow(/not in this workbook/);
    await t.mutation(api.workbook.correct, { studentId: malik.id, unitId: malik.unitId, level: 3, items: full(21, 30), by: "correction" });
    await expect(t.mutation(api.focus.mark, { ...at, set: [{ q: 21, g: 2 }] })).rejects.toThrow(/already corrected/);
    expect(await rows(t)).toHaveLength(0);
  });

  test("a draft whose level was corrected elsewhere, or of a book he left, is cleaned up by his next mark", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    const at = { studentId: malik.id, unitId: malik.unitId, by: "correction" };
    await t.mutation(api.focus.mark, { ...at, level: 1, set: [{ q: 1, g: 2 }] });
    await t.mutation(api.focus.mark, { ...at, level: 2, set: [{ q: 11, g: 2 }] });
    // Level 1 corrected on the Correction tab: its draft is stale.
    await t.mutation(api.workbook.correct, { studentId: malik.id, unitId: malik.unitId, level: 1, items: full(1, 10), by: "correction" });
    await t.mutation(api.focus.mark, { ...at, level: 2, set: [{ q: 12, g: 1 }] });
    expect((await rows(t)).map((d) => [d.level, Object.keys(d.q)])).toEqual([[2, ["11", "12"]]]);
  });

  test("drop forgets a level's draft (saved, or thrown away); only Correction or Evaluation, signed in", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    const priya = await addMaster(t, "Priya");
    await t.mutation(api.focus.mark, { studentId: malik.id, unitId: malik.unitId, level: 3, set: [{ q: 21, g: 2 }], by: "correction" });
    await t.mutation(api.focus.mark, { studentId: priya.id, unitId: priya.unitId, level: 1, set: [{ q: 1, g: 2 }], by: "correction" });
    expect(await t.mutation(api.focus.drop, { studentId: malik.id, unitId: malik.unitId, level: 3, by: "correction" })).toBe(true);
    expect((await rows(t)).map((d) => d.studentId)).toEqual([priya.id]);

    const THEORY = "theory-phone-token-0123456789abcdefghijklmnop";
    await addPerson(t, { name: "Thilak", token: THEORY, tabs: ["theory"] });
    const theory = asPhone(t, THEORY);
    await expect(theory.query(api.focus.drafts, {})).rejects.toThrow();
    await expect(
      theory.mutation(api.focus.mark, { studentId: priya.id, unitId: priya.unitId, level: 1, set: [{ q: 2, g: 2 }], by: "theory" }),
    ).rejects.toThrow();
    await expect(theory.mutation(api.focus.drop, { studentId: priya.id, unitId: priya.unitId, level: 1, by: "theory" })).rejects.toThrow();
    const nobody = asPhone(t, "not-a-signed-in-phone-0123456789abcdefghijklmnop");
    await expect(nobody.query(api.focus.drafts, {})).rejects.toThrow();
    expect(await rows(t)).toHaveLength(1);
  });
});
