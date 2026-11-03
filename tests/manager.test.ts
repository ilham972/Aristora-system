// The Manager page's rules (src/managerData.ts, rebuilt 3 Nov 2026): the hold rule, a room per teacher with what the
// page suggests for her, free teachers (held students go, check-ins, the alarm), the hall's colours, the three numbers.

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import type { View } from "../src/derive";
import {
  callFor,
  canTake,
  FREE_AMBER_MS,
  FREE_RED_MS,
  followersOf,
  GROUP_N,
  HOLD_MS,
  levelPaceOf,
  managerPlan,
  needOf,
  NO_TEACHER_MS,
  noTeacherYet,
  type Teacher,
} from "../src/managerData";
import type { Board } from "../src/store";
import { asView } from "./views";

const G7U08 = KNOWN_WORKBOOKS[0].data; // L1 1–10, L2 11–20, L3 21–30, L4 31–37, L5 38–48 …
const U08 = { _id: "u08", code: "U08", grade: 7, en: "Directed numbers", ta: "திசை எண்கள்" };
const U09 = { _id: "u09", code: "U09", grade: 7, en: "Fractions", ta: "பின்னங்கள்" };
const MIN = 60_000;
// 4:30 pm in Sri Lanka (UTC+5:30) on 3 Nov 2026; the class began at 3:30.
const NOW = Date.UTC(2026, 10, 3, 11, 0);
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
  walk?: boolean;
  teacherId?: string;
  teacher?: string;
  section?: string;
  byManager?: boolean;
  visit?: boolean;
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
    quiet?: boolean;
    seen?: number;
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
      };
    }
    m.lv[String(l.n)] = { done: NOW - (lostAgo + 5 + (fixed - l.n) * 30) * MIN, fixed: NOW - lostAgo * MIN, got: 10 };
  }
  for (let i = 0; i < (o.handed ?? 0); i++) m.lv[String(fixed + 1 + i)] = { done: NOW - 2 * MIN };
  const ms = computeMaster(m, G7U08);
  const unit = o.unit ?? U08;
  return asView({
    s: {
      _id: name,
      name,
      unitId: unit._id,
      grade: 7,
      stage: "master",
      lastSeenAt: 0,
      lastInAt: NOW - (o.inAgo ?? 30) * MIN,
      present: true,
      ...(o.seen !== undefined ? { seen: { evaluation: NOW - o.seen * MIN } } : {}),
    },
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
    quiet: !!o.quiet,
    quietMs: o.quiet ? 18 * MIN : 0,
    line: "On Level 1",
    tag: "G7 · U08",
  });
}

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
    line: "",
    tag: "G11 · U13",
  });
}

const board = (calls: Call[] = []) => ({ calls, session: { _id: "s", startedAt: NOW - 60 * MIN, lastActivityAt: NOW, stats: {} } }) as unknown as Board;
const NILA: Teacher = { id: "nila", name: "Nila", jobs: ["evaluation"] };
const MEENA: Teacher = { id: "meena", name: "Meena", jobs: ["theory"] };
const BOTH: Teacher = { id: "both", name: "Shanthi", jobs: ["evaluation", "theory"] };
const plan = (views: View[], calls: Call[] = [], o: { team?: Teacher[]; away?: string[] } = {}) =>
  managerPlan(board(calls), views, NOW, o.team ?? [NILA, MEENA], { lessonMs: LESSON, away: new Set(o.away ?? []) });
const names = (xs: { v: View }[]) => xs.map((x) => x.v.s.name);
/** Someone with this teacher now (her room is busy): his call and his view. */
function withHer(t: Teacher, name: string, mins = 4): { call: Call; v: View } {
  const call: Call = {
    _id: `c-${name}`,
    studentId: name,
    room: "evaluation",
    kind: "evaluation",
    status: "sent",
    createdAt: NOW - mins * MIN,
    sentAt: NOW - mins * MIN,
    walk: true,
    arrivedAt: NOW - mins * MIN,
    teacherId: t.id,
    teacher: t.name,
  };
  return { call, v: wb(name, { fixed: 1, lost: [9], lostAgo: 20, where: "evaluation", calls: [call] }) };
}

