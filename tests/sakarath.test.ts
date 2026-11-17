// The Sakarath book and exam mode (17 Nov 2026; convex/lib/sakarath.ts, convex/sakarath.ts, convex/link.ts "sakarath",
// lib/family.ts `worldsOf`): a unit's Sakarath book is saved through the Claude link on a unit of its own; exam mode
// per grade turns that grade's Learn map to the Sakarath books; the same Level marks it; the class board leaves it out.
// Made-up questions and answers only (the repo is public).
import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { MasterData } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import { isSkGrade, realGrade, sakarathProblem, SK_TITLE } from "../convex/lib/sakarath";
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
});
