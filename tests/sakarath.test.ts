// The Sakarath book and exam mode (17 Nov 2026; convex/lib/sakarath.ts, convex/sakarath.ts, convex/link.ts "sakarath",
// lib/family.ts `worldsOf`): a unit's Sakarath book is saved through the Claude link on a unit of its own; exam mode
// per grade turns that grade's Learn map to the Sakarath books; the same Level marks it; the class board leaves it out.
// OL (19 Nov 2026): the O/L book's own units, on no O/L topic; exam mode OL for the students ticked for the O/L map.
// Made-up questions and answers only (the repo is public).
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { MasterData } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import { isSkbGrade, isSkGrade, realGrade, sakarathProblem, skbFits, skbFor, skbKey, SK_TITLE } from "../convex/lib/sakarath";
import { OL } from "../convex/lib/syllabus";
import { worldsOf } from "../convex/lib/family";
import { secretHash } from "../convex/lib/auth";
import { seal, sha256, toB64, unseal } from "../convex/lib/seal";
import schema from "../convex/schema";
import { asOwner, asPhone } from "./helpers";

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const bytes = (s: string) => new TextEncoder().encode(s);
const ID = "TestLinkSk01";
const KEY = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 255);
let seq = 0;
const nonce = () => sha256(bytes(`sk nonce ${++seq}`)).subarray(0, 16);
const FAM = "family-phone-token-sakarath-0123456789abcdefghijklmnop";

/** A made-up Sakarath book: 3 questions (sections) of 2, 3 and 2 parts, in 2 levels. */
const DATA: MasterData = {
  kind: "master",
  parts: [{ id: "II", from: 1, to: 3, kind: "cards" }],
  levels: [
    { n: 1, from: 1, to: 2, max: 5 },
    { n: 2, from: 3, to: 3, max: 2 },
  ],
  marks: { "1": 2, "2": 3, "3": 2 },
};
const LABELS = ["i", "ii", "iii"];
/** Each part a number box (q * 10 + its place), but question 2's last part: his own words. */
function key(): KeyAnswer[] {
  return [1, 2, 3].map((q) => ({
    q,
    parts: LABELS.slice(0, DATA.marks![String(q)]).map((p, i) =>
      q === 2 && i === 2 ? { p, a: "a made-up sentence", m: 1, t: { k: "say" as const } } : { p, a: `**${q * 10 + i}**`, m: 1, t: { k: "box" as const, b: [{ v: [String(q * 10 + i)] }] } },
    ),
  }));
}
const html = (q: number) =>
  `<div class="sec first bk"><div class="sh"><span class="sn">${"abc"[q - 1]}</span><div class="st">A made-up lead ${q}</div></div>` +
  LABELS.slice(0, DATA.marks![String(q)])
    .map((p) => `<div class="pt"><div class="rp"><span class="rl">(${p})</span><span class="rt">A made-up part ${p}</span></div></div>`)
    .join("") +
  "</div>";
const items = () => [1, 2, 3].map((q) => ({ q, html: html(q) }));

describe("the Sakarath book's shape", () => {
  test("one part with parts from 1, levels one after another, marks known", () => {
    expect(sakarathProblem(DATA)).toBe("");
    expect(sakarathProblem({ ...DATA, parts: [{ id: "I", from: 1, to: 3, kind: "short" }] })).toMatch(/1 to N/);
    expect(sakarathProblem({ ...DATA, levels: [{ n: 1, from: 1, to: 2, max: 5 }] })).toMatch(/cover every question/);
    expect(sakarathProblem({ ...DATA, levels: [{ n: 1, from: 1, to: 2, max: 4 }, DATA.levels[1]] })).toMatch(/add up to 5/);
    expect(sakarathProblem({ ...DATA, marks: { "1": 2, "2": 3 } })).toMatch(/Question 3 has no marks/);
    expect(isSkGrade(108)).toBe(true);
    expect(isSkGrade(8)).toBe(false);
    expect(realGrade(108)).toBe(8);
    expect(realGrade(12)).toBe(12);
    // The printed book (19 Nov 2026): grade 200 + its grade, never a Sakarath unit's grade.
    expect(isSkbGrade(208)).toBe(true);
    expect(isSkbGrade(108)).toBe(false);
    expect(isSkGrade(208)).toBe(true); // never a grade of the syllabus either
    expect(realGrade(208)).toBe(8);
    expect(skbFor(212)).toBe(OL);
    expect([skbKey(8), skbKey(OL)]).toEqual(["G8-SKB", "OLS-SKB"]);
    expect([skbFits(8, 8), skbFits(8, 7), skbFits(OL, 10), skbFits(OL, 11), skbFits(OL, 9), skbFits(8, undefined)]).toEqual([true, false, true, true, false, false]);
  });
});

