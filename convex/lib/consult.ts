// The Consultation page's counts (5 Nov 2026, his ask: "how many evaluation pending still we have ... and how many we
// have to do today"): what waits for Evaluation and for Theory in one book of a student. The same rules on the server
// (every student's total: consult.totals) and on the phones (the students here: src/consultData.ts).

import type { Fighter } from "./book";
import type { MState, MStatus } from "./master";
import type { Marks, Status } from "./status";

/** What a Consultation pill counts: questions to explain (Evaluation) or to teach (Theory). */
export type ConsultKind = "evaluation" | "theory";

/** Questions waiting to be explained in this book: wrong answers (theory book) or lost marks (workbook). */
export function evalWaiting(st: Status | null, ms: MStatus | null): number[] {
  return st ? st.pending : ms ? ms.pending : [];
}

/** A teacher question still to teach: not taught, not skipped. */
export const toTeach = (marks: Marks, q: number) => {
  const s = marks[String(q)]?.s;
  return s !== "taught" && s !== "skip";
};

/**
 * What waits for Theory in this book. A workbook: the questions sent to Theory, and the whole unit when it was asked
 * for. A theory book: the teacher questions of his next section, in his book now only (as on the Theory page: a book
 * given to him gets its theory when he moves on to it).
 */
export function theoryWaiting(o: {
  st: Status | null;
  f: Fighter | null;
  marks: Marks;
  ms: MStatus | null;
  bookNow: boolean;
}): { qs: number[]; whole: boolean } {
  if (o.ms) return { qs: [...o.ms.theory], whole: o.ms.wholeUnit };
  if (o.st && o.f && o.bookNow && o.st.nextTheory) {
    const sec = o.f.sectionById(o.st.nextTheory);
    return { qs: (sec?.teach ?? []).filter((q) => toTeach(o.marks, q)), whole: false };
  }
  return { qs: [], whole: false };
}

/** How many things wait for Theory: each question, and the whole unit as one. */
export const theoryCount = (w: { qs: readonly number[]; whole: boolean }) => w.qs.length + (w.whole ? 1 : 0);

/**
 * The Consultation's three filters for wrong questions (12 Nov 2026, his voice note: "All ... even if corrected at the
 * moment right now ... the past filter ... only show today's ... always need to be no pending of today's wrong
 * question"). All = every wrong question (also a level Correction is marking now, not saved yet); Past = corrected
 * before today; Today = corrected today (and the levels being marked now).
 */
export type EvalShow = "all" | "past" | "today";
export const EVAL_SHOWS: readonly EvalShow[] = ["all", "past", "today"];

/** When a waiting question was marked wrong: a workbook's row, a theory book's circle (0 = not known: the past). */
export function wrongAt(q: number, marks: Marks, m: MState | null): number {
  return (m ? m.q[String(q)]?.t : marks[String(q)]?.t) ?? 0;
}

/** A question marked wrong at `at` belongs in this filter (`dayStart` = midnight in Sri Lanka today). */
export function inShow(show: EvalShow, at: number, dayStart: number): boolean {
  return show === "all" || (show === "today" ? at >= dayStart : at < dayStart);
}
