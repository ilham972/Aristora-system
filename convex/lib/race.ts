// The race (7 Nov 2026, his voice note): every student of ARISTORA on it, joined the app or not; XP from class and from
// home. Since 11 Nov 2026 three lists: his grade this week, his grade all time, and the GOAT (all of ARISTORA, all time);
// last week's champions wear a crown (👑) all week; the moves since yesterday; the grade cup (the share of each grade that
// learned this week: fair whatever a grade's books, and it pulls back the ones who stopped coming).
// - XP numbers are worked out when his XP changes (convex/lib/raceRows.ts) and read at any later moment here: no XP came
//   since, so this week's, yesterday's and last week's XP follow from the moment they were worked out.
// - Students with 0 XP this week are listed at the end with no number ("not started this week"): everyone sees who is
//   not in the race, without a "#47 of 47" to laugh at.
// Pure and import-free but for the clock: the server and the family app (board.tsx) both use it.

import { DAY_MS, monthsApart, SL_OFFSET_MS, slDayNo, slMonthBefore, slMonthStart, slWeekStart } from "./day";

const WEEK_MS = 7 * DAY_MS;

/**
 * XP numbers worked out at one moment: that week's Monday (`wk`), that day (`d`), XP that week, that week before that
 * day (`xpy`), the week before (`prev`), ever (`tot`). Since 8 Nov 2026 (the monthly most improved, Monday's ties): the
 * days he learned (the flame's days) in week `wk` as bits (`dm`: Monday = 1, Tuesday = 2 … Sunday = 64) and in the week
 * before (`dmp`); XP in the month that began at `mk` (`mo`), the month before (`m1`) and the one before that (`m2`).
 */
export type XpNums = {
  wk: number;
  d: number;
  xp: number;
  xpy: number;
  prev: number;
  tot: number;
  dm: number;
  dmp: number;
  mk: number;
  mo: number;
  m1: number;
  m2: number;
};

/** Numbers kept before 8 Nov 2026 have no days or months: none. */
export function fullNums(n: Partial<XpNums> & Pick<XpNums, "wk" | "d" | "xp" | "xpy" | "prev" | "tot">): XpNums {
  return { wk: n.wk, d: n.d, xp: n.xp, xpy: n.xpy, prev: n.prev, tot: n.tot, dm: n.dm ?? 0, dmp: n.dmp ?? 0, mk: n.mk ?? slMonthStart(n.wk), mo: n.mo ?? 0, m1: n.m1 ?? 0, m2: n.m2 ?? 0 };
}

/** Nothing yet, at `now`. */
export const zeroNums = (now: number): XpNums => ({ wk: slWeekStart(now), d: slDayNo(now), xp: 0, xpy: 0, prev: 0, tot: 0, dm: 0, dmp: 0, mk: slMonthStart(now), mo: 0, m1: 0, m2: 0 });

/** A list of XP items (`xpItems`) and the days he learned (`levelDays`: the flame's), worked out at `now`. */
export function numsOf(items: { t: number; xp: number }[], now: number, days: Iterable<number> = []): XpNums {
  const out = zeroNums(now);
  const { wk } = out;
  const today = out.d * DAY_MS - SL_OFFSET_MS;
  const mk = out.mk;
  const m1k = slMonthBefore(mk);
  const m2k = slMonthBefore(m1k);
  for (const i of items) {
    if (!i.xp) continue;
    out.tot += i.xp;
    if (i.t >= wk) {
      out.xp += i.xp;
      if (i.t < today) out.xpy += i.xp;
    } else if (i.t >= wk - WEEK_MS) out.prev += i.xp;
    if (i.t >= mk) out.mo += i.xp;
    else if (i.t >= m1k) out.m1 += i.xp;
    else if (i.t >= m2k) out.m2 += i.xp;
  }
  const monday = slDayNo(wk);
  for (const day of days) {
    const i = day - monday;
    if (i >= 0 && i < 7) out.dm |= 1 << i;
    else if (i >= -7 && i < 0) out.dmp |= 1 << (i + 7);
  }
  return out;
}

