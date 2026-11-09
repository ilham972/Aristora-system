// The Fees and Books pages' rules on the phone (src/moneyData.ts, 9 Nov 2026): how near the end of his book a student
// is, his next printed book (covered when he already holds one ahead), what to print less the copies in hand, and the
// Fees lists. Made-up students and units only.

import { describe, expect, test } from "vitest";
import { ageTone, costOf, creditList, finishOf, nextBookOf, oweWords, owedList, printNeeds, rs, todayList, type Acc } from "../src/moneyData";
import type { Unit } from "../src/store";
import { asView } from "./views";

const unit = (id: string, grade: number, term: number, order: number): Unit => ({ _id: id, grade, term, order, code: `U${String(order).padStart(2, "0")}`, key: `G${grade}-${id}`, en: id, ta: id }) as unknown as Unit;
const UNITS = [unit("U1", 8, 1, 1), unit("U2", 8, 1, 2), unit("U3", 8, 1, 3), unit("U4", 8, 2, 4), unit("X1", 9, 1, 1)];
const lv = (n: number) => ({ n, from: n, to: n, max: 10 });

/** A Grade 8 student on a workbook of 5 levels, working on level `at` (null: every level handed in). */
function master(id: string, u: Unit, at: number | null, more: Record<string, unknown> = {}) {
  const levels = [1, 2, 3, 4, 5].map(lv);
  return asView({
    s: { _id: id, name: `Student ${id}`, grade: 8 },
    unit: u,
    stage: "master",
    kind: "master",
    mb: { kind: "master", levels, parts: [] },
    ms: { levels, current: at === null ? null : lv(at), finished: false },
    marks: {},
    ...more,
  });
}
/** A theory book of 10 questions, `tried` of them marked. */
function fighter(id: string, u: Unit, tried: number, finished = false) {
  const marks: Record<string, unknown> = {};
  for (let q = 1; q <= tried; q++) marks[String(q)] = { s: "right", t: 1 };
  return asView({
    s: { _id: id, name: `Student ${id}`, grade: 8 },
    unit: u,
    stage: "fighter",
    kind: "fighter",
    f: { sections: [{ id: "a", solo: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], teach: [] }] },
    st: { finished, finalOpen: false },
    marks,
  });
}
const all = () => true;

describe("how near the end of his book", () => {
  test("a workbook: 2 levels or fewer left (his level counts) = soon; every level handed in = now", () => {
    expect(finishOf(master("a", UNITS[0], 3))).toEqual({ state: "ok", done: 2, total: 5, words: "Level 3 of 5" });
    expect(finishOf(master("a", UNITS[0], 4))).toMatchObject({ state: "soon", words: "Level 4 of 5" });
    expect(finishOf(master("a", UNITS[0], 5))).toMatchObject({ state: "soon" });
    expect(finishOf(master("a", UNITS[0], null))).toMatchObject({ state: "now", words: "all 5 levels handed in" });
  });
  test("a theory book: a fifth or fewer not tried = soon; all tried or finished = now; no book = nothing to tell", () => {
    expect(finishOf(fighter("a", UNITS[0], 7))).toMatchObject({ state: "ok", words: "7 of 10 questions" });
    expect(finishOf(fighter("a", UNITS[0], 8))).toMatchObject({ state: "soon" });
    expect(finishOf(fighter("a", UNITS[0], 10))).toMatchObject({ state: "now" });
    expect(finishOf(fighter("a", UNITS[0], 2, true))).toMatchObject({ state: "now", words: "finished" });
    expect(finishOf(asView({ s: { _id: "z" }, kind: "none", unit: null, stage: null }))).toBeNull();
  });
});

