// Each department's work, today and every day before (8 Nov 2026, his "after class I can see how much they corrected
// the paper, how much they explained ... but next day that's gone, right? ... I want the insight, analytical graph ...
// each class, how many they correcting and which class getting lower correction, which class getting higher ... they
// can also see their performance ... in all the department's dashboards"). Counting: convex/lib/work.ts.
// - `days`: its dashboard's "Cleared today" (counted now) and "Every class" (the days kept, the last 60).
// - `fill` (every 10 minutes, convex/crons.ts): keeps each day once it is over, oldest missing first, back to the first
//   day in the history; a run keeps days while it has read fewer than EVENTS_PER_RUN events, then the next goes on.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { query } from "./_generated/server";
import { viewer } from "./lib/auth";
import { slDayNo } from "./lib/day";
import { internalMutation } from "./lib/fn";
import { allDepts, deptDay, type DeptDay } from "./lib/work";

/** How far back "Every class" looks (days). */
export const SHOWN_DAYS = 60;
/**
 * A run of `fill` goes on to the next day only while it has read fewer events than this (a day is read whole, at most
 * WORK_EVENTS: a run stays well under a function's reads), and keeps 60 days at most.
 */
export const EVENTS_PER_RUN = 1_500;
const DAYS_PER_RUN = 60;

const workDept = v.union(v.literal("fighter"), v.literal("master"), v.literal("management"));

/**
 * A department's work: today (counted now, from midnight in Sri Lanka) and each day kept before it that had any (the
 * last 60 days). The simulation's phone: its own students' today only. Read on opening the dashboard and every minute.
 */
export const days = query({
  args: { token: v.optional(v.string()), dept: workDept, test: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ today: DeptDay; days: DeptDay[] }> => {
    await viewer(ctx, args.token, "any");
    const day = slDayNo(Date.now());
    const today = await deptDay(ctx, day, !!args.test, args.dept);
    if (args.test) return { today, days: [] };
    const kept = await ctx.db
      .query("workDays")
      .withIndex("by_day", (q) => q.gte("day", day - SHOWN_DAYS).lt("day", day))
      .collect();
    return { today, days: kept.map((r) => r[args.dept]).filter((d) => d.total > 0 || d.people.length > 0) };
  },
});

/**
 * Keep the days that are over and not kept yet, oldest first (the first time: from the first day in the history). Goes
 * on at once while days are missing (`chain`, the cron's default); a test calls it run by run.
 */
export const fill = internalMutation({
  args: { chain: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<number> => {
    const today = slDayNo(Date.now());
    const last = await ctx.db.query("workDays").withIndex("by_day").order("desc").first();
    let day: number;
    if (last) day = last.day + 1;
    else {
      const first = await ctx.db.query("events").withIndex("by_at").order("asc").first();
      if (!first) return 0;
      day = slDayNo(first.at);
    }
    let kept = 0;
    let read = 0;
    const students = day < today ? await ctx.db.query("students").collect() : [];
    while (day < today && read < EVENTS_PER_RUN && kept < DAYS_PER_RUN) {
      const w = await allDepts(ctx, day, students);
      await ctx.db.insert("workDays", { day, fighter: w.fighter, master: w.master, management: w.management, events: w.events, at: Date.now() });
      read += w.events;
      kept++;
      day++;
    }
    if (day < today && args.chain !== false) await ctx.scheduler.runAfter(0, internal.work.fill, {});
    return kept;
  },
});
