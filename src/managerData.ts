// The Manager page's rules (2 Nov 2026; rebuilt 3 Nov 2026, his voice note: "the manager can send anyone to any
// place", "rooms of the teachers and the hall as rectangles"). The teachers use their own phones (Call, Arrived,
// Done); the manager sees the hall and every teacher's room on one screen and sends students to any teacher, above
// all when a teacher sits free while students wait. Pure and tested (tests/manager.test.ts); the page is
// src/manager.tsx.
//
// The hold rule (his pick, 2 Nov 2026): a student who lost marks keeps working while others who are about to lose the
// same question catch up, so the teacher explains it once for all of them. He goes at once when any one is true: he
// has no work left · 3 have the same question · the first waited 20 minutes · he goes home soon · nobody else in
// class is coming to his questions. And (3 Nov 2026): a teacher is free with nothing else to do: holding only saves
// teacher minutes, and hers are free now.

import type { MasterLevel } from "../convex/lib/book";
import { slClock, slDay } from "../convex/lib/day";
import { roomCalls, seenToday, theoryGroups, theoryMembers, withBooks, type RoomCall, type View } from "./derive";
import { bookKey, candidates, EVAL_CAP, qLabel, type Cand } from "./evalFocusData";
import type { Board, Call, Unit } from "./store";
import {
  classPace,
  LATE_SEND_MS,
  LESSON_CAP,
  mShort,
  paceOf,
  planLessons,
  STAY_MS,
  WAIT_MS,
  type Lesson,
  type Member,
} from "./theoryFocusData";

/** A lost question waits for others this long at most (his pick: 20 minutes). */
export const HOLD_MS = 20 * 60_000;
/** This many with the same question: they go now, one explanation for all. */
export const GROUP_N = 3;
/** A workbook level, until his own pace is known (the founder's "a level about 30 minutes"). */
export const LEVEL_MS = 30 * 60_000;
/** One question explained, or one check-in (the Evaluation page's guess until it learns her pace). */
export const Q_MS = 3 * 60_000;
/** In class this long and no Theory or Evaluation teacher has seen him today: "no teacher yet" (his premium feeling). */
export const NO_TEACHER_MS = 60 * 60_000;
/** A teacher free this long while there is work for her: amber, then red (3 Nov 2026: "teachers rest silently"). */
export const FREE_AMBER_MS = 2 * 60_000;
export const FREE_RED_MS = 5 * 60_000;
/** Check-ins one free teacher is offered at once. */
export const CHECKIN_N = 3;

/** A teacher's jobs (Settings → People). */
export type Job = "evaluation" | "theory";
/** What a student goes to a teacher for: lost marks or wrong answers, theory, or a check-in (nothing waits). */
export type TaskKind = "evaluation" | "theory" | "visit";
export const KIND_WORDS: Record<TaskKind, string> = { evaluation: "Evaluation", theory: "Theory", visit: "Check-in" };

/** A teacher the manager can send students to: her jobs, and when her last student went back today. */
export type Teacher = { id: string; name: string; jobs: Job[]; lastEnd?: number | null };

export type Heat = "red" | "orange" | "yellow";

/** One student of a group. */
export type Who = {
  v: View;
  /** Workbook: question numbers; theory book: Evaluation's wrong answers, or Theory's teach questions. */
  qs: number[];
  whole: boolean;
  /** He has no work until this is done. */
  red: boolean;
  heat: Heat;
  /** Why he goes, in a few words ("no work 6m", "with Raj: Q3", "no teacher yet"). */
  why: string;
};

/** A group to send: who goes, to whom (a free teacher who can take it), and why now. */
export type SendTask = {
  key: string;
  kind: TaskKind;
  /** The free teacher it is suggested for; null = nobody free can take it now. */
  to: Teacher | null;
  unit: Unit | null;
  stage: "fighter" | "master" | null;
  /** A theory book's section to teach ("D"). */
  section: string | null;
  sectionTitle: string | null;
  who: Who[];
  /** Questions 2+ of them share, most first: taught once for all. */
  shared: { q: number; n: number }[];
  heat: Heat;
  why: string;
  /** Theory: they don't need it yet; the teacher has nothing else (taught ahead). */
  ahead: boolean;
};

/** Someone waiting on purpose: the group isn't full yet (or Theory first). */
export type Held = { key: string; v: View; kind: TaskKind; qs: number[]; why: string; sendBy: number | null };

