// The Manager page's rules (src/managerData.ts): the hold rule, the groups, who takes them, Back, repeats.

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import type { View } from "../src/derive";
import {
  backAll,
  followersOf,
  GROUP_N,
  HOLD_MS,
  levelPaceOf,
  managerPlan,
  qsWords,
  repeatsOf,
  type Teacher,
} from "../src/managerData";
import type { Board } from "../src/store";
import { asView } from "./views";

const G7U08 = KNOWN_WORKBOOKS[0].data; // L1 1–10, L2 11–20, L3 21–30, L4 31–37, L5 38–48 …
const U08 = { _id: "u08", code: "U08", grade: 7, en: "Directed numbers", ta: "திசை எண்கள்" };
const U09 = { _id: "u09", code: "U09", grade: 7, en: "Fractions", ta: "பின்னங்கள்" };
const MIN = 60_000;
// 4:30 pm in Sri Lanka (UTC+5:30) on 2 Nov 2026.
const NOW = Date.UTC(2026, 10, 2, 11, 0);
const LESSON = 12 * MIN;

type Call = {
  _id: string;
  studentId: string;
  room: "theory" | "evaluation";
  kind: "theory" | "evaluation";
  status: string;
  createdAt: number;
  sentAt?: number;
  arrivedAt?: number;
  teacherId?: string;
  teacher?: string;
  section?: string;
};

/**
 * A workbook student (G7 U08): levels 1..fixed corrected (the last `lostAgo` minutes ago) with these questions lost,
 * then `handed` levels handed in and not corrected; he came `inAgo` minutes ago.
 */
function wb(
  name: string,
  o: {
    fixed?: number;
    lost?: number[];
    lostAgo?: number;
    handed?: number;
    inAgo?: number;
    where?: View["where"];
    calls?: Call[];
    unit?: typeof U08;
    theory?: number[];
    x?: Record<number, number>;
  } = {},
): View {
  const m: MState = { q: {}, lv: {} };
  const fixed = o.fixed ?? 0;
  const lost = o.lost ?? [];
  const lostAgo = o.lostAgo ?? 5;
  for (const l of G7U08.levels.slice(0, fixed)) {
    for (let q = l.from; q <= l.to; q++) {
      const isLost = lost.includes(q);
      m.q[String(q)] = {
        got: isLost ? 0 : 2,
        max: 2,
        lost: isLost,
        t: NOW - lostAgo * MIN,
        ...(o.theory?.includes(q) ? { th: NOW - lostAgo * MIN } : {}),
        ...(o.x?.[q] !== undefined ? { x: NOW - o.x[q] * MIN } : {}),
      };
    }
    m.lv[String(l.n)] = { done: NOW - (lostAgo + 5 + (fixed - l.n) * 30) * MIN, fixed: NOW - lostAgo * MIN, got: 10 };
  }
  for (let i = 0; i < (o.handed ?? 0); i++) m.lv[String(fixed + 1 + i)] = { done: NOW - 2 * MIN };
  const ms = computeMaster(m, G7U08);
  const unit = o.unit ?? U08;
  return asView({
    s: { _id: name, name, unitId: unit._id, grade: 7, stage: "master", lastSeenAt: 0, lastInAt: NOW - (o.inAgo ?? 30) * MIN, present: true },
    unit,
    stage: "master",
    kind: "master",
    where: o.where ?? "hall",
    f: null,
    st: null,
    marks: {},
    mb: G7U08,
    ms,
    mm: m,
    pending: ms.pending,
    calls: o.calls ?? [],
    pulled: false,
    quiet: false,
    tag: "G7 · U08",
  });
}

const board = (calls: Call[] = []) => ({ calls, session: { _id: "s", startedAt: NOW - 60 * MIN, lastActivityAt: NOW, stats: {} } }) as unknown as Board;
const NILA: Teacher = { id: "nila", name: "Nila", jobs: ["evaluation"] };
const FATHIMA: Teacher = { id: "fathima", name: "Fathima", jobs: ["theory"] };
const TEAM = [NILA, FATHIMA];
const plan = (views: View[], calls: Call[] = [], o: { force?: string[]; away?: string[]; team?: Teacher[] } = {}) =>
  managerPlan(board(calls), views, NOW, o.team ?? TEAM, {
    lessonMs: LESSON,
    force: new Set(o.force ?? []),
    away: new Set(o.away ?? []),
  });
const names = (xs: { v: View }[]) => xs.map((x) => x.v.s.name);

