// Topic tutes (the O/L essay books): ONE source zip with tute.json → TWO books of the unit. The ladder is its theory
// book (Fighter: sections A, B …, teacher and solo questions), the past papers its workbook (Master: one paper a level,
// numbers going on from the ladder), each with its answer key; every printed question comes from the zip's book.html.
// The fixture is a FAKE tute built by the ol-essay engine (made-up questions and answers, fonts removed).

import { convexTest } from "convex-test";
import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { checkMaster, type MasterData } from "../convex/lib/book";
import { cleanHtml, unsafeCss, unsafeHtml } from "../convex/lib/questions";
import schema from "../convex/schema";
import { bookCssOf, tuteQuestions } from "../src/bookQuestions";
import { uploadRows } from "../src/upload";
import { readWorkbookFiles, type ReadTute } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import HTML from "./fixtures/tute-skeleton.html?raw";
import TUTE from "./fixtures/tute-skeleton.json?raw";

const FILE = "Sample_tute_source.zip";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

function read(json: string = TUTE, html: string | null = HTML) {
  const files: Record<string, Uint8Array> = { "tute.json": strToU8(json), "content.py": strToU8("") };
  if (html !== null) files["book.html"] = strToU8(html);
  return readWorkbookFiles([{ name: FILE, bytes: zipSync(files) }]);
}
const edit = (f: (j: Record<string, any>) => void) => {
  const j = JSON.parse(TUTE);
  f(j);
  return JSON.stringify(j);
};

describe("reading a tute's zip", () => {
  test("two books: the ladder as the theory book, the papers as the workbook going on from it", () => {
    const [t] = read() as ReadTute[];
    expect(t.kind).toBe("tute");
    expect(t.problems).toEqual([]);
    expect([t.grade, t.code, t.title]).toEqual([11, "U24", "மாதிரி"]);
    expect(t.fighter.sections.map((s) => [s.id, s.kind, s.teach, s.solo])).toEqual([
      ["A", "ladder", [1], [2]],
      ["B", "ladder", [3], [4, 5]],
    ]);
    expect(t.master.parts).toEqual([{ id: "IIB", from: 6, to: 8, kind: "cards" }]);
    expect(t.master.levels).toEqual([
      { n: 1, from: 6, to: 6, max: 10 },
      { n: 2, from: 7, to: 7, max: 10 },
      { n: 3, from: 8, to: 8, max: 10 },
    ]);
    expect(t.fighterKey?.map((k) => k.q)).toEqual([1, 2, 3, 4, 5]);
    expect(t.fighterKey?.[0]).toEqual({ q: 1, parts: [{ p: "i", a: "3" }, { p: "ii", a: "**4**" }] });
    expect(t.masterKey?.[0].parts?.map((p) => p.m)).toEqual([4, 6]);
  });

  test("every printed question, cleaned: the footer, side tab and working space never come along", () => {
    const [t] = read() as ReadTute[];
    expect([...t.questions.fighter.keys()]).toEqual([1, 2, 3, 4, 5]);
    expect([...t.questions.master.keys()]).toEqual([6, 7, 8]);
    const q1 = t.questions.fighter.get(1)!;
    expect(q1.startsWith('<div class="qq" data-q="1">')).toBe(true); // "pt" (page top) dropped
    expect(q1).toContain('<span class="qn">1</span>');
    expect(q1).not.toMatch(/class="(fl|fc|fr|tab)"/);
    expect(unsafeHtml(q1)).toBe("");
    expect(t.css).toContain(".qq {");
    expect(t.css).not.toContain("@font-face");
    expect(t.css).not.toContain("@page");
    expect(unsafeCss(t.css)).toBe("");
  });

  test("the upload list says what it brings and replaces", () => {
    const units = [{ _id: "u24", grade: 11, code: "U24", en: "Sets", ta: "தொடைகள்", term: 3, order: 1, key: "G11-U24" }] as never[];
    const [row] = uploadRows(read(), units, []);
    expect(row).toMatchObject({ state: "new", words: "New: theory book + workbook", title: "G11 · U24 Sets · topic tute" });
    expect(row.detail).toBe("Theory book: A–B, 5 questions (2 with the teacher) · Workbook: Paper II B 6–8, 3 levels, 30 marks");
    expect(row.keyLine).toEqual({ words: "✓ Answer keys: ladder all 5 · past papers all 3", ok: true });
    expect(row.qLine).toEqual({ words: "✓ Questions as printed: ladder all 5 · past papers all 3", ok: true });
    const inApp = [{ unitId: "u24", stage: "master" as const, master: { parts: [], levels: [{ n: 1, from: 1, to: 9, max: 20 }], total: 20, marksKnown: 0 }, keyCount: 9 }];
    expect(uploadRows(read(), units, inApp)[0]).toMatchObject({ state: "replace", words: "Replaces the workbook (1 levels, 20 marks) in the app" });
  });

  test("a wrong tute is refused with the reason, nothing silently dropped", () => {
    const bad = (j: string) => (read(j)[0] as ReadTute).problems.join(" ");
    expect(bad(edit((j) => (j.master.part = "IA")))).toContain("Grade 11 has no IA for its essays.");
    expect(bad(edit((j) => (j.master.questions[1].marks = 0)))).toContain("question 7: its marks are missing");
    expect(bad(edit((j) => (j.master.levels[1].from = 9)))).toContain("Level 2 should start at question 7.");
    expect(bad(edit((j) => j.fighter.answers.push({ q: 40, a: "x" })))).toContain("the theory book has no such question");
    expect(bad(edit((j) => (j.master.answers[0].parts[0].m = 5)))).toContain("question 6 is 10 marks in the book, 11 in the key");
    expect(read("{}")[0]).toMatchObject({ problem: expect.stringContaining("isn't one the app knows") });
    const noHtml = read(TUTE, null)[0] as ReadTute;
    expect([noHtml.problems, noHtml.questions.fighter.size]).toEqual([[], 0]);
  });
});

