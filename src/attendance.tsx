// Attendance: sign students in as they arrive. Pick the grade, tap the name; the time goes in the register,
// and the student appears in Correction, Theory and Evaluation.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { slClock, slDay } from "../convex/lib/day";
import { mutate } from "./backend";
import { CallsBand } from "./correction";
import type { View } from "./derive";
import { useQuery } from "./live";
import { act, may, now as serverNow, toast, type Board, type Role } from "./store";
import { Empty, GRADES, GradeRow, Sheet, useGrade } from "./ui";

type Visit = { studentId: Id<"students">; inAt: number; outAt: number | null };

/** A sign-in can be taken back this long after (as on the server). */
const UNDO_MS = 5 * 60_000;
const WHERE: Record<View["where"], string> = { hall: "in the hall", theory: "in Theory", evaluation: "in Evaluation", absent: "" };

const setPresent = (id: Id<"students">, present: boolean, undo = false) =>
  act(() => mutate(api.students.setPresent, { id, present, by: "attendance", ...(undo ? { undo: true } : {}) }));

export function Attendance(props: { board: Board; views: View[]; now: number; role: Role }) {
  const { board, views, now, role } = props;
  const [grade, setGrade] = useGrade(
    "aristora.attendanceGrade",
    () => GRADES.find((g) => views.some((v) => v.s.grade === g)) ?? GRADES[0],
  );
  const [busy, setBusy] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const visits = useQuery<Visit[]>(api.attendance.day, { day: slDay(now) });

  // Who went home today, and when (signed in again: simply in).
  const leftAt = new Map<string, number>();
  for (const r of visits ?? []) {
    if (r.outAt !== null && r.outAt > (leftAt.get(r.studentId) ?? 0)) leftAt.set(r.studentId, r.outAt);
  }
  const isIn = (v: View) => v.where !== "absent";
  const ofGrade = (g: number) => views.filter((v) => v.s.grade === g);
  const list = ofGrade(grade);
  const here = list.filter(isIn).length;
  const open = openId ? views.find((v) => v.s._id === openId && isIn(v)) : undefined;

  const signIn = async (v: View) => {
    if (busy.includes(v.s._id)) return;
    setBusy((b) => [...b, v.s._id]);
    const ok = await setPresent(v.s._id, true);
    setBusy((b) => b.filter((x) => x !== v.s._id));
    if (ok) {
      toast(`${v.s.name} signed in, ${slClock(serverNow())}.`, "info", () => {
        void setPresent(v.s._id, false, true).then((r) => r && toast(`${v.s.name}: sign-in taken back.`));
      });
    }
  };

  if (views.length === 0) {
    return (
      <main class="page">
        <Empty title="No students yet">
          {may("students") ? "Add your students in Settings (the gear at the top) → Students." : "The owner adds them in Settings."}
        </Empty>
      </main>
    );
  }

  return (
    <main class="page attendance">
      <div class="stick att-top">
        {role === "correction" && <CallsBand board={board} views={views} now={now} />}
        <GradeRow
          value={grade}
          onPick={setGrade}
          label="Grade"
          count={(g) => {
            const all = ofGrade(g);
            const n = all.filter(isIn).length;
            if (all.length === 0) return { text: "–", aria: "no students" };
            return { text: `${n}/${all.length}`, aria: `${n} of ${all.length} here`, some: n > 0 };
          }}
        />
      </div>
      <p class="summary">
        <span class="strong">
          Grade {grade}: {here} of {list.length} here
        </span>
        <span>Tap a name when the student arrives.</span>
      </p>

      {list.length === 0 ? (
        <Empty title={`No Grade ${grade} students yet`}>
          {may("students") ? "Add them in Settings → Students." : "The owner adds them in Settings."}
        </Empty>
      ) : (
        <ul class="att-list" aria-label={`Grade ${grade} students`}>
          {list.map((v) => {
            const inNow = isIn(v);
            const wait = !inNow && busy.includes(v.s._id);
            const left = inNow ? undefined : leftAt.get(v.s._id);
            const since = v.s.lastInAt;
            const tone = inNow ? "in" : wait ? "busy" : left ? "left" : "";
            const time = inNow ? (since ? `✓ ${slClock(since, false)}` : "✓") : wait ? "…" : left ? `left ${slClock(left, false)}` : "";
            const label = inNow
              ? `${v.s.name}: here${since ? ` since ${slClock(since)}` : ""}`
              : wait
                ? `${v.s.name}: signing in`
                : left
                  ? `${v.s.name}: went home at ${slClock(left)}, tap to sign in again`
                  : `${v.s.name}: tap to sign in`;
            return (
              <li key={v.s._id}>
                <button
                  type="button"
                  class={`ap ${tone}`}
                  aria-label={label}
                  aria-pressed={inNow}
                  onClick={() => (inNow ? setOpenId(v.s._id) : void signIn(v))}
                >
                  <span class="ap-n">{v.s.name}</span>
                  {time && <span class="ap-t">{time}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && (
        <Sheet
          title={open.s.name}
          sub={`Here since ${open.s.lastInAt ? slClock(open.s.lastInAt) : "the start of class"}, ${WHERE[open.where]}.`}
          onClose={() => setOpenId(null)}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={() => setOpenId(null)}>
                Keep
              </button>
              <button
                type="button"
                class="btn primary"
                onClick={async () => {
                  const ok = await setPresent(open.s._id, false);
                  setOpenId(null);
                  if (ok) toast(`${open.s.name} signed out, ${slClock(serverNow())}.`);
                }}
              >
                Sign out: going home
              </button>
            </div>
          }
        >
          <p class="muted">
            {open.where === "hall"
              ? "Signing out takes this student off the register until the next sign-in."
              : `${open.s.name} is ${WHERE[open.where]} now. Signing out sends them home from there.`}
          </p>
          {open.s.lastInAt !== undefined && now - open.s.lastInAt < UNDO_MS && (
            <button
              type="button"
              class="link-btn"
              onClick={async () => {
                const ok = await setPresent(open.s._id, false, true);
                setOpenId(null);
                if (ok) toast(`${open.s.name}: sign-in taken back.`);
              }}
            >
              Signed in by mistake? Take it back
            </button>
          )}
        </Sheet>
      )}
    </main>
  );
}
