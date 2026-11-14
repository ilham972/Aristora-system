// The Shop (10 Nov 2026, his voice note: "What do you think about creating the marketplace for the students ... they can
// buy whatever they want, if they have enough money"; his answers): coins, not XP (XP stays his: his all-time lists); every
// Monday last week's XP pays coins (5 XP = 1 coin), and since 11 Nov 2026 each grade's weekly #1 wins the owner's coins on
// top (race.week keeps them, payday adds them); three shelves (the free ones come in part 2); buying = the gold card
// he shows in class, a teacher taps Given (race.give, Settings → Race). The rules: convex/lib/coins.ts. Functions:
//   payday (internal: Monday 00:15 in Sri Lanka, crons.ts; once when the Shop came, race.fill) -> each student's pay,
//                  20 a run, the next run at once while some are left; a student without a wallet gets last week's pay.
//   shop (family) -> the Shop on his phone: his coins, the things on the phones, what he bought and waits for, his lines.
//   buy, cancel (family) -> a thing for his coins (his gold card, the stock down); cancel before it is given (coins back).
//   items (owner) -> Settings → Shop: every thing, the coins paid and spent this month, the coins in students' hands.
//   photoUrl, save, drop, setLimit (owner) -> a thing's photo, a thing added or changed, removed; the most coins a week.
//   refund (owner, Manager) -> a thing bought given back as coins (the Shop couldn't get it; Settings → Race).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx } from "./_generated/server";
import { actor, familyActor, familyViewer, viewer } from "./lib/auth";
import { fail, log } from "./lib/backend";
import {
  chestSet,
  firstPay,
  ITEM_PHOTO_BYTES,
  itemName,
  itemProblem,
  ITEMS_MAX,
  LIMIT_MAX,
  OPEN_ORDERS_MAX,
  PAY_PER_RUN,
  payLimit,
  payXpBefore,
  shopMonth,
  walletOf,
  weekPay,
  type Shelf,
} from "./lib/coins";
import { bookFor, masterState, progressFor } from "./lib/backend";
import { DAY_MS, slDayNo, slWeekStart } from "./lib/day";
import { unitNumber, xpRows } from "./lib/family";
import { internalMutation, mutation } from "./lib/fn";
import {
  CHEST_MAX,
  chestCoins,
  KEPT_MAX,
  questsDone,
  questsOf,
  roadChestLevels,
  roadChestState,
  shieldNeeded,
  SHIELD_MAX,
  type ChestSet,
} from "./lib/quests";
import { OL } from "./lib/syllabus";

