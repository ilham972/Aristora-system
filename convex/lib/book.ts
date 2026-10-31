// A unit's books, as data. One Fighter book (the theory book: the ladder, the past questions and the final
// challenge, numbered straight through as on its contents page) and one Master book (the past-paper workbook:
// parts I / II, or IA / IB / IIA / IIB for grades 10-11, numbers restarting at 1 in every part).

export type SectionKind = "ladder" | "past" | "final";

/** One row of a theory book's contents page. Double rings (teacher questions) are "teach", single rings "solo". */
export interface SectionData {
  id: string; // "A".."F", a past part ("P", "I", "II", "IA" ...), the final challenge ("X")
  badge: string; // what the black badge shows
  title: string; // English
  tamil: string; // as printed in the book
  kind: SectionKind;
  teach: number[];
  solo: number[];
}

export interface FighterData {
  kind: "fighter";
  sections: SectionData[];
  /** Text inside a circle when it isn't the number (a past paper's year). */
  labels?: Record<string, string>;
}

export type PartId = "I" | "II" | "IA" | "IB" | "IIA" | "IIB";

/** A part of the workbook: its question range (numbers run straight through the book). */
export interface MasterPart {
  id: PartId;
  from: number;
  to: number;
  kind: "short" | "cards";
  /** Marks for every question of a short part ("ஒவ்வொரு வினாவுக்கும் 2 புள்ளிகள்"). */
  each?: number;
}

/** A level: a box on the contents page and the marks box at its end ("Level 5 · 38 – 48 · / 20"). */
export interface MasterLevel {
  n: number;
  from: number;
  to: number;
  max: number;
}

export interface MasterData {
  kind: "master";
  parts: MasterPart[];
  levels: MasterLevel[];
  /** Each question's marks as printed (Part II: the sum of its parts' marks). Missing = not known. */
  marks?: Record<string, number>;
}

export type BookData = FighterData | MasterData;

// ---------------------------------------------------------------- Fighter (theory book)

export interface Fighter {
  data: FighterData;
  sections: SectionData[];
  ladder: SectionData[];
  past: SectionData[];
  final: SectionData | null;
  /** Every question number, in book order. */
  all: number[];
  isQuestion(q: number): boolean;
  sectionOf(q: number): SectionData;
  typeOf(q: number): "teach" | "solo";
  sectionById(id: string): SectionData | undefined;
  /** Text inside a circle: "27", or the year of a past paper. */
  shortLabel(q: number): string;
  /** Text in sentences: "Q27", "2016 paper", "Final challenge". */
  longLabel(q: number): string;
}

const compiled = new WeakMap<FighterData, Fighter>();

export function fighter(data: FighterData): Fighter {
  const hit = compiled.get(data);
  if (hit) return hit;
  const sectionOfQ = new Map<number, SectionData>();
  const typeOfQ = new Map<number, "teach" | "solo">();
  for (const s of data.sections) {
    for (const q of s.teach) {
      sectionOfQ.set(q, s);
      typeOfQ.set(q, "teach");
    }
    for (const q of s.solo) {
      sectionOfQ.set(q, s);
      typeOfQ.set(q, "solo");
    }
  }
  const labels = data.labels ?? {};
  const final = data.sections.find((s) => s.kind === "final") ?? null;
  const f: Fighter = {
    data,
    sections: data.sections,
    ladder: data.sections.filter((s) => s.kind === "ladder"),
    past: data.sections.filter((s) => s.kind === "past"),
    final,
    all: data.sections.flatMap((s) => [...s.teach, ...s.solo]).sort((a, b) => a - b),
    isQuestion: (q) => Number.isInteger(q) && sectionOfQ.has(q),
    sectionOf(q) {
      const s = sectionOfQ.get(q);
      if (!s) throw new Error(`No question ${q} in this book`);
      return s;
    },
    typeOf(q) {
      const t = typeOfQ.get(q);
      if (!t) throw new Error(`No question ${q} in this book`);
      return t;
    },
    sectionById: (id) => data.sections.find((s) => s.id === id),
    shortLabel: (q) => labels[String(q)] ?? String(q),
    longLabel(q) {
      if (labels[String(q)]) return `${labels[String(q)]} paper`;
      if (final && final.solo.includes(q)) return "Final challenge";
      return `Q${q}`;
    },
  };
  compiled.set(data, f);
  return f;
}

