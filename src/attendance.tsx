// Attendance: sign students in as they arrive. Pick the grade, tap the name; the time goes in the register,
// and the student appears in Correction, Theory and Evaluation. Since 30 Oct 2026 it is a full-page sheet, opened from
// the count by the clock in the top bar (any grade).
//
// 2 Nov 2026 (his ask): "Sign in all" and "Sign out all" for the grade picked (under its summary since 12 Nov 2026, when
// Correction's + that opened one grade went), "Sign in everyone" and "Sign out everyone" for the whole class (the foot). Signing in several is a list with everyone ticked: she
// unticks whoever isn't in the hall, then "Sign in 12" (a name signed in who isn't here hides a student who stopped
// coming, and turns red on Theory and Evaluation). Its toast has Undo. "Sign out everyone" ends the class (the report).
//
// 12 Nov 2026 (his ask): only from the top bar's count now (Correction's + is gone); every tap is green AT ONCE and the
// server follows behind (`pending`: the class is starting, nobody waits for a round trip); and the Attendance mode
// switch at the top: off = every student shows on every page, signed in or not (convex/attendance.ts `setMode`).

import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
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

/**
 * Taps on their way to the server (12 Nov 2026, his "the response want to be very quick"): a name turns green (or back)
 * the moment it is tapped; the sign-in goes in the background, in order (one phone's mutations run in the order sent).
 * An entry goes when the board says the same, or the sign-in failed (its toast says why), or after `PENDING_MS`. Kept
 * outside the sheet, so closing and opening it again mid-way shows the same.
 */
const pending = new Map<string, { in: boolean; at: number }>();
const pendingSeen = new Set<() => void>();
const PENDING_MS = 60_000;
function setPending(ids: string[], v: { in: boolean; at: number } | null) {
  for (const id of ids) {
    if (v) pending.set(id, v);
    else pending.delete(id);
  }
  for (const f of pendingSeen) f();
}
function usePending(views: View[]) {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    pendingSeen.add(f);
    return () => void pendingSeen.delete(f);
  }, []);
  // The board caught up (or the tap is too old to trust): the server's word again.
  useEffect(() => {
    const t = Date.now();
    const done = views.filter((v) => {
      const p = pending.get(v.s._id);
      return p && (p.in === v.signed || t - p.at > PENDING_MS);
    });
    if (done.length) setPending(done.map((v) => v.s._id), null);
  });
}
/** In now, as Attendance shows it: a tap on its way wins over the board. */
const signedNow = (v: View) => pending.get(v.s._id)?.in ?? v.signed;
/** Sign in or out at once on the screen, the server behind. */
function sendPresent(ids: Id<"students">[], present: boolean, undo = false) {
  setPending(ids, { in: present, at: Date.now() });
  const go = ids.length === 1 ? setPresent(ids[0], present, undo) : setMany(ids, present, undo);
  void go.then((ok) => {
    if (!ok) setPending(ids, null);
  });
}

/**
 * The switch at the top of Attendance (12 Nov 2026). On (always so before) = only the students signed in show on the
 * pages. Off = every student shows everywhere (Correction, Fighter, Master, Consultation, the Class tab), for testing and
 * for correcting a student who isn't in the hall; signing in still keeps the register and the fees. Only the owner turns
 * it off; anyone here turns it back on.
 */
function ModeSwitch(props: { off: boolean }) {
  const [busy, setBusy] = useState(false);
  const on = !props.off;
  const locked = on && !may("owner");
  const flip = async () => {
    if (busy || locked) return;
    setBusy(true);
    const ok = await act(() => mutate(api.attendance.setMode, { on: !on, by: "attendance" }));
    setBusy(false);
    if (ok) toast(on ? "Attendance mode off: every student shows on every page." : "Attendance mode on: only the students signed in show.");
  };
  return (
    <div class={`att-mode${on ? "" : " off"}`}>
      <button
        type="button"
        role="switch"
        class="att-mode-b"
        aria-checked={on}
        aria-label={`Attendance mode: ${on ? "on" : "off"}${locked ? ". Only the owner turns it off" : ""}`}
        disabled={busy || locked}
        onClick={() => void flip()}
      >
        <span class="att-mode-l">Attendance mode</span>
        <i class="att-mode-k" aria-hidden="true">
          <b />
        </i>
        <span class="att-mode-v" aria-hidden="true">
          {on ? "On" : "Off"}
        </span>
      </button>
      {!on && <p class="att-mode-w">Every student shows on every page, signed in or not.</p>}
    </div>
  );
}