const token = v.optional(v.string());
const shelf = v.union(v.literal("owl"), v.literal("treat"));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2–8 Nov": the week a Monday's pay is for (the week before that Monday, Sri Lanka). */
export function payWeek(monday: number): string {
  const day = (t: number) => new Date(t + 330 * 60_000);
  const a = day(monday - 7 * DAY_MS);
  const b = day(monday - DAY_MS);
  return a.getUTCMonth() === b.getUTCMonth()
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`
    : `${a.getUTCDate()} ${MONTHS[a.getUTCMonth()]} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]}`;
}

/**
 * Pay day: each real student's pay for the weeks before this Monday (convex/lib/coins.ts weekPay, or firstPay for a
 * student without a wallet: last week only). A student paid this week already is skipped, so a run that stopped half
 * way, or a second run, pays nobody twice.
 */
export const payday = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const monday = slWeekStart(now);
    const limit = await payLimit(ctx);
    const students = (await ctx.db.query("students").collect()).filter((s) => !s.archived && !s.demo);
    // The weekly coins (11 Nov 2026): each grade's winner of the week before, kept by race.week (00:05) with that week.
    const kept = await ctx.db
      .query("raceWeeks")
      .withIndex("by_wk", (q) => q.eq("wk", monday - 7 * DAY_MS))
      .first();
    const wins = new Map((kept?.cw ?? []).map((x) => [x.sid as string, x]));
    let done = 0;
    let left = false;
    for (const s of students) {
      const w = await walletOf(ctx, s._id);
      if (w && w.wk >= monday) continue;
      if (done >= PAY_PER_RUN) {
        left = true;
        break;
      }
      done++;
      const rows = await xpRows(ctx, s._id);
      const pay = w ? weekPay(rows, w.xp, monday, limit) : firstPay(rows, monday, limit);
      // His grade's weekly coins on top (never under the owner's weekly limit: a prize, not pay).
      const win = wins.get(s._id)?.c ?? 0;
      const got = pay.coins + win;
      if (w) await ctx.db.patch(w._id, { n: w.n + got, xp: pay.xp, wk: monday, last: got, paid: w.paid + got });
      else await ctx.db.insert("wallets", { sid: s._id, n: got, xp: pay.xp, wk: monday, last: got, paid: got, spent: 0 });
      if (pay.coins > 0) await ctx.db.insert("coinLog", { sid: s._id, at: now, n: pay.coins, k: "pay", w: payWeek(monday) });
      if (win > 0) await ctx.db.insert("coinLog", { sid: s._id, at: now + 1, n: win, k: "win", w: `Grade ${wins.get(s._id)?.g ?? ""} · #1 · ${payWeek(monday)}` });
    }
    if (left) await ctx.scheduler.runAfter(0, internal.coins.payday, {});
    return done;
  },
});

/**
 * His grade's weekly coins (11 Nov 2026) when this Monday's pay already reached his wallet (race.week ran after
 * payday): added at once, with their line. Otherwise payday adds them with his pay (never both: payday only pays a
 * wallet not yet paid this Monday).
 */
export async function winNow(ctx: MutationCtx, sid: Id<"students">, c: number, g: number, wk: number, now: number): Promise<void> {
  const monday = slWeekStart(now);
  const w = await walletOf(ctx, sid);
  if (!w || w.wk < monday || c <= 0) return;
  await ctx.db.patch(w._id, { n: w.n + c, last: w.last + c, paid: w.paid + c });
  await ctx.db.insert("coinLog", { sid, at: now, n: c, k: "win", w: `Grade ${g} · #1 · ${payWeek(wk + 7 * DAY_MS)}` });
}

/** The Shop came (10 Nov 2026): the first pay at once, not next Monday (once: meta "coinsStart"; race.fill calls it). */
export async function coinsOnce(ctx: MutationCtx, now: number): Promise<void> {
  const had = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "coinsStart"))
    .first();
  if (had) return;
  await ctx.db.insert("meta", { key: "coinsStart", value: { at: now } });
  await ctx.scheduler.runAfter(0, internal.coins.payday, {});
}

/** A thing on a phone: its name, price, how many are left (null = no end), its shelf, its photo's address. */
export type ShopItem = { id: string; n: string; p: number; st: number | null; sh: Shelf; ph: string | null };
/** A thing he bought and waits for (his gold card until a teacher taps Given). */
export type ShopOrder = { id: string; what: string; c: number; at: number };
/** One change to his coins: a Monday's pay (+), his grade's weekly coins (+, 11 Nov 2026), a thing bought (−), coins given back (+). */
export type CoinLine = { at: number; n: number; k: Doc<"coinLog">["k"]; w: string | null };
/** The Shop on his phone. */
export type FamilyShop = { n: number; wk: number; last: number; items: ShopItem[]; orders: ShopOrder[]; lines: CoinLine[] };

/** Lines shown on his phone, newest first. */
const LINES_SHOWN = 12;

async function photoOf(ctx: { storage: { getUrl(id: Id<"_storage">): Promise<string | null> } }, ph: Id<"_storage"> | undefined) {
  return ph ? await ctx.storage.getUrl(ph) : null;
}

