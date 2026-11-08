// The Owner page (owner only, 31 Oct 2026): what each class cost in teacher minutes and gave in work, and what the team
// can carry. Pure functions: the server reads one class's events, calls and visits (convex/boss.ts; closeSession keeps
// the result in the class report as `digest`), the phones combine classes and draw (src/boss.tsx). No AI, arithmetic.
//
// Teacher minutes, per person:
// - Evaluation and Theory: from Arrived (else Sent) to Done of every call she finished. Students with her at the same
//   time share those minutes (a lesson of 4 = a quarter each); a visit counts 45 minutes at most (a forgotten Done).
// - Correction: each workbook level from its first mark to Save (`took`, timed since 31 Oct 2026; untimed = 3 minutes,
//   his number), a home-marked level checked or a level re-marked = 1 minute, a theory-book answer = the time since her
//   previous mark, 90 s at most (the walk to the next student is part of the job).
// A person counts once in a class, in the room where she spent most minutes. Demo students never count.

import { slDay } from "./day";

export const ROOMS = ["correction", "evaluation", "theory"] as const;
export type RoomKey = (typeof ROOMS)[number];
export const STAGE_KEYS = ["fighter", "master", "other"] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

/** An untimed level: his estimate (30 Oct 2026: 2-4 minutes a level). */
export const LEVEL_MS = 3 * 60_000;
/** A timed level longer than this was left half-marked: it counts this much. */
export const LEVEL_MAX_MS = 12 * 60_000;
/** Checking a level marked at home, or changing a corrected level's marks. */
export const CHECK_MS = 60_000;
/** A theory-book answer: the time since her previous mark, at most this; the first of a run this much. */
export const MARK_MAX_MS = 90_000;
export const MARK_FIRST_MS = 30_000;
/**
 * A whole-class lesson at the board (3 Nov 2026, convex/teach.ts): each Taught tap is her work since her previous tap
 * at the board, at most BOARD_MAX_MS (a longer gap: she stopped; the first of a run counts BOARD_FIRST_MS). A run on
 * one unit is one lesson.
 */
export const BOARD_MAX_MS = 12 * 60_000;
export const BOARD_FIRST_MS = 4 * 60_000;
/** A room visit longer than this was a forgotten Done: it counts this much. */
export const VISIT_MAX_MS = 45 * 60_000;
/** A person can keep this share of the hour busy without the queue growing (walking, breaks, slack). */
export const BUSY_OK = 0.8;
/** The class line: one point every 15 minutes. */
export const LINE_MS = 15 * 60_000;

export type DEvent = {
  at: number;
  kind: string;
  who?: string;
  by?: string;
  studentId?: string;
  unit?: string;
  value?: string;
  ms?: number;
  took?: number;
};
export type DCall = {
  studentId: string;
  room: string;
  kind: string;
  status: string;
  group: string;
  stage?: string;
  createdAt: number;
  sentAt?: number;
  arrivedAt?: number;
  endedAt?: number;
  teacher?: string;
};
export type DVisit = { studentId: string; inAt: number; outAt?: number };
export type DStudent = { _id: string; stage?: string; demo?: boolean };
export type DStats = Record<string, Record<string, number>> | undefined;

export type StageNums = {
  students: number;
  studentMin: number;
  idleMin: number;
  /** Teacher minutes spent on students of this stage. */
  correction: number;
  evaluation: number;
  theory: number;
  /** Workbook levels corrected, theory-book answers marked. */
  levels: number;
  marks: number;
};
export type PersonDay = {
  name: string;
  /** Where she spent most of her minutes in this class. */
  room: RoomKey;
  min: Record<RoomKey, number>;
  levels: number;
  checks: number;
  marks: number;
  visits: number;
  lessons: number;
  students: number;
  /**
   * Her stay (3 Nov 2026, the teachers' cards; only when the class was read with the team and its arrivals): who she is,
   * her jobs then, arrived / went inside this class, minutes here, free (here, not with a student, nobody called), and
   * free while work waited for her: a student with no work waiting for her job, or (a corrector) papers waiting; the
   * first minutes of each free stretch don't count (a pause between students). A manager's managing isn't measured:
   * no free minutes for her. Old classes don't have these.
   */
  id?: string;
  jobs?: string[];
  inAt?: number;
  outAt?: number;
  hereMin?: number;
  workMin?: number;
  freeMin?: number;
  missedMin?: number;
  /** Levels she corrected: minutes they had waited since handed in, how many. */
  waitMin?: number;
  waits?: number;
  /** Her stay as a bar (only when asked: her card): with students / correcting, free, free while work waited. */
  segs?: TSeg[];
};
/** A part of a teacher's stay: w = working (or a student called to her), f = free, m = free while work waited for her. */
export type TSeg = { s: number; e: number; k: "w" | "f" | "m" };
/** A teacher, for her stay's numbers: her id, name and jobs (the users row). */
export type TeamMember = { id: string; name: string; jobs: readonly string[] };
/** A stay at the centre (the duty table). */
export type DStay = { userId: string; inAt: number; outAt?: number };
/** A pause this long after a student (or a corrected level) is not "free while work waited" yet (the Class tab's yellow). */
export const GRACE_MS = 2 * 60_000;
export const GRACE_COR_MS = 3 * 60_000;
export type Digest = {
  v: 1;
  day: string;
  start: number;
  end: number;
  minutes: number;
  came: number;
  studentMin: number;
  peak: number;
  stages: Record<StageKey, StageNums>;
  rooms: {
    correction: {
      busyMin: number;
      people: number;
      handedIn: number;
      levels: number;
      checks: number;
      marks: number;
      /** Minutes of correcting work on workbook levels / theory-book answers (before overlaps are merged). */
      levelMin: number;
      markMin: number;
      /** Levels whose time was measured (first mark to Save). */
      timed: number;
      got: number;
      max: number;
      /** Handed in during this class → corrected: minutes summed, how many, the longest. */
      waitMin: number;
      waits: number;
      waitMax: number;
    };
    evaluation: { busyMin: number; people: number; visits: number; students: number; qs: number };
    theory: { busyMin: number; people: number; lessons: number; visits: number; students: number; qs: number };
  };
  /** Minutes students were out of work, split by what they waited for (both rooms = half each). */
  idle: Record<RoomKey | "other", number> & { total: number };
  /** Walks to a room that never got there. */
  lost: number;
  people: PersonDay[];
  /** Every 15 minutes: students in class, how many had no work, levels waiting for Correction. */
  line: { t: number; n: number; idle: number; queue: number }[];
};

