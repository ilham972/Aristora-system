import { v } from "convex/values";
import { query } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { ATT_OFF_KEY, attendanceOff, cleanBy, currentSession, fail, log } from "./lib/backend";
import { mutation } from "./lib/fn";

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

/**
 * Attendance mode (12 Nov 2026, his ask; the rule: `hereNow` in convex/lib/backend.ts). `on` = only the signed-in
 * students show on the pages (the class as always); off = every student shows everywhere, for testing and correcting
 * students who aren't in the hall. Only the owner turns it off; anyone who takes attendance can turn it back on (a real
 * class day found with it off is put right by whoever is at the door). Nothing else changes: no sign-in, fee or visit.
 */
export const setMode = mutation({
  args: { token: v.optional(v.string()), on: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token, ["correction"], args.by);
    if (!args.on && user.role !== "owner") fail("Only the owner turns attendance mode off.");
    if ((await attendanceOff(ctx)) === !args.on) return true;
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", ATT_OFF_KEY))
      .first();
    if (row) await ctx.db.patch(row._id, { value: !args.on });
    else await ctx.db.insert("meta", { key: ATT_OFF_KEY, value: !args.on });
    const now = Date.now();
    await log(ctx, await currentSession(ctx, now), now, { kind: "attendance-mode", by: cleanBy(args.by), value: args.on ? "on" : "off" });
    return true;
  },
});
