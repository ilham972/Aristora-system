// The race (7 Nov 2026, his voice note): every student of ARISTORA on it, joined the app or not; XP from class and from
// home; two lists, his grade and the whole ARISTORA ("like the world ranking of a game, institute-wide"); last week's
// champions wear a crown (👑) all week; the moves since yesterday; the grade cup (the share of each grade that learned
// this week: fair whatever a grade's books, and it pulls back the ones who stopped coming).
// - XP numbers are worked out when his XP changes (convex/lib/raceRows.ts) and read at any later moment here: no XP came
//   since, so this week's, yesterday's and last week's XP follow from the moment they were worked out.
// - Students with 0 XP this week are listed at the end with no number ("not started this week"): everyone sees who is
//   not in the race, without a "#47 of 47" to laugh at.
// Pure and import-free but for the clock: the server and the family app (board.tsx) both use it.

import { DAY_MS, SL_OFFSET_MS, slDayNo, slWeekStart } from "./day";

const WEEK_MS = 7 * DAY_MS;

/** XP numbers worked out at one moment: that week's Monday (`wk`), that day (`d`), XP that week, that week before that
 * day (`xpy`), the week before (`prev`), ever (`tot`). */
export type XpNums = { wk: number; d: number; xp: number; xpy: number; prev: number; tot: number };

/** A list of XP items (`xpItems`), worked out at `now`. */
export function numsOf(items: { t: number; xp: number }[], now: number): XpNums {
  const wk = slWeekStart(now);
  const d = slDayNo(now);
  const today = d * DAY_MS - SL_OFFSET_MS;
  const out: XpNums = { wk, d, xp: 0, xpy: 0, prev: 0, tot: 0 };
  for (const i of items) {
    if (!i.xp) continue;
    out.tot += i.xp;
    if (i.t >= wk) {
      out.xp += i.xp;
      if (i.t < today) out.xpy += i.xp;
    } else if (i.t >= wk - WEEK_MS) out.prev += i.xp;
  }
  return out;
}

/** Numbers worked out earlier, as they stand at `now` (nothing came since: else they were worked out again). */
export function numsAt(n: XpNums, now: number): XpNums {
  const wk = slWeekStart(now);
  const d = slDayNo(now);
  if (n.wk === wk) return { wk, d, xp: n.xp, xpy: n.d === d ? n.xpy : n.xp, prev: n.prev, tot: n.tot };
  if (n.wk === wk - WEEK_MS) return { wk, d, xp: 0, xpy: 0, prev: n.xp, tot: n.tot };
  return { wk, d, xp: 0, xpy: 0, prev: 0, tot: n.tot };
}

/** Several rows' numbers (each worked out at its own moment) added up at `now`. */
export function addNums(list: XpNums[], now: number): XpNums {
  const out: XpNums = { wk: slWeekStart(now), d: slDayNo(now), xp: 0, xpy: 0, prev: 0, tot: 0 };
  for (const x of list) {
    const a = numsAt(x, now);
    out.xp += a.xp;
    out.xpy += a.xpy;
    out.prev += a.prev;
    out.tot += a.tot;
  }
  return out;
}

/** The same numbers? (a race row is written only when something changed) */
export const sameNums = (a: XpNums, b: XpNums) =>
  a.wk === b.wk && a.d === b.d && a.xp === b.xp && a.xpy === b.xpy && a.prev === b.prev && a.tot === b.tot;

/**
 * One student in the race, as the phone gets it: id, name (first name and initial), grade, XP this week, XP this week
 * before today (`y`: the moves), last week (`p`: the crowns), his photo's key (OK'd and shown), 🎂 today, weeks won in
 * his grade (`w`) and in ARISTORA (`wa`).
 */
export type RaceRow = { id: string; n: string; g: number | null; xp: number; y: number; p: number; pic?: string; bd?: true; w?: number; wa?: number };

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
    out.push({ g, n: mine.filter((r) => (week === "now" ? r.xp : r.p) > 0).length, of: mine.length });
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
