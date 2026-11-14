// A Level: one question at a time, his own pad, Check after every question (14 Nov 2026; or once at the end when the
// owner turned that off); then the reveal.
// - The phone never has the answers: the server marks (convex/family.ts checkOne, check).
// - The owl is with him (owlBody.tsx: its whole body acts), the bar on top has one step a question (blue = right, rose
//   = not right, gold = now), a long question shows one sub-question at a time with its steps on top (questionView.ts
//   stepsOf). Its newer style is levelStyle.ts (this file's own; the older rules are in family.css).
// - The question is always on the screen when the Stage's questions are in the app (his answer, 4 Nov 2026: "always
//   show the question"; the eye switch is gone), in the app's own font, its printed number hidden (Q9 once). His
//   answer goes inside it where the book marks the place (kinds.tsx): the blanks are his boxes, options and ✓ / ✗ are
//   tapped, words are underlined; cards to order and pairs to match sit under it. The pad shows only for boxes.
// - The reveal: his answers come back one question at a time, a bell for each right one that climbs higher with every
//   one in a row, then the score, the XP, the flame, a trophy if he won one. A tap shows everything at once.
// - A question only the teacher marks has no box: "do it on paper", the pad pale, → goes on (4 Nov 2026: a student
//   tapped the pad there and nothing happened). A level opens again on the question he left (kept per level).

import { Fragment, type ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { FamilyLevel, FamilyLock, FamilyMe, FamilyQuestions, FamilyResult } from "../../convex/family";
import type { Trophy, World } from "../../convex/lib/family";
import type { LevelBook } from "../../convex/lib/homeWork";
import type { Box, FormPart } from "../../convex/lib/phone";
import { drawQuestion, showStep, stepsOf, type Steps } from "../questionView";
import { Book, Taker } from "./book";
import { fracCells, fracJoin, MatchPairs, OrderCards, paintSlots, PickBelow, SayBelow, slotRuns, slotsFit, tapOf, tapped, typing, WhyBelow, WordBox, type Live, type SlotRun } from "./kinds";
import { addLevelStyle } from "./levelStyle";
import { keep, mutation, NetError, query } from "./net";
import { Confetti, nextPlay } from "./next";
import { Buddy, type Pose } from "./owlBody";
import { buzz, sound } from "./sound";
import { Flame, Gem, Icon, Maths, Medal, Owl, OwlBadge, pretty, problemWords, Roll, Tag, toast, useOwlTap, Waiting, type Mood } from "./ui";

addLevelStyle();

/** A level's name on its screens: the redo of a Stage finished below 75 % is n = 0 (10 Nov 2026). */
const lvName = (f: { n: number; d?: number }) => (f.n === 0 ? "↻ Redo" : `Level ${f.d ?? f.n}`);

export type Checked = {
  results: FamilyResult[];
  got: number;
  phoneMax: number;
  max: number;
  teacher: number[];
  xp: number;
  streak: { days: number; today: boolean };
  trophies: Trophy[];
  /** The level's book (4 Nov 2026): the key's working where he lost marks, the photos it asks for. */
  book: LevelBook | null;
  /** The old questions that came back (his idea, 4 Nov 2026) and the marks he won back with them. */
  retry: { q: number; max: number; got: number; from: number }[];
  bonus: number;
  /** He saw every answer as he went (Check after every question): the reveal goes straight to the score. */
  seen?: true;
};

/** Where he types: the question, its box, and in a fraction box its cell (whole, numerator, denominator). */
type Spot = { qi: number; bi: number; ci?: number; si?: number };

/** Every box of the level in order: question index, box index within its question, the box. */
function boxesOf(form: FamilyLevel): { qi: number; bi: number; box: Box }[] {
  const out: { qi: number; bi: number; box: Box }[] = [];
  form.qs.forEach((q, qi) => {
    let bi = 0;
    for (const p of q.parts) for (const b of p.boxes ?? []) out.push({ qi, bi: bi++, box: b });
  });
  return out;
}

/**
 * Where to open a level: the kept place if it still fits the level, else its first box. A level begun before places were
 * kept (`typed` given): the first box he hasn't filled.
 */
export function spotIn(form: FamilyLevel, at: Spot, typed: Record<number, string[]> | null): Spot {
  const all = boxesOf(form);
  if (typed && Object.keys(typed).length) {
    const gap = all.find((x) => !(typed[form.qs[x.qi].q]?.[x.bi] ?? "").trim());
    if (gap) return { qi: gap.qi, bi: gap.bi };
  }
  if (at.qi < 0 || at.qi >= form.qs.length) return { qi: 0, bi: 0 };
  const n = all.filter((x) => x.qi === at.qi).length;
  return at.bi < 0 || (at.bi > 0 && at.bi >= n) ? { qi: at.qi, bi: 0 } : at;
}

const NUM_KEYS = ["7", "8", "9", "⌫", "4", "5", "6", "/", "1", "2", "3", "-", ".", "0", " ", "→"];
/**
 * The pad of an answer in letters: v = the box's letters in the alphabet's order (one, or 2–3 since 5 Nov 2026). Every
 * key keeps its place: the 1st letter where the one-letter pad has it; a 2nd and 3rd letter take × and /'s places
 * (letters side by side multiply: 6xy needs no ×).
 */
const exprKeys = (v: string, eq = false, power = false) => {
  const [a, b, c] = [...v];
  // A number in index form (no letter, 10 Nov 2026: 7³, 2⁶ × 3³): □ⁿ where the letter would be, × and / as always.
  const keys = ["7", "8", "9", "⌫", "4", "5", "6", a ?? "^", "1", "2", "3", "+", "0", "(", ")", "-", b ?? "*", c ?? "/", "^2"];
  // An equation (10 Nov 2026): "=" takes →'s place and → a row of its own under it: every other key stays put. A power
  // above 2 (x⁶, (2ab)³) puts □ⁿ there the same way (its exponent's digits follow it).
  const more = [...(eq ? ["="] : []), ...(power && a ? ["^"] : [])];
  return [...keys, ...more, "→"];
};
const KEY_LABEL: Record<string, string> = { "-": "−", "*": "×", "^2": "x²", "^": "□ⁿ", " ": "␣", "⌫": "⌫", "→": "→" };

/** His pad. On a question with no box (the teacher's) only → works: the other keys are pale. */
function Pad(props: { box: Box | null; onKey: (k: string) => void; last: boolean; go?: "check" | "busy" }) {
  const eq = props.box?.k === "expr" && !!props.box.eq;
  const power = props.box?.k === "expr" && !!props.box.p;
  const keys = props.box?.k === "expr" ? exprKeys(props.box.v, eq, power) : NUM_KEYS;
  const wide = props.box?.k === "expr" && (eq || (power && !!props.box.v));
  const fr = !!props.box?.f; // a fraction box: "/" goes down to the denominator (drawn as a fraction), ␣ to the next cell
  return (
    <div class={`f-padkeys${props.box?.k === "expr" ? " x" : ""}`} role="group" aria-label="Keys">
      {keys.map((k) => (
        <button
          type="button"
          key={k}
          aria-disabled={!props.box && k !== "→" ? "true" : undefined}
          class={`f-key${k === "→" ? ` next${wide ? " wide" : ""}${props.go ? " chk" : ""}` : ""}${k === "⌫" ? " del" : ""}${/^\d$/.test(k) ? "" : " op"}${!props.box && k !== "→" ? " f-keyoff" : ""}`}
          aria-label={k === "→" ? (props.go ? "Check" : props.last ? "Done" : "Next") : k === "⌫" ? "Delete" : k === " " ? "Space" : k === "^2" ? "squared" : k === "^" ? "power" : fr && k === "/" ? "Denominator" : k}
          onClick={() => props.onKey(k)}
        >
          {k === "→" && props.go ? (
            props.go === "busy" ? (
              "…"
            ) : (
              "Check"
            )
          ) : fr && k === "/" ? (
            <span class="f-kfrac" aria-hidden="true">
              <i />
              <b />
              <i class="on" />
            </span>
          ) : k === "^2" && props.box?.k === "expr" ? (
            props.box.v.length !== 1 ? (
              "□²"
            ) : (
              <>
                <i class="f-v">{props.box.v}</i>²
              </>
            )
          ) : /^[a-z]$/i.test(k) ? (
            <i class="f-v">{k}</i>
          ) : (
            (KEY_LABEL[k] ?? k)
          )}
        </button>
      ))}
    </div>
  );
}

/** A fraction box's cells: the whole number (a mixed number), then the numerator over a line over the denominator. */
function FracCells(props: { f: "f" | "m"; v: string; on: number; onCell: (c: number) => void }) {
  const cells = fracCells(props.f, props.v);
  const cell = (c: number) => (
    <span
      class={`f-fc${props.on === c ? " on" : ""}${cells[c] ? "" : " empty"}`}
      onClick={(e) => {
        e.stopPropagation();
        props.onCell(c);
      }}
    >
      {cells[c] ? <Maths s={cells[c]} /> : "?"}
    </span>
  );
  const top = props.f === "m" ? 1 : 0;
  return (
    <>
      {props.f === "m" && cell(0)}
      <span class="f-frac">
        {cell(top)}
        {cell(top + 1)}
      </span>
    </>
  );
}

/** A question with nothing to type (taps, cards, pairs, a photo): only → under it, where the pad's → always is. */
function NextBar(props: { onNext: () => void; last: boolean; go?: "check" | "busy" }) {
  return (
    <div class="f-nextbar">
      <button type="button" class={`f-key next${props.go ? " chk" : ""}`} aria-label={props.go ? "Check" : props.last ? "Done" : "Next"} onClick={props.onNext}>
        {props.go ? (props.go === "busy" ? "…" : "Check") : "→"}
      </button>
    </div>
  );
}

// ---- The questions as printed ----

/** Each Stage's book style, once per visit (it is large; a level's questions are kept with it for no signal). */
const cssOf = new Map<string, string>();

function useQuestions(world: World, n: number, on: boolean): { got: FamilyQuestions | null; failed: boolean } {
  const key = `qs.${world.unitId}.${n}`;
  const [got, setGot] = useState<FamilyQuestions | null>(() => keep<FamilyQuestions>(key));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!on || !world.q) return;
    let gone = false;
    const ck = n < 0 ? `${world.unitId}:f` : world.unitId; // a tute's ladder: the theory book's own CSS
    const known = cssOf.get(ck) ?? got?.css ?? null;
    query("family:questions", { unitId: world.unitId, n, css: known === null })
      .then((r) => {
        if (gone) return;
        const x = r as FamilyQuestions;
        const css = x.css ?? known;
        if (css) cssOf.set(ck, css);
        const full = { css, qs: x.qs };
        keep(key, full);
        setGot(full);
      })
      .catch(() => {
        if (!gone && !got) setFailed(true);
      });
    return () => {
      gone = true;
    };
  }, [on, world.unitId, n]);
  return { got, failed };
}

