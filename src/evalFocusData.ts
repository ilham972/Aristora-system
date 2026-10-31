// The Evaluation page's rules (src/evalFocus.tsx draws them). Plain functions: the tests run them on fake classes.
//
// Evaluation explains wrong answers (theory books) and lost marks (workbooks). One screen (31 Oct 2026, his voice
// note): grade → stage → unit → a group of questions the same students got wrong, each the most urgent first and
// picked; then her room (up to 6 with her, his number), the questions as squares and one question at a time with
// the answer: Explained counts for everyone with her who has it. Urgency: no work / stuck / stopped first (red), then
// ready (waited 10 minutes: orange), then later (yellow). The page picks; she can pick anything.

import { slClock } from "../convex/lib/day";
import { EVAL_READY_MS } from "../convex/lib/status";
import { evalQueue, pendingSince, roomBusy, roomCalls, type RoomCall, type View } from "./derive";
import { roomBooksOf, roomRows, type RoomBook, type RowPick } from "./roomRows";
import type { Board } from "./store";
import { byUrgency, LATE_SEND_MS, mShort, NO_HEAT, outInOf, sinceWords, type Heat, type HeatCount } from "./theoryFocusData";

/** Students with one Evaluation teacher at once, at most (his number: 3 on 29 Oct, 6 on 31 Oct for the room box). */
export const EVAL_CAP = 6;

export type EvalKind = "fighter" | "master";
export type EvalFilter = "all" | EvalKind;

/** Someone she could call: why he is on the list, and what he is doing meanwhile. */
export type Cand = {
  v: View;
  kind: EvalKind;
  heat: Heat;
  /** "no work 6m", "stuck: Q18", "stopped in C", "waited 14m", "ready in 4m". */
  why: string;
  /** What he is doing meanwhile, so she can judge if he runs out while she explains: "3 left · out ~8m", "on L4". */
  work: string;
  /** His questions waiting for her. */
  qs: number[];
  /** Since his oldest waiting question. */
  waited: number;
  /** Theory has him (called, or in the theory room): listed, not callable. */
  hold?: string;
};

/** "Q22", "2016" (a past paper: its year), "Q13": a question as his book prints it. */
export function qLabel(v: View, q: number): string {
  const s = v.f ? v.f.shortLabel(q) : String(q);
  return s === String(q) ? `Q${q}` : s;
}

/** What he is doing meanwhile, in a few words (on his book now; or another book of his when that one is blocked). */
export function workWords(v0: View, now: number, pace: number): string {
  const v = v0.home ?? v0;
  if (v.noWork) return v.idleMs !== undefined && v.idleMs >= 60_000 ? `no work ${mShort(v.idleMs)}` : "no work";
  if ((v.st?.dry || v.ms?.dry) && v.otherWork.length) return `on ${v.otherWork[0]}`;
  if (v.st) {
    if (v.st.finished) return "finished";
    const out = outInOf(v, now, pace);
    return out !== null && out <= 30 * 60_000 ? `${v.st.left} left · out ~${mShort(Math.max(60_000, out))}` : `${v.st.left} left`;
  }
  if (v.ms) return v.ms.current ? `on L${v.ms.current.n}` : "finished";
  return "";
}

/**
 * Everyone with something for Evaluation (not called by her yet), most urgent first: one entry per book (a student
 * with wrong answers in two books is listed twice; one book per call).
 */
export function candidates(views: View[], now: number, pace: number): Cand[] {
  return evalQueue(views, now).map((m) => {
    const v = m.v;
    const since = pendingSince(v);
    const waited = since === null ? 0 : Math.max(0, now - since);
    const idle = v.idleMs !== undefined && v.idleMs >= 60_000 ? ` ${mShort(v.idleMs)}` : "";
    let why: string;
    if (m.urgency === "red") {
      if (v.st?.stuck.length) why = `stuck: ${v.st.stuck.map((q) => qLabel(v, q)).join(" ")}`;
      else if (v.st?.blocked.length) why = `stopped in ${v.st.blocked[0]}`;
      else why = `no work${idle}`;
    } else if (m.urgency === "ready") why = `waited ${mShort(waited)}`;
    else why = `ready in ${Math.max(1, Math.ceil((m.readyInMs ?? EVAL_READY_MS) / 60_000))}m`;
    const work = workWords(v, now, pace);
    return {
      v,
      kind: v.kind === "master" ? "master" : "fighter",
      heat: m.urgency === "red" ? "red" : m.urgency === "ready" ? "orange" : "yellow",
      why,
      // "no work" twice says nothing: the second line then is empty.
      work: work.startsWith("no work") && why.startsWith("no work") ? "" : work,
      qs: [...v.pending],
      waited,
      hold: m.blockedBy,
    };
  });
}

