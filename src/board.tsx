// The class register: one row per student, whatever his grade and stage. Left: the name. Right: what this
// teacher can tap right now (theory-book circles, workbook levels to correct, lost marks to explain). Below:
// his whole book as a thin strip, with his grade and unit. Tap the strip to open the book.

import { useState } from "preact/hooks";
import { Fragment, type ComponentChildren } from "preact";
import { api } from "../convex/_generated/api";
import type { SectionData } from "../convex/lib/book";
import { evalUrgency, theoryUrgency, type MarkState } from "../convex/lib/status";
import { mutate } from "./backend";
import { evalUrgencyOf, pendingSince, type View } from "./derive";
import { CorrectSheet, MasterBook, MasterStrip, TheorySheet, theoryChoices, theoryWords } from "./master";
import { MoveSheet } from "./move";
import { act, currentRole, savedMarks, setExplained, setTaught, STAGES, type Role } from "./store";
import { canTap, isUnsaved, tap, tapSection } from "./taps";
import { Empty, Q } from "./ui";

const CORRECTION_RECENT_MS = 2 * 60_000;
const EXPLAINED_RECENT_MS = 3 * 60_000;
const THEORY_FOCUS_MS = 3 * 60_000;

/** " 4m", " 1h 5m"; nothing under a minute. */
export function mins(ms: number | undefined): string {
  if (ms === undefined || ms < 60_000) return "";
  const m = Math.floor(ms / 60_000);
  return m < 60 ? ` ${m}m` : ` ${Math.floor(m / 60)}h ${m % 60}m`;
}

export type RowTone = "red" | "amber" | "green" | "yellow" | "theory" | "evaluation" | "grey" | "done" | "none";

/** Section whose theory this row shows (stays put while the teacher is tapping it). */
export function theoryFocus(v: View, now: number): SectionData | null {
  if (!v.f || !v.st) return null;
  const call = v.calls.find((c) => c.kind === "theory" && c.section && c.section !== "R");
  if (call) return v.f.sectionById(call.section!) ?? null;
  let best: { sec: SectionData; t: number } | null = null;
  for (const sec of v.f.ladder) {
    for (const q of sec.teach) {
      const m = v.marks[String(q)];
      if (m && now - m.t < THEORY_FOCUS_MS && (!best || m.t > best.t)) best = { sec, t: m.t };
    }
  }
  if (best) return best.sec;
  return v.st.nextTheory ? (v.f.sectionById(v.st.nextTheory) ?? null) : null;
}

/** The big circles for this teacher on a theory book, in book order. */
export function actionCircles(role: Role, v: View, now: number): number[] {
  if (!v.st || !v.f) return [];
  const recent = (pick: (s: MarkState) => boolean, within: number) =>
    Object.entries(v.marks)
      .filter(([, m]) => m && pick(m.s) && now - m.t < within)
      .sort((a, b) => b[1]!.t - a[1]!.t)
      .map(([q]) => Number(q));
  if (role === "correction") {
    const done = recent((s) => s === "right" || s === "wrong" || s === "slip", CORRECTION_RECENT_MS).slice(0, 2);
    const next = v.st.doable.slice(0, 3);
    return [...new Set([...done, ...next])].sort((a, b) => a - b);
  }
  if (role === "theory") return theoryFocus(v, now)?.teach ?? [];
  const explained = recent((s) => s === "explained", EXPLAINED_RECENT_MS).slice(0, 3);
  return [...new Set([...v.st.pending, ...explained])].sort((a, b) => a - b).slice(0, 6);
}

/** Lost-mark questions of a workbook the Evaluation teacher can tap (and ones just explained). */
export function masterCircles(v: View, now: number): number[] {
  if (!v.ms) return [];
  const recent = Object.entries(v.mm.q)
    .filter(([, r]) => r?.x !== undefined && now - r.x < EXPLAINED_RECENT_MS)
    .map(([q]) => Number(q));
  return [...new Set([...v.ms.pending, ...recent])].sort((a, b) => a - b).slice(0, 6);
}