describe("the Sakarath book and exam mode", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let now = 0;
  let u01: Id<"units">;
  let u02: Id<"units">;
  let hana: Id<"students">;

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
  const sakarath = (extra: Record<string, unknown> = {}) =>
    tell({ op: "sakarath", grade: 8, code: "U02", data: DATA, answers: key(), items: items(), css: ".rl { font-weight: 700; }", ...extra });
  const unitByKey = async (k: string) => await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", k)).first());
  const fam = () => asPhone(raw, FAM);

  beforeEach(async () => {
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u01 = (await unitByKey("G8-U01"))!._id;
    u02 = (await unitByKey("G8-U02"))!._id;
    await t.mutation(api.link.open, { id: ID, key: toB64(KEY) });
    now = Date.now();
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u02 });
    const code = "hana-sakarath-link-code-01";
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", code) });
    await raw.mutation(api.family.join, { code, token: FAM, label: "Android" });
  });

  test("the link saves a unit's whole book on a unit of its own, checked, all or nothing", async () => {
    // Refused, and nothing written: no kinds, a wrong unit, a level that doesn't add up, unsafe HTML.
    const bare = key().map((k) => ({ ...k, parts: k.parts!.map(({ t: _t, ...p }) => p) }));
    expect((await sakarath({ answers: bare }))?.error).toMatch(/answer kind/);
    expect((await sakarath({ code: "U99" }))?.error).toMatch(/no unit U99/);
    expect((await sakarath({ data: { ...DATA, levels: [{ n: 1, from: 1, to: 3, max: 6 }] } }))?.error).toMatch(/add up to 7/);
    expect((await sakarath({ items: [...items().slice(0, 2), { q: 3, html: "<img src=x>" }] }))?.error).toMatch(/Question 3/);
    expect(await unitByKey("G8-U02-SK")).toBeNull();

    const r = await sakarath();
    expect(r).toMatchObject({ ok: true, made: true });
    expect(r!.share.parts).toEqual({ phone: 6, read: 1, photo: 0 });
    const sk = (await unitByKey("G8-U02-SK"))!;
    expect(sk).toMatchObject({ grade: 108, code: "U02", term: 1 });
    expect(sk.ta).toContain("ஸகராத்");
    const book = await raw.run(async (ctx) => await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", sk._id).eq("stage", "master")).first());
    expect(book).toMatchObject({ sk: true, title: SK_TITLE, keyCount: 3, qCount: 3 });
    // Saved again: the same unit, nothing doubled.
    expect(await sakarath()).toMatchObject({ ok: true, made: false });
    expect((await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 108)).collect())).length).toBe(1);
    expect((await raw.run(async (ctx) => await ctx.db.query("questions").withIndex("by_book", (q) => q.eq("unitId", sk._id).eq("stage", "master")).collect())).length).toBe(3);
    // The grade's list: U02 has it, U01 doesn't.
    const list = await ask({ op: "sakarath", grade: 8 });
    expect(list?.units.find((u: { key: string }) => u.key === "G8-U02").sk).toMatchObject({ levels: 2, questions: 3, total: 7 });
    expect(list?.units.find((u: { key: string }) => u.key === "G8-U01").sk).toBeNull();
    // The class app's list of units has it (for its name), never the syllabus of Grade 8.
    expect((await t.query(api.catalog.units, {})).some((u) => u.key === "G8-U02-SK")).toBe(true);
    expect((await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 8)).collect())).some((u) => u.key.endsWith("-SK"))).toBe(false);
  });

  test("exam mode: per grade, the owner's, only with a book; the Learn map opens the Sakarath books, all open", async () => {
    await expect(t.mutation(api.sakarath.setExam, { grade: 8, on: true })).rejects.toThrow(/no Sakarath book/);
    await sakarath();
    const sk = (await unitByKey("G8-U02-SK"))!;
    expect(await t.query(api.sakarath.exam, {})).toMatchObject({ on: [], books: { "8": 1, "7": 0 } });
    // Off: the past papers' map (U02 has no workbook: "soon"; no Sakarath Stage anywhere).
    let me = await fam().query(api.family.me, {});
    expect(me.worlds.some((w) => w.sk)).toBe(false);
    expect(me.worlds.find((w) => w.no === 2)?.unitId).toBe(u02);
    expect(await t.mutation(api.sakarath.setExam, { grade: 8, on: true })).toEqual([8]);
    me = await fam().query(api.family.me, {});
    const w2 = me.worlds.find((w) => w.no === 2)!;
    expect(w2).toMatchObject({ unitId: sk._id, sk: true, open: true, book: true, phone: true, now: true, term: 1 });
    expect(w2.en.startsWith(SK_TITLE)).toBe(true);
    expect(w2.levels.map((l) => l.s)).toEqual(["play", "later"]);
    // A unit with no Sakarath book is "soon" in exam mode (its past papers wait for exam mode to end).
    expect(me.worlds.find((w) => w.no === 1)).toMatchObject({ unitId: u01, book: false, open: false });
    // Grade 7 stays as it was; a teacher can't switch it; off again = the past papers.
    await expect(t.mutation(api.sakarath.setExam, { grade: 7, on: true })).rejects.toThrow(/no Sakarath book/);
    expect(await t.mutation(api.sakarath.setExam, { grade: 8, on: false })).toEqual([]);
    expect((await fam().query(api.family.me, {})).worlds.some((w) => w.sk)).toBe(false);
  });

  test("the same Level marks it: boxes by the phone, his words for a teacher; XP; the class board leaves it out", async () => {
    await sakarath();
    const sk = (await unitByKey("G8-U02-SK"))!;
    await t.mutation(api.sakarath.setExam, { grade: 8, on: true });
    const lv = await fam().query(api.family.level, { unitId: sk._id, n: 1 });
    expect(lv.qs.map((q) => [q.q, q.max])).toEqual([
      [1, 2],
      [2, 3],
    ]);
    expect(JSON.stringify(lv)).not.toContain("made-up sentence");
    expect(lv.qs[1].parts[2].ui).toEqual({ k: "say" });
    const r = await fam().mutation(api.family.check, {
      unitId: sk._id,
      n: 1,
      typed: [
        { q: 1, a: ["10", "11"] },
        { q: 2, a: ["20", "99", "because of a made-up reason"] },
      ],
    });
    expect(r.results.find((x: { q: number }) => x.q === 1)).toMatchObject({ got: 2, max: 2 });
    // Question 2: one part wrong, one for the teacher (his words wait in Homework).
    expect(r.results.find((x: { q: number }) => x.q === 2)).toMatchObject({ got: null, phoneGot: 1 });
    const waiting = await raw.run(async (ctx) => await ctx.db.query("homePhotos").withIndex("by_student", (q) => q.eq("studentId", hana).eq("unitId", sk._id)).collect());
    expect(waiting.map((w) => [w.q, w.state, !!w.said])).toEqual([[2, "waiting", true]]);
    const me = await fam().query(api.family.me, {});
    expect(me.total).toBe(2); // Q1; Q2 counts once the teacher marks his words
    expect(me.worlds.find((w) => w.sk)!.levels[0].s).toBe("check");
    // Level 2 opens next; the class board never carries the Sakarath book, even with him in the hall.
    expect((await fam().query(api.family.level, { unitId: sk._id, n: 2 })).qs).toHaveLength(1);
    await t.mutation(api.students.setPresent, { id: hana, present: true });
    const his = await t.query(api.state.his, { id: hana });
    expect(Object.keys(his.books).some((k) => k.startsWith(sk._id))).toBe(false);
    expect((his.more ?? []).some((p) => p.unitId === sk._id)).toBe(false);
    // Its levels can't move now that he started it; its words can.
    expect((await sakarath({ data: { ...DATA, levels: [{ n: 1, from: 1, to: 1, max: 2 }, { n: 2, from: 2, to: 3, max: 5 }] } }))?.error).toMatch(/students in it/);
    expect((await sakarath({ items: items().map((it) => ({ ...it, html: it.html.replace("lead", "opening") })) }))?.ok).toBe(true);
  });

  // The O/L book (19 Nov 2026): units of its own (the 53 topics merged), on no O/L topic; exam mode OL gives the students
  // ticked for the O/L map the book's own map: its parts, its units, all open.
  const olBook = (extra: Record<string, unknown> = {}) =>
    tell({ op: "sakarath", grade: 12, code: "U02", en: "Made-up fractions", ta: "பின்னங்கள்", term: 1, data: DATA, answers: key(), items: items(), css: ".rl { font-weight: 700; }", ...extra });

  test("OL: the link saves the O/L book's own unit, never on an O/L topic, with its names and part", async () => {
    expect((await olBook({ en: "" }))?.error).toMatch(/names/);
    expect((await olBook({ term: 0 }))?.error).toMatch(/part/);
    expect((await tell({ op: "sakarath", grade: 13, code: "U02", data: DATA, answers: key(), items: items(), css: "" }))?.error).toMatch(/grade/);
    const r = await olBook();
    expect(r).toMatchObject({ ok: true, made: true });
    const sk = (await unitByKey("OLS-U02-SK"))!;
    expect(sk).toMatchObject({ grade: 112, code: "U02", term: 1, order: 2, en: "Sakarath · Made-up fractions", ta: "பின்னங்கள் · ஸகராத்" });
    // The O/L topic 2 is another thing (Inverse proportion): untouched, no Sakarath unit of its own.
    expect(await unitByKey("OL-U02-SK")).toBeNull();
    expect((await unitByKey("OL-U02"))?.grade).toBe(12);
    // Saved again with a new name: the same unit, renamed.
    expect(await olBook({ en: "Made-up fractions II" })).toMatchObject({ ok: true, made: false });
    expect((await unitByKey("OLS-U02-SK"))?.en).toBe("Sakarath · Made-up fractions II");
    const list = await ask({ op: "sakarath", grade: 12 });
    expect(list?.units).toHaveLength(1);
    expect(list?.units[0]).toMatchObject({ key: "OLS-U02-SK", code: "U02" });
    expect(list?.units[0].sk).toMatchObject({ levels: 2, questions: 3, total: 7 });
    expect(await t.query(api.sakarath.exam, {})).toMatchObject({ on: [], books: { "12": 1, "11": 0 } });
  });

  test("OL: exam mode OL turns the O/L map of the ticked students into the book's own map; nobody else's", async () => {
    await expect(t.mutation(api.sakarath.setExam, { grade: 12, on: true })).rejects.toThrow(/OL has no Sakarath book/);
    await olBook();
    await olBook({ code: "U12", en: "Made-up algebra", ta: "அட்சரகணிதம்", term: 2 });
    const sk2 = (await unitByKey("OLS-U02-SK"))!;
    const sk12 = (await unitByKey("OLS-U12-SK"))!;
    // Hana moves to Grade 11 and is ticked for the O/L map: the 53 topics, by paper part.
    const g11 = (await unitByKey("G11-U01"))!._id;
    await t.mutation(api.students.move, { id: hana, grade: 11, term: 1, stage: "master", unitId: g11 });
    await t.mutation(api.families.setOlMap, { studentIds: [hana], on: true });
    let me = await fam().query(api.family.me, {});
    expect(me.ol).toBe(true);
    expect(me.worlds.filter((w) => !w.other)).toHaveLength(53);
    expect(me.worlds.some((w) => w.sk)).toBe(false);
    // Grade 11's own switch never touches the O/L map; OL's does.
    expect(await t.mutation(api.sakarath.setExam, { grade: 12, on: true })).toEqual([12]);
    me = await fam().query(api.family.me, {});
    const main = me.worlds.filter((w) => !w.other);
    expect(main.map((w) => [w.unitId, w.no, w.term, w.ta, w.sk, w.open, w.book, w.now])).toEqual([
      [sk2._id, 2, 1, "பின்னங்கள்", true, true, true, false],
      [sk12._id, 12, 2, "அட்சரகணிதம்", true, true, true, false],
    ]);
    expect(main[0].en).toBe(`${SK_TITLE} · Made-up fractions`);
    // The same Level marks it.
    const lv = await fam().query(api.family.level, { unitId: sk2._id, n: 1 });
    expect(lv.qs.map((q) => q.q)).toEqual([1, 2]);
    // A Grade 11 student not ticked keeps his grade's map (no Grade 11 Sakarath book; Grade 11's switch is off).
    const ravi = await t.mutation(api.students.add, { name: "Ravi K", grade: 11, term: 1, stage: "master", unitId: g11 });
    const worlds = await raw.run(async (ctx) => await worldsOf(ctx, (await ctx.db.get(ravi))!));
    expect(worlds.some((w) => w.sk)).toBe(false);
    // His trophies count both maps while it is on; off again = the 53 topics.
    expect(await t.mutation(api.sakarath.setExam, { grade: 12, on: false })).toEqual([]);
    me = await fam().query(api.family.me, {});
    expect(me.worlds.filter((w) => !w.other)).toHaveLength(53);
    expect(me.worlds.some((w) => w.sk)).toBe(false);
  });

  test("Grade 10's revision unit (U00): in the syllabus, and added once to an app from before", async () => {
    const u00 = (await unitByKey("G10-U00"))!;
    expect(u00).toMatchObject({ grade: 10, code: "U00", term: 0 });
    // An app from before (data version 4, no G10-U00): the next ensure adds it, once.
    await raw.run(async (ctx) => {
      await ctx.db.delete(u00._id);
      const meta = (await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "data")).first())!;
      await ctx.db.patch(meta._id, { value: 4 });
    });
    expect(await unitByKey("G10-U00")).toBeNull();
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.setup.ensure, {});
    const back = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 10)).collect()).filter((u) => u.code === "U00"));
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ key: "G10-U00", term: 0, en: "Revision of earlier grades" });
    expect((await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 9)).collect())).filter((u) => u.code === "U00")).toHaveLength(1);
    // Its Sakarath book goes on it like any unit's.
    expect(await sakarath({ grade: 10, code: "U00" })).toMatchObject({ ok: true, made: true });
    expect((await unitByKey("G10-U00-SK"))?.grade).toBe(110);
  });

  // The printed Sakarath book (19 Nov 2026, his ask: "the book is don't have unit by unit. This is whole big book ...
  // some students give, some students I didn't give" on the Books page's Stock, then "visible to correct" on
  // Correction): one stock item per grade, a unit of its own (grade 200 + its grade), given whole; a holder's Sakarath
  // rows come with him to Correction only.
  const rowsOf = (sid: Id<"students">) => raw.run(async (ctx) => await ctx.db.query("fees").withIndex("by_sid", (q) => q.eq("sid", sid)).collect());

  test("printed book: one stock item per grade, made with its first book (the link) and by ensure for an app from before", async () => {
    expect(await unitByKey("G8-SKB")).toBeNull(); // no Sakarath book of Grade 8 yet
    await sakarath();
    const skb = (await unitByKey("G8-SKB"))!;
    expect(skb).toMatchObject({ grade: 208, code: "SK", term: 0, order: 0, en: "Sakarath book", ta: SK_TITLE });
    await sakarath({ code: "U01" });
    expect((await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 208)).collect())).length).toBe(1);
    // It has no book row, never sits among the book's units (108) nor in Grade 8's syllabus, nor in the link's list.
    expect(await raw.run(async (ctx) => await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", skb._id).eq("stage", "master")).first())).toBeNull();
    expect((await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 108)).collect())).map((u) => u.key).sort()).toEqual(["G8-U01-SK", "G8-U02-SK"]);
    expect((await ask({ op: "sakarath", grade: 8 }))?.units.some((u: { key: string }) => u.key.includes("SKB"))).toBe(false);
    expect((await t.query(api.catalog.units, {})).some((u) => u.key === "G8-SKB")).toBe(true);
    // An app from before (data version 5, books already in): ensure makes it once; a grade with no book gets none.
    await raw.run(async (ctx) => {
      await ctx.db.delete(skb._id);
      const meta = (await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "data")).first())!;
      await ctx.db.patch(meta._id, { value: 5 });
    });
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.setup.ensure, {});
    expect((await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 208)).collect())).map((u) => u.key)).toEqual(["G8-SKB"]);
    expect(await unitByKey("G7-SKB")).toBeNull();
    // The O/L book's: its own key.
    await tell({ op: "sakarath", grade: 12, code: "U02", en: "Made-up fractions", ta: "பின்னங்கள்", term: 1, data: DATA, answers: key(), items: items(), css: "" });
    expect(await unitByKey("OLS-SKB")).toMatchObject({ grade: 212, code: "SK" });
  });

  test("printed book: given whole from Stock to its grade's students, once a book is in the app; charged once, like any printed book", async () => {
    // Its unit with no book in the app yet: refused (a book given with nothing to open would hide him from "out of work").
    const early = await raw.run(async (ctx) => await ctx.db.insert("units", { grade: 208, code: "SK", key: "G8-SKB", term: 0, order: 0, en: "Sakarath book", ta: SK_TITLE }));
    await expect(t.mutation(api.students.giveMany, { ids: [hana], unitId: early, stage: "master", given: true, by: "money" })).rejects.toThrow(/Grade 8 has no Sakarath book in the app yet/);
    await sakarath();
    const skb = (await unitByKey("G8-SKB"))!;
    expect(skb._id).toBe(early); // the save found it: one item
    // Another grade's student: nobody gets it (all or nothing); never as a theory book.
    const g7 = (await unitByKey("G7-U01"))!._id;
    const ravi = await t.mutation(api.students.add, { name: "Ravi P", grade: 7, term: 1, stage: "master", unitId: g7 });
    await expect(t.mutation(api.students.giveMany, { ids: [hana, ravi], unitId: skb._id, stage: "master", given: true, by: "money" })).rejects.toThrow(/Grade 8 Sakarath book is not for Ravi P \(Grade 7\)/);
    await expect(t.mutation(api.students.giveMany, { ids: [hana], unitId: skb._id, stage: "fighter", given: true, by: "money" })).rejects.toThrow(/given whole/);
    await expect(t.mutation(api.students.setGiven, { id: ravi, unitId: skb._id, stage: "master", given: true, by: "money" })).rejects.toThrow(/not for Ravi P/);
    // The fees on, its price set (the owner, ⋯ on its line): given = one book row at its price; taken back = gone.
    await t.mutation(api.money.setup, { fee: 350, paper: 7, start: "today" });
    await t.mutation(api.money.setBook, { u: skb._id, st: "master", price: 300 });
    expect(await t.mutation(api.students.giveMany, { ids: [hana], unitId: skb._id, stage: "master", given: true, by: "money" })).toBe(1);
    expect(await t.mutation(api.students.giveMany, { ids: [hana], unitId: skb._id, stage: "master", given: true, by: "money" })).toBe(0);
    expect((await rowsOf(hana)).filter((r) => r.k === "book").map((r) => [r.u, r.a])).toEqual([[skb._id, 300]]);
    const shop = await t.query(api.money.shop, {});
    expect(shop.hand[hana]).toEqual([`${skb._id}:master`]);
    expect(shop.items.find((i) => i.u === skb._id)).toMatchObject({ price: 300, given: 1 });
    const hist = await t.query(api.state.history, {});
    expect(hist.find((e) => e.kind === "book-given")?.value).toBe("G8-SKB Sakarath book");
    expect(await t.mutation(api.students.giveMany, { ids: [hana], unitId: skb._id, stage: "master", given: false, by: "money" })).toBe(1);
    expect((await rowsOf(hana)).filter((r) => r.k === "book")).toEqual([]);
    expect((await t.query(api.money.shop, {})).items.find((i) => i.u === skb._id)).toMatchObject({ given: 0 });
  });

  test("printed book on Correction: a holder's Sakarath rows come with him (whatever they wait for), a unit opens for him, the same marks save", async () => {
    await sakarath();
    await sakarath({ code: "U01" });
    const sk2 = (await unitByKey("G8-U02-SK"))!;
    const sk1 = (await unitByKey("G8-U01-SK"))!;
    const skb = (await unitByKey("G8-SKB"))!;
    await t.mutation(api.sakarath.setExam, { grade: 8, on: true });
    // He did U02's first level on his phone; he is in the hall.
    await fam().mutation(api.family.check, { unitId: sk2._id, n: 1, typed: [{ q: 1, a: ["10", "11"] }, { q: 2, a: ["20", "21", "a made-up reason"] }] });
    await t.mutation(api.students.setPresent, { id: hana, present: true });
    let his = await t.query(api.state.his, { id: hana });
    expect(his.sk).toBeNull(); // no printed book: the phone's, as before
    expect((his.more ?? []).some((p) => p.unitId === sk2._id)).toBe(false);
    // A unit opens only for a student who holds the book.
    await expect(t.mutation(api.sakarath.open, { id: hana, unitId: sk1._id })).rejects.toThrow(/doesn't have this Sakarath book/);
    await t.mutation(api.students.giveMany, { ids: [hana], unitId: skb._id, stage: "master", given: true, by: "money" });
    his = await t.query(api.state.his, { id: hana });
    expect(his.sk?.map((p) => p.unitId)).toEqual([sk2._id]);
    expect(Object.keys(his.books)).toContain(`${sk2._id}:master`);
    expect((his.more ?? []).some((p) => p.unitId === sk2._id)).toBe(false); // the other pages still leave it out
    // The book in his hands is work (never "out of work" while he has it), never finished.
    expect(his.given?.find((g) => g.unitId === skb._id)).toMatchObject({ stage: "master", work: true, done: false });
    // U01 he never opened: Correction makes his row (nothing else changes; he stays on his book now).
    await expect(t.mutation(api.sakarath.open, { id: hana, unitId: skb._id })).rejects.toThrow(/not a unit of a Sakarath book/);
    await expect(t.mutation(api.sakarath.open, { id: hana, unitId: u01 })).rejects.toThrow(/not a unit of a Sakarath book/);
    expect(await t.mutation(api.sakarath.open, { id: hana, unitId: sk1._id })).toBe(true);
    expect(await t.mutation(api.sakarath.open, { id: hana, unitId: sk1._id })).toBe(true);
    his = await t.query(api.state.his, { id: hana });
    expect(his.sk?.map((p) => p.unitId).sort()).toEqual([sk1._id, sk2._id].sort());
    expect((await raw.run(async (ctx) => await ctx.db.get(hana)))?.unitId).toBe(u02);
    // Correction marks it like any workbook level (a draft, then Save).
    await t.mutation(api.focus.mark, { studentId: hana, unitId: sk1._id, level: 1, set: [{ q: 1, g: 2 }], by: "correction" });
    const r = await t.mutation(api.workbook.correct, { studentId: hana, unitId: sk1._id, level: 1, items: [{ q: 1, got: 2 }, { q: 2, got: 1 }], by: "correction" });
    expect(r).toMatchObject({ got: 3, max: 5 });
    his = await t.query(api.state.his, { id: hana });
    const row = his.sk!.find((p) => p.unitId === sk1._id)!;
    expect((row.m as { lv: Record<string, { fixed?: number }> }).lv["1"]?.fixed).toBeTypeOf("number");
    // Taken back: the phone's again.
    await t.mutation(api.students.setGiven, { id: hana, unitId: skb._id, stage: "master", given: false, by: "money" });
    his = await t.query(api.state.his, { id: hana });
    expect(his.sk).toBeNull();
    expect(his.given ?? []).toEqual([]);
    await expect(t.mutation(api.sakarath.open, { id: hana, unitId: sk1._id })).rejects.toThrow(/doesn't have/);
  });
});
