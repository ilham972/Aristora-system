// Home marking: what a phone can mark by itself in a workbook level, read from the unit's answer key (the same key
// the teachers see; uploaded with the workbook, nothing else to upload).
// - The key is written for people ("x = **52**, y = **48**", "21 (22 also OK)", working before the **final answer**).
//   This reads only what it is sure of: a number, several numbers, an answer in n (2n − 1, n², n(n + 1)/2), and
//   labelled ones (x = 52, A = 18, i → 5n). Since 4 Nov 2026 also a number with its unit (25%, 45°, 12 cm, 24 cm²:
//   he types the number, the unit is printed after his box), several units (2 h 30 min, 3 kg 250 g), ratios (2 : 3),
//   points ((2, 3): x then y) and sets ({1, 2, 3}, any order). Everything else stays with the corrector: "show that",
//   drawings, and anything unclear (names and reasons too, unless the book gives their kind: below). A wrong ✗ on a
//   right answer is worse than leaving a question to the teacher.
// - Names and reasons (4 Nov 2026, his decisions): a name the paper doesn't print is chosen from the book's names under
//   the question (choose, below); "is it true? give a reason" = ஆம் / இல்லை, then his reason typed (why): a wrong pick is
//   the part's 0 at once, a right one leaves the part to a teacher, who reads his typed reason (never a photo).
// - The answers stay on the server: a phone gets only the shape of each answer (how many boxes, a number or an
//   answer in n), never the answer (`formOf`). Marking happens on the server (`markParts`).
// - An answer in n is right when it gives the same value for n = 1 … 7 (n + n − 1 is as good as 2n − 1).
// - Since 4 Nov 2026 the book engine may give each part's answer and its kind (answer-key.json version 2: `Ans`): then
//   nothing is read from the key's words. Boxes inside the question's own blanks (fill), an option to tap (choose), ✓
//   or ✗ per statement (tf), words to underline or circle (mark), cards to order, pairs to match, or a photo. A box the
//   book marks `same` must be written the book's way (11/4 is not 2 3/4: the question tests the form). His founder's
//   report that day: the guesser marked 11/4 right for "write 11/4 as a mixed number", any order right for "ascending
//   order", and sent every ✓ / ✗ question to the teacher.

import { outOf, type MasterData } from "./book";
import type { Ans, BoxAns, KeyAnswer } from "./key";

/** A fraction, always reduced, denominator > 0. */
export type Rat = [number, number];

/**
 * What the phone shows for one answer box: a number pad, or a pad with the letter (n). l = a label in the box ("x =",
 * "y"), u = a unit printed after his number ("%", "°", "cm²", "h"; never typed), j = a sign between this box and the
 * one before it (":" of a ratio). A "text" box is typed with his phone's own keyboard (Tamil, English or Thanglish):
 * his reason or his own words, read by a teacher and never marked by the phone; or `w`, a word or a name in letters
 * ("AOB", "செவ்வகம்": one line) that the phone marks. An "expr" box with `eq` takes an equation: its pad has "=".
 */
export type Box = ({ k: "num" } | { k: "expr"; v: string; eq?: true } | { k: "pick" } | { k: "text"; w?: true }) & {
  l?: string;
  u?: string;
  j?: string;
  /** Drawn as a fraction (`fracLook`): "f" a numerator over a denominator, "m" a whole number and a fraction. */
  f?: "f" | "m";
};
/**
 * How the phone shows a part whose kind the book gave (no answers in it): its boxes in the question's blanks, its
 * options, statements or words tapped in the question, cards to order or pairs to match under it. A "pick" box is one
 * of these taps: the phone sends "1" (an option's number, a card's number, ✓ = 1 and ✗ = 0, a marked word = 1).
 * choose `below` = names the paper doesn't print, shown under the question; why = ஆம் / இல்லை (a pick: 1 / 0) and
 * his reason (a text box) under it.
 */
export type Ui =
  | { k: "fill" }
  | { k: "choose"; n: number; items?: string[]; below?: true }
  | { k: "tf"; n: number; items?: string[] }
  | { k: "mark"; n: number; how: "line" | "ring"; items?: string[] }
  | { k: "order"; items: string[] }
  | { k: "match"; l: string[]; r: string[] }
  | { k: "why" }
  | { k: "say" };
/** One part of a question on the phone: its label ("ii", "" for a short question), marks, boxes (null = teacher). */
export type FormPart = { p: string; m: number; boxes: Box[] | null; ui?: Ui };
/** One question on the phone: no answers in it. */
export type FormQ = { q: number; max: number; parts: FormPart[] };

/**
 * One box with its answer (server only). t = the answer as the key writes it (for the teachers' list). An answer of
 * several boxes ("2 : 3", "2 h 30 min") is listed once: its first box carries the words, the others are `cont`.
 */
export type Want = { box: Box; t: string; words?: string; cont?: true; same?: string[] } & (
  | { ok: Rat[] }
  | { vals: Rat[] }
  /** An equation: each accepted one as its left side less its right at the points; his may be either way round. */
  | { eqs: Rat[][] }
  | { pick: string }
  /** A word or a name he types: any of these, as `wordKey` writes them. */
  | { word: string[] }
  | { text: true }
);
/**
 * One part (server only); a = the key's words when the phone can't read them (the teachers' list shows them). A part
 * of a kind the book gave: ui = how the phone shows it, rule = how it is marked ("all": every card in its place or
 * nothing; "picks": right words marked less wrong ones; "why": a wrong ஆம் / இல்லை is 0, a right one is the teacher's
 * (his reason); "say": his own words are the teacher's, nothing typed is 0; else a share per box), words = its answer
 * for the teachers.
 */
export type KeyPart = {
  p: string;
  m: number;
  want: Want[] | null;
  anyOrder: boolean;
  a?: string;
  fixed?: true;
  ui?: Ui;
  rule?: "all" | "picks" | "why" | "say";
  words?: string;
};
export type KeyQ = { q: number; max: number; parts: KeyPart[] };

/** Where an answer in n is compared. */
const POINTS = [1, 2, 3, 4, 5, 6, 7];
/**
 * Where an answer in several letters is compared (5 Nov 2026: algebra, "5x + 3y"): the k-th row gives the 1st, 2nd and
 * 3rd letter (in the alphabet's order) their values. Never 0 (a letter may divide), never the same pattern twice.
 */
const POINTS_MANY = [
  [2, 3, 5],
  [3, 7, 2],
  [5, 2, 7],
  [7, 5, 3],
  [1, 4, 6],
  [4, 1, 9],
  [6, 9, 1],
  [8, 6, 4],
  [9, 8, 11],
];
/** The most letters one box takes: the pad has a key for each (its × and / give way to the 2nd and 3rd). */
export const LETTERS_MAX = 3;
/** A box's typed answer is at most this long. */
export const INPUT_MAX = 40;
/** His reason (a text box) is at most this long: a few sentences in Tamil or Thanglish. */
export const REASON_MAX = 300;

