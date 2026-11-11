// The Consultation page's rules (src/consultData.ts, 5 Nov 2026): the students here in his order (the most waiting
// first, a red ring for no work, pale when another teacher has him, then the check-ins: not seen longest first), Today,
// her room, and the squares: what still waits and what this consultation did (so nothing jumps while she works).

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, outOf, PILOT_FIGHTER } from "../convex/lib/book";
import type { EvalShow } from "../convex/lib/consult";
import { slDayStart } from "../convex/lib/day";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import { bookLines, consultQs, consultRoom, consultRows, consultWords, countOf, draftLost, squareLook, todayOf, waitsOf, WHOLE, type ConsultDraft, type ConsultItem, type Show } from "../src/consultData";
import type { View } from "../src/derive";
import type { Board } from "../src/store";
import { asView } from "./views";

const G7U08 = KNOWN_WORKBOOKS[0].data; // L1 1–10, L2 11–20 …
const U08 = { _id: "u08", code: "U08", grade: 7, en: "Directed numbers", ta: "திசை எண்கள்" };
const U13 = { _id: "u13", code: "U13", grade: 11, en: "Quadratic equations", ta: "இருபடிச் சமன்பாடுகள்" };
const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 5, 11, 0);
const ME = "owner";

type Call = { _id: string; studentId: string; room: "evaluation" | "theory"; kind: "evaluation" | "theory"; status: string; createdAt: number; sentAt?: number; arrivedAt?: number; walk?: boolean; teacherId?: string; teacher?: string; consult?: boolean };

/** A workbook student: level 1 corrected with these questions lost (x / th / tt as given, at those minutes ago). */
function wb(name: string, o: { lost?: number[]; x?: Record<number, number>; th?: Record<number, number>; tt?: Record<number, number>; reteach?: boolean; noWork?: boolean; inAgo?: number; where?: View["where"]; calls?: Call[]; consultAt?: number } = {}): View {
  const m: MState = { q: {}, lv: { "1": { done: NOW - 60 * MIN, fixed: NOW - 50 * MIN, got: 10 } } };
  for (let q = 1; q <= 10; q++) {
    const lost = (o.lost ?? []).includes(q);
    m.q[String(q)] = {
      got: lost ? 0 : 2,
      max: 2,
      lost,
      t: NOW - 50 * MIN,
      ...(o.x?.[q] !== undefined ? { x: NOW - o.x[q] * MIN } : {}),
      ...(o.th?.[q] !== undefined ? { th: NOW - o.th[q] * MIN } : {}),
      ...(o.tt?.[q] !== undefined ? { tt: NOW - o.tt[q] * MIN } : {}),
    };
  }
  if (o.reteach) m.reteach = { at: NOW - 40 * MIN };
  const ms = computeMaster(m, G7U08);
  return asView({
    s: { _id: name, name, unitId: U08._id, grade: 7, stage: "master", lastInAt: NOW - (o.inAgo ?? 30) * MIN, present: true, ...(o.consultAt ? { consultAt: o.consultAt } : {}) },
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
    noWork: !!o.noWork,
    pulled: false,
    quiet: false,
    tone: "green",
    line: "On Level 2",
    tag: "G7 · U08",
  });
}

/** A theory-book student (the pilot G11 U13): these circles. */
function tb(name: string, marks: Marks, o: { inAgo?: number } = {}): View {
  const f = fighter(PILOT_FIGHTER);
  const st = computeStatus(marks, f);
  return asView({
    s: { _id: name, name, unitId: U13._id, grade: 11, stage: "fighter", lastInAt: NOW - (o.inAgo ?? 30) * MIN, present: true },
    unit: U13,
    stage: "fighter",
    kind: "fighter",
    where: "hall",
    f,
    st,
    marks,
    mb: null,
    ms: null,
    mm: { q: {}, lv: {} },
    pending: st.pending,
    calls: [],
    pulled: false,
    quiet: false,
    tone: "green",
    line: "",
    tag: "G11 · U13",
  });
}
const taught = (qs: number[], ago = 60): Marks => Object.fromEntries(qs.map((q) => [String(q), { s: "taught" as const, t: NOW - ago * MIN }]));
const names = (rows: { v: View }[]) => rows.map((r) => r.v.s.name);

