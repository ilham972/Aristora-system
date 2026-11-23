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

import { firstQuestion, outOf, partOf, type MasterData, type MasterLevel, type MasterPart } from "./book";
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
  /** Its parts, each ending in its own marks strip: one, or about 20 marks each in a big level (`levelParts`). */
  parts: SkillPart[];
};

/** One marks strip's questions (23 Nov 2026): a level of a big skill is corrected part by part. */
export type SkillPart = {
  /** 1, 2, 3 … inside its level. */
  i: number;
  /** The app's numbers, in the book's order. */
  qs: number[];
  /** The book's numbers: from … to. */
  from: number;
  to: number;
  max: number | null;
};

/** A level up to this many marks stays one part (his yes, 23 Nov 2026: "add marks strip if the skill is big"). */
export const PART_WHOLE_MAX = 25;
/** A last part under this many marks joins the part before it (no strip for one or two questions). */
export const PART_MIN = 10;

/**
 * A level's questions cut into parts of about 20 marks, the workbook's own rule: a part closes at 20 (more when its
 * last question passes 20), or at 18–19 when the next question would take it past 20; never a question cut, the
 * book's order kept. One part when the level has up to 25 marks or a question's marks aren't known.
 */
export function levelParts(data: MasterData, qs: readonly number[]): { qs: number[]; max: number | null }[] {
  const marks = qs.map((q) => outOf(data, q));
  if (marks.some((m) => m === null)) return [{ qs: [...qs], max: null }];
  const total = (marks as number[]).reduce((a, m) => a + m, 0);
  if (total <= PART_WHOLE_MAX) return [{ qs: [...qs], max: total }];
  const out: { qs: number[]; max: number }[] = [];
  let cur: number[] = [];
  let sum = 0;
  qs.forEach((q, i) => {
    const m = marks[i] as number;
    if (cur.length && sum >= 18 && sum + m > 20) {
      out.push({ qs: cur, max: sum });
      cur = [];
      sum = 0;
    }
    cur.push(q);
    sum += m;
    if (sum >= 20) {
      out.push({ qs: cur, max: sum });
      cur = [];
      sum = 0;
    }
  });
  if (cur.length) {
    const last = out[out.length - 1];
    if (last && sum < PART_MIN) {
      last.qs.push(...cur);
      last.max += sum;
    } else out.push({ qs: cur, max: sum });
  }
  return out;
}

/** A part's name, as its strip and the Correction page say it: "3" (the level whole) or "3·2" (its second part). */
export function partName(n: number, i: number, parts: number): string {
  return parts > 1 ? `${n}·${i}` : String(n);
}

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
    const parts = levelParts(data, qs).map((p, i) => ({ i: i + 1, qs: p.qs, from: number.get(p.qs[0]) ?? 0, to: number.get(p.qs[p.qs.length - 1]) ?? -1, max: p.max }));
    return { n: Number(paperNo(unitKey, skill)) || 0, skill, groups: mine, qs, from, to: qs.length ? next - 1 : -1, max, parts: qs.length ? parts : [] };
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

/**
 * The levels of a skill workbook as stored (23 Nov 2026): a level a skill, its parts the stored levels, the groups the
 * runs of questions that need the same skills. The T page and the PDF read these once the skill book is the workbook,
 * so a later tag or new marks never move a printed question.
 */
export function storedLevels(unitKey: string, data: MasterData, tags: readonly SkillTag[]): { levels: SkillLevel[]; number: Map<number, number> } {
  const number = new Map<number, number>();
  const levels: SkillLevel[] = [];
  for (const lv of data.levels) {
    const skill = lv.skill ?? "";
    let l = levels[levels.length - 1];
    if (!l || l.skill !== skill) {
      l = { n: Number(paperNo(unitKey, skill)) || lv.n, skill, groups: [], qs: [], from: lv.from, to: lv.to, max: 0, parts: [] };
      levels.push(l);
    }
    const qs: number[] = [];
    for (let q = lv.from; q <= lv.to; q++) {
      qs.push(q);
      number.set(q, q);
      const want = needs(tags, q);
      const key = groupKey(want);
      const g = l.groups[l.groups.length - 1];
      if (g && g.key === key) g.qs.push(q);
      else l.groups.push({ key, skills: want, qs: [q] });
    }
    l.parts.push({ i: l.parts.length + 1, qs, from: lv.from, to: lv.to, max: lv.max });
    l.qs.push(...qs);
    l.to = lv.to;
    l.max = l.max === null ? null : l.max + lv.max;
  }
  return { levels, number };
}

