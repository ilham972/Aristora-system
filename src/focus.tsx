// The Correction page (it was called Focus; the code keeps that name): one person corrects, fast, without marks landing
// on the wrong question or the wrong student. It is the Correction job (same calls, same alerts) and saves exactly like
// the Class page's correct sheet, so Evaluation and Theory see nothing different. The rules and lists are in
// src/focusData.ts, the saving as you go in src/focusSave.ts.
//
// One page (30 Oct 2026, after a real class: students on different stages, units and levels). Every row is ONE line
// that scrolls sideways (src/hrow.tsx), so nothing below it ever moves:
// 1. Names on top: one grade at a time, + first (that grade's Attendance, full page), then tiny pills A–Z (the open
//    one dark, kept in view by itself). Under them the grades 6–11, always in the same places (no All), each with
//    "here/total" and what waits there. Tapping another name keeps every mark of the open paper (a level marked to
//    the end saves itself) and opens his. No Stop.
// 2. His paper: the name huge; his stage and unit (tap: Fighter or Master, then every unit of his grade by number and
//    Tamil name; one tap moves him); his card (Going home, Needs theory, Move and the marks table, as on Class).
// 3. Workbook (Master): the level bar (every level; tap an old one to check or change its marks). The level opens by
//    itself: one he was marking, else the oldest handed in, else the one he is on. One question at a time: number
//    huge, the key's answer, one tap each (the big button = what is shown, a number gives that, ? = blank; a Part II
//    question in parts: each part's marks, or ? for that part only). Save: the next level opens by itself; after the
//    last one, the unit's marks (to write on the marks sheet in his book).
// 4. Theory book (Fighter): the questions he can do now, in book order, one at a time: ✓ right, ✗ wrong, ↻ slip,
//    saved like the Class rows' circles (marks.setMany).
// 5. "Saved on this phone" (↶ after the grades): Take back within 30 minutes (a level: workbook.uncorrect, its marks then
//    wait for the right student; theory marks: put back as they were).

import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { PART_NAME, partOf, type MasterLevel } from "../convex/lib/book";
import { homeToCheck, levelWaits, teachState, type TeachState } from "../convex/lib/master";
import { slClock, slDate, slDay } from "../convex/lib/day";
import { claimLive, CLAIM_PING_MS, type Claim } from "../convex/lib/claims";
import { boldRuns, type KeyAnswer } from "../convex/lib/key";
import type { Mark, MarkState } from "../convex/lib/status";
import { termOf } from "../convex/lib/syllabus";
import { errorText, mutate } from "./backend";
import { Book } from "./board";
import { CallsBand } from "./correction";
import { fmtMin, tagOf, type View } from "./derive";
import {
  autoLevel,
  bookId,
  bookToOpen,
  heldOne,
  viewOfPaper,
  beforeOf,
  blankWords,
  CARRY_MS,
  carryLevel,
  draftOf,
  extendQueue,
  fighterQueue,
  focusGrade,
  focusNeeds,
  focusPills,
  fromDraft,
  gradeNeeds,
  itemsOf,
  levelLook,
  markedParts,
  marksOf,
  marksOfLevel,
  nextBook,
  nextIndex,
  nextOpen,
  nothingWhy,
  questionsOf,
  resumeAt,
  routeOf,
  sameGiven,
  savedGiven,
  sumOf,
  TAKE_BACK_MS,
  TAP_GUARD_MS,
  unitNo,
  type Before,
  type Carry,
  type Draft,
  type Given,
  type LevelLook,
  type Pill,
  booksOf,
} from "./focusData";
import { dropDraft, flushFocus, queueDraft, setFighterMark } from "./focusSave";
import { AttendanceSheet } from "./attendance";
import { gradesOf } from "./grades";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { MasterBook, TheorySheet } from "./master";
import { MoveSheet } from "./move";
import {
  act,
  allUnits,
  clearToasts,
  currentMe,
  currentRole,
  may,
  now as serverNow,
  savedMarks,
  stageName,
  STAGES,
  toast,
  unitOf,
  type Board,
  type Stage,
  type Unit,
} from "./store";
import { tone } from "./tones";
import { Empty, GRADES, Sheet } from "./ui";

// ---- What the page remembers while the app is open (switching pages and back keeps the open paper) ----

type MasterPaper = {
  kind: "master";
  studentId: string;
  unitId: string;
  level: number;
  given: Record<number, Given>;
  /** A Part II question's part marks, once he changed one (the big button then gives their sum). */
  parts: Record<number, number[]>;
  /** A Part II question's parts marked "?" (left blank), by name, before its mark is given. */
  blanks: Record<number, string[]>;
  /** The question on screen (its place in the level); the number of questions = the level's summary. */
  at: number;
  to: "auto" | "evaluation" | "theory";
  /** The marks came from a paper taken back from this student. */
  carriedFrom?: string;
  /** Marks given before (a draft) when it opened: how many, and when. */
  resumed?: { count: number; at: number };
  /** The drafts were known when the level opened (else they are loaded as soon as they arrive). */
  checked?: boolean;
  /** Save tapped and not answered yet (its own correction arriving is not "corrected meanwhile"). */
  saving?: boolean;
  /** A corrected level opened again: its saved marks. Changes stay on this phone until "Save changes". */
  remark?: Record<number, Given>;
};

type FighterPaper = {
  kind: "fighter";
  studentId: string;
  unitId: string;
  /** His questions in book order (the ones he could do when it opened, and any that opened since). */
  qs: number[];
  /** The question on screen (its place in qs); qs.length = nothing more he can do now. */
  at: number;
  /** Each question's mark before this paper changed it (Take back puts these back). */
  base: Record<number, Mark | null>;
};

/** Every level of his workbook corrected (or done before the app): the unit's marks. */
type OverPaper = { kind: "over"; studentId: string; unitId: string };
/** No book in the app for his stage and unit (or Legend, Exam Sprint): choose his unit. */
type NonePaper = { kind: "none"; studentId: string; unitId: string | null; stage: string | null };
/** Moved to another stage or unit from here: opens there as soon as the board shows it. */
type WaitPaper = { kind: "wait"; studentId: string; unitId: string; stage: Stage };

type Paper = MasterPaper | FighterPaper | OverPaper | NonePaper | WaitPaper;

type SavedLevel = {
  kind: "level";
  id: number;
  studentId: string;
  name: string;
  unitId: string;
  tag: string;
  level: number;
  from: number;
  to: number;
  got: number;
  max: number;
  given: Record<number, Given>;
  parts: Record<number, number[]>;
  before: Before;
  /** Server time just after the save. */
  at: number;
  back?: boolean;
};
type SavedMarks = {
  kind: "marks";
  id: number;
  studentId: string;
  name: string;
  unitId: string;
  tag: string;
  /** What this paper set, and what each question was before. */
  items: { q: number; s: MarkState | null }[];
  prev: { q: number; mark: Mark | null }[];
  labels: string[];
  at: number;
  back?: boolean;
};
type Saved = SavedLevel | SavedMarks;

const SAVED_KEY = "aristora.focus.saved";

/** The last saves on this phone survive a reload of the page (Chrome may reload a tab left in the background). */
function loadSaved(): Saved[] {
  try {
    const raw = sessionStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as Saved[]) : [];
    if (!Array.isArray(list)) return [];
    // Saves from before theory books were in Focus have no kind: they are levels.
    return list
      .filter((s) => s && typeof s.studentId === "string")
      .map((s) => ((s as { kind?: string }).kind ? s : ({ ...(s as object), kind: "level" } as SavedLevel)));
  } catch {
    return [];
  }
}
function keepSaved() {
  try {
    sessionStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    /* private mode or full: the list still works until the page reloads */
  }
}

let openPaper: Paper | null = null;
let saved: Saved[] = loadSaved();
let carry: Carry | null = null;
let savedIds = saved.reduce((a, s) => Math.max(a, s.id), 0);
let latestViews: View[] = [];
let latestDrafts: Draft[] | undefined;
let latestClaims: Claim[] | undefined;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function setPaper(p: Paper | null) {
  openPaper = p;
  holdFor(p);
  emit();
}

// ---- One corrector per book (31 Oct 2026) ----
// Each corrector's paper is her own (switching books never moves him for anyone else). The book her paper is on is
// claimed on the server while it is open, so another corrector can't mark it at the same time: she asks for it.

type Ask = { studentId: string; unitId: string; who: string; name: string; tag: string; state: "held" | "asked" | "kept" };
/** The book this phone has claimed (one at a time). */
let holding: { studentId: string; unitId: string } | null = null;
/** A name tapped whose book another corrector has open: the sheet that asks her for it. */
let asking: Ask | null = null;
const meId = () => (currentMe()?._id as string | undefined) ?? null;
const markable = (p: Paper | null): p is MasterPaper | FighterPaper => !!p && (p.kind === "master" || p.kind === "fighter");
const ids = (h: { studentId: string; unitId: string }) => ({
  studentId: h.studentId as Id<"students">,
  unitId: h.unitId as Id<"units">,
  by: currentRole(),
});
const bookWords = (studentId: string, unitId: string) => {
  const v = viewOfPaper(latestViews, { studentId, unitId });
  const u = unitOf(unitId);
  return { name: v?.s.name ?? "his", tag: u ? `Unit ${unitNo(u.code)}` : "book" };
};

/** The book this phone works on is claimed; the one it left is free again. */
function holdFor(p: Paper | null) {
  const want = markable(p) ? { studentId: p.studentId, unitId: p.unitId } : null;
  if (want && holding && want.studentId === holding.studentId && want.unitId === holding.unitId) return;
  const was = holding;
  holding = want;
  if (was) void mutate(api.focus.release, ids(was)).catch(() => {});
  if (want) void claimBook(want);
}

async function claimBook(want: { studentId: string; unitId: string }) {
  try {
    const r = await mutate(api.focus.claim, ids(want));
    if (holding !== want) return;
    const { name, tag } = bookWords(want.studentId, want.unitId);
    if (!r.ok) {
      // Another corrector opened it a moment before: hers. This phone offers to ask her.
      holding = null;
      if (markable(openPaper) && openPaper.studentId === want.studentId && openPaper.unitId === want.unitId) openPaper = null;
      asking = { ...want, who: r.by ?? "Another corrector", name, tag, state: "held" };
      emit();
    } else if (r.took) {
      toast(`${r.took}'s phone was quiet for a minute: ${name}'s ${tag} is yours now.`);
    }
  } catch {
    /* no signal: the next "still here" tries again */
  }
}

/** Her book went to another corrector (given, or taken while her phone was quiet): her paper closes, marks kept. */
function lostBook(h: { studentId: string; unitId: string }, by: string | null) {
  holding = null;
  const { name, tag } = bookWords(h.studentId, h.unitId);
  if (markable(openPaper) && openPaper.studentId === h.studentId && openPaper.unitId === h.unitId) {
    void flushFocus();
    openPaper = null;
  }
  emit();
  toast(`${by ?? "Another corrector"} has ${name}'s ${tag} now. Your marks were kept.`);
}

/** "Still here" every 20 s while the Correction page is on screen (a locked phone stops: after a minute it is free). */
async function stillHere() {
  const h = holding;
  if (!h || document.visibilityState !== "visible") return;
  try {
    const r = await mutate(api.focus.claim, { ...ids(h), ping: true });
    if (!r.ok && holding === h) lostBook(h, r.by);
  } catch {
    /* no signal: try again next time */
  }
}