describe("the print engines' HTML", () => {
  test("a workbook may start after question 1 (a tute's papers go on from its ladder), but its levels may not skip", () => {
    const m: MasterData = { kind: "master", parts: [{ id: "IIB", from: 56, to: 57, kind: "cards" }], levels: [{ n: 1, from: 56, to: 57, max: 20 }], marks: { "56": 10, "57": 10 } };
    expect(checkMaster(m)).toEqual([]);
    expect(checkMaster({ ...m, levels: [{ n: 1, from: 57, to: 57, max: 10 }] })).toContain("Level 1 should start at question 56.");
  });

  test("nothing that can run, load or post survives the cleaning", () => {
    const dirty =
      '<div class="qq" data-q="1" onclick="x()"><script>alert(1)</script><a href="javascript:x">t</a><img src=x onerror=y>' +
      '<svg><rect fill="url(#h)"/><rect fill="url(https://evil/x)"/><use href="#a"/></svg><style>*{}</style></div>';
    const clean = cleanHtml(dirty);
    expect(clean).not.toMatch(/script|onclick|onerror|javascript|<img|https:|<use|<style/);
    expect(clean).toContain('fill="url(#h)"');
    expect(unsafeHtml(clean)).toBe("");
    expect(unsafeHtml(dirty)).not.toBe("");
    expect(bookCssOf('<style>@font-face{src:url(a)} .a{color:red} @page{@bottom-left{content:"x"}} @media screen{.b{}}</style>')).toBe(".a{color:red}");
  });

  test("a card's printed number is its black badge", () => {
    const q = tuteQuestions('<div class="pq pqf pt" data-q="8"><div class="fl">x</div><div class="pqh"><span class="qn">8</span></div></div>');
    expect([...q.master.keys()]).toEqual([8]);
    expect(q.master.get(8)).toBe('<div class="pq pqf" data-q="8"><div class="pqh"><span class="qn">8</span></div></div>');
  });
});

