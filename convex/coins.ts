// The Shop (10 Nov 2026, his voice note: "What do you think about creating the marketplace for the students ... they can
// buy whatever they want, if they have enough money"; his answers): coins, not XP (XP stays his rank and league); every
// Monday last week's XP pays coins (5 XP = 1 coin); three shelves (the free ones come in part 2); buying = the gold card
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
  firstPay,
  ITEM_PHOTO_BYTES,
  itemName,
  itemProblem,
  ITEMS_MAX,
  LIMIT_MAX,
  OPEN_ORDERS_MAX,
  PAY_PER_RUN,
  payLimit,
  shopMonth,
  walletOf,
  weekPay,
  type Shelf,
} from "./lib/coins";
import { DAY_MS, slWeekStart } from "./lib/day";
import { xpRows } from "./lib/family";
import { internalMutation, mutation } from "./lib/fn";

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
      if (w) await ctx.db.patch(w._id, { n: w.n + pay.coins, xp: pay.xp, wk: monday, last: pay.coins, paid: w.paid + pay.coins });
      else await ctx.db.insert("wallets", { sid: s._id, n: pay.coins, xp: pay.xp, wk: monday, last: pay.coins, paid: pay.coins, spent: 0 });
      if (pay.coins > 0) await ctx.db.insert("coinLog", { sid: s._id, at: now, n: pay.coins, k: "pay", w: payWeek(monday) });
    }
    if (left) await ctx.scheduler.runAfter(0, internal.coins.payday, {});
    return done;
  },
});

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
/** One change to his coins: a Monday's pay (+), a thing bought (−), coins given back (+). */
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
