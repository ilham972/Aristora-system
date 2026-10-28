import { useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { secretHash } from "../convex/lib/auth";
import { PART_NAME, partsForGrade, type PartId } from "../convex/lib/book";
import type { MarkState } from "../convex/lib/status";
import { slDate } from "../convex/lib/day";
import { termOf } from "../convex/lib/syllabus";
import { mutate, randomKey } from "./backend";
import { fmtMin, type View } from "./derive";
import { useQuery } from "./live";
import { MoveSheet } from "./move";
import { ReportView, type Report } from "./report";
import { setVoiceOn, testAlert, useAlertsState } from "./sound";
import { PinSheet } from "./signin";
import {
  act,
  allUnits,
  currentMe,
  currentRole,
  may,
  now,
  signOutHere,
  stageName,
  toast,
  type Extra,
  type Role,
  type Stage,
  type Unit,
} from "./store";
import { ATTENDANCE_SINCE, AWAY_DAYS, daysAway, studentStats } from "./stats";
import { UploadBooks } from "./upload";
import { GRADES, GradeRow, Sheet, STATE_WORDS, useGrade } from "./ui";

type Tab = "students" | "books" | "people" | "alerts" | "reports" | "history" | "account";

const SETTINGS_TABS: [Tab, string, () => boolean][] = [
  ["students", "Students", () => may("students")],
  ["books", "Books", () => may("books")],
  ["people", "People", () => may("owner")],
  ["alerts", "Alerts", () => true],
  ["reports", "Reports", () => may("reports")],
  ["history", "History", () => may("reports")],
  ["account", "Account", () => true],
];

export function Settings(props: { views: View[]; onClose: () => void }) {
  const shown = SETTINGS_TABS.filter(([, , ok]) => ok());
  const [chosen, setTab] = useState<Tab>(shown[0][0]);
  const tab = shown.some(([id]) => id === chosen) ? chosen : shown[0][0];
  return (
    <main class="page settings">
      <nav class="seg" aria-label="Settings sections">
        {shown.map(([id, label]) => (
          <button key={id} type="button" class={tab === id ? "on" : ""} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === "students" && <Students views={props.views} />}
      {tab === "books" && <Books />}
      {tab === "alerts" && <Alerts views={props.views} />}
      {tab === "reports" && <Reports />}
      {tab === "history" && <History />}
      {tab === "people" && <People />}
      {tab === "account" && <Account />}
      <button type="button" class="btn ghost wide" onClick={props.onClose}>
        Back to the class
      </button>
    </main>
  );
}

type Removed = {
  _id: Id<"students">;
  name: string;
  demo: boolean;
  grade: number | null;
  created: number;
  archivedAt: number | null;
};

function Students(props: { views: View[] }) {
  const [name, setName] = useState("");
  // One grade pill does two jobs: it filters the list below and it is the grade of the student you add.
  const [grade, setGrade] = useGrade(
    "aristora.lastGrade",
    () => GRADES.find((g) => props.views.some((v) => v.s.grade === g)) ?? GRADES[0],
  );
  const [editing, setEditing] = useState<{ id: Id<"students">; name: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const archived = useQuery<Removed[]>(api.state.archived, {});
  const hasDemo = props.views.some((v) => v.s.demo) || (archived ?? []).some((a) => a.demo);
  const t = now();
  const term = termOf(t);
  const ofGrade = (g: number) => props.views.filter((v) => v.s.grade === g);
  const list = ofGrade(grade);
  const removedHere = (archived ?? []).filter((a) => a.grade === grade);

  const add = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = await act(() => mutate(api.students.add, { name, grade, term, by: currentRole() }));
    if (id) {
      toast(`Added ${name.trim()} to Grade ${grade} (Term ${term}, Fighter). Tap Move to change.`);
      setName("");
    }
  };
  const moveView = moving ? props.views.find((v) => v.s._id === moving) : undefined;

  return (
    <div class="settings-body">
      {may("reports") && <StudentNumbers views={props.views} removed={archived ?? []} now={t} />}

      <form class="add-form" onSubmit={add}>
        <label for="new-name">Add a student to Grade {grade}</label>
        <div class="add-row">
          <input
            id="new-name"
            value={name}
            maxLength={40}
            autoComplete="off"
            placeholder="Name and initial: Ahamed R"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn primary">
            Add
          </button>
        </div>
      </form>
      <GradeRow
        value={grade}
        onPick={setGrade}
        label="Grade: shows its students, and new students go in it"
        count={(g) => {
          const n = ofGrade(g).length;
          return { text: String(n), aria: n === 1 ? "1 student" : `${n} students` };
        }}
      />

      <h3 class="list-title">
        Grade {grade} · {list.length === 1 ? "1 student" : `${list.length} students`}
      </h3>
      {list.length === 0 ? (
        <p class="muted">No Grade {grade} students yet. Type a name above and tap Add.</p>
      ) : (
        <ul class="plain-list">
          {list.map((v) => {
            const away = daysAway(v.s, t);
            return (
              <li key={v.s._id}>
                <span class="st-who">
                  <span>
                    {v.s.name}
                    {v.s.demo && <span class="demo-tag">Demo</span>}
                  </span>
                  <small>
                    Term {v.s.term ?? "?"} · {stageName(v.stage as Stage)}
                    {v.unit ? ` · ${v.unit.code} ${v.unit.en}` : ""}
                  </small>
                  {!v.s.demo && away >= AWAY_DAYS && <small class="away-note">Not seen for {away} days</small>}
                </span>
                <span class="list-actions">
                  <button type="button" class="link-btn" onClick={() => setMoving(v.s._id)}>
                    Move
                  </button>
                  <button type="button" class="link-btn" onClick={() => setEditing({ id: v.s._id, name: v.s.name })}>
                    Rename
                  </button>
                  <button
                    type="button"
                    class="link-btn danger"
                    onClick={async () => {
                      const r = await act(() => mutate(api.students.setArchived, { id: v.s._id, archived: true, by: currentRole() }));
                      if (r !== undefined) toast(`${v.s.name} removed. You can bring them back below.`);
                    }}
                  >
                    Remove
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {moveView && <MoveSheet v={moveView} onClose={() => setMoving(null)} />}

      {removedHere.length > 0 && (
        <>
          <h3 class="block-title">Removed from Grade {grade}</h3>
          <ul class="plain-list">
            {removedHere.map((a) => (
              <li key={a._id}>
                <span class="muted">{a.name}</span>
                <button
                  type="button"
                  class="link-btn"
                  onClick={() =>
                    void act(() => mutate(api.students.setArchived, { id: a._id, archived: false, by: currentRole() }))
                  }
                >
                  Bring back
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {may("owner") && <Demo views={props.views} hasDemo={hasDemo} onDelete={() => setConfirmDemo(true)} />}

      {editing && (
        <Sheet
          title="Rename"
          onClose={() => setEditing(null)}
          foot={
            <button
              type="button"
              class="btn primary wide"
              onClick={async () => {
                const ok = await act(() =>
                  mutate(api.students.rename, { id: editing.id, name: editing.name, by: currentRole() }),
                );
                if (ok !== undefined) setEditing(null);
              }}
            >
              Save
            </button>
          }
        >
          <input
            class="full"
            value={editing.name}
            maxLength={40}
            onInput={(e) => setEditing({ ...editing, name: (e.target as HTMLInputElement).value })}
          />
        </Sheet>
      )}

      {confirmDemo && (
        <Sheet
          title="Delete the demo students?"
          sub="This deletes only students marked Demo. Your real students stay."
          onClose={() => setConfirmDemo(false)}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={() => setConfirmDemo(false)}>
                Keep them
              </button>
              <button
                type="button"
                class="btn primary"
                onClick={async () => {
                  const n = await act(() => mutate(api.demo.remove, { by: currentRole() }));
                  setConfirmDemo(false);
                  if (n !== undefined) toast(`Deleted ${n} demo students.`);
                }}
              >
                Delete demo students
              </button>
            </div>
          }
        >
          <p class="muted">Their history stays in the History list.</p>
        </Sheet>
      )}
    </div>
  );
}

/** The founder's four numbers: students now, growth this month, who came this week, who has stopped coming. */
function StudentNumbers(props: { views: View[]; removed: Removed[]; now: number }) {
  const [showAway, setShowAway] = useState(false);
  const st = studentStats(
    props.views.map((v) => v.s),
    props.removed,
    props.now,
  );
  const since = slDate(ATTENDANCE_SINCE);
  return (
    <>
      <section class="stats" aria-label="Student numbers">
        <div class="stat">
          <b>{st.total}</b>
          <span>{st.total === 1 ? "student now" : "students now"}</span>
          <small>{st.demo > 0 ? `+${st.demo} demo, not counted` : "Grades 6 to 11"}</small>
        </div>
        <div class="stat">
          <b>{st.added > 0 ? `+${st.added}` : "0"}</b>
          <span>added this month</span>
          <small>{st.left === 0 ? "none removed" : `${st.left} removed`}</small>
        </div>
        <div class="stat">
          <b>
            {st.week}
            <i> of {st.total}</i>
          </b>
          <span>came in the last 7 days</span>
          {st.newWeek && <small>counting from {since}</small>}
        </div>
        <button
          type="button"
          class={`stat${st.away.length ? " warn" : ""}`}
          disabled={st.away.length === 0}
          onClick={() => setShowAway(true)}
        >
          <b>{st.away.length}</b>
          <span>not seen for 2+ weeks</span>
          <small>{st.away.length ? "tap to see who" : st.newAway ? `counting from ${since}` : "everyone is coming"}</small>
        </button>
      </section>
      {showAway && (
        <Sheet title="Not seen for 2+ weeks" sub="Longest away first. Worth a call to the parents." onClose={() => setShowAway(false)}>
          <ul class="plain-list">
            {st.away.map(({ s, days }) => (
              <li key={s._id}>
                <span class="st-who">
                  <span>{s.name}</span>
                  <small>
                    Grade {s.grade ?? "?"} · {s.lastInAt ? `last came ${slDate(s.lastInAt)}` : "never signed in on Attendance"}
                  </small>
                </span>
                <b class="away-note">{days} days</b>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  );
}

/** Owner only: demo students to try the app with (only into an empty class). */
function Demo(props: { views: View[]; hasDemo: boolean; onDelete: () => void }) {
  return (
    <>
      <h3 class="block-title">Try it with demo students</h3>
      {props.views.length === 0 ? (
        <button
          type="button"
          class="btn ghost wide"
          onClick={async () => {
            const r = await act(() => mutate(api.demo.load, { by: currentRole() }));
            if (r !== undefined) toast("14 demo students loaded: Grade 11 Fighter, Grade 7 Master, Grade 9 Legend.");
          }}
        >
          Load demo students (three grades)
        </button>
      ) : props.hasDemo ? (
        <button type="button" class="btn ghost wide" onClick={props.onDelete}>
          Delete the demo students
        </button>
      ) : (
        <p class="muted">Demo students can only be loaded into an empty class.</p>
      )}
    </>
  );
}

type BookRow = {
  _id: string;
  unitId: string;
  stage: "fighter" | "master";
  title: string | null;
  master: {
    parts: { id: PartId; from: number; to: number; each: number | null }[];
    levels: { n: number; from: number; to: number; max: number }[];
    total: number;
    marksKnown: number;
  } | null;
  questions: number | null;
  keyCount: number | null;
};

/** The syllabus by grade, which units have their books in the app, and setting up a workbook. */
function Books() {
  const units = allUnits();
  const books = useQuery<BookRow[]>(api.catalog.books, {}) ?? [];
  const [grade, setGrade] = useGrade("aristora.booksGrade", () => 8);
  const [open, setOpen] = useState<Unit | null>(null);
  const list = units.filter((u) => u.grade === grade);
  const bookOf = (u: Unit, st: "fighter" | "master") => books.find((b) => b.unitId === u._id && b.stage === st);
  const done = (st: "fighter" | "master") => list.filter((u) => bookOf(u, st)).length;
  const keys = list.filter((u) => bookOf(u, "master")?.keyCount).length;
  return (
    <div class="settings-body">
      <UploadBooks units={units} books={books} onSaved={setGrade} />
      <GradeRow
        value={grade}
        onPick={setGrade}
        label="Grade"
        count={(g) => {
          const us = units.filter((u) => u.grade === g);
          const n = us.filter((u) => bookOf(u, "master")).length;
          return { text: `${n}/${us.length}`, aria: `${n} of ${us.length} workbooks in the app`, some: n > 0 };
        }}
      />
      <p class="muted">
        {list.length} units. In the app: theory books (F) {done("fighter")} · workbooks (M) {done("master")} · answer keys (K) {keys}.
      </p>
      {[1, 2, 3, 0].map((t) => {
        const us = list.filter((u) => u.term === t);
        if (!us.length) return null;
        return (
          <div key={t}>
            <h3 class="block-title">{t ? `Term ${t}` : "Extra"}</h3>
            <ul class="unit-list">
              {us.map((u) => {
                const f = bookOf(u, "fighter");
                const m = bookOf(u, "master");
                return (
                  <li key={u._id}>
                    <button type="button" onClick={() => setOpen(u)}>
                      <b>{u.code}</b>
                      <span>
                        {u.en}
                        <small>{u.ta}</small>
                      </span>
                      <i class={f ? "has" : ""} title={f ? "Theory book in the app" : "No theory book yet"}>
                        F
                      </i>
                      <i class={m ? "has" : ""} title={m ? `Workbook: ${m.master?.levels.length} levels` : "No workbook yet"}>
                        M
                      </i>
                      <i
                        class={m?.keyCount ? "has" : ""}
                        title={m?.keyCount ? `Answer key: ${m.keyCount} answers` : "No answer key yet"}
                        aria-label={m?.keyCount ? `Answer key: ${m.keyCount} answers` : "No answer key yet"}
                      >
                        K
                      </i>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {open && <UnitSheet unit={open} book={bookOf(open, "master")} fighter={bookOf(open, "fighter")} onClose={() => setOpen(null)} />}
    </div>
  );
}

type LevelRow = { to: string; max: string };

/** One unit: its names, and its workbook copied from the contents page and the marks table. */
function UnitSheet(props: { unit: Unit; book?: BookRow; fighter?: BookRow; onClose: () => void }) {
  const { unit } = props;
  const plan = partsForGrade(unit.grade);
  const m = props.book?.master;
  const [en, setEn] = useState(unit.en);
  const [ta, setTa] = useState(unit.ta);
  const [ends, setEnds] = useState<Record<string, string>>(() =>
    Object.fromEntries(plan.map((p) => [p.id, m?.parts.find((x) => x.id === p.id)?.to.toString() ?? ""])),
  );
  const [each, setEach] = useState<string>(String(m?.parts.find((x) => x.each !== null)?.each ?? 2));
  const [levels, setLevels] = useState<LevelRow[]>(() => (m ? m.levels.map((l) => ({ to: String(l.to), max: String(l.max) })) : []));
  const [busy, setBusy] = useState(false);

  const shortId = plan[0].id;
  const partEnd = (id: PartId) => Number(ends[id] || 0);
  const firstOf = (i: number) => (i === 0 ? 1 : Number(levels[i - 1].to || 0) + 1);
  const tens = () => {
    const last = partEnd(shortId);
    if (!last) return toast(`Type where ${PART_NAME[shortId]} ends first.`, "error");
    const rows: LevelRow[] = [];
    for (let a = 1; a <= last; a += 10) {
      const b = Math.min(a + 9, last);
      rows.push({ to: String(b), max: String((b - a + 1) * Number(each || 2)) });
    }
    const rest = levels.filter((l) => Number(l.to) > last);
    setLevels([...rows, ...rest]);
  };
  const saveNames = async () => {
    const r = await act(() => mutate(api.catalog.renameUnit, { unitId: unit._id, en, ta, by: currentRole() }));
    if (r !== undefined) toast(`${unit.code} renamed.`);
  };
  const saveBook = async () => {
    setBusy(true);
    const parts = plan
      .filter((p) => partEnd(p.id) > 0)
      .map((p) => (p.kind === "short" ? { id: p.id, to: partEnd(p.id), each: Number(each || 2) } : { id: p.id, to: partEnd(p.id) }));
    const r = await act(() =>
      mutate(api.catalog.saveWorkbook, {
        unitId: unit._id,
        parts,
        levels: levels.map((l) => ({ to: Number(l.to), max: Number(l.max) })),
        by: currentRole(),
      }),
    );
    setBusy(false);
    if (r !== undefined) {
      toast(`${unit.code} workbook saved: ${levels.length} levels.`);
      props.onClose();
    }
  };

  return (
    <Sheet title={`Grade ${unit.grade} · ${unit.code}`} sub={`${unit.en} · ${unit.ta}`} onClose={props.onClose}>
      <h3 class="block-title">Names</h3>
      <div class="add-row">
        <input value={en} maxLength={80} aria-label="English name" onInput={(e) => setEn((e.target as HTMLInputElement).value)} />
      </div>
      <div class="add-row">
        <input value={ta} maxLength={120} aria-label="Tamil name" onInput={(e) => setTa((e.target as HTMLInputElement).value)} />
        <button type="button" class="btn ghost" onClick={() => void saveNames()}>
          Save names
        </button>
      </div>

      <h3 class="block-title">Theory book (Fighter)</h3>
      <p class="muted">
        {props.fighter
          ? `In the app${props.fighter.title ? `: ${props.fighter.title}` : ""}, ${props.fighter.questions} questions.`
          : "Not in the app yet. Send the book's PDF or source zip to Claude to load it."}
      </p>

      <h3 class="block-title">Workbook (Master)</h3>
      <p class="muted">Copy it from the workbook's contents page and its marks table (புள்ளி அட்டவணை).</p>
      <div class="wb-parts">
        {plan.map((p) => (
          <label key={p.id}>
            {PART_NAME[p.id]} ends at question
            <input
              type="number"
              inputMode="numeric"
              value={ends[p.id]}
              onInput={(e) => setEnds({ ...ends, [p.id]: (e.target as HTMLInputElement).value })}
            />
          </label>
        ))}
        <label>
          Marks for each {PART_NAME[shortId]} question
          <input type="number" inputMode="numeric" value={each} onInput={(e) => setEach((e.target as HTMLInputElement).value)} />
        </label>
      </div>
      <div class="wb-levels">
        <div class="wb-lh">
          <span>Level</span>
          <span>Questions</span>
          <span>Last question</span>
          <span>Marks</span>
        </div>
        {levels.map((l, i) => (
          <div key={i} class="wb-lr">
            <span>{i + 1}</span>
            <span>
              {firstOf(i)}–{l.to || "?"}
            </span>
            <input
              type="number"
              inputMode="numeric"
              aria-label={`Level ${i + 1}: last question`}
              value={l.to}
              onInput={(e) => setLevels(levels.map((x, k) => (k === i ? { ...x, to: (e.target as HTMLInputElement).value } : x)))}
            />
            <input
              type="number"
              inputMode="numeric"
              aria-label={`Level ${i + 1}: marks`}
              value={l.max}
              onInput={(e) => setLevels(levels.map((x, k) => (k === i ? { ...x, max: (e.target as HTMLInputElement).value } : x)))}
            />
          </div>
        ))}
        <div class="row-actions wrap">
          <button type="button" class="btn ghost small" onClick={tens}>
            {PART_NAME[shortId]} in tens
          </button>
          <button type="button" class="btn ghost small" onClick={() => setLevels([...levels, { to: "", max: "" }])}>
            Add a level
          </button>
          {levels.length > 0 && (
            <button type="button" class="btn ghost small" onClick={() => setLevels(levels.slice(0, -1))}>
              Remove the last
            </button>
          )}
        </div>
        <p class="muted small">
          Total: {levels.reduce((a, l) => a + Number(l.max || 0), 0)} marks
          {m ? ` · ${m.marksKnown} question marks known from the book` : ""}
        </p>
        {m && (
          <p class={`small key-note${props.book?.keyCount ? " ok" : ""}`}>
            {props.book?.keyCount
              ? `✓ Answer key: ${props.book.keyCount} answers. Teachers see them when they correct a level.`
              : "No answer key yet. Upload the unit's zip with its answer key (Upload workbooks)."}
          </p>
        )}
      </div>
      <button type="button" class="btn primary wide" disabled={busy || !levels.length} onClick={() => void saveBook()}>
        Save the workbook
      </button>
    </Sheet>
  );
}

/** This phone's alerts: test them, names on or off, and the phone settings that make them reliable. */
function Alerts(props: { views: View[] }) {
  const st = useAlertsState();
  const name = props.views.find((v) => v.where !== "absent")?.s.name ?? props.views[0]?.s.name ?? "Rimas";
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  return (
    <div class="settings-body">
      <div class={`alert-status ${st.on ? "ok" : "off"}`} role="status">
        <b>{st.on ? "Alerts are on" : "Alerts are off"}</b>
        <span>
          {st.on
            ? st.awake === "off"
              ? "This phone may still lock its screen by itself. Do step 3 below."
              : "The screen stays on while this page is open."
            : "Tap anywhere on this page to turn them on."}
        </span>
      </div>
      <button type="button" class="btn primary wide big" onClick={() => testAlert(name)}>
        Test the alert
      </button>
      <p class="muted">
        You should hear a chime, then "{name}, go to Theory".
        {canSpeak ? "" : " This phone can't read names out loud; it will only chime."}
      </p>
      {canSpeak && (
        <label class="switch-row">
          <input type="checkbox" checked={st.voice} onChange={(e) => setVoiceOn((e.target as HTMLInputElement).checked)} />
          <span>
            <b>Say names out loud</b>
            <small>Correction hears "Ahamed and Nila, go to Theory". It repeats every 30 seconds until you tap Sent or ×.</small>
          </span>
        </label>
      )}
      <p class="note">
        Alerts follow the tab that is open. Correction and Focus hear calls. Theory and Evaluation hear a knock when a student runs out of
        work, and Evaluation hears "Theory wants Kumar now".
      </p>

      <h3 class="block-title">Set up each phone once</h3>
      <ol class="steps">
        <li>
          <b>Volume up.</b> Tap Test the alert, and while it plays press the volume-up button until it's loud.
        </li>
        <li>
          <b>iPhone: silent switch off.</b> The small switch on the left side must not show orange.
        </li>
        <li>
          <b>Screen never sleeps during class.</b> iPhone: Settings, Display &amp; Brightness, Auto-Lock, Never. Redmi: open
          Settings, search "Sleep", choose Never.
        </li>
        <li>
          <b>Power saving off during class.</b> iPhone: Low Power Mode off (it locks the screen after 30 seconds). Redmi: Battery
          saver off.
        </li>
        <li>
          <b>Keep this page on screen.</b> Don't press the power button and don't switch to another app: a locked phone can't
          ring.
        </li>
        <li>
          <b>Charger nearby.</b> The screen stays on for the whole class.
        </li>
      </ol>
    </div>
  );
}

function Reports() {
  const list = useQuery<{ _id: string; startedAt: number; endedAt?: number; report: Report | null }[]>(api.state.sessions, {});
  const [open, setOpen] = useState<string | null>(null);
  if (!list) return <p class="muted settings-body">Loading…</p>;
  if (list.length === 0) {
    return (
      <div class="settings-body">
        <p class="muted">No reports yet. A report is saved when Correction taps "End the session".</p>
      </div>
    );
  }
  return (
    <div class="settings-body">
      <ul class="plain-list">
        {list.map((s) => (
          <li key={s._id}>
            <button
              type="button"
              class="report-row"
              onClick={() => setOpen(open === s._id ? null : s._id)}
              aria-expanded={open === s._id}
            >
              <span>
                {new Date(s.startedAt).toLocaleString(undefined, {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
              <span class={s.report && s.report.idleMin > 10 ? "t-red" : "muted"}>
                {s.report ? `${s.report.idleMin} min idle` : ""}
              </span>
            </button>
            {open === s._id && s.report && <ReportView report={s.report} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

const ROOM_WORD: Record<string, string> = { theory: "Theory", evaluation: "Evaluation" };
const qName = (q: number) => `Q${q}`;

/** One history line in plain words. */
function describe(e: Doc<"events">): string {
  const v = e.value ?? "";
  switch (e.kind) {
    case "mark":
      return v === "clear" ? `${qName(e.q ?? 0)} mark cleared` : `${qName(e.q ?? 0)} marked ${STATE_WORDS[v as MarkState] ?? v}`;
    case "undo":
      return `${qName(e.q ?? 0)} mark undone`;
    case "in":
      return "signed in";
    case "out":
      return "signed out";
    case "in-undo":
      return "sign-in taken back (tapped by mistake)";
    case "call": {
      const [room, kind, pull] = v.split("/");
      const forTheory = kind === "theory" ? " for theory" : "";
      return `called to ${ROOM_WORD[room] ?? room}${forTheory}${pull || kind === "pull" ? ", straight from Evaluation" : ""}`;
    }
    case "sent":
      return `sent to ${ROOM_WORD[v] ?? v}`;
    case "not-now":
      return `not sent to ${ROOM_WORD[v] ?? v} (not now)`;
    case "not-now-undo":
      return `call to ${ROOM_WORD[v] ?? v} back on ("not now" undone)`;
    case "cancel":
      return `call to ${ROOM_WORD[v] ?? v} cancelled`;
    case "bumped":
      return "Evaluation call cancelled: Theory comes first";
    case "done-theory": {
      if (v === "re-taught") return "re-taught by Theory";
      if (v === "re-teach-kept") return "sent back by Theory before the re-teach (still needs it)";
      if (v.startsWith("taught ") && !v.includes(":")) return `workbook ${v.slice(7).split(",").map((q) => `Q${q}`).join(", ")} taught by Theory`;
      const m = /^(\w+): taught ([\d,-]+)(?:; skip ([\d,]+))?/.exec(v);
      if (!m) return "theory finished";
      const taught = m[2] === "-" ? "nothing new taught" : `taught ${m[2].split(",").join(", ")}`;
      return `theory finished, section ${m[1]}: ${taught}${m[3] ? `, may skip ${m[3].split(",").join(", ")}` : ""}`;
    }
    case "done-evaluation": {
      const m = /^explained ([\d,-]+)(?:; re-teach (\w+))?/.exec(v);
      if (!m) return "evaluation finished";
      const what = m[1] === "-" ? "nothing explained" : `explained ${m[1].split(",").map(Number).map(qName).join(", ")}`;
      return `evaluation finished: ${what}${m[2] ? `, section ${m[2]} sent back to Theory` : ""}`;
    }
    case "back-to-hall":
      return "back in the hall (closed by Correction)";
    case "skip-section":
      return `skips section ${v} theory`;
    case "idle":
      return `was out of work for ${fmtMin(e.ms ?? 0)}, waiting for ${v.split("+").join(" and ")}`;
    case "level-done":
      return `Level ${v} handed in, waiting for correction`;
    case "level-undo":
      return `Level ${v}: "handed in" undone`;
    case "level-marks":
    case "level-remarks": {
      const [n, marks] = v.split(" ");
      return `Level ${n} ${e.kind === "level-remarks" ? "re-marked" : "corrected"}: ${marks}${e.ms ? ` (waited ${fmtMin(e.ms)})` : ""}`;
    }
    case "level-unmarked": {
      const [n, marks] = v.split(" ");
      return `Level ${n}: correction (${marks}) taken back`;
    }
    case "explained":
      return `${v} explained`;
    case "unexplained":
      return `${v} explanation undone`;
    case "reteach":
      return "needs the whole unit taught again";
    case "reteach-off":
      return "whole-unit re-teach no longer needed";
    case "to-theory":
      return `sent to Theory: ${v}`;
    case "to-theory-off":
      return `taken back from Theory: ${v}`;
    case "taught":
      return `${v} taught by Theory`;
    case "untaught":
      return `${v} taught, undone`;
    case "move":
      return `moved: ${v}`;
    case "book-save":
      return `workbook saved: ${v}`;
    case "unit-rename":
      return `unit renamed: ${v}`;
    case "session-start":
      return "Session started";
    case "session-end":
      return `Session ended after ${fmtMin(e.ms ?? 0)}`;
    case "student-add":
      return `added to the class${v ? `: ${v}` : ""}`;
    case "student-rename":
      return `renamed (was ${v})`;
    case "student-remove":
      return "removed from the class";
    case "student-restore":
      return "brought back to the class";
    case "demo-load":
      return `${v} demo students loaded`;
    case "demo-remove":
      return `${v} demo students deleted`;
    case "owner-setup":
      return "set up the owner account";
    case "sign-in":
      return `signed in a phone (${v === "pin" ? "with PIN" : "with a sign-in link"})`;
    case "sign-out":
      return `signed out a phone (${v})`;
    case "pin-set":
      return "set a new PIN";
    case "person-add":
      return `added ${v}`;
    case "person-edit":
      return `changed what ${v} may do`;
    case "person-remove":
      return `removed ${v} (all their phones signed out)`;
    case "link-made":
      return `made a sign-in link for ${v}`;
    case "device-out":
      return `signed out ${v}`;
    case "pin-clear":
      return `cleared ${v}'s PIN`;
    default:
      return e.kind;
  }
}

function History() {
  const list = useQuery<Doc<"events">[]>(api.state.history, { limit: 150 });
  if (!list) return <p class="muted settings-body">Loading…</p>;
  const shown = list.filter((e) => e.kind !== "explained");
  return (
    <div class="settings-body">
      <p class="muted">Every change, newest first, with the person who made it (coloured by the tab they used).</p>
      {shown.length === 0 ? (
        <p class="muted">Nothing has happened yet.</p>
      ) : (
        <ul class="history">
          {shown.map((e) => (
            <li key={e._id}>
              <span class="h-time">{new Date(e.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
              <span class="h-text">
                {e.name && <b>{e.name} </b>}
                {e.unit && <span class="h-unit">{e.unit.replace("-", " ")} </span>}
                {describe(e)}
              </span>
              {(e.who || e.by) && (
                <span class={`h-by ${e.by ?? "owner"}`} title={e.by ? `${e.who ?? ""} (${e.by} tab)` : undefined}>
                  {e.who ?? e.by}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const TAB_NAMES: Record<Role, string> = { correction: "Correction", theory: "Theory", evaluation: "Evaluation" };
const EXTRA_NAMES: Record<Extra, string> = { students: "Students", books: "Books", reports: "Reports and History" };
const EXTRA_HELP: Record<Extra, string> = {
  students: "add, rename, remove students",
  books: "workbooks and unit names",
  reports: "end-of-class reports and the history",
};

function canWords(p: { role: string; tabs: Role[]; can: Extra[] }): string {
  if (p.role === "owner") return "Owner: everything";
  const tabs = p.tabs.map((t) => TAB_NAMES[t]).join(", ");
  return p.can.length ? `${tabs} · also ${p.can.map((c) => EXTRA_NAMES[c]).join(", ")}` : tabs;
}

function ago(t: number): string {
  const min = Math.floor((now() - t) / 60_000);
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function untilWords(t: number): string {
  return new Date(t).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

/** This phone: who is signed in, the PIN, signing out, and what the sign-in protects. */
function Account() {
  const me = currentMe();
  const [pin, setPin] = useState(false);
  const [out, setOut] = useState(false);
  if (!me) return null;
  return (
    <div class="settings-body">
      <div class="acct">
        <span class="acct-name">{me.name}</span>
        <span class="muted">{canWords(me)}</span>
      </div>
      <button type="button" class="btn ghost wide" onClick={() => setPin(true)}>
        {me.hasPin ? "Change my PIN" : "Choose a PIN"}
      </button>
      <button type="button" class="btn ghost wide" onClick={() => setOut(true)}>
        Sign out this phone
      </button>
      <h3 class="block-title">Privacy</h3>
      <div class="prose">
        <ul>
          <li>Only people the owner adds can sign in. Each phone signs in once and stays signed in.</li>
          <li>Every change is saved with the name of the person who made it (Settings, History).</li>
          <li>Lost a phone? The owner signs it out in Settings, People. A phone not used for 4 months signs out by itself.</li>
          <li>A sign-in link is like a key: it works once, for one day. Send it only to that teacher.</li>
          <li>For students, use first name and initial only. No surnames, phone numbers or addresses.</li>
        </ul>
      </div>
      {pin && <PinSheet hasPin={me.hasPin} onClose={() => setPin(false)} />}
      {out && (
        <Sheet
          title="Sign out this phone?"
          sub={`To use it again, ${me.name} needs a new sign-in link${me.hasPin ? " or the PIN" : ""}.`}
          onClose={() => setOut(false)}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={() => setOut(false)}>
                Stay signed in
              </button>
              <button type="button" class="btn primary" onClick={() => void signOutHere()}>
                Sign out
              </button>
            </div>
          }
        >
          <p class="muted">Nothing is deleted. The class carries on on the other phones.</p>
        </Sheet>
      )}
    </div>
  );
}

type Person = {
  _id: Id<"users">;
  name: string;
  role: "owner" | "teacher";
  tabs: Role[];
  can: Extra[];
  hasPin: boolean;
  lockedUntil: number | null;
  devices: { _id: Id<"devices">; label: string; createdAt: number; lastSeenAt: number }[];
  linkUntil: number | null;
  createdAt: number;
};

/** Owner: the people who can sign in, what each may do, their phones, sign-in links. */
function People() {
  const list = useQuery<Person[]>(api.people.list, {});
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Id<"users"> | null>(null);
  const [link, setLink] = useState<{ name: string; url: string; until: number } | null>(null);
  const me = currentMe();
  const sendLink = async (p: { _id: Id<"users">; name: string }) => {
    const code = randomKey(16);
    const r = await act(() => mutate(api.people.makeLink, { id: p._id, codeHash: secretHash("link", code) }));
    if (r) setLink({ name: p.name, url: `${location.origin}/#join=${code}`, until: r.expiresAt });
  };
  if (!list) return <p class="muted settings-body">Loading…</p>;
  const person = editing ? list.find((p) => p._id === editing) : undefined;
  return (
    <div class="settings-body">
      <p class="muted">
        Add each teacher once, then send them a sign-in link on WhatsApp. They tap it on their own phone and stay signed in.
      </p>
      <button type="button" class="btn primary wide" onClick={() => setAdding(true)}>
        Add a teacher
      </button>
      <ul class="people">
        {list.map((p) => (
          <li key={p._id} class="person">
            <div class="p-head">
              <b>{p.name}</b>
              {p._id === me?._id && <span class="p-tag">You</span>}
            </div>
            <p class="p-can">{canWords(p)}</p>
            <p class="p-phones">
              {p.devices.length === 0
                ? "No phone signed in"
                : `${p.devices.length} phone${p.devices.length === 1 ? "" : "s"} signed in, used ${ago(p.devices[0].lastSeenAt)}`}
              {p.linkUntil ? ` · link waiting until ${untilWords(p.linkUntil)}` : ""}
              {p.lockedUntil ? " · PIN locked (wrong PINs)" : p.hasPin ? " · has a PIN" : ""}
            </p>
            <div class="row-actions wrap">
              <button type="button" class="btn small" onClick={() => void sendLink(p)}>
                Send sign-in link
              </button>
              <button type="button" class="btn ghost small" onClick={() => setEditing(p._id)}>
                {p.role === "owner" ? "Phones" : "Change"}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {adding && (
        <PersonSheet
          onClose={() => setAdding(false)}
          onAdded={(id, name) => {
            setAdding(false);
            void sendLink({ _id: id, name });
          }}
        />
      )}
      {person && <PersonSheet person={person} onClose={() => setEditing(null)} />}
      {link && <LinkSheet {...link} onClose={() => setLink(null)} />}
    </div>
  );
}

function PersonSheet(props: { person?: Person; onClose: () => void; onAdded?: (id: Id<"users">, name: string) => void }) {
  const p = props.person;
  const owner = p?.role === "owner";
  const [name, setName] = useState(p?.name ?? "");
  const [tabs, setTabs] = useState<Role[]>(p?.tabs ?? ["correction"]);
  const [can, setCan] = useState<Extra[]>(p?.can ?? ["reports"]);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const toggle = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  const save = async () => {
    // Say what's missing instead of a grey button (the name box may be scrolled out of sight).
    if (!name.trim()) {
      nameRef.current?.scrollIntoView({ block: "center" });
      nameRef.current?.focus();
      return toast(p ? "Type the name first." : "Type the teacher's name first (at the top).", "error");
    }
    if (!owner && tabs.length === 0) return toast("Tick at least one tab: Correction, Theory or Evaluation.", "error");
    setBusy(true);
    if (p) {
      const r = await act(() => mutate(api.people.update, owner ? { id: p._id, name } : { id: p._id, name, tabs, can }));
      setBusy(false);
      if (r !== undefined) {
        toast(`${name.trim()} saved.`);
        props.onClose();
      }
    } else {
      const id = await act(() => mutate(api.people.add, { name, tabs, can }));
      setBusy(false);
      if (id) props.onAdded?.(id, name.trim());
    }
  };
  return (
    <Sheet
      title={p ? p.name : "Add a teacher"}
      sub={owner ? "The owner can always do everything." : "Tick what they may do. You can change it any time."}
      onClose={props.onClose}
      foot={
        <button type="button" class="btn primary wide" disabled={busy} onClick={() => void save()}>
          {p ? "Save" : "Add, then send the sign-in link"}
        </button>
      }
    >
      <label class="si-field">
        Name (first name and initial)
        <input
          ref={nameRef}
          value={name}
          maxLength={40}
          autoComplete="off"
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
        />
      </label>
      {!owner && (
        <>
          <h3 class="block-title">Tabs</h3>
          <div class="perm-list">
            {(Object.keys(TAB_NAMES) as Role[]).map((t) => (
              <label key={t} class="perm">
                <input type="checkbox" checked={tabs.includes(t)} onChange={() => setTabs(toggle(tabs, t))} />
                <span>{TAB_NAMES[t]}</span>
              </label>
            ))}
          </div>
          <h3 class="block-title">Also</h3>
          <div class="perm-list">
            {(Object.keys(EXTRA_NAMES) as Extra[]).map((x) => (
              <label key={x} class="perm">
                <input type="checkbox" checked={can.includes(x)} onChange={() => setCan(toggle(can, x))} />
                <span>
                  {EXTRA_NAMES[x]}
                  <small>{EXTRA_HELP[x]}</small>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      {p && (
        <>
          <h3 class="block-title">Phones signed in</h3>
          {p.devices.length === 0 ? (
            <p class="muted">None. Send a sign-in link.</p>
          ) : (
            <ul class="plain-list">
              {p.devices.map((d) => (
                <li key={d._id}>
                  <span class="st-who">
                    <span>
                      {d.label}
                      {d._id === currentMe()?.deviceId && <span class="p-tag">This phone</span>}
                    </span>
                    <small>
                      Signed in {ago(d.createdAt)} · used {ago(d.lastSeenAt)}
                    </small>
                  </span>
                  <button
                    type="button"
                    class="link-btn danger"
                    onClick={async () => {
                      const r = await act(() => mutate(api.people.signOutDevice, { deviceId: d._id }));
                      if (r) toast(`${p.name}: ${d.label} signed out.`);
                    }}
                  >
                    Sign out
                  </button>
                </li>
              ))}
            </ul>
          )}
          {(p.hasPin || p.lockedUntil) && (
            <button
              type="button"
              class="btn ghost wide"
              onClick={async () => {
                const r = await act(() => mutate(api.people.clearPin, { id: p._id }));
                if (r) toast(`${p.name}'s PIN cleared. Send a sign-in link; they choose a new PIN after.`);
              }}
            >
              Clear the PIN (forgotten or locked)
            </button>
          )}
          {!owner &&
            (confirm ? (
              <div class="row-actions">
                <button type="button" class="btn ghost" onClick={() => setConfirm(false)}>
                  Keep {p.name}
                </button>
                <button
                  type="button"
                  class="btn danger"
                  onClick={async () => {
                    const r = await act(() => mutate(api.people.remove, { id: p._id }));
                    if (r !== undefined) {
                      toast(`${p.name} removed. Their phones are signed out.`);
                      props.onClose();
                    }
                  }}
                >
                  Remove {p.name}
                </button>
              </div>
            ) : (
              <button type="button" class="btn ghost wide danger-text" onClick={() => setConfirm(true)}>
                Remove {p.name}
              </button>
            ))}
        </>
      )}
    </Sheet>
  );
}

/** The new sign-in link: send it on WhatsApp, or copy it. It is shown only now. */
function LinkSheet(props: { name: string; url: string; until: number; onClose: () => void }) {
  const text = `${props.name}, this is your sign-in link for the ARISTORA class system. Tap it on your own phone (it works once, until ${untilWords(props.until)}):\n${props.url}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.url);
      toast("Link copied. Paste it into a message to " + props.name + ".");
    } catch {
      toast("Couldn't copy. Press and hold the link to copy it.", "error");
    }
  };
  return (
    <Sheet title={`Sign-in link for ${props.name}`} sub={`Works once, until ${untilWords(props.until)}. Send it only to ${props.name}.`} onClose={props.onClose}>
      <a class="btn whatsapp wide big" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">
        Send on WhatsApp
      </a>
      <button type="button" class="btn ghost wide" onClick={() => void copy()}>
        Copy the link
      </button>
      <input class="full link-text" readOnly value={props.url} aria-label="Sign-in link" onFocus={(e) => (e.target as HTMLInputElement).select()} />
      <p class="muted small">This link is shown only now. If it gets lost, send a new one: the old one stops working.</p>
    </Sheet>
  );
}
