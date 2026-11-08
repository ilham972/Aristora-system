// Settings → Students → Boys and girls (8 Nov 2026, his rule for private messages in Us: "girl student and boy student
// can't message each other ... boy can chat another boy. Girl can chat another girl. Whatever grade"; teachers anyone).
// A Boy / Girl pair per student, saved as tapped (the owner and the Students tick); a student not set yet messages
// teachers only, and only teachers him (convex/lib/chat.ts mayMessage). Groups are for everyone (his answer: "like the
// hall"), so this decides private messages only.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { mutate } from "./backend";
import type { View } from "./derive";
import { act, currentRole } from "./store";
import { Sheet } from "./ui";

type Sex = "b" | "g";

/** The students of a grade who can be set: real ones (demo and test students have no family app). */
export function sexList(views: View[], grade: number): View[] {
  return views.filter((v) => v.s.grade === grade && !v.s.demo && !v.s.test);
}

export function SexSheet(props: { grade: number; views: View[]; onClose: () => void }) {
  const list = sexList(props.views, props.grade);
  // A tap shows at once; the server's answer (state.get) follows and wins again.
  const [mine, setMine] = useState<Record<string, Sex | null>>({});
  const sexOf = (v: View): Sex | null => (v.s._id in mine ? mine[v.s._id] : (v.s.sex ?? null));
  useEffect(() => {
    const left = Object.entries(mine).filter(([id, x]) => (list.find((v) => v.s._id === id)?.s.sex ?? null) !== x);
    if (left.length !== Object.keys(mine).length) setMine(Object.fromEntries(left));
  }, [props.views]);
  const set = async (vs: View[], sex: Sex | null) => {
    const was = mine;
    setMine({ ...mine, ...Object.fromEntries(vs.map((v) => [v.s._id, sex])) });
    const n = await act(() => mutate(api.students.setSex, { ids: vs.map((v) => v.s._id as Id<"students">), sex, by: currentRole() }));
    if (n === undefined) setMine(was);
  };
  const boys = list.filter((v) => sexOf(v) === "b").length;
  const girls = list.filter((v) => sexOf(v) === "g").length;
  const unset = list.filter((v) => !sexOf(v));
  return (
    <Sheet
      title="Boys and girls"
      sub={`For private messages in Us: boys message boys, girls message girls (any grade), teachers anyone. A student not set yet messages teachers only.`}
      onClose={props.onClose}
      cls="olm-sheet"
    >
      <div class="olm-top">
        <b>
          {boys} {boys === 1 ? "boy" : "boys"} · {girls} {girls === 1 ? "girl" : "girls"}
          {unset.length ? ` · ${unset.length} not set` : ""}
        </b>
      </div>
      {list.length === 0 ? (
        <p class="muted">No Grade {props.grade} students yet.</p>
      ) : (
        <ul class="plain-list sex-kids">
          {list.map((v) => {
            const x = sexOf(v);
            return (
              <li key={v.s._id}>
                <span class="sex-name">{v.s.name}</span>
                <span class="sex-pick" role="group" aria-label={`${v.s.name}: boy or girl`}>
                  <button type="button" class={`btn small ${x === "b" ? "primary" : "ghost"}`} aria-pressed={x === "b"} onClick={() => void set([v], x === "b" ? null : "b")}>
                    👦 Boy
                  </button>
                  <button type="button" class={`btn small ${x === "g" ? "primary" : "ghost"}`} aria-pressed={x === "g"} onClick={() => void set([v], x === "g" ? null : "g")}>
                    👧 Girl
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {unset.length === 0 && list.length > 0 && <p class="muted small sex-done">✓ Every Grade {props.grade} student is set.</p>}
    </Sheet>
  );
}

/** The line on Settings → Students: how many are set. */
export function sexWords(views: View[], grade: number): string {
  const list = sexList(views, grade);
  const set = list.filter((v) => v.s.sex).length;
  if (!list.length) return "No students yet";
  return set === list.length ? `All ${list.length} set · private messages in Us` : `${set} of ${list.length} set · until then: teachers only`;
}
