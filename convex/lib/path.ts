// Teaching by skill: the path of a lost question (13 Nov 2026, the founder: "we just teach the skill ... then they can
// do in the next try"; "build completely in the app as complete system"). Pure: the server (convex/tries.ts) and the
// phones (src/pathData.ts) share these rules. Only workbooks whose questions carry skills (convex/lib/skills.ts); a
// book with no skills keeps the way of before (every lost question waits for a teacher).
//
// A question that lost marks, not explained, not with Theory, is on one of four steps:
// - "fix":    he tries it again by himself (in class the correction teacher marks that second try; at home his phone
//             does, when the question comes back). Right = half its marks, closed (`secondTry`, his rule of 10 Nov).
// - "lesson": wrong twice. Its *suspects* = the skills of the parts still wrong that he hasn't shown elsewhere (`proven`).
//             He waits for the lesson of the lowest one he wasn't taught yet: one lesson = one skill, for everyone who
//             waits for it. He has shown every skill it needs: its own first skill's lesson all the same (his flow:
//             wrong twice always gets a lesson before one-to-one).
// - "redo":   every suspect was taught: he does it again; the correction teacher marks that try. Right = closed.
// - "stuck":  wrong after his lesson: one teacher, one student (he explains each step, she finds where he stops).
// A lesson he got counts for every question of the books he had then, also one that goes wrong later: a skill is taught
// to him once in a group; wrong after that is one-to-one's.
// Everything is read from ONE row of his (a workbook's marks, its lessons `sk`) with that book's tags, so a phone and
// the server always agree: the board sends a phone only his books with something waiting (convex/state.ts), never all
// of them. What he showed in another book says nothing here; a lesson is written on every book of his that needs its
// skill (convex/tries.ts `taught`).

import type { MasterData } from "./book";
import { isFree } from "./free";
import type { MState } from "./master";
import { skillHome, skillsOf, type SkillTag } from "./skills";

export type Step = "fix" | "lesson" | "redo" | "stuck";
export interface PathItem {
  q: number;
  /** Its level's number. */
  n: number;
  step: Step;
  /** lesson: the skills still to teach him for it, the lowest first; redo, stuck: its suspects; fix: none. */
  skills: string[];
  /** The parts still wrong at his last try (none = the whole question). */
  parts: string[];
  /** Since when it is on this step. */
  since: number;
}

/** A skill counts as shown with at least this many questions that need it right at the first try… */
export const PROVEN_RIGHT = 3;
/** …and at least this many right for each one that lost marks (a weak student's three easy ones prove nothing). */
export const PROVEN_RATIO = 2;

/** Where a skill stands among all skills: its grade, its unit's number, its own number ("G8-U04-S7" → [8, 4, 7]). */
export function skillOrder(id: string): [number, number, number] {
  const m = /^(?:G(\d{1,2})|OL)-[A-Za-z]*0*(\d+)-S(\d+)$/.exec(id);
  return m ? [m[1] ? Number(m[1]) : 12, Number(m[2]), Number(m[3])] : [99, 0, 0];
}
export function bySkill(a: string, b: string): number {
  const x = skillOrder(a);
  const y = skillOrder(b);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.localeCompare(b);
}

/** A skill's number as it is written on a paper of its own unit ("7"), or of another unit ("4·2": unit 4, skill 2). */
export function paperNo(unitKey: string, id: string): string {
  if (skillHome(id) === unitKey) return id.slice(unitKey.length + 2);
  const [, unit, n] = skillOrder(id);
  return `${unit}·${n}`;
}

/** The skills a question needs: of these parts (the key's labels), or of the whole question; each once, in order. */
export function questionSkills(tags: readonly SkillTag[], q: number, parts: readonly string[] = []): string[] {
  const out = new Set<string>();
  if (parts.length) for (const p of parts) for (const s of skillsOf(tags, q, p)) out.add(s);
  else for (const t of tags) if (t.q === q) for (const s of [t.s, ...(t.x ?? [])]) out.add(s);
  return [...out].sort(bySkill);
}

