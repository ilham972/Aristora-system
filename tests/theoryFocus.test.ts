// The Theory page's rules (src/theoryFocusData.ts), from plain views as the phones build them.

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import type { View } from "../src/derive";
import type { Board } from "../src/store";
import {
  defaultTicks,
  holdOrder,
  joiners,
  lessonPills,
  lessonPillSig,
  needsOf,
  nextOrder,
  tAllDecided,
  tDecisionWords,
  theoryFinish,
  theoryGradeRow,
  theoryRows,
  theorySquares,
  theoryStageRow,
  theoryUnitRow,
  tUndecided,
  pillTone,
  roomItems,
  roomWords,
  LESSON_CAP,
  LESSON_MS,
  lessonLength,
  memberWords,
  paceOf,
  planLessons,
  redCount,
  roomLeft,
  roomLessons,
  startIn,
  teachLeft,
  toPlan,
  whyWords,
  workbookDone,
} from "../src/theoryFocusData";
import { asView } from "./views";

const PILOT = fighter(PILOT_FIGHTER);
const G7U08 = KNOWN_WORKBOOKS[0].data;
const U13 = { _id: "u13", code: "U13", grade: 11, en: "Equations", ta: "சமன்பாடுகள்" };
const U08 = { _id: "u08", code: "U08", grade: 7, en: "Directed numbers", ta: "திசை எண்கள்" };
const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 29, 10, 0); // 3:30 PM in Sri Lanka
const FREE = { lessonMs: LESSON_MS, startInMs: 0 }; // Theory is free now, lessons of 12 min

const taught = (...sections: string[]): Marks =>
  Object.fromEntries(
    sections.flatMap((id) => PILOT.sectionById(id)!.teach.map((q) => [String(q), { s: "taught" as const, t: 1 }])),
  );
const right = (from: number, to: number): Marks =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), { s: "right" as const, t: 1 }]));
/** Answers to these questions, one every `step` ms from `start`. */
const timed = (qs: number[], start: number, step: number): Marks =>
  Object.fromEntries(qs.map((q, i) => [String(q), { s: "right" as const, t: start + i * step }]));
const solo = (id: string) => PILOT.sectionById(id)!.solo;
/** A, B, C taught and done; D needs teaching (he has no work). */
const READY_D = { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14), ...right(18, 22) };
/** A, B taught and done; C needs teaching (he has no work). */
const READY_C = { ...taught("A", "B"), ...right(5, 8), ...right(12, 14) };

type Call = {
  _id: string;
  studentId: string;
  room: "theory" | "evaluation";
  kind: "theory" | "evaluation";
  status: string;
  section?: string;
  unitId?: string;
  createdAt: number;
  sentAt?: number;
  pull?: boolean;
  walk?: boolean;
  arrivedAt?: number;
};

/** A theory-book student (the G11 pilot book). */
function th(
  name: string,
  marks: Marks,
  o: { where?: View["where"]; idleMs?: number; calls?: Call[]; calledTo?: "theory" | "evaluation"; lastInAt?: number; lastActivityAt?: number } = {},
): View {
  return asView({
    s: { _id: name, name, unitId: U13._id, grade: 11, stage: "fighter", lastSeenAt: 0, lastInAt: o.lastInAt, lastActivityAt: o.lastActivityAt },
    unit: U13,
    stage: "fighter",
    kind: "fighter",
    where: o.where ?? "hall",
    calledTo: o.calledTo,
    f: PILOT,
    st: computeStatus(marks, PILOT),
    marks,
    mb: null,
    ms: null,
    mm: { q: {}, lv: {} },
    calls: o.calls ?? [],
    idleMs: o.idleMs,
  });
}
/** A workbook student with these questions sent to Theory `sentAgo` ago (their levels corrected). */
function wb(name: string, qs: number[], o: { whole?: boolean; where?: View["where"]; calls?: Call[]; sentAgo?: number } = {}): View {
  const at = NOW - (o.sentAgo ?? 0);
  const q: MState["q"] = {};
  for (const n of qs) q[String(n)] = { got: 0, max: 2, lost: true, t: at, th: at };
  const lv: MState["lv"] = {};
  for (const l of G7U08.levels) if (qs.some((n) => n >= l.from && n <= l.to)) lv[String(l.n)] = { done: 1, fixed: 1, got: l.max - 2 };
  const m: MState = { q, lv, ...(o.whole ? { reteach: { at } } : {}) };
  return asView({
    s: { _id: name, name, unitId: U08._id, grade: 7, stage: "master", lastSeenAt: 0 },
    unit: U08,
    stage: "master",
    kind: "master",
    where: o.where ?? "hall",
    f: null,
    st: null,
    mb: G7U08,
    ms: computeMaster(m, G7U08),
    mm: m,
    calls: o.calls ?? [],
  });
}
const board = (calls: Call[]) => ({ calls }) as unknown as Board;
const names = (l: { members: { v: View }[] }) => l.members.map((m) => m.v.s.name);

