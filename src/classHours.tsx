// Settings → Class hours (owner; 3 Nov 2026, his answer: "you set the hours"): when the class is open each weekday.
// The family app shows them as the student's class schedule and "next class", with the days each one usually comes
// (worked out from his attendance, nothing to type).

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Hours } from "../convex/lib/family";
import { mutate } from "./backend";
import { useQuery } from "./live";
import { act, toast } from "./store";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
/** On the row (the full name is its label for screen readers and in messages). */
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const mins = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

type Row = { on: boolean; from: string; to: string };

export function ClassHours() {
  const saved = useQuery<Hours>(api.families.classHours, {});
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (saved && !rows) setRows(saved.map((h) => (h ? { on: true, from: hhmm(h.from), to: hhmm(h.to) } : { on: false, from: "15:30", to: "19:30" })));
  }, [saved]);
  if (!rows) return <p class="muted settings-body">Loading…</p>;
  const set = (i: number, patch: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = async () => {
    const bad = rows.findIndex((r) => r.on && mins(r.from) >= mins(r.to));
    if (bad >= 0) return toast(`${DAYS[bad]}: the class must start before it ends.`, "error");
    setBusy(true);
    const ok = await act(() => mutate(api.families.setClassHours, { hours: rows.map((r) => (r.on ? { from: mins(r.from), to: mins(r.to) } : null)) }));
    setBusy(false);
    if (ok !== undefined) toast("Class hours saved: students see them in the family app.");
  };
  return (
    <div class="settings-body ch">
      <p class="muted">
        When the class is open each day. Students see them in the family app (their week and "next class"), with the
        days each one usually comes.
      </p>
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
      <button type="button" class="btn primary wide" disabled={busy} onClick={() => void save()}>
        Save class hours
      </button>
    </div>
  );
}
