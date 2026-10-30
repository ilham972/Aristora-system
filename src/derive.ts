// Turns the live board into what each teacher needs to see: rows, queues, groups.
// Every student has his own book: a theory book (Fighter), a workbook (Master), or none in the app
// (Legend, Exam Sprint, or a unit whose book isn't loaded yet).

import { fighter, type Fighter, type MasterData, type SectionData } from "../convex/lib/book";
import { slDay } from "../convex/lib/day";
import { computeMaster, EMPTY_MASTER, masterEvalUrgency, type MState, type MStatus } from "../convex/lib/master";
import {
  computeStatus,
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
  bookDocAt,
  fighterOf,
  marksOf,
  masterOf,
  masterStateIn,
  masterStateOf,
  stageName,
  statusOf,
  unitOf,
  type Board,
  type Call,
  type Progress,
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
  /** Student + book ("<student>:<unit>:<stage>"): a student works on several books, one view each. */
  key: string;
  /** His book now is blocked AND no book given to him has work: really out of work (30 Oct 2026). */
  noWork: boolean;
  /** Books given to him (not this one) that still have work: ["U09"]. */
  otherWork: string[];
  /** His other books with something waiting (a level handed in, marks to explain, questions for Theory). */
  others: View[];
  /** On one of his other books: his main view (his book now, where he is). */
  home?: View;
};

/** Every book of every student: their main views and their other books (Evaluation, Theory and Correction use it). */
export function withBooks(views: View[]): View[] {
  return views.flatMap((v) => (v.others.length ? [v, ...v.others] : [v]));
}

/** Workbook levels handed in and waiting for Correction, in all his books. */
export function waitingAll(v: View): number {
  return (v.ms?.waiting.length ?? 0) + v.others.reduce((a, b) => a + (b.ms?.waiting.length ?? 0), 0);
}

/** Did this room finish with him today? Those not seen today go first (fair turns). */
export function seenToday(v: View, room: "theory" | "evaluation", now: number): boolean {
  const t = v.s.seen?.[room];
  return t !== undefined && slDay(t) === slDay(now);
}

