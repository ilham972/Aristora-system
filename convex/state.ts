import { v } from "convex/values";
import { query } from "./_generated/server";

/** Everything the three phones need, live. */
export const get = query({
  args: {},
  handler: async (ctx) => {
    const students = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const requested = await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", "requested")).collect();
    const sent = await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", "sent")).collect();
    const session = await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first();
    return {
      students,
      calls: [...requested, ...sent],
      session: session
        ? { _id: session._id, startedAt: session.startedAt, lastActivityAt: session.lastActivityAt }
        : null,
    };
  },
});

export const archived = query({
  args: {},
  handler: async (ctx) => {
    const list = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", true))
      .collect();
    return list.map((s) => ({ _id: s._id, name: s.name, demo: s.demo ?? false }));
  },
});

export const history = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const n = Math.min(Math.max(Math.floor(limit ?? 80), 1), 300);
    return await ctx.db.query("events").withIndex("by_at").order("desc").take(n);
  },
});

export const sessions = query({
  args: {},
  handler: async (ctx) => {
    const list = await ctx.db.query("sessions").withIndex("by_startedAt").order("desc").take(20);
    return list
      .filter((s) => !s.open)
      .map((s) => ({ _id: s._id, startedAt: s.startedAt, endedAt: s.endedAt, report: s.report ?? null }));
  },
});