/** The Shop on his phone: his coins, the things on the phones (shelf, then price), what he waits for, his last lines. */
export const shop = query({
  args: { token },
  handler: async (ctx, args): Promise<FamilyShop> => {
    const s = await familyViewer(ctx, args.token);
    const w = await walletOf(ctx, s._id);
    const on = await ctx.db
      .query("shopItems")
      .withIndex("by_on", (q) => q.eq("on", true))
      .collect();
    const items: ShopItem[] = [];
    for (const x of on.sort((a, b) => (a.sh === b.sh ? a.p - b.p || a.at - b.at : a.sh === "owl" ? -1 : 1)))
      items.push({ id: x._id, n: x.n, p: x.p, st: x.st ?? null, sh: x.sh, ph: await photoOf(ctx, x.ph) });
    const orders = (
      await ctx.db
        .query("gifts")
        .withIndex("by_sid", (q) => q.eq("sid", s._id).eq("open", true))
        .collect()
    )
      .filter((g) => g.kind === "shop")
      .map((g) => ({ id: g._id, what: g.what, c: g.c ?? 0, at: g.at }));
    const lines = (
      await ctx.db
        .query("coinLog")
        .withIndex("by_sid", (q) => q.eq("sid", s._id))
        .order("desc")
        .take(LINES_SHOWN)
    ).map((l) => ({ at: l.at, n: l.n, k: l.k, w: l.w ?? null }));
    return { n: w?.n ?? 0, wk: w?.wk ?? 0, last: w?.last ?? 0, items, orders, lines };
  },
});

/**
 * He buys a thing (`p` = the price his phone showed: a price changed since is said, never charged). His coins go down,
 * one less in stock, and his gold card shows until a teacher taps Given. His limits are said in Tamil.
 */
export const buy = mutation({
  args: { token, id: v.id("shopItems"), p: v.number() },
  handler: async (ctx, args): Promise<{ n: number; id: string }> => {
    const s = await familyActor(ctx, args.token);
    const x = await ctx.db.get(args.id);
    if (!x || !x.on) fail("இது இப்போது கடையில் இல்லை.");
    if (x.p !== args.p) fail(`இதன் விலை இப்போது ${x.p} coins. மீண்டும் பார்.`);
    if (x.st !== undefined && x.st <= 0) fail("இது தீர்ந்துவிட்டது!");
    const w = await walletOf(ctx, s._id);
    const have = w?.n ?? 0;
    if (!w || have < x.p) fail(`இன்னும் ${x.p - have} coins வேண்டும்.`);
    const open = (
      await ctx.db
        .query("gifts")
        .withIndex("by_sid", (q) => q.eq("sid", s._id).eq("open", true))
        .collect()
    ).filter((g) => g.kind === "shop").length;
    if (open >= OPEN_ORDERS_MAX) fail(`முதலில் வாங்கியதை ஆசிரியரிடம் பெற்றுக்கொள் (${OPEN_ORDERS_MAX} வரை ஒரே நேரத்தில்).`);
    const now = Date.now();
    await ctx.db.patch(w._id, { n: w.n - x.p, spent: w.spent + x.p });
    if (x.st !== undefined) await ctx.db.patch(x._id, { st: x.st - 1 });
    const id = await ctx.db.insert("gifts", {
      sid: s._id,
      n: s.name,
      ...(typeof s.grade === "number" ? { g: s.grade } : {}),
      wk: slWeekStart(now),
      kind: "shop",
      what: x.n,
      at: now,
      open: true,
      c: x.p,
      item: x._id,
    });
    await ctx.db.insert("coinLog", { sid: s._id, at: now, n: -x.p, k: "buy", w: x.n });
    await log(ctx, null, now, { kind: "shop-buy", studentId: s._id, name: s.name, value: `${x.n} · ${x.p} coins` });
    return { n: w.n - x.p, id };
  },
});

