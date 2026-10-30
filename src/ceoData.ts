// The CEO page's numbers and words (owner only, 31 Oct 2026). No screen code here (src/ceo.tsx draws).
// - Now: from the board every phone already watches (no extra reads): what waits for each room, in minutes of work.
// - Today, Team, Business: from the owner's overview (convex/ceo.ts), read once and every few minutes while open.
// The arithmetic of a class and of the team is in convex/lib/ceo.ts (shared with the server and the tests).

import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";
import { loadOf, ROOMS, sumDigests, type Digest, type Load, type RoomKey } from "../convex/lib/ceo";
import { DAY_MS, slDay } from "../convex/lib/day";
import { isWalking, pendingSince, theoryGroups, theoryMembers, waitingAll, withBooks, WALK_MS, type View } from "./derive";
import type { Board, Stage } from "./store";

export type Overview = FunctionReturnType<typeof api.ceo.overview>;
export type OStudent = Overview["students"][number];
export type Tone = "red" | "amber" | "green" | "grey";

export const ROOM_NAME: Record<RoomKey, string> = { correction: "Correction", evaluation: "Evaluation", theory: "Theory" };
/** Untimed guesses until the classes have measured them (his numbers): a level, a question, a lesson. */
export const GUESS = { perLevel: 3, perQuestion: 2, lesson: 12 };
/** The classes the team numbers look at: the last ten class days. */
export const TEAM_CLASSES = 10;

