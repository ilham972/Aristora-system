import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-10-27T14:00:00+05:30").getTime();

function setup() {
  return convexTest(schema, modules);
}
type T = ReturnType<typeof setup>;

async function addIn(t: T, name: string) {
  const id = await t.mutation(api.students.add, { name });
  await t.mutation(api.students.setPresent, { id, present: true });
  return id;
}
async function teachSection(t: T, id: Id<"students">, qs: number[]) {
  for (const q of qs) await t.mutation(api.marks.set, { studentId: id, q, s: "taught" });
}
async function mark(t: T, id: Id<"students">, q: number, s: "right" | "wrong" | "slip" | "skip" | "explained" | null) {
  return await t.mutation(api.marks.set, { studentId: id, q, s });
}
async function student(t: T, id: Id<"students">) {
  return await t.run(async (ctx) => (await ctx.db.get(id))!);
}
async function state(t: T) {
  return await t.query(api.state.get, {});
}
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

describe("students and attendance", () => {
  test("duplicate names are refused, case-insensitive", async () => {
    const t = setup();
    await t.mutation(api.students.add, { name: "Ahamed" });
    await expect(t.mutation(api.students.add, { name: "  ahamed " })).rejects.toThrow(/already on the list/);
  });

  test("the first tap-in starts the session", async () => {
    const t = setup();
    expect((await state(t)).session).toBeNull();
    await addIn(t, "Ahamed");
    expect((await state(t)).session).not.toBeNull();
  });

  test("removed students disappear from the board and can come back with progress", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    await t.mutation(api.students.setArchived, { id, archived: true });
    expect((await state(t)).students).toHaveLength(0);
    await t.mutation(api.students.setArchived, { id, archived: false });
    const s = await student(t, id);
    expect(s.present).toBe(false);
    expect(s.marks["1"]?.s).toBe("taught");
  });
});

describe("marking", () => {
  test("wrong counts up; the same tap twice changes nothing; undo restores exactly", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    await mark(t, id, 5, "wrong");
    const again = await mark(t, id, 5, "wrong");
    expect(again.changed).toBe(false);
    await mark(t, id, 5, "explained");
    const res = await mark(t, id, 5, "wrong");
    expect((await student(t, id)).marks["5"]).toMatchObject({ s: "wrong", n: 2 });
    await t.mutation(api.marks.restore, { studentId: id, q: 5, mark: res.prev });
    expect((await student(t, id)).marks["5"]).toMatchObject({ s: "explained", n: 1 });
  });

  test("a ladder question can't be 'taught' and a teacher question can't be 'right'", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await expect(t.mutation(api.marks.set, { studentId: id, q: 5, s: "taught" })).rejects.toThrow(/ladder question/);
    await expect(t.mutation(api.marks.set, { studentId: id, q: 1, s: "right" })).rejects.toThrow(/teacher question/);
    await expect(t.mutation(api.marks.set, { studentId: id, q: 62, s: "right" })).rejects.toThrow(/not in this unit/);
  });

  test("R2: skip a whole section's theory", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await t.mutation(api.marks.skipSection, { studentId: id, section: "A" });
    const s = await student(t, id);
    expect([1, 2, 3, 4].map((q) => s.marks[String(q)]?.s)).toEqual(["skip", "skip", "skip", "skip"]);
  });
});