/** A thing bought and not yet given goes back: his coins come back, one more in stock (if the thing is still there). */
async function giveBack(ctx: MutationCtx, g: Doc<"gifts">, now: number): Promise<number> {
  const c = g.c ?? 0;
  await ctx.db.delete(g._id);
  const w = await walletOf(ctx, g.sid);
  const n = (w?.n ?? 0) + c;
  if (w) await ctx.db.patch(w._id, { n, spent: Math.max(0, w.spent - c) });
  else await ctx.db.insert("wallets", { sid: g.sid, n: c, xp: 0, wk: 0, last: 0, paid: 0, spent: 0 });
  const item = g.item ? await ctx.db.get(g.item) : null;
  if (item && item.st !== undefined) await ctx.db.patch(item._id, { st: item.st + 1 });
  if (c > 0) await ctx.db.insert("coinLog", { sid: g.sid, at: now, n: c, k: "back", w: g.what });
  return n;
}

/** He changed his mind before it was given: his coins come back. */
export const cancel = mutation({
  args: { token, id: v.id("gifts") },
  handler: async (ctx, args): Promise<{ n: number }> => {
    const s = await familyActor(ctx, args.token);
    const g = await ctx.db.get(args.id);
    if (!g || g.sid !== s._id || g.kind !== "shop") fail("இது இப்போது இல்லை.");
    if (!g.open) fail("இது ஏற்கனவே உனக்குத் தரப்பட்டது.");
    const now = Date.now();
    const n = await giveBack(ctx, g, now);
    await log(ctx, null, now, { kind: "shop-back", studentId: s._id, name: s.name, value: `${g.what} · ${g.c ?? 0} coins (he cancelled)` });
    return { n };
  },
});

/** A thing bought given back as coins by a teacher (the Shop couldn't get it): Settings → Race → Gifts to give. */
export const refund = mutation({
  args: { token, id: v.id("gifts"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["manager"], args.by);
    const g = await ctx.db.get(args.id);
    if (!g || g.kind !== "shop") fail("That isn't here any more.");
    if (!g.open) fail("It was given already: Undo first.");
    const now = Date.now();
    await giveBack(ctx, g, now);
    await log(ctx, null, now, { kind: "shop-back", by: me.name, studentId: g.sid, name: g.n, value: `${g.what} · ${g.c ?? 0} coins` });
    return true;
  },
});

/** A thing in Settings → Shop: everything about it, and how many wait to be given. */
export type ShopAdminItem = ShopItem & { on: boolean; open: number };
export type ShopAdmin = {
  items: ShopAdminItem[];
  /** The most coins a week (null = no limit). */
  limit: number | null;
  /** Coins this month (Sri Lanka): paid on Mondays, spent in the Shop, given back. */
  month: { paid: number; spent: number; back: number };
  /** Coins in students' hands now, and how many students have a wallet. */
  held: number;
  wallets: number;
  /** Things bought and not yet given, by name ("🍦 Ice cream" × 6): what to buy. */
  toBuy: { n: string; c: number }[];
  /** The chests and the flame shield (14 Nov 2026): the day's chest, a road chest, the shield's price (0 = off). */
  chests: ChestSet;
};

/** Settings → Shop (the owner): every thing, the month's coins, the coins in students' hands, what to buy. */
export const items = query({
  args: { token },
  handler: async (ctx, args): Promise<ShopAdmin> => {
    await viewer(ctx, args.token, "owner");
    const now = Date.now();
    const open = (
      await ctx.db
        .query("gifts")
        .withIndex("by_open", (q) => q.eq("open", true))
        .collect()
    ).filter((g) => g.kind === "shop");
    const waiting = new Map<string, number>();
    const byName = new Map<string, number>();
    for (const g of open) {
      if (g.item) waiting.set(g.item, (waiting.get(g.item) ?? 0) + 1);
      byName.set(g.what, (byName.get(g.what) ?? 0) + 1);
    }
    const all = await ctx.db.query("shopItems").collect();
    const items: ShopAdminItem[] = [];
    for (const x of all.sort((a, b) => (a.sh === b.sh ? a.p - b.p || a.at - b.at : a.sh === "owl" ? -1 : 1)))
      items.push({ id: x._id, n: x.n, p: x.p, st: x.st ?? null, sh: x.sh, ph: await photoOf(ctx, x.ph), on: x.on, open: waiting.get(x._id) ?? 0 });
    const m = await shopMonth(ctx, now);
    return {
      items,
      limit: await payLimit(ctx),
      month: { paid: m.paid, spent: m.spent, back: m.back },
      held: m.held,
      wallets: m.wallets,
      toBuy: [...byName].map(([n, c]) => ({ n, c })).sort((a, b) => b.c - a.c || a.n.localeCompare(b.n)),
      chests: await chestSet(ctx),
    };
  },
});

