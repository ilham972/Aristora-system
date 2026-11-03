// The teachers' stays and cards on the server (3 Nov 2026, his ask: "arrived time and went time, all done by manager";
// "show the own work, and free time, how much better than other teachers, not including me"): the manager marks
// arrived / went (minutes ago, Undo, move the arrival), End the session closes the rest, each teacher reads only her own
// card (the manager and the owner everyone's), the others' average never has the owner or a manager in it.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-11-03T16:30:00+05:30").getTime();
const NILA_TOKEN = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx";
const FAT_TOKEN = "fathima-phone-token-0123456789abcdefghijklmnopqrstu";
const KAVI_TOKEN = "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwx";
const CORR_TOKEN = "corrector-phone-token-0123456789abcdefghijklmnopq";

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  const nila = await addPerson(t, { name: "Nila", token: NILA_TOKEN, tabs: ["evaluation"] });
  const fathima = await addPerson(t, { name: "Fathima", token: FAT_TOKEN, tabs: ["theory"] });
  const kaviId = await addPerson(t, { name: "Kavi", token: KAVI_TOKEN, tabs: ["correction", "manager"] });
  const corr = await addPerson(t, { name: "Corrector", token: CORR_TOKEN, tabs: ["correction"] });
  return { t, nila, fathima, kaviId, corr, kavi: asPhone(t, KAVI_TOKEN) };
}
type T = Awaited<ReturnType<typeof setup>>["t"];

