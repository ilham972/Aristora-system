// The family app (app.aristora.org): what a phone can mark from the answer key, family links and phones that see only
// their child, a level marked at home (⌂) that the teachers see at once, Correction's check, XP, streak and the board.
// The answers here are FAKE (made-up numbers in the shapes his keys use: bold finals, "also accept", labels, names,
// yes/no): the repo is public. The book is the skeleton of Grade 8 U01 (structure only).

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { FAMILY_SIGNED_OUT, secretHash, SIGNED_OUT } from "../convex/lib/auth";
import { outOf } from "../convex/lib/book";
import { slWeekStart } from "../convex/lib/day";
import type { KeyAnswer } from "../convex/lib/key";
import { computeMaster } from "../convex/lib/master";
import { wipeStudent } from "../convex/lib/backend";
import { markPart, markQuestion, parseExpr, parseNum, phoneKey, phoneShare, wantsOf, wantWords, type KeyPart } from "../convex/lib/phone";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import { addPerson, asOwner, asPhone } from "./helpers";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const val = (raw: string, n: number) => parseExpr(raw)!.fn([n, 1]);

describe("what a phone can mark, read from the key", () => {
  test("numbers as students type them: whole, negative, decimal, fractions, mixed", () => {
    expect(parseNum("15")).toEqual([15, 1]);
    expect(parseNum("−40")).toEqual([-40, 1]);
    expect(parseNum("2.5")).toEqual([5, 2]);
    expect(parseNum("6/8")).toEqual([3, 4]);
    expect(parseNum("2 1/3")).toEqual([7, 3]);
    expect(parseNum("2⅓")).toEqual([7, 3]);
    expect(parseNum("-1 1/2")).toEqual([-3, 2]);
    for (const bad of ["", "2,5", "1+3/4", "abc", "3n", "1/0"]) expect(parseNum(bad)).toBeNull();
  });

  test("answers in n: the same value for every n is right, however it is written", () => {
    for (const n of [1, 2, 5]) {
      expect(val("2n − 1", n)).toEqual(val("n + n - 1", n));
      expect(val("n(n + 1)/2", n)).toEqual(val("(n^2+n)/2", n));
      expect(val("n²", n)).toEqual(val("n*n", n));
      expect(val("3(n − 1) + 2", n)).toEqual(val("3n-1", n));
    }
    // A fraction or a square that lost its shape is never guessed.
    expect(parseExpr("n(n + 1)2")).toBeNull();
    expect(parseExpr("n2")).toBeNull();
    expect(parseExpr("2n + 3m")).toBeNull(); // two letters
  });

  const kinds = (raw: string) => wantsOf(raw)?.want.map((w) => `${w.box.l ? `${w.box.l} ` : ""}${w.box.k}:${w.t}`) ?? null;
  test("the final answer in bold counts; labels come from just before it", () => {
    expect(kinds("3 × 11 + 2 = **35**")).toEqual(["num:35"]);
    expect(kinds("d = 4; 7 = 4 × 1 + 3 → **4n + 3**")).toEqual(["expr:4n + 3"]);
    expect(kinds("difference −4 → x = **52**, y = **48**")).toEqual(["x = num:52", "y = num:48"]);
    expect(kinds("(6 × 7)/2 = **21**; (7 × 8)/2 = **28**")).toEqual(["num:21", "num:28"]);
    expect(kinds("−1/3 → **3, 2 2/3**")).toEqual(["num:3", "num:2 2/3"]);
    expect(kinds("(77 + 1)/2 = **39** ஆம் உறுப்பு")).toEqual(["num:39"]);
    expect(kinds("9² = ரூ. **81**")).toEqual(["num:81"]);
  });

  test("a whole answer: numbers, labelled lists, notes and answers also accepted", () => {
    expect(kinds("70, 85")).toEqual(["num:70", "num:85"]);
    expect(wantsOf("70, 85")!.anyOrder).toBe(true);
    expect(kinds("A = 18, B = 7")).toEqual(["A = num:18", "B = num:7"]);
    expect(kinds("i → 4n − 3, ii → 5n, iii → n² + 1")).toEqual(["i → expr:4n − 3", "ii → expr:5n", "iii → expr:n² + 1"]);
    expect(kinds("8 ஆவது (3, 6, 9, 12, 15, 18, 21, 24)")).toEqual(["num:8"]);
    expect(kinds("3n + 2 (கோடிடுக)")).toEqual(["expr:3n + 2"]);
    const also = wantsOf("21 (22 உம் ஏற்கலாம்)")!.want[0];
    expect("ok" in also && also.ok).toEqual([[21, 1], [22, 1]]);
  });

  test("the teacher marks names, reasons, drawings, working and anything unclear", () => {
    for (const raw of [
      "சிறப்புப் பெயர்", // a name
      "2, 5, 8 → **சிறப்புப் பெயர்** தொடர்", // a name in bold
      "இல்லை; 12 ஆவது = 12² = **144**", // no + a reason
      "ஆம்: 8 × 9/2 = 36 → **8** ஆவது", // yes + which
      "21 + 28 = 49 = 7²", // show that (working, no bold)
      "5 + 17", // the form matters
      "4 · சிறப்புப் பெயர்", // a number and a name
      "15 புள்ளிகள்: 1, 2, 3, 4, 5 என வரிசைகள்", // a drawing
      "work → **B53**", // not a number
      "**15", // an unclosed bold
    ]) expect(wantsOf(raw), raw).toBeNull();
  });

  test("money as the keys write it: ரூபா, ரூபாய், ரூ., Rs., LKR, /= and thousands commas", () => {
    // His screenshot (4 Nov 2026): "ரூபா 550 இன் 7/11" asked for a photo while "ரூ 750 இன் 7/10" had a box.
    const words = (raw: string) => wantsOf(raw)?.want.map((w) => w.t) ?? null;
    for (const raw of ["ரூபா 350", "**ரூபா 350**", "ரூபாய் 350", "550 × 7/11 = **ரூபா 350**", "ரூ. 350/=", "Rs. 350/-", "350/=", "LKR 350", "ரூபா 350.00"]) {
      expect(wantsOf(raw)?.want.length, raw).toBe(1);
    }
    expect(markPart({ p: "", m: 2, ...wantsOf("**ரூபா 350**")! }, ["350"])!.got).toBe(2);
    // Thousands: one box, never two (his 1250 used to get ✗).
    expect(words("ரூ. 1,250")).toEqual(["1250"]);
    expect(words("Rs. 1,250,000/=")).toEqual(["1250000"]);
    expect(words("**12,500**")).toEqual(["12500"]);
    expect(markPart({ p: "", m: 2, ...wantsOf("ரூ. 1,250")! }, ["1250"])!.got).toBe(2);
    // Thousands with a space (the textbooks' way), thin spaces too; a mixed number stays a mixed number.
    expect(words("ரூ. 36 000")).toEqual(["36000"]);
    expect(words("**ரூபா 36\u202f000**")).toEqual(["36000"]);
    expect(words("1 250 000")).toEqual(["1250000"]);
    expect(words("2 1/3")).toEqual(["2 1/3"]);
    // His Q30 shapes (4 Nov 2026): words around one bold number, a label inside the bold, working ending "= a number".
    expect(words("**மொத்தம் 36000**")).toEqual(["36000"]);
    expect(words("**36000 ரூபா ஆகும்**")).toEqual(["36000"]);
    expect(kinds("**x = 36000**")).toEqual(["x = num:36000"]);
    expect(words("60000 × 3/5 = 36000")).toEqual(["36000"]);
    expect(words("ரூ. 60000 × 3/5 = ரூ. 36 000")).toEqual(["36000"]);
    for (const raw of ["21 + 28 = 49 = 7²", "(6 × 7)/2 = 21; (7 × 8)/2 = 28", "**36000 அல்லது 36500**", "3 6 9", "**2x 5**"]) {
      expect(wantsOf(raw), raw).toBeNull();
    }
    // Lists stay lists: a comma and a space, short groups, or three groups with no money (terms of a pattern).
    expect(words("70, 85")).toEqual(["70", "85"]);
    expect(words("3,6,9")).toEqual(["3", "6", "9"]);
    expect(words("100,121,144")).toEqual(["100", "121", "144"]);
    expect(words("ரூ. 1,250, ரூ. 2,500")).toEqual(["1250", "2500"]);
    // The teachers' list shows the key's own words for what the corrector marks (the shape the phone can't read).
    const k = phoneKey([{ q: 1, a: "சிறப்புப் பெயர்" }], BOOK.data);
    expect(k.get(1)!.parts[0]).toMatchObject({ want: null, a: "சிறப்புப் பெயர்" });
  });

  test("units, ratios, points and sets: he types the numbers, the unit is printed after his box", () => {
    const boxes = (raw: string) => wantsOf(raw)?.want.map((w) => w.box) ?? null;
    expect(boxes("35%")).toEqual([{ k: "num", u: "%" }]);
    expect(boxes("0.4 × 100 = **40%**")).toEqual([{ k: "num", u: "%" }]);
    expect(boxes("0.4 × 100 = **40**%")).toEqual([{ k: "num", u: "%" }]);
    expect(boxes("x = 35°, y = 55°")).toEqual([{ k: "num", l: "x =", u: "°" }, { k: "num", l: "y =", u: "°" }]);
    expect(boxes("18 cm²")).toEqual([{ k: "num", u: "cm²" }]);
    expect(boxes("7 m")).toEqual([{ k: "num", u: "m" }]); // 7 metres (it was an answer in m, and 7 was ✗)
    expect(boxes("7m")).toEqual([{ k: "expr", v: "m" }]); // no space: still an answer in m
    expect(boxes("−3 °C")).toEqual([{ k: "num", u: "°C" }]);
    expect(boxes("12 சட்டகங்கள்")).toEqual([{ k: "num" }]); // a Tamil word after a number: as before
    expect(boxes("1 h 45 min")).toEqual([{ k: "num", u: "h" }, { k: "num", u: "min" }]);
    expect(boxes("2 kg 150 g")).toEqual([{ k: "num", u: "kg" }, { k: "num", u: "g" }]);
    expect(boxes("3 மணி 20 நிமிடம்")).toEqual([{ k: "num", u: "மணி" }, { k: "num", u: "நிமிடம்" }]);
    expect(boxes("4 : 7")).toEqual([{ k: "num" }, { k: "num", j: ":" }]);
    expect(boxes("**4** : **7**")).toEqual([{ k: "num" }, { k: "num", j: ":" }]);
    expect(boxes("(−1, 6)")).toEqual([{ k: "num", l: "x" }, { k: "num", l: "y" }]);
    expect(boxes("P(4, 0)")).toEqual([{ k: "num", l: "x" }, { k: "num", l: "y" }]);
    expect(boxes("{3, 6, 9}")).toEqual([{ k: "num" }, { k: "num" }, { k: "num" }]);
    expect(wantsOf("A = {3, 6, 9}")!.anyOrder).toBe(true);
    expect(wantsOf("4 : 7")!.anyOrder).toBe(false);
    expect(wantsOf("12 cm, 15 cm")!.anyOrder).toBe(true);
    expect(wantsOf("12 cm, 15 kg")!.anyOrder).toBe(false); // two units: each in its place
    // The teachers' list shows each answer as the key writes it.
    const words = (raw: string) => wantWords({ p: "", m: 2, ...wantsOf(raw)! });
    expect(words("35%")).toBe("35%");
    expect(words("0.4 × 100 = **40**%")).toBe("40%");
    expect(words("**4** : **7**")).toBe("4 : 7");
    expect(words("1 h 45 min")).toBe("1 h 45 min");
    expect(words("P(4, 0)")).toBe("P(4, 0)");
    expect(words("{3, 6, 9}")).toBe("{3, 6, 9} (any order)");
    // Still the teacher's: letters in a set, two sets, a clock time with a.m., an empty set.
    for (const raw of ["{p, q, r}", "A = {1, 2}, B = {3}", "10:30 a.m.", "{ }"]) expect(wantsOf(raw), raw).toBeNull();
  });

  test("marking: all right = the part's marks; else its share; plain numbers in any order", () => {
    const part = (raw: string, m: number): KeyPart => ({ p: "", m, ...wantsOf(raw)! });
    expect(markPart(part("70, 85", 2), ["85", "70"])).toEqual({ ok: [true, true], got: 2 });
    expect(markPart(part("70, 85", 2), ["70", "75"])).toEqual({ ok: [true, false], got: 1 });
    expect(markPart(part("x = **52**, y = **48**", 2), ["48", "52"])).toEqual({ ok: [false, false], got: 0 }); // labelled: in order
    expect(markPart(part("3, 6, 9, 12", 2), ["3", "6", "9", "13"])).toEqual({ ok: [true, true, true, false], got: 1 });
    expect(markPart(part("**4n + 3**", 2), ["3+4n"])).toEqual({ ok: [true], got: 2 });
    expect(markPart(part("**4n + 3**", 2), ["4x+3"])).toEqual({ ok: [false], got: 0 }); // another letter
    expect(markPart(part("21 (22 உம் ஏற்கலாம்)", 2), ["22"])).toEqual({ ok: [true], got: 2 });
    expect(markPart(part("2 1/3", 2), ["7/3"])).toEqual({ ok: [true], got: 2 });
    expect(markPart(part("15", 2), [""])!.got).toBe(0);
    expect(markPart(part("35%", 2), ["35"])).toEqual({ ok: [true], got: 2 }); // the % is printed: he types 35
    expect(markPart(part("35%", 2), ["0.35"])).toEqual({ ok: [false], got: 0 });
    expect(markPart(part("4 : 7", 2), ["7", "4"])).toEqual({ ok: [false, false], got: 0 }); // a ratio: in its order
    expect(markPart(part("**4** : **7**", 2), ["7", "4"])!.got).toBe(0);
    expect(markPart(part("(−1, 6)", 2), ["-1", "6"])).toEqual({ ok: [true, true], got: 2 });
    expect(markPart(part("{3, 6, 9}", 3), ["9", "3", "6"])).toEqual({ ok: [true, true, true], got: 3 });
    expect(markPart(part("1 h 45 min", 2), ["1", "45"])).toEqual({ ok: [true, true], got: 2 });
    expect(markPart(part("7 m", 1), ["7"])).toEqual({ ok: [true], got: 1 });
  });

  test("a whole workbook: part marks must add up to the book's, else the teacher marks that question", () => {
    const key: KeyAnswer[] = [
      { q: 1, a: "15" },
      { q: 2, a: "சிறப்புப் பெயர்" },
      { q: 53, parts: [{ p: "i", a: "**7**", m: 1 }, { p: "ii", a: "இல்லை; ...", m: 2 }] },
      { q: 54, parts: [{ p: "i", a: "**7**" }] }, // no marks on the part
    ];
    const k = phoneKey(key, BOOK.data);
    expect(k.get(1)!.parts[0].want).not.toBeNull();
    expect(k.get(2)!.parts[0].want).toBeNull();
    expect(k.get(3)!.parts[0].want).toBeNull(); // not in the key
    expect(k.get(53)!.parts.map((p) => p.want !== null)).toEqual([true, false]);
    expect(k.get(54)!.parts).toEqual([{ p: "", m: outOf(BOOK.data, 54), want: null, anyOrder: false }]);
    expect(markQuestion(k.get(53)!, ["7"])).toEqual({ ok: [[true], null], got: null, phoneGot: 1, parts: [1, null] });
    expect(phoneShare(k)).toMatchObject({ questions: 1, of: 73, max: 230 });
  });
});

