// The Evaluation page's rules (src/evalFocusData.ts), what every row says now and next (src/nextData.ts), and a
// room's score (src/score.ts), on fake classes.

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import type { View } from "../src/derive";
import {
  candidates,
  decisionWords,
  defaultEvalTicks,
  EVAL_CAP,
  evalCounts,
  evalLeft,
  evalRoom,
  finishPlan,
  qLabel,
  sameGroups,
} from "../src/evalFocusData";
import { nextOf, nowOf } from "../src/nextData";
import { cheerOf, scoreOf } from "../src/score";
import type { Board } from "../src/store";

const PILOT = fighter(PILOT_FIGHTER);
const G7U08 = KNOWN_WORKBOOKS[0].data;
const U13 = { _id: "u13", code: "U13", grade: 11, en: "Equations", ta: "சமன்பாடுகள்" };
const U08 = { _id: "u08", code: "U08", grade: 7, en: "Directed numbers", ta: "திசை எண்கள்" };
const MIN = 60_000;
const NOW = Date.UTC(2026, 9, 29, 10, 0);
const PACE = 4 * MIN;

const taught = (...sections: string[]): Marks =>
  Object.fromEntries(sections.flatMap((id) => PILOT.sectionById(id)!.teach.map((q) => [String(q), { s: "taught" as const, t: NOW - 90 * MIN }])));
const right = (from: number, to: number): Marks =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), { s: "right" as const, t: NOW - 30 * MIN }]));
const wrong = (q: number, ago: number, n = 1): Marks => ({ [String(q)]: { s: "wrong", n, t: NOW - ago * MIN } });

type Call = { _id: string; studentId: string; room: "theory" | "evaluation"; kind: "theory" | "evaluation"; status: string; createdAt: number; sentAt?: number; pull?: boolean };

/** A theory-book student (the G11 pilot book). */
function th(name: string, marks: Marks, o: { where?: View["where"]; idleMs?: number; calls?: Call[]; lastActivityAt?: number; pulled?: boolean } = {}): View {
  const st = computeStatus(marks, PILOT);
  return {
    s: { _id: name, name, unitId: U13._id, grade: 11, stage: "fighter", lastSeenAt: 0, lastActivityAt: o.lastActivityAt ?? NOW - MIN },
    unit: U13,
    stage: "fighter",
    kind: "fighter",
    where: o.where ?? "hall",
    f: PILOT,
    st,
    marks,
    mb: null,
    ms: null,
    mm: { q: {}, lv: {} },
    pending: st.pending,
    calls: o.calls ?? [],
    idleMs: o.idleMs,
    pulled: !!o.pulled,
    tag: "G11 · U13",
  } as unknown as View;
}
/** A workbook student: levels 1..fixed corrected with these questions lost (40 min ago), then `waiting` handed in. */
function wb(name: string, lost: number[], o: { fixed?: number; waiting?: number[]; where?: View["where"]; calls?: Call[] } = {}): View {
  const m: MState = { q: {}, lv: {} };
  for (const l of G7U08.levels.slice(0, o.fixed ?? 2)) {
    for (let q = l.from; q <= l.to; q++) m.q[String(q)] = { got: lost.includes(q) ? 0 : 2, max: 2, lost: lost.includes(q), t: NOW - 40 * MIN };
    m.lv[String(l.n)] = { done: NOW - 50 * MIN, fixed: NOW - 40 * MIN, got: l.max - 2 * lost.filter((q) => q >= l.from && q <= l.to).length };
  }
  for (const n of o.waiting ?? []) m.lv[String(n)] = { done: NOW - 5 * MIN };
  const ms = computeMaster(m, G7U08);
  return {
    s: { _id: name, name, unitId: U08._id, grade: 7, stage: "master", lastSeenAt: 0 },
    unit: U08,
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
    tag: "G7 · U08",
  } as unknown as View;
}
const board = (calls: Call[], stats: Record<string, Record<string, number>> = {}) =>
  ({ calls, session: { _id: "s", startedAt: NOW - 60 * MIN, lastActivityAt: NOW, stats } }) as unknown as Board;
const names = (xs: { v: View }[]) => xs.map((x) => x.v.s.name);

// Ready for C: A, B taught, their ladders right. In C now.
const IN_C = { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14) };

