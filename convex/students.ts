import { v } from "convex/values";
import { mutation } from "./_generated/server";
import {
  activeCalls,
  cleanBy,
  cleanName,
  currentSession,
  ensureSession,
  fail,
  getStudent,
  log,
  refresh,
  touch,
} from "./lib/backend";

export const add = mutation({
  args: { name: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const name = cleanName(args.name);
    const all = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
    if (all.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      fail(`"${name}" is already on the list. Add an initial, like "${name} R".`);
    }
    if (all.length >= 60) fail("60 students is the limit for one class.");
    const session = await currentSession(ctx, now);
    const id = await ctx.db.insert("students", { name, archived: false, present: false, marks: {}, idleMs: 0 });
    await log(ctx, session, now, { kind: "student-add", by: cleanBy(args.by), studentId: id, name });
    return id;
  },
});

export const rename = mutation({
  args: { id: v.id("students"), name: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    const name = cleanName(args.name);
    const all = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
    if (all.some((o) => o._id !== s._id && o.name.toLowerCase() === name.toLowerCase())) {
      fail(`"${name}" is already on the list.`);
    }
    await ctx.db.patch(s._id, { name });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "student-rename", by: cleanBy(args.by), studentId: s._id, name, value: s.name });
  },
});

/** Remove from the class (kept, and can be restored with all progress). */
export const setArchived = mutation({
  args: { id: v.id("students"), archived: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    const session = await currentSession(ctx, now);
    if (args.archived) {
      for (const c of await activeCalls(ctx, s._id)) {
        await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
      }
      await refreshOut(ctx, s._id, now, session);
      await ctx.db.patch(s._id, { archived: true, present: false, room: undefined });
    } else {
      const all = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
      if (all.some((o) => o.name.toLowerCase() === s.name.toLowerCase())) {
        fail(`Rename the current "${s.name}" first.`);
      }
      await ctx.db.patch(s._id, { archived: false, present: false });
    }
    await log(ctx, session, now, {
      kind: args.archived ? "student-remove" : "student-restore",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
    });
  },
});

async function refreshOut(ctx: Parameters<typeof refresh>[0], id: Parameters<typeof refresh>[1], now: number, session: Parameters<typeof refresh>[3]) {
  await ctx.db.patch(id, { present: false, room: undefined });
  await refresh(ctx, id, now, session);
}

/** Tap in when he arrives, tap out when he leaves. The first tap-in starts the session. */
export const setPresent = mutation({
  args: { id: v.id("students"), present: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    if (s.archived) fail(`${s.name} was removed from the class.`);
    const by = cleanBy(args.by);
    if (args.present) {
      const session = await ensureSession(ctx, now, by);
      if (!s.present) {
        await ctx.db.patch(s._id, { present: true, lastActivityAt: now });
        await log(ctx, session, now, { kind: "in", by, studentId: s._id, name: s.name });
      }
      await refresh(ctx, s._id, now, session);
      await touch(ctx, session, now);
    } else {
      const session = await currentSession(ctx, now);
      for (const c of await activeCalls(ctx, s._id)) {
        await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
      }
      if (s.present) await log(ctx, session, now, { kind: "out", by, studentId: s._id, name: s.name });
      await refreshOut(ctx, s._id, now, session);
      await touch(ctx, session, now);
    }
  },
});
