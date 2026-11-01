// The simulation (1 Nov 2026, his voice note): made-up students on the books in the app, the app playing Correction,
// Theory and Evaluation practising, each teacher's numbers on the CEO page. The rules (convex/lib/sim.ts) and the server
// (convex/sim.ts), the steps taken by hand with the clock moved (`manual`: no steps are scheduled in the tests).

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER, type MasterData } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import {
  answerMark,
  fighterStart,
  markLevel,
  masterStart,
  planSim,
  PLANS,
  ROBOT,
  simBoard,
  simMinutes,
  simNames,
  trapsOf,
  type KidPlan,
  type SimBook,
  type SimCall,
  type SimEvent,
} from "../convex/lib/sim";
import { computeStatus } from "../convex/lib/status";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-11-01T10:00:00+05:30").getTime();
const NILA = "nila-eval-token-0123456789abcdefghijklmnopqrstuvwxyz";
const G7: MasterData = KNOWN_WORKBOOKS[0].data;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------- the rules

const BOOKS: SimBook[] = [
  { unitId: "g7u8", stage: "master", grade: 7, term: 1, order: 8, code: "U08", levels: G7.levels },
  { unitId: "g8u1", stage: "master", grade: 8, term: 1, order: 1, code: "U01", levels: G7.levels },
  { unitId: "g8u2", stage: "master", grade: 8, term: 1, order: 2, code: "U02", levels: G7.levels },
  { unitId: "g9u4", stage: "master", grade: 9, term: 1, order: 4, code: "U04", levels: G7.levels.slice(0, 3) },
  { unitId: "g11u13", stage: "fighter", grade: 11, term: 2, order: 13, code: "U13", teach: 6, solo: 40 },
];

