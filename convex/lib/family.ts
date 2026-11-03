// The family app's view of one student: his Worlds (the workbooks of his grade), each level's state, his points this
// week and his streak. The same numbers the teachers see: a level marked in class or at home is one level.
// - No school words on his screens: a unit is a World, marks are XP (1 mark = 1 XP). The levels are the book's.
// - A World is open when the teachers opened it for him (his unit now, a book given, levels done there), when the
//   World before it is done (every level handed in or marked), or when "Open every World" is on for him.
// - Only the level he is on can be played (the first with no record): the paper book is the truth, level by level.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { MasterData } from "./book";
import { slDayNo, slWeekStart } from "./day";
import { computeMaster, EMPTY_MASTER, type MState } from "./master";

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

export type World = {
  unitId: Id<"units">;
  /** The unit's number: World 1 is U01. */
  no: number;
  ta: string;
  en: string;
  term: number;
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
};

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

/** His Worlds: the workbooks of his grade, in book order, with what is open. */
export async function worldsOf(ctx: QueryCtx, student: Doc<"students">): Promise<World[]> {
  if (typeof student.grade !== "number") return [];
  const units = await ctx.db
    .query("units")
    .withIndex("by_grade", (q) => q.eq("grade", student.grade!))
    .collect();
  const rows = await ctx.db
    .query("progress")
    .withIndex("by_student", (q) => q.eq("studentId", student._id))
    .collect();
  const given = new Set(
    (await ctx.db
      .query("handouts")
      .withIndex("by_student", (q) => q.eq("studentId", student._id))
      .collect())
      .filter((h) => h.stage === "master")
      .map((h) => h.unitId as string),
  );
  const out: World[] = [];
  let prevDone = false;
  for (const unit of units.sort((a, b) => a.order - b.order)) {
    const book = await ctx.db
      .query("books")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", unit._id).eq("stage", "master"))
      .first();
    if (!book || book.data.kind !== "master") continue;
    const p = rows.find((r) => r.unitId === unit._id && r.stage === "master");
    const m = p?.m ?? EMPTY_MASTER;
    const now = student.unitId === unit._id;
    const open = !!student.openAll || now || given.has(unit._id) || started(m) || prevDone;
    const allDone = allHandedIn(m, book.data);
    out.push({
      unitId: unit._id,
      no: unitNumber(unit.code),
      ta: unit.ta,
      en: unit.en,
      term: unit.term,
      open,
      phone: (book.keyCount ?? 0) > 0,
      now,
      q: (book.qCount ?? 0) > 0,
      levels: levelStates(m, book.data),
      allDone,
    });
    prevDone = allDone;
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

