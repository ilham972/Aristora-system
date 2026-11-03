// The family app's view of one student: the whole syllabus of his grade (every unit, by term), each level's state, his
// points and his streak. The same numbers the teachers see: a level marked in class or at home is one level.
// - On his screens (3 Nov 2026, his voice note): a term is a World, a unit a Stage, its workbook's levels are Levels,
//   marks are XP (1 mark = 1 XP). A unit with no workbook in the app yet is in the map too ("coming soon").
// - A Stage (unit; the type is still called World here) is open when the teachers opened it for him (his unit now, a
//   book given, levels done there), when the one before it is done (every level handed in or marked), or when "Open
//   every Stage" is on for him.
// - The O/L map (4 Nov 2026, his ask: "who will see the O level syllabus, and who will see the Grade 11 syllabus?"):
//   a Grade 10 or 11 student the teachers ticked (Settings → Students → O/L map) sees the O/L syllabus instead: each
//   paper part a World (Paper I A, I B, II A, II B), each O/L topic a Stage numbered as on his sheet, the first topic in
//   the app open to start. The books he has from the other syllabus (O/L books on a grade's map, his grade's books on
//   the O/L map: his book now, books given, books he started) follow as one more World, so nothing he does is hidden.
// - Only the level he is on can be played (the first with no record): the paper book is the truth, level by level.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { MasterData } from "./book";
import { DAY_MS, slDayNo, slWeekStart } from "./day";
import { computeMaster, EMPTY_MASTER, type MState } from "./master";
import { OL, olNumber } from "./syllabus";

export type LevelState =
  /** Marked (in class, or at home and checked). */
  | "done"
  /** Marked at home by the phone; the corrector will look at his working. */
  | "check"
  /** Handed in: with the corrector. */
  | "class"
  /** Done on paper before the app. */
  | "pre"
  /** His level now: the one to play. */
  | "play"
  | "later";

export type WorldLevel = { n: number; max: number; got?: number; s: LevelState };

/** One unit of his grade (the phone shows it as a Stage of its term's World). */
export type World = {
  unitId: Id<"units">;
  /** The unit's number: Stage 1 is U01. */
  no: number;
  ta: string;
  en: string;
  /** Its school term (1–3; 0 = an extra book): the phone's World. */
  term: number;
  /** Its workbook is in the app (else it is in the syllabus only: "coming soon", nothing to play). */
  book: boolean;
  /** He can play it. */
  open: boolean;
  /** The phone can mark it (its answer key is in the app). */
  phone: boolean;
  /** His unit now (the teachers' "book now"). */
  now: boolean;
  /** Its questions as printed are in the app: a student without his book can read them on the phone (3 Nov 2026). */
  q: boolean;
  levels: WorldLevel[];
  /** Every level handed in or marked. */
  allDone: boolean;
  /**
   * From the other syllabus (an O/L book on his grade's map, or his grade's book on the O/L map): the phone puts these in
   * one more World after the others. Only books he is on now, was given or started; always open.
   */
  other?: true;
  /** When the teachers gave him this workbook (Books given): the newest comes first for the phone's Continue. */
  given?: number;
};

/** His phone shows the O/L syllabus (Settings → Students → O/L map): Grade 10 and 11 students only. */
export function olMapOn(s: Pick<Doc<"students">, "grade" | "olMap">): boolean {
  return !!s.olMap && (s.grade === 10 || s.grade === 11);
}

/** "U08" → 8. */
export function unitNumber(code: string): number {
  return Number(code.replace(/\D/g, "")) || 0;
}

export function levelStates(m: MState, book: MasterData): WorldLevel[] {
  const play = computeMaster(m, book).current?.n;
  return book.levels.map((l): WorldLevel => {
    const lv = m.lv[String(l.n)];
    const base = { n: l.n, max: l.max };
    if (lv?.fixed) return { ...base, got: lv.got ?? 0, s: lv.home && !lv.hc ? "check" : "done" };
    if (lv?.done) return { ...base, s: "class" };
    if (lv?.pre) return { ...base, s: "pre" };
    return { ...base, s: l.n === play ? "play" : "later" };
  });
}

