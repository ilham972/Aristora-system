// Photos from home (4 Nov 2026): what a Check asks of him (the parts only a teacher can mark; since 10 Nov 2026 never his
// working on a wrong answer, and no 2-level limit), the key's working shown only where he lost marks, uploads, the
// teachers' queue (marks, retakes; since 6 Nov 2026 no reason and never "explained"), a level corrected in class closing
// its photos, nothing kept (files gone a day after marking), and the unit gate with its redo (10 Nov 2026). Fake answers only (the repo is public); the
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
import { comesBack, gateOf, gatePasses, gatePct, halfMarks, redoPool } from "../convex/lib/family";
import type { KeyQ } from "../convex/lib/phone";
import { owedOf, PHOTO_BYTES, PHOTO_URLS_PER_DAY, WHY } from "../convex/lib/photos";
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
/** A key with kinds (version 2): Level 1's boxes; Q10 = "is it true? give a reason" (its answer இல்லை). */
function kindKey(): KeyAnswer[] {
  return fakeKey().map((k) =>
    k.q <= 9
      ? { ...k, t: { k: "box" as const, b: [{ v: [k.q === 8 ? "24" : String(k.q * 3)] }] } }
      : k.q === 10
        ? { ...k, a: "இல்லை: a made-up reason", t: { k: "why" as const, a: false } }
        : k,
  );
}
/** Level 1 as Hana types it: all right but Q8 (the phone can't mark Q10). */
const LEVEL1 = [1, 2, 3, 4, 5, 6, 7, 9].map((q) => ({ q, a: [String(q * 3)] })).concat([{ q: 8, a: ["42"] }]);

