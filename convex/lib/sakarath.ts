// The Sakarath book and exam mode (17 Nov 2026, his voice note two days before the maths exam: "doing the unit wise
// past paper question is not good idea because they can't finish everything ... every unit have one book ... a very
// tiny book ... every single question represent one skill ... let's call it as Sakarath book ... if I on the exam mode
// ... instead of showing the past paper question, that will show up the Sakarath book question"; ஸகராத்: the last
// moments). One master question (or two, three) per unit with every skill its term tests once, easy to hard.
// - Each unit's Sakarath book is a workbook of its own, kept on a unit of its own (a "Sakarath unit": grade 100 + the
//   unit's grade, key "<unit key>-SK", the same code, term and order). So everything a workbook has on the phone works
//   the same, untouched: the Level, Check after every question, the server's marking, XP, the race, the flame, the
//   questions that come back, Explain online, the photos and the typed words in Correction → Homework, the AI's check.
//   And nothing of the class's own books moves: its levels, photos and marks never meet a workbook's (homePhotos,
//   familyLive and the rest are kept by unit). No `by_grade` list of grades 6–11 ever sees a Sakarath unit.
// - Its book row says `sk: true`; the class board (state.ts) and Consultation leave its work out: the book is the
//   phone's (the class keeps its own books), and the teachers meet it in Homework and in the Explain online threads.
// - Exam mode, per grade (his answer: "One per grade"): meta EXAM_KEY = the grades on. A grade on: its students' Learn
//   map is the same syllabus map (his words: "the syllabus map never change"), each Stage opening its unit's Sakarath
//   book (lib/family.ts `worldsOf`), every Stage open ("they want to do all the questions from all the units"). Off:
//   the past papers again; nothing done in either is lost (XP counts both).
// - It reaches the app through the Claude link (convex/link.ts `tell` "sakarath", his ask: "you will upload from here
//   ... this is one time upload"): the book engine's source zip carries sakarath.json (answers and skills only), so a
//   chat builds each unit's printed questions, levels and answer kinds from the source and saves them here, checked.
// - The O/L Sakarath book (19 Nov 2026) has units of its OWN: the 53 O/L topics and the Grade 10 + 11 syllabus merged
//   into 30 units in 3 parts so that no skill comes twice (his check: "is this 30 units align with grade 11 ... if
//   aligned we can upload in the grade 11 instead OL": it isn't: 9 of its units are Grade 10 topics, and 6 pairs of
//   Grade 11 units share one). So each is a Sakarath unit with no unit of the syllabus under it (grade 112, key
//   "OLS-U05-SK", its names and part from the book), and exam mode OL turns the O/L map of the students ticked for it
//   into the book's own map: its 3 parts, its 30 units, all open (lib/family.ts `worldsOf`).

// - The printed Sakarath book (19 Nov 2026, his words: "the book is don't have unit by unit. This is whole big book ...
//   some students give, some students I didn't give ... give the Sakarath book to my students" from the Books page's
//   Stock, and "after give that to my student ... visible to correct" on Correction): ONE printed book per grade (every
//   unit's master question), so ONE stock item. It is kept as a unit of its own, so its copies in hand, papers, price,
//   Printed, the charge when given and Take back are the Books page's own, untouched: grade 200 + the grade (206 …
//   211, the O/L book's 212), key "G8-SKB" ("OLS-SKB"), code "SK", no book row. Given (a handout on it), the student's
//   Sakarath books of that grade come with him to Correction (state.ts `sk`), every unit of it open there; nobody
//   else's class pages change (Evaluation, Theory, the Manager still leave Sakarath books to the phone).

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { KEY_PARTS_MAX } from "./key";
import type { MasterData } from "./book";
import { OL } from "./syllabus";

/** A Sakarath unit's grade: this + the unit's own (106, 107, 108 …; the O/L book's 112). */
export const SK_BASE = 100;
/** The book's name, as printed on its cover. */
export const SK_TITLE = "ஸகராத் புத்தகம்";
/** The meta row of exam mode: the grades on (6–11, OL = 12). */
export const EXAM_KEY = "exam.grades";
/** The grades exam mode can be turned on for (OL: the students ticked for the O/L map). */
export const EXAM_GRADES = [6, 7, 8, 9, 10, 11, OL] as const;
/**
 * The O/L Sakarath book's parts (its units' `term`), as its plan.py names them; the family app keeps a copy
 * (src/family/ui.tsx SK_PART_TA: this file would bring the syllabus into that small bundle).
 */
