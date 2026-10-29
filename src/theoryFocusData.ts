// The Theory tab's focus views, as plain rules (src/theoryFocus.tsx draws them):
// - Next: lessons to teach, most urgent first. A lesson is what Theory teaches to a group at once: a theory-book
//   section (G11 U13 · C) or a workbook's questions sent to Theory (G7 U08). Each lists who needs it now.
// - Room: who is with Theory now, by lesson, and who is on the way; and who else needs the same lesson right now
//   (they can join it).
// Built on theoryGroups (src/derive.ts): the same urgency and order the old Theory screen's chips use.

import type { SectionData } from "../convex/lib/book";
import type { Urgency } from "../convex/lib/status";
import { fmtMin, roomCalls, theoryGroups, type RoomCall, type View } from "./derive";
import type { Board, Unit } from "./store";

export type LessonKind = "section" | "workbook";

export type NextMember = {
  v: View;
  urgency: Urgency;
  inEvaluation: boolean;
  note?: string;
  /** Workbook: the questions sent to Theory (not taught yet). */
  qs: number[];
  /** Workbook: the whole unit was asked for. */
  whole: boolean;
  /** Section: its teach questions he still needs (all of them, unless an earlier lesson stopped part way). */
  teach: number[];
};

/** A theory-book student's teach questions of this section not taught (or skipped) yet. */
export function teachLeft(v: View, section: SectionData | null): number[] {
  if (!section) return [];
  return section.teach.filter((q) => {
    const s = v.marks[String(q)]?.s;
    return s !== "taught" && s !== "skip";
  });
}
const union = (lists: number[][]) => [...new Set(lists.flat())].sort((a, b) => a - b);

export type NextLesson = {
  /** `${unitId}:${section}`, or `${unitId}:R` for a workbook: the same key a call's lesson has (lessonKey). */
  key: string;
  kind: LessonKind;
  unit: Unit | null;
  section: SectionData | null;
  members: NextMember[];
  /** Workbook: questions two or more of them need (teach once for all), most shared first. */
  shared: { q: number; n: number }[];
  /** Section: the teach questions any of them still needs. */
  teach: number[];
  urgency: Urgency;
};

/** Lessons to teach, most urgent first (one card per section or workbook; a student is in one card only). */
export function nextLessons(views: View[]): NextLesson[] {
  return theoryGroups(views)
    .filter((g) => g.q === undefined) // the per-question chips repeat a workbook's students: the card shows them
    .map((g) => {
      const members: NextMember[] = g.members.map((m) => ({
        v: m.v,
        urgency: m.urgency,
        inEvaluation: m.inEvaluation,
        note: m.note,
        qs: m.v.ms ? [...m.v.ms.theory] : [],
        whole: !!m.v.ms?.wholeUnit,
        teach: teachLeft(m.v, g.section),
      }));
      const count = new Map<number, number>();
      if (!g.section) for (const m of members) for (const q of m.qs) count.set(q, (count.get(q) ?? 0) + 1);
      const shared = [...count]
        .filter(([, n]) => n >= 2)
        .map(([q, n]) => ({ q, n }))
        .sort((a, b) => b.n - a.n || a.q - b.q);
      return {
        key: g.key.replace(/:Q\d+$/, ":R"),
        kind: g.section ? ("section" as const) : ("workbook" as const),
        unit: g.unit,
        section: g.section,
        members,
        shared,
        teach: union(members.map((m) => m.teach)),
        urgency: members[0].urgency,
      };
    });
}

/** Who Next ticks for a call by default: everyone in the hall (calling a student in Evaluation takes him out). */
export function defaultTicks(l: NextLesson): string[] {
  return l.members.filter((m) => !m.inEvaluation).map((m) => m.v.s._id);
}

/** A student's state in a few words, for the teacher: why he is on this list. */
export function memberWords(m: { v: View; urgency: Urgency; inEvaluation: boolean }): string {
  if (m.inEvaluation) return "in Evaluation";
  if (m.urgency === "red") return m.v.idleMs !== undefined && m.v.idleMs >= 60_000 ? `no work ${fmtMin(m.v.idleMs)}` : "no work";
  if (m.v.st) return m.urgency === "amber" ? `${m.v.st.left} left` : "working";
  return "working";
}