describe("Minutes, not questions: his pace from his marks", () => {
  test("the time between his answers; marks given together share it; a lesson or a break starts again", () => {
    const d = solo("D");
    // One answer every 4 minutes.
    expect(paceOf(th("A", { ...READY_D, ...taught("D"), ...timed(d.slice(0, 4), NOW - 16 * MIN, 4 * MIN) }))).toBe(4 * MIN);
    // Correction marked 5 answers at once, 20 minutes after the one before: 4 minutes each, not 0.
    const batch = { ...timed([d[0]], NOW - 21 * MIN, 0), ...timed(d.slice(1, 6), NOW - MIN - 20_000, 5_000) };
    expect(paceOf(th("B", { ...READY_D, ...taught("D"), ...batch }))).toBe(4 * MIN);
    // A lesson in between (D taught) is not one slow question; neither is a night (yesterday's answers).
    const c = solo("C");
    const split = {
      ...taught("A", "B", "C"),
      ...right(5, 8),
      ...right(12, 14),
      ...timed(c, NOW - 60 * MIN, 3 * MIN), // C: one every 3 min
      ...Object.fromEntries(PILOT.sectionById("D")!.teach.map((q) => [String(q), { s: "taught" as const, t: NOW - 40 * MIN }])),
      ...timed(d.slice(0, 2), NOW - 25 * MIN, 3 * MIN),
    };
    expect(paceOf(th("C", split))).toBe(3 * MIN);
    // Fewer than 3 answers to go on: not known (the class's pace is used).
    expect(paceOf(th("D", { ...READY_D, ...taught("D"), ...timed(d.slice(0, 2), NOW - 8 * MIN, 4 * MIN) }))).toBeNull();
  });

  test("out of work before Theory is free again counts; working for longer doesn't", () => {
    const d = solo("D");
    const e = PILOT.sectionById("E")!;
    // Both have 2 questions of D left. Fast: 1 min a question; slow: 10 min a question.
    const base = { ...READY_D, ...taught("D"), ...right(d[0], d[d.length - 3]) };
    const fast = th("Fast", { ...base, ...timed(d.slice(0, d.length - 2), NOW - (d.length - 3) * MIN, MIN) }, { lastActivityAt: NOW });
    const slow = th("Slow", { ...base, ...timed(d.slice(0, d.length - 2), NOW - (d.length - 3) * 10 * MIN, 10 * MIN) }, { lastActivityAt: NOW });
    expect(fast.st!.left).toBe(2);
    expect(slow.st!.left).toBe(2);
    const [l] = planLessons([fast, slow], NOW, FREE);
    expect(l.section).toBe(e);
    const byName = Object.fromEntries(l.members.map((m) => [m.v.s.name, m]));
    expect(byName.Fast.outIn).toBe(2 * MIN);
    expect(byName.Fast.urgent).toBe(true);
    expect(memberWords(byName.Fast)).toBe("2 left · out ~2m");
    expect(byName.Slow.outIn).toBe(20 * MIN);
    expect(byName.Slow.urgent).toBe(false);
    expect(memberWords(byName.Slow)).toBe("2 left · out ~20m");
    expect(l.frees).toBe(1);
    // Theory is busy for another 10 minutes: then the slow one runs out before the next lesson ends too.
    expect(planLessons([fast, slow], NOW, { lessonMs: LESSON_MS, startInMs: 10 * MIN })[0].frees).toBe(2);
  });
});

