// The Shop's coins (10 Nov 2026, his voice note and answers): XP stays his rank, coins are his money. Monday pays last
// week's XP (5 XP = 1 coin, the rest waits); a Level done at home pays once a teacher checked it in class; marks taken
// back come off the next pays (his coins never go down by themselves); the first pay = last week only; Us XP never
// pays; the owner's limit. The Shop on the phone: the owner's things, buying (coins, stock, the gold card), cancelling,
// Given, Coins back, Settings → Shop's numbers, the photos. Made-up names, things and numbers only.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { payWeek } from "../convex/coins";
import { secretHash } from "../convex/lib/auth";
import { firstPay, itemProblem, payFrom, payXpBefore, weekPay, XP_PER_COIN } from "../convex/lib/coins";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const at = (iso: string) => new Date(iso).getTime();
const MON = at("2026-11-09T00:00:00+05:30");
const NEXT_MON = at("2026-11-16T00:00:00+05:30");

/** Levels on one workbook row: [n, marks, when, done at home?, checked in class?]. */
type Lv = [number, number, number, boolean?, boolean?];
const lvOf = (levels: Lv[]) =>
  Object.fromEntries(
    levels.map(([n, got, t, home, hc]) => [String(n), { fixed: t, done: t, got, ...(home ? { home: t } : {}), ...(hc ? { hc: t + 60_000 } : {}) }]),
  );
const book = (levels: Lv[]) => ({ stage: "master", marks: {}, m: { q: {}, lv: lvOf(levels) } }) as unknown as Doc<"progress">;

describe("the pay's rules (convex/lib/coins.ts)", () => {
  test("whole coins, the rest waits; marks taken back wait to be filled; the owner's limit uses the XP up", () => {
    expect(XP_PER_COIN).toBe(5);
    expect(payFrom(23, 0, null)).toEqual({ coins: 4, xp: 20 });
    expect(payFrom(23, 20, null)).toEqual({ coins: 0, xp: 20 });
    expect(payFrom(28, 20, null)).toEqual({ coins: 1, xp: 25 });
    // 10 XP taken back after they paid: nothing until new XP fills the gap, never fewer coins.
    expect(payFrom(40, 50, null)).toEqual({ coins: 0, xp: 50 });
    expect(payFrom(62, 50, null)).toEqual({ coins: 2, xp: 60 });
    // The owner's limit: at most 10 coins, the XP over it is used up (a limit, not a delay).
    expect(payFrom(100, 0, 10)).toEqual({ coins: 10, xp: 100 });
  });

  test("a Level done at home pays once a teacher checked it; class work at once; the first pay is last week only", () => {
    const before = at("2026-10-28T10:00:00+05:30");
    const last = at("2026-11-04T10:00:00+05:30");
    const now = at("2026-11-10T10:00:00+05:30");
    const rows = [book([[1, 10, before], [2, 25, last], [3, 20, last, true], [4, 8, last, true, true], [5, 7, now]])];
    // Before this Monday: 10 + 25 + 8 (checked at home) = 43; the unchecked 20 doesn't pay yet; this week's 7 waits.
    expect(payXpBefore(rows, MON)).toBe(43);
    // The first pay: last week's 33 → 6 coins; the 10 from before stays XP (paid out), the 3 left over wait.
    expect(firstPay(rows, MON, null)).toEqual({ coins: 6, xp: 40 });
    // Next Monday the home Level was checked (20) and this week's 7 came: 3 + 20 + 7 = 30 → 6 coins.
    const checked = [book([[1, 10, before], [2, 25, last], [3, 20, last, true, true], [4, 8, last, true, true], [5, 7, now]])];
    expect(weekPay(checked, 40, NEXT_MON, null)).toEqual({ coins: 6, xp: 70 });
  });

  test("a second try's half marks pay with their level: a home Level not checked yet pays nothing of them", () => {
    const t1 = at("2026-11-04T10:00:00+05:30");
    const t2 = at("2026-11-06T10:00:00+05:30");
    // Level 1 at home: 10 marks, 3 of them a second try's half marks on Q2 (rh, inside the level's marks since 10 Nov).
    const row = (hc: boolean) =>
      ({
        stage: "master",
        marks: {},
        m: { q: { "2": { got: 0, lost: true, t: t1, rt: t2, rg: 6, rh: 3 } }, lv: { "1": { fixed: t1, done: t1, got: 10, home: t1, ...(hc ? { hc: t2 } : {}) } } },
      }) as unknown as Doc<"progress">;
    expect(payXpBefore([row(false)], MON)).toBe(0);
    expect(payXpBefore([row(true)], MON)).toBe(10);
  });

  test("a thing's name, price and stock; the week a pay is for", () => {
    expect(itemProblem({ n: " 🍦  Ice cream ", p: 150, st: null })).toBeNull();
    expect(itemProblem({ n: "  ", p: 150, st: null })).toMatch(/name/);
    expect(itemProblem({ n: "x".repeat(41), p: 150, st: null })).toMatch(/40 letters/);
    expect(itemProblem({ n: "Pen", p: 0, st: null })).toMatch(/price/);
    expect(itemProblem({ n: "Pen", p: 2.5, st: null })).toMatch(/price/);
    expect(itemProblem({ n: "Pen", p: 20, st: -1 })).toMatch(/How many/);
    expect(itemProblem({ n: "Pen", p: 20, st: 0 })).toBeNull();
    expect(payWeek(MON)).toBe("2–8 Nov");
    expect(payWeek(at("2026-12-07T00:00:00+05:30"))).toBe("30 Nov – 6 Dec");
  });
});

