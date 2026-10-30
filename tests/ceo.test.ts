// The CEO page's arithmetic (convex/lib/ceo.ts): one class's digest, many classes' load, the verdicts, money.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";
import {
  digestOf,
  loadOf,
  moneyOf,
  shareOut,
  sumDigests,
  verdictOf,
  withOneMore,
  type DCall,
  type DEvent,
  type Digest,
} from "../convex/lib/ceo";

const T0 = Date.UTC(2026, 9, 31, 10, 0); // 3:30 PM in Sri Lanka
const min = (n: number) => T0 + n * 60_000;

describe("shareOut: one person's minutes", () => {
  test("overlaps count once and are shared", () => {
    const { total, per } = shareOut([
      { s: 0, e: 10, id: "a" },
      { s: 5, e: 15, id: "b" },
    ]);
    expect(total).toBe(15);
    expect(per.get("a")).toBeCloseTo(7.5);
    expect(per.get("b")).toBeCloseTo(7.5);
  });
  test("the same student twice at once counts once", () => {
    const { total, per } = shareOut([
      { s: 0, e: 10, id: "a" },
      { s: 0, e: 10, id: "a" },
    ]);
    expect(total).toBe(10);
    expect(per.get("a")).toBe(10);
  });
  test("empty and backwards spans are nothing", () => {
    expect(shareOut([{ s: 5, e: 5, id: "a" }, { s: 9, e: 3, id: "b" }]).total).toBe(0);
  });
});

function aClass() {
  const students = [
    { _id: "m1", stage: "master" },
    { _id: "f1", stage: "fighter" },
    { _id: "demo", stage: "master", demo: true },
  ];
  const visits = [
    { studentId: "m1", inAt: min(0), outAt: min(60) },
    { studentId: "f1", inAt: min(30), outAt: min(90) },
    { studentId: "demo", inAt: min(0), outAt: min(90) },
  ];
  const events: DEvent[] = [
    // m1 hands Level 1 in at 10, Nisha corrects it at 18 (timed: 2 minutes from her first mark).
    { at: min(10), kind: "level-done", who: "Nisha", studentId: "m1", unit: "G8-U01", value: "1" },
    { at: min(18), kind: "level-marks", who: "Nisha", studentId: "m1", unit: "G8-U01", value: "1 16/20", ms: 8 * 60_000, took: 2 * 60_000 },
    // Level 2 corrected on the spot, untimed: 3 minutes.
    { at: min(40), kind: "level-marks", who: "Nisha", studentId: "m1", unit: "G8-U01", value: "2 10/20", ms: 0 },
    // f1: three answers marked 40 s apart (the first of the run counts 30 s).
    { at: min(45), kind: "mark", who: "Nisha", studentId: "f1", unit: "G11-U13", value: "right" },
    { at: min(45) + 40_000, kind: "mark", who: "Nisha", studentId: "f1", unit: "G11-U13", value: "wrong" },
    { at: min(45) + 80_000, kind: "mark", who: "Nisha", studentId: "f1", unit: "G11-U13", value: "right" },
    // m1 sat with no work for 6 minutes, waiting for Correction; f1 3 minutes for Theory or Evaluation.
    { at: min(16), kind: "idle", studentId: "m1", value: "correction", ms: 6 * 60_000 },
    { at: min(50), kind: "idle", studentId: "f1", value: "theory+evaluation", ms: 3 * 60_000 },
    // Evaluation explained 3 questions.
    { at: min(50), kind: "explained", who: "Fathima", studentId: "m1", value: "3" },
    { at: min(50), kind: "done-evaluation", who: "Fathima", studentId: "m1", ms: 10 * 60_000 },
    // A demo student never counts.
    { at: min(20), kind: "level-marks", who: "Nisha", studentId: "demo", unit: "G8-U01", value: "1 20/20", took: 60_000 },
    { at: min(70), kind: "not-reached", who: "Nisha", studentId: "f1", ms: 4 * 60_000 },
  ];
  const calls: DCall[] = [
    // Evaluation: m1 40-50, f1 45-55 (both with Fathima, 5 minutes together).
    { studentId: "m1", room: "evaluation", kind: "evaluation", status: "done", group: "e1", createdAt: min(38), sentAt: min(39), arrivedAt: min(40), endedAt: min(50), teacher: "Fathima" },
    { studentId: "f1", room: "evaluation", kind: "evaluation", status: "done", group: "e2", createdAt: min(43), sentAt: min(44), arrivedAt: min(45), endedAt: min(55), teacher: "Fathima" },
    // Theory: one lesson of 12 minutes for f1 (Nila).
    { studentId: "f1", room: "theory", kind: "theory", status: "done", group: "t1", createdAt: min(60), sentAt: min(61), arrivedAt: min(62), endedAt: min(74), teacher: "Nila" },
    // Closed by the class's end, nobody tapped Done: not a visit.
    { studentId: "m1", room: "theory", kind: "theory", status: "done", group: "t2", createdAt: min(85), sentAt: min(86), endedAt: min(90) },
    // Demo: never.
    { studentId: "demo", room: "theory", kind: "theory", status: "done", group: "t3", createdAt: min(20), sentAt: min(20), endedAt: min(40), teacher: "Nila" },
  ];
  return digestOf({ start: min(0), end: min(90), events, calls, visits, students, stats: { theory: { qs: 4 } } });
}

