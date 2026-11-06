// The race (7 Nov 2026, his voice note): every student on it, class work counted, his grade and the whole ARISTORA,
// last week's champions, the moves, the grade cup; the race rows every mutation keeps ready; a classmate's profile;
// cheers. Made-up students and numbers only.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { KNOWN_WORKBOOKS, levelOutOf } from "../convex/lib/book";
import { slWeekStart } from "../convex/lib/day";
import { xpItems } from "../convex/lib/family";
import { addNums, championsOf, champsOf, cupOf, cupWinners, numsAt, numsOf, passOf, placed, type RaceRow } from "../convex/lib/race";
import { RACE_V } from "../convex/lib/raceRows";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const at = (iso: string) => new Date(iso).getTime();
const DAY = 86_400_000;

describe("the race's numbers (convex/lib/race.ts)", () => {
  const WED = at("2026-11-04T15:00:00+05:30"); // a Wednesday
  test("XP this week, before today, last week, ever; read again later as they stand", () => {
    const items = [
      { t: at("2026-11-04T09:00:00+05:30"), xp: 5 }, // today
      { t: at("2026-11-02T17:00:00+05:30"), xp: 10 }, // Monday this week
      { t: at("2026-11-01T23:30:00+05:30"), xp: 7 }, // Sunday: last week
      { t: at("2026-10-20T10:00:00+05:30"), xp: 3 }, // two weeks ago
    ];
    const n = numsOf(items, WED);
    expect(n).toMatchObject({ xp: 15, xpy: 10, prev: 7, tot: 25 });
    expect(n.wk).toBe(slWeekStart(WED));
    // Thursday, nothing new: all of this week's XP was before today.
    expect(numsAt(n, WED + DAY)).toMatchObject({ xp: 15, xpy: 15, prev: 7, tot: 25 });
    // Next Monday: this week is last week; the week after, both are gone (ever stays).
    expect(numsAt(n, at("2026-11-09T08:00:00+05:30"))).toMatchObject({ xp: 0, xpy: 0, prev: 15, tot: 25 });
    expect(numsAt(n, at("2026-11-16T08:00:00+05:30"))).toMatchObject({ xp: 0, prev: 0, tot: 25 });
    // Two rows worked out at different moments add up as they stand now.
    const old = numsOf([{ t: at("2026-10-28T10:00:00+05:30"), xp: 4 }], at("2026-10-28T11:00:00+05:30"));
    expect(addNums([n, old], WED)).toMatchObject({ xp: 15, xpy: 10, prev: 11, tot: 29 });
  });

  const row = (id: string, xp: number, y = 0, p = 0, g: number | null = 8): RaceRow => ({ id, n: `${id} K`, g, xp, y, p });
  test("places: equal XP share one; 0 XP at the end with no place; moves since yesterday", () => {
    const list = placed([row("Bala", 20, 20), row("Asha", 30, 5), row("Chen", 20, 25), row("Dev", 0), row("Esa", 8, 0)]);
    expect(list.map((x) => [x.r.id, x.rank, x.move])).toEqual([
      ["Asha", 1, 2], // yesterday 3rd (5 XP), now 1st
      ["Bala", 2, null], // 2nd both days
      ["Chen", 2, -1], // yesterday 1st
      ["Esa", 4, "new"], // no XP yesterday
      ["Dev", null, null], // not started this week
    ]);
  });

  test("who he passes next, and for how much", () => {
    const list = placed([row("Asha", 30), row("Bala", 20), row("Chen", 20), row("Dev", 0)]);
    expect(passOf(list, "Chen")).toMatchObject({ above: { r: { id: "Asha" } }, gap: 11 });
    expect(passOf(list, "Asha")).toEqual({ above: null, gap: 0 });
    // Not started: the last one racing (1 XP more than him).
    expect(passOf(list, "Dev")).toMatchObject({ above: { r: { id: "Chen" } }, gap: 21 });
  });

  test("last week's champions (ties share it, nobody without XP); the grade cup", () => {
    expect([...champsOf([row("A", 0, 0, 40), row("B", 0, 0, 40), row("C", 0, 0, 9)])]).toEqual(["A", "B"]);
    expect(champsOf([row("A", 5), row("B", 0)]).size).toBe(0);
    const cup = cupOf([row("A", 5, 0, 0, 7), row("B", 0, 0, 3, 7), row("C", 2, 0, 0, 9), row("D", 1, 0, 0, 9), row("E", 9, 0, 0, null)]);
    expect(cup).toEqual([
      { g: 9, n: 2, of: 2 },
      { g: 7, n: 1, of: 2 },
    ]);
    expect(cupOf([row("A", 5, 0, 0, 7), row("B", 0, 0, 3, 7)], "last")).toEqual([{ g: 7, n: 1, of: 2 }]);
  });
});