describe("Next: the lesson that gives work to the most comes first", () => {
  test("group size counts: three out of work 1–2 min beat one out of work 4 min", () => {
    const rizwan = th("Rizwan", READY_C, { idleMs: 4 * MIN });
    const fathima = th("Fathima", READY_D, { idleMs: 2 * MIN });
    const ahamed = th("Ahamed", READY_D, { idleMs: MIN });
    const nila = th("Nila", READY_D, { idleMs: MIN });
    const plan = planLessons([rizwan, fathima, ahamed, nila], NOW, FREE);
    expect(plan.map((l) => [l.key, l.frees, names(l)])).toEqual([
      ["u13:D", 3, ["Fathima", "Ahamed", "Nila"]],
      ["u13:C", 1, ["Rizwan"]],
    ]);
    expect(whyWords(plan[0])).toBe("3 need it now · Fathima: no work 2m");
    expect(whyWords(plan[1])).toBe("1 needs it now · Rizwan: no work 4m");
    expect(plan[0].members.map(memberWords)).toEqual(["no work 2m", "no work 1m", "no work 1m"]);
    expect(redCount(plan)).toBe(4);
  });

  test("nobody starves: out of work 20 minutes puts his lesson first", () => {
    const rizwan = th("Rizwan", READY_C, { idleMs: 21 * MIN });
    const others = ["Fathima", "Ahamed", "Nila"].map((n) => th(n, READY_D, { idleMs: MIN }));
    const plan = planLessons([rizwan, ...others], NOW, FREE);
    expect(plan.map((l) => [l.key, l.starving])).toEqual([
      ["u13:C", true],
      ["u13:D", false],
    ]);
  });

  test("a workbook question waiting 20 minutes counts like a student out of work", () => {
    const malik = wb("Malik", [13, 17], { sentAgo: 25 * MIN });
    const priya = wb("Priya", [13], { sentAgo: 5 * MIN });
    const vimal = wb("Vimal", [], { whole: true, sentAgo: 2 * MIN });
    const [l] = planLessons([malik, priya, vimal], NOW, FREE);
    expect([l.key, l.kind, l.section]).toEqual(["u08:R", "workbook", null]);
    expect(names(l)).toEqual(["Malik", "Priya", "Vimal"]); // the longest waiting first
    expect(l.members.map((m) => [m.urgent, memberWords(m), m.qs, m.whole])).toEqual([
      [true, "waited 25m", [13, 17], false],
      [false, "waited 5m", [13], false],
      [false, "waited 2m", [], true],
    ]);
    expect(l.frees).toBe(1);
    expect(l.shared).toEqual([{ q: 13, n: 2 }]);
    expect(whyWords(l)).toBe("1 needs it now · Malik: waited 25m");
    // Starving only at 40: 20 past the 20 that made it count.
    expect(planLessons([wb("Malik", [13], { sentAgo: 41 * MIN })], NOW, FREE)[0].starving).toBe(true);
  });

  test("nobody needs it now: teach ahead, the first one to run out first", () => {
    const d = solo("D");
    const working = th("Dilan", { ...READY_D, ...taught("D"), ...right(d[0], d[0]) });
    const [l] = planLessons([working], NOW, FREE);
    expect(l.frees).toBe(0);
    expect(whyWords(l)).toBe(`Teach ahead · first out in ${(d.length - 1) * 4}m`);
    expect(defaultTicks(l)).toEqual(["Dilan"]); // he comes too: bigger groups, fewer lessons
  });
});

