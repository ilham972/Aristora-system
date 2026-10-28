// Focus tab: a workbook level marked part of the way. The corrector stopped at Q6 (another paper came, the bell
// rang), or marks the questions as the student finishes them. Each tap is kept here as a draft, so Stop keeps the
// marks and the paper opens again where it stopped, on any phone. A draft counts nowhere: the level's marks,
// Evaluation and Theory, the reports and Progress all wait for workbook.correct, when the level is saved (then the
// phone drops the draft). A level corrected elsewhere makes its draft stale: phones ignore it, the next mark cleans
// it up.

import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { asMaster, cleanBy, currentSession, fail, getStudent, masterState, touch, workPlace } from "./lib/backend";
import { levelOutOf } from "./lib/book";
import { draftMark } from "./schema";

const base = {
  token: v.optional(v.string()),
  studentId: v.id("students"),
  unitId: v.optional(v.id("units")),
  level: v.number(),
  by: v.optional(v.string()),
};

/** Every draft (a few per class): the Focus tab reads them while it is open. */
export const drafts = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction", "evaluation");
    const rows = await ctx.db.query("drafts").take(500);
    return rows.map((d) => ({ studentId: d.studentId, unitId: d.unitId, level: d.level, q: d.q, updatedAt: d.updatedAt, by: d.by }));
  },
});

async function draftsOf(ctx: MutationCtx, studentId: Doc<"students">["_id"]) {
  return await ctx.db
    .query("drafts")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
}

/** Keep some questions' marks (and forget others) in a level that isn't saved yet. */
export const mark = mutation({
  args: {
    ...base,
    set: v.array(v.object({ q: v.number(), g: v.number(), dk: v.optional(v.boolean()), p: v.optional(v.array(v.number())) })),
    clear: v.optional(v.array(v.number())),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const clear = args.clear ?? [];
    if (args.set.length + clear.length > 100) fail("Too many questions at once.");
    const student = await getStudent(ctx, args.studentId);
    const { unit, book: doc, progress } = await workPlace(ctx, student, "master", args.unitId, now);
    const book = asMaster(doc);
    const l = book.levels.find((x) => x.n === args.level);
    if (!l) fail("That level is not in this workbook.");
    const m = masterState(progress);
    if (m.lv[String(l.n)]?.fixed) fail(`Level ${l.n} is already corrected. Change it on the Correction tab.`);
    const each = levelOutOf(book, l);
    if (!each) fail("This workbook doesn't list each question's marks: correct this level on the Correction tab.");
    const inLevel = (q: number) => Number.isInteger(q) && q >= l.from && q <= l.to;

    const all = await draftsOf(ctx, student._id);
    // Drafts of a book he left, or of a level corrected meanwhile, are stale: gone.
    for (const d of all) {
      if (d.unitId !== unit._id || m.lv[String(d.level)]?.fixed) await ctx.db.delete(d._id);
    }
    const mine = all.find((d) => d.unitId === unit._id && d.level === l.n && !m.lv[String(d.level)]?.fixed) ?? null;
    const q: Record<string, Infer<typeof draftMark>> = { ...(mine?.q ?? {}) };
    for (const it of args.set) {
      if (!inLevel(it.q)) fail(`Question ${it.q} is not in Level ${l.n}.`);
      const max = each[it.q - l.from];
      if (it.dk && it.g !== 0) fail(`Question ${it.q}: "?" means he couldn't start it, so 0 marks.`);
      if (!Number.isInteger(it.g) || it.g < 0 || it.g > max) fail(`Question ${it.q}: marks must be 0 to ${max}.`);
      const row: Infer<typeof draftMark> = it.dk ? { g: 0, dk: true } : { g: it.g };
      if (it.p && !it.dk) {
        const ok = it.p.length <= 20 && it.p.every((x) => Number.isInteger(x) && x >= 0) && it.p.reduce((a, b) => a + b, 0) === it.g;
        if (!ok) fail(`Question ${it.q}: its parts don't add up to ${it.g}.`);
        row.p = it.p;
      }
      q[String(it.q)] = row;
    }
    for (const n of clear) {
      if (!inLevel(n)) fail(`Question ${n} is not in Level ${l.n}.`);
      delete q[String(n)];
    }
    const by = cleanBy(args.by);
    if (Object.keys(q).length === 0) {
      if (mine) await ctx.db.delete(mine._id);
    } else if (mine) {
      await ctx.db.patch(mine._id, { q, updatedAt: now, ...(by ? { by } : {}) });
    } else {
      await ctx.db.insert("drafts", { studentId: student._id, unitId: unit._id, level: l.n, q, updatedAt: now, ...(by ? { by } : {}) });
    }
    // Marks on his questions mean he is working: not "quiet".
    if (args.set.length) await ctx.db.patch(student._id, { lastActivityAt: now });
    await touch(ctx, await currentSession(ctx, now), now);
    return true;
  },
});

/** The level was saved (or its marks thrown away): forget its draft. */
export const drop = mutation({
  args: base,
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    for (const d of await draftsOf(ctx, args.studentId)) {
      if (d.level === args.level && (!args.unitId || d.unitId === args.unitId)) await ctx.db.delete(d._id);
    }
    return true;
  },
});
