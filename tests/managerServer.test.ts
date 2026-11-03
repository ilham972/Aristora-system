// The Manager page on the server (2 Nov 2026; the Manager job since 3 Nov): the manager sends students to a teacher
// (they walk there, her phone calls her until Arrived), check-ins, a wrong Send taken back, Correction's hall taps, the
// teachers he can send to, one student's day.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-11-03T16:30:00+05:30").getTime();
const NILA_TOKEN = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx";
const KAVI_TOKEN = "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwx";
const CORR_TOKEN = "corrector-phone-token-0123456789abcdefghijklmnopq";

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  const nila = await addPerson(t, { name: "Nila", token: NILA_TOKEN, tabs: ["evaluation", "theory"] });
  const fathima = await addPerson(t, { name: "Fathima", token: "fathima-phone-token-0123456789abcdefghijklmnopqrstu", tabs: ["theory"] });
  // The corrector who also manages (his hire, 3 Nov 2026), and one who only corrects.
  await addPerson(t, { name: "Kavi", token: KAVI_TOKEN, tabs: ["correction", "manager"] });
  await addPerson(t, { name: "Corrector", token: CORR_TOKEN, tabs: ["correction"] });
  return { t, nila, fathima, kavi: asPhone(t, KAVI_TOKEN) };
}
type T = Awaited<ReturnType<typeof setup>>["t"];