describe("the rules", () => {
  test("owed: a part not marked and not sent; retakes owed again; off = none; never his working on a wrong answer", () => {
    const owe = { part: [10], working: [8] }; // an old Check still lists Q8's working: ignored (10 Nov 2026)
    const lost = { got: 0, max: 2, lost: true, t: 1 };
    expect(owedOf(owe, [], { "8": lost }, true)).toEqual([{ q: 10, kind: "part" }]);
    expect(owedOf(owe, [{ q: 10, kind: "part", state: "waiting" }], { "8": lost }, true)).toEqual([]);
    expect(owedOf(owe, [{ q: 10, kind: "part", state: "retake" }], { "8": lost }, true)).toHaveLength(1);
    expect(owedOf(owe, [], { "8": lost, "10": { got: 2, max: 2, lost: false, t: 1 } }, true)).toEqual([]); // marked in class
    expect(owedOf(owe, [], { "8": lost }, false)).toEqual([]);
    expect(owedOf(undefined, [], { "8": lost }, true)).toEqual([]); // a Check from before photos
  });

  test("comes back: lost, the phone's, not tried again, and a level 2 after its own still to do; then the solution shows", () => {
    const book = { parts: [], levels: [1, 2, 3, 4].map((n) => ({ n, from: n * 10 - 9, to: n * 10, max: 20 })) } as unknown as Parameters<typeof comesBack>[1];
    const phoneQ = { q: 0, max: 2, parts: [{ want: [{}] }] } as unknown as KeyQ;
    const teacherQ = { q: 0, max: 2, parts: [{ want: null }] } as unknown as KeyQ;
    const keys = new Map<number, KeyQ>([[5, phoneQ], [6, teacherQ], [15, phoneQ], [35, phoneQ]]);
    const lost = { got: 0, max: 2, lost: true, t: 1 };
    const m = { q: { "5": lost, "6": lost, "15": lost, "35": lost }, lv: { "1": { fixed: 1 }, "2": { fixed: 1 } } } as Parameters<typeof comesBack>[0];
    expect(comesBack(m, book, keys, 5)).toBe(true); // Level 3 still to do
    expect(comesBack(m, book, keys, 6)).toBe(false); // the teacher's: never comes back
    expect(comesBack(m, book, keys, 35)).toBe(false); // Level 4's: no Level 6
    expect(comesBack({ ...m, q: { ...m.q, "5": { ...lost, rt: 2, rg: 2 } } }, book, keys, 5)).toBe(false); // tried again
    expect(comesBack({ ...m, q: { ...m.q, "5": { ...lost, lost: false } } }, book, keys, 5)).toBe(false);
    const handed = { ...m, lv: { ...m.lv, "3": { fixed: 1 }, "4": { done: 1 } } } as Parameters<typeof comesBack>[0];
    // The book finished below 75 % (10 Nov 2026): kept for his redo, so no solution yet.
    expect(comesBack(handed, book, keys, 5)).toBe(true);
    expect(comesBack(m, book, keys, 15)).toBe(true); // Level 2's: Level 4 still to do
    expect(comesBack(handed, book, keys, 15)).toBe(true);
    // Finished at 75 % or more: no redo, the solution shows.
    const passed = { ...m, lv: { "1": { fixed: 1, got: 15 }, "2": { fixed: 1, got: 15 }, "3": { fixed: 1, got: 15 }, "4": { fixed: 1, got: 15 } } } as Parameters<typeof comesBack>[0];
    expect(comesBack(passed, book, keys, 5)).toBe(false);
    expect(comesBack(passed, book, keys, 35)).toBe(false);
    expect(Object.values(WHY).every((w) => w.ta && w.en)).toBe(true);
  });

  test("the unit gate: 75 % opens the next Stage; below it, every lost question explained (class, Theory, or right again)", () => {
    const book = { parts: [], levels: [1, 2, 3, 4].map((n) => ({ n, from: n * 10 - 9, to: n * 10, max: 20 })) } as unknown as Parameters<typeof gateOf>[1];
    const phoneQ = { q: 0, max: 2, parts: [{ want: [{}] }] } as unknown as KeyQ;
    const teacherQ = { q: 0, max: 2, parts: [{ want: null }] } as unknown as KeyQ;
    const keys = new Map<number, KeyQ>([[5, phoneQ], [6, teacherQ], [15, phoneQ]]);
    const lost = { got: 0, max: 2, lost: true, t: 1 };
    const lv = (got: number) => ({ "1": { fixed: 1, got }, "2": { fixed: 1, got }, "3": { fixed: 1, got }, "4": { fixed: 1, got } });
    const m = { q: { "5": lost, "6": lost, "15": lost }, lv: lv(14) } as Parameters<typeof gateOf>[0];
    // 56 / 80 = 70 %: shut. Q5 and Q15 he can redo; Q6 (the teacher's) only the class can explain.
    expect(gatePct(m, book)).toBe(70);
    expect(gatePasses(m, book)).toBe(false);
    expect(gateOf(m, book, keys)).toEqual({ pct: 70, redo: 2, cls: 1 });
    expect(redoPool(m, book, keys)).toEqual([{ q: 5, from: 1, lost: 1 }, { q: 15, from: 2, lost: 1 }]);
    // 60 / 80 = 75 %: open, nothing to redo.
    expect(gatePasses({ ...m, lv: lv(15) }, book)).toBe(true);
    expect(gateOf({ ...m, lv: lv(15) }, book, keys)).toBeNull();
    expect(redoPool({ ...m, lv: lv(15) }, book, keys)).toEqual([]);
    // Every lost one explained (Evaluation, or right again) or taught by Theory: open, whatever the score.
    const done = { ...m, q: { "5": { ...lost, x: 2 }, "6": { ...lost, th: 2, tt: 3 }, "15": { ...lost, rt: 2, rg: 2, x: 2 } } };
    expect(gatePasses(done, book)).toBe(true);
    // Sent to Theory and not taught yet: still shut; tried again and wrong: only the class now.
    const left = { ...m, q: { "5": { ...lost, th: 2 }, "6": { ...lost, x: 2 }, "15": { ...lost, rt: 2, rg: 0 } } };
    expect(gateOf(left, book, keys)).toEqual({ pct: 70, redo: 0, cls: 2 });
    // Not finished: no gate yet. Nothing marked (done before the app): open.
    expect(gateOf({ ...m, lv: { ...lv(14), "4": {} } }, book, keys)).toBeNull();
    expect(gatePasses({ q: {}, lv: { "1": { pre: 1 } } }, book)).toBe(true);
    // Half marks on a right second try: a whole number, rounded down, at least 1.
    expect([1, 2, 3, 4, 5, 6].map(halfMarks)).toEqual([1, 1, 1, 2, 2, 3]);
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
  const useKinds = async () =>
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: kindKey(),
    });
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
    // Q8 is wrong and comes back in Level 3: no solution yet (he'd copy it there); no photo of his working (10 Nov 2026).
    expect(q(8)).toMatchObject({ got: 0, sol: null, back: true, owe: [], typed: ["42"] });
    expect(q(1)).toMatchObject({ got: 2, sol: null, back: false, owe: [] }); // right: no solution
    expect(q(10)).toMatchObject({ got: null, teach: 2, sol: null, owe: ["part"] });
    expect(await fam().query(api.family.book, { unitId: u01, n: 1 })).toEqual(r.book);
    await expect(fam().query(api.family.book, { unitId: u01, n: 2 })).rejects.toThrow(/isn't marked/);
    // The Stage: Level 1 owes 1 photo (Q10's drawing / name).
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0]).toMatchObject({ s: "check", ph: 1 });
    const row = await raw.run(async (ctx) => await ctx.db.query("familyAnswers").first());
    expect(row!.owe).toMatchObject({ part: [10], working: [] });
  });

  test("sending: an upload address (a few dozen a day), 1–3 image files, only for questions that need one; again replaces", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    expect(await fam().mutation(api.family.photoUrl, {})).toMatch(/upload/);
    const a = await jpeg();
    const b = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [a] });
    // His working on a wrong answer: refused (10 Nov 2026), nothing kept.
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "working", files: [b] })).rejects.toThrow(/படம் தேவையில்லை/);
    const book = await fam().query(api.family.book, { unitId: u01, n: 1 });
    expect(book.qs.find((x) => x.q === 10)).toMatchObject({ owe: [], photos: [{ kind: "part", state: "waiting" }] });
    expect(book.qs.find((x) => x.q === 8)).toMatchObject({ owe: [], photos: [] });
    // Again: the new photo replaces the old (its file goes).
    const a2 = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [a2] });
    expect(await exists(a)).toBe(false);
    // Refused: a question the phone marked, a file too big (deleted), too many, not an image.
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 1, kind: "part", files: [await jpeg()] })).rejects.toThrow(/doesn't need/);
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 8, kind: "part", files: [await jpeg()] })).rejects.toThrow(/doesn't need/);
    const big = await jpeg(PHOTO_BYTES + 1);
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [big] })).rejects.toThrow(/too big/);
    expect(await exists(big)).toBe(true); // never attached: the hourly sweep takes it after a day
    const four = [await jpeg(), await jpeg(), await jpeg(), await jpeg()];
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: four })).rejects.toThrow(/1 முதல் 3/);
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg(10, "text/plain")] })).rejects.toThrow(/too big/);
    // A few dozen upload addresses a day.
    for (let i = 1; i < PHOTO_URLS_PER_DAY; i++) await fam().mutation(api.family.photoUrl, {});
    await expect(fam().mutation(api.family.photoUrl, {})).rejects.toThrow(/நாளை/);
  });

  test("no limit inside a unit (10 Nov 2026): levels go on with photos owed and wrong answers unexplained; the owner's switch stops asking", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await checkEmpty(2);
    await checkEmpty(3);
    await checkEmpty(4);
    expect((await level(5)).n).toBe(5);
    const me = await fam().query(api.family.me, {});
    expect("blocked" in me).toBe(false);
    expect(me.worlds[0].levels[0].ph).toBe(1); // Q10's photo is still asked for, nothing waits on it
    await expect(picked().mutation(api.photos.setRequired, { on: false })).rejects.toThrow(/owner/);
    await t.mutation(api.photos.setRequired, { on: false });
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0].ph).toBeUndefined();
    expect(await t.query(api.photos.required, {})).toBe(false);
  });

  test("the queue: only the owner and people with Photos; marks for a part reach his XP; a wrong answer waits for Evaluation", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    await expect(asPhone(raw, CORRECTOR).query(api.photos.queue, {})).rejects.toThrow(/Photos/);
    expect(await picked().query(api.photos.count, {})).toEqual({ n: 1, late: false });
    const items = await picked().query(api.photos.queue, {});
    expect(items.map((i) => [i.q, i.kind, i.teach, i.urls.length])).toEqual([[10, "part", 2, 1]]);
    expect(items[0]).toMatchObject({ student: { name: "Hana K" } });
    const xp = (await fam().query(api.family.me, {})).xp;
    await expect(picked().mutation(api.photos.mark, { id: items[0].id, got: 3 })).rejects.toThrow(/0 to 2/);
    // A page opened before 6 Nov 2026 still sends a reason: accepted, ignored.
    await picked().mutation(api.photos.mark, { id: items[0].id, got: 2, why: "good" });
    await expect(picked().mutation(api.photos.mark, { id: items[0].id, got: 2 })).rejects.toThrow(/already answered/);
    const m = await hanaM();
    expect(m.q["10"]).toMatchObject({ got: 2, max: 2, lost: false });
    expect(m.lv["1"].got).toBe(16 + 2);
    // Q8 (wrong) waits for Evaluation in class.
    expect(m.q["8"].x).toBeUndefined();
    expect(computeMaster(m, BOOK.data).pending).toEqual([8]);
    const me = await fam().query(api.family.me, {});
    expect(me.xp).toBe(xp + 2);
    expect(me.worlds[0].levels[0]).toMatchObject({ nw: 1 });
    const book = await fam().query(api.family.book, { unitId: u01, n: 1 });
    expect(book.qs.find((x) => x.q === 10)).toMatchObject({ got: 2, photos: [{ got: 2, say: null }] });
    await fam().mutation(api.family.seen, { unitId: u01, n: 1 });
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0].nw).toBeUndefined();
    expect(await picked().query(api.photos.count, {})).toEqual({ n: 0, late: false });
    const lines = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("photo")).map((e) => e.value));
    expect(lines).toEqual(["1 2/2"]);
  });

  test("Correction's ⌂ lane: Photos people only; students oldest first; each sub-question its own marks; never his working", async () => {
    // Q10 in two parts, both the teacher's (names): (a) and (b), 1 mark each.
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey().map((k) =>
        k.q === 10
          ? { q: 10, parts: [{ p: "a", a: "சிறப்புப் பெயர்", m: 1 }, { p: "b", a: "வேறு பெயர்", m: 1 }] }
          : k,
      ),
    });
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    vi.setSystemTime(new Date("2026-11-04T19:05:00+05:30"));
    // A working photo left from before 10 Nov 2026: never in the lane (the hourly sweep deletes it).
    await raw.run(async (ctx) => {
      await ctx.db.insert("homePhotos", { studentId: hana, unitId: u01, n: 1, q: 8, kind: "working", files: [], at: Date.now(), state: "waiting" });
    });
    await expect(asPhone(raw, CORRECTOR).query(api.photos.lane, {})).rejects.toThrow(/Photos/);
    await expect(asPhone(raw, CORRECTOR).query(api.photos.student, { studentId: hana })).rejects.toThrow(/Photos/);
    // Another student, later: he comes after Hana (oldest first).
    const omar = await t.mutation(api.students.add, { name: "Omar R", grade: 8, term: 1, stage: "master", unitId: u01 });
    await raw.run(async (ctx) => {
      const f = await ctx.storage.store(new Blob([new Uint8Array(10)], { type: "image/jpeg" }));
      await ctx.db.insert("homePhotos", { studentId: omar, unitId: u01, n: 1, q: 10, kind: "part", files: [f], at: Date.now() + 60_000, state: "waiting" });
    });
    const lane = await picked().query(api.photos.lane, {});
    expect(lane.map((s) => [s.id, s.n])).toEqual([
      [hana, 1],
      [omar, 1],
    ]);
    // Hana's photos: Q10 in its two parts, each the teacher's (her old working photo is not there).
    const items = await picked().query(api.photos.student, { studentId: hana });
    expect(items.map((i) => [i.q, i.kind])).toEqual([[10, "part"]]);
    const [q10] = items;
    expect(q10).toMatchObject({ teach: 2, split: true, hc: false });
    expect(q10.parts.map((p) => [p.p, p.m, p.phone, p.key])).toEqual([
      ["a", 1, null, "சிறப்புப் பெயர்"],
      ["b", 1, null, "வேறு பெயர்"],
    ]);
    // (a) right, (b) wrong: 1 of 2 (the lane adds the parts up).
    await picked().mutation(api.photos.mark, { id: q10.id, got: 1 });
    const m = await hanaM();
    expect(m.q["10"]).toMatchObject({ got: 1, max: 2, lost: true });
    // Both still lost: Evaluation explains them in class.
    expect(m.q["8"].x).toBeUndefined();
    expect(m.q["10"].x).toBeUndefined();
    expect(m.lv["1"].got).toBe(16 + 1);
    expect((await picked().query(api.photos.lane, {})).map((s) => s.id)).toEqual([omar]);
    const lines = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("photo")).map((e) => `${e.kind} ${e.value}`));
    expect(lines).toEqual(["photo-marked 1 1/2"]);
  });

  test("corrected in class (his paper): its photos close by themselves, none owed, the wrong ones wait for Evaluation", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    // He sends Q10 (a name): it waits in the lane.
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    expect((await picked().query(api.photos.lane, {})).map((s) => [s.id, s.n])).toEqual([[hana, 1]]);
    // Correction marks Level 1 on his paper in class: Q8 wrong, Q10 right.
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => ({ q, got: q === 8 ? 0 : 2 }));
    await t.mutation(api.workbook.correct, { studentId: hana, unitId: u01, level: 1, items, by: "correction" });
    // Nothing left in the lane; the photo closed, no dot on his phone, his phone says it was corrected in class.
    expect(await picked().query(api.photos.lane, {})).toEqual([]);
    expect(await picked().query(api.photos.count, {})).toEqual({ n: 0, late: false });
    const book = await fam().query(api.family.book, { unitId: u01, n: 1 });
    expect(book.hc).toBe(true);
    expect(book.cn).toBe("Owner"); // who checked it in class: his phone says so (7 Nov 2026)
    expect(book.qs.find((x) => x.q === 10)!.photos[0].by).toBe("Owner");
    expect(book.qs.find((x) => x.q === 10)).toMatchObject({ owe: [], photos: [{ state: "done", fresh: false }] });
    expect(book.qs.find((x) => x.q === 10)!.photos[0].say).toMatch(/வகுப்பில்/);
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0].ph).toBeUndefined();
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] })).rejects.toThrow(/வகுப்பில்/);
    // Q8 is still lost and not explained: Evaluation explains it in class.
    const m = await hanaM();
    expect(m.q["8"]).toMatchObject({ got: 0, lost: true });
    expect(m.q["8"].x).toBeUndefined();
    expect(computeMaster(m, BOOK.data).pending).toContain(8);
    // ⌂ Checked closes them too (Level 2: its teacher question Q20 sent, then marked here on his row).
    await checkEmpty(2);
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 2, q: 20, kind: "part", files: [await jpeg()] });
    expect((await picked().query(api.photos.lane, {})).map((s) => [s.id, s.n])).toEqual([[hana, 1]]);
    await raw.run(async (ctx) => {
      const p = (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", hana)).first())!;
      const mm = p.m as { q: Record<string, unknown> };
      mm.q["20"] = { got: 2, max: 2, lost: false, t: Date.now() };
      await ctx.db.patch(p._id, { m: mm as never });
    });
    expect(await t.mutation(api.workbook.homeChecked, { studentId: hana, unitId: u01, level: 2, by: "correction" })).toBe(true);
    expect(await picked().query(api.photos.lane, {})).toEqual([]);
  });

  test("the hourly sweep deletes the old working photos (10 Nov 2026), and closes a photo waiting on a level the class corrected", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    const f = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [f] });
    // Working photos sent before 10 Nov 2026: waiting, asked again, a retake; one already answered stays.
    const old = [await jpeg(), await jpeg()];
    const ids = await raw.run(async (ctx) => [
      await ctx.db.insert("homePhotos", { studentId: hana, unitId: u01, n: 1, q: 8, kind: "working", files: [old[0]], at: Date.now(), state: "waiting" }),
      await ctx.db.insert("homePhotos", { studentId: hana, unitId: u01, n: 1, q: 7, kind: "working", files: [old[1]], at: Date.now(), state: "ask" }),
      await ctx.db.insert("homePhotos", { studentId: hana, unitId: u01, n: 1, q: 6, kind: "working", files: [], at: Date.now(), state: "retake" }),
      await ctx.db.insert("homePhotos", { studentId: hana, unitId: u01, n: 1, q: 5, kind: "working", files: [], at: Date.now(), state: "done", doneAt: Date.now() }),
    ]);
    expect(await picked().query(api.photos.count, {})).toEqual({ n: 1, late: false }); // hidden at once
    // As before this change: the level checked in class, the photo left waiting.
    await raw.run(async (ctx) => {
      const p = (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", hana)).first())!;
      const m = p.m as { lv: Record<string, { hc?: number }> };
      m.lv["1"].hc = Date.now();
      await ctx.db.patch(p._id, { m: m as never });
    });
    expect((await picked().query(api.photos.lane, {})).length).toBe(1);
    await raw.mutation(internal.photos.sweep, {});
    expect(await picked().query(api.photos.lane, {})).toEqual([]);
    expect(await exists(f)).toBe(true); // its file goes a day later, like any marked photo
    // The old working photos: rows and files gone, but the one she answered.
    expect(await Promise.all(old.map(exists))).toEqual([false, false]);
    const left = await raw.run(async (ctx) => await Promise.all(ids.map((id) => ctx.db.get(id))));
    expect(left.map((r) => r?.state ?? null)).toEqual([null, null, null, "done"]);
  });

  test("is it true? give a reason: no photo; a right ஆம் / இல்லை waits in the queue with his words, her marks reach him", async () => {
    await useKinds();
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: [...LEVEL1, { q: 10, a: ["0", "  a made-up reason  "] }] });
    expect(r.teacher).toEqual([10]);
    const q = (n: number) => r.book!.qs.find((x) => x.q === n)!;
    expect(q(10)).toMatchObject({ got: null, teach: 2, owe: [], photos: [{ kind: "part", state: "waiting", said: true }] });
    expect(q(8).owe).toEqual([]); // a wrong box asks for nothing (10 Nov 2026)
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0].ph).toBeUndefined(); // nothing owed
    const [item] = (await picked().query(api.photos.queue, {})).filter((i) => i.q === 10);
    expect(item).toMatchObject({ kind: "part", said: true, urls: [], teach: 2, phoneGot: 0, reasons: [{ p: "", yes: "இல்லை", text: "a made-up reason" }] });
    await expect(picked().mutation(api.photos.retake, { id: item.id, why: "blur" })).rejects.toThrow(/typed reason/);
    await expect(picked().mutation(api.photos.ask, { id: item.id, text: "Write more" })).rejects.toThrow(/typed reason/);
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] })).rejects.toThrow(/doesn't need/);
    await picked().mutation(api.photos.mark, { id: item.id, got: 1 });
    expect((await hanaM()).q["10"]).toMatchObject({ got: 1, max: 2, lost: true });
    const book = await fam().query(api.family.book, { unitId: u01, n: 1 });
    expect(book.qs.find((x) => x.q === 10)).toMatchObject({ got: 1, photos: [{ state: "done", got: 1, said: true, say: null }] });
  });

  test("a wrong ஆம் / இல்லை: 0 at once, nothing for the teacher, no photo asked; his words kept, at most 300 letters", async () => {
    await useKinds();
    await expect(fam().mutation(api.family.check, { unitId: u01, n: 1, typed: [...LEVEL1, { q: 10, a: ["1", "a".repeat(301)] }] })).rejects.toThrow(/too long/);
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: [...LEVEL1, { q: 10, a: ["1", "b".repeat(300)] }] });
    expect(r.teacher).toEqual([]);
    expect(r.book!.qs.find((x) => x.q === 10)).toMatchObject({ got: 0, owe: [], photos: [] });
    expect(await picked().query(api.photos.queue, {})).toEqual([]);
    const kept = await raw.run(async (ctx) => (await ctx.db.query("familyAnswers").first())!.qs.find((x) => x.q === 10)!.a);
    expect(kept).toEqual(["1", "b".repeat(300)]);
  });

  test("a retake: the files go at once and the photo is owed again; a level corrected in class closes it by itself", async () => {
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
    const [again] = await picked().query(api.photos.queue, {});
    // Meanwhile the corrector marks the whole level in class: the photo closes by itself (a card still open only closes).
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => ({ q, got: q === 8 ? 0 : 2 }));
    await t.mutation(api.workbook.correct, { studentId: hana, unitId: u01, level: 1, items, by: "correction" });
    expect(await picked().query(api.photos.queue, {})).toEqual([]);
    expect(await picked().mutation(api.photos.mark, { id: again.id, got: 1 })).toEqual({ already: true });
    expect((await hanaM()).q["10"].got).toBe(2);
  });

  test("a part photo: the phone's own part is hers to change (he typed it wrong, his paper shows it right)", async () => {
    // Q10 in two parts: (a) a number the phone marks, (b) a name (the teacher's). He types (a) wrong.
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u01,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey().map((k) => (k.q === 10 ? { q: 10, parts: [{ p: "a", a: "**30**", m: 1 }, { p: "b", a: "சிறப்புப் பெயர்", m: 1 }] } : k)),
    });
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: [...LEVEL1, { q: 10, a: ["31"] }] });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    const [q10] = (await picked().query(api.photos.student, { studentId: hana })).filter((i) => i.q === 10);
    expect(q10).toMatchObject({ teach: 1, phoneGot: 0, split: true });
    expect(q10.parts.map((p) => [p.p, p.phone])).toEqual([
      ["a", 0],
      ["b", null],
    ]);
    // Never more than the phone's parts are worth; then (a) 1 (his paper is right) and (b) 1: full marks.
    await expect(picked().mutation(api.photos.mark, { id: q10.id, got: 1, total: 3 })).rejects.toThrow(/0 to 1 marks for the phone/);
    await picked().mutation(api.photos.mark, { id: q10.id, got: 1, total: 2 });
    expect((await hanaM()).q["10"]).toMatchObject({ got: 2, max: 2, lost: false });
    expect((await hanaM()).lv["1"].got).toBe(16 + 2);
  });

  test("her message before marking: nothing marked, his phone shows it and owes it again; he answers with words and / or a photo, his first photo kept", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    const first = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [first] });
    const [item] = (await picked().query(api.photos.student, { studentId: hana })).filter((i) => i.q === 10);
    expect(item).toMatchObject({ ask: null, askBy: null, reply: null });
    await expect(asPhone(raw, CORRECTOR).mutation(api.photos.ask, { id: item.id, text: "Where is (b)?" })).rejects.toThrow(/Photos/);
    await expect(picked().mutation(api.photos.ask, { id: item.id, text: "  " })).rejects.toThrow(/Write your message/);
    await expect(picked().mutation(api.photos.ask, { id: item.id, text: "x".repeat(301) })).rejects.toThrow(/300/);
    await picked().mutation(api.photos.ask, { id: item.id, text: "Where is the answer for (b)?" });
    // Nothing marked; out of the lane; on his phone: her words and her name, owed again (his limit counts it).
    expect((await hanaM()).q["10"]).toBeUndefined();
    expect(await picked().query(api.photos.lane, {})).toEqual([]);
    await expect(picked().mutation(api.photos.mark, { id: item.id, got: 2 })).rejects.toThrow(/already answered/);
    const q10 = async () => (await fam().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 10)!;
    expect(await q10()).toMatchObject({ owe: ["part"], photos: [{ state: "ask", ask: "Where is the answer for (b)?", by: "Nila", fresh: true }] });
    // An answer needs a photo or words.
    await expect(fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [], text: " " })).rejects.toThrow(/படம் எடு/);
    // Words only: back in the lane with her message and his words; his first photo kept.
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [], text: "(b) சிறப்புப் பெயர்" });
    expect(await q10()).toMatchObject({ owe: [], photos: [{ state: "waiting", reply: "(b) சிறப்புப் பெயர்" }] });
    const [back] = (await picked().query(api.photos.student, { studentId: hana })).filter((i) => i.q === 10);
    expect(back).toMatchObject({ ask: "Where is the answer for (b)?", askBy: "Nila", reply: "(b) சிறப்புப் பெயர்" });
    expect(back.urls).toHaveLength(1);
    expect(await exists(first)).toBe(true);
    // Asked again; a new photo this time: the new one first, the first one kept.
    await picked().mutation(api.photos.ask, { id: back.id, text: "Show your working for (b)" });
    const second = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [second] });
    const row = await raw.run(async (ctx) => await ctx.db.get(item.id));
    expect(row).toMatchObject({ state: "waiting", files: [second, first], ask: "Show your working for (b)" });
    expect(row!.reply).toBeUndefined();
    await picked().mutation(api.photos.mark, { id: item.id, got: 2 });
    expect((await hanaM()).q["10"]).toMatchObject({ got: 2, lost: false });
    expect(await q10()).toMatchObject({ photos: [{ state: "done", got: 2, by: "Nila" }] });
    const lines = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "photo-ask").map((e) => e.value));
    expect(lines).toEqual(["1 Where is the answer for (b)?", "1 Show your working for (b)"]);
  });

  test("her message waits; the class corrects the level meanwhile: it closes, nothing owed", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    const [item] = await picked().query(api.photos.queue, {});
    await picked().mutation(api.photos.ask, { id: item.id, text: "Where is (b)?" });
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => ({ q, got: q === 8 ? 0 : 2 }));
    await t.mutation(api.workbook.correct, { studentId: hana, unitId: u01, level: 1, items, by: "correction" });
    expect(await raw.run(async (ctx) => await ctx.db.get(item.id))).toMatchObject({ state: "done", cls: true });
    expect((await fam().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 10)!.owe).toEqual([]);
  });

  test("the bell: his teachers' answers, retakes and messages, who and where, new ones first; never what the class or the app closed", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    await checkEmpty(2);
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 2, q: 20, kind: "part", files: [await jpeg()] });
    expect((await fam().query(api.family.me, {})).bell).toEqual([]);
    const items = await picked().query(api.photos.queue, {});
    await picked().mutation(api.photos.mark, { id: items.find((i) => i.q === 10)!.id, got: 2 });
    vi.setSystemTime(new Date("2026-11-04T19:10:00+05:30"));
    await picked().mutation(api.photos.ask, { id: items.find((i) => i.q === 20)!.id, text: "Where is the name?" });
    const bell = (await fam().query(api.family.me, {})).bell;
    expect(bell.map((b) => [b.what, b.q, b.n, b.no, b.by, b.fresh, b.ask])).toEqual([
      ["ask", 20, 2, 1, "Nila", true, "Where is the name?"],
      ["done", 10, 1, 1, "Nila", true, null],
    ]);
    // Opened: no longer new (the red count goes); still listed.
    await fam().mutation(api.family.seen, { unitId: u01, n: 1 });
    await fam().mutation(api.family.seen, { unitId: u01, n: 2 });
    expect((await fam().query(api.family.me, {})).bell.map((b) => b.fresh)).toEqual([false, false]);
    // Two weeks later: gone from the bell.
    vi.setSystemTime(new Date("2026-11-19T19:00:00+05:30"));
    expect((await fam().query(api.family.me, {})).bell).toEqual([]);
  });

  test("phone alerts: a phone turns them on for a child; a teacher's answers gather into one alert a minute later; the phones still signed in get it", async () => {
    // Scheduled work is held (fake setTimeout): nothing is sent from a test.
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.setSystemTime(new Date("2026-11-04T19:00:00+05:30"));
    const sub = { endpoint: "https://push.example/send/abc123", p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
    await expect(raw.mutation(api.pushSubs.add, { token: "nobody-0123456789abcdefghijklmnopqrstuvwxyz", ...sub })).rejects.toThrow(/signed out/);
    await expect(fam().mutation(api.pushSubs.add, { ...sub, endpoint: "http://push.example/x" })).rejects.toThrow(/address/);
    await expect(fam().mutation(api.pushSubs.add, { ...sub, auth: "not base64!" })).rejects.toThrow(/keys/);
    // No phone turned them on: an answer schedules nothing.
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [await jpeg()] });
    await checkEmpty(2);
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 2, q: 20, kind: "part", files: [await jpeg()] });
    const items = await picked().query(api.photos.queue, {});
    await picked().mutation(api.photos.mark, { id: items.find((i) => i.q === 10)!.id, got: 2 });
    const scheduled = async () => await raw.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((f) => f.name));
    expect(await scheduled()).toEqual([]);
    // His phone turns them on (twice: kept once); then two answers: one alert, a minute later, saying both.
    await fam().mutation(api.pushSubs.add, sub);
    await fam().mutation(api.pushSubs.add, sub);
    expect(await raw.query(internal.pushSubs.count, { studentId: hana })).toBe(1);
    await picked().mutation(api.photos.ask, { id: items.find((i) => i.q === 20)!.id, text: "Where is the name?" });
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 2, q: 20, kind: "part", files: [], text: "சிறப்புப் பெயர்" });
    await picked().mutation(api.photos.mark, { id: items.find((i) => i.q === 20)!.id, got: 2 });
    expect(await scheduled()).toEqual(["push:send"]);
    const out = await raw.run(async (ctx) => await ctx.db.query("pushOut").collect());
    expect(out).toMatchObject([{ studentId: hana, n: 2, text: "Nila Q20 ஐத் திருத்தினார் (2/2)." }]);
    // No keys yet: nothing to send. With keys: the payload, his phone; taken once.
    expect(await raw.mutation(internal.pushSubs.take, { studentId: hana })).toBeNull();
    await raw.run(async (ctx) => {
      await ctx.db.insert("meta", { key: "push.vapid", value: { pub: "PUB", priv: "PRIV" } });
      await ctx.db.insert("pushOut", { studentId: hana, n: 2, text: "Nila Q8 ஐத் திருத்தினார் (2/2).", at: Date.now() });
    });
    const job = await raw.mutation(internal.pushSubs.take, { studentId: hana });
    expect(job).toMatchObject({ pub: "PUB", priv: "PRIV", subs: [{ endpoint: sub.endpoint }] });
    expect(JSON.parse(job!.payload)).toEqual({ title: "Hana · ARISTORA", body: "ஆசிரியரிடமிருந்து 2 புதியவை. Nila Q8 ஐத் திருத்தினார் (2/2).", url: "/f/#bell", tag: "aristora-Hana" });
    expect(await raw.mutation(internal.pushSubs.take, { studentId: hana })).toBeNull();
    // The public key only (never the private one); the phone signed out of ARISTORA gets nothing.
    expect(await fam().query(api.pushSubs.key, {})).toBe("PUB");
    await raw.run(async (ctx) => {
      await ctx.db.insert("pushOut", { studentId: hana, n: 1, text: "x", at: Date.now() });
      for (const d of await ctx.db.query("familyDevices").collect()) await ctx.db.patch(d._id, { revokedAt: Date.now() });
    });
    expect(await raw.mutation(internal.pushSubs.take, { studentId: hana })).toBeNull();
    // A dead address is forgotten; his removal takes his rows.
    await raw.mutation(internal.pushSubs.drop, { endpoint: sub.endpoint });
    expect(await raw.query(internal.pushSubs.count, { studentId: hana })).toBe(0);
  });

  test("phone alerts: the first phone asks the server to make its keys, once", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    vi.setSystemTime(new Date("2026-11-04T19:00:00+05:30"));
    expect(await fam().query(api.pushSubs.key, {})).toBeNull();
    await fam().mutation(api.pushSubs.prepare, {});
    await fam().mutation(api.pushSubs.prepare, {});
    const names = await raw.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((f) => f.name));
    expect(names).toEqual(["push:makeKeys"]);
    expect(await raw.mutation(internal.pushSubs.saveKeys, { pub: "P1", priv: "S1" })).toBe(true);
    expect(await raw.mutation(internal.pushSubs.saveKeys, { pub: "P2", priv: "S2" })).toBe(false);
    expect(await fam().query(api.pushSubs.key, {})).toBe("P1");
    await fam().mutation(api.pushSubs.add, { endpoint: "https://push.example/z", p256dh: "BAAA", auth: "AAAA" });
    await raw.run(async (ctx) => await wipeStudent(ctx, (await ctx.db.get(hana))!));
    expect(await raw.run(async (ctx) => (await ctx.db.query("pushSubs").collect()).length)).toBe(0);
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
    // The ⌂ lane can't split it as the phone reads it now: one row of 0 … 2, as at his Check.
    expect(item.split).toBe(false);
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

  test("questions that come back: wrong ones 2 levels later, one second try each; right = explained and half its marks (XP this week)", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 }); // Q8 wrong
    expect((await level(2)).qs.some((q) => q.re)).toBe(false); // too soon
    await checkEmpty(2); // Q11–19 wrong (empty)
    const l3 = await level(3);
    expect(l3.qs.filter((q) => q.re).map((q) => [q.q, q.re, q.rb])).toEqual([[8, 1, 1]]); // level 1 only (2 levels back); half of 2 to win
    expect(l3.qs.at(-1)!.q).toBe(8); // after the level's own questions
    // Its question as printed comes with Level 3's (it was "not in the phone yet"), and Level 1's book hides its solution.
    await raw.run(async (ctx) => {
      for (const q of [8, l3.qs[0].q]) await ctx.db.insert("questions", { unitId: u01, stage: "master", q, html: `<div class="pq">${q} A made-up question.</div>` });
    });
    expect((await fam().query(api.family.questions, { unitId: u01, n: 3, css: false })).qs.map((x) => x.q)).toEqual([l3.qs[0].q, 8]);
    expect((await fam().query(api.family.questions, { unitId: u01, n: 2, css: false })).qs.map((x) => x.q)).toEqual([]);
    expect((await fam().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 8)).toMatchObject({ sol: null, back: true });
    const xp = (await fam().query(api.family.me, {})).xp;
    const typed = l3.qs.map((q) => ({ q: q.q, a: q.q === 8 ? ["24"] : [] as string[] }));
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 3, typed });
    expect(r.retry).toEqual([{ q: 8, max: 2, got: 2, from: 1, ok: [[true]] }]);
    expect(r.bonus).toBe(1); // half its 2 marks
    // His second try is done: Level 1's book shows Q8's solution now.
    expect((await fam().query(api.family.book, { unitId: u01, n: 1 })).qs.find((x) => x.q === 8)).toMatchObject({ sol: "8 × 3 = **24**", back: false });
    const m = (await hanaM()).q["8"];
    expect(m).toMatchObject({ got: 0, lost: true, rg: 2, rh: 1 }); // the first marks stay; the second try added 1
    expect(m.rt).toBeDefined();
    expect(m.x).toBeDefined(); // right now: Evaluation needn't explain it
    expect((await hanaM()).lv["1"].got).toBe(16 + 1); // Level 1's marks (Progress, the gate) count the half marks
    expect(computeMaster(await hanaM(), BOOK.data).pending.includes(8)).toBe(false);
    expect((await fam().query(api.family.me, {})).xp).toBe(xp + r.got + 1);
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

  test("the unit gate (10 Nov 2026): finished below 75 %, the next Stage waits; the redo (half marks, explained) or the class opens it", async () => {
    // Stage 2 (U02) has a workbook too, so the chain reaches it.
    const u02 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U02")).first())!._id);
    await t.mutation(api.catalog.saveWorkbook, {
      unitId: u02,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      key: fakeKey(),
    });
    // Level 1 right but Q8; then every other level empty (his comebacks too: wrong again, so only the class now).
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    for (const l of BOOK.data.levels.slice(1)) await checkEmpty(l.n);
    const stage = async (id: Id<"units">) => (await fam().query(api.family.me, {})).worlds.find((w) => w.unitId === id)!;
    const s1 = await stage(u01);
    expect(s1.allDone).toBe(true);
    expect(s1.gate).toBeDefined();
    expect(s1.gate!.pct).toBeLessThan(75);
    expect((await stage(u02)).open).toBe(false);
    await expect(fam().query(api.family.level, { unitId: u02, n: 1 })).rejects.toThrow(/locked/);
    // The redo: his lost questions the phone marks, never tried again; no solution until then.
    const redo = await level(0);
    expect(redo.n).toBe(0);
    expect(redo.qs.length).toBe(s1.gate!.redo);
    expect(redo.qs.every((q) => q.re && q.rb === Math.max(1, Math.floor(q.max / 2)))).toBe(true);
    const first = redo.qs[0].q;
    expect((await fam().query(api.family.book, { unitId: u01, n: redo.qs[0].re! })).qs.find((x) => x.q === first)).toMatchObject({ sol: null, back: true });
    // All right (but the first): half marks each, explained; the first wrong: the class explains it.
    const right = (q: number) => (q === 8 ? "24" : q <= 52 ? String(q * 3) : String(q));
    const before = await hanaM();
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 0, typed: redo.qs.map((q) => ({ q: q.q, a: q.q === first ? ["0"] : [right(q.q)] })) });
    const half = redo.qs.filter((q) => q.q !== first).reduce((a, q) => a + Math.max(1, Math.floor(q.max / 2)), 0);
    expect(r.bonus).toBe(half);
    expect(r.results.filter((x) => x.got === x.max).length).toBe(redo.qs.length - 1);
    const m = await hanaM();
    const total = (x: typeof m) => Object.values(x.lv).reduce((a, lv) => a + (lv.got ?? 0), 0);
    expect(total(m)).toBe(total(before) + half); // the levels' marks count the half marks
    const p = computeMaster(m, BOOK.data);
    expect(p.pending).toContain(first);
    expect(redo.qs.filter((q) => q.q !== first).every((q) => !p.pending.includes(q.q))).toBe(true);
    // Once each: nothing left to redo; the solution shows now.
    await expect(level(0)).rejects.toThrow(/மீண்டும் செய்ய கேள்விகள் இல்லை/);
    expect((await fam().query(api.family.book, { unitId: u01, n: redo.qs[0].re! })).qs.find((x) => x.q === first)!.sol).not.toBeNull();
    // Still shut (the class has questions to explain, and below 75 %); Evaluation explains the rest in class: open.
    expect((await stage(u01)).gate).toMatchObject({ redo: 0 });
    expect((await stage(u02)).open).toBe(false);
    await t.mutation(api.workbook.explain, { studentId: hana, unitId: u01, qs: p.pending, on: true, by: "evaluation" });
    expect((await stage(u01)).gate).toBeUndefined();
    expect((await stage(u02)).open).toBe(true);
    // Taken back (not explained after all): shut again; the class giving him the next unit opens it whatever the score.
    await t.mutation(api.workbook.explain, { studentId: hana, unitId: u01, qs: [first], on: false, by: "evaluation" });
    expect((await stage(u02)).open).toBe(false);
    await raw.run(async (ctx) => await ctx.db.patch(hana, { unitId: u02 })); // his book now: U02
    expect((await stage(u02)).open).toBe(true);
    const lines = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "retry-home").map((e) => e.value));
    expect(lines.at(-1)).toMatch(new RegExp(` ${redo.qs.length - 1}/${redo.qs.length}$`));
  });

  test("nothing kept: files go a day after marking; uploads never attached go after a day; removing a student takes his", async () => {
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    const f = await jpeg();
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 1, q: 10, kind: "part", files: [f] });
    const lonely = await jpeg();
    const notImage = await jpeg(10, "audio/mp4");
    const [item] = await picked().query(api.photos.queue, {});
    await picked().mutation(api.photos.mark, { id: item.id, got: 2 });
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(f)).toBe(true); // marked just now: kept a day
    expect(await exists(lonely)).toBe(true);
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60_000));
    await raw.mutation(internal.photos.sweep, {});
    expect(await exists(f)).toBe(false);
    expect(await exists(lonely)).toBe(false);
    expect(await exists(notImage)).toBe(true); // only images are swept
    const row = await raw.run(async (ctx) => await ctx.db.get(item.id));
    expect(row).toMatchObject({ files: [], state: "done" });
    expect(row!.gone).toBeDefined();
    // His other photo (waiting) goes with him.
    const g = await jpeg();
    await checkEmpty(2);
    await fam().mutation(api.family.photoSend, { unitId: u01, n: 2, q: 20, kind: "part", files: [g] });
    await raw.run(async (ctx) => await wipeStudent(ctx, (await ctx.db.get(hana))!));
    expect(await exists(g)).toBe(false);
    expect(await raw.run(async (ctx) => (await ctx.db.query("homePhotos").collect()).length)).toBe(0);
  });
});
