// The pieces the two room pages share (Theory, Evaluation; one screen each since 31 Oct 2026): small things in fixed
// places, like Correction.
// - GradeRow: grades 6–11 in ONE row, in fixed places (1 Nov 2026), a count and a red badge each; the 1st, 2nd, 3rd
//   most urgent outlined red, orange, yellow; pale when nothing waits (her room's grade never). Which one is picked:
//   src/roomRows.ts.
// - KindBar: Fighter / Master / Legend in one line, fixed places too, the same outlines, with how many need her (red
//   = no work now); pale at 0 (her room's stage never). BackToRoom: while she looks at another book, one tap shows
//   her room's again. useHeld: a row in urgency order that holds still while she touches it.
// - LessonName: a book the way he wants it: the grade as a small number, the unit number, the Tamil name.
// - LockIcon: her room is in use. usePinned: the pinned rows' height (toasts sit above the pad, never over it).

import { gradeName, gradeWords } from "../convex/lib/syllabus";
import { useEffect, useRef, useState } from "preact/hooks";
import type { SectionData } from "../convex/lib/book";
import { heatWords } from "./deck";
import { unitNo } from "./focusData";
import type { Unit } from "./store";
import { HOLD_MS, holdOrder, type HeatCount, type LessonKind, type PillOrder } from "./theoryFocusData";

/**
 * All / Fighter / Master: how many need her (each student once), red = no work now. Pale when none, unless her room
 * has a book there (`room`: a dot in her room's colour; she can always tap where her room is).
 */
export function KindBar<T extends string>(props: {
  value: T;
  /** `open`: it can be tapped even with nobody waiting (the whole-class lesson: a book in the app). */
  items: { id: T; label: string; c: HeatCount; room?: boolean; rank?: number; open?: boolean }[];
  /** Their fixed places (Fighter, Master, Legend); without it, as given. */
  order?: readonly T[];
  onPick: (k: T) => void;
}) {
  const order = props.order;
  const items = order ? [...props.items].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : props.items;
  return (
    <nav class="tp-kinds" aria-label="Show one kind of book">
      {items.map((it) => {
        const on = props.value === it.id;
        return (
          <button
            key={it.id}
            type="button"
            class={`tp-kind${on ? " on" : ""}${it.rank && it.rank <= 3 ? ` pri${it.rank}` : ""}`}
            aria-pressed={on}
            disabled={!on && it.c.total === 0 && !it.room && !it.open}
            aria-label={`${it.label}: ${it.c.total}, ${heatWords(it.c)}${it.rank && it.rank <= 3 ? `, most urgent ${RANK_WORDS[it.rank - 1]}` : ""}${it.room ? ", your room" : ""}`}
            onClick={() => props.onPick(it.id)}
          >
            {it.label}
            <b>{it.c.total}</b>
            {it.c.red > 0 && <i class="tp-kind-r">{it.c.red}</i>}
          </button>
        );
      })}
    </nav>
  );
}

/** While she looks at another book to call someone: one tap and the rows show her room's book again. */
export function BackToRoom(props: { onBack: () => void }) {
  return (
    <button type="button" class="link-btn evx-back" onClick={props.onBack}>
      Back to your room
    </button>
  );
}

export { byUrgency, NO_HEAT } from "./theoryFocusData";

/**
 * The rows pinned under the top bar: their height goes to --tp-stick-h (the body ends where the pad sticks, so the pad
 * never moves), and the page is marked (body.tp-padded) so toasts sit above the pad. A callback ref: measured whenever
 * the rows appear (a page that first said "Nobody is signed in" has no rows yet). `key` = what changes their height.
 */
export function usePinned(key: unknown) {
  const [el, stick] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    document.body.classList.add("tp-padded");
    return () => document.body.classList.remove("tp-padded");
  }, []);
  useEffect(() => {
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--tp-stick-h", `${el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, key]);
  return stick;
}

/**
 * Grades 6 to 11 in ONE row (his rule), the most urgent first; a grade with nobody waiting is pale, unless her room
 * has a book there (`room`: a dot in her room's colour, and she can tap it).
 */
export function GradeRow(props: {
  rows: { grade: number; c: HeatCount; room?: boolean; rank?: number }[];
  value: number | null;
  onPick: (g: number) => void;
  /** Every grade can be tapped (the whole-class lesson: she may teach any grade's book). */
  open?: boolean;
}) {
  return (
    <nav class="evx-grades" aria-label="Grades 6 to 11 and OL; the most urgent outlined red, then orange, then yellow">
      {[...props.rows]
        .sort((a, b) => a.grade - b.grade)
        .map((r) => {
          const on = r.grade === props.value;
          const pri = r.rank && r.rank <= 3 ? r.rank : 0;
          return (
            <button
              key={r.grade}
              type="button"
              class={`evx-g${on ? " on" : ""}${pri ? ` pri${pri}` : ""}`}
              aria-pressed={on}
              disabled={!on && r.c.total === 0 && !r.room && !props.open}
              aria-label={`${gradeWords(r.grade)}: ${r.c.total}, ${heatWords(r.c)}${pri ? `, most urgent ${RANK_WORDS[pri - 1]}` : ""}${r.room ? ", your room" : ""}`}
              onClick={() => props.onPick(r.grade)}
            >
              <b>{gradeName(r.grade)}</b>
              <i>{r.c.total || ""}</i>
              {r.c.red > 0 && <em class="evx-g-r">{r.c.red}</em>}
            </button>
          );
        })}
    </nav>
  );
}

/** "1st", "2nd", "3rd" (most urgent): the outline's words for a screen reader. */
const RANK_WORDS = ["1st", "2nd", "3rd"];

/**
 * A row in the page's order (the most urgent first) that holds still while she touches it: places stay for 5 s after
 * her last touch or scroll, new pills go at the end; then it ranks again (as Theory's lessons row, 30 Oct 2026).
 */
export function useHeld<T>(items: readonly T[], key: (t: T) => string, sig: (t: T) => string): { list: T[]; touch: () => void } {
  const order = useRef<PillOrder | null>(null);
  const touched = useRef(0);
  const ord = holdOrder(
    order.current,
    items.map((t) => ({ key: key(t), sig: sig(t) })),
    Date.now() - touched.current < HOLD_MS,
  );
  order.current = ord;
  const by = new Map(items.map((t) => [key(t), t]));
  return {
    list: ord.keys.flatMap((k) => by.get(k) ?? []),
    touch: () => {
      touched.current = Date.now();
    },
  };
}

/** A lesson's name the way he wants it: the grade as a number, the unit number, the Tamil name (a section: its letter and Tamil title). */
export function LessonName(props: { unit: Unit | null; section: SectionData | null; kind: LessonKind }) {
  const { unit, section } = props;
  const ta = props.kind === "section" ? section?.tamil || unit?.ta : unit?.ta;
  return (
    <>
      {unit && (
        <i class="tp-ln-g" aria-hidden="true">
          {gradeName(unit.grade)}
        </i>
      )}
      <b class="tp-ln-n">
        {unit ? unitNo(unit.code) : "?"}
        {props.kind === "section" && section ? `·${section.id}` : ""}
      </b>
      <span class="tp-ln-t" lang="ta">
        {ta}
      </span>
    </>
  );
}

/** Her room is in use (someone is with her). */
export function LockIcon() {
  return (
    <svg class="evx-lock" viewBox="0 0 24 24" width="14" height="14" aria-label="In use" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
