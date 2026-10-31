// Backend-only helpers: sessions, the history log, idle tracking.

import { ConvexError } from "convex/values";
import { claimLive } from "./claims";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fighter, type Fighter, type MasterData } from "./book";
import { slDay } from "./day";
import { computeMaster, EMPTY_MASTER, homeToCheck, type MState } from "./master";
import { computeStatus } from "./status";
import { digestOf, type Digest } from "./ceo";

export type Stage = "fighter" | "master" | "legend" | "sprint";
export type BookStage = "fighter" | "master";

/** A session with no activity for this long is closed automatically. */
export const STALE_SESSION_MS = 4 * 60 * 60_000;

export function fail(message: string): never {
  throw new ConvexError(message);
}

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

export async function touch(ctx: MutationCtx, session: Doc<"sessions"> | null, now: number) {
  if (session) await ctx.db.patch(session._id, { lastActivityAt: now });
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
  await ctx.db.insert("attendance", { studentId, day: slDay(at), inAt: at, ...(session ? { sessionId: session._id } : {}) });
}

/** He left, or the session ended: close his open visit. */
export async function endVisit(ctx: MutationCtx, studentId: Id<"students">, at: number): Promise<void> {
  const v = await lastVisit(ctx, studentId);
  if (v && v.outAt === undefined) await ctx.db.patch(v._id, { outAt: Math.max(at, v.inAt) });
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
    // The rooms' scores: a wait counts for each room he was waiting for ("theory+evaluation": both). Never a test
    // student's (the test class doesn't count).
    for (const room of s.test ? [] : STAT_ROOMS) {
      if (!(s.idleReason ?? "").split("+").includes(room)) continue;
      await addStats(ctx, session, room, { waitMs: ms }, { maxWaitMs: ms });
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

/** Events of one class read for the CEO page: a class has a few thousand; more than this is cut. */
export const DIGEST_EVENTS = 8_000;

/**
 * One class for the CEO page (convex/lib/ceo.ts): its history, calls and visits read once. Kept in the report when the
 * class ends; the class going on (and classes ended before 31 Oct 2026) are read again when the page asks.
 */
export async function readDigest(
  ctx: QueryCtx,
  session: Doc<"sessions">,
  end: number,
  got?: { events: Doc<"events">[]; calls: Doc<"calls">[] },
): Promise<Digest> {
  const events =
    got?.events ??
    (await ctx.db.query("events").withIndex("by_session", (q) => q.eq("sessionId", session._id)).take(DIGEST_EVENTS));
  const calls = got?.calls ?? (await ctx.db.query("calls").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect());
  const days = new Set([slDay(session.startedAt), slDay(end)]);
  const visits: Doc<"attendance">[] = [];
  for (const day of days) visits.push(...(await ctx.db.query("attendance").withIndex("by_day", (q) => q.eq("day", day)).collect()));
  const students = await ctx.db.query("students").collect();
  return digestOf({
    start: session.startedAt,
    end,
    events: events.map((e) => ({ ...e, studentId: e.studentId as string | undefined })),
    calls: calls.map((c) => ({ ...c, studentId: c.studentId as string })),
    visits: visits
      .filter((x) => x.inAt < end && (x.outAt ?? end) > session.startedAt)
      .map((x) => ({ studentId: x.studentId as string, inAt: x.inAt, outAt: x.outAt })),
    students: students.map((x) => ({ _id: x._id as string, stage: x.stage, demo: x.demo })),
    stats: session.stats,
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
