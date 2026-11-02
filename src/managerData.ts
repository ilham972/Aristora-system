// The Manager page's rules (2 Nov 2026, his voice note: "one person runs the entire app and system"). Theory and
// Evaluation teachers have no phone: one manager sends groups to them and taps Back when they come back. Pure and
// tested (tests/manager.test.ts); the page is src/manager.tsx.
//
// The hold rule (his pick, 2 Nov 2026): a student who lost marks keeps working while others who are about to lose the
// same question catch up, so the teacher explains it once for all of them. He goes at once when any one is true: he
// has no work left · 3 have the same question · the first waited 20 minutes · he goes home soon · nobody else in
// class is coming to his questions (another unit, another grade: no point waiting).

import type { MasterLevel } from "../convex/lib/book";
import { slClock, slDay } from "../convex/lib/day";
import { withBooks, type RoomCall, type View } from "./derive";
import { bookKey, candidates, EVAL_CAP, evalRoom, finishPlan, qLabel, type Cand, type Decision, type EvalHere } from "./evalFocusData";
import type { Board, Unit } from "./store";
import {
  classPace,
  LESSON_CAP,
  mShort,
  paceOf,
  planLessons,
  roomLessons,
  STAY_MS,
  teachLeft,
  WAIT_MS,
  workbookDone,
  type Lesson,
  type Member,
  type RoomLesson,
} from "./theoryFocusData";

/** A lost question waits for others this long at most (his pick: 20 minutes). */
export const HOLD_MS = 20 * 60_000;
/** This many with the same question: they go now, one explanation for all. */
export const GROUP_N = 3;
/** A workbook level, until his own pace is known (the founder's "a level about 30 minutes"). */
export const LEVEL_MS = 30 * 60_000;
/** One question explained (the Evaluation page's guess until it learns her pace). */
export const Q_MS = 3 * 60_000;
/** "Not now" on a task hides it this long. */
export const SNOOZE_MS = 5 * 60_000;
/** Explanations of the same question this far apart count as separate times (a repeat). */
export const REPEAT_GAP_MS = 3 * 60_000;

export type Job = "evaluation" | "theory";
export const JOB_WORDS: Record<Job, string> = { evaluation: "Evaluation", theory: "Theory" };

/** A teacher the manager can send students to (her jobs from Settings → People). */
export type Teacher = { id: string; name: string; jobs: Job[] };

/** One student of a group: his questions in this book. */
export type Who = {
  v: View;
  /** Workbook: question numbers; theory book: Evaluation's wrong answers, or Theory's teach questions. */
  qs: number[];
  /** Theory: the whole unit was asked for. */
  whole: boolean;
  /** He has no work until this is done. */
  red: boolean;
  /** How urgent he is: the group is as urgent as its most urgent student. */
  heat: Heat;
  /** Why he is in the group, in a few words ("no work 6m", "with Raj: Q3"). */
  why: string;
};

export type Heat = "red" | "orange" | "yellow";

/** A group to send now: who goes, to whom, and why now. */
export type SendTask = {
  key: string;
  job: Job;
  /** Who takes it; null = nobody here can. */
  to: Teacher | null;
  /** A teacher of the other job takes it (Evaluation free, Theory full, or the other way round). */
  swap: boolean;
  /** Until `to` is free (0 = free now). */
  freeIn: number;
  unit: Unit | null;
  stage: "fighter" | "master" | null;
  /** A theory book's section to teach ("D"); null for a workbook or Evaluation. */
  section: string | null;
  sectionTitle: string | null;
  who: Who[];
  /** Questions 2+ of them share, most first: taught once for all. */
  shared: { q: number; n: number }[];
  heat: Heat;
  why: string;
  /** Theory: they don't need it yet, the teacher has nothing else (taught ahead). */
  ahead: boolean;
};

/** Someone waiting on purpose: the group isn't full yet. */
export type Held = { key: string; v: View; job: Job; qs: number[]; why: string; sendBy: number | null };

/** What the app can't solve: the manager decides. */
export type Stuck = { key: string; v: View; why: string; move: boolean };