describe("the rules (convex/lib/sim.ts)", () => {
  test("the same seed gives the same students; names are first name and initial, never twice", () => {
    const a = planSim(BOOKS, "medium", 15, 42, 30);
    const b = planSim(BOOKS, "medium", 15, 42, 30);
    expect(a).toEqual(b);
    expect(a).toHaveLength(15);
    expect(new Set(a.map((k) => k.name)).size).toBe(15);
    for (const k of a) expect(k.name).toMatch(/^[A-Z][a-z]+ [A-Z]$/);
    expect(planSim(BOOKS, "medium", 15, 43, 30)).not.toEqual(a);
    // Taken names are never given again.
    const more = simNames(7, 30, new Set(a.map((k) => k.name)));
    expect(more.some((n) => a.some((k) => k.name === n))).toBe(false);
  });

  test("Easy: workbooks only, 2 grades; Hard: theory books too, every grade, students come late and go early", () => {
    const easy = planSim(BOOKS, "easy", 10, 1, 30);
    expect(easy.every((k) => k.book.stage === "master")).toBe(true);
    expect(new Set(easy.map((k) => k.book.grade)).size).toBeLessThanOrEqual(2);
    expect(easy.every((k) => k.inMin === 0 && k.outMin === undefined)).toBe(true);
    const hard = planSim(BOOKS, "hard", 20, 1, 60);
    expect(hard.filter((k) => k.book.stage === "fighter")).toHaveLength(8); // 40%
    expect(new Set(hard.map((k) => k.book.grade))).toEqual(new Set([7, 8, 9, 11]));
    // Going round the books: every book has someone before any has two.
    const masters = hard.filter((k) => k.book.stage === "master");
    for (const b of BOOKS.filter((x) => x.stage === "master")) expect(masters.some((k) => k.book === b)).toBe(true);
    for (const k of hard) {
      expect(k.speed).toBeGreaterThanOrEqual(0.75);
      expect(k.speed).toBeLessThanOrEqual(1.3);
      if (k.outMin !== undefined) expect(k.outMin).toBeGreaterThanOrEqual(k.inMin + 8);
      if (k.book.stage === "master") expect(k.book.levels!.some((l) => l.n === k.at)).toBe(true);
    }
    // Only a theory book in the app: everyone on it; nothing usable: nobody.
    expect(planSim([BOOKS[4]], "easy", 4, 1, 30).every((k) => k.book.stage === "fighter")).toBe(true);
    expect(planSim([{ ...BOOKS[0], levels: [G7.levels[0]] }], "easy", 4, 1, 30)).toEqual([]);
  });

  test("a level marked by the app: its marks add up, a ? is 0 and goes to Theory, the hard questions lose the most", () => {
    const traps = trapsOf(G7.levels.flatMap((l) => Array.from({ length: l.to - l.from + 1 }, (_, i) => l.from + i)), 9);
    expect(traps.length).toBeGreaterThanOrEqual(1);
    let lostTrap = 0;
    let lostOther = 0;
    let trapN = 0;
    let otherN = 0;
    let r = 0;
    const rand = () => ((r = (r * 9301 + 49297) % 233280), r / 233280);
    for (let i = 0; i < 300; i++) {
      for (const l of G7.levels) {
        const { rows, got } = markLevel(G7, l, PLANS.hard, 1, rand, traps, START);
        const sum = Object.values(rows).reduce((a, x) => a + (x.got ?? 0), 0);
        expect(got).toBe(sum);
        expect(got).toBeLessThanOrEqual(l.max);
        for (const [q, x] of Object.entries(rows)) {
          expect(x.lost).toBe((x.got ?? 0) < (x.max ?? 0));
          if (x.dk) expect([x.got, x.th, x.tb]).toEqual([0, START, "correction"]);
          if (traps.includes(Number(q))) {
            trapN++;
            if (x.lost) lostTrap++;
          } else {
            otherN++;
            if (x.lost) lostOther++;
          }
        }
      }
    }
    expect(lostTrap / trapN).toBeGreaterThan((lostOther / otherN) * 1.8);
  });

  test("where a workbook student starts: the levels before his done, his level open; waiting = lost marks for Evaluation", () => {
    const k: KidPlan = { name: "A B", book: BOOKS[0], speed: 1, care: 1.5, inMin: 0, at: 5, waiting: true, ready: false };
    let r = 3;
    const rand = () => ((r = (r * 9301 + 49297) % 233280), r / 233280);
    const m = masterStart(G7, k, PLANS.hard, START, rand, []);
    const st = computeMaster(m, G7);
    expect(st.current?.n).toBe(5);
    expect(st.corrected + st.pre).toBe(4);
    const calm = masterStart(G7, { ...k, waiting: false }, PLANS.hard, START, rand, []);
    expect(computeMaster(calm, G7).pending).toEqual([]);
    expect(computeMaster(calm, G7).theory).toEqual([]);
  });

  test("where a theory-book student starts: the sections before his taught; ready = he needs Theory now", () => {
    const f = fighter(PILOT_FIGHTER);
    let r = 5;
    const rand = () => ((r = (r * 9301 + 49297) % 233280), r / 233280);
    const k: KidPlan = { name: "A B", book: BOOKS[4], speed: 1, care: 1, inMin: 0, at: 2, waiting: false, ready: true };
    const st = computeStatus(fighterStart(f, k, PLANS.medium, START, rand, []), f);
    const teachable = f.ladder.filter((s) => s.teach.length > 0);
    expect(st.nextTheory).toBe(teachable[2].id);
    expect([st.dry, st.needs]).toEqual([true, ["theory"]]);
    const busy = computeStatus(fighterStart(f, { ...k, ready: false }, PLANS.medium, START, rand, []), f);
    expect(busy.left).toBeGreaterThan(0);
    // An answer: wrong counts up; a redo (explained) is mostly right.
    expect(answerMark({ s: "wrong", n: 1, t: 0 }, PLANS.hard, 1, false, () => 0, 9)).toEqual({ s: "wrong", n: 2, t: 9 });
    expect(answerMark({ s: "explained", n: 1, t: 0 }, PLANS.hard, 1, false, () => 0.99, 9)).toEqual({ s: "right", n: 1, t: 9 });
  });

  test("the scoreboard: each teacher's calls, Arrived taps (and the ones the app said), explained, taught, lessons", () => {
    const at = START;
    const calls: SimCall[] = [
      { studentId: "a", room: "evaluation", kind: "evaluation", status: "done", group: "g1", createdAt: at, sentAt: at + 20_000, arrivedAt: at + 50_000, endedAt: at + 5 * MIN, teacher: "Nila", ahead: true, walk: true },
      { studentId: "b", room: "evaluation", kind: "evaluation", status: "done", group: "g2", createdAt: at, sentAt: at + 20_000, arrivedAt: at + 200_000, endedAt: at + 8 * MIN, teacher: "Nila", walk: true },
      { studentId: "c", room: "theory", kind: "theory", status: "done", group: "g3", createdAt: at, sentAt: at + 15_000, arrivedAt: at + 45_000, endedAt: at + 12 * MIN, teacher: "Fathima", ahead: true, walk: true },
    ];
    const events: SimEvent[] = [
      { at: at + 50_000, kind: "arrived", who: "Nila", by: "evaluation", studentId: "a", value: "evaluation" },
      { at: at + 200_000, kind: "arrived", who: ROBOT, by: "correction", studentId: "b", value: "evaluation" },
      { at: at + 45_000, kind: "arrived", who: "Fathima", by: "theory", studentId: "c", value: "theory" },
      { at: at + 4 * MIN, kind: "explained", who: "Nila", by: "evaluation", studentId: "a", value: "3" },
      { at: at + 4 * MIN, kind: "to-theory", who: "Nila", by: "evaluation", studentId: "a", value: "Q4, Q9" },
      { at: at + 5 * MIN, kind: "done-evaluation", who: "Nila", by: "evaluation", studentId: "a", value: "explained 1,2,3" },
      { at: at + 8 * MIN, kind: "done-evaluation", who: "Nila", by: "evaluation", studentId: "b", value: "explained -" },
      { at: at + 10 * MIN, kind: "taught", who: "Fathima", by: "theory", studentId: "c", value: "1" },
      { at: at + 12 * MIN, kind: "done-theory", who: "Fathima", by: "theory", studentId: "c", value: "D: taught 23,24" },
      { at: at + 6 * MIN, kind: "level-marks", who: ROBOT, by: "correction", studentId: "d", unit: "G7-U08", value: "3 14/20", took: 40_000 },
      { at: at + 9 * MIN, kind: "idle", studentId: "d", value: "evaluation", ms: 6 * MIN },
    ];
    const visits = ["a", "b", "c", "d"].map((studentId) => ({ studentId, inAt: at, outAt: at + 30 * MIN }));
    const kids = ["a", "b", "c", "d"].map((id) => ({ _id: id, name: id.toUpperCase(), stage: "master", present: true }));
    const b = simBoard({ start: at, end: at + 30 * MIN, events, calls, visits, kids });
    const nila = b.teachers.find((t) => t.name === "Nila")!;
    expect(nila).toMatchObject({ room: "evaluation", calls: 2, ahead: 1, arrived: 1, missed: 1, walkSec: 30, done: 2, students: 2, qs: 3, toTheory: 2 });
    const fathima = b.teachers.find((t) => t.name === "Fathima")!;
    expect(fathima).toMatchObject({ room: "theory", calls: 1, ahead: 1, arrived: 1, missed: 0, done: 1, qs: 3, lessons: 1 });
    expect(b.teachers.map((t) => t.room)).toEqual(["evaluation", "theory"]);
    expect(b.robot).toMatchObject({ levels: 1, reached: 1 });
    expect(b.digest.idle.evaluation).toBe(6);
    expect(b.rate).toBe(3); // 6 idle minutes in 2 student-hours
    expect(simMinutes({ startedAt: at, endsAt: at + 30 * MIN }, at + 12.5 * MIN)).toEqual({ done: 12, total: 30, left: 18 });
  });
});

