// The bell (7 Nov 2026, his voice note: "the family app don't have any alert features ... even though we corrected,
// students don't know"; his answer: the bell in the app AND an alert on the phone). In the top row with a red count of
// what is new; its sheet lists his teachers' answers, retakes and messages (who, which Stage, Level and question), a tap
// opens that level's book (where it is read, and answered). On top, phone alerts: one tap to turn them on (the
// phone asks once), so the next answer reaches his phone even with the app closed (pushSubs, push.ts on the server).
// 8 Nov 2026 (his voice note: "they don't know what's going on ... otherwise they will forget our app"): Us's lines too,
// in the same list by time: a comment on his line, a reply to him, 👏 on his words, a teacher's ✓ (+XP) or her
// correction, a new question for him, a shout-out; a tap opens that line. The sheet itself (bellSheet.tsx) is one of the
// parts fetched right after the first screen (only a tap shows it; its words are heavy for the first load). Turning
// alerts on, keeping them on at every open and the reminder to turn them on: alerts.tsx (12 Nov 2026), a later part too.

import { MONTH, timeOf } from "./home";
import { keep, mutation } from "./net";

/** This phone can take alerts (a browser with push: Android Chrome; an iPhone only with the app on its home screen). */
export const pushable = (): boolean => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * Alerts off for the child on screen (his phone keeps them for the other children on it). Never throws. `mine` = he
 * turned them off himself (the bell → நிறுத்து): kept as 0, so opening the app doesn't turn them on again (alerts.tsx
 * pushSync); signing out forgets it.
 */
export async function pushOff(mine?: boolean): Promise<void> {
  try {
    if (!keep("push")) return;
    keep("push", mine ? 0 : null);
    const sub = pushable() ? await (await navigator.serviceWorker.getRegistration("/f/"))?.pushManager.getSubscription() : null;
    if (sub) await mutation("pushSubs:remove", { endpoint: sub.endpoint });
  } catch {
    /* no signal: the server forgets it when the address dies */
  }
}

/**
 * When, as he reads it (7 Nov 2026, his ask: "corrected time and uploaded time ... feel more intuitive"): "இன்று 10:42
 * AM", "நேற்று 6:05 PM", "5 Nov 10:42 AM" (Sri Lanka time).
 */
export function stamp(at: number): string {
  const SL = 330 * 60_000;
  const day = (t: number) => Math.floor((t + SL) / 86_400_000);
  const d = day(Date.now()) - day(at);
  const date = new Date(at + SL);
  const which = d <= 0 ? "இன்று" : d === 1 ? "நேற்று" : `${date.getUTCDate()} ${MONTH[date.getUTCMonth()]}`;
  return `${which} ${timeOf(at)}`;
}
