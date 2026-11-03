// One printed question, as the book draws it (teachers only), under Correction's, Evaluation's and Theory's question
// card (its icon in the card's top line), and big in teaching mode (src/qcard.tsx).
// - Fetched while open: the question (catalog.question) and its book's CSS (catalog.bookCss, once per book).
// - Drawn by src/questionView.ts (shared with the family app): a shadow root, cleaned again, figures fitted.

import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useQuery } from "./live";
import { drawQuestion } from "./questionView";
import { bookDocAt } from "./store";

type Stage = "fighter" | "master";

/** One question drawn as printed; `null` from the server = not in the app. */
export function BookQuestion(props: { unitId: string; stage: Stage; q: number }) {
  const unitId = props.unitId as Id<"units">;
  const css = useQuery<{ css: string } | null>(api.catalog.bookCss, { unitId, stage: props.stage });
  const qq = useQuery<{ html: string } | null>(api.catalog.question, { unitId, stage: props.stage, q: props.q });
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !qq || !css) return;
    return drawQuestion(el, qq.html, css.css);
  }, [qq, css]);

  if (qq === null || css === null) return <p class="muted small bq-none">This question isn't in the app yet: upload the book's zip again.</p>;
  if (qq === undefined || css === undefined) return <p class="muted small bq-none">Loading the question…</p>;
  return <div class="bq-view" ref={host} aria-label={`Question ${props.q} as printed`} />;
}

let shownHere = false; // stays open from one question to the next on this phone (until the page reloads)

/** The switch is a small icon in the card's top line (Correction 2 Nov 2026, Evaluation and Theory 3 Nov), and only when
 *  the book's questions are in the app (no pale "No question text" line taking the answer's room). */
export function useQuestionShown(unitId: string | null | undefined, stage: Stage, inApp?: boolean) {
  const [open, setOpen] = useState(shownHere);
  // `inApp`: the page knows (a book nobody in class is on isn't on the board: the whole-class lesson).
  const has = !!unitId && (inApp ?? (bookDocAt(unitId, stage)?.qCount ?? 0) > 0);
  const flip = () => {
    shownHere = !open;
    setOpen(!open);
  };
  return { has, open: open && has, flip };
}

export function QuestionIcon(props: { q: string; shown: ReturnType<typeof useQuestionShown> }) {
  const { has, open, flip } = props.shown;
  if (!has) return null;
  return (
    <button
      type="button"
      class={`fc-qdoc${open ? " on" : ""}`}
      aria-expanded={open}
      aria-label={open ? `Hide ${props.q} as printed` : `Show ${props.q} as printed`}
      onClick={flip}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M9 12h7M9 16h5" />
      </svg>
    </button>
  );
}
