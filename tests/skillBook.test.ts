// A unit's book by skill (14 Nov 2026, convex/lib/skillBook.ts): its groups (the exact set of skills a question needs),
// their teaching order, easy → hard inside each, the downloaded book's levels and numbers, a question moved to another
// group, and how students did (convex/skillBook.ts `statsOf`). Made-up skills only; the book is the U01 skeleton
// (Part I 1–52, Part II 53–73).
import { describe, expect, test } from "vitest";
import { outOf } from "../convex/lib/book";
import type { MState } from "../convex/lib/master";
import { byGroup, groupLabel, hardness, keepExamples, moveTo, needs, skillGroups, skillLabel, skillLevels, STAT_MIN, statsOf, type QStat } from "../convex/lib/skillBook";
import { skillId, skillsProblem, type KnownSkill, type Skill, type SkillTag } from "../convex/lib/skills";
import { readWorkbookHtml } from "../src/workbookFile";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0].data;
const UNIT = "G8-U01";
const S = (n: number) => skillId(UNIT, n);
const OTHER = "G8-U00-S2"; // an earlier unit's skill

/**
 * Part I: 1–20 S1, 21–40 S2, 41–52 S1 + S2 (two skills, a group of their own); Part II: 53–60 S3; 61–66 part by part
 * (i) S1, (ii) S3 → the group S1+S3; 67–72 S2 with the earlier unit's skill; 73 S3 alone.
 */
function tags(): SkillTag[] {
  const t: SkillTag[] = [];
  for (let q = 1; q <= 52; q++) t.push(q <= 20 ? { q, s: S(1) } : q <= 40 ? { q, s: S(2) } : { q, s: S(2), x: [S(1)] });
  for (let q = 53; q <= 60; q++) t.push({ q, s: S(3) });
  for (let q = 61; q <= 66; q++) t.push({ q, p: "i", s: S(1) }, { q, p: "ii", s: S(3) });
  for (let q = 67; q <= 72; q++) t.push({ q, s: S(2), x: [OTHER] });
  t.push({ q: 73, s: S(3) });
  return t;
}
const SKILLS: Skill[] = [
  { id: S(1), ta: "ஒன்று", en: "One", eg: 1 },
  { id: S(2), ta: "இரண்டு", en: "Two", eg: 21 },
  { id: S(3), ta: "மூன்று", en: "Three", eg: 53 },
];