/** Open this book of his (one of his books, without moving him), unless another corrector has it: then ask her. */
function openBook(v: View, now: number) {
  const unitId = bookId(v);
  const c = unitId ? (latestClaims ?? []).find((x) => x.studentId === v.s._id && x.unitId === unitId) : undefined;
  if (c && unitId && c.userId !== meId() && claimLive(c, serverNow())) {
    const { name, tag } = bookWords(v.s._id, unitId);
    asking = { studentId: v.s._id, unitId, who: c.name, name, tag, state: "held" };
    emit();
    return;
  }
  clearToasts();
  leave();
  window.scrollTo(0, 0);
  setPaper(paperFor(v, now));
}
function useFocusState(): Paper | null {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((x) => x + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
  return openPaper;
}
function remember(s: Saved) {
  saved = [s, ...saved].slice(0, 5);
  keepSaved();
  emit();
}

const GRADE_KEY = "aristora.grade.focus";

/**
 * The grade whose names show on this phone, remembered (any grade with students, even before anyone of it is in).
 * The one shown is always the one remembered: the names never jump to another grade by themselves.
 */
function useFocusGrade(here: number[], all: number[]): [number | null, (g: number) => void] {
  const [chosen, setChosen] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem(GRADE_KEY);
      return raw && /^\d+$/.test(raw) ? Number(raw) : null;
    } catch {
      return null;
    }
  });
  const set = (g: number) => {
    setChosen(g);
    try {
      localStorage.setItem(GRADE_KEY, String(g));
    } catch {
      /* private mode */
    }
  };
  const grade = focusGrade(chosen, here, all);
  useEffect(() => {
    if (grade !== null && grade !== chosen) set(grade);
  }, [grade]);
  return [grade, set];
}

// ---- Opening, leaving and saving papers ----

/** A workbook paper on this level, with the marks given before (his draft), opening where they stopped. */
function masterAt(v: View, l: MasterLevel): MasterPaper {
  const d = draftOf(latestDrafts, v, l.n);
  const { given, parts } = fromDraft(d);
  const count = Object.keys(given).length;
  const blanks: Record<number, string[]> = {};
  for (const [q, g] of Object.entries(given)) if (g.dkp?.length) blanks[Number(q)] = [...g.dkp];
  return {
    kind: "master",
    studentId: v.s._id,
    unitId: bookId(v)!,
    level: l.n,
    given,
    parts,
    blanks,
    at: resumeAt(questionsOf(l), given),
    to: "auto",
    checked: latestDrafts !== undefined,
    ...(d && count ? { resumed: { count, at: d.updatedAt } } : {}),
  };
}

/** A corrected level opened again: its saved marks, on the level's marks (tap a box to change one). */
function remarkAt(v: View, l: MasterLevel): MasterPaper {
  const given = savedGiven(v, l);
  const blanks: Record<number, string[]> = {};
  for (const [q, g] of Object.entries(given)) if (g.dkp?.length) blanks[Number(q)] = [...g.dkp];
  return {
    kind: "master",
    studentId: v.s._id,
    unitId: bookId(v)!,
    level: l.n,
    given,
    parts: {},
    blanks,
    at: questionsOf(l).length,
    to: "auto",
    checked: true,
    remark: { ...given },
  };
}

/** A level of his workbook: corrected = check or change its marks; else mark it (from his draft). */
function paperAt(v: View, l: MasterLevel): MasterPaper {
  return v.mm.lv[String(l.n)]?.fixed ? remarkAt(v, l) : masterAt(v, l);
}

/** What opens for a student: his theory book, his workbook at the right level, the unit's marks, or choose a unit. */
function paperFor(v: View, now: number): Paper {
  if (v.kind === "fighter") return { kind: "fighter", studentId: v.s._id, unitId: bookId(v)!, qs: fighterQueue(v), at: 0, base: {} };
  if (v.kind !== "master") return { kind: "none", studentId: v.s._id, unitId: v.s.unitId ?? null, stage: v.stage };
  const fits = carryLevel(carry, v, now);
  if (fits && carry) {
    const c = carry;
    carry = null;
    const qs = questionsOf(fits);
    // The marks are his now: kept as his draft at once, like any marks.
    for (const q of qs) if (c.given[q]) queueDraft(v.s._id, bookId(v)!, fits.n, q, c.given[q], c.parts?.[q]);
    const blanks: Record<number, string[]> = {};
    for (const q of qs) if (c.given[q]?.dkp?.length) blanks[q] = [...c.given[q].dkp!];
    return {
      kind: "master",
      studentId: v.s._id,
      unitId: bookId(v)!,
      level: fits.n,
      given: { ...c.given },
      parts: { ...(c.parts ?? {}) },
      blanks,
      at: qs.length,
      to: "auto",
      carriedFrom: c.fromName,
      checked: true,
    };
  }
  const l = autoLevel(v, latestDrafts);
  // A level marked at home opens with the phone's marks, to check (the others open to mark).
  return l ? paperAt(v, l) : { kind: "over", studentId: v.s._id, unitId: bookId(v)! };
}

/** Theory-book marks this paper changed: they join "Saved on this phone" (Take back). */
function rememberFighter(p: FighterPaper) {
  const v = latestViews.find((x) => x.s._id === p.studentId);
  const items: SavedMarks["items"] = [];
  const prev: SavedMarks["prev"] = [];
  for (const [k, was] of Object.entries(p.base)) {
    const s = v?.marks[k]?.s ?? null;
    if ((was?.s ?? null) === s) continue;
    items.push({ q: Number(k), s });
    prev.push({ q: Number(k), mark: was });
  }
  if (!v || !items.length) return;
  items.sort((a, b) => a.q - b.q);
  remember({
    kind: "marks",
    id: ++savedIds,
    studentId: p.studentId,
    name: v.s.name,
    unitId: p.unitId,
    tag: tagOf(v.s, v.unit),
    items,
    prev,
    labels: items.map((it) => (v.f ? qLabel(v.f, it.q) : `Q${it.q}`)),
    at: serverNow(),
  });
}

/**
 * Save a level (workbook.correct), as the Save button does. Its draft goes first, so it can't arrive after the level
 * is saved. `auto`: the corrector moved on (another name or level) with every question marked. Null when it failed.
 */
async function saveLevel(v: View, p: MasterPaper, l: MasterLevel, auto: boolean) {
  await flushFocus();
  const qs = questionsOf(l);
  const route = routeOf(p.to);
  const before = beforeOf(v.mm, l);
  const res = await act(() =>
    mutate(api.workbook.correct, {
      studentId: v.s._id,
      unitId: bookId(v) as Id<"units"> | undefined,
      level: l.n,
      items: itemsOf(qs, p.given),
      to: route,
      by: currentRole(),
    }),
  );
  if (!res) return null;
  if (!p.remark) void dropDraft(p.studentId, p.unitId, l.n);
  remember({
    kind: "level",
    id: ++savedIds,
    studentId: v.s._id,
    name: v.s.name,
    unitId: bookId(v)!,
    tag: tagOf(v.s, v.unit),
    level: l.n,
    from: l.from,
    to: l.to,
    got: res.got,
    max: res.max,
    given: { ...p.given },
    parts: { ...p.parts },
    before,
    at: serverNow(),
  });
  const go = (who: string, list: number[]) => (list.length ? ` ${who}: ${list.map((q) => `Q${q}`).join(" ")}.` : "");
  const pre = res.pre.length ? ` Level${res.pre.length === 1 ? "" : "s"} ${runs(res.pre)}: done before the app.` : "";
  toast(
    `${p.remark ? "Changed" : "Saved"}: ${v.s.name}, Level ${l.n}, ${res.got} / ${res.max}.${go("Theory", res.theory)}${go("Evaluation", res.evaluation)}${pre}${auto ? " (saved as you moved on)" : ""}`,
  );
  return res;
}

/** "1–3", "1, 4": level numbers, short. */
function runs(ns: number[]): string {
  const s = [...ns].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(j > i ? `${s[i]}–${s[j]}` : String(s[i]));
    i = j;
  }
  return out.join(", ");
}

/**
 * The open paper is left (another name, another level, Done): every mark is kept. A workbook level marked to the end
 * saves itself (or its changes, for a corrected level opened again); theory marks join "Saved on this phone".
 */
function leave() {
  const p = openPaper;
  if (!p) return;
  if (p.kind === "fighter") rememberFighter(p);
  if (p.kind === "master" && !p.saving) {
    const v = viewOfPaper(latestViews, p);
    const l = v?.mb?.levels.find((x) => x.n === p.level);
    if (v && l && marksOfLevel(v, l)) {
      const qs = questionsOf(l);
      const complete = qs.every((q) => p.given[q]);
      const changed = !p.remark || !sameGiven(qs, p.given, p.remark);
      if (complete && changed) {
        void saveLevel(v, p, l, true);
        return;
      }
    }
  }
  void flushFocus();
}

/**
 * Tap a name: leave the open paper (every mark kept) and open his book with something to correct (his book now, else
 * another book with a level handed in or marked at home). It never moves him: another corrector can be on another of
 * his books at the same time. A book another corrector has open is skipped; if it's the only one, ask her for it.
 */
function openFor(v: View, now: number) {
  if (openPaper && openPaper.studentId === v.s._id && openPaper.kind !== "wait") return;
  const pick = bookToOpen(v, latestClaims, meId(), serverNow());
  openBook(pick.view, now);
  if (pick.skipped && !pick.held) {
    const was = bookWords(v.s._id, pick.skipped.unitId);
    toast(`${pick.skipped.name} has ${v.s.name}'s ${was.tag}: ${bookWords(v.s._id, bookId(pick.view)!).tag} opened.`);
  }
}

/** Open one level of his workbook (the level bar, his marks table). */
function openLevel(v: View, n: number) {
  const l = v.mb?.levels.find((x) => x.n === n);
  if (!l) return;
  if (openPaper?.kind === "master" && openPaper.studentId === v.s._id && openPaper.level === n) return;
  leave();
  setPaper(paperAt(v, l));
}

/** Move him to another stage or unit (his paper is from there): the page opens it as soon as the board shows it. */
async function moveTo(v: View, stage: Stage, u: Unit): Promise<boolean> {
  // The open paper's marks reach the server first (they stay with the unit he leaves).
  await flushFocus();
  const t = u.term || v.s.term || termOf(serverNow());
  const r = await act(() =>
    mutate(api.students.move, { id: v.s._id, grade: u.grade, term: t, stage, unitId: u._id as Id<"units">, by: currentRole() }),
  );
  if (r === undefined) return false;
  setPaper({ kind: "wait", studentId: v.s._id, unitId: u._id, stage });
  toast(
    stage === "fighter" || stage === "master"
      ? `${v.s.name}: ${stageName(stage)} · ${unitNo(u.code)} ${u.ta || u.en}.`
      : `${v.s.name}: ${stageName(stage)}, Grade ${u.grade}, Term ${t}.`,
  );
  return true;
}

/** Take a saved level back (after the corrector confirmed): it goes back to how it was; its marks wait for the right student. */
async function takeBackLevel(s: SavedLevel): Promise<boolean> {
  const v = viewOfPaper(latestViews, s);
  if (!v) {
    toast(`${s.name}'s book is not open here now. Use Class at the top (tap his name).`, "error");
    return false;
  }
  const fixed = v.mm.lv[String(s.level)]?.fixed;
  if (!fixed) {
    toast("Still saving. Try again in a moment.", "error");
    return false;
  }
  if (Math.abs(fixed - s.at) > 2 * 60_000) {
    toast(`${s.name}'s Level ${s.level} was corrected again since. Open it on Class at the top (tap his name).`, "error");
    return false;
  }
  const ok = await act(() =>
    mutate(api.workbook.uncorrect, {
      studentId: s.studentId as Id<"students">,
      unitId: s.unitId as Id<"units">,
      level: s.level,
      fixed,
      before: s.before,
      by: currentRole(),
    }),
  );
  if (!ok) return false;
  s.back = true;
  keepSaved();
  carry = { unitId: s.unitId, from: s.from, to: s.to, given: { ...s.given }, parts: { ...s.parts }, fromName: s.name, at: serverNow() };
  // His paper (if open) goes back to how it is now.
  if (openPaper?.studentId === s.studentId) setPaper(null);
  emit();
  toast(`Taken back: ${s.name}'s Level ${s.level} is as it was. Tap the right student: these marks go to him.`);
  return true;
}

