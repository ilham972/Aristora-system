// The whole-class lesson (3 Nov 2026, his ask: "if I am going to teach Grade 10 all students"): the top bar's whiteboard,
// for Theory and Evaluation teachers and the owner. One screen like the Theory page; rules in src/wholeClassData.ts,
// the server convex/teach.ts.
// - Pinned: grades 6–11 and OL (how many are here; every grade can be tapped), Fighter / Master (the theory book or the
//   workbook; pale when the grade has none in the app).
// - The units with that book in the app (number + Tamil), then its sections with teacher questions, or its levels.
// - Everyone here in that grade as pills: ticked = the lesson is saved for him (the page ticks those it is for now);
//   the others pale, with where they are or why; a tap ticks one who has the book. Clear ↔ Page's pick.
// - The questions as squares, one question's card (the answer big, the printed question's icon, teaching mode) and the
//   big ✓ Taught for N: saved at once for the ticked it changes something for (Undo on the toast), then the next
//   question. Nothing left to save on a question: Next question ›.

import { gradeWords, OL } from "../convex/lib/syllabus";
import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { mutate } from "./backend";
import { useQuestionShown } from "./bookQuestion";
import type { View } from "./derive";
import { unitNo } from "./focusData";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { CardAnswer, CardHead, PrintedQuestion, QPill, TeachMode } from "./qcard";
import { GradeRow, KindBar, LessonName, usePinned } from "./roomkit";
import { act, allUnits, clearToasts, may, testMode, toast, unitOf, type Unit } from "./store";
import { NO_HEAT } from "./theoryFocusData";
import { tone } from "./tones";
import {
  canTick,
  doneAll,
  firstGrade,
  firstKind,
  firstLesson,
  firstQ,
  firstUnit,
  hereByGrade,
  lessonsOf,
  pageTick,
  pillWords,
  squareOf,
  toDo,
  unitsWith,
  type Kind,
  type Roster,
  type RosterStudent,
} from "./wholeClassData";

/** What she picked (anything left out: the page's pick), kept on this phone for next time. */
type Pick = { grade?: number; kind?: Kind; unitId?: string };
const PICK_KEY = "aristora.wholeClass";
const GRADES = [6, 7, 8, 9, 10, 11, OL];

function loadPick(): Pick {
  try {
    const p = JSON.parse(localStorage.getItem(PICK_KEY) ?? "{}") as Pick;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}
function savePick(p: Pick) {
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify(p));
  } catch {
    /* private mode */
  }
}

type BookRow = { unitId: string; stage: "fighter" | "master" };

/** The job her taps are recorded under: Theory when she has it (the owner too), else Evaluation. */
const byOf = () => (may("theory") ? "theory" : "evaluation");

/** Her last Taught on this phone: a tap on another lesson, or after a 12-minute gap, starts a new lesson (her score). */
let lastTap: { key: string; at: number } | null = null;
const LESSON_GAP_MS = 12 * 60_000;

