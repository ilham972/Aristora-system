// Teachers' stays (3 Nov 2026, his ask: "arrived time and went time, all done by manager"): the manager (or the owner)
// marks each teacher arrived and went on the Class tab; End the session closes the rest. Each teacher's card: her day
// and her week, with the others' average (his pick: she sees only her own card; the manager and the owner see
// everyone's). The numbers are the class digests' (convex/lib/boss.ts `digestOf`): stored when a class ends, read again
// for today's classes. Never a live query: the phone reads it once and every minute while the card is open.

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { currentSession, fail, log, readDigest, STALE_SESSION_MS } from "./lib/backend";
import type { Digest, PersonDay, TSeg } from "./lib/boss";
import { DAY_MS, slClock, slDay } from "./lib/day";

const token = v.optional(v.string());
/** "Arrived 30 minutes ago": at most this far back, and an arrival moved at most this far. */
export const AGO_MAX = 120;
/** A wrong tap is taken back this long after. */
export const UNDO_MS = 5 * 60_000;
/** Her week: the classes of the last 7 days. */
const WEEK_DAYS = 7;
/** Another teacher's day counts in "the others" after this long here. */
const OTHERS_MIN = 15;

/** A teacher with a job (Correction, Theory or Evaluation) is marked here; the owner never is. */
const markable = (u: Doc<"users"> | null): u is Doc<"users"> =>
  !!u && u.role === "teacher" && u.active && u.tabs.some((t) => t !== "manager");

/** The manager (or the owner): she arrived (`here`) or went, now or `ago` minutes ago. Returns the stay, for Undo. */
export const mark = mutation({
  args: { token, userId: v.id("users"), here: v.boolean(), ago: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["manager"]);
    const now = Date.now();
    const t = await ctx.db.get(args.userId);
    if (!markable(t)) fail("Only a teacher with a job is marked here.");
    const ago = Math.round(args.ago ?? 0);
    if (!(ago >= 0 && ago <= AGO_MAX)) fail(`Between now and ${AGO_MAX} minutes ago.`);
    const at = now - ago * 60_000;
    const today = slDay(now);
    const session = await currentSession(ctx, now);
    const rows = await ctx.db
      .query("duty")
      .withIndex("by_user", (q) => q.eq("userId", t._id))
      .order("desc")
      .take(12);
    // A stay left open on an earlier day (no class closed it): we don't know when she went, so it counts nothing.
    for (const r of rows) {
      if (r.outAt === undefined && r.day !== today) await ctx.db.patch(r._id, { outAt: r.inAt, outBy: "unknown", editedAt: now });
    }
    const open = rows.find((r) => r.outAt === undefined && r.day === today);
    if (args.here) {
      if (open) fail(`${t.name} is here since ${slClock(open.inAt)}.`);
      // Back after she went: not before she went.
      const went = rows.find((r) => r.day === today && r.outAt !== undefined);
      const inAt = went ? Math.max(at, went.outAt!) : at;
      const id = await ctx.db.insert("duty", { userId: t._id, day: today, inAt, inBy: me.name, editedAt: now });
      await log(ctx, session, now, { kind: "duty", name: t.name, value: `in ${slClock(inAt)}` });
      return { id, at: inAt };
    }
    if (!open) fail(`${t.name} isn't marked here.`);
    const outAt = Math.min(now, Math.max(at, open.inAt));
    await ctx.db.patch(open._id, { outAt, outBy: me.name, editedAt: now });
    await log(ctx, session, now, { kind: "duty", name: t.name, value: `out ${slClock(outAt)}` });
    return { id: open._id, at: outAt };
  },
});