describe("Who is ticked for a lesson", () => {
  test("everyone who can come, out of work first, 6 at most", () => {
    const eight = ["A1", "B2", "C3", "D4", "E5", "F6", "G7", "H8"].map((n, i) => th(n, READY_D, { idleMs: (8 - i) * MIN }));
    const [l] = planLessons(eight, NOW, FREE);
    expect(l.members).toHaveLength(8);
    expect(l.frees).toBe(LESSON_CAP);
    expect(defaultTicks(l)).toEqual(["A1", "B2", "C3", "D4", "E5", "F6"]);
  });

  test("in Evaluation, called by Evaluation, or going home before he could practise: listed, not ticked", () => {
    const kumar = th("Kumar", READY_D, { where: "evaluation", idleMs: 5 * MIN });
    const sana = th("Sana", READY_D, { calledTo: "evaluation", idleMs: 5 * MIN });
    const raj = th("Raj", READY_D, { lastInAt: NOW - 115 * MIN, idleMs: 5 * MIN }); // goes home in 5 minutes
    const hana = th("Hana", READY_D, { lastInAt: NOW - 30 * MIN, idleMs: 2 * MIN }); // here for another 90
    const [l] = planLessons([kumar, sana, raj, hana], NOW, FREE);
    expect(names(l)).toEqual(["Hana", "Kumar", "Raj", "Sana"]);
    expect(l.members.map((m) => [m.v.s.name, m.hold ?? null])).toEqual([
      ["Hana", null],
      ["Kumar", "evaluation"],
      ["Raj", "home"],
      ["Sana", "evalCalled"],
    ]);
    expect(l.members.map(memberWords)).toEqual(["no work 2m", "in Eval", "home 3:35 PM", "Eval called"]);
    expect(defaultTicks(l)).toEqual(["Hana"]);
    expect(l.frees).toBe(1);
    expect(redCount([l])).toBe(3); // Kumar is in Evaluation: not counted; Sana and Raj have no work
  });

  test("a lesson stopped part way: he needs only what is left of the section", () => {
    const part = th("Fathima", { ...READY_D, "23": { s: "taught", t: 2 }, "24": { s: "skip", t: 2 } });
    const all = th("Dilan", READY_D);
    expect(teachLeft(part, PILOT.sectionById("D")!)).toEqual([25, 26]);
    const [d] = planLessons([part, all], NOW, FREE);
    expect(d.members.map((m) => [m.v.s.name, m.teach])).toEqual([
      ["Dilan", [23, 24, 25, 26]],
      ["Fathima", [25, 26]],
    ]);
    expect(d.teach).toEqual([23, 24, 25, 26]);
  });

  test("students already called for theory, or gone home, are not offered again", () => {
    const called = th("Rizwan", READY_C, {
      calls: [{ _id: "c1", studentId: "Rizwan", room: "theory", kind: "theory", status: "requested", section: "C", createdAt: 1 }],
    });
    const home = th("Sana", taught("A", "B"), { where: "absent" });
    expect(planLessons([called, home], NOW, FREE)).toEqual([]);
  });
});