/** An address for one thing's photo (the owner's phone sends it there, then saves the thing with it). */
export const photoUrl = mutation({
  args: { token },
  handler: async (ctx, args): Promise<string> => {
    await actor(ctx, args.token, ["owner"]);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * A thing added (no `id`) or changed: its name, price in coins, how many (null = no end), shelf, on the phones or not,
 * and its photo (`ph`: a new file; null = no photo; missing = as it was). A photo replaced is deleted.
 */
export const save = mutation({
  args: {
    token,
    id: v.optional(v.id("shopItems")),
    n: v.string(),
    p: v.number(),
    st: v.union(v.number(), v.null()),
    sh: shelf,
    on: v.boolean(),
    ph: v.optional(v.union(v.id("_storage"), v.null())),
  },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const why = itemProblem(args);
    if (why) fail(why);
    const old = args.id ? await ctx.db.get(args.id) : null;
    if (args.id && !old) fail("That thing isn't in the Shop any more.");
    if (!old && (await ctx.db.query("shopItems").collect()).length >= ITEMS_MAX) fail(`${ITEMS_MAX} things at most: remove one first.`);
    if (args.ph) {
      const meta = await ctx.db.system.get(args.ph);
      if (!meta) fail("The photo didn't arrive. Pick it again.");
      if (meta.size > ITEM_PHOTO_BYTES || !(meta.contentType ?? "").startsWith("image/")) fail("That photo is too big. Pick it again.");
      const used = (await ctx.db.query("shopItems").collect()).some((x) => x.ph === args.ph && x._id !== old?._id);
      if (used) fail("That photo is on another thing. Pick it again.");
    }
    const now = Date.now();
    const n = itemName(args.n);
    const fields = { n, p: args.p, sh: args.sh, on: args.on, ...(args.st === null ? {} : { st: args.st }) };
    let id: Id<"shopItems">;
    if (old) {
      const ph = args.ph === undefined ? old.ph : (args.ph ?? undefined);
      if (old.ph && old.ph !== ph) await ctx.storage.delete(old.ph);
      await ctx.db.replace(old._id, { ...fields, ...(ph ? { ph } : {}), at: old.at });
      id = old._id;
    } else id = await ctx.db.insert("shopItems", { ...fields, ...(args.ph ? { ph: args.ph } : {}), at: now });
    const left = args.st === null ? "no end" : `${args.st} left`;
    await log(ctx, null, now, { kind: "shop-item", by: me.name, value: `${old ? "changed" : "added"} ${n}: ${args.p} coins, ${left}${args.on ? "" : ", hidden"}` });
    return id;
  },
});

/** A thing removed from the Shop (its photo too). What was bought stays on the cards until Given. */
export const drop = mutation({
  args: { token, id: v.id("shopItems") },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const x = await ctx.db.get(args.id);
    if (!x) return true;
    if (x.ph) await ctx.storage.delete(x.ph);
    await ctx.db.delete(x._id);
    await log(ctx, null, Date.now(), { kind: "shop-item", by: me.name, value: `removed ${x.n}` });
    return true;
  },
});

/** The most coins one student gets in a week (null = no limit: his answer, 10 Nov 2026). */
export const setLimit = mutation({
  args: { token, n: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    if (args.n !== null && (!Number.isInteger(args.n) || args.n < 1 || args.n > LIMIT_MAX)) fail(`A whole number of coins, 1 to ${LIMIT_MAX.toLocaleString("en")}.`);
    const m = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "coinLimit"))
      .first();
    if (m) await ctx.db.patch(m._id, { value: { n: args.n } });
    else await ctx.db.insert("meta", { key: "coinLimit", value: { n: args.n } });
    await log(ctx, null, Date.now(), { kind: "shop-limit", by: me.name, value: args.n === null ? "none" : String(args.n) });
    return true;
  },
});

