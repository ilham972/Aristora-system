// The owner's look at a Stage on the phone (5 Nov 2026, his ask: "I want to check every question is correctly located
// or anything problem ... without answering the level one"). His answers: only the owner ("that's me only"), only
// looking (no Check), never for students or other teachers (a student must finish a level to see the next one).
// Settings → Books → a unit with a key → Preview on the phone (src/familySheet.tsx) opens the family app on the class
// system's address (/f/#preview=<unit>, src/family/preview.tsx) with his teachers' sign-in: every level of the Stage
// open, each question as a student sees it, Check off. Queries only, and no student's rule is touched (levels in order,
// the photo limit, the questions that come back all stay in family.ts); the one change is his free marks (`setFree`).
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { mutation } from "./lib/fn";
import { levelForm, type FamilyLevel, type FamilyQuestions } from "./family";
import { actor, viewer } from "./lib/auth";
import { asMaster, bookFor, currentSession, fail, keyRow, log, masterState, refresh } from "./lib/backend";
import { levelOutOf, type MasterData } from "./lib/book";
import { unitNumber, type World } from "./lib/family";
import { isFree, setFreeIn } from "./lib/free";
import { phoneKeyFor } from "./lib/homeWork";
import type { MState } from "./lib/master";
import { OL, olNumber } from "./lib/syllabus";

const token = v.optional(v.string());

export type PreviewUnit = {
  /** The Stage as the phone's level screen takes it (every level open). */
  world: World;
  grade: number;
  code: string;
  /** Its levels: their first and last question, marks, how many questions the phone shows, how many are free marks. */
  levels: { n: number; from: number; to: number; max: number; qs: number; free: number }[];
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
      for (let q = l.from; q <= l.to; q++) if (keys.has(q) || isFree(data, q)) qs++;
      const free = (data.free ?? []).filter((q) => q >= l.from && q <= l.to).length;
      return { n: l.n, from: l.from, to: l.to, max: l.max, qs, free };
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
    return { unitId: unit._id, no, ta: unit.ta, n: l.n, max: l.max, qs: levelForm(data, keys, l) };
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

/**
 * Free marks for a question out of the syllabus (5 Nov 2026, his ask: "instead removing the question, we have to make
 * that as a all marks question ... I have to do this manually because I am the one know which one is out of the
 * syllabus"), from his Preview. Everyone gets its marks: the levels marked already at once (his answer "them too"), the
 * others when they are marked (the phone's Check, the corrector's Save: lib/free.ts). Its photos waiting for a teacher
 * close (and open again if it isn't free any more). The owner only.
 */
export const setFree = mutation({
  args: { token, unitId: v.id("units"), q: v.number(), free: v.boolean() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    const book = await bookFor(ctx, args.unitId, "master");
    if (!unit || !book) fail("This unit has no workbook in the app yet.");
    const data = asMaster(book);
    const l = data.levels.find((x) => args.q >= x.from && args.q <= x.to);
    if (!l) fail(`Question ${args.q} is not in this workbook.`);
    // Every question's marks of its level: the phone and Correction then give exactly those marks.
    if (!levelOutOf(data, l)) fail(`This workbook doesn't list every question's marks in Level ${l.n}: free marks need them.`);
    const free = new Set(data.free ?? []);
    if (free.has(args.q) === args.free) return { students: 0 };
    if (args.free) free.add(args.q);
    else free.delete(args.q);
    const next: MasterData = { ...data, free: [...free].sort((a, b) => a - b) };
    if (!free.size) delete next.free;
    await ctx.db.patch(book._id, { data: next, updatedAt: now });
    // Every student's workbook of this unit: a level marked already gets (or gives back) its marks now.
    let students = 0;
    const session = await currentSession(ctx, now);
    const rows = await ctx.db.query("progress").withIndex("by_unit_stage", (x) => x.eq("unitId", args.unitId).eq("stage", "master")).collect();
    for (const p of rows) {
      if (!p.m) continue;
      const m = JSON.parse(JSON.stringify(masterState(p))) as MState;
      if (!setFreeIn(m, next, args.q, args.free, now)) continue;
      await ctx.db.patch(p._id, { m, updatedAt: now });
      // In class now: his "out of work" clock follows (a lost question waiting for Evaluation may have been his work).
      await refresh(ctx, p.studentId, now, session);
      students++;
    }
    // Its photos waiting for a teacher: nothing to mark any more (or again). A photo closed this way whose files went
    // meanwhile (a day after closing, photos.sweep) goes too: he is asked for it again, as before he sent it.
    const photos = await ctx.db.query("homePhotos").withIndex("by_unit", (x) => x.eq("unitId", args.unitId)).collect();
    for (const r of photos) {
      if (r.q !== args.q) continue;
      if (args.free && (r.state === "waiting" || r.state === "ask")) {
        await ctx.db.patch(r._id, { state: "done", doneAt: now, by: me.name, byId: me._id, free: true, note: "Free marks: out of the syllabus" });
      } else if (!args.free && r.free) {
        if (r.gone) await ctx.db.delete(r._id);
        else await ctx.db.patch(r._id, { state: "waiting", doneAt: undefined, by: undefined, byId: undefined, free: undefined, note: undefined });
      }
    }
    await log(ctx, null, now, {
      kind: args.free ? "free-marks" : "free-marks-off",
      by: me.name,
      unit: unit.key,
      q: args.q,
      value: `${students} student${students === 1 ? "" : "s"}`,
    });
    return { students };
  },
});
