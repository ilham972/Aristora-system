// The Evaluation page's rules (src/evalFocus.tsx draws them). Plain functions: the tests run them on fake classes.
//
// Evaluation explains wrong answers (theory books) and lost marks (workbooks), one student at a time, with up to 3
// students in her room at once (the founder's number, 2026-10-29). The page shows who is with her (each student's
// questions one by one, with the answer key), who is on the way, and who to call next: no work / stuck / stopped first
// (red), then ready (waited 10 minutes: orange), then later (yellow). The system ticks its best guess; the teacher
// calls whoever she wants (1, 2 or 3), with the facts beside each name: what he still has to do, and how long.

import { slClock } from "../convex/lib/day";
import { EVAL_READY_MS } from "../convex/lib/status";
import { evalQueue, pendingSince, roomBusy, roomCalls, type RoomCall, type View } from "./derive";
import type { Board } from "./store";
import { LATE_SEND_MS, mShort, outInOf, sinceWords, type Heat, type HeatCount } from "./theoryFocusData";

/** Students with Evaluation at once, at most (the founder's number, 2026-10-29). */
export const EVAL_CAP = 3;

export type EvalKind = "fighter" | "master";
export type EvalFilter = "all" | EvalKind;

/** Someone she could call: why he is on the list, and what he is doing meanwhile. */
export type Cand = {
  v: View;
  kind: EvalKind;
  heat: Heat;
  /** "no work 6m", "stuck: Q18", "stopped in C", "waited 14m", "ready in 4m". */
  why: string;
  /** What he is doing meanwhile, so she can judge if he runs out while she explains: "3 left · out ~8m", "on L4". */
  work: string;
  /** His questions waiting for her. */
  qs: number[];
  /** Since his oldest waiting question. */
  waited: number;
  /** Theory has him (called, or in the theory room): listed, not callable. */
  hold?: string;
};

/** "Q22", "2016" (a past paper: its year), "Q13": a question as his book prints it. */
export function qLabel(v: View, q: number): string {
  const s = v.f ? v.f.shortLabel(q) : String(q);
  return s === String(q) ? `Q${q}` : s;
}

/** What he is doing meanwhile, in a few words (on his book now; or another book of his when that one is blocked). */
export function workWords(v0: View, now: number, pace: number): string {
  const v = v0.home ?? v0;
  if (v.noWork) return v.idleMs !== undefined && v.idleMs >= 60_000 ? `no work ${mShort(v.idleMs)}` : "no work";
  if ((v.st?.dry || v.ms?.dry) && v.otherWork.length) return `on ${v.otherWork[0]}`;
  if (v.st) {
    if (v.st.finished) return "finished";
    const out = outInOf(v, now, pace);
    return out !== null && out <= 30 * 60_000 ? `${v.st.left} left · out ~${mShort(Math.max(60_000, out))}` : `${v.st.left} left`;
  }
  if (v.ms) return v.ms.current ? `on L${v.ms.current.n}` : "finished";
  return "";
}

/**
 * Everyone with something for Evaluation (not called by her yet), most urgent first: one entry per book (a student
 * with wrong answers in two books is listed twice; one book per call).
 */
export function candidates(views: View[], now: number, pace: number): Cand[] {
  return evalQueue(views, now).map((m) => {
    const v = m.v;
    const since = pendingSince(v);
    const waited = since === null ? 0 : Math.max(0, now - since);
    const idle = v.idleMs !== undefined && v.idleMs >= 60_000 ? ` ${mShort(v.idleMs)}` : "";
    let why: string;
    if (m.urgency === "red") {
      if (v.st?.stuck.length) why = `stuck: ${v.st.stuck.map((q) => qLabel(v, q)).join(" ")}`;
      else if (v.st?.blocked.length) why = `stopped in ${v.st.blocked[0]}`;
      else why = `no work${idle}`;
    } else if (m.urgency === "ready") why = `waited ${mShort(waited)}`;
    else why = `ready in ${Math.max(1, Math.ceil((m.readyInMs ?? EVAL_READY_MS) / 60_000))}m`;
    const work = workWords(v, now, pace);
    return {
      v,
      kind: v.kind === "master" ? "master" : "fighter",
      heat: m.urgency === "red" ? "red" : m.urgency === "ready" ? "orange" : "yellow",
      why,
      // "no work" twice says nothing: the second line then is empty.
      work: work.startsWith("no work") && why.startsWith("no work") ? "" : work,
      qs: [...v.pending],
      waited,
      hold: m.blockedBy,
    };
  });
}

