// Accounts: who may use the app, and what each person may do.
//
// A phone signs in once and stays signed in: it makes a random token (in the browser), keeps it, and sends it with
// every request. The database keeps only the token's SHA-256, so a copy of the database can't sign anyone in.
// Every query and mutation checks the token and the permission it needs, here.

import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { fail, rememberActor } from "./backend";
import { sha256Hex } from "./sha256";

export type Tab = "correction" | "theory" | "evaluation";
export type Extra = "students" | "books" | "reports";
/** "any" = any signed-in person; "owner" = the owner only. */
export type Perm = Tab | Extra | "owner" | "any";

export const TABS: Tab[] = ["correction", "theory", "evaluation"];
export const EXTRAS: Extra[] = ["students", "books", "reports"];

/** The exact words every signed-out request fails with (the phones look for them). */
export const SIGNED_OUT = "This phone is signed out. Sign in again.";

/** A phone not used for this long is signed out. */
export const DEVICE_IDLE_MS = 120 * 24 * 60 * 60_000;
/** Sign-in links work this long, once. */
export const LINK_MS = 24 * 60 * 60_000;
/** Keep a phone's "last used" within this much (saves writes). */
const SEEN_EVERY_MS = 10 * 60_000;

const PERM_WORDS: Record<Exclude<Perm, "any">, string> = {
  correction: "the Correction tab",
  theory: "the Theory tab",
  evaluation: "the Evaluation tab",
  students: "Students (add, rename, remove)",
  books: "Books",
  reports: "Reports and History",
  owner: "the owner",
};

/** SHA-256 of a secret, tagged by what it is (a token can never pass as a link code). */
export function secretHash(kind: "token" | "link" | "setup" | "family-link" | "family-token", secret: string): string {
  return sha256Hex(`aristora:${kind}:${secret}`);
}

export function pinHash(userId: string, pin: string): string {
  return sha256Hex(`aristora:pin:${userId}:${pin}`);
}

/** The owner setup code as typed: any case, spaces and dashes ignored, O read as 0 and I or L as 1. */
export function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
}

/** Tokens and link codes are made by the phone: 32 random bytes in base64url (or longer). */
export function checkToken(token: string): void {
  if (!/^[A-Za-z0-9_-]{40,128}$/.test(token)) fail("This phone couldn't make a safe sign-in key. Update the browser.");
}

export function checkPin(pin: string): void {
  if (!/^\d{6}$/.test(pin)) fail("The PIN must be 6 digits.");
  if (/^(\d)\1{5}$/.test(pin) || "0123456789".includes(pin) || "9876543210".includes(pin)) {
    fail("That PIN is too easy to guess. Choose another.");
  }
}

export function nameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

export function allowed(user: Doc<"users">, perm: Perm): boolean {
  if (user.role === "owner" || perm === "any") return true;
  if (perm === "owner") return false;
  if ((TABS as string[]).includes(perm)) return user.tabs.includes(perm as Tab);
  return user.can.includes(perm as Extra);
}

/** The signed-in phone and its person, or null. */
export async function deviceOf(
  ctx: QueryCtx,
  token: string | undefined,
): Promise<{ device: Doc<"devices">; user: Doc<"users"> } | null> {
  if (!token || token.length < 40 || token.length > 128) return null;
  const device = await ctx.db
    .query("devices")
    .withIndex("by_token", (q) => q.eq("tokenHash", secretHash("token", token)))
    .first();
  if (!device || device.revokedAt !== undefined) return null;
  if (Date.now() - device.lastSeenAt > DEVICE_IDLE_MS) return null;
  const user = await ctx.db.get(device.userId);
  if (!user || !user.active) return null;
  return { device, user };
}

function check(user: Doc<"users">, perms: Perm[]): void {
  if (perms.length === 0 || perms.some((p) => allowed(user, p))) return;
  const need = perms.filter((p): p is Exclude<Perm, "any"> => p !== "any").map((p) => PERM_WORDS[p]);
  fail(`This needs ${need.join(" or ")}. Ask the owner.`);
}