/** A teacher's card: who is with her, how long, and her next group. */
export type PersonCard = {
  t: Teacher;
  /** Not teaching today (the manager's switch), but students are still with her. */
  away: boolean;
  evalHere: EvalHere[];
  theory: RoomLesson[];
  /** Called (by a teacher's phone) and not with her yet. */
  coming: RoomCall[];
  /** When the first one of her group got there; null when free. */
  since: number | null;
  /** About how long is left at the usual speeds; null when free. */
  leftMs: number | null;
  over: boolean;
  next: SendTask | null;
};

export type Waiting = { v: View; n: number; since: number };
export type CorrectionNow = { levels: number; oldest: Waiting | null; red: Waiting[] };
export type Repeat = { key: string; label: string; times: number };
export type ManagerPlan = {
  people: PersonCard[];
  tasks: SendTask[];
  held: Held[];
  stuck: Stuck[];
  correction: CorrectionNow;
  quiet: View[];
  offApp: View[];
  repeats: Repeat[];
  /** Nobody to send to: no Theory or Evaluation teacher here today. */
  noTeachers: boolean;
};

export type PlanOpts = {
  lessonMs: number;
  /** Task keys hidden for now ("Not now"). */
  snoozed?: ReadonlySet<string>;
  /** Book keys (student:unit:stage) the manager chose to send now, whatever the hold says. */
  force?: ReadonlySet<string>;
  /** Teachers the manager marked "not teaching today". */
  away?: ReadonlySet<string>;
};

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
export function holdOf(c: Cand, shares: Map<string, number>, views: readonly View[], now: number, force = false, classMs?: number): HoldDecision {
  const v = c.v;
  const home = v.home ?? v;
  if (force) return { send: true, why: "you chose now", red: home.noWork, heat: home.noWork ? "red" : "orange" };
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
  return { send: false, why: `${first.v.s.name} ${first.words}`, sendBy: now + left };
}

// ---------------- Groups to send ----------------

type Out = { c: Cand; why: string; red: boolean; heat: Heat };
const HEAT_RANK: Record<Heat, number> = { red: 0, orange: 1, yellow: 2 };

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
      const chunk = list.slice(i, i + EVAL_CAP);
      const n = new Map<number, number>();
      for (const o of chunk) for (const q of o.c.qs) n.set(q, (n.get(q) ?? 0) + 1);
      const sh = [...n]
        .filter(([, k]) => k >= 2)
        .map(([q, k]) => ({ q, n: k }))
        .sort((a, b) => b.n - a.n || a.q - b.q);
      const v0 = chunk[0].c.v;
      const heat = chunk.reduce<Heat>((h, o) => (HEAT_RANK[o.heat] < HEAT_RANK[h] ? o.heat : h), "yellow");
      const why = `${chunk[0].c.v.s.name}: ${chunk[0].why}`; // regroup() words it from who is in it
      tasks.push({
        key: `e:${bookKey(v0)}:${chunk.map((o) => o.c.v.s._id).sort().join(",")}`,
        job: "evaluation",
        to: null,
        swap: false,
        freeIn: 0,
        unit: v0.unit,
        stage: v0.stage === "fighter" || v0.stage === "master" ? v0.stage : null,
        section: null,
        sectionTitle: null,
        who: chunk.map((o) => ({ v: o.c.v, qs: [...o.c.qs], whole: false, red: o.red, heat: o.heat, why: o.why })),
        shared: sh,
        heat,
        why,
        ahead: false,
      });
    }
  }
  return tasks;
}

/** Why a Theory lesson is due, in a few words. */
function lessonWhy(l: Lesson, go: Member[]): string {
  const noWork = go.find((m) => m.outIn === 0);
  if (noWork) return `${noWork.v.s.name}: no work${noWork.wait >= 60_000 ? ` ${mShort(noWork.wait)}` : ""}`;
  const big = l.shared[0];
  if (big && big.n >= GROUP_N) return `${big.n} need Q${big.q}`;
  if (l.starving && l.longest) return `${l.longest.v.s.name} waited ${mShort((l.longest.waited ?? 0) || l.longest.wait)}`;
  const soon = go.filter((m) => m.urgent).length;
  return soon ? `${soon} run out soon` : "taught ahead";
}

function memberWhy(m: Member): string {
  if (m.outIn === 0) return m.wait >= 60_000 ? `no work ${mShort(m.wait)}` : "no work";
  if (m.waited !== undefined && m.waited >= 60_000) return `waited ${mShort(m.waited)}`;
  if (m.outIn !== null) return `out ~${mShort(Math.max(60_000, m.outIn))}`;
  return "";
}

