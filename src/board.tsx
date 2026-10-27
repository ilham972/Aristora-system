// The class register: one row per student. Left: the name. Right: the circles
// this teacher needs right now, big enough to tap. Below: the whole book as a thin
// strip, every question in the same place on every row, so you can read the
// whole class at a glance. Tap the strip to open the full book for that student.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { evalUrgency, oldestPendingAt, theoryUrgency, type MarkState } from "../convex/lib/status";
import { LADDER, SECTIONS, sectionById, type Section } from "../convex/lib/unit";
import { mutate } from "./backend";
import type { ComponentChildren } from "preact";
import type { View } from "./derive";
import { act, currentRole, type Role } from "./store";
import { canTap, isUnsaved, tap, tapSection } from "./taps";
import { Q } from "./ui";

const CORRECTION_RECENT_MS = 2 * 60_000;
const EXPLAINED_RECENT_MS = 3 * 60_000;
const THEORY_FOCUS_MS = 3 * 60_000;

/** " 4m", " 1h 5m"; nothing under a minute. */
function mins(ms: number | undefined): string {
  if (ms === undefined || ms < 60_000) return "";
  const m = Math.floor(ms / 60_000);
  return m < 60 ? ` ${m}m` : ` ${Math.floor(m / 60)}h ${m % 60}m`;
}

export type RowTone = "red" | "amber" | "green" | "yellow" | "theory" | "evaluation" | "grey" | "done" | "none";

/** Section whose theory this row shows (stays put while the teacher is tapping it). */
export function theoryFocus(v: View, now: number): Section | null {
  const call = v.calls.find((c) => c.kind === "theory" && c.section);
  if (call) return sectionById(call.section!) ?? null;
  let best: { sec: Section; t: number } | null = null;
  for (const sec of LADDER) {
    for (const q of sec.teach) {
      const m = v.marks[String(q)];
      if (m && now - m.t < THEORY_FOCUS_MS && (!best || m.t > best.t)) best = { sec, t: m.t };
    }
  }
  if (best) return best.sec;
  return v.st.nextTheory ? (sectionById(v.st.nextTheory) ?? null) : null;
}

/** The big circles for this teacher, in book order. */
export function actionCircles(role: Role, v: View, now: number): number[] {
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
  if (v.st.finished) return { tone: "done", text: "Finished" };
  const idle = mins(v.idleMs);

  if (role === "theory") {
    if (!v.st.nextTheory) return { tone: "none", text: "No theory left" };
    const u = theoryUrgency(v.st);
    if (u === "red") return { tone: "red", text: `No work${idle}` };
    return { tone: u, text: `${v.st.left} left` };
  }
  if (role === "evaluation") {
    if (v.st.pending.length === 0) return { tone: "none", text: v.st.dry ? `No work${idle}` : "Nothing wrong" };
    const u = evalUrgency(v.marks, v.st, now);
    if (u === "red") {
      if (v.st.stuck.length) return { tone: "red", text: "Stuck" };
      if (v.st.blocked.length) return { tone: "red", text: `Stopped in ${v.st.blocked[0]}` };
      return { tone: "red", text: `No work${idle}` };
    }
    if (u === "ready") return { tone: "amber", text: "Ready" };
    const t = oldestPendingAt(v.marks, v.st);
    return { tone: "none", text: `Ready in ${Math.max(1, Math.ceil(((t ?? now) + 10 * 60_000 - now) / 60_000))} min` };
  }
  // correction
  if (v.st.dry) return { tone: "red", text: `No work${idle}` };
  if (v.quiet) return { tone: "yellow", text: `Quiet${mins(v.quietMs)}` };
  if (v.st.left <= 2 && v.st.nextTheory) return { tone: "amber", text: `${v.st.left} left` };
  return { tone: "green", text: `${v.st.left} left` };
}

const SEC_LABEL: Record<string, string> = { P: "Past", X: "★" };

/** Labels above the strips, lined up with the strip columns. */
export function StripHead() {
  return (
    <div class="strip strip-head" aria-hidden="true">
      {SECTIONS.map((sec) => (
        <span key={sec.id} class="strip-sec" style={{ flexGrow: sec.teach.length + sec.solo.length }}>
          {SEC_LABEL[sec.id] ?? sec.id}
        </span>
      ))}
    </div>
  );
}

function Strip(props: { v: View }) {
  const { v } = props;
  const doable = new Set(v.st.doable);
  return (
    <span class="strip" aria-hidden="true">
      {SECTIONS.map((sec) => (
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

function Book(props: { role: Role; v: View }) {
  const { role, v } = props;
  return (
    <div class="book-open">
      {SECTIONS.map((sec) => (
        <div key={sec.id} class="book-line">
          <span class="badge small" aria-hidden="true">
            {sec.badge}
          </span>
          <div class="book-qs">
            {[...sec.teach, ...sec.solo].map((q) => {
              const base = v.s.marks[String(q)]?.s ?? null;
              const tappable = canTap(role, q, base) || isUnsaved(v.s._id, q);
              return (
                <Q
                  key={q}
                  q={q}
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
      {role === "correction" && v.where !== "absent" && (
        <div class="row-actions">
          {(v.where === "theory" || v.where === "evaluation") && (
            <button
              type="button"
              class="btn ghost small"
              onClick={() => void act(() => mutate(api.calls.release, { studentId: v.s._id, by: currentRole() }))}
            >
              Back in the hall
            </button>
          )}
          <button
            type="button"
            class="btn ghost small"
            onClick={() => void act(() => mutate(api.students.setPresent, { id: v.s._id, present: false, by: currentRole() }))}
          >
            Sign out (going home)
          </button>
        </div>
      )}
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
        <div class="reg-head">
          {!legend && (
            <button type="button" class="how-btn" onClick={() => showLegend(true)}>
              How to tap
            </button>
          )}
          <StripHead />
        </div>
        <ul class="reg-list">
          {views.map((v) => {
            const st = rowState(role, v, now);
            const circles = v.where === "absent" ? [] : actionCircles(role, v, now);
            const focus = role === "theory" && v.where !== "absent" ? theoryFocus(v, now) : null;
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
                    const base = v.s.marks[String(q)]?.s ?? null;
                    const tappable = canTap(role, q, base) || isUnsaved(v.s._id, q);
                    return (
                      <Q
                        key={q}
                        q={q}
                        s={v.marks[String(q)]?.s}
                        size="act"
                        pending={isUnsaved(v.s._id, q)}
                        onClick={tappable ? () => tap(v.s, q) : undefined}
                      />
                    );
                  })}
                  {circles.length === 0 && v.where !== "absent" && <span class="reg-none">{emptyWords(role, v)}</span>}
                </div>
                <button
                  type="button"
                  class="reg-strip"
                  aria-expanded={isOpen}
                  aria-label={`${v.s.name}: ${isOpen ? "close" : "open"} the whole book`}
                  onClick={() => setOpen(isOpen ? null : v.s._id)}
                >
                  <Strip v={v} />
                </button>
                {isOpen && <Book role={role} v={v} />}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function emptyWords(role: Role, v: View): string {
  if (v.st.finished) return "Unit finished";
  if (role === "correction") {
    if (v.st.needs.includes("theory")) return `Waiting for ${v.st.nextTheory} theory`;
    if (v.st.pending.length) return "Waiting for evaluation";
    return "";
  }
  if (role === "theory") return "";
  return "";
}
