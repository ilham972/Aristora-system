// Master (the past-paper workbook): where a student stands. Pure functions shared by the backend and the phones.
//
// The book is cut into levels (the contents page and the marks box at the end of each level). The student does a
// level alone. When he hands it in, Correction taps "Level done" (the waiting clock starts) and later corrects it,
// or corrects it at once: marks for each question when the workbook knows them, else the level's total and which
// questions lost marks. He goes straight on to the next level. Questions that lost marks wait for the Evaluation
// teacher. The marks table: level marks, part totals, the unit total out of the book's marks, and
// percentage = total × 100 ÷ the book's marks.

import { bookTotal, partOf, type MasterData, type MasterLevel, type PartId } from "./book";
import { EVAL_READY_MS } from "./status";

/** One corrected question. got/max when the workbook knows its marks; lost = it lost marks. x = explained at. */
export interface MQ {
  got?: number;
  max?: number;
  lost: boolean;
  t: number;
  x?: number;
}
/** One level (key = its number): done = handed in (waiting since), fixed = corrected, got = its marks. */
export interface MLevel {
  done?: number;
  fixed?: number;
  by?: string;
  got?: number;
}
export interface MState {
  q: Record<string, MQ>;
  lv: Record<string, MLevel>;
  /** Correction or Evaluation asked Theory to teach this unit again. */
  reteach?: { at: number; by?: string };
}

export const EMPTY_MASTER: MState = { q: {}, lv: {} };

export type MNeed = "correction" | "evaluation";

export interface Score {
  got: number;
  max: number;
  /** got × 100 ÷ max, rounded; null when max is 0. */
  pct: number | null;
}

export interface MStatus {
  levels: MasterLevel[];
  /** The level he works on now (the first one not handed in). */
  current: MasterLevel | null;
  /** Handed in, waiting for correction (oldest first). */
  waiting: MasterLevel[];
  waitingSince: number | null;
  corrected: number;
  /** Question numbers that lost marks and aren't explained yet. */
  pending: number[];
  /** When the oldest of those was corrected. */
  pendingAt: number | null;
  /** The corrected levels: marks got ÷ their marks (how well he does). */
  sofar: Score;
  /** The marks table's line: total ÷ the whole book's marks (the unit's final percentage). */
  unit: Score;
  byPart: Partial<Record<PartId, Score>>;
  byLevel: Record<string, Score>;
  /** Nothing to work on, not finished. */
  dry: boolean;
  needs: MNeed[];
  finished: boolean;
  reteach: boolean;
}

export function score(got: number, max: number): Score {
  return { got, max, pct: max > 0 ? Math.round((got / max) * 100) : null };
}

export function computeMaster(m: MState, book: MasterData): MStatus {
  const levels = book.levels;
  let current: MasterLevel | null = null;
  const waiting: MasterLevel[] = [];
  let corrected = 0;
  const pending: number[] = [];
  let pendingAt: number | null = null;
  let got = 0;
  let max = 0;
  const parts: Partial<Record<PartId, { got: number; max: number }>> = {};
  const byLevel: Record<string, Score> = {};

  for (const l of levels) {
    const s = m.lv[String(l.n)];
    if (!s?.done && !current) current = l;
    if (s?.done && !s.fixed) waiting.push(l);
    if (!s?.fixed) continue;
    corrected++;
    const lg = s.got ?? 0;
    byLevel[String(l.n)] = score(lg, l.max);
    got += lg;
    max += l.max;
    const pid = partOf(book, l.from)?.id;
    if (pid) {
      const p = (parts[pid] ??= { got: 0, max: 0 });
      p.got += lg;
      p.max += l.max;
    }
    for (let q = l.from; q <= l.to; q++) {
      const r = m.q[String(q)];
      if (r?.lost && !r.x) {
        pending.push(q);
        if (pendingAt === null || r.t < pendingAt) pendingAt = r.t;
      }
    }
  }
  waiting.sort((a, b) => (m.lv[String(a.n)]?.done ?? 0) - (m.lv[String(b.n)]?.done ?? 0));
  const waitingSince = waiting.length ? (m.lv[String(waiting[0].n)]?.done ?? null) : null;
  const finished = levels.length > 0 && corrected === levels.length && pending.length === 0;
  const dry = !finished && current === null;
  const needs: MNeed[] = [];
  if (dry) {
    if (waiting.length) needs.push("correction");
    if (pending.length) needs.push("evaluation");
  }
  const byPart: Partial<Record<PartId, Score>> = {};
  for (const [id, v] of Object.entries(parts)) byPart[id as PartId] = score(v!.got, v!.max);
  return {
    levels,
    current,
    waiting,
    waitingSince,
    corrected,
    pending,
    pendingAt,
    sofar: score(got, max),
    unit: score(got, bookTotal(book)),
    byPart,
    byLevel,
    dry,
    needs,
    finished,
    reteach: !!m.reteach,
  };
}

export type MUrgency = "red" | "ready" | "wait";

/** Evaluation list colour for a Master student: red when he has nothing else to do, ready after 10 minutes. */
export function masterEvalUrgency(s: MStatus, now: number): MUrgency {
  if (s.pending.length === 0) return "wait";
  if (s.dry) return "red";
  if (s.pendingAt !== null && now - s.pendingAt >= EVAL_READY_MS) return "ready";
  return "wait";
}

/** Part totals of the whole book (the marks table's "மொத்தம்" column): / 74, / 72 … */
export function partTotals(book: MasterData): Partial<Record<PartId, number>> {
  const out: Partial<Record<PartId, number>> = {};
  for (const l of book.levels) {
    const pid = partOf(book, l.from)?.id;
    if (pid) out[pid] = (out[pid] ?? 0) + l.max;
  }
  return out;
}