describe("digestOf: one class", () => {
  const d = aClass();
  test("who came, for how long, how many at once (demo students never count)", () => {
    expect(d.day).toBe("2026-10-31");
    expect(d.minutes).toBe(90);
    expect(d.came).toBe(2);
    expect(d.studentMin).toBe(120);
    expect(d.peak).toBe(2);
    expect(d.stages.master.students).toBe(1);
    expect(d.stages.fighter.students).toBe(1);
    expect(d.stages.master.studentMin).toBe(60);
  });
  test("Correction: levels handed in and corrected, timed or not, theory-book answers, the wait", () => {
    const c = d.rooms.correction;
    expect(c.handedIn).toBe(1);
    expect(c.levels).toBe(2);
    expect(c.timed).toBe(1);
    expect(c.levelMin).toBe(5); // 2 timed + 3 untimed
    expect(c.marks).toBe(3);
    expect(c.markMin).toBeCloseTo(0.5 + 40 / 60 + 40 / 60, 1);
    expect(c.got).toBe(26);
    expect(c.max).toBe(40);
    expect(c.waits).toBe(2);
    expect(c.waitMax).toBe(8);
    expect(c.people).toBe(1);
    expect(c.busyMin).toBeCloseTo(5 + 0.5 + 80 / 60, 1);
    expect(d.stages.master.levels).toBe(2);
    expect(d.stages.fighter.marks).toBe(3);
  });
  test("Evaluation: her minutes once, shared while two were with her", () => {
    const e = d.rooms.evaluation;
    expect(e.busyMin).toBe(15);
    expect(e.visits).toBe(2);
    expect(e.students).toBe(2);
    expect(e.qs).toBe(3);
    expect(d.stages.master.evaluation).toBe(7.5);
    expect(d.stages.fighter.evaluation).toBe(7.5);
  });
  test("Theory: one lesson; the call the class's end closed is not a visit", () => {
    const t = d.rooms.theory;
    expect(t.lessons).toBe(1);
    expect(t.visits).toBe(1);
    expect(t.busyMin).toBe(12);
    expect(t.qs).toBe(4);
    expect(d.stages.fighter.theory).toBe(12);
  });
  test("idle minutes by what he waited for (two rooms: half each)", () => {
    expect(d.idle.total).toBe(9);
    expect(d.idle.correction).toBe(6);
    expect(d.idle.theory).toBe(1.5);
    expect(d.idle.evaluation).toBe(1.5);
    expect(d.stages.master.idleMin).toBe(6);
    expect(d.lost).toBe(1);
  });
  test("each person in her own room", () => {
    const by = Object.fromEntries(d.people.map((p) => [p.name, p]));
    expect(by.Nisha.room).toBe("correction");
    expect(by.Nisha.levels).toBe(2);
    expect(by.Nisha.marks).toBe(3);
    expect(by.Fathima.room).toBe("evaluation");
    expect(by.Fathima.min.evaluation).toBe(15);
    expect(by.Nila.room).toBe("theory");
    expect(by.Nila.lessons).toBe(1);
    expect(d.people.map((p) => p.room)).toEqual(["correction", "evaluation", "theory"]);
  });
  test("the line every 15 minutes: in class, idle, levels waiting", () => {
    expect(d.line.length).toBe(6);
    const at15 = d.line[0];
    expect(at15).toMatchObject({ n: 1, idle: 1, queue: 1 });
    expect(d.line[1]).toMatchObject({ n: 2, idle: 0, queue: 0 }); // 30 min: f1 arrives at 30 exactly
  });
});