describe("calls between the rooms", () => {
  test("theory call: requested, sent by Correction, done records the theory and skips", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    const { created } = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(created).toHaveLength(1);
    await t.mutation(api.calls.send, { callIds: [created[0].callId] });
    expect((await student(t, id)).room).toBe("theory");
    advance(6);
    await t.mutation(api.calls.finish, { items: [{ callId: created[0].callId, taught: [1, 2, 3, 4], skip: [7] }] });
    const s = await student(t, id);
    expect(s.room).toBeUndefined();
    expect(s.marks["4"]?.s).toBe("taught");
    expect(s.marks["7"]?.s).toBe("skip");
    expect(s.lastSeenAt).toBe(Date.now());
  });

  test("R1: unticked teacher questions stay on the theory list", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    const { created } = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [created[0].callId] });
    await t.mutation(api.calls.finish, { items: [{ callId: created[0].callId, taught: [1, 2] }] });
    const s = await student(t, id);
    expect(s.marks["2"]?.s).toBe("taught");
    expect(s.marks["3"]).toBeUndefined();
    const again = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(again.created).toHaveLength(1);
  });

  test("first call wins: evaluation can't take a student Theory has called", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    await mark(t, id, 5, "wrong");
    await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    expect(res.created).toHaveLength(0);
    expect(res.rejected[0].reason).toMatch(/theory comes first/);
  });

  test("theory first: a waiting evaluation call is cancelled when Theory calls", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    await mark(t, id, 5, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(th.created).toHaveLength(1);
    expect(th.created[0].pull).toBe(false);
    const evCall = await t.run((ctx) => ctx.db.get(ev.created[0].callId));
    expect(evCall?.status).toBe("cancelled");
  });

  test("theory pulls from the evaluation room: half-done evaluation, the rest stays waiting", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    for (const q of [5, 6, 7]) await mark(t, id, q, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(th.created[0].pull).toBe(true);
    // Correction can't send him: he's in the evaluation room.
    const tried = await t.mutation(api.calls.send, { callIds: [th.created[0].callId] });
    expect(tried.sent).toBe(0);
    // Evaluation explains 5 and 6, then sends him straight to Theory.
    await t.mutation(api.calls.finish, { items: [{ callId: ev.created[0].callId, explained: [5, 6] }] });
    const s = await student(t, id);
    expect(s.marks["5"]?.s).toBe("explained");
    expect(s.marks["7"]?.s).toBe("wrong");
    expect(s.room).toBe("theory");
    const thCall = await t.run((ctx) => ctx.db.get(th.created[0].callId));
    expect(thCall?.status).toBe("sent");
  });

  test("the evaluation teacher can teach theory when Theory is busy", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [res.created[0].callId] });
    // Theory can't also call him for theory now.
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(th.rejected[0].reason).toMatch(/already getting theory/);
    await t.mutation(api.calls.finish, { items: [{ callId: res.created[0].callId }] });
    expect((await student(t, id)).marks["1"]?.s).toBe("taught");
  });

  test("calls are refused for absent students, no theory left, or nothing to explain", async () => {
    const t = setup();
    const absent = await t.mutation(api.students.add, { name: "Keerthi" });
    const id = await addIn(t, "Ahamed");
    const r1 = await t.mutation(api.calls.create, { studentIds: [absent], room: "theory", kind: "theory" });
    expect(r1.rejected[0].reason).toMatch(/tapped in/);
    const r2 = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    expect(r2.rejected[0].reason).toMatch(/no wrong answers/);
    await t.mutation(api.marks.skipSection, { studentId: id, section: "A" });
    for (const s of ["B", "C", "D", "E", "F"]) await t.mutation(api.marks.skipSection, { studentId: id, section: s });
    const r3 = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(r3.rejected[0].reason).toMatch(/no theory left/);
  });

  test("R11: Not now sends the call back; cancel works before he is sent", async () => {
    const t = setup();
    const a = await addIn(t, "Ahamed");
    const b = await addIn(t, "Fathima");
    const res = await t.mutation(api.calls.create, { studentIds: [a, b], room: "theory", kind: "theory" });
    await t.mutation(api.calls.decline, { callId: res.created[0].callId });
    await t.mutation(api.calls.cancel, { callIds: [res.created[1].callId] });
    expect((await state(t)).calls).toHaveLength(0);
  });

  test("R12: Back in hall closes a forgotten sitting; a pending pull becomes a normal call", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    await mark(t, id, 5, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    await t.mutation(api.calls.release, { studentId: id });
    expect((await student(t, id)).room).toBeUndefined();
    const sent = await t.mutation(api.calls.send, { callIds: [th.created[0].callId] });
    expect(sent.sent).toBe(1);
  });

  test("re-teach sends the section back to the theory list", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    for (const q of [5, 6, 7]) await mark(t, id, q, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    await t.mutation(api.calls.finish, { items: [{ callId: ev.created[0].callId, explained: [5, 6, 7], reteach: "A" }] });
    const s = await student(t, id);
    expect(s.marks["1"]).toBeUndefined();
    expect(s.marks["5"]?.s).toBe("explained");
  });

  test("tapping a student out cancels his calls", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [res.created[0].callId] });
    await t.mutation(api.students.setPresent, { id, present: false });
    const s = await student(t, id);
    expect(s.room).toBeUndefined();
    expect((await state(t)).calls).toHaveLength(0);
  });
});

