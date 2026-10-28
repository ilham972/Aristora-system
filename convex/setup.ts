import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { bookFor } from "./lib/backend";
import { KNOWN_WORKBOOKS, PILOT_FIGHTER, PILOT_UNIT } from "./lib/book";
import { SYLLABUS, unitKey, unitOrder } from "./lib/syllabus";
import { actor } from "./lib/auth";

/** Bump when ensure() has new one-time work to do. */
export const DATA_VERSION = 1;

/**
 * One-time data updates, safe to run any number of times (every phone calls it when the app opens):
 * the Grade 6-11 syllabus, the books already known, and students from before grades and stages
 * (they were all on the Grade 11 pilot book) moved onto it with their marks.
 */
export const ensure = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["any"]);
    const meta = await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", "data")).first();
    if (meta && Number(meta.value) >= DATA_VERSION) return { version: Number(meta.value), changed: false };
    const now = Date.now();

    // 1. The syllabus (only into an empty table: after that the owner edits it in the app).
    if (!(await ctx.db.query("units").first())) {
      for (const u of SYLLABUS) {
        await ctx.db.insert("units", {
          grade: u.grade,
          code: u.code,
          key: unitKey(u.grade, u.code),
          term: u.term,
          en: u.en,
          ta: u.ta,
          order: unitOrder(u.code),
        });
      }
    }
    const unit = async (grade: number, code: string) =>
      await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", unitKey(grade, code))).first();

    // 2. The pilot theory book and the workbooks whose counts are known.
    const pilot = await unit(PILOT_UNIT.grade, PILOT_UNIT.code);
    if (pilot && !(await bookFor(ctx, pilot._id, "fighter"))) {
      await ctx.db.insert("books", {
        unitId: pilot._id,
        stage: "fighter",
        title: PILOT_UNIT.title,
        data: PILOT_FIGHTER,
        updatedAt: now,
      });
    }
    for (const w of KNOWN_WORKBOOKS) {
      const u = await unit(w.grade, w.code);
      if (!u || (await bookFor(ctx, u._id, "master"))) continue;
      await ctx.db.insert("books", { unitId: u._id, stage: "master", data: w.data, updatedAt: now });
    }

    // 3. Students from before stages: Grade 11, Term 2, Fighter on the pilot book, marks kept.
    if (pilot) {
      for (const s of await ctx.db.query("students").collect()) {
        if (s.stage) continue;
        const existing = await ctx.db
          .query("progress")
          .withIndex("by_student_unit_stage", (q) =>
            q.eq("studentId", s._id).eq("unitId", pilot._id).eq("stage", "fighter"),
          )
          .first();
        if (!existing) {
          await ctx.db.insert("progress", {
            studentId: s._id,
            unitId: pilot._id,
            stage: "fighter",
            marks: s.marks ?? {},
            startedAt: now,
            updatedAt: now,
          });
        }
        await ctx.db.patch(s._id, { grade: 11, term: 2, stage: "fighter", unitId: pilot._id, marks: undefined });
      }
    }

    if (meta) await ctx.db.patch(meta._id, { value: DATA_VERSION });
    else await ctx.db.insert("meta", { key: "data", value: DATA_VERSION });
    return { version: DATA_VERSION, changed: true };
  },
});