/**
 * The app's paper on the book's page (after the book's own rules): rounded, a little air; the app's own font, larger
 * (his ask, 4 Nov 2026: "I want beautiful font for the questions"), letters of maths in italics; the printed number
 * hidden (the card says Q9 once); the book's slots as the app's boxes, options, ✓ / ✗ and words to tap.
 */
const PAPER_CSS = `.qv { border-radius: 14px; padding: 14px 12px 10px; -webkit-user-select: none; user-select: none; color: var(--paper-ink, var(--ink, #1c1a3a));
  background: var(--paper-bg, #fff); filter: var(--paper-f, none); }
.qv [data-fill], .qv [data-opt], .qv .fx-tk, .qv [data-mark].fx-on, ::slotted(*) { filter: var(--paper-b, none); }
.qv [data-opt], ::slotted(*) { color: var(--ink, #1c1a3a); }
.qv {
  font: 500 17px/1.6 "Baloo Thambi 2", "Noto Sans Tamil", system-ui, sans-serif; }
.qv :not(svg):not(svg *):not(.mi):not(.mi *) { font-family: "Baloo Thambi 2", "Noto Sans Tamil", system-ui, sans-serif !important; }
.qv .sit, .qv .qs, .qv .sq, .qv .lead, .qv .lead2, .qv .pq p, .qv .bl, .qv .rp, .qv .mcq, .qv table.gt td { font-size: 17px !important; line-height: 1.6 !important; }
.qv .src { font-size: 12.5px !important; letter-spacing: 0 !important; color: var(--ink3, #9d99bf) !important; font-weight: 600 !important; }
.qv .mi { font-family: "STIX Two Text", "Cambria Math", Georgia, serif; }
.qv .frc { font-size: .9em; }
.qv .qn, .qv .pm, .qv .mk { display: none !important; }
.qv [data-fill] { display: inline-flex !important; align-items: center; justify-content: center; vertical-align: middle; box-sizing: border-box;
  min-width: 2.6em !important; width: auto !important; height: 2.15em; margin: .1em .12em; padding: 0 .3em; border: 2px dashed var(--brand-mid, #cbc3ff) !important;
  border-radius: 10px; background: var(--brand-soft, #efecff); color: var(--brand-2, #5a49d6); font: 800 1.05em/1 "Baloo Thambi 2", sans-serif !important; cursor: pointer; }
.qv .frc [data-fill] { min-width: 1.75em !important; height: 1.45em; margin: 0 0 .12em; border-radius: 8px; }
.qv [data-fill][style*="vertical-align:."], .qv sup [data-fill] { min-width: 1.45em !important; height: 1.3em !important; margin: 0 .05em !important;
  padding: 0 .15em; border-radius: 7px; font-size: .74em !important; vertical-align: .7em !important; }
.qv [data-fill][style*="border-bottom"]:not([style*="vertical-align:."]) { height: 2.15em !important; vertical-align: middle !important; }
.qv [data-fill].fx-has { border-style: solid !important; background: var(--card, #fff); }
.qv [data-fill].fx-on { border: 2.5px solid var(--brand, #6c5ce7) !important; background: var(--card, #fff); box-shadow: 0 0 0 4px var(--brand-soft, #efecff); }
.qv [data-opt] { display: inline-flex; align-items: center; gap: .35em; min-height: 48px; box-sizing: border-box; margin: .2em 0; padding: .3em .9em .2em; border-radius: 15px; cursor: pointer;
  box-shadow: inset 0 0 0 2px var(--line-2, #ddd9f0), 0 3px 0 var(--line-2, #ddd9f0); background: var(--card, #fff); font-weight: 700; transition: transform .12s ease; }
.qv [data-opt].fx-on { box-shadow: inset 0 0 0 2.5px var(--brand, #6c5ce7), 0 3px 0 var(--brand, #6c5ce7); background: var(--brand-soft, #efecff); color: var(--brand-2, #5a49d6);
  transform: translateY(-2px); animation: fx-pop .28s ease; }
.qv .mcq { display: grid !important; grid-template-columns: 1fr 1fr; gap: 10px !important; margin-top: 10px !important; }
.qv .mcq [data-opt] { display: flex; margin: 0; }
.qv [data-tick] { display: inline-flex; gap: 8px; margin: .15em .25em; vertical-align: middle; }
.qv .fx-tk { display: inline-flex; align-items: center; justify-content: center; width: 3em; height: 2.6em; border-radius: 13px; cursor: pointer;
  box-shadow: inset 0 0 0 2px var(--line-2, #ddd9f0), 0 3px 0 var(--line-2, #ddd9f0); background: var(--card, #fff); color: var(--ink3, #9d99bf); font: 800 1.15em/1 "Baloo Thambi 2", sans-serif; }
.qv .fx-tk.fx-on { box-shadow: inset 0 0 0 2.5px var(--brand, #6c5ce7), 0 3px 0 var(--brand, #6c5ce7); background: var(--brand-soft, #efecff); color: var(--brand-2, #5a49d6); animation: fx-pop .28s ease; }
@keyframes fx-pop { 0% { transform: scale(.92); } 60% { transform: scale(1.06); } 100% { transform: none; } }
.qv [data-fill].fx-ok, .qv [data-opt].fx-ok, .qv .fx-tk.fx-ok { border-color: var(--right, #1e8cf5) !important; border-style: solid !important; box-shadow: inset 0 0 0 2.5px var(--right, #1e8cf5), 0 0 0 4px var(--right-soft, #e3f0ff);
  background: var(--right-soft, #e3f0ff); color: var(--right-ink, #0f63bd); }
.qv [data-fill].fx-no, .qv [data-opt].fx-no, .qv .fx-tk.fx-no { border-color: var(--wrong, #f24a6c) !important; border-style: solid !important; box-shadow: inset 0 0 0 2.5px var(--wrong, #f24a6c), 0 0 0 4px var(--wrong-soft, #ffe6ec);
  background: var(--wrong-soft, #ffe6ec); color: var(--wrong-ink, #c42c4d); }
.qv [data-mark] { display: inline-block; min-width: 1.7em; margin: .1em 0; padding: .05em .3em 0; text-align: center; font-size: 1.12em;
  cursor: pointer; border-bottom: 3px solid transparent; border-radius: 2px; }
.qv [data-mark].fx-on { border-bottom-color: var(--brand, #6c5ce7); color: var(--brand-2, #5a49d6); }
.qv [data-mark].fx-ring { border: 2px solid transparent; border-radius: 999px; padding: 0 .3em; }
.qv [data-mark].fx-ring.fx-on { border-color: var(--brand, #6c5ce7); }
.qv [data-mark].mk-l { display: inline; font-size: 1em; text-align: left; padding: 0 .1em; line-height: 1.75;
  -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.qv .fx-v { font-family: Georgia, "Noto Serif", "Times New Roman", serif; font-style: italic; font-weight: 700; padding: 0 .04em; }`;

/**
 * A question as printed, on the level. A tap opens it full screen (`QuestionZoom`): the app itself never zooms. With
 * its slots live (his answers go in it), a tap answers instead and only 🔍 zooms.
 */
function Paper(props: {
  html: string;
  css: string;
  q: number;
  onZoom: () => void;
  live?: Live;
  parts?: string[];
  /** A long question, one sub-question at a time: this one, "story" = only its story; undefined = all of it. */
  step?: number | "story";
  /** The step before was a later one: this one slides in from the left. */
  back?: boolean;
  children?: ComponentChildren;
}) {
  const host = useRef<HTMLDivElement>(null);
  const labels = props.parts?.join("\n");
  const shown = useRef<number | "story" | undefined | null>(null);
  useEffect(() => {
    if (!host.current) return;
    shown.current = null;
    return drawQuestion(host.current, props.html, props.css, PAPER_CSS, props.parts);
  }, [props.html, props.css, labels]);
  // Its step (after the drawing above, and again when he moves to another one).
  useEffect(() => {
    if (!host.current || shown.current === props.step) return;
    shown.current = props.step;
    showStep(host.current, props.step ?? null);
  });
  // After every change: his answers in the slots (the drawing above runs first).
  useEffect(() => {
    const root = host.current?.shadowRoot;
    if (root && props.live) paintSlots(root, props.live);
  });
  const live = props.live && props.live.fit.size > 0 ? props.live : null;
  return (
    <div
      class={`f-paper ${props.step === undefined ? "rise" : `step${props.back ? " back" : ""}`}${live ? " live" : ""}`}
      ref={host}
      aria-label={`Q${props.q}`}
      onClick={(e) => {
        if (e.target instanceof Element && e.target.closest(".f-part")) return; // his answers under a sub-question
        if (!live) return props.onZoom();
        const t = tapOf(e, live);
        if (t) live.onSlot(t.run, t.i, t.v);
      }}
    >
      {props.children}
    </div>
  );
}

/** A printed question to open full screen. */
export type Zoomed = { q: number; html: string; css: string };
const ZOOM_AIR = 12;
const ZOOM_MAX = 4;

/**
 * A printed question, full screen (his answer, 4 Nov 2026: two fingers never zoom the app, so its small text and its
 * figures shrunk to fit open here). Two fingers zoom only the question (up to 4x), one finger moves it, a double tap
 * zooms in (2.5x) or back, ✕ or the phone's Back closes it. The browser leaves the stage alone (`touch-action: none`);
 * the fingers move the paper by transform only.
 */