/** Numbers worked out earlier, as they stand at `now` (nothing came since: else they were worked out again). */
export function numsAt(n0: Partial<XpNums> & Pick<XpNums, "wk" | "d" | "xp" | "xpy" | "prev" | "tot">, now: number): XpNums {
  const n = fullNums(n0);
  const wk = slWeekStart(now);
  const d = slDayNo(now);
  const mk = slMonthStart(now);
  const k = monthsApart(n.mk, mk);
  const months = k === 0 ? { mo: n.mo, m1: n.m1, m2: n.m2 } : k === 1 ? { mo: 0, m1: n.mo, m2: n.m1 } : k === 2 ? { mo: 0, m1: 0, m2: n.mo } : { mo: 0, m1: 0, m2: 0 };
  if (n.wk === wk) return { wk, d, xp: n.xp, xpy: n.d === d ? n.xpy : n.xp, prev: n.prev, tot: n.tot, dm: n.dm, dmp: n.dmp, mk, ...months };
  if (n.wk === wk - WEEK_MS) return { wk, d, xp: 0, xpy: 0, prev: n.xp, tot: n.tot, dm: 0, dmp: n.dm, mk, ...months };
  return { wk, d, xp: 0, xpy: 0, prev: 0, tot: n.tot, dm: 0, dmp: 0, mk, ...months };
}

/** Several rows' numbers (each worked out at its own moment) added up at `now` (the days: any row's). */
export function addNums(list: (Partial<XpNums> & Pick<XpNums, "wk" | "d" | "xp" | "xpy" | "prev" | "tot">)[], now: number): XpNums {
  const out = zeroNums(now);
  for (const x of list) {
    const a = numsAt(x, now);
    out.xp += a.xp;
    out.xpy += a.xpy;
    out.prev += a.prev;
    out.tot += a.tot;
    out.dm |= a.dm;
    out.dmp |= a.dmp;
    out.mo += a.mo;
    out.m1 += a.m1;
    out.m2 += a.m2;
  }
  return out;
}

/** The same numbers? (a race row is written only when something changed; numbers from before 8 Nov have no days) */
export function sameNums(a0: Partial<XpNums> & Pick<XpNums, "wk" | "d" | "xp" | "xpy" | "prev" | "tot">, b0: Partial<XpNums> & Pick<XpNums, "wk" | "d" | "xp" | "xpy" | "prev" | "tot">): boolean {
  if (a0.mk === undefined || b0.mk === undefined) return false;
  const a = fullNums(a0);
  const b = fullNums(b0);
  return (
    a.wk === b.wk &&
    a.d === b.d &&
    a.xp === b.xp &&
    a.xpy === b.xpy &&
    a.prev === b.prev &&
    a.tot === b.tot &&
    a.dm === b.dm &&
    a.dmp === b.dmp &&
    a.mk === b.mk &&
    a.mo === b.mo &&
    a.m1 === b.m1 &&
    a.m2 === b.m2
  );
}

/** How many days a week's bits hold. */
export function daysIn(mask: number): number {
  let n = 0;
  for (let m = mask; m; m &= m - 1) n++;
  return n;
}

/**
 * One student in the race, as the phone gets it: id, name (first name and initial), grade, XP this week, XP this week
 * before today (`y`: the moves), last week (`p`: the crowns), his photo's key (OK'd and shown), 🎂 today, weeks won in
 * his grade (`w`) and in ARISTORA (`wa`).
 */
export type RaceRow = {
  id: string;
  n: string;
  g: number | null;
  xp: number;
  y: number;
  p: number;
  pic?: string;
  bd?: true;
  w?: number;
  wa?: number;
  /** Of `xp` and `p`: the XP that came from Us (8 Nov 2026), left out of the grade cup (it counts who learned Levels). */
  u?: number;
  up?: number;
  /**
   * XP ever (`t`, 8 Nov 2026: what he keeps for good; the all-time lists and the GOAT, 11 Nov 2026), the days he learned
   * this week (`dd`) and last week (`dp`: Monday's coins, a tie). Missing on a server from before.
   */
  t?: number;
  dd?: number;
  dp?: number;
};

