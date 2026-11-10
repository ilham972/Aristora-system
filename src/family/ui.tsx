// The family app's small shared pieces: its icons (drawn here, the same on every phone), the owl and its moods (on a
// soft glow in headers), the flame (days in a row) and the gem (XP), the toast, the bottom sheet, the count-up and the
// rolling number, the trophies' names, and a few words.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Trophy } from "../../convex/lib/family";
import { NetError } from "./net";
import { Owl } from "./owl";

/** The centre's name, in one place (the app may serve other centres one day; not now). */
export const BRAND = "ARISTORA";

export const firstName = (name: string) => name.split(" ")[0];

/** "2n-1" → "2n − 1" for the eye; the typed text stays plain. */
const SUP: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
/** "x^6" → "x⁶" (any power: 10 Nov 2026, Indices); a "^" he just typed waits for its digits. */
export const pretty = (s: string) =>
  s
    .replace(/\^(\d+)/g, (_, d: string) => [...d].map((x) => SUP[x]).join(""))
    .replace(/\*/g, "×")
    .replace(/-/g, "−");

/** A unit written after a number ("44 cm", "42 m"): upright, never a letter of the maths. */
const UNIT_AFTER = /^(mm|cm|km|kg|mg|ml|min|rs|g|m|l|h|s)$/i;

/**
 * Text cut into runs, true = letters of the maths (5 Nov 2026: in the app's font x looked like ×, on the pad and in his
 * box; the printed book sets them in italic). A unit after a number and a part's label ("ii)") stay upright.
 */
export function mathRuns(s: string): [string, boolean][] {
  const parts = s.split(/([A-Za-z]+)/);
  const out: [string, boolean][] = [];
  parts.forEach((p, i) => {
    if (!p) return;
    const unit = UNIT_AFTER.test(p) && /\d\s$/.test(parts[i - 1] ?? "");
    const label = /^[ivx]+$/i.test(p) && (parts[i + 1] ?? "").startsWith(")");
    out.push([p, i % 2 === 1 && !unit && !label]);
  });
  return out;
}

/** Maths for the eye: pretty, its letters in italic (`.f-v`). */
export const Maths = (props: { s: string }) => (
  <>{mathRuns(pretty(props.s)).map(([t, v], i) => (v ? <i key={i} class="f-v">{t}</i> : t))}</>
);

export function problemWords(e: unknown): string {
  if (e instanceof NetError && e.offline) return "இணையம் இல்லை. பிறகு மீண்டும் முயற்சி செய்.";
  return e instanceof Error ? e.message : String(e);
}

/** Tamil names of the school terms (each term is a World). */
export const TERM_TA: Record<number, string> = { 0: "கூடுதல்", 1: "முதலாம் தவணை", 2: "இரண்டாம் தவணை", 3: "மூன்றாம் தவணை" };
/** The O/L map's Worlds: its paper parts (an O/L topic's `term`), as OL_PARTS in convex/lib/syllabus.ts names them
 *  (copied: that file would bring the whole syllabus into this small bundle). */
export const PART_TA: Record<number, string> = { 1: "பகுதி 1A", 2: "பகுதி 1B", 3: "பகுதி 2A", 4: "பகுதி 2B" };

// ---- Icons: one rounded stroke style, 24 × 24 ----

