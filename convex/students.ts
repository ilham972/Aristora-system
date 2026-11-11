import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { type QueryCtx } from "./_generated/server";
import { mutation } from "./lib/fn";
import {
  activeCalls,
  bookFor,
  cleanBy,
  cleanName,
  currentSession,
  endVisit,
  ensureProgress,
  ensureSession,
  fail,
  getStudent,
  lastVisit,
  log,
  refresh,
  startVisit,
  touch,
  UNDO_IN_MS,
  type Stage,
} from "./lib/backend";
import { OL, termOf } from "./lib/syllabus";
import { bookStage, stage } from "./schema";
import { actor } from "./lib/auth";
import { giveIndex } from "./lib/family";

const STAGE_WORD: Record<Stage, string> = { fighter: "Fighter", master: "Master", legend: "Legend", sprint: "Exam Sprint" };

/** First unit of a grade's term, in book order. */
async function firstUnit(ctx: QueryCtx, grade: number, term: number): Promise<Doc<"units"> | null> {
  const list = await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", grade)).collect();
  return list.filter((u) => u.term === term).sort((a, b) => a.order - b.order)[0] ?? null;
}

async function checkPlace(
  ctx: QueryCtx,
  grade: number,
  term: number,
  stage: Stage,
  unitId: Id<"units"> | undefined,
): Promise<Doc<"units"> | null> {
  if (!Number.isInteger(grade) || grade < 6 || grade > 11) fail("Grade must be 6 to 11.");
  if (![1, 2, 3].includes(term)) fail("Term must be 1, 2 or 3.");
  if (!unitId) {
    if (stage === "fighter" || stage === "master") fail("Choose the unit.");
    return null;
  }
  const unit = await ctx.db.get(unitId);
  if (!unit) fail("That unit no longer exists.");
  // An OL book is for Grade 10 and 11 students (his grade stays); a school unit only his grade's.
  if (unit.grade === OL) checkOl(grade);
  else if (unit.grade !== grade) fail(`${unit.code} is a Grade ${unit.grade} unit, not Grade ${grade}.`);
  return unit;
}

/** OL (the O/L books) is for Grade 10 and 11 students only (his rule, 1 Nov 2026): one topic or all of them. */
function checkOl(grade: number | undefined): void {
  if (grade !== 10 && grade !== 11) fail("OL books are for Grade 10 and 11 students.");
}

export const add = mutation({
  args: {
    token: v.optional(v.string()),
    name: v.string(),
    grade: v.optional(v.number()),
    term: v.optional(v.number()),
    stage: v.optional(stage),
    unitId: v.optional(v.id("units")),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["students"]);
    const now = Date.now();
    const name = cleanName(args.name);
    // The real class: test students (the test class) are another list, and demo students don't count.
    const all = (await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect()).filter((s) => !s.test);
    if (all.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      fail(`"${name}" is already on the list. Add an initial, like "${name} R".`);
    }
    if (all.filter((s) => !s.demo).length >= 120) fail("120 students is the limit for one class list.");
    const grade = args.grade ?? 11;
    const term = args.term ?? termOf(now);
    const st: Stage = args.stage ?? "fighter";
    const unitId = args.unitId ?? (st === "fighter" || st === "master" ? (await firstUnit(ctx, grade, term))?._id : undefined);
    const unit = await checkPlace(ctx, grade, term, st, unitId);
    const session = await currentSession(ctx, now);
    const id = await ctx.db.insert("students", {
      name,
      archived: false,
      present: false,
      grade,
      term,
      stage: st,
      unitId: unit?._id,
      idleMs: 0,
    });
    if (unit && (st === "fighter" || st === "master")) await ensureProgress(ctx, id, unit._id, st, now);
    // His index number for the family app (1001, 1002…, for good).
    await giveIndex(ctx, (await ctx.db.get(id))!);
    await log(ctx, session, now, {
      kind: "student-add",
      by: cleanBy(args.by),
      studentId: id,
      name,
      unit: unit?.key,
      value: `Grade ${grade} · ${STAGE_WORD[st]}`,
    });
    return id;
  },
});

