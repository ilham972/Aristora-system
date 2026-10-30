// Theory's "Next to teach" chips for workbook (Master) students: one chip per workbook, plus a chip per question
// that two or more students need (one lesson for all). Built from plain views, as the phones build them.

import { describe, expect, test } from "vitest";
import { KNOWN_WORKBOOKS } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { theoryGroups, theoryMembers, type View } from "../src/derive";
import { asView } from "./views";

const G7U08 = KNOWN_WORKBOOKS[0].data;
const U08 = { _id: "u08", code: "U08", grade: 7 };

/** A Master student in the hall; `theory` = question numbers sent to Theory, `whole` = the whole unit asked. */
function master(name: string, theory: number[], opts: { whole?: boolean; allDone?: boolean } = {}): View {
  const q: MState["q"] = {};
  for (const n of theory) q[String(n)] = { got: 0, max: 2, lost: true, t: 1, th: 2 };
  // The levels holding those questions are corrected (lost marks exist only on corrected levels).
  const lv: MState["lv"] = {};
  for (const l of G7U08.levels) {
    if (opts.allDone || theory.some((n) => n >= l.from && n <= l.to)) lv[String(l.n)] = { done: 1, fixed: 1, got: l.max };
  }
  const m: MState = { q, lv, ...(opts.whole ? { reteach: { at: 1 } } : {}) };
  return asView({
    s: { _id: name, name, unitId: U08._id, lastSeenAt: 0 },
    unit: U08,
    where: "hall",
    calls: [],
    st: null,
    f: null,
    ms: computeMaster(m, G7U08),
    mm: m,
    idleMs: 0,
  });
}

describe("Theory's chips for workbook students", () => {
  test("one chip per workbook; a question two students need gets its own chip", () => {
    const groups = theoryGroups([master("Kumar", [13, 17]), master("Nila", [13]), master("Ahamed", [21])]);
    expect(groups.map((g) => [g.label, g.members.map((m) => m.v.s.name).sort()])).toEqual([
      ["U08 workbook", ["Ahamed", "Kumar", "Nila"]],
      ["U08 Q13", ["Kumar", "Nila"]],
    ]);
    expect(groups[1].q).toBe(13);
    // Kumar is in both chips, but counts once for the badges and the knock.
    expect(theoryMembers(groups).map((m) => m.v.s.name).sort()).toEqual(["Ahamed", "Kumar", "Nila"]);
  });

  test("the whole unit asked counts; nothing left to do but Theory = red, first", () => {
    const groups = theoryGroups([master("Ravi", [], { whole: true }), master("Sana", [5], { allDone: true })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].members.map((m) => [m.v.s.name, m.urgency])).toEqual([
      ["Sana", "red"],
      ["Ravi", "amber"],
    ]);
  });

  test("students already called for theory, or gone home, are left out", () => {
    const called = { ...master("Kumar", [13]), calls: [{ kind: "theory", room: "theory" }] } as unknown as View;
    const gone = { ...master("Nila", [13]), where: "absent" } as unknown as View;
    expect(theoryGroups([called, gone])).toEqual([]);
  });
});