/** The manager moves today's arrival (she came earlier or later than the tap): `minutes` earlier (< 0) or later. */
export const move = mutation({
  args: { token, id: v.id("duty"), minutes: v.number() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["manager"]);
    const now = Date.now();
    const r = await ctx.db.get(args.id);
    if (!r || r.day !== slDay(now)) fail("Only today's arrival can be moved.");
    const t = await ctx.db.get(r.userId);
    const by = Math.round(args.minutes);
    if (!by || Math.abs(by) > AGO_MAX) fail(`At most ${AGO_MAX} minutes.`);
    // Not after she went (or now), not before an earlier stay of hers today ended.
    const before = (
      await ctx.db
        .query("duty")
        .withIndex("by_user", (q) => q.eq("userId", r.userId).lt("inAt", r.inAt))
        .order("desc")
        .take(1)
    ).find((x) => x.day === r.day);
    const lo = before?.outAt ?? now - AGO_MAX * 60_000 * 2;
    const hi = Math.min(r.outAt ?? now, now);
    const inAt = Math.min(hi, Math.max(lo, r.inAt + by * 60_000));
    if (inAt === r.inAt) fail(by < 0 ? "She can't have come earlier than that." : "She can't have come later than that.");
    await ctx.db.patch(r._id, { inAt, inBy: me.name, editedAt: now });
    await log(ctx, await currentSession(ctx, now), now, { kind: "duty", name: t?.name, value: `in ${slClock(inAt)} (moved)` });
    return { at: inAt };
  },
});

/** Undo a wrong tap within 5 minutes: "arrived" goes, or "went" is taken back (she is here again). */
export const undo = mutation({
  args: { token, id: v.id("duty"), what: v.union(v.literal("in"), v.literal("out")) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["manager"]);
    const now = Date.now();
    const r = await ctx.db.get(args.id);
    if (!r) fail("Already taken back.");
    if (now - r.editedAt > UNDO_MS) fail("Too late to take it back: mark it again.");
    const t = await ctx.db.get(r.userId);
    if (args.what === "in") {
      if (r.outAt !== undefined) fail(`${t?.name ?? "She"} went already.`);
      await ctx.db.delete(r._id);
    } else {
      if (r.outAt === undefined || !r.outBy || r.outBy === "class end" || r.outBy === "unknown") fail("Nothing to take back.");
      const other = (await ctx.db.query("duty").withIndex("by_day", (q) => q.eq("day", r.day)).collect()).find(
        (x) => x.userId === r.userId && x._id !== r._id && x.outAt === undefined,
      );
      if (other) fail(`${t?.name ?? "She"} is marked here again already.`);
      await ctx.db.patch(r._id, { outAt: undefined, outBy: undefined, editedAt: now });
    }
    await log(ctx, await currentSession(ctx, now), now, { kind: "duty", name: t?.name, value: `${args.what} taken back` });
    return true;
  },
});

/** One day of hers (her classes that day summed). */
export type DayLine = {
  day: string;
  hereMin: number | null;
  workMin: number | null;
  freeMin: number | null;
  missedMin: number | null;
  students: number;
  visits: number;
  lessons: number;
  levels: number;
  checks: number;
  marks: number;
  waitMin: number | null;
  waits: number;
};
/** The others (same work: room teachers with room teachers, correctors with correctors; never the owner or a manager). */
export type Others = { n: number; workPct: number | null; missedMin: number | null; perHour: number | null; students: number | null };

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const r1 = (x: number) => Math.round(x * 10) / 10;

function lineOf(day: string, ps: PersonDay[]): DayLine {
  const has = (f: keyof PersonDay) => ps.some((p) => p[f] !== undefined);
  const sum = (f: "hereMin" | "workMin" | "freeMin" | "missedMin" | "waitMin") =>
    has(f) ? r1(ps.reduce((a, p) => a + ((p[f] as number | undefined) ?? 0), 0)) : null;
  const add = (f: "students" | "visits" | "lessons" | "levels" | "checks" | "marks" | "waits") =>
    ps.reduce((a, p) => a + ((p[f] as number | undefined) ?? 0), 0);
  return {
    day,
    hereMin: sum("hereMin"),
    workMin: sum("workMin"),
    freeMin: sum("freeMin"),
    missedMin: sum("missedMin"),
    students: add("students"),
    visits: add("visits"),
    lessons: add("lessons"),
    levels: add("levels"),
    checks: add("checks"),
    marks: add("marks"),
    waitMin: sum("waitMin"),
    waits: add("waits"),
  };
}

/** Room teachers (Theory, Evaluation) or correctors: whose numbers compare with hers. */
const familyOf = (jobs: readonly string[] | undefined, room: string): "room" | "correction" =>
  jobs ? (jobs.includes("theory") || jobs.includes("evaluation") ? "room" : "correction") : room === "correction" ? "correction" : "room";

