// The founder's numbers on the Students page.

import { describe, expect, test } from "vitest";
import { DAY_MS } from "../convex/lib/day";
import { daysAway, studentStats, type StatRemoved, type StatStudent } from "../src/stats";

const SINCE = new Date("2026-10-28T00:00:00+05:30").getTime(); // attendance began
const NOW = new Date("2026-11-20T16:00:00+05:30").getTime();
const day = (n: number) => NOW - n * DAY_MS;

const kid = (name: string, p: Partial<StatStudent> = {}): StatStudent => ({
  _id: name,
  _creationTime: new Date("2026-09-15T10:00:00+05:30").getTime(),
  name,
  grade: 8,
  ...p,
});
const gone = (name: string, created: number, archivedAt: number | null, demo = false): StatRemoved => ({ name, demo, created, archivedAt });

describe("student numbers", () => {
  test("students now, added and removed this month (Sri Lanka months), demo never counted", () => {
    const active = [
      kid("Ahamed", { lastInAt: day(1) }),
      kid("Bilal", { lastInAt: day(3), _creationTime: new Date("2026-11-02T09:00:00+05:30").getTime() }),
      kid("Chamath", { _creationTime: new Date("2026-11-01T00:20:00+05:30").getTime() }), // 31 Oct in UTC, 1 Nov in Colombo
      kid("Demo Kid", { demo: true, lastInAt: day(0), _creationTime: day(2) }),
    ];
    const removed = [
      gone("Dilan", new Date("2026-11-05T09:00:00+05:30").getTime(), day(4)), // joined and left this month
      gone("Esha", new Date("2026-08-01T09:00:00+05:30").getTime(), new Date("2026-10-30T09:00:00+05:30").getTime()), // left last month
      gone("Old", new Date("2026-08-01T09:00:00+05:30").getTime(), null), // removed before dates were kept
      gone("Demo Gone", day(3), day(2), true),
    ];
    const st = studentStats(active, removed, NOW, SINCE);
    expect(st.total).toBe(3);
    expect(st.demo).toBe(1);
    expect(st.added).toBe(3); // Bilal, Chamath, Dilan
    expect(st.left).toBe(1); // Dilan
  });

  test("came in the last 7 days, and who has stopped coming (longest away first)", () => {
    const active = [
      kid("Ahamed", { lastInAt: day(1) }),
      kid("Bilal", { lastInAt: day(6.9) }),
      kid("Chamath", { lastInAt: day(7.1) }),
      kid("Fathima", { lastInAt: day(15) }),
      kid("Nila", {}), // never signed in since attendance began (23 days)
      kid("New Kid", { _creationTime: day(5) }), // added 5 days ago, not yet come: not away
      kid("Demo", { demo: true }),
    ];
    const st = studentStats(active, [], NOW, SINCE);
    expect(st.week).toBe(2);
    expect(st.away.map((a) => [a.s.name, a.days])).toEqual([
      ["Nila", 23],
      ["Fathima", 15],
    ]);
    expect(st.newWeek).toBe(false);
    expect(st.newAway).toBe(false);
  });

  test("nobody is away in the first two weeks of attendance", () => {
    const early = SINCE + 9 * DAY_MS;
    const st = studentStats([kid("Ahamed"), kid("Nila", { lastInAt: SINCE + DAY_MS })], [], early, SINCE);
    expect(st.away).toEqual([]);
    expect(st.newAway).toBe(true);
    expect(st.newWeek).toBe(false);
    expect(daysAway(kid("Ahamed"), early, SINCE)).toBe(9);
  });
});
