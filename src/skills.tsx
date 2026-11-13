// The Skills page (13 Nov 2026, his words: "we have to remove the decision making for the teacher ... like a task list
// one by one ... queue, how many queue and who is come next ... they press done ... Done button only"; and "create same
// like another page" as the teaching mode: the old pages stay as they are). For workbooks whose questions carry skills.
// - Lesson: ONE card, the lesson that the most students here wait for: the skill's number and name, their names (each
//   with the questions it is for), its example question as printed with the answer. She calls them, teaches that one
//   skill, taps Done: saved for everyone ticked (a tap on a name leaves him out: he didn't come). Then the next card.
//   Under it: how many wait, and what comes next. Skip puts a card at the end of the line on this phone.
// - One-to-one: the students here with a question wrong after its lesson, the longest wait first: the question as
//   printed, the answer, the parts still wrong; ✓ Explained closes it (workbook.explain, as on every page).
// Rules: convex/lib/path.ts; the lists: src/pathData.ts; the server: convex/tries.ts.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { mutate } from "./backend";
import type { View } from "./derive";
import { lessonQueue, pathNow, skillWords, stuckList, type LessonEntry, type StuckMember } from "./pathData";
import { CardAnswer, PrintedQuestion } from "./qcard";
import { act, currentRole, toast, unitOf } from "./store";
import { useTags } from "./tries";

type Mode = "lesson" | "one";
const MODE_KEY = "aristora.skills";
const loadMode = (): Mode => {
  try {
    return localStorage.getItem(MODE_KEY) === "one" ? "one" : "lesson";
  } catch {
    return "lesson";
  }
};

export function SkillsPage(props: { views: View[] }) {
  const tags = useTags();
  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* private mode */
    }
  };
  // The toasts sit above the pad, as on the other teaching pages.
  useEffect(() => {
    document.body.classList.add("evx-on");
    return () => document.body.classList.remove("evx-on");
  }, []);
  const queue = lessonQueue(props.views, tags);
  const stuck = stuckList(props.views, tags);
  const n = pathNow(props.views, tags);
  return (
    <main class="page ev-page evx-page sk-page">
      <div class="sk-modes" role="tablist" aria-label="Lesson or one-to-one">
        <button type="button" role="tab" class={`sk-mode${mode === "lesson" ? " on" : ""}`} aria-selected={mode === "lesson"} onClick={() => setMode("lesson")}>
          Lesson <b class={n.lessons ? "hot" : ""}>{n.lessons}</b>
        </button>
        <button type="button" role="tab" class={`sk-mode${mode === "one" ? " on" : ""}`} aria-selected={mode === "one"} onClick={() => setMode("one")}>
          One-to-one <b class={n.stuck ? "hot" : ""}>{n.stuck}</b>
        </button>
        <span class="sk-owed" aria-label={`${n.tries} tries the students still owe`}>
          tries owed <b>{n.tries}</b>
        </span>
      </div>
      {tags.size === 0 ? (
        <p class="tp-none">No workbook has skills yet. Tag a unit first (the skill-tags chat).</p>
      ) : mode === "lesson" ? (
        <Lessons queue={queue} tags={tags} />
      ) : (
        <OneToOne list={stuck} tags={tags} />
      )}
    </main>
  );
}

