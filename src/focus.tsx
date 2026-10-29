// The Focus tab: one person corrects, fast, without marks landing on the wrong question or the wrong student. It is
// the Correction job (same calls, same alerts) and saves exactly like the Correction tab, so Evaluation and Theory
// see nothing different. The rules and lists are in src/focusData.ts, the saving as you go in src/focusSave.ts.
//
// 1. Pick the name on the paper or notebook: pills A–Z per grade that never move (grade pills filter). They hide
//    while a paper is open, so a stray tap can't switch the student halfway.
// 2. Workbook (Master): the level opens at once when there is one; with two or more the corrector says which. One
//    question at a time: number huge, the key's answer beside it, one tap each (the big button = full marks, a number
//    gives that, ? = blank). The next question comes by itself; a tap right after is ignored. Every mark is kept as a
//    draft on the server, so Stop keeps them and the paper opens again where it stopped. At the end: the level's
//    marks, where lost marks go, Save with the student's name on it (workbook.correct).
// 3. Theory book (Fighter): the questions he can do now, in book order, one at a time: ✓ right, ✗ wrong, ↻ slip,
//    saved like the Correction tab's circles (marks.setMany). Stop when his notebook ends.
// 4. "Saved on this phone": Take back within 30 minutes (a level: workbook.uncorrect, its marks then wait for the
//    right student; theory marks: put back as they were).

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { PART_NAME, partOf, type MasterLevel } from "../convex/lib/book";
import { slClock } from "../convex/lib/day";
import { boldRuns, type KeyAnswer } from "../convex/lib/key";
import type { Mark, MarkState } from "../convex/lib/status";
import { errorText, mutate } from "./backend";
import { CallsBand } from "./correction";
import { fmtMin, tagOf, type View } from "./derive";
import {
  beforeOf,
  candidates,
  CARRY_MS,
  carryLevel,
  draftOf,
  extendQueue,
  fighterQueue,
  focusLists,
  focusNeeds,
  fromDraft,
  itemsOf,
  markedParts,
  marksOfLevel,
  nextIndex,
  nothingWhy,
  openLevels,
  questionsOf,
  resumeAt,
  routeOf,
  sumOf,
  TAKE_BACK_MS,
  TAP_GUARD_MS,
  type Before,
  type Carry,
  type Draft,
  type FocusLists,
  type Given,
} from "./focusData";
import { dropDraft, flushFocus, queueDraft, setFighterMark } from "./focusSave";
import { GradePills, gradesOf, inGrade, type GradeFilter } from "./grades";
import { useQuery } from "./live";
import { act, bookDocOf, clearToasts, currentRole, may, now as serverNow, savedMarks, toast, type Board } from "./store";
import { Empty, Sheet } from "./ui";

// ---- What the tab remembers while the app is open (switching tabs and back keeps the open paper) ----

