// The race rows, kept ready (7 Nov 2026). Every mutation tells this file what it wrote (convex/lib/fn.ts): a progress
// row → its part's XP numbers again, then his race row adds his parts up; a student's name, grade, photo, birthday or
// removal → his race row's copy. A student whose race row is missing or built with older rules (`RACE_V`) is built
// again from all his rows. So the race reads one small row per student, and a write works out only what it touched.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isBirthday } from "./day";
import { levelDays, xpItems, xpRow } from "./family";
import { levelOn } from "./quests";
import { addNums, daysIn, fullNums, goatOf, numsAt, numsOf, sameNums, WEEK_COINS, type RaceRow, type XpNums } from "./race";
import { noteToday } from "./usToday";

/**
 * The XP rules the rows were built with: a change of rules (what counts as XP) adds 1, and every row is built again.
 * 2 (8 Nov 2026): the numbers also keep the days he learned (the league's 🛡️) and XP by month (the monthly most improved).
 */
export const RACE_V = 2;

/** Fields of a student row his race row copies (a patch touching any of them copies them again). */
export const RACE_IDENTITY = ["name", "grade", "archived", "demo", "test", "photo", "photoHide", "bday", "sex"] as const;

/** What a mutation wrote that the race cares about. */
export type RaceWrites = {
  /** Progress rows written (inserted, patched, replaced). */
  progress: Set<string>;
  /** Progress rows deleted. */
  progressGone: Set<string>;
  /** Students inserted or whose copied fields changed. */
  students: Set<string>;
  /** Students deleted. */
  studentsGone: Set<string>;
};

export const noWrites = (): RaceWrites => ({ progress: new Set(), progressGone: new Set(), students: new Set(), studentsGone: new Set() });

/** His row's copy of who he is (a field he doesn't have is left out). */
export function identityOf(s: Doc<"students">): { n: string; g?: number; demo: boolean; gone: boolean; pic?: string; bd?: string; sx?: "b" | "g" } {
  return {
    n: s.name,
    ...(typeof s.grade === "number" ? { g: s.grade } : {}),
    demo: !!s.demo || !!s.test,
    gone: !!s.archived,
    ...(s.photo && !s.photoHide ? { pic: s.photo.id as string } : {}),
    ...(s.bday ? { bd: s.bday } : {}),
    // Boy or girl (8 Nov 2026): who he may message, without reading every student row.
    ...(s.sex ? { sx: s.sex } : {}),
  };
}

/** One progress row's XP numbers now, with the days it made him learn (a row that makes no XP: zeros). */
export function partOf(p: Doc<"progress">, now: number): XpNums {
  return xpRow(p) ? numsOf(xpItems([p]), now, levelDays([p])) : numsOf([], now);
}

/** The numbers of a stored row (a part, a race row, its Us part): every field, none from before 8 Nov 2026 missing. */
export const numsOfRow = (x: Partial<XpNums> & Pick<XpNums, "wk" | "d" | "xp" | "xpy" | "prev" | "tot">): XpNums => fullNums(x);

export async function raceRowOf(ctx: QueryCtx, sid: Id<"students">) {
  return await ctx.db
    .query("raceRows")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .first();
}

async function partsOf(ctx: QueryCtx, sid: Id<"students">) {
  return await ctx.db
    .query("raceParts")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .collect();
}

/** Writes a progress row's part (or takes it away); says whose it is. `doc` = the row, when the caller has it. */
async function writePart(ctx: MutationCtx, pid: Id<"progress">, now: number, doc?: Doc<"progress">): Promise<Id<"students"> | null> {
  const part = await ctx.db
    .query("raceParts")
    .withIndex("by_pid", (q) => q.eq("pid", pid))
    .first();
  const p = doc ?? (await ctx.db.get(pid));
  if (!p) {
    if (part) await ctx.db.delete(part._id);
    return part?.sid ?? null;
  }
  const nums = partOf(p, now);
  const spot = spotOf(p);
  if (!part) await ctx.db.insert("raceParts", { pid, sid: p.studentId, ...nums, ...spot });
  else if (!sameNums(numsOfRow(part), nums) || part.sid !== p.studentId || part.u !== spot.u || part.on !== spot.on)
    await ctx.db.patch(part._id, { sid: p.studentId, ...nums, u: spot.u, on: spot.on });
  return p.studentId;
}

