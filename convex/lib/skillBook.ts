// A unit's book by skill (14 Nov 2026, the founder: "each skill considered as each level"; Settings → Books → T).
// Pure rules shared by the server (convex/skillBook.ts) and the page (src/skillBook.tsx); nothing here is saved.
// - A group = the exact set of skills a question needs (his words: "skill two is only for purely skill two only ...
//   create another pill like skill two and three"). A question tagged part by part needs every part's skills.
// - **Level n = skill n** of the unit (22 Nov 2026, his voice note: "we can put skill three plus skill four inside the
//   level four ... the student already learned level three ... otherwise the levels are going to be very high list and
//   some levels have only one question or two"): a question goes into the level of the LAST of this unit's skills it
//   needs, so S3+S4 is in Level 4 and S2+S5 in Level 5. Inside a level: the questions of that skill alone first, then
//   the combined groups (two skills before three); a question that needs only other units' skills (already taught
//   there) goes into the first level, at its end. A level whose skill no question ends on is empty (left out of the PDF;
//   its number is never given to another skill, so Level n stays skill n).
// - Inside a group, easy → hard: Part I questions first, then the structured ones; inside each, the book's own order
//   (the workbook is built easy → hard) pulled by how many students got it right, once STAT_MIN students did it.
// - The app keeps its question numbers; only the downloaded book numbers its questions 1, 2, 3 … in this order.

import { outOf, partOf, type MasterData } from "./book";
import type { MState } from "./master";
import { bySkill, paperNo } from "./path";
import { SKILLS_A_TAG, skillHome, type Skill, type SkillTag } from "./skills";

/** How students did on a question: n = students whose level of it was corrected, right = their marks summed (0 to 1 each). */
export type QStat = { n: number; right: number };
/** Students who must have done a question before their marks move it. */
export const STAT_MIN = 5;

/** Every skill a question needs (the whole question's, or all its parts'), each once, in teaching order. */
export function needs(tags: readonly SkillTag[], q: number): string[] {
  const out = new Set<string>();
  for (const t of tags) if (t.q === q) for (const id of [t.s, ...(t.x ?? [])]) out.add(id);
  return [...out].sort(bySkill);
}

export const groupKey = (skills: readonly string[]) => [...skills].sort(bySkill).join("+");

/** A skill as the book prints it: "S3" (this unit's), "S4·2" (unit 4's skill 2). */
export function skillLabel(unitKey: string, id: string): string {
  return `S${paperNo(unitKey, id)}`;
}

/** A group's pill: "S3", "S2+S3". */
export function groupLabel(unitKey: string, skills: readonly string[]): string {
  return skills.map((id) => skillLabel(unitKey, id)).join("+");
}

/** Teaching order of two groups: by the last skill each needs, then the smaller first, then skill by skill. */
export function byGroup(a: readonly string[], b: readonly string[]): number {
  const last = bySkill(a[a.length - 1], b[b.length - 1]);
  if (last) return last;
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < a.length; i++) {
    const c = bySkill(a[i], b[i]);
    if (c) return c;
  }
  return 0;
}

/** 0 = a Part I (short) question, 1 = a structured one. */
const kindOf = (data: MasterData, q: number) => (partOf(data, q)?.kind === "short" ? 0 : 1);

/**
 * How hard each question is, 0 (easiest) to 1, inside its kind (Part I or structured): its place in the book (built easy
 * → hard), averaged with its place among the questions students did (fewest marks = hardest) once STAT_MIN did it.
 */
