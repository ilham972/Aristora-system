// The Fighter and Master pages' rules (src/deskData.ts, 8 Nov 2026), who sends a consultation's student
// (src/callRoute.ts), the dashboard's numbers (deptNow) and Consultation per department (src/consultData.ts scope),
// on fake classes.

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import { correctionSends, LEAD_LATE_MS, leadSends, phoneSends } from "../src/callRoute";
import { consultRows, deptTally, todayOf, waitsOf } from "../src/consultData";
import type { View } from "../src/derive";
import { correctionNow, deptNow, deskLists, deskLook, deskPlan, deskQs, deskTicks, DESK_CAP, isBlank, nextQ, type DeskQ } from "../src/deskData";
import { asView } from "./views";

const PILOT = fighter(PILOT_FIGHTER);
const G7U08 = KNOWN_WORKBOOKS[0].data;
const U13 = { _id: "u13", code: "U13", grade: 11, en: "Equations", ta: "சமன்பாடுகள்" };
const U08 = { _id: "u08", code: "U08", grade: 7, en: "Directed numbers", ta: "திசை எண்கள்" };
const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 9, 11, 0);

const taught = (...sections: string[]): Marks =>
  Object.fromEntries(sections.flatMap((id) => PILOT.sectionById(id)!.teach.map((q) => [String(q), { s: "taught" as const, t: NOW - 90 * MIN }])));
const right = (from: number, to: number): Marks =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), { s: "right" as const, t: NOW - 30 * MIN }]));
const wrong = (q: number, ago: number): Marks => ({ [String(q)]: { s: "wrong", t: NOW - ago * MIN } });

/** A theory-book student (the G11 pilot book). */
function th(name: string, marks: Marks, o: { idleMs?: number } = {}): View {
  const st = computeStatus(marks, PILOT);
  return asView({
    s: { _id: name, name, unitId: U13._id, grade: 11, stage: "fighter", lastSeenAt: 0, lastActivityAt: NOW - MIN, lastInAt: NOW - 30 * MIN },
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
    tag: "G11 · U13",
  });
}
/** A workbook student: level 1 corrected 40 min ago with these lost (blank: "?"), x = explained at those minutes ago. */
function wb(name: string, lost: number[], o: { blank?: number[]; x?: Record<number, number>; noWork?: boolean } = {}): View {
  const m: MState = { q: {}, lv: {} };
  const l = G7U08.levels[0];
  for (let q = l.from; q <= l.to; q++) {
    const isLost = lost.includes(q) || (o.blank ?? []).includes(q);
    m.q[String(q)] = {
      got: isLost ? 0 : 2,
      max: 2,
      lost: isLost,
      t: NOW - 40 * MIN,
      ...((o.blank ?? []).includes(q) ? { dk: true } : {}),
      ...(o.x?.[q] !== undefined ? { x: NOW - o.x[q] * MIN } : {}),
    };
  }
  m.lv["1"] = { done: NOW - 50 * MIN, fixed: NOW - 40 * MIN, got: 10 };
  const ms = computeMaster(m, G7U08);
  return asView({
    s: { _id: name, name, unitId: U08._id, grade: 7, stage: "master", lastSeenAt: 0, lastInAt: NOW - 30 * MIN },
    unit: U08,
    stage: "master",
    kind: "master",
    where: "hall",
    f: null,
    st: null,
    marks: {},
    mb: G7U08,
    ms,
    mm: m,
    pending: ms.pending,
    calls: [],
    pulled: false,
    noWork: !!o.noWork,
    tag: "G7 · U08",
  });
}
const IN_C = { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14) };
const names = (ks: string[]) => ks.map((k) => k.split(":")[0]);

