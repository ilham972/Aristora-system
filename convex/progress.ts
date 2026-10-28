// The Progress page (owner and anyone with Reports): one grade's students, where each stands in every unit of the
// grade (theory book and workbook), how fast, what he did today and whether he came today. Read-only.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { viewer } from "./lib/auth";
import { masterState } from "./lib/backend";
import { bookTotal, fighter } from "./lib/book";
import { slDay } from "./lib/day";
import { daysBetween, summarizeFighter, summarizeMaster, type Cell } from "./lib/progress";
import type { Marks } from "./lib/status";

export const board = query({
  args: { token: v.optional(v.string()), grade: v.number() },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "reports");
    const now = Date.now();
    const today = slDay(now);

    const units = (await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", args.grade)).collect()).sort(
      (a, b) => a.order - b.order,
    );
    const unitIds = new Set<Id<"units">>(units.map((u) => u._id));
    const books = new Map<string, Doc<"books">>();
    for (const b of await ctx.db.query("books").collect()) if (unitIds.has(b.unitId)) books.set(`${b.unitId}:${b.stage}`, b);

    const students = (await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect())
      .filter((s) => s.grade === args.grade)
      .sort((a, b) => a.name.localeCompare(b.name));
    const came = new Set(
      (await ctx.db.query("attendance").withIndex("by_day", (q) => q.eq("day", today)).collect()).map((x) => x.studentId),
    );

    const rows = [];
    for (const s of students) {
      const visits = await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect();
      const visitDays = new Set(visits.map((x) => x.day));
      const cells: Record<string, Cell> = {};
      for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
        if (!unitIds.has(p.unitId)) continue;
        const book = books.get(`${p.unitId}:${p.stage}`);
        if (!book) continue;
        // Class days on a unit: from the day he started it until today (his unit now) or his last work on it.
        const current = s.unitId === p.unitId && s.stage === p.stage;
        const cell = (cells[p.unitId] ??= {});
        if (book.data.kind === "master" && p.stage === "master") {
          const m = masterState(p);
          const lastT = Math.max(p.updatedAt, ...Object.values(m.lv).map((l) => l?.fixed ?? l?.done ?? 0));
          cell.m = summarizeMaster(m, book.data, today, daysBetween(visitDays, slDay(p.startedAt), current ? today : slDay(lastT)));
        } else if (book.data.kind === "fighter" && p.stage === "fighter") {
          const until = current ? today : slDay(p.updatedAt);
          cell.f = summarizeFighter(p.marks as Marks, fighter(book.data), today, daysBetween(visitDays, slDay(p.startedAt), until));
        }
      }
      rows.push({
        _id: s._id,
        name: s.name,
        demo: !!s.demo,
        stage: s.stage ?? null,
        term: s.term ?? null,
        unitId: s.unitId ?? null,
        present: s.present,
        cameToday: came.has(s._id),
        lastInAt: s.lastInAt ?? null,
        cells,
      });
    }

    return {
      today,
      grade: args.grade,
      units: units.map((u) => {
        const f = books.get(`${u._id}:fighter`);
        const m = books.get(`${u._id}:master`);
        return {
          _id: u._id,
          code: u.code,
          en: u.en,
          ta: u.ta,
          term: u.term,
          order: u.order,
          fighter: f && f.data.kind === "fighter" ? { solo: f.data.sections.reduce((a, x) => a + x.solo.length, 0) } : null,
          master: m && m.data.kind === "master" ? { levels: m.data.levels.length, total: bookTotal(m.data) } : null,
        };
      }),
      students: rows,
    };
  },
});
