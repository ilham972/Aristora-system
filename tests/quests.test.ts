// Today's quests, the chests and the flame shield (14 Nov 2026, his "build completely" on the idea pictures 08 and 09):
// the same three quests for everyone, all about learning; the day's chest once a day after all three (coins, never XP);
// a road chest after every 3rd Level of a Stage, from the day the chests came; the shield keeps one day without a Level.
// And the road's classmates: on his Level and ahead, never behind him. Made-up names, levels and numbers only.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { slDayNo } from "../convex/lib/day";
import { streakOf } from "../convex/lib/family";
import type { MState } from "../convex/lib/master";
import {
  answersSince,
  bestRun,
  chestCoins,
  chestSetOf,
  CHESTS_FROM,
  levelOn,
  questKinds,
  questsOf,
  roadChestLevels,
  roadChestState,
  shieldDays,
  shieldNeeded,
} from "../convex/lib/quests";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const at = (iso: string) => new Date(iso).getTime();
const SAT = at("2026-11-14T20:00:00+05:30");
const MON = at("2026-11-16T10:00:00+05:30");
const TUE = at("2026-11-17T10:00:00+05:30");
const row = (m: Partial<MState>, more: Partial<Doc<"progress">> = {}) =>
  ({ stage: "master", marks: {}, m: { q: {}, lv: {}, ...m }, ...more }) as unknown as Doc<"progress">;

