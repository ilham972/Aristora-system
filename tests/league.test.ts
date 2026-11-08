// The leagues and ranks (8 Nov 2026, his voice note: "when it comes to Monday, all the progress will start from zero ...
// they feel like they are losing what they earned"; his answers: 5 leagues, all grades mixed; gifts for each league's
// winner every week and the month's most improved; a gift by hand any time). What he earns is kept (XP ever, the rank it
// gives, never down); only the week's race starts again, and its result moves his league. Made-up students and numbers.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { KNOWN_WORKBOOKS, levelOutOf } from "../convex/lib/book";
import { slMonthStart, slWeekStart } from "../convex/lib/day";
import {
  addNums,
  daysIn,
  leagueMoves,
  leagueOrder,
  leaguePlaces,
  leagueWeek,
  nextStep,
  numsAt,
  numsOf,
  RANKS,
  rankOf,
  rankShown,
  sameNums,
  seedLeagues,
  starsOf,
} from "../convex/lib/race";
import { RACE_V } from "../convex/lib/raceRows";
import { giveXp } from "../convex/lib/usXp";
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

describe("ranks: his XP ever, never down (convex/lib/race.ts)", () => {
  test("ten ranks, then a ⭐ every 2,500 XP; the kept rank wins over fewer XP; the next step", () => {
    expect(RANKS).toHaveLength(10);
    expect([0, 99, 100, 299, 300, 999, 1000, 5499, 5500, 99999].map(rankOf)).toEqual([0, 0, 1, 1, 2, 3, 4, 8, 9, 9]);
    expect(starsOf(5499)).toBe(0);
    expect(starsOf(8000)).toBe(1);
    expect(rankShown(50, 3)).toBe(3);
    expect(rankShown(1200)).toBe(4);
    expect(nextStep(250)).toMatchObject({ from: 100, at: 300, need: 50, e: "🔎" });
    // Kept at a higher rank than his XP gives (marks taken back): the road starts from the kept rank.
    expect(nextStep(250, 3)).toMatchObject({ at: 1000, need: 750 });
    expect(nextStep(6000)).toMatchObject({ from: 5500, at: 8000, need: 2000, e: "⭐" });
  });
});

