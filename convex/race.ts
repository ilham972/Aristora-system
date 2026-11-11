// The race on the server (7 Nov 2026). Functions:
//   fill (every 5 min, crons.ts) -> builds the race rows of students who have none yet, or built with older XP rules
//                  (20 a run: a mutation has a second); once none is left it notes it (meta "raceV") and does nothing
//                  more until the rules change. Since 11 Nov 2026 it also watches the GOAT (ARISTORA's all-time #1, every
//                  grade): a new one is the owl's line in Us (meta "goat").
//   week (Monday 00:05 in Sri Lanka, crons.ts) -> last week's champions: each grade's top 3 and ARISTORA's, and the
//                  grade cup, kept in raceWeeks; each champion's weeks won on his race row (his profile counts them);
//                  since 11 Nov 2026 (the leagues out, his answers) the weekly coins: each grade's #1, never two weeks
//                  running (then the next one), kept in raceWeeks (`cw`) for Monday's pay (coins.payday); the cup's gifts;
//                  the owl's line (the coin winners, or the grade champions when the coins are off).
//   month (the 1st, 00:10 in Sri Lanka, from us.daily) -> the month's most improved (8 Nov 2026, his answer): their
//                  gifts and the owl's line.
//   giveNow -> a gift by hand, any time (the owner and the Manager): his ask "how we can give the gift when we want".
//   champions -> last week's champions for the poster (Settings → Race; owner, Reports, Manager): the kept week, or
//                  worked out now before Monday's run kept it.
//   settings, setMarks, setPrizes -> the owner (Settings → Race): classmates see a student's marks on his profile (%
//                  right, questions, his Stages' marks; on by default, his answer "Everything"; one tap off if a parent
//                  complains); the weekly coins and the centre's prizes (his ask: "gift cards ... ice-cream or chicken
//                  fries").
//   gifts, giftCount, give -> the gifts to give and given lately (owner and Manager): Given when it is handed over.
//                  Since 10 Nov 2026 also what students bought in the Shop (kind "shop", convex/coins.ts; Coins back =
//                  coins.refund).
// The race itself is family.board (every student, all three lists) and family.mate (a classmate's profile).

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { coinsOnce, winNow } from "./coins";
import { fail, log } from "./lib/backend";
import { DAY_MS, slDayNo, slMonthBefore, slMonthStart, slWeekStart } from "./lib/day";
import { championsOf, cupWinners, goatOf, numsAt, weekWinners, type Champ, type Cup, type WeekWin } from "./lib/race";
import { mateMarksOn, numsOfRow, RACE_V, raceList, rebuildStudent, weekCoinsOf } from "./lib/raceRows";
import { champsMoment, coinsMoment, giftMoment, goatMoment, monthMoment, mostImprovedMonth } from "./lib/us";

const token = v.optional(v.string());

/** Students built in one run of the fill (each reads his own rows: a run stays small). */
export const FILL_PER_RUN = 20;

/**
 * The race rows of students who have none (or older ones): up to 20 a run, the next run at once while some are left
 * (8 Nov 2026: new rules rebuild everyone in a minute, not half an hour); then notes that every row is ready. Each run
 * first looks at the GOAT (goatWatch).
 */
export const fill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    await goatWatch(ctx, now);
    // The Shop came (10 Nov 2026): last week's pay at once, not next Monday (once).
    await coinsOnce(ctx, now);
    const meta = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "raceV"))
      .first();
    if (meta?.value === RACE_V) return 0;
    const ready = new Set<string>();
    for (const r of await ctx.db.query("raceRows").collect()) if (r.v === RACE_V) ready.add(r.sid);
    const want = (await ctx.db.query("students").collect()).filter((s) => !ready.has(s._id));
    for (const s of want.slice(0, FILL_PER_RUN)) await rebuildStudent(ctx, s._id, now);
    if (want.length <= FILL_PER_RUN) {
      if (meta) await ctx.db.patch(meta._id, { value: RACE_V });
      else await ctx.db.insert("meta", { key: "raceV", value: RACE_V });
    } else await ctx.scheduler.runAfter(0, internal.race.fill, {});
    return Math.min(want.length, FILL_PER_RUN);
  },
});

