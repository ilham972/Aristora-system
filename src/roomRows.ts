// Which grade, stage and unit the Theory and Evaluation pages' rows show (31 Oct 2026, his screenshot: Raza and Umair,
// Grade 9 fractions, were with Evaluation, but the rows showed Grade 8 unit 1, Grade 9 was pale and could not be
// tapped, and the room box offered Grade 8 students next to them). The rows were built only from who WAITS; a called
// student leaves that list, so when she called everyone of a book, her room's book fell out of the rows and the page
// jumped to the most urgent grade, while the questions on screen were still her room's.
//
// The rule now: the rows always say which book the question on her screen is from.
// - Her room's books are always in the rows (enabled, marked), even when nobody else waits for them.
// - With someone in her room (with her or on the way), the page's pick is the book of the question on her screen.
// - Her own pick (to find who to call next) lasts while it has someone; the page drops it when she calls, when they
//   arrive, and when she keeps someone for his next book. While she looks at another book, the questions on screen
//   are that book's (a preview, the pad pale), never her room's under another book's name.

import type { HeatCount } from "./theoryFocusData";

/** A book of her room: the unit row's key, its grade and its stage (the page's own words for stages). */
export type RoomBook<S extends string> = { key: string; grade: number; stage: S };
/** What she tapped in the rows (anything left out: the page decides). */
export type RowPick<S extends string> = { grade?: number; stage?: S; unit?: string };

export type Rows<S extends string> = {
  grade: number | null;
  stage: S;
  /** The unit picked (its row key); null when nothing waits in this grade and stage and her room has none there. */
  unit: string | null;
  /** Her room's units in this grade and stage that nobody else waits for: at the end of the unit row. */
  roomOnly: string[];
  /** The rows show a book of her room: the questions on screen are her room's. Else a preview of the picked ones. */
  onRoom: boolean;
  /** Grades with a book of her room: enabled and marked, even with nobody waiting. */
  roomGrades: Set<number>;
  /** Stages of the grade shown with a book of her room. */
  roomStages: Set<S>;
  /** Units of the grade and stage shown that are her room's. */
  roomUnits: Set<string>;
};

/**
 * The rows: her pick first (while it has someone, or her room is there); else, with someone in her room, the book
 * of the question on her screen (`room[0]`); else the most urgent. `room`: her room's books, the one of the question
 * on her screen first. `grades`, `stages`, `units`: who waits, the most urgent first (the pages' own rows).
 */
export function roomRows<S extends string>(o: {
  pick: RowPick<S>;
  room: readonly RoomBook<S>[];
  grades: readonly { grade: number; c: HeatCount }[];
  stages: (grade: number | null) => readonly { id: S; c: HeatCount }[];
  units: (grade: number | null, stage: S) => readonly string[];
  /** The stage when nothing waits at all. */
  rest: S;
}): Rows<S> {
  const room = o.room;
  const roomIn = (g: number | null, s?: S) => room.filter((b) => b.grade === g && (s === undefined || b.stage === s));
  const waits = (g: number) => (o.grades.find((x) => x.grade === g)?.c.total ?? 0) > 0;
  // Her pick counts while it has someone (or her room is there); otherwise none of it does.
  const mine = o.pick.grade !== undefined && (waits(o.pick.grade) || roomIn(o.pick.grade).length > 0);
  const grade = mine ? o.pick.grade! : (room[0]?.grade ?? o.grades.find((x) => x.c.total > 0)?.grade ?? null);

  const stages = o.stages(grade);
  const stageOk = (s: S) => (stages.find((x) => x.id === s)?.c.total ?? 0) > 0 || roomIn(grade, s).length > 0;
  const stage = mine && o.pick.stage !== undefined && stageOk(o.pick.stage) ? o.pick.stage : (roomIn(grade)[0]?.stage ?? stages.find((x) => x.c.total > 0)?.id ?? o.rest);

  const waiting = o.units(grade, stage);
  const here = roomIn(grade, stage).map((b) => b.key);
  const roomOnly = here.filter((k, i) => !waiting.includes(k) && here.indexOf(k) === i);
  const all = [...waiting, ...roomOnly];
  const unit = mine && o.pick.unit !== undefined && all.includes(o.pick.unit) ? o.pick.unit : (here[0] ?? all[0] ?? null);

  return {
    grade,
    stage,
    unit,
    roomOnly,
    onRoom: unit !== null && here.includes(unit),
    roomGrades: new Set(room.map((b) => b.grade)),
    roomStages: new Set(roomIn(grade).map((b) => b.stage)),
    roomUnits: new Set(here),
  };
}

/** Her room's books from the questions on her screen, the one of the open question first (each book once). */
export function roomBooksOf<Q, S extends string>(qs: readonly Q[], open: Q | undefined, bookOf: (q: Q) => RoomBook<S> | null): RoomBook<S>[] {
  const out: RoomBook<S>[] = [];
  for (const q of open ? [open, ...qs] : qs) {
    const b = bookOf(q);
    if (b && !out.some((x) => x.key === b.key && x.stage === b.stage)) out.push(b);
  }
  return out;
}
