// The family app's profile (Me, 4 Nov 2026): his photo (his phone at once, classmates only after the teachers' OK), a
// new name (only after their OK), his birthday (once; a teacher clears it), his map of 12 weeks (home and class), his
// months and his report. Made-up students and fake pictures (a few bytes that start like a JPEG or a WebP file).

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { wipeStudent } from "../convex/lib/backend";
import { isBirthday, slDay, slDayNo } from "../convex/lib/day";
import type { World } from "../convex/lib/family";
import type { MQ, MState } from "../convex/lib/master";
import { askedName, cleanBday, heatDays, monthLines, PHOTO_MAX_BYTES, photoProblem, questionCounts, stageLines } from "../convex/lib/profile";
import schema from "../convex/schema";
import { readWorkbookHtml } from "../src/workbookFile";
import U01 from "./fixtures/workbook-g8-u01.html?raw";
import { addPerson, asOwner, asPhone } from "./helpers";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0];
const H = 3_600_000;
const D = 24 * H;

/** A few bytes that start like a JPEG or a WebP file (the server checks the start and the size, never draws it). */
const b64 = (bytes: number[]) => {
  let out = "";
  for (const x of bytes) out += String.fromCharCode(x);
  return btoa(out);
};
const codes = (t: string) => [...t].map((c) => c.charCodeAt(0));
const jpeg = (n = 600) => b64([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(n).fill(7)]);
const webp = (n = 600) => b64([...codes("RIFF"), (4 + n) & 255, ((4 + n) >> 8) & 255, 0, 0, ...codes("WEBP"), ...new Array<number>(n).fill(9)]);

/** A progress row's workbook state, written straight in (the levels and questions the class marked). */
const progressRow = (m: MState) => ({ _id: "p" as Id<"progress">, _creationTime: 0, studentId: "s" as Id<"students">, unitId: "u" as Id<"units">, stage: "master" as const, marks: {}, m, startedAt: 0, updatedAt: 0 }) as Doc<"progress">;

