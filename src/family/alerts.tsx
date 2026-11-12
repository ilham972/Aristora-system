// Phone alerts, the phone's side that isn't needed for the first screen (12 Nov 2026, the founder: "the notification
// sometimes not reaching the students ... find all the possibilities"). bell.tsx keeps what the first load needs.
// - pushOn: the bell's (or the reminder's) Turn on: the phone asks once; this browser's push address goes to the server.
// - pushSync: at every open, a phone that allowed alerts gives its address again. Before, the address was sent once, on
//   the day he tapped Turn on: when the browser changed it (cleared data, a Chrome update, the server's keys made
//   again), the server kept a dead one, forgot it at the next alert, and the phone still said "on" for ever.
// - AlertNudge: a button above the bottom bar while this phone never answered the question (or blocked it). Before,
//   only a student who opened the bell's page ever saw "Turn on": the others got no alert and nobody knew.

import { useState } from "preact/hooks";
import { pushable } from "./bell";
import { keep, mutation, query } from "./net";

const bytesOf = (s: string) => {
  const b = atob((s + "=".repeat((4 - (s.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** The server's public key (it makes its keys the first time anyone asks: a few seconds). */
async function serverKey(): Promise<string> {
  let k = (await query("pushSubs:key")) as string | null;
  if (k) return k;
  await mutation("pushSubs:prepare");
  for (let i = 0; i < 10 && !k; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    k = (await query("pushSubs:key")) as string | null;
  }
  if (!k) throw new Error("no key");
  return k;
}

/** This browser's push address for the child on screen, to the server (made, or made again when it was made with other keys). */
async function subscribe(): Promise<void> {
  const key = bytesOf(await serverKey());
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const made = sub?.options?.applicationServerKey;
  if (sub && made && String(new Uint8Array(made)) !== String(key)) {
    await sub.unsubscribe();
    sub = null;
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error("no address");
  await mutation("pushSubs:add", { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  keep("push", 1);
}

/** Alerts on for the child on screen: the phone asks once. */
export async function pushOn(): Promise<"on" | "denied" | "no"> {
  if (!pushable()) return "no";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  await subscribe();
  return "on";
}

/** At every open: a phone that allows alerts gives its address again, unless he turned them off himself (0). */
export function pushSync(): void {
  if (pushable() && Notification.permission === "granted" && keep<number>("push") !== 0) void subscribe().catch(() => {});
}

export type Push = "on" | "off" | "busy" | "denied" | "no" | "fail";
export const pushNow = (): Push => (!pushable() ? "no" : keep("push") && Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "denied" : "off");

/**
 * The reminder above the bottom bar: "Turn on" while the phone never asked; "blocked: fix it" (the bell's page says
 * how) when he or his browser said no. ✕ = not today (blocked: 3 days). Never in a run-through's browser for
 * "blocked" (a headless browser blocks everything).
 */
export function AlertNudge(props: { onBell: () => void }) {
  const [, redo] = useState(0);
  const p = pushable() ? Notification.permission : "";
  const no = p === "denied";
  if ((no ? navigator.webdriver : p !== "default") || Date.now() < (keep<number>("pushLater") ?? 0)) return null;
  const again = () => redo(Date.now());
  return (
    <div class="f-nudge">
      <button type="button" class="f-btn gold" aria-label="Turn on alerts" onClick={() => (no ? props.onBell() : void pushOn().then(again, props.onBell))}>
        {no ? "🔕 அறிவிப்பு வராது: சரிசெய்" : "🔔 அறிவிப்புகளை இயக்கு"}
      </button>
      <button
        type="button"
        aria-label="Later"
        onClick={() => {
          keep("pushLater", Date.now() + (no ? 3 : 1) * 86_400_000);
          again();
        }}
      >
        ✕
      </button>
    </div>
  );
}
