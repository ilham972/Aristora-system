// Home marking: what a phone can mark by itself in a workbook level, read from the unit's answer key (the same key
// the teachers see; uploaded with the workbook, nothing else to upload).
// - The key is written for people ("x = **52**, y = **48**", "21 (22 also OK)", working before the **final answer**).
//   This reads only what it is sure of: a number, several numbers, an answer in n (2n − 1, n², n(n + 1)/2), and
//   labelled ones (x = 52, A = 18, i → 5n). Everything else stays with the corrector: names (of a pattern),
//   yes/no with a reason, "show that", drawings, and anything unclear. A wrong ✗ on a right answer is worse than
//   leaving a question to the teacher.
// - The answers stay on the server: a phone gets only the shape of each answer (how many boxes, a number or an
//   answer in n), never the answer (`formOf`). Marking happens on the server (`markParts`).
// - An answer in n is right when it gives the same value for n = 1 … 7 (n + n − 1 is as good as 2n − 1).

import { outOf, type MasterData } from "./book";
import type { KeyAnswer } from "./key";

/** A fraction, always reduced, denominator > 0. */
export type Rat = [number, number];

/** What the phone shows for one answer box: a number pad, or a pad with the letter (n). */
export type Box = { k: "num"; l?: string } | { k: "expr"; v: string; l?: string };
/** One part of a question on the phone: its label ("ii", "" for a short question), marks, boxes (null = teacher). */
export type FormPart = { p: string; m: number; boxes: Box[] | null };
/** One question on the phone: no answers in it. */
export type FormQ = { q: number; max: number; parts: FormPart[] };

/** One box with its answer (server only). t = the answer as the key writes it (for the teachers' list). */
export type Want = { box: Box; t: string } & ({ ok: Rat[] } | { vals: Rat[] });
export type KeyPart = { p: string; m: number; want: Want[] | null; anyOrder: boolean };
export type KeyQ = { q: number; max: number; parts: KeyPart[] };

/** Where an answer in n is compared. */
const POINTS = [1, 2, 3, 4, 5, 6, 7];
/** A box's typed answer is at most this long. */
export const INPUT_MAX = 40;

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

type Tok = { t: "num"; v: Rat } | { t: "var"; v: string } | { t: "op"; v: string };