export function WholeClassPage(props: { views: View[] }) {
  const { views } = props;
  const books = useQuery<BookRow[]>(api.catalog.books, {});
  const units = allUnits();
  const counts = hereByGrade(views);
  const [pick, setPick] = useState<Pick>(loadPick);
  const stick = usePinned("wc");
  useEffect(() => {
    document.body.classList.add("evx-on");
    return () => document.body.classList.remove("evx-on");
  }, []);
  const choose = (p: Pick) => {
    setPick(p);
    savePick(p);
  };

  const has = (unitId: string, k: Kind) => !!books?.some((b) => b.unitId === unitId && b.stage === k);
  const grade = pick.grade ?? firstGrade(counts, null) ?? 6;
  const unitsOf = (k: Kind) => unitsWith(units, grade, k, has);
  const kind: Kind = pick.kind && unitsOf(pick.kind).length ? pick.kind : firstKind(views, grade, (k) => unitsOf(k).length > 0);
  const list = unitsOf(kind);
  const unit: Unit | null = list.find((u) => u._id === pick.unitId) ?? firstUnit(views, list, kind);
  const inGrade = (v: View) => (grade === OL ? v.s.grade === 10 || v.s.grade === 11 : v.s.grade === grade);
  const hereOn = (k: Kind) => views.filter((v) => v.where !== "absent" && inGrade(v) && v.s.stage === k).length;
  const onUnit = (u: { _id: string }) => views.filter((v) => v.where !== "absent" && v.s.unitId === u._id && v.s.stage === kind).length;

  return (
    <main class="page tp-page ev-page evx-page tpx-page wc-page">
      <div class="stick tp-stick ev-stick" ref={stick}>
        <GradeRow open rows={GRADES.map((g) => ({ grade: g, c: { ...NO_HEAT, total: counts.get(g) ?? 0 } }))} value={grade} onPick={(g) => choose({ grade: g })} />
        <KindBar<Kind>
          value={kind}
          items={[
            { id: "fighter", label: "Fighter", c: { ...NO_HEAT, total: hereOn("fighter") }, open: unitsOf("fighter").length > 0 },
            { id: "master", label: "Master", c: { ...NO_HEAT, total: hereOn("master") }, open: unitsOf("master").length > 0 },
          ]}
          onPick={(k) => choose({ grade, kind: k })}
        />
      </div>

      <div class="tp-body evx-body">
        {books === undefined ? (
          <p class="tp-none">Loading the books…</p>
        ) : list.length === 0 || !unit ? (
          <p class="tp-none">
            No {kind === "fighter" ? "theory book" : "workbook"} for {gradeWords(grade)} in the app yet.
          </p>
        ) : (
          <>
            <HRow as="nav" class="evx-units" label="Units with this book in the app" list={list.map((u) => u._id).join(",")} at={unit._id}>
              {list.map((u) => {
                const on = u._id === unit._id;
                const n = onUnit(u);
                return (
                  <button
                    key={u._id}
                    type="button"
                    class={`evx-u${on ? " on" : ""}`}
                    aria-pressed={on}
                    aria-label={`Unit ${unitNo(u.code)}: ${n} here on it`}
                    onClick={() => choose({ grade, kind, unitId: u._id })}
                  >
                    <span class="tp-ln-n">{unitNo(u.code)}</span>
                    <span class="tp-ln-t" lang="ta">
                      {u.ta || u.en}
                    </span>
                    {n > 0 && <i class="evx-n">{n}</i>}
                  </button>
                );
              })}
            </HRow>
            <Lesson key={`${unit._id}:${kind}`} unit={unit} kind={kind} grade={grade} />
          </>
        )}
      </div>
    </main>
  );
}

