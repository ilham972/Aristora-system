import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx } from "./_generated/server";
import { bookFor, cleanBy, currentSession, ensureSession, fail, log, refresh, startVisit, touch } from "./lib/backend";
import { fighter, KNOWN_WORKBOOKS, levelOutOf, PILOT_UNIT, type MasterData } from "./lib/book";
import type { MQ, MState } from "./lib/master";
import type { Mark } from "./lib/status";
import { unitKey } from "./lib/syllabus";
import { actor } from "./lib/auth";

type FighterPlan = {
  name: string;
  present: boolean;
  taught: string;
  right: [number, number][];
  wrong?: [number, number, number][];
  slip?: [number, number][];
  activeMinAgo?: number;
};

const r = (a: number, b: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let q = a; q <= b; q++) out.push([q, 0]);
  return out;
};

// Grade 11, on the pilot theory book (Fighter), spread across the unit so every screen has something to show.
const FIGHTERS: FighterPlan[] = [
  { name: "Ahamed", present: true, taught: "ABC", right: [...r(5, 8), ...r(12, 14), ...r(18, 20)], activeMinAgo: 4 },
  { name: "Fathima", present: true, taught: "ABC", right: [...r(5, 8), ...r(12, 14), ...r(18, 21)], wrong: [[22, 8, 1]], activeMinAgo: 8 },
  { name: "Kumar", present: true, taught: "ABCD", right: [...r(5, 8), ...r(12, 14), ...r(18, 22), [27, 0]], wrong: [[28, 14, 1], [29, 3, 1]], activeMinAgo: 3 },
  { name: "Nila", present: true, taught: "ABC", right: [...r(5, 8), ...r(12, 14), [18, 0]], activeMinAgo: 6 },
  { name: "Rizwan", present: true, taught: "AB", right: [...r(5, 8), ...r(12, 14)], activeMinAgo: 5 },
  { name: "Sana", present: true, taught: "ABCD", right: [...r(5, 8), ...r(12, 14), ...r(18, 22), ...r(27, 31)], activeMinAgo: 2 },
  { name: "Tharun", present: true, taught: "A", right: [[5, 0], [6, 0]], activeMinAgo: 19 },
  { name: "Yasmin", present: true, taught: "ABCDEF", right: [...r(5, 8), ...r(12, 14), ...r(18, 22), ...r(27, 33), ...r(37, 40), ...r(44, 50), [51, 0]], slip: [[52, 5]], activeMinAgo: 5 },
  { name: "Dilan", present: true, taught: "ABC", right: [...r(5, 8), ...r(12, 14), [19, 0], [20, 0]], wrong: [[18, 6, 2]], activeMinAgo: 6 },
  { name: "Keerthi", present: false, taught: "A", right: [[5, 0]] },
];

/** Grade 7, on the Directed numbers workbook (Master). Levels: corrected (marks lost on some questions), waiting. */
type MasterPlan = {
  name: string;
  /** Corrected levels: level number -> questions that lost marks (got 0). */
  fixed: Record<number, number[]>;
  /** Levels handed in and waiting, with minutes ago. */
  waiting?: [number, number][];
  activeMinAgo: number;
};
const MASTERS: MasterPlan[] = [
  { name: "Malik", fixed: { 1: [4], 2: [13, 17] }, waiting: [[3, 6]], activeMinAgo: 6 },
  { name: "Priya", fixed: { 1: [] }, activeMinAgo: 3 },
  { name: "Vimal", fixed: { 1: [], 2: [], 3: [22], 4: [], 5: [], 6: [51], 7: [] }, waiting: [[8, 9]], activeMinAgo: 9 },
];

function fighterMarks(p: FighterPlan, now: number, book: ReturnType<typeof fighter>): Record<string, Mark> {
  const marks: Record<string, Mark> = {};
  const ago = (min: number) => now - min * 60_000;
  for (const id of p.taught) {
    for (const q of book.sectionById(id)!.teach) marks[String(q)] = { s: "taught", t: ago(70) };
  }
  for (const [q] of p.right) marks[String(q)] = { s: "right", t: ago(30) };
  for (const [q, min, n] of p.wrong ?? []) marks[String(q)] = { s: "wrong", n, t: ago(min) };
  for (const [q, min] of p.slip ?? []) marks[String(q)] = { s: "slip", t: ago(min) };
  return marks;
}

