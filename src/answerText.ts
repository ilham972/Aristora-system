// How an answer-key text is shown on Correction's card (2 Nov 2026, his ask: "a person who doesn't know maths can
// correct it just by seeing it"). The key comes from the workbook engine as plain text: "**…**" = the final answer,
// " / " = a line break in the book (a fraction never has spaces round its slash: "3/4", "(x + 1)/2"), "^(…)" = a
// power the engine couldn't write as ²/³. Pure functions: the card (src/bigAnswer.tsx) draws what these return.
//
// The rule: the final answer is the big thing. A line "working = **answer**" puts its working small above the answer;
// a line with no bold at all, in a key with no bold at all, IS the answer (Part I keys: a number, a list, an expression).

import { boldRuns } from "../convex/lib/key";

/** A run of key text: b = part of the final answer (bold in the book's key). */
export type Seg = { t: string; b: boolean };
/** One line of the key, as the book breaks it. */
export type KeyLine = Seg[];
/** A line on the card: small working, or the answer (big; any non-bold words in it stay small). */
export type ShownLine = { kind: "work" | "hero"; segs: Seg[] };

/** The key's lines: " / " breaks a line (a fraction's slash has no spaces round it). Empty lines dropped. */
export function keyLines(text: string): KeyLine[] {
  const lines: KeyLine[] = [[]];
  for (const [s, b] of boldRuns(text.replace(/\s+/g, " ").trim())) {
    s.split(/ \/ /).forEach((piece, i) => {
      if (i > 0) lines.push([]);
      if (piece !== "") lines[lines.length - 1].push({ t: piece, b });
    });
  }
  return lines
    .map((l) => trimLine(l))
    .filter((l) => l.length > 0);
}

/** Trims a line's outer spaces (inner runs keep theirs: "x = " + "3"). */
function trimLine(l: KeyLine): KeyLine {
  const out = l.map((s) => ({ ...s }));
  if (out.length) out[0].t = out[0].t.replace(/^\s+/, "");
  if (out.length) out[out.length - 1].t = out[out.length - 1].t.replace(/\s+$/, "");
  return out.filter((s) => s.t !== "");
}

/**
 * The card's lines, in the key's order. With no bold anywhere, every line is the answer. Otherwise a line without bold
 * is working (small); a line ending in its one bold run is split: the working before it small, the answer on its own
 * line; any other line with bold is the answer with its few plain words kept small inside it ("x = **3**, y = **5**").
 */
export function shownLines(text: string): ShownLine[] {
  const lines = keyLines(text);
  const anyBold = lines.some((l) => l.some((s) => s.b));
  if (!anyBold) return lines.map((segs) => ({ kind: "hero", segs: segs.map((s) => ({ ...s, b: true })) }));
  const out: ShownLine[] = [];
  for (const l of lines) {
    const bold = l.filter((s) => s.b);
    if (bold.length === 0) {
      out.push({ kind: "work", segs: l });
    } else if (bold.length === 1 && l[l.length - 1].b && l.length > 1) {
      out.push({ kind: "work", segs: trimLine(l.slice(0, -1)) });
      out.push({ kind: "hero", segs: [{ t: l[l.length - 1].t.trim(), b: true }] });
    } else {
      out.push({ kind: "hero", segs: l });
    }
  }
  return out.filter((x) => x.segs.length > 0);
}

/** The answer alone, as one plain line (for a screen reader, and the tests): bold runs, or the whole key. */
export function answerWords(text: string): string {
  const shown = shownLines(text).filter((x) => x.kind === "hero");
  return shown.map((x) => x.segs.map((s) => s.t).join("")).join(" / ");
}

// ---- Fractions and powers ----

/** A piece of a run: text, a stacked fraction (n over d), or a power (^ … raised). */
export type MathPiece = { k: "t"; t: string } | { k: "f"; n: string; d: string } | { k: "sup"; t: string };

// A fraction's side: a bracket, or a run with no space, slash, bracket or sign in it ("15", "2x", "x²").
const SIDE = String.raw`\([^()]*\)|[^\s/()=+×÷<>≤≥,;:−\-]+`;
const MATH = new RegExp(String.raw`(${SIDE})\/(${SIDE})|\^\(([^()]*)\)`, "g");

/** Takes the brackets the engine put round a fraction's side ("(x + 1)" → "x + 1"): the bar groups it already. */
const unwrap = (s: string) => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);
/** Only numbers and brackets stack: "3/4", "(x + 1)/2", "2x/3"; units stay on the line ("km/h", "m/s"). */
const stacks = (n: string, d: string) => /[\d()]/.test(n) || /[\d()]/.test(d);

export function mathPieces(text: string): MathPiece[] {
  const out: MathPiece[] = [];
  let at = 0;
  const push = (t: string) => {
    if (!t) return;
    const last = out[out.length - 1];
    if (last?.k === "t") last.t += t;
    else out.push({ k: "t", t });
  };
  for (const m of text.matchAll(MATH)) {
    const i = m.index ?? 0;
    if (m[3] !== undefined) {
      push(text.slice(at, i));
      out.push({ k: "sup", t: m[3] });
    } else if (stacks(m[1], m[2])) {
      // A mixed number ("2 3/4"): the whole number sits right against its fraction.
      let before = text.slice(at, i);
      if (/\d $/.test(before)) before = before.slice(0, -1);
      push(before);
      out.push({ k: "f", n: unwrap(m[1]), d: unwrap(m[2]) });
    } else {
      push(text.slice(at, i + m[0].length));
    }
    at = i + m[0].length;
  }
  push(text.slice(at));
  return out;
}

/** Keeps an expression in one piece on a big line: no break beside = + − × ÷ < > (only after a comma or a word). */
export function glue(t: string): string {
  return t.replace(/ ([=+×÷<>≤≥→−-]) /g, " $1 ").replace(/ ([=+×÷<>≤≥→−-])$/g, " $1");
}