describe("The hold rule (both teachers busy: holding saves their minutes)", () => {
  const busyA = withHer(NILA, "Xavier");
  const busyB = withHer(MEENA, "Yusuf");
  const busy = (views: View[]) => plan([...views, busyA.v, busyB.v], [busyA.call, busyB.call]);

  test("Raj lost Q3; Zara hands in Level 1 in ~5 min: Raj keeps working, held, and says why", () => {
    const p = busy([wb("Raj", { fixed: 1, lost: [3, 7], lostAgo: 5 }), wb("Zara", { inAgo: 25 })]);
    expect(p.tasks.filter((t) => t.who.some((w) => w.v.s.name === "Raj"))).toEqual([]);
    expect(p.held.map((h) => [h.v.s.name, h.why, h.sendBy])).toEqual([["Raj", "waits for Zara (hands in L1 ~5m)", NOW + HOLD_MS - 5 * MIN]]);
    expect(p.hall.find((h) => h.v.s.name === "Raj")?.heat).toBe("yellow");
  });

  test("nobody else is coming to his questions (another unit): he goes now", () => {
    const p = busy([wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 }), wb("Kumar", { unit: U09, inAgo: 25 })]);
    expect(p.held).toEqual([]);
    expect(p.tasks.map((t) => [t.kind, names(t.who), t.why])).toEqual([["evaluation", ["Raj"], "Raj: nobody else coming"]]);
  });

  test("3 with the same question: one group now, the question once", () => {
    const p = busy([
      wb("Raj", { fixed: 1, lost: [3, 7], lostAgo: 6 }),
      wb("Zara", { fixed: 1, lost: [3], lostAgo: 4 }),
      wb("Kumar", { fixed: 1, lost: [3, 9], lostAgo: 1 }),
      wb("Sana", { inAgo: 10 }),
    ]);
    const t = p.tasks.find((x) => x.who.some((w) => w.v.s.name === "Raj"))!;
    expect(t.why).toBe(`${GROUP_N} lost Q3`);
    expect(names(t.who).sort()).toEqual(["Kumar", "Raj", "Zara"]);
    expect(p.hall.filter((h) => h.heat === "orange").map((h) => h.v.s.name).sort()).toEqual(["Kumar", "Raj", "Zara"]);
  });

  test("waited 20 minutes: he goes, and whoever shares a question goes with him", () => {
    const p = busy([wb("Raj", { fixed: 1, lost: [3, 7], lostAgo: 21 }), wb("Zara", { fixed: 1, lost: [3], lostAgo: 2 }), wb("Kumar", { inAgo: 25 })]);
    const t = p.tasks.find((x) => x.who.some((w) => w.v.s.name === "Raj"))!;
    expect(t.who.map((w) => [w.v.s.name, w.why])).toEqual([
      ["Raj", "waited 21m"],
      ["Zara", "with Raj: Q3"],
    ]);
  });

  test("who is coming: a level to correct (now), his level at his pace; not one who goes home first, nor one past it", () => {
    const raj = wb("Raj", { fixed: 2, lost: [11], lostAgo: 2 });
    const f = followersOf(raj, 11, [raj, wb("Zara", { inAgo: 117 }), wb("Kumar", { inAgo: 60 }), wb("Vimal", { fixed: 3 }), wb("Ali", { fixed: 1, handed: 1 })], NOW);
    expect(f.map((x) => [x.v.s.name, x.words])).toEqual([
      ["Ali", "L2 to correct"],
      ["Kumar", "hands in L2 ~31m"],
    ]);
    expect(levelPaceOf(wb("New", { inAgo: 10 }), NOW)).toBe(30 * MIN);
  });
});

