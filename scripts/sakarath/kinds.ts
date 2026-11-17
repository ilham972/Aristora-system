// kinds.ts <sk.json> <requests.json> <report.txt> (17 Nov 2026; docs/making-changes.md "A Sakarath book into the app"):
// every part's answer kind for the phone, decided with the app's own
// rules (convex/lib/phone.ts), and each unit's Sakarath book as the Claude link saves it (convex/link.ts "sakarath").
// - A part the app reads by itself from the key's words (wantsOf: numbers, answers in letters, labelled answers, units,
//   ratios, points, sets) gets those same boxes as its kind, and is kept only when the app's v2 reading of that kind
//   gives exactly the boxes and values its own reading gave (nothing new is guessed here).
// - A name in capital letters (AOB, PQ, B, E) is a word box (both ways for a line or an angle).
// - A drawing (வரைக, அமைக்க, …, or a drawing area after it) is a photo. Everything else: his own words (say), read by a
//   teacher (or the AI) in Correction → Homework.
import { readFileSync, writeFileSync } from "node:fs";
import { boxProblem, phoneKey, wantsOf, type KeyQ, type Want } from "../../convex/lib/phone";
import { checkKey, slotProblem, type Ans, type BoxAns, type KeyAnswer } from "../../convex/lib/key";
import { sakarathProblem } from "../../convex/lib/sakarath";
import { unsafeCss, unsafeHtml, QUESTION_HTML_MAX } from "../../convex/lib/questions";
import type { MasterData } from "../../convex/lib/book";

type Part = { p: string; a: string; skill: string; text: string; lead: string; draw: boolean; sp: number };
type Q = { q: number; tag: string; sec: string; html: string; parts: Part[] };
type Unit = { no: number; code: string; ta: string; en: string; term: number; questions: Q[]; levels: [number, number][] };
type Grade = { grade: number; ver: string; css: string; units: Unit[] };

const [inFile, outFile, reportFile] = process.argv.slice(2);
const g = JSON.parse(readFileSync(inFile, "utf8")) as Grade;

