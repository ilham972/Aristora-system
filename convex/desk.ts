// The Fighter and Master pages (8 Nov 2026, his voice note: "theory teachers are not sitting in their own room, they
// always cycling in all grades ... they go to the specific grade that the system suggests ... call those two students by
// their mouth, not in the mobile ... we have to remove the call and arrive button ... they can pick the evaluation pills
// and students and they can immediately teach"). No call, no room: the lead teacher walks to the students and every tap
// is saved at once (his rule: everything saves live) for the students she ticked: Explained, → Theory, Taught, and back.
// - Her department decides the books: Fighter = theory books (their theory and their wrong answers), Master = workbooks
//   (lost marks and blanks, and the theory they need). The owner and a teacher with no department: any book.
// - What it saves is exactly the Consultation page's (convex/lib/marking.ts), for several students at once; what someone
//   did before this sitting (`since`) stays.
// - The history: one "desk" event per student and tap (value explained / to-theory / taught / whole-unit; `who` = the
//   teacher; the undo "desk-undo"), so her card counts the time as her work (convex/lib/boss.ts, as a lesson at the
//   board), he is seen by that room today, and her room's score counts each question (and the lesson on its first tap).

import { ConvexError, v } from "convex/values";
import { mutation } from "./lib/fn";
import { actor } from "./lib/auth";
import { bookFor, cleanBy, currentSession, fail, getStudent, log, progressFor, refresh, roomStats, touch } from "./lib/backend";
import { DEPT_NAMES, isTeachDept } from "./lib/dept";
import { applyMark, reteachValue, wasValue, what, WORDS, type MarkResult } from "./lib/marking";
import { bookStage } from "./schema";

/** A sitting's undo reaches back at most this far (a phone left open since the morning can't undo yesterday). */
export const SITTING_MAX_MS = 3 * 60 * 60_000;

export const mark = mutation({
  args: {
    token: v.optional(v.string()),
    unitId: v.id("units"),
    stage: bookStage,
    /** The question (0 with wu). */
    q: v.number(),
    what,
    on: v.boolean(),
    /** When her sitting with them started (the page's pick): only what she did since may be undone. */
    since: v.number(),
    /** Each student, with what his undo needs (a theory book's circles before the tap; a whole-unit request). */
    items: v.array(v.object({ studentId: v.id("students"), was: v.optional(wasValue), reteach: v.optional(reteachValue) })),
    /** The first Taught of a lesson: her score counts the lesson. */
    lesson: v.optional(v.boolean()),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token, ["theory", "evaluation"], args.by);
    if (args.items.length === 0) fail("Tick at least one student.");
    if (args.items.length > 30) fail("Too many students at once.");
    // Her department's books only (the Fighter page: theory books; the Master page: workbooks).
    if (user.role === "teacher" && isTeachDept(user.dept) && user.dept !== args.stage) {
      fail(`That is a ${args.stage === "fighter" ? "theory book" : "workbook"}: the ${DEPT_NAMES[args.stage]} department's.`);
    }
    const now = Date.now();
    const since = Math.max(args.since, now - SITTING_MAX_MS);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    const book = await bookFor(ctx, unit._id, args.stage);
    if (!book) fail(`${unit.key} has no ${args.stage === "fighter" ? "theory book" : "workbook"} in the app.`);
    const by = cleanBy(args.by);
    // Explaining is Evaluation's work, teaching Theory's (her score and her card): the tap's own kind decides.
    const room = args.what === "tt" || args.what === "wu" ? "theory" : "evaluation";
    const session = await currentSession(ctx, now);
    const out: ({ studentId: string; name: string } & MarkResult)[] = [];
    const errors: string[] = [];
    let first = true;
    for (const it of args.items) {
      const s = await getStudent(ctx, it.studentId);
      const p = await progressFor(ctx, s._id, unit._id, args.stage);
      if (!p) {
        errors.push(`${s.name} has no work in ${unit.code}`);
        continue;
      }
      let res: MarkResult;
      try {
        res = await applyMark(ctx, { s, book, p, stage: args.stage, q: args.q, what: args.what, on: args.on, since, now, tb: "desk", was: it.was, reteach: it.reteach });
      } catch (e) {
        // One student who can't have it (explained by someone else meanwhile) never stops the others.
        if (!(e instanceof ConvexError)) throw e;
        errors.push(`${s.name}: ${String(e.data)}`);
        continue;
      }
      out.push({ studentId: s._id, name: s.name, ...res });
      if (!res.changed) continue;
      await log(ctx, session, now, {
        kind: args.on ? "desk" : "desk-undo",
        by,
        studentId: s._id,
        name: s.name,
        unit: unit.key,
        ...(args.what === "wu" ? {} : { q: args.q }),
        value: WORDS[args.what][args.on ? 0 : 1],
        stage: args.stage,
      });
      if (args.on) await ctx.db.patch(s._id, { lastSeenAt: now, seen: { ...s.seen, [room]: now } });
      await refresh(ctx, s._id, now, session);
      await roomStats(ctx, s, session, room, { qs: args.on ? 1 : -1 });
      if (args.on && first && args.lesson && room === "theory") await roomStats(ctx, s, session, "theory", { lessons: 1, done: args.items.length });
      first = false;
    }
    if (out.some((x) => x.changed)) await touch(ctx, session, now);
    return { at: now, items: out, errors };
  },
});
