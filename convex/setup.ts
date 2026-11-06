import { v } from "convex/values";
import { mutation } from "./lib/fn";
import { bookFor } from "./lib/backend";
import { KNOWN_WORKBOOKS, PILOT_FIGHTER, PILOT_UNIT } from "./lib/book";
import { OL, OL_TOPICS, SYLLABUS, unitKey, unitOrder } from "./lib/syllabus";
import { actor } from "./lib/auth";
import { giveIndex } from "./lib/family";

/** Bump when ensure() has new one-time work to do. */
export const DATA_VERSION = 4;

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

    // 5. The OL books' topics (version 3, 1 Nov 2026): his O/L tracker sheet, by paper part, once.
    if (!(await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", OL)).first())) {
      for (const [i, [part, en, ta]] of OL_TOPICS.entries()) {
        const code = `U${String(i + 1).padStart(2, "0")}`;
        await ctx.db.insert("units", { grade: OL, code, key: unitKey(OL, code), term: part, en, ta, order: i + 1 });
      }
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

    // 4. Index numbers for the family app (1 Nov 2026): every student of the class from before, oldest first
    //    (removed ones too: a number is never reused). Demo and test students have none.
    const unnumbered = (await ctx.db.query("students").collect()).filter((s) => !s.demo && !s.test && typeof s.index !== "number");
    for (const s of unnumbered.sort((a, b) => a._creationTime - b._creationTime)) await giveIndex(ctx, s);

    // 6. Topic tutes uploaded before `books.tute` (version 4, 1 Nov 2026, his screenshot: the past papers of his
    //    Simultaneous equations tute wouldn't open beside its ladder): a tute's workbook goes on from its ladder (its
    //    first question is after 1) and its unit has the theory book: both are marked as the tute's two books.
    for (const b of await ctx.db.query("books").collect()) {
      if (b.stage !== "master" || b.data.kind !== "master" || b.tute || (b.data.parts[0]?.from ?? 1) <= 1) continue;
      const f = await bookFor(ctx, b.unitId, "fighter");
      if (!f) continue;
      await ctx.db.patch(b._id, { tute: true });
      if (!f.tute) await ctx.db.patch(f._id, { tute: true });
    }

    if (meta) await ctx.db.patch(meta._id, { value: DATA_VERSION });
    else await ctx.db.insert("meta", { key: "data", value: DATA_VERSION });
    return { version: DATA_VERSION, changed: true };
  },
});
