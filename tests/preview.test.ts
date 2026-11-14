// The owner's Preview of a Stage (5 Nov 2026, his ask: check every level's questions without doing them in order; his
// answers: only the owner, only looking). convex/preview.ts: queries only, the owner only, every level open, the same
// level form a student gets, and no student's rule changed. Fake answers only (the repo is public); the book is the
// U01 skeleton.
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { outOf } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const FAM = "family-phone-token-preview-0123456789abcdefghijklmn";
const BOOKS = "books-teacher-token-preview-0123456789abcdefghij";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

/** A made-up key with kinds: numbers in boxes; Q10 a name to tap; Q20 ஆம் / இல்லை and a reason; Part II a box a part. */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) {
    if (q === 10) out.push({ q, a: "Name B", t: { k: "choose", n: 3, a: 2, items: ["Name A", "Name B", "Name C"], below: true } });
    else if (q === 20) out.push({ q, a: "இல்லை: a made-up reason", t: { k: "why", a: false } });
    else out.push({ q, a: String(q * 7), t: { k: "box", b: [{ v: [String(q * 7)] }] } });
  }
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `**${q + 100}**`, m: outOf(BOOK.data, q)!, t: { k: "box", b: [{ v: [String(q + 100)] }] } }] });
  return out;
}

describe("the owner's Preview", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u01 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey(),
    });
    const hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", "hana-preview-link-012345") });
    await raw.mutation(api.family.join, { code: "hana-preview-link-012345", token: FAM, label: "Android" });
    await addPerson(raw, { name: "Mala", token: BOOKS, tabs: ["correction"], can: ["books"] });
  });

  test("every level open: the last one without doing any before it", async () => {
    const u = await t.query(api.preview.unit, { unitId: u01 });
    expect(u.levels.map((l) => l.n)).toEqual(BOOK.data.levels.map((l) => l.n));
    expect(u.world.open && u.world.levels.every((l) => l.s === "play")).toBe(true);
    expect(u.levels[0]).toMatchObject({ n: 1, from: 1, qs: u.levels[0].to });
    const last = BOOK.data.levels[BOOK.data.levels.length - 1];
    const lv = await t.query(api.preview.level, { unitId: u01, n: last.n });
    expect(lv.qs.map((q) => q.q)).toEqual(Array.from({ length: last.to - last.from + 1 }, (_, i) => last.from + i));
    expect((await t.query(api.preview.questions, { unitId: u01, n: last.n })).qs).toEqual([]); // no printed questions saved here
    await expect(t.query(api.preview.level, { unitId: u01, n: 99 })).rejects.toThrow(/not in this Stage/);
  });

  test("the same level a student gets: names under the question, ஆம் / இல்லை and a reason, boxes", async () => {
    const fam = asPhone(raw, FAM);
    for (const n of [1, 2]) {
      const mine = await t.query(api.preview.level, { unitId: u01, n });
      // The same level but for the phone's own Check after every question (`each`): his Preview never checks.
      if (n === 1) expect({ ...mine, each: true }).toEqual(await fam.query(api.family.level, { unitId: u01, n }));
      expect(mine.qs.length).toBeGreaterThan(0);
    }
    const one = await t.query(api.preview.level, { unitId: u01, n: 1 });
    expect(one.qs.find((q) => q.q === 10)?.parts[0].ui).toMatchObject({ k: "choose", items: ["Name A", "Name B", "Name C"], below: true });
    const two = await t.query(api.preview.level, { unitId: u01, n: 2 });
    expect(two.qs.find((q) => q.q === 20)?.parts[0].ui).toEqual({ k: "why" });
  });

  test("only the owner: a teacher with Books, a family phone and no sign-in are refused", async () => {
    await expect(asPhone(raw, BOOKS).query(api.preview.unit, { unitId: u01 })).rejects.toThrow(/This needs/);
    await expect(asPhone(raw, FAM).query(api.preview.level, { unitId: u01, n: 1 })).rejects.toThrow(/signed out/);
    await expect(raw.query(api.preview.questions, { unitId: u01, n: 1 })).rejects.toThrow(/signed out/);
  });

  test("students' rules unchanged: Hana still does her levels in order after the owner looked", async () => {
    await t.query(api.preview.level, { unitId: u01, n: 3 });
    const fam = asPhone(raw, FAM);
    await expect(fam.query(api.family.level, { unitId: u01, n: 3 })).rejects.toThrow(/in order/);
    expect((await fam.query(api.family.level, { unitId: u01, n: 1 })).n).toBe(1);
  });
});
