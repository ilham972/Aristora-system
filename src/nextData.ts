// What every student is doing now and what he needs next, the same for everyone who looks (owner, Correction,
// Theory, Evaluation): the Class page's rows. Plain functions: the tests run them on fake classes.
//
// Now: one colour and a few words ("C · 3 left", "On Level 4", "No work 6m", "In Theory 4m").
// Next: who he needs and when ("Theory D ~8m", "Eval 2", "Correct L3"), soonest first. A chip pulses only when he
// needs it now or within 5 minutes: if everything pulsed, nothing would stand out.

import { evalUrgency } from "../convex/lib/status";
import { masterEvalUrgency } from "../convex/lib/master";
import { pendingSince, type Tone, type View } from "./derive";
import { stageName } from "./store";
import { mShort, outInOf } from "./theoryFocusData";

/** A next need pulses when it is this close (or now). */
export const SOON_MS = 5 * 60_000;

export type Need = {
  room: "theory" | "evaluation" | "correction";
  text: string;
  /** 0 = now; ms from now; null = when he gets there (not known). */
  inMs: number | null;
  pulse: boolean;
};

/** " 4m", " 1h 5m"; nothing under a minute. */
function mins(ms: number | undefined): string {
  if (ms === undefined || ms < 60_000) return "";
  const m = Math.floor(ms / 60_000);
  return m < 60 ? ` ${m}m` : ` ${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Where his next question is: "C", "Papers", "Final". */
function placeOf(v: View): string {
  const q = v.st?.doable[0];
  if (q === undefined || !v.f) return "";
  const sec = v.f.sections.find((s) => s.solo.includes(q));
  if (!sec) return "";
  return sec.kind === "past" ? "Papers" : sec.kind === "final" ? "Final" : sec.id;
}

/** What he is doing now, in one colour and a few words. */
export function nowOf(v: View, now: number): { tone: Tone; text: string } {
  if (v.where === "absent") {
    const w = v.ms?.waiting ?? [];
    return { tone: "grey", text: w.length === 1 ? `Correct L${w[0].n}` : w.length ? `${w.length} to correct` : "Not here" };
  }
  if (v.where === "theory" || v.where === "evaluation") {
    const sent = v.calls.find((c) => c.status === "sent" && c.room === v.where);
    return { tone: v.where, text: `In ${v.where === "theory" ? "Theory" : "Evaluation"}${mins(sent?.sentAt ? now - sent.sentAt : undefined)}` };
  }
  if (v.calledTo) return { tone: v.calledTo, text: `Called: ${v.calledTo === "theory" ? "Theory" : "Evaluation"}` };
  const idle = mins(v.idleMs);
  if (v.st) {
    if (v.st.finished) return { tone: "done", text: "Finished" };
    if (v.st.dry) return { tone: "red", text: `No work${idle}` };
    if (v.quiet) return { tone: "yellow", text: `Quiet${mins(v.quietMs)}` };
    const at = placeOf(v);
    return { tone: v.st.left <= 2 && v.st.nextTheory ? "amber" : "green", text: `${at ? `${at} · ` : ""}${v.st.left} left` };
  }
  if (v.ms) {
    if (v.ms.finished) return { tone: "done", text: `Finished ${v.ms.unit.pct}%` };
    if (v.ms.dry) return { tone: "red", text: `No work${idle}` };
    if (v.quiet) return { tone: "yellow", text: `Quiet${mins(v.quietMs)}` };
    return { tone: "green", text: `On Level ${v.ms.current!.n}` };
  }
  return { tone: "none", text: v.stage === "legend" || v.stage === "sprint" ? stageName(v.stage) : "No book yet" };
}

const order = (n: Need) => (n.inMs === null ? Infinity : n.inMs);

/** Who he needs next and when, soonest first (two at most). `pace` = the class's minutes a question. */
export function nextOf(v: View, now: number, pace: number): Need[] {
  if (v.where === "absent" || v.calledTo) return [];
  if (v.where === "theory" || v.where === "evaluation") {
    return v.pulled ? [{ room: "theory", text: "then Theory", inMs: 0, pulse: false }] : [];
  }
  const out: Need[] = [];
  const evalNeed = (n: number, u: "red" | "ready" | "wait") => {
    if (u === "wait") {
      const since = pendingSince(v);
      const inMs = since === null ? null : Math.max(0, since + 10 * 60_000 - now);
      out.push({ room: "evaluation", text: `Eval ${n}${inMs !== null && inMs >= 60_000 ? ` ~${mShort(inMs)}` : ""}`, inMs, pulse: false });
    } else out.push({ room: "evaluation", text: `Eval ${n}`, inMs: 0, pulse: true });
  };
  if (v.st) {
    if (v.st.finished) return [];
    if (v.st.nextTheory) {
      const t = v.st.dry && v.st.needs.includes("theory") ? 0 : outInOf(v, now, pace);
      const label = `Theory ${v.st.nextTheory}`;
      out.push({
        room: "theory",
        text: t === 0 || t === null ? label : `${label} ~${mShort(Math.max(60_000, t))}`,
        inMs: t,
        pulse: t !== null && t <= SOON_MS,
      });
    }
    if (v.st.pending.length) evalNeed(v.st.pending.length, evalUrgency(v.marks, v.st, now));
  } else if (v.ms) {
    if (v.ms.finished) return [];
    if (v.ms.waiting.length) {
      const w = v.ms.waiting;
      out.push({ room: "correction", text: w.length === 1 ? `Correct L${w[0].n}` : `Correct ${w.length}`, inMs: 0, pulse: v.ms.dry });
    }
    if (v.ms.pending.length) evalNeed(v.ms.pending.length, masterEvalUrgency(v.ms, now));
    if (v.ms.reteach) {
      out.push({
        room: "theory",
        text: `Theory ${v.ms.theory.length || "unit"}`,
        inMs: v.ms.dry ? 0 : null,
        pulse: v.ms.dry,
      });
    }
  }
  return out.sort((a, b) => order(a) - order(b)).slice(0, 2);
}