/** Take theory marks back: each question as it was before, unless someone changed it since. */
async function takeBackMarks(s: SavedMarks): Promise<boolean> {
  const v = latestViews.find((x) => x.s._id === s.studentId);
  if (!v || v.s.unitId !== s.unitId || v.kind !== "fighter") {
    toast(`${s.name} is on another book now. Use Class at the top (tap his name).`, "error");
    return false;
  }
  const moved = s.items.find((it) => (v.marks[String(it.q)]?.s ?? null) !== it.s);
  if (moved) {
    toast(`${s.name}'s ${v.f?.longLabel(moved.q) ?? `Q${moved.q}`} was changed since. Fix it on Class at the top (tap his name).`, "error");
    return false;
  }
  try {
    // restoreMany answers nothing: no act() here (it would read that as a failure).
    await mutate(api.marks.restoreMany, {
      studentId: s.studentId as Id<"students">,
      unitId: s.unitId as Id<"units">,
      items: s.prev,
      by: currentRole(),
    });
  } catch (e) {
    toast(errorText(e), "error");
    return false;
  }
  s.back = true;
  keepSaved();
  if (openPaper?.studentId === s.studentId) setPaper(null);
  emit();
  toast(`Taken back: ${s.name}'s marks are as they were.`);
  return true;
}

// ---- The page ----

type SheetName = "unit" | "card" | "move" | "theory" | "saved" | "attendance";

export function Focus(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  latestViews = views;
  const drafts = useQuery<Draft[]>(api.focus.drafts, {});
  latestDrafts = drafts;
  const claims = useQuery<Claim[]>(api.focus.claims, {});
  latestClaims = claims;
  const paper = useFocusState();
  const me = meId();
  // "Still here" while this page is on screen; back on screen = at once (her book may have gone meanwhile).
  useEffect(() => {
    const t = window.setInterval(() => void stillHere(), CLAIM_PING_MS);
    const seen = () => {
      if (document.visibilityState === "visible") void stillHere();
    };
    document.addEventListener("visibilitychange", seen);
    void stillHere();
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", seen);
    };
  }, []);
  // Her book: another corrector asks for it (a sheet over the paper: nothing under her finger moves).
  const mine = holding && claims ? (claims.find((c) => c.studentId === holding!.studentId && c.unitId === holding!.unitId && c.userId === me) ?? null) : null;
  const askedMe = mine?.ask ?? null;
  useEffect(() => {
    if (askedMe) tone("call");
  }, [askedMe?.at]);
  // Asked another corrector for a book: given to me (open it), free now (open it), or kept (say so).
  useEffect(() => {
    const a = asking;
    if (!a || a.state !== "asked" || !claims) return;
    const c = claims.find((x) => x.studentId === a.studentId && x.unitId === a.unitId);
    const bv = viewOfPaper(views, a);
    if (!c || c.userId === me || !claimLive(c, serverNow())) {
      asking = null;
      if (bv) {
        clearToasts();
        leave();
        window.scrollTo(0, 0);
        setPaper(paperFor(bv, now));
      } else emit();
      toast(c && c.userId === me ? `${a.who} gave you ${a.name}'s ${a.tag}.` : `${a.name}'s ${a.tag} is free now: opened.`);
    } else if (!c.ask && c.kept?.userId === me) {
      asking = { ...a, state: "kept" };
      emit();
    }
  }, [claims]);
  const [sheet, setSheetNow] = useState<SheetName | null>(null);
  // Toasts sit at the top while a paper is open: a sheet opening clears them (they would cover its title).
  const setSheet = (x: SheetName | null) => {
    if (x) clearToasts();
    setSheetNow(x);
  };
  const pills = focusPills(views);
  const grades = gradesOf(pills.map((p) => p.v));
  const [grade, setGrade] = useFocusGrade(grades, gradesOf(views));
  const shown = pills.filter((p) => p.v.s.grade === grade);
  const main = paper ? (views.find((x) => x.s._id === paper.studentId) ?? null) : null;
  const v = paper ? (paper.kind === "wait" ? main : viewOfPaper(views, paper)) : null;
  // His paper opened from elsewhere (Saved, a level from his card): his grade's names show, his own one dark.
  const paperGrade = v?.s.grade;
  useEffect(() => {
    if (typeof paperGrade === "number" && paperGrade !== grade) setGrade(paperGrade);
  }, [paper?.studentId]);
  const waitingCarry = carry && now - carry.at <= CARRY_MS ? carry : null;

  // His paper no longer fits: removed, his book moved (by Move, from any phone), or that book has nothing more now.
  // It never follows him to another book by itself: each corrector opens what she wants.
  const moved =
    !!paper &&
    paper.kind !== "wait" &&
    (!v ||
      (paper.kind === "master" && v.kind !== "master") ||
      (paper.kind === "fighter" && v.kind !== "fighter") ||
      (paper.kind === "over" && v.kind !== "master") ||
      (paper.kind === "none" && (v.kind !== "none" || (v.s.unitId ?? null) !== paper.unitId || v.stage !== paper.stage)));
  useEffect(() => {
    if (!moved || !paper) return;
    if (!main) {
      setPaper(null);
      toast("That student was removed: the paper was closed. Marks given before were kept.", "error");
      return;
    }
    const wasMarking = paper.kind === "master" || paper.kind === "fighter";
    if (paper.kind === "none") {
      setPaper(paperFor(main, now));
      return;
    }
    setPaper(null);
    if (wasMarking) toast(`${main.s.name}: that book has nothing more to correct now. Marks given were kept.`);
  }, [moved]);
  // Moved from here: open his new book as soon as the board shows him there.
  const arrived = paper?.kind === "wait" && !!main && main.s.unitId === paper.unitId && main.s.stage === paper.stage;
  useEffect(() => {
    if (arrived && main) setPaper(paperFor(main, now));
  }, [arrived]);
  // A level saved to the end with nothing after it: the unit's marks (when the board shows the last save).
  useEffect(() => {
    if (paper?.kind === "master" && v?.kind === "master" && !paper.saving && openPaper === paper) {
      const l = v.mb!.levels.find((x) => x.n === paper.level);
      if (!l) setPaper(paperFor(v, now));
    }
  });

  // While a paper is open, toasts show at the top: nothing may sit over the pad.
  const marking = !!paper;
  useEffect(() => {
    document.body.classList.toggle("fc-marking", marking);
    return () => document.body.classList.remove("fc-marking");
  }, [marking]);

  // The names and the grades are pinned under the top bar (they never scroll away); toasts go just below them.
  const stick = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stick.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--fc-stick-h", `${el.offsetHeight}px`);
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <main class="page fc-page">
      <div class="stick fc-stick" ref={stick}>
        <CallsBand board={board} views={views} now={now} paper />
        {views.length > 0 && grade !== null && (
          <NameBar
            pills={shown}
            grade={grade}
            openId={paper?.studentId}
            drafts={drafts}
            claims={claims}
            me={me}
            now={now}
            onPick={(x) => openFor(x, now)}
            onAdd={() => setSheet("attendance")}
          />
        )}
        {views.length > 0 && (
          <GradeBar views={views} pills={pills} needs={focusNeeds(views)} grade={grade} onPick={setGrade} saved={saved.length} onSaved={() => setSheet("saved")} />
        )}
      </div>
      {views.length === 0 ? (
        <Empty title="No students yet">
          {may("students") ? "Open settings (the gear at the top) to add your students." : "The owner adds students in Settings."}
        </Empty>
      ) : (
        <>
          {waitingCarry && (
            <div class="fc-carry" role="status">
              <span>
                Marks taken back from <b>{waitingCarry.fromName}</b> (Q{waitingCarry.from}–{waitingCarry.to}): tap the right student.
              </span>
              <button
                type="button"
                class="btn ghost small"
                onClick={() => {
                  carry = null;
                  emit();
                }}
              >
                Drop
              </button>
            </div>
          )}
          {paper && v ? (
            <PaperView key={`${paper.studentId}`} v={v} paper={paper} drafts={drafts} now={now} onSheet={setSheet} />
          ) : shown.length > 0 ? (
            <p class="fc-hint">Tap the name on the paper.</p>
          ) : null}
          {!paper && (
            <p class="muted small fc-help">
              Tap a name: his paper opens at the level to correct. One tap for each question (the big green button is full
              marks, a number gives fewer, <b>?</b> = blank; a question in parts: each part's marks, or <b>?</b> for a part
              left blank). Tapping another name keeps every mark; a level marked to the end saves itself. Tap a level on the
              bar to open it (an old one: check or change its marks). His unit at the top changes his stage or unit. One
              grade's names at a time: tap the grade, then <b>+</b> to sign its students in.
            </p>
          )}
        </>
      )}

      {sheet === "saved" && <SavedSheet now={now} onClose={() => setSheet(null)} />}
      {sheet === "attendance" && grade !== null && (
        <AttendanceSheet board={board} views={views} now={now} grade={grade} only onClose={() => setSheet(null)} />
      )}
      {main && sheet === "unit" && <StageUnitSheet v={main} onClose={() => setSheet(null)} />}
      {v && sheet === "card" && (
        <Sheet title={v.s.name} sub={tagOf(v.s, v.unit)} onClose={() => setSheet(null)}>
          <Book
            role="correction"
            v={v}
            onMove={() => setSheet("move")}
            onCorrect={(n) => {
              setSheet(null);
              openLevel(v, n);
            }}
            onTheory={() => setSheet("theory")}
          />
        </Sheet>
      )}
      {main && sheet === "move" && <MoveSheet v={main} onClose={() => setSheet(null)} />}
      {askedMe && mine && <GiveSheet claim={mine} ask={askedMe} />}
      {asking && !askedMe && <AskSheet a={asking} />}
      {v && sheet === "theory" && v.ms && <TheorySheet v={v} onClose={() => setSheet(null)} />}
    </main>
  );
}

// ---- One corrector per book: asking for a book, giving it ----

/**
 * Another corrector asks for the book on her paper: give it (her paper closes, her marks go with the book) or keep
 * it. A sheet over the paper, so nothing under her finger moves.
 */
function GiveSheet(props: { claim: Claim; ask: { userId: string; name: string; at: number } }) {
  const { claim, ask } = props;
  const [busy, setBusy] = useState(false);
  const { name, tag } = bookWords(claim.studentId, claim.unitId);
  const answer = async (give: boolean) => {
    setBusy(true);
    if (give) await flushFocus();
    const ok = await act(() => mutate(api.focus.answer, { ...ids(claim), give }));
    setBusy(false);
    if (!ok || !give) return;
    // Hers now: this phone lets go without freeing it.
    holding = null;
    if (markable(openPaper) && openPaper.studentId === claim.studentId && openPaper.unitId === claim.unitId) openPaper = null;
    emit();
    toast(`${name}'s ${tag} is ${ask.name}'s now. Your marks went with it.`);
  };
  return (
    <Sheet
      title={`${ask.name} asks for ${name}'s ${tag}`}
      sub="One corrector per book at a time"
      onClose={() => void answer(false)}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" disabled={busy} onClick={() => void answer(false)}>
            Keep it
          </button>
          <button type="button" class="btn primary" disabled={busy} onClick={() => void answer(true)}>
            Give it to {ask.name}
          </button>
        </div>
      }
    >
      <p class="fc-ask-t">
        Give it: your paper closes here and opens on {ask.name}'s phone, with every mark you gave. Keep it: {ask.name} is told
        you are still correcting it.
      </p>
    </Sheet>
  );
}

