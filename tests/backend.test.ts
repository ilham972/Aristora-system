import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-10-27T14:00:00+05:30").getTime();

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type T = Awaited<ReturnType<typeof setup>>;

async function unitId(t: T, key: string) {
  return await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
}
/** A Grade 11 student on the pilot theory book (Fighter). */
async function addStudent(t: T, name: string) {
  return await t.mutation(api.students.add, { name, grade: 11, term: 2, stage: "fighter", unitId: await unitId(t, "G11-U13") });
}
async function addIn(t: T, name: string) {
  const id = await addStudent(t, name);
  await t.mutation(api.students.setPresent, { id, present: true });
  return id;
}
/** A Grade 7 student on the Directed numbers workbook (Master), signed in. */
async function addMaster(t: T, name: string) {
  const id = await t.mutation(api.students.add, { name, grade: 7, term: 1, stage: "master", unitId: await unitId(t, "G7-U08") });
  await t.mutation(api.students.setPresent, { id, present: true });
  return id;
}
async function teachSection(t: T, id: Id<"students">, qs: number[]) {
  for (const q of qs) await t.mutation(api.marks.set, { studentId: id, q, s: "taught" });
}
async function mark(t: T, id: Id<"students">, q: number, s: "right" | "wrong" | "slip" | "skip" | "explained" | null) {
  return await t.mutation(api.marks.set, { studentId: id, q, s });
}
/** The student, with his circles in his current book as `marks` and his workbook state as `m`. */
async function student(t: T, id: Id<"students">) {
  return await t.run(async (ctx) => {
    const s = (await ctx.db.get(id))!;
    const p =
      s.unitId && (s.stage === "fighter" || s.stage === "master")
        ? await ctx.db
            .query("progress")
            .withIndex("by_student_unit_stage", (q) => q.eq("studentId", id).eq("unitId", s.unitId!).eq("stage", s.stage as "fighter" | "master"))
            .first()
        : null;
    return { ...s, marks: p?.marks ?? {}, m: p?.m ?? { q: {}, lv: {} } };
  });
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
    const t = await setup();
    await addStudent(t, "Ahamed");
    await expect(addStudent(t, "  ahamed ")).rejects.toThrow(/already on the list/);
  });

  test("the first tap-in starts the session", async () => {
    const t = await setup();
    expect((await state(t)).session).toBeNull();
    await addIn(t, "Ahamed");
    expect((await state(t)).session).not.toBeNull();
  });

  test("removed students disappear from the board and can come back with progress", async () => {
    const t = await setup();
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
    const t = await setup();
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
    const t = await setup();
    const id = await addIn(t, "Ahamed");
    await expect(t.mutation(api.marks.set, { studentId: id, q: 5, s: "taught" })).rejects.toThrow(/ladder question/);
    await expect(t.mutation(api.marks.set, { studentId: id, q: 1, s: "right" })).rejects.toThrow(/teacher question/);
    await expect(t.mutation(api.marks.set, { studentId: id, q: 62, s: "right" })).rejects.toThrow(/not in this book/);
  });

  test("R2: skip a whole section's theory", async () => {
    const t = await setup();
    const id = await addIn(t, "Ahamed");
    await t.mutation(api.marks.skipSection, { studentId: id, section: "A" });
    const s = await student(t, id);
    expect([1, 2, 3, 4].map((q) => s.marks[String(q)]?.s)).toEqual(["skip", "skip", "skip", "skip"]);
  });
});

