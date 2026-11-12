"use node";
// Phone alerts, the sending (7 Nov 2026; rules in lib/push.ts, the database side in pushSubs.ts). Node, for the web
// push library: it signs each alert with the server's own keys (made here once, kept in meta, never in the repo) and
// encrypts it for each phone, which shows it even with the app closed.

import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { retryable } from "./lib/push";

/** The server's keys, made once (the first phone that turns alerts on asks: pushSubs.prepare). */
export const makeKeys = internalAction({
  args: {},
  handler: async (ctx) => {
    const k = webpush.generateVAPIDKeys();
    await ctx.runMutation(internal.pushSubs.saveKeys, { pub: k.publicKey, priv: k.privateKey });
  },
});

/**
 * Tries for one phone (12 Nov 2026): at once, then after 3 s, then after 12 s more. Before, one busy moment of the
 * phone's push service (no answer, 429, 5xx) lost the alert for good.
 */
const TRY_AFTER_MS = [0, 3_000, 12_000];

/**
 * A child's waiting alert to each phone of his; a dead address is forgotten. One phone failing never stops the others.
 * 12 Nov 2026: sent as **urgent** (`urgency: "high"`; the library's "normal" lets a sleeping Android phone hold it until
 * it next wakes: "the notification comes late"), tried again when the push service was busy, and each phone's result
 * is kept on its row (pushSubs.sent) so the owner sees who is not reached. `test` = his own test alert (no waiting one).
 */
export const send = internalAction({
  args: { studentId: v.id("students"), test: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(internal.pushSubs.take, { studentId: args.studentId, ...(args.test ? { test: true } : {}) });
    if (!job) return 0;
    let sent = 0;
    let left = job.subs;
    const results: { endpoint: string; code: number }[] = [];
    for (const wait of TRY_AFTER_MS) {
      if (!left.length) break;
      if (wait) await new Promise((r) => setTimeout(r, wait));
      const again: typeof left = [];
      for (const s of left) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, job.payload, {
            vapidDetails: { subject: "https://app.aristora.org", publicKey: job.pub, privateKey: job.priv },
            TTL: 24 * 60 * 60,
            urgency: "high",
            timeout: 10_000,
          });
          sent++;
          results.push({ endpoint: s.endpoint, code: 201 });
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode ?? 0;
          if (code === 404 || code === 410) await ctx.runMutation(internal.pushSubs.drop, { endpoint: s.endpoint });
          else if (retryable(code) && wait !== TRY_AFTER_MS[TRY_AFTER_MS.length - 1]) again.push(s);
          else results.push({ endpoint: s.endpoint, code });
        }
      }
      left = again;
    }
    if (results.length) await ctx.runMutation(internal.pushSubs.sent, { studentId: args.studentId, results });
    return sent;
  },
});