/** Every level handed in, marked or done before the app. */
export function allHandedIn(m: MState, book: MasterData): boolean {
  return book.levels.length > 0 && book.levels.every((l) => {
    const lv = m.lv[String(l.n)];
    return !!(lv?.done || lv?.fixed || lv?.pre);
  });
}

/** Has he done anything in this book (a level handed in, marked or done before the app)? */
function started(m: MState): boolean {
  return Object.values(m.lv).some((lv) => lv.done || lv.fixed || lv.pre);
}

/** A grade's units in book order; the O/L topics by paper part, each part in his sheet's order. */
async function unitsOf(ctx: QueryCtx, grade: number): Promise<Doc<"units">[]> {
  const list = await ctx.db
    .query("units")
    .withIndex("by_grade", (q) => q.eq("grade", grade))
    .collect();
  return list.sort((a, b) => (grade === OL ? a.term - b.term : 0) || a.order - b.order);
}

/**
 * The whole syllabus of his map, with what is open (3 Nov 2026, his ask: "put the whole syllabus"): his grade's, or the
 * O/L syllabus when he is ticked for it (olMapOn). A unit without a workbook is listed with no levels and never open;
 * the "next opens when this one is done" chain passes over it. Then the other syllabus's books he has (`other`).
 */
export async function worldsOf(ctx: QueryCtx, student: Doc<"students">): Promise<World[]> {
  if (typeof student.grade !== "number") return [];
  const ol = olMapOn(student);
  // O/L books are for Grade 10 and 11 students only (students.checkOl): no one else has an O/L side.
  const olUnits = student.grade === 10 || student.grade === 11 ? await unitsOf(ctx, OL) : [];
  const gradeUnits = await unitsOf(ctx, student.grade);
  const rows = await ctx.db
    .query("progress")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .collect();
  // His workbooks given (the newest hand-out of each).
  const given = new Map<string, number>();
  for (const h of await ctx.db
    .query("handouts")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .collect()) {
    if (h.stage === "master") given.set(h.unitId, Math.max(given.get(h.unitId) ?? 0, h.at));
  }
  const workbook = async (unit: Doc<"units">) => {
    const book = await ctx.db
      .query("books")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", unit._id).eq("stage", "master"))
      .first();
    return book && book.data.kind === "master" ? { row: book, data: book.data } : null;
  };
  const stage = (unit: Doc<"units">, book: { row: Doc<"books">; data: MasterData }, open: boolean): World => {
    const p = rows.find((r) => r.unitId === unit._id && r.stage === "master");
    const m = p?.m ?? EMPTY_MASTER;
    const at = given.get(unit._id);
    return {
      unitId: unit._id,
      no: unit.grade === OL ? olNumber(unit, olUnits) : unitNumber(unit.code),
      ta: unit.ta,
      en: unit.en,
      term: unit.term,
      book: true,
      open: open || !!student.openAll || student.unitId === unit._id || at !== undefined || started(m),
      phone: (book.row.keyCount ?? 0) > 0,
      now: student.unitId === unit._id,
      q: (book.row.qCount ?? 0) > 0,
      levels: levelStates(m, book.data),
      allDone: allHandedIn(m, book.data),
      ...(at !== undefined ? { given: at } : {}),
    };
  };

  const out: World[] = [];
  // The chain: a Stage opens when the one before it is done. The O/L map opens its first topic in the app by itself
  // (his answer, 4 Nov 2026: "one by one"): the class may not have put him on any O/L book yet.
  let prevDone = ol;
  for (const unit of ol ? olUnits : gradeUnits) {
    const book = await workbook(unit);
    if (!book) {
      out.push({
        unitId: unit._id,
        no: unit.grade === OL ? olNumber(unit, olUnits) : unitNumber(unit.code),
        ta: unit.ta,
        en: unit.en,
        term: unit.term,
        book: false,
        open: false,
        phone: false,
        now: student.unitId === unit._id,
        q: false,
        levels: [],
        allDone: false,
      });
      continue;
    }
    const w = stage(unit, book, prevDone);
    out.push(w);
    prevDone = w.allDone;
  }
  // The other syllabus: only what he has there (his book now, a book given, levels done), always open.
  for (const unit of ol ? gradeUnits : olUnits) {
    const has = student.unitId === unit._id || given.has(unit._id) || rows.some((r) => r.unitId === unit._id && r.stage === "master" && r.m && started(r.m));
    if (!has) continue;
    const book = await workbook(unit);
    if (book) out.push({ ...stage(unit, book, true), other: true });
  }
  return out;
}

