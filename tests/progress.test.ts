// The Progress page's numbers: where each student stands in every unit, how fast (per class day), what he did
// today, whether he came; and who may see them (owner and Reports only).

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import { daysBetween, pace, ranks } from "../convex/lib/progress";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const START = new Date("2026-10-28T15:00:00+05:30").getTime();
const fresh = () => convexTest(schema, modules);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the Progress numbers", () => {
  test("ranks: best first, equal scores share a rank; pace per class day; days between", () => {
    expect(ranks([[3], [5, 1], [5, 1], [1]])).toEqual([3, 1, 1, 4]);
    expect(ranks([[2, 80], [2, 90], [2, 90, 1]])).toEqual([3, 2, 1]);
    expect(pace(3, 2)).toBe(1.5);
    expect(pace(5, 0)).toBeNull();
    expect([...daysBetween(["2026-10-20", "2026-10-26", "2026-10-28"], "2026-10-21", "2026-10-28")]).toEqual([
      "2026-10-26",
      "2026-10-28",
    ]);
  });

  test("workbook students: levels done, corrected, waiting, marks, today, pace, came today", async () => {
    const t = await asOwner(fresh());
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.demo.load, {});
    const b = await t.query(api.progress.board, { grade: 7 });
    expect(b.today).toBe("2026-10-28");
    const u08 = b.units.find((u) => u.code === "U08")!;
    expect(u08.master).toEqual({ levels: 8, total: 146 });
    expect(b.students.map((s) => s.name)).toEqual(["Malik", "Priya", "Vimal"]);
    const malik = b.students.find((s) => s.name === "Malik")!;
    expect(malik).toMatchObject({ stage: "master", unitId: u08._id, cameToday: true, demo: true });
    expect(malik.cells[u08._id].m).toMatchObject({ done: 3, corrected: 2, levels: 8, current: 4, waiting: [3], today: 3, days: 1 });
    expect(malik.cells[u08._id].m!.marks.slice(0, 4)).toEqual([90, 80, null, null]);
    const vimal = b.students.find((s) => s.name === "Vimal")!.cells[u08._id].m!;
    expect([vimal.done, vimal.current, vimal.finished]).toEqual([8, null, false]); // Level 8 waits for marks
  });

  test("theory-book students: solo questions done out of the book's", async () => {
    const t = await asOwner(fresh());
    await t.mutation(api.setup.ensure, {});
    await t.mutation(api.demo.load, {});
    const b = await t.query(api.progress.board, { grade: 11 });
    const u13 = b.units.find((u) => u.code === "U13")!;
    expect(u13.fighter?.solo).toBeGreaterThan(20);
    const cells = b.students.map((s) => s.cells[u13._id]?.f).filter(Boolean);
    expect(cells.length).toBe(10);
    for (const f of cells) expect(f!.total).toBe(u13.fighter!.solo);
    expect(Math.max(...cells.map((f) => f!.done))).toBeGreaterThan(0);
    // Keerthi isn't in today.
    expect(b.students.find((s) => s.name.startsWith("Keerthi"))?.cameToday).toBe(false);
  });

  test("only the owner and teachers with Reports can see it", async () => {
    const raw = fresh();
    await asOwner(raw);
    await addPerson(raw, { name: "Nila", token: "nila-token-0123456789abcdefghijklmnopqrstuvwxyz", tabs: ["correction"] });
    await expect(asPhone(raw, "nila-token-0123456789abcdefghijklmnopqrstuvwxyz").query(api.progress.board, { grade: 8 })).rejects.toThrow(
      /This needs/,
    );
    await addPerson(raw, { name: "Ravi", token: "ravi-token-0123456789abcdefghijklmnopqrstuvwxyz", tabs: ["correction"], can: ["reports"] });
    const b = await asPhone(raw, "ravi-token-0123456789abcdefghijklmnopqrstuvwxyz").query(api.progress.board, { grade: 8 });
    expect(b.students).toEqual([]);
    await expect(raw.query(api.progress.board, { grade: 8 })).rejects.toThrow();
  });
});

describe("one book's question sheet (2 Nov 2026)", () => {
  test("a theory-book question: its mark, left out when a later one is marked, teacher questions by Theory", async () => {
    const { fighterState } = await import("../src/progressData");
    const m = { "5": "right", "6": "wrong", "8": "slip", "9": "explained", "1": "taught", "2": "skip" };
    expect([5, 6, 8, 9].map((q) => fighterState(m, q, false, 9))).toEqual(["right", "wrong", "slip", "explained"]);
    expect(fighterState(m, 7, false, 9)).toBe("skipped");
    expect(fighterState(m, 12, false, 9)).toBe("todo");
    expect([1, 2, 3].map((q) => fighterState(m, q, true, 9))).toEqual(["taught", "tskip", "teach"]);
  });
  test("a workbook question: by its corrected marks, or handed in, before the app, not done", async () => {
    const { masterQState } = await import("../src/progressData");
    const mq = { "1": { got: 2, max: 2 }, "2": { got: 1, max: 2 }, "3": { got: 0, max: 2 }, "4": { got: 0, max: 2, dk: true }, "5": { got: 0, max: 2, x: true }, "6": { got: 0, max: 2, dk: true, tt: true } };
    const fixed = { fixed: true };
    expect([1, 2, 3, 4, 5, 6, 7].map((q) => masterQState(mq, fixed, q))).toEqual(["full", "part", "zero", "blank", "explained", "taught", "full"]);
    expect(masterQState({}, { done: true }, 9)).toBe("handed");
    expect(masterQState({}, { pre: true }, 9)).toBe("pre");
    expect(masterQState({}, undefined, 9)).toBe("todo");
  });
  test("blur: never the first three; last three, or all but the top three", async () => {
    const { blurPick, mayBlur } = await import("../src/progressData");
    const rows = [1, 2, 3, 3, 5, 6, 7].map((rank, i) => ({ s: { _id: `s${i}` }, rank }));
    expect(rows.map(mayBlur)).toEqual([false, false, false, false, true, true, true]);
    expect([...blurPick(rows, "last3")]).toEqual(["s4", "s5", "s6"]);
    expect([...blurPick(rows.slice(0, 5), "last3")]).toEqual(["s4"]);
    expect([...blurPick(rows, "allButTop3")]).toEqual(["s4", "s5", "s6"]);
    expect(blurPick(rows, "none").size).toBe(0);
  });
  test("the image grows with the class (one image, never cut)", async () => {
    const { sheetHeight } = await import("../src/racePoster");
    expect(sheetHeight(30, 2)).toBeGreaterThan(sheetHeight(10, 2));
    expect(sheetHeight(10, 2) - sheetHeight(9, 2)).toBe(50);
  });
});