/** The first skill of these parts (or of the whole question, of each of its parts): what the question mainly tests. */
export function firstSkills(tags: readonly SkillTag[], q: number, parts: readonly string[] = []): string[] {
  const out = new Set<string>();
  if (parts.length) {
    for (const p of parts) {
      const s = skillsOf(tags, q, p)[0];
      if (s) out.add(s);
    }
  } else for (const t of tags) if (t.q === q) out.add(t.s);
  return [...out].sort(bySkill);
}

export type Shown = Map<string, { right: number; lost: number }>;

/** What one book says of each skill: the questions that need it and got full marks at the first try, and those that lost marks. */
export function shownIn(m: MState, book: MasterData, tags: readonly SkillTag[], into: Shown = new Map()): Shown {
  for (const l of book.levels) {
    if (!m.lv[String(l.n)]?.fixed) continue;
    for (let q = l.from; q <= l.to; q++) {
      const r = m.q[String(q)];
      if (!r || isFree(book, q)) continue;
      // Lost marks: the parts known to be wrong (his last try's, or the ones he left blank), else the whole question.
      for (const s of questionSkills(tags, q, r.lost ? (r.rp ?? r.dkp ?? []) : [])) {
        const c = into.get(s) ?? { right: 0, lost: 0 };
        if (r.lost) c.lost++;
        else c.right++;
        into.set(s, c);
      }
    }
  }
  return into;
}

/** The skills he has shown: right often enough, and far more often than not. */
export function provenOf(shown: Shown): Set<string> {
  const out = new Set<string>();
  for (const [s, c] of shown) if (c.right >= PROVEN_RIGHT && c.right >= PROVEN_RATIO * c.lost) out.add(s);
  return out;
}

/**
 * One book's lost questions, each on its step, from that book's own row: `m.sk` = the lessons he got (skill → when),
 * what he has shown = this book's own questions.
 */
export function pathOf(m: MState, book: MasterData, tags: readonly SkillTag[]): PathItem[] {
  const taught = new Map(Object.entries(m.sk ?? {}));
  const proven = provenOf(shownIn(m, book, tags));
  const out: PathItem[] = [];
  for (const l of book.levels) {
    if (!m.lv[String(l.n)]?.fixed) continue;
    for (let q = l.from; q <= l.to; q++) {
      const r = m.q[String(q)];
      if (!r?.lost || r.x || r.th || isFree(book, q)) continue;
      const parts = r.rp ?? [];
      if (r.rt === undefined) {
        out.push({ q, n: l.n, step: "fix", skills: [], parts: [], since: r.t });
        continue;
      }
      const needs = questionSkills(tags, q, parts);
      const open = needs.filter((s) => !proven.has(s));
      // What he has shown only chooses among a question's skills; it never leaves it without a lesson.
      const suspects = open.length ? open : firstSkills(tags, q, parts);
      if (r.lt !== undefined) out.push({ q, n: l.n, step: "stuck", skills: suspects, parts, since: r.lt });
      else if (suspects.length === 0) out.push({ q, n: l.n, step: "stuck", skills: [], parts, since: r.rt });
      else {
        const todo = suspects.filter((s) => !taught.has(s));
        if (todo.length) out.push({ q, n: l.n, step: "lesson", skills: todo, parts, since: r.rt });
        else out.push({ q, n: l.n, step: "redo", skills: suspects, parts, since: Math.max(r.rt, ...suspects.map((s) => taught.get(s) ?? 0)) });
      }
    }
  }
  return out;
}

/** Does this book need that skill at all (some question carries it, first or beside another)? */
export function needsSkill(tags: readonly SkillTag[], skill: string): boolean {
  return tags.some((t) => t.s === skill || !!t.x?.includes(skill));
}
