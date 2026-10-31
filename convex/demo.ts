import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { bookFor, cleanBy, currentSession, ensureSession, fail, log, refresh, startVisit, touch } from "./lib/backend";
import { fighter, KNOWN_WORKBOOKS, levelOutOf, PILOT_UNIT, type MasterData } from "./lib/book";
import type { MQ, MState } from "./lib/master";
import type { Mark } from "./lib/status";
import { unitKey } from "./lib/syllabus";
import { actor, viewer } from "./lib/auth";

type FighterPlan = {
  name: string;
  present: boolean;
  taught: string;
  right: [number, number][];
  wrong?: [number, number, number][];
  slip?: [number, number][];
  activeMinAgo?: number;
};

const r = (a: number, b: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let q = a; q <= b; q++) out.push([q, 0]);
  return out;
};

// Grade 11, on the pilot theory book (Fighter), spread across the unit so every screen has something to show.
const FIGHTERS: FighterPlan[] = [
  { name: "Ahamed", present: true, taught: "ABC", right: [...r(5, 8), ...r(12, 14), ...r(18, 20)], activeMinAgo: 4 },
  { name: "Fathima", present: true, taught: "ABC", right: [...r(5, 8), ...r(12, 14), ...r(18, 21)], wrong: [[22, 8, 1]], activeMinAgo: 8 },
  { name: "Kumar", present: true, taught: "ABCD", right: [...r(5, 8), ...r(12, 14), ...r(18, 22), [27, 0]], wrong: [[28, 14, 1], [29, 3, 1]], activeMinAgo: 3 },
  { name: "Nila", present: true, taught: "ABC", right: [...r(5, 8), ...r(12, 14), [18, 0]], activeMinAgo: 6 },
  { name: "Rizwan", present: true, taught: "AB", right: [...r(5, 8), ...r(12, 14)], activeMinAgo: 5 },
  { name: "Sana", present: true, taught: "ABCD", right: [...r(5, 8), ...r(12, 14), ...r(18, 22), ...r(27, 31)], activeMinAgo: 2 },
  { name: "Tharun", present: true, taught: "A", right: [[5, 0], [6, 0]], activeMinAgo: 19 },
  { name: "Yasmin", present: true, taught: "ABCDEF", right: [...r(5, 8), ...r(12, 14), ...r(18, 22), ...r(27, 33), ...r(37, 40), ...r(44, 50), [51, 0]], slip: [[52, 5]], activeMinAgo: 5 },
  { name: "Dilan", present: true, taught: "ABC", right: [...r(5, 8), ...r(12, 14), [19, 0], [20, 0]], wrong: [[18, 6, 2]], activeMinAgo: 6 },
  { name: "Keerthi", present: false, taught: "A", right: [[5, 0]] },
];

/** Grade 7, on the Directed numbers workbook (Master). Levels: corrected (marks lost on some questions), waiting. */
type MasterPlan = {
  name: string;
  /** Corrected levels: level number -> questions that lost marks (got 0). */
  fixed: Record<number, number[]>;
  /** Levels handed in and waiting, with minutes ago. */
  waiting?: [number, number][];
  activeMinAgo: number;
};
const MASTERS: MasterPlan[] = [
  { name: "Malik", fixed: { 1: [4], 2: [13, 17] }, waiting: [[3, 6]], activeMinAgo: 6 },
  { name: "Priya", fixed: { 1: [] }, activeMinAgo: 3 },
  { name: "Vimal", fixed: { 1: [], 2: [], 3: [22], 4: [], 5: [], 6: [51], 7: [] }, waiting: [[8, 9]], activeMinAgo: 9 },
];

function fighterMarks(p: FighterPlan, now: number, book: ReturnType<typeof fighter>): Record<string, Mark> {
  const marks: Record<string, Mark> = {};
  const ago = (min: number) => now - min * 60_000;
  for (const id of p.taught) {
    for (const q of book.sectionById(id)!.teach) marks[String(q)] = { s: "taught", t: ago(70) };
  }
  for (const [q] of p.right) marks[String(q)] = { s: "right", t: ago(30) };
  for (const [q, min, n] of p.wrong ?? []) marks[String(q)] = { s: "wrong", n, t: ago(min) };
  for (const [q, min] of p.slip ?? []) marks[String(q)] = { s: "slip", t: ago(min) };
  return marks;
}

