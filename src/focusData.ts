// The Focus tab's lists and rules: one person corrects, one question at a time, workbooks (Master: marks per
// question, saved per level) and theory books (Fighter: right / wrong / slip, saved per question).
// No screens here (src/focus.tsx draws them), so every rule can be tested on its own.
//
// The two mistakes it is built against:
// - marks on the wrong question: one question on screen at a time, its number huge, its answer beside it, every
//   question needs its own tap (full marks is one tap, never "untouched = full"), and a tap right after the screen
//   moves on is ignored (a double tap can't mark the next question);
// - marks on the wrong student: names A–Z that never move (tiny pills on top, the open one dark), the name huge over
//   the paper, and a saved level can be taken back for 30 minutes, its marks moving to the right student.
// A workbook level marked part of the way is kept on the server as a draft (convex/focus.ts) until it is saved.
// Since 30 Oct 2026 Focus is one page: the names stay on top while a paper is open; tapping another name keeps every
// mark (a level marked to the end saves itself); the level opens by itself (a draft, else the oldest handed in, else
// the one he is on) and the next level opens after each save; any level can be opened from the level bar.

import { levelOutOf, type MasterLevel } from "../convex/lib/book";
import type { KeyAnswer, KeyPart } from "../convex/lib/key";
import type { MLevel, MQ, MState } from "../convex/lib/master";
import { waitingAll, type View } from "./derive";

/** How long after the screen moves on a tap is ignored (a double tap must not mark the next question). */
export const TAP_GUARD_MS = 350;
/** How long a saved level can be taken back (the server says the same: workbook.uncorrect). */
export const TAKE_BACK_MS = 30 * 60_000;
/** Marks taken back wait this long for the right student's name. */
export const CARRY_MS = 10 * 60_000;

const byName = (a: View, b: View) => a.s.name.localeCompare(b.s.name, undefined, { sensitivity: "base" });

/** How a name pill looks: what waits for the corrector there. */
export type PillTone =
  /** Nothing to do until his handed-in level is corrected. */
  | "red"
  /** A level handed in, waiting. */
  | "amber"
  /** Theory book with questions to mark. */
  | "th"
  /** No book in the app for his stage and unit (or Legend, Exam Sprint): tap to choose his unit. */
  | "nb"
  /** Gone home with handed-in levels. */
  | "home"
  | "";

export type Pill = { v: View; tone: PillTone; waiting: number };

/**
 * The name pills, in a fixed order (names never move under the finger): by grade, everyone signed in A–Z, then those
 * gone home with handed-in levels still to correct (their papers stayed). Every stage: the corrector may have to
 * change a student's unit or stage (his paper is from another unit).
 */
export function focusPills(views: View[]): Pill[] {
  const here: View[] = [];
  const gone: View[] = [];
  for (const v of views) {
    if (v.where !== "absent") here.push(v);
    else if (v.ms?.waiting.length) gone.push(v);
  }
  const pill = (v: View): Pill => {
    const waiting = waitingAll(v); // in all his books (he works on several at once)
    let tone: PillTone = "";
    if (v.where === "absent") tone = "home";
    else if (v.kind === "none" && !waiting) tone = "nb";
    else if (v.noWork && v.ms?.needs.includes("correction")) tone = "red";
    else if (waiting) tone = "amber";
    else if (v.st?.doable.length) tone = "th";
    return { v, tone, waiting };
  };
  const byGrade = (a: View, b: View) => (a.s.grade ?? 99) - (b.s.grade ?? 99);
  const order = (a: View, b: View) => byGrade(a, b) || Number(a.where === "absent") - Number(b.where === "absent") || byName(a, b);
  return [...here, ...gone].sort(order).map(pill);
}

/**
 * The grade whose names show (one grade at a time, one line, + first to sign its students in): the one chosen on this
 * phone, while that grade has students at all (even if none is in yet: + is how they come in); else the youngest
 * grade with someone in, else the youngest grade with students; null when there are no students.
 */
export function focusGrade(chosen: number | null, here: number[], all: number[]): number | null {
  if (chosen !== null && all.includes(chosen)) return chosen;
  if (here.length) return Math.min(...here);
  return all.length ? Math.min(...all) : null;
}