describe("the Master page: grade → Evaluation → unit → the questions the same students lost, the most urgent picked", () => {
  const a = wb("Asha", [3, 5], { blank: [4], noWork: true });
  const b = wb("Bala", [3, 5]);
  const c = wb("Chen", [7]);
  const fighterKid = th("Dilan", { ...IN_C, ...wrong(18, 30) });
  const lists = deskLists([a, b, c, fighterKid], NOW, "master");

  test("only the department's books: the theory-book student isn't on the Master page", () => {
    expect(lists.cands.map((x) => x.v.s.name).sort()).toEqual(["Asha", "Bala", "Chen"]);
    expect(lists.lessons).toEqual([]);
  });

  test("the rows: Grade 7 picked, Evaluation first (Master's main work), unit 8, the shared questions first", () => {
    const plan = deskPlan(lists, "master", {});
    expect(plan.grade).toBe(7);
    expect(plan.grades.find((g) => g.grade === 7)!.c.total).toBe(3);
    expect(plan.what).toBe("eval");
    expect(plan.whats.map((w) => w.id)).toEqual(["eval", "theory"]);
    expect(plan.units.map((u) => u.unit.code)).toEqual(["U08"]);
    // Asha (no work: red) and Bala share Q3 and Q5: one pill, the most students first; Asha's blank Q4 alone after it.
    expect(plan.pills.map((p) => p.label)).toEqual(["3 · 5", "4", "7"]);
    expect(plan.pill).toBe(plan.pills[0].key);
    // Her pick of another pill holds while it has someone; a pick nobody needs falls back to the page's.
    expect(deskPlan(lists, "master", { grade: 7, what: "eval", unit: plan.unit!, pill: plan.pills[1].key }).pill).toBe(plan.pills[1].key);
    expect(deskPlan(lists, "master", { grade: 9 }).grade).toBe(7);
  });

  test("the ticks: ready ones (red, orange), six at most; nobody ready: the most urgent one only", () => {
    const plan = deskPlan(lists, "master", {});
    const shared = plan.pills.find((p) => p.label === "3 · 5")!;
    expect(names(deskTicks(shared, "eval")).sort()).toEqual(["Asha", "Bala"]);
    const late = { ...shared, members: shared.members.map((m) => ({ ...m, heat: "yellow" as const })) };
    expect(deskTicks(late, "eval")).toHaveLength(1);
    const many = { ...shared, members: Array.from({ length: 9 }, (_, i) => ({ ...shared.members[0], v: { ...shared.members[0].v, key: `k${i}` } as View })) };
    expect(deskTicks(many, "eval")).toHaveLength(DESK_CAP);
    const held = { ...shared, members: shared.members.map((m) => ({ ...m, hold: "with a teacher" })) };
    expect(deskTicks(held, "eval")).toEqual([]);
  });

  test("the squares: each question once for everyone ticked, the pill's first; a blank in its own colour; done stays", () => {
    const qs = deskQs([{ v: a, local: {} }, { v: b, local: {} }], "eval", NOW - 5 * MIN, { key: "p", label: "", qs: [3, 5], whole: false, heat: "red", members: [], section: null });
    expect(qs.map((x) => [x.q, x.who.length, x.blank])).toEqual([
      [3, 2, false],
      [5, 2, false],
      [4, 1, true],
    ]);
    expect(isBlank(a, 4)).toBe(true);
    expect(deskLook(qs[2]).cls).toBe(" blank");
    // Explained here (since the sitting): still on screen, ✓; explained before it: gone.
    const done = wb("Asha", [3, 5], { blank: [4], x: { 3: 2 } });
    const old = wb("Bala", [3, 5], { x: { 3: 30 } });
    const qs2 = deskQs([{ v: done, local: {} }, { v: old, local: {} }], "eval", NOW - 5 * MIN, null);
    const q3 = qs2.find((x) => x.q === 3)!;
    expect(q3.who.map((w) => [w.name, w.state])).toEqual([["Asha", "x"]]);
    expect(deskLook(q3)).toMatchObject({ sign: "✓" });
    // Not now (this phone): the square says so; the next open one comes after a tap.
    const skipped = deskQs([{ v: a, local: { skip: { [`${a.unit!._id}:${a.stage}:5`]: true } } }], "eval", NOW, null);
    expect(skipped.find((x) => x.q === 5)!.who[0].state).toBe("skip");
    const order: DeskQ[] = qs;
    expect(nextQ(order, order[0].key)).toBe(order[1].key);
  });
});