export function QuestionZoom(props: Zoomed & { onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.body.classList.add("f-noscroll");
    return () => document.body.classList.remove("f-noscroll");
  }, []);
  useEffect(() => {
    const st = stage.current;
    const el = paper.current;
    if (!st || !el) return;
    const undraw = drawQuestion(el, props.html, props.css, PAPER_CSS);
    type P = { x: number; y: number };
    let s = 1;
    let x = ZOOM_AIR;
    let y = ZOOM_AIR;
    const fingers = new Map<number, P>();
    let pinch: { d: number; m: P; s: number; x: number; y: number } | null = null;
    let last: P | null = null;
    let first: P | null = null;
    let moved = false;
    let tap = { t: -1e9, x: 0, y: 0 };
    const gap = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
    // The paper stays on the stage: centred while it fits, else its edges no further in than the air.
    const draw = (glide = false) => {
      const w = el.offsetWidth * s;
      const h = el.offsetHeight * s;
      const sw = st.clientWidth;
      const sh = st.clientHeight;
      x = w + 2 * ZOOM_AIR <= sw ? (sw - w) / 2 : Math.min(ZOOM_AIR, Math.max(sw - w - ZOOM_AIR, x));
      y = h + 2 * ZOOM_AIR <= sh ? (sh - h) / 2 : Math.min(ZOOM_AIR, Math.max(sh - h - ZOOM_AIR, y));
      el.classList.toggle("glide", glide);
      el.style.transform = `translate(${x}px, ${y}px) scale(${s})`;
      root.current?.classList.toggle("zoomed", s > 1.02);
    };
    const at = (e: PointerEvent): P => {
      const r = st.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const startPinch = () => {
      const [a, b] = [...fingers.values()];
      pinch = { d: Math.max(1, gap(a, b)), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, s, x, y };
    };
    // The point under the fingers stays under them.
    const zoomTo = (ns: number, from: P, to: P, s0: number, x0: number, y0: number) => {
      s = Math.min(ZOOM_MAX, Math.max(1, ns));
      x = to.x - ((from.x - x0) / s0) * s;
      y = to.y - ((from.y - y0) / s0) * s;
    };
    const down = (e: PointerEvent) => {
      const p = at(e);
      if (fingers.size === 0) {
        moved = false;
        first = p;
      }
      fingers.set(e.pointerId, p);
      last = p;
      if (fingers.size === 2) {
        moved = true;
        startPinch();
      }
    };
    const move = (e: PointerEvent) => {
      if (!fingers.has(e.pointerId)) return;
      const p = at(e);
      fingers.set(e.pointerId, p);
      if (fingers.size >= 2 && pinch) {
        const [a, b] = [...fingers.values()];
        zoomTo((pinch.s * gap(a, b)) / pinch.d, pinch.m, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, pinch.s, pinch.x, pinch.y);
      } else if (last) {
        x += p.x - last.x;
        y += p.y - last.y;
        last = p;
        if (first && gap(p, first) > 10) moved = true;
      }
      draw();
    };
    const up = (e: PointerEvent) => {
      if (!fingers.delete(e.pointerId)) return;
      if (fingers.size >= 2) return startPinch();
      pinch = null;
      if (fingers.size === 1) {
        last = [...fingers.values()][0];
        return;
      }
      last = null;
      if (moved || e.type === "pointercancel") return;
      const p = at(e);
      const now = performance.now();
      if (now - tap.t < 320 && gap(p, tap) < 30) {
        tap.t = -1e9;
        if (s > 1.02) s = 1;
        else zoomTo(2.5, p, p, s, x, y);
        draw(true);
      } else tap = { t: now, x: p.x, y: p.y };
    };
    st.addEventListener("pointerdown", down);
    st.addEventListener("pointermove", move);
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", up);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => draw()) : null;
    ro?.observe(st);
    ro?.observe(el);
    draw();
    return () => {
      undraw();
      ro?.disconnect();
      st.removeEventListener("pointerdown", down);
      st.removeEventListener("pointermove", move);
      st.removeEventListener("pointerup", up);
      st.removeEventListener("pointercancel", up);
    };
  }, [props.html, props.css]);
  return (
    <div class="f-zoom" ref={root} role="dialog" aria-modal="true" aria-label={`Q${props.q}`}>
      <div class="f-zstage" ref={stage}>
        <div class="f-zpaper" ref={paper} />
      </div>
      <header class="f-ztop">
        <b class="f-zq">Q{props.q}</b>
        <button type="button" class="f-round" aria-label="Close" onClick={props.onClose}>
          <Icon name="close" size={20} />
        </button>
      </header>
      <p class="f-zhint">இரண்டு விரல்களால் பெரிதாக்கு</p>
    </div>
  );
}

// ---- A level ----

/** What a question asks of him, said beside its number (the owl's voice: Tamil). */
const ASK = {
  type: "விடையை எழுது",
  choose: "சரியானதைத் தொடு",
  tf: "சரியா, பிழையா?",
  mark: "தொட்டுக் குறி",
  order: "வரிசைப்படுத்து",
  match: "பொருத்து",
  why: "ஆம் / இல்லை, காரணம்",
  say: "உன் சொற்களில் எழுது",
  paper: "தாளில் செய்",
} as const;
function askOf(parts: FormPart[]): keyof typeof ASK {
  for (const p of parts) {
    if (!p.boxes?.length) continue;
    const k = p.ui?.k;
    if (k && k !== "fill") return k;
    return p.boxes.some((b) => b.k === "text") ? "say" : "type";
  }
  return "paper";
}

/** A question checked on its own (14 Nov 2026): how it went. pt = part of its marks, teach = a part waits for the teacher. */
type Verdict = "ok" | "pt" | "no" | "teach";
const verdictOf = (l: FamilyLock): Verdict => (l.got === null ? "teach" : l.got >= l.max ? "ok" : l.got > 0 ? "pt" : "no");

