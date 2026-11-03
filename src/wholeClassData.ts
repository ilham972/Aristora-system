// The whole-class lesson's rules (3 Nov 2026; the page is src/wholeClass.tsx, the server convex/teach.ts). Pure, so
// tests read them. His pick when asked: a student counts only when the lesson can be saved for him; everyone else here
// in that grade is listed, pale, with where he is.
// - A theory book: its sections that have teacher questions; Taught = that teacher question taught. Ticked at first:
//   it is his book now (or a book given to him) and the section isn't all taught for him. Anyone who has the book can be
//   ticked (one who moved past it, one already taught); one without it can't (nothing to save: he listens).
// - A workbook: its levels; Taught = a question he lost marks on, still waiting for a teacher (Theory: taught,
//   Evaluation: explained). Ticked at first and tickable: something of that level waits for him.

import type { BookData, SectionData } from "../convex/lib/book";
import type { MarkState } from "../convex/lib/status";
import { OL } from "../convex/lib/syllabus";
import type { View } from "./derive";
import { unitNo } from "./focusData";

export type Kind = "fighter" | "master";
export type Wait = "eval" | "theory" | "explained" | "taught";

/** One student here in the lesson's grade, as the server sends him (convex/teach.ts roster). */
export type RosterStudent = {
  id: string;
  name: string;
  grade: number | null;
  unitId: string | null;
  stage: string | null;
  /** He has this book (his book now, given, or one he worked in). */
  has: boolean;
  /** It is his book now, or a book given to him. */
  now: boolean;
  /** Theory book: the teacher questions' circles. */
  marks?: Record<string, MarkState>;
  /** Workbook: the lost questions' teach state. */
  waits?: Record<string, Wait>;
};

export type Roster = { unitId: string; stage: Kind; data: BookData; keyCount: number; qCount: number; students: RosterStudent[] };

/** A lesson: a theory book's section (its teacher questions) or a workbook's level (its questions). */
export type Lesson = { key: string; kind: "section" | "level"; label: string; ta: string; qs: number[]; section: SectionData | null };

export function lessonsOf(data: BookData): Lesson[] {
  if (data.kind === "fighter") {
    return data.sections
      .filter((s) => s.teach.length > 0)
      .map((s) => ({ key: `S${s.id}`, kind: "section" as const, label: s.badge || s.id, ta: s.tamil, qs: [...s.teach].sort((a, b) => a - b), section: s }));
  }
  return data.levels.map((l) => ({
    key: `L${l.n}`,
    kind: "level" as const,
    label: `L${l.n}`,
    ta: "",
    qs: Array.from({ length: l.to - l.from + 1 }, (_, i) => l.from + i),
    section: null,
  }));
}

/** Would Taught on this question change something for him? */
export function toDo(st: RosterStudent, kind: Kind, q: number): boolean {
  if (!st.has) return false;
  if (kind === "fighter") return st.marks?.[String(q)] !== "taught";
  const w = st.waits?.[String(q)];
  return w === "eval" || w === "theory";
}

/** Done for him: taught (or explained) already. */
export function doneFor(st: RosterStudent, kind: Kind, q: number): boolean {
  if (!st.has) return false;
  if (kind === "fighter") return st.marks?.[String(q)] === "taught";
  const w = st.waits?.[String(q)];
  return w === "explained" || w === "taught";
}

/** Can she tick him for this lesson (something can be saved for him)? */
export function canTick(st: RosterStudent, kind: Kind, l: Lesson): boolean {
  if (kind === "fighter") return st.has;
  return l.qs.some((q) => toDo(st, kind, q));
}

/** The page's tick: those the lesson is for now. */
export function pageTick(st: RosterStudent, kind: Kind, l: Lesson): boolean {
  if (kind === "fighter") return st.now && l.qs.some((q) => toDo(st, kind, q));
  return canTick(st, kind, l);
}

/** Where he is, in a few words: "on 03", "workbook", "Legend". */
export function whereWords(st: RosterStudent, unitId: string, kind: Kind, unitCode: (id: string) => string | null): string {
  if (st.stage === "legend") return "Legend";
  if (st.stage === "sprint") return "Exam Sprint";
  if (!st.unitId) return "no unit";
  if (st.unitId === unitId) return st.stage === kind ? "" : st.stage === "master" ? "on its workbook" : "on its theory book";
  const code = unitCode(st.unitId);
  return code ? `on ${unitNo(code)}` : "another unit";
}

