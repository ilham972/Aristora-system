// The family app's profile (Me, 4 Nov 2026, his voice note: "a proper profile page for the students"):
// - his photo, made small on his phone; his classmates see it only after the teachers' OK (his answer);
// - a new name, changed everywhere only after the teachers' OK (his answer: the class's name is how the hall finds him);
// - his birthday, day and month only (his pick: the owl's party, 🎂 for his teachers);
// - his days at home and in class (the map of 12 weeks), his class days and hours by month, and his report: each Stage's
//   Levels, marks and questions, in a child's words: right, learned with a teacher, still to learn (never "wrong").
// Pure rules here (tested in tests/profile.test.ts); the queries and mutations are in convex/family.ts and families.ts.

import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { DAY_MS, SL_OFFSET_MS, slDay, slDayNo, slMonth } from "./day";
import { xpItems, type World } from "./family";
import { teachState, type MQ } from "./master";

// ---- The photo ----

/** The biggest picture the server keeps: his phone makes a 288 px square of ~10–30 KB. */
export const PHOTO_MAX_BYTES = 45_000;
/** Photos one phone may send in a day: enough to try again, too few to fill the teachers' list. */
export const PHOTOS_PER_DAY = 6;
export type PhotoType = "image/jpeg" | "image/webp";

/** Why this is not a picture the server keeps (base64 of a JPEG or WebP file, small); null = fine. */
export function photoProblem(data: string, type: string): string | null {
  if (type !== "image/jpeg" && type !== "image/webp") return "Send a photo (JPEG or WebP).";
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return "That isn't a photo.";
  const bytes = (data.length / 4) * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
  if (bytes > PHOTO_MAX_BYTES) return "That photo is too big. Try again: the app makes it small.";
  if (bytes < 300) return "That isn't a photo.";
  const head = atob(data.slice(0, 16));
  const jpeg = head.charCodeAt(0) === 0xff && head.charCodeAt(1) === 0xd8 && head.charCodeAt(2) === 0xff;
  const webp = head.slice(0, 4) === "RIFF" && head.slice(8, 12) === "WEBP";
  if (type === "image/jpeg" ? !jpeg : !webp) return "That isn't a photo.";
  return null;
}

/** The picture as an image address (always one of the two types above: never a page or a script). */
export const picUrl = (p: Pick<Doc<"profilePhotos">, "data" | "type">) => `data:${p.type};base64,${p.data}`;

/** A teacher's photo by its key (8 Nov 2026): only her photo now, only while she is in the class; else null. */
export async function staffPicUrl(ctx: QueryCtx, key: string): Promise<string | null> {
  const id = ctx.db.normalizeId("staffPhotos", key);
  const p = id ? await ctx.db.get(id) : null;
  if (!p) return null;
  const u = await ctx.db.get(p.userId);
  return u?.active && u.photo?.id === p._id ? picUrl(p) : null;
}

// ---- A new name (the teachers say OK first) ----

/** The name he asks for, tidied (spaces), or why not: letters of any script, 2–30 of them, 3 words at most. */
export function askedName(raw: string): { name: string } | { why: string } {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!name) return { why: "Type a name first." };
  if ([...name].length > 30) return { why: "Keep it under 30 letters." };
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)) return { why: "Only letters, please (and a space between names)." };
  if (name.split(" ").length > 3) return { why: "Your first name and your initial: Bilal R." };
  if ([...name.replace(/[^\p{L}]/gu, "")].length < 2) return { why: "Type a name first." };
  return { name };
}