describe("The lessons going on", () => {
  const call = (id: string, who: string, status: string, o: Partial<Call> = {}): Call => ({
    _id: id,
    studentId: who,
    room: "theory",
    kind: "theory",
    status,
    section: "D",
    unitId: "u13",
    createdAt: NOW - 10 * MIN,
    sentAt: status === "sent" ? NOW - 8 * MIN : undefined,
    ...o,
  });

  test("one block per lesson: who is here, who is on the way; lessons going on first", () => {
    const calls = [
      call("c1", "Fathima", "sent"),
      call("c2", "Ahamed", "sent", { sentAt: NOW - 25 * MIN }),
      call("c3", "Malik", "sent", { section: "R", unitId: "u08" }),
      call("c4", "Nila", "requested"),
      call("c5", "Kumar", "requested", { pull: true }),
      call("c7", "Priya", "requested", { section: "C", createdAt: NOW - MIN }),
      { ...call("c6", "Zara", "sent"), room: "evaluation", kind: "evaluation" } as Call,
    ];
    const views = [
      th("Fathima", READY_D, { where: "theory", calls: [calls[0]] }),
      th("Ahamed", READY_D, { where: "theory", calls: [calls[1]] }),
      wb("Malik", [13, 17], { where: "theory", calls: [calls[2]] }),
      th("Nila", READY_D, { calls: [calls[3]] }),
      th("Kumar", READY_D, { where: "evaluation", calls: [calls[4]] }),
      th("Priya", READY_C, { calls: [calls[5]] }),
    ];
    const room = roomLessons(board(calls), views, NOW);
    expect(
      room.map((l) => [l.key, l.kind, l.section?.id ?? null, l.here.map((s) => s.v.s.name), l.coming.map((rc) => rc.v?.s.name), l.long]),
    ).toEqual([
      ["u13:D", "section", "D", ["Ahamed", "Fathima"], ["Nila", "Kumar"], true], // Ahamed here 25 min: "Still with you?"
      ["u08:R", "workbook", null, ["Malik"], [], false],
      ["u13:C", "section", "C", [], ["Priya"], false], // nobody here yet: starting
    ]);
    expect(room[0].since).toBe(NOW - 25 * MIN);
    expect(room[1].here[0].qs).toEqual([13, 17]);
    expect(roomLeft(room[0])).toBe(LESSON_CAP - 4);
    // Theory is free again when the lesson going on ends (2 minutes at least); only on the way: a whole lesson.
    expect(startIn(room, LESSON_MS, NOW)).toBe(2 * MIN);
    expect(startIn([{ ...room[0], since: NOW - 4 * MIN }], LESSON_MS, NOW)).toBe(8 * MIN);
    expect(startIn([room[2]], LESSON_MS, NOW)).toBe(LESSON_MS);
    expect(startIn([], LESSON_MS, NOW)).toBe(0);
  });

  test("who needs the same lesson now can join while there's room; a full lesson goes back to Next", () => {
    const calls = [call("c1", "Fathima", "sent"), call("c2", "Ahamed", "sent")];
    const views = [
      th("Fathima", READY_D, { where: "theory", calls: [calls[0]] }),
      th("Ahamed", READY_D, { where: "theory", calls: [calls[1]] }),
      th("Hana", READY_D, { idleMs: 2 * MIN }), // out of work: can join
      th("Dilan", { ...READY_D, ...taught("D") }), // working on D, needs E: another lesson
      th("Sana", READY_D, { where: "evaluation" }), // in Evaluation: not offered
    ];
    const room = roomLessons(board(calls), views, NOW);
    const plan = planLessons(views, NOW, { lessonMs: LESSON_MS, startInMs: startIn(room, LESSON_MS, NOW) });
    expect(joiners(room[0], plan).map((m) => m.v.s.name)).toEqual(["Hana"]);
    // D is going on with room: its students join it instead of a new card in Next.
    expect(toPlan(plan, room).map((l) => l.key)).toEqual(["u13:E"]);
    // Full (6): nobody joins, and D shows in Next again for the next lesson.
    const full = { ...room[0], coming: Array.from({ length: 4 }, () => room[0].here[0].rc) };
    expect(joiners(full, plan)).toEqual([]);
    expect(toPlan(plan, [full]).map((l) => l.key)).toEqual(["u13:D", "u13:E"]);
  });

  test("how long lessons take: the middle of the recent ones, 12 min until there are 3", () => {
    expect(lessonLength(undefined)).toBe(LESSON_MS);
    expect(lessonLength([10 * MIN, 11 * MIN])).toBe(LESSON_MS);
    expect(lessonLength([10 * MIN, 11 * MIN, 9 * MIN, 50 * MIN, MIN])).toBe(10 * MIN); // 50 and 1 are left out
    expect(lessonLength([8 * MIN, 10 * MIN, 9 * MIN, 11 * MIN])).toBe(9.5 * MIN);
  });

  test("Done for a workbook student: all ticked or the whole unit = all taught; otherwise only the ticked ones", () => {
    expect(workbookDone([13, 17], false, new Set([13, 17]), false)).toEqual({ all: true });
    expect(workbookDone([13, 17], false, new Set([13]), false)).toEqual({ all: false, taught: [13] });
    expect(workbookDone([13, 17], false, new Set(), false)).toEqual({ all: false, taught: [] });
    expect(workbookDone([13], true, new Set(), true)).toEqual({ all: true }); // the whole unit covers his questions
    expect(workbookDone([13], true, new Set([13]), false)).toEqual({ all: false, taught: [13] }); // the unit stays asked
    expect(workbookDone([], false, new Set(), false)).toEqual({ all: true });
  });
});

