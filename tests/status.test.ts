import { describe, expect, test } from "vitest";
import {
  computeStatus,
  evalUrgency,
  theoryUrgency,
  type Mark,
  type Marks,
  type MarkState,
} from "../convex/lib/status";
import { fighter, PILOT_FIGHTER } from "../convex/lib/book";

const BOOK = fighter(PILOT_FIGHTER);
const SECTIONS = BOOK.sections;
const sectionById = BOOK.sectionById;

const T0 = 1_700_000_000_000;
function marks(entries: [number, MarkState, number?][]): Marks {
  const m: Record<string, Mark> = {};
  for (const [q, s, n] of entries) m[String(q)] = n ? { s, n, t: T0 } : { s, t: T0 };
  return m;
}
const teach = (...ids: string[]) =>
  ids.flatMap((id) => sectionById(id)!.teach.map((q) => [q, "taught"] as [number, MarkState]));
const right = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => [a + i, "right"] as [number, MarkState]);
const allLadderRight = () =>
  SECTIONS.filter((s) => s.kind === "ladder").flatMap((s) => s.solo.map((q) => [q, "right"] as [number, MarkState]));

describe("unit from the contents page", () => {
  test("61 questions: 20 with the teacher, 41 alone", () => {
    const teachCount = SECTIONS.reduce((a, s) => a + s.teach.length, 0);
    const soloCount = SECTIONS.reduce((a, s) => a + s.solo.length, 0);
    expect(teachCount).toBe(20);
    expect(soloCount).toBe(41);
    const all = SECTIONS.flatMap((s) => [...s.teach, ...s.solo]).sort((a, b) => a - b);
    expect(all).toEqual(Array.from({ length: 61 }, (_, i) => i + 1));
  });
});

