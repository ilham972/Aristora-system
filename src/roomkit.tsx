// The pieces the two room pages share (Theory, Evaluation; one screen each since 31 Oct 2026): small things in fixed
// places, like Correction.
// - GradeRow: grades 6–11 in ONE row, the most urgent first, a count and a red badge each; pale when nothing waits.
// - KindBar: Fighter / Master / Legend in one line, with how many need her (red = no work now); pale at 0.
// - LessonName: a book the way he wants it: the grade as a small number, the unit number, the Tamil name.
// - AnswerKey: one workbook question's answer (teachers only), fetched while it is open.
// - LockIcon: her room is in use. usePinned: the pinned rows' height (toasts sit above the pad, never over it).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { SectionData } from "../convex/lib/book";
import type { KeyAnswer } from "../convex/lib/key";
import { heatWords } from "./deck";
import { unitNo } from "./focusData";
import { useQuery } from "./live";
import { KeyLine } from "./master";
import { bookDocAt, type Unit } from "./store";
import type { HeatCount, LessonKind } from "./theoryFocusData";

/** All / Fighter / Master: how many need her (each student once), red = no work now. Pale when none. */
export function KindBar<T extends string>(props: { value: T; items: { id: T; label: string; c: HeatCount }[]; onPick: (k: T) => void }) {
  return (
    <nav class="tp-kinds" aria-label="Show one kind of book">
      {props.items.map((it) => {
        const on = props.value === it.id;
        return (
          <button
            key={it.id}
            type="button"
            class={`tp-kind${on ? " on" : ""}`}
            aria-pressed={on}
            disabled={!on && it.c.total === 0}
            aria-label={`${it.label}: ${it.c.total}, ${heatWords(it.c)}`}
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

/** Grades 6 to 11 in ONE row (his rule), the most urgent first; a grade with nobody waiting is pale. */
export function GradeRow(props: { rows: { grade: number; c: HeatCount }[]; value: number | null; onPick: (g: number) => void }) {
  return (
    <nav class="evx-grades" aria-label="Grades, the most urgent first">
      {props.rows.map((r) => {
        const on = r.grade === props.value;
        return (
          <button
            key={r.grade}
            type="button"
            class={`evx-g${on ? " on" : ""}`}
            aria-pressed={on}
            disabled={!on && r.c.total === 0}
            aria-label={`Grade ${r.grade}: ${r.c.total}, ${heatWords(r.c)}`}
            onClick={() => props.onPick(r.grade)}
          >
            <b>{r.grade}</b>
            <i>{r.c.total || ""}</i>
            {r.c.red > 0 && <em class="evx-g-r">{r.c.red}</em>}
          </button>
        );
      })}
    </nav>
  );
}

/** A lesson's name the way he wants it: the grade as a number, the unit number, the Tamil name (a section: its letter and Tamil title). */
export function LessonName(props: { unit: Unit | null; section: SectionData | null; kind: LessonKind }) {
  const { unit, section } = props;
  const ta = props.kind === "section" ? section?.tamil || unit?.ta : unit?.ta;
  return (
    <>
      {unit && (
        <i class="tp-ln-g" aria-hidden="true">
          {unit.grade}
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

/** The answer for one question (teachers only), fetched while it is open: the workbook's key, or the theory book's
 *  (a topic tute brings both). A theory book without a key asks for the notebook, without fetching anything. */
export function AnswerKey(props: { unitId: string; q: number; stage?: "fighter" | "master" }) {
  const stage = props.stage ?? "master";
  const none = stage === "fighter" && !bookDocAt(props.unitId, "fighter")?.keyCount;
  if (none) return <p class="muted small">Check his answer in his notebook.</p>;
  return <KeyFetch unitId={props.unitId} q={props.q} stage={stage} />;
}

function KeyFetch(props: { unitId: string; q: number; stage: "fighter" | "master" }) {
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: props.unitId as Id<"units">, stage: props.stage });
  const k = keyQ?.answers.find((a) => a.q === props.q);
  if (keyQ === undefined) return <p class="muted small">Loading the answer…</p>;
  if (!k) {
    const words = keyQ === null ? (props.stage === "fighter" ? "Check his answer in his notebook." : "No answer key for this workbook yet.") : "No answer for this question in the key.";
    return <p class="muted small">{words}</p>;
  }
  return (
    <div class="ev-key">
      <small>Answer</small>
      <KeyLine k={k} />
    </div>
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
