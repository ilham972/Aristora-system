// Grade pills: one register for every grade, but each teacher can look at one grade at a time.
// Every pill shows what is waiting for THIS teacher in that grade (red: someone needs you now; amber: ready soon),
// so nothing is missed behind a filter. Calls, "With you" and the alerts are never filtered.

import { useState } from "preact/hooks";
import { evalQueue, theoryGroups, waitingAll, type View } from "./derive";
import type { Board, Role } from "./store";

export type GradeFilter = "all" | number;
export type Need = "red" | "amber";

/** What needs this tab's teacher, student by student. */
export function needsOf(role: Role, board: Board, views: View[], now: number): Map<string, Need> {
  const out = new Map<string, Need>();
  const put = (id: string, n: Need) => {
    if (out.get(id) !== "red") out.set(id, n);
  };
  if (role === "correction") {
    // Calls to send, and workbook students whose every handed-in level waits for marks.
    for (const c of board.calls) if (c.status === "requested" && !c.pull) put(c.studentId, "red");
    for (const v of views) {
      if (v.where === "absent") continue;
      if (v.noWork && v.ms?.needs.includes("correction")) put(v.s._id, "red");
      else if (waitingAll(v) || v.quiet) put(v.s._id, "amber");
    }
  } else if (role === "theory") {
    for (const g of theoryGroups(views)) {
      for (const m of g.members) {
        if (m.urgency === "red" && !m.inEvaluation) put(m.v.s._id, "red");
        else if (m.urgency === "amber") put(m.v.s._id, "amber");
      }
    }
  } else {
    for (const m of evalQueue(views, now)) {
      if (m.blockedBy) continue;
      if (m.urgency === "red") put(m.v.s._id, "red");
      else if (m.urgency === "ready") put(m.v.s._id, "amber");
    }
  }
  return out;
}

/** The grades that have students, youngest first. */
export function gradesOf(views: View[]): number[] {
  return [...new Set(views.map((v) => v.s.grade).filter((g): g is number => typeof g === "number"))].sort((a, b) => a - b);
}

const storeKey = (role: Role) => `aristora.grade.${role}`;

/** This phone's grade filter for this tab, remembered. Falls back to "all" when that grade has nobody. */
export function useGradeFilter(role: Role, grades: number[]): [GradeFilter, (g: GradeFilter) => void] {
  const [chosen, setChosen] = useState<GradeFilter>(() => {
    try {
      const raw = localStorage.getItem(storeKey(role));
      return raw && /^\d+$/.test(raw) ? Number(raw) : "all";
    } catch {
      return "all";
    }
  });
  const set = (g: GradeFilter) => {
    setChosen(g);
    try {
      localStorage.setItem(storeKey(role), String(g));
    } catch {
      /* private mode */
    }
  };
  return [chosen !== "all" && grades.length > 1 && grades.includes(chosen) ? chosen : "all", set];
}

export function inGrade(views: View[], filter: GradeFilter): View[] {
  return filter === "all" ? views : views.filter((v) => v.s.grade === filter);
}

export function GradePills(props: {
  views: View[];
  needs: Map<string, Need>;
  filter: GradeFilter;
  onPick: (g: GradeFilter) => void;
}) {
  const grades = gradesOf(props.views);
  if (grades.length < 2) return null;
  const here = (vs: View[]) => vs.filter((v) => v.where !== "absent").length;
  const pill = (g: GradeFilter) => {
    const vs = inGrade(props.views, g);
    let red = 0;
    let amber = 0;
    if (g !== "all") {
      for (const v of vs) {
        const n = props.needs.get(v.s._id);
        if (n === "red") red++;
        else if (n === "amber") amber++;
      }
    }
    const on = props.filter === g;
    const n = here(vs);
    // Numbers only ("7", not "Grade 7" or "G7"): the row fits on the smallest phones.
    const label = g === "all" ? "All" : String(g);
    const words = `${g === "all" ? "All grades" : `Grade ${g}`}: ${n} here${red ? `, ${red} need you now` : amber ? `, ${amber} need you soon` : ""}`;
    return (
      <button key={String(g)} type="button" class={`gp${on ? " on" : ""}`} aria-pressed={on} aria-label={words} onClick={() => props.onPick(g)}>
        <b>{label}</b>
        <small>{n}</small>
        {red > 0 ? <i class="gp-badge red">{red}</i> : amber > 0 ? <i class="gp-badge amber">{amber}</i> : null}
      </button>
    );
  };
  return (
    <nav class="grade-pills" aria-label="Show one grade">
      {pill("all")}
      {grades.map((g) => pill(g))}
    </nav>
  );
}
