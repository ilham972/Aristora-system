// A whole unit saved as its skill book through the Claude link (24 Nov 2026, the founder: "I don't want direct PDF from
// you ... you just say done ... I can download that directly from the skill page"; his pick the same night: one chat
// types a unit, gives each answer its kind and each question its skills, and saves it straight into the app). Pure: the
// server (convex/link.ts, `tell` op "workbook") and the chat's tool (scripts/workbook.ts `check`) run this same function,
// so the chat knows the answer before it sends anything.
// - In: the book as the past-paper-workbook engine printed it (each part's and each level's last question, every Part II
//   question's marks: what the phone's upload sends), its answer key with the kinds, every question as printed, the
//   book's style, the unit's skills and each question's tags, all in the engine's numbers.
// - Checked like an uploaded zip (checkMaster, checkKey, the printed slots, safe HTML and style) and like a skills save
//   (skillsProblem); a skill book prints every question, so every one needs its answer, its HTML and its skills.
// - Out: the unit's skill book exactly as the owner's "Use as the workbook" makes it (skillLevels → skillWorkbook, no
//   students' marks yet: the engine's easy → hard order inside each group): numbered 1, 2, 3 … by skill, a level a strip
//   named "3" or "3·2", each question's engine number kept in `was`; the key, the printed questions, the tags and the
//   lessons' examples in the new numbers.

import { checkMaster, firstQuestion, shapeFrom, type MasterData, type PartId } from "./book";
import { checkKey, slotProblem, type KeyAnswer } from "./key";
import { BOOK_CSS_MAX, QUESTION_HTML_MAX, unsafeCss, unsafeHtml } from "./questions";
import { keepExamples, skillLevels, skillWorkbook, type SkillLevel } from "./skillBook";
import { skillsProblem, type KnownSkill, type Skill, type SkillTag } from "./skills";

/** What the chat sends: the engine's book, in the engine's numbers (the same pieces as the phone's upload). */
export type WholeUnit = {
  parts: { id: PartId; to: number; each?: number }[];
  levels: { to: number; max: number }[];
  /** Every Part II question's marks (a Part I question's come from its part). */
  marks?: Record<string, number>;
  answers: KeyAnswer[];
  items: { q: number; html: string }[];
  css: string;
  skills: Skill[];
  tags: SkillTag[];
};

/** The skill book a whole unit becomes (what the server writes; `since` is stamped there). */
export type MadeUnit = {
  data: MasterData;
  answers: KeyAnswer[];
  items: { q: number; html: string }[];
  css: string;
  skills: Skill[];
  tags: SkillTag[];
  /** The engine's number → the skill book's. */
  map: Map<number, number>;
  /** The levels by skill as the T page shows them (a skill with no level of its own too). */
  levels: SkillLevel[];
};

/** Every question's printed HTML together, at most (the link's own save cap: lib's twin of link.ts LINK_SAVE_MAX). */
export const WHOLE_HTML_MAX = 1_500_000;

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

/**
 * A whole unit checked and made into its skill book, or plain words saying the first thing that is wrong. `known` = the
 * skills of other units a question here may carry (lib/skills.ts knownFor).
 */