/** How many wait for her, by book and colour; each student once. Held ones (with Theory) don't count. */
export function evalCounts(list: Cand[]): Record<EvalFilter, HeatCount> {
  const zero = (): HeatCount => ({ red: 0, orange: 0, yellow: 0, total: 0 });
  const out = { all: zero(), fighter: zero(), master: zero() };
  const counted = new Set<string>();
  for (const c of list) {
    if (c.hold || counted.has(c.v.s._id)) continue; // his most urgent book only (the list is in order)
    counted.add(c.v.s._id);
    for (const x of [out.all, out[c.kind]]) {
      x[c.heat]++;
      x.total++;
    }
  }
  return out;
}

export type SameGroup = { key: string; label: string; q: number; members: Cand[] };

/** The same question of the same book waiting for 2+ students she can call: explain it once to all of them. */
export function sameGroups(list: Cand[]): SameGroup[] {
  const by = new Map<string, SameGroup>();
  for (const c of list) {
    if (c.hold) continue;
    for (const q of c.qs) {
      const key = `${c.v.unit?._id ?? c.v.s.unitId}:${c.v.stage}:${q}`;
      const g = by.get(key) ?? { key, label: `${c.v.unit?.code ?? ""} ${qLabel(c.v, q)}`.trim(), q, members: [] };
      g.members.push(c);
      by.set(key, g);
    }
  }
  return [...by.values()].filter((g) => g.members.length >= 2).sort((a, b) => b.members.length - a.members.length || a.q - b.q);
}

/**
 * Who the page ticks for her: the most urgent she can call (no work, stuck, waited 10 min), as many as fit; one book
 * per student. Returns book keys (View.key).
 */
export function defaultEvalTicks(list: Cand[], left: number): string[] {
  const out: string[] = [];
  const who = new Set<string>();
  for (const c of list) {
    if (out.length >= Math.max(0, left)) break;
    if (c.hold || c.heat === "yellow" || who.has(c.v.s._id)) continue;
    who.add(c.v.s._id);
    out.push(c.v.key);
  }
  return out;
}

/** His other books with something for Evaluation (not this one): "keep him for U09" when she finishes this one. */
export function nextBooks(v: View): View[] {
  const home = v.home ?? v;
  return [home, ...home.others].filter((b) => b.key !== v.key && b.pending.length > 0);
}

// ---------------- The room ----------------

export type EvalHere = {
  rc: RoomCall;
  v: View;
  /** Explaining (his questions), or teaching theory because Theory was busy. */
  kind: "evaluation" | "theory";
  /** His questions waiting to be explained (evaluation). */
  qs: number[];
};

/** His questions for this call: in the book of this call only (never another book's numbers under this call). */
function hereOf(rc: RoomCall, v: View): EvalHere {
  const sameBook = !rc.c.unitId || (v.unit?._id === rc.c.unitId && (!rc.c.stage || v.stage === rc.c.stage));
  return { rc, v, kind: rc.c.kind, qs: rc.c.kind === "evaluation" && sameBook ? [...v.pending] : [] };
}

/**
 * Who is with her now (Arrived; calls from before 30 Oct 2026: sent), first come first, and who is on the way (called
 * and not sent yet, or sent and walking there).
 */
export function evalRoom(board: Board, views: View[], now: number, me?: string | null): { here: EvalHere[]; coming: RoomCall[] } {
  const calls = roomCalls(board, views, "evaluation", now, me);
  const here: EvalHere[] = [];
  const coming: RoomCall[] = [];
  for (const rc of calls) {
    if (rc.c.status === "sent" && rc.v && !rc.walking) here.push(hereOf(rc, rc.v));
    else if (rc.c.status === "requested" || rc.walking) coming.push(rc);
  }
  const at = (h: EvalHere) => h.rc.c.arrivedAt ?? h.rc.c.sentAt ?? h.rc.c.createdAt;
  here.sort((a, b) => at(a) - at(b));
  return { here, coming };
}

/** here = with her; walking = Correction sent him; called = not sent yet. */
export type EvalState = "here" | "walking" | "called";
export type EvalItem = { h: EvalHere; state: EvalState; id: string; name: string; late: boolean };

