// The owl: the loading page's own drawing (public/splash.html), kept when the app starts, acting with its whole body
// (4 Nov 2026, his ask: "more emotions from the whole body of the bird... funny, so they never forget it").
// - A mood = marks drawn into the drawing (heart, star or spiral eyes, tears, a blush, a mouth, sunglasses, a headband,
//   a party horn, a medal, wing-tips over its beak, crossed wings...) + CSS that moves the whole owl (squash, stretch,
//   bounce, lean, shake: the <svg> itself, so the phone's graphics chip does it) and its parts (owl.css).
// - Marks drawn inside the head turn with the head (HEAD); the rest sit around it (ROUND), in the drawing's own
//   coordinates (eyes at 559,603 and 703,603; the beak's tip 629,708; the wings' shoulders 618,722 and 644,722).
// - Tap an owl: a random funny reaction for a moment; five quick taps and it gets dizzy.
// ARISTORA's own owl: inspiration from the apps he likes is for the acting, never their drawings.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { buzz, sound, type Tone } from "./sound";

let owlSvg = "";

/** Keeps the splash's owl before it goes, so the app can show the same living owl (no extra bytes). */
export function keepOwl(): void {
  owlSvg = document.querySelector("#splash .owl")?.outerHTML ?? "";
}

export type Mood =
  | "idle"
  | "happy"
  | "cheer"
  | "think"
  | "sad"
  | "sleep"
  | "wave"
  // 4 Nov 2026: the whole-body moods
  | "love"
  | "star"
  | "dizzy"
  | "cry"
  | "laugh"
  | "kiss"
  | "shock"
  | "shy"
  | "cool"
  | "champ"
  | "party"
  | "grumpy"
  | "strong"
  | "sneeze"
  | "fly";

// ---- Marks (SVG in the drawing's coordinates) ----

const at = (x: number, y: number, inner: string, cls = "") => `<g transform="translate(${x} ${y})"><g class="om ${cls}">${inner}</g></g>`;
const both = (inner: string, cls: string) => at(559, 603, inner, cls) + at(703, 603, inner, `${cls} r`);
const HEART = "M0 -18C-14 -42-48 -34-46 -6C-44 16-18 30 0 44C18 30 44 16 46 -6C48 -34 14 -42 0 -18Z";
function starD(r1: number, r2: number): string {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    d += `${i ? "L" : "M"}${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}
const STAR = starD(52, 23);
const SMILE = '<path class="om om-smile" d="M523 618Q559 562 595 618M667 618Q703 562 739 618"/>';
const SQUINT = '<path class="om om-smile" d="M528 588L592 610L528 632M734 588L670 610L734 632"/>';
const BLUSH = '<ellipse class="om om-blush" cx="486" cy="670" rx="26" ry="13"/><ellipse class="om om-blush" cx="776" cy="670" rx="26" ry="13"/>';
const MOUTH_O = at(631, 716, '<ellipse class="om-mouth" rx="17" ry="22"/><ellipse class="om-tongue" cy="10" rx="10" ry="7"/>', "om-o");
const MOUTH_D = at(631, 708, '<path class="om-mouth" d="M-38 -6Q0 -14 38 -6Q34 36 0 40Q-34 36-38 -6Z"/><path class="om-tongue" d="M-17 28Q0 12 17 28Q9 38 0 38Q-9 38-17 28Z"/>', "om-d");
const LIPS = at(631, 714, '<path class="om-lips" d="M-22 -9C-22 -22-6 -22 0 -13C6 -22 22 -22 22 -9C22 7 9 16 0 19C-9 16-22 7-22 -9Z"/>', "om-kiss");
const FROWN = at(631, 722, '<path class="om-mouth" d="M-32 16Q0 -20 32 16Q0 6-32 16Z"/>', "om-frown");
const TEAR = "M0 -16C7 -5 12 2 12 9A12 12 0 0 1-12 9C-12 2-7 -5 0 -16Z";
const tears = (x: number) => [0, 1, 2].map((i) => at(x + (i % 2 ? 22 : -22), 646, `<path class="om-tear" transform="scale(1.7)" d="${TEAR}"/>`, `om-drop d${i}`)).join("");
const SHADES =
  '<g class="om om-shades"><rect x="480" y="558" width="146" height="98" rx="36"/><rect x="636" y="558" width="146" height="98" rx="36"/><rect x="612" y="578" width="38" height="14" rx="7"/><path class="om-glint" d="M512 600L556 576M668 600L712 576"/></g>';
const BAND =
  '<g class="om om-band"><path d="M456 494Q631 452 808 488L810 522Q631 486 456 530Z"/><g transform="translate(804 506)"><path class="om om-tail" d="M0 -10Q46 -36 80 -20Q44 -12 34 8Q22 -2 0 6ZM0 4Q40 8 64 36Q30 28 12 22Z"/></g></g>';
const HORN = at(
  646,
  712,
  '<path class="om-hornc" d="M0 -7L118 -30L118 26L0 7Z"/><path class="om-horns" d="M34 -13V13M66 -19V18M98 -25V23"/><circle class="om-hornb" cx="124" cy="-2" r="13"/>',
  "om-horn",
);
const BROWS = '<path class="om om-brow" d="M500 528L604 562M762 528L658 562"/>';

// Around the owl
const spark = (x: number, y: number, s: number) => `<path class="om om-spark" d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y} ${x} ${y} ${x} ${y + s} ${x} ${y} ${x - s} ${y} ${x} ${y} ${x} ${y - s}Z"/>`;
const SPARKS = spark(372, 468, 46) + spark(888, 410, 38) + spark(452, 292, 28) + spark(830, 262, 24);
const floatHeart = (x: number, y: number, s: number, i: number) => at(x, y, `<path class="om-heart" transform="scale(${s})" d="${HEART}"/>`, `om-float f${i}`);
const MEDAL = at(
  631,
  712,
  `<path class="om-ribbon" d="M-37 0L0 78L37 0L19 0L0 40L-19 0Z"/><circle class="om-disc" cy="102" r="36"/><path class="om-discs" transform="translate(0 102) scale(.42)" d="${STAR}"/>`,
  "om-medal",
);
const HANDS =
  '<g class="om om-hands"><path class="om-hand" d="M556 748Q546 676 598 658Q638 650 642 692Q642 738 598 754Z"/><path class="om-hand r" d="M706 748Q716 676 664 658Q624 650 620 692Q620 738 664 754Z"/></g>';