describe("a finished week's champions (convex/lib/race.ts)", () => {
  const row = (id: string, p: number, g: number | null): RaceRow => ({ id, n: `${id} K`, g, xp: 0, y: 0, p });
  test("each grade's top 3 and ARISTORA's (ties share a place); the cup's winners (ties share it)", () => {
    const rows = [row("A", 40, 7), row("B", 40, 7), row("C", 9, 7), row("D", 2, 7), row("E", 50, 9), row("F", 0, 9)];
    const { top, cup } = championsOf(rows);
    expect(top.filter((x) => x.k === "g" && x.g === 7).map((x) => [x.id, x.place])).toEqual([
      ["A", 1],
      ["B", 1],
      ["C", 3],
    ]);
    expect(top.filter((x) => x.k === "a").map((x) => [x.id, x.place])).toEqual([
      ["E", 1],
      ["A", 2],
      ["B", 2],
    ]);
    expect(cup).toEqual([
      { g: 7, n: 4, of: 4 },
      { g: 9, n: 1, of: 2 },
    ]);
    expect(cupWinners(cup)).toEqual([7]);
    expect(cupWinners([{ g: 6, n: 1, of: 2 }, { g: 8, n: 2, of: 4 }])).toEqual([6, 8]);
    expect(cupWinners([{ g: 6, n: 0, of: 2 }])).toEqual([]);
  });
});

describe("class work is XP (7 Nov 2026)", () => {
  const fighter = (marks: Doc<"progress">["marks"], lh?: Doc<"progress">["lh"]) =>
    ({ stage: "fighter", marks, ...(lh ? { lh } : {}) }) as unknown as Doc<"progress">;
  test("a theory-book question marked right in class: 1 XP when it was marked; a ladder section checked at home counts once", () => {
    const home = at("2026-11-05T19:00:00+05:30");
    const cls = at("2026-11-04T16:00:00+05:30");
    const p = fighter(
      {
        "1": { s: "right", t: cls },
        "2": { s: "wrong", n: 1, t: cls },
        "3": { s: "taught", t: cls }, // the teacher's: not his XP
        "4": { s: "right", t: home }, // written by the home check: counted in lh
        "5": { s: "right", t: cls }, // in a section he checked at home later: counted there
        "9": { s: "right", t: cls },
      },
      { A: { t: home, got: 6, max: 8, q: [4, 5, 6] } },
    );
    expect(xpItems([p]).sort((a, b) => a.t - b.t)).toEqual([
      { t: cls, xp: 1 },
      { t: cls, xp: 1 },
      { t: home, xp: 6 },
    ]);
  });
});

describe("every mutation keeps the race rows (convex/lib/fn.ts)", () => {
  test("every server file takes mutation and internalMutation from ./lib/fn, never from ./_generated/server", () => {
    const files = import.meta.glob("../convex/*.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(20);
    for (const [f, src] of Object.entries(files)) {
      for (const m of src.matchAll(/import \{([^}]*)\} from "\.\/_generated\/server"/g)) {
        const names = m[1].split(",").map((x: string) => x.trim());
        expect(names, f).not.toContain("mutation");
        expect(names, f).not.toContain("internalMutation");
      }
    }
  });
});

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const FAM_A = "family-phone-asha-0123456789abcdefghijklmn";
const FAM_B = "family-phone-bala-0123456789abcdefghijklmn";

