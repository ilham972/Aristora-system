// The simulation (1 Nov 2026, his voice note: "upgrade the test feature ... like a simulation ... the correction will
// happen automatically ... easy, medium and hard ... set the students count ... I want to see the performance of each
// teacher in the Owner dashboard"). Made-up students work through the books in the app at a pace and with mistakes that
// depend on the level; the app plays Correction (it marks each workbook level when it is handed in, marks each
// theory-book answer, and sends the students Theory and Evaluation call); the Theory and Evaluation teachers practise on
// their own pages exactly as in a class. Pure functions, shared by the server (convex/sim.ts) and the owner's phone
// (the Owner page's Sim tab).

import { levelOutOf, type Fighter, type MasterData, type MasterLevel } from "./book";
import { digestOf, ROOMS, type DCall, type DEvent, type Digest, type DVisit, type RoomKey } from "./boss";
import type { MQ, MState } from "./master";
import { AMBER_AT, type Mark } from "./status";

const MIN = 60_000;

export type SimLevel = "easy" | "medium" | "hard";
export const SIM_LEVELS: readonly SimLevel[] = ["easy", "medium", "hard"];
/** The student counts and lengths offered (Settings → Students). */
export const SIM_COUNTS = [5, 10, 15, 20, 25, 30] as const;
export const SIM_MINUTES = [20, 30, 45, 60] as const;
/** Students in one simulation at most, "+5" included (every phone in it loads them all). */
export const SIM_MAX = 40;
/** The app takes a step every few seconds: students work, hand in, the app corrects and sends. */
export const TICK_MS = 5_000;
/** One reading of the class a minute (the Owner page's minute-by-minute bars). */
export const SAMPLE_MS = 60_000;
/** Readings kept (two hours). */
export const SAMPLES_MAX = 120;
/** No step for this long: a phone that sees it starts the steps again. */
export const STALE_TICK_MS = 30_000;
/** Who the app's Correction is in the history and on the Owner page. */
export const ROBOT = "Simulation";
/** Sent and not marked Arrived for this long: the app (as Correction would) says he reached the room. */
export const REACHED_MS = 3 * MIN;
/** The pages' home time: arrival + 2 hours (the Theory and Evaluation pages never tick someone leaving soon). */
export const HOME_AFTER_MS = 2 * 60 * MIN;

/** What a level means: the students' pace and mistakes, how spread they are, how fast the app plays Correction. */
export type Plan = {
  name: string;
  words: string;
  /** Share of theory-book (Fighter) students, when the app has a theory book. */
  fighter: number;
  /** Grades and books of each grade the students are spread over. */
  grades: number;
  units: number;
  /** Minutes a workbook level takes, and a theory-book question (× the student's own speed). */
  levelMin: [number, number];
  questionMin: [number, number];
  /** Share of questions that lose marks (× the student's own care); of those, the share he couldn't start ("?"). */
  loss: number;
  dk: number;
  /** Share of workbook students one or two levels from the end of their unit (they run out of work soon). */
  nearEnd: number;
  /** Share starting with lost marks or wrong answers already waiting for Evaluation. */
  waiting: number;
  /** Share arriving during the first 10 minutes, and share going home before the end. */
  late: number;
  leave: number;
  /** Seconds before the app sends a called student, and before it corrects a level handed in. */
  sendSec: [number, number];
  correctSec: [number, number];
};

