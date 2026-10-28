// The Focus tab's lists and rules: one person corrects, one question at a time, workbooks (Master: marks per
// question, saved per level) and theory books (Fighter: right / wrong / slip, saved per question).
// No screens here (src/focus.tsx draws them), so every rule can be tested on its own.
//
// The two mistakes it is built against:
// - marks on the wrong question: one question on screen at a time, its number huge, its answer beside it, every
//   question needs its own tap (full marks is one tap, never "untouched = full"), and a tap right after the screen
//   moves on is ignored (a double tap can't mark the next question);
// - marks on the wrong student: names A–Z that never move, hidden while a paper is open, the name huge and on the
//   Save button, and a saved level can be taken back for 30 minutes, its marks moving to the right student.
// A workbook level marked part of the way is kept on the server as a draft (convex/focus.ts) until it is saved.

import { levelOutOf, type MasterLevel } from "../convex/lib/book";
import type { KeyAnswer, KeyPart } from "../convex/lib/key";
import type { MLevel, MQ, MState } from "../convex/lib/master";
import type { View } from "./derive";

/** How long after the screen moves on a tap is ignored (a double tap must not mark the next question). */
export const TAP_GUARD_MS = 350;
/** How long a saved level can be taken back (the server says the same: workbook.uncorrect). */
export const TAKE_BACK_MS = 30 * 60_000;
/** Marks taken back wait this long for the right student's name. */
export const CARRY_MS = 10 * 60_000;

export type FocusLists = {
  /** In class (hall or a room) with something to mark: a workbook level, or theory-book questions he can do. A–Z. */
  here: View[];
  /** Gone home today with handed-in workbook levels still to correct: A–Z. */
  gone: View[];
  /** In class, but his unit's book isn't in the app yet. */
  noBook: View[];
  /** In class with a book, but nothing to mark now (waits for Theory or Evaluation, or finished). */
  nothing: View[];
};

const byName = (a: View, b: View) => a.s.name.localeCompare(b.s.name, undefined, { sensitivity: "base" });

/** Who the Focus tab offers, in a fixed order (names never move under the finger). */
export function focusLists(views: View[]): FocusLists {
  const here: View[] = [];
  const gone: View[] = [];
  const noBook: View[] = [];
  const nothing: View[] = [];
  for (const v of views) {
    const present = v.where !== "absent";
    if (v.s.stage === "fighter") {
      if (!present) continue; // his notebook went home with him
      if (!v.st || !v.f) noBook.push(v);
      else if (v.st.doable.length) here.push(v);
      else nothing.push(v);
      continue;
    }
    if (v.s.stage !== "master") continue; // Legend, Exam Sprint: full papers on paper for now
    if (!v.ms || !v.mb) {
      if (present) noBook.push(v);
      continue;
    }
    if (present) {
      if (candidates(v).length) here.push(v);
      else nothing.push(v);
    } else if (v.ms.waiting.length) gone.push(v);
  }
  return { here: here.sort(byName), gone: gone.sort(byName), noBook: noBook.sort(byName), nothing: nothing.sort(byName) };
}

/** Why there is nothing to mark for him now, in a few words. */
export function nothingWhy(v: View): string {
  const need = v.st?.needs ?? v.ms?.needs ?? [];
  if (v.st?.finished || v.ms?.finished) return "finished";
  if (v.st && need.includes("theory")) return `waits for ${v.st.nextTheory} theory`;
  if (need.includes("theory")) return "waits for Theory";
  if (need.includes("evaluation")) return "waits for Evaluation";
  return "nothing open";
}

/**
 * The levels his paper can be: handed in and waiting (oldest first), then the one he works on now (only while he
 * is in class). One = it opens at once; two or more = the corrector must say which (the question numbers decide).
 */
export function candidates(v: View): MasterLevel[] {
  const ms = v.ms;
  if (!ms) return [];
  const out = [...ms.waiting];
  if (v.where !== "absent" && ms.current && !out.some((l) => l.n === ms.current!.n)) out.push(ms.current);
  return out;
}

/** Every level not corrected yet, in book order ("Other level" when the paper is none of the usual ones). */
export function openLevels(v: View): MasterLevel[] {
  if (!v.mb) return [];
  return v.mb.levels.filter((l) => !v.mm.lv[String(l.n)]?.fixed);
}

/** The question numbers of a level, in order. */
export function questionsOf(l: MasterLevel): number[] {
  return Array.from({ length: l.to - l.from + 1 }, (_, i) => l.from + i);
}

/** Each question's marks of this level, or null when the workbook doesn't say (then: the Correction tab). */
export function marksOfLevel(v: View, l: MasterLevel): number[] | null {
  return v.mb ? levelOutOf(v.mb, l) : null;
}

/**
 * A Part II answer's parts, when each part has its marks and they add up to the question's marks: then the
 * corrector taps only the wrong part and the phone adds up (no sums in his head). Otherwise null.
 */
export function markedParts(k: KeyAnswer | undefined, max: number): KeyPart[] | null {
  const parts = k?.parts;
  if (!parts || parts.length < 2) return null;
  if (!parts.every((p) => typeof p.m === "number" && Number.isInteger(p.m) && p.m >= 0)) return null;
  return parts.reduce((a, p) => a + (p.m ?? 0), 0) === max ? parts : null;
}

