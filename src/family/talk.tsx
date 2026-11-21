// The talk's pieces, for a line's talk (usPost.tsx) and for the groups and private chats (chat.tsx). 8 Nov 2026, his
// voice note: "when we put any words inside the thread, inside the post, we don't know which message is for which one
// ... tagging option, reply option ... we can put so many emojis ... and actually that page need to be fun".
// - Bubble: one message. A reply carries the message it answers on top (a tap: it scrolls there and flashes); @names
//   are violet (a tap: his profile); reactions under it (tap one: yours; hold: who reacted); swipe it right to reply,
//   hold it to react (the reaction bar pops up), or the 😊 and ↩ buttons.
// - WriteBar: the words at the bottom: 😊 emoji, @ to tag someone in the talk (a list as he types), ↩ what it answers,
//   photos where allowed, one-tap words for a child.
// - The photos picked for a message: cropped first, two copies, and the blurred squares a classmate sees (seedOf).
// Words a student reads are Tamil; buttons English.

import { type ComponentChildren, render } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import type { HelpAsk } from "../../convex/lib/helpView";
import type { UsPic } from "../../convex/lib/us";
import { CropSheet } from "./crop";
import { NetError, uploadPhoto } from "./net";
import { jpegOf } from "./photos";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { Avatar, Icon, problemWords, Sheet, toast } from "./ui";

/** The reactions (a copy of convex/lib/chat.ts RX: tests/chat.test.ts checks they match). Never XP. */
export const RX: Record<string, string> = { c: "👏", h: "❤️", l: "😂", f: "🔥", k: "💯", i: "💡", t: "🤔", p: "🙏" };
const RX_KEYS = Object.keys(RX);
/** The emoji panel of the words box. */
const EMOJI =
  "😀 😂 🤣 😍 🥳 😎 🤩 😅 😇 🙂 😢 😮 🤔 😴 🙏 👏 👍 💪 🙌 🤝 👋 ❤️ 💜 🔥 💯 ⭐ 🌟 ✨ 🎉 🎂 🏆 👑 🎯 💡 📚 ✍️ 🧠 ✅ ❌ ❓ ➕ ➖ ✖️ ➗ 📐 📏 🦉 🌈".split(" ");

// ---------------------------------------------------------------- photos picked

/** The lines' copy of a photo: its long side. */
const SMALL = 560;
/** A photo picked: the big copy (cropped), the small one, the big one's size, an address to show it here, its blurred squares. */
export type Picked = { b: Blob; s: Blob; w: number; h: number; u: string; z?: string };
export type Sent = { s: string; b: string; w: number; h: number; z?: string };

/** A photo as a few coloured squares (convex/lib/us.ts seedOk): at most 6 on its long side, 3 hex digits each. */
export function seedOf(c: HTMLCanvasElement): string | undefined {
  try {
    const k = 6 / Math.max(c.width, c.height, 1);
    const w = Math.max(1, Math.min(6, Math.round(c.width * k)));
    const h = Math.max(1, Math.min(6, Math.round(c.height * k)));
    const t = document.createElement("canvas");
    t.width = w;
    t.height = h;
    const g = t.getContext("2d");
    if (!g) return undefined;
    g.imageSmoothingQuality = "high";
    g.drawImage(c, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let hex = "";
    for (let i = 0; i < w * h; i++) for (let j = 0; j < 3; j++) hex += (d[i * 4 + j] >> 4).toString(16);
    return `${w}x${h}:${hex}`;
  } catch {
    return undefined;
  }
}

const seeds = new Map<string, string>();
/** Blurred squares as a picture (drawn once). */
export function seedUrl(z: string): string | null {
  const had = seeds.get(z);
  if (had) return had;
  const m = /^(\d)x(\d):([0-9a-f]+)$/.exec(z);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    for (let j = 0; j < 3; j++) img.data[i * 4 + j] = parseInt(m[3][i * 3 + j] ?? "f", 16) * 17;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const u = c.toDataURL();
  seeds.set(z, u);
  return u;
}

export async function pickedOf(big: Blob): Promise<Picked> {
  const u = URL.createObjectURL(big);
  const img = new Image();
  img.src = u;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const k = Math.min(1, SMALL / Math.max(w, h, 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const g = c.getContext("2d");
  if (!g) throw new Error("no canvas");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  const z = seedOf(c);
  return { b: big, s: await jpegOf(c), w, h, u, ...(z ? { z } : {}) };
}

export async function sendPicked(list: Picked[]): Promise<Sent[]> {
  const ph: Sent[] = [];
  for (const p of list) ph.push({ s: await uploadPhoto(p.s), b: await uploadPhoto(p.b), w: p.w, h: p.h, ...(p.z ? { z: p.z } : {}) });
  return ph;
}

/**
 * Camera or Gallery (21 Nov 2026, his report: "when I press that, that asking to select the photo from the gallery
 * ... we want two options ... take the photo ... or select from the gallery"): a new Android phone's photo button opens
 * only its gallery, and `capture` only its camera. So a choice of the two, on the page's body (a write bar is a moving
 * box: anything fixed inside it is held to it, as the crop was: crop.tsx).
 */
function Choose(props: { onPick: (camera: boolean) => void; onClose: () => void }) {
  const host = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    host.current = el;
    return () => {
      render(null, el);
      el.remove();
    };
  }, []);
  useLayoutEffect(() => {
    if (host.current)
      render(
        <div class="f-choose" onClick={props.onClose}>
          <div class="f-choose-in" role="dialog" aria-label="Add a photo" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => props.onPick(true)}>
              <Icon name="camera" size={28} />
              Camera
            </button>
            <button type="button" onClick={() => props.onPick(false)}>
              <Icon name="image" size={28} />
              Gallery
            </button>
          </div>
        </div>,
        host.current,
      );
  });
  return null;
}