const fresh = () => convexTest(schema, import.meta.glob("../convex/**/*.ts"));
const FAM_A = "family-phone-coins-a-0123456789abcdefghij";
const FAM_B = "family-phone-coins-b-0123456789abcdefghij";
const MANAGER = "manager-phone-coins-0123456789abcdefghijklmn";
const CORRECTOR = "corrector-phone-coins-0123456789abcdefghijk";

describe("the coins and the Shop on the server", () => {
  let raw: ReturnType<typeof fresh>;
  let t: Awaited<ReturnType<typeof asOwner>>;
  let u08: Id<"units">;
  const add = async (name: string) => await t.mutation(api.students.add, { name, grade: 7, term: 1, stage: "master", unitId: u08 });
  /** His workbook levels, written as the class and the phone write them. */
  const levels = async (sid: Id<"students">, list: Lv[]) =>
    await raw.run(async (ctx) => {
      const row = await ctx.db
        .query("progress")
        .withIndex("by_student_unit_stage", (q) => q.eq("studentId", sid).eq("unitId", u08).eq("stage", "master"))
        .first();
      const now = Date.now();
      if (row) await ctx.db.patch(row._id, { m: { q: {}, lv: lvOf(list) }, updatedAt: now });
      else await ctx.db.insert("progress", { studentId: sid, unitId: u08, stage: "master", marks: {}, m: { q: {}, lv: lvOf(list) }, startedAt: now, updatedAt: now });
    });
  const wallet = async (sid: Id<"students">) =>
    await raw.run(async (ctx) => await ctx.db.query("wallets").withIndex("by_sid", (q) => q.eq("sid", sid)).first());
  const setCoins = async (sid: Id<"students">, n: number) =>
    await raw.run(async (ctx) => {
      await ctx.db.insert("wallets", { sid, n, xp: 0, wk: MON, last: 0, paid: n, spent: 0 });
    });
  const joinAs = async (sid: Id<"students">, tok: string) => {
    const code = `link-${tok.slice(0, 24)}`;
    await t.mutation(api.families.makeLink, { studentId: sid, codeHash: secretHash("family-link", code) });
    await raw.mutation(api.family.join, { code, token: tok, label: "Android" });
    return asPhone(raw, tok);
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-10T13:00:00+05:30")); // the Tuesday the Shop came
    raw = fresh();
    t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    u08 = await raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
  });
  afterEach(() => vi.useRealTimers());

  test("the Shop came: last week's pay at once and once; a home Level pays after Checked; marks taken back wait; next Monday", async () => {
    const a = await add("Asha K");
    const b = await add("Bala M");
    const demo = await add("Demo D");
    await raw.run(async (ctx) => await ctx.db.patch(demo, { demo: true }));
    const before = at("2026-10-28T10:00:00+05:30");
    const last = at("2026-11-04T10:00:00+05:30");
    const thisWeek = at("2026-11-09T17:00:00+05:30");
    // Asha: 10 XP before, 25 last week in class, 20 at home not checked yet, 7 this week.
    await levels(a, [[1, 10, before], [2, 25, last], [3, 20, last, true], [4, 7, thisWeek]]);
    // Bala: 30 last week.
    await levels(b, [[1, 30, last]]);
    await levels(demo, [[1, 30, last]]);
    // The fill notices the Shop came once and starts the first pay.
    await raw.mutation(internal.race.fill, {});
    await raw.mutation(internal.race.fill, {});
    const jobs = await raw.run(async (ctx) => (await ctx.db.system.query("_scheduled_functions").collect()).map((j) => j.name));
    expect(jobs.filter((n) => /coins(\.js)?:payday$/.test(n))).toHaveLength(1);
    expect(await raw.mutation(internal.coins.payday, {})).toBe(2);
    expect(await wallet(a)).toMatchObject({ n: 5, xp: 35, wk: MON, last: 5, paid: 5, spent: 0 });
    expect(await wallet(b)).toMatchObject({ n: 6, xp: 30, last: 6 });
    expect(await wallet(demo)).toBeNull();
    // A second run the same week pays nobody twice.
    expect(await raw.mutation(internal.coins.payday, {})).toBe(0);
    expect((await wallet(a))?.n).toBe(5);
    const A = await joinAs(a, FAM_A);
    expect((await A.query(api.family.me, {})).coins).toEqual({ n: 5, wk: MON, last: 5 });
    const shop = await A.query(api.coins.shop, {});
    expect(shop.lines).toEqual([{ at: expect.any(Number), n: 5, k: "pay", w: "2–8 Nov" }]);

    // During the week: her home Level is checked (20), Level 2's marks are taken back to 15, a new 30 in class. Bala's
    // 30 is taken back to 0.
    vi.setSystemTime(new Date("2026-11-12T16:00:00+05:30"));
    await levels(a, [[1, 10, before], [2, 15, last], [3, 20, last, true, true], [4, 7, thisWeek], [5, 30, Date.now()]]);
    await levels(b, [[1, 0, last]]);
    vi.setSystemTime(new Date("2026-11-16T00:15:00+05:30"));
    await raw.mutation(internal.coins.payday, {});
    // Asha: 10 + 15 + 20 + 7 + 30 = 82 before this Monday, 35 paid out: 47 → 9 coins (2 wait).
    expect(await wallet(a)).toMatchObject({ n: 14, xp: 80, wk: NEXT_MON, last: 9, paid: 14 });
    // Bala: 0 against 30 paid out: no pay, and his 6 coins stay.
    expect(await wallet(b)).toMatchObject({ n: 6, xp: 30, wk: NEXT_MON, last: 0 });
    expect((await A.query(api.coins.shop, {})).lines.map((l) => [l.n, l.w])).toEqual([
      [9, "9–15 Nov"],
      [5, "2–8 Nov"],
    ]);
    // The week after, Bala's new 40 fills the gap first: 40 - 30 = 10 → 2 coins.
    vi.setSystemTime(new Date("2026-11-18T16:00:00+05:30"));
    await levels(b, [[1, 0, last], [2, 40, Date.now()]]);
    vi.setSystemTime(new Date("2026-11-23T00:15:00+05:30"));
    await raw.mutation(internal.coins.payday, {});
    expect(await wallet(b)).toMatchObject({ n: 8, xp: 40, last: 2 });
  });

  test("Us XP never pays; a new student's first Monday pays his first week; the owner's limit", async () => {
    const a = await add("Asha K");
    const last = at("2026-11-04T10:00:00+05:30");
    await levels(a, [[1, 20, last]]);
    await raw.run(async (ctx) => {
      await ctx.db.insert("usXp", { sid: a, at: last, xp: 50, k: "c", ref: "c1" });
    });
    await raw.mutation(internal.coins.payday, {});
    expect(await wallet(a)).toMatchObject({ n: 4, xp: 20 });
    // A student who joins on Wednesday: his first Monday pays the week he joined.
    vi.setSystemTime(new Date("2026-11-11T10:00:00+05:30"));
    const late = await add("Chen R");
    await levels(late, [[1, 50, Date.now()]]);
    expect(await t.mutation(api.coins.setLimit, { n: 6 })).toBe(true);
    await expect(t.mutation(api.coins.setLimit, { n: 0 })).rejects.toThrow(/whole number/);
    vi.setSystemTime(new Date("2026-11-16T00:15:00+05:30"));
    await raw.mutation(internal.coins.payday, {});
    // The limit: 10 coins earned, 6 paid, the XP used up.
    expect(await wallet(late)).toMatchObject({ n: 6, xp: 50, last: 6 });
    await t.mutation(api.coins.setLimit, { n: null });
    expect((await t.query(api.coins.items, {})).limit).toBeNull();
  });

  test("the Shop: the owner's things, buying, the gold card, cancel, Given, Coins back, Settings → Shop's numbers", async () => {
    await addPerson(raw, { name: "Mala", token: MANAGER, tabs: ["correction", "manager"] });
    await addPerson(raw, { name: "Kavi", token: CORRECTOR, tabs: ["correction"] });
    const M = asPhone(raw, MANAGER);
    const K = asPhone(raw, CORRECTOR);
    // Only the owner sets the Shop.
    await expect(M.mutation(api.coins.save, { n: "✏️ Owl pencil", p: 30, st: 2, sh: "owl", on: true })).rejects.toThrow();
    await expect(t.mutation(api.coins.save, { n: " ", p: 30, st: 2, sh: "owl", on: true })).rejects.toThrow(/name/);
    const pencil = await t.mutation(api.coins.save, { n: "✏️  Owl pencil", p: 30, st: 2, sh: "owl", on: true });
    const ice = await t.mutation(api.coins.save, { n: "🍦 Ice cream", p: 150, st: null, sh: "treat", on: true });
    const fries = await t.mutation(api.coins.save, { n: "🍗 Chicken fries", p: 400, st: null, sh: "treat", on: false });
    const a = await add("Asha K");
    const b = await add("Bala M");
    await setCoins(a, 200);
    await setCoins(b, 70);
    const A = await joinAs(a, FAM_A);
    const B = await joinAs(b, FAM_B);
    const shop = await A.query(api.coins.shop, {});
    expect(shop.n).toBe(200);
    // Owl things first, then treats, each by price; a hidden thing isn't there.
    expect(shop.items.map((x) => [x.n, x.p, x.st, x.sh])).toEqual([
      ["✏️ Owl pencil", 30, 2, "owl"],
      ["🍦 Ice cream", 150, null, "treat"],
    ]);
    await expect(A.mutation(api.coins.buy, { id: fries, p: 400 })).rejects.toThrow(/கடையில் இல்லை/);
    await expect(A.mutation(api.coins.buy, { id: pencil, p: 20 })).rejects.toThrow(/விலை இப்போது 30/);
    expect(await A.mutation(api.coins.buy, { id: ice, p: 150 })).toMatchObject({ n: 50 });
    await expect(A.mutation(api.coins.buy, { id: ice, p: 150 })).rejects.toThrow(/இன்னும் 100 coins/);
    // His gold card: what, its coins; on the teachers' list with its coins.
    const me = await A.query(api.family.me, {});
    expect(me.coins?.n).toBe(50);
    expect(me.gifts.map((g) => [g.kind, g.what, g.c])).toEqual([["shop", "🍦 Ice cream", 150]]);
    const list = await M.query(api.race.gifts, {});
    expect(list.open.map((g) => [g.n, g.kind, g.what, g.c])).toEqual([["Asha K", "shop", "🍦 Ice cream", 150]]);
    // A pencil, then he changes his mind: coins back, the pencil back in stock.
    await A.mutation(api.coins.buy, { id: pencil, p: 30 });
    expect((await A.query(api.coins.shop, {})).items[0].st).toBe(1);
    const card = (await A.query(api.coins.shop, {})).orders.find((o) => o.what === "✏️ Owl pencil")!;
    expect(await A.mutation(api.coins.cancel, { id: card.id as Id<"gifts"> })).toEqual({ n: 50 });
    expect((await A.query(api.coins.shop, {})).items[0].st).toBe(2);
    // Bala buys both pencils; a third is sold out.
    await B.mutation(api.coins.buy, { id: pencil, p: 30 });
    await B.mutation(api.coins.buy, { id: pencil, p: 30 });
    await expect(A.mutation(api.coins.buy, { id: pencil, p: 30 })).rejects.toThrow(/தீர்ந்துவிட்டது/);
    // The ice cream is given: he can't cancel it any more.
    const iceCard = (await A.query(api.coins.shop, {})).orders[0];
    await M.mutation(api.race.give, { id: iceCard.id as Id<"gifts">, given: true });
    await expect(A.mutation(api.coins.cancel, { id: iceCard.id as Id<"gifts"> })).rejects.toThrow(/ஏற்கனவே/);
    expect((await A.query(api.coins.shop, {})).orders).toEqual([]);
    // Settings → Shop: what to buy, the month's coins, the coins in students' hands.
    const admin = await t.query(api.coins.items, {});
    expect(admin.toBuy).toEqual([{ n: "✏️ Owl pencil", c: 2 }]);
    expect(admin.items.map((x) => [x.n, x.on, x.open])).toEqual([
      ["✏️ Owl pencil", true, 2],
      ["🍦 Ice cream", true, 0],
      ["🍗 Chicken fries", false, 0],
    ]);
    expect(admin.month).toEqual({ paid: 0, spent: 240, back: 30 });
    // The Shop couldn't get a pencil: the Manager gives Bala's coins back (a corrector can't).
    const bOrder = (await B.query(api.coins.shop, {})).orders[0];
    await expect(K.mutation(api.coins.refund, { id: bOrder.id as Id<"gifts"> })).rejects.toThrow();
    expect(await M.mutation(api.coins.refund, { id: bOrder.id as Id<"gifts"> })).toBe(true);
    expect((await B.query(api.coins.shop, {})).n).toBe(40);
    expect((await B.query(api.coins.shop, {})).items[0].st).toBe(1);
    expect((await B.query(api.coins.shop, {})).lines.map((l) => [l.k, l.n])).toEqual([
      ["back", 30],
      ["buy", -30],
      ["buy", -30],
    ]);
    const history = await raw.run(async (ctx) => await ctx.db.query("events").collect());
    expect(history.filter((e) => e.kind.startsWith("shop")).map((e) => e.kind)).toEqual([
      "shop-item",
      "shop-item",
      "shop-item",
      "shop-buy",
      "shop-buy",
      "shop-back",
      "shop-buy",
      "shop-buy",
      "shop-back",
    ]);
  });

  test("five things waiting at most; a thing removed keeps its cards", async () => {
    const gum = await t.mutation(api.coins.save, { n: "🍬 Sweet", p: 1, st: null, sh: "treat", on: true });
    const a = await add("Asha K");
    await setCoins(a, 10);
    const A = await joinAs(a, FAM_A);
    for (let i = 0; i < 5; i++) await A.mutation(api.coins.buy, { id: gum, p: 1 });
    await expect(A.mutation(api.coins.buy, { id: gum, p: 1 })).rejects.toThrow(/5 வரை/);
    await t.mutation(api.coins.drop, { id: gum });
    expect((await A.query(api.coins.shop, {})).items).toEqual([]);
    expect((await A.query(api.family.me, {})).gifts).toHaveLength(5);
  });

  test("photos: a thing's photo shown; a new one replaces and deletes the old; too big refused; the hourly sweep keeps them", async () => {
    const jpeg = (kb: number) => new Blob([new Uint8Array(kb * 1024)], { type: "image/jpeg" });
    const p1 = await raw.run(async (ctx) => await ctx.storage.store(jpeg(30)));
    const p2 = await raw.run(async (ctx) => await ctx.storage.store(jpeg(30)));
    const big = await raw.run(async (ctx) => await ctx.storage.store(jpeg(500)));
    const loose = await raw.run(async (ctx) => await ctx.storage.store(jpeg(30)));
    await expect(t.mutation(api.coins.save, { n: "🦉 Owl sticker", p: 20, st: 50, sh: "owl", on: true, ph: big })).rejects.toThrow(/too big/);
    const id = await t.mutation(api.coins.save, { n: "🦉 Owl sticker", p: 20, st: 50, sh: "owl", on: true, ph: p1 });
    expect((await t.query(api.coins.items, {})).items[0].ph).toMatch(/^https?:/);
    await expect(t.mutation(api.coins.save, { n: "🦉 Owl badge", p: 20, st: 50, sh: "owl", on: true, ph: p1 })).rejects.toThrow(/another thing/);
    // Changed without a photo: it keeps its own.
    await t.mutation(api.coins.save, { id, n: "🦉 Owl sticker", p: 25, st: 50, sh: "owl", on: true });
    expect((await t.query(api.coins.items, {})).items[0]).toMatchObject({ p: 25, ph: expect.stringMatching(/^https?:/) });
    await t.mutation(api.coins.save, { id, n: "🦉 Owl sticker", p: 25, st: 50, sh: "owl", on: true, ph: p2 });
    expect(await raw.run(async (ctx) => await ctx.storage.getUrl(p1))).toBeNull();
    // A day later the sweep deletes a photo nobody uses, never the Shop's.
    vi.setSystemTime(new Date(Date.now() + 25 * 60 * 60_000));
    await raw.mutation(internal.photos.sweep, {});
    expect(await raw.run(async (ctx) => await ctx.storage.getUrl(loose))).toBeNull();
    expect(await raw.run(async (ctx) => await ctx.storage.getUrl(p2))).not.toBeNull();
    await t.mutation(api.coins.drop, { id });
    expect(await raw.run(async (ctx) => await ctx.storage.getUrl(p2))).toBeNull();
  });
});