describe("calls between the rooms", () => {
  test("theory call: requested, sent by Correction, done records the theory and skips", async () => {
    const t = await setup();
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
    const t = await setup();
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
    const t = await setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    await mark(t, id, 5, "wrong");
    await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    expect(res.created).toHaveLength(0);
    expect(res.rejected[0].reason).toMatch(/theory comes first/);
  });

  test("theory first: a waiting evaluation call is cancelled when Theory calls", async () => {
    const t = await setup();
    const id = await addIn(t, "Ahamed");
    await teachSection(t, id, [1, 2, 3, 4]);
    await mark(t, id, 5, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    const th = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(th.created).toHaveLength(1);
    expect(th.created[0].pull).toBe(false);
    const evCall = await t.run((ctx) => ctx.db.get(ev.created[0].callId));
    expect(evCall?.status).toBe("cancelled");
    // Evaluation is told: the theory call says it took him from her.
    expect(th.created[0].bumped).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(th.created[0].callId)))?.bumped).toBe(true);
    // A theory call that took nobody from her says nothing.
    const other = await addIn(t, "Bilal");
    const plain = await t.mutation(api.calls.create, { studentIds: [other], room: "theory", kind: "theory" });
    expect(plain.created[0].bumped).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(plain.created[0].callId)))?.bumped).toBeUndefined();
  });

  test("each room's score for the class: calls, ahead, done, lessons, explained, and the waits for it", async () => {
    const t = await setup();
    const stats = async () =>
      await t.run(async (ctx) => (await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first())?.stats ?? {});
    // Ahamed has no work until A is taught: he waits for Theory from the moment he is signed in.
    const a = await addIn(t, "Ahamed");
    // Bilal has A taught: he still has work when Theory calls him (ahead).
    const b = await addIn(t, "Bilal");
    await teachSection(t, b, [1, 2, 3, 4]);
    advance(5);
    const { created } = await t.mutation(api.calls.create, { studentIds: [a, b], room: "theory", kind: "theory" });
    expect(created).toHaveLength(2);
    advance(2);
    await t.mutation(api.calls.send, { callIds: created.map((c) => c.callId) });
    let s = await stats();
    expect(s.theory).toMatchObject({ calls: 2, ahead: 1 });
    // Only Ahamed waited (7 min, the clock moves ~1 ms per mutation); Bilal had work.
    expect(Math.round(s.theory.waitMs / 1000)).toBe(7 * 60);
    expect(Math.round(s.theory.maxWaitMs / 1000)).toBe(7 * 60);
    advance(10);
    // One Done for both = one lesson: Ahamed is taught A (4 questions), Bilal his next section, B (3).
    await t.mutation(api.calls.finish, { items: created.map((c) => ({ callId: c.callId })) });
    s = await stats();
    expect(s.theory).toMatchObject({ calls: 2, ahead: 1, done: 2, lessons: 1, qs: 7 });
    // Evaluation: Bilal answers Q5 wrong, is called and explained.
    await mark(t, b, 5, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [b], room: "evaluation", kind: "evaluation" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    await t.mutation(api.calls.finish, { items: [{ callId: ev.created[0].callId, explained: [5] }] });
    s = await stats();
    expect(s.evaluation).toMatchObject({ calls: 1, ahead: 1, done: 1, qs: 1 });
    expect(s.theory.lessons).toBe(1); // her Done is not a Theory lesson
    // The board carries the scores to every phone.
    const board = await t.query(api.state.get, {});
    expect(board.session?.stats.theory.lessons).toBe(1);
  });

  test("how long Theory's lessons take: sent to Done in the theory room, newest first; Theory only", async () => {
    const t = await setup();
    for (const [name, min] of [["Ahamed", 9], ["Bilal", 13]] as const) {
      const id = await addIn(t, name);
      const { created } = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
      await t.mutation(api.calls.send, { callIds: [created[0].callId] });
      advance(min);
      await t.mutation(api.calls.finish, { items: [{ callId: created[0].callId, taught: [] }] });
    }
    // Evaluation teaching theory in her room is not Theory's lesson.
    const c = await addIn(t, "Chandran");
    const ev = await t.mutation(api.calls.create, { studentIds: [c], room: "evaluation", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    advance(30);
    await t.mutation(api.calls.finish, { items: [{ callId: ev.created[0].callId, taught: [] }] });
    const { ms } = await t.query(api.calls.lessons, {});
    expect(ms.map((x) => Math.round(x / MIN))).toEqual([13, 9]);
    const token = "eval-token-0123456789abcdefghijklmnopqrstuvwxyz";
    await addPerson(t, { name: "Eve", token, tabs: ["evaluation"] });
    await expect(asPhone(t, token).query(api.calls.lessons, {})).rejects.toThrow();
  });

  test("theory pulls from the evaluation room: half-done evaluation, the rest stays waiting", async () => {
    const t = await setup();
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
    const t = await setup();
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
    const t = await setup();
    const absent = await addStudent(t, "Keerthi");
    const id = await addIn(t, "Ahamed");
    const r1 = await t.mutation(api.calls.create, { studentIds: [absent], room: "theory", kind: "theory" });
    expect(r1.rejected[0].reason).toMatch(/signed in/);
    const r2 = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    expect(r2.rejected[0].reason).toMatch(/no wrong answers/);
    await t.mutation(api.marks.skipSection, { studentId: id, section: "A" });
    for (const s of ["B", "C", "D", "E", "F"]) await t.mutation(api.marks.skipSection, { studentId: id, section: s });
    const r3 = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    expect(r3.rejected[0].reason).toMatch(/no theory left/);
  });

  test("R11: Not now sends the call back; cancel works before he is sent", async () => {
    const t = await setup();
    const a = await addIn(t, "Ahamed");
    const b = await addIn(t, "Fathima");
    const res = await t.mutation(api.calls.create, { studentIds: [a, b], room: "theory", kind: "theory" });
    expect(await t.mutation(api.calls.decline, { callId: res.created[0].callId })).toBe(true);
    expect(await t.mutation(api.calls.decline, { callId: res.created[0].callId })).toBe(false); // already done
    await t.mutation(api.calls.cancel, { callIds: [res.created[1].callId] });
    expect((await state(t)).calls).toHaveLength(0);
  });

  test("Not now can be undone, unless something else happened since", async () => {
    const t = await setup();
    const a = await addIn(t, "Ahamed");
    const b = await addIn(t, "Fathima");
    const res = await t.mutation(api.calls.create, { studentIds: [a, b], room: "theory", kind: "theory" });
    const [ca, cb] = res.created.map((c) => c.callId);
    await t.mutation(api.calls.decline, { callId: ca });
    expect(await t.mutation(api.calls.undoDecline, { callId: ca })).toBe(true);
    const calls = (await state(t)).calls;
    expect(calls.map((c) => c.status)).toEqual(["requested", "requested"]);
    expect(calls[0].endedAt).toBeUndefined();
    expect(await t.mutation(api.calls.undoDecline, { callId: ca })).toBe(false); // not declined any more

    // Fathima: declined, then Evaluation calls her -> the old call can't come back.
    await t.mutation(api.calls.decline, { callId: cb });
    await mark(t, b, 5, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [b], room: "evaluation", kind: "evaluation" });
    expect(ev.created).toHaveLength(1);
    expect(await t.mutation(api.calls.undoDecline, { callId: cb })).toBe(false);
  });

  test("R12: Back in hall closes a forgotten sitting; a pending pull becomes a normal call", async () => {
    const t = await setup();
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
    const t = await setup();
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
    const t = await setup();
    const id = await addIn(t, "Ahamed");
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [res.created[0].callId] });
    await t.mutation(api.students.setPresent, { id, present: false });
    const s = await student(t, id);
    expect(s.room).toBeUndefined();
    expect((await state(t)).calls).toHaveLength(0);
  });

  test("Arrived: sent to Theory he walks until Theory taps Arrived; the lesson's time starts there", async () => {
    const t = await setup();
    const a = await addIn(t, "Ahamed");
    const b = await addIn(t, "Bilal");
    const res = await t.mutation(api.calls.create, { studentIds: [a, b], room: "theory", kind: "theory" });
    const [ca, cb] = res.created.map((c) => c.callId);
    await t.mutation(api.calls.send, { callIds: [ca] });
    const call = async (id: Id<"calls">) => (await t.run((ctx) => ctx.db.get(id)))!;
    expect(await call(ca)).toMatchObject({ status: "sent", walk: true });
    expect((await call(ca)).arrivedAt).toBeUndefined();
    expect((await student(t, a)).room).toBe("theory");
    advance(2);
    expect(await t.mutation(api.calls.arrive, { callIds: [ca] })).toEqual({ arrived: 1, skipped: [] });
    const arrivedAt = (await call(ca)).arrivedAt!;
    expect(arrivedAt).toBeGreaterThan(START + 2 * MIN - 1000);
    // Tapping Arrived again changes nothing.
    expect((await t.mutation(api.calls.arrive, { callIds: [ca] })).arrived).toBe(0);
    // Bilal came by himself before Correction tapped Sent: sent and here at once.
    expect((await t.mutation(api.calls.arrive, { callIds: [cb] })).arrived).toBe(1);
    expect(await call(cb)).toMatchObject({ status: "sent", walk: true });
    expect((await call(cb)).arrivedAt).toBeDefined();
    expect((await student(t, b)).room).toBe("theory");
    // The lesson took 10 minutes from Arrived (not 12 from Sent).
    advance(10);
    await t.mutation(api.calls.finish, { items: [{ callId: ca, taught: [] }] });
    const { ms } = await t.query(api.calls.lessons, {});
    expect(Math.round(ms[0] / MIN)).toBe(10);
    // The history says when each one got there.
    const hist = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "arrived"));
    expect(hist.map((e) => [e.name, Math.round((e.ms ?? 0) / MIN)])).toEqual([
      ["Ahamed", 2],
      ["Bilal", 0],
    ]);
  });

  test("Arrived on the wrong name can be taken back at once; later it can't", async () => {
    const t = await setup();
    const a = await addIn(t, "Ahamed");
    const res = await t.mutation(api.calls.create, { studentIds: [a], room: "theory", kind: "theory" });
    const id = res.created[0].callId;
    await t.mutation(api.calls.send, { callIds: [id] });
    await t.mutation(api.calls.arrive, { callIds: [id] });
    expect(await t.mutation(api.calls.unarrive, { callId: id })).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(id)))!.arrivedAt).toBeUndefined();
    expect(await t.mutation(api.calls.unarrive, { callId: id })).toBe(false); // not arrived any more
    await t.mutation(api.calls.arrive, { callIds: [id] });
    advance(3);
    await expect(t.mutation(api.calls.unarrive, { callId: id })).rejects.toThrow(/Too late/);
  });

  test("never got there: Theory's 'Not coming' or Correction's 'In the hall' ends the walk; he is back in the hall", async () => {
    const t = await setup();
    const a = await addIn(t, "Ahamed");
    const res = await t.mutation(api.calls.create, { studentIds: [a], room: "theory", kind: "theory" });
    const id = res.created[0].callId;
    await t.mutation(api.calls.send, { callIds: [id] });
    advance(4);
    expect(await t.mutation(api.calls.cancel, { callIds: [id] })).toBe(true);
    expect((await t.run((ctx) => ctx.db.get(id)))!.status).toBe("cancelled");
    expect((await student(t, a)).room).toBeUndefined();
    const ev = await t.run(async (ctx) => (await ctx.db.query("events").collect()).find((e) => e.kind === "not-reached"));
    expect(ev).toMatchObject({ name: "Ahamed", value: "theory" });
    expect(Math.round((ev?.ms ?? 0) / MIN)).toBe(4);
    // Back on Theory's list: she can call him again.
    expect((await t.mutation(api.calls.create, { studentIds: [a], room: "theory", kind: "theory" })).created).toHaveLength(1);
    // Once he is there, cancel no longer ends the call (Done or Send back does).
    const again = (await state(t)).calls[0]._id;
    await t.mutation(api.calls.send, { callIds: [again] });
    await t.mutation(api.calls.arrive, { callIds: [again] });
    await t.mutation(api.calls.cancel, { callIds: [again] });
    expect((await t.run((ctx) => ctx.db.get(again)))!.status).toBe("sent");
  });

  test("Evaluation's calls don't walk; who may tap Arrived", async () => {
    const t = await setup();
    const a = await addIn(t, "Ahamed");
    await teachSection(t, a, [1, 2, 3, 4]);
    await mark(t, a, 5, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    expect((await t.run((ctx) => ctx.db.get(ev.created[0].callId)))!.walk).toBeUndefined();
    // A Theory call: Theory and Correction may say he is there; an Evaluation-only teacher may not.
    const b = await addIn(t, "Bilal");
    const th = await t.mutation(api.calls.create, { studentIds: [b], room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [th.created[0].callId] });
    const eve = "eval-token-0123456789abcdefghijklmnopqrstuvwxyz";
    const cor = "corr-token-0123456789abcdefghijklmnopqrstuvwxyz";
    await addPerson(t, { name: "Eve", token: eve, tabs: ["evaluation"] });
    await addPerson(t, { name: "Cora", token: cor, tabs: ["correction"] });
    await expect(asPhone(t, eve).mutation(api.calls.arrive, { callIds: [th.created[0].callId], by: "evaluation" })).rejects.toThrow();
    expect((await asPhone(t, cor).mutation(api.calls.arrive, { callIds: [th.created[0].callId], by: "correction" })).arrived).toBe(1);
  });
});

