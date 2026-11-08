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

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
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

/** Photos picked for a message: thumbnails with ✕, the camera button, the crop first. */
export function usePicker(max: number, crop?: string) {
  const [list, setList] = useState<Picked[]>([]);
  const [file, setFile] = useState<Blob | null>(null);
  const input = useRef<HTMLInputElement>(null);
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
  const picker = (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        class="f-file"
        onChange={(e) => {
          const el = e.target as HTMLInputElement;
          const f = el.files?.[0];
          el.value = "";
          if (f) setFile(f);
        }}
      />
      {file && <CropSheet file={file} say={crop ?? "மஞ்சள் புள்ளிகளை இழு: தேவையான பகுதி மட்டும் பெட்டிக்குள்."} onClose={() => setFile(null)} onDone={(b) => void cropped(b)} />}
    </>
  );
  return { list, thumbs, picker, pick: () => input.current?.click(), clear, full: list.length >= max };
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

/** A swipe to the right replies; a hold reacts (a phone's long press; the page still scrolls up and down). */
function useTouch(onReply?: () => void, onHold?: () => void) {
  const st = useRef<{ x: number; y: number; t: number; dx: number; id: number } | null>(null);
  const el = useRef<HTMLLIElement>(null);
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
    onPointerDown: (e: PointerEvent) => {
      if (e.button > 0 || (e.target as HTMLElement).closest("button, img, a, .f-rxbar")) return;
      const t = window.setTimeout(() => {
        if (st.current && Math.abs(st.current.dx) < 8 && onHold) {
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
      if (Math.abs(dx) > 8) window.clearTimeout(s.t);
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
 * teacher's buttons and ⚑, after 😊 and ↩. `children`: under it (her ✓, her correction, her words to him).
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
}) {
  const x = props.x;
  const [bar, setBar] = useState(false);
  const canReact = !!props.onReact && !x.mine;
  const touch = useTouch(props.onReply, canReact ? () => setBar(true) : undefined);
  const pick = (e: string) => {
    setBar(false);
    sound(e === x.my ? "tap" : "pop");
    buzz(8);
    props.onReact!(e === x.my ? null : e);
  };
  const rx = RX_KEYS.filter((k) => (x.rx?.[k] ?? 0) > 0);
  const total = rx.reduce((a, k) => a + (x.rx?.[k] ?? 0), 0);
  return (
    <li
      id={`m-${x.id}`}
      class={`f-msg${x.tch ? " tch" : ""}${x.mine ? " mine" : ""}${props.cls ? ` ${props.cls}` : ""}`}
      ref={touch.ref}
      onPointerDown={touch.onPointerDown}
      onPointerMove={touch.onPointerMove}
      onPointerUp={touch.onPointerUp}
      onPointerCancel={touch.onPointerCancel}
      onContextMenu={touch.onContextMenu}
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
        <p class="f-msg-h">
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
        </p>
        {props.quote !== undefined && (
          <button type="button" class={`f-msg-q${props.quote ? "" : " gone"}`} onClick={props.onQuote ?? undefined} disabled={!props.quote}>
            <b>↩ {props.quote ? props.quote.n : "…"}</b>
            <span>{props.quote ? clipWords(props.quote.t) || (props.quote.ph ? "📷 படம்" : "") : "இந்த message இப்போது இல்லை"}</span>
          </button>
        )}
        <div class="f-msg-b">
          {x.t && <Words t={x.t} mt={x.mt} onMate={props.onMate} />}
          {props.pics}
        </div>
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
        {(canReact || props.onReply || props.acts) && (
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
                😊<i>+</i>
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
}) {
  const [t, setT] = useState("");
  const [busy, setBusy] = useState(false);
  const [emo, setEmo] = useState(false);
  const [at, setAt] = useState<{ q: string; from: number; to: number } | null>(null);
  const [tags, setTags] = useState<Taggable[]>([]);
  const pk = usePicker(2);
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
          😊
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
        <button type="button" class="f-tb-go" aria-label="Send" disabled={busy || (!t.trim() && !pk.list.length)} onClick={() => void send(t)}>
          {busy ? "…" : <Icon name="next" size={22} />}
        </button>
      </div>
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