// ---- The chests and the flame shield (14 Nov 2026, convex/lib/quests.ts) ----

/** Shields he may hold at once. */
export const SHIELDS_MAX = 1;

/**
 * His wallet; a new one for a student who has none yet (a chest before his first pay day): the XP from before this week
 * counts as paid out, so his first Monday still pays only his last week (firstPay's rule), never everything before.
 */
async function walletFor(ctx: MutationCtx, sid: Id<"students">, now: number): Promise<Doc<"wallets">> {
  const w = await walletOf(ctx, sid);
  if (w) return w;
  const xp = payXpBefore(await xpRows(ctx, sid), slWeekStart(now));
  const id = await ctx.db.insert("wallets", { sid, n: 0, xp, wk: 0, last: 0, paid: 0, spent: 0 });
  return (await ctx.db.get(id))!;
}

/** Today's chest: his three quests done (worked out here again), once a day; a few coins, not always the same. */
export const chest = mutation({
  args: { token },
  handler: async (ctx, args): Promise<{ c: number; n: number }> => {
    const s = await familyActor(ctx, args.token);
    const now = Date.now();
    const set = await chestSet(ctx);
    if (set.d <= 0) fail("இன்றைய பெட்டி இப்போது இல்லை.");
    const day = slDayNo(now);
    if ((await walletOf(ctx, s._id))?.cd === day) fail("இன்றைய பெட்டியை ஏற்கனவே திறந்தாய். நாளை மீண்டும்!");
    if (!questsDone(questsOf(await xpRows(ctx, s._id), now))) fail("முதலில் இன்றைய மூன்று சவால்களையும் முடி.");
    const w = await walletFor(ctx, s._id, now);
    const c = chestCoins(set.d, Math.random());
    await ctx.db.patch(w._id, { n: w.n + c, paid: w.paid + c, cd: day });
    await ctx.db.insert("coinLog", { sid: s._id, at: now, n: c, k: "chest", w: "Today's quests" });
    return { c, n: w.n + c };
  },
});

/** A road chest: after Level n of a Stage's workbook (every 3rd, never the last), once, that Level finished since the chests came. */
export const roadChest = mutation({
  args: { token, unitId: v.string(), n: v.number() },
  handler: async (ctx, args): Promise<{ c: number; n: number }> => {
    const s = await familyActor(ctx, args.token);
    const now = Date.now();
    const set = await chestSet(ctx);
    if (set.r <= 0) fail("பெட்டிகள் இப்போது இல்லை.");
    const unitId = ctx.db.normalizeId("units", args.unitId);
    const unit = unitId ? await ctx.db.get(unitId) : null;
    if (!unitId || !unit) fail("That Stage is not here.");
    const had = await ctx.db
      .query("chests")
      .withIndex("by_sid", (q) => q.eq("sid", s._id).eq("u", unitId))
      .collect();
    if (had.some((c) => c.n === args.n)) fail("இந்தப் பெட்டியை ஏற்கனவே திறந்தாய்.");
    const book = await bookFor(ctx, unitId, "master");
    const levels = book && book.data.kind === "master" ? book.data.levels.map((l) => l.n) : [];
    if (!roadChestLevels(levels).includes(args.n)) fail("இங்கே பெட்டி இல்லை.");
    if (roadChestState(masterState(await progressFor(ctx, s._id, unitId, "master")), args.n) !== "ready") fail(`முதலில் Level ${args.n} ஐ முடி.`);
    const w = await walletFor(ctx, s._id, now);
    const c = set.r;
    await ctx.db.patch(w._id, { n: w.n + c, paid: w.paid + c });
    await ctx.db.insert("chests", { sid: s._id, u: unitId, n: args.n, at: now, c });
    const where = unit.grade === OL ? unit.ta : `Stage ${unitNumber(unit.code)}`;
    await ctx.db.insert("coinLog", { sid: s._id, at: now, n: c, k: "chest", w: `${where} · Level ${args.n}` });
    return { c, n: w.n + c };
  },
});