describe("the profile's rules", () => {
  test("a photo: a small JPEG or WebP only, its first bytes as its type says", () => {
    expect(photoProblem(jpeg(), "image/jpeg")).toBeNull();
    expect(photoProblem(webp(), "image/webp")).toBeNull();
    expect(photoProblem(jpeg(), "image/webp")).not.toBeNull();
    expect(photoProblem(webp(), "image/jpeg")).not.toBeNull();
    expect(photoProblem(jpeg(), "image/png")).not.toBeNull();
    expect(photoProblem(jpeg(), "image/svg+xml")).not.toBeNull();
    expect(photoProblem("not a photo!", "image/jpeg")).not.toBeNull();
    expect(photoProblem(jpeg(PHOTO_MAX_BYTES), "image/jpeg")).toMatch(/too big/);
    expect(photoProblem(jpeg(PHOTO_MAX_BYTES - 10), "image/jpeg")).toBeNull();
    expect(photoProblem(jpeg(20), "image/jpeg")).not.toBeNull();
    // A page or a script dressed as a photo.
    expect(photoProblem(btoa(`<svg onload="alert(1)">${" ".repeat(600)}</svg>`), "image/jpeg")).not.toBeNull();
  });

  test("a new name: letters of any script, tidy spaces, 30 letters and 3 words at most", () => {
    expect(askedName("  Bilal   R ")).toEqual({ name: "Bilal R" });
    expect(askedName("Ahamed Ilham R.")).toEqual({ name: "Ahamed Ilham R." });
    expect(askedName("சுரேஷ் K")).toEqual({ name: "சுரேஷ் K" });
    expect(askedName("Mary-Ann O'Neil")).toEqual({ name: "Mary-Ann O'Neil" });
    for (const bad of ["", "   ", "KING 007", "B", "Bilal 😎", "A B C D", "x".repeat(31), "<b>Bilal</b>", "-Bilal"]) {
      expect("why" in askedName(bad)).toBe(true);
    }
  });

  test("a birthday: day and month; born on 29 Feb = 28 Feb in a year without it", () => {
    expect(cleanBday("11-04")).toBe("11-04");
    expect(cleanBday("02-29")).toBe("02-29");
    for (const bad of ["13-01", "00-10", "04-31", "02-30", "1-4", "2026-11-04", "11/04"]) expect(cleanBday(bad)).toBeNull();
    const at = (s: string) => Date.parse(`${s}T10:00:00+05:30`);
    expect(isBirthday("11-04", at("2026-11-04"))).toBe(true);
    expect(isBirthday("11-04", at("2026-11-05"))).toBe(false);
    // Sri Lanka's day: 11:30 PM on the 3rd in London is already the 4th here.
    expect(isBirthday("11-04", Date.parse("2026-11-03T23:30:00Z"))).toBe(true);
    expect(isBirthday("02-29", at("2027-02-28"))).toBe(true);
    expect(isBirthday("02-29", at("2028-02-28"))).toBe(false);
    expect(isBirthday("02-29", at("2028-02-29"))).toBe(true);
    expect(isBirthday(null, at("2026-11-04"))).toBe(false);
  });

  test("the map: Levels at home (⌂) and in class on the day he finished them, their XP once marked, his class days", () => {
    const tue = Date.parse("2026-11-03T16:00:00+05:30");
    const rows = [
      progressRow({
        q: {},
        lv: {
          "1": { pre: tue - 9 * D }, // done before the app: not on the map
          "2": { done: tue - 2 * D, fixed: tue - D, got: 15 }, // handed in on Sunday, marked on Monday: Sunday's
          "3": { done: tue, fixed: tue, by: "home", got: 18, home: tue }, // at home
          "4": { done: tue + H }, // handed in, not marked yet: no XP
        },
      }),
    ];
    const visits = [{ inAt: tue - 2 * D }, { inAt: tue - 40 * D }];
    const days = heatDays(rows, visits, slDayNo(tue) - 30);
    expect(days).toEqual([
      { d: slDayNo(tue) - 2, home: 0, cls: 1, xp: 15, in: true },
      { d: slDayNo(tue), home: 1, cls: 1, xp: 18, in: false },
    ]);
  });

  test("questions in a child's words: right, learned with a teacher (explained or taught), still to learn", () => {
    const q: Record<string, MQ> = {
      "1": { got: 2, max: 2, lost: false, t: 100 },
      "2": { got: 0, max: 2, lost: true, t: 100 }, // waits for Evaluation
      "3": { got: 1, max: 2, lost: true, t: 100, x: 200 }, // explained
      "4": { got: 0, max: 3, lost: true, t: 100, th: 150 }, // sent to Theory
      "5": { got: 0, max: 3, lost: true, t: 100, th: 150, tt: 300 }, // taught
      "6": { got: 0, max: 1, lost: true, t: 900, dk: true }, // "?" later
    };
    expect(questionCounts(q)).toEqual({ right: 1, learned: 2, toLearn: 3 });
    expect(questionCounts(q, 0, 500)).toEqual({ right: 1, learned: 2, toLearn: 2 });
  });

  test("his months: class days and hours (8 hours at most a visit), Levels and XP; back across the new year", () => {
    const now = Date.parse("2027-01-10T17:00:00+05:30");
    const at = (s: string) => Date.parse(`${s}+05:30`);
    const visits = [
      { day: "2027-01-05", inAt: at("2027-01-05T15:00:00"), outAt: at("2027-01-05T17:30:00") },
      { day: "2027-01-05", inAt: at("2027-01-05T18:00:00"), outAt: at("2027-01-05T18:30:00") },
      { day: "2027-01-10", inAt: at("2027-01-10T16:00:00") }, // still in: until now
      { day: "2026-12-20", inAt: at("2026-12-20T08:00:00"), outAt: at("2026-12-20T20:00:00") }, // 12 h: counts 8
    ];
    const rows = [
      progressRow({
        q: { "1": { got: 2, max: 2, lost: false, t: at("2026-12-20T10:00:00") } },
        lv: { "1": { done: at("2026-12-20T10:00:00"), fixed: at("2026-12-20T11:00:00"), got: 20 }, "2": { done: at("2027-01-06T19:00:00"), fixed: at("2027-01-06T19:00:00"), got: 12, home: at("2027-01-06T19:00:00") } },
      }),
    ];
    const [jan, dec, nov] = monthLines(rows, visits, now);
    expect(jan).toMatchObject({ m: "2027-01", days: 2, min: 150 + 30 + 60, levels: 1, home: 1, xp: 12 });
    expect(dec).toMatchObject({ m: "2026-12", days: 1, min: 480, levels: 1, home: 0, xp: 20, right: 1 });
    expect(nov).toMatchObject({ m: "2026-11", days: 0, min: 0, levels: 0 });
  });

  test("his report: Stages given or started, in map order; the marks of marked Levels; his first and last day", () => {
    const lvl = (n: number, s: World["levels"][number]["s"], got?: number) => ({ n, max: 20, s, ...(got !== undefined ? { got } : {}) });
    const w = (no: number, levels: World["levels"], extra: Partial<World> = {}): World => ({
      unitId: `u${no}` as Id<"units">,
      no,
      ta: `அலகு ${no}`,
      en: `Unit ${no}`,
      term: 1,
      book: true,
      open: true,
      phone: true,
      now: false,
      q: false,
      levels,
      allDone: levels.every((l) => l.s !== "play" && l.s !== "later"),
      ...extra,
    });
    const worlds = [
      w(1, [lvl(1, "pre"), lvl(2, "done", 18), lvl(3, "check", 20)]),
      w(2, [lvl(1, "play"), lvl(2, "later")], { now: true }),
      w(3, [lvl(1, "play")], { given: 500 }),
      w(4, [lvl(1, "play")]), // nothing yet: not in the report
      { ...w(5, []), book: false },
    ];
    const rows = [{ ...progressRow({ q: { "11": { got: 1, max: 2, lost: true, t: 5, x: 6 } }, lv: { "1": { pre: 40 }, "2": { done: 50, fixed: 60, got: 18 }, "3": { done: 70, fixed: 70, got: 20, home: 70 } } }), unitId: "u1" as Id<"units"> }];
    const r = stageLines(worlds, rows);
    expect(r.map((x) => x.no)).toEqual([1, 2, 3]);
    expect(r[0]).toMatchObject({ levels: 3, done: 3, got: 38, max: 40, home: 1, cls: 1, start: 50, end: 70, allDone: true, right: 0, learned: 1, toLearn: 0 });
    expect(r[1]).toMatchObject({ now: true, done: 0, got: 0, max: 0, start: null, end: null, allDone: false });
    expect(r[2]).toMatchObject({ given: 500, done: 0 });
  });
});

