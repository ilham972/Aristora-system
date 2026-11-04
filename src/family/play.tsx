// A Level: one question at a time, his own pad, Check once; then the reveal.
// - The phone never has the answers: the server marks (convex/family.ts check).
// - The question is always on the screen when the Stage's questions are in the app (his answer, 4 Nov 2026: "always
//   show the question"; the eye switch is gone), in the app's own font, its printed number hidden (Q9 once). His
//   answer goes inside it where the book marks the place (kinds.tsx): the blanks are his boxes, options and ✓ / ✗ are
//   tapped, words are underlined; cards to order and pairs to match sit under it. The pad shows only for boxes.
// - The reveal: his answers come back one question at a time, a bell for each right one that climbs higher with every
//   one in a row, then the score, the XP, the flame, a trophy if he won one. A tap shows everything at once.
// - A question only the teacher marks has no box: "do it on paper", the pad pale, → goes on (4 Nov 2026: a student
//   tapped the pad there and nothing happened). A level opens again on the question he left (kept per level).

import { Fragment } from "preact";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { FamilyLevel, FamilyMe, FamilyQuestions, FamilyResult } from "../../convex/family";
import type { Trophy, World } from "../../convex/lib/family";
import type { LevelBook } from "../../convex/lib/homeWork";
import type { Box } from "../../convex/lib/phone";
import { drawQuestion } from "../questionView";
import { Book, Taker } from "./book";
import { MatchPairs, OrderCards, paintSlots, PickBelow, slotRuns, slotsFit, tapOf, tapped, typing, type Live, type SlotRun } from "./kinds";
import { keep, mutation, NetError, query } from "./net";
import { buzz, sound } from "./sound";
import { Flame, Gem, Icon, Medal, Owl, OwlBadge, pretty, problemWords, Roll, Tag, toast, useOwlTap, Waiting, type Mood } from "./ui";

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
};

type Spot = { qi: number; bi: number };

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
const exprKeys = (v: string) => ["7", "8", "9", "⌫", "4", "5", "6", v, "1", "2", "3", "+", "0", "(", ")", "-", "*", "/", "^2", "→"];
const KEY_LABEL: Record<string, string> = { "-": "−", "*": "×", "^2": "x²", " ": "␣", "⌫": "⌫", "→": "→" };

/** His pad. On a question with no box (the teacher's) only → works: the other keys are pale. */
function Pad(props: { box: Box | null; onKey: (k: string) => void; last: boolean }) {
  const keys = props.box?.k === "expr" ? exprKeys(props.box.v) : NUM_KEYS;
  return (
    <div class={`f-padkeys${props.box?.k === "expr" ? " x" : ""}`} role="group" aria-label="Keys">
      {keys.map((k) => (
        <button
          type="button"
          key={k}
          aria-disabled={!props.box && k !== "→" ? "true" : undefined}
          class={`f-key${k === "→" ? " next" : ""}${k === "⌫" ? " del" : ""}${/^\d$/.test(k) ? "" : " op"}${!props.box && k !== "→" ? " f-keyoff" : ""}`}
          aria-label={k === "→" ? (props.last ? "Done" : "Next") : k === "⌫" ? "Delete" : k === " " ? "Space" : k === "^2" ? "squared" : k}
          onClick={() => props.onKey(k)}
        >
          {k === "^2" && props.box?.k === "expr" ? `${props.box.v}²` : (KEY_LABEL[k] ?? k)}
        </button>
      ))}
    </div>
  );
}

