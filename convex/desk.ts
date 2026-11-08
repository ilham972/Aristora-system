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
import { query } from "./_generated/server";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { bookFor, cleanBy, currentSession, fail, getStudent, log, openSession, progressFor, refresh, roomStats, STALE_SESSION_MS, touch } from "./lib/backend";
import { slDayStart } from "./lib/day";
import { DEPT_NAMES, isTeachDept } from "./lib/dept";
import { applyMark, reteachValue, wasValue, what, WORDS, type MarkResult } from "./lib/marking";
import { bookStage, teachDept } from "./schema";

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

/** One teacher's cleared work in this class: explained, sent to Theory, taught; the students she worked with. */
type Cleared = { name: string; x: number; th: number; tt: number; students: number };

/** Which number a teacher's tap moves (its undo the same number down). */
const NUMBER_OF: Record<string, "x" | "th" | "tt"> = {
  explained: "x",
  unexplained: "x",
  "to-theory": "th",
  "to-theory-off": "th",
  taught: "tt",
  untaught: "tt",
  "whole-unit": "tt",
  "whole-unit-off": "tt",
};
const UNDO = new Set(["unexplained", "to-theory-off", "untaught", "whole-unit-off"]);

/**
 * A department today (the dashboard, 8 Nov 2026, his voice note: "how many questions still pending to evaluate? how much
 * reduced today?"): what each of its teachers cleared in the class going on (at his desk, in consultation, at the board),
 * from the history. Read on opening the dashboard and every minute (never live: it reads the class's history).
 */
export const today = query({
  args: { token: v.optional(v.string()), dept: teachDept, test: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ startedAt: number | null; people: Cleared[]; total: Cleared }> => {
    await viewer(ctx, args.token, "any");
    const total: Cleared = { name: "", x: 0, th: 0, tt: 0, students: 0 };
    const session = await openSession(ctx);
    if (!session || Date.now() - session.lastActivityAt > STALE_SESSION_MS) return { startedAt: null, people: [], total };
    const test = !!args.test;
    const kids = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const mine = new Set(kids.filter((s) => !!s.test === test).map((s) => s._id as string));
    const by = new Map<string, Cleared & { ids: Set<string> }>();
    const all = new Set<string>();
    for (const e of await ctx.db
      .query("events")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect()) {
      if (e.stage !== args.dept || !e.studentId || !mine.has(e.studentId) || !e.who) continue;
      if (e.kind !== "desk" && e.kind !== "desk-undo" && e.kind !== "consult" && e.kind !== "board" && e.kind !== "board-undo") continue;
      const n = NUMBER_OF[e.value ?? ""];
      if (!n) continue;
      const down = e.kind.endsWith("-undo") || UNDO.has(e.value ?? "");
      const p = by.get(e.who) ?? { name: e.who, x: 0, th: 0, tt: 0, students: 0, ids: new Set<string>() };
      p[n] += down ? -1 : 1;
      total[n] += down ? -1 : 1;
      if (!down) {
        p.ids.add(e.studentId);
        all.add(e.studentId);
      }
      by.set(e.who, p);
    }
    const people = [...by.values()]
      .map(({ ids, ...p }) => ({ ...p, x: Math.max(0, p.x), th: Math.max(0, p.th), tt: Math.max(0, p.tt), students: ids.size }))
      .filter((p) => p.x + p.th + p.tt > 0)
      .sort((a, b) => b.x + b.tt + b.th - (a.x + a.tt + a.th) || a.name.localeCompare(b.name));
    return {
      startedAt: session.startedAt,
      people,
      total: { ...total, x: Math.max(0, total.x), th: Math.max(0, total.th), tt: Math.max(0, total.tt), students: all.size },
    };
  },
});

/** One person's correction today: workbook levels corrected, theory-book questions marked, photos from home marked. */
type Corrected = { name: string; levels: number; qs: number; photos: number; students: number };

/**
 * The Correction (Management) department today (8 Nov 2026, his "is that possible to build the correction department's
 * dashboard"): what each person corrected since midnight in Sri Lanka, from the history: workbook levels (Save on
 * Correction: "level-marks"; a level taken back loses its line), theory-book questions Correction marked (each question
 * once, as its last tap left it), and photos from home marked (each one). Anyone's correction counts (the Fighter and
 * Master teachers correct homework too). Read on opening the dashboard and every minute (never live).
 */
export const corrected = query({
  args: { token: v.optional(v.string()), test: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ since: number; people: Corrected[]; total: Corrected }> => {
    await viewer(ctx, args.token, "any");
    const since = slDayStart(Date.now());
    const test = !!args.test;
    const kids = await ctx.db
      .query("students")
      .withIndex("by_archived", (q) => q.eq("archived", false))
      .collect();
    const mine = new Set(kids.filter((s) => !!s.test === test).map((s) => s._id as string));
    const by = new Map<string, Corrected & { ids: Set<string> }>();
    const all = new Set<string>();
    const add = (who: string, n: "levels" | "qs" | "photos", studentId: string) => {
      const p = by.get(who) ?? { name: who, levels: 0, qs: 0, photos: 0, students: 0, ids: new Set<string>() };
      p[n]++;
      p.ids.add(studentId);
      all.add(studentId);
      by.set(who, p);
    };
    // A theory book's question: its last tap by Correction today (marked, or cleared again).
    const lastMark = new Map<string, { who: string; value: string; studentId: string }>();
    for (const e of await ctx.db
      .query("events")
      .withIndex("by_at", (q) => q.gte("at", since))
      .collect()) {
      if (!e.studentId || !mine.has(e.studentId)) continue;
      const who = e.who ?? "Correction";
      if (e.kind === "level-marks") add(who, "levels", e.studentId);
      else if (e.kind === "photo-marked") add(who, "photos", e.studentId);
      else if ((e.kind === "mark" || e.kind === "undo") && e.by === "correction" && e.q !== undefined)
        lastMark.set(`${e.studentId}:${e.unit ?? ""}:${e.q}`, { who, value: e.value ?? "clear", studentId: e.studentId });
    }
    for (const m of lastMark.values()) if (m.value !== "clear") add(m.who, "qs", m.studentId);
    const people = [...by.values()]
      .map(({ ids, ...p }) => ({ ...p, students: ids.size }))
      .sort((a, b) => b.levels + b.qs + b.photos - (a.levels + a.qs + a.photos) || a.name.localeCompare(b.name));
    const total: Corrected = {
      name: "",
      levels: people.reduce((n, p) => n + p.levels, 0),
      qs: people.reduce((n, p) => n + p.qs, 0),
      photos: people.reduce((n, p) => n + p.photos, 0),
      students: all.size,
    };
    return { since, people, total };
  },
});
