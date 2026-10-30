// The CEO page (owner only, 31 Oct 2026): everything the owner decides on, read once when the page opens (and every few
// minutes while it stays open): the classes of the last four weeks as digests (convex/lib/ceo.ts), who comes and who
// stopped coming, what they learn, which books are missing, the family app, and his money numbers. Never part of the
// board every phone watches (src/ceo.tsx fetches it once, not live: a live query would run again on every tap).

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { actor, viewer } from "./lib/auth";
import { fail, masterState, readDigest, STALE_SESSION_MS } from "./lib/backend";
import type { Digest, Money } from "./lib/ceo";
import { DAY_MS, slDay, slMonth, slWeekStart } from "./lib/day";
import { computeMaster } from "./lib/master";

/** The classes the page looks at, and the attendance it counts. */
const WINDOW_DAYS = 28;
const ATT_DAYS = 56;
/** Classes ended before digests existed are read again, the newest few only. */
const LEGACY_READS = 3;
/** A Master student this far through his workbook needs the next one soon. */
const SOON_SHARE = 0.7;
/** Corrected levels in the last two weeks below this % (2 levels at least): he needs attention. */
const LOW_PCT = 50;

const MONEY_KEY = "ceo.money";

export const overview = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const now = Date.now();
    const today = slDay(now);

    // ---- classes: each a digest, newest first
    const sessions = (await ctx.db.query("sessions").withIndex("by_startedAt").order("desc").take(60)).filter(
      (s) => s.startedAt >= now - WINDOW_DAYS * DAY_MS,
    );
    const classes: { _id: Id<"sessions">; day: string; open: boolean; digest: Digest }[] = [];
    let legacy = 0;
    for (const s of sessions) {
      const stored = (s.report as { digest?: Digest } | undefined)?.digest;
      if (!s.open && stored?.v === 1) {
        classes.push({ _id: s._id, day: stored.day, open: false, digest: stored });
        continue;
      }
      const live = s.open && now - s.lastActivityAt <= STALE_SESSION_MS;
      if (!live && legacy >= LEGACY_READS) continue;
      if (!live) legacy++;
      const end = live ? now : (s.endedAt ?? s.lastActivityAt);
      const digest = await readDigest(ctx, s, end);
      classes.push({ _id: s._id, day: digest.day, open: live, digest });
    }

    // ---- students, attendance
    const all = await ctx.db.query("students").collect();
    const active = all.filter((s) => !s.archived);
    const real = active.filter((s) => !s.demo);
    const month = slMonth(now);
    const removed = all.filter((s) => s.archived && !s.demo);
    const fromDay = slDay(now - ATT_DAYS * DAY_MS);
    const visits = await ctx.db
      .query("attendance")
      .withIndex("by_day", (q) => q.gte("day", fromDay))
      .collect();
    const isReal = new Set(real.map((s) => s._id as string));
    const perDay = new Map<string, Set<string>>();
    const mine = new Map<string, { days28: Set<string>; prev28: Set<string>; min28: number }>();
    const d28 = slDay(now - WINDOW_DAYS * DAY_MS);
    for (const x of visits) {
      if (!isReal.has(x.studentId)) continue;
      (perDay.get(x.day) ?? perDay.set(x.day, new Set()).get(x.day)!).add(x.studentId);
      const m = mine.get(x.studentId) ?? { days28: new Set<string>(), prev28: new Set<string>(), min28: 0 };
      mine.set(x.studentId, m);
      if (x.day > d28) {
        m.days28.add(x.day);
        m.min28 += Math.max(0, (x.outAt ?? Math.min(now, x.inAt + 3 * 60 * 60_000)) - x.inAt) / 60_000;
      } else m.prev28.add(x.day);
    }
    const days = [...perDay.entries()].map(([day, s]) => ({ day, came: s.size })).sort((a, b) => (a.day < b.day ? -1 : 1));

    // ---- units and books
    const units = await ctx.db.query("units").collect();
    const unitById = new Map(units.map((u) => [u._id as string, u]));
    const books = await ctx.db.query("books").collect();
    const bookAt = new Map(books.map((b) => [`${b.unitId}:${b.stage}`, b]));

    // ---- learning, from every workbook row of the students now
    const weekStart = slWeekStart(now);
    const prevStart = weekStart - 7 * DAY_MS;
    const twoWeeks = now - 14 * DAY_MS;
    const week = { levels: 0, got: 0, max: 0, home: 0 };
    const prev = { levels: 0, got: 0, max: 0, home: 0 };
    let finishedMonth = 0;
    const low: { _id: Id<"students">; name: string; grade: number | null; pct: number; levels: number }[] = [];
    const soon = new Map<string, { unitId: Id<"units">; students: string[] }>();
    const progress = await ctx.db.query("progress").collect();
    const byStudent = new Map<string, Doc<"progress">[]>();
    for (const p of progress) {
      if (!isReal.has(p.studentId)) continue;
      (byStudent.get(p.studentId) ?? byStudent.set(p.studentId, []).get(p.studentId)!).push(p);
    }
    for (const s of real) {
      let got2 = 0;
      let max2 = 0;
      let n2 = 0;
      for (const p of byStudent.get(s._id) ?? []) {
        if (p.stage !== "master") continue;
        const book = bookAt.get(`${p.unitId}:master`);
        if (!book || book.data.kind !== "master") continue;
        const data = book.data;
        const m = masterState(p);
        for (const l of data.levels) {
          const lv = m.lv[String(l.n)];
          if (!lv) continue;
          const at = lv.done ?? lv.fixed;
          const box = at && at >= weekStart ? week : at && at >= prevStart ? prev : null;
          if (box) box.levels++;
          if (lv.home && lv.home >= weekStart) week.home++;
          else if (lv.home && lv.home >= prevStart) prev.home++;
          if (lv.fixed && lv.got !== undefined) {
            const fixedBox = lv.fixed >= weekStart ? week : lv.fixed >= prevStart ? prev : null;
            if (fixedBox) {
              fixedBox.got += lv.got;
              fixedBox.max += l.max;
            }
            if (lv.fixed >= twoWeeks) {
              got2 += lv.got;
              max2 += l.max;
              n2++;
            }
          }
        }
        const st = computeMaster(m, data);
        const lastFix = Math.max(0, ...Object.values(m.lv).map((l) => l?.fixed ?? 0));
        if (st.finished && lastFix && slMonth(lastFix) === month) finishedMonth++;
        // His workbook now, far through: does the next unit have a workbook?
        if (s.unitId === p.unitId && s.stage === "master") {
          const done = data.levels.filter((l) => {
            const lv = m.lv[String(l.n)];
            return !!(lv?.done || lv?.fixed || lv?.pre);
          }).length;
          if (done / Math.max(1, data.levels.length) >= SOON_SHARE) {
            const u = unitById.get(p.unitId);
            const next = u ? nextUnit(units, u) : null;
            if (next && !bookAt.has(`${next._id}:master`)) {
              const x = soon.get(next._id) ?? { unitId: next._id, students: [] };
              x.students.push(s.name);
              soon.set(next._id, x);
            }
          }
        }
      }
      if (n2 >= 2 && max2 > 0 && (got2 / max2) * 100 < LOW_PCT) {
        low.push({ _id: s._id, name: s.name, grade: s.grade ?? null, pct: Math.round((got2 / max2) * 100), levels: n2 });
      }
    }
    low.sort((a, b) => a.pct - b.pct);

    const grades = [6, 7, 8, 9, 10, 11].map((grade) => {
      const us = units.filter((u) => u.grade === grade);
      const has = (stage: "master" | "fighter") => us.filter((u) => bookAt.has(`${u._id}:${stage}`)).length;
      return {
        grade,
        units: us.length,
        workbooks: has("master"),
        theory: has("fighter"),
        keys: us.filter((u) => (bookAt.get(`${u._id}:master`)?.keyCount ?? 0) > 0).length,
        students: real.filter((s) => s.grade === grade).length,
      };
    });

    // ---- the family app
    const phones = (await ctx.db.query("familyDevices").collect()).filter((d) => !d.revokedAt && isReal.has(d.studentId));

    const money = ((await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", MONEY_KEY)).first())?.value ?? null) as Money | null;
    const team = (await ctx.db.query("users").collect())
      .filter((u) => u.active)
      .map((u) => ({ name: u.name, role: u.role, tabs: u.tabs }));

    return {
      now,
      today,
      classes,
      days,
      students: real
        .map((s) => {
          const m = mine.get(s._id);
          const u = s.unitId ? unitById.get(s.unitId) : undefined;
          return {
            _id: s._id,
            name: s.name,
            grade: s.grade ?? null,
            stage: s.stage ?? null,
            unit: u ? u.code : null,
            created: s._creationTime,
            lastInAt: s.lastInAt ?? null,
            days28: m?.days28.size ?? 0,
            prev28: m?.prev28.size ?? 0,
            hours28: Math.round(((m?.min28 ?? 0) / 60) * 10) / 10,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      demo: active.length - real.length,
      added: real.filter((s) => slMonth(s._creationTime) === month).length + removed.filter((s) => slMonth(s._creationTime) === month).length,
      left: removed.filter((s) => s.archivedAt !== undefined && slMonth(s.archivedAt) === month).length,
      learning: { week, prev, finishedMonth, low: low.slice(0, 30) },
      books: {
        grades,
        soon: [...soon.values()]
          .map((x) => {
            const u = unitById.get(x.unitId)!;
            return { grade: u.grade, code: u.code, en: u.en, ta: u.ta, students: x.students };
          })
          .sort((a, b) => b.students.length - a.students.length),
      },
      family: { students: new Set(phones.map((d) => d.studentId)).size, phones: phones.length },
      money,
      team,
    };
  },
});

/** The unit after this one in his grade: the next in the same term, else the first of the next term. */
function nextUnit(units: Doc<"units">[], u: Doc<"units">): Doc<"units"> | null {
  const same = units.filter((x) => x.grade === u.grade && x.term > 0).sort((a, b) => a.order - b.order);
  const i = same.findIndex((x) => x._id === u._id);
  return i >= 0 ? (same[i + 1] ?? null) : null;
}

/** His three numbers (rupees a month): the average fee, a corrector's pay, a teacher's pay. Owner only. */
export const setMoney = mutation({
  args: { token: v.optional(v.string()), fee: v.number(), corrector: v.number(), teacher: v.number() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    for (const [k, x] of [
      ["fee", args.fee],
      ["corrector", args.corrector],
      ["teacher", args.teacher],
    ] as const) {
      if (!Number.isFinite(x) || x < 0 || x > 10_000_000 || Math.round(x) !== x) fail(`Type the ${k === "fee" ? "fee" : "pay"} in whole rupees.`);
    }
    if (args.fee <= 0) fail("Type the average monthly fee first.");
    const value: Money = { fee: args.fee, corrector: args.corrector, teacher: args.teacher, at: Date.now() };
    const row = await ctx.db.query("meta").withIndex("by_key", (q) => q.eq("key", MONEY_KEY)).first();
    if (row) await ctx.db.patch(row._id, { value });
    else await ctx.db.insert("meta", { key: MONEY_KEY, value });
    return true;
  },
});