export const PLANS: Record<SimLevel, Plan> = {
  easy: {
    name: "Easy",
    words: "Workbooks only, 2 grades. A level every 9–14 min; 1 question in 10 loses marks.",
    fighter: 0,
    grades: 2,
    units: 2,
    levelMin: [9, 14],
    questionMin: [3, 5],
    loss: 0.1,
    dk: 0.04,
    nearEnd: 0.2,
    waiting: 0.2,
    late: 0,
    leave: 0,
    sendSec: [8, 15],
    correctSec: [30, 60],
  },
  medium: {
    name: "Medium",
    words: "Some theory books, 3 grades. A level every 6–10 min; 1 in 5 loses marks; a few come late.",
    fighter: 0.25,
    grades: 3,
    units: 3,
    levelMin: [6, 10],
    questionMin: [2, 3.5],
    loss: 0.2,
    dk: 0.08,
    nearEnd: 0.35,
    waiting: 0.4,
    late: 0.2,
    leave: 0.1,
    sendSec: [10, 20],
    correctSec: [30, 75],
  },
  hard: {
    name: "Hard",
    words: "Theory books and workbooks, every grade. A level every 4–7 min; 1 in 3 loses marks; students come and go.",
    fighter: 0.4,
    grades: 6,
    units: 4,
    levelMin: [4, 7],
    questionMin: [1.2, 2.5],
    loss: 0.3,
    dk: 0.14,
    nearEnd: 0.5,
    waiting: 0.6,
    late: 0.35,
    leave: 0.15,
    sendSec: [12, 25],
    correctSec: [45, 90],
  },
};

// ---------------------------------------------------------------- chance, the same every time for the same seed

