// A whole unit saved as its skill book through the Claude link (24 Nov 2026, the founder: "you just say done ... I can
// download that directly from the skill page"; convex/lib/wholeUnit.ts, convex/link.ts `tell` op "workbook"): the
// same skill book as his "Use as the workbook" makes, in one save, all or nothing, never over a book students used.
// Made-up questions and fake answers only (the repo is public).
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { lvLabel, shapeFrom, type MasterData } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import { seal, toB64, unseal, sha256 } from "../convex/lib/seal";
import { skillLevels, skillWorkbook } from "../convex/lib/skillBook";
import { skillId, type KnownSkill } from "../convex/lib/skills";
import { levelLines, makeWholeUnit, type WholeUnit } from "../convex/lib/wholeUnit";
import schema from "../convex/schema";
import { asOwner } from "./helpers";

const UNIT = "G7-U03";
const S = (n: number) => skillId(UNIT, n);
const box = (v: string) => ({ k: "box" as const, b: [{ v: [v] }] });
const html = (q: number) => `<div class="si" data-q="${q}"><span class="qn">${q}</span><div class="sit">A made-up question ${q}</div></div>`;

// Part I 1–6 (2 marks each), Part II 7–9: Q7 one part of 5, Q8 two parts (2 + 2), Q9 one part of 6.
function request(): WholeUnit {
  const answers: KeyAnswer[] = [
    ...[1, 2, 3, 4, 5, 6].map((q) => ({ q, a: `**${q * 11}**`, t: box(String(q * 11)) })),
    { q: 7, parts: [{ p: "i", a: "**70**", m: 5, t: box("70") }] },
    { q: 8, parts: [{ p: "i", a: "**81**", m: 2, t: box("81") }, { p: "ii", a: "**82**", m: 2, t: box("82") }] },
    { q: 9, parts: [{ p: "i", a: "**90**", m: 6, t: box("90") }] },
  ];
  return {
    parts: [
      { id: "I", to: 6, each: 2 },
      { id: "II", to: 9 },
    ],
    levels: [
      { to: 6, max: 12 },
      { to: 9, max: 15 },
    ],
    marks: { "7": 5, "8": 4, "9": 6 },
    answers,
    items: Array.from({ length: 9 }, (_, i) => ({ q: i + 1, html: html(i + 1) })),
    css: ".qn { font-weight: 700; }",
    skills: [
      { id: S(1), ta: "முதல் திறன்", en: "A made-up first skill", eg: 1 },
      { id: S(2), ta: "இரண்டாம் திறன்", en: "A made-up second skill" },
      { id: S(3), ta: "மூன்றாம் திறன்", en: "A made-up third skill", eg: 6 },
    ],
    // S1: Q1, Q2 and the Q7 card; S2: Q3, Q4, and Q5 beside S1; S3: Q6; Q8 part by part (S2, S3); Q9 S3 beside S2.
    tags: [
      { q: 1, s: S(1) },
      { q: 2, s: S(1) },
      { q: 3, s: S(2) },
      { q: 4, s: S(2) },
      { q: 5, s: S(2), x: [S(1)] },
      { q: 6, s: S(3) },
      { q: 7, s: S(1) },
      { q: 8, p: "i", s: S(2) },
      { q: 8, p: "ii", s: S(3) },
      { q: 9, s: S(3), x: [S(2)] },
    ],
  };
}
const NONE = new Map<string, KnownSkill>();
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const G7 = { key: UNIT, grade: 7 };

