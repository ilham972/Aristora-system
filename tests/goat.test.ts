// All time, the GOAT and the weekly coins (11 Nov 2026, his voice note: students who put in so much work thought "everything
// is gone" when the week's list started from zero; his answers: the leagues (8 Nov) and the rank badges out; his grade
// this week and all time; the GOAT = ARISTORA's all-time #1 over every grade, a badge that moves the moment someone passes
// him; each grade's weekly #1 wins coins for the Shop instead of a gift, never two weeks running). Also the numbers the
// race keeps (days learned, months) and the gifts that stay (the month's most improved, a gift by hand). Made-up
// students and numbers.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { KNOWN_WORKBOOKS, levelOutOf } from "../convex/lib/book";
import { slMonthStart, slWeekStart } from "../convex/lib/day";
import { addNums, daysIn, everPlace, goatOf, numsAt, numsOf, placedEver, sameNums, WEEK_COINS, weekWinners, type RaceRow } from "../convex/lib/race";
import { RACE_V } from "../convex/lib/raceRows";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const at = (iso: string) => new Date(iso).getTime();
const DAY = 86_400_000;

describe("the numbers keep the days he learned and the months (convex/lib/race.ts)", () => {
  const WED = at("2026-11-04T15:00:00+05:30"); // a Wednesday
  const dayNo = (iso: string) => Math.floor((at(iso) + 330 * 60_000) / DAY);
  test("this week's days as bits (Monday = 1), last week's; XP this month, last month, the month before", () => {
    const items = [
      { t: at("2026-11-04T09:00:00+05:30"), xp: 5 },
      { t: at("2026-11-02T17:00:00+05:30"), xp: 10 },
      { t: at("2026-10-30T10:00:00+05:30"), xp: 7 },
      { t: at("2026-09-15T10:00:00+05:30"), xp: 3 },
      { t: at("2026-08-15T10:00:00+05:30"), xp: 100 }, // three months ago: ever only
    ];
    const days = [dayNo("2026-11-02T10:00:00+05:30"), dayNo("2026-11-04T10:00:00+05:30"), dayNo("2026-10-30T10:00:00+05:30"), dayNo("2026-10-01T10:00:00+05:30")];
    const n = numsOf(items, WED, days);
    expect(n).toMatchObject({ xp: 15, prev: 7, tot: 125, dm: 0b101, dmp: 0b10000, mk: slMonthStart(WED), mo: 15, m1: 7, m2: 3 });
    expect(daysIn(n.dm)).toBe(2);
    // Next Monday: this week's days are last week's; 1 December: November is last month, October the one before.
    expect(numsAt(n, at("2026-11-09T08:00:00+05:30"))).toMatchObject({ dm: 0, dmp: 0b101, mo: 15, m1: 7 });
    expect(numsAt(n, at("2026-12-01T08:00:00+05:30"))).toMatchObject({ mo: 0, m1: 15, m2: 7, tot: 125 });
    expect(numsAt(n, at("2027-01-02T08:00:00+05:30"))).toMatchObject({ mo: 0, m1: 0, m2: 15 });
    // Two rows: the days of either, the months added up.
    const other = numsOf([{ t: at("2026-11-03T09:00:00+05:30"), xp: 4 }], WED, [dayNo("2026-11-03T09:00:00+05:30")]);
    expect(addNums([n, other], WED)).toMatchObject({ dm: 0b111, mo: 19, xp: 19 });
    // Numbers kept before 8 Nov 2026 (no months): never "the same" (they get written again with them).
    const { dm, dmp, mk, mo, m1, m2, ...old } = n;
    expect(sameNums(old, n)).toBe(false);
    expect(sameNums(n, { ...n })).toBe(true);
    expect([dm, dmp, mk, mo, m1, m2].length).toBe(6);
  });
});

