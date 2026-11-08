// XP from Us (8 Nov 2026, his answers to "should Us activity give XP in the race?": "first option and second option,
// not for thumbs or clap"). What a teacher ticks is learning: his answer to her question (+5), his help on a doubt (+10),
// his 💡 post shown to everyone (+5). And his own words in the talk: +1 a comment, 20 a day at most (my warning that
// comments get farmed with prizes on the race was given; the guards: one-tap words never count, two words at least,
// never the same words twice, a teacher removing it takes it back, the owner's switch in Settings → Community).
// - One usXp row per thing that gave XP (its `ref`), so taking it back takes the same XP from the same day.
// - His race row keeps the sum as its `us` part, added to its numbers: the race, his XP this week and ever count it;
//   the flame, "who learned today" and the grade cup don't (they are about Levels: lib/raceRows.ts, lib/race.ts).

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { DAY_MS, SL_OFFSET_MS, slDayNo, slMonthBefore, slWeekStart } from "./day";
import { numsAt, rankOf, zeroNums, type XpNums } from "./race";
import { numsOfRow, RACE_V, raceRowOf, rebuildStudent } from "./raceRows";
import { rankMoment } from "./usToday";

/** His answer to a teacher's question, marked right. */
export const XP_ANSWER = 5;
/** His reply on a doubt, marked right (he helped). */
export const XP_HELP = 10;
/** His 💡 post, shown to everyone by a teacher's ✓. */
export const XP_LEARN = 5;
/** A comment in his own words. */
export const XP_COMMENT = 1;
/** Comments give at most this much XP a day. */
export const COMMENT_XP_A_DAY = 20;
/** usXp rows are kept this long (nothing older can be taken back: its line is gone). */
export const XP_ROWS_KEEP_MS = 31 * DAY_MS;

export type UsXpKind = Doc<"usXp">["k"];

const zero = (now: number): XpNums => zeroNums(now);

/**
 * Numbers as they stand at `now`, with `xp` added (or taken: below 0) for something of time `t`. Never below 0. The days
 * he learned stay as they were (a comment isn't learning a Level); the month's XP moves with it (8 Nov 2026).
 */
export function shifted(n: XpNums, xp: number, t: number, now: number): XpNums {
  const a = numsAt(n, now);
  const today = slDayNo(now) * DAY_MS - SL_OFFSET_MS;
  const out: XpNums = { ...a, tot: Math.max(0, a.tot + xp) };
  if (t >= a.wk) {
    out.xp = Math.max(0, a.xp + xp);
    if (t < today) out.xpy = Math.max(0, a.xpy + xp);
  } else if (t >= a.wk - 7 * DAY_MS) out.prev = Math.max(0, a.prev + xp);
  const m1k = slMonthBefore(a.mk);
  if (t >= a.mk) out.mo = Math.max(0, a.mo + xp);
  else if (t >= m1k) out.m1 = Math.max(0, a.m1 + xp);
  else if (t >= slMonthBefore(m1k)) out.m2 = Math.max(0, a.m2 + xp);
  return out;
}

/** His race row's Us part and its numbers move by `xp` (for something of time `t`). A missing or old row is built first. */
async function moveRow(ctx: MutationCtx, sid: Id<"students">, xp: number, t: number, now: number): Promise<void> {
  let row = await raceRowOf(ctx, sid);
  if (!row || row.v !== RACE_V) {
    await rebuildStudent(ctx, sid, now);
    row = await raceRowOf(ctx, sid);
  }
  if (!row) return;
  const us = shifted(row.us ? numsOfRow(row.us) : zero(now), xp, t, now);
  const nums = shifted(numsOfRow(row), xp, t, now);
  // His rank (8 Nov 2026): Us's XP counts in his XP ever, so it can bring a new rank (never take one away).
  const kept = row.rk ?? rankOf(numsAt(numsOfRow(row), now).tot);
  const rk = Math.max(kept, rankOf(nums.tot));
  await ctx.db.patch(row._id, { ...nums, us, rk });
  if (rk > kept && !row.demo && !row.gone) await rankMoment(ctx, { sid, n: row.n, ...(row.g !== undefined ? { g: row.g } : {}), ...(row.pic ? { pic: row.pic } : {}) }, rk, now);
}

/** XP for one thing (once per thing and kind). Says how much it gave. */
export async function giveXp(ctx: MutationCtx, sid: Id<"students">, xp: number, k: UsXpKind, ref: string, now: number): Promise<number> {
  if (xp <= 0) return 0;
  const had = await ctx.db
    .query("usXp")
    .withIndex("by_ref", (q) => q.eq("ref", ref))
    .collect();
  if (had.some((h) => h.k === k)) return 0;
  await ctx.db.insert("usXp", { sid, at: now, xp, k, ref });
  await moveRow(ctx, sid, xp, now, now);
  return xp;
}

/** The XP one thing gave goes back (a ✓ taken back: its kind; a comment or a post removed: all). Says how much. */
export async function takeXp(ctx: MutationCtx, ref: string, now: number, k?: UsXpKind): Promise<number> {
  const had = await ctx.db
    .query("usXp")
    .withIndex("by_ref", (q) => q.eq("ref", ref))
    .collect();
  let n = 0;
  for (const h of had) {
    if (k && h.k !== k) continue;
    await ctx.db.delete(h._id);
    await moveRow(ctx, h.sid, -h.xp, h.at, now);
    n += h.xp;
  }
  return n;
}

/** XP his comments gave today (the cap). */
export async function commentXpToday(ctx: QueryCtx, sid: Id<"students">, now: number): Promise<number> {
  const start = slDayNo(now) * DAY_MS - SL_OFFSET_MS;
  const rows = await ctx.db
    .query("usXp")
    .withIndex("by_sid", (q) => q.eq("sid", sid).gte("at", start))
    .collect();
  return rows.reduce((a, r) => (r.k === "c" ? a + r.xp : a), 0);
}

/** His XP from Us this week and ever (his race row's Us part). */
export async function usNow(ctx: QueryCtx, sid: Id<"students">, now: number): Promise<{ xp: number; tot: number }> {
  const row = await raceRowOf(ctx, sid);
  if (!row?.us) return { xp: 0, tot: 0 };
  const a = numsAt(numsOfRow(row.us), now);
  return { xp: a.xp, tot: a.tot };
}

/** His XP from Us each day of this week, Monday first (Me's bars add it to his Levels'). */
export async function usDays(ctx: QueryCtx, sid: Id<"students">, now: number): Promise<number[]> {
  const days = [0, 0, 0, 0, 0, 0, 0];
  const wk = slWeekStart(now);
  const monday = slDayNo(wk);
  const rows = await ctx.db
    .query("usXp")
    .withIndex("by_sid", (q) => q.eq("sid", sid).gte("at", wk))
    .collect();
  for (const r of rows) {
    const d = slDayNo(r.at) - monday;
    if (d >= 0 && d < 7) days[d] += r.xp;
  }
  return days;
}

/** Old XP rows go (us.sweep): nothing can take them back once their line is gone. Deletes done. */
export async function sweepXp(ctx: MutationCtx, now: number, max: number): Promise<number> {
  const old = await ctx.db
    .query("usXp")
    .withIndex("by_at", (q) => q.lt("at", now - XP_ROWS_KEEP_MS))
    .take(max);
  for (const r of old) await ctx.db.delete(r._id);
  return old.length;
}
