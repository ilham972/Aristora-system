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
import { markPart, markQuestion, parseExpr, parseNum, phoneKey, phoneShare, wantsOf, type KeyPart } from "../convex/lib/phone";
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
    expect(markQuestion(k.get(53)!, ["7"])).toEqual({ ok: [[true], null], got: null, phoneGot: 1 });
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

  test("his Worlds: his unit is open, the next opens when it is done, given books and Open every World open them", async () => {
    await joinAs(hana, FAM);
    const worlds = async () => (await fam().query(api.family.me, {})).worlds.map((w) => [w.no, w.open, w.phone]);
    expect(await worlds()).toEqual([
      [1, true, true],
      [2, false, false],
    ]);
    const me = await fam().query(api.family.me, {});
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

  test("a level on the phone: its boxes, never its answers", async () => {
    await joinAs(hana, FAM);
    const lv = await fam().query(api.family.level, { unitId: u01, n: 1 });
    expect(lv.qs.map((q) => q.q)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(lv.qs[8].parts[0].boxes).toEqual([{ k: "num" }, { k: "num" }]);
    expect(lv.qs[6].parts[0].boxes).toEqual([{ k: "expr", v: "n" }]);
    expect(lv.qs[9].parts[0].boxes).toBeNull(); // a name: the teacher marks it
    expect(JSON.stringify(lv)).not.toMatch(/"(ok|vals|want|t)":/);
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
});