/** Red and amber per grade (what waits for the corrector there): the badges on the fixed grade pills 6–11. */
export function gradeNeeds(pills: Pill[], needs: Map<string, "red" | "amber">): Map<number, { red: number; amber: number }> {
  const out = new Map<number, { red: number; amber: number }>();
  for (const p of pills) {
    const g = p.v.s.grade;
    if (typeof g !== "number") continue;
    const c = out.get(g) ?? { red: 0, amber: 0 };
    const n = needs.get(p.v.s._id);
    if (n === "red") c.red++;
    else if (n === "amber") c.amber++;
    out.set(g, c);
  }
  return out;
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

/**
 * One question's mark on this phone: g marks, or "?" (dk: he couldn't start it, 0 marks, straight to Theory). With
 * dkp, only those parts were left blank: the parts he answered keep their marks (g), and it still goes to Theory.
 */
export type Given = { g: number; dk?: boolean; dkp?: string[] };

/** The marks a question counts for: 0 for a whole "?", else g (a part left blank counts 0 inside g). */
export const marksOf = (g: Given | undefined) => (!g ? 0 : g.dk && !g.dkp ? 0 : g.g);

/** After a question is marked: the next one not marked yet (after it, then from the start), or the summary. */
export function nextIndex(qs: number[], given: Record<number, Given>, from: number): number {
  for (let i = from + 1; i < qs.length; i++) if (!given[qs[i]]) return i;
  for (let i = 0; i <= from && i < qs.length; i++) if (!given[qs[i]]) return i;
  return qs.length;
}

/** The level's marks so far. */
export function sumOf(qs: number[], given: Record<number, Given>): number {
  return qs.reduce((a, q) => a + marksOf(given[q]), 0);
}

/**
 * Where the level's lost marks go: Evaluation, unless the corrector picks Theory (since 30 Oct 2026: a level under half
 * no longer goes to Theory by itself; those students vanished from the Evaluation page). "?" always goes to Theory.
 */
export function routeOf(to: "auto" | "evaluation" | "theory"): "evaluation" | "theory" {
  return to === "theory" ? "theory" : "evaluation";
}

/** What the server gets (workbook.correct): every question of the level. */
export function itemsOf(qs: number[], given: Record<number, Given>): { q: number; got: number; dk?: true; dkp?: string[] }[] {
  return qs.map((q) => {
    const g = given[q];
    if (g.dk && g.dkp?.length) return { q, got: g.g, dk: true as const, dkp: [...g.dkp] };
    return g.dk ? { q, got: 0, dk: true as const } : { q, got: g.g };
  });
}

/** "Q15, Q56 (ii)": the questions with a "?", for the summary. */
export function blankWords(qs: number[], given: Record<number, Given>): string {
  return qs
    .filter((q) => given[q]?.dk)
    .map((q) => (given[q].dkp?.length ? `Q${q} (${given[q].dkp!.join(", ")})` : `Q${q}`))
    .join(", ");
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

export type DraftQ = { g: number; dk?: boolean; p?: number[]; dkp?: string[] };
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
    given[Number(k)] = r.dk && r.dkp?.length ? { g: r.g, dk: true, dkp: [...r.dkp] } : r.dk ? { g: 0, dk: true } : { g: r.g };
    if (r.p && (!r.dk || r.dkp?.length)) parts[Number(k)] = [...r.p];
  }
  return { given, parts };
}

// ---- Which level opens (the level bar, one page) ----

const fixedOrPre = (v: View, n: number) => {
  const lv = v.mm.lv[String(n)];
  return !!lv?.fixed || (!!lv?.pre && !lv.done);
};

/**
 * The level his paper opens on: one he was marking (a draft, the latest), else the oldest handed in, else the one he
 * works on now (while he is in class). Null: every level is corrected (or done before the app): the unit's marks.
 */
export function autoLevel(v: View, drafts: readonly Draft[] | null | undefined): MasterLevel | null {
  if (!v.ms || !v.mb) return null;
  const mine = (drafts ?? [])
    .filter((d) => d.studentId === v.s._id && d.unitId === v.s.unitId && !fixedOrPre(v, d.level) && Object.keys(d.q).length)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const fromDraft = mine ? v.mb.levels.find((l) => l.n === mine.level) : undefined;
  if (fromDraft) return fromDraft;
  if (v.ms.waiting.length) return v.ms.waiting[0];
  if (v.ms.current && v.where !== "absent") return v.ms.current;
  return v.mb.levels.find((l) => !fixedOrPre(v, l.n)) ?? null;
}

/**
 * After a level is saved (or handed in): the next level to open, the first after it not corrected (nor done before the
 * app), then one left earlier. `done` = levels the server has just closed (the board may not show them yet). Null:
 * the unit is finished.
 */
export function nextOpen(v: View, n: number, done: number[] = []): MasterLevel | null {
  if (!v.mb) return null;
  const open = (l: MasterLevel) => l.n !== n && !done.includes(l.n) && !fixedOrPre(v, l.n);
  return v.mb.levels.find((l) => l.n > n && open(l)) ?? v.mb.levels.find((l) => l.n < n && open(l)) ?? null;
}

/** Every level corrected or done before the app: the unit's marks are final (Focus shows them). */
export function unitDone(v: View, done: number[] = []): boolean {
  return !!v.mb && v.mb.levels.length > 0 && v.mb.levels.every((l) => done.includes(l.n) || fixedOrPre(v, l.n));
}

