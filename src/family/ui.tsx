// The family app's small shared pieces: its icons (drawn here, the same on every phone), the living owl, the toast, the
// bottom sheet, the count-up, the trophies' names, and a few words.

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

// ---- Icons: one stroke style, 24 × 24 ----

const PATHS = {
  map: "M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20zM9 4v13.5M15 6.5V20",
  board: "M3 20h18M5 20v-5h4v5M10 20V9h4v11M15 20v-7h4v7M12 3l1 2 2 .3-1.5 1.4.4 2.1L12 7.8l-1.9 1 .4-2.1L9 5.3l2-.3z",
  me: "M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2zM4.5 20.5c.9-3.9 3.9-6.1 7.5-6.1s6.6 2.2 7.5 6.1",
  chat: "M4 5.5h16v10.5h-9.5L5.5 20v-4H4z M8 9.5h8M8 12.5h5",
  lock: "M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  sound: "M4 9.5h4l5-4v13l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11",
  mute: "M4 9.5h4l5-4v13l-5-4H4zM17 9.5l4 5M21 9.5l-4 5",
  close: "M6 6l12 12M18 6 6 18",
  back: "M15 5l-7 7 7 7",
  plus: "M12 5v14M5 12h14",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z",
  out: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
  play: "M8 5.5v13l10.5-6.5z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  cup: "M7.5 4h9v4.5a4.5 4.5 0 0 1-9 0zM7.5 6H4.5a3 3 0 0 0 3.2 3.4M16.5 6h3a3 3 0 0 1-3.2 3.4M10.5 13.5h3V17h-3zM8 20h8",
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
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d={PATHS[props.name]} />
    </svg>
  );
}

/** XP: a four-pointed spark, gold. */
export function Spark(props: { size?: number }) {
  const n = props.size ?? 18;
  return (
    <svg class="f-spark" viewBox="0 0 24 24" width={n} height={n} aria-hidden="true">
      <path d="M12 1.8c.9 5.2 2.9 7.3 8.6 8.6v.2c-5.7 1.3-7.7 3.4-8.6 8.6h-.2c-.9-5.2-2.9-7.3-8.6-8.6v-.2c5.7-1.3 7.7-3.4 8.6-8.6z" />
      <circle cx="19.5" cy="19.5" r="1.6" />
    </svg>
  );
}

/** A day kept: the lamp of learning (a kuthuvilakku's flame), lit or not. */
export function Lamp(props: { lit?: boolean; size?: number }) {
  const n = props.size ?? 18;
  return (
    <svg class={`f-lamp${props.lit ? " lit" : ""}`} viewBox="0 0 24 24" width={n} height={n} aria-hidden="true">
      <path class="f-flame" d="M12 2.2c2.6 2.9 3.6 5 3.6 6.9a3.6 3.6 0 0 1-7.2 0c0-1.9 1-4 3.6-6.9z" />
      <path class="f-bowl" d="M3.5 13.2h17c-.8 3.9-4.2 6.4-8.5 6.4s-7.7-2.5-8.5-6.4zM9 21.2h6" />
    </svg>
  );
}

// ---- The living owl: the splash's own drawing (public/splash.html), kept when the app starts ----

let owlSvg = "";

/** Keeps the splash's owl before it goes, so the app can show the same living owl (no extra bytes). */
export function keepOwl(): void {
  owlSvg = document.querySelector("#splash .owl")?.outerHTML ?? "";
}

export function Owl(props: { class?: string }) {
  if (!owlSvg) return <img class={`f-owl-img ${props.class ?? ""}`} src="/icon.svg" alt="" />;
  return <span class={`f-owl ${props.class ?? ""}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: owlSvg }} />;
}

/** While something loads inside the app: the owl, no spinner. */
export function Waiting() {
  return (
    <div class="f-center">
      <Owl class="mid" />
    </div>
  );
}

// ---- Avatars: his first letter on his own colour ----

export function hueOf(name: string): number {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function Avatar(props: { name: string; size?: "s" | "m" | "l" }) {
  return (
    <span class={`f-ava ${props.size ?? "m"}`} style={{ "--h": String(hueOf(props.name)) }} aria-hidden="true">
      {(props.name.trim()[0] ?? "?").toUpperCase()}
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

// ---- A sheet from the bottom (children, feedback) ----

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
export function useCount(to: number, ms = 900): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
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
  world: { glyph: "W", ta: "World வெற்றி", how: "ஒரு World முழுதும் முடி" },
  xp100: { glyph: "100", ta: "100 XP வாரம்", how: "ஒரு வாரத்தில் 100 XP" },
  xp300: { glyph: "300", ta: "300 XP வாரம்", how: "ஒரு வாரத்தில் 300 XP" },
};

/** In the server's order (TROPHIES): the Record above lists every one. */
export const TROPHY_ORDER = Object.keys(TROPHY) as Trophy[];

/** One trophy as a medal: gold when won, dark with a lock when not yet. */
export function Medal(props: { t: Trophy; won: boolean; fresh?: boolean }) {
  const x = TROPHY[props.t];
  return (
    <div class={`f-medal${props.won ? " won" : ""}${props.fresh ? " fresh" : ""}`}>
      <span class="f-medal-c" aria-hidden="true">
        <b class={x.glyph.length > 2 ? "long" : ""}>{x.glyph}</b>
        {!props.won && (
          <i class="f-medal-lock">
            <Icon name="lock" size={12} />
          </i>
        )}
      </span>
      <b class="f-medal-n">{x.ta}</b>
      <small class="f-medal-h">{x.how}</small>
    </div>
  );
}
