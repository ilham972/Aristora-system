// Departments and each teacher's own app on the server (8 Nov 2026, his voice note): Settings → Roles saves a person's
// department, lead or not, her pages and the jobs they need (people.setRole, people.add); the Fighter and Master pages
// save each tap at once for the students she ticked, no call (desk.mark), only on her department's books; her
// department's consultation rings on its lead's phone and she sends him (calls.create `dept`, `toLead`; calls.send);
// the dashboard's "cleared today" counts each teacher's taps of that department (desk.today).

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { KNOWN_WORKBOOKS, levelOutOf } from "../convex/lib/book";
import { cleanPages, jobsFor, presetPages, withNeeds } from "../convex/lib/dept";
import type { MState } from "../convex/lib/master";
import schema from "../convex/schema";
import { addPerson, asOwner, asPhone } from "./helpers";

const modules = import.meta.glob("../convex/**/*.ts");
const G7U08 = KNOWN_WORKBOOKS[0].data;
const START = new Date("2026-11-09T16:00:00+05:30").getTime();
const MIN = 60_000;

const NILA = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwxyz";
const MEERA = "meera-phone-token-0123456789abcdefghijklmnopqrstuvw";
const RAJ = "raj-phone-token-0123456789abcdefghijklmnopqrstuvwxyz0";
const SANA = "sana-phone-token-0123456789abcdefghijklmnopqrstuvwxy";

async function setup() {
  const t = await asOwner(convexTest(schema, modules));
  await t.mutation(api.setup.ensure, {});
  return t;
}
type T = Awaited<ReturnType<typeof setup>>;

const unitId = (t: T, key: string) => t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
async function add(t: T, name: string, grade: number, stage: "fighter" | "master", key: string) {
  const id = await t.mutation(api.students.add, { name, grade, term: grade === 7 ? 1 : 2, stage, unitId: await unitId(t, key) });
  await t.mutation(api.students.setPresent, { id, present: true });
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
const userOf = (t: T, id: Id<"users">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const events = (t: T, kind: string) => t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === kind));

/** G7 U08 Level 1 corrected: Q3 and Q5 lost their marks, Q4 left blank ("?"): all three wait for the Master teacher. */
async function level1(t: T, id: Id<"students">) {
  const u08 = await unitId(t, "G7-U08");
  const l1 = G7U08.levels[0];
  const each = levelOutOf(G7U08, l1)!;
  const items = Array.from({ length: l1.to - l1.from + 1 }, (_, i) => {
    const q = l1.from + i;
    return q === 4 ? { q, got: 0, dk: true } : { q, got: q === 3 || q === 5 ? 0 : each[i] };
  });
  await t.mutation(api.workbook.correct, { studentId: id, unitId: u08, level: 1, items, by: "correction" });
  return u08;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the departments' rules (convex/lib/dept.ts)", () => {
  test("presets: his lead teacher's six; a consultation teacher's two; Management's three", () => {
    expect(presetPages("fighter", true)).toEqual(["dash", "fighter", "correction", "teach", "consult", "us"]);
    expect(presetPages("master", true)).toEqual(["dash", "master", "correction", "consult", "us"]);
    expect(presetPages("fighter", false)).toEqual(["consult", "us"]);
    expect(presetPages("management", false)).toEqual(["class", "correction", "us"]);
    expect(presetPages(undefined, false)).toEqual(["class", "us"]);
  });
  test("pages in their fixed places, once each, six at most; the jobs and extras they can't work without", () => {
    expect(cleanPages(["us", "fighter", "dash", "us", "nope"])).toEqual(["dash", "fighter", "us"]);
    expect(cleanPages(["dash", "class", "fighter", "master", "correction", "teach", "consult", "us"])).toHaveLength(6);
    expect(jobsFor(["dash", "fighter", "correction", "teach", "consult", "us"], false)).toEqual(["correction", "theory", "evaluation"]);
    expect(jobsFor(["class", "correction", "us"], true)).toEqual(["correction", "manager"]);
    // Fighter needs Theory and Evaluation; Teach one of them; Correction one of its modes; Consult its extra.
    expect(withNeeds(["fighter"], [], [])).toEqual({ tabs: ["theory", "evaluation"], can: [] });
    expect(withNeeds(["teach"], ["evaluation"], [])).toEqual({ tabs: ["evaluation"], can: [] });
    expect(withNeeds(["correction"], [], ["photos"])).toEqual({ tabs: [], can: ["photos"] });
    expect(withNeeds(["correction"], [], [])).toEqual({ tabs: ["correction"], can: [] });
    expect(withNeeds(["consult", "us"], [], ["reports"])).toEqual({ tabs: [], can: ["reports", "consult"] });
  });
});

