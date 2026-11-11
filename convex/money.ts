// The Fees and Books pages on the server (9 Nov 2026, his voice note and answers: the Management department and the owner
// take the students' money and give the printed books; the owner sets each book's price, the app shows its cost; the
// parents hear it in class and on the family app, never by WhatsApp). The rules are in convex/lib/money.ts, the ledger
// kept in step with the class in convex/lib/feeRows.ts.
//
// Who: the Money tick (Settings → People, or the Fees / Books pages on her bar) and the owner. Only the owner: setting
// the fees up, a student's own fee, an old debt or credit, waiving a charge, a book's price, taking back someone
// else's payment, the team's pay, other spending, the Business tab.

import { v } from "convex/values";
import { shopMonth } from "./lib/coins";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { currentSession, fail, getStudent, log, neverCame } from "./lib/backend";
import { DAY_MS, SL_OFFSET_MS, slDay, slDayNo, slMonth, slMonthBefore, slMonthStart } from "./lib/day";
import {
  accountOf,
  asRow,
  feeCfg,
  FEES_KEY,
  feeRowsOf,
  inHand,
  rebuild,
  shopOf,
  shopRow,
  STAFF_PAY_KEY,
  staffRates,
  syncOne,
  type FeeCfg,
} from "./lib/feeRows";
import { mutation } from "./lib/fn";
import {
  addDay,
  dayStartAt,
  FEE_DEFAULT,
  freeFix,
  isCharge,
  monthMoney,
  moneyProblem,
  PAPER_DEFAULT,
  replay,
  rupees,
  staffLine,
  type CashRow,
  type PayRate,
} from "./lib/money";
import { bookStage } from "./schema";

const token = v.optional(v.string());
/** A payment or a print can be taken back by whoever made it for this long (the owner: any time). */
export const TAKE_BACK_MS = 12 * 60 * 60_000;
/** An old debt counts this long after nothing was paid (the Owed list's red, the Business tab's "old"). */
export const OLD_DAYS = 14;

function check(a: number, what: string, zeroOk = false): void {
  const p = moneyProblem(a, what, zeroOk);
  if (p) fail(p);
}

const cfgOut = (c: FeeCfg) => ({ fee: c.fee, from: c.from, paper: c.paper });

/** One account as the lists show it. */
function accOut(a: Doc<"accounts">) {
  return {
    sid: a.sid,
    name: a.name,
    ...(a.grade !== undefined ? { grade: a.grade } : {}),
    ...(a.gone ? { gone: true } : {}),
    owe: a.owe,
    cr: a.cr,
    c: a.c,
    b: a.b,
    o: a.o,
    ...(a.since ? { since: a.since } : {}),
    bu: a.bu,
    np: a.np,
    paid: a.paid,
    ...(a.last !== undefined ? { last: a.last, lastA: a.lastA ?? 0 } : {}),
    ...(a.came ? { came: a.came } : {}),
    ...(a.fee !== undefined ? { fee: a.fee } : {}),
    ...(a.fb ? { fb: true } : {}),
  };
}
export type AccountOut = ReturnType<typeof accOut>;

// ---- Reading ----

/**
 * The Fees page (and the Books page's unpaid books): every account's sums, today's money. Small rows only (never the
 * students' rows, never anyone's whole ledger): it stays open on the phone.
 */
export const board = query({
  args: { token },
  handler: async (ctx, args) => {
    const me = await viewer(ctx, args.token, "money");
    const now = Date.now();
    const today = slDay(now);
    const owner = me.role === "owner";
    const cfg = await feeCfg(ctx);
    if (!cfg) return { on: false as const, today, owner };
    const acc = (await ctx.db.query("accounts").collect()).map(accOut);
    const rows = await ctx.db
      .query("fees")
      .withIndex("by_day", (q) => q.eq("day", today))
      .collect();
    const paid: Record<string, number> = {};
    let inToday = 0;
    let nToday = 0;
    for (const r of rows) {
      if (r.k !== "pay") continue;
      paid[r.sid] = (paid[r.sid] ?? 0) + r.a;
      inToday += r.a;
      nToday++;
    }
    return { on: true as const, today, owner, cfg: cfgOut(cfg), acc, paid, inToday, nToday };
  },
});

