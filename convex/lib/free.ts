// Free marks for a question out of the syllabus (5 Nov 2026, his ask: "they can't done by students because I
// collected these questions from past papers ... instead removing the question, we have to make that as a all marks
// question ... we are giving free marks for that without doing"). The printed book keeps it (its numbers stay), the
// owner marks it in his Preview (`preview.setFree`), and everyone gets its marks: a level marked already gets them at
// once (his answer: "them too"), a level marked later gets them when it is (the phone's Check, the corrector's Save:
// his answer "Correction too"). The marks live in each student's own rows, so XP, the race, reports and the class pages
// all see them without a rule of their own; `fr` keeps what the row was, for when it isn't free any more.
import { outOf, type MasterData } from "./book";
import type { MQ, MState } from "./master";

/** This question is free in this workbook. */
export const isFree = (book: MasterData, q: number): boolean => !!book.free?.includes(q);

/** A free question's row: its full marks; `fr` = the row before (or "none"), kept once. */
export function freeRow(max: number, was: MQ | undefined, now: number): MQ {
  if (was?.fr !== undefined) return { ...was, got: max, max, lost: false };
  return { got: max, max, lost: false, t: was?.t ?? now, fr: was ?? "none" };
}

/**
 * Gives (or takes back) a free question's marks in one student's workbook (`m`, changed in place): only in a level
 * marked already, its total with it. False = nothing to change (a level not marked yet gets them when it is).
 */
export function setFreeIn(m: MState, book: MasterData, q: number, free: boolean, now: number): boolean {
  const l = book.levels.find((x) => q >= x.from && q <= x.to);
  const max = outOf(book, q);
  const lv = l ? m.lv[String(l.n)] : undefined;
  if (!l || max === null || !lv?.fixed) return false;
  const key = String(q);
  const r = m.q[key];
  if (free) {
    if (r?.fr !== undefined) return false;
    // A part a teacher hadn't marked yet (his photo) counted nothing in the level's total.
    m.q[key] = freeRow(max, r, now);
    lv.got = Math.min(l.max, (lv.got ?? 0) + max - (r?.got ?? 0));
    return true;
  }
  if (r?.fr === undefined) return false;
  const back = r.fr === "none" ? undefined : r.fr;
  if (back) m.q[key] = back;
  else delete m.q[key];
  lv.got = Math.max(0, (lv.got ?? 0) - (max - (back?.got ?? 0)));
  return true;
}
