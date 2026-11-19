// Settings → Books: exam mode and the Sakarath books (17 Nov 2026, his voice note; convex/lib/sakarath.ts).
// - Exam mode (the owner): one switch per grade, in one row of grades (his answer "One per grade"). On, that grade's
//   phones open each unit's Sakarath book on the Learn map instead of its past papers; off, the past papers again.
//   Two taps (the second within a few seconds): one tap changes every phone of a grade.
// - S on each unit's row (his ask: "I want to put the icon ... for each card of the book. So I can know ... it's
//   uploaded for that each grade and each unit or not"): gold = its Sakarath book is in the app; a tap shows it (its
//   levels, how much the phone marks, Preview on the phone).
// - OL (19 Nov 2026): one more switch after 11, for the students ticked for the O/L map; the O/L book has units of its own
//   (lib/sakarath.ts), listed with their S at the end of Books → OL (`OlSakarath`).

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate } from "./backend";
import { useQuery } from "./live";
import { act, currentRole, may, toast, type Unit } from "./store";
import { PhoneAnswers } from "./familySheet";
import { Sheet } from "./ui";
import { EXAM_GRADES, plainNames, realGrade, SK_OL_PARTS } from "../convex/lib/sakarath";
import { gradeName, gradeWords, OL } from "../convex/lib/syllabus";

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
    const who = gradeWords(g);
    if (!on && !ex.books[String(g)]) return toast(`${who} has no Sakarath book in the app yet.`);
    if (armed !== g) {
      setArmed(g);
      const name = gradeName(g);
      if (g === OL) toast(on ? `Tap OL again: the O/L map goes back to its 53 topics.` : `Tap OL again: the O/L map's phones open the O/L Sakarath book.`);
      else toast(on ? `Tap ${name} again: ${who} goes back to the past papers.` : `Tap ${name} again: ${who}'s phones open the Sakarath book.`);
      window.setTimeout(() => setArmed((a) => (a === g ? null : a)), SURE_MS);
      return;
    }
    setArmed(null);
    setBusy(true);
    const r = await act(() => mutate(api.sakarath.setExam, { grade: g, on: !on, by: currentRole() }));
    setBusy(false);
    if (r !== undefined) {
      if (g === OL) toast(on ? "OL: exam mode off. The O/L map shows its 53 topics again." : "OL: exam mode on. The O/L map shows the Sakarath book's units, all open.");
      else toast(on ? `${who}: exam mode off. Their Stages open the past papers again.` : `${who}: exam mode on. Every Stage opens its Sakarath book.`);
    }
  };
  return (
    <div class="exam-mode">
      <h3 class="exam-h">Exam mode</h3>
      <p class="muted small">
        On for a grade: on its phones every Stage of the Learn map opens its unit's Sakarath book (all open), not the past
        papers. OL: the students ticked for the O/L map see the O/L Sakarath book's own units. Off: as before. Nothing they
        did is lost.
      </p>
      <div class="exam-row" role="group" aria-label="Exam mode">
        {EXAM_GRADES.map((g) => {
          const on = ex.on.includes(g);
          const n = ex.books[String(g)] ?? 0;
          return (
            <button
              key={g}
              type="button"
              class={`${on ? "on" : ""}${n ? " some" : ""}${armed === g ? " armed" : ""}`}
              aria-pressed={on}
              aria-label={`Exam mode for ${gradeWords(g)}: ${on ? "on" : "off"}, ${n} Sakarath books`}
              disabled={busy || (!on && !n)}
              onClick={() => void tap(g)}
            >
              <b>{gradeName(g)}</b>
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
    <Sheet title={`${realGrade(unit.grade) === OL ? "OL " : ""}${unit.code} · Sakarath book`} sub={plainNames(unit).ta} onClose={props.onClose}>
      {sk && book ? (
        <>
          <p class="small key-note ok">
            In the app: {book.levels} level{book.levels === 1 ? "" : "s"}, {book.questions} questions, {book.marks} parts (1 mark each).{" "}
            {realGrade(unit.grade) === OL
              ? "The students ticked for the O/L map see it while exam mode is on for OL."
              : `Students see it while exam mode is on for ${gradeWords(unit.grade)}.`}
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

type BookRow = { unitId: string; stage: string; keyCount?: number | null; master?: { levels: unknown[]; parts: { to: number }[]; total: number } | null };

/**
 * Books → OL, at the end (19 Nov 2026): the O/L Sakarath book's own units (none of them is one of the 53 topics), by its
 * parts, each with its S (gold = in the app with its key); a tap shows it like a unit's S.
 */
export function OlSakarath(props: { units: Unit[]; books: BookRow[] }) {
  const [open, setOpen] = useState<Unit | null>(null);
  const bookOf = (u: Unit): SkBook | null => {
    const b = props.books.find((x) => x.unitId === u._id && x.stage === "master");
    return b?.master && (b.keyCount ?? 0) > 0 ? { levels: b.master.levels.length, questions: b.master.parts[0]?.to ?? 0, marks: b.master.total, keyCount: b.keyCount ?? 0 } : null;
  };
  if (!props.units.length) return null;
  const parts = [...new Set(props.units.map((u) => u.term))].sort((a, b) => a - b);
  return (
    <div class="ol-sk">
      <h3 class="block-title">ஸகராத் புத்தகம் · Sakarath book (O/L)</h3>
      <p class="muted small">
        Its own {props.units.length} units: the 53 topics merged so that no skill comes twice. Exam mode OL shows these to the
        students ticked for the O/L map.
      </p>
      {parts.map((t) => (
        <div key={t}>
          <h3 class="block-title">{SK_OL_PARTS[t] ? `${t} · ${SK_OL_PARTS[t].ta} · ${SK_OL_PARTS[t].en}` : `Part ${t}`}</h3>
          <ul class="unit-list">
            {props.units
              .filter((u) => u.term === t)
              .map((u) => {
                const b = bookOf(u);
                const name = plainNames(u);
                return (
                  <li key={u._id} class="ul-row">
                    <button type="button" onClick={() => setOpen(u)}>
                      <b>{u.code.slice(1)}</b>
                      <span>
                        {name.en}
                        <small>{name.ta}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      class={`ul-t ul-s${b ? " has" : ""}`}
                      aria-label={b ? `OL ${u.code}: its Sakarath book, ${b.questions} questions` : `OL ${u.code}: no Sakarath book yet`}
                      onClick={() => setOpen(u)}
                    >
                      S
                    </button>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
      {open && <SakarathSheet unit={open} sk={open} book={bookOf(open)} onClose={() => setOpen(null)} />}
    </div>
  );
}