const bold = (a: string) => a.split("**").filter((_, i) => i % 2 === 1);
/** Working between numbers in the final answer ("3 + 11"): he writes that form, the phone would want its value. */
const ARITH = /\d\s*[+×÷*−-]\s*\(?\d/;

function wordBoxes(a: string): BoxAns[] | null {
  const runs = bold(a);
  if (!runs.length) return null;
  const toks = runs.flatMap((r) => r.split(/,|;/)).map((x) => x.replace(/\s+/g, "").replace(/^∠/, ""));
  if (!toks.length || !toks.every((t) => /^[A-Z]{1,4}$/.test(t))) return null;
  return toks.map((w) => {
    const back = [...w].reverse().join("");
    return { v: back !== w && w.length <= 3 ? [w, back] : [w], w: true };
  });
}

/** An answer that is one example of many ("any two …", "உதாரணம்"): only a teacher can say his is right. */
const EXAMPLE = /உதாரணம்|உ-ம்|உ\.ம்|எவையேனும்|ஏதேனும்|எதுவும்|போன்றவை|அல்லது|ஏற்க|ஏறத்தாழ|அண்ணளவாக|மு\.ப|பி\.ப|±/;
/** A unit's letter the reader took for a label ("50 000 g = **50 kg**": "g ="). */
const UNIT_LABEL = /^(g|m|l|t|h|s|kg|cm|mm|km|ml) =$/;

/** A question that tests the form (simplify, expand, factorise): his answer must be written the book's way. */
const FORM = /சுருக்கு|விரி|காரணிப்படுத்து|காரணிகளாக|பெருக்கமாக|சுட்டி வடிவ|வலுவாக|வலுக்களின் பெருக்க|அடைப்புக்குறிகளை நீக்கி/;
const ORDER = /வரிசை|ஒழுங்கில்|அடுத்துவரும்|அடுத்து வரும்|உறுப்பு|கோல/;
const UNIT_AT_END = /\s*(cm²|m²|cm³|m³|mm|cm|km|kg|mg|ml|m|g|l)$/;

/** The book's two-term answer the other way round too ("y − 11" and "−11 + y"). */
function swapped(e: string): string[] {
  const m = /^([^+−-]+?)\s*([+−-])\s*([^+−-]+)$/.exec(e.trim());
  if (!m || m[1].includes("(") || m[3].includes("(")) return [];
  const [, a, op, b] = m;
  const neg = a.trim().startsWith("−") || a.trim().startsWith("-");
  if (neg) return [];
  return [op === "+" ? `${b.trim()} + ${a.trim()}` : `−${b.trim()} + ${a.trim()}`];
}

/** "(+12)": a positive number, as he types it (the phone's pad has no + for a number). */
const cleanAns = (a: string) => a.replace(/\*\*\s*\(\+\s*(\d+(?:\.\d+)?)\)\s*\*\*/g, "**$1**");

function numBoxes(a: string, text: string): { b: BoxAns[]; any: boolean; v2?: true } | null {
  if (EXAMPLE.test(a) || EXAMPLE.test(text)) return null;
  const clean = cleanAns(a);
  const runs = bold(clean);
  const strip = (r: string) => r.replace(/(^|[\s,;])[A-Za-z]\s*=\s*/g, "$1");
  if (runs.length && runs.some((r) => ARITH.test(strip(r)) && !/[a-z]/i.test(strip(r)))) return null;
  const w = wantsOf(clean);
  if (w && w.want.length) {
    // A number box for an answer with a letter in it ("(170 − a)°"): the reading lost the letter.
    const UNITS = /\b(mm|cm|km|kg|mg|ml|m|g|l|h|min|s|t|rs)\b|cm²|m²|cm³|m³|°|%/gi;
    const lettered = runs.some((r) => /[a-z]/i.test(strip(r).replace(UNITS, "")));
    if (lettered && w.want.some((x) => x.box.k === "num")) return null;
    if (FORM.test(text) && w.want.some((x) => x.box.k === "expr")) return algebra(runs, text, clean);
    const b: BoxAns[] = [];
    for (const x of w.want) {
      const box = x.box;
      if (box.k !== "num" && box.k !== "expr") return null;
      let t = x.t;
      if (box.u && t.endsWith(box.u)) t = t.slice(0, -box.u.length).trim();
      if (box.k === "num" && "ok" in x && x.ok.length > 1) return null; // "31 (32 also OK)": the teacher
      const l = box.l && !(box.u && UNIT_LABEL.test(box.l)) ? box.l : undefined;
      b.push({ v: [t], ...(l ? { l } : {}), ...(box.u ? { u: box.u } : {}), ...(box.j ? { j: box.j } : {}) });
    }
    // Many numbers in any order (a table read as a list, "from top to bottom"): only a teacher can read it right.
    if (b.length > 4 && w.anyOrder) return null;
    // In order: several bold answers (each its own thing: ஈவு, மீதி), or a question about order (terms, ascending).
    const any = w.anyOrder && runs.length === 1 && !ORDER.test(text);
    // Each bold answer named by the Tamil word before it ("ஈவு **12**, மீதி **5**"), so he knows which box is which.
    if (runs.length > 1 && b.length === runs.length && b.every((x) => !x.l)) {
      const parts = clean.split("**");
      b.forEach((x, i) => {
        const m = /([\u0B80-\u0BFF]+(?:\s[\u0B80-\u0BFF]+)?)\s*[:=]?\s*$/.exec(parts[2 * i] ?? "");
        if (m && m[1].length <= 20) x.l = m[1];
      });
    }
    return { b, any };
  }
  return algebra(runs, text, clean);
}

/**
 * An answer in 1 to 3 letters that the key's words don't give the app by themselves ("**5x + 3y**", "**4(x + 2y − 3)**",
 * "**(3y + 2) cm**"): one box the app's own kinds read (boxProblem ""), written the book's way when the question tests
 * the form.
 */
function algebra(runs: string[], text: string, whole = ""): { b: BoxAns[]; any: boolean; v2: true } | null {
  if (runs.length !== 1) return null;
  let e = runs[0].trim();
  let l: string | undefined;
  const lab = /^([A-Za-z])\s*=\s*(.+)$/.exec(e);
  if (lab && !/=/.test(lab[2])) {
    l = `${lab[1]} =`;
    e = lab[2].trim();
  }
  let u: string | undefined;
  const um = UNIT_AT_END.exec(e);
  if (um && /[a-z)]\s*$/i.test(e.slice(0, um.index))) {
    u = um[1];
    e = e.slice(0, um.index).trim();
    if (/^\(.*\)$/.test(e) && !/\)\s*\(/.test(e)) e = e.slice(1, -1).trim();
  }
  if (!/[a-z]/.test(e) || /[=<>≤≥∈∉{}]/.test(e) || /[\u0B80-\u0BFF]/.test(e)) return null;
  const form = FORM.test(text);
  // "**2^2 a^3 b^2** (= 4a^3 b^2)": the key takes that form too.
  const also = [...whole.matchAll(/\(=\s*([^()]+)\)/g)].map((m) => m[1].trim()).filter((x) => /[a-z]/.test(x));
  const v = form ? [e, ...swapped(e), ...also] : [e];
  const box: BoxAns = { v, ...(form ? { same: true } : {}), ...(l ? { l } : {}), ...(u ? { u } : {}) };
  return boxProblem(box) ? null : { b: [box], any: false, v2: true };
}

/** The boxes and values of a reading, to compare two (the app's own, and its reading of the kind we give). */
const sig = (ws: Want[] | null, noUnitLabel = false) =>
  JSON.stringify(
    (ws ?? []).map((w) => {
      // Labels name the boxes and never change a mark (a Tamil word may be added, a unit's letter taken off).
      const { l: _l, ...box } = w.box;
      void noUnitLabel;
      return { box, v: "ok" in w ? w.ok : "vals" in w ? w.vals : "eqs" in w ? w.eqs : "word" in w ? w.word : null };
    }),
  );