/** A book another corrector has open: ask her for it, wait for her answer, or let it be. */
function AskSheet(props: { a: Ask }) {
  const { a } = props;
  const [busy, setBusy] = useState(false);
  const close = async () => {
    if (a.state === "asked") await mutate(api.focus.unask, ids(a)).catch(() => {});
    asking = null;
    emit();
  };
  const ask = async () => {
    setBusy(true);
    const r = await act(() => mutate(api.focus.ask, ids(a)));
    setBusy(false);
    if (r === "asked") {
      asking = { ...a, state: "asked" };
      emit();
    } else if (r === "free") {
      asking = null;
      const v = viewOfPaper(latestViews, a);
      if (v) openBook(v, serverNow());
      else emit();
    }
  };
  const words =
    a.state === "kept"
      ? `${a.who} is still correcting it. Tap another name, or ask again later.`
      : a.state === "asked"
        ? `Asked ${a.who}. It opens here as soon as she gives it to you.`
        : `${a.who} is correcting it now. Two correctors on one book would mark it twice: ask her for it.`;
  return (
    <Sheet
      title={a.state === "kept" ? `${a.who} keeps ${a.name}'s ${a.tag}` : `${a.who} has ${a.name}'s ${a.tag}`}
      sub="One corrector per book at a time"
      onClose={() => void close()}
      foot={
        <div class="row-actions">
          <button type="button" class="btn ghost" onClick={() => void close()}>
            {a.state === "asked" ? "Cancel" : "Close"}
          </button>
          {a.state !== "asked" && (
            <button type="button" class="btn primary" disabled={busy} onClick={() => void ask()}>
              Ask {a.who}
            </button>
          )}
        </div>
      }
    >
      <p class="fc-ask-t" role="status">
        {words}
      </p>
    </Sheet>
  );
}

// ---- The names ----

const TONE_WORDS: Record<string, string> = {
  red: "no work until it's corrected",
  amber: "a level handed in",
  th: "theory book",
  nb: "no book in the app: choose his unit",
  home: "gone home, levels to correct",
};

/**
 * One grade's row: + first, always in the same place (that grade's Attendance), then its tiny name pills A–Z in ONE
 * line that scrolls sideways: the open one is dark and kept in view; a red or amber dot on an edge says a student who
 * waits for the corrector is hidden that way.
 */
function NameBar(props: {
  pills: Pill[];
  grade: number;
  openId?: string;
  drafts: Draft[] | undefined;
  claims: Claim[] | undefined;
  me: string | null;
  now: number;
  onPick: (v: View) => void;
  onAdd: () => void;
}) {
  const { pills, drafts } = props;
  const marking = (v: View) => (drafts ?? []).some((d) => d.studentId === v.s._id && Object.keys(d.q).length > 0);
  return (
    <div class="fc-namerow">
      <button type="button" class="fc-add" aria-label={`Attendance: Grade ${props.grade}`} onClick={props.onAdd}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      {pills.length === 0 ? (
        <p class="fc-none">Nobody from Grade {props.grade} is in yet: tap + as they arrive.</p>
      ) : (
        <HRow as="nav" class="fc-names" label={`Grade ${props.grade}: tap the name on the paper`} list={props.grade} at={props.openId}>
          {pills.map((p) => {
            const on = p.v.s._id === props.openId;
            const d = marking(p.v);
            // Another corrector has one of his books open: her first letter; dim when it's his only book to correct.
            const other = on ? null : heldOne(p.v, props.claims, props.me, props.now);
            const busy = !!other && !!bookToOpen(p.v, props.claims, props.me, props.now).held;
            const words = [
              p.tone ? TONE_WORDS[p.tone] : "",
              p.waiting > 1 ? `${p.waiting} levels handed in` : "",
              d ? "marked part of the way" : "",
              p.home ? `${p.home} marked at home, to check` : "",
              other ? `${other.name} is correcting ${busy ? "his book" : "one of his books"}` : "",
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <button
                key={p.v.s._id}
                type="button"
                class={`fc-nm${p.tone ? ` ${p.tone}` : ""}${on ? " on" : ""}${d ? " d" : ""}${busy ? " fc-held" : ""}`}
                data-u={p.tone === "red" || p.tone === "amber" ? p.tone : undefined}
                aria-pressed={on}
                aria-label={`${p.v.s.name}${words ? `: ${words}` : ""}`}
                onClick={() => props.onPick(p.v)}
              >
                {p.v.s.name}
                {p.waiting > 1 && (
                  <i class="fc-nm-n" aria-hidden="true">
                    {p.waiting}
                  </i>
                )}
                {p.home > 0 && (
                  <i class="fc-nm-h" aria-hidden="true">
                    ⌂{p.home > 1 ? p.home : ""}
                  </i>
                )}
                {other && (
                  <i class="fc-nm-who" aria-hidden="true">
                    {other.name.slice(0, 1).toUpperCase()}
                  </i>
                )}
              </button>
            );
          })}
        </HRow>
      )}
    </div>
  );
}

/**
 * Under the names: the grades 6–11, always in the same places (no All: one grade's names at a time), each with how
 * many are in out of its students ("9/10", as on Attendance) and what waits for the corrector there; a grade with no
 * students at all is pale. ↶ Saved at the end.
 */
function GradeBar(props: {
  views: View[];
  pills: Pill[];
  needs: Map<string, "red" | "amber">;
  grade: number | null;
  onPick: (g: number) => void;
  saved: number;
  onSaved: () => void;
}) {
  const per = gradeNeeds(props.pills, props.needs);
  return (
    <div class="fc-tools">
      <nav class="grade-pills fc-grades" aria-label="Show one grade">
        {GRADES.map((g) => {
          const all = props.views.filter((x) => x.s.grade === g);
          const here = all.filter((x) => x.where !== "absent").length;
          const c = per.get(g);
          const on = props.grade === g;
          const words = all.length
            ? `Grade ${g}: ${here} of ${all.length} here${c?.red ? `, ${c.red} need you now` : c?.amber ? `, ${c.amber} handed in` : ""}`
            : `Grade ${g}: no students`;
          return (
            <button
              key={g}
              type="button"
              class={`gp${on ? " on" : ""}${all.length ? "" : " none"}${here ? " some" : ""}`}
              aria-pressed={on}
              aria-label={words}
              disabled={all.length === 0}
              onClick={() => props.onPick(g)}
            >
              <b>{g}</b>
              <small>{all.length ? `${here}/${all.length}` : "–"}</small>
              {c?.red ? <i class="gp-badge red">{c.red}</i> : c?.amber ? <i class="gp-badge amber">{c.amber}</i> : null}
            </button>
          );
        })}
      </nav>
      {/* Always there (pale until the first save), so the grades never move. */}
      <button
        type="button"
        class="fc-savedbtn"
        disabled={props.saved === 0}
        aria-label={props.saved ? `Saved on this phone: ${props.saved}` : "Nothing saved on this phone yet"}
        onClick={props.onSaved}
      >
        <span aria-hidden="true">↶</span>
        <span class="fc-savedw">Saved</span>
      </button>
    </div>
  );
}

// ---- Sheets ----

type BookInfo = { unitId: string; stage: "fighter" | "master" };

type UnitCell = {
  unitId: string;
  stage: "fighter" | "master";
  done: number;
  total: number;
  pct: number | null;
  evaluation: number;
  theory: number;
  finished: boolean;
};
type StudentUnits = { cells: UnitCell[]; given: { unitId: string; stage: "fighter" | "master"; at: number }[] } | null;

/**
 * His stage and unit, every unit of his grade as a tiny pill in one view (no scrolling), Term 1 / 2 / 3 apart. Each
 * pill: number and Tamil name, a soft fill for how far he is (its colour = his marks), a violet number = wrong answers
 * waiting for Evaluation, blue = waiting for Theory, ✓ = the book was given to him. "Move him" (one tap moves him
 * and closes) or "Books given" (each tap gives or takes back that unit's book; the sheet stays open).
 */