/** Where he is on a Stage's road (14 Nov 2026): a workbook's row only (the road's classmates, family.road). */
export function spotOf(p: Doc<"progress">): { u?: Id<"units">; on?: number } {
  return p.stage === "master" && p.m ? { u: p.unitId, on: levelOn(p.m) } : {};
}

/**
 * The parts from before the road (14 Nov 2026) get their spot once (meta "roadV"): a page of parts a run, the next at
 * once, from race.fill. Each part reads its progress row; a part already right is left alone.
 */
export async function fillSpots(ctx: MutationCtx, cursor: string | null): Promise<string | null> {
  const page = await ctx.db.query("raceParts").paginate({ cursor, numItems: SPOTS_PER_RUN });
  for (const part of page.page) {
    if (part.u !== undefined) continue;
    const p = await ctx.db.get(part.pid);
    if (!p) continue;
    const spot = spotOf(p);
    if (spot.u !== undefined) await ctx.db.patch(part._id, spot);
  }
  return page.isDone ? null : page.continueCursor;
}
/** Parts a run of fillSpots. */
export const SPOTS_PER_RUN = 100;

/**
 * How many students each grade has in the race (20 Nov 2026, 200 students): a chat group's member count read one row,
 * never every student's race row at each open. `r` the real class, `d` the demo class (test students too): grade →
 * students (a student with no grade is in no count). Built again whenever a race row comes, goes, or changes grade.
 */
export const COUNTS_KEY = "raceCounts";
export type RaceCounts = { r: Record<string, number>; d: Record<string, number> };

export async function raceCounts(ctx: QueryCtx): Promise<RaceCounts | null> {
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", COUNTS_KEY))
    .first();
  const v = m?.value as Partial<RaceCounts> | undefined;
  return v && v.r && v.d ? { r: v.r, d: v.d } : null;
}

/** Counts every grade's race rows again; written only if a number changed. */
export async function noteCounts(ctx: MutationCtx): Promise<void> {
  const c: RaceCounts = { r: {}, d: {} };
  for (const demo of [false, true]) {
    const to = demo ? c.d : c.r;
    for (const r of await ctx.db
      .query("raceRows")
      .withIndex("by_list", (q) => q.eq("demo", demo).eq("gone", false))
      .collect()) {
      if (r.g !== undefined) to[r.g] = (to[r.g] ?? 0) + 1;
    }
  }
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", COUNTS_KEY))
    .first();
  if (m && JSON.stringify(m.value) === JSON.stringify(c)) return;
  if (m) await ctx.db.patch(m._id, { value: c });
  else await ctx.db.insert("meta", { key: COUNTS_KEY, value: c });
}

/**
 * His race row from his parts (and his student row's copy when asked, or when the row is new). True when the row came,
 * went, or changed grade or class (the grades' counts follow).
 */
async function writeRow(ctx: MutationCtx, sid: Id<"students">, now: number, copy: boolean): Promise<boolean> {
  const row = await raceRowOf(ctx, sid);
  const parts = (await partsOf(ctx, sid)).map(numsOfRow);
  // Levels and class work; then with Us's part (8 Nov 2026: lib/usXp.ts keeps it on the row itself).
  const learned = addNums(parts, now);
  const nums = row?.us ? addNums([...parts, numsOfRow(row.us)], now) : learned;
  // Us (7 Nov 2026): his first XP of the day (or a level taken back to none) moves the count of who learned today:
  // Levels and class work only (a comment isn't learning a Level).
  const was = row ? numsAt(numsOfRow(row), now) : null;
  const wasUs = row?.us ? numsAt(numsOfRow(row.us), now) : null;
  const wasToday = was ? was.xp - was.xpy - (wasUs ? wasUs.xp - wasUs.xpy : 0) : 0;
  const today = async (real: boolean) => {
    if (real) await noteToday(ctx, wasToday, learned.xp - learned.xpy, now);
  };
  if (!row || copy) {
    const s = await ctx.db.get(sid);
    if (!s) {
      if (row) await ctx.db.delete(row._id);
      return !!row;
    }
    const who = identityOf(s);
    await today(!who.demo && !who.gone);
    if (!row) {
      await ctx.db.insert("raceRows", { sid, ...who, ...nums, v: RACE_V });
      return true;
    }
    // A field he no longer has (no grade, his photo removed or hidden, his birthday cleared) goes from the copy too.
    await ctx.db.patch(row._id, { g: undefined, pic: undefined, bd: undefined, sx: undefined, ...who, ...nums });
    return row.g !== who.g || row.gone !== who.gone || row.demo !== who.demo;
  }
  await today(!row.demo && !row.gone);
  if (!sameNums(numsOfRow(row), nums)) await ctx.db.patch(row._id, nums);
  return false;
}

