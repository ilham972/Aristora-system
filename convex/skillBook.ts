// A unit's book by skill (14 Nov 2026, the founder: "on that T button ... I can see the skill numbers of that unit ...
// how many questions inside that each skill ... the list of questions ... I can easily move any question to another
// skill ... and a Download button"): Settings → Books → T on a tagged unit (src/skillBook.tsx). The rules are pure, in
// convex/lib/skillBook.ts. Nothing here touches the family app or the workbook's levels: the app keeps its own question
// numbers and levels; the book by skill is only shown here and downloaded. A move does change the unit's skill tags,
// the same row the Claude link saves (lessons by skill in class read it too).
// - `unit`: the workbook's shape, its skills and tags, every skill's names (other units' too) and how students did on
//   each question (for easy → hard).
// - `questions`: every printed question and the book's CSS, read once when the page opens (they change only on upload).
// - `move` (Books or the owner): one question to another group of skills, checked like a Claude link save.

import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { asMaster, bookFor, cleanBy, currentSession, fail, keyRow, log, touch } from "./lib/backend";
import type { MasterData } from "./lib/book";
import type { MState } from "./lib/master";
import { groupLabel, keepExamples, moveTo, needs, statsOf } from "./lib/skillBook";
import { knownFor, skillsProblem, type Skill, type SkillTag } from "./lib/skills";

const token = v.optional(v.string());

async function tagsOf(ctx: QueryCtx, unitId: Id<"units">) {
  return await ctx.db
    .query("skillTags")
    .withIndex("by_book", (q) => q.eq("unitId", unitId).eq("stage", "master"))
    .first();
}

export type SkillBookUnit = {
  unitId: Id<"units">;
  key: string;
  grade: number;
  code: string;
  en: string;
  ta: string;
  data: MasterData;
  skills: Skill[];
  tags: SkillTag[];
  /** Every skill this unit's questions carry: its names, its own unit's or another's. */
  names: Record<string, { ta: string; en: string }>;
  /** q → [students, marks summed]. */
  stats: [number, number, number][];
  updatedAt: number;
};

/** A tagged unit's book by skill (null: not tagged, or no workbook). */
export const unit = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args): Promise<SkillBookUnit | null> => {
    await viewer(ctx, args.token, "books");
    const unit = await ctx.db.get(args.unitId);
    const book = unit ? await bookFor(ctx, args.unitId, "master") : null;
    const row = book ? await tagsOf(ctx, args.unitId) : null;
    if (!unit || !book || !row || book.data.kind !== "master") return null;
    const data = asMaster(book);
    const names: SkillBookUnit["names"] = {};
    for (const s of row.skills) names[s.id] = { ta: s.ta, en: s.en };
    const used = new Set(row.tags.flatMap((t) => [t.s, ...(t.x ?? [])]));
    for (const r of await ctx.db.query("skillTags").collect()) {
      if (r.unitId === unit._id || r.stage !== "master") continue;
      for (const s of r.skills) if (used.has(s.id)) names[s.id] = { ta: s.ta, en: s.en };
    }
    const real = new Set(
      (await ctx.db.query("students").collect()).filter((s) => !s.test && !s.demo).map((s) => s._id as string),
    );
    const states = (await ctx.db
      .query("progress")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", args.unitId).eq("stage", "master"))
      .collect())
      .filter((p) => p.m && real.has(p.studentId))
      .map((p) => p.m as MState);
    const stats = [...statsOf(data, states)].map(([q, s]): [number, number, number] => [q, s.n, Math.round(s.right * 100) / 100]);
    return {
      unitId: unit._id,
      key: unit.key,
      grade: unit.grade,
      code: unit.code,
      en: unit.en,
      ta: unit.ta,
      data,
      skills: row.skills,
      tags: row.tags,
      names,
      stats,
      updatedAt: row.updatedAt,
    };
  },
});

/** Every printed question of the workbook and its CSS (read once: they change only when the book is uploaded). */
export const questions = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "books");
    const rows = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master"))
      .collect();
    const css = await ctx.db
      .query("bookCss")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master"))
      .first();
    return { css: css?.css ?? null, qs: rows.map((r) => ({ q: r.q, html: r.html })) };
  },
});

/** One question to another group of skills (one to three): it needs exactly those now. */
export const move = mutation({
  args: { token, unitId: v.id("units"), q: v.number(), skills: v.array(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    const book = unit ? await bookFor(ctx, args.unitId, "master") : null;
    const row = book ? await tagsOf(ctx, args.unitId) : null;
    if (!unit || !book || !row || book.data.kind !== "master") fail("This unit has no skills in the app.");
    const before = needs(row.tags, args.q);
    const tags = moveTo(row.tags, args.q, args.skills);
    if (typeof tags === "string") fail(tags);
    const skills = keepExamples(row.skills, tags);
    const rows = (await ctx.db.query("skillTags").collect()).filter((r) => r.stage === "master");
    const units = await ctx.db.query("units").collect();
    const key = await keyRow(ctx, args.unitId, "master");
    const bad = skillsProblem(unit.key, asMaster(book), key?.answers ?? null, { skills, tags }, knownFor(unit, rows, units));
    if (bad) fail(bad.includes("has no question") ? `${bad} Move another question into it first, or keep this one.` : bad);
    await ctx.db.patch(row._id, { skills, tags, by: "app", updatedAt: now });
    const session = await currentSession(ctx, now);
    const after = needs(tags, args.q);
    await log(ctx, session, now, {
      kind: "skill-move",
      by: cleanBy(args.by),
      unit: unit.key,
      q: args.q,
      value: `${groupLabel(unit.key, before)} → ${groupLabel(unit.key, after)}`,
    });
    await touch(ctx, session, now);
    return { from: groupLabel(unit.key, before), to: groupLabel(unit.key, after) };
  },
});