/** A student in a teacher's room: called by her phone (not sent yet), on his way (her Arrived not tapped), with her. */
export type RoomPill = {
  key: string;
  v: View;
  rc: RoomCall;
  state: "called" | "walking" | "here";
  kind: TaskKind;
  /** Called 3 min and not sent, or on his way 3 min and she hasn't tapped Arrived. */
  late: boolean;
  /** Since he got there (or was sent / called). */
  ms: number;
};

export type Alarm = "amber" | "red" | null;

/** A teacher's room on the Manager page. */
export type Room = {
  t: Teacher;
  /** Not here today (the manager's switch), but students are still with her. */
  away: boolean;
  pills: RoomPill[];
  /** What she is doing now (the room's colour); null = nobody with her. */
  doing: TaskKind | null;
  /** Nobody with her, nobody on the way, nobody called. */
  free: boolean;
  /** Free since (her last student went back today, else the class began). */
  freeSince: number | null;
  /** With someone: since the first arrived; about how long is left; over = well past it. */
  since: number | null;
  leftMs: number | null;
  over: boolean;
  /** Free while there is work for her: amber 2 min, red 5 min. Over: amber. */
  alarm: Alarm;
  /** The group the page suggests for her (free rooms only): one tap sends it. */
  suggest: SendTask | null;
};

/** A student in the hall (not called, not in a room). */
export type HallPill = {
  v: View;
  /** red = no work now · orange = should go now · yellow = waiting (on purpose) · null = working, nothing waits. */
  heat: Heat | null;
  noTeacher: boolean;
  quiet: boolean;
  /** No book in the app (Legend, Exam Sprint, a unit not loaded): on paper. */
  offApp: boolean;
  /** Finished his book with nothing else given: Move him on. */
  finished: boolean;
  task?: SendTask;
  held?: Held;
};

/** How many, how many of them with no work until then, and who (the hall lights them when the number is tapped). */
export type Count = { n: number; red: number; ids: string[] };
export type ManagerPlan = {
  rooms: Room[];
  /** Marked not here today, nobody with them (Bring back). */
  away: Teacher[];
  hall: HallPill[];
  /** To correct (levels), to explain and to teach (students): the manager's three numbers to bring down. */
  counts: { correct: Count; explain: Count; teach: Count };
  tasks: SendTask[];
  held: Held[];
  noTeachers: boolean;
};

export type PlanOpts = {
  lessonMs: number;
  /** Teachers the manager marked "not here today". */
  away?: ReadonlySet<string>;
};

// ---------------- Who can take what ----------------

/** Evaluation and check-ins: the evaluation room. Theory: the theory room, or the evaluation room (she teaches it). */
export function canTake(t: Pick<Teacher, "jobs">, kind: TaskKind): boolean {
  return kind === "theory" ? t.jobs.includes("theory") || t.jobs.includes("evaluation") : t.jobs.includes("evaluation");
}

/** The call that sends a student to her for this: the room her phone shows it on. */
export function callFor(t: Pick<Teacher, "jobs">, kind: TaskKind): { room: Job; kind: Job; visit?: true } | null {
  if (!canTake(t, kind)) return null;
  if (kind === "visit") return { room: "evaluation", kind: "evaluation", visit: true };
  if (kind === "evaluation") return { room: "evaluation", kind: "evaluation" };
  return { room: t.jobs.includes("theory") ? "theory" : "evaluation", kind: "theory" };
}

/**
 * What one student would go to a teacher for now, in which of his books: a theory-book student with no work who needs
 * a lesson → Theory (it gives him work); lost marks or wrong answers → Evaluation; theory waiting → Theory; nothing
 * waits → a check-in.
 */
export function needOf(v0: View): { kind: TaskKind; v: View } {
  const home = v0.home ?? v0;
  const books = [home, ...home.others];
  const fighterNoWork = books.find((b) => b.st && home.noWork && b.st.needs.includes("theory"));
  if (fighterNoWork) return { kind: "theory", v: fighterNoWork };
  const pending = books.find((b) => b.pending.length > 0);
  if (pending) return { kind: "evaluation", v: pending };
  const theory = books.find((b) => (b.st?.nextTheory && !b.st.finished) || b.ms?.reteach);
  if (theory) return { kind: "theory", v: theory };
  return { kind: "visit", v: home };
}

