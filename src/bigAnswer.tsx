// The answer on Correction's card, big (2 Nov 2026, his ask): the final answer is the largest thing on the card, as
// large as fits its width (one line when it can, never split beside = + − × ÷), fractions stacked as students write
// them, the working small above it. What the key text means is in src/answerText.ts.

import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { glue, mathPieces, shownLines, type Seg } from "./answerText";

/** One run of key text: stacked fractions and raised powers; `big` = no break inside an expression. */
export function MathText(props: { t: string; big?: boolean }) {
  return (
    <>
      {mathPieces(props.big ? glue(props.t) : props.t).map((p, i) =>
        p.k === "t" ? (
          p.t
        ) : p.k === "sup" ? (
          <sup key={i}>{p.t}</sup>
        ) : (
          <span key={i} class="ka-f" role="math" aria-label={`${p.n} over ${p.d}`}>
            <i>{p.n}</i>
            <i>{p.d}</i>
          </span>
        ),
      )}
    </>
  );
}

function Segs(props: { segs: Seg[]; big: boolean }) {
  return (
    <>
      {props.segs.map((s, i) =>
        s.b || !props.big ? (
          <MathText key={i} t={s.t} big={props.big} />
        ) : (
          // A plain word inside the answer line ("x = " before **3**): small, so the answer stands out.
          <span key={i} class="ka-s">
            <MathText t={s.t} />
          </span>
        ),
      )}
    </>
  );
}

/** Sizes tried, biggest first: [font px, lines it may take]. One line down to 32 px, then two, then three. */
const LADDER: [number, number][] = [
  [64, 1],
  [56, 1],
  [50, 1],
  [44, 1],
  [40, 1],
  [36, 1],
  [32, 1],
  [32, 2],
  [28, 2],
  [25, 2],
  [22, 3],
  [20, 3],
  [18, 4],
];

/** Does this answer line fit its box in `lines` lines at the size set now? */
function fits(el: HTMLElement, lines: number): boolean {
  el.style.whiteSpace = "nowrap";
  const one = el.getBoundingClientRect().height;
  const wide = el.scrollWidth > el.clientWidth + 1;
  el.style.whiteSpace = "";
  if (!wide) return true;
  if (lines === 1) return false;
  if (el.scrollWidth > el.clientWidth + 1) return false; // one piece wider than the card even on its own line
  return el.getBoundingClientRect().height <= one * lines + 2;
}

/** The biggest size where every answer line fits and the answers together stay under maxH px. */
function fitAnswer(box: HTMLElement, max: number, maxH: number) {
  const heroes = [...box.querySelectorAll<HTMLElement>(".ka-h")];
  box.classList.remove("ka-tight");
  if (!heroes.length || box.clientWidth === 0) return;
  for (const [px, lines] of LADDER) {
    if (px > max) continue;
    box.style.fontSize = `${px}px`;
    const tall = heroes.reduce((a, h) => a + h.getBoundingClientRect().height, 0);
    if (tall <= maxH && heroes.every((h) => fits(h, lines))) return;
  }
  box.classList.add("ka-tight"); // the smallest size; a very long piece may break anywhere
}

/**
 * The answer: its lines as the key gives them, the final answer big (fitted), working small. `max` = the biggest
 * size (a part's answer is smaller than a question's), `maxH` = the most height all its answer lines may take.
 */
export function BigAnswer(props: { text: string; max?: number; maxH?: number; label?: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // A short phone (iPhone 7, 360 × 640) keeps the whole card above the pad: a smaller top size.
  const short = typeof window !== "undefined" && window.innerHeight < 700;
  const max = Math.round((props.max ?? 64) * (short ? 0.75 : 1));
  const maxH = Math.round((props.maxH ?? 150) * (short ? 0.7 : 1));
  const lines = shownLines(props.text);

  useLayoutEffect(() => {
    if (box.current) fitAnswer(box.current, max, maxH);
  }, [props.text, max, maxH, width]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver !== "function") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div class="ka" ref={box}>
      {props.label}
      {lines.map((l, i) =>
        l.kind === "work" ? (
          <p key={i} class="ka-w">
            <Segs segs={l.segs} big={false} />
          </p>
        ) : (
          <p key={i} class="ka-h">
            <Segs segs={l.segs} big />
          </p>
        ),
      )}
    </div>
  );
}