/** His workbook rows (every unit). */
export async function masterRows(ctx: QueryCtx, studentId: Id<"students">): Promise<Doc<"progress">[]> {
  const rows = await ctx.db
    .query("progress")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect();
  return rows.filter((r) => r.stage === "master" && r.m);
}

/**
 * XP since a time: the marks of every level he finished since then (handed in or marked at home; marked in class or
 * at home). A level counts in the week he did it, with the marks it has now (the corrector's check can change them).
 */
export function xpSince(rows: Doc<"progress">[], since: number): number {
  let xp = 0;
  for (const r of rows) {
    for (const lv of Object.values(r.m?.lv ?? {})) {
      if (lv.fixed && (lv.done ?? lv.fixed) >= since) xp += lv.got ?? 0;
    }
  }
  return xp;
}

/** XP this week (Monday 00:00 in Sri Lanka). */
export function weekXp(rows: Doc<"progress">[], now: number): number {
  return xpSince(rows, slWeekStart(now));
}

/** Every day (Sri Lanka day number) he finished a level: handed in, or marked in class or at home (never "before the app"). */
export function levelDays(rows: Doc<"progress">[]): Set<number> {
  const days = new Set<number>();
  for (const r of rows) {
    for (const lv of Object.values(r.m?.lv ?? {})) {
      const t = lv.done ?? lv.fixed;
      if (t !== undefined && !lv.pre) days.add(slDayNo(t));
    }
  }
  return days;
}

/**
 * Days in a row with a level finished (handed in, or marked in class or at home), up to today. Before he finishes one
 * today, yesterday's streak still stands (today = false: he can keep it).
 */
export function streakOf(rows: Doc<"progress">[], now: number): { days: number; today: boolean } {
  const days = levelDays(rows);
  const today = slDayNo(now);
  const has = days.has(today);
  let d = has ? today : today - 1;
  let n = 0;
  while (days.has(d)) {
    n++;
    d--;
  }
  return { days: n, today: has };
}

/** His longest run of days in a row with a level finished, ever. */
export function bestStreak(days: Set<number>): number {
  let best = 0;
  for (const d of days) {
    if (days.has(d - 1)) continue; // not the first day of a run
    let n = 1;
    while (days.has(d + n)) n++;
    best = Math.max(best, n);
  }
  return best;
}

/** This week, Monday to Sunday (Sri Lanka): did he finish a level that day? */
export function weekDays(days: Set<number>, now: number): boolean[] {
  const monday = slDayNo(slWeekStart(now));
  return Array.from({ length: 7 }, (_, i) => days.has(monday + i));
}

/** This week, Monday to Sunday: the XP of the levels he finished each day (the progress page's bars). */
export function weekDayXp(rows: Doc<"progress">[], now: number): number[] {
  const monday = slDayNo(slWeekStart(now));
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const r of rows) {
    for (const lv of Object.values(r.m?.lv ?? {})) {
      if (!lv.fixed) continue;
      const d = slDayNo(lv.done ?? lv.fixed) - monday;
      if (d >= 0 && d < 7) out[d] += lv.got ?? 0;
    }
  }
  return out;
}

/** Levels he finished (handed in, or marked in class or at home; never "before the app") since a time. */
export function levelsSince(rows: Doc<"progress">[], since: number): number {
  let n = 0;
  for (const r of rows) {
    for (const lv of Object.values(r.m?.lv ?? {})) {
      const t = lv.done ?? lv.fixed;
      if (t !== undefined && !lv.pre && t >= since) n++;
    }
  }
  return n;
}