function othersOf(rows: PersonDay[], family: "room" | "correction"): Others | null {
  const xs = rows.filter((p) => (p.hereMin ?? 0) >= OTHERS_MIN && familyOf(p.jobs, p.room) === family && !p.jobs?.includes("manager"));
  if (!xs.length) return null;
  const pct = xs.filter((p) => p.workMin !== undefined && p.freeMin !== undefined).map((p) => (p.workMin! / p.hereMin!) * 100);
  const missed = xs.filter((p) => p.missedMin !== undefined).map((p) => p.missedMin!);
  const perHour = xs.map((p) => (p.levels + p.checks) / (p.hereMin! / 60));
  const workPct = avg(pct);
  const missedMin = avg(missed);
  const ph = avg(perHour);
  const students = avg(xs.map((p) => p.students));
  return {
    n: xs.length,
    workPct: workPct === null ? null : Math.round(workPct),
    missedMin: missedMin === null ? null : r1(missedMin),
    perHour: ph === null ? null : r1(ph),
    students: students === null ? null : r1(students),
  };
}

/**
 * A teacher's card: today (her stays, the numbers, her stay as a bar), her week, and the others' average. Hers only;
 * the manager and the owner may read anyone's.
 */
export const card = query({
  args: { token, userId: v.id("users") },
  handler: async (ctx, args) => {
    const me = await viewer(ctx, args.token, "any");
    const boss = me.role === "owner" || me.tabs.includes("manager");
    if (!boss && me._id !== args.userId) fail("Only your own card: the manager sees everyone's.");
    const t = await ctx.db.get(args.userId);
    if (!t || t.role !== "teacher") fail("Only teachers have a card.");
    const now = Date.now();
    const today = slDay(now);
    const stays = (
      await ctx.db
        .query("duty")
        .withIndex("by_user", (q) => q.eq("userId", t._id).gte("inAt", now - 2 * DAY_MS))
        .collect()
    )
      .filter((r) => r.day === today)
      .map((r) => ({ id: r._id, inAt: r.inAt, outAt: r.outAt ?? null, inBy: r.inBy ?? null, outBy: r.outBy ?? null, editedAt: r.editedAt }));

    // The classes of her week: kept digests; today's read again (with her stay as a bar).
    const sessions = (await ctx.db.query("sessions").withIndex("by_startedAt").order("desc").take(30)).filter(
      (s) => s.startedAt >= now - WEEK_DAYS * DAY_MS,
    );
    const byDay = new Map<string, Digest[]>();
    for (const s of sessions) {
      const day = slDay(s.startedAt);
      const live = s.open && now - s.lastActivityAt <= STALE_SESSION_MS;
      const stored = (s.report as { digest?: Digest } | undefined)?.digest;
      let d: Digest | null = null;
      if (day === today && (live || !s.open)) d = await readDigest(ctx, s, live ? now : (s.endedAt ?? s.lastActivityAt), undefined, { segs: true });
      else if (!s.open && stored?.v === 1) d = stored;
      if (!d) continue;
      (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(d);
    }
    const mine = (d: Digest) => d.people.filter((p) => p.id === t._id || (!p.id && p.name === t.name));
    const family = familyOf(t.tabs, "correction");
    const week: DayLine[] = [];
    const othersWeek: PersonDay[] = [];
    let othersToday: Others | null = null;
    let segs: TSeg[] = [];
    for (const day of [...byDay.keys()].sort()) {
      const ds = byDay.get(day)!;
      const ps = ds.flatMap(mine);
      const rest = ds.flatMap((d) => d.people.filter((p) => !mine(d).includes(p)));
      othersWeek.push(...rest);
      if (day === today) {
        othersToday = othersOf(rest, family);
        segs = ps.flatMap((p) => p.segs ?? []).sort((a, b) => a.s - b.s);
      }
      if (ps.length) week.push(lineOf(day, ps));
    }
    const todayLine = week.find((w) => w.day === today) ?? null;
    return {
      now,
      name: t.name,
      jobs: t.tabs,
      family,
      manager: t.tabs.includes("manager"),
      own: me._id === t._id,
      stays,
      today: todayLine,
      segs,
      week,
      others: { today: othersToday, week: othersOf(othersWeek, family) },
    };
  },
});