function theoryTask(l: Lesson, go: Member[], ahead: boolean): SendTask {
  return {
    key: `t:${l.key}:${go.map((m) => m.v.s._id).sort().join(",")}`,
    job: "theory",
    to: null,
    swap: false,
    freeIn: 0,
    unit: l.unit,
    stage: l.kind === "section" ? "fighter" : "master",
    section: l.section?.id ?? null,
    sectionTitle: l.section?.tamil ?? null,
    who: go.map((m) => ({
      v: m.v,
      qs: l.kind === "section" ? m.teach : m.qs,
      whole: m.whole,
      red: m.outIn === 0,
      heat: (m.outIn === 0 ? "red" : !ahead && (m.urgent || l.starving) ? "orange" : "yellow") as Heat,
      why: memberWhy(m),
    })),
    shared: l.kind === "section" ? [] : l.shared,
    heat: go.some((m) => m.outIn === 0) ? "red" : ahead ? "yellow" : "orange",
    why: ahead ? `ahead: ${lessonWhy(l, go)}` : lessonWhy(l, go),
    ahead,
  };
}

/**
 * A group's colour, shared questions and words from the students it has now (a more urgent group may have taken one
 * of them: "Fathima: no work" must not head a group without Fathima).
 */
export function regroup(t: SendTask): SendTask {
  const heat = t.who.reduce<Heat>((h, w) => (HEAT_RANK[w.heat] < HEAT_RANK[h] ? w.heat : h), "yellow");
  const n = new Map<number, number>();
  if (!t.section) for (const w of t.who) for (const q of w.qs) n.set(q, (n.get(q) ?? 0) + 1);
  const shared = [...n]
    .filter(([, k]) => k >= 2)
    .map(([q, k]) => ({ q, n: k }))
    .sort((a, b) => b.n - a.n || a.q - b.q);
  const red = t.who.find((w) => w.red);
  const lead = t.who[0];
  const big = shared[0] && shared[0].n >= GROUP_N ? shared[0] : null;
  const says = (w: Who) => (w.why.startsWith("stuck: ") ? `${w.v.s.name} stuck on ${w.why.slice(7)}` : `${w.v.s.name}: ${w.why}`);
  const words = red
    ? says(red)
    : big
      ? `${big.n} ${t.job === "theory" ? "need" : "lost"} ${qLabel(lead.v, big.q)}`
      : lead.why
        ? says(lead)
        : t.why;
  return { ...t, heat, shared, why: t.ahead ? `ahead · ${words}` : words };
}

const redCount = (t: SendTask) => t.who.filter((w) => w.red).length;

// ---------------- Teachers ----------------

/** The calls one teacher has now (requested or sent). */
function callsOf(board: Board, id: string) {
  return board.calls.filter((c) => c.teacherId === id && (c.status === "requested" || c.status === "sent"));
}

function personOf(t: Teacher, board: Board, views: View[], now: number, lessonMs: number, away: boolean): PersonCard {
  const mine = { ...board, calls: callsOf(board, t.id) } as Board;
  const ev = evalRoom(mine, views, now, t.id);
  const theory = roomLessons(mine, views, now, t.id);
  const coming = [...ev.coming, ...theory.flatMap((l) => l.coming)];
  const starts = [
    ...ev.here.map((h) => h.rc.c.arrivedAt ?? h.rc.c.sentAt ?? h.rc.c.createdAt),
    ...theory.flatMap((l) => (l.since !== null ? [l.since] : [])),
  ];
  const since = starts.length ? Math.min(...starts) : null;
  let leftMs: number | null = null;
  let over = false;
  if (since !== null) {
    // Each question once for everyone with her; a theory lesson its usual length.
    const qs = new Set(ev.here.flatMap((h) => h.qs.map((q) => `${bookKey(h.v)}:${q}`)));
    const teach = ev.here.filter((h) => h.kind === "theory").length ? lessonMs : 0;
    const need = Math.max(qs.size * Q_MS + teach, theory.some((l) => l.here.length) ? lessonMs : 0, Q_MS);
    const spent = now - since;
    leftMs = Math.max(0, need - spent);
    over = spent > need + 2 * 60_000;
  }
  return { t, away, evalHere: ev.here, theory: theory.filter((l) => l.here.length), coming, since, leftMs, over, next: null };
}