// ---------------------------------------------------------------- the server

async function setup() {
  const raw = convexTest(schema, modules);
  const t = await asOwner(raw);
  await t.mutation(api.setup.ensure, {});
  return { raw, t };
}
type R = Awaited<ReturnType<typeof setup>>;

async function playOf(r: R) {
  return await r.raw.run(async (ctx) => (await ctx.db.query("simPlay").collect())[0]);
}
/** The steps, by hand: n of them, the clock moved this much before each. */
async function steps(r: R, n: number, stepMs = 20_000) {
  const play = await playOf(r);
  for (let i = 0; i < n; i++) {
    vi.setSystemTime(Date.now() + stepMs);
    await r.raw.mutation(internal.sim.tick, { simId: play.simId, chain: play.chain, manual: true });
  }
}
async function unitIdOf(r: R, key: string): Promise<Id<"units">> {
  return await r.raw.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
}
async function events(r: R) {
  return await r.raw.run(async (ctx) => await ctx.db.query("events").collect());
}

describe("the simulation on the server (convex/sim.ts)", () => {
  test("start: made-up students on the books in the app; only a phone showing the simulation sees them", async () => {
    const r = await setup();
    const { t } = r;
    const real = await t.mutation(api.students.add, { name: "Real R", grade: 7, term: 1, stage: "master", unitId: await unitIdOf(r, "G7-U08") });
    await t.mutation(api.students.setPresent, { id: real, present: true });
    const res = await t.mutation(api.sim.start, { level: "hard", count: 10, minutes: 30, manual: true });
    expect(res).toMatchObject({ students: 10, grades: [7, 11] });

    const cls = await t.query(api.state.get, {});
    expect(cls.students.map((s) => s.name)).toEqual(["Real R"]);
    expect(cls.tests).toBe(10);
    expect(cls.sim).toMatchObject({ status: "running", level: "hard", count: 10, minutes: 30 });
    const sim = await t.query(api.state.get, { test: true });
    expect(sim.students).toHaveLength(10);
    expect(sim.students.every((s) => s.test && s.demo)).toBe(true);
    expect(sim.students.filter((s) => s.stage === "fighter")).toHaveLength(4);
    expect(sim.students.filter((s) => s.present).length).toBeGreaterThan(0);
    // Every made-up student has his book as it starts.
    for (const s of sim.students) expect(sim.progress[s._id]).toBeDefined();

    const st = await t.query(api.sim.status, {});
    expect(st).toMatchObject({ students: 10, real: 1, books: [{ grade: 7, master: 1, fighter: 0 }, { grade: 11, master: 0, fighter: 1 }] });
    await expect(t.mutation(api.sim.start, { level: "easy", count: 5, minutes: 20, manual: true })).rejects.toThrow(/running/);
    await expect(t.mutation(api.sim.start, { level: "easy", count: 0, minutes: 20, manual: true })).rejects.toThrow(/1 to 30/);
    // Deleting its students while it runs: end it first.
    await expect(t.mutation(api.demo.remove, { test: true })).rejects.toThrow(/end it first/);
    // The steps of a manual simulation never start by themselves (nothing is scheduled), and a nudge leaves them.
    expect(await t.mutation(api.sim.nudge, {})).toBe(false);
  });

  test("the steps: students hand levels in, the app corrects them (as Correction, named Simulation), answers are marked", async () => {
    const r = await setup();
    await r.t.mutation(api.sim.start, { level: "hard", count: 10, minutes: 60, manual: true });
    await steps(r, 60); // 20 minutes
    const all = await events(r);
    const robot = all.filter((e) => e.who === ROBOT);
    expect(robot.some((e) => e.kind === "level-done" && e.by === "correction")).toBe(true);
    const marks = robot.filter((e) => e.kind === "level-marks");
    expect(marks.length).toBeGreaterThan(0);
    for (const e of marks) {
      const m = /^(\d+) (\d+)\/(\d+)$/.exec(e.value ?? "")!;
      expect(Number(m[2])).toBeLessThanOrEqual(Number(m[3]));
      expect(e.took).toBeGreaterThanOrEqual(PLANS.hard.correctSec[0] * 1000);
    }
    // Theory-book answers are marked as they come (only from those with questions to do: the others need Theory).
    for (const e of robot.filter((x) => x.kind === "mark")) expect(["right", "wrong", "slip"]).toContain(e.value);
    // Their books stay sound: every corrected level by the app, after it was handed in.
    const st = await r.t.query(api.state.get, { test: true });
    for (const s of st.students.filter((x) => x.stage === "master")) {
      const m = (st.progress[s._id]?.m ?? { q: {}, lv: {} }) as MState;
      for (const lv of Object.values(m.lv)) if (lv.fixed) expect([lv.by, lv.fixed >= (lv.done ?? 0)]).toEqual(["correction", true]);
    }
    // A reading of the class every minute.
    const play = await playOf(r);
    expect(play.samples.length).toBeGreaterThanOrEqual(19);
    expect(play.samples.at(-1)!.n).toBeGreaterThan(0);
  });

  test("a teacher calls: the app sends him, says he reached the room after 3 minutes; her numbers and the practice score", async () => {
    const r = await setup();
    const { raw, t } = r;
    await addPerson(raw, { name: "Nila", token: NILA, tabs: ["evaluation"] });
    const nila = asPhone(raw, NILA);
    await t.mutation(api.sim.start, { level: "hard", count: 12, minutes: 60, manual: true });
    // Someone in class with lost marks or wrong answers waiting (Hard starts most of them with some); else wait for one.
    const pick = async () => {
      const st = await t.query(api.state.get, { test: true });
      for (const s of st.students) {
        if (!s.present || s.room) continue;
        const p = st.progress[s._id];
        const b = st.books[`${s.unitId}:${s.stage}`];
        if (!p || !b) continue;
        const pending = b.data.kind === "master" ? computeMaster((p.m ?? { q: {}, lv: {} }) as MState, b.data).pending : computeStatus(p.marks, fighter(b.data)).pending;
        if (pending.length) return { id: s._id, pending };
      }
      return null;
    };
    let who = await pick();
    for (let i = 0; i < 40 && !who; i++) {
      await steps(r, 3);
      who = await pick();
    }
    expect(who).not.toBeNull();
    const made = await nila.mutation(api.calls.create, { studentIds: [who!.id], room: "evaluation", kind: "evaluation", by: "evaluation" });
    expect(made.created).toHaveLength(1);
    const callId = made.created[0].callId;
    const call = async () => await raw.run(async (ctx) => (await ctx.db.get(callId))!);
    await steps(r, 1, 3_000);
    expect((await call()).status).toBe("requested"); // Correction takes a few seconds (12–25 on Hard)
    await steps(r, 2, 15_000);
    expect(await call()).toMatchObject({ status: "sent", walk: true });
    expect((await raw.run(async (ctx) => await ctx.db.get(who!.id)))!.room).toBe("evaluation");
    // Nobody tapped Arrived: after 3 minutes the app says he reached the room (her missed Arrived).
    await steps(r, 10, 20_000);
    expect((await call()).arrivedAt).toBeDefined();
    const res = await nila.mutation(api.calls.finish, { items: [{ callId, explained: who!.pending }], by: "evaluation" });
    expect(res.done).toBe(1);

    const b = await t.query(api.sim.board, {});
    const line = b.live!.board.teachers.find((x) => x.name === "Nila")!;
    expect(line).toMatchObject({ room: "evaluation", calls: 1, arrived: 0, missed: 1, done: 1, students: 1, qs: who!.pending.length });
    expect(b.live!.feed.some((e) => e.kind === "done-evaluation" && e.who === "Nila")).toBe(true);
    // The practice score on the simulation's phones; the class's score never moves.
    const inSim = await t.query(api.state.get, { test: true });
    expect(inSim.session?.stats?.evaluation).toMatchObject({ calls: 1, done: 1, qs: who!.pending.length });
    expect((await t.query(api.state.get, {})).session?.stats?.evaluation?.calls ?? 0).toBe(0);
  });

  test("+5 students, the level from now on; time up ends it; everyone goes home, the scoreboard is kept", async () => {
    const r = await setup();
    const { t } = r;
    await t.mutation(api.sim.start, { level: "easy", count: 5, minutes: 10, manual: true });
    expect(await t.mutation(api.sim.add, {})).toBe(5);
    expect((await t.query(api.state.get, {})).sim?.count).toBe(10);
    await t.mutation(api.sim.setLevel, { level: "hard" });
    expect((await t.query(api.state.get, {})).sim?.level).toBe("hard");
    await steps(r, 33); // 11 minutes: the time is up on the last step
    const s = await t.query(api.state.get, { test: true });
    expect(s.sim).toMatchObject({ status: "ended" });
    expect(s.students.some((x) => x.present)).toBe(false);
    const all = await events(r);
    expect(all.some((e) => e.kind === "sim-end" && e.value === "time")).toBe(true);
    // A class only the simulation used is closed (a real class later today starts its own clock).
    expect((await t.query(api.state.get, {})).session).toBeNull();
    const b = await t.query(api.sim.board, {});
    expect(b.sim?.status).toBe("ended");
    expect(b.live?.board.minutes).toBeGreaterThanOrEqual(10);
    // The made-up students go; the scoreboard stays; the next simulation lists this one before it.
    expect(await t.mutation(api.demo.remove, { test: true })).toBe(10);
    expect((await t.query(api.sim.board, {})).live?.board).toBeDefined();
    await t.mutation(api.sim.start, { level: "medium", count: 5, minutes: 20, manual: true });
    expect((await t.query(api.sim.past, {})).map((p) => [p.level, p.count])).toEqual([["hard", 10]]);
  });

  test("a corrector practising too: a paper she has open on Correction is hers, the app leaves it", async () => {
    const r = await setup();
    const { raw, t } = r;
    await t.mutation(api.sim.start, { level: "easy", count: 5, minutes: 30, manual: true });
    const kid = await raw.run(async (ctx) => (await ctx.db.query("students").collect()).find((s) => s.test && s.stage === "master" && s.present)!);
    const owner = await raw.run(async (ctx) => (await ctx.db.query("users").collect())[0]);
    // A level of his handed in 5 minutes ago (the app corrects one 30–60 s after, on Easy), and her claim on his book.
    const level = await raw.run(async (ctx) => {
      const p = (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", kid._id)).collect())[0];
      const m = p.m as MState;
      const n = computeMaster(m, G7).current!.n;
      await ctx.db.patch(p._id, { m: { ...m, lv: { ...m.lv, [String(n)]: { done: Date.now() - 5 * MIN } } } });
      await ctx.db.insert("claims", { studentId: kid._id, unitId: kid.unitId!, userId: owner._id, name: "Owner", at: Date.now(), seenAt: Date.now() });
      return n;
    });
    const lvOf = async () =>
      await raw.run(async (ctx) => ((await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", kid._id)).collect())[0].m as MState).lv[String(level)]);
    await steps(r, 1, 5_000);
    expect((await lvOf()).fixed).toBeUndefined();
    // Her phone went quiet for a minute (or she gave it up): the app corrects it.
    await steps(r, 4, 20_000);
    expect((await lvOf()).fixed).toBeDefined();
    expect((await lvOf()).by).toBe("correction");
  });

  test("End now with a real class going on: the class stays open, its numbers never count the simulation", async () => {
    const r = await setup();
    const { t } = r;
    const real = await t.mutation(api.students.add, { name: "Real R", grade: 7, term: 1, stage: "master", unitId: await unitIdOf(r, "G7-U08") });
    await t.mutation(api.students.setPresent, { id: real, present: true });
    await t.mutation(api.sim.start, { level: "medium", count: 6, minutes: 30, manual: true });
    await steps(r, 15);
    expect(await t.mutation(api.sim.end, {})).toBe(true);
    await expect(t.mutation(api.sim.end, {})).rejects.toThrow(/No simulation/);
    const cls = await t.query(api.state.get, {});
    expect(cls.session).not.toBeNull();
    expect(cls.students.map((s) => [s.name, s.present])).toEqual([["Real R", true]]);
    const report = await t.mutation(api.sessions.end, {});
    expect(report.students.map((x: { name: string }) => x.name)).toEqual(["Real R"]);
  });
});
