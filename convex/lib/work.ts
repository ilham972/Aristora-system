// Each department's work, counted from the history (8 Nov 2026). Its dashboard's "Cleared today" and "Every class"
// count here, the same way: his "after class I can see how much they corrected the paper, how much they explained ...
// but next day that's gone ... the progress also always saved ... yesterday 100 questions correction, today 300
// corrections. So they are improving".
// - Fighter and Master: what each teacher did on her department's books (at her desk, in consultation, at the board):
//   explained (x), taught (tt), sent to theory (th); an undo takes its number back. Their number: explained + taught.
// - Correction (the Management department): papers corrected (workbook levels saved: "level-marks") and their questions
//   (lq, from the book's levels), theory-book questions Correction marked (each question once, as its last tap left
//   it), photos from home marked. Its number: the questions corrected (lq + qs + photos). Anyone's correction counts
//   (the Fighter and Master teachers correct homework too).
// - A day = midnight to midnight in Sri Lanka. Today's is counted when asked; each day before is kept in `workDays`
//   once it is over (convex/work.ts fill, every 10 minutes: the days still missing, back to the first event).

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { asMaster, bookFor } from "./backend";
import { DAY_MS, SL_OFFSET_MS } from "./day";

export type WorkDept = "fighter" | "master" | "management";
export const WORK_DEPTS: readonly WorkDept[] = ["fighter", "master", "management"];
export type Parts = Record<string, number>;
export type WorkPerson = { name: string; total: number; parts: Parts; students: number };
/** One department's day: its number, its parts, the students worked with, each person, each grade (6–12). */
export type DeptDay = { day: number; total: number; parts: Parts; students: number; people: WorkPerson[]; grades: { grade: number; n: number }[] };

/** The parts of each department, and which of them make its number. */
const PARTS: Record<WorkDept, { keys: readonly string[]; total: readonly string[] }> = {
  fighter: { keys: ["x", "tt", "th"], total: ["x", "tt"] },
  master: { keys: ["x", "tt", "th"], total: ["x", "tt"] },
  management: { keys: ["levels", "lq", "qs", "photos"], total: ["lq", "qs", "photos"] },
};

/** Events of one day read at most (a class has a few thousand). */
export const WORK_EVENTS = 12_000;

/** Which number a teacher's tap moves (its undo the same number down). */
const NUMBER_OF: Record<string, "x" | "th" | "tt"> = {
  explained: "x",
  unexplained: "x",
  "to-theory": "th",
  "to-theory-off": "th",
  taught: "tt",
  untaught: "tt",
  "whole-unit": "tt",
  "whole-unit-off": "tt",
};
const UNDO = new Set(["unexplained", "to-theory-off", "untaught", "whole-unit-off"]);
const TEACH_KINDS = new Set(["desk", "desk-undo", "consult", "board", "board-undo"]);

type Ev = Pick<Doc<"events">, "kind" | "value" | "who" | "studentId" | "stage" | "by" | "q" | "unit">;

/** Counts per person and grade; numbers taken back never go below nothing. */
function tally(dept: WorkDept, gradeOf: ReadonlyMap<string, number>) {
  const { keys, total } = PARTS[dept];
  const by = new Map<string, { parts: Parts; ids: Set<string> }>();
  const all = new Set<string>();
  const grades = new Map<number, number>();
  const sum = (p: Parts) => total.reduce((n, k) => n + (p[k] ?? 0), 0);
  return {
    add(who: string, key: string, n: number, studentId: string) {
      const p = by.get(who) ?? { parts: Object.fromEntries(keys.map((k) => [k, 0])), ids: new Set<string>() };
      p.parts[key] = (p.parts[key] ?? 0) + n;
      if (n > 0) {
        p.ids.add(studentId);
        all.add(studentId);
      }
      by.set(who, p);
      const g = gradeOf.get(studentId);
      if (g !== undefined && total.includes(key)) grades.set(g, (grades.get(g) ?? 0) + n);
    },
    done(day: number): DeptDay {
      const people = [...by.entries()]
        .map(([name, p]) => {
          const parts = Object.fromEntries(keys.map((k) => [k, Math.max(0, p.parts[k] ?? 0)]));
          return { name, total: sum(parts), parts, students: p.ids.size };
        })
        .filter((p) => keys.some((k) => p.parts[k] > 0))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
      const parts = Object.fromEntries(keys.map((k) => [k, people.reduce((n, p) => n + p.parts[k], 0)]));
      return {
        day,
        total: sum(parts),
        parts,
        students: all.size,
        people,
        grades: [...grades.entries()]
          .filter(([, n]) => n > 0)
          .sort((a, b) => a[0] - b[0])
          .map(([grade, n]) => ({ grade, n })),
      };
    },
  };
}

