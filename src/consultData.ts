// The Consultation page's rules (5 Nov 2026, his voice note; the page: src/consult.tsx). Pure, tested in
// tests/consultData.test.ts.
// - The students here as pills, in his order: the most waiting for the picked kind first (Evaluation: questions to
//   explain; Theory: to teach), over all his books. A red ring = no work at all (sitting idle); pale = another teacher
//   called him or has him. Then everyone with nothing waiting (a check-in): the one not seen in a consultation for
//   longest first.
// - Today = the students here; All = every student (the server's consult.totals).
// - Her room: the students she called to herself (called, on the way, with her).
// - Their questions as squares, each once for everyone with her who has it: what still waits, and what this
//   consultation did (its square stays with ✓ / T), so nothing jumps under her finger while she works.

import { outOf } from "../convex/lib/book";
import { evalWaiting, inShow, theoryCount, theoryWaiting, toTeach, wrongAt, type ConsultKind, type EvalShow } from "../convex/lib/consult";
import { teachState } from "../convex/lib/master";
import type { Mark } from "../convex/lib/status";
import { roomCalls, type RoomCall, type View } from "./derive";
import { bookKey, qLabel } from "./evalFocusData";
import { bookId } from "./focusData";
import type { Board } from "./store";
import { LATE_SEND_MS, mShort, sinceWords } from "./theoryFocusData";

export type { ConsultKind, EvalShow };

/** One book of his with what waits there for the picked kind (`whole`: a workbook's whole unit asked for Theory;
 *  `drafting`: questions lost in a level Correction is marking now, not saved yet). */
export type BookWait = { v: View; qs: number[]; whole: boolean; drafting?: number[] };

/** A level Correction is marking now (`consult.drafts`): its marks per question so far. */
export type ConsultDraft = { studentId: string; unitId: string; level: number; q: Record<string, { g: number; dk?: boolean }> };

/**
 * The All | Past | Today filter on the wrong questions (12 Nov 2026): `day` = midnight in Sri Lanka today; `drafts` =
 * the levels being marked now (All and Today count them; null = not read).
 */
export type Show = { show: EvalShow; day: number; drafts: readonly ConsultDraft[] | null };

/** When this book's question was marked wrong (0 = not known: the past). */
const wrongWhen = (v: View, q: number) => wrongAt(q, v.marks, v.ms ? v.mm : null);

/**
 * The questions a workbook lost in a level Correction is marking now (not saved: a "?" or fewer marks than printed). A
 * question whose marks the book doesn't print counts only as "?".
 */
