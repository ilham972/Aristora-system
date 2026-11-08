// The bell's page (8 Nov 2026, his voice note: "the alert need to be give the sound ... notification instantly ... a
// standalone page", then "build notification page"; the sheet of 7 Nov before it): a page of its own, Back to where he
// was. On top, phone alerts said plainly (on, how to turn them on, or why this phone can't); then everything for him,
// newest first, by day (today, yesterday, before): his teachers' answers, retakes and messages, and Us's lines (a reply,
// a 👏, a mark, a new question, a shout-out), each with who (a face) and what (a mark on it); new ones stand out. A tap
// opens it (a level's book; a line of Us, Back returns here). One of the parts fetched right after the first screen
// (parts.ts): bell.tsx keeps what the first screen needs (turning alerts on and off, the time words).

import type { BellItem } from "../../convex/family";
import type { UsInboxItem } from "../../convex/lib/usTalk";
import { useState } from "preact/hooks";
import { keep } from "./net";
import { picOf, usePics } from "./pics";
import { pushable, pushOff, pushOn, stamp } from "./bell";
import { sound } from "./sound";
import { Avatar, Icon, Owl, OwlBadge, type IconName } from "./ui";

const LOOK: Record<BellItem["what"], { icon: IconName; words: (b: BellItem) => string }> = {
  done: { icon: "teach", words: (b) => `திருத்தியவர்: ${b.by}` },
  retake: { icon: "camera", words: (b) => `${b.by}: மீண்டும் படம் எடு` },
  ask: { icon: "chat", words: (b) => `${b.by} கேட்கிறார்: ${b.ask ?? ""}` },
};

/** Us's lines in the bell, in his words (the name first). */
const US_LOOK: Record<UsInboxItem["k"], { icon: IconName; words: (b: UsInboxItem) => string }> = {
  c: { icon: "chat", words: (b) => `${b.n}${b.tch ? " ஆசிரியர்" : ""}: “${b.t ?? "📷"}”` },
  r: { icon: "chat", words: (b) => `${b.n}${b.tch ? " ஆசிரியர்" : ""} உனக்குப் பதில்: “${b.t ?? "📷"}”` },
  l: {
    icon: "star",
    words: (b) =>
      `${b.t ?? "👏"} ${b.n}${(b.x ?? 1) > 1 ? ` + ${(b.x ?? 1) - 1}` : ""} ${!b.t || b.t === "👏" ? "உன் வார்த்தைகளைப் பாராட்டினார்" : "உன் வார்த்தைகளுக்கு react செய்தார்"}${(b.x ?? 1) > 1 ? "கள்" : ""}`,
  },
  m: { icon: "chat", words: (b) => `@ ${b.n}${b.tch ? " ஆசிரியர்" : ""} உன்னை tag செய்தார்: “${b.t ?? "📷"}”` },
  clap: { icon: "star", words: (b) => `👏 ${b.n}${(b.x ?? 1) > 1 ? ` + ${(b.x ?? 1) - 1}` : ""} உன்னைப் பாராட்டினார்${(b.x ?? 1) > 1 ? "கள்" : ""}` },
  tclap: { icon: "star", words: (b) => `👏 ${b.n} ஆசிரியர் உன்னைப் பாராட்டினார்` },
  ok: { icon: "check", words: (b) => `✓ ${b.n} ஆசிரியர்: சரி!${b.x ? ` +${b.x} XP` : ""}${b.t ? ` “${b.t}”` : ""}` },
  no: { icon: "eye", words: (b) => `${b.n} ஆசிரியர் பார்த்தார்${b.t ? `: “${b.t}”` : ""}` },
  fix: { icon: "pen", words: (b) => `✎ ${b.n} ஆசிரியர்: “${b.t ?? ""}”` },
  q: { icon: "bulb", words: (b) => `❓ ${b.n} ஆசிரியர் ஒரு கேள்வி கேட்கிறார்` },
  shout: { icon: "award", words: (b) => `🌟 ${b.n} ஆசிரியர் உனக்கு shout-out கொடுத்தார்!` },
};