describe("his next printed book", () => {
  test("the next unit of his term in the app; covered when he already holds one ahead (in order or not)", () => {
    const v = master("a", UNITS[0], 5);
    expect(nextBookOf(v, UNITS, all, new Set())).toEqual({ need: { u: "U2", st: "master" }, covered: null });
    // U2's workbook isn't in the app: the one after it.
    expect(nextBookOf(v, UNITS, (u) => u !== "U2", new Set()).need).toEqual({ u: "U3", st: "master" });
    // Given U3 ahead (out of order): he is covered.
    expect(nextBookOf(v, UNITS, all, new Set(["U3:master"]))).toEqual({ need: null, covered: { u: "U3", st: "master" } });
    // A book behind him doesn't count.
    expect(nextBookOf(master("b", UNITS[2], 5), UNITS, all, new Set(["U1:master"]))).toEqual({ need: null, covered: null });
  });
  test("a term's last workbook: nothing (Legend); a term's last theory book: its first workbook", () => {
    expect(nextBookOf(master("a", UNITS[2], 5), UNITS, all, new Set()).need).toBeNull();
    expect(nextBookOf(fighter("a", UNITS[2], 9), UNITS, all, new Set()).need).toEqual({ u: "U1", st: "master" });
    expect(nextBookOf(fighter("a", UNITS[0], 9), UNITS, (u, st) => st === "master" || u === "U3", new Set()).need).toEqual({ u: "U3", st: "fighter" });
  });
});

describe("what to print", () => {
  test("each next book's students now and soon, less the copies in hand; the most urgent first; never demo or gone", () => {
    const views = [
      master("a", UNITS[0], null),
      master("b", UNITS[0], 4),
      master("c", UNITS[0], 2), // not near the end
      master("d", UNITS[1], null),
      master("e", UNITS[1], 5, { s: { _id: "e", name: "Demo", demo: true } }),
      master("f", UNITS[0], null, { s: { _id: "f", name: "Gone", archived: true } }),
      master("g", UNITS[0], null),
    ];
    const holds = (sid: string) => new Set(sid === "g" ? ["U2:master"] : []);
    const stock = (key: string) => (key === "U2:master" ? 1 : null);
    const list = printNeeds(views, UNITS, all, holds, stock);
    expect(list.map((r) => [r.key, r.now.map((x) => x.id), r.soon.map((x) => x.id), r.inHand, r.print, r.red])).toEqual([
      ["U3:master", ["d"], [], null, 1, 1],
      ["U2:master", ["a"], ["b"], 1, 1, 0],
    ]);
  });
});

describe("the Fees lists", () => {
  const acc = (sid: string, more: Partial<Acc>): Acc => ({ sid, name: sid, owe: 0, cr: 0, c: 0, b: 0, o: 0, bu: [], np: 0, paid: 0, ...more });
  test("today: everyone who came; still owing first, part-paid next, paid last; A–Z", () => {
    const list = todayList(
      [
        acc("Zara", { came: "2026-11-10", owe: 350 }),
        acc("Arun", { came: "2026-11-10", owe: 700 }),
        acc("Bala", { came: "2026-11-10" }),
        acc("Chan", { came: "2026-11-10", owe: 150 }),
        acc("Old", { came: "2026-11-09", owe: 350 }),
        acc("Left", { came: "2026-11-10", owe: 350, gone: true }),
      ],
      { Bala: 350, Chan: 200 },
      "2026-11-10",
    );
    expect(list.map((x) => [x.a.sid, x.paidToday])).toEqual([
      ["Arun", 0],
      ["Zara", 0],
      ["Chan", 200],
      ["Bala", 350],
    ]);
  });
  test("owed (the most first, those who left too), credit, how old, the words", () => {
    const list = [acc("A", { owe: 350 }), acc("B", { owe: 1050, gone: true }), acc("C", { cr: 200 }), acc("D", { owe: 350, cr: 0 })];
    expect(owedList(list).map((a) => a.sid)).toEqual(["B", "A", "D"]);
    expect(creditList(list).map((a) => a.sid)).toEqual(["C"]);
    expect(ageTone("2026-10-27", "2026-11-10")).toBe("red");
    expect(ageTone("2026-11-03", "2026-11-10")).toBe("amber");
    expect(ageTone("2026-11-08", "2026-11-10")).toBeNull();
    expect(oweWords({ c: 2, b: 1, o: 1 })).toBe("2 classes · 1 book · old debt");
    expect(oweWords({ c: 1, b: 0, o: 0 })).toBe("1 class");
    expect(rs(12500)).toBe("Rs 12,500");
    expect(costOf(18, 7)).toBe(126);
    expect(costOf(undefined, 7)).toBeNull();
  });
});
