// Digitize a workbook in the app, through the Claude link (10 Nov 2026, his ask: "directly digitalize from here ... I
// can't upload again and again"; docs/making-changes.md "Digitize a unit in the app"). Run with tsx, the link's code in
// a file outside the repo (ARISTORA_LINK_FILE), the units in the scratchpad (his books' content: never in the repo):
//
//   tsx scripts/digitize.ts units  <dir> <grade>       a grade's units: key, names, whether its book is in the app
//   tsx scripts/digitize.ts pull   <dir> [G8-U01 …]   the units' books, keys and printed questions (default: Grade 8 Term 1)
//   tsx scripts/digitize.ts review <dir>/<KEY> [all]   each question's words, key and kind; only what needs a decision
//   tsx scripts/digitize.ts build  <dir>/<KEY>         its kinds.ts applied and checked with the app's own code → out/
//   tsx scripts/digitize.ts push   <dir> <KEY …>       each unit's out/ saved in the app (all or nothing a unit)
//   tsx scripts/digitize.ts show   <dir>/<KEY> <Q …>   one question in a few lines: words, part labels, key, kind, slots
//   tsx scripts/digitize.ts ship   <dir> <KEY …>       build → push → read back and compare (one question put right)
//   tsx scripts/digitize.ts help                       the kinds' words (scripts/digitize-kinds.ts)
//
// The checks are the app's: the key as the upload checks it (`checkKey`), safe HTML (`unsafeHtml`), the printed slots
// against the key (`slotProblem`), and every answer typed as the key gives it is marked right by the phone's own
// marking (`phoneKey` → `markQuestion`). Nothing is sent before they all pass.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { outOf, partOf, type MasterData } from "../convex/lib/book";
import { checkKey, slotProblem, type Ans, type BoxAns, type KeyAnswer, type KeyPart } from "../convex/lib/key";
import { boxCount, markQuestion, normalize, phoneKey, phonePart, readPart, wantsOf, wantWords, type Box, type KeyQ } from "../convex/lib/phone";
import { unsafeHtml } from "../convex/lib/questions";
import { exchange, type Req } from "./claude-link";
import type { Decision, Kinds, Op, Spec, Split } from "./digitize-kinds";

export type Unit = {
  ok: true;
  unit: { unitId: string; key: string; grade: number; term: number; code: string; en: string; ta: string };
  data: MasterData;
  answers: KeyAnswer[] | null;
  css: string | null;
  fixes: { q: number; p: string; a: string }[];
  questions: { q: number; size: number }[];
  share: Record<string, unknown>;
  /** Its skills as the app has them (scripts/skills.ts), and what is wrong with them now ("" = fine). */
  skills?: { skills: { id: string; ta: string; en: string; eg?: number }[]; tags: { q: number; p?: string; s: string }[]; updatedAt: number; problem: string } | null;
};

const repo = resolve(import.meta.dirname, "..");
export const outside = (p: string) => {
  if (resolve(p).startsWith(repo + "/")) throw new Error("Keep his books outside the repo (the scratchpad).");
  return resolve(p);
};
export const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, "utf8")) as T;

// ---------------------------------------------------------------- pull

/** The app's list of units (asked once an hour at most: each ask is a minute on the carrier). */
export async function bookList(dir: string, fresh = false): Promise<Record<string, any>> {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "books.json");
  if (!fresh && existsSync(file) && Date.now() - statSync(file).mtimeMs < 3_600_000) return readJson(file);
  const books = (await exchange([{ name: "books", fn: "ask", req: { op: "books" } }])).books;
  if (!books?.ok) throw new Error(`books: ${books?.error}`);
  writeFileSync(file, JSON.stringify(books, null, 1));
  return books;
}

/** A grade's units, a line each: its key (what every other command takes), its names, whether its book is in the app. */
async function units(dir: string, grade: string) {
  type Row = { key: string; grade: number; term: number; en: string; ta: string; master: null | { qCount?: number } };
  for (const u of ((await bookList(dir)).units as Row[]).filter((x) => x.key.startsWith(`${/^\d+$/.test(grade) ? `G${grade}` : grade.toUpperCase()}-`))) console.log(`${u.key} · term ${u.term} · ${u.en} · ${u.ta} · ${u.master ? `book, ${u.master.qCount ?? "?"} questions` : "no book in the app"}`);
}

export async function pull(dir: string, keys: string[]) {
  let books = await bookList(dir);
  // A book uploaded since the list was asked for: ask again.
  if (keys.some((k) => !(books.units as { key: string; master: unknown }[]).some((u) => u.key === k && u.master))) books = await bookList(dir, true);
  type Row = { unitId: string; key: string; grade: number; term: number; master: null | Record<string, unknown> };
  const units = (books.units as Row[]).filter((u) => (keys.length ? keys.includes(u.key) : u.grade === 8 && u.term === 1) && u.master);
  console.log(`${units.length} units: ${units.map((u) => `${u.key} (${JSON.stringify(u.master)})`).join("\n  ")}`);
  let reqs: Req[] = units.flatMap((u) => [
    { name: u.key, fn: "ask" as const, req: { op: "unit", unitId: u.unitId } },
    { name: `${u.key}@1`, fn: "ask" as const, req: { op: "questions", unitId: u.unitId, from: 1 } },
  ]);
  const html = new Map<string, { q: number; html: string }[]>();
  while (reqs.length) {
    const got = await exchange(reqs);
    const next: Req[] = [];
    for (const r of reqs) {
      const a = got[r.name];
      if (!a?.ok) throw new Error(`${r.name}: ${a?.error}`);
      const key = r.name.split("@")[0];
      if (r.req.op === "unit") {
        mkdirSync(join(dir, key, "q"), { recursive: true });
        writeFileSync(join(dir, key, "unit.json"), JSON.stringify(a, null, 1));
      } else {
        html.set(key, [...(html.get(key) ?? []), ...(a.items as { q: number; html: string }[])]);
        if (a.next) next.push({ name: `${key}@${a.next}`, fn: "ask", req: { ...r.req, from: a.next } });
      }
    }
    reqs = next;
  }
  for (const [key, items] of html) {
    for (const it of items) writeFileSync(join(dir, key, "q", `${String(it.q).padStart(3, "0")}.html`), it.html);
    const u = readJson<Unit>(join(dir, key, "unit.json"));
    console.log(`${key} ${u.unit.en}: ${items.length} questions as printed, key ${u.answers ? `${u.answers.length} answers${u.answers.some((k) => k.t || k.parts?.some((p) => p.t)) ? " (kinds)" : " (words only)"}` : "none"}; the phone: ${JSON.stringify(u.share)}`);
  }
}