/**
 * Builds his parts and his race row again from all his rows (a missing row, older rules, the first fill). True when
 * his row came, went or changed grade: the caller counts the grades again (`noteCounts`), once for all its students.
 */
export async function rebuildStudent(ctx: MutationCtx, sid: Id<"students">, now: number): Promise<boolean> {
  const rows = await ctx.db
    .query("progress")
    .withIndex("by_student", (q) => q.eq("studentId", sid))
    .collect();
  const have = new Set(rows.map((r) => r._id as string));
  for (const part of await partsOf(ctx, sid)) if (!have.has(part.pid)) await ctx.db.delete(part._id);
  for (const r of rows) await writePart(ctx, r._id, now, r);
  const row = await raceRowOf(ctx, sid);
  if (row && row.v !== RACE_V) await ctx.db.patch(row._id, { v: RACE_V });
  return await writeRow(ctx, sid, now, true);
}

/** After a mutation: its writes reach the race rows (convex/lib/fn.ts calls this as the mutation ends). */
export async function afterWrites(ctx: MutationCtx, w: RaceWrites, now: number): Promise<void> {
  if (!w.progress.size && !w.progressGone.size && !w.students.size && !w.studentsGone.size) return;
  const touched = new Set<Id<"students">>();
  let counts = false;
  for (const sid of w.studentsGone) {
    const id = ctx.db.normalizeId("students", sid);
    if (!id) continue;
    const row = await raceRowOf(ctx, id);
    if (row) {
      await ctx.db.delete(row._id);
      counts = true;
    }
    for (const part of await partsOf(ctx, id)) await ctx.db.delete(part._id);
  }
  for (const pid of [...w.progress, ...w.progressGone]) {
    const id = ctx.db.normalizeId("progress", pid);
    const sid = id ? await writePart(ctx, id, now) : null;
    if (sid && !w.studentsGone.has(sid)) touched.add(sid);
  }
  const copy = new Set<string>();
  for (const sid of w.students) {
    const id = ctx.db.normalizeId("students", sid);
    if (id && !w.studentsGone.has(sid)) {
      touched.add(id);
      copy.add(sid);
    }
  }
  for (const sid of touched) {
    const row = await raceRowOf(ctx, sid);
    // No row yet, or built with older rules: all his rows (else his total would miss the rows written before).
    if (!row || row.v !== RACE_V) {
      if (await rebuildStudent(ctx, sid, now)) counts = true;
    } else if (await writeRow(ctx, sid, now, copy.has(sid))) counts = true;
  }
  if (counts) await noteCounts(ctx);
}

/** Is every student's race row built with today's rules? (meta "raceV": the fill sets it once none is left) */
export async function raceReady(ctx: QueryCtx): Promise<boolean> {
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "raceV"))
    .first();
  return m?.value === RACE_V;
}

/** A race row as the phone gets it, at `now`. */
export function raceRowOut(r: Doc<"raceRows">, now: number): RaceRow {
  const x = numsAt(numsOfRow(r), now);
  // Us's part (8 Nov 2026): in the race, never in the grade cup (cupOf takes it out).
  const u = r.us ? numsAt(numsOfRow(r.us), now) : null;
  const dd = daysIn(x.dm);
  return {
    id: r.sid,
    n: r.n,
    g: r.g ?? null,
    xp: x.xp,
    y: x.xpy,
    p: x.prev,
    ...(u?.xp ? { u: u.xp } : {}),
    ...(u?.prev ? { up: u.prev } : {}),
    ...(r.pic ? { pic: r.pic } : {}),
    ...(isBirthday(r.bd, now) ? { bd: true as const } : {}),
    ...(r.w ? { w: r.w } : {}),
    ...(r.wa ? { wa: r.wa } : {}),
    // XP ever (8 Nov 2026; the all-time lists and the GOAT, 11 Nov 2026), the days he learned this week and last week.
    t: x.tot,
    ...(dd ? { dd } : {}),
    ...(daysIn(x.dmp) ? { dp: daysIn(x.dmp) } : {}),
  };
}