/** One student's sheet: his account, his ledger (newest first, each charge with what is still to pay), his books. */
export const student = query({
  args: { token, sid: v.id("students") },
  handler: async (ctx, args) => {
    const me = await viewer(ctx, args.token, "money");
    const cfg = await feeCfg(ctx);
    const acc = await accountOf(ctx, args.sid);
    const rows = await feeRowsOf(ctx, args.sid);
    const led = replay(rows.map(asRow));
    const left = new Map(led.open.map((o) => [o.id, o.a]));
    const hand = await ctx.db
      .query("handouts")
      .withIndex("by_student", (q) => q.eq("studentId", args.sid))
      .collect();
    const now = Date.now();
    return {
      on: !!cfg,
      owner: me.role === "owner",
      me: me.name,
      now,
      fee: acc?.fee ?? cfg?.fee ?? FEE_DEFAULT,
      own: acc?.fee !== undefined,
      freeBooks: !!acc?.fb,
      today: slDay(now),
      from: cfg?.from ?? null,
      owe: led.owe,
      cr: led.credit,
      paid: led.paid,
      rows: rows
        .slice()
        .sort((a, b) => b.at - a.at || (b._id < a._id ? -1 : 1))
        .slice(0, 120)
        .map((r) => ({
          id: r._id,
          k: r.k,
          a: r.a,
          day: r.day,
          at: r.at,
          ...(r.u ? { u: r.u } : {}),
          ...(r.st ? { st: r.st } : {}),
          ...(r.to ? { to: r.to } : {}),
          ...(r.w !== undefined ? { w: r.w } : {}),
          ...(r.np ? { np: true } : {}),
          ...(r.fr ? { fr: true } : {}),
          ...(r.by ? { by: r.by } : {}),
          ...(r.note ? { note: r.note } : {}),
          left: left.get(r._id) ?? 0,
        })),
      books: hand.map((h) => ({ u: h.unitId, st: h.stage, at: h.at, ...(h.noCopy ? { noCopy: true } : {}) })),
    };
  },
});

/**
 * The Books page's printed books: papers, price, printed, given, in hand; the last prints; and every student's printed
 * books in hand (`hand`: student → "unit:stage" keys; never a book opened on his phone only), so the page knows who is
 * covered for his next book.
 */
export const shop = query({
  args: { token },
  handler: async (ctx, args) => {
    const me = await viewer(ctx, args.token, "money");
    const cfg = await feeCfg(ctx);
    const items = (await ctx.db.query("shop").collect()).map((r) => ({
      u: r.u,
      st: r.st,
      ...(r.papers !== undefined ? { papers: r.papers } : {}),
      ...(r.price !== undefined ? { price: r.price } : {}),
      printed: r.printed,
      given: r.given,
      inHand: inHand(r),
      ...(r.baseAt !== undefined ? { countedAt: r.baseAt } : {}),
    }));
    const prints = (await ctx.db.query("cash").collect())
      .filter((c) => c.k === "print")
      .sort((a, b) => b.at - a.at)
      .slice(0, 30)
      .map((c) => ({ id: c._id, u: c.u!, st: c.st!, copies: c.copies ?? 0, papers: c.papers ?? 0, a: c.a, at: c.at, ...(c.by ? { by: c.by } : {}) }));
    const hand: Record<string, string[]> = {};
    for (const h of await ctx.db.query("handouts").collect()) {
      if (h.noCopy) continue;
      (hand[h.studentId] ??= []).push(`${h.unitId}:${h.stage}`);
    }
    return { on: !!cfg, owner: me.role === "owner", me: me.name, now: Date.now(), paper: cfg?.paper ?? PAPER_DEFAULT, items, prints, hand };
  },
});

