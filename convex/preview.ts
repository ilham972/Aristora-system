// The owner's look at a Stage on the phone (5 Nov 2026, his ask: "I want to check every question is correctly located
// or anything problem ... without answering the level one"). His answers: only the owner ("that's me only"), only
// looking (no Check), never for students or other teachers (a student must finish a level to see the next one).
// Settings → Books → a unit with a key → Preview on the phone (src/familySheet.tsx) opens the family app on the class
// system's address (/f/#preview=<unit>, src/family/preview.tsx) with his teachers' sign-in: every level of the Stage
// open, each question as a student sees it, Check off. Queries only: nothing here can change anything, and no
// student's rule is touched (levels in order, the photo limit, the questions that come back all stay in family.ts).
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import type { FamilyLevel, FamilyQuestions } from "./family";
import { viewer } from "./lib/auth";
import { asMaster, bookFor, fail, keyRow } from "./lib/backend";
import { partOf } from "./lib/book";
import { unitNumber, type World } from "./lib/family";
import { phoneKeyFor } from "./lib/homeWork";
import { formOf } from "./lib/phone";
import { OL, olNumber } from "./lib/syllabus";

const token = v.optional(v.string());

export type PreviewUnit = {
  /** The Stage as the phone's level screen takes it (every level open). */
  world: World;
  grade: number;
  code: string;
  /** Its levels: their first and last question, marks, and how many questions the phone shows. */
  levels: { n: number; from: number; to: number; max: number; qs: number }[];
};

/** The owner only; the unit's workbook and its key (what the phone shows comes from the key's kinds). */
async function stageOf(ctx: QueryCtx, tok: string | undefined, unitId: Id<"units">) {
  await viewer(ctx, tok, "owner");
  const unit = await ctx.db.get(unitId);
  if (!unit) fail("That unit is not in the app.");
  const book = await bookFor(ctx, unitId, "master");
  if (!book) fail("This unit has no workbook in the app yet.");
  const key = await keyRow(ctx, unitId, "master");
  if (!key) fail("This unit has no answer key yet: the phone has nothing to show.");
  const data = asMaster(book);
  // Its Stage number as the phone shows it (convex/lib/family.ts `worldsOf`): an O/L topic by its paper part's order.
  const ol = unit.grade === OL ? await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", OL)).collect() : [];
  const no = unit.grade === OL ? olNumber(unit, ol) : unitNumber(unit.code);
  return { unit, data, no, keys: await phoneKeyFor(ctx, unitId, data, key.answers) };
}

function levelOf(data: ReturnType<typeof asMaster>, n: number) {
  const l = data.levels.find((x) => x.n === n);
  if (!l) fail("That level is not in this Stage.");
  return l;
}

export const unit = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args): Promise<PreviewUnit> => {
    const { unit, data, no, keys } = await stageOf(ctx, args.token, args.unitId);
    const printed = await ctx.db
      .query("questions")
      .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master"))
      .first();
    const levels = data.levels.map((l) => {
      let qs = 0;
      for (let q = l.from; q <= l.to; q++) if (keys.has(q)) qs++;
      return { n: l.n, from: l.from, to: l.to, max: l.max, qs };
    });
    return {
      grade: unit.grade,
      code: unit.code,
      world: {
        unitId: unit._id,
        no,
        ta: unit.ta,
        en: unit.en,
        term: unit.term,
        book: true,
        open: true,
        phone: true,
        now: false,
        q: !!printed,
        levels: levels.map((l) => ({ n: l.n, max: l.max, s: "play" as const })),
        allDone: false,
      },
      levels,
    };
  },
});

/** A level as the phone shows it (`family.level`'s form, without a student: nothing comes back, nothing is locked). */
export const level = query({
  args: { token, unitId: v.id("units"), n: v.number() },
  handler: async (ctx, args): Promise<FamilyLevel> => {
    const { unit, data, no, keys } = await stageOf(ctx, args.token, args.unitId);
    const l = levelOf(data, args.n);
    const qs: FamilyLevel["qs"] = [];
    for (let q = l.from; q <= l.to; q++) {
      const k = keys.get(q);
      if (k) qs.push({ ...formOf(k), part: partOf(data, q)?.id ?? "" });
    }
    return { unitId: unit._id, no, ta: unit.ta, n: l.n, max: l.max, qs };
  },
});

/** A level's questions as printed, and the book's CSS (`family.questions`, without a student). */
export const questions = query({
  args: { token, unitId: v.id("units"), n: v.number(), css: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<FamilyQuestions> => {
    const { data } = await stageOf(ctx, args.token, args.unitId);
    const l = levelOf(data, args.n);
    const qs: FamilyQuestions["qs"] = [];
    for (let q = l.from; q <= l.to; q++) {
      const r = await ctx.db
        .query("questions")
        .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master").eq("q", q))
        .first();
      if (r) qs.push({ q, html: r.html });
    }
    let css: string | null = null;
    if (args.css !== false) {
      const row = await ctx.db
        .query("bookCss")
        .withIndex("by_book", (x) => x.eq("unitId", args.unitId).eq("stage", "master"))
        .first();
      css = row?.css ?? null;
    }
    return { css, qs };
  },
});