describe("The hold rule: wait for the others only while it's worth it", () => {
  test("Raj lost Q3; Zara is on Level 1 and hands it in in ~5 min: Raj keeps working, held, and the page says why", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3, 7], lostAgo: 5 });
    const zara = wb("Zara", { inAgo: 25 }); // on L1 since she came, a level ≈ 30 min
    const p = plan([raj, zara]);
    expect(p.tasks).toEqual([]);
    expect(names(p.held)).toEqual(["Raj"]);
    expect(p.held[0].why).toBe("Zara hands in L1 ~5m");
    // He goes anyway when his first question has waited 20 minutes.
    expect(p.held[0].sendBy).toBe(NOW + HOLD_MS - 5 * MIN);
  });

  test("nobody else in class is coming to his questions (another unit): no point waiting, he goes now", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 });
    const kumar = wb("Kumar", { unit: U09, inAgo: 25 });
    const p = plan([raj, kumar]);
    expect(p.held).toEqual([]);
    expect(p.tasks).toHaveLength(1);
    expect(names(p.tasks[0].who)).toEqual(["Raj"]);
    expect(p.tasks[0].why).toBe("Raj: nobody else coming");
    expect(p.tasks[0].heat).toBe("yellow");
  });

  test("someone who already passed that question doesn't count: only those still before it", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 });
    const vimal = wb("Vimal", { fixed: 2, lostAgo: 1 }); // L1 corrected already (full marks): he has it or not
    expect(followersOf(raj, 3, [raj, vimal], NOW)).toEqual([]);
    expect(plan([raj, vimal]).tasks[0].why).toBe("Raj: nobody else coming");
  });

  test("3 with the same question: they go now, one group, the question once", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3, 7], lostAgo: 6 });
    const zara = wb("Zara", { fixed: 1, lost: [3], lostAgo: 4 });
    const kumar = wb("Kumar", { fixed: 1, lost: [3, 9], lostAgo: 1 });
    const later = wb("Nila S", { inAgo: 10 }); // on L1: would be a reason to wait, but 3 is enough
    const p = plan([raj, zara, kumar, later]);
    expect(p.tasks).toHaveLength(1);
    const t = p.tasks[0];
    expect(t.why).toBe(`${GROUP_N} lost Q3`);
    expect(names(t.who).sort()).toEqual(["Kumar", "Raj", "Zara"]);
    expect(t.shared).toEqual([{ q: 3, n: 3 }]);
    // Each says his own numbers (the manager reads them out).
    expect(t.who.map((w) => `${w.v.s.name} ${qsWords(t, w).join(" ")}`)).toEqual(["Raj 3 7", "Zara 3", "Kumar 3 9"]);
    expect(t.to?.name).toBe("Nila");
  });

  test("the first waited 20 minutes: he goes, and whoever shares a question goes with him", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3, 7], lostAgo: 21 });
    const zara = wb("Zara", { fixed: 1, lost: [3], lostAgo: 2 });
    const kumar = wb("Kumar", { inAgo: 25 }); // still coming to Q3: Zara alone would wait for him
    const p = plan([raj, zara, kumar]);
    expect(p.tasks).toHaveLength(1);
    expect(p.tasks[0].who.map((w) => [w.v.s.name, w.why])).toEqual([
      ["Raj", "waited 21m"],
      ["Zara", "with Raj: Q3"],
    ]);
    expect(p.held).toEqual([]);
  });

  test("no work left (every level handed in): red, first in the list", () => {
    const zara = wb("Zara", { fixed: 1, lost: [3], lostAgo: 21 });
    const malik = wb("Malik", { fixed: 7, lost: [53], lostAgo: 1, handed: 1 }); // L8 handed in: nothing to do
    const p = plan([zara, malik, wb("Kumar", { inAgo: 25 })]);
    expect(p.tasks[0].heat).toBe("red");
    // One trip per book: Zara (waited 21m) goes with him; each has his own questions.
    expect(p.tasks[0].who.map((w) => [w.v.s.name, w.why, w.qs])).toEqual([
      ["Malik", "no work", [53]],
      ["Zara", "waited 21m", [3]],
    ]);
    expect(p.tasks[0].why).toBe("Malik: no work");
  });

  test("he goes home within 20 minutes: he goes now", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2, inAgo: 110 });
    const p = plan([raj, wb("Zara", { inAgo: 25 })]);
    expect(p.tasks[0].who[0].why).toMatch(/^goes home \d/);
  });

  test("Send now: the manager overrides a hold", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 5 });
    const p = plan([raj, wb("Zara", { inAgo: 25 })], [], { force: [raj.key] });
    expect(names(p.tasks[0].who)).toEqual(["Raj"]);
    expect(p.tasks[0].who[0].why).toBe("you chose now");
  });

  test("a follower going home before he gets there doesn't count", () => {
    const raj = wb("Raj", { fixed: 2, lost: [11], lostAgo: 2 }); // Q11 is in Level 2
    const leaving = wb("Zara", { inAgo: 117 }); // on L1, home in 3 minutes: never reaches L2 today
    const staying = wb("Kumar", { inAgo: 60 }); // on L1, then L2: ~31 min
    expect(followersOf(raj, 11, [raj, leaving, staying], NOW).map((f) => [f.v.s.name, f.words])).toEqual([["Kumar", "hands in L2 ~31m"]]);
  });

  test("a level handed in and not corrected yet: the strongest follower (eta 0)", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 });
    const zara = wb("Zara", { handed: 1, inAgo: 40 });
    const f = followersOf(raj, 3, [raj, zara], NOW);
    expect(f.map((x) => [x.v.s.name, x.eta, x.words])).toEqual([["Zara", 0, "L1 to correct"]]);
  });

  test("his own pace: the middle of the gaps between his hand-ins today, else 30 min", () => {
    expect(levelPaceOf(wb("New", { inAgo: 10 }), NOW)).toBe(30 * MIN);
    expect(levelPaceOf(wb("Fast", { fixed: 3, lostAgo: 1 }), NOW)).toBe(30 * MIN); // the fixture's hand-ins are 30 min apart
  });
});