describe("idle minutes and the session report", () => {
  test("idle counts only while he sits in the hall with nothing to do", async () => {
    const t = await setup();
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
    const t = await setup();
    const ids = [await addIn(t, "A1"), await addIn(t, "A2"), await addIn(t, "A3")];
    const res = await t.mutation(api.calls.create, { studentIds: ids, room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: res.created.map((c) => c.callId) });
    advance(8);
    await t.mutation(api.calls.finish, { items: res.created.map((c) => ({ callId: c.callId })) });
    const report = await t.mutation(api.sessions.end, {});
    expect(report.theory).toMatchObject({ sittings: 1, students: 3, avgMin: 8 });
  });

  test("wrong rate and evaluation stats", async () => {
    const t = await setup();
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
    const t = await setup();
    await addIn(t, "Ahamed"); // idle from START
    advance(30);
    await addStudent(t, "Fathima"); // last activity is still the tap-in
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
    const t = await setup();
    await t.mutation(api.demo.load, {});
    const st = await state(t);
    expect(st.students).toHaveLength(14);
    expect(st.students.filter((s) => s.present)).toHaveLength(13);
    expect(new Set(st.students.map((s) => s.grade))).toEqual(new Set([7, 9, 11]));
    expect(Object.keys(st.progress)).toHaveLength(13); // Legend has no book yet
    await expect(t.mutation(api.demo.load, {})).rejects.toThrow(/empty class/);
    const real = await addStudent(t, "Real Student");
    expect(await t.mutation(api.demo.remove, {})).toBe(14);
    const after = await state(t);
    expect(after.students.map((s) => s._id)).toEqual([real]);
    const left = await t.run(async (ctx) => (await ctx.db.query("progress").collect()).length);
    expect(left).toBe(1); // only the real student's
  });

  test("demo idle clocks start for students out of work", async () => {
    const t = await setup();
    await t.mutation(api.demo.load, {});
    const st = await state(t);
    const idle = st.students.filter((s) => s.idleSince !== undefined).map((s) => s.name).sort();
    expect(idle).toEqual(["Fathima", "Rizwan", "Vimal"]); // Vimal: every level handed in, waiting for correction
  });
});

