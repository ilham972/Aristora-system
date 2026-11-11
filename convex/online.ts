// Online, last seen and time in the family app (12 Nov 2026): the arithmetic and his decisions are in lib/appTime.ts.
// `beat` (the phone, once a minute while the app is on the screen, and `bye` when it leaves) keeps his stays and answers
// who is online now; `usage` and `usageDay` give a profile's bars and a day's stays (his own always; a classmate's only
// while the owner's switch is on: Settings → Race); `sweep` drops stays older than KEEP_DAYS.

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { query, type QueryCtx } from "./_generated/server";
import { familyActor, familyViewer } from "./lib/auth";
import { fail } from "./lib/backend";
import { DAY_MS, slDayNo } from "./lib/day";
import { internalMutation, mutation } from "./lib/fn";
import { BAR_DAYS, beatOn, dayBars, isOnline, KEEP_DAYS, ONLINE_MS, type DayBar } from "./lib/appTime";

const token = v.optional(v.string());

/** The owner's switch (Settings → Race): classmates see online, last seen and app time. On unless he turned it off. */
export async function seenOn(ctx: QueryCtx): Promise<boolean> {
  const m = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", "seenOn"))
    .first();
  return m?.value !== false;
}

/** His last stay (null: never in the app since this came). */
async function lastStay(ctx: QueryCtx, sid: Id<"students">): Promise<Doc<"appTime"> | null> {
  return await ctx.db
    .query("appTime")
    .withIndex("by_sid", (q) => q.eq("sid", sid))
    .order("desc")
    .first();
}

/** When he was last in the app and whether he is in it now. */
export async function seenOf(ctx: QueryCtx, sid: Id<"students">, now = Date.now()): Promise<{ at: number | null; on: boolean }> {
  const last = await lastStay(ctx, sid);
  return { at: last ? last.to : null, on: isOnline(last, now) };
}

/** Who is in the app now (the real class, or the demo class for a demo phone). */
async function onlineNow(ctx: QueryCtx, me: Doc<"students">, now: number): Promise<string[]> {
  const rows = await ctx.db
    .query("appTime")
    .withIndex("by_to", (q) => q.gte("to", now - ONLINE_MS))
    .collect();
  const latest = new Map<Id<"students">, Doc<"appTime">>();
  for (const r of rows) {
    const b = latest.get(r.sid);
    if (!b || r.to > b.to || (r.to === b.to && r._creationTime > b._creationTime)) latest.set(r.sid, r);
  }
  const out: string[] = [];
  for (const [sid, r] of latest) {
    if (!isOnline(r, now)) continue;
    const s = await ctx.db.get(sid);
    if (!s || s.archived || !!s.demo !== !!me.demo || !!s.test !== !!me.test) continue;
    out.push(sid);
  }
  return out;
}

/**
 * The phone's beat: the time since the last one added to his stay (`lv`: inside a Level; `bye`: he left the app).
 * Answers who is online now (only while the owner's switch is on; himself always counts as online).
 */
export const beat = mutation({
  args: { token, lv: v.optional(v.boolean()), bye: v.optional(v.boolean()) },
  handler: async (ctx, args): Promise<{ show: boolean; on: string[] }> => {
    const me = await familyActor(ctx, args.token);
    const now = Date.now();
    const last = await lastStay(ctx, me._id);
    const r = beatOn(last, now, !!args.lv, !!args.bye);
    if ("add" in r) await ctx.db.insert("appTime", { sid: me._id, ...r.add });
    else if (last) await ctx.db.patch(last._id, r.patch);
    const show = await seenOn(ctx);
    if (args.bye || !show) return { show, on: [] };
    return { show, on: await onlineNow(ctx, me, now) };
  },
});

/** May this phone's child see this student's time? His own always; a classmate while the switch is on. */
async function whose(ctx: QueryCtx, tokenIn: string | undefined, id: string): Promise<{ s: Doc<"students">; own: boolean }> {
  const me = await familyViewer(ctx, tokenIn);
  if (id === "me") return { s: me, own: true };
  const sid = ctx.db.normalizeId("students", id);
  const s = sid ? await ctx.db.get(sid) : null;
  if (!s || s.archived || !!s.demo !== !!me.demo || !!s.test !== !!me.test) fail("This student isn't in the race.");
  const own = s._id === me._id;
  if (!own && !(await seenOn(ctx))) fail("Only he sees his own app time.");
  return { s, own };
}

export type Usage = {
  /** Today (a Sri Lanka day number), his last 30 days' bars (oldest first), when he was last in the app. */
  today: number;
  bars: DayBar[];
  seen: { at: number | null; on: boolean };
};

/** A profile's bars: his last BAR_DAYS days in the app (and inside Levels). */
export const usage = query({
  args: { token, id: v.string() },
  handler: async (ctx, args): Promise<Usage> => {
    const { s } = await whose(ctx, args.token, args.id);
    const now = Date.now();
    const today = slDayNo(now);
    const stays = await ctx.db
      .query("appTime")
      .withIndex("by_sid_day", (q) => q.eq("sid", s._id).gte("day", today - BAR_DAYS + 1))
      .collect();
    return { today, bars: dayBars(stays, now), seen: await seenOf(ctx, s._id, now) };
  },
});

export type UsageStay = { from: number; to: number; ms: number; lv: number; on: boolean };

/** One day's stays (a bar tapped): when he came into the app and left it, his time and his time inside Levels. */
export const usageDay = query({
  args: { token, id: v.string(), day: v.number() },
  handler: async (ctx, args): Promise<{ day: number; stays: UsageStay[] }> => {
    const { s } = await whose(ctx, args.token, args.id);
    const now = Date.now();
    const today = slDayNo(now);
    if (!Number.isInteger(args.day) || args.day > today || args.day < today - BAR_DAYS + 1) fail("That day is too long ago.");
    const rows = await ctx.db
      .query("appTime")
      .withIndex("by_sid_day", (q) => q.eq("sid", s._id).eq("day", args.day))
      .collect();
    const last = await lastStay(ctx, s._id);
    const stays = rows
      .sort((a, b) => a.from - b.from)
      .map((r) => ({ from: r.from, to: r.to, ms: r.ms, lv: r.lv, on: !!last && last._id === r._id && isOnline(r, now) }));
    return { day: args.day, stays };
  },
});

/** Stays older than KEEP_DAYS go (daily; a run deletes at most 500 and schedules the next). */
export const sweep = internalMutation({
  args: {},
  handler: async (ctx) => {
    const old = await ctx.db
      .query("appTime")
      .withIndex("by_to", (q) => q.lt("to", Date.now() - KEEP_DAYS * DAY_MS))
      .take(500);
    for (const r of old) await ctx.db.delete(r._id);
    if (old.length === 500) await ctx.scheduler.runAfter(1000, internal.online.sweep, {});
    return old.length;
  },
});
