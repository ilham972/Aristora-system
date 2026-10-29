// One row that scrolls sideways (Correction: the names, the level bar, the questions). Nothing wraps to a second line,
// so every button below stays in its place. The open one keeps itself in the middle (what comes next is always in
// view, without a swipe); faded edges say there is more; a red or amber dot on an edge says someone who needs the
// corrector is hidden that way.

import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

export type EdgeTone = "red" | "amber";
export type Edges = { l: boolean; r: boolean; ul: EdgeTone | null; ur: EdgeTone | null };

const NONE: Edges = { l: false, r: false, ul: null, ur: null };
/** The faded edge, px (as in styles.css). */
const FADE = 26;

/**
 * What is hidden on each side of a row showing [from, to] of its `width` px: more items at all, and the most urgent
 * item hidden there (one whose middle is out of view, or under the faded edge).
 */
export function edgesOf(from: number, to: number, width: number, items: { a: number; b: number; u: EdgeTone | null }[]): Edges {
  const e: Edges = { l: from > 1, r: to < width - 1, ul: null, ur: null };
  const worse = (x: EdgeTone | null, y: EdgeTone): EdgeTone => (x === "red" || y === "red" ? "red" : "amber");
  for (const it of items) {
    if (!it.u) continue;
    const mid = (it.a + it.b) / 2;
    if (e.l && mid < from + FADE / 2) e.ul = worse(e.ul, it.u);
    else if (e.r && mid > to - FADE / 2) e.ur = worse(e.ur, it.u);
  }
  return e;
}

/** Where to scroll so `a..b` sits in the middle of a row `view` px wide (never past either end). */
export function centreOf(a: number, b: number, view: number, width: number): number {
  const left = (a + b) / 2 - view / 2;
  return Math.round(Math.max(0, Math.min(width - view, left)));
}

export function HRow(props: {
  as?: "nav" | "ol" | "div";
  class: string;
  label?: string;
  /** A different list (another grade, student or level): back to its start, or to the open item. */
  list: unknown;
  /** The open item changed: the one marked `.on` comes to the middle (nothing open: the row stays where it is). */
  at: unknown;
  /** A new list with nothing open shows its end instead of its start (the levels of a finished unit). */
  idle?: "start" | "end";
  children: ComponentChildren;
}) {
  const box = useRef<HTMLElement>(null);
  const first = useRef(true);
  const lastList = useRef<unknown>(undefined);
  const [edges, setEdges] = useState<Edges>(NONE);

  const measure = () => {
    const el = box.current;
    if (!el) return;
    const r0 = el.getBoundingClientRect();
    const items = Array.from(el.querySelectorAll<HTMLElement>("[data-u]")).map((x) => {
      const r = x.getBoundingClientRect();
      const a = r.left - r0.left + el.scrollLeft;
      return { a, b: a + r.width, u: (x.dataset.u || null) as EdgeTone | null };
    });
    const next = edgesOf(el.scrollLeft, el.scrollLeft + el.clientWidth, el.scrollWidth, items);
    setEdges((p) => (p.l === next.l && p.r === next.r && p.ul === next.ul && p.ur === next.ur ? p : next));
  };

  // The open one in the middle: at once when a list first shows, smoothly while the corrector works through it.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fresh = first.current || lastList.current !== props.list;
    lastList.current = props.list;
    const on = el.querySelector<HTMLElement>(".on");
    let to = el.scrollLeft;
    if (on) {
      const r0 = el.getBoundingClientRect();
      const r = on.getBoundingClientRect();
      const a = r.left - r0.left + el.scrollLeft;
      to = centreOf(a, a + r.width, el.clientWidth, el.scrollWidth);
    } else if (fresh) {
      to = props.idle === "end" ? Math.max(0, el.scrollWidth - el.clientWidth) : 0;
    }
    if (Math.abs(to - el.scrollLeft) > 1) {
      if (fresh || typeof el.scrollTo !== "function") el.scrollLeft = to;
      else el.scrollTo({ left: to, behavior: "smooth" });
    }
    first.current = false;
    measure();
  }, [props.list, props.at]);

  // The edges after every change (a name arrives, a level is corrected), on scroll and when the phone turns.
  useLayoutEffect(measure);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let raf = 0;
    const later = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    el.addEventListener("scroll", later, { passive: true });
    window.addEventListener("resize", later);
    return () => {
      el.removeEventListener("scroll", later);
      window.removeEventListener("resize", later);
      cancelAnimationFrame(raf);
    };
  }, []);

  const Tag = (props.as ?? "div") as "div";
  return (
    <div class={`hrow${edges.l ? " more-l" : ""}${edges.r ? " more-r" : ""}`}>
      <Tag ref={box as { current: HTMLDivElement | null }} class={`hrow-in ${props.class}`} aria-label={props.label}>
        {props.children}
      </Tag>
      {edges.ul && <i class={`hrow-dot l ${edges.ul}`} aria-hidden="true" />}
      {edges.ur && <i class={`hrow-dot r ${edges.ur}`} aria-hidden="true" />}
    </div>
  );
}