/** Each person's days this month: marked arrived on the Class tab, or work of hers kept for that day. */
async function daysCame(ctx: QueryCtx, users: Doc<"users">[], from: string, to: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  const add = (uid: string, day: string) => {
    if (!out.has(uid)) out.set(uid, new Set());
    out.get(uid)!.add(day);
  };
  for (const d of await ctx.db
    .query("duty")
    .withIndex("by_day", (q) => q.gte("day", from).lte("day", to))
    .collect()) {
    add(d.userId, d.day);
  }
  const byName = new Map(users.map((u) => [u.name, u._id as string]));
  const n1 = slDayNo(dayStartAt(from));
  const n2 = slDayNo(dayStartAt(to));
  for (const w of await ctx.db
    .query("workDays")
    .withIndex("by_day", (q) => q.gte("day", n1).lte("day", n2))
    .collect()) {
    const day = slDay(w.day * DAY_MS - SL_OFFSET_MS);
    for (const dept of [w.fighter, w.master, w.management]) {
      for (const p of dept.people) {
        const uid = byName.get(p.name);
        if (uid && p.total > 0) add(uid, day);
      }
    }
  }
  return out;
}

/**
 * The owner's Business tab (read on opening, never live): this month and the one before (money in, out, profit, what
 * was charged and collected, books and their printing), money in each of the last 30 days, what students owe and how
 * long, credit held, the team's days and pay, the month's spending, and the money kept since the fees began.
 */