export function hardness(data: MasterData, qs: readonly number[], stats: ReadonlyMap<number, QStat>): Map<number, number> {
  const out = new Map<number, number>();
  for (const kind of [0, 1]) {
    const mine = qs.filter((q) => kindOf(data, q) === kind).sort((a, b) => a - b);
    const place = (i: number, n: number) => (n > 1 ? i / (n - 1) : 0);
    const done = mine.filter((q) => (stats.get(q)?.n ?? 0) >= STAT_MIN);
    const share = (q: number) => {
      const s = stats.get(q) as QStat;
      return s.right / s.n;
    };
    // Most marks first; the same share keeps the book's order.
    const byMarks = [...done].sort((a, b) => share(b) - share(a) || a - b);
    const rank = new Map(byMarks.map((q, i) => [q, place(i, byMarks.length)]));
    mine.forEach((q, i) => {
      const p = place(i, mine.length);
      const r = rank.get(q);
      out.set(q, r === undefined ? p : (p + r) / 2);
    });
  }
  return out;
}

export type SkillGroup = {
  /** "G8-U05-S2+G8-U05-S3" */
  key: string;
  skills: string[];
  /** Its questions (the app's numbers), easy → hard. */
  qs: number[];
};

/** A unit's groups in teaching order, each group's questions easy → hard. Questions with no skill are left out. */
export function skillGroups(data: MasterData, tags: readonly SkillTag[], stats: ReadonlyMap<number, QStat> = new Map()): SkillGroup[] {
  const all = [...new Set(tags.map((t) => t.q))];
  const hard = hardness(data, all, stats);
  const groups = new Map<string, SkillGroup>();
  for (const q of all) {
    const skills = needs(tags, q);
    if (!skills.length) continue;
    const key = groupKey(skills);
    const g = groups.get(key) ?? { key, skills, qs: [] };
    g.qs.push(q);
    groups.set(key, g);
  }
  const out = [...groups.values()].sort((a, b) => byGroup(a.skills, b.skills));
  for (const g of out) g.qs.sort((a, b) => kindOf(data, a) - kindOf(data, b) || (hard.get(a) ?? 0) - (hard.get(b) ?? 0) || a - b);
  return out;
}

/** This unit's own skills among these ids, each once, in number order (S1, S2 …). */
export function ownSkills(unitKey: string, ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id) => skillHome(id) === unitKey))].sort(bySkill);
}

/** The level a group of skills belongs to: its last skill of this unit; none of this unit's = the first level (null). */
export function levelSkillOf(unitKey: string, skills: readonly string[]): string | null {
  const own = ownSkills(unitKey, skills);
  return own.length ? own[own.length - 1] : null;
}

export type SkillLevel = {
  /** The skill's own number: Level 3 = S3. */
  n: number;
  /** "G8-U05-S3" */
  skill: string;
  /** Its groups in order: the skill alone first, then the combined ones, then (Level 1 only) other units' skills. */
  groups: SkillGroup[];
  /** Every question of the level in the book's order (the app's numbers). */
  qs: number[];
  /** The book's numbers of its questions: from … to (0 and -1 when the level is empty). */
  from: number;
  to: number;
  /** Its marks; null when the workbook doesn't know a question's marks. */
  max: number | null;
};

/** Where a group sits inside its level: its skill alone, then groups with it, then (Level 1) other units' skills only. */
function inLevel(skill: string, g: SkillGroup): number {
  if (g.skills.length === 1 && g.skills[0] === skill) return 0;
  return g.skills.includes(skill) ? 1 : 2;
}

function byInLevel(skill: string) {
  return (a: SkillGroup, b: SkillGroup) => inLevel(skill, a) - inLevel(skill, b) || a.skills.length - b.skills.length || byGroup(a.skills, b.skills);
}

/**
 * The downloaded book's levels, one a skill of this unit (Level n = Sn, his rule of 22 Nov 2026), and each question's
 * new number (the app's number → the book's), 1, 2, 3 … through the book. `own` = the unit's skills (its skills row);
 * a skill that only other questions' tags name counts too. Empty levels stay in the list (the page shows them pale).
 */
