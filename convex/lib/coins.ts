// The Shop's coins (10 Nov 2026, his voice note: "students always have questions like, I have diamonds and I don't know
// what to do with the diamonds"; his answers). XP stays his rank and his league: never spent, never down. Coins are his
// money: every Monday last week's XP pays coins (5 XP = 1 coin, his rate; what is left over waits for the next Monday),
// and buying in the Shop lowers his coins only (his answer: "Only his coins"). The guards (told him, his yes):
// - Us XP never pays (a comment must never turn into chips): only the XP of Levels and class work (xpRows).
// - A workbook Level done at home pays once a teacher checked it in class (⌂ → Checked): copying a friend's answers
//   from WhatsApp earns nothing until then. Class work pays at once.
// - Marks taken back after a pay come off the next pays: the XP paid out (`xp` on his wallet) stays where it was, so new
//   XP fills the gap first. The coins he has never go down by themselves; only buying lowers them.
// - No limit on a week's pay (his answer, after the warning that a boy doing 3 Levels a day costs ~Rs 470 a month); the
//   owner's escape hatch: a most-coins-a-week number in Settings → Shop (off unless he sets it).
// - The first pay (the Shop came on 10 Nov 2026, or a new student's first Monday) pays only last week's XP (his answer:
//   "Last week's pay"): what he earned before stays XP, never coins (paying everything ever was the biggest one-day cost).

import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { DAY_MS, slMonthStart } from "./day";
import { xpItems } from "./family";

/** His rate (10 Nov 2026): 5 XP pay 1 coin. */
export const XP_PER_COIN = 5;
/** Students paid in one run of the payday (each reads his own rows: a run stays small), the next run at once. */
export const PAY_PER_RUN = 20;
/** Things one student may have bought and not yet been given, at once. */
export const OPEN_ORDERS_MAX = 5;
/** A thing's name (with its emoji), in letters. */
export const ITEM_NAME_MAX = 40;
/** The most a thing may cost, in coins. */
export const PRICE_MAX = 100_000;
/** The most of one thing in stock. */
export const STOCK_MAX = 10_000;
/** The most things in the Shop at once. */
export const ITEMS_MAX = 40;
/** A thing's photo, made small on the owner's phone (~640 px): its file at most. */
export const ITEM_PHOTO_BYTES = 400 * 1024;
/** The owner's limit on a week's pay (coins), at most. */
export const LIMIT_MAX = 10_000;

export type Shelf = "owl" | "treat";

/**
 * The XP that pays, won before a moment: the XP rule itself (xpItems in convex/lib/family.ts, so the two never drift
 * apart) without a workbook Level he checked at home that no teacher has checked in class yet. A Level counts with its
 * marks now (the corrector's check may have changed them). The half marks of a second try (`rh`, 10 Nov 2026: inside
 * the level's marks) pay with their level (for a home Level not checked yet, its +rh and −rh cancel out until then);
 * marks won back before that rule, and a tute's ladder checked at home, count at once (no class check exists for them).
 */
export function payXpBefore(rows: Doc<"progress">[], before: number): number {
  return xpItems(rows, true).reduce((a, i) => (i.t < before ? a + i.xp : a), 0);
}

/**
 * A pay: the XP that pays (`due`) and hasn't paid yet (`paid` = paid out before), in whole coins; the rest waits for
 * the next Monday. Nothing while marks taken back since are still bigger than what came. `limit` = the owner's most coins
 * a week (null = none): XP over it is used up anyway (a limit, not a delay).
 */
export function payFrom(due: number, paid: number, limit: number | null): { coins: number; xp: number } {
  const free = due - paid;
  if (free < XP_PER_COIN) return { coins: 0, xp: paid };
  const all = Math.floor(free / XP_PER_COIN);
  return { coins: limit === null ? all : Math.min(all, limit), xp: paid + all * XP_PER_COIN };
}

/** This Monday's pay for a student with a wallet: what he won before this Monday, less what already paid. */
export function weekPay(rows: Doc<"progress">[], paid: number, monday: number, limit: number | null) {
  return payFrom(payXpBefore(rows, monday), paid, limit);
}

/** The first pay (no wallet yet): last week's XP only; what came before it stays XP (counted as paid out). */
export function firstPay(rows: Doc<"progress">[], monday: number, limit: number | null) {
  return payFrom(payXpBefore(rows, monday), payXpBefore(rows, monday - 7 * DAY_MS), limit);
}

/** A thing's name as saved: one line, spaces tidied. */
export const itemName = (s: string) => s.replace(/\s+/g, " ").trim();

/** Why a thing can't be saved like this (null = fine). */
export function itemProblem(x: { n: string; p: number; st: number | null }): string | null {
  const n = itemName(x.n);
  if (!n) return "Type its name.";
  if ([...n].length > ITEM_NAME_MAX) return `Its name in ${ITEM_NAME_MAX} letters at most.`;
  if (!Number.isInteger(x.p) || x.p < 1 || x.p > PRICE_MAX) return `Its price: a whole number of coins, 1 to ${PRICE_MAX.toLocaleString("en")}.`;
  if (x.st !== null && (!Number.isInteger(x.st) || x.st < 0 || x.st > STOCK_MAX)) return `How many: a whole number, 0 to ${STOCK_MAX.toLocaleString("en")} (empty = no end).`;
  return null;
}

/** His wallet (null: never paid yet). */
export async function walletOf(ctx: QueryCtx, sid: Id<"students">): Promise<Doc<"wallets"> | null> {
  return await ctx.db
    .query("wallets")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .first();
}

/** The owner's most coins a week (Settings → Shop; null = no limit, his answer). */
export async function payLimit(ctx: QueryCtx): Promise<number | null> {
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "coinLimit"))
    .first();
  const v = (m?.value as { n?: number | null } | undefined)?.n;
  return typeof v === "number" && v > 0 ? v : null;
}

/** The Shop's coins this month (Sri Lanka): paid on Mondays, spent, given back; coins in students' hands now. */
export async function shopMonth(ctx: QueryCtx, now: number): Promise<{ paid: number; spent: number; back: number; held: number; wallets: number }> {
  const out = { paid: 0, spent: 0, back: 0, held: 0, wallets: 0 };
  for (const l of await ctx.db
    .query("coinLog")
    .withIndex("by_at", (q) => q.gte("at", slMonthStart(now)))
    .collect()) {
    if (l.k === "pay") out.paid += l.n;
    else if (l.k === "buy") out.spent -= l.n;
    else out.back += l.n;
  }
  for (const w of await ctx.db.query("wallets").collect()) {
    out.held += w.n;
    out.wallets++;
  }
  return out;
}