/**
 * Everyone in the race (the real class, or the demo class for a demo phone), at `now`: from the race rows once they are
 * all built; before that (the first minutes after this came), worked out the old way from every student's rows.
 */
export async function raceList(ctx: QueryCtx, demo: boolean, now: number): Promise<RaceRow[]> {
  if (await raceReady(ctx)) {
    const rows = await ctx.db
      .query("raceRows")
      .withIndex("by_list", (q) => q.eq("demo", demo).eq("gone", false))
      .collect();
    return rows.map((r) => raceRowOut(r, now));
  }
  const out: RaceRow[] = [];
  const students = await ctx.db
    .query("students")
    .withIndex("by_archived", (q) => q.eq("archived", false))
    .collect();
  for (const s of students) {
    const who = identityOf(s);
    if (who.demo !== demo) continue;
    const rows = await ctx.db
      .query("progress")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect();
    const mine = rows.filter(xpRow);
    const x = numsOf(xpItems(mine), now, levelDays(mine));
    out.push({
      id: s._id,
      n: who.n,
      g: who.g ?? null,
      xp: x.xp,
      y: x.xpy,
      p: x.prev,
      ...(who.pic ? { pic: who.pic } : {}),
      ...(isBirthday(who.bd, now) ? { bd: true as const } : {}),
      t: x.tot,
      ...(daysIn(x.dm) ? { dd: daysIn(x.dm) } : {}),
      ...(daysIn(x.dmp) ? { dp: daysIn(x.dmp) } : {}),
    });
  }
  return out;
}

/**
 * His place in his grade's all-time list and how many are in it (the same as `everPlace` over his grade's rows: equal
 * XP share a place, nobody on 0 XP ever has one), reading only the rows ahead of him and the grades' counts (ready race
 * rows only: `raceReady` first).
 */
export async function everPlaceOf(ctx: QueryCtx, sid: Id<"students">, demo: boolean, grade: number): Promise<{ place: number | null; of: number }> {
  const counts = await raceCounts(ctx);
  const of =
    counts?.[demo ? "d" : "r"][grade] ??
    (
      await ctx.db
        .query("raceRows")
        .withIndex("by_grade_tot", (q) => q.eq("demo", demo).eq("gone", false).eq("g", grade))
        .collect()
    ).length;
  const mine = await raceRowOf(ctx, sid);
  if (!mine || mine.gone || mine.demo !== demo || mine.g !== grade || mine.tot <= 0) return { place: null, of };
  const ahead = await ctx.db
    .query("raceRows")
    .withIndex("by_grade_tot", (q) => q.eq("demo", demo).eq("gone", false).eq("g", grade).gt("tot", mine.tot))
    .collect();
  return { place: ahead.length + 1, of };
}

/**
 * The GOAT's row (the most XP ever; equal XP: the name, as `goatOf`), from the top of the `by_tot` index: the few rows
 * with the highest XP ever, never every student's (ready race rows only: `raceReady` first).
 */
export async function goatRow(ctx: QueryCtx, demo: boolean, now: number): Promise<RaceRow | null> {
  const top: Doc<"raceRows">[] = [];
  for await (const r of ctx.db
    .query("raceRows")
    .withIndex("by_tot", (q) => q.eq("demo", demo).eq("gone", false))
    .order("desc")) {
    if (r.tot <= 0 || (top.length && r.tot !== top[0].tot)) break;
    top.push(r);
  }
  return goatOf(top.map((r) => raceRowOut(r, now)));
}

/** Do classmates see a student's marks on his profile? (meta "mateMarks", Settings → Race; unset = yes) */
export async function mateMarksOn(ctx: QueryCtx): Promise<boolean> {
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "mateMarks"))
    .first();
  return m?.value !== false;
}

/** The weekly coins each grade's #1 wins (meta "giftPrizes" `wc`, Settings → Race; unset = WEEK_COINS; 0 = none). */
export async function weekCoinsOf(ctx: QueryCtx): Promise<number> {
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "giftPrizes"))
    .first();
  const wc = (m?.value as { wc?: unknown } | undefined)?.wc;
  return typeof wc === "number" ? wc : WEEK_COINS;
}