describe("A room per teacher, and what the page suggests for a free one", () => {
  test("Evaluation work only to a teacher with Evaluation; Theory to the Theory teacher first", () => {
    expect([canTake(MEENA, "evaluation"), canTake(MEENA, "theory"), canTake(NILA, "theory"), canTake(NILA, "visit")]).toEqual([false, true, true, true]);
    expect(callFor(MEENA, "theory")).toEqual({ room: "theory", kind: "theory" });
    expect(callFor(NILA, "theory")).toEqual({ room: "evaluation", kind: "theory" }); // she teaches it in her room
    expect(callFor(NILA, "visit")).toEqual({ room: "evaluation", kind: "evaluation", visit: true });
    expect(callFor(MEENA, "evaluation")).toBeNull();

    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 }); // nobody else coming: due
    const malik = wb("Malik", { fixed: 7, lost: [53], lostAgo: 25, theory: [53], handed: 1 }); // no work, Q53 for Theory
    const p = plan([raj, malik]);
    const room = (id: string) => p.rooms.find((r) => r.t.id === id)!;
    expect(room("nila").suggest?.kind).toBe("evaluation");
    expect(names(room("nila").suggest!.who)).toEqual(["Raj"]);
    expect(room("meena").suggest?.kind).toBe("theory");
    expect(names(room("meena").suggest!.who)).toEqual(["Malik"]);
    // A Theory-only teacher is never offered lost marks: with only her free, Raj waits for Nila.
    const onlyMeena = plan([raj], [], { team: [MEENA] });
    expect(onlyMeena.rooms[0].suggest).toBeNull();
    expect(onlyMeena.tasks[0].to).toBeNull();
  });

  test("her room: called by her phone (dotted), on his way (her Arrived not tapped), with her; late after 3 min", () => {
    const called: Call = { _id: "c1", studentId: "Ali", room: "evaluation", kind: "evaluation", status: "requested", createdAt: NOW - 4 * MIN, teacherId: "nila", teacher: "Nila" };
    const walking: Call = { _id: "c2", studentId: "Bala", room: "evaluation", kind: "evaluation", status: "sent", createdAt: NOW - MIN, sentAt: NOW - MIN, walk: true, teacherId: "nila", teacher: "Nila", byManager: true };
    const ali = wb("Ali", { fixed: 1, lost: [2], calls: [called] });
    const bala = wb("Bala", { fixed: 1, lost: [2], where: "evaluation", calls: [walking] });
    const p = plan([ali, bala], [called, walking]);
    const nila = p.rooms.find((r) => r.t.id === "nila")!;
    expect(nila.pills.map((x) => [x.v.s.name, x.state, x.late])).toEqual([
      ["Ali", "called", true],
      ["Bala", "walking", false],
    ]);
    expect([nila.free, nila.doing, nila.suggest]).toEqual([false, null, null]);
    // Called students sit in the hall, but show in her room only (not twice).
    expect(names(p.hall)).toEqual([]);
  });

  test("a teacher with someone: what she is doing (her colour), how long, about how long is left", () => {
    const busyA = withHer(NILA, "Xavier", 4);
    const p = plan([busyA.v], [busyA.call]);
    const nila = p.rooms.find((r) => r.t.id === "nila")!;
    expect([nila.doing, nila.since, nila.leftMs, nila.over]).toEqual(["evaluation", NOW - 4 * MIN, 0, false]);
    const late = withHer(NILA, "Xavier", 12);
    expect(plan([late.v], [late.call]).rooms.find((r) => r.t.id === "nila")!.over).toBe(true);
  });

  test("a free teacher with nothing due: those held for a group go to her now (her minutes are free)", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3, 7], lostAgo: 5 });
    const zara = wb("Zara", { inAgo: 25 });
    const p = plan([raj, zara], [], { team: [NILA] });
    const s = p.rooms[0].suggest!;
    expect([s.kind, names(s.who), s.why]).toEqual(["evaluation", ["Raj"], "Nila is free: no need to wait"]);
    expect(p.hall.find((h) => h.v.s.name === "Raj")?.heat).toBe("yellow"); // still the yellow of waiting
  });

  test("still free: a check-in for the quiet and those with no teacher yet (an hour here), 3 at most; never one with work waiting", () => {
    const views = [
      wb("Ahamed", { inAgo: 70 }),
      wb("Bilal", { inAgo: 90 }),
      wb("Chathu", { inAgo: 50, quiet: true }),
      wb("Dinesh", { inAgo: 65, seen: 20 }), // Evaluation saw him today
      wb("Eswar", { inAgo: 80 }),
      wb("Faiz", { inAgo: 100 }),
      wb("Raj", { fixed: 1, lost: [3], lostAgo: 2, inAgo: 95 }), // lost marks: he goes for those, not a check-in
    ];
    expect(noTeacherYet(views[0], NOW)).toBe(true);
    expect(noTeacherYet(views[3], NOW)).toBe(false);
    expect(noTeacherYet(wb("New", { inAgo: NO_TEACHER_MS / MIN - 1 }), NOW)).toBe(false);
    const p = plan(views, [], { team: [NILA, { ...NILA, id: "nila2", name: "Rani" }] });
    const sug = p.rooms.map((r) => [r.t.name, r.suggest?.kind, r.suggest ? names(r.suggest.who) : []]);
    expect(sug).toEqual([
      ["Nila", "evaluation", ["Raj"]],
      ["Rani", "visit", ["Chathu", "Faiz", "Bilal"]],
    ]);
    expect(p.hall.filter((h) => h.noTeacher).map((h) => h.v.s.name)).toEqual(["Ahamed", "Bilal", "Eswar", "Faiz", "Raj"]);
    expect(needOf(views[0]).kind).toBe("visit");
  });

  test("free while there is work for her: amber at 2 minutes, red at 5; free with nothing: no alarm", () => {
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 });
    const at = (freeFor: number) =>
      plan([raj], [], { team: [{ ...NILA, lastEnd: NOW - freeFor }] }).rooms[0];
    expect(at(FREE_AMBER_MS - MIN).alarm).toBeNull();
    expect(at(FREE_AMBER_MS).alarm).toBe("amber");
    expect(at(FREE_RED_MS).alarm).toBe("red");
    // Never had anyone today: free since the class began (an hour): red.
    expect(plan([raj], [], { team: [NILA] }).rooms[0].alarm).toBe("red");
    expect(plan([wb("Sana", { inAgo: 20 })], [], { team: [{ ...NILA, lastEnd: NOW - 30 * MIN }] }).rooms[0]).toMatchObject({ suggest: null, alarm: null });
  });

  test("over her time while students sit with no work: red, and what to tell her; over with nobody idle: amber", () => {
    const late = withHer(NILA, "Xavier", 40); // one question, 40 minutes: over
    const malik = wb("Malik", { fixed: 7, lostAgo: 1, handed: 1 }); // no work (every level handed in)
    const p = plan([late.v, malik], [late.call], { team: [NILA] });
    expect(p.starving).toBe(1);
    expect(p.rooms[0]).toMatchObject({ over: true, alarm: "red", note: "1 has no work: finish now" });
    const calm = plan([late.v, wb("Priya", { fixed: 1 })], [late.call], { team: [NILA] });
    expect(calm.rooms[0]).toMatchObject({ over: true, alarm: "amber", note: null });
  });

  test("not here today: no room (Bring back); still a room while someone is with her", () => {
    const p = plan([wb("Raj")], [], { away: ["meena"] });
    expect(p.rooms.map((r) => r.t.name)).toEqual(["Nila"]);
    expect(p.away.map((t) => t.name)).toEqual(["Meena"]);
    const b = withHer(NILA, "Xavier");
    const q = plan([b.v], [b.call], { away: ["nila"] });
    expect(q.rooms.map((r) => [r.t.name, r.away])).toEqual([
      ["Nila", true],
      ["Meena", false],
    ]);
  });
});