class Bad extends Error {}
const BAD = new Bad("bad");
const LIMIT = 1e15;

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
function rat(n: number, d = 1): Rat {
  if (!Number.isInteger(n) || !Number.isInteger(d) || d === 0 || Math.abs(n) > LIMIT || Math.abs(d) > LIMIT) throw BAD;
  if (d < 0) [n, d] = [-n, -d];
  const g = gcd(n, d);
  return [n / g + 0, d / g];
}
const add = (a: Rat, b: Rat) => rat(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a: Rat, b: Rat) => rat(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const mul = (a: Rat, b: Rat) => rat(a[0] * b[0], a[1] * b[1]);
function div(a: Rat, b: Rat): Rat {
  if (b[0] === 0) throw BAD;
  return rat(a[0] * b[1], a[1] * b[0]);
}
function pow(a: Rat, e: number): Rat {
  if (!Number.isInteger(e) || e < 0 || e > 9) throw BAD;
  let r: Rat = [1, 1];
  for (let i = 0; i < e; i++) r = mul(r, a);
  return r;
}
export const same = (a: Rat, b: Rat) => a[0] === b[0] && a[1] === b[1];

const VULGAR: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8",
};

/** One way of writing maths: - for every minus, * for ×, / for ÷ and the fraction slash, ^2 for ², ½ as 1/2. */
export function normalize(s: string): string {
  return s
    .replace(/[−‐-―﹣－]/g, "-")
    .replace(/[×✕✖⋅∙]/g, "*")
    .replace(/[÷⁄∕]/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/(\d?)([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])/g, (_, d: string, f: string) => (d ? `${d} ${VULGAR[f]}` : VULGAR[f]))
    .replace(/[º˚]/g, "°")
    .replace(/°\s+C\b/g, "°C")
    .replace(/∶/g, ":")
    .replace(/ /g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A number as typed or as the key writes it: 15, -40, 2.5, 3/4, 2 1/3 (and 2⅓). Null = not a plain number. */
export function parseNum(raw: string): Rat | null {
  const s = normalize(raw);
  const m = /^(-)?\s?(?:(\d+) (\d+)\/(\d+)|(\d+)\/(\d+)|(\d*)\.(\d+)|(\d+))$/.exec(s);
  if (!m) return null;
  try {
    let r: Rat;
    if (m[2] !== undefined) r = add(rat(Number(m[2])), rat(Number(m[3]), Number(m[4])));
    else if (m[5] !== undefined) r = rat(Number(m[5]), Number(m[6]));
    else if (m[8] !== undefined) r = rat(Number(`${m[7] || "0"}${m[8]}`), 10 ** m[8].length);
    else r = rat(Number(m[9]));
    return m[1] ? rat(-r[0], r[1]) : r;
  } catch {
    return null;
  }
}

/**
 * How a number is written, for an answer the book wants written its way (`same`): 11/4, 2 3/4 and 2.75 are three
 * forms; 6/8 is not 3/4; 0.50 and .5 are both 0.5 (a decimal's trailing zeros never count).
 */
export function formKey(raw: string): string {
  const s = normalize(raw).replace(/\s*\/\s*/g, "/");
  const m = /^(-)?\s?(?:(\d+) (\d+)\/(\d+)|(\d+)\/(\d+)|(\d*)\.(\d+)|(\d+))$/.exec(s);
  if (!m) return s.replace(/\s+/g, "");
  const sign = m[1] ? "-" : "";
  if (m[2] !== undefined) return `m${sign}${Number(m[2])} ${Number(m[3])}/${Number(m[4])}`;
  if (m[5] !== undefined) return `f${sign}${Number(m[5])}/${Number(m[6])}`;
  if (m[8] !== undefined) return `d${sign}${Number(`${m[7] || "0"}.${m[8]}`)}`;
  return `i${sign}${Number(m[9])}`;
}

/** How an answer in a letter is written (`same`): 5n is 5*n, but not n5, 2n + 3n or 3 + 5n − 3. */
export function exprKey(raw: string): string {
  return normalize(raw).replace(/\s+/g, "").replace(/\*/g, "").toLowerCase();
}

type Tok = { t: "num"; v: Rat } | { t: "var"; v: string } | { t: "op"; v: string };

/** Units written in letters: never letters multiplied, even where letters side by side multiply. */
const UNIT_WORD = /^(mm|cm|km|kg|mg|ml|min|hrs?|rs)$/i;

function tokens(s: string, many = false): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " ") {
      i++;
      continue;
    }
    const num = /^(\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (num) {
      const r = parseNum(num[1]);
      if (!r) throw BAD;
      out.push({ t: "num", v: r });
      i += num[1].length;
      continue;
    }
    if (/[a-z]/i.test(c)) {
      if (!many && i + 1 < s.length && /[a-z]/i.test(s[i + 1])) throw BAD; // a word, not a letter
      if (many && UNIT_WORD.test(/^[a-z]+/i.exec(s.slice(i))![0])) throw BAD; // "5 cm" is a unit, not c × m
      out.push({ t: "var", v: c.toLowerCase() });
      i++;
      continue;
    }
    if ("+-*/^()".includes(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw BAD;
  }
  return out;
}

/** An expression, as a function of its letters' values. */
type Fn = (x: Record<string, Rat>) => Rat;

/**
 * Parse "2n - 1", "n^2", "n(n + 1)/2", "3(n - 1) + 2". Implicit × only where people write it (2n, 2(…), n(…), (…)(…),
 * (…)n); never ")2" or "n2": those come from a fraction or a square that lost its shape, and must not be guessed.
 * many = an answer the book gives in several letters (5 Nov 2026): letters side by side multiply ("4pq", "2a(a + 5b)"),
 * up to LETTERS_MAX of them; without it two letters together are a word ("cm") and more than one letter is refused.
 */
export function parseExpr(raw: string, many = false): { fn: Fn; vars: string[] } | null {
  let toks: Tok[];
  try {
    toks = tokens(normalize(raw), many);
  } catch {
    return null;
  }
  if (!toks.length) return null;
  let i = 0;
  const vars = new Set<string>();
  const peek = () => toks[i];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  function expr(): Fn {
    let f = term();
    while (isOp("+") || isOp("-")) {
      const op = toks[i++].v;
      const a = f;
      const b = term();
      f = op === "+" ? (x) => add(a(x), b(x)) : (x) => sub(a(x), b(x));
    }
    return f;
  }
  function startsAtom(): boolean {
    const t = peek();
    return !!t && (t.t === "num" || t.t === "var" || (t.t === "op" && t.v === "("));
  }
  function term(): Fn {
    let f = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = toks[i++].v;
        const a = f;
        const b = unary();
        f = op === "*" ? (x) => mul(a(x), b(x)) : (x) => div(a(x), b(x));
        continue;
      }
      // Implicit ×: allowed after a number, a letter or ")" only before a letter or "(" (and a number before a letter).
      const prev = toks[i - 1];
      const next = peek();
      if (prev && next && startsAtom() && !(next.t === "num")) {
        const a = f;
        const b = power();
        f = (x) => mul(a(x), b(x));
        continue;
      }
      return f;
    }
  }
  function unary(): Fn {
    if (isOp("-")) {
      i++;
      const f = unary();
      return (x) => sub([0, 1], f(x));
    }
    if (isOp("+")) {
      i++;
      return unary();
    }
    return power();
  }
  function power(): Fn {
    const base = atom();
    if (isOp("^")) {
      i++;
      const e = peek();
      if (!e || e.t !== "num" || e.v[1] !== 1) throw BAD;
      i++;
      return (x) => pow(base(x), e.v[0]);
    }
    return base;
  }
  function atom(): Fn {
    const t = toks[i++];
    if (!t) throw BAD;
    if (t.t === "num") {
      const v = t.v;
      if (peek()?.t === "num") throw BAD;
      return () => v;
    }
    if (t.t === "var") {
      vars.add(t.v);
      if (peek()?.t === "num") throw BAD; // "n2": a square that lost its shape
      const name = t.v;
      return (x) => {
        const v = x[name];
        if (!v) throw BAD; // a letter the box doesn't have
        return v;
      };
    }
    if (t.v === "(") {
      const f = expr();
      if (!isOp(")")) throw BAD;
      i++;
      if (peek()?.t === "num") throw BAD; // ")2": a fraction that lost its shape
      return f;
    }
    throw BAD;
  }
  try {
    const fn = expr();
    if (i !== toks.length || vars.size > (many ? LETTERS_MAX : 1)) return null;
    return { fn, vars: [...vars].sort() };
  } catch {
    return null;
  }
}

