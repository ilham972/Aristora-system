// Move a student on: the next unit, the next stage, Exam Sprint before an exam, or up a grade.
// The usual next steps are one tap; anything else is three choices (grade and term, stage, unit).

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { termOf } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import type { View } from "./derive";
import { useQuery } from "./live";
import { act, allUnits, currentRole, now, stageName, STAGES, toast, type Stage, type Unit } from "./store";
import { Sheet } from "./ui";

type BookInfo = { unitId: string; stage: "fighter" | "master" };
type Step = { label: string; grade: number; term: number; stage: Stage; unitId?: string };

function termUnits(units: Unit[], grade: number, term: number): Unit[] {
  return units.filter((u) => u.grade === grade && u.term === term).sort((a, b) => a.order - b.order);
}

/** The usual next steps for this student, most likely first. */
export function nextSteps(v: View, units: Unit[]): Step[] {
  const g = v.s.grade ?? 11;
  const t = v.s.term ?? termOf(now());
  const list = termUnits(units, g, t);
  const i = list.findIndex((u) => u._id === v.s.unitId);
  const next = i >= 0 && i + 1 < list.length ? list[i + 1] : null;
  const first = list[0];
  const out: Step[] = [];
  const name = (u: Unit) => `${u.code} ${u.en}`;
  if (v.stage === "fighter") {
    if (next) out.push({ label: `Next unit: ${name(next)}`, grade: g, term: t, stage: "fighter", unitId: next._id });
    if (first) out.push({ label: `Master, unit by unit from ${name(first)}`, grade: g, term: t, stage: "master", unitId: first._id });
  } else if (v.stage === "master") {
    if (next) out.push({ label: `Next workbook: ${name(next)}`, grade: g, term: t, stage: "master", unitId: next._id });
    out.push({ label: "Legend: whole papers", grade: g, term: t, stage: "legend", unitId: v.s.unitId });
  } else if (v.stage === "sprint" && v.s.back) {
    const u = units.find((x) => x._id === v.s.back!.unitId);
    out.push({
      label: `Back to ${stageName(v.s.back.stage)}${u ? `: ${name(u)}` : ""} (exam over)`,
      grade: g,
      term: v.s.back.term,
      stage: v.s.back.stage,
      unitId: v.s.back.unitId,
    });
  }
  if (v.stage !== "sprint") out.push({ label: "Exam Sprint: the exam is close", grade: g, term: t, stage: "sprint", unitId: v.s.unitId });
  if (v.stage === "legend" || v.stage === "sprint") {
    if (t < 3) {
      const f = termUnits(units, g, t + 1)[0];
      if (f) out.push({ label: `Term ${t + 1}: Fighter from ${name(f)}`, grade: g, term: t + 1, stage: "fighter", unitId: f._id });
    } else if (g < 11) {
      const f = termUnits(units, g + 1, 1)[0];
      if (f) out.push({ label: `Up to Grade ${g + 1}: Fighter from ${name(f)}`, grade: g + 1, term: 1, stage: "fighter", unitId: f._id });
    }
  }
  return out;
}

export function MoveSheet(props: { v: View; onClose: () => void }) {
  const { v } = props;
  const units = allUnits();
  const books = useQuery<BookInfo[]>(api.catalog.books, {}) ?? [];
  const has = (unitId: string, stage: "fighter" | "master") => books.some((b) => b.unitId === unitId && b.stage === stage);
  const [grade, setGrade] = useState(v.s.grade ?? 11);
  const [term, setTerm] = useState(v.s.term ?? termOf(now()));
  const [stage, setStage] = useState<Stage>((v.stage as Stage) ?? "fighter");
  const [unitId, setUnitId] = useState<string | undefined>(v.s.unitId);
  const list = units.filter((u) => u.grade === grade && (u.term === term || u.term === 0)).sort((a, b) => a.order - b.order);
  const needsUnit = stage === "fighter" || stage === "master";
  const unitOk = !needsUnit || list.some((u) => u._id === unitId);
  const same = grade === v.s.grade && term === v.s.term && stage === v.stage && (!needsUnit || unitId === v.s.unitId);

  const go = async (st: Step) => {
    const r = await act(() =>
      mutate(api.students.move, {
        id: v.s._id,
        grade: st.grade,
        term: st.term,
        stage: st.stage,
        unitId: st.unitId as Id<"units"> | undefined,
        by: currentRole(),
      }),
    );
    if (r !== undefined) {
      toast(`${v.s.name}: ${stageName(st.stage)}, Grade ${st.grade}, Term ${st.term}.`);
      props.onClose();
    }
  };

  return (
    <Sheet
      title={`Move ${v.s.name}`}
      sub={`Now: Grade ${v.s.grade ?? "?"} · Term ${v.s.term ?? "?"} · ${stageName(v.stage as Stage)}${v.unit ? ` · ${v.unit.code} ${v.unit.en}` : ""}`}
      onClose={props.onClose}
      foot={
        <button
          type="button"
          class="btn primary wide"
          disabled={!unitOk || same}
          onClick={() => void go({ label: "", grade, term, stage, unitId: needsUnit ? unitId : unitOk ? unitId : undefined })}
        >
          {same ? "Already here" : `Move to ${stageName(stage)}${needsUnit && unitOk ? `: ${list.find((u) => u._id === unitId)?.code}` : ""}`}
        </button>
      }
    >
      <div class="mv-steps">
        {nextSteps(v, units).map((st) => (
          <button key={st.label} type="button" class="mv-step" onClick={() => void go(st)}>
            {st.label}
            {st.unitId && (st.stage === "fighter" || st.stage === "master") && !has(st.unitId, st.stage) && (
              <small>no {st.stage === "fighter" ? "theory book" : "workbook"} in the app yet</small>
            )}
          </button>
        ))}
      </div>
      <h3 class="block-title">Or choose</h3>
      <div class="chip-pick" role="group" aria-label="Grade">
        {[6, 7, 8, 9, 10, 11].map((g) => (
          <button key={g} type="button" class={g === grade ? "on" : ""} aria-pressed={g === grade} onClick={() => setGrade(g)}>
            Grade {g}
          </button>
        ))}
      </div>
      <div class="chip-pick" role="group" aria-label="Term">
        {[1, 2, 3].map((t) => (
          <button key={t} type="button" class={t === term ? "on" : ""} aria-pressed={t === term} onClick={() => setTerm(t)}>
            Term {t}
          </button>
        ))}
      </div>
      <div class="chip-pick" role="group" aria-label="Stage">
        {STAGES.map((s) => (
          <button key={s.id} type="button" class={s.id === stage ? "on" : ""} aria-pressed={s.id === stage} onClick={() => setStage(s.id)}>
            {s.name}
          </button>
        ))}
      </div>
      <ul class="mv-units" aria-label="Unit">
        {list.map((u) => (
          <li key={u._id}>
            <button type="button" class={u._id === unitId ? "on" : ""} aria-pressed={u._id === unitId} onClick={() => setUnitId(u._id)}>
              <b>{u.code}</b>
              <span>{u.en}</span>
              <small>
                {has(u._id, "fighter") ? "Fighter ✓ " : ""}
                {has(u._id, "master") ? "Master ✓" : ""}
              </small>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
