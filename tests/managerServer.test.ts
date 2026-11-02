// The Manager page on the server (2 Nov 2026): the owner sends students straight to a teacher who has no phone, takes
// a wrong Send back, taps Back for her; the list of teachers he can send to.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const MIN = 60_000;
const START = new Date("2026-11-02T16:30:00+05:30").getTime();
const NILA_TOKEN = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx";

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  const nila = await addPerson(t, { name: "Nila", token: NILA_TOKEN, tabs: ["evaluation"] });
  const fathima = await addPerson(t, { name: "Fathima", token: "fathima-phone-token-0123456789abcdefghijklmnopqrstu", tabs: ["theory"] });
  await addPerson(t, { name: "Corrector", token: "corrector-phone-token-0123456789abcdefghijklmnopq", tabs: ["correction"] });
  return { t, nila, fathima };
}
type T = Awaited<ReturnType<typeof setup>>["t"];

async function unitId(t: T, key: string) {
  return await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
}
/** A Grade 11 student on the pilot theory book, signed in, with section A taught and Q5 wrong. */
async function wrongAt5(t: T, name: string) {
  const id = await t.mutation(api.students.add, { name, grade: 11, term: 2, stage: "fighter", unitId: await unitId(t, "G11-U13") });
  await t.mutation(api.students.setPresent, { id, present: true });
  for (const q of [1, 2, 3, 4]) await t.mutation(api.marks.set, { studentId: id, q, s: "taught" });
  await t.mutation(api.marks.set, { studentId: id, q: 5, s: "wrong" });
  return id;
}
const student = (t: T, id: Id<"students">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const call = (t: T, id: Id<"calls">) => t.run(async (ctx) => (await ctx.db.get(id))!);
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

describe("The manager sends students straight to a teacher", () => {
  test("Send: the call is hers, he is with her now (no walk, nothing for Correction to send)", async () => {
    const { t, nila } = await setup();
    const id = await wrongAt5(t, "Ahamed");
    const res = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila, here: true, by: "manager" });
    expect(res.rejected).toEqual([]);
    const c = await call(t, res.created[0].callId);
    expect(c).toMatchObject({ status: "sent", teacherId: nila, teacher: "Nila" });
    expect(c.arrivedAt).toBe(c.sentAt);
    expect(c.sentAt! - START).toBeLessThan(MIN);
    expect(c.walk).toBeUndefined();
    expect((await student(t, id)).room).toBe("evaluation");
    // Back (the owner taps it for her): explained, back in the hall.
    advance(4);
    await t.mutation(api.calls.finish, { items: [{ callId: c._id, explained: [5] }], by: "manager" });
    const s = await t.run(async (ctx) =>
      ctx.db
        .query("progress")
        .withIndex("by_student_unit_stage", (q) => q.eq("studentId", id))
        .first(),
    );
    expect(s!.marks["5"]).toMatchObject({ s: "explained" });
    expect((await student(t, id)).room).toBeUndefined();
  });

  test("never while another teacher has him", async () => {
    const { t, nila, fathima } = await setup();
    const id = await wrongAt5(t, "Ahamed");
    await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila, here: true });
    const again = await t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: fathima, here: true });
    expect(again.created).toEqual([]);
    expect(again.rejected[0].reason).toBe("is already with Evaluation (Nila)");
  });

  test("only the owner sends for another teacher", async () => {
    const { t, nila } = await setup();
    const id = await wrongAt5(t, "Ahamed");
    const asNila = asPhone(t, NILA_TOKEN);
    await expect(asNila.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila })).rejects.toThrow(
      /Only the owner/,
    );
    await expect(asNila.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", here: true })).rejects.toThrow(/Only the owner/);
    // Her own call, the usual way, still works.
    const own = await asNila.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation" });
    expect(own.created).toHaveLength(1);
  });

  test("a wrong Send is taken back within 2 minutes; later it is too late", async () => {
    const { t, nila } = await setup();
    const a = await wrongAt5(t, "Ahamed");
    const b = await wrongAt5(t, "Bilal");
    const one = await t.mutation(api.calls.create, { studentIds: [a], room: "evaluation", kind: "evaluation", teacherId: nila, here: true });
    advance(1);
    expect(await t.mutation(api.calls.unsend, { callIds: [one.created[0].callId] })).toEqual({ undone: 1 });
    expect((await call(t, one.created[0].callId)).status).toBe("cancelled");
    expect((await student(t, a)).room).toBeUndefined();
    const two = await t.mutation(api.calls.create, { studentIds: [b], room: "evaluation", kind: "evaluation", teacherId: nila, here: true });
    advance(3);
    await expect(t.mutation(api.calls.unsend, { callIds: [two.created[0].callId] })).rejects.toThrow(/Too late/);
    await expect(asPhone(t, NILA_TOKEN).mutation(api.calls.unsend, { callIds: [two.created[0].callId] })).rejects.toThrow();
  });

  test("a removed teacher can't be sent to", async () => {
    const { t, nila } = await setup();
    const id = await wrongAt5(t, "Ahamed");
    await t.run(async (ctx) => ctx.db.patch(nila, { active: false }));
    await expect(t.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind: "evaluation", teacherId: nila, here: true })).rejects.toThrow(
      /removed/,
    );
  });
});

describe("The teachers he can send to", () => {
  test("active teachers with Theory or Evaluation, by name; the owner only", async () => {
    const { t } = await setup();
    expect((await t.query(api.people.team, {})).map((u) => [u.name, u.tabs])).toEqual([
      ["Fathima", ["theory"]],
      ["Nila", ["evaluation"]],
    ]);
    await expect(asPhone(t, NILA_TOKEN).query(api.people.team, {})).rejects.toThrow();
  });
});
