// Topic tutes (the O/L essay books): ONE source zip with tute.json → TWO books of the unit. The ladder is its theory
// book (Fighter: sections A, B …, teacher and solo questions), the past papers its workbook (Master: one paper a level,
// numbers going on from the ladder), each with its answer key; every printed question comes from the zip's book.html.
// The fixture is a FAKE tute built by the ol-essay engine (made-up questions and answers, fonts removed).

import { convexTest } from "convex-test";
import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { checkMaster, type MasterData } from "../convex/lib/book";
import { cleanHtml, unsafeCss, unsafeHtml } from "../convex/lib/questions";
import schema from "../convex/schema";
import { bookCssOf, tuteQuestions } from "../src/bookQuestions";
import { olNo, uploadRows } from "../src/upload";
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

  test("the upload list says what it brings and replaces (a Grade 11 tute goes to its OL topic)", () => {
    const units = [
      { _id: "u24", grade: 11, code: "U24", en: "Sets", ta: "தொடைகள்", term: 3, order: 24, key: "G11-U24" },
      { _id: "o53", grade: 12, code: "U53", en: "Sets and probability", ta: "தொடைகளும் நிகழ்தகவும்", term: 4, order: 53, key: "OL-U53" },
    ] as never[];
    const sets = edit((j) => (j.unit.en = "Sets"));
    const [row] = uploadRows(read(sets), units, []);
    expect(row).toMatchObject({ state: "new", words: "New: theory book + workbook", title: "OL · 01 Sets and probability · topic tute" });
    expect(row.detail).toBe("Theory book: A–B, 5 questions (2 with the teacher) · Workbook: Paper II B 6–8, 3 levels, 30 marks");
    expect(row.keyLine).toEqual({ words: "✓ Answer keys: ladder all 5 · past papers all 3", ok: true });
    expect(row.qLine).toEqual({ words: "✓ Questions as printed: ladder all 5 · past papers all 3", ok: true });
    const inApp = [{ unitId: "o53", stage: "master" as const, master: { parts: [], levels: [{ n: 1, from: 1, to: 9, max: 20 }], total: 20, marksKnown: 0 }, keyCount: 9 }];
    expect(uploadRows(read(sets), units, inApp)[0]).toMatchObject({ state: "replace", words: "Replaces the workbook (1 levels, 20 marks) in the app" });
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

  test("a tute's two books travel together: the twin's row (on a move, or one tap on Correction) and on the board", async () => {
    const [r] = read() as ReadTute[];
    await t.mutation(api.catalog.saveTute, args(r));
    expect([(await doc("fighter"))!.tute, (await doc("master"))!.tute]).toEqual([true, true]);
    const id = await t.mutation(api.students.add, { name: "Aqeeth", grade: 11, term: 3, stage: "fighter", unitId });
    await t.mutation(api.students.setPresent, { id, present: true });
    const rows = async () =>
      (await raw.run(async (ctx) => await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", id)).collect())).map((p) => p.stage).sort();
    const twinOnBoard = async () => ((await t.query(api.state.get, {})) as any).more[id]?.map((p: { stage: string }) => p.stage) ?? [];
    expect(await rows()).toEqual(["fighter"]);
    expect(await twinOnBoard()).toEqual([]);
    expect(await t.mutation(api.students.openTwin, { id, unitId, stage: "master" })).toBe(true);
    expect(await rows()).toEqual(["fighter", "master"]);
    expect(await twinOnBoard()).toEqual(["master"]); // nothing waiting in it, still on the board: Correction opens it
    // A move onto the papers makes the ladder his twin (both rows already there); a school unit's books never pair.
    await t.mutation(api.students.move, { id, grade: 11, term: 3, stage: "master", unitId });
    expect(await twinOnBoard()).toEqual(["fighter"]);
    const g11u1 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G11-U01")).first())!._id);
    await expect(t.mutation(api.students.openTwin, { id, unitId: g11u1, stage: "master" })).rejects.toThrow(/isn't his topic now/);
  });

  test("a tute uploaded before the twin mark (his Simultaneous equations): the data step marks both books; its papers open", async () => {
    const [r] = read() as ReadTute[];
    await t.mutation(api.catalog.saveTute, args(r));
    await raw.run(async (ctx) => {
      for (const b of await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", unitId)).collect()) await ctx.db.patch(b._id, { tute: undefined });
      const meta = (await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "data")).first())!;
      await ctx.db.patch(meta._id, { value: 3 });
    });
    const id = await t.mutation(api.students.add, { name: "Miha", grade: 11, term: 3, stage: "fighter", unitId });
    await expect(t.mutation(api.students.openTwin, { id, unitId, stage: "master" })).rejects.toThrow(/Only a topic tute's two books/);
    expect((await t.mutation(api.setup.ensure, {})).changed).toBe(true);
    expect([(await doc("fighter"))!.tute, (await doc("master"))!.tute]).toEqual([true, true]);
    expect(await t.mutation(api.students.openTwin, { id, unitId, stage: "master" })).toBe(true);
    // A school workbook (starts at question 1) is never taken for a tute.
    const books = await raw.run(async (ctx) => await ctx.db.query("books").collect());
    expect(books.filter((b) => b.tute).map((b) => b.unitId)).toEqual([unitId, unitId]);
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

describe("OL: the O/L books by paper part, for any student", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  const olUnit = async (code: string) =>
    await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", `OL-${code}`)).first())!);
  const olTute = (part = "IIA") =>
    edit((j) => {
      j.grade = "OL";
      j.unit = { no: 44, code: "U44", en: "Simultaneous equations", ta: "ஒருங்கமை சமன்பாடு" };
      j.master.part = part;
    });

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
  });

  test("a tute filed under an OL topic: its part must be the topic's part", async () => {
    const units = await t.query(api.catalog.units, {});
    const [r] = read(olTute()) as ReadTute[];
    expect([r.grade, r.code, r.problems]).toEqual([12, "U44", []]);
    const [row] = uploadRows([r], units as never[], []);
    expect(row).toMatchObject({ state: "new", title: "OL · 03 Simultaneous equations · topic tute" });
    expect(row.choices).toBeUndefined(); // a file that says OL needs no picking
    const [wrong] = uploadRows(read(olTute("IIB")), units as never[], []);
    expect(wrong).toMatchObject({ state: "bad", words: "Simultaneous equations is in Paper II · Part A; this tute's papers say Paper II B." });
    const u = await olUnit("U44");
    const save = (part: "IIA" | "IIB") =>
      t.mutation(api.catalog.saveTute, {
        unitId: u._id,
        fighter: { sections: r.fighter.sections.map((x) => ({ id: x.id, title: x.title, tamil: x.tamil, teach: x.teach, solo: x.solo })) },
        master: { part, levels: r.master.levels.map((l) => ({ from: l.from, to: l.to, max: l.max })), marks: r.master.marks! },
        masterKey: r.masterKey!,
      });
    await expect(save("IIB")).rejects.toThrow(/Simultaneous equations is in Paper II · Part A/);
    expect(await save("IIA")).toBe(true);
  });

  test("a Grade 10 student gets an OL book, moves onto one (his grade and term stay), or the whole OL at once", async () => {
    const g10u1 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G10-U01")).first())!);
    const id = await t.mutation(api.students.add, { name: "Nimal", grade: 10, term: 2, stage: "master", unitId: g10u1._id });
    const u44 = await olUnit("U44");
    const u45 = await olUnit("U45");
    expect(await t.mutation(api.students.setGiven, { id, unitId: u44._id, stage: "master", given: true })).toBe(true);
    await t.mutation(api.students.move, { id, grade: 12, term: 3, stage: "master", unitId: u45._id });
    const s = await raw.run(async (ctx) => await ctx.db.get(id));
    expect([s!.grade, s!.term, s!.unitId]).toEqual([10, 2, u45._id]);
    // The whole OL syllabus: only the OL workbooks in the app (none yet: nothing to give).
    expect(await t.mutation(api.students.giveAllOl, { id, stage: "master", given: true })).toBe(0);
    for (const u of [u44, u45]) {
      await raw.run(async (ctx) => {
        await ctx.db.insert("books", { unitId: u._id, stage: "master", data: { kind: "master", parts: [{ id: "IIA", from: 1, to: 2, kind: "cards" }], levels: [{ n: 1, from: 1, to: 2, max: 20 }], marks: { "1": 10, "2": 10 } }, updatedAt: 1 });
      });
    }
    expect(await t.mutation(api.students.giveAllOl, { id, stage: "master", given: true })).toBe(1); // U44 was given already
    const given = async () => (await raw.run(async (ctx) => await ctx.db.query("handouts").collect())).map((h) => h.unitId).sort();
    expect(await given()).toEqual([u44._id, u45._id].sort());
    expect(await t.mutation(api.students.giveAllOl, { id, stage: "master", given: false })).toBe(2);
    expect(await given()).toEqual([]);
    // A school unit of another grade is still refused; OL is for Grades 10 and 11 only.
    const g9 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G9-U01")).first())!);
    await expect(t.mutation(api.students.setGiven, { id, unitId: g9._id, stage: "master", given: true })).rejects.toThrow(/not Grade 10/);
    const g8 = await t.mutation(api.students.add, { name: "Ravi", grade: 8, term: 2, stage: "master", unitId: (await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!))._id });
    await expect(t.mutation(api.students.setGiven, { id: g8, unitId: u44._id, stage: "master", given: true })).rejects.toThrow(/Grade 10 and 11/);
    await expect(t.mutation(api.students.move, { id: g8, grade: 8, term: 2, stage: "master", unitId: u44._id })).rejects.toThrow(/Grade 10 and 11/);
    await expect(t.mutation(api.students.giveAllOl, { id: g8, stage: "master", given: true })).rejects.toThrow(/Grade 10 and 11/);
  });
});

describe("An O/L tute belongs in OL (his Constructions on Grade 11, 3 Nov 2026)", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let units: Doc<"units">[];
  const unit = (key: string) => units.find((u) => u.key === key)!;
  /** The FAKE tute as the essay engine files it: a Grade 11 unit (its number and names) and its paper part. */
  const tuteAs = (en: string, ta: string, part = "IIB", no = 23) =>
    edit((j) => {
      j.unit = { no, code: `U${String(no).padStart(2, "0")}`, en, ta };
      j.title = ta;
      j.master.part = part;
    });
  const readAs = (en: string, ta: string, part = "IIB") => (read(tuteAs(en, ta, part)) as ReadTute[])[0];
  /** What an upload saves: both books with their keys, then each book's printed questions. */
  const save = async (unitId: Id<"units">, r: ReadTute) => {
    await t.mutation(api.catalog.saveTute, {
      unitId,
      ...(r.title ? { title: r.title } : {}),
      fighter: { sections: r.fighter.sections.map((x) => ({ id: x.id, title: x.title, tamil: x.tamil, teach: x.teach, solo: x.solo })) },
      master: { part: r.part, levels: r.master.levels.map((l) => ({ from: l.from, to: l.to, max: l.max })), marks: r.master.marks! },
      fighterKey: r.fighterKey!,
      masterKey: r.masterKey!,
    });
    for (const stage of ["fighter", "master"] as const) {
      await t.mutation(api.catalog.saveQuestions, { unitId, stage, first: true, css: r.css, items: [...r.questions[stage]].map(([q, html]) => ({ q, html })) });
    }
  };
  const move = (from: Id<"units">, to: Id<"units">) => t.mutation(api.catalog.moveTute, { unitId: from, toUnitId: to });
  const booksOn = async (unitId: Id<"units">) =>
    await raw.run(async (ctx) => ({
      books: (await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", unitId)).collect()).map((b) => [b.stage, b.tute, b.keyCount, b.qCount]),
      keys: (await ctx.db.query("keys").withIndex("by_unit", (q) => q.eq("unitId", unitId)).collect()).length,
      questions: (await ctx.db.query("questions").withIndex("by_book", (q) => q.eq("unitId", unitId)).collect()).length,
      css: (await ctx.db.query("bookCss").withIndex("by_book", (q) => q.eq("unitId", unitId)).collect()).length,
    }));
  const EMPTY = { books: [], keys: 0, questions: 0, css: 0 };
  /** A student's row in a book, made or changed (students.add already made an empty one for his unit). */
  const put = async (studentId: Id<"students">, unitId: Id<"units">, stage: "fighter" | "master", fields: Partial<Doc<"progress">>) =>
    await raw.run(async (ctx) => {
      const now = Date.now();
      const p = await ctx.db
        .query("progress")
        .withIndex("by_student_unit_stage", (q) => q.eq("studentId", studentId).eq("unitId", unitId).eq("stage", stage))
        .first();
      if (p) await ctx.db.patch(p._id, fields);
      else await ctx.db.insert("progress", { studentId, unitId, stage, marks: {}, startedAt: now, updatedAt: now, ...fields });
    });
  const RIGHT = { "2": { s: "right" as const, t: 1 } };

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    units = await t.query(api.catalog.units, {});
  });

  test("the upload files a Grade 11 tute under its OL topic: its part, then its name; or the topic he taps", () => {
    const row = (en: string, ta: string, part = "IIB", picks: Record<number, string> = {}) => uploadRows(read(tuteAs(en, ta, part)), units as never[], [], picks)[0];
    const c = row("Constructions", "அமைப்புகள்");
    expect(c).toMatchObject({ state: "new", words: "New: theory book + workbook", title: "OL · 08 Constructions · topic tute" });
    expect(c.unit!.key).toBe("OL-U49");
    expect(c.choices!.map((u) => `${olNo(u, units as never[])} ${u.en}`)).toEqual([
      "07 Arithmetic and geometric progressions",
      "08 Constructions",
      "09 Volume and logarithms",
      "10 Theorems on rectilinear plane figures",
      "11 Circle theorems",
      "12 Sets and probability",
    ]);
    // English inside a longer name, Tamil endings; the Tamil name settles "Equations" (two Paper II A topics in English).
    expect(row("Sets", "தொடைகள்").unit!.key).toBe("OL-U53");
    expect(row("Probability", "நிகழ்தகவு").unit!.key).toBe("OL-U53");
    expect(row("Geometric progressions", "பெருக்கல் விருத்தி").unit!.key).toBe("OL-U48");
    expect(row("Equations", "இருபடிச் சமன்பாடுகள்", "IIA").unit!.key).toBe("OL-U45");
    expect(row("Trigonometry", "திரிகோணகணிதம்", "IIA").unit!.key).toBe("OL-U47"); // Paper II A's, never Paper I A's
    // Nothing fits, or two fit as well: he taps it, and nothing is saved until he does.
    const tie = row("Equations", "", "IIA");
    expect(tie).toMatchObject({ state: "pick", title: "Equations · topic tute", words: "Which OL topic is it? Tap it below (Paper II · Part A)." });
    expect(tie.unit).toBeUndefined();
    expect(row("Volume of solids", "திண்மங்களின் கனவளவு").state).toBe("pick");
    const u44 = unit("OL-U44")._id;
    expect(row("Equations", "", "IIA", { 0: u44 })).toMatchObject({ state: "new", title: "OL · 03 Simultaneous equations · topic tute" });
    // His tap wins over a match; a topic of another part is never taken.
    expect(row("Constructions", "அமைப்புகள்", "IIB", { 0: unit("OL-U53")._id }).unit!.key).toBe("OL-U53");
    expect(row("Constructions", "அமைப்புகள்", "IIB", { 0: u44 }).unit!.key).toBe("OL-U49");
  });

  test("the same tute left on its Grade 11 unit by an older upload: saving moves it over first; another topic's is left alone", async () => {
    const r = readAs("Constructions", "அமைப்புகள்");
    await save(unit("G11-U23")._id, r);
    const books = await t.query(api.catalog.books, {});
    const [row] = uploadRows([r], units as never[], books as never[]);
    expect(row).toMatchObject({ state: "new", title: "OL · 08 Constructions · topic tute" });
    expect(row.moveFrom?.key).toBe("G11-U23");
    const other = (read(edit((j) => {
      j.unit = { no: 23, code: "U23", en: "Constructions", ta: "அமைப்புகள்" };
      j.title = "வேறு தலைப்பு";
    })) as ReadTute[])[0];
    expect(uploadRows([other], units as never[], books as never[])[0].moveFrom).toBeUndefined();
  });

  test("moving it: both books, keys, questions and every student's work go to the OL topic; the Grade 11 unit is left with no book", async () => {
    const g = unit("G11-U23")._id;
    const ol = unit("OL-U49")._id;
    await save(g, readAs("Constructions", "அமைப்புகள்"));
    const aqeeth = await t.mutation(api.students.add, { name: "Aqeeth", grade: 11, term: 3, stage: "fighter", unitId: g });
    const nila = await t.mutation(api.students.add, { name: "Nila", grade: 11, term: 1, stage: "master", unitId: unit("G11-U01")._id });
    const ravi = await t.mutation(api.students.add, { name: "Ravi", grade: 11, term: 1, stage: "master", unitId: unit("G11-U01")._id });
    await t.mutation(api.students.setGiven, { id: nila, unitId: g, stage: "master", given: true });
    await put(aqeeth, g, "fighter", { marks: RIGHT });
    await put(nila, g, "master", { m: { q: { "6": { got: 7, max: 10, lost: true, t: 1 } }, lv: { "1": { done: 1, fixed: 1, got: 7 } } } });
    const call = await raw.run(async (ctx) => {
      const now = Date.now();
      // Ravi goes back onto it after Exam Sprint; a draft of Nila's level 2; a corrector holds her paper; Theory called Aqeeth.
      await ctx.db.patch(ravi, { stage: "sprint", back: { stage: "fighter", unitId: g, term: 3 } });
      await ctx.db.insert("drafts", { studentId: nila, unitId: g, level: 2, q: { "7": { g: 5 } }, updatedAt: now });
      const owner = (await ctx.db.query("users").first())!;
      await ctx.db.insert("claims", { studentId: nila, unitId: g, userId: owner._id, name: "Owner", at: now, seenAt: now });
      // What Nila typed at home in its workbook.
      await ctx.db.insert("familyAnswers", { studentId: nila, unitId: g, n: 1, at: now, qs: [{ q: 6, a: ["5"], ok: [[false]] }] });
      return await ctx.db.insert("calls", { studentId: aqeeth, room: "theory", kind: "theory", status: "requested", group: "A", section: "A", unitId: g, stage: "fighter", createdAt: now });
    });

    expect(await move(g, ol)).toEqual({ students: 3, kept: false });
    expect(await booksOn(g)).toEqual(EMPTY);
    const on = await booksOn(ol);
    expect([on.books.map((b) => b.join(" ")).sort(), on.keys, on.questions, on.css]).toEqual([["fighter true 5 5", "master true 3 3"], 2, 8, 2]);
    expect((await t.query(api.catalog.key, { unitId: ol, stage: "fighter" }))!.answers).toHaveLength(5);
    expect((await t.query(api.catalog.question, { unitId: ol, stage: "master", q: 7 }))!.html).toContain('<span class="qn">7</span>');
    const after = await raw.run(async (ctx) => {
      const rows = await ctx.db.query("progress").collect();
      const a = (await ctx.db.get(aqeeth))!;
      return {
        aqeeth: [a.unitId, a.grade, a.term, a.stage],
        ravi: (await ctx.db.get(ravi))!.back,
        left: rows.filter((p) => p.unitId === g).length,
        marks: rows.find((p) => p.studentId === aqeeth && p.unitId === ol)?.marks,
        levels: rows.find((p) => p.studentId === nila && p.unitId === ol)?.m?.lv,
        given: (await ctx.db.query("handouts").collect()).map((h) => [h.unitId, h.stage]),
        drafts: (await ctx.db.query("drafts").collect()).map((d) => d.unitId),
        typed: (await ctx.db.query("familyAnswers").collect()).map((d) => d.unitId),
        claims: (await ctx.db.query("claims").collect()).length,
        call: (await ctx.db.get(call))!.unitId,
        line: (await ctx.db.query("events").collect()).filter((e) => e.kind === "book-move").map((e) => e.value),
      };
    });
    expect(after.aqeeth).toEqual([ol, 11, 3, "fighter"]); // his grade and term stay
    expect(after.ravi).toEqual({ stage: "fighter", unitId: ol, term: 3 });
    expect(after.left).toBe(0);
    expect(after.marks).toEqual(RIGHT);
    expect(after.levels).toEqual({ "1": { done: 1, fixed: 1, got: 7 } });
    expect(after.given).toEqual([[ol, "master"]]);
    expect(after.drafts).toEqual([ol]);
    expect(after.typed).toEqual([ol]);
    expect(after.claims).toBe(0); // the corrector's phone takes the paper again on its next ping
    expect(after.call).toBe(ol);
    expect(after.line).toEqual(["G11-U23 Constructions → OL-U49 Constructions, 3 students' work"]);
    // The class board puts him on the OL book.
    const board = (await t.query(api.state.get, {})) as { students: { _id: string; unitId?: string }[] };
    expect(board.students.find((s) => s._id === aqeeth)?.unitId).toBe(ol);
    // Done: nothing is left on Grade 11 to move.
    await expect(move(g, ol)).rejects.toThrow("Grade 11 · Constructions has no O/L tute in the app.");
  });

  test("refused, nothing changed: a school unit or another part as target, an OL topic with another book, a school workbook, someone without Books", async () => {
    const g = unit("G11-U23")._id;
    await save(g, readAs("Constructions", "அமைப்புகள்"));
    await expect(move(g, unit("G11-U24")._id)).rejects.toThrow("An O/L tute moves to an OL topic.");
    await expect(move(g, unit("OL-U44")._id)).rejects.toThrow("Simultaneous equations is in Paper II · Part A; the tute's papers say Paper II B.");
    const typed = { kind: "master" as const, parts: [{ id: "IIB" as const, from: 1, to: 1, kind: "cards" as const }], levels: [{ n: 1, from: 1, to: 1, max: 10 }], marks: { "1": 10 } };
    await raw.run(async (ctx) => {
      await ctx.db.insert("books", { unitId: unit("OL-U50")._id, stage: "master", data: typed, updatedAt: 1 });
      await ctx.db.insert("books", { unitId: unit("G11-U22")._id, stage: "master", data: typed, updatedAt: 1 });
    });
    await expect(move(g, unit("OL-U50")._id)).rejects.toThrow("Volume and logarithms has another book in the app. Nothing moved.");
    await expect(move(unit("G11-U22")._id, unit("OL-U49")._id)).rejects.toThrow("Grade 11 · Tangents has no O/L tute in the app.");
    const KALA = "kala-phone-token-0123456789abcdefghijklmnopqrstuvwx";
    await addPerson(raw, { name: "Kala", token: KALA, tabs: ["correction"] });
    await expect(asPhone(raw, KALA).mutation(api.catalog.moveTute, { unitId: g, toUnitId: unit("OL-U49")._id })).rejects.toThrow();
    expect((await booksOn(g)).books).toHaveLength(2);
    expect(await booksOn(unit("OL-U49")._id)).toEqual(EMPTY);
  });

  test("the OL topic has it already: its copy stays, the Grade 11 copy goes, the students come; work in both copies stops it", async () => {
    const g = unit("G11-U24")._id;
    const ol = unit("OL-U53")._id;
    const r = readAs("Sets", "தொடைகள்");
    await save(g, r);
    await save(ol, r);
    const idsOn = async (u: Id<"units">) => (await raw.run(async (ctx) => await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", u)).collect())).map((b) => b._id).sort();
    const olBooks = await idsOn(ol);
    const aqeeth = await t.mutation(api.students.add, { name: "Aqeeth", grade: 11, term: 3, stage: "fighter", unitId: g });
    const banu = await t.mutation(api.students.add, { name: "Banu", grade: 11, term: 3, stage: "fighter", unitId: g });
    await raw.run(async (ctx) => await ctx.db.patch(banu, { unitId: ol }));
    await put(aqeeth, g, "fighter", { marks: RIGHT });
    await put(aqeeth, ol, "fighter", { marks: {} }); // an empty row on the OL copy
    await put(banu, g, "fighter", { marks: RIGHT });
    await put(banu, ol, "fighter", { marks: { "4": { s: "wrong", t: 2 } } });
    await expect(move(g, ol)).rejects.toThrow("Banu already worked in Sets and probability too. Nothing moved.");
    expect((await booksOn(g)).books).toHaveLength(2);
    // Banu's Grade 11 marks were a mistake (taken off there): now it moves.
    await put(banu, g, "fighter", { marks: {} });
    expect(await move(g, ol)).toEqual({ students: 2, kept: true });
    expect(await booksOn(g)).toEqual(EMPTY);
    expect(await idsOn(ol)).toEqual(olBooks);
    const rows = await raw.run(async (ctx) => (await ctx.db.query("progress").collect()).filter((p) => p.stage === "fighter").map((p) => [p.studentId, p.unitId, Object.keys(p.marks).join()]));
    expect(rows.sort()).toEqual([[aqeeth, ol, "2"], [banu, ol, "4"]].sort());
    // A wrong tap on the OL side is never for good: it moves on to another topic of its part.
    expect(await move(ol, unit("OL-U48")._id)).toEqual({ students: 2, kept: false });
    expect((await booksOn(unit("OL-U48")._id)).books).toHaveLength(2);
    await expect(move(unit("OL-U48")._id, unit("OL-U48")._id)).rejects.toThrow("It is in Arithmetic and geometric progressions already.");
  });
});
