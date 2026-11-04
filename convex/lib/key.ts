// A workbook's answer key: what a teacher sees beside each question while correcting a level.
// - It comes inside the unit's source zip (answer-key.json, written by the workbook engine) and is saved with the
//   workbook upload. It is never put in the code: the repo is public, and these are his books' answers.
// - It lives in its own table (`keys`), not in `books`: the board sends every book in use to every phone on each
//   tap, and a key (about 13 KB a unit) is read only when a teacher opens a level to correct.
// - Only teachers read it. When parents' or students' sites come, they must never get this table.

import { fighter, firstQuestion, outOf, type FighterData, type MasterData } from "./book";
import { boxProblem } from "./phone";

/**
 * One answer box as the book gives it (answer-key.json version 2, 4 Nov 2026): v = the accepted answers as he would
 * type them (the first is the one teachers see); same = he must write it the book's way (the question tests the form:
 * 11/4 is not 2 3/4, 6/8 is not 3/4); l = a label before his box ("x ="), u = a unit after it ("cm"), j = a sign
 * between this box and the one before (":" of a ratio).
 */
export type BoxAns = { v: string[]; same?: boolean; l?: string; u?: string; j?: string };

/**
 * A part's answer and the way he gives it, written by the book engine where it knows them (never guessed from the
 * key's words). The slots it names are marked in the question's printed HTML, in printed order:
 * - box: boxes under the question; fill: the question's own blanks (`data-fill`); any = the boxes in any order;
 * - choose: one of the question's n options (`data-opt`), a = the right one (from 1);
 * - tf: each statement's bracket (`data-tick`), a = true for ✓;
 * - mark: the n words or numbers to tap (`data-mark`), a = the ones to underline (how "line") or circle ("ring");
 * - order: cards to put in order (items as printed), a = their numbers in the right order;
 * - match: the i-th of l goes with the a[i]-th of r;
 * - photo: done on paper (a drawing, a construction, "show that"): the teacher marks his photo.
 * items (choose, tf, mark) = their words, for a phone that can't find the slots in the question. Everything counts
 * from 1, as printed: option (2), the 3rd card.
 */
export type Ans =
  | { k: "box" | "fill"; b: BoxAns[]; any?: boolean }
  | { k: "choose"; n: number; a: number; items?: string[] }
  | { k: "tf"; a: boolean[]; items?: string[] }
  | { k: "mark"; n: number; a: number[]; how?: "line" | "ring"; items?: string[] }
  | { k: "order"; items: string[]; a: number[] }
  | { k: "match"; l: string[]; r: string[]; a: number[] }
  | { k: "photo" };

/** One part of a Part II question: its label ("ii", "a iii"), the answer (**bold** = the final answer), its marks. */
export type KeyPart = { p: string; a: string; m?: number; t?: Ans };
/** One question's answer, by its printed number: a short answer, or the answers of its parts. */
export type KeyAnswer = { q: number; a?: string; parts?: KeyPart[]; t?: Ans };

export const KEY_TEXT_MAX = 400;
export const KEY_PARTS_MAX = 20;
/** The most boxes, options, statements, words or cards one part may have. */
export const ANS_ITEMS_MAX = 12;
/** One box's accepted answers, and one item's words, at most. */
const ANS_V_MAX = 6;
const ANS_WORD_MAX = 60;

const isWord = (s: unknown) => typeof s === "string" && s.trim() !== "" && s.length <= ANS_WORD_MAX;
const isWords = (xs: unknown, n?: number) =>
  Array.isArray(xs) && xs.length > 0 && xs.length <= ANS_ITEMS_MAX && (n === undefined || xs.length === n) && xs.every(isWord);
const isIndexes = (xs: unknown, n: number, from: number) =>
  Array.isArray(xs) && xs.every((i) => Number.isInteger(i) && i >= from && i < n + from) && new Set(xs).size === xs.length;

