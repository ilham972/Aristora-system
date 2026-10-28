import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { mutate } from "./backend";
import { Register } from "./board";
import { evalQueue, roomBusy, roomCalls, sameMistakes, theoryGroups, type RoomCall, type View } from "./derive";
import { GradePills, gradesOf, inGrade, needsOf, useGradeFilter } from "./grades";
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
  const { board, now } = props;
  const all = props.views;
  const grades = gradesOf(all);
  const [grade, setGrade] = useGradeFilter("theory", grades);
  const views = inGrade(all, grade);
  // With every grade showing, chips name the grade too: "G11 U13 D".
  const named = grade === "all" && grades.length > 1;
  const groups = theoryGroups(views);
  const room = roomCalls(board, all, "theory", now);
  const pick = useSelection(views, (v) => {
    if (v.where === "absent") return "not signed in";
    if (!v.st?.nextTheory && !v.ms?.reteach) return v.kind === "master" ? "not marked for re-teaching" : "no theory to teach here";
    if (v.calls.some((c) => c.kind === "theory")) return "already called for theory";
    return null;
  });
  const selected = views.filter((v) => pick.sel.has(v.s._id));
  const sections = [...new Set(selected.map((v) => (v.st?.nextTheory ? `${v.unit?.code ?? ""} ${v.st.nextTheory}` : `${v.unit?.code ?? ""} re-teach`).trim()))].join(", ");

  return (
    <main class={`page${pick.sel.size ? " with-bar" : ""}`}>
      <div class="stick">
        {room.length > 0 && <InRoom room="theory" calls={room} />}
        <GradePills views={all} needs={needsOf("theory", board, all, now)} filter={grade} onPick={setGrade} />
      </div>
      {groups.length > 0 && (
        <div class="chips-row" role="group" aria-label="Next to teach">
          <span class="chips-label">Next to teach</span>
          {groups.map((g) => (
            <button
              key={g.key}
              type="button"
              class={`group-chip u-${g.members[0].urgency}`}
              aria-label={`Select the ${g.members.length} students who need ${g.section ? `section ${g.section.id}` : "re-teaching"} of ${g.unit?.code ?? "this unit"}`}
              onClick={() => pick.set(g.members.filter((m) => !m.inEvaluation).map((m) => m.v.s._id))}
            >
              {named && g.unit ? `G${g.unit.grade} ${g.label}` : g.label}
              <b>{g.members.length}</b>
            </button>
          ))}
        </div>
      )}
      <Register
        role="theory"
        views={views}
        grouped={named}
        now={now}
        legend={
          <>
            Tap names to choose who to call. Tap the <b class="k-theory">section letter</b> to mark all its theory taught. Tap a ◎
            circle: taught, then skip, then clear. When they leave, <b>All taught</b> marks the whole section;{" "}
            <b>Send back</b> keeps only what you tapped.
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
            <small>{sections}</small>
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
  const { board, now } = props;
  const all = props.views;
  const grades = gradesOf(all);
  const [grade, setGrade] = useGradeFilter("evaluation", grades);
  const views = inGrade(all, grade);
  const named = grade === "all" && grades.length > 1;
  const room = roomCalls(board, all, "evaluation", now);
  const queue = evalQueue(views, now);
  const same = sameMistakes(queue);
  const theoryBusy = roomBusy(board, "theory");
  const canTeachHere = (v: View) =>
    theoryBusy && v.calls.length === 0 && (!!(v.st?.dry && v.st.needs.includes("theory")) || !!v.ms?.reteach);
  const pick = useSelection(views, (v) => {
    if (v.where === "absent") return "not signed in";
    if (v.calls.some((c) => c.room === "evaluation")) return "already called";
    if (v.calls.some((c) => c.room === "theory")) return "Theory has called them (theory comes first)";
    if (v.pending.length === 0 && !canTeachHere(v)) return v.kind === "master" ? "no lost marks to explain" : "nothing wrong to explain";
    return null;
  });
  const selected = views.filter((v) => pick.sel.has(v.s._id));
  const forEval = selected.filter((v) => v.pending.length > 0);
  const forTheory = selected.filter((v) => v.pending.length === 0 && canTeachHere(v));
  const pulls = room.filter((rc) => rc.c.status === "sent" && rc.v?.pulled);

  return (
    <main class={`page${pick.sel.size ? " with-bar" : ""}`}>
      <div class="stick">
        {room.length > 0 && (
          <>
          {pulls.map((rc) => (
            <div key={rc.c._id} class="pull-banner" role="alert">
              <p>
                <b>Theory wants {rc.v?.s.name} now.</b>
                <small>Tap the circles you explained first. The rest stays waiting.</small>
              </p>
              <button
                type="button"
                class="btn small"
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
          </>
        )}
        <GradePills views={all} needs={needsOf("evaluation", board, all, now)} filter={grade} onPick={setGrade} />
      </div>
      {same.length > 0 && (
        <div class="chips-row" role="group" aria-label="Same wrong answer">
          <span class="chips-label">Same mistake</span>
          {same.slice(0, 4).map((g) => (
            <button
              key={g.key}
              type="button"
              class="group-chip u-red"
              aria-label={`Select the ${g.members.length} students who got ${g.label} wrong`}
              onClick={() => pick.set(g.members.map((m) => m.v.s._id))}
            >
              {named ? `G${g.members[0].v.s.grade ?? "?"} ${g.label}` : g.label}
              <b>{g.members.length}</b>
            </button>
          ))}
        </div>
      )}
      <Register
        role="evaluation"
        views={views}
        grouped={named}
        now={now}
        legend={
          <>
            Tap names to choose who to call. Tap a <b class="k-wrong">red circle</b> when you've explained it (it turns{" "}
            <b class="k-explained">violet</b>); tap again to undo. When they leave, <b>All explained</b> marks every red circle;{" "}
            <b>Send back</b> keeps only what you tapped.
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
            {forTheory.length > 0 && (
              <small>Theory is busy: you teach {forTheory.map((v) => v.st?.nextTheory ?? "re-teach").join(", ")}</small>
            )}
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

/** Who is in the room, in one slim strip, with the two ways to send them back. */
function InRoom(props: { room: RoomName; calls: RoomCall[] }) {
  const { room, calls } = props;
  const [busy, setBusy] = useState(false);
  if (calls.length === 0) return null;
  const finishable = calls.filter((rc) => !(rc.c.status === "requested" && rc.c.pull));
  const anyLong = calls.some((rc) => rc.long);
  const kinds = new Set(finishable.map((rc) => rc.c.kind));
  const allLabel = kinds.size > 1 ? "All done" : kinds.has("theory") ? "All taught" : "All explained";

  const done = async (all: boolean) => {
    setBusy(true);
    await flushTaps();
    const items = finishable.map((rc) =>
      rc.c.kind === "theory"
        ? all
          ? { callId: rc.c._id }
          : { callId: rc.c._id, taught: [], skip: [] }
        : { callId: rc.c._id, explained: all ? (rc.v?.pending ?? []) : [] },
    );
    const res = await act(() => mutate(api.calls.finish, { items, by: currentRole() }));
    setBusy(false);
    if (res) {
      const toTheory = finishable.filter((rc) => rc.v?.pulled).map((rc) => rc.v!.s.name);
      toast(toTheory.length ? `Saved. ${toTheory.join(", ")} goes to Theory now.` : "Saved. Back to the hall.");
    }
  };

  // A group taught one section shows its letter once, not on every name.
  const sections = new Set(calls.map((rc) => (rc.c.kind === "theory" ? (rc.c.section === "R" ? "↺" : rc.c.section) : "-")));
  const oneSection = sections.size === 1 && !sections.has("-") ? [...sections][0] : undefined;

  return (
    <section class={`inroom ${room}${anyLong ? " long" : ""}`} aria-label={anyLong ? "Still with you?" : "With you"}>
      {oneSection && (
        <span class="ir-sec one" role="img" aria-label={`section ${oneSection}`}>
          {oneSection}
        </span>
      )}
      {anyLong && <span class="ir-label">Still with you?</span>}
      <ul class="ir-names">
        {calls.map((rc) => {
          const name = rc.v?.s.name ?? "?";
          const minutes = Math.floor(rc.minutes / 60_000);
          const status = rc.c.status === "sent" ? (minutes >= 1 ? `${minutes}m` : "") : rc.c.pull ? "in Evaluation" : "not sent";
          const section = !oneSection && rc.c.kind === "theory" ? (rc.c.section === "R" ? "↺" : rc.c.section) : undefined;
          return (
            <li key={rc.c._id} class={`ir-chip${rc.c.status === "sent" ? "" : " coming"}${rc.long ? " long" : ""}`}>
              <b>{name}</b>
              {section && (
                <span class="ir-sec" role="img" aria-label={`section ${section}`}>
                  {section}
                </span>
              )}
              {status && <small>{status}</small>}
              {rc.c.status === "requested" && (
                <button
                  type="button"
                  class="cs-x"
                  aria-label={`Cancel the call for ${name}`}
                  onClick={() => void act(() => mutate(api.calls.cancel, { callIds: [rc.c._id], by: currentRole() }))}
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {finishable.length > 0 && (
        <span class="ir-actions">
          <button type="button" class={`btn ${room} small`} disabled={busy} onClick={() => void done(true)}>
            {allLabel}
          </button>
          <button type="button" class="btn ghost small" disabled={busy} onClick={() => void done(false)}>
            Send back
          </button>
        </span>
      )}
    </section>
  );
}
