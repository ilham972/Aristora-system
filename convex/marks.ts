import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { cleanBy, currentSession, fail, getStudent, log, refresh, touch } from "./lib/backend";
import { SOLO_STATES, TEACH_STATES, type Mark, type MarkState } from "./lib/status";
import { isQuestion, sectionById, typeOf } from "./lib/unit";
import { markState, markValue } from "./schema";

function checkState(q: number, s: MarkState) {
  if (!isQuestion(q)) fail("That question is not in this unit.");
  const type = typeOf(q);
  if (type === "teach" && !(TEACH_STATES as readonly string[]).includes(s)) {
    fail(`Q${q} is a teacher question: it can only be taught or skipped.`);
  }
  if (type === "solo" && !(SOLO_STATES as readonly string[]).includes(s)) {
    fail(`Q${q} is a ladder question: it can't be marked "taught".`);
  }
}

/** Set one circle. Correction uses right / wrong / slip; teachers use taught / skip / explained. */
export const set = mutation({
  args: {
    studentId: v.id("students"),
    q: v.number(),
    s: v.union(markState, v.null()),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (!isQuestion(args.q)) fail("That question is not in this unit.");
    if (args.s !== null) checkState(args.q, args.s);
    const student = await getStudent(ctx, args.studentId);
    const key = String(args.q);
    const prev: Mark | null = student.marks[key] ?? null;
    if ((prev?.s ?? null) === args.s) return { prev, changed: false };

    const marks = { ...student.marks };
    if (args.s === null) {
      delete marks[key];
    } else {
      const n = (prev?.n ?? 0) + (args.s === "wrong" ? 1 : 0);
      marks[key] = n > 0 ? { s: args.s, n, t: now } : { s: args.s, t: now };
    }
    const session = await currentSession(ctx, now);
    await ctx.db.patch(student._id, typeOf(args.q) === "solo" ? { marks, lastActivityAt: now } : { marks });
    await log(ctx, session, now, {
      kind: "mark",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
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
    studentId: v.id("students"),
    q: v.number(),
    mark: v.union(markValue, v.null()),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (!isQuestion(args.q)) fail("That question is not in this unit.");
    if (args.mark) checkState(args.q, args.mark.s);
    const student = await getStudent(ctx, args.studentId);
    const marks = { ...student.marks };
    if (args.mark === null) delete marks[String(args.q)];
    else marks[String(args.q)] = args.mark;
    const session = await currentSession(ctx, now);
    await ctx.db.patch(student._id, { marks });
    await log(ctx, session, now, {
      kind: "undo",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      q: args.q,
      value: args.mark?.s ?? "clear",
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
  },
});

/** R2: he already knows a whole section, so its teacher questions are skipped. */
export const skipSection = mutation({
  args: { studentId: v.id("students"), section: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const section = sectionById(args.section);
    if (!section || section.teach.length === 0) fail("That section has no theory to skip.");
    const student = await getStudent(ctx, args.studentId);
    const marks = { ...student.marks };
    for (const q of section.teach) {
      if (!marks[String(q)]) marks[String(q)] = { s: "skip", t: now };
    }
    const session = await currentSession(ctx, now);
    await ctx.db.patch(student._id, { marks });
    await log(ctx, session, now, {
      kind: "skip-section",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      value: section.id,
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
  },
});
