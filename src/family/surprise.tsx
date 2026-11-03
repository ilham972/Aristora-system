// The owl's surprise visits (4 Nov 2026, his ask: "the bird comes in an unpredictable way and does unpredictable,
// funny stuff... like pooping"). It peeks in from the side, naps on the bottom bar, sneezes its cap off, flies across,
// or flies over and drops a white splat on the screen (tap it: it wipes off).
// - Only on the main tabs (Home, Learn, Race, Me): never in a Level or the reveal (a gag while he types an answer
//   from his paper costs a wrong answer), never over an open sheet.
// - The first after 25–45 s, then every 1.5–3 minutes, at most 4 a visit.
// - Off with Me → Owl surprises (a parent who doesn't like the joke), for "reduce motion", and in tests.

import { useEffect, useRef, useState } from "preact/hooks";
import { Owl, type Mood } from "./owl";
import { buzz, sound, type Tone } from "./sound";

type Gag = "peek" | "nap" | "fly" | "sneeze" | "poop";
/** How often each comes (out of 11): the splat is the rare one. */
const GAGS: [Gag, number][] = [
  ["peek", 3],
  ["nap", 2],
  ["fly", 2],
  ["sneeze", 2],
  ["poop", 2],
];
const LONG: Record<Gag, number> = { peek: 4200, nap: 7000, fly: 3600, sneeze: 4400, poop: 3600 };
const MOOD: Record<Gag, Mood> = { peek: "shy", nap: "sleep", fly: "fly", sneeze: "sneeze", poop: "fly" };
const FIRST: Record<Gag, [Tone, number]> = { peek: ["tweet", 500], nap: ["tweet", 300], fly: ["whoosh", 200], sneeze: ["achoo", 1500], poop: ["whoosh", 200] };
const MAX = 4;
const KEY = "aristora.family.surprises";
let shown = 0;

/** The phone-wide switch (like the sound): on unless turned off on Me. */
export function surprisesOn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}
export function setSurprisesOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
}

const quiet = () =>
  (typeof navigator !== "undefined" && navigator.webdriver === true) ||
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

function pick(): Gag {
  let r = Math.random() * GAGS.reduce((s, [, w]) => s + w, 0);
  for (const [g, w] of GAGS) if ((r -= w) < 0) return g;
  return "peek";
}

/** A bird's dropping on the glass: white, a dark speck, a soft shadow. */
const SPLAT = (
  <svg viewBox="0 0 100 84" aria-hidden="true">
    <path
      class="sp-w"
      d="M52 10c7-1 9 9 15 11 7 2 15-6 20 0 4 6-4 11 0 17 5 6 14 5 12 13-2 7-12 3-16 8-3 5 3 13-5 16-8 3-10-6-17-4-8 2-8 11-16 7-7-4 0-11-6-15-6-4-16 3-19-5-3-7 7-10 4-17-3-6-13-8-8-15 5-6 14 1 18-4 4-6-2-15 6-17 3-1 5 2 8 1z"
    />
    <ellipse class="sp-d" cx="55" cy="42" rx="10" ry="8" />
    <circle class="sp-d" cx="42" cy="33" r="4" />
  </svg>
);

export function Surprises(props: { active: boolean }) {
  const [g, setG] = useState<{ gag: Gag; n: number; y: number } | null>(null);
  const [mood, setMood] = useState<Mood | null>(null);
  const [splat, setSplat] = useState<{ n: number; x: number; y: number; fall: number; wipe: boolean } | null>(null);
  const timers = useRef<number[]>([]);
  const later = (ms: number, f: () => void) => timers.current.push(window.setTimeout(f, ms));

  useEffect(() => {
    if (!props.active || quiet() || !surprisesOn()) return;
    const fire = () => {
      if (shown >= MAX) return;
      if (document.hidden || document.body.classList.contains("f-noscroll")) {
        later(15_000, fire);
        return;
      }
      shown++;
      const gag = pick();
      const y = 14 + Math.random() * 40;
      setMood(null);
      setG({ gag, n: Date.now(), y });
      const [tone, at] = FIRST[gag];
      later(at, () => sound(tone));
      later(LONG[gag], () => setG(null));
      if (gag === "poop") {
        // It drops when the owl is a little past the middle; it lands somewhere below, on the glass.
        const w = window.innerWidth;
        const x = Math.min(w - 50, Math.max(50, ((1500 / 3600) * (w + 160) - 130 + 48) | 0));
        const top = (y / 100) * window.innerHeight + 90;
        const land = window.innerHeight * (0.42 + Math.random() * 0.22);
        later(1500, () => {
          setSplat({ n: Date.now(), x, y: land, fall: Math.max(60, land - top), wipe: false });
          later(450, () => {
            sound("splat");
            buzz(25);
          });
          later(9200, () => setSplat(null));
        });
      }
      later(90_000 + Math.random() * 90_000, fire);
    };
    later(shown ? 60_000 + Math.random() * 60_000 : 25_000 + Math.random() * 20_000, fire);
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
      setG(null);
      setSplat(null);
    };
  }, [props.active]);

  const tapOwl = () => {
    if (!g) return;
    const startled = g.gag === "nap" ? "shock" : "laugh";
    setMood(startled);
    sound(startled === "shock" ? "boing" : "giggle");
    buzz(12);
  };
  const wipe = () => {
    if (!splat || splat.wipe) return;
    sound("squeak");
    buzz(8);
    setSplat({ ...splat, wipe: true });
    later(460, () => setSplat(null));
  };

  return (
    <>
      {g && (
        <div class={`f-gag g-${g.gag}`} key={g.n} style={{ "--y": `${g.y}vh` }}>
          <span class="f-gag-owl tap" role="button" aria-label="The owl" onClick={tapOwl}>
            <Owl mood={mood ?? MOOD[g.gag]} key={mood ?? g.gag} />
          </span>
        </div>
      )}
      {splat && (
        <button
          type="button"
          class={`f-splat${splat.wipe ? " wipe" : ""}`}
          key={splat.n}
          style={{ left: `${splat.x}px`, top: `${splat.y}px`, "--fall": `${splat.fall}px` }}
          aria-label="Wipe it off"
          onClick={wipe}
        >
          {SPLAT}
        </button>
      )}
    </>
  );
}
