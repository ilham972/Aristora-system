import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { fighter, type FighterData, type MasterData } from "../convex/lib/book";
import { computeMaster, type MState } from "../convex/lib/master";
import { computeStatus } from "../convex/lib/status";
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

  test("Evaluation's calls walk too; who may tap Arrived", async () => {
    const t = await setup();
    const a = await addIn(t, "Ahamed");
    await teachSection(t, a, [1, 2, 3, 4]);
    await mark(t, a, 5, "wrong");
    const ev = await t.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation" });
    await t.mutation(api.calls.send, { callIds: [ev.created[0].callId] });
    expect((await t.run((ctx) => ctx.db.get(ev.created[0].callId)))!.walk).toBe(true);
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
    // Her own call: Evaluation says he is there.
    expect((await asPhone(t, eve).mutation(api.calls.arrive, { callIds: [ev.created[0].callId], by: "evaluation" })).arrived).toBe(1);
  });

  test("each teacher her own room (31 Oct 2026): a call carries who called; the others are told whose he is", async () => {
    const t = await setup();
    const nila = "nila-token-0123456789abcdefghijklmnopqrstuvwxyz";
    const sara = "sara-token-0123456789abcdefghijklmnopqrstuvwxyz";
    const fat = "fath-token-0123456789abcdefghijklmnopqrstuvwxyz";
    await addPerson(t, { name: "Nila", token: nila, tabs: ["evaluation"] });
    await addPerson(t, { name: "Sara", token: sara, tabs: ["evaluation"] });
    await addPerson(t, { name: "Fathima", token: fat, tabs: ["theory"] });
    const a = await addIn(t, "Ahamed");
    await teachSection(t, a, [1, 2, 3, 4]);
    await mark(t, a, 5, "wrong");
    const ev = await asPhone(t, nila).mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", by: "evaluation" });
    const call = async (id: Id<"calls">) => (await t.run((ctx) => ctx.db.get(id)))!;
    expect(await call(ev.created[0].callId)).toMatchObject({ teacher: "Nila" });
    // Sara can't call him too: he is Nila's.
    const again = await asPhone(t, sara).mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", by: "evaluation" });
    expect(again.rejected[0].reason).toBe("is already called to Evaluation (Nila)");
    // Theory first: Fathima's call cancels Nila's request and remembers it was Nila's (only her phone says so).
    const th = await asPhone(t, fat).mutation(api.calls.create, { studentIds: [a], room: "theory", kind: "theory", by: "theory" });
    expect(th.created).toHaveLength(1);
    const c = await call(th.created[0].callId);
    expect(c).toMatchObject({ teacher: "Fathima", bumped: true });
    expect(c.bumpedFrom).toBe((await call(ev.created[0].callId)).teacherId);
    expect((await call(ev.created[0].callId)).status).toBe("cancelled");
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

describe("the test class (31 Oct 2026): test students only phones in test mode see", () => {
  test("a grade copied: the same book, levels and books given, signed in; copying again starts over", async () => {
    const t = await setup();
    const malik = await addMaster(t, "Malik R");
    const items = Array.from({ length: 10 }, (_, i) => ({ q: i + 1, got: i + 1 === 4 ? 0 : 2 }));
    await t.mutation(api.workbook.correct, { studentId: malik, level: 1, items, by: "correction" });
    await t.mutation(api.workbook.levelDone, { studentId: malik, level: 2, by: "correction" });
    const u09 = await unitId(t, "G7-U09");
    await t.mutation(api.students.setGiven, { id: malik, unitId: u09, stage: "master", given: true });
    await t.mutation(api.students.setPresent, { id: malik, present: false }); // he went home: his copy is in class anyway
    await addIn(t, "Nila"); // Grade 11: not copied
    expect(await t.mutation(api.demo.copyGrade, { grade: 7 })).toBe(1);

    // The real class never sees the test class (only how many there are).
    const real = await state(t);
    expect(real.students.map((s) => s.name).sort()).toEqual(["Malik R", "Nila"]);
    expect(real.tests).toBe(1);
    // The test class: the copy only, signed in, on Malik's book with Malik's levels and his books given.
    const st = await t.query(api.state.get, { test: true });
    expect(st.students.map((s) => s.name)).toEqual(["Malik R test"]);
    const copy = st.students[0];
    expect(copy).toMatchObject({ test: true, demo: true, copyOf: malik, present: true, grade: 7, stage: "master", unitId: await unitId(t, "G7-U08") });
    expect(st.progress[copy._id].m).toEqual(real.progress[malik].m);
    expect(st.given[copy._id]).toEqual([{ unitId: u09, stage: "master", work: true, done: false }]);
    expect(st.session).not.toBeNull();
    expect(await t.query(api.demo.testInfo, {})).toEqual({ real: { "7": 1, "11": 1 }, copies: { "7": 1 }, cases: 0, tests: 1 });

    // His copy explained (a test); copying again starts over from the real Malik.
    await t.run(async (ctx) => {
      const p = (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", copy._id)).collect())[0];
      await ctx.db.patch(p._id, { m: { q: {}, lv: {} } });
    });
    expect(await t.mutation(api.demo.copyGrade, { grade: 7 })).toBe(1);
    const again = await t.query(api.state.get, { test: true });
    expect(again.students).toHaveLength(1);
    expect(again.students[0]._id).not.toBe(copy._id);
    expect(again.progress[again.students[0]._id].m).toEqual(real.progress[malik].m);
    expect((await student(t, malik)).m.lv["2"]?.done).toBeDefined(); // the real Malik untouched
    await expect(t.mutation(api.demo.copyGrade, { grade: 9 })).rejects.toThrow(/No Grade 9 students/);
  });

  test("the extra test students: one for each situation; their calls never count; deleting them leaves the class", async () => {
    const t = await setup();
    await addIn(t, "Real R");
    expect(await t.mutation(api.demo.cases, {})).toBe(32); // 13 theory-book + 19 workbook (no grade with two workbooks here)
    const st = await t.query(api.state.get, { test: true });
    expect(st.students).toHaveLength(32);
    const by = (name: string) => st.students.find((s) => s.name === name)!;
    // Minutes ago (the test clock moves a few ms inside each mutation).
    const ago = (at: number | undefined) => Math.round((Date.now() - at!) / MIN);
    // Each test student is in the situation his name says.
    const books = await t.run(async (ctx) => await ctx.db.query("books").collect());
    const fbook = books.find((b) => b.stage === "fighter")!.data as FighterData;
    const wbook = books.find((b) => b.stage === "master")!.data as MasterData;
    const f = (name: string) => computeStatus(st.progress[by(name)._id].marks, fighter(fbook));
    const m = (name: string) => computeMaster(st.progress[by(name)._id].m as MState, wbook);
    expect([f("No work D").nextTheory, f("No work D").dry]).toEqual(["D", true]);
    expect([ago(by("No work D").idleSince), ago(by("Starving D").idleSince)]).toEqual([6, 25]);
    expect([f("Soon D").left, f("Later D").left]).toEqual([2, 5]);
    expect(ago(by("Seen D").seen?.theory)).toBe(40);
    expect(ago(by("Home soon").lastInAt)).toBe(115);
    expect([f("No work C").nextTheory, f("No work C").dry]).toEqual(["C", true]);
    expect([f("Ready 20").pending, f("Ready 20").left]).toEqual([[20], 2]);
    expect(f("Fresh 21").pending).toEqual([21]);
    expect(f("Stuck 19").stuck).toEqual([19]);
    expect([f("Stopped C").blocked, f("Stopped C").dry]).toEqual([["C"], true]);
    expect(by("In Eval D").room).toBe("evaluation");
    expect(st.calls.map((c) => `${st.students.find((s) => s._id === c.studentId)!.name} ${c.status} ${c.arrivedAt ? "here" : ""}`.trim()).sort()).toEqual([
      "Eval called requested",
      "In Eval D sent here",
    ]);
    expect(st.calls.every((c) => c.test && c.teacher === "Owner")).toBe(true);
    for (const x of ["a", "b", "c"]) expect(m(`Lost 4·9 ${x}`).pending).toEqual([4, 9]);
    expect(ago(m("Lost 4·9 c").pendingAt!)).toBe(5); // not ready yet
    expect([m("Lost 13 a").pending, m("Lost 13·17").pending]).toEqual([[13], [13, 17]]);
    for (let i = 1; i <= 7; i++) expect(m(`Crowd ${i}`).pending).toEqual([2]);
    expect([m("All done 51").pending, m("All done 51").dry]).toEqual([[51], true]);
    expect([m("Theory 13·17").theory, m("Theory 13").theory, m("Theory 13·17").pending]).toEqual([[13, 17], [13], []]);
    expect([m("Whole unit").wholeUnit, m("Whole unit").current?.n]).toEqual([true, 4]);
    expect([m("Couldn't 4").theory, m("Couldn't 4").dry, m("Couldn't 4").pending]).toEqual([[4], true, []]);
    expect([by("Gone home").present, m("Gone home").waiting.map((l) => l.n)]).toEqual([false, [2]]);
    expect(by("No work D").testCase).toMatch(/^Theory: needs section D/);

    // The real class: none of them, none of their calls.
    const real = await state(t);
    expect(real.students.map((s) => s.name)).toEqual(["Real R"]);
    expect(real.calls).toHaveLength(0);
    // A test student called: his call is a test call, never in the room's score.
    const c = await t.mutation(api.calls.create, { studentIds: [by("Ready 20")._id], room: "evaluation", kind: "evaluation" });
    expect(c.created).toHaveLength(1);
    expect((await state(t)).session?.stats?.evaluation?.calls ?? 0).toBe(0);
    await t.mutation(api.calls.finish, { items: [{ callId: c.created[0].callId, explained: [20] }] });
    expect((await state(t)).session?.stats?.evaluation?.done ?? 0).toBe(0);
    // The class report: the real student only.
    const report = await t.mutation(api.sessions.end, {});
    expect(report.students.map((r: { name: string }) => r.name)).toEqual(["Real R"]);

    // Delete: the demo button leaves them; the test class's button deletes them all and everything of theirs.
    expect(await t.mutation(api.demo.remove, {})).toBe(0);
    expect(await t.mutation(api.demo.remove, { test: true })).toBe(32);
    expect((await t.query(api.state.get, { test: true })).students).toHaveLength(0);
    expect((await state(t)).students.map((s) => s.name)).toEqual(["Real R"]);
    const left = await t.run(async (ctx) => ({
      progress: (await ctx.db.query("progress").collect()).length,
      calls: (await ctx.db.query("calls").collect()).length,
      visits: (await ctx.db.query("attendance").collect()).length,
    }));
    expect(left).toEqual({ progress: 1, calls: 0, visits: 1 });
  });

  test("only the owner makes or deletes test students; the 120 limit counts real students only", async () => {
    const raw = convexTest(schema, modules);
    const t = await asOwner(raw);
    await t.mutation(api.setup.ensure, {});
    await addPerson(raw, { name: "Nila", token: "nila-token-0123456789abcdefghijklmnopqrstuvwxyz", tabs: ["evaluation"], can: ["students"] });
    const nila = asPhone(raw, "nila-token-0123456789abcdefghijklmnopqrstuvwxyz");
    await expect(nila.mutation(api.demo.cases, {})).rejects.toThrow(/owner/);
    await expect(nila.mutation(api.demo.copyGrade, { grade: 7 })).rejects.toThrow(/owner/);
    await expect(nila.mutation(api.demo.remove, { test: true })).rejects.toThrow(/owner/);
    await expect(nila.query(api.demo.testInfo, {})).rejects.toThrow(/owner/);
    await t.mutation(api.demo.cases, {});
    // 32 test students don't fill the class list: a teacher can still add real students.
    await nila.mutation(api.students.add, { name: "New R", grade: 7 });
    expect((await t.query(api.state.get, {})).students.map((s) => s.name)).toEqual(["New R"]);
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