const busy = (p: PersonCard) => p.since !== null || p.coming.length > 0;

// ---------------- The plan ----------------

/** What the manager does now: the teachers, the groups to send (worst first), who waits on purpose, what can't be solved. */
export function managerPlan(board: Board, views: View[], now: number, team: readonly Teacher[], o: PlanOpts): ManagerPlan {
  const inClass = views.filter((v) => v.where !== "absent");
  const away = o.away ?? new Set<string>();

  // Teachers here today, and anyone who still has students with her.
  const known = new Map(team.map((t) => [t.id, t]));
  for (const c of board.calls) {
    if ((c.status === "requested" || c.status === "sent") && c.teacherId && !known.has(c.teacherId)) {
      known.set(c.teacherId, { id: c.teacherId, name: c.teacher ?? "Teacher", jobs: [c.room] });
    }
  }
  const people = [...known.values()]
    .map((t) => personOf(t, board, views, now, o.lessonMs, away.has(t.id)))
    .filter((p) => !p.away || busy(p));

  // Evaluation: everyone with lost marks or wrong answers (not with a teacher, not Theory's), held or sent.
  const pace = classPace(views);
  const cands = candidates(views, now, pace).filter((c) => !c.hold);
  const shares = shareCounts(cands);
  const decided = cands.map((c) => ({ c, d: holdOf(c, shares, views, now, o.force?.has(c.v.key), pace) }));
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
    x.d.send ? [] : [{ key: `h:${x.c.v.key}`, v: x.c.v, job: "evaluation" as Job, qs: [...x.c.qs], why: x.d.why, sendBy: x.d.sendBy }],
  );

  // Theory: the lessons the Theory page would plan (no work and soon first; a workbook question waits 20 minutes).
  const lessons = planLessons(views, now, { lessonMs: o.lessonMs, startInMs: 0 });
  const due: SendTask[] = [];
  const ahead: SendTask[] = [];
  for (const l of lessons) {
    const can = l.members.filter((m) => !m.hold);
    if (!can.length) continue;
    const forced = can.filter((m) => o.force?.has(m.v.key));
    const big = l.shared.some((s) => s.n >= GROUP_N);
    if (l.starving || l.frees > 0 || big || forced.length) {
      due.push(theoryTask(l, can.slice(0, LESSON_CAP), false));
    } else if (l.kind === "workbook") {
      // The hold rule for Theory too: workbook questions wait for more who need them (20 minutes at most).
      for (const m of can) {
        const waited = m.waited ?? 0;
        held.push({ key: `h:t:${m.v.key}`, v: m.v, job: "theory", qs: m.qs, why: "Theory: waits for more", sendBy: now + Math.max(0, WAIT_MS - waited) });
      }
    } else ahead.push(theoryTask(l, can.slice(0, LESSON_CAP), true)); // a section: a free Theory teacher can teach it ahead
  }

  // A theory-book student with no work gets work from Theory, not from Evaluation: his wrong answers wait until after
  // the lesson (the app's rule: theory comes first). A workbook student with no work is best explained now (his levels
  // wait for Correction; nothing else would give him work).
  const theoryFirst = new Map<string, string>();
  for (const t of due) for (const w of t.who) if (w.red && w.v.st?.needs.includes("theory")) theoryFirst.set(w.v.s._id, t.section ?? "");
  for (let i = out.length - 1; i >= 0; i--) {
    const sec = theoryFirst.get(out[i].c.v.s._id);
    if (sec === undefined) continue;
    const c = out[i].c;
    held.push({ key: `h:${c.v.key}`, v: c.v, job: "evaluation", qs: [...c.qs], why: `Theory${sec ? ` ${sec}` : ""} first: it gives work`, sendBy: null });
    out.splice(i, 1);
  }

  // One list, worst first: the most with no work, then the biggest groups, Theory first (theory comes first in the
  // app). A student goes to one place: the most urgent group that has him.
  const order = (a: SendTask, b: SendTask) =>
    HEAT_RANK[a.heat] - HEAT_RANK[b.heat] ||
    redCount(b) - redCount(a) ||
    b.who.length - a.who.length ||
    Number(b.job === "theory") - Number(a.job === "theory");
  const tasks = [...evalTasks(out), ...due]
    .map(regroup)
    .filter((t) => !o.snoozed?.has(t.key))
    .sort(order);
  const taken = new Set<string>();
  const once = (t: SendTask): SendTask | null => {
    const who = t.who.filter((w) => !taken.has(w.v.s._id));
    if (!who.length) return null;
    for (const w of who) taken.add(w.v.s._id);
    return who.length === t.who.length ? t : regroup({ ...t, who });
  };
  const list = tasks
    .map(once)
    .filter((t): t is SendTask => t !== null)
    .sort(order);

  // Who takes each group: a free teacher of that job, else a free one of the other job (his swap), else the one who is
  // free soonest (busy now, or given a group just above): one waiting group each.
  const here = people.filter((p) => !p.away);
  const freeNow = here.filter((p) => !busy(p));
  const eta = new Map(here.map((p) => [p.t.id, busy(p) ? (p.leftMs ?? 0) : 0]));
  const taskMs = (t: SendTask) => (t.job === "theory" ? o.lessonMs : Math.max(Q_MS, new Set(t.who.flatMap((w) => w.qs)).size * Q_MS));
  const queued = new Set<string>();
  const assign = (t: SendTask): SendTask => {
    const free = freeNow.find((p) => p.t.jobs.includes(t.job)) ?? freeNow[0];
    if (free) {
      freeNow.splice(freeNow.indexOf(free), 1);
      eta.set(free.t.id, taskMs(t));
      return { ...t, to: free.t, swap: !free.t.jobs.includes(t.job), freeIn: 0 };
    }
    const later = here
      .filter((p) => !queued.has(p.t.id))
      .sort((a, b) => Number(b.t.jobs.includes(t.job)) - Number(a.t.jobs.includes(t.job)) || (eta.get(a.t.id) ?? 0) - (eta.get(b.t.id) ?? 0))[0];
    if (later) {
      queued.add(later.t.id);
      return { ...t, to: later.t, swap: !later.t.jobs.includes(t.job), freeIn: eta.get(later.t.id) ?? 0 };
    }
    return t;
  };
  const assigned = list.map(assign);
  // A free teacher with nothing to do: Theory can teach the next lesson ahead.
  for (const a of ahead) {
    if (!freeNow.length) break;
    const t = once(regroup(a));
    if (t) assigned.push(assign(t));
  }
  for (const p of people) p.next = assigned.find((t) => t.to?.id === p.t.id) ?? null;

  // Correction: levels handed in and waiting; red = he has nothing else to do until it's corrected.
  const waits: Waiting[] = [];
  for (const v of withBooks(inClass)) for (const l of v.ms?.waiting ?? []) waits.push({ v, n: l.n, since: v.mm.lv[String(l.n)]?.done ?? now });
  waits.sort((a, b) => a.since - b.since);
  const red = waits.filter((w) => w.v.where === "hall" && (w.v.home ?? w.v).noWork && !!w.v.ms?.needs.includes("correction"));
  const correction: CorrectionNow = { levels: waits.length, oldest: waits[0] ?? null, red };

  // What the app can't solve: finished his book with nothing else given; no book in the app (on paper).
  const stuck: Stuck[] = [];
  const offApp: View[] = [];
  for (const v of inClass) {
    if (v.where !== "hall" || v.calls.length) continue;
    if (v.kind === "none") offApp.push(v);
    else if ((v.st?.finished || v.ms?.finished) && v.otherWork.length === 0) {
      stuck.push({ key: `s:${v.key}`, v, why: `finished ${v.unit?.code ?? "his book"}: give him the next one`, move: true });
    }
  }
  if (!here.length && (list.length || held.length)) {
    stuck.unshift({ key: "s:nobody", v: inClass[0], why: "No Theory or Evaluation teacher here today", move: false });
  }

  const quiet = inClass.filter((v) => v.where === "hall" && v.quiet && !v.calls.length);

  return {
    people,
    tasks: assigned,
    held: held.sort((a, b) => (a.sendBy ?? Infinity) - (b.sendBy ?? Infinity)),
    stuck,
    correction,
    quiet,
    offApp,
    repeats: repeatsOf(views, now),
    noTeachers: here.length === 0,
  };
}

