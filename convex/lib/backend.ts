// Backend-only helpers: sessions, the history log, idle tracking.

import { ConvexError } from "convex/values";
import { claimLive } from "./claims";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fighter, type Fighter, type MasterData } from "./book";
import { DAY_MS, SL_OFFSET_MS, slDay } from "./day";
import { computeMaster, EMPTY_MASTER, homeToCheck, type MState } from "./master";
import { computeStatus } from "./status";
import { digestOf, type Digest } from "./boss";
import { wipeChats } from "./chat";
import { backMoment } from "./us";
import { dropAnswer, dropMoment } from "./usTalk";

export type Stage = "fighter" | "master" | "legend" | "sprint";
export type BookStage = "fighter" | "master";

/** A session with no activity for this long is closed automatically. */
export const STALE_SESSION_MS = 4 * 60 * 60_000;

export function fail(message: string): never {
  throw new ConvexError(message);
}

/**
 * Attendance mode (12 Nov 2026, his ask: "most of the time we test the app ... we have to do the correction even the
 * students not in the classroom"). Meta "attendance.off" = true: every real student counts as here on every page
 * (Correction's names, Fighter, Master, Consultation, the Class tab, calls), signed in or not. Nothing is written for
 * them: no visit, no fee, no register line. Off → on: only the signed-in ones again. The simulation never follows it.
 */
export const ATT_OFF_KEY = "attendance.off";

export async function attendanceOff(ctx: QueryCtx): Promise<boolean> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", ATT_OFF_KEY))
    .first();
  return row?.value === true;
}

/** Here for the pages: signed in, or attendance mode is off (real students only). */
export const hereNow = (s: Doc<"students">, off: boolean): boolean => s.present || (off && !s.test);

export function cleanBy(by: string | undefined): string | undefined {
  if (!by) return undefined;
  return by.replace(/[^a-z]/gi, "").slice(0, 16) || undefined;
}

export function cleanName(raw: string): string {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!name) fail("Type a name first.");
  if (name.length > 40) fail("Keep the name under 40 letters.");
  return name;
}

export async function getStudent(ctx: QueryCtx, id: Id<"students">): Promise<Doc<"students">> {
  const s = await ctx.db.get(id);
  if (!s) fail("That student no longer exists. Refresh the page.");
  return s;
}

// ---------------------------------------------------------------- where a student is: unit, book, progress

export async function bookFor(ctx: QueryCtx, unitId: Id<"units">, stage: BookStage): Promise<Doc<"books"> | null> {
  return await ctx.db
    .query("books")
    .withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", stage))
    .first();
}

/** A book's answer key row. Rows without a stage are the workbook's (Master): every key before the topic tutes. */
export async function keyRow(ctx: QueryCtx, unitId: Id<"units">, stage: BookStage): Promise<Doc<"keys"> | null> {
  const rows = await ctx.db
    .query("keys")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .collect();
  return rows.find((k) => (k.stage ?? "master") === stage) ?? null;
}

export async function progressFor(
  ctx: QueryCtx,
  studentId: Id<"students">,
  unitId: Id<"units">,
  stage: BookStage,
): Promise<Doc<"progress"> | null> {
  return await ctx.db
    .query("progress")
    .withIndex("by_student_unit_stage", (q) => q.eq("studentId", studentId).eq("unitId", unitId).eq("stage", stage))
    .first();
}

export async function ensureProgress(
  ctx: MutationCtx,
  studentId: Id<"students">,
  unitId: Id<"units">,
  stage: BookStage,
  now: number,
): Promise<Doc<"progress">> {
  const p = await progressFor(ctx, studentId, unitId, stage);
  if (p) return p;
  const id = await ctx.db.insert("progress", {
    studentId,
    unitId,
    stage,
    marks: {},
    m: stage === "master" ? EMPTY_MASTER : undefined,
    startedAt: now,
    updatedAt: now,
  });
  return (await ctx.db.get(id))!;
}

export function asFighter(book: Doc<"books">): Fighter {
  if (book.data.kind !== "fighter") fail("That book is not a theory book.");
  return fighter(book.data);
}

export function asMaster(book: Doc<"books">): MasterData {
  if (book.data.kind !== "master") fail("That book is not a workbook.");
  return book.data;
}