/**
 * The values of an answer at the points where it is compared: one letter (or none) at n = 1 … 7, several letters at
 * POINTS_MANY (letters = the box's, in the alphabet's order: what he types is worked out with the same values); null
 * when it can't be worked out.
 */
function valuesOf(fn: Fn, letters: string[]): Rat[] | null {
  try {
    if (letters.length > 1) {
      return POINTS_MANY.map((row) => fn(Object.fromEntries(letters.map((l, i) => [l, [row[i], 1] as Rat]))));
    }
    return POINTS.map((p) => fn(Object.fromEntries(letters.map((l) => [l, [p, 1] as Rat]))));
  } catch {
    return null;
  }
}

const TAMIL = /[஀-௿]/;
/** Answers that start with yes / no / true / false / "it comes" / "it doesn't": they need a reason (the teacher's). */
const YES_NO = /^(ஆம்|இல்லை|வராது|வரும்|உண்மை|பொய்|சரி|தவறு|yes|no)\b|^(ஆம்|இல்லை|வராது|வரும்|உண்மை|பொய்)/i;

/** Split at commas that are not inside brackets or braces. */
function topSplit(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(" || c === "{") depth++;
    if (c === ")" || c === "}") depth = Math.max(0, depth - 1);
    if (c === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

/**
 * Notes in brackets come out ("(3, 6, 9)", "(underline)", "(1 + 4 + … + 49)"); a note that accepts another answer
 * ("(22 உம் ஏற்கலாம்)": 22 is also accepted) gives its numbers. Brackets of the maths itself stay: n(n + 1).
 */
function notes(s: string): { text: string; also: Rat[] } {
  const also: Rat[] = [];
  let text = s;
  for (let guard = 0; guard < 10; guard++) {
    const m = /\(([^()]*)\)/g;
    let found = false;
    let r: RegExpExecArray | null;
    while ((r = m.exec(text))) {
      const inner = r[1];
      if (TAMIL.test(inner) || /…|\.\.\.|,/.test(inner)) {
        if (/ஏற்க|also|accept/i.test(inner)) {
          for (const n of normalize(inner).match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) ?? []) {
            const v = parseNum(n);
            if (v) also.push(v);
          }
        }
        text = (text.slice(0, r.index) + text.slice(r.index + r[0].length)).trim();
        found = true;
        break;
      }
    }
    if (!found) break;
  }
  return { text, also };
}

/** "8 ஆவது" → "8", "ரூ. 81" / "ரூபா 81" → "81", "12 சட்டகங்கள்" → "12": a position or a unit around a number. */
function bare(s: string): string {
  return s
    .replace(/^(ரூபாய்|ரூபா|ரூ\.?|Rs\.?|LKR\.?)\s*/i, "")
    .replace(/\s*[஀-௿][஀-௿\s.]*$/, "")
    .trim();
}

/**
 * A fraction is written as a numerator over a denominator, never with a slash (his rule, 5 Nov 2026: "students don't
 * writing fractions with slash, they know only denominator and numerator ... fraction line is horizontal"): the phone
 * draws a box whose answer is a fraction as one (`f`), a mixed number with its whole number first (`m`), and an answer
 * in one letter over something the same (n(n + 1)/2). What it sends is still one answer: "3/4", "1 3/4", "n(n+1)/2".
 */
export function fracLook(raw: string): { f?: "f" | "m" } {
  const t = raw.replace(/[−–]/g, "-").replace(/\s+/g, " ").trim();
  if (/^-?\d+ \d+\/\d+$/.test(t)) return { f: "m" };
  if (/^-?\d+\/\d+$/.test(t)) return { f: "f" };
  return /[a-zA-Z]/.test(t) && overOf(t) ? { f: "f" } : {};
}

/** "n(n + 1)/2" → ["n(n + 1)", "2"]: one division at the top and no sum or difference beside it; else null. */
export function overOf(t: string): [string, string] | null {
  let depth = 0;
  let at = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (depth === 0 && c === "/") {
      if (at >= 0) return null;
      at = i;
    } else if (depth === 0 && (c === "+" || c === "-" || c === "−") && i > 0) return null;
  }
  if (depth !== 0 || at <= 0 || at >= t.length - 1) return null;
  const bare = (x: string) => {
    const y = x.trim();
    if (!y.startsWith("(") || !y.endsWith(")")) return y;
    let d = 0;
    for (let i = 0; i < y.length - 1; i++) {
      if (y[i] === "(") d++;
      else if (y[i] === ")") d--;
      if (d === 0) return y; // "(n + 1)(n + 2)": its brackets aren't one pair round it all
    }
    return y.slice(1, -1).trim();
  };
  return [bare(t.slice(0, at)), bare(t.slice(at + 1))];
}

/** One answer box from text: a number (with any numbers also accepted), or an answer in one letter. */
function wantOf(text: string, label: string | undefined, also: Rat[]): Want | null {
  const t = bare(text);
  if (!t || TAMIL.test(t)) return null;
  const num = parseNum(t);
  if (num) return { box: { k: "num", ...(label ? { l: label } : {}), ...fracLook(t) }, t, ok: [num, ...also.filter((a) => !same(a, num))] };
  const e = parseExpr(t);
  if (!e || e.vars.length !== 1) return null; // "5 + 17" (no letter): the form matters, the teacher marks it
  const vals = valuesOf(e.fn, e.vars);
  if (!vals) return null;
  return { box: { k: "expr", v: e.vars[0], ...(label ? { l: label } : {}), ...fracLook(t) }, t, vals };
}

// ---- Units, ratios, points and sets (4 Nov 2026: "0.25 as a percentage" left whole Percentages Stages to the
// teacher: "25%" was not a number, so the phone gave no box) ----

/** A number as normalize() leaves it: 15, -40, 2.5, .5, 3/4, 2 1/3. */
const NUM = String.raw`-?(?:\d+ \d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)`;

/**
 * Units a key may write after a number (as normalize() leaves them: ² is ^2). The phone prints the unit after his box
 * and he types only the number. A one-letter unit needs a space before it: "5 m" is 5 metres, "5m" stays an answer in m.
 */
const UNIT_WORDS = [
  ...["%", "°C", "°", "mm^2", "cm^2", "m^2", "km^2", "mm^3", "cm^3", "m^3", "mm", "cm", "m", "km"],
  ...["mg", "g", "kg", "ml", "mL", "l", "L", "ha"],
  ...["h", "hr", "hrs", "hour", "hours", "min", "mins", "minute", "minutes", "s", "sec", "secs", "second", "seconds"],
  ...["day", "days", "week", "weeks", "month", "months", "year", "years"],
  ...["மணித்தியாலம்", "மணித்தியாலங்கள்", "மணி", "நிமிடம்", "நிமிடங்கள்", "செக்கன்", "செக்கன்கள்", "நாள்", "நாட்கள்"],
  ...["கிழமை", "கிழமைகள்", "வாரம்", "வாரங்கள்", "மாதம்", "மாதங்கள்", "வருடம்", "வருடங்கள்", "ஆண்டு", "ஆண்டுகள்"],
];
const UNIT_RE = [...UNIT_WORDS]
  .sort((a, b) => b.length - a.length)
  .map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
/** One number and its unit at the start of a text ("2 h" of "2 h 30 min"). */
const MEASURE = new RegExp(`^(${NUM})( ?)(${UNIT_RE})(?= |$)`);
/** A unit just after a bold number ("**25**%", "**12** cm"). */
const UNIT_AFTER = new RegExp(`^ ?(${UNIT_RE})(?![\\p{L}\\p{M}\\p{N}])`, "u");
/** A point: (2, 3) or A(2, 3). */
const POINT = new RegExp(`^(?:[A-Z] ?)?\\( ?(${NUM}) ?, ?(${NUM}) ?\\)$`);

const showUnit = (u: string) => u.replace(/\^2/g, "²").replace(/\^3/g, "³");
/** "25%", "45°", "12 cm": the sign sticks to the number, a word unit has a space. */
const withUnit = (n: string, u: string) => (/^[%°]/.test(u) ? `${n}${u}` : `${n} ${u}`);

/** Every number with its unit, covering the whole text ("2 h 30 min"), or null. */
function measures(s: string): { n: string; u: string }[] | null {
  const out: { n: string; u: string }[] = [];
  let rest = s.trim();
  while (rest) {
    const m = MEASURE.exec(rest);
    if (!m) return null;
    if (!m[2] && /^[a-z]$/i.test(m[3])) return null; // "5m": an answer in m
    out.push({ n: m[1], u: showUnit(m[3]) });
    rest = rest.slice(m[0].length).trim();
  }
  return out.length ? out : null;
}

/**
 * One written answer as boxes: "one" box (a number, with its unit or not, or an answer in n), several boxes in their
 * order ("fixed": a ratio, a point, 2 h 30 min) or a "set" (any order).
 */
type Item = { want: Want[]; kind: "one" | "fixed" | "set" };

/** Several boxes from one written answer: the first carries the words for the teachers' list. */
function several(written: string, label: string | undefined, boxes: { r: Rat; t: string; l?: string; u?: string; j?: string }[], kind: Item["kind"]): Item {
  return {
    kind,
    want: boxes.map((b, i) => {
      const l = i === 0 && label ? (b.l ? `${label} ${b.l}` : label) : b.l;
      const box: Box = { k: "num", ...(l ? { l } : {}), ...(b.u ? { u: b.u } : {}), ...(b.j ? { j: b.j } : {}) };
      return i === 0 ? { box, t: b.t, ok: [b.r], words: `${label ? `${label} ` : ""}${written}` } : { box, t: b.t, ok: [b.r], cont: true as const };
    }),
  };
}

/** One answer as the key writes it (one item of a list), as boxes; null = the teacher marks it. */
function itemOf(raw: string, label: string | undefined, also: Rat[]): Item | null {
  const written = raw.trim();
  const text = normalize(written);
  const nums = (xs: string[]): Rat[] | null => {
    const r = xs.map((x) => parseNum(x));
    return r.every((x): x is Rat => x !== null) ? r : null;
  };
  // A set: {1, 2, 3}, its numbers in any order.
  const set = /^\{(.*)\}$/.exec(text);
  if (set) {
    const xs = topSplit(set[1], ",");
    const r = set[1].trim() ? nums(xs) : null;
    return r ? several(written, label, r.map((x, i) => ({ r: x, t: xs[i] })), "set") : null;
  }
  // A point: (2, 3) or A(2, 3), x then y.
  const pt = POINT.exec(text);
  if (pt) {
    const r = nums([pt[1], pt[2]]);
    return r ? several(written, label, [{ r: r[0], t: pt[1], l: "x" }, { r: r[1], t: pt[2], l: "y" }], "fixed") : null;
  }
  // A ratio: 2 : 3 (: 5), in its order.
  if (text.includes(":")) {
    const xs = text.split(":").map((x) => x.trim());
    const r = xs.length >= 2 ? nums(xs) : null;
    return r ? several(written, label, r.map((x, i) => ({ r: x, t: xs[i], ...(i ? { j: ":" } : {}) })), "fixed") : null;
  }
  // A number with its unit (25%, 45°, 12 cm), or several (2 h 30 min, 3 kg 250 g).
  for (const s of new Set([text, bare(text)])) {
    const ms = measures(s);
    const r = ms && nums(ms.map((m) => m.n));
    if (!ms || !r) continue;
    if (ms.length > 1) return several(written, label, ms.map((m, i) => ({ r: r[i], t: m.n, u: m.u })), "fixed");
    const box: Box = { k: "num", ...(label ? { l: label } : {}), u: ms[0].u };
    return { kind: "one", want: [{ box, t: s === text ? written : withUnit(ms[0].n, ms[0].u), ok: [r[0], ...also.filter((a) => !same(a, r[0]))] }] };
  }
  // One box as before: a number, or an answer in one letter.
  const w = wantOf(written, label, also);
  return w ? { kind: "one", want: [w] } : null;
}

/** "x = 52, y = 48", "A = 18, B = 7", "i → 4n − 3, ii → 5n": every item labelled with a letter or i, ii, iii. */
function labelled(s: string): Item[] | null {
  const items = topSplit(s, ",");
  if (items.length < 1) return null;
  const out: Item[] = [];
  for (const it of items) {
    const m = /^([ivx]{1,4}|[A-Za-z])\s*(=|→|->)\s*(.+)$/.exec(it);
    if (!m) return null;
    const item = itemOf(m[3], `${m[1]} ${m[2] === "=" ? "=" : "→"}`, []);
    if (!item) return null;
    out.push(item);
  }
  return out;
}

/**
 * A part's boxes from its items, and whether they may come in any order: one set always; plain numbers of one unit
 * when `free` (no labels, no ratio); never a ratio, a point or 2 h 30 min. Two sets, or a set with more: the teacher.
 */
function partOf(items: Item[], free: boolean): { want: Want[]; anyOrder: boolean } | null {
  const want = items.flatMap((x) => x.want);
  const sets = items.filter((x) => x.kind === "set").length;
  if (!want.length || (sets && items.length > 1)) return null;
  if (sets) return { want, anyOrder: want.length > 1 };
  const loose = free && want.length > 1 && items.every((x) => x.kind === "one");
  return { want, anyOrder: loose && want.every((w) => w.box.k === "num" && w.box.u === want[0].box.u) };
}

/**
 * Money as Sri Lankan keys write it (4 Nov 2026, his screenshot: "ரூபா 550 இன் 7/11" asked for a photo while "ரூ 750 இன்
 * 7/10" had a box): "/=" or "/-" after the rupees goes; thousands lose their commas ("ரூ. 1,250" was two boxes, 1 and
 * 250, and his 1250 got ✗). With money in the answer every thousands comma goes; without, only a number of two groups
 * ("12,500"): "100,121,144" may be three terms of a pattern written without spaces.
 */
function money(raw: string): string {
  const s = raw.replace(/[\u00a0\u2007\u2009\u202f]/g, " ");
  const isMoney = /ரூ|Rs\.?\s?\d|LKR|\d\s*\/\s*[=-]/i.test(s);
  const t = s.replace(/(\d)\s*\/\s*[=-](?=[\s*,;)]|$)/g, "$1");
  const groups = isMoney ? /(^|[^\d.,])(\d{1,3}(?:,\d{3})+)(?!\d|,\d)/g : /(^|[^\d.,])(\d{1,3},\d{3})(?!\d|,\d)/g;
  // Thousands with a space too ("ரூ. 36 000", as Sri Lankan textbooks write them); never "2 1/3" or "2 125/1000".
  return t
    .replace(groups, (_, pre: string, n: string) => pre + n.replace(/,/g, ""))
    .replace(/(?<![\d.,/])(?<!\d )(\d{1,3}(?: \d{3})+)(?![\d/]| \d)/g, (n: string) => n.replace(/ /g, ""));
}

/** "x = 36000" inside one bold run: a labelled answer (the label is usually just before the bold). */
function labelledOne(s: string): Item | null {
  const m = /^([ivx]{1,4}|[A-Za-z])\s*(=|→|->)\s*(.+)$/.exec(s.trim());
  return m ? itemOf(m[3], `${m[1]} ${m[2] === "=" ? "=" : "→"}`, []) : null;
}

/**
 * Working with no bold that is only arithmetic and ends in "= a number" ("60000 × 3/5 = 36000", "8 × 3 = 24"): that
 * number. Words, letters or a last value that isn't a plain number ("= 7²": show that) stay with the corrector.
 */
function arithTail(t: string): Item | null {
  const plain = normalize(t).replace(/ரூபாய்|ரூபா|ரூ\.?|Rs\.?|LKR\.?/gi, " ");
  const sides = plain.split("=");
  if (sides.length < 2 || !/^[\d\s+\-*/().=^]+$/.test(plain)) return null;
  const last = sides[sides.length - 1].trim();
  const r = parseNum(last);
  return r ? { kind: "one", want: [{ box: { k: "num" }, t: last, ok: [r] }] } : null;
}

/**
 * A final answer in bold with words around ONE number ("**மொத்தம் 36000**", "**36000 ரூபா ஆகும்**"): the number. Bold is
 * the author's final answer, so the words are only words; working (=, +, ×) or a letter next to the number is not.
 */
function boldNumber(s: string, label: string | undefined): Item | null {
  const t = normalize(s);
  const nums = t.match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) ?? [];
  if (nums.length !== 1 || /[=+*^→]|\d\s?[a-z]\b|\b[a-z]\s?\d/i.test(t)) return null;
  const r = parseNum(nums[0]);
  if (!r) return null;
  return { kind: "one", want: [{ box: { k: "num", ...(label ? { l: label } : {}) }, t: nums[0], ok: [r] }] };
}