const ARMS =
  '<g class="om om-arms"><path class="om-hand" d="M538 762Q631 716 726 772Q732 792 712 798Q631 758 550 794Q530 784 538 762Z"/><path class="om-hand r" d="M724 762Q631 716 536 772Q530 792 550 798Q631 758 712 794Q732 784 724 762Z"/></g>';
const STEAM = [0, 1, 2].map((i) => at(812 + i * 26, 410 - i * 18, '<circle class="om-puff" r="16"/>', `om-steam s${i}`)).join("");
// Three stars going round above its head: a circle seen from the side (the ring squashed, the stars with it).
const ORBIT = `<g transform="translate(631 262) scale(1 .45)"><g class="om om-orbit">${[0, 120, 240]
  .map((a) => {
    const r = (a * Math.PI) / 180;
    return `<path class="om-ostar" transform="translate(${(170 * Math.cos(r)).toFixed(0)} ${(170 * Math.sin(r)).toFixed(0)}) scale(.75)" d="${STAR}"/>`;
  })
  .join("")}</g></g>`;
const BANG = '<text class="om om-bang" x="842" y="452">!</text>';
const CONFETTI = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => at(631, 470, `<rect class="om-conf c${i % 4}" x="-8" y="-12" width="16" height="24" rx="4"/>`, `om-burst b${i}`)).join("");
const FEATHERS = [0, 1, 2].map((i) => at(631, 560, '<path class="om-feather" d="M0 -34Q22 -8 0 34Q-22 -8 0 -34Z"/>', `om-fth t${i}`)).join("");
const SWEAT = at(818, 520, `<path class="om-tear" transform="scale(1.1)" d="${TEAR}"/>`, "om-sweat");

