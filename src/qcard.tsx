// The question card's pieces, shared by Correction, Evaluation and Theory (3 Nov 2026, his ask: Evaluation's and
// Theory's cards like Correction's), and teaching mode: the question as printed and its answer, full screen, so a
// teacher teaches from the whiteboard looking at her phone instead of walking to his book.
// - CardHead: one top line: the question's number as a dark pill, a short line (marks, who, the section), then the
//   tools: ‹ back (Correction), teaching mode, the printed question's icon.
// - CardAnswer / KeyView: the answer from the key, big (src/bigAnswer.tsx), fetched while it is open; a note in its
//   place when there is none. The printed question's icon on: the question with each part's answer under it.
// - TeachButton / TeachMode / PrintedQuestion: the full-screen view and what it shows. The page keeps its state: the
//   view shows the page's own squares and buttons (Explained / Taught = the next question, as on the page).

import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { KeyAnswer } from "../convex/lib/key";
import { BigAnswer } from "./bigAnswer";
import { BookQuestion, QuestionIcon, type useQuestionShown } from "./bookQuestion";
import { useQuery } from "./live";
import { bookDocAt } from "./store";

type Stage = "fighter" | "master";

/**
 * The card's top line (2 Nov 2026, his ask: the answer gets the room): the number as a dark pill, a short line, then
 * ‹ back, teaching mode and the printed question's icon (only when the book's questions are in the app).
 */
export function CardHead(props: {
  label: string;
  n: ComponentChildren;
  meta: ComponentChildren;
  /** Extra class on the short line ("evx-who": the names may take two lines). */
  metaCls?: string;
  back?: { label: string; short: string; go: () => void } | null;
  shown?: ReturnType<typeof useQuestionShown>;
  onTeach?: () => void;
  /** Explain this question online (12 Nov 2026, Consultation): `on` = its thread is open already. */
  online?: { on: boolean; names: string; go: () => void };
}) {
  return (
    <div class="fc-qhead">
      <span class="fc-qn" aria-hidden="true">
        {props.n}
      </span>
      <span class={`fc-qmeta${props.metaCls ? ` ${props.metaCls}` : ""}`}>{props.meta}</span>
      <span class="fc-qtools">
        {props.back && (
          <button type="button" class="fc-back" aria-label={`Back to ${props.back.label}`} onClick={props.back.go}>
            ‹ {props.back.short}
          </button>
        )}
        {props.online && <OnlineButton q={props.label} {...props.online} />}
        {props.onTeach && <TeachButton q={props.label} onOpen={props.onTeach} />}
        {props.shown && <QuestionIcon q={props.label} shown={props.shown} />}
      </span>
    </div>
  );
}

/** The question's number as Correction's pill shows it: "Q" small, then the number; a book's own label ("2016") as is. */
export function QPill(props: { label: string }) {
  const m = /^Q(\d+)$/.exec(props.label);
  return m ? (
    <>
      <small>Q</small>
      {m[1]}
    </>
  ) : (
    <>{props.label}</>
  );
}

/**
 * One question's answer, big, from its book's key (teachers only; fetched while the card is open). A theory book
 * without a key: `noKey` (Evaluation: check his notebook; "" = nothing, when a note above already says it), nothing
 * fetched. `inline` (the printed question's icon is on, 13 Nov 2026): the question as printed with each part's answer
 * under its own sub-question (no key: the note, then the question).
 */
export function CardAnswer(props: { unitId: string; q: number; stage: Stage; noKey?: string; max?: number; maxH?: number; hasKey?: boolean; inline?: boolean }) {
  if (props.stage === "fighter" && !(props.hasKey ?? !!bookDocAt(props.unitId, "fighter")?.keyCount)) {
    const note = props.noKey === "" ? null : <p class="fc-anote">{props.noKey ?? "Check his answer in his notebook."}</p>;
    return props.inline ? (
      <>
        {note}
        <BookQuestion unitId={props.unitId} stage={props.stage} q={props.q} />
      </>
    ) : (
      note
    );
  }
  return <KeyFetch {...props} />;
}

function KeyFetch(props: { unitId: string; q: number; stage: Stage; noKey?: string; max?: number; maxH?: number; hasKey?: boolean; inline?: boolean }) {
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: props.unitId as Id<"units">, stage: props.stage });
  if (keyQ === undefined) return <p class="fc-anote">Loading the answer…</p>;
  const k = keyQ?.answers.find((a) => a.q === props.q);
  const at = props.inline ? { unitId: props.unitId, stage: props.stage, q: props.q } : null;
  if (!k) {
    const words =
      keyQ === null
        ? props.stage === "fighter"
          ? (props.noKey ?? "Check his answer in his notebook.")
          : "No answer key for this workbook yet."
        : "This question isn't in the answer key.";
    return <KeyView k={null} note={words} at={at} />;
  }
  return <KeyView k={k} at={at} max={Math.round((props.max ?? 64) * 0.7)} maxH={Math.round((props.maxH ?? 150) * 0.75)} oneMax={props.max} oneMaxH={props.maxH} />;
}

/**
 * A key's answer as a card shows it: part by part (each part's name in a chip, its answer big), or one answer big.
 * With `at` (the printed question's icon on): the question as printed, each part's answer under its own sub-question
 * and a one-answer question's answer after it, in a box of its own (`.bq-ans`). `k` null: `note` instead of the answer.
 * Shared by Evaluation, Theory, Consultation, the desk, the whiteboard and Correction's theory books.
 */
