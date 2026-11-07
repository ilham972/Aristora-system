// The race on the server (7 Nov 2026). Functions:
//   fill (every 5 min, crons.ts) -> builds the race rows of students who have none yet, or built with older XP rules
//                  (20 a run: a mutation has a second); once none is left it notes it (meta "raceV") and does nothing
//                  more until the rules change.
//   week (Monday 00:05 in Sri Lanka, crons.ts) -> last week's champions: each grade's top 3 and ARISTORA's, and the
//                  grade cup, kept in raceWeeks; each champion's weeks won on his race row (his profile counts them);
//                  the gifts for the prizes the owner set.
//   champions -> last week's champions for the poster (Settings → Race; owner, Reports, Manager): the kept week, or
//                  worked out now before Monday's run kept it.
//   settings, setMarks, setPrizes -> the owner (Settings → Race): classmates see a student's marks on his profile (%
//                  right, questions, his Stages' marks; on by default, his answer "Everything"; one tap off if a parent
//                  complains); the centre's prize for each win (his ask: "gift cards ... ice-cream or chicken fries").
//   gifts, giftCount, give -> the gifts to give and given lately (owner and Manager): Given when it is handed over.
// The race itself is family.board (every student, both lists) and family.mate (a classmate's profile).

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { internalMutation, mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { fail } from "./lib/backend";
import { DAY_MS, slWeekStart } from "./lib/day";
import { championsOf, cupWinners, type Champ, type Cup } from "./lib/race";
import { mateMarksOn, RACE_V, raceList, rebuildStudent } from "./lib/raceRows";
import { champsMoment } from "./lib/us";

const token = v.optional(v.string());

/** Students built in one run of the fill (each reads his own rows: a run stays small). */
export const FILL_PER_RUN = 20;

/** The race rows of students who have none (or older ones): up to 20 a run; then notes that every row is ready. */
export const fill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const meta = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "raceV"))
      .first();
    if (meta?.value === RACE_V) return 0;
    const now = Date.now();
    const ready = new Set<string>();
    for (const r of await ctx.db.query("raceRows").collect()) if (r.v === RACE_V) ready.add(r.sid);
    const want = (await ctx.db.query("students").collect()).filter((s) => !ready.has(s._id));
    for (const s of want.slice(0, FILL_PER_RUN)) await rebuildStudent(ctx, s._id, now);
    if (want.length <= FILL_PER_RUN) {
      if (meta) await ctx.db.patch(meta._id, { value: RACE_V });
      else await ctx.db.insert("meta", { key: "raceV", value: RACE_V });
    }
    return Math.min(want.length, FILL_PER_RUN);
  },
});

/** The centre's prize for each win (empty = no gift): each grade's champion, ARISTORA's, the grade cup. */
export type Prizes = { g: string; a: string; cup: string };
/** A prize's words, at most ("🍦 Ice cream", "🍗 Chicken fries and a drink"). */
export const PRIZE_MAX = 40;

async function prizesOf(ctx: QueryCtx): Promise<Prizes> {
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "giftPrizes"))
    .first();
  const x = (m?.value ?? {}) as Partial<Prizes>;
  return { g: x.g ?? "", a: x.a ?? "", cup: x.cup ?? "" };
}

/** The week before this one (its Monday 00:00 in Sri Lanka). */
const lastWeek = (now: number) => slWeekStart(now) - 7 * DAY_MS;

/**
 * Last week's champions (the real class only), once: each grade's top 3 and ARISTORA's top 3, the grade cup; each #1
 * (ties share it) gets a week won on his race row (`w` in his grade, `wa` in ARISTORA); a gift for each prize the
 * owner set (the ARISTORA champion is his grade's too: both gifts; the cup: every student who learned in that grade).
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
    await ctx.db.insert("raceWeeks", {
      wk,
      top: top.map((c) => ({ sid: c.id as Id<"students">, n: c.n, ...(c.g !== null ? { g: c.g } : {}), xp: c.xp, k: c.k, place: c.place })),
      cup,
    });
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
    // The gifts (his prizes as they are now).
    const prizes = await prizesOf(ctx);
    const gift = async (sid: string, n: string, g: number | null, kind: Doc<"gifts">["kind"], what: string) =>
      await ctx.db.insert("gifts", { sid: sid as Id<"students">, n, ...(g !== null ? { g } : {}), wk, kind, what, at: now, open: true });
    for (const c of top.filter((x) => x.place === 1)) {
      const what = c.k === "g" ? prizes.g : prizes.a;
      if (what) await gift(c.id, c.n, c.g, c.k, what);
    }
    if (prizes.cup) {
      const grades = cupWinners(cup);
      for (const r of rows.filter((x) => x.g !== null && grades.includes(x.g) && x.p > 0)) await gift(r.id, r.n, r.g, "cup", prizes.cup);
    }
    // Us (7 Nov 2026): the owl names last week's champions to everyone.
    await champsMoment(ctx, top, now);
    return wk;
  },
});

/** A week's champions for the poster: its Monday, the top 3s, the cup; `kept` = Monday's run kept it. */
export type Champions = { wk: number; top: Champ[]; cup: Cup[]; kept: boolean };

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
    if (kept) return { wk, top: kept.top.map((c) => ({ id: c.sid, n: c.n, g: c.g ?? null, xp: c.xp, k: c.k, place: c.place })), cup: kept.cup, kept: true };
    return { wk, ...championsOf(await raceList(ctx, false, now)), kept: false };
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

/** The owner's prizes (empty = no gift for that win); Monday's run gives them. */
export const setPrizes = mutation({
  args: { token, g: v.string(), a: v.string(), cup: v.string() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const clean = (s: string) => s.replace(/\s+/g, " ").trim();
    const value: Prizes = { g: clean(args.g), a: clean(args.a), cup: clean(args.cup) };
    if (Object.values(value).some((x) => [...x].length > PRIZE_MAX)) fail(`A prize in ${PRIZE_MAX} letters at most.`);
    const m = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", "giftPrizes"))
      .first();
    if (m) await ctx.db.patch(m._id, { value });
    else await ctx.db.insert("meta", { key: "giftPrizes", value });
    return value;
  },
});

/** A gift on the teachers' list. */
export type GiftItem = { id: string; sid: string; n: string; g: number | null; wk: number; kind: "g" | "a" | "cup"; what: string; at: number; givenAt: number | null; by: string | null };
const itemOf = (x: Doc<"gifts">): GiftItem => ({
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