export const business = query({
  args: { token },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const cfg = await feeCfg(ctx);
    const now = Date.now();
    const today = slDay(now);
    if (!cfg) return { on: false as const, today };
    const month = slMonth(now);
    const prevStart = slMonthBefore(slMonthStart(now));
    const prev = slMonth(prevStart);
    const range = async (from: string, to: string) => ({
      fees: (
        await ctx.db
          .query("fees")
          .withIndex("by_day", (q) => q.gte("day", from).lte("day", to))
          .collect()
      ).map(asRow),
      cash: (
        await ctx.db
          .query("cash")
          .withIndex("by_day", (q) => q.gte("day", from).lte("day", to))
          .collect()
      ).map(
        (c): CashRow => ({
          _id: c._id,
          k: c.k,
          a: c.a,
          day: c.day,
          at: c.at,
          ...(c.uid ? { uid: c.uid } : {}),
          ...(c.copies !== undefined ? { copies: c.copies } : {}),
          ...(c.papers !== undefined ? { papers: c.papers } : {}),
        }),
      ),
    });
    const cur = await range(`${month}-01`, today);
    const before = await range(`${prev}-01`, `${prev}-31`);
    // Classes taken off this month because the student never came (Didn't come): who, which day, who took it off.
    const offRows = (
      await ctx.db
        .query("fees")
        .withIndex("by_day", (q) => q.gte("day", `${month}-01`).lte("day", today))
        .collect()
    ).filter((r) => r.k === "off");
    // The last 30 days, each day's money in (oldest first).
    const start30 = addDay(today, -29);
    const in30 = new Map<string, number>();
    for (const r of [...before.fees, ...cur.fees]) if (r.k === "pay" && r.day >= start30) in30.set(r.day, (in30.get(r.day) ?? 0) + r.a);
    const days30 = Array.from({ length: 30 }, (_, i) => {
      const day = addDay(start30, i);
      return { day, a: in30.get(day) ?? 0 };
    });
    const everyAccount = await ctx.db.query("accounts").collect();
    const accounts = everyAccount.filter((a) => !(a.owe === 0 && a.cr === 0 && a.paid === 0));
    const oldDay = addDay(today, -OLD_DAYS);
    const owing = accounts.filter((a) => a.owe > 0);
    const old = owing.filter((a) => a.since !== undefined && a.since <= oldDay);
    const credit = accounts.filter((a) => a.cr > 0);
    const allIn = accounts.reduce((s, a) => s + a.paid, 0);
    const allCash = await ctx.db.query("cash").collect();
    const allOut = allCash.reduce((s, c) => s + c.a, 0);
    // The team: every teacher (and the owner only if he set his own pay), days this month, pay.
    const users = (await ctx.db.query("users").collect()).filter((u) => u.active);
    const rates = await staffRates(ctx);
    const came = await daysCame(ctx, users, `${month}-01`, today);
    const paidTo = new Map<string, number>();
    for (const c of cur.cash) if (c.k === "staff" && c.uid) paidTo.set(c.uid, (paidTo.get(c.uid) ?? 0) + c.a);
    const staff = users
      .filter((u) => u.role === "teacher" || rates[u._id])
      .map((u) => staffLine({ uid: u._id, name: u.name, rate: rates[u._id] ?? null, days: came.get(u._id)?.size ?? 0, paid: paidTo.get(u._id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const names = new Map(users.map((u) => [u._id as string, u.name]));
    const spends = (
      await ctx.db
        .query("cash")
        .withIndex("by_day", (q) => q.gte("day", `${month}-01`).lte("day", today))
        .collect()
    )
      .filter((c) => c.k !== "print")
      .sort((a, b) => b.at - a.at)
      .map((c) => ({ id: c._id, k: c.k, a: c.a, at: c.at, day: c.day, ...(c.uid ? { who: names.get(c.uid) ?? "?" } : {}), ...(c.note ? { note: c.note } : {}) }));
    return {
      on: true as const,
      today,
      month,
      prev,
      cfg: cfgOut(cfg),
      m: monthMoney(cur.fees, cur.cash),
      p: monthMoney(before.fees, before.cash),
      days30,
      owed: {
        a: owing.reduce((s, a) => s + a.owe, 0),
        n: owing.length,
        oldA: old.reduce((s, a) => s + a.owe, 0),
        oldN: old.length,
        crA: credit.reduce((s, a) => s + a.cr, 0),
        crN: credit.length,
      },
      came: accounts.filter((a) => a.came !== undefined && a.came >= `${month}-01`).length,
      allIn,
      allOut,
      staff,
      spends,
      offs: await Promise.all(
        offRows
          .sort((a, b) => b.at - a.at)
          .slice(0, 40)
          .map(async (r) => ({
            // A student with nothing but this line has an empty account, or none yet: his name from his own row then.
            name: everyAccount.find((a) => a.sid === r.sid)?.name ?? (await ctx.db.get(r.sid))?.name ?? "?",
            day: r.day,
            at: r.at,
            ...(r.by ? { by: r.by } : {}),
          })),
      ),
      // The family app's Shop (10 Nov 2026): its coins this month (1 coin = Rs 1 of a thing's price at most).
      shop: await shopMonth(ctx, now),
    };
  },
});

// ---- Setting up ----

/**
 * The owner sets the fees up (the Fees page's first card): a class's fee, the paper's cost, and the first day counted
 * (today or tomorrow; never earlier: nobody is charged for days before the app counted them). Afterwards only the fee
 * and the paper change (from the next class on: a day already charged keeps its fee).
 */
export const setup = mutation({
  args: { token, fee: v.number(), paper: v.number(), start: v.optional(v.union(v.literal("today"), v.literal("tomorrow"))) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    check(args.fee, "class fee");
    check(args.paper, "paper's cost");
    const now = Date.now();
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", FEES_KEY))
      .first();
    const had = (row?.value as FeeCfg | undefined) ?? null;
    if (!had && !args.start) fail("Choose the first day: today or tomorrow.");
    const from = had ? had.from : args.start === "today" ? slDay(now) : addDay(slDay(now), 1);
    const value: FeeCfg = { fee: args.fee, from, paper: args.paper, at: now };
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("meta", { key: FEES_KEY, value });
    // Counting from today: everyone already signed in today gets today's class now.
    if (!had && from === slDay(now)) {
      const cache = new Map<string, boolean>();
      const seen = new Set<string>();
      for (const visit of await ctx.db
        .query("attendance")
        .withIndex("by_day", (q) => q.eq("day", from))
        .collect()) {
        if (seen.has(visit.studentId)) continue;
        seen.add(visit.studentId);
        await syncOne(ctx, value, visit.studentId, now, cache);
      }
    }
    await log(ctx, await currentSession(ctx, now), now, {
      kind: "money-setup",
      by: "money",
      value: `${rupees(args.fee)} a class from ${from}, paper ${rupees(args.paper)}${had && had.fee !== args.fee ? ` (was ${rupees(had.fee)})` : ""}`,
    });
    return cfgOut(value);
  },
});

async function needCfg(ctx: QueryCtx): Promise<FeeCfg> {
  const cfg = await feeCfg(ctx);
  if (!cfg) fail("The owner hasn't set the fees up yet (the Fees page).");
  return cfg;
}

// ---- Money from students ----

/**
 * He paid (his sheet's Paid): `a` rupees, for the charges ticked (`to`; the rest pays his oldest, anything over is his
 * credit). Returns what he owes after it, and his credit.
 */
export const pay = mutation({
  args: { token, sid: v.id("students"), a: v.number(), to: v.optional(v.array(v.id("fees"))) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["money"]);
    await needCfg(ctx);
    check(args.a, "amount");
    const s = await getStudent(ctx, args.sid);
    const now = Date.now();
    const to: Id<"fees">[] = [];
    for (const id of args.to ?? []) {
      const r = await ctx.db.get(id);
      if (!r || r.sid !== s._id || !isCharge(r.k)) fail("Something on his sheet changed. Open it again.");
      if (!to.includes(id)) to.push(id);
    }
    // Everything ticked is paid already (11 Nov 2026: the pad stays on the page, so a second tap, or a second phone
    // with the page from a minute ago, could take the same money twice and call it credit): say so, take nothing.
    if (to.length > 0) {
      const open = new Set(replay((await feeRowsOf(ctx, s._id)).map(asRow)).open.map((o) => o.id));
      if (!to.some((x) => open.has(x))) fail(`${s.name} has paid that already. Look at his name again.`);
    }
    const id = await ctx.db.insert("fees", { sid: s._id, k: "pay", a: args.a, day: slDay(now), at: now, ...(to.length ? { to } : {}), by: me.name });
    const acc = (await rebuild(ctx, s._id, now, s))!;
    await log(ctx, await currentSession(ctx, now), now, { kind: "money-pay", by: "money", studentId: s._id, name: s.name, value: rupees(args.a) });
    return { id, owe: acc.owe, cr: acc.cr };
  },
});

/** A payment typed by mistake taken back: whoever took it within 12 hours, or the owner. */
export const unpay = mutation({
  args: { token, id: v.id("fees") },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["money"]);
    const r = await ctx.db.get(args.id);
    if (!r || r.k !== "pay") fail("That payment is no longer there.");
    const now = Date.now();
    if (me.role !== "owner" && (r.by !== me.name || now - r.at > TAKE_BACK_MS)) fail("Only the owner can take back this payment now.");
    await ctx.db.delete(r._id);
    const s = await ctx.db.get(r.sid);
    const acc = await rebuild(ctx, r.sid, now, s);
    await log(ctx, await currentSession(ctx, now), now, { kind: "money-unpay", by: "money", studentId: r.sid, name: s?.name, value: rupees(r.a) });
    return { owe: acc?.owe ?? 0, cr: acc?.cr ?? 0 };
  },
});

