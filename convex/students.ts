import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type QueryCtx } from "./_generated/server";
import {
  activeCalls,
  cleanBy,
  cleanName,
  currentSession,
  endVisit,
  ensureProgress,
  ensureSession,
  fail,
  getStudent,
  lastVisit,
  log,
  refresh,
  startVisit,
  touch,
  UNDO_IN_MS,
  type Stage,
} from "./lib/backend";
import { termOf } from "./lib/syllabus";
import { bookStage, stage } from "./schema";
import { actor } from "./lib/auth";

const STAGE_WORD: Record<Stage, string> = { fighter: "Fighter", master: "Master", legend: "Legend", sprint: "Exam Sprint" };

/** First unit of a grade's term, in book order. */
async function firstUnit(ctx: QueryCtx, grade: number, term: number): Promise<Doc<"units"> | null> {
  const list = await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", grade)).collect();
  return list.filter((u) => u.term === term).sort((a, b) => a.order - b.order)[0] ?? null;
}

async function checkPlace(
  ctx: QueryCtx,
  grade: number,
  term: number,
  stage: Stage,
  unitId: Id<"units"> | undefined,
): Promise<Doc<"units"> | null> {
  if (!Number.isInteger(grade) || grade < 6 || grade > 11) fail("Grade must be 6 to 11.");
  if (![1, 2, 3].includes(term)) fail("Term must be 1, 2 or 3.");
  if (!unitId) {
    if (stage === "fighter" || stage === "master") fail("Choose the unit.");
    return null;
  }
  const unit = await ctx.db.get(unitId);
  if (!unit) fail("That unit no longer exists.");
  if (unit.grade !== grade) fail(`${unit.code} is a Grade ${unit.grade} unit, not Grade ${grade}.`);
  return unit;
}

export const add = mutation({
  args: {
    token: v.optional(v.string()),
    name: v.string(),
    grade: v.optional(v.number()),
    term: v.optional(v.number()),
    stage: v.optional(stage),
    unitId: v.optional(v.id("units")),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["students"]);
    const now = Date.now();
    const name = cleanName(args.name);
    const all = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
    if (all.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      fail(`"${name}" is already on the list. Add an initial, like "${name} R".`);
    }
    if (all.length >= 120) fail("120 students is the limit for one class list.");
    const grade = args.grade ?? 11;
    const term = args.term ?? termOf(now);
    const st: Stage = args.stage ?? "fighter";
    const unitId = args.unitId ?? (st === "fighter" || st === "master" ? (await firstUnit(ctx, grade, term))?._id : undefined);
    const unit = await checkPlace(ctx, grade, term, st, unitId);
    const session = await currentSession(ctx, now);
    const id = await ctx.db.insert("students", {
      name,
      archived: false,
      present: false,
      grade,
      term,
      stage: st,
      unitId: unit?._id,
      idleMs: 0,
    });
    if (unit && (st === "fighter" || st === "master")) await ensureProgress(ctx, id, unit._id, st, now);
    await log(ctx, session, now, {
      kind: "student-add",
      by: cleanBy(args.by),
      studentId: id,
      name,
      unit: unit?.key,
      value: `Grade ${grade} · ${STAGE_WORD[st]}`,
    });
    return id;
  },
});

/**
 * Move a student: next unit, next stage, Exam Sprint before an exam (he comes back to where he was),
 * or up a grade after the third term. His work in every book is kept.
 */
export const move = mutation({
  args: {
    token: v.optional(v.string()),
    id: v.id("students"),
    grade: v.number(),
    term: v.number(),
    stage,
    unitId: v.optional(v.id("units")),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["any"], args.by);
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    const unit = await checkPlace(ctx, args.grade, args.term, args.stage, args.unitId);
    const patch: Partial<Doc<"students">> = { grade: args.grade, term: args.term, stage: args.stage, unitId: unit?._id };
    if (args.stage === "sprint" && s.stage !== "sprint" && s.stage) {
      patch.back = { stage: s.stage, unitId: s.unitId, term: s.term ?? args.term };
    } else if (args.stage !== "sprint") {
      patch.back = undefined;
    }
    await ctx.db.patch(s._id, { ...patch, lastActivityAt: now });
    if (unit && (args.stage === "fighter" || args.stage === "master")) await ensureProgress(ctx, s._id, unit._id, args.stage, now);
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, {
      kind: "move",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
      unit: unit?.key,
      value: `Grade ${args.grade} · Term ${args.term} · ${STAGE_WORD[args.stage]}`,
    });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
    return true;
  },
});