const PATHS = {
  home: "M4 10.5 12 4l8 6.5V20h-5.5v-5.5h-5V20H4z",
  map: "M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5-5.5 2.5zM9 4v13.5M15 6.5V20",
  trophy: "M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0zM7.5 6H4.5a3 3 0 0 0 3.2 3.4M16.5 6h3a3 3 0 0 1-3.2 3.4M10.5 13.5h3V17h-3zM8 20h8",
  user: "M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2zM4.5 20.5c.9-3.9 3.9-6.1 7.5-6.1s6.6 2.2 7.5 6.1",
  chat: "M4 5.5h16v10.5h-9.5L5.5 20v-4H4z M8 9.5h8M8 12.5h5",
  lock: "M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  sound: "M4 9.5h4l5-4v13l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11",
  mute: "M4 9.5h4l5-4v13l-5-4H4zM17 9.5l4 5M21 9.5l-4 5",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 5l-7 7 7 7",
  next: "M9 5l7 7-7 7",
  plus: "M12 5v14M5 12h14",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z",
  out: "M10 4H5v16h5M14 8l4 4-4 4M18 12H9",
  in: "M14 4h5v16h-5M9 8l4 4-4 4M13 12H4",
  check: "M5 12.5l4.5 4.5L19 7.5",
  play: "M8 5.5v13l10.5-6.5z",
  clock: "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2",
  cal: "M4.5 6h15v14h-15zM4.5 10.5h15M8.5 3.5v4M15.5 3.5v4",
  star: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z",
  chart: "M5 19V13M10 19V9M15 19V11M20 19V5",
  teach: "M3.5 5h17v10h-17zM8 19l4-4 4 4M7.5 9h6M7.5 11.5h4",
  pen: "M4.5 19.5l1-4.5L16 4.5l3.5 3.5L9 18.5zM14 6.5l3.5 3.5",
  camera: "M3.5 8h4l1.8-2.5h5.4L16.5 8h4v11h-17zM12 10.2a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2z",
  bell: "M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5a2 2 0 0 0 4 0",
  bulb: "M9 17.5h6M10 20.5h4M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.6.5.8 1.1.8 1.8v.3h5v-.3c0-.7.2-1.3.8-1.8A5.5 5.5 0 0 0 12 3.5z",
  zoom: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20M10.5 7.8v5.4M7.8 10.5h5.4",
  share: "M12 14.5v-11M7.5 8 12 3.5 16.5 8M5 12.5v7h14v-7",
  save: "M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14",
  cake: "M4.5 20h15v-6.5h-15zM4.5 16.2c2.5 1.3 3.5 1.3 5 0s2.5-1.3 5 0 3.5 1.3 5 0M8 13.5V10.5M12 13.5V10.5M16 13.5V10.5M8 7.5v.01M12 7v.01M16 7.5v.01",
  award: "M12 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM8.8 13.5 7.5 20.5l4.5-2.5 4.5 2.5-1.3-7",
  turn: "M5.5 11a6.5 6.5 0 1 1 1.9 4.6M5.5 5.5V11H11",
  bin: "M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13",
  // Us (7 Nov 2026): two friends side by side.
  people: "M9 11.2a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8zM2.8 19.5c.7-3.3 3.2-5.2 6.2-5.2s5.5 1.9 6.2 5.2M15.6 4.8a3.2 3.2 0 0 1 0 6.2M17.4 14.6c2 .6 3.4 2.3 3.9 4.9",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; class?: string }) {
  const n = props.size ?? 22;
  return (
    <svg
      class={`f-ic${props.class ? ` ${props.class}` : ""}`}
      viewBox="0 0 24 24"
      width={n}
      height={n}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={PATHS[props.name]} />
    </svg>
  );
}

/** Days in a row: a flame (orange when today is done, grey until then). */
export function Flame(props: { lit?: boolean; size?: number }) {
  const n = props.size ?? 18;
  return (
    <svg class={`f-flame${props.lit === false ? " out" : ""}`} viewBox="0 0 24 24" width={n} height={n} aria-hidden="true">
      <path class="f-flame-o" d="M12 2.5c.8 3.2 3.6 4.6 5 7.4 1.7 3.3.7 7.7-2.6 9.4-1.4.8-3 1.1-4.6.9C6.4 19.7 4 16.6 4.4 13.1c.2-2 1.2-3.5 2.4-4.6.2 1.6.9 2.9 2.2 3.6-.5-3.9.8-7.1 3-9.6z" />
      <path class="f-flame-i" d="M12.4 12.3c1.1 1.2 2.4 2.3 2.2 4.1-.2 1.5-1.4 2.6-2.9 2.6-1.6 0-2.8-1.3-2.7-2.9.1-1.1.8-1.9 1.6-2.4 0 .8.4 1.4 1 1.7-.2-1.2.2-2.3.8-3.1z" />
    </svg>
  );
}

