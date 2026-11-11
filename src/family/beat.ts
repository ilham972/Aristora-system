// The app's beat (12 Nov 2026: online, last seen and time in the app; convex/lib/appTime.ts has his decisions). Once a
// minute while the app is on the screen, at once when it comes back, and a last one (`bye`) when it leaves; each answers
// who is online now, which the race's faces and a profile show (the green dot). Only the phone's own child: never the
// owner's Preview or a teacher's Us (`childId`). Small on purpose: it is in the first load.

import { useEffect, useState } from "preact/hooks";
import { beacon, childId, mutation } from "./net";

let on = new Set<string>();
let show = false;
const subs = new Set<() => void>();
/** Inside a Level since the last beat (the bar's sheet shows that time apart). */
let lvNow = false;
let lvSince = false;

/** The phone is inside a Level now, or not (the app tells it as screens change). */
export function setInLevel(v: boolean): void {
  lvNow = v;
  if (v) lvSince = true;
}

const own = () => childId() !== "look" && childId() !== "staff" && childId() !== "_";

async function beat(): Promise<void> {
  if (!own() || document.visibilityState !== "visible") return;
  const lv = lvSince || lvNow;
  lvSince = lvNow;
  try {
    const r = (await mutation("online:beat", { lv })) as { show: boolean; on: string[] };
    on = new Set(r.on);
    show = r.show;
    subs.forEach((f) => f());
  } catch {
    // Offline or signed out: the next beat tries again (the app shows its own message).
  }
}

/** Starts the beat for the life of the app; returns its stop. */
export function startBeat(): () => void {
  const t = window.setInterval(() => void beat(), 60_000);
  const seen = () => {
    if (document.visibilityState === "visible") void beat();
    else if (own()) beacon("online:beat", { lv: lvSince || lvNow, bye: true });
  };
  document.addEventListener("visibilitychange", seen);
  return () => {
    window.clearInterval(t);
    document.removeEventListener("visibilitychange", seen);
  };
}

/** A new child on the phone: his beat at once (the dots are his view from now). */
export const beatNow = () => void beat();

/** Who is online now (empty while the owner's switch is off); the screen draws again when it changes. */
export function useOnline(): { on: Set<string>; show: boolean } {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    subs.add(f);
    return () => void subs.delete(f);
  }, []);
  return { on, show };
}