/** The boxes of one answer as the key writes it, or null: the teacher marks it. */
export function wantsOf(raw: string): { want: Want[]; anyOrder: boolean } | null {
  const text = money(raw.replace(/\s+/g, " ").trim());
  if (!text) return null;
  if (YES_NO.test(text.replace(/\*\*/g, "").trim())) return null;
  // The final answer in bold: only the bold runs count (the rest is working).
  if (text.includes("**")) {
    const runs = text.split("**");
    if (runs.length % 2 === 0) return null; // an unclosed bold
    const items: Item[] = [];
    let ratio = false;
    for (let i = 1; i < runs.length; i += 2) {
      const before = runs[i - 1];
      const lab = /(?:^|[\s,;:→])([A-Za-z])\s*=\s*$/.exec(before);
      const parts = topSplit(runs[i], ",");
      for (const it of parts) {
        const label = parts.length === 1 && lab ? `${lab[1]} =` : undefined;
        const item = itemOf(it, label, []) ?? labelledOne(it) ?? boldNumber(it, label);
        if (!item) return null;
        items.push(item);
      }
      const last = items[items.length - 1];
      const one = parts.length === 1 && last.kind === "one" && last.want[0].box.k === "num" ? last.want[0] : null;
      if (!one) continue;
      // "**2** : **3**": a ratio written as bold numbers, in its order.
      if (i > 1 && before.trim() === ":") {
        one.box.j = ":";
        ratio = true;
      }
      // "**25**%", "**12** cm": the unit just after the bold number.
      const u = UNIT_AFTER.exec(runs[i + 1] ?? "");
      if (u && !one.box.u) {
        one.box.u = showUnit(u[1]);
        one.t = withUnit(one.t, one.box.u);
      }
    }
    const unlabelled = items.every((x) => x.want.every((w) => !w.box.l));
    return partOf(items, unlabelled && !ratio);
  }
  // No bold: the whole text is the answer, and must look like one. A point or a set first: notes() would take their
  // brackets for a note.
  const whole = itemOf(text, undefined, []);
  if (whole && whole.kind !== "one") return partOf([whole], false);
  const { text: t, also } = notes(text);
  if (!t || t.includes(" · ") || t.includes(";")) return null;
  if (/=|→|->/.test(t)) {
    const l = labelled(t);
    if (l) return partOf(l, false);
    const tail = arithTail(t);
    return tail ? partOf([tail], false) : null;
  }
  const parts = topSplit(t, ",");
  const items: Item[] = [];
  for (const it of parts) {
    const item = itemOf(it, undefined, parts.length === 1 ? also : []);
    if (!item) return null;
    items.push(item);
  }
  return partOf(items, true);
}