/** No Theory or Evaluation teacher has seen him today, and he has been here an hour (his premium feeling). */
export function noTeacherYet(v: View, now: number): boolean {
  const home = v.home ?? v;
  if (home.where !== "hall" || home.s.lastInAt === undefined || now - home.s.lastInAt < NO_TEACHER_MS) return false;
  return !seenToday(home, "theory", now) && !seenToday(home, "evaluation", now);
}

// ---------------- Who else is coming to a question ----------------

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Minutes a level takes him: the middle of the gaps between his hand-ins today (3–90 min), else 30 min. */
export function levelPaceOf(v: View, now: number): number {
  const today = slDay(now);
  const times = Object.values(v.mm.lv)
    .map((l) => l.done)
    .filter((t): t is number => t !== undefined && t <= now && slDay(t) === today)
    .sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) {
    const g = times[i] - times[i - 1];
    if (g >= 3 * 60_000 && g <= 90 * 60_000) gaps.push(g);
  }
  if (gaps.length === 0) return LEVEL_MS;
  return Math.min(60 * 60_000, Math.max(5 * 60_000, median(gaps)));
}

const levelOf = (v: View, q: number): MasterLevel | undefined => v.mb?.levels.find((l) => q >= l.from && q <= l.to);

/** When he goes home (arrival + 2 hours), if known. */
const homeAt = (v: View) => (v.s.lastInAt !== undefined ? v.s.lastInAt + STAY_MS : undefined);

export type Follower = { v: View; eta: number; words: string };

/**
 * Others in class who will reach this question of this book soon (they haven't done it yet), soonest first: a
 * workbook's level handed in and not corrected (eta 0), or the level he is on or before it at his pace; a theory
 * book's question he can do now, at his pace. Those who go home first don't count.
 */
export function followersOf(v: View, q: number, views: readonly View[], now: number, classMs?: number): Follower[] {
  const out: Follower[] = [];
  const unitId = v.unit?._id ?? v.s.unitId;
  const pace = classMs ?? classPace([...views]);
  for (const o of withBooks([...views])) {
    if (o.s._id === v.s._id || o.where === "absent") continue;
    if ((o.unit?._id ?? o.s.unitId) !== unitId || o.stage !== v.stage) continue;
    let eta: number | null = null;
    let words = "";
    if (v.mb && o.ms && o.mb) {
      const l = levelOf(o, q);
      if (!l) continue;
      const lv = o.mm.lv[String(l.n)];
      if (lv?.fixed || lv?.pre) continue; // done already: he has it or he doesn't
      if (lv?.done) {
        eta = 0;
        words = `L${l.n} to correct`;
      } else if (o.ms.current && o.ms.current.n <= l.n) {
        const lp = levelPaceOf(o, now);
        const prev = o.mm.lv[String(o.ms.current.n - 1)]?.done;
        const start = Math.max(prev ?? 0, o.s.lastInAt ?? 0) || now - lp / 2;
        eta = Math.max(60_000, start + lp - now) + (l.n - o.ms.current.n) * lp;
        words = `hands in L${l.n} ~${mShort(eta)}`;
      }
    } else if (v.f && o.st && o.f) {
      if (o.marks[String(q)]) continue;
      const i = o.st.doable.indexOf(q);
      if (i < 0) continue; // not open for him yet (a lesson first): not soon
      const own = paceOf(o) ?? pace;
      const since = Math.max(0, now - (o.s.lastActivityAt ?? now));
      eta = i * own + Math.max(own / 4, own - since);
      words = `reaches ${qLabel(o, q)} ~${mShort(Math.max(60_000, eta))}`;
    }
    if (eta === null) continue;
    const home = homeAt(o);
    if (home !== undefined && home < now + eta) continue;
    out.push({ v: o, eta, words });
  }
  return out.sort((a, b) => a.eta - b.eta || a.v.s.name.localeCompare(b.v.s.name));
}

// ---------------- The hold rule ----------------

export type HoldDecision = { send: true; why: string; red: boolean; heat: Heat } | { send: false; why: string; sendBy: number };

/** Students (not called anywhere) with the same book and question waiting for Evaluation: "Q3" → 3. */
function shareCounts(cands: readonly Cand[]): Map<string, number> {
  const n = new Map<string, number>();
  for (const c of cands) for (const q of c.qs) n.set(`${bookKey(c.v)}:${q}`, (n.get(`${bookKey(c.v)}:${q}`) ?? 0) + 1);
  return n;
}