/** The mark on a face: what it is at a glance. */
const MARKS: Record<string, string> = { done: "✓", retake: "📷", ask: "💬", c: "💬", r: "↩", m: "@", l: "👏", clap: "👏", tclap: "👏", ok: "✓", no: "👀", fix: "✎", q: "❓", shout: "🌟" };
const SL = 330 * 60_000;
const dayOf = (t: number) => Math.floor((t + SL) / 86_400_000);

type Push = "on" | "off" | "busy" | "denied" | "no" | "fail";
const pushNow = (): Push => (!pushable() ? "no" : keep("push") && Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "denied" : "off");

/** Phone alerts, said plainly: on (a sound to hear, off); off (why and the button); not allowed (where to allow); none here. */
function PushCard() {
  const [state, setState] = useState<Push>(pushNow);
  const turnOn = async () => {
    setState("busy");
    try {
      setState(await pushOn());
    } catch {
      setState("fail");
    }
  };
  if (state === "on") {
    return (
      <div class="f-pushcard on">
        <Icon name="bell" size={22} />
        <p>
          <b>இந்த phone இல் அறிவிப்பு வரும் ✓</b>
          <small>ஆசிரியர் திருத்தியதும், Us இல் உனக்கு யாராவது எழுதியதும், app மூடியிருந்தாலும்.</small>
          <span class="f-push-acts">
            <button type="button" class="f-linkbtn" onClick={() => sound("tweet")}>
              🔊 ஒலி கேள்
            </button>
            <button type="button" class="f-linkbtn" onClick={() => void pushOff().then(() => setState("off"))}>
              நிறுத்து
            </button>
          </span>
        </p>
      </div>
    );
  }
  if (state === "no") {
    return (
      <div class="f-pushcard">
        <Icon name="bell" size={22} />
        <p>
          <b>இந்த phone இல் அறிவிப்பு வராது: இங்கே மணியைப் பார்.</b>
          <small>iPhone: Share → Add to Home Screen, பிறகு அங்கிருந்து திற.</small>
        </p>
      </div>
    );
  }
  if (state === "denied") {
    return (
      <div class="f-pushcard big">
        <Icon name="bell" size={22} />
        <p>
          <b>அறிவிப்புக்கு அனுமதி இல்லை</b>
          <small>Chrome: ⋮ → Settings → Notifications → app.aristora.org → Allow. பிறகு இங்கே தொடு:</small>
          <button type="button" class="f-btn gold f-pushon" onClick={() => setState(pushNow())}>
            மீண்டும் பார்
          </button>
        </p>
      </div>
    );
  }
  return (
    <div class="f-pushcard big">
      <Icon name="bell" size={22} />
      <p>
        <b>🔔 உடனே தெரிய வேண்டுமா?</b>
        <small>ஆசிரியர் திருத்தியதும், Us இல் உனக்கு யாராவது எழுதியதும் phone இல் ஒலியுடன் உடனே வரும்.</small>
        {state === "fail" && <small class="f-push-fail">இப்போது முடியவில்லை. மீண்டும் தொடு.</small>}
        <button type="button" class="f-btn gold f-pushon" aria-label="Turn on phone alerts" disabled={state === "busy"} onClick={() => void turnOn()}>
          {state === "busy" ? "…" : "🔔 அறிவிப்புகளை இயக்கு"}
        </button>
      </p>
    </div>
  );
}

type Row = { at: number; fresh: boolean } & ({ b: BellItem } | { u: UsInboxItem });