const round1 = (x: number) => Math.round(x * 10) / 10;
const MIN = 60_000;

function emptyStage(): StageNums {
  return { students: 0, studentMin: 0, idleMin: 0, correction: 0, evaluation: 0, theory: 0, levels: 0, marks: 0 };
}

export function emptyDigest(start: number, end: number): Digest {
  return {
    v: 1,
    day: slDay(start),
    start,
    end,
    minutes: Math.max(0, Math.round((end - start) / MIN)),
    came: 0,
    studentMin: 0,
    peak: 0,
    stages: { fighter: emptyStage(), master: emptyStage(), other: emptyStage() },
    rooms: {
      correction: { busyMin: 0, people: 0, handedIn: 0, levels: 0, checks: 0, marks: 0, levelMin: 0, markMin: 0, timed: 0, got: 0, max: 0, waitMin: 0, waits: 0, waitMax: 0 },
      evaluation: { busyMin: 0, people: 0, visits: 0, students: 0, qs: 0 },
      theory: { busyMin: 0, people: 0, lessons: 0, visits: 0, students: 0, qs: 0 },
    },
    idle: { total: 0, correction: 0, evaluation: 0, theory: 0, other: 0 },
    lost: 0,
    people: [],
    line: [],
  };
}

export type Span = { s: number; e: number; id: string };

/**
 * One person's minutes from spans that may overlap: the union (she is busy once), split evenly among whoever she was
 * serving at each moment. Spans of the same student that overlap count him once.
 */
export function shareOut(spans: Span[]): { total: number; per: Map<string, number> } {
  const per = new Map<string, number>();
  const marks: { t: number; d: 1 | -1; id: string }[] = [];
  for (const x of spans) {
    if (!(x.e > x.s)) continue;
    marks.push({ t: x.s, d: 1, id: x.id }, { t: x.e, d: -1, id: x.id });
  }
  marks.sort((a, b) => a.t - b.t || a.d - b.d);
  const active = new Map<string, number>();
  let total = 0;
  let last = marks.length ? marks[0].t : 0;
  for (const m of marks) {
    const dt = m.t - last;
    if (dt > 0 && active.size > 0) {
      total += dt;
      const each = dt / active.size;
      for (const id of active.keys()) per.set(id, (per.get(id) ?? 0) + each);
    }
    last = m.t;
    const n = (active.get(m.id) ?? 0) + m.d;
    if (n > 0) active.set(m.id, n);
    else active.delete(m.id);
  }
  return { total, per };
}

// ---- stretches of time: [from, to) pairs, sorted and joined

export type Iv = [number, number];

