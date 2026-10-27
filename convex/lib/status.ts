// The rules engine. Pure functions, shared by the backend (idle tracking)
// and the phone screens (queues, colours), so both always agree.

import type { Fighter, SectionData } from "./book";

export type TeachState = "taught" | "skip";
export type SoloState = "right" | "wrong" | "slip" | "explained" | "skip";
export type MarkState = TeachState | SoloState;

export const TEACH_STATES: readonly TeachState[] = ["taught", "skip"];
export const SOLO_STATES: readonly SoloState[] = ["right", "wrong", "slip", "explained", "skip"];

/** One circle's state. n = how many times it was marked wrong; t = last change. */
export interface Mark {
  s: MarkState;
  n?: number;
  t: number;
}
export type Marks = Record<string, Mark | undefined>;

/** R7: this many wrong answers waiting in one section stops that section's ladder. */
export const BLOCK_AFTER = 3;
/** R8: a question marked wrong this many times is "stuck". */
export const STUCK_AFTER = 2;
/** Theory warning (amber) when this many questions or fewer are left. */
export const AMBER_AT = 2;
/** R5: a wrong answer is ready for evaluation after this long. */
export const EVAL_READY_MS = 10 * 60_000;
/** R4: no mark for this long while working = "check on him". */
export const QUIET_LADDER_MS = 15 * 60_000;
export const QUIET_PAPERS_MS = 40 * 60_000;
/** R12: a sitting this long asks "Still with him?". */
export const LONG_SITTING_MS = 20 * 60_000;

export type Need = "theory" | "evaluation";

export interface Status {
  /** Questions he can do right now, in book order (includes redo items). */
  doable: number[];
  left: number;
  /** First section whose teacher questions are not all done. */
  nextTheory: string | null;
  /** True when that section's ladder was already started (a re-teach). */
  reteach: boolean;
  /** Wrong answers waiting for the evaluation teacher. */
  pending: number[];
  /** Pending answers that were wrong at least twice. */
  stuck: number[];
  /** Sections stopped because of too many wrong answers. */
  blocked: string[];
  /** Nothing to do and not finished. */
  dry: boolean;
  /** What would give him work again (only when dry). */
  needs: Need[];
  finished: boolean;
  /** "ladder" until the past papers open, then "papers". */
  phase: "ladder" | "papers" | "done";
  pastOpen: boolean;
  finalOpen: boolean;
}

export function markOf(marks: Marks, q: number): Mark | undefined {
  return marks[String(q)];
}

/** Where a student stands in a theory book: what he can do now, what he waits for. */
export function computeStatus(marks: Marks, book: Fighter): Status {
  const SECTIONS = book.sections;
  const LADDER = book.ladder;
  const st = (q: number) => marks[String(q)]?.s;
  const teachDone = (s: SectionData) => s.teach.every((q) => st(q) === "taught" || st(q) === "skip");
  const tried = (q: number) => st(q) !== undefined;
  const isRedo = (q: number) => st(q) === "slip" || st(q) === "explained";

  const pending: number[] = [];
  const stuck: number[] = [];
  const pendingIn: Record<string, number> = {};
  for (const s of SECTIONS) {
    for (const q of s.solo) {
      if (st(q) !== "wrong") continue;
      pending.push(q);
      pendingIn[s.id] = (pendingIn[s.id] ?? 0) + 1;
      if ((marks[String(q)]?.n ?? 0) >= STUCK_AFTER) stuck.push(q);
    }
  }
  const blocked = SECTIONS.filter(
    (s) => s.kind !== "final" && (pendingIn[s.id] ?? 0) >= BLOCK_AFTER,
  ).map((s) => s.id);

  const doable: number[] = [];
  const open = (s: SectionData) => {
    const stopped = blocked.includes(s.id);
    for (const q of s.solo) {
      if (isRedo(q)) doable.push(q);
      else if (!tried(q) && !stopped) doable.push(q);
    }
  };
  for (const s of LADDER) if (teachDone(s)) open(s);
  // R13: past papers open once every ladder question has been tried.
  const pastOpen = LADDER.every((s) => s.solo.every(tried));
  if (pastOpen) for (const s of book.past) open(s);
  const finalOpen = pastOpen && book.past.every((s) => s.solo.every(tried));
  if (finalOpen && book.final) open(book.final);

  const next = LADDER.find((s) => !teachDone(s)) ?? null;
  const finished = SECTIONS.every(
    (s) =>
      s.teach.every((q) => st(q) === "taught" || st(q) === "skip") &&
      s.solo.every((q) => st(q) === "right" || st(q) === "skip"),
  );
  const left = doable.length;
  const dry = !finished && left === 0;
  const needs: Need[] = [];
  if (dry) {
    if (next) needs.push("theory");
    if (pending.length > 0) needs.push("evaluation");
  }
  return {
    doable,
    left,
    nextTheory: next ? next.id : null,
    reteach: next ? next.solo.some(tried) : false,
    pending,
    stuck,
    blocked,
    dry,
    needs,
    finished,
    phase: finished ? "done" : pastOpen ? "papers" : "ladder",
    pastOpen,
    finalOpen,
  };
}

export type Urgency = "red" | "amber" | "green";

/** Theory list colour: red = out of work, amber = 2 or fewer left. */
export function theoryUrgency(s: Status): Urgency {
  if (s.left === 0) return "red";
  if (s.left <= AMBER_AT) return "amber";
  return "green";
}

/** Oldest time among his waiting wrong answers. */
export function oldestPendingAt(marks: Marks, s: Status): number | null {
  let t: number | null = null;
  for (const q of s.pending) {
    const m = marks[String(q)];
    if (m && (t === null || m.t < t)) t = m.t;
  }
  return t;
}

export type EvalUrgency = "red" | "ready" | "wait";

/** Evaluation list colour. Red: stuck, stopped, or nothing else to do. Ready: waited 10 min. */
export function evalUrgency(marks: Marks, s: Status, now: number): EvalUrgency {
  if (s.pending.length === 0) return "wait";
  if (s.stuck.length > 0 || s.blocked.length > 0 || s.dry) return "red";
  const t = oldestPendingAt(marks, s);
  if (t !== null && now - t >= EVAL_READY_MS) return "ready";
  return "wait";
}

/** How long without a mark before we flag "check on him". */
export function quietLimit(s: Status): number {
  return s.phase === "papers" ? QUIET_PAPERS_MS : QUIET_LADDER_MS;
}