export interface Place {
  student: Doc<"students">;
  stage: Stage | null;
  unit: Doc<"units"> | null;
  book: Doc<"books"> | null;
  progress: Doc<"progress"> | null;
}

/** His current unit, its book for his stage, and his work in it. */
export async function placeOf(ctx: QueryCtx, student: Doc<"students">): Promise<Place> {
  const stage = (student.stage ?? null) as Stage | null;
  const unit = student.unitId ? await ctx.db.get(student.unitId) : null;
  let book: Doc<"books"> | null = null;
  let progress: Doc<"progress"> | null = null;
  if (unit && (stage === "fighter" || stage === "master")) {
    book = await bookFor(ctx, unit._id, stage);
    progress = await progressFor(ctx, student._id, unit._id, stage);
  }
  return { student, stage, unit, book, progress };
}

/** The place where marks can be written: fails with a clear message when he moved on or has no book. */
export async function workPlace(
  ctx: MutationCtx,
  student: Doc<"students">,
  stage: BookStage,
  unitId: Id<"units"> | undefined,
  now: number,
): Promise<{ unit: Doc<"units">; book: Doc<"books">; progress: Doc<"progress"> }> {
  if (student.stage !== stage || !student.unitId) {
    fail(`${student.name} is not in ${stage === "fighter" ? "Fighter" : "Master"} now. Refresh the page.`);
  }
  if (unitId && unitId !== student.unitId) fail(`${student.name} moved to another unit. Refresh the page.`);
  const unit = await ctx.db.get(student.unitId);
  if (!unit) fail("That unit no longer exists.");
  const book = await bookFor(ctx, unit._id, stage);
  if (!book) fail(`${unit.key} has no ${stage === "fighter" ? "theory book" : "workbook"} in the app yet.`);
  const progress = await ensureProgress(ctx, student._id, unit._id, stage, now);
  return { unit, book, progress };
}

/**
 * A workbook of his to correct, hand in or mark: his book now, or another workbook he has work in (he works on several
 * at once). Correcting another book never moves him (31 Oct 2026): two correctors can each have one of his books open.
 */
export async function masterPlace(
  ctx: MutationCtx,
  student: Doc<"students">,
  unitId: Id<"units"> | undefined,
  now: number,
): Promise<{ unit: Doc<"units">; book: Doc<"books">; progress: Doc<"progress"> }> {
  if (!unitId || (unitId === student.unitId && student.stage === "master")) return await workPlace(ctx, student, "master", unitId, now);
  const unit = await ctx.db.get(unitId);
  if (!unit) fail("That unit no longer exists.");
  const book = await bookFor(ctx, unit._id, "master");
  if (!book) fail(`${unit.key} has no workbook in the app.`);
  const progress = await progressFor(ctx, student._id, unit._id, "master");
  if (!progress) fail(`${student.name} has no work in ${unit.key}.`);
  return { unit, book, progress };
}

/**
 * A theory book of his to mark: his book now, or another theory book he has work in (a topic tute's theory book while
 * he is on its workbook, a book given to him). 1 Nov 2026, his report "Fighter marks are not saving": every mark on a
 * theory book that wasn't his book now was refused ("not in Fighter now") and vanished from the phone. Never moves him.
 */
export async function fighterPlace(
  ctx: MutationCtx,
  student: Doc<"students">,
  unitId: Id<"units"> | undefined,
  now: number,
): Promise<{ unit: Doc<"units">; book: Doc<"books">; progress: Doc<"progress"> }> {
  if (!unitId || (unitId === student.unitId && student.stage === "fighter")) return await workPlace(ctx, student, "fighter", unitId, now);
  const unit = await ctx.db.get(unitId);
  if (!unit) fail("That unit no longer exists.");
  const book = await bookFor(ctx, unit._id, "fighter");
  if (!book) fail(`${unit.key} has no theory book in the app.`);
  const progress = await progressFor(ctx, student._id, unit._id, "fighter");
  if (!progress) fail(`${student.name} has no work in ${unit.key}'s theory book.`);
  return { unit, book, progress };
}

/**
 * One corrector per book (31 Oct 2026): another corrector has this book open on the Correction page and her phone spoke
 * in the last minute. Marks from anyone else would cross hers: refused, with her name (ask her for it).
 */
