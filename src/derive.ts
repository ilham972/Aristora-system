// Turns the live board into what each teacher needs to see: rows, queues, groups.
// Every student has his own book: a theory book (Fighter), a workbook (Master), or none in the app
// (Legend, Exam Sprint, or a unit whose book isn't loaded yet).

import type { Fighter, MasterData, SectionData } from "../convex/lib/book";
import { computeMaster, masterEvalUrgency, type MState, type MStatus } from "../convex/lib/master";
import {
  evalUrgency,
  LONG_SITTING_MS,
  oldestPendingAt,
  QUIET_PAPERS_MS,
  quietLimit,
  theoryUrgency,
  type EvalUrgency,
  type Marks,
  type Status,
  type Urgency,
} from "../convex/lib/status";
import {
  fighterOf,
  marksOf,
  masterOf,
  masterStateOf,
  stageName,
  statusOf,
  unitOf,
  type Board,
  type Call,
  type Stage,
  type Student,
  type Unit,
} from "./store";

export type Tone = "red" | "amber" | "green" | "yellow" | "theory" | "evaluation" | "grey" | "done" | "none";
export type Kind = "fighter" | "master" | "none";

export type View = {
  s: Student;
  unit: Unit | null;
  stage: Stage | null;
  kind: Kind;
  /** Fighter: his theory book, where he stands, his circles. */
  f: Fighter | null;
  st: Status | null;
  marks: Marks;
  /** Master: his workbook, where he stands, his levels and marks. */
  mb: MasterData | null;
  ms: MStatus | null;
  mm: MState;
  /** Questions waiting for the Evaluation teacher, in either book. */
  pending: number[];
  calls: Call[];
  /** Where he is right now. */
  where: "absent" | "hall" | "theory" | "evaluation";
  /** A room has called him and he hasn't gone yet (Correction must send him). */
  calledTo?: "theory" | "evaluation";
  /** Theory will take him straight from the evaluation room. */
  pulled: boolean;
  /** How long he has been out of work (server idle clock), if out of work. */
  idleMs?: number;
  quietMs?: number;
  quiet: boolean;
  tone: Tone;
  line: string;
  /** "G11 · U13" */
  tag: string;
};

/** "3 min", or "under 1 min". */
export function fmtMin(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 1 ? "under 1 min" : `${m} min`;
}