/** His best week ever: the most XP he made between a Monday and the next. */
export function bestWeekXp(rows: Doc<"progress">[]): number {
  const weeks = new Map<number, number>();
  for (const r of rows) {
    for (const lv of Object.values(r.m?.lv ?? {})) {
      if (!lv.fixed) continue;
      const w = slWeekStart(lv.done ?? lv.fixed);
      weeks.set(w, (weeks.get(w) ?? 0) + (lv.got ?? 0));
    }
  }
  return Math.max(0, ...weeks.values());
}

// ---- Trophies (3 Nov 2026, his voice note: "addicted to winning the trophy"): earned once, kept for good ----

/** Every trophy, in the order the phone shows them. The rules are below; the names and pictures are the phone's. */
export const TROPHIES = ["first", "streak3", "streak7", "streak30", "perfect", "perfect5", "world", "xp100", "xp300"] as const;
export type Trophy = (typeof TROPHIES)[number];

/** A level he finished with every mark (marked in class, or at home and not yet checked). */
function perfect(l: WorldLevel): boolean {
  return (l.s === "done" || l.s === "check") && l.max > 0 && l.got === l.max;
}

/**
 * His trophies, from what the teachers see: his first level, 3 / 7 / 30 days in a row (his best run), a level with every
 * mark, five of them, a whole World finished (at least one level of it in the app), 100 and 300 XP in one week.
 */
export function trophiesOf(rows: Doc<"progress">[], worlds: World[]): Trophy[] {
  const days = levelDays(rows);
  const best = bestStreak(days);
  const perfects = worlds.reduce((n, w) => n + w.levels.filter(perfect).length, 0);
  const world = worlds.some((w) => w.allDone && w.levels.some((l) => l.s !== "pre"));
  const week = bestWeekXp(rows);
  const has: Record<Trophy, boolean> = {
    first: days.size > 0,
    streak3: best >= 3,
    streak7: best >= 7,
    streak30: best >= 30,
    perfect: perfects >= 1,
    perfect5: perfects >= 5,
    world,
    xp100: week >= 100,
    xp300: week >= 300,
  };
  return TROPHIES.filter((t) => has[t]);
}

// ---- Index numbers and codes (his answer, 1 Nov 2026): he signs in with both, on his phone and his parent's ----

/** The first index number; then 1002, 1003… Never reused, even after a student is removed. */
export const FIRST_INDEX = 1001;
/** Wrong codes in a row before the lock, and how long it lasts (a classmate can't guess 4 digits). */
export const CODE_FAILS = 5;
export const CODE_LOCK_MS = 15 * 60_000;

/** His index number: his own, or the next one (kept for good). */
export async function giveIndex(ctx: MutationCtx, s: Doc<"students">): Promise<number> {
  if (typeof s.index === "number") return s.index;
  const meta = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "nextIndex"))
    .first();
  const n = Math.max(FIRST_INDEX, Number(meta?.value ?? FIRST_INDEX));
  await ctx.db.patch(s._id, { index: n });
  if (meta) await ctx.db.patch(meta._id, { value: n + 1 });
  else await ctx.db.insert("meta", { key: "nextIndex", value: n + 1 });
  return n;
}

/** A code too easy to guess: 1111, 1234, 9876 (the phone makes another). */
export function weakCode(code: string): boolean {
  return /^(\d)\1{3}$/.test(code) || "0123456789".includes(code) || "9876543210".includes(code);
}

export async function codeRow(ctx: QueryCtx, studentId: Id<"students">): Promise<Doc<"familyCodes"> | null> {
  return await ctx.db
    .query("familyCodes")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .first();
}


// ---- His classes (3 Nov 2026, his voice note: the app is also the institute's student app: the class schedule,
// today's class, what he did in class and at home). Built from what the class already records: attendance, calls to a
// teacher, workbook levels. Never his waiting time (that is the centre's job, not his). ----