describe("the students here, in his order", () => {
  test("the most to explain first; ties: no work, then here longest, then A–Z; another teacher's: pale after them; then the check-ins", () => {
    const nila: Call = { _id: "c1", studentId: "Raj", room: "evaluation", kind: "evaluation", status: "requested", createdAt: NOW - MIN, teacherId: "nila", teacher: "Nila" };
    const mine: Call = { _id: "c2", studentId: "Mona", room: "evaluation", kind: "evaluation", status: "sent", createdAt: NOW - MIN, teacherId: ME, teacher: "Owner", consult: true };
    const views = [
      wb("Bala", { lost: [3, 5] }),
      wb("Anu", { lost: [3, 5], inAgo: 50 }), // the same count, here longer
      wb("Chen", { lost: [4, 6], noWork: true }), // the same count, no work: first of the three
      wb("Dev", { lost: [1, 2, 3] }),
      wb("Raj", { lost: [1, 2, 3, 4], calls: [nila] }), // Nila called him: after those she can call
      wb("Mona", { lost: [1], calls: [mine], where: "evaluation" }), // with her already: in her room box
      wb("Zed"), // nothing: a check-in, never seen
      wb("Yan", { consultAt: NOW - 3 * 24 * 60 * MIN }), // nothing, seen 3 days ago
      wb("Xia", { consultAt: NOW - 60 * MIN }), // nothing, seen an hour ago
      wb("Gone", { lost: [1, 2, 3, 4, 5], where: "absent" }),
    ];
    const rows = consultRows(views, "evaluation", ME);
    expect(names(rows)).toEqual(["Dev", "Chen", "Anu", "Bala", "Raj", "Zed", "Yan", "Xia"]);
    expect(rows.map((r) => r.n)).toEqual([3, 2, 2, 2, 4, 0, 0, 0]);
    expect(rows.find((r) => r.v.s.name === "Raj")!.busy).toBe("Nila");
    expect(rows.find((r) => r.v.s.name === "Chen")!.red).toBe(true);
    // Today: the students here (her own consultation's student too: his question is still to do).
    expect(todayOf(views, "evaluation")).toEqual({ qs: 2 + 2 + 2 + 3 + 4 + 1, students: 6, red: 1 });
  });

  test("Theory: questions sent to Theory and the whole unit (a workbook), his next section's teacher questions (a theory book)", () => {
    const wbv = wb("Malik", { lost: [3, 4, 5], th: { 4: 30 }, reteach: true, inAgo: 50 });
    expect(waitsOf(wbv, "theory").map((w) => [w.qs, w.whole])).toEqual([[[4], true]]);
    expect(countOf(waitsOf(wbv, "theory"))).toBe(2);
    expect(countOf(waitsOf(wbv, "evaluation"))).toBe(2); // Q3 and Q5 (Q4 is with Theory)
    const asha = tb("Asha", { ...taught([1, 2, 3, 4, 9]) }); // A taught, B half: B's 10 and 11 to teach
    expect(waitsOf(asha, "theory").map((w) => w.qs)).toEqual([[10, 11]]);
    expect(names(consultRows([asha, wbv], "theory", ME))).toEqual(["Malik", "Asha"]); // 2 and 2: Malik is here longer
  });
});