function fakeDigest(o: { students: number; minutes: number; corr: number; ev: number; th: number; people?: Partial<Record<"correction" | "evaluation" | "theory", number>>; idleCorr?: number; peak?: number }): Digest {
  const d = aClass();
  const studentMin = o.students * o.minutes;
  return {
    ...d,
    minutes: o.minutes,
    came: o.students,
    studentMin,
    peak: o.peak ?? o.students,
    stages: {
      ...d.stages,
      master: { ...d.stages.master, studentMin, correction: o.corr, evaluation: o.ev, theory: o.th },
      fighter: { ...d.stages.fighter, studentMin: 0, correction: 0, evaluation: 0, theory: 0 },
    },
    rooms: {
      correction: { ...d.rooms.correction, busyMin: o.corr, people: o.people?.correction ?? 1, levels: 10, levelMin: 25 },
      evaluation: { ...d.rooms.evaluation, busyMin: o.ev, people: o.people?.evaluation ?? 1, qs: 20 },
      theory: { ...d.rooms.theory, busyMin: o.th, people: o.people?.theory ?? 1, lessons: 4 },
    },
    idle: { total: o.idleCorr ?? 0, correction: o.idleCorr ?? 0, evaluation: 0, theory: 0, other: 0 },
  };
}

describe("loadOf: what the team can carry", () => {
  // 20 students for 2 hours = 40 student-hours. Correction worked 96 min: 2.4 min per student-hour.
  const day = fakeDigest({ students: 20, minutes: 120, corr: 96, ev: 60, th: 48 });
  const l = loadOf([day, day, day]);
  test("minutes each student-hour needs, and how many students one person carries at 80% busy", () => {
    expect(l.hours).toBe(120);
    expect(l.need.correction).toBe(2.4);
    expect(l.need.evaluation).toBe(1.5);
    expect(l.need.theory).toBe(1.2);
    expect(l.cap.correction).toBe(20); // 48 ÷ 2.4
    expect(l.cap.evaluation).toBe(32);
    expect(l.cap.theory).toBe(40);
    expect(l.limit).toEqual({ room: "correction", n: 20 });
  });
  test("students a day: at once × class length ÷ stay", () => {
    expect(l.stay).toBe(120);
    expect(l.classMin).toBe(120);
    expect(l.perDay).toBe(20);
  });
  test("busy share, per level, per question, per lesson, confidence", () => {
    expect(l.busy.correction).toBe(0.8);
    expect(l.perLevel).toBe(2.5);
    expect(l.perQuestion).toBe(3);
    expect(l.lesson).toBe(12);
    expect(l.sure).toBe("fair");
    expect(loadOf([day]).sure).toBe("early");
    expect(loadOf([]).sure).toBe("none");
    expect(loadOf([]).limit).toBeNull();
  });
  test("Fighter vs Master: teacher minutes per student-hour by stage", () => {
    expect(l.stage.master.total).toBe(5.1);
    expect(l.stage.fighter.total).toBeNull();
  });
  test("one more corrector: the next limit", () => {
    expect(withOneMore(l, "correction")).toEqual({ n: 32, next: "evaluation" });
  });
});

