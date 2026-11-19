// Exam mode (17 Nov 2026, his voice note; convex/lib/sakarath.ts): Settings → Books → Exam mode, one switch per grade
// (his answer: "One per grade"). On, that grade's family app opens each unit's Sakarath book instead of its past
// papers (lib/family.ts `worldsOf`); off, the past papers again. OL (19 Nov 2026): the students ticked for the O/L map
// get the O/L book's own map. The owner only. `open` (19 Nov 2026): Correction opens a unit of the printed Sakarath
// book a student holds (given on the Books page: lib/sakarath.ts, "The printed Sakarath book").

import { v } from "convex/values";
import { query } from "./_generated/server";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { bookFor, cleanBy, ensureProgress, fail, getStudent, log } from "./lib/backend";
import { EXAM_GRADES, EXAM_KEY, examGrades, isSkbGrade, isSkGrade, skGrade, skHeld } from "./lib/sakarath";
import { gradeWords } from "./lib/syllabus";

const token = v.optional(v.string());

/** How many of a grade's units have their Sakarath book in the app. */
async function booksIn(ctx: Parameters<typeof examGrades>[0], grade: number): Promise<number> {
  const units = await ctx.db
    .query("units")
    .withIndex("by_grade", (q) => q.eq("grade", skGrade(grade)))
    .collect();
  let n = 0;
  for (const u of units) {
    const b = await ctx.db
      .query("books")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", u._id).eq("stage", "master"))
      .first();
    if (b?.sk && (b.keyCount ?? 0) > 0) n++;
  }
  return n;
}

/** Exam mode: the grades it is on for, and how many Sakarath books each grade has in the app (with their keys). */
export const exam = query({
  args: { token },
  handler: async (ctx, args): Promise<{ on: number[]; books: Record<string, number> }> => {
    await viewer(ctx, args.token);
    const books: Record<string, number> = {};
    for (const g of EXAM_GRADES) books[String(g)] = await booksIn(ctx, g);
    return { on: await examGrades(ctx), books };
  },
});

/** The owner turns exam mode on or off for one grade (on: only a grade with a Sakarath book in the app). */
export const setExam = mutation({
  args: { token, grade: v.number(), on: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"], args.by);
    if (!(EXAM_GRADES as readonly number[]).includes(args.grade)) fail("Exam mode is for Grades 6 to 11 and OL.");
    const was = await examGrades(ctx);
    if (args.on && !was.includes(args.grade) && (await booksIn(ctx, args.grade)) === 0) {
      fail(`${gradeWords(args.grade)} has no Sakarath book in the app yet.`);
    }
    const next = args.on ? [...new Set([...was, args.grade])].sort((a, b) => a - b) : was.filter((g) => g !== args.grade);
    if (next.length === was.length && next.every((g, i) => g === was[i])) return next;
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", EXAM_KEY))
      .first();
    if (row) await ctx.db.patch(row._id, { value: next });
    else await ctx.db.insert("meta", { key: EXAM_KEY, value: next });
    await log(ctx, null, Date.now(), { kind: "exam-mode", by: cleanBy(args.by), value: `${args.grade} ${args.on ? "on" : "off"}` });
    return next;
  },
});

/**
 * Correction opens a unit of the printed Sakarath book he holds (19 Nov 2026, his ask: "after give that to my student
 * ... visible to correct"): his row in it, made the first time; nothing else changes (he is never moved, his book now
 * stays). The board then brings it (state.ts `sk`). Correction or Evaluation, as for a workbook's marks.
 */
export const open = mutation({
  args: { token, id: v.id("students"), unitId: v.id("units"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const s = await getStudent(ctx, args.id);
    const unit = await ctx.db.get(args.unitId);
    if (!unit || !isSkGrade(unit.grade) || isSkbGrade(unit.grade)) fail("That is not a unit of a Sakarath book.");
    if (!(await bookFor(ctx, unit._id, "master"))?.sk) fail(`${unit.code} has no Sakarath book in the app.`);
    if (!(await skHeld(ctx, s._id)).has(unit.grade)) fail(`${s.name} doesn't have this Sakarath book: give it on the Books page (Stock → S).`);
    await ensureProgress(ctx, s._id, unit._id, "master", Date.now());
    return true;
  },
});