describe("her room and the squares", () => {
  const board = (calls: Call[]) => ({ calls, students: [], session: null }) as unknown as Board;

  test("her consultation's calls only, in the order she called them, with where each is", () => {
    const calls: Call[] = [
      { _id: "a", studentId: "Anu", room: "evaluation", kind: "evaluation", status: "requested", createdAt: NOW - 5 * MIN, teacherId: ME, teacher: "Owner", consult: true },
      { _id: "b", studentId: "Bala", room: "evaluation", kind: "evaluation", status: "sent", createdAt: NOW - 4 * MIN, sentAt: NOW - 2 * MIN, walk: true, teacherId: ME, teacher: "Owner", consult: true },
      { _id: "c", studentId: "Chen", room: "evaluation", kind: "evaluation", status: "sent", createdAt: NOW - 3 * MIN, sentAt: NOW - 3 * MIN, walk: true, arrivedAt: NOW - 2 * MIN, teacherId: ME, teacher: "Owner", consult: true },
      { _id: "d", studentId: "Dev", room: "evaluation", kind: "evaluation", status: "requested", createdAt: NOW - 3 * MIN, teacherId: ME, teacher: "Owner" }, // her Evaluation room's
      { _id: "e", studentId: "Eva", room: "evaluation", kind: "evaluation", status: "requested", createdAt: NOW - 3 * MIN, teacherId: "nila", teacher: "Nila", consult: true }, // Nila's
    ];
    const views = ["Anu", "Bala", "Chen", "Dev", "Eva"].map((n) => wb(n, { lost: [1] }));
    const room = consultRoom(board(calls), views, NOW, ME);
    expect(room.map((it) => [it.name, it.state])).toEqual([
      ["Anu", "called"],
      ["Bala", "walking"],
      ["Chen", "here"],
    ]);
    expect(room.map((it) => consultWords(it, NOW))).toEqual(["not sent 5m", "on the way 2m", "with you 2m"]);
  });

  test("each question once for everyone with her; what this consultation did stays (✓, T), what came before doesn't", () => {
    const since = NOW - 10 * MIN; // the call
    // Anu: Q3 waits, Q5 explained here, Q6 sent to Theory here, Q7 explained before the call (gone).
    const anu = wb("Anu", { lost: [3, 5, 6, 7], x: { 5: 2, 7: 30 }, th: { 6: 1 } });
    // Bala: Q3 and Q5 wait.
    const bala = wb("Bala", { lost: [3, 5] });
    const it = (v: View) => ({ id: v.s._id, name: v.s.name, state: "here", v }) as unknown as ConsultItem;
    const people = [anu, bala].map((v) => ({ it: it(v), v, since, local: {} }));
    const qs = consultQs(people, "evaluation");
    expect(qs.map((q) => [q.q, q.who.map((w) => `${w.it.name}:${w.state}`).join(" ")])).toEqual([
      [3, "Anu:open Bala:open"],
      [5, "Anu:x Bala:open"],
      [6, "Anu:th"],
    ]);
    expect(qs.map((q) => squareLook(q).sign)).toEqual(["", "", "T"]);
    expect(squareLook(qs[1]).cls).toBe(" part");
    // Not now (this phone only): its square says –.
    const skip = consultQs([{ it: it(bala), v: bala, since, local: { skip: { "u08:master:3": true } } }], "evaluation");
    expect(skip.map((q) => [q.q, q.who[0].state])).toEqual([
      [3, "skip"],
      [5, "open"],
    ]);
    // Theory: Q6 (sent here, waits for Theory: his to teach now), and Q4 taught here; the whole unit.
    const malik = wb("Malik", { lost: [4, 6], th: { 4: 20, 6: 1 }, tt: { 4: 1 }, reteach: true });
    const th = consultQs([{ it: it(malik), v: malik, since, local: {} }], "theory");
    expect(th.map((q) => [q.q, q.who[0].state])).toEqual([
      [WHOLE, "open"],
      [4, "tt"],
      [6, "open"],
    ]);
    // Nobody called: the ticked student's questions, to prepare (nobody on them).
    expect(consultQs([{ it: null, v: bala, since: NOW, local: {} }], "evaluation").map((q) => [q.q, q.who.length])).toEqual([
      [3, 0],
      [5, 0],
    ]);
  });

  test("a theory book: wrong answers to explain, his next section to teach, both staying once done here", () => {
    const since = NOW - 10 * MIN;
    const marks: Marks = {
      ...taught([1, 2, 3, 4]), // A
      ...taught([9], 2), // B: Q9 taught here
      "5": { s: "wrong", t: NOW - 30 * MIN },
      "6": { s: "explained", t: NOW - 3 * MIN }, // explained here
      "7": { s: "explained", t: NOW - 40 * MIN }, // explained before
    };
    const asha = tb("Asha", marks);
    const it = { id: "Asha", name: "Asha", state: "here", v: asha } as unknown as ConsultItem;
    const ev = consultQs([{ it, v: asha, since, local: { fth: {} } }], "evaluation");
    expect(ev.map((q) => [q.q, q.who[0].state])).toEqual([
      [5, "open"],
      [6, "x"],
    ]);
    // Sent to Theory here (the phone remembers it): T.
    const ev2 = consultQs([{ it, v: asha, since, local: { fth: { "u13:fighter:6": true } } }], "evaluation");
    expect(ev2[1].who[0].state).toBe("th");
    const th = consultQs([{ it, v: asha, since, local: {} }], "theory");
    expect(th.map((q) => [q.q, q.who[0].state])).toEqual([
      [9, "tt"],
      [10, "open"],
      [11, "open"],
    ]);
  });
});