/**
 * The GOAT (11 Nov 2026, his answers: ARISTORA's all-time #1 over every grade; the badge moves the moment someone passes
 * him): a new one is noted (meta "goat") and is the owl's line in Us, at most once a day. Only once the rows are ready
 * (before that the list is worked out the slow way).
 */
async function goatWatch(ctx: MutationCtx, now: number): Promise<void> {
  const ready = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "raceV"))
    .first();
  if (ready?.value !== RACE_V) return;
  const goat = goatOf(await raceList(ctx, false, now));
  if (!goat) return;
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "goat"))
    .first();
  if ((m?.value as { sid?: string } | undefined)?.sid === goat.id) return;
  const value = { sid: goat.id, at: now };
  if (m) await ctx.db.patch(m._id, { value });
  else await ctx.db.insert("meta", { key: "goat", value });
  await goatMoment(ctx, goat.id as Id<"students">, now);
}

/**
 * The weekly coins and the centre's prizes. Since 11 Nov 2026 (his answers: the leagues out; "instead of giving gift we
 * can give direct coins, they will buy in the market"): each grade's weekly #1 wins `wc` coins (0 = none; never two weeks
 * running: his worry of 8 Nov, "the same strongest students won it every week"). Gifts for the month's most improved
 * (`mi`) and the grade cup (`cup`, until the houses): empty = no gift. ARISTORA's champion keeps his 🏆 and weeks won.
 */
export type Prizes = { wc: number; mi: string; cup: string };
/** A prize's words, at most ("🍦 Ice cream", "🍗 Chicken fries and a drink"). */
export const PRIZE_MAX = 40;
/** The most weekly coins the owner can set. */
export const WEEK_COINS_MAX = 10_000;
/** The month's most improved: how many get the gift. */
export const MONTH_TOP = 3;
/** Students one gift by hand may go to at once. */
export const GIVE_MAX = 40;
/** A reason's letters, at most. */
export const WHY_MAX = 80;

async function prizesOf(ctx: QueryCtx): Promise<Prizes> {
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "giftPrizes"))
    .first();
  const x = (m?.value ?? {}) as { mi?: string; cup?: string };
  return { wc: await weekCoinsOf(ctx), mi: x.mi ?? "", cup: x.cup ?? "" };
}

/** The week before this one (its Monday 00:00 in Sri Lanka). */
const lastWeek = (now: number) => slWeekStart(now) - 7 * DAY_MS;

/**
 * Last week, once (Monday 00:05). The real class: each grade's top 3 and ARISTORA's top 3, the grade cup; each #1 (ties
 * share it) gets a week won on his race row (`w` in his grade, `wa` in ARISTORA). The weekly coins (11 Nov 2026): each
 * grade's #1, or the next one when the #1 won that grade's coins the week before, kept with the week (`cw`); Monday's
 * pay adds them to his coins (coins.payday, 00:15). Gifts for the grade cup (every student who learned in that grade).
 * The owl names the coin winners (or, coins off, each grade's champion).
 */