export function draftLost(v: View, drafts: readonly ConsultDraft[] | null | undefined): number[] {
  if (!drafts || !v.mb) return [];
  const unit = bookId(v);
  const out: number[] = [];
  for (const d of drafts) {
    if (d.studentId !== v.s._id || d.unitId !== unit || v.mm.lv[String(d.level)]?.fixed) continue;
    for (const [k, r] of Object.entries(d.q)) {
      const q = Number(k);
      const max = outOf(v.mb, q);
      if (r.dk || (max !== null && r.g < max)) out.push(q);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * A department's books only (8 Nov 2026): Fighter = theory books, Master = workbooks; none = every book (the page as
 * before).
 */
export type Scope = "fighter" | "master" | null;
export const inScope = (v: View, scope: Scope) => !scope || v.kind === scope;

/** What waits for the picked kind in each of his books (his book now, then the others with something). */
export function waitsOf(home: View, kind: ConsultKind, scope: Scope = null, show?: Show): BookWait[] {
  return [home, ...home.others].filter((v) => inScope(v, scope)).flatMap((v): BookWait[] => {
    if (kind === "evaluation") {
      const qs = show ? evalWaiting(v.st, v.ms).filter((q) => inShow(show.show, wrongWhen(v, q), show.day)) : [...evalWaiting(v.st, v.ms)];
      const drafting = show && show.show !== "past" ? draftLost(v, show.drafts) : [];
      return qs.length || drafting.length ? [{ v, qs, whole: false, ...(drafting.length ? { drafting } : {}) }] : [];
    }
    const w = theoryWaiting({ st: v.st, f: v.f, marks: v.marks, ms: v.ms, bookNow: !v.home });
    return w.qs.length || w.whole ? [{ v, ...w }] : [];
  });
}

/** How many things wait: questions, and a whole unit as one. */
export const countOf = (w: readonly BookWait[]) => w.reduce((n, b) => n + theoryCount(b) + (b.drafting?.length ?? 0), 0);

/** One student's pill. */
export type ConsultRow = {
  /** His main view (his book now, where he is). */
  v: View;
  /** What waits for the picked kind, all his books. */
  n: number;
  /** No work at all: he sits idle (a red ring). */
  red: boolean;
  /** Another teacher called him or has him: her name (pale, not callable). */
  busy: string | null;
  /** His last consultation's Done (the check-ins' order). */
  lastAt: number | null;
};

/** Another teacher's call on him (not one of this person's consultations): her name, else the room. */
function busyWith(v: View, me: string | null): string | null {
  const c = v.calls.find((x) => (x.status === "requested" || x.status === "sent") && !(x.consult && x.teacherId === me));
  if (c) return c.teacher ?? (c.room === "theory" ? "Theory" : "Evaluation");
  if (v.where === "theory" || v.where === "evaluation") return v.where === "theory" ? "Theory" : "Evaluation";
  return null;
}

/** Called to her own consultation (called, on the way or with her). */
export const isMineNow = (v: View, me: string | null) => v.calls.some((c) => c.consult && c.teacherId === me && (c.status === "requested" || c.status === "sent"));

/**
 * The students here, as pills, in his order (his voice note: "more questions wrong come first"): those she can call,
 * the most waiting first (ties: no work first, then the longest here, then A–Z); those another teacher has, after
 * them (pale); then everyone with nothing waiting, the one not seen in a consultation for longest first. Her own
 * consultation's students are in her room box, not here.
 */
export function consultRows(views: readonly View[], kind: ConsultKind, me: string | null, scope: Scope = null, redFirst = false, show?: Show): ConsultRow[] {
  const rows: ConsultRow[] = [];
  for (const v of views) {
    if (v.where === "absent" || isMineNow(v, me)) continue;
    // A department's page (8 Nov 2026): a student with no work counts as red only when his book is that department's.
    const n = countOf(waitsOf(v, kind, scope, show));
    rows.push({ v, n, red: v.noWork && (n > 0 || inScope(v, scope)), busy: busyWith(v, me), lastAt: v.s.consultAt ?? null });
  }
  const group = (r: ConsultRow) => (r.n > 0 ? (r.busy ? 1 : 0) : r.busy ? 3 : 2);
  return rows.sort(
    (a, b) =>
      group(a) - group(b) ||
      (group(a) < 2
        ? // The Fighter department's "No work" (8 Nov 2026): the students sitting idle first, then the most waiting.
          (redFirst ? Number(b.red) - Number(a.red) : 0) ||
          b.n - a.n ||
          Number(b.red) - Number(a.red) ||
          (a.v.s.lastInAt ?? 0) - (b.v.s.lastInAt ?? 0)
        : (a.lastAt ?? 0) - (b.lastAt ?? 0)) ||
      a.v.s.name.localeCompare(b.v.s.name),
  );
}

/** Today (the students here) or All: questions and students, and how many of those students have no work. */
export type Tally = { qs: number; students: number; red: number };

/** What waits for the picked kind among the students here (her own consultation's too: it is still to do). */
export function todayOf(views: readonly View[], kind: ConsultKind, scope: Scope = null, show?: Show): Tally {
  const t: Tally = { qs: 0, students: 0, red: 0 };
  for (const v of views) {
    if (v.where === "absent") continue;
    const n = countOf(waitsOf(v, kind, scope, show));
    if (!n) continue;
    t.qs += n;
    t.students++;
    if (v.noWork) t.red++;
  }
  return t;
}

/** A department's students here (8 Nov 2026, the owner's Fighter | Master bar): those with anything waiting for it, and
 *  how many of them sit with no work. */
export function deptTally(views: readonly View[], scope: "fighter" | "master"): { students: number; red: number } {
  let students = 0;
  let red = 0;
  for (const v of views) {
    if (v.where === "absent") continue;
    if (countOf(waitsOf(v, "evaluation", scope)) + countOf(waitsOf(v, "theory", scope)) === 0) continue;
    students++;
    if (v.noWork) red++;
  }
  return { students, red };
}

// ---------------- Her room ----------------

export type ConsultState = "here" | "walking" | "called";
/** A student she called to herself. `v` = his main view. */
export type ConsultItem = { rc: RoomCall; v: View; state: ConsultState; late: boolean; id: string; name: string };

/** Her consultation's students, in the order she called them (nobody moves when he arrives: only his pill's look). */
export function consultRoom(board: Board, views: View[], now: number, me: string | null): ConsultItem[] {
  if (!me) return [];
  return roomCalls(board, views, "evaluation", now, me).flatMap((rc): ConsultItem[] => {
    if (!rc.c.consult || rc.c.teacherId !== me || !rc.v) return [];
    const state: ConsultState | null = rc.walking ? "walking" : rc.c.status === "sent" ? "here" : rc.c.status === "requested" ? "called" : null;
    if (!state) return [];
    const late = state === "walking" ? rc.lost : state === "called" && now - rc.c.createdAt >= LATE_SEND_MS;
    const v = rc.v.home ?? rc.v;
    return [{ rc, v, state, late, id: rc.c.studentId as string, name: v.s.name }];
  });
}

/** Where he is, in a few words: "called", "not sent 4m", "on the way 1m", "not here 4m", "with you 5m". */
export function consultWords(it: ConsultItem, now: number): string {
  const rc = it.rc;
  if (it.state === "walking") return it.late ? `not here ${mShort(rc.walkMs)}` : `on the way${sinceWords(rc.walkMs)}`;
  if (it.state === "called") return it.late ? `not sent ${mShort(now - rc.c.createdAt)}` : "called";
  return `with you${sinceWords(rc.minutes)}`;
}

// ---------------- The questions ----------------

/**
 * One question's state for one student now. open = still waiting; x = explained, th = sent to Theory, tt = taught:
 * by this consultation; skip = Not now / Not reached (on this phone only: nothing is saved, it stays waiting).
 */
export type QState = "open" | "x" | "th" | "tt" | "skip";

/** What this phone keeps per consultation (per call, until it ends): Not now, and what a tap needs for its undo. */
export type Local = {
  /** Not now / Not reached, by question key. */
  skip?: Record<string, true>;
  /** A theory book's question sent to Theory here (its square says T: the server keeps only "explained"). */
  fth?: Record<string, true>;
  /** A theory book's circles before a tap (its undo puts them back exactly), by question key. */
  was?: Record<string, { q: number; mark: Mark | null }[]>;
  /** A workbook's whole-unit request before Taught (its undo puts it back), by book key. */
  wu?: Record<string, { at: number; by?: string }>;
};

/** A question's key on her screen: the book is in it (a unit can have a theory book AND a workbook, each with its Q22). */
export const qKey = (v: View, q: number) => `${bookKey(v)}:${q}`;
/** The whole unit's square (a workbook's whole-unit request for Theory). */
export const WHOLE = 0;

/**
 * His questions in one book for the picked kind, each with its state: what waits now, and what this consultation did
 * (since `since`, the call), so the square stays. Theory on a theory book: his next section's teacher questions (his
 * book now) and those taught here.
 */
export function bookQs(v: View, kind: ConsultKind, since: number, local: Local, show?: Show): { q: number; state: QState }[] {
  const out: { q: number; state: QState }[] = [];
  const skipped = (q: number) => !!local.skip?.[qKey(v, q)];
  // The filter hides a question still waiting that wasn't corrected in its time (what this consultation did stays).
  const shown = (q: number) => !show || inShow(show.show, wrongWhen(v, q), show.day);
  const add = (q: number, state: QState) => {
    if (state === "open" && kind === "evaluation" && !shown(q)) return;
    out.push({ q, state: state === "open" && skipped(q) ? "skip" : state });
  };
  if (v.ms) {
    for (const [k, r] of Object.entries(v.mm.q)) {
      const q = Number(k);
      const t = teachState(r);
      if (kind === "evaluation") {
        if (t === "eval") add(q, "open");
        else if (t === "explained" && r.x !== undefined && r.x >= since) add(q, "x");
        else if (t === "theory" && r.th !== undefined && r.th >= since) add(q, "th");
      } else if (t === "theory") add(q, "open");
      else if (t === "taught" && r.tt !== undefined && r.tt >= since) add(q, "tt");
    }
    if (kind === "theory") {
      if (v.mm.reteach) add(WHOLE, "open");
      else if (local.wu?.[bookKey(v)]) add(WHOLE, "tt");
    }
  } else if (v.st && v.f) {
    if (kind === "evaluation") {
      for (const sec of v.f.sections)
        for (const q of sec.solo) {
          const m = v.marks[String(q)];
          if (m?.s === "wrong") add(q, "open");
          else if (m?.s === "explained" && m.t >= since) add(q, local.fth?.[qKey(v, q)] ? "th" : "x");
        }
    } else {
      const next = !v.home && v.st.nextTheory ? v.f.sectionById(v.st.nextTheory) : undefined;
      const open = new Set(next ? next.teach.filter((q) => toTeach(v.marks, q)) : []);
      for (const sec of v.f.sections)
        for (const q of sec.teach) {
          const m = v.marks[String(q)];
          if (open.has(q)) add(q, "open");
          else if (m?.s === "taught" && m.t >= since) add(q, "tt");
        }
    }
  }
  return out.sort((a, b) => a.q - b.q);
}

/** One square: a question of one book, once for everyone with her who has it, each with his state. */
export type ConsultQ = {
  key: string;
  q: number;
  /** The book (the view of the first student who has it). */
  v: View;
  who: { it: ConsultItem; v: View; state: QState }[];
};

/**
 * Her squares: each question once for everyone with her who has it (nobody with her yet: those coming, to prepare; nobody
 * called: the students she ticked). The one most of them share first, then by book and number.
 */
export function consultQs(
  people: readonly { it: ConsultItem | null; v: View; since: number; local: Local }[],
  kind: ConsultKind,
  scope: Scope = null,
  show?: Show,
): ConsultQ[] {
  const by = new Map<string, ConsultQ>();
  for (const p of people) {
    for (const b of [p.v, ...p.v.others].filter((x) => inScope(x, scope))) {
      for (const x of bookQs(b, kind, p.since, p.local, show)) {
        const key = qKey(b, x.q);
        const sq = by.get(key) ?? { key, q: x.q, v: b, who: [] };
        if (p.it) sq.who.push({ it: p.it, v: b, state: x.state });
        by.set(key, sq);
      }
    }
  }
  return [...by.values()].sort(
    (a, b) =>
      b.who.length - a.who.length ||
      (a.v.unit?.code ?? "").localeCompare(b.v.unit?.code ?? "") ||
      String(a.v.stage).localeCompare(String(b.v.stage)) ||
      a.q - b.q,
  );
}

/** Who on this square still has it open (not decided here). */
export const openOn = (sq: ConsultQ) => sq.who.filter((w) => w.state === "open");

/** The square's look: every student's state the same (✓ / T / –), some done (amber), or nothing yet. */
export function squareLook(sq: ConsultQ): { cls: string; sign: string; words: string } {
  const ds = sq.who.map((w) => w.state);
  if (ds.length === 0 || ds.every((d) => d === "open")) return { cls: "", sign: "", words: "" };
  if (ds.some((d) => d === "open")) return { cls: " part", sign: "", words: "some done" };
  const one = ds.every((d) => d === ds[0]) ? ds[0] : null;
  if (one === "x") return { cls: " d-x", sign: "✓", words: "explained" };
  if (one === "tt") return { cls: " d-x", sign: "✓", words: "taught" };
  if (one === "th") return { cls: " d-th", sign: "T", words: "to Theory" };
  if (one === "skip") return { cls: " d-skip", sign: "–", words: "not now" };
  return { cls: " d-x", sign: "✓", words: "done" };
}

/** A square's name: "Q13", "2016", or "Whole unit". */
export const sqLabel = (sq: { q: number; v: View }) => (sq.q === WHOLE && sq.v.ms ? "Whole unit" : qLabel(sq.v, sq.q));

/** "Unit 1: 4 to explain · 1 to Theory": his books, for his file. */
export function bookLines(home: View, unitNo: (code: string) => number, drafts?: readonly ConsultDraft[] | null): string[] {
  return [home, ...home.others].flatMap((v) => {
    const e = evalWaiting(v.st, v.ms).length;
    const t = theoryCount(theoryWaiting({ st: v.st, f: v.f, marks: v.marks, ms: v.ms, bookNow: !v.home }));
    const d = draftLost(v, drafts).length;
    if (!e && !t && !d) return [];
    const name = v.unit ? `Unit ${unitNo(v.unit.code)}${v.kind === "fighter" ? " theory book" : ""}` : "His book";
    return [`${name}: ${[e ? `${e} to explain` : "", d ? `${d} being corrected` : "", t ? `${t} to teach` : ""].filter(Boolean).join(" · ")}`];
  });
}