/** The owner waives a charge (a class or a book: counts as nothing), or takes the waiver back. */
export const waive = mutation({
  args: { token, id: v.id("fees"), on: v.boolean() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const r = await ctx.db.get(args.id);
    if (!r || !isCharge(r.k)) fail("That charge is no longer there.");
    const now = Date.now();
    if (args.on === (r.w !== undefined)) return true;
    await ctx.db.patch(r._id, args.on ? { w: now, wb: me.name } : { w: undefined, wb: undefined });
    const s = await ctx.db.get(r.sid);
    await rebuild(ctx, r.sid, now, s);
    await log(ctx, await currentSession(ctx, now), now, {
      kind: args.on ? "money-waive" : "money-unwaive",
      by: "money",
      studentId: r.sid,
      name: s?.name,
      value: `${r.k === "class" ? `class ${r.day}` : r.k === "book" ? "book" : "old debt"} ${rupees(r.a)}`,
    });
    return true;
  },
});

/**
 * The owner types what he owed or had paid ahead before the app counted (once; again = replaced; 0 = none). It counts
 * as his oldest line, before the first day of the fees.
 */
export const opening = mutation({
  args: { token, sid: v.id("students"), owe: v.number(), credit: v.number() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const cfg = await needCfg(ctx);
    check(args.owe, "old debt", true);
    check(args.credit, "old credit", true);
    if (args.owe > 0 && args.credit > 0) fail("Type an old debt or an old credit, not both.");
    const s = await getStudent(ctx, args.sid);
    const now = Date.now();
    for (const r of await feeRowsOf(ctx, s._id)) if ((r.k === "owe" || r.k === "credit") && r.note === "before") await ctx.db.delete(r._id);
    const at = dayStartAt(cfg.from) - 1;
    const day = addDay(cfg.from, -1);
    if (args.owe > 0) await ctx.db.insert("fees", { sid: s._id, k: "owe", a: args.owe, day, at, note: "before" });
    if (args.credit > 0) await ctx.db.insert("fees", { sid: s._id, k: "credit", a: args.credit, day, at, note: "before" });
    const acc = await rebuild(ctx, s._id, now, s);
    if (!acc) await ensureAccount(ctx, s, now);
    await log(ctx, await currentSession(ctx, now), now, {
      kind: "money-opening",
      by: "money",
      studentId: s._id,
      name: s.name,
      value: args.owe > 0 ? `owed ${rupees(args.owe)}` : args.credit > 0 ? `credit ${rupees(args.credit)}` : "none",
    });
    return true;
  },
});

