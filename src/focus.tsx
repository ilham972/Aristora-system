// The Focus tab: one person corrects workbook levels (Master), fast, without marks landing on the wrong question
// or the wrong student. It is the Correction job (same calls, same alerts) and saves exactly like the Correction
// tab's correct sheet (workbook.correct), so Evaluation and Theory see nothing different. The rules and lists are
// in src/focusData.ts.
//
// 1. Pick the name written on the paper: pills A–Z that never move (grade pills filter). They hide while a paper
//    is open, so a stray tap can't switch the student halfway.
// 2. The level: opens at once when there is one; with two or more the corrector must say which (question numbers).
// 3. One question at a time: its number huge, the answer from the key beside it. One tap each: the big button
//    gives what is shown (full marks unless he lowered a part), a number gives that, ? = blank (to Theory).
//    The next question comes by itself; a second tap right after is ignored.
// 4. The level's marks, where lost marks go, and Save with the student's name on it.
// 5. "Saved on this phone": Take back within 30 minutes (workbook.uncorrect). The marks then wait for the right
//    student: tap his name and the same questions open with them, ready to save.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { PART_NAME, partOf, type MasterLevel } from "../convex/lib/book";
import { boldRuns, type KeyAnswer } from "../convex/lib/key";
import { mutate } from "./backend";
import { CallsBand } from "./correction";
import { fmtMin, tagOf, type View } from "./derive";
import {
  beforeOf,
  candidates,
  CARRY_MS,
  carryLevel,
  focusLists,
  focusNeeds,
  itemsOf,
  markedParts,
  marksOfLevel,
  nextIndex,
  openLevels,
  questionsOf,
  routeOf,
  sumOf,
  TAKE_BACK_MS,
  TAP_GUARD_MS,
  type Before,
  type Carry,
  type FocusLists,
  type Given,
} from "./focusData";
import { GradePills, gradesOf, inGrade, type GradeFilter } from "./grades";
import { useQuery } from "./live";
import { act, bookDocOf, clearToasts, currentRole, may, now as serverNow, toast, type Board } from "./store";
import { Empty, Sheet } from "./ui";

// ---- What the tab remembers while the app is open (switching tabs and back keeps the open paper) ----

type Paper = {
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
  /** Save tapped and not answered yet (its own correction arriving is not "corrected meanwhile"). */
  saving?: boolean;
};