/** A level on the level bar. */
export type LevelLook = "fixed" | "waiting" | "draft" | "current" | "pre" | "later";
export function levelLook(v: View, l: MasterLevel, drafts: readonly Draft[] | null | undefined): LevelLook {
  const lv = v.mm.lv[String(l.n)];
  if (lv?.fixed) return "fixed";
  if (draftOf(drafts, v, l.n) && Object.keys(draftOf(drafts, v, l.n)!.q).length) return "draft";
  if (lv?.done) return "waiting";
  if (lv?.pre) return "pre";
  if (v.ms?.current?.n === l.n) return "current";
  return "later";
}

/** A corrected level's marks as a paper shows them (opened again from the level bar, to check or change). */
export function savedGiven(v: View, l: MasterLevel): Record<number, Given> {
  const out: Record<number, Given> = {};
  for (const q of questionsOf(l)) {
    const r = v.mm.q[String(q)];
    if (!r) continue;
    out[q] = r.dk && r.dkp?.length ? { g: r.got ?? 0, dk: true, dkp: [...r.dkp] } : r.dk ? { g: 0, dk: true } : { g: r.got ?? 0 };
  }
  return out;
}

/** Two sets of marks for the same questions are the same (nothing to save after looking at an old level). */
export function sameGiven(qs: number[], a: Record<number, Given>, b: Record<number, Given>): boolean {
  return qs.every((q) => {
    const x = a[q];
    const y = b[q];
    if (!x || !y) return !x && !y;
    return x.g === y.g && !!x.dk === !!y.dk && (x.dkp ?? []).join(",") === (y.dkp ?? []).join(",");
  });
}

/** A unit's number in its grade ("U04" → 4): the corrector picks units by number and Tamil name. */
export function unitNo(code: string): number {
  const n = Number(code.replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

type UnitLike = { _id: string; grade: number; term: number; order: number };

/** After a workbook's last level: the next workbook of that unit's term (in book order), else Legend (whole papers)
 *  after the term's last unit, the same as Class → Move. Nothing for a book outside the terms (term 0). */
export function nextBook<U extends UnitLike>(units: U[], unit: U | null | undefined): { stage: "master" | "legend"; unit: U } | null {
  if (!unit || !unit.term) return null;
  const list = units.filter((u) => u.grade === unit.grade && u.term === unit.term).sort((a, b) => a.order - b.order);
  const i = list.findIndex((u) => u._id === unit._id);
  if (i < 0) return null;
  return i + 1 < list.length ? { stage: "master", unit: list[i + 1] } : { stage: "legend", unit };
}

/** Where a paper opens: the first question not marked yet, or the level's marks when every one is. */
export function resumeAt(qs: number[], given: Record<number, Given>): number {
  return nextIndex(qs, given, -1);
}

/** One of his books on Correction's row: which unit and book, the one open now, levels handed in there. */
export type BookPill = { unitId: string; stage: "fighter" | "master"; now: boolean; waiting: number };

/**
 * Correction's row of his books (he works on several at once): his book now, every book given to him that he hasn't
 * finished, and any other book with a level handed in. One fixed order (unit number, theory book first), so nothing
 * moves under the finger. `no` = a unit's number.
 */
export function booksOf(v: View, no: (unitId: string) => number): BookPill[] {
  const out = new Map<string, BookPill>();
  const put = (unitId: string, stage: "fighter" | "master", now: boolean, waiting: number) => {
    const had = out.get(`${unitId}:${stage}`);
    out.set(`${unitId}:${stage}`, { unitId, stage, now: now || !!had?.now, waiting: Math.max(waiting, had?.waiting ?? 0) });
  };
  if (v.unit && (v.stage === "fighter" || v.stage === "master")) put(v.unit._id, v.stage, true, v.ms?.waiting.length ?? 0);
  for (const g of v.given) if (!g.done) put(g.unitId, g.stage, false, 0);
  for (const b of v.others) if (b.unit && b.stage === "master" && b.ms?.waiting.length) put(b.unit._id, "master", false, b.ms.waiting.length);
  return [...out.values()].sort((a, b) => no(a.unitId) - no(b.unitId) || Number(a.stage === "master") - Number(b.stage === "master"));
}

/** Pills: what waits for the corrector, student by student (red: he has nothing to do until it's corrected). */
export function focusNeeds(views: View[]): Map<string, "red" | "amber"> {
  const out = new Map<string, "red" | "amber">();
  for (const v of views) {
    if (v.where !== "absent" && v.noWork && v.ms?.needs.includes("correction")) out.set(v.s._id, "red");
    else if (waitingAll(v)) out.set(v.s._id, "amber");
  }
  return out;
}
