// The whole-class lesson (3 Nov 2026, his ask: "teach Grade 10 all students" at the board, any unit, any section, any
// question, from the top bar). Not a room: nobody is called, everyone stays at his desk. What it saves follows the
// books (his pick when asked: only those on that book count; a student without it can listen, nothing is saved for him):
// - a theory book: a teacher question taught, for every ticked student who has that book (his book now, a book given,
//   or one he worked in). Taught opens the section's own questions for him, exactly as a Theory lesson does;
// - a workbook: a question he lost marks on, still waiting for a teacher: waiting for Theory = taught (tt), waiting for
//   Evaluation = explained (x): one explanation at the board serves both queues.
// Each tap is saved at once (the phone may die mid-lesson); the toast's Undo puts back exactly what that tap changed.
// - The history: one "board" event per student and question (value taught / explained; `who` = the teacher), so the
//   teacher card counts the lesson as her work (convex/lib/boss.ts: a board lesson's time, BOARD_*), and he was seen by
//   that room today (no "no teacher yet" dot). Her score: each question, and once per lesson (`lesson`, the page's first
//   tap of a lesson) the lesson and the students taught.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { asFighter, bookFor, cleanBy, currentSession, fail, getStudent, log, masterState, progressFor, refresh, roomStats, touch } from "./lib/backend";
import { teachState, type MQ, type MState } from "./lib/master";
import { OL } from "./lib/syllabus";
import type { MarkState } from "./lib/status";

const bookStage = v.union(v.literal("fighter"), v.literal("master"));
/** One tap's change for one student, so Undo can put it back: a teacher question's circle before, or the workbook
 *  question's state before (waiting for Evaluation or for Theory). */
const was = v.union(v.literal("none"), v.literal("skip"), v.literal("eval"), v.literal("theory"));
type Was = "none" | "skip" | "eval" | "theory";

/** Students in class today who may sit this book's lesson: its grade (OL books: Grades 10 and 11). */
async function hereFor(ctx: QueryCtx, unit: Doc<"units">, test: boolean) {
  const grades = unit.grade === OL ? [10, 11] : [unit.grade];
  const all = await ctx.db
    .query("students")
    .withIndex("by_archived", (q) => q.eq("archived", false))
    .collect();
  return all.filter((s) => s.present && !!s.test === test && s.grade !== undefined && grades.includes(s.grade)).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The lesson's people and the book: everyone here in that grade, each with whether he has the book (`has`), whether it
 * is his book now or a book given to him (`now`), where he is, and his state on what can be taught (theory book: the
 * teacher questions' circles; workbook: the lost questions' teach state). Teachers who teach only (and the owner).
 */
export const roster = query({
  args: { token: v.optional(v.string()), unitId: v.id("units"), stage: bookStage, test: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "theory", "evaluation");
    const unit = await ctx.db.get(args.unitId);
    if (!unit) return null;
    const book = await bookFor(ctx, unit._id, args.stage);
    if (!book) return null;
    const teachQs = book.data.kind === "fighter" ? new Set(book.data.sections.flatMap((s) => s.teach.map(String))) : null;
    const students = await hereFor(ctx, unit, !!args.test);
    const out = [];
    for (const s of students) {
      const p = await progressFor(ctx, s._id, unit._id, args.stage);
      const given = p
        ? (await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()).some(
            (h) => h.unitId === unit._id && h.stage === args.stage,
          )
        : false;
      let marks: Record<string, MarkState> | undefined;
      let waits: Record<string, "eval" | "theory" | "explained" | "taught"> | undefined;
      if (p && teachQs) {
        marks = {};
        for (const [q, m] of Object.entries(p.marks ?? {})) if (teachQs.has(q) && m) marks[q] = m.s;
      } else if (p) {
        waits = {};
        for (const [q, r] of Object.entries(masterState(p).q)) {
          const t = teachState(r);
          if (t) waits[q] = t;
        }
      }
      out.push({
        id: s._id,
        name: s.name,
        grade: s.grade ?? null,
        unitId: s.unitId ?? null,
        stage: s.stage ?? null,
        has: !!p,
        now: !!p && ((s.unitId === unit._id && s.stage === args.stage) || given),
        ...(marks ? { marks } : {}),
        ...(waits ? { waits } : {}),
      });
    }
    return {
      unitId: unit._id,
      stage: args.stage,
      data: book.data,
      keyCount: book.keyCount ?? 0,
      qCount: book.qCount ?? 0,
      students: out,
    };
  },
});

/**
 * Taught at the board, for these students: each one it can be saved for (see the top). Returns who changed (and what
 * each had before, for Undo) and who had nothing to save.
 */
