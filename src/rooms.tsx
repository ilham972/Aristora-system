import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { longLabel, sectionById } from "../convex/lib/unit";
import { mutate } from "./backend";
import {
  defaultPick,
  forMin,
  evalQueue,
  fmtMin,
  pendingSections,
  roomBusy,
  roomCalls,
  sameMistakes,
  theoryGroups,
  type RoomCall,
  type TheoryGroup,
  type View,
} from "./derive";
import { StudentSheet } from "./student-sheet";
import { act, currentRole, toast, type Board } from "./store";
import { Empty, Q, SectionBadge, Sheet } from "./ui";

type RoomName = "theory" | "evaluation";
const ROOM: Record<RoomName, string> = { theory: "Theory", evaluation: "Evaluation" };

async function call(ids: string[], room: RoomName, kind: RoomName): Promise<boolean> {
  const res = await act(() =>
    mutate(api.calls.create, { studentIds: ids as Id<"students">[], room, kind, by: currentRole() }),
  );
  if (!res) return false;
  for (const r of res.rejected) toast(`${r.name} ${r.reason}.`, "error");
  if (res.created.length) {
    const pulled = res.created.filter((c) => c.pull).length;
    toast(
      pulled
        ? `Called. ${pulled === 1 ? "One student comes" : `${pulled} students come`} straight from Evaluation.`
        : `Called ${res.created.length}. Correction will send ${res.created.length === 1 ? "the student" : "them"} over.`,
    );
  }
  return res.created.length > 0;
}

// ---------------- Theory ----------------

export function Theory(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const groups = theoryGroups(views);
  const room = roomCalls(board, views, "theory", now);
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [doneOpen, setDoneOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = views.find((v) => v.s._id === openId);

  return (
    <main class="page">
      <InRoom room="theory" calls={room} onDone={() => setDoneOpen(true)} />
      <h2 class="list-title">Next to teach</h2>
      {groups.length === 0 ? (
        <Empty title="No one needs theory right now">Students appear here when their next section needs teaching.</Empty>
      ) : (
        groups.map((g) => {
          const ids = new Set(g.members.map((m) => m.v.s._id as string));
          const picked = (overrides[g.section.id] ?? defaultPick(g)).filter((id) => ids.has(id));
          const toggle = (id: string) =>
            setOverrides({
              ...overrides,
              [g.section.id]: picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id],
            });
          return (
            <GroupCard
              key={g.section.id}
              g={g}
              picked={picked}
              onToggle={toggle}
              onName={setOpenId}
              onCall={async () => {
                if (await call(picked, "theory", "theory")) {
                  const next = { ...overrides };
                  delete next[g.section.id];
                  setOverrides(next);
                }
              }}
            />
          );
        })
      )}
      {doneOpen && <DoneSheet room="theory" calls={room} onClose={() => setDoneOpen(false)} />}
      {open && <StudentSheet view={open} onClose={() => setOpenId(null)} />}
    </main>
  );
}

