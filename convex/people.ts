// The owner's page for people: add teachers, choose what each may do, send sign-in links, see and sign out their
// phones, clear a forgotten PIN, remove someone. Owner only.

import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { actor, LINK_MS, nameKey, viewer } from "./lib/auth";
import { cleanName, fail, log } from "./lib/backend";
import { slDay } from "./lib/day";
import { extra, tab } from "./schema";

const token = v.optional(v.string());

/** Everyone, with their phones and their newest sign-in link. */
export const list = query({
  args: { token },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner");
    const now = Date.now();
    const users = await ctx.db.query("users").collect();
    const out = [];
    for (const u of users) {
      if (!u.active) continue;
      const devices = (
        await ctx.db
          .query("devices")
          .withIndex("by_user", (q) => q.eq("userId", u._id))
          .collect()
      )
        .filter((d) => d.revokedAt === undefined)
        .map((d) => ({ _id: d._id, label: d.label, createdAt: d.createdAt, lastSeenAt: d.lastSeenAt }))
        .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
      const links = await ctx.db
        .query("links")
        .withIndex("by_user", (q) => q.eq("userId", u._id))
        .collect();
      const open = links.find((l) => l.usedAt === undefined && l.cancelledAt === undefined && l.expiresAt > now);
      out.push({
        _id: u._id,
        name: u.name,
        role: u.role,
        tabs: u.tabs,
        can: u.can,
        hasPin: !!u.pinHash,
        lockedUntil: u.lockedUntil !== undefined && u.lockedUntil > now ? u.lockedUntil : null,
        devices,
        linkUntil: open?.expiresAt ?? null,
        createdAt: u.createdAt,
      });
    }
    return out.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
  },
});

/**
 * The Class tab (the Manager page until 3 Nov 2026; everyone sees it since, only managers act on it): every teacher with
 * a job, with her jobs, when her last student went back today (her room has been free since then) and her stay today
 * (arrived / went, marked by the manager). The owner only on the days he teaches. No phones, links or PINs.
 */