async function ensureAccount(ctx: Parameters<typeof rebuild>[0], s: Doc<"students">, now: number): Promise<Doc<"accounts">> {
  const had = await accountOf(ctx, s._id);
  if (had) return had;
  const id = await ctx.db.insert("accounts", {
    sid: s._id,
    name: s.name,
    ...(s.grade !== undefined ? { grade: s.grade } : {}),
    ...(s.archived ? { gone: true } : {}),
    owe: 0,
    cr: 0,
    c: 0,
    b: 0,
    o: 0,
    bu: [],
    np: 0,
    paid: 0,
    at: now,
  });
  return (await ctx.db.get(id))!;
}

/** The owner gives one student his own class fee (Rs 0 = free), or the centre's again (null). From his next class. */
export const setFee = mutation({
  args: { token, sid: v.id("students"), fee: v.union(v.number(), v.null()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    if (args.fee !== null) check(args.fee, "class fee", true);
    const s = await getStudent(ctx, args.sid);
    const now = Date.now();
    const acc = await ensureAccount(ctx, s, now);
    await ctx.db.patch(acc._id, { fee: args.fee === null ? undefined : args.fee, at: now });
    await log(ctx, await currentSession(ctx, now), now, {
      kind: "money-fee",
      by: "money",
      studentId: s._id,
      name: s.name,
      value: args.fee === null ? "the centre's fee" : rupees(args.fee),
    });
    return true;
  },
});

/**
 * The owner makes a student free (11 Nov 2026, his words: "some students is always free ... some student book is also
 * free, some student class free not book free"): his classes (`cls`), his books (`books`), or both. On: what he still
 * owes of that kind is wiped too (his answer; what he already paid stays paid), and from now a class is a Rs 0 day and
 * a printed book a Rs 0 line (its copy still leaves the stock). Off: from his next class or book; what was made free
 * stays free (History → Charge puts one back).
 */
export const setFree = mutation({
  args: { token, sid: v.id("students"), cls: v.optional(v.boolean()), books: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    await needCfg(ctx);
    const s = await getStudent(ctx, args.sid);
    const now = Date.now();
    const acc = await ensureAccount(ctx, s, now);
    const patch: Partial<Doc<"accounts">> = { at: now };
    if (args.cls === true) patch.fee = 0;
    else if (args.cls === false && acc.fee === 0) patch.fee = undefined;
    if (args.books !== undefined) patch.fb = args.books ? true : undefined;
    await ctx.db.patch(acc._id, patch);
    for (const kind of ["class", "book"] as const) {
      if (!(kind === "class" ? args.cls : args.books)) continue;
      const fix = freeFix((await feeRowsOf(ctx, s._id)).map(asRow), kind);
      for (const id of fix.waive) await ctx.db.patch(id as Id<"fees">, { w: now, wb: me.name, fr: true });
      for (const t of fix.trim) await ctx.db.patch(t.id as Id<"fees">, { a: t.a, fr: true });
      for (const id of fix.unprice) await ctx.db.patch(id as Id<"fees">, { np: undefined, fr: true });
    }
    await rebuild(ctx, s._id, now, s);
    await log(ctx, await currentSession(ctx, now), now, {
      kind: "money-free",
      by: "money",
      studentId: s._id,
      name: s.name,
      value: [args.cls !== undefined ? `class ${args.cls ? "free" : "not free"}` : "", args.books !== undefined ? `books ${args.books ? "free" : "not free"}` : ""].filter(Boolean).join(", "),
    });
    return true;
  },
});

/**
 * He didn't come (11 Nov 2026, his words: "we put some person attendant to the class accidentally, but they actually
 * not come ... otherwise we consider that person not give the money"): that day's class comes off his fees and his
 * visits off the register, as if he was never signed in (Attendance's Undo does it for five minutes only). Money
 * people: today's class; the owner: any day since the fees began (his answer: an old class must not vanish without
 * him). A Rs 0 line stays on his sheet and on the owner's Business tab: which day, who took it off, when.
 */
export const absent = mutation({
  args: { token, sid: v.id("students"), day: v.string() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["money"]);
    const cfg = await needCfg(ctx);
    const now = Date.now();
    const today = slDay(now);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.day) || args.day > today || args.day < cfg.from) fail("Choose a class since the fees began.");
    if (args.day !== today && me.role !== "owner") fail("Only the owner can take off a class of another day.");
    const session = await currentSession(ctx, now); // first: a class left open since yesterday signs everyone out
    const s = await getStudent(ctx, args.sid);
    if ((await neverCame(ctx, s, args.day, now)) === 0) fail(`${s.name} isn't signed in on that day.`);
    await ctx.db.insert("fees", { sid: s._id, k: "off", a: 0, day: args.day, at: now, by: me.name });
    await log(ctx, session, now, { kind: "money-absent", by: "money", studentId: s._id, name: s.name, value: `class ${args.day}` });
    return true;
  },
});

