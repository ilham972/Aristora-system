// The class register: one row per student, whatever his grade and stage. Left: the name. Right: what this
// teacher can tap right now (theory-book circles, workbook levels to correct, lost marks to explain). Below:
// his whole book as a thin strip, with his grade and unit. Tap the strip to open the book.

import { useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { api } from "../convex/_generated/api";
import type { SectionData } from "../convex/lib/book";
import { evalUrgency, theoryUrgency, type MarkState } from "../convex/lib/status";
import { mutate } from "./backend";
import { evalUrgencyOf, pendingSince, type View } from "./derive";
import { CorrectSheet, MasterBook, MasterStrip } from "./master";
import { MoveSheet } from "./move";
import { act, currentRole, savedMarks, setExplained, STAGES, type Role } from "./store";
import { canTap, isUnsaved, tap, tapSection } from "./taps";
import { Q } from "./ui";

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
  if (v.where === "absent") return { tone: "grey", text: role === "correction" ? "Tap to sign in" : "Not here" };
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
    if (role === "theory") return v.ms.reteach ? { tone: v.ms.dry ? "red" : "amber", text: "Re-teach" } : { tone: "none", text: "Master" };
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
  if (v.pending.length === 0) return { tone: "none", text: dry ? `No work${idle}` : v.ms ? "Nothing lost" : "Nothing wrong" };
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

function Book(props: { role: Role; v: View; onMove: () => void; onCorrect: (level: number) => void }) {
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
          <button
            type="button"
            class={`btn ghost small${v.ms.reteach ? " on" : ""}`}
            aria-pressed={v.ms.reteach}
            onClick={() =>
              void act(() => mutate(api.workbook.reteach, { studentId: v.s._id, unitId: v.s.unitId, on: !v.ms!.reteach, by: currentRole() }))
            }
          >
            {v.ms.reteach ? "Re-teach asked ✓" : "Needs theory again"}
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
  /** How to tap, shown until the teacher taps "Got it". */
  legend: ComponentChildren;
  selected?: Set<string>;
  /** Return true if the tap was handled; otherwise it opens the whole book. */
  onName: (v: View) => boolean | void;
}) {
  const { role, views, now } = props;
  const [open, setOpen] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<{ id: string; level: number } | null>(null);
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
  return (
    <>
      {legend && (
        <div class="legend-box">
          <p class="legend-line">{props.legend}</p>
          <button type="button" class="btn ghost small" onClick={() => showLegend(false)}>
            Got it
          </button>
        </div>
      )}
      <section class="register" aria-label="Class register">
        {!legend && (
          <div class="reg-head">
            <button type="button" class="how-btn" onClick={() => showLegend(true)}>
              How to tap
            </button>
          </div>
        )}
        <ul class="reg-list">
          {views.map((v) => {
            const st = rowState(role, v, now);
            const selected = props.selected?.has(v.s._id) ?? false;
            const isOpen = open === v.s._id;
            return (
              <li key={v.s._id} class={`reg-row rt-${st.tone}${selected ? " sel" : ""}${v.where === "absent" ? " absent" : ""}`}>
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
                  <Actions role={role} v={v} now={now} onCorrect={(level) => setCorrecting({ id: v.s._id, level })} />
                </div>
                <button
                  type="button"
                  class="reg-strip"
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
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {moveView && <MoveSheet v={moveView} onClose={() => setMoving(null)} />}
      {correctView && correcting && (
        <CorrectSheet v={correctView} level={correcting.level} now={now} onClose={() => setCorrecting(null)} />
      )}
    </>
  );
}

/** What this teacher can tap on the row right now. */
function Actions(props: { role: Role; v: View; now: number; onCorrect: (level: number) => void }) {
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
      if (qs.length === 0) return <span class="reg-none">{ms.waiting.length ? "Not corrected yet" : ""}</span>;
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
        </>
      );
    }
    if (role === "correction") {
      const pills = [...ms.waiting.slice(0, 2), ...(ms.current ? [ms.current] : [])];
      if (pills.length === 0) return <span class="reg-none">{ms.finished ? "Workbook finished" : ms.pending.length ? "Waiting for evaluation" : ""}</span>;
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
        </>
      );
    }
    return <span class="reg-none">{ms.reteach ? "Re-teach asked" : ""}</span>;
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
