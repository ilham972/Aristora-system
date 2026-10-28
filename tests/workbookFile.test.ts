// Uploading workbooks: reading levels, parts and marks straight from the builder's book.html (or its unit zip).
// The fixture is a skeleton of the real Grade 8 U01 book (v3): its structure, none of its questions.

import { convexTest } from "convex-test";
import { zipSync, strToU8 } from "fflate";
import { describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { asOwner } from "./helpers";
import { nameHint, readWorkbookFiles, readWorkbookHtml, type ReadWorkbook } from "../src/workbookFile";
import U01 from "./fixtures/workbook-g8-u01.html?raw";
import U03 from "./fixtures/workbook-g8-u03.html?raw";
import U10 from "./fixtures/workbook-g8-u10.html?raw";

const FILE = "G8_U01_Workbook_source_v3.zip";
const LEVEL_MAX = [20, 20, 20, 20, 24, 18, 22, 20, 19, 18, 20, 9];
const CARD_MARKS = { 53: 3, 54: 3, 55: 2, 56: 6, 57: 4, 58: 5, 59: 7, 60: 3, 61: 7, 62: 3, 63: 11, 64: 6, 65: 6, 66: 2, 67: 11, 68: 11, 69: 7, 70: 4, 71: 8, 72: 8, 73: 9 };

function expectU01(w: ReadWorkbook) {
  expect(w.problems).toEqual([]);
  expect(w).toMatchObject({ grade: 8, unitNo: 1, code: "U01", en: "Number patterns", ta: "எண்கோலங்கள்", total: 230 });
  expect(w.data.parts).toEqual([
    { id: "I", from: 1, to: 52, kind: "short", each: 2 },
    { id: "II", from: 53, to: 73, kind: "cards" },
  ]);
  expect(w.data.levels.map((l) => l.max)).toEqual(LEVEL_MAX);
  expect(w.data.levels[5]).toEqual({ n: 6, from: 53, to: 57, max: 18 });
  expect(w.data.levels[11]).toEqual({ n: 12, from: 73, to: 73, max: 9 });
  expect(w.data.marks).toEqual(Object.fromEntries(Object.entries(CARD_MARKS).map(([k, v]) => [k, v])));
}

describe("reading a workbook file", () => {
  test("Grade 8 U01: two parts, 12 levels, 230 marks, every Part II question's marks", () => {
    const read = readWorkbookHtml(U01, FILE);
    expect(read).toHaveLength(1);
    expectU01(read[0]);
  });

  test("a marks sheet that starts a new page (class \"msh pt\", its page footer inside): Grade 8 U10", () => {
    const [w] = readWorkbookHtml(U10, "G8_U10_Workbook_source_v2.zip");
    expect(w.problems).toEqual([]);
    expect(w).toMatchObject({ grade: 8, code: "U10", en: "Indices", total: 148 });
    expect(w.data.parts.map((p) => [p.id, p.from, p.to])).toEqual([
      ["I", 1, 43],
      ["II", 44, 58],
    ]);
    expect(w.data.levels.map((l) => l.max)).toEqual([20, 20, 20, 26, 19, 22, 21]);
  });

  test("a part whose levels wrap onto a second row of the marks sheet: Grade 8 U03, 24 levels", () => {
    const [w] = readWorkbookHtml(U03, "G8_U03_Workbook_source_v4.zip");
    expect(w.problems).toEqual([]);
    expect(w).toMatchObject({ grade: 8, code: "U03", en: "Angles", total: 467 });
    expect(w.data.parts.map((p) => [p.id, p.from, p.to])).toEqual([
      ["I", 1, 88],
      ["II", 89, 131],
    ]);
    expect(w.data.levels).toHaveLength(24);
    expect(w.data.levels[8]).toEqual({ n: 9, from: 81, to: 88, max: 16 });
    expect(w.data.levels[17]).toEqual({ n: 18, from: 113, to: 115, max: 19 }); // first level of the second row
    expect(w.data.levels[23]).toEqual({ n: 24, from: 131, to: 131, max: 14 });
  });

  test("the unit's source zip: book.html is found inside, the Python files are ignored", () => {
    const zip = zipSync({ "book.html": strToU8(U01), "u01.py": strToU8("print('not read')"), "book.py": strToU8("") });
    const read = readWorkbookFiles([{ name: FILE, bytes: zip }]);
    expect(read).toHaveLength(1);
    expectU01(read[0] as ReadWorkbook);
  });

  test("a merged volume: each unit read on its own, numbers restarting at 1", () => {
    // Unit 2: the same skeleton, renamed, with card ids running on (data-q is global in a volume).
    const u02 = U01.replace(/data-q="(\d+)"/g, (_: string, q: string) => `data-q="${Number(q) + 73}"`)
      .replace("அலகு 1 · எண்கோலங்கள்", "அலகு 2 · சுற்றளவு")
      .replace(/UNIT 1 · Number patterns/g, "UNIT 2 · Perimeter");
    const read = readWorkbookHtml(U01 + u02, "G8_Workbook_Volume1_v2.zip");
    expect(read.map((w) => [w.code, w.en, w.ta, w.total, w.problems.length])).toEqual([
      ["U01", "Number patterns", "எண்கோலங்கள்", 230, 0],
      ["U02", "Perimeter", "சுற்றளவு", 230, 0],
    ]);
    expect(read[1].data.marks?.["53"]).toBe(3);
  });

  test("a book whose marks don't add up is refused, with the level named", () => {
    // Question 53 (Level 6) prints (1 mark) + (2 marks); make its first part 2 marks.
    const wrong = U01.replace('<span class="qn">53</span>\n<span class="pm">(1 புள்ளி)', '<span class="qn">53</span>\n<span class="pm">(2 புள்ளிகள்)');
    expect(wrong).not.toBe(U01);
    const [w] = readWorkbookHtml(wrong, FILE);
    expect(w.problems).toContain("Level 6 prints / 18, but its questions add up to 19.");
  });

  test("the grade in the file name must agree with the book", () => {
    const [w] = readWorkbookHtml(U01, "G7_U01_Workbook_source_v3.zip");
    expect(w.problems).toContain("The book says Grade 8 but the file name says Grade 7.");
  });

  test("files that aren't workbooks say so", () => {
    const read = readWorkbookFiles([
      { name: "scan.pdf", bytes: strToU8("%PDF-1.7") },
      { name: "notes.html", bytes: strToU8("<p>hello</p>") },
      { name: "G8_U02.zip", bytes: zipSync({ "u02.py": strToU8("x = 1") }) },
    ]);
    expect(read).toEqual([
      { file: "scan.pdf", problem: "Not a workbook zip or book.html." },
      { file: "notes.html", problem: "No marks sheet inside: is this a workbook (level edition)?" },
      { file: "G8_U02.zip", problem: "No marks sheet inside: is this a workbook (level edition)?" },
    ]);
    expect(nameHint("G10_U03_Workbook_source_v1.zip")).toEqual({ grade: 10, unitNo: 3 });
  });
});

describe("saving an uploaded workbook", () => {
  test("an uploaded book replaces the old marks (a re-cut book never keeps stale ones)", async () => {
    const t = await asOwner(convexTest(schema, import.meta.glob("../convex/**/*.ts")));
    await t.mutation(api.setup.ensure, {});
    const unitId = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
    // An older, typed-in version: Part I ended at 50, and questions 51-52 were long ones of 3 marks.
    const oldMarks = { ...CARD_MARKS, 51: 3, 52: 3 };
    await t.mutation(api.catalog.saveWorkbook, {
      unitId,
      parts: [{ id: "I", to: 50, each: 2 }, { id: "II", to: 73 }],
      levels: [{ to: 50, max: 100 }, { to: 73, max: 132 }],
      marks: Object.fromEntries(Object.entries(oldMarks).map(([k, v]) => [k, v])),
    });
    const [w] = readWorkbookHtml(U01, FILE);
    const args = {
      unitId,
      parts: w.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: w.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: w.data.marks ?? {},
    };
    // Kept old marks would make Level 5 (41-52) 26 instead of 24.
    await expect(t.mutation(api.catalog.saveWorkbook, args)).rejects.toThrow(/Level 5: its questions add up to 26, not 24/);
    expect(await t.mutation(api.catalog.saveWorkbook, { ...args, replace: true })).toBe(true);
    const book = await t.run(async (ctx) => await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", "master")).first());
    expect(book!.data.kind === "master" && book!.data.levels.length).toBe(12);
    expect(book!.data.kind === "master" && Object.keys(book!.data.marks ?? {}).map(Number).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 21 }, (_, i) => 53 + i),
    );
    const line = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "book-save").at(-1));
    expect(line).toMatchObject({ unit: "G8-U01", value: "12 levels, 230 marks (uploaded book)", who: "Owner" });
  });
});
