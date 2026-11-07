// Phone alerts (7 Nov 2026, his voice note: "the family app don't have any alert features ... even though we corrected,
// students don't know"). A teacher's answer, a retake or her message for a child reaches his phones that turned alerts
// on (the bell → Turn on): gathered for PUSH_WAIT_MS (a level marked in a minute = one notification), then sent by
// push.send (web push: the phone's browser shows it even with the app closed; Android, and an iPhone on iOS 16.4+ with
// the app on its home screen). The keys that sign them are made once by the server (push.makeKeys) and kept in meta:
// nothing to set up, nothing in the repo.

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** How long a burst of answers gathers before one notification goes. */
export const PUSH_WAIT_MS = 60_000;
/** Where the keys are kept (meta): { pub, priv }, base64url as web push uses them. */
export const VAPID_KEY = "push.vapid";
/** A child on one phone: at most this many phones keep alerts (the oldest go). */
export const PUSH_PHONES = 6;

/**
 * The notification for a burst: one answer says itself; several say how many, then the last. A tap opens the bell, or
 * `url` (7 Nov 2026: the Us tab, "/f/#us", for a teacher's shout-out or 👏: the last one in the burst decides).
 */
export function pushPayload(first: string, n: number, text: string, url?: string): { title: string; body: string; url: string; tag: string } {
  return {
    title: `${first} · ARISTORA`,
    body: n > 1 ? `ஆசிரியரிடமிருந்து ${n} புதியவை. ${text}` : text,
    url: url ?? "/f/#bell",
    tag: `aristora-${first}`,
  };
}

/** An alert for a child: gathered with any other in the next minute; nothing at all if no phone of his turned them on. */
export async function alertStudent(ctx: MutationCtx, studentId: Id<"students">, text: string, url?: string): Promise<void> {
  const sub = await ctx.db
    .query("pushSubs")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .first();
  if (!sub) return;
  const now = Date.now();
  const out = await ctx.db
    .query("pushOut")
    .withIndex("by_student", (q) => q.eq("studentId", studentId))
    .first();
  if (out) {
    await ctx.db.patch(out._id, { n: out.n + 1, text, at: now, url });
    return;
  }
  await ctx.db.insert("pushOut", { studentId, n: 1, text, at: now, ...(url ? { url } : {}) });
  await ctx.scheduler.runAfter(PUSH_WAIT_MS, internal.push.send, { studentId });
}
