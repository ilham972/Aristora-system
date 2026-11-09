// Fees kept in step with the class (9 Nov 2026): every mutation that signs a student in or out, or gives or takes back
// a book, ends here (convex/lib/fn.ts), so his ledger always says what happened, whichever page did it: a day he came
// is a class, a printed book given is a book (convex/lib/money.ts feeDiff). Then his account row is rebuilt
// (`accounts`: what the Fees and Books pages and his family phone read). Nothing at all happens until the owner sets
// the fees up (Fees → the first card): before that day nobody is charged for anything.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { dayStartAt, feeDiff, printStage, replay, sumOf, type FeeRow, type PayRate, type Want } from "./money";

/** meta key: the centre's fee, the first day counted, the paper's cost (convex/money.ts setup). */
export const FEES_KEY = "fees";
/** meta key: each person's pay (the owner's only). */
export const STAFF_PAY_KEY = "staffPay";

export type FeeCfg = {
  /** A class, in rupees (his Rs 350). */
  fee: number;
  /** The first day counted ("2026-11-10"): nothing before it is charged. */
  from: string;
  /** What the print shop takes for one paper (his Rs 7). */
  paper: number;
  at: number;
};

export async function feeCfg(ctx: QueryCtx): Promise<FeeCfg | null> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", FEES_KEY))
    .first();
  return (row?.value as FeeCfg | undefined) ?? null;
}

export async function staffRates(ctx: QueryCtx): Promise<Record<string, PayRate>> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", STAFF_PAY_KEY))
    .first();
  return (row?.value as Record<string, PayRate> | undefined) ?? {};
}

export async function accountOf(ctx: QueryCtx, sid: Id<"students">): Promise<Doc<"accounts"> | null> {
  return await ctx.db
    .query("accounts")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .first();
}

export async function feeRowsOf(ctx: QueryCtx, sid: Id<"students">): Promise<Doc<"fees">[]> {
  return await ctx.db
    .query("fees")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .collect();
}

/** A row as the pure rules read it. */
export const asRow = (r: Doc<"fees">): FeeRow => ({
  _id: r._id,
  sid: r.sid,
  k: r.k,
  a: r.a,
  at: r.at,
  day: r.day,
  ...(r.u ? { u: r.u } : {}),
  ...(r.st ? { st: r.st } : {}),
  ...(r.to ? { to: r.to } : {}),
  ...(r.w !== undefined ? { w: r.w } : {}),
  ...(r.np ? { np: true } : {}),
});

export async function shopRow(ctx: QueryCtx, u: Id<"units">, st: "fighter" | "master"): Promise<Doc<"shop"> | null> {
  return await ctx.db
    .query("shop")
    .withIndex("by_book", (q) => q.eq("u", u).eq("st", st))
    .first();
}

/** Is this book one of a topic tute's two (one printed book)? */
async function isTute(ctx: QueryCtx, u: Id<"units">, st: "fighter" | "master", cache: Map<string, boolean>): Promise<boolean> {
  const k = `${u}:${st}`;
  if (!cache.has(k)) {
    const b = await ctx.db
      .query("books")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", u).eq("stage", st))
      .first();
    cache.set(k, !!b?.tute);
  }
  return cache.get(k)!;
}

/** His account row again from his rows (and his name, grade and fee kept on it). */
export async function rebuild(ctx: MutationCtx, sid: Id<"students">, now: number, s?: Doc<"students"> | null): Promise<Doc<"accounts"> | null> {
  const student = s === undefined ? await ctx.db.get(sid) : s;
  const rows = (await feeRowsOf(ctx, sid)).map(asRow);
  const acc = await accountOf(ctx, sid);
  if (!acc && rows.length === 0) return null;
  const sum = sumOf(rows, replay(rows));
  const value = {
    sid,
    name: student?.name ?? acc?.name ?? "?",
    ...(student?.grade !== undefined ? { grade: student.grade } : acc?.grade !== undefined ? { grade: acc.grade } : {}),
    ...(student ? (student.archived ? { gone: true } : {}) : { gone: true }),
    ...sum,
    ...(acc?.fee !== undefined ? { fee: acc.fee } : {}),
    at: now,
  };
  if (acc) {
    await ctx.db.replace(acc._id, value);
    return (await ctx.db.get(acc._id))!;
  }
  const id = await ctx.db.insert("accounts", value);
  return (await ctx.db.get(id))!;
}