/** How many wait for her, by book and colour; each student once. Held ones (with Theory) don't count. */
export function evalCounts(list: Cand[]): Record<EvalFilter, HeatCount> {
  const zero = (): HeatCount => ({ red: 0, orange: 0, yellow: 0, total: 0 });
  const out = { all: zero(), fighter: zero(), master: zero() };
  const counted = new Set<string>();
  for (const c of list) {
    if (c.hold || counted.has(c.v.s._id)) continue; // his most urgent book only (the list is in order)
    counted.add(c.v.s._id);
    for (const x of [out.all, out[c.kind]]) {
      x[c.heat]++;
      x.total++;
    }
  }
  return out;
}

export type SameGroup = { key: string; label: string; q: number; members: Cand[] };

/** The same question of the same book waiting for 2+ students she can call: explain it once to all of them. */
export function sameGroups(list: Cand[]): SameGroup[] {
  const by = new Map<string, SameGroup>();
  for (const c of list) {
    if (c.hold) continue;
    for (const q of c.qs) {
      const key = `${c.v.unit?._id ?? c.v.s.unitId}:${c.v.stage}:${q}`;
      const g = by.get(key) ?? { key, label: `${c.v.unit?.code ?? ""} ${qLabel(c.v, q)}`.trim(), q, members: [] };
      g.members.push(c);
      by.set(key, g);
    }
  }
  return [...by.values()].filter((g) => g.members.length >= 2).sort((a, b) => b.members.length - a.members.length || a.q - b.q);
}

/**
 * Who the page ticks for her: the most urgent she can call (no work, stuck, waited 10 min), as many as fit; one book
 * per student. Returns book keys (View.key).
 */
export function defaultEvalTicks(list: Cand[], left: number): string[] {
  const out: string[] = [];
  const who = new Set<string>();
  for (const c of list) {
    if (out.length >= Math.max(0, left)) break;
    if (c.hold || c.heat === "yellow" || who.has(c.v.s._id)) continue;
    who.add(c.v.s._id);
    out.push(c.v.key);
  }
  return out;
}

/** His other books with something for Evaluation (not this one): "keep him for U09" when she finishes this one. */
export function nextBooks(v: View): View[] {
  const home = v.home ?? v;
  return [home, ...home.others].filter((b) => b.key !== v.key && b.pending.length > 0);
}

// ---------------- The room ----------------

export type EvalHere = {
  rc: RoomCall;
  v: View;
  /** Explaining (his questions), or teaching theory because Theory was busy. */
  kind: "evaluation" | "theory";
  /** His questions waiting to be explained (evaluation). */
  qs: number[];
};

/** His questions for this call: in the book of this call only (never another book's numbers under this call). */
function hereOf(rc: RoomCall, v: View): EvalHere {
  const sameBook = !rc.c.unitId || (v.unit?._id === rc.c.unitId && (!rc.c.stage || v.stage === rc.c.stage));
  return { rc, v, kind: rc.c.kind, qs: rc.c.kind === "evaluation" && sameBook ? [...v.pending] : [] };
}

/**
 * Who is with her now (Arrived; calls from before 30 Oct 2026: sent), first come first, and who is on the way (called
 * and not sent yet, or sent and walking there).
 */
export function evalRoom(board: Board, views: View[], now: number): { here: EvalHere[]; coming: RoomCall[] } {
  const calls = roomCalls(board, views, "evaluation", now);
  const here: EvalHere[] = [];
  const coming: RoomCall[] = [];
  for (const rc of calls) {
    if (rc.c.status === "sent" && rc.v && !rc.walking) here.push(hereOf(rc, rc.v));
    else if (rc.c.status === "requested" || rc.walking) coming.push(rc);
  }
  const at = (h: EvalHere) => h.rc.c.arrivedAt ?? h.rc.c.sentAt ?? h.rc.c.createdAt;
  here.sort((a, b) => at(a) - at(b));
  return { here, coming };
}

/** here = with her; walking = Correction sent him; called = not sent yet. */
export type EvalState = "here" | "walking" | "called";
export type EvalItem = { h: EvalHere; state: EvalState; id: string; name: string; late: boolean };

/**
 * Everyone she called, in the order she called them (nobody moves when he arrives: only his pill's look changes), each
 * with his questions. Late (red): sent and not there after 3 minutes, or Correction hasn't sent him for 3 minutes.
 */