describe("the Fighter page: Theory first; the students with no work need the next section", () => {
  test("a section's lesson for those who finished the ladder; their wrong answers under Evaluation", () => {
    // Fathima: section C's ladder done (no work); Kumar: a wrong answer waiting; a workbook student isn't Fighter's.
    const dry = th("Fathima", { ...IN_C, ...right(18, 22) }, { idleMs: 6 * MIN });
    const ready = th("Kumar", { ...IN_C, ...right(19, 21), ...wrong(18, 14) });
    const lists = deskLists([dry, ready, wb("Malik", [4])], NOW, "fighter");
    const plan = deskPlan(lists, "fighter", {});
    expect(plan.grade).toBe(11);
    expect(plan.whats.map((w) => w.id)).toEqual(["theory", "eval"]);
    expect(plan.what).toBe("theory");
    expect(plan.pills[0].section?.id).toBe("D");
    expect(plan.pills[0].members.map((m) => m.v.s.name)).toContain("Fathima");
    expect(deskTicks(plan.pills[0], "theory").map((k) => k.split(":")[0])).toContain("Fathima");
    // The section's teacher questions as squares, in the book's order.
    const sec = PILOT.sectionById("D")!;
    const qs = deskQs([{ v: dry, local: {} }], "theory", NOW, plan.pills[0]);
    expect(qs.map((x) => x.q)).toEqual(sec.teach);
    const ev = deskPlan(lists, "fighter", { grade: 11, what: "eval" });
    expect(ev.pills.map((p) => p.label)).toEqual(["18"]);
  });

  test("the dashboard's numbers: the department's no work, wrong answers, blanks, theory (needed now or soon), by grade", () => {
    const dry = th("Fathima", { ...IN_C, ...right(18, 22) }, { idleMs: 6 * MIN });
    // Kumar: a wrong answer waiting, 3 ladder questions left: his next theory isn't needed yet.
    const ready = th("Kumar", { ...IN_C, ...right(19, 19), ...wrong(18, 14) });
    const views = [dry, ready, wb("Asha", [3, 5], { blank: [4], noWork: true }), wb("Bala", [7])];
    const f = deptNow(views, "fighter");
    expect([f.noWork, f.evalQs, f.evalStudents, f.blanks]).toEqual([1, 1, 1, 0]);
    expect(f.theoryStudents).toBe(1);
    expect(f.byGrade.find((g) => g.grade === 11)).toEqual({ grade: 11, students: 2, noWork: 1 });
    expect(f.byGrade.find((g) => g.grade === 7)).toEqual({ grade: 7, students: 0, noWork: 0 });
    const m = deptNow(views, "master");
    expect([m.noWork, m.evalQs, m.evalStudents, m.blanks]).toEqual([1, 4, 2, 1]);
    expect(m.byGrade.find((g) => g.grade === 7)).toEqual({ grade: 7, students: 2, noWork: 1 });
  });
});

describe("Consultation per department (src/consultData.ts scope)", () => {
  test("Master's list counts workbooks only; Fighter's No work puts the idle ones first", () => {
    const dry = th("Fathima", { ...IN_C, ...right(18, 22) }, { idleMs: 6 * MIN });
    const busy = th("Kumar", { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 13) });
    const asha = wb("Asha", [3, 5], { blank: [4] });
    const views = [dry, busy, asha];
    expect(waitsOf(asha, "evaluation", "fighter")).toEqual([]);
    expect(waitsOf(asha, "evaluation", "master")[0].qs).toEqual([3, 4, 5]);
    expect(todayOf(views, "evaluation", "master")).toEqual({ qs: 3, students: 1, red: 0 });
    expect(todayOf(views, "evaluation", "fighter")).toEqual({ qs: 0, students: 0, red: 0 });
    const rows = consultRows(views, "theory", "me", "fighter", true).filter((r) => r.n > 0);
    expect(rows[0].v.s.name).toBe("Fathima");
    expect(rows[0].red).toBe(true);
    // The owner's Fighter | Master bar: each department's students here who need it, and how many have no work.
    expect(deptTally(views, "master")).toEqual({ students: 1, red: 0 });
    expect(deptTally(views, "fighter")).toEqual({ students: 2, red: 1 });
  });
});