/** Go now, or wait for the others (why, and the latest time he goes anyway). */
export function holdOf(c: Cand, shares: Map<string, number>, views: readonly View[], now: number, classMs?: number): HoldDecision {
  const v = c.v;
  const home = v.home ?? v;
  if (home.noWork) return { send: true, why: c.why.startsWith("no work") ? c.why : "no work", red: true, heat: "red" };
  if (c.heat === "red") return { send: true, why: c.why, red: true, heat: "red" }; // stuck, or a section stopped
  let best: { q: number; n: number } | null = null;
  for (const q of c.qs) {
    const n = shares.get(`${bookKey(v)}:${q}`) ?? 0;
    if (!best || n > best.n) best = { q, n };
  }
  if (best && best.n >= GROUP_N) return { send: true, why: `${best.n} lost ${qLabel(v, best.q)}`, red: false, heat: "orange" };
  if (c.waited >= HOLD_MS) return { send: true, why: `waited ${mShort(c.waited)}`, red: false, heat: "orange" };
  const leave = homeAt(home);
  if (leave !== undefined && leave > now && leave - now <= HOLD_MS) {
    return { send: true, why: `goes home ${slClock(leave)}`, red: false, heat: "orange" };
  }
  const left = HOLD_MS - c.waited;
  let first: Follower | null = null;
  for (const q of c.qs) {
    const f = followersOf(v, q, views, now, classMs).find((x) => x.eta <= left);
    if (f && (!first || f.eta < first.eta)) first = f;
  }
  if (!first) return { send: true, why: "nobody else coming", red: false, heat: "yellow" };
  return { send: false, why: `waits for ${first.v.s.name} (${first.words})`, sendBy: now + left };
}

// ---------------- Groups to send ----------------

type Out = { c: Cand; why: string; red: boolean; heat: Heat };
const HEAT_RANK: Record<Heat, number> = { red: 0, orange: 1, yellow: 2 };
const hotter = (a: Heat, b: Heat): Heat => (HEAT_RANK[a] <= HEAT_RANK[b] ? a : b);

function sharedOf(who: readonly Who[], section: string | null): { q: number; n: number }[] {
  if (section) return [];
  const n = new Map<number, number>();
  for (const w of who) for (const q of w.qs) n.set(q, (n.get(q) ?? 0) + 1);
  return [...n]
    .filter(([, k]) => k >= 2)
    .map(([q, k]) => ({ q, n: k }))
    .sort((a, b) => b.n - a.n || a.q - b.q);
}

/** A group of one book: its colour, shared questions and words from who is in it. */
function groupOf(kind: TaskKind, key: string, who: Who[], o: { section?: Lesson["section"]; ahead?: boolean; why?: string } = {}): SendTask {
  const v0 = who[0].v;
  const heat = who.reduce<Heat>((h, w) => hotter(w.heat, h), "yellow");
  const section = o.section?.id ?? null;
  const shared = sharedOf(who, section);
  const big = shared[0] && shared[0].n >= GROUP_N ? shared[0] : null;
  const red = who.find((w) => w.red);
  const says = (w: Who) => (w.why.startsWith("stuck: ") ? `${w.v.s.name} stuck on ${w.why.slice(7)}` : w.why ? `${w.v.s.name}: ${w.why}` : w.v.s.name);
  const words = o.why ?? (red ? says(red) : big ? `${big.n} ${kind === "theory" ? "need" : "lost"} ${qLabel(v0, big.q)}` : says(who[0]));
  return {
    key,
    kind,
    to: null,
    unit: v0.unit,
    stage: v0.stage === "fighter" || v0.stage === "master" ? v0.stage : null,
    section,
    sectionTitle: o.section?.tamil ?? null,
    who,
    shared,
    heat,
    why: o.ahead ? `ahead · ${words}` : words,
    ahead: !!o.ahead,
  };
}

const idsOf = (who: readonly Who[]) => who.map((w) => w.v.s._id).sort().join(",");