const HEAD: Record<Mood, string> = {
  idle: "",
  happy: SMILE,
  cheer: SMILE,
  think: '<path class="om om-brow" d="M666 521Q705 491 750 519"/>',
  sad: '<path class="om om-brow" d="M500 552L598 530M762 552L664 530"/>',
  sleep: "",
  wave: "",
  love: both(`<path class="om-heart" d="${HEART}"/><ellipse class="om-hl" cx="-20" cy="-14" rx="9" ry="6"/>`, "om-eyeh") + BLUSH,
  star: both(`<path class="om-star" d="${STAR}"/>`, "om-eyes") + MOUTH_O,
  dizzy: both('<path class="om-spiral" d="M-6 0a6 6 0 1 1 12 0a12 12 0 1 1-24 0a18 18 0 1 1 36 0a24 24 0 1 1-48 0a30 30 0 1 1 60 0"/>', "om-spin") + FROWN,
  cry: tears(559) + tears(703) + FROWN,
  laugh: SQUINT + MOUTH_D,
  kiss: SMILE + LIPS + BLUSH,
  shock: MOUTH_O,
  shy: BLUSH,
  cool: SHADES + '<path class="om om-smirk" d="M606 716Q634 732 660 712"/>',
  champ: SMILE,
  party: SMILE + HORN + BLUSH,
  grumpy: BROWS + FROWN,
  strong: BAND + BROWS,
  sneeze: MOUTH_O,
  fly: SMILE,
};
const ROUND: Record<Mood, string> = {
  idle: "",
  happy: "",
  cheer: SPARKS,
  think: '<text class="om om-q" x="812" y="352">?</text>',
  sad: "",
  sleep: '<text class="om om-z" x="772" y="438">z</text><text class="om om-z z2" x="842" y="356">z</text>',
  wave: "",
  love: floatHeart(410, 520, 0.42, 0) + floatHeart(850, 470, 0.34, 1) + floatHeart(800, 300, 0.26, 2),
  star: SPARKS,
  dizzy: ORBIT,
  cry: "",
  laugh: "",
  kiss: floatHeart(700, 690, 0.36, 3),
  shock: BANG,
  shy: HANDS,
  cool: "",
  champ: MEDAL + SPARKS,
  party: CONFETTI,
  grumpy: ARMS + STEAM,
  strong: SWEAT,
  sneeze: FEATHERS,
  fly: "",
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

// ---- Tap: a random funny reaction ----

const REACT: Mood[] = ["laugh", "shy", "kiss", "love", "shock", "cool", "star", "party", "sneeze"];
const REACT_SOUND: Partial<Record<Mood, Tone>> = { laugh: "giggle", shock: "boing", sneeze: "achoo", kiss: "kiss", love: "kiss", party: "toot", dizzy: "dizzy" };
let lastReact: Mood | null = null;
let taps: number[] = [];

/** A moment's mood, and a tap that swaps it for a reaction (2.6 s). Five taps within 2 s: dizzy. */
export function useOwlTap(base: Mood): [Mood, () => void] {
  const [react, setReact] = useState<Mood | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const tap = () => {
    const now = Date.now();
    taps = [...taps.filter((t) => now - t < 2000), now];
    let next: Mood;
    if (taps.length >= 5) {
      next = "dizzy";
      taps = [];
    } else {
      do next = REACT[Math.floor(Math.random() * REACT.length)];
      while (next === lastReact);
    }
    lastReact = next;
    buzz(12);
    sound(REACT_SOUND[next] ?? "giggle");
    setReact(next);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setReact(null), next === "dizzy" ? 3200 : 2600);
  };
  return [react ?? base, tap];
}

// ---- The owl ----

/** The owl. `still`: only its mood moves (small owls; a few living owls at once is what a cheap phone can afford). */
export function Owl(props: { mood?: Mood; class?: string; still?: boolean }) {
  const [id] = useState(() => ++owlSeq);
  const cls = `${props.class ?? ""}${props.still ? " still" : ""}`;
  if (!owlSvg) return <img class={`f-owl-img ${cls}`} src="/icon.svg" alt="" />;
  return <span class={`f-owl ${cls}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: owlFor(props.mood ?? "idle", id) }} />;
}

/** The owl on a soft glow (a header's picture, a moment): white on violet, light violet on white. Tap it. */
export function OwlBadge(props: { mood?: Mood; class?: string }) {
  const [mood, tap] = useOwlTap(props.mood ?? "idle");
  return (
    <span
      class={`f-owlbadge tap ${props.class ?? ""}`}
      role="button"
      aria-label="The owl"
      onClick={(e) => {
        e.stopPropagation();
        tap();
      }}
    >
      <Owl mood={mood} key={mood} />
    </span>
  );
}

/** The owl saying something (a speech bubble beside it). Tap it too. */
export function OwlSays(props: { mood?: Mood; children: ComponentChildren; class?: string }) {
  const [mood, tap] = useOwlTap(props.mood ?? "happy");
  return (
    <div class={`f-owlsays ${props.class ?? ""}`}>
      <span class="tap" role="button" aria-label="The owl" onClick={tap}>
        <Owl mood={mood} class="say" still key={mood} />
      </span>
      <p class="f-bubble">{props.children}</p>
    </div>
  );
}

/** Late in the day (6 PM in Sri Lanka) with a flame to keep and no Level yet: the owl gets grumpy. */
export function flameAtRisk(streak: { days: number; today: boolean } | undefined, now = Date.now()): boolean {
  const h = new Date(now + 330 * 60_000).getUTCHours();
  return !!streak && !streak.today && streak.days > 0 && h >= 18;
}