describe("Theory", () => {
  test("a theory-book student with no work goes to his lesson first; his wrong answer waits", () => {
    const IN_C = { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14) };
    const fathima = th("Fathima", { ...IN_C, ...right(18, 21), 22: { s: "wrong", n: 1, t: NOW - 8 * MIN } }, { idleMs: 6 * MIN });
    expect(fathima.noWork).toBe(true);
    expect(needOf(fathima).kind).toBe("theory");
    const p = plan([fathima], [], { team: [BOTH] });
    expect(p.rooms[0].suggest).toMatchObject({ kind: "theory", section: "D" });
    expect(p.held.map((h) => [h.v.s.name, h.why])).toEqual([["Fathima", "Theory D first: it gives work"]]);
    expect(callFor(BOTH, "theory")).toEqual({ room: "theory", kind: "theory" });
  });

  test("workbook questions for Theory wait for more (20 min), unless a teacher is free", () => {
    const b1 = withHer(NILA, "Xavier");
    const b2 = withHer(MEENA, "Yusuf");
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 5, theory: [3] });
    const p = plan([raj, b1.v, b2.v], [b1.call, b2.call]);
    expect(p.held.map((h) => [h.v.s.name, h.kind])).toEqual([["Raj", "theory"]]);
    expect(plan([raj], [], { team: [MEENA] }).rooms[0].suggest?.kind).toBe("theory");
  });
});

describe("The hall and the three numbers", () => {
  test("A–Z; red = no work, with his minutes; the numbers: levels to correct, students to explain, to teach", () => {
    const malik = wb("Malik", { fixed: 7, lostAgo: 1, handed: 1 }); // every level handed in: no work
    const zara = wb("Zara", { handed: 1, inAgo: 30 });
    const raj = wb("Raj", { fixed: 1, lost: [3], lostAgo: 2 });
    const p = plan([zara, raj, malik].sort((a, b) => a.s.name.localeCompare(b.s.name)));
    expect(p.hall.map((h) => [h.v.s.name, h.heat])).toEqual([
      ["Malik", "red"],
      ["Raj", "yellow"],
      ["Zara", null],
    ]);
    expect(p.counts.correct).toEqual({ n: 2, red: 1, ids: ["Malik", "Zara"] });
    expect(p.counts.explain).toMatchObject({ n: 1, red: 0, ids: ["Raj"] });
    expect(p.counts.teach.n).toBe(0);
  });

  test("finished his workbook with nothing else given: green, Move him on", () => {
    const p = plan([wb("Ahamed", { fixed: 8, lostAgo: 3 })]);
    expect(p.hall[0].finished).toBe(true);
  });
});
