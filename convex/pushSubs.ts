// Phone alerts, the database side (7 Nov 2026; the rules in lib/push.ts, the sending in push.ts):
//   key       -> the public key his phone subscribes with (null until the server made one: then `prepare`).
//   prepare   -> asks the server to make its keys (once; push.makeKeys).
//   add       -> this phone wants alerts for this child (the bell → Turn on): the browser's push address and keys.
//   remove    -> no more alerts for this child on this phone (signing out, or the bell → Turn off).
//   test      -> his own test alert (12 Nov 2026: the bell → Test alert): a real one to his phones in a few seconds,
//                shown even with the app open, so he hears the phone's real sound.
//   who       -> for the teachers' app (Settings → Community → Phone alerts): which students are reached, which not.
//   saveKeys, take, sent, drop -> for push.ts only (internal): keep the keys; take a waiting alert with its phones;
//                keep each phone's result; forget a dead address.

import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { internalMutation, mutation } from "./lib/fn";
import { DEVICE_IDLE_MS, FAMILY_SIGNED_OUT, familyOf, familyViewer, viewer } from "./lib/auth";
import { fail } from "./lib/backend";
import { pushPayload, PUSH_PHONES, PUSH_TEST_EVERY_MS, PUSH_TEST_TEXT, PUSH_TEST_WAIT_MS, VAPID_KEY } from "./lib/push";
import { internal } from "./_generated/api";

const token = v.optional(v.string());
type Keys = { pub: string; priv: string };
const isKeys = (x: unknown): x is Keys => !!x && typeof (x as Keys).pub === "string" && typeof (x as Keys).priv === "string";
/** A key made less than this ago is still being made: `prepare` doesn't ask twice. */
const MAKING_MS = 60_000;

/** The public key (null = not made yet). Never the private one. */
export const key = query({
  args: { token },
  handler: async (ctx, args): Promise<string | null> => {
    await familyViewer(ctx, args.token);
    const row = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", VAPID_KEY))
      .first();
    return isKeys(row?.value) ? row.value.pub : null;
  },
});

/** The server makes its keys (the first phone that turns alerts on asks; then it reads `key` again). */
export const prepare = mutation({
  args: { token },
  handler: async (ctx, args) => {
    if (!(await familyOf(ctx, args.token))) fail(FAMILY_SIGNED_OUT);
    const rows = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", VAPID_KEY))
      .collect();
    if (rows.some((r) => isKeys(r.value))) return true;
    const now = Date.now();
    const making = rows.find((r) => typeof (r.value as { making?: number })?.making === "number");
    if (making && now - (making.value as { making: number }).making < MAKING_MS) return true;
    if (making) await ctx.db.patch(making._id, { value: { making: now } });
    else await ctx.db.insert("meta", { key: VAPID_KEY, value: { making: now } });
    await ctx.scheduler.runAfter(0, internal.push.makeKeys, {});
    return true;
  },
});

/** Kept once; a second maker (a race) keeps the first keys. */
export const saveKeys = internalMutation({
  args: { pub: v.string(), priv: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("meta")
      .withIndex("by_key", (q) => q.eq("key", VAPID_KEY))
      .collect();
    if (rows.some((r) => isKeys(r.value))) return false;
    for (const r of rows) await ctx.db.delete(r._id);
    await ctx.db.insert("meta", { key: VAPID_KEY, value: { pub: args.pub, priv: args.priv } });
    return true;
  },
});

const b64url = /^[A-Za-z0-9_-]+=*$/;

/** This phone wants alerts for this child. */
export const add = mutation({
  args: { token, endpoint: v.string(), p256dh: v.string(), auth: v.string() },
  handler: async (ctx, args) => {
    const f = await familyOf(ctx, args.token);
    if (!f) fail(FAMILY_SIGNED_OUT);
    if (!args.endpoint.startsWith("https://") || args.endpoint.length > 800) fail("That alert address isn't one a phone gives.");
    if (!b64url.test(args.p256dh) || !b64url.test(args.auth) || args.p256dh.length > 200 || args.auth.length > 100) fail("Those alert keys aren't ones a phone gives.");
    const now = Date.now();
    const same = await ctx.db
      .query("pushSubs")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    const mine = same.find((r) => r.studentId === f.student._id);
    // (`bad` goes: a phone that opens the app and gives its address again is worth a fresh try.)
    if (mine) await ctx.db.patch(mine._id, { deviceId: f.device._id, p256dh: args.p256dh, auth: args.auth, at: now, bad: undefined });
    else await ctx.db.insert("pushSubs", { studentId: f.student._id, deviceId: f.device._id, endpoint: args.endpoint, p256dh: args.p256dh, auth: args.auth, at: now });
    // A child's phones: the newest few.
    const all = await ctx.db
      .query("pushSubs")
      .withIndex("by_student", (q) => q.eq("studentId", f.student._id))
      .collect();
    for (const old of all.sort((a, b) => b.at - a.at).slice(PUSH_PHONES)) await ctx.db.delete(old._id);
    return true;
  },
});

/** No more alerts for this child on this phone. */
export const remove = mutation({
  args: { token, endpoint: v.string() },
  handler: async (ctx, args) => {
    const f = await familyOf(ctx, args.token);
    if (!f) return false;
    const same = await ctx.db
      .query("pushSubs")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect();
    for (const r of same) if (r.studentId === f.student._id) await ctx.db.delete(r._id);
    return true;
  },
});

/**
 * For push.send: the waiting alert (taken: it goes once), his phones still signed in, the keys. Null = nothing to send.
 * `test` (12 Nov 2026) = his own test alert: no waiting one needed, shown even while the app is on the screen.
 */
