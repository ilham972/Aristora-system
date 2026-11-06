// The race on the server (7 Nov 2026). Functions:
//   fill (every 15 min, crons.ts) -> builds the race rows of students who have none yet, or built with older XP rules
//                  (60 a run); once none is left it notes it (meta "raceV") and does nothing more until the rules change.
//   week (Monday 00:05 in Sri Lanka, crons.ts) -> last week's champions: each grade's top 3 and ARISTORA's, and the
//                  grade cup, kept in raceWeeks; each champion's weeks won on his race row (his profile counts them).
//   settings, setMarks -> the owner's switch (Settings → Race): classmates see a student's marks on his profile (% right,
//                  lost marks, his report). On by default (his answer: "Everything"); one tap off if a parent complains.
// The race itself is family.board (every student, both lists) and family.mate (a classmate's profile).

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { internalMutation, mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { DAY_MS, slWeekStart } from "./lib/day";
import { champsOf, cupOf, placed, RACE_GRADES, type RaceRow } from "./lib/race";
import { mateMarksOn, RACE_V, raceList, rebuildStudent } from "./lib/raceRows";

const token = v.optional(v.string());

/** Students built in one run of the fill (each reads his own rows: a run stays small). */
export const FILL_PER_RUN = 60;

/** The race rows of students who have none (or older ones): up to 60 a run; then notes that every row is ready. */
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

/** A list's top 3 of last week (XP > 0), in order. */
function top3(rows: RaceRow[]): RaceRow[] {
  return placed(rows.map((r) => ({ ...r, xp: r.p, y: 0 })))
    .filter((x) => x.rank !== null && x.rank <= 3)
    .map((x) => rows.find((r) => r.id === x.r.id)!);
}

/**
 * Last week's champions (the real class only), once: each grade's top 3 and ARISTORA's top 3, the grade cup; each #1
 * (ties share it) gets a week won on his race row (`w` in his grade, `wa` in ARISTORA).
 */
export const week = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const wk = slWeekStart(now) - 7 * DAY_MS;
    const done = await ctx.db
      .query("raceWeeks")
      .withIndex("by_wk", (q) => q.eq("wk", wk))
      .first();
    if (done) return null;
    const rows = await raceList(ctx, false, now);
    const top: { sid: Id<"students">; n: string; g?: number; xp: number; k: "g" | "a"; place: number }[] = [];
    const won = new Map<string, { w: number; wa: number }>();
    const add = (list: RaceRow[], k: "g" | "a") => {
      const best = champsOf(list);
      const ranked = placed(list.map((r) => ({ ...r, xp: r.p, y: 0 })));
      for (const r of top3(list)) {
        const place = ranked.find((x) => x.r.id === r.id)!.rank!;
        top.push({ sid: r.id as Id<"students">, n: r.n, ...(r.g !== null ? { g: r.g } : {}), xp: r.p, k, place });
      }
      for (const id of best) {
        const x = won.get(id) ?? { w: 0, wa: 0 };
        if (k === "g") x.w++;
        else x.wa++;
        won.set(id, x);
      }
    };
    for (const g of RACE_GRADES) add(rows.filter((r) => r.g === g), "g");
    add(rows, "a");
    await ctx.db.insert("raceWeeks", { wk, top, cup: cupOf(rows, "last") });
    for (const [sid, x] of won) {
      const row = await ctx.db
        .query("raceRows")
        .withIndex("by_sid", (q) => q.eq("sid", sid as Id<"students">))
        .first();
      if (row) await ctx.db.patch(row._id, { w: (row.w ?? 0) + x.w, wa: (row.wa ?? 0) + x.wa });
    }
    return wk;
  },
});

/** Settings → Race (the owner). */
export const settings = query({
  args: { token },
  handler: async (ctx, args): Promise<{ marks: boolean }> => {
    await viewer(ctx, args.token, "owner");
    return { marks: await mateMarksOn(ctx) };
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
