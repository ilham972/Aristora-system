// Master: the past-paper workbook, level by level.
//   Level done -> the student handed the level in; it waits for correction (he starts the next level at once).
//   Correct    -> the level's marks: each question's marks when the workbook knows them, else the level's total
//                 and which questions lost marks. Correcting again changes them.
//   Explain    -> the Evaluation teacher, for the questions that lost marks.
//   Re-teach   -> Correction or Evaluation asks Theory to teach the unit again.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import {
  asMaster,
  cleanBy,
  currentSession,
  fail,
  getStudent,
  log,
  masterState,
  refresh,
  touch,
  workPlace,
} from "./lib/backend";
import { levelOutOf, type MasterData } from "./lib/book";
import { computeMaster, type MQ, type MState } from "./lib/master";
import { actor } from "./lib/auth";

async function masterWork(ctx: MutationCtx, student: Doc<"students">, unitId: Id<"units"> | undefined, now: number) {
  const { unit, book, progress } = await workPlace(ctx, student, "master", unitId, now);
  return { unit, book: asMaster(book), progress, m: copy(masterState(progress)) };
}

function copy(m: MState): MState {
  return {
    q: { ...m.q },
    lv: Object.fromEntries(Object.entries(m.lv).map(([k, x]) => [k, { ...x }])),
    ...(m.reteach ? { reteach: { ...m.reteach } } : {}),
  };
}

function levelOf(book: MasterData, n: number) {
  const l = book.levels.find((x) => x.n === n);
  if (!l) fail("That level is not in this workbook.");
  return l;
}

const base = {
  token: v.optional(v.string()),
  studentId: v.id("students"),
  unitId: v.optional(v.id("units")),
  by: v.optional(v.string()),
};

/** The student handed a level in: it waits for correction (he starts the next level at once). */
export const levelDone = mutation({
  args: { ...base, level: v.number() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress, m } = await masterWork(ctx, student, args.unitId, now);
    const l = levelOf(book, args.level);
    const key = String(l.n);
    const lv = m.lv[key] ?? {};
    if (lv.done) return { already: true };
    m.lv[key] = { ...lv, done: now };
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await ctx.db.patch(student._id, { lastActivityAt: now });
    await log(ctx, session, now, {
      kind: "level-done",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: key,
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    return { already: false };
  },
});

/** "Level done" tapped by mistake (only before it is corrected). */
export const undoDone = mutation({
  args: { ...base, level: v.number() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress, m } = await masterWork(ctx, student, args.unitId, now);
    const l = levelOf(book, args.level);
    const key = String(l.n);
    const lv = m.lv[key];
    if (!lv?.done) return false;
    if (lv.fixed) fail("That level is already corrected.");
    delete m.lv[key];
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await log(ctx, session, now, {
      kind: "level-undo",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: key,
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    return true;
  },
});

/**
 * A level's marks. When the workbook knows every question's marks, send got for each question (the level total
 * is their sum). Otherwise send the level total and, for each question, whether it lost marks.
 */
export const correct = mutation({
  args: {
    ...base,
    level: v.number(),
    items: v.array(v.object({ q: v.number(), got: v.optional(v.number()), lost: v.optional(v.boolean()) })),
    total: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress, m } = await masterWork(ctx, student, args.unitId, now);
    const l = levelOf(book, args.level);
    const count = l.to - l.from + 1;
    const qs = new Set(args.items.map((x) => x.q));
    if (args.items.length !== count || qs.size !== count) {
      fail(`Give marks for all ${count} question${count === 1 ? "" : "s"} of Level ${l.n}.`);
    }
    const each = levelOutOf(book, l);
    const rows: Record<string, MQ> = {};
    let got = 0;
    for (const it of args.items) {
      if (it.q < l.from || it.q > l.to) fail(`Question ${it.q} is not in Level ${l.n}.`);
      const before = m.q[String(it.q)];
      let row: MQ;
      if (each) {
        const max = each[it.q - l.from];
        if (it.got === undefined || !Number.isInteger(it.got) || it.got < 0 || it.got > max) {
          fail(`Question ${it.q}: marks must be 0 to ${max}.`);
        }
        got += it.got;
        row = { got: it.got, max, lost: it.got < max, t: now };
      } else {
        if (it.lost === undefined) fail(`Question ${it.q}: say whether it lost marks.`);
        row = { lost: it.lost, t: now };
      }
      // Re-marked the same way keeps "explained"; new marks need a new explanation.
      if (before?.x && before.lost === row.lost && before.got === row.got) row.x = before.x;
      rows[String(it.q)] = row;
    }
    if (!each) {
      const total = args.total;
      if (total === undefined || !Number.isInteger(total) || total < 0 || total > l.max) {
        fail(`Level ${l.n}: type the marks, 0 to ${l.max}.`);
      }
      got = total;
      if (got < l.max && !Object.values(rows).some((r) => r.lost)) fail("Which questions lost marks? Tap them.");
      if (got === l.max && Object.values(rows).some((r) => r.lost)) fail(`Full marks (${l.max}) can't have questions that lost marks.`);
    }
    Object.assign(m.q, rows);
    const key = String(l.n);
    const lv = m.lv[key] ?? {};
    const doneAt = lv.done ?? now;
    const by = cleanBy(args.by);
    const again = !!lv.fixed;
    m.lv[key] = { done: doneAt, fixed: now, by, got };
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await ctx.db.patch(student._id, { lastActivityAt: now });
    await log(ctx, session, now, {
      kind: again ? "level-remarks" : "level-marks",
      by,
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: `${key} ${got}/${l.max}`,
      ms: again ? undefined : now - doneAt,
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    const st = computeMaster(m, book);
    return { got, max: l.max, unitPct: st.unit.pct, sofarPct: st.sofar.pct };
  },
});

/** Evaluation: these questions were explained (or, with on = false, not after all). */
export const explain = mutation({
  args: { ...base, qs: v.array(v.number()), on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["evaluation"], args.by);
    const now = Date.now();
    if (args.qs.length === 0) return;
    if (args.qs.length > 400) fail("Too many questions at once.");
    const student = await getStudent(ctx, args.studentId);
    const { unit, progress, m } = await masterWork(ctx, student, args.unitId, now);
    let n = 0;
    for (const q of args.qs) {
      const r = m.q[String(q)];
      if (!r?.lost) continue;
      if (args.on && !r.x) {
        m.q[String(q)] = { ...r, x: now };
        n++;
      } else if (!args.on && r.x) {
        const { x: _x, ...rest } = r;
        m.q[String(q)] = rest;
        n++;
      }
    }
    if (n === 0) return;
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await log(ctx, session, now, {
      kind: args.on ? "explained" : "unexplained",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: String(n),
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
  },
});

/** Correction or Evaluation: Theory should teach this unit again (on = false: not needed any more). */
export const reteach = mutation({
  args: { ...base, on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, progress, m } = await masterWork(ctx, student, args.unitId, now);
    if (!!m.reteach === args.on) return;
    const by = cleanBy(args.by);
    if (args.on) m.reteach = { at: now, by };
    else delete m.reteach;
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await log(ctx, session, now, {
      kind: args.on ? "reteach" : "reteach-off",
      by,
      studentId: student._id,
      name: student.name,
      unit: unit.key,
    });
    await touch(ctx, session, now);
  },
});
