// The skill book as the unit's workbook (23 Nov 2026, the founder: "skill book is the workbook, we can delete old
// data"; the whole unit at once): renumbered as printed, levels by skill named "2·1", its things following the new
// numbers, the students' old marks gone and their XP kept.
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { checkMaster, lvLabel, type MasterData } from "../convex/lib/book";
import { xpItems } from "../convex/lib/family";
import { skillLevels, skillWorkbook, storedLevels } from "../convex/lib/skillBook";
import { skillId } from "../convex/lib/skills";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const UNIT = "G7-U08";
const S = (n: number) => skillId(UNIT, n);
const T0 = Date.UTC(2026, 9, 5, 5);

// Part I 1–14 (2 marks each), Part II 15–18 (cards).
const DATA: MasterData = {
  kind: "master",
  parts: [
    { id: "I", from: 1, to: 14, kind: "short", each: 2 },
    { id: "II", from: 15, to: 18, kind: "cards" },
  ],
  levels: [
    { n: 1, from: 1, to: 10, max: 20 },
    { n: 2, from: 11, to: 14, max: 8 },
    { n: 3, from: 15, to: 18, max: 20 },
  ],
  marks: { "15": 5, "16": 5, "17": 5, "18": 5 },
  free: [3],
};
// S1: 1–4 and the Q15 card; S2: 5–14 and the Q16, Q17 cards (30 marks: a big skill, 2·1 and 2·2), Q8 needs S1+S2;
// S3: the Q18 card.
const TAGS = [
  ...[1, 2, 3, 4, 15].map((q) => ({ q, s: S(1) })),
  ...[5, 6, 7, 9, 10, 11, 12, 13, 14, 16, 17].map((q) => ({ q, s: S(2) })),
  { q: 8, s: S(2), x: [S(1)] },
  { q: 18, s: S(3) },
];
const SKILLS = [1, 2, 3].map((n) => ({ id: S(n), ta: `திறன் ${n}`, en: `Skill ${n}`, eg: n === 1 ? 1 : n === 2 ? 5 : 18 }));

async function setup() {
  const t = fresh();
  const O = await asOwner(t);
  const ids = await t.run(async (ctx) => {
    const unitId = await ctx.db.insert("units", { grade: 7, code: "U08", key: UNIT, term: 1, order: 8, en: "Directed numbers", ta: "திசை கொண்ட எண்கள்" });
    await ctx.db.insert("books", { unitId, stage: "master", data: DATA, updatedAt: T0, keyCount: 18, qCount: 18 });
    await ctx.db.insert("skillTags", { unitId, stage: "master", skills: SKILLS, tags: TAGS, by: "chat", updatedAt: T0 });
    const answers = Array.from({ length: 18 }, (_, i) => (i < 14 ? { q: i + 1, a: `A${i + 1}` } : { q: i + 1, parts: [{ p: "", a: `B${i + 1}`, m: 5 }] }));
    await ctx.db.insert("keys", { unitId, stage: "master", answers, updatedAt: T0 });
    for (let q = 1; q <= 18; q++) await ctx.db.insert("questions", { unitId, stage: "master", q, html: `<div class="si"><span class="qn">${q}</span>question ${q}</div>` });
    await ctx.db.insert("phoneFixes", { unitId, q: 12, p: "", a: "36", by: "Nila", at: T0 });
    const kumar = await ctx.db.insert("students", { name: "Kumar S.", archived: false, present: false, idleMs: 0, grade: 7, unitId });
    // Level 1 corrected (17 / 20), Level 3 handed in, Q2 won back on a second try: his XP from this book.
    const q: Record<string, { lost: boolean; t: number; got?: number; max?: number; rt?: number; rg?: number }> = {};
    for (let n = 1; n <= 10; n++) q[String(n)] = { lost: n === 2, t: T0, got: n === 2 ? 0 : 2, max: 2 };
    q["2"] = { ...q["2"], rt: T0 + 86400000, rg: 2 };
    const pid = await ctx.db.insert("progress", {
      studentId: kumar,
      unitId,
      stage: "master",
      marks: {},
      m: { q, lv: { "1": { done: T0, fixed: T0 + 3600000, got: 17 }, "3": { done: T0 + 7200000 } } },
      startedAt: T0,
      updatedAt: T0,
    });
    await ctx.db.insert("drafts", { studentId: kumar, unitId, level: 2, q: {}, updatedAt: T0 });
    return { unitId, kumar, pid };
  });
  return { t, O, ...ids };
}

