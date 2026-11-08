// The Consultation page (5 Nov 2026, his voice note: "sometimes we have to call some student from the hall and teach
// that one student only ... the system suggests the priority order but still I can call anyone I want ... not for
// everyone: the people I pick in Settings"). The owner, or someone with the Consultation tick, calls any student here
// to herself (calls.create with consult), and when he is with her, explains and teaches his questions one by one.
// - mark: one tap, saved at once (his rule: everything saves live), on any of his books: Explained, → Theory or Taught,
//   and back (tap again). Only for a student with her in consultation, and an undo only for what this consultation
//   did. What she explains is gone from the Evaluation teachers' list; what she teaches, from Theory's.
// - totals: what waits for Evaluation and for Theory for every student not here now (the page adds those here, live):
//   read once on opening the page and every few minutes (it reads every student's books: never a live query).

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import {
  activeCalls,
  bookFor,
  cleanBy,
  currentSession,
  fail,
  getStudent,
  log,
  masterState,
  openSession,
  progressFor,
  refresh,
  STALE_SESSION_MS,
  touch,
} from "./lib/backend";
import { fighter } from "./lib/book";
import { evalWaiting, theoryCount, theoryWaiting } from "./lib/consult";
import { applyMark, reteachValue, wasValue, what, WORDS, type MarkResult } from "./lib/marking";
import { computeMaster } from "./lib/master";
import { computeStatus, type Marks } from "./lib/status";
import { bookStage } from "./schema";

/**
 * One tap in a consultation, saved at once. `on` false = the same tap again: back as it was (only what this
 * consultation did). Returns what changed, and the circles as they were (a theory book's), for the undo.
 */
export const mark = mutation({
  args: {
    token: v.optional(v.string()),
    studentId: v.id("students"),
    unitId: v.id("units"),
    stage: bookStage,
    /** The question (0 with wu). */
    q: v.number(),
    what,
    on: v.boolean(),
    /** Undo on a theory book: its circles as they were before the tap (from the tap's answer). */
    was: v.optional(wasValue),
    /** Undo of wu: the whole-unit request as it was. */
    reteach: v.optional(reteachValue),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<MarkResult> => {
    const user = await actor(ctx, args.token, ["consult"], args.by);
    const now = Date.now();
    const s = await getStudent(ctx, args.studentId);
    const call = (await activeCalls(ctx, s._id)).find((c) => c.consult && c.teacherId === user._id);
    if (!call) fail(`${s.name} isn't in your consultation.`);
    if (call.status !== "sent" || (call.walk && call.arrivedAt === undefined)) fail(`${s.name} isn't with you yet: tap Arrived when he comes in.`);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const book = await bookFor(ctx, unit._id, args.stage);
    if (!book) fail(`${unit.key} has no ${args.stage === "fighter" ? "theory book" : "workbook"} in the app.`);
    const p = await progressFor(ctx, s._id, unit._id, args.stage);
    if (!p) fail(`${s.name} has no work in ${unit.code}.`);
    // What this consultation did may be undone; what someone did before it stays.
    const res = await applyMark(ctx, {
      s,
      book,
      p,
      stage: args.stage,
      q: args.q,
      what: args.what,
      on: args.on,
      since: call.createdAt,
      now,
      tb: "consult",
      was: args.was,
      reteach: args.reteach,
      before: " this consultation",
    });
    if (!res.changed) return res;

    const session = await currentSession(ctx, now);
    await log(ctx, session, now, {
      kind: "consult",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
      unit: unit.key,
      ...(args.what === "wu" ? {} : { q: args.q }),
      value: WORDS[args.what][args.on ? 0 : 1],
      stage: args.stage,
    });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
    return res;
  },
});

/**
 * The waiting work of every student NOT here now: the Consultation page adds the students here (live, from the board),
 * so its "All" moves with every tap of the class while this is read only now and then. A class left open since an
 * earlier day has nobody here (as on the phones).
 */
export const totals = query({
  args: { token: v.optional(v.string()), test: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "consult");
    const test = !!args.test;
    const session = await openSession(ctx);
    const live = !!session && Date.now() - session.lastActivityAt < STALE_SESSION_MS;
    const students = (
      await ctx.db
        .query("students")
        .withIndex("by_archived", (q) => q.eq("archived", false))
        .collect()
    ).filter((s) => !!s.test === test && !(live && s.present));
    const cache = new Map<string, Doc<"books"> | null>();
    const bookOf = async (unitId: Id<"units">, stage: "fighter" | "master") => {
      const k = `${unitId}:${stage}`;
      if (!cache.has(k)) cache.set(k, await bookFor(ctx, unitId, stage));
      return cache.get(k) ?? null;
    };
    // Every book (as before), and each department's books (8 Nov 2026: Fighter = theory books, Master = workbooks).
    const zero = () => ({ evaluation: { qs: 0, students: 0 }, theory: { qs: 0, students: 0 } });
    const out = { ...zero(), fighter: zero(), master: zero() };
    for (const s of students) {
      let e = 0;
      let t = 0;
      const d = { fighter: { e: 0, t: 0 }, master: { e: 0, t: 0 } };
      for (const p of await ctx.db
        .query("progress")
        .withIndex("by_student", (q) => q.eq("studentId", s._id))
        .collect()) {
        const b = await bookOf(p.unitId, p.stage);
        if (!b) continue;
        const bookNow = p.unitId === s.unitId && p.stage === s.stage;
        if (b.data.kind === "fighter" && p.stage === "fighter") {
          const f = fighter(b.data);
          const marks = (p.marks ?? {}) as Marks;
          const st = computeStatus(marks, f);
          const be = evalWaiting(st, null).length;
          const bt = theoryCount(theoryWaiting({ st, f, marks, ms: null, bookNow }));
          e += be;
          t += bt;
          d.fighter.e += be;
          d.fighter.t += bt;
        } else if (b.data.kind === "master" && p.stage === "master") {
          const ms = computeMaster(masterState(p), b.data);
          const be = evalWaiting(null, ms).length;
          const bt = theoryCount(theoryWaiting({ st: null, f: null, marks: {}, ms, bookNow }));
          e += be;
          t += bt;
          d.master.e += be;
          d.master.t += bt;
        }
      }
      for (const k of ["fighter", "master"] as const) {
        if (d[k].e) {
          out[k].evaluation.qs += d[k].e;
          out[k].evaluation.students++;
        }
        if (d[k].t) {
          out[k].theory.qs += d[k].t;
          out[k].theory.students++;
        }
      }
      if (e) {
        out.evaluation.qs += e;
        out.evaluation.students++;
      }
      if (t) {
        out.theory.qs += t;
        out.theory.students++;
      }
    }
    return out;
  },
});