describe("a unit's book by skill", () => {
  test("a question's group = every skill it needs, its parts' too, in teaching order", () => {
    expect(needs(tags(), 5)).toEqual([S(1)]);
    expect(needs(tags(), 45)).toEqual([S(1), S(2)]);
    expect(needs(tags(), 62)).toEqual([S(1), S(3)]);
    expect(needs(tags(), 70)).toEqual([OTHER, S(2)]);
    expect(needs(tags(), 99)).toEqual([]);
    expect(skillLabel(UNIT, S(3))).toBe("S3");
    expect(skillLabel(UNIT, OTHER)).toBe("S0·2");
    expect(groupLabel(UNIT, [S(2), S(3)])).toBe("S2+S3");
  });

  test("groups come after the last skill they need: S1, S2, then the bigger groups ending in S2, S3, S1+S3", () => {
    const g = skillGroups(BOOK, tags());
    expect(g.map((x) => groupLabel(UNIT, x.skills))).toEqual(["S1", "S2", "S0·2+S2", "S1+S2", "S3", "S1+S3"]);
    expect(g.map((x) => x.qs.length)).toEqual([20, 20, 6, 12, 9, 6]);
    // Every question once.
    expect(g.flatMap((x) => x.qs).sort((a, b) => a - b)).toEqual(Array.from({ length: 73 }, (_, i) => i + 1));
    expect(byGroup([S(1)], [S(1)])).toBe(0);
    expect(byGroup([S(3)], [S(1), S(2)])).toBeGreaterThan(0);
  });

  test("easy → hard: Part I first, the book's order, pulled by the students' marks once enough did it", () => {
    // Without marks: the book's own order.
    expect(skillGroups(BOOK, tags())[0].qs).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // A group with both kinds: Part I before Part II whatever the marks.
    const mixed = tags().map((t) => (t.q === 73 ? { q: 73, s: S(1) } : t));
    const s1 = skillGroups(BOOK, mixed).find((x) => x.key === S(1));
    expect(s1?.qs[s1.qs.length - 1]).toBe(73);
    // Q1 nobody gets right (12 students), Q20 everyone: Q1 goes back, Q20 forward.
    const stats = new Map<number, QStat>([
      [1, { n: 12, right: 0 }],
      [20, { n: 12, right: 12 }],
      [2, { n: STAT_MIN - 1, right: 0 }], // too few students: the book's place only
    ]);
    const qs = skillGroups(BOOK, tags(), stats)[0].qs;
    expect(qs.indexOf(1)).toBeGreaterThan(qs.indexOf(5));
    expect(qs.indexOf(20)).toBeLessThan(qs.indexOf(15));
    expect(qs[0]).toBe(2); // Q1 went back; Q2 has too few students to move
    const h = hardness(BOOK, [1, 2, 3], new Map());
    expect([h.get(1), h.get(2), h.get(3)]).toEqual([0, 0.5, 1]);
  });

  test("the downloaded book: one level a group, numbered 1, 2, 3 … in that order, each level's marks", () => {
    const { levels, number } = skillLevels(BOOK, tags());
    expect(levels.map((l) => [l.n, l.from, l.to])).toEqual([
      [1, 1, 20],
      [2, 21, 40],
      [3, 41, 46],
      [4, 47, 58],
      [5, 59, 67],
      [6, 68, 73],
    ]);
    expect(number.get(21)).toBe(21);
    expect(number.get(67)).toBe(41); // the earlier unit's skill: its group comes first among those ending in S2
    expect(new Set(number.values()).size).toBe(73);
    expect(levels[0].max).toBe(40);
    const sum = (qs: number[]) => qs.reduce((a, q) => a + (outOf(BOOK, q) ?? 0), 0);
    for (const l of levels) expect(l.max).toBe(sum(l.qs));
  });

  test("move: the question needs exactly the skills picked, its parts' tags go, the main skill stays when it can", () => {
    const t = moveTo(tags(), 62, [S(3)]) as SkillTag[];
    expect(t.filter((x) => x.q === 62)).toEqual([{ q: 62, s: S(3) }]);
    expect(t.length).toBe(tags().length - 1);
    const both = moveTo(tags(), 5, [S(3), S(1)]) as SkillTag[];
    expect(both.find((x) => x.q === 5)).toEqual({ q: 5, s: S(1), x: [S(3)] });
    // The main one gone: the last picked becomes main.
    expect((moveTo(tags(), 5, [S(2), S(3)]) as SkillTag[]).find((x) => x.q === 5)).toEqual({ q: 5, s: S(3), x: [S(2)] });
    expect(moveTo(tags(), 5, [])).toMatch(/at least one/);
    expect(moveTo(tags(), 5, [S(1), S(2), S(3), OTHER])).toMatch(/3 skills at most/);
    expect(moveTo(tags(), 99, [S(1)])).toMatch(/no skills/);
    // Still in book order.
    expect(t.map((x) => x.q)).toEqual([...t.map((x) => x.q)].sort((a, b) => a - b));
  });

  test("a moved example: the lesson's question is chosen again; the move passes the save's own check", () => {
    const t = moveTo(tags(), 1, [S(2)]) as SkillTag[];
    const sk = keepExamples(SKILLS, t);
    expect(sk[0].eg).toBe(2); // Q1 left S1: the next question that needs S1 alone
    expect(sk[1].eg).toBe(21);
    const known = new Map<string, KnownSkill>([[OTHER, { unit: "G8-U00", ta: "முன்", en: "Before" }]]);
    expect(skillsProblem(UNIT, BOOK, null, { skills: SKILLS, tags: tags().filter((x) => x.p === undefined).concat(Array.from({ length: 6 }, (_, i) => ({ q: 61 + i, s: S(3), x: [S(1)] }))) }, known)).toBe("");
    // A skill left with no question is refused by that check.
    let all = tags();
    for (let q = 53; q <= 73; q++) all = moveTo(all, q, [S(1)]) as SkillTag[];
    expect(skillsProblem(UNIT, BOOK, null, { skills: keepExamples(SKILLS, all), tags: all }, known)).toMatch(/G8-U01-S3 .* has no question/);
  });

  test("how students did: corrected levels only, free marks out, part marks as a share", () => {
    const lv1 = BOOK.levels[0];
    const m = (q: Record<string, MState["q"][string]>, fixed = true): MState => ({ q, lv: { [String(lv1.n)]: fixed ? { fixed: 1 } : { done: 1 } } });
    const st = statsOf(BOOK, [
      m({ "1": { lost: true, t: 1 } }),
      m({ "1": { got: 1, max: 2, lost: true, t: 1 } }),
      m({}),
      m({ "1": { lost: true, t: 1 } }, false), // handed in, not corrected: not counted
    ]);
    expect(st.get(1)).toEqual({ n: 3, right: 1.5 });
    expect(st.get(lv1.to)).toEqual({ n: 3, right: 3 });
    expect(st.get(lv1.to + 1)).toBeUndefined();
    const free = statsOf({ ...BOOK, free: [1] }, [m({})]);
    expect(free.get(1)).toBeUndefined();
  });
});