describe("saving a tute", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let unitId: any;
  const doc = async (stage: "fighter" | "master") =>
    await raw.run(async (ctx) => await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", stage)).first());
  const args = (r: ReadTute) => ({
    unitId,
    title: r.title!,
    fighter: { sections: r.fighter.sections.map((x) => ({ id: x.id, title: x.title, tamil: x.tamil, teach: x.teach, solo: x.solo })) },
    master: { part: r.part, levels: r.master.levels.map((l) => ({ from: l.from, to: l.to, max: l.max })), marks: r.master.marks! },
    fighterKey: r.fighterKey!,
    masterKey: r.masterKey!,
  });
  const saveQs = async (r: ReadTute, stage: "fighter" | "master") =>
    await t.mutation(api.catalog.saveQuestions, { unitId, stage, first: true, css: r.css, items: [...r.questions[stage]].map(([q, html]) => ({ q, html })) });

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    unitId = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G11-U24")).first())!._id);
  });

  test("both books and both keys, apart; each key read by its book", async () => {
    const [r] = read() as ReadTute[];
    expect(await t.mutation(api.catalog.saveTute, args(r))).toBe(true);
    const f = (await doc("fighter"))!;
    const m = (await doc("master"))!;
    expect([f.title, f.keyCount, m.keyCount]).toEqual(["மாதிரி", 5, 3]);
    expect(m.data).toMatchObject({ parts: [{ id: "IIB", from: 6, to: 8 }], levels: [{ n: 1, from: 6, to: 6, max: 10 }, {}, {}] });
    expect((await t.query(api.catalog.key, { unitId, stage: "fighter" }))!.answers[0]).toEqual(r.fighterKey![0]);
    expect((await t.query(api.catalog.key, { unitId }))!.answers.map((a) => a.q)).toEqual([6, 7, 8]); // the workbook's by default
    const line = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "book-save").at(-1));
    expect(line?.value).toBe("topic tute: theory book 5 questions, workbook 3 levels, 30 marks + answer keys (5 + 3)");
  });

  test("questions: stored apart, read one at a time by teachers; unsafe ones refused; gone when the book's questions change", async () => {
    const [r] = read() as ReadTute[];
    await t.mutation(api.catalog.saveTute, args(r));
    expect(await saveQs(r, "fighter")).toBe(true);
    expect(await saveQs(r, "master")).toBe(true);
    expect([(await doc("fighter"))!.qCount, (await doc("master"))!.qCount]).toEqual([5, 3]);
    expect((await t.query(api.catalog.question, { unitId, stage: "master", q: 7 }))!.html).toContain('<span class="qn">7</span>');
    expect(await t.query(api.catalog.question, { unitId, stage: "master", q: 1 })).toBeNull();
    expect((await t.query(api.catalog.bookCss, { unitId, stage: "fighter" }))!.css).toBe(r.css);
    await expect(t.mutation(api.catalog.saveQuestions, { unitId, stage: "fighter", first: false, items: [{ q: 1, html: "<div onclick=x>" }] })).rejects.toThrow(/event handler/);
    await expect(t.mutation(api.catalog.saveQuestions, { unitId, stage: "master", first: false, items: [{ q: 2, html: "<b>x</b>" }] })).rejects.toThrow(/not in this book/);
    await addPerson(raw, { name: "Kala", token: "kala-phone-token-0123456789abcdefghijklmnopqrstuvwx", tabs: ["evaluation"] });
    const kala = asPhone(raw, "kala-phone-token-0123456789abcdefghijklmnopqrstuvwx");
    expect(await kala.query(api.catalog.question, { unitId, stage: "fighter", q: 2 })).not.toBeNull();
    await expect(kala.mutation(api.catalog.saveQuestions, { unitId, stage: "fighter", first: true, items: [] })).rejects.toThrow();
    // The same tute again: its questions stay. A re-cut ladder: the old question texts go (they'd sit beside the wrong numbers).
    await t.mutation(api.catalog.saveTute, args(r));
    expect((await doc("fighter"))!.qCount).toBe(5);
    const a = args(r);
    a.fighter.sections[1].solo = [4];
    a.fighterKey = a.fighterKey.filter((k) => k.q !== 5);
    await t.mutation(api.catalog.saveTute, a);
    expect((await doc("fighter"))!.qCount).toBeUndefined();
    expect(await t.query(api.catalog.question, { unitId, stage: "fighter", q: 2 })).toBeNull();
    expect((await doc("master"))!.qCount).toBe(3);
  });

  test("refused: papers overlapping the ladder, a part that isn't an essay part, missing marks", async () => {
    const [r] = read() as ReadTute[];
    const a = args(r);
    await expect(t.mutation(api.catalog.saveTute, { ...a, master: { ...a.master, part: "IA" } })).rejects.toThrow(/no Paper I A for essays/);
    await expect(t.mutation(api.catalog.saveTute, { ...a, fighter: { sections: [...a.fighter.sections, { id: "C", title: "x", tamil: "x", teach: [], solo: [6] }] } })).rejects.toThrow(/after the ladder/);
    await expect(t.mutation(api.catalog.saveTute, { ...a, master: { ...a.master, marks: { "6": 10, "7": 10 } } })).rejects.toThrow(/question 8: its marks are missing/);
  });

  test("an old workbook key (no stage) is still the workbook's; the tute's theory key never replaces it by mistake", async () => {
    const [r] = read() as ReadTute[];
    await t.mutation(api.catalog.saveTute, args(r));
    await raw.run(async (ctx) => {
      const k = (await ctx.db.query("keys").collect()).find((x) => x.stage === "master")!;
      await ctx.db.patch(k._id, { stage: undefined }); // as every key saved before the tutes
    });
    expect((await t.query(api.catalog.key, { unitId }))!.answers).toHaveLength(3);
    expect((await t.query(api.catalog.key, { unitId, stage: "fighter" }))!.answers).toHaveLength(5);
    await t.mutation(api.catalog.saveTute, args(r));
    const keys = await raw.run(async (ctx) => await ctx.db.query("keys").collect());
    expect(keys.map((k) => k.stage ?? "master").sort()).toEqual(["fighter", "master"]); // patched, not doubled
  });
});
