// Which grade, stage and unit the Theory and Evaluation rows show (src/roomRows.ts; his screenshot, 31 Oct 2026: her
// room on Grade 9 fractions, the rows on Grade 8 unit 1, Grade 9 pale).

import { describe, expect, test } from "vitest";
import { roomBooksOf, roomRows, type RoomBook, type RowPick } from "../src/roomRows";
import type { HeatCount } from "../src/theoryFocusData";

type S = "fighter" | "master" | "legend";
const n = (total: number, red = 0): HeatCount => ({ red, orange: total - red, yellow: 0, total });
const zero = n(0);

/** Who waits: Grade 8 Master unit 1 (3, two red) and unit 5 (2); nobody else. Grades the most urgent first. */
const grades = [8, 6, 7, 9, 10, 11].map((grade) => ({ grade, c: grade === 8 ? n(5, 2) : zero }));
const stages = (g: number | null) =>
  g === 8
    ? [
        { id: "master" as const, c: n(5, 2) },
        { id: "fighter" as const, c: zero },
        { id: "legend" as const, c: zero },
      ]
    : [
        { id: "fighter" as const, c: zero },
        { id: "master" as const, c: zero },
        { id: "legend" as const, c: zero },
      ];
const units = (g: number | null, s: S) => (g === 8 && s === "master" ? ["g8u01:master", "g8u05:master"] : []);
const rowsFor = (pick: RowPick<S>, room: RoomBook<S>[]) => roomRows<S>({ pick, room, grades, stages, units, rest: "master" });

const FRACTIONS: RoomBook<S> = { key: "g9u04:master", grade: 9, stage: "master" };
const G8U05: RoomBook<S> = { key: "g8u05:master", grade: 8, stage: "master" };

describe("The rows always say which book the question on her screen is from", () => {
  test("her room empty: the most urgent, or her pick while it has someone", () => {
    expect(rowsFor({}, [])).toMatchObject({ grade: 8, stage: "master", unit: "g8u01:master", onRoom: false, roomOnly: [] });
    expect(rowsFor({ grade: 8, stage: "master", unit: "g8u05:master" }, [])).toMatchObject({ unit: "g8u05:master" });
    // A pick with nobody left (she called them all): the page decides again, nothing of it stays.
    expect(rowsFor({ grade: 9, stage: "fighter" }, [])).toMatchObject({ grade: 8, stage: "master", unit: "g8u01:master" });
  });

  test("his screenshot: Raza and Umair (Grade 9 fractions) with her and nobody else waits for it: the rows stay there", () => {
    const r = rowsFor({}, [FRACTIONS]);
    expect(r).toMatchObject({ grade: 9, stage: "master", unit: "g9u04:master", onRoom: true, roomOnly: ["g9u04:master"] });
    // Grade 9, Master and the unit are hers (marked, never pale); Grade 8 is still there with its count to tap.
    expect([...r.roomGrades]).toEqual([9]);
    expect([...r.roomStages]).toEqual(["master"]);
    expect([...r.roomUnits]).toEqual(["g9u04:master"]);
    // Even when her old pick (Grade 9, to call them) has nobody left: the room keeps the rows there.
    expect(rowsFor({ grade: 9, stage: "master", unit: "g9u04:master" }, [FRACTIONS])).toMatchObject({ grade: 9, unit: "g9u04:master", onRoom: true });
  });

  test("to call the next ones she taps Grade 8: the rows go there (not her room); her room's grade brings them back", () => {
    expect(rowsFor({ grade: 8 }, [FRACTIONS])).toMatchObject({ grade: 8, stage: "master", unit: "g8u01:master", onRoom: false, roomOnly: [] });
    expect(rowsFor({ grade: 9 }, [FRACTIONS])).toMatchObject({ grade: 9, unit: "g9u04:master", onRoom: true });
    // A stage she picked in another grade doesn't follow her: her room's stage there.
    expect(rowsFor({ grade: 9, stage: "fighter" }, [FRACTIONS])).toMatchObject({ grade: 9, stage: "master", onRoom: true });
  });

  test("her room's book with others waiting for it: in its place in the row (not twice), and picked", () => {
    const r = rowsFor({}, [G8U05]);
    expect(r).toMatchObject({ grade: 8, stage: "master", unit: "g8u05:master", onRoom: true, roomOnly: [] });
    // She picks unit 1 of the same grade: a book that isn't her room's.
    expect(rowsFor({ grade: 8, stage: "master", unit: "g8u01:master" }, [G8U05])).toMatchObject({ unit: "g8u01:master", onRoom: false });
  });

  test("two books in her room: the rows show the one of the question on her screen", () => {
    expect(rowsFor({}, [G8U05, FRACTIONS])).toMatchObject({ grade: 8, unit: "g8u05:master", onRoom: true });
    expect(rowsFor({}, [FRACTIONS, G8U05])).toMatchObject({ grade: 9, unit: "g9u04:master", onRoom: true });
    expect([...rowsFor({}, [FRACTIONS, G8U05]).roomGrades].sort()).toEqual([8, 9]);
    // Her pick of Grade 8 in a room with both: her room's book there (not unit 1).
    expect(rowsFor({ grade: 8 }, [FRACTIONS, G8U05])).toMatchObject({ grade: 8, unit: "g8u05:master", onRoom: true });
  });

  test("her room's books in the order of her screen: the open question's first, each once", () => {
    type Q = { id: string; b: RoomBook<S> | null };
    const qs: Q[] = [
      { id: "a", b: G8U05 },
      { id: "b", b: FRACTIONS },
      { id: "c", b: G8U05 },
      { id: "d", b: null },
    ];
    expect(roomBooksOf(qs, qs[1], (q) => q.b)).toEqual([FRACTIONS, G8U05]);
    expect(roomBooksOf(qs, undefined, (q) => q.b)).toEqual([G8U05, FRACTIONS]);
    expect(roomBooksOf([] as Q[], undefined, (q) => q.b)).toEqual([]);
  });
});