async function unitId(t: T, key: string) {
  return await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
}
async function student(t: T, name: string) {
  const id = await t.mutation(api.students.add, { name, grade: 11, term: 2, stage: "fighter", unitId: await unitId(t, "G11-U13") });
  await t.mutation(api.students.setPresent, { id, present: true });
  for (const q of [1, 2, 3, 4]) await t.mutation(api.marks.set, { studentId: id, q, s: "taught" });
  await t.mutation(api.marks.set, { studentId: id, q: 5, s: "wrong" });
  return id;
}
const stays = (t: T) => t.run(async (ctx) => await ctx.db.query("duty").collect());
function advance(min: number) {
  vi.setSystemTime(Date.now() + min * MIN);
}
const minsAfter = (at: number | null | undefined) => (at == null ? null : Math.round((at - START) / MIN));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Arrived and went: the manager marks them", () => {
  test("arrived 10 minutes ago; twice is refused; went; back again later; the history names who marked", async () => {
    const { t, nila, kavi } = await setup();
    advance(10);
    const a = await kavi.mutation(api.duty.mark, { userId: nila, here: true, ago: 10 });
    expect(minsAfter(a.at)).toBe(0);
    await expect(kavi.mutation(api.duty.mark, { userId: nila, here: true })).rejects.toThrow("Nila is here since 4:30 PM.");
    advance(50);
    const w = await kavi.mutation(api.duty.mark, { userId: nila, here: false, ago: 5 });
    expect(minsAfter(w.at)).toBe(55);
    await expect(kavi.mutation(api.duty.mark, { userId: nila, here: false })).rejects.toThrow("Nila isn't marked here.");
    // She comes back: "arrived 30 minutes ago" can't be before she went.
    advance(10);
    const b = await kavi.mutation(api.duty.mark, { userId: nila, here: true, ago: 30 });
    expect(minsAfter(b.at)).toBe(55);
    expect((await stays(t)).map((r) => [minsAfter(r.inAt), minsAfter(r.outAt), r.inBy, r.outBy ?? null])).toEqual([
      [0, 55, "Kavi", "Kavi"],
      [55, null, "Kavi", null],
    ]);
    const lines = await t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "duty"));
    expect(lines.map((e) => [e.name, e.value, e.who])).toEqual([
      ["Nila", "in 4:30 PM", "Kavi"],
      ["Nila", "out 5:25 PM", "Kavi"],
      ["Nila", "in 5:25 PM", "Kavi"],
    ]);
  });

  test("managers and the owner only; never the owner himself, nor someone with no job", async () => {
    const { t, nila, kavi } = await setup();
    await expect(asPhone(t, NILA_TOKEN).mutation(api.duty.mark, { userId: nila, here: true })).rejects.toThrow(/the Manager tab/);
    await expect(asPhone(t, CORR_TOKEN).mutation(api.duty.mark, { userId: nila, here: true })).rejects.toThrow();
    const owner = (await t.query(api.auth.me, {})).user!._id;
    await expect(kavi.mutation(api.duty.mark, { userId: owner, here: true })).rejects.toThrow("Only a teacher with a job is marked here.");
    const rani = await addPerson(t, { name: "Rani", token: "rani-phone-token-0123456789abcdefghijklmnopqrstuvwx", tabs: ["manager"] });
    await expect(kavi.mutation(api.duty.mark, { userId: rani, here: true })).rejects.toThrow("Only a teacher with a job is marked here.");
    await expect(kavi.mutation(api.duty.mark, { userId: nila, here: true, ago: 121 })).rejects.toThrow("Between now and 120 minutes ago.");
    await t.mutation(api.duty.mark, { userId: nila, here: true });
    expect((await stays(t)).length).toBe(1);
  });

  test("Undo within 5 minutes: the arrival goes; went is taken back (she is here again)", async () => {
    const { t, nila, kavi } = await setup();
    const a = await kavi.mutation(api.duty.mark, { userId: nila, here: true });
    await kavi.mutation(api.duty.undo, { id: a.id, what: "in" });
    expect(await stays(t)).toEqual([]);
    const b = await kavi.mutation(api.duty.mark, { userId: nila, here: true });
    advance(20);
    await kavi.mutation(api.duty.mark, { userId: nila, here: false });
    await kavi.mutation(api.duty.undo, { id: b.id, what: "out" });
    expect((await stays(t))[0].outAt).toBeUndefined();
    await kavi.mutation(api.duty.mark, { userId: nila, here: false });
    advance(6);
    await expect(kavi.mutation(api.duty.undo, { id: b.id, what: "out" })).rejects.toThrow("Too late to take it back: mark it again.");
  });

  test("move today's arrival: earlier or later, never after she went nor into an earlier stay", async () => {
    const { t, nila, kavi } = await setup();
    advance(40);
    const a = await kavi.mutation(api.duty.mark, { userId: nila, here: true });
    const m = await kavi.mutation(api.duty.move, { id: a.id, minutes: -15 });
    expect(minsAfter(m.at)).toBe(25);
    // Later than now: stops at now.
    expect(minsAfter((await kavi.mutation(api.duty.move, { id: a.id, minutes: 60 })).at)).toBe(40);
    await expect(kavi.mutation(api.duty.move, { id: a.id, minutes: 5 })).rejects.toThrow("She can't have come later than that.");
    expect((await stays(t))[0].inBy).toBe("Kavi");
  });

  test("End the session: everyone still here goes with the class; a stay left open yesterday counts nothing", async () => {
    const { t, nila, fathima, kavi } = await setup();
    await student(t, "Ahamed");
    await kavi.mutation(api.duty.mark, { userId: nila, here: true });
    await kavi.mutation(api.duty.mark, { userId: fathima, here: true });
    advance(90);
    await t.mutation(api.sessions.end, {});
    expect((await stays(t)).map((r) => [minsAfter(r.outAt), r.outBy])).toEqual([
      [90, "class end"],
      [90, "class end"],
    ]);
    // A stay never closed (no class that day): marked again the next day, the old one ends where it began.
    await t.run(async (ctx) => ctx.db.patch((await ctx.db.query("duty").first())!._id, { outAt: undefined }));
    advance(24 * 60);
    await kavi.mutation(api.duty.mark, { userId: nila, here: true });
    const rows = (await stays(t)).filter((r) => r.userId === nila);
    expect(rows[0].outAt).toBe(rows[0].inAt);
    expect(rows[0].outBy).toBe("unknown");
    expect(rows[1].outAt).toBeUndefined();
  });

  test("the team on the Class tab: her stay today; everyone reads it", async () => {
    const { t, nila, kavi } = await setup();
    await kavi.mutation(api.duty.mark, { userId: nila, here: true });
    const team = await asPhone(t, CORR_TOKEN).query(api.people.team, {});
    const stay = team.find((u) => u.name === "Nila")!.stay!;
    expect([minsAfter(stay.inAt), stay.outAt]).toEqual([0, null]);
    expect(team.find((u) => u.name === "Fathima")!.stay).toBeNull();
  });
});