describe("verdictOf: does this room need another person?", () => {
  test("busy 85% or students idle 6 min an hour for it: red", () => {
    const l = loadOf([fakeDigest({ students: 20, minutes: 120, corr: 110, ev: 30, th: 20 })]);
    expect(verdictOf(l, "correction").tone).toBe("red");
    expect(verdictOf(l, "correction").head).toBe("Needs another person");
    const idle = loadOf([fakeDigest({ students: 20, minutes: 120, corr: 30, ev: 30, th: 20, idleCorr: 6 * 40 })]);
    expect(verdictOf(idle, "correction").tone).toBe("red");
  });
  test("busy 65%: amber; quiet: green with room to spare", () => {
    const l = loadOf([fakeDigest({ students: 20, minutes: 120, corr: 80, ev: 30, th: 20, peak: 20 })]);
    expect(verdictOf(l, "correction").tone).toBe("amber");
    expect(verdictOf(l, "evaluation").tone).toBe("green");
    expect(verdictOf(l, "evaluation").head).toMatch(/room for ~\d+ more at once/);
  });
  test("no work at all: grey", () => {
    const l = loadOf([fakeDigest({ students: 20, minutes: 120, corr: 80, ev: 0, th: 20 })]);
    expect(verdictOf(l, "evaluation").tone).toBe("grey");
  });
});

describe("sumDigests: a day with two classes", () => {
  test("adds minutes and work, keeps the most people and the longest wait", () => {
    const a = fakeDigest({ students: 10, minutes: 60, corr: 30, ev: 10, th: 10 });
    const b = fakeDigest({ students: 5, minutes: 30, corr: 10, ev: 5, th: 5, people: { correction: 2 } });
    const s = sumDigests([a, b])!;
    expect(s.minutes).toBe(90);
    expect(s.studentMin).toBe(750);
    expect(s.rooms.correction.busyMin).toBe(40);
    expect(s.rooms.correction.people).toBe(2);
    expect(s.rooms.correction.waitMax).toBe(8);
    expect(sumDigests([])).toBeNull();
  });
});

describe("moneyOf: his three numbers", () => {
  test("income, fees at risk, payroll, what one more person costs in students", () => {
    const m = moneyOf({ fee: 2500, corrector: 20000, teacher: 35000 }, { students: 80, coming: 72, away: 6, people: { correction: 1, evaluation: 1, theory: 1 } })!;
    expect(m.income).toBe(200000);
    expect(m.coming).toBe(180000);
    expect(m.atRisk).toBe(15000);
    expect(m.payroll).toBe(90000);
    expect(m.margin).toBe(90000);
    expect(m.perStudent).toBe(1250);
    expect(m.breakEven("correction")).toBe(8);
    expect(m.breakEven("theory")).toBe(14);
    expect(moneyOf(null, { students: 1, coming: 1, away: 0, people: { correction: 1, evaluation: 1, theory: 1 } })).toBeNull();
  });
});

// ---------------------------------------------------------------- the server: ceo.overview, ceo.setMoney, progress.report


const modules = import.meta.glob("../convex/**/*.ts");
const START = new Date("2026-10-31T15:00:00+05:30").getTime();
const NILA = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx";

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type TT = Awaited<ReturnType<typeof setup>>;
async function addMaster(t: TT, name: string) {
  const unitId = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
  const id = await t.mutation(api.students.add, { name, grade: 7, term: 1, stage: "master", unitId });
  await t.mutation(api.students.setPresent, { id, present: true });
  return { id, unitId };
}
const full = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ q: from + i, got: 2 }));
const at = (min: number) => vi.setSystemTime(START + min * 60_000);

