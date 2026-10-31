// The Theory page's rules (src/theoryFocus.tsx draws them). Plain functions: the tests run them on fake classes.
//
// A lesson is what Theory teaches a group at once: a theory-book section (G11 U13 · D) or a workbook's questions sent
// to Theory (G7 U08). The page is ONE screen (31 Oct 2026, his voice note: "the theory page also same like" the
// Evaluation page): grade → Fighter/Master/Legend → unit → lesson (a section; a workbook's questions the same students
// need, or the whole unit), each the most urgent first and already picked; her room as a box of pills (6 at most) with
// Call, Arrived and Done; what to teach as squares, one at a time, Taught for everyone with her who needs it.
//
// "Most useful" (agreed with the founder, 2026-10-29), in minutes, not questions:
// - each theory-book student's pace comes from his own marks (else the class's, else 4 min a question), so the page
//   knows when he runs out of work ("out in 3m");
// - a lesson is worth the students it gives work to who are out of work now, or will be before Theory is free again
//   (6 at most in a lesson); a workbook question waiting 20 minutes counts like a student out of work;
// - nobody starves: anyone out of work 20 minutes (a workbook question 40) puts his lesson first;
// - nobody is ticked for a lesson he can't practise before he goes home (arrival + 2 hours);
// - how long a lesson takes is learnt from Theory's own Done taps (12 minutes to start with).
// Students in Evaluation, or called by Evaluation, are listed but not ticked: calling them takes them from her.

import type { SectionData } from "../convex/lib/book";
import { slClock } from "../convex/lib/day";
import type { MarkState, Urgency } from "../convex/lib/status";
import { roomCalls, seenToday, theoryGroups, type RoomCall, type View } from "./derive";
import { roomBooksOf, roomRows, type RoomBook, type RowPick } from "./roomRows";
import type { Board, Unit } from "./store";

export type LessonKind = "section" | "workbook";

/** Students in one lesson, at most (the founder's number, 2026-10-29). */
export const LESSON_CAP = 6;
/** How long a lesson takes until Theory's own Done taps say otherwise. */
export const LESSON_MS = 12 * 60_000;
/** One theory-book question, until his marks (or the class's) say otherwise. */
export const PACE_MS = 4 * 60_000;
/** A workbook question waiting this long counts like a student out of work; out of work this long = starving. */
export const WAIT_MS = 20 * 60_000;
/** Called but not sent this long: red on Theory's phone too. */
export const LATE_SEND_MS = 3 * 60_000;
/** A visit: he goes home at arrival + 2 hours. */
export const STAY_MS = 2 * 60 * 60_000;
/** A longer gap between two answers is a break (or another day), not one question. */
const BREAK_MS = 25 * 60_000;
/** Answers marked this close together were marked at once (a page of his notebook). */
const BATCH_MS = 30_000;

/** "6m" (whole minutes). */
export const mShort = (ms: number) => `${Math.max(0, Math.floor(ms / 60_000))}m`;

const union = (lists: number[][]) => [...new Set(lists.flat())].sort((a, b) => a - b);

/** A theory-book student's teach questions of this section not taught (or skipped) yet. */
export function teachLeft(v: View, section: SectionData | null): number[] {
  if (!section) return [];
  return section.teach.filter((q) => {
    const s = v.marks[String(q)]?.s;
    return s !== "taught" && s !== "skip";
  });
}

// ---------------- Pace: minutes a question ----------------

const ANSWERED: ReadonlySet<MarkState> = new Set(["right", "wrong", "slip"]);

/**
 * How long one theory-book question takes him, from the times of his answers, newest first (about the last 8).
 * Answers marked together share the time since the answers before them; a lesson in between (a section taught) or a
 * break of 25+ minutes starts again. Null with fewer than 3 answers to go on.
 */
export function paceOf(v: View): number | null {
  if (!v.f) return null;
  const teach = new Set(v.f.sections.flatMap((s) => s.teach));
  const events = Object.entries(v.marks)
    .flatMap(([q, m]) => (m ? [{ q: Number(q), s: m.s, t: m.t }] : []))
    .sort((a, b) => a.t - b.t);
  const batches: { last: number; k: number; afterLesson: boolean }[] = [];
  let lesson = false;
  for (const e of events) {
    if (teach.has(e.q)) {
      if (e.s === "taught") lesson = true;
      continue;
    }
    if (!ANSWERED.has(e.s)) continue;
    const b = batches[batches.length - 1];
    if (b && !lesson && e.t - b.last < BATCH_MS) {
      b.last = e.t;
      b.k++;
    } else batches.push({ last: e.t, k: 1, afterLesson: lesson });
    lesson = false;
  }
  let time = 0;
  let n = 0;
  for (let i = batches.length - 1; i > 0 && n < 8; i--) {
    const gap = batches[i].last - batches[i - 1].last;
    if (batches[i].afterLesson || gap > BREAK_MS) continue;
    time += gap;
    n += batches[i].k;
  }
  if (n < 3) return null;
  return Math.min(20 * 60_000, Math.max(60_000, time / n));
}