/**
 * Everyone she called, in the order she called them (nobody moves when he arrives: only his pill's look changes), each
 * with his questions. Late (red): sent and not there after 3 minutes, or Correction hasn't sent him for 3 minutes.
 */
export function evalItems(board: Board, views: View[], now: number, me?: string | null): EvalItem[] {
  return roomCalls(board, views, "evaluation", now, me).flatMap((rc) => {
    if (!rc.v) return [];
    const state: EvalState | null = rc.walking ? "walking" : rc.c.status === "sent" ? "here" : rc.c.status === "requested" ? "called" : null;
    if (!state) return [];
    const late = state === "walking" ? rc.lost : state === "called" && now - rc.c.createdAt >= LATE_SEND_MS;
    return [{ h: hereOf(rc, rc.v), state, id: rc.c.studentId as string, name: rc.v.s.name, late }];
  });
}

/** Where he is, in a few words: "on the way 1m", "not here 4m", "called", "not sent 4m", "with you 5m". */
export function evalWords(it: EvalItem, now: number): string {
  const rc = it.h.rc;
  if (it.state === "walking") return it.late ? `not here ${mShort(rc.walkMs)}` : `on the way${sinceWords(rc.walkMs)}`;
  if (it.state === "called") return it.late ? `not sent ${mShort(now - rc.c.createdAt)}` : "called";
  return `with you${sinceWords(rc.minutes)}`;
}

/** Room left: 3 at once, counting those on the way. */
export function evalLeft(room: { here: EvalHere[]; coming: RoomCall[] }): number {
  return Math.max(0, EVAL_CAP - room.here.length - room.coming.length);
}

/** Theory is busy and he has no work until he gets theory (and nothing to explain): she can teach it herself. */
export function canTeachHere(board: Board, v: View): boolean {
  if (v.where !== "hall" || v.calls.length > 0 || v.pending.length > 0) return false;
  if (!roomBusy(board, "theory")) return false;
  return !!(v.noWork && v.st?.needs.includes("theory")) || !!v.ms?.reteach;
}

// ---------------- Explaining, question by question ----------------

/** What she decided for one question: explained, needs theory, or not now (stays waiting). */
export type Decision = "x" | "th" | "skip";

/**
 * What Done sends for one student. `all`: every question she didn't decide counts as explained ("All explained").
 * Theory book: a question that needs theory is explained too (so he can redo it after the lesson) and its section
 * goes back to Theory's list (reteach). Workbook: those questions are sent to Theory (workbook.toTheory).
 */
export function finishPlan(
  h: { v: View; qs: number[] },
  dec: Record<number, Decision | undefined>,
  all: boolean,
): { explained: number[]; theoryQs: number[]; reteach?: string } {
  const pick = (q: number): Decision | undefined => dec[q] ?? (all ? "x" : undefined);
  const x = h.qs.filter((q) => pick(q) === "x");
  const th = h.qs.filter((q) => pick(q) === "th");
  if (h.v.f) {
    const sec = th.map((q) => h.v.f!.sections.find((s) => s.solo.includes(q))).find((s) => s && s.kind === "ladder" && s.teach.length > 0);
    return { explained: [...x, ...th].sort((a, b) => a - b), theoryQs: [], reteach: sec?.id };
  }
  return { explained: x, theoryQs: th };
}