// ---------------- Repeats ----------------

/**
 * The same question explained (or taught) more than once today, at separate times: what holding was meant to save.
 * "G8 U01 Q3 ×3". Most first.
 */
export function repeatsOf(views: readonly View[], now: number): Repeat[] {
  const today = slDay(now);
  const times = new Map<string, { label: string; ts: number[] }>();
  const add = (v: View, q: number, t: number | undefined) => {
    if (t === undefined || slDay(t) !== today) return;
    const key = `${bookKey(v)}:${q}`;
    const e = times.get(key) ?? { label: `${v.unit ? `${v.unit.grade === 12 ? "OL" : v.unit.grade} ${v.unit.code}` : "?"} ${qLabel(v, q)}`, ts: [] };
    e.ts.push(t);
    times.set(key, e);
  };
  for (const v of withBooks([...views])) {
    if (v.ms) for (const [q, r] of Object.entries(v.mm.q)) add(v, Number(q), r.x ?? r.tt);
    if (v.st) for (const [q, m] of Object.entries(v.marks)) if (m?.s === "explained") add(v, Number(q), m.t);
  }
  const out: Repeat[] = [];
  for (const [key, e] of times) {
    const ts = e.ts.sort((a, b) => a - b);
    let n = ts.length ? 1 : 0;
    for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > REPEAT_GAP_MS) n++;
    if (n >= 2) out.push({ key, label: e.label, times: n });
  }
  return out.sort((a, b) => b.times - a.times || a.label.localeCompare(b.label, undefined, { numeric: true }));
}