describe("all time, the GOAT and the weekly coins (convex/lib/race.ts)", () => {
  const row = (id: string, g: number | null, xp: number, t: number, extra: Partial<RaceRow> = {}): RaceRow => ({ id, n: `${id} K`, g, xp, y: xp, p: 0, t, ...extra });

  test("all time: by XP ever, nobody with none placed; today's XP moves him since yesterday", () => {
    // Cara's 30 today took her past Bala: ▲1; Bala ▼1. Dev never learned: no place.
    const list = placedEver([row("Asha", 7, 0, 500), row("Bala", 7, 10, 300), row("Cara", 7, 30, 320, { y: 0 }), row("Dev", 7, 0, 0)]);
    expect(list.map((x) => [x.r.id, x.r.xp, x.rank, x.move])).toEqual([
      ["Asha", 500, 1, null],
      ["Cara", 320, 2, 1],
      ["Bala", 300, 3, -1],
      ["Dev", 0, null, null],
    ]);
    // His place in his grade's list; a Monday with 0 this week keeps every place.
    const rows = [row("Asha", 7, 0, 500), row("Bala", 7, 0, 300), row("Eli", 8, 0, 900), row("Dev", 7, 0, 0)];
    expect(everPlace(rows, "Bala", 7)).toEqual({ place: 2, of: 3 });
    expect(everPlace(rows, "Dev", 7)).toEqual({ place: null, of: 3 });
  });

  test("the GOAT: the most XP ever in every grade; equal XP the name; nobody before anyone learned", () => {
    expect(goatOf([row("Asha", 7, 0, 500), row("Eli", 8, 0, 900), row("Zed", null, 0, 400)])?.id).toBe("Eli");
    expect(goatOf([row("Bala", 7, 0, 900), row("Asha", 9, 0, 900)])?.id).toBe("Asha");
    expect(goatOf([row("Asha", 7, 0, 0)])).toBeNull();
    expect(goatOf([])).toBeNull();
  });

  test("weekly coins: each grade's #1 of last week; never two weeks running (then the next); ties by days, XP ever, name", () => {
    const rows = [
      row("Asha", 7, 0, 900, { p: 50, dp: 2 }),
      row("Bala", 7, 0, 100, { p: 50, dp: 3 }),
      row("Cara", 7, 0, 100, { p: 40 }),
      row("Eli", 8, 0, 200, { p: 30 }),
      row("Fay", 8, 0, 300, { p: 30 }),
      row("Gus", 9, 0, 300, { p: 0 }),
      row("Zed", null, 0, 999, { p: 99 }),
    ];
    // Bala learned on more days; Fay has more XP ever; Grade 9 learned nothing: no winner; no grade: never.
    expect(weekWinners(rows, new Set())).toEqual([
      { g: 7, id: "Bala", n: "Bala K", xp: 50 },
      { g: 8, id: "Fay", n: "Fay K", xp: 30 },
    ]);
    // Bala won last week: Asha; Fay won and nobody else learned... Eli did: Eli.
    expect(weekWinners(rows, new Set(["Bala", "Fay"])).map((x) => x.id)).toEqual(["Asha", "Eli"]);
    expect(WEEK_COINS).toBe(50);
  });
});

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const FAM = "family-phone-goat-0123456789abcdefghijklm";
const FAM2 = "family-phone-goat2-0123456789abcdefghijkl";