/** Queries: the signed-in person, if they have one of these permissions. */
export async function viewer(ctx: QueryCtx, token: string | undefined, ...perms: Perm[]): Promise<Doc<"users">> {
  const s = await deviceOf(ctx, token);
  if (!s) fail(SIGNED_OUT);
  check(s.user, perms);
  return s.user;
}

/**
 * Mutations: the signed-in person, if they have one of these permissions. `by` is the tab the phone says it is
 * working in; it must be one of theirs. Also keeps the phone's "last used" time and names them in the history.
 */
export async function actor(
  ctx: MutationCtx,
  token: string | undefined,
  perms: Perm[],
  by?: string,
): Promise<Doc<"users">> {
  const s = await deviceOf(ctx, token);
  if (!s) fail(SIGNED_OUT);
  check(s.user, perms);
  if (by && (TABS as string[]).includes(by) && !allowed(s.user, by as Tab)) {
    fail(`You don't have ${PERM_WORDS[by as Tab]}. Ask the owner.`);
  }
  const now = Date.now();
  if (now - s.device.lastSeenAt > SEEN_EVERY_MS) await ctx.db.patch(s.device._id, { lastSeenAt: now });
  rememberActor(ctx, s.user.name);
  return s.user;
}

/** What a phone may know about its own person. */
export function publicUser(user: Doc<"users">) {
  return {
    _id: user._id,
    name: user.name,
    role: user.role,
    tabs: user.role === "owner" ? TABS : user.tabs,
    can: user.role === "owner" ? EXTRAS : user.can,
    hasPin: !!user.pinHash,
  };
}

// ---- Family phones (the family app, app.aristora.org) ----
// A family phone sees one student: its own child. Its token lives in familyDevices (never in devices), hashed with
// its own tag, so it can never pass viewer() or actor(): every teacher function stays closed to it.

/** What a signed-out family phone is told (the family app looks for these words). */
export const FAMILY_SIGNED_OUT = "This phone is signed out of ARISTORA. Ask the class for a new link.";
/** Family links work this long, once. */
export const FAMILY_LINK_MS = 7 * 24 * 60 * 60_000;

/** The family phone and its student, or null (unknown, signed out, unused for 120 days, or the student removed). */
export async function familyOf(
  ctx: QueryCtx,
  token: string | undefined,
): Promise<{ device: Doc<"familyDevices">; student: Doc<"students"> } | null> {
  if (!token || token.length < 40 || token.length > 128) return null;
  const device = await ctx.db
    .query("familyDevices")
    .withIndex("by_token", (q) => q.eq("tokenHash", secretHash("family-token", token)))
    .first();
  if (!device || device.revokedAt !== undefined) return null;
  if (Date.now() - device.lastSeenAt > DEVICE_IDLE_MS) return null;
  const student = await ctx.db.get(device.studentId);
  if (!student || student.archived) return null;
  return { device, student };
}

/** Family queries: the student this phone belongs to. */
export async function familyViewer(ctx: QueryCtx, token: string | undefined): Promise<Doc<"students">> {
  const s = await familyOf(ctx, token);
  if (!s) fail(FAMILY_SIGNED_OUT);
  return s.student;
}

/** Family mutations: the student this phone belongs to; keeps the phone's "last used" time. */
export async function familyActor(ctx: MutationCtx, token: string | undefined): Promise<Doc<"students">> {
  const s = await familyOf(ctx, token);
  if (!s) fail(FAMILY_SIGNED_OUT);
  const now = Date.now();
  if (now - s.device.lastSeenAt > SEEN_EVERY_MS) await ctx.db.patch(s.device._id, { lastSeenAt: now });
  rememberActor(ctx, `family of ${s.student.name}`);
  return s.student;
}