export function Play(props: {
  world: World;
  n: number;
  onBack: () => void;
  onChecked: (f: FamilyLevel, r: Checked, typed: Record<number, string[]>) => void;
  /** The server has this level marked at home already (a Check whose answer never reached this phone): its book. */
  onMarked: () => void;
  onZoom: (z: Zoomed) => void;
  /** The owner's Preview (5 Nov 2026, src/family/preview.tsx): the level as a student sees it, Check off. */
  look?: true;
}) {
  const formKey = `form.${props.world.unitId}.${props.n}`;
  const draftKey = `draft.${props.world.unitId}.${props.n}`;
  const spotKey = `spot.${props.world.unitId}.${props.n}`;
  const lockKey = `lock.${props.world.unitId}.${props.n}`;
  const [form, setForm] = useState<FamilyLevel | null>(() => keep<FamilyLevel>(formKey));
  const [typed, setTyped] = useState<Record<number, string[]>>(() => keep<Record<number, string[]>>(draftKey) ?? {});
  // The question he left (his ask, 4 Nov 2026: "exactly that question want to focus and continue from that").
  const [kept] = useState(() => keep<Spot>(spotKey));
  const [at, setAt] = useState<Spot>(() => kept ?? { qi: 0, bi: 0 });
  const placed = useRef(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Check after every question (14 Nov 2026): the ones he checked (kept on the phone too; the server's word wins), the
  // answer on screen now, his run of right ones.
  const [locks, setLocks] = useState<Record<number, FamilyLock>>(() => keep<Record<number, FamilyLock>>(lockKey) ?? {});
  const [verdict, setVerdict] = useState<{ q: number; run: number } | null>(null);
  const [run, setRunN] = useState(0);
  const [checking, setChecking] = useState(false);
  const sure = useRef<number | null>(null);
  // The list of questions (the bar on top opens it), a long question's story open, how long since he did anything.
  const [list, setList] = useState(false);
  const [story, setStory] = useState(false);
  const [idle, setIdle] = useState(0);
  const acted = useRef(Date.now());
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const stepWas = useRef(0);
  const stepCache = useRef<{ key: string; v: Steps | null }>({ key: "", v: null });
  // The question is always shown when the Stage's questions are in the app (his answer, 4 Nov 2026).
  const showQ = props.world.q;
  const qs = useQuestions(props.world, props.n, showQ);
  // A tute's teacher question (4 Nov 2026, his idea): done with the teacher → he types it; not yet → Learn (the worked
  // solution, a step a tap), then he does the same question himself. Kept per level, as his answers are.
  const howKey = `how.${props.world.unitId}.${props.n}`;
  const [how, setHow] = useState<Record<number, "do" | "learn">>(() => keep<Record<number, "do" | "learn">>(howKey) ?? {});
  const pick = (qn: number, h: "do" | "learn") => {
    buzz();
    sound(h === "learn" ? "pop" : "tap");
    const next = { ...how, [qn]: h };
    setHow(next);
    keep(howKey, next);
  };
  const strip = useRef<HTMLDivElement>(null);
  // The owner's Preview: the level again after he changed a question's free marks.
  const [ver, setVer] = useState(0);

  // The server says this level is marked (his report, 4 Nov 2026: Check said "This level is already marked", no
  // summary, no word on why the next level stayed shut): his first Check went through but its answer never reached
  // the phone (the signal dropped), or a teacher marked it in class. What the phone kept for it is no use any more:
  // a level marked at home opens its book (the marks, the solutions, the photos it asks for).
  const marked = (e: unknown) => e instanceof NetError && !e.offline && /already marked|already has this level/.test(e.message);
  const forget = () => {
    keep(draftKey, null);
    keep(formKey, null);
    keep(spotKey, null);
    keep(howKey, null);
    keep(lockKey, null);
    keep(`qs.${props.world.unitId}.${props.n}`, null);
  };
  const gone = () => {
    forget();
    query("family:book", { unitId: props.world.unitId, n: props.n })
      .then(() => props.onMarked())
      .catch(() => setErr(`Level ${props.n} ஐ உன் ஆசிரியர் ஏற்கனவே திருத்திவிட்டார்.`));
  };
  useEffect(() => {
    query("family:level", { unitId: props.world.unitId, n: props.n })
      .then((f) => {
        const lv = f as FamilyLevel;
        keep(formKey, lv);
        setForm(lv);
        // What he checked from any of his phones: the server's word, with what he typed then.
        const got = lv.locks;
        if (!got?.length) return;
        setLocks((old) => {
          const next = { ...old };
          for (const l of got) next[l.q] = l;
          keep(lockKey, next);
          return next;
        });
        setTyped((old) => {
          const next = { ...old };
          for (const l of got) next[l.q] = l.a;
          keep(draftKey, next);
          return next;
        });
      })
      .catch((e) => {
        if (marked(e)) return gone();
        // Refused now (the photos first, the levels in order): say why, never the old level kept on the phone.
        if (!form || (e instanceof NetError && !e.offline)) setErr(problemWords(e));
      });
  }, [props.world.unitId, props.n, ver]);
  // A new question (his report, 4 Nov 2026: after → the screen jumped up and came back down). A new question is a new
  // page: if he had scrolled down (a tall printed question), it starts at the top, set before the screen is drawn, so
  // the only motion is the page sliding in from the side. (Its printed question is drawn a frame later: for that frame
  // the page is shorter and the browser had already moved it part-way.) The list of questions closes.
  const placedRow = useRef(false);
  useLayoutEffect(() => {
    if (!form) return;
    if (placedRow.current && window.scrollY > 0) window.scrollTo(0, 0);
    placedRow.current = true;
    setList(false);
    setStory(false);
  }, [at.qi, !!form]);
  // The review after his last → is a new page too.
  useLayoutEffect(() => {
    if (review && window.scrollY > 0) window.scrollTo(0, 0);
  }, [review]);
  // His place on this level: checked against the level when it comes (it may have changed), then kept as he moves.
  useEffect(() => {
    if (!form) return;
    const fit = spotIn(form, at, kept || placed.current ? null : typed);
    placed.current = true;
    if (fit.qi !== at.qi || fit.bi !== at.bi) setAt(fit);
  }, [form]);
  useEffect(() => {
    if (form) keep(spotKey, at);
  }, [at.qi, at.bi, !!form]);
  // The owl notices when he stops: it thinks with him after 25 s, falls asleep after 70 s (never in tests).
  useEffect(() => {
    if (instant()) return;
    const id = window.setInterval(() => {
      const ms = Date.now() - acted.current;
      setIdle(ms > 70_000 ? 2 : ms > 25_000 ? 1 : 0);
    }, 5000);
    return () => window.clearInterval(id);
  }, []);

  const all = useMemo(() => (form ? boxesOf(form) : []), [form]);
  if (err) return <Oops text={err} onBack={props.onBack} />;
  if (!form) return <Waiting />;

  const act = () => {
    acted.current = Date.now();
    if (idle) setIdle(0);
  };
  const each = !!form.each && !props.look;
  const q = form.qs[at.qi];
  /** This question, checked already: his answers stay as they are. */
  const lock = each ? locks[q.q] : undefined;
  const asking = !review && !!q.t && !how[q.q];
  const learning = !review && !!q.t && how[q.q] === "learn";
  const flat = all.findIndex((x) => x.qi === at.qi && x.bi === at.bi);
  // The box he types in now: a tap's place (an option, ✓ / ✗, a card) is never typed into.
  const box = flat >= 0 && typing(all[flat].box) && !lock ? all[flat].box : null;
  const val = (qi: number, bi: number) => typed[form.qs[qi].q]?.[bi] ?? "";
  /** Several of a question's answers at once (a tap changes a whole part: ✓ / ✗, the words marked, the cards). */
  const setRun = (qi: number, from: number, vals: string[]) => {
    const qn = form.qs[qi].q;
    if (each && locks[qn]) return;
    act();
    const arr = [...(typed[qn] ?? [])];
    vals.forEach((v, k) => (arr[from + k] = v));
    const next = { ...typed, [qn]: arr };
    setTyped(next);
    keep(draftKey, next);
  };
  const set = (qi: number, bi: number, s: string) => setRun(qi, bi, [s]);
  /** Where a question starts: its first box to type in (or its first answer when it has none). */
  const startOf = (qi: number) => Math.max(0, all.filter((x) => x.qi === qi).findIndex((x) => typing(x.box)));
  const typesIn = (qi: number) => all.some((x) => x.qi === qi && typing(x.box));
  const boxesIn = (qi: number) => all.filter((x) => x.qi === qi).length;
  const filled = (qi: number) => {
    if (form.qs[qi].free) return "free";
    const n = boxesIn(qi);
    let f = 0;
    for (let i = 0; i < n; i++) if (val(qi, i).trim()) f++;
    return n === 0 ? "teacher" : f === n ? "full" : f > 0 ? "part" : "empty";
  };
  /** A question's state on the bar and in the list: checked (how it went), else how much of it he answered. */
  const stateOf = (qi: number) => {
    const l = each ? locks[form.qs[qi].q] : undefined;
    return l ? `${filled(qi)} ${verdictOf(l)}` : filled(qi);
  };

  const printed = showQ ? qs.got?.qs.find((x) => x.q === q.q) : undefined;
  const css = qs.got?.css ?? null;
  // Each part's answers right under its own sub-question, inside the printed question (5 Nov 2026, his ask: "after each
  // sub question, I want to put the answer box"; Paper → slotParts), else under the question as before.
  const inPaper = !!printed && css !== null && !asking && !learning;
  // A long question, one sub-question at a time (14 Nov 2026, his idea): its steps, when every part found its own.
  const labels = q.parts.map((x) => x.p ?? "");
  const stepKey = inPaper && printed && (!q.free || props.look) ? `${q.q}|${printed.html.length}|${labels.join("\n")}` : "";
  if (stepCache.current.key !== stepKey) stepCache.current = { key: stepKey, v: stepKey && printed ? stepsOf(printed.html, labels) : null };
  const steps = stepCache.current.v;
  const inQ = all.filter((x) => x.qi === at.qi);
  const partAt: number[] = [];
  q.parts.forEach((p, pi) => {
    for (let k = 0; k < (p.boxes?.length ?? 0); k++) partAt.push(pi);
  });
  const stepOfBi = (bi: number) => (steps ? Math.max(0, steps.of[partAt[bi] ?? 0] ?? 0) : 0);
  const stepNow = steps ? Math.min(steps.n - 1, Math.max(0, at.si ?? stepOfBi(at.bi))) : 0;
  const stepBack = stepNow < stepWas.current;
  stepWas.current = stepNow;
  const stepParts = (k: number) => q.parts.filter((_, pi) => steps?.of[pi] === k);
  const goStep = (k: number) => {
    if (!steps || k < 0 || k >= steps.n) return;
    act();
    setStory(false);
    if (k === stepNow) return;
    buzz(5);
    sound("tap");
    const bs = inQ.filter((x) => stepOfBi(x.bi) === k);
    const t = bs.find((x) => typing(x.box)) ?? bs[0];
    setAt({ qi: at.qi, bi: t ? t.bi : at.bi, si: k });
  };
  /** How much of a step he answered (the steps on top), or how it went once checked. */
  const stepState = (k: number) => {
    let n = 0;
    let f = 0;
    let right = true;
    q.parts.forEach((p, pi) => {
      if (steps?.of[pi] !== k) return;
      const from = partAt.indexOf(pi);
      for (let i = 0; i < (p.boxes?.length ?? 0); i++, n++) if (val(at.qi, from + i).trim()) f++;
      const ok = lock?.ok[pi];
      if (lock && ok && !ok.every(Boolean)) right = false;
    });
    if (lock) return lock.got === null && stepParts(k).some((p) => !p.boxes) ? "full" : right ? "ok" : "no";
    return n === 0 ? "" : f === n ? "full" : f > 0 ? "part" : "";
  };

  /** What → does next: his fraction's next cell, the next box of this step, the next step, or the question's end. */
  const fr = box?.f ? box.f : null;
  const ahead = (): { k: "cell" | "step" | "end" } | { k: "box"; bi: number } => {
    if (lock) return { k: steps && stepNow + 1 < steps.n ? "step" : "end" };
    if (fr && (at.ci ?? 0) < fracCells(fr, val(at.qi, at.bi)).length - 1) return { k: "cell" };
    const nb = flat >= 0 ? inQ.find((x) => x.bi > at.bi && typing(x.box) && (!steps || stepOfBi(x.bi) === stepNow)) : undefined;
    if (nb) return { k: "box", bi: nb.bi };
    return { k: steps && stepNow + 1 < steps.n ? "step" : "end" };
  };
  /** This question can be checked now: something of his in it, and not checked yet. */
  const canCheck = each && !lock && !q.free && !asking && !learning && inQ.length > 0 && filled(at.qi) !== "empty";
  const settled = (qi: number, now: Record<number, FamilyLock>) => !!form.qs[qi].free || !!now[form.qs[qi].q] || boxesIn(qi) === 0;
  const nextQ = (now = locks) => {
    // A question he checked is done: → passes over it to the next one still open.
    let to = at.qi + 1;
    if (each) while (to < form.qs.length && now[form.qs[to].q]) to++;
    if (to < form.qs.length) return setAt({ qi: to, bi: startOf(to) });
    setReview(true);
    // Every question checked one by one: the level is done, nothing more to ask him.
    if (each && form.qs.every((_, qi) => settled(qi, now))) void check();
  };
  const checkNow = async () => {
    if (checking) return;
    const a = Array.from({ length: inQ.length }, (_, i) => val(at.qi, i).trim());
    const gaps = a.filter((x) => !x).length;
    if (gaps > 0 && sure.current !== q.q) {
      sure.current = q.q;
      return toast(`${gaps} காலியாக உள்ளன (அவை ✗). சரி என்றால் மீண்டும் Check அழுத்து.`);
    }
    sure.current = null;
    setChecking(true);
    try {
      const l = (await mutation("family:checkOne", { unitId: form.unitId, n: form.n, q: q.q, a, b: inQ.length })) as FamilyLock;
      const next = { ...locks, [q.q]: l };
      setLocks(next);
      keep(lockKey, next);
      // What the server kept is what he sees (asked twice, his first answers come back).
      const mine = { ...typed, [q.q]: l.a };
      setTyped(mine);
      keep(draftKey, mine);
      const v = verdictOf(l);
      const r = v === "ok" ? run + 1 : v === "teach" ? run : 0;
      setRunN(r);
      if (v === "ok") {
        sound("right", Math.max(0, r - 1));
        buzz(6);
      } else if (v === "no") {
        sound("wrong");
        buzz(18);
      } else sound("pop");
      setVerdict({ q: q.q, run: r });
    } catch (e) {
      if (marked(e)) return gone();
      if (e instanceof NetError && e.offline) {
        toast("இணையம் இல்லை: உன் விடை இங்கே உள்ளது. Level முடிவில் சரிபார்க்கப்படும்.");
        return nextQ();
      }
      // The owner turned it off meanwhile: this level is checked once, at its end.
      if (e instanceof NetError && /at its end/.test(e.message)) {
        setForm({ ...form, each: undefined });
        return nextQ();
      }
      toast(problemWords(e), true);
    } finally {
      setChecking(false);
    }
  };
  const goNext = () => {
    act();
    const a = ahead();
    if (a.k === "box") return setAt({ qi: at.qi, bi: a.bi });
    if (a.k === "step") return goStep(stepNow + 1);
    if (canCheck) return void checkNow();
    nextQ();
  };
  const onKey = (k: string) => {
    act();
    if (lock) return k === "→" ? goNext() : undefined;
    buzz(6);
    sound("key");
    // A fraction box: → (and ␣) to its next cell, then on; the fraction key down to the denominator; ⌫ on an empty
    // cell back to the one before.
    const ci = at.ci ?? 0;
    const cells = fr ? fracCells(fr, val(at.qi, at.bi)) : [];
    if (fr && (k === "→" || k === " ") && ci < cells.length - 1) return setAt({ ...at, ci: ci + 1 });
    if (k === "→") return goNext();
    if (fr) {
      if (k === " ") return;
      if (k === "/") return setAt({ ...at, ci: cells.length - 1 });
      if (k === "⌫" && !cells[ci]) return ci > 0 ? setAt({ ...at, ci: ci - 1 }) : undefined;
      if (k !== "⌫" && cells[ci].length >= 16) return;
      cells[ci] = k === "⌫" ? (cells[ci].endsWith("^2") ? cells[ci].slice(0, -2) : cells[ci].slice(0, -1)) : cells[ci] + k;
      return set(at.qi, at.bi, fracJoin(fr, cells));
    }
    // A key while a tap's place is chosen: it goes to the first box of what he sees (the question, or its step).
    const first = inQ.find((x) => typing(x.box) && (!steps || stepOfBi(x.bi) === stepNow));
    const here = box ? at.bi : first ? first.bi : -1;
    if (here < 0) return toast(typesIn(at.qi) ? "இங்கே எழுத எதுவும் இல்லை. → அடுத்தது." : "இதைத் தாளில் செய்து படம் எடு (📷). → அடுத்த கேள்வி.");
    if (here !== at.bi) setAt({ qi: at.qi, bi: here });
    const cur = val(at.qi, here);
    if (k === "⌫") return set(at.qi, here, cur.endsWith("^2") ? cur.slice(0, -2) : cur.slice(0, -1));
    if (cur.length >= 30) return;
    set(at.qi, here, cur + k);
  };
  const empty = all.filter((x) => !val(x.qi, x.bi).trim()).length;
  const done = all.length - empty;
  const teacherQs = form.qs.filter((x) => x.parts.some((p) => !p.boxes)).length;
  const backQs = form.qs.filter((x) => x.re).length;
  const freeQs = form.qs.filter((x) => x.free);
  const lockedQs = each ? form.qs.filter((x) => locks[x.q]).length : 0;
  // The XP of this level so far (it becomes his when the level is done): his marks, and old questions won back.
  const bank = each
    ? form.qs.reduce((s, x) => {
        const l = locks[x.q];
        return s + (!l ? 0 : x.re ? (l.got !== null && l.got >= l.max ? (x.rb ?? 0) : 0) : (l.got ?? l.phoneGot));
      }, 0)
    : 0;

  const check = async () => {
    setBusy(true);
    try {
      const res = (await mutation("family:check", {
        unitId: form.unitId,
        n: form.n,
        // A box he skipped is a gap in his list (or null, kept on the phone): it goes as "" (the server's ✗).
        // b = the boxes this screen showed: a question the server reads differently now is never marked against it.
        typed: form.qs.map((x) => ({ q: x.q, a: Array.from(typed[x.q] ?? [], (s) => (s ?? "").trim()), b: x.parts.reduce((n, p) => n + (p.boxes?.length ?? 0), 0) })),
      })) as Checked;
      forget();
      // He saw each answer as he went: the reveal goes straight to the score.
      const seen = each && res.results.every((r) => r.free || !!locks[r.q] || r.ok.every((o) => o === null));
      props.onChecked(form, seen ? { ...res, seen: true } : res, typed);
    } catch (e) {
      if (marked(e)) return gone();
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. உன் விடைகள் இந்த phone இல் உள்ளன: இணையம் வந்ததும் மீண்டும் அழுத்து." : problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };

  const zoom = () => {
    if (printed && css !== null) props.onZoom({ q: q.q, html: printed.html, css });
  };
  // The kinds the book gave this question: their places in the printed question, live; the rest under it.
  const runs = slotRuns(q);
  const fit = printed && css !== null ? slotsFit(runs, printed.html) : new Set<SlotRun["attr"]>();
  const mine = typed[q.q] ?? [];
  const tap = (run: SlotRun, i: number, v?: string) => {
    if (lock) return;
    act();
    if (run.attr === "b") {
      buzz(5);
      sound("tap");
      return setAt({ qi: at.qi, bi: run.at + i });
    }
    const vals = tapped(run, mine, i, v);
    if (!vals) return;
    buzz(6);
    sound(run.ui.k === "choose" ? "pop" : "tap");
    setRun(at.qi, run.at, vals);
  };
  // After its Check: each answer right or not, in his list's order (words to mark and a reason: the part as a whole).
  const marks: (boolean | null)[] = [];
  if (lock) {
    q.parts.forEach((p, pi) => {
      const ok = lock.ok[pi] ?? null;
      const whole = p.ui?.k === "mark" || p.ui?.k === "why";
      for (let k = 0; k < (p.boxes?.length ?? 0); k++) marks.push(ok === null ? null : whole ? ok.every(Boolean) : (ok[k] ?? false));
    });
  }
  const live: Live = { runs, fit, vals: mine, cur: box ? at.bi : null, onSlot: tap, ...(lock ? { marks } : {}) };
  const runAt = (from: number) => runs.find((r) => r.at === from);
  const pad = !review && !asking && !learning && !lock && typesIn(at.qi);
  // → is Check where the question ends (and its Check answers at once).
  const go = canCheck && ahead().k === "end" ? (checking ? ("busy" as const) : ("check" as const)) : undefined;
  let bi = 0;
  const sl = (pi: number) => (inPaper ? `p${pi}` : undefined);
  const rows = asking || learning ? [] : q.parts.map((p, pi) => {
    if (p.boxes && p.boxes.length === 0) return null;
    const from = bi;
    const ui = p.ui;
    // A kind answered inside the printed question: nothing under it. Cards, pairs, names the paper doesn't print,
    // a reason and the rest go here.
    if (ui && ui.k !== "fill" && ui.k !== "order" && ui.k !== "match" && ui.k !== "why" && ui.k !== "say") {
      bi += p.boxes?.length ?? 0;
      const run = runAt(from);
      if (!run || (fit.has(run.attr) && !run.below)) return null;
      return (
        <div class="f-part" key={pi} slot={sl(pi)}>
          {p.p && <span class="f-plabel">({p.p})</span>}
          <PickBelow run={run} vals={mine} onPick={(i, v) => tap(run, i, v)} />
        </div>
      );
    }
    if (ui?.k === "order" || ui?.k === "match") {
      bi += p.boxes?.length ?? 0;
      return (
        <div class="f-part" key={pi} slot={sl(pi)}>
          {p.p && <span class="f-plabel">({p.p})</span>}
          {ui.k === "order" ? (
            <OrderCards items={ui.items} vals={mine} at={from} onSet={(v) => setRun(at.qi, from, v)} />
          ) : (
            <MatchPairs l={ui.l} r={ui.r} vals={mine} at={from} onSet={(v) => setRun(at.qi, from, v)} />
          )}
        </div>
      );
    }
    if (ui?.k === "why") {
      bi += p.boxes?.length ?? 0;
      return (
        <div class="f-part" key={pi} slot={sl(pi)}>
          {p.p && <span class="f-plabel">({p.p})</span>}
          <WhyBelow vals={mine} at={from} onSet={(v) => setRun(at.qi, from, v)} />
        </div>
      );
    }
    if (ui?.k === "say") {
      bi += p.boxes?.length ?? 0;
      return (
        <div class="f-part" key={pi} slot={sl(pi)}>
          {p.p && <span class="f-plabel">({p.p})</span>}
          <SayBelow v={mine[from] ?? ""} onSet={(v) => setRun(at.qi, from, [v])} />
        </div>
      );
    }
    if (ui?.k === "fill" && fit.has("b")) {
      bi += p.boxes?.length ?? 0;
      return null;
    }
    return (
      <div class="f-part" key={pi} slot={sl(pi)}>
        {p.p && <span class="f-plabel">({p.p})</span>}
        {p.boxes ? (
          <div class="f-boxes">
            {p.boxes.map((b) => {
              const i = bi++;
              const v = val(at.qi, i);
              // A word or a name: his phone's own keyboard, in the box itself.
              if (b.k === "text") return <WordBox key={i} box={b} v={v} on={at.bi === i} onFocus={() => setAt({ qi: at.qi, bi: i })} onSet={(x) => set(at.qi, i, x)} />;
              const on = at.bi === i && !lock;
              return (
                <Fragment key={i}>
                  {b.j && (
                    <span class="f-bjoin" aria-hidden="true">
                      {b.j}
                    </span>
                  )}
                  <button
                    type="button"
                    class={`f-box${on ? " on" : ""}${b.k === "expr" ? " x" : ""}${v ? " has" : ""}${b.f ? " frac" : ""}${lock && marks[i] !== null ? (marks[i] ? " ok" : " no") : ""}`}
                    onClick={() => !lock && setAt({ qi: at.qi, bi: i })}
                    aria-label={`${b.l ?? ""} answer ${i + 1}${b.u ? ` (${b.u})` : ""}`}
                  >
                    {b.l && (
                      <span class="f-blabel">
                        <Maths s={b.l} />
                      </span>
                    )}
                    <span class="f-bline">
                      {b.f ? (
                        <FracCells f={b.f} v={v} on={on ? (at.ci ?? 0) : -1} onCell={(c) => !lock && setAt({ qi: at.qi, bi: i, ci: c })} />
                      ) : (
                        <span key={on ? v.length : 0} class={v ? `f-bval${on ? " typed" : ""}` : "f-bval empty"}>
                          {v ? <Maths s={v} /> : "?"}
                        </span>
                      )}
                      {b.u && <span class="f-bunit">{b.u}</span>}
                    </span>
                  </button>
                </Fragment>
              );
            })}
          </div>
        ) : (
          <div class="f-teachq">
            <p class="f-teach">
              <Icon name="pen" size={16} /> {props.n > 0 ? "இதைத் தாளில் செய்து படம் எடு: உன் ஆசிரியர் திருத்துவார்" : "இதைத் தாளில் செய்: வகுப்பில் ஆசிரியர் திருத்துவார்"}
            </p>
            {props.n > 0 && <Taker unitId={props.world.unitId} n={props.n} q={q.q} kind="part" send={false} />}
          </div>
        )}
      </div>
    );
  });

  // The owl beside him: what it does and says now (Tamil: its voice).
  const lv = lock ? verdictOf(lock) : null;
  const half = form.qs.length >= 6 && at.qi === Math.floor(form.qs.length / 2);
  const pose: Pose =
    idle === 2 ? "sleep" : idle === 1 ? "think" : learning ? "teach" : q.free ? "yes" : lv === "ok" ? "yes" : lv ? "again" : each && run >= 3 ? "combo" : at.qi === 0 && done === 0 ? "hello" : "write";
  const say =
    idle === 2
      ? "தூக்கம் வருகிறது… என்னைத் தொட்டு எழுப்பு!"
      : idle === 1
        ? "நேரம் எடு. தாளில் செய்து பார்."
        : learning
          ? "படிப்படியாகப் பார்: பிறகு நீயே செய்."
          : asking
            ? "இது ஆசிரியர் கேள்வி."
            : q.free
              ? "இது உனக்கு இலவசம்!"
              : lv === "ok"
                ? "இதைச் சரியாகச் செய்தாய்!"
                : lv
                  ? "இது முடிந்தது. அடுத்ததைப் பார்."
                  : q.re
                    ? "இது மீண்டும் வந்தது: இப்போது வெல்!"
                    : at.qi === 0 && done === 0
                      ? "தொடங்குவோம்! தாளில் செய்து, விடையை இங்கே போடு."
                      : each && run >= 2
                        ? `${run} சரி தொடர்ச்சியாக! அப்படியே தொடர்.`
                        : at.qi === form.qs.length - 1 && form.qs.length > 1
                          ? "கடைசிக் கேள்வி! முடித்துவிடு."
                          : half
                            ? each && bank > 0
                              ? `பாதி முடிந்தது! இதுவரை ${bank} XP.`
                              : "பாதி முடிந்தது! அப்படியே தொடர்."
                            : "தாளில் செய்து, விடையை இங்கே போடு.";
  // The answer he just got (the sheet over the pad).
  const vl = verdict ? locks[verdict.q] : undefined;
  const vq = verdict ? form.qs.find((x) => x.q === verdict.q) : undefined;
  const vk = vl ? verdictOf(vl) : null;
  // A wrong one comes back two levels on, when the Stage has such a level (convex/lib/family.ts retryPool).
  const later = !!vq && !vq.re && form.n > 0 && props.world.levels.some((l) => l.n >= form.n + 2);
  const vxp = !vl || !vq ? 0 : vq.re ? (vk === "ok" ? (vq.rb ?? 0) : 0) : (vl.got ?? vl.phoneGot);
  const step = steps ? (story ? ("story" as const) : stepNow) : undefined;
  return (
    <div class={`f-play v2${showQ ? " withq" : ""}${review ? " rev" : ""}${box?.k === "expr" ? ` xpad${box.eq || (box.p && box.v) ? " eqpad" : ""}` : ""}${!review && !pad ? " nopad" : ""}`}>
      <header class="f-ptop">
        <button type="button" class="f-round" aria-label="Back" onClick={props.onBack}>
          <Icon name="close" size={20} />
        </button>
        <button type="button" class="f-pips" aria-label={`${done} of ${all.length} answered`} onClick={() => setList(!list)}>
          {form.qs.map((x, qi) => (
            <i key={x.q} class={`${stateOf(qi)}${qi === at.qi && !review ? " on" : ""}`} />
          ))}
        </button>
        {each && (
          <span class="f-bank up" key={bank} aria-label={`${bank} XP in this level`}>
            <Gem size={16} /> {bank}
          </span>
        )}
      </header>
      <div class="f-prow">
        <p class="f-kicker">
          Stage {form.no} · {lvName(form)}
        </p>
        <button type="button" class={`f-qcount${list ? " on" : ""}`} aria-label="Questions" aria-expanded={list} onClick={() => setList(!list)}>
          {Math.min(at.qi + 1, form.qs.length)} / {form.qs.length} <Icon name="next" size={12} />
        </button>
        {props.look ? (
          <span class="f-checkpill">Preview</span>
        ) : each ? null : (
          <button type="button" class="f-checkpill" onClick={() => setReview(true)}>
            Check
          </button>
        )}
      </div>
      <div class={`f-strip${list ? " open" : ""}`} ref={strip}>
        {form.qs.map((x, qi) => (
          <button
            type="button"
            key={x.q}
            class={`f-qchip ${stateOf(qi)}${qi === at.qi && !review ? " on" : ""}${x.re ? " re" : ""}${x.t ? " tq" : ""}`}
            aria-label={x.re ? `Q${x.q} again` : undefined}
            onClick={() => {
              buzz();
              act();
              setReview(false);
              setList(false);
              setAt({ qi, bi: startOf(qi) });
            }}
          >
            {x.re ? `↻${x.q}` : x.q}
          </button>
        ))}
        {each && !review && (
          <button
            type="button"
            class="f-checkpill"
            onClick={() => {
              setList(false);
              setReview(true);
            }}
          >
            Finish
          </button>
        )}
      </div>

      {review ? (
        <section class="f-card rise f-review">
          <OwlBadge mood="think" class="mid" />
          <h2 class="f-h2">{lvName(form)} சரிபார்க்கவா?</h2>
          <ul class="f-sum">
            <li>
              <b>{done}</b> விடைகள் போட்டாய்
            </li>
            {lockedQs > 0 && (
              <li>
                <b>{lockedQs}</b> கேள்விகளை ஏற்கனவே சரிபார்த்தாய் ✓
              </li>
            )}
            {empty > 0 && (
              <li class="warn">
                <b>{empty}</b> காலியாக உள்ளன (அவை ✗)
              </li>
            )}
            {backQs > 0 && (
              <li>
                <b>↻ {backQs}</b> பழைய கேள்விகள் மீண்டும்
              </li>
            )}
            {teacherQs > 0 && (
              <li class="teach">
                <b>{teacherQs}</b> கேள்விகளை ஆசிரியர் திருத்துவார் ✍
              </li>
            )}
            {freeQs.length > 0 && (
              <li class="free">
                <b>🎁 {freeQs.length}</b> இலவசப் புள்ளிகள் (+{freeQs.reduce((a, x) => a + x.max, 0)} XP)
              </li>
            )}
          </ul>
          {props.look ? (
            <p class="f-muted small">Preview: Check is off. Nothing is sent or saved.</p>
          ) : (
            <>
              <p class="f-muted small">Check செய்த பின் விடைகளை மாற்ற முடியாது.</p>
              <button type="button" class="f-btn gold big shine" disabled={busy} onClick={() => void check()}>
                {busy ? "…" : "Check ✓"}
              </button>
            </>
          )}
          <button type="button" class="f-btn ghost" disabled={busy} onClick={() => setReview(false)}>
            Look again
          </button>
        </section>
      ) : (
        <>
          <div class="f-lvcoach">
            <span
              class="tap"
              role="button"
              aria-label="The owl"
              onClick={() => {
                act();
                buzz(8);
                sound("pop");
              }}
            >
              <Buddy pose={pose} key={pose} class="coach" />
            </span>
            <p class="f-bubble f-lvsay" key={say}>
              {say}
            </p>
          </div>
          <section
            class={`f-card f-qcard slide${lock ? " locked" : ""}`}
            key={q.q}
            onTouchStart={(e) => {
              const t = e.touches[0];
              // A swipe across the question moves between its steps (never from his cards, boxes or buttons).
              swipe.current = steps && t && !(e.target instanceof Element && e.target.closest(".f-part, button, input, textarea")) ? { x: t.clientX, y: t.clientY } : null;
            }}
            onTouchEnd={(e) => {
              const from = swipe.current;
              const t = e.changedTouches[0];
              swipe.current = null;
              if (!from || !t) return;
              const dx = t.clientX - from.x;
              if (Math.abs(dx) > 70 && Math.abs(t.clientY - from.y) < 40) goStep(stepNow + (dx < 0 ? 1 : -1));
            }}
          >
            <div class="f-qhead">
              <b class="f-qn">Q{q.q}</b>
              <span class="f-kind">{ASK[askOf(steps ? stepParts(stepNow) : q.parts)]}</span>
              <span class="f-qtools">
                {printed && css !== null && (
                  <button type="button" class="f-zoombtn" aria-label={`Zoom Q${q.q}`} onClick={zoom}>
                    <Icon name="zoom" size={19} />
                  </button>
                )}
                {q.re ? (
                  <span class="f-xpchip re">↻ +{q.rb} XP</span>
                ) : (
                  <span class="f-xpchip">
                    <Gem size={15} /> {q.max} XP
                  </span>
                )}
              </span>
            </div>
            {steps && (
              <div class="f-stepper" role="tablist" aria-label="Parts">
                {Array.from({ length: steps.n }, (_, k) => {
                  const name = (labels[steps.of.indexOf(k)] ?? "").split(" · ")[0].trim();
                  return (
                    <button type="button" role="tab" key={k} aria-selected={k === stepNow} aria-label={`Part ${name || k + 1}`} class={`f-stp ${stepState(k)}${k === stepNow ? " now" : ""}`} onClick={() => goStep(k)}>
                      <b>{name && name.length <= 5 ? name : k + 1}</b>
                    </button>
                  );
                })}
              </div>
            )}
            {steps && (stepNow > 0 || story) && (steps.story || steps.fig) && (
              <button type="button" class={`f-story${story ? " open" : ""}`} aria-expanded={story} onClick={() => (act(), setStory(!story))}>
                <Icon name="eye" size={17} />
                <span>{story ? "மூடு: கேள்விக்குத் திரும்பு" : steps.story || "படத்தைப் பார்"}</span>
                <Icon name="next" size={14} class="dn" />
              </button>
            )}
            {q.re && <p class="f-again">Level {q.re} இல் தவறியது: மீண்டும் முயற்சி!</p>}
            {q.t && <p class="f-tqtag">ஆசிரியர் கேள்வி · with your teacher</p>}
            {q.free && <FreeCard max={q.max} />}
            {/* A free question isn't his to do: only the owner's Preview still shows it (to see what he made free). */}
            {showQ &&
              (!q.free || props.look) &&
              (printed && css !== null ? (
                <Paper key={step ?? "all"} html={printed.html} css={css} q={q.q} onZoom={zoom} live={live} parts={inPaper ? labels : undefined} step={step} back={stepBack}>
                  {inPaper && rows}
                </Paper>
              ) : (
                <p class="f-paper-note">
                  {qs.failed ? "இணையம் இல்லை: கேள்வியைக் கொண்டுவர முடியவில்லை." : qs.got ? "இந்தக் கேள்வி இன்னும் phone இல் இல்லை." : "கேள்வி வருகிறது…"}
                </p>
              ))}
            {asking ? (
              <div class="f-teachask rise">
                <p>இந்தக் கேள்வியை உன் ஆசிரியருடன் செய்தாயா?</p>
                <button type="button" class="f-btn go" onClick={() => pick(q.q, "do")}>
                  ஆம்: விடை எழுதுகிறேன்
                </button>
                <button type="button" class="f-btn gold" onClick={() => pick(q.q, "learn")}>
                  <Icon name="bulb" size={17} /> இல்லை: கற்றுக்கொள்
                </button>
              </div>
            ) : learning ? (
              <Learn unitId={props.world.unitId} n={props.n} q={q.q} onDone={() => pick(q.q, "do")} />
            ) : null}
            {!inPaper && rows}
            {props.look && <FreeSwitch key={q.q} unitId={form.unitId} q={q.q} max={q.max} free={!!q.free} onDone={() => setVer((x) => x + 1)} />}
          </section>
        </>
      )}

      {pad && <Pad box={box ?? all.find((x) => x.qi === at.qi && typing(x.box))?.box ?? null} onKey={onKey} last={flat === all.length - 1} go={go} />}
      {!review && !asking && !learning && !pad && <NextBar onNext={goNext} last={at.qi === form.qs.length - 1} go={go} />}
      {verdict && vl && vk && (
        <>
          <div class="f-vdim" />
          <section class={`f-verdict ${vk}`} role="status" aria-label={vk === "ok" ? "Right" : vk === "no" ? "Not right" : vk === "pt" ? "Partly right" : "Your teacher marks it"}>
            <Buddy pose={vk === "ok" ? (verdict.run >= 3 ? "combo" : "yes") : vk === "teach" ? "write" : vk === "pt" ? "again" : "oops"} class="fbowl" />
            <h2>
              <span class="f-vmark">{vk === "ok" ? <Icon name="check" size={20} /> : vk === "no" ? "✗" : vk === "pt" ? "½" : <Icon name="pen" size={18} />}</span>
              {vk === "ok" ? (vq?.re ? "வென்றுவிட்டாய்!" : "சரியான விடை!") : vk === "no" ? "பரவாயில்லை!" : vk === "pt" ? "பாதி சரி!" : "ஆசிரியர் திருத்துவார்"}
            </h2>
            <p>
              {vk === "ok"
                ? vq?.re
                  ? "பழைய கேள்வியை இப்போது சரியாகச் செய்தாய்."
                  : verdict.run >= 2
                    ? `${verdict.run} சரி தொடர்ச்சியாக. அப்படியே தொடர்!`
                    : "அருமை! அப்படியே தொடர்."
                : vk === "teach"
                  ? vl.phoneGot > 0
                    ? `இப்போது ${vl.phoneGot} XP. மீதியை உன் ஆசிரியர் திருத்துவார்.`
                    : "இதை உன் ஆசிரியர் திருத்துவார்."
                  : `${vk === "pt" ? `${vl.got} / ${vl.max}. ` : "இந்த விடை சரியில்லை. "}${later ? "இது பின்னர் மீண்டும் வரும்: அப்போது வெல்!" : "வகுப்பில் ஆசிரியர் விளக்குவார்."}`}
            </p>
            <div class="f-vchips">
              {vxp > 0 && (
                <span class="f-vchip xp">
                  <Gem size={15} /> +{vxp} XP
                </span>
              )}
              {vk === "ok" && verdict.run >= 2 && <span class="f-vchip row">{verdict.run} IN A ROW</span>}
              {(vk === "no" || vk === "pt") && later && <span class="f-vchip back">↻ மீண்டும் வரும்</span>}
            </div>
            <button
              type="button"
              class="f-btn big go"
              onClick={() => {
                act();
                buzz();
                setVerdict(null);
                nextQ();
              }}
            >
              Continue
            </button>
          </section>
        </>
      )}
    </div>
  );
}

/** Learn (4 Nov 2026): a teacher question's worked solution, one step a tap, then he does it himself. */
function Learn(props: { unitId: string; n: number; q: number; onDone: () => void }) {
  const [steps, setSteps] = useState<string[] | null>(null);
  const [bad, setBad] = useState(false);
  const [i, setI] = useState(1);
  useEffect(() => {
    query("family:learn", { unitId: props.unitId, n: props.n, q: props.q })
      .then((r) => setSteps((r as { steps: string[] }).steps))
      .catch(() => setBad(true));
  }, [props.q]);
  if (bad || (steps && steps.length === 0)) {
    return (
      <div class="f-learn">
        <p class="f-paper-note">{bad ? "இணையம் இல்லை: தீர்வைக் கொண்டுவர முடியவில்லை." : "இந்தக் கேள்விக்குத் தீர்வு இன்னும் app இல் இல்லை: வகுப்பில் கேள்."}</p>
        <button type="button" class="f-btn go" onClick={props.onDone}>
          நானே முயல்கிறேன் ✍
        </button>
      </div>
    );
  }
  if (!steps) return <p class="f-paper-note">தீர்வு வருகிறது…</p>;
  const last = i >= steps.length;
  return (
    <div class="f-learn">
      <span class="f-sol-h">
        <Icon name="bulb" size={15} /> இப்படிச் செய்வது
      </span>
      <ol class="f-steps">
        {steps.slice(0, i).map((line, k) => (
          <li key={k} class={k === i - 1 ? "rise" : ""}>
            {line.split("**").map((r, j) => (j % 2 ? <b key={j}><Maths s={r} /></b> : <span key={j}>{r}</span>))}
          </li>
        ))}
      </ol>
      {last ? (
        <button type="button" class="f-btn gold shine" onClick={props.onDone}>
          இப்போது நீயே செய் ✍
        </button>
      ) : (
        <button
          type="button"
          class="f-btn go"
          onClick={() => {
            buzz();
            sound("tap");
            setI(i + 1);
          }}
        >
          அடுத்த படி ▸ <small>
            {i}/{steps.length}
          </small>
        </button>
      )}
    </div>
  );
}

function Oops(props: { text: string; onBack: () => void }) {
  return (
    <div class="f-center f-pad">
      <Owl mood="dizzy" class="mid" />
      <p class="f-lead">{props.text}</p>
      <button type="button" class="f-btn go" onClick={props.onBack}>
        Back
      </button>
    </div>
  );
}

// ---- Free marks (5 Nov 2026, his ask: a question out of the syllabus stays in the book, everyone gets its marks) ----

/** A free question: a little party instead of the question, its marks his without doing it; → goes on. */
function FreeCard(props: { max: number }) {
  useEffect(() => {
    sound("unlock");
    buzz(8);
  }, []);
  return (
    <div class="f-free rise" role="status">
      <Confetti n={14} />
      <span class="f-free-gift" aria-hidden="true">
        🎁
      </span>
      <b class="f-free-h">இலவசப் புள்ளிகள்!</b>
      <p>
        இந்தக் கேள்வி உன் பாடத்திட்டத்தில் இல்லை. இதைச் செய்ய வேண்டாம்: இதன் <b>{props.max} XP</b> உனக்கே. → அடுத்த கேள்வி.
      </p>
    </div>
  );
}

/**
 * The owner's switch in his Preview (his ask: "please put the button ... so that question will be all marks question
 * for everyone"): free marks for this question, or not any more. Every student at once (convex/preview.ts `setFree`),
 * so it asks once more before it goes.
 */
function FreeSwitch(props: { unitId: string; q: number; max: number; free: boolean; onDone: () => void }) {
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      const r = (await mutation("preview:setFree", { unitId: props.unitId, q: props.q, free: !props.free })) as { students: number };
      const who = r.students ? ` ${r.students} student${r.students === 1 ? "" : "s"} who did this level ${props.free ? "lost them" : "got them now"}.` : "";
      toast(props.free ? `Q${props.q} is a normal question again.${who}` : `Q${props.q}: free marks for everyone (${props.max}).${who}`);
      setSure(false);
      props.onDone();
    } catch (e) {
      toast(problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class={`f-freesw${props.free ? " on" : ""}`}>
      {!sure ? (
        <>
          <p>{props.free ? `Free marks: every student gets Q${props.q}'s ${props.max} marks.` : "Out of the syllabus? Give everyone its marks."}</p>
          <button type="button" class="f-btn ghost" onClick={() => setSure(true)}>
            {props.free ? "Take back the free marks" : `🎁 Free marks for everyone (${props.max})`}
          </button>
        </>
      ) : (
        <>
          <p>
            {props.free
              ? `Q${props.q} becomes a question to do again. Students who already got its free marks lose them.`
              : `Every student gets Q${props.q}'s ${props.max} marks without doing it, also the ones who did this level already.`}
          </p>
          <div class="f-freesw-row">
            <button type="button" class="f-btn ghost" disabled={busy} onClick={() => setSure(false)}>
              Cancel
            </button>
            <button type="button" class={`f-btn ${props.free ? "white" : "gold"}`} disabled={busy} onClick={() => void go()}>
              {busy ? "…" : props.free ? "Yes, take them back" : "Yes, free marks"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ---- The reveal ----

type RowKind = "ok" | "part" | "bad" | "teach";
const kindOf = (r: FamilyResult): RowKind => (r.got === null ? "teach" : r.got === r.max ? "ok" : r.got > 0 ? "part" : "bad");

/** No waiting in tests or for "reduce motion": everything at once. */
const instant = () =>
  (typeof navigator !== "undefined" && navigator.webdriver === true) ||
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/** The score ring round the owl: its radius and length. */
const RING_R = 54;
const RING_C = Math.round(2 * Math.PI * RING_R * 100) / 100;


export function Result(props: {
  world: World;
  form: FamilyLevel;
  res: Checked;
  typed: Record<number, string[]>;
  /** Before this level: his trophies and his streak. */
  before: { trophies: Trophy[]; days: number; today: boolean; best: number };
  me: FamilyMe | null;
  onStage: () => void;
  onNext: (n: number) => void;
}) {
  const { res, form, before } = props;
  const rows = res.results;
  const [shown, setShown] = useState(() => (instant() || res.seen ? rows.length : 0));
  const done = shown >= rows.length;
  const pct = res.phoneMax ? res.got / res.phoneMax : 0;
  const fresh = (res.trophies ?? []).filter((t) => !before.trophies.includes(t));
  const lit = !before.today && res.streak.today;
  const best = res.streak.days > before.best && res.streak.days > 1;

  // Each answer's run of right ones (a question the teacher marks keeps the run going).
  const runs = useMemo(() => {
    let run = 0;
    return rows.map((r) => {
      const k = kindOf(r);
      if (k === "ok") run++;
      else if (k !== "teach") run = 0;
      return run;
    });
  }, [rows]);
  const topRun = Math.max(0, ...runs);
  const runNow = shown > 0 ? runs[shown - 1] : 0;
  const score = rows.slice(0, shown).reduce((s, r) => s + (r.got ?? 0), 0);

  // One answer at a time, each with its sound; then the finale.
  useEffect(() => {
    if (done) return;
    const t = window.setTimeout(
      () => {
        const r = rows[shown];
        const k = kindOf(r);
        if (k === "ok") sound("right", runs[shown] - 1);
        else if (k === "bad") sound("wrong");
        else sound("pop");
        if (k === "ok") buzz(6);
        setShown(shown + 1);
      },
      shown === 0 ? 700 : 380,
    );
    return () => window.clearTimeout(t);
  }, [shown]);
  useEffect(() => {
    if (!done) return;
    const ts: number[] = [];
    const later = (ms: number, f: () => void) => ts.push(window.setTimeout(f, ms));
    later(instant() ? 0 : 250, () => sound(pct >= 1 ? "perfect" : "level"));
    let at = 1300;
    if (fresh.length) {
      later(at, () => sound("trophy"));
      at += 1300;
    }
    if (lit) later(at, () => sound("streak"));
    return () => ts.forEach((x) => window.clearTimeout(x));
  }, [done]);

  // The owl's words (Tamil: its voice), by the score.
  const cheer = pct >= 1 ? "எல்லாம் சரி!" : pct >= 0.9 ? "அருமை!" : pct >= 0.7 ? "நன்று!" : pct >= 0.5 ? "நல்ல முயற்சி!" : "தொடர்ந்து முயற்சி செய்!";
  // The owl acts the score (stars for every mark, a party, a happy hop, a headband to keep going), then flexes a medal
  // when a trophy comes; tap it for more.
  const [medal, setMedal] = useState(false);
  useEffect(() => {
    if (!done || !fresh.length) return;
    const id = window.setTimeout(() => setMedal(true), instant() ? 0 : 1400);
    return () => window.clearTimeout(id);
  }, [done]);
  const mood: Mood = !done ? "think" : medal ? "champ" : pct >= 1 ? "star" : pct >= 0.9 ? "party" : pct >= 0.7 ? "cheer" : "strong";
  const [owlMood, tapOwl] = useOwlTap(mood);
  const next = nextPlay(props.me);
  const nextHere = next && next.world.unitId === props.world.unitId && next.n !== form.n && form.n !== 0 ? next : null;
  // The ring round the owl fills as his marks come in.
  const ringK = res.phoneMax ? (done ? res.got : score) / res.phoneMax : 0;
  return (
    <div class={`f-result${done ? " done" : ""}`} onClick={() => !done && setShown(rows.length)}>
      <p class="f-kicker f-center-t">
        Stage {form.no} · {lvName(form)}
      </p>
      <section class={`f-score${done ? " done" : ""}${done && pct >= 0.7 ? " glow" : ""}`}>
        {done && pct >= 0.7 && <Confetti n={pct >= 0.9 ? 18 : 12} />}
        <div class={`f-ring${done && pct >= 1 ? " full" : ""}`}>
          <svg class="f-ring-s" viewBox="0 0 120 120" aria-hidden="true">
            <circle class="f-ring-t" cx="60" cy="60" r={RING_R} />
            <circle class="f-ring-p" cx="60" cy="60" r={RING_R} stroke-dasharray={RING_C} stroke-dashoffset={RING_C * (1 - Math.min(1, ringK))} />
          </svg>
          <span
            class="tap"
            onClick={(e) => {
              if (!done) return;
              e.stopPropagation();
              tapOwl();
            }}
          >
            <Owl mood={owlMood} key={owlMood} />
          </span>
        </div>
        <h1 class="f-cheer" key={done ? "done" : "wait"}>
          {done ? cheer : "பார்ப்போம்…"}
        </h1>
        <p class="f-big">
          <b key={done ? "done" : score} class={score > 0 || done ? "bump" : ""}>
            {done ? res.got : score}
          </b>
          <small> / {res.phoneMax}</small>
        </p>
        <div class="f-runbox">
          {(done ? topRun : runNow) >= 2 && (
            <Tag tone="gold" class="f-run" key={done ? "top" : runNow}>
              {done ? topRun : runNow} in a row!
            </Tag>
          )}
        </div>
        {done ? (
          <p class="f-gain rise">
            <span class="f-pill gem">
              <Gem size={17} /> +{form.n === 0 ? res.bonus ?? 0 : res.got + (res.bonus ?? 0)} XP
            </span>
            <span class={`f-pill fire${res.streak.today ? " lit" : ""}${lit ? " pop" : ""}`}>
              <Flame lit={res.streak.today} size={17} /> {res.streak.days} {res.streak.days === 1 ? "day" : "days"}
            </span>
          </p>
        ) : (
          <p class="f-gain wait" aria-hidden="true" />
        )}
        {done && best && (
          <Tag tone="gold" class="f-pb">
            PERSONAL BEST
          </Tag>
        )}
        {res.teacher.length > 0 && (
          <p class="f-teach">
            <Icon name="pen" size={16} /> {res.teacher.map((q) => `Q${q}`).join(", ")}: ஆசிரியர் திருத்துவார்
          </p>
        )}
      </section>
      {done && lit && (
        <section class="f-streakup rise">
          <Flame lit size={44} />
          <div>
            <b>
              <Roll from={before.days} to={res.streak.days} />
              <em>{res.streak.days === 1 ? "day streak" : "days in a row"}</em>
            </b>
            <small>{res.streak.days === 1 ? "தீ மூண்டது! நாளையும் ஒரு Level செய்து இதை வளர்." : "நாளையும் வா: தீ அணையாமல் பார்."}</small>
          </div>
        </section>
      )}
      {done && fresh.length > 0 && (
        <section class="f-newcup rise">
          <h2>NEW TROPHY!</h2>
          <div class="f-medals">
            {fresh.map((t) => (
              <Medal key={t} t={t} won fresh />
            ))}
          </div>
        </section>
      )}
      {done && (res.retry?.length ?? 0) > 0 && (
        <p class="f-backres rise">
          ↻ பழைய கேள்விகள் {res.retry.filter((r) => r.got >= r.max).length}/{res.retry.length}
          {res.bonus > 0 && <b> · +{res.bonus} XP</b>}
        </p>
      )}
      <ul class="f-res">
        {rows.map((r, i) => {
          const fq = form.qs.find((x) => x.q === r.q);
          const k = kindOf(r);
          return (
            <li key={r.q} class={`f-rrow ${k}${i < shown ? " in" : ""}`}>
              <b class="f-rq">Q{r.q}</b>
              <span class="f-rmarks">
                {r.free && (
                  <i class="g" title="இலவசப் புள்ளிகள்">
                    🎁
                  </i>
                )}
                {r.ok.map((part, pi) =>
                  part === null ? (
                    <i key={pi} class="t">
                      ✍
                    </i>
                  ) : fq?.parts[pi]?.ui?.k === "mark" || fq?.parts[pi]?.ui?.k === "why" ? (
                    <i key={pi} class={part.every(Boolean) ? "y" : "n"}>
                      {part.every(Boolean) ? "✓" : "✗"}
                    </i>
                  ) : (
                    part.map((g, bi) => (
                      <i
                        key={`${pi}.${bi}`}
                        class={g ? "y" : "n"}
                        title={fq?.parts[pi]?.ui && fq.parts[pi].ui!.k !== "fill" ? undefined : pretty((props.typed[r.q] ?? [])[fq ? fq.parts.slice(0, pi).reduce((s, p) => s + (p.boxes?.length ?? 0), 0) + bi : bi] ?? "")}
                      >
                        {g ? "✓" : "✗"}
                      </i>
                    ))
                  ),
                )}
              </span>
              <small class="f-rgot">{r.got !== null ? `${r.got}/${r.max}` : `${r.phoneGot} + ✍`}</small>
            </li>
          );
        })}
      </ul>
      {done && (
        <>
          {form.n === 0 ? (
            // The redo (10 Nov 2026): right = half its marks and explained; wrong = the teacher explains it in class.
            <p class="f-tip rise">✓ சரியானவை: பாதிப் புள்ளிகள், விளக்கம் தேவையில்லை. ✗ தவறியவற்றை வகுப்பில் ஆசிரியர் விளக்குவார். தீர்வுகள் அந்த Level இல்.</p>
          ) : form.n < 0 ? (
            <p class="f-tip rise">✎ உன் தாளிலும் ✓ ✗ போடு. தவறியவற்றை வகுப்பில் ஆசிரியர் விளக்குவார்.</p>
          ) : (
            <>
              <p class="f-tip rise">✎ உன் தாளிலும் ✓ ✗ போடு. தவறியவற்றின் தீர்வு கீழே.</p>
              <Book unitId={props.world.unitId} n={form.n} initial={res.book} />
            </>
          )}
          <div class={`f-actions rise${nextHere ? " two" : ""}`}>
            {nextHere ? (
              <>
                <button type="button" class="f-btn ghost f-act-map" aria-label={`Stage ${form.no}`} onClick={props.onStage}>
                  <Icon name="map" size={22} />
                </button>
                <button type="button" class="f-btn gold big shine" onClick={() => props.onNext(nextHere.n)}>
                  Next: Level {nextHere.d} <Icon name="play" size={16} class="fill" />
                </button>
              </>
            ) : (
              <button type="button" class="f-btn go big" onClick={props.onStage}>
                <Icon name="map" size={19} /> Stage {form.no}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
