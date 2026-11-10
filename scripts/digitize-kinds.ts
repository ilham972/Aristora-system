// The words a unit's decisions are written in (scripts/digitize.ts; docs/making-changes.md "Digitize a unit in the
// app"). A unit's kinds file (in the scratchpad, never the repo: it holds his answers) exports K:
//
//   import { num, fill, choose, tf, mark, pick, why, say, eq, word, order, match, photo, split, paper } from
//     "/home/claude/aristora-system/scripts/digitize-kinds.ts";
//   export default {
//     5: num("34", { u: "cm" }),                      // Part I: the question's kind
//     37: { "2 ம் உறுப்பு": num("3"), "எண்கோலம்": pick([...4 names], 2) },   // Part I, two answers (1 mark each)
//     60: { i: split(["பெயர்", 1, pick([...], 2)], ["சுற்றளவு", 1, num("20", { u: "cm" })]), ii: num("21", { u: "cm" }) },
//     64: { "@": paper("table"), iv: match([...], [...], [...]) },   // "@" = the whole card (hide its printed columns)
//   };
//
// A question or part left out keeps the kind it has; a part with no kind gets the one the app read from its words
// (version 1), when there is one. Every kind's answer is checked by the app's own code before anything is sent.

import type { Ans, BoxAns } from "../convex/lib/key";

/** A change to the printed question: a slot on a blank, an option, a bracket, a word; or a block for paper only. */
export type Op =
  | { kind: "fill"; n: number }
  | { kind: "opt"; n: number }
  | { kind: "tick"; n: number; pat?: string }
  | { kind: "mark"; words: string[] }
  | { kind: "hide"; sel: string };

/** One answer's kind; `a` = its words for the teachers (else the key's own); `ops` = what its printed question needs. */
export type Spec = { t?: Ans; a?: string; ops?: Op[]; card?: true };
export type Split = { split: [string, number, Spec][] };
export type Decision = Spec | Record<string, Spec | Split>;
export type Kinds = Record<number, Decision>;

type BoxOpts = { u?: string; l?: string; j?: string; same?: boolean; also?: string[] };
const box = (v: string, o: BoxOpts = {}): BoxAns => ({
  v: [v, ...(o.also ?? [])],
  ...(o.same ? { same: true } : {}),
  ...(o.l ? { l: o.l } : {}),
  ...(o.u ? { u: o.u } : {}),
  ...(o.j ? { j: o.j } : {}),
});
const said = (b: BoxAns) => [b.l, b.v[0], b.u].filter(Boolean).join(" ");

