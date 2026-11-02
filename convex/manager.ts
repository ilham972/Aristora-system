// The Manager page's own reads (3 Nov 2026). The page itself runs on the live board (state.get) and the team
// (people.team); this is what only the manager needs, read once when he taps a student.

import { v } from "convex/values";
import { query } from "./_generated/server";
import { viewer } from "./lib/auth";
import { fail } from "./lib/backend";
import { DAY_MS, SL_OFFSET_MS, slDayNo } from "./lib/day";
import { dayOf, type DayCall } from "./lib/timeline";

/** One student's day: working, no work, walking, with which teacher; from his sign-in until now. */
export const day = query({
  args: { token: v.optional(v.string()), studentId: v.id("students") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "manager");
    const now = Date.now();
    const s = await ctx.db.get(args.studentId);
    if (!s) fail("That student no longer exists.");
    const start = slDayNo(now) * DAY_MS - SL_OFFSET_MS;
    const visits = await ctx.db
      .query("attendance")
      .withIndex("by_student", (q) => q.eq("studentId", s._id).gte("inAt", start))
      .collect();
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_student_at", (q) => q.eq("studentId", s._id).gte("createdAt", start))
      .collect();
    const events = await ctx.db
      .query("events")
      .withIndex("by_student", (q) => q.eq("studentId", s._id).gte("at", start))
      .collect();
    const idles = events.filter((e) => e.kind === "idle" && e.ms).map((e) => ({ from: e.at - e.ms!, to: e.at }));
    if (s.idleSince !== undefined) idles.push({ from: s.idleSince, to: now });
    return dayOf({ now, visits, idles, calls: calls as DayCall[] });
  },
});