describe("Who takes the group", () => {
  test("Evaluation work to the Evaluation teacher; a second group to the free Theory teacher (his swap)", () => {
    const a = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 });
    const b = wb("Kumar", { unit: U09, fixed: 1, lost: [4], lostAgo: 2 });
    const p = plan([a, b]);
    expect(p.tasks.map((t) => [t.to?.name, t.swap])).toEqual([
      ["Nila", false],
      ["Fathima", true],
    ]);
    expect(p.people.find((x) => x.t.id === "fathima")!.next?.key).toBe(p.tasks[1].key);
    // A third group (three singles, in name order): after whoever is free first: Nila, once Kumar's one question is
    // explained (~3 min).
    const c = wb("Vimal", { unit: { ...U09, _id: "u10", code: "U10" }, fixed: 1, lost: [5, 6], lostAgo: 2 });
    const three = plan([a, b, c]);
    expect(three.tasks.map((t) => [names(t.who)[0], t.to?.name, t.freeIn])).toEqual([
      ["Kumar", "Nila", 0],
      ["Raj", "Fathima", 0],
      ["Vimal", "Nila", 3 * MIN],
    ]);
  });

  test("a teacher marked not teaching today gets nothing; nobody here at all = can't solve", () => {
    const a = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 });
    const p = plan([a], [], { away: ["nila"] });
    expect(p.tasks[0].to?.name).toBe("Fathima");
    const none = plan([a], [], { team: [] });
    expect(none.tasks[0].to).toBeNull();
    expect(none.noTeachers).toBe(true);
    expect(none.stuck[0].why).toBe("No Theory or Evaluation teacher here today");
  });

  test("busy teacher: her card says who is with her and about how long is left; Back = everything explained", () => {
    const call: Call = {
      _id: "c1",
      studentId: "Raj",
      room: "evaluation",
      kind: "evaluation",
      status: "sent",
      createdAt: NOW - 4 * MIN,
      sentAt: NOW - 4 * MIN,
      arrivedAt: NOW - 4 * MIN,
      teacherId: "nila",
      teacher: "Nila",
    };
    const raj = wb("Raj", { fixed: 1, lost: [3, 7], lostAgo: 10, where: "evaluation", calls: [call] });
    const zara = wb("Zara", { fixed: 1, lost: [4], lostAgo: 2 });
    const p = plan([raj, zara], [call]);
    const nila = p.people.find((x) => x.t.id === "nila")!;
    expect(names(nila.evalHere)).toEqual(["Raj"]);
    expect(nila.leftMs).toBe(2 * 3 * MIN - 4 * MIN); // 2 questions × 3 min, 4 min gone
    expect(backAll(nila)).toEqual([{ callId: "c1", explained: [3, 7] }]);
    // Raj is with her: never in a new group. Zara (nobody coming) goes to the free teacher.
    expect(p.tasks.map((t) => [names(t.who), t.to?.name])).toEqual([[["Zara"], "Fathima"]]);
  });

  test("a teacher marked away who still has students keeps her card until Back", () => {
    const call: Call = { _id: "c1", studentId: "Raj", room: "evaluation", kind: "evaluation", status: "sent", createdAt: NOW - 4 * MIN, sentAt: NOW - 4 * MIN, arrivedAt: NOW - 4 * MIN, teacherId: "nila", teacher: "Nila" };
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 10, where: "evaluation", calls: [call] });
    const p = plan([raj], [call], { away: ["nila"] });
    expect(p.people.map((x) => [x.t.name, x.away])).toEqual([
      ["Nila", true],
      ["Fathima", false],
    ]);
  });
});

