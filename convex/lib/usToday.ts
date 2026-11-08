// How many students learned today (7 Nov 2026, Us's header: "🔥 இன்று N பேர் கற்றார்கள்"), kept by the race rows as each
// one's first XP of the day from a Level or class work comes (lib/raceRows.ts writeRow). Its own file (8 Nov 2026) so
// the race rows don't import lib/us.ts, which now gives XP through them (lib/usXp.ts): no import cycle.

import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { slDayNo } from "./day";

/** Students who learned today (meta "us.today"): kept by the race rows as each one's first XP of the day comes. */
export const US_TODAY = "us.today";
type Today = { d: number; n: number; pd?: number; pn?: number };

async function metaOf(ctx: QueryCtx, key: string) {
  return await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
}

/** How many students learned today (0 when nobody yet), and yesterday (for the owl's morning line). */
export async function todayCount(ctx: QueryCtx, now: number): Promise<{ today: number; yesterday: number }> {
  const v = (await metaOf(ctx, US_TODAY))?.value as Today | undefined;
  const d = slDayNo(now);
  if (!v) return { today: 0, yesterday: 0 };
  return { today: v.d === d ? v.n : 0, yesterday: v.d === d - 1 ? v.n : v.pd === d - 1 ? (v.pn ?? 0) : 0 };
}

/**
 * One student's XP today went from none to some (+1), or back to none (−1: a level taken back): the count of students
 * who learned today follows. Called by the race rows (lib/raceRows.ts writeRow) for real students only, with the XP of
 * Levels and class work (never Us's: a comment isn't learning a Level).
 */
export async function noteToday(ctx: MutationCtx, before: number, after: number, now: number): Promise<void> {
  const flip = before <= 0 && after > 0 ? 1 : before > 0 && after <= 0 ? -1 : 0;
  if (!flip) return;
  const d = slDayNo(now);
  const row = await metaOf(ctx, US_TODAY);
  const v = row?.value as Today | undefined;
  let next: Today;
  if (!v || v.d !== d) {
    if (flip < 0) return;
    next = { d, n: 1, ...(v ? { pd: v.d, pn: v.n } : {}) };
  } else next = { ...v, n: Math.max(0, v.n + flip) };
  if (row) await ctx.db.patch(row._id, { value: next });
  else await ctx.db.insert("meta", { key: US_TODAY, value: next });
}

/**
 * A new rank (8 Nov 2026, the ranks: his XP ever, never down): the owl's line in Us ("🧠 Bilal K இப்போது
 * சிந்தனையாளர்!", `x` = the rank's index of RANKS). Real students only (the race rows call it; lib/usXp.ts too).
 */
export async function rankMoment(ctx: MutationCtx, who: { sid: Id<"students">; n: string; g?: number; pic?: string }, rk: number, now: number): Promise<void> {
  await ctx.db.insert("usMoments", {
    k: "rank",
    sid: who.sid,
    n: who.n,
    ...(who.g !== undefined ? { g: who.g } : {}),
    ...(who.pic ? { pic: who.pic } : {}),
    x: rk,
    at: now,
    day: slDayNo(now),
    demo: false,
    c: 0,
  });
}