// ---- Answers whose kind the book gives (answer-key.json version 2, 4 Nov 2026) ----

/**
 * One box the book gives: a number (any of its accepted ones), an answer in one letter, or (5 Nov 2026) an answer in
 * 2 to LETTERS_MAX letters (box v = its letters in the alphabet's order: the pad's letter keys); null = the phone can't.
 */
function boxWant(b: BoxAns): Want | null {
  const first = b.v[0];
  const edge = { ...(b.l ? { l: b.l } : {}), ...(b.u ? { u: showUnit(b.u) } : {}), ...(b.j ? { j: b.j } : {}) };
  const t = b.u ? withUnit(first, showUnit(b.u)) : first;
  if (b.w) {
    const word = b.v.map(wordKey);
    return word.every(Boolean) ? { box: { k: "text", w: true, ...edge }, t, word } : null;
  }
  if (first.includes("=")) return eqWant(b, edge, t);
  const look = { ...edge, ...fracLook(first) };
  const same = b.same ? { same: b.v.map(formKey) } : {};
  const nums = b.v.map(parseNum);
  if (nums.every((x) => x !== null)) return { box: { k: "num", ...look }, t, ok: nums as Rat[], ...same };
  const sameForm = b.same ? { same: b.v.map(exprKey) } : {};
  const e = parseExpr(first);
  if (e && e.vars.length === 1 && b.v.every((x) => parseExpr(x)?.vars.join() === e.vars[0])) {
    const vals = valuesOf(e.fn, e.vars);
    return vals ? { box: { k: "expr", v: e.vars[0], ...look }, t, vals, ...sameForm } : null;
  }
  // Several letters (algebra: "5x + 3y", "4pq", "2a(a + 5b)"): every accepted answer in the same letters.
  const m = parseExpr(first, true);
  if (!m || m.vars.length < 2 || b.v.some((x) => parseExpr(x, true)?.vars.join() !== m.vars.join())) return null;
  const vals = valuesOf(m.fn, m.vars);
  return vals ? { box: { k: "expr", v: m.vars.join(""), ...look }, t, vals, ...sameForm } : null;
}