/** The book by skill: as stored once it is the workbook, else made from the tags (the order they give). */
export function bookLevels(
  unitKey: string,
  data: MasterData,
  tags: readonly SkillTag[],
  own: readonly string[] = [],
  stats?: ReadonlyMap<number, QStat>,
): { levels: SkillLevel[]; number: Map<number, number> } {
  return data.skills ? storedLevels(unitKey, data, tags) : skillLevels(unitKey, data, tags, own, stats);
}

/**
 * The skill book as the unit's workbook (23 Nov 2026, the founder: "For the new year our work book is turning into
 * skill book, skill book is the workbook, we can delete old data"): the same questions numbered 1, 2, 3 … as the book
 * prints them; a level for each strip (a skill's level whole, or each part of a big one) named "3" or "3·2", its skill
 * kept; Part I and Part II runs where they fall; every question's marks, the free ones, and `was` (each question's old
 * number: the hidden permanent number). `map` = old number → new. Words when it can't be.
 */
export function skillWorkbook(
  data: MasterData,
  levels: readonly SkillLevel[],
  number: ReadonlyMap<number, number>,
): { data: MasterData; map: Map<number, number> } | string {
  if (data.skills) return "This unit's workbook is the skill book already.";
  const first = firstQuestion(data);
  // A topic tute's past papers go on from its ladder's numbers (Sets: 56–66): they keep the book's own levels.
  if (first !== 1) return "A topic tute's past papers go on from its ladder: they keep their own levels.";
  const last = data.parts.length ? data.parts[data.parts.length - 1].to : first - 1;
  const untagged: number[] = [];
  for (let q = first; q <= last; q++) if (!number.has(q)) untagged.push(q);
  if (untagged.length) {
    const some = untagged.slice(0, 6).map((q) => `Q${q}`).join(", ");
    return `${untagged.length === 1 ? `${some} has` : `${some}${untagged.length > 6 ? " …" : ""} have`} no skill yet: tag ${untagged.length === 1 ? "it" : "them"} first (every question must be in the skill book).`;
  }
  for (let q = first; q <= last; q++) if (outOf(data, q) === null) return `Q${q}'s marks aren't in the app: upload the workbook with its marks first.`;
  const map = new Map<number, number>(number);
  const was: number[] = [];
  for (const [q, n] of map) was[n - 1] = q;
  if (was.length !== last - first + 1 || was.some((q) => q === undefined)) return "The skill book's numbers don't cover the workbook: open the T page again.";
  const parts: MasterPart[] = [];
  was.forEach((q, i) => {
    const p = partOf(data, q)!;
    const n = i + 1;
    const run = parts[parts.length - 1];
    if (run && run.id === p.id) run.to = n;
    else parts.push(p.kind === "short" ? { id: p.id, from: n, to: n, kind: p.kind, each: p.each ?? 2 } : { id: p.id, from: n, to: n, kind: p.kind });
  });
  const out: MasterLevel[] = [];
  for (const l of levels) {
    for (const p of l.parts) {
      if (p.max === null) return `Level ${l.n}: a question's marks aren't in the app.`;
      out.push({ n: out.length + 1, from: p.from, to: p.to, max: p.max, name: partName(l.n, p.i, l.parts.length), skill: l.skill });
    }
  }
  const marks: Record<string, number> = {};
  for (const [q, m] of Object.entries(data.marks ?? {})) {
    const n = map.get(Number(q));
    if (n !== undefined) marks[String(n)] = m;
  }
  const free = (data.free ?? []).map((q) => map.get(q)).filter((n): n is number => n !== undefined).sort((a, b) => a - b);
  return {
    data: { kind: "master", parts, levels: out, ...(Object.keys(marks).length ? { marks } : {}), ...(free.length ? { free } : {}), skills: true, was },
    map,
  };
}