export const SK_OL_PARTS: Record<number, { ta: string; en: string }> = {
  1: { ta: "எண்களும் அளவீடும்", en: "Numbers & measurement" },
  2: { ta: "அட்சரகணிதம்", en: "Algebra" },
  3: { ta: "கேத்திரகணிதம் · புள்ளிவிபரவியல் · நிகழ்தகவு", en: "Geometry · statistics · probability" },
};
/** An O/L Sakarath unit's key: "U05" → "OLS-U05-SK" (never "OL-U05-…": that is the O/L topic 5). */
export const olSkKey = (code: string) => `OLS-${code}-SK`;
/** A Sakarath unit's names: its unit's (or, on the O/L book, its own) with the book's mark. */
export const skNames = (en: string, ta: string) => ({ en: `Sakarath · ${en}`, ta: `${ta} · ஸகராத்` });
/** The names without the book's mark (the map says it once, in its own way). */
export const plainNames = (u: { en: string; ta: string }) => ({ en: u.en.replace(/^Sakarath · /, ""), ta: u.ta.replace(/ · ஸகராத்$/, "") });
/** The most questions a Sakarath book may have (a section of a master question is one question in the app). */
export const SK_QUESTIONS_MAX = 120;
/** The most levels. */
export const SK_LEVELS_MAX = 12;

export const skGrade = (g: number) => SK_BASE + g;
/** A Sakarath unit's grade (106 … 112), or the printed book's (206 … 212): never a grade of the syllabus. */
export const isSkGrade = (g: number) => g > SK_BASE;

/** The printed Sakarath book's unit: this + the grade (206 … 211; the O/L book's 212). */
export const SKB_BASE = 200;
/** Its unit's code (no number: it is the whole book). */
export const SKB_CODE = "SK";
export const skbGrade = (g: number) => SKB_BASE + g;
/** The printed Sakarath book's own unit (one per grade), never a unit with questions. */
export const isSkbGrade = (g: number) => g > SKB_BASE;
/** The students' grade of a printed Sakarath book (208 → 8; the O/L book's 212 → OL = 12). */
export const skbFor = (unitGrade: number) => unitGrade - SKB_BASE;
/** Its key: "G8-SKB"; the O/L book's "OLS-SKB" (never "OL-…": those are the O/L topics). */
export const skbKey = (g: number) => (g === OL ? "OLS-SKB" : `G${g}-SKB`);
/** Its names (the Books page, his money sheet). */
export const SKB_NAMES = { en: "Sakarath book", ta: SK_TITLE } as const;
/** Who the printed book of this grade can go to: its grade's students; the O/L book's, Grade 10 and 11. */
export const skbFits = (g: number, studentGrade: number | undefined): boolean => (g === OL ? studentGrade === 10 || studentGrade === 11 : studentGrade === g);

/** The printed book's unit of a grade, made the first time (setup.ensure; a Sakarath book saved through the link). */
export async function ensureSkb(ctx: MutationCtx, grade: number): Promise<Doc<"units">> {
  const key = skbKey(grade);
  const had = await ctx.db
    .query("units")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (had) return had;
  const id = await ctx.db.insert("units", { grade: skbGrade(grade), code: SKB_CODE, key, term: 0, order: 0, ...SKB_NAMES });
  return (await ctx.db.get(id))!;
}

/** Does this grade have a Sakarath book in the app (one unit's, at least)? */
export async function hasSkBook(ctx: QueryCtx, grade: number): Promise<boolean> {
  const units = await ctx.db
    .query("units")
    .withIndex("by_grade", (q) => q.eq("grade", skGrade(grade)))
    .collect();
  for (const u of units) {
    const b = await ctx.db
      .query("books")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", u._id).eq("stage", "master"))
      .first();
    if (b?.sk) return true;
  }
  return false;
}