export function evalItems(board: Board, views: View[], now: number): EvalItem[] {
  return roomCalls(board, views, "evaluation", now).flatMap((rc) => {
    if (!rc.v) return [];
    const state: EvalState | null = rc.walking ? "walking" : rc.c.status === "sent" ? "here" : rc.c.status === "requested" ? "called" : null;
    if (!state) return [];
    const late = state === "walking" ? rc.lost : state === "called" && now - rc.c.createdAt >= LATE_SEND_MS;
    return [{ h: hereOf(rc, rc.v), state, id: rc.c.studentId as string, name: rc.v.s.name, late }];
  });
}

/** Where he is, in a few words: "on the way 1m", "not here 4m", "called", "not sent 4m", "with you 5m". */
export function evalWords(it: EvalItem, now: number): string {
  const rc = it.h.rc;
  if (it.state === "walking") return it.late ? `not here ${mShort(rc.walkMs)}` : `on the way${sinceWords(rc.walkMs)}`;
  if (it.state === "called") return it.late ? `not sent ${mShort(now - rc.c.createdAt)}` : "called";
  return `with you${sinceWords(rc.minutes)}`;
}

/** Room left: 3 at once, counting those on the way. */
export function evalLeft(room: { here: EvalHere[]; coming: RoomCall[] }): number {
  return Math.max(0, EVAL_CAP - room.here.length - room.coming.length);
}

/** Theory is busy and he has no work until he gets theory (and nothing to explain): she can teach it herself. */
export function canTeachHere(board: Board, v: View): boolean {
  if (v.where !== "hall" || v.calls.length > 0 || v.pending.length > 0) return false;
  if (!roomBusy(board, "theory")) return false;
  return !!(v.noWork && v.st?.needs.includes("theory")) || !!v.ms?.reteach;
}

// ---------------- Explaining, question by question ----------------

/** What she decided for one question: explained, needs theory, or not now (stays waiting). */
export type Decision = "x" | "th" | "skip";

/**
 * What Done sends for one student. `all`: every question she didn't decide counts as explained ("All explained").
 * Theory book: a question that needs theory is explained too (so he can redo it after the lesson) and its section
 * goes back to Theory's list (reteach). Workbook: those questions are sent to Theory (workbook.toTheory).
 */
export function finishPlan(
  h: { v: View; qs: number[] },
  dec: Record<number, Decision | undefined>,
  all: boolean,
): { explained: number[]; theoryQs: number[]; reteach?: string } {
  const pick = (q: number): Decision | undefined => dec[q] ?? (all ? "x" : undefined);
  const x = h.qs.filter((q) => pick(q) === "x");
  const th = h.qs.filter((q) => pick(q) === "th");
  if (h.v.f) {
    const sec = th.map((q) => h.v.f!.sections.find((s) => s.solo.includes(q))).find((s) => s && s.kind === "ladder" && s.teach.length > 0);
    return { explained: [...x, ...th].sort((a, b) => a - b), theoryQs: [], reteach: sec?.id };
  }
  return { explained: x, theoryQs: th };
}

/** "2 explained · 1 to Theory · 1 stays": what Done will do. */
export function decisionWords(h: { qs: number[] }, dec: Record<number, Decision | undefined>): string {
  const n = (d: Decision) => h.qs.filter((q) => dec[q] === d).length;
  const open = h.qs.filter((q) => dec[q] === undefined || dec[q] === "skip").length;
  return [
    n("x") ? `${n("x")} explained` : "",
    n("th") ? `${n("th")} to Theory` : "",
    open ? `${open} stay${open === 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A workbook question's marks for her: "1/3", "?" (he couldn't start it), "lost". */
export function lostWords(v: View, q: number): string {
  const r = v.mm.q[String(q)];
  if (!r) return v.marks[String(q)]?.n && v.marks[String(q)]!.n! >= 2 ? "wrong twice" : "wrong";
  if (r.dk) return r.dkp?.length ? `${r.got ?? 0}/${r.max ?? "?"} · ? ${r.dkp.join(" ")}` : "?";
  return r.max !== undefined ? `${r.got ?? 0}/${r.max}` : "lost";
}

/** When he goes home (arrival + 2 hours): "home 5:10 PM", if within the next 30 minutes. */
export function homeSoon(v: View, now: number): string {
  const at = v.s.lastInAt !== undefined ? v.s.lastInAt + 2 * 60 * 60_000 : undefined;
  return at !== undefined && at > now && at - now <= 30 * 60_000 ? `home ${slClock(at)}` : "";
}