describe("The rebuilt page (30 Oct 2026): pills that hold still, and her room with Arrived", () => {
  const call = (id: string, who: string, status: string, o: Partial<Call> = {}): Call => ({
    _id: id,
    studentId: who,
    room: "theory",
    kind: "theory",
    status,
    section: "D",
    unitId: "u13",
    createdAt: NOW - 10 * MIN,
    sentAt: status === "sent" ? NOW - 8 * MIN : undefined,
    ...o,
  });

  test("the pills: the page's ranking, held still until something real changes; new ones wait while she touches them", () => {
    const views = [th("Fathima", READY_D, { idleMs: 6 * MIN }), th("Priya", READY_C), wb("Malik", [13, 17], { sentAgo: 5 * MIN })];
    const plan = planLessons(views, NOW, FREE);
    const first = nextOrder(null, plan, false);
    expect(first.keys).toEqual(plan.map((l) => l.key));
    expect(pillTone(plan.find((l) => l.key === "u13:D")!)).toBe("red"); // Fathima has no work
    // A minute later the ranking would swap two lessons, but nothing she can see changed: the pills stay.
    const swapped = [...plan].reverse();
    expect(nextOrder(first, swapped, false).keys).toEqual(first.keys);
    // A new lesson while she touches the row: it goes at the end, the others keep their places...
    // (Sana: A–D taught and done, no work until E is taught, for 30 minutes.)
    const READY_E = { ...READY_D, ...taught("D"), ...Object.fromEntries(solo("D").map((q) => [String(q), { s: "right" as const, t: 1 }])) };
    const more = planLessons([...views, th("Sana", READY_E, { idleMs: 30 * MIN })], NOW, FREE);
    const held = nextOrder(first, more, true);
    expect(held.keys.slice(0, first.keys.length)).toEqual(first.keys);
    expect(held.keys).toHaveLength(more.length);
    // ...and once she lets go the ranking catches up (Sana has waited 30 minutes: her lesson first).
    const after = nextOrder(held, more, false);
    expect(after.keys).toEqual(more.map((l) => l.key));
    expect(after.keys[0]).toBe("u13:E");
  });

  test("sent to Theory he is on the way until Arrived: not with her yet; late after 3 minutes; the lesson's clock starts at Arrived", () => {
    const calls = [
      call("c1", "Fathima", "sent", { walk: true, arrivedAt: NOW - 5 * MIN }),
      call("c2", "Ahamed", "sent", { walk: true, sentAt: NOW - MIN }),
      call("c3", "Dilan", "sent", { walk: true, sentAt: NOW - 4 * MIN }),
      call("c4", "Nila", "requested", { createdAt: NOW - 4 * MIN }),
      call("c5", "Kumar", "requested", { pull: true }),
    ];
    const views = [
      th("Fathima", READY_D, { where: "theory", calls: [calls[0]] }),
      th("Ahamed", READY_D, { where: "theory", calls: [calls[1]] }),
      th("Dilan", READY_D, { where: "theory", calls: [calls[2]] }),
      th("Nila", READY_D, { calls: [calls[3]] }),
      th("Kumar", READY_D, { where: "evaluation", calls: [calls[4]] }),
    ];
    const room = roomLessons(board(calls), views, NOW);
    expect(room).toHaveLength(1);
    expect(room[0].here.map((s) => s.v.s.name)).toEqual(["Fathima"]);
    expect(room[0].coming.map((rc) => rc.v?.s.name)).toEqual(["Ahamed", "Dilan", "Kumar", "Nila"]);
    expect(room[0].since).toBe(NOW - 5 * MIN); // from Arrived, not from Sent
    const items = roomItems(room, NOW);
    // In the order she called them (all at once here: A–Z), whatever happened since.
    expect(items.map((it) => [it.name, it.state, it.late])).toEqual([
      ["Ahamed", "walking", false],
      ["Dilan", "walking", true],
      ["Fathima", "here", false],
      ["Kumar", "eval", false],
      ["Nila", "called", true],
    ]);
    expect(items.map((it) => roomWords(it, NOW))).toEqual(["on the way 1m", "not here 4m", "with you 5m", "in Eval first", "not sent 4m"]);
    // Older calls (sent before 30 Oct 2026, no walk) count as there.
    const old = roomLessons(board([call("c9", "Fathima", "sent")]), [th("Fathima", READY_D, { where: "theory", calls: [] })], NOW);
    expect(old[0].here).toHaveLength(1);
  });
});

