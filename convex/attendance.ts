import { v } from "convex/values";
import { query } from "./_generated/server";
import { viewer } from "./lib/auth";

/**
 * One day's visits (the Attendance page): who came, when, and when they left.
 * The day is the Sri Lanka date the phone asks for ("2026-10-28"), so the answer never goes stale at midnight.
 */
export const day = query({
  args: { token: v.optional(v.string()), day: v.string() },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.day)) return [];
    const rows = await ctx.db
      .query("attendance")
      .withIndex("by_day", (q) => q.eq("day", args.day))
      .collect();
    return rows.map((r) => ({ studentId: r.studentId, inAt: r.inAt, outAt: r.outAt ?? null }));
  },
});
