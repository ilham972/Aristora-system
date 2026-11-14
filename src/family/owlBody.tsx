// The owl with a body (14 Nov 2026, his ask: "the body movement changes like a real bird ... in our app that's a little
// bit movement in the bird's body"). Why it moved little: the owl was the logo, a head and two wings, with no belly,
// arms or feet to act with. Here the logo's own head and cap, exactly as they are (the loading page's drawing, kept by
// owl.tsx: no extra bytes, its blink and its tassel still alive), stand on a body of ARISTORA's own: a belly, two
// wing-arms that point and hold, feet, a tail. A pose = where each part is (numbers), drawn as one SVG; the level's
// style (levelStyle.ts) moves the parts: it gets ready before it jumps, squashes when it lands.
// - Coordinates are the logo's (eyes 559,603 and 703,603; the beak's tip 629,708). Shoulders 512,772 and 750,772; it
//   stands on 631,965.
// - Colours come from the palette by class (.ob-*), so Dark turns it with everything else.
// - It comes with the level screen (play.tsx), never in the first load.
// ARISTORA's own owl: inspiration from the apps he likes is for the acting, never their drawings.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { Owl } from "./owl";

let kept = "";

/**
 * The owl's own drawing as owl.tsx keeps it ("" when the phone has none yet: then the small picture shows instead).
 * Read from an owl drawn off screen, so the first load carries nothing for this file. Never called while a screen is
 * being drawn (a drawing inside a drawing breaks the first one): as this file loads, and again from an effect.
 */
function readOwl(): string {
  if (kept || typeof document === "undefined") return kept;
  const el = document.createElement("div");
  render(<Owl still />, el);
  kept = el.querySelector("svg.owl")?.outerHTML ?? "";
  render(null, el);
  return kept;
}
readOwl();

export type Pose = "ready" | "hello" | "write" | "think" | "yes" | "combo" | "oops" | "again" | "champ" | "sleep" | "teach";

type Wing = { a: number; s?: [number, number]; front?: boolean };
type Spec = {
  lean?: number;
  lift?: number;
  squash?: [number, number];
  head?: { rot?: number; dy?: number };
  /** Where it looks (the pupils, from the eyes' middle), how far its lids are down. */
  look?: [number, number];
  lid?: number;
  eyes?: "happy" | "closed" | "star";
  mouth?: "open" | "sad";
  blush?: boolean;
  feet?: "air" | "tap";
  wl?: Wing;
  wr?: Wing;
  /** Drawn on its head (turns with it), in its hands (leans with it), behind it, around it. */
  onHead?: string;
  extra?: string;
  back?: string;
  top?: string;
  vb?: string;
};

const SH = { l: [512, 772], r: [750, 772] } as const;
const WING = "M-30 -16C-56 34-54 112-22 166Q-13 180-4 165Q4 182 14 166Q23 180 31 160C54 108 56 34 30-16C16-32-16-32-30-16Z";
const EYES = [
  [559, 603],
  [703, 603],
] as const;

/** Where a wing's tip is. */
function tip(side: "l" | "r", a: number, sy = 1): [number, number] {
  const r = (a * Math.PI) / 180;
  return [SH[side][0] - Math.sin(r) * 160 * sy, SH[side][1] + Math.cos(r) * 160 * sy];
}
const wing = (side: "l" | "r", w: Wing) =>
  `<g transform="translate(${SH[side][0]} ${SH[side][1]}) rotate(${w.a}) scale(${(w.s ?? [1, 1]).join(" ")})"><g class="ob-wing ob-w${side}"><path class="ob-w" d="${WING}"/><path class="ob-wf" d="M-6 60Q0 120-4 150M12 66Q16 116 14 146"/></g></g>`;