/** What is wrong with a part's answer kind on its own ("" = fine). Its boxes' answers are read by the phone's rules. */
export function ansProblem(t: unknown): string {
  const x = t as Record<string, unknown> | null;
  if (!x || typeof x !== "object") return "an answer kind the app doesn't know";
  switch (x.k) {
    case "box":
    case "fill": {
      const b = x.b as BoxAns[];
      if (!Array.isArray(b) || b.length === 0 || b.length > ANS_ITEMS_MAX) return "no boxes";
      for (const bx of b) {
        if (!bx || !Array.isArray(bx.v) || bx.v.length === 0 || bx.v.length > ANS_V_MAX || !bx.v.every(isWord)) return "a box with no answer";
        for (const f of ["l", "u", "j"] as const) if (bx[f] !== undefined && !isWord(bx[f])) return "a box's label is too long";
      }
      return "";
    }
    case "choose": {
      const n = x.n as number;
      if (!Number.isInteger(n) || n < 2 || n > ANS_ITEMS_MAX || !Number.isInteger(x.a) || (x.a as number) < 1 || (x.a as number) > n) return "a choice without its right option";
      return x.items === undefined || isWords(x.items, n) ? "" : "a choice's options";
    }
    case "tf": {
      const a = x.a as unknown[];
      if (!Array.isArray(a) || a.length === 0 || a.length > ANS_ITEMS_MAX || !a.every((v) => typeof v === "boolean")) return "a ✓ / ✗ without its answers";
      return x.items === undefined || isWords(x.items, a.length) ? "" : "a ✓ / ✗'s statements";
    }
    case "mark": {
      const n = x.n as number;
      if (!Number.isInteger(n) || n < 2 || n > ANS_ITEMS_MAX || !Array.isArray(x.a) || x.a.length === 0 || !isIndexes(x.a, n, 1)) return "words to mark without the right ones";
      if (x.how !== undefined && x.how !== "line" && x.how !== "ring") return "words to mark, marked how?";
      return x.items === undefined || isWords(x.items, n) ? "" : "the words to mark";
    }
    case "order": {
      const items = x.items as string[];
      if (!isWords(items) || items.length < 2) return "cards to order";
      return Array.isArray(x.a) && x.a.length === items.length && isIndexes(x.a, items.length, 1) ? "" : "cards without their order";
    }
    case "match": {
      const l = x.l as string[];
      if (!isWords(l) || l.length < 2 || !isWords(x.r)) return "pairs to match";
      return Array.isArray(x.a) && x.a.length === l.length && isIndexes(x.a, (x.r as string[]).length, 1) ? "" : "pairs without their partners";
    }
    case "photo":
      return "";
    default:
      return "an answer kind the app doesn't know";
  }
}

/** The last question number of a workbook. */
export function lastQuestion(book: MasterData): number {
  return book.parts.length ? book.parts[book.parts.length - 1].to : 0;
}

/**
 * Problems with a key for this workbook, in plain words; [] when it is fine. A key whose part marks don't add up to
 * the book's marks for that question was made for another version of the book: refused, never shown.
 */
export function checkKey(key: KeyAnswer[], book: MasterData): string[] {
  const first = firstQuestion(book);
  const last = lastQuestion(book);
  const seen = new Set<number>();
  for (const k of key) {
    if (!Number.isInteger(k.q) || k.q < first || k.q > last) return [`The answer key has a question ${k.q}; the book has ${first} to ${last}.`];
    const bad = answerProblem(k, seen);
    if (bad) return [bad];
    const parts = k.parts ?? [];
    const marks = parts.map((p) => p.m);
    const max = outOf(book, k.q);
    if (parts.length && max !== null && marks.every((m) => typeof m === "number")) {
      const sum = marks.reduce<number>((s, m) => s + (m ?? 0), 0);
      if (sum !== max) return [`The answer key is for another version of this book: question ${k.q} is ${max} marks in the book, ${sum} in the key.`];
    }
  }
  return [];
}