describe("the rules (convex/lib/quests.ts)", () => {
  test("three quests a day, the same for everyone: a Level first; Saturday and Sunday two Levels too", () => {
    expect(questKinds(slDayNo(SAT))).toEqual(["lv", "two", expect.any(String)]);
    const week = [0, 1, 2, 3, 4].map((i) => questKinds(slDayNo(MON) + i));
    for (const q of week) {
      expect(q[0]).toBe("lv");
      expect(q[1]).not.toBe(q[2]);
      expect(q).not.toContain("two");
    }
    // Every kind comes in a week.
    expect(new Set(week.flat())).toEqual(new Set(["lv", "run", "right", "xp"]));
  });

  test("his answers today in order: the first try, a second try, class circles, a ladder; free marks are not his", () => {
    const t1 = MON - 3600_000;
    const t2 = MON - 1800_000;
    const yesterday = MON - 86_400_000;
    const r = row({
      q: {
        "1": { lost: false, t: t1 },
        "2": { lost: false, t: t1 },
        "3": { lost: true, t: t1, rt: t2, rh: 1 },
        "4": { lost: false, t: t1 },
        "5": { lost: false, t: t1 },
        "6": { lost: false, t: yesterday },
        "7": { lost: false, t: t1, fr: "none" },
        "8": { lost: false, t: t1, dk: true },
      },
    });
    const ans = answersSince([r], MON - 5 * 3600_000);
    expect(ans.map((a) => [a.q, a.ok])).toEqual([
      [1, true],
      [2, true],
      [3, false],
      [4, true],
      [5, true],
      [8, false],
      [3, true],
    ]);
    expect(bestRun(ans)).toBe(2);
    const circles = row({}, { stage: "fighter", m: undefined, marks: { "1": { s: "right", t: t1 }, "2": { s: "right", t: t1 }, "3": { s: "wrong", t: t1 } } as never });
    expect(answersSince([circles], MON - 5 * 3600_000).map((a) => a.ok)).toEqual([true, true, false]);
  });

  test("today's quests: how far he is, each at most its number", () => {
    const t1 = MON - 3600_000;
    const q = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [String(i + 1), { lost: i === 4, got: i === 4 ? 0 : 2, max: 2, t: t1 }]));
    const r = row({ q, lv: { "1": { done: t1, fixed: t1, got: 16 } } });
    const got = Object.fromEntries(questsOf([r], MON).map((x) => [x.k, [x.n, x.of]]));
    expect(got.lv).toEqual([1, 1]);
    for (const [k, v] of Object.entries(got)) {
      if (k === "run") expect(v).toEqual([4, 4]); // 4 right, a wrong one, then 4 more: the best run is 4
      if (k === "right") expect(v).toEqual([8, 8]);
      if (k === "xp") expect(v).toEqual([15, 15]);
    }
  });

  test("the chests' numbers: the day's chest varies a little; the owner's numbers; a road chest after every 3rd Level", () => {
    expect(chestCoins(5, 0)).toBe(3);
    expect(chestCoins(5, 0.999)).toBe(7);
    expect(chestCoins(3, 0)).toBe(1);
    expect(chestCoins(2, 0.7)).toBe(2);
    expect(chestCoins(0, 0.7)).toBe(0);
    expect(chestSetOf(undefined)).toEqual({ d: 5, r: 3, s: 30 });
    expect(chestSetOf({ d: 0, r: 2.5, s: -1 })).toEqual({ d: 0, r: 3, s: 30 });
    expect(roadChestLevels([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toEqual([3, 6, 9]);
    expect(roadChestLevels([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual([3, 6]);
    expect(roadChestLevels([1, 2, 3])).toEqual([]);
    const m = (lv: MState["lv"]) => ({ q: {}, lv }) as MState;
    expect(roadChestState(m({}), 3)).toBe("wait");
    expect(roadChestState(m({ "3": { done: CHESTS_FROM - 1 } }), 3)).toBe("old");
    expect(roadChestState(m({ "3": { pre: CHESTS_FROM + 1 } }), 3)).toBe("old");
    expect(roadChestState(m({ "3": { fixed: CHESTS_FROM + 1 } }), 3)).toBe("ready");
    expect(levelOn(undefined)).toBe(1);
    expect(levelOn(m({ "1": { pre: 1 }, "2": { fixed: 2 } }))).toBe(3);
    expect(levelOn(m({ "1": { done: 1 }, "3": { done: 3 } }))).toBe(4);
  });

  test("the shield: a day without a Level keeps his flame, once; never after his flame was out", () => {
    const today = slDayNo(MON);
    const dayAt = (d: number) => d * 86_400_000 - 330 * 60_000 + 10 * 3600_000;
    const r = row({ lv: { "1": { done: dayAt(today - 3) }, "2": { done: dayAt(today - 2) } } });
    // No shield: yesterday had no Level, his flame is out.
    expect(streakOf([r], MON)).toEqual({ days: 0, today: false });
    expect(shieldNeeded([r], [], today)).toBe(true);
    // Holding one: yesterday is kept already on his phone, before the night's job writes it down.
    const kept = shieldDays([r], { sh: 1, sd: [] }, MON);
    expect(kept).toEqual([today - 1]);
    expect(streakOf([r], MON, kept)).toEqual({ days: 3, today: false });
    // Written down: the shield is used, the day stays kept.
    expect(shieldNeeded([r], [today - 1], today)).toBe(false);
    expect(shieldDays([r], { sh: 0, sd: [today - 1] }, MON)).toEqual([today - 1]);
    // Two days missed: the flame was out the day before, a shield doesn't bring it back.
    expect(shieldNeeded([r], [], today + 1)).toBe(false);
    expect(shieldDays([r], { sh: 1, sd: [] }, MON + 86_400_000)).toEqual([]);
  });
});

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const FAM_A = "family-phone-quests-a-0123456789abcdefghij";
const FAM_B = "family-phone-quests-b-0123456789abcdefghij";
const CORRECTOR = "corrector-phone-quests-0123456789abcdefghi";

describe("the quests, the chests and the shield on the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let unit: Id<"units">;
  const add = async (name: string) => await t.mutation(api.students.add, { name, grade: 7, term: 1, stage: "master", unitId: unit });
  /** His workbook: levels done at these times, and his answers (all at one time). */
  const work = async (sid: Id<"students">, lv: MState["lv"], q: MState["q"] = {}) =>
    await raw.run(async (ctx) => {
      const row = await ctx.db
        .query("progress")
        .withIndex("by_student_unit_stage", (x) => x.eq("studentId", sid).eq("unitId", unit).eq("stage", "master"))
        .first();
      const now = Date.now();
      if (row) await ctx.db.patch(row._id, { m: { q, lv }, updatedAt: now });
      else await ctx.db.insert("progress", { studentId: sid, unitId: unit, stage: "master", marks: {}, m: { q, lv }, startedAt: now, updatedAt: now });
    });
  const wallet = async (sid: Id<"students">) =>
    await raw.run(async (ctx) => await ctx.db.query("wallets").withIndex("by_sid", (q) => q.eq("sid", sid)).first());
  const joinAs = async (sid: Id<"students">, tok: string) => {
    const code = `link-${tok.slice(0, 24)}`;
    await t.mutation(api.families.makeLink, { studentId: sid, codeHash: secretHash("family-link", code) });
    await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
    return asPhone(raw, tok);
  };
  /** Ten made-up Levels of 4 questions. */
  const levels = Array.from({ length: 10 }, (_, i) => ({ to: (i + 1) * 4, max: 8 }));
  /** A morning's work today: Levels 1 and 2 done, 8 answers right in a row (enough for any day's three quests). */
  const allQuests = () => {
    const t1 = Date.now() - 3600_000;
    return {
      lv: { "1": { done: t1, fixed: t1, got: 8 }, "2": { done: t1, fixed: t1, got: 8 } },
      q: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [String(i + 1), { lost: false, got: 2, max: 2, t: t1 }])),
    };
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MON));
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    unit = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
    await t.mutation(api.catalog.saveWorkbook, { unitId: unit, parts: [{ id: "I", to: 40 }], levels, marks: {}, replace: true });
  });
  afterEach(() => vi.useRealTimers());

  test("today's chest: once a day after the three quests, a few coins (never XP); a new wallet still pays only his last week", async () => {
    const a = await add("Asha K");
    const A = await joinAs(a, FAM_A);
    const me0 = await A.query(api.family.me, {});
    expect(me0.quests).toMatchObject({ open: false, c: 5 });
    expect(me0.quests!.q.map((q) => q.k)).toEqual(questKinds(slDayNo(MON)));
    expect(me0.quests!.q.every((q) => q.n === 0)).toBe(true);
    await expect(A.mutation(api.coins.chest, {})).rejects.toThrow(/மூன்று/);
    // Last week's 20 XP (before this Monday), then today's morning.
    const lastWeek = at("2026-11-12T10:00:00+05:30");
    const day = allQuests();
    await work(a, { "1": { done: lastWeek, fixed: lastWeek, got: 20 }, ...Object.fromEntries(Object.entries(day.lv).map(([k, v]) => [String(Number(k) + 1), v])) }, day.q);
    const me1 = await A.query(api.family.me, {});
    expect(me1.quests!.q.every((q) => q.n >= q.of)).toBe(true);
    const xpBefore = me1.total;
    const got = await A.mutation(api.coins.chest, {});
    expect(got.c).toBeGreaterThanOrEqual(3);
    expect(got.c).toBeLessThanOrEqual(7);
    // His first wallet: the XP before this week counts as paid out (his first Monday pays only this week).
    expect(await wallet(a)).toMatchObject({ n: got.c, xp: 20, wk: 0, paid: got.c, cd: slDayNo(MON) });
    await expect(A.mutation(api.coins.chest, {})).rejects.toThrow(/ஏற்கனவே/);
    const me2 = await A.query(api.family.me, {});
    expect(me2.quests!.open).toBe(true);
    expect(me2.total).toBe(xpBefore); // coins, never XP
    expect(me2.coins!.n).toBe(got.c);
    expect((await A.query(api.coins.shop, {})).lines[0]).toMatchObject({ n: got.c, k: "chest", w: "Today's quests" });
    // Tomorrow: new quests, a closed chest.
    vi.setSystemTime(new Date(TUE));
    const me3 = await A.query(api.family.me, {});
    expect(me3.quests!.open).toBe(false);
    expect(me3.quests!.q.every((q) => q.n === 0)).toBe(true);
    // Next Monday's pay: only this week's XP (16), never the 20 from before.
    vi.setSystemTime(new Date(at("2026-11-23T00:15:00+05:30")));
    await raw.mutation(internal.coins.payday, {});
    expect(await wallet(a)).toMatchObject({ n: got.c + 3, xp: 35, last: 3 });
    // The owner turns the day's chest off.
    expect(await t.mutation(api.coins.setChests, { d: 0, r: 3, s: 30 })).toBe(true);
    expect((await A.query(api.family.me, {})).quests!.c).toBe(0);
    await expect(A.mutation(api.coins.chest, {})).rejects.toThrow(/இல்லை/);
  });

  test("a road chest: after every 3rd Level, once, a Level finished since the chests came; never after the last", async () => {
    const a = await add("Asha K");
    const A = await joinAs(a, FAM_A);
    const done = Date.now() - 3600_000;
    const before = CHESTS_FROM - 86_400_000;
    await work(a, { "1": { done: before }, "2": { done: before }, "3": { done: before }, "4": { done }, "5": { done }, "6": { done } });
    const road = await A.query(api.family.road, { unitId: unit });
    expect(road.rc).toBe(3);
    expect(road.chests).toEqual([
      { n: 3, s: "old" },
      { n: 6, s: "ready" },
      { n: 9, s: "wait" },
    ]);
    await expect(A.mutation(api.coins.roadChest, { unitId: unit, n: 3 })).rejects.toThrow(/Level 3/);
    await expect(A.mutation(api.coins.roadChest, { unitId: unit, n: 4 })).rejects.toThrow(/இல்லை/);
    await expect(A.mutation(api.coins.roadChest, { unitId: unit, n: 9 })).rejects.toThrow(/Level 9/);
    expect(await A.mutation(api.coins.roadChest, { unitId: unit, n: 6 })).toEqual({ c: 3, n: 3 });
    await expect(A.mutation(api.coins.roadChest, { unitId: unit, n: 6 })).rejects.toThrow(/ஏற்கனவே/);
    expect((await A.query(api.family.road, { unitId: unit })).chests[1]).toEqual({ n: 6, s: "open", c: 3 });
    expect((await A.query(api.coins.shop, {})).lines[0]).toMatchObject({ n: 3, k: "chest", w: "Stage 8 · Level 6" });
    // A Stage that isn't one: nothing.
    expect(await A.query(api.family.road, { unitId: "not-a-unit" })).toEqual({ mates: [], chests: [], rc: 0 });
    // The owner turns road chests off: none to open (the opened one still shows).
    await t.mutation(api.coins.setChests, { d: 5, r: 0, s: 30 });
    await expect(A.mutation(api.coins.roadChest, { unitId: unit, n: 9 })).rejects.toThrow(/இல்லை/);
    expect((await A.query(api.family.road, { unitId: unit })).chests.map((c) => c.s)).toEqual(["old", "open", "wait"]);
  });

  test("the road's classmates: on his Level and ahead, never behind him; his world only; the spots of older parts filled once", async () => {
    const a = await add("Asha K");
    const b = await add("Bilal M");
    const c = await add("Chen R");
    const d = await add("Dev S");
    const demo = await add("Demo D");
    await raw.run(async (ctx) => await ctx.db.patch(demo, { demo: true }));
    const t1 = Date.now() - 3600_000;
    await work(a, { "1": { done: t1 }, "2": { done: t1 } }); // on Level 3
    await work(b, { "1": { done: t1 }, "2": { done: t1 } }); // on Level 3 too
    await work(c, { "1": { done: t1 }, "2": { done: t1 }, "3": { done: t1 }, "4": { done: t1 } }); // on Level 5
    await work(d, {}); // on Level 1: behind her
    await work(demo, { "1": { done: t1 }, "2": { done: t1 }, "3": { done: t1 }, "4": { done: t1 } });
    // The race rows and parts again (with their spots): raw writes here pass no mutation's watch.
    await raw.run(async (ctx) => {
      for (const r of await ctx.db.query("raceRows").collect()) await ctx.db.patch(r._id, { v: 0 });
      for (const m of await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "raceV")).collect()) await ctx.db.delete(m._id);
    });
    await raw.mutation(internal.race.fill, {});
    const A = await joinAs(a, FAM_A);
    expect((await A.query(api.family.road, { unitId: unit })).mates).toEqual([
      { n: 3, c: 1, f: [{ id: b, n: "Bilal" }] },
      { n: 5, c: 1, f: [{ id: c, n: "Chen" }] },
    ]);
    // Dev on Level 1 sees everyone ahead of him (not the demo student).
    const D = await joinAs(d, FAM_B);
    expect((await D.query(api.family.road, { unitId: unit })).mates.map((g) => [g.n, g.c])).toEqual([
      [3, 2],
      [5, 1],
    ]);
    // A part from before the road (no spot): the fill gives it its spot, once.
    await raw.run(async (ctx) => {
      for (const p of await ctx.db.query("raceParts").collect()) await ctx.db.patch(p._id, { u: undefined, on: undefined });
      await ctx.db.insert("meta", { key: "roadV", value: { c: null, at: 0 } });
    });
    expect((await A.query(api.family.road, { unitId: unit })).mates).toEqual([]);
    await raw.mutation(internal.race.fill, {});
    const jobs = await raw.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((j) => j.name));
    expect(jobs.filter((n) => /race(\.js)?:spots$/.test(n))).toHaveLength(1);
    // A second fill while the chain runs starts no other.
    await raw.mutation(internal.race.fill, {});
    expect((await raw.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).filter((j) => /spots$/.test(j.name))).toHaveLength(1);
    await raw.mutation(internal.race.spots, { c: null }); // the chain's page (every part fits in one here)
    expect((await A.query(api.family.road, { unitId: unit })).mates.map((g) => g.n)).toEqual([3, 5]);
    expect((await raw.run(async (ctx) => await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "roadV")).first()))?.value).toEqual({ done: true });
  });

  test("the flame shield: bought with coins, one at a time; the night keeps a day without a Level, once", async () => {
    const a = await add("Asha K");
    const A = await joinAs(a, FAM_A);
    const today = slDayNo(MON);
    const dayAt = (d: number) => d * 86_400_000 - 330 * 60_000 + 10 * 3600_000;
    await raw.run(async (ctx) => {
      await ctx.db.insert("wallets", { sid: a, n: 40, xp: 0, wk: 0, last: 0, paid: 40, spent: 0 });
    });
    expect((await A.query(api.family.me, {})).shield).toEqual({ has: false, p: 30, kept: null });
    await expect(A.mutation(api.coins.buyShield, { p: 25 })).rejects.toThrow(/30 coins/);
    expect(await A.mutation(api.coins.buyShield, { p: 30 })).toEqual({ n: 10 });
    await expect(A.mutation(api.coins.buyShield, { p: 30 })).rejects.toThrow(/ஏற்கனவே/);
    expect(await wallet(a)).toMatchObject({ n: 10, spent: 30, sh: 1 });
    expect((await A.query(api.coins.shop, {})).lines[0]).toMatchObject({ n: -30, k: "buy", w: "🛡 Flame shield" });
    // Levels the two days before yesterday, none yesterday: the flame stands (kept), and the night writes it down.
    await work(a, { "1": { done: dayAt(today - 3) }, "2": { done: dayAt(today - 2) } });
    expect((await A.query(api.family.me, {})).streak).toEqual({ days: 3, today: false });
    expect(await raw.mutation(internal.coins.shields, {})).toBe(1);
    expect(await raw.mutation(internal.coins.shields, {})).toBe(0);
    expect(await wallet(a)).toMatchObject({ sh: 0, sd: [today - 1] });
    const me = await A.query(api.family.me, {});
    expect(me.shield).toEqual({ has: false, p: 30, kept: today - 1 });
    expect(me.streak).toEqual({ days: 3, today: false });
    // A classmate sees the same flame on her profile.
    const b = await add("Bilal M");
    const B = await joinAs(b, FAM_B);
    expect((await B.query(api.family.mate, { id: a })).streak).toEqual({ days: 3, today: false });
    // Not enough coins; the owner stops selling it.
    await expect(A.mutation(api.coins.buyShield, { p: 30 })).rejects.toThrow(/இன்னும் 20/);
    await t.mutation(api.coins.setChests, { d: 5, r: 3, s: 0 });
    await expect(A.mutation(api.coins.buyShield, { p: 0 })).rejects.toThrow(/இல்லை/);
  });

  test("the owner's numbers: only the owner, whole numbers in range, shown in Settings → Shop", async () => {
    await expect(t.mutation(api.coins.setChests, { d: 51, r: 3, s: 30 })).rejects.toThrow(/0 to 50/);
    await expect(t.mutation(api.coins.setChests, { d: 5, r: 1.5, s: 30 })).rejects.toThrow(/0 to 50/);
    await expect(t.mutation(api.coins.setChests, { d: 5, r: 3, s: 1001 })).rejects.toThrow(/0 to 1000/);
    await addPerson(raw, { name: "Corrector", token: CORRECTOR, tabs: ["correction"] });
    await expect(asPhone(raw, CORRECTOR).mutation(api.coins.setChests, { d: 5, r: 3, s: 30 })).rejects.toThrow();
    await t.mutation(api.coins.setChests, { d: 4, r: 2, s: 20 });
    expect((await t.query(api.coins.items, {})).chests).toEqual({ d: 4, r: 2, s: 20 });
  });
});
