import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { viewer } from "./lib/auth";

/**
 * Everything the phones need, live: the students, each one's work in his current book,
 * the books in use, the open calls and the session.
 */
export const get = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    const students = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const progress: Record<string, Doc<"progress">> = {};
    const books: Record<string, Doc<"books">> = {};
    for (const s of students) {
      if (!s.unitId || (s.stage !== "fighter" && s.stage !== "master")) continue;
      const stage = s.stage;
      const unitId = s.unitId;
      const p = await ctx.db
        .query("progress")
        .withIndex("by_student_unit_stage", (q) => q.eq("studentId", s._id).eq("unitId", unitId).eq("stage", stage))
        .first();
      if (p) progress[s._id] = p;
      const key = `${unitId}:${stage}`;
      if (!(key in books)) {
        const b = await ctx.db
          .query("books")
          .withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", stage))
          .first();
        if (b) books[key] = b;
      }
    }
    const requested = await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", "requested")).collect();
    const sent = await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", "sent")).collect();
    const session = await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first();
    const legacy = students.some((s) => !s.stage);
    return {
      students,
      progress,
      books,
      calls: [...requested, ...sent],
      session: session
        ? { _id: session._id, startedAt: session.startedAt, lastActivityAt: session.lastActivityAt }
        : null,
      /** Data from before grades and stages: the phone runs setup.ensure first. */
      legacy,
    };
  },
});

export const archived = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "students");
    const list = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", true))
      .collect();
    return list.map((s) => ({ _id: s._id, name: s.name, demo: s.demo ?? false, grade: s.grade ?? null }));
  },
});

export const history = query({
  args: { token: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "reports");
    const { limit } = args;
    const n = Math.min(Math.max(Math.floor(limit ?? 80), 1), 300);
    return await ctx.db.query("events").withIndex("by_at").order("desc").take(n);
  },
});

export const sessions = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "reports");
    const list = await ctx.db.query("sessions").withIndex("by_startedAt").order("desc").take(20);
    return list
      .filter((s) => !s.open)
      .map((s) => ({ _id: s._id, startedAt: s.startedAt, endedAt: s.endedAt, report: s.report ?? null }));
  },
});