/** What is wrong with one answer on its own (twice, empty, too long), or "" when it is fine. */
function answerProblem(k: KeyAnswer, seen: Set<number>): string {
  if (seen.has(k.q)) return `The answer key has question ${k.q} twice.`;
  seen.add(k.q);
  const parts = k.parts ?? [];
  if (!(k.a ?? "").trim() && !parts.some((p) => p.a.trim())) return `Question ${k.q} has an empty answer in the key.`;
  const texts = [k.a ?? "", ...parts.flatMap((p) => [p.p, p.a])];
  if (parts.length > KEY_PARTS_MAX || texts.some((t) => t.length > KEY_TEXT_MAX)) return `Question ${k.q}'s answer is too long.`;
  // Each answer kind the book gives (version 2): one a question, or one a part when it has parts.
  if (parts.length && k.t !== undefined) return `Question ${k.q} has parts: its answer kinds go on its parts.`;
  for (const t of [k.t, ...parts.map((p) => p.t)]) {
    if (t === undefined) continue;
    const bad = ansProblem(t) || ((t.k === "box" || t.k === "fill") && t.b.map(boxProblem).find(Boolean)) || "";
    if (bad) return `Question ${k.q}: ${bad}.`;
  }
  return "";
}

/** Problems with a theory book's key (a topic tute's ladder answers); [] when it is fine. No marks in a theory book. */
export function checkFighterKey(key: KeyAnswer[], book: FighterData): string[] {
  const f = fighter(book);
  const seen = new Set<number>();
  for (const k of key) {
    if (!f.isQuestion(k.q)) return [`The answer key has a question ${k.q}; the theory book has no such question.`];
    const bad = answerProblem(k, seen);
    if (bad) return [bad];
  }
  return [];
}

/** "d = 3 → **3n + 3**" → [["d = 3 → ", false], ["3n + 3", true]]: the final answer in bold, without any HTML. */
export function boldRuns(text: string): [string, boolean][] {
  return text
    .split("**")
    .map((s, i): [string, boolean] => [s, i % 2 === 1])
    .filter(([s]) => s !== "");
}

/**
 * The slots of a printed question, by kind: blanks (`data-fill`), options (`data-opt`), ✓ / ✗ brackets (`data-tick`),
 * words to mark (`data-mark`). (Never `data-b` or `data-q`: the engine's own blocks and cards use them.)
 */
export type Slots = { b: number; o: number; t: number; m: number };
export const SLOT_ATTR: Record<keyof Slots, string> = { b: "fill", o: "opt", t: "tick", m: "mark" };

/** How many slots of each kind a question's printed HTML has. */
export function slotsIn(html: string): Slots {
  const n = (a: keyof Slots) => (html.match(new RegExp(`\\sdata-${SLOT_ATTR[a]}(?=[\\s=>/])`, "g")) ?? []).length;
  return { b: n("b"), o: n("o"), t: n("t"), m: n("m") };
}

/** How many slots of each kind its answer kinds use, part after part. */
export function slotsWanted(k: KeyAnswer): Slots {
  const out: Slots = { b: 0, o: 0, t: 0, m: 0 };
  for (const t of [k.t, ...(k.parts ?? []).map((p) => p.t)]) {
    if (t?.k === "fill") out.b += t.b.length;
    else if (t?.k === "choose") out.o += t.n;
    else if (t?.k === "tf") out.t += t.a.length;
    else if (t?.k === "mark") out.m += t.n;
  }
  return out;
}

const SLOT_WORDS: Record<keyof Slots, string> = { b: "blanks", o: "options", t: "✓ / ✗ brackets", m: "words to mark" };

/** Why a question's printed slots don't fit its key ("" = they do): the book was built before its key, or after. */
export function slotProblem(k: KeyAnswer, html: string): string {
  const want = slotsWanted(k);
  const has = slotsIn(html);
  for (const s of ["b", "o", "t", "m"] as const) {
    if (want[s] && has[s] !== want[s]) return `the book prints ${has[s]} ${SLOT_WORDS[s]}, its key uses ${want[s]}.`;
  }
  return "";
}