/** "45 min", "1 h 20 min", "2 h". */
export function minWords(m: number): string {
  if (m > 0 && m < 0.5) return "<1 min";
  const x = Math.max(0, Math.round(m));
  if (x < 60) return `${x} min`;
  const h = Math.floor(x / 60);
  const r = x % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** "Rs 25,000". */
export function rs(n: number): string {
  const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "−" : ""}Rs ${s}`;
}

/** "Fri 30 Oct" from "2026-10-30". */
export function dayWords(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  const mo = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()];
  return `${wd} ${d.getUTCDate()} ${mo}`;
}

// ---------------------------------------------------------------- Now: the class going on, from the board

export type RoomNow = {
  room: RoomKey;
  /** What waits: levels to correct, questions to explain, students needing a lesson. */
  items: number;
  /** Students waiting for this room. */
  students: number;
  /** Lessons needed (Theory). */
  lessons: number;
  /** Minutes of work waiting, and when its people clear it at their usual speed. */
  minutes: number;
  people: number;
  clearIn: number;
  /** How long the oldest has waited (ms), if known. */
  oldest: number | null;
  /** Students with no work until this room helps them. */
  red: number;
  /** With this room's teacher now, and on their way. */
  inRoom: number;
  coming: number;
  tone: Tone;
  /** Whether the per-item minutes were measured in this centre's classes (else his guesses). */
  measured: boolean;
};
export type NowData = {
  here: number;
  hall: number;
  noWork: { id: string; name: string; min: number; why: RoomKey[] }[];
  soon: number;
  rooms: Record<RoomKey, RoomNow>;
  lost: { name: string; room: string; min: number }[];
  toSend: number;
  stages: Record<"fighter" | "master" | "other", number>;
  grades: { grade: number; n: number }[];
  advice: { tone: Tone; text: string }[];
};

function stageOf(s: Stage | null | undefined): "fighter" | "master" | "other" {
  return s === "fighter" ? "fighter" : s === "master" ? "master" : "other";
}

/** The class right now: who is here, who has no work and why, and the minutes of work waiting for each room. */
export function nowOf(board: Board, views: View[], now: number, load: Load | null): NowData {
  const here = views.filter((v) => v.where !== "absent");
  const hall = here.filter((v) => v.where === "hall");
  const people = (r: RoomKey) => Math.max(1, load?.people[r] ?? 1);
  const why = (v: View): RoomKey[] => {
    const needs = (v.ms?.needs ?? v.st?.needs ?? []) as string[];
    return ROOMS.filter((r) => needs.includes(r));
  };
  const noWork = hall
    .filter((v) => v.noWork)
    .map((v) => ({ id: v.s._id as string, name: v.s.name, min: Math.round((v.idleMs ?? 0) / 60_000), why: why(v) }))
    .sort((a, b) => b.min - a.min || a.name.localeCompare(b.name));
  const redFor = (r: RoomKey) => noWork.filter((x) => x.why.includes(r)).length;
  const sent = board.calls.filter((c) => c.status === "sent");
  const coming = (r: string) => sent.filter((c) => c.room === r && isWalking(c)).length;

  // Correction: levels handed in (every book, gone-home students too), at its usual minutes a level.
  const levels = views.reduce((a, v) => a + waitingAll(v), 0);
  const since = views
    .flatMap((v) => [v, ...v.others])
    .map((v) => v.ms?.waitingSince ?? null)
    .filter((t): t is number => t !== null);
  const perLevel = load?.perLevel ?? GUESS.perLevel;
  const corrMin = levels * perLevel;

  // Evaluation: questions waiting, every book of the students here.
  const books = withBooks(here);
  const evalBooks = books.filter((v) => v.pending.length > 0);
  const questions = evalBooks.reduce((a, v) => a + v.pending.length, 0);
  const evalOld = evalBooks.map(pendingSince).filter((t): t is number => t !== null);
  const perQuestion = load?.perQuestion ?? GUESS.perQuestion;

  // Theory: students who need a lesson, in how many lessons.
  const groups = theoryGroups(views);
  const members = theoryMembers(groups);
  const lessonsNeeded = new Set(groups.filter((g) => g.q === undefined).map((g) => g.key)).size;
  const lesson = load?.lesson ?? GUESS.lesson;
  const theoryOld = members.map((m) => m.v.ms?.theoryAt ?? null).filter((t): t is number => t !== null);

  const tone = (red: number, clearIn: number, items: number): Tone =>
    red > 0 ? "red" : clearIn >= 20 ? "amber" : items > 0 ? "green" : "grey";
  const mk = (r: RoomKey, x: Omit<RoomNow, "room" | "people" | "clearIn" | "tone" | "red" | "inRoom" | "coming">): RoomNow => {
    const clearIn = x.minutes / people(r);
    const red = redFor(r);
    return {
      room: r,
      ...x,
      people: people(r),
      clearIn,
      red,
      inRoom: r === "correction" ? 0 : here.filter((v) => v.where === r).length,
      coming: r === "correction" ? 0 : coming(r),
      tone: tone(red, clearIn, x.items),
    };
  };
  const rooms: Record<RoomKey, RoomNow> = {
    correction: mk("correction", {
      items: levels,
      students: views.filter((v) => waitingAll(v) > 0).length,
      lessons: 0,
      minutes: corrMin,
      oldest: since.length ? now - Math.min(...since) : null,
      measured: load?.perLevel != null,
    }),
    evaluation: mk("evaluation", {
      items: questions,
      students: new Set(evalBooks.map((v) => v.s._id)).size,
      lessons: 0,
      minutes: questions * perQuestion,
      oldest: evalOld.length ? now - Math.min(...evalOld) : null,
      measured: load?.perQuestion != null,
    }),
    theory: mk("theory", {
      items: members.length,
      students: members.length,
      lessons: lessonsNeeded,
      minutes: lessonsNeeded * lesson,
      oldest: theoryOld.length ? now - Math.min(...theoryOld) : null,
      measured: load?.lesson != null,
    }),
  };

  const lost = sent
    .filter((c) => isWalking(c) && c.sentAt !== undefined && now - c.sentAt >= WALK_MS)
    .map((c) => ({
      name: board.students.find((s) => s._id === c.studentId)?.name ?? "?",
      room: c.teacher ? `${c.teacher} in ${ROOM_NAME[c.room]}` : ROOM_NAME[c.room],
      min: Math.round((now - (c.sentAt ?? now)) / 60_000),
    }));
  const toSend = board.calls.filter((c) => c.status === "requested" && !c.pull).length;
  const stages = { fighter: 0, master: 0, other: 0 };
  for (const v of here) stages[stageOf(v.s.stage)]++;
  const byGrade = new Map<number, number>();
  for (const v of here) if (v.s.grade) byGrade.set(v.s.grade, (byGrade.get(v.s.grade) ?? 0) + 1);
  const grades = [...byGrade.entries()].map(([grade, n]) => ({ grade, n })).sort((a, b) => a.grade - b.grade);

  return {
    here: here.length,
    hall: hall.length,
    noWork,
    soon: hall.filter((v) => !v.noWork && v.tone === "amber").length,
    rooms,
    lost,
    toSend,
    stages,
    grades,
    advice: adviceOf(rooms, noWork.length, lost, toSend),
  };
}

/** At most three true lines: what to do now, most urgent first. */
export function adviceOf(rooms: Record<RoomKey, RoomNow>, noWork: number, lost: NowData["lost"], toSend: number): NowData["advice"] {
  const out: NowData["advice"] = [];
  const c = rooms.correction;
  const e = rooms.evaluation;
  const t = rooms.theory;
  if (noWork > 0) {
    // A student waiting for Evaluation or Theory is freed by either: each room's count says how many it can free.
    const parts = ROOMS.filter((r) => rooms[r].red > 0).map((r, i) => `${ROOM_NAME[r]}${i === 0 ? " can free" : ""} ${rooms[r].red}`);
    out.push({ tone: "red", text: `${noWork} with no work now${parts.length ? `. ${parts.join(", ")}` : ""}.` });
  }
  if (c.clearIn >= 20) {
    const help =
      e.items <= 3 && e.inRoom === 0
        ? " Evaluation is free: she can correct too (Class → his name → the level)."
        : " A second pair of hands on Correction now saves idle minutes.";
    out.push({ tone: c.red ? "red" : "amber", text: `Correction is ~${minWords(c.clearIn)} behind (${c.items} levels).${help}` });
  }
  if (t.lessons >= 2 && t.clearIn >= 20 && e.items === 0 && e.inRoom === 0) {
    out.push({ tone: "amber", text: `Theory has ${t.lessons} lessons waiting and Evaluation is free: she can teach one (Teach).` });
  }
  if (lost.length) out.push({ tone: "red", text: `${lost[0].name} hasn't reached ${lost[0].room} for ${lost[0].min} min.` });
  if (toSend >= 3) out.push({ tone: "amber", text: `${toSend} called students not sent yet: Correction must send them.` });
  return out.slice(0, 3);
}

