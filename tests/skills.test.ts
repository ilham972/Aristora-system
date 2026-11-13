// Skills (13 Nov 2026, convex/lib/skills.ts): every question of a workbook carries one skill, or each of its parts does.
// The rules that a unit's skills must pass before the Claude link saves them. Made-up skill names only (the repo is
// public); the book is the U01 skeleton.
import { describe, expect, test } from "vitest";
import type { KeyAnswer } from "../convex/lib/key";
import { skillCounts, skillHome, skillId, skillOf, skillsOf, skillsProblem, SKILLS_MAX, type KnownSkill, type SkillFile, type SkillTag } from "../convex/lib/skills";
import { readWorkbookHtml } from "../src/workbookFile";
import U01 from "./fixtures/workbook-g8-u01.html?raw";

const BOOK = readWorkbookHtml(U01, "G8_U01_Workbook_source_v3.zip")[0].data;
const UNIT = "G8-U01";
const S = (n: number) => skillId(UNIT, n);

/** A made-up key: Part I one answer each; Part II two parts each ("i", "ii"). */
const KEY: KeyAnswer[] = [
  ...Array.from({ length: 52 }, (_, i) => ({ q: i + 1, a: String(i) })),
  ...Array.from({ length: 21 }, (_, i) => ({ q: i + 53, parts: [{ p: "i", a: "1" }, { p: "ii", a: "2" }] })),
];

/** A right file: three skills; Part I by threes, Part II's parts on two skills; Q73 one skill for the whole question. */
function file(): SkillFile {
  const tags: SkillTag[] = [];
  for (let q = 1; q <= 52; q++) tags.push({ q, s: S((q % 3) + 1) });
  for (let q = 53; q <= 72; q++) tags.push({ q, p: "i", s: S(1) }, { q, p: "ii", s: S(2) });
  tags.push({ q: 73, s: S(3) });
  return {
    skills: [
      { id: S(1), ta: "முதல் திறன்", en: "A made-up first skill", eg: 3 },
      { id: S(2), ta: "இரண்டாம் திறன்", en: "A made-up second skill" },
      { id: S(3), ta: "மூன்றாம் திறன்", en: "A made-up third skill", eg: 73 },
    ],
    tags,
  };
}
const none = new Map<string, KnownSkill>();
const check = (f: SkillFile, known = none, key: KeyAnswer[] | null = KEY) => skillsProblem(UNIT, BOOK, key, f, known);
const change = (fn: (f: SkillFile) => void) => {
  const f = file();
  fn(f);
  return f;
};