// ---- Printed books ----

/**
 * A book's papers (Money: whoever prints counts them) and its price (the owner: his answer, "I set each book's price
 * manually"). Setting a price prices every copy already given at Rs 0 (`np`). null = cleared.
 */
export const setBook = mutation({
  args: { token, u: v.id("units"), st: bookStage, papers: v.optional(v.union(v.number(), v.null())), price: v.optional(v.union(v.number(), v.null())) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["money"]);
    if (args.price !== undefined && me.role !== "owner") fail("Only the owner sets a book's price.");
    if (typeof args.papers === "number") check(args.papers, "papers");
    if (typeof args.price === "number") check(args.price, "price", true);
    const unit = await ctx.db.get(args.u);
    if (!unit) fail("That unit no longer exists.");
    const now = Date.now();
    const row = await shopOf(ctx, args.u, args.st, now);
    const patch: Partial<Doc<"shop">> = { at: now };
    if (args.papers !== undefined) patch.papers = args.papers ?? undefined;
    if (args.price !== undefined) patch.price = args.price ?? undefined;
    await ctx.db.patch(row._id, patch);
    if (typeof args.price === "number") {
      const waiting = (
        await ctx.db
          .query("fees")
          .withIndex("by_book", (q) => q.eq("u", args.u).eq("st", args.st))
          .collect()
      ).filter((r) => r.k === "book" && r.np);
      const sids = new Set<Id<"students">>();
      for (const r of waiting) {
        await ctx.db.patch(r._id, { a: args.price, np: undefined });
        sids.add(r.sid);
      }
      for (const sid of sids) await rebuild(ctx, sid, now);
    }
    await log(ctx, await currentSession(ctx, now), now, {
      kind: "money-book",
      by: "money",
      unit: unit.key,
      value: [
        args.papers !== undefined ? (args.papers === null ? "papers cleared" : `${args.papers} papers`) : "",
        args.price !== undefined ? (args.price === null ? "price cleared" : `price ${rupees(args.price)}`) : "",
      ]
        .filter(Boolean)
        .join(", "),
    });
    return true;
  },
});

/** Copies printed at the shop: the cost (copies × papers × the paper's cost) and the stock. */
export const printed = mutation({
  args: { token, u: v.id("units"), st: bookStage, copies: v.number(), papers: v.number() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["money"]);
    const cfg = await needCfg(ctx);
    check(args.copies, "copies");
    check(args.papers, "papers");
    if (args.copies > 500) fail("At most 500 copies at once.");
    const unit = await ctx.db.get(args.u);
    if (!unit) fail("That unit no longer exists.");
    const now = Date.now();
    const a = args.copies * args.papers * cfg.paper;
    const row = await shopOf(ctx, args.u, args.st, now);
    await ctx.db.patch(row._id, { printed: row.printed + args.copies, papers: args.papers, at: now });
    const id = await ctx.db.insert("cash", { k: "print", a, day: slDay(now), at: now, u: args.u, st: args.st, copies: args.copies, papers: args.papers, by: me.name });
    await log(ctx, await currentSession(ctx, now), now, {
      kind: "money-print",
      by: "money",
      unit: unit.key,
      value: `${args.copies} × ${args.papers} papers = ${rupees(a)}`,
    });
    return { id, a };
  },
});

