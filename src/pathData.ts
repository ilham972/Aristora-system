// Teaching by skill on the phones (13 Nov 2026): what the board says of each student's lost questions, read with the
// same rules as the server (convex/lib/path.ts). Pure, tested in tests/pathData.test.ts.
// - `skillBooks`: a student's workbooks whose questions carry skills, each lost question on its step.
// - `triesOf`: what the correction teacher marks for him now: tries after a lesson first, then second tries.
// - `lessonQueue`: the skill teacher's queue: one entry a skill, everyone here who waits for it, the fullest first.
// - `stuckList`: one-to-one: the students here with a question wrong after its lesson, the longest wait first.

import { bySkill, paperNo, pathOf, type PathItem } from "../convex/lib/path";
import { skillHome, type Skill, type SkillTag } from "../convex/lib/skills";
import type { View } from "./derive";

/** A tagged workbook as `tries.tags` sends it. */
export type TagBook = { unitId: string; key: string; grade: number; skills: Skill[]; tags: SkillTag[] };
export type TagMap = Map<string, TagBook>;
export const tagMap = (rows: readonly TagBook[] | undefined | null): TagMap => new Map((rows ?? []).map((r) => [r.unitId, r]));

export type SkillBook = { v: View; tb: TagBook; items: PathItem[] };

/** His book now and his other books with something waiting: the workbooks whose questions carry skills. */
export function skillBooks(v: View, tags: TagMap): SkillBook[] {
  const out: SkillBook[] = [];
  for (const b of [v, ...v.others]) {
    if (b.kind !== "master" || !b.mb || !b.unit) continue;
    const tb = tags.get(b.unit._id);
    if (!tb) continue;
    const items = pathOf(b.mm, b.mb, tb.tags);
    if (items.length) out.push({ v: b, tb, items });
  }
  return out;
}

/** One try the correction teacher marks: its book, the question, and the part labels to pick the wrong ones from. */
export type TryItem = { key: string; book: View; tb: TagBook; it: PathItem; labels: string[] };

/** A skill's name and number for a paper of that book. */
export function skillWords(tb: TagBook, tags: TagMap, id: string): { no: string; ta: string; en: string } {
  const home = [...tags.values()].find((x) => x.key === skillHome(id));
  const sk = home?.skills.find((s) => s.id === id);
  return { no: paperNo(tb.key, id), ta: sk?.ta ?? "", en: sk?.en ?? id };
}

/**
 * What waits on one student: `todo` = the tries to mark (after a lesson first: they have waited longest), `lesson` =
 * the questions waiting for a lesson (with the numbers written beside them), `stuck` = one-to-one's.
 */
export function triesOf(v: View, tags: TagMap): { todo: TryItem[]; lesson: TryItem[]; stuck: TryItem[] } {
  const all: TryItem[] = skillBooks(v, tags).flatMap((b) =>
    b.items.map((it) => ({
      key: `${b.tb.unitId}:${it.q}`,
      book: b.v,
      tb: b.tb,
      it,
      labels: [...new Set(b.tb.tags.filter((t) => t.q === it.q && t.p !== undefined).map((t) => t.p!))],
    })),
  );
  const of = (step: PathItem["step"]) => all.filter((x) => x.it.step === step);
  return { todo: [...of("redo"), ...of("fix")], lesson: of("lesson"), stuck: of("stuck") };
}

export type LessonMember = { v: View; qs: { code: string; q: number }[]; since: number; hold?: string };
export type LessonEntry = { skill: string; home: TagBook | null; sk: Skill | null; members: LessonMember[]; since: number };

/** Why the page doesn't tick someone: he is with a teacher, or signed out. */
const holdOf = (v: View): string | undefined => (v.where === "absent" ? "not here" : v.where !== "hall" ? "with a teacher" : undefined);

/**
 * The lessons to give, the fullest first (then the longest wait): each question wrong twice waits for the lesson of
 * its lowest skill not taught yet, so a student sits under one skill a question. Students here only.
 */
export function lessonQueue(views: readonly View[], tags: TagMap): LessonEntry[] {
  const by = new Map<string, LessonEntry>();
  for (const v of views) {
    if (v.where === "absent") continue;
    for (const b of skillBooks(v, tags)) {
      for (const it of b.items) {
        if (it.step !== "lesson") continue;
        const skill = it.skills[0];
        let e = by.get(skill);
        if (!e) {
          const home = [...tags.values()].find((x) => x.key === skillHome(skill)) ?? null;
          e = { skill, home, sk: home?.skills.find((s) => s.id === skill) ?? null, members: [], since: it.since };
          by.set(skill, e);
        }
        let m = e.members.find((x) => x.v.s._id === v.s._id);
        if (!m) {
          m = { v, qs: [], since: it.since, ...(holdOf(v) ? { hold: holdOf(v) } : {}) };
          e.members.push(m);
        }
        m.qs.push({ code: b.tb.key.split("-")[1] ?? b.tb.key, q: it.q });
        m.since = Math.min(m.since, it.since);
        e.since = Math.min(e.since, it.since);
      }
    }
  }
  const free = (e: LessonEntry) => e.members.filter((m) => !m.hold).length;
  for (const e of by.values()) e.members.sort((a, b) => a.since - b.since || a.v.s.name.localeCompare(b.v.s.name));
  return [...by.values()].sort((a, b) => free(b) - free(a) || a.since - b.since || bySkill(a.skill, b.skill));
}

export type StuckMember = { v: View; items: TryItem[]; since: number };

/** One-to-one: the students here with a question wrong after its lesson (or wrong twice with nothing left to teach). */
export function stuckList(views: readonly View[], tags: TagMap): StuckMember[] {
  const out: StuckMember[] = [];
  for (const v of views) {
    if (v.where === "absent") continue;
    const items = triesOf(v, tags).stuck;
    if (items.length) out.push({ v, items, since: Math.min(...items.map((x) => x.it.since)) });
  }
  return out.sort((a, b) => a.since - b.since || a.v.s.name.localeCompare(b.v.s.name));
}

/** The three numbers of the class now: tries the students owe, lessons we owe (student × skill), one-to-one. */
export function pathNow(views: readonly View[], tags: TagMap): { tries: number; lessons: number; stuck: number } {
  let tries = 0;
  for (const v of views) if (v.where !== "absent") tries += triesOf(v, tags).todo.length;
  return { tries, lessons: lessonQueue(views, tags).reduce((a, e) => a + e.members.length, 0), stuck: stuckList(views, tags).length };
}