describe("Who to call: most urgent first, with what each does meanwhile", () => {
  const stuck = th("Dilan", { ...IN_C, ...right(19, 20), ...wrong(18, 6, 2) });
  const dry = th("Fathima", { ...IN_C, ...right(18, 21), ...wrong(22, 8) }, { idleMs: 6 * MIN });
  const ready = th("Kumar", { ...IN_C, ...right(18, 19), ...wrong(20, 14) });
  const later = th("Nila", { ...IN_C, ...wrong(18, 3) });
  const book = wb("Malik", [4, 13]);
  const list = candidates([later, book, ready, dry, stuck], NOW, PACE);

  test("red (stuck, no work), then orange (waited 10 min), then yellow (later); the words say why", () => {
    expect(names(list)).toEqual(["Dilan", "Fathima", "Malik", "Kumar", "Nila"]);
    expect(list.map((c) => c.heat)).toEqual(["red", "red", "orange", "orange", "yellow"]);
    expect(list.map((c) => c.why)).toEqual(["stuck: Q18", "no work 6m", "waited 40m", "waited 14m", "ready in 7m"]);
    // What he does meanwhile, so she can judge: questions left and when he runs out; nothing twice.
    expect(list.find((c) => c.v.s.name === "Kumar")!.work).toMatch(/^2 left · out ~\dm$/);
    expect(list.find((c) => c.v.s.name === "Fathima")!.work).toBe("");
    expect(list.find((c) => c.v.s.name === "Malik")!.work).toBe("on L3");
  });

  test("the page ticks the most urgent it has room for; never a 'later' one", () => {
    expect(defaultEvalTicks(list, EVAL_CAP)).toEqual(["Dilan", "Fathima", "Malik"]);
    expect(defaultEvalTicks(list, 1)).toEqual(["Dilan"]);
    expect(defaultEvalTicks(list, 0)).toEqual([]);
    expect(defaultEvalTicks(candidates([later], NOW, PACE), 3)).toEqual([]);
  });

  test("counts by book and colour, each student once; someone Theory has is listed, not counted, not ticked", () => {
    const withTheory = th("Sana", { ...IN_C, ...wrong(18, 30) }, { calls: [{ _id: "c", studentId: "Sana", room: "theory", kind: "theory", status: "requested", createdAt: NOW }] });
    const all = candidates([later, book, ready, dry, stuck, withTheory], NOW, PACE);
    expect(all.find((c) => c.v.s.name === "Sana")!.hold).toBe("Called to Theory");
    expect(names(all).at(-1)).toBe("Sana");
    const c = evalCounts(all);
    expect(c.all).toEqual({ red: 2, orange: 2, yellow: 1, total: 5 });
    expect(c.fighter).toEqual({ red: 2, orange: 1, yellow: 1, total: 4 });
    expect(c.master).toEqual({ red: 0, orange: 1, yellow: 0, total: 1 });
    expect(defaultEvalTicks(all, 3)).not.toContain("Sana");
  });

  test("the same question for 2+ she can call: explain it once", () => {
    const a = th("Ahamed", { ...IN_C, ...right(18, 21), ...wrong(22, 12) });
    const groups = sameGroups(candidates([a, dry, stuck], NOW, PACE));
    expect(groups.map((g) => [g.label, names(g.members)])).toEqual([["U13 Q22", ["Ahamed", "Fathima"]]]); // both out of work: the older wrong answer first
    expect(qLabel(a, 22)).toBe("Q22");
  });
});

describe("With her: 3 at once, one question at a time", () => {
  const sent = (id: string, kind: "evaluation" | "theory" = "evaluation"): Call => ({ _id: `c-${id}`, studentId: id, room: "evaluation", kind, status: "sent", createdAt: NOW - 5 * MIN, sentAt: NOW - 4 * MIN });
  test("the room counts who is here and who is on the way", () => {
    const k = th("Kumar", { ...IN_C, ...wrong(18, 14), ...wrong(19, 12) }, { where: "evaluation", calls: [sent("Kumar")] });
    const coming: Call = { _id: "c-n", studentId: "Nila", room: "evaluation", kind: "evaluation", status: "requested", createdAt: NOW };
    const n = th("Nila", { ...IN_C, ...wrong(18, 30) }, { calls: [coming] });
    const room = evalRoom(board([k.calls[0] as Call, coming]), [k, n], NOW);
    expect(room.here.map((h) => [h.v.s.name, h.qs])).toEqual([["Kumar", [18, 19]]]);
    expect(room.coming.map((rc) => rc.c.studentId)).toEqual(["Nila"]);
    expect(evalLeft(room)).toBe(1);
  });

  test("Done: what she decided; 'All explained' fills in the rest; theory books re-teach the section", () => {
    const k = th("Kumar", { ...IN_C, ...wrong(18, 14), ...wrong(19, 12), ...wrong(20, 10) });
    const h = { v: k, qs: [18, 19, 20] };
    expect(finishPlan(h, {}, true)).toEqual({ explained: [18, 19, 20], theoryQs: [], reteach: undefined });
    expect(finishPlan(h, { 18: "x", 19: "skip" }, false)).toEqual({ explained: [18], theoryQs: [], reteach: undefined });
    // Q20 needs theory: explained too (so he can redo it after the lesson), and section C goes back to Theory.
    expect(finishPlan(h, { 18: "x", 20: "th" }, true)).toEqual({ explained: [18, 19, 20], theoryQs: [], reteach: "C" });
    expect(decisionWords(h, { 18: "x", 20: "th" })).toBe("1 explained · 1 to Theory · 1 stays");
  });

  test("a workbook: the questions for Theory are sent there, not explained", () => {
    const m = wb("Malik", [4, 13, 17]);
    const h = { v: m, qs: m.ms!.pending };
    expect(h.qs).toEqual([4, 13, 17]);
    expect(finishPlan(h, { 4: "x", 13: "th" }, false)).toEqual({ explained: [4], theoryQs: [13] });
    expect(finishPlan(h, { 13: "th" }, true)).toEqual({ explained: [4, 17], theoryQs: [13] });
  });
});