/** One question's mark on this phone: g marks, or "?" (dk: he couldn't start it, 0 marks, straight to Theory). */
export type Given = { g: number; dk?: boolean };

/** After a question is marked: the next one not marked yet (after it, then from the start), or the summary. */
export function nextIndex(qs: number[], given: Record<number, Given>, from: number): number {
  for (let i = from + 1; i < qs.length; i++) if (!given[qs[i]]) return i;
  for (let i = 0; i <= from && i < qs.length; i++) if (!given[qs[i]]) return i;
  return qs.length;
}

/** The level's marks so far. */
export function sumOf(qs: number[], given: Record<number, Given>): number {
  return qs.reduce((a, q) => a + (given[q]?.dk ? 0 : (given[q]?.g ?? 0)), 0);
}

/** Where the level's lost marks go, as on the Correction tab: Theory when the level is under half, else Evaluation. */
export function routeOf(sum: number, max: number, to: "auto" | "evaluation" | "theory"): "evaluation" | "theory" {
  if (to !== "auto") return to;
  return max > 0 && Math.round((sum / max) * 100) < 50 ? "theory" : "evaluation";
}

/** What the server gets (workbook.correct): every question of the level. */
export function itemsOf(qs: number[], given: Record<number, Given>): { q: number; got: number; dk?: true }[] {
  return qs.map((q) => (given[q].dk ? { q, got: 0, dk: true as const } : { q, got: given[q].g }));
}

/** The level and its questions as they were before a save: what Take back puts back. */
export type Before = { lv?: MLevel; q: Record<string, MQ> };
export function beforeOf(mm: MState, l: MasterLevel): Before {
  const q: Record<string, MQ> = {};
  for (let n = l.from; n <= l.to; n++) {
    const r = mm.q[String(n)];
    if (r) q[String(n)] = { ...r };
  }
  const lv = mm.lv[String(l.n)];
  return lv ? { lv: { ...lv }, q } : { q };
}

/** Marks taken back from one student, waiting for the right one (the same unit and the same questions). */
export type Carry = {
  unitId: string;
  from: number;
  to: number;
  given: Record<number, Given>;
  /** Part marks tapped on Part II questions (shown again as they were). */
  parts?: Record<number, number[]>;
  fromName: string;
  at: number;
};

/** The level of this student the carried marks fit, if any: same workbook, same questions, one he can hand in. */
export function carryLevel(c: Carry | null, v: View, now: number): MasterLevel | null {
  if (!c || now - c.at > CARRY_MS || v.s.unitId !== c.unitId) return null;
  return candidates(v).find((l) => l.from === c.from && l.to === c.to) ?? openLevels(v).find((l) => l.from === c.from && l.to === c.to) ?? null;
}

// ---- Theory books (Fighter): questions in book order, right / wrong / slip ----

/**
 * The questions to mark for a theory-book student, in book order: what he can do now (redo ones included). The paper
 * keeps this list while it is open; questions that open meanwhile (past papers after the ladder) join at the end.
 */
export function fighterQueue(v: View): number[] {
  return v.st ? [...v.st.doable] : [];
}
export function extendQueue(qs: number[], doable: number[]): number[] {
  const last = qs.length ? qs[qs.length - 1] : 0;
  const extra = doable.filter((q) => q > last && !qs.includes(q));
  return extra.length ? [...qs, ...extra] : qs;
}

// ---- Workbook drafts (convex/focus.ts): a level marked part of the way ----

export type DraftQ = { g: number; dk?: boolean; p?: number[] };
export type Draft = { studentId: string; unitId: string; level: number; q: Record<string, DraftQ>; updatedAt: number; by?: string };

/** His draft for a level while it still counts: the same workbook, the level not corrected yet. */
export function draftOf(drafts: readonly Draft[] | null | undefined, v: View, level: number): Draft | null {
  if (!drafts || !v.mb || v.mm.lv[String(level)]?.fixed) return null;
  return drafts.find((d) => d.studentId === v.s._id && d.unitId === v.s.unitId && d.level === level) ?? null;
}

/** A draft's marks as a paper keeps them. */
export function fromDraft(d: Draft | null): { given: Record<number, Given>; parts: Record<number, number[]> } {
  const given: Record<number, Given> = {};
  const parts: Record<number, number[]> = {};
  for (const [k, r] of Object.entries(d?.q ?? {})) {
    given[Number(k)] = r.dk ? { g: 0, dk: true } : { g: r.g };
    if (r.p && !r.dk) parts[Number(k)] = [...r.p];
  }
  return { given, parts };
}

/** Where a paper opens: the first question not marked yet, or the level's marks when every one is. */
export function resumeAt(qs: number[], given: Record<number, Given>): number {
  return nextIndex(qs, given, -1);
}

/** Pills: what waits for the corrector, student by student (red: he has nothing to do until it's corrected). */
export function focusNeeds(views: View[]): Map<string, "red" | "amber"> {
  const out = new Map<string, "red" | "amber">();
  for (const v of views) {
    if (!v.ms) continue;
    if (v.where !== "absent" && v.ms.dry && v.ms.needs.includes("correction")) out.set(v.s._id, "red");
    else if (v.ms.waiting.length) out.set(v.s._id, "amber");
  }
  return out;
}