describe("All | Past | Today (12 Nov 2026): the wrong questions by when they were corrected", () => {
  const DAY = slDayStart(NOW);
  /** Kumar lost Q3 (two days ago) and Q5 (today); Correction is marking his Level 2 now: Q11 0 marks, Q12 full, Q13 "?". */
  const kumar = () => {
    const v = wb("Kumar", { lost: [3, 5] });
    v.mm.q["3"] = { ...v.mm.q["3"]!, t: NOW - 2 * 24 * 60 * MIN };
    return v;
  };
  const drafts: ConsultDraft[] = [
    { studentId: "Kumar", unitId: "u08", level: 2, q: { "11": { g: 0 }, "12": { g: outOf(G7U08, 12)! }, "13": { g: 0, dk: true } } },
    { studentId: "Other", unitId: "u08", level: 2, q: { "11": { g: 0 } } },
  ];
  const show = (x: EvalShow, d: ConsultDraft[] | null = drafts): Show => ({ show: x, day: DAY, drafts: d });

  test("a level being marked now: its lost questions and its ?, his own only; nothing once the level is saved", () => {
    expect(draftLost(kumar(), drafts)).toEqual([11, 13]);
    const saved = kumar();
    saved.mm.lv["2"] = { done: NOW - 5 * MIN, fixed: NOW - MIN, got: 0 };
    expect(draftLost(saved, drafts)).toEqual([]);
    expect(draftLost(kumar(), null)).toEqual([]);
  });

  test("All = every wrong question and the ones being marked; Past = before today; Today = today and being marked", () => {
    const v = kumar();
    expect(countOf(waitsOf(v, "evaluation"))).toBe(2); // no filter: as before (saved levels only)
    expect(countOf(waitsOf(v, "evaluation", null, show("all")))).toBe(4);
    expect(countOf(waitsOf(v, "evaluation", null, show("past")))).toBe(1);
    expect(countOf(waitsOf(v, "evaluation", null, show("today")))).toBe(3);
    expect(countOf(waitsOf(v, "evaluation", null, show("today", null)))).toBe(1);
    expect(waitsOf(v, "evaluation", null, show("past"))[0].qs).toEqual([3]);
    // The pills and the line follow it.
    expect(consultRows([v], "evaluation", ME, null, false, show("past"))[0].n).toBe(1);
    expect(todayOf([v], "evaluation", null, show("today"))).toEqual({ qs: 3, students: 1, red: 0 });
    // The squares: the saved ones in its time (a level still being marked has nothing to explain yet).
    const p = [{ it: null, v, since: NOW, local: {} }];
    expect(consultQs(p, "evaluation", null, show("past")).map((x) => x.q)).toEqual([3]);
    expect(consultQs(p, "evaluation", null, show("today")).map((x) => x.q)).toEqual([5]);
    expect(consultQs(p, "evaluation", null, show("all")).map((x) => x.q)).toEqual([3, 5]);
    // His file names them.
    expect(bookLines(v, () => 8, drafts)).toEqual(["Unit 8: 2 to explain · 2 being corrected"]);
  });
});
