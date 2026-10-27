import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { longLabel } from "../convex/lib/unit";
import { mutate } from "./backend";
import { Register } from "./board";
import { evalQueue, fmtMin, roomBusy, roomCalls, sameMistakes, theoryGroups, type RoomCall, type View } from "./derive";
import { act, currentRole, toast, type Board } from "./store";
import { flushTaps } from "./taps";

type RoomName = "theory" | "evaluation";
const ROOM: Record<RoomName, string> = { theory: "Theory", evaluation: "Evaluation" };

async function call(ids: string[], room: RoomName, kind: RoomName): Promise<boolean> {
  const res = await act(() => mutate(api.calls.create, { studentIds: ids as Id<"students">[], room, kind, by: currentRole() }));
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

function useSelection(views: View[], can: (v: View) => string | null) {
  const [picked, setPicked] = useState<string[]>([]);
  const byId = new Map(views.map((v) => [v.s._id as string, v]));
  const sel = new Set(picked.filter((id) => byId.has(id) && can(byId.get(id)!) === null));
  return {
    sel,
    toggle(v: View) {
      const why = can(v);
      if (why) {
        toast(`${v.s.name}: ${why}`, "error");
        return;
      }
      setPicked(sel.has(v.s._id) ? [...sel].filter((x) => x !== v.s._id) : [...sel, v.s._id]);
    },
    set(ids: string[]) {
      setPicked(ids.filter((id) => byId.has(id) && can(byId.get(id)!) === null));
    },
    clear() {
      setPicked([]);
    },
  };
}

// ---------------- Theory ----------------

export function Theory(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const groups = theoryGroups(views);
  const room = roomCalls(board, views, "theory", now);
  const pick = useSelection(views, (v) => {
    if (v.where === "absent") return "not signed in";
    if (!v.st.nextTheory) return "no theory left";
    if (v.calls.some((c) => c.kind === "theory")) return "already called for theory";
    return null;
  });
  const selected = views.filter((v) => pick.sel.has(v.s._id));
  const sections = [...new Set(selected.map((v) => v.st.nextTheory))].join(", ");

  return (
    <main class={`page${pick.sel.size ? " with-bar" : ""}`}>
      <InRoom room="theory" calls={room} />
      {groups.length > 0 && (
        <div class="chips-row" role="group" aria-label="Next to teach">
          <span class="chips-label">Next to teach</span>
          {groups.map((g) => (
            <button
              key={g.section.id}
              type="button"
              class={`group-chip u-${g.members[0].urgency}`}
              aria-label={`Select the ${g.members.length} students who need section ${g.section.id}`}
              onClick={() => pick.set(g.members.filter((m) => !m.inEvaluation).map((m) => m.v.s._id))}
            >
              {g.section.id}
              <b>{g.members.length}</b>
            </button>
          ))}
        </div>
      )}
      <Register
        role="theory"
        views={views}
        now={now}
        legend={
          <>
            Tap names to choose who to call. Tap the <b class="k-theory">section letter</b> to mark all its theory taught. Tap a ◎
            circle: taught, then skip, then clear.
          </>
        }
        selected={pick.sel}
        onName={(v) => {
          pick.toggle(v);
          return true;
        }}
      />
      {pick.sel.size > 0 && (
        <div class="call-bar theory" role="region" aria-label="Call">
          <div class="call-bar-text">
            <b>{selected.map((v) => v.s.name).join(", ")}</b>
            <small>{sections.includes(",") ? `Sections ${sections}` : `Section ${sections}`}</small>
          </div>
          <button type="button" class="btn ghost small" onClick={pick.clear}>
            Clear
          </button>
          <button
            type="button"
            class="btn theory"
            onClick={async () => {
              if (await call([...pick.sel], "theory", "theory")) pick.clear();
            }}
          >
            Call {pick.sel.size}
          </button>
        </div>
      )}
    </main>
  );
}

// ---------------- Evaluation ----------------

export function Evaluation(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const room = roomCalls(board, views, "evaluation", now);
  const queue = evalQueue(views, now);
  const same = sameMistakes(queue);
  const theoryBusy = roomBusy(board, "theory");
  const canTeachHere = (v: View) => theoryBusy && v.st.dry && v.st.needs.includes("theory") && v.calls.length === 0;
  const pick = useSelection(views, (v) => {
    if (v.where === "absent") return "not signed in";
    if (v.calls.some((c) => c.room === "evaluation")) return "already called";
    if (v.calls.some((c) => c.room === "theory")) return "Theory has called them (theory comes first)";
    if (v.st.pending.length === 0 && !canTeachHere(v)) return "nothing wrong to explain";
    return null;
  });
  const selected = views.filter((v) => pick.sel.has(v.s._id));
  const forEval = selected.filter((v) => v.st.pending.length > 0);
  const forTheory = selected.filter((v) => v.st.pending.length === 0 && canTeachHere(v));
  const pulls = room.filter((rc) => rc.c.status === "sent" && rc.v?.pulled);

  return (
    <main class={`page${pick.sel.size ? " with-bar" : ""}`}>
      {pulls.map((rc) => (
        <div key={rc.c._id} class="pull-banner" role="alert">
          <p>
            <strong>Theory is free and wants {rc.v?.s.name} now.</strong> Tap the circles you've explained, then send them. The
            rest stays waiting.
          </p>
          <button
            type="button"
            class="btn"
            onClick={async () => {
              await flushTaps();
              const r = await act(() =>
                mutate(api.calls.finish, { items: [{ callId: rc.c._id, explained: [] }], by: currentRole() }),
              );
              if (r) toast(`${rc.v?.s.name} goes to Theory now.`);
            }}
          >
            Send to Theory
          </button>
        </div>
      ))}
      <InRoom room="evaluation" calls={room} />
      {same.length > 0 && (
        <div class="chips-row" role="group" aria-label="Same wrong answer">
          <span class="chips-label">Same mistake</span>
          {same.slice(0, 4).map((g) => (
            <button
              key={g.q}
              type="button"
              class="group-chip u-red"
              aria-label={`Select the ${g.members.length} students who got ${longLabel(g.q)} wrong`}
              onClick={() => pick.set(g.members.map((m) => m.v.s._id))}
            >
              {longLabel(g.q)}
              <b>{g.members.length}</b>
            </button>
          ))}
        </div>
      )}
      <Register
        role="evaluation"
        views={views}
        now={now}
        legend={
          <>
            Tap names to choose who to call. Tap a <b class="k-wrong">red circle</b> when you've explained it (it turns{" "}
            <b class="k-explained">violet</b>); tap again to undo.
          </>
        }
        selected={pick.sel}
        onName={(v) => {
          pick.toggle(v);
          return true;
        }}
      />
      {pick.sel.size > 0 && (
        <div class="call-bar evaluation" role="region" aria-label="Call">
          <div class="call-bar-text">
            <b>{selected.map((v) => v.s.name).join(", ")}</b>
            {forTheory.length > 0 && <small>Theory is busy: you teach {forTheory.map((v) => v.st.nextTheory).join(", ")}</small>}
          </div>
          <button type="button" class="btn ghost small" onClick={pick.clear}>
            Clear
          </button>
          {forEval.length > 0 && (
            <button
              type="button"
              class="btn evaluation"
              onClick={async () => {
                if (
                  await call(
                    forEval.map((v) => v.s._id),
                    "evaluation",
                    "evaluation",
                  )
                )
                  pick.clear();
              }}
            >
              Call {forEval.length}
            </button>
          )}
          {forTheory.length > 0 && (
            <button
              type="button"
              class="btn theory"
              onClick={async () => {
                if (
                  await call(
                    forTheory.map((v) => v.s._id),
                    "evaluation",
                    "theory",
                  )
                )
                  pick.clear();
              }}
            >
              Teach {forTheory.length}
            </button>
          )}
        </div>
      )}
      {queue.length === 0 && views.some((v) => v.where !== "absent") && <p class="muted center">No wrong answers waiting.</p>}
    </main>
  );
}