export const take = internalMutation({
  args: { studentId: v.id("students"), test: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const out = args.test
      ? null
      : await ctx.db
          .query("pushOut")
          .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
          .first();
    if (!out && !args.test) return null;
    if (out) await ctx.db.delete(out._id);
    const s = await ctx.db.get(args.studentId);
    const keys = (
      await ctx.db
        .query("meta")
        .withIndex("by_key", (q) => q.eq("key", VAPID_KEY))
        .collect()
    ).find((r) => isKeys(r.value))?.value as Keys | undefined;
    if (!s || s.archived || !keys) return null;
    const now = Date.now();
    const subs: { endpoint: string; p256dh: string; auth: string }[] = [];
    for (const r of await ctx.db
      .query("pushSubs")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .collect()) {
      const d = await ctx.db.get(r.deviceId);
      if (!d || d.revokedAt !== undefined || now - d.lastSeenAt > DEVICE_IDLE_MS || d.studentId !== args.studentId) continue;
      subs.push({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth });
    }
    if (!subs.length) return null;
    const first = s.name.split(" ")[0] || s.name;
    const payload = out ? pushPayload(first, out.n, out.text, out.url) : pushPayload(first, 1, PUSH_TEST_TEXT, undefined, true);
    return { payload: JSON.stringify(payload), subs, pub: keys.pub, priv: keys.priv };
  },
});

/** How an alert went, phone by phone (push.send): 201 = the push service took it; anything else is kept as `bad`. */
export const sent = internalMutation({
  args: { studentId: v.id("students"), results: v.array(v.object({ endpoint: v.string(), code: v.number() })) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("pushSubs")
      .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
      .collect();
    for (const x of args.results) {
      const r = rows.find((y) => y.endpoint === x.endpoint);
      if (r) await ctx.db.patch(r._id, x.code === 201 ? { ok: now, bad: undefined } : { bad: x.code });
    }
  },
});

/**
 * His own test alert (12 Nov 2026, the founder: "some students say the notification sound is low"): the app's own
 * little sound was what "hear the sound" played, never the phone's. This sends a real alert to his phones a few
 * seconds later (time to lock the phone), so he hears exactly what a teacher's message will sound like, and the whole
 * road is proven (server → push service → phone). Returns how many phones of his it goes to (0 = none turned on).
 */
export const test = mutation({
  args: { token },
  handler: async (ctx, args): Promise<number> => {
    const f = await familyOf(ctx, args.token);
    if (!f) fail(FAMILY_SIGNED_OUT);
    const rows = await ctx.db
      .query("pushSubs")
      .withIndex("by_student", (q) => q.eq("studentId", f.student._id))
      .collect();
    if (!rows.length) return 0;
    const now = Date.now();
    if (rows.some((r) => r.tst !== undefined && now - r.tst < PUSH_TEST_EVERY_MS)) return rows.length;
    for (const r of rows) await ctx.db.patch(r._id, { tst: now });
    await ctx.scheduler.runAfter(PUSH_TEST_WAIT_MS, internal.push.send, { studentId: f.student._id, test: true });
    return rows.length;
  },
});

/** One student in the teachers' list: `st` = reached (a phone took its last alert, or none sent yet), `bad` (alerts on, the last one failed on every phone), `off` (the app on a phone, alerts never turned on), `none` (no phone signed in). */
export type PushWho = { id: string; n: string; g: number | null; st: "on" | "bad" | "off" | "none"; phones: number };

/**
 * Who is reached (12 Nov 2026, Settings → Community → Phone alerts): an alert only goes to a phone whose student
 * tapped Turn on, and nothing told the founder who never did. Every student on the lists (never demo or gone), by
 * grade then name. Any signed-in teacher may look: names only, no addresses.
 */
export const who = query({
  args: { token },
  handler: async (ctx, args): Promise<PushWho[]> => {
    await viewer(ctx, args.token, "any");
    const now = Date.now();
    const rows = await ctx.db
      .query("raceRows")
      .withIndex("by_list", (q) => q.eq("demo", false).eq("gone", false))
      .collect();
    const out: PushWho[] = [];
    for (const r of rows) {
      const devices = (
        await ctx.db
          .query("familyDevices")
          .withIndex("by_student", (q) => q.eq("studentId", r.sid))
          .collect()
      ).filter((d) => d.revokedAt === undefined && now - d.lastSeenAt <= DEVICE_IDLE_MS);
      const live = new Set(devices.map((d) => d._id));
      const subs = (
        await ctx.db
          .query("pushSubs")
          .withIndex("by_student", (q) => q.eq("studentId", r.sid))
          .collect()
      ).filter((x) => live.has(x.deviceId));
      const st = !devices.length ? "none" : !subs.length ? "off" : subs.every((x) => x.bad !== undefined) ? "bad" : "on";
      out.push({ id: r.sid, n: r.n, g: r.g ?? null, st, phones: subs.length });
    }
    return out.sort((a, b) => (a.g ?? 99) - (b.g ?? 99) || a.n.localeCompare(b.n));
  },
});

/** The push service says this address is gone (404 / 410): forget it. */
export const drop = internalMutation({
  args: { endpoint: v.string() },
  handler: async (ctx, args) => {
    for (const r of await ctx.db
      .query("pushSubs")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .collect())
      await ctx.db.delete(r._id);
  },
});

/** For tests and the owner's checks: how many phones of this child get alerts. */
export const count = internalQuery({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) =>
    (
      await ctx.db
        .query("pushSubs")
        .withIndex("by_student", (q) => q.eq("studentId", args.studentId))
        .collect()
    ).length,
});
