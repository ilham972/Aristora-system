// Attendance: every visit in the register (arrival and leaving times), undoing a mis-tap,
// sessions ending, students removed, and who may take attendance.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { slClock, slDate, slDay, slMonth } from "../convex/lib/day";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-10-28T15:40:00+05:30").getTime(); // a Wednesday afternoon class in Colombo
const TODAY = "2026-10-28";
/** The test clock moves about 1 ms per change: times match within half a second. */
const at = (ms: number) => expect.closeTo(ms, -3);
const tok = (n: number) => `phone-token-${String(n).padStart(4, "0")}-abcdefghijklmnopqrstuvwxyz0123`;

function advance(min: number) {
  vi.setSystemTime(Date.now() + min * MIN);
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type T = Awaited<ReturnType<typeof setup>>;

async function addStudent(t: T, name: string, grade = 8) {
  return await t.mutation(api.students.add, { name, grade, term: 3, stage: "legend" });
}
const signIn = (t: T, id: Id<"students">) => t.mutation(api.students.setPresent, { id, present: true, by: "attendance" });
const signOut = (t: T, id: Id<"students">, undo = false) =>
  t.mutation(api.students.setPresent, { id, present: false, by: "attendance", ...(undo ? { undo: true } : {}) });
async function visits(t: T, id: Id<"students">) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("attendance")
        .withIndex("by_student", (q) => q.eq("studentId", id))
        .collect(),
  );
}
const studentDoc = (t: T, id: Id<"students">) => t.run(async (ctx) => (await ctx.db.get(id))!);

describe("the Sri Lanka calendar", () => {
  test("days, months and times are Colombo's, whatever the server's clock zone", () => {
    const halfPastMidnight = new Date("2026-11-01T00:30:00+05:30").getTime(); // still 31 Oct in UTC
    expect(slDay(halfPastMidnight)).toBe("2026-11-01");
    expect(slMonth(halfPastMidnight)).toBe("2026-11");
    expect(slClock(START)).toBe("3:40 PM");
    expect(slClock(START, false)).toBe("3:40");
    expect(slClock(new Date("2026-10-28T00:05:00+05:30").getTime())).toBe("12:05 AM");
    expect(slClock(new Date("2026-10-28T12:00:00+05:30").getTime())).toBe("12:00 PM");
    expect(slDate(START)).toBe("28 Oct");
  });
});