function StageUnitSheet(props: { v: View; onClose: () => void }) {
  const { v } = props;
  const books = useQuery<BookInfo[]>(api.catalog.books, {});
  const mine = useQuery<StudentUnits>(api.progress.student, { studentId: v.s._id });
  const [stage, setStage] = useState<"fighter" | "master">(v.stage === "fighter" ? "fighter" : "master");
  const [mode, setMode] = useState<"move" | "given">("move");
  const [busy, setBusy] = useState(false);
  // Taps not answered yet: the pill shows the new state at once.
  const [flip, setFlip] = useState<Record<string, boolean>>({});
  const units = allUnits().filter((u) => u.grade === v.s.grade);
  const terms = [1, 2, 3, 0]
    .map((t) => ({
      t,
      list: units.filter((u) => (u.term || 0) === t).sort((a, b) => unitNo(a.code) - unitNo(b.code) || a.order - b.order),
    }))
    .filter((x) => x.list.length > 0);
  const has = (u: Unit) => (books ? books.some((b) => b.unitId === u._id && b.stage === stage) : true);
  const cellOf = (u: Unit) => mine?.cells.find((c) => c.unitId === u._id && c.stage === stage);
  const givenOf = (u: Unit) => flip[`${u._id}:${stage}`] ?? !!mine?.given.some((g) => g.unitId === u._id && g.stage === stage);
  const bookWord = stage === "fighter" ? "theory book" : "workbook";

  const pick = async (u: Unit) => {
    if (mode === "given") {
      const key = `${u._id}:${stage}`;
      const next = !givenOf(u);
      setFlip((f) => ({ ...f, [key]: next }));
      const ok = await act(() =>
        mutate(api.students.setGiven, { id: v.s._id, unitId: u._id as Id<"units">, stage, given: next, by: currentRole() }),
      );
      if (!ok) setFlip((f) => ({ ...f, [key]: !next }));
      return;
    }
    if (u._id === v.s.unitId && stage === v.stage) {
      props.onClose();
      return;
    }
    setBusy(true);
    const ok = await moveTo(v, stage, u);
    setBusy(false);
    if (ok) props.onClose();
  };

  return (
    <Sheet
      full
      cls="su-sheet"
      title={`${v.s.name}: units`}
      onClose={props.onClose}
    >
      <div class="su-all">
        <div class="su-bar">
          <div class="segc su-stages" role="group" aria-label="Stage">
            {(["fighter", "master"] as const).map((st) => (
              <button
                key={st}
                type="button"
                class={`segc-b su-st ${st}${stage === st ? " on" : ""}`}
                aria-pressed={stage === st}
                onClick={() => setStage(st)}
              >
                {st === "fighter" ? "Fighter" : "Master"}
              </button>
            ))}
          </div>
          <div class="segc su-modes" role="group" aria-label="A tap on a unit">
            <button type="button" class={`segc-b${mode === "move" ? " on" : ""}`} aria-pressed={mode === "move"} onClick={() => setMode("move")}>
              Move him
            </button>
            <button type="button" class={`segc-b${mode === "given" ? " on" : ""}`} aria-pressed={mode === "given"} onClick={() => setMode("given")}>
              Books given
            </button>
          </div>
        </div>
        {terms.map(({ t, list }) => (
          <section key={t} class="su-term" aria-label={t ? `Term ${t}` : "Extra"}>
            <p class="su-tl">
              <span>{t ? `Term ${t}` : "Extra"}</span>
            </p>
            <div class={`su-grid${mode === "given" ? " gm" : ""}`}>
              {list.map((u) => {
                const here = u._id === v.s.unitId && stage === v.stage;
                const book = has(u);
                const c = cellOf(u);
                const given = givenOf(u);
                const p = c && c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
                // The fill's colour: his marks (workbook), blue for the theory book or before any correction.
                const tone =
                  !c || c.done === 0 ? "" : stage === "fighter" ? " th" : c.pct === null ? " plain" : c.pct >= 80 ? " good" : c.pct >= 50 ? " mid" : " low";
                const words = [
                  here ? "he is on it now" : "",
                  c ? `${c.done} of ${c.total} ${stage === "master" ? "levels" : "questions"} done${c.pct !== null ? `, ${c.pct}%` : ""}` : "",
                  c?.evaluation ? `${c.evaluation} waiting for Evaluation` : "",
                  c?.theory ? `${c.theory} waiting for Theory` : "",
                  given ? `${bookWord} given` : "",
                  book ? "" : "no book in the app yet",
                ]
                  .filter(Boolean)
                  .join(", ");
                return (
                  <button
                    key={u._id}
                    type="button"
                    class={`su-p${tone}${here ? " on" : ""}${book ? "" : " nb"}${given ? " given" : ""}`}
                    style={`--p:${p}%`}
                    disabled={busy}
                    aria-pressed={mode === "given" ? given : undefined}
                    aria-label={`${unitNo(u.code)} ${u.ta || u.en}${words ? `: ${words}` : ""}`}
                    onClick={() => void pick(u)}
                  >
                    <b>{unitNo(u.code)}</b>
                    <span lang="ta">{u.ta || u.en}</span>
                    {c?.evaluation ? (
                      <i class="su-w e" aria-hidden="true">
                        {c.evaluation}
                      </i>
                    ) : c?.theory ? (
                      <i class="su-w t" aria-hidden="true">
                        {c.theory}
                      </i>
                    ) : null}
                    {given && (
                      <i class="su-g" aria-hidden="true">
                        ✓
                      </i>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        <p class="su-key muted small">
          {mode === "move" ? (
            <>
              <b>Move him:</b> tap the unit on his paper.
            </>
          ) : (
            <>
              <b>Books given:</b> tap each {bookWord} you gave him; tap again to take it back.
            </>
          )}{" "}
          Fill = how far he is (green, amber, red = his marks). <i class="su-w e">2</i> waiting for Evaluation, <i class="su-w t">1</i> for Theory.{" "}
          <i class="su-g">✓</i> book given. Dark ring = his unit now.
        </p>
      </div>
    </Sheet>
  );
}

/** "Saved on this phone": the last 5 saves, each can be taken back for 30 minutes (asked first). */
function SavedSheet(props: { now: number; onClose: () => void }) {
  const { now } = props;
  const [asking, setAsking] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  const what = (s: Saved) =>
    s.kind === "level" ? (
      <>
        <b>{s.name}</b> · L{s.level} · {s.got} / {s.max}
      </>
    ) : (
      <>
        <b>{s.name}</b> · {s.labels.length === 1 ? s.labels[0] : `${s.labels[0]}–${s.labels[s.labels.length - 1]}`} ·{" "}
        {s.items.length} mark{s.items.length === 1 ? "" : "s"}
      </>
    );
  if (asking) {
    return (
      <Sheet
        title={asking.kind === "level" ? `Take back ${asking.name}'s Level ${asking.level}?` : `Take back ${asking.name}'s marks?`}
        sub={
          asking.kind === "level"
            ? `Saved ${asking.got} / ${asking.max} on the wrong student or the wrong level? It goes back to how it was before.`
            : `${asking.items.length} theory-book mark${asking.items.length === 1 ? "" : "s"} on the wrong student? They go back to how they were.`
        }
        onClose={() => setAsking(null)}
        foot={
          <div class="row-actions">
            <button type="button" class="btn ghost" onClick={() => setAsking(null)}>
              Keep it
            </button>
            <button
              type="button"
              class="btn danger"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const ok = asking.kind === "level" ? await takeBackLevel(asking) : await takeBackMarks(asking);
                setBusy(false);
                setAsking(null);
                if (ok) props.onClose();
              }}
            >
              Take back
            </button>
          </div>
        }
      >
        <p class="muted">
          {asking.kind === "level"
            ? "The marks stay on this phone: tap the right student next and they go to him, ready to save."
            : "Then open the right student and mark his questions."}
        </p>
      </Sheet>
    );
  }
  return (
    <Sheet title="Saved on this phone" sub="Saved on the wrong student? Take it back within 30 minutes." onClose={props.onClose}>
      <ul class="fc-saved">
        {saved.map((s) => {
          const canTake = !s.back && now - s.at < TAKE_BACK_MS;
          return (
            <li key={s.id} class={`fc-sv${s.back ? " back" : ""}`}>
              <span class="fc-sv-t">
                <span class="fc-sv-l">{what(s)}</span>
                <small>{s.back ? "taken back" : `${fmtMin(now - s.at)} ago`}</small>
              </span>
              {canTake && (
                <button type="button" class="btn ghost small" onClick={() => setAsking(s)}>
                  Take back
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

// ---- One paper ----

function PaperView(props: { v: View; paper: Paper; drafts: Draft[] | undefined; now: number; onSheet: (s: SheetName) => void }) {
  const { v, paper, now } = props;
  const head = (later?: () => void) => <PaperHead v={v} later={later} onUnit={() => props.onSheet("unit")} onCard={() => props.onSheet("card")} />;
  if (paper.kind === "fighter" && v.kind === "fighter") return <FighterPaperView v={v} paper={paper} head={head()} />;
  if (paper.kind === "master" && v.kind === "master") return <MasterPaperView v={v} paper={paper} drafts={props.drafts} now={now} head={head} />;
  if (paper.kind === "over" && v.kind === "master") return <OverView v={v} drafts={props.drafts} head={head()} />;
  if (paper.kind === "wait") {
    return (
      <div class="fc-paper">
        {head()}
        <p class="fc-hint">Opening his new book…</p>
      </div>
    );
  }
  return <NoBookView v={v} head={head()} onUnit={() => props.onSheet("unit")} />;
}

/**
 * The paper's top: whose it is (huge); his card (marks table and buttons); then his books in one line (tap one to
 * correct it). A workbook level he hasn't handed in yet also has Later: handed in, correct it later (the waiting
 * clock starts).
 */
function PaperHead(props: { v: View; later?: () => void; onUnit: () => void; onCard: () => void }) {
  const { v } = props;
  return (
    <>
      <header class="fc-head">
        <div class="fc-who">
          <h2 class="fc-name">{v.s.name}</h2>
        </div>
        <div class="fc-head-acts">
          {props.later && (
            <button type="button" class="btn ghost small fc-later" aria-label="Handed in: correct later" onClick={props.later}>
              Later
            </button>
          )}
          <button type="button" class="btn ghost small fc-cardbtn" aria-label={`${v.s.name}: his marks and buttons`} onClick={props.onCard}>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <rect x="3.5" y="4" width="17" height="16" rx="2.5" />
              <path d="M3.5 9.5h17M9.5 9.5V20" />
            </svg>
            Marks
          </button>
        </div>
      </header>
      <BookRow v={v.home ?? v} open={bookId(v)} onUnits={props.onUnit} />
      {v.where === "absent" && <SignedOut v={v} />}
    </>
  );
}

/**
 * His books in ONE line that scrolls sideways (30 Oct 2026): his book now (dark), every book given to him that he
 * hasn't finished, any other book with a level handed in (amber count). A tap switches his paper to that book at once
 * (no dialog). The book button first, like + on the names row, opens all the units of his grade (Move him, Books
 * given).
 */
function BookRow(props: { v: View; open: string | undefined; onUnits: () => void }) {
  const { v } = props;
  const books = booksOf(v, (id) => unitNo(unitOf(id)?.code ?? ""));
  return (
    <div class="fc-bookrow">
      <button type="button" class="fc-units" aria-label={`${v.s.name}: all units (move him, books given)`} onClick={props.onUnits}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z" />
          <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
        </svg>
      </button>
      {books.length === 0 ? (
        <p class="fc-none">No book yet: tap the book to choose his unit.</p>
      ) : (
        <HRow as="nav" class="fc-books" label={`${v.s.name}'s books: tap one to correct it`} list={v.s._id} at={props.open}>
          {books.map((b) => {
            const u = unitOf(b.unitId);
            if (!u) return null;
            const name = `${b.stage === "fighter" ? "Theory book" : "Workbook"} ${unitNo(u.code)} ${u.ta || u.en}`;
            const on = b.unitId === props.open;
            // One of his books with a view (his book now, or one with something waiting): opens it here, he stays
            // where he is. A book he hasn't started (given, nothing waiting): he moves to it, as before.
            const bv = [v, ...v.others].find((x) => bookId(x) === b.unitId && x.stage === b.stage);
            return (
              <button
                key={`${b.unitId}:${b.stage}`}
                type="button"
                class={`fc-bk${on ? " on" : ""}`}
                data-u={b.waiting ? "amber" : undefined}
                aria-pressed={on}
                aria-label={`${name}${on ? ", on this paper" : ""}${b.now && !on ? ", his book now" : ""}${b.waiting ? `, ${b.waiting} level${b.waiting === 1 ? "" : "s"} handed in` : ""}`}
                onClick={() => {
                  if (on) return;
                  if (bv) openBook(bv, serverNow());
                  else void moveTo(v, b.stage, u);
                }}
              >
                <b class={`st-${b.stage}`}>{b.stage === "fighter" ? "F" : "M"}</b>
                <i>{unitNo(u.code)}</i>
                <span lang="ta">{u.ta || u.en}</span>
                {b.waiting > 0 && <em class="fc-bk-n">{b.waiting}</em>}
              </button>
            );
          })}
        </HRow>
      )}
    </div>
  );
}

/**
 * His paper while he is signed out (never signed in today, or gone home): his lost marks reach no teacher, because
 * Evaluation and Theory only see students in class. One tap signs him in.
 */
function SignedOut(props: { v: View }) {
  const { v } = props;
  const [busy, setBusy] = useState(false);
  return (
    <p class="fc-out" role="status">
      <span>
        <b>Signed out:</b> Evaluation and Theory don't see him.
      </span>
      <button
        type="button"
        class="btn small"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const ok = await act(() => mutate(api.students.setPresent, { id: v.s._id, present: true, by: "attendance" }));
          setBusy(false);
          if (ok) toast(`${v.s.name} signed in, ${slClock(serverNow())}.`);
        }}
      >
        Sign him in
      </button>
    </p>
  );
}

const LOOK_WORDS: Record<LevelLook, string> = {
  fixed: "corrected",
  waiting: "handed in, to correct",
  draft: "marked part of the way",
  current: "he is on it now",
  pre: "done before the app",
  later: "not done yet",
};

/** His workbook's levels in one bar (like the Class rows), each a button: the open one ringed. */
function LevelBar(props: { v: View; open: number | null; drafts: Draft[] | undefined; onPick: (n: number) => void }) {
  const { v } = props;
  const mb = v.mb!;
  const ms = v.ms!;
  const newPart = (i: number) => i > 0 && mb.parts.some((p) => p.from === mb.levels[i].from);
  // One line that scrolls sideways: the open level stays in the middle (the ones after it in view).
  return (
    <HRow class="fc-lvbar" label="Levels" list={`${v.s._id}:${bookId(v)}`} at={props.open} idle="end">
      {mb.levels.map((l, i) => {
        const look = levelLook(v, l, props.drafts);
        const pct = ms.byLevel[String(l.n)]?.pct ?? null;
        const mark = look === "fixed" ? (pct === null || pct >= 80 ? " good" : pct >= 50 ? " mid" : " low") : "";
        const on = props.open === l.n;
        const got = v.mm.lv[String(l.n)]?.got;
        // Corrected, and lost marks still wait: a dot (violet = Evaluation, blue = Theory).
        const w = look === "fixed" ? levelWaits(v.mm, l) : { evaluation: 0, theory: 0 };
        const wait = w.evaluation ? " w-eval" : w.theory ? " w-theory" : "";
        const waitWords = w.evaluation ? `, ${w.evaluation} waiting for Evaluation` : w.theory ? `, ${w.theory} waiting for Theory` : "";
        const home = homeToCheck(v.mm.lv[String(l.n)]);
        return (
          <button
            key={l.n}
            type="button"
            class={`fc-lb ${look}${mark}${wait}${home ? " home" : ""}${on ? " on" : ""}${newPart(i) ? " gap" : ""}`}
            aria-pressed={on}
            aria-label={`Level ${l.n}, Q${l.from}–${l.to}: ${home ? "marked at home, to check" : LOOK_WORDS[look]}${look === "fixed" ? `, ${got ?? 0} of ${l.max}${waitWords}` : ""}`}
            onClick={() => props.onPick(l.n)}
          >
            {l.n}
          </button>
        );
      })}
    </HRow>
  );
}

/** Under the bar: the open level, its questions, and where it stands. */
function LevelLine(props: { v: View; l: MasterLevel; look: LevelLook; now: number; remark: boolean }) {
  const { v, l, look, now } = props;
  const lv = v.mm.lv[String(l.n)];
  const part = partOf(v.mb!, l.from)?.id;
  const state =
    (props.remark || look === "fixed") && lv?.home
      ? `⌂ marked at home ${lv.got ?? 0} / ${l.max}${lv.hc ? " · checked" : " · to check"}`
      : props.remark || look === "fixed"
      ? `corrected ${lv?.got ?? 0} / ${l.max}`
      : look === "waiting" && lv?.done
        ? `handed in ${fmtMin(now - lv.done)} ago`
        : look === "current"
          ? "he is on it now"
          : look === "pre"
            ? "done before the app"
            : look === "draft"
              ? "marked part of the way"
              : `/ ${l.max}`;
  return (
    <p class={`fc-lvline ${props.remark ? "fixed" : look}`}>
      <b>Level {l.n}</b> · Q{l.from}–{l.to}
      {part ? ` · ${PART_NAME[part]}` : ""} · {state}
    </p>
  );
}

function MasterPaperView(props: {
  v: View;
  paper: MasterPaper;
  drafts: Draft[] | undefined;
  now: number;
  head: (later?: () => void) => ComponentChildren;
}) {
  const { v, paper, now } = props;
  const mb = v.mb!;
  const level = mb.levels.find((l) => l.n === paper.level) ?? null;
  // The answer key comes only while a paper is open (it never travels with the board).
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: bookId(v) as Id<"units"> | undefined });
  const [clearing, setClearing] = useState(false);
  const lock = useRef(0);
  const marks = Object.keys(paper.given).length;
  const fixedNow = level && !paper.saving && !paper.remark ? v.mm.lv[String(level.n)]?.fixed : undefined;

  // Opened before the drafts arrived: load his marks as soon as they do (only if nothing was marked meanwhile).
  useEffect(() => {
    if (!level || paper.checked || paper.remark || props.drafts === undefined || openPaper !== paper) return;
    setPaper(marks ? { ...paper, checked: true } : masterAt(v, level));
  }, [props.drafts, level?.n]);

  if (!level) return null;
  // Handed in, to correct later (the waiting clock starts); the page closes his paper.
  const lvNow = v.mm.lv[String(level.n)];
  const canLater = !lvNow?.done && !lvNow?.fixed && v.where !== "absent" && !paper.saving && !paper.remark;
  const later = async () => {
    const n = level.n;
    const r = await act(() => mutate(api.workbook.levelDone, { studentId: v.s._id, unitId: bookId(v) as Id<"units">, level: n, by: currentRole() }));
    if (r) {
      void flushFocus();
      if (openPaper === paper || (openPaper?.kind === "master" && openPaper.studentId === v.s._id)) setPaper(null);
      toast(`${v.s.name}: Level ${n} handed in. It waits as an amber level on his bar.`);
    }
  };
  const look = levelLook(v, level, props.drafts);

  return (
    <div class="fc-paper">
      {props.head(canLater ? () => void later() : undefined)}
      <LevelBar v={v} open={level.n} drafts={props.drafts} onPick={(n) => openLevel(v, n)} />
      <LevelLine v={v} l={level} look={look} now={now} remark={!!paper.remark} />
      {fixedNow !== undefined && (
        <p class="fc-warn" role="alert">
          Level {level.n} was corrected meanwhile ({v.mm.lv[String(level.n)]?.got ?? 0} / {level.max}). Saving replaces those marks.
        </p>
      )}
      <Marking v={v} paper={paper} level={level} keyQ={keyQ} lock={lock} onClear={() => setClearing(true)} />

      {clearing && (
        <Sheet
          title={`Clear ${v.s.name}'s marks on Level ${level.n}?`}
          sub={`${marks} question${marks === 1 ? " is" : "s are"} marked. Clearing forgets them; nothing else changes.`}
          onClose={() => setClearing(false)}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={() => setClearing(false)}>
                Keep them
              </button>
              <button
                type="button"
                class="btn danger"
                onClick={() => {
                  setClearing(false);
                  void dropDraft(paper.studentId, paper.unitId, level.n);
                  setPaper({ ...paper, given: {}, parts: {}, blanks: {}, at: 0, carriedFrom: undefined, resumed: undefined });
                }}
              >
                Clear the marks
              </button>
            </div>
          }
        >
          <p class="muted">Use this when they were put on the wrong student or the wrong level.</p>
        </Sheet>
      )}
    </div>
  );
}

/** Every level corrected (or done before the app): the unit's marks, to write on the marks sheet in his book. */
function OverView(props: { v: View; drafts: Draft[] | undefined; head: ComponentChildren }) {
  const { v } = props;
  const ms = v.ms!;
  const [busy, setBusy] = useState(false);
  // The usual next step, the same as Class → Move: the next workbook of the term, else Legend (whole papers).
  const step = nextBook(allUnits(), v.unit);
  return (
    <div class="fc-paper">
      {props.head}
      <LevelBar v={v} open={null} drafts={props.drafts} onPick={(n) => openLevel(v, n)} />
      <section class="fc-over" aria-label="The unit's marks">
        <p class="fc-over-k">{v.unit ? `Unit ${unitNo(v.unit.code)} finished` : "Workbook finished"}</p>
        <p class="fc-total">
          <b>{ms.unit.got}</b> / {ms.unit.max}
          <span>{ms.unit.pct ?? 0}%</span>
        </p>
        {ms.pre > 0 && (
          <p class="muted small">
            {ms.pre} level{ms.pre === 1 ? " was" : "s were"} done before the app: their marks are only on his paper.
          </p>
        )}
        <p class="muted small">Write these on the marks sheet at the back of his book. Tap a level to check it.</p>
        <MasterBook role="correction" v={v} onCorrect={(n) => openLevel(v, n)} />
      </section>
      {step && (
        <div class="fc-pad">
          <button
            type="button"
            class="btn big wide fc-next"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await moveTo(v, step.stage, step.unit);
              setBusy(false);
            }}
          >
            {step.stage === "master" ? (
              <>
                Next: Master · {unitNo(step.unit.code)} <span lang="ta">{step.unit.ta || step.unit.en}</span>
              </>
            ) : (
              "Next: Legend (whole papers)"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/** No book in the app for his stage and unit (or Legend, Exam Sprint): say so, and how to choose his unit. */
function NoBookView(props: { v: View; head: ComponentChildren; onUnit: () => void }) {
  const { v } = props;
  const title =
    v.stage === "legend" || v.stage === "sprint"
      ? `${STAGES.find((x) => x.id === v.stage)?.name}: full papers on paper for now`
      : !v.unit
        ? "Choose his unit"
        : `No ${v.stage === "fighter" ? "theory book" : "workbook"} for ${tagOf(v.s, v.unit)} in the app yet`;
  return (
    <div class="fc-paper">
      {props.head}
      <Empty title={title}>If his paper is from another stage or unit, choose it: he moves there at once.</Empty>
      <button type="button" class="btn primary wide" onClick={props.onUnit}>
        Choose his stage and unit
      </button>
    </div>
  );
}

function KeyText(props: { text: string }) {
  return <>{boldRuns(props.text).map(([s, b], i) => (b ? <b key={i}>{s}</b> : s))}</>;
}

/**
 * The question on screen (or the level's marks) stays in view between the pinned names and the pad: on a short phone
 * the paper scrolls by itself, just enough and never past the card's top. A new paper starts from the top.
 */
function useCardInView(key: unknown) {
  const opened = useRef(false);
  useLayoutEffect(() => {
    const fresh = !opened.current;
    opened.current = true;
    if (fresh) window.scrollTo(0, 0);
    const card = document.querySelector<HTMLElement>(".fc-paper .fc-card, .fc-paper .fc-sum");
    if (!card) return;
    const stick = document.querySelector<HTMLElement>(".fc-stick");
    const pads = document.querySelectorAll<HTMLElement>(".fc-paper .fc-pad");
    const pad = pads[pads.length - 1];
    const top = (stick ? stick.getBoundingClientRect().bottom : 0) + 6;
    const bottom = (pad ? pad.getBoundingClientRect().top : window.innerHeight) - 6;
    const r = card.getBoundingClientRect();
    const dy = r.bottom > bottom || r.top < top ? Math.min(r.bottom - bottom, r.top - top) : 0;
    if (Math.abs(dy) < 3) return;
    if (fresh || typeof window.scrollBy !== "function") window.scrollTo(0, window.scrollY + dy);
    else window.scrollBy({ top: dy, behavior: "smooth" });
  }, [key]);
}

function Marking(props: {
  v: View;
  paper: MasterPaper;
  level: MasterLevel;
  keyQ: { answers: KeyAnswer[] } | null | undefined;
  lock: { current: number };
  onClear: () => void;
}) {
  const { v, paper, level, keyQ, lock } = props;
  const each = marksOfLevel(v, level);
  const qs = questionsOf(level);
  const at = Math.min(paper.at, qs.length);
  useCardInView(`${level.n}:${at}:${v.where === "absent"}`); // the signed-out line comes or goes: the card moves
  // A corrected level shows what the teachers did with each lost question (E = Evaluation, T = Theory).
  const fixedLevel = !!v.mm.lv[String(level.n)]?.fixed;
  if (!each) {
    return (
      <Empty title="This workbook doesn't list each question's marks">
        Correct Level {level.n} on Class (at the top): tap his name, then Level {level.n} in his marks table (the level's total and
        which questions lost marks).
      </Empty>
    );
  }
  const answers = new Map((keyQ?.answers ?? []).map((a) => [a.q, a]));
  const go = (i: number) => setPaper({ ...paper, at: i });
  const marked = qs.filter((q) => paper.given[q]);
  return (
    <>
      <Strip qs={qs} each={each} given={paper.given} at={at} onGo={go} teach={fixedLevel ? (q) => teachState(v.mm.q[String(q)]) : undefined} />
      {paper.resumed && !paper.carriedFrom && !paper.remark && (
        <p class="fc-resumed">
          {paper.resumed.count} already marked ({slClock(paper.resumed.at)}): tap a box above to check one.{" "}
          <button type="button" class="link-btn" onClick={props.onClear}>
            Clear them
          </button>
        </p>
      )}
      {keyQ === null && <p class="fc-nokey">No answer key for this workbook yet: check each answer yourself.</p>}
      {at < qs.length ? (
        <QuestionCard
          key={qs[at]}
          v={v}
          paper={paper}
          qs={qs}
          i={at}
          max={each[at]}
          k={answers.get(qs[at])}
          keyLoading={keyQ === undefined}
          noKey={keyQ === null}
          lock={lock}
        />
      ) : (
        <Summary key={`sum${level.n}`} v={v} paper={paper} level={level} each={each} qs={qs} lock={lock} />
      )}
      {marked.length > 0 && !paper.resumed && !paper.remark && at < qs.length && (
        <button type="button" class="link-btn fc-clear" onClick={props.onClear}>
          Clear these marks
        </button>
      )}
    </>
  );
}

/** What the teachers did with a lost question: E (Evaluation) / T (Theory), filled = done, hollow = waiting. */
const TEACH_WORDS: Record<TeachState, string> = {
  eval: "waiting for Evaluation",
  explained: "explained by Evaluation",
  theory: "sent to Theory, not taught yet",
  taught: "taught by Theory",
};

/** The level's questions as small boxes: where he is, and each mark given. Tap one to see or change it. */
function Strip(props: {
  qs: number[];
  each: number[];
  given: Record<number, Given>;
  at: number;
  onGo: (i: number) => void;
  teach?: (q: number) => TeachState | null;
}) {
  const { qs, each, given, at } = props;
  return (
    <HRow as="ol" class="fc-strip" label="Questions of this level" list={qs[0]} at={at}>
      {qs.map((q, i) => {
        const g = given[q];
        const cls = !g ? "" : g.dk ? " dk" : g.g === each[i] ? " full" : g.g === 0 ? " zero" : " part";
        const words = !g ? "not marked" : g.dk ? (g.dkp?.length ? `${g.g} of ${each[i]}, ? ${g.dkp.join(" ")} blank` : "? blank") : `${g.g} of ${each[i]}`;
        const t = props.teach?.(q) ?? null;
        return (
          <li key={q}>
            <button
              type="button"
              class={`fc-sq${cls}${i === at ? " on" : ""}`}
              aria-current={i === at ? "step" : undefined}
              aria-label={`Q${q}: ${words}${t ? `, ${TEACH_WORDS[t]}` : ""}`}
              onClick={() => props.onGo(i)}
            >
              <small>{q}</small>
              <b>{!g ? "" : g.dk ? (g.dkp?.length ? `${g.g}?` : "?") : g.g}</b>
              {t && (
                <i class={`fc-ts ${t}`} aria-hidden="true">
                  {t === "eval" || t === "explained" ? "E" : "T"}
                </i>
              )}
            </button>
          </li>
        );
      })}
    </HRow>
  );
}

/** On a corrected question that lost marks: what Evaluation and Theory did with it, and when. */
function TeachLine(props: { v: View; level: number; q: number }) {
  const { v } = props;
  if (!v.mm.lv[String(props.level)]?.fixed) return null;
  const r = v.mm.q[String(props.q)];
  const t = teachState(r);
  if (!t || !r) return null;
  const at = t === "explained" ? r.x : t === "taught" ? r.tt : t === "theory" ? r.th : undefined;
  return (
    <p class={`fc-teach ${t}`}>
      <i class={`fc-ts ${t}`} aria-hidden="true">
        {t === "eval" || t === "explained" ? "E" : "T"}
      </i>
      {TEACH_WORDS[t][0].toUpperCase() + TEACH_WORDS[t].slice(1)}
      {at ? `, ${slDay(at) === slDay(serverNow()) ? "" : `${slDate(at)} `}${slClock(at)}` : ""}
    </p>
  );
}

/** A Part II question: its parts' names (i, ii, ...). */
const isPartTwo = (v: View, q: number) => (partOf(v.mb!, q)?.id ?? "").startsWith("II");

function QuestionCard(props: {
  v: View;
  paper: MasterPaper;
  qs: number[];
  i: number;
  max: number;
  k: KeyAnswer | undefined;
  keyLoading: boolean;
  /** The workbook has no key at all (the banner above says so). */
  noKey: boolean;
  lock: { current: number };
}) {
  const { v, paper, qs, i, max, k, lock } = props;
  const q = qs[i];
  const prev = paper.given[q];
  const parts = markedParts(k, max);
  const full = parts?.map((p) => p.m!) ?? null;
  // Parts left blank ("?"), by name: as tapped on this card, else as his mark so far says.
  const blanks = paper.blanks[q] ?? prev?.dkp ?? [];
  const touched = paper.parts[q] !== undefined || paper.blanks[q] !== undefined;
  // Part marks as tapped; before any tap, full marks (unless his mark so far says otherwise: then none is lit).
  const pm = paper.parts[q] ?? (prev && (prev.dk || prev.g !== max) ? null : full);
  // A Part II question without part marks: "? a part left blank" goes with the marks he got.
  const [partBlank, setPartBlank] = useState(() => !parts && !!prev?.dkp?.length);
  const multi = !parts && max >= 3 && isPartTwo(v, q);
  // The big button gives what is shown: the parts once one was changed, else his mark so far, else full marks.
  let offer: Given = prev ?? { g: max };
  if (parts && touched) {
    const marks = pm ?? full!;
    const sum = marks.reduce((a, b) => a + b, 0);
    offer = blanks.length === parts.length ? { g: 0, dk: true } : blanks.length ? { g: sum, dk: true, dkp: [...blanks] } : { g: sum };
  }
  const part = partOf(v.mb!, q)?.id;

  const give = (g: Given) => {
    if (Date.now() < lock.current) return;
    const given = { ...paper.given, [q]: g };
    const next = nextIndex(qs, given, i);
    // The summary's Save sits where the marks were: a longer pause before it can be tapped.
    lock.current = Date.now() + (next === qs.length ? TAP_GUARD_MS * 2 : TAP_GUARD_MS);
    // Kept as his draft on the server (another name keeps it; another phone sees it). A corrected level opened again
    // changes only on this phone until "Save changes".
    if (!paper.remark) queueDraft(paper.studentId, paper.unitId, paper.level, q, g, parts && paper.parts[q] ? paper.parts[q] : undefined);
    setPaper({ ...paper, given, at: next });
  };
  const setPart = (j: number, g: number) => {
    if (Date.now() < lock.current || !full || !parts) return;
    const next = [...(pm ?? full)];
    next[j] = g;
    setPaper({
      ...paper,
      parts: { ...paper.parts, [q]: next },
      blanks: { ...paper.blanks, [q]: blanks.filter((b) => b !== parts[j].p) },
    });
  };
  // "?" on one part: he left it blank (0 marks for it); again = not blank (full marks for it).
  const blankPart = (j: number) => {
    if (Date.now() < lock.current || !full || !parts) return;
    const name = parts[j].p;
    const on = blanks.includes(name);
    const next = [...(pm ?? full)];
    next[j] = on ? full[j] : 0;
    setPaper({
      ...paper,
      parts: { ...paper.parts, [q]: next },
      blanks: { ...paper.blanks, [q]: on ? blanks.filter((b) => b !== name) : [...blanks, name] },
    });
  };
  const tone = offer.dk ? "dk" : offer.g === max ? "full" : offer.g === 0 ? "zero" : "part";
  const blank = (
    <button
      type="button"
      class={`fc-n dk${prev?.dk && !prev.dkp?.length ? " on" : ""}`}
      aria-label={`Q${q}: blank, couldn't start it (to Theory)`}
      onClick={() => give({ g: 0, dk: true })}
    >
      <b>?</b>
      <small>blank</small>
    </button>
  );

  return (
    <>
      <section class={`fc-card${parts ? " with-parts" : ""}`} aria-label={`Question ${q}`}>
        <div class="fc-qhead">
          {i > 0 ? (
            <button type="button" class="fc-back" aria-label={`Back to Q${qs[i - 1]}`} onClick={() => setPaper({ ...paper, at: i - 1 })}>
              ‹ Q{qs[i - 1]}
            </button>
          ) : (
            <span />
          )}
          <span class="fc-qmeta">
            {part ? PART_NAME[part] : ""} · {max} mark{max === 1 ? "" : "s"}
          </span>
        </div>
        <TeachLine v={v} level={paper.level} q={q} />
        <div class="fc-q">
          <span class="fc-qn" aria-hidden="true">
            <small>Q</small>
            {q}
          </span>
          {!parts && (
            <div class="fc-ans">
              {props.keyLoading ? (
                <span class="muted">Loading the answer…</span>
              ) : props.noKey ? null : !k ? (
                <span class="muted">No answer in the key.</span>
              ) : k.parts?.length ? (
                <ul class="fc-parts">
                  {k.parts.map((p, j) => (
                    <li key={j} class="fc-part">
                      <span class="fc-pt">
                        <em>{p.p})</em> <KeyText text={p.a} />
                        {p.m ? <small> ({p.m})</small> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p class="fc-a">
                  <KeyText text={k.a ?? ""} />
                </p>
              )}
            </div>
          )}
        </div>
        {parts && (
          // Each part with its marks, full width: he taps only a part that lost marks (or ? when he left it blank);
          // the big button adds up.
          <ul class="fc-parts">
            {parts.map((p, j) => {
              const isBlank = blanks.includes(p.p);
              return (
                <li key={j} class={`fc-part${isBlank ? " blank" : ""}`}>
                  <span class="fc-pt">
                    <em>{p.p})</em> <KeyText text={p.a} />
                  </span>
                  <span class={`fc-pm${p.m! >= 4 ? " many" : ""}`} role="group" aria-label={`Part ${p.p}, out of ${p.m}`}>
                    <button
                      type="button"
                      class={`fc-pb dk${isBlank ? " on" : ""}`}
                      aria-pressed={isBlank}
                      aria-label={`Part ${p.p}: ? left blank`}
                      onClick={() => blankPart(j)}
                    >
                      ?
                    </button>
                    {Array.from({ length: p.m! + 1 }, (_, g) => {
                      const on = !isBlank && pm?.[j] === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          class={`fc-pb${on ? " on" : ""}${g === p.m ? " full" : g === 0 ? " zero" : ""}`}
                          aria-pressed={on}
                          aria-label={`Part ${p.p}: ${g} of ${p.m}`}
                          onClick={() => setPart(j, g)}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div class="fc-pad">
        {parts ? (
          // The parts give the marks: only "?" (the whole question) and the big button here, so the parts keep the screen.
          <div class="fc-row">
            {blank}
            <GoButton q={q} max={max} offer={offer} tone={tone} onGive={give} />
          </div>
        ) : (
          <>
            {multi && (
              <button
                type="button"
                class={`fc-pblank${partBlank ? " on" : ""}`}
                aria-pressed={partBlank}
                onClick={() => setPartBlank(!partBlank)}
              >
                <b>?</b> {partBlank ? "A part left blank: now tap the marks he got" : "A part left blank (he answered the rest)"}
              </button>
            )}
            <div class={`fc-nums${max >= 5 ? " many" : ""}`} role="group" aria-label={`Marks for Q${q}, out of ${max}`}>
              {blank}
              {Array.from({ length: max + 1 }, (_, g) => {
                const on = !!prev && (partBlank ? !!prev.dkp?.length : !prev.dk) && prev.g === g;
                return (
                  <button
                    key={g}
                    type="button"
                    class={`fc-n${on ? " on" : ""}${g === max ? " full" : g === 0 ? " zero" : ""}`}
                    disabled={partBlank && g === max}
                    aria-label={`Q${q}: ${g} of ${max}${partBlank ? ", a part blank" : ""}`}
                    onClick={() => give(partBlank ? { g, dk: true, dkp: ["part"] } : { g })}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
            <GoButton q={q} max={max} offer={offer} tone={tone} onGive={give} />
          </>
        )}
      </div>
    </>
  );
}

/** The big button: gives what is shown (full marks unless he changed it). */
function GoButton(props: { q: number; max: number; offer: Given; tone: string; onGive: (g: Given) => void }) {
  const { q, max, offer } = props;
  const partBlank = !!offer.dk && !!offer.dkp?.length;
  return (
    <button
      type="button"
      class={`fc-go ${props.tone}`}
      aria-label={`Give Q${q} ${offer.dk && !partBlank ? "? blank" : `${offer.g} of ${max}${partBlank ? `, ? ${offer.dkp!.join(" ")} blank` : ""}`}`}
      onClick={() => props.onGive(offer)}
    >
      {offer.dk && !partBlank ? (
        "? blank"
      ) : (
        <>
          {offer.g === max && <span aria-hidden="true">✓</span>}
          <b>{offer.g}</b> / {max}
          {offer.g === max && <small>full</small>}
          {partBlank && <small>? {offer.dkp!.join(" ")} blank</small>}
        </>
      )}
    </button>
  );
}

function Summary(props: { v: View; paper: MasterPaper; level: MasterLevel; each: number[]; qs: number[]; lock: { current: number } }) {
  const { v, paper, level, each, qs, lock } = props;
  const [busy, setBusy] = useState(false);
  // Save sits where the last mark was tapped: it lights up a moment later, so a double tap can't save.
  const [ready, setReady] = useState(() => Date.now() >= lock.current);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setReady(true), Math.max(0, lock.current - Date.now()));
    return () => clearTimeout(id);
  }, []);
  const missing = qs.filter((q) => !paper.given[q]);
  const sum = sumOf(qs, paper.given);
  const pct = Math.round((sum / level.max) * 100);
  const lostQs = qs.filter((q, i) => paper.given[q] && !paper.given[q].dk && paper.given[q].g < each[i]);
  const blanks = blankWords(qs, paper.given);
  const route = routeOf(paper.to);
  const remark = paper.remark;
  const changed = !remark || !sameGiven(qs, paper.given, remark);
  const back = remark ? autoLevel(v, latestDrafts) : null;
  // Marked at home by the phone (⌂): she looks at his working; Checked when the marks stand, else change and save.
  const home = !!remark && homeToCheck(v.mm.lv[String(level.n)]);
  const checkOk = home && !changed && missing.length === 0;
  const checked = async () => {
    if (!ready || busy) return;
    setBusy(true);
    const r = await act(() => mutate(api.workbook.homeChecked, { studentId: v.s._id, unitId: bookId(v) as Id<"units"> | undefined, level: level.n, by: currentRole() }));
    setBusy(false);
    if (!r) return;
    toast(`Checked: ${v.s.name}, Level ${level.n} (marked at home), ${sum} / ${level.max}.`);
    const still = openPaper?.kind === "master" && openPaper.studentId === paper.studentId && openPaper.level === level.n;
    if (!still) return;
    const next = autoLevel(v, latestDrafts, level.n);
    setPaper(next && next.n !== level.n ? paperAt(v, next) : { kind: "over", studentId: v.s._id, unitId: bookId(v)! });
    window.scrollTo(0, 0);
  };

  const save = async () => {
    if (!ready || busy || missing.length || !changed) return;
    setBusy(true);
    setPaper({ ...paper, saving: true });
    const res = await saveLevel(v, paper, level, false);
    setBusy(false);
    const still = openPaper?.kind === "master" && openPaper.studentId === paper.studentId && openPaper.level === level.n;
    if (!res) {
      if (still && openPaper?.kind === "master") setPaper({ ...openPaper, saving: false });
      return;
    }
    if (!still) return; // another name was tapped meanwhile: that paper stays
    // On to the next level by itself (he did two or three without correcting); after the last, the unit's marks. A
    // corrected level changed: back to the level to correct now.
    const next = remark ? autoLevel(v, latestDrafts) : nextOpen(v, level.n, res.pre);
    setPaper(next && next.n !== level.n ? paperAt(v, next) : { kind: "over", studentId: v.s._id, unitId: bookId(v)! });
    window.scrollTo(0, 0);
  };

  return (
    <>
      <section class={`fc-sum${remark ? " remark" : ""}`} aria-label="The level's marks">
        {paper.carriedFrom && (
          <p class="fc-carried">
            These marks came from the paper taken back from <b>{paper.carriedFrom}</b>. Check them, then save.
          </p>
        )}
        <p class="fc-total">
          <b>{sum}</b> / {level.max}
          <span>{pct}%</span>
        </p>
        {remark && (
          <p class={`fc-remark${home ? " fc-home" : ""}`}>
            {home
              ? changed
                ? "Changed: save to keep it (that checks it too)."
                : missing.length
                  ? "⌂ Marked at home. The phone left the questions below to you: mark them, then save."
                  : "⌂ Marked at home by the phone. Look at his working in his book: Checked if it stands, or tap a question to change it."
              : changed
                ? "Changed: save to keep it."
                : "Corrected before. Tap a question above to change its marks."}
            {back && back.n !== level.n && (
              <>
                {" "}
                <button type="button" class="link-btn" onClick={() => openLevel(v, back.n)}>
                  Back to Level {back.n}
                </button>
              </>
            )}
          </p>
        )}
        {missing.length > 0 && (
          <p class="fc-warn">
            Not marked yet: {missing.map((q) => `Q${q}`).join(" ")}. Tap them above.
          </p>
        )}
        {blanks && (
          <p class="ct-dk">
            <b>?</b> {blanks}: blank, so straight to Theory.
          </p>
        )}
        {lostQs.length > 0 && (
          <div class="fc-route">
            <span class="ct-route-l">Lost marks go to</span>
            <span class="segc" role="group" aria-label="Lost marks go to">
              <button
                type="button"
                class={`segc-b evaluation${route === "evaluation" ? " on" : ""}`}
                aria-pressed={route === "evaluation"}
                onClick={() => setPaper({ ...paper, to: "evaluation" })}
              >
                Evaluation
              </button>
              <button
                type="button"
                class={`segc-b theory${route === "theory" ? " on" : ""}`}
                aria-pressed={route === "theory"}
                onClick={() => setPaper({ ...paper, to: "theory" })}
              >
                Theory
              </button>
            </span>
            <small class="ct-route-why">
              {route === "theory" ? "Theory teaches these again (he forgot the theory)." : "Evaluation explains each one."}
            </small>
          </div>
        )}
        {!remark && <p class="muted small">Tap a question above to see or change its marks. Save opens his next level.</p>}
      </section>
      <div class="fc-pad">
        {checkOk ? (
          <button type="button" class="btn big wide fc-save fc-hcheck" disabled={busy || !ready} onClick={() => void checked()}>
            Checked ✓ · {v.s.name} · {sum} / {level.max}
          </button>
        ) : (
          <button
            type="button"
            class="btn big wide fc-save"
            disabled={busy || !ready || missing.length > 0 || !changed}
            onClick={() => void save()}
          >
            {remark ? (changed ? `Save changes · ${v.s.name} · ${sum} / ${level.max}` : "No changes") : `Save ${v.s.name} · ${sum} / ${level.max}`}
          </button>
        )}
      </div>
    </>
  );
}

// ---- A theory book (Fighter): right / wrong / slip, one question at a time ----

const STATE_SIGN: Partial<Record<MarkState, string>> = { right: "✓", wrong: "✗", slip: "↻", explained: "•", skip: "–" };
const STATE_WORD: Partial<Record<MarkState, string>> = { right: "right", wrong: "wrong", slip: "slip", explained: "explained", skip: "skipped" };

/** "Q19", or a past paper's year ("2019"), as the circles show it. */
function qLabel(f: NonNullable<View["f"]>, q: number): string {
  const l = f.shortLabel(q);
  return l === String(q) ? `Q${l}` : l;
}

function FighterPaperView(props: { v: View; paper: FighterPaper; head: ComponentChildren }) {
  const { v, paper } = props;
  const lock = useRef(0);
  const qs = paper.qs;
  const at = Math.min(paper.at, qs.length);
  useCardInView(`${at}:${v.where === "absent"}`);
  // Questions that opened meanwhile (the past papers, once every ladder question was tried) join at the end.
  useEffect(() => {
    if (at < qs.length || openPaper !== paper) return;
    const more = extendQueue(qs, v.st?.doable ?? []);
    if (more.length > qs.length) setPaper({ ...paper, qs: more });
  });
  return (
    <div class="fc-paper">
      {props.head}
      <FighterStrip v={v} paper={paper} at={at} />
      {at < qs.length ? (
        <FighterCard key={qs[at]} v={v} paper={paper} i={at} lock={lock} />
      ) : (
        <>
          <section class="fc-sum" aria-label="Nothing more to mark">
            <p class="fc-ask">That's every question he can do now.</p>
            <p class="muted">
              {v.st!.finished
                ? "He finished the book."
                : v.st!.doable.length
                  ? "He has redo questions left: they come back after Evaluation or when he tries again."
                  : `Next: ${nothingWhy(v)}.`}
            </p>
            <p class="muted small">Tap a box above to see or change a mark.</p>
          </section>
          <div class="fc-pad">
            <button
              type="button"
              class="btn big wide fc-save"
              onClick={() => {
                leave();
                setPaper(null);
              }}
            >
              Done: {v.s.name}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** His questions as small boxes (a window around the one on screen): each mark, where he is. */
function FighterStrip(props: { v: View; paper: FighterPaper; at: number }) {
  const { v, paper, at } = props;
  const qs = paper.qs;
  const f = v.f!;
  return (
    <HRow as="ol" class="fc-strip" label="His questions" list={v.s._id} at={at}>
      {qs.map((q, i) => {
        const s = v.marks[String(q)]?.s;
        // Only what this paper changed counts as marked here (a redo still shows how it was, faintly).
        const mine = q in paper.base && (paper.base[q]?.s ?? null) !== (s ?? null);
        const cls = s && mine ? ` s-${s}` : s ? ` was` : "";
        return (
          <li key={q}>
            <button
              type="button"
              class={`fc-sq${cls}${i === at ? " on" : ""}`}
              aria-current={i === at ? "step" : undefined}
              aria-label={`${f.longLabel(q)}: ${s ? STATE_WORD[s] : "not marked"}`}
              onClick={() => setPaper({ ...paper, at: i })}
            >
              <small>{f.shortLabel(q)}</small>
              <b>{s && mine ? STATE_SIGN[s] : ""}</b>
            </button>
          </li>
        );
      })}
    </HRow>
  );
}

function FighterCard(props: { v: View; paper: FighterPaper; i: number; lock: { current: number } }) {
  const { v, paper, i, lock } = props;
  const f = v.f!;
  const q = paper.qs[i];
  const label = f.shortLabel(q);
  const sec = f.sectionOf(q);
  const shown = v.marks[String(q)]?.s ?? null;
  const onServer = savedMarks(v.s)[String(q)] ?? null;
  const before = q in paper.base ? paper.base[q] : onServer;
  const mine = q in paper.base && (before?.s ?? null) !== shown;
  const redo = before?.s === "slip" ? "Redo: he slipped before." : before?.s === "explained" ? "Redo after Evaluation explained it." : "";

  const give = (s: MarkState) => {
    if (Date.now() < lock.current) return;
    lock.current = Date.now() + TAP_GUARD_MS;
    setFighterMark(paper.studentId, paper.unitId, q, s, onServer);
    setPaper({ ...paper, base: q in paper.base ? paper.base : { ...paper.base, [q]: onServer }, at: i + 1 });
  };
  const undoMine = () => {
    if (!(q in paper.base)) return;
    setFighterMark(paper.studentId, paper.unitId, q, before?.s ?? null, onServer);
    setPaper({ ...paper });
  };
  const where = sec.kind === "ladder" ? `Section ${sec.badge || sec.id} · ${sec.title}` : sec.kind === "past" ? "Past papers" : "Final challenge";

  return (
    <>
      <section class="fc-card fighter" aria-label={f.longLabel(q)}>
        <div class="fc-qhead">
          {i > 0 ? (
            <button
              type="button"
              class="fc-back"
              aria-label={`Back to ${f.longLabel(paper.qs[i - 1])}`}
              onClick={() => setPaper({ ...paper, at: i - 1 })}
            >
              ‹ {qLabel(f, paper.qs[i - 1])}
            </button>
          ) : (
            <span />
          )}
          <span class="fc-qmeta">{where}</span>
        </div>
        <div class="fc-q">
          <span class="fc-qn" aria-hidden="true">
            {label === String(q) ? <small>Q</small> : null}
            {label}
          </span>
          <div class="fc-ans">
            {mine && shown ? (
              <p class={`fc-now s-${shown}`}>
                Marked {STATE_SIGN[shown]} {STATE_WORD[shown]}.{" "}
                <button type="button" class="link-btn" onClick={undoMine}>
                  Undo
                </button>
              </p>
            ) : (
              <p class="muted small">{redo || "Check his answer in the notebook."}</p>
            )}
            {sec.kind === "past" && <p class="muted small">{f.longLabel(q)}</p>}
          </div>
        </div>
      </section>

      <div class="fc-pad">
        <div class="fc-row2">
          <button
            type="button"
            class={`fc-n wrong${mine && shown === "wrong" ? " on" : ""}`}
            aria-label={`${f.longLabel(q)}: wrong`}
            onClick={() => give("wrong")}
          >
            <b>✗</b>
            <small>wrong</small>
          </button>
          <button
            type="button"
            class={`fc-n slip${mine && shown === "slip" ? " on" : ""}`}
            aria-label={`${f.longLabel(q)}: slip`}
            onClick={() => give("slip")}
          >
            <b>↻</b>
            <small>slip</small>
          </button>
        </div>
        <button type="button" class="fc-go full" aria-label={`${f.longLabel(q)}: right`} onClick={() => give("right")}>
          <span aria-hidden="true">✓</span>
          <b>Right</b>
        </button>
      </div>
    </>
  );
}
