// The bell's sheet (7 Nov 2026; Us's lines since 8 Nov 2026): phone alerts on top, then his teachers' answers, retakes
// and messages and Us's lines, by time. One of the parts fetched right after the first screen (parts.ts): only a tap on
// the bell shows it (bell.tsx keeps what the first screen needs: turning alerts off, the time words).

import type { BellItem } from "../../convex/family";
import type { UsInboxItem } from "../../convex/lib/usTalk";
import { useState } from "preact/hooks";
import { keep } from "./net";
import { pushable, pushOff, pushOn, stamp } from "./bell";
import { Icon, Sheet, type IconName } from "./ui";

const LOOK: Record<BellItem["what"], { icon: IconName; words: (b: BellItem) => string }> = {
  done: { icon: "teach", words: (b) => `திருத்தியவர்: ${b.by}` },
  retake: { icon: "camera", words: (b) => `${b.by}: மீண்டும் படம் எடு` },
  ask: { icon: "chat", words: (b) => `${b.by} கேட்கிறார்: ${b.ask ?? ""}` },
};

/** Us's lines in the bell, in his words (the name first). */
const US_LOOK: Record<UsInboxItem["k"], { icon: IconName; words: (b: UsInboxItem) => string }> = {
  c: { icon: "chat", words: (b) => `${b.n}${b.tch ? " ஆசிரியர்" : ""}: “${b.t ?? "📷"}”` },
  r: { icon: "chat", words: (b) => `${b.n}${b.tch ? " ஆசிரியர்" : ""} உனக்குப் பதில்: “${b.t ?? "📷"}”` },
  l: { icon: "star", words: (b) => `👏 ${b.n}${(b.x ?? 1) > 1 ? ` + ${(b.x ?? 1) - 1}` : ""} உன் வார்த்தைகளைப் பாராட்டினார்${(b.x ?? 1) > 1 ? "கள்" : ""}` },
  clap: { icon: "star", words: (b) => `👏 ${b.n}${(b.x ?? 1) > 1 ? ` + ${(b.x ?? 1) - 1}` : ""} உன்னைப் பாராட்டினார்${(b.x ?? 1) > 1 ? "கள்" : ""}` },
  tclap: { icon: "star", words: (b) => `👏 ${b.n} ஆசிரியர் உன்னைப் பாராட்டினார்` },
  ok: { icon: "check", words: (b) => `✓ ${b.n} ஆசிரியர்: சரி!${b.x ? ` +${b.x} XP` : ""}${b.t ? ` “${b.t}”` : ""}` },
  no: { icon: "eye", words: (b) => `${b.n} ஆசிரியர் பார்த்தார்${b.t ? `: “${b.t}”` : ""}` },
  fix: { icon: "pen", words: (b) => `✎ ${b.n} ஆசிரியர்: “${b.t ?? ""}”` },
  q: { icon: "bulb", words: (b) => `❓ ${b.n} ஆசிரியர் ஒரு கேள்வி கேட்கிறார்` },
  shout: { icon: "award", words: (b) => `🌟 ${b.n} ஆசிரியர் உனக்கு shout-out கொடுத்தார்!` },
};

export function BellSheet(props: {
  items: BellItem[];
  /** Us's lines (8 Nov 2026). */
  us?: UsInboxItem[];
  onClose: () => void;
  onOpen: (unitId: string, n: number) => void;
  onUs?: (id: string) => void;
}) {
  // One list by time: his teachers' answers and Us's lines.
  const all: ({ at: number } & ({ b: BellItem } | { u: UsInboxItem }))[] = [
    ...props.items.map((b) => ({ at: b.at, b })),
    ...(props.us ?? []).map((u) => ({ at: u.at, u })),
  ].sort((a, b) => b.at - a.at);
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
              <b>ஆசிரியர் திருத்தியதும், Us இல் உனக்கு யாராவது எழுதியதும் phone இல் தெரிய வேண்டுமா?</b>
              {state === "fail" && <small>இப்போது முடியவில்லை. மீண்டும் தொடு.</small>}
            </p>
            <button type="button" class="f-btn gold f-pushon" aria-label="Turn on phone alerts" disabled={state === "busy"} onClick={() => void turnOn()}>
              {state === "busy" ? "…" : "இயக்கு"}
            </button>
          </>
        )}
      </div>
      {all.length === 0 ? (
        <p class="f-note f-bellnone">இன்னும் எதுவும் இல்லை. உன் ஆசிரியர் திருத்தியதும், Us இல் யாராவது உனக்கு எழுதியதும் இங்கே வரும்.</p>
      ) : (
        <ul class="f-belllist">
          {all.map((x) =>
            "b" in x ? (
              <li key={`${x.b.unitId}.${x.b.n}.${x.b.q}.${x.b.what}.${x.b.at}`}>
                <button type="button" class={`f-bellitem ${x.b.what}${x.b.fresh ? " fresh" : ""}`} onClick={() => props.onOpen(x.b.unitId, x.b.n)}>
                  <Icon name={LOOK[x.b.what].icon} size={20} />
                  <span>
                    <b>{LOOK[x.b.what].words(x.b)}</b>
                    <small>
                      Stage {x.b.no} · Level {x.b.n} · Q{x.b.q} · {stamp(x.b.at)}
                    </small>
                  </span>
                </button>
              </li>
            ) : (
              <li key={x.u.id}>
                <button type="button" class={`f-bellitem us ${x.u.k}${x.u.fresh ? " fresh" : ""}`} onClick={() => props.onUs?.(x.u.mid)}>
                  <Icon name={US_LOOK[x.u.k].icon} size={20} />
                  <span>
                    <b>{US_LOOK[x.u.k].words(x.u)}</b>
                    <small>Us · {stamp(x.u.at)}</small>
                  </span>
                </button>
              </li>
            ),
          )}
        </ul>
      )}
    </Sheet>
  );
}