type MasterPaper = {
  kind: "master";
  studentId: string;
  unitId: string;
  /** null: the corrector must say which level the paper is. */
  level: number | null;
  given: Record<number, Given>;
  /** A Part II question's part marks, once he changed one (the big button then gives their sum). */
  parts: Record<number, number[]>;
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

type Paper = MasterPaper | FighterPaper;

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
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}
function setPaper(p: Paper | null) {
  openPaper = p;
  emit();
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

/** This phone's grade filter for the Focus tab, remembered (its own, not the Correction tab's). */
function useFocusGrade(grades: number[]): [GradeFilter, (g: GradeFilter) => void] {
  const [chosen, setChosen] = useState<GradeFilter>(() => {
    try {
      const raw = localStorage.getItem(GRADE_KEY);
      return raw && /^\d+$/.test(raw) ? Number(raw) : "all";
    } catch {
      return "all";
    }
  });
  const set = (g: GradeFilter) => {
    setChosen(g);
    try {
      localStorage.setItem(GRADE_KEY, String(g));
    } catch {
      /* private mode */
    }
  };
  return [chosen !== "all" && grades.length > 1 && grades.includes(chosen) ? chosen : "all", set];
}

/** A workbook paper on this level, with the marks given before (his draft), opening where they stopped. */
function masterAt(v: View, l: MasterLevel): MasterPaper {
  const d = draftOf(latestDrafts, v, l.n);
  const { given, parts } = fromDraft(d);
  const count = Object.keys(given).length;
  return {
    kind: "master",
    studentId: v.s._id,
    unitId: v.s.unitId!,
    level: l.n,
    given,
    parts,
    at: resumeAt(questionsOf(l), given),
    to: "auto",
    checked: latestDrafts !== undefined,
    ...(d && count ? { resumed: { count, at: d.updatedAt } } : {}),
  };
}

/** Open a student's paper: his theory book, or his workbook (the marks taken back wait for him on the same questions). */
function openFor(v: View, now: number) {
  clearToasts();
  if (v.kind === "fighter") {
    setPaper({ kind: "fighter", studentId: v.s._id, unitId: v.s.unitId!, qs: fighterQueue(v), at: 0, base: {} });
  } else {
    const fits = carryLevel(carry, v, now);
    if (fits && carry) {
      const c = carry;
      carry = null;
      const qs = questionsOf(fits);
      // The marks are his now: kept as his draft at once, like any marks (Stop keeps them).
      for (const q of qs) if (c.given[q]) queueDraft(v.s._id, v.s.unitId!, fits.n, q, c.given[q], c.parts?.[q]);
      setPaper({
        kind: "master",
        studentId: v.s._id,
        unitId: v.s.unitId!,
        level: fits.n,
        given: { ...c.given },
        parts: { ...(c.parts ?? {}) },
        at: qs.length,
        to: "auto",
        carriedFrom: c.fromName,
        checked: true,
      });
    } else {
      const cs = candidates(v);
      setPaper(
        cs.length === 1
          ? masterAt(v, cs[0])
          : { kind: "master", studentId: v.s._id, unitId: v.s.unitId!, level: null, given: {}, parts: {}, at: 0, to: "auto" },
      );
    }
  }
  window.scrollTo(0, 0);
}

/** Stop: close the paper. Every mark is already kept (or goes now); theory marks join "Saved on this phone". */
function stopPaper() {
  const p = openPaper;
  if (!p) return;
  if (p.kind === "fighter") {
    const v = latestViews.find((x) => x.s._id === p.studentId);
    const items: SavedMarks["items"] = [];
    const prev: SavedMarks["prev"] = [];
    for (const [k, was] of Object.entries(p.base)) {
      const s = v?.marks[k]?.s ?? null;
      if ((was?.s ?? null) === s) continue;
      items.push({ q: Number(k), s });
      prev.push({ q: Number(k), mark: was });
    }
    if (v && items.length) {
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
  }
  setPaper(null);
  void flushFocus();
}

/** Take a saved level back (after the corrector confirmed): it goes back to how it was; its marks wait for the right student. */
async function takeBackLevel(s: SavedLevel): Promise<boolean> {
  const v = latestViews.find((x) => x.s._id === s.studentId);
  if (!v || v.s.unitId !== s.unitId) {
    toast(`${s.name} is on another book now. Use Class at the top (tap his name).`, "error");
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
  emit();
  toast(`Taken back: ${s.name}'s marks are as they were.`);
  return true;
}

// ---- The tab ----

export function Focus(props: { board: Board; views: View[]; now: number; onAttendance: () => void }) {
  const { board, views, now } = props;
  latestViews = views;
  const drafts = useQuery<Draft[]>(api.focus.drafts, {});
  latestDrafts = drafts;
  const paper = useFocusState();
  const lists = focusLists(views);
  const offered = [...lists.here, ...lists.gone];
  const grades = gradesOf(offered);
  const [grade, setGrade] = useFocusGrade(grades);
  const v = paper ? (views.find((x) => x.s._id === paper.studentId) ?? null) : null;
  const lost =
    !!paper && (!v || v.s.unitId !== paper.unitId || (paper.kind === "fighter" ? !v.st || !v.f : !v.ms || !v.mb));

  // While a paper is open, toasts show at the top: nothing may sit over the pad.
  const marking = !!paper && !lost;
  useEffect(() => {
    document.body.classList.toggle("fc-marking", marking);
    return () => document.body.classList.remove("fc-marking");
  }, [marking]);
  // His paper can't be marked any more (removed, or moved to another book meanwhile): close it, say why.
  useEffect(() => {
    if (!lost || !paper) return;
    const name = v?.s.name ?? "That student";
    stopPaper();
    toast(`${name} is no longer on that book: the paper was closed. Marks given before were kept.`, "error");
  }, [lost]);

  return (
    <main class="page fc-page">
      <div class="stick">
        <CallsBand board={board} views={views} now={now} />
        {!marking && <GradePills views={offered} needs={focusNeeds(views)} filter={grade} onPick={setGrade} />}
      </div>
      {marking && v && paper ? (
        paper.kind === "fighter" ? (
          <FighterPaperView v={v} paper={paper} />
        ) : (
          <MasterPaperView v={v} paper={paper} drafts={drafts} now={now} />
        )
      ) : (
        <Picker views={views} lists={lists} drafts={drafts} grade={grade} grades={grades} now={now} onAttendance={props.onAttendance} />
      )}
    </main>
  );
}

// ---- Picking the student ----

function Picker(props: {
  views: View[];
  lists: FocusLists;
  drafts: Draft[] | undefined;
  grade: GradeFilter;
  grades: number[];
  now: number;
  onAttendance: () => void;
}) {
  const { lists, grade, now, drafts } = props;
  const here = inGrade(lists.here, grade);
  const gone = inGrade(lists.gone, grade);
  const noBook = inGrade(lists.noBook, grade);
  const nothing = inGrade(lists.nothing, grade);
  const grouped = grade === "all" && props.grades.length > 1;
  const inClass = props.views.some((v) => v.where !== "absent");
  const waitingCarry = carry && now - carry.at <= CARRY_MS ? carry : null;
  const pick = (v: View) => openFor(v, now);

  if (props.views.length === 0) {
    return (
      <Empty title="No students yet">
        {may("students") ? "Open settings (the gear at the top) to add your students." : "The owner adds students in Settings."}
      </Empty>
    );
  }
  return (
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
      {!inClass && lists.gone.length === 0 ? (
        <div class="empty">
          <p class="empty-title">Nobody is signed in yet</p>
          <p>Students show here once they are signed in on Attendance.</p>
          <button type="button" class="btn primary" onClick={props.onAttendance}>
            Open Attendance
          </button>
        </div>
      ) : here.length === 0 && gone.length === 0 ? (
        <Empty title="Nothing to mark right now">Students in class with a workbook level or theory-book questions show here.</Empty>
      ) : grouped ? (
        props.grades
          .filter((g) => here.some((v) => v.s.grade === g))
          .map((g) => (
            <section key={g} class="fc-group" aria-label={`Grade ${g}`}>
              <h3 class="fc-h">Grade {g}</h3>
              <Pills list={here.filter((v) => v.s.grade === g)} drafts={drafts} onPick={pick} />
            </section>
          ))
      ) : (
        here.length > 0 && <Pills list={here} drafts={drafts} onPick={pick} />
      )}

      {gone.length > 0 && (
        <section class="fc-group" aria-label="Gone home, levels to correct">
          <h3 class="fc-h">Gone home: levels to correct</h3>
          <Pills list={gone} drafts={drafts} onPick={pick} />
        </section>
      )}

      {nothing.length > 0 && (
        <p class="muted small fc-nothing">
          Nothing to mark now: {nothing.map((v) => `${v.s.name} (${nothingWhy(v)})`).join(", ")}.
        </p>
      )}
      {noBook.length > 0 && (
        <p class="muted small fc-nobook">
          No book in the app for: {noBook.map((v) => `${v.s.name} (${tagOf(v.s, v.unit)})`).join(", ")}.
        </p>
      )}

      <SavedList now={now} />

      <p class="muted small fc-help">
        Tap the name on the paper. Workbook: one tap for each question (the big green button is full marks, a number gives
        fewer, <b>?</b> = blank). Theory book: <b>✓</b> right, <b>✗</b> wrong, <b>↻</b> slip. The next question comes by
        itself, and <b>Stop</b> keeps every mark. <b>Later</b> = handed in, correct it later. Two levels on a name: one
        handed in (amber) and the one he is on now.
      </p>
    </>
  );
}

function Pills(props: { list: View[]; drafts: Draft[] | undefined; onPick: (v: View) => void }) {
  const needs = focusNeeds(props.list);
  return (
    <div class="fc-pills">
      {props.list.map((v) => {
        const need = needs.get(v.s._id);
        if (v.kind === "fighter") {
          const qs = v.st!.doable;
          const first = qLabel(v.f!, qs[0]);
          return (
            <button
              key={v.s._id}
              type="button"
              class="fc-pill th"
              aria-label={`${v.s.name}: theory book, ${v.f!.longLabel(qs[0])} next${qs.length > 1 ? `, ${qs.length} he can do` : ""}`}
              onClick={() => props.onPick(v)}
            >
              <b class="fc-pn">{v.s.name}</b>
              <span class="fc-tags" aria-hidden="true">
                <i class="th">{first}</i>
                {qs.length > 1 && <i>+{qs.length - 1}</i>}
              </span>
            </button>
          );
        }
        const cs = candidates(v);
        const waiting = new Set(v.ms!.waiting.map((l) => l.n));
        const noKey = !bookDocOf(v.s)?.keyCount;
        const marked = (l: MasterLevel) => Object.keys(draftOf(props.drafts, v, l.n)?.q ?? {}).length;
        const words = cs
          .map((l) => `Level ${l.n}${waiting.has(l.n) ? " handed in" : ""}${marked(l) ? `, ${marked(l)} of ${l.to - l.from + 1} marked` : ""}`)
          .join(", ");
        return (
          <button
            key={v.s._id}
            type="button"
            class={`fc-pill${need ? ` ${need}` : ""}`}
            aria-label={`${v.s.name}: ${words}${noKey ? ", no answer key" : ""}`}
            onClick={() => props.onPick(v)}
          >
            <b class="fc-pn">{v.s.name}</b>
            <span class="fc-tags" aria-hidden="true">
              {cs.slice(0, 3).map((l) => (
                <i key={l.n} class={`${waiting.has(l.n) ? "w" : ""}${marked(l) ? " d" : ""}`}>
                  L{l.n}
                  {marked(l) ? ` ${marked(l)}/${l.to - l.from + 1}` : ""}
                </i>
              ))}
              {cs.length > 3 && <i>+{cs.length - 3}</i>}
              {noKey && <i class="nk">no key</i>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SavedList(props: { now: number }) {
  const { now } = props;
  const [asking, setAsking] = useState<Saved | null>(null);
  const [busy, setBusy] = useState(false);
  if (saved.length === 0) return null;
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
  return (
    <section class="fc-saved" aria-label="Saved on this phone">
      <h3 class="fc-h">Saved on this phone</h3>
      <ul>
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
      {asking && (
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
                  if (asking.kind === "level") await takeBackLevel(asking);
                  else await takeBackMarks(asking);
                  setBusy(false);
                  setAsking(null);
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
      )}
    </section>
  );
}

// ---- One paper ----

/**
 * The paper's top: whose it is (huge), his book, and Stop (every mark is kept). A workbook level he hasn't handed in
 * yet also has Later: handed in, correct it later (the waiting clock starts, he goes on with the next level).
 */
function PaperHead(props: { v: View; later?: () => void; children?: ComponentChildren }) {
  const { v } = props;
  return (
    <header class="fc-head">
      <div class="fc-who">
        <h2 class="fc-name">{v.s.name}</h2>
        <p class="fc-where">
          {tagOf(v.s, v.unit)}
          {v.kind === "fighter" ? " · theory book" : ""}
          {props.children}
        </p>
      </div>
      <div class="fc-head-acts">
        {props.later && (
          <button type="button" class="btn ghost small fc-later" aria-label="Handed in: correct later" onClick={props.later}>
            Later
          </button>
        )}
        <button type="button" class="btn ghost small fc-stop" aria-label="Stop: every mark is kept" onClick={stopPaper}>
          Stop
        </button>
      </div>
    </header>
  );
}

function MasterPaperView(props: { v: View; paper: MasterPaper; drafts: Draft[] | undefined; now: number }) {
  const { v, paper, now } = props;
  const mb = v.mb!;
  const level = paper.level !== null ? (mb.levels.find((l) => l.n === paper.level) ?? null) : null;
  // The answer key comes only while a paper is open (it never travels with the board).
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: v.s.unitId });
  const [clearing, setClearing] = useState(false);
  const lock = useRef(0);
  const marks = Object.keys(paper.given).length;
  const fixedNow = level && !paper.saving ? v.mm.lv[String(level.n)]?.fixed : undefined;

  // Opened before the drafts arrived: load his marks as soon as they do (only if nothing was marked meanwhile).
  useEffect(() => {
    if (!level || paper.checked || props.drafts === undefined || openPaper !== paper) return;
    setPaper(marks ? { ...paper, checked: true } : masterAt(v, level));
  }, [props.drafts, level?.n]);

  const changeLevel = () => setPaper({ kind: "master", studentId: paper.studentId, unitId: paper.unitId, level: null, given: {}, parts: {}, at: 0, to: "auto" });
  // Handed in, to correct later (the level pills on the Class rows did this before): the waiting clock starts.
  const lvNow = level ? v.mm.lv[String(level.n)] : undefined;
  const canLater = !!level && !lvNow?.done && !lvNow?.fixed && v.where !== "absent" && !paper.saving;
  const later = async () => {
    if (!level) return;
    const n = level.n;
    const r = await act(() => mutate(api.workbook.levelDone, { studentId: v.s._id, unitId: v.s.unitId!, level: n, by: currentRole() }));
    if (r) {
      stopPaper();
      toast(`${v.s.name}: Level ${n} handed in. It waits for you as an amber L${n}.`);
    }
  };

  return (
    <div class="fc-paper">
      <PaperHead v={v} later={canLater ? () => void later() : undefined}>
        {level && (
          <>
            {" · "}
            <button type="button" class="fc-lvchip" aria-label={`Level ${level.n}, questions ${level.from} to ${level.to}: change level`} onClick={changeLevel}>
              L{level.n} · Q{level.from}–{level.to} <span aria-hidden="true">▾</span>
            </button>
          </>
        )}
      </PaperHead>

      {fixedNow !== undefined && (
        <p class="fc-warn" role="alert">
          Level {level!.n} is already corrected ({v.mm.lv[String(level!.n)]?.got ?? 0} / {level!.max}). Saving replaces those marks.
        </p>
      )}

      {!level ? (
        <LevelChoice
          v={v}
          drafts={props.drafts}
          now={now}
          onPick={(n) => {
            lock.current = Date.now() + TAP_GUARD_MS;
            setPaper(masterAt(v, mb.levels.find((l) => l.n === n)!));
          }}
        />
      ) : (
        <Marking v={v} paper={paper} level={level} keyQ={keyQ} lock={lock} onClear={() => setClearing(true)} />
      )}

      {clearing && level && (
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
                  setPaper({ ...paper, given: {}, parts: {}, at: 0, carriedFrom: undefined, resumed: undefined });
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

/** Which level is this paper? Only asked when there is more than one it could be. */
function LevelChoice(props: { v: View; drafts: Draft[] | undefined; now: number; onPick: (n: number) => void }) {
  const { v, now } = props;
  const cs = candidates(v);
  const rest = openLevels(v).filter((l) => !cs.some((c) => c.n === l.n));
  const [other, setOther] = useState(cs.length === 0);
  const waiting = new Set(v.ms!.waiting.map((l) => l.n));
  const button = (l: MasterLevel) => {
    const done = v.mm.lv[String(l.n)]?.done;
    const marked = Object.keys(draftOf(props.drafts, v, l.n)?.q ?? {}).length;
    return (
      <button key={l.n} type="button" class={`fc-lv${waiting.has(l.n) ? " w" : ""}`} onClick={() => props.onPick(l.n)}>
        <b>Level {l.n}</b>
        <span>
          Q{l.from}–{l.to}
        </span>
        <small>
          {marked ? `${marked} of ${l.to - l.from + 1} marked · ` : ""}
          {waiting.has(l.n) && done ? `handed in ${fmtMin(now - done)} ago` : v.ms!.current?.n === l.n ? "working on it now" : `/ ${l.max}`}
        </small>
      </button>
    );
  };
  return (
    <section class="fc-levels" aria-label="Which level is this paper?">
      <p class="fc-ask">Which level is this paper? Look at its first question number.</p>
      {cs.map(button)}
      {rest.length > 0 &&
        (other ? (
          rest.map(button)
        ) : (
          <button type="button" class="link-btn fc-other" onClick={() => setOther(true)}>
            Another level…
          </button>
        ))}
    </section>
  );
}

function KeyText(props: { text: string }) {
  return <>{boldRuns(props.text).map(([s, b], i) => (b ? <b key={i}>{s}</b> : s))}</>;
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
  if (!each) {
    return (
      <Empty title="This workbook doesn't list each question's marks">
        Correct Level {level.n} on Class (at the top): tap his name, then Level {level.n} in his marks table (the level's total and
        which questions lost marks).
      </Empty>
    );
  }
  const qs = questionsOf(level);
  const at = Math.min(paper.at, qs.length);
  const answers = new Map((keyQ?.answers ?? []).map((a) => [a.q, a]));
  const go = (i: number) => setPaper({ ...paper, at: i });
  const marked = qs.filter((q) => paper.given[q]);
  return (
    <>
      <Strip qs={qs} each={each} given={paper.given} at={at} onGo={go} />
      {paper.resumed && !paper.carriedFrom && (
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
        <Summary v={v} paper={paper} level={level} each={each} qs={qs} lock={lock} />
      )}
      {marked.length > 0 && !paper.resumed && at < qs.length && (
        <button type="button" class="link-btn fc-clear" onClick={props.onClear}>
          Clear these marks
        </button>
      )}
    </>
  );
}

/** The level's questions as small boxes: where he is, and each mark given. Tap one to see or change it. */
function Strip(props: { qs: number[]; each: number[]; given: Record<number, Given>; at: number; onGo: (i: number) => void }) {
  const { qs, each, given, at } = props;
  return (
    <ol class="fc-strip" aria-label="Questions of this level">
      {qs.map((q, i) => {
        const g = given[q];
        const cls = !g ? "" : g.dk ? " dk" : g.g === each[i] ? " full" : g.g === 0 ? " zero" : " part";
        return (
          <li key={q}>
            <button
              type="button"
              class={`fc-sq${cls}${i === at ? " on" : ""}`}
              aria-current={i === at ? "step" : undefined}
              aria-label={`Q${q}: ${g ? (g.dk ? "? blank" : `${g.g} of ${each[i]}`) : "not marked"}`}
              onClick={() => props.onGo(i)}
            >
              <small>{q}</small>
              <b>{g ? (g.dk ? "?" : g.g) : ""}</b>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

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
  // Part marks as tapped; before any tap, full marks (unless his mark so far says otherwise: then none is lit).
  const pm = paper.parts[q] ?? (prev && (prev.dk || prev.g !== max) ? null : full);
  // The big button gives what is shown: the parts' sum once one was changed, else his mark so far, else full marks.
  const offer: Given = paper.parts[q] ? { g: paper.parts[q].reduce((a, b) => a + b, 0) } : (prev ?? { g: max });
  const part = partOf(v.mb!, q)?.id;

  const give = (g: Given) => {
    if (Date.now() < lock.current) return;
    const given = { ...paper.given, [q]: g };
    const next = nextIndex(qs, given, i);
    // The summary's Save sits where the marks were: a longer pause before it can be tapped.
    lock.current = Date.now() + (next === qs.length ? TAP_GUARD_MS * 2 : TAP_GUARD_MS);
    // Kept as his draft on the server (Stop keeps it; another phone sees it).
    queueDraft(paper.studentId, paper.unitId, paper.level!, q, g, !g.dk ? paper.parts[q] : undefined);
    setPaper({ ...paper, given, at: next });
  };
  const setPart = (j: number, g: number) => {
    if (Date.now() < lock.current || !full) return;
    const next = [...(pm ?? full)];
    next[j] = g;
    setPaper({ ...paper, parts: { ...paper.parts, [q]: next } });
  };
  const tone = offer.dk ? "dk" : offer.g === max ? "full" : offer.g === 0 ? "zero" : "part";
  const blank = (
    <button
      type="button"
      class={`fc-n dk${prev?.dk ? " on" : ""}`}
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
          // Each part with its marks, full width: he taps only a part that lost marks; the big button adds up.
          <ul class="fc-parts">
            {parts.map((p, j) => (
              <li key={j} class="fc-part">
                <span class="fc-pt">
                  <em>{p.p})</em> <KeyText text={p.a} />
                </span>
                <span class={`fc-pm${p.m! >= 4 ? " many" : ""}`} role="group" aria-label={`Part ${p.p}, out of ${p.m}`}>
                  {Array.from({ length: p.m! + 1 }, (_, g) => (
                    <button
                      key={g}
                      type="button"
                      class={`fc-pb${pm?.[j] === g ? " on" : ""}${g === p.m ? " full" : g === 0 ? " zero" : ""}`}
                      aria-pressed={pm?.[j] === g}
                      aria-label={`Part ${p.p}: ${g} of ${p.m}`}
                      onClick={() => setPart(j, g)}
                    >
                      {g}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div class="fc-pad">
        {parts ? (
          // The parts give the marks: only "?" and the big button here, so the parts keep the screen.
          <div class="fc-row">
            {blank}
            <GoButton q={q} max={max} offer={offer} tone={tone} onGive={give} />
          </div>
        ) : (
          <>
            <div class={`fc-nums${max >= 5 ? " many" : ""}`} role="group" aria-label={`Marks for Q${q}, out of ${max}`}>
              {blank}
              {Array.from({ length: max + 1 }, (_, g) => (
                <button
                  key={g}
                  type="button"
                  class={`fc-n${prev && !prev.dk && prev.g === g ? " on" : ""}${g === max ? " full" : g === 0 ? " zero" : ""}`}
                  aria-label={`Q${q}: ${g} of ${max}`}
                  onClick={() => give({ g })}
                >
                  {g}
                </button>
              ))}
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
  return (
    <button
      type="button"
      class={`fc-go ${props.tone}`}
      aria-label={`Give Q${q} ${offer.dk ? "? blank" : `${offer.g} of ${max}`}`}
      onClick={() => props.onGive(offer)}
    >
      {offer.dk ? (
        "? blank"
      ) : (
        <>
          {offer.g === max && <span aria-hidden="true">✓</span>}
          <b>{offer.g}</b> / {max}
          {offer.g === max && <small>full</small>}
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
  const dkQs = qs.filter((q) => paper.given[q]?.dk);
  const route = routeOf(sum, level.max, paper.to);

  const save = async () => {
    if (!ready || busy || missing.length) return;
    setBusy(true);
    setPaper({ ...paper, saving: true });
    // Its draft goes first, so it can't arrive after the level is saved.
    await flushFocus();
    const before = beforeOf(v.mm, level);
    const res = await act(() =>
      mutate(api.workbook.correct, {
        studentId: v.s._id,
        unitId: v.s.unitId,
        level: level.n,
        items: itemsOf(qs, paper.given),
        to: route,
        by: currentRole(),
      }),
    );
    setBusy(false);
    if (!res) {
      if (openPaper?.kind === "master") setPaper({ ...openPaper, saving: false });
      return;
    }
    void dropDraft(paper.studentId, paper.unitId, level.n);
    remember({
      kind: "level",
      id: ++savedIds,
      studentId: v.s._id,
      name: v.s.name,
      unitId: v.s.unitId!,
      tag: tagOf(v.s, v.unit),
      level: level.n,
      from: level.from,
      to: level.to,
      got: res.got,
      max: res.max,
      given: { ...paper.given },
      parts: { ...paper.parts },
      before,
      at: serverNow(),
    });
    setPaper(null);
    const go = (who: string, list: number[]) => (list.length ? ` ${who}: ${list.map((q) => `Q${q}`).join(" ")}.` : "");
    toast(`Saved: ${v.s.name}, Level ${level.n}, ${res.got} / ${res.max}.${go("Theory", res.theory)}${go("Evaluation", res.evaluation)}`);
    window.scrollTo(0, 0);
  };

  return (
    <>
      <section class="fc-sum" aria-label="The level's marks">
        {paper.carriedFrom && (
          <p class="fc-carried">
            These marks came from the paper taken back from <b>{paper.carriedFrom}</b>. Check them, then save.
          </p>
        )}
        <p class="fc-total">
          <b>{sum}</b> / {level.max}
          <span>{pct}%</span>
        </p>
        {missing.length > 0 && (
          <p class="fc-warn">
            Not marked yet: {missing.map((q) => `Q${q}`).join(" ")}. Tap them above.
          </p>
        )}
        {dkQs.length > 0 && (
          <p class="ct-dk">
            <b>?</b> {dkQs.map((q) => `Q${q}`).join(" ")}: blank, so straight to Theory.
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
              {route === "theory"
                ? paper.to === "auto"
                  ? "Under half: he forgot the theory, so Theory teaches it again."
                  : "Theory teaches these again."
                : "Evaluation explains each one."}
            </small>
          </div>
        )}
        <p class="muted small">Tap a question above to see or change its marks.</p>
      </section>
      <div class="fc-pad">
        <button type="button" class="btn big wide fc-save" disabled={busy || !ready || missing.length > 0} onClick={() => void save()}>
          Save {v.s.name} · {sum} / {level.max}
        </button>
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

function FighterPaperView(props: { v: View; paper: FighterPaper }) {
  const { v, paper } = props;
  const lock = useRef(0);
  const qs = paper.qs;
  const at = Math.min(paper.at, qs.length);
  // Questions that opened meanwhile (the past papers, once every ladder question was tried) join at the end.
  useEffect(() => {
    if (at < qs.length || openPaper !== paper) return;
    const more = extendQueue(qs, v.st?.doable ?? []);
    if (more.length > qs.length) setPaper({ ...paper, qs: more });
  });
  return (
    <div class="fc-paper">
      <PaperHead v={v} />
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
            <button type="button" class="btn big wide fc-save" onClick={stopPaper}>
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
  const SHOW = 10;
  const start = Math.max(0, Math.min(at - 3, qs.length - SHOW));
  const end = Math.min(qs.length, start + SHOW);
  return (
    <ol class="fc-strip" aria-label="His questions">
      {qs.slice(start, end).map((q, k) => {
        const i = start + k;
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
      {end < qs.length && (
        <li class="fc-more" aria-hidden="true">
          +{qs.length - end}
        </li>
      )}
    </ol>
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
