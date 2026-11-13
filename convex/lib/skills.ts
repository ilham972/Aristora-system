// Skills (13 Nov 2026, the founder: "instead of find common questions, we have to find the common skills ... if someone
// getting wrong for same skill again and again, we don't need to teach again and again that question. We just teach the
// skill"). Every question of a workbook (or each part of a long one) carries the skill that decides it: a method a
// teacher can teach in a few minutes with one example; and, since a past-paper question often needs more than one (his
// words the same day: "some questions have one or two or three skills ... based on that we have to do the tagging"), up
// to two more that its solution uses. The first is the main one. A unit's skills and its questions' tags are one row (`skillTags`),
// saved through the Claude link (convex/link.ts, `tell` op "skills") by a chat that read the questions: no AI runs in the
// app. A skill's id is its home unit's key and a number ("G8-U05-S3"); a question that needs a skill of an earlier unit
// carries that unit's id, so one skill is taught once, wherever its questions are. This file is the rules only (pure:
// the tagging tool, scripts/skills.ts, runs the same check before it sends anything).

import type { MasterData } from "./book";
import { firstQuestion } from "./book";
import { lastQuestion, type KeyAnswer } from "./key";

/** A skill: its id ("G8-U05-S3"), its name in Tamil and in English, and the question that shows it best (a lesson's example). */
export type Skill = { id: string; ta: string; en: string; eg?: number };
/**
 * A question's skills: `s` = the main one (the step that decides it), `x` = the others its solution uses (two at most);
 * `p` = one part of a long question (the key's label), when its parts need different skills.
 */
export type SkillTag = { q: number; p?: string; s: string; x?: string[] };
export type SkillFile = { skills: Skill[]; tags: SkillTag[] };
/** A skill another unit owns, as a question here may carry it. */
export type KnownSkill = { unit: string; ta: string; en: string };

/** A unit's own skills, at most. */
export const SKILLS_MAX = 40;
export const SKILL_NAME_MAX = 80;
/** The skills one question (or one part) carries, at most: the main one and two more. */
export const SKILLS_A_TAG = 3;

export const skillId = (unitKey: string, n: number) => `${unitKey}-S${n}`;
/** The unit that owns a skill id ("G8-U05-S3" → "G8-U05"); null when it is not an id. */
export function skillHome(id: string): string | null {
  const m = /^((?:G\d{1,2}|OL)-[A-Za-z0-9]{1,8})-S([1-9]\d?)$/.exec(id);
  return m ? m[1] : null;
}

const isName = (s: unknown) => typeof s === "string" && s.trim() !== "" && s.length <= SKILL_NAME_MAX;

/**
 * What is wrong with a unit's skills ("" = fine), in plain words, before anything is saved:
 * - its own skills are "<unit>-S<n>", each once, each with a Tamil and an English name, each used by a question;
 * - every question of the book has its skills: for the whole question, or for each part the key names; three at most,
 *   none twice, the main one first;
 * - a skill of another unit must be in the app already (`known`).
 */
