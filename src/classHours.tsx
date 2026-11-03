// Settings → Class hours (owner; 3 Nov 2026, his answers: "you set the hours", and "different grades have different
// time schedules"): when each grade's class is open each weekday. The family app shows a student his grade's hours as
// his class week and "next class", with the days he usually comes (worked out from his attendance, nothing to type).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { GradeHours, Hours } from "../convex/lib/family";
import { mutate } from "./backend";
import { useQuery } from "./live";
import { act, toast } from "./store";
import { GRADES, GradeRow, useGrade } from "./ui";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** On the row (the full name is its label for screen readers and in messages). */
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const mins = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

type Row = { on: boolean; from: string; to: string };

const rowsOf = (h: Hours): Row[] => h.map((x) => (x ? { on: true, from: hhmm(x.from), to: hhmm(x.to) } : { on: false, from: "15:30", to: "19:30" }));
const hoursOfRows = (rows: Row[]): Hours => rows.map((r) => (r.on ? { from: mins(r.from), to: mins(r.to) } : null));
const same = (a: Hours, b: Hours) => JSON.stringify(a) === JSON.stringify(b);

export function ClassHours() {
  const saved = useQuery<GradeHours>(api.families.classHours, {});
  const [grade, setGrade] = useGrade("aristora.hoursGrade", () => GRADES[0]);
  // What he typed, per grade (switching grades keeps it until he saves).
  const [drafts, setDrafts] = useState<Record<number, Row[]>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!saved) return;
    // Grades he hasn't touched follow the server (another phone may have saved them).
    setDrafts((d) => {
      const next = { ...d };
      for (const g of GRADES) if (!next[g]) next[g] = rowsOf(saved[String(g)] ?? []);
      return next;
    });
  }, [saved]);
  const rows = drafts[grade];
  if (!saved || !rows) return <p class="muted settings-body">Loading…</p>;
  const set = (i: number, patch: Partial<Row>) => setDrafts({ ...drafts, [grade]: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const kept = saved[String(grade)] ?? [];
  const changed = !same(hoursOfRows(rows), kept);
  const save = async () => {
    const bad = rows.findIndex((r) => r.on && mins(r.from) >= mins(r.to));
    if (bad >= 0) return toast(`Grade ${grade}, ${DAYS[bad]}: the class must start before it ends.`, "error");
    setBusy(true);
    const ok = await act(() => mutate(api.families.setClassHours, { grade, hours: hoursOfRows(rows) }));
    setBusy(false);
    if (ok !== undefined) toast(`Grade ${grade}'s class hours saved: its students see them in the family app.`);
  };
  const days = (g: number) => (saved[String(g)] ?? []).filter(Boolean).length;
  return (
    <div class="settings-body ch">
      <p class="muted">
        When each grade's class is open each day. Its students see them in the family app (their week and "next
        class"), with the days each one usually comes.
      </p>
      <GradeRow
        value={grade}
        onPick={setGrade}
        label="Grade"
        count={(g) => {
          const n = days(g);
          return { text: n ? `${n}d` : "–", aria: n ? `${n} class day${n > 1 ? "s" : ""}` : "no class hours yet", some: n > 0 };
        }}
      />
      <ul class="plain-list ch-list">
        {rows.map((r, i) => (
          <li key={DAYS[i]} class={r.on ? "" : "off"}>
            <label class="ch-day">
              <input type="checkbox" aria-label={DAYS[i]} checked={r.on} onChange={() => set(i, { on: !r.on })} />
              <span aria-hidden="true">{SHORT[i]}</span>
            </label>
            <span class="ch-times">
              <input type="time" aria-label={`${DAYS[i]} starts`} value={r.from} disabled={!r.on} onInput={(e) => set(i, { from: (e.target as HTMLInputElement).value })} />
              <span aria-hidden="true">–</span>
              <input type="time" aria-label={`${DAYS[i]} ends`} value={r.to} disabled={!r.on} onInput={(e) => set(i, { to: (e.target as HTMLInputElement).value })} />
            </span>
          </li>
        ))}
      </ul>
      <button type="button" class="btn primary wide" disabled={busy || !changed} onClick={() => void save()}>
        {changed ? `Save Grade ${grade}'s hours` : `Grade ${grade}: saved`}
      </button>
    </div>
  );
}
