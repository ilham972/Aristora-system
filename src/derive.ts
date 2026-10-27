// Turns the live board into what each teacher needs to see: tiles, queues, groups.

import {
  evalUrgency,
  LONG_SITTING_MS,
  oldestPendingAt,
  quietLimit,
  theoryUrgency,
  type EvalUrgency,
  type Marks,
  type Status,
  type Urgency,
} from "../convex/lib/status";
import { longLabel, sectionById, SECTIONS, type Section } from "../convex/lib/unit";
import { marksOf, statusOf, type Board, type Call, type Student } from "./store";

export type Tone = "red" | "amber" | "green" | "yellow" | "theory" | "evaluation" | "grey" | "done";

export type View = {
  s: Student;
  st: Status;
  marks: Marks;
  calls: Call[];
  /** Where he is right now. */
  where: "absent" | "hall" | "theory" | "evaluation";
  /** A room has called him and he hasn't gone yet (Correction must send him). */
  calledTo?: "theory" | "evaluation";
  /** Theory will take him straight from the evaluation room. */
  pulled: boolean;
  /** Minutes he has been out of work (server idle clock), if out of work. */
  idleMs?: number;
  quietMs?: number;
  quiet: boolean;
  tone: Tone;
  line: string;
};

/** "3 min", or "under 1 min". */
export function fmtMin(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 1 ? "under 1 min" : `${m} min`;
}

/** " (3 min)" once it's a minute or more, else nothing. */
export function forMin(ms: number | undefined): string {
  if (ms === undefined || ms < 60_000) return "";
  return ` (${Math.floor(ms / 60_000)} min)`;
}

export function fmtClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

const sectionName = (id: string | null) => (id ? `${id} theory` : "theory");

export function buildViews(board: Board, now: number): View[] {
  const byStudent = new Map<string, Call[]>();
  for (const c of board.calls) {
    const list = byStudent.get(c.studentId) ?? [];
    list.push(c);
    byStudent.set(c.studentId, list);
  }
  const views = board.students.map((s) => {
    const st = statusOf(s);
    const marks = marksOf(s);
    const calls = byStudent.get(s._id) ?? [];
    const requested = calls.find((c) => c.status === "requested" && !c.pull);
    const pulled = calls.some((c) => c.status === "requested" && c.pull);
    const where: View["where"] = !s.present ? "absent" : (s.room ?? "hall");
    const idleMs = s.idleSince !== undefined ? Math.max(0, now - s.idleSince) : undefined;
    const quietMs = s.lastActivityAt !== undefined ? now - s.lastActivityAt : undefined;
    const quiet = where === "hall" && !requested && !st.dry && !st.finished && quietMs !== undefined && quietMs >= quietLimit(st);

    let tone: Tone;
    let line: string;
    if (where === "absent") {
      tone = "grey";
      line = "Not here";
    } else if (where === "theory" || where === "evaluation") {
      const c = calls.find((x) => x.status === "sent" && x.room === where);
      tone = where;
      line = `In ${where === "theory" ? "Theory" : "Evaluation"}${c?.sentAt ? forMin(now - c.sentAt) : ""}${pulled ? ", then Theory" : ""}`;
    } else if (requested) {
      tone = requested.room;
      line = `Called to ${requested.room === "theory" ? "Theory" : "Evaluation"}`;
    } else if (st.finished) {
      tone = "done";
      line = "Finished the unit";
    } else if (st.dry) {
      tone = "red";
      const what = st.needs.includes("theory") ? `needs ${sectionName(st.nextTheory)}` : "waiting for evaluation";
      line = `Out of work${forMin(idleMs)}: ${what}`;
    } else if (quiet) {
      tone = "yellow";
      line = `Quiet for ${fmtMin(quietMs!)}. Go and check`;
    } else if (st.left <= 2 && st.nextTheory) {
      tone = "amber";
      line = `${st.left} left, then ${sectionName(st.nextTheory)}`;
    } else {
      tone = "green";
      line = `${longLabel(st.doable[0])} next${st.left > 1 ? `, ${st.left} left` : ""}`;
    }
    return { s, st, marks, calls, where, calledTo: requested?.room, pulled, idleMs, quietMs, quiet, tone, line };
  });
  return views.sort((a, b) => a.s.name.localeCompare(b.s.name));
}

// ---------------- Theory queue ----------------

export type TheoryMember = {
  v: View;
  urgency: Urgency;
  /** Why he can't simply be sent now, if any. */
  note?: string;
  /** Calling him takes him from the evaluation room. */
  inEvaluation: boolean;
};
export type TheoryGroup = { section: Section; members: TheoryMember[]; reteach: boolean };

const rankU: Record<Urgency, number> = { red: 0, amber: 1, green: 2 };

function theorySort(a: TheoryMember, b: TheoryMember) {
  return (
    rankU[a.urgency] - rankU[b.urgency] ||
    (b.v.idleMs ?? 0) - (a.v.idleMs ?? 0) ||
    a.v.st.left - b.v.st.left ||
    (a.v.s.lastSeenAt ?? 0) - (b.v.s.lastSeenAt ?? 0) ||
    a.v.s.name.localeCompare(b.v.s.name)
  );
}