/**
 * Move a student: next unit, next stage, Exam Sprint before an exam (he comes back to where he was),
 * or up a grade after the third term. His work in every book is kept.
 */
export const move = mutation({
  args: {
    token: v.optional(v.string()),
    id: v.id("students"),
    grade: v.number(),
    term: v.number(),
    stage,
    unitId: v.optional(v.id("units")),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["any"], args.by);
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    // To an OL book: he keeps his own grade and term (OL is the O/L books, not a class he moves into).
    const target = args.unitId ? await ctx.db.get(args.unitId) : null;
    const ol = target?.grade === OL;
    const grade = ol ? (s.grade ?? 11) : args.grade;
    const term = ol ? (s.term ?? termOf(now)) : args.term;
    const unit = await checkPlace(ctx, grade, term, args.stage, args.unitId);
    const patch: Partial<Doc<"students">> = { grade, term, stage: args.stage, unitId: unit?._id };
    if (args.stage === "sprint" && s.stage !== "sprint" && s.stage) {
      patch.back = { stage: s.stage, unitId: s.unitId, term: s.term ?? args.term };
    } else if (args.stage !== "sprint") {
      patch.back = undefined;
    }
    await ctx.db.patch(s._id, { ...patch, lastActivityAt: now });
    if (unit && (args.stage === "fighter" || args.stage === "master")) {
      await ensureProgress(ctx, s._id, unit._id, args.stage, now);
      // A topic tute is one printed book: its other book (ladder / past papers) comes with it, ready to correct.
      const twin = args.stage === "fighter" ? "master" : "fighter";
      if ((await bookFor(ctx, unit._id, args.stage))?.tute && (await bookFor(ctx, unit._id, twin))) await ensureProgress(ctx, s._id, unit._id, twin, now);
    }
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, {
      kind: "move",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
      unit: unit?.key,
      value: `${ol ? "OL" : `Grade ${grade} · Term ${term}`} · ${STAGE_WORD[args.stage]}`,
    });
    await refresh(ctx, s._id, now, session);
    await touch(ctx, session, now);
    return true;
  },
});

/**
 * A unit's book handed to him (given) or taken back: the Books page and his money sheet (9 Nov 2026; Correction's unit
 * sheet before), the Class tab's Give a book. A printed book given after the fees began is charged by itself
 * (convex/lib/feeRows.ts); taken back, the charge goes.
 */
export const setGiven = mutation({
  args: {
    token: v.optional(v.string()),
    id: v.id("students"),
    unitId: v.id("units"),
    stage: bookStage,
    given: v.boolean(),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "money"], args.by);
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    if (unit.grade === OL) {
      if (args.given) checkOl(s.grade);
    } else if (s.grade !== undefined && unit.grade !== s.grade) fail(`${unit.code} is a Grade ${unit.grade} unit, not Grade ${s.grade}.`);
    const rows = (await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()).filter(
      (h) => h.unitId === unit._id && h.stage === args.stage,
    );
    if (args.given === rows.length > 0) return true;
    if (args.given) await ctx.db.insert("handouts", { studentId: s._id, unitId: unit._id, stage: args.stage, at: now, by: cleanBy(args.by) });
    else for (const h of rows) await ctx.db.delete(h._id);
    const session = await currentSession(ctx, now);
    await refresh(ctx, s._id, now, session); // a book given = work: he may not be out of work any more
    await log(ctx, session, now, {
      kind: args.given ? "book-given" : "book-given-off",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
      unit: unit.key,
      value: `${unit.key} ${args.stage === "fighter" ? "theory book" : "workbook"}`,
    });
    return true;
  },
});

/**
 * One workbook given to many students at once, or taken back from them (Settings → Students → O/L map, 4 Nov 2026: his
 * words, "now I want to show specific unit today ... that's what I taught lastly"): Books given for each, as on
 * Correction, so it opens on their phones and the class sees they have it. Only a book that is in the app (a given book
 * with nothing in the app would count as work for good). Returns how many changed. Since 11 Nov 2026 the Books page's
 * Stock too (Money people: tick the students, Give): each printed copy is charged by itself (convex/lib/feeRows.ts).
 */