describe("attendance", () => {
  test("signing in writes the visit with the time; signing out closes it; coming back is a new visit", async () => {
    const t = await setup();
    const id = await addStudent(t, "Ahamed R");
    expect(await signIn(t, id)).toBe(true);
    let s = await studentDoc(t, id);
    expect(s.present).toBe(true);
    expect(s.lastInAt).toEqual(at(START));
    let v = await visits(t, id);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ day: TODAY, inAt: at(START) });
    expect(v[0].outAt).toBeUndefined();
    expect(v[0].sessionId).toBeDefined();

    // A second tap while he is in changes nothing.
    advance(2);
    await signIn(t, id);
    expect(await visits(t, id)).toHaveLength(1);

    advance(88);
    await signOut(t, id);
    v = await visits(t, id);
    expect(v[0].outAt).toEqual(at(START + 90 * MIN));
    s = await studentDoc(t, id);
    expect(s.present).toBe(false);
    expect(s.lastInAt).toEqual(at(START)); // the last arrival stays

    advance(30);
    await signIn(t, id);
    v = await visits(t, id);
    expect(v).toHaveLength(2);
    expect(v[1]).toMatchObject({ inAt: at(START + 120 * MIN) });
    expect((await studentDoc(t, id)).lastInAt).toEqual(at(START + 120 * MIN));

    // The history says who did it, from the Attendance page.
    const events = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "in" || e.kind === "out"));
    expect(events.map((e) => e.kind)).toEqual(["in", "out", "in"]);
    expect(events[0]).toMatchObject({ by: "attendance", who: "Owner", name: "Ahamed R" });
  });

  test("a sign-in tapped by mistake is taken back completely, but only for 5 minutes", async () => {
    const t = await setup();
    const id = await addStudent(t, "Nila K");
    await signIn(t, id);
    advance(30);
    await signOut(t, id);
    const firstIn = START;
    advance(60 * 24 * 3); // three days later
    await signIn(t, id); // wrong pill
    advance(0.2);
    await signOut(t, id, true);
    let s = await studentDoc(t, id);
    expect(s.present).toBe(false);
    expect(s.lastInAt).toEqual(at(firstIn)); // as if the mis-tap never happened
    expect(s.idleSince).toBeUndefined();
    expect(await visits(t, id)).toHaveLength(1);
    const kinds = await t.run(async (ctx) => (await ctx.db.query("events").collect()).map((e) => e.kind));
    expect(kinds).toContain("in-undo");

    // Too late to undo: it is an ordinary sign-out, the visit is kept.
    await signIn(t, id);
    advance(6);
    await signOut(t, id, true);
    const v = await visits(t, id);
    expect(v).toHaveLength(2);
    expect(v[1].outAt).toEqual(at(Date.now()));
    s = await studentDoc(t, id);
    expect(s.lastInAt).toBe(v[1].inAt);
  });

  test("ending the session closes every open visit; a session left open closes at its last activity", async () => {
    const t = await setup();
    const a = await addStudent(t, "Ahamed R");
    const b = await addStudent(t, "Bilal K", 9);
    await signIn(t, a);
    advance(10);
    await signIn(t, b);
    advance(50);
    await t.mutation(api.sessions.end, {});
    expect((await visits(t, a))[0].outAt).toEqual(at(START + 60 * MIN));
    expect((await visits(t, b))[0].outAt).toEqual(at(START + 60 * MIN));

    // Nobody ends the next class: the next day's first sign-in closes it at its last activity.
    advance(60);
    await signIn(t, a);
    advance(20);
    await signIn(t, b); // last activity of that class
    advance(60 * 20);
    await signIn(t, a);
    const va = await visits(t, a);
    expect(va).toHaveLength(3);
    expect(va[1].outAt).toEqual(at(START + 140 * MIN));
    expect(va[2].outAt).toBeUndefined();
    expect(va[2].day).toBe("2026-10-29");
    expect((await visits(t, b))[1].outAt).toEqual(at(START + 140 * MIN));
    expect((await studentDoc(t, b)).present).toBe(false);
  });

  test("removing a student closes his visit and records when; bringing him back clears it", async () => {
    const t = await setup();
    const id = await addStudent(t, "Kumar S");
    await signIn(t, id);
    advance(15);
    await t.mutation(api.students.setArchived, { id, archived: true });
    expect((await visits(t, id))[0].outAt).toEqual(at(START + 15 * MIN));
    expect((await studentDoc(t, id)).archivedAt).toEqual(at(START + 15 * MIN));
    const removed = await t.query(api.state.archived, {});
    expect(removed[0]).toMatchObject({ name: "Kumar S", grade: 8, archivedAt: at(START + 15 * MIN) });
    expect(removed[0].created).toBeGreaterThan(0);
    await expect(signIn(t, id)).rejects.toThrow(/removed from the class/);
    await t.mutation(api.students.setArchived, { id, archived: false });
    expect((await studentDoc(t, id)).archivedAt).toBeUndefined();
  });

  test("the day's register: that day's visits only; it needs the Correction tab", async () => {
    const t = await setup();
    const a = await addStudent(t, "Ahamed R");
    const b = await addStudent(t, "Bilal K", 9);
    await signIn(t, a);
    advance(5);
    await signIn(t, b);
    advance(40);
    await signOut(t, a);
    const day = await t.query(api.attendance.day, { day: TODAY });
    expect(day).toHaveLength(2);
    expect(day.find((r) => r.studentId === a)).toMatchObject({ inAt: at(START), outAt: at(START + 45 * MIN) });
    expect(day.find((r) => r.studentId === b)).toMatchObject({ inAt: at(START + 5 * MIN), outAt: null });
    expect(await t.query(api.attendance.day, { day: "2026-10-27" })).toEqual([]);
    expect(await t.query(api.attendance.day, { day: "not a day" })).toEqual([]);

    // A Correction teacher takes attendance; a Theory-only teacher can't.
    await addPerson(t, { name: "Rimas", token: tok(1), tabs: ["correction"] });
    await addPerson(t, { name: "Theo", token: tok(2), tabs: ["theory"] });
    const rimas = asPhone(t, tok(1));
    const theo = asPhone(t, tok(2));
    const c = await addStudent(t, "Chamath P", 10);
    await rimas.mutation(api.students.setPresent, { id: c, present: true, by: "attendance" });
    expect((await rimas.query(api.attendance.day, { day: TODAY })).length).toBe(3);
    await expect(theo.mutation(api.students.setPresent, { id: c, present: false, by: "attendance" })).rejects.toThrow(/needs the Correction tab/);
    await expect(theo.query(api.attendance.day, { day: TODAY })).rejects.toThrow(/needs the Correction tab/);
    const last = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "in").at(-1));
    expect(last).toMatchObject({ who: "Rimas", by: "attendance", name: "Chamath P" });
  });

  test("demo students in class have a visit; deleting the demo deletes their visits", async () => {
    const t = await setup();
    await t.mutation(api.demo.load, {});
    const st = await t.query(api.state.get, {});
    const inClass = st.students.filter((s) => s.present);
    expect(inClass).toHaveLength(13);
    expect(inClass.every((s) => s.lastInAt !== undefined && s.lastInAt <= START)).toBe(true);
    expect(st.students.find((s) => s.name === "Keerthi")!.lastInAt).toBeUndefined();
    expect(await t.query(api.attendance.day, { day: TODAY })).toHaveLength(13);
    await t.mutation(api.demo.remove, {});
    expect(await t.run(async (ctx) => (await ctx.db.query("attendance").collect()).length)).toBe(0);
  });
});