describe("Her card: today, her week, the others' average", () => {
  /** Nila (Evaluation) and Fathima (Theory) here from 4:30; Ahamed waits for Evaluation 4:40 → 4:50; Nila takes him. */
  async function aDay() {
    const s = await setup();
    const { t, nila, fathima, kavi } = s;
    const a = await student(t, "Ahamed");
    await kavi.mutation(api.duty.mark, { userId: nila, here: true });
    await kavi.mutation(api.duty.mark, { userId: fathima, here: true });
    advance(10);
    await t.run(async (ctx) => ctx.db.patch(a, { idleSince: Date.now(), idleReason: "evaluation" }));
    advance(10);
    const own = await asPhone(t, NILA_TOKEN).mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation" });
    const callId = own.created[0].callId;
    await kavi.mutation(api.calls.send, { callIds: [callId], by: "manager" });
    advance(1);
    await asPhone(t, NILA_TOKEN).mutation(api.calls.arrive, { callIds: [callId], by: "evaluation" });
    advance(5);
    await asPhone(t, NILA_TOKEN).mutation(api.calls.finish, { items: [{ callId, explained: [5] }], by: "evaluation" });
    advance(4);
    return s;
  }

  test("her own: here 30, working 6, free 24, of it 10 while Ahamed waited for her (after 2 minutes free)", async () => {
    const { t } = await aDay();
    const c = await asPhone(t, NILA_TOKEN).query(api.duty.card, { userId: (await t.query(api.people.team, {})).find((u) => u.name === "Nila")!._id });
    expect(c).toMatchObject({ name: "Nila", family: "room", own: true, manager: false });
    expect(c.stays.map((s) => [minsAfter(s.inAt), s.outAt])).toEqual([[0, null]]);
    const d = c.today!;
    expect([d.hereMin, d.workMin, d.freeMin, d.missedMin, d.students, d.visits]).toEqual([30, 6, 24, 10, 1, 1]);
    // Her bar: free, free while he waited, with him (from her call), free.
    expect(c.segs.map((x) => [x.k, minsAfter(x.s), minsAfter(x.e)])).toEqual([
      ["f", 0, 10],
      ["m", 10, 20],
      ["w", 20, 26],
      ["f", 26, 30],
    ]);
    // The others: Fathima (Theory: Ahamed wasn't waiting for her), never Kavi (a manager) nor the owner.
    expect(c.others.today).toMatchObject({ n: 1, workPct: 0, missedMin: 0 });
    expect(c.week.map((w) => w.day)).toEqual(["2026-11-03"]);
  });

  test("hers only: another teacher's card is refused; the manager and the owner read anyone's", async () => {
    const { t, nila, fathima, kavi } = await aDay();
    await expect(asPhone(t, FAT_TOKEN).query(api.duty.card, { userId: nila })).rejects.toThrow("Only your own card: the manager sees everyone's.");
    expect((await asPhone(t, FAT_TOKEN).query(api.duty.card, { userId: fathima })).today).toMatchObject({ hereMin: 30, freeMin: 30, missedMin: 0 });
    expect((await kavi.query(api.duty.card, { userId: nila })).own).toBe(false);
    expect((await t.query(api.duty.card, { userId: nila })).today?.missedMin).toBe(10);
    const owner = (await t.query(api.auth.me, {})).user!._id;
    await expect(t.query(api.duty.card, { userId: owner })).rejects.toThrow("Only teachers have a card.");
  });

  test("her week: a class that ended keeps her numbers (the report), and today's are read again", async () => {
    const { t, nila } = await aDay();
    await t.mutation(api.sessions.end, {});
    const report = await t.run(async (ctx) => (await ctx.db.query("sessions").first())!.report as { digest: { people: { name: string; hereMin?: number }[] } });
    expect(report.digest.people.find((p) => p.name === "Nila")?.hereMin).toBe(30);
    // The next day: yesterday from the report, nothing today yet.
    advance(24 * 60);
    const c = await asPhone(t, NILA_TOKEN).query(api.duty.card, { userId: nila });
    expect(c.today).toBeNull();
    expect(c.week.map((w) => [w.day, w.hereMin, w.missedMin])).toEqual([["2026-11-03", 30, 10]]);
    expect(c.others.week).toMatchObject({ n: 1, missedMin: 0 });
  });
});