function masterMarks(p: MasterPlan, now: number, book: MasterData): MState {
  const m: MState = { q: {}, lv: {} };
  const ago = (min: number) => now - min * 60_000;
  for (const [n, lost] of Object.entries(p.fixed)) {
    const l = book.levels.find((x) => x.n === Number(n))!;
    const each = levelOutOf(book, l)!;
    let got = 0;
    for (let q = l.from; q <= l.to; q++) {
      const max = each[q - l.from];
      const g = lost.includes(q) ? 0 : max;
      got += g;
      const row: MQ = { got: g, max, lost: g < max, t: ago(40) };
      m.q[String(q)] = row;
    }
    m.lv[n] = { done: ago(55), fixed: ago(40), by: "correction", got };
  }
  for (const [n, min] of p.waiting ?? []) m.lv[String(n)] = { done: ago(min) };
  return m;
}

async function unitByKey(ctx: MutationCtx, grade: number, code: string): Promise<Doc<"units">> {
  const u = await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", unitKey(grade, code))).first();
  if (!u) fail("The syllabus is not loaded yet. Refresh the page and try again.");
  return u;
}

/** Fill an empty class with 14 demo students of three grades, ready to play with. */
export const load = mutation({
  args: { token: v.optional(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const by = cleanBy(args.by);
    const current = (await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect()).filter((x) => !x.test);
    if (current.length) fail("Demo students only load into an empty class. Remove the current students first.");
    const session = await ensureSession(ctx, now, by);

    const pilot = await unitByKey(ctx, PILOT_UNIT.grade, PILOT_UNIT.code);
    const pilotBook = await bookFor(ctx, pilot._id, "fighter");
    if (!pilotBook || pilotBook.data.kind !== "fighter") fail("The pilot theory book is not loaded yet.");
    const f = fighter(pilotBook.data);
    const wb = KNOWN_WORKBOOKS[0];
    const wUnit = await unitByKey(ctx, wb.grade, wb.code);
    const wBook = await bookFor(ctx, wUnit._id, "master");
    if (!wBook || wBook.data.kind !== "master") fail("The demo workbook is not loaded yet.");
    const legendUnit = await unitByKey(ctx, 9, "U21");

    const add = async (doc: Omit<Doc<"students">, "_id" | "_creationTime">): Promise<Id<"students">> =>
      await ctx.db.insert("students", doc);
    const ids: Id<"students">[] = [];
    for (const p of FIGHTERS) {
      const id = await add({
        name: p.name,
        archived: false,
        demo: true,
        present: p.present,
        grade: 11,
        term: 2,
        stage: "fighter",
        unitId: pilot._id,
        idleMs: 0,
        lastActivityAt: p.activeMinAgo === undefined ? undefined : now - p.activeMinAgo * 60_000,
      });
      await ctx.db.insert("progress", {
        studentId: id,
        unitId: pilot._id,
        stage: "fighter",
        marks: fighterMarks(p, now, f),
        startedAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    for (const p of MASTERS) {
      const id = await add({
        name: p.name,
        archived: false,
        demo: true,
        present: true,
        grade: 7,
        term: 1,
        stage: "master",
        unitId: wUnit._id,
        idleMs: 0,
        lastActivityAt: now - p.activeMinAgo * 60_000,
      });
      await ctx.db.insert("progress", {
        studentId: id,
        unitId: wUnit._id,
        stage: "master",
        marks: {},
        m: masterMarks(p, now, wBook.data),
        startedAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    ids.push(
      await add({
        name: "Zainab",
        archived: false,
        demo: true,
        present: true,
        grade: 9,
        term: 3,
        stage: "legend",
        unitId: legendUnit._id,
        idleMs: 0,
        lastActivityAt: now - 10 * 60_000,
      }),
    );
    for (const id of ids) {
      // The ones in class arrived a little before their last mark, so the register has a time for them.
      const s = (await ctx.db.get(id))!;
      if (s.present) {
        const inAt = Math.min(now, (s.lastActivityAt ?? now) - 15 * 60_000);
        await ctx.db.patch(id, { lastInAt: inAt });
        await startVisit(ctx, id, inAt, session);
      }
      await refresh(ctx, id, now, session);
    }
    await log(ctx, session, now, { kind: "demo-load", by, value: String(ids.length) });
    await touch(ctx, session, now);
  },
});

/** Delete every demo student and their work, or (test) every test student (real students are never touched). */
export const remove = mutation({
  args: { token: v.optional(v.string()), test: v.optional(v.boolean()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const all = await ctx.db.query("students").collect();
    const gone = all.filter((s) => (args.test ? s.test : s.demo && !s.test));
    for (const s of gone) await wipe(ctx, s);
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: args.test ? "test-remove" : "demo-remove", by: cleanBy(args.by), value: String(gone.length) });
    await touch(ctx, session, now);
    return gone.length;
  },
});

/** A student and everything of his: calls, books, visits, books given, Correction's drafts and claims. */
async function wipe(ctx: MutationCtx, s: Doc<"students">) {
  for (const status of ["requested", "sent", "done", "cancelled", "declined"] as const) {
    const calls = await ctx.db
      .query("calls")
      .withIndex("by_student_status", (q) => q.eq("studentId", s._id).eq("status", status))
      .collect();
    for (const c of calls) await ctx.db.delete(c._id);
  }
  for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(p._id);
  for (const a of await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(a._id);
  for (const h of await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(h._id);
  for (const d of await ctx.db.query("drafts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(d._id);
  for (const c of await ctx.db.query("claims").withIndex("by_paper", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(c._id);
  await ctx.db.delete(s._id);
}

// ---------------------------------------------------------------- the test class (31 Oct 2026, his voice note)
//
// Test students live in a class of their own: only a phone in test mode sees them (state.get `test`), and they never
// count anywhere (demo is set too: reports, the CEO page, the Students numbers, the rooms' scores). Two ways in:
// - copyGrade: every real student of a grade as "<name> test", with the same grade, stage, book now, every book's levels
//   and marks, and books given (as they are at that moment); copying the grade again starts them over;
// - cases: the extra test students, one for every situation the Theory and Evaluation pages must handle.

/** Test students at most: every phone in test mode loads them all. */
export const TEST_CAP = 120;

/** "Dilrash R" → "Dilrash R test" (names stay under 40 letters). */
export const testName = (name: string) => `${name.slice(0, 35).trim()} test`;

/** Owner: how many real students each grade has, how many test copies, extra test students, test students in all. */
export const testInfo = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const all = (await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect());
    const real: Record<string, number> = {};
    const copies: Record<string, number> = {};
    let cases = 0;
    for (const s of all) {
      const g = String(s.grade ?? "");
      if (s.test) {
        if (s.copyOf) copies[g] = (copies[g] ?? 0) + 1;
        else cases++;
      } else if (!s.demo) real[g] = (real[g] ?? 0) + 1;
    }
    return { real, copies, cases, tests: all.filter((s) => s.test).length };
  },
});

/** Owner: copy one grade's real students into the test class (again: they start over from the real ones). */
export const copyGrade = mutation({
  args: { token: v.optional(v.string()), grade: v.number(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const by = cleanBy(args.by);
    const all = await ctx.db.query("students").collect();
    const real = all.filter((s) => !s.archived && !s.demo && !s.test && s.grade === args.grade).sort((a, b) => a.name.localeCompare(b.name));
    if (real.length === 0) fail(`No Grade ${args.grade} students to copy.`);
    const old = all.filter((s) => s.test && s.copyOf && s.grade === args.grade);
    if (all.filter((s) => s.test).length - old.length + real.length > TEST_CAP) fail(`${TEST_CAP} test students at most. Delete the test students first.`);
    for (const s of old) await wipe(ctx, s);
    const session = await ensureSession(ctx, now, by);
    const inAt = now - 10 * 60_000;
    for (const s of real) {
      const id = await ctx.db.insert("students", {
        name: testName(s.name),
        archived: false,
        demo: true,
        test: true,
        copyOf: s._id,
        present: true,
        grade: s.grade,
        term: s.term,
        stage: s.stage,
        unitId: s.unitId,
        ...(s.back ? { back: s.back } : {}),
        ...(s.openAll ? { openAll: true } : {}),
        idleMs: 0,
        lastActivityAt: now,
        lastInAt: inAt,
      });
      for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
        const { _id, _creationTime, ...row } = p;
        await ctx.db.insert("progress", { ...row, studentId: id });
      }
      for (const h of await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
        await ctx.db.insert("handouts", { studentId: id, unitId: h.unitId, stage: h.stage, at: h.at, ...(h.by ? { by: h.by } : {}) });
      }
      await startVisit(ctx, id, inAt, session);
      await refresh(ctx, id, now, session);
    }
    await log(ctx, session, now, { kind: "test-copy", by, value: `${args.grade} ${real.length}` });
    await touch(ctx, session, now);
    return real.length;
  },
});

/** In Evaluation with the teacher who made the cases, or called by her (a room to test pulls and bumps). */
type Room = "with-eval" | "eval-called";
/** A theory-book (Fighter, G11 U13) test student: the FighterPlan's marks, and what he is doing. */
type FCase = {
  name: string;
  note: string;
  taught: string;
  right: [number, number][];
  wrong?: [number, number, number][];
  /** No work for this long (minutes). */
  idleMin?: number;
  /** Arrived this long ago (default 30 min; 115 = goes home in 5 minutes). */
  inMin?: number;
  /** Theory finished with him this long ago, today. */
  seenTheoryMin?: number;
  /** His last mark this long ago (default 5 min). */
  activeMin?: number;
  room?: Room;
};
/** A workbook (Master, G7 U08) test student. */
type MCase = {
  name: string;
  note: string;
  /** Corrected levels: level → questions that lost every mark. */
  fixed: Record<number, number[]>;
  /** Corrected this long ago (minutes; default 40): the 10-minute "ready" clock. */
  fixedMin?: number;
  /** Levels handed in, waiting for Correction: [level, minutes ago]. */
  waiting?: [number, number][];
  /** Questions sent to Theory: [question, minutes ago, by]. */
  th?: [number, number, "evaluation" | "correction"][];
  /** "?": he couldn't start it (straight to Theory): [question, minutes ago]. */
  dk?: [number, number][];
  /** The whole unit again, asked this long ago. */
  reteachMin?: number;
  idleMin?: number;
  activeMin?: number;
  /** Went home today (signed out), his levels still to correct. */
  gone?: boolean;
};

const AB = [...r(5, 8), ...r(12, 14)];
const F_CASES: FCase[] = [
  { name: "No work D", note: "Theory: needs section D, no work for 6 min (red)", taught: "ABC", right: [...AB, ...r(18, 22)], idleMin: 6 },
  { name: "Starving D", note: "Theory: needs D, no work for 25 min (starving: D comes first)", taught: "ABC", right: [...AB, ...r(18, 22)], idleMin: 25 },
  { name: "Soon D", note: "Theory: 2 questions left, then D (runs out soon: amber)", taught: "ABC", right: [...AB, ...r(18, 20)], activeMin: 2 },
  { name: "Later D", note: "Theory: 5 questions left before D (not soon)", taught: "ABC", right: AB, activeMin: 3 },
  { name: "Seen D", note: "Theory: needs D, no work, but Theory had him today (after the others)", taught: "ABC", right: [...AB, ...r(18, 22)], idleMin: 3, seenTheoryMin: 40 },
  { name: "In Eval D", note: "With you in Evaluation (Q22), needs D: Theory calling him = Theory wants him now", taught: "ABC", right: [...AB, ...r(18, 21)], wrong: [[22, 12, 1]], room: "with-eval" },
  { name: "Eval called", note: "Evaluation called him (Q22), needs D: Theory calling him cancels her call", taught: "ABC", right: [...AB, ...r(18, 21)], wrong: [[22, 11, 1]], room: "eval-called" },
  { name: "Home soon", note: "Theory: needs D but goes home in 5 min (listed, not ticked)", taught: "ABC", right: [...AB, ...r(18, 22)], idleMin: 2, inMin: 115 },
  { name: "No work C", note: "Theory: needs section C, no work for 4 min (a second lesson)", taught: "AB", right: AB, idleMin: 4 },
  { name: "Ready 20", note: "Evaluation: Q20 wrong 15 min ago (ready: orange), still has work", taught: "ABC", right: [...AB, ...r(18, 19)], wrong: [[20, 15, 1]], activeMin: 4 },
  { name: "Fresh 21", note: "Evaluation: Q21 wrong 3 min ago (not ready yet: yellow)", taught: "ABC", right: [...AB, ...r(18, 20)], wrong: [[21, 3, 1]], activeMin: 3 },
  { name: "Stuck 19", note: "Evaluation: Q19 wrong twice (stuck: red)", taught: "ABC", right: [...AB, ...r(18, 18)], wrong: [[19, 5, 2]], activeMin: 5 },
  { name: "Stopped C", note: "Evaluation: Q18 Q19 Q20 wrong, section C stopped (red)", taught: "ABC", right: AB, wrong: [[18, 9, 1], [19, 9, 1], [20, 9, 1]], idleMin: 7 },
];
const ALL_LEVELS = (lost: Record<number, number[]>) => Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map((n) => [n, lost[n] ?? []]));
const M_CASES: MCase[] = [
  { name: "Lost 4·9 a", note: "Evaluation: lost Q4 and Q9 15 min ago, like b and c: one pill for the three", fixed: { 1: [4, 9] }, fixedMin: 15, activeMin: 3 },
  { name: "Lost 4·9 b", note: "Evaluation: lost Q4 and Q9 25 min ago", fixed: { 1: [4, 9] }, fixedMin: 25, activeMin: 6 },
  { name: "Lost 4·9 c", note: "Evaluation: lost Q4 and Q9 5 min ago (not ready yet)", fixed: { 1: [4, 9] }, fixedMin: 5, activeMin: 2 },
  { name: "Lost 13 a", note: "Evaluation: lost Q13 (with Lost 13 b and Lost 13·17)", fixed: { 1: [], 2: [13] }, fixedMin: 18, activeMin: 4 },
  { name: "Lost 13 b", note: "Evaluation: lost Q13", fixed: { 1: [], 2: [13] }, fixedMin: 12, activeMin: 5 },
  { name: "Lost 13·17", note: "Evaluation: lost Q13 and Q17: Q13 with two others, Q17 alone (two pills)", fixed: { 1: [], 2: [13, 17] }, fixedMin: 20, activeMin: 3 },
  ...[1, 2, 3, 4, 5, 6, 7].map(
    (i): MCase => ({ name: `Crowd ${i}`, note: "Evaluation: 7 lost Q2: the page ticks 6 at most", fixed: { 1: [2] }, fixedMin: 10 + i, activeMin: 2 + (i % 4) }),
  ),
  { name: "All done 51", note: "Evaluation: every level handed in, Q51 lost: no work (red)", fixed: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [51], 7: [] }, fixedMin: 22, waiting: [[8, 20]], idleMin: 20 },
  { name: "Theory 13·17", note: "Theory: Evaluation sent Q13 and Q17 25 min ago (waited long)", fixed: { 1: [], 2: [13, 17] }, fixedMin: 40, th: [[13, 25, "evaluation"], [17, 25, "evaluation"]], activeMin: 4 },
  { name: "Theory 13", note: "Theory: Evaluation sent Q13 10 min ago (Q13 for two)", fixed: { 1: [], 2: [13] }, fixedMin: 30, th: [[13, 10, "evaluation"]], activeMin: 3 },
  { name: "Whole unit", note: "Theory: the whole unit again (Correction asked)", fixed: { 1: [], 2: [], 3: [] }, fixedMin: 35, reteachMin: 15, activeMin: 5 },
  { name: "Couldn't 4", note: "Theory: ? on Q4 (couldn't start it); every level done: no work (red)", fixed: ALL_LEVELS({ 1: [4] }), fixedMin: 45, dk: [[4, 30]], idleMin: 12 },
  { name: "Gone home", note: "Went home with Level 2 handed in: Evaluation's 'Gone home, levels to correct'", fixed: { 1: [3] }, fixedMin: 50, waiting: [[2, 40]], gone: true },
];

/** A workbook test student's levels and marks (MCase), against the book's own levels and marks. */
function caseMaster(c: MCase, now: number, book: MasterData): MState {
  const ago = (min: number) => now - min * 60_000;
  const m: MState = { q: {}, lv: {} };
  const fixedAt = ago(c.fixedMin ?? 40);
  for (const [n, lost] of Object.entries(c.fixed)) {
    const l = book.levels.find((x) => x.n === Number(n));
    if (!l) continue;
    const each = levelOutOf(book, l);
    let got = 0;
    for (let q = l.from; q <= l.to; q++) {
      const max = each?.[q - l.from] ?? 2;
      const g = lost.includes(q) ? 0 : max;
      got += g;
      m.q[String(q)] = { got: g, max, lost: g < max, t: fixedAt };
    }
    m.lv[n] = { done: fixedAt - 15 * 60_000, fixed: fixedAt, by: "correction", got };
  }
  for (const [n, min] of c.waiting ?? []) m.lv[String(n)] = { done: ago(min) };
  for (const [q, min, by] of c.th ?? []) {
    const row = m.q[String(q)];
    if (row) m.q[String(q)] = { ...row, th: ago(min), tb: by };
  }
  for (const [q, min] of c.dk ?? []) {
    const row = m.q[String(q)];
    if (row) m.q[String(q)] = { ...row, got: 0, lost: true, dk: true, th: ago(min), tb: "correction" };
  }
  if (c.reteachMin !== undefined) m.reteach = { at: ago(c.reteachMin), by: "correction" };
  return m;
}

/** Two workbooks of one grade (Grade 8 first: his uploads), for the "two books" test student; null when none has two. */
async function twoWorkbooks(ctx: MutationCtx): Promise<{ a: Doc<"units">; b: Doc<"units">; da: MasterData; db: MasterData } | null> {
  const books = (await ctx.db.query("books").collect()).filter((b) => b.stage === "master" && b.data.kind === "master");
  const byGrade = new Map<number, { unit: Doc<"units">; data: MasterData }[]>();
  for (const b of books) {
    const u = await ctx.db.get(b.unitId);
    if (!u || b.data.kind !== "master" || b.data.levels.length < 2) continue;
    byGrade.set(u.grade, [...(byGrade.get(u.grade) ?? []), { unit: u, data: b.data }]);
  }
  const grade = [8, 6, 7, 9, 10, 11].find((g) => (byGrade.get(g)?.length ?? 0) >= 2);
  if (grade === undefined) return null;
  const [x, y] = byGrade.get(grade)!.sort((p, q) => p.unit.order - q.unit.order);
  return { a: x.unit, b: y.unit, da: x.data, db: y.data };
}

/**
 * Owner: the extra test students, one for each situation of the Theory and Evaluation pages (their names say which).
 * Again: they start over. Two of them are in the Evaluation room of whoever makes them (with her, and called).
 */
export const cases = mutation({
  args: { token: v.optional(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const by = cleanBy(args.by);
    const ago = (min: number) => now - min * 60_000;
    const pilot = await unitByKey(ctx, PILOT_UNIT.grade, PILOT_UNIT.code);
    const pilotBook = await bookFor(ctx, pilot._id, "fighter");
    if (!pilotBook || pilotBook.data.kind !== "fighter") fail("The pilot theory book is not loaded yet.");
    const f = fighter(pilotBook.data);
    const wb = KNOWN_WORKBOOKS[0];
    const wUnit = await unitByKey(ctx, wb.grade, wb.code);
    const wBook = await bookFor(ctx, wUnit._id, "master");
    if (!wBook || wBook.data.kind !== "master") fail("The Grade 7 workbook is not loaded yet.");
    const wData = wBook.data;
    const two = await twoWorkbooks(ctx);

    const all = await ctx.db.query("students").collect();
    const old = all.filter((s) => s.test && !s.copyOf);
    const n = F_CASES.length + M_CASES.length + (two ? 1 : 0);
    if (all.filter((s) => s.test).length - old.length + n > TEST_CAP) fail(`${TEST_CAP} test students at most. Delete the test students first.`);
    for (const s of old) await wipe(ctx, s);
    const session = await ensureSession(ctx, now, by);

    const add = async (doc: { name: string; note: string; grade: number; term: number; stage: "fighter" | "master"; unitId: Id<"units">; present: boolean; inAt: number; activeMin?: number }) => {
      const id = await ctx.db.insert("students", {
        name: doc.name,
        archived: false,
        demo: true,
        test: true,
        testCase: doc.note,
        present: doc.present,
        grade: doc.grade,
        term: doc.term,
        stage: doc.stage,
        unitId: doc.unitId,
        idleMs: 0,
        lastActivityAt: ago(doc.activeMin ?? 5),
        lastInAt: doc.inAt,
      });
      return id;
    };
    const settle = async (id: Id<"students">, idleMin?: number) => {
      await refresh(ctx, id, now, session);
      const s = (await ctx.db.get(id))!;
      if (idleMin !== undefined && s.idleSince !== undefined) await ctx.db.patch(id, { idleSince: ago(idleMin) });
    };
    const evalCall = async (id: Id<"students">, room: Room) => {
      await ctx.db.insert("calls", {
        studentId: id,
        room: "evaluation",
        kind: "evaluation",
        status: room === "with-eval" ? "sent" : "requested",
        group: `test${now.toString(36)}${room}`,
        unitId: pilot._id,
        stage: "fighter",
        teacherId: me._id,
        teacher: me.name,
        test: true,
        createdAt: room === "with-eval" ? ago(4) : ago(1),
        ...(room === "with-eval" ? { sentAt: ago(3), walk: true, arrivedAt: ago(2) } : {}),
        sessionId: session._id,
      });
      if (room === "with-eval") await ctx.db.patch(id, { room: "evaluation" });
    };

    for (const c of F_CASES) {
      const inAt = ago(c.inMin ?? 30);
      const id = await add({ name: c.name, note: c.note, grade: 11, term: 2, stage: "fighter", unitId: pilot._id, present: true, inAt, activeMin: c.activeMin });
      await ctx.db.insert("progress", {
        studentId: id,
        unitId: pilot._id,
        stage: "fighter",
        marks: fighterMarks({ name: c.name, present: true, taught: c.taught, right: c.right, wrong: c.wrong }, now, f),
        startedAt: ago(90),
        updatedAt: now,
      });
      if (c.seenTheoryMin !== undefined) await ctx.db.patch(id, { seen: { theory: ago(c.seenTheoryMin) } });
      if (c.room) await evalCall(id, c.room);
      await startVisit(ctx, id, inAt, session);
      await settle(id, c.idleMin);
    }
    for (const c of M_CASES) {
      const inAt = ago(c.gone ? 100 : 30);
      const id = await add({ name: c.name, note: c.note, grade: 7, term: 1, stage: "master", unitId: wUnit._id, present: !c.gone, inAt, activeMin: c.activeMin });
      await ctx.db.insert("progress", { studentId: id, unitId: wUnit._id, stage: "master", marks: {}, m: caseMaster(c, now, wData), startedAt: ago(90), updatedAt: now });
      await startVisit(ctx, id, inAt, session);
      if (c.gone) {
        const visit = await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", id)).first();
        if (visit) await ctx.db.patch(visit._id, { outAt: ago(20) });
      }
      await settle(id, c.idleMin);
    }
    if (two) {
      // His book now is b (one lost question); a has a lost question and a level handed in, and it was given to him.
      const lb = two.db.levels[0];
      const la = two.da.levels[0];
      const id = await add({
        name: "Two books",
        note: `Evaluation: lost marks in two workbooks (Grade ${two.b.grade}, units ${Number(two.a.code.slice(1))} and ${Number(two.b.code.slice(1))}): keep him for the next book`,
        grade: two.b.grade,
        term: two.b.term || 1,
        stage: "master",
        unitId: two.b._id,
        present: true,
        inAt: ago(30),
        activeMin: 4,
      });
      const mb = caseMaster({ name: "", note: "", fixed: { [lb.n]: [lb.from + 1] }, fixedMin: 15 }, now, two.db);
      const ma = caseMaster({ name: "", note: "", fixed: { [la.n]: [la.from] }, fixedMin: 20, waiting: [[two.da.levels[1].n, 25]] }, now, two.da);
      await ctx.db.insert("progress", { studentId: id, unitId: two.b._id, stage: "master", marks: {}, m: mb, startedAt: ago(90), updatedAt: now });
      await ctx.db.insert("progress", { studentId: id, unitId: two.a._id, stage: "master", marks: {}, m: ma, startedAt: ago(200), updatedAt: now });
      await ctx.db.insert("handouts", { studentId: id, unitId: two.a._id, stage: "master", at: ago(200), by });
      await startVisit(ctx, id, ago(30), session);
      await settle(id);
    }
    await log(ctx, session, now, { kind: "test-cases", by, value: String(n) });
    await touch(ctx, session, now);
    return n;
  },
});