export const taught = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    stage: bookStage,
    q: v.number(),
    studentIds: v.array(v.id("students")),
    /** The page's first tap of a lesson: it counts on her score as a lesson. */
    lesson: v.optional(v.boolean()),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["theory", "evaluation"], args.by);
    if (args.studentIds.length > 200) fail("Too many students at once.");
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const book = await bookFor(ctx, unit._id, args.stage);
    if (!book) fail(`${unit.key} has no ${args.stage === "fighter" ? "theory book" : "workbook"} in the app.`);
    const f = args.stage === "fighter" ? asFighter(book) : null;
    if (f && (!f.isQuestion(args.q) || f.typeOf(args.q) !== "teach")) fail(`Q${args.q} isn't a teacher question: only those are taught.`);
    const by = cleanBy(args.by);
    const room = by === "evaluation" ? "evaluation" : "theory";
    const session = await currentSession(ctx, now);
    const changed: { studentId: Id<"students">; name: string; was: Was }[] = [];
    const nothing: string[] = [];
    let first: Doc<"students"> | null = null;
    for (const id of [...new Set(args.studentIds)]) {
      const s = await getStudent(ctx, id);
      const p = await progressFor(ctx, s._id, unit._id, args.stage);
      if (!p) {
        nothing.push(s.name);
        continue;
      }
      const key = String(args.q);
      if (f) {
        const before = p.marks?.[key] ?? null;
        if (before?.s === "taught") continue;
        await ctx.db.patch(p._id, { marks: { ...(p.marks ?? {}), [key]: { s: "taught", t: now } }, updatedAt: now });
        await log(ctx, session, now, { kind: "board", by, studentId: s._id, name: s.name, unit: unit.key, q: args.q, value: "taught" });
        changed.push({ studentId: s._id, name: s.name, was: before?.s === "skip" ? "skip" : "none" });
      } else {
        const m: MState = { ...masterState(p), q: { ...masterState(p).q } };
        const r = m.q[key] as MQ | undefined;
        const t = teachState(r);
        if (t !== "eval" && t !== "theory") {
          if (t === null) nothing.push(s.name);
          continue;
        }
        m.q[key] = t === "theory" ? { ...r!, tt: now } : { ...r!, x: now };
        await ctx.db.patch(p._id, { m, updatedAt: now });
        await log(ctx, session, now, { kind: "board", by, studentId: s._id, name: s.name, unit: unit.key, q: args.q, value: t === "theory" ? "taught" : "explained" });
        changed.push({ studentId: s._id, name: s.name, was: t });
      }
      // Seen by this room today: he isn't "no teacher yet", and the room's queue puts the unseen first.
      await ctx.db.patch(s._id, { lastSeenAt: now, seen: { ...s.seen, [room]: now } });
      await refresh(ctx, s._id, now, session);
      await roomStats(ctx, s, session, room, { qs: 1 });
      first ??= s;
    }
    if (first && args.lesson) await roomStats(ctx, first, session, room, room === "theory" ? { lessons: 1, done: changed.length } : { done: changed.length });
    if (changed.length) await touch(ctx, session, now);
    return { changed, nothing };
  },
});

/** The toast's Undo: puts back exactly what one Taught tap changed (each student as he was before it). */
export const untaught = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    stage: bookStage,
    q: v.number(),
    items: v.array(v.object({ studentId: v.id("students"), was })),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["theory", "evaluation"], args.by);
    if (args.items.length > 200) fail("Too many students at once.");
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const by = cleanBy(args.by);
    const room = by === "evaluation" ? "evaluation" : "theory";
    const session = await currentSession(ctx, now);
    const key = String(args.q);
    let n = 0;
    for (const it of args.items) {
      const s = await ctx.db.get(it.studentId);
      if (!s) continue;
      const p = await progressFor(ctx, s._id, unit._id, args.stage);
      if (!p) continue;
      if (args.stage === "fighter") {
        if (p.marks?.[key]?.s !== "taught") continue; // changed since: leave it
        const marks = { ...(p.marks ?? {}) };
        if (it.was === "skip") marks[key] = { s: "skip", t: now };
        else delete marks[key];
        await ctx.db.patch(p._id, { marks, updatedAt: now });
        await log(ctx, session, now, { kind: "board-undo", by, studentId: s._id, name: s.name, unit: unit.key, q: args.q, value: "taught" });
      } else {
        const m: MState = { ...masterState(p), q: { ...masterState(p).q } };
        const r = m.q[key];
        if (!r) continue;
        if (it.was === "theory" && r.tt) {
          const { tt: _tt, ...rest } = r;
          m.q[key] = rest;
        } else if (it.was === "eval" && r.x) {
          const { x: _x, ...rest } = r;
          m.q[key] = rest;
        } else continue;
        await ctx.db.patch(p._id, { m, updatedAt: now });
        await log(ctx, session, now, { kind: "board-undo", by, studentId: s._id, name: s.name, unit: unit.key, q: args.q, value: it.was === "theory" ? "taught" : "explained" });
      }
      await refresh(ctx, s._id, now, session);
      await roomStats(ctx, s, session, room, { qs: -1 });
      n++;
    }
    if (n) await touch(ctx, session, now);
    return { n };
  },
});
