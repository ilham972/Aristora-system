// Settings → Books: exam mode and the Sakarath books (17 Nov 2026, his voice note; convex/lib/sakarath.ts).
// - Exam mode (the owner): one switch per grade, in one row of grades (his answer "One per grade"). On, that grade's
//   phones open each unit's Sakarath book on the Learn map instead of its past papers; off, the past papers again.
//   Two taps (the second within a few seconds): one tap changes every phone of a grade.
// - S on each unit's row (his ask: "I want to put the icon ... for each card of the book. So I can know ... it's
//   uploaded for that each grade and each unit or not"): gold = its Sakarath book is in the app; a tap shows it (its
//   levels, how much the phone marks, Preview on the phone).

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate } from "./backend";
import { useQuery } from "./live";
import { act, currentRole, may, toast, type Unit } from "./store";
import { PhoneAnswers } from "./familySheet";
import { GRADES, Sheet } from "./ui";

type Exam = { on: number[]; books: Record<string, number> };

/** How long the first tap waits for the second. */
const SURE_MS = 4000;

export function ExamMode() {
  const ex = useQuery<Exam>(api.sakarath.exam, {});
  const [armed, setArmed] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (!ex) return null;
  const tap = async (g: number) => {
    const on = ex.on.includes(g);
    if (!on && !ex.books[String(g)]) return toast(`Grade ${g} has no Sakarath book in the app yet.`);
    if (armed !== g) {
      setArmed(g);
      toast(on ? `Tap ${g} again: Grade ${g} goes back to the past papers.` : `Tap ${g} again: Grade ${g}'s phones open the Sakarath book.`);
      window.setTimeout(() => setArmed((a) => (a === g ? null : a)), SURE_MS);
      return;
    }
    setArmed(null);
    setBusy(true);
    const r = await act(() => mutate(api.sakarath.setExam, { grade: g, on: !on, by: currentRole() }));
    setBusy(false);
    if (r !== undefined) toast(on ? `Grade ${g}: exam mode off. Their Stages open the past papers again.` : `Grade ${g}: exam mode on. Every Stage opens its Sakarath book.`);
  };
  return (
    <div class="exam-mode">
      <h3 class="exam-h">Exam mode</h3>
      <p class="muted small">
        On for a grade: on its phones every Stage of the Learn map opens its unit's Sakarath book (all open), not the past
        papers. Off: the past papers again. Nothing they did is lost.
      </p>
      <div class="exam-row" role="group" aria-label="Exam mode">
        {GRADES.map((g) => {
          const on = ex.on.includes(g);
          const n = ex.books[String(g)] ?? 0;
          return (
            <button
              key={g}
              type="button"
              class={`${on ? "on" : ""}${n ? " some" : ""}${armed === g ? " armed" : ""}`}
              aria-pressed={on}
              aria-label={`Exam mode for Grade ${g}: ${on ? "on" : "off"}, ${n} Sakarath books`}
              disabled={busy || (!on && !n)}
              onClick={() => void tap(g)}
            >
              <b>{g}</b>
              <small>{on ? "ON" : n ? "off" : "—"}</small>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export type SkBook = { levels: number; questions: number; marks: number; keyCount: number };

/** One unit's Sakarath book: what is in the app, and the owner's Preview of it. */
export function SakarathSheet(props: { unit: Unit; sk: Unit | null; book: SkBook | null; onClose: () => void }) {
  const { unit, sk, book } = props;
  return (
    <Sheet title={`${unit.code} · Sakarath book`} sub={unit.ta} onClose={props.onClose}>
      {sk && book ? (
        <>
          <p class="small key-note ok">
            In the app: {book.levels} level{book.levels === 1 ? "" : "s"}, {book.questions} questions, {book.marks} parts (1 mark each).
            Students see it while exam mode is on for Grade {unit.grade}.
          </p>
          <PhoneAnswers unitId={sk._id} />
        </>
      ) : (
        <p class="muted">
          Not in the app yet. {may("owner") ? "It comes from a Claude chat (Settings → Books → Claude link): send the unit's Sakarath source there." : ""}
        </p>
      )}
    </Sheet>
  );
}