export const giveMany = mutation({
  args: {
    token: v.optional(v.string()),
    ids: v.array(v.id("students")),
    unitId: v.id("units"),
    stage: bookStage,
    given: v.boolean(),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["students", "correction", "money"], args.by);
    if (args.ids.length > MANY_MAX) fail(`At most ${MANY_MAX} students at once.`);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    if (!unit) fail("That unit no longer exists.");
    if (args.given && !(await bookFor(ctx, unit._id, args.stage))) fail(`${unit.code} has no ${args.stage === "fighter" ? "theory book" : "workbook"} in the app yet.`);
    // Every student checked first: one wrong grade and nobody gets it.
    const list: Doc<"students">[] = [];
    for (const id of new Set(args.ids)) {
      const s = await getStudent(ctx, id);
      if (args.given) {
        if (unit.grade === OL) {
          if (s.grade !== 10 && s.grade !== 11) fail(`${s.name} is in Grade ${s.grade ?? "?"}: OL books are for Grade 10 and 11 students.`);
        } else if (s.grade !== unit.grade) fail(`${unit.code} is a Grade ${unit.grade} unit, not for ${s.name} (Grade ${s.grade ?? "?"}).`);
      }
      list.push(s);
    }
    const session = await currentSession(ctx, now);
    let n = 0;
    for (const s of list) {
      const rows = (await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()).filter(
        (h) => h.unitId === unit._id && h.stage === args.stage,
      );
      if (args.given === rows.length > 0) continue;
      if (args.given) await ctx.db.insert("handouts", { studentId: s._id, unitId: unit._id, stage: args.stage, at: now, by: cleanBy(args.by) });
      else for (const h of rows) await ctx.db.delete(h._id);
      await refresh(ctx, s._id, now, session); // a book given = work: he may not be out of work any more
      await log(ctx, session, now, {
        kind: args.given ? "book-given" : "book-given-off",
        by: cleanBy(args.by),
        studentId: s._id,
        name: s.name,
        unit: unit.key,
        value: `${unit.key} ${args.stage === "fighter" ? "theory book" : "workbook"}`,
      });
      n++;
    }
    return n;
  },
});

/**
 * The other book of his topic tute, ready on Correction without moving him (a student moved onto the tute before its
 * twin had a row): its progress row, nothing else.
 */
export const openTwin = mutation({
  args: { token: v.optional(v.string()), id: v.id("students"), unitId: v.id("units"), stage: bookStage, by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    const s = await getStudent(ctx, args.id);
    const twin = args.stage === "fighter" ? "master" : "fighter";
    if (s.unitId !== args.unitId) fail("That book isn't his topic now.");
    const book = await bookFor(ctx, args.unitId, args.stage);
    const other = await bookFor(ctx, args.unitId, twin);
    if (!book || !other) fail("This unit doesn't have that book in the app.");
    if (!book.tute && !other.tute) fail("Only a topic tute's two books go together: open it from his units sheet.");
    await ensureProgress(ctx, s._id, args.unitId, args.stage, Date.now());
    return true;
  },
});

/**
 * The whole OL syllabus at once (his ask, 1 Nov 2026): every OL unit's workbook (or theory book) given to him, or all
 * taken back. Only books that are in the app: a given book with nothing in the app counts as work, and 53 of them
 * would hide him from "out of work" for good. Tap again after new books come in.
 */