export const week = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const wk = lastWeek(now);
    const done = await ctx.db
      .query("raceWeeks")
      .withIndex("by_wk", (q) => q.eq("wk", wk))
      .first();
    if (done) return null;
    const rows = await raceList(ctx, false, now);
    const { top, cup } = championsOf(rows);
    const won = new Map<string, { w: number; wa: number }>();
    for (const c of top.filter((x) => x.place === 1)) {
      const x = won.get(c.id) ?? { w: 0, wa: 0 };
      if (c.k === "g") x.w++;
      else x.wa++;
      won.set(c.id, x);
    }
    for (const [sid, x] of won) {
      const row = await ctx.db
        .query("raceRows")
        .withIndex("by_sid", (q) => q.eq("sid", sid as Id<"students">))
        .first();
      if (row) await ctx.db.patch(row._id, { w: (row.w ?? 0) + x.w, wa: (row.wa ?? 0) + x.wa });
    }
    const prizes = await prizesOf(ctx);
    const before = await ctx.db
      .query("raceWeeks")
      .withIndex("by_wk", (q) => q.eq("wk", wk - 7 * DAY_MS))
      .first();
    const cw = prizes.wc > 0 ? weekWinners(rows, new Set((before?.cw ?? []).map((x) => x.sid as string))) : [];
    await ctx.db.insert("raceWeeks", {
      wk,
      top: top.map((c) => ({ sid: c.id as Id<"students">, n: c.n, ...(c.g !== null ? { g: c.g } : {}), xp: c.xp, k: c.k, place: c.place })),
      cup,
      cw: cw.map((x) => ({ g: x.g, sid: x.id as Id<"students">, n: x.n, xp: x.xp, c: prizes.wc })),
    });
    // Monday's pay already came (it runs at 00:15; a late run of this one): the coins go to his wallet now.
    for (const x of cw) await winNow(ctx, x.id as Id<"students">, prizes.wc, x.g, wk, now);
    if (cw.length)
      await coinsMoment(
        ctx,
        cw.map((x) => x.id as Id<"students">),
        prizes.wc,
        now,
      );
    else await champsMoment(ctx, top, now);
    if (prizes.cup) {
      const grades = cupWinners(cup);
      for (const r of rows.filter((x) => x.g !== null && grades.includes(x.g) && x.p - (x.up ?? 0) > 0))
        await ctx.db.insert("gifts", { sid: r.id as Id<"students">, n: r.n, ...(r.g !== null ? { g: r.g } : {}), wk, kind: "cup", what: prizes.cup, at: now, open: true });
    }
    return wk;
  },
});

/**
 * The 1st of each month, once (us.daily calls it): last month's most improved (Levels and class work, against the month
 * before: lib/us.ts `mostImprovedMonth`), their gifts if the owner set a prize, and the owl's line.
 */
export const month = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const mk = slMonthBefore(slMonthStart(now));
    const had = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "raceMonth"))
      .first();
    if (had && (had.value as number) >= mk) return null;
    if (had) await ctx.db.patch(had._id, { value: mk });
    else await ctx.db.insert("meta", { key: "raceMonth", value: mk });
    const rows = await ctx.db
      .query("raceRows")
      .withIndex("by_list", (q) => q.eq("demo", false).eq("gone", false))
      .collect();
    const top = mostImprovedMonth(
      rows.map((r) => {
        const a = numsAt(numsOfRow(r), now);
        const u = r.us ? numsAt(numsOfRow(r.us), now) : null;
        return { r, xp: a.m1 - (u?.m1 ?? 0), prev: a.m2 - (u?.m2 ?? 0) };
      }),
      MONTH_TOP,
    );
    const prizes = await prizesOf(ctx);
    if (prizes.mi)
      for (const { r } of top) await ctx.db.insert("gifts", { sid: r.sid, n: r.n, ...(r.g !== undefined ? { g: r.g } : {}), wk: mk, kind: "mi", what: prizes.mi, at: now, open: true });
    await monthMoment(
      ctx,
      top.map(({ r }) => r.sid),
      mk,
      now,
    );
    return mk;
  },
});

/** A grade's weekly coins as the poster and Settings → Race show them (11 Nov 2026): who, the XP, the coins. */
export type CoinWin = WeekWin & { c: number };
/**
 * A week's champions for the poster: its Monday, the top 3s, the cup, each grade's coin winner (`cw`; none for a week
 * from before the coins: then each grade's champion); `kept` = Monday's run kept it.
 */
export type Champions = { wk: number; top: Champ[]; cup: Cup[]; cw: CoinWin[]; kept: boolean };