describe("Settings → Roles (people.setRole, people.add)", () => {
  test("her department, lead, pages and jobs, at once on her phone; the owner's own app; back to the app of before", async () => {
    const t = await setup();
    const nila = await addPerson(t, { name: "Nila", token: NILA, tabs: ["theory"] });
    const phone = asPhone(t, NILA);
    expect((await phone.query(api.auth.me, {})).user).not.toHaveProperty("pages");

    await t.mutation(api.people.setRole, { id: nila, dept: "fighter", lead: true, pages: presetPages("fighter", true), tabs: ["correction"], can: ["photos"] });
    const u = await userOf(t, nila);
    expect(u).toMatchObject({ dept: "fighter", lead: true, pages: ["dash", "fighter", "correction", "teach", "consult", "us"] });
    // Her pages decide: Fighter = Theory + Evaluation, Correction (Class) kept, Consult's extra added.
    expect([u.tabs, u.can]).toEqual([["correction", "theory", "evaluation"], ["photos", "consult"]]);
    expect((await phone.query(api.auth.me, {})).user).toMatchObject({ dept: "fighter", lead: true, pages: u.pages });
    expect((await t.query(api.people.list, {})).find((p) => p._id === nila)).toMatchObject({ dept: "fighter", lead: true });
    // The Class tab knows she walks to the students (no room).
    expect((await phone.query(api.people.team, {})).find((p) => p._id === nila)).toMatchObject({ desk: true, dept: "fighter" });
    expect((await t.query(api.state.history, {})).some((e) => e.kind === "person-role")).toBe(true);

    // The wrong department's page, a lead with no department, no page at all: refused.
    await expect(t.mutation(api.people.setRole, { id: nila, dept: "fighter", pages: ["master"], tabs: [], can: [] })).rejects.toThrow(/Master department's/);
    await expect(t.mutation(api.people.setRole, { id: nila, lead: true, pages: ["consult"], tabs: [], can: [] })).rejects.toThrow(/department first/);
    await expect(t.mutation(api.people.setRole, { id: nila, dept: "fighter", pages: [], tabs: [], can: [] })).rejects.toThrow(/at least one page/);
    // Only the owner sets roles.
    await expect(phone.mutation(api.people.setRole, { id: nila, pages: ["us"], tabs: [], can: [] })).rejects.toThrow(/owner/);

    // The owner's own app: his pages only.
    const owner = await t.run(async (ctx) => (await ctx.db.query("users").collect()).find((x) => x.role === "owner")!._id);
    await t.mutation(api.people.setRole, { id: owner, pages: ["class", "correction", "fighter", "master", "us"], tabs: [], can: [] });
    expect((await t.query(api.auth.me, {})).user).toMatchObject({ role: "owner", pages: ["class", "fighter", "master", "correction", "us"] });

    // Back to the app of before: her jobs stay.
    await t.mutation(api.people.setRole, { id: nila, pages: [], tabs: [], can: [], reset: true });
    expect(await userOf(t, nila)).toMatchObject({ tabs: ["correction", "theory", "evaluation"] });
    expect((await userOf(t, nila)).pages).toBeUndefined();
    expect((await userOf(t, nila)).dept).toBeUndefined();
  });

  test("a new teacher added as a department's consultation teacher: no job needed", async () => {
    const t = await setup();
    const id = await t.mutation(api.people.add, { name: "Sana", tabs: [], can: [], dept: "master", lead: false, pages: ["consult", "us"] });
    expect(await userOf(t, id)).toMatchObject({ dept: "master", pages: ["consult", "us"], tabs: [], can: ["consult"] });
    expect((await userOf(t, id)).lead).toBeUndefined();
    // Without pages a job is still needed (the app of before).
    await expect(t.mutation(api.people.add, { name: "Ravi", tabs: [], can: [] })).rejects.toThrow(/at least one job/);
  });
});

describe("the Fighter and Master pages: each tap saved at once, no call (desk.mark)", () => {
  test("Explained for two at once; a blank too; → Theory and back; undo only what this sitting did; her history, score and card", async () => {
    const t = await setup();
    const meera = await addPerson(t, { name: "Meera", token: MEERA, tabs: ["theory", "evaluation"] });
    await t.mutation(api.people.setRole, { id: meera, dept: "master", lead: true, pages: presetPages("master", true), tabs: [], can: [] });
    const m = asPhone(t, MEERA);
    const a = await add(t, "Asha", 7, "master", "G7-U08");
    const b = await add(t, "Bala", 7, "master", "G7-U08");
    const u08 = await level1(t, a);
    await level1(t, b);
    const since = Date.now();
    vi.setSystemTime(Date.now() + MIN);

    // Q3 explained for both, at once.
    const r1 = await m.mutation(api.desk.mark, { unitId: u08, stage: "master", q: 3, what: "x", on: true, since, items: [{ studentId: a }, { studentId: b }], by: "evaluation" });
    expect(r1.items.map((x) => x.changed)).toEqual([true, true]);
    expect(r1.errors).toEqual([]);
    expect((await work(t, a, "G7-U08", "master")).m.q["3"].x).toBe(r1.at);
    // The blank (Q4) is explained like any wrong answer.
    await m.mutation(api.desk.mark, { unitId: u08, stage: "master", q: 4, what: "x", on: true, since, items: [{ studentId: a }], by: "evaluation" });
    expect((await work(t, a, "G7-U08", "master")).m.q["4"]).toMatchObject({ dk: true });
    expect((await work(t, a, "G7-U08", "master")).m.q["4"].x).toBeDefined();
    // Q5 to Theory for Bala (the Master department's own theory list), then taught, then back.
    await m.mutation(api.desk.mark, { unitId: u08, stage: "master", q: 5, what: "th", on: true, since, items: [{ studentId: b }], by: "evaluation" });
    expect((await work(t, b, "G7-U08", "master")).m.q["5"]).toMatchObject({ tb: "desk" });
    await m.mutation(api.desk.mark, { unitId: u08, stage: "master", q: 5, what: "tt", on: true, since, items: [{ studentId: b }], by: "theory" });
    expect((await work(t, b, "G7-U08", "master")).m.q["5"].tt).toBeDefined();
    await m.mutation(api.desk.mark, { unitId: u08, stage: "master", q: 5, what: "tt", on: false, since, items: [{ studentId: b }], by: "theory" });
    expect((await work(t, b, "G7-U08", "master")).m.q["5"].tt).toBeUndefined();
    // Tap again = back (Q3 for Asha only).
    await m.mutation(api.desk.mark, { unitId: u08, stage: "master", q: 3, what: "x", on: false, since, items: [{ studentId: a }], by: "evaluation" });
    expect((await work(t, a, "G7-U08", "master")).m.q["3"].x).toBeUndefined();
    expect((await work(t, b, "G7-U08", "master")).m.q["3"].x).toBeDefined();
    // What someone did before this sitting stays: Bala's Q3, in a sitting that started after it, can't be undone.
    const later = Date.now() + MIN;
    vi.setSystemTime(later + MIN);
    const r2 = await m.mutation(api.desk.mark, { unitId: u08, stage: "master", q: 3, what: "x", on: false, since: later, items: [{ studentId: b }], by: "evaluation" });
    expect(r2.errors[0]).toMatch(/Bala: Q3 was explained before/);
    expect((await work(t, b, "G7-U08", "master")).m.q["3"].x).toBeDefined();

    // Her history (at his desk), the student seen by Evaluation today, her room's score counts the questions.
    const desk = await events(t, "desk");
    expect(desk.map((e) => [e.name, e.q, e.value, e.stage, e.who])).toEqual([
      ["Asha", 3, "explained", "master", "Meera"],
      ["Bala", 3, "explained", "master", "Meera"],
      ["Asha", 4, "explained", "master", "Meera"],
      ["Bala", 5, "to-theory", "master", "Meera"],
      ["Bala", 5, "taught", "master", "Meera"],
    ]);
    expect((await events(t, "desk-undo")).map((e) => [e.name, e.value])).toEqual([
      ["Bala", "untaught"],
      ["Asha", "unexplained"],
    ]);
    expect((await t.run(async (ctx) => (await ctx.db.get(a))!)).seen?.evaluation).toBeDefined();

    // Cleared today (her dashboard): her taps on the department's books, undos taken off.
    const today = await m.query(api.desk.today, { dept: "master" });
    expect(today.total).toMatchObject({ x: 2, th: 1, tt: 0, students: 2 });
    expect(today.people).toEqual([{ name: "Meera", x: 2, th: 1, tt: 0, students: 2 }]);
    expect((await m.query(api.desk.today, { dept: "fighter" })).total).toMatchObject({ x: 0, th: 0, tt: 0 });
  });

  test("her department's books only; a theory book's Taught and wrong answers; refusals per student", async () => {
    const t = await setup();
    const nila = await addPerson(t, { name: "Nila", token: NILA, tabs: ["theory", "evaluation"] });
    await t.mutation(api.people.setRole, { id: nila, dept: "fighter", lead: true, pages: presetPages("fighter", true), tabs: [], can: [] });
    const n = asPhone(t, NILA);
    const ahamed = await add(t, "Ahamed", 11, "fighter", "G11-U13");
    const malik = await add(t, "Malik", 7, "master", "G7-U08");
    const u08 = await level1(t, malik);
    const u13 = await unitId(t, "G11-U13");
    const since = Date.now();
    // A workbook is the Master department's.
    await expect(n.mutation(api.desk.mark, { unitId: u08, stage: "master", q: 3, what: "x", on: true, since, items: [{ studentId: malik }], by: "evaluation" })).rejects.toThrow(
      /Master department's/,
    );
    // Taught: section A's teacher questions (1–4).
    for (const q of [1, 2, 3, 4]) await n.mutation(api.desk.mark, { unitId: u13, stage: "fighter", q, what: "tt", on: true, since, lesson: q === 1, items: [{ studentId: ahamed }], by: "theory" });
    const marks = (await work(t, ahamed, "G11-U13", "fighter")).marks as Record<string, { s: string }>;
    expect([1, 2, 3, 4].map((q) => marks[String(q)]?.s)).toEqual(["taught", "taught", "taught", "taught"]);
    // Then a wrong answer of his own question (Q5), explained at his desk; a teacher question can't be "explained".
    await t.mutation(api.marks.set, { studentId: ahamed, q: 5, s: "wrong", by: "correction" });
    await n.mutation(api.desk.mark, { unitId: u13, stage: "fighter", q: 5, what: "x", on: true, since, items: [{ studentId: ahamed }], by: "evaluation" });
    expect(((await work(t, ahamed, "G11-U13", "fighter")).marks as Record<string, { s: string }>)["5"].s).toBe("explained");
    const bad = await n.mutation(api.desk.mark, { unitId: u13, stage: "fighter", q: 1, what: "x", on: true, since, items: [{ studentId: ahamed }], by: "evaluation" });
    expect(bad.errors[0]).toMatch(/teacher question/);
    // A student with no work in that book: said, the others still saved.
    const r = await n.mutation(api.desk.mark, { unitId: u13, stage: "fighter", q: 6, what: "x", on: true, since, items: [{ studentId: malik }], by: "evaluation" });
    expect(r.errors).toEqual(["Malik has no work in U13"]);
    // Her score: the first Taught counted the lesson.
    const stats = await t.run(async (ctx) => (await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first())?.stats ?? {});
    expect(stats.theory).toMatchObject({ lessons: 1, qs: 4 });
    // Someone without Theory or Evaluation can't tap at all.
    await addPerson(t, { name: "Raj", token: RAJ, tabs: ["correction"] });
    await expect(asPhone(t, RAJ).mutation(api.desk.mark, { unitId: u13, stage: "fighter", q: 6, what: "x", on: true, since, items: [{ studentId: ahamed }] })).rejects.toThrow(
      /Theory tab or the Evaluation tab/,
    );
  });
});

describe("a department's consultation rings on its lead's phone", () => {
  test("Master has a lead: she sends him (Sent, Not now); another department's teacher can't; no lead: Correction, as before", async () => {
    const t = await setup();
    const meera = await addPerson(t, { name: "Meera", token: MEERA, tabs: ["theory", "evaluation"] });
    await t.mutation(api.people.setRole, { id: meera, dept: "master", lead: true, pages: presetPages("master", true), tabs: [], can: [] });
    const sana = await addPerson(t, { name: "Sana", token: SANA, tabs: [], can: ["consult"] });
    await t.mutation(api.people.setRole, { id: sana, dept: "master", lead: false, pages: ["consult", "us"], tabs: [], can: [] });
    const nila = await addPerson(t, { name: "Nila", token: NILA, tabs: ["theory", "evaluation"] });
    await t.mutation(api.people.setRole, { id: nila, dept: "fighter", lead: true, pages: presetPages("fighter", true), tabs: [], can: [] });
    const kumar = await add(t, "Kumar", 7, "master", "G7-U08");
    const ravi = await add(t, "Ravi", 7, "master", "G7-U08");
    await level1(t, kumar);

    // Sana (the consultation room) calls Kumar for Master: its lead sends him.
    const s = asPhone(t, SANA);
    const res = await s.mutation(api.calls.create, { studentIds: [kumar], room: "evaluation", kind: "evaluation", consult: true, dept: "master", by: "consult" });
    expect(res.toLead).toBe(true);
    const callId = res.created[0].callId;
    expect(await t.run(async (ctx) => (await ctx.db.get(callId))!)).toMatchObject({ consult: true, dept: "master", toLead: true, teacher: "Sana" });
    // The Fighter lead can't send it; the Master lead can.
    await expect(asPhone(t, NILA).mutation(api.calls.send, { callIds: [callId], by: "evaluation" })).rejects.toThrow(/department's lead/);
    expect((await asPhone(t, MEERA).mutation(api.calls.send, { callIds: [callId], by: "evaluation" })).sent).toBe(1);
    expect(await t.run(async (ctx) => (await ctx.db.get(callId))!)).toMatchObject({ status: "sent", walk: true });

    // Not now, and its undo, by the lead too.
    const res2 = await s.mutation(api.calls.create, { studentIds: [ravi], room: "evaluation", kind: "evaluation", consult: true, dept: "master", by: "consult" });
    const c2 = res2.created[0].callId;
    expect(await asPhone(t, MEERA).mutation(api.calls.decline, { callId: c2, by: "evaluation" })).toBe(true);
    expect(await asPhone(t, MEERA).mutation(api.calls.undoDecline, { callId: c2, by: "evaluation" })).toBe(true);

    // The Fighter department has no consultation teacher's call yet; with no lead at all, Correction sends (as before).
    await t.mutation(api.people.setRole, { id: nila, pages: [], tabs: [], can: [], reset: true });
    const ahamed = await add(t, "Ahamed", 11, "fighter", "G11-U13");
    const res3 = await t.mutation(api.calls.create, { studentIds: [ahamed], room: "evaluation", kind: "theory", consult: true, dept: "fighter", by: "consult" });
    expect(res3.toLead).toBe(false);
    const c3 = await t.run(async (ctx) => (await ctx.db.get(res3.created[0].callId))!);
    expect(c3.dept).toBe("fighter");
    expect(c3.toLead).toBeUndefined();
    // A department belongs to a consultation only.
    await expect(t.mutation(api.calls.create, { studentIds: [ravi], room: "evaluation", kind: "evaluation", dept: "master" })).rejects.toThrow(/Only a consultation/);
  });
});