export function KeyView(props: {
  k: KeyAnswer | null;
  note?: string;
  at: { unitId: string; stage: Stage; q: number } | null;
  /** A part's answer size; one answer's (undefined = BigAnswer's own). */
  max?: number;
  maxH?: number;
  oneMax?: number;
  oneMaxH?: number;
}) {
  const { k, at } = props;
  const parts = k?.parts?.length ? k.parts : null;
  const rows = parts
    ? parts.map((p, j) => (
        <li key={j} class="fc-part" slot={at ? `p${j}` : undefined}>
          <em class="fc-pl">{p.p}</em>
          <BigAnswer text={p.a} max={props.max ?? 44} maxH={props.maxH ?? 110} />
        </li>
      ))
    : null;
  if (!at) {
    if (!k) return <p class="fc-anote">{props.note}</p>;
    return rows ? <ul class="fc-parts">{rows}</ul> : <BigAnswer text={k.a ?? ""} max={props.oneMax} maxH={props.oneMaxH} />;
  }
  return (
    <BookQuestion unitId={at.unitId} stage={at.stage} q={at.q} parts={parts ? parts.map((p) => p.p) : []}>
      {rows ?? (
        <div class="bq-ans">
          {k ? <BigAnswer text={k.a ?? ""} max={props.oneMax} maxH={props.oneMaxH} /> : <p class="fc-anote">{props.note}</p>}
        </div>
      )}
    </BookQuestion>
  );
}

/**
 * Explain online (12 Nov 2026, his words: "near that we can put another button like calling the student to explain in
 * the online inside the thread. So small icon"): headphones. Filled once the thread is open (he is asked for his photo).
 */
export function OnlineButton(props: { q: string; on: boolean; names: string; go: () => void }) {
  return (
    <button
      type="button"
      class={`fc-tmb fc-onl${props.on ? " on" : ""}`}
      aria-pressed={props.on}
      aria-label={props.on ? `${props.q}: an online thread is open for ${props.names}` : `Explain ${props.q} online to ${props.names}: open a thread and ask for his photo`}
      onClick={props.go}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
        <rect x="3" y="13.5" width="4.5" height="6.5" rx="1.6" />
        <rect x="16.5" y="13.5" width="4.5" height="6.5" rx="1.6" />
      </svg>
    </button>
  );
}

/** Teaching mode's button on a card: a whiteboard on its stand. */
export function TeachButton(props: { q: string; onOpen: () => void }) {
  return (
    <button type="button" class="fc-tmb" aria-label={`Teaching mode: ${props.q} and its answer, full screen`} onClick={props.onOpen}>
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="3.5" width="18" height="12" rx="1.6" />
        <path d="M8.5 21l3.5-5.5 3.5 5.5" />
        <path d="M7 8h7M7 11.2h4.5" />
      </svg>
    </button>
  );
}

/** The question as printed, big, in teaching mode; a note when the book's questions aren't in the app. */
export function PrintedQuestion(props: { unitId: string | null | undefined; stage: Stage; q: number; inApp?: boolean }) {
  const has = !!props.unitId && (props.inApp ?? (bookDocAt(props.unitId, props.stage)?.qCount ?? 0) > 0);
  if (!has) {
    return (
      <p class="fc-anote tm-noq">
        This book's questions aren't in the app yet: look at his book. <small>(Settings → Books: upload its zip again.)</small>
      </p>
    );
  }
  return (
    <div class="tm-q">
      <BookQuestion unitId={props.unitId!} stage={props.stage} q={props.q} />
    </div>
  );
}

/**
 * Teaching mode: the whole screen (over the top bar and the tabs) until she closes it. The book on top (a theory
 * book's section: its letter and Tamil title), the page's squares, then the card (the question as printed, the answer
 * big) and the page's own buttons at the bottom. The phone's Back button closes it (Android). Done appears when
 * everyone with her is decided.
 */
export function TeachMode(props: {
  room: "evaluation" | "theory";
  title: ComponentChildren;
  /** What changes when another question opens: the card scrolls back to its top. */
  at: string;
  strip: ComponentChildren;
  pad: ComponentChildren;
  done?: { n: number; busy: boolean; onDone: () => void } | null;
  onClose: () => void;
  children: ComponentChildren;
}) {
  const close = useRef(props.onClose);
  close.current = props.onClose;
  const body = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // The phone's Back button closes it: one history step while it is open, taken back when it closes another way.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const mark = `tm${Date.now()}`;
    let popped = false;
    try {
      history.pushState({ ...(history.state ?? {}), tm: mark }, "");
    } catch {
      /* no history here */
    }
    const onPop = () => {
      popped = true;
      close.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    window.addEventListener("popstate", onPop);
    document.addEventListener("keydown", onKey);
    document.body.classList.add("tm-on");
    panel.current?.focus();
    return () => {
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("keydown", onKey);
      document.body.classList.remove("tm-on");
      if (!popped && (history.state as { tm?: string } | null)?.tm === mark) history.back();
      prev?.focus?.();
    };
  }, []);
  useEffect(() => {
    body.current?.scrollTo?.(0, 0);
  }, [props.at]);

  const d = props.done;
  return (
    <div class={`tm tm-${props.room}`} role="dialog" aria-modal="true" aria-label="Teaching mode" tabIndex={-1} ref={panel}>
      <div class="tm-top">
        <p class="tm-title">{props.title}</p>
        {d && d.n > 0 && (
          <button type="button" class="btn tm-done" disabled={d.busy} onClick={d.onDone}>
            Done {d.n}
          </button>
        )}
        <button type="button" class="icon-btn tm-x" aria-label="Close teaching mode" onClick={() => close.current()}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </button>
      </div>
      <div class="tm-strip">{props.strip}</div>
      <div class="tm-body" ref={body}>
        {props.children}
        {props.pad}
      </div>
    </div>
  );
}
