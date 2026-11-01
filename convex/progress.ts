// The Progress page (owner and anyone with Reports): one grade's students, where each stands in every unit of the
// grade (theory book and workbook), how fast, what he did today and whether he came today. Read-only.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { viewer } from "./lib/auth";
import { masterState } from "./lib/backend";
import { bookTotal, fighter } from "./lib/book";
import { computeMaster } from "./lib/master";
import { slDay } from "./lib/day";
import { daysBetween, summarizeFighter, summarizeMaster, type Cell } from "./lib/progress";
import { computeStatus, type Marks } from "./lib/status";

export const board = query({
  /** test: the test class's students instead of the real class's (a phone in test mode). */
  args: { token: v.optional(v.string()), grade: v.number(), test: v.optional(v.boolean()) },
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
      .filter((s) => s.grade === args.grade && !!s.test === !!args.test)
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

/**
 * One book's race (1 Nov 2026, his ask: from a student's paper on Correction, the whole class's progress in that book,
 * to compare and to share in the WhatsApp group): every student who has worked in it or is on it now, how far, how
 * well, what he did today. Correction, Theory and Evaluation (the Progress page itself is Reports). Read-only.
 */
export const book = query({
  args: { token: v.optional(v.string()), unitId: v.id("units"), stage: v.union(v.literal("fighter"), v.literal("master")), test: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction", "evaluation", "theory", "reports");
    const unit = await ctx.db.get(args.unitId);
    if (!unit) return null;
    const doc = (await ctx.db.query("books").collect()).find((b) => b.unitId === args.unitId && b.stage === args.stage);
    if (!doc) return null;
    const now = Date.now();
    const today = slDay(now);
    const came = new Set((await ctx.db.query("attendance").withIndex("by_day", (q) => q.eq("day", today)).collect()).map((x) => x.studentId));
    const students = (await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect()).filter(
      (s) => !!s.test === !!args.test,
    );
    const rows = [];
    for (const s of students) {
      const current = s.unitId === args.unitId && s.stage === args.stage;
      const p = await ctx.db
        .query("progress")
        .withIndex("by_student_unit_stage", (q) => q.eq("studentId", s._id).eq("unitId", args.unitId).eq("stage", args.stage))
        .first();
      if (!p && !current) continue;
      const visits = await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect();
      const visitDays = new Set(visits.map((x) => x.day));
      const cell: Cell = {};
      if (p && doc.data.kind === "master") {
        const m = masterState(p);
        const lastT = Math.max(p.updatedAt, ...Object.values(m.lv).map((l) => l?.fixed ?? l?.done ?? 0));
        cell.m = summarizeMaster(m, doc.data, today, daysBetween(visitDays, slDay(p.startedAt), current ? today : slDay(lastT)));
      } else if (p && doc.data.kind === "fighter") {
        cell.f = summarizeFighter(p.marks as Marks, fighter(doc.data), today, daysBetween(visitDays, slDay(p.startedAt), current ? today : slDay(p.updatedAt)));
      }
      // Every question's state, for Correction's question sheet (numbers and states only, never the book's content).
      const marks: Record<string, string> = {};
      const mq: Record<string, { got?: number; max?: number; dk?: boolean; x?: boolean; th?: boolean; tt?: boolean }> = {};
      const lv: Record<string, { done?: boolean; fixed?: boolean; pre?: boolean }> = {};
      if (p && doc.data.kind === "fighter") for (const [k, mk] of Object.entries(p.marks)) marks[k] = mk.s;
      if (p && doc.data.kind === "master") {
        const m = masterState(p);
        for (const [k, r] of Object.entries(m.q)) mq[k] = { got: r.got, max: r.max, dk: r.dk || undefined, x: !!r.x || undefined, th: !!r.th || undefined, tt: !!r.tt || undefined };
        for (const [k, l] of Object.entries(m.lv)) if (l) lv[k] = { done: !!l.done || undefined, fixed: !!l.fixed || undefined, pre: !!l.pre || undefined };
      }
      rows.push({ _id: s._id, name: s.name, grade: s.grade ?? null, present: s.present, cameToday: came.has(s._id), current, cells: { [args.unitId]: cell }, marks, mq, lv });
    }
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return {
      today,
      stage: args.stage,
      unit: { _id: unit._id, code: unit.code, en: unit.en, ta: unit.ta, grade: unit.grade },
      size:
        doc.data.kind === "master"
          ? { levels: doc.data.levels.length, solo: 0 }
          : { levels: 0, solo: doc.data.sections.reduce((a, x) => a + x.solo.length, 0) },
      // The book's shape: a theory book's sections (which questions, teacher or ladder, a past paper's year), a
      // workbook's levels and parts.
      sections:
        doc.data.kind === "fighter"
          ? doc.data.sections.map((x) => ({ id: x.id, badge: x.badge, kind: x.kind, teach: x.teach, solo: x.solo }))
          : [],
      labels: doc.data.kind === "fighter" ? (doc.data.labels ?? {}) : {},
      levels: doc.data.kind === "master" ? doc.data.levels.map((l) => ({ n: l.n, from: l.from, to: l.to })) : [],
      parts: doc.data.kind === "master" ? doc.data.parts.map((x) => ({ id: x.id, from: x.from, to: x.to })) : [],
      students: rows,
    };
  },
});

/** One unit of one student, for Correction's unit sheet: how far, how well, and what still waits for the teachers. */
export type UnitCell = {
  unitId: Id<"units">;
  stage: "fighter" | "master";
  /** Workbook: levels done (handed in, corrected or done before the app) / levels. Theory book: solo questions done. */
  done: number;
  total: number;
  /** Workbook: marks % of the corrected levels (null before the first correction). */
  pct: number | null;
  /** Lost marks / wrong answers still waiting for Evaluation. */
  evaluation: number;
  /** Workbook questions sent to Theory and not taught yet. */
  theory: number;
  finished: boolean;
};

/**
 * One student across all his units (Correction's unit sheet): each unit's progress and what waits for Evaluation or
 * Theory, and the books he was given. Read only while the sheet is open (it never travels with the board).
 */
export const student = query({
  args: { token: v.optional(v.string()), studentId: v.id("students") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "correction", "evaluation", "theory");
    const s = await ctx.db.get(args.studentId);
    if (!s) return null;
    const today = slDay(Date.now());
    const cells: UnitCell[] = [];
    for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
      const book = await ctx.db
        .query("books")
        .withIndex("by_unit_stage", (q) => q.eq("unitId", p.unitId).eq("stage", p.stage))
        .first();
      if (!book) continue;
      if (book.data.kind === "master" && p.stage === "master") {
        const m = masterState(p);
        const sum = summarizeMaster(m, book.data, today, new Set());
        const st = computeMaster(m, book.data);
        cells.push({
          unitId: p.unitId,
          stage: "master",
          done: sum.done,
          total: sum.levels,
          pct: sum.pct,
          evaluation: st.pending.length,
          theory: st.theory.length,
          finished: st.finished,
        });
      } else if (book.data.kind === "fighter" && p.stage === "fighter") {
        const f = fighter(book.data);
        const sum = summarizeFighter(p.marks as Marks, f, today, new Set());
        const st = computeStatus(p.marks as Marks, f);
        cells.push({
          unitId: p.unitId,
          stage: "fighter",
          done: sum.done,
          total: sum.total,
          pct: null,
          evaluation: st.pending.length,
          theory: 0,
          finished: sum.finished,
        });
      }
    }
    const given = (await ctx.db.query("handouts").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()).map((h) => ({
      unitId: h.unitId,
      stage: h.stage,
      at: h.at,
    }));
    return { cells, given };
  },
});