export async function mustHoldBook(ctx: MutationCtx, me: Doc<"users">, student: Doc<"students">, unit: Doc<"units">, now: number) {
  const c = await ctx.db
    .query("claims")
    .withIndex("by_paper", (q) => q.eq("studentId", student._id).eq("unitId", unit._id))
    .first();
  if (c && c.userId !== me._id && claimLive(c, now)) {
    fail(`${c.name} is correcting ${student.name}'s Unit ${Number(unit.code.replace(/\D/g, "")) || unit.code} now. Ask her for it.`);
  }
}

export function masterState(p: Doc<"progress"> | null): MState {
  return (p?.m as MState | undefined) ?? EMPTY_MASTER;
}

export async function openSession(ctx: QueryCtx): Promise<Doc<"sessions"> | null> {
  return await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first();
}

// Who is doing this mutation, set once by the permission check, so every history line can name them.
const actors = new WeakMap<object, string>();

export function rememberActor(ctx: MutationCtx, name: string): void {
  actors.set(ctx, name);
}

type LogInput = {
  kind: string;
  by?: string;
  studentId?: Id<"students">;
  name?: string;
  unit?: string;
  q?: number;
  value?: string;
  ms?: number;
  took?: number;
  /** The book of a teacher's tap (desk, consult, board): its department's dashboard counts it. */
  stage?: "fighter" | "master";
};

export async function log(
  ctx: MutationCtx,
  session: Doc<"sessions"> | null,
  now: number,
  e: LogInput,
): Promise<void> {
  const who = e.kind === "idle" ? undefined : actors.get(ctx);
  await ctx.db.insert("events", { at: now, sessionId: session?._id, ...(who ? { who } : {}), ...e });
}

/** The open session, closing it first if it was left open from an earlier day. */
export async function currentSession(ctx: MutationCtx, now: number): Promise<Doc<"sessions"> | null> {
  const s = await openSession(ctx);
  if (s && now - s.lastActivityAt > STALE_SESSION_MS) {
    await closeSession(ctx, s, s.lastActivityAt, "auto");
    return null;
  }
  return s;
}

/** The open session, starting one if needed (first student tapped in). */
export async function ensureSession(ctx: MutationCtx, now: number, by?: string): Promise<Doc<"sessions">> {
  const s = await currentSession(ctx, now);
  if (s) return s;
  const id = await ctx.db.insert("sessions", { open: true, startedAt: now, lastActivityAt: now });
  const created = (await ctx.db.get(id))!;
  await log(ctx, created, now, { kind: "session-start", by });
  return created;
}

/**
 * The class's "last active" time, at most once a minute (10 Nov 2026: written on every tap, it made every phone re-read
 * the whole board on every tap; a class goes stale after 4 hours, so a minute changes nothing).
 */
export const TOUCH_EVERY_MS = 60_000;
export async function touch(ctx: MutationCtx, session: Doc<"sessions"> | null, now: number) {
  if (session && now - session.lastActivityAt >= TOUCH_EVERY_MS) await ctx.db.patch(session._id, { lastActivityAt: now });
}

export async function activeCalls(ctx: QueryCtx, studentId: Id<"students">) {
  const requested = await ctx.db
    .query("calls")
    .withIndex("by_student_status", (q) => q.eq("studentId", studentId).eq("status", "requested"))
    .collect();
  const sent = await ctx.db
    .query("calls")
    .withIndex("by_student_status", (q) => q.eq("studentId", studentId).eq("status", "sent"))
    .collect();
  return [...requested, ...sent];
}

// ---------------------------------------------------------------- attendance: one row per visit

/** A sign-in tapped by mistake can be undone this long after (then it is a normal sign-out). */
export const UNDO_IN_MS = 5 * 60_000;

/** His latest visit (open or closed), or null. */
export async function lastVisit(ctx: QueryCtx, studentId: Id<"students">): Promise<Doc<"attendance"> | null> {
  return await ctx.db
    .query("attendance")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .order("desc")
    .first();
}

/** He arrived: a new visit in the register. */
export async function startVisit(
  ctx: MutationCtx,
  studentId: Id<"students">,
  at: number,
  session: Doc<"sessions"> | null,
): Promise<void> {
  // Us (7 Nov 2026): back after two weeks or more away, the owl says welcome back (read before this visit is added).
  await backMoment(ctx, studentId, at);
  await ctx.db.insert("attendance", { studentId, day: slDay(at), inAt: at, ...(session ? { sessionId: session._id } : {}) });
}

