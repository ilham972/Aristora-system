// The old test class's extra test students (31 Oct 2026), kept as a test fixture when the simulation replaced the
// test class in the app (1 Nov 2026, his ask: "remove that test feature"). One student for every situation the
// Theory and Evaluation pages must handle; the backend tests and the run-throughs build them straight into the test
// database. Test students: only a phone showing the simulation sees them.

import type { Doc, Id } from "../convex/_generated/dataModel";
import type { MutationCtx } from "../convex/_generated/server";
import { fighterMarks, unitByKey } from "../convex/demo";
import { bookFor, ensureSession, fail, log, refresh, startVisit, touch, wipeStudent } from "../convex/lib/backend";
import { fighter, KNOWN_WORKBOOKS, levelOutOf, PILOT_UNIT, type Fighter, type MasterData } from "../convex/lib/book";
import type { MState } from "../convex/lib/master";

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

/**
 * The theory-book test students, built from the unit's own book (the pilot, or a topic tute that replaced it: any
 * number of ladder sections and questions). X = the section to teach next (D in the pilot), Y = the one before it (C),
 * whose solo questions they work on; the sections before Y are taught and done. Names and notes say the real letters
 * and question numbers; a case the book is too small for is left out.
 */
export function fighterCases(book: Fighter): FCase[] {
  const L = book.sections.filter((s) => s.kind === "ladder" && s.teach.length > 0);
  if (L.length < 2) return [];
  const k = Math.min(3, L.length - 1);
  const X = L[k];
  const Y = L[k - 1];
  const before = L.slice(0, k - 1);
  const done = before.flatMap((s) => s.solo);
  const ys = Y.solo;
  const n = ys.length;
  const upToY = [...before, Y].map((s) => s.id).join("");
  const all = (qs: number[]) => qs.map((q): [number, number] => [q, 0]);
  const x = X.id;
  const out: FCase[] = [
    { name: `No work ${x}`, note: `Theory: needs section ${x}, no work for 6 min (red)`, taught: upToY, right: all([...done, ...ys]), idleMin: 6 },
    { name: `Starving ${x}`, note: `Theory: needs ${x}, no work for 25 min (starving: ${x} comes first)`, taught: upToY, right: all([...done, ...ys]), idleMin: 25 },
    { name: `Seen ${x}`, note: `Theory: needs ${x}, no work, but Theory had him today (after the others)`, taught: upToY, right: all([...done, ...ys]), idleMin: 3, seenTheoryMin: 40 },
    { name: "Home soon", note: `Theory: needs ${x} but goes home in 5 min (listed, not ticked)`, taught: upToY, right: all([...done, ...ys]), idleMin: 2, inMin: 115 },
    { name: `No work ${Y.id}`, note: `Theory: needs section ${Y.id}, no work for 4 min (a second lesson)`, taught: before.map((s) => s.id).join(""), right: all(done), idleMin: 4 },
  ];
  if (n >= 1) {
    const last = ys[n - 1];
    out.push(
      { name: `In Eval ${x}`, note: `With you in Evaluation (Q${last}), needs ${x}: Theory calling him = Theory wants him now`, taught: upToY, right: all([...done, ...ys.slice(0, n - 1)]), wrong: [[last, 12, 1]], room: "with-eval" },
      { name: "Eval called", note: `Evaluation called him (Q${last}), needs ${x}: Theory calling him cancels her call`, taught: upToY, right: all([...done, ...ys.slice(0, n - 1)]), wrong: [[last, 11, 1]], room: "eval-called" },
    );
  }
  if (n >= 2) out.push({ name: `Fresh ${ys[n - 2]}`, note: `Evaluation: Q${ys[n - 2]} wrong 3 min ago (not ready yet: yellow)`, taught: upToY, right: all([...done, ...ys.slice(0, n - 2)]), wrong: [[ys[n - 2], 3, 1]], activeMin: 3 });
  if (n >= 3) {
    out.push(
      { name: `Soon ${x}`, note: `Theory: 2 questions left, then ${x} (runs out soon: amber)`, taught: upToY, right: all([...done, ...ys.slice(0, n - 2)]), activeMin: 2 },
      { name: `Later ${x}`, note: `Theory: ${n} questions left before ${x} (not soon)`, taught: upToY, right: all(done), activeMin: 3 },
      { name: `Stuck ${ys[1]}`, note: `Evaluation: Q${ys[1]} wrong twice (stuck: red)`, taught: upToY, right: all([...done, ys[0]]), wrong: [[ys[1], 5, 2]], activeMin: 5 },
      { name: `Stopped ${Y.id}`, note: `Evaluation: Q${ys[0]} Q${ys[1]} Q${ys[2]} wrong, section ${Y.id} stopped (red)`, taught: upToY, right: all(done), wrong: [[ys[0], 9, 1], [ys[1], 9, 1], [ys[2], 9, 1]], idleMin: 7 },
    );
  }
  if (n >= 4) out.push({ name: `Ready ${ys[2]}`, note: `Evaluation: Q${ys[2]} wrong 15 min ago (ready: orange), still has work`, taught: upToY, right: all([...done, ys[0], ys[1]]), wrong: [[ys[2], 15, 1]], activeMin: 4 });
  // Names stay unique (a tiny book could give two the same).
  const seen = new Set<string>();
  return out.filter((c) => !seen.has(c.name) && !!seen.add(c.name));
}
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
 * The extra test students (the test class of 31 Oct 2026, now a test fixture): one for each situation of the Theory and
 * Evaluation pages (their names say which). Again: they start over. Two of them are in the Evaluation room of `me`
 * (with her, and called). Run it with `t.run((ctx) => makeCases(ctx, me))`.
 */
export async function makeCases(ctx: MutationCtx, me: { _id: Id<"users">; name: string }, by?: string): Promise<number> {
  const now = Date.now();
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
  const fCases = fighterCases(f);
  const n = fCases.length + M_CASES.length + (two ? 1 : 0);
  for (const s of old) await wipeStudent(ctx, s);
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

  for (const c of fCases) {
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
}
