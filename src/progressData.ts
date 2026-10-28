// The Progress page's lists, from the server's summary of one grade (convex/progress.ts). No screen code here: the
// page and the poster both draw from these, so what parents see is exactly what the owner sees.
//
// Units view = a race per unit: everyone on the same unit and stage, ranked by how far he is (levels done, then
// marks, then pace). Term view = every student against every unit of the term: done / partway / not started.

import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";
import { pace, ranks, type FCell, type MCell } from "../convex/lib/progress";
import { STAGES, type Stage } from "./store";

export type PBoard = FunctionReturnType<typeof api.progress.board>;
export type PUnit = PBoard["units"][number];
export type PStudent = PBoard["students"][number];
export type StageFilter = "all" | Stage;

export type LaneRow = {
  s: PStudent;
  /** 1 = furthest; equal places share a rank. Null where nothing is measured (whole papers, no book). */
  rank: number | null;
  kind: "m" | "f" | "none";
  /** Levels done (workbook) or solo questions done (theory book), out of `of`. */
  done: number;
  of: number;
  /** Workbook: marks so far, %. Theory book: how much of the book is done, %. */
  pct: number | null;
  today: number;
  /** Per class day. */
  pace: number | null;
  m?: MCell;
  f?: FCell;
};

export type Lane = {
  key: string;
  stage: Stage | null;
  unit: PUnit | null;
  rows: LaneRow[];
  /** Why nothing is measured here. */
  note?: string;
};

const STAGE_RANK: Record<string, number> = { fighter: 0, master: 1, legend: 2, sprint: 3 };

export function stageOrder(s: Stage | null): number {
  return s ? STAGE_RANK[s] : -1;
}

export type Filter = { stage: StageFilter; todayOnly: boolean };

export function filtered(b: PBoard, f: Filter): PStudent[] {
  return b.students.filter(
    (s) => (f.stage === "all" || s.stage === f.stage) && (!f.todayOnly || s.cameToday),
  );
}

/** One lane per unit and stage everyone is on now, in the book's order; each lane ranked. */
export function buildLanes(b: PBoard, f: Filter): Lane[] {
  const unitOf = new Map(b.units.map((u) => [u._id as string, u]));
  const lanes = new Map<string, Lane>();
  for (const s of filtered(b, f)) {
    const stage = (s.stage as Stage | null) ?? null;
    const book = stage === "fighter" || stage === "master";
    const unit = book && s.unitId ? (unitOf.get(s.unitId) ?? null) : null;
    const key = book ? `${stage}:${s.unitId ?? "-"}` : `${stage ?? "none"}`;
    const lane = lanes.get(key) ?? { key, stage, unit, rows: [] };
    const cell = s.unitId ? s.cells[s.unitId] : undefined;
    let row: LaneRow;
    if (stage === "master" && cell?.m) {
      const m = cell.m;
      row = { s, rank: null, kind: "m", done: m.done, of: m.levels, pct: m.pct, today: m.today, pace: pace(m.done, m.days), m };
    } else if (stage === "fighter" && cell?.f) {
      const x = cell.f;
      const pct = x.total ? Math.round((x.done / x.total) * 100) : null;
      row = { s, rank: null, kind: "f", done: x.done, of: x.total, pct, today: x.today, pace: pace(x.done, x.days), f: x };
    } else if (stage === "master" && unit?.master) {
      // On a unit with its workbook, nothing done yet: last in the race, not left out.
      row = { s, rank: null, kind: "m", done: 0, of: unit.master.levels, pct: null, today: 0, pace: null };
    } else if (stage === "fighter" && unit?.fighter) {
      row = { s, rank: null, kind: "f", done: 0, of: unit.fighter.solo, pct: 0, today: 0, pace: null };
    } else {
      row = { s, rank: null, kind: "none", done: 0, of: 0, pct: null, today: 0, pace: null };
      if (book) lane.note = "No book in the app yet";
      else if (stage === "legend" || stage === "sprint") lane.note = "Full papers on paper for now";
      else lane.note = "No stage yet";
    }
    lane.rows.push(row);
    lanes.set(key, lane);
  }
  for (const lane of lanes.values()) {
    const measured = lane.rows.filter((r) => r.kind !== "none");
    const score = (r: LaneRow) => (r.kind === "m" ? [r.done, r.pct ?? -1, r.pace ?? 0] : [r.done, r.pace ?? 0]);
    const rk = ranks(measured.map(score));
    measured.forEach((r, i) => (r.rank = rk[i]));
    lane.rows.sort(
      (a, b) =>
        (a.rank ?? 1e9) - (b.rank ?? 1e9) || a.s.name.localeCompare(b.s.name),
    );
  }
  return [...lanes.values()].sort(
    (a, b) =>
      stageOrder(a.stage) - stageOrder(b.stage) ||
      (a.unit?.order ?? 1e9) - (b.unit?.order ?? 1e9) ||
      a.key.localeCompare(b.key),
  );
}