/** He left, or the session ended: close his open visit. */
export async function endVisit(ctx: MutationCtx, studentId: Id<"students">, at: number): Promise<void> {
  const v = await lastVisit(ctx, studentId);
  if (v && v.outAt === undefined) await ctx.db.patch(v._id, { outAt: Math.max(at, v.inAt) });
}

/**
 * He never came that day (11 Nov 2026, the Fees page's Didn't come: signed in by mistake and noticed after Undo's five
 * minutes): his visits of that day leave the register, as if nobody had tapped him. Still signed in on one of them: he
 * is out of the hall with no idle time and his last arrival as before (like Undo), his calls closed. Returns how many
 * visits went. The fees follow by themselves (convex/lib/fn.ts: a visit deleted = his class of that day goes).
 */
export async function neverCame(ctx: MutationCtx, s: Doc<"students">, day: string, now: number): Promise<number> {
  const from = Date.parse(`${day}T00:00:00Z`) - SL_OFFSET_MS;
  const visits = (
    await ctx.db
      .query("attendance")
      .withIndex("by_student", (q) => q.eq("studentId", s._id).gte("inAt", from).lt("inAt", from + DAY_MS))
      .collect()
  ).filter((x) => x.day === day);
  if (visits.length === 0) return 0;
  const open = visits.some((x) => x.outAt === undefined);
  for (const x of visits) await ctx.db.delete(x._id);
  const before = await lastVisit(ctx, s._id);
  if (open && s.present) {
    for (const c of await activeCalls(ctx, s._id)) await ctx.db.patch(c._id, { status: c.status === "sent" ? "done" : "cancelled", endedAt: now });
    await ctx.db.patch(s._id, { present: false, room: undefined, idleSince: undefined, idleReason: undefined, lastInAt: before?.inAt });
  } else if (s.lastInAt !== before?.inAt) {
    await ctx.db.patch(s._id, { lastInAt: before?.inAt });
  }
  return visits.length;
}

/** Close the teachers' stays still open on these days at `at` (never before she arrived). */
export async function endStays(ctx: MutationCtx, days: string[], at: number): Promise<void> {
  for (const day of new Set(days)) {
    const rows = await ctx.db.query("duty").withIndex("by_day", (q) => q.eq("day", day)).collect();
    for (const r of rows) {
      if (r.outAt === undefined) await ctx.db.patch(r._id, { outAt: Math.max(at, r.inAt), outBy: "class end", editedAt: at });
    }
  }
}

async function closeIdle(
  ctx: MutationCtx,
  s: Doc<"students">,
  until: number,
  session: Doc<"sessions"> | null,
) {
  if (s.idleSince === undefined) return;
  const ms = Math.max(0, until - s.idleSince);
  await ctx.db.patch(s._id, { idleSince: undefined, idleReason: undefined, idleMs: s.idleMs + ms });
  if (ms > 0) {
    await log(ctx, session, until, { kind: "idle", studentId: s._id, name: s.name, ms, value: s.idleReason });
    // The rooms' scores: a wait counts for each room he was waiting for ("theory+evaluation": both). A test student's
    // (the simulation) counts in the simulation's practice score, never the class's.
    for (const room of STAT_ROOMS) {
      if (!(s.idleReason ?? "").split("+").includes(room)) continue;
      await roomStats(ctx, s, session, room, { waitMs: ms }, { maxWaitMs: ms });
    }
  }
}

/** The rooms that keep a score for the class (session.stats). */
export const STAT_ROOMS = ["theory", "evaluation", "correction"] as const;

/**
 * Add to a room's score for this class (session.stats): `add` is summed, `max` keeps the larger. Reads the session
 * again first, so several changes in one mutation all count.
 */
export async function addStats(
  ctx: MutationCtx,
  session: Doc<"sessions"> | null,
  room: string,
  add: Record<string, number>,
  max: Record<string, number> = {},
) {
  if (!session) return;
  const fresh = await ctx.db.get(session._id);
  if (!fresh || !fresh.open) return;
  const all = { ...(fresh.stats ?? {}) };
  const mine = { ...(all[room] ?? {}) };
  for (const [k, n] of Object.entries(add)) if (n) mine[k] = (mine[k] ?? 0) + n;
  for (const [k, n] of Object.entries(max)) mine[k] = Math.max(mine[k] ?? 0, n);
  all[room] = mine;
  await ctx.db.patch(session._id, { stats: all });
}