// ---------------------------------------------------------------- Today, Team: from the overview's classes

export type DayRow = { day: string; d: Digest; came: number; open: boolean };

/** One row per class day (two classes on a day count as one), newest first. */
export function classDays(o: Overview): DayRow[] {
  const byDay = new Map<string, Overview["classes"]>();
  for (const c of o.classes) byDay.set(c.day, [...(byDay.get(c.day) ?? []), c]);
  const came = new Map(o.days.map((x) => [x.day, x.came]));
  return [...byDay.entries()]
    .map(([day, cs]) => ({ day, d: sumDigests(cs.map((c) => c.digest))!, came: came.get(day) ?? Math.max(...cs.map((c) => c.digest.came)), open: cs.some((c) => c.open) }))
    .filter((r) => r.d.studentMin > 0 || r.open)
    .sort((a, b) => (a.day < b.day ? 1 : -1));
}

/** The team's numbers from the last class days (not counting a class still going on). */
export function teamLoad(days: DayRow[]): Load {
  return loadOf(days.filter((r) => !r.open).slice(0, TEAM_CLASSES).map((r) => r.d));
}

/** Idle minutes per student-hour, and its colour: under 3 good, 3-6 watch, 6 and more bad. */
export function idleRate(d: Digest): number | null {
  return d.studentMin > 0 ? Math.round((d.idle.total / (d.studentMin / 60)) * 10) / 10 : null;
}
export function idleTone(x: number | null): Tone {
  return x === null ? "grey" : x >= 6 ? "red" : x >= 3 ? "amber" : "green";
}
export function busyTone(x: number | null): Tone {
  return x === null ? "grey" : x >= 0.85 ? "red" : x >= 0.65 ? "amber" : "green";
}

/** The middle of the earlier class days, to compare today with. */
export function usual(days: DayRow[], f: (r: DayRow) => number | null): number | null {
  const xs = days.map(f).filter((x): x is number => x !== null);
  if (xs.length < 2) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

// ---------------------------------------------------------------- Business: who comes, who stopped, who struggles

export type Risk = { s: OStudent; days: number; tone: "red" | "amber"; why: string };

/** Students quietly leaving: not seen 14+ days (red), 7-13 days (amber), or coming half as often as before. */
export function risksOf(students: OStudent[], now: number, since: number): Risk[] {
  const out: Risk[] = [];
  for (const s of students) {
    const from = s.lastInAt ?? Math.max(s.created, since);
    const days = Math.max(0, Math.floor((now - from) / DAY_MS));
    if (days >= 14) out.push({ s, days, tone: "red", why: s.lastInAt ? `not seen for ${days} days` : `never signed in (${days} days)` });
    else if (days >= 7) out.push({ s, days, tone: "amber", why: `not seen for ${days} days` });
    else if (s.prev28 >= 4 && s.days28 * 2 <= s.prev28) out.push({ s, days, tone: "amber", why: `came ${s.days28} days in 4 weeks (was ${s.prev28})` });
  }
  return out.sort((a, b) => (a.tone === b.tone ? b.days - a.days : a.tone === "red" ? -1 : 1));
}

/** Students by grade and stage: the shape of the centre. */
export function matrixOf(students: OStudent[]) {
  const stages = ["fighter", "master", "legend", "sprint", "none"] as const;
  const rows = [6, 7, 8, 9, 10, 11].map((grade) => {
    const g = students.filter((s) => s.grade === grade);
    const n = Object.fromEntries(stages.map((st) => [st, g.filter((s) => (s.stage ?? "none") === st).length])) as Record<(typeof stages)[number], number>;
    return { grade, total: g.length, n };
  });
  const used = stages.filter((st) => rows.some((r) => r.n[st] > 0));
  return { rows, used: used.length ? used : (["fighter", "master"] as (typeof stages)[number][]) };
}

/** Distinct students who came in the last 7 days. */
export function cameWeek(students: OStudent[], now: number): number {
  return students.filter((s) => s.lastInAt !== null && now - s.lastInAt < 7 * DAY_MS).length;
}

/** The attendance bars: the last 14 calendar days, with the days nobody came as 0. */
export function attendanceBars(o: Overview, n = 14): { day: string; came: number }[] {
  const came = new Map(o.days.map((x) => [x.day, x.came]));
  const out: { day: string; came: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = slDay(o.now - i * DAY_MS);
    out.push({ day, came: came.get(day) ?? 0 });
  }
  return out;
}
