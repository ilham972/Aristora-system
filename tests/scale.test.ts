// Ready for 200 students (20 Nov 2026, his plan: "scale this app to hundred students or two hundred students"). Convex
// counts every byte a call reads, and runs a live query again, whole, on every phone that watches it whenever a write
// lands in what it read. So what must hold as the class grows:
// - a tap on one student re-reads only HIS part on the teachers' phones (never the class list, never the others);
// - the class list (state.list) and the light board (state.light) read no student's row;
// - a phone's own sign-in row (read by every query of that phone) is written at most once a day;
// - the family app's busiest reads don't read the whole ARISTORA (Me: his grade and the GOAT; a group's members: the
//   grades' counts; the beat: who is online only while a screen shows it);
// - and they stay as small at 3× the students (the budgets below). The numbers for 40, 100 and 200 students are in
//   tests/scale/ (the scale lab, docs/making-changes.md "Is the server ready for 200 students?").

import { makeFunctionReference } from "convex/server";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { everPlace, goatOf } from "../convex/lib/race";
import { everPlaceOf, goatRow, raceCounts, raceList } from "../convex/lib/raceRows";
import { STUDENTS_MAX } from "../convex/students";
import { asPhone } from "./helpers";
import { meter, trace, wakes, type Trace } from "./scale/meter";
import { NOW, seed, settle, teacherToken, type World } from "./scale/seed";

const modules = import.meta.glob("../convex/**/*.ts");
type Run = (ref: unknown, args: unknown) => Promise<unknown>;
const q = (w: World, name: string, a: Record<string, unknown>) => (w.t.query as unknown as Run)(makeFunctionReference<"query">(name), a);
const m = (w: World, name: string, a: Record<string, unknown>) => (w.t.mutation as unknown as Run)(makeFunctionReference<"mutation">(name), a);

beforeAll(() => meter());
afterEach(() => vi.useRealTimers());

async function world(n: number): Promise<World> {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  return await seed(modules, n, { days: 3 });
}

/** A teacher's phone's board: the list, the light part, every student's his. What each read. */
async function phone(w: World, token: string) {
  const subs: { name: string; args: Record<string, unknown>; reads: Trace }[] = [];
  const watch = async (name: string, args: Record<string, unknown>) => subs.push({ name, args, reads: (await trace(() => q(w, name, { token, ...args }))).trace });
  await watch("state:list", {});
  await watch("state:light", {});
  for (const s of w.students) await watch("state:his", { id: s.id });
  /** The live queries this write runs again (his: by the student's id). */
  const woken = async (run: () => Promise<unknown>) => {
    await settle(w.t);
    const r = await trace(run);
    await settle(w.t);
    const hit = subs.filter((s) => wakes(s.reads, r.trace.writes));
    for (const s of hit) s.reads = (await trace(() => q(w, s.name, { token, ...s.args }))).trace;
    return hit.map((s) => (s.name === "state:his" ? `his:${String(s.args.id)}` : s.name));
  };
  return { woken };
}