export function AttendanceSheet(props: {
  board: Board;
  views: View[];
  now: number;
  /** Open on this grade. */
  grade?: number | null;
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
  const [openId, setOpenId] = useState<string | null>(null);
  // in / out = everyone (the foot), gin / gout = the grade picked (under its summary).
  const [bulk, setBulk] = useState<"in" | "out" | "gin" | "gout" | null>(null);
  const visits = useQuery<Visit[]>(api.attendance.day, { day: slDay(now) });

  // Who went home today, and when (signed in again: simply in).
  const leftAt = new Map<string, number>();
  for (const r of visits ?? []) {
    if (r.outAt !== null && r.outAt > (leftAt.get(r.studentId) ?? 0)) leftAt.set(r.studentId, r.outAt);
  }
  usePending(views);
  const isIn = signedNow;
  const ofGrade = (g: number) => views.filter((v) => v.s.grade === g);
  const list = ofGrade(grade);
  const here = list.filter(isIn).length;
  const open = openId ? views.find((v) => v.s._id === openId && isIn(v)) : undefined;

  // Green at once; the server follows (a failure turns it back and its toast says why).
  const signIn = (v: View) => {
    const id = v.s._id as Id<"students">;
    sendPresent([id], true);
    toast(`${v.s.name} signed in, ${slClock(serverNow())}.`, "info", () => {
      sendPresent([id], false, true);
      toast(`${v.s.name}: sign-in taken back.`);
    });
  };

  const inClass = views.filter(isIn).length;
  // "All" = this grade (from Correction's +) or the whole class (from the count by the clock).
  const outNow = views.filter((v) => !isIn(v));
  const inNow = views.filter(isIn);
  const gOut = list.filter((v) => !isIn(v));
  const gIn = list.filter(isIn);
  const sheet = (body: ComponentChildren) => (
    <Sheet
      full
      title="Attendance"
      sub={`${inClass} in class`}
      onClose={props.onClose}
      foot={
        views.length > 0 && (
          <div class="row-actions att-all">
            <button
              type="button"
              class="btn ghost"
              disabled={outNow.length === 0}
              aria-label={`Sign in everyone: ${outNow.length} not here`}
              onClick={() => setBulk("in")}
            >
              Sign in everyone
              {outNow.length > 0 && <small aria-hidden="true">{outNow.length}</small>}
            </button>
            <button
              type="button"
              class="btn ghost"
              disabled={inNow.length === 0}
              aria-label={`Sign out everyone: ${inNow.length} here`}
              onClick={() => setBulk("out")}
            >
              Sign out everyone
              {inNow.length > 0 && <small aria-hidden="true">{inNow.length}</small>}
            </button>
          </div>
        )
      }
    >
      <div class="attendance">
        {!testMode() && <ModeSwitch off={!!board.attOff} />}
        {body}
      </div>
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
          <p class="summary">
            <span class="strong">
              Grade {grade}: {here} of {list.length} here
            </span>
            <span>Tap a name when the student arrives; tap a green one when he goes home.</span>
          </p>
          {list.length > 0 && (
            <div class="att-grade">
              <button
                type="button"
                class="btn ghost small"
                disabled={gOut.length === 0}
                aria-label={`Sign in all of Grade ${grade}: ${gOut.length} not here`}
                onClick={() => setBulk("gin")}
              >
                Sign in all
                {gOut.length > 0 && <small aria-hidden="true">{gOut.length}</small>}
              </button>
              <button
                type="button"
                class="btn ghost small"
                disabled={gIn.length === 0}
                aria-label={`Sign out all of Grade ${grade}: ${gIn.length} here`}
                onClick={() => setBulk("gout")}
              >
                Sign out all
                {gIn.length > 0 && <small aria-hidden="true">{gIn.length}</small>}
              </button>
            </div>
          )}

          {list.length === 0 ? (
            <Empty title={`No Grade ${grade} students yet`}>
              {may("students") ? "Add them in Settings → Students." : "The owner adds them in Settings."}
            </Empty>
          ) : (
            <ul class="att-list" aria-label={`Grade ${grade} students`}>
              {list.map((v) => {
                const inNow = isIn(v);
                const p = pending.get(v.s._id);
                const left = inNow ? undefined : leftAt.get(v.s._id);
                // A tap on its way: its own time (the server's comes a moment later, the same minute).
                const since = p?.in ? p.at : v.s.lastInAt;
                const tone = inNow ? "in" : left ? "left" : "";
                const time = inNow ? (since ? `✓ ${slClock(since, false)}` : "✓") : left ? `left ${slClock(left, false)}` : "";
                const label = inNow
                  ? `${v.s.name}: here${since ? ` since ${slClock(since)}` : ""}`
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
                      onClick={() => (inNow ? setOpenId(v.s._id) : signIn(v))}
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

      {(bulk === "in" || bulk === "gin") && (
        <SignInMany
          title={bulk === "gin" ? `Sign in Grade ${grade}` : "Sign in everyone"}
          views={bulk === "gin" ? gOut : outNow}
          grouped={bulk === "in"}
          leftAt={leftAt}
          onClose={() => setBulk(null)}
        />
      )}
      {(bulk === "out" || bulk === "gout") && (
        <SignOutMany grade={bulk === "gout" ? grade : null} views={bulk === "gout" ? gIn : inNow} onClose={() => setBulk(null)} />
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
                onClick={() => {
                  sendPresent([open.s._id as Id<"students">], false);
                  setOpenId(null);
                  toast(`${open.s.name} signed out, ${slClock(serverNow())}.`);
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
              onClick={() => {
                sendPresent([open.s._id as Id<"students">], false, true);
                setOpenId(null);
                toast(`${open.s.name}: sign-in taken back.`);
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
  const picked = props.views.filter((v) => !off.has(v.s._id));
  const flip = (ids: string[], on: boolean) => {
    const next = new Set(off);
    for (const id of ids) {
      if (on) next.delete(id);
      else next.add(id);
    }
    setOff(next);
  };
  const go = () => {
    if (picked.length === 0) return;
    const ids = picked.map((v) => v.s._id as Id<"students">);
    sendPresent(ids, true);
    props.onClose();
    toast(`${people(ids.length)} signed in, ${slClock(serverNow())}.`, "info", () => {
      sendPresent(ids, false, true);
      toast(`Sign-in taken back for ${people(ids.length)}.`);
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
          <button type="button" class="btn primary" disabled={picked.length === 0} onClick={go}>
            {`Sign in ${picked.length}`}
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
    sendPresent(
      props.views.map((v) => v.s._id as Id<"students">),
      false,
    );
    setBusy(false);
    props.onClose();
    toast(`${people(n)} signed out, ${slClock(serverNow())}.`);
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
