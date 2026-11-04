// Photos from home (4 Nov 2026): what a Check asks of him (the parts only a teacher can mark, his working on each wrong
// answer), the key's working shown only where he lost marks, uploads, his 2-level limit, the teachers' queue (marks,
// causes, retakes), and nothing kept (files gone a day after marking). Fake answers only (the repo is public); the
// book is the U01 skeleton.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { wipeStudent } from "../convex/lib/backend";
import { outOf } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import { computeMaster } from "../convex/lib/master";
import { blockedBy, owedOf, PHOTO_BYTES, PHOTO_URLS_PER_DAY, WHY } from "../convex/lib/photos";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const FAM = "family-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const PICKED = "photos-teacher-token-0123456789abcdefghijklmnopqrstu";
const CORRECTOR = "corrector-token-0123456789abcdefghijklmnopqrstu";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

/** Fake key: Level 1 = Q1–10; Q10 is a name (the teacher's: a photo); Q8 = "**24**" with working before it. */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) out.push({ q, a: q % 10 === 0 ? "சிறப்புப் பெயர்" : q === 8 ? "8 × 3 = **24**" : String(q * 3) });
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `**${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}
/** Level 1 as Hana types it: all right but Q8 (the phone can't mark Q10). */
const LEVEL1 = [1, 2, 3, 4, 5, 6, 7, 9].map((q) => ({ q, a: [String(q * 3)] })).concat([{ q: 8, a: ["42"] }]);

describe("the rules", () => {
  test("owed: a part not marked and not sent, a wrong answer not explained and not sent; retakes owed again; off = none", () => {
    const owe = { part: [10], working: [8] };
    const lost = { got: 0, max: 2, lost: true, t: 1 };
    expect(owedOf(owe, [], { "8": lost }, true)).toEqual([{ q: 8, kind: "working" }, { q: 10, kind: "part" }]);
    expect(owedOf(owe, [{ q: 10, kind: "part", state: "waiting" }], { "8": lost }, true)).toEqual([{ q: 8, kind: "working" }]);
    expect(owedOf(owe, [{ q: 10, kind: "part", state: "retake" }], { "8": lost }, true)).toHaveLength(2);
    expect(owedOf(owe, [], { "8": { ...lost, x: 5 }, "10": { got: 2, max: 2, lost: false, t: 1 } }, true)).toEqual([]); // done in class
    expect(owedOf(owe, [], { "8": lost }, false)).toEqual([]);
    expect(owedOf(undefined, [], { "8": lost }, true)).toEqual([]); // a Check from before photos
  });

  test("the limit: two more levels after one that owes; the third waits", () => {
    const c = (n: number, owed: number) => ({ unitId: "u", n, at: n, owed });
    expect(blockedBy([c(1, 2), c(2, 0)])).toBeNull();
    expect(blockedBy([c(1, 2), c(2, 0), c(3, 1)])).toEqual(c(1, 2));
    expect(blockedBy([c(1, 0), c(2, 0), c(3, 1)])).toBeNull();
    expect(Object.values(WHY).every((w) => w.ta && w.en)).toBe(true);
  });
});

describe("photos from home", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let hana: Id<"students">;
  const fam = () => asPhone(raw, FAM);
  const picked = () => asPhone(raw, PICKED);
  const jpeg = async (bytes = 200 * 1024, type = "image/jpeg") =>
    await raw.run(async (ctx) => await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type })));
  const exists = async (id: Id<"_storage">) => await raw.run(async (ctx) => (await ctx.storage.get(id)) !== null);
  const hanaM = async () =>
    (await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", hana)).first())?.m))!;
  const level = (n: number) => fam().query(api.family.level, { unitId: u01, n });
  const checkEmpty = async (n: number) => {
    const qs = (await level(n)).qs.map((q) => ({ q: q.q, a: [] as string[] }));
    return await fam().mutation(api.family.check, { unitId: u01, n, typed: qs });
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T19:00:00+05:30"));
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
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", "hana-photo-link-0123456") });
    await raw.mutation(api.family.join, { code: "hana-photo-link-0123456", token: FAM, label: "Android" });
    await addPerson(raw, { name: "Nila", token: PICKED, tabs: [], can: ["photos"] });
    await addPerson(raw, { name: "Raj", token: CORRECTOR, tabs: ["correction"] });
  });
  afterEach(() => vi.useRealTimers());

  test("Check: the book shows the key's working only where he lost marks, and the photos it asks for", async () => {
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    const q = (n: number) => r.book!.qs.find((x) => x.q === n)!;
    expect(q(8)).toMatchObject({ got: 0, sol: "8 × 3 = **24**", owe: ["working"], typed: ["42"] });
    expect(q(1)).toMatchObject({ got: 2, sol: null, owe: [] }); // right: no solution
    expect(q(10)).toMatchObject({ got: null, teach: 2, sol: null, owe: ["part"] });
    expect(await fam().query(api.family.book, { unitId: u01, n: 1 })).toEqual(r.book);
    await expect(fam().query(api.family.book, { unitId: u01, n: 2 })).rejects.toThrow(/isn't marked/);
    // The Stage: Level 1 owes 2 photos.
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0]).toMatchObject({ s: "check", ph: 2 });
  });

  test("sending: an upload address (a few dozen a day), 1–3 image files, only for questions that need one; again replaces", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    expect(await fam().mutation(api.family.photoUrl, {})).toMatch(/upload/);
    const a = await jpeg();
    const b = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [a] });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "working", files: [b] });
    const book = await fam().query(api.family.book, { unitId: u01, n: 1 });
    expect(book.qs.find((x) => x.q === 10)).toMatchObject({ owe: [], photos: [{ kind: "part", state: "waiting" }] });
    expect(book.qs.find((x) => x.q === 8)!.owe).toEqual([]);
    // Again: the new photo replaces the old (its file goes).
    const a2 = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [a2] });
    expect(await exists(a)).toBe(false);
    // Refused: a right answer, the wrong kind, a file too big (deleted), too many, not an image.
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 1, kind: "working", files: [await jpeg()] })).rejects.toThrow(/doesn't need/);
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "working", files: [await jpeg()] })).rejects.toThrow(/doesn't need/);
    const big = await jpeg(PHOTO_BYTES + 1);
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "working", files: [big] })).rejects.toThrow(/too big/);
    expect(await exists(big)).toBe(true); // never attached: the hourly sweep takes it after a day
    const four = [await jpeg(), await jpeg(), await jpeg(), await jpeg()];
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "working", files: four })).rejects.toThrow(/1 முதல் 3/);
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "working", files: [await jpeg(10, "text/plain")] })).rejects.toThrow(/too big/);
    // A few dozen upload addresses a day.
    for (let i = 1; i < PHOTO_URLS_PER_DAY; i++) await fam().mutation(api.family.photoUrl, {});
    await expect(fam().mutation(api.family.photoUrl, {})).rejects.toThrow(/நாளை/);
  });

  test("his limit: two more levels after one that owes photos; the next waits until he sends them (or the owner turns it off)", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await checkEmpty(2);
    await checkEmpty(3);
    const me = await fam().query(api.family.me, {});
    expect(me.blocked).toMatchObject({ unitId: u01, no: 1, n: 1, owed: 2 });
    await expect(level(4)).rejects.toThrow(/Level 1 இன் படங்களை/);
    // He sends Level 1's two photos: Level 4 opens (levels 2 and 3 owe photos too, but only 0 and 1 levels came after them).
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "working", files: [await jpeg()] });
    expect((await fam().query(api.family.me, {})).blocked).toBeNull();
    expect((await level(4)).n).toBe(4);
    await checkEmpty(4);
    expect((await fam().query(api.family.me, {})).blocked).toMatchObject({ n: 2 });
    // The owner turns it off: nothing waits.
    await expect(picked().mutation(api.photos.setRequired, { on: false })).rejects.toThrow(/owner/);
    await t.mutation(api.photos.setRequired, { on: false });
    expect((await fam().query(api.family.me, {})).blocked).toBeNull();
    expect(await t.query(api.photos.required, {})).toBe(false);
  });

  test("the queue: only the owner and people with Photos; marks for a part reach his XP; a cause explains a wrong answer", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "working", files: [await jpeg()] });
    await expect(asPhone(raw, CORRECTOR).query(api.photos.queue, {})).rejects.toThrow(/Photos/);
    expect(await picked().query(api.photos.count, {})).toEqual({ n: 2, late: false });
    const items = await picked().query(api.photos.queue, {});
    expect(items.map((i) => [i.q, i.kind, i.teach, i.urls.length])).toEqual([
      [10, "part", 2, 1],
      [8, "working", 0, 1],
    ]);
    expect(items[1]).toMatchObject({ typed: ["42"], key: "8 × 3 = **24**", got: 0, student: { name: "Hana K" } });
    const xp = (await fam().query(api.family.me, {})).xp;
    await expect(picked().mutation(api.photos.mark, { id: items[0].id, got: 3 })).rejects.toThrow(/0 to 2/);
    await picked().mutation(api.photos.mark, { id: items[0].id, got: 2, why: "good" });
    await picked().mutation(api.photos.mark, { id: items[1].id, why: "point", note: "Look at the point" });
    await expect(picked().mutation(api.photos.mark, { id: items[1].id, why: "slip" })).rejects.toThrow(/already answered/);
    const m = await hanaM();
    expect(m.q["10"]).toMatchObject({ got: 2, max: 2, lost: false });
    expect(m.lv["1"].got).toBe(16 + 2);
    expect(m.q["8"].x).toBeDefined(); // explained at home: Evaluation skips it
    expect(computeMaster(m, BOOK.data).pending).toEqual([]);
    const me = await fam().query(api.family.me, {});
    expect(me.xp).toBe(xp + 2);
    expect(me.worlds[0].levels[0]).toMatchObject({ nw: 2 });
    const book = await fam().query(api.family.book, { unitId: u01, n: 1 });
    expect(book.qs.find((x) => x.q === 8)!.photos[0]).toMatchObject({ state: "done", say: WHY.point.ta, note: "Look at the point", fresh: true });
    expect(book.qs.find((x) => x.q === 10)).toMatchObject({ got: 2, photos: [{ got: 2, say: WHY.good.ta }] });
    await fam().mutation(api.family.seen, { unitId: u01, n: 1 });
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0].nw).toBeUndefined();
    expect(await picked().query(api.photos.count, {})).toEqual({ n: 0, late: false });
    const lines = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("photo")).map((e) => e.value));
    expect(lines).toEqual(["1 2/2", "1 point"]);
  });

  test("a retake: the files go at once and the photo is owed again; a part marked in class first only closes", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    const f = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [f] });
    const [item] = await picked().query(api.photos.queue, {});
    await expect(picked().mutation(api.photos.retake, { id: item.id, why: "nope" })).rejects.toThrow(/Pick what/);
    await picked().mutation(api.photos.retake, { id: item.id, why: "blur" });
    expect(await exists(f)).toBe(false);
    const q10 = (await fam().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 10)!;
    expect(q10).toMatchObject({ owe: ["part"], photos: [{ state: "retake" }] });
    expect(q10.photos[0].say).toMatch(/தெளிவாக/);
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    // Meanwhile the corrector marks the whole level in class: the photo only closes.
    const items = BOOK.data.levels[0] && [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => ({ q, got: q === 8 ? 0 : 2 }));
    await t.mutation(api.workbook.correct, { studentId: hana, unitId: u01, level: 1, items, by: "correction" });
    const [again] = await picked().query(api.photos.queue, {});
    expect(await picked().mutation(api.photos.mark, { id: again.id, got: 1 })).toEqual({ already: true });
    expect((await hanaM()).q["10"].got).toBe(2);
  });

  test("a part keeps its marks as at his Check: a key read differently later never strands a photo", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 }); // Q10: the teacher's, 2 marks
    // The phone learns to read Q10 afterwards (a key shape learned later, "ரூபா 350"): its photo is still owed and marked.
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey().map((k) => (k.q === 10 ? { q: 10, a: "30" } : k)),
    });
    const q10 = async () => (await fam().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 10)!;
    expect(await q10()).toMatchObject({ teach: 2, owe: ["part"] });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    const [item] = (await picked().query(api.photos.queue, {})).filter((i) => i.q === 10);
    expect(item).toMatchObject({ teach: 2, phoneGot: 0 });
    await picked().mutation(api.photos.mark, { id: item.id, got: 2 });
    expect((await hanaM()).q["10"]).toMatchObject({ got: 2, max: 2, lost: false });
    // A Check from before the marks were kept (no pm/pg): the question is the teacher's whole.
    await raw.run(async (ctx) => {
      const row = (await ctx.db.query("familyAnswers").collect())[0];
      await ctx.db.patch(row._id, { n: 2, owe: { part: [12], working: [] } });
    });
    const { partMarks } = await import("../convex/lib/photos");
    const { phoneKey } = await import("../convex/lib/phone");
    const k12 = phoneKey(fakeKey(), BOOK.data).get(12)!;
    expect(partMarks({ part: [12] }, 12, k12, null)).toEqual({ teach: 2, phoneGot: 0 });
    expect(partMarks({ part: [12], pm: [1], pg: [1] }, 12, k12, null)).toEqual({ teach: 1, phoneGot: 1 });
  });

  test("the phone's answer typed by a teacher: Books or the owner; only what the phone can read; it reads at once; teacher; back to the key", async () => {
    const BOOKS = "books-teacher-token-0123456789abcdefghijklmnopq";
    await addPerson(raw, { name: "Kala", token: BOOKS, tabs: ["correction"], can: ["books"] });
    const fix = (who: ReturnType<typeof asPhone>, q: number, a: string) => who.mutation(api.families.setPhoneAnswer, { unitId: u01, q, p: "", a });
    await expect(fix(asPhone(raw, CORRECTOR), 10, "30")).rejects.toThrow(/Books/);
    await expect(fix(asPhone(raw, BOOKS), 10, "சிறப்பு")).rejects.toThrow(/can't read/);
    await expect(fix(asPhone(raw, BOOKS), 999, "30")).rejects.toThrow(/not in this workbook/);
    // Q10 (the key's words: a name) → "30": a box on the phone, marked like any number.
    await fix(asPhone(raw, BOOKS), 10, "30");
    expect((await level(1)).qs.find((q) => q.q === 10)!.parts[0].boxes).toEqual([{ k: "num" }]);
    const list = await t.query(api.families.answers, { unitId: u01 });
    expect(list!.qs.find((q) => q.q === 10)!.parts[0]).toMatchObject({ phone: true, words: "30", fixed: true });
    // "teacher": Q1 (a number) stays with the corrector.
    await fix(t, 1, "Teacher");
    expect((await level(1)).qs.find((q) => q.q === 1)!.parts[0].boxes).toBeNull();
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: [...LEVEL1, { q: 10, a: ["30"] }] });
    expect(r.results.find((x) => x.q === 10)).toMatchObject({ got: 2 });
    expect(r.teacher).toEqual([1]);
    // Back to the key.
    await fix(t, 10, "");
    expect((await t.query(api.families.answers, { unitId: u01 }))!.qs.find((q) => q.q === 10)!.parts[0]).toMatchObject({ phone: false, fixed: false });
    const lines = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "phone-fix").map((e) => `${e.q} ${e.value}`));
    expect(lines).toEqual(["10 - 30", "1 - teacher", "10 - (the key)"]);
  });

  test("a screen opened before a key changed: a question with other boxes is never marked against them; it goes to the teacher", async () => {
    // His screen showed Q10 with no box (the teacher's) and Q3 with one; the server now reads Q10 as a number.
    await t.mutation(api.families.setPhoneAnswer, { unitId: u01, q: 10, p: "", a: "30" });
    const typed = LEVEL1.map((x) => ({ ...x, b: 1 })).concat([{ q: 10, a: [], b: 0 }]);
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 1, typed });
    expect(r.results.find((x) => x.q === 10)).toMatchObject({ got: null, phoneGot: 0 }); // not ✗
    expect(r.teacher).toEqual([10]);
    const q10 = r.book!.qs.find((x) => x.q === 10)!;
    expect(q10).toMatchObject({ got: null, teach: 2, owe: ["part"] }); // a photo, out of its whole marks
    expect((await hanaM()).q["10"]).toBeUndefined();
    expect(r.results.find((x) => x.q === 3)).toMatchObject({ got: 2 }); // the same boxes: marked as usual
  });

  test("questions that come back: wrong ones 2 levels later, one second try each; right = explained and the lost marks back as XP this week", async () => {
    await t.mutation(api.photos.setRequired, { on: false }); // (the photos limit is tested above)
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 }); // Q8 wrong
    expect((await level(2)).qs.some((q) => q.re)).toBe(false); // too soon
    await checkEmpty(2); // Q11–19 wrong (empty)
    const l3 = await level(3);
    expect(l3.qs.filter((q) => q.re).map((q) => [q.q, q.re, q.rb])).toEqual([[8, 1, 2]]); // level 1 only (2 levels back)
    expect(l3.qs.at(-1)!.q).toBe(8); // after the level's own questions
    const xp = (await fam().query(api.family.me, {})).xp;
    const typed = l3.qs.map((q) => ({ q: q.q, a: q.q === 8 ? ["24"] : [] as string[] }));
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 3, typed });
    expect(r.retry).toEqual([{ q: 8, max: 2, got: 2, from: 1, ok: [[true]] }]);
    expect(r.bonus).toBe(2);
    const m = (await hanaM()).q["8"];
    expect(m).toMatchObject({ got: 0, lost: true, rg: 2 }); // the first marks stay
    expect(m.rt).toBeDefined();
    expect(m.x).toBeDefined(); // right now: Evaluation needn't explain it
    expect((await fam().query(api.family.me, {})).xp).toBe(xp + r.got + 2);
    // Level 4: level 2's wrong ones come back (3 at most), never Q8 again.
    const l4 = (await level(4)).qs.filter((q) => q.re).map((q) => q.q);
    expect(l4).toEqual([11, 12, 13]);
    // A screen that didn't show one of them (opened before): it isn't marked; it comes back next time.
    const own4 = (await level(4)).qs.filter((q) => !q.re && q.q !== 13).map((q) => ({ q: q.q, a: [] as string[] }));
    const typed4 = [...own4, { q: 11, a: [] as string[] }, { q: 12, a: [] as string[] }];
    expect((await fam().mutation(api.family.check, { unitId: u01, n: 4, typed: typed4 })).retry.map((x) => x.q)).toEqual([11, 12]);
    expect((await hanaM()).q["13"].rt).toBeUndefined();
    // Wrong again: no marks back, not explained, never back again.
    expect((await hanaM()).q["11"]).toMatchObject({ rg: 0 });
    expect((await hanaM()).q["11"].x).toBeUndefined();
    expect((await level(5)).qs.filter((q) => q.re).map((q) => q.q)).toEqual([13, 14, 15]);
    const line = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "retry-home").map((e) => e.value));
    expect(line).toEqual(["8 1/1", "11,12 0/2"]);
  });

  test("nothing kept: files go a day after marking; uploads never attached go after a day; removing a student takes his", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    const f = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "working", files: [f] });
    const lonely = await jpeg();
    const notImage = await jpeg(10, "audio/mp4");
    const [item] = await picked().query(api.photos.queue, {});
    await picked().mutation(api.photos.mark, { id: item.id, why: "slip" });
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(f)).toBe(true); // marked just now: kept a day
    expect(await exists(lonely)).toBe(true);
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60_000));
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(f)).toBe(false);
    expect(await exists(lonely)).toBe(false);
    expect(await exists(notImage)).toBe(true); // only images are swept
    const row = await raw.run(async (ctx) => await ctx.db.get(item.id));
    expect(row).toMatchObject({ files: [], state: "done", why: "slip" });
    expect(row!.gone).toBeDefined();
    // His other photo (waiting) goes with him.
    const g = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [g] });
    await raw.run(async (ctx) => await wipeStudent(ctx, (await ctx.db.get(hana))!));
    expect(await exists(g)).toBe(false);
    expect(await raw.run(async (ctx) => (await ctx.db.query("homePhotos").collect()).length)).toBe(0);
  });
});