describe("leagues (convex/lib/race.ts)", () => {
  type R = { id: string; n: string; xp: number; dd: number; t: number };
  const r = (id: string, xp: number, dd = 1, t = 0): R => ({ id, n: id, xp, dd, t });
  const order = (rows: R[]) =>
    leagueOrder(
      rows,
      (x) => x.xp,
      (x) => x.dd,
      (x) => x.t,
    );
  const moves = (rows: R[], lg: number) =>
    Object.fromEntries(
      leagueMoves(
        order(rows),
        lg,
        (x) => x.xp,
        (x) => x.dd,
      ),
    );
  const ten = [r("A", 50), r("B", 40), r("C", 30), r("D", 25), r("E", 20), r("F", 15), r("G", 10), r("H", 5, 4), r("I", 0), r("J", 0)];

  test("the top 3 with XP up, the bottom 3 down, skipping anyone with 🛡️ (4 days)", () => {
    // H learned on 4 days: safe, so G goes down in his place.
    expect(moves(ten, 2)).toEqual({ A: 1, B: 1, C: 1, J: -1, I: -1, G: -1 });
    // The top league: nobody higher to go to; the first: nobody lower.
    expect(moves(ten, 5)).toEqual({ J: -1, I: -1, G: -1 });
    expect(moves(ten, 1)).toEqual({ A: 1, B: 1, C: 1 });
    // A small league: a third of it each way; no XP = no move up.
    expect(moves([r("A", 9), r("B", 0), r("C", 0), r("D", 0)], 3)).toEqual({ A: 1, D: -1 });
    expect(moves([r("A", 0), r("B", 0), r("C", 0)], 3)).toEqual({ C: -1 });
  });

  test("equal XP: more days learned first, then more XP ever, then the name; places shared", () => {
    const rows = [r("Zed", 10, 1, 500), r("Amy", 10, 3, 0), r("Bob", 10, 1, 900), r("Cat", 0)];
    expect(order(rows).map((x) => x.id)).toEqual(["Amy", "Bob", "Zed", "Cat"]);
    expect(Object.fromEntries(leaguePlaces(order(rows), (x) => x.xp))).toEqual({ Amy: 1, Bob: 1, Zed: 1 });
  });

  test("the first leagues: who ever learned in fifths by last week's XP (then XP ever); who never learned in the first", () => {
    const rows = [
      ...[50, 40, 30, 20, 10, 8, 4, 0].map((p, i) => ({ id: `s${i}`, n: `s${i}`, p, t: 100 - i })),
      { id: "new1", n: "new1", p: 0, t: 0 },
      { id: "new2", n: "new2", p: 0, t: 0 },
    ];
    expect(Object.fromEntries(seedLeagues(rows))).toEqual({ s0: 5, s1: 5, s2: 4, s3: 4, s4: 3, s5: 2, s6: 2, s7: 1, new1: 1, new2: 1 });
  });

  test("a finished week: each one's result, the winners (ties share it), who moved up", () => {
    const rows = [
      { id: "A", n: "A", l: 2, p: 30, ddp: 2, t: 0 },
      { id: "B", n: "B", l: 2, p: 30, ddp: 2, t: 0 },
      { id: "C", n: "C", l: 2, p: 5, ddp: 1, t: 0 },
      { id: "D", n: "D", l: undefined, p: 7, ddp: 1, t: 0 },
    ];
    const wk = at("2026-11-02T00:00:00+05:30");
    const { results, winners, up } = leagueWeek(rows, wk);
    expect(results.get("A")).toEqual({ wk, l: 2, p: 1, m: 1, xp: 30, win: true, of: 3 });
    expect(results.get("B")).toMatchObject({ p: 1, m: 0, win: true });
    expect(results.get("C")).toMatchObject({ p: 3, m: -1, win: false });
    expect(results.get("D")).toEqual({ wk, l: 1, p: 1, m: 0, xp: 7, win: true, of: 1 });
    expect(winners.map((w) => [w.l, w.r.id])).toEqual([
      [1, "D"],
      [2, "A"],
      [2, "B"],
    ]);
    expect(up.map((w) => [w.l, w.r.id])).toEqual([[3, "A"]]);
  });

  test("the 🛡️ on Monday: the last one learned on 4 days, stays and is told so; the next one up moves down instead", () => {
    const rows = [90, 80, 70, 60, 50, 40, 30, 20, 10].map((p, i) => ({ id: `s${i + 1}`, n: `s${i + 1}`, l: 3, p, ddp: i === 8 ? 4 : 1, t: 0 }));
    const wk = at("2026-11-02T00:00:00+05:30");
    const { results } = leagueWeek(rows, wk);
    expect(results.get("s9")).toEqual({ wk, l: 3, p: 9, m: 0, xp: 10, win: false, of: 9, sh: true });
    expect(["s6", "s7", "s8"].map((id) => results.get(id)?.m)).toEqual([-1, -1, -1]);
    expect(["s6", "s7", "s8"].map((id) => results.get(id)?.sh)).toEqual([undefined, undefined, undefined]);
    expect(["s1", "s2", "s3"].map((id) => results.get(id)?.m)).toEqual([1, 1, 1]);
  });
});

describe("the phone's copies", () => {
  test("the first load's league names (board.tsx LEAGUE_NAMES) are LEAGUES'", async () => {
    const { LEAGUE_NAMES } = await import("../src/family/board");
    const { LEAGUES } = await import("../convex/lib/race");
    expect(LEAGUE_NAMES).toEqual(LEAGUES.map((l) => `${l.e} ${l.n}`));
  });
});

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const FAM = "family-phone-league-0123456789abcdefghijk";

