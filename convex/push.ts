"use node";
// Phone alerts, the sending (7 Nov 2026; rules in lib/push.ts, the database side in pushSubs.ts). Node, for the web
// push library: it signs each alert with the server's own keys (made here once, kept in meta, never in the repo) and
// encrypts it for each phone, which shows it even with the app closed.

import { v } from "convex/values";
import webpush from "web-push";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/** The server's keys, made once (the first phone that turns alerts on asks: pushSubs.prepare). */
export const makeKeys = internalAction({
  args: {},
  handler: async (ctx) => {
    const k = webpush.generateVAPIDKeys();
    await ctx.runMutation(internal.pushSubs.saveKeys, { pub: k.publicKey, priv: k.privateKey });
  },
});

/** A child's waiting alert to each phone of his; a dead address is forgotten. One phone failing never stops the others. */
export const send = internalAction({
  args: { studentId: v.id("students") },
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(internal.pushSubs.take, { studentId: args.studentId });
    if (!job) return 0;
    let sent = 0;
    for (const s of job.subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, job.payload, {
          vapidDetails: { subject: "https://app.aristora.org", publicKey: job.pub, privateKey: job.priv },
          TTL: 24 * 60 * 60,
          timeout: 10_000,
        });
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await ctx.runMutation(internal.pushSubs.drop, { endpoint: s.endpoint });
      }
    }
    return sent;
  },
});