describe("ready for 200 students", () => {
  test("a tap on one student re-reads only his part on a teacher's phone", async () => {
    const w = await world(24);
    const p = await phone(w, teacherToken(0));
    const here = w.students.filter((s) => s.here);
    const away = w.students.filter((s) => !s.here);
    const kid = here[1];
    const unitId = w.units[kid.grade][0];
    const book = await w.t.run(async (ctx) => (await ctx.db.query("books").collect()).find((b) => b.unitId === unitId));
    const levels = (book!.data as unknown as { levels: { to: number }[] }).levels;
    const tk = teacherToken(0);
    vi.setSystemTime(Date.now() + 61_000);
    // A mark on his level (his "last active" and the class's move: at most once a minute each).
    const mark = await p.woken(() => m(w, "focus:mark", { token: tk, studentId: kid.id, unitId, level: 5, by: "correction", set: [{ q: levels[3].to + 1, g: 1 }] }));
    expect(mark.filter((x) => x.startsWith("his:"))).toEqual([`his:${kid.id}`]);
    expect(mark).not.toContain("state:list");
    // Another mark within the minute: nothing on the board moves.
    vi.setSystemTime(Date.now() + 5_000);
    expect(await p.woken(() => m(w, "focus:mark", { token: tk, studentId: kid.id, unitId, level: 5, by: "correction", set: [{ q: levels[3].to + 2, g: 1 }] }))).toEqual([]);
    // Signed in, a level handed in, a call: his part (and the light part's session or calls), never the list or another's.
    vi.setSystemTime(Date.now() + 61_000);
    const signIn = await p.woken(() => m(w, "students:setPresent", { token: tk, id: away[0].id, present: true, by: "attendance" }));
    expect(signIn.filter((x) => x.startsWith("his:"))).toEqual([`his:${away[0].id}`]);
    expect(signIn).not.toContain("state:list");
    const done = await p.woken(() => m(w, "workbook:levelDone", { token: tk, studentId: here[2].id, unitId: w.units[here[2].grade][0], level: 3, by: "correction" }));
    expect(done.filter((x) => x.startsWith("his:"))).toEqual([`his:${here[2].id}`]);
    const call = await p.woken(() => m(w, "calls:create", { token: w.owner.token, studentIds: [here[3].id], room: "evaluation", kind: "evaluation", consult: true }));
    expect(call).toContain("state:light");
    expect(call.filter((x) => x.startsWith("his:"))).toEqual([`his:${here[3].id}`]);
    expect(call).not.toContain("state:list");
    // A new student: the list (and nobody's part).
    const add = await p.woken(() => m(w, "students:add", { token: w.owner.token, name: "Zara Z", grade: 8, term: 1, stage: "master", unitId: w.units[8][0] }));
    expect(add).toContain("state:list");
    expect(add.filter((x) => x.startsWith("his:"))).toEqual([]);
  });

  test("the class list follows a new student, a removal, the simulation, and a write that skipped fn.ts", async () => {
    const w = await world(6);
    const owner = asPhone(w.t, w.owner.token);
    const ids = async () => ((await owner.query(api.state.list, {})) as { ids: string[] }).ids;
    expect(await ids()).toEqual(w.students.map((s) => s.id));
    const id = (await owner.mutation(api.students.add, { name: "Zara Z", grade: 8, term: 1, stage: "master", unitId: w.units[8][0] })) as Id<"students">;
    expect((await ids()).at(-1)).toBe(id);
    await owner.mutation(api.students.setArchived, { id, archived: true });
    expect(await ids()).not.toContain(id);
    await owner.mutation(api.students.setArchived, { id, archived: false });
    expect(await ids()).toContain(id);
    await owner.mutation(api.sim.start, { level: "easy", count: 5, minutes: 20 });
    const sim = (await owner.query(api.state.list, { test: true })) as { ids: string[]; tests: number };
    expect(sim.ids.length).toBe(5);
    expect(sim.tests).toBe(5);
    expect(await ids()).not.toContain(sim.ids[0]);
    // Straight into the table (a test's t.run): the list doesn't know until the daily check.
    const raw = await w.t.run(async (ctx) => await ctx.db.insert("students", { name: "Raw R", archived: false, present: false, grade: 7, idleMs: 0 }));
    expect(await ids()).not.toContain(raw);
    expect(await w.t.mutation(internal.students.checkList, {})).toBe(true);
    expect(await ids()).toContain(raw);
    expect(await w.t.mutation(internal.students.checkList, {})).toBe(false); // checked: not again for a day
  });

  test("a phone's own row (every query of it reads it) moves once a day; Settings → People shows the 10-minute time", async () => {
    const w = await world(4);
    const tk = teacherToken(0);
    const kid = w.students[0];
    const row = () => w.t.run(async (ctx) => (await ctx.db.query("devices").collect()).find((d) => d.userId === w.teachers[0])!);
    const before = (await row()).lastSeenAt;
    let moved = 0;
    let last = before;
    for (let i = 0; i < 40; i++) {
      vi.setSystemTime(Date.now() + 3 * 60_000); // two hours of class, a tap every 3 minutes
      await m(w, "students:setPresent", { token: tk, id: kid.id, present: i % 2 === 0, by: "attendance" });
      const now = (await row()).lastSeenAt;
      if (now !== last) moved++;
      last = now;
    }
    expect(moved).toBeLessThanOrEqual(1);
    const people = (await asPhone(w.t, w.owner.token).query(api.people.list, {})) as { _id: string; devices: { lastSeenAt: number }[] }[];
    const her = people.find((p) => p._id === w.teachers[0])!;
    expect(Date.now() - her.devices[0].lastSeenAt).toBeLessThan(11 * 60_000);
  });

  test("Me reads his grade's race rows and the GOAT's, never the whole ARISTORA's; the GOAT is the same", async () => {
    const w = await world(36);
    const kid = w.students.find((s) => s.grade === 8)!;
    const grade = w.students.filter((s) => s.grade === 8).length;
    // His grade's rows, the GOAT's (and those tied with him at the top), his own: never the other grades'.
    const tied = await w.t.run(async (ctx) => {
      const rows = (await ctx.db.query("raceRows").collect()).filter((x) => !x.demo && !x.gone);
      const top = Math.max(...rows.map((x) => x.tot));
      return rows.filter((x) => x.tot === top).length;
    });
    const r = await trace(() => q(w, "family:me", { token: kid.token }));
    expect(r.trace.tables.raceRows?.docs ?? 0).toBeLessThanOrEqual(grade + tied + 2);
    expect(r.trace.tables.raceRows?.docs ?? 0).toBeLessThan(w.students.length);
    const me = (await q(w, "family:me", { token: kid.token })) as { ever?: { place: number | null; of: number; goat: boolean } };
    // The GOAT from the top of the index = the GOAT from every row (ties: the name, as every list).
    const [fromAll, fromTop] = await w.t.run(async (ctx) => [goatOf(await raceList(ctx, false, Date.now()))?.id ?? null, (await goatRow(ctx, false, Date.now()))?.id ?? null]);
    expect(fromTop).toBe(fromAll);
    expect(me.ever?.goat).toBe(fromAll === kid.id);
    // His place from the rows ahead of him = his place in his grade's whole list (equal XP share it), for everyone.
    const places = await w.t.run(async (ctx) => {
      const all = await raceList(ctx, false, Date.now());
      const out: [unknown, unknown][] = [];
      for (const s of w.students) out.push([everPlace(all.filter((r) => r.g === s.grade), s.id, s.grade), await everPlaceOf(ctx, s.id, false, s.grade)]);
      return out;
    });
    for (const [old, fast] of places) expect(fast).toEqual(old);
    // Two at the top with the same XP ever: the name decides.
    await w.t.run(async (ctx) => {
      const rows = await ctx.db.query("raceRows").collect();
      const top = Math.max(...rows.map((x) => x.tot)) + 50;
      await ctx.db.patch(rows[3]._id, { tot: top, n: "Bbb B" });
      await ctx.db.patch(rows[5]._id, { tot: top, n: "Aaa A" });
    });
    const tie = await w.t.run(async (ctx) => [goatOf(await raceList(ctx, false, Date.now()))?.n, (await goatRow(ctx, false, Date.now()))?.n]);
    expect(tie).toEqual(["Aaa A", "Aaa A"]);
  });

  test("the beat reads who is online only when a screen shows the dots", async () => {
    const w = await world(30);
    for (const s of w.students.slice(0, 20)) await m(w, "online:beat", { token: s.token, w: false });
    const kid = w.students[25];
    const off = await trace(() => m(w, "online:beat", { token: kid.token, w: false }));
    expect((off.value as { on: string[] }).on).toEqual([]);
    expect(off.trace.tables.students?.docs ?? 0).toBeLessThanOrEqual(1);
    const on = await trace(() => m(w, "online:beat", { token: kid.token, w: true }));
    expect((on.value as { on: string[] }).on.length).toBeGreaterThanOrEqual(20);
    // An older phone (no `w`) still gets the list.
    expect(((await m(w, "online:beat", { token: kid.token })) as { on: string[] }).on.length).toBeGreaterThanOrEqual(20);
  });

  test("a group's member count comes from the grades' counts, and follows a new student, a move and a removal", async () => {
    const w = await world(24);
    const owner = asPhone(w.t, w.owner.token);
    const kid = w.students.find((s) => s.grade === 8)!;
    const members = async (id: string) => ((await q(w, "chat:troom", { token: w.owner.token, id })) as { head: { members?: number } }).head.members;
    const count = (g: number) => w.students.filter((s) => s.grade === g).length;
    expect(await members("g:8")).toBe(count(8));
    expect(await members("g:0")).toBe(w.students.length);
    // A group of two grades and a student picked from a third.
    const other = w.students.find((s) => s.grade === 9)!;
    const made = (await owner.mutation(api.chat.tgroup, { name: "Mixed", emo: "📚", gs: [6, 7], sids: [other.id], ro: false })) as { id: string };
    expect(await members(made.id)).toBe(count(6) + count(7) + 1);
    // Reading a full room of the Everyone group: a few race rows, not every student's.
    const r = await trace(() => q(w, "chat:room", { token: kid.token, id: "g:0" }));
    expect(r.trace.tables.raceRows?.docs ?? 0).toBeLessThanOrEqual(4);
    // The counts follow: a new student in Grade 8, one moved to Grade 9, one removed.
    await owner.mutation(api.students.add, { name: "Zara Z", grade: 8, term: 1, stage: "master", unitId: w.units[8][0] });
    expect(await members("g:8")).toBe(count(8) + 1);
    await owner.mutation(api.students.setArchived, { id: kid.id, archived: true });
    expect(await members("g:8")).toBe(count(8));
    expect(await w.t.run(async (ctx) => (await raceCounts(ctx))?.r["8"])).toBe(count(8));
  });

  test("the phones' busiest reads stay as small at 3× the students", async () => {
    const reads = async (n: number) => {
      const w = await world(n);
      const kid = w.students.find((s) => s.here && s.grade === 8)!;
      const tk = w.owner.token;
      const out: Record<string, number> = {};
      const one = async (name: string, a: Record<string, unknown>) => {
        await settle(w.t);
        out[name] = (await trace(() => q(w, name, a))).docs;
      };
      await one("state:list", { token: tk });
      await one("state:light", { token: tk });
      await one("state:his", { token: tk, id: kid.id });
      await one("auth:me", { token: tk });
      await one("family:me", { token: kid.token });
      await one("chat:rooms", { token: kid.token });
      out["online:beat"] = (await trace(() => m(w, "online:beat", { token: kid.token, w: false }))).docs;
      // Me's race rows: his grade's, and the top's ties (the seed's XP repeats: more ties in a bigger class).
      const tied = await w.t.run(async (ctx) => {
        const rows = (await ctx.db.query("raceRows").collect()).filter((x) => !x.demo && !x.gone);
        const top = Math.max(...rows.map((x) => x.tot));
        return rows.filter((x) => x.tot === top).length;
      });
      return { out, grade: w.students.filter((s) => s.grade === 8).length + tied };
    };
    const small = await reads(16);
    const big = await reads(48);
    for (const [name, docs] of Object.entries(big.out)) {
      // Me reads his grade's race rows (one grade grows with the class); everything else stays put. (A room's messages
      // and the feed's posts grow with what is written, up to their page: not measured here.)
      const allowed = small.out[name] + (name === "family:me" ? big.grade - small.grade : 0) + 3;
      expect.soft(docs, `${name}: ${small.out[name]} docs at 16 students, ${docs} at 48`).toBeLessThanOrEqual(allowed);
    }
    expect(big.out["state:list"]).toBeLessThanOrEqual(3);
    expect(big.out["state:light"]).toBeLessThanOrEqual(8);
  });

  test("the class list takes STUDENTS_MAX students (300; it was 120), not one more", async () => {
    expect(STUDENTS_MAX).toBe(300);
    const w = await world(2);
    const owner = asPhone(w.t, w.owner.token);
    await w.t.run(async (ctx) => {
      for (let i = w.students.length; i < STUDENTS_MAX - 1; i++) await ctx.db.insert("students", { name: `S${i} X`, archived: false, present: false, grade: 6, idleMs: 0 });
    });
    const add = (name: string) => owner.mutation(api.students.add, { name, grade: 8, term: 1, stage: "master", unitId: w.units[8][0] });
    await add("Last L");
    await expect(add("One More")).rejects.toThrow("300 students is the limit");
    expect(((await owner.query(api.state.list, {})) as { ids: string[] }).ids.length).toBe(STUDENTS_MAX);
  });
});