describe("who sends a consultation's student (src/callRoute.ts)", () => {
  const call = (o: Partial<{ consult: boolean; dept: "fighter" | "master"; toLead: boolean; createdAt: number }>) => ({ createdAt: NOW - MIN, ...o });
  const lead = { role: "teacher" as const, dept: "master" as const, lead: true };
  const fighterLead = { role: "teacher" as const, dept: "fighter" as const, lead: true };
  const member = { role: "teacher" as const, dept: "master" as const, lead: false };
  const correction = { role: "teacher" as const, dept: "management" as const };

  test("her department's consultation: its lead, at once; Correction only after 3 minutes nobody sent him", () => {
    const c = call({ consult: true, dept: "master", toLead: true });
    expect(leadSends(lead, c)).toBe(true);
    expect([phoneSends(lead, c, NOW), phoneSends(fighterLead, c, NOW), phoneSends(member, c, NOW), phoneSends(correction, c, NOW)]).toEqual([true, false, false, false]);
    expect(correctionSends(c, NOW - MIN + LEAD_LATE_MS)).toBe(true);
    expect(phoneSends(correction, c, NOW - MIN + LEAD_LATE_MS)).toBe(true);
  });

  test("the owner working in a department as its lead: its consultations ring on his phone, Correction's calls don't; never his own", () => {
    const owner = { _id: "o1", role: "owner" as const, dept: "master" as const, lead: true };
    const c = { ...call({ consult: true, dept: "master", toLead: true }), teacherId: "t9" };
    expect([leadSends(owner, c), phoneSends(owner, c, NOW), phoneSends(owner, call({}), NOW)]).toEqual([true, true, false]);
    expect(leadSends(owner, { ...c, teacherId: "o1" })).toBe(false); // his own consultation: not his to send
    // In no department, as before: Correction's calls.
    expect(phoneSends({ _id: "o1", role: "owner" }, call({}), NOW)).toBe(true);
    // Working in Management: Correction's calls, not a department's consultation in its first 3 minutes.
    expect([phoneSends({ role: "owner", dept: "management" }, call({}), NOW), phoneSends({ role: "owner", dept: "management" }, c, NOW)]).toEqual([true, false]);
  });

  test("every other call is Correction's (the owner and the manager too), never a department lead's", () => {
    const plain = call({});
    const noLead = call({ consult: true, dept: "fighter" });
    expect([phoneSends(correction, plain, NOW), phoneSends({ role: "owner" }, plain, NOW), phoneSends(null, plain, NOW)]).toEqual([true, true, true]);
    expect([phoneSends(lead, plain, NOW), phoneSends(fighterLead, noLead, NOW)]).toEqual([false, false]);
    expect(phoneSends(correction, noLead, NOW)).toBe(true);
  });
});

/** A workbook student with levels handed in (these minutes ago) and not corrected yet; all = every level of the book. */
function handedIn(name: string, grade: number, ago: number[], o: { all?: boolean; noWork?: boolean; where?: View["where"] } = {}): View {
  const m: MState = { q: {}, lv: {} };
  const levels = o.all ? G7U08.levels : G7U08.levels.slice(0, ago.length);
  levels.forEach((l, i) => (m.lv[String(l.n)] = { done: NOW - (ago[i] ?? ago[ago.length - 1]) * MIN }));
  const ms = computeMaster(m, G7U08);
  return asView({
    s: { _id: name, name, unitId: U08._id, grade, stage: "master", lastSeenAt: 0, lastInAt: NOW - 60 * MIN },
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
    calls: [],
    pulled: false,
    noWork: !!o.noWork,
    tag: "G7 · U08",
  });
}

describe("the Correction department's numbers now (correctionNow: its dashboard)", () => {
  test("papers handed in, from how many students; red = in the hall with no work until one is corrected; the oldest; by grade", () => {
    const asha = handedIn("Asha", 7, [30]);
    const bala = handedIn("Bala", 8, [12, 10], { all: true, noWork: true });
    const chitra = handedIn("Chitra", 7, [5], { where: "evaluation" });
    const gone = handedIn("Gone", 9, [50], { where: "absent" });
    const dinesh = wb("Dinesh", [3]); // corrected already: nothing waits
    expect(bala.ms!.needs).toEqual(["correction"]);
    const n = correctionNow([asha, bala, chitra, gone, dinesh]);
    expect(n).toMatchObject({ papers: 2 + G7U08.levels.length, students: 3, red: 1, oldest: NOW - 30 * MIN });
    expect(n.byGrade).toEqual([
      { grade: 6, students: 0, red: 0 },
      { grade: 7, students: 2, red: 0 },
      { grade: 8, students: 1, red: 1 },
      { grade: 9, students: 0, red: 0 },
      { grade: 10, students: 0, red: 0 },
      { grade: 11, students: 0, red: 0 },
    ]);
    expect(correctionNow([dinesh])).toMatchObject({ papers: 0, students: 0, red: 0, oldest: null });
  });
});