/** A row in its list: its place (null = not started this week) and how it moved since yesterday. */
export type Placed = {
  r: RaceRow;
  rank: number | null;
  /** Places up (+) or down (−) since yesterday; "new" = no XP yesterday; null = no move to show. */
  move: number | "new" | null;
};

const byXp = (key: (r: RaceRow) => number) => (a: RaceRow, b: RaceRow) => key(b) - key(a) || a.n.localeCompare(b.n);

/** Equal XP share a place (1, 2, 2, 4); rows in order, best first. */
function places(rows: RaceRow[], key: (r: RaceRow) => number): Map<string, number> {
  const out = new Map<string, number>();
  rows.forEach((r, i) => out.set(r.id, i > 0 && key(r) === key(rows[i - 1]) ? out.get(rows[i - 1].id)! : i + 1));
  return out;
}

/** A list (one grade, or everyone) in race order: XP this week, then name; the ones on 0 XP last, with no place. */
export function placed(rows: RaceRow[]): Placed[] {
  const racing = rows.filter((r) => r.xp > 0).sort(byXp((r) => r.xp));
  const now = places(racing, (r) => r.xp);
  const before = rows.filter((r) => r.y > 0).sort(byXp((r) => r.y));
  const then = places(before, (r) => r.y);
  const out: Placed[] = racing.map((r) => {
    const was = then.get(r.id);
    const rank = now.get(r.id)!;
    return { r, rank, move: was === undefined ? "new" : was === rank ? null : was - rank };
  });
  for (const r of rows.filter((x) => x.xp <= 0).sort((a, b) => a.n.localeCompare(b.n))) out.push({ r, rank: null, move: null });
  return out;
}

/** Last week's champions of a list: the most XP last week (ties share it); nobody when nobody made XP. */
export function champsOf(rows: RaceRow[]): Set<string> {
  const best = Math.max(0, ...rows.map((r) => r.p));
  return new Set(best > 0 ? rows.filter((r) => r.p === best).map((r) => r.id) : []);
}

/** The ones he passes next: the row above him in his list and the XP it takes (null at the top or before he starts). */
export function passOf(list: Placed[], me: string): { above: Placed | null; gap: number } {
  const i = list.findIndex((x) => x.r.id === me);
  if (i < 0) return { above: null, gap: 0 };
  const mine = list[i];
  // Not started: the last one racing is the one to pass (1 XP more than him).
  const above = mine.rank === null ? ([...list].reverse().find((x) => x.rank !== null) ?? null) : list.slice(0, i).reverse().find((x) => x.r.xp > mine.r.xp) ?? null;
  return { above, gap: above ? above.r.xp - mine.r.xp + 1 : 0 };
}

/** The grades of ARISTORA (the O/L students are in Grade 10 or 11). */
export const RACE_GRADES = [6, 7, 8, 9, 10, 11];

/** One grade in the cup: students who learned this week (XP), out of the grade. */
export type Cup = { g: number; n: number; of: number };

/**
 * The grade cup: the share of each grade that made XP this week (`xp`), or last week (`p`), best first (then more
 * students, then the lower grade). Only grades with students.
 */
export function cupOf(rows: RaceRow[], week: "now" | "last" = "now"): Cup[] {
  const out: Cup[] = [];
  for (const g of RACE_GRADES) {
    const mine = rows.filter((r) => r.g === g);
    if (!mine.length) continue;
    // XP from Levels and class work: Us's XP (comments, answers on Us) never makes a student "learned" for the cup.
    out.push({ g, n: mine.filter((r) => (week === "now" ? r.xp - (r.u ?? 0) : r.p - (r.up ?? 0)) > 0).length, of: mine.length });
  }
  return out.sort((a, b) => b.n / b.of - a.n / a.of || b.n - a.n || a.g - b.g);
}

/** "18 of 20" as a whole percentage. */
export const cupPct = (c: Cup) => (c.of ? Math.round((c.n / c.of) * 100) : 0);

/** One of a finished week's champions: his place (1–3) in his grade's list (`g`) or ARISTORA's (`a`). */
export type Champ = { id: string; n: string; g: number | null; xp: number; k: "g" | "a"; place: number };