/** "2 explained · 1 to Theory · 1 stays": what Done will do. */
export function decisionWords(h: { qs: number[] }, dec: Record<number, Decision | undefined>): string {
  const n = (d: Decision) => h.qs.filter((q) => dec[q] === d).length;
  const open = h.qs.filter((q) => dec[q] === undefined || dec[q] === "skip").length;
  return [
    n("x") ? `${n("x")} explained` : "",
    n("th") ? `${n("th")} to Theory` : "",
    open ? `${open} stay${open === 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** A workbook question's marks for her: "1/3", "?" (he couldn't start it), "lost". */
export function lostWords(v: View, q: number): string {
  const r = v.mm.q[String(q)];
  if (!r) return v.marks[String(q)]?.n && v.marks[String(q)]!.n! >= 2 ? "wrong twice" : "wrong";
  if (r.dk) return r.dkp?.length ? `${r.got ?? 0}/${r.max ?? "?"} · ? ${r.dkp.join(" ")}` : "?";
  return r.max !== undefined ? `${r.got ?? 0}/${r.max}` : "lost";
}

/** When he goes home (arrival + 2 hours): "home 5:10 PM", if within the next 30 minutes. */
export function homeSoon(v: View, now: number): string {
  const at = v.s.lastInAt !== undefined ? v.s.lastInAt + 2 * 60 * 60_000 : undefined;
  return at !== undefined && at > now && at - now <= 30 * 60_000 ? `home ${slClock(at)}` : "";
}

// ---------------- One screen: grade → stage → unit → questions (31 Oct 2026) ----------------

export const EVAL_GRADES = [6, 7, 8, 9, 10, 11];
export type EvalStage = EvalKind | "legend";

/** How many need her, by colour; each student once, held ones (with Theory) not counted. */
export function tally(list: readonly Cand[]): HeatCount {
  const out = { ...NO_HEAT };
  const seen = new Set<string>();
  for (const c of list) {
    if (c.hold || seen.has(c.v.s._id)) continue;
    seen.add(c.v.s._id);
    out[c.heat]++;
    out.total++;
  }
  return out;
}

/** The grade a book belongs to (his book's grade, else his own). */
export const bookGrade = (c: Cand) => c.v.unit?.grade ?? c.v.s.grade;
/** A book's key in the units row ("<unit>:<stage>"), for a student waiting or one in her room. */
export const bookKey = (v: View) => `${v.unit?._id ?? v.s.unitId}:${v.stage}`;

/** Grades 6 to 11, the most urgent first (ties: 6 first); a grade with nobody waiting goes last. */
export function gradeRow(list: readonly Cand[]): { grade: number; c: HeatCount }[] {
  return byUrgency(EVAL_GRADES.map((grade) => ({ grade, c: tally(list.filter((c) => bookGrade(c) === grade)) })));
}

/** Fighter / Master / Legend in one grade, the most urgent first (Legend: no books yet). */
export function stageRow(list: readonly Cand[]): { id: EvalStage; label: string; c: HeatCount }[] {
  return byUrgency<{ id: EvalStage; label: string; c: HeatCount }>([
    { id: "fighter", label: "Fighter", c: tally(list.filter((c) => c.kind === "fighter")) },
    { id: "master", label: "Master", c: tally(list.filter((c) => c.kind === "master")) },
    { id: "legend", label: "Legend", c: NO_HEAT },
  ]);
}

export type UnitPill = { key: string; unit: NonNullable<View["unit"]>; c: HeatCount; cands: Cand[] };

/** The books of one grade and stage with something for her: the most urgent first, then by unit number. */
export function unitRow(list: readonly Cand[]): UnitPill[] {
  const by = new Map<string, UnitPill>();
  for (const c of list) {
    const u = c.v.unit;
    if (!u) continue;
    const key = bookKey(c.v);
    const p = by.get(key) ?? { key, unit: u, c: NO_HEAT, cands: [] };
    p.cands.push(c);
    by.set(key, p);
  }
  const pills = [...by.values()]
    .map((p) => ({ ...p, c: tally(p.cands) }))
    .sort((a, b) => a.unit.code.localeCompare(b.unit.code, undefined, { numeric: true }));
  return byUrgency(pills).filter((p) => p.c.total > 0);
}

/** Questions the same students got wrong (one pill), the students, and the most urgent of them. */
export type QGroup = { key: string; qs: number[]; cands: Cand[]; heat: Heat };
const HEAT_RANK: Record<Heat, number> = { red: 0, orange: 1, yellow: 2 };

/**
 * One book's questions as pills: questions waiting for exactly the same students make one pill ("13 · 17": Raj and
 * Nila both lost marks on both). The most urgent students first, then the most students, then the first question.
 * Students with Theory (held) are left out: she can't call them.
 */
export function qGroups(cands: readonly Cand[]): QGroup[] {
  const callable = cands.filter((c) => !c.hold);
  const byQ = new Map<number, Cand[]>();
  for (const c of callable) for (const q of c.qs) byQ.set(q, [...(byQ.get(q) ?? []), c]);
  const bySet = new Map<string, QGroup>();
  for (const [q, cs] of [...byQ.entries()].sort((a, b) => a[0] - b[0])) {
    const who = cs.map((c) => c.v.key).sort().join(",");
    const g = bySet.get(who);
    if (g) g.qs.push(q);
    else bySet.set(who, { key: "", qs: [q], cands: cs, heat: cs.reduce<Heat>((h, c) => (HEAT_RANK[c.heat] < HEAT_RANK[h] ? c.heat : h), "yellow") });
  }
  return [...bySet.values()]
    .map((g) => ({ ...g, key: g.qs.join(".") }))
    .sort((a, b) => HEAT_RANK[a.heat] - HEAT_RANK[b.heat] || b.cands.length - a.cands.length || a.qs[0] - b.qs[0]);
}

/** One question of her session: the book, the students who need it, and how many of them she already did. */
export type SessionQ = { key: string; q: number; v: View; who: EvalHere[] };

/** The book a question on her screen is from, as the rows name it (no unit in the app: not in the rows). */
export const evalRoomBook = (x: SessionQ): RoomBook<EvalStage> | null =>
  x.v.unit ? { key: bookKey(x.v), grade: x.v.unit.grade, stage: x.v.kind === "master" ? "master" : "fighter" } : null;

/**
 * The pinned rows (his screenshot, 31 Oct 2026: src/roomRows.ts): her pick while it has someone; else, with someone
 * in her room, the book of the question on her screen (`open`); else the most urgent. Her room's grade, stage and
 * unit are always there (`room` = marked; a unit nobody else waits for goes at the end of its row).
 */
export function evalRows(pick: RowPick<EvalStage>, everyone: readonly Cand[], roomQs: readonly SessionQ[], open: SessionQ | undefined) {
  const inGradeOf = (g: number | null) => everyone.filter((c) => bookGrade(c) === g);
  const rows = roomRows<EvalStage>({
    pick,
    room: roomBooksOf(roomQs, open, evalRoomBook),
    grades: gradeRow(everyone),
    stages: (g) => stageRow(inGradeOf(g)),
    units: (g, s) => unitRow(inGradeOf(g).filter((c) => c.kind === s)).map((u) => u.key),
    rest: "master",
  });
  const inGrade = inGradeOf(rows.grade);
  const unitOf = new Map(roomQs.flatMap((x) => (x.v.unit ? [[bookKey(x.v), x.v.unit] as const] : [])));
  const units: (UnitPill & { room: boolean })[] = [
    ...unitRow(inGrade.filter((c) => c.kind === rows.stage)),
    ...rows.roomOnly.flatMap((key) => {
      const unit = unitOf.get(key);
      return unit ? [{ key, unit, c: NO_HEAT, cands: [] as Cand[] }] : [];
    }),
  ].map((u) => ({ ...u, room: rows.roomUnits.has(u.key) }));
  return {
    ...rows,
    grades: gradeRow(everyone).map((x) => ({ ...x, room: rows.roomGrades.has(x.grade) })),
    stages: stageRow(inGrade).map((x) => ({ ...x, room: rows.roomStages.has(x.id) })),
    units,
  };
}

/**
 * The questions to explain to the students with her (Arrived), each once: the one most of them need first (explain
 * once), then by question number. Nobody arrived yet: those on the way (to prepare). `extra`: questions to show
 * before anyone is called (the group she picked).
 */
export function sessionQs(here: readonly EvalHere[], coming: readonly EvalHere[], extra?: { v: View; qs: number[] }): SessionQ[] {
  const from = here.length ? here : coming;
  const by = new Map<string, SessionQ>();
  for (const h of from) {
    if (h.kind !== "evaluation") continue;
    for (const q of h.qs) {
      const key = `${h.v.unit?._id ?? h.v.s.unitId}:${q}`;
      const sq = by.get(key) ?? { key, q, v: h.v, who: [] };
      sq.who.push(h);
      by.set(key, sq);
    }
  }
  if (by.size === 0 && extra) {
    for (const q of extra.qs) {
      const key = `${extra.v.unit?._id ?? extra.v.s.unitId}:${q}`;
      by.set(key, { key, q, v: extra.v, who: [] });
    }
  }
  return [...by.values()].sort((a, b) => b.who.length - a.who.length || (a.v.unit?.code ?? "").localeCompare(b.v.unit?.code ?? "") || a.q - b.q);
}

/** Who with her still needs this question decided. */
export function undecided(sq: SessionQ, dec: Record<string, Record<number, Decision | undefined>>): EvalHere[] {
  return sq.who.filter((h) => (dec[h.v.key] ?? {})[sq.q] === undefined);
}

/** Every question of his decided (or nothing to explain): Done sends him back. */
export function allDecided(h: EvalHere, dec: Record<string, Record<number, Decision | undefined>>): boolean {
  return h.kind === "evaluation" && h.qs.every((q) => (dec[h.v.key] ?? {})[q] !== undefined);
}