/** Evaluation's groups: one book per group, 6 at most, red first; each brings all his questions in that book. */
function evalTasks(out: Out[]): SendTask[] {
  const byBook = new Map<string, Out[]>();
  for (const o of out) byBook.set(bookKey(o.c.v), [...(byBook.get(bookKey(o.c.v)) ?? []), o]);
  const tasks: SendTask[] = [];
  for (const list of byBook.values()) {
    const count = new Map<number, number>();
    for (const o of list) for (const q of o.c.qs) count.set(q, (count.get(q) ?? 0) + 1);
    const shared = (o: Out) => o.c.qs.reduce((a, q) => a + ((count.get(q) ?? 0) >= 2 ? 1 : 0), 0);
    list.sort(
      (a, b) => HEAT_RANK[a.heat] - HEAT_RANK[b.heat] || shared(b) - shared(a) || b.c.waited - a.c.waited || a.c.v.s.name.localeCompare(b.c.v.s.name),
    );
    for (let i = 0; i < list.length; i += EVAL_CAP) {
      const who = list.slice(i, i + EVAL_CAP).map((o) => ({ v: o.c.v, qs: [...o.c.qs], whole: false, red: o.red, heat: o.heat, why: o.why }));
      tasks.push(groupOf("evaluation", `e:${bookKey(who[0].v)}:${idsOf(who)}`, who));
    }
  }
  return tasks;
}

function memberWhy(m: Member): string {
  if (m.outIn === 0) return m.wait >= 60_000 ? `no work ${mShort(m.wait)}` : "no work";
  if (m.waited !== undefined && m.waited >= 60_000) return `waited ${mShort(m.waited)}`;
  if (m.outIn !== null) return `out ~${mShort(Math.max(60_000, m.outIn))}`;
  return "";
}

function theoryTask(l: Lesson, go: Member[], ahead: boolean): SendTask {
  const who: Who[] = go.map((m) => ({
    v: m.v,
    qs: l.kind === "section" ? m.teach : m.qs,
    whole: m.whole,
    red: m.outIn === 0,
    heat: m.outIn === 0 ? "red" : !ahead && (m.urgent || l.starving) ? "orange" : "yellow",
    why: memberWhy(m),
  }));
  return groupOf("theory", `t:${l.key}:${idsOf(who)}`, who, { section: l.section, ahead });
}

const redCount = (t: SendTask) => t.who.filter((w) => w.red).length;
/** Worst first: red, the most with no work, the biggest group, Theory before Evaluation (theory comes first). */
const order = (a: SendTask, b: SendTask) =>
  HEAT_RANK[a.heat] - HEAT_RANK[b.heat] ||
  redCount(b) - redCount(a) ||
  b.who.length - a.who.length ||
  Number(b.kind === "theory") - Number(a.kind === "theory");

// ---------------- Rooms ----------------

const kindOf = (c: Call): TaskKind => (c.visit ? "visit" : c.kind);

function roomOf(t: Teacher, board: Board, views: View[], now: number, lessonMs: number, away: boolean, started: number): Room {
  // Her calls only (each teacher has her own room); both rooms: a teacher may teach theory and explain.
  const mine = { ...board, calls: board.calls.filter((c) => c.teacherId === t.id && (c.status === "requested" || c.status === "sent")) } as Board;
  const rcs = [...roomCalls(mine, views, "evaluation", now, t.id), ...roomCalls(mine, views, "theory", now, t.id)].sort(
    (a, b) => a.c.createdAt - b.c.createdAt,
  );
  const pills: RoomPill[] = [];
  for (const rc of rcs) {
    if (!rc.v) continue;
    const state: RoomPill["state"] = rc.walking ? "walking" : rc.c.status === "sent" ? "here" : "called";
    const late = state === "walking" ? rc.lost : state === "called" ? now - rc.c.createdAt >= LATE_SEND_MS : false;
    pills.push({ key: rc.c._id, v: rc.v, rc, state, kind: kindOf(rc.c), late, ms: rc.minutes });
  }
  const here = pills.filter((p) => p.state === "here");
  const tally = new Map<TaskKind, number>();
  for (const p of here) tally.set(p.kind, (tally.get(p.kind) ?? 0) + 1);
  const doing = here.length ? [...tally].sort((a, b) => b[1] - a[1])[0][0] : null;
  const since = here.length ? Math.min(...here.map((p) => p.rc.c.arrivedAt ?? p.rc.c.sentAt ?? p.rc.c.createdAt)) : null;
  let leftMs: number | null = null;
  let over = false;
  if (since !== null) {
    // Each question once for everyone with her, a check-in 3 min each; a theory lesson its usual length.
    const qs = new Set(here.filter((p) => p.kind === "evaluation").flatMap((p) => p.v.pending.map((q) => `${bookKey(p.v)}:${q}`)));
    const visits = here.filter((p) => p.kind === "visit").length;
    const need = Math.max(qs.size * Q_MS + visits * Q_MS, here.some((p) => p.kind === "theory") ? lessonMs : 0, Q_MS);
    const spent = now - since;
    leftMs = Math.max(0, need - spent);
    over = spent > need + 2 * 60_000;
  }
  const free = pills.length === 0;
  const lastEnd = t.lastEnd && slDay(t.lastEnd) === slDay(now) ? t.lastEnd : 0;
  return {
    t,
    away,
    pills,
    doing,
    free,
    freeSince: free ? Math.max(lastEnd, started) : null,
    since,
    leftMs,
    over,
    alarm: over ? "amber" : null,
    suggest: null,
  };
}