describe("a unit's skills", () => {
  test("a right file passes; ids name their unit", () => {
    expect(check(file())).toBe("");
    expect(S(3)).toBe("G8-U01-S3");
    expect(skillHome("G8-U05-S12")).toBe("G8-U05");
    expect(skillHome("OL-U44-S1")).toBe("OL-U44");
    for (const bad of ["S1", "G8-U05", "G8-U05-S0", "G8-U05-S100", "g8-u05-s1 ", "G8-U05-S1x"]) expect(skillHome(bad)).toBeNull();
  });

  test("the skills themselves: this unit's ids, each once, both names, forty at most, each with a question", () => {
    expect(check({ skills: [], tags: [] })).toBe("No skills.");
    expect(check(null as unknown as SkillFile)).toMatch(/needs skills and tags/);
    expect(check(change((f) => (f.skills[0].id = "G8-U02-S1")))).toMatch(/this unit's skills are G8-U01-S1/);
    expect(check(change((f) => (f.skills[0].id = "first")))).toMatch(/this unit's skills are G8-U01-S1/);
    expect(check(change((f) => (f.skills[1].id = S(1))))).toBe("Skill G8-U01-S1 comes twice.");
    expect(check(change((f) => (f.skills[1].ta = " ")))).toMatch(/Skill G8-U01-S2 needs a Tamil name and an English name/);
    expect(check(change((f) => (f.skills[1].en = "x".repeat(81))))).toMatch(/80 letters at most/);
    expect(check(change((f) => (f.skills = Array.from({ length: SKILLS_MAX + 1 }, (_, i) => ({ id: S(i + 1), ta: "த", en: "e" })))))).toMatch(/41 skills: 40 at most/);
    expect(check(change((f) => f.skills.push({ id: S(4), ta: "நான்காம்", en: "A fourth nobody carries" })))).toBe("Skill G8-U01-S4 (A fourth nobody carries) has no question.");
  });

  test("a skill's example is a question of the book that carries it", () => {
    expect(check(change((f) => (f.skills[0].eg = 99)))).toMatch(/its example, question 99, is not in this book \(1 to 73\)/);
    expect(check(change((f) => (f.skills[0].eg = 1)))).toBe("Skill G8-U01-S1: its example, question 1, carries another skill first.");
    // A question that needs the skill only beside its main one is no example of it.
    expect(check(change((f) => ((f.tags[0].x = [S(1)]), (f.skills[0].eg = 1))))).toBe("Skill G8-U01-S1: its example, question 1, carries another skill first.");
    // A part's tag counts: Q53 (i) carries S1.
    expect(check(change((f) => (f.skills[0].eg = 53)))).toBe("");
  });

  test("every question has its skill: one for the whole question, or one for each part the key names", () => {
    expect(check(change((f) => f.tags.splice(4, 1)))).toBe("Question 5 has no skill.");
    expect(check(change((f) => f.tags.push({ q: 5, s: S(1) })))).toBe("Question 5 is tagged twice.");
    expect(check(change((f) => f.tags.push({ q: 74, s: S(1) })))).toMatch(/A tag for question 74: the book has 1 to 73/);
    expect(check(change((f) => (f.tags[0].s = "S1")))).toBe('Question 1: skill "S1" is not one of this unit\'s skills.');
    expect(check(change((f) => (f.tags = f.tags.filter((t) => !(t.q === 60 && t.p === "ii")))))).toBe("Question 60: part ii has no skill.");
    expect(check(change((f) => f.tags.push({ q: 60, p: "ii", s: S(3) })))).toBe("Question 60 part ii is tagged twice.");
    expect(check(change((f) => f.tags.push({ q: 60, s: S(3) })))).toBe("Question 60: one skill for the whole question, or one for each part, not both.");
    expect(check(change((f) => f.tags.push({ q: 60, p: "iii", s: S(3) })))).toBe('Question 60: the key has no part "iii" (its parts: i, ii).');
    // A short question has no parts; a unit with no key takes whole questions only.
    expect(check(change((f) => (f.tags[0] = { q: 1, p: "i", s: S(2) })))).toBe('Question 1: the key has no part "i" (tag the whole question).');
    expect(check(file(), none, null)).toBe('Question 53: the key has no part "i" (tag the whole question).');
    const wholes = change((f) => (f.tags = Array.from({ length: 73 }, (_, i) => ({ q: i + 1, s: S((i % 3) + 1) }))));
    wholes.skills.forEach((s) => delete s.eg);
    expect(check(wholes, none, null)).toBe("");
  });

  test("a skill of another unit must be in the app already", () => {
    const f = change((x) => (x.tags[0].s = "G7-U08-S2"));
    expect(check(f)).toBe("Question 1: skill G7-U08-S2 is not in the app (tag G7-U08 first, or give the question a skill of this unit).");
    expect(check(f, new Map([["G7-U08-S2", { unit: "G7-U08", ta: "ஒரு பழைய திறன்", en: "An older made-up skill" }]]))).toBe("");
  });

  test("a question may need two or three skills: the main one first, none twice, three at most", () => {
    // Q1 (S2) also needs S1; Q60 (ii) (S2) also needs S3 and an older unit's skill.
    const known = new Map([["G7-U08-S2", { unit: "G7-U08", ta: "ஒரு பழைய திறன்", en: "An older made-up skill" }]]);
    const more = change((f) => {
      f.tags[0].x = [S(1)];
      f.tags.find((t) => t.q === 60 && t.p === "ii")!.x = [S(3), "G7-U08-S2"];
    });
    expect(check(more, known)).toBe("");
    expect(skillsOf(more.tags, 1)).toEqual([S(2), S(1)]);
    expect(skillsOf(more.tags, 60, "ii")).toEqual([S(2), S(3), "G7-U08-S2"]);
    expect(skillOf(more.tags, 60, "ii")).toBe(S(2));
    expect(skillsOf(more.tags, 60)).toEqual([]);
    expect(skillsOf(more.tags, 73, "i")).toEqual([S(3)]);
    expect(check(change((f) => (f.tags[0].x = [S(1), S(3), S(1)])))).toBe("Question 1: 3 skills at most (the main one and two more).");
    expect(check(change((f) => (f.tags[0].x = [])))).toBe("Question 1: 3 skills at most (the main one and two more).");
    expect(check(change((f) => (f.tags[0].x = [S(2)])))).toBe("Question 1: a skill comes twice.");
    expect(check(change((f) => (f.tags[0].x = [S(1), S(1)])))).toBe("Question 1: a skill comes twice.");
    expect(check(change((f) => (f.tags[0].x = ["S9"])))).toBe('Question 1: skill "S9" is not one of this unit\'s skills.');
    expect(check(change((f) => (f.tags[0].x = ["G7-U08-S2"])))).toMatch(/skill G7-U08-S2 is not in the app \(tag G7-U08 first/);
    // A skill no question has as its main one still has its questions; they are counted apart.
    const beside = change((f) => {
      f.skills.push({ id: S(4), ta: "நான்காம் திறன்", en: "A made-up skill only beside others" });
      f.tags[0].x = [S(4)];
      f.tags[1].x = [S(4), S(1)];
    });
    expect(check(beside)).toBe("");
    expect(skillCounts(beside.tags).get(S(4))).toBeUndefined();
    expect(skillCounts(beside.tags, true).get(S(4))).toBe(2);
    expect(skillCounts(beside.tags, true).get(S(1))).toBe(1);
    // Beside its main skill in one part and the main one in another part of the same question: counted once, as main.
    expect(skillCounts([{ q: 1, p: "i", s: "a" }, { q: 1, p: "ii", s: "b", x: ["a"] }], true).get("a")).toBeUndefined();
  });

  test("reading the tags: a part's own skill first, then the whole question's; how many questions carry each", () => {
    const { tags } = file();
    expect(skillOf(tags, 2)).toBe(S(3));
    expect(skillOf(tags, 60, "ii")).toBe(S(2));
    expect(skillOf(tags, 60)).toBeNull();
    expect(skillOf(tags, 73, "ii")).toBe(S(3));
    expect(skillOf(tags, 99)).toBeNull();
    const n = skillCounts(tags);
    expect(n.get(S(1))).toBe(17 + 20);
    expect(n.get(S(2))).toBe(18 + 20);
    expect(n.get(S(3))).toBe(17 + 1);
    // A question whose two parts carry one skill counts once.
    expect(skillCounts([{ q: 1, p: "i", s: "a" }, { q: 1, p: "ii", s: "a" }, { q: 2, s: "a" }]).get("a")).toBe(2);
  });
});