describe("all time, the GOAT and the weekly coins on the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u08: Id<"units">;
  const G7U08 = KNOWN_WORKBOOKS[0].data;
  const items = (n: number) => {
    const l = G7U08.levels.find((x) => x.n === n)!;
    const each = levelOutOf(G7U08, l)!;
    return Array.from({ length: l.to - l.from + 1 }, (_, i) => ({ q: l.from + i, got: each[i] }));
  };
  const rowOf = async (sid: Id<"students">) => (await raw.run(async (ctx) => await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", sid)).first()))!;
  const add = async (name: string, grade = 7) => await t.mutation(api.students.add, { name, grade, term: 1, stage: "master", ...(grade === 7 ? { unitId: u08 } : {}) });
  /** The race rows are all built (as on the live server): the race reads them, not the progress rows. */
  const ready = async () => await raw.run(async (ctx) => await ctx.db.insert("meta", { key: "raceV", value: RACE_V }));
  /** His race row as if in the week of `monday` he made `xp` XP on `days` days, and `tot` ever (read the week after). */
  const weekOf = async (sid: Id<"students">, monday: string, xp: number, days: number, tot = xp) =>
    await raw.run(async (ctx) => {
      const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", sid)).first())!;
      const wk = at(`${monday}T00:00:00+05:30`);
      await ctx.db.patch(r._id, { wk, d: Math.floor((wk + 330 * 60_000) / DAY) + 6, xp, xpy: xp, prev: 0, tot, dm: (1 << days) - 1, dmp: 0, mk: slMonthStart(wk), mo: xp, m1: 0, m2: 0 });
    });
  /** His XP ever now (this week's XP `xp`, of it `today` came today). */
  const everNow = async (sid: Id<"students">, tot: number, xp = 0, today = 0) =>
    await raw.run(async (ctx) => {
      const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", sid)).first())!;
      const wk = slWeekStart(Date.now());
      await ctx.db.patch(r._id, { wk, d: Math.floor((Date.now() + 330 * 60_000) / DAY), xp, xpy: xp - today, prev: 0, tot, dm: 0, dmp: 0, mk: slMonthStart(Date.now()), mo: 0, m1: 0, m2: 0 });
    });
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
  });
  afterEach(() => vi.useRealTimers());

  test("Monday: each grade's #1 wins the coins (kept with the week), paid with Monday's pay; the owl names them", async () => {
    await ready();
    const a = await add("Asha K");
    const b = await add("Bala M");
    const e = await add("Eli R", 8);
    await weekOf(a, "2026-11-02", 40, 2);
    await weekOf(b, "2026-11-02", 60, 1);
    await weekOf(e, "2026-11-02", 20, 1);
    vi.setSystemTime(new Date("2026-11-09T00:05:00+05:30"));
    await raw.mutation(internal.race.week, {});
    const wk = at("2026-11-02T00:00:00+05:30");
    const kept = await raw.run(async (ctx) => (await ctx.db.query("raceWeeks").collect())[0]);
    expect(kept.cw?.map((x) => [x.g, x.n, x.xp, x.c])).toEqual([
      [7, "Bala M", 60, 50],
      [8, "Eli R", 20, 50],
    ]);
    expect(kept.lw).toBeUndefined();
    const line = (await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).find((m) => m.k === "champs");
    expect(line).toMatchObject({ x: 50 });
    expect(line?.ppl?.map((p) => [p.n, p.g])).toEqual([
      ["Bala M", 7],
      ["Eli R", 8],
    ]);
    // No gift any more for a week's winner; the poster's champions have the coins.
    expect((await t.query(api.race.gifts, {})).open).toEqual([]);
    expect((await t.query(api.race.champions, {})).cw.map((x) => [x.g, x.n, x.c])).toEqual([
      [7, "Bala M", 50],
      [8, "Eli R", 50],
    ]);
    // 00:15: Monday's pay adds them (his XP pays nothing here: no Levels), with its own line.
    vi.setSystemTime(new Date("2026-11-09T00:15:00+05:30"));
    await raw.mutation(internal.coins.payday, {});
    const wallets = await raw.run(async (ctx) => await ctx.db.query("wallets").collect());
    expect(wallets.find((w) => w.sid === b)).toMatchObject({ n: 50, last: 50, paid: 50 });
    expect(wallets.find((w) => w.sid === a)).toMatchObject({ n: 0, last: 0 });
    const log = await raw.run(async (ctx) => await ctx.db.query("coinLog").collect());
    expect(log.map((l) => [l.sid === b ? "Bala" : l.sid === e ? "Eli" : "?", l.k, l.n, l.w])).toEqual([
      ["Bala", "win", 50, "Grade 7 · #1 · 2–8 Nov"],
      ["Eli", "win", 50, "Grade 8 · #1 · 2–8 Nov"],
    ]);
    // Once: a second pay day pays nobody twice.
    await raw.mutation(internal.coins.payday, {});
    expect((await raw.run(async (ctx) => await ctx.db.query("wallets").collect())).find((w) => w.sid === b)?.n).toBe(50);
    // His phone: he won (Home's card says so this week).
    const B = await joinAs(b, FAM);
    expect((await B.query(api.family.me, {})).won).toEqual({ g: 7, c: 50, wk });
    const A = await joinAs(a, FAM2);
    expect((await A.query(api.family.me, {})).won).toBeNull();
  });

  test("never two weeks running: last week's winner of a grade gives the coins to the next one; 0 coins = none", async () => {
    await ready();
    const a = await add("Asha K");
    const b = await add("Bala M");
    await weekOf(a, "2026-11-02", 40, 2);
    await weekOf(b, "2026-11-02", 60, 1);
    vi.setSystemTime(new Date("2026-11-09T00:05:00+05:30"));
    await raw.mutation(internal.race.week, {});
    await weekOf(a, "2026-11-09", 30, 2);
    await weekOf(b, "2026-11-09", 90, 5);
    // Before Monday's run: Settings → Race already shows who it would be.
    vi.setSystemTime(new Date("2026-11-16T00:01:00+05:30"));
    const before = await t.query(api.race.champions, {});
    expect([before.kept, before.cw.map((x) => x.n)]).toEqual([false, ["Asha K"]]);
    vi.setSystemTime(new Date("2026-11-16T00:05:00+05:30"));
    await raw.mutation(internal.race.week, {});
    const weeks = await raw.run(async (ctx) => await ctx.db.query("raceWeeks").collect());
    const w16 = weeks.find((w) => w.wk === at("2026-11-09T00:00:00+05:30"))!;
    // Bala is still #1 (👑, a week won) but Asha gets the coins.
    expect(w16.top.filter((c) => c.place === 1 && c.k === "g").map((c) => c.n)).toEqual(["Bala M"]);
    expect(w16.cw?.map((x) => x.n)).toEqual(["Asha K"]);
    // The owner turns the coins off: nobody wins them, the owl names the champions instead.
    await t.mutation(api.race.setPrizes, { wc: 0, mi: "", cup: "" });
    await weekOf(a, "2026-11-16", 10, 1);
    await weekOf(b, "2026-11-16", 20, 1);
    vi.setSystemTime(new Date("2026-11-23T00:05:00+05:30"));
    await raw.mutation(internal.race.week, {});
    const w23 = (await raw.run(async (ctx) => await ctx.db.query("raceWeeks").collect())).find((w) => w.wk === at("2026-11-16T00:00:00+05:30"))!;
    expect(w23.cw).toEqual([]);
    const champs = (await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).filter((m) => m.k === "champs");
    expect(champs.at(-1)?.x).toBeUndefined();
    expect(champs.at(-1)?.ppl?.map((p) => p.n)).toEqual(["Bala M"]);
  });

  test("Monday's pay came first (a late weekly run): the coins still reach him, once", async () => {
    await ready();
    const b = await add("Bala M");
    await weekOf(b, "2026-11-02", 60, 1);
    vi.setSystemTime(new Date("2026-11-09T00:15:00+05:30"));
    await raw.mutation(internal.coins.payday, {});
    vi.setSystemTime(new Date("2026-11-09T00:20:00+05:30"));
    await raw.mutation(internal.race.week, {});
    await raw.mutation(internal.race.week, {}); // once
    await raw.mutation(internal.coins.payday, {}); // paid already this Monday: nothing more
    expect((await raw.run(async (ctx) => await ctx.db.query("wallets").collect())).find((w) => w.sid === b)).toMatchObject({ n: 50, last: 50, paid: 50 });
    const log = await raw.run(async (ctx) => await ctx.db.query("coinLog").collect());
    expect(log.map((l) => [l.k, l.n, l.w])).toEqual([["win", 50, "Grade 7 · #1 · 2–8 Nov"]]);
  });

  test("the owner's weekly coins: a whole number 0–10,000; the prizes kept", async () => {
    expect((await t.query(api.race.settings, {})).prizes).toEqual({ wc: 50, mi: "", cup: "" });
    await expect(t.mutation(api.race.setPrizes, { wc: -1, mi: "", cup: "" })).rejects.toThrow(/whole number/);
    await expect(t.mutation(api.race.setPrizes, { wc: 2.5, mi: "", cup: "" })).rejects.toThrow(/whole number/);
    await expect(t.mutation(api.race.setPrizes, { wc: 10_001, mi: "", cup: "" })).rejects.toThrow(/whole number/);
    await t.mutation(api.race.setPrizes, { wc: 120, mi: " 🍗  Chicken fries ", cup: "" });
    expect((await t.query(api.race.settings, {})).prizes).toEqual({ wc: 120, mi: "🍗 Chicken fries", cup: "" });
    await addPerson(raw, { name: "Kavi", token: "corrector-phone-token-0123456789abcdefghijklmn", tabs: ["correction"] });
    await expect(asPhone(raw, "corrector-phone-token-0123456789abcdefghijklmn").mutation(api.race.setPrizes, { wc: 1, mi: "", cup: "" })).rejects.toThrow();
  });

  test("the GOAT: the fill notes a new one and the owl says so, once a day; his phone, a profile and the race know", async () => {
    await ready();
    const a = await add("Asha K");
    const e = await add("Eli R", 8);
    await everNow(a, 500);
    await everNow(e, 300);
    await raw.mutation(internal.race.fill, {});
    const goats = async () => (await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).filter((m) => m.k === "goat");
    expect((await goats()).map((m) => m.ppl?.map((p) => [p.n, p.g]))).toEqual([[["Asha K", 7]]]);
    await raw.mutation(internal.race.fill, {}); // no change: no line
    expect(await goats()).toHaveLength(1);
    // Eli passes her: he is the GOAT at once (his phone, the race), the owl waits for tomorrow.
    await everNow(e, 520, 220, 220);
    await raw.mutation(internal.race.fill, {});
    expect(await goats()).toHaveLength(1);
    expect(await raw.run(async (ctx) => (await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "goat")).first())?.value)).toMatchObject({ sid: e });
    const E = await joinAs(e, FAM);
    expect((await E.query(api.family.me, {})).ever).toEqual({ place: 1, of: 1, goat: true });
    const A = await joinAs(a, FAM2);
    expect((await A.query(api.family.me, {})).ever).toEqual({ place: 1, of: 1, goat: false });
    expect((await A.query(api.family.mate, { id: e })).ever).toEqual({ place: 1, of: 1, goat: true });
    const b = await A.query(api.family.board, {});
    expect(goatOf(b.rows)?.id).toBe(e);
    expect(b.rows.find((r) => r.id === a)).toMatchObject({ t: 500 });
    expect(b.wc).toBe(50);
    vi.setSystemTime(new Date("2026-11-05T09:00:00+05:30"));
    await everNow(a, 600);
    await raw.mutation(internal.race.fill, {});
    expect((await goats()).map((m) => m.ppl?.[0]?.n)).toEqual(["Asha K", "Asha K"]);
  });

  test("the ranks and the leagues are gone: no new rank lines, old ones and old league lines never reach a phone", async () => {
    await t.mutation(api.us.setCfg, { open: true });
    const a = await add("Asha K");
    await t.mutation(api.workbook.correct, { studentId: a, level: 1, items: items(1) });
    await t.mutation(api.workbook.correct, { studentId: a, level: 2, items: items(2) });
    const lines = await raw.run(async (ctx) => await ctx.db.query("usMoments").collect());
    expect(lines.filter((m) => m.k === "rank")).toEqual([]);
    expect((await rowOf(a)).rk).toBeUndefined();
    await raw.run(async (ctx) => {
      await ctx.db.insert("usMoments", { k: "rank", sid: a, n: "Asha K", g: 7, x: 2, at: Date.now(), day: 0, demo: false, c: 0 });
      await ctx.db.insert("usMoments", { k: "lgup", ppl: [{ sid: a, n: "Asha K", g: 7, l: 2 }], at: Date.now(), day: 0, demo: false, c: 0 });
    });
    const A = await joinAs(a, FAM);
    const f = await A.query(api.us.feed, {});
    expect(f.items.filter((m) => m.k === "rank" || m.k === "lgup")).toEqual([]);
    const row = (await A.query(api.family.board, {})).rows.find((r) => r.id === a)!;
    expect(row).toMatchObject({ dd: 1, t: row.xp });
    expect(Object.keys(row)).not.toContain("k");
    expect(Object.keys(row)).not.toContain("l");
    expect(Object.keys(await A.query(api.family.me, {}))).not.toContain("race");
  });

  test("the 1st: last month's most improved (Levels against the month before), their gifts once, the owl's line", async () => {
    await t.mutation(api.race.setPrizes, { wc: 0, mi: "🍗 Chicken fries", cup: "" });
    // (The test clock only goes forward: November against October, read on 1 December.)
    const nov = at("2026-11-01T00:00:00+05:30");
    const month = async (sid: Id<"students">, mo: number, m1: number) =>
      await raw.run(async (ctx) => {
        const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", sid)).first())!;
        const wk = at("2026-11-02T00:00:00+05:30");
        await ctx.db.patch(r._id, { wk, d: Math.floor((wk + 330 * 60_000) / DAY) + 2, xp: 0, xpy: 0, prev: 0, tot: mo + m1, mk: nov, mo, m1, m2: 0 });
      });
    const ids: Id<"students">[] = [];
    // November against October: 300 from 60 (×4), 200 from 100 (×1), 500 from 400, 50 from 0 (under the floor), 90 from 30.
    const nums: [number, number][] = [
      [300, 60],
      [200, 100],
      [500, 400],
      [50, 0],
      [90, 30],
    ];
    for (const [i, [mo, m1]] of nums.entries()) {
      ids.push(await add(`Kid${i} K`));
      await month(ids[i], mo, m1);
    }
    vi.setSystemTime(new Date("2026-12-01T00:10:00+05:30"));
    expect(await raw.mutation(internal.race.month, {})).toBe(nov);
    expect(await raw.mutation(internal.race.month, {})).toBeNull(); // once
    const g = await t.query(api.race.gifts, {});
    expect(g.open.map((x) => [x.n, x.kind, x.what, x.wk])).toEqual([
      ["Kid0 K", "mi", "🍗 Chicken fries", nov],
      ["Kid1 K", "mi", "🍗 Chicken fries", nov],
      ["Kid4 K", "mi", "🍗 Chicken fries", nov],
    ]);
    const line = (await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).find((m) => m.k === "upm");
    expect(line).toMatchObject({ x: nov });
    expect(line?.ppl?.map((p) => p.n)).toEqual(["Kid0 K", "Kid1 K", "Kid4 K"]);
    // The daily job starts it on the 1st only.
    await raw.mutation(internal.us.daily, {});
    const jobs = await raw.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((j) => j.name));
    expect(jobs.filter((n) => /race(\.js)?:month$/.test(n))).toHaveLength(1);
  });

  test("a gift by hand: the owner or the Manager, students, the gift and why; the owl tells Us the names and why", async () => {
    const a = await add("Asha K");
    const b = await add("Bala M", 9);
    await addPerson(raw, { name: "Mala", token: "manager-phone-token-0123456789abcdefghijklmnop", tabs: ["correction", "manager"] });
    await addPerson(raw, { name: "Kavi", token: "corrector-phone-token-0123456789abcdefghijklmn", tabs: ["correction"] });
    const M = asPhone(raw, "manager-phone-token-0123456789abcdefghijklmnop");
    const K = asPhone(raw, "corrector-phone-token-0123456789abcdefghijklmn");
    await expect(K.mutation(api.race.giveNow, { sids: [a], what: "🍦 Ice cream", why: "", tell: false })).rejects.toThrow();
    await expect(M.mutation(api.race.giveNow, { sids: [a], what: " ", why: "", tell: false })).rejects.toThrow(/Type the gift/);
    await expect(M.mutation(api.race.giveNow, { sids: [], what: "🍦", why: "", tell: false })).rejects.toThrow(/Pick a student/);
    await expect(M.mutation(api.race.giveNow, { sids: [a], what: "x".repeat(41), why: "", tell: false })).rejects.toThrow(/40 letters/);
    expect(await M.mutation(api.race.giveNow, { sids: [a, b, a], what: " 🍦 Ice  cream", why: "7 days in a row", tell: true })).toBe(2);
    const g = await t.query(api.race.gifts, {});
    expect(g.open.map((x) => [x.n, x.kind, x.what, x.why])).toEqual([
      ["Asha K", "own", "🍦 Ice cream", "7 days in a row"],
      ["Bala M", "own", "🍦 Ice cream", "7 days in a row"],
    ]);
    const line = (await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).find((m) => m.k === "gift");
    expect(line).toMatchObject({ t: "7 days in a row", demo: false });
    expect(line?.ppl?.map((p) => p.n)).toEqual(["Asha K", "Bala M"]);
    // Not told: no line. His phone: the card with the reason.
    await t.mutation(api.race.giveNow, { sids: [a], what: "🍬 A sweet", why: "", tell: true });
    expect((await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).filter((m) => m.k === "gift")).toHaveLength(1);
    const A = await joinAs(a, FAM);
    expect((await A.query(api.family.me, {})).gifts.map((x) => [x.kind, x.what, x.why ?? null])).toEqual([
      ["own", "🍦 Ice cream", "7 days in a row"],
      ["own", "🍬 A sweet", null],
    ]);
    const hist = await raw.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "gift").map((e) => e.value));
    expect(hist[0]).toBe("🍦 Ice cream → Asha K, Bala M (7 days in a row)");
  });

});
