// Master: the past-paper workbook, level by level.
//   Level done -> the student handed the level in; it waits for correction (he starts the next level at once).
//   Correct    -> the level's marks: each question's marks when the workbook knows them, else the level's total
//                 and which questions lost marks. Correcting again changes them. "?" (dk) = he couldn't start it:
//                 0 marks, straight to Theory. `to: "theory"` sends the level's lost marks to Theory instead of
//                 Evaluation (only when the corrector picks it: he forgot the theory).
//   Uncorrect  -> Take back (Focus tab): a level saved on the wrong student goes back to how it was (30 minutes).
//   Explain    -> the Evaluation teacher, for the questions that lost marks.
//   To Theory  -> Correction or Evaluation sends lost questions to Theory (he keeps working; Theory calls him).
//   Taught     -> Theory, for the questions sent to it.
//   Re-teach   -> Correction or Evaluation asks Theory to teach the whole unit again.

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
  masterPlace,
  masterState,
  mustHoldBook,
  refresh,
  touch,
} from "./lib/backend";
import { levelOutOf, type MasterData } from "./lib/book";
import { computeMaster, markBefore, type MQ, type MState } from "./lib/master";
import { actor } from "./lib/auth";
import { masterState as masterStateShape } from "./schema";

/**
 * A workbook of his: his book now, or another workbook he has work in (he works on several at once). Correction,
 * Evaluation and Theory all work on any of his books; correcting one never moves him (masterPlace).
 */
async function masterWork(ctx: MutationCtx, student: Doc<"students">, unitId: Id<"units"> | undefined, now: number) {
  const { unit, book, progress } = await masterPlace(ctx, student, unitId, now);
  return { unit, book: asMaster(book), progress, m: copy(masterState(progress)) };
}
const teachWork = masterWork;
/** A draft older than this was a level left half-marked for a long time: its time isn't kept (the CEO page). */
const TOOK_KEEP_MS = 60 * 60_000;

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

/** Undo markBefore for one save or hand-in (the levels it marked at that moment). */
function unmarkBefore(m: MState, at: number | undefined) {
  if (at === undefined) return;
  for (const [k, lv] of Object.entries(m.lv)) {
    if (lv.pre === at && !lv.done && !lv.fixed) delete m.lv[k];
  }
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
    const { pre: _pre, ...rest } = lv;
    m.lv[key] = { ...rest, done: now };
    markBefore(m, book, l.n, now);
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
    unmarkBefore(m, lv.done);
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
    items: v.array(
      v.object({
        q: v.number(),
        got: v.optional(v.number()),
        lost: v.optional(v.boolean()),
        dk: v.optional(v.boolean()),
        /** "?" on these parts only (he left them blank); the parts he answered keep their marks. */
        dkp: v.optional(v.array(v.string())),
      }),
    ),
    total: v.optional(v.number()),
    /** Where the lost marks go: Evaluation (the default) or Theory. "?" questions always go to Theory. */
    to: v.optional(v.union(v.literal("evaluation"), v.literal("theory"))),
  },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const by = cleanBy(args.by);
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress, m } = await masterWork(ctx, student, args.unitId, now);
    await mustHoldBook(ctx, me, student, unit, now);
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
      const dkp = blankParts(it.q, it.dk, it.dkp);
      if (each) {
        const max = each[it.q - l.from];
        if (it.dk && it.got && !dkp) fail(`Question ${it.q}: "?" means he couldn't start it, so 0 marks.`);
        const g = it.dk && !dkp ? 0 : it.got;
        if (g === undefined || !Number.isInteger(g) || g < 0 || g > max) {
          fail(`Question ${it.q}: marks must be 0 to ${max}.`);
        }
        if (dkp && g >= max) fail(`Question ${it.q}: a part left blank can't have full marks.`);
        got += g;
        row = { got: g, max, lost: g < max, t: now };
      } else {
        if (it.dk) fail(`Question ${it.q}: "?" needs each question's marks in the workbook.`);
        if (it.lost === undefined) fail(`Question ${it.q}: say whether it lost marks.`);
        row = { lost: it.lost, t: now };
      }
      if (it.dk) row.dk = true;
      if (dkp) row.dkp = dkp;
      // Re-marked the same way keeps what happened to it (explained, sent to Theory, taught); new marks start over.
      const sameBlank = (before?.dkp ?? []).join(",") === (row.dkp ?? []).join(",");
      if (before && before.lost === row.lost && before.got === row.got && !!before.dk === !!row.dk && sameBlank) {
        const { x, th, tb, tt } = before;
        row = { ...row, ...(x ? { x } : {}), ...(th ? { th } : {}), ...(tb ? { tb } : {}), ...(tt ? { tt } : {}) };
      }
      // Theory gets it: "?" always; every lost question when the level's lost marks go to Theory.
      if (row.lost && !row.th && !row.tt && (row.dk || args.to === "theory")) {
        row.th = now;
        if (by) row.tb = by;
      }
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
    const again = !!lv.fixed;
    // A level marked at home stays one (⌂); the corrector's marks on it are her check of his working.
    m.lv[key] = { done: doneAt, fixed: now, by, got, ...(lv.home ? { home: lv.home, hc: now } : {}) };
    const pre = markBefore(m, book, l.n, now);
    // How long it took to correct (the CEO page's Correction minutes): from the draft's first mark to this Save.
    const draft = again
      ? null
      : (await ctx.db.query("drafts").withIndex("by_student", (q) => q.eq("studentId", student._id)).collect()).find(
          (d) => d.unitId === unit._id && d.level === l.n,
        );
    const took = draft ? Math.max(0, now - draft._creationTime) : undefined;
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
      ...(took !== undefined && took <= TOOK_KEEP_MS ? { took } : {}),
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    const st = computeMaster(m, book);
    const lost = Object.entries(rows).filter(([, r]) => r.lost);
    return {
      got,
      max: l.max,
      unitPct: st.unit.pct,
      sofarPct: st.sofar.pct,
      theory: lost.filter(([, r]) => r.th && !r.tt).map(([q]) => Number(q)),
      evaluation: lost.filter(([, r]) => !r.th && !r.x).map(([q]) => Number(q)),
      /** Levels before it now counted as done on paper before the app. */
      pre,
    };
  },
});