/** Problems that make a theory book unusable (empty list = fine). */
export function checkFighter(data: FighterData): string[] {
  const out: string[] = [];
  const seen = new Set<number>();
  if (!data.sections.length) out.push("The book has no sections.");
  for (const s of data.sections) {
    if (!s.id) out.push("A section has no letter.");
    if (s.kind !== "ladder" && s.teach.length) out.push(`Section ${s.id}: only ladder sections have teacher questions.`);
    for (const q of [...s.teach, ...s.solo]) {
      if (!Number.isInteger(q) || q < 1 || q > 999) out.push(`Section ${s.id}: ${q} is not a question number.`);
      else if (seen.has(q)) out.push(`Question ${q} is in two sections.`);
      seen.add(q);
    }
  }
  if (data.sections.filter((s) => s.kind === "final").length > 1) out.push("Only one final challenge.");
  return out;
}

// ---------------------------------------------------------------- Master (past-paper workbook)

export const PART_NAME: Record<PartId, string> = {
  I: "Part I",
  II: "Part II",
  IA: "Paper I A",
  IB: "Paper I B",
  IIA: "Paper II A",
  IIB: "Paper II B",
};

/** Parts of a workbook for this grade: I and II up to Grade 9; the four O/L parts for grades 10-11. */
export function partsForGrade(grade: number): { id: PartId; kind: "short" | "cards" }[] {
  return grade >= 10
    ? [
        { id: "IA", kind: "short" },
        { id: "IB", kind: "cards" },
        { id: "IIA", kind: "cards" },
        { id: "IIB", kind: "cards" },
      ]
    : [
        { id: "I", kind: "short" },
        { id: "II", kind: "cards" },
      ];
}

export function partOf(data: MasterData, q: number): MasterPart | undefined {
  return data.parts.find((p) => q >= p.from && q <= p.to);
}

export function levelOfQ(data: MasterData, q: number): MasterLevel | undefined {
  return data.levels.find((l) => q >= l.from && q <= l.to);
}

/** Marks a question is out of: as printed; null when the workbook doesn't say (the level total still works). */
export function outOf(data: MasterData, q: number): number | null {
  const m = data.marks?.[String(q)];
  if (m !== undefined) return m;
  const p = partOf(data, q);
  return p?.kind === "short" ? (p.each ?? 2) : null;
}

/** Every question's marks of a level, or null when any is not known. */
export function levelOutOf(data: MasterData, l: MasterLevel): number[] | null {
  const out: number[] = [];
  for (let q = l.from; q <= l.to; q++) {
    const m = outOf(data, q);
    if (m === null) return null;
    out.push(m);
  }
  return out;
}

/** The first question of a workbook: 1, or where a topic tute's past papers start (they go on from its ladder). */
export function firstQuestion(data: MasterData): number {
  return data.parts.length ? data.parts[0].from : 1;
}

export function bookTotal(data: MasterData): number {
  return data.levels.reduce((a, l) => a + l.max, 0);
}

/** "Level 5 · 38–48". */
export function levelName(l: MasterLevel): string {
  return `Level ${l.n} · ${l.from === l.to ? l.from : `${l.from}–${l.to}`}`;
}

/** Problems that make a workbook unusable (empty list = fine). */
export function checkMaster(data: MasterData): string[] {
  const out: string[] = [];
  if (!data.parts.length) out.push("The workbook has no parts.");
  if (!data.levels.length) out.push("The workbook has no levels.");
  const ids = new Set<string>();
  // A workbook starts at question 1; a topic tute's Master book goes on from its ladder (Sets: 56–66).
  const first = firstQuestion(data);
  if (!Number.isInteger(first) || first < 1 || first > 999) out.push("The first question number is wrong.");
  let next = first;
  for (const p of data.parts) {
    if (ids.has(p.id)) out.push(`${PART_NAME[p.id]} is listed twice.`);
    ids.add(p.id);
    if (p.from !== next) out.push(`${PART_NAME[p.id]} should start at question ${next}.`);
    if (!Number.isInteger(p.to) || p.to < p.from || p.to > 999) out.push(`${PART_NAME[p.id]}: the last question is wrong.`);
    if (p.each !== undefined && (!Number.isInteger(p.each) || p.each < 1 || p.each > 10)) out.push(`${PART_NAME[p.id]}: marks per question must be 1 to 10.`);
    next = p.to + 1;
  }
  const last = next - 1;
  let q = first;
  data.levels.forEach((l, i) => {
    if (l.n !== i + 1) out.push(`Levels must be numbered 1, 2, 3 … (found Level ${l.n}).`);
    if (l.from !== q) out.push(`Level ${l.n} should start at question ${q}.`);
    if (l.to < l.from || l.to > last) out.push(`Level ${l.n}: the last question is wrong.`);
    if (!Number.isInteger(l.max) || l.max < 1 || l.max > 500) out.push(`Level ${l.n}: marks must be 1 to 500.`);
    const pa = partOf(data, l.from);
    const pb = partOf(data, l.to);
    if (pa && pb && pa.id !== pb.id) out.push(`Level ${l.n} runs over two parts.`);
    const each = levelOutOf(data, l);
    if (each && each.reduce((a, b) => a + b, 0) !== l.max) {
      out.push(`Level ${l.n}: its questions add up to ${each.reduce((a, b) => a + b, 0)}, not ${l.max}.`);
    }
    q = l.to + 1;
  });
  if (data.levels.length && q !== last + 1) out.push(`The levels stop at question ${q - 1}; the book has ${last}.`);
  for (const [k, m] of Object.entries(data.marks ?? {})) {
    if (!Number.isInteger(m) || m < 1 || m > 100) out.push(`Question ${k}: marks must be 1 to 100.`);
  }
  return [...new Set(out)];
}

