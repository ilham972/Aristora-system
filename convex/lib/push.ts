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
/**
 * Us's alerts (8 Nov 2026, his voice note: "the notification instantly ... like WhatsApp"): a reply, a mark, a new
 * question goes in seconds (a few at once still come as one).
 */
export const US_PUSH_WAIT_MS = 5_000;
/** Where the keys are kept (meta): { pub, priv }, base64url as web push uses them. */
export const VAPID_KEY = "push.vapid";
/** A child on one phone: at most this many phones keep alerts (the oldest go). */
export const PUSH_PHONES = 6;
/**
 * The words a phone shows, at most (12 Nov 2026): a push service refuses a notification above 4 KB, and Tamil is 3
 * bytes a letter, so a long message once meant no alert at all.
 */
export const PUSH_WORDS = 240;
/** His own test alert (the bell → Test alert) leaves this long after the tap: time to lock the phone. */
export const PUSH_TEST_WAIT_MS = 8_000;
/** A second test before this is the same test. */
export const PUSH_TEST_EVERY_MS = 15_000;
/** Worth another try: the push service never answered (0), is busy (429) or has its own trouble (5xx). Never a refusal. */
export const retryable = (code: number): boolean => code === 0 || code === 429 || code >= 500;
/** The test alert's words. */
export const PUSH_TEST_TEXT = "🔔 இது ஒரு test. இந்த ஒலி கேட்டதா? இனி ஒவ்வொரு message உம் இப்படியே வரும்.";

/**
 * The notification for a burst: one answer says itself; several say how many, then the last. A tap opens the bell, or
 * `url` (7 Nov 2026: the Us tab, "/f/#us", for a teacher's shout-out or 👏: the last one in the burst decides).
 * 12 Nov 2026: the words are cut to PUSH_WORDS; each place has its own `tag` (a chat's alert no longer replaces a
 * teacher's marking still unread on the lock screen); `force` = show it even while the app is on the screen (his test).
 */
export function pushPayload(first: string, n: number, text: string, url?: string, force?: boolean): { title: string; body: string; url: string; tag: string; force?: true } {
  // Us's bursts (8 Nov 2026) come from classmates too: "3 new" without "from the teacher".
  const body = n > 1 ? (url?.includes("#us") || url?.includes("#chat") ? `${n} புதியவை. ${text}` : `ஆசிரியரிடமிருந்து ${n} புதியவை. ${text}`) : text;
  const place = /#(?:chat|us)=([A-Za-z0-9:_-]+)/.exec(url ?? "")?.[1] ?? (url?.includes("#us") ? "us" : "bell");
  return {
    title: `${first} · ARISTORA`,
    body: body.length > PUSH_WORDS ? `${body.slice(0, PUSH_WORDS - 1)}…` : body,
    url: url ?? "/f/#bell",
    tag: `aristora-${first}-${place}`,
    ...(force ? { force: true as const } : {}),
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
  // Us and its chats (8 Nov 2026) say it within seconds, like a message app; a teacher's marking is gathered a minute.
  await ctx.scheduler.runAfter(/#(us|chat)=/.test(url ?? "") ? US_PUSH_WAIT_MS : PUSH_WAIT_MS, internal.push.send, { studentId });
}