describe("One screen (31 Oct 2026): grade, stage, unit and lesson rows; what to teach, one square at a time", () => {
  const call = (id: string, who: string, status: string, o: Partial<Call> = {}): Call => ({
    _id: id,
    studentId: who,
    room: "theory",
    kind: "theory",
    status,
    section: "D",
    unitId: "u13",
    createdAt: NOW - 10 * MIN,
    sentAt: status === "sent" ? NOW - 8 * MIN : undefined,
    walk: true,
    ...o,
  });

  test("the rows: each the most urgent first; held students count but never as urgent; Legend always there", () => {
    const views = [
      th("Fathima", READY_D, { idleMs: 6 * MIN }), // no work: red
      th("Kumar", READY_D, { where: "evaluation" }), // in Evaluation: held, not urgent
      th("Priya", READY_C, { idleMs: MIN }),
      wb("Malik", [13, 17], { sentAgo: 25 * MIN }), // waited 20+ min: urgent (orange)
      wb("Vimal", [13], { sentAgo: 5 * MIN }),
    ];
    const plan = planLessons(views, NOW, FREE);
    const grades = theoryGradeRow(plan);
    expect(grades.map((g) => g.grade)).toEqual([11, 7, 6, 8, 9, 10]);
    expect(grades[0].c).toEqual({ red: 2, orange: 0, yellow: 1, total: 3 }); // Kumar counts, as yellow
    expect(grades[1].c).toMatchObject({ orange: 1, total: 2 });
    const g11 = plan.filter((l) => l.unit?.grade === 11);
    expect(theoryStageRow(g11).map((x) => [x.label, x.c.total])).toEqual([
      ["Fighter", 3],
      ["Master", 0],
      ["Legend", 0],
    ]);
    const units = theoryUnitRow(g11.filter((l) => l.kind === "section"));
    expect(units.map((u) => [u.unit.code, u.c.total, u.lessons.map((l) => l.section?.id)])).toEqual([["U13", 3, ["D", "C"]]]);
  });

  test("the lessons: a theory book's sections; a workbook's questions by the same students (one pill), then the whole unit", () => {
    const views = [
      th("Fathima", READY_D, { idleMs: 6 * MIN }),
      th("Priya", READY_C, { idleMs: MIN }),
      wb("Malik", [13, 17], { sentAgo: 25 * MIN }),
      wb("Vimal", [13], { sentAgo: 5 * MIN }),
      wb("Sana", [4], { sentAgo: 5 * MIN, whole: true }),
      wb("Rizwan", [], { sentAgo: 5 * MIN, whole: true }),
    ];
    const plan = planLessons(views, NOW, FREE);
    const sec = lessonPills(theoryUnitRow(plan.filter((l) => l.kind === "section"))[0]);
    expect(sec.map((p) => [p.label, p.qs, p.members.map((m) => m.v.s.name)])).toEqual([
      ["D", [23, 24, 25, 26], ["Fathima"]],
      ["C", [15, 16, 17], ["Priya"]],
    ]);
    const work = lessonPills(theoryUnitRow(plan.filter((l) => l.kind === "workbook"))[0]);
    // Q13: Malik and Vimal (Malik waited 25 min: orange first); Q17 Malik alone; Q4 Sana; the whole unit: Sana, Rizwan.
    expect(work.map((p) => [p.label, p.heat, p.members.map((m) => m.v.s.name).sort()])).toEqual([
      ["13", "orange", ["Malik", "Vimal"]],
      ["17", "orange", ["Malik"]],
      ["Whole unit", "yellow", ["Rizwan", "Sana"]],
      ["4", "yellow", ["Sana"]],
    ]);
    // The row holds still while nothing she can see changes (the hold of the Theory pills, 30 Oct 2026).
    const items = work.map((p) => ({ key: p.key, sig: lessonPillSig(p) }));
    const first = holdOrder(null, items, false);
    expect(holdOrder(first, [...items].reverse(), false).keys).toEqual(first.keys);
  });

  test("his screenshot (31 Oct 2026): Malik alone needs his workbook's lesson and is with her: the rows stay on it", () => {
    const c = call("c-m", "Malik", "sent", { section: "R", unitId: "u08", arrivedAt: NOW - 3 * MIN });
    const views = [th("Fathima", READY_D, { idleMs: 6 * MIN }), wb("Malik", [13, 17], { where: "theory", calls: [c] })];
    const plan = planLessons(views, NOW, FREE);
    // The cause: called, he is not in the plan; Grade 7 had nobody (pale), the rows jumped to Grade 11's D.
    expect(theoryGradeRow(plan).find((g) => g.grade === 7)!.c.total).toBe(0);
    const sqs = theorySquares(roomItems(roomLessons(board([c]), views, NOW), NOW));
    expect(sqs.map((x) => x.q)).toEqual([13, 17]);
    const r = theoryRows({}, plan, sqs, sqs[0]);
    expect([r.grade, r.stage, r.unit, r.onRoom]).toEqual([7, "workbook", "u08", true]);
    expect(r.grades.filter((g) => g.room).map((g) => g.grade)).toEqual([7]);
    expect(r.stages.find((s) => s.id === "workbook")).toMatchObject({ room: true });
    expect(r.units.map((u) => [u.unit.code, u.c.total, u.room, u.lessons.length])).toEqual([["U08", 0, true, 0]]);
    // To call the next lesson she taps Grade 11: its rows, not her room's; her room's grade brings them back.
    expect(theoryRows({ grade: 11 }, plan, sqs, sqs[0])).toMatchObject({ grade: 11, stage: "section", unit: "u13", onRoom: false });
    expect(theoryRows({ grade: 7 }, plan, sqs, sqs[0])).toMatchObject({ grade: 7, unit: "u08", onRoom: true });
  });

  test("what to teach: each question once for everyone with her; Taught for all; Done when every question of his is decided", () => {
    const calls = [
      call("c1", "Fathima", "sent", { arrivedAt: NOW - 4 * MIN }),
      call("c2", "Ahamed", "sent", { arrivedAt: NOW - 3 * MIN }),
      call("c3", "Malik", "sent", { section: "R", unitId: "u08", arrivedAt: NOW - 3 * MIN }),
      call("c4", "Nila", "sent", { sentAt: NOW - MIN }), // on the way
    ];
    const partly = { ...READY_D, "23": { s: "taught" as const, t: 1 } }; // Ahamed had Q23 before
    const views = [
      th("Fathima", READY_D, { where: "theory", calls: [calls[0]] }),
      th("Ahamed", partly, { where: "theory", calls: [calls[1]] }),
      wb("Malik", [13, 17], { where: "theory", calls: [calls[2]], whole: true }),
      th("Nila", READY_D, { where: "theory", calls: [calls[3]] }),
    ];
    const items = roomItems(roomLessons(board(calls), views, NOW), NOW);
    const sqs = theorySquares(items);
    // Only those with her (Nila is on the way). The lesson with more students first, a section in the book's order
    // (its teach questions build on each other: Q23 for Fathima, Ahamed had it), then Malik's workbook.
    expect(sqs.map((x) => [x.q, x.who.map((it) => it.name).sort()])).toEqual([
      [23, ["Fathima"]],
      [24, ["Ahamed", "Fathima"]],
      [25, ["Ahamed", "Fathima"]],
      [26, ["Ahamed", "Fathima"]],
      [13, ["Malik"]],
      [17, ["Malik"]],
      ["whole", ["Malik"]],
    ]);
    const fathima = items.find((it) => it.name === "Fathima")!;
    const malik = items.find((it) => it.name === "Malik")!;
    expect(needsOf(fathima)).toEqual([23, 24, 25, 26]);
    expect(needsOf(malik)).toEqual([13, 17, "whole"]);
    // Taught Q23-25 for both, Q26 not reached (the bell): Fathima and Ahamed are done; Malik isn't.
    const dec = {
      [fathima.st!.v.key]: { "23": "t", "24": "t", "25": "t", "26": "n" },
      [items.find((it) => it.name === "Ahamed")!.st!.v.key]: { "24": "t", "25": "t", "26": "n" },
    } as const;
    expect(items.filter((it) => tAllDecided(it, dec)).map((it) => it.name).sort()).toEqual(["Ahamed", "Fathima"]);
    expect(tUndecided(sqs[0], dec)).toEqual([]);
    expect(theoryFinish(fathima, dec[fathima.st!.v.key], false)).toEqual({ kind: "section", taught: [23, 24, 25] });
    expect(tDecisionWords(fathima, dec[fathima.st!.v.key])).toBe("3 taught · 1 not reached");
    // Malik: Q13 taught, Q17 not reached, the whole unit not reached: Q13 alone is marked taught, the rest stays.
    expect(theoryFinish(malik, { "13": "t", "17": "n", whole: "n" }, false)).toEqual({ kind: "workbook", done: { all: false, taught: [13] } });
    // Everything taught (or All taught): all.
    expect(theoryFinish(malik, {}, true)).toEqual({ kind: "workbook", done: { all: true } });
    // Nobody with her yet: the ones on the way (to get ready); nobody called: the picked lesson's (to prepare).
    const onlyWalking = items.filter((it) => it.name === "Nila");
    expect(theorySquares(onlyWalking).map((x) => x.q)).toEqual([23, 24, 25, 26]);
    const plan = planLessons([th("Hana", READY_D, { idleMs: MIN })], NOW, FREE);
    const pill = lessonPills(theoryUnitRow(plan)[0])[0];
    expect(theorySquares([], pill).map((x) => [x.q, x.who.length])).toEqual([
      [23, 0],
      [24, 0],
      [25, 0],
      [26, 0],
    ]);
  });
});