const TOES = (c: string, dy: number) => `<ellipse class="${c}" cx="-17" cy="${dy}" rx="13" ry="10"/><ellipse class="${c}" cx="17" cy="${dy}" rx="13" ry="10"/><ellipse class="${c}" cx="0" cy="${dy + 3}" rx="14" ry="11"/>`;
const foot = (x: number, y: number, rot = 0) => `<g transform="translate(${x} ${y}) rotate(${rot}) scale(1.25)">${TOES("ob-g3", 2)}${TOES("ob-g", -1)}<ellipse class="ob-g" cx="0" cy="-8" rx="26" ry="10"/></g>`;
const star = (r1: number, r2: number) => {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / 5 - Math.PI / 2;
    d += `${i ? "L" : "M"}${(r * Math.cos(a)).toFixed(1)} ${(r * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
};
const spark = (x: number, y: number, s = 1) => `<path class="ob-g ob-spark" transform="translate(${x} ${y}) scale(${s})" d="M0 -22Q3 -3 22 0Q3 3 0 22Q-3 3-22 0Q-3 -3 0 -22Z"/>`;
const word = (x: number, y: number, size: number, t: string, op = 1) => `<text class="ob-t" x="${x}" y="${y}" font-size="${size}" opacity="${op}">${t}</text>`;

function eyes(kind: Spec["eyes"]): string {
  if (!kind) return "";
  const inner =
    kind === "happy"
      ? '<path class="ob-eye" d="M-25 8Q0 -28 25 8"/>'
      : kind === "closed"
        ? '<path class="ob-eye" d="M-25 -4Q0 20 25 -4"/>'
        : `<path class="ob-g" d="${star(33, 14)}"/><circle class="ob-k" cx="-8" cy="-9" r="5"/>`;
  return EYES.map(([x, y]) => `<g transform="translate(${x} ${y})"><circle class="ob-f" r="38"/>${inner}</g>`).join("");
}

let seq = 0;

/** The logo's head, looking and feeling as the pose says. */
function head(markup: string, p: Spec): string {
  const id = ++seq;
  const i = markup.indexOf('<g transform="translate(631 690)">');
  if (i < 0) return "";
  let h = markup.slice(i, markup.lastIndexOf("</svg>")).replace(/owl-sock-([lr])(-\d+)?/g, `owl-sock-$1-b${id}`);
  const look = p.look;
  if (look) {
    h = h
      .replace('cx="574.3" cy="585.3" r="17.9"', `cx="${559.3 + look[0]}" cy="${602.7 + look[1]}" r="21"`)
      .replace('cx="687.9" cy="585.1" r="18.1"', `cx="${702.9 + look[0]}" cy="${602.6 + look[1]}" r="21"`);
  }
  if (p.lid) h = h.replace('cy="446.4"', `cy="${446.4 + p.lid}"`).replace('cy="443.3"', `cy="${443.3 + p.lid}"`);
  let over = eyes(p.eyes);
  if (look && !p.eyes && !(p.lid && p.lid > 18)) over += EYES.map(([x, y]) => `<circle class="ob-k" cx="${x + look[0] - 7}" cy="${y + look[1] - 8}" r="6.5"/>`).join("");
  if (p.blush) over += '<ellipse class="ob-blush" cx="506" cy="676" rx="21" ry="11"/><ellipse class="ob-blush" cx="756" cy="676" rx="21" ry="11"/>';
  if (p.mouth === "open") over += '<path class="ob-f" d="M607 700Q630 742 653 700Z"/><path class="ob-p" d="M618 716Q630 730 642 716Q630 708 618 716Z"/>';
  if (p.mouth === "sad") over += '<path class="ob-line" d="M612 722Q630 708 648 722"/>';
  over += p.onHead ?? "";
  const cut = h.lastIndexOf("</g></g></g>");
  if (cut > 0) h = h.slice(0, cut) + over + h.slice(cut);
  return `<g transform="translate(0 ${p.head?.dy ?? 0}) rotate(${p.head?.rot ?? 0} 631 700)">${h}</g>`;
}

const TORSO =
  '<path class="ob-b" d="M631 655C735 655 792 760 786 850C781 925 715 957 631 957C547 957 481 925 476 850C470 760 527 655 631 655Z"/>' +
  '<path class="ob-l" d="M631 768C698 768 728 818 724 866C720 916 680 940 631 940C582 940 542 916 538 866C534 818 564 768 631 768Z"/>' +
  '<path class="ob-chest" d="M588 826Q602 844 616 826M646 826Q660 844 674 826M617 868Q631 886 645 868"/><ellipse class="ob-chin" cx="631" cy="716" rx="118" ry="24"/>';
const TAIL = '<g transform="translate(486 912)"><path class="ob-w2" d="M0 0C-46 -8-78 14-88 50C-52 52-16 40 0 0Z"/><path class="ob-w" d="M0 0C-34 8-56 34-56 68C-26 58-4 34 0 0Z"/></g>';
const PENCIL =
  '<rect class="ob-g" x="-9" y="-70" width="18" height="96" rx="3"/><rect class="ob-p" x="-9" y="-86" width="18" height="18" rx="5"/><rect class="ob-k" x="-9" y="-72" width="18" height="6"/><path class="ob-wood" d="M-9 26L0 50L9 26Z"/><path class="ob-f" d="M-3.4 41L0 50L3.4 41Z"/>';
const TROPHY =
  '<path class="ob-g" d="M-44 -50H44V-20C44 12 24 34 0 34C-24 34-44 12-44 -20Z"/><path class="ob-cup" d="M-44 -40H-66C-66 -6-52 6-36 6M44 -40H66C66 -6 52 6 36 6"/><path class="ob-g3" d="M-8 32h16v20h22v16h-60v-16h22z"/>';
const BAND = '<path class="ob-r" d="M452 470Q631 520 812 466L816 496Q631 552 450 502Z"/><path class="ob-r" d="M812 470Q850 452 884 470Q856 486 814 492ZM814 486Q856 500 874 532Q838 528 812 500Z"/>';

const POSES: Record<Pose, () => Spec> = {
  ready: () => ({ look: [4, 2], wl: { a: 10 }, wr: { a: -10 } }),
  hello: () => ({ look: [5, 0], head: { rot: 5 }, eyes: "happy", wl: { a: 10 }, wr: { a: -142, s: [1, 1.05] }, top: spark(900, 520, 0.8) + spark(940, 600, 0.5) }),
  // Watching his paper: a pencil in its wing, the page beside it.
  write: () => {
    const t = tip("r", -38, 0.86);
    return {
      lean: 7,
      look: [8, 15],
      lid: 22,
      head: { rot: 7, dy: 6 },
      wl: { a: 16 },
      wr: { a: -38, s: [1, 0.86], front: true },
      extra: `<g transform="translate(${t[0] + 6} ${t[1] + 6}) rotate(24) scale(1.1)"><g class="ob-pencil">${PENCIL}</g></g>`,
      back: '<g transform="translate(866 915) rotate(-4)"><rect class="ob-page" x="-80" y="-52" width="160" height="104" rx="10"/><path class="ob-rule" d="M-56 -22H40M-56 2H56M-56 26H16"/></g>',
    };
  },
  think: () => ({ lean: -3, look: [-10, -13], head: { rot: -7 }, wl: { a: 14 }, wr: { a: 114, s: [0.82, 0.72], front: true }, top: word(812, 430, 98, "?") + word(880, 360, 55, "?", 0.7) }),
  yes: () => ({
    lift: 56,
    squash: [0.96, 1.05],
    eyes: "happy",
    mouth: "open",
    blush: true,
    feet: "air",
    head: { rot: -3, dy: -4 },
    wl: { a: 146, s: [1, 1.16] },
    wr: { a: -146, s: [1, 1.16] },
    top: spark(330, 470) + spark(940, 440, 1.15) + spark(300, 660, 0.55) + spark(968, 640, 0.6) + spark(400, 330, 0.5),
  }),
  combo: () => ({ lean: -4, eyes: "star", mouth: "open", blush: true, head: { rot: -5 }, wl: { a: 24 }, wr: { a: -150, s: [1, 1.02] }, feet: "tap", top: spark(900, 470, 1.1) + spark(310, 520, 0.8) + spark(950, 600, 0.55) }),
  oops: () => ({ lean: 3, look: [2, 10], head: { rot: 9, dy: 4 }, mouth: "sad", wl: { a: 152, s: [0.9, 0.52], front: true }, wr: { a: -14 }, top: '<path class="ob-u" transform="translate(870 520) scale(1.2)" d="M0 -20C10 -4 14 4 14 10A14 14 0 0 1-14 10C-14 4-10 -4 0 -20Z"/>' }),
  // The headband: this one comes back, and it will win it then.
  again: () => {
    const t = tip("r", -112);
    return {
      look: [6, -2],
      head: { rot: 4 },
      mouth: "open",
      onHead: BAND,
      wl: { a: 34, s: [1, 0.8] },
      wr: { a: -112 },
      extra: `<g transform="translate(${t[0] + 30} ${t[1] - 30})"><circle class="ob-sign" r="62"/><path class="ob-turn" d="M-26 6A28 28 0 1 1-4 34"/><path class="ob-v" d="M-44 -10L-26 12L-6 -8Z"/></g>`,
    };
  },
  champ: () => {
    const t = tip("r", -138, 1.12);
    return {
      lift: 14,
      eyes: "happy",
      mouth: "open",
      blush: true,
      feet: "air",
      head: { rot: -5 },
      wl: { a: 132, s: [1, 1.05] },
      wr: { a: -138, s: [1, 1.12] },
      extra: `<g transform="translate(${t[0] + 22} ${t[1] - 62}) scale(1.15)">${TROPHY}</g>`,
      top: spark(330, 430, 0.9) + spark(990, 420, 0.8) + spark(300, 620, 0.5),
      vb: "250 230 800 760",
    };
  },
  sleep: () => ({ lean: 5, squash: [1.06, 0.93], eyes: "closed", head: { rot: 12, dy: 14 }, wl: { a: 6 }, wr: { a: -6 }, top: `<g class="ob-zzz">${word(820, 470, 54, "z")}${word(854, 430, 70, "z", 0.8)}${word(898, 380, 88, "Z", 0.6)}</g>` }),
  teach: () => {
    const t = tip("r", -104, 0.9);
    return { look: [12, 2], head: { rot: 5 }, mouth: "open", wl: { a: 30, s: [1, 0.8] }, wr: { a: -104, s: [1, 0.9] }, extra: `<path class="ob-stick" d="M${t[0] - 10} ${t[1] + 6}L${t[0] + 60} ${t[1] - 90}"/>`, top: spark(930, 560, 0.7) };
  },
};

function draw(markup: string, pose: Pose): string {
  const p = POSES[pose]();
  const wl = p.wl ?? { a: 9 };
  const wr = p.wr ?? { a: -9 };
  const FY = 965;
  const feet =
    p.feet === "air" ? foot(590, FY - 2, -24) + foot(672, FY - 2, 24) : p.feet === "tap" ? foot(583, FY) + `<g class="ob-tap">${foot(686, FY - 10, -26)}</g>` : foot(583, FY) + foot(679, FY);
  const sq = p.squash ?? [1, 1];
  const shadow = `<ellipse class="ob-shadow" cx="631" cy="979" rx="${p.lift ? 110 : 160}" ry="${p.lift ? 10 : 15}"/>`;
  // .ob-hop moves it up and down, .ob-sq squashes it from its feet: the level's style animates both.
  const body =
    `<g class="ob-hop"><g transform="translate(631 ${FY})"><g class="ob-sq"><g transform="translate(0 ${-(p.lift ?? 0)}) rotate(${p.lean ?? 0}) scale(${sq.join(" ")}) translate(-631 ${-FY})">` +
    TAIL +
    TORSO +
    feet +
    (wl.front ? "" : wing("l", wl)) +
    (wr.front ? "" : wing("r", wr)) +
    head(markup, p) +
    (wl.front ? wing("l", wl) : "") +
    (wr.front ? wing("r", wr) : "") +
    (p.extra ?? "") +
    "</g></g></g></g>";
  return `<svg class="owl ob" viewBox="${p.vb ?? "250 230 760 760"}" xmlns="http://www.w3.org/2000/svg">${shadow}${p.back ?? ""}${body}<g class="ob-top">${p.top ?? ""}</g></svg>`;
}

/** The owl with its body, in a pose. Give it `key={pose}` where the pose changes, so it acts the new one from its start. */
export function Buddy(props: { pose: Pose; class?: string }) {
  const [markup, setMarkup] = useState(kept);
  useEffect(() => {
    if (!markup && readOwl()) setMarkup(kept);
  }, []);
  if (!markup) return <Owl class={props.class} still />;
  return <span class={`f-owl f-buddy pose-${props.pose} ${props.class ?? ""}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: draw(markup, props.pose) }} />;
}