/** A fake key for the U01 skeleton, in the shapes of his keys. Level 1 = Q1–10. */
function fakeKey(): KeyAnswer[] {
  const out: KeyAnswer[] = [];
  for (let q = 1; q <= 52; q++) {
    const d = q % 10;
    const a =
      d === 0 ? "சிறப்புப் பெயர்" : d === 9 ? `${q}, ${q + 1}` : d === 7 ? `${q}n − 1` : d === 3 ? `${q * 3} (${q * 3 + 1} உம் ஏற்கலாம்)` : String(q * 3);
    out.push({ q, a });
  }
  for (let q = 53; q <= 73; q++) {
    const m = outOf(BOOK.data, q)!;
    out.push(q === 53 ? { q, parts: [{ p: "i", a: "x = **5**, y = **7**", m: 2 }, { p: "ii", a: "ஆம்: காரணம்", m: m - 2 }] } : { q, parts: [{ p: "i", a: `work = **${q}**`, m }] });
  }
  return out;
}

/** Level 1, as Hana types it: Q1–Q7 and Q9 right (Q3 with the answer also accepted, Q9 the other way round), Q8 wrong. */
const LEVEL1 = [
  { q: 1, a: ["3"] },
  { q: 2, a: ["6"] },
  { q: 3, a: ["10"] },
  { q: 4, a: ["12"] },
  { q: 5, a: ["15"] },
  { q: 6, a: ["18"] },
  { q: 7, a: ["n + 6n - 1"] },
  { q: 8, a: ["99"] },
  { q: 9, a: ["10", "9"] },
];

