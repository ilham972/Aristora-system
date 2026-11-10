import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { viewer } from "./lib/auth";
import { givenWork, mayBeOpen, openWork } from "./lib/backend";
import { recentSim, simInfo } from "./sim";

/**
 * Everything the phones need, live: the students, each one's work in his current book,
 * the books in use, the open calls and the session.
 * A student in class works on several books at once: `more` = his other books with something waiting (a level handed
 * in, marks to explain, questions for Theory), so Evaluation, Theory and Correction see every book; `given` = the
 * books given to him (not his book now): whether each still has work (then he is not "out of work") and whether it is
 * finished (Correction's row of his books leaves it out).
 * Two classes share the server (31 Oct 2026): the real class, and the simulation's made-up students (test students,
 * 1 Nov 2026) that only a phone showing the simulation sees (`test`). Each phone gets its own class's students and their
 * calls; `tests` = how many test students there are (so a real-class phone can offer the switch); `sim` = the
 * simulation running or just ended (the Join banner, SIM in the top bar). A phone showing the simulation gets its
 * practice score as the session's `stats` (the Theory and Evaluation pages' score line).
 */
export const get = query({
  args: { token: v.optional(v.string()), test: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    const light = await lightBoard(ctx, !!args.test);
    const progress: Record<string, Doc<"progress">> = {};
    const books: Record<string, Doc<"books">> = {};
    const more: Record<string, Doc<"progress">[]> = {};
    const given: Record<string, Given[]> = {};
    const cache = new Map<string, Doc<"books"> | null>();
    for (const s of light.students) {
      const h = await hisBoard(ctx, s, light.calls, cache);
      if (h.progress) progress[s._id] = h.progress;
      Object.assign(books, h.books);
      if (h.more) more[s._id] = h.more;
      if (h.given) given[s._id] = h.given;
    }
    return { ...light, progress, books, more, given };
  },
});

/**
 * The board without anyone's books (10 Nov 2026, the Convex limit hit on his first month: every tap re-read every
 * student's marks on every phone): the students, the calls, the session, the simulation. It changes when a student,
 * a call or the session does; each student's books come from `his`, which changes only when HIS do. The phones put the
 * two together (src/store.ts) into the same board as `get` (kept for old phones and the tests; a test proves the two
 * add up to the same board).
 */
export const live = query({
  args: { token: v.optional(v.string()), test: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    return await lightBoard(ctx, !!args.test);
  },
});

/** One student's part of the board: his book now's progress, his other books with work (in class), the books given. */
export const his = query({
  args: { token: v.optional(v.string()), id: v.id("students") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    const s = await ctx.db.get(args.id);
    if (!s || s.archived) return { progress: null, books: {}, more: null, given: null };
    const calls = [
      ...(await ctx.db
        .query("calls")
        .withIndex("by_student_status", (q) => q.eq("studentId", s._id).eq("status", "requested"))
        .collect()),
      ...(await ctx.db
        .query("calls")
        .withIndex("by_student_status", (q) => q.eq("studentId", s._id).eq("status", "sent"))
        .collect()),
    ];
    return await hisBoard(ctx, s, calls, new Map());
  },
});

type Given = { unitId: Id<"units">; stage: "fighter" | "master"; work: boolean; done: boolean };

async function lightBoard(ctx: QueryCtx, test: boolean) {
  const everyone = await ctx.db
    .query("students")
    .withIndex("by_archived", (q) => q.eq("archived", false))
    .collect();
  const students = everyone.filter((s) => !!s.test === test);
  const tests = everyone.filter((s) => s.test).length;
  const ours = new Set(students.map((s) => s._id as string));
  const requested = (await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", "requested")).collect()).filter((c) =>
    ours.has(c.studentId),
  );
  const sent = (await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", "sent")).collect()).filter((c) => ours.has(c.studentId));
  const session = await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first();
  const legacy = students.some((s) => !s.stage);
  const sim = await recentSim(ctx, Date.now());
  return {
    students,
    calls: [...requested, ...sent],
    session: session
      ? {
          _id: session._id,
          startedAt: session.startedAt,
          lastActivityAt: session.lastActivityAt,
          stats: (test ? sim?.stats : session.stats) ?? {},
        }
      : null,
    /** Data from before grades and stages: the phone runs setup.ensure first. */
    legacy,
    /** Test students: the simulation's (any phone may switch to it: Settings, or the Join banner). */
    tests,
    sim: sim ? simInfo(sim) : null,
  };
}

/** His books on the board (the same for `get` and `his`): `calls` = the open calls (his are picked out). */
async function hisBoard(ctx: QueryCtx, s: Doc<"students">, calls: Doc<"calls">[], cache: Map<string, Doc<"books"> | null>) {
  const books: Record<string, Doc<"books">> = {};
  let more: Doc<"progress">[] | null = null;
  let given: Given[] | null = null;
  let progress: Doc<"progress"> | null = null;
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
  const mine = calls.filter((c) => c.studentId === s._id);
  if (s.present) {
    // A book a room has him for travels while the call lasts (so her card shows that book, even with nothing left).
    const called = new Set(mine.map((c) => `${c.unitId}:${c.stage}`));
    // A consultation (5 Nov 2026): every book of his changed since it began travels too, so what she explained in it
    // stays on her screen as ✓ even once nothing waits there.
    const since = mine.find((c) => c.consult)?.createdAt;
    for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
      if (p.unitId === s.unitId && p.stage === s.stage) continue;
      // The other book of his topic tute (one printed book: the ladder + the past papers) always comes along.
      const twin = p.unitId === s.unitId && !!(await bookOf(p.unitId, p.stage))?.tute;
      const inRoom = called.has(`${p.unitId}:${p.stage}`) || (since !== undefined && p.updatedAt >= since);
      if (!twin && !inRoom && !mayBeOpen(p)) continue;
      const b = await bookOf(p.unitId, p.stage);
      if (!b || (!twin && !inRoom && !openWork(b, p))) continue;
      (more ??= []).push(p);
      books[`${p.unitId}:${p.stage}`] = b;
    }
    const g = await givenWork(ctx, s, cache);
    if (g.length) given = g;
  }
  if (s.unitId && (s.stage === "fighter" || s.stage === "master")) {
    const stage = s.stage;
    const unitId = s.unitId;
    progress =
      (await ctx.db
        .query("progress")
        .withIndex("by_student_unit_stage", (q) => q.eq("studentId", s._id).eq("unitId", unitId).eq("stage", stage))
        .first()) ?? null;
    const b = await bookOf(unitId, stage);
    if (b) books[`${unitId}:${stage}`] = b;
  }
  return { progress, books, more, given };
}

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
  "claude-link",
  "owner-setup",
  "sign-in",
  "sign-out",
  "pin-set",
  "pin-clear",
  "person-add",
  "person-edit",
  "person-role",
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
    // Money (9 Nov 2026: fees, prints, the team's pay) is the owner's too.
    return rows.filter((e) => !ACCOUNT_KINDS.has(e.kind) && !e.kind.startsWith("money-")).slice(0, n);
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