/** Photos picked for a message: thumbnails with ✕, the camera button (Camera or Gallery), the crop first. */
export function usePicker(max: number, crop?: string) {
  const [list, setList] = useState<Picked[]>([]);
  const [file, setFile] = useState<Blob | null>(null);
  const [choose, setChoose] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const cropped = async (b: Blob) => {
    setFile(null);
    try {
      const p = await pickedOf(b);
      buzz(6);
      sound("pop");
      setList((x) => [...x, p].slice(0, max));
    } catch {
      toast("இந்தப் படத்தைத் திறக்க முடியவில்லை. மீண்டும் எடு.", true);
    }
  };
  const clear = () => {
    list.forEach((p) => URL.revokeObjectURL(p.u));
    setList([]);
  };
  const thumbs = (
    <>
      {list.map((p, i) => (
        <span key={p.u} class="f-thumb">
          <img src={p.u} alt={`படம் ${i + 1}`} />
          <button
            type="button"
            class="f-thumb-x"
            aria-label={`Remove photo ${i + 1}`}
            onClick={() => {
              URL.revokeObjectURL(p.u);
              setList(list.filter((_, j) => j !== i));
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      ))}
    </>
  );
  const took = (e: Event) => {
    const el = e.target as HTMLInputElement;
    const f = el.files?.[0];
    el.value = "";
    if (f) setFile(f);
  };
  const picker = (
    <>
      <input ref={input} type="file" accept="image/*" class="f-file" onChange={took} />
      <input ref={cam} type="file" accept="image/*" capture="environment" class="f-file-cam" hidden onChange={took} />
      {choose && (
        <Choose
          onClose={() => setChoose(false)}
          onPick={(c) => {
            setChoose(false);
            (c ? cam : input).current?.click();
          }}
        />
      )}
      {file && <CropSheet file={file} say={crop ?? "மஞ்சள் புள்ளிகளை இழு: தேவையான பகுதி மட்டும் பெட்டிக்குள்."} onClose={() => setFile(null)} onDone={(b) => void cropped(b)} />}
    </>
  );
  return { list, thumbs, picker, pick: () => (buzz(), setChoose(true)), clear, full: list.length >= max };
}

// ---------------------------------------------------------------- one message

/** A message as the talk shows it (a line's talk, a group, a private chat). */
export type Talk = {
  id: string;
  at: number;
  /** The name as the one looking may know it ("நீ", "கேட்டவர்", a name). */
  n: string;
  sid?: string;
  pic?: string;
  tch?: boolean;
  mine?: boolean;
  t?: string;
  mt?: { id: string; n: string }[];
  rx?: Record<string, number>;
  my?: string;
};
/** What a reply answers, in a few words (null: that message is gone). */
export type QuoteOf = { n: string; t?: string; ph?: boolean } | null;

/** A few words of a message (a quote, a reply's preview). */
export const clipWords = (t: string | undefined, n = 70) => {
  const w = (t ?? "").replace(/\s+/g, " ").trim();
  return w.length > n ? `${w.slice(0, n - 1)}…` : w;
};

/** It scrolls to a message and flashes it (a quote tapped). */
export function jumpTo(id: string): void {
  const el = document.getElementById(`m-${id}`);
  if (!el) return toast("அந்த message மேலே இருக்கிறது.");
  buzz(6);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
  window.setTimeout(() => el.classList.remove("flash"), 1600);
}

/** A message's words with its @names in violet (a tap: his profile). */
export function Words(props: { t: string; mt?: { id: string; n: string }[]; onMate: (id: string) => void }) {
  const names = [...(props.mt ?? [])].sort((a, b) => b.n.length - a.n.length);
  const parts: ComponentChildren[] = [];
  let rest = props.t;
  let k = 0;
  while (rest) {
    let best: { i: number; m: { id: string; n: string } } | null = null;
    for (const m of names) {
      const i = rest.indexOf(`@${m.n}`);
      if (i >= 0 && (!best || i < best.i)) best = { i, m };
    }
    if (!best) {
      parts.push(rest);
      break;
    }
    if (best.i) parts.push(rest.slice(0, best.i));
    const who = best.m;
    parts.push(
      <b
        key={k++}
        class="f-at"
        onClick={() => {
          buzz();
          props.onMate(who.id);
        }}
      >
        @{who.n}
      </b>,
    );
    rest = rest.slice(best.i + 1 + who.n.length);
  }
  return <p class="f-msg-t">{parts}</p>;
}

/**
 * A message full screen (20 Nov 2026, the AI's explanations, his words: "put the full screen icon ... so they can read
 * that ... easily read and close"): ARISTORA's navy, big letters, the page behind it still. ✕, Close at the end and the
 * phone's Back close it (opened with showSheet).
 */
export function ReadFull(props: { n: string; sub?: string; t: string; mt?: { id: string; n: string }[]; onMate: (id: string) => void; staff?: boolean; onClose: () => void }) {
  useEffect(() => {
    document.body.classList.add("f-noscroll");
    return () => document.body.classList.remove("f-noscroll");
  }, []);
  return (
    <div class="f-read" role="dialog" aria-modal="true" aria-label={props.n}>
      <header class="f-read-h">
        <i class="f-msg-ai" aria-hidden="true">
          <Icon name="robot" size={18} />
        </i>
        <span>
          <b>{props.n}</b>
          {props.sub && <small>{props.sub}</small>}
        </span>
        <button type="button" class="f-read-x" aria-label="Close" onClick={props.onClose}>
          <Icon name="close" size={22} />
        </button>
      </header>
      <div class="f-read-b">
        <Words t={props.t} mt={props.mt} onMate={props.onMate} />
        <button type="button" class="f-read-done" onClick={props.onClose}>
          {props.staff ? "Close" : "மூடு"}
        </button>
      </div>
    </div>
  );
}

/** A swipe to the right replies; a hold reacts (a phone's long press; the page still scrolls up and down). */
function useTouch(onReply?: () => void, onHold?: () => void) {
  const st = useRef<{ x: number; y: number; t: number; dx: number; id: number } | null>(null);
  const el = useRef<HTMLLIElement>(null);
  // The last touch swiped or held: the click that follows it is not a tap (Bubble `tap`).
  const did = useRef(false);
  const reset = () => {
    const s = st.current;
    if (s) window.clearTimeout(s.t);
    st.current = null;
    const e = el.current;
    if (e) {
      e.style.transform = "";
      e.classList.remove("swiping");
    }
  };
  return {
    ref: el,
    used: () => {
      const u = did.current;
      did.current = false;
      return u;
    },
    onPointerDown: (e: PointerEvent) => {
      did.current = false;
      if (e.button > 0 || (e.target as HTMLElement).closest("button, img, a, .f-rxbar")) return;
      const t = window.setTimeout(() => {
        if (st.current && Math.abs(st.current.dx) < 8 && onHold) {
          did.current = true;
          buzz(14);
          sound("pop");
          onHold();
        }
      }, 450);
      st.current = { x: e.clientX, y: e.clientY, t, dx: 0, id: e.pointerId };
    },
    onPointerMove: (e: PointerEvent) => {
      const s = st.current;
      if (!s || s.id !== e.pointerId) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) return reset();
      s.dx = dx;
      if (Math.abs(dx) > 8) {
        window.clearTimeout(s.t);
        did.current = true;
      }
      if (onReply && dx > 10 && el.current) {
        el.current.classList.add("swiping");
        el.current.style.transform = `translateX(${Math.min(dx, 84)}px)`;
      }
    },
    onPointerUp: () => {
      const s = st.current;
      if (s && onReply && s.dx > 62) {
        buzz(10);
        sound("tap");
        onReply();
      }
      reset();
    },
    onPointerCancel: reset,
    onContextMenu: (e: Event) => {
      if (onHold) e.preventDefault();
    },
  };
}

/** The reactions to pick from: one tap (yours again takes it back). */
function RxBar(props: { my?: string; onPick: (e: string) => void; onClose: () => void }) {
  return (
    <>
      <button type="button" class="f-rxbar-bg" aria-label="Close" onClick={props.onClose} />
      <div class="f-rxbar" role="group" aria-label="React">
        {RX_KEYS.map((k, i) => (
          <button key={k} type="button" class={props.my === k ? "on" : ""} style={{ "--i": String(i) }} aria-label={`React ${RX[k]}`} aria-pressed={props.my === k} onClick={() => props.onPick(k)}>
            {RX[k]}
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * One message. `quote`: what it answers (undefined: not a reply). `pics`: its photos (the caller's Pics). `acts`: a
 * teacher's buttons and ⚑, after 😊 and ↩. `children`: under it (her ✓, her correction, her words to him). `tap`: the
 * 😊 ↩ row shows only once the message is tapped (a chat, 20 Nov 2026, his yes: "show it on tap"; a swipe still
 * replies, a hold still reacts). `full`: the AI's message (20 Nov 2026, his words: "if the AI send the message, use the
 * full width ... black background ... put the full screen icon"): one card the chat's width, never a side, and its ⤢
 * opens it full screen (`full` is what the ⤢ does: ReadFull).
 */
export function Bubble(props: {
  x: Talk;
  cls?: string;
  ava?: ComponentChildren;
  tags?: ComponentChildren;
  quote?: QuoteOf;
  onQuote?: () => void;
  pics?: ComponentChildren;
  me?: string;
  onMate: (id: string) => void;
  onReply?: () => void;
  onReact?: (e: string | null) => void;
  onWho?: () => void;
  acts?: ComponentChildren;
  children?: ComponentChildren;
  tap?: { open: boolean; onTap: () => void };
  full?: () => void;
}) {
  const x = props.x;
  const [bar, setBar] = useState(false);
  const canReact = !!props.onReact && !x.mine;
  const touch = useTouch(props.onReply, canReact ? () => setBar(true) : undefined);
  const tap = props.tap;
  const showActs = !tap || tap.open;
  const pick = (e: string) => {
    setBar(false);
    sound(e === x.my ? "tap" : "pop");
    buzz(8);
    props.onReact!(e === x.my ? null : e);
  };
  const rx = RX_KEYS.filter((k) => (x.rx?.[k] ?? 0) > 0);
  const total = rx.reduce((a, k) => a + (x.rx?.[k] ?? 0), 0);
  const full = props.full;
  const head = (
    <p class="f-msg-h">
      {full && (
        <i class="f-msg-ai" aria-hidden="true">
          <Icon name="robot" size={15} />
        </i>
      )}
      <b
        class={x.sid ? "tap" : ""}
        onClick={
          x.sid
            ? () => {
                buzz();
                props.onMate(x.sid!);
              }
            : undefined
        }
      >
        {x.n}
      </b>
      {props.tags}
      <small>{agoShort(x.at)}</small>
      {full && (
        <button
          type="button"
          class="f-msg-full"
          aria-label="Full screen"
          onClick={() => {
            buzz();
            full();
          }}
        >
          <Icon name="expand" size={18} />
        </button>
      )}
    </p>
  );
  const quote = props.quote !== undefined && (
    <button type="button" class={`f-msg-q${props.quote ? "" : " gone"}`} onClick={props.onQuote ?? undefined} disabled={!props.quote}>
      <b>↩ {props.quote ? props.quote.n : "…"}</b>
      <span>{props.quote ? clipWords(props.quote.t) || (props.quote.ph ? "📷 படம்" : "") : "இந்த message இப்போது இல்லை"}</span>
    </button>
  );
  const body = (
    <div class="f-msg-b">
      {x.t && <Words t={x.t} mt={x.mt} onMate={props.onMate} />}
      {props.pics}
    </div>
  );
  return (
    <li
      id={`m-${x.id}`}
      class={`f-msg${x.tch ? " tch" : ""}${x.mine ? " mine" : ""}${full ? " ai" : ""}${tap?.open ? " acts" : ""}${props.cls ? ` ${props.cls}` : ""}`}
      ref={touch.ref}
      onPointerDown={touch.onPointerDown}
      onPointerMove={touch.onPointerMove}
      onPointerUp={touch.onPointerUp}
      onPointerCancel={touch.onPointerCancel}
      onContextMenu={touch.onContextMenu}
      onClick={
        tap
          ? (e) => {
              // A tap on the message itself; never one on a face, a name, a tag, a photo, a voice note or a button.
              if (touch.used() || (e.target as HTMLElement).closest("button, img, a, audio, .tap, .f-at, .f-rxbar-bg")) return;
              buzz();
              tap.onTap();
            }
          : undefined
      }
    >
      {props.onReply && <i class="f-msg-swipe" aria-hidden="true">↩</i>}
      <span class="f-msg-ava">
        {props.ava ?? (
          <span
            class={x.sid ? "tap" : ""}
            onClick={
              x.sid
                ? () => {
                    buzz();
                    props.onMate(x.sid!);
                  }
                : undefined
            }
          >
            <Avatar name={x.mine && props.me ? props.me : x.n} size="s" pic={picOf(x.pic)} />
          </span>
        )}
      </span>
      <div class="f-msg-w">
        {full ? (
          <div class="f-msg-card">
            {head}
            {quote}
            {body}
          </div>
        ) : (
          <>
            {head}
            {quote}
            {body}
          </>
        )}
        {rx.length > 0 && (
          <div class="f-rxs">
            {rx.map((k) => (
              <button
                key={k}
                type="button"
                class={`f-rx${x.my === k ? " on" : ""}`}
                aria-label={`${RX[k]} ${x.rx![k]}`}
                aria-pressed={x.my === k}
                onClick={() => (canReact ? pick(k) : props.onWho?.())}
              >
                {RX[k]}
                <b>{x.rx![k]}</b>
              </button>
            ))}
            {props.onWho && total > 0 && (
              <button type="button" class="f-rx who" aria-label="Who reacted" onClick={props.onWho}>
                <Icon name="people" size={14} />
              </button>
            )}
          </div>
        )}
        {props.children}
        {showActs && (canReact || props.onReply || props.acts) && (
          <div class="f-msg-a">
            {canReact && (
              <button
                type="button"
                class={`f-msg-b1 rx${x.my ? " on" : ""}`}
                aria-label="React"
                onClick={() => {
                  buzz();
                  setBar(!bar);
                }}
              >
                <Icon name="smile" size={18} />
                <i>+</i>
              </button>
            )}
            {props.onReply && (
              <button
                type="button"
                class="f-msg-b1"
                onClick={() => {
                  buzz();
                  props.onReply!();
                }}
              >
                ↩ Reply
              </button>
            )}
            {props.acts}
          </div>
        )}
      </div>
      {bar && canReact && <RxBar my={x.my} onPick={pick} onClose={() => setBar(false)} />}
    </li>
  );
}

/** "now", "5m", "2h", "Yesterday", "8 Nov" (us.tsx ago, kept here so the chats need nothing of the tab). */
export function agoShort(t: number, now = Date.now()): string {
  const SL = 330 * 60_000;
  const day = (x: number) => Math.floor((x + SL) / 86_400_000);
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const d = day(now) - day(t);
  if (d === 0) return `${Math.floor(m / 60)}h`;
  if (d === 1) return "Yesterday";
  return new Date(t + SL).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

/** Who reacted to a message: a chip per reaction, then the names (a tap on a student: his profile). */
export function ReactorsSheet(props: {
  load: () => Promise<{ n: string; pic?: string; tch?: boolean; e: string }[]>;
  onClose: () => void;
}) {
  const [list, setList] = useState<{ n: string; pic?: string; tch?: boolean; e: string }[] | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  useEffect(() => {
    props.load().then(setList, (e) => {
      toast(problemWords(e), true);
      props.onClose();
    });
  }, []);
  usePics((list ?? []).map((r) => r.pic));
  const kinds = RX_KEYS.filter((k) => list?.some((r) => r.e === k));
  const shown = (list ?? []).filter((r) => !only || r.e === only);
  return (
    <Sheet title={list ? `${list.length} reactions` : "…"} onClose={props.onClose} class="f-cheers">
      <div class="f-rxs who-k">
        <button type="button" class={`f-rx${only ? "" : " on"}`} onClick={() => setOnly(null)}>
          All <b>{list?.length ?? ""}</b>
        </button>
        {kinds.map((k) => (
          <button key={k} type="button" class={`f-rx${only === k ? " on" : ""}`} onClick={() => setOnly(k)}>
            {RX[k]} <b>{list!.filter((r) => r.e === k).length}</b>
          </button>
        ))}
      </div>
      <ul class="f-cheer-l">
        {shown.map((r, i) => (
          <li key={i} class={r.tch ? "tch" : ""}>
            <Avatar name={r.n} size="s" pic={picOf(r.pic)} />
            <b>{r.n}</b>
            {r.tch && <i>ஆசிரியர்</i>}
            <span class="f-rx-e">{RX[r.e] ?? "👏"}</span>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// ---------------------------------------------------------------- the words box

/** Someone a message can tag (people in this talk). */
export type Taggable = { id: string; n: string; pic?: string; g?: number };

/**
 * The words at the bottom of a talk: one-tap words (a child; never XP), 😊 emoji, @ to tag someone in this talk (a list
 * as he types; each tagged is told), ↩ what it answers, photos where allowed. `onSend` gets the words, the photos
 * (uploaded) and the ids tagged.
 */
export function WriteBar(props: {
  quick?: readonly string[];
  max: number;
  hint: string;
  photos: boolean;
  re: { id: string; n: string; t?: string } | null;
  onUnRe: () => void;
  people?: Taggable[];
  /** He started a tag (@): a chat fetches its group's members then (once), so anyone in it can be tagged. */
  onAt?: () => void;
  onSend: (text: string, ph: Sent[], mt: string[]) => Promise<unknown>;
  /**
   * A voice note in the write row (20 Nov 2026, an explanation's thread: help.tsx useVoiceRec): `mic` takes the send
   * button's place while the box is empty, `strip` (recording, or a note to hear and send) takes the whole row's.
   */
  voice?: { mic: ComponentChildren; strip: ComponentChildren | null };
  /**
   * The talk shows his words itself the moment he sends them (a chat, 14 Nov 2026): the box empties at once and he can
   * write the next ones; refused, or no signal: his words come back into the box. Never with photos (they upload first).
   */
  fast?: boolean;
  /** Above the row: where the words go (an explanation's thread: "To (ii) · Hana"). */
  top?: ComponentChildren;
  /** Its photo button from elsewhere (a teacher's 📷 under a sub-question, 21 Nov 2026). */
  pickRef?: { current?: () => void };
}) {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const [emo, setEmo] = useState(false);
  const [at, setAt] = useState<{ q: string; from: number; to: number } | null>(null);
  const [tags, setTags] = useState<Taggable[]>([]);
  const pk = usePicker(2);
  if (props.pickRef) props.pickRef.current = props.photos && !pk.full ? pk.pick : undefined;
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (props.re) box.current?.focus();
  }, [props.re?.id]);
  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 110)}px`;
  };
  const look = (v: string, caret: number) => {
    const m = /(^|\s)@([^\s@]{0,20})$/u.exec(v.slice(0, caret));
    const can = !!props.people?.length || !!props.onAt;
    if (m && can) props.onAt?.();
    setAt(m && can ? { q: m[2], from: caret - m[2].length - 1, to: caret } : null);
  };
  // The box changed by a tap (an emoji, a tag): the words and the caret at once, before the next key arrives.
  const put = (v: string, caret: number) => {
    const el = box.current;
    if (el) {
      el.value = v;
      el.focus();
      el.setSelectionRange(caret, caret);
      grow(el);
    }
    setT(v);
  };
  const insert = (s: string) => {
    const el = box.current;
    const a = el?.selectionStart ?? t.length;
    const b = el?.selectionEnd ?? t.length;
    const v = (t.slice(0, a) + s + t.slice(b)).slice(0, props.max);
    put(v, Math.min(v.length, a + s.length));
    look(v, a + s.length);
  };
  const tag = (p: Taggable) => {
    if (!at) return;
    const w = `@${p.n} `;
    const v = (t.slice(0, at.from) + w + t.slice(at.to)).slice(0, props.max);
    put(v, at.from + w.length);
    setTags((x) => (x.some((y) => y.id === p.id) ? x : [...x, p]));
    setAt(null);
    buzz();
  };
  const send = async (words: string) => {
    const w = words.trim();
    if (busy || (!w && !pk.list.length)) return;
    const mtOf = () => [...new Set(tags.filter((x) => w.includes(`@${x.n}`)).map((x) => x.id))];
    if (props.fast && !pk.list.length) {
      const mt = mtOf();
      const kept = tags;
      sound("send");
      buzz(8);
      setT("");
      setTags([]);
      setEmo(false);
      setAt(null);
      if (box.current) {
        box.current.value = "";
        box.current.style.height = "";
      }
      props.onSend(w, [], mt).then(
        (r) => {
          const xp = (r as { xp?: number } | undefined)?.xp;
          if (xp) toast(`💎 +${xp} XP: உன் சொந்த வார்த்தைகளுக்கு!`);
        },
        (e) => {
          toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. பிறகு அனுப்பு." : problemWords(e), true);
          // His words back, before anything he wrote since.
          const now = box.current?.value ?? "";
          const v = (now ? `${w} ${now}` : w).slice(0, props.max);
          put(v, v.length);
          setTags((x) => [...kept.filter((k) => !x.some((y) => y.id === k.id)), ...x]);
        },
      );
      return;
    }
    setBusy(true);
    try {
      const ph = props.photos ? await sendPicked(pk.list) : [];
      const mt = tags.filter((x) => w.includes(`@${x.n}`)).map((x) => x.id);
      const r = (await props.onSend(w, ph, [...new Set(mt)])) as { xp?: number } | undefined;
      sound("send");
      buzz(8);
      pk.clear();
      setT("");
      setTags([]);
      setEmo(false);
      setAt(null);
      if (box.current) box.current.style.height = "";
      if (r?.xp) toast(`💎 +${r.xp} XP: உன் சொந்த வார்த்தைகளுக்கு!`);
    } catch (e) {
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. பிறகு அனுப்பு." : problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };
  const quick = props.quick ?? [];
  const found = at ? (props.people ?? []).filter((p) => p.n.toLowerCase().includes(at.q.toLowerCase())).slice(0, 6) : [];
  usePics(found.map((p) => p.pic));
  return (
    <div class="f-tb" role="group" aria-label="Write">
      {found.length > 0 && (
        <ul class="f-tb-at" role="listbox" aria-label="Tag someone">
          {found.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => tag(p)}>
                <Avatar name={p.n} size="s" pic={picOf(p.pic)} />
                <b>{p.n}</b>
                {p.g !== undefined && <i class="f-gchip">{p.g}</i>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {quick.length > 0 && !t && !props.re && !emo && (
        <div class="f-tb-q">
          {quick.map((q) => (
            <button key={q} type="button" disabled={busy} onClick={() => void send(q)}>
              {q}
            </button>
          ))}
        </div>
      )}
      {props.re && (
        <div class="f-tb-re">
          <span>
            <b>↩ {props.re.n}</b>
            {props.re.t ? <small>{clipWords(props.re.t, 60)}</small> : null}
          </span>
          <button type="button" aria-label="Not a reply" onClick={props.onUnRe}>
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
      {pk.list.length > 0 && <div class="f-tb-ph">{pk.thumbs}</div>}
      {props.top}
      {props.voice?.strip ?? (
        <div class="f-tb-row">
          <button
            type="button"
            class={`f-tb-emo${emo ? " on" : ""}`}
            aria-label="Emoji"
            aria-pressed={emo}
            onClick={() => {
              buzz();
              setEmo(!emo);
            }}
          >
            <Icon name="smile" size={24} />
          </button>
          {props.photos && !pk.full && (
            <button type="button" class="f-tb-cam" aria-label="Add a photo" onClick={pk.pick}>
              <Icon name="camera" size={22} />
            </button>
          )}
          <textarea
            ref={box}
            class="f-tb-in"
            rows={1}
            maxLength={props.max}
            placeholder={props.hint}
            aria-label="Your words"
            value={t}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              setT(el.value);
              grow(el);
              look(el.value, el.selectionStart ?? el.value.length);
            }}
          />
          {props.voice && !busy && !t.trim() && !pk.list.length ? (
            props.voice.mic
          ) : (
            <button type="button" class="f-tb-go" aria-label="Send" disabled={busy || (!t.trim() && !pk.list.length)} onClick={() => void send(t)}>
              {busy ? "…" : <Icon name="next" size={22} />}
            </button>
          )}
        </div>
      )}
      {emo && (
        <div class="f-tb-ep" role="group" aria-label="Emoji">
          {((props.people && props.people.length > 0) || props.onAt) && (
            <button type="button" class="f-tb-atb" aria-label="Tag someone" onClick={() => insert(t && !/\s$/.test(t) ? " @" : "@")}>
              @
            </button>
          )}
          {EMOJI.map((e) => (
            <button key={e} type="button" onClick={() => insert(e)}>
              {e}
            </button>
          ))}
        </div>
      )}
      {pk.picker}
    </div>
  );
}

// ---------------------------------------------------------------- an explanation's sub-questions

/** A printed sub-question's own label: a key part cut in two for the phone ("ii · பெயர்") is its printed "ii". */
export const baseOf = (p: string): string => p.split(" · ")[0].trim();
const norm = (s: string) => s.toLowerCase().replace(/[()[\]\s.:]/g, "");
/** Where a part's talk is on the page (a tap on 🎤 ✍ or a send scrolls there). */
const idOf = (b: string) => `h-tk-${norm(b) || "all"}`;

/**
 * The printed sub-questions he didn't get right: a typed part wrong or blank, a teacher's part below its marks or not
 * marked yet (convex/lib/helpParts.ts wrongOf, the same rule). null: not known, every one is his.
 */
export function wrongIn(a: HelpAsk): string[] | null {
  if (!a.parts?.length) return null;
  const full = a.photo?.st === "done" && a.photo.got !== undefined && a.photo.got >= a.photo.max;
  const out: string[] = [];
  for (const x of a.parts) {
    const right = x.ok === true || (x.got !== undefined && x.m !== undefined ? x.got >= x.m : x.ok === null && full);
    if (!right && !out.includes(baseOf(x.p))) out.push(baseOf(x.p));
  }
  return out.length ? out : null;
}

/** A thread's message, as far as its place goes. */
type Line = { id: string; pt?: string };
/** The newest messages a part shows (the rest: one tap). */
const PART_SHOW = 3;

/**
 * An explanation's thread, its talk under each sub-question (21 Nov 2026, his voice note: "why we can't put the mic
 * button below the wrong sub-question? And why we can't select the student before put the explanation? ... the voice
 * note going to be below the wrong answer, below the question ... everything structured way"; his yeses: the talk
 * inside the sub-question on the same page, a student sees only his own wrong ones).
 * - Each message goes under its sub-question (`pt`); none, or one this question doesn't have: under the whole question.
 *   A question of one part: one talk, under it; of none: one talk under the question.
 * - Under each: who didn't get it right and still waits (a teacher's chips: whom her words are for, all of them
 *   first), its newest messages (the rest one tap away), her 🎤 and ✍ for them right there. A student sees his own
 *   wrong ones' talk (and the whole question's), and asks under one of them (his first wrong one unless he picks).
 * - The write bar says where the words go ("To (ii) · Hana, Mira"; ✕: the whole question, everyone).
 */
export function useParts<M extends Line>(p: { staff: boolean; asks: HelpAsk[]; msgs: M[]; bubble: (m: M, prev?: M) => ComponentChildren; voice: () => void; photo: () => void }) {
  const [labels, setLabels] = useState<string[] | null>(null);
  // Where her words go: a sub-question, or "" the whole question. A student's: his pick of his wrong ones.
  const [target, setTarget] = useState("");
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [all, setAll] = useState<string[]>([]);
  const [went, setWent] = useState(false);
  const bases: string[] = [];
  for (const l of labels ?? []) {
    const b = baseOf(l);
    if (b && !bases.includes(b)) bases.push(b);
  }
  const many = bases.length > 1;
  const partOf = (m: M) => (bases.length === 1 ? bases[0] : (bases.find((b) => norm(b) === norm(m.pt ?? "")) ?? ""));
  const wrong = new Map(p.asks.map((a) => [a.id, wrongIn(a)]));
  const hasIt = (a: HelpAsk, b: string) => !b || !wrong.get(a.id) || wrong.get(a.id)!.includes(b);
  const mine = p.asks.find((a) => a.mine);
  const his = mine ? bases.filter((b) => hasIt(mine, b)) : bases;
  // Whom a talk is for: who didn't get it right and still waits.
  const who = (b: string) => p.asks.filter((a) => a.st === "open" && a.sid && hasIt(a, b));
  const picked = (b: string) => {
    const ids = who(b).map((a) => a.sid!);
    return picks[b]?.filter((x) => ids.includes(x)) ?? ids;
  };
  const chips = (b: string) => !!b || !bases.length;
  const at = p.staff ? target : his.includes(target) ? target : (his[0] ?? "");
  const pt = at || (bases.length === 1 ? bases[0] : "");
  const go = (b: string) =>
    window.setTimeout(() => {
      const el = document.getElementById(idOf(b));
      (el?.querySelector("li:last-child") ?? el)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 80);
  // A student lands on his first wrong sub-question (a long question: it is below the fold).
  useEffect(() => {
    if (went || !labels || p.staff || !his.length) return;
    setWent(true);
    go(his[0]);
  }, [labels]);
  const write = (b: string) => {
    buzz();
    setTarget(b);
    document.querySelector<HTMLTextAreaElement>(".c-room .f-tb-in")?.focus();
  };
  const block = (b: string) => {
    const list = p.msgs.filter((m) => partOf(m) === b);
    if (!p.staff && b && !his.includes(b)) return null;
    const ws = chips(b) ? who(b) : [];
    const on = picked(b);
    const title = !b && many;
    const faces = p.staff ? ws.length > 0 : ws.length > 1;
    // A student asks under one of his wrong ones (two or more: else his words go there by themselves).
    const ask = !p.staff && !!b && his.length > 1;
    // Nothing said under it and nobody waits on it (a sub-question they all got right): nothing under it.
    if (!list.length && !(p.staff ? ws.length : faces || ask)) return null;
    const show = all.includes(b) ? list : list.slice(-PART_SHOW);
    const toggle = (id: string) => {
      buzz();
      setPicks({ ...picks, [b]: on.includes(id) ? on.filter((x) => x !== id) : [...on, id] });
    };
    return (
      <section id={idOf(b)} class={`h-talk${b === at && (p.staff ? ws.length > 0 : many) ? " here" : ""}`} aria-label={b ? `(${b})` : p.staff ? "Whole question" : "முழுக் கேள்வி"}>
        {(title || faces || ask || p.staff) && (
          <div class="h-tk-h">
            {title && <b class="h-tk-t">{p.staff ? "Whole question" : "முழுக் கேள்வி"}</b>}
            {faces && (
              <ul class="h-tk-who" aria-label={p.staff ? "Who it is for" : "இதில் தவறியவர்கள்"}>
                {ws.map((a) => {
                  const face = (
                    <>
                      <Avatar name={a.n} size="s" pic={picOf(a.pic)} />
                      <span>{a.mine ? "நீ" : a.n.split(" ")[0]}</span>
                    </>
                  );
                  return (
                    <li key={a.id}>
                      {p.staff ? (
                        <button type="button" class={`h-tk-p${on.includes(a.sid!) ? " on" : ""}`} aria-pressed={on.includes(a.sid!)} onClick={() => toggle(a.sid!)}>
                          {face}
                        </button>
                      ) : (
                        <span class="h-tk-p">{face}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <span class="f-sp" />
            {p.staff ? (
              <>
                {ws.length > 0 && (
                  <>
                    <button type="button" class="h-tk-i" aria-label="Voice note" disabled={!on.length} onClick={() => (setTarget(b), p.voice())}>
                      <Icon name="mic" size={19} />
                    </button>
                    <button type="button" class="h-tk-i" aria-label="Photo" disabled={!on.length} onClick={() => (setTarget(b), p.photo())}>
                      <Icon name="camera" size={19} />
                    </button>
                  </>
                )}
                <button type="button" class={`h-tk-i${b === at ? " on" : ""}`} aria-label={b || ws.length ? "Write" : "Write to everyone"} aria-pressed={b === at} disabled={ws.length > 0 && !on.length} onClick={() => write(b)}>
                  <Icon name="pen" size={17} />
                </button>
              </>
            ) : (
              ask && (
                <button type="button" class={`h-tk-ask${b === at ? " on" : ""}`} aria-pressed={b === at} onClick={() => write(b)}>
                  <Icon name="pen" size={14} /> கேள்
                </button>
              )
            )}
          </div>
        )}
        {list.length > show.length && (
          <button type="button" class="h-tk-more" onClick={() => setAll([...all, b])}>
            {p.staff ? `${list.length - show.length} earlier` : `முந்தைய ${list.length - show.length}`}
          </button>
        )}
        {show.length > 0 && <ol class="f-msgs c-msgs h-tk-m">{show.map((m, i) => p.bubble(m, show[i - 1]))}</ol>}
      </section>
    );
  };
  const names = (b: string) =>
    picked(b)
      .map((id) => p.asks.find((a) => a.sid === id)?.n.split(" ")[0])
      .join(", ");
  const everyone = !chips(at) || picked(at).length === who(at).length;
  return {
    ready: labels !== null,
    onParts: (l: string[]) => setLabels((x) => (x && x.join("\n") === l.join("\n") ? x : l)),
    /** The talk under a sub-question (its last key part's slot). */
    talk: (b: string) => (bases.length ? block(b) : null),
    /** The whole question's talk, under the question. */
    after: labels === null || bases.length === 1 ? null : block(""),
    /** Where the words go, above the write row. */
    top: p.staff
      ? (at || !everyone) && (
          <p class="h-to">
            <b>{at ? `To (${at})` : "To"}</b>
            <span>{picked(at).length ? names(at) : "pick who it's for"}</span>
            {at && (
              <button type="button" aria-label="To the whole question" onClick={() => setTarget("")}>
                <Icon name="close" size={14} />
              </button>
            )}
          </p>
        )
      : many &&
        at && (
          <p class="h-to">
            <b>({at}) பற்றி</b>
          </p>
        ),
    hint: p.staff && many && !at ? "Write to everyone…" : undefined,
    /** What a message carries: its sub-question, and whom it is for (her picks, when not everyone). */
    aim: (): { pt?: string; mt?: string[] } => {
      if (p.staff && chips(at) && !picked(at).length) throw new Error(`Pick who it's for: tap their faces${at ? ` under (${at})` : ""}.`);
      return { ...(pt ? { pt } : {}), ...(p.staff && !everyone ? { mt: picked(at) } : {}) };
    },
    go,
    /** A reply goes under the message it answers (a student's: if it is one of his). */
    follow: (m: M) => setTarget(partOf(m)),
  };
}