// ---------------------------------------------------------------- reading a unit

export function load(udir: string) {
  const u = readJson<Unit>(join(udir, "unit.json"));
  const html = new Map<number, string>();
  if (existsSync(join(udir, "q"))) for (const f of readdirSync(join(udir, "q"))) html.set(Number(f.slice(0, 3)), readFileSync(join(udir, "q", f), "utf8"));
  const last = u.data.parts.length ? u.data.parts[u.data.parts.length - 1].to : 0;
  return { u, html, last, key: new Map((u.answers ?? []).map((k) => [k.q, k])) };
}

/** A printed question in words: figures, fractions, powers, blanks and options kept readable. */
export function plain(h: string): string {
  return h
    .replace(/<svg[\s\S]*?<\/svg>/g, " [fig] ")
    .replace(/<span class="frc"><span class="nu">([\s\S]*?)<\/span><span class="de">([\s\S]*?)<\/span><\/span>/g, " ($1)/($2) ")
    .replace(/<sup>([\s\S]*?)<\/sup>/g, "^$1")
    .replace(/<sub>([\s\S]*?)<\/sub>/g, "_$1")
    // A blank: an `.ab`, a box or a dotted line drawn by its style, a slot already (data-fill) or not.
    .replace(/<span (?:data-fill="\d*" ?)?(?:class="ab[^"]*"|style="display:inline-block;[^"]*border[^"]*")[^>]*>((?:(?!<\/?span)[\s\S])*?)<\/span>/g, (_, x: string) => `[${x.replace(/<[^>]+>/g, "").replace(/&nbsp;|\s/g, "") || "□"}]`)
    .replace(/<(td|th)[^>]*>/g, " | ")
    .replace(/<\/tr>/g, " ¶ ")
    .replace(/<div class="pm"[^>]*>[\s\S]*?<\/div>|<span class="pm"[^>]*>[\s\S]*?<\/span>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** A label's pieces, as the phone matches a key's part to a printed sub-question (src/questionView.ts). */
const pieces = (s: string) =>
  s
    .split(" · ")[0]
    .toLowerCase()
    .replace(/([a-z])(?=\d)|(\d)(?=[a-z])/g, "$1$2 ")
    .split(/[^0-9a-z஀-௿]+/)
    .filter(Boolean);
const samePart = (key: string, printed: string) => {
  const k = pieces(key);
  const p = pieces(printed);
  return k.length > 0 && p.length > 0 && (k[k.length - 1] === p[p.length - 1] || k.join("") === p.join(""));
};

/** Each printed sub-question (`.rp` with its label) as a stretch of the card's HTML: [start, end). */
export function blocks(h: string): { label: string; s: number; e: number }[] {
  const out: { label: string; s: number; e: number }[] = [];
  // Any .rp, as the phone finds them (a style after the class too: G7 U02 Q52's "(i)" … "(iv)" set in by 8 mm).
  const re = /<div class="rp(?: [^"]*)?"[^>]*><span class="rl">([\s\S]*?)<\/span>/g;
  for (let m = re.exec(h); m; m = re.exec(h)) out.push({ label: m[1].replace(/<[^>]+>/g, ""), s: m.index, e: h.length });
  out.forEach((b, i) => (b.e = i + 1 < out.length ? out[i + 1].s : h.length));
  return out;
}

/** Where each of a card's key parts is printed (its stretch), in order, as the phone finds them; the card when none. */
export function partRanges(h: string, labels: string[]): [number, number][] {
  const bs = blocks(h);
  let from = 0;
  let last: [number, number] | null = null;
  return labels.map((p, i) => {
    if (last && p.includes(" · ") && i > 0 && p.split(" · ")[0] === labels[i - 1].split(" · ")[0]) return last;
    for (let j = from; j < bs.length; j++) {
      if (!samePart(p, bs[j].label)) continue;
      from = j + 1;
      return (last = [bs[j].s, bs[j].e]);
    }
    return (last = [0, h.length]);
  });
}

// ---------------------------------------------------------------- kinds in words, and the app's own reading of words

const ratText = ([n, d]: [number, number]) => (d === 1 ? String(n) : `${n}/${d}`);

/** What the phone read from a key's words (version 1) as a kind, or null: the same answers, now said by the book. */
export function fromWords(a: string): Ans | null {
  // A directed number's sign ("+7", "(+3)") is the same number for the phone (its pad has no + for numbers).
  const w = wantsOf(a) ?? wantsOf(a.replace(/(^|[\s(*=⇒:,·])\+(?=\d)/g, "$1"));
  if (!w || !w.want.length) return null;
  const b: BoxAns[] = [];
  for (const x of w.want) {
    const bx: BoxAns = { v: [] };
    if (x.box.l) bx.l = x.box.l;
    if (x.box.u) bx.u = x.box.u;
    if (x.box.j) bx.j = x.box.j;
    if ("ok" in x) {
      let t = x.t;
      if (bx.u && t.endsWith(bx.u)) t = t.slice(0, -bx.u.length).trim();
      const first = ratText(x.ok[0]);
      bx.v = [/^-?(\d+ \d+\/\d+|\d+\/\d+|\d*\.\d+|\d+)$/.test(t) ? t : first, ...x.ok.slice(1).map(ratText)];
    } else if ("vals" in x) bx.v = [x.t];
    else return null;
    b.push(bx);
  }
  return { k: "box", b, ...(w.anyOrder ? { any: true } : {}) };
}

function kindWords(t: Ans | undefined): string {
  if (!t) return "—";
  switch (t.k) {
    case "box":
    case "fill":
      return `${t.k} ${t.b.map((x) => `${x.j ? `${x.j} ` : ""}[${[x.l, x.v.join(" | "), x.u].filter(Boolean).join(" ")}${x.w ? " (word)" : ""}${x.same ? " (so)" : ""}]`).join(" ")}${t.any ? " any order" : ""}`;
    case "choose":
      return `choose (${t.a})/${t.n}${t.below ? ` names: ${t.items?.join(" | ")}` : ""}`;
    case "tf":
      return `tf ${t.a.map((x) => (x ? "✓" : "✗")).join(" ")}`;
    case "mark":
      return `mark ${t.a.join(",")} of ${t.items?.join(" | ") ?? t.n}`;
    case "order":
      return `order ${t.a.map((i) => t.items[i - 1]).join(", ")}`;
    case "match":
      return `match ${t.l.map((x, i) => `${x}→${t.r[t.a[i] - 1]}`).join(" · ")}`;
    case "why":
      return `why ${t.a ? "ஆம்" : "இல்லை"}`;
    default:
      return t.k;
  }
}

// ---------------------------------------------------------------- review

const squash = (x: string) =>
  x.replace(/[\s°]/g, "").replace(/[−–]/g, "-").replace(/×/g, "*").replace(/ரூபா|ரூ\.?|Rs\.?/g, "").toLowerCase();
/** What the app read is not the key's bold answer ("**2ax**" read as 2). */
function boldOdd(a: string, t: Ans | null): boolean {
  const runs = [...a.matchAll(/\*\*(.+?)\*\*/g)].map((m) => squash(m[1]));
  if (!t || t.k !== "box" || !runs.length) return false;
  const said = squash(t.b.map((x) => `${x.l ?? ""}${x.v[0]}${x.u ?? ""}`).join(","));
  const bare = squash(t.b.map((x) => x.v[0]).join(","));
  const ok = (r: string) => r === said || r === bare || r.replace(/^[a-zஅ-ஹ]+=/, "") === bare;
  return !runs.some(ok) && runs.join(",") !== said && runs.join(",") !== bare && !t.b.every((x, i) => runs[i] !== undefined && (runs[i] === squash(`${x.l ?? ""}${x.v[0]}${x.u ?? ""}`) || runs[i].replace(/^[a-zஅ-ஹ]+=/, "") === squash(x.v[0])));
}

function review(udir: string, all: boolean, from = 1, to = Infinity) {
  const { u, html, last, key } = load(udir);
  const v2 = (u.answers ?? []).some((k) => k.t || k.parts?.some((p) => p.t));
  console.log(`${u.unit.key} ${u.unit.en} · ${u.unit.ta} · ${last} questions · key: ${u.answers ? (v2 ? "kinds" : "words") : "NONE"} · fixes ${u.fixes.length}`);
  const quick: string[] = [];
  for (let q = Math.max(1, from); q <= Math.min(last, to); q++) {
    const h = html.get(q) ?? "";
    const k = key.get(q);
    const part = partOf(u.data, q);
    const rows = k?.parts?.length ? k.parts : k ? [{ p: "", a: k.a ?? "", m: outOf(u.data, q) ?? 0, t: k.t }] : [];
    const autoOf = (p: KeyPart) => (p.t ? null : fromWords(p.a));
    // A decision: a photo, nothing the app can read, a matching (its printed columns), a form the wording asks for.
    const decide = (p: KeyPart) => (!p.t && !autoOf(p)) || p.t?.k === "photo" || p.t?.k === "match";
    if (!all && rows.length && !rows.some(decide)) {
      const text = plain(h).replace(/^\d+\s*/, "");
      const form = /சுருக்கு|கலப்பு|தசம|பின்னமாக|எளிய|சதவீதமாக|விகிதமாக|நியம|காரணி/.test(text) ? " FORM?" : "";
      // A label read from "a + b + c + d = 360" is only its last letter ("d ="): the sum was the answer.
      const label = rows.some((p) => {
        const t = p.t ?? autoOf(p);
        return t?.k === "box" && t.b.some((x) => x.l && new RegExp(String.raw`[+\-−×]\s*${x.l.replace(/[^A-Za-z]/g, "")}\s*=`).test(p.a));
      })
        ? " LABEL?"
        : "";
      const bold = rows.some((p) => boldOdd(p.a, p.t ? null : autoOf(p))) ? " BOLD?" : "";
      quick.push(`Q${q}${form}${label}${bold} ${rows.map((p) => `${p.p ? `${p.p}:` : ""}${kindWords(p.t ?? autoOf(p) ?? undefined).replace(/^box /, "")}`).join(" · ")}  ← ${text.slice(0, 70)}`);
      continue;
    }
    console.log(`\nQ${q} [${part?.id} · ${outOf(u.data, q)} marks]${h ? "" : " (not printed in the app)"}`);
    if (part?.kind === "cards") {
      const bs = blocks(h);
      const lead = plain(h.slice(0, bs[0]?.s ?? h.length));
      if (lead) console.log(`  ${lead}`);
      for (const bl of bs) console.log(`  ${plain(h.slice(bl.s, bl.e))}`);
    } else console.log(`  ${plain(h)}`);
    if (!rows.length) console.log("  KEY: none");
    for (const p of rows) {
      const auto = autoOf(p);
      const odd = boldOdd(p.a, auto) ? " BOLD?" : "";
      console.log(`  ${p.p ? `${p.p}: ` : ""}KEY ${JSON.stringify(p.a)} [${p.m}] · ${p.t ? kindWords(p.t) : auto ? `words → ${kindWords(auto)}${odd}` : "GAP"}`);
    }
  }
  if (quick.length) console.log(`\nREAD FROM WORDS OR KINDS ALREADY (${quick.length}):\n${quick.join("\n")}`);
}

// ---------------------------------------------------------------- build

type Edit = { at: number; del: number; ins: string };

const inTag = (h: string, i: number) => h.lastIndexOf("<", i - 1) > h.lastIndexOf(">", i - 1);

/** The edits one op makes in [s, e) of a question's HTML, or why it can't. */
function opEdits(h: string, s: number, e: number, op: Op): Edit[] | string {
  const out: Edit[] = [];
  const seg = h.slice(s, e);
  if (op.kind === "fill") {
    // Only an empty box is a blank (a box with "+3" printed in it is part of the question): an `.ab`, or a box or a
    // dotted line drawn by its style (G7 U08 Q37 "□ + (−6) = (+3)", Q52 "(+5) + (……) = (……)").
    const re = /<span (?:class="ab(?: [^"]*)?"|style="display:inline-block;[^"]*border[^"]*")[^>]*>(?=(?:\s|&nbsp;|&#160;)*<\/span>)/g;
    let skip = op.skip ?? 0;
    for (let m = re.exec(seg); m && out.length < op.n; m = re.exec(seg)) {
      if (/data-fill/.test(m[0])) continue;
      if (skip > 0) {
        skip--;
        continue;
      }
      out.push({ at: s + m.index + 5, del: 0, ins: ' data-fill="0"' });
    }
    return out.length === op.n ? out : `${op.n} blanks wanted, ${out.length} printed there`;
  }
  if (op.kind === "opt") {
    const at = seg.indexOf('<div class="mcq"');
    if (at < 0) return "no printed options (.mcq) there";
    const re = /<span>(?=<b>\(?[^()<]{1,5}\)<\/b>)/g; // (1) … (4), (I) … (IV), (a) …, I) … IV)
    re.lastIndex = at;
    for (let m = re.exec(seg); m && out.length < op.n; m = re.exec(seg)) out.push({ at: s + m.index + 5, del: 0, ins: ' data-opt="0"' });
    return out.length === op.n ? out : `${op.n} options wanted, ${out.length} printed`;
  }
  if (op.kind === "swap") {
    const i = seg.indexOf(op.from);
    if (i < 0 || inTag(h, s + i)) return `"${op.from}" is not printed here`;
    if (seg.indexOf(op.from, i + 1) >= 0) return `"${op.from}" is printed more than once: give more of the words around it`;
    return [{ at: s + i, del: op.from.length, ins: op.to }];
  }
  if (op.kind === "tick" && op.cell) {
    // ✓ / ✗ written in a table's empty cells (G7 U02 Q24: a statement a row, its last cell empty): a slot in each.
    const re = /<td\b[^>]*>(?=(?:\s|&nbsp;|&#160;)*<\/td>)/g;
    for (let m = re.exec(seg); m && out.length < op.n; m = re.exec(seg)) out.push({ at: s + m.index + m[0].length, del: 0, ins: '<span data-tick="0"></span>' });
    return out.length === op.n ? out : `${op.n} empty cells wanted, ${out.length} printed`;
  }
  if (op.kind === "tick") {
    const re = new RegExp(op.pat ?? String.raw`\((?:\s|&nbsp;|&#160;| | )*\)`, "g");
    for (let m = re.exec(seg); m && out.length < op.n; m = re.exec(seg)) {
      if (inTag(h, s + m.index)) continue;
      out.push({ at: s + m.index, del: m[0].length, ins: `<span data-tick="0">${m[0]}</span>` });
    }
    return out.length === op.n ? out : `${op.n} brackets wanted, ${out.length} printed`;
  }
  if (op.kind === "mark") {
    let from = 0;
    for (const w of op.words) {
      let i = seg.indexOf(w, from);
      while (i >= 0 && inTag(h, s + i)) i = seg.indexOf(w, i + 1);
      if (i < 0) return `"${w}" not found in order`;
      // Words more than one (G7 U02 Q25's statements: "which are sets?") wrap as the line's text does (`.mk-l`): in a box
      // of their own they went under their label, centred.
      const long = /\s/.test(w.replace(/<[^>]+>/g, "").trim());
      out.push({ at: s + i, del: w.length, ins: `<span data-mark="0"${long ? ' class="mk-l"' : ""}>${w}</span>` });
      from = i + w.length;
    }
    return out;
  }
  if (op.kind === "dots") {
    // A run of dots (three or more, or "…") outside a tag becomes an empty blank box.
    const re = /(?:…|\.{3,})(?:[\s.…]|&nbsp;)*/g;
    for (let m = re.exec(seg); m && out.length < op.n; m = re.exec(seg)) {
      if (inTag(h, s + m.index)) continue;
      const lead = /^\s*/.exec(m[0])![0];
      out.push({ at: s + m.index + lead.length, del: m[0].trimEnd().length - lead.length, ins: '<span class="ab" style="width:16mm"></span>' });
    }
    return out.length === op.n ? out : `${op.n} dotted blanks wanted, ${out.length} printed`;
  }
  const [sel, nth] = op.sel.split(":");
  const re = sel.startsWith(".") ? new RegExp(`<([a-z0-9]+)(?=[^>]*\\sclass="[^"]*\\b${sel.slice(1)}\\b)`, "g") : new RegExp(`<${sel}\\b`, "g");
  let k = 0;
  for (let m = re.exec(seg); m; m = re.exec(seg)) {
    if (nth !== "*" && ++k < Number(nth ?? 1)) continue;
    const tag = sel.startsWith(".") ? m[1] : sel;
    out.push({ at: s + m.index + 1 + tag.length, del: 0, ins: ' data-paper="1"' });
    if (nth !== "*") return out;
  }
  return out.length ? out : `no ${op.sel} there`;
}

/** The slots numbered in printed order inside the card, as the engine numbers them. */
const numberSlots = (h: string) => {
  const n: Record<string, number> = {};
  return h.replace(/data-(fill|opt|tick|mark)="[^"]*"/g, (_, a: string) => `data-${a}="${(n[a] = (n[a] ?? 0) + 1)}"`);
};

/**
 * Why an answer can't be typed on the phone's pad for its box ("" = it can): the keys of src/family/play.tsx (NUM_KEYS,
 * exprKeys). 11 Nov 2026, a student's call: G8 Mass Q12 "1.05 t" was a box in the letter t (a tonne read as algebra),
 * and the letters' pad has no decimal point. A unit belongs in `u`, never in the answer.
 */
function padProblem(box: Box, v: string): string {
  if (box.k !== "num" && box.k !== "expr") return "";
  const t = normalize(v).toLowerCase();
  if (box.k === "num") {
    const bad = [...new Set(t.replace(/[0-9./\- ]/g, ""))];
    return bad.length ? `"${v}" needs ${bad.join(" ")}: not on the number pad (a unit goes in u, a word in a word box)` : "";
  }
  const L = [...box.v.toLowerCase()];
  const need: string[] = [];
  const rest = t.replace(/\s+/g, "").replace(/\^2(?!\d)/g, "");
  for (const ch of new Set(rest)) {
    if (/[0-9+\-()]/.test(ch) || L.includes(ch)) continue;
    // × between letters or powers is never typed (letters side by side multiply); between two numbers it must be.
    if (ch === "*" && (L.length < 2 || !/\d\*\d/.test(rest))) continue;
    if (ch === "/" && L.length < 3) continue;
    if (ch === "^" && (!L.length || box.p)) continue;
    if (ch === "=" && box.eq) continue;
    need.push(ch === "." ? "a decimal point" : ch);
  }
  return need.length ? `"${v}" needs ${need.join(" ")}: not on the letters' pad [${L.join(" ")}]${/[a-z]/.test(t) && need.includes("a decimal point") ? " (a unit read as a letter? give num(v, { u }))" : ""}` : "";
}

/** A question's HTML without its slots (a digitized question decided again: its ops find the printed page as it was). */
function unslot(h: string): string {
  let out = h.replace(/ data-(?:fill|opt)="\d*"/g, "");
  for (;;) {
    const m = /<span data-(?:tick|mark)="\d*"(?: class="mk-l")?>/.exec(out);
    if (!m) return out;
    // Its closing tag: the one that brings the depth of spans back.
    const re = /<span\b|<\/span>/g;
    re.lastIndex = m.index + m[0].length;
    let depth = 1;
    let end = -1;
    for (let x = re.exec(out); x; x = re.exec(out)) {
      depth += x[0] === "</span>" ? -1 : 1;
      if (depth === 0) {
        end = x.index;
        break;
      }
    }
    if (end < 0) return out;
    out = out.slice(0, m.index) + out.slice(m.index + m[0].length, end) + out.slice(end + "</span>".length);
  }
}

/** What a kind's answer is when typed as the key gives it (the phone's list for that part). */
function typedFor(t: Ans): string[] {
  switch (t.k) {
    case "box":
    case "fill":
      return t.b.map((x) => x.v[0]);
    case "choose":
      return [String(t.a)];
    case "tf":
      return t.a.map((x) => (x ? "1" : "0"));
    case "mark":
      return Array.from({ length: t.n }, (_, i) => (t.a.includes(i + 1) ? "1" : "0"));
    case "order":
    case "match":
      return t.a.map(String);
    case "why":
      return [t.a ? "1" : "0", "made-up reason"];
    case "say":
      return ["made-up words"];
    default:
      return [];
  }
}

const isSplit = (x: Spec | Split): x is Split => "split" in x;

async function build(udir: string) {
  const { u, html, last, key } = load(udir);
  const kindsFile = join(udir, "kinds.ts");
  const K: Kinds = existsSync(kindsFile) ? ((await import(pathToFileURL(kindsFile).href)).default as Kinds) : {};
  const answers: KeyAnswer[] = [];
  const problems: string[] = [];
  const changed = new Map<number, string>();
  for (let q = 1; q <= last; q++) {
    const marks = outOf(u.data, q);
    if (!marks) continue;
    const h0 = html.get(q) ?? "";
    const k = key.get(q);
    const d: Decision | undefined = K[q];
    const short = partOf(u.data, q)?.kind === "short";
    const edits: { range: "card" | number; op: Op }[] = [];
    const take = (s: Spec, range: "card" | number) => (s.ops ?? []).forEach((op) => edits.push({ range: s.card ? "card" : range, op }));
    let rows: KeyPart[];
    if (short) {
      if (d && "t" in d && (d as Spec).t) {
        const s = d as Spec;
        rows = [{ p: "", a: (k?.a?.trim() && !s.aNew ? k.a : s.a) ?? "", m: marks, t: s.t }];
        take(s, "card");
      } else if (d && !("t" in d) && !("ops" in d)) {
        const ps = Object.entries(d as Record<string, Spec>);
        rows = ps.map(([p, s]) => ({ p, a: s.a ?? "", m: marks / ps.length, t: s.t }));
        ps.forEach(([, s]) => take(s, "card"));
      } else {
        rows = k ? (k.parts?.length ? k.parts.map((p) => ({ ...p })) : [{ p: "", a: k.a ?? "", m: marks, t: k.t }]) : [];
        if (d) take(d as Spec, "card");
      }
    } else {
      const map = (d ?? {}) as Record<string, Spec | Split>;
      rows = [];
      for (const p of k?.parts ?? []) {
        const x = map[p.p];
        if (!x) rows.push({ ...p });
        else if (isSplit(x)) {
          const sum = x.split.reduce((a, [, m]) => a + m, 0);
          if (sum !== p.m) problems.push(`Q${q} ${p.p}: the split's marks ${sum}, the part's ${p.m}`);
          if (x.split.some(([, m]) => !(m > 0))) problems.push(`Q${q} ${p.p}: each answer of a split needs a mark at least`);
          for (const [w, m, s] of x.split) {
            rows.push({ p: `${p.p} · ${w}`, a: s.a ?? "", m, t: s.t });
            take(s, rows.length - 1);
          }
        } else {
          // The key's own words stay (the working and the reason the teachers read: "✗ (√196 = 14)"); a kind's words
          // only where the key has none.
          rows.push({ ...p, a: p.a?.trim() && !x.aNew ? p.a : (x.a ?? ""), t: x.t ?? p.t, ...(x.m ? { m: x.m } : {}) });
          take(x, rows.length - 1);
        }
      }
      for (const name of Object.keys(map)) {
        if (name === "@") take(map["@"] as Spec, "card");
        else if (!(k?.parts ?? []).some((p) => p.p === name)) problems.push(`Q${q}: kinds.ts names a part "${name}" the key doesn't have (${(k?.parts ?? []).map((p) => p.p).join(", ")})`);
      }
    }
    if (!rows.length) {
      problems.push(`Q${q}: no answer in the key: give it in kinds.ts`);
      continue;
    }
    for (const r of rows) {
      if (!r.t) {
        const auto = fromWords(r.a);
        if (auto) r.t = auto;
        else problems.push(`Q${q}${r.p ? ` ${r.p}` : ""}: no kind (key ${JSON.stringify(r.a)}): give it in kinds.ts`);
      }
      if (!r.a.trim()) r.a = kindWords(r.t);
    }
    // The printed question: its slots and its blocks for paper only. Dotted blanks become boxes first (a pass of their
    // own), so the blanks' slots are then found like any printed box.
    // A question decided again (its slots already in the app's copy): its ops start from the page without slots.
    const h00 = edits.length && /data-(?:fill|opt|tick|mark)=/.test(h0) ? unslot(h0) : h0;
    let h1 = h00;
    if (edits.some((e) => e.op.kind === "dots")) {
      const ranges = partRanges(h00, rows.map((r) => r.p));
      const ds: Edit[] = [];
      for (const ed of edits.filter((e) => e.op.kind === "dots")) {
        const [s, e] = ed.range === "card" ? [0, h00.length] : ranges[ed.range];
        const got = opEdits(h00, s, e, ed.op);
        if (typeof got === "string") problems.push(`Q${q}: ${got}`);
        else ds.push(...got);
      }
      ds.sort((a, b2) => b2.at - a.at);
      for (const ed of ds) h1 = h1.slice(0, ed.at) + ed.ins + h1.slice(ed.at + ed.del);
    }
    const rest = edits.filter((e) => e.op.kind !== "dots");
    if (rest.length || h1 !== h0) {
      const h0b = h1;
      const ranges = partRanges(h0b, rows.map((r) => r.p));
      const all: Edit[] = [];
      for (const ed of rest) {
        const [s, e] = ed.range === "card" ? [0, h0b.length] : ranges[ed.range];
        const got = opEdits(h0b, s, e, ed.op);
        if (typeof got === "string") problems.push(`Q${q}: ${got}`);
        else all.push(...got);
      }
      all.sort((a, b2) => b2.at - a.at);
      let h = h0b;
      for (const ed of all) h = h.slice(0, ed.at) + ed.ins + h.slice(ed.at + ed.del);
      h = numberSlots(h);
      if (h !== h0) {
        const bad = unsafeHtml(h);
        if (bad) problems.push(`Q${q}: ${bad}`);
        changed.set(q, h);
      }
    }
    answers.push(short && rows.length === 1 && rows[0].p === "" ? { q, a: rows[0].a, t: rows[0].t } : { q, parts: rows });
  }
  const outDir = join(udir, "out");
  mkdirSync(outDir, { recursive: true });
  if (problems.length) {
    console.log(`${u.unit.key}: ${problems.length} to fix\n  ${problems.join("\n  ")}`);
    return false;
  }
  // The app's own checks.
  const bad = checkKey(answers, u.data);
  if (bad.length) problems.push(...bad);
  for (const a of answers) {
    const h = changed.get(a.q) ?? html.get(a.q);
    const wrong = h ? slotProblem(a, h) : "";
    if (wrong) problems.push(`Q${a.q}: ${wrong}`);
  }
  // The phone marks every answer typed as the key gives it right, and nothing typed as 0.
  const keys = phoneKey(answers, u.data);
  const count = { phone: 0, read: 0, photo: 0 };
  const marks = { phone: 0, read: 0, photo: 0 };
  const photos: string[] = [];
  for (const a of answers) {
    const kq = keys.get(a.q) as KeyQ;
    const rows = a.parts ?? [{ p: "", a: a.a ?? "", t: a.t }];
    const typed = rows.flatMap((r) => (r.t ? typedFor(r.t) : []));
    if (typed.length !== boxCount(kq)) problems.push(`Q${a.q}: ${typed.length} answers typed, the phone has ${boxCount(kq)} boxes`);
    rows.forEach((r, i) => {
      if (r.t?.k !== "box" && r.t?.k !== "fill") return;
      const want = kq.parts[i]?.want ?? [];
      r.t.b.forEach((b, j) => {
        const box = want[j]?.box;
        for (const v of box && !b.w ? b.v : []) {
          const bad = padProblem(box!, v);
          if (bad) problems.push(`Q${a.q}${r.p ? ` ${r.p}` : ""}: ${bad}`);
        }
      });
    });
    const res = markQuestion(kq, typed);
    const none = markQuestion(kq, typed.map(() => ""));
    kq.parts.forEach((p, i) => {
      const kind = phonePart(p) ? "phone" : readPart(p) ? "read" : "photo";
      count[kind]++;
      marks[kind] += p.m;
      if (kind === "photo") photos.push(`Q${a.q}${p.p ? ` ${p.p}` : ""}`);
      if (kind === "phone" && res.parts[i] !== p.m) problems.push(`Q${a.q}${p.p ? ` ${p.p}` : ""}: the key's own answer gets ${res.parts[i]} of ${p.m} on the phone (${wantWords(p)})`);
      if (kind === "phone" && p.m > 0 && none.parts[i] !== 0) problems.push(`Q${a.q}${p.p ? ` ${p.p}` : ""}: nothing typed gets ${none.parts[i]}`);
    });
  }
  const report = `${u.unit.key}: ${answers.length} questions · the phone marks ${marks.phone} marks (${count.phone} parts) · a teacher reads ${marks.read} (${count.read}) · photos ${marks.photo} marks (${count.photo})${photos.length ? `: ${photos.join(", ")}` : ""} · ${changed.size} printed questions changed`;
  if (problems.length) {
    console.log(`${u.unit.key}: ${problems.length} to fix\n  ${problems.join("\n  ")}`);
    return false;
  }
  writeFileSync(join(outDir, "answers.json"), JSON.stringify(answers, null, 1));
  writeFileSync(join(outDir, "items.json"), JSON.stringify([...changed].map(([q, h]) => ({ q, html: h }))));
  writeFileSync(join(outDir, "report.txt"), report + "\n");
  console.log(report);
  return true;
}

// ---------------------------------------------------------------- push

async function push(dir: string, keys: string[], drop = false) {
  const reqs: Req[] = [];
  for (const key of keys) {
    const udir = join(dir, key);
    const u = readJson<Unit>(join(udir, "unit.json"));
    const answers = readJson<KeyAnswer[]>(join(udir, "out", "answers.json"));
    const items = readJson<{ q: number; html: string }[]>(join(udir, "out", "items.json"));
    const size = items.reduce((a, it) => a + it.html.length, 0) + JSON.stringify(answers).length;
    if (size > 1_400_000) throw new Error(`${key}: ${size} letters in one save: split it`);
    // The answers a teacher typed in the app (Settings → Books) override the key at their parts: kept, unless `drop`
    // (they were decided again in kinds.ts).
    if (u.fixes.length) console.log(`${key}: ${u.fixes.length} answers typed in the app ${drop ? "are dropped" : `still override the key (${u.fixes.map((f) => `Q${f.q}${f.p ? ` ${f.p}` : ""}`).join(", ")}): decide them in kinds.ts and add "drop" to replace them`}`);
    reqs.push({ name: key, fn: "tell", req: { op: "save", unitId: u.unit.unitId, answers, items, dropFixes: drop } });
  }
  const got = await exchange(reqs);
  for (const key of keys) {
    const a = got[key];
    console.log(`${key}: ${a?.ok ? `saved ${JSON.stringify(a.saved)} · the phone now: ${JSON.stringify(a.share)}` : `NOT SAVED: ${a?.error}`}`);
  }
}

// ---------------------------------------------------------------- show, ship, help (one question put right)

/** One question as the app has it, in a few lines: its words by part, each part's label, marks, key and kind. */
function show(udir: string, qs: number[]) {
  const { u, html, key } = load(udir);
  for (const q of qs) {
    const h = html.get(q) ?? "";
    const k = key.get(q);
    const part = partOf(u.data, q);
    console.log(`${u.unit.key} Q${q} [${part?.kind === "short" ? "short: one answer, or { name: kind } for two" : "parts: { label: kind }"} · ${outOf(u.data, q)} marks]${h ? "" : " (not printed in the app)"}`);
    const bs = part?.kind === "cards" ? blocks(h) : [];
    if (bs.length) {
      const lead = plain(h.slice(0, bs[0].s));
      if (lead) console.log(`  ${lead}`);
      for (const bl of bs) console.log(`  ${plain(h.slice(bl.s, bl.e))}`);
    } else console.log(`  ${plain(h)}`);
    const n = (re: RegExp) => (h.match(re) ?? []).length;
    console.log(
      `  printed: ${n(/<span (?:class="ab(?: [^"]*)?"|style="display:inline-block;[^"]*border[^"]*")[^>]*>(?:\s|&nbsp;)*<\/span>/g)} blanks · ${n(/<span><b>\(?[^()<]{1,5}\)<\/b>/g)} options · ${n(/<svg/g)} figures · ${n(/<table/g)} tables · slots now: ${n(/data-fill=/g)} fill, ${n(/data-opt=/g)} opt, ${n(/data-tick=/g)} tick, ${n(/data-mark=/g)} mark, ${n(/data-paper/g)} paper-only`,
    );
    const rows = k?.parts?.length ? k.parts : k ? [{ p: "", a: k.a ?? "", m: outOf(u.data, q) ?? 0, t: k.t }] : [];
    if (!rows.length) console.log("  KEY: none");
    for (const f of u.fixes.filter((x) => x.q === q)) console.log(`  TYPED IN THE APP by a teacher, overrides the key: ${f.p ? `"${f.p}": ` : ""}${JSON.stringify(f.a)}`);
    for (const p of rows) console.log(`  ${p.p ? `"${p.p}": ` : ""}KEY ${JSON.stringify(p.a)} [${p.m}] · ${p.t ? kindWords(p.t) : fromWords(p.a) ? `words → ${kindWords(fromWords(p.a)!)}` : "GAP (a photo)"}`);
  }
}

/** build → push → read back and compare, a unit a line. Nothing is sent unless every check passes. */
async function ship(dir: string, keys: string[], drop = false) {
  for (const key of keys) if (!(await build(join(dir, key)))) throw new Error(`${key}: not sent (fix kinds.ts, then ship again)`);
  await push(dir, keys, drop);
  const got = await exchange(
    keys.map((key) => ({ name: key, fn: "ask" as const, req: { op: "unit", unitId: readJson<Unit>(join(dir, key, "unit.json")).unit.unitId } })),
    () => {},
  );
  let ok = true;
  for (const key of keys) {
    const a = got[key];
    const answers = readJson<KeyAnswer[]>(join(dir, key, "out", "answers.json"));
    const items = readJson<{ q: number; html: string }[]>(join(dir, key, "out", "items.json"));
    const sizes = new Map(((a?.questions ?? []) as { q: number; size: number }[]).map((x) => [x.q, x.size]));
    const same = a?.ok && isDeepStrictEqual(a.answers, answers) && items.every((it) => sizes.get(it.q) === it.html.length);
    ok = ok && !!same;
    console.log(`${key}: ${same ? "IN THE APP, read back the same as built" : `READ BACK DIFFERENT (${a?.ok ? "the key or a question" : a?.error}): pull and look`} · ${JSON.stringify(a?.share?.parts ?? {})}`);
  }
  if (!ok) process.exitCode = 1;
}

/** The kinds' words, from their own comments in scripts/digitize-kinds.ts (always the current ones). */
function help() {
  const src = readFileSync(join(repo, "scripts", "digitize-kinds.ts"), "utf8");
  for (const m of src.matchAll(/\/\*\*((?:(?!\*\/)[\s\S])*)\*\/\nexport const (\w+)/g)) console.log(`${m[2]}: ${m[1].replace(/\s*\n\s*\*\s?/g, " ").trim()}`);
}

// ---------------------------------------------------------------- the command line

const [cmd, ...args] = process.argv.slice(2);
const main = async () => {
  // One carrier branch for the tool (emptied after each exchange), not a new one a run. Set here, not as the file
  // loads: scripts/skills.ts reads this file's helpers and carries on its own branch.
  process.env.LINK_BRANCH ??= "link-digitize";
  if (cmd === "pull") return pull(outside(args[0]), args.slice(1));
  if (cmd === "review") {
    const [f, t] = (args.find((x) => /^\d+-\d+$/.test(x)) ?? "1-9999").split("-").map(Number);
    return review(outside(args[0]), args.includes("all"), f, t);
  }
  if (cmd === "build") {
    let ok = true;
    for (const u of args) ok = (await build(outside(u))) && ok;
    if (!ok) process.exitCode = 1;
    return;
  }
  const drop = args.includes("drop");
  if (cmd === "push") return push(outside(args[0]), args.slice(1).filter((x) => x !== "drop"), drop);
  if (cmd === "show") return show(outside(args[0]), args.slice(1).map(Number));
  if (cmd === "ship") return ship(outside(args[0]), args.slice(1).filter((x) => x !== "drop"), drop);
  if (cmd === "help") return help();
  if (cmd === "units") return units(outside(args[0]), args[1] ?? "");
  console.log("usage: digitize.ts units <dir> <grade> | pull <dir> <KEY …> | show <dir>/<KEY> <Q …> | review <dir>/<KEY> [all] [from-to] | build <dir>/<KEY> … | ship <dir> <KEY …> | push <dir> <KEY …> | help");
};
if (process.argv[1] && basename(process.argv[1]).startsWith("digitize")) main().catch((e) => {
  console.error(String((e as Error).stack ?? e));
  process.exit(2);
});