/** A print typed by mistake taken back: whoever typed it within 12 hours, or the owner. */
export const unprint = mutation({
  args: { token, id: v.id("cash") },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["money"]);
    const c = await ctx.db.get(args.id);
    if (!c || c.k !== "print" || !c.u || !c.st) fail("That print is no longer there.");
    const now = Date.now();
    if (me.role !== "owner" && (c.by !== me.name || now - c.at > TAKE_BACK_MS)) fail("Only the owner can take back this print now.");
    const row = await shopRow(ctx, c.u, c.st);
    if (row) await ctx.db.patch(row._id, { printed: Math.max(0, row.printed - (c.copies ?? 0)), at: now });
    await ctx.db.delete(c._id);
    const unit = await ctx.db.get(c.u);
    await log(ctx, await currentSession(ctx, now), now, { kind: "money-unprint", by: "money", unit: unit?.key, value: `${c.copies ?? 0} copies` });
    return true;
  },
});

/** The copies counted in hand now (a count on the shelf): the stock starts again from it. */
export const count = mutation({
  args: { token, u: v.id("units"), st: bookStage, n: v.number() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["money"]);
    check(args.n, "copies", true);
    const unit = await ctx.db.get(args.u);
    if (!unit) fail("That unit no longer exists.");
    const now = Date.now();
    const row = await shopOf(ctx, args.u, args.st, now);
    await ctx.db.patch(row._id, { base: args.n, basePrinted: row.printed, baseGiven: row.given, baseAt: now, at: now });
    await log(ctx, await currentSession(ctx, now), now, { kind: "money-count", by: "money", unit: unit.key, value: `${args.n} in hand` });
    return true;
  },
});

// ---- The owner's money out ----

/** A person paid, or other spending (rent, light): the owner only. */
export const spend = mutation({
  args: { token, k: v.union(v.literal("staff"), v.literal("other")), a: v.number(), uid: v.optional(v.id("users")), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    check(args.a, "amount");
    const note = args.note?.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 60) || undefined;
    if (args.k === "staff") {
      const u = args.uid ? await ctx.db.get(args.uid) : null;
      if (!u) fail("Choose who you paid.");
    } else if (!note) fail("Type what it was for (rent, light, …).");
    const now = Date.now();
    const id = await ctx.db.insert("cash", { k: args.k, a: args.a, day: slDay(now), at: now, ...(args.uid ? { uid: args.uid } : {}), ...(note ? { note } : {}), by: me.name });
    await log(ctx, await currentSession(ctx, now), now, { kind: `money-${args.k}`, by: "money", value: rupees(args.a) });
    return id;
  },
});

export const unspend = mutation({
  args: { token, id: v.id("cash") },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const c = await ctx.db.get(args.id);
    if (!c || c.k === "print") fail("That line is no longer there.");
    await ctx.db.delete(c._id);
    const now = Date.now();
    await log(ctx, await currentSession(ctx, now), now, { kind: "money-unspend", by: "money", value: rupees(c.a) });
    return true;
  },
});

/** A person's pay: a day's pay for each day she comes, or a month's salary; null = not set. The owner only. */
export const setRate = mutation({
  args: { token, uid: v.id("users"), rate: v.union(v.object({ per: v.union(v.literal("day"), v.literal("month")), a: v.number() }), v.null()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    if (args.rate) check(args.rate.a, "pay");
    const u = await ctx.db.get(args.uid);
    if (!u) fail("That person is no longer here.");
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", STAFF_PAY_KEY))
      .first();
    const value: Record<string, PayRate> = { ...((row?.value as Record<string, PayRate> | undefined) ?? {}) };
    if (args.rate) value[args.uid] = { per: args.rate.per, a: args.rate.a };
    else delete value[args.uid];
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("meta", { key: STAFF_PAY_KEY, value });
    const now = Date.now();
    await log(ctx, await currentSession(ctx, now), now, { kind: "money-rate", by: "money", value: u.name });
    return true;
  },
});
