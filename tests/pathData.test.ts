// Teaching by skill on the phones (src/pathData.ts, 13 Nov 2026): the correction teacher's tries, the skill teacher's
// queue (the fullest lesson first), one-to-one. Made-up skills on the G7 U08 workbook.

import { describe, expect, test } from "vitest";
import { KNOWN_WORKBOOKS } from "../convex/lib/book";
import type { MQ, MState } from "../convex/lib/master";
import type { SkillTag } from "../convex/lib/skills";
import type { View } from "../src/derive";
import { lessonQueue, pathNow, skillBooks, skillWords, stuckList, tagMap, triesOf, type TagBook } from "../src/pathData";

const BOOK = KNOWN_WORKBOOKS[0].data;
const S = (n: number) => `G7-U08-S${n}`;
const TAGS: SkillTag[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ q: i + 1, s: S(1) })),
  ...Array.from({ length: 10 }, (_, i) => ({ q: i + 11, s: S(2) })),
  { q: 51, p: "i", s: S(1) },
  { q: 51, p: "ii", s: S(3) },
];
const TB: TagBook = { unitId: "u08", key: "G7-U08", grade: 7, skills: [1, 2, 3].map((n) => ({ id: S(n), ta: `திறன் ${n}`, en: `Skill ${n}`, eg: n })), tags: TAGS };
const tags = tagMap([TB]);

const no: MQ = { got: 0, max: 2, lost: true, t: 1 };
const lv = (ns: number[]) => Object.fromEntries(ns.map((n) => [String(n), { fixed: 1, got: 0 }]));
/** A student on G7 U08 with these rows; `where`: in the hall unless said. */
const view = (name: string, q: Record<string, MQ>, o: { where?: View["where"]; sk?: Record<string, number>; levels?: number[] } = {}): View =>
  ({
    s: { _id: name.toLowerCase(), name, grade: 7 },
    unit: { _id: "u08", key: "G7-U08", code: "U08", grade: 7 },
    kind: "master",
    mb: BOOK,
    mm: { q, lv: lv(o.levels ?? [1, 2]), ...(o.sk ? { sk: o.sk } : {}) } as MState,
    where: o.where ?? "hall",
    others: [],
  }) as unknown as View;

describe("what the board says of each student's lost questions", () => {
  test("the correction teacher's tries: after a lesson first, then second tries; what waits, what is one-to-one's", () => {
    const v = view("Kumar", { 3: no, 4: { ...no, rt: 5 }, 12: { ...no, rt: 6 }, 13: { ...no, rt: 6, lt: 9 } }, { sk: { [S(2)]: 8 } });
    const t = triesOf(v, tags);
    expect(t.todo.map((x) => [x.it.q, x.it.step])).toEqual([[12, "redo"], [3, "fix"]]);
    expect(t.lesson.map((x) => [x.it.q, x.it.skills])).toEqual([[4, [S(1)]]]);
    expect(t.stuck.map((x) => x.it.q)).toEqual([13]);
    expect(t.todo[0].key).toBe("u08:12");
    // A long question's parts to pick the wrong ones from; a short one has none.
    const long = triesOf(view("Raj", { 51: { ...no, max: 7 } }, { levels: [BOOK.levels.find((l) => 51 >= l.from && 51 <= l.to)!.n] }), tags);
    expect(long.todo[0].labels).toEqual(["i", "ii"]);
    expect(t.todo[0].labels).toEqual([]);
    expect(skillWords(TB, tags, S(2))).toEqual({ no: "2", ta: "திறன் 2", en: "Skill 2" });
    // A workbook with no skills, a theory book, a student with nothing lost: nothing.
    expect(skillBooks(v, tagMap([]))).toEqual([]);
    expect(skillBooks(view("Sana", {}), tags)).toEqual([]);
    expect(skillBooks({ ...v, kind: "fighter" } as View, tags)).toEqual([]);
  });

  test("the lesson queue: the fullest lesson first, each student with his questions; signed out never, with a teacher not ticked", () => {
    const views = [
      view("Kumar", { 4: { ...no, rt: 5 }, 5: { ...no, rt: 7 }, 12: { ...no, rt: 9 } }),
      view("Nila", { 4: { ...no, rt: 6 } }),
      view("Raj", { 12: { ...no, rt: 3 } }, { where: "evaluation" }),
      view("Gone", { 4: { ...no, rt: 1 } }, { where: "absent" }),
      view("Mala", { 12: { ...no, rt: 4 } }, { sk: { [S(2)]: 8 } }),
    ];
    const q = lessonQueue(views, tags);
    // Skill 1: Kumar and Nila free. Skill 2: Kumar free, Raj with a teacher (Mala got that lesson: she does hers again).
    expect(q.map((e) => [e.skill, e.members.map((m) => m.v.s.name)])).toEqual([[S(1), ["Kumar", "Nila"]], [S(2), ["Raj", "Kumar"]]]);
    expect(q[0].members[0].qs).toEqual([{ code: "U08", q: 4 }, { code: "U08", q: 5 }]);
    expect(q[0].sk).toMatchObject({ id: S(1), eg: 1 });
    expect(q[0].home?.key).toBe("G7-U08");
    expect(q[1].members[0]).toMatchObject({ hold: "with a teacher", since: 3 });
    expect(q[1].members[1].hold).toBeUndefined();
    // The same number free: the longer wait first.
    const tie = lessonQueue([view("A", { 12: { ...no, rt: 9 } }), view("B", { 4: { ...no, rt: 2 } })], tags);
    expect(tie.map((e) => e.skill)).toEqual([S(1), S(2)]);
    expect(pathNow(views, tags)).toEqual({ tries: 1, lessons: 4, stuck: 0 });
  });

  test("one-to-one: the students here with a question wrong after its lesson, the longest wait first", () => {
    const views = [
      view("Kumar", { 4: { ...no, rt: 5, lt: 20 } }, { sk: { [S(1)]: 8 } }),
      view("Nila", { 4: { ...no, rt: 5, lt: 12 }, 5: { ...no, rt: 5, lt: 15 } }, { sk: { [S(1)]: 8 } }),
      view("Gone", { 4: { ...no, rt: 5, lt: 2 } }, { where: "absent", sk: { [S(1)]: 1 } }),
    ];
    const list = stuckList(views, tags);
    expect(list.map((m) => [m.v.s.name, m.items.map((x) => x.it.q), m.since])).toEqual([["Nila", [4, 5], 12], ["Kumar", [4], 20]]);
    expect(pathNow(views, tags)).toEqual({ tries: 0, lessons: 0, stuck: 2 });
  });
});