/**
 * A word or a name as it is compared (10 Nov 2026): capitals, spaces and the marks people add or leave out never count
 * ("∠AOB", "A O B", "aob" and "AÔB" are one answer; "PQ." is "PQ"). The order of its letters does count: the book lists
 * every order it takes ("AOB", "BOA").
 */
export function wordKey(raw: string): string {
  return normalize(raw)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\s∠∡^ˆ△Δ▵°.,;:'"`’‘“”()\[\]{}_|]/g, "");
}

/** An equation's two sides as one function (left less right) of its letters; null when it isn't one equation. */
function parseEq(raw: string): { fn: Fn; vars: string[] } | null {
  const sides = normalize(raw).split("=");
  if (sides.length !== 2) return null;
  const l = parseExpr(sides[0], true);
  const r = parseExpr(sides[1], true);
  if (!l || !r) return null;
  const vars = [...new Set([...l.vars, ...r.vars])].sort();
  if (!vars.length || vars.length > LETTERS_MAX) return null;
  return { fn: (x) => sub(l.fn(x), r.fn(x)), vars };
}

/** An equation's values where it is compared: several letters at POINTS_MANY, one at n = 1 … 7. */
const eqValues = (fn: Fn, letters: string[]) => valuesOf(fn, letters);

/**
 * A box whose answer is an equation (10 Nov 2026, his screenshot: "build an equation in x" asked for a photo): every
 * accepted one in the same letters. His is right when it says the same as one of them with its terms on either side
 * ("2x + 5 = 25", "25 = 5 + 2x", "2x = 25 − 5", "2x + 5 − 25 = 0"): left less right equal to the book's at every point,
 * or to its opposite. One divided or multiplied through ("x + 2.5 = 12.5"), and the solved one ("x = 10"), are other
 * equations: right only when the book lists them. An equation true for every value, or for none, is never an answer.
 */
function eqWant(b: BoxAns, edge: { l?: string; u?: string; j?: string }, t: string): Want | null {
  const first = parseEq(b.v[0]);
  if (!first) return null;
  const eqs: Rat[][] = [];
  for (const v of b.v) {
    const e = parseEq(v);
    if (!e || e.vars.join() !== first.vars.join()) return null;
    const vals = eqValues(e.fn, e.vars);
    if (!vals || vals.every((x) => x[0] === 0) || new Set(vals.map((x) => `${x[0]}/${x[1]}`)).size === 1) return null;
    eqs.push(vals);
  }
  return { box: { k: "expr", v: first.vars.join(""), eq: true, ...edge }, t, eqs, ...(b.same ? { same: b.v.map(exprKey) } : {}) };
}

/** Why the phone can't take this box ("" = fine): it types numbers, answers in 1 to 3 letters and equations in them;
 *  a word or a name needs `w` (his phone's keyboard) or names to tap. */
export function boxProblem(b: BoxAns): string {
  return boxWant(b) ? "" : `a box answer the phone can't type ("${b.v[0]}"): a word needs w or choose, a drawing photo`;
}

const pickWants = (vals: string[]): Want[] => vals.map((v) => ({ box: { k: "pick" }, t: v, pick: v }));
const tick = (x: boolean) => (x ? "✓" : "✗");

/** A part of a kind the book gave, as the phone marks it (its answer never leaves the server: `formOf`). */
function typedPart(t: Ans, p: string, m: number, a: string): KeyPart {
  const base = { p, m, anyOrder: false };
  switch (t.k) {
    case "box":
    case "fill": {
      const want = t.b.map(boxWant);
      if (want.some((w) => w === null)) return { ...base, want: null, a }; // refused at upload: never here
      const w = want as Want[];
      const words = w.map((x) => `${x.box.l ? `${x.box.l} ` : ""}${x.t}`).join(" · ") + (t.any ? " (any order)" : "") + (t.b.some((x) => x.same) ? " (written so)" : "");
      return { ...base, want: w, anyOrder: !!t.any, words, ...(t.k === "fill" ? { ui: { k: "fill" as const } } : {}) };
    }
    case "choose":
      return {
        ...base,
        want: pickWants([String(t.a)]),
        words: `(${t.a})${t.items ? ` ${t.items[t.a - 1]}` : ""}`,
        ui: { k: "choose", n: t.n, ...(t.items ? { items: t.items } : {}), ...(t.below ? { below: true as const } : {}) },
      };
    case "why": {
      // ஆம் / இல்லை (a pick), then his reason (a text box the teacher reads).
      const yes = t.a ? "ஆம்" : "இல்லை";
      return {
        ...base,
        want: [
          { box: { k: "pick" }, t: yes, pick: t.a ? "1" : "0" },
          { box: { k: "text" }, t: "his reason", text: true },
        ],
        rule: "why",
        words: `${yes} + his reason (a teacher reads it)`,
        ui: { k: "why" },
      };
    }
    case "say":
      // His own words (a text box the teacher reads): "explain", "describe", "show that".
      return { ...base, want: [{ box: { k: "text" }, t: "his words", text: true }], rule: "say", words: "his own words (a teacher reads them)", ui: { k: "say" } };
    case "tf":
      return { ...base, want: pickWants(t.a.map((x) => (x ? "1" : "0"))), words: t.a.map(tick).join(" "), ui: { k: "tf", n: t.a.length, ...(t.items ? { items: t.items } : {}) } };
    case "mark": {
      const how = t.how ?? "line";
      const picked = [...t.a].sort((x, y) => x - y);
      const words = `${how === "ring" ? "circle" : "underline"}: ${picked.map((i) => t.items?.[i - 1] ?? `#${i}`).join(", ")}`;
      return { ...base, want: pickWants(Array.from({ length: t.n }, (_, i) => (t.a.includes(i + 1) ? "1" : "0"))), rule: "picks", words, ui: { k: "mark", n: t.n, how, ...(t.items ? { items: t.items } : {}) } };
    }
    case "order":
      return { ...base, want: pickWants(t.a.map(String)), rule: "all", words: t.a.map((i) => t.items[i - 1]).join(", "), ui: { k: "order", items: t.items } };
    case "match":
      return { ...base, want: pickWants(t.a.map(String)), words: t.l.map((x, i) => `${x} → ${t.r[t.a[i] - 1]}`).join(" · "), ui: { k: "match", l: t.l, r: t.r } };
    case "photo":
      return { ...base, want: null, a };
  }
}