/** "?" on some parts only: the parts' names (dk must be set too). Undefined: none, or the whole question. */
function blankParts(q: number, dk: boolean | undefined, dkp: string[] | undefined): string[] | undefined {
  if (!dkp || dkp.length === 0) return undefined;
  if (!dk) fail(`Question ${q}: a part left blank is a "?".`);
  if (dkp.length > 20 || dkp.some((p) => typeof p !== "string" || p.length === 0 || p.length > 12)) {
    fail(`Question ${q}: the blank parts' names are not right.`);
  }
  return [...new Set(dkp)];
}

/** How long a correction can be taken back (the Focus tab offers it on the phone that saved it). */
export const UNCORRECT_MS = 30 * 60_000;

/**
 * Take a correction back: a paper marked on the wrong student (or as the wrong level). The level and its questions go
 * back to exactly how they were before that save (`before`, kept by the phone that saved it: handed in and waiting,
 * or not handed in yet), and its "corrected" line leaves the class report as if it never happened (the history says
 * it was taken back). Only the latest correction of that level (`fixed` = its time), within 30 minutes, and only while
 * nobody has worked on its marks since: explained, sent to Theory or taught.
 */
export const uncorrect = mutation({
  args: {
    ...base,
    level: v.number(),
    fixed: v.number(),
    before: v.object({ lv: v.optional(masterStateShape.fields.lv.value), q: v.optional(masterStateShape.fields.q) }),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress, m } = await masterWork(ctx, student, args.unitId, now);
    const l = levelOf(book, args.level);
    const key = String(l.n);
    const lv = m.lv[key];
    if (!lv?.fixed) fail(`Level ${l.n} isn't corrected: nothing to take back.`);
    if (lv.fixed !== args.fixed) fail(`Level ${l.n} was corrected again since. Open it on the Correction tab.`);
    if (now - lv.fixed > UNCORRECT_MS) fail(`Too late to take back (over 30 minutes). Correct Level ${l.n} again on the Correction tab.`);
    const since = (t: number | undefined) => t !== undefined && t > lv.fixed!;
    for (let q = l.from; q <= l.to; q++) {
      const r = m.q[String(q)];
      if (!r) continue;
      if (since(r.x)) fail(`Evaluation already explained Q${q}. Correct Level ${l.n} again on the Correction tab instead.`);
      if (since(r.th) || since(r.tt)) fail(`Q${q} already went to Theory. Correct Level ${l.n} again on the Correction tab instead.`);
    }
    // Only this level's questions come back; anything else in `before` is ignored.
    const rows = args.before.q ?? {};
    for (let q = l.from; q <= l.to; q++) {
      const was = rows[String(q)];
      if (was) m.q[String(q)] = was;
      else delete m.q[String(q)];
    }
    if (args.before.lv && Object.keys(args.before.lv).length) m.lv[key] = args.before.lv;
    else delete m.lv[key];
    // The levels that save counted as done before the app go back to having no record.
    unmarkBefore(m, lv.fixed);
    // Its "corrected" line leaves the report (logged at the very moment it was fixed).
    for (const e of await ctx.db
      .query("events")
      .withIndex("by_at", (q) => q.eq("at", lv.fixed!))
      .collect()) {
      if (e.studentId === student._id && (e.kind === "level-marks" || e.kind === "level-remarks") && e.value?.startsWith(`${key} `)) {
        await ctx.db.delete(e._id);
      }
    }
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await log(ctx, session, now, {
      kind: "level-unmarked",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: `${key} ${lv.got ?? 0}/${l.max}`,
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    return true;
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
    const { unit, progress, m } = await teachWork(ctx, student, args.unitId, now);
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

/**
 * Correction or Evaluation: Theory should teach these lost questions (on = false: take them back, not taught yet).
 * He keeps working; Theory sees him at the top of its list with the questions and calls him when ready.
 */
export const toTheory = mutation({
  args: { ...base, qs: v.array(v.number()), on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    if (args.qs.length === 0) return true;
    if (args.qs.length > 400) fail("Too many questions at once.");
    const by = cleanBy(args.by);
    const student = await getStudent(ctx, args.studentId);
    const { unit, progress, m } = await teachWork(ctx, student, args.unitId, now);
    const changed: number[] = [];
    for (const q of args.qs) {
      const r = m.q[String(q)];
      if (!r?.lost) fail(`Question ${q} hasn't lost marks: only corrected questions that lost marks go to Theory.`);
      if (r.tt) continue; // already taught
      if (args.on && !r.th) {
        m.q[String(q)] = { ...r, th: now, ...(by ? { tb: by } : {}) };
        changed.push(q);
      } else if (!args.on && r.th) {
        const { th: _th, tb: _tb, ...rest } = r;
        m.q[String(q)] = rest;
        changed.push(q);
      }
    }
    if (changed.length === 0) return true;
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await log(ctx, session, now, {
      kind: args.on ? "to-theory" : "to-theory-off",
      by,
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: changed.map((q) => `Q${q}`).join(", "),
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    return true;
  },
});

/** Theory: these questions sent to it were taught (or, with on = false, not after all). */
export const taught = mutation({
  args: { ...base, qs: v.array(v.number()), on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["theory", "evaluation"], args.by);
    const now = Date.now();
    if (args.qs.length === 0) return true;
    if (args.qs.length > 400) fail("Too many questions at once.");
    const student = await getStudent(ctx, args.studentId);
    const { unit, progress, m } = await teachWork(ctx, student, args.unitId, now);
    let n = 0;
    for (const q of args.qs) {
      const r = m.q[String(q)];
      if (!r?.th) continue;
      if (args.on && !r.tt) {
        m.q[String(q)] = { ...r, tt: now };
        n++;
      } else if (!args.on && r.tt) {
        const { tt: _tt, ...rest } = r;
        m.q[String(q)] = rest;
        n++;
      }
    }
    if (n === 0) return true;
    const session = await currentSession(ctx, now);
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await log(ctx, session, now, {
      kind: args.on ? "taught" : "untaught",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: String(n),
    });
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    return true;
  },
});

/** Correction or Evaluation: Theory should teach this unit again (on = false: not needed any more). */
export const reteach = mutation({
  args: { ...base, on: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, progress, m } = await teachWork(ctx, student, args.unitId, now);
    if (!!m.reteach === args.on) return true;
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
    await refresh(ctx, student._id, now, session);
    await touch(ctx, session, now);
    return true;
  },
});

/**
 * Correction looked at the working of a level marked at home and the phone's marks stand (⌂ → ✓). The questions the
 * phone left to her (names, reasons, drawings) must be marked first: she marks them with Save, which also checks it.
 */
export const homeChecked = mutation({
  args: { ...base, level: v.number() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "evaluation"], args.by);
    const now = Date.now();
    const student = await getStudent(ctx, args.studentId);
    const { unit, book, progress, m } = await teachWork(ctx, student, args.unitId, now);
    const l = levelOf(book, args.level);
    const lv = m.lv[String(l.n)];
    if (!lv?.home || !lv.fixed) fail(`Level ${l.n} was not marked at home.`);
    if (lv.hc) return true;
    const left: number[] = [];
    for (let q = l.from; q <= l.to; q++) if (!m.q[String(q)]) left.push(q);
    if (left.length) fail(`Mark ${left.map((q) => `Q${q}`).join(", ")} first: the phone left ${left.length === 1 ? "it" : "them"} to you.`);
    m.lv[String(l.n)] = { ...lv, hc: now };
    await ctx.db.patch(progress._id, { m, updatedAt: now });
    await log(ctx, null, now, {
      kind: "level-checked",
      by: cleanBy(args.by),
      studentId: student._id,
      name: student.name,
      unit: unit.key,
      value: `${l.n} ${lv.got ?? 0}/${l.max}`,
    });
    return true;
  },
});