/** XP: a gem. */
export function Gem(props: { size?: number }) {
  const n = props.size ?? 18;
  return (
    <svg class="f-gem" viewBox="0 0 24 24" width={n} height={n} aria-hidden="true">
      <path class="f-gem-a" d="M7 3.5h10l4.5 5.5L12 21 2.5 9z" />
      <path class="f-gem-b" d="M2.5 9h19L12 21z" />
      <path class="f-gem-c" d="M8.5 9 12 3.5 15.5 9 12 21z" />
    </svg>
  );
}

/** A coin (10 Nov 2026, the Shop): gold, what he wins, a darker edge and a highlight, like START's coin. */
export function Coin(props: { size?: number }) {
  const n = props.size ?? 18;
  return (
    <svg class="f-coin" viewBox="0 0 24 24" width={n} height={n} aria-hidden="true">
      <circle class="f-coin-e" cx="12" cy="12" r="10.5" />
      <circle class="f-coin-f" cx="12" cy="11" r="9" />
      <circle class="f-coin-r" cx="12" cy="11" r="6" />
      <path class="f-coin-h" d="M7.2 8.4a5.6 5.6 0 0 1 4-2.9" />
    </svg>
  );
}

// ---- The owl lives in owl.tsx (its moods, its marks, tap reactions); its pieces are re-exported here. ----

export { flameAtRisk, keepOwl, Owl, OwlBadge, OwlSays, useOwlTap, type Mood } from "./owl";

/** While something loads inside the app: the owl, no spinner. */
export function Waiting() {
  return (
    <div class="f-center">
      <Owl mood="think" class="mid" still />
    </div>
  );
}

// ---- Avatars: his first letter on his own colour ----

/** His own colour, from his name: one of ARISTORA's (violets, pinks, oranges, blues), never a green. */
const HUES = [250, 272, 296, 322, 345, 12, 28, 196, 214];
export function hueOf(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 9973;
  return HUES[h % HUES.length];
}

/** His face when there is a photo (pics.ts), else his first letter on his own colour. */
export function Avatar(props: { name: string; size?: "s" | "m" | "l" | "xl"; pic?: string | null }) {
  return (
    <span class={`f-ava ${props.size ?? "m"}${props.pic ? " pic" : ""}`} style={{ "--h": String(hueOf(props.name)) }} aria-hidden="true">
      {props.pic ? <img src={props.pic} alt="" decoding="async" /> : (props.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}


/** A header's title size by its longest word (a Tamil word never breaks in the middle: a long one gets a smaller
 *  size instead). Counted in characters, as Tamil letters with their marks take two or three. */
export function titleSize(text: string): string {
  const longest = Math.max(0, ...text.split(/\s+/).map((w) => [...w].length));
  return longest > 15 ? " longer" : longest > 9 ? " long" : "";
}

/** A small label: "STAGE 4" on a header (glass), a win ("PERSONAL BEST", "7 IN A ROW": gold), a note (violet). */
export function Tag(props: { children: ComponentChildren; tone?: "glass" | "gold" | "violet"; class?: string }) {
  return <span class={`f-tag ${props.tone ?? "violet"} ${props.class ?? ""}`}>{props.children}</span>;
}

/** Dashes for progress (the header's "3 of 8"). */
export function Dashes(props: { done: number; of: number }) {
  const n = Math.max(1, Math.min(props.of, 24));
  return (
    <span class="f-dashes" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <i key={i} class={i < props.done ? "on" : ""} />
      ))}
    </span>
  );
}

// ---- Toast ----

let toastSet: ((t: { text: string; bad?: boolean } | null) => void) | null = null;
let toastTimer = 0;
export function toast(text: string, bad = false) {
  toastSet?.({ text, bad });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastSet?.(null), 3200);
}
export function Toast() {
  const [t, setT] = useState<{ text: string; bad?: boolean } | null>(null);
  toastSet = setT;
  return t ? (
    <div class={`f-toast${t.bad ? " bad" : ""}`} role="status">
      {t.text}
    </div>
  ) : null;
}

// ---- A sheet from the bottom (children, feedback, settings) ----