const FAM = "family-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const FAM2 = "family-phone-token-2-0123456789abcdefghijklmnopqrstuvw";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

describe("the family app on the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let u02: Id<"units">;
  let hana: Id<"students">;
  let bilal: Id<"students">;
  const unit = async (key: string) => await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
  const save = async (unitId: Id<"units">, key: KeyAnswer[] | undefined) =>
    await t.mutation(api.catalog.saveWorkbook, {
      unitId,
      parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
      levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
      marks: BOOK.data.marks ?? {},
      replace: true,
      ...(key ? { key } : {}),
    });
  /** A family link made by the owner and opened on a phone with this token. */
  const joinAs = async (studentId: Id<"students">, tok: string, code = `code-${tok.slice(-20)}`) => {
    await t.mutation(api.families.makeLink, { studentId, codeHash: secretHash("family-link", code) });
    return await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
  };
  const fam = (tok = FAM) => asPhone(raw, tok);
  const hanaM = async () =>
    await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student_unit_stage", (q) => q.eq("studentId", hana).eq("unitId", u01).eq("stage", "master")).first())?.m);

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T15:00:00+05:30")); // a Wednesday
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u01 = await unit("G8-U01");
    u02 = await unit("G8-U02");
    await save(u01, fakeKey());
    await save(u02, undefined); // a workbook with no key yet
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    bilal = await t.mutation(api.students.add, { name: "Bilal M", grade: 8, term: 1, stage: "master", unitId: u01 });
  });
  afterEach(() => vi.useRealTimers());

  test("a family link: made by the owner or a Students teacher, opened once, sees only its child", async () => {
    await addPerson(raw, { name: "Corrector", token: "corrector-token-0123456789abcdefghijklmnopqrstu", tabs: ["correction"] });
    await expect(
      asPhone(raw, "corrector-token-0123456789abcdefghijklmnopqrstu").mutation(api.families.makeLink, {
        studentId: hana,
        codeHash: secretHash("family-link", "x".repeat(22)),
      }),
    ).rejects.toThrow(/Students/);
    const code = "hana-family-link-code-0123";
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", code) });
    expect(await raw.query(api.family.peek, { code })).toEqual({ name: "Hana K", problem: null });
    expect(await raw.mutation(api.family.join, { code, token: FAM, label: "Android" })).toEqual({ name: "Hana K" });
    expect((await raw.query(api.family.peek, { code })).problem).toMatch(/already used/);
    await expect(raw.mutation(api.family.join, { code, token: FAM2 })).rejects.toThrow(/already used/);
    expect((await fam().query(api.family.me, {})).name).toBe("Hana K");
    // A family phone can't use any teacher function, and a teacher's phone isn't a family phone.
    await expect(fam().query(api.state.get, {})).rejects.toThrow(SIGNED_OUT);
    await expect(fam().mutation(api.workbook.levelDone, { studentId: hana, level: 1 })).rejects.toThrow(SIGNED_OUT);
    await expect(t.query(api.family.me, {})).rejects.toThrow(FAMILY_SIGNED_OUT);
    // A newer link cancels the old unused one; signing his family out ends every phone.
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", "old-unused-link-code-0") });
    await t.mutation(api.families.makeLink, { studentId: hana, codeHash: secretHash("family-link", "new-link-code-012345") });
    expect((await raw.query(api.family.peek, { code: "old-unused-link-code-0" })).problem).toMatch(/was stopped/);
    expect((await t.query(api.families.phones, { studentId: hana })).phones).toHaveLength(1);
    expect(await t.mutation(api.families.signOutAll, { studentId: hana })).toBe(1);
    await expect(fam().query(api.family.me, {})).rejects.toThrow(FAMILY_SIGNED_OUT);
    expect((await raw.query(api.family.peek, { code: "new-link-code-012345" })).problem).toMatch(/was stopped/);
  });

  test("a removed student's family phone is signed out", async () => {
    await joinAs(hana, FAM);
    await t.mutation(api.students.setArchived, { id: hana, archived: true });
    await expect(fam().query(api.family.me, {})).rejects.toThrow(FAMILY_SIGNED_OUT);
  });

  test("his Stages: his unit is open, the next opens when it is done, given books and Open every Stage open them", async () => {
    await joinAs(hana, FAM);
    const worlds = async () => (await fam().query(api.family.me, {})).worlds.filter((w) => w.book).map((w) => [w.no, w.open, w.phone]);
    expect(await worlds()).toEqual([
      [1, true, true],
      [2, false, false],
    ]);
    const me = await fam().query(api.family.me, {});
    // The whole syllabus of his grade is on the map, by term; a unit with no workbook yet has nothing to play.
    const units = await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 8)).collect());
    expect(me.worlds).toHaveLength(units.length);
    expect(me.worlds.map((w) => w.no).slice(0, 3)).toEqual([1, 2, 3]);
    expect(new Set(me.worlds.map((w) => w.term))).toEqual(new Set(units.map((u) => u.term)));
    expect(me.worlds[2]).toMatchObject({ no: 3, book: false, open: false, phone: false, levels: [], allDone: false });
    expect(me.worlds[0].levels[0]).toEqual({ n: 1, max: 20, s: "play" });
    expect(me.worlds[0].levels[1].s).toBe("later");
    await t.mutation(api.families.setOpenAll, { studentId: hana, on: true });
    expect((await worlds())[1]).toEqual([2, true, false]);
    await t.mutation(api.families.setOpenAll, { studentId: hana, on: false });
    await t.mutation(api.students.setGiven, { id: hana, unitId: u02, stage: "master", given: true });
    expect((await worlds())[1][1]).toBe(true);
    await t.mutation(api.students.setGiven, { id: hana, unitId: u02, stage: "master", given: false });
    // Every level of World 1 handed in or marked: World 2 opens.
    await raw.run(async (ctx) => {
      const p = await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", hana)).first();
      const lv = Object.fromEntries(BOOK.data.levels.map((l) => [String(l.n), { done: Date.now() }]));
      if (p) await ctx.db.patch(p._id, { m: { q: {}, lv } });
      else await ctx.db.insert("progress", { studentId: hana, unitId: u01, stage: "master", marks: {}, m: { q: {}, lv }, startedAt: 0, updatedAt: 0 });
    });
    expect((await worlds())[1][1]).toBe(true);
  });

  test("the O/L map: ticked Grade 10–11 students see the O/L topics by paper part; today's topic opens for the ticked; the other syllabus follows", async () => {
    const olUnits = (await raw.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 12)).collect())).sort(
      (a, b) => a.term - b.term || a.order - b.order,
    );
    expect(olUnits).toHaveLength(53);
    const sq = olUnits[0]; // Paper I A, 01 on his sheet
    const cons = olUnits.find((u) => u.term === 4 && u.en === "Constructions")!; // Paper II B: 08 on his sheet
    // Two O/L workbooks (skeletons, fake key): the first topic with a key, Constructions without one.
    const olBook = async (unitId: Id<"units">, key: boolean) =>
      await t.mutation(api.catalog.saveWorkbook, {
        unitId,
        parts: [{ id: "IA", to: 10, each: 2 }],
        levels: [
          { to: 5, max: 10 },
          { to: 10, max: 10 },
        ],
        replace: true,
        ...(key ? { key: Array.from({ length: 10 }, (_, i) => ({ q: i + 1, a: String((i + 1) * 3) })) } : {}),
      });
    await olBook(sq._id, true);
    await olBook(cons._id, false);
    const nila = await t.mutation(api.students.add, { name: "Nila S", grade: 11, term: 3 });
    const ravi = await t.mutation(api.students.add, { name: "Ravi T", grade: 10, term: 3 });
    await joinAs(nila, FAM);

    // Not ticked: his grade's map (Grade 11 has no workbook yet: every Stage "soon"), no O/L topic on it.
    let me = await fam().query(api.family.me, {});
    expect(me.ol).toBe(false);
    expect(me.worlds.length).toBeGreaterThan(0);
    expect(me.worlds.every((w) => !w.book && !w.other)).toBe(true);
    await expect(fam().query(api.family.level, { unitId: sq._id, n: 1 })).rejects.toThrow(/not on your map/);

    // Who ticks: the owner or a Students teacher; Grade 10 and 11 only (all checked first); never a family phone.
    await addPerson(raw, { name: "Corrector", token: "corrector-token-0123456789abcdefghijklmnopqrstu", tabs: ["correction"] });
    await expect(
      asPhone(raw, "corrector-token-0123456789abcdefghijklmnopqrstu").mutation(api.families.setOlMap, { studentIds: [nila], on: true }),
    ).rejects.toThrow(/Students/);
    await expect(t.mutation(api.families.setOlMap, { studentIds: [nila, hana], on: true })).rejects.toThrow(/Grade 10 and 11/);
    expect((await t.query(api.families.phones, { studentId: nila })).olMap).toBe(false);
    await expect(fam().mutation(api.families.setOlMap, { studentIds: [nila], on: true })).rejects.toThrow(SIGNED_OUT);
    expect(await t.mutation(api.families.setOlMap, { studentIds: [nila, ravi], on: true })).toBe(2);
    expect(await t.mutation(api.families.setOlMap, { studentIds: [nila], on: true })).toBe(0);
    expect((await t.query(api.families.phones, { studentId: nila })).olMap).toBe(true);
    const hist = await raw.run(async (ctx) => await ctx.db.query("events").collect());
    expect(hist.filter((e) => e.kind === "ol-map").map((e) => [e.name, e.value])).toEqual([
      ["Nila S", "on"],
      ["Ravi T", "on"],
    ]);

    // Ticked: the O/L syllabus by paper part (each part a World), numbered as on his sheet; the first topic in the app
    // is open to start (his answer: one by one), the next one shut.
    me = await fam().query(api.family.me, {});
    expect(me.ol).toBe(true);
    expect(me.worlds).toHaveLength(53);
    expect([...new Set(me.worlds.map((w) => w.term))]).toEqual([1, 2, 3, 4]);
    expect(me.worlds.filter((w) => w.book).map((w) => [w.no, w.ta, w.open, w.phone])).toEqual([
      [1, sq.ta, true, true],
      [8, cons.ta, false, false],
    ]);
    expect((await fam().query(api.family.level, { unitId: sq._id, n: 1 })).qs).toHaveLength(5);
    await expect(fam().query(api.family.questions, { unitId: cons._id, n: 1 })).rejects.toThrow(/locked/);

    // Today's topic (his words: "the unit I taught lastly"): given to the ticked in one tap, as Books given. Checked
    // first (a Grade 8 student refuses it for everyone), only a book in the app, and only once each.
    await expect(t.mutation(api.students.giveMany, { ids: [nila, hana], unitId: cons._id, stage: "master", given: true })).rejects.toThrow(/Grade 10 and 11/);
    await expect(t.mutation(api.students.giveMany, { ids: [nila], unitId: olUnits[2]._id, stage: "master", given: true })).rejects.toThrow(/in the app/);
    expect(await t.mutation(api.students.giveMany, { ids: [nila, ravi], unitId: cons._id, stage: "master", given: true })).toBe(2);
    expect(await t.mutation(api.students.giveMany, { ids: [nila, ravi], unitId: cons._id, stage: "master", given: true })).toBe(0);
    const c = (await fam().query(api.family.me, {})).worlds.find((w) => w.unitId === cons._id)!;
    expect([c.open, (c.given ?? 0) > 0]).toEqual([true, true]);
    expect((await fam().query(api.family.me, {})).worlds.find((w) => w.unitId === sq._id)!.given).toBeUndefined();
    // The sheet's list: the O/L topics with a workbook, in his sheet's order, and who in each grade has each.
    const topics = await t.query(api.families.olTopics, { grade: 11 });
    expect(topics.topics.map((x) => [x.no, x.part, x.levels, x.phone])).toEqual([
      [1, 1, 2, true],
      [8, 4, 2, false],
    ]);
    expect(topics.given).toEqual({ [cons._id]: [nila] });
    expect((await t.query(api.families.olTopics, { grade: 10 })).given).toEqual({ [cons._id]: [ravi] });
    await expect(asPhone(raw, "corrector-token-0123456789abcdefghijklmnopqrstu").query(api.families.olTopics, { grade: 11 })).rejects.toThrow(/Students/);
    // Taken back: shut again on his phone (the first topic stays open).
    expect(await t.mutation(api.students.giveMany, { ids: [nila], unitId: cons._id, stage: "master", given: false })).toBe(1);
    expect((await fam().query(api.family.me, {})).worlds.find((w) => w.unitId === cons._id)!.open).toBe(false);

    // A level of the first topic checked at home, then unticked: his grade's map again, and the O/L book he started
    // follows as one more World (open, with his level), so nothing he did is hidden.
    await fam().mutation(api.family.check, { unitId: sq._id, n: 1, typed: [1, 2, 3, 4, 5].map((q) => ({ q, a: [String(q * 3)] })) });
    expect(await t.mutation(api.families.setOlMap, { studentIds: [nila], on: false })).toBe(1);
    me = await fam().query(api.family.me, {});
    expect(me.ol).toBe(false);
    expect(me.worlds.filter((w) => w.other).map((w) => [w.no, w.open, w.levels[0].s, w.levels[0].got])).toEqual([[1, true, "check", 10]]);
    expect(me.worlds.filter((w) => !w.other).every((w) => !w.book)).toBe(true);
    // Moved up to the O/L map again: his grade's book he is on would follow too, but Grade 11 has none (nothing extra).
    await t.mutation(api.families.setOlMap, { studentIds: [nila], on: true });
    expect((await fam().query(api.family.me, {})).worlds.filter((w) => w.other)).toEqual([]);
  });

  test("a level on the phone: its boxes, never its answers", async () => {
    await joinAs(hana, FAM);
    const lv = await fam().query(api.family.level, { unitId: u01, n: 1 });
    expect(lv.qs.map((q) => q.q)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lv.qs[8].parts[0].boxes).toEqual([{ k: "num" }, { k: "num" }]);
    expect(lv.qs[6].parts[0].boxes).toEqual([{ k: "expr", v: "n" }]);
    expect(lv.qs[9].parts[0].boxes).toBeNull(); // a name: the teacher marks it
    expect(JSON.stringify(lv)).not.toMatch(/"(ok|vals|want|t|words|cont)":/);
    await expect(fam().query(api.family.level, { unitId: u01, n: 2 })).rejects.toThrow(/in order/);
    await expect(fam().query(api.family.level, { unitId: u02, n: 1 })).rejects.toThrow(/locked/);
  });

  test("Check: marked at home (⌂), lost marks go to Evaluation at once, the teacher's questions wait for her", async () => {
    await joinAs(hana, FAM);
    const r = await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    expect(r.got).toBe(16);
    expect(r.max).toBe(20);
    expect(r.phoneMax).toBe(18);
    expect(r.teacher).toEqual([10]);
    expect(r.results.find((x) => x.q === 8)).toMatchObject({ ok: [[false]], got: 0 });
    expect(r.results.find((x) => x.q === 9)).toMatchObject({ ok: [[true, true]], got: 2 });
    expect(r.xp).toBe(16);
    expect(r.streak).toEqual({ days: 1, today: true });
    const m = (await hanaM())!;
    expect(m.lv["1"]).toMatchObject({ got: 16, by: "home" });
    expect(m.lv["1"].home).toBeDefined();
    expect(m.q["10"]).toBeUndefined(); // the corrector marks it
    expect(m.q["8"]).toMatchObject({ got: 0, max: 2, lost: true });
    expect(computeMaster(m, BOOK.data).pending).toEqual([8]); // Evaluation sees it now
    // Once: the level is marked; the next level is the one to play.
    await expect(fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 })).rejects.toThrow(/already marked/);
    const me = await fam().query(api.family.me, {});
    expect(me.worlds[0].levels.slice(0, 2).map((l) => l.s)).toEqual(["check", "play"]);
    // The teachers' history names it.
    const line = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).find((e) => e.kind === "level-home"));
    expect(line).toMatchObject({ name: "Hana K", unit: "G8-U01", value: "1 16/20" });
    // What he typed is kept (his idea: the wrong answers most students put), with which boxes were right.
    const typed = async () => await raw.run(async (ctx) => await ctx.db.query("familyAnswers").collect());
    const saved = await typed();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ studentId: hana, unitId: u01, n: 1 });
    expect(saved[0].qs.map((x) => x.q)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]); // Q10 is the teacher's: no boxes
    expect(saved[0].qs.find((x) => x.q === 8)).toEqual({ q: 8, a: ["99"], ok: [[false]] });
    expect(saved[0].qs.find((x) => x.q === 9)).toEqual({ q: 9, a: ["10", "9"], ok: [[true, true]] });
    // It goes when the student goes.
    await raw.run(async (ctx) => await wipeStudent(ctx, (await ctx.db.get(hana))!));
    expect(await typed()).toHaveLength(0);
  });

  test("Correction checks it: Checked once she marked what the phone left; changing marks also checks it", async () => {
    await joinAs(hana, FAM);
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    await expect(t.mutation(api.workbook.homeChecked, { studentId: hana, unitId: u01, level: 1, by: "correction" })).rejects.toThrow(/Mark Q10 first/);
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((q) => ({ q, got: q === 8 ? 0 : 2 }));
    await t.mutation(api.workbook.correct, { studentId: hana, unitId: u01, level: 1, items, by: "correction" });
    const m = (await hanaM())!;
    expect(m.lv["1"]).toMatchObject({ got: 18, by: "correction" });
    expect(m.lv["1"].home).toBeDefined();
    expect(m.lv["1"].hc).toBeDefined();
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0]).toMatchObject({ s: "done", got: 18 });
    expect((await fam().query(api.family.me, {})).xp).toBe(18);
  });

  test("Checked: a level the phone marked entirely", async () => {
    // Bilal's key: a level with no teacher question (Level 2 = Q11–20 has Q20, a name: use Level 1 of a full key).
    const key = fakeKey().map((k) => (k.q === 10 ? { q: 10, a: "30" } : k));
    await save(u01, key);
    await joinAs(hana, FAM);
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: [...LEVEL1, { q: 10, a: ["30"] }] });
    expect(await t.mutation(api.workbook.homeChecked, { studentId: hana, unitId: u01, level: 1, by: "correction" })).toBe(true);
    expect((await hanaM())!.lv["1"].hc).toBeDefined();
    expect((await fam().query(api.family.me, {})).worlds[0].levels[0].s).toBe("done");
  });

  test("this week's board: his grade, first name and initial, ranks; Monday starts again", async () => {
    await joinAs(hana, FAM);
    await joinAs(bilal, FAM2);
    await fam().mutation(api.family.check, { unitId: u01, n: 1, typed: LEVEL1 });
    const b = await fam(FAM2).query(api.family.board, {});
    expect(b.top).toEqual([{ name: "Hana K", xp: 16, rank: 1, me: false }]);
    expect(b.me).toEqual({ name: "Bilal M", xp: 0, rank: 2, me: true });
    expect(b.count).toBe(2);
    expect(b.since).toBe(slWeekStart(Date.now()));
    expect(new Date(b.since + 330 * 60_000).toISOString()).toBe("2026-10-26T00:00:00.000Z"); // Monday 00:00 in Sri Lanka
    // Next Monday: 0 XP, and the streak broke (no level on Saturday or Sunday).
    vi.setSystemTime(new Date("2026-11-02T08:00:00+05:30"));
    const me = await fam().query(api.family.me, {});
    expect(me.xp).toBe(0);
    expect(me.streak).toEqual({ days: 0, today: false });
  });

  test("his week, his best run of days, XP ever and his trophies", async () => {
    await joinAs(hana, FAM);
    const at = (iso: string) => new Date(iso).getTime();
    const lv = (iso: string, got: number) => ({ done: at(iso), fixed: at(iso), got, by: "correction" });
    const levels = {
      "1": lv("2026-10-26T17:00:00+05:30", 20), // Monday: every mark of Level 1 (20)
      "2": lv("2026-10-27T17:00:00+05:30", 10),
      "3": lv("2026-10-28T09:00:00+05:30", 5), // today, a Wednesday
      "4": lv("2026-10-01T17:00:00+05:30", 2), // an older run of four days
      "5": lv("2026-10-02T17:00:00+05:30", 2),
      "6": lv("2026-10-03T17:00:00+05:30", 2),
      "7": lv("2026-10-04T17:00:00+05:30", 2),
    };
    await raw.run(async (ctx) => {
      const p = await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", hana)).first();
      if (p) await ctx.db.patch(p._id, { m: { q: {}, lv: levels } });
      else await ctx.db.insert("progress", { studentId: hana, unitId: u01, stage: "master", marks: {}, m: { q: {}, lv: levels }, startedAt: 0, updatedAt: 0 });
    });
    const me = await fam().query(api.family.me, {});
    expect(me.week).toEqual([true, true, true, false, false, false, false]);
    expect(me.streak).toEqual({ days: 3, today: true });
    expect(me.best).toBe(4);
    expect(me.xp).toBe(35);
    expect(me.total).toBe(43);
    expect(me.index).toBe(1001);
    expect(me.dayXp).toEqual([20, 10, 5, 0, 0, 0, 0]);
    expect([me.levelsDone, me.levelsWeek]).toEqual([7, 3]);
    expect(me.trophies).toEqual(["first", "streak3", "perfect"]);
  });

  test("questions as printed for a student without his book: his open Stages only, never the answers", async () => {
    await joinAs(hana, FAM);
    await raw.run(async (ctx) => {
      for (const q of [1, 2, 3]) {
        await ctx.db.insert("questions", { unitId: u01, stage: "master", q, html: `<div class="pq"><b class="qn">${q}</b> A made-up question.</div>` });
      }
      await ctx.db.insert("bookCss", { unitId: u01, stage: "master", css: ".qn { font-weight: 700; }", updatedAt: 0 });
      const book = (await ctx.db.query("books").withIndex("by_unit_stage", (x) => x.eq("unitId", u01).eq("stage", "master")).first())!;
      await ctx.db.patch(book._id, { qCount: 3 });
    });
    expect((await fam().query(api.family.me, {})).worlds.filter((w) => w.book).map((w) => w.q)).toEqual([true, false]);
    const lv1 = await fam().query(api.family.questions, { unitId: u01, n: 1 });
    expect(lv1.css).toBe(".qn { font-weight: 700; }");
    expect(lv1.qs.map((x) => x.q)).toEqual([1, 2, 3]);
    expect(Object.keys(lv1.qs[0]).sort()).toEqual(["html", "q"]);
    expect((await fam().query(api.family.questions, { unitId: u01, n: 1, css: false })).css).toBeNull();
    expect((await fam().query(api.family.questions, { unitId: u01, n: 2 })).qs).toEqual([]); // not in the app
    await expect(fam().query(api.family.questions, { unitId: u02, n: 1 })).rejects.toThrow(/locked/);
    await expect(fam().query(api.family.questions, { unitId: u01, n: 99 })).rejects.toThrow(/not in this Stage/);
    await expect(raw.query(api.family.questions, { unitId: u01, n: 1 })).rejects.toThrow(FAMILY_SIGNED_OUT);
  });

  test("his classes: his grade's hours the owner sets, his usual days, this week, recent classes and one day's timeline", async () => {
    await joinAs(hana, FAM);
    // The first evening's one list of hours for every grade still counts for each grade until it gets its own.
    const tuesdays = [null, { from: 1020, to: 1200 }, null, null, null, null, null];
    await raw.run(async (ctx) => {
      await ctx.db.insert("meta", { key: "classHours", value: tuesdays });
    });
    expect((await t.query(api.families.classHours, {}))["8"]).toEqual(tuesdays);
    // The owner sets one grade's hours, Monday first; a family phone can't; a class must start before it ends; only
    // the school grades.
    const hours = [{ from: 930, to: 1170 }, null, { from: 930, to: 1170 }, null, null, { from: 480, to: 720 }, null];
    await expect(fam().mutation(api.families.setClassHours, { grade: 8, hours })).rejects.toThrow(SIGNED_OUT);
    await expect(
      t.mutation(api.families.setClassHours, { grade: 8, hours: [{ from: 600, to: 500 }, null, null, null, null, null, null] }),
    ).rejects.toThrow(/before/);
    await expect(t.mutation(api.families.setClassHours, { grade: 5, hours })).rejects.toThrow(/per grade/);
    await t.mutation(api.families.setClassHours, { grade: 8, hours });
    const all = await t.query(api.families.classHours, {});
    expect(all["8"]).toEqual(hours);
    expect(all["11"]).toEqual(tuesdays); // the other grades keep theirs
    expect(Object.keys(all).sort((a, b) => Number(a) - Number(b))).toEqual(["6", "7", "8", "9", "10", "11"]);
    // Her class days: Mondays and Wednesdays for two weeks; today (Wednesday 28 Oct) she is in class since 2 PM.
    const at = (iso: string) => new Date(iso).getTime();
    await raw.run(async (ctx) => {
      const days: [string, string, string | null][] = [
        ["2026-10-19", "15:35", "18:10"],
        ["2026-10-21", "15:40", "18:00"],
        ["2026-10-26", "15:30", "18:05"],
        ["2026-10-28", "14:00", null],
      ];
      for (const [day, i, o] of days) {
        await ctx.db.insert("attendance", { studentId: hana, day, inAt: at(`${day}T${i}:00+05:30`), ...(o ? { outAt: at(`${day}T${o}:00+05:30`) } : {}) });
      }
      await ctx.db.patch(hana, { present: true });
      // In class today: Level 1 handed in and marked (18 / 20), Q8 explained by Nila in Evaluation. Yesterday at home:
      // Level 2 checked on the phone.
      const lv = {
        "1": { done: at("2026-10-28T14:30:00+05:30"), fixed: at("2026-10-28T14:50:00+05:30"), got: 18, by: "correction" },
        "2": { done: at("2026-10-27T19:00:00+05:30"), fixed: at("2026-10-27T19:00:00+05:30"), home: at("2026-10-27T19:00:00+05:30"), got: 16, by: "home" },
      };
      const q = { "8": { got: 0, max: 2, lost: true, t: at("2026-10-28T14:50:00+05:30"), x: at("2026-10-28T14:56:00+05:30") } };
      const p = await ctx.db.query("progress").withIndex("by_student", (x) => x.eq("studentId", hana)).first();
      if (p) await ctx.db.patch(p._id, { m: { q, lv } });
      else await ctx.db.insert("progress", { studentId: hana, unitId: u01, stage: "master", marks: {}, m: { q, lv }, startedAt: 0, updatedAt: 0 });
      await ctx.db.insert("calls", {
        studentId: hana,
        room: "evaluation",
        kind: "evaluation",
        status: "done",
        group: "test",
        unitId: u01,
        stage: "master",
        createdAt: at("2026-10-28T14:51:00+05:30"),
        sentAt: at("2026-10-28T14:51:00+05:30"),
        arrivedAt: at("2026-10-28T14:52:00+05:30"),
        endedAt: at("2026-10-28T14:58:00+05:30"),
        teacher: "Nila",
      });
    });
    const c = await fam().query(api.family.classes, {});
    expect(c.hours).toEqual(hours);
    expect(c.usual).toEqual([0, 2]); // Monday and Wednesday
    expect(c.inClass).toBe(at("2026-10-28T14:00:00+05:30"));
    expect(c.week.map((d) => [d.day, d.inAt !== null, d.outAt !== null])).toEqual([
      ["2026-10-26", true, true],
      ["2026-10-27", false, false],
      ["2026-10-28", true, false],
      ["2026-10-29", false, false],
      ["2026-10-30", false, false],
      ["2026-10-31", false, false],
      ["2026-11-01", false, false],
    ]);
    expect(c.recent.map((d) => [d.day, d.levels, d.teachers])).toEqual([
      ["2026-10-28", 1, ["Nila"]],
      ["2026-10-26", 0, []],
      ["2026-10-21", 0, []],
      ["2026-10-19", 0, []],
    ]);
    // Today's timeline: in at 2 PM, Level 1 marked 18 / 20, with Nila in Evaluation (Q8 explained).
    const d = await fam().query(api.family.day, { day: "2026-10-28" });
    expect(d.items.map((x) => x.k)).toEqual(["in", "level", "room"]);
    expect(d.items[1]).toMatchObject({ k: "level", no: 1, n: 1, how: "marked", got: 18, max: 20 });
    expect(d.items[2]).toMatchObject({ k: "room", room: "evaluation", teacher: "Nila", no: 1, qs: [8] });
    // Yesterday at home: Level 2 checked on the phone. Too old or not a date: refused.
    expect((await fam().query(api.family.day, { day: "2026-10-27" })).items).toMatchObject([{ k: "level", n: 2, how: "home", got: 16 }]);
    await expect(fam().query(api.family.day, { day: "2026-07-01" })).rejects.toThrow(/90 days/);
    await expect(fam().query(api.family.day, { day: "yesterday" })).rejects.toThrow(/date/);
  });

  test("feedback: with his name or without it, a few a day, read by the owner and people with Feedback", async () => {
    await joinAs(hana, FAM);
    expect(await fam().mutation(api.family.feedback, { mood: 5, topic: "class", text: "  Theory was great today  ", named: true })).toBe(true);
    vi.setSystemTime(new Date(Date.now() + 60_000));
    await fam().mutation(api.family.feedback, { mood: 2, topic: "teachers", text: "too fast", named: false });
    await expect(fam().mutation(api.family.feedback, { named: true })).rejects.toThrow(/face/);
    await expect(fam().mutation(api.family.feedback, { mood: 7, named: true })).rejects.toThrow(/faces/);
    await expect(fam().mutation(api.family.feedback, { text: "x".repeat(601), named: true })).rejects.toThrow(/600/);
    // Without his name: only his grade; nothing ties it to him.
    const rows = await raw.run(async (ctx) => await ctx.db.query("familyFeedback").collect());
    expect(rows).toHaveLength(2);
    const anon = rows.find((r) => r.mood === 2)!;
    expect([anon.studentId, anon.name, anon.grade]).toEqual([undefined, undefined, 8]);
    // The owner reads them, newest first.
    const list = await t.query(api.families.feedback, {});
    expect(list.items.map((i) => [i.name, i.grade, i.mood, i.topic, i.text])).toEqual([
      [null, 8, 2, "teachers", "too fast"],
      ["Hana K", 8, 5, "class", "Theory was great today"],
    ]);
    // A teacher reads them only with Feedback (Settings → People); each person has their own "new" count.
    const NILA = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx";
    const SARA = "sara-phone-token-0123456789abcdefghijklmnopqrstuvwx";
    await addPerson(raw, { name: "Nila", token: NILA, tabs: ["theory"] });
    await addPerson(raw, { name: "Sara", token: SARA, tabs: ["correction"], can: ["feedback"] });
    await expect(asPhone(raw, NILA).query(api.families.feedback, {})).rejects.toThrow(/Feedback/);
    await expect(asPhone(raw, NILA).query(api.families.feedbackNew, {})).rejects.toThrow(/Feedback/);
    const sara = asPhone(raw, SARA);
    expect((await sara.query(api.families.feedback, {})).items).toHaveLength(2);
    expect(await sara.query(api.families.feedbackNew, {})).toBe(2);
    await sara.mutation(api.families.feedbackSeen, { at: Date.now() });
    expect(await sara.query(api.families.feedbackNew, {})).toBe(0);
    expect((await sara.query(api.families.feedback, {})).seenAt).toBe(Date.now());
    expect(await t.query(api.families.feedbackNew, {})).toBe(2);
    // A family phone can't read them.
    await expect(fam().query(api.families.feedback, {})).rejects.toThrow(SIGNED_OUT);
    // Five a day from one phone, then tomorrow again.
    vi.setSystemTime(new Date(Date.now() + 60_000));
    for (let i = 0; i < 3; i++) await fam().mutation(api.family.feedback, { mood: 4, named: true });
    await expect(fam().mutation(api.family.feedback, { mood: 4, named: true })).rejects.toThrow(/tomorrow/);
    vi.setSystemTime(new Date("2026-10-29T09:00:00+05:30"));
    expect(await fam().mutation(api.family.feedback, { mood: 4, named: true })).toBe(true);
    expect(await sara.query(api.families.feedbackNew, {})).toBe(4);
  });
});