describe("Every row, for everyone: now and next", () => {
  test("a theory-book student: where he is, and Theory when he runs out (a pulse within 5 minutes)", () => {
    const working = th("Nila", { ...IN_C, ...right(18, 19) }, { lastActivityAt: NOW });
    expect(nowOf(working, NOW)).toEqual({ tone: "green", text: "C · 3 left" });
    const [t] = nextOf(working, NOW, PACE);
    expect(t).toMatchObject({ room: "theory", text: "Theory D ~12m", inMs: 12 * MIN, pulse: false });
    const almost = th("Ahamed", { ...IN_C, ...right(18, 21) }, { lastActivityAt: NOW });
    expect(nowOf(almost, NOW)).toEqual({ tone: "amber", text: "C · 1 left" });
    expect(nextOf(almost, NOW, PACE)[0]).toMatchObject({ text: "Theory D ~4m", pulse: true });
    const out = th("Fathima", { ...IN_C, ...right(18, 21), ...wrong(22, 8) }, { idleMs: 6 * MIN });
    expect(nowOf(out, NOW)).toEqual({ tone: "red", text: "No work 6m" });
    expect(nextOf(out, NOW, PACE).map((n) => [n.text, n.inMs, n.pulse])).toEqual([
      ["Theory D", 0, true],
      ["Eval 1", 0, true],
    ]);
  });

  test("a workbook student: on his level; next Correct, Eval and Theory, soonest first", () => {
    const m = wb("Malik", [4], { waiting: [3] });
    expect(nowOf(m, NOW)).toEqual({ tone: "green", text: "On Level 4" });
    expect(nextOf(m, NOW, PACE).map((n) => n.text)).toEqual(["Correct L3", "Eval 1"]);
    const all = wb("Vimal", [22], { fixed: 7, waiting: [8] });
    expect(nowOf(all, NOW).tone).toBe("red");
    expect(nextOf(all, NOW, PACE)[0]).toMatchObject({ room: "correction", text: "Correct L8", pulse: true });
  });

  test("in a room, or called: the room says it; after Evaluation, Theory if it is waiting", () => {
    const sentAt = NOW - 4 * MIN;
    const k = th("Kumar", IN_C, { where: "evaluation", pulled: true, calls: [{ _id: "c", studentId: "Kumar", room: "evaluation", kind: "evaluation", status: "sent", createdAt: sentAt, sentAt }] });
    expect(nowOf(k, NOW)).toEqual({ tone: "evaluation", text: "In Evaluation 4m" });
    expect(nextOf(k, NOW, PACE).map((n) => n.text)).toEqual(["then Theory"]);
  });
});

describe("A room's score: today's numbers, waits going on now included", () => {
  test("the server's counts, plus students out of work now waiting for this room", () => {
    const idle = (name: string, reason: string, since: number) =>
      ({ ...th(name, IN_C), s: { _id: name, name, idleSince: NOW - since * MIN, idleReason: reason } }) as unknown as View;
    const b = board([], { theory: { calls: 4, ahead: 3, done: 4, lessons: 2, qs: 9, waitMs: 5 * MIN, maxWaitMs: 4 * MIN } });
    const s = scoreOf(b, [idle("A", "theory", 6), idle("B", "theory+evaluation", 2), idle("C", "correction", 9)], "theory", NOW);
    expect(s).toEqual({ calls: 4, ahead: 3, done: 4, lessons: 2, qs: 9, waitMs: 13 * MIN, maxWaitMs: 6 * MIN, waitingNow: 2 });
    expect(scoreOf(board([]), [], "evaluation", NOW)).toMatchObject({ calls: 0, waitMs: 0, waitingNow: 0 });
  });

  test("one true line: a long wait first, then ahead of the class, then nobody waiting", () => {
    const base = { calls: 0, ahead: 0, done: 0, lessons: 0, qs: 0, waitMs: 0, maxWaitMs: 0, waitingNow: 0 };
    expect(cheerOf({ ...base, calls: 5, ahead: 5, maxWaitMs: 21 * MIN }, 10)?.tone).toBe("amber");
    expect(cheerOf({ ...base, calls: 4, ahead: 3 }, 10)?.text).toMatch(/^Ahead of the class/);
    expect(cheerOf({ ...base, calls: 4, ahead: 2, done: 2 }, 10)?.text).toBe("Nobody is waiting for you now.");
    expect(cheerOf(base, 10)).toBeNull();
  });
});
