import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { PART_NAME, partsForGrade, type PartId } from "../convex/lib/book";
import type { MarkState } from "../convex/lib/status";
import { termOf } from "../convex/lib/syllabus";
import { mutate } from "./backend";
import { fmtMin, type View } from "./derive";
import { useQuery } from "./live";
import { MoveSheet } from "./move";
import { ReportView, type Report } from "./report";
import { setVoiceOn, testAlert, useAlertsState } from "./sound";
import { act, allUnits, currentRole, now, stageName, toast, type Stage, type Unit } from "./store";
import { Sheet, STATE_WORDS } from "./ui";

type Tab = "students" | "books" | "alerts" | "reports" | "history" | "privacy";

export function Settings(props: { views: View[]; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("students");
  return (
    <main class="page settings">
      <nav class="seg" aria-label="Settings sections">
        {(
          [
            ["students", "Students"],
            ["books", "Books"],
            ["alerts", "Alerts"],
            ["reports", "Reports"],
            ["history", "History"],
            ["privacy", "Privacy"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
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
      {tab === "privacy" && <Privacy />}
      <button type="button" class="btn ghost wide" onClick={props.onClose}>
        Back to the class
      </button>
    </main>
  );
}

function Students(props: { views: View[] }) {
  const [name, setName] = useState("");
  const [grade, setGrade] = useState<number>(() => {
    try {
      return Number(localStorage.getItem("aristora.lastGrade")) || 11;
    } catch {
      return 11;
    }
  });
  const [editing, setEditing] = useState<{ id: Id<"students">; name: string } | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const archived = useQuery<{ _id: Id<"students">; name: string; demo: boolean }[]>(api.state.archived, {});
  const hasDemo = props.views.some((v) => v.s.demo) || (archived ?? []).some((a) => a.demo);
  const term = termOf(now());

  const add = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = await act(() => mutate(api.students.add, { name, grade, term, by: currentRole() }));
    if (id) {
      try {
        localStorage.setItem("aristora.lastGrade", String(grade));
      } catch {
        /* private mode */
      }
      toast(`Added ${name.trim()}: Grade ${grade}, Term ${term}, Fighter. Tap Move to change.`);
      setName("");
    }
  };
  const moveView = moving ? props.views.find((v) => v.s._id === moving) : undefined;

  return (
    <div class="settings-body">
      <form class="add-form" onSubmit={add}>
        <label for="new-name">Add a student</label>
        <div class="add-row">
          <input
            id="new-name"
            value={name}
            maxLength={40}
            autoComplete="off"
            placeholder="First name and initial, like Ahamed R"
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <button type="submit" class="btn primary">
            Add
          </button>
        </div>
        <div class="chip-pick" role="group" aria-label="Grade of the new student">
          {[6, 7, 8, 9, 10, 11].map((g) => (
            <button key={g} type="button" class={g === grade ? "on" : ""} aria-pressed={g === grade} onClick={() => setGrade(g)}>
              Grade {g}
            </button>
          ))}
        </div>
      </form>

      <ul class="plain-list">
        {props.views.map((v) => (
          <li key={v.s._id}>
            <span class="st-who">
              <span>
                {v.s.name}
                {v.s.demo && <span class="demo-tag">Demo</span>}
              </span>
              <small>
                Grade {v.s.grade ?? "?"} · Term {v.s.term ?? "?"} · {stageName(v.stage as Stage)}
                {v.unit ? ` · ${v.unit.code} ${v.unit.en}` : ""}
              </small>
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
        ))}
      </ul>
      {moveView && <MoveSheet v={moveView} onClose={() => setMoving(null)} />}

      {archived && archived.length > 0 && (
        <>
          <h3 class="block-title">Removed students</h3>
          <ul class="plain-list">
            {archived.map((a) => (
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
      ) : hasDemo ? (
        <button type="button" class="btn ghost wide" onClick={() => setConfirmDemo(true)}>
          Delete the demo students
        </button>
      ) : (
        <p class="muted">Demo students can only be loaded into an empty class.</p>
      )}

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
};

/** The syllabus by grade, which units have their books in the app, and setting up a workbook. */
function Books() {
  const units = allUnits();
  const books = useQuery<BookRow[]>(api.catalog.books, {}) ?? [];
  const [grade, setGrade] = useState(8);
  const [open, setOpen] = useState<Unit | null>(null);
  const list = units.filter((u) => u.grade === grade);
  const bookOf = (u: Unit, st: "fighter" | "master") => books.find((b) => b.unitId === u._id && b.stage === st);
  const done = (st: "fighter" | "master") => list.filter((u) => bookOf(u, st)).length;
  return (
    <div class="settings-body">
      <div class="chip-pick" role="group" aria-label="Grade">
        {[6, 7, 8, 9, 10, 11].map((g) => (
          <button key={g} type="button" class={g === grade ? "on" : ""} aria-pressed={g === grade} onClick={() => setGrade(g)}>
            Grade {g}
          </button>
        ))}
      </div>
      <p class="muted">
        {list.length} units. Theory books (Fighter) in the app: {done("fighter")}. Workbooks (Master): {done("master")}.
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
        Alerts follow the tab that is open. Correction hears calls. Theory and Evaluation hear a knock when a student runs out of
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
    case "explained":
      return `${v} explained`;
    case "unexplained":
      return `${v} explanation undone`;
    case "reteach":
      return "needs theory again (re-teach asked)";
    case "reteach-off":
      return "re-teach no longer needed";
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
      <p class="muted">Every change, newest first, with the phone tab it came from. The tab name is not proof of who did it.</p>
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
              {e.by && <span class={`h-by ${e.by}`}>{e.by}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Privacy() {
  return (
    <div class="settings-body prose">
      <p>
        <strong>There is no login.</strong> Anyone who has this link can see and change everything here:
      </p>
      <ul>
        <li>read every student's name, marks, calls and history</li>
        <li>mark answers, call and send students, sign them in or out</li>
        <li>add, rename or remove students, and end the session</li>
      </ul>
      <p>
        They don't even need this page: the database address is in the public GitHub code, so someone who knows how can change
        data directly.
      </p>
      <p>
        <strong>They cannot</strong> delete the database, change the app, or see your Convex or Vercel keys. Removed students can
        be brought back, and every change is listed in History.
      </p>
      <p>To stay safe:</p>
      <ul>
        <li>Use first name and initial only. No surnames, phone numbers or addresses.</li>
        <li>Share the link only with your three teachers.</li>
        <li>If marks look wrong, check History to see what changed and when.</li>
      </ul>
    </div>
  );
}