/** One number (with its unit), "x =" a number, or an answer in letters. same = written the book's way. */
export const num = (v: string, o: BoxOpts = {}): Spec => ({ t: { k: "box", b: [box(v, o)] }, a: said(box(v, o)) });
export const expr = num;
/** Several boxes in a row; any = in any order; j = the sign printed between them (":" of a ratio, "+"). */
export const nums = (vs: string[], o: BoxOpts & { any?: boolean } = {}): Spec => {
  const b = vs.map((v, i) => box(v, { ...o, also: [], j: i ? o.j : undefined }));
  return { t: { k: "box", b, ...(o.any ? { any: true } : {}) }, a: b.map(said).join(o.j ? ` ${o.j} ` : ", ") };
};
/** An equation ("2x + 5 = 25"): his terms may be on either side; `also` = other equations the book accepts. */
export const eq = (v: string, o: { also?: string[] } = {}): Spec => ({ t: { k: "box", b: [box(v, { also: o.also })] }, a: v });
/** A word or a name in letters he types with his phone's keyboard ("AOB", "செவ்வகம்"): every spelling it takes. */
export const word = (vs: string | string[], o: { l?: string; u?: string } = {}): Spec => {
  const v = typeof vs === "string" ? [vs] : vs;
  return { t: { k: "box", b: [{ ...box(v[0], { ...o, also: v.slice(1) }), w: true }] }, a: [o.l, v[0]].filter(Boolean).join(" ") };
};
/** A name the paper doesn't print: 3 or 4 names of one family, the right one (from 1) in a changing place. */
export const pick = (names: string[], right: number): Spec => ({ t: { k: "choose", n: names.length, a: right, items: names, below: true }, a: names[right - 1] });
/** "Is it true? Give a reason": ஆம் (true) or இல்லை, then his reason typed; a teacher reads it. */
export const why = (yes: boolean, a?: string): Spec => ({ t: { k: "why", a: yes }, ...(a ? { a } : {}) });
/** His own words for a teacher ("explain", "describe", "show that"): typed, never a photo. */
export const say = (a?: string): Spec => ({ t: { k: "say" }, ...(a ? { a } : {}) });
/** Cards in order: as printed, then the right order. */
export const order = (items: string[], right: string[]): Spec => ({ t: { k: "order", items, a: right.map((x) => items.indexOf(x) + 1) }, a: right.join(", ") });
/** Pairs: the left column, the right column, each left's partner. hide = the printed columns (a selector: "table"). */
export const match = (l: string[], r: string[], pairs: string[], o: { hide?: string } = {}): Spec => ({
  t: { k: "match", l, r, a: pairs.map((p) => r.indexOf(p) + 1) },
  a: l.map((x, i) => `${x} → ${pairs[i]}`).join(" · "),
  ...(o.hide ? { ops: [{ kind: "hide" as const, sel: o.hide }], card: true as const } : {}),
});
/** A drawing or a construction: a photo his teacher marks. */
export const photo = (a?: string): Spec => ({ t: { k: "photo" }, ...(a ? { a } : {}) });
/** The question's own printed blanks (its `.ab` boxes, in printed order), each with its answer. */
export const fill = (...vs: (string | [string, BoxOpts])[]): Spec => {
  const b = vs.map((x) => (typeof x === "string" ? box(x) : box(x[0], x[1])));
  return { t: { k: "fill", b }, a: b.map(said).join(", "), ops: [{ kind: "fill", n: b.length }] };
};
/** The paper's printed options (its `.mcq`): the right one from 1; items = their words for the teachers. */
export const choose = (right: number, n: number, items?: string[]): Spec => ({
  t: { k: "choose", n, a: right, ...(items ? { items } : {}) },
  a: `(${right})${items ? ` ${items[right - 1]}` : ""}`,
  ops: [{ kind: "opt", n }],
});
/** ✓ / ✗ for each printed bracket, in order (pat = how the bracket is printed, a regular expression). */
export const tf = (vals: boolean[], o: { pat?: string } = {}): Spec => ({
  t: { k: "tf", a: vals },
  a: vals.map((x) => (x ? "✓" : "✗")).join(" "),
  ops: [{ kind: "tick", n: vals.length, ...(o.pat ? { pat: o.pat } : {}) }],
});
/** Words or numbers to underline (how "ring": circle): every candidate as printed, in order, and the right ones. */
export const mark = (words: string[], right: string[], o: { how?: "line" | "ring"; items?: string[] } = {}): Spec => ({
  t: { k: "mark", n: words.length, a: right.map((x) => words.indexOf(x) + 1).sort((a, b) => a - b), how: o.how ?? "line", items: o.items ?? words.map((w) => w.replace(/<[^>]+>/g, "")) },
  a: `${o.how === "ring" ? "circle" : "underline"}: ${right.join(", ")}`,
  ops: [{ kind: "mark", words }],
});
/** One printed sub-question, two or more answers: [label word, marks, kind] each (their marks add up to the part's). */
export const split = (...parts: [string, number, Spec][]): Split => ({ split: parts });
/** A printed block for paper only (never drawn on a phone): "table", "table:2", ".mt", "svg". */
export const paper = (sel: string): Spec => ({ ops: [{ kind: "hide", sel }], card: true });
/** A kind with ops on the whole card instead of its sub-question (its blanks are printed in the lead). */
export const onCard = (s: Spec): Spec => ({ ...s, card: true });