/**
 * Last week's champions from everyone's rows (their `p`): each grade's top 3 and ARISTORA's top 3 (equal XP share a
 * place, so a place can hold two), and the grade cup. The #1s are the champions (👑, a week won, a gift).
 */
export function championsOf(rows: RaceRow[]): { top: Champ[]; cup: Cup[] } {
  const top: Champ[] = [];
  const add = (list: RaceRow[], k: "g" | "a") => {
    for (const x of placed(list.map((r) => ({ ...r, xp: r.p, y: 0 })))) {
      if (x.rank !== null && x.rank <= 3) top.push({ id: x.r.id, n: x.r.n, g: x.r.g, xp: x.r.xp, k, place: x.rank });
    }
  };
  for (const g of RACE_GRADES) add(rows.filter((r) => r.g === g), "g");
  add(rows, "a");
  return { top, cup: cupOf(rows, "last") };
}

/** The grades that won a week's cup: the best share (ties share it), none when nobody learned. */
export function cupWinners(cup: Cup[]): number[] {
  const best = cup.reduce((m, c) => Math.max(m, c.of ? c.n / c.of : 0), 0);
  return best > 0 ? cup.filter((c) => c.of && c.n / c.of === best).map((c) => c.g) : [];
}

// ---- All time and the GOAT (11 Nov 2026, his voice note: students saw the week's list start from zero and thought
// "everything is gone"; his answers: the leagues and the rank badges out; each grade's list this week AND all time; the
// GOAT = ARISTORA's all-time #1 over every grade, a badge that moves the moment someone passes him; each grade's weekly
// #1 wins the owner's coins, never two weeks running). What he earned is his XP ever (`t`), never reset. ----

/** His XP ever (0 on a row from a server before 8 Nov 2026). */
export const everOf = (r: Pick<RaceRow, "t">): number => r.t ?? 0;

/**
 * A list by XP ever (the all-time lists): the week's places and moves, on XP ever (each row's `xp` is then his XP ever;
 * yesterday's = XP ever less what came today). Nobody with 0 XP ever gets a place.
 */
export function placedEver(rows: RaceRow[]): Placed[] {
  return placed(rows.map((r) => ({ ...r, xp: everOf(r), y: Math.max(0, everOf(r) - Math.max(0, r.xp - r.y)) })));
}

/** The GOAT: the most XP ever in all of ARISTORA (equal XP: the name, as every list); null before anyone learned. */
export function goatOf<T extends { n: string; t?: number }>(rows: T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    const t = r.t ?? 0;
    if (t <= 0) continue;
    if (!best || t > (best.t ?? 0) || (t === (best.t ?? 0) && r.n.localeCompare(best.n) < 0)) best = r;
  }
  return best;
}

/** His place among his grade's XP ever (null: no XP ever yet) and how many are in the grade. */
export function everPlace(rows: RaceRow[], me: string, grade: number | null): { place: number | null; of: number } {
  const list = placedEver(rows.filter((r) => r.g !== null && r.g === grade));
  return { place: list.find((x) => x.r.id === me)?.rank ?? null, of: list.length };
}

/** A grade's weekly coins: who won them (last week's XP `xp`). */
export type WeekWin = { g: number; id: string; n: string; xp: number };

/**
 * The week's coin winners (Monday): in each grade, last week's #1 (XP, then days learned, then XP ever, then the name;
 * nobody without XP), except the one who won that grade's coins the week before (`last`): then the next one.
 */
export function weekWinners(rows: RaceRow[], last: Set<string>): WeekWin[] {
  const out: WeekWin[] = [];
  for (const g of RACE_GRADES) {
    const best = rows
      .filter((r) => r.g === g && r.p > 0 && !last.has(r.id))
      .sort((a, b) => b.p - a.p || (b.dp ?? 0) - (a.dp ?? 0) || everOf(b) - everOf(a) || a.n.localeCompare(b.n))[0];
    if (best) out.push({ g, id: best.id, n: best.n, xp: best.p });
  }
  return out;
}

/** The weekly coins until the owner sets them (Settings → Race): 50 = what 250 XP pays on Monday. */
export const WEEK_COINS = 50;
