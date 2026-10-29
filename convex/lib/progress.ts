// The Progress page: where every student of a grade stands in every unit (theory book and workbook), how fast he
// moves, and what he did today. Pure functions shared by the server (which reads the books once) and the phones
// (which rank, filter and draw the poster).
//
// Speed is per class day, not per calendar day: students come on the days that suit them. A class day on a unit =
// a day he came (attendance) since he started it, or a day something of his was handed in or marked on it.

import { slDay } from "./day";
import type { Fighter, MasterData } from "./book";
import { computeMaster, type MState } from "./master";
import { computeStatus, type Marks } from "./status";

/** A theory book (Fighter): solo questions done (right, or skipped by Theory) out of all solo questions. */
export interface FCell {
  done: number;
  total: number;
  finished: boolean;
  /** Solo questions right today. */
  today: number;
  /** Class days on this book. */
  days: number;
  last: number | null;
}

/** A workbook (Master): levels done (handed in or corrected) out of its levels, and the marks so far. */
export interface MCell {
  done: number;
  corrected: number;
  levels: number;
  /** The level he works on now, or null when every level is done. */
  current: number | null;
  /** Each level's marks as a percentage once corrected; null = not corrected yet. */
  marks: (number | null)[];
  /** Levels handed in and not corrected yet. */
  waiting: number[];
  /** Marks of the corrected levels. */
  got: number;
  max: number;
  pct: number | null;
  finished: boolean;
  /** Levels handed in (or corrected) today. */
  today: number;
  days: number;
  last: number | null;
}

export interface Cell {
  f?: FCell;
  m?: MCell;
}

/** Days he came (attendance) between two days, inclusive: "2026-10-28" strings compare in order. */
export function daysBetween(visitDays: Iterable<string>, from: string, to: string): Set<string> {
  const out = new Set<string>();
  for (const d of visitDays) if (d >= from && d <= to) out.add(d);
  return out;
}

export function summarizeMaster(m: MState, book: MasterData, today: string, visitDays: Set<string>): MCell {
  const st = computeMaster(m, book);
  const days = new Set(visitDays);
  let done = 0;
  let todayN = 0;
  let last: number | null = null;
  const seen = (t: number | undefined) => {
    if (!t) return;
    days.add(slDay(t));
    if (last === null || t > last) last = t;
  };
  const marks: (number | null)[] = [];
  for (const l of book.levels) {
    const lv = m.lv[String(l.n)];
    const at = lv?.done ?? lv?.fixed;
    if (at) {
      done++;
      if (slDay(at) === today) todayN++;
    } else if (lv?.pre) done++; // done on paper before the app: done, but not today's work
    seen(lv?.done);
    seen(lv?.fixed);
    marks.push(lv?.fixed ? (st.byLevel[String(l.n)]?.pct ?? 100) : null);
  }
  for (const r of Object.values(m.q)) seen(r?.t);
  return {
    done,
    corrected: st.corrected,
    levels: book.levels.length,
    current: st.current?.n ?? null,
    marks,
    waiting: st.waiting.map((l) => l.n),
    got: st.sofar.got,
    max: st.sofar.max,
    pct: st.sofar.pct,
    finished: st.finished,
    today: todayN,
    days: days.size,
    last,
  };
}

export function summarizeFighter(marks: Marks, f: Fighter, today: string, visitDays: Set<string>): FCell {
  const days = new Set(visitDays);
  let done = 0;
  let total = 0;
  let todayN = 0;
  let last: number | null = null;
  for (const sec of f.sections) {
    for (const q of sec.solo) {
      total++;
      const mk = marks[String(q)];
      if (mk?.s === "right" || mk?.s === "skip") done++;
      if (mk?.s === "right" && slDay(mk.t) === today) todayN++;
    }
  }
  for (const mk of Object.values(marks)) {
    if (!mk) continue;
    days.add(slDay(mk.t));
    if (last === null || mk.t > last) last = mk.t;
  }
  return { done, total, finished: computeStatus(marks, f).finished, today: todayN, days: days.size, last };
}

/** Levels (or questions) per class day, one decimal; null before his first class day. */
export function pace(done: number, days: number): number | null {
  if (days <= 0) return null;
  return Math.round((done / days) * 10) / 10;
}

/** Ranks from scores, best first, equal scores share a rank (1, 2, 2, 4). Scores compare left to right. */
export function ranks(scores: number[][]): number[] {
  const order = scores.map((s, i) => ({ s, i })).sort((a, b) => cmp(b.s, a.s));
  const out = new Array<number>(scores.length);
  order.forEach((x, k) => {
    out[x.i] = k > 0 && cmp(x.s, order[k - 1].s) === 0 ? out[order[k - 1].i] : k + 1;
  });
  return out;
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}