describe("idle minutes and the session report", () => {
  test("idle counts only while he sits in the hall with nothing to do", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed"); // new: needs A theory -> idle from now
    advance(7);
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    advance(1); // still waiting in the hall while the call is pending
    await t.mutation(api.calls.send, { callIds: [res.created[0].callId] });
    advance(5); // with the teacher: not idle
    await t.mutation(api.calls.finish, { items: [{ callId: res.created[0].callId }] });
    advance(20); // busy with 5-8
    for (const q of [5, 6, 7, 8]) await mark(t, id, q, "right");
    advance(3); // out of work again (needs B)
    const report = await t.mutation(api.sessions.end, {});
    expect(report.idleMin).toBe(11);
    expect(report.idleTheoryMin).toBe(11);
    expect(report.theory).toMatchObject({ sittings: 1, students: 1, avgMin: 5 });
    expect(report.marks).toEqual({ right: 4, wrong: 0, slip: 0 });
    const s = await student(t, id);
    expect(s.present).toBe(false);
    expect(s.idleSince).toBeUndefined();
    expect(s.idleMs).toBe(0);
  });

  test("a group of 3 taught together counts as one sitting", async () => {
    const t = setup();
    const ids = [await addIn(t, "A1"), await addIn(t, "A2"), await addIn(t, "A3")];
    const res = await t.mutation(api.calls.create, { studentIds: ids, room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: res.created.map((c) => c.callId) });
    advance(8);
    await t.mutation(api.calls.finish, { items: res.created.map((c) => ({ callId: c.callId })) });
    const report = await t.mutation(api.sessions.end, {});
    expect(report.theory).toMatchObject({ sittings: 1, students: 3, avgMin: 8 });
  });

  test("wrong rate and evaluation stats", async () => {
    const t = setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    await mark(t, id, 5, "right");
    await mark(t, id, 6, "wrong");
    await mark(t, id, 7, "slip");
    await mark(t, id, 8, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    advance(4);
    await t.mutation(api.calls.finish, { items: [{ callId: ev.created[0].callId, explained: [6, 8] }] });
    const report = await t.mutation(api.sessions.end, {});
    expect(report.wrongRate).toBe(50);
    expect(report.evaluation).toMatchObject({ sittings: 1, explained: 2, avgMin: 4 });
  });

  test("a session left open is closed by the next class, idle capped at the last activity", async () => {
    const t = setup();
    await addIn(t, "Ahamed"); // idle from START
    advance(30);
    await t.mutation(api.students.add, { name: "Fathima" }); // last activity is still the tap-in
    advance(60 * 24 * 2); // two days later
    await addIn(t, "Nila");
    const sessions = await t.query(api.state.sessions, {});
    expect(sessions).toHaveLength(1);
    expect(sessions[0].report.idleMin).toBe(0);
    const ahamed = (await state(t)).students.find((s) => s.name === "Ahamed")!;
    expect(ahamed.present).toBe(false);
  });
});

describe("demo students", () => {
  test("load only into an empty class; remove deletes only demo students", async () => {
    const t = setup();
    await t.mutation(api.demo.load, {});
    const st = await state(t);
    expect(st.students).toHaveLength(10);
    expect(st.students.filter((s) => s.present)).toHaveLength(9);
    await expect(t.mutation(api.demo.load, {})).rejects.toThrow(/empty class/);
    const real = await t.mutation(api.students.add, { name: "Real Student" });
    expect(await t.mutation(api.demo.remove, {})).toBe(10);
    const after = await state(t);
    expect(after.students.map((s) => s._id)).toEqual([real]);
  });

  test("demo idle clocks start for students out of work", async () => {
    const t = setup();
    await t.mutation(api.demo.load, {});
    const st = await state(t);
    const idle = st.students.filter((s) => s.idleSince !== undefined).map((s) => s.name).sort();
    expect(idle).toEqual(["Fathima", "Rizwan"]);
  });
});
