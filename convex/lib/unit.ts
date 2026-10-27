// The pilot unit: Grade 11, one O/L essay tute.
// Numbers and order come straight from the book's contents page.
// Double rings (teacher questions) are "teach"; single rings are "solo".

export type SectionKind = "ladder" | "past" | "final";

export interface Section {
  id: string; // "A".."F", "P" (past papers), "X" (final challenge)
  badge: string; // what the black badge shows
  title: string; // English
  tamil: string; // as printed in the book
  page: number;
  kind: SectionKind;
  teach: number[]; // with the teacher (double ring)
  solo: number[]; // alone (single ring)
}

const range = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => a + i);

export const SECTIONS: Section[] = [
  { id: "A", badge: "A", title: "Length & area", tamil: "நீளமும் பரப்பளவும்", page: 1, kind: "ladder", teach: range(1, 4), solo: range(5, 8) },
  { id: "B", badge: "B", title: "Expand & simplify", tamil: "விரித்துச் சுருக்குதல்", page: 6, kind: "ladder", teach: range(9, 11), solo: range(12, 14) },
  { id: "C", badge: "C", title: "Forming the equation", tamil: "சமன்பாட்டை அமைத்தல்", page: 8, kind: "ladder", teach: range(15, 17), solo: range(18, 22) },
  { id: "D", badge: "D", title: "Completing the square", tamil: "வர்க்கப் பூர்த்தியாக்கல்", page: 14, kind: "ladder", teach: range(23, 26), solo: range(27, 33) },
  { id: "E", badge: "E", title: "Surds & approximation", tamil: "சேடுகளும் அண்ணளவாக்கலும்", page: 19, kind: "ladder", teach: range(34, 36), solo: range(37, 40) },
  { id: "F", badge: "F", title: "Valid solution & final answer", tamil: "உகந்த தீர்வும் இறுதி விடையும்", page: 22, kind: "ladder", teach: range(41, 43), solo: range(44, 50) },
  { id: "P", badge: "★", title: "Past papers", tamil: "கடந்தகால வினாக்கள்", page: 32, kind: "past", teach: [], solo: range(51, 60) },
  { id: "X", badge: "★", title: "Final challenge", tamil: "இறுதிச் சவால்", page: 42, kind: "final", teach: [], solo: [61] },
];

// Past papers in book order (the order printed on the contents page).
export const PAST_YEARS: Record<number, string> = {
  51: "2016", 52: "2022", 53: "2021", 54: "2020", 55: "2025",
  56: "2018", 57: "2023", 58: "2017", 59: "2019", 60: "2024",
};

export const UNIT = {
  id: "g11-quadratic-equations",
  grade: 11,
  title: "Quadratic equations",
  total: 61,
};

export const LADDER = SECTIONS.filter((s) => s.kind === "ladder");
export const PAST = SECTIONS.find((s) => s.kind === "past")!;
export const FINAL = SECTIONS.find((s) => s.kind === "final")!;
export const ALL_QUESTIONS = range(1, UNIT.total);

const sectionOfQ = new Map<number, Section>();
const typeOfQ = new Map<number, "teach" | "solo">();
for (const s of SECTIONS) {
  for (const q of s.teach) { sectionOfQ.set(q, s); typeOfQ.set(q, "teach"); }
  for (const q of s.solo) { sectionOfQ.set(q, s); typeOfQ.set(q, "solo"); }
}

export function isQuestion(q: number): boolean {
  return Number.isInteger(q) && sectionOfQ.has(q);
}
export function sectionOf(q: number): Section {
  const s = sectionOfQ.get(q);
  if (!s) throw new Error(`No question ${q} in this unit`);
  return s;
}
export function typeOf(q: number): "teach" | "solo" {
  const t = typeOfQ.get(q);
  if (!t) throw new Error(`No question ${q} in this unit`);
  return t;
}
export function sectionById(id: string): Section | undefined {
  return SECTIONS.find((s) => s.id === id);
}

/** Text inside a circle: "27", or the year for a past paper. */
export function shortLabel(q: number): string {
  return PAST_YEARS[q] ?? String(q);
}
/** Text in sentences: "Q27", "2016 paper", "Final challenge". */
export function longLabel(q: number): string {
  if (PAST_YEARS[q]) return `${PAST_YEARS[q]} paper`;
  if (q === FINAL.solo[0]) return "Final challenge";
  return `Q${q}`;
}
