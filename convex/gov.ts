// The government's own textbook, unit by unit (23 Nov 2026; the rules and the why are in convex/lib/gov.ts).
// The app's side is deliberately thin, so none of this can make a phone slower:
// - `has`: which units have a book, and how big it is. Numbers only, no pages. Settings → Books reads it to colour
//   the unit's number; it is the only live query that ever touches this.
// - `book`: the pages themselves, read once when he taps the book open on Settings → Books → T. Never live.
// - `drop`: the owner throws a unit's book away (a wrong chapter uploaded).
// The upload, and the AI's reading, go through the Claude link (convex/link.ts, `ask`/`tell` "gov").

import { v } from "convex/values";
import { query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { mutation } from "./lib/fn";
import { actor, viewer } from "./lib/auth";
import { currentSession, fail, log, touch } from "./lib/backend";
import { govWords } from "./lib/gov";

const token = v.optional(v.string());

/** Which units have the government's book: one small row each, no pages. */
export const has = query({
  args: { token },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "books");
    const rows = await ctx.db.query("govBooks").collect();
    return rows.map((r) => ({ unitId: r.unitId, pages: r.pages, bytes: r.bytes, from: r.from, updatedAt: r.updatedAt }));
  },
});

/** One unit's book, whole, for opening it on his phone. Read once (never a live query): it carries the pages. */
export const book = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "books");
    const row = await ctx.db
      .query("govBooks")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .first();
    if (!row) return null;
    const parts = await ctx.db
      .query("govParts")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .collect();
    parts.sort((a, b) => a.i - b.i);
    return { pages: row.pages, bytes: row.bytes, from: row.from, parts: parts.map((p) => p.b64) };
  },
});

/** The owner throws a unit's book away (the wrong chapter went up). */
export const drop = mutation({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const unit = await ctx.db.get(args.unitId);
    const row = await ctx.db
      .query("govBooks")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .first();
    if (!unit || !row) fail("That unit has no government book.");
    await dropGov(ctx, args.unitId);
    const session = await currentSession(ctx, now);
    await log(ctx, session, now, { kind: "book-save", by: "owner", unit: unit!.key, value: `Government book taken off (${govWords(row!.pages, row!.bytes)})` });
    await touch(ctx, session, now);
    return { ok: true };
  },
});

/** A unit's book and every part of it, gone (shared with the Claude link's save, which clears before it writes). */
export async function dropGov(ctx: MutationCtx, unitId: Id<"units">): Promise<void> {
  const row = await ctx.db
    .query("govBooks")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .first();
  if (row) await ctx.db.delete(row._id);
  const parts = await ctx.db
    .query("govParts")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .collect();
  for (const p of parts) await ctx.db.delete(p._id);
}