// ---------------------------------------------------------------- the pilot theory book

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Grade 11 · Quadratic equations (an O/L essay tute), filed under G11 U13 Equations. */
export const PILOT_FIGHTER: FighterData = {
  kind: "fighter",
  sections: [
    { id: "A", badge: "A", title: "Length & area", tamil: "நீளமும் பரப்பளவும்", kind: "ladder", teach: range(1, 4), solo: range(5, 8) },
    { id: "B", badge: "B", title: "Expand & simplify", tamil: "விரித்துச் சுருக்குதல்", kind: "ladder", teach: range(9, 11), solo: range(12, 14) },
    { id: "C", badge: "C", title: "Forming the equation", tamil: "சமன்பாட்டை அமைத்தல்", kind: "ladder", teach: range(15, 17), solo: range(18, 22) },
    { id: "D", badge: "D", title: "Completing the square", tamil: "வர்க்கப் பூர்த்தியாக்கல்", kind: "ladder", teach: range(23, 26), solo: range(27, 33) },
    { id: "E", badge: "E", title: "Surds & approximation", tamil: "சேடுகளும் அண்ணளவாக்கலும்", kind: "ladder", teach: range(34, 36), solo: range(37, 40) },
    { id: "F", badge: "F", title: "Valid solution & final answer", tamil: "உகந்த தீர்வும் இறுதி விடையும்", kind: "ladder", teach: range(41, 43), solo: range(44, 50) },
    { id: "P", badge: "★", title: "Past papers", tamil: "கடந்தகால வினாக்கள்", kind: "past", teach: [], solo: range(51, 60) },
    { id: "X", badge: "★", title: "Final challenge", tamil: "இறுதிச் சவால்", kind: "final", teach: [], solo: [61] },
  ],
  labels: {
    "51": "2016", "52": "2022", "53": "2021", "54": "2020", "55": "2025",
    "56": "2018", "57": "2023", "58": "2017", "59": "2019", "60": "2024",
  },
};
export const PILOT_UNIT = { grade: 11, code: "U13", title: "Quadratic equations" };

/**
 * Workbooks already read from their PDFs (scratchpad tool workbook_json.py): Grade 7 U08 Directed numbers v1
 * (contents page, level boxes and every question's printed marks; each level's marks add up as printed).
 */
export const KNOWN_WORKBOOKS: { grade: number; code: string; data: MasterData }[] = [
  {
    grade: 7,
    code: "U08",
    data: {
      kind: "master",
      parts: [
        { id: "I", from: 1, to: 37, kind: "short", each: 2 },
        { id: "II", from: 38, to: 57, kind: "cards" },
      ],
      levels: [
        { n: 1, from: 1, to: 10, max: 20 },
        { n: 2, from: 11, to: 20, max: 20 },
        { n: 3, from: 21, to: 30, max: 20 },
        { n: 4, from: 31, to: 37, max: 14 },
        { n: 5, from: 38, to: 48, max: 20 },
        { n: 6, from: 49, to: 52, max: 18 },
        { n: 7, from: 53, to: 55, max: 19 },
        { n: 8, from: 56, to: 57, max: 15 },
      ],
      marks: {
        "38": 1, "39": 1, "40": 1, "41": 3, "42": 2, "43": 2, "44": 2, "45": 2, "46": 2, "47": 2, "48": 2,
        "49": 3, "50": 4, "51": 7, "52": 4, "53": 7, "54": 7, "55": 5, "56": 4, "57": 11,
      },
    },
  },
];
