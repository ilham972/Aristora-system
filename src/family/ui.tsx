// The family app's small shared pieces: its icons (drawn here, the same on every phone), the owl and its moods, the
// flame (days in a row) and the gem (XP), the sparkles and the yellow burst, the toast, the bottom sheet, the count-up,
// the trophies' names, and a few words.

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { Trophy } from "../../convex/lib/family";
import { NetError } from "./net";

/** The centre's name, in one place (the app may serve other centres one day; not now). */
export const BRAND = "ARISTORA";

export const firstName = (name: string) => name.split(" ")[0];

/** "2n-1" → "2n − 1" for the eye; the typed text stays plain. */
export const pretty = (s: string) =>
  s
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/\*/g, "×")
    .replace(/-/g, "−");

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

/** A small four-pointed sparkle (decoration). */
export function Sparkle(props: { class?: string; size?: number }) {
  const n = props.size ?? 14;
  return (
    <svg class={`f-sparkle ${props.class ?? ""}`} viewBox="0 0 24 24" width={n} height={n} aria-hidden="true">
      <path d="M12 1.5Q12.9 11.1 22.5 12 12.9 12.9 12 22.5 11.1 12.9 1.5 12 11.1 11.1 12 1.5z" />
    </svg>
  );
}

/** The yellow sun-burst behind the owl in a header (slowly turning). */
export function Burst(props: { class?: string }) {
  const pts: string[] = [];
  for (let i = 0; i < 28; i++) {
    const r = i % 2 ? 37 : 50;
    const a = (Math.PI * i) / 14;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return (
    <svg class={`f-burst ${props.class ?? ""}`} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={pts.join(" ")} />
    </svg>
  );
}

// ---- The owl: the loading page's own drawing (public/splash.html), kept when the app starts, in our light purple,
// with moods. Mood marks drawn inside the head turn with it; the rest sit around it. ----

let owlSvg = "";

/** Keeps the splash's owl before it goes, so the app can show the same living owl (no extra bytes). */
export function keepOwl(): void {
  owlSvg = document.querySelector("#splash .owl")?.outerHTML ?? "";
}

export type Mood = "idle" | "happy" | "cheer" | "think" | "sad" | "sleep" | "wave";

const SMILE = '<path class="om om-smile" d="M523 618Q559 562 595 618M667 618Q703 562 739 618"/>';
const HEAD: Record<Mood, string> = {
  idle: "",
  happy: SMILE,
  cheer: SMILE,
  think: '<path class="om om-brow" d="M666 521Q705 491 750 519"/>',
  sad: '<path class="om om-brow" d="M500 552L598 530M762 552L664 530"/>',
  sleep: "",
  wave: "",
};
const star = (x: number, y: number, s: number) => `<path class="om om-spark" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y} ${x} ${y} ${x} ${y + s} ${x} ${y} ${x - s} ${y} ${x} ${y} ${x} ${y - s}Z"/>`;
const ROUND: Record<Mood, string> = {
  idle: "",
  happy: "",
  cheer: star(372, 468, 46) + star(888, 410, 38) + star(452, 292, 28) + star(830, 262, 24),
  think: '<text class="om om-q" x="812" y="352">?</text>',
  sad: "",
  sleep: '<text class="om om-z" x="772" y="438">z</text><text class="om om-z z2" x="842" y="356">z</text>',
  wave: "",
};

/** Each owl on screen gets its own eye-socket ids (two owls must never point at each other's). */
let owlSeq = 0;

function owlFor(mood: Mood, id: number): string {
  return owlSvg
    .replace(/owl-sock-([lr])/g, `owl-sock-$1-${id}`)
    .replace('class="owl"', `class="owl mood-${mood}"`)
    .replace('<g class="owl-cap">', `${HEAD[mood]}<g class="owl-cap">`)
    .replace(/<\/svg>\s*$/, `${ROUND[mood]}</svg>`);
}

export function Owl(props: { mood?: Mood; class?: string }) {
  const [id] = useState(() => ++owlSeq);
  if (!owlSvg) return <img class={`f-owl-img ${props.class ?? ""}`} src="/icon.svg" alt="" />;
  return <span class={`f-owl ${props.class ?? ""}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: owlFor(props.mood ?? "idle", id) }} />;
}

/** The owl on its yellow burst (a header's illustration). */
export function OwlBadge(props: { mood?: Mood; class?: string }) {
  return (
    <span class={`f-owlbadge ${props.class ?? ""}`}>
      <Burst />
      <Owl mood={props.mood} />
    </span>
  );
}

/** The owl saying something (a speech bubble beside it). */
export function OwlSays(props: { mood?: Mood; children: ComponentChildren; class?: string }) {
  return (
    <div class={`f-owlsays ${props.class ?? ""}`}>
      <Owl mood={props.mood ?? "happy"} class="say" />
      <p class="f-bubble">{props.children}</p>
    </div>
  );
}

/** While something loads inside the app: the owl, no spinner. */
export function Waiting() {
  return (
    <div class="f-center">
      <Owl mood="think" class="mid" />
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

export function Avatar(props: { name: string; size?: "s" | "m" | "l" }) {
  return (
    <span class={`f-ava ${props.size ?? "m"}`} style={{ "--h": String(hueOf(props.name)) }} aria-hidden="true">
      {(props.name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** A small slanted label ("STAGE 4", "PERSONAL BEST"). */
export function Tag(props: { children: ComponentChildren; tone?: "pink" | "yellow" | "white"; class?: string }) {
  return <span class={`f-tag ${props.tone ?? "pink"} ${props.class ?? ""}`}>{props.children}</span>;
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

// ---- Trophies: their names, pictures and how to win them (the rules: convex/lib/family.ts trophiesOf) ----

export const TROPHY: Record<Trophy, { glyph: string; ta: string; how: string }> = {
  first: { glyph: "1", ta: "முதல் Level", how: "ஒரு Level முடி" },
  streak3: { glyph: "3", ta: "3 நாள் தொடர்", how: "3 நாள் தொடர்ந்து ஒரு Level" },
  streak7: { glyph: "7", ta: "7 நாள் தொடர்", how: "ஒரு வாரம் முழுதும்" },
  streak30: { glyph: "30", ta: "30 நாள் தொடர்", how: "ஒரு மாதம் முழுதும்" },
  perfect: { glyph: "✓", ta: "எல்லாம் சரி", how: "ஒரு Level இல் எல்லா XP உம்" },
  perfect5: { glyph: "5✓", ta: "5 முறை எல்லாம் சரி", how: "5 Levels இல் எல்லா XP உம்" },
  world: { glyph: "★", ta: "Stage வெற்றி", how: "ஒரு Stage முழுதும் முடி" },
  xp100: { glyph: "100", ta: "100 XP வாரம்", how: "ஒரு வாரத்தில் 100 XP" },
  xp300: { glyph: "300", ta: "300 XP வாரம்", how: "ஒரு வாரத்தில் 300 XP" },
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
      <b class="f-medal-n">{x.ta}</b>
      <small class="f-medal-h">{x.how}</small>
    </div>
  );
}