/** Last week's champions (the poster): the week Monday's run kept, else worked out now from the race. */
export const champions = query({
  args: { token },
  handler: async (ctx, args): Promise<Champions> => {
    await viewer(ctx, args.token, "reports", "manager");
    const now = Date.now();
    const wk = lastWeek(now);
    const kept = await ctx.db
      .query("raceWeeks")
      .withIndex("by_wk", (q) => q.eq("wk", wk))
      .first();
    if (kept)
      return {
        wk,
        top: kept.top.map((c) => ({ id: c.sid, n: c.n, g: c.g ?? null, xp: c.xp, k: c.k, place: c.place })),
        cup: kept.cup,
        cw: (kept.cw ?? []).map((x) => ({ g: x.g, id: x.sid, n: x.n, xp: x.xp, c: x.c })),
        kept: true,
      };
    // Before Monday's run: who would win the coins if it ran now.
    const rows = await raceList(ctx, false, now);
    const prizes = await prizesOf(ctx);
    const before = await ctx.db
      .query("raceWeeks")
      .withIndex("by_wk", (q) => q.eq("wk", wk - 7 * DAY_MS))
      .first();
    const cw = prizes.wc > 0 ? weekWinners(rows, new Set((before?.cw ?? []).map((x) => x.sid as string))).map((x) => ({ ...x, c: prizes.wc })) : [];
    return { wk, ...championsOf(rows), cw, kept: false };
  },
});

/** Settings → Race (the owner): the marks switch and the prizes. */
export const settings = query({
  args: { token },
  handler: async (ctx, args): Promise<{ marks: boolean; prizes: Prizes }> => {
    await viewer(ctx, args.token, "owner");
    return { marks: await mateMarksOn(ctx), prizes: await prizesOf(ctx) };
  },
});

/** The owner's switch: classmates see marks on a profile, or not. */
export const setMarks = mutation({
  args: { token, on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const m = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "mateMarks"))
      .first();
    if (m) await ctx.db.patch(m._id, { value: args.on });
    else await ctx.db.insert("meta", { key: "mateMarks", value: args.on });
    return args.on;
  },
});

/** The owner's weekly coins (0 = none) and prizes (empty = no gift): Monday's run (the coins, the cup) and the 1st's (the month's most improved). */
export const setPrizes = mutation({
  args: { token, wc: v.number(), mi: v.string(), cup: v.string() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const clean = (s: string) => s.replace(/\s+/g, " ").trim();
    const value: Prizes = { wc: args.wc, mi: clean(args.mi), cup: clean(args.cup) };
    if (!Number.isInteger(value.wc) || value.wc < 0 || value.wc > WEEK_COINS_MAX) fail(`Weekly coins: a whole number from 0 to ${WEEK_COINS_MAX.toLocaleString("en")}.`);
    if ([value.mi, value.cup].some((x) => [...x].length > PRIZE_MAX)) fail(`A prize in ${PRIZE_MAX} letters at most.`);
    const m = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "giftPrizes"))
      .first();
    if (m) await ctx.db.patch(m._id, { value });
    else await ctx.db.insert("meta", { key: "giftPrizes", value });
    return value;
  },
});

/** A gift on the teachers' list (`l` a league's winner's league, from before 11 Nov 2026; `why` the reason of a gift given by hand). */
export type GiftItem = {
  id: string;
  sid: string;
  n: string;
  g: number | null;
  wk: number;
  kind: Doc<"gifts">["kind"];
  what: string;
  at: number;
  givenAt: number | null;
  by: string | null;
  l: number | null;
  why: string | null;
  /** A thing he bought in the Shop (10 Nov 2026): its coins (Coins back gives them back). */
  c: number | null;
};
const itemOf = (x: Doc<"gifts">): GiftItem => ({
  c: x.kind === "shop" ? (x.c ?? 0) : null,
  id: x._id,
  sid: x.sid,
  n: x.n,
  g: x.g ?? null,
  wk: x.wk,
  kind: x.kind,
  what: x.what,
  at: x.at,
  givenAt: x.givenAt ?? null,
  by: x.by ?? null,
  l: x.l ?? null,
  why: x.why ?? null,
});
/** Given lately: the last two weeks' (Undo stays possible there), 30 at most. */
const GIVEN_SHOWN_MS = 14 * DAY_MS;