/** The class's usual pace: the middle of the students' own paces, else 4 min. */
export function classPace(views: View[]): number {
  const ps = views
    .filter((v) => v.where !== "absent")
    .map(paceOf)
    .filter((p): p is number => p !== null)
    .sort((a, b) => a - b);
  if (ps.length === 0) return PACE_MS;
  const mid = Math.floor(ps.length / 2);
  return ps.length % 2 ? ps[mid] : (ps[mid - 1] + ps[mid]) / 2;
}

/** How long Theory's lessons take: the middle of the recent ones (3–40 min), else 12 min. */
export function lessonLength(ms: number[] | undefined): number {
  const xs = (ms ?? []).filter((d) => d >= 3 * 60_000 && d <= 40 * 60_000).sort((a, b) => a - b);
  if (xs.length < 3) return LESSON_MS;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

// ---------------- Who needs a lesson ----------------

/** Why a student is listed but not ticked. */
export type Hold = "evaluation" | "evalCalled" | "home";

export type Member = {
  v: View;
  /** red = no work now; amber = runs out before Theory is free again, or a workbook question waited 20 min; green = later. */
  urgency: Urgency;
  hold?: Hold;
  /** When he runs out of work, from now (0 = out of work now); null = not soon, or not known (workbooks). */
  outIn: number | null;
  /** Workbook: how long his questions have waited for Theory. */
  waited?: number;
  /** When he goes home (arrival + 2 hours), if known. */
  homeAt?: number;
  /** Counts for the lesson: out of work now or before Theory is free again, or a workbook question waited 20 min. */
  urgent: boolean;
  /** How long he has waited, for "nobody starves": out of work, or a workbook question beyond its 20 minutes. */
  wait: number;
  /** Workbook: the questions sent to Theory (not taught yet), and whether the whole unit was asked. */
  qs: number[];
  whole: boolean;
  /** Section: its teach questions he still needs (all of them, unless an earlier lesson stopped part way). */
  teach: number[];
  /** Theory already had him today: those not seen yet go first (fair turns). */
  seen: boolean;
};

export type Lesson = {
  /** `${unitId}:${section}`, or `${unitId}:R` for a workbook: the same key a call's lesson has (lessonKey). */
  key: string;
  kind: LessonKind;
  unit: Unit | null;
  section: SectionData | null;
  /** "U13 D", "U08 workbook". */
  label: string;
  /** Who needs it, in the order they are ticked: out of work first, then the soonest out; held ones last. */
  members: Member[];
  /** Workbook: questions two or more of them need (teach once for all), most shared first. */
  shared: { q: number; n: number }[];
  /** Section: the teach questions any of them still needs. */
  teach: number[];
  /** How many who need it now it gives work to (6 at most). */
  frees: number;
  /** Someone who can come has waited 20 minutes or more: this lesson first. */
  starving: boolean;
  /** The one who has waited longest, of those who need it now. */
  longest: Member | null;
  /** The soonest anyone who can come runs out of work (ms from now), if known. */
  firstOut: number | null;
};

export type PlanOpts = {
  /** How long a lesson takes (learnt). */
  lessonMs: number;
  /** Until Theory can start the next lesson (0 when the room is free). */
  startInMs: number;
};

/**
 * When he runs out of work, from now: 0 = out of work now; null = finished, or not known (a workbook student still on a
 * level). A theory-book student is on one question now (since his last mark), then the rest, at his own pace.
 */
export function outInOf(v0: View, now: number, pace: number): number | null {
  // His work is on his book now (another book of his has its own view): out of work only when every book is blocked.
  const v = v0.home ?? v0;
  if (v.noWork) return 0;
  if (v.st) {
    if (v.st.dry || v.st.finished) return null;
    const own = paceOf(v) ?? pace;
    const since = Math.max(0, now - (v.s.lastActivityAt ?? now));
    return (v.st.left - 1) * own + Math.max(own / 4, own - since);
  }
  return null;
}

function memberOf(v: View, inEvaluation: boolean, section: SectionData | null, now: number, pace: number, horizon: number): Member {
  const own = paceOf(v.home ?? v) ?? pace;
  const outIn = outInOf(v, now, pace);
  let waited: number | undefined;
  if (v.ms) {
    const times = v.ms.theory.map((q) => v.mm.q[String(q)]?.th).filter((t): t is number => t !== undefined);
    if (v.mm.reteach) times.push(v.mm.reteach.at);
    if (times.length) waited = Math.max(0, now - Math.min(...times));
  }
  const homeAt = v.s.lastInAt !== undefined ? v.s.lastInAt + STAY_MS : undefined;
  // Goes home before he could do one question after this lesson.
  const leaving = homeAt !== undefined && homeAt > now && homeAt - (now + horizon) < own;
  const hold: Hold | undefined = inEvaluation ? "evaluation" : v.calledTo === "evaluation" ? "evalCalled" : leaving ? "home" : undefined;
  const outNow = outIn === 0;
  const longWait = (waited ?? 0) >= WAIT_MS;
  const urgent = !hold && (outNow || (outIn !== null && outIn <= horizon) || longWait);
  return {
    v,
    urgency: outNow ? "red" : urgent || longWait ? "amber" : "green",
    hold,
    outIn,
    waited,
    homeAt,
    urgent,
    wait: outNow ? (v.idleMs ?? 0) : waited !== undefined ? Math.max(0, waited - WAIT_MS) : 0,
    qs: v.ms ? [...v.ms.theory] : [],
    whole: !!v.ms?.wholeUnit,
    teach: teachLeft(v, section),
    seen: seenToday(v, "theory", now),
  };
}

function memberOrder(a: Member, b: Member): number {
  return (
    Number(!!a.hold) - Number(!!b.hold) ||
    Number(b.outIn === 0) - Number(a.outIn === 0) ||
    Number(a.seen) - Number(b.seen) ||
    b.wait - a.wait ||
    Number(b.urgent) - Number(a.urgent) ||
    (a.outIn ?? Infinity) - (b.outIn ?? Infinity) ||
    (b.waited ?? 0) - (a.waited ?? 0) ||
    a.v.s.name.localeCompare(b.v.s.name)
  );
}

const canCome = (l: Lesson) => l.members.filter((m) => !m.hold).length;

function lessonOrder(a: Lesson, b: Lesson): number {
  const wa = a.longest?.wait ?? 0;
  const wb = b.longest?.wait ?? 0;
  return (
    Number(b.starving) - Number(a.starving) ||
    (a.starving && b.starving ? wb - wa : 0) ||
    b.frees - a.frees ||
    wb - wa ||
    (a.firstOut ?? Infinity) - (b.firstOut ?? Infinity) ||
    canCome(b) - canCome(a) ||
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
}

/**
 * Every lesson someone needs, most useful first (see the top of this file). One card per section or workbook; a
 * student is in one lesson only (his next section, or his workbook's questions).
 */
export function planLessons(views: View[], now: number, o: PlanOpts): Lesson[] {
  const pace = classPace(views);
  const horizon = o.startInMs + o.lessonMs;
  const out: Lesson[] = [];
  for (const g of theoryGroups(views)) {
    if (g.q !== undefined) continue; // the per-question chips repeat a workbook's students: the card shows them
    const members = g.members.map((m) => memberOf(m.v, m.inEvaluation, g.section, now, pace, horizon)).sort(memberOrder);
    const count = new Map<number, number>();
    if (!g.section) for (const m of members) for (const q of m.qs) count.set(q, (count.get(q) ?? 0) + 1);
    const shared = [...count]
      .filter(([, n]) => n >= 2)
      .map(([q, n]) => ({ q, n }))
      .sort((a, b) => b.n - a.n || a.q - b.q);
    const callable = members.filter((m) => !m.hold);
    const urgent = callable.filter((m) => m.urgent);
    out.push({
      key: g.key.replace(/:Q\d+$/, ":R"),
      kind: g.section ? "section" : "workbook",
      unit: g.unit,
      section: g.section,
      label: g.label,
      members,
      shared,
      teach: union(members.map((m) => m.teach)),
      frees: Math.min(LESSON_CAP, urgent.length),
      starving: callable.some((m) => m.wait >= WAIT_MS),
      longest: urgent.reduce<Member | null>((a, m) => (!a || m.wait > a.wait ? m : a), null),
      firstOut: callable.reduce<number | null>((a, m) => (m.outIn === null ? a : a === null ? m.outIn : Math.min(a, m.outIn)), null),
    });
  }
  return out.sort(lessonOrder);
}

/** Who a lesson ticks for the call: everyone who can come, in order, 6 at most. */
export function defaultTicks(l: Lesson, cap = LESSON_CAP): string[] {
  return l.members
    .filter((m) => !m.hold)
    .slice(0, cap)
    .map((m) => m.v.s._id);
}

/** A student's state in a few words, for the teacher: why he is on this list. */
export function memberWords(m: Member): string {
  if (m.hold === "evaluation") return "in Eval";
  if (m.hold === "evalCalled") return "Eval called";
  if (m.hold === "home" && m.homeAt !== undefined) return `home ${slClock(m.homeAt)}`;
  if (m.outIn === 0) return m.wait >= 60_000 ? `no work ${mShort(m.wait)}` : "no work";
  if (m.waited !== undefined && m.waited >= 60_000) return `waited ${mShort(m.waited)}`;
  // The facts, so the teacher can judge (he knows who is slow): questions left, and when the page thinks he runs out.
  if (m.outIn !== null && m.outIn <= 30 * 60_000) {
    const out = `out ~${mShort(Math.max(60_000, m.outIn))}`;
    return m.v.st ? `${m.v.st.left} left · ${out}` : out;
  }
  return m.v.st && !m.v.st.finished ? `${m.v.st.left} left` : "working";
}

/** The founder's colours for a count: red = very urgent (no work now), orange = soon, yellow = not urgent yet. */
export type Heat = "red" | "orange" | "yellow";
export type HeatCount = { red: number; orange: number; yellow: number; total: number };

/** Nothing waiting (Legend has no books in the app yet). */
export const NO_HEAT: HeatCount = { red: 0, orange: 0, yellow: 0, total: 0 };

/**
 * The most urgent first (31 Oct 2026, his rule: the order follows the situation): most red, then most waiting; ties
 * keep the given order (grade 6 to 11; Fighter, Master, Legend), so a pill moves only when the class changes.
 */
export function byUrgency<T extends { c: HeatCount }>(items: T[]): T[] {
  return items
    .map((it, i) => ({ it, i }))
    .sort((a, b) => b.it.c.red - a.it.c.red || b.it.c.total - a.it.c.total || a.i - b.i)
    .map((x) => x.it);
}
export const heatOf = (m: Member): Heat => (m.urgency === "red" ? "red" : m.urgency === "amber" ? "orange" : "yellow");

/** How many need Theory, by book (theory book = Fighter, workbook = Master) and colour; each student once. */
export function kindCounts(plan: Lesson[]): Record<"all" | LessonKind, HeatCount> {
  const zero = (): HeatCount => ({ red: 0, orange: 0, yellow: 0, total: 0 });
  const out = { all: zero(), section: zero(), workbook: zero() };
  const seen = new Set<string>();
  for (const l of plan)
    for (const m of l.members) {
      if (seen.has(m.v.s._id)) continue;
      seen.add(m.v.s._id);
      for (const c of [out.all, out[l.kind]]) {
        c[heatOf(m)]++;
        c.total++;
      }
    }
  return out;
}

/** A lesson's students by colour (the lesson pill's numbers). */
export function lessonHeat(l: Lesson): HeatCount {
  const c: HeatCount = { red: 0, orange: 0, yellow: 0, total: 0 };
  for (const m of l.members) {
    c[heatOf(m)]++;
    c.total++;
  }
  return c;
}

/** Why this lesson is where it is, in one line: "3 need it now · Fathima: no work 6m". */
export function whyWords(l: Lesson): string {
  const w = l.longest;
  const who =
    w && (w.outIn === 0 ? w.wait : (w.waited ?? 0)) >= 60_000
      ? ` · ${w.v.s.name}: ${w.outIn === 0 ? `no work ${mShort(w.wait)}` : `waited ${mShort(w.waited ?? 0)}`}`
      : "";
  if (l.frees > 0) return `${l.frees} need${l.frees === 1 ? "s" : ""} it now${who}`;
  if (canCome(l) === 0) return "Nobody can come now";
  return l.firstOut !== null ? `Teach ahead · first out in ${mShort(Math.max(60_000, l.firstOut))}` : "Teach ahead";
}

/** The Theory badge: students out of work who need Theory and aren't in Evaluation (not called yet). */
export function redCount(plan: Lesson[]): number {
  const ids = new Set<string>();
  for (const l of plan) for (const m of l.members) if (m.outIn === 0 && m.hold !== "evaluation") ids.add(m.v.s._id);
  return ids.size;
}

// ---------------- The room ----------------

/** The lesson a theory call is about: the same key a plan's lesson has. */
export function lessonKey(c: { unitId?: string; section?: string; studentId: string }, v?: View): string {
  return `${c.unitId ?? v?.s.unitId ?? "?"}:${c.section ?? "R"}`;
}

export type RoomStudent = { rc: RoomCall; v: View; qs: number[]; whole: boolean; teach: number[] };
export type RoomLesson = {
  key: string;
  kind: LessonKind;
  unit: Unit | null;
  section: SectionData | null;
  /** With Theory now (Arrived; calls from before 30 Oct 2026: sent), first come first. */
  here: RoomStudent[];
  /** Called and not there yet: not sent yet, walking there (sent, not Arrived), or finishing in Evaluation first. */
  coming: RoomCall[];
  /** When the first of them arrived; null while nobody is here yet. */
  since: number | null;
  /** Someone has been here 20 minutes or more ("Still with you?"). */
  long: boolean;
  /** Section: the teach questions anyone here still needs (while nobody is here yet: those on the way). */
  teach: number[];
};

/** Theory's lessons now: one per lesson, with who is here and who is on the way. Lessons going on first. */
export function roomLessons(board: Board, views: View[], now: number, me?: string | null): RoomLesson[] {
  const calls = roomCalls(board, views, "theory", now, me).filter((rc) => rc.c.kind === "theory");
  const lessons = new Map<string, RoomLesson>();
  for (const rc of calls) {
    const v = rc.v;
    const key = lessonKey(rc.c, v);
    const section = rc.c.section && rc.c.section !== "R" && v?.f ? (v.f.sectionById(rc.c.section) ?? null) : null;
    const l: RoomLesson = lessons.get(key) ?? {
      key,
      kind: rc.c.section && rc.c.section !== "R" ? "section" : "workbook",
      unit: v?.unit ?? null,
      section,
      here: [],
      coming: [],
      since: null,
      long: false,
      teach: [],
    };
    if (!l.section && section) l.section = section;
    if (!l.unit && v?.unit) l.unit = v.unit;
    if (rc.c.status === "sent" && v && !rc.walking) {
      l.here.push({ rc, v, qs: v.ms ? [...v.ms.theory] : [], whole: !!v.ms?.wholeUnit, teach: teachLeft(v, section) });
      const t = rc.c.arrivedAt ?? rc.c.sentAt ?? rc.c.createdAt;
      l.since = l.since === null ? t : Math.min(l.since, t);
      l.long = l.long || rc.long;
    } else if (rc.c.status === "requested" || rc.walking) l.coming.push(rc);
    lessons.set(key, l);
  }
  const arrived = (st: RoomStudent) => st.rc.c.arrivedAt ?? st.rc.c.sentAt ?? st.rc.c.createdAt;
  const called = (l: RoomLesson) => Math.min(...[...l.here.map((st) => st.rc.c.createdAt), ...l.coming.map((rc) => rc.c.createdAt)]);
  for (const l of lessons.values()) {
    l.here.sort((a, b) => arrived(a) - arrived(b) || a.v.s.name.localeCompare(b.v.s.name));
    // What to teach: for those here; while nobody is here yet, for those on the way (to get ready).
    l.teach = l.here.length
      ? union(l.here.map((st) => st.teach))
      : union(l.coming.map((rc) => (rc.v ? teachLeft(rc.v, l.section) : [])));
  }
  return [...lessons.values()].sort((a, b) => (a.since ?? Infinity) - (b.since ?? Infinity) || called(a) - called(b));
}

/** Until Theory can start another lesson: what is left of the one going on (2 min at least), a lesson if one is on the way. */
export function startIn(room: RoomLesson[], lessonMs: number, now: number): number {
  const going = room.filter((l) => l.since !== null);
  if (going.length) return Math.max(2 * 60_000, lessonMs - (now - Math.min(...going.map((l) => l.since!))));
  return room.length ? lessonMs : 0;
}

/** Room left in a lesson going on (6 at most in a lesson). */
export function roomLeft(l: RoomLesson): number {
  return Math.max(0, LESSON_CAP - l.here.length - l.coming.length);
}

/** Students who need this lesson now (out of work, or soon) and can come: they can join it while there's room. */
export function joiners(l: RoomLesson, plan: Lesson[]): Member[] {
  const left = roomLeft(l);
  if (left === 0) return [];
  return (plan.find((p) => p.key === l.key)?.members ?? []).filter((m) => !m.hold && m.urgent).slice(0, left);
}

/** Next and Soon: every lesson to plan, except one going on that still has room (its students join it instead). */
// (Used by the tests: the one screen offers the picked lesson's students instead.)
export function toPlan(plan: Lesson[], room: RoomLesson[]): Lesson[] {
  const going = new Map(room.map((l) => [l.key, l]));
  return plan.filter((p) => {
    const r = going.get(p.key);
    return !r || roomLeft(r) === 0;
  });
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

// ---------------- The pills (30 Oct 2026) ----------------

/** The line under a lesson's pill: red = someone has no work now (or starves), amber = soon; none = later. */
export function pillTone(l: Lesson): "red" | "amber" | null {
  const h = lessonHeat(l);
  return l.starving || h.red ? "red" : h.orange ? "amber" : null;
}

/** What moves a pill: its colour, starving, and how many need it. */
const pillSig = (l: Lesson) => `${l.starving ? "s" : ""}${pillTone(l) ?? "-"}${l.members.length}`;

/** After her last touch on the pills, they keep their places this long. */
export const HOLD_MS = 5000;

export type PillOrder = { keys: string[]; sig: Record<string, string> };

/**
 * The pills' order: the page's ranking, the most useful lesson first (the founder, 30 Oct 2026), held still while
 * nothing real changes, so a pill never slides away as minutes pass. It ranks again when a lesson comes or goes or a
 * lesson's colour or count changes. While she touches the row (`hold`), places stay and new lessons go at the end;
 * the ranking catches up once she lets go.
 */
export function nextOrder(prev: PillOrder | null, plan: Lesson[], hold: boolean): PillOrder {
  return holdOrder(
    prev,
    plan.map((l) => ({ key: l.key, sig: pillSig(l) })),
    hold,
  );
}

/** nextOrder for any pills: `sig` = what moves a pill (its colour and count). */
export function holdOrder(prev: PillOrder | null, items: { key: string; sig: string }[], hold: boolean): PillOrder {
  const sig = Object.fromEntries(items.map((p) => [p.key, p.sig]));
  const ranked = items.map((p) => p.key);
  if (!prev) return { keys: ranked, sig };
  const same = ranked.length === prev.keys.length && ranked.every((k) => prev.sig[k] === sig[k]);
  if (same) return { keys: prev.keys, sig };
  if (hold) {
    const kept = prev.keys.filter((k) => k in sig);
    // The old looks are kept, so the ranking runs again when she lets go.
    return {
      keys: [...kept, ...ranked.filter((k) => !kept.includes(k))],
      sig: Object.fromEntries(Object.entries(prev.sig).filter(([k]) => k in sig)),
    };
  }
  return { keys: ranked, sig };
}

// ---------------- Her room ----------------

/** here = with her; walking = Correction sent him; called = not sent yet; eval = finishing in Evaluation first. */
export type RoomState = "here" | "walking" | "called" | "eval";
export type RoomItem = { rc: RoomCall; lesson: RoomLesson; state: RoomState; id: string; name: string; late: boolean; st?: RoomStudent };

/**
 * Everyone she called, in the order she called them (nobody moves when he arrives: only his pill's look changes).
 * Late (red): sent and not there after 3 minutes, or Correction hasn't sent him for 3 minutes.
 */
export function roomItems(room: RoomLesson[], now: number): RoomItem[] {
  const out: RoomItem[] = [];
  for (const l of room) {
    for (const st of l.here) out.push({ rc: st.rc, lesson: l, state: "here", id: st.v.s._id, name: st.v.s.name, late: false, st });
    for (const rc of l.coming) {
      const state: RoomState = rc.walking ? "walking" : rc.c.pull ? "eval" : "called";
      const late = rc.walking ? rc.lost : state === "called" && now - rc.c.createdAt >= LATE_SEND_MS;
      out.push({ rc, lesson: l, state, id: rc.c.studentId, name: rc.v?.s.name ?? "?", late });
    }
  }
  return out.sort((a, b) => a.rc.c.createdAt - b.rc.c.createdAt || a.name.localeCompare(b.name));
}

/** " 4m" from a minute on ("on the way" just after Sent, never "0m"). */
export const sinceWords = (ms: number) => (ms >= 60_000 ? ` ${mShort(ms)}` : "");

/** The pill's words for where he is: "on the way 1m", "not here 4m", "called", "not sent 4m", "in Eval first", "with you 5m". */
export function roomWords(it: RoomItem, now: number): string {
  if (it.state === "walking") return it.late ? `not here ${mShort(it.rc.walkMs)}` : `on the way${sinceWords(it.rc.walkMs)}`;
  if (it.state === "called") return it.late ? `not sent ${mShort(now - it.rc.c.createdAt)}` : "called";
  if (it.state === "eval") return "in Eval first";
  return `with you${sinceWords(it.rc.minutes)}`;
}

// ---------------- One screen: grade → stage → unit → lesson (31 Oct 2026) ----------------

export const THEORY_GRADES = [6, 7, 8, 9, 10, 11];
/** Fighter (theory books), Master (workbooks), Legend (whole papers: no books in the app yet). */
export type TheoryStage = LessonKind | "legend";

/** A student's colour in the rows: held ones (in Evaluation, called by her, going home) count, but never as urgent. */
export const rowHeat = (m: Member): Heat => (m.hold ? "yellow" : heatOf(m));

/** How many need Theory in these lessons, each student once, by colour (the first lesson that has him decides). */
export function tallyLessons(lessons: readonly Lesson[]): HeatCount {
  const out = { ...NO_HEAT };
  const seen = new Set<string>();
  for (const l of lessons)
    for (const m of l.members) {
      if (seen.has(m.v.s._id)) continue;
      seen.add(m.v.s._id);
      out[rowHeat(m)]++;
      out.total++;
    }
  return out;
}

/** The grade a lesson's book belongs to. */
export const lessonGrade = (l: Lesson): number | undefined => l.unit?.grade ?? l.members[0]?.v.s.grade;

/** Grades 6 to 11, the most urgent first (ties: 6 first); a grade with nobody for Theory goes last. */
export function theoryGradeRow(plan: readonly Lesson[]): { grade: number; c: HeatCount }[] {
  return byUrgency(THEORY_GRADES.map((grade) => ({ grade, c: tallyLessons(plan.filter((l) => lessonGrade(l) === grade)) })));
}

/** Fighter / Master / Legend in one grade, the most urgent first (Legend: no books yet). */
export function theoryStageRow(plan: readonly Lesson[]): { id: TheoryStage; label: string; c: HeatCount }[] {
  return byUrgency<{ id: TheoryStage; label: string; c: HeatCount }>([
    { id: "section", label: "Fighter", c: tallyLessons(plan.filter((l) => l.kind === "section")) },
    { id: "workbook", label: "Master", c: tallyLessons(plan.filter((l) => l.kind === "workbook")) },
    { id: "legend", label: "Legend", c: NO_HEAT },
  ]);
}

export type TheoryUnit = { key: string; unit: Unit; c: HeatCount; lessons: Lesson[] };

/** The books of one grade and stage that need Theory: the most urgent first, then by unit number. */
export function theoryUnitRow(plan: readonly Lesson[]): TheoryUnit[] {
  const by = new Map<string, TheoryUnit>();
  for (const l of plan) {
    if (!l.unit) continue;
    const u = by.get(l.unit._id) ?? { key: l.unit._id as string, unit: l.unit, c: NO_HEAT, lessons: [] };
    u.lessons.push(l);
    by.set(u.key, u);
  }
  const units = [...by.values()]
    .map((u) => ({ ...u, c: tallyLessons(u.lessons) }))
    .sort((a, b) => a.unit.code.localeCompare(b.unit.code, undefined, { numeric: true }));
  return byUrgency(units).filter((u) => u.c.total > 0);
}

/**
 * A pill of the lessons row: a theory book's section (its teach questions), or a workbook's questions sent to Theory
 * that exactly the same students need ("13 · 17"), or the whole unit again.
 */
export type LessonPill = {
  key: string;
  lesson: Lesson;
  /** "D", "13 · 17", "Whole unit". */
  label: string;
  /** Section: the teach questions anyone of them needs; workbook: these questions. */
  qs: number[];
  whole: boolean;
  /** Who needs it, in the lesson's order (no work first). */
  members: Member[];
  /** The most urgent of them (held ones: yellow). */
  heat: Heat;
};

const HEAT_RANK: Record<Heat, number> = { red: 0, orange: 1, yellow: 2 };
const topHeat = (ms: readonly Member[]): Heat => ms.map(rowHeat).reduce<Heat>((h, x) => (HEAT_RANK[x] < HEAT_RANK[h] ? x : h), "yellow");

/**
 * One unit's lessons as pills. A theory book: its sections, the most useful first (planLessons). A workbook: its
 * questions for Theory grouped by the students who need them (the same students: one pill), the most urgent first,
 * then the most students, then the first question; the whole unit again after its colour's questions.
 */
export function lessonPills(u: TheoryUnit): LessonPill[] {
  const sections: LessonPill[] = [];
  const groups: LessonPill[] = [];
  for (const l of u.lessons) {
    if (l.kind === "section") {
      sections.push({ key: l.key, lesson: l, label: l.section?.id ?? "?", qs: l.teach, whole: false, members: l.members, heat: topHeat(l.members) });
      continue;
    }
    const byQ = new Map<number, Member[]>();
    for (const m of l.members) for (const q of m.qs) byQ.set(q, [...(byQ.get(q) ?? []), m]);
    const bySet = new Map<string, { qs: number[]; members: Member[] }>();
    for (const [q, ms] of [...byQ.entries()].sort((a, b) => a[0] - b[0])) {
      const who = ms.map((m) => m.v.key).sort().join(",");
      const g = bySet.get(who);
      if (g) g.qs.push(q);
      else bySet.set(who, { qs: [q], members: ms });
    }
    for (const g of bySet.values())
      groups.push({ key: `${l.key}:${g.qs.join(".")}`, lesson: l, label: g.qs.join(" · "), qs: g.qs, whole: false, members: g.members, heat: topHeat(g.members) });
    const whole = l.members.filter((m) => m.whole);
    if (whole.length) groups.push({ key: `${l.key}:whole`, lesson: l, label: "Whole unit", qs: [], whole: true, members: whole, heat: topHeat(whole) });
  }
  groups.sort(
    (a, b) =>
      HEAT_RANK[a.heat] - HEAT_RANK[b.heat] ||
      b.members.length - a.members.length ||
      Number(a.whole) - Number(b.whole) ||
      (a.qs[0] ?? 0) - (b.qs[0] ?? 0),
  );
  return [...sections, ...groups];
}

/** What moves a lesson pill (its colour and how many need it): the row holds still otherwise (holdOrder). */
export const lessonPillSig = (p: LessonPill) => `${p.heat}${p.members.length}${p.lesson.starving ? "s" : ""}`;

// ---------------- Her room on one screen: what to teach, one square at a time ----------------

/** "whole" = the whole unit again (a workbook's whole-unit request). */
export type TQ = number | "whole";
/** What she decided for a question: taught, or not reached (the bell rang first: it stays his). */
export type TDecision = "t" | "n";
export type TDecisions = Record<string, Record<string, TDecision | undefined>>;

/** His book's key (student:unit:stage): decisions are per book. */
export const itemKey = (it: RoomItem): string => (it.st?.v ?? it.rc.v)?.key ?? it.id;

/** What he needs taught in her room: the section's teach questions he still needs; his workbook's questions for Theory and the whole unit. */
export function needsOf(it: RoomItem): TQ[] {
  const v = it.st?.v ?? it.rc.v;
  if (!v) return [];
  if (it.lesson.kind === "section") return teachLeft(v, it.lesson.section);
  return [...(v.ms?.theory ?? []), ...(v.ms?.wholeUnit ? (["whole"] as const) : [])];
}

/** One square: a question (or the whole unit) of one book, and who in her room needs it. */
export type TheorySquare = { key: string; q: TQ; kind: LessonKind; section: SectionData | null; unit: Unit | null; v: View; who: RoomItem[] };

/**
 * The questions to teach, each once for everyone who needs it: with her (Arrived); nobody here yet: those on the way
 * (to get ready); nobody called: the picked pill's (to prepare). The one most of them need first, then by unit and
 * question; the whole unit last.
 */
export function theorySquares(items: readonly RoomItem[], pill?: LessonPill | null): TheorySquare[] {
  const here = items.filter((it) => it.state === "here");
  const from = here.length ? here : items;
  const by = new Map<string, TheorySquare>();
  for (const it of from) {
    const v = it.st?.v ?? it.rc.v;
    if (!v) continue;
    const l = it.lesson;
    for (const q of needsOf(it)) {
      const key = `${l.unit?._id ?? v.unit?._id ?? "?"}:${l.kind === "section" ? (l.section?.id ?? "") : "W"}:${q}`;
      const sq = by.get(key) ?? { key, q, kind: l.kind, section: l.section, unit: l.unit ?? v.unit, v, who: [] };
      sq.who.push(it);
      by.set(key, sq);
    }
  }
  if (by.size === 0 && pill && pill.members.length) {
    const l = pill.lesson;
    const v = pill.members[0].v;
    const qs: TQ[] = [...pill.qs, ...(pill.whole ? (["whole"] as const) : [])];
    for (const q of qs) {
      const key = `${l.unit?._id ?? "?"}:${l.kind === "section" ? (l.section?.id ?? "") : "W"}:${q}`;
      by.set(key, { key, q, kind: l.kind, section: l.section, unit: l.unit, v, who: [] });
    }
  }
  // One lesson after another (the one with the most students first). A section's teach questions in the book's order
  // (they build on each other); a workbook's the most shared first (explain once for many), the whole unit last.
  const qn = (q: TQ) => (q === "whole" ? Infinity : q);
  const lessonOf = (x: TheorySquare) => x.key.slice(0, x.key.lastIndexOf(":"));
  const size = new Map<string, number>();
  for (const x of by.values()) size.set(lessonOf(x), Math.max(size.get(lessonOf(x)) ?? 0, x.who.length));
  return [...by.values()].sort(
    (a, b) =>
      (size.get(lessonOf(b)) ?? 0) - (size.get(lessonOf(a)) ?? 0) ||
      (a.unit?.code ?? "").localeCompare(b.unit?.code ?? "", undefined, { numeric: true }) ||
      lessonOf(a).localeCompare(lessonOf(b)) ||
      (a.kind === "workbook" ? b.who.length - a.who.length : 0) ||
      qn(a.q) - qn(b.q),
  );
}

/** The book a square on her screen is from, as the rows name it (no unit: not in the rows). */
export const theoryRoomBook = (x: TheorySquare): RoomBook<TheoryStage> | null => (x.unit ? { key: x.unit._id as string, grade: x.unit.grade, stage: x.kind } : null);

/**
 * The pinned rows (his screenshot, 31 Oct 2026: src/roomRows.ts): her pick while it has someone; else, with someone
 * in her room, the book of the question on her screen (`open`); else the most urgent. Her room's grade, stage and
 * unit are always there (`room` = marked; a unit nobody else waits for goes at the end of its row).
 */
export function theoryRows(pick: RowPick<TheoryStage>, plan: readonly Lesson[], roomSqs: readonly TheorySquare[], open: TheorySquare | undefined) {
  const inGradeOf = (g: number | null) => plan.filter((l) => lessonGrade(l) === g);
  const rows = roomRows<TheoryStage>({
    pick,
    room: roomBooksOf(roomSqs, open, theoryRoomBook),
    grades: theoryGradeRow(plan),
    stages: (g) => theoryStageRow(inGradeOf(g)),
    units: (g, s) => theoryUnitRow(inGradeOf(g).filter((l) => l.kind === s)).map((u) => u.key),
    rest: "workbook",
  });
  const inGrade = inGradeOf(rows.grade);
  const unitOf = new Map(roomSqs.flatMap((x) => (x.unit ? [[x.unit._id as string, x.unit] as const] : [])));
  const units: (TheoryUnit & { room: boolean })[] = [
    ...theoryUnitRow(inGrade.filter((l) => l.kind === rows.stage)),
    ...rows.roomOnly.flatMap((key) => {
      const unit = unitOf.get(key);
      return unit ? [{ key, unit, c: NO_HEAT, lessons: [] as Lesson[] }] : [];
    }),
  ].map((u) => ({ ...u, room: rows.roomUnits.has(u.key) }));
  return {
    ...rows,
    grades: theoryGradeRow(plan).map((x) => ({ ...x, room: rows.roomGrades.has(x.grade) })),
    stages: theoryStageRow(inGrade).map((x) => ({ ...x, room: rows.roomStages.has(x.id) })),
    units,
  };
}

/** His decisions (per book). */
export const decOf = (dec: TDecisions, it: RoomItem): Record<string, TDecision | undefined> => dec[itemKey(it)] ?? {};

/** Who with her still needs this square decided. */
export function tUndecided(sq: TheorySquare, dec: TDecisions): RoomItem[] {
  return sq.who.filter((it) => it.state === "here" && decOf(dec, it)[String(sq.q)] === undefined);
}

/** With her, and every question of his decided (or nothing left to teach): Done sends him back. */
export function tAllDecided(it: RoomItem, dec: TDecisions): boolean {
  if (it.state !== "here") return false;
  const d = decOf(dec, it);
  return needsOf(it).every((q) => d[String(q)] !== undefined);
}

/**
 * What Done sends for one student. A section: the teach questions marked taught (the rest stay his). A workbook:
 * workbookDone (everything taught = all; else the taught ones one by one, the rest stay for Theory). `all`: what she
 * didn't decide counts as taught ("All taught").
 */
export function theoryFinish(
  it: RoomItem,
  d: Record<string, TDecision | undefined>,
  all: boolean,
): { kind: "section"; taught: number[] } | { kind: "workbook"; done: ReturnType<typeof workbookDone> } {
  const taught = (q: TQ) => (d[String(q)] ?? (all ? "t" : undefined)) === "t";
  const v = it.st?.v ?? it.rc.v;
  if (it.lesson.kind === "section") return { kind: "section", taught: (v ? teachLeft(v, it.lesson.section) : []).filter(taught) };
  const qs = v?.ms ? [...v.ms.theory] : [];
  const whole = !!v?.ms?.wholeUnit;
  return { kind: "workbook", done: workbookDone(qs, whole, new Set(qs.filter(taught)), whole && taught("whole")) };
}

/** "2 taught · 1 not reached · 1 to do": what Done will do for him. */
export function tDecisionWords(it: RoomItem, d: Record<string, TDecision | undefined>): string {
  const qs = needsOf(it);
  const n = (x: TDecision) => qs.filter((q) => d[String(q)] === x).length;
  const open = qs.filter((q) => d[String(q)] === undefined).length;
  return [n("t") ? `${n("t")} taught` : "", n("n") ? `${n("n")} not reached` : "", open ? `${open} to do` : ""].filter(Boolean).join(" · ");
}