export function skillsProblem(unitKey: string, data: MasterData, answers: KeyAnswer[] | null, file: SkillFile, known: Map<string, KnownSkill>): string {
  if (!file || !Array.isArray(file.skills) || !Array.isArray(file.tags)) return "The skills file needs skills and tags.";
  if (file.skills.length === 0) return "No skills.";
  if (file.skills.length > SKILLS_MAX) return `${file.skills.length} skills: ${SKILLS_MAX} at most in one unit.`;
  const first = firstQuestion(data);
  const last = lastQuestion(data);
  const own = new Set<string>();
  for (const s of file.skills) {
    if (!s || typeof s.id !== "string" || skillHome(s.id) !== unitKey) return `Skill "${s?.id}": this unit's skills are ${skillId(unitKey, 1)}, ${skillId(unitKey, 2)} …`;
    if (own.has(s.id)) return `Skill ${s.id} comes twice.`;
    own.add(s.id);
    if (!isName(s.ta) || !isName(s.en)) return `Skill ${s.id} needs a Tamil name and an English name (${SKILL_NAME_MAX} letters at most).`;
    if (s.eg !== undefined && (!Number.isInteger(s.eg) || s.eg < first || s.eg > last)) return `Skill ${s.id}: its example, question ${s.eg}, is not in this book (${first} to ${last}).`;
  }
  const key = new Map((answers ?? []).map((k) => [k.q, k]));
  const whole = new Map<number, string>();
  const parts = new Map<number, Map<string, string>>();
  for (const t of file.tags) {
    if (!t || !Number.isInteger(t.q) || t.q < first || t.q > last) return `A tag for question ${t?.q}: the book has ${first} to ${last}.`;
    if (t.x !== undefined && (!Array.isArray(t.x) || t.x.length === 0 || t.x.length > SKILLS_A_TAG - 1)) return `Question ${t.q}: ${SKILLS_A_TAG} skills at most (the main one and two more).`;
    const all = [t.s, ...(t.x ?? [])];
    for (const id of all) {
      if (typeof id === "string" && (own.has(id) || known.has(id))) continue;
      const home = typeof id === "string" ? skillHome(id) : null;
      return home && home !== unitKey ? `Question ${t.q}: skill ${id} is not in the app (tag ${home} first, or give the question a skill of this unit).` : `Question ${t.q}: skill "${id}" is not one of this unit's skills.`;
    }
    if (new Set(all).size !== all.length) return `Question ${t.q}: a skill comes twice.`;
    if (t.p === undefined) {
      if (whole.has(t.q)) return `Question ${t.q} is tagged twice.`;
      whole.set(t.q, t.s);
    } else {
      if (typeof t.p !== "string" || !t.p.trim()) return `Question ${t.q}: a part's tag needs the part's label.`;
      const labels = (key.get(t.q)?.parts ?? []).map((x) => x.p);
      if (!labels.includes(t.p)) return `Question ${t.q}: the key has no part "${t.p}"${labels.length ? ` (its parts: ${labels.join(", ")})` : " (tag the whole question)"}.`;
      const m = parts.get(t.q) ?? new Map<string, string>();
      if (m.has(t.p)) return `Question ${t.q} part ${t.p} is tagged twice.`;
      m.set(t.p, t.s);
      parts.set(t.q, m);
    }
  }
  for (let q = first; q <= last; q++) {
    const m = parts.get(q);
    if (whole.has(q) && m) return `Question ${q}: one skill for the whole question, or one for each part, not both.`;
    if (!whole.has(q) && !m) return `Question ${q} has no skill.`;
    if (m) {
      const missing = (key.get(q)?.parts ?? []).map((x) => x.p).filter((p) => !m.has(p));
      if (missing.length) return `Question ${q}: part ${missing.join(", ")} has no skill.`;
    }
  }
  const used = new Set(file.tags.flatMap((t) => [t.s, ...(t.x ?? [])]));
  for (const s of file.skills) {
    if (!used.has(s.id)) return `Skill ${s.id} (${s.en}) has no question.`;
    // A lesson's example shows this skill first: the question's (or one part's) main skill.
    if (s.eg !== undefined && whole.get(s.eg) !== s.id && ![...(parts.get(s.eg)?.values() ?? [])].includes(s.id)) return `Skill ${s.id}: its example, question ${s.eg}, carries another skill first.`;
  }
  return "";
}

/** The skills of a question, or of one part of it (the part's own tag first, then the whole question's), the main one first; [] = none. */
export function skillsOf(tags: readonly SkillTag[], q: number, p?: string): string[] {
  let whole: SkillTag | null = null;
  for (const t of tags) {
    if (t.q !== q) continue;
    if (t.p === undefined) whole = t;
    else if (p !== undefined && t.p === p) return [t.s, ...(t.x ?? [])];
  }
  return whole ? [whole.s, ...(whole.x ?? [])] : [];
}

/** The main skill of a question, or of one part of it; null = none. */
export function skillOf(tags: readonly SkillTag[], q: number, p?: string): string | null {
  return skillsOf(tags, q, p)[0] ?? null;
}

/**
 * How many questions carry each skill as their main one, or (`also`) only as another skill their solution uses. A
 * question with parts counts once per skill.
 */
export function skillCounts(tags: readonly SkillTag[], also = false): Map<string, number> {
  const main = new Set(tags.map((t) => `${t.s} ${t.q}`));
  const seen = new Set<string>();
  const out = new Map<string, number>();
  for (const t of tags) {
    for (const id of also ? (t.x ?? []) : [t.s]) {
      const k = `${id} ${t.q}`;
      if (seen.has(k) || (also && main.has(k))) continue;
      seen.add(k);
      out.set(id, (out.get(id) ?? 0) + 1);
    }
  }
  return out;
}