/**
 * A room's score for this student: the class's (session.stats), or, for a test student, the running simulation's
 * practice score (sims.stats: the Theory and Evaluation pages in the simulation show it). The class never counts them.
 */
export async function roomStats(
  ctx: MutationCtx,
  s: Doc<"students">,
  session: Doc<"sessions"> | null,
  room: string,
  add: Record<string, number>,
  max: Record<string, number> = {},
) {
  if (!s.test) return await addStats(ctx, session, room, add, max);
  const sim = await ctx.db.query("sims").withIndex("by_status", (q) => q.eq("status", "running")).first();
  if (!sim) return;
  const all = { ...(sim.stats ?? {}) };
  const mine = { ...(all[room] ?? {}) };
  for (const [k, n] of Object.entries(add)) if (n) mine[k] = (mine[k] ?? 0) + n;
  for (const [k, n] of Object.entries(max)) mine[k] = Math.max(mine[k] ?? 0, n);
  all[room] = mine;
  await ctx.db.patch(sim._id, { stats: all });
}

/**
 * A student and everything of his: calls, books, visits, books given, Correction's drafts and claims, what he typed, his
 * home-work photos, his profile photos and his asks.
 */
export async function wipeStudent(ctx: MutationCtx, s: Doc<"students">) {
  for (const a of await ctx.db.query("familyAnswers").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(a._id);
  for (const p of await ctx.db.query("homePhotos").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
    for (const f of p.files) await ctx.storage.delete(f).catch(() => undefined);
    await ctx.db.delete(p._id);
  }
  for (const r of await ctx.db.query("appTime").withIndex("by_sid", (q) => q.eq("sid", s._id)).collect()) await ctx.db.delete(r._id);
  for (const p of await ctx.db.query("profilePhotos").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(p._id);
  // His phone alerts (7 Nov 2026): the phones' addresses and anything waiting to go.
  for (const p of await ctx.db.query("pushSubs").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(p._id);
  for (const p of await ctx.db.query("pushOut").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(p._id);
  // Us (7 Nov 2026): the lines about him go with their taps (his taps on others' lines go with those lines); his doubts
  // with their replies, his answers and replies with their photos.
  for (const m of await ctx.db.query("usMoments").withIndex("by_sid", (q) => q.eq("sid", s._id)).collect()) await dropMoment(ctx, m._id);
  for (const a of await ctx.db.query("usAnswers").withIndex("by_sid", (q) => q.eq("sid", s._id)).collect()) await dropAnswer(ctx, a);
  // The talk (8 Nov 2026): his bell's Us lines, his XP rows from Us.
  for (const b of await ctx.db.query("usInbox").withIndex("by_sid", (q) => q.eq("sid", s._id)).collect()) await ctx.db.delete(b._id);
  for (const x of await ctx.db.query("usXp").withIndex("by_sid", (q) => q.eq("sid", s._id)).collect()) await ctx.db.delete(x._id);
  // His chats (8 Nov 2026): his private chats whole, his messages and reactions in groups.
  await wipeChats(ctx, s);
  for (const a of await ctx.db.query("familyAsks").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(a._id);
  for (const c of await ctx.db.query("calls").withIndex("by_student_status", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(c._id);
  for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(p._id);
  for (const a of await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(a._id);
  for (const h of await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(h._id);
  for (const d of await ctx.db.query("drafts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(d._id);
  for (const c of await ctx.db.query("claims").withIndex("by_paper", (q) => q.eq("studentId", s._id)).collect()) await ctx.db.delete(c._id);
  await ctx.db.delete(s._id);
}

/**
 * Re-check one student after anything changed: is he sitting in the hall with
 * nothing to do? Starts or stops his idle clock for the session report.
 */
export async function refresh(
  ctx: MutationCtx,
  id: Id<"students">,
  now: number,
  session: Doc<"sessions"> | null,
) {
  const s = await ctx.db.get(id);
  if (!s) return;
  const { dry, needs } = await dryOf(ctx, s);
  const idleNow = session !== null && s.present && !s.archived && !s.room && dry;
  const reason = needs.join("+") || "work";
  if (idleNow) {
    if (s.idleSince === undefined) {
      await ctx.db.patch(id, { idleSince: now, idleReason: reason });
    } else if (s.idleReason !== reason) {
      await closeIdle(ctx, s, now, session);
      await ctx.db.patch(id, { idleSince: now, idleReason: reason });
    }
  } else if (s.idleSince !== undefined) {
    await closeIdle(ctx, s, now, session);
  }
}

/**
 * Is he out of work, and what would give him work again? (Legend / Exam Sprint and missing books: not tracked.)
 * A student works on several books at once (30 Oct 2026): his book now blocked is not "out of work" while a book
 * given to him (Books given) still has work.
 */
export async function dryOf(ctx: QueryCtx, s: Doc<"students">): Promise<{ dry: boolean; needs: string[] }> {
  const p = await placeOf(ctx, s);
  if (!p.book) return { dry: false, needs: [] };
  let out: { dry: boolean; needs: string[] };
  if (p.book.data.kind === "fighter") {
    const st = computeStatus(p.progress?.marks ?? {}, fighter(p.book.data));
    out = { dry: st.dry, needs: st.needs };
  } else {
    const ms = computeMaster(masterState(p.progress), p.book.data);
    out = { dry: ms.dry, needs: ms.needs };
  }
  if (out.dry && (await givenWork(ctx, s)).some((g) => g.work)) return { dry: false, needs: [] };
  return out;
}

/** A book he could work on now: a level (workbook) or a question (theory book) to do. No book in the app: yes. */
export function workLeft(book: Doc<"books"> | null, p: Doc<"progress"> | null): boolean {
  return bookState(book, p).work;
}

/** work = something he can do now; done = finished (every level corrected, nothing left for a teacher). */
export function bookState(book: Doc<"books"> | null, p: Doc<"progress"> | null): { work: boolean; done: boolean } {
  if (!book) return { work: true, done: false }; // a printed book the app can't see: he has work
  if (book.data.kind === "fighter") {
    const st = computeStatus(p?.marks ?? {}, fighter(book.data));
    return { work: !st.dry && !st.finished, done: st.finished };
  }
  const ms = computeMaster(masterState(p), book.data);
  return { work: ms.current !== null, done: ms.finished };
}

/** The books given to him (not his book now), and whether each still has work. */
export async function givenWork(
  ctx: QueryCtx,
  s: Doc<"students">,
  cache?: Map<string, Doc<"books"> | null>,
): Promise<{ unitId: Id<"units">; stage: BookStage; work: boolean; done: boolean }[]> {
  const out: { unitId: Id<"units">; stage: BookStage; work: boolean; done: boolean }[] = [];
  for (const h of await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
    if (h.unitId === s.unitId && h.stage === s.stage) continue;
    const key = `${h.unitId}:${h.stage}`;
    let book = cache?.get(key);
    if (book === undefined) {
      book = await bookFor(ctx, h.unitId, h.stage);
      cache?.set(key, book);
    }
    out.push({ unitId: h.unitId, stage: h.stage, ...bookState(book, await progressFor(ctx, s._id, h.unitId, h.stage)) });
  }
  return out;
}

/**
 * A book (not his book now) with something waiting: a level handed in, lost marks or wrong answers to explain,
 * questions for Theory. The rooms see every such book, whatever unit he is on now.
 */
export function openWork(book: Doc<"books">, p: Doc<"progress">): boolean {
  if (book.data.kind === "fighter") return computeStatus(p.marks ?? {}, fighter(book.data)).pending.length > 0;
  const m = masterState(p);
  const ms = computeMaster(m, book.data);
  // A level marked at home that Correction hasn't checked yet is work for her (⌂).
  return ms.waiting.length > 0 || ms.pending.length > 0 || ms.theory.length > 0 || ms.reteach || Object.values(m.lv).some(homeToCheck);
}

/** Quick look before reading the book: could this row have anything waiting at all? */
export function mayBeOpen(p: Doc<"progress">): boolean {
  if (p.stage === "fighter") return Object.values(p.marks ?? {}).some((m) => m?.s === "wrong");
  const m = masterState(p);
  return (
    !!m.reteach ||
    Object.values(m.lv).some((l) => (!!l?.done && !l.fixed) || homeToCheck(l)) ||
    Object.values(m.q).some((r) => (!!r?.lost && !r.x && !r.th) || (!!r?.th && !r.tt))
  );
}

const round1 = (min: number) => Math.round(min * 10) / 10;

/** Close a session: stop idle clocks, send everyone home, write the report. */
export async function closeSession(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  endAt: number,
  by?: string,
) {
  const students = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
  for (const s of students) await closeIdle(ctx, s, endAt, session);

  for (const status of ["requested", "sent"] as const) {
    const open = await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", status)).collect();
    for (const c of open) await ctx.db.patch(c._id, { status: status === "sent" ? "done" : "cancelled", endedAt: endAt });
  }
  for (const s of students) {
    if (s.present) await endVisit(ctx, s._id, endAt);
    await ctx.db.patch(s._id, { present: false, room: undefined, idleSince: undefined, idleMs: 0 });
  }
  // Every teacher still marked here goes with the class (3 Nov 2026): a forgotten "went" never runs on.
  await endStays(ctx, [slDay(session.startedAt), slDay(endAt)], endAt);

  const report = await buildReport(ctx, session, endAt);
  await ctx.db.patch(session._id, { open: false, endedAt: endAt, lastActivityAt: endAt, report });
  await log(ctx, session, endAt, { kind: "session-end", by, ms: endAt - session.startedAt });
}

type Row = {
  name: string;
  idleMin: number;
  idleTheoryMin: number;
  idleEvalMin: number;
  idleCorrMin: number;
  right: number;
  wrong: number;
  slip: number;
  /** Master: levels corrected today, marks got / possible in them. */
  levels: number;
  got: number;
  max: number;
};

/** Events of one class read for the Owner page: a class has a few thousand; more than this is cut. */
export const DIGEST_EVENTS = 8_000;

/**
 * One class for the Owner page (convex/lib/boss.ts): its history, calls and visits read once. Kept in the report when the
 * class ends; the class going on (and classes ended before 31 Oct 2026) are read again when the page asks.
 */
export async function readDigest(
  ctx: QueryCtx,
  session: Doc<"sessions">,
  end: number,
  got?: { events: Doc<"events">[]; calls: Doc<"calls">[] },
  opts?: { segs?: boolean },
): Promise<Digest> {
  const events =
    got?.events ??
    (await ctx.db.query("events").withIndex("by_session", (q) => q.eq("sessionId", session._id)).take(DIGEST_EVENTS));
  const calls = got?.calls ?? (await ctx.db.query("calls").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect());
  const days = new Set([slDay(session.startedAt), slDay(end)]);
  const visits: Doc<"attendance">[] = [];
  const stays: Doc<"duty">[] = [];
  for (const day of days) {
    visits.push(...(await ctx.db.query("attendance").withIndex("by_day", (q) => q.eq("day", day)).collect()));
    stays.push(...(await ctx.db.query("duty").withIndex("by_day", (q) => q.eq("day", day)).collect()));
  }
  const students = await ctx.db.query("students").collect();
  // The class going on: a student out of work right now waits too (his wait is logged when it ends).
  const waitsNow = session.open
    ? students
        .filter((s) => s.idleSince !== undefined && s.idleSince < end)
        .map((s) => ({ at: end, kind: "idle", studentId: s._id as string, ms: end - s.idleSince!, value: s.idleReason }))
    : [];
  // The teachers (not the owner: he manages and teaches some days; never in the teachers' numbers).
  const team = (await ctx.db.query("users").collect())
    .filter((u) => u.role === "teacher")
    .map((u) => ({ id: u._id as string, name: u.name, jobs: u.tabs }));
  return digestOf({
    start: session.startedAt,
    end,
    events: [...events.map((e) => ({ ...e, studentId: e.studentId as string | undefined })), ...waitsNow],
    calls: calls.map((c) => ({ ...c, studentId: c.studentId as string })),
    visits: visits
      .filter((x) => x.inAt < end && (x.outAt ?? end) > session.startedAt)
      .map((x) => ({ studentId: x.studentId as string, inAt: x.inAt, outAt: x.outAt })),
    students: students.map((x) => ({ _id: x._id as string, stage: x.stage, demo: x.demo })),
    stats: session.stats,
    team,
    stays: stays.map((x) => ({ userId: x.userId as string, inAt: x.inAt, outAt: x.outAt })),
    segs: opts?.segs,
  });
}

async function buildReport(ctx: MutationCtx, session: Doc<"sessions">, endAt: number) {
  const allEvents = await ctx.db.query("events").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
  const allCalls = await ctx.db.query("calls").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
  const digest = await readDigest(ctx, session, endAt, { events: allEvents, calls: allCalls });
  // The test class (test students) is never in the class's report.
  const tests = new Set((await ctx.db.query("students").collect()).filter((x) => x.test).map((x) => x._id as string));
  const events = allEvents.filter((e) => !e.studentId || !tests.has(e.studentId));
  const calls = allCalls.filter((c) => !tests.has(c.studentId));

  const rows = new Map<string, Row>();
  const row = (id: string, name: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { name, idleMin: 0, idleTheoryMin: 0, idleEvalMin: 0, idleCorrMin: 0, right: 0, wrong: 0, slip: 0, levels: 0, got: 0, max: 0 };
      rows.set(id, r);
    }
    return r;
  };
  let explained = 0;
  const waits: number[] = [];
  for (const e of events) {
    if (!e.studentId) continue;
    const r = row(e.studentId, e.name ?? "?");
    if (e.kind === "idle" && e.ms) {
      const min = e.ms / 60_000;
      const why = e.value ?? "";
      r.idleMin += min;
      if (why.includes("theory")) r.idleTheoryMin += min;
      else if (why.includes("correction")) r.idleCorrMin += min;
      else r.idleEvalMin += min;
    }
    if (e.kind === "mark" && (e.value === "right" || e.value === "wrong" || e.value === "slip")) r[e.value]++;
    if (e.kind === "explained") explained += Number(e.value ?? 0);
    if (e.kind === "level-marks") {
      const m = /^[^ ]+ (\d+)\/(\d+)/.exec(e.value ?? "");
      if (m) {
        r.levels++;
        r.got += Number(m[1]);
        r.max += Number(m[2]);
      }
      if (e.ms !== undefined) waits.push(e.ms / 60_000);
    }
  }

  const sittings = (kind: "theory" | "evaluation") => {
    const groups = new Map<string, { start: number; end: number; students: number }>();
    for (const c of calls) {
      if (c.kind !== kind || c.status !== "done" || !c.sentAt || !c.endedAt) continue;
      const g = groups.get(c.group) ?? { start: c.sentAt, end: c.endedAt, students: 0 };
      g.start = Math.min(g.start, c.sentAt);
      g.end = Math.max(g.end, c.endedAt);
      g.students++;
      groups.set(c.group, g);
    }
    const mins = [...groups.values()].map((g) => (g.end - g.start) / 60_000);
    const students = [...groups.values()].reduce((a, g) => a + g.students, 0);
    return {
      sittings: mins.length,
      students,
      avgMin: mins.length ? round1(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
      maxMin: mins.length ? round1(Math.max(...mins)) : null,
    };
  };

  const list = [...rows.values()]
    .map((r) => ({
      ...r,
      idleMin: round1(r.idleMin),
      idleTheoryMin: round1(r.idleTheoryMin),
      idleEvalMin: round1(r.idleEvalMin),
      idleCorrMin: round1(r.idleCorrMin),
    }))
    .sort((a, b) => b.idleMin - a.idleMin || a.name.localeCompare(b.name));
  const sum = (f: (r: Row) => number) => list.reduce((a, r) => a + f(r), 0);
  const marked = sum((r) => r.right + r.wrong + r.slip);
  return {
    startedAt: session.startedAt,
    endedAt: endAt,
    minutes: Math.round((endAt - session.startedAt) / 60_000),
    idleMin: round1(sum((r) => r.idleMin)),
    idleTheoryMin: round1(sum((r) => r.idleTheoryMin)),
    idleEvalMin: round1(sum((r) => r.idleEvalMin)),
    idleCorrMin: round1(sum((r) => r.idleCorrMin)),
    master: {
      levels: sum((r) => r.levels),
      pct: sum((r) => r.max) ? Math.round((sum((r) => r.got) / sum((r) => r.max)) * 100) : null,
      avgWaitMin: waits.length ? round1(waits.reduce((a, b) => a + b, 0) / waits.length) : null,
      maxWaitMin: waits.length ? round1(Math.max(...waits)) : null,
    },
    marks: { right: sum((r) => r.right), wrong: sum((r) => r.wrong), slip: sum((r) => r.slip) },
    wrongRate: marked ? Math.round((sum((r) => r.wrong) / marked) * 100) : null,
    theory: sittings("theory"),
    evaluation: { ...sittings("evaluation"), explained },
    students: list,
    digest,
  };
}