// ---------------- Back ----------------

export type FinishItem = { callId: string; explained?: number[]; reteach?: string; taught?: number[]; skip?: number[] };

/** Back, everything done: Evaluation explained all his questions; Theory taught the lesson. */
export function backAll(p: PersonCard): FinishItem[] {
  const items: FinishItem[] = [];
  for (const h of p.evalHere) {
    if (h.kind === "theory") items.push({ callId: h.rc.c._id });
    else {
      const plan = finishPlan(h, {}, true);
      items.push({ callId: h.rc.c._id, explained: plan.explained, ...(plan.reteach ? { reteach: plan.reteach } : {}) });
    }
  }
  for (const l of p.theory) for (const st of l.here) items.push({ callId: st.rc.c._id });
  return items;
}

/** One student's Back from Evaluation, question by question: explained, to Theory, or not now (stays waiting). */
export function backEval(h: EvalHere, dec: Record<number, Decision | undefined>): { item: FinishItem; theoryQs: number[] } {
  const p = finishPlan(h, dec, true);
  return { item: { callId: h.rc.c._id, explained: p.explained, ...(p.reteach ? { reteach: p.reteach } : {}) }, theoryQs: p.theoryQs };
}

/**
 * One student's Back from Theory: the questions taught (the rest stay his, so the lesson comes back). Workbook: all
 * taught = the call alone; some = those first (`workbook.taught`), then the call with nothing more.
 */
export function backTheory(
  l: RoomLesson,
  v: View,
  callId: string,
  taught: ReadonlySet<number>,
  wholeTaught: boolean,
): { item: FinishItem; workbookTaught: number[] } {
  if (l.kind === "section") return { item: { callId, taught: teachLeft(v, l.section).filter((q) => taught.has(q)), skip: [] }, workbookTaught: [] };
  const qs = v.ms ? [...v.ms.theory] : [];
  const whole = !!v.ms?.wholeUnit;
  const done = workbookDone(qs, whole, new Set(qs.filter((q) => taught.has(q))), whole && wholeTaught);
  return done.all ? { item: { callId }, workbookTaught: [] } : { item: { callId, taught: [] }, workbookTaught: done.taught };
}

// ---------------- Words ----------------

/** "13 · 17", "D", "All": a student's questions as the manager says them. */
export function qsWords(t: Pick<SendTask, "job" | "section">, w: Pick<Who, "v" | "qs" | "whole">): string[] {
  if (t.job === "theory" && t.section) return [t.section];
  const qs = w.qs.map((q) => qLabel(w.v, q).replace(/^Q/, ""));
  return w.whole ? [...qs, "All"] : qs;
}

/** "G8 U01", "OL U13": the book of a group. */
export function bookWords(unit: Unit | null, v: View): string {
  const g = unit?.grade ?? v.s.grade;
  return `${g === 12 ? "OL" : g} ${unit?.code ?? ""}`.trim();
}