const payloads: unknown[] = [];
const report: string[] = [];
const tally = { box: 0, alg: 0, word: 0, say: 0, photo: 0 };
for (const u of g.units) {
  const n = u.questions.length;
  const marks: Record<string, number> = {};
  for (const q of u.questions) marks[String(q.q)] = q.parts.length;
  const data: MasterData = {
    kind: "master",
    parts: [{ id: "II", from: 1, to: n, kind: "cards" }],
    levels: u.levels.map(([from, to], i) => {
      let max = 0;
      for (let q = from; q <= to; q++) max += marks[String(q)];
      return { n: i + 1, from, to, max };
    }),
    marks,
  };
  const shape = sakarathProblem(data);
  if (shape) throw new Error(`G${g.grade} ${u.code}: ${shape}`);
  const answers: KeyAnswer[] = [];
  for (const q of u.questions) {
    const parts = q.parts.map((p) => {
      let t: Ans;
      let why = "";
      const words = EXAMPLE.test(p.a) || EXAMPLE.test(p.text) ? null : wordBoxes(p.a);
      const nums = p.draw ? null : numBoxes(p.a, `${p.lead} ${p.text}`);
      if (p.draw) {
        t = { k: "photo" };
        why = "photo";
      } else if (nums) {
        t = { k: "box", b: nums.b, ...(nums.any ? { any: true } : {}) };
        why = nums.v2 ? "alg" : "box";
      } else if (words) {
        t = { k: "box", b: words, ...(words.length > 1 ? { any: true } : {}) };
        why = "word";
      } else {
        t = { k: "say" };
        why = "say";
      }
      return { kp: { p: p.p, a: p.a.slice(0, 400), m: 1, t }, why, part: p };
    });
    // The app's reading of the kinds against its own reading of the words: a box part must read the same.
    const v2: KeyAnswer = { q: q.q, parts: parts.map((x) => x.kp) };
    const v1: KeyAnswer = { q: q.q, parts: parts.map((x) => ({ p: x.kp.p, a: cleanAns(x.kp.a), m: 1 })) };
    const k2 = phoneKey([v2], data).get(q.q) as KeyQ;
    const k1 = phoneKey([v1], data).get(q.q) as KeyQ;
    parts.forEach((x, i) => {
      if (x.why === "box" && sig(k2.parts[i].want, true) !== sig(k1.parts[i].want, true)) {
        report.push(`  ! G${g.grade} ${u.code} Q${q.q} (${x.kp.p}): the kind reads otherwise; his words instead`);
        x.kp.t = { k: "say" };
        x.why = "say";
      }
      if ((x.why === "word" || x.why === "alg") && !k2.parts[i].want) {
        x.kp.t = { k: "say" };
        x.why = "say";
      }
    });
    for (const x of parts) {
      tally[x.why as keyof typeof tally]++;
      const shown = x.kp.t.k === "box" ? x.kp.t.b.map((b) => `${b.l ? b.l + " " : ""}${b.v.join("|")}${b.u ? " " + b.u : ""}${b.w ? " (word)" : ""}${b.same ? " (so)" : ""}`).join(" · ") : x.kp.t.k;
      report.push(`G${g.grade} ${u.code} Q${q.q} ${q.tag}(${q.sec})(${x.kp.p}) ${x.why.padEnd(5)} ${shown}   ← ${x.kp.a.slice(0, 90)}   ‖ ${x.part.lead.slice(0, 50)} | ${x.part.text.slice(0, 60)}`);
    }
    answers.push({ q: q.q, parts: parts.map((x) => x.kp) });
  }
  const bad = checkKey(answers, data);
  if (bad.length) throw new Error(`G${g.grade} ${u.code}: ${bad[0]}`);
  for (const q of u.questions) {
    const h = unsafeHtml(q.html);
    if (h || q.html.length > QUESTION_HTML_MAX) throw new Error(`G${g.grade} ${u.code} Q${q.q}: ${h || "too big"}`);
    const s = slotProblem(answers[q.q - 1], q.html);
    if (s) throw new Error(`G${g.grade} ${u.code} Q${q.q}: ${s}`);
  }
  if (unsafeCss(g.css)) throw new Error("css");
  payloads.push({ name: `G${g.grade}-${u.code}-SK`, fn: "tell", req: { op: "sakarath", grade: g.grade, code: u.code, data, answers, items: u.questions.map((q) => ({ q: q.q, html: q.html })), css: g.css } });
}
writeFileSync(outFile, JSON.stringify(payloads));
writeFileSync(reportFile, report.join("\n") + "\n");
const all = tally.box + tally.alg + tally.word + tally.say + tally.photo;
console.log(`G${g.grade}: ${payloads.length} units, ${all} parts: phone ${tally.box + tally.alg + tally.word} (${tally.box} numbers, ${tally.alg} algebra, ${tally.word} names), typed ${tally.say}, photos ${tally.photo}`);