async function unitId(t: T, key: string) {
  return await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
}
/** A Grade 11 student on the pilot theory book, signed in, with section A taught and Q5 wrong (or nothing wrong). */
async function student(t: T, name: string, o: { wrong?: boolean } = {}) {
  const id = await t.mutation(api.students.add, { name, grade: 11, term: 2, stage: "fighter", unitId: await unitId(t, "G11-U13") });
  await t.mutation(api.students.setPresent, { id, present: true });
  for (const q of [1, 2, 3, 4]) await t.mutation(api.marks.set, { studentId: id, q, s: "taught" });
  if (o.wrong ?? true) await t.mutation(api.marks.set, { studentId: id, q: 5, s: "wrong" });
  return id;
}
const get = (t: T, id: Id<"students">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const call = (t: T, id: Id<"calls">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const marks = (t: T, id: Id<"students">) =>
  t.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", id)).first())!.marks);
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

describe("The manager sends students to a teacher", () => {
  test("Send: he walks to her (her call, by the manager), she taps Arrived on her phone, explains, Done", async () => {
    const { t, nila, kavi } = await setup();
    const id = await student(t, "Ahamed");
    const res = await kavi.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila, by: "manager" });
    expect(res.rejected).toEqual([]);
    const c = await call(t, res.created[0].callId);
    expect(c).toMatchObject({ status: "sent", walk: true, byManager: true, teacherId: nila, teacher: "Nila" });
    expect(c.arrivedAt).toBeUndefined();
    expect((await get(t, id)).room).toBe("evaluation");
    // Her phone: Arrived, then Explained + Done.
    const her = asPhone(t, NILA_TOKEN);
    advance(1);
    await her.mutation(api.calls.arrive, { callIds: [c._id], by: "evaluation" });
    advance(4);
    await her.mutation(api.calls.finish, { items: [{ callId: c._id, explained: [5] }], by: "evaluation" });
    expect((await marks(t, id))["5"]).toMatchObject({ s: "explained" });
    const s = await get(t, id);
    expect(s.room).toBeUndefined();
    expect(s.seen?.evaluation).toBe(Date.now());
  });

  test("the teacher needs that room's job; never while another teacher called him or has him", async () => {
    const { t, nila, fathima, kavi } = await setup();
    const a = await student(t, "Ahamed");
    await expect(kavi.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", teacherId: fathima })).rejects.toThrow(
      "Fathima doesn't do Evaluation. Settings → People → Fathima → tick Evaluation.",
    );
    // Nila calls him from her phone (not sent yet): the manager can't send him elsewhere; he sends Nila's call.
    const own = await asPhone(t, NILA_TOKEN).mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation" });
    const again = await kavi.mutation(api.calls.create, { studentIds: [a], room: "theory", kind: "theory", teacherId: fathima });
    expect(again.rejected[0].reason).toBe("is already called to Evaluation (Nila): send him there");
    await kavi.mutation(api.calls.send, { callIds: [own.created[0].callId], by: "manager" });
    const third = await kavi.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", teacherId: nila });
    expect(third.rejected[0].reason).toBe("is already with Evaluation (Nila)");
  });

  test("a check-in: nothing waits for a teacher, the manager sends him anyway; Done with nothing explained", async () => {
    const { t, nila, kavi } = await setup();
    const id = await student(t, "Sana", { wrong: false });
    // Not for a teacher otherwise: Evaluation would say he has nothing wrong.
    const plain = await kavi.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila });
    expect(plain.rejected[0].reason).toBe("has no wrong answers waiting");
    const res = await kavi.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila, visit: true });
    const c = await call(t, res.created[0].callId);
    expect(c).toMatchObject({ visit: true, byManager: true, status: "sent" });
    const her = asPhone(t, NILA_TOKEN);
    await her.mutation(api.calls.arrive, { callIds: [c._id] });
    advance(3);
    await her.mutation(api.calls.finish, { items: [{ callId: c._id, explained: [] }] });
    expect((await get(t, id)).seen?.evaluation).toBe(Date.now());
    const done = await t.run(async (ctx) => (await ctx.db.query("events").collect()).find((e) => e.kind === "done-evaluation"));
    expect(done?.value).toBe("check-in");
    // Check-ins are the manager's, in the evaluation room only.
    await expect(asPhone(t, NILA_TOKEN).mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", visit: true })).rejects.toThrow(
      /Only the manager/,
    );
    await expect(kavi.mutation(api.calls.create, { studentIds: [id], room: "theory", kind: "theory", teacherId: nila, visit: true })).rejects.toThrow(
      /evaluation room/,
    );
  });

  test("only a manager sends for a teacher (the Manager job, or the owner)", async () => {
    const { t, nila } = await setup();
    const id = await student(t, "Ahamed");
    for (const token of [NILA_TOKEN, CORR_TOKEN]) {
      await expect(asPhone(t, token).mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila })).rejects.toThrow(
        /Manager tab/,
      );
    }
    const owner = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila });
    expect(owner.created).toHaveLength(1);
  });

  test("a wrong Send is taken back within 2 minutes (the manager's own only); later it is too late", async () => {
    const { t, nila, kavi } = await setup();
    const a = await student(t, "Ahamed");
    const b = await student(t, "Bilal");
    const one = await kavi.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", teacherId: nila });
    advance(1);
    expect(await kavi.mutation(api.calls.unsend, { callIds: [one.created[0].callId] })).toEqual({ undone: 1 });
    expect((await call(t, one.created[0].callId)).status).toBe("cancelled");
    expect((await get(t, a)).room).toBeUndefined();
    // A teacher's own call, sent by Correction: not the manager's to take back.
    const own = await asPhone(t, NILA_TOKEN).mutation(api.calls.create, { studentIds: [b], room: "evaluation", kind: "evaluation" });
    await asPhone(t, CORR_TOKEN).mutation(api.calls.send, { callIds: [own.created[0].callId] });
    expect(await kavi.mutation(api.calls.unsend, { callIds: [own.created[0].callId] })).toEqual({ undone: 0 });
    const two = await kavi.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", teacherId: nila });
    advance(3);
    await expect(kavi.mutation(api.calls.unsend, { callIds: [two.created[0].callId] })).rejects.toThrow(/Too late/);
    await expect(asPhone(t, NILA_TOKEN).mutation(api.calls.unsend, { callIds: [two.created[0].callId] })).rejects.toThrow();
  });

  test("the manager does Correction's hall taps: Arrived for her, back to the hall when she forgot Done", async () => {
    const { t, nila, kavi } = await setup();
    const a = await student(t, "Ahamed");
    const res = await kavi.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", teacherId: nila });
    await kavi.mutation(api.calls.arrive, { callIds: [res.created[0].callId], by: "manager" });
    expect((await call(t, res.created[0].callId)).arrivedAt).toBeDefined();
    await kavi.mutation(api.calls.release, { studentId: a, by: "manager" });
    expect((await get(t, a)).room).toBeUndefined();
    // His wrong answer is still waiting (nothing was marked explained).
    expect((await marks(t, a))["5"]).toMatchObject({ s: "wrong" });
  });
});