describe("status rules", () => {
  test("a new student needs section A theory and has nothing to do", () => {
    const s = computeStatus({}, BOOK);
    expect(s.nextTheory).toBe("A");
    expect(s.left).toBe(0);
    expect(s.dry).toBe(true);
    expect(s.needs).toEqual(["theory"]);
    expect(theoryUrgency(s)).toBe("red");
  });

  test("after A theory his ladder 5-8 opens and B is next", () => {
    const s = computeStatus(marks(teach("A")), BOOK);
    expect(s.doable).toEqual([5, 6, 7, 8]);
    expect(s.nextTheory).toBe("B");
    expect(theoryUrgency(s)).toBe("green");
  });

  test("amber at 2 left, red at 0", () => {
    expect(theoryUrgency(computeStatus(marks([...teach("A"), [5, "right"], [6, "right"]]), BOOK))).toBe("amber");
    expect(theoryUrgency(computeStatus(marks([...teach("A"), ...right(5, 8)]), BOOK))).toBe("red");
  });

  test("R1: part of a section taught keeps its ladder closed", () => {
    const s = computeStatus(marks([[1, "taught"], [2, "taught"]]), BOOK);
    expect(s.nextTheory).toBe("A");
    expect(s.left).toBe(0);
  });

  test("R2: a skipped section opens its ladder", () => {
    const s = computeStatus(marks(sectionById("A")!.teach.map((q) => [q, "skip"] as [number, MarkState])), BOOK);
    expect(s.doable).toEqual([5, 6, 7, 8]);
  });

  test("a ladder question the teacher skipped is not work", () => {
    const s = computeStatus(marks([...teach("A"), [6, "skip"]]), BOOK);
    expect(s.doable).toEqual([5, 7, 8]);
  });

  test("slip and explained answers are redo work", () => {
    const s = computeStatus(marks([...teach("A"), [5, "slip"], [6, "explained"], [7, "right"], [8, "wrong"]]), BOOK);
    expect(s.doable).toEqual([5, 6]);
    expect(s.pending).toEqual([8]);
  });

  test("R7: 3 wrong in one section stops that section's new questions, not the redo", () => {
    const s = computeStatus(
      marks([...teach("A", "B", "C", "D"), ...right(5, 8), ...right(12, 14), ...right(18, 22), [27, "wrong"], [28, "wrong"], [29, "wrong"], [30, "slip"]]),
      BOOK,
    );
    expect(s.blocked).toEqual(["D"]);
    expect(s.doable).toEqual([30]);
  });

  test("R7: two wrong answers do not stop the ladder", () => {
    const s = computeStatus(marks([...teach("A"), [5, "wrong"], [6, "wrong"]]), BOOK);
    expect(s.blocked).toEqual([]);
    expect(s.doable).toEqual([7, 8]);
  });

  test("R8: wrong twice is stuck", () => {
    const s = computeStatus(marks([...teach("A"), [5, "wrong", 2], [6, "wrong", 1]]), BOOK);
    expect(s.stuck).toEqual([5]);
  });

  test("dry with wrong answers waiting needs evaluation", () => {
    const s = computeStatus(marks([...teach("A"), ...right(5, 7), [8, "wrong"]]), BOOK);
    expect(s.dry).toBe(true);
    expect(s.needs).toEqual(["theory", "evaluation"]);
  });

  test("R13: past papers open only when every ladder question was tried", () => {
    const all = SECTIONS.filter((s) => s.kind === "ladder").map((s) => s.id);
    const almost = marks([...teach(...all), ...allLadderRight().filter(([q]) => q !== 50)]);
    expect(computeStatus(almost, BOOK).pastOpen).toBe(false);
    expect(computeStatus(almost, BOOK).doable).toEqual([50]);
    const tried = marks([...teach(...all), ...allLadderRight().filter(([q]) => q !== 50), [50, "wrong"]]);
    const s = computeStatus(tried, BOOK);
    expect(s.pastOpen).toBe(true);
    expect(s.doable).toEqual([51, 52, 53, 54, 55, 56, 57, 58, 59, 60]);
    expect(s.finalOpen).toBe(false);
    expect(s.phase).toBe("papers");
  });

  test("the final challenge opens after every past paper was tried", () => {
    const all = SECTIONS.filter((s) => s.kind === "ladder").map((s) => s.id);
    const s = computeStatus(marks([...teach(...all), ...allLadderRight(), ...right(51, 60)]), BOOK);
    expect(s.doable).toEqual([61]);
  });

  test("finished only when everything is right or skipped", () => {
    const all = SECTIONS.filter((s) => s.kind === "ladder").map((s) => s.id);
    const done = marks([...teach(...all), ...allLadderRight(), ...right(51, 61)]);
    expect(computeStatus(done, BOOK).finished).toBe(true);
    expect(computeStatus(done, BOOK).dry).toBe(false);
    const notQuite = marks([...teach(...all), ...allLadderRight(), ...right(51, 60), [61, "explained"]]);
    expect(computeStatus(notQuite, BOOK).finished).toBe(false);
  });

  test("a re-teach (theory cleared after the ladder started) locks that ladder again", () => {
    const s = computeStatus(marks([...teach("A", "B"), ...right(5, 8), [12, "wrong"], [13, "explained"]]), BOOK);
    expect(s.doable).toEqual([13, 14]);
    const cleared = computeStatus(marks([...teach("A"), ...right(5, 8), [12, "wrong"], [13, "explained"]]), BOOK);
    expect(cleared.nextTheory).toBe("B");
    expect(cleared.reteach).toBe(true);
    expect(cleared.doable).toEqual([]);
  });

  test("R5: evaluation is ready after 10 minutes, red when stuck or out of work", () => {
    const m = marks([...teach("A"), [5, "wrong"]]);
    const s = computeStatus(m, BOOK);
    expect(evalUrgency(m, s, T0 + 9 * 60_000)).toBe("wait");
    expect(evalUrgency(m, s, T0 + 10 * 60_000)).toBe("ready");
    const stuck = marks([...teach("A"), [5, "wrong", 2]]);
    expect(evalUrgency(stuck, computeStatus(stuck, BOOK), T0)).toBe("red");
    const dry = marks([...teach("A"), ...right(5, 7), [8, "wrong"]]);
    expect(evalUrgency(dry, computeStatus(dry, BOOK), T0)).toBe("red");
  });
});
