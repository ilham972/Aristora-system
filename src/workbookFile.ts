// Reading a workbook straight from the file its builder made (the past-paper-workbook engine's book.html, alone or
// inside the unit's source zip). The engine prints everything the app needs in a fixed form, so no AI is needed:
// - after each unit, its marks sheet: a row per part (பகுதி I, பகுதி II …), a cell per level "Level 6 · 53 – 57 · / 18";
// - every question with its printed number (<span class="qn">), short items (si: 2 marks each) and Part II cards (pq)
//   with the marks of each part (<span class="pm">(3 புள்ளிகள்)</span>, or the paper's own <div class="mk">);
// - a level strip after each level (<span class="lvo">/ 18</span>).
// This is the same reading as the engine's own marks_check (collection_book.py), plus the app's checkMaster.
// If a future engine renames these classes, uploads say "No marks sheet": fix this file, not the books.
// The zip may also carry answer-key.json (the engine's answers, by printed question number): it is checked against
// the book (numbers, and each question's marks, so a key from another version of the book is refused).

import { unzipSync } from "fflate";
import { checkMaster, outOf, partsForGrade, type MasterData, type MasterLevel, type MasterPart, type PartId } from "../convex/lib/book";
import { checkKey, type KeyAnswer } from "../convex/lib/key";

export type ReadWorkbook = {
  /** Where it came from ("G8_U01_Workbook_source_v3.zip"). */
  file: string;
  grade: number | null;
  unitNo: number;
  /** "U01" */
  code: string;
  en: string | null;
  ta: string | null;
  data: MasterData;
  total: number;
  /** Its answer key from answer-key.json in the same zip, or null (none in the file). */
  key: KeyAnswer[] | null;
  /** Empty when the book is right; otherwise plain words for the owner. */
  problems: string[];
};

const SHORT_MARKS = 2; // a Part I question (as printed: the engine's P1_MARK)

// A block that starts a page gets " pt" and its page footer inside (class="msh pt", "si pt", "bk pt", "lvl pt").
const SHEET = /<div class="msh(?: [^"]*)?"[^>]*>([\s\S]*?)<\/table>/g;
const HAS_SHEET = /<div class="msh[ "]/;
/** The answer key inside a unit's source zip. */
const KEY_FILE = /(^|\/)answer-key\.json$/i;
const TOKEN =
  /<div class="(si|pq)(?: [^"]*)?" data-q="\d+"|<span class="qn(?: q3)?">(\d+)<\/span>|<span class="pm">\((\d+)\s|<div class="mk">\((\d+)\s|<span class="lvo">\/ (\d+)<\/span>/g;
// A row per part; a part with many levels wraps onto more rows (its name and total span them: rowspan), and the
// continuation rows have no name cell (G8 U03 v4: Part II Levels 10-17, then 18-24).
const ROW = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
const ROW_NAME = /^\s*<td class="c0"[^>]*>([^<]*)<\/td>/;
const CELL = /<td(?: [^>]*)?><em>Level (\d+)<\/em><i>\s*(\d+)(?:\s*[–-]\s*(\d+))?\s*<\/i><b>\/\s*(\d+)<\/b><\/td>/g;
const ROW_TOTAL = /<td class="cz"[^>]*>[\s\S]*?<b>\/\s*(\d+)<\/b><\/td>/;

/** "பகுதி II" → "II"; Grades 10–11 "பகுதி IA" / "பகுதி I A" → "IA". */
function partIdOf(label: string): PartId | null {
  const m = /(II|I)\s*([AB])?(?![A-Za-z])/.exec(label);
  if (!m) return null;
  return `${m[1]}${m[2] ?? ""}` as PartId;
}

