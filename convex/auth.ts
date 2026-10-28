// Signing in and out. A phone signs in once and stays signed in:
//   - the owner, the very first time, with the one-time setup code;
//   - a teacher, by tapping the sign-in link the owner sent on WhatsApp (one use, 24 hours);
//   - anyone with a PIN, by name and PIN (5 wrong PINs lock it for a while).
// The phone makes its own random token and sends it here; only its SHA-256 is stored.

import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  actor,
  checkPin,
  checkToken,
  deviceOf,
  EXTRAS,
  nameKey,
  normalizeCode,
  pinHash,
  publicUser,
  secretHash,
  TABS,
} from "./lib/auth";
import { cleanName, fail, log, rememberActor } from "./lib/backend";
import { ownerSetupHash } from "./lib/owner";

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60_000;
const MAX_LOCK_MS = 24 * 60 * 60_000;

function cleanLabel(raw: string | undefined): string {
  const label = (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  return label || "Phone";
}

async function addDevice(ctx: MutationCtx, user: Doc<"users">, token: string, label: string | undefined, now: number) {
  checkToken(token);
  const tokenHash = secretHash("token", token);
  const taken = await ctx.db
    .query("devices")
    .withIndex("by_token", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (taken) fail("Try again.");
  const id = await ctx.db.insert("devices", { userId: user._id, tokenHash, label: cleanLabel(label), createdAt: now, lastSeenAt: now });
  rememberActor(ctx, user.name);
  return id;
}

/** This phone's person (null when signed out), and whether the owner has been set up. */
export const me = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const s = await deviceOf(ctx, args.token);
    if (s) return { user: { ...publicUser(s.user), deviceId: s.device._id }, setupDone: true };
    const any = await ctx.db.query("users").first();
    return { user: null, setupDone: !!any };
  },
});

/** The very first account: the owner, with the setup code. Refused once anyone has an account. */
export const setupOwner = mutation({
  args: { code: v.string(), name: v.string(), pin: v.string(), token: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    if (await ctx.db.query("users").first()) fail("The owner account is already set up. Sign in with your name and PIN.");
    if (secretHash("setup", normalizeCode(args.code)) !== ownerSetupHash()) fail("That setup code is wrong. Check it and try again.");
    const name = cleanName(args.name);
    checkPin(args.pin);
    const id = await ctx.db.insert("users", {
      name,
      nameKey: nameKey(name),
      role: "owner",
      tabs: TABS,
      can: EXTRAS,
      active: true,
      createdAt: now,
    });
    await ctx.db.patch(id, { pinHash: pinHash(id, args.pin) });
    const user = (await ctx.db.get(id))!;
    await addDevice(ctx, user, args.token, args.label, now);
    await log(ctx, null, now, { kind: "owner-setup", value: name });
    return { name };
  },
});

async function linkOf(ctx: QueryCtx, code: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(code)) return null;
  return await ctx.db
    .query("links")
    .withIndex("by_code", (q) => q.eq("codeHash", secretHash("link", code)))
    .first();
}

function linkProblem(link: Doc<"links"> | null, user: Doc<"users"> | null, now: number): string | null {
  if (!link || !user || !user.active) return "This sign-in link doesn't work. Ask the owner for a new one.";
  if (link.usedAt !== undefined) return "This sign-in link was already used. Ask the owner for a new one.";
  if (link.cancelledAt !== undefined) return "This sign-in link was replaced by a newer one. Use the newest link.";
  if (now > link.expiresAt) return "This sign-in link is more than a day old. Ask the owner for a new one.";
  return null;
}

/** Whose sign-in link this is (before tapping Sign in), or why it doesn't work. */
export const peekLink = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const link = await linkOf(ctx, args.code);
    const user = link ? await ctx.db.get(link.userId) : null;
    const problem = linkProblem(link, user, Date.now());
    return problem ? { name: null, problem } : { name: user!.name, problem: null };
  },
});

/** Sign this phone in with a sign-in link. */
export const useLink = mutation({
  args: { code: v.string(), token: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const link = await linkOf(ctx, args.code);
    const user = link ? await ctx.db.get(link.userId) : null;
    const problem = linkProblem(link, user, now);
    if (problem) fail(problem);
    await ctx.db.patch(link!._id, { usedAt: now });
    await addDevice(ctx, user!, args.token, args.label, now);
    await log(ctx, null, now, { kind: "sign-in", value: "link" });
    return { name: user!.name, hasPin: !!user!.pinHash };
  },
});

/** Sign this phone in with name and PIN. */
export const signInPin = mutation({
  args: { name: v.string(), pin: v.string(), token: v.string(), label: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const wrong = "That name and PIN don't match. Check both and try again.";
    const user = await ctx.db
      .query("users")
      .withIndex("by_name", (q) => q.eq("nameKey", nameKey(args.name)))
      .filter((q) => q.eq(q.field("active"), true))
      .first();
    if (!user || !user.pinHash) fail(wrong);
    if (user.lockedUntil !== undefined && now < user.lockedUntil) {
      const min = Math.ceil((user.lockedUntil - now) / 60_000);
      fail(`Too many wrong PINs. Try again in ${min} minute${min === 1 ? "" : "s"}, or ask the owner for a sign-in link.`);
    }
    if (!/^\d{6}$/.test(args.pin) || pinHash(user._id, args.pin) !== user.pinHash) {
      const fails = (user.fails ?? 0) + 1;
      const lockedUntil = fails >= MAX_FAILS ? now + Math.min(MAX_LOCK_MS, LOCK_MS * 2 ** (fails - MAX_FAILS)) : undefined;
      await ctx.db.patch(user._id, { fails, lockedUntil });
      // A wrong PIN must be saved, so it can't throw (that would undo the count): it answers instead.
      return { ok: false as const, error: lockedUntil ? `Too many wrong PINs. Try again in ${Math.ceil((lockedUntil - now) / 60_000)} minutes, or ask the owner for a sign-in link.` : wrong };
    }
    await ctx.db.patch(user._id, { fails: undefined, lockedUntil: undefined });
    await addDevice(ctx, user, args.token, args.label, now);
    await log(ctx, null, now, { kind: "sign-in", value: "pin" });
    return { ok: true as const, name: user.name };
  },
});

/** Set or change your own PIN (changing needs the old one). */
export const setPin = mutation({
  args: { token: v.optional(v.string()), pin: v.string(), old: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await actor(ctx, args.token, ["any"]);
    if (user.pinHash && (!args.old || pinHash(user._id, args.old) !== user.pinHash)) fail("Your old PIN is wrong.");
    checkPin(args.pin);
    await ctx.db.patch(user._id, { pinHash: pinHash(user._id, args.pin), fails: undefined, lockedUntil: undefined });
    await log(ctx, null, Date.now(), { kind: "pin-set" });
    return true;
  },
});

/** Sign this phone out. */
export const signOut = mutation({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const s = await deviceOf(ctx, args.token);
    if (!s) return true;
    const now = Date.now();
    await ctx.db.patch(s.device._id, { revokedAt: now });
    rememberActor(ctx, s.user.name);
    await log(ctx, null, now, { kind: "sign-out", value: s.device.label });
    return true;
  },
});