describe("the server side", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
  });
  afterEach(() => vi.useRealTimers());

  test("a level's time from its first mark to Save; the class's digest is kept when it ends; owner only", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    const by = "correction";
    at(5);
    await t.mutation(api.workbook.levelDone, { studentId: malik.id, unitId: malik.unitId, level: 1, by });
    at(9);
    await t.mutation(api.focus.mark, { studentId: malik.id, unitId: malik.unitId, level: 1, set: [{ q: 1, g: 2 }], by });
    at(11);
    await t.mutation(api.workbook.correct, { studentId: malik.id, unitId: malik.unitId, level: 1, items: full(1, 10), by });
    const marks = await t.run(async (ctx) => (await ctx.db.query("events").collect()).find((e) => e.kind === "level-marks")!);
    expect(marks.took).toBeGreaterThanOrEqual(2 * 60_000 - 500);
    expect(marks.took).toBeLessThan(2 * 60_000 + 500);
    expect(marks.ms).toBeGreaterThanOrEqual(6 * 60_000 - 500);

    // The class going on: read live.
    at(30);
    const live = await t.query(api.ceo.overview, {});
    expect(live.classes).toHaveLength(1);
    expect(live.classes[0].open).toBe(true);
    const d = live.classes[0].digest;
    expect(d.came).toBe(1);
    expect(d.rooms.correction).toMatchObject({ levels: 1, timed: 1, handedIn: 1, got: 20, max: 20, waits: 1 });
    expect(d.rooms.correction.levelMin).toBe(2);
    expect(d.people).toHaveLength(1);
    expect(d.people[0]).toMatchObject({ name: "Owner", room: "correction", levels: 1 });
    expect(live.students.map((s) => s.name)).toEqual(["Malik"]);
    expect(live.books.grades.find((g) => g.grade === 7)!.workbooks).toBeGreaterThan(0);

    // A teacher, even with Reports, can't open it.
    await addPerson(t, { name: "Nila", token: NILA, tabs: ["theory"], can: ["reports"] });
    await expect(asPhone(t, NILA).query(api.ceo.overview, {})).rejects.toThrow(/owner/i);

    // End the class: its digest is kept in the report and used from then on.
    at(60);
    await t.mutation(api.sessions.end, { by });
    const report = await t.run(async (ctx) => (await ctx.db.query("sessions").first())!.report as { digest?: { v: number; minutes: number } });
    expect(report.digest?.v).toBe(1);
    expect(report.digest?.minutes).toBe(60);
    const after = await t.query(api.ceo.overview, {});
    expect(after.classes[0]).toMatchObject({ open: false });
    expect(after.classes[0].digest.studentMin).toBe(60);
  });

  test("money: the owner's three numbers, whole rupees, never for teachers", async () => {
    const t = await setup();
    expect((await t.query(api.ceo.overview, {})).money).toBeNull();
    await expect(t.mutation(api.ceo.setMoney, { fee: 0, corrector: 1, teacher: 1 })).rejects.toThrow(/fee/);
    await expect(t.mutation(api.ceo.setMoney, { fee: 2500.5, corrector: 1, teacher: 1 })).rejects.toThrow(/whole rupees/);
    expect(await t.mutation(api.ceo.setMoney, { fee: 2500, corrector: 20000, teacher: 35000 })).toBe(true);
    expect((await t.query(api.ceo.overview, {})).money).toMatchObject({ fee: 2500, corrector: 20000, teacher: 35000 });
    await addPerson(t, { name: "Nila", token: NILA, tabs: ["correction"], can: ["reports"] });
    await expect(asPhone(t, NILA).mutation(api.ceo.setMoney, { fee: 1, corrector: 1, teacher: 1 })).rejects.toThrow(/owner/i);
  });

  test("one student's sheet: Reports only; visits, books, levels with their dates, teachers' help", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik");
    const by = "correction";
    at(5);
    await t.mutation(api.workbook.correct, {
      studentId: malik.id,
      unitId: malik.unitId,
      level: 1,
      items: full(1, 10).map((x) => (x.q === 3 ? { q: 3, got: 0 } : x)),
      by,
    });
    await addPerson(t, { name: "Fathima", token: NILA, tabs: ["evaluation"] });
    const r = await t.query(api.progress.report, { studentId: malik.id as Id<"students"> });
    expect(r!.student).toMatchObject({ name: "Malik", grade: 7, stage: "master" });
    expect(r!.visits).toHaveLength(1);
    const row = r!.rows.find((x) => x.unitId === malik.unitId)!;
    expect(row.current).toBe(true);
    expect(row.stage).toBe("master");
    expect(row.levels![0]).toMatchObject({ n: 1, got: 18, max: 20 });
    expect(row.waiting).toMatchObject({ levels: 0, evaluation: 1 });
    expect(r!.units.some((u) => u.code === "U08" && u.master)).toBe(true);
    await expect(asPhone(t, NILA).query(api.progress.report, { studentId: malik.id })).rejects.toThrow();
  });
});