describe("a whole unit (pure)", () => {
  test("it is the very skill book the owner's switch makes: numbers, levels, key, questions, tags and examples", () => {
    const req = request();
    const made = makeWholeUnit(G7, req, NONE);
    if (typeof made === "string") throw new Error(made);
    // What "Use as the workbook" makes of the same book and tags (lib/skillBook.ts).
    const shape = shapeFrom(7, req.parts, req.levels);
    if (typeof shape === "string") throw new Error(shape);
    const data: MasterData = { kind: "master", ...shape, marks: req.marks };
    const { levels, number } = skillLevels(UNIT, data, req.tags, req.skills.map((s) => s.id));
    const sw = skillWorkbook(data, levels.filter((l) => l.qs.length), number);
    if (typeof sw === "string") throw new Error(sw);
    expect(made.data).toEqual(sw.data);
    // Level n = skill n: S1 = Q1, Q2 and the card Q7; S2 = Q3, Q4, then Q5 (S1 + S2); S3 = Q6, then Q8 and Q9 (S2 + S3).
    expect([...made.map]).toEqual([
      [1, 1],
      [2, 2],
      [7, 3],
      [3, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [8, 8],
      [9, 9],
    ]);
    expect(made.data.skills).toBe(true);
    expect(made.data.was).toEqual([1, 2, 7, 3, 4, 5, 6, 8, 9]);
    expect(made.data.levels.map((l) => [lvLabel(l), l.from, l.to, l.max, l.skill])).toEqual([
      ["1", 1, 3, 9, S(1)],
      ["2", 4, 6, 6, S(2)],
      ["3", 7, 9, 12, S(3)],
    ]);
    // Part I and Part II as runs where they fall.
    expect(made.data.parts.map((p) => [p.id, p.from, p.to])).toEqual([
      ["I", 1, 2],
      ["II", 3, 3],
      ["I", 4, 7],
      ["II", 8, 9],
    ]);
    expect(made.data.marks).toEqual({ "3": 5, "8": 4, "9": 6 });
    // The key, the printed questions and the tags in the new numbers (parts keep their labels).
    expect(made.answers.map((k) => k.q)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(made.answers[2]).toEqual({ q: 3, parts: [{ p: "i", a: "**70**", m: 5, t: box("70") }] });
    expect(made.answers[3]).toMatchObject({ q: 4, a: "**33**" });
    expect(made.items.find((it) => it.q === 3)!.html).toBe(html(7));
    expect(made.tags.filter((t) => t.q === 8)).toEqual([
      { q: 8, p: "i", s: S(2) },
      { q: 8, p: "ii", s: S(3) },
    ]);
    expect(made.tags.find((t) => t.q === 6)).toEqual({ q: 6, s: S(2), x: [S(1)] });
    // A lesson's example in the new numbers; a skill without one gets the plainest question carrying it first.
    expect(made.skills.map((s) => [s.id, s.eg])).toEqual([
      [S(1), 1],
      [S(2), 4],
      [S(3), 7],
    ]);
    // What the chat reads back, a line a level.
    expect(levelLines(made.levels, new Map(made.skills.map((s) => [s.id, s.en])))).toEqual([
      "Level 1 · A made-up first skill · Q1–3 · 3 questions · 9 marks",
      "Level 2 · A made-up second skill · Q4–6 · 3 questions · 6 marks",
      "Level 3 · A made-up third skill · Q7–9 · 3 questions · 12 marks",
    ]);
  });

  test("a skill with no question of its own: its level is said and skipped, never another skill's number", () => {
    const req = request();
    // Q6 (S3 alone) now also needs S4, so no question ends on S3.
    req.skills.push({ id: S(4), ta: "நான்காம் திறன்", en: "A made-up fourth skill" });
    req.tags = req.tags.map((t) => (t.q === 6 ? { q: 6, s: S(4), x: [S(3)] } : t.q === 9 ? { q: 9, s: S(4), x: [S(3)] } : t.q === 8 && t.p === "ii" ? { q: 8, p: "ii", s: S(4) } : t));
    req.skills[2] = { ...req.skills[2], eg: undefined };
    const made = makeWholeUnit(G7, req, NONE);
    if (typeof made === "string") throw new Error(made);
    const lines = levelLines(made.levels, new Map(made.skills.map((s) => [s.id, s.en])));
    expect(lines[2]).toBe("Level 3 · A made-up third skill · no question of its own (each one also needs a later skill): its number is skipped in print");
    expect(made.data.levels.map((l) => lvLabel(l))).toEqual(["1", "2", "4"]);
  });

  test("refused in plain words, the first thing wrong", () => {
    const one = (change: (r: WholeUnit) => void, known = NONE) => {
      const r = request();
      change(r);
      return makeWholeUnit(G7, r, known);
    };
    expect(one((r) => (r.answers = r.answers.filter((k) => k.q !== 4)))).toBe("The key must answer every question, 1 to 9, once.");
    expect(one((r) => (r.items = r.items.filter((it) => it.q !== 5)))).toBe("Question 5 is not here as printed: the skill book prints every question.");
    expect(one((r) => (r.items[0] = { q: 1, html: '<div onclick="x()">1</div>' }))).toMatch(/^Question 1: /);
    expect(one((r) => (r.items = [...r.items, { q: 3, html: html(3) }]))).toBe("Question 3 comes twice.");
    expect(one((r) => (r.tags = r.tags.filter((t) => t.q !== 6)))).toBe("Question 6 has no skill.");
    expect(one((r) => (r.tags = r.tags.map((t) => (t.q === 6 ? { q: 6, s: "G7-U01-S1" } : t))))).toMatch(/skill G7-U01-S1 is not in the app/);
    // Another unit's skill in the app: fine (the grade's or an earlier one's).
    expect(typeof one((r) => (r.tags = r.tags.map((t) => (t.q === 2 ? { q: 2, s: S(1), x: ["G6-U02-S4"] } : t))), new Map([["G6-U02-S4", { unit: "G6-U02", ta: "த", en: "Place value" }]]))).toBe("object");
    expect(one((r) => (r.parts = [{ id: "IA", to: 6, each: 2 }, ...r.parts.slice(1)]))).toBe("Grade 7 workbooks have no Paper I A.");
    expect(one((r) => (r.answers = r.answers.map((k) => (k.q === 9 ? { q: 9, parts: [{ p: "i", a: "**90**", m: 4, t: box("90") }] } : k))))).toBe("The answer key is for another version of this book: question 9 is 6 marks in the book, 4 in the key.");
    // A blank the key fills must be printed in its question.
    expect(one((r) => (r.answers = r.answers.map((k) => (k.q === 2 ? { q: 2, a: "**22**", t: { k: "fill" as const, b: [{ v: ["22"] }] } } : k))))).toMatch(/^Question 2: /);
    expect(one((r) => (r.css = ""))).toBe("The book's style is missing or too big to keep.");
    expect(one((r) => ((r as unknown as { skills: unknown }).skills = "all"))).toBe("A whole unit needs its parts, levels, answers, questions as printed, style, skills and tags.");
  });
});

describe("a whole unit through the Claude link", () => {
  const ID = "TestLink0007";
  const KEY = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 255);
  let seq = 0;
  const nonce = () => sha256(new TextEncoder().encode(`whole ${++seq}`)).subarray(0, 16);
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let unitId: Id<"units">;
  let now = 0;

  const ask = async (req: Record<string, unknown>) => {
    const r = await raw.query(api.link.ask, { id: ID, box: seal(KEY, nonce(), JSON.stringify({ t: now, ...req })) });
    const o = r.box ? unseal(KEY, r.box) : null;
    return o ? (JSON.parse(o.words) as Record<string, any>) : null;
  };
  const tell = async (req: Record<string, unknown>) => {
    const r = await raw.mutation(api.link.tell, { id: ID, box: seal(KEY, nonce(), JSON.stringify({ t: ++now, ...req })) });
    const o = r.box ? unseal(KEY, r.box) : null;
    return o ? (JSON.parse(o.words) as Record<string, any>) : null;
  };
  const keyOf = async (key: string) => raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    unitId = await keyOf(UNIT);
    await t.mutation(api.link.open, { id: ID, key: toB64(KEY) });
    now = Date.now();
  });

  test("a new unit: saved whole, and its workbook is its skill book at once", async () => {
    const r = await tell({ op: "workbook", unitId, ...request() });
    expect(r).toMatchObject({ ok: true, made: true, questions: 9, strips: 3, skills: 3 });
    expect(r!.levels[0]).toBe("Level 1 · A made-up first skill · Q1–3 · 3 questions · 9 marks");
    expect(r!.share.parts.photo).toBe(0);
    const u = await ask({ op: "unit", unitId });
    expect(u!.data.skills).toBe(true);
    expect(typeof u!.data.since).toBe("number");
    expect(u!.data.levels.map((l: { name: string }) => l.name)).toEqual(["1", "2", "3"]);
    expect(u!.answers[2]).toMatchObject({ q: 3, parts: [{ p: "i", m: 5 }] });
    expect(u!.questions.map((x: { q: number }) => x.q)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // Each skill got its permanent key; the tags are in the book's numbers.
    expect(u!.skills.skills.map((s: { id: string; k: string; eg: number }) => [s.id, s.k, s.eg])).toEqual([
      [S(1), "k1", 1],
      [S(2), "k2", 4],
      [S(3), "k3", 7],
    ]);
    expect(u!.skills.problem).toBe("");
    const q3 = await ask({ op: "questions", unitId });
    expect(q3!.items.find((x: { q: number }) => x.q === 3).html).toBe(html(7));
    const books = await ask({ op: "books" });
    expect(books!.units.find((x: { key: string }) => x.key === UNIT).master).toMatchObject({ skillBook: true, keyCount: 9, qCount: 9 });
    // The T page reads it as a skill workbook (the owner's switch has nothing left to do).
    const sb = await t.query(api.skillBook.unit, { unitId });
    expect(sb!.data.skills).toBe(true);
    await expect(t.mutation(api.skillBook.useAsWorkbook, { unitId, order: [1, 2, 3, 4, 5, 6, 7, 8, 9] })).rejects.toThrow(/is the skill book already/);
    const lines = await t.query(api.state.history, { limit: 10 });
    expect(lines.some((e: { kind: string; value?: string }) => e.kind === "book-save" && /the skill book, 3 levels \(3 strips\), 9 questions, 3 skills/.test(e.value ?? ""))).toBe(true);
  });

  test("never over a book students used; again only when sent with `again`; a tute and other books keep their own way", async () => {
    expect((await tell({ op: "workbook", unitId, ...request() }))!.ok).toBe(true);
    // Its book may be printed: refused without `again`.
    expect((await tell({ op: "workbook", unitId, ...request() }))!.error).toMatch(/has a workbook in the app already \(its skill book\), and its book may be printed/);
    // With `again`, nobody in it: replaced (the skills keep their keys).
    const again = request();
    again.skills[1] = { ...again.skills[1], ta: "இரண்டாம் திறன் (புதிது)" };
    expect(await tell({ op: "workbook", unitId, again: true, ...again })).toMatchObject({ ok: true, made: false });
    const u = await ask({ op: "unit", unitId });
    expect(u!.skills.skills.map((s: { k: string }) => s.k)).toEqual(["k1", "k2", "k3"]);
    // A student's marks in it: refused, even with `again`.
    await raw.run(async (ctx) => {
      const sid = await ctx.db.insert("students", { name: "Kumar S.", archived: false, present: false, idleMs: 0, grade: 7, unitId });
      await ctx.db.insert("progress", { studentId: sid, unitId, stage: "master", marks: {}, m: { q: { "1": { lost: false, t: 1 } }, lv: {} }, startedAt: 1, updatedAt: 1 });
    });
    expect((await tell({ op: "workbook", unitId, again: true, ...request() }))!.error).toBe(
      "G7-U03: a student has marks in it, so its numbers are fixed for this year. Fix a question, a key or a kind with a save of its questions; adding, removing or moving questions waits for its next edition.",
    );
    // An O/L topic, a Sakarath unit: not here.
    const ol = await keyOf("OL-U01");
    expect((await tell({ op: "workbook", unitId: ol, ...request() }))!.error).toMatch(/only a school unit \(Grades 6–11\)/);
    expect((await tell({ op: "workbook", unitId: "nope", ...request() }))!.error).toBe("No such unit.");
  });

  test("a skill with a video can't be dropped by a whole save", async () => {
    expect((await tell({ op: "workbook", unitId, ...request() }))!.ok).toBe(true);
    await raw.run(async (ctx) => {
      await ctx.db.insert("videos", { unitId, sk: "k3", kind: "skill", order: 1, host: { p: "mux" }, state: "ready", live: true, by: "Owner", at: 1, updatedAt: 1 });
    });
    const two = request();
    two.skills = two.skills.slice(0, 2);
    two.tags = two.tags.map((t) => ({ ...t, s: t.s === S(3) ? S(2) : t.s, ...(t.x ? { x: t.x.filter((x) => x !== S(3) && x !== S(2)) } : {}) })).map((t) => (t.x && !t.x.length ? { q: t.q, ...(t.p ? { p: t.p } : {}), s: t.s } : t));
    two.skills[1] = { ...two.skills[1], eg: undefined };
    const r = await tell({ op: "workbook", unitId, again: true, ...two });
    expect(r!.error).toMatch(/G7-U03-S3 \(A made-up third skill\) has 1 video/);
    // Nothing half: the book is as it was.
    expect((await ask({ op: "unit", unitId }))!.skills.skills).toHaveLength(3);
  });
});