export type TermCell = {
  unit: PUnit;
  /** The furthest book he reached in this unit: workbook (m), theory book (f), or none. */
  kind: "m" | "f" | "none";
  /** How much of it, 0..1. */
  frac: number;
  finished: boolean;
  /** The unit he works on now. */
  current: boolean;
  /** For a tap: "U04 · Master: 3 of 12 levels, 85%". */
  words: string;
};

export type TermRow = {
  s: PStudent;
  cells: TermCell[];
  /** Workbook levels done ÷ all the term's workbook levels (null: no workbooks this term). */
  mPct: number | null;
  /** Theory-book questions done ÷ all the term's theory-book questions. */
  fPct: number | null;
  /** Units finished (workbook all corrected). */
  finished: number;
};

/** The most common term among these students (the grade's term now), else the given fallback. */
export function usualTerm(students: PStudent[], fallback: number): number {
  const n = new Map<number, number>();
  for (const s of students) if (s.term) n.set(s.term, (n.get(s.term) ?? 0) + 1);
  let best = fallback;
  let max = 0;
  for (const [t, c] of n) if (c > max || (c === max && t < best)) [best, max] = [t, c];
  return best;
}

export function buildTerm(b: PBoard, term: number, f: Filter): { units: PUnit[]; rows: TermRow[] } {
  const units = b.units.filter((u) => u.term === term);
  const mTotal = units.reduce((a, u) => a + (u.master?.levels ?? 0), 0);
  const fTotal = units.reduce((a, u) => a + (u.fighter?.solo ?? 0), 0);
  const rows: TermRow[] = filtered(b, f).map((s) => {
    let mDone = 0;
    let fDone = 0;
    let finished = 0;
    const cells = units.map((u): TermCell => {
      const c = s.cells[u._id];
      const current = s.unitId === u._id && (s.stage === "fighter" || s.stage === "master");
      if (c?.m) mDone += c.m.done;
      if (c?.f) fDone += c.f.done;
      if (c?.m?.finished) finished++;
      if (c?.m && (c.m.done > 0 || !c.f)) {
        const m = c.m;
        const marks = m.pct !== null ? `, ${m.pct}%` : "";
        return {
          unit: u,
          kind: "m",
          frac: m.levels ? m.done / m.levels : 0,
          finished: m.finished,
          current,
          words: `${u.code} · Master: ${m.finished ? "finished" : `${m.done} of ${m.levels} levels`}${marks}`,
        };
      }
      if (c?.f) {
        const x = c.f;
        return {
          unit: u,
          kind: "f",
          frac: x.total ? x.done / x.total : 0,
          finished: x.finished,
          current,
          words: `${u.code} · Fighter: ${x.finished ? "finished" : `${x.done} of ${x.total} questions`}`,
        };
      }
      return { unit: u, kind: "none", frac: 0, finished: false, current, words: `${u.code} · not started` };
    });
    return {
      s,
      cells,
      mPct: mTotal ? Math.round((mDone / mTotal) * 100) : null,
      fPct: fTotal ? Math.round((fDone / fTotal) * 100) : null,
      finished,
    };
  });
  rows.sort(
    (a, b) =>
      stageOrder(b.s.stage as Stage | null) - stageOrder(a.s.stage as Stage | null) ||
      (b.mPct ?? -1) - (a.mPct ?? -1) ||
      (b.fPct ?? -1) - (a.fPct ?? -1) ||
      a.s.name.localeCompare(b.s.name),
  );
  return { units, rows };
}

/** How many students per stage (for the filter chips), in stage order. */
export function stageCounts(b: PBoard, todayOnly: boolean): { id: Stage; name: string; n: number }[] {
  return STAGES.map((st) => ({
    id: st.id,
    name: st.name,
    n: b.students.filter((s) => s.stage === st.id && (!todayOnly || s.cameToday)).length,
  })).filter((x) => x.n > 0);
}

/** The grade's day in numbers (the poster's top strip). */
export function dayTotals(b: PBoard): { came: number; of: number; levels: number; questions: number } {
  let levels = 0;
  let questions = 0;
  for (const s of b.students) {
    for (const c of Object.values(s.cells)) {
      levels += c.m?.today ?? 0;
      questions += c.f?.today ?? 0;
    }
  }
  return { came: b.students.filter((s) => s.cameToday).length, of: b.students.length, levels, questions };
}
