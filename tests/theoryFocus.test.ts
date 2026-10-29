// The Theory tab's Next and Room views (src/theoryFocusData.ts), from plain views as the phones build them.

import { describe, expect, test } from "vitest";
import { fighter, KNOWN_WORKBOOKS, PILOT_FIGHTER } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus, type Marks } from "../convex/lib/status";
import type { View } from "../src/derive";
import type { Board } from "../src/store";
import { defaultTicks, joiners, memberWords, nextLessons, redCount, roomLessons, teachLeft, workbookDone } from "../src/theoryFocusData";

const PILOT = fighter(PILOT_FIGHTER);
const G7U08 = KNOWN_WORKBOOKS[0].data;
const U13 = { _id: "u13", code: "U13", grade: 11, en: "Equations", ta: "சமன்பாடுகள்" };
const U08 = { _id: "u08", code: "U08", grade: 7, en: "Directed numbers", ta: "திசை எண்கள்" };
const NOW = 1_000_000;

const taught = (...sections: string[]): Marks =>
  Object.fromEntries(
    sections.flatMap((id) => PILOT.sectionById(id)!.teach.map((q) => [String(q), { s: "taught" as const, t: 1 }])),
  );
const right = (from: number, to: number): Marks =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), { s: "right" as const, t: 1 }]));

type Call = { _id: string; studentId: string; room: "theory" | "evaluation"; kind: "theory" | "evaluation"; status: string; section?: string; unitId?: string; createdAt: number; sentAt?: number; pull?: boolean };

/** A theory-book student (the G11 pilot book). */
function th(name: string, marks: Marks, o: { where?: View["where"]; idleMs?: number; calls?: Call[] } = {}): View {
  return {
    s: { _id: name, name, unitId: U13._id, grade: 11, stage: "fighter", lastSeenAt: 0 },
    unit: U13,
    stage: "fighter",
    kind: "fighter",
    where: o.where ?? "hall",
    f: PILOT,
    st: computeStatus(marks, PILOT),
    marks,
    mb: null,
    ms: null,
    mm: { q: {}, lv: {} },
    calls: o.calls ?? [],
    idleMs: o.idleMs,
  } as unknown as View;
}
/** A workbook student with these questions sent to Theory (their levels corrected). */
function wb(name: string, qs: number[], o: { whole?: boolean; where?: View["where"]; calls?: Call[] } = {}): View {
  const q: MState["q"] = {};
  for (const n of qs) q[String(n)] = { got: 0, max: 2, lost: true, t: 1, th: 2 };
  const lv: MState["lv"] = {};
  for (const l of G7U08.levels) if (qs.some((n) => n >= l.from && n <= l.to)) lv[String(l.n)] = { done: 1, fixed: 1, got: l.max - 2 };
  const m: MState = { q, lv, ...(o.whole ? { reteach: { at: 1 } } : {}) };
  return {
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
  } as unknown as View;
}
const board = (calls: Call[]) => ({ calls }) as unknown as Board;

