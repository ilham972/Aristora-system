import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { bookFor, cleanBy, currentSession, fail, log, touch } from "./lib/backend";
import {
  bookTotal,
  checkMaster,
  partsForGrade,
  PART_NAME,
  type MasterData,
  type MasterLevel,
  type MasterPart,
} from "./lib/book";
import { keyAnswer, partId } from "./schema";
import { actor, viewer } from "./lib/auth";
import { checkKey } from "./lib/key";

/** The whole syllabus, in grade and book order. */
export const units = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    const list = await ctx.db.query("units").collect();
    return list.sort((a, b) => a.grade - b.grade || a.order - b.order);
  },
});

/** Which units have which books (no contents: that comes with the board). */
export const books = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token);
    const list = await ctx.db.query("books").collect();
    return list.map((b) => ({
      _id: b._id,
      unitId: b.unitId,
      stage: b.stage,
      title: b.title ?? null,
      master:
        b.data.kind === "master"
          ? {
              parts: b.data.parts.map((p) => ({ id: p.id, from: p.from, to: p.to, each: p.each ?? null })),
              levels: b.data.levels,
              total: bookTotal(b.data),
              marksKnown: Object.keys(b.data.marks ?? {}).length,
            }
          : null,
      questions: b.data.kind === "fighter" ? b.data.sections.reduce((a, s) => a + s.teach.length + s.solo.length, 0) : null,
      keyCount: b.keyCount ?? null,
      updatedAt: b.updatedAt,
    }));
  },
});

/** A workbook's answer key, for the teacher correcting a level (null: no key yet). Never sent with the board. */
export const key = query({
  args: { token: v.optional(v.string()), unitId: v.id("units") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction", "evaluation", "theory", "books");
    const k = await ctx.db
      .query("keys")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .first();
    return k ? { answers: k.answers, updatedAt: k.updatedAt } : null;
  },
});

/** Parts, levels and marks in one line: the same line = the same question numbers, so a key still fits. */
function shape(d: MasterData): string {
  const marks = Object.entries(d.marks ?? {})
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([q, m]) => `${q}:${m}`);
  return JSON.stringify([d.parts.map((p) => [p.id, p.from, p.to, p.each ?? null]), d.levels.map((l) => [l.from, l.to, l.max]), marks]);
}

/**
 * A unit's workbook (Master), typed from its contents page and marks table, or read from the book file the owner
 * uploaded: where each part ends, the marks of each short question, and each level's last question and marks.
 * Question marks already known are kept, except for an uploaded book (`replace`): its marks are the whole truth.
 * An uploaded book may bring its answer key: it replaces the old one. Without one, the old key stays only while the
 * question numbers and marks are the same (a re-cut book would show answers beside the wrong questions).
 * Students' marks are never touched here.
 */
export const saveWorkbook = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    parts: v.array(v.object({ id: partId, to: v.number(), each: v.optional(v.number()) })),
    levels: v.array(v.object({ to: v.number(), max: v.number() })),
    marks: v.optional(v.record(v.string(), v.number())),
    replace: v.optional(v.boolean()),
    key: v.optional(v.array(keyAnswer)),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const plan = partsForGrade(unit.grade);
    for (const p of args.parts) {
      if (!plan.some((x) => x.id === p.id)) fail(`Grade ${unit.grade} workbooks have no ${PART_NAME[p.id]}.`);
    }
    const parts: MasterPart[] = [];
    let from = 1;
    for (const x of plan) {
      const p = args.parts.find((y) => y.id === x.id);
      if (!p) continue;
      parts.push(
        x.kind === "short"
          ? { id: x.id, from, to: p.to, kind: x.kind, each: p.each ?? 2 }
          : { id: x.id, from, to: p.to, kind: x.kind },
      );
      from = p.to + 1;
    }
    const levels: MasterLevel[] = [];
    let start = 1;
    args.levels.forEach((l, i) => {
      levels.push({ n: i + 1, from: start, to: l.to, max: l.max });
      start = l.to + 1;
    });
    const old = await bookFor(ctx, unit._id, "master");
    const last = parts.length ? parts[parts.length - 1].to : 0;
    const marks: Record<string, number> = {};
    const oldMarks = !args.replace && old?.data.kind === "master" ? (old.data.marks ?? {}) : {};
    for (const [k, m] of Object.entries({ ...oldMarks, ...(args.marks ?? {}) })) {
      if (Number(k) >= 1 && Number(k) <= last) marks[k] = m;
    }
    const data: MasterData = Object.keys(marks).length ? { kind: "master", parts, levels, marks } : { kind: "master", parts, levels };
    const problems = checkMaster(data);
    if (problems.length) fail(problems[0]);
    const newKey = args.key?.length ? args.key : null;
    if (newKey) {
      if (!args.replace) fail("An answer key comes only with an uploaded workbook.");
      const bad = checkKey(newKey, data);
      if (bad.length) fail(bad[0]);
    }

    // The answer key: the new one, or the old one while the question numbers still fit, or none.
    const oldKey = await ctx.db
      .query("keys")
      .withIndex("by_unit", (q) => q.eq("unitId", unit._id))
      .first();
    const keepOld = !newKey && !!oldKey && old?.data.kind === "master" && shape(old.data) === shape(data);
    const keyCount: number | undefined = newKey ? newKey.length : keepOld ? oldKey!.answers.length : undefined;
    if (newKey) {
      if (oldKey) await ctx.db.patch(oldKey._id, { answers: newKey, updatedAt: now });
      else await ctx.db.insert("keys", { unitId: unit._id, answers: newKey, updatedAt: now });
    } else if (oldKey && !keepOld) await ctx.db.delete(oldKey._id);

    if (old) await ctx.db.patch(old._id, { data, updatedAt: now, keyCount });
    else await ctx.db.insert("books", { unitId: unit._id, stage: "master", data, updatedAt: now, ...(keyCount ? { keyCount } : {}) });
    const session = await currentSession(ctx, now);
    const keyWords = newKey ? ` + answer key (${newKey.length})` : oldKey && !keepOld ? " (old answer key removed)" : "";
    await log(ctx, session, now, {
      kind: "book-save",
      by: cleanBy(args.by),
      unit: unit.key,
      value: `${levels.length} levels, ${bookTotal(data)} marks${args.replace ? " (uploaded book)" : ""}${keyWords}`,
    });
    await touch(ctx, session, now);
    return true;
  },
});

/** Fix a unit's names (the Tamil names of Grade 7 are translations to check). */
export const renameUnit = mutation({
  args: { token: v.optional(v.string()), unitId: v.id("units"), en: v.string(), ta: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["books"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const en = args.en.replace(/\s+/g, " ").trim();
    const ta = args.ta.replace(/\s+/g, " ").trim();
    if (!en || en.length > 80 || ta.length > 120) fail("Type a name (up to 80 letters).");
    await ctx.db.patch(unit._id, { en, ta });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "unit-rename", by: cleanBy(args.by), unit: unit.key, value: `${unit.en} → ${en}` });
  },
});