/** "4 min", or "<1 min": for the tight call strips. */
export function shortMin(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 1 ? "<1 min" : `${m} min`;
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

/** "G11 · U13" for a student's place. */
export function tagOf(s: Student, unit: Unit | null): string {
  const g = s.grade ? `G${s.grade}` : "";
  return unit ? `${g} · ${unit.code}` : g;
}

const sectionName = (id: string | null) => (id ? `${id} theory` : "theory");

/** A class with no activity for this long is over, even if nobody tapped End the session (as on the server). */
export const STALE_MS = 4 * 60 * 60_000;

/** The class going on now, or null (none, or one left open since an earlier day). */
export function liveSession(board: Board, now: number): Board["session"] {
  return board.session && now - board.session.lastActivityAt < STALE_MS ? board.session : null;
}

export function buildViews(board: Board, now: number): View[] {
  // Yesterday's class left open still says "present" until the next tap closes it: nobody is here.
  const live = liveSession(board, now) !== null;
  const byStudent = new Map<string, Call[]>();
  for (const c of board.calls) {
    const list = byStudent.get(c.studentId) ?? [];
    list.push(c);
    byStudent.set(c.studentId, list);
  }
  const views = board.students.map((s): View => {
    const unit = unitOf(s.unitId);
    const stage = (s.stage ?? null) as Stage | null;
    const f = stage === "fighter" ? fighterOf(s) : null;
    const mb = stage === "master" ? masterOf(s) : null;
    const st = f ? statusOf(s) : null;
    const marks = f ? marksOf(s) : {};
    const mm = masterStateOf(s);
    const ms = mb ? computeMaster(mm, mb) : null;
    const kind: Kind = st ? "fighter" : ms ? "master" : "none";
    const pending = st ? st.pending : ms ? ms.pending : [];
    const calls = byStudent.get(s._id) ?? [];
    const requested = calls.find((c) => c.status === "requested" && !c.pull);
    const pulled = calls.some((c) => c.status === "requested" && c.pull);
    const where: View["where"] = !s.present || !live ? "absent" : (s.room ?? "hall");
    const idleMs = s.idleSince !== undefined ? Math.max(0, now - s.idleSince) : undefined;
    const quietMs = s.lastActivityAt !== undefined ? now - s.lastActivityAt : undefined;
    const limit = st ? quietLimit(st) : QUIET_PAPERS_MS;
    const busy = st ? !st.dry && !st.finished : ms ? !ms.dry && !ms.finished : false;
    const quiet = where === "hall" && !requested && busy && quietMs !== undefined && quietMs >= limit;

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
    } else if (st) {
      if (st.finished) {
        tone = "done";
        line = "Finished the book";
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
        line = `${f!.longLabel(st.doable[0])} next${st.left > 1 ? `, ${st.left} left` : ""}`;
      }
    } else if (ms) {
      const w = ms.waiting[0];
      if (ms.finished) {
        tone = "done";
        line = `Finished the workbook: ${ms.unit.pct}%`;
      } else if (ms.dry) {
        tone = "red";
        line = `Out of work${forMin(idleMs)}: ${
          ms.needs.includes("correction") ? `Level ${w.n} to correct` : ms.needs.includes("evaluation") ? "waiting for evaluation" : "waiting for Theory"
        }`;
      } else if (quiet) {
        tone = "yellow";
        line = `Quiet for ${fmtMin(quietMs!)}. Go and check`;
      } else if (w) {
        tone = "amber";
        line = `Level ${w.n} to correct${forMin(ms.waitingSince === null ? undefined : now - ms.waitingSince)}`;
      } else {
        tone = "green";
        line = `On Level ${ms.current!.n}${ms.sofar.pct !== null ? `, ${ms.sofar.pct}% so far` : ""}`;
      }
    } else {
      tone = "none";
      line =
        stage === "legend" || stage === "sprint"
          ? `${stageName(stage)}: in the app soon`
          : unit
            ? `No ${stage === "master" ? "workbook" : "theory book"} for ${unit.code} in the app yet`
            : "Choose a unit";
    }
    return {
      s,
      unit,
      stage,
      kind,
      f,
      st,
      marks,
      mb,
      ms,
      mm,
      pending,
      calls,
      where,
      calledTo: requested?.room,
      pulled,
      idleMs,
      quietMs,
      quiet,
      tone,
      line,
      tag: tagOf(s, unit),
    };
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
export type TheoryGroup = {
  key: string;
  unit: Unit | null;
  /** The section to teach (Fighter), or null for a Master workbook. */
  section: SectionData | null;
  /** Master: the one question this group needs (two or more students). */
  q?: number;
  /** "U13 D", "U08 workbook", "U08 Q13". */
  label: string;
  members: TheoryMember[];
  reteach: boolean;
};

const rankU: Record<Urgency, number> = { red: 0, amber: 1, green: 2 };

function left(v: View): number {
  return v.st ? v.st.left : v.ms ? (v.ms.current ? 99 : 0) : 99;
}

function theorySort(a: TheoryMember, b: TheoryMember) {
  return (
    rankU[a.urgency] - rankU[b.urgency] ||
    (b.v.idleMs ?? 0) - (a.v.idleMs ?? 0) ||
    left(a.v) - left(b.v) ||
    (a.v.s.lastSeenAt ?? 0) - (b.v.s.lastSeenAt ?? 0) ||
    a.v.s.name.localeCompare(b.v.s.name)
  );
}

/**
 * Students who need theory next, most urgent group first. Fighter: by unit and section (his next section). Master
 * (Theory comes after Correction and Evaluation): one group per workbook with everyone who has questions sent to
 * Theory (or the whole unit), plus a group per question two or more of them need (one lesson for all). A Master
 * student can be in both: chips are only shortcuts for choosing who to call.
 */
export function theoryGroups(views: View[]): TheoryGroup[] {
  const groups = new Map<string, { unit: Unit | null; section: SectionData | null; q?: number; members: TheoryMember[] }>();
  const add = (key: string, v: View, section: SectionData | null, m: TheoryMember, q?: number) => {
    const g = groups.get(key) ?? { unit: v.unit, section, q, members: [] };
    g.members.push(m);
    groups.set(key, g);
  };
  for (const v of views) {
    if (v.where === "absent") continue;
    if (v.calls.some((c) => c.kind === "theory")) continue; // already called / being taught
    const inEvaluation = v.where === "evaluation";
    const member = (urgency: Urgency): TheoryMember => ({
      v,
      urgency,
      inEvaluation,
      note: inEvaluation ? "In Evaluation now" : v.calledTo === "evaluation" ? "Evaluation called them" : undefined,
    });
    if (v.st && v.f && v.st.nextTheory) {
      add(`${v.s.unitId}:${v.st.nextTheory}`, v, v.f.sectionById(v.st.nextTheory) ?? null, member(theoryUrgency(v.st)));
    } else if (v.ms?.reteach) {
      const m = member(v.ms.dry ? "red" : "amber");
      add(`${v.s.unitId}:R`, v, null, m);
      for (const q of v.ms.theory) add(`${v.s.unitId}:Q${q}`, v, null, m, q);
    }
  }
  const out: TheoryGroup[] = [];
  for (const [key, g] of groups) {
    if (g.q !== undefined && g.members.length < 2) continue; // only he needs it: his workbook's chip has him
    g.members.sort(theorySort);
    const code = g.unit?.code ?? "?";
    out.push({
      key,
      unit: g.unit,
      section: g.section,
      q: g.q,
      label: g.section ? `${code} ${g.section.id}` : g.q !== undefined ? `${code} Q${g.q}` : `${code} workbook`,
      members: g.members,
      reteach: g.section ? g.members.some((m) => m.v.st?.reteach) : true,
    });
  }
  return out.sort(
    (a, b) =>
      theorySort(a.members[0], b.members[0]) ||
      b.members.length - a.members.length ||
      a.label.localeCompare(b.label, undefined, { numeric: true }),
  );
}

/** Each student once, from groups that may share students (Master question chips). */
export function theoryMembers(groups: TheoryGroup[]): TheoryMember[] {
  const seen = new Map<string, TheoryMember>();
  for (const g of groups) for (const m of g.members) if (!seen.has(m.v.s._id)) seen.set(m.v.s._id, m);
  return [...seen.values()];
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

/** When his oldest waiting question went wrong (or lost marks). */
export function pendingSince(v: View): number | null {
  if (v.st) return oldestPendingAt(v.marks, v.st);
  return v.ms?.pendingAt ?? null;
}

export function evalUrgencyOf(v: View, now: number): EvalUrgency {
  if (v.st) return evalUrgency(v.marks, v.st, now);
  if (v.ms) return masterEvalUrgency(v.ms, now);
  return "wait";
}

export function evalQueue(views: View[], now: number): EvalMember[] {
  const out: EvalMember[] = [];
  for (const v of views) {
    if (v.where === "absent" || v.pending.length === 0) continue;
    if (v.calls.some((c) => c.room === "evaluation")) continue; // already called / in the room
    const urgency = evalUrgencyOf(v, now);
    const oldest = pendingSince(v);
    const readyInMs = urgency === "wait" && oldest !== null ? Math.max(0, oldest + 10 * 60_000 - now) : undefined;
    const theory = v.calls.find((c) => c.room === "theory");
    out.push({
      v,
      urgency,
      readyInMs,
      blockedBy: theory ? (theory.status === "sent" ? "In Theory now" : "Called to Theory") : undefined,
    });
  }
  const age = (m: EvalMember) => pendingSince(m.v) ?? 0;
  const stuck = (m: EvalMember) => m.v.st?.stuck.length ?? 0;
  return out.sort(
    (a, b) =>
      Number(!!a.blockedBy) - Number(!!b.blockedBy) ||
      rankE[a.urgency] - rankE[b.urgency] ||
      stuck(b) - stuck(a) ||
      age(a) - age(b) ||
      a.v.s.name.localeCompare(b.v.s.name),
  );
}

/** "Q22", "2016 paper": a question as the student's book prints it. */
export function qName(v: View, q: number): string {
  return v.f ? v.f.longLabel(q) : `Q${q}`;
}

/** The same question of the same book wrong for 2+ students who can be called now. */
export function sameMistakes(queue: EvalMember[]): { key: string; label: string; q: number; members: EvalMember[] }[] {
  const byQ = new Map<string, { label: string; q: number; members: EvalMember[] }>();
  for (const m of queue) {
    if (m.blockedBy) continue;
    for (const q of m.v.pending) {
      const key = `${m.v.s.unitId}:${m.v.stage}:${q}`;
      const g = byQ.get(key) ?? { label: `${m.v.unit?.code ?? ""} ${qName(m.v, q)}`.trim(), q, members: [] };
      g.members.push(m);
      byQ.set(key, g);
    }
  }
  return [...byQ.entries()]
    .filter(([, g]) => g.members.length >= 2)
    .map(([key, g]) => ({ key, ...g }))
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
export function pendingSections(v: View): SectionData[] {
  if (!v.f || !v.st) return [];
  const ids = new Set<string>();
  for (const q of v.st.pending) {
    const s = v.f.sections.find((x) => x.solo.includes(q));
    if (s && s.kind === "ladder") ids.add(s.id);
  }
  return v.f.sections.filter((s) => ids.has(s.id));
}