type Saved = {
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

const SAVED_KEY = "aristora.focus.saved";

/** The last saves on this phone survive a reload of the page (Chrome may reload a tab left in the background). */
function loadSaved(): Saved[] {
  try {
    const raw = sessionStorage.getItem(SAVED_KEY);
    const list = raw ? (JSON.parse(raw) as Saved[]) : [];
    return Array.isArray(list) ? list.filter((s) => s && typeof s.studentId === "string" && typeof s.level === "number") : [];
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

/** Open a student's paper: the marks taken back wait for him when his level has the same questions. */
function openFor(v: View, now: number) {
  clearToasts();
  const fits = carryLevel(carry, v, now);
  if (fits && carry) {
    const c = carry;
    carry = null;
    setPaper({
      studentId: v.s._id,
      unitId: v.s.unitId!,
      level: fits.n,
      given: { ...c.given },
      parts: { ...(c.parts ?? {}) },
      at: questionsOf(fits).length,
      to: "auto",
      carriedFrom: c.fromName,
    });
  } else {
    const cs = candidates(v);
    setPaper({ studentId: v.s._id, unitId: v.s.unitId!, level: cs.length === 1 ? cs[0].n : null, given: {}, parts: {}, at: 0, to: "auto" });
  }
  window.scrollTo(0, 0);
}

/** Take a saved level back (after the corrector confirmed): it goes back to how it was; its marks wait for the right student. */
async function takeBack(s: Saved): Promise<boolean> {
  const v = latestViews.find((x) => x.s._id === s.studentId);
  if (!v || v.s.unitId !== s.unitId) {
    toast(`${s.name} is on another workbook now. Use the Correction tab.`, "error");
    return false;
  }
  const fixed = v.mm.lv[String(s.level)]?.fixed;
  if (!fixed) {
    toast("Still saving. Try again in a moment.", "error");
    return false;
  }
  if (Math.abs(fixed - s.at) > 2 * 60_000) {
    toast(`${s.name}'s Level ${s.level} was corrected again since. Open it on the Correction tab.`, "error");
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

// ---- The tab ----

export function Focus(props: { board: Board; views: View[]; now: number; onAttendance: () => void }) {
  const { board, views, now } = props;
  latestViews = views;
  const paper = useFocusState();
  const lists = focusLists(views);
  const offered = [...lists.here, ...lists.gone];
  const grades = gradesOf(offered);
  const [grade, setGrade] = useFocusGrade(grades);
  const v = paper ? (views.find((x) => x.s._id === paper.studentId) ?? null) : null;
  const lost = !!paper && (!v || v.s.unitId !== paper.unitId || !v.ms || !v.mb);

  // While a paper is open, toasts show at the top: nothing may sit over the number pad.
  const marking = !!paper && !lost;
  useEffect(() => {
    document.body.classList.toggle("fc-marking", marking);
    return () => document.body.classList.remove("fc-marking");
  }, [marking]);
  // His paper can't be marked any more (removed, or moved to another book meanwhile): close it, say why.
  useEffect(() => {
    if (!lost || !paper) return;
    const name = v?.s.name ?? "That student";
    setPaper(null);
    toast(`${name} is no longer on that workbook: the paper was closed, nothing saved.`, "error");
  }, [lost]);

  return (
    <main class="page fc-page">
      <div class="stick">
        <CallsBand board={board} views={views} now={now} />
        {!marking && <GradePills views={offered} needs={focusNeeds(views)} filter={grade} onPick={setGrade} />}
      </div>
      {marking && v ? (
        <PaperView v={v} paper={paper!} now={now} />
      ) : (
        <Picker views={views} lists={lists} grade={grade} grades={grades} now={now} onAttendance={props.onAttendance} />
      )}
    </main>
  );
}

// ---- Picking the student ----

function Picker(props: {
  views: View[];
  lists: FocusLists;
  grade: GradeFilter;
  grades: number[];
  now: number;
  onAttendance: () => void;
}) {
  const { lists, grade, now } = props;
  const here = inGrade(lists.here, grade);
  const gone = inGrade(lists.gone, grade);
  const noBook = inGrade(lists.noBook, grade);
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
        <Empty title="No workbook levels to correct">Workbook students in class show here, with their levels.</Empty>
      ) : grouped ? (
        props.grades
          .filter((g) => here.some((v) => v.s.grade === g))
          .map((g) => (
            <section key={g} class="fc-group" aria-label={`Grade ${g}`}>
              <h3 class="fc-h">Grade {g}</h3>
              <Pills list={here.filter((v) => v.s.grade === g)} now={now} onPick={pick} />
            </section>
          ))
      ) : (
        here.length > 0 && <Pills list={here} now={now} onPick={pick} />
      )}

      {noBook.length > 0 && (
        <p class="muted small fc-nobook">
          No workbook in the app for: {noBook.map((v) => `${v.s.name} (${tagOf(v.s, v.unit)})`).join(", ")}.
        </p>
      )}

      {gone.length > 0 && (
        <section class="fc-group" aria-label="Gone home, levels to correct">
          <h3 class="fc-h">Gone home: levels to correct</h3>
          <Pills list={gone} now={now} onPick={pick} />
        </section>
      )}

      <SavedList now={now} />

      <p class="muted small fc-help">
        Tap the name on the paper. Then one tap for each question: the big green button is full marks, a number gives
        fewer, <b>?</b> = blank (he couldn't start it, goes to Theory). The next question comes by itself.
      </p>
      {lists.fighters > 0 && (
        <p class="muted small">
          Theory-book students ({lists.fighters} in class): correct them on the Correction tab.
        </p>
      )}
    </>
  );
}

function Pills(props: { list: View[]; now: number; onPick: (v: View) => void }) {
  const needs = focusNeeds(props.list);
  return (
    <div class="fc-pills">
      {props.list.map((v) => {
        const cs = candidates(v);
        const waiting = new Set(v.ms!.waiting.map((l) => l.n));
        const noKey = !bookDocOf(v.s)?.keyCount;
        const need = needs.get(v.s._id);
        const words = cs.map((l) => `Level ${l.n}${waiting.has(l.n) ? " handed in" : ""}`).join(", ");
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
                <i key={l.n} class={waiting.has(l.n) ? "w" : ""}>
                  L{l.n}
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
  return (
    <section class="fc-saved" aria-label="Saved on this phone">
      <h3 class="fc-h">Saved on this phone</h3>
      <ul>
        {saved.map((s) => {
          const canTake = !s.back && now - s.at < TAKE_BACK_MS;
          return (
            <li key={s.id} class={`fc-sv${s.back ? " back" : ""}`}>
              <span class="fc-sv-t">
                <span class="fc-sv-l">
                  <b>{s.name}</b> · L{s.level} · {s.got} / {s.max}
                </span>
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
          title={`Take back ${asking.name}'s Level ${asking.level}?`}
          sub={`Saved ${asking.got} / ${asking.max} on the wrong student or the wrong level? It goes back to how it was before.`}
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
                  await takeBack(asking);
                  setBusy(false);
                  setAsking(null);
                }}
              >
                Take back
              </button>
            </div>
          }
        >
          <p class="muted">The marks stay on this phone: tap the right student next and they go to him, ready to save.</p>
        </Sheet>
      )}
    </section>
  );
}

// ---- One paper ----

function PaperView(props: { v: View; paper: Paper; now: number }) {
  const { v, paper, now } = props;
  const mb = v.mb!;
  const level = paper.level !== null ? (mb.levels.find((l) => l.n === paper.level) ?? null) : null;
  // The answer key comes only while a paper is open (it never travels with the board).
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: v.s.unitId });
  const [asking, setAsking] = useState<null | "close" | "level">(null);
  const lock = useRef(0);
  const marks = Object.keys(paper.given).length;

  const close = () => (marks ? setAsking("close") : setPaper(null));
  const changeLevel = () => (marks ? setAsking("level") : setPaper({ ...paper, level: null, given: {}, parts: {}, at: 0, carriedFrom: undefined }));
  const fixedNow = level && !paper.saving ? v.mm.lv[String(level.n)]?.fixed : undefined;

  return (
    <div class="fc-paper">
      <header class="fc-head">
        <div class="fc-who">
          <h2 class="fc-name">{v.s.name}</h2>
          <p class="fc-where">
            {tagOf(v.s, v.unit)}
            {level ? ` · Level ${level.n} · Q${level.from}–${level.to}` : ""}
          </p>
        </div>
        {level && (
          <button type="button" class="btn ghost small fc-chlv" onClick={changeLevel}>
            Change level
          </button>
        )}
        <button type="button" class="icon-btn fc-x" aria-label="Close this paper" onClick={close}>
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      {fixedNow !== undefined && (
        <p class="fc-warn" role="alert">
          Level {level!.n} is already corrected ({v.mm.lv[String(level!.n)]?.got ?? 0} / {level!.max}). Saving replaces those marks.
        </p>
      )}

      {!level ? (
        <LevelChoice
          v={v}
          now={now}
          onPick={(n) => {
            lock.current = Date.now() + TAP_GUARD_MS;
            setPaper({ ...paper, level: n, given: {}, parts: {}, at: 0, carriedFrom: undefined });
          }}
        />
      ) : (
        <Marking v={v} paper={paper} level={level} keyQ={keyQ} lock={lock} />
      )}

      {asking && (
        <Sheet
          title={asking === "close" ? `Close ${v.s.name}'s paper?` : "Another level?"}
          sub={`${marks} question${marks === 1 ? " is" : "s are"} marked and not saved. ${asking === "close" ? "Closing" : "Changing the level"} throws those marks away.`}
          onClose={() => setAsking(null)}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={() => setAsking(null)}>
                Keep marking
              </button>
              <button
                type="button"
                class="btn danger"
                onClick={() => {
                  const was = asking;
                  setAsking(null);
                  if (was === "close") setPaper(null);
                  else setPaper({ ...paper, level: null, given: {}, parts: {}, at: 0, carriedFrom: undefined });
                }}
              >
                Throw them away
              </button>
            </div>
          }
        >
          <p class="muted">Nothing is saved until you tap Save at the end of the level.</p>
        </Sheet>
      )}
    </div>
  );
}

/** Which level is this paper? Only asked when there is more than one it could be. */
function LevelChoice(props: { v: View; now: number; onPick: (n: number) => void }) {
  const { v, now } = props;
  const cs = candidates(v);
  const rest = openLevels(v).filter((l) => !cs.some((c) => c.n === l.n));
  const [other, setOther] = useState(cs.length === 0);
  const waiting = new Set(v.ms!.waiting.map((l) => l.n));
  const button = (l: MasterLevel) => {
    const done = v.mm.lv[String(l.n)]?.done;
    return (
      <button key={l.n} type="button" class={`fc-lv${waiting.has(l.n) ? " w" : ""}`} onClick={() => props.onPick(l.n)}>
        <b>Level {l.n}</b>
        <span>
          Q{l.from}–{l.to}
        </span>
        <small>
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
  paper: Paper;
  level: MasterLevel;
  keyQ: { answers: KeyAnswer[] } | null | undefined;
  lock: { current: number };
}) {
  const { v, paper, level, keyQ, lock } = props;
  const each = marksOfLevel(v, level);
  if (!each) {
    return (
      <Empty title="This workbook doesn't list each question's marks">
        Correct Level {level.n} on the Correction tab (the level's total and which questions lost marks).
      </Empty>
    );
  }
  const qs = questionsOf(level);
  const at = Math.min(paper.at, qs.length);
  const answers = new Map((keyQ?.answers ?? []).map((a) => [a.q, a]));
  const go = (i: number) => setPaper({ ...paper, at: i });
  return (
    <>
      <Strip qs={qs} each={each} given={paper.given} at={at} onGo={go} />
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
          lock={lock}
        />
      ) : (
        <Summary v={v} paper={paper} level={level} each={each} qs={qs} lock={lock} />
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
  paper: Paper;
  qs: number[];
  i: number;
  max: number;
  k: KeyAnswer | undefined;
  keyLoading: boolean;
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
              ) : !k ? (
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

function Summary(props: { v: View; paper: Paper; level: MasterLevel; each: number[]; qs: number[]; lock: { current: number } }) {
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
      if (openPaper) setPaper({ ...openPaper, saving: false });
      return;
    }
    saved = [
      {
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
      },
      ...saved,
    ].slice(0, 5);
    keepSaved();
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