describe("Theory", () => {
  test("questions sent to Theory wait for more (20 min) unless he has no work; then a lesson for the Theory teacher", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 5, theory: [3] });
    const p = plan([raj]);
    expect(p.tasks).toEqual([]);
    expect(p.held.map((h) => [h.v.s.name, h.job])).toEqual([["Raj", "theory"]]);
    const late = plan([wb("Raj", { fixed: 1, lost: [3], lostAgo: 25, theory: [3] })]);
    expect(late.tasks.map((t) => [t.job, t.to?.name, names(t.who)])).toEqual([["theory", "Fathima", ["Raj"]]]);
  });
});

const PILOT = fighter(PILOT_FIGHTER);
const U13 = { _id: "u13", code: "U13", grade: 11, en: "Equations", ta: "சமன்பாடுகள்" };
const taught = (...ids: string[]): Marks =>
  Object.fromEntries(ids.flatMap((id) => PILOT.sectionById(id)!.teach.map((q) => [String(q), { s: "taught" as const, t: NOW - 90 * MIN }])));
const right = (from: number, to: number): Marks =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), { s: "right" as const, t: NOW - 30 * MIN }]));
/** A theory-book student (the G11 pilot book). */
function th(name: string, marks: Marks, o: { idleMs?: number } = {}): View {
  const st = computeStatus(marks, PILOT);
  return asView({
    s: { _id: name, name, unitId: U13._id, grade: 11, stage: "fighter", lastSeenAt: 0, lastActivityAt: NOW - MIN, lastInAt: NOW - 30 * MIN, present: true },
    unit: U13,
    stage: "fighter",
    kind: "fighter",
    where: "hall",
    f: PILOT,
    st,
    marks,
    mb: null,
    ms: null,
    mm: { q: {}, lv: {} },
    pending: st.pending,
    calls: [],
    idleMs: o.idleMs,
    pulled: false,
    quiet: false,
    tag: "G11 · U13",
  });
}

describe("Theory first for a theory-book student with no work", () => {
  test("out of work, needs section D, and a wrong answer: the lesson gives him work, the wrong answer waits", () => {
    const IN_C = { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14) };
    const fathima = th("Fathima", { ...IN_C, ...right(18, 21), 22: { s: "wrong", n: 1, t: NOW - 8 * MIN } }, { idleMs: 6 * MIN });
    expect(fathima.noWork).toBe(true);
    const p = plan([fathima]);
    expect(p.tasks.map((t) => [t.job, t.section, names(t.who)])).toEqual([["theory", "D", ["Fathima"]]]);
    expect(p.held.map((h) => [h.v.s.name, h.why])).toEqual([["Fathima", "Theory D first: it gives work"]]);
  });
});

describe("Correction, can't solve, repeats", () => {
  test("levels waiting for correction: the oldest, and who has no work until then (red)", () => {
    const malik = wb("Malik", { fixed: 7, lostAgo: 1, handed: 1 });
    const p = plan([malik, wb("Zara", { handed: 1, inAgo: 30 })]);
    expect(p.correction.levels).toBe(2);
    expect(names(p.correction.red)).toEqual(["Malik"]);
  });

  test("finished his workbook with nothing else given: the manager moves him on", () => {
    const done = wb("Ahamed", { fixed: 8, lostAgo: 3 });
    const p = plan([done]);
    expect(p.stuck.map((s) => [s.v.s.name, s.move])).toEqual([["Ahamed", true]]);
  });

  test("the same question explained at separate times today = a repeat (what holding saves)", () => {
    const a = wb("Raj", { fixed: 1, lost: [3], lostAgo: 60, x: { 3: 50 } });
    const b = wb("Zara", { fixed: 1, lost: [3], lostAgo: 30, x: { 3: 20 } });
    const c = wb("Kumar", { fixed: 1, lost: [3], lostAgo: 30, x: { 3: 19 } }); // explained with Zara: same time
    expect(repeatsOf([a, b, c], NOW)).toEqual([{ key: "u08:master:3", label: "7 U08 Q3", times: 2 }]);
  });
});