/** The Sakarath units' grades (108 for Grade 8's, 112 for the O/L book's) of the printed books he holds. */
export async function skHeld(ctx: QueryCtx, studentId: Id<"students">): Promise<Set<number>> {
  const out = new Set<number>();
  for (const h of await ctx.db
    .query("handouts")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .collect()) {
    if (h.stage !== "master") continue;
    const u = await ctx.db.get(h.unitId);
    if (u && isSkbGrade(u.grade)) out.add(skGrade(skbFor(u.grade)));
  }
  return out;
}
/** A unit's grade as people say it: a Sakarath unit's is its unit's. */
export const realGrade = (g: number) => (g > SKB_BASE ? g - SKB_BASE : g > SK_BASE ? g - SK_BASE : g);
/** "G8-U05" → "G8-U05-SK". */
export const skKey = (unitKey: string) => `${unitKey}-SK`;
export const isSkUnit = (u: { grade: number }) => isSkGrade(u.grade);

/** The grades exam mode is on for. */
export async function examGrades(ctx: QueryCtx): Promise<number[]> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", EXAM_KEY))
    .first();
  const v = row?.value;
  return Array.isArray(v) ? v.filter((g): g is number => typeof g === "number" && (EXAM_GRADES as readonly number[]).includes(g)) : [];
}

/** Exam mode is on for this grade. */
export async function examOn(ctx: QueryCtx, grade: number | null | undefined): Promise<boolean> {
  return typeof grade === "number" && (await examGrades(ctx)).includes(grade);
}

/** A grade's Sakarath units, by their unit's key ("G8-U05" → its Sakarath unit). */
export async function skUnitsOf(ctx: QueryCtx, grade: number): Promise<Map<string, Doc<"units">>> {
  const list = await ctx.db
    .query("units")
    .withIndex("by_grade", (q) => q.eq("grade", skGrade(grade)))
    .collect();
  return new Map(list.map((u) => [u.key.replace(/-SK$/, ""), u]));
}

/**
 * What is wrong with a Sakarath book's shape ("" = fine): one part of questions with parts (II, cards) from 1, levels one
 * after another over all of it, each question's marks known, each level's marks their sum.
 */
export function sakarathProblem(d: MasterData): string {
  if (!d || d.kind !== "master" || !Array.isArray(d.parts) || !Array.isArray(d.levels)) return "Not a Sakarath book.";
  if (d.parts.length !== 1) return "A Sakarath book has one part.";
  const part = d.parts[0];
  const n = part.to;
  if (part.id !== "II" || part.kind !== "cards" || part.from !== 1 || !Number.isInteger(n) || n < 1 || n > SK_QUESTIONS_MAX) {
    return `A Sakarath book's questions are 1 to N (at most ${SK_QUESTIONS_MAX}), with parts.`;
  }
  if (d.free?.length) return "A Sakarath book has no free marks.";
  const marks = d.marks ?? {};
  for (let q = 1; q <= n; q++) {
    const m = marks[String(q)];
    if (!Number.isInteger(m) || m < 1 || m > KEY_PARTS_MAX) return `Question ${q} has no marks.`;
  }
  if (Object.keys(marks).length !== n) return "Marks for a question the book doesn't have.";
  if (d.levels.length < 1 || d.levels.length > SK_LEVELS_MAX) return `A Sakarath book has 1 to ${SK_LEVELS_MAX} levels.`;
  let next = 1;
  for (const [i, l] of d.levels.entries()) {
    if (l.n !== i + 1 || l.from !== next || !Number.isInteger(l.to) || l.to < l.from) return `Level ${i + 1} doesn't follow the one before it.`;
    let sum = 0;
    for (let q = l.from; q <= l.to; q++) sum += marks[String(q)] ?? 0;
    if (l.max !== sum) return `Level ${l.n} is ${l.max} marks; its questions add up to ${sum}.`;
    next = l.to + 1;
  }
  if (next !== n + 1) return "The levels don't cover every question.";
  return "";
}

/** Two books with the same levels (a student's marks stay on the same questions). */
export function sameLevels(a: MasterData, b: MasterData): boolean {
  return a.levels.length === b.levels.length && a.levels.every((l, i) => l.from === b.levels[i].from && l.to === b.levels[i].to && l.max === b.levels[i].max);
}