describe("taps on the board (batches)", () => {
  test("a burst saves only final states; wrong counts once; undo restores all", async () => {
    const t = await setup();
    const id = await addIn(t, "Ahamed");
    const res1 = await t.mutation(api.marks.setMany, {
      studentId: id,
      items: [
        { q: 1, s: "taught" },
        { q: 2, s: "taught" },
        { q: 3, s: "taught" },
        { q: 4, s: "taught" },
      ],
    });
    expect(res1.prev.map((p) => p.mark)).toEqual([null, null, null, null]);
    const res2 = await t.mutation(api.marks.setMany, {
      studentId: id,
      items: [
        { q: 5, s: "right" },
        { q: 6, s: "wrong" },
        { q: 7, s: "slip" },
        { q: 8, s: null },
      ],
    });
    expect(res2.prev.map((p) => p.q)).toEqual([5, 6, 7]); // 8 unchanged
    let s = await student(t, id);
    expect(s.marks["6"]).toMatchObject({ s: "wrong", n: 1 });
    await t.mutation(api.marks.restoreMany, { studentId: id, items: res2.prev });
    s = await student(t, id);
    expect([5, 6, 7].map((q) => s.marks[String(q)])).toEqual([undefined, undefined, undefined]);
    expect(s.marks["1"]?.s).toBe("taught");
  });

  test("bad items are refused before anything is saved", async () => {
    const t = await setup();
    const id = await addIn(t, "Ahamed");
    await expect(
      t.mutation(api.marks.setMany, { studentId: id, items: [{ q: 1, s: "taught" }, { q: 5, s: "taught" }] }),
    ).rejects.toThrow(/ladder question/);
    expect((await student(t, id)).marks["1"]).toBeUndefined();
  });

  test("Done without data sends back without marking anything", async () => {
    const t = await setup();
    const id = await addIn(t, "Ahamed");
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory" });
    await t.mutation(api.calls.send, { callIds: [res.created[0].callId] });
    await t.mutation(api.marks.setMany, { studentId: id, items: [{ q: 1, s: "taught" }, { q: 2, s: "taught" }] });
    await t.mutation(api.calls.finish, { items: [{ callId: res.created[0].callId, taught: [], skip: [] }] });
    const s = await student(t, id);
    expect([1, 2, 3, 4].map((q) => s.marks[String(q)]?.s)).toEqual(["taught", "taught", undefined, undefined]);
    expect(s.room).toBeUndefined();
  });
});
