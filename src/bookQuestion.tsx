// One printed question, as the book draws it (teachers only), on Correction's, Evaluation's, Theory's, Consultation's
// and the desk's question card (its icon in the card's top line), and big in teaching mode (src/qcard.tsx).
// - Fetched while open: the question (catalog.question) and its book's CSS (catalog.bookCss, once per book).
// - Drawn by src/questionView.ts (shared with the family app): a shadow root, cleaned again, figures fitted.
// - Inline (13 Nov 2026, his ask: "the question, then the answer, the question and the answer ... same like in the
//   thread"): with `parts`, the card's own answer rows (the key, what he typed, the marks) sit right under their own
//   sub-question (`slotParts`, as the thread does); a row with no part of its own goes after the whole question.

import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useQuery } from "./live";
import { drawQuestion } from "./questionView";
import { bookDocAt } from "./store";

type Stage = "fighter" | "master";

/**
 * The question with its answers inside (13 Nov 2026, his second look: "so many boxes ... so many margins ... the
 * question number again ... like a screenshot"): the thread's paper (src/family/help.tsx `PAPER`) in the class app's
 * font: no printed number or marks (the card's pill says it), almost no padding, a sub-question's label only as wide
 * as its words, no indent; readable text, not a page shrunk to the phone.
 */
const INLINE_PAPER = `.qv{border-radius:0;padding:2px 2px 0;font:500 15.5px/1.5 var(--font);color:#16213e}
.qv :not(svg):not(svg *):not(.mi):not(.mi *){font-family:var(--font)!important}
.qv .qn,.qv .pm,.qv .mk{display:none!important}
.qv .sq{margin-left:0!important}
.qv .rp{grid-template-columns:auto minmax(0,1fr)!important;column-gap:6px!important;gap:0 6px}
.qv .rl{width:auto!important;min-width:0!important;flex:none;padding:0!important;margin:0!important}`;

/**
 * One question drawn as printed; `null` from the server = not in the app. With `parts` (the key's part labels, in its
 * order) the children are the card's answer rows, each with `slot="p<i>"` (its part) or none (after the question):
 * they stay the page's own elements (its styles, its taps). Until the question is there they show as a plain list.
 */
export function BookQuestion(props: { unitId: string; stage: Stage; q: number; parts?: string[]; children?: ComponentChildren }) {
  const unitId = props.unitId as Id<"units">;
  const css = useQuery<{ css: string } | null>(api.catalog.bookCss, { unitId, stage: props.stage });
  const qq = useQuery<{ html: string } | null>(api.catalog.question, { unitId, stage: props.stage, q: props.q });
  const host = useRef<HTMLDivElement>(null);
  const inline = props.parts !== undefined;
  const sig = props.parts?.join("\n") ?? "";

  useLayoutEffect(() => {
    const el = host.current;
    if (!el || !qq || !css) return;
    const undo = drawQuestion(el, qq.html, css.css, inline ? INLINE_PAPER : "", props.parts, true);
    // A row whose part found no printed sub-question (its slot at the end) keeps its own label: `data-loose`.
    const box = el.shadowRoot?.querySelector(".qv");
    for (const c of Array.from(el.children)) {
      const n = c.getAttribute("slot");
      const slot = n ? el.shadowRoot?.querySelector(`slot[name="${n}"]`) : null;
      c.toggleAttribute("data-loose", !slot || slot.parentElement === box);
    }
    return undo;
  }, [qq, css, sig]);

  const flat = (words: string) => (
    // The answers stay usable while the question loads (or when it isn't in the app): a plain list, as when closed.
    <div class="bq-flat" key="flat">
      <p class="muted small bq-none">{words}</p>
      {props.children}
    </div>
  );
  if (qq === null || css === null) {
    const words = "This question isn't in the app yet: upload the book's zip again.";
    return inline ? flat(words) : <p class="muted small bq-none">{words}</p>;
  }
  if (qq === undefined || css === undefined) return inline ? flat("Loading the question…") : <p class="muted small bq-none">Loading the question…</p>;
  return (
    // Keyed by the question: a new question gets a new host (its shadow root drawn fresh, the rows slotted again).
    <div class={`bq-view${inline ? " bq-inline" : ""}`} key={`${props.unitId}:${props.stage}:${props.q}`} ref={host} aria-label={`Question ${props.q} as printed`}>
      {inline && props.children}
    </div>
  );
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