/** Colour and short words for the name cell, from this teacher's point of view. */
export function rowState(role: Role, v: View, now: number): { tone: RowTone; text: string } {
  if (v.where === "absent") {
    // Only gone-home students with levels to correct are shown; the list's title says "Gone home".
    const w = v.ms?.waiting ?? [];
    return { tone: "grey", text: w.length === 1 ? `Correct L${w[0].n}` : w.length ? `${w.length} to correct` : "Not here" };
  }
  const sent = v.calls.find((c) => c.status === "sent");
  const since = (t?: number) => (t ? mins(now - t) : "");
  if (v.where === "theory" || v.where === "evaluation") {
    const mine = role === v.where;
    return {
      tone: v.where,
      text: mine
        ? `With you${since(sent?.sentAt)}`
        : `In ${v.where === "theory" ? "Theory" : "Evaluation"}${since(sent?.sentAt)}`,
    };
  }
  if (v.calledTo) return { tone: v.calledTo, text: `Called: ${v.calledTo === "theory" ? "Theory" : "Evaluation"}` };
  const idle = mins(v.idleMs);

  if (v.st) {
    if (v.st.finished) return { tone: "done", text: "Finished" };
    if (role === "theory") {
      if (!v.st.nextTheory) return { tone: "none", text: "No theory left" };
      const u = theoryUrgency(v.st);
      if (u === "red") return { tone: "red", text: `No work${idle}` };
      return { tone: u, text: `${v.st.left} left` };
    }
    if (role === "evaluation") return evalState(v, now, idle);
    if (v.st.dry) return { tone: "red", text: `No work${idle}` };
    if (v.quiet) return { tone: "yellow", text: `Quiet${mins(v.quietMs)}` };
    if (v.st.left <= 2 && v.st.nextTheory) return { tone: "amber", text: `${v.st.left} left` };
    return { tone: "green", text: `${v.st.left} left` };
  }
  if (v.ms) {
    if (v.ms.finished) return { tone: "done", text: `Finished ${v.ms.unit.pct}%` };
    if (role === "theory") {
      if (!v.ms.reteach) return { tone: "none", text: "Master" };
      return { tone: v.ms.dry ? "red" : "amber", text: v.ms.dry ? `No work${idle}` : theoryWords(v.ms) };
    }
    if (role === "evaluation") return evalState(v, now, idle);
    const w = v.ms.waiting;
    if (v.ms.dry) return { tone: "red", text: `No work${idle}` };
    if (w.length) {
      const waited = mins(v.ms.waitingSince === null ? undefined : now - v.ms.waitingSince);
      return { tone: "amber", text: w.length === 1 ? `Correct L${w[0].n}${waited}` : `${w.length} to correct${waited}` };
    }
    if (v.quiet) return { tone: "yellow", text: `Quiet${mins(v.quietMs)}` };
    return { tone: "green", text: `On Level ${v.ms.current!.n}` };
  }
  const st = STAGES.find((x) => x.id === v.stage);
  return { tone: "none", text: v.stage === "legend" || v.stage === "sprint" ? (st?.name ?? "") : "No book yet" };
}

function evalState(v: View, now: number, idle: string): { tone: RowTone; text: string } {
  const dry = v.st ? v.st.dry : !!v.ms?.dry;
  if (v.pending.length === 0) {
    if (v.ms?.reteach && !dry) return { tone: "none", text: `Theory: ${theoryWords(v.ms)}` };
    return { tone: "none", text: dry ? `No work${idle}` : v.ms ? "Nothing lost" : "Nothing wrong" };
  }
  const u = v.st ? evalUrgency(v.marks, v.st, now) : evalUrgencyOf(v, now);
  if (u === "red") {
    if (v.st?.stuck.length) return { tone: "red", text: "Stuck" };
    if (v.st?.blocked.length) return { tone: "red", text: `Stopped in ${v.st.blocked[0]}` };
    return { tone: "red", text: `No work${idle}` };
  }
  if (u === "ready") return { tone: "amber", text: "Ready" };
  const t = pendingSince(v);
  return { tone: "none", text: `Ready in ${Math.max(1, Math.ceil(((t ?? now) + 10 * 60_000 - now) / 60_000))} min` };
}

