// Answer keys: read from answer-key.json in a unit's source zip, checked against the book, saved with the workbook,
// and read only by teachers while they correct. The key here is FAKE ("A1", "B53"): the repo is public, so his
// books' real answers never go in the code. The book is the skeleton of Grade 8 U01 (structure only).

import { convexTest } from "convex-test";
import { strToU8, zipSync } from "fflate";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import { outOf } from "../convex/lib/book";
import { boldRuns } from "../convex/lib/key";
import schema from "../convex/schema";
import { uploadRows } from "../src/upload";
import { readWorkbookFiles, readWorkbookHtml, type ReadWorkbook } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const FILE = "G8_U01_Workbook_source_v3.zip";
const BOOK = readWorkbookHtml(U01, FILE)[0];

type KeyQ = { q: number; part: string; marks: number; a: string | { p: string; a: string; m?: number }[] };

/** A fake key shaped exactly like the engine's answer-key.json for this book. */
function fakeKey(edit: (qs: KeyQ[]) => void = () => {}, grade = 8) {
  const qs: KeyQ[] = [];
  for (let q = 1; q <= 73; q++) {
    const m = outOf(BOOK.data, q)!;
    qs.push(q <= 52 ? { q, part: "I", marks: 2, a: `A${q}` } : { q, part: "II", marks: m, a: [{ p: "i", a: `work → **B${q}**`, m }] });
  }
  edit(qs);
  return { kind: "aristora-answer-key", version: 1, grade, units: [{ no: 1, code: "U01", en: "Number patterns", ta: "எண்கோலங்கள்", questions: qs }] };
}

function zip(key?: unknown, raw?: string) {
  const files: Record<string, Uint8Array> = { "book.html": strToU8(U01), "u01.py": strToU8("") };
  if (key !== undefined || raw !== undefined) files["answer-key.json"] = strToU8(raw ?? JSON.stringify(key));
  return readWorkbookFiles([{ name: FILE, bytes: zipSync(files) }]);
}

describe("reading the answer key from the unit's zip", () => {
  test("every question's answer, by its printed number; Part II with each part's marks", () => {
    const [w] = zip(fakeKey()) as ReadWorkbook[];
    expect(w.problems).toEqual([]);
    expect(w.key).toHaveLength(73);
    expect(w.key![0]).toEqual({ q: 1, a: "A1" });
    expect(w.key![52]).toEqual({ q: 53, parts: [{ p: "i", a: "work → **B53**", m: 3 }] });
    expect(boldRuns("work → **B53**")).toEqual([
      ["work → ", false],
      ["B53", true],
    ]);
  });

  test("a zip without a key: the book is read as before, no key", () => {
    const [w] = zip() as ReadWorkbook[];
    expect(w.problems).toEqual([]);
    expect(w.key).toBeNull();
  });

  test("a key made for another version of the book is refused (a question's marks differ)", () => {
    const [w] = zip(fakeKey((qs) => ((qs[54].a as { m?: number }[])[0].m = 3))) as ReadWorkbook[];
    expect(w.problems).toEqual(["The answer key is for another version of this book: question 55 is 2 marks in the book, 3 in the key."]);
    const [w2] = zip(fakeKey((qs) => (qs[54].marks = 3))) as ReadWorkbook[];
    expect(w2.problems).toEqual(["The answer key is for another version of this book: question 55 is 2 marks in the book, 3 in the key."]);
  });

  test("wrong grade, a question the book doesn't have, a broken or unknown file: refused, in plain words", () => {
    expect((zip(fakeKey(() => {}, 7))[0] as ReadWorkbook).problems).toEqual(["The answer key is for Grade 7, the book is Grade 8."]);
    expect((zip(fakeKey((qs) => qs.push({ q: 74, part: "II", marks: 2, a: "x" })))[0] as ReadWorkbook).problems).toEqual([
      "The answer key has a question 74; the book has 1 to 73.",
    ]);
    expect((zip(fakeKey((qs) => (qs[3].a = " ")))[0] as ReadWorkbook).problems).toEqual(["Question 4 has an empty answer in the key."]);
    expect((zip(undefined, "{not json")[0] as ReadWorkbook).problems).toEqual(["The answer key file can't be read."]);
    expect((zip({ kind: "something-else" })[0] as ReadWorkbook).problems).toEqual(["The answer key file isn't one the app knows."]);
  });

  test("the upload list says what happens to the key", () => {
    const unit = { _id: "u1", grade: 8, code: "U01", en: "Number patterns", ta: "எண்கோலங்கள்", term: 1, order: 1, key: "G8-U01" };
    const inApp = (keyCount: number | null) => [
      {
        unitId: "u1",
        stage: "master" as const,
        master: { parts: BOOK.data.parts, levels: BOOK.data.levels, total: BOOK.total, marksKnown: Object.keys(BOOK.data.marks!).length },
        keyCount,
      },
    ];
    // The same book, now with its key: saved again for the key.
    const [r] = uploadRows(zip(fakeKey()), [unit as never], inApp(null));
    expect(r).toMatchObject({ state: "replace", words: "Same book: adds its answer key", keyLine: { words: "✓ Answer key: all 73 questions", ok: true } });
    expect(uploadRows(zip(fakeKey()), [unit as never], inApp(73))[0].words).toBe("Same book: updates its answer key");
    // The same book, no key in the file: nothing to save, the key in the app stays.
    const [s] = uploadRows(zip(), [unit as never], inApp(73));
    expect(s).toMatchObject({ state: "same", keyLine: { words: "Keeps the answer key already in the app", ok: true } });
    // A new book without a key says so.
    expect(uploadRows(zip(), [unit as never], [])[0].keyLine).toEqual({ words: "No answer key in this file", ok: false });
  });
});

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

