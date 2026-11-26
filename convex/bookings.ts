// Bookings from the website (26 Nov 2026: the O/L Prediction Paper 2026, booked on aristora.org/ol-prediction-2026
// until 30 November). The founder's words: "instead of Google Form ... in our Aristora system app ... we have settings
// page ... create another page for bookings ... this is just for temporary".
//
// `add` is open ON PURPOSE (docs/making-changes.md, Security audit): the website has no sign-in. It can only add one
// booking: every field checked (lib/bookings.ts), the same number and name kept once, a hidden field for robots, at most
// BOOK_DAY_CAP a day; it reads nothing back but the booking's own code. Everything else is the owner's
// (Settings → Bookings): the list, the count on the gear, the confirmed tick, removing a test.

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { fail } from "./lib/backend";
import { BOOK_DAY_CAP, cleanBooking, sameName } from "./lib/bookings";

const token = v.optional(v.string());
const DAY_MS = 24 * 60 * 60_000;

/** A booking from the website's form. Returns its code (the first one when the same person booked before). */
export const add = mutation({
  args: {
    item: v.string(),
    name: v.string(),
    phone: v.string(),
    ref: v.string(),
    code: v.string(),
    /** A field people never see: a robot fills it in (then nothing is kept, and it is told all went well). */
    hp: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ code: string; again: boolean }> => {
    const b = cleanBooking(args);
    if (typeof b === "string") fail(b);
    if (args.hp) return { code: b.code, again: false };
    const mine = await ctx.db
      .query("bookings")
      .withIndex("by_phone", (q) => q.eq("phone", b.phone))
      .collect();
    const before = mine.find((r) => r.item === b.item && sameName(r.name, b.name));
    if (before) return { code: before.code, again: true };
    const now = Date.now();
    const today = await ctx.db
      .query("bookings")
      .withIndex("by_at", (q) => q.gt("at", now - DAY_MS))
      .take(BOOK_DAY_CAP);
    if (today.length >= BOOK_DAY_CAP) fail("Too many bookings today. Please message ARISTORA on WhatsApp.");
    await ctx.db.insert("bookings", { ...b, at: now });
    return { code: b.code, again: false };
  },
});

export type BookingRow = {
  id: Id<"bookings">;
  item: string;
  name: string;
  phone: string;
  ref: string;
  code: string;
  at: number;
  /** When he ticked it confirmed (after his WhatsApp call), or null. */
  ok: number | null;
};
const row = (r: Doc<"bookings">): BookingRow => ({
  id: r._id,
  item: r.item,
  name: r.name,
  phone: r.phone,
  ref: r.ref,
  code: r.code,
  at: r.at,
  ok: r.ok ?? null,
});

/** Settings → Bookings: every booking, the newest first (the owner). `seenAt` = the newest he had seen before. */
export const list = query({
  args: { token },
  handler: async (ctx, args): Promise<{ seenAt: number; items: BookingRow[] }> => {
    const me = await viewer(ctx, args.token, "owner");
    const rows = await ctx.db.query("bookings").withIndex("by_at").order("desc").take(2000);
    return { seenAt: me.bookingsSeenAt ?? 0, items: rows.map(row) };
  },
});

/**
 * How many came since he last opened Settings → Bookings (the count on the gear; 99 at most), and the newest booking of
 * all (read or not: the app chimes when it changes, also while the Bookings page itself has just marked it read).
 */
export const newCount = query({
  args: { token },
  handler: async (ctx, args): Promise<{ n: number; last: { name: string; ref: string; at: number } | null }> => {
    const me = await viewer(ctx, args.token, "owner");
    const since = me.bookingsSeenAt ?? 0;
    const rows = await ctx.db
      .query("bookings")
      .withIndex("by_at", (q) => q.gt("at", since))
      .take(99);
    const l = await ctx.db.query("bookings").withIndex("by_at").order("desc").first();
    return { n: rows.length, last: l ? { name: l.name, ref: l.ref, at: l.at } : null };
  },
});

/** He has seen them up to `at` (never moves back). */
export const seen = mutation({
  args: { token, at: v.number() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const at = Math.min(args.at, Date.now());
    if (at > (me.bookingsSeenAt ?? 0)) await ctx.db.patch(me._id, { bookingsSeenAt: at });
    return true;
  },
});

/** After his WhatsApp call: confirmed (the commission counts these), or not any more. */
export const confirm = mutation({
  args: { token, id: v.id("bookings"), ok: v.boolean() },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const r = await ctx.db.get(args.id);
    if (!r) fail("That booking is gone.");
    await ctx.db.patch(args.id, { ok: args.ok ? Date.now() : undefined });
    return true;
  },
});

/** A test or a mistake, gone for good. */
export const remove = mutation({
  args: { token, id: v.id("bookings") },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    if (await ctx.db.get(args.id)) await ctx.db.delete(args.id);
    return true;
  },
});