/** A random number generator from a seed (mulberry32): the same seed gives the same simulation. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from words and numbers (FNV-1a): seeds that differ per student, per call, per level. */
export function hashOf(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  const s = parts.join("|");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const between = (r: () => number, [a, b]: readonly [number, number]) => a + (b - a) * r();

export function shuffle<T>(r: () => number, xs: readonly T[]): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

// ---------------------------------------------------------------- the students

/** Made-up first names (first name and initial only, as for real students). */
const FIRST = [
  "Ahamed", "Fathima", "Kumar", "Nila", "Rizwan", "Sana", "Tharun", "Yasmin", "Dilan", "Keerthi", "Malik", "Priya",
  "Vimal", "Zainab", "Arun", "Banu", "Harini", "Imran", "Janani", "Kavin", "Lakshan", "Mehra", "Nadeem", "Oviya",
  "Pranav", "Rahma", "Sajith", "Thanuja", "Usman", "Vithya", "Wasim", "Yazeer", "Aathi", "Ishak", "Mathu", "Rifka",
  "Sharmi", "Thilak", "Nushra", "Kishan", "Afra", "Bilal", "Divya", "Faiz", "Gowri", "Hana", "Jeevan", "Kamal",
];
const INITIALS = "ABDFHJKMNPRSTVY";

/** n different names ("Kavin R"), none of them already taken. */
export function simNames(seed: number, n: number, taken: ReadonlySet<string> = new Set()): string[] {
  const r = rng(hashOf("names", seed));
  const firsts = shuffle(r, FIRST);
  const used = new Set([...taken].map((x) => x.toLowerCase()));
  const out: string[] = [];
  for (let i = 0; out.length < n && i < firsts.length * INITIALS.length * 3; i++) {
    const name = `${firsts[i % firsts.length]} ${INITIALS[Math.floor(r() * INITIALS.length)]}`;
    if (used.has(name.toLowerCase())) continue;
    used.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

/** A book the simulation can put students on. */
export type SimBook = {
  unitId: string;
  stage: "fighter" | "master";
  /** The grade of a student on it (an OL book: Grade 11). */
  grade: number;
  term: number;
  order: number;
  code: string;
  /** A workbook's levels. */
  levels?: MasterLevel[];
  /** A theory book: how many of its ladder sections Theory teaches (they have teacher questions). */
  teach?: number;
  /** A theory book: its ladder questions he does alone. */
  solo?: number;
};

export function usableBook(b: SimBook): boolean {
  return b.stage === "master" ? (b.levels?.length ?? 0) >= 2 : (b.teach ?? 0) >= 1 && (b.solo ?? 0) >= 3;
}

/** One made-up student, where he starts and how he works. */
export type KidPlan = {
  name: string;
  book: SimBook;
  /** × the level's pace (0.75 = quick, 1.3 = slow) and × its mistakes (0.6 = careful, 1.5 = careless). */
  speed: number;
  care: number;
  /** Minutes after the start he arrives (0 = in from the start), and goes home (none = stays to the end). */
  inMin: number;
  outMin?: number;
  /** Workbook: the level he is on. Theory book: which of the sections Theory teaches is next (0 = the first). */
  at: number;
  /** Starts with lost marks (workbook) or wrong answers (theory book) waiting for Evaluation. */
  waiting: boolean;
  /** Theory book: everything before that section done: he needs Theory now. */
  ready: boolean;
};

/**
 * The students of a simulation: spread over the grades with the most books (as many grades and books as the level
 * says), going round those books so each has someone before any has two; theory-book students as the level says
 * when the app has a theory book. The same seed gives the same students.
 */
export function planSim(books: SimBook[], level: SimLevel, count: number, seed: number, minutes: number, taken: ReadonlySet<string> = new Set()): KidPlan[] {
  const P = PLANS[level];
  const r = rng(seed);
  const masters = books.filter((b) => b.stage === "master" && usableBook(b));
  const fighters = books.filter((b) => b.stage === "fighter" && usableBook(b));
  if (!masters.length && !fighters.length) return [];
  let nf = fighters.length ? Math.round(count * P.fighter) : 0;
  if (!masters.length) nf = count;
  const nm = count - nf;
  const slots = (list: SimBook[], n: number): SimBook[] => {
    if (n <= 0 || !list.length) return [];
    const byGrade = new Map<number, SimBook[]>();
    for (const b of list) byGrade.set(b.grade, [...(byGrade.get(b.grade) ?? []), b]);
    const grades = shuffle(r, [...byGrade.keys()])
      .sort((a, b) => byGrade.get(b)!.length - byGrade.get(a)!.length)
      .slice(0, P.grades);
    const chosen = shuffle(
      r,
      grades.flatMap((g) => shuffle(r, byGrade.get(g)!).slice(0, P.units)),
    );
    return Array.from({ length: n }, (_, i) => chosen[i % chosen.length]);
  };
  const assigned = shuffle(r, [...slots(masters, nm), ...slots(fighters, nf)]);
  const names = simNames(seed, assigned.length, taken);
  return assigned.slice(0, names.length).map((book, i) => kidPlan(book, names[i], P, r, minutes));
}

function kidPlan(book: SimBook, name: string, P: Plan, r: () => number, minutes: number): KidPlan {
  const speed = round2(between(r, [0.75, 1.3]));
  const care = round2(between(r, [0.6, 1.5]));
  const inMin = r() < P.late ? Math.round(between(r, [1, 10])) : 0;
  let outMin: number | undefined;
  if (r() < P.leave) {
    const m = Math.round(minutes * between(r, [0.5, 0.85]));
    if (m >= inMin + 8) outMin = m;
  }
  let at = 0;
  let ready = false;
  if (book.stage === "master") {
    const levels = book.levels ?? [];
    const n = levels.length;
    const idx = r() < P.nearEnd ? Math.max(0, n - 1 - Math.floor(r() * 2)) : Math.floor(r() * Math.max(1, n - 2));
    at = levels[Math.min(idx, n - 1)]?.n ?? 1;
  } else {
    at = Math.floor(r() * Math.max(1, book.teach ?? 1));
    ready = at === 0 || r() < 0.45;
  }
  const waiting = r() < P.waiting;
  return { name, book, speed, care, inMin, outMin, at, waiting, ready };
}

/** A book's hard questions: many students lose them (the same mistake by many, as in a class). */
export function trapsOf(questions: number[], seed: number): number[] {
  if (!questions.length) return [];
  const r = rng(seed);
  const n = Math.min(3, Math.max(1, Math.floor(questions.length / 15)));
  return shuffle(r, questions)
    .slice(0, n)
    .sort((a, b) => a - b);
}

/** Every question of a workbook (by its levels), or a theory book's ladder questions done alone. */
export function questionsOf(book: MasterData | Fighter): number[] {
  if ("kind" in book && book.kind === "master") return book.levels.flatMap((l) => range(l.from, l.to));
  return (book as Fighter).ladder.flatMap((s) => s.solo);
}

const range = (a: number, b: number) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);

/** The share of questions a student loses at this level (his care × the level's; a hard question three times more). */
export function lossOf(P: Plan, care: number, trap: boolean): number {
  const p = Math.min(0.85, P.loss * care);
  return trap ? Math.min(0.85, p * 3 + 0.15) : p;
}

/**
 * One level's marks, as the app's Correction gives them: each question full marks or lost marks (less than full, at
 * random); of the lost ones, some "?" (he couldn't start it: 0 marks, straight to Theory, as `workbook.correct` does).
 * A workbook without each question's marks: which questions lost marks and the level's total.
 */
export function markLevel(
  book: MasterData,
  l: MasterLevel,
  P: Plan,
  care: number,
  r: () => number,
  traps: readonly number[],
  at: number,
): { rows: Record<string, MQ>; got: number } {
  const each = levelOutOf(book, l);
  const rows: Record<string, MQ> = {};
  let got = 0;
  let lostN = 0;
  const count = l.to - l.from + 1;
  for (let q = l.from; q <= l.to; q++) {
    const lost = r() < lossOf(P, care, traps.includes(q));
    if (!each) {
      rows[String(q)] = { lost, t: at };
      if (lost) lostN++;
      continue;
    }
    const max = each[q - l.from];
    if (!lost || max <= 0) {
      rows[String(q)] = { got: max, max, lost: false, t: at };
      got += max;
      continue;
    }
    if (r() < P.dk) {
      rows[String(q)] = { got: 0, max, lost: true, t: at, dk: true, th: at, tb: "correction" };
      continue;
    }
    const g = Math.floor(r() * max);
    rows[String(q)] = { got: g, max, lost: true, t: at };
    got += g;
  }
  if (!each) got = lostN === 0 ? l.max : Math.max(0, Math.min(l.max - 1, Math.round(l.max * (1 - lostN / count))));
  return { rows, got };
}

/**
 * A workbook student's book as the simulation starts: the levels before his were done; the last one or two corrected
 * a few minutes ago by the app, with their lost marks waiting for Evaluation (and "?"s for Theory) when he starts with
 * work waiting, else already explained and taught; the earlier ones done on paper before the app.
 */
export function masterStart(book: MasterData, k: KidPlan, P: Plan, now: number, r: () => number, traps: readonly number[]): MState {
  const m: MState = { q: {}, lv: {} };
  const idx = Math.max(0, book.levels.findIndex((l) => l.n === k.at));
  const before = book.levels.slice(0, idx);
  const recent = before.slice(before.length - Math.min(before.length, 1 + Math.floor(r() * 2)));
  for (const l of before) if (!recent.includes(l)) m.lv[String(l.n)] = { pre: now - 90 * MIN };
  recent.forEach((l, i) => {
    const fixedAt = now - Math.round(between(r, [4, 25]) * MIN) - (recent.length - 1 - i) * 6 * MIN;
    const { rows, got } = markLevel(book, l, P, k.care, r, traps, fixedAt);
    for (const [q, row] of Object.entries(rows)) {
      m.q[q] = !k.waiting && row.lost ? (row.th ? { ...row, tt: fixedAt + 3 * MIN } : { ...row, x: fixedAt + 3 * MIN }) : row;
    }
    m.lv[String(l.n)] = { done: fixedAt - 2 * MIN, fixed: fixedAt, by: "correction", got };
  });
  return m;
}

/**
 * A theory-book student's circles as the simulation starts: Theory taught the ladder sections before his next one (k.at
 * of those Theory teaches); he did their questions, one or two wrong and waiting for Evaluation when he starts with work
 * waiting; ready = all of them done (he needs Theory now), else one to three are left to do.
 */
export function fighterStart(f: Fighter, k: KidPlan, P: Plan, now: number, r: () => number, traps: readonly number[]): Record<string, Mark> {
  const marks: Record<string, Mark> = {};
  const teachable = f.ladder.filter((s) => s.teach.length > 0);
  if (!teachable.length) return marks;
  const next = teachable[Math.min(k.at, teachable.length - 1)];
  const done = f.ladder.slice(0, f.ladder.indexOf(next));
  for (const s of done) for (const q of s.teach) marks[String(q)] = { s: "taught", t: now - 70 * MIN };
  const solo = done.flatMap((s) => s.solo);
  const leave = k.ready ? 0 : Math.min(solo.length, 1 + Math.floor(r() * 3));
  const tried = solo.slice(0, solo.length - leave);
  const recent = new Set(tried.slice(-6));
  let wrongs = 0;
  for (const q of tried) {
    const t = now - Math.round(between(r, [3, 45]) * MIN);
    if (k.waiting && recent.has(q) && wrongs < 2 && r() < Math.min(0.9, lossOf(P, k.care, traps.includes(q)) * 1.6)) {
      marks[String(q)] = { s: "wrong", n: 1, t };
      wrongs++;
    } else marks[String(q)] = { s: "right", t };
  }
  return marks;
}

/**
 * His answer to one theory-book question, as the app's Correction marks it (wrong counts up, as `marks.set`). A question
 * explained (or a slip) is a redo: mostly right this time.
 */
export function answerMark(prev: Mark | undefined, P: Plan, care: number, trap: boolean, r: () => number, at: number): Mark {
  const redo = prev?.s === "explained" || prev?.s === "slip";
  const p = redo ? Math.min(0.3, lossOf(P, care, false) * 0.5) : lossOf(P, care, trap);
  const x = r();
  const n = prev?.n ?? 0;
  if (x < p) return { s: "wrong", n: n + 1, t: at };
  if (!redo && x < p + 0.04) return n ? { s: "slip", n, t: at } : { s: "slip", t: at };
  return n ? { s: "right", n, t: at } : { s: "right", t: at };
}

/** How long one level (workbook) or one question (theory book) takes him at this level. */
export function pieceMs(P: Plan, stage: "fighter" | "master", speed: number, r: () => number): number {
  return Math.max(20_000, Math.round(between(r, stage === "master" ? P.levelMin : P.questionMin) * speed * MIN));
}

/** Before the app sends a called student (the same for one call on every step). */
export function sendDelayMs(P: Plan, callId: string): number {
  return Math.round(between(rng(hashOf("send", callId)), P.sendSec) * 1000);
}

/** Before the app corrects a level handed in (the same for one level on every step). */
export function correctDelayMs(P: Plan, key: string): number {
  return Math.round(between(rng(hashOf("correct", key)), P.correctSec) * 1000);
}

// ---------------------------------------------------------------- one reading a minute

/**
 * The class at one moment: n in class, idle = with no work, eq/es = questions and students waiting for Evaluation,
 * ts = students Theory should take now (questions sent there, or out of a theory book's ladder soon), room = with a
 * teacher or on the way, cq = levels waiting for Correction (the app).
 */
export type SimSample = { t: number; n: number; idle: number; eq: number; es: number; ts: number; room: number; cq: number };

export function emptySample(t: number): SimSample {
  return { t, n: 0, idle: 0, eq: 0, es: 0, ts: 0, room: 0, cq: 0 };
}

/** One workbook student's part of the reading. */
export function addMasterSample(x: SimSample, st: { pending: number[]; theory: number[]; wholeUnit: boolean; waiting: unknown[]; dry: boolean }, inRoom: boolean) {
  x.n++;
  if (inRoom) x.room++;
  else if (st.dry) x.idle++;
  x.eq += st.pending.length;
  if (st.pending.length) x.es++;
  if (st.theory.length || st.wholeUnit) x.ts++;
  x.cq += st.waiting.length;
}

/** One theory-book student's part of the reading. */
export function addFighterSample(x: SimSample, st: { pending: number[]; nextTheory: string | null; left: number; dry: boolean }, inRoom: boolean) {
  x.n++;
  if (inRoom) x.room++;
  else if (st.dry) x.idle++;
  x.eq += st.pending.length;
  if (st.pending.length) x.es++;
  if (st.nextTheory && st.left <= AMBER_AT) x.ts++;
}

// ---------------------------------------------------------------- the scoreboard (the Owner page's Sim tab)

export type SimEvent = DEvent & { name?: string; q?: number };
export type SimCall = DCall & { _id?: string; teacherId?: string; ahead?: boolean; walk?: boolean };
export type SimKidNow = { _id: string; name: string; stage?: string; present: boolean; room?: string; idleSince?: number; idleReason?: string };

/** One teacher in one room during the simulation. */
export type TeacherLine = {
  name: string;
  room: "evaluation" | "theory";
  /** Students called; called while they still had work. */
  calls: number;
  ahead: number;
  /** Arrived tapped by her; Arrived the app had to say for her (sent 3 minutes, nobody tapped it). */
  arrived: number;
  missed: number;
  /** Sent → her Arrived, on average (seconds). */
  walkSec: number | null;
  /** Students sent back to work; different students; questions explained (Evaluation) or taught (Theory). */
  done: number;
  students: number;
  qs: number;
  toTheory: number;
  lessons: number;
  /** Minutes busy with students (overlaps once), share of the simulation's time, minutes per student. */
  busyMin: number;
  busyPct: number | null;
  perVisitMin: number | null;
};

export type SimBoard = {
  /** Minutes the simulation has run (all of it once it ended). */
  minutes: number;
  digest: Digest;
  /** Idle minutes per student-hour (the class's headline number). */
  rate: number | null;
  /** Out of work now: the longest first. */
  outs: { id: string; name: string; min: number; why: RoomKey[] }[];
  teachers: TeacherLine[];
  /** What the app did as Correction: levels corrected, theory-book answers marked, students sent, Arrived said. */
  robot: { levels: number; marks: number; sent: number; reached: number };
};

const one = (x: number) => Math.round(x * 10) / 10;

/** The numbers of a simulation from its students' history (only theirs: the caller filters). */
export function simBoard(input: { start: number; end: number; events: SimEvent[]; calls: SimCall[]; visits: DVisit[]; kids: SimKidNow[] }): SimBoard {
  const { start, end, kids } = input;
  const events = [...input.events].sort((a, b) => a.at - b.at);
  const digest = digestOf({
    start,
    end,
    events,
    calls: input.calls,
    visits: input.visits,
    students: kids.map((k) => ({ _id: k._id, stage: k.stage, demo: false })),
  });
  const minutes = Math.max(0, (end - start) / MIN);
  const hours = digest.studentMin / 60;
  const rate = hours >= 0.05 ? one(digest.idle.total / hours) : null;

  // Arrived: by her, or by the app for her (the event at the call's arrivedAt says who).
  const arrivedBy = new Map<string, string | undefined>();
  for (const e of events) if (e.kind === "arrived" && e.studentId) arrivedBy.set(`${e.studentId}:${e.at}`, e.who);

  const lines = new Map<string, TeacherLine & { ids: Set<string>; walks: number[]; at: Set<number> }>();
  const line = (name: string, room: "evaluation" | "theory") => {
    const key = `${room}:${name}`;
    let x = lines.get(key);
    if (!x) {
      x = {
        name,
        room,
        calls: 0,
        ahead: 0,
        arrived: 0,
        missed: 0,
        walkSec: null,
        done: 0,
        students: 0,
        qs: 0,
        toTheory: 0,
        lessons: 0,
        busyMin: 0,
        busyPct: null,
        perVisitMin: null,
        ids: new Set(),
        walks: [],
        at: new Set(),
      };
      lines.set(key, x);
    }
    return x;
  };
  const roomOf = (r: string | undefined): "evaluation" | "theory" | null => (r === "theory" ? "theory" : r === "evaluation" ? "evaluation" : null);

  for (const c of input.calls) {
    const room = roomOf(c.room);
    if (!room || !c.teacher) continue;
    const x = line(c.teacher, room);
    x.calls++;
    if (c.ahead) x.ahead++;
    if (c.arrivedAt !== undefined) {
      const who = arrivedBy.get(`${c.studentId}:${c.arrivedAt}`);
      if (who === ROBOT) x.missed++;
      else {
        x.arrived++;
        if (c.walk && c.sentAt !== undefined && c.arrivedAt >= c.sentAt) x.walks.push((c.arrivedAt - c.sentAt) / 1000);
      }
    }
  }
  for (const e of events) {
    const who = e.who;
    if (!who || who === ROBOT) continue;
    if (e.kind === "done-evaluation" || e.kind === "done-theory") {
      const x = line(who, e.kind === "done-theory" ? "theory" : "evaluation");
      x.done++;
      if (e.studentId) x.ids.add(e.studentId);
      if (e.kind === "done-theory") {
        x.at.add(e.at);
        const m = /taught ([\d,]+)/.exec(e.value ?? "");
        if (m) x.qs += m[1].split(",").filter(Boolean).length;
      }
    } else if (e.kind === "explained") {
      line(who, roomOf(e.by) ?? "evaluation").qs += Number(e.value ?? 0) || 0;
    } else if (e.kind === "taught") {
      line(who, roomOf(e.by) ?? "theory").qs += Number(e.value ?? 0) || 0;
    } else if (e.kind === "to-theory") {
      line(who, "evaluation").toTheory += (e.value ?? "").split(",").filter((s) => s.trim()).length;
    }
  }
  const teachers: TeacherLine[] = [];
  for (const x of lines.values()) {
    const p = digest.people.find((q) => q.name === x.name);
    const busy = p ? p.min[x.room] : 0;
    const { ids, walks, at, ...rest } = x;
    teachers.push({
      ...rest,
      students: ids.size,
      lessons: at.size,
      walkSec: walks.length ? Math.round(walks.reduce((a, b) => a + b, 0) / walks.length) : null,
      busyMin: one(busy),
      busyPct: minutes >= 1 ? Math.min(1, busy / minutes) : null,
      perVisitMin: p && p.visits ? one(busy / p.visits) : null,
    });
  }
  teachers.sort((a, b) => (a.room === b.room ? b.done - a.done || a.name.localeCompare(b.name) : a.room === "evaluation" ? -1 : 1));

  const outs = kids
    .filter((k) => k.present && !k.room && k.idleSince !== undefined)
    .map((k) => ({
      id: k._id,
      name: k.name,
      min: Math.max(0, Math.round((end - k.idleSince!) / MIN)),
      why: (k.idleReason ?? "").split("+").filter((r): r is RoomKey => (ROOMS as readonly string[]).includes(r)),
    }))
    .sort((a, b) => b.min - a.min || a.name.localeCompare(b.name));

  const robot = digest.people.find((p) => p.name === ROBOT);
  return {
    minutes: one(minutes),
    digest,
    rate,
    outs,
    teachers,
    robot: {
      levels: robot?.levels ?? 0,
      marks: robot?.marks ?? 0,
      sent: events.filter((e) => e.kind === "sent" && e.who === ROBOT).length,
      reached: events.filter((e) => e.kind === "arrived" && e.who === ROBOT).length,
    },
  };
}

/**
 * Was the room enough for this load? Idle minutes per student-hour waiting for it: 6+ needs another person, 3–6 near
 * the limit, under 3 kept up (the Owner page's thresholds). Grey until there is a quarter of a student-hour to judge.
 */
export function roomLoad(d: Digest, room: RoomKey): { tone: "red" | "amber" | "green" | "grey"; rate: number | null } {
  const hours = d.studentMin / 60;
  if (hours < 0.25) return { tone: "grey", rate: null };
  const rate = one(d.idle[room] / hours);
  return { tone: rate >= 6 ? "red" : rate >= 3 ? "amber" : "green", rate };
}

/** Minutes the simulation's clock stands at (the students' time). */
export function simMinutes(sim: { startedAt: number; endedAt?: number; endsAt: number }, now: number): { done: number; total: number; left: number } {
  const end = sim.endedAt ?? Math.min(now, sim.endsAt);
  const total = Math.round((sim.endsAt - sim.startedAt) / MIN);
  const done = Math.max(0, Math.floor((end - sim.startedAt) / MIN));
  return { done: Math.min(done, total), total, left: sim.endedAt ? 0 : Math.max(0, Math.ceil((sim.endsAt - now) / MIN)) };
}

export const ROOM_KEYS = ROOMS;