/** A theory book as a thin strip: every question in its place, coloured by its state. */
function Strip(props: { v: View }) {
  const { v } = props;
  if (!v.f) return <span class="strip strip-none" aria-hidden="true" />;
  const doable = new Set(v.st?.doable ?? []);
  return (
    <span class="strip" aria-hidden="true">
      {v.f.sections.map((sec) => (
        <span key={sec.id} class="strip-sec" style={{ flexGrow: sec.teach.length + sec.solo.length }}>
          {[...sec.teach, ...sec.solo].map((q) => {
            const s = v.marks[String(q)]?.s;
            const kind = sec.teach.includes(q) ? "t" : "o";
            const stuck = s === "wrong" && (v.marks[String(q)]?.n ?? 0) >= 2;
            return <i key={q} class={`${kind}${s ? ` s-${s}` : doable.has(q) ? " now" : ""}${stuck ? " stuck" : ""}`} />;
          })}
        </span>
      ))}
    </span>
  );
}

function FighterBook(props: { role: Role; v: View }) {
  const { role, v } = props;
  if (!v.f) return null;
  const f = v.f;
  const saved = savedMarks(v.s);
  return (
    <>
      {f.sections.map((sec) => (
        <div key={sec.id} class="book-line">
          <span class="badge small" aria-hidden="true">
            {sec.badge}
          </span>
          <div class="book-qs">
            {[...sec.teach, ...sec.solo].map((q) => {
              const base = saved[String(q)]?.s ?? null;
              const tappable = canTap(role, f.typeOf(q), base) || isUnsaved(v.s._id, q);
              return (
                <Q
                  key={q}
                  q={q}
                  label={f.shortLabel(q)}
                  teach={f.typeOf(q) === "teach"}
                  s={v.marks[String(q)]?.s}
                  size="md"
                  pending={isUnsaved(v.s._id, q)}
                  onClick={tappable ? () => tap(v.s, q) : undefined}
                />
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function Book(props: { role: Role; v: View; onMove: () => void; onCorrect: (level: number) => void; onTheory: () => void }) {
  const { role, v } = props;
  return (
    <div class="book-open">
      <p class="book-title">
        <b>
          {v.unit ? `Grade ${v.unit.grade} · ${v.unit.code} ${v.unit.en}` : `Grade ${v.s.grade ?? "?"}`}
        </b>
        <span>
          {STAGES.find((x) => x.id === v.stage)?.name ?? "No stage"}
          {v.unit?.ta ? ` · ${v.unit.ta}` : ""}
        </span>
      </p>
      {v.kind === "fighter" && <FighterBook role={role} v={v} />}
      {v.kind === "master" && <MasterBook role={role} v={v} onCorrect={props.onCorrect} />}
      {v.kind === "none" && <p class="muted">{v.line}</p>}
      <div class="row-actions wrap">
        <button type="button" class="btn ghost small" onClick={props.onMove}>
          Move: unit or stage
        </button>
        {v.ms && role !== "theory" && (
          <button type="button" class={`btn ghost small${v.ms.reteach ? " on" : ""}`} onClick={props.onTheory}>
            {v.ms.reteach ? `Theory: ${theoryWords(v.ms)} ✓` : "Needs theory"}
          </button>
        )}
        {role === "correction" && v.where !== "absent" && (v.where === "theory" || v.where === "evaluation") && (
          <button
            type="button"
            class="btn ghost small"
            onClick={() => void act(() => mutate(api.calls.release, { studentId: v.s._id, by: currentRole() }))}
          >
            Back in the hall
          </button>
        )}
        {role === "correction" && v.where !== "absent" && (
          <button
            type="button"
            class="btn ghost small"
            onClick={() => void act(() => mutate(api.students.setPresent, { id: v.s._id, present: false, by: currentRole() }))}
          >
            Sign out (going home)
          </button>
        )}
      </div>
    </div>
  );
}

function legendKey(role: Role) {
  return `aristora.legend.${role}`;
}

export function Register(props: {
  role: Role;
  views: View[];
  now: number;
  /** How to tap, shown until the teacher taps "Got it". None: no help box (a second list on the page). */
  legend: ComponentChildren | null;
  selected?: Set<string>;
  /** Several grades shown together: sort by grade, with a small header for each. */
  grouped?: boolean;
  /** Return true if the tap was handled; otherwise it opens the whole book. */
  onName: (v: View) => boolean | void;
}) {
  const { role, now } = props;
  const views = props.grouped
    ? [...props.views].sort((a, b) => (a.s.grade ?? 99) - (b.s.grade ?? 99) || a.s.name.localeCompare(b.s.name))
    : props.views;
  const [open, setOpen] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<{ id: string; level: number } | null>(null);
  const [toTheory, setToTheory] = useState<string | null>(null);
  const [legend, setLegend] = useState<boolean>(() => {
    try {
      return localStorage.getItem(legendKey(role)) !== "hidden";
    } catch {
      return true;
    }
  });
  const showLegend = (on: boolean) => {
    setLegend(on);
    try {
      localStorage.setItem(legendKey(role), on ? "shown" : "hidden");
    } catch {
      /* private mode */
    }
  };
  const moveView = moving ? views.find((x) => x.s._id === moving) : undefined;
  const correctView = correcting ? views.find((x) => x.s._id === correcting.id) : undefined;
  const theoryView = toTheory ? views.find((x) => x.s._id === toTheory) : undefined;
  return (
    <>
      {legend && props.legend !== null && (
        <div class="legend-box">
          <p class="legend-line">{props.legend}</p>
          <button type="button" class="btn ghost small" onClick={() => showLegend(false)}>
            Got it
          </button>
        </div>
      )}
      <section class="register" aria-label="Class register">
        {!legend && props.legend !== null && (
          <div class="reg-head">
            <button type="button" class="how-btn" onClick={() => showLegend(true)}>
              How to tap
            </button>
          </div>
        )}
        <ul class="reg-list">
          {views.map((v, i) => {
            const st = rowState(role, v, now);
            const selected = props.selected?.has(v.s._id) ?? false;
            const isOpen = open === v.s._id;
            const head = props.grouped && (i === 0 || views[i - 1].s.grade !== v.s.grade);
            return (
              <Fragment key={v.s._id}>
              {head && (
                <li class="reg-grade" aria-hidden="true">
                  {v.s.grade ? `Grade ${v.s.grade}` : "No grade"}
                </li>
              )}
              <li class={`reg-row rt-${st.tone}${selected ? " sel" : ""}${v.where === "absent" ? " absent" : ""}`}>
                <button
                  type="button"
                  class="reg-name"
                  onClick={() => {
                    if (!props.onName(v)) setOpen(isOpen ? null : v.s._id);
                  }}
                  aria-pressed={role === "correction" ? undefined : selected}
                >
                  <span class="reg-n">
                    {selected && <span class="tick" aria-hidden="true" />}
                    {v.s.name}
                  </span>
                  <span class="reg-s">{st.text}</span>
                </button>
                <div class="reg-act">
                  <Actions
                    role={role}
                    v={v}
                    now={now}
                    onCorrect={(level) => setCorrecting({ id: v.s._id, level })}
                    onTheory={() => setToTheory(v.s._id)}
                  />
                </div>
                <button
                  type="button"
                  class={`reg-strip${v.kind === "master" ? " rs-m" : ""}`}
                  aria-expanded={isOpen}
                  aria-label={`${v.s.name}: ${isOpen ? "close" : "open"} the whole book`}
                  onClick={() => setOpen(isOpen ? null : v.s._id)}
                >
                  <span class={`strip-tag st-${v.stage ?? "none"}`}>
                    <b>{STAGES.find((x) => x.id === v.stage)?.short ?? "?"}</b>
                    {v.tag}
                  </span>
                  {v.kind === "master" ? <MasterStrip v={v} /> : <Strip v={v} />}
                </button>
                {isOpen && (
                  <Book
                    role={role}
                    v={v}
                    onMove={() => setMoving(v.s._id)}
                    onCorrect={(level) => setCorrecting({ id: v.s._id, level })}
                    onTheory={() => setToTheory(v.s._id)}
                  />
                )}
              </li>
              </Fragment>
            );
          })}
        </ul>
      </section>
      {moveView && <MoveSheet v={moveView} onClose={() => setMoving(null)} />}
      {correctView && correcting && (
        <CorrectSheet v={correctView} level={correcting.level} now={now} onClose={() => setCorrecting(null)} />
      )}
      {theoryView && <TheorySheet v={theoryView} onClose={() => setToTheory(null)} />}
    </>
  );
}

/** Nobody signed in: what the room tabs show instead of an empty register. */
export function NobodyHere() {
  return (
    <Empty title="Nobody is signed in yet">Students show here once Correction signs them in on Attendance.</Empty>
  );
}

/** Gone home with workbook levels still to correct: the marks don't have to wait until he comes back. */
export function GoneHome(props: { role: Role; views: View[]; now: number }) {
  const list = props.views.filter((v) => v.where === "absent" && (v.ms?.waiting.length ?? 0) > 0);
  if (list.length === 0) return null;
  return (
    <section class="gone" aria-label="Gone home, levels to correct">
      <h3 class="list-title">Gone home, levels to correct</h3>
      <Register role={props.role} views={list} now={props.now} legend={null} onName={() => false} />
    </section>
  );
}

/** Master questions sent to Theory that Theory can tap taught (and ones just taught, to undo). */
export function theoryCircles(v: View, now: number): number[] {
  if (!v.ms) return [];
  const recent = Object.entries(v.mm.q)
    .filter(([, r]) => r?.tt !== undefined && now - r.tt < EXPLAINED_RECENT_MS)
    .map(([q]) => Number(q));
  return [...new Set([...v.ms.theory, ...recent])].sort((a, b) => a - b).slice(0, 6);
}

/** Where this Master student goes next, for Correction: "Theory 2", "Eval 1". */
function RouteChips(props: { v: View }) {
  const ms = props.v.ms!;
  return (
    <>
      {ms.reteach && (
        <span class="to-chip theory" title={`Theory: ${theoryWords(ms)}`}>
          <i class="w">Theory</i>
          <i class="s">Th</i> <b>{ms.theory.length || "unit"}</b>
        </span>
      )}
      {ms.pending.length > 0 && (
        <span class="to-chip evaluation" title={`Evaluation: ${ms.pending.map((q) => `Q${q}`).join(" ")}`}>
          <i class="w">Eval</i>
          <i class="s">Ev</i> <b>{ms.pending.length}</b>
        </span>
      )}
    </>
  );
}

/** What this teacher can tap on the row right now. */
function Actions(props: { role: Role; v: View; now: number; onCorrect: (level: number) => void; onTheory: () => void }) {
  const { role, v, now } = props;
  if (v.where === "absent") return null;
  if (v.kind === "fighter") {
    const f = v.f!;
    const circles = actionCircles(role, v, now);
    const focus = role === "theory" ? theoryFocus(v, now) : null;
    const saved = savedMarks(v.s);
    return (
      <>
        {focus && (
          <button
            type="button"
            class="sec-chip"
            aria-label={`Section ${focus.id}: mark all theory taught`}
            onClick={() => tapSection(v.s, focus.id)}
          >
            {focus.id}
          </button>
        )}
        {circles.map((q) => {
          const base = saved[String(q)]?.s ?? null;
          const tappable = canTap(role, f.typeOf(q), base) || isUnsaved(v.s._id, q);
          return (
            <Q
              key={q}
              q={q}
              label={f.shortLabel(q)}
              teach={f.typeOf(q) === "teach"}
              s={v.marks[String(q)]?.s}
              size="act"
              pending={isUnsaved(v.s._id, q)}
              onClick={tappable ? () => tap(v.s, q) : undefined}
            />
          );
        })}
        {circles.length === 0 && <span class="reg-none">{emptyWords(role, v)}</span>}
      </>
    );
  }
  if (v.kind === "master") {
    const ms = v.ms!;
    if (role === "evaluation") {
      const qs = masterCircles(v, now);
      const canSend = theoryChoices(v).some((q) => !v.mm.q[String(q)]?.th);
      if (qs.length === 0 && !canSend) {
        return <span class="reg-none">{ms.reteach ? `Theory: ${theoryWords(ms)}` : ms.waiting.length ? "Not corrected yet" : ""}</span>;
      }
      return (
        <>
          {qs.map((q) => {
            const r = v.mm.q[String(q)];
            const explained = r?.x !== undefined;
            return (
              <Q
                key={q}
                q={q}
                s={explained ? "explained" : "wrong"}
                size="act"
                title={`Q${q}: ${explained ? "explained" : "lost marks"}${r?.max !== undefined ? ` (${r.got}/${r.max})` : ""}`}
                onClick={() => void setExplained(v.s, [q], !explained)}
              />
            );
          })}
          {canSend && (
            <button type="button" class="to-theory" aria-label={`${v.s.name} needs theory: choose the questions`} onClick={props.onTheory}>
              <span aria-hidden="true">→</span> <i class="w">Theory</i>
              <i class="s">Th</i>
            </button>
          )}
        </>
      );
    }
    if (role === "theory") {
      const qs = theoryCircles(v, now);
      if (qs.length === 0) return <span class="reg-none">{ms.wholeUnit ? "Whole unit again" : ""}</span>;
      return (
        <>
          {qs.map((q) => {
            const taught = v.mm.q[String(q)]?.tt !== undefined;
            const who = v.mm.q[String(q)]?.dk ? "couldn't start it" : v.mm.q[String(q)]?.tb === "evaluation" ? "from Evaluation" : "from Correction";
            return (
              <Q
                key={q}
                q={q}
                teach
                s={taught ? "taught" : undefined}
                size="act"
                title={`Q${q}: ${taught ? "taught" : `to teach (${who})`}`}
                onClick={() => void setTaught(v.s, [q], !taught)}
              />
            );
          })}
        </>
      );
    }
    if (role === "correction") {
      const pills = [...ms.waiting.slice(0, 2), ...(ms.current ? [ms.current] : [])];
      if (pills.length === 0) {
        if (ms.reteach || ms.pending.length) return <RouteChips v={v} />;
        return <span class="reg-none">{ms.finished ? "Workbook finished" : ""}</span>;
      }
      return (
        <>
          {pills.map((l) => {
            const waiting = ms.waiting.includes(l);
            const since = v.mm.lv[String(l.n)]?.done;
            return (
              <button
                key={l.n}
                type="button"
                class={`lv-pill${waiting ? " waiting" : ""}`}
                aria-label={`Level ${l.n}, questions ${l.from} to ${l.to}${waiting ? ", waiting for correction" : ""}`}
                onClick={() => props.onCorrect(l.n)}
              >
                <b>L{l.n}</b>
                <small>{waiting ? mins(since === undefined ? undefined : now - since).trim() || "now" : `${l.from}–${l.to}`}</small>
              </button>
            );
          })}
          <RouteChips v={v} />
        </>
      );
    }
    return <span class="reg-none">{ms.reteach ? `Theory: ${theoryWords(ms)}` : ""}</span>;
  }
  return <span class="reg-none">{v.stage === "legend" || v.stage === "sprint" ? "Full papers on paper for now" : ""}</span>;
}

function emptyWords(role: Role, v: View): string {
  if (!v.st) return "";
  if (v.st.finished) return "Book finished";
  if (role === "correction") {
    if (v.st.needs.includes("theory")) return `Waiting for ${v.st.nextTheory} theory`;
    if (v.st.pending.length) return "Waiting for evaluation";
  }
  return "";
}