function tokens(s: string): Tok[] {
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
      if (i + 1 < s.length && /[a-z]/i.test(s[i + 1])) throw BAD; // a word, not a letter
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

/** An expression, as a function of its letter (one letter at most). */
type Fn = (x: Rat) => Rat;

/**
 * Parse "2n - 1", "n^2", "n(n + 1)/2", "3(n - 1) + 2". Implicit × only where people write it (2n, 2(…), n(…), (…)(…),
 * (…)n); never ")2" or "n2": those come from a fraction or a square that lost its shape, and must not be guessed.
 */
export function parseExpr(raw: string): { fn: Fn; vars: string[] } | null {
  let toks: Tok[];
  try {
    toks = tokens(normalize(raw));
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
      return (x) => x;
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
    if (i !== toks.length || vars.size > 1) return null;
    return { fn, vars: [...vars] };
  } catch {
    return null;
  }
}

/** The values of an answer in its letter at n = 1 … 7; null when it can't be worked out. */
function valuesOf(fn: Fn): Rat[] | null {
  try {
    return POINTS.map((p) => fn([p, 1]));
  } catch {
    return null;
  }
}

const TAMIL = /[஀-௿]/;
/** Answers that start with yes / no / true / false / "it comes" / "it doesn't": they need a reason (the teacher's). */
const YES_NO = /^(ஆம்|இல்லை|வராது|வரும்|உண்மை|பொய்|சரி|தவறு|yes|no)\b|^(ஆம்|இல்லை|வராது|வரும்|உண்மை|பொய்)/i;

/** Split at commas that are not inside brackets. */
function topSplit(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if (c === "(") depth++;
    if (c === ")") depth = Math.max(0, depth - 1);
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

/** "8 ஆவது" → "8", "ரூ. 81" → "81", "12 சட்டகங்கள்" → "12": a position or a unit around a number. */
function bare(s: string): string {
  return s
    .replace(/^(ரூ\.?|Rs\.?)\s*/i, "")
    .replace(/\s*[஀-௿][஀-௿\s.]*$/, "")
    .trim();
}

/** One answer box from text: a number (with any numbers also accepted), or an answer in one letter. */
function wantOf(text: string, label: string | undefined, also: Rat[]): Want | null {
  const t = bare(text);
  if (!t || TAMIL.test(t)) return null;
  const num = parseNum(t);
  if (num) return { box: { k: "num", ...(label ? { l: label } : {}) }, t, ok: [num, ...also.filter((a) => !same(a, num))] };
  const e = parseExpr(t);
  if (!e || e.vars.length !== 1) return null; // "5 + 17" (no letter): the form matters, the teacher marks it
  const vals = valuesOf(e.fn);
  if (!vals) return null;
  return { box: { k: "expr", v: e.vars[0], ...(label ? { l: label } : {}) }, t, vals };
}

/** "x = 52, y = 48", "A = 18, B = 7", "i → 4n − 3, ii → 5n": every item labelled with a letter or i, ii, iii. */
function labelled(s: string): Want[] | null {
  const items = topSplit(s, ",");
  if (items.length < 1) return null;
  const out: Want[] = [];
  for (const it of items) {
    const m = /^([ivx]{1,4}|[A-Za-z])\s*(=|→|->)\s*(.+)$/.exec(it);
    if (!m) return null;
    const w = wantOf(m[3], `${m[1]} ${m[2] === "=" ? "=" : "→"}`, []);
    if (!w) return null;
    out.push(w);
  }
  return out;
}

/** The boxes of one answer as the key writes it, or null: the teacher marks it. */
export function wantsOf(raw: string): { want: Want[]; anyOrder: boolean } | null {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return null;
  if (YES_NO.test(text.replace(/\*\*/g, "").trim())) return null;
  // The final answer in bold: only the bold runs count (the rest is working).
  if (text.includes("**")) {
    const runs = text.split("**");
    if (runs.length % 2 === 0) return null; // an unclosed bold
    const out: Want[] = [];
    let unlabelled = 0;
    for (let i = 1; i < runs.length; i += 2) {
      const before = runs[i - 1];
      const lab = /(?:^|[\s,;:→])([A-Za-z])\s*=\s*$/.exec(before);
      const items = topSplit(runs[i], ",");
      for (const it of items) {
        const w = wantOf(it, items.length === 1 && lab ? `${lab[1]} =` : undefined, []);
        if (!w) return null;
        if (!w.box.l) unlabelled++;
        out.push(w);
      }
    }
    return out.length ? { want: out, anyOrder: unlabelled === out.length && out.length > 1 && out.every((w) => w.box.k === "num") } : null;
  }
  // No bold: the whole text is the answer, and must look like one.
  const { text: t, also } = notes(text);
  if (!t || t.includes(" · ") || t.includes(";")) return null;
  if (/=|→|->/.test(t)) {
    const l = labelled(t);
    return l ? { want: l, anyOrder: false } : null;
  }
  const items = topSplit(t, ",");
  const out: Want[] = [];
  for (const it of items) {
    const w = wantOf(it, undefined, items.length === 1 ? also : []);
    if (!w) return null;
    out.push(w);
  }
  return { want: out, anyOrder: out.length > 1 && out.every((w) => w.box.k === "num") };
}

/**
 * Every question of a workbook as the phone can mark it: each part with its marks and boxes (null = the teacher
 * marks that part). A question with no answer in the key, or whose marks can't be split by part, is the teacher's.
 */
export function phoneKey(key: KeyAnswer[] | null, book: MasterData): Map<number, KeyQ> {
  const out = new Map<number, KeyQ>();
  const byQ = new Map((key ?? []).map((k) => [k.q, k]));
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
    const raw = k.parts?.length ? k.parts : [{ p: "", a: k.a ?? "", m: max }];
    if (raw.some((p) => typeof p.m !== "number") || raw.reduce((s, p) => s + (p.m ?? 0), 0) !== max) {
      out.set(q, teacher);
      continue;
    }
    out.set(q, {
      q,
      max,
      parts: raw.map((p) => {
        if (p.m === 0) return { p: p.p, m: 0, want: [], anyOrder: false }; // nothing to mark: no boxes
        const w = wantsOf(p.a);
        return { p: p.p, m: p.m!, want: w?.want ?? null, anyOrder: w?.anyOrder ?? false };
      }),
    });
  }
  return out;
}

/** What the phone may see of a question: its parts' marks and boxes, never the answers. */
export function formOf(k: KeyQ): FormQ {
  return { q: k.q, max: k.max, parts: k.parts.map((p) => ({ p: p.p, m: p.m, boxes: p.want ? p.want.map((w) => w.box) : null })) };
}

/** The phone marks every part of this question. */
export const allPhone = (k: KeyQ) => k.parts.every((p) => p.want !== null);

/** How much of a workbook a phone marks: whole questions, and marks. */
export function phoneShare(keys: Map<number, KeyQ>): { questions: number; of: number; marks: number; max: number } {
  let questions = 0;
  let marks = 0;
  let max = 0;
  for (const k of keys.values()) {
    max += k.max;
    if (allPhone(k)) questions++;
    for (const p of k.parts) if (p.want) marks += p.m;
  }
  return { questions, of: keys.size, marks, max };
}

/** One typed answer against one box. */
function right(w: Want, typed: string | undefined): boolean {
  if (typeof typed !== "string" || !typed.trim() || typed.length > INPUT_MAX) return false;
  if ("ok" in w) {
    const v = parseNum(typed);
    return !!v && w.ok.some((a) => same(a, v));
  }
  const e = parseExpr(typed);
  if (!e || e.vars.some((x) => x !== (w.box as { v: string }).v)) return false;
  const vals = valuesOf(e.fn);
  return !!vals && vals.every((x, i) => same(x, w.vals[i]));
}

/**
 * Mark one part: which boxes are right, and its marks (all right = its marks; else its share: 2 marks over 2 boxes =
 * 1 a box, rounded down). Several plain numbers ("the next two terms", "the two square numbers") may come in any order.
 */
export function markPart(part: KeyPart, typed: string[]): { ok: boolean[]; got: number } | null {
  if (!part.want) return null;
  const n = part.want.length;
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
  return { ok, got: good === n ? part.m : Math.floor((part.m * good) / n) };
}

/** How many boxes a question has on the phone (its typed answers come in this order, part after part). */
export function boxCount(k: KeyQ): number {
  return k.parts.reduce((s, p) => s + (p.want?.length ?? 0), 0);
}

/**
 * Mark one question from its typed answers (every box of every phone part, in order). got = the marks when the phone
 * marks the whole question, else null (a part waits for the teacher). ok = per part, per box (null = teacher part).
 */
export function markQuestion(k: KeyQ, typed: string[]): { ok: (boolean[] | null)[]; got: number | null; phoneGot: number } {
  let at = 0;
  let got = 0;
  let whole = true;
  const ok = k.parts.map((p) => {
    if (!p.want) {
      whole = false;
      return null;
    }
    const r = markPart(p, typed.slice(at, at + p.want.length))!;
    at += p.want.length;
    got += r.got;
    return r.ok;
  });
  return { ok, got: whole ? got : null, phoneGot: got };
}

/** The answer as the teachers' list shows it ("x = 52 · y = 48", "4n − 3"). Teachers only. */
export function wantWords(p: KeyPart): string {
  if (!p.want) return "teacher";
  const one = (w: Want) => {
    const also = "ok" in w && w.ok.length > 1 ? ` (or ${w.ok.slice(1).map(([n, d]) => (d === 1 ? String(n) : `${n}/${d}`)).join(", ")})` : "";
    return `${w.box.l ? `${w.box.l} ` : ""}${w.t}${also}`;
  };
  return p.want.map(one).join(" · ") + (p.anyOrder ? " (any order)" : "");
}