/** A unit's book handed to him (given) or taken back: Correction's unit sheet, "Books given". */
export const setGiven = mutation({
  args: {
    token: v.optional(v.string()),
    id: v.id("students"),
    unitId: v.id("units"),
    stage: bookStage,
    given: v.boolean(),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    if (s.grade !== undefined && unit.grade !== s.grade) fail(`${unit.code} is a Grade ${unit.grade} unit, not Grade ${s.grade}.`);
    const rows = (await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()).filter(
      (h) => h.unitId === unit._id && h.stage === args.stage,
    );
    if (args.given === rows.length > 0) return true;
    if (args.given) await ctx.db.insert("handouts", { studentId: s._id, unitId: unit._id, stage: args.stage, at: now, by: cleanBy(args.by) });
    else for (const h of rows) await ctx.db.delete(h._id);
    const session = await currentSession(ctx, now);
    await refresh(ctx, s._id, now, session); // a book given = work: he may not be out of work any more
    await log(ctx, session, now, {
      kind: args.given ? "book-given" : "book-given-off",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
      unit: unit.key,
      value: `${unit.key} ${args.stage === "fighter" ? "theory book" : "workbook"}`,
    });
    return true;
  },
});

export const rename = mutation({
  args: { token: v.optional(v.string()), id: v.id("students"), name: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["students"]);
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
  args: { token: v.optional(v.string()), id: v.id("students"), archived: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["students"]);
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    const session = await currentSession(ctx, now);
    if (args.archived) {
      for (const c of await activeCalls(ctx, s._id)) {
        await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
      }
      if (s.present) await endVisit(ctx, s._id, now);
      await refreshOut(ctx, s._id, now, session);
      await ctx.db.patch(s._id, { archived: true, present: false, room: undefined, archivedAt: now });
    } else {
      const all = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
      if (all.some((o) => o.name.toLowerCase() === s.name.toLowerCase())) {
        fail(`Rename the current "${s.name}" first.`);
      }
      await ctx.db.patch(s._id, { archived: false, present: false, archivedAt: undefined });
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

/**
 * Attendance: tap in when he arrives (the time goes in the register), tap out when he leaves.
 * The first tap-in starts the session. `undo` takes back a sign-in tapped by mistake: the visit is deleted,
 * as if it never happened (after UNDO_IN_MS it is an ordinary sign-out).
 */
export const setPresent = mutation({
  args: {
    token: v.optional(v.string()),
    id: v.id("students"),
    present: v.boolean(),
    undo: v.optional(v.boolean()),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    const now = Date.now();
    const first = await getStudent(ctx, args.id);
    if (first.archived) fail(`${first.name} was removed from the class.`);
    const by = cleanBy(args.by);
    if (args.present) {
      const session = await ensureSession(ctx, now, by);
      // Read him after the session check: a class left open since yesterday has just signed everyone out.
      const s = await getStudent(ctx, args.id);
      if (!s.present) {
        await ctx.db.patch(s._id, { present: true, lastActivityAt: now, lastInAt: now });
        await startVisit(ctx, s._id, now, session);
        await log(ctx, session, now, { kind: "in", by, studentId: s._id, name: s.name });
      }
      await refresh(ctx, s._id, now, session);
      await touch(ctx, session, now);
      return true;
    }
    const session = await currentSession(ctx, now);
    const s = await getStudent(ctx, args.id);
    for (const c of await activeCalls(ctx, s._id)) {
      await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
    }
    if (!s.present) {
      await refreshOut(ctx, s._id, now, session);
      return true;
    }
    const visit = await lastVisit(ctx, s._id);
    if (args.undo && visit && visit.outAt === undefined && now - visit.inAt <= UNDO_IN_MS) {
      // Tapped by mistake: he was never here. No visit, no idle time, his last arrival as before.
      await ctx.db.delete(visit._id);
      const before = await lastVisit(ctx, s._id);
      await ctx.db.patch(s._id, {
        present: false,
        room: undefined,
        idleSince: undefined,
        idleReason: undefined,
        lastInAt: before?.inAt,
      });
      await log(ctx, session, now, { kind: "in-undo", by, studentId: s._id, name: s.name });
      await touch(ctx, session, now);
      return true;
    }
    await endVisit(ctx, s._id, now);
    await log(ctx, session, now, { kind: "out", by, studentId: s._id, name: s.name });
    await refreshOut(ctx, s._id, now, session);
    await touch(ctx, session, now);
    return true;
  },
});
