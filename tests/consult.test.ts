// The Consultation page's server side (5 Nov 2026, his ask): the owner or a Consultation person calls any student here to
// herself (calls.create with consult), Correction sends him, she taps Arrived, every Explained / → Theory / Taught is
// saved at once (consult.mark: only for a student with her, undo only for what this consultation did), Done records
// nothing more. Theory never bumps or pulls him from it. consult.totals counts every student's waiting work.

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { KNOWN_WORKBOOKS, levelOutOf } from "../convex/lib/book";
import type { MState } from "../convex/lib/master";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const G7U08 = KNOWN_WORKBOOKS[0].data;
const START = new Date("2026-11-05T16:00:00+05:30").getTime();
const MIN = 60_000;
/** A time saved just now (the convex-test clock adds about 1 ms per mutation). */
const now = (x: number | undefined) => x !== undefined && Math.abs(x - Date.now()) < 500;

const RANI = "rani-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const NILA = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const FATHIMA = "fathima-phone-token-0123456789abcdefghijklmnopqrstu";
const KAVI = "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type T = Awaited<ReturnType<typeof setup>>;

const unitId = (t: T, key: string) => t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
async function add(t: T, name: string, grade: number, stage: "fighter" | "master", key: string, present = true) {
  const id = await t.mutation(api.students.add, { name, grade, term: grade === 7 ? 1 : 2, stage, unitId: await unitId(t, key) });
  if (present) await t.mutation(api.students.setPresent, { id, present: true });
  return id;
}
const work = (t: T, id: Id<"students">, key: string, stage: "fighter" | "master") =>
  t.run(async (ctx) => {
    const u = (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!;
    const p = await ctx.db
      .query("progress")
      .withIndex("by_student_unit_stage", (q) => q.eq("studentId", id).eq("unitId", u._id).eq("stage", stage))
      .first();
    return { marks: p?.marks ?? {}, m: (p?.m ?? { q: {}, lv: {} }) as MState };
  });
const student = (t: T, id: Id<"students">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const callOf = (t: T, id: Id<"calls">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const stats = (t: T) => t.run(async (ctx) => (await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first())?.stats ?? {});
const events = (t: T, kind: string) => t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === kind));

/** G7 U08 Level 1 corrected: Q3 and Q5 lost their marks (Evaluation), Q4 "?" sent to Theory (a blank waits with the
 *  wrong answers since 8 Nov 2026: the corrector sends it). */
async function level1(t: T, id: Id<"students">) {
  const u08 = await unitId(t, "G7-U08");
  const l1 = G7U08.levels[0];
  const each = levelOutOf(G7U08, l1)!;
  const items = Array.from({ length: l1.to - l1.from + 1 }, (_, i) => {
    const q = l1.from + i;
    return q === 4 ? { q, got: 0, dk: true } : { q, got: q === 3 || q === 5 ? 0 : each[i] };
  });
  await t.mutation(api.workbook.correct, { studentId: id, unitId: u08, level: 1, items, by: "correction" });
  await t.mutation(api.workbook.toTheory, { studentId: id, unitId: u08, qs: [4], on: true, by: "correction" });
  return u08;
}

/** Called to herself, sent by Correction, arrived: he is with her. */
async function withHer(t: T, me: T, id: Id<"students">, kind: "evaluation" | "theory" = "evaluation") {
  const res = await me.mutation(api.calls.create, { studentIds: [id], room: "evaluation", kind, consult: true, by: "consult" });
  expect(res.rejected).toEqual([]);
  const callId = res.created[0].callId;
  await t.mutation(api.calls.send, { callIds: [callId], by: "correction" });
  await me.mutation(api.calls.arrive, { callIds: [callId], by: "consult" });
  return callId;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("who may hold a consultation", () => {
  test("the Consultation tick alone: call anyone here to herself, Arrived, Done; nothing else of the rooms", async () => {
    const t = await setup();
    const ravi = await add(t, "Ravi", 7, "master", "G7-U08"); // nothing waits for anyone: a check-in
    const absent = await add(t, "Sara", 7, "master", "G7-U08", false);
    await addPerson(t, { name: "Rani", token: RANI, tabs: [], can: ["consult"] });
    await addPerson(t, { name: "Kavi", token: KAVI, tabs: ["correction"] });
    const rani = asPhone(t, RANI);
    const kavi = asPhone(t, KAVI);

    // Without the tick: refused, with the words that say what to ask for.
    await expect(kavi.mutation(api.calls.create, { studentIds: [ravi], room: "evaluation", kind: "evaluation", consult: true, by: "consult" })).rejects.toThrow(/Consultation/);
    await expect(kavi.query(api.consult.totals, {})).rejects.toThrow(/Consultation/);
    // Never for someone else, never as a check-in, never in the theory room.
    await expect(rani.mutation(api.calls.create, { studentIds: [ravi], room: "evaluation", kind: "evaluation", consult: true, teacherId: await t.run(async (ctx) => (await ctx.db.query("users").first())!._id) })).rejects.toThrow(/yourself/);
    await expect(rani.mutation(api.calls.create, { studentIds: [ravi], room: "theory", kind: "theory", consult: true })).rejects.toThrow(/evaluation room/);

    // Ravi has nothing waiting: still called (a check-in by her); Sara isn't here.
    const res = await rani.mutation(api.calls.create, { studentIds: [ravi, absent], room: "evaluation", kind: "evaluation", consult: true, by: "consult" });
    expect(res.created.map((c) => c.studentId)).toEqual([ravi]);
    expect(res.rejected.map((r) => [r.name, r.reason])).toEqual([["Sara", "isn't signed in. Ask Correction to sign them in first"]]);
    const callId = res.created[0].callId;
    const c = await callOf(t, callId);
    expect(c).toMatchObject({ status: "requested", room: "evaluation", kind: "evaluation", consult: true, teacher: "Rani" });
    expect(c.ahead).toBeUndefined();
    // Never the room's score.
    expect((await stats(t)).evaluation).toBeUndefined();

    // Correction sends him; she says he arrived; Done ends it.
    await t.mutation(api.calls.send, { callIds: [callId], by: "correction" });
    await rani.mutation(api.calls.arrive, { callIds: [callId], by: "consult" });
    expect(now((await callOf(t, callId)).arrivedAt)).toBe(true);
    vi.setSystemTime(Date.now() + 12 * MIN);
    expect((await rani.mutation(api.calls.finish, { items: [{ callId }], by: "consult" })).done).toBe(1);
    const after = await callOf(t, callId);
    expect(after.status).toBe("done");
    const s = await student(t, ravi);
    expect(s.room).toBeUndefined();
    expect(now(s.consultAt)).toBe(true);
    expect(now(s.seen?.evaluation)).toBe(true); // seen by a teacher today: no "no teacher yet" dot
    expect((await stats(t)).evaluation).toBeUndefined();
    const done = await events(t, "done-consult");
    expect(done.map((e) => [e.name, e.value, e.by, e.who])).toEqual([["Ravi", "evaluation", "consult", "Rani"]]);
    expect(Math.abs(done[0].ms! - 12 * MIN)).toBeLessThan(500);

    // Another teacher's Evaluation call: the tick alone can't say he arrived, cancel or finish it.
    await addPerson(t, { name: "Nila", token: NILA, tabs: ["evaluation"] });
    const nila = asPhone(t, NILA);
    const malik = await add(t, "Malik", 7, "master", "G7-U08");
    await level1(t, malik);
    const hers = (await nila.mutation(api.calls.create, { studentIds: [malik], room: "evaluation", kind: "evaluation", by: "evaluation" })).created[0].callId;
    await expect(rani.mutation(api.calls.arrive, { callIds: [hers], by: "consult" })).rejects.toThrow();
    await expect(rani.mutation(api.calls.cancel, { callIds: [hers], by: "consult" })).rejects.toThrow(/own consultation/);
    await expect(rani.mutation(api.calls.finish, { items: [{ callId: hers }], by: "consult" })).rejects.toThrow();
    // ...nor mark his questions: he isn't with her.
    const u08 = await unitId(t, "G7-U08");
    await expect(rani.mutation(api.consult.mark, { studentId: malik, unitId: u08, stage: "master", q: 3, what: "x", on: true, by: "consult" })).rejects.toThrow(/isn't in your consultation/);
    // Nor the Evaluation page's own taps.
    await expect(rani.mutation(api.workbook.explain, { studentId: malik, unitId: u08, qs: [3], on: true, by: "consult" })).rejects.toThrow();
  });

  test("one call at a time: hers can't take a student another teacher has; nobody bumps, pulls or sends hers", async () => {
    const t = await setup();
    await addPerson(t, { name: "Nila", token: NILA, tabs: ["evaluation"] });
    await addPerson(t, { name: "Fathima", token: FATHIMA, tabs: ["theory"] });
    const nila = asPhone(t, NILA);
    const fathima = asPhone(t, FATHIMA);
    const malik = await add(t, "Malik", 7, "master", "G7-U08");
    const zara = await add(t, "Zara", 7, "master", "G7-U08");
    await level1(t, malik); // Q3 Q5 for Evaluation, Q4 for Theory
    await level1(t, zara);

    // Nila called Zara: the owner's consultation can't take her.
    await nila.mutation(api.calls.create, { studentIds: [zara], room: "evaluation", kind: "evaluation", by: "evaluation" });
    const r1 = await t.mutation(api.calls.create, { studentIds: [zara], room: "evaluation", kind: "evaluation", consult: true, by: "consult" });
    expect(r1.rejected.map((r) => r.reason)).toEqual(["is already called to Evaluation (Nila)"]);

    // The owner called Malik: Theory can't bump it (still requested), Evaluation can't take him, the manager can't send him.
    const mine = (await t.mutation(api.calls.create, { studentIds: [malik], room: "evaluation", kind: "evaluation", consult: true, by: "consult" })).created[0].callId;
    const th = await fathima.mutation(api.calls.create, { studentIds: [malik], room: "theory", kind: "theory", by: "theory" });
    expect(th.rejected.map((r) => r.reason)).toEqual(["is called to Owner (consultation)"]);
    expect((await callOf(t, mine)).status).toBe("requested");
    expect((await nila.mutation(api.calls.create, { studentIds: [malik], room: "evaluation", kind: "evaluation", by: "evaluation" })).rejected[0].reason).toBe(
      "is called to Owner (consultation)",
    );
    const fId = await t.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === "Fathima")!._id);
    expect((await t.mutation(api.calls.create, { studentIds: [malik], room: "theory", kind: "theory", teacherId: fId, by: "manager" })).rejected[0].reason).toBe(
      "is called to Owner (consultation)",
    );
    // With her: Theory still can't pull him.
    await t.mutation(api.calls.send, { callIds: [mine], by: "correction" });
    await t.mutation(api.calls.arrive, { callIds: [mine], by: "consult" });
    expect((await fathima.mutation(api.calls.create, { studentIds: [malik], room: "theory", kind: "theory", by: "theory" })).rejected[0].reason).toBe(
      "is with Owner (consultation)",
    );
    expect((await t.run(async (ctx) => await ctx.db.query("calls").collect())).filter((c) => c.pull)).toEqual([]);
  });
});

describe("her taps, saved at once", () => {
  test("a workbook: Explained, → Theory, switch, Taught, the whole unit; undo only what this consultation did", async () => {
    const t = await setup();
    const malik = await add(t, "Malik", 7, "master", "G7-U08");
    const u08 = await level1(t, malik);
    await t.mutation(api.workbook.explain, { studentId: malik, unitId: u08, qs: [5], on: true, by: "evaluation" }); // Q5: explained before
    vi.setSystemTime(Date.now() + MIN);
    const at = { studentId: malik, unitId: u08, stage: "master" as const, by: "consult" };

    // Called, not here yet: nothing can be marked.
    const res = await t.mutation(api.calls.create, { studentIds: [malik], room: "evaluation", kind: "evaluation", consult: true, by: "consult" });
    await expect(t.mutation(api.consult.mark, { ...at, q: 3, what: "x", on: true })).rejects.toThrow(/Arrived/);
    await t.mutation(api.calls.send, { callIds: [res.created[0].callId], by: "correction" });
    await expect(t.mutation(api.consult.mark, { ...at, q: 3, what: "x", on: true })).rejects.toThrow(/Arrived/);
    await t.mutation(api.calls.arrive, { callIds: [res.created[0].callId], by: "consult" });
    vi.setSystemTime(Date.now() + MIN);

    // Q3 explained: gone from Evaluation's list at once; the history says it.
    expect((await t.mutation(api.consult.mark, { ...at, q: 3, what: "x", on: true })).changed).toBe(true);
    let m = (await work(t, malik, "G7-U08", "master")).m;
    expect(now(m.q["3"].x)).toBe(true);
    // Again: nothing more. Off: back to waiting.
    expect((await t.mutation(api.consult.mark, { ...at, q: 3, what: "x", on: true })).changed).toBe(false);
    await t.mutation(api.consult.mark, { ...at, q: 3, what: "x", on: false });
    m = (await work(t, malik, "G7-U08", "master")).m;
    expect(m.q["3"].x).toBeUndefined();
    // Q5 was explained before this consultation: not hers to take back.
    await expect(t.mutation(api.consult.mark, { ...at, q: 5, what: "x", on: false })).rejects.toThrow(/before this consultation/);
    // A question with full marks: nothing to explain.
    await expect(t.mutation(api.consult.mark, { ...at, q: 6, what: "x", on: true })).rejects.toThrow(/hasn't lost marks/);

    // Q3 → Theory, then Explained after all (the same question switches), then → Theory again.
    await t.mutation(api.consult.mark, { ...at, q: 3, what: "th", on: true });
    m = (await work(t, malik, "G7-U08", "master")).m;
    expect([now(m.q["3"].th), m.q["3"].tb, m.q["3"].x]).toEqual([true, "consult", undefined]);
    await t.mutation(api.consult.mark, { ...at, q: 3, what: "x", on: true });
    m = (await work(t, malik, "G7-U08", "master")).m;
    expect([m.q["3"].th, now(m.q["3"].x)]).toEqual([undefined, true]);
    await t.mutation(api.consult.mark, { ...at, q: 3, what: "th", on: true });
    m = (await work(t, malik, "G7-U08", "master")).m;
    expect([m.q["3"].th !== undefined, m.q["3"].x]).toEqual([true, undefined]);
    await t.mutation(api.consult.mark, { ...at, q: 3, what: "th", on: false });
    expect((await work(t, malik, "G7-U08", "master")).m.q["3"].th).toBeUndefined();

    // Q4 ("?", sent to Theory by Correction before): Taught here, and back.
    await t.mutation(api.consult.mark, { ...at, q: 4, what: "tt", on: true });
    expect(now((await work(t, malik, "G7-U08", "master")).m.q["4"].tt)).toBe(true);
    await t.mutation(api.consult.mark, { ...at, q: 4, what: "tt", on: false });
    expect((await work(t, malik, "G7-U08", "master")).m.q["4"].tt).toBeUndefined();
    // Q4 was sent to Theory before: explaining it here would skip Theory's lesson without saying so.
    await expect(t.mutation(api.consult.mark, { ...at, q: 4, what: "x", on: true })).rejects.toThrow(/with Theory/);
    await expect(t.mutation(api.consult.mark, { ...at, q: 3, what: "tt", on: true })).rejects.toThrow(/isn't waiting for Theory/);

    // The whole unit asked for Theory: taught here, and back exactly as it was.
    await t.mutation(api.workbook.reteach, { studentId: malik, unitId: u08, on: true, by: "evaluation" });
    const asked = (await work(t, malik, "G7-U08", "master")).m.reteach!;
    const wu = await t.mutation(api.consult.mark, { ...at, q: 0, what: "wu", on: true });
    expect(wu.reteach).toEqual(asked);
    expect((await work(t, malik, "G7-U08", "master")).m.reteach).toBeUndefined();
    await t.mutation(api.consult.mark, { ...at, q: 0, what: "wu", on: false, reteach: wu.reteach });
    expect((await work(t, malik, "G7-U08", "master")).m.reteach).toEqual(asked);

    const ev = await events(t, "consult");
    expect(ev.map((e) => [e.q ?? null, e.value])).toEqual([
      [3, "explained"],
      [3, "unexplained"],
      [3, "to-theory"],
      [3, "explained"],
      [3, "to-theory"],
      [3, "to-theory-off"],
      [4, "taught"],
      [4, "untaught"],
      [null, "whole-unit"],
      [null, "whole-unit-off"],
    ]);
    expect(ev.every((e) => e.unit === "G7-U08" && e.who === "Owner" && e.by === "consult")).toBe(true);
    // None of it is the Evaluation room's score.
    expect((await stats(t)).evaluation).toBeUndefined();
  });

  test("a theory book: Explained, → Theory (its section back to Theory, undone exactly), Taught his next section", async () => {
    const t = await setup();
    const asha = await add(t, "Asha", 11, "fighter", "G11-U13");
    const u13 = await unitId(t, "G11-U13");
    // A and B taught; Q5 wrong twice, Q6 wrong, Q7 right; Q12 wrong.
    await t.mutation(api.marks.setMany, { studentId: asha, items: [1, 2, 3, 4, 9, 10, 11].map((q) => ({ q, s: "taught" as const })), by: "theory" });
    await t.mutation(api.marks.setMany, { studentId: asha, items: [{ q: 5, s: "wrong" }, { q: 6, s: "wrong" }, { q: 7, s: "right" }, { q: 12, s: "wrong" }], by: "correction" });
    await t.mutation(api.marks.set, { studentId: asha, q: 5, s: "right", by: "correction" });
    await t.mutation(api.marks.set, { studentId: asha, q: 5, s: "wrong", by: "correction" }); // wrong twice (n = 2)
    const before = (await work(t, asha, "G11-U13", "fighter")).marks;
    vi.setSystemTime(Date.now() + MIN);
    await withHer(t, t, asha);
    vi.setSystemTime(Date.now() + MIN);
    const at = { studentId: asha, unitId: u13, stage: "fighter" as const, by: "consult" };

    // Explained keeps how many times it was wrong; the same tap again puts it back exactly.
    const x = await t.mutation(api.consult.mark, { ...at, q: 5, what: "x", on: true });
    const m5 = (await work(t, asha, "G11-U13", "fighter")).marks["5"]!;
    expect([m5.s, m5.n, now(m5.t)]).toEqual(["explained", 2, true]);
    await t.mutation(api.consult.mark, { ...at, q: 5, what: "x", on: false, was: x.was });
    expect((await work(t, asha, "G11-U13", "fighter")).marks["5"]).toEqual(before["5"]);

    // Q12 → Theory: explained, and section B's teacher questions open again (Theory teaches B again); undone exactly.
    const th = await t.mutation(api.consult.mark, { ...at, q: 12, what: "th", on: true });
    let marks = (await work(t, asha, "G11-U13", "fighter")).marks;
    expect(marks["12"]?.s).toBe("explained");
    expect([marks["9"], marks["10"], marks["11"]]).toEqual([undefined, undefined, undefined]);
    await t.mutation(api.consult.mark, { ...at, q: 12, what: "th", on: false, was: th.was });
    marks = (await work(t, asha, "G11-U13", "fighter")).marks;
    expect([marks["9"], marks["10"], marks["11"], marks["12"]]).toEqual([before["9"], before["10"], before["11"], before["12"]]);

    // Taught: the next section's teacher questions (C: 15–17); only teacher questions; past papers can't go to Theory.
    await t.mutation(api.consult.mark, { ...at, q: 15, what: "tt", on: true });
    const m15 = (await work(t, asha, "G11-U13", "fighter")).marks["15"]!;
    expect([m15.s, now(m15.t)]).toEqual(["taught", true]);
    await expect(t.mutation(api.consult.mark, { ...at, q: 18, what: "tt", on: true })).rejects.toThrow(/teacher questions/);
    await expect(t.mutation(api.consult.mark, { ...at, q: 15, what: "x", on: true })).rejects.toThrow(/teacher question/);
    await t.mutation(api.consult.mark, { ...at, q: 15, what: "tt", on: false, was: [{ q: 15, mark: null }] });
    expect((await work(t, asha, "G11-U13", "fighter")).marks["15"]).toBeUndefined();
    await expect(t.mutation(api.consult.mark, { ...at, q: 0, what: "wu", on: true })).rejects.toThrow(/whole-unit/);
  });
});

describe("the board while the consultation lasts", () => {
  test("a book she worked on stays on the phones once nothing waits there (its squares stay ✓), until Done", async () => {
    const t = await setup();
    const u13 = await unitId(t, "G11-U13");
    const asha = await add(t, "Asha", 11, "fighter", "G11-U13");
    await t.mutation(api.marks.setMany, { studentId: asha, items: [1, 2, 3, 4].map((q) => ({ q, s: "taught" as const })), by: "theory" });
    await t.mutation(api.marks.setMany, { studentId: asha, items: [{ q: 5, s: "wrong" }], by: "correction" });
    // She moved on (her theory book is now "another book" of hers, with one wrong answer).
    await t.mutation(api.students.move, { id: asha, grade: 11, term: 2, stage: "master", unitId: u13 });
    const onBoard = async () => (((await t.query(api.state.get, {})) as { more: Record<string, { stage: string }[]> }).more[asha] ?? []).map((p) => p.stage);
    expect(await onBoard()).toEqual(["fighter"]);
    vi.setSystemTime(Date.now() + MIN);
    const callId = await withHer(t, t, asha);
    await t.mutation(api.consult.mark, { studentId: asha, unitId: u13, stage: "fighter", q: 5, what: "x", on: true, by: "consult" });
    expect(await onBoard()).toEqual(["fighter"]); // nothing waits there now: still on the board
    await t.mutation(api.calls.finish, { items: [{ callId }], by: "consult" });
    expect(await onBoard()).toEqual([]);
  });
});

describe("every student's waiting work", () => {
  test("Evaluation and Theory over every book of everyone not here (the phone adds those here), the simulation apart", async () => {
    const t = await setup();
    const malik = await add(t, "Malik", 7, "master", "G7-U08");
    const sara = await add(t, "Sara", 7, "master", "G7-U08");
    await add(t, "Ravi", 7, "master", "G7-U08"); // nothing waits
    const asha = await add(t, "Asha", 11, "fighter", "G11-U13", false); // not here: still counted
    await level1(t, malik); // Q3 Q5 Evaluation, Q4 Theory
    await level1(t, sara);
    const u08 = await unitId(t, "G7-U08");
    await t.mutation(api.workbook.explain, { studentId: sara, unitId: u08, qs: [3, 5], on: true, by: "evaluation" });
    await t.mutation(api.workbook.reteach, { studentId: sara, unitId: u08, on: true, by: "evaluation" }); // whole unit = 1
    await t.mutation(api.marks.setMany, { studentId: asha, items: [{ q: 1, s: "taught" }], by: "theory" });
    await t.run(async (ctx) => {
      // Asha (theory book, not here): two wrong answers in A after its lesson.
      const p = (await ctx.db
        .query("progress")
        .withIndex("by_student", (q) => q.eq("studentId", asha))
        .first())!;
      await ctx.db.patch(p._id, { marks: { ...p.marks, "2": { s: "taught", t: 1 }, "3": { s: "taught", t: 1 }, "4": { s: "taught", t: 1 }, "5": { s: "wrong", t: 1 }, "6": { s: "wrong", t: 1 } } });
    });

    // Those here count on the phone (live): the server counts the others. Asha isn't here: her two wrong answers and her
    // next section B (9–11).
    // Each department's books apart too (8 Nov 2026): Asha's theory book is the Fighter department's.
    const none = { evaluation: { qs: 0, students: 0 }, theory: { qs: 0, students: 0 } };
    expect(await t.query(api.consult.totals, {})).toEqual({
      evaluation: { qs: 2, students: 1 },
      theory: { qs: 3, students: 1 },
      fighter: { evaluation: { qs: 2, students: 1 }, theory: { qs: 3, students: 1 } },
      master: none,
    });
    // Everyone gone home: Malik 2 + Asha 2 to explain; Malik Q4 + Sara Q4 and her whole unit + Asha's B.
    for (const id of [malik, sara]) await t.mutation(api.students.setPresent, { id, present: false });
    expect(await t.query(api.consult.totals, {})).toEqual({
      evaluation: { qs: 4, students: 2 },
      theory: { qs: 6, students: 3 },
      fighter: { evaluation: { qs: 2, students: 1 }, theory: { qs: 3, students: 1 } },
      master: { evaluation: { qs: 2, students: 1 }, theory: { qs: 3, students: 2 } },
    });
    // The simulation's students count only on a phone showing the simulation.
    await t.run(async (ctx) => await ctx.db.patch(malik, { test: true }));
    expect((await t.query(api.consult.totals, {})).evaluation).toEqual({ qs: 2, students: 1 });
    expect((await t.query(api.consult.totals, { test: true })).evaluation).toEqual({ qs: 2, students: 1 });
  });
});
