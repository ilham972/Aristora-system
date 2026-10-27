import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { MarkState } from "../convex/lib/status";
import { longLabel, UNIT } from "../convex/lib/unit";
import { mutate, subscribe } from "./backend";
import { fmtMin, type View } from "./derive";
import { ReportView, type Report } from "./report";
import { alert, unlockSound } from "./sound";
import { act, currentRole, toast } from "./store";
import { Sheet, STATE_WORDS } from "./ui";

type Tab = "students" | "reports" | "history" | "privacy";

function useQuery<T>(fn: Parameters<typeof subscribe>[0], args: Record<string, unknown>): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(
    () =>
      subscribe(
        fn,
        args as never,
        (v) => setValue(v as T),
        () => setValue(undefined),
      ),
    [],
  );
  return value;
}

export function Settings(props: { views: View[]; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("students");
  return (
    <main class="page settings">
      <nav class="seg" aria-label="Settings sections">
        {(
          [
            ["students", "Students"],
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
  const [editing, setEditing] = useState<{ id: Id<"students">; name: string } | null>(null);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const archived = useQuery<{ _id: Id<"students">; name: string; demo: boolean }[]>(api.state.archived, {});
  const hasDemo = props.views.some((v) => v.s.demo) || (archived ?? []).some((a) => a.demo);

  const add = async (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    const id = await act(() => mutate(api.students.add, { name, by: currentRole() }));
    if (id) {
      toast(`Added ${name.trim()}.`);
      setName("");
    }
  };

  return (
    <div class="settings-body">
      <p class="muted">
        Unit: Grade {UNIT.grade}, {UNIT.title}. Questions 1 to {UNIT.total}.
      </p>
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
      </form>

      <ul class="plain-list">
        {props.views.map((v) => (
          <li key={v.s._id}>
            <span>
              {v.s.name}
              {v.s.demo && <span class="demo-tag">Demo</span>}
            </span>
            <span class="list-actions">
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
            if (r !== undefined) toast("10 demo students loaded.");
          }}
        >
          Load 10 demo students
        </button>
      ) : hasDemo ? (
        <button type="button" class="btn ghost wide" onClick={() => setConfirmDemo(true)}>
          Delete the demo students
        </button>
      ) : (
        <p class="muted">Demo students can only be loaded into an empty class.</p>
      )}

      <h3 class="block-title">Sound</h3>
      <button
        type="button"
        class="btn ghost wide"
        onClick={() => {
          unlockSound();
          setTimeout(() => alert("call"), 150);
        }}
      >
        Play the call sound
      </button>

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

/** One history line in plain words. */
function describe(e: Doc<"events">): string {
  const v = e.value ?? "";
  switch (e.kind) {
    case "mark":
      return v === "clear"
        ? `${longLabel(e.q ?? 0)} mark cleared`
        : `${longLabel(e.q ?? 0)} marked ${STATE_WORDS[v as MarkState] ?? v}`;
    case "undo":
      return `${longLabel(e.q ?? 0)} mark undone`;
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
    case "cancel":
      return `call to ${ROOM_WORD[v] ?? v} cancelled`;
    case "bumped":
      return "Evaluation call cancelled: Theory comes first";
    case "done-theory": {
      const m = /^(\w+): taught ([\d,-]+)(?:; skip ([\d,]+))?/.exec(v);
      if (!m) return "theory finished";
      const taught = m[2] === "-" ? "nothing new taught" : `taught ${m[2].split(",").join(", ")}`;
      return `theory finished, section ${m[1]}: ${taught}${m[3] ? `, may skip ${m[3].split(",").join(", ")}` : ""}`;
    }
    case "done-evaluation": {
      const m = /^explained ([\d,-]+)(?:; re-teach (\w+))?/.exec(v);
      if (!m) return "evaluation finished";
      const what = m[1] === "-" ? "nothing explained" : `explained ${m[1].split(",").map(Number).map(longLabel).join(", ")}`;
      return `evaluation finished: ${what}${m[2] ? `, section ${m[2]} sent back to Theory` : ""}`;
    }
    case "back-to-hall":
      return "back in the hall (closed by Correction)";
    case "skip-section":
      return `skips section ${v} theory`;
    case "idle":
      return `was out of work for ${fmtMin(e.ms ?? 0)}, waiting for ${v.split("+").join(" and ")}`;
    case "session-start":
      return "Session started";
    case "session-end":
      return `Session ended after ${fmtMin(e.ms ?? 0)}`;
    case "student-add":
      return "added to the class";
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