export function skillLevels(
  unitKey: string,
  data: MasterData,
  tags: readonly SkillTag[],
  own: readonly string[] = [],
  stats?: ReadonlyMap<number, QStat>,
): { levels: SkillLevel[]; number: Map<number, number> } {
  const groups = skillGroups(data, tags, stats);
  const skills = ownSkills(unitKey, [...own, ...groups.flatMap((g) => g.skills)]);
  const byLevel = new Map<string, SkillGroup[]>(skills.map((s) => [s, []]));
  for (const g of groups) {
    const s = levelSkillOf(unitKey, g.skills) ?? skills[0];
    if (s !== undefined) byLevel.get(s)?.push(g);
  }
  const number = new Map<number, number>();
  let next = 1;
  const levels = skills.map((skill): SkillLevel => {
    const mine = (byLevel.get(skill) ?? []).sort(byInLevel(skill));
    const qs = mine.flatMap((g) => g.qs);
    const from = qs.length ? next : 0;
    let max: number | null = 0;
    for (const q of qs) {
      number.set(q, next++);
      const m = outOf(data, q);
      max = m === null || max === null ? null : max + m;
    }
    return { n: Number(paperNo(unitKey, skill)) || 0, skill, groups: mine, qs, from, to: qs.length ? next - 1 : -1, max };
  });
  return { levels, number };
}

/**
 * A question moved to another group: it now needs exactly `skills` (one to three), for the whole question (tags for
 * its parts go). The main skill stays when it is still there; else the last one (the harder step comes later). Other
 * questions keep their tags. Returns the new tags, or plain words when the move can't be.
 */
export function moveTo(tags: readonly SkillTag[], q: number, skills: readonly string[]): SkillTag[] | string {
  const want = [...new Set(skills)].sort(bySkill);
  if (!want.length) return "Pick at least one skill.";
  if (want.length > SKILLS_A_TAG) return `${SKILLS_A_TAG} skills at most for one question.`;
  const mine = tags.filter((t) => t.q === q);
  if (!mine.length) return `Question ${q} has no skills yet.`;
  const before = mine.find((t) => t.p === undefined)?.s ?? mine[0].s;
  const s = want.includes(before) ? before : want[want.length - 1];
  const x = want.filter((id) => id !== s);
  const tag: SkillTag = { q, s, ...(x.length ? { x } : {}) };
  return [...tags.filter((t) => t.q !== q), tag].sort((a, b) => a.q - b.q || (a.p ?? "").localeCompare(b.p ?? ""));
}

/** The question a skill's lesson shows must carry the skill first: kept when it still does, else the plainest that does. */
export function keepExamples(skills: readonly Skill[], tags: readonly SkillTag[]): Skill[] {
  const firstOf = (id: string) => tags.filter((t) => t.s === id);
  return skills.map((s) => {
    const own = firstOf(s.id);
    if (s.eg !== undefined && own.some((t) => t.q === s.eg)) return s;
    const { eg: _old, ...rest } = s;
    // The plainest: a whole question that needs this skill alone, else any that carries it first.
    const alone = own.find((t) => t.p === undefined && !t.x?.length && !tags.some((o) => o.q === t.q && o !== t));
    const pick = alone ?? own[0];
    return pick ? { ...rest, eg: pick.q } : rest;
  });
}

/** How students did on each question: every real student whose level of it is corrected (free marks left out). */
export function statsOf(data: MasterData, states: readonly MState[]): Map<number, QStat> {
  const out = new Map<number, QStat>();
  const free = new Set(data.free ?? []);
  for (const m of states) {
    for (const l of data.levels) {
      if (!m.lv[String(l.n)]?.fixed) continue;
      for (let q = l.from; q <= l.to; q++) {
        if (free.has(q)) continue;
        const r = m.q[String(q)];
        const max = r?.max ?? outOf(data, q) ?? 0;
        const right = !r ? 1 : r.dk ? 0 : r.got !== undefined && max > 0 ? Math.max(0, Math.min(1, r.got / max)) : r.lost ? 0 : 1;
        const s = out.get(q) ?? { n: 0, right: 0 };
        out.set(q, { n: s.n + 1, right: s.right + right });
      }
    }
  }
  return out;
}