describe("the race on the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u08: Id<"units">;
  let asha: Id<"students">;
  let bala: Id<"students">;
  let chen: Id<"students">;
  const G7U08 = KNOWN_WORKBOOKS[0].data;
  /** Full marks for a level of G7-U08, the listed questions 0. */
  const items = (n: number, zero: number[] = []) => {
    const l = G7U08.levels.find((x) => x.n === n)!;
    const each = levelOutOf(G7U08, l)!;
    return Array.from({ length: l.to - l.from + 1 }, (_, i) => ({ q: l.from + i, got: zero.includes(l.from + i) ? 0 : each[i] }));
  };
  const levelMax = (n: number) => items(n).reduce((a, x) => a + x.got, 0);
  const raceRow = async (sid: Id<"students">) =>
    await raw.run(async (ctx) => await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", sid)).first());
  const joinAs = async (sid: Id<"students">, tok: string) => {
    const code = `link-${tok.slice(0, 24)}`;
    await t.mutation(api.families.makeLink, { studentId: sid, codeHash: secretHash("family-link", code) });
    await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
    return asPhone(raw, tok);
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-04T15:00:00+05:30")); // a Wednesday
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u08 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
    asha = await t.mutation(api.students.add, { name: "Asha K", grade: 7, term: 1, stage: "master", unitId: u08 });
    bala = await t.mutation(api.students.add, { name: "Bala M", grade: 7, term: 1, stage: "master", unitId: u08 });
    chen = await t.mutation(api.students.add, { name: "Chen R", grade: 9, term: 1, stage: "master" });
  });
  afterEach(() => vi.useRealTimers());

  test("a new student has his row at once; class marks reach it, Take back too; a rename and a removal", async () => {
    expect(await raceRow(asha)).toMatchObject({ n: "Asha K", g: 7, demo: false, gone: false, xp: 0, tot: 0, v: RACE_V });
    await t.mutation(api.workbook.correct, { studentId: asha, level: 1, items: items(1, [items(1)[0].q]) });
    const got = levelMax(1) - items(1)[0].got;
    expect(await raceRow(asha)).toMatchObject({ xp: got, xpy: 0, tot: got });
    // Taken back: the XP goes too.
    const fixed = await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", asha)).first())!.m!.lv["1"].fixed!);
    await t.mutation(api.workbook.uncorrect, { studentId: asha, level: 1, fixed, before: {} });
    expect(await raceRow(asha)).toMatchObject({ xp: 0, tot: 0 });
    await t.mutation(api.students.rename, { id: asha, name: "Asha N" });
    expect((await raceRow(asha))!.n).toBe("Asha N");
    await t.mutation(api.students.setArchived, { id: bala, archived: true });
    expect((await raceRow(bala))!.gone).toBe(true);
  });

  test("the fill builds rows written without a mutation and says once they are all ready; the race reads them", async () => {
    // A row written straight into the database (as before this came): no race row knows it yet.
    await raw.run(async (ctx) => {
      await ctx.db.insert("progress", {
        studentId: chen,
        unitId: u08,
        stage: "master",
        marks: {},
        m: { q: {}, lv: { "1": { done: Date.now() - 3600_000, fixed: Date.now(), got: 12, by: "correction" } } },
        startedAt: 0,
        updatedAt: 0,
      });
      const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", chen)).first())!;
      await ctx.db.patch(r._id, { v: 0 });
    });
    // Before the fill: the race works it out the old way, from everyone's rows.
    const A = await joinAs(asha, FAM_A);
    expect((await A.query(api.family.board, {})).rows.find((r) => r.id === chen)).toMatchObject({ xp: 12 });
    expect(await raw.mutation(internal.race.fill, {})).toBe(1); // the others got theirs when they were added
    expect(await raceRow(chen)).toMatchObject({ xp: 12, v: RACE_V });
    expect(await raw.mutation(internal.race.fill, {})).toBe(0); // ready: nothing more to do
    const b = await A.query(api.family.board, {});
    expect(b).toMatchObject({ you: asha, grade: 7 });
    expect(b.rows.map((r) => [r.n, r.g, r.xp]).sort()).toEqual([
      ["Asha K", 7, 0],
      ["Bala M", 7, 0],
      ["Chen R", 9, 12],
    ]);
  });

  test("a level checked at home: XP at once, the race and Me agree; tomorrow it shows as yesterday's", async () => {
    await raw.mutation(internal.race.fill, {});
    await t.mutation(api.workbook.correct, { studentId: bala, level: 1, items: items(1) });
    const A = await joinAs(asha, FAM_A);
    let b = await A.query(api.family.board, {});
    expect(b.rows.find((r) => r.id === bala)).toMatchObject({ xp: levelMax(1), y: 0 });
    vi.setSystemTime(new Date("2026-11-05T10:00:00+05:30"));
    b = await A.query(api.family.board, {});
    expect(b.rows.find((r) => r.id === bala)).toMatchObject({ xp: levelMax(1), y: levelMax(1) });
    // Next Monday: 0 this week, last week's for the crowns.
    vi.setSystemTime(new Date("2026-11-09T08:00:00+05:30"));
    b = await A.query(api.family.board, {});
    expect(b.rows.find((r) => r.id === bala)).toMatchObject({ xp: 0, y: 0, p: levelMax(1) });
  });

  test("last week's champions are kept once a week; each #1 gets a week won", async () => {
    await raw.mutation(internal.race.fill, {});
    await t.mutation(api.workbook.correct, { studentId: bala, level: 1, items: items(1) });
    await t.mutation(api.workbook.correct, { studentId: asha, level: 1, items: items(1, [items(1)[0].q]) });
    vi.setSystemTime(new Date("2026-11-09T00:05:00+05:30"));
    const wk = await raw.mutation(internal.race.week, {});
    expect(wk).toBe(slWeekStart(Date.now()) - 7 * DAY);
    expect(await raw.mutation(internal.race.week, {})).toBeNull(); // once
    const kept = await raw.run(async (ctx) => (await ctx.db.query("raceWeeks").collect())[0]);
    expect(kept.top.filter((x) => x.k === "g").map((x) => [x.n, x.place])).toEqual([
      ["Bala M", 1],
      ["Asha K", 2],
    ]);
    expect(kept.top.filter((x) => x.k === "a").map((x) => x.n)).toEqual(["Bala M", "Asha K"]);
    expect(kept.cup).toEqual([
      { g: 7, n: 2, of: 2 },
      { g: 9, n: 0, of: 1 },
    ]);
    expect(await raceRow(bala)).toMatchObject({ w: 1, wa: 1 });
    expect((await raceRow(asha))!.w).toBeUndefined();
  });

  test("a classmate's profile: everything; the owner's switch takes the marks out; another class can't open it", async () => {
    await t.mutation(api.workbook.correct, { studentId: bala, level: 1, items: items(1, [items(1)[0].q]) });
    const A = await joinAs(asha, FAM_A);
    const m = await A.query(api.family.mate, { id: bala });
    expect(m).toMatchObject({ id: bala, name: "Bala M", grade: 7, levelsDone: 1, marks: true, cheers: { n: 0, mine: false } });
    expect(m.xp).toBe(levelMax(1) - items(1)[0].got);
    expect(m.p.stages[0]).toMatchObject({ done: 1, right: items(1).length - 1, toLearn: 1 });
    expect(m.p.stages[0].got).toBeGreaterThan(0);
    // The owner: off = no marks on a classmate's profile (his own Me keeps them).
    expect(await t.query(api.race.settings, {})).toEqual({ marks: true, prizes: { g: "", a: "", cup: "" } });
    await t.mutation(api.race.setMarks, { on: false });
    const off = await A.query(api.family.mate, { id: bala });
    expect(off.marks).toBe(false);
    expect(off.p.stages[0]).toMatchObject({ done: 1, got: 0, max: 0, right: 0, toLearn: 0 });
    await expect(A.mutation(api.race.setMarks, { on: true })).rejects.toThrow();
    // A demo student is not in the real race.
    const demo = await raw.run(async (ctx) => await ctx.db.insert("students", { name: "Demo D", archived: false, demo: true, present: false, idleMs: 0, grade: 7 }));
    await expect(A.query(api.family.mate, { id: demo })).rejects.toThrow(/isn't in the race/);
  });

  test("his photo in the race: shown, hidden by his family, back; the copy follows each change", async () => {
    const A = await joinAs(asha, FAM_A);
    const photo = await raw.run(async (ctx) => {
      const id = await ctx.db.insert("profilePhotos", { studentId: asha, data: "AAAA", type: "image/jpeg", at: Date.now() });
      await ctx.db.patch(asha, { photo: { id, at: Date.now() } }); // as the teachers' OK writes it (not a mutation here)
      return id;
    });
    await A.mutation(api.family.setRace, { show: false });
    expect((await raceRow(asha))!.pic).toBeUndefined();
    await A.mutation(api.family.setRace, { show: true });
    expect((await raceRow(asha))!.pic).toBe(photo);
    await A.mutation(api.family.dropPhoto, {});
    expect((await raceRow(asha))!.pic).toBeUndefined();
  });

  test("gifts: the owner's prizes, Monday gives them to last week's winners, his phone shows them until Given", async () => {
    await raw.mutation(internal.race.fill, {});
    await t.mutation(api.workbook.correct, { studentId: bala, level: 1, items: items(1) });
    await t.mutation(api.workbook.correct, { studentId: asha, level: 1, items: items(1, [items(1)[0].q]) });
    // Before Monday: the poster works the week out now (last week: nobody yet).
    expect(await t.query(api.race.champions, {})).toMatchObject({ kept: false, top: [] });
    await expect(t.mutation(api.race.setPrizes, { g: "x".repeat(41), a: "", cup: "" })).rejects.toThrow(/40 letters/);
    expect(await t.mutation(api.race.setPrizes, { g: " 🍦  Ice cream ", a: "🍗 Chicken fries", cup: "🍬 A sweet" })).toEqual({
      g: "🍦 Ice cream",
      a: "🍗 Chicken fries",
      cup: "🍬 A sweet",
    });
    vi.setSystemTime(new Date("2026-11-09T00:05:00+05:30"));
    await raw.mutation(internal.race.week, {});
    // Bala: his grade's champion and ARISTORA's (both gifts); the cup: Grade 7 (both learned), each one a sweet.
    const g = await t.query(api.race.gifts, {});
    expect(g.open.map((x) => [x.n, x.kind, x.what]).sort()).toEqual([
      ["Asha K", "cup", "🍬 A sweet"],
      ["Bala M", "a", "🍗 Chicken fries"],
      ["Bala M", "cup", "🍬 A sweet"],
      ["Bala M", "g", "🍦 Ice cream"],
    ]);
    expect(await t.query(api.race.giftCount, {})).toBe(4);
    const B = await joinAs(bala, FAM_B);
    expect((await B.query(api.family.me, {})).gifts.map((x) => x.what).sort()).toEqual(["🍗 Chicken fries", "🍦 Ice cream", "🍬 A sweet"]);
    // The poster reads the kept week now.
    const c = await t.query(api.race.champions, {});
    expect(c.kept).toBe(true);
    expect(c.top.filter((x) => x.place === 1).map((x) => [x.n, x.k])).toEqual([
      ["Bala M", "g"],
      ["Bala M", "a"],
    ]);
    // The Manager gives one (a Correction-only teacher can't); his phone no longer shows it; Undo brings it back.
    await addPerson(raw, { name: "Mala", token: "manager-phone-token-0123456789abcdefghijklmnop", tabs: ["correction", "manager"] });
    await addPerson(raw, { name: "Kavi", token: "corrector-phone-token-0123456789abcdefghijklmn", tabs: ["correction"] });
    const M = asPhone(raw, "manager-phone-token-0123456789abcdefghijklmnop");
    const K = asPhone(raw, "corrector-phone-token-0123456789abcdefghijklmn");
    const ice = g.open.find((x) => x.kind === "g")!;
    await expect(K.mutation(api.race.give, { id: ice.id as Id<"gifts">, given: true })).rejects.toThrow();
    await expect(K.query(api.race.gifts, {})).rejects.toThrow();
    await M.mutation(api.race.give, { id: ice.id as Id<"gifts">, given: true });
    const after = await M.query(api.race.gifts, {});
    expect(after.open).toHaveLength(3);
    expect(after.given).toMatchObject([{ n: "Bala M", what: "🍦 Ice cream", by: "Mala" }]);
    expect((await B.query(api.family.me, {})).gifts).toHaveLength(2);
    await M.mutation(api.race.give, { id: ice.id as Id<"gifts">, given: false });
    expect(await M.query(api.race.giftCount, {})).toBe(4);
    // No prize = no gift: the next Monday with prizes cleared gives none.
    await t.mutation(api.race.setPrizes, { g: "", a: "", cup: "" });
    await t.mutation(api.workbook.correct, { studentId: asha, level: 2, items: items(2) });
    vi.setSystemTime(new Date("2026-11-16T00:05:00+05:30"));
    await raw.mutation(internal.race.week, {});
    expect(await t.query(api.race.giftCount, {})).toBe(4);
  });

  test("cheers: one a day per classmate, never himself; he sees who cheered him this week", async () => {
    const A = await joinAs(asha, FAM_A);
    const B = await joinAs(bala, FAM_B);
    expect(await A.mutation(api.family.cheer, { id: bala })).toEqual({ n: 1, mine: true });
    expect(await A.mutation(api.family.cheer, { id: bala })).toEqual({ n: 1, mine: true }); // again today: still one
    await expect(A.mutation(api.family.cheer, { id: asha })).rejects.toThrow(/not yourself/);
    expect((await A.query(api.family.mate, { id: bala })).cheers).toEqual({ n: 1, mine: true });
    expect((await B.query(api.family.me, {})).cheers).toEqual({ n: 1, from: ["Asha K"] });
    vi.setSystemTime(new Date("2026-11-05T10:00:00+05:30"));
    expect(await A.mutation(api.family.cheer, { id: bala })).toEqual({ n: 2, mine: true });
    expect((await B.query(api.family.me, {})).cheers).toEqual({ n: 2, from: ["Asha K"] });
    // Next week: a new count.
    vi.setSystemTime(new Date("2026-11-09T10:00:00+05:30"));
    expect((await B.query(api.family.me, {})).cheers).toEqual({ n: 0, from: [] });
  });
});