export const giveAllOl = mutation({
  args: { token: v.optional(v.string()), id: v.id("students"), stage: bookStage, given: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction", "money"], args.by);
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    if (args.given) checkOl(s.grade);
    const units = await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", OL)).collect();
    const mine = (await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()).filter(
      (h) => h.stage === args.stage,
    );
    let n = 0;
    for (const u of units) {
      const rows = mine.filter((h) => h.unitId === u._id);
      if (args.given) {
        if (rows.length || !(await bookFor(ctx, u._id, args.stage))) continue;
        // Opened on his phone, not a printed copy (9 Nov 2026): never charged, never taken from the stock.
        await ctx.db.insert("handouts", { studentId: s._id, unitId: u._id, stage: args.stage, at: now, by: cleanBy(args.by), noCopy: true });
        n++;
      } else if (rows.length) {
        for (const h of rows) await ctx.db.delete(h._id);
        n++;
      }
    }
    if (n === 0) return 0;
    const session = await currentSession(ctx, now);
    await refresh(ctx, s._id, now, session);
    const book = args.stage === "fighter" ? "theory books" : "workbooks";
    await log(ctx, session, now, {
      kind: args.given ? "book-given" : "book-given-off",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
      value: `OL: ${n} ${book}`,
    });
    return n;
  },
});

export const rename = mutation({
  args: { token: v.optional(v.string()), id: v.id("students"), name: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["students"]);
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    const name = cleanName(args.name);
    const all = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
    if (all.some((o) => o._id !== s._id && o.name.toLowerCase() === name.toLowerCase())) {
      fail(`"${name}" is already on the list.`);
    }
    await ctx.db.patch(s._id, { name });
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "student-rename", by: cleanBy(args.by), studentId: s._id, name, value: s.name });
  },
});

/**
 * Boy or girl (8 Nov 2026, his rule for private messages in Us: a boy and a girl student never message each other;
 * boys any boy, girls any girl, teachers anyone). Settings → Students → Boys and girls, by the owner and the Students
 * tick, saved as tapped; null = not set (he messages teachers only). Several at once, all checked first.
 */
export const setSex = mutation({
  args: {
    token: v.optional(v.string()),
    ids: v.array(v.id("students")),
    sex: v.union(v.literal("b"), v.literal("g"), v.null()),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    if (args.ids.length > 200) fail("At most 200 students at once.");
    const now = Date.now();
    const list: Doc<"students">[] = [];
    for (const id of new Set(args.ids)) list.push(await getStudent(ctx, id));
    let n = 0;
    for (const s of list) {
      if ((s.sex ?? null) === args.sex) continue;
      await ctx.db.patch(s._id, { sex: args.sex ?? undefined });
      await log(ctx, null, now, { kind: "sex", by: cleanBy(args.by), studentId: s._id, name: s.name, value: args.sex === "b" ? "boy" : args.sex === "g" ? "girl" : "not set" });
      n++;
    }
    return n;
  },
});

/** Remove from the class (kept, and can be restored with all progress). */
export const setArchived = mutation({
  args: { token: v.optional(v.string()), id: v.id("students"), archived: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["students"]);
    const now = Date.now();
    const s = await getStudent(ctx, args.id);
    const session = await currentSession(ctx, now);
    if (args.archived) {
      for (const c of await activeCalls(ctx, s._id)) {
        await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
      }
      if (s.present) await endVisit(ctx, s._id, now);
      await refreshOut(ctx, s._id, now, session);
      await ctx.db.patch(s._id, { archived: true, present: false, room: undefined, archivedAt: now });
    } else {
      const all = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
      if (all.some((o) => o.name.toLowerCase() === s.name.toLowerCase())) {
        fail(`Rename the current "${s.name}" first.`);
      }
      await ctx.db.patch(s._id, { archived: false, present: false, archivedAt: undefined });
    }
    await log(ctx, session, now, {
      kind: args.archived ? "student-remove" : "student-restore",
      by: cleanBy(args.by),
      studentId: s._id,
      name: s.name,
    });
  },
});

async function refreshOut(ctx: Parameters<typeof refresh>[0], id: Parameters<typeof refresh>[1], now: number, session: Parameters<typeof refresh>[3]) {
  await ctx.db.patch(id, { present: false, room: undefined });
  await refresh(ctx, id, now, session);
}

type Sessionish = Awaited<ReturnType<typeof currentSession>>;

/**
 * One student in or out (the body of setPresent, shared with setPresentMany). In: the first sign-in starts the session
 * (read him after it: a class left open since yesterday has just signed everyone out). Out: his calls end; `undo`
 * within UNDO_IN_MS deletes the visit, as if he never came. Returns what changed.
 */