/** One card: the fullest lesson. It holds still while she teaches (the line under it may change); Done → the next. */
function Lessons(props: { queue: LessonEntry[]; tags: ReturnType<typeof useTags> }) {
  const [cur, setCur] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [off, setOff] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Skipped ones go to the end of the line (this phone only).
  const line = [...props.queue.filter((e) => !skipped.includes(e.skill)), ...props.queue.filter((e) => skipped.includes(e.skill))];
  const entry = line.find((e) => e.skill === cur) ?? line[0] ?? null;
  useEffect(() => {
    if (entry && entry.skill !== cur) {
      setCur(entry.skill);
      setOff([]);
    }
  }, [entry?.skill]);
  if (!entry) return <p class="tp-none sk-none">Nobody here waits for a lesson.</p>;

  const here = entry.members;
  const ticked = here.filter((m) => !m.hold && !off.includes(m.v.s._id));
  const home = entry.home;
  const unit = home ? unitOf(home.unitId) : null;
  const no = home ? skillWords(home, props.tags, entry.skill).no : entry.skill;
  const next = line.find((e) => e.skill !== entry.skill) ?? null;
  const waiting = line.reduce((a, e) => a + e.members.length, 0);

  const done = async () => {
    if (busy || ticked.length === 0) return;
    setBusy(true);
    const ids = ticked.map((m) => m.v.s._id as Id<"students">);
    const res = await act(() => mutate(api.tries.taught, { skill: entry.skill, studentIds: ids, by: currentRole() }));
    setBusy(false);
    if (!res) return;
    if (res.errors.length) toast(res.errors.join(". "), "error");
    else
      toast(`Skill ${no} taught for ${res.done.length}. They do their questions again.`, "info", () => {
        void act(() => mutate(api.tries.untaught, { skill: entry.skill, studentIds: ids, at: res.at, by: currentRole() }));
      });
    setCur(null);
    setOff([]);
  };
  const skip = () => {
    setSkipped((s) => [...s.filter((x) => x !== entry.skill), entry.skill]);
    setCur(null);
    setOff([]);
  };

  return (
    <>
      <section class="fc-card sk-card" aria-label={`Lesson: skill ${no}`}>
        <div class="sk-top">
          <span class="sk-no" aria-hidden="true">
            {no}
          </span>
          <p class="sk-name">
            <b lang="ta">{entry.sk?.ta ?? entry.skill}</b>
            <small>
              {entry.sk?.en ?? ""}
              {unit ? ` · ${unit.grade === 12 ? "O/L" : unit.grade} · ${unit.code}` : ""}
            </small>
          </p>
        </div>
        <ul class="sk-who" aria-label="The students of this lesson">
          {here.map((m) => {
            const on = ticked.includes(m);
            return (
              <li key={m.v.s._id}>
                <button
                  type="button"
                  class={`sk-pill${on ? " on" : ""}${m.hold ? " hold" : ""}`}
                  aria-pressed={on}
                  disabled={!!m.hold}
                  aria-label={`${m.v.s.name}${m.hold ? `, ${m.hold}` : on ? "" : ", left out"}: ${m.qs.map((x) => `question ${x.q}`).join(", ")}`}
                  onClick={() => setOff(on ? [...off, m.v.s._id] : off.filter((x) => x !== m.v.s._id))}
                >
                  <b>{m.v.s.name}</b>
                  <small>{m.hold ?? m.qs.map((x) => x.q).join(", ")}</small>
                </button>
              </li>
            );
          })}
        </ul>
        {home && entry.sk?.eg !== undefined ? (
          <>
            <p class="sk-eg">Teach it with question {entry.sk.eg}:</p>
            <PrintedQuestion unitId={home.unitId} stage="master" q={entry.sk.eg} />
            <div class="fc-ans sk-ans">
              <CardAnswer unitId={home.unitId} q={entry.sk.eg} stage="master" max={72} maxH={210} />
            </div>
          </>
        ) : (
          <p class="fc-anote">This skill has no example question yet: use one of your own.</p>
        )}
      </section>
      <p class="sk-line" aria-live="polite">
        <b>{waiting}</b> waiting in <b>{line.length}</b> {line.length === 1 ? "lesson" : "lessons"}
        {next ? (
          <>
            {" "}
            · next: <b>{next.home ? skillWords(next.home, props.tags, next.skill).no : next.skill}</b> <span lang="ta">{next.sk?.ta ?? ""}</span> ({next.members.length})
          </>
        ) : null}
      </p>
      <div class="fc-pad sk-pad">
        <button type="button" class="btn ghost sk-skip" disabled={busy || line.length < 2} onClick={skip}>
          Skip
        </button>
        <button type="button" class="fc-go sk-done" disabled={busy || ticked.length === 0} onClick={() => void done()}>
          <span aria-hidden="true">✓</span>
          <b>Done</b>
          <small>taught {ticked.length}</small>
        </button>
      </div>
    </>
  );
}