/**
 * One student's sheet (Progress → his name, the Owner page's lists): everything about him for the owner, and the parents'
 * WhatsApp image (src/studentReport.ts). His visits, every book of his (how far, marks, each level's dates, when
 * teachers explained or taught his questions) and his room visits. Read only while the sheet is open.
 */
export const report = query({
  args: { token: v.optional(v.string()), studentId: v.id("students") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "reports");
    const s = await ctx.db.get(args.studentId);
    if (!s) return null;
    const now = Date.now();
    const today = slDay(now);
    const grade = s.grade ?? null;
    const gradeUnits =
      grade === null ? [] : await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", grade)).collect();
    const visits = (await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()).map((x) => ({
      day: x.day,
      inAt: x.inAt,
      outAt: x.outAt ?? null,
    }));
    const visitDays = new Set(visits.map((x) => x.day));
    const bookOf = async (unitId: Id<"units">, stage: "fighter" | "master") =>
      await ctx.db
        .query("books")
        .withIndex("by_unit_stage", (q) => q.eq("unitId", unitId).eq("stage", stage))
        .first();

    const units = new Map<string, Doc<"units">>(gradeUnits.map((u) => [u._id as string, u]));
    const rows = [];
    for (const p of await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", s._id)).collect()) {
      const unit = units.get(p.unitId) ?? (await ctx.db.get(p.unitId));
      const book = await bookOf(p.unitId, p.stage);
      if (!unit || !book) continue;
      const current = s.unitId === p.unitId && s.stage === p.stage;
      if (book.data.kind === "master" && p.stage === "master") {
        const m = masterState(p);
        const lastT = Math.max(p.updatedAt, ...Object.values(m.lv).map((l) => l?.fixed ?? l?.done ?? 0));
        const cell = summarizeMaster(m, book.data, today, daysBetween(visitDays, slDay(p.startedAt), current ? today : slDay(lastT)));
        const st = computeMaster(m, book.data);
        rows.push({
          unitId: p.unitId,
          stage: "master" as const,
          current,
          startedAt: p.startedAt,
          m: cell,
          levels: book.data.levels.map((l) => {
            const lv = m.lv[String(l.n)];
            return { n: l.n, max: l.max, done: lv?.done ?? null, fixed: lv?.fixed ?? null, got: lv?.got ?? null, pre: !!lv?.pre, home: lv?.home ?? null };
          }),
          // When teachers helped: each question explained (Evaluation) or taught (Theory), and sent to Theory.
          explained: Object.values(m.q).flatMap((r) => (r?.x ? [r.x] : [])),
          taught: Object.values(m.q).flatMap((r) => (r?.tt ? [r.tt] : [])),
          waiting: { levels: st.waiting.length, evaluation: st.pending.length, theory: st.theory.length },
        });
      } else if (book.data.kind === "fighter" && p.stage === "fighter") {
        const f = fighter(book.data);
        const marks = p.marks as Marks;
        const until = current ? today : slDay(p.updatedAt);
        const st = computeStatus(marks, f);
        rows.push({
          unitId: p.unitId,
          stage: "fighter" as const,
          current,
          startedAt: p.startedAt,
          f: summarizeFighter(marks, f, today, daysBetween(visitDays, slDay(p.startedAt), until)),
          right: Object.values(marks).flatMap((x) => (x?.s === "right" ? [x.t] : [])),
          explained: Object.values(marks).flatMap((x) => (x?.s === "explained" ? [x.t] : [])),
          taught: Object.values(marks).flatMap((x) => (x?.s === "taught" ? [x.t] : [])),
          waiting: { levels: 0, evaluation: st.pending.length, theory: 0 },
        });
      }
      if (!units.has(p.unitId)) units.set(p.unitId, unit);
    }

    const calls = (
      await ctx.db
        .query("calls")
        .withIndex("by_student_status", (q) => q.eq("studentId", s._id).eq("status", "done"))
        .order("desc")
        .take(300)
    ).map((c) => ({ kind: c.kind, start: c.arrivedAt ?? c.sentAt ?? c.createdAt, end: c.endedAt ?? null }));

    const bookInfo = async (u: Doc<"units">) => {
      const mb = await bookOf(u._id, "master");
      const fb = await bookOf(u._id, "fighter");
      return {
        _id: u._id,
        grade: u.grade,
        code: u.code,
        en: u.en,
        ta: u.ta,
        term: u.term,
        order: u.order,
        master: mb && mb.data.kind === "master" ? { levels: mb.data.levels.length, total: bookTotal(mb.data) } : null,
        fighter: fb && fb.data.kind === "fighter" ? { solo: fb.data.sections.reduce((a, x) => a + x.solo.length, 0) } : null,
      };
    };
    const unitList = [];
    for (const u of [...units.values()].sort((a, b) => a.grade - b.grade || a.order - b.order)) unitList.push(await bookInfo(u));

    return {
      now,
      today,
      student: {
        _id: s._id,
        name: s.name,
        grade,
        term: s.term ?? null,
        stage: s.stage ?? null,
        unitId: s.unitId ?? null,
        present: s.present,
        archived: s.archived,
        lastInAt: s.lastInAt ?? null,
        created: s._creationTime,
      },
      units: unitList,
      rows,
      visits,
      calls,
    };
  },
});