/** A question with nothing to type (taps, cards, pairs, a photo): only → under it, where the pad's → always is. */
function NextBar(props: { onNext: () => void; last: boolean }) {
  return (
    <div class="f-nextbar">
      <button type="button" class="f-key next" aria-label={props.last ? "Done" : "Next"} onClick={props.onNext}>
        →
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
const PAPER_CSS = `.qv { border-radius: 14px; padding: 14px 12px 10px; -webkit-user-select: none; user-select: none; color: var(--ink, #1c1a3a);
  font: 500 17px/1.6 "Baloo Thambi 2", "Noto Sans Tamil", system-ui, sans-serif; }
.qv :not(svg):not(svg *):not(.mi):not(.mi *) { font-family: "Baloo Thambi 2", "Noto Sans Tamil", system-ui, sans-serif !important; }
.qv .sit, .qv .qs, .qv .sq, .qv .lead, .qv .lead2, .qv .pq p, .qv .bl, .qv .rp, .qv .mcq, .qv table.gt td { font-size: 17px !important; line-height: 1.6 !important; }
.qv .src { font-size: 12.5px !important; letter-spacing: 0 !important; color: var(--ink3, #9d99bf) !important; font-weight: 600 !important; }
.qv .mi { font-family: "STIX Two Text", "Cambria Math", Georgia, serif; }
.qv .frc { font-size: .9em; }
.qv .qn, .qv .pm, .qv .mk { display: none !important; }
.qv [data-fill] { display: inline-flex !important; align-items: center; justify-content: center; vertical-align: middle; box-sizing: border-box;
  min-width: 2.3em !important; width: auto !important; height: 1.8em; margin: 0 .1em; padding: 0 .3em; border: 2px dashed var(--brand-mid, #cbc3ff) !important;
  border-radius: 10px; background: var(--brand-soft, #efecff); color: var(--brand-2, #5a49d6); font: 800 1.05em/1 "Baloo Thambi 2", sans-serif !important; cursor: pointer; }
.qv .frc [data-fill] { min-width: 1.75em !important; height: 1.45em; margin: 0 0 .12em; border-radius: 8px; }
.qv [data-fill].fx-has { border-style: solid !important; background: #fff; }
.qv [data-fill].fx-on { border: 2.5px solid var(--brand, #6c5ce7) !important; background: #fff; box-shadow: 0 0 0 4px var(--brand-soft, #efecff); }
.qv [data-opt] { display: inline-flex; align-items: center; gap: .3em; margin: .15em 0; padding: .2em .7em; border-radius: 12px; cursor: pointer;
  box-shadow: inset 0 0 0 2px var(--line-2, #ddd9f0); background: #fff; }
.qv [data-opt].fx-on { box-shadow: inset 0 0 0 2.5px var(--brand, #6c5ce7); background: var(--brand-soft, #efecff); color: var(--brand-2, #5a49d6); }
.qv .mcq { row-gap: 6px !important; column-gap: 10px !important; }
.qv [data-tick] { display: inline-flex; gap: 6px; margin: 0 .2em; vertical-align: middle; }
.qv .fx-tk { display: inline-flex; align-items: center; justify-content: center; width: 2.3em; height: 1.85em; border-radius: 10px; cursor: pointer;
  box-shadow: inset 0 0 0 2px var(--line-2, #ddd9f0); background: #fff; color: var(--ink3, #9d99bf); font: 800 1em/1 "Baloo Thambi 2", sans-serif; }
.qv .fx-tk.fx-on { box-shadow: inset 0 0 0 2.5px var(--brand, #6c5ce7); background: var(--brand-soft, #efecff); color: var(--brand-2, #5a49d6); }
.qv [data-mark] { display: inline-block; min-width: 1.7em; margin: .1em 0; padding: .05em .3em 0; text-align: center; font-size: 1.12em;
  cursor: pointer; border-bottom: 3px solid transparent; border-radius: 2px; }
.qv [data-mark].fx-on { border-bottom-color: var(--brand, #6c5ce7); color: var(--brand-2, #5a49d6); }
.qv [data-mark].fx-ring { border: 2px solid transparent; border-radius: 999px; padding: 0 .3em; }
.qv [data-mark].fx-ring.fx-on { border-color: var(--brand, #6c5ce7); }`;

/**
 * A question as printed, on the level. A tap opens it full screen (`QuestionZoom`): the app itself never zooms. With
 * its slots live (his answers go in it), a tap answers instead and only 🔍 zooms.
 */
function Paper(props: { html: string; css: string; q: number; onZoom: () => void; live?: Live }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!host.current) return;
    return drawQuestion(host.current, props.html, props.css, PAPER_CSS);
  }, [props.html, props.css]);
  // After every change: his answers in the slots (the drawing above runs first).
  useEffect(() => {
    const root = host.current?.shadowRoot;
    if (root && props.live) paintSlots(root, props.live);
  });
  const live = props.live && props.live.fit.size > 0 ? props.live : null;
  return (
    <div
      class={`f-paper rise${live ? " live" : ""}`}
      ref={host}
      aria-label={`Q${props.q}`}
      onClick={(e) => {
        if (!live) return props.onZoom();
        const t = tapOf(e, live);
        if (t) live.onSlot(t.run, t.i, t.v);
      }}
    />
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

export function Play(props: {
  world: World;
  n: number;
  onBack: () => void;
  onChecked: (f: FamilyLevel, r: Checked, typed: Record<number, string[]>) => void;
  /** The server has this level marked at home already (a Check whose answer never reached this phone): its book. */
  onMarked: () => void;
  onZoom: (z: Zoomed) => void;
}) {
  const formKey = `form.${props.world.unitId}.${props.n}`;
  const draftKey = `draft.${props.world.unitId}.${props.n}`;
  const spotKey = `spot.${props.world.unitId}.${props.n}`;
  const [form, setForm] = useState<FamilyLevel | null>(() => keep<FamilyLevel>(formKey));
  const [typed, setTyped] = useState<Record<number, string[]>>(() => keep<Record<number, string[]>>(draftKey) ?? {});
  // The question he left (his ask, 4 Nov 2026: "exactly that question want to focus and continue from that").
  const [kept] = useState(() => keep<Spot>(spotKey));
  const [at, setAt] = useState<Spot>(() => kept ?? { qi: 0, bi: 0 });
  const placed = useRef(false);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
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

  // The server says this level is marked (his report, 4 Nov 2026: Check said "This level is already marked", no
  // summary, no word on why the next level stayed shut): his first Check went through but its answer never reached
  // the phone (the signal dropped), or a teacher marked it in class. What the phone kept for it is no use any more:
  // a level marked at home opens its book (the marks, the solutions, the photos it asks for).
  const marked = (e: unknown) => e instanceof NetError && !e.offline && /already marked|already has this level/.test(e.message);
  const gone = () => {
    keep(draftKey, null);
    keep(formKey, null);
    keep(spotKey, null);
    keep(howKey, null);
    keep(`qs.${props.world.unitId}.${props.n}`, null);
    query("family:book", { unitId: props.world.unitId, n: props.n })
      .then(() => props.onMarked())
      .catch(() => setErr(`Level ${props.n} ஐ உன் ஆசிரியர் ஏற்கனவே திருத்திவிட்டார்.`));
  };
  useEffect(() => {
    query("family:level", { unitId: props.world.unitId, n: props.n })
      .then((f) => {
        keep(formKey, f as FamilyLevel);
        setForm(f as FamilyLevel);
      })
      .catch((e) => {
        if (marked(e)) return gone();
        // Refused now (the photos first, the levels in order): say why, never the old level kept on the phone.
        if (!form || (e instanceof NetError && !e.offline)) setErr(problemWords(e));
      });
  }, [props.world.unitId, props.n]);
  // A new question (his report, 4 Nov 2026: after → the screen jumped up and came back down). Only the strip moves,
  // sideways, to his chip: scrollIntoView moved the page too (up to the strip, then the card's smooth scroll back
  // down). A new question is a new page: if he had scrolled down (a tall printed question), it starts at the top,
  // set before the screen is drawn, so the only motion is the page sliding in from the side. (Its printed question
  // is drawn a frame later: for that frame the page is shorter and the browser had already moved it part-way.)
  const placedRow = useRef(false);
  useLayoutEffect(() => {
    const row = strip.current;
    const chip = row?.querySelector<HTMLElement>(".f-qchip.on");
    if (!row || !chip) return;
    const r = chip.getBoundingClientRect();
    const s = row.getBoundingClientRect();
    row.scrollTo({ left: row.scrollLeft + r.left - s.left - (s.width - r.width) / 2, behavior: placedRow.current && !instant() ? "smooth" : "auto" });
    if (placedRow.current && window.scrollY > 0) window.scrollTo(0, 0);
    placedRow.current = true;
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

  const all = useMemo(() => (form ? boxesOf(form) : []), [form]);
  if (err) return <Oops text={err} onBack={props.onBack} />;
  if (!form) return <Waiting />;

  const q = form.qs[at.qi];
  const asking = !review && !!q.t && !how[q.q];
  const learning = !review && !!q.t && how[q.q] === "learn";
  const flat = all.findIndex((x) => x.qi === at.qi && x.bi === at.bi);
  // The box he types in now: a tap's place (an option, ✓ / ✗, a card) is never typed into.
  const box = flat >= 0 && typing(all[flat].box) ? all[flat].box : null;
  const val = (qi: number, bi: number) => typed[form.qs[qi].q]?.[bi] ?? "";
  /** Several of a question's answers at once (a tap changes a whole part: ✓ / ✗, the words marked, the cards). */
  const setRun = (qi: number, from: number, vals: string[]) => {
    const qn = form.qs[qi].q;
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
    const n = boxesIn(qi);
    let f = 0;
    for (let i = 0; i < n; i++) if (val(qi, i).trim()) f++;
    return n === 0 ? "teacher" : f === n ? "full" : f > 0 ? "part" : "empty";
  };
  const goNext = () => {
    // The next box to type in this question, else the next question.
    const next = flat >= 0 ? all.findIndex((x, i) => i > flat && x.qi === at.qi && typing(x.box)) : -1;
    if (next >= 0) return setAt({ qi: at.qi, bi: all[next].bi });
    if (at.qi + 1 < form.qs.length) return setAt({ qi: at.qi + 1, bi: startOf(at.qi + 1) });
    setReview(true);
  };
  const onKey = (k: string) => {
    buzz(6);
    sound("key");
    if (k === "→") return goNext();
    // A key while a tap's place is chosen: it goes to the question's first box.
    const here = box ? at.bi : typesIn(at.qi) ? startOf(at.qi) : -1;
    if (here < 0) return toast("இதைத் தாளில் செய்து படம் எடு (📷). → அடுத்த கேள்வி.");
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
      keep(draftKey, null);
      keep(formKey, null);
      keep(spotKey, null);
      keep(howKey, null);
      keep(`qs.${form.unitId}.${form.n}`, null);
      props.onChecked(form, res, typed);
    } catch (e) {
      if (marked(e)) return gone();
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. உன் விடைகள் இந்த phone இல் உள்ளன: இணையம் வந்ததும் மீண்டும் அழுத்து." : problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };

  const printed = showQ ? qs.got?.qs.find((x) => x.q === q.q) : undefined;
  const css = qs.got?.css ?? null;
  const zoom = () => {
    if (printed && css !== null) props.onZoom({ q: q.q, html: printed.html, css });
  };
  // The kinds the book gave this question: their places in the printed question, live; the rest under it.
  const runs = slotRuns(q);
  const fit = printed && css !== null ? slotsFit(runs, printed.html) : new Set<SlotRun["attr"]>();
  const mine = typed[q.q] ?? [];
  const tap = (run: SlotRun, i: number, v?: string) => {
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
  const live: Live = { runs, fit, vals: mine, cur: box ? at.bi : null, onSlot: tap };
  const runAt = (from: number) => runs.find((r) => r.at === from);
  const pad = !review && !asking && !learning && typesIn(at.qi);
  let bi = 0;
  return (
    <div class={`f-play${showQ ? " withq" : ""}${review ? " rev" : ""}${box?.k === "expr" ? " xpad" : ""}${!review && !pad ? " nopad" : ""}`}>
      <header class="f-ptop">
        <button type="button" class="f-round" aria-label="Back" onClick={props.onBack}>
          <Icon name="close" size={20} />
        </button>
        <div class={`f-pbar${all.length > 0 && done === all.length ? " full" : ""}`} aria-label={`${done} of ${all.length} answered`}>
          <i style={{ width: `${Math.round((done / Math.max(1, all.length)) * 100)}%` }}>{done > 0 && <b key={done} />}</i>
          <span class="f-ptag">
            {done}/{all.length}
          </span>
        </div>
      </header>
      <div class="f-prow">
        <p class="f-kicker">
          Stage {form.no} · Level {form.d ?? form.n}
        </p>
        <button type="button" class="f-checkpill" onClick={() => setReview(true)}>
          Check
        </button>
      </div>
      <div class="f-strip" ref={strip}>
        {form.qs.map((x, qi) => (
          <button
            type="button"
            key={x.q}
            class={`f-qchip ${filled(qi)}${qi === at.qi && !review ? " on" : ""}${x.re ? " re" : ""}${x.t ? " tq" : ""}`}
            aria-label={x.re ? `Q${x.q} again` : undefined}
            onClick={() => {
              buzz();
              setReview(false);
              setAt({ qi, bi: startOf(qi) });
            }}
          >
            {x.re ? `↻${x.q}` : x.q}
          </button>
        ))}
      </div>

      {review ? (
        <section class="f-card rise f-review">
          <OwlBadge mood="think" class="mid" />
          <h2 class="f-h2">Level {form.d ?? form.n} சரிபார்க்கவா?</h2>
          <ul class="f-sum">
            <li>
              <b>{done}</b> விடைகள் போட்டாய்
            </li>
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
          </ul>
          <p class="f-muted small">Check செய்த பின் விடைகளை மாற்ற முடியாது.</p>
          <button type="button" class="f-btn gold big shine" disabled={busy} onClick={() => void check()}>
            {busy ? "…" : "Check ✓"}
          </button>
          <button type="button" class="f-btn ghost" onClick={() => setReview(false)}>
            Look again
          </button>
        </section>
      ) : (
        <section class="f-card f-qcard slide" key={q.q}>
          <div class="f-qhead">
            <b class="f-qn">Q{q.q}</b>
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
          {q.re && <p class="f-again">Level {q.re} இல் தவறியது: மீண்டும் முயற்சி!</p>}
          {q.t && <p class="f-tqtag">ஆசிரியர் கேள்வி · with your teacher</p>}
          {showQ &&
            (printed && css !== null ? (
              <Paper html={printed.html} css={css} q={q.q} onZoom={zoom} live={live} />
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
          {!asking && !learning && q.parts.map((p, pi) => {
            if (p.boxes && p.boxes.length === 0) return null;
            const from = bi;
            const ui = p.ui;
            // A kind answered inside the printed question: nothing under it. Cards, pairs and the rest go here.
            if (ui && ui.k !== "fill" && ui.k !== "order" && ui.k !== "match") {
              bi += p.boxes?.length ?? 0;
              const run = runAt(from);
              if (!run || fit.has(run.attr)) return null;
              return (
                <div class="f-part" key={pi}>
                  {p.p && <span class="f-plabel">({p.p})</span>}
                  <PickBelow run={run} vals={mine} onPick={(i, v) => tap(run, i, v)} />
                </div>
              );
            }
            if (ui?.k === "order" || ui?.k === "match") {
              bi += p.boxes?.length ?? 0;
              return (
                <div class="f-part" key={pi}>
                  {p.p && <span class="f-plabel">({p.p})</span>}
                  {ui.k === "order" ? (
                    <OrderCards items={ui.items} vals={mine} at={from} onSet={(v) => setRun(at.qi, from, v)} />
                  ) : (
                    <MatchPairs l={ui.l} r={ui.r} vals={mine} at={from} onSet={(v) => setRun(at.qi, from, v)} />
                  )}
                </div>
              );
            }
            if (ui?.k === "fill" && fit.has("b")) {
              bi += p.boxes?.length ?? 0;
              return null;
            }
            return (
              <div class="f-part" key={pi}>
                {p.p && <span class="f-plabel">({p.p})</span>}
                {p.boxes ? (
                  <div class="f-boxes">
                    {p.boxes.map((b) => {
                      const i = bi++;
                      const v = val(at.qi, i);
                      return (
                        <Fragment key={i}>
                          {b.j && (
                            <span class="f-bjoin" aria-hidden="true">
                              {b.j}
                            </span>
                          )}
                          <button
                            type="button"
                            class={`f-box${at.bi === i ? " on" : ""}${b.k === "expr" ? " x" : ""}${v ? " has" : ""}`}
                            onClick={() => setAt({ qi: at.qi, bi: i })}
                            aria-label={`${b.l ?? ""} answer ${i + 1}${b.u ? ` (${b.u})` : ""}`}
                          >
                            {b.l && <span class="f-blabel">{pretty(b.l)}</span>}
                            <span class="f-bline">
                              <span key={at.bi === i ? v.length : 0} class={v ? `f-bval${at.bi === i ? " typed" : ""}` : "f-bval empty"}>
                                {v ? pretty(v) : "?"}
                              </span>
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
          })}
        </section>
      )}

      {pad && <Pad box={box ?? all.find((x) => x.qi === at.qi && typing(x.box))?.box ?? null} onKey={onKey} last={flat === all.length - 1} />}
      {!review && !asking && !learning && !pad && <NextBar onNext={goNext} last={at.qi === form.qs.length - 1} />}
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
            {line.split("**").map((r, j) => (j % 2 ? <b key={j}>{pretty(r)}</b> : <span key={j}>{r}</span>))}
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

// ---- The reveal ----

/**
 * The level to play now: in his Stage now first, then in the newest book the teachers gave him (4 Nov 2026, his words:
 * "the unit I taught lastly"), else the first open Stage the phone can mark, in the map's order.
 */
export function nextPlay(me: FamilyMe | null): { world: World; n: number; d: number } | null {
  if (!me) return null;
  const ws = [...me.worlds].sort((a, b) => Number(b.now) - Number(a.now) || (b.given ?? 0) - (a.given ?? 0));
  for (const w of ws) {
    const l = w.book && w.open && w.phone ? w.levels.find((x) => x.s === "play") : undefined;
    if (l) return { world: w, n: l.n, d: l.d ?? l.n };
  }
  return null;
}

type RowKind = "ok" | "part" | "bad" | "teach";
const kindOf = (r: FamilyResult): RowKind => (r.got === null ? "teach" : r.got === r.max ? "ok" : r.got > 0 ? "part" : "bad");

/** No waiting in tests or for "reduce motion": everything at once. */
const instant = () =>
  (typeof navigator !== "undefined" && navigator.webdriver === true) ||
  (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches);

/** The score ring round the owl: its radius and length. */
const RING_R = 54;
const RING_C = Math.round(2 * Math.PI * RING_R * 100) / 100;

/** Confetti from behind the owl: more for a better level. */
export function Confetti(props: { n: number }) {
  return (
    <span class="f-confetti" aria-hidden="true">
      {Array.from({ length: props.n }, (_, i) => (
        <i
          key={i}
          class={`c${i % 4}`}
          style={{ "--a": `${(360 / props.n) * i + (i % 3) * 7}deg`, "--d": `${96 + (i % 4) * 22}px`, "--t": `${(i % 5) * 50}ms`, "--r": `${(i % 2 ? 1 : -1) * (160 + i * 23)}deg` }}
        />
      ))}
    </span>
  );
}

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
  const [shown, setShown] = useState(() => (instant() ? rows.length : 0));
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
  // His limit (4 Nov 2026): with photos owed for 2 levels, Next waits; the book below says which.
  const nextHere = next && !props.me?.blocked && next.world.unitId === props.world.unitId && next.n !== form.n ? next : null;
  // The ring round the owl fills as his marks come in.
  const ringK = res.phoneMax ? (done ? res.got : score) / res.phoneMax : 0;
  return (
    <div class={`f-result${done ? " done" : ""}`} onClick={() => !done && setShown(rows.length)}>
      <p class="f-kicker f-center-t">
        Stage {form.no} · Level {form.d ?? form.n}
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
              <Gem size={17} /> +{res.got + (res.bonus ?? 0)} XP
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
                {r.ok.map((part, pi) =>
                  part === null ? (
                    <i key={pi} class="t">
                      ✍
                    </i>
                  ) : fq?.parts[pi]?.ui?.k === "mark" ? (
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
          {form.n < 0 ? (
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