/** The order the T page shows (no students' marks counted here: fewer than five). */
const orderOf = () => skillLevels(UNIT, DATA, TAGS, SKILLS.map((x) => x.id)).levels.filter((l) => l.qs.length).flatMap((l) => l.qs);

describe("the skill book as the workbook (pure)", () => {
  test("renumbered as printed; a level a strip, named; Part I / II runs; marks, free, old numbers kept", () => {
    const { levels, number } = skillLevels(UNIT, DATA, TAGS, SKILLS.map((x) => x.id));
    const made = skillWorkbook(DATA, levels.filter((l) => l.qs.length), number);
    if (typeof made === "string") throw new Error(made);
    const d = made.data;
    expect(checkMaster(d)).toEqual([]);
    expect(d.skills).toBe(true);
    // S1 = Q1–4 (Part I) + the Q15 card; S2 = its 9 short questions (18: the next card would pass 20), then its two
    // cards and Q8 (S1+S2) = 12; S3 = one card.
    expect(d.levels.map((l) => [lvLabel(l), l.from, l.to, l.max, l.skill])).toEqual([
      ["1", 1, 5, 13, S(1)],
      ["2·1", 6, 14, 18, S(2)],
      ["2·2", 15, 17, 12, S(2)],
      ["3", 18, 18, 5, S(3)],
    ]);
    expect(d.parts.map((p) => [p.id, p.from, p.to])).toEqual([
      ["I", 1, 4],
      ["II", 5, 5],
      ["I", 6, 14],
      ["II", 15, 16],
      ["I", 17, 17],
      ["II", 18, 18],
    ]);
    expect(d.was).toEqual(orderOf());
    expect(d.marks).toEqual({ "5": 5, "15": 5, "16": 5, "18": 5 });
    expect(d.free).toEqual([made.map.get(3)]);
    // Read back as stored: the same levels and parts the T page and the PDF show.
    const back = storedLevels(UNIT, d, TAGS.map((x) => ({ ...x, q: made.map.get(x.q)! })));
    expect(back.levels.map((l) => [l.n, l.qs.length, l.parts.length, l.max])).toEqual([
      [1, 5, 1, 13],
      [2, 12, 2, 30],
      [3, 1, 1, 5],
    ]);
    // Its groups: S2 alone, then S1+S2 (Q8 last), read from the tags in the new numbers.
    expect(back.levels[1].groups.map((g) => [g.skills.length, g.qs.length])).toEqual([
      [1, 11],
      [2, 1],
    ]);
  });

  test("refused: a question with no skill, a mark not known, a book that is the skill book already", () => {
    const some = TAGS.filter((x) => x.q !== 9);
    const a = skillLevels(UNIT, DATA, some, SKILLS.map((x) => x.id));
    expect(skillWorkbook(DATA, a.levels.filter((l) => l.qs.length), a.number)).toMatch(/Q9 has no skill yet/);
    const blind: MasterData = { ...DATA, marks: { "15": 5 } };
    const b = skillLevels(UNIT, blind, TAGS, SKILLS.map((x) => x.id));
    expect(skillWorkbook(blind, b.levels.filter((l) => l.qs.length), b.number)).toMatch(/marks aren't in the app/);
    const c = skillLevels(UNIT, DATA, TAGS, SKILLS.map((x) => x.id));
    expect(skillWorkbook({ ...DATA, skills: true }, c.levels, c.number)).toMatch(/already/);
  });
});

describe("skillBook.useAsWorkbook", () => {
  test("the owner switches: everything follows the new numbers, the old marks go, his XP stays", async () => {
    const { t, O, unitId, kumar, pid } = await setup();
    const xpWas = await t.run(async (ctx) => xpItems([(await ctx.db.get(pid))!]).reduce((a, x) => a + x.xp, 0));
    expect(xpWas).toBe(19); // 17 + the second try's 2
    const order = orderOf();
    const r = await O.mutation(api.skillBook.useAsWorkbook, { unitId, order, by: "owner" });
    expect(r).toEqual({ levels: 4, questions: 18, students: 1 });
    const after = await t.run(async (ctx) => ({
      book: (await ctx.db.query("books").collect())[0],
      key: (await ctx.db.query("keys").collect())[0],
      qs: await ctx.db.query("questions").collect(),
      tags: (await ctx.db.query("skillTags").collect())[0],
      fix: (await ctx.db.query("phoneFixes").collect())[0],
      row: (await ctx.db.get(pid))!,
      drafts: await ctx.db.query("drafts").collect(),
      events: (await ctx.db.query("events").collect()).filter((e) => e.kind === "book-skills"),
    }));
    const map = new Map(order.map((q, i) => [q, i + 1]));
    const d = after.book.data as MasterData;
    expect(d.skills).toBe(true);
    expect(d.levels.map(lvLabel)).toEqual(["1", "2·1", "2·2", "3"]);
    // The key and the printed questions moved with their questions.
    for (const a of after.key.answers) expect(a.a ?? a.parts?.[0].a).toMatch(new RegExp(`^[AB]${order[a.q - 1]}$`));
    for (const x of after.qs) expect(x.html).toContain(`question ${order[x.q - 1]}<`);
    expect(after.tags.tags.find((x) => x.q === map.get(8))).toMatchObject({ s: S(2), x: [S(1)] });
    expect(after.tags.skills.map((x) => x.eg)).toEqual([map.get(1), map.get(5), map.get(18)]);
    expect(after.fix.q).toBe(map.get(12));
    // His marks and levels in the old numbers went; the row keeps his XP and learning days; drafts went.
    expect(after.row.m?.q).toEqual({});
    expect(after.row.m?.lv).toEqual({});
    expect(xpItems([after.row]).reduce((a, x) => a + x.xp, 0)).toBe(xpWas);
    expect(after.row.m?.x0?.filter((x) => x.d).length).toBe(2); // Level 1 corrected + Level 3 handed in
    expect(after.drafts).toEqual([]);
    expect(after.events).toHaveLength(1);
    // The family app's road names the levels as the book prints them.
    const again = await t.run(async (ctx) => await ctx.db.get(kumar));
    expect(again?.unitId).toBe(unitId);
    // Once is enough; an upload of the old book can't bring the old numbers back.
    await expect(O.mutation(api.skillBook.useAsWorkbook, { unitId, order, by: "owner" })).rejects.toThrow(/already/);
    await expect(
      O.mutation(api.catalog.saveWorkbook, { unitId, parts: [{ id: "I", to: 14, each: 2 }, { id: "II", to: 18 }], levels: [{ to: 10, max: 20 }, { to: 14, max: 8 }, { to: 18, max: 20 }], replace: true }),
    ).rejects.toThrow(/its skill book now/);
    await expect(O.mutation(api.catalog.saveQuestions, { unitId, stage: "master", first: true, items: [{ q: 1, html: "<p>x</p>" }] })).rejects.toThrow(/its skill book now/);
  });

  test("refused: an order the T page didn't show, and anyone but the owner", async () => {
    const { t, O, unitId } = await setup();
    const order = orderOf();
    await expect(O.mutation(api.skillBook.useAsWorkbook, { unitId, order: [...order].reverse() })).rejects.toThrow(/changed since this page opened/);
    await addPerson(t, { name: "Nila", token: "nila-books-phone-token-0123456789abcdefghijk", tabs: ["correction"], can: ["books"] });
    const N = asPhone(t, "nila-books-phone-token-0123456789abcdefghijk");
    await expect(N.mutation(api.skillBook.useAsWorkbook, { unitId, order })).rejects.toThrow();
    const still = await t.run(async (ctx) => (await ctx.db.query("books").collect())[0].data as MasterData);
    expect(still.skills).toBeUndefined();
    expect((await t.run(async (ctx) => (await ctx.db.query("drafts").collect()).length))).toBe(1);
    void (null as unknown as Id<"units">);
  });
});