function GroupCard(props: {
  g: TheoryGroup;
  picked: string[];
  onToggle: (id: string) => void;
  onName: (id: string) => void;
  onCall: () => void;
}) {
  const { g, picked } = props;
  const top = g.members[0].urgency;
  return (
    <section class={`group g-${top}`}>
      <header class="group-head">
        <SectionBadge badge={g.section.badge} />
        <div>
          <h3>
            {g.section.title}
            {g.reteach && <span class="tag">re-teach</span>}
          </h3>
          <p class="muted">
            Page {g.section.page}, questions {g.section.teach[0]} to {g.section.teach[g.section.teach.length - 1]}
          </p>
        </div>
      </header>
      <ul class="members">
        {g.members.map((m) => {
          const id = m.v.s._id as string;
          const on = picked.includes(id);
          const info =
            m.urgency === "red" ? `Out of work${forMin(m.v.idleMs)}` : `${m.v.st.left} left`;
          return (
            <li key={id} class={`member u-${m.urgency}${on ? " on" : ""}`}>
              <label class="member-pick">
                <input type="checkbox" checked={on} onChange={() => props.onToggle(id)} />
                <span class="dot" aria-hidden="true" />
                <span class="member-name">{m.v.s.name}</span>
                <span class="member-info">
                  {info}
                  {m.note && <small>{m.inEvaluation ? "In Evaluation: calling takes them from there" : `${m.note}: calling cancels that`}</small>}
                </span>
              </label>
              <button type="button" class="icon-btn small" aria-label={`Open ${m.v.s.name}`} onClick={() => props.onName(id)}>
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2" />
                  <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" class="btn theory wide big" disabled={picked.length === 0} onClick={props.onCall}>
        {picked.length === 0 ? "Tick who to call" : `Call ${picked.length} to Theory`}
      </button>
    </section>
  );
}

// ---------------- Evaluation ----------------

export function Evaluation(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const queue = evalQueue(views, now);
  const same = sameMistakes(queue);
  const room = roomCalls(board, views, "evaluation", now);
  const [doneOpen, setDoneOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = views.find((v) => v.s._id === openId);
  const pulls = room.filter((rc) => {
    const v = rc.v;
    return rc.c.status === "sent" && v?.pulled;
  });
  const theoryBusy = roomBusy(board, "theory");
  const help = theoryBusy
    ? theoryGroups(views)
        .flatMap((g) => g.members)
        .filter((m) => m.urgency === "red" && !m.inEvaluation && !m.v.calledTo)
    : [];

  return (
    <main class="page">
      {pulls.map((rc) => (
        <div key={rc.c._id} class="pull-banner" role="alert">
          <p>
            <strong>Theory wants {rc.v?.s.name} now.</strong> Finish the question you're on, then tap Done.{" "}
            {rc.v?.s.name} goes straight to Theory. Anything not explained stays waiting.
          </p>
          <button type="button" class="btn evaluation" onClick={() => setDoneOpen(true)}>
            Done
          </button>
        </div>
      ))}
      <InRoom room="evaluation" calls={room} onDone={() => setDoneOpen(true)} />

      {same.length > 0 && (
        <div class="same">
          <h2 class="list-title">Same wrong answer</h2>
          {same.slice(0, 3).map((g) => (
            <div key={g.q} class="same-row">
              <Q q={g.q} s="wrong" size="md" />
              <span class="same-names">{g.members.map((m) => m.v.s.name).join(", ")}</span>
              <button
                type="button"
                class="btn evaluation small"
                onClick={() => void call(g.members.map((m) => m.v.s._id), "evaluation", "evaluation")}
              >
                Call {g.members.length}
              </button>
            </div>
          ))}
        </div>
      )}

      <h2 class="list-title">Waiting for you</h2>
      {queue.length === 0 ? (
        <Empty title="No wrong answers waiting">Students appear here when Correction marks an answer wrong.</Empty>
      ) : (
        <ul class="queue">
          {queue.map((m) => {
            const v = m.v;
            const what = v.st.stuck.length
              ? `Stuck on ${v.st.stuck.map(longLabel).join(", ")}`
              : v.st.blocked.length
                ? `Stopped: 3 wrong in ${v.st.blocked.join(", ")}`
                : v.st.dry
                  ? `Out of work${forMin(v.idleMs)}`
                  : m.urgency === "ready"
                    ? "Ready"
                    : `Ready in ${Math.max(1, Math.ceil((m.readyInMs ?? 0) / 60_000))} min`;
            return (
              <li key={v.s._id} class={`qrow e-${m.urgency}${m.blockedBy ? " blocked" : ""}`}>
                <button type="button" class="qrow-main" onClick={() => setOpenId(v.s._id)}>
                  <span class="dot" aria-hidden="true" />
                  <span class="member-name">{v.s.name}</span>
                  <span class="member-info">{m.blockedBy ?? what}</span>
                  <span class="qrow-qs">
                    {v.st.pending.map((q) => (
                      <Q key={q} q={q} s="wrong" size="sm" />
                    ))}
                  </span>
                </button>
                {!m.blockedBy && (
                  <button type="button" class="btn evaluation small" onClick={() => void call([v.s._id], "evaluation", "evaluation")}>
                    Call
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {help.length > 0 && (
        <div class="help">
          <h2 class="list-title">Theory is busy. These students are out of work</h2>
          <ul class="queue">
            {help.map((m) => (
              <li key={m.v.s._id} class="qrow e-red">
                <button type="button" class="qrow-main" onClick={() => setOpenId(m.v.s._id)}>
                  <span class="dot" aria-hidden="true" />
                  <span class="member-name">{m.v.s.name}</span>
                  <span class="member-info">Needs {m.v.st.nextTheory} theory</span>
                </button>
                <button type="button" class="btn theory small" onClick={() => void call([m.v.s._id], "evaluation", "theory")}>
                  Teach here
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {doneOpen && <DoneSheet room="evaluation" calls={room} onClose={() => setDoneOpen(false)} />}
      {open && <StudentSheet view={open} onClose={() => setOpenId(null)} />}
    </main>
  );
}

// ---------------- In your room ----------------

function InRoom(props: { room: RoomName; calls: RoomCall[]; onDone: () => void }) {
  const { room, calls } = props;
  if (calls.length === 0) return null;
  const finishable = calls.filter((rc) => !(rc.c.status === "requested" && rc.c.pull));
  const anyLong = calls.some((rc) => rc.long);
  return (
    <section class={`inroom ${room}`}>
      <h2>In your room</h2>
      <ul>
        {calls.map((rc) => {
          const name = rc.v?.s.name ?? "?";
          const status =
            rc.c.status === "sent"
              ? `With you, ${fmtMin(rc.minutes)}`
              : rc.c.pull
                ? "Comes from Evaluation when they finish"
                : "Waiting for Correction to send";
          return (
            <li key={rc.c._id} class={rc.long ? "long" : ""}>
              <span class="member-name">{name}</span>
              <span class="member-info">
                {status}
                {rc.c.kind === "theory" && rc.c.section && <small>Section {rc.c.section}</small>}
              </span>
              {rc.c.status === "requested" && (
                <button
                  type="button"
                  class="btn ghost small"
                  onClick={() => void act(() => mutate(api.calls.cancel, { callIds: [rc.c._id], by: currentRole() }))}
                >
                  Cancel
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {anyLong && <p class="note red">Still with them? Tap Done when they leave.</p>}
      {finishable.length > 0 && (
        <button type="button" class={`btn ${room} wide big`} onClick={props.onDone}>
          Done
        </button>
      )}
    </section>
  );
}

// ---------------- Done ----------------

type Draft = { taught: number[]; skip: number[]; explained: number[]; reteach: string | null };

function DoneSheet(props: { room: RoomName; calls: RoomCall[]; onClose: () => void }) {
  const items = props.calls.filter((rc) => rc.v && !(rc.c.status === "requested" && rc.c.pull));
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const d: Record<string, Draft> = {};
    for (const rc of items) {
      const v = rc.v!;
      const sec = rc.c.section ? sectionById(rc.c.section) : undefined;
      d[rc.c._id] = {
        taught: sec ? sec.teach.filter((q) => !["taught", "skip"].includes(v.marks[String(q)]?.s ?? "")) : [],
        skip: [],
        explained: [...v.st.pending],
        reteach: null,
      };
    }
    return d;
  });
  const [saving, setSaving] = useState(false);
  const goesToTheory = props.room === "evaluation" ? items.filter((rc) => rc.v?.pulled).map((rc) => rc.v!.s.name) : [];

  const set = (id: string, patch: Partial<Draft>) => setDrafts({ ...drafts, [id]: { ...drafts[id], ...patch } });
  const flip = (list: number[], q: number) => (list.includes(q) ? list.filter((x) => x !== q) : [...list, q]);

  const save = async () => {
    setSaving(true);
    const res = await act(() =>
      mutate(api.calls.finish, {
        by: currentRole(),
        items: items.map((rc) => {
          const d = drafts[rc.c._id];
          return rc.c.kind === "theory"
            ? { callId: rc.c._id, taught: d.taught, skip: d.skip }
            : { callId: rc.c._id, explained: d.explained, reteach: d.reteach ?? undefined };
        }),
      }),
    );
    setSaving(false);
    if (res) {
      toast(goesToTheory.length ? `Saved. ${goesToTheory.join(", ")} goes to Theory now.` : "Saved. Back to the hall.");
      props.onClose();
    }
  };

  return (
    <Sheet
      title="What did you finish?"
      sub="Tap anything you didn't reach. It stays on the list."
      onClose={props.onClose}
      tone={props.room}
      foot={
        <button type="button" class={`btn ${props.room} wide big`} disabled={saving || items.length === 0} onClick={() => void save()}>
          {goesToTheory.length ? `Save: ${goesToTheory.join(", ")} goes to Theory` : "Save and send back to the hall"}
        </button>
      }
    >
      {items.length === 0 && <p class="muted">No one is in your room.</p>}
      {items.map((rc) => {
        const v = rc.v!;
        const d = drafts[rc.c._id];
        if (rc.c.kind === "theory") {
          const sec = sectionById(rc.c.section ?? "");
          if (!sec) return null;
          return (
            <div key={rc.c._id} class="done-block">
              <h3>
                {v.s.name} <span class="muted">section {sec.id}</span>
              </h3>
              <p class="done-label">Taught</p>
              <div class="book-qs">
                {sec.teach.map((q) => {
                  const already = ["taught", "skip"].includes(v.marks[String(q)]?.s ?? "");
                  return (
                    <Q
                      key={q}
                      q={q}
                      size="lg"
                      s={already || d.taught.includes(q) ? "taught" : undefined}
                      dim={already}
                      onClick={already ? undefined : () => set(rc.c._id, { taught: flip(d.taught, q) })}
                    />
                  );
                })}
              </div>
              <p class="done-label">Can skip (optional)</p>
              <div class="book-qs">
                {sec.solo.map((q) => {
                  const done = v.marks[String(q)] !== undefined;
                  return (
                    <Q
                      key={q}
                      q={q}
                      size="md"
                      s={done ? v.marks[String(q)]!.s : d.skip.includes(q) ? "skip" : undefined}
                      dim={done}
                      onClick={done ? undefined : () => set(rc.c._id, { skip: flip(d.skip, q) })}
                    />
                  );
                })}
              </div>
            </div>
          );
        }
        const sections = pendingSections(v.st);
        return (
          <div key={rc.c._id} class="done-block">
            <h3>{v.s.name}</h3>
            {v.st.pending.length === 0 ? (
              <p class="muted">No wrong answers left.</p>
            ) : (
              <>
                <p class="done-label">Explained</p>
                <div class="book-qs">
                  {v.st.pending.map((q) => (
                    <Q
                      key={q}
                      q={q}
                      size="lg"
                      s={d.explained.includes(q) ? "explained" : "wrong"}
                      onClick={() => set(rc.c._id, { explained: flip(d.explained, q) })}
                    />
                  ))}
                </div>
              </>
            )}
            {sections.map((sec) => (
              <label key={sec.id} class="check">
                <input
                  type="checkbox"
                  checked={d.reteach === sec.id}
                  onChange={() => set(rc.c._id, { reteach: d.reteach === sec.id ? null : sec.id })}
                />
                <span>Didn't understand section {sec.id}: send back to Theory to teach again</span>
              </label>
            ))}
          </div>
        );
      })}
    </Sheet>
  );
}
