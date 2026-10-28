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
import { partId } from "./schema";
import { actor, viewer } from "./lib/auth";

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
      updatedAt: b.updatedAt,
    }));
  },
});

/**
 * A unit's workbook (Master), copied from its contents page and marks table: where each part ends, the marks of
 * each short question, and each level's last question and marks. Question marks already known are kept.
 */
export const saveWorkbook = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    parts: v.array(v.object({ id: partId, to: v.number(), each: v.optional(v.number()) })),
    levels: v.array(v.object({ to: v.number(), max: v.number() })),
    marks: v.optional(v.record(v.string(), v.number())),
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
    const oldMarks = old?.data.kind === "master" ? (old.data.marks ?? {}) : {};
    for (const [k, m] of Object.entries({ ...oldMarks, ...(args.marks ?? {}) })) {
      if (Number(k) >= 1 && Number(k) <= last) marks[k] = m;
    }
    const data: MasterData = Object.keys(marks).length ? { kind: "master", parts, levels, marks } : { kind: "master", parts, levels };
    const problems = checkMaster(data);
    if (problems.length) fail(problems[0]);
    if (old) await ctx.db.patch(old._id, { data, updatedAt: now });
    else await ctx.db.insert("books", { unitId: unit._id, stage: "master", data, updatedAt: now });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, {
      kind: "book-save",
      by: cleanBy(args.by),
      unit: unit.key,
      value: `${levels.length} levels, ${bookTotal(data)} marks`,
    });
    await touch(ctx, session, now);
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