describe("the leagues and ranks on the server", () => {
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
  /** His race row as if last week (the week of 2 Nov) he made `xp` XP on `days` days, and `tot` ever. */
  const lastWeek = async (sid: Id<"students">, xp: number, days: number, lg: number, tot = xp) =>
    await raw.run(async (ctx) => {
      const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", sid)).first())!;
      const wk = at("2026-11-02T00:00:00+05:30");
      await ctx.db.patch(r._id, { lg, wk, d: Math.floor((wk + 330 * 60_000) / DAY) + 6, xp, xpy: xp, prev: 0, tot, dm: (1 << days) - 1, dmp: 0, mk: slMonthStart(wk), mo: xp, m1: 0, m2: 0 });
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

  test("the fill puts everyone in a league once, by last week's XP; a new student starts in the first", async () => {
    await ready();
    const ids: Id<"students">[] = [];
    for (const [i, n] of ["Asha K", "Bala M", "Chen R", "Devi S", "Esha N"].entries()) {
      ids.push(await add(n));
      await lastWeek(ids[i], [50, 40, 30, 20, 0][i], 1, 1, [50, 40, 30, 20, 0][i]);
    }
    vi.setSystemTime(new Date("2026-11-09T10:00:00+05:30")); // Monday: last week's XP is `prev` now
    await raw.mutation(internal.race.fill, {});
    expect(await Promise.all(ids.map(async (id) => (await rowOf(id)).lg))).toEqual([5, 4, 3, 2, 1]);
    // Each one's first Monday card at once (9 Nov 2026): last week saved, the league it gave him.
    const wk = at("2026-11-02T00:00:00+05:30");
    expect((await rowOf(ids[0])).lr).toEqual({ wk, l: 5, p: 1, m: 0, xp: 50, win: false, of: 1, pl: true });
    expect((await rowOf(ids[4])).lr).toEqual({ wk, l: 1, p: null, m: 0, xp: 0, win: false, of: 1, pl: true });
    // Once: a second fill changes nothing, a new student is in the first league.
    await lastWeek(ids[4], 0, 0, 1);
    await raw.mutation(internal.race.fill, {});
    expect((await rowOf(ids[0])).lg).toBe(5);
    const late = await add("Faiz T");
    expect((await rowOf(late)).lg).toBeUndefined();
    const A = await joinAs(ids[0], FAM);
    expect((await A.query(api.family.me, {})).race?.lr).toMatchObject({ l: 5, xp: 50, pl: true });
    const b = await A.query(api.family.board, {});
    expect(b.rows.find((r) => r.id === ids[0])).toMatchObject({ l: 5, t: 50 });
    expect(b.rows.find((r) => r.id === late)?.l).toBeUndefined();
  });

  test("Monday: each one's result kept, the top 3 up, the bottom 3 down (🛡️ safe), the winner's gift, the owl's lines", async () => {
    await ready();
    await raw.run(async (ctx) => await ctx.db.insert("meta", { key: "leagues", value: { at: Date.now() } }));
    await t.mutation(api.race.setPrizes, { lg: "🍦 Ice cream", mi: "", cup: "" });
    const xp = [50, 40, 30, 25, 20, 15, 10, 5, 0, 0];
    const ids: Id<"students">[] = [];
    for (let i = 0; i < xp.length; i++) {
      ids.push(await add(`Kid${String.fromCharCode(65 + i)} K`, 6 + (i % 6)));
      await lastWeek(ids[i], xp[i], i === 7 ? 4 : xp[i] ? 1 : 0, 2);
    }
    vi.setSystemTime(new Date("2026-11-09T00:05:00+05:30"));
    await raw.mutation(internal.race.week, {});
    const lg = await Promise.all(ids.map(async (id) => (await rowOf(id)).lg));
    // KidH learned on 4 days: safe; KidG goes down in his place.
    expect(lg).toEqual([3, 3, 3, 2, 2, 2, 1, 2, 1, 1]);
    expect((await rowOf(ids[0])).lr).toEqual({ wk: at("2026-11-02T00:00:00+05:30"), l: 2, p: 1, m: 1, xp: 50, win: true, of: 10 });
    expect((await rowOf(ids[8])).lr).toMatchObject({ p: null, m: -1, win: false });
    const gifts = await t.query(api.race.gifts, {});
    expect(gifts.open.map((x) => [x.n, x.kind, x.l])).toEqual([["KidA K", "lg", 2]]);
    const lines = await raw.run(async (ctx) => await ctx.db.query("usMoments").collect());
    expect(lines.find((m) => m.k === "champs")?.ppl?.map((p) => [p.n, p.l])).toEqual([["KidA K", 2]]);
    expect(lines.find((m) => m.k === "lgup")?.ppl?.map((p) => [p.n, p.l])).toEqual([
      ["KidA K", 3],
      ["KidB K", 3],
      ["KidC K", 3],
    ]);
    const kept = await raw.run(async (ctx) => (await ctx.db.query("raceWeeks").collect())[0]);
    expect(kept).toMatchObject({ lup: 3, ldown: 3, lw: [{ l: 2, n: "KidA K", xp: 50 }] });
    // His phone: Monday's card and his new league.
    const A = await joinAs(ids[0], FAM);
    expect((await A.query(api.family.me, {})).race).toMatchObject({ lg: 3, lr: { p: 1, m: 1, win: true } });
  });

  test("the leagues put together on a Monday itself move nobody that day (nobody raced in one)", async () => {
    await ready();
    const a = await add("Asha K");
    await lastWeek(a, 30, 1, 1);
    vi.setSystemTime(new Date("2026-11-09T00:05:00+05:30"));
    await t.mutation(api.race.setPrizes, { lg: "🍦 Ice cream", mi: "", cup: "" });
    await raw.mutation(internal.race.week, {});
    // No race behind it: his first card only says where last week put him.
    expect((await rowOf(a)).lr).toEqual({ wk: at("2026-11-02T00:00:00+05:30"), l: 5, p: 1, m: 0, xp: 30, win: false, of: 1, pl: true });
    expect(await t.query(api.race.giftCount, {})).toBe(0);
  });

  test("the leagues came before the first cards (the live server, 9 Nov 2026): each one gets his card once, that week only", async () => {
    await ready();
    const ids: Id<"students">[] = [];
    for (const [i, n] of ["Asha K", "Bala M", "Chen R"].entries()) {
      ids.push(await add(n));
      await lastWeek(ids[i], [40, 10, 0][i], 1, [3, 2, 1][i], [40, 10, 0][i]);
    }
    vi.setSystemTime(new Date("2026-11-09T02:30:00+05:30"));
    await raw.run(async (ctx) => {
      await ctx.db.insert("meta", { key: "leagues", value: { at: at("2026-11-09T01:45:00+05:30") } });
      const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", ids[1])).first())!;
      await ctx.db.patch(r._id, { lr: { wk: 1, l: 2, p: 1, m: 0, xp: 1, win: true, of: 1 } });
    });
    await raw.mutation(internal.race.fill, {});
    const wk = at("2026-11-02T00:00:00+05:30");
    expect((await rowOf(ids[0])).lr).toEqual({ wk, l: 3, p: 1, m: 0, xp: 40, win: false, of: 1, pl: true });
    expect((await rowOf(ids[1])).lr).toMatchObject({ wk: 1, win: true });
    expect((await rowOf(ids[2])).lr).toEqual({ wk, l: 1, p: null, m: 0, xp: 0, win: false, of: 1, pl: true });
    // Once: a card closed or changed later is never written again.
    await raw.run(async (ctx) => {
      const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", ids[0])).first())!;
      await ctx.db.patch(r._id, { lr: undefined });
    });
    await raw.mutation(internal.race.fill, {});
    expect((await rowOf(ids[0])).lr).toBeUndefined();
  });

  test("leagues that came in an earlier week get no first cards later", async () => {
    await ready();
    const a = await add("Asha K");
    await lastWeek(a, 40, 1, 3, 40);
    await raw.run(async (ctx) => await ctx.db.insert("meta", { key: "leagues", value: { at: at("2026-11-02T03:00:00+05:30") } }));
    vi.setSystemTime(new Date("2026-11-09T10:00:00+05:30"));
    await raw.mutation(internal.race.fill, {});
    expect((await rowOf(a)).lr).toBeUndefined();
    expect(await raw.run(async (ctx) => (await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "leagueCards")).first()) !== null)).toBe(true);
  });

  test("his rank: a new one is the owl's line (from Us's XP or a level); never down when marks go back; a new row says nothing", async () => {
    const a = await add("Asha K");
    expect((await rowOf(a)).rk).toBe(0);
    const now = Date.now();
    await raw.run(async (ctx) => {
      await giveXp(ctx, a, 60, "ans", "ref-1", now);
      await giveXp(ctx, a, 45, "ans", "ref-2", now);
    });
    expect((await rowOf(a)).rk).toBe(1);
    let lines = (await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).filter((m) => m.k === "rank");
    expect(lines.map((m) => [m.n, m.x])).toEqual([["Asha K", 1]]);
    // A level brings him past 300? Not with one level: no new line. Its marks taken back: the rank stays.
    await raw.run(async (ctx) => await giveXp(ctx, a, 200, "help", "ref-3", now));
    expect((await rowOf(a)).rk).toBe(2);
    await t.mutation(api.workbook.correct, { studentId: a, level: 1, items: items(1) });
    const fixed = await raw.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", a)).first())!.m!.lv["1"].fixed!);
    await t.mutation(api.workbook.uncorrect, { studentId: a, level: 1, fixed, before: {} });
    expect((await rowOf(a)).rk).toBe(2);
    lines = (await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).filter((m) => m.k === "rank");
    expect(lines.map((m) => m.x)).toEqual([1, 2]);
    const A = await joinAs(a, FAM);
    expect((await A.query(api.family.me, {})).race?.rk).toBe(2);
    // A demo student's rank says nothing in Us.
    const d = await add("Demo D");
    await raw.run(async (ctx) => {
      await ctx.db.patch(d, { demo: true });
      const r = (await ctx.db.query("raceRows").withIndex("by_sid", (q) => q.eq("sid", d)).first())!;
      await ctx.db.patch(r._id, { demo: true });
    });
    await raw.run(async (ctx) => await giveXp(ctx, d, 150, "ans", "ref-d", now));
    expect((await raw.run(async (ctx) => await ctx.db.query("usMoments").collect())).filter((m) => m.k === "rank")).toHaveLength(2);
  });

  test("the 1st: last month's most improved (Levels against the month before), their gifts once, the owl's line", async () => {
    await t.mutation(api.race.setPrizes, { lg: "", mi: "🍗 Chicken fries", cup: "" });
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

  test("the race's rows carry XP ever, the rank, the league, the days learned this week", async () => {
    const a = await add("Asha K");
    await t.mutation(api.workbook.correct, { studentId: a, level: 1, items: items(1) });
    const A = await joinAs(a, FAM);
    const b = await A.query(api.family.board, {});
    const mine = b.rows.find((r) => r.id === a)!;
    expect(mine).toMatchObject({ dd: 1, t: mine.xp });
    expect(mine.l).toBeUndefined();
    expect((await A.query(api.family.me, {})).race).toMatchObject({ lg: 1, dd: 1, lr: null });
    expect(slWeekStart(Date.now())).toBe(at("2026-11-02T00:00:00+05:30"));
  });
});
