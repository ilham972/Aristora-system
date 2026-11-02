// Attendance: sign students in as they arrive. Pick the grade, tap the name; the time goes in the register,
// and the student appears in Correction, Theory and Evaluation. Since 30 Oct 2026 it is a full-page sheet: from
// Correction (tap the grade, then + before its names: that grade only), or the count by the clock (any grade).
//
// At the bottom (2 Nov 2026, his ask): "Sign in all" and "Sign out all" for that grade (from +), "Sign in everyone" and
// "Sign out everyone" for the whole class (from the count). Signing in several is a list with everyone ticked: she
// unticks whoever isn't in the hall, then "Sign in 12" (a name signed in who isn't here hides a student who stopped
// coming, and turns red on Theory and Evaluation). Its toast has Undo. "Sign out everyone" ends the class (the report).

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { slClock, slDay } from "../convex/lib/day";
import { mutate } from "./backend";
import { CallsBand } from "./correction";
import type { View } from "./derive";
import { useQuery } from "./live";
import { act, may, now as serverNow, testMode, toast, type Board } from "./store";
import { Empty, GRADES, GradeRow, Sheet, useGrade } from "./ui";

type Visit = { studentId: Id<"students">; inAt: number; outAt: number | null };

/** A sign-in can be taken back this long after (as on the server). */
const UNDO_MS = 5 * 60_000;
const WHERE: Record<View["where"], string> = { hall: "in the hall", theory: "in Theory", evaluation: "in Evaluation", absent: "" };

const setPresent = (id: Id<"students">, present: boolean, undo = false) =>
  act(() => mutate(api.students.setPresent, { id, present, by: "attendance", ...(undo ? { undo: true } : {}) }));
const setMany = (ids: Id<"students">[], present: boolean, undo = false) =>
  act(() => mutate(api.students.setPresentMany, { ids, present, by: "attendance", ...(undo ? { undo: true } : {}) }));
const people = (n: number) => `${n} student${n === 1 ? "" : "s"}`;