/** He buys a flame shield (`p` = the price his phone showed): one at a time; it costs the centre nothing. */
export const buyShield = mutation({
  args: { token, p: v.number() },
  handler: async (ctx, args): Promise<{ n: number }> => {
    const s = await familyActor(ctx, args.token);
    const set = await chestSet(ctx);
    if (set.s <= 0) fail("Shield இப்போது கடையில் இல்லை.");
    if (set.s !== args.p) fail(`இதன் விலை இப்போது ${set.s} coins. மீண்டும் பார்.`);
    const w = await walletOf(ctx, s._id);
    if ((w?.sh ?? 0) >= SHIELDS_MAX) fail("உன்னிடம் ஏற்கனவே ஒரு shield உள்ளது.");
    const have = w?.n ?? 0;
    if (!w || have < set.s) fail(`இன்னும் ${set.s - have} coins வேண்டும்.`);
    const now = Date.now();
    await ctx.db.patch(w._id, { n: w.n - set.s, spent: w.spent + set.s, sh: (w.sh ?? 0) + 1 });
    await ctx.db.insert("coinLog", { sid: s._id, at: now, n: -set.s, k: "buy", w: "🛡 Flame shield" });
    await log(ctx, null, now, { kind: "shop-buy", studentId: s._id, name: s.name, value: `🛡 Flame shield · ${set.s} coins` });
    return { n: w.n - set.s };
  },
});

/**
 * Every night (00:01 in Sri Lanka): a shield keeps the flame of each student who holds one and had no Level yesterday
 * while his flame was alive the day before (convex/lib/quests.ts shieldNeeded). Only the wallets holding a shield.
 */
export const shields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = slDayNo(Date.now());
    let used = 0;
    for (const w of await ctx.db
      .query("wallets")
      .withIndex("by_sh", (q) => q.gt("sh", 0))
      .collect()) {
      const kept = w.sd ?? [];
      if (!shieldNeeded(await xpRows(ctx, w.sid), kept, today)) continue;
      await ctx.db.patch(w._id, { sh: (w.sh ?? 1) - 1, sd: [...kept, today - 1].slice(-KEPT_MAX) });
      used++;
    }
    return used;
  },
});

/** The owner's chests and shield (Settings → Shop): the day's chest, a road chest (coins), the shield's price; 0 = off. */
export const setChests = mutation({
  args: { token, d: v.number(), r: v.number(), s: v.number() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const whole = (x: number, max: number) => Number.isInteger(x) && x >= 0 && x <= max;
    if (!whole(args.d, CHEST_MAX) || !whole(args.r, CHEST_MAX)) fail(`A chest: a whole number of coins, 0 to ${CHEST_MAX}.`);
    if (!whole(args.s, SHIELD_MAX)) fail(`The shield: a whole number of coins, 0 to ${SHIELD_MAX}.`);
    const value: ChestSet = { d: args.d, r: args.r, s: args.s };
    const m = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "chests"))
      .first();
    if (m) await ctx.db.patch(m._id, { value });
    else await ctx.db.insert("meta", { key: "chests", value });
    await log(ctx, null, Date.now(), { kind: "shop-chests", by: me.name, value: `day ${args.d} · road ${args.r} · shield ${args.s}` });
    return true;
  },
});