function masterMarks(p: MasterPlan, now: number, book: MasterData): MState {
  const m: MState = { q: {}, lv: {} };
  const ago = (min: number) => now - min * 60_000;
  for (const [n, lost] of Object.entries(p.fixed)) {
    const l = book.levels.find((x) => x.n === Number(n))!;
    const each = levelOutOf(book, l)!;
    let got = 0;
    for (let q = l.from; q <= l.to; q++) {
      const max = each[q - l.from];
      const g = lost.includes(q) ? 0 : max;
      got += g;
      const row: MQ = { got: g, max, lost: g < max, t: ago(40) };
      m.q[String(q)] = row;
    }
    m.lv[n] = { done: ago(55), fixed: ago(40), by: "correction", got };
  }
  for (const [n, min] of p.waiting ?? []) m.lv[String(n)] = { done: ago(min) };
  return m;
}

async function unitByKey(ctx: MutationCtx, grade: number, code: string): Promise<Doc<"units">> {
  const u = await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", unitKey(grade, code))).first();
  if (!u) fail("The syllabus is not loaded yet. Refresh the page and try again.");
  return u;
}

/** Fill an empty class with 14 demo students of three grades, ready to play with. */
export const load = mutation({
  args: { token: v.optional(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const by = cleanBy(args.by);
    const current = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).first();
    if (current) fail("Demo students only load into an empty class. Remove the current students first.");
    const session = await ensureSession(ctx, now, by);

    const pilot = await unitByKey(ctx, PILOT_UNIT.grade, PILOT_UNIT.code);
    const pilotBook = await bookFor(ctx, pilot._id, "fighter");
    if (!pilotBook || pilotBook.data.kind !== "fighter") fail("The pilot theory book is not loaded yet.");
    const f = fighter(pilotBook.data);
    const wb = KNOWN_WORKBOOKS[0];
    const wUnit = await unitByKey(ctx, wb.grade, wb.code);
    const wBook = await bookFor(ctx, wUnit._id, "master");
    if (!wBook || wBook.data.kind !== "master") fail("The demo workbook is not loaded yet.");
    const legendUnit = await unitByKey(ctx, 9, "U21");

    const add = async (doc: Omit<Doc<"students">, "_id" | "_creationTime">): Promise<Id<"students">> =>
      await ctx.db.insert("students", doc);
    const ids: Id<"students">[] = [];
    for (const p of FIGHTERS) {
      const id = await add({
        name: p.name,
        archived: false,
        demo: true,
        present: p.present,
        grade: 11,
        term: 2,
        stage: "fighter",
        unitId: pilot._id,
        idleMs: 0,
        lastActivityAt: p.activeMinAgo === undefined ? undefined : now - p.activeMinAgo * 60_000,
      });
      await ctx.db.insert("progress", {
        studentId: id,
        unitId: pilot._id,
        stage: "fighter",
        marks: fighterMarks(p, now, f),
        startedAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    for (const p of MASTERS) {
      const id = await add({
        name: p.name,
        archived: false,
        demo: true,
        present: true,
        grade: 7,
        term: 1,
        stage: "master",
        unitId: wUnit._id,
        idleMs: 0,
        lastActivityAt: now - p.activeMinAgo * 60_000,
      });
      await ctx.db.insert("progress", {
        studentId: id,
        unitId: wUnit._id,
        stage: "master",
        marks: {},
        m: masterMarks(p, now, wBook.data),
        startedAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    ids.push(
      await add({
        name: "Zainab",
        archived: false,
        demo: true,
        present: true,
        grade: 9,
        term: 3,
        stage: "legend",
        unitId: legendUnit._id,
        idleMs: 0,
        lastActivityAt: now - 10 * 60_000,
      }),
    );
    for (const id of ids) {
      // The ones in class arrived a little before their last mark, so the register has a time for them.
      const s = (await ctx.db.get(id))!;
      if (s.present) {
        const inAt = Math.min(now, (s.lastActivityAt ?? now) - 15 * 60_000);
        await ctx.db.patch(id, { lastInAt: inAt });
        await startVisit(ctx, id, inAt, session);
      }
      await refresh(ctx, id, now, session);
    }
    await log(ctx, session, now, { kind: "demo-load", by, value: String(ids.length) });
    await touch(ctx, session, now);
  },
});

/** Delete every demo student and their work (real students are never touched). */
export const remove = mutation({
  args: { token: v.optional(v.string()), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const all = await ctx.db.query("students").collect();
    const demo = all.filter((s) => s.demo);
    for (const s of demo) {
      for (const status of ["requested", "sent", "done", "cancelled", "declined"] as const) {
        const calls = await ctx.db
          .query("calls")
          .withIndex("by_student_status", (q) => q.eq("studentId", s._id).eq("status", status))
          .collect();
        for (const c of calls) await ctx.db.delete(c._id);
      }
      for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
        await ctx.db.delete(p._id);
      }
      for (const a of await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
        await ctx.db.delete(a._id);
      }
      await ctx.db.delete(s._id);
    }
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "demo-remove", by: cleanBy(args.by), value: String(demo.length) });
    await touch(ctx, session, now);
    return demo.length;
  },
});