async function presentOne(
  ctx: Parameters<typeof refresh>[0],
  id: Id<"students">,
  present: boolean,
  undo: boolean,
  by: string | undefined,
  now: number,
  session: Sessionish,
): Promise<"in" | "out" | "undone" | "same"> {
  const s = await getStudent(ctx, id);
  if (present) {
    let changed = false;
    if (!s.present) {
      await ctx.db.patch(s._id, { present: true, lastActivityAt: now, lastInAt: now });
      await startVisit(ctx, s._id, now, session!);
      await log(ctx, session, now, { kind: "in", by, studentId: s._id, name: s.name });
      changed = true;
    }
    await refresh(ctx, s._id, now, session);
    return changed ? "in" : "same";
  }
  for (const c of await activeCalls(ctx, s._id)) {
    await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
  }
  if (!s.present) {
    await refreshOut(ctx, s._id, now, session);
    return "same";
  }
  const visit = await lastVisit(ctx, s._id);
  if (undo && visit && visit.outAt === undefined && now - visit.inAt <= UNDO_IN_MS) {
    // Tapped by mistake: he was never here. No visit, no idle time, his last arrival as before.
    await ctx.db.delete(visit._id);
    const before = await lastVisit(ctx, s._id);
    await ctx.db.patch(s._id, {
      present: false,
      room: undefined,
      idleSince: undefined,
      idleReason: undefined,
      lastInAt: before?.inAt,
    });
    await log(ctx, session, now, { kind: "in-undo", by, studentId: s._id, name: s.name });
    return "undone";
  }
  await endVisit(ctx, s._id, now);
  await log(ctx, session, now, { kind: "out", by, studentId: s._id, name: s.name });
  await refreshOut(ctx, s._id, now, session);
  return "out";
}

/**
 * Attendance: tap in when he arrives (the time goes in the register), tap out when he leaves.
 * The first tap-in starts the session. `undo` takes back a sign-in tapped by mistake: the visit is deleted,
 * as if it never happened (after UNDO_IN_MS it is an ordinary sign-out).
 */
export const setPresent = mutation({
  args: {
    token: v.optional(v.string()),
    id: v.id("students"),
    present: v.boolean(),
    undo: v.optional(v.boolean()),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    const now = Date.now();
    const first = await getStudent(ctx, args.id);
    if (first.archived) fail(`${first.name} was removed from the class.`);
    const by = cleanBy(args.by);
    const session = args.present ? await ensureSession(ctx, now, by) : await currentSession(ctx, now);
    await presentOne(ctx, args.id, args.present, !!args.undo, by, now, session);
    await touch(ctx, session, now);
    return true;
  },
});

/** At most this many in one tap (the class is capped at 120 students). */
export const MANY_MAX = 200;

/**
 * Several students in or out at once (2 Nov 2026, his ask): Attendance's "Sign in" list (the ones she left ticked) and
 * "Sign out all" for one grade. Each is exactly one setPresent; removed students and ones already so are skipped.
 * `undo` takes back a "Sign in" of several (its toast's Undo). Returns how many changed.
 */
export const setPresentMany = mutation({
  args: {
    token: v.optional(v.string()),
    ids: v.array(v.id("students")),
    present: v.boolean(),
    undo: v.optional(v.boolean()),
    by: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["correction"], args.by);
    if (args.ids.length > MANY_MAX) fail(`At most ${MANY_MAX} students at once.`);
    const now = Date.now();
    const by = cleanBy(args.by);
    const ids = [...new Set(args.ids)];
    // The session first, then read them: a class left open since yesterday has just signed everyone out.
    const session = args.present ? await ensureSession(ctx, now, by) : await currentSession(ctx, now);
    const live: Id<"students">[] = [];
    for (const id of ids) {
      const s = await ctx.db.get(id);
      if (s && !s.archived && s.present !== args.present) live.push(id);
    }
    let changed = 0;
    for (const id of live) {
      const r = await presentOne(ctx, id, args.present, !!args.undo, by, now, session);
      if (r !== "same") changed++;
    }
    await touch(ctx, session, now);
    return { changed };
  },
});
