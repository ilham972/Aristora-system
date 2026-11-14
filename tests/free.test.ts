// Free marks for a question out of the syllabus (5 Nov 2026, his ask: the printed book keeps it, everyone gets its
// marks without doing it; his answers: the students who did its level already get them too, and Correction gives them
// in class). convex/preview.ts `setFree` (the owner only, from his Preview), convex/lib/free.ts. Fake answers only (the
// repo is public); the book is the U01 skeleton.
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { outOf, type MasterData } from "../convex/lib/book";
import { freeRow, setFreeIn } from "../convex/lib/free";
import type { KeyAnswer } from "../convex/lib/key";
import { computeMaster, type MState } from "../convex/lib/master";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const FAM = "family-phone-token-free-marks-0123456789abcdefghij";
const BOOKS = "books-teacher-token-free-marks-0123456789abcdefg";
const PICKED = "photos-teacher-token-free-marks-0123456789abcde";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

/** Made-up key with kinds: Q1–9 a number in a box (Q8 = 24), Q10 "is it true? give a reason" (இல்லை). */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) {
    const a = q === 8 ? "24" : String(q * 3);
    out.push(q === 10 ? { q, a: "இல்லை: a made-up reason", t: { k: "why", a: false } } : { q, a, t: { k: "box", b: [{ v: [a] }] } });
  }
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `**${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}
/** Level 1 as Hana types it: all right but Q8; Q10 her ஆம் / இல்லை right and a reason (the teacher reads it). */
const LEVEL1 = [1, 2, 3, 4, 5, 6, 7, 9].map((q) => ({ q, a: [String(q * 3)] })).concat([{ q: 8, a: ["42"] }, { q: 10, a: ["0", "a made-up reason"] }]);

describe("the rows", () => {
  test("free: its full marks, the row before kept once; taken back: the row as it was, the level's total with it", () => {
    const lost = { got: 0, max: 2, lost: true, t: 5, x: 9 };
    expect(freeRow(2, undefined, 7)).toEqual({ got: 2, max: 2, lost: false, t: 7, fr: "none" });
    expect(freeRow(2, lost, 7)).toEqual({ got: 2, max: 2, lost: false, t: 5, fr: lost });
    const book = { ...BOOK.data, free: [8] };
    const m: MState = { q: { "8": lost }, lv: { "1": { done: 1, fixed: 2, got: 16 } } } as MState;
    expect(setFreeIn(m, book, 8, true, 10)).toBe(true);
    expect(m.q["8"]).toEqual({ got: 2, max: 2, lost: false, t: 5, fr: lost });
    expect(m.lv["1"].got).toBe(18);
    expect(setFreeIn(m, book, 8, true, 11)).toBe(false); // once
    expect(setFreeIn(m, book, 8, false, 12)).toBe(true);
    expect(m.q["8"]).toEqual(lost);
    expect(m.lv["1"].got).toBe(16);
    // A level not marked yet: nothing now (its Check or Save gives them).
    const open: MState = { q: {}, lv: {} } as MState;
    expect(setFreeIn(open, book, 8, true, 10)).toBe(false);
    expect(open).toEqual({ q: {}, lv: {} });
  });
});

describe("free marks", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let hana: Id<"students">;
  const fam = () => asPhone(raw, FAM);
  const hanaM = async () =>
    (await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student_unit_stage", (q) => q.eq("studentId", hana).eq("unitId", u01).eq("stage", "master")).first())?.m)) as MState;
  const save = async (over: Partial<{ levels: { to: number; max: number }[]; marks: Record<string, number> }> = {}) =>
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: over.levels ?? BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: over.marks ?? BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey(),
    });
  const bookFree = async () => (await raw.run(async (ctx) => (await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", u01).eq("stage", "master")).first())!.data)) as MasterData;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T17:00:00+05:30"));
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u01 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
    await save();
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", "hana-free-link-0123456") });
    await raw.mutation(api.family.join, { code: "hana-free-link-0123456", token: FAM, label: "Android" });
    await addPerson(raw, { name: "Mala", token: BOOKS, tabs: ["correction"], can: ["books"] });
    await addPerson(raw, { name: "Nila", token: PICKED, tabs: [], can: ["photos"] });
  });
  afterEach(() => vi.useRealTimers());

  test("only the owner: a teacher with Books and a family phone are refused", async () => {
    await expect(asPhone(raw, BOOKS).mutation(api.preview.setFree, { unitId: u01, q: 8, free: true })).rejects.toThrow(/This needs/);
    await expect(fam().mutation(api.preview.setFree, { unitId: u01, q: 8, free: true })).rejects.toThrow(/signed out/);
    await expect(t.mutation(api.preview.setFree, { unitId: u01, q: 999, free: true })).rejects.toThrow(/not in this workbook/);
    expect((await bookFree()).free).toBeUndefined();
  });

  test("a level not done yet: no boxes for it, its marks at Check (a gift on the phone), nothing for Evaluation", async () => {
    expect(await t.mutation(api.preview.setFree, { unitId: u01, q: 8, free: true })).toEqual({ students: 0 });
    expect((await bookFree()).free).toEqual([8]);
    const lv = await fam().query(api.family.level, { unitId: u01, n: 1 });
    expect(lv.qs.find((q) => q.q === 8)).toEqual({ q: 8, max: 2, parts: [], part: lv.qs[0].part, free: true });
    expect({ ...(await t.query(api.preview.level, { unitId: u01, n: 1 })), each: true }).toEqual(lv); // his Preview shows the same (it never checks: no `each`)
    expect((await t.query(api.preview.unit, { unitId: u01 })).levels[0]).toMatchObject({ n: 1, free: 1, qs: 10 });
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 }); // Q8 still typed wrong
    expect(r.results.find((x) => x.q === 8)).toEqual({ q: 8, max: 2, ok: [], got: 2, phoneGot: 2, free: true });
    expect(r.got).toBe(18);
    const m = await hanaM();
    expect(m.q["8"]).toMatchObject({ got: 2, max: 2, lost: false, fr: "none" });
    expect(computeMaster(m, BOOK.data).pending).toEqual([]);
    expect(r.book!.qs.find((x) => x.q === 8)).toMatchObject({ free: true, got: 2, owe: [], sol: null });
    expect((await fam().query(api.family.me, {})).xp).toBe(18);
  });

  test("them too: a level marked already gets the marks at once; taken back, all as it was", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    let m = await hanaM();
    expect(m.lv["1"].got).toBe(16);
    expect(computeMaster(m, BOOK.data).pending).toEqual([8]);
    expect((await fam().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 8)!.owe).toEqual([]); // no photo of his working (10 Nov 2026)

    expect(await t.mutation(api.preview.setFree, { unitId: u01, q: 8, free: true })).toEqual({ students: 1 });
    m = await hanaM();
    expect(m.lv["1"].got).toBe(18);
    expect(m.q["8"]).toMatchObject({ got: 2, lost: false, fr: { got: 0, max: 2, lost: true } });
    expect(computeMaster(m, BOOK.data).pending).toEqual([]); // Evaluation has nothing to explain
    const q8 = (await fam().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 8)!;
    expect(q8).toMatchObject({ free: true, got: 2, owe: [] }); // no photo of his working any more
    expect((await fam().query(api.family.me, {})).xp).toBe(18);

    expect(await t.mutation(api.preview.setFree, { unitId: u01, q: 8, free: false })).toEqual({ students: 1 });
    m = await hanaM();
    expect(m.lv["1"].got).toBe(16);
    expect(m.q["8"]).toMatchObject({ got: 0, max: 2, lost: true });
    expect(m.q["8"].fr).toBeUndefined();
    expect(computeMaster(m, BOOK.data).pending).toEqual([8]);
    expect((await fam().query(api.family.me, {})).xp).toBe(16);
    const lines = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("free-marks")).map((e) => [e.kind, e.q, e.value]));
    expect(lines).toEqual([
      ["free-marks", 8, "1 student"],
      ["free-marks-off", 8, "1 student"],
    ]);
  });

  test("a typed reason waiting for a teacher closes (its marks his); open again when taken back", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    const picked = asPhone(raw, PICKED);
    expect((await picked.query(api.photos.queue, {})).map((i) => i.q)).toEqual([10]);
    const waiting = await picked.query(api.photos.student, { studentId: hana });
    expect(waiting.map((i) => i.q)).toEqual([10]);
    expect((await picked.query(api.photos.lane, {})).map((r) => r.id)).toEqual([hana]);
    await t.mutation(api.preview.setFree, { unitId: u01, q: 10, free: true });
    expect(await picked.query(api.photos.queue, {})).toEqual([]);
    expect(await picked.query(api.photos.count, {})).toEqual({ n: 0, late: false });
    // Correction's ⌂ lane: he leaves it, and a teacher who still had his card open is told why.
    expect(await picked.query(api.photos.lane, {})).toEqual([]);
    expect(await picked.query(api.photos.student, { studentId: hana })).toEqual([]);
    await expect(picked.mutation(api.photos.mark, { id: waiting[0].id, got: 2 })).rejects.toThrow(/free marks now/);
    expect((await hanaM()).q["10"]).toMatchObject({ got: 2, lost: false, fr: "none" });
    expect((await hanaM()).lv["1"].got).toBe(18);
    await t.mutation(api.preview.setFree, { unitId: u01, q: 10, free: false });
    expect((await picked.query(api.photos.queue, {})).map((i) => i.q)).toEqual([10]);
    expect((await picked.query(api.photos.lane, {})).map((r) => r.id)).toEqual([hana]);
    expect((await hanaM()).q["10"]).toBeUndefined();
    expect((await hanaM()).lv["1"].got).toBe(16);
  });

  test("Correction too: a free question gets its marks whatever is tapped", async () => {
    await t.mutation(api.preview.setFree, { unitId: u01, q: 8, free: true });
    const items = Array.from({ length: 10 }, (_, i) => ({ q: i + 1, got: i + 1 === 8 ? 0 : 2 }));
    const res = await t.mutation(api.workbook.correct, { studentId: hana, unitId: u01, level: 1, items, by: "correction" });
    expect(res.got).toBe(20);
    const m = await hanaM();
    expect(m.q["8"]).toMatchObject({ got: 2, max: 2, lost: false });
    expect(m.lv["1"]).toMatchObject({ got: 20, by: "correction" });
  });

  test("the same book uploaded again keeps them; a book of other questions starts with none; marks must be known", async () => {
    await t.mutation(api.preview.setFree, { unitId: u01, q: 8, free: true });
    await save();
    expect((await bookFree()).free).toEqual([8]);
    const levels = BOOK.data.levels.map((l) => ({ to: l.to, max: l.max }));
    await save({ levels: [{ to: levels[1].to, max: levels[0].max + levels[1].max }, ...levels.slice(2)] }); // Levels 1 and 2 as one
    expect((await bookFree()).free).toBeUndefined();
    // No marks for Part II: a Part II question can't be free (its marks aren't known).
    await save({ marks: {} });
    const q = BOOK.data.parts.find((p) => p.kind !== "short")!.from;
    await expect(t.mutation(api.preview.setFree, { unitId: u01, q, free: true })).rejects.toThrow(/every question's marks/);
  });
});