export function AttendanceSheet(props: {
  board: Board;
  views: View[];
  now: number;
  /** Open on this grade (Correction's). */
  grade?: number | null;
  /** That grade only (from Correction's +: the grade was picked there): no row of grades. */
  only?: boolean;
  onClose: () => void;
}) {
  const { board, views, now } = props;
  const [stored, store] = useGrade(
    "aristora.attendanceGrade",
    () => GRADES.find((g) => views.some((v) => v.s.grade === g)) ?? GRADES[0],
  );
  const [grade, setGradeHere] = useState<number>(props.grade ?? stored);
  const setGrade = (g: number) => {
    setGradeHere(g);
    store(g);
  };
  const [busy, setBusy] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulk, setBulk] = useState<"in" | "out" | null>(null);
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

  const inClass = views.filter(isIn).length;
  // "All" = this grade (from Correction's +) or the whole class (from the count by the clock).
  const scope = props.only ? list : views;
  const outNow = scope.filter((v) => !isIn(v));
  const inNow = scope.filter(isIn);
  const sheet = (body: ComponentChildren) => (
    <Sheet
      full
      title={props.only ? `Attendance · Grade ${grade}` : "Attendance"}
      sub={props.only ? undefined : `${inClass} in class`}
      onClose={props.onClose}
      foot={
        views.length > 0 && (
          <div class="row-actions att-all">
            <button
              type="button"
              class="btn ghost"
              disabled={outNow.length === 0}
              aria-label={`${props.only ? "Sign in all" : "Sign in everyone"}: ${outNow.length} not here`}
              onClick={() => setBulk("in")}
            >
              {props.only ? "Sign in all" : "Sign in everyone"}
              {outNow.length > 0 && <small aria-hidden="true">{outNow.length}</small>}
            </button>
            <button
              type="button"
              class="btn ghost"
              disabled={inNow.length === 0}
              aria-label={`${props.only ? "Sign out all" : "Sign out everyone"}: ${inNow.length} here`}
              onClick={() => setBulk("out")}
            >
              {props.only ? "Sign out all" : "Sign out everyone"}
              {inNow.length > 0 && <small aria-hidden="true">{inNow.length}</small>}
            </button>
          </div>
        )
      }
    >
      <div class="attendance">{body}</div>
    </Sheet>
  );

  if (views.length === 0) {
    return sheet(
      <Empty title="No students yet">
        {may("students") ? "Add your students in Settings (the gear at the top) → Students." : "The owner adds them in Settings."}
      </Empty>,
    );
  }

  return (
    <>
      {sheet(
        <>
          {may("correction") && <CallsBand board={board} views={views} now={now} />}
          {!props.only && (
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
          )}
          <p class="summary">
            <span class="strong">
              Grade {grade}: {here} of {list.length} here
            </span>
            <span>Tap a name when the student arrives; tap a green one when he goes home.</span>
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
        </>,
      )}

      {bulk === "in" && (
        <SignInMany
          title={props.only ? `Sign in Grade ${grade}` : "Sign in everyone"}
          views={outNow}
          grouped={!props.only}
          leftAt={leftAt}
          onClose={() => setBulk(null)}
        />
      )}
      {bulk === "out" && (
        <SignOutMany grade={props.only ? grade : null} views={inNow} onClose={() => setBulk(null)} />
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
    </>
  );
}

/**
 * Sign in several at once: every name not in yet, ticked (gone home today: not ticked). She unticks whoever isn't in
 * the hall, then "Sign in 12". The toast's Undo takes them all back (as if they never came).
 */
function SignInMany(props: { title: string; views: View[]; grouped: boolean; leftAt: Map<string, number>; onClose: () => void }) {
  const [off, setOff] = useState<Set<string>>(() => new Set(props.views.filter((v) => props.leftAt.has(v.s._id)).map((v) => v.s._id)));
  const [busy, setBusy] = useState(false);
  const picked = props.views.filter((v) => !off.has(v.s._id));
  const flip = (ids: string[], on: boolean) => {
    const next = new Set(off);
    for (const id of ids) {
      if (on) next.delete(id);
      else next.add(id);
    }
    setOff(next);
  };
  const go = async () => {
    if (busy || picked.length === 0) return;
    setBusy(true);
    const ids = picked.map((v) => v.s._id as Id<"students">);
    const r = await setMany(ids, true);
    setBusy(false);
    if (!r) return;
    props.onClose();
    toast(`${people(r.changed)} signed in, ${slClock(serverNow())}.`, "info", () => {
      void setMany(ids, false, true).then((u) => u && toast(`Sign-in taken back for ${people(u.changed)}.`));
    });
  };
  const grades = GRADES.filter((g) => props.views.some((v) => v.s.grade === g));
  return (
    <Sheet
      title={props.title}
      sub="Untick anyone who isn't in the hall."
      onClose={props.onClose}
      cls="att-many"
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" class="btn primary" disabled={busy || picked.length === 0} onClick={() => void go()}>
            {busy ? "Signing in…" : `Sign in ${picked.length}`}
          </button>
        </div>
      }
    >
      {grades.map((g) => {
        const of = props.views.filter((v) => v.s.grade === g);
        const on = of.filter((v) => !off.has(v.s._id)).length;
        return (
          <section key={g} class="atm-g" aria-label={`Grade ${g}`}>
            {props.grouped && (
              <p class="atm-h">
                <b>Grade {g}</b>
                <span>
                  {on} of {of.length}
                </span>
                <button type="button" class="link-btn" onClick={() => flip(of.map((v) => v.s._id), on < of.length)}>
                  {on < of.length ? "Tick all" : "Untick all"}
                </button>
              </p>
            )}
            <ul class="att-list">
              {of.map((v) => {
                const ticked = !off.has(v.s._id);
                const left = props.leftAt.get(v.s._id);
                return (
                  <li key={v.s._id}>
                    <button
                      type="button"
                      class={`ap atm${ticked ? " on" : ""}`}
                      aria-pressed={ticked}
                      aria-label={`${v.s.name}: ${ticked ? "will be signed in" : "not signed in"}${left ? `, went home at ${slClock(left)}` : ""}`}
                      onClick={() => flip([v.s._id], !ticked)}
                    >
                      <span class="ap-n">{v.s.name}</span>
                      <span class="ap-t">{ticked ? "✓" : left ? `left ${slClock(left, false)}` : ""}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </Sheet>
  );
}

/**
 * Sign out several: a grade goes home (its visits close, its calls end; the class goes on), or everyone, which ends the
 * class like Class → End the session (everyone out, open calls closed, today's report saved).
 */
function SignOutMany(props: { grade: number | null; views: View[]; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const all = props.grade === null;
  // The simulation's students go home without ending the real class.
  const endsClass = all && !testMode();
  const n = props.views.length;
  const names = props.views.map((v) => v.s.name);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    if (endsClass) {
      const r = await act(() => mutate(api.sessions.end, { by: "attendance" }));
      setBusy(false);
      if (r === undefined) return;
      props.onClose();
      toast("Class ended: everyone signed out. Today's report is in Settings → Reports.");
      return;
    }
    const r = await setMany(
      props.views.map((v) => v.s._id as Id<"students">),
      false,
    );
    setBusy(false);
    if (!r) return;
    props.onClose();
    toast(`${people(r.changed)} signed out, ${slClock(serverNow())}.`);
  };
  return (
    <Sheet
      title={endsClass ? "Sign out everyone and end the class?" : all ? "Sign out everyone?" : `Sign out Grade ${props.grade}?`}
      sub={`${people(n)} go${n === 1 ? "es" : ""} home now${endsClass ? ", open calls close, and today's report is saved" : ""}.`}
      onClose={props.onClose}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" onClick={props.onClose}>
            Keep them
          </button>
          <button type="button" class="btn primary" disabled={busy} onClick={() => void go()}>
            {busy ? "Signing out…" : endsClass ? "Sign out everyone" : `Sign out ${n}`}
          </button>
        </div>
      }
    >
      <p class="muted atm-names">{names.join(", ")}</p>
      <p class="muted small">
        Their visits close at {slClock(serverNow())}. Anyone with Theory or Evaluation goes home from there; levels he handed in
        stay on Correction to correct.
      </p>
    </Sheet>
  );
}