describe("Next: lessons to teach", () => {
  // Rizwan: A B taught and done → nothing to do (red), needs C. Fathima: C done, needs D (red, idle longer).
  // Ahamed: 2 left in C (amber), needs D. Nila: working (green), needs D. Kumar in Evaluation, needs C.
  const rizwan = th("Rizwan", { ...taught("A", "B"), ...right(5, 8), ...right(12, 14) }, { idleMs: 4 * 60_000 });
  const fathima = th("Fathima", { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14), ...right(18, 22) }, { idleMs: 9 * 60_000 });
  const ahamed = th("Ahamed", { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14), ...right(18, 20) });
  const nila = th("Nila", { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14) });
  const kumar = th("Kumar", { ...taught("A", "B"), ...right(5, 8), ...right(12, 14) }, { where: "evaluation" });

  test("one card per section, most urgent first; who needs it, in order", () => {
    const next = nextLessons([nila, rizwan, ahamed, fathima, kumar]);
    expect(next.map((l) => [l.key, l.section?.id, l.urgency, l.members.map((m) => m.v.s.name)])).toEqual([
      ["u13:D", "D", "red", ["Fathima", "Ahamed", "Nila"]], // Fathima idle 9 min beats Rizwan's 4
      ["u13:C", "C", "red", ["Rizwan", "Kumar"]],
    ]);
    expect(next[0].kind).toBe("section");
    // Ticked by default: everyone in the hall; Kumar is in Evaluation (calling him takes him out): not ticked.
    expect(defaultTicks(next[1])).toEqual(["Rizwan"]);
    expect(next[1].members.map(memberWords)).toEqual(["no work 4 min", "in Evaluation"]);
    expect(next[0].members.map(memberWords)).toEqual(["no work 9 min", "2 left", "working"]);
    // The Next badge: students with no work who need Theory (not in Evaluation).
    expect(redCount(next)).toBe(2);
  });

  test("a lesson stopped part way: he needs only what is left of the section", () => {
    const part = th("Fathima", { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14), ...right(18, 22), "23": { s: "taught", t: 2 }, "24": { s: "skip", t: 2 } });
    const all = th("Dilan", { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14), ...right(18, 22) });
    expect(teachLeft(part, PILOT.sectionById("D")!)).toEqual([25, 26]);
    const [d] = nextLessons([part, all]);
    expect(d.members.map((m) => [m.v.s.name, m.teach])).toEqual([
      ["Dilan", [23, 24, 25, 26]],
      ["Fathima", [25, 26]],
    ]);
    expect(d.teach).toEqual([23, 24, 25, 26]);
    expect(nextLessons([part])[0].teach).toEqual([25, 26]);
  });

  test("students already called for theory, or gone home, are not offered again", () => {
    const called = th("Rizwan", { ...taught("A", "B"), ...right(5, 8), ...right(12, 14) }, {
      calls: [{ _id: "c1", studentId: "Rizwan", room: "theory", kind: "theory", status: "requested", section: "C", createdAt: 1 }],
    });
    const home = th("Sana", { ...taught("A", "B") }, { where: "absent" });
    expect(nextLessons([called, home])).toEqual([]);
  });

  test("a workbook: one card for everyone with questions sent to Theory, shared questions first", () => {
    const next = nextLessons([wb("Malik", [13, 17]), wb("Priya", [13]), wb("Vimal", [], { whole: true })]);
    expect(next).toHaveLength(1);
    const l = next[0];
    expect([l.key, l.kind, l.section]).toEqual(["u08:R", "workbook", null]);
    expect(l.members.map((m) => [m.v.s.name, m.qs, m.whole])).toEqual(
      expect.arrayContaining([
        ["Malik", [13, 17], false],
        ["Priya", [13], false],
        ["Vimal", [], true],
      ]),
    );
    expect(l.shared).toEqual([{ q: 13, n: 2 }]);
  });
});

describe("Room: the lesson going on", () => {
  const call = (id: string, who: string, status: string, o: Partial<Call> = {}): Call => ({
    _id: id,
    studentId: who,
    room: "theory",
    kind: "theory",
    status,
    section: "D",
    unitId: "u13",
    createdAt: NOW - 10 * 60_000,
    sentAt: status === "sent" ? NOW - 8 * 60_000 : undefined,
    ...o,
  });
  const base = { ...taught("A", "B", "C"), ...right(5, 8), ...right(12, 14), ...right(18, 22) };

  test("students sent are grouped by lesson; called ones are on the way; a lesson knows how long", () => {
    const calls = [
      call("c1", "Fathima", "sent"),
      call("c2", "Ahamed", "sent", { sentAt: NOW - 25 * 60_000 }),
      call("c3", "Malik", "sent", { section: "R", unitId: "u08" }),
      call("c4", "Nila", "requested"),
      call("c5", "Kumar", "requested", { pull: true }),
      { ...call("c6", "Zara", "sent"), room: "evaluation", kind: "evaluation" } as Call,
    ];
    const views = [
      th("Fathima", base, { where: "theory", calls: [calls[0]] }),
      th("Ahamed", base, { where: "theory", calls: [calls[1]] }),
      wb("Malik", [13, 17], { where: "theory", calls: [calls[2]] }),
      th("Nila", base, { calls: [calls[3]] }),
      th("Kumar", base, { where: "evaluation", calls: [calls[4]] }),
    ];
    const { lessons, coming } = roomLessons(board(calls), views, NOW);
    expect(lessons.map((l) => [l.key, l.kind, l.section?.id ?? null, l.here.map((s) => s.v.s.name), l.long])).toEqual([
      ["u13:D", "section", "D", ["Ahamed", "Fathima"], true], // Ahamed has been here 25 min: "Still with you?"
      ["u08:R", "workbook", null, ["Malik"], false],
    ]);
    expect(lessons[0].since).toBe(NOW - 25 * 60_000);
    expect(lessons[1].here[0].qs).toEqual([13, 17]);
    expect(coming.map((rc) => [rc.v?.s.name, !!rc.c.pull])).toEqual([
      ["Nila", false],
      ["Kumar", true],
    ]);
  });

  test("who else needs the same lesson now can join it (not those in Evaluation)", () => {
    const next = nextLessons([th("Dilan", base), th("Sana", base, { where: "evaluation" }), th("Rizwan", { ...taught("A", "B"), ...right(5, 8), ...right(12, 14) })]);
    expect(joiners({ key: "u13:D" }, next).map((m) => m.v.s.name)).toEqual(["Dilan"]);
    expect(joiners({ key: "u13:E" }, next)).toEqual([]);
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