/** The lesson a theory call is about: the same key Next uses. */
export function lessonKey(c: { unitId?: string; section?: string; studentId: string }, v?: View): string {
  return `${c.unitId ?? v?.s.unitId ?? "?"}:${c.section ?? "R"}`;
}

export type RoomStudent = { rc: RoomCall; v: View; qs: number[]; whole: boolean; teach: number[] };
export type RoomLesson = {
  key: string;
  kind: LessonKind;
  unit: Unit | null;
  section: SectionData | null;
  /** With Theory now (sent), first come first. */
  here: RoomStudent[];
  /** When the first of them arrived. */
  since: number;
  /** Someone has been here 20 minutes or more ("Still with you?"). */
  long: boolean;
  /** Section: the teach questions any of them still needs. */
  teach: number[];
};

/** Theory's room: lessons going on now (students sent), and who is on the way (called, not sent yet). */
export function roomLessons(board: Board, views: View[], now: number): { lessons: RoomLesson[]; coming: RoomCall[] } {
  const calls = roomCalls(board, views, "theory", now).filter((rc) => rc.c.kind === "theory");
  const lessons = new Map<string, RoomLesson>();
  const coming: RoomCall[] = [];
  for (const rc of calls) {
    if (rc.c.status !== "sent") {
      coming.push(rc);
      continue;
    }
    const v = rc.v;
    if (!v) continue;
    const key = lessonKey(rc.c, v);
    const section = rc.c.section && rc.c.section !== "R" && v.f ? (v.f.sectionById(rc.c.section) ?? null) : null;
    const l = lessons.get(key) ?? {
      key,
      kind: section ? ("section" as const) : ("workbook" as const),
      unit: v.unit,
      section,
      here: [],
      since: rc.c.sentAt ?? rc.c.createdAt,
      long: false,
      teach: [],
    };
    l.here.push({ rc, v, qs: v.ms ? [...v.ms.theory] : [], whole: !!v.ms?.wholeUnit, teach: teachLeft(v, section) });
    l.since = Math.min(l.since, rc.c.sentAt ?? rc.c.createdAt);
    l.long = l.long || rc.long;
    lessons.set(key, l);
  }
  const arrived = (st: RoomStudent) => st.rc.c.sentAt ?? st.rc.c.createdAt;
  for (const l of lessons.values()) {
    l.here.sort((a, b) => arrived(a) - arrived(b) || a.v.s.name.localeCompare(b.v.s.name));
    l.teach = union(l.here.map((st) => st.teach));
  }
  return { lessons: [...lessons.values()].sort((a, b) => a.since - b.since), coming };
}

/** Students in the hall who need this same lesson right now, not called yet: they can join it. */
export function joiners(l: { key: string }, next: NextLesson[]): NextMember[] {
  return next.find((n) => n.key === l.key)?.members.filter((m) => !m.inEvaluation) ?? [];
}

/** The badge on Next: students out of work who need Theory (red), not called yet. */
export function redCount(next: NextLesson[]): number {
  const ids = new Set<string>();
  for (const l of next) for (const m of l.members) if (m.urgency === "red" && !m.inEvaluation) ids.add(m.v.s._id);
  return ids.size;
}

/**
 * What Done sends for one workbook student: everything ticked (or the whole unit ticked) = all taught (calls.finish
 * marks every question sent to Theory and clears the whole-unit request); otherwise the ticked questions are marked
 * taught one by one first and the rest stay for Theory's next call.
 */
export function workbookDone(qs: number[], whole: boolean, ticked: Set<number>, wholeTicked: boolean): { all: true } | { all: false; taught: number[] } {
  if ((whole && wholeTicked) || (!whole && qs.length > 0 && qs.every((q) => ticked.has(q)))) return { all: true };
  if (!whole && qs.length === 0) return { all: true };
  return { all: false, taught: qs.filter((q) => ticked.has(q)) };
}