const FAM_H = "family-phone-hana-0123456789abcdefghijklmnopqrstuvwxyz";
const FAM_B = "family-phone-bilal-0123456789abcdefghijklmnopqrstuvwxy";
const FAM_R = "family-phone-ravi-0123456789abcdefghijklmnopqrstuvwxyz";
const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));

describe("the profile on the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u01: Id<"units">;
  let hana: Id<"students">;
  let bilal: Id<"students">;
  let ravi: Id<"students">;
  const joinAs = async (studentId: Id<"students">, tok: string) => {
    const code = `code-${tok.slice(0, 24)}`;
    await t.mutation(api.families.makeLink, { studentId, codeHash: secretHash("family-link", code) });
    await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
  };
  const H_ = () => asPhone(raw, FAM_H);
  const B_ = () => asPhone(raw, FAM_B);
  const R_ = () => asPhone(raw, FAM_R);
  const student = (id: Id<"students">) => raw.run(async (ctx) => (await ctx.db.get(id))!);
  const photoRows = () => raw.run(async (ctx) => await ctx.db.query("profilePhotos").collect());
  const history = (kind: string) => raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === kind).map((e) => e.value));

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T15:00:00+05:30")); // a Wednesday
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
    });
    hana = await t.mutation(api.students.add, { name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
    bilal = await t.mutation(api.students.add, { name: "Bilal M", grade: 8, term: 1, stage: "master", unitId: u01 });
    ravi = await t.mutation(api.students.add, { name: "Ravi S", grade: 9, term: 1, stage: "master" });
    await joinAs(hana, FAM_H);
    await joinAs(bilal, FAM_B);
    await joinAs(ravi, FAM_R);
  });
  afterEach(() => vi.useRealTimers());

  test("a photo: his phone shows it at once; his classmates only after the OK; No tells him once", async () => {
    const { key } = await H_().mutation(api.family.setPhoto, { data: jpeg(), type: "image/jpeg" });
    let me = await H_().query(api.family.me, {});
    expect(me.photo).toEqual({ key, wait: true });
    expect(await H_().query(api.family.photos, { keys: [key] })).toEqual({ [key]: `data:image/jpeg;base64,${jpeg()}` });
    // Waiting: not in the race, and a classmate who guesses the key gets nothing.
    expect((await B_().query(api.family.board, {})).top.concat((await B_().query(api.family.board, {})).me!).every((r) => !r.pic)).toBe(true);
    expect(await B_().query(api.family.photos, { keys: [key] })).toEqual({});
    // The teachers: one ask on the gear, the picture in the list.
    expect(await t.query(api.families.askCount, {})).toBe(1);
    const [ask] = await t.query(api.families.asks, {});
    expect(ask).toMatchObject({ studentId: hana, name: "Hana K", grade: 8, kind: "photo", want: null, had: false });
    expect(ask.pic).toBe(`data:image/jpeg;base64,${jpeg()}`);
    // OK: the race shows it to his grade; another grade never gets it.
    await t.mutation(api.families.answer, { id: ask.id, yes: true });
    expect(await t.query(api.families.askCount, {})).toBe(0);
    me = await H_().query(api.family.me, {});
    expect(me.photo).toEqual({ key, wait: false });
    const board = await B_().query(api.family.board, {});
    expect([...board.top, board.me!].find((r) => r.name === "Hana K")?.pic ?? null).toBe(null); // no XP this week: not in the top
    expect(await B_().query(api.family.photos, { keys: [key] })).toEqual({ [key]: `data:image/jpeg;base64,${jpeg()}` });
    expect(await R_().query(api.family.photos, { keys: [key] })).toEqual({});
    // A second photo waits; the first stays in the race until the OK; No = gone, told once.
    const second = (await H_().mutation(api.family.setPhoto, { data: webp(), type: "image/webp" })).key;
    expect((await H_().query(api.family.me, {})).photo).toEqual({ key: second, wait: true });
    expect(await B_().query(api.family.photos, { keys: [key, second] })).toEqual({ [key]: `data:image/jpeg;base64,${jpeg()}` });
    const [ask2] = await t.query(api.families.asks, {});
    expect(ask2).toMatchObject({ kind: "photo", had: true });
    await t.mutation(api.families.answer, { id: ask2.id, yes: false });
    me = await H_().query(api.family.me, {});
    expect(me).toMatchObject({ photo: { key, wait: false }, photoNo: true });
    expect((await photoRows()).map((p) => p._id)).toEqual([key]);
    await H_().mutation(api.family.forget, { kind: "photo" });
    expect((await H_().query(api.family.me, {})).photoNo).toBe(false);
    expect(await history("family-photo")).toEqual(["sent", "ok", "sent", "no"]);
  });

  test("a photo: a new one replaces the one waiting; six a day; in the race unless his family turns it off; Remove", async () => {
    const a = (await H_().mutation(api.family.setPhoto, { data: jpeg(), type: "image/jpeg" })).key;
    const b = (await H_().mutation(api.family.setPhoto, { data: jpeg(700), type: "image/jpeg" })).key;
    expect((await photoRows()).map((p) => p._id)).toEqual([b]);
    expect(await t.query(api.families.askCount, {})).toBe(1);
    expect(a).not.toBe(b);
    for (let i = 0; i < 4; i++) await H_().mutation(api.family.setPhoto, { data: jpeg(800 + i), type: "image/jpeg" });
    await expect(H_().mutation(api.family.setPhoto, { data: jpeg(), type: "image/jpeg" })).rejects.toThrow(/enough photos for today/);
    await expect(H_().mutation(api.family.setPhoto, { data: jpeg(PHOTO_MAX_BYTES), type: "image/jpeg" })).rejects.toThrow(/too big/);
    vi.setSystemTime(new Date("2026-11-05T15:00:00+05:30"));
    const c = (await H_().mutation(api.family.setPhoto, { data: jpeg(), type: "image/jpeg" })).key;
    const [ask] = await t.query(api.families.asks, {});
    await t.mutation(api.families.answer, { id: ask.id, yes: true });
    // In the race: Hana with XP this week, her photo on her row.
    await raw.run(async (ctx) => {
      const p = await ctx.db.query("progress").withIndex("by_student_unit_stage", (q) => q.eq("studentId", hana).eq("unitId", u01).eq("stage", "master")).first();
      const m = { q: {}, lv: { "1": { done: Date.now(), fixed: Date.now(), got: 12 } } };
      if (p) await ctx.db.patch(p._id, { m });
      else await ctx.db.insert("progress", { studentId: hana, unitId: u01, stage: "master", marks: {}, m, startedAt: Date.now(), updatedAt: Date.now() });
    });
    expect((await B_().query(api.family.board, {})).top.find((r) => r.name === "Hana K")?.pic).toBe(c);
    // His family turns it off for the race: his own phone still shows it.
    await H_().mutation(api.family.setRace, { show: false });
    expect((await B_().query(api.family.board, {})).top.find((r) => r.name === "Hana K")?.pic).toBeUndefined();
    expect(await B_().query(api.family.photos, { keys: [c] })).toEqual({});
    expect(await H_().query(api.family.photos, { keys: [c] })).toHaveProperty(c);
    expect((await H_().query(api.family.me, {})).photoHide).toBe(true);
    await H_().mutation(api.family.setRace, { show: true });
    // Remove: the letter again, nothing kept.
    await H_().mutation(api.family.dropPhoto, {});
    expect((await H_().query(api.family.me, {})).photo).toBeNull();
    expect(await photoRows()).toEqual([]);
    expect((await student(hana)).photo).toBeUndefined();
  });

  test("a new name: only after the OK, as Rename does; never another student's; No tells him once", async () => {
    await expect(H_().mutation(api.family.askName, { name: "Hana K" })).rejects.toThrow(/your name now/);
    await expect(H_().mutation(api.family.askName, { name: "bilal m" })).rejects.toThrow(/Another student/);
    await expect(H_().mutation(api.family.askName, { name: "KING 007" })).rejects.toThrow(/Only letters/);
    await H_().mutation(api.family.askName, { name: "Hana  Fathima K" });
    expect((await H_().query(api.family.me, {})).nameAsk).toEqual({ name: "Hana Fathima K", no: false });
    await expect(H_().mutation(api.family.askName, { name: "Hana F" })).rejects.toThrow(/Wait a moment/);
    // Nothing changes before the OK.
    expect((await student(hana)).name).toBe("Hana K");
    const [ask] = await t.query(api.families.asks, {});
    expect(ask).toMatchObject({ kind: "name", name: "Hana K", want: "Hana Fathima K", pic: null });
    await t.mutation(api.families.answer, { id: ask.id, yes: true });
    expect((await student(hana)).name).toBe("Hana Fathima K");
    expect((await H_().query(api.family.me, {})).name).toBe("Hana Fathima K");
    expect((await H_().query(api.family.me, {})).nameAsk).toBeNull();
    expect(await history("student-rename")).toEqual(["Hana K"]);
    // No: told once, then gone.
    vi.setSystemTime(new Date("2026-11-04T15:05:00+05:30"));
    await H_().mutation(api.family.askName, { name: "Queen H" });
    const [ask2] = await t.query(api.families.asks, {});
    await t.mutation(api.families.answer, { id: ask2.id, yes: false });
    expect((await student(hana)).name).toBe("Hana Fathima K");
    expect((await H_().query(api.family.me, {})).nameAsk).toEqual({ name: "Queen H", no: true });
    expect(await t.query(api.families.askCount, {})).toBe(0);
    await expect(t.mutation(api.families.answer, { id: ask2.id, yes: true })).rejects.toThrow(/already answered/);
    await H_().mutation(api.family.forget, { kind: "name" });
    expect((await H_().query(api.family.me, {})).nameAsk).toBeNull();
    // Taken meanwhile: the OK says so.
    vi.setSystemTime(new Date("2026-11-04T15:10:00+05:30"));
    await H_().mutation(api.family.askName, { name: "Sara K" });
    await t.mutation(api.students.rename, { id: bilal, name: "Sara K" });
    const [ask3] = await t.query(api.families.asks, {});
    await expect(t.mutation(api.families.answer, { id: ask3.id, yes: true })).rejects.toThrow(/already on the list/);
  });

  test("his birthday: once on his phone (a teacher clears it); 🎂 in the race on the day", async () => {
    await expect(H_().mutation(api.family.setBday, { bday: "02-30" })).rejects.toThrow(/day and the month/);
    await H_().mutation(api.family.setBday, { bday: "11-04" });
    expect((await H_().query(api.family.me, {})).bday).toBe("11-04");
    await expect(H_().mutation(api.family.setBday, { bday: "11-05" })).rejects.toThrow(/ask your teacher/);
    const board = await B_().query(api.family.board, {});
    // Nobody has XP this week: only his own row comes; Hana's 🎂 shows on hers.
    expect((await H_().query(api.family.board, {})).me).toMatchObject({ name: "Hana K", bday: true });
    expect(board.me).toMatchObject({ name: "Bilal M" });
    expect(board.me!.bday).toBeUndefined();
    vi.setSystemTime(new Date("2026-11-05T15:00:00+05:30"));
    expect((await H_().query(api.family.board, {})).me!.bday).toBeUndefined();
    await t.mutation(api.families.clearBday, { studentId: hana });
    expect((await H_().query(api.family.me, {})).bday).toBeNull();
    await H_().mutation(api.family.setBday, { bday: "11-05" });
    expect((await t.query(api.families.profileOf, { studentId: hana })).bday).toBe("11-05");
    expect(await history("family-bday")).toEqual(["11-04", "", "11-05"]);
  });

  test("his profile: the map of 12 weeks, his months, his report, his usual days and last class", async () => {
    const now = Date.now();
    await raw.run(async (ctx) => {
      // Two Mondays and two Thursdays in class (his usual days), a Level in class and one at home.
      for (const back of [2, 6, 9, 13]) {
        const inAt = now - back * D - H;
        await ctx.db.insert("attendance", { studentId: hana, day: slDay(inAt), inAt, outAt: inAt + 2 * H });
      }
      const m = {
        q: { "1": { got: 2, max: 2, lost: false, t: now - 2 * D }, "2": { got: 0, max: 2, lost: true, t: now - 2 * D } },
        lv: { "1": { done: now - 2 * D, fixed: now - 2 * D, got: 15 }, "2": { done: now - H, fixed: now - H, got: 9, home: now - H, by: "home" } },
      };
      // Her book now has its row already (students.add): the class's marks go in it.
      const row = await ctx.db.query("progress").withIndex("by_student_unit_stage", (q) => q.eq("studentId", hana).eq("unitId", u01).eq("stage", "master")).first();
      if (row) await ctx.db.patch(row._id, { m });
      else await ctx.db.insert("progress", { studentId: hana, unitId: u01, stage: "master", marks: {}, m, startedAt: now - 3 * D, updatedAt: now });
    });
    const p = await H_().query(api.family.profile, {});
    expect(p.today).toBe(slDayNo(now));
    expect(p.since).toBe(slDayNo(now - 13 * D - H));
    expect(p.days.find((d) => d.d === slDayNo(now))).toEqual({ d: slDayNo(now), home: 1, cls: 0, xp: 9, in: false });
    expect(p.days.find((d) => d.d === slDayNo(now - 2 * D))).toMatchObject({ cls: 1, xp: 15, in: true });
    expect(p.months[0]).toMatchObject({ m: "2026-11", days: 1, min: 120, levels: 2, home: 1, xp: 24, right: 1, toLearn: 1 });
    expect(p.months[1]).toMatchObject({ m: "2026-10", days: 3, min: 360 });
    expect(p.usual).toEqual([0, 3]);
    expect(p.last).toBe(slDay(now - 2 * D - H));
    expect(p.stages).toHaveLength(1);
    expect(p.stages[0]).toMatchObject({ unitId: u01, now: true, done: 2, got: 24, home: 1, cls: 1, right: 1, learned: 0, toLearn: 1 });
    // One day of the map, 12 weeks back: it opens.
    await expect(H_().query(api.family.day, { day: slDay(now - 83 * D) })).resolves.toMatchObject({ items: [] });
  });

  test("only the owner and Students teachers see and answer asks; a family phone can't; a removed student's asks go", async () => {
    await H_().mutation(api.family.setPhoto, { data: jpeg(), type: "image/jpeg" });
    await addPerson(raw, { name: "Corrector", token: "corrector-token-0123456789abcdefghijklmnopqrstu", tabs: ["correction"] });
    await addPerson(raw, { name: "Lead", token: "lead-teacher-token-0123456789abcdefghijklmnopqr", tabs: ["correction"], can: ["students"] });
    const cor = asPhone(raw, "corrector-token-0123456789abcdefghijklmnopqrstu");
    const lead = asPhone(raw, "lead-teacher-token-0123456789abcdefghijklmnopqr");
    await expect(cor.query(api.families.askCount, {})).rejects.toThrow();
    await expect(cor.query(api.families.asks, {})).rejects.toThrow();
    await expect(H_().query(api.families.asks, {})).rejects.toThrow();
    const [ask] = await lead.query(api.families.asks, {});
    await expect(cor.mutation(api.families.answer, { id: ask.id, yes: true })).rejects.toThrow();
    await expect(cor.mutation(api.families.dropPhoto, { studentId: hana })).rejects.toThrow();
    // A family phone never reaches another child's things.
    await expect(raw.query(api.family.photos, { token: "x".repeat(50), keys: [] })).rejects.toThrow(/signed out/);
    // Removed from the class: his asks leave the list (and wipeStudent takes everything).
    await t.mutation(api.students.setArchived, { id: hana, archived: true });
    expect(await lead.query(api.families.asks, {})).toEqual([]);
    await raw.run(async (ctx) => wipeStudent(ctx, (await ctx.db.get(hana))!));
    expect(await photoRows()).toEqual([]);
    expect(await raw.run(async (ctx) => (await ctx.db.query("familyAsks").collect()).length)).toBe(0);
  });

  test("the teachers remove a photo; the Family sheet shows the photo, the one waiting, the birthday and a name asked", async () => {
    const a = (await H_().mutation(api.family.setPhoto, { data: jpeg(), type: "image/jpeg" })).key;
    await t.mutation(api.families.answer, { id: (await t.query(api.families.asks, {}))[0].id, yes: true });
    await H_().mutation(api.family.setPhoto, { data: webp(), type: "image/webp" });
    await H_().mutation(api.family.askName, { name: "Hana F" });
    await H_().mutation(api.family.setBday, { bday: "01-15" });
    const sheet = await t.query(api.families.profileOf, { studentId: hana });
    expect(sheet).toMatchObject({ photo: `data:image/jpeg;base64,${jpeg()}`, hide: false, bday: "01-15", nameAsk: { want: "Hana F" } });
    expect(sheet.wait?.pic).toBe(`data:image/webp;base64,${webp()}`);
    await t.mutation(api.families.dropPhoto, { studentId: hana });
    expect(await photoRows()).toEqual([]);
    expect((await H_().query(api.family.me, {})).photo).toBeNull();
    expect(await B_().query(api.family.photos, { keys: [a] })).toEqual({});
    expect(await t.query(api.families.askCount, {})).toBe(1); // the name still waits
  });
});