describe("saving and reading answer keys", () => {
  let t: Awaited<ReturnType<typeof asOwner>>;
  let raw: ReturnType<typeof fresh>;
  let unitId: Awaited<ReturnType<typeof getUnit>>;
  const getUnit = async () =>
    await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  const args = (w: ReadWorkbook) => ({
    unitId,
    parts: w.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: w.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: w.data.marks ?? {},
    replace: true,
  });
  const keyDoc = async () => await raw.run(async (ctx) => await ctx.db.query("keys").collect());
  const book = async () =>
    await raw.run(async (ctx) => await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", "master")).first());
  const lastLine = async () => await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "book-save").at(-1));

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    unitId = await getUnit();
  });

  test("an upload with its key: saved apart from the book, counted on the book, named in the history", async () => {
    const [w] = zip(fakeKey()) as ReadWorkbook[];
    expect(await t.mutation(api.catalog.saveWorkbook, { ...args(w), key: w.key! })).toBe(true);
    expect((await book())!.keyCount).toBe(73);
    expect((await book())!.data).not.toHaveProperty("answers"); // the board never carries the key
    expect((await keyDoc())[0].answers).toHaveLength(73);
    expect(await lastLine()).toMatchObject({ value: "12 levels, 230 marks (uploaded book) + answer key (73)" });
    const list = await t.query(api.catalog.books, {});
    expect(list.find((b) => b.unitId === unitId)?.keyCount).toBe(73);
  });

  test("teachers who correct, teach or keep the books read it; others and signed-out phones can't", async () => {
    const [w] = zip(fakeKey()) as ReadWorkbook[];
    await t.mutation(api.catalog.saveWorkbook, { ...args(w), key: w.key! });
    expect((await t.query(api.catalog.key, { unitId }))!.answers[52]).toEqual({ q: 53, parts: [{ p: "i", a: "work → **B53**", m: 3 }] });
    await addPerson(raw, { name: "Nila", token: "nila-token-0123456789abcdefghijklmnopqrstuvwxyz", tabs: ["evaluation"] });
    expect((await asPhone(raw, "nila-token-0123456789abcdefghijklmnopqrstuvwxyz").query(api.catalog.key, { unitId }))!.answers).toHaveLength(73);
    await addPerson(raw, { name: "Desk", token: "desk-token-0123456789abcdefghijklmnopqrstuvwxyz", tabs: [], can: ["students"] });
    await expect(asPhone(raw, "desk-token-0123456789abcdefghijklmnopqrstuvwxyz").query(api.catalog.key, { unitId })).rejects.toThrow(/This needs/);
    await expect(raw.query(api.catalog.key, { unitId })).rejects.toThrow();
  });

  test("a re-upload without a key keeps it while the questions are the same, and drops it when they changed", async () => {
    const [w] = zip(fakeKey()) as ReadWorkbook[];
    await t.mutation(api.catalog.saveWorkbook, { ...args(w), key: w.key! });
    await t.mutation(api.catalog.saveWorkbook, args(w));
    expect((await book())!.keyCount).toBe(73);
    expect(await keyDoc()).toHaveLength(1);
    // Part I re-cut into twenties: the answers would sit beside other questions' marks → the key goes.
    const recut = { ...args(w), levels: [{ to: 20, max: 40 }, { to: 40, max: 40 }, { to: 52, max: 24 }, ...args(w).levels.slice(5)] };
    await t.mutation(api.catalog.saveWorkbook, recut);
    expect((await book())!.keyCount).toBeUndefined();
    expect(await keyDoc()).toHaveLength(0);
    expect(await lastLine()).toMatchObject({ value: "10 levels, 230 marks (uploaded book) (old answer key removed)" });
    expect(await t.query(api.catalog.key, { unitId })).toBeNull();
  });

  test("students' marks are never touched by a re-upload with a key", async () => {
    const [w] = zip(fakeKey()) as ReadWorkbook[];
    await t.mutation(api.catalog.saveWorkbook, args(w));
    const id = await t.mutation(api.students.add, { name: "Hana", grade: 8, term: 1, stage: "master", unitId });
    const l1 = Array.from({ length: 10 }, (_, i) => ({ q: i + 1, got: i === 3 ? 0 : 2 }));
    await t.mutation(api.workbook.correct, { studentId: id, level: 1, items: l1 });
    const before = await raw.run(async (ctx) => (await ctx.db.query("progress").collect()).find((p) => p.studentId === id)!);
    await t.mutation(api.catalog.saveWorkbook, { ...args(w), key: w.key! });
    const after = await raw.run(async (ctx) => (await ctx.db.query("progress").collect()).find((p) => p.studentId === id)!);
    expect(after.m).toEqual(before.m);
    expect(after.m?.lv["1"]).toMatchObject({ got: 18 });
  });

  test("the server refuses a key that doesn't fit the book, or one sent without an uploaded book", async () => {
    const [w] = zip(fakeKey()) as ReadWorkbook[];
    const wrong = w.key!.map((k) => (k.q === 55 ? { q: 55, parts: [{ p: "i", a: "x", m: 3 }] } : k));
    await expect(t.mutation(api.catalog.saveWorkbook, { ...args(w), key: wrong })).rejects.toThrow(/another version of this book: question 55/);
    await expect(t.mutation(api.catalog.saveWorkbook, { ...args(w), replace: false, key: w.key! })).rejects.toThrow(
      /An answer key comes only with an uploaded workbook/,
    );
    expect(await keyDoc()).toHaveLength(0);
  });
});