// ---------------- With you (the room) ----------------

function InRoom(props: { room: RoomName; calls: RoomCall[] }) {
  const { room, calls } = props;
  const [busy, setBusy] = useState(false);
  if (calls.length === 0) return null;
  const finishable = calls.filter((rc) => !(rc.c.status === "requested" && rc.c.pull));
  const anyLong = calls.some((rc) => rc.long);

  const done = async (all: boolean) => {
    setBusy(true);
    await flushTaps();
    const items = finishable.map((rc) =>
      rc.c.kind === "theory"
        ? all
          ? { callId: rc.c._id }
          : { callId: rc.c._id, taught: [], skip: [] }
        : { callId: rc.c._id, explained: all ? (rc.v?.st.pending ?? []) : [] },
    );
    const res = await act(() => mutate(api.calls.finish, { items, by: currentRole() }));
    setBusy(false);
    if (res) {
      const toTheory = finishable.filter((rc) => rc.v?.pulled).map((rc) => rc.v!.s.name);
      toast(toTheory.length ? `Saved. ${toTheory.join(", ")} goes to Theory now.` : "Saved. Back to the hall.");
    }
  };

  return (
    <section class={`inroom ${room}`} aria-label="With you">
      <h2>With you</h2>
      <ul class="inroom-names">
        {calls.map((rc) => {
          const status = rc.c.status === "sent" ? fmtMin(rc.minutes) : rc.c.pull ? "after Evaluation" : "not sent yet";
          return (
            <li key={rc.c._id} class={rc.long ? "long" : ""}>
              <b>{rc.v?.s.name ?? "?"}</b>
              <small>
                {status}
                {rc.c.kind === "theory" && rc.c.section ? `, section ${rc.c.section}` : ""}
              </small>
              {rc.c.status === "requested" && (
                <button
                  type="button"
                  class="x-btn"
                  aria-label={`Cancel the call for ${rc.v?.s.name ?? ""}`}
                  onClick={() => void act(() => mutate(api.calls.cancel, { callIds: [rc.c._id], by: currentRole() }))}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {anyLong && <p class="note red">Still with them? Tap a button below when they leave.</p>}
      {finishable.length > 0 && (
        <div class="row-actions">
          <button type="button" class={`btn ${room}`} disabled={busy} onClick={() => void done(true)}>
            {room === "theory" ? "All taught, send back" : "All explained, send back"}
          </button>
          <button type="button" class="btn ghost" disabled={busy} onClick={() => void done(false)}>
            Send back
          </button>
        </div>
      )}
      {finishable.length > 0 && (
        <p class="hint">
          "Send back" keeps only what you tapped on the circles{room === "theory" ? " (for a part-taught section)" : ""}.
        </p>
      )}
    </section>
  );
}