/** Students who need theory next, grouped by section, most urgent group first. */
export function theoryGroups(views: View[]): TheoryGroup[] {
  const groups = new Map<string, TheoryMember[]>();
  for (const v of views) {
    if (v.where === "absent" || !v.st.nextTheory) continue;
    if (v.calls.some((c) => c.kind === "theory")) continue; // already called / being taught
    const inEvaluation = v.where === "evaluation";
    const m: TheoryMember = {
      v,
      urgency: theoryUrgency(v.st),
      inEvaluation,
      note: inEvaluation ? "In Evaluation now" : v.calledTo === "evaluation" ? "Evaluation called them" : undefined,
    };
    const list = groups.get(v.st.nextTheory) ?? [];
    list.push(m);
    groups.set(v.st.nextTheory, list);
  }
  const out: TheoryGroup[] = [];
  for (const [id, members] of groups) {
    members.sort(theorySort);
    out.push({ section: sectionById(id)!, members, reteach: members.some((m) => m.v.st.reteach) });
  }
  return out.sort((a, b) => theorySort(a.members[0], b.members[0]) || a.section.id.localeCompare(b.section.id));
}

/** Who to tick by default: up to 3 of the most urgent, in the hall. */
export function defaultPick(g: TheoryGroup, max = 3): string[] {
  return g.members
    .filter((m) => !m.inEvaluation)
    .slice(0, max)
    .map((m) => m.v.s._id);
}

// ---------------- Evaluation queue ----------------

export type EvalMember = {
  v: View;
  urgency: EvalUrgency;
  readyInMs?: number;
  /** Can't be called now (Theory has him). */
  blockedBy?: string;
};

const rankE: Record<EvalUrgency, number> = { red: 0, ready: 1, wait: 2 };

export function evalQueue(views: View[], now: number): EvalMember[] {
  const out: EvalMember[] = [];
  for (const v of views) {
    if (v.where === "absent" || v.st.pending.length === 0) continue;
    if (v.calls.some((c) => c.room === "evaluation")) continue; // already called / in the room
    const urgency = evalUrgency(v.marks, v.st, now);
    const oldest = oldestPendingAt(v.marks, v.st);
    const readyInMs = urgency === "wait" && oldest !== null ? Math.max(0, oldest + 10 * 60_000 - now) : undefined;
    const theory = v.calls.find((c) => c.room === "theory");
    out.push({
      v,
      urgency,
      readyInMs,
      blockedBy: theory ? (theory.status === "sent" ? "In Theory now" : "Called to Theory") : undefined,
    });
  }
  const age = (m: EvalMember) => oldestPendingAt(m.v.marks, m.v.st) ?? 0;
  return out.sort(
    (a, b) =>
      Number(!!a.blockedBy) - Number(!!b.blockedBy) ||
      rankE[a.urgency] - rankE[b.urgency] ||
      b.v.st.stuck.length - a.v.st.stuck.length ||
      age(a) - age(b) ||
      a.v.s.name.localeCompare(b.v.s.name),
  );
}

/** The same question wrong for 2+ students who can be called now. */
export function sameMistakes(queue: EvalMember[]): { q: number; members: EvalMember[] }[] {
  const byQ = new Map<number, EvalMember[]>();
  for (const m of queue) {
    if (m.blockedBy) continue;
    for (const q of m.v.st.pending) {
      const list = byQ.get(q) ?? [];
      list.push(m);
      byQ.set(q, list);
    }
  }
  return [...byQ.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([q, members]) => ({ q, members }))
    .sort((a, b) => b.members.length - a.members.length || a.q - b.q);
}

// ---------------- Rooms ----------------

export type RoomCall = { c: Call; v?: View; minutes: number; long: boolean };

export function roomCalls(board: Board, views: View[], room: "theory" | "evaluation", now: number): RoomCall[] {
  const byId = new Map(views.map((v) => [v.s._id as string, v]));
  return board.calls
    .filter((c) => c.room === room)
    .map((c) => {
      const since = c.sentAt ?? c.createdAt;
      return { c, v: byId.get(c.studentId), minutes: now - since, long: c.status === "sent" && now - since >= LONG_SITTING_MS };
    })
    .sort((a, b) => a.c.createdAt - b.c.createdAt);
}

export function roomBusy(board: Board, room: "theory" | "evaluation") {
  return board.calls.some((c) => c.room === room && (c.status === "sent" || (c.status === "requested" && !c.pull)));
}

/** Sections that hold his waiting wrong answers (for "re-teach"). */
export function pendingSections(st: Status): Section[] {
  const ids = new Set<string>();
  for (const q of st.pending) {
    const s = SECTIONS.find((x) => x.solo.includes(q));
    if (s && s.kind === "ladder") ids.add(s.id);
  }
  return SECTIONS.filter((s) => ids.has(s.id));
}