/** Gifts to give (oldest first) and given lately (newest first): the owner and the Manager. */
export const gifts = query({
  args: { token },
  handler: async (ctx, args): Promise<{ open: GiftItem[]; given: GiftItem[] }> => {
    await viewer(ctx, args.token, "manager");
    const now = Date.now();
    const open = await ctx.db
      .query("gifts")
      .withIndex("by_open", (q) => q.eq("open", true))
      .collect();
    // Given ones are made at most a few weeks before they are given: the last 60 made, the recently given among them.
    const given = await ctx.db
      .query("gifts")
      .withIndex("by_open", (q) => q.eq("open", false))
      .order("desc")
      .take(60);
    return {
      open: open.map(itemOf),
      given: given
        .filter((x) => (x.givenAt ?? 0) >= now - GIVEN_SHOWN_MS)
        .sort((a, b) => (b.givenAt ?? 0) - (a.givenAt ?? 0))
        .slice(0, 30)
        .map(itemOf),
    };
  },
});

/** How many gifts wait to be given (the gear's count: the owner and the Manager). */
export const giftCount = query({
  args: { token },
  handler: async (ctx, args): Promise<number> => {
    await viewer(ctx, args.token, "manager");
    return (
      await ctx.db
        .query("gifts")
        .withIndex("by_open", (q) => q.eq("open", true))
        .collect()
    ).length;
  },
});

/** Given (handed over in class), or Undo. */
export const give = mutation({
  args: { token, id: v.id("gifts"), given: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["manager"], args.by);
    const x = await ctx.db.get(args.id);
    if (!x) fail("That gift is gone.");
    if (args.given) await ctx.db.patch(x._id, { open: false, givenAt: Date.now(), by: me.name });
    else await ctx.db.patch(x._id, { open: true, givenAt: undefined, by: undefined });
    return true;
  },
});

/**
 * A gift by hand, any time (8 Nov 2026, his ask: "how we can give the gift when we want to give the gift?"): the owner or
 * the Manager picks students, the gift and why ("7 days in a row", "helped his classmates"); each gets the gold card on
 * his phone until Given. `tell` = the owl tells everyone in Us (the reason and the names, never the gift itself).
 */
export const giveNow = mutation({
  args: { token, sids: v.array(v.id("students")), what: v.string(), why: v.string(), tell: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["manager"], args.by);
    const clean = (s: string) => s.replace(/\s+/g, " ").trim();
    const what = clean(args.what);
    const why = clean(args.why);
    if (!what) fail("Type the gift.");
    if ([...what].length > PRIZE_MAX) fail(`The gift in ${PRIZE_MAX} letters at most.`);
    if ([...why].length > WHY_MAX) fail(`The reason in ${WHY_MAX} letters at most.`);
    const sids = [...new Set(args.sids)];
    if (!sids.length) fail("Pick a student.");
    if (sids.length > GIVE_MAX) fail(`${GIVE_MAX} students at most at once.`);
    const now = Date.now();
    const given: Id<"students">[] = [];
    const names: string[] = [];
    for (const sid of sids) {
      const s = await ctx.db.get(sid);
      if (!s || s.archived) continue;
      names.push(s.name);
      await ctx.db.insert("gifts", {
        sid,
        n: s.name,
        ...(typeof s.grade === "number" ? { g: s.grade } : {}),
        wk: slWeekStart(now),
        kind: "own",
        what,
        at: now,
        open: true,
        ...(why ? { why } : {}),
      });
      given.push(sid);
    }
    if (!given.length) fail("Those students are not in ARISTORA now.");
    if (args.tell && why) await giftMoment(ctx, given, why, now);
    await log(ctx, null, now, { kind: "gift", by: me.name, value: `${what} → ${names.join(", ")}${why ? ` (${why})` : ""}` });
    return given.length;
  },
});
