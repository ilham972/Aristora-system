// A workbook's answer key: what a teacher sees beside each question while correcting a level.
// - It comes inside the unit's source zip (answer-key.json, written by the workbook engine) and is saved with the
//   workbook upload. It is never put in the code: the repo is public, and these are his books' answers.
// - It lives in its own table (`keys`), not in `books`: the board sends every book in use to every phone on each
//   tap, and a key (about 13 KB a unit) is read only when a teacher opens a level to correct.
// - Only teachers read it. When parents' or students' sites come, they must never get this table.

import { outOf, type MasterData } from "./book";

/** One part of a Part II question: its label ("ii", "a iii"), the answer (**bold** = the final answer), its marks. */
export type KeyPart = { p: string; a: string; m?: number };
/** One question's answer, by its printed number: a short answer, or the answers of its parts. */
export type KeyAnswer = { q: number; a?: string; parts?: KeyPart[] };

export const KEY_TEXT_MAX = 400;
export const KEY_PARTS_MAX = 20;

/** The last question number of a workbook. */
export function lastQuestion(book: MasterData): number {
  return book.parts.length ? book.parts[book.parts.length - 1].to : 0;
}

/**
 * Problems with a key for this workbook, in plain words; [] when it is fine. A key whose part marks don't add up to
 * the book's marks for that question was made for another version of the book: refused, never shown.
 */
export function checkKey(key: KeyAnswer[], book: MasterData): string[] {
  const last = lastQuestion(book);
  const seen = new Set<number>();
  for (const k of key) {
    if (!Number.isInteger(k.q) || k.q < 1 || k.q > last) return [`The answer key has a question ${k.q}; the book has 1 to ${last}.`];
    if (seen.has(k.q)) return [`The answer key has question ${k.q} twice.`];
    seen.add(k.q);
    const parts = k.parts ?? [];
    if (!(k.a ?? "").trim() && !parts.some((p) => p.a.trim())) return [`Question ${k.q} has an empty answer in the key.`];
    const texts = [k.a ?? "", ...parts.flatMap((p) => [p.p, p.a])];
    if (parts.length > KEY_PARTS_MAX || texts.some((t) => t.length > KEY_TEXT_MAX)) return [`Question ${k.q}'s answer is too long.`];
    const marks = parts.map((p) => p.m);
    const max = outOf(book, k.q);
    if (parts.length && max !== null && marks.every((m) => typeof m === "number")) {
      const sum = marks.reduce<number>((s, m) => s + (m ?? 0), 0);
      if (sum !== max) return [`The answer key is for another version of this book: question ${k.q} is ${max} marks in the book, ${sum} in the key.`];
    }
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
