// The book's Preview (24 Nov 2026, the founder: "put preview button near download button"): the T page's whole book on
// the screen, laid out by the very code that makes the PDF (src/skillPrint.ts previewSkillBook: the same pages, lines
// and page numbers), page under page on a grey table. It fits the screen's width; two fingers pinch it bigger or
// smaller, a double tap zooms in where it lands (and back out), one finger moves round the page. ✕ or Back closes it;
// PDF downloads the same book. Nothing is kept: it is laid out again, as the book is now, each time it opens.

import { useEffect, useRef, useState } from "preact/hooks";
import { useBackClose } from "./backClose";
import { clearPrint, previewSkillBook, type PrintPlan } from "./skillPrint";
import { toast } from "./store";

const MM = 96 / 25.4;
const PAGE_W = 210 * MM;
/** A page and the gap under it (src/skillPrint.ts: .sbx-show > .sbx-page). */
const PITCH = (296.8 + 6) * MM;
/** The table's edge round the pages (.bpv-z's margin). */
const EDGE = 8;
/** How far in a pinch goes, and where a double tap lands (× the page's fit to the screen). */
const MAX = 5;
const TAP_ZOOM = 2.5;

type View = { k: number; fit: number; host: HTMLElement | null; h: number };

export function BookPreview(props: { plan: PrintPlan; css: string | null; title: string; onPdf: () => void; onClose: () => void }) {
  useBackClose(props.onClose);
  const scroller = useRef<HTMLDivElement>(null);
  const sizer = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{ t: "laying" } | { t: "ready"; pages: number } | { t: "failed"; why: string }>({ t: "laying" });
  const [at, setAt] = useState(1);
  const view = useRef<View>({ k: 0, fit: 0, host: null, h: 0 });

  /** Scale the book to k (within fit … MAX × fit), keeping the book's point (cx, cy) under the screen's (sx, sy). */
  const apply = (k: number, keep?: { cx: number; cy: number; sx: number; sy: number }) => {
    const v = view.current;
    const s = scroller.current;
    const z = sizer.current;
    if (!v.host || !s || !z || !v.fit) return;
    v.k = Math.min(v.fit * MAX, Math.max(v.fit, k));
    z.style.width = `${PAGE_W * v.k}px`;
    z.style.height = `${v.h * v.k}px`;
    v.host.style.transform = `scale(${v.k})`;
    if (keep) {
      s.scrollLeft = keep.cx * v.k + EDGE - keep.sx;
      s.scrollTop = keep.cy * v.k + EDGE - keep.sy;
    }
  };
  /** The book's point under a point of the screen (relative to the scroller's corner). */
  const bookAt = (sx: number, sy: number) => {
    const s = scroller.current as HTMLDivElement;
    const k = view.current.k || 1;
    return { cx: (s.scrollLeft + sx - EDGE) / k, cy: (s.scrollTop + sy - EDGE) / k, sx, sy };
  };
  const fitWidth = () => Math.max(0.05, ((scroller.current?.clientWidth ?? 360) - 2 * EDGE) / PAGE_W);

  useEffect(() => {
    let live = true;
    const z = sizer.current;
    if (!z) return;
    previewSkillBook(props.plan, props.css, z)
      .then((r) => {
        if (!live) return;
        const v = view.current;
        v.host = r.host;
        v.h = r.host.offsetHeight;
        v.fit = fitWidth();
        apply(v.fit);
        setState({ t: "ready", pages: r.pages });
        if (!r.fonts) toast("The book's fonts didn't all come (weak signal?): some words may look different from the PDF.", "error");
      })
      .catch((e: unknown) => live && setState({ t: "failed", why: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
      clearPrint();
    };
  }, []);

  // A turned phone (or a resized window): the same zoom against the new width, the same place in the book.
  useEffect(() => {
    const onResize = () => {
      const v = view.current;
      const s = scroller.current;
      if (!v.host || !s || !v.fit) return;
      const ratio = v.k / v.fit;
      const keep = bookAt(s.clientWidth / 2, s.clientHeight / 2);
      v.fit = fitWidth();
      apply(v.fit * ratio, { ...keep, sx: s.clientWidth / 2, sy: s.clientHeight / 2 });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Two fingers: pinch. One finger: the browser's own scroll. A double tap: zoom in there, or back to the page's width.
  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    let pinch: { d0: number; k0: number; cx: number; cy: number } | null = null;
    /** A tap is a touch that stays within a few pixels of where it began. */
    let moved = false;
    let from = { x: 0, y: 0 };
    let lastTap = { t: 0, x: 0, y: 0 };
    const rel = (t: Touch) => {
      const r = s.getBoundingClientRect();
      return { x: t.clientX - r.left, y: t.clientY - r.top };
    };
    const two = (e: TouchEvent) => {
      const a = rel(e.touches[0]);
      const b = rel(e.touches[1]);
      return { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    };
    const onStart = (e: TouchEvent) => {
      moved = e.touches.length > 1;
      if (e.touches.length === 1) from = rel(e.touches[0]);
      if (e.touches.length === 2) {
        const p = two(e);
        const at0 = bookAt(p.x, p.y);
        pinch = { d0: Math.max(1, p.d), k0: view.current.k, cx: at0.cx, cy: at0.cy };
      }
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length === 1 && !moved) {
        const p = rel(e.touches[0]);
        moved = Math.hypot(p.x - from.x, p.y - from.y) > 10;
      }
      if (!pinch || e.touches.length < 2) return;
      e.preventDefault();
      const p = two(e);
      apply(pinch.k0 * (p.d / pinch.d0), { cx: pinch.cx, cy: pinch.cy, sx: p.x, sy: p.y });
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length > 0 || moved || e.changedTouches.length !== 1) return;
      const p = rel(e.changedTouches[0]);
      const now = Date.now();
      if (now - lastTap.t < 320 && Math.hypot(p.x - lastTap.x, p.y - lastTap.y) < 36) {
        e.preventDefault();
        lastTap = { t: 0, x: 0, y: 0 };
        toggleZoom(p.x, p.y);
      } else lastTap = { t: now, x: p.x, y: p.y };
    };
    // iOS's own page zoom: never inside the viewer.
    const noGesture = (e: Event) => e.preventDefault();
    s.addEventListener("touchstart", onStart, { passive: true });
    s.addEventListener("touchmove", onMove, { passive: false });
    s.addEventListener("touchend", onEnd, { passive: false });
    s.addEventListener("touchcancel", onEnd, { passive: false });
    s.addEventListener("gesturestart", noGesture);
    return () => {
      s.removeEventListener("touchstart", onStart);
      s.removeEventListener("touchmove", onMove);
      s.removeEventListener("touchend", onEnd);
      s.removeEventListener("touchcancel", onEnd);
      s.removeEventListener("gesturestart", noGesture);
    };
  }, []);

  const toggleZoom = (sx: number, sy: number) => {
    const v = view.current;
    if (!v.fit) return;
    const keep = bookAt(sx, sy);
    apply(v.k > v.fit * 1.05 ? v.fit : v.fit * TAP_ZOOM, keep);
  };

  const onScroll = () => {
    const v = view.current;
    const s = scroller.current;
    if (!s || !v.k || state.t !== "ready") return;
    const n = Math.floor((s.scrollTop + s.clientHeight / 3 - EDGE) / (PITCH * v.k)) + 1;
    setAt(Math.min(state.pages, Math.max(1, n)));
  };

  const sub =
    state.t === "ready" ? `Page ${at} of ${state.pages}` : state.t === "laying" ? "Laying out the book…" : "Couldn't lay it out";
  return (
    <div class="bpv" role="dialog" aria-modal="true" aria-label="Preview of the book">
      <div class="bpv-top">
        <button type="button" class="bpv-x" onClick={props.onClose} aria-label="Close the preview">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </button>
        <div class="bpv-t">
          <b>{props.title}</b>
          <span aria-live="polite">{sub}</span>
        </div>
        <button type="button" class="bpv-pdf" disabled={state.t !== "ready"} onClick={props.onPdf} aria-label="Download this book as a PDF">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          PDF
        </button>
      </div>
      <div class="bpv-s" ref={scroller} onScroll={onScroll} onDblClick={(e) => {
        const r = scroller.current?.getBoundingClientRect();
        if (r) toggleZoom(e.clientX - r.left, e.clientY - r.top);
      }}>
        {state.t === "laying" ? <p class="bpv-msg">Laying out the book, as the PDF will have it…</p> : null}
        {state.t === "failed" ? <p class="bpv-msg">The book couldn't be laid out here: {state.why}</p> : null}
        <div class="bpv-z" ref={sizer} />
      </div>
      {state.t === "ready" ? <p class="bpv-hint">Pinch or double-tap to zoom</p> : null}
    </div>
  );
}