/**
 * His charges as the class says (the days he came, the printed books given since the fees began), then his account.
 * A demo or test student is never charged. Returns whether anything changed.
 */
export async function syncOne(ctx: MutationCtx, cfg: FeeCfg, sid: Id<"students">, now: number, cache = new Map<string, boolean>()): Promise<boolean> {
  const s = await ctx.db.get(sid);
  if (!s || s.demo || s.test) return false;
  const fromAt = dayStartAt(cfg.from);
  const visits = await ctx.db
    .query("attendance")
    .withIndex("by_student", (q) => q.eq("studentId", sid).gte("inAt", fromAt))
    .collect();
  const hand = (
    await ctx.db
      .query("handouts")
      .withIndex("by_student", (q) => q.eq("studentId", sid))
      .collect()
  ).filter((h) => h.at >= fromAt && !h.noCopy);
  const want: Want = { days: visits.filter((x) => x.day >= cfg.from).map((x) => ({ day: x.day, at: x.inAt })), books: [] };
  const prices = new Map<string, number | null>();
  for (const h of hand) {
    const st = printStage(h.stage, await isTute(ctx, h.unitId, h.stage, cache));
    const k = `${h.unitId}:${st}`;
    if (!prices.has(k)) prices.set(k, (await shopRow(ctx, h.unitId, st))?.price ?? null);
    want.books.push({ u: h.unitId, st, at: h.at, price: prices.get(k)! });
  }
  const rows = await feeRowsOf(ctx, sid);
  const acc = await accountOf(ctx, sid);
  const { add, drop } = feeDiff(want, rows.map(asRow), acc?.fee ?? cfg.fee);
  if (add.length === 0 && drop.length === 0) {
    // A rename or a removal reaches his account row at his next change; nothing to charge.
    if (acc && (acc.name !== s.name || acc.grade !== s.grade || !!acc.gone !== s.archived)) await rebuild(ctx, sid, now, s);
    return false;
  }
  for (const id of drop) {
    const r = rows.find((x) => x._id === id);
    if (r?.k === "book" && r.u && r.st) await countGiven(ctx, r.u, r.st, -1, now);
    await ctx.db.delete(id as Id<"fees">);
  }
  for (const r of add) {
    if (r.k === "book" && r.u && r.st) await countGiven(ctx, r.u as Id<"units">, r.st, 1, now);
    await ctx.db.insert("fees", {
      sid,
      k: r.k,
      a: r.a,
      day: r.day,
      at: r.at,
      ...(r.u ? { u: r.u as Id<"units"> } : {}),
      ...(r.st ? { st: r.st } : {}),
      ...(r.np ? { np: true } : {}),
    });
  }
  await rebuild(ctx, sid, now, s);
  return true;
}

/** Every student a mutation signed in or out, or gave or took a book from (convex/lib/fn.ts, as it ends). */
export async function syncFees(ctx: MutationCtx, sids: Iterable<string>, now: number): Promise<void> {
  const list = [...new Set(sids)];
  if (list.length === 0) return;
  const cfg = await feeCfg(ctx);
  if (!cfg) return;
  const cache = new Map<string, boolean>();
  for (const sid of list) await syncOne(ctx, cfg, sid as Id<"students">, now, cache);
}

/** A printed book's row, made the first time it is priced, printed, counted or given. */
export async function shopOf(ctx: MutationCtx, u: Id<"units">, st: "fighter" | "master", now: number): Promise<Doc<"shop">> {
  const row = await shopRow(ctx, u, st);
  if (row) return row;
  const id = await ctx.db.insert("shop", { u, st, printed: 0, given: 0, at: now });
  return (await ctx.db.get(id))!;
}

/** One copy more (or fewer: taken back) given to students: the book's stock follows. */
async function countGiven(ctx: MutationCtx, u: Id<"units">, st: "fighter" | "master", n: number, now: number): Promise<void> {
  const row = await shopOf(ctx, u, st, now);
  await ctx.db.patch(row._id, { given: Math.max(0, row.given + n), at: now });
}

/** Copies in hand now (null: nothing printed, given or counted yet). */
export function inHand(r: Pick<Doc<"shop">, "printed" | "given" | "base" | "basePrinted" | "baseGiven">): number | null {
  if (r.base === undefined && r.printed === 0 && r.given === 0) return null;
  return (r.base ?? 0) + (r.printed - (r.basePrinted ?? 0)) - (r.given - (r.baseGiven ?? 0));
}