export const team = query({
  args: { token },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "any");
    const now = Date.now();
    const today = slDay(now);
    const users = await ctx.db.query("users").collect();
    // Her newest finished call today (the newest 300 finished calls are plenty for one day).
    const done = await ctx.db
      .query("calls")
      .withIndex("by_status", (q) => q.eq("status", "done"))
      .order("desc")
      .take(300);
    const lastEnd = new Map<string, number>();
    for (const c of done) {
      if (!c.teacherId || c.test || c.endedAt === undefined || slDay(c.endedAt) !== today) continue;
      lastEnd.set(c.teacherId, Math.max(lastEnd.get(c.teacherId) ?? 0, c.endedAt));
    }
    // Her stay today: the open one, else her last (went).
    const stays = await ctx.db.query("duty").withIndex("by_day", (q) => q.eq("day", today)).collect();
    const stayOf = (id: string) => {
      const mine = stays.filter((s) => s.userId === id).sort((a, b) => b.inAt - a.inAt);
      const s = mine.find((x) => x.outAt === undefined) ?? mine[0];
      return s ? { id: s._id, inAt: s.inAt, outAt: s.outAt ?? null, editedAt: s.editedAt } : null;
    };
    // The teachers with a job, and the owner on the days he teaches (his switch: he can do both Theory and Evaluation).
    return users
      .filter((u) => u.active && (u.role === "teacher" ? u.tabs.some((t) => t !== "manager") : !!u.teaching))
      .map((u) => ({
        _id: u._id,
        name: u.name,
        role: u.role,
        tabs: u.role === "owner" ? (["theory", "evaluation"] as typeof u.tabs) : u.tabs,
        lastEnd: lastEnd.get(u._id) ?? null,
        stay: u.role === "owner" ? null : stayOf(u._id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** The owner: "I'm teaching today" on or off (Settings → Account, 3 Nov 2026). Only for him, about himself. */
export const setTeaching = mutation({
  args: { token, on: v.boolean() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    await ctx.db.patch(me._id, { teaching: args.on || undefined });
    await log(ctx, null, Date.now(), { kind: "teaching", value: args.on ? "on" : "off" });
    return args.on;
  },
});

async function nameFree(ctx: QueryCtx, name: string, except?: Id<"users">) {
  const same = await ctx.db
    .query("users")
    .withIndex("by_name", (q) => q.eq("nameKey", nameKey(name)))
    .filter((q) => q.eq(q.field("active"), true))
    .collect();
  if (same.some((u) => u._id !== except)) fail(`There is already a ${name}. Add an initial, like "${name} K".`);
}

/** Add a teacher with the tabs and permissions the owner ticked. */
export const add = mutation({
  args: { token, name: v.string(), tabs: v.array(tab), can: v.array(extra) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    const name = cleanName(args.name);
    if (args.tabs.length === 0) fail("Tick at least one job: Correction, Theory, Evaluation or Manager.");
    await nameFree(ctx, name);
    const count = (await ctx.db.query("users").collect()).filter((u) => u.active).length;
    if (count >= 30) fail("That's 30 people already. Remove someone first.");
    const id = await ctx.db.insert("users", {
      name,
      nameKey: nameKey(name),
      role: "teacher",
      tabs: [...new Set(args.tabs)],
      can: [...new Set(args.can)],
      active: true,
      createdAt: now,
    });
    await log(ctx, null, now, { kind: "person-add", value: name });
    return id;
  },
});

/** Change a teacher's name, tabs or permissions (works at once on their phones). */
export const update = mutation({
  args: { token, id: v.id("users"), name: v.optional(v.string()), tabs: v.optional(v.array(tab)), can: v.optional(v.array(extra)) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const u = await ctx.db.get(args.id);
    if (!u || !u.active) fail("That person was removed. Refresh the page.");
    const patch: { name?: string; nameKey?: string; tabs?: typeof u.tabs; can?: typeof u.can } = {};
    if (args.name !== undefined) {
      const name = cleanName(args.name);
      await nameFree(ctx, name, u._id);
      patch.name = name;
      patch.nameKey = nameKey(name);
    }
    if (u.role === "owner" && (args.tabs !== undefined || args.can !== undefined)) fail("The owner can always do everything.");
    if (args.tabs !== undefined) {
      if (args.tabs.length === 0) fail("Tick at least one job: Correction, Theory, Evaluation or Manager.");
      patch.tabs = [...new Set(args.tabs)];
    }
    if (args.can !== undefined) patch.can = [...new Set(args.can)];
    await ctx.db.patch(u._id, patch);
    await log(ctx, null, Date.now(), { kind: "person-edit", value: patch.name ?? u.name });
    return me._id === u._id;
  },
});

/** Remove a teacher: their phones are signed out and their links stop working. */
export const remove = mutation({
  args: { token, id: v.id("users") },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const u = await ctx.db.get(args.id);
    if (!u || !u.active) return false;
    if (u._id === me._id || u.role === "owner") fail("The owner account can't be removed.");
    const now = Date.now();
    await ctx.db.patch(u._id, { active: false });
    for (const d of await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect()) {
      if (d.revokedAt === undefined) await ctx.db.patch(d._id, { revokedAt: now });
    }
    for (const l of await ctx.db
      .query("links")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) await ctx.db.patch(l._id, { cancelledAt: now });
    }
    await log(ctx, null, now, { kind: "person-remove", value: u.name });
    return true;
  },
});

/**
 * A new sign-in link for this person. The owner's phone makes the random code and sends only its SHA-256, so the
 * code is never stored anywhere: it exists only in the link the owner sends. Older unused links stop working.
 */
export const makeLink = mutation({
  args: { token, id: v.id("users"), codeHash: v.string() },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner"]);
    const u = await ctx.db.get(args.id);
    if (!u || !u.active) fail("That person was removed. Refresh the page.");
    if (!/^[0-9a-f]{64}$/.test(args.codeHash)) fail("This phone couldn't make a safe link. Update the browser.");
    const now = Date.now();
    for (const l of await ctx.db
      .query("links")
      .withIndex("by_user", (q) => q.eq("userId", u._id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) await ctx.db.patch(l._id, { cancelledAt: now });
    }
    const taken = await ctx.db
      .query("links")
      .withIndex("by_code", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (taken) fail("Try again.");
    const expiresAt = now + LINK_MS;
    await ctx.db.insert("links", { userId: u._id, codeHash: args.codeHash, createdAt: now, expiresAt, createdBy: me._id });
    await log(ctx, null, now, { kind: "link-made", value: u.name });
    return { expiresAt };
  },
});

/** Cancel this person's unused sign-in link. */
export const cancelLink = mutation({
  args: { token, id: v.id("users") },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const now = Date.now();
    let n = 0;
    for (const l of await ctx.db
      .query("links")
      .withIndex("by_user", (q) => q.eq("userId", args.id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) {
        await ctx.db.patch(l._id, { cancelledAt: now });
        n++;
      }
    }
    return n;
  },
});

/** Sign one phone out (lost, or not theirs any more). */
export const signOutDevice = mutation({
  args: { token, deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const d = await ctx.db.get(args.deviceId);
    if (!d || d.revokedAt !== undefined) return false;
    const u = await ctx.db.get(d.userId);
    const now = Date.now();
    await ctx.db.patch(d._id, { revokedAt: now });
    await log(ctx, null, now, { kind: "device-out", value: `${u?.name ?? "?"}: ${d.label}` });
    return true;
  },
});

/** Forgotten PIN: clear it (and any lock). They set a new one after signing in with a link. */
export const clearPin = mutation({
  args: { token, id: v.id("users") },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner"]);
    const u = await ctx.db.get(args.id);
    if (!u || !u.active) fail("That person was removed. Refresh the page.");
    await ctx.db.patch(u._id, { pinHash: undefined, fails: undefined, lockedUntil: undefined });
    await log(ctx, null, Date.now(), { kind: "pin-clear", value: u.name });
    return true;
  },
});