/**
 * Every question of a workbook as the phone can mark it: each part with its marks and boxes (null = the teacher
 * marks that part). A question with no answer in the key, or whose marks can't be split by part, is the teacher's.
 * A key that gives answer kinds (version 2) is never read for words: a part without a kind is the teacher's.
 */
export function phoneKey(key: KeyAnswer[] | null, book: MasterData, fixes?: Map<string, string>): Map<number, KeyQ> {
  const out = new Map<number, KeyQ>();
  if (fixes?.size) {
    for (const [q, k] of phoneKey(key, book)) out.set(q, { ...k, parts: k.parts.map((p) => fixPart(p, fixes.get(`${q}|${p.p}`))) });
    return out;
  }
  const byQ = new Map((key ?? []).map((k) => [k.q, k]));
  const kinds = (key ?? []).some((k) => k.t !== undefined || k.parts?.some((p) => p.t !== undefined));
  const last = book.parts.length ? book.parts[book.parts.length - 1].to : 0;
  for (let q = 1; q <= last; q++) {
    const max = outOf(book, q);
    if (max === null || max <= 0) continue;
    const k = byQ.get(q);
    const teacher: KeyQ = { q, max, parts: [{ p: "", m: max, want: null, anyOrder: false }] };
    if (!k) {
      out.set(q, teacher);
      continue;
    }
    const raw = k.parts?.length ? k.parts : [{ p: "", a: k.a ?? "", m: max, t: k.t }];
    if (raw.some((p) => typeof p.m !== "number") || raw.reduce((s, p) => s + (p.m ?? 0), 0) !== max) {
      out.set(q, teacher);
      continue;
    }
    out.set(q, {
      q,
      max,
      parts: raw.map((p) => {
        if (p.m === 0) return { p: p.p, m: 0, want: [], anyOrder: false }; // nothing to mark: no boxes
        if (p.t) return typedPart(p.t, p.p, p.m!, p.a);
        if (kinds) return { p: p.p, m: p.m!, want: null, anyOrder: false, a: p.a };
        const w = wantsOf(p.a);
        return { p: p.p, m: p.m!, want: w?.want ?? null, anyOrder: w?.anyOrder ?? false, ...(w ? {} : { a: p.a }) };
      }),
    });
  }
  return out;
}

/** "Teacher" typed as a fix: this part stays with the corrector (a real drawing the key's words made look like a number). */
export const FIX_TEACHER = "teacher";

/**
 * A teacher's fix for one part (Settings → Books → See what the phone accepts, 4 Nov 2026): the answer as the phone
 * should read it ("36000", "25%", "x = 5, y = 7"), or "teacher". A fix the phone can't read changes nothing.
 */
function fixPart(p: KeyPart, fix: string | undefined): KeyPart {
  if (fix === undefined || p.m === 0) return p;
  if (fix === FIX_TEACHER) return { p: p.p, m: p.m, want: null, anyOrder: false, fixed: true, a: p.a ?? p.words };
  // A kind the book gave is the book's to change (a new upload): only "teacher" moves it.
  if (p.words !== undefined) return p;
  const w = wantsOf(fix);
  return w ? { p: p.p, m: p.m, want: w.want, anyOrder: w.anyOrder, fixed: true } : p;
}

/** What the phone may see of a question: its parts' marks and boxes, never the answers. */
export function formOf(k: KeyQ): FormQ {
  return { q: k.q, max: k.max, parts: k.parts.map((p) => ({ p: p.p, m: p.m, boxes: p.want ? p.want.map((w) => w.box) : null, ...(p.ui ? { ui: p.ui } : {}) })) };
}

/** A part a teacher reads what he typed for (never a photo): a reason, or his own words. */
export const readPart = (p: KeyPart) => p.rule === "why" || p.rule === "say";

/** A part the phone marks by itself, always (a reason's ஆம் / இல்லை may leave it to the teacher). */
export const phonePart = (p: KeyPart) => p.want !== null && !readPart(p);

/** The phone marks every part of this question, always (so it may come back: `retryPool`). */
export const allPhone = (k: KeyQ) => k.parts.every(phonePart);

/** How much of a workbook a phone marks: whole questions, and marks. */
export function phoneShare(keys: Map<number, KeyQ>): { questions: number; of: number; marks: number; max: number } {
  let questions = 0;
  let marks = 0;
  let max = 0;
  for (const k of keys.values()) {
    max += k.max;
    if (allPhone(k)) questions++;
    for (const p of k.parts) if (phonePart(p)) marks += p.m;
  }
  return { questions, of: keys.size, marks, max };
}

/** One typed answer against one box. */
function right(w: Want, typed: string | undefined): boolean {
  if (typeof typed !== "string" || !typed.trim() || typed.length > INPUT_MAX) return false;
  if ("text" in w) return false; // his reason or his own words: a teacher reads them (`markPart`)
  if ("pick" in w) return typed.trim() === w.pick;
  if ("word" in w) return w.word.includes(wordKey(typed));
  if ("eqs" in w) {
    const letters = [...(w.box as { v: string }).v];
    const e = parseEq(typed);
    if (!e || e.vars.some((x) => !letters.includes(x))) return false;
    const mine = eqValues(e.fn, letters);
    if (!mine) return false;
    const says = (a: Rat[]) => a.every((x, i) => same(x, mine[i])) || a.every((x, i) => same([-x[0], x[1]], mine[i]));
    return w.eqs.some(says) && (!w.same || w.same.includes(exprKey(typed)));
  }
  if ("ok" in w) {
    const v = parseNum(typed);
    return !!v && w.ok.some((a) => same(a, v)) && (!w.same || w.same.includes(formKey(typed)));
  }
  const letters = [...(w.box as { v: string }).v];
  const e = parseExpr(typed, letters.length > 1);
  if (!e || e.vars.some((x) => !letters.includes(x))) return false;
  const vals = valuesOf(e.fn, letters);
  return !!vals && vals.every((x, i) => same(x, w.vals[i])) && (!w.same || w.same.includes(exprKey(typed)));
}

/**
 * Mark one part: which boxes are right, and its marks (all right = its marks; else its share: 2 marks over 2 boxes =
 * 1 a box, rounded down). Several plain numbers ("the next two terms", "the two square numbers") may come in any order.
 * null = a teacher marks it: a photo part, or a reason whose ஆம் / இல்லை was right (a wrong one is 0, nothing to read).
 */