describe("index numbers and codes (sign in without a link)", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  const indexOf = async (id: Id<"students">) => await raw.run(async (ctx) => (await ctx.db.get(id))!.index ?? null);
  const signIn = (index: number, code: string, token = FAM) => raw.mutation(api.family.signIn, { index, code, token, label: "Android" });
  const fam = (tok: string) => asPhone(raw, tok);

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-01T18:00:00+05:30"));
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
  });
  afterEach(() => vi.useRealTimers());

  test("every student gets the next index number for good; the data step numbers those from before, oldest first", async () => {
    const a = await t.mutation(api.students.add, { name: "Asha K", grade: 8, term: 1 });
    const b = await t.mutation(api.students.add, { name: "Bala S", grade: 8, term: 1 });
    expect([await indexOf(a), await indexOf(b)]).toEqual([1001, 1002]);
    // Removed and brought back: the same number; a new student never gets a number used before.
    await t.mutation(api.students.setArchived, { id: a, archived: true });
    const c = await t.mutation(api.students.add, { name: "Chandra P", grade: 8, term: 1 });
    expect(await indexOf(c)).toBe(1003);
    await t.mutation(api.students.setArchived, { id: a, archived: false });
    expect(await indexOf(a)).toBe(1001);
    // Students from before index numbers (and a demo one, which gets none): the data step numbers them.
    const [old1, old2, demo] = await raw.run(async (ctx) => {
      const row = { archived: false, present: false, grade: 8, term: 1, stage: "master" as const, idleMs: 0 };
      const x = await ctx.db.insert("students", { ...row, name: "Old One" });
      const y = await ctx.db.insert("students", { ...row, name: "Old Two" });
      const z = await ctx.db.insert("students", { ...row, name: "Demo D", demo: true });
      const meta = (await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "data")).first())!;
      await ctx.db.patch(meta._id, { value: 1 });
      return [x, y, z];
    });
    await t.mutation(api.setup.ensure, {});
    expect([await indexOf(old1), await indexOf(old2), await indexOf(demo)]).toEqual([1004, 1005, null]);
  });

  test("the code: the owner or a Students teacher sets it; never an easy one; never on the class board", async () => {
    const hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1 });
    await addPerson(raw, { name: "Corrector", token: "corrector-token-0123456789abcdefghijklmnopqrstu", tabs: ["correction"] });
    await expect(
      asPhone(raw, "corrector-token-0123456789abcdefghijklmnopqrstu").mutation(api.families.setCode, { studentId: hana, code: "4719" }),
    ).rejects.toThrow(/Students/);
    for (const bad of ["1111", "1234", "9876", "12a4", "123"]) {
      await expect(t.mutation(api.families.setCode, { studentId: hana, code: bad })).rejects.toThrow(/4 digits/);
    }
    expect(await t.mutation(api.families.setCode, { studentId: hana, code: "4719" })).toBe(true);
    expect(await t.query(api.families.phones, { studentId: hana })).toMatchObject({ index: 1001, code: "4719", locked: false });
    // The class board goes to every teacher's phone: no code in it.
    expect(JSON.stringify(await t.query(api.state.get, {}))).not.toMatch(/"code":"\d{4}"/);
    // The history says a code was made, never the code.
    const line = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).find((e) => e.kind === "family-code"));
    expect(line).toMatchObject({ name: "Hana K", value: "first" });
    expect(JSON.stringify(line)).not.toContain("4719");
  });

  test("sign in with index and code; a wrong one or an unknown index says the same; 5 wrong = 15 minutes", async () => {
    const hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1 });
    expect(await signIn(1001, "4719")).toEqual({ ok: false, why: "wrong", minutes: 0 }); // no code yet
    await t.mutation(api.families.setCode, { studentId: hana, code: "4719" });
    expect(await signIn(1001, "4719")).toEqual({ ok: true, name: "Hana K" });
    expect((await fam(FAM).query(api.family.me, {})).name).toBe("Hana K");
    expect(await signIn(9999, "4719", FAM2)).toEqual({ ok: false, why: "wrong", minutes: 0 });
    // A classmate guessing: 4 wrong, then the 5th locks it (even the right code waits).
    for (let i = 0; i < 4; i++) expect(await signIn(1001, "0000", FAM2)).toEqual({ ok: false, why: "wrong", minutes: 0 });
    expect(await signIn(1001, "0000", FAM2)).toEqual({ ok: false, why: "locked", minutes: 15 });
    expect(await signIn(1001, "4719", FAM2)).toMatchObject({ ok: false, why: "locked" });
    expect((await t.query(api.families.phones, { studentId: hana })).locked).toBe(true);
    vi.setSystemTime(new Date(Date.now() + 16 * 60_000));
    expect(await signIn(1001, "4719", FAM2)).toEqual({ ok: true, name: "Hana K" });
    // New code: the old one stops; phones already in stay in.
    await t.mutation(api.families.setCode, { studentId: hana, code: "5820" });
    expect(await signIn(1001, "4719", "family-phone-token-3-0123456789abcdefghijklmnopqrs")).toMatchObject({ ok: false, why: "wrong" });
    expect((await fam(FAM).query(api.family.me, {})).name).toBe("Hana K");
    // Removed: no sign in.
    await t.mutation(api.students.setArchived, { id: hana, archived: true });
    expect(await signIn(1001, "5820", "family-phone-token-4-0123456789abcdefghijklmnopqrs")).toMatchObject({ ok: false, why: "wrong" });
  });
});