/** One book's lesson: its sections or levels, the students here, the squares, the card and Taught. */
function Lesson(props: { unit: Unit; kind: Kind; grade: number }) {
  const { unit, kind } = props;
  const got = useQuery<Roster | null>(api.teach.roster, { unitId: unit._id, stage: kind, test: testMode() });
  // (The answer for the last book may still be on screen for a moment: only this book's counts.)
  const roster = got === null ? null : got && got.unitId === unit._id && got.stage === kind ? got : undefined;
  const [lessonKey, setLessonKey] = useState<string | null>(null);
  // Her ticks for one lesson (else the page's pick for it). The first Taught keeps whoever is ticked then: the page's pick
  // would empty as they get taught (and the squares lose their ✓).
  const [ticks, setTicks] = useState<{ lesson: string; ids: string[] } | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [teaching, setTeaching] = useState(false);

  const lessons = roster ? lessonsOf(roster.data) : [];
  const lesson = lessons.find((l) => l.key === lessonKey) ?? (roster ? firstLesson(roster, lessons) : null);
  // The page's pick holds once it is on screen: taught questions change which lesson "needs it most".
  useEffect(() => {
    if (lessonKey === null && lesson) setLessonKey(lesson.key);
  }, [lessonKey, lesson?.key]);
  const students = roster?.students ?? [];
  const pagePick = lesson ? students.filter((st) => pageTick(st, kind, lesson)).map((st) => st.id) : [];
  const can = (st: RosterStudent) => !!lesson && canTick(st, kind, lesson);
  const mine = lesson && ticks && ticks.lesson === lesson.key ? ticks.ids : null;
  // Her own list keeps everyone who has the book (taught or not); the page's pick only those it saves for.
  const chosen = (mine ?? pagePick).filter((id) => students.some((st) => st.id === id && (mine ? st.has : can(st))));
  const ticked = students.filter((st) => chosen.includes(st.id));
  const taughtN = lesson ? students.filter((st) => doneAll(st, kind, lesson)).length : 0;
  const q = lesson ? (at !== null && lesson.qs.includes(at) ? at : firstQ(lesson, kind, ticked)) : null;
  const now = q !== null ? squareOf(q, kind, ticked) : { n: 0, done: false };
  const printed = useQuestionShown(unit._id, kind, (roster?.qCount ?? 0) > 0);
  useEffect(() => {
    if (teaching && q === null) setTeaching(false);
  }, [teaching, q === null]);

  if (roster === undefined) return <p class="tp-none">Loading the class for this book…</p>;
  if (roster === null) return <p class="tp-none">This book isn't in the app any more.</p>;
  if (!lesson || q === null) {
    return <p class="tp-none">{kind === "fighter" ? "This theory book has no teacher questions." : "This workbook has no levels."}</p>;
  }

  const code = (id: string) => unitOf(id)?.code ?? null;
  const toggle = (st: RosterStudent) => {
    if (!can(st)) {
      toast(
        `${st.name} ${kind === "fighter" ? "doesn't have this theory book" : "has nothing of this level waiting"}: he can listen, nothing is saved for him.`,
      );
      return;
    }
    tone("tick");
    const on = chosen.includes(st.id);
    setTicks({ lesson: lesson.key, ids: on ? chosen.filter((id) => id !== st.id) : [...chosen, st.id] });
  };
  const next = () => {
    if (lesson.qs.length < 2) return;
    setAt(lesson.qs[(lesson.qs.indexOf(q) + 1) % lesson.qs.length]);
  };
  /** ✓ Taught: saved at once for each ticked student it changes something for; Undo on the toast; the next question. */
  const teach = async () => {
    const ids = ticked.filter((st) => toDo(st, kind, q)).map((st) => st.id as Id<"students">);
    if (ids.length === 0) return next();
    if (!mine) setTicks({ lesson: lesson.key, ids: chosen });
    setBusy(true);
    const unitId = unit._id as Id<"units">;
    const key = `${unit._id}:${kind}:${lesson.key}`;
    const fresh = !lastTap || lastTap.key !== key || Date.now() - lastTap.at > LESSON_GAP_MS;
    const res = await act(() => mutate(api.teach.taught, { unitId, stage: kind, q, studentIds: ids, lesson: fresh, by: byOf() }));
    setBusy(false);
    if (!res) return;
    if (res.changed.length) lastTap = { key, at: Date.now() };
    const items = res.changed.map((c) => ({ studentId: c.studentId, was: c.was }));
    if (items.length) {
      tone("tick");
      const q0 = q;
      toast(`Q${q0} taught for ${items.length}.`, "info", () =>
        void act(() => mutate(api.teach.untaught, { unitId, stage: kind, q: q0, items, by: byOf() })).then((r) => {
          if (!r) return;
          tone("clear");
          setAt(q0);
        }),
      );
    }
    const i = lesson.qs.indexOf(q);
    const rest = [...lesson.qs.slice(i + 1), ...lesson.qs.slice(0, i)];
    const to = rest.find((x) => squareOf(x, kind, ticked).n > 0);
    if (to !== undefined) setAt(to);
  };

  const strip = (
    <HRow as="ol" class="fc-strip evx-strip" label="The lesson's questions" list={`${unit._id}:${lesson.key}`} at={q}>
      {lesson.qs.map((x) => {
        const s = squareOf(x, kind, ticked);
        return (
          <li key={x}>
            <button
              type="button"
              class={`fc-sq${s.done ? " dk" : ""}${x === q ? " on" : ""}`}
              aria-current={x === q ? "step" : undefined}
              aria-label={`Q${x}: ${s.done ? "taught" : s.n ? `for ${s.n}` : "nothing to save"}`}
              onClick={() => setAt(x)}
            >
              <small>
                {lesson.section ? `${lesson.section.id}·` : ""}
                {x}
              </small>
              <b>{s.done ? "✓" : s.n > 1 ? `×${s.n}` : ""}</b>
            </button>
          </li>
        );
      })}
    </HRow>
  );
  const meta = lesson.section ? (
    <>
      <b>{lesson.section.id}</b> <span lang="ta">{lesson.section.tamil}</span>
    </>
  ) : (
    `Level ${lesson.label.slice(1)}`
  );
  const answer = (big: boolean, inline = false) => (
    <div class="fc-ans">
      <CardAnswer
        unitId={unit._id}
        q={q}
        stage={kind}
        hasKey={roster.keyCount > 0}
        noKey={big ? "" : "No answer key for this theory book yet."}
        max={big ? 72 : undefined}
        maxH={big ? 210 : undefined}
        inline={inline}
      />
    </div>
  );
  const pad = (
    <div class="fc-pad evx-pad tpx-pad wc-pad">
      {now.n > 0 ? (
        <button type="button" class="fc-go evx-x" disabled={busy} onClick={() => void teach()}>
          <span aria-hidden="true">✓</span>
          <b>Taught</b>
          <small>for {now.n}</small>
        </button>
      ) : (
        // Nothing to save on this question for the ticked (taught already, or nobody ticked): on to the next.
        <button type="button" class={`fc-go evx-x tm-next${now.done ? " wc-done" : ""}`} disabled={busy || lesson.qs.length < 2} onClick={next}>
          {now.done && <span aria-hidden="true">✓</span>}
          <b>Next question ›</b>
        </button>
      )}
    </div>
  );

  return (
    <>
      <HRow as="nav" class="evx-qgs" label={kind === "fighter" ? "Sections with teacher questions" : "Levels"} list={`${unit._id}:${kind}`} at={lesson.key}>
        {lessons.map((l) => {
          const on = l.key === lesson.key;
          const n = students.filter((st) => pageTick(st, kind, l)).length;
          return (
            <button
              key={l.key}
              type="button"
              class={`evx-qg${l.section ? " tpx-sec" : ""}${on ? " on" : ""}`}
              aria-pressed={on}
              aria-label={`${l.section ? `Section ${l.label}: ${l.section.title}` : `Level ${l.label.slice(1)}`}: for ${n} here`}
              onClick={() => {
                setLessonKey(l.key);
                setAt(null);
              }}
            >
              <b>{l.label}</b>
              {l.section && (
                <span class="tp-ln-t" lang="ta">
                  {l.ta}
                </span>
              )}
              <i>{n}</i>
            </button>
          );
        })}
      </HRow>

      <section class="evx-room wc-room" aria-label="The students here">
        <div class="evx-box">
          <p class="evx-bh">
            <b>{chosen.length} ticked</b>
            {taughtN > 0 && <span class="t-green strong">{taughtN} taught</span>}
            <span>{students.length} here</span>
            {students.length > 0 && (
              <button type="button" class="link-btn evx-reset" onClick={() => setTicks(mine ? null : { lesson: lesson.key, ids: [] })}>
                {mine ? "Page's pick" : "Clear"}
              </button>
            )}
          </p>
          <div class="evx-pills" aria-label="Students here: ticked = saved for them">
            {students.map((st) => {
              const on = chosen.includes(st.id);
              const ok = can(st);
              const done = doneAll(st, kind, lesson);
              const words = pillWords(st, kind, unit._id, code);
              return (
                <button
                  key={st.id}
                  type="button"
                  class={`evx-sp s-sug${on ? " on" : ""}${done ? " wc-done" : ok ? "" : " wc-no"}`}
                  data-name={st.name}
                  aria-pressed={on}
                  aria-label={`${st.name}${words ? `: ${words}` : ""}${done ? ", taught already" : ok ? "" : ", nothing to save for him"}`}
                  onClick={() => toggle(st)}
                >
                  {st.name}
                  {words && <small>{words}</small>}
                </button>
              );
            })}
            {students.length === 0 && <p class="evx-none">Nobody from {gradeWords(props.grade)} is here today. You can still go through the book.</p>}
          </div>
        </div>
      </section>

      {!teaching && strip}
      {!teaching && (
        <section class="fc-card evx-card tpx-card" key={`${lesson.key}:${q}`} aria-label={`Q${q}: the whole class`}>
          <CardHead
            label={`Q${q}`}
            n={<QPill label={`Q${q}`} />}
            meta={meta}
            metaCls="tpx-what"
            shown={printed}
            onTeach={() => {
              clearToasts();
              setTeaching(true);
            }}
          />
          {answer(false, printed.open)}
        </section>
      )}
      {!teaching && pad}

      {teaching && (
        <TeachMode
          room="theory"
          title={
            <>
              <LessonName unit={unit} section={lesson.section} kind={lesson.section ? "section" : "workbook"} />
              {!lesson.section && <b class="tm-lv">{lesson.label}</b>}
            </>
          }
          at={`${lesson.key}:${q}`}
          strip={strip}
          pad={pad}
          onClose={() => setTeaching(false)}
        >
          <section class="fc-card evx-card tpx-card tm-card" key={`${lesson.key}:${q}`} aria-label={`Q${q}: the whole class`}>
            <CardHead label={`Q${q}`} n={<QPill label={`Q${q}`} />} meta={`${chosen.length} ticked · ${students.length} here`} />
            <PrintedQuestion unitId={unit._id} stage={kind} q={q} inApp={roster.qCount > 0} />
            {answer(true)}
          </section>
        </TeachMode>
      )}
    </>
  );
}