/** One grade's class hours per weekday, Monday first: minutes after midnight (Sri Lanka), or null = no class. */
export type Hours = ({ from: number; to: number } | null)[];
export const NO_HOURS: Hours = [null, null, null, null, null, null, null];
/** The grades with class hours (OL students are in Grade 10 or 11). */
export const HOUR_GRADES = [6, 7, 8, 9, 10, 11];
/** Each grade its own hours (3 Nov 2026, his words: "different grades have different time schedules"), by "6"…"11". */
export type GradeHours = Record<string, Hours>;

const isHours = (v: unknown): v is Hours => Array.isArray(v) && v.length === 7;

/** A day's number from its Sri Lanka date ("2026-11-03"). */
export function dayNoOf(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
}

/** Monday = 0 … Sunday = 6, for a day number. */
export function weekdayOf(dayNo: number): number {
  return (new Date(dayNo * DAY_MS).getUTCDay() + 6) % 7;
}

/** The weekdays he usually comes (Monday = 0): one he came on in at least 2 of the last 4 weeks. */
export function usualDays(days: string[], now: number): number[] {
  const today = slDayNo(now);
  const weeks = new Map<number, Set<number>>();
  for (const d of new Set(days)) {
    const no = dayNoOf(d);
    if (no > today || no <= today - 28) continue;
    const wd = weekdayOf(no);
    if (!weeks.has(wd)) weeks.set(wd, new Set());
    weeks.get(wd)!.add(Math.floor((today - no) / 7));
  }
  return [...weeks.entries()]
    .filter(([, w]) => w.size >= 2)
    .map(([d]) => d)
    .sort((a, b) => a - b);
}

/** One thing in his day, for the timeline (class and home). */
export type DayItem =
  | { k: "in" | "out"; at: number }
  | { k: "level"; at: number; no: number; ta: string; n: number; how: "handed" | "marked" | "home"; got: number | null; max: number }
  | {
      k: "room";
      at: number;
      to: number | null;
      room: "theory" | "evaluation";
      teacher: string | null;
      no: number | null;
      ta: string | null;
      section: string | null;
      /** Questions explained (Evaluation) or taught (Theory) while he was with her. */
      qs: number[];
    };

/** A level's moment in a day: marked at home, marked in class, or handed in (waiting for the corrector). */
export function levelMoment(
  lv: { done?: number; fixed?: number; got?: number; pre?: number; home?: number },
  from: number,
  to: number,
): { at: number; how: "handed" | "marked" | "home"; got: number | null } | null {
  if (lv.pre !== undefined) return null;
  const inDay = (t: number | undefined): t is number => t !== undefined && t >= from && t < to;
  if (inDay(lv.home)) return { at: lv.home, how: "home", got: lv.got ?? null };
  if (inDay(lv.fixed)) return { at: lv.fixed, how: "marked", got: lv.got ?? null };
  if (inDay(lv.done) && lv.fixed === undefined) return { at: lv.done, how: "handed", got: null };
  return null;
}

/**
 * Every grade's class hours (owner: Settings → Class hours; meta "classHours" = { "6": Hours, … }). The first evening
 * they were one list for every grade: such a list still counts for each grade until that grade gets its own.
 */
export async function gradeHoursOf(ctx: QueryCtx): Promise<GradeHours> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "classHours"))
    .first();
  const v = row?.value as unknown;
  const out: GradeHours = {};
  for (const g of HOUR_GRADES) {
    const x = isHours(v) ? v : v && typeof v === "object" ? (v as Record<string, unknown>)[String(g)] : undefined;
    out[String(g)] = isHours(x) ? x : NO_HOURS;
  }
  return out;
}

/** His grade's class hours; none set = no class shown. */
export async function hoursOf(ctx: QueryCtx, grade: number | null | undefined): Promise<Hours> {
  if (typeof grade !== "number") return NO_HOURS;
  return (await gradeHoursOf(ctx))[String(grade)] ?? NO_HOURS;
}