export function makeWholeUnit(unit: { key: string; grade: number }, req: WholeUnit, known: Map<string, KnownSkill>): MadeUnit | string {
  if (!req || typeof req !== "object") return "No book.";
  const { parts, levels, answers: sent, items: given, css, skills, tags } = req;
  if (!Array.isArray(parts) || !Array.isArray(levels) || !Array.isArray(sent) || !Array.isArray(given) || typeof css !== "string" || !Array.isArray(skills) || !Array.isArray(tags)) {
    return "A whole unit needs its parts, levels, answers, questions as printed, style, skills and tags.";
  }
  if (parts.some((p) => !p || !isNum(p.to) || (p.each !== undefined && !isNum(p.each))) || levels.some((l) => !l || !isNum(l.to) || !isNum(l.max))) {
    return "The book's parts and levels are not numbers.";
  }

  // The book, made as the upload makes it (catalog.saveWorkbook with `replace`: its marks are the whole truth).
  const shape = shapeFrom(unit.grade, parts, levels);
  if (typeof shape === "string") return shape;
  const last = shape.parts.length ? shape.parts[shape.parts.length - 1].to : 0;
  const marks: Record<string, number> = {};
  for (const [k, m] of Object.entries(req.marks ?? {})) {
    if (!isNum(m)) return `Question ${k}: its marks are not a number.`;
    if (Number(k) >= 1 && Number(k) <= last) marks[k] = m;
  }
  const data: MasterData = Object.keys(marks).length ? { kind: "master", ...shape, marks } : { kind: "master", ...shape };
  const bad = checkMaster(data);
  if (bad.length) return bad[0];
  if (firstQuestion(data) !== 1) return "A unit's workbook starts at question 1.";

  // Every question answered, once; checked against the book (its numbers and each part's marks).
  const answers = [...sent].sort((a, b) => a.q - b.q);
  if (answers.length !== last || answers.some((k, i) => !k || k.q !== i + 1)) return `The key must answer every question, 1 to ${last}, once.`;
  const wrongKey = checkKey(answers, data);
  if (wrongKey.length) return wrongKey[0];

  // Every question as printed, once, and safe; the style safe.
  const html = new Map<number, string>();
  let size = 0;
  for (const it of given) {
    if (!it || !Number.isInteger(it.q) || it.q < 1 || it.q > last || typeof it.html !== "string") return `Question ${it?.q} is not in this book (1 to ${last}).`;
    if (html.has(it.q)) return `Question ${it.q} comes twice.`;
    if (!it.html.trim() || it.html.length > QUESTION_HTML_MAX) return `Question ${it.q} is empty or too big to keep.`;
    const unsafe = unsafeHtml(it.html);
    if (unsafe) return `Question ${it.q}: ${unsafe}.`;
    html.set(it.q, it.html);
    size += it.html.length;
  }
  if (size > WHOLE_HTML_MAX) return "Too much in one save.";
  for (let q = 1; q <= last; q++) if (!html.has(q)) return `Question ${q} is not here as printed: the skill book prints every question.`;
  if (!css.trim() || css.length > BOOK_CSS_MAX) return "The book's style is missing or too big to keep.";
  const badCss = unsafeCss(css);
  if (badCss) return badCss;
  // The blanks, options, brackets and words each kind uses are printed in its question, as many as it needs.
  for (const k of answers) {
    const wrong = slotProblem(k, html.get(k.q) as string);
    if (wrong) return `Question ${k.q}: ${wrong}`;
  }

  // The skills, as a skills save checks them (every question tagged, each skill used, another unit's skill in the app).
  const file = {
    skills: skills.map((s): Skill => ({ id: s?.id, ta: typeof s?.ta === "string" ? s.ta.trim() : s?.ta, en: typeof s?.en === "string" ? s.en.trim() : s?.en, ...(s?.eg !== undefined ? { eg: s.eg } : {}), ...(s?.k !== undefined ? { k: s.k } : {}) })),
    tags: tags.map((t): SkillTag => ({ q: t?.q, ...(t?.p !== undefined ? { p: t.p } : {}), s: t?.s, ...(Array.isArray(t?.x) && t.x.length ? { x: [...t.x] } : t?.x !== undefined && !Array.isArray(t?.x) ? { x: t.x } : {}) })),
  };
  const badSkills = skillsProblem(unit.key, data, answers, file, known);
  if (badSkills) return badSkills;

  // The skill book, as the owner's switch makes it.
  const own = file.skills.map((s) => s.id);
  const { levels: byLevel, number } = skillLevels(unit.key, data, file.tags, own);
  const made = skillWorkbook(data, byLevel.filter((l) => l.qs.length), number);
  if (typeof made === "string") return made;
  const again = checkMaster(made.data);
  if (again.length) return again[0];
  const re = (q: number) => made.map.get(q) ?? q;
  const answersN = answers.map((k) => ({ ...k, q: re(k.q) })).sort((a, b) => a.q - b.q);
  const keyAgain = checkKey(answersN, made.data);
  if (keyAgain.length) return keyAgain[0];
  const tagsN = file.tags.map((t) => ({ ...t, q: re(t.q) })).sort((a, b) => a.q - b.q || (a.p ?? "").localeCompare(b.p ?? ""));
  // A lesson's example: the chat's, in the new numbers; a skill without one gets the plainest question carrying it first.
  const skillsN = keepExamples(
    file.skills.map((s) => (s.eg === undefined ? s : { ...s, eg: re(s.eg) })),
    tagsN,
  );
  const itemsN = [...html].map(([q, h]) => ({ q: re(q), html: h })).sort((a, b) => a.q - b.q);
  return { data: made.data, answers: answersN, items: itemsN, css, skills: skillsN, tags: tagsN, map: made.map, levels: byLevel };
}

/**
 * The skill book's levels a line each, as the T page shows them ("Level 3 · Add two negative numbers · Q21–32 · 12
 * questions · 24 marks · strips 3·1 (20) 3·2 (4)"): what the chat reads before it sends, and gets back after.
 */
export function levelLines(levels: readonly SkillLevel[], names: ReadonlyMap<string, string>): string[] {
  return levels.map((l) => {
    const name = names.get(l.skill) ?? l.skill;
    if (!l.qs.length) return `Level ${l.n} · ${name} · no question of its own (each one also needs a later skill): its number is skipped in print`;
    const parts = l.parts.length > 1 ? ` · strips ${l.parts.map((p) => `${l.n}·${p.i} (${p.max})`).join(" ")}` : "";
    return `Level ${l.n} · ${name} · Q${l.from}–${l.to} · ${l.qs.length} question${l.qs.length === 1 ? "" : "s"} · ${l.max ?? "?"} marks${parts}`;
  });
}