// ---- His birthday ----

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** "MM-DD" when it is a day of the year (29 Feb too), else null. */
export function cleanBday(s: string): string | null {
  const m = /^(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const mo = Number(m[1]);
  const d = Number(m[2]);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= MONTH_DAYS[mo - 1] ? s : null;
}

// ---- His days: the map of 12 weeks (home and class in one) ----

/** The map's length: 12 weeks, about a school term (not a year: a year on a phone is dots, and empty months shame). */
export const HEAT_WEEKS = 12;

/** One day of the map: Levels finished at home (⌂) and in class, their XP, and whether he came to class. */
export type HeatDay = { d: number; home: number; cls: number; xp: number; in: boolean };

/** When he finished a level (handed in, or marked in class or at home), or null (done before the app). */
export function finishedAt(lv: { done?: number; fixed?: number; pre?: number }): number | null {
  if (lv.pre !== undefined) return null;
  return lv.done ?? lv.fixed ?? null;
}

/**
 * Every Level he finished, when, and where: a workbook level (handed in or marked in class, or marked at home ⌂), and a
 * tute's ladder section checked at home (4 Nov 2026, `lh`). The same Levels as his days in a row and his Levels count.
 */
function finished(rows: Doc<"progress">[]): { t: number; home: boolean }[] {
  const out: { t: number; home: boolean }[] = [];
  for (const r of rows) {
    for (const lv of Object.values(r.m?.lv ?? {})) {
      const t = finishedAt(lv);
      if (t !== null) out.push({ t, home: lv.home !== undefined });
    }
    for (const x of Object.values(r.lh ?? {})) out.push({ t: x.t, home: true });
  }
  return out;
}

/**
 * The days since `fromDay` (Sri Lanka day numbers) with a Level finished or a visit to class; only days with something.
 * XP the way the race counts it (`xpItems`: a level's marks the day he finished it, marks won back the day he won them).
 */
export function heatDays(rows: Doc<"progress">[], visits: Pick<Doc<"attendance">, "inAt">[], fromDay: number): HeatDay[] {
  const map = new Map<number, HeatDay>();
  const at = (d: number) => {
    let x = map.get(d);
    if (!x) map.set(d, (x = { d, home: 0, cls: 0, xp: 0, in: false }));
    return x;
  };
  for (const f of finished(rows)) {
    const d = slDayNo(f.t);
    if (d < fromDay) continue;
    const x = at(d);
    if (f.home) x.home++;
    else x.cls++;
  }
  for (const i of xpItems(rows)) {
    const d = slDayNo(i.t);
    if (d >= fromDay && i.xp) at(d).xp += i.xp;
  }
  for (const v of visits) {
    const d = slDayNo(v.inAt);
    if (d >= fromDay) at(d).in = true;
  }
  return [...map.values()].sort((a, b) => a.d - b.d);
}

// ---- The questions, in a child's words ----

/** Right (full marks); learned with a teacher (explained in Evaluation, or taught in Theory); still to learn. */
export type QCounts = { right: number; learned: number; toLearn: number };

/** His corrected questions (in class or at home) corrected between `from` and `to`. */
export function questionCounts(q: Record<string, MQ> | undefined, from = 0, to = Infinity): QCounts {
  const out: QCounts = { right: 0, learned: 0, toLearn: 0 };
  for (const r of Object.values(q ?? {})) {
    if (r.t < from || r.t >= to) continue;
    const s = teachState(r);
    if (s === null) out.right++;
    else if (s === "explained" || s === "taught") out.learned++;
    else out.toLearn++;
  }
  return out;
}

// ---- His months: class days and hours, Levels, XP, questions ----

export type MonthLine = QCounts & {
  /** "2026-11" */
  m: string;
  /** Days he came to class, and the minutes he spent there. */
  days: number;
  min: number;
  /** Levels finished that month (at home ⌂ among them) and their XP. */
  levels: number;
  home: number;
  xp: number;
};

/** One visit's minutes in class (sign-in to sign-out; still in: until now), never more than 8 hours. */
function visitMin(v: Pick<Doc<"attendance">, "inAt" | "outAt">, now: number): number {
  const end = Math.min(v.outAt ?? now, v.inAt + 8 * 3_600_000, now);
  return Math.max(0, Math.round((end - v.inAt) / 60_000));
}

/** The first moment of a month in Sri Lanka ("2026-11" → 1 Nov 00:00). */
export function monthStart(m: string): number {
  return Date.parse(`${m}-01T00:00:00Z`) - SL_OFFSET_MS;
}

/** This month and the `n - 1` before it, newest first. */
export function monthLines(rows: Doc<"progress">[], visits: Pick<Doc<"attendance">, "inAt" | "outAt" | "day">[], now: number, n = 3): MonthLine[] {
  const months: string[] = [];
  let t = now;
  for (let i = 0; i < n; i++) {
    const m = slMonth(t);
    months.push(m);
    t = monthStart(m) - DAY_MS;
  }
  return months.map((m) => {
    const from = monthStart(m);
    const next = slMonth(from + 32 * DAY_MS);
    const to = monthStart(next);
    const mine = visits.filter((v) => v.inAt >= from && v.inAt < to);
    const done = finished(rows).filter((f) => f.t >= from && f.t < to);
    const levels = done.length;
    const home = done.filter((f) => f.home).length;
    const xp = xpItems(rows).reduce((a, i) => (i.t >= from && i.t < to ? a + i.xp : a), 0);
    const q: QCounts = { right: 0, learned: 0, toLearn: 0 };
    for (const r of rows) {
      const c = questionCounts(r.m?.q, from, to);
      q.right += c.right;
      q.learned += c.learned;
      q.toLearn += c.toLearn;
    }
    return {
      m,
      days: new Set(mine.map((v) => v.day)).size,
      min: mine.reduce((s, v) => s + visitMin(v, now), 0),
      levels,
      home,
      xp,
      ...q,
    };
  });
}

// ---- His report: one line per Stage he has something in ----

export type StageLine = QCounts & {
  unitId: string;
  no: number;
  ta: string;
  en: string;
  /** From the other syllabus (O/L books on a grade's map, his grade's on the O/L map). */
  other: boolean;
  /** His Stage now (the teachers' book now). */
  now: boolean;
  /** Levels in the book, and those he finished (handed in, marked, or done before the app). */
  levels: number;
  done: number;
  /** The marks of his marked levels (his XP here) out of theirs. */
  got: number;
  max: number;
  /** Levels marked at home (⌂) and in class. */
  home: number;
  cls: number;
  /** When the workbook was given to him, his first Level, and the day he finished the Stage. */
  given: number | null;
  start: number | null;
  end: number | null;
  allDone: boolean;
};

/** His report: every Stage he was given or has Levels in, in map order (his Stage now among them). */
export function stageLines(worlds: World[], rows: Doc<"progress">[]): StageLine[] {
  const out: StageLine[] = [];
  for (const w of worlds) {
    if (!w.book) continue;
    const has = w.levels.some((l) => l.s === "done" || l.s === "check" || l.s === "class" || l.s === "pre");
    if (!has && !w.now && w.given === undefined) continue;
    const m = rows.find((r) => r.unitId === w.unitId && r.stage === "master")?.m;
    let got = 0;
    let max = 0;
    let home = 0;
    let cls = 0;
    let start: number | null = null;
    let end: number | null = null;
    for (const l of w.levels) {
      if (l.s === "done" || l.s === "check") {
        got += l.got ?? 0;
        max += l.max;
      }
      const lv = m?.lv[String(l.n)];
      if (!lv) continue;
      const t = finishedAt(lv);
      if (t !== null) {
        if (lv.home !== undefined) home++;
        else cls++;
        start = start === null ? t : Math.min(start, t);
      }
      const last = t ?? lv.pre ?? null;
      if (last !== null) end = end === null ? last : Math.max(end, last);
    }
    out.push({
      unitId: w.unitId,
      no: w.no,
      ta: w.ta,
      en: w.en,
      other: !!w.other,
      now: w.now,
      levels: w.levels.length,
      done: w.levels.filter((l) => l.s === "done" || l.s === "check" || l.s === "class" || l.s === "pre").length,
      got,
      max,
      home,
      cls,
      given: w.given ?? null,
      start,
      end: w.allDone ? end : null,
      allDone: w.allDone,
      ...questionCounts(m?.q),
    });
  }
  return out;
}

/** "2026-11-03" for a day number (the map's days). */
export const dayOfNo = (d: number) => slDay(d * DAY_MS - SL_OFFSET_MS + 60_000);