/** Fighter or Master: each teacher's taps on the department's books (undos taken off). */
export function countTeach(day: number, events: Iterable<Ev>, dept: "fighter" | "master", mine: ReadonlySet<string>, gradeOf: ReadonlyMap<string, number>): DeptDay {
  const t = tally(dept, gradeOf);
  for (const e of events) {
    if (e.stage !== dept || !e.studentId || !mine.has(e.studentId) || !e.who || !TEACH_KINDS.has(e.kind)) continue;
    const n = NUMBER_OF[e.value ?? ""];
    if (!n) continue;
    const down = e.kind.endsWith("-undo") || UNDO.has(e.value ?? "");
    t.add(e.who, n, down ? -1 : 1, e.studentId);
  }
  return t.done(day);
}

/** A workbook level's questions ("G7-U08:3" → 10); 0 when its book is gone. */
export type LevelSizes = ReadonlyMap<string, number>;

/** Correction: papers corrected and their questions, theory-book questions Correction marked, photos from home marked. */
export function countCorrected(day: number, events: Iterable<Ev>, mine: ReadonlySet<string>, gradeOf: ReadonlyMap<string, number>, sizes: LevelSizes): DeptDay {
  const t = tally("management", gradeOf);
  // A theory book's question: its last tap by Correction (marked, or cleared again).
  const last = new Map<string, { who: string; value: string; studentId: string }>();
  for (const e of events) {
    if (!e.studentId || !mine.has(e.studentId)) continue;
    const who = e.who ?? "Correction";
    if (e.kind === "level-marks") {
      const n = /^(\d+) /.exec(e.value ?? "")?.[1];
      t.add(who, "levels", 1, e.studentId);
      t.add(who, "lq", n ? (sizes.get(`${e.unit ?? ""}:${n}`) ?? 0) : 0, e.studentId);
    } else if (e.kind === "photo-marked") t.add(who, "photos", 1, e.studentId);
    else if ((e.kind === "mark" || e.kind === "undo") && e.by === "correction" && e.q !== undefined)
      last.set(`${e.studentId}:${e.unit ?? ""}:${e.q}`, { who, value: e.value ?? "clear", studentId: e.studentId });
  }
  for (const m of last.values()) if (m.value !== "clear") t.add(m.who, "qs", 1, m.studentId);
  return t.done(day);
}

/** The questions of each level corrected in these events, from the units' workbooks. */
export async function levelSizes(ctx: QueryCtx, events: readonly Ev[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const keys = new Set(events.filter((e) => e.kind === "level-marks" && e.unit).map((e) => e.unit!));
  for (const key of keys) {
    const unit = await ctx.db
      .query("units")
      .withIndex("by_key", (q) => q.eq("key", key))
      .first();
    const book = unit ? await bookFor(ctx, unit._id, "master") : null;
    if (!book) continue;
    for (const l of asMaster(book).levels) out.set(`${key}:${l.n}`, l.to - l.from + 1);
  }
  return out;
}

/** When this Sri Lanka day began (its number: slDayNo). */
export const dayStartOf = (day: number) => day * DAY_MS - SL_OFFSET_MS;

/** One day's events (at most WORK_EVENTS) and the students: the real ones, or the simulation's (test). */
async function dayInputs(ctx: QueryCtx, day: number, test: boolean, known?: readonly Doc<"students">[]) {
  const from = dayStartOf(day);
  const events = await ctx.db
    .query("events")
    .withIndex("by_at", (q) => q.gte("at", from).lt("at", from + DAY_MS))
    .take(WORK_EVENTS);
  const students = known ?? (await ctx.db.query("students").collect());
  const mine = new Set(students.filter((s) => !!s.test === test).map((s) => s._id as string));
  const gradeOf = new Map<string, number>();
  for (const s of students) if (typeof s.grade === "number") gradeOf.set(s._id, s.grade);
  return { events, mine, gradeOf };
}

/** One department's day, counted now (today's, or any day's still in the history). */
export async function deptDay(ctx: QueryCtx, day: number, test: boolean, dept: WorkDept): Promise<DeptDay> {
  const { events, mine, gradeOf } = await dayInputs(ctx, day, test);
  if (dept !== "management") return countTeach(day, events, dept, mine, gradeOf);
  return countCorrected(day, events, mine, gradeOf, await levelSizes(ctx, events));
}

/** Every department's day (kept once the day is over: the real students only; `students` read once for many days). */
export async function allDepts(
  ctx: QueryCtx,
  day: number,
  students?: readonly Doc<"students">[],
): Promise<{ fighter: DeptDay; master: DeptDay; management: DeptDay; events: number }> {
  const { events, mine, gradeOf } = await dayInputs(ctx, day, false, students);
  return {
    fighter: countTeach(day, events, "fighter", mine, gradeOf),
    master: countTeach(day, events, "master", mine, gradeOf),
    management: countCorrected(day, events, mine, gradeOf, await levelSizes(ctx, events)),
    events: events.length,
  };
}