/** The grade printed most often ("தரம் 8" in every footer), or null. */
function gradeOf(html: string): number | null {
  const count = new Map<number, number>();
  for (const m of html.matchAll(/தரம்\s*(\d{1,2})/g)) {
    const g = Number(m[1]);
    if (g >= 6 && g <= 11) count.set(g, (count.get(g) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [g, n] of count) if (best === null || n > (count.get(best) ?? 0)) best = g;
  return best;
}

/** Grade and unit from a file name: "G8_U01_Workbook_source_v3.zip" → { grade: 8, unitNo: 1 }. */
export function nameHint(file: string): { grade: number | null; unitNo: number | null } {
  const m = /G(\d{1,2})[ _-]*U(\d{1,2})/i.exec(file);
  return m ? { grade: Number(m[1]), unitNo: Number(m[2]) } : { grade: null, unitNo: null };
}

/** Every unit in one book.html (a unit's own file, or a merged volume). [] when it has no marks sheet. */
export function readWorkbookHtml(html: string, file = "book.html"): ReadWorkbook[] {
  const out: ReadWorkbook[] = [];
  const hint = nameHint(file);
  const printedGrade = gradeOf(html);
  const grade = printedGrade ?? hint.grade;
  let from = 0;
  for (const sheet of html.matchAll(SHEET)) {
    const start = sheet.index ?? 0;
    const region = html.slice(from, start);
    from = start + sheet[0].length;
    const after = html.slice(from, from + 600);
    out.push(readUnit(region, sheet[1], after, html, grade, file, hint, printedGrade));
  }
  return out;
}

function readUnit(
  region: string,
  sheet: string,
  after: string,
  html: string,
  grade: number | null,
  file: string,
  hint: { grade: number | null; unitNo: number | null },
  printedGrade: number | null,
): ReadWorkbook {
  const problems: string[] = [];
  const head = /அலகு\s*(\d+)\s*·\s*([^<]*)<\/small>/.exec(sheet);
  const unitNo = head ? Number(head[1]) : (hint.unitNo ?? 0);
  if (!head) problems.push("The marks sheet has no unit number.");
  const ta = head ? head[2].trim() || null : null;
  const en = new RegExp(`UNIT ${unitNo} · ([^·<]+?) · PART`).exec(html)?.[1].trim() ?? null;
  const code = `U${String(unitNo).padStart(2, "0")}`;
  if (grade === null) problems.push("Can't find the grade (தரம்) in the book or the file name.");
  if (printedGrade !== null && hint.grade !== null && printedGrade !== hint.grade) {
    problems.push(`The book says Grade ${printedGrade} but the file name says Grade ${hint.grade}.`);
  }

  // The questions, in printed order: short items (2 marks) and cards (the marks of their parts).
  const items: { kind: "short" | "card"; n: number | null; marks: number }[] = [];
  const strips: number[] = [];
  for (const t of region.matchAll(TOKEN)) {
    if (t[1]) items.push({ kind: t[1] === "si" ? "short" : "card", n: null, marks: 0 });
    else if (t[2]) {
      const cur = items[items.length - 1];
      if (cur && cur.n === null) cur.n = Number(t[2]);
    } else if (t[3] || t[4]) {
      const cur = items[items.length - 1];
      if (cur) cur.marks += Number(t[3] ?? t[4]);
    } else if (t[5]) strips.push(Number(t[5]));
  }
  const n = items.length;
  if (n === 0) problems.push("No questions found before the marks sheet.");
  if (items.some((it, i) => it.n !== i + 1)) problems.push(`The question numbers don't run 1 to ${n}.`);
  const marksOf = (q: number) => {
    const it = items[q - 1];
    return !it ? 0 : it.kind === "short" ? SHORT_MARKS : it.marks;
  };
  items.forEach((it, i) => {
    if (it.kind === "card" && it.marks === 0) problems.push(`Question ${i + 1} prints no marks.`);
  });

  // The sheet: a row per part, a cell per level.
  const plan = grade !== null ? partsForGrade(grade) : [];
  const parts: MasterPart[] = [];
  const levels: MasterLevel[] = [];
  const rows: { name: string; total: number; levels: MasterLevel[] }[] = [];
  for (const row of sheet.matchAll(ROW)) {
    const cells: MasterLevel[] = [];
    for (const c of row[1].matchAll(CELL)) {
      const a = Number(c[2]);
      cells.push({ n: Number(c[1]), from: a, to: c[3] ? Number(c[3]) : a, max: Number(c[4]) });
    }
    const name = ROW_NAME.exec(row[1]);
    if (name) rows.push({ name: name[1], total: Number(ROW_TOTAL.exec(row[1])?.[1] ?? NaN), levels: cells });
    else if (rows.length) rows[rows.length - 1].levels.push(...cells); // the same part, wrapped onto another row
    else if (cells.length) problems.push("The marks sheet has levels before any part name.");
  }
  for (const row of rows) {
    const id = partIdOf(row.name);
    if (!id) {
      problems.push(`Can't read the part name "${row.name.trim()}".`);
      continue;
    }
    const kind = plan.find((p) => p.id === id)?.kind;
    if (grade !== null && !kind) problems.push(`Grade ${grade} workbooks have no part ${id}.`);
    const mine = row.levels;
    if (mine.length === 0) {
      problems.push(`Part ${id} has no levels on the marks sheet.`);
      continue;
    }
    const total = row.total;
    const sum = mine.reduce((s, l) => s + l.max, 0);
    if (total !== sum) problems.push(`Part ${id}: its levels add up to ${sum}, but its total says ${total}.`);
    const p0 = mine[0].from;
    const p1 = mine[mine.length - 1].to;
    for (let q = p0; q <= p1 && q <= n; q++) {
      if (kind === "short" && items[q - 1].kind !== "short") problems.push(`Question ${q} is a long question inside part ${id}.`);
      if (kind === "cards" && items[q - 1].kind !== "card") problems.push(`Question ${q} is a short question inside part ${id}.`);
    }
    parts.push(kind === "short" ? { id, from: p0, to: p1, kind, each: SHORT_MARKS } : { id, from: p0, to: p1, kind: "cards" });
    levels.push(...mine);
  }
  if (levels.length === 0) problems.push("The marks sheet has no levels.");

  // Every level adds up, and the strips printed in the book say the same.
  for (const l of levels) {
    let sum = 0;
    for (let q = l.from; q <= l.to; q++) sum += marksOf(q);
    if (sum !== l.max) problems.push(`Level ${l.n} prints / ${l.max}, but its questions add up to ${sum}.`);
  }
  if (strips.length !== levels.length || strips.some((m, i) => m !== levels[i]?.max)) {
    problems.push("The level strips in the book don't match its marks sheet.");
  }
  const last = levels.length ? levels[levels.length - 1].to : 0;
  if (n && last !== n) problems.push(`The levels stop at question ${last}; the book has ${n}.`);
  const total = levels.reduce((s, l) => s + l.max, 0);
  const printedTotal = /<span class="mso">\/\s*(\d+)<\/span>/.exec(after)?.[1];
  if (printedTotal !== undefined && Number(printedTotal) !== total) {
    problems.push(`The unit's total says ${printedTotal}, but its levels add up to ${total}.`);
  }

  const marks: Record<string, number> = {};
  items.forEach((it, i) => {
    if (it.kind === "card" && it.marks > 0) marks[String(i + 1)] = it.marks;
  });
  const data: MasterData = { kind: "master", parts, levels, marks };
  if (problems.length === 0) problems.push(...checkMaster(data));
  return { file, grade, unitNo, code, en, ta, data, total, key: null, problems: [...new Set(problems)] };
}

/** answer-key.json as the workbook engine writes it. */
export type KeyFile = {
  grade: number | null;
  units: { no: number; answers: KeyAnswer[]; marks: Map<number, number> }[];
};

/** Read answer-key.json; a string = what's wrong with it, in plain words. */
export function readKeyFile(text: string): KeyFile | string {
  const bad = "The answer key file isn't one the app knows.";
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch {
    return "The answer key file can't be read.";
  }
  const o = j as { kind?: unknown; version?: unknown; grade?: unknown; units?: unknown };
  if (!o || typeof o !== "object" || o.kind !== "aristora-answer-key" || o.version !== 1 || !Array.isArray(o.units)) return bad;
  const units: KeyFile["units"] = [];
  for (const u of o.units as { no?: unknown; questions?: unknown }[]) {
    if (typeof u?.no !== "number" || !Array.isArray(u.questions)) return bad;
    const answers: KeyAnswer[] = [];
    const marks = new Map<number, number>();
    for (const x of u.questions as { q?: unknown; marks?: unknown; a?: unknown }[]) {
      if (typeof x?.q !== "number") return bad;
      if (typeof x.marks === "number") marks.set(x.q, x.marks);
      if (typeof x.a === "string") answers.push({ q: x.q, a: x.a });
      else if (Array.isArray(x.a)) {
        const parts = (x.a as { p?: unknown; a?: unknown; m?: unknown }[]).map((r) => ({
          p: String(r?.p ?? ""),
          a: String(r?.a ?? ""),
          ...(typeof r?.m === "number" ? { m: r.m } : {}),
        }));
        answers.push({ q: x.q, parts });
      } else return bad;
    }
    units.push({ no: u.no, answers, marks });
  }
  return { grade: typeof o.grade === "number" ? o.grade : null, units };
}

/** Put a unit's answers on the workbook read from the same zip, or say why they don't fit it. */
function attachKey(w: ReadWorkbook, file: KeyFile): void {
  const mine = file.units.find((u) => u.no === w.unitNo);
  if (!mine || mine.answers.length === 0) return;
  if (file.grade !== null && w.grade !== null && file.grade !== w.grade) {
    w.problems.push(`The answer key is for Grade ${file.grade}, the book is Grade ${w.grade}.`);
    return;
  }
  for (const [q, m] of mine.marks) {
    const inBook = outOf(w.data, q);
    if (inBook !== null && inBook !== m) {
      w.problems.push(`The answer key is for another version of this book: question ${q} is ${inBook} marks in the book, ${m} in the key.`);
      return;
    }
  }
  const bad = checkKey(mine.answers, w.data);
  if (bad.length) {
    w.problems.push(...bad);
    return;
  }
  w.key = [...mine.answers].sort((a, b) => a.q - b.q);
}

/** A zip file starts with "PK\x03\x04". */
function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Every workbook in the files the owner picked: unit source zips (their book.html is read), or book.html files.
 * A file with no marks sheet comes back as one entry with a problem, so nothing is silently skipped.
 */
export function readWorkbookFiles(files: { name: string; bytes: Uint8Array }[]): (ReadWorkbook | { file: string; problem: string })[] {
  const out: (ReadWorkbook | { file: string; problem: string })[] = [];
  const decode = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);
  for (const f of files) {
    let pages: string[] = [];
    let keyText: string | null = null;
    try {
      if (isZip(f.bytes)) {
        const inside = unzipSync(f.bytes, {
          filter: (e) => (/\.html?$/i.test(e.name) && e.originalSize < 30_000_000) || (KEY_FILE.test(e.name) && e.originalSize < 2_000_000),
        });
        for (const [name, bytes] of Object.entries(inside)) {
          if (KEY_FILE.test(name)) keyText = decode(bytes);
          else pages.push(decode(bytes));
        }
      } else if (/\.html?$/i.test(f.name)) {
        pages = [decode(f.bytes)];
      } else {
        out.push({ file: f.name, problem: "Not a workbook zip or book.html." });
        continue;
      }
    } catch {
      out.push({ file: f.name, problem: "This zip can't be opened. Download it again and retry." });
      continue;
    }
    const found = pages.flatMap((h) => (HAS_SHEET.test(h) ? readWorkbookHtml(h, f.name) : []));
    if (found.length === 0) out.push({ file: f.name, problem: "No marks sheet inside: is this a workbook (level edition)?" });
    if (keyText !== null && found.length) {
      const key = readKeyFile(keyText);
      for (const w of found) {
        if (typeof key === "string") w.problems.push(key);
        else if (w.problems.length === 0) attachKey(w, key);
      }
    }
    out.push(...found);
  }
  return out;
}
