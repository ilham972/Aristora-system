import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { viewer } from "./lib/auth";
import { givenWork, mayBeOpen, openWork } from "./lib/backend";

/**
 * Everything the phones need, live: the students, each one's work in his current book,
 * the books in use, the open calls and the session.
 * A student in class works on several books at once: `more` = his other books with something waiting (a level handed
 * in, marks to explain, questions for Theory), so Evaluation, Theory and Correction see every book; `given` = the
 * books given to him (not his book now): whether each still has work (then he is not "out of work") and whether it is
 * finished (Correction's row of his books leaves it out).
 * Two classes share the server (31 Oct 2026): the real class, and the test class (test students) that only a phone in
 * test mode sees (`test`). Each phone gets its own class's students and their calls; `tests` = how many test students
 * there are (so a real-class phone can offer the switch).
 */
export const get = query({
  args: { token: v.optional(v.string()), test: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    const everyone = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const test = !!args.test;
    const students = everyone.filter((s) => !!s.test === test);
    const tests = everyone.filter((s) => s.test).length;
    const ours = new Set(students.map((s) => s._id as string));
    const progress: Record<string, Doc<"progress">> = {};
    const books: Record<string, Doc<"books">> = {};
    const more: Record<string, Doc<"progress">[]> = {};
    const given: Record<string, { unitId: Id<"units">; stage: "fighter" | "master"; work: boolean; done: boolean }[]> = {};
    const cache = new Map<string, Doc<"books"> | null>();
    const bookOf = async (unitId: Id<"units">, stage: "fighter" | "master") => {
      const key = `${unitId}:${stage}`;
      if (!cache.has(key)) {
        cache.set(
          key,
          await ctx.db
            .query("books")
            .withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", stage))
            .first(),
        );
      }
      return cache.get(key) ?? null;
    };
    const requested = (await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", "requested")).collect()).filter((c) =>
      ours.has(c.studentId),
    );
    const sent = (await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", "sent")).collect()).filter((c) => ours.has(c.studentId));
    // A book a room has him for travels while the call lasts (so her card shows that book, even with nothing left).
    const called = new Set([...requested, ...sent].map((c) => `${c.studentId}:${c.unitId}:${c.stage}`));
    for (const s of students) {
      if (!s.present) continue;
      for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
        if (p.unitId === s.unitId && p.stage === s.stage) continue;
        const inRoom = called.has(`${s._id}:${p.unitId}:${p.stage}`);
        if (!inRoom && !mayBeOpen(p)) continue;
        const b = await bookOf(p.unitId, p.stage);
        if (!b || (!inRoom && !openWork(b, p))) continue;
        (more[s._id] ??= []).push(p);
        books[`${p.unitId}:${p.stage}`] = b;
      }
      const g = await givenWork(ctx, s, cache);
      if (g.length) given[s._id] = g;
    }
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
        const b = await bookOf(unitId, stage);
        if (b) books[key] = b;
      }
    }
    const session = await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first();
    const legacy = students.some((s) => !s.stage);
    return {
      students,
      progress,
      books,
      more,
      given,
      calls: [...requested, ...sent],
      session: session
        ? { _id: session._id, startedAt: session.startedAt, lastActivityAt: session.lastActivityAt, stats: session.stats ?? {} }
        : null,
      /** Data from before grades and stages: the phone runs setup.ensure first. */
      legacy,
      /** Test students in the test class (any phone may switch to it: Settings). */
      tests,
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
    return list.map((s) => ({
      _id: s._id,
      name: s.name,
      demo: s.demo ?? false,
      test: s.test ?? false,
      grade: s.grade ?? null,
      created: s._creationTime,
      archivedAt: s.archivedAt ?? null,
    }));
  },
});

/** Sign-ins, PINs and people changes: the owner's business only. */
const ACCOUNT_KINDS = new Set([
  "owner-setup",
  "sign-in",
  "sign-out",
  "pin-set",
  "pin-clear",
  "person-add",
  "person-edit",
  "person-remove",
  "link-made",
  "device-out",
]);

export const history = query({
  args: { token: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await viewer(ctx, args.token, "reports");
    const { limit } = args;
    const n = Math.min(Math.max(Math.floor(limit ?? 80), 1), 300);
    if (user.role === "owner") return await ctx.db.query("events").withIndex("by_at").order("desc").take(n);
    const rows = await ctx.db.query("events").withIndex("by_at").order("desc").take(n * 2);
    return rows.filter((e) => !ACCOUNT_KINDS.has(e.kind)).slice(0, n);
  },
});

export const sessions = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "reports");
    const list = await ctx.db.query("sessions").withIndex("by_startedAt").order("desc").take(20);
    // A class only the test class used has an empty report (test students are never in it): not a class.
    const empty = (r: unknown) => !!r && Array.isArray((r as { students?: unknown }).students) && (r as { students: unknown[] }).students.length === 0;
    return list
      .filter((s) => !s.open && !empty(s.report))
      .map((s) => ({ _id: s._id, startedAt: s.startedAt, endedAt: s.endedAt, report: s.report ?? null }));
  },
});
