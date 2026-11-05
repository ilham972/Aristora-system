// The Consultation page's counts (5 Nov 2026, his ask: "how many evaluation pending still we have ... and how many we
// have to do today"): what waits for Evaluation and for Theory in one book of a student. The same rules on the server
// (every student's total: consult.totals) and on the phones (the students here: src/consultData.ts).

import type { Fighter } from "./book";
import type { MStatus } from "./master";
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