// ---------------- The plan ----------------

/** What the manager sees and does now: the rooms (with a suggestion for each free one), the hall, the three numbers. */
export function managerPlan(board: Board, views: View[], now: number, team: readonly Teacher[], o: PlanOpts): ManagerPlan {
  const inClass = views.filter((v) => v.where !== "absent");
  const away = o.away ?? new Set<string>();
  const started = board.session?.startedAt ?? now;

  // Teachers, and anyone who still has a call with a student (a teacher removed meanwhile).
  const known = new Map(team.map((t) => [t.id, t]));
  for (const c of board.calls) {
    if ((c.status === "requested" || c.status === "sent") && c.teacherId && !known.has(c.teacherId)) {
      known.set(c.teacherId, { id: c.teacherId, name: c.teacher ?? "Teacher", jobs: [c.room] });
    }
  }
  const all = [...known.values()].map((t) => roomOf(t, board, views, now, o.lessonMs, away.has(t.id), started));
  const rooms = all.filter((r) => !r.away || !r.free);
  const awayTeachers = all.filter((r) => r.away && r.free).map((r) => r.t);

  // Evaluation: everyone with lost marks or wrong answers (not called, not Theory's), held or due.
  const pace = classPace(views);
  const cands = candidates(views, now, pace).filter((c) => !c.hold);
  const shares = shareCounts(cands);
  const decided = cands.map((c) => ({ c, d: holdOf(c, shares, views, now, pace) }));
  // Someone goes: the others of his book with the same question go with him (one explanation for all).
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const x of decided) {
      if (x.d.send) continue;
      const mate = decided.find((y) => y.d.send && bookKey(y.c.v) === bookKey(x.c.v) && y.c.qs.some((q) => x.c.qs.includes(q)));
      if (!mate) continue;
      const q = mate.c.qs.find((n) => x.c.qs.includes(n))!;
      x.d = { send: true, why: `with ${mate.c.v.s.name}: ${qLabel(x.c.v, q)}`, red: false, heat: "orange" };
      moved = true;
    }
    if (!moved) break;
  }
  const out: Out[] = decided.flatMap((x) => (x.d.send ? [{ c: x.c, why: x.d.why, red: x.d.red, heat: x.d.heat }] : []));
  const held: Held[] = decided.flatMap((x) =>
    x.d.send ? [] : [{ key: `h:${x.c.v.key}`, v: x.c.v, kind: "evaluation" as TaskKind, qs: [...x.c.qs], why: x.d.why, sendBy: x.d.sendBy }],
  );

  // Theory: the lessons the Theory page would plan (no work and soon first; a workbook question waits 20 minutes).
  const lessons = planLessons(views, now, { lessonMs: o.lessonMs, startInMs: 0 });
  const due: SendTask[] = [];
  const ahead: SendTask[] = [];
  for (const l of lessons) {
    const can = l.members.filter((m) => !m.hold);
    if (!can.length) continue;
    if (l.starving || l.frees > 0 || l.shared.some((s) => s.n >= GROUP_N)) due.push(theoryTask(l, can.slice(0, LESSON_CAP), false));
    else if (l.kind === "workbook") {
      // The hold rule for Theory too: workbook questions wait for more who need them (20 minutes at most).
      for (const m of can) {
        held.push({ key: `h:t:${m.v.key}`, v: m.v, kind: "theory", qs: m.qs, why: "waits for more who need it", sendBy: now + Math.max(0, WAIT_MS - (m.waited ?? 0)) });
      }
    } else ahead.push(theoryTask(l, can.slice(0, LESSON_CAP), true)); // a section: a free teacher can teach it ahead
  }

  // A theory-book student with no work gets work from Theory, not from Evaluation: his wrong answers wait until after
  // the lesson (theory comes first). A workbook student with no work is explained now (nothing else gives him work).
  const theoryFirst = new Map<string, string>();
  for (const t of due) for (const w of t.who) if (w.red && w.v.st?.needs.includes("theory")) theoryFirst.set(w.v.s._id, t.section ?? "");
  for (let i = out.length - 1; i >= 0; i--) {
    const sec = theoryFirst.get(out[i].c.v.s._id);
    if (sec === undefined) continue;
    const c = out[i].c;
    held.push({ key: `h:${c.v.key}`, v: c.v, kind: "evaluation", qs: [...c.qs], why: `Theory${sec ? ` ${sec}` : ""} first: it gives work`, sendBy: null });
    out.splice(i, 1);
  }

  // One list, worst first; a student goes to one place: the most urgent group that has him.
  const taken = new Set<string>();
  const once = (t: SendTask): SendTask | null => {
    const who = t.who.filter((w) => !taken.has(w.v.s._id));
    if (!who.length) return null;
    for (const w of who) taken.add(w.v.s._id);
    return who.length === t.who.length ? t : groupOf(t.kind, t.key, who, { section: t.section ? lessonSection(t) : null, ahead: t.ahead });
  };
  const tasks = [...evalTasks(out), ...due].sort(order).map(once).filter((t): t is SendTask => t !== null).sort(order);

  // Suggest each group to a free teacher who can take it (Theory: a Theory teacher first). Free rooms only: a busy
  // teacher gets the next one when she is free (the manager can still send anyone to anyone).
  const freeRooms = rooms.filter((r) => r.free && !r.away);
  const suggestTo = (t: SendTask, prefer?: Job): Room | null => {
    const ok = freeRooms.filter((r) => !r.suggest && canTake(r.t, t.kind));
    return (prefer ? ok.find((r) => r.t.jobs.includes(prefer)) : undefined) ?? ok[0] ?? null;
  };
  for (const t of tasks) {
    const r = suggestTo(t, t.kind === "theory" ? "theory" : undefined);
    if (r) {
      t.to = r.t;
      r.suggest = t;
    }
  }
  // A free teacher with nothing due: those held for a group go now (her minutes are free), then a section ahead.
  for (const r of freeRooms) {
    if (r.suggest) continue;
    const mine = held.filter((h) => h.sendBy !== null && !taken.has(h.v.s._id) && canTake(r.t, h.kind));
    if (mine.length) {
      const kind = mine[0].kind;
      const book = bookKey(mine[0].v);
      const who: Who[] = mine
        .filter((h) => h.kind === kind && bookKey(h.v) === book)
        .slice(0, EVAL_CAP)
        .map((h) => ({ v: h.v, qs: h.qs, whole: !!h.v.ms?.wholeUnit, red: false, heat: "yellow", why: `${r.t.name} is free` }));
      for (const w of who) taken.add(w.v.s._id);
      const t = groupOf(kind, `f:${r.t.id}:${idsOf(who)}`, who, { why: `${r.t.name} is free: no need to wait` });
      t.to = r.t;
      r.suggest = t;
      tasks.push(t);
      continue;
    }
    if (!canTake(r.t, "theory")) continue;
    for (const x of ahead) {
      const a = once(x);
      if (!a) continue;
      a.to = r.t;
      r.suggest = a;
      tasks.push(a);
      break;
    }
  }
  // Still free: a check-in for whoever has been quiet, or has had no teacher yet today (his premium feeling).
  // (Nothing waits for a teacher: whoever has something waiting goes for that instead. On paper too: she looks at it.)
  const visitable = inClass
    .filter((v) => v.where === "hall" && v.calls.length === 0 && !taken.has(v.s._id) && needOf(v).kind === "visit")
    .filter((v) => v.quiet || noTeacherYet(v, now))
    .sort((a, b) => Number(b.quiet) - Number(a.quiet) || (a.s.lastInAt ?? 0) - (b.s.lastInAt ?? 0));
  for (const r of freeRooms) {
    if (r.suggest || !canTake(r.t, "visit") || !visitable.length) continue;
    const who: Who[] = visitable.splice(0, CHECKIN_N).map((v) => ({
      v,
      qs: [],
      whole: false,
      red: false,
      heat: "yellow",
      why: v.quiet ? `no mark ${mShort(v.quietMs ?? 0)}` : "no teacher yet",
    }));
    for (const w of who) taken.add(w.v.s._id);
    const t = groupOf("visit", `v:${r.t.id}:${idsOf(who)}`, who, { why: `check-in: ${who[0].why}` });
    t.to = r.t;
    r.suggest = t;
    tasks.push(t);
  }
  // A teacher free while there is work for her: amber at 2 minutes, red at 5 (the work she could be doing waits).
  for (const r of freeRooms) {
    if (!r.suggest || r.freeSince === null) continue;
    const ms = now - r.freeSince;
    r.alarm = ms >= FREE_RED_MS ? "red" : ms >= FREE_AMBER_MS ? "amber" : null;
  }

  // The hall: everyone not called and not in a room, A–Z (the views are), coloured by what waits.
  const taskOf = new Map<string, SendTask>();
  for (const t of tasks) for (const w of t.who) if (!taskOf.has(w.v.s._id)) taskOf.set(w.v.s._id, t);
  const heldOf = new Map<string, Held>();
  for (const h of held) if (!heldOf.has(h.v.s._id)) heldOf.set(h.v.s._id, h);
  const hall: HallPill[] = inClass
    .filter((v) => v.where === "hall" && v.calls.length === 0)
    .map((v) => {
      const task = taskOf.get(v.s._id);
      const hold = heldOf.get(v.s._id);
      const w = task?.who.find((x) => x.v.s._id === v.s._id);
      const heat: Heat | null = v.noWork ? "red" : w && task?.kind !== "visit" ? w.heat : hold ? "yellow" : null;
      return {
        v,
        heat,
        noTeacher: noTeacherYet(v, now),
        quiet: v.quiet,
        offApp: v.kind === "none",
        finished: !!(v.st?.finished || v.ms?.finished) && v.otherWork.length === 0,
        task,
        held: hold,
      };
    });

  // The three numbers: levels to correct, students to explain to, students to teach (red: with no work until then).
  let correct = 0;
  let correctRed = 0;
  const correctIds: string[] = [];
  for (const v of inClass) {
    const levels = (v.ms?.waiting.length ?? 0) + v.others.reduce((n, b) => n + (b.ms?.waiting.length ?? 0), 0);
    correct += levels;
    if (levels) correctIds.push(v.s._id);
    if (levels && v.where === "hall" && v.noWork && (v.ms?.needs.includes("correction") || v.others.some((b) => b.ms?.needs.includes("correction")))) correctRed++;
  }
  const explainers = new Map<string, boolean>();
  for (const c of cands) explainers.set(c.v.s._id, (explainers.get(c.v.s._id) ?? false) || (c.v.home ?? c.v).noWork);
  const taught = theoryMembers(theoryGroups(views)).filter((m) => !m.inEvaluation);

  return {
    rooms,
    away: awayTeachers,
    hall,
    counts: {
      correct: { n: correct, red: correctRed, ids: correctIds },
      explain: { n: explainers.size, red: [...explainers.values()].filter(Boolean).length, ids: [...explainers.keys()] },
      teach: { n: taught.length, red: taught.filter((m) => m.urgency === "red").length, ids: taught.map((m) => m.v.s._id) },
    },
    tasks: tasks.sort(order),
    held: held.sort((a, b) => (a.sendBy ?? Infinity) - (b.sendBy ?? Infinity)),
    noTeachers: rooms.filter((r) => !r.away).length === 0,
  };
}

/** A theory task's section, for regrouping (the lesson's own section data). */
function lessonSection(t: SendTask): Lesson["section"] {
  const v = t.who[0]?.v;
  return t.section && v?.f ? (v.f.sectionById(t.section) ?? null) : null;
}

// ---------------- Words ----------------

/** "8 U03", "OL U13": a book. */
export function bookWords(unit: Unit | null, v: View): string {
  const g = unit?.grade ?? v.s.grade;
  return `${g === 12 ? "OL" : g} ${unit?.code ?? ""}`.trim();
}

/** "Raj", "Raj, Zara", "Fathima +3": a group's names, short enough for a room on a small phone. */
export function shortNames(names: string[]): string {
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} +${names.length - 1}`;
}

/** "with her 6m", "on his way 2m", "called 1m": a room pill's words. */
export function pillWords(p: RoomPill): string {
  const m = p.ms >= 60_000 ? ` ${mShort(p.ms)}` : "";
  if (p.state === "called") return `called${m}`;
  if (p.state === "walking") return p.late ? `not taken${m}` : `on his way${m}`;
  return `${KIND_WORDS[p.kind]}${m}`;
}