export function BellScreen(props: {
  items: BellItem[];
  /** Us's lines (8 Nov 2026). */
  us?: UsInboxItem[];
  onBack: () => void;
  onOpen: (unitId: string, n: number) => void;
  onUs?: (id: string) => void;
}) {
  const [show, setShow] = useState<"all" | "class" | "us">("all");
  usPics(props.us);
  // One list by time: his teachers' answers and Us's lines.
  const all: Row[] = [
    ...props.items.map((b) => ({ at: b.at, fresh: b.fresh, b })),
    ...(props.us ?? []).map((u) => ({ at: u.at, fresh: !!u.fresh, u })),
  ].sort((a, b) => b.at - a.at);
  const rows = all.filter((x) => show === "all" || (show === "us") === ("u" in x));
  const fresh = all.filter((x) => x.fresh).length;
  const today = dayOf(Date.now());
  const groups: { h: string; list: Row[] }[] = [];
  for (const x of rows) {
    const d = today - dayOf(x.at);
    const h = d <= 0 ? "இன்று" : d === 1 ? "நேற்று" : "முன்பு";
    const g = groups[groups.length - 1];
    if (g?.h === h) g.list.push(x);
    else groups.push({ h, list: [x] });
  }
  const time = (at: number) => (today - dayOf(at) <= 1 ? stamp(at).replace(/^\S+ /, "") : stamp(at));
  return (
    <div class="f-bellscr">
      <header class="f-hero">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <span class="f-sp" />
        </div>
        <div class="f-hero-in">
          <div class="f-hero-w">
            <p class="f-kicker">அறிவிப்புகள்</p>
            <h1 class="f-title">{fresh ? `${fresh} புதியவை` : "எல்லாம் பார்த்தாய் ✓"}</h1>
          </div>
          <OwlBadge mood={fresh ? "party" : "happy"} class="hero" />
        </div>
      </header>
      <div class="f-bellbody">
        <PushCard />
        <div class="f-bell-chips" role="group" aria-label="Show">
          {(
            [
              ["all", "எல்லாம்"],
              ["class", "✓ திருத்தம்"],
              ["us", "Us"],
            ] as const
          ).map(([k, w]) => (
            <button key={k} type="button" class={`f-bell-chip${show === k ? " on" : ""}`} aria-pressed={show === k} onClick={() => setShow(k)}>
              {w}
            </button>
          ))}
        </div>
        {rows.length === 0 ? (
          <div class="f-bellnone">
            <Owl mood="sleep" class="mid" still />
            <p class="f-note">இன்னும் எதுவும் இல்லை. உன் ஆசிரியர் திருத்தியதும், Us இல் யாராவது உனக்கு எழுதியதும் இங்கே வரும்.</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.h}>
              <h2 class="f-bell-day">{g.h}</h2>
              <ul class="f-belllist">
                {g.list.map((x) =>
                  "b" in x ? (
                    <li key={`${x.b.unitId}.${x.b.n}.${x.b.q}.${x.b.what}.${x.b.at}`}>
                      <button type="button" class={`f-bellitem ${x.b.what}${x.b.fresh ? " fresh" : ""}`} onClick={() => props.onOpen(x.b.unitId, x.b.n)}>
                        <span class="f-bell-face">
                          <Avatar name={x.b.by || "?"} size="s" />
                          <i>{MARKS[x.b.what]}</i>
                        </span>
                        <span>
                          <b>{LOOK[x.b.what].words(x.b)}</b>
                          <small>
                            Stage {x.b.no} · Level {x.b.n} · Q{x.b.q} · {time(x.b.at)}
                          </small>
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li key={x.u.id}>
                      <button type="button" class={`f-bellitem us ${x.u.k}${x.u.fresh ? " fresh" : ""}`} onClick={() => props.onUs?.(x.u.mid)}>
                        <span class="f-bell-face">
                          <Avatar name={x.u.n || "?"} size="s" pic={picOf(x.u.pic)} />
                          <i>{x.u.k === "l" && x.u.t ? x.u.t : MARKS[x.u.k]}</i>
                        </span>
                        <span>
                          <b>{US_LOOK[x.u.k].words(x.u)}</b>
                          <small>Us · {time(x.u.at)}</small>
                        </span>
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))
        )}
      </div>
    </div>
  );
}

/** The faces of Us's lines in the bell (each picture once). */
function usPics(us: UsInboxItem[] | undefined): void {
  usePics((us ?? []).map((u) => u.pic));
}