describe("The owner teaches today (his switch), and the Manager job", () => {
  test("on: his room (Theory and Evaluation), the manager sends him students; off: gone; his only", async () => {
    const { t, kavi } = await setup();
    const me = async () => (await t.query(api.auth.me, {})).user!;
    expect((await me()).teaching).toBe(false);
    expect((await kavi.query(api.people.team, {})).map((u) => u.name)).toEqual(["Corrector", "Fathima", "Kavi", "Nila"]);
    await t.mutation(api.people.setTeaching, { on: true });
    expect((await me()).teaching).toBe(true);
    const team = await kavi.query(api.people.team, {});
    expect(team.map((u) => [u.name, u.role, u.tabs])).toEqual([
      ["Corrector", "teacher", ["correction"]],
      ["Fathima", "teacher", ["theory"]],
      ["Kavi", "teacher", ["correction", "manager"]],
      ["Nila", "teacher", ["evaluation", "theory"]],
      ["Owner", "owner", ["theory", "evaluation"]],
    ]);
    const owner = team.find((u) => u.role === "owner")!;
    const id = await student(t, "Ahamed");
    const res = await kavi.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: owner._id });
    expect(res.created).toHaveLength(1);
    await t.mutation(api.people.setTeaching, { on: false });
    expect((await kavi.query(api.people.team, {})).map((u) => u.name)).toEqual(["Corrector", "Fathima", "Kavi", "Nila"]);
    await expect(kavi.mutation(api.people.setTeaching, { on: true })).rejects.toThrow();
  });

  test("Manager with any job, or alone (the Class tab is in the bottom bar since 3 Nov 2026: no Correction needed)", async () => {
    const { t, nila } = await setup();
    await t.mutation(api.people.add, { name: "Rani", tabs: ["manager"], can: [] });
    await t.mutation(api.people.update, { id: nila, tabs: ["evaluation", "manager"] });
    const u = await t.run(async (ctx) => (await ctx.db.get(nila))!);
    expect(u.tabs).toEqual(["evaluation", "manager"]);
  });
});

describe("The teachers on the Class tab, and one student's day", () => {
  test("active teachers with a job; when her last student went back today; everyone may read it (3 Nov 2026)", async () => {
    const { t, nila, kavi } = await setup();
    expect((await kavi.query(api.people.team, {})).map((u) => [u.name, u.tabs, u.lastEnd, u.stay])).toEqual([
      ["Corrector", ["correction"], null, null],
      ["Fathima", ["theory"], null, null],
      ["Kavi", ["correction", "manager"], null, null],
      ["Nila", ["evaluation", "theory"], null, null],
    ]);
    const a = await student(t, "Ahamed");
    const res = await kavi.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", teacherId: nila });
    advance(5);
    await asPhone(t, NILA_TOKEN).mutation(api.calls.finish, { items: [{ callId: res.created[0].callId, explained: [5] }] });
    expect((await kavi.query(api.people.team, {})).find((u) => u.name === "Nila")?.lastEnd).toBe(Date.now());
    // The Class tab is everyone's (3 Nov 2026): the teachers read it too; only managers act.
    expect((await asPhone(t, NILA_TOKEN).query(api.people.team, {})).length).toBe(4);
    expect((await asPhone(t, CORR_TOKEN).query(api.people.team, {})).length).toBe(4);
  });

  test("his day: working, no work, walking, with Nila; anyone may read it (the Class tab)", async () => {
    const { t, nila, kavi } = await setup();
    const a = await student(t, "Ahamed");
    // He works 10 minutes, the last 6 with no work (out of work clock), then goes to Nila for 4 minutes.
    advance(10);
    await t.run(async (ctx) => ctx.db.patch(a, { idleSince: Date.now() - 6 * MIN, idleReason: "evaluation" }));
    const res = await kavi.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", teacherId: nila });
    advance(1);
    await asPhone(t, NILA_TOKEN).mutation(api.calls.arrive, { callIds: [res.created[0].callId] });
    advance(4);
    await asPhone(t, NILA_TOKEN).mutation(api.calls.finish, { items: [{ callId: res.created[0].callId, explained: [5] }] });
    advance(10);
    const d = await kavi.query(api.manager.day, { studentId: a });
    expect(d.segs.map((s) => [s.kind, s.teacher ?? ""])).toEqual([
      ["work", ""],
      ["idle", ""],
      ["walk", ""],
      ["evaluation", "Nila"],
      ["work", ""],
    ]);
    expect([d.contacts, d.teacherMs / MIN, d.walkMs / MIN]).toEqual([1, 4, 1]);
    expect((await asPhone(t, NILA_TOKEN).query(api.manager.day, { studentId: a })).contacts).toBe(1);
  });
});