/** Sorted, overlaps joined, empty ones gone. */
export function joinIv(xs: readonly Iv[]): Iv[] {
  const ys = xs.filter(([a, b]) => b > a).sort((p, q) => p[0] - q[0]);
  const out: Iv[] = [];
  for (const [a, b] of ys) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** What of `a` is not in `b`. */
export function minusIv(a: readonly Iv[], b: readonly Iv[]): Iv[] {
  const bs = joinIv(b);
  const out: Iv[] = [];
  for (const [s0, e] of joinIv(a)) {
    let s = s0;
    for (const [bs0, be] of bs) {
      if (be <= s || bs0 >= e) continue;
      if (bs0 > s) out.push([s, bs0]);
      s = Math.max(s, be);
      if (s >= e) break;
    }
    if (s < e) out.push([s, e]);
  }
  return out;
}

/** What is in both. */
export function bothIv(a: readonly Iv[], b: readonly Iv[]): Iv[] {
  const as = joinIv(a);
  const bs = joinIv(b);
  const out: Iv[] = [];
  let i = 0;
  let j = 0;
  while (i < as.length && j < bs.length) {
    const s = Math.max(as[i][0], bs[j][0]);
    const e = Math.min(as[i][1], bs[j][1]);
    if (e > s) out.push([s, e]);
    if (as[i][1] < bs[j][1]) i++;
    else j++;
  }
  return out;
}

export const lengthIv = (xs: readonly Iv[]) => xs.reduce((a, [s, e]) => a + (e - s), 0);

function stageKey(s: string | undefined): StageKey {
  return s === "fighter" ? "fighter" : s === "master" ? "master" : "other";
}

const levelKey = (e: DEvent) => `${e.studentId}:${e.unit}:${(e.value ?? "").split(" ")[0]}`;

/**
 * One class, from its history: who came and for how long, the minutes each person worked and on whom, the work done,
 * the waits and the idle minutes. `end` = when it ended (or now, for the class going on).
 */
export function digestOf(input: {
  start: number;
  end: number;
  events: DEvent[];
  calls: DCall[];
  visits: DVisit[];
  students: DStudent[];
  stats?: DStats;
  /** The teachers and their stays (3 Nov 2026): each one's here / free / free while work waited. */
  team?: readonly TeamMember[];
  stays?: readonly DStay[];
  /** Also each teacher's stay as a bar (her card). */
  segs?: boolean;
}): Digest {
  const { start, end } = input;
  const d = emptyDigest(start, end);
  const demo = new Set(input.students.filter((s) => s.demo).map((s) => s._id));
  const real = (id: string | undefined): id is string => !!id && !demo.has(id);
  const events = input.events.filter((e) => real(e.studentId) || !e.studentId).sort((a, b) => a.at - b.at);
  const calls = input.calls.filter((c) => real(c.studentId));
  const visits = input.visits.filter((v) => real(v.studentId));

  // Each student's stage in this class: what he worked on (theory-book answers = Fighter, workbook levels = Master),
  // else his stage now.
  const stageNow = new Map(input.students.map((s) => [s._id, stageKey(s.stage)]));
  const worked = new Map<string, StageKey>();
  for (const e of events) {
    if (!e.studentId || worked.has(e.studentId)) continue;
    if (e.kind === "mark" && (e.value === "right" || e.value === "wrong" || e.value === "slip")) worked.set(e.studentId, "fighter");
    else if (e.kind.startsWith("level-")) worked.set(e.studentId, "master");
  }
  const stageOf = (id: string): StageKey => worked.get(id) ?? stageNow.get(id) ?? "other";

  // ---- who came, for how long, how many at once
  const inClass = new Map<string, number>();
  const edges: { t: number; d: number }[] = [];
  for (const v of visits) {
    const s = Math.max(v.inAt, start);
    const e = Math.min(v.outAt ?? end, end);
    if (!(e > s)) continue;
    inClass.set(v.studentId, (inClass.get(v.studentId) ?? 0) + (e - s));
    edges.push({ t: s, d: 1 }, { t: e, d: -1 });
  }
  edges.sort((a, b) => a.t - b.t || a.d - b.d);
  let now = 0;
  for (const x of edges) {
    now += x.d;
    d.peak = Math.max(d.peak, now);
  }
  d.came = inClass.size;
  for (const [id, ms] of inClass) {
    const st = d.stages[stageOf(id)];
    st.students++;
    st.studentMin += ms / MIN;
    d.studentMin += ms / MIN;
  }

  // ---- idle: out of work, by what he waited for
  const idleSpans: Span[] = [];
  // (Each wait with what it was for: the teachers' "free while a student waited for her".)
  const idleWhy: { id: string; s: number; e: number; why: RoomKey[] }[] = [];
  for (const e of events) {
    if (e.kind !== "idle" || !e.ms || !e.studentId) continue;
    const s = Math.max(e.at - e.ms, start);
    const t = Math.min(e.at, end);
    if (!(t > s)) continue;
    const min = (t - s) / MIN;
    idleSpans.push({ s, e: t, id: e.studentId });
    d.idle.total += min;
    d.stages[stageOf(e.studentId)].idleMin += min;
    const why = (e.value ?? "").split("+").filter((r): r is RoomKey => (ROOMS as readonly string[]).includes(r));
    idleWhy.push({ id: e.studentId, s, e: t, why });
    if (!why.length) d.idle.other += min;
    for (const r of why) d.idle[r] += min / why.length;
  }

  // ---- Correction: levels handed in, corrected (timed), checked; theory-book answers; waits
  const cor = d.rooms.correction;
  const queue: Span[] = [];
  const handed = new Map<string, number>();
  const people = new Map<string, { spans: Record<RoomKey, Span[]>; p: PersonDay }>();
  const person = (name: string) => {
    let x = people.get(name);
    if (!x) {
      x = {
        spans: { correction: [], evaluation: [], theory: [] },
        p: { name, room: "correction", min: { correction: 0, evaluation: 0, theory: 0 }, levels: 0, checks: 0, marks: 0, visits: 0, lessons: 0, students: 0 },
      };
      people.set(name, x);
    }
    return x;
  };
  const lastMark = new Map<string, number>();
  // Her last tap at the board: when, where its span starts (one tap = one event per student, all at that moment), the unit.
  const lastBoard = new Map<string, { at: number; s: number; unit?: string }>();
  for (const e of events) {
    if (!e.studentId) continue;
    // A tap at his desk on the Fighter or Master page (8 Nov 2026, convex/desk.ts) is her work as at the board.
    if (e.kind === "board" || e.kind === "desk") {
      const room: RoomKey = e.by === "evaluation" ? "evaluation" : "theory";
      const name = e.who ?? (room === "theory" ? "Theory" : "Evaluation");
      const x = person(name);
      let tap = lastBoard.get(name);
      if (!tap || tap.at !== e.at) {
        const run = !!tap && e.at - tap.at <= BOARD_MAX_MS && tap.unit === e.unit;
        tap = { at: e.at, s: e.at - (run ? e.at - tap!.at : BOARD_FIRST_MS), unit: e.unit };
        lastBoard.set(name, tap);
        if (!run && room === "theory") {
          d.rooms.theory.lessons++;
          x.p.lessons++;
        }
      }
      x.spans[room].push({ s: tap.s, e: e.at, id: e.studentId });
      if (room === "evaluation") d.rooms.evaluation.qs++;
      continue;
    }
    if (e.kind === "board-undo" || e.kind === "desk-undo") {
      if (e.by === "evaluation") d.rooms.evaluation.qs = Math.max(0, d.rooms.evaluation.qs - 1);
      continue;
    }
    const who = e.who ?? "Correction";
    if (e.kind === "level-done") {
      cor.handedIn++;
      handed.set(levelKey(e), e.at);
    } else if (e.kind === "level-undo") {
      cor.handedIn = Math.max(0, cor.handedIn - 1);
      const k = levelKey(e);
      const from = handed.get(k);
      if (from !== undefined) queue.push({ s: from, e: e.at, id: k });
      handed.delete(k);
    } else if (e.kind === "level-marks") {
      const ms = e.took !== undefined ? Math.min(e.took, LEVEL_MAX_MS) : LEVEL_MS;
      if (e.took !== undefined) cor.timed++;
      cor.levels++;
      cor.levelMin += ms / MIN;
      d.stages[stageOf(e.studentId)].levels++;
      const m = /^[^ ]+ (\d+)\/(\d+)/.exec(e.value ?? "");
      if (m) {
        cor.got += Number(m[1]);
        cor.max += Number(m[2]);
      }
      if (e.ms !== undefined && e.at - e.ms >= start) {
        cor.waitMin += e.ms / MIN;
        cor.waits++;
        cor.waitMax = Math.max(cor.waitMax, e.ms / MIN);
      }
      const k = levelKey(e);
      const from = handed.get(k) ?? (e.ms ? e.at - e.ms : undefined);
      if (from !== undefined && from < e.at) queue.push({ s: Math.max(from, start), e: e.at, id: k });
      handed.delete(k);
      const x = person(who);
      if (e.ms !== undefined && e.at - e.ms >= start) {
        x.p.waitMin = (x.p.waitMin ?? 0) + e.ms / MIN;
        x.p.waits = (x.p.waits ?? 0) + 1;
      }
      x.p.levels++;
      x.spans.correction.push({ s: e.at - ms, e: e.at, id: e.studentId });
      lastMark.set(who, e.at);
    } else if (e.kind === "level-checked" || e.kind === "level-remarks") {
      cor.checks++;
      const x = person(who);
      x.p.checks++;
      x.spans.correction.push({ s: e.at - CHECK_MS, e: e.at, id: e.studentId });
      lastMark.set(who, e.at);
    } else if (e.kind === "mark" && (e.value === "right" || e.value === "wrong" || e.value === "slip")) {
      const prev = lastMark.get(who);
      const ms = prev === undefined || e.at - prev > MARK_MAX_MS ? MARK_FIRST_MS : e.at - prev;
      cor.marks++;
      cor.markMin += ms / MIN;
      d.stages[stageOf(e.studentId)].marks++;
      const x = person(who);
      x.p.marks++;
      x.spans.correction.push({ s: e.at - ms, e: e.at, id: e.studentId });
      lastMark.set(who, e.at);
    } else if (e.kind === "explained") {
      d.rooms.evaluation.qs += Number(e.value ?? 0) || 0;
    } else if (e.kind === "not-reached") {
      d.lost++;
    }
  }
  for (const [k, from] of handed) queue.push({ s: Math.max(from, start), e: end, id: k });

  // ---- Evaluation and Theory: every call finished in the room (not the ones the class's end closed)
  const doneWho = new Map<string, string>();
  for (const e of events) {
    if ((e.kind === "done-theory" || e.kind === "done-evaluation") && e.studentId && e.who) doneWho.set(`${e.studentId}:${e.at}`, e.who);
  }
  const groups = new Set<string>();
  const served: Record<"evaluation" | "theory", Set<string>> = { evaluation: new Set(), theory: new Set() };
  for (const c of calls) {
    if (c.status !== "done" || c.endedAt === undefined) continue;
    const work: RoomKey = c.kind === "theory" ? "theory" : "evaluation";
    const name = c.teacher ?? doneWho.get(`${c.studentId}:${c.endedAt}`);
    // The class's end closed it (nobody tapped Done): not a visit.
    if (!name && c.endedAt >= end - 1_000 && !doneWho.has(`${c.studentId}:${c.endedAt}`)) continue;
    const from = c.arrivedAt ?? c.sentAt ?? c.createdAt;
    const s = Math.max(from, c.endedAt - VISIT_MAX_MS);
    if (!(c.endedAt > s)) continue;
    const x = person(name ?? (work === "theory" ? "Theory" : "Evaluation"));
    x.spans[work].push({ s, e: c.endedAt, id: c.studentId });
    x.p.visits++;
    d.rooms[work].visits++;
    served[work].add(c.studentId);
    if (work === "theory" && !groups.has(c.group)) {
      groups.add(c.group);
      d.rooms.theory.lessons++;
      x.p.lessons++;
    }
  }
  d.rooms.evaluation.students = served.evaluation.size;
  d.rooms.theory.students = served.theory.size;
  d.rooms.theory.qs = input.stats?.theory?.qs ?? 0;

  // ---- each person's minutes: busy once, shared among the students she served at the same time
  for (const { spans, p } of people.values()) {
    const seen = new Set<string>();
    for (const r of ROOMS) {
      const { total, per } = shareOut(spans[r]);
      p.min[r] = round1(total / MIN);
      d.rooms[r].busyMin += total / MIN;
      for (const [id, ms] of per) {
        d.stages[stageOf(id)][r] += ms / MIN;
        seen.add(`${r}:${id}`);
      }
    }
    p.students = new Set([...seen].map((k) => k.split(":")[1])).size;
    p.room = ROOMS.reduce((a, r) => (p.min[r] > p.min[a] ? r : a), ROOMS[0]);
    if (p.min[p.room] > 0) d.rooms[p.room].people++;
    if (p.waitMin !== undefined) p.waitMin = round1(p.waitMin);
    d.people.push(p);
  }

  // ---- each teacher's stay (3 Nov 2026, her card): here, working, free, free while work waited for her
  if (input.team && input.stays) {
    // A student called by anyone is taken: he waits for nobody else meanwhile.
    const calledOf = new Map<string, Iv[]>();
    for (const c of calls) {
      const e = Math.min(c.endedAt ?? end, end, c.createdAt + VISIT_MAX_MS);
      (calledOf.get(c.studentId) ?? calledOf.set(c.studentId, []).get(c.studentId)!).push([c.createdAt, e]);
    }
    const waitsFor = (job: RoomKey): Iv[] => {
      const his = new Map<string, Iv[]>();
      for (const w of idleWhy) if (w.why.includes(job)) (his.get(w.id) ?? his.set(w.id, []).get(w.id)!).push([w.s, w.e]);
      const out: Iv[] = [];
      for (const [id, xs] of his) out.push(...minusIv(xs, calledOf.get(id) ?? []));
      return joinIv(out);
    };
    const waiting: Record<RoomKey, Iv[]> = {
      theory: waitsFor("theory"),
      evaluation: waitsFor("evaluation"),
      // A corrector's work waits as papers handed in, and as students with no work until she marks.
      correction: joinIv([...waitsFor("correction"), ...queue.map((q): Iv => [q.s, q.e])]),
    };
    const byName = new Map(d.people.map((p) => [p.name, p]));
    for (const t of input.team) {
      const stay = joinIv(
        input.stays.filter((x) => x.userId === t.id).map((x): Iv => [Math.max(x.inAt, start), Math.min(x.outAt ?? end, end)]),
      );
      let p = byName.get(t.name);
      if (!stay.length && !p) continue; // not here in this class, nothing done
      const roomJobs = t.jobs.filter((j): j is RoomKey => j === "theory" || j === "evaluation");
      if (!p) {
        p = {
          name: t.name,
          room: roomJobs.includes("evaluation") ? "evaluation" : (roomJobs[0] ?? "correction"),
          min: { correction: 0, evaluation: 0, theory: 0 },
          levels: 0,
          checks: 0,
          marks: 0,
          visits: 0,
          lessons: 0,
          students: 0,
        };
        d.people.push(p);
        byName.set(t.name, p);
      }
      p.id = t.id;
      p.jobs = [...t.jobs];
      // Worked but nobody marked her here: no stay numbers (her card says so).
      if (!stay.length) continue;
      const spans = people.get(t.name)?.spans;
      const work: Iv[] = spans ? ROOMS.flatMap((r) => spans[r].map((x): Iv => [x.s, x.e])) : [];
      let busy: Iv[];
      let grace: number;
      let waits: Iv[];
      if (roomJobs.length) {
        // A student called to her, on his way or with her: she is not free.
        const mine: Iv[] = calls
          .filter((c) => c.teacher === t.name)
          .map((c): Iv => [c.createdAt, Math.min(c.endedAt ?? end, end, c.createdAt + VISIT_MAX_MS)]);
        busy = joinIv([...work, ...mine]);
        grace = GRACE_MS;
        waits = joinIv(roomJobs.flatMap((j) => waiting[j]));
      } else {
        // A corrector: the walk to the next paper is work; free = no paper corrected for over 3 minutes.
        busy = joinIv(work.map(([s, e]): Iv => [s, e + GRACE_COR_MS]));
        grace = 0;
        waits = t.jobs.includes("correction") ? waiting.correction : [];
      }
      const here = lengthIv(stay);
      const inStay = bothIv(busy, stay);
      p.inAt = stay[0][0];
      const last = stay[stay.length - 1][1];
      p.outAt = last < end - 1_000 ? last : undefined;
      p.hereMin = round1(here / MIN);
      p.workMin = round1(lengthIv(inStay) / MIN);
      // A manager's managing isn't measured: her free minutes would be her managing.
      if (t.jobs.includes("manager")) continue;
      const free = minusIv(stay, busy);
      const open = free.map(([s, e]): Iv => [s + grace, e]).filter(([s, e]) => e > s);
      const missed = bothIv(open, waits);
      p.freeMin = round1(lengthIv(free) / MIN);
      p.missedMin = round1(lengthIv(missed) / MIN);
      if (input.segs) {
        const segs: TSeg[] = [
          ...inStay.map(([s, e]): TSeg => ({ s, e, k: "w" })),
          ...missed.map(([s, e]): TSeg => ({ s, e, k: "m" })),
          ...minusIv(free, missed).map(([s, e]): TSeg => ({ s, e, k: "f" })),
        ];
        p.segs = segs.sort((a, b) => a.s - b.s);
      }
    }
  }
  d.people.sort((a, b) => ROOMS.indexOf(a.room) - ROOMS.indexOf(b.room) || b.min[b.room] - a.min[a.room]);

  // ---- the class line, every 15 minutes
  const covering = (spans: Span[], t: number) => new Set(spans.filter((x) => x.s <= t && t < x.e).map((x) => x.id)).size;
  const visitSpans: Span[] = visits.map((v) => ({ s: Math.max(v.inAt, start), e: Math.min(v.outAt ?? end, end), id: v.studentId }));
  if (end > start) {
    const ts: number[] = [];
    for (let t = start + LINE_MS; t < end && ts.length < 48; t += LINE_MS) ts.push(t);
    ts.push(end - 1);
    d.line = ts.map((t) => ({ t, n: covering(visitSpans, t), idle: covering(idleSpans, t), queue: covering(queue, t) }));
  }

  // Tidy: one decimal is plenty.
  d.studentMin = round1(d.studentMin);
  for (const k of STAGE_KEYS) {
    const st = d.stages[k];
    for (const f of ["studentMin", "idleMin", "correction", "evaluation", "theory"] as const) st[f] = round1(st[f]);
  }
  for (const r of ROOMS) d.rooms[r].busyMin = round1(d.rooms[r].busyMin);
  for (const f of ["levelMin", "markMin", "waitMin", "waitMax"] as const) cor[f] = round1(cor[f]);
  for (const k of ["total", ...ROOMS, "other"] as const) d.idle[k] = round1(d.idle[k]);
  return d;
}

// ---------------------------------------------------------------- many classes: what the team can carry

/** Several classes as one (a day with two classes, or every class of the window). People: the most in one class. */
export function sumDigests(ds: Digest[]): Digest | null {
  if (!ds.length) return null;
  const out = emptyDigest(Math.min(...ds.map((x) => x.start)), Math.max(...ds.map((x) => x.end)));
  out.minutes = ds.reduce((a, x) => a + x.minutes, 0);
  const add = <T extends Record<string, number>>(a: T, b: T) => {
    for (const k of Object.keys(b) as (keyof T)[]) (a[k] as number) += b[k] as number;
  };
  for (const x of ds) {
    out.came += x.came;
    out.studentMin += x.studentMin;
    out.peak = Math.max(out.peak, x.peak);
    for (const k of STAGE_KEYS) add(out.stages[k], x.stages[k]);
    for (const r of ROOMS) {
      const people = Math.max(out.rooms[r].people, x.rooms[r].people);
      const max = r === "correction" ? Math.max(out.rooms.correction.waitMax, x.rooms.correction.waitMax) : 0;
      add(out.rooms[r] as unknown as Record<string, number>, x.rooms[r] as unknown as Record<string, number>);
      out.rooms[r].people = people;
      if (r === "correction") out.rooms.correction.waitMax = max;
    }
    add(out.idle, x.idle);
    out.lost += x.lost;
    for (const p of x.people) {
      const same = out.people.find((q) => q.name === p.name);
      if (!same) {
        out.people.push({ ...p, min: { ...p.min } });
        continue;
      }
      for (const r of ROOMS) same.min[r] = round1(same.min[r] + p.min[r]);
      for (const f of ["levels", "checks", "marks", "visits", "lessons", "students"] as const) same[f] += p[f];
      // Her stays (only classes read with them): summed where both have them.
      for (const f of ["hereMin", "workMin", "freeMin", "missedMin", "waitMin", "waits"] as const) {
        if (p[f] === undefined) continue;
        same[f] = round1((same[f] ?? 0) + p[f]);
      }
      same.segs = undefined;
      same.room = ROOMS.reduce((a, r) => (same.min[r] > same.min[a] ? r : a), ROOMS[0]);
    }
    out.line.push(...x.line);
  }
  // `came` adds up visits: one student in two classes counts twice (the server sends each day's own count).
  out.studentMin = round1(out.studentMin);
  return out;
}

export type Sure = "none" | "early" | "fair" | "good";
export type Load = {
  /** Classes with at least one student-hour. */
  classes: number;
  hours: number;
  classMin: number | null;
  /** Minutes a student stays, on average. */
  stay: number | null;
  /** Students at once on average, and the most. */
  atOnce: number | null;
  peak: number;
  /** Teacher minutes each student-hour needs from this room. */
  need: Record<RoomKey, number | null>;
  /** The people a class usually has in this room (the middle of the classes). */
  people: Record<RoomKey, number>;
  /** Share of their class time they were busy. */
  busy: Record<RoomKey, number | null>;
  /** Idle minutes per student-hour waiting for this room. */
  idleFor: Record<RoomKey, number | null>;
  /** Students at once this room's people carry at 80% busy. */
  cap: Record<RoomKey, number | null>;
  limit: { room: RoomKey; n: number } | null;
  /** Students a day at that limit: at once × class length ÷ stay. */
  perDay: number | null;
  stage: Record<StageKey, { hours: number; need: Record<RoomKey, number | null>; total: number | null; idle: number | null }>;
  /** Correction minutes a workbook level / a theory-book answer; Evaluation minutes a question; Theory minutes a lesson. */
  perLevel: number | null;
  perMark: number | null;
  perQuestion: number | null;
  lesson: number | null;
  /** Idle minutes per student-hour: the centre's headline number. */
  idle: number | null;
  sure: Sure;
};

const per = (min: number, hours: number) => (hours > 0 ? round1(min / hours) : null);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** What the team needs and can carry, from the last classes (newest first or any order). */
export function loadOf(all: Digest[]): Load {
  const ds = all.filter((x) => x.studentMin >= 60 && x.minutes > 0);
  const hours = ds.reduce((a, x) => a + x.studentMin, 0) / 60;
  const minutes = ds.reduce((a, x) => a + x.minutes, 0);
  const came = ds.reduce((a, x) => a + x.came, 0);
  const sum = (f: (x: Digest) => number) => ds.reduce((a, x) => a + f(x), 0);
  const need = {} as Record<RoomKey, number | null>;
  const people = {} as Record<RoomKey, number>;
  const busy = {} as Record<RoomKey, number | null>;
  const idleFor = {} as Record<RoomKey, number | null>;
  const cap = {} as Record<RoomKey, number | null>;
  for (const r of ROOMS) {
    const min = sum((x) => x.rooms[r].busyMin);
    need[r] = min > 0 ? per(min, hours) : null;
    const staffed = ds.filter((x) => x.rooms[r].people > 0);
    people[r] = staffed.length ? Math.max(1, Math.round(median(staffed.map((x) => x.rooms[r].people)))) : min > 0 ? 1 : 0;
    const avail = staffed.reduce((a, x) => a + x.rooms[r].people * x.minutes, 0);
    busy[r] = avail > 0 ? Math.round((sum((x) => x.rooms[r].busyMin) / avail) * 100) / 100 : null;
    idleFor[r] = hours > 0 ? per(sum((x) => x.idle[r]), hours) : null;
    const n = need[r];
    cap[r] = n && n > 0 ? Math.floor((Math.max(1, people[r]) * BUSY_OK * 60) / n) : null;
  }
  let limit: Load["limit"] = null;
  for (const r of ROOMS) {
    const c = cap[r];
    if (c !== null && (limit === null || c < limit.n)) limit = { room: r, n: c };
  }
  const classMin = ds.length ? Math.round(minutes / ds.length) : null;
  const stay = came > 0 ? Math.round(sum((x) => x.studentMin) / came) : null;
  const atOnce = minutes > 0 ? round1(sum((x) => x.studentMin) / minutes) : null;
  const perDay = limit && classMin && stay ? Math.floor(limit.n * Math.max(1, classMin / stay)) : null;
  const stage = {} as Load["stage"];
  for (const k of STAGE_KEYS) {
    const h = sum((x) => x.stages[k].studentMin) / 60;
    const n = {} as Record<RoomKey, number | null>;
    for (const r of ROOMS) n[r] = h > 0 ? per(sum((x) => x.stages[k][r]), h) : null;
    const total = h > 0 ? per(sum((x) => x.stages[k].correction + x.stages[k].evaluation + x.stages[k].theory), h) : null;
    stage[k] = { hours: round1(h), need: n, total, idle: h > 0 ? per(sum((x) => x.stages[k].idleMin), h) : null };
  }
  const cor = (f: keyof Digest["rooms"]["correction"]) => sum((x) => x.rooms.correction[f]);
  const sure: Sure = ds.length === 0 ? "none" : ds.length < 3 || hours < 15 ? "early" : ds.length < 8 ? "fair" : "good";
  return {
    classes: ds.length,
    hours: round1(hours),
    classMin,
    stay,
    atOnce,
    peak: ds.reduce((a, x) => Math.max(a, x.peak), 0),
    need,
    people,
    busy,
    idleFor,
    cap,
    limit,
    perDay,
    stage,
    perLevel: cor("levels") > 0 ? round1(cor("levelMin") / cor("levels")) : null,
    perMark: cor("marks") > 0 ? Math.round((cor("markMin") / cor("marks")) * 60) / 60 : null,
    perQuestion: sum((x) => x.rooms.evaluation.qs) > 0 ? round1(sum((x) => x.rooms.evaluation.busyMin) / sum((x) => x.rooms.evaluation.qs)) : null,
    lesson: sum((x) => x.rooms.theory.lessons) > 0 ? round1(sum((x) => x.rooms.theory.busyMin) / sum((x) => x.rooms.theory.lessons)) : null,
    idle: hours > 0 ? per(sum((x) => x.idle.total), hours) : null,
    sure,
  };
}

export type Verdict = { tone: "red" | "amber" | "green" | "grey"; head: string; why: string };

/** Busy this share or more of the time, or students idle this many minutes an hour for her: she needs help. */
export const OVER_BUSY = 0.85;
export const OVER_IDLE = 6;
export const NEAR_BUSY = 0.65;
export const NEAR_IDLE = 3;

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Does this room need another person? One line to decide, one line of why. */
export function verdictOf(l: Load, r: RoomKey): Verdict {
  const busy = l.busy[r];
  const idle = l.idleFor[r] ?? 0;
  const cap = l.cap[r];
  if (l.need[r] === null && idle === 0) return { tone: "grey", head: "No work measured yet", why: "Nothing was done here in these classes." };
  const why = [
    busy !== null ? `busy ${pct(busy)} of the class` : null,
    idle > 0 ? `students waited ${idle} min an hour for it` : null,
  ]
    .filter(Boolean)
    .join(", ");
  if ((busy ?? 0) >= OVER_BUSY || idle >= OVER_IDLE) return { tone: "red", head: "Needs another person", why };
  if ((busy ?? 0) >= NEAR_BUSY || idle >= NEAR_IDLE) return { tone: "amber", head: "Near the limit", why };
  const room = cap !== null ? cap - l.peak : null;
  if (room !== null && room <= 0) return { tone: "amber", head: "Full at the busiest time", why };
  return { tone: "green", head: room !== null ? `OK: room for ~${room} more at once` : "OK", why };
}

/** The limit with one more person in a room: students at once, and which room stops it next. */
export function withOneMore(l: Load, r: RoomKey): { n: number; next: RoomKey } | null {
  if (!l.limit) return null;
  let best: { n: number; next: RoomKey } | null = null;
  for (const x of ROOMS) {
    const need = l.need[x];
    if (!need) continue;
    const people = Math.max(1, l.people[x]) + (x === r ? 1 : 0);
    const c = Math.floor((people * BUSY_OK * 60) / need);
    if (best === null || c < best.n) best = { n: c, next: x };
  }
  return best;
}

// ---------------------------------------------------------------- money (his three numbers)

export type Money = { fee: number; corrector: number; teacher: number; at?: number };

/** A month in rupees: what the students pay, what the team costs, what a new person costs in students' fees. */
export function moneyOf(
  m: Money | null,
  n: { students: number; coming: number; away: number; people: Record<RoomKey, number> },
) {
  if (!m || !(m.fee > 0)) return null;
  const pay = (r: RoomKey) => (r === "correction" ? m.corrector : m.teacher);
  const payroll = ROOMS.reduce((a, r) => a + n.people[r] * pay(r), 0);
  const income = n.students * m.fee;
  return {
    income,
    coming: n.coming * m.fee,
    atRisk: n.away * m.fee,
    payroll,
    margin: n.coming * m.fee - payroll,
    perStudent: n.coming > 0 ? Math.round(payroll / n.coming) : null,
    /** Students whose fees pay one more person in this room. */
    breakEven: (r: RoomKey) => (pay(r) > 0 ? Math.ceil(pay(r) / m.fee) : 0),
    pay,
  };
}
