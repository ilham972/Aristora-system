// Settings → Students → O/L map (4 Nov 2026, his ask: "who will see the O level syllabus, and who will see the Grade 11
// syllabus?"): which students see the O/L syllabus on the family app (app.aristora.org).
// - Ticked (Grade 10 and 11 only): the O/L topics by paper part (Paper I A, I B, II A, II B) instead of his grade's
//   terms, the first topic in the app open to start. The others keep their grade's map; an O/L book the class gives
//   one of them still shows there, as one more World (convex/lib/family.ts).
// - A tick per student, saved as you tap; All / None for the whole grade. His Family sheet has the same tick.
// - Today's topic (his words, the same night: "now I want to show specific unit today ... that's what I taught
//   lastly"): an O/L topic whose workbook is in the app, given to every ticked student in one tap (Books given, as on
//   Correction): it opens on their phones and their Continue goes to it (the newest book given comes first). Tap it
//   again to take it back from them; the toast has Undo.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { OlTopic } from "../convex/families";
import { OL } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import type { View } from "./derive";
import { useQuery } from "./live";
import { act, currentRole, toast } from "./store";
import { Sheet } from "./ui";

const PART = ["", "1A", "1B", "2A", "2B"];

/** The students of a grade who can have the O/L map: real ones (demo and test students have no family app). */
export function olMapList(views: View[], grade: number): View[] {
  return views.filter((v) => v.s.grade === grade && !v.s.demo && !v.s.test);
}

/** "08 · அமைப்பு": an O/L topic as his sheet numbers it. */
const topicWords = (t: OlTopic) => `${String(t.no).padStart(2, "0")} · ${t.ta || t.en}`;

export function OlMapSheet(props: { grade: number; views: View[]; onClose: () => void }) {
  const list = olMapList(props.views, props.grade);
  // A tap shows at once; the server's answer (state.get) follows.
  const [mine, setMine] = useState<Record<string, boolean>>({});
  const isOn = (v: View) => mine[v.s._id] ?? !!v.s.olMap;
  // Once the server has a tap, its value wins again (another phone may change it later).
  useEffect(() => {
    const left = Object.entries(mine).filter(([id, on]) => !!list.find((v) => v.s._id === id)?.s.olMap !== on);
    if (left.length !== Object.keys(mine).length) setMine(Object.fromEntries(left));
  }, [props.views]);
  const ticked = list.filter(isOn);
  const info = useQuery<{ topics: OlTopic[]; given: Record<string, string[]> }>(api.families.olTopics, { grade: props.grade });
  const [busy, setBusy] = useState(false);

  const tick = async (vs: View[], on: boolean) => {
    const was = mine;
    setMine({ ...mine, ...Object.fromEntries(vs.map((v) => [v.s._id, on])) });
    const n = await act(() => mutate(api.families.setOlMap, { studentIds: vs.map((v) => v.s._id), on, by: currentRole() }));
    if (n === undefined) setMine(was);
  };
  const give = async (t: OlTopic, vs: View[], on: boolean, undo = true) => {
    const ids = vs.map((v) => v.s._id as Id<"students">);
    setBusy(true);
    const n = await act(() => mutate(api.students.giveMany, { ids, unitId: t.unitId, stage: "master", given: on, by: currentRole() }));
    setBusy(false);
    if (n === undefined) return;
    const who = n === 1 ? "1 phone" : `${n} phones`;
    toast(
      on ? `${topicWords(t)}: open on ${who} now.` : `${topicWords(t)}: taken back from ${who}.`,
      "info",
      undo ? () => void give(t, vs, !on, false) : undefined,
    );
  };

  return (
    <Sheet
      title="O/L map on the phone"
      sub={`Ticked students see the O/L syllabus on the family app (Paper 1A, 1B, 2A, 2B) instead of Grade ${props.grade}'s terms.`}
      onClose={props.onClose}
      cls="olm-sheet"
    >
      <div class="olm-top">
        <b>
          {ticked.length} of {list.length} ticked
        </b>
        <button type="button" class="btn ghost small" disabled={list.length === 0 || ticked.length === list.length} onClick={() => void tick(list, true)}>
          All
        </button>
        <button type="button" class="btn ghost small" disabled={ticked.length === 0} onClick={() => void tick(ticked, false)}>
          None
        </button>
      </div>

      <h3 class="block-title">Today's topic</h3>
      <p class="muted small olm-how">
        Give the topic you taught: it opens on the ticked students' phones, and their Continue goes to it. It counts as a
        book given, as on Correction.
      </p>
      {!info ? (
        <p class="muted">Loading…</p>
      ) : info.topics.length === 0 ? (
        <p class="muted">No O/L workbook in the app yet. Upload one: Settings → Books.</p>
      ) : (
        <ul class="plain-list olm-topics">
          {info.topics.map((t) => {
            const have = new Set(info.given[t.unitId] ?? []);
            const missing = ticked.filter((v) => !have.has(v.s._id));
            const all = ticked.length > 0 && missing.length === 0;
            const some = ticked.length - missing.length;
            return (
              <li key={t.unitId} class={all ? "on" : ""}>
                <span class="olm-tn">
                  <b>{String(t.no).padStart(2, "0")}</b>
                  <span>
                    <span class="olm-tt">{t.ta || t.en}</span>
                    <small>
                      Paper {PART[t.part] ?? ""} · {t.levels} Levels{t.phone ? "" : " · marked in class"}
                      {some > 0 && !all ? ` · ${some} of ${ticked.length} have it` : ""}
                    </small>
                  </span>
                </span>
                <button
                  type="button"
                  class={`btn small ${all ? "ghost" : "primary"}`}
                  disabled={busy || ticked.length === 0}
                  aria-label={`${all ? "Take back" : "Give"} ${topicWords(t)}`}
                  onClick={() => void (all ? give(t, ticked, false) : give(t, missing, true))}
                >
                  {all ? "✓ Given" : "Give"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <h3 class="block-title">Grade {props.grade} students</h3>
      {list.length === 0 ? (
        <p class="muted">No Grade {props.grade} students yet.</p>
      ) : (
        <ul class="plain-list olm-kids">
          {list.map((v) => (
            <li key={v.s._id}>
              <label class="olm-kid">
                <input type="checkbox" checked={isOn(v)} onChange={(e) => void tick([v], (e.target as HTMLInputElement).checked)} />
                <span>
                  <span>{v.s.name}</span>
                  <small>
                    {typeof v.s.index === "number" ? `#${v.s.index}` : ""}
                    {v.unit ? ` · ${v.unit.grade === OL ? `OL · ${v.unit.ta || v.unit.en}` : `${v.unit.code} ${v.unit.en}`}` : ""}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
