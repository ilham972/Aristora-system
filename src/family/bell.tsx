// The bell (7 Nov 2026, his voice note: "the family app don't have any alert features ... even though we corrected,
// students don't know"; his answer: the bell in the app AND an alert on the phone). In the top row with a red count of
// what is new; its sheet lists his teachers' answers, retakes and messages (who, which Stage, Level and question), a tap
// opens that level's book (where it is read, and answered). On top, phone alerts: one tap to turn them on (the
// phone asks once), so the next answer reaches his phone even with the app closed (pushSubs, push.ts on the server).

import type { BellItem } from "../../convex/family";
import { useState } from "preact/hooks";
import { MONTH, timeOf } from "./home";
import { keep, mutation, query } from "./net";
import { Icon, Sheet, type IconName } from "./ui";

/** This phone can take alerts (a browser with push: Android Chrome; an iPhone only with the app on its home screen). */
export const pushable = (): boolean => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

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

/** Alerts on for the child on screen: the phone asks once; this browser's push address goes to the server. */
export async function pushOn(): Promise<"on" | "denied" | "no"> {
  if (!pushable()) return "no";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const key = await serverKey();
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytesOf(key) });
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) throw new Error("no address");
  await mutation("pushSubs:add", { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
  keep("push", 1);
  return "on";
}

/** Alerts off for the child on screen (his phone keeps them for the other children on it). Never throws. */
export async function pushOff(): Promise<void> {
  try {
    if (!keep("push")) return;
    keep("push", null);
    const sub = pushable() ? await (await navigator.serviceWorker.getRegistration("/f/"))?.pushManager.getSubscription() : null;
    if (sub) await mutation("pushSubs:remove", { endpoint: sub.endpoint });
  } catch {
    /* no signal: the server forgets it when the address dies */
  }
}

const LOOK: Record<BellItem["what"], { icon: IconName; words: (b: BellItem) => string }> = {
  done: { icon: "teach", words: (b) => `திருத்தியவர்: ${b.by}` },
  retake: { icon: "camera", words: (b) => `${b.by}: மீண்டும் படம் எடு` },
  ask: { icon: "chat", words: (b) => `${b.by} கேட்கிறார்: ${b.ask ?? ""}` },
};

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

export function BellSheet(props: { items: BellItem[]; onClose: () => void; onOpen: (unitId: string, n: number) => void }) {
  const [state, setState] = useState<"on" | "off" | "busy" | "denied" | "no" | "fail">(() =>
    !pushable() ? "no" : keep("push") && Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "denied" : "off",
  );
  const turnOn = async () => {
    setState("busy");
    try {
      setState(await pushOn());
    } catch {
      setState("fail");
    }
  };
  return (
    <Sheet title="அறிவிப்புகள்" onClose={props.onClose} class="f-bellsheet">
      <div class={`f-pushcard ${state}`}>
        <Icon name="bell" size={22} />
        {state === "on" ? (
          <p>
            <b>இந்த phone இல் அறிவிப்பு வரும் ✓</b>
            <button type="button" class="f-linkbtn" onClick={() => void pushOff().then(() => setState("off"))}>
              நிறுத்து
            </button>
          </p>
        ) : state === "no" ? (
          <p>இந்த phone இல் அறிவிப்பு வராது: இங்கே மணியைப் பார்.</p>
        ) : state === "denied" ? (
          <p>அறிவிப்புக்கு அனுமதி இல்லை: Chrome இன் அமைப்பில் (Settings → Notifications) அனுமதி.</p>
        ) : (
          <>
            <p>
              <b>ஆசிரியர் திருத்தியதும் phone இல் தெரிய வேண்டுமா?</b>
              {state === "fail" && <small>இப்போது முடியவில்லை. மீண்டும் தொடு.</small>}
            </p>
            <button type="button" class="f-btn gold f-pushon" aria-label="Turn on phone alerts" disabled={state === "busy"} onClick={() => void turnOn()}>
              {state === "busy" ? "…" : "இயக்கு"}
            </button>
          </>
        )}
      </div>
      {props.items.length === 0 ? (
        <p class="f-note f-bellnone">இன்னும் எதுவும் இல்லை. உன் ஆசிரியர் திருத்தியதும் இங்கே வரும்.</p>
      ) : (
        <ul class="f-belllist">
          {props.items.map((b) => (
            <li key={`${b.unitId}.${b.n}.${b.q}.${b.what}.${b.at}`}>
              <button type="button" class={`f-bellitem ${b.what}${b.fresh ? " fresh" : ""}`} onClick={() => props.onOpen(b.unitId, b.n)}>
                <Icon name={LOOK[b.what].icon} size={20} />
                <span>
                  <b>{LOOK[b.what].words(b)}</b>
                  <small>
                    Stage {b.no} · Level {b.n} · Q{b.q} · {stamp(b.at)}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