export function markPart(part: KeyPart, typed: string[]): { ok: boolean[]; got: number } | null {
  if (!part.want) return null;
  const n = part.want.length;
  if (part.rule === "why") return right(part.want[0], typed[0]) ? null : { ok: part.want.map(() => false), got: 0 };
  // His own words: a teacher reads them; nothing typed is nothing to read.
  if (part.rule === "say") return (typed[0] ?? "").trim() ? null : { ok: [false], got: 0 };
  // Words to mark: one he didn't tap is "not marked" (0), right or wrong like the others.
  if (part.rule === "picks") typed = Array.from({ length: n }, (_, i) => (typed[i] ?? "").trim() || "0");
  let ok: boolean[];
  if (part.anyOrder) {
    const used = new Set<number>();
    ok = part.want.map((_, i) => {
      const j = part.want!.findIndex((w, k) => !used.has(k) && right(w, typed[i]));
      if (j < 0) return false;
      used.add(j);
      return true;
    });
  } else ok = part.want.map((w, i) => right(w, typed[i]));
  const good = ok.filter(Boolean).length;
  if (part.rule === "all") return { ok, got: good === n ? part.m : 0 };
  if (part.rule === "picks") {
    // The right ones he marked, less the wrong ones (marking everything gets nothing).
    const want = part.want;
    const should = want.filter((w) => "pick" in w && w.pick === "1").length;
    const hits = want.filter((w, i) => "pick" in w && w.pick === "1" && typed[i] === "1").length;
    const extra = want.filter((w, i) => "pick" in w && w.pick === "0" && typed[i] === "1").length;
    return { ok, got: should ? Math.floor((part.m * Math.max(0, hits - extra)) / should) : 0 };
  }
  return { ok, got: good === n ? part.m : Math.floor((part.m * good) / n) };
}

/** How many boxes a question has on the phone (its typed answers come in this order, part after part). */
export function boxCount(k: KeyQ): number {
  return k.parts.reduce((s, p) => s + (p.want?.length ?? 0), 0);
}

/**
 * Mark one question from its typed answers (every box of every phone part, in order). got = the marks when the phone
 * marks the whole question, else null (a part waits for the teacher). ok = per part, per box (null = teacher part);
 * parts = each part's marks (null = the teacher's).
 */
export function markQuestion(k: KeyQ, typed: string[]): { ok: (boolean[] | null)[]; got: number | null; phoneGot: number; parts: (number | null)[] } {
  let at = 0;
  let got = 0;
  let whole = true;
  const parts: (number | null)[] = [];
  const ok = k.parts.map((p) => {
    if (!p.want) {
      whole = false;
      parts.push(null);
      return null;
    }
    const r = markPart(p, typed.slice(at, at + p.want.length));
    at += p.want.length;
    if (!r) {
      // A reason whose ஆம் / இல்லை was right: the teacher reads it.
      whole = false;
      parts.push(null);
      return null;
    }
    got += r.got;
    parts.push(r.got);
    return r.ok;
  });
  return { ok, got: whole ? got : null, phoneGot: got, parts };
}

/** The marks a teacher gives on this question after its Check (its parts the phone left: `markQuestion`'s nulls). */
export function teacherMarks(k: KeyQ, parts: (number | null)[]): number {
  return k.parts.reduce((s, p, i) => s + (parts[i] === null ? p.m : 0), 0);
}

/** The question waits for a teacher only to read his typed reasons (no photo needed: every part it left is a reason). */
export const onlyReasons = (k: KeyQ, parts: (number | null)[]) =>
  parts.some((x) => x === null) && k.parts.every((p, i) => parts[i] !== null || readPart(p));

/** His typed reasons a teacher reads: each reason part whose ஆம் / இல்லை was right, with what he wrote. */
export function reasonsOf(k: KeyQ, typed: string[]): { p: string; yes: string; text: string }[] {
  const left = markQuestion(k, typed).parts;
  const out: { p: string; yes: string; text: string }[] = [];
  let at = 0;
  k.parts.forEach((p, i) => {
    if (p.rule === "why" && left[i] === null) out.push({ p: p.p, yes: typed[at] === "1" ? "ஆம்" : "இல்லை", text: (typed[at + 1] ?? "").trim() });
    if (p.rule === "say" && left[i] === null) out.push({ p: p.p, yes: "", text: (typed[at] ?? "").trim() });
    at += p.want?.length ?? 0;
  });
  return out;
}

/** He lost marks on a part the phone marks by itself (not a reason): his working photo is asked for. */
export const lostOutsideReasons = (k: KeyQ, parts: (number | null)[]) => k.parts.some((p, i) => !readPart(p) && parts[i] !== null && parts[i]! < p.m);

/** The answer as the teachers' list shows it ("x = 52 · y = 48", "4n − 3"). Teachers only. */
export function wantWords(p: KeyPart): string {
  if (!p.want) return "teacher";
  if (p.words !== undefined) return p.words;
  const one = (w: Want) => {
    if (w.words) return w.words; // "2 : 3", "(2, 3)", "2 h 30 min": its boxes listed once
    const also = "ok" in w && w.ok.length > 1 ? ` (or ${w.ok.slice(1).map(([n, d]) => (d === 1 ? String(n) : `${n}/${d}`)).join(", ")})` : "";
    return `${w.box.l ? `${w.box.l} ` : ""}${w.t}${also}`;
  };
  // Answers apart with " · "; a bold ratio's numbers ("**2** : **3**") with their ":".
  const shown = p.want.filter((w) => !w.cont);
  return shown.map((w, i) => (i ? (w.box.j ? ` ${w.box.j} ` : " · ") : "") + one(w)).join("") + (p.anyOrder ? " (any order)" : "");
}

/**
 * What he typed, slot by slot, in words the teachers read (one entry a slot, so `ok` still lines up): ✓ / ✗, the
 * option's number, a marked word, the card in each place, each pair. Boxes stay as typed.
 */
export function slotWords(k: KeyQ, typed: string[]): string[] {
  const out: string[] = [];
  for (const p of k.parts) {
    const n = p.want?.length ?? 0;
    const mine = Array.from({ length: n }, (_, i) => (typed[out.length + i] ?? "").trim());
    const ui = p.ui;
    if (!ui || ui.k === "fill") out.push(...mine);
    else if (ui.k === "choose") out.push(...mine.map((x) => (x ? `(${x})${ui.items?.[Number(x) - 1] ? ` ${ui.items[Number(x) - 1]}` : ""}` : "")));
    else if (ui.k === "tf") out.push(...mine.map((x) => (x === "1" ? "✓" : x === "0" ? "✗" : "")));
    else if (ui.k === "mark") out.push(...mine.map((x, i) => (x === "1" ? (ui.items?.[i] ?? `#${i + 1}`) : "")));
    else if (ui.k === "order") out.push(...mine.map((x) => ui.items[Number(x) - 1] ?? ""));
    else if (ui.k === "why") out.push(mine[0] === "1" ? "ஆம்" : mine[0] === "0" ? "இல்லை" : "", mine[1] ?? "");
    else if (ui.k === "say") out.push(...mine);
    else out.push(...mine.map((x, i) => (x ? `${ui.l[i]} → ${ui.r[Number(x) - 1] ?? "?"}` : "")));
  }
  return out;
}
