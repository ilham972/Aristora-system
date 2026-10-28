// Fighter: the circles of a theory book. Every change goes to the student's work in his current book.

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { asFighter, cleanBy, currentSession, fail, getStudent, log, refresh, touch, workPlace } from "./lib/backend";
import type { Fighter } from "./lib/book";
import { SOLO_STATES, TEACH_STATES, type Mark, type MarkState } from "./lib/status";
import { markState, markValue } from "./schema";
import { actor } from "./lib/auth";

function checkState(book: Fighter, q: number, s: MarkState) {
  if (!book.isQuestion(q)) fail("That question is not in this book.");
  const type = book.typeOf(q);
  if (type === "teach" && !(TEACH_STATES as readonly string[]).includes(s)) {
    fail(`Q${q} is a teacher question: it can only be taught or skipped.`);
  }
  if (type === "solo" && !(SOLO_STATES as readonly string[]).includes(s)) {
    fail(`Q${q} is a ladder question: it can't be marked "taught".`);
  }
}

/** The student's theory book and his circles in it, ready to change. */
async function fighterWork(ctx: MutationCtx, student: Doc<"students">, unitId: Doc<"units">["_id"] | undefined, now: number) {
  const { unit, book, progress } = await workPlace(ctx, student, "fighter", unitId, now);
  return { unit, book: asFighter(book), progress };
}

const unitArg = v.optional(v.id("units"));

/** Set one circle. Correction uses right / wrong / slip; teachers use taught / skip / explained. */
export const set = mutation({
  args: {
    token: v.optional(v.string()),
    studentId: v.id("students"),
    q: v.number(),
    s: v.union(markState, v.null()),
    unitId: unitArg,
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "theory", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress } = await fighterWork(ctx, student, args.unitId, now);
    if (!book.isQuestion(args.q)) fail("That question is not in this book.");
    if (args.s !== null) checkState(book, args.q, args.s);
    const key = String(args.q);
    const prev: Mark | null = progress.marks[key] ?? null;
    if ((prev?.s ?? null) === args.s) return { prev, changed: false };

    const marks = { ...progress.marks };
    if (args.s === null) {
      delete marks[key];
    } else {
      const n = (prev?.n ?? 0) + (args.s === "wrong" ? 1 : 0);
      marks[key] = n > 0 ? { s: args.s, n, t: now } : { s: args.s, t: now };
    }
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { marks, updatedAt: now });
    if (book.typeOf(args.q) === "solo") await ctx.db.patch(student._id, { lastActivityAt: now });
    await log(ctx, session, now, {
      kind: "mark",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      q: args.q,
      value: args.s ?? "clear",
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    return { prev, changed: true };
  },
});

/** Undo: put a circle back exactly as it was. */
export const restore = mutation({
  args: {
    token: v.optional(v.string()),
    studentId: v.id("students"),
    q: v.number(),
    mark: v.union(markValue, v.null()),
    unitId: unitArg,
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "theory", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress } = await fighterWork(ctx, student, args.unitId, now);
    if (!book.isQuestion(args.q)) fail("That question is not in this book.");
    if (args.mark) checkState(book, args.q, args.mark.s);
    const marks = { ...progress.marks };
    if (args.mark === null) delete marks[String(args.q)];
    else marks[String(args.q)] = args.mark;
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { marks, updatedAt: now });
    await log(ctx, session, now, {
      kind: "undo",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      q: args.q,
      value: args.mark?.s ?? "clear",
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
  },
});

/**
 * Several circles of one student at once: what a burst of taps on the board
 * saves (only the final state of each circle is sent). Returns what each was
 * before, so the phone can offer Undo.
 */
export const setMany = mutation({
  args: {
    token: v.optional(v.string()),
    studentId: v.id("students"),
    items: v.array(v.object({ q: v.number(), s: v.union(markState, v.null()) })),
    unitId: unitArg,
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "theory", "evaluation"], args.by);
    const now = Date.now();
    if (args.items.length === 0) return { prev: [] as { q: number; mark: Mark | null }[] };
    if (args.items.length > 200) fail("Too many circles at once.");
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress } = await fighterWork(ctx, student, args.unitId, now);
    for (const it of args.items) {
      if (!book.isQuestion(it.q)) fail("That question is not in this book.");
      if (it.s !== null) checkState(book, it.q, it.s);
    }
    const marks = { ...progress.marks };
    const prev: { q: number; mark: Mark | null }[] = [];
    const changed: { q: number; s: MarkState | null }[] = [];
    for (const it of args.items) {
      const key = String(it.q);
      const before: Mark | null = marks[key] ?? null;
      if ((before?.s ?? null) === it.s) continue;
      prev.push({ q: it.q, mark: before });
      changed.push(it);
      if (it.s === null) {
        delete marks[key];
      } else {
        const n = (before?.n ?? 0) + (it.s === "wrong" ? 1 : 0);
        marks[key] = n > 0 ? { s: it.s, n, t: now } : { s: it.s, t: now };
      }
    }
    if (changed.length === 0) return { prev };
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { marks, updatedAt: now });
    if (changed.some((c) => book.typeOf(c.q) === "solo")) await ctx.db.patch(student._id, { lastActivityAt: now });
    const by = cleanBy(args.by);
    for (const c of changed) {
      await log(ctx, session, now, {
        kind: "mark",
        by,
        studentId: student._id,
        name: student.name,
        unit: unit.key,
        q: c.q,
        value: c.s ?? "clear",
      });
    }
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    return { prev };
  },
});

/** Undo a burst: put circles back exactly as they were. */
export const restoreMany = mutation({
  args: {
    token: v.optional(v.string()),
    studentId: v.id("students"),
    items: v.array(v.object({ q: v.number(), mark: v.union(markValue, v.null()) })),
    unitId: unitArg,
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "theory", "evaluation"], args.by);
    const now = Date.now();
    if (args.items.length > 200) fail("Too many circles at once.");
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress } = await fighterWork(ctx, student, args.unitId, now);
    for (const it of args.items) {
      if (!book.isQuestion(it.q)) fail("That question is not in this book.");
      if (it.mark) checkState(book, it.q, it.mark.s);
    }
    const marks = { ...progress.marks };
    for (const it of args.items) {
      if (it.mark === null) delete marks[String(it.q)];
      else marks[String(it.q)] = it.mark;
    }
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { marks, updatedAt: now });
    const by = cleanBy(args.by);
    for (const it of args.items) {
      await log(ctx, session, now, {
        kind: "undo",
        by,
        studentId: student._id,
        name: student.name,
        unit: unit.key,
        q: it.q,
        value: it.mark?.s ?? "clear",
      });
    }
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
  },
});

/** R2: he already knows a whole section, so its teacher questions are skipped. */
export const skipSection = mutation({
  args: { token: v.optional(v.string()), studentId: v.id("students"), section: v.string(), unitId: unitArg, by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "theory", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress } = await fighterWork(ctx, student, args.unitId, now);
    const section = book.sectionById(args.section);
    if (!section || section.teach.length === 0) fail("That section has no theory to skip.");
    const marks = { ...progress.marks };
    for (const q of section.teach) {
      if (!marks[String(q)]) marks[String(q)] = { s: "skip", t: now };
    }
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { marks, updatedAt: now });
    await log(ctx, session, now, {
      kind: "skip-section",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: section.id,
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
  },
});
