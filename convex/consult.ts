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
  asFighter,
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
import { computeMaster, type MQ, type MState } from "./lib/master";
import { computeStatus, type Mark, type Marks } from "./lib/status";
import { bookStage, markValue } from "./schema";

/** x = explained, th = to Theory, tt = taught (Theory), wu = the whole unit taught (a workbook's whole-unit request). */
const what = v.union(v.literal("x"), v.literal("th"), v.literal("tt"), v.literal("wu"));
type What = "x" | "th" | "tt" | "wu";

const WORDS: Record<What, [string, string]> = {
  x: ["explained", "unexplained"],
  th: ["to-theory", "to-theory-off"],
  tt: ["taught", "untaught"],
  wu: ["whole-unit", "whole-unit-off"],
};

/** A circle before a tap, for its undo. */
type Was = { q: number; mark: Mark | null };

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
    was: v.optional(v.array(v.object({ q: v.number(), mark: v.union(markValue, v.null()) }))),
    /** Undo of wu: the whole-unit request as it was. */
    reteach: v.optional(v.object({ at: v.number(), by: v.optional(v.string()) })),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ changed: boolean; was: Was[]; reteach?: { at: number; by?: string } }> => {
    const user = await actor(ctx, args.token, ["consult"], args.by);
    const now = Date.now();
    const s = await getStudent(ctx, args.studentId);
    const call = (await activeCalls(ctx, s._id)).find((c) => c.consult && c.teacherId === user._id);
    if (!call) fail(`${s.name} isn't in your consultation.`);
    if (call.status !== "sent" || (call.walk && call.arrivedAt === undefined)) fail(`${s.name} isn't with you yet: tap Arrived when he comes in.`);
    // What this consultation did may be undone; what someone did before it stays.
    const since = call.createdAt;
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const book = await bookFor(ctx, unit._id, args.stage);
    if (!book) fail(`${unit.key} has no ${args.stage === "fighter" ? "theory book" : "workbook"} in the app.`);
    const p = await progressFor(ctx, s._id, unit._id, args.stage);
    if (!p) fail(`${s.name} has no work in ${unit.code}.`);
    const key = String(args.q);
    const Q = `Q${args.q}`;
    const nothing = { changed: false, was: [] as Was[] };
    let was: Was[] = [];
    let reteach: { at: number; by?: string } | undefined;

    if (args.stage === "master") {
      if (args.what === "wu") {
        // The whole unit, asked for Theory (Correction or Evaluation): taught here.
        const m: MState = { ...masterState(p), q: { ...masterState(p).q } };
        if (args.on) {
          if (!m.reteach) return nothing;
          reteach = m.reteach;
          delete m.reteach;
        } else {
          if (m.reteach) return nothing;
          m.reteach = args.reteach ?? { at: now, by: "consult" };
        }
        await ctx.db.patch(p._id, { m, updatedAt: now });
      } else {
        const m: MState = { ...masterState(p), q: { ...masterState(p).q } };
        const r = m.q[key] as MQ | undefined;
        if (!r?.lost) fail(`${Q} hasn't lost marks.`);
        let next: MQ;
        if (args.what === "x") {
          if (args.on) {
            if (r.x || r.tt) return nothing;
            if (r.th && r.th < since) fail(`${Q} is with Theory: it is taught there.`);
            const { th: _th, tb: _tb, ...rest } = r;
            next = { ...rest, x: now };
          } else {
            if (!r.x) return nothing;
            if (r.x < since) fail(`${Q} was explained before this consultation.`);
            const { x: _x, ...rest } = r;
            next = rest;
          }
        } else if (args.what === "th") {
          if (args.on) {
            if (r.th || r.tt) return nothing;
            if (r.x && r.x < since) fail(`${Q} was explained before this consultation.`);
            const { x: _x, ...rest } = r;
            next = { ...rest, th: now, tb: "consult" };
          } else {
            if (!r.th || r.tt) return nothing;
            if (r.th < since) fail(`${Q} was sent to Theory before this consultation.`);
            const { th: _th, tb: _tb, ...rest } = r;
            next = rest;
          }
        } else {
          if (args.on) {
            if (!r.th) fail(`${Q} isn't waiting for Theory.`);
            if (r.tt) return nothing;
            next = { ...r, tt: now };
          } else {
            if (!r.tt) return nothing;
            if (r.tt < since) fail(`${Q} was taught before this consultation.`);
            const { tt: _tt, ...rest } = r;
            next = rest;
          }
        }
        m.q[key] = next;
        await ctx.db.patch(p._id, { m, updatedAt: now });
      }
    } else {
      // A theory book: its circles.
      if (args.what === "wu") fail("A theory book has no whole-unit request.");
      const f = asFighter(book);
      if (!f.isQuestion(args.q)) fail(`${Q} isn't in this book.`);
      const marks: Record<string, Mark> = { ...(p.marks ?? {}) };
      const cur = marks[key] ?? null;
      const back = (q: number, fallback: Mark | null) => {
        const w = args.was?.find((x) => x.q === q);
        return w ? w.mark : fallback;
      };
      const put = (q: number, m: Mark | null) => {
        if (m) marks[String(q)] = m;
        else delete marks[String(q)];
      };
      if (args.what === "tt") {
        if (f.typeOf(args.q) !== "teach") fail(`${Q} is a ladder question: only teacher questions are taught.`);
        if (args.on) {
          if (cur?.s === "taught") return nothing;
          was = [{ q: args.q, mark: cur }];
          put(args.q, { s: "taught", t: now });
        } else {
          if (cur?.s !== "taught") return nothing;
          if (cur.t < since) fail(`${Q} was taught before this consultation.`);
          put(args.q, back(args.q, null));
        }
      } else {
        if (f.typeOf(args.q) !== "solo") fail(`${Q} is a teacher question: it is taught, not explained.`);
        // → Theory on a theory book (as on the Evaluation page): explained, and its section goes back to Theory's list
        // (its teacher questions open again), so Theory teaches it again and he redoes the question after.
        const sec = f.sectionOf(args.q);
        const reteachable = sec.kind === "ladder" && sec.teach.length > 0;
        if (args.what === "th" && args.on && !reteachable) fail(`${Q} has no section to teach again: explain it.`);
        if (args.on) {
          if (cur?.s !== "wrong") return nothing;
          was = [{ q: args.q, mark: cur }];
          put(args.q, cur.n ? { s: "explained", n: cur.n, t: now } : { s: "explained", t: now });
          if (args.what === "th") {
            for (const tq of sec.teach) {
              was.push({ q: tq, mark: marks[String(tq)] ?? null });
              put(tq, null);
            }
          }
        } else {
          if (cur?.s !== "explained") return nothing;
          if (cur.t < since) fail(`${Q} was explained before this consultation.`);
          put(args.q, back(args.q, cur.n ? { s: "wrong", n: cur.n, t: now } : { s: "wrong", t: now }));
          // → Theory taken back: the section's teacher questions as they were (when the phone still knows them).
          if (args.what === "th") for (const tq of sec.teach) if (args.was?.some((x) => x.q === tq)) put(tq, back(tq, null));
        }
      }
      await ctx.db.patch(p._id, { marks, updatedAt: now });
    }

    const session = await currentSession(ctx, now);
    await log(ctx, session, now, {
      kind: "consult",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
      unit: unit.key,
      ...(args.what === "wu" ? {} : { q: args.q }),
      value: WORDS[args.what][args.on ? 0 : 1],
    });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
    return { changed: true, was, ...(reteach ? { reteach } : {}) };
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
    const out = { evaluation: { qs: 0, students: 0 }, theory: { qs: 0, students: 0 } };
    for (const s of students) {
      let e = 0;
      let t = 0;
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
          e += evalWaiting(st, null).length;
          t += theoryCount(theoryWaiting({ st, f, marks, ms: null, bookNow }));
        } else if (b.data.kind === "master" && p.stage === "master") {
          const ms = computeMaster(masterState(p), b.data);
          e += evalWaiting(null, ms).length;
          t += theoryCount(theoryWaiting({ st: null, f: null, marks: {}, ms, bookNow }));
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
