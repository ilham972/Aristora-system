import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { cleanBy, currentSession, ensureSession, fail, log, refresh, touch } from "./lib/backend";
import type { Mark } from "./lib/status";
import { sectionById } from "./lib/unit";

type Plan = {
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

// Ten made-up students spread across the unit, so every screen has something to show.
const PLANS: Plan[] = [
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

function build(p: Plan, now: number): Record<string, Mark> {
  const marks: Record<string, Mark> = {};
  const ago = (min: number) => now - min * 60_000;
  for (const id of p.taught) {
    for (const q of sectionById(id)!.teach) marks[String(q)] = { s: "taught", t: ago(70) };
  }
  for (const [q] of p.right) marks[String(q)] = { s: "right", t: ago(30) };
  for (const [q, min, n] of p.wrong ?? []) marks[String(q)] = { s: "wrong", n, t: ago(min) };
  for (const [q, min] of p.slip ?? []) marks[String(q)] = { s: "slip", t: ago(min) };
  return marks;
}

/** Fill an empty class with 10 demo students, ready to play with. */
export const load = mutation({
  args: { by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const by = cleanBy(args.by);
    const current = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).first();
    if (current) fail("Demo students only load into an empty class. Remove the current students first.");
    const session = await ensureSession(ctx, now, by);
    for (const p of PLANS) {
      const id = await ctx.db.insert("students", {
        name: p.name,
        archived: false,
        demo: true,
        present: p.present,
        marks: build(p, now),
        idleMs: 0,
        lastActivityAt: p.activeMinAgo === undefined ? undefined : now - p.activeMinAgo * 60_000,
      });
      await refresh(ctx, id, now, session);
    }
    await log(ctx, session, now, { kind: "demo-load", by, value: String(PLANS.length) });
    await touch(ctx, session, now);
  },
});

/** Delete every demo student (real students are never touched). */
export const remove = mutation({
  args: { by: v.optional(v.string()) },
  handler: async (ctx, args) => {
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
      await ctx.db.delete(s._id);
    }
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "demo-remove", by: cleanBy(args.by), value: String(demo.length) });
    await touch(ctx, session, now);
    return demo.length;
  },
});