/** One student at a time, the longest wait first; his questions wrong after their lesson, one card each. */
function OneToOne(props: { list: StuckMember[]; tags: ReturnType<typeof useTags> }) {
  const [who, setWho] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const m = props.list.find((x) => x.v.s._id === who) ?? props.list[0] ?? null;
  useEffect(() => {
    if (m && m.v.s._id !== who) setWho(m.v.s._id);
  }, [m?.v.s._id]);
  if (!m) return <p class="tp-none sk-none">Nobody here waits for one-to-one.</p>;
  const item = m.items.find((x) => x.key === at) ?? m.items[0];

  const explained = async () => {
    if (busy) return;
    setBusy(true);
    const unitId = item.tb.unitId as Id<"units">;
    const args = { studentId: m.v.s._id as Id<"students">, unitId, qs: [item.it.q], by: currentRole() };
    const ok = await act(async () => {
      await mutate(api.workbook.explain, { ...args, on: true });
      return true;
    });
    setBusy(false);
    if (!ok) return;
    toast(`Q${item.it.q} explained to ${m.v.s.name}.`, "info", () => {
      void act(() => mutate(api.workbook.explain, { ...args, on: false }));
    });
    setAt(null);
  };

  const others = props.list.filter((x) => x.v.s._id !== m.v.s._id);
  return (
    <>
      <section class="fc-card sk-card" aria-label={`One-to-one: ${m.v.s.name}`}>
        <div class="sk-top">
          <p class="sk-name">
            <b>{m.v.s.name}</b>
            <small>
              {m.v.s.grade ? `Grade ${m.v.s.grade} · ` : ""}he explains each step; teach only the step where he stops
            </small>
          </p>
        </div>
        <nav class="sk-qs" aria-label={`${m.v.s.name}'s questions`}>
          {m.items.map((x) => {
            const on = x.key === item.key;
            return (
              <button key={x.key} type="button" class={`ty-sq${on ? " on" : ""}`} aria-pressed={on} aria-label={`Question ${x.it.q}`} onClick={() => setAt(x.key)}>
                <small>{x.tb.key.split("-")[1] ?? ""}</small>
                <b>{x.it.q}</b>
              </button>
            );
          })}
        </nav>
        <p class="sk-eg">
          Q{item.it.q}
          {item.it.parts.length ? ` · still wrong: ${item.it.parts.join(", ")}` : ""}
          {item.it.skills.length ? ` · after lesson ${item.it.skills.map((s) => skillWords(item.tb, props.tags, s).no).join(", ")}` : " · he has shown its skills elsewhere"}
        </p>
        <PrintedQuestion unitId={item.tb.unitId} stage="master" q={item.it.q} />
        <div class="fc-ans sk-ans">
          <CardAnswer unitId={item.tb.unitId} q={item.it.q} stage="master" max={72} maxH={210} />
        </div>
      </section>
      <p class="sk-line" aria-live="polite">
        <b>{props.list.length}</b> {props.list.length === 1 ? "student waits" : "students wait"}
        {others.length ? <> · next: {others.slice(0, 3).map((x) => x.v.s.name).join(", ")}</> : null}
      </p>
      <div class="fc-pad sk-pad">
        <button type="button" class="btn ghost sk-skip" disabled={busy || others.length === 0} onClick={() => (setWho(others[0].v.s._id), setAt(null))}>
          Next student
        </button>
        <button type="button" class="fc-go sk-done" disabled={busy} onClick={() => void explained()}>
          <span aria-hidden="true">✓</span>
          <b>Explained</b>
          <small>Q{item.it.q}</small>
        </button>
      </div>
    </>
  );
}