/** One of his other books, as a view of its own (where he is and his calls are the student's). */
function bookView(home: View, p: Progress): View | null {
  const unit = unitOf(p.unitId);
  const doc = bookDocAt(p.unitId, p.stage);
  if (!unit || !doc) return null;
  const base = { ...home, unit, stage: p.stage as Stage, home, others: [], tag: tagOf(home.s, unit), key: `${home.s._id}:${p.unitId}:${p.stage}` };
  if (doc.data.kind === "fighter" && p.stage === "fighter") {
    const f = fighter(doc.data);
    const marks = (p.marks ?? {}) as Marks;
    const st = computeStatus(marks, f);
    return { ...base, kind: "fighter", f, st, marks, mb: null, ms: null, mm: EMPTY_MASTER, pending: st.pending };
  }
  if (doc.data.kind === "master" && p.stage === "master") {
    const mm = masterStateIn(home.s, p);
    const ms = computeMaster(mm, doc.data);
    return { ...base, kind: "master", f: null, st: null, marks: {}, mb: doc.data, ms, mm, pending: ms.pending };
  }
  return null;
}

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
    // Several books at once: his book now blocked is not "out of work" while a book given to him has work.
    const otherWork = (board.given?.[s._id] ?? [])
      .filter((g) => g.work && !(g.unitId === s.unitId && g.stage === stage))
      .map((g) => unitOf(g.unitId)?.code ?? "?");
    const dryHere = st ? st.dry : ms ? ms.dry : false;
    const noWork = dryHere && otherWork.length === 0;
    const onOther = `on ${otherWork.join(", ")}`;
    const busy = st ? !noWork && !st.finished : ms ? !noWork && !ms.finished : false;
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
      } else if (noWork) {
        tone = "red";
        const what = st.needs.includes("theory") ? `needs ${sectionName(st.nextTheory)}` : "waiting for evaluation";
        line = `Out of work${forMin(idleMs)}: ${what}`;
      } else if (st.dry) {
        tone = "green";
        line = `${unit?.code ?? "This book"} ${st.needs.includes("theory") ? `needs ${sectionName(st.nextTheory)}` : "waits for evaluation"} · ${onOther}`;
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
      } else if (noWork) {
        tone = "red";
        line = `Out of work${forMin(idleMs)}: ${
          ms.needs.includes("correction") ? `Level ${w.n} to correct` : ms.needs.includes("evaluation") ? "waiting for evaluation" : "waiting for Theory"
        }`;
      } else if (ms.dry) {
        tone = w ? "amber" : "green";
        line = `${w ? `Level ${w.n} to correct` : `${unit?.code ?? "This book"} waits for ${ms.needs.includes("evaluation") ? "Evaluation" : "Theory"}`} · ${onOther}`;
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
    const view: View = {
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
      key: `${s._id}:${s.unitId ?? ""}:${stage ?? ""}`,
      noWork,
      otherWork,
      others: [],
    };
    for (const p of board.more?.[s._id] ?? []) {
      const b = bookView(view, p);
      if (b) view.others.push(b);
    }
    return view;
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

function left(v0: View): number {
  const v = v0.home ?? v0;
  if (v.otherWork.length && !v.noWork) return 99;
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
  for (const v of withBooks(views)) {
    if (v.where === "absent") continue;
    if (v.calls.some((c) => c.kind === "theory")) continue; // already called / being taught
    const home = v.home ?? v;
    const unitKey = v.unit?._id ?? v.s.unitId;
    const inEvaluation = v.where === "evaluation";
    const member = (urgency: Urgency): TheoryMember => ({
      v,
      urgency,
      inEvaluation,
      note: inEvaluation ? "In Evaluation now" : v.calledTo === "evaluation" ? "Evaluation called them" : undefined,
    });
    // Theory books: his next section, in his book now only. Workbooks: every book with questions sent to Theory.
    if (!v.home && v.st && v.f && v.st.nextTheory) {
      const st = v.st.dry === home.noWork ? v.st : { ...v.st, dry: home.noWork };
      add(`${unitKey}:${v.st.nextTheory}`, v, v.f.sectionById(v.st.nextTheory) ?? null, member(theoryUrgency(st)));
    } else if (v.ms?.reteach) {
      const m = member(home.noWork ? "red" : "amber");
      add(`${unitKey}:R`, v, null, m);
      for (const q of v.ms.theory) add(`${unitKey}:Q${q}`, v, null, m, q);
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

/** Red = no work at all (every book of his blocked), stuck or stopped; ready = waited 10 minutes. */
export function evalUrgencyOf(v: View, now: number): EvalUrgency {
  const noWork = (v.home ?? v).noWork;
  if (v.st) return evalUrgency(v.marks, v.st.dry === noWork ? v.st : { ...v.st, dry: noWork }, now);
  if (v.ms) return masterEvalUrgency(v.ms.dry === noWork ? v.ms : { ...v.ms, dry: noWork }, now);
  return "wait";
}

/**
 * One entry per book with something to explain (a student with two books is listed twice: one book per call). Order:
 * can be called, red, ready, waiting; then not seen by Evaluation today first (fair turns), stuck, longest wait.
 */
export function evalQueue(views: View[], now: number): EvalMember[] {
  const out: EvalMember[] = [];
  for (const v of withBooks(views)) {
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
  const seen = (m: EvalMember) => Number(seenToday(m.v, "evaluation", now));
  return out.sort(
    (a, b) =>
      Number(!!a.blockedBy) - Number(!!b.blockedBy) ||
      rankE[a.urgency] - rankE[b.urgency] ||
      seen(a) - seen(b) ||
      stuck(b) - stuck(a) ||
      age(a) - age(b) ||
      a.v.s.name.localeCompare(b.v.s.name) ||
      (a.v.unit?.code ?? "").localeCompare(b.v.unit?.code ?? "", undefined, { numeric: true }),
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
      const key = `${m.v.unit?._id ?? m.v.s.unitId}:${m.v.stage}:${q}`;
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
  const byId = new Map(views.map((v) => [v.s._id as string, v.home ?? v]));
  // A call is for one of his books: the view of that book (his main view when the call names none).
  const byBook = new Map(withBooks([...byId.values()]).map((v) => [v.key, v]));
  return board.calls
    .filter((c) => c.room === room)
    .map((c) => {
      const since = c.sentAt ?? c.createdAt;
      const v = (c.unitId && c.stage ? byBook.get(`${c.studentId}:${c.unitId}:${c.stage}`) : undefined) ?? byId.get(c.studentId);
      return { c, v, minutes: now - since, long: c.status === "sent" && now - since >= LONG_SITTING_MS };
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