/** His pill's small words: where he is, only when it isn't this book (3 Nov 2026: no word repeated on every pill; the
 *  box's line counts the taught, the colour shows them). */
export function pillWords(st: RosterStudent, kind: Kind, unitId: string, unitCode: (id: string) => string | null): string {
  if (st.now) return "";
  return whereWords(st, unitId, kind, unitCode) || (st.has ? "" : "no book");
}

/** This lesson is done for him already (every question taught, or explained): pale green, counted in the box's line. */
export function doneAll(st: RosterStudent, kind: Kind, l: Lesson): boolean {
  if (!st.has) return false;
  if (kind === "fighter") return l.qs.every((q) => doneFor(st, kind, q));
  return !l.qs.some((q) => toDo(st, kind, q)) && l.qs.some((q) => doneFor(st, kind, q));
}

/** One question's square: how many ticked it would save for, and done for all of them. */
export function squareOf(q: number, kind: Kind, ticked: readonly RosterStudent[]): { n: number; done: boolean } {
  const n = ticked.filter((st) => toDo(st, kind, q)).length;
  return { n, done: n === 0 && ticked.some((st) => doneFor(st, kind, q)) };
}

/** The lesson the page opens: a theory book's first section the page ticks someone for; a workbook's level with the
 *  most waiting here. Else the first. */
export function firstLesson(r: Roster, ls: readonly Lesson[]): Lesson | null {
  if (ls.length === 0) return null;
  if (r.stage === "fighter") return ls.find((l) => r.students.some((st) => pageTick(st, "fighter", l))) ?? ls[0];
  let best = ls[0];
  let most = 0;
  for (const l of ls) {
    const n = r.students.reduce((a, st) => a + l.qs.filter((q) => toDo(st, "master", q)).length, 0);
    if (n > most) {
      most = n;
      best = l;
    }
  }
  return best;
}

/** The question the lesson opens at: the first that still saves something for the ticked; else the first. */
export function firstQ(l: Lesson, kind: Kind, ticked: readonly RosterStudent[]): number | null {
  return l.qs.find((q) => squareOf(q, kind, ticked).n > 0) ?? l.qs[0] ?? null;
}

// ---------------------------------------------------------------- The rows before the lesson loads (from the board)

/** Students here: the grades they are in, how many each (OL counts Grades 10 and 11's). */
export function hereByGrade(views: readonly View[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const v of views) {
    if (v.where === "absent" || v.s.grade === undefined) continue;
    m.set(v.s.grade, (m.get(v.s.grade) ?? 0) + 1);
  }
  const ol = (m.get(10) ?? 0) + (m.get(11) ?? 0);
  if (ol) m.set(OL, ol);
  return m;
}

/** The grade the page opens: the last one picked on this phone if anyone of it is here, else the one most are in. */
export function firstGrade(counts: Map<number, number>, last: number | null): number | null {
  if (last !== null && (counts.get(last) ?? 0) > 0) return last;
  let best: number | null = null;
  for (const [g, n] of counts) if (g !== OL && (best === null || n > (counts.get(best) ?? 0))) best = g;
  return best;
}

type U = { _id: string; grade: number; code: string };

/** The units of a grade with a book of this kind in the app, in book order. */
export function unitsWith<T extends U>(units: readonly T[], grade: number, kind: Kind, hasBook: (unitId: string, kind: Kind) => boolean): T[] {
  return units.filter((u) => u.grade === grade && hasBook(u._id, kind));
}

/** The kind the page opens: the one most students here in that grade work in now (that has books), else the other. */
export function firstKind(views: readonly View[], grade: number, hasAny: (k: Kind) => boolean): Kind {
  const here = views.filter((v) => v.where !== "absent" && (grade === OL ? v.s.grade === 10 || v.s.grade === 11 : v.s.grade === grade));
  const f = here.filter((v) => v.s.stage === "fighter").length;
  const m = here.filter((v) => v.s.stage === "master").length;
  const want: Kind = m > f ? "master" : "fighter";
  if (hasAny(want)) return want;
  return want === "fighter" ? "master" : "fighter";
}

/** The unit the page opens: the one most students here in that grade are on now (in that kind), else the first. */
export function firstUnit<T extends U>(views: readonly View[], list: readonly T[], kind: Kind): T | null {
  let best: T | null = null;
  let most = 0;
  for (const u of list) {
    const n = views.filter((v) => v.where !== "absent" && v.s.unitId === u._id && v.s.stage === kind).length;
    if (n > most) {
      most = n;
      best = u;
    }
  }
  return best ?? list[0] ?? null;
}