export function Sheet(props: { title: string; sub?: string; onClose: () => void; children: ComponentChildren; class?: string }) {
  useEffect(() => {
    document.body.classList.add("f-noscroll");
    return () => document.body.classList.remove("f-noscroll");
  }, []);
  return (
    <div class="f-sheet-wrap" onClick={(e) => e.target === e.currentTarget && props.onClose()}>
      <section class={`f-sheet${props.class ? ` ${props.class}` : ""}`} role="dialog" aria-modal="true" aria-label={props.title}>
        <span class="f-grab" aria-hidden="true" />
        <div class="f-sheet-h">
          <b>{props.title}</b>
          <button type="button" class="f-x" aria-label="Close" onClick={props.onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        {props.sub && <p class="f-sheet-sub">{props.sub}</p>}
        {props.children}
      </section>
    </div>
  );
}

/**
 * A sheet opened from anywhere (Me's photo, name, birthday and days; a certificate): the app shows it (one at a time)
 * and the phone's Back closes it, as for its own sheets. `close` closes it.
 */
export type SheetRender = (close: () => void) => ComponentChildren;
let sheetHost: ((r: SheetRender) => void) | null = null;
export function setSheetHost(f: ((r: SheetRender) => void) | null) {
  sheetHost = f;
}
/** False when no app is there to show it (then the caller does without). */
export function showSheet(r: SheetRender): boolean {
  if (!sheetHost) return false;
  sheetHost(r);
  return true;
}

/** A number that rolls from one value to the next (his days in a row, yesterday's → today's). */
export function Roll(props: { from: number; to: number }) {
  if (props.from === props.to) return <span>{props.to}</span>;
  return (
    <span class="f-roll" aria-label={String(props.to)}>
      <span aria-hidden="true">
        <i>{props.from}</i>
        <i>{props.to}</i>
      </span>
    </span>
  );
}

/** A number that counts up from 0 (the reveal). */
export function useCount(to: number, ms = 900, delay = 0): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    let t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t + delay;
      const k = Math.max(0, Math.min(1, (t - t0) / ms));
      setN(Math.round(to * (1 - (1 - k) * (1 - k))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to]);
  return n;
}

// ---- Trophies: their names (game words: English), pictures, and how to win them (a sentence: Tamil). The rules:
// convex/lib/family.ts trophiesOf ----

export const TROPHY: Record<Trophy, { glyph: string; name: string; how: string }> = {
  first: { glyph: "1", name: "First Level", how: "ஒரு Level முடி" },
  streak3: { glyph: "3", name: "3-day streak", how: "3 நாள் தொடர்ந்து ஒரு Level" },
  streak7: { glyph: "7", name: "7-day streak", how: "ஒரு வாரம் முழுதும்" },
  streak30: { glyph: "30", name: "30-day streak", how: "ஒரு மாதம் முழுதும்" },
  perfect: { glyph: "✓", name: "Perfect", how: "ஒரு Level இல் எல்லா XP உம்" },
  perfect5: { glyph: "5✓", name: "5 × Perfect", how: "5 Levels இல் எல்லா XP உம்" },
  world: { glyph: "★", name: "Stage clear", how: "ஒரு Stage முழுதும் முடி" },
  xp100: { glyph: "100", name: "100 XP week", how: "ஒரு வாரத்தில் 100 XP" },
  xp300: { glyph: "300", name: "300 XP week", how: "ஒரு வாரத்தில் 300 XP" },
};

/** In the server's order (TROPHIES): the Record above lists every one. */
export const TROPHY_ORDER = Object.keys(TROPHY) as Trophy[];

/** One trophy as a medal: gold when won, pale with a lock when not yet. */
export function Medal(props: { t: Trophy; won: boolean; fresh?: boolean }) {
  const x = TROPHY[props.t];
  return (
    <div class={`f-medal${props.won ? " won" : ""}${props.fresh ? " fresh" : ""}`}>
      <span class="f-medal-c" aria-hidden="true">
        <b class={x.glyph.length > 2 ? "long" : ""}>{x.glyph}</b>
        {!props.won && (
          <i class="f-medal-lock">
            <Icon name="lock" size={11} />
          </i>
        )}
      </span>
      <b class="f-medal-n">{x.name}</b>
      <small class="f-medal-h">{x.how}</small>
    </div>
  );
}
