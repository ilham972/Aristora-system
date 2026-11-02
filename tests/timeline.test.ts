// One student's day on the Manager page (convex/lib/timeline.ts): working, no work, walking, with a teacher.

import { describe, expect, test } from "vitest";
import { dayOf } from "../convex/lib/timeline";

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 3, 10, 30); // 4:00 pm in Sri Lanka
const at = (m: number) => T0 + m * MIN;
const kinds = (d: ReturnType<typeof dayOf>) => d.segs.map((s) => [s.kind, (s.from - T0) / MIN, (s.to - T0) / MIN, s.teacher ?? ""]);

describe("His day", () => {
  test("in at 4:00: works, waits 6 min with no work, walks 1 min, 8 min with Nila, back to work", () => {
    const d = dayOf({
      now: at(60),
      visits: [{ inAt: at(0) }],
      idles: [{ from: at(20), to: at(26) }],
      calls: [{ status: "done", kind: "evaluation", teacher: "Nila", sentAt: at(26), walk: true, arrivedAt: at(27), endedAt: at(35) }],
    });
    expect(kinds(d)).toEqual([
      ["work", 0, 20, ""],
      ["idle", 20, 26, ""],
      ["walk", 26, 27, ""],
      ["evaluation", 27, 35, "Nila"],
      ["work", 35, 60, ""],
    ]);
    expect([d.teacherMs, d.idleMs, d.walkMs, d.workMs].map((x) => x / MIN)).toEqual([8, 6, 1, 45]);
    expect(d.contacts).toBe(1);
    expect(d.from).toBe(at(0));
  });

  test("with a teacher wins over no work (the idle clock and the room overlap); a call never sent changes nothing", () => {
    const d = dayOf({
      now: at(40),
      visits: [{ inAt: at(0) }],
      idles: [{ from: at(10), to: at(30) }],
      calls: [
        { status: "done", kind: "theory", teacher: "Meena", sentAt: at(15), walk: true, arrivedAt: at(16), endedAt: at(28) },
        { status: "declined", kind: "evaluation", teacher: "Nila" },
      ],
    });
    expect(kinds(d)).toEqual([
      ["work", 0, 10, ""],
      ["idle", 10, 15, ""],
      ["walk", 15, 16, ""],
      ["theory", 16, 28, "Meena"],
      ["idle", 28, 30, ""],
      ["work", 30, 40, ""],
    ]);
  });

  test("not reached (cancelled while walking): the walk only, no contact; a check-in counts as a contact", () => {
    const d = dayOf({
      now: at(30),
      visits: [{ inAt: at(0) }],
      idles: [],
      calls: [
        { status: "cancelled", kind: "evaluation", teacher: "Nila", sentAt: at(5), walk: true, endedAt: at(9) },
        { status: "sent", kind: "evaluation", visit: true, teacher: "Nila", sentAt: at(20), walk: true, arrivedAt: at(21) },
      ],
    });
    expect(kinds(d)).toEqual([
      ["work", 0, 5, ""],
      ["walk", 5, 9, ""],
      ["work", 9, 20, ""],
      ["walk", 20, 21, ""],
      ["visit", 21, 30, "Nila"],
    ]);
    expect(d.contacts).toBe(1);
  });

  test("two visits (went home, came back): only the time he was here; nothing before he came", () => {
    const d = dayOf({ now: at(100), visits: [{ inAt: at(0), outAt: at(30) }, { inAt: at(70) }], idles: [], calls: [] });
    expect(kinds(d)).toEqual([
      ["work", 0, 30, ""],
      ["work", 70, 100, ""],
    ]);
    expect(dayOf({ now: at(10), visits: [], idles: [], calls: [] })).toMatchObject({ segs: [], from: null, contacts: 0 });
  });
});
