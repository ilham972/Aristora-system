import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { mutate } from "./backend";
import { Register } from "./board";
import { fmtMin, shortMin, type View } from "./derive";
import { ReportView, type Report } from "./report";
import { act, currentRole, toast, type Board } from "./store";
import { Empty, Sheet } from "./ui";

const signIn = (id: Id<"students">) => act(() => mutate(api.students.setPresent, { id, present: true, by: currentRole() }));

export function Correction(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const [ending, setEnding] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const present = views.filter((v) => v.where !== "absent");
  const absent = views.filter((v) => v.where === "absent");
  const red = present.filter((v) => v.tone === "red").length;
  const quiet = present.filter((v) => v.tone === "yellow").length;
  const inRooms = present.filter((v) => v.where === "theory" || v.where === "evaluation").length;

  if (views.length === 0) {
    return (
      <main class="page">
        <Empty title="No students yet">
          Open settings (the gear at the top) to add your students, or load 10 demo students to try the system.
        </Empty>
      </main>
    );
  }

  return (
    <main class="page">
      <CallsBand board={board} views={views} now={now} />

      <div class="summary" aria-label="Class summary">
        {present.length === 0 ? (
          <span>Nobody is signed in yet. Tap a name when the student arrives.</span>
        ) : (
          <>
            <span class={red ? "t-red strong" : ""}>{red} with no work</span>
            <span class={quiet ? "t-yellow strong" : ""}>{quiet} quiet</span>
            <span>{inRooms} in rooms</span>
            <span>{absent.length} not here</span>
          </>
        )}
      </div>
      <Register
        role="correction"
        views={views}
        now={now}
        legend={
          <>
            Tap a circle: <b class="k-right">once ✓ right</b>, <b class="k-wrong">twice ✗ wrong</b>,{" "}
            <b class="k-slip">3 times ↻ slip</b>. It saves when you stop. Tap a name or the colour strip for the whole book.
          </>
        }
        onName={(v) => {
          if (v.where !== "absent") return false;
          void signIn(v.s._id).then((r) => r !== undefined && toast(`${v.s.name} signed in.`));
          return true;
        }}
      />

      {absent.length > 1 && present.length === 0 && (
        <button
          type="button"
          class="btn ghost wide"
          onClick={async () => {
            for (const v of absent) await signIn(v.s._id);
          }}
        >
          Everyone is here: sign in all {absent.length}
        </button>
      )}

      {board.session && (
        <div class="end-wrap">
          <p class="muted">Class started {fmtMin(now - board.session.startedAt)} ago.</p>
          <button type="button" class="btn ghost" onClick={() => setEnding(true)}>
            End the session
          </button>
        </div>
      )}

      {ending && (
        <Sheet
          title="End the session?"
          sub="Everyone is signed out, open calls are closed, and today's report is saved."
          onClose={() => setEnding(false)}
          foot={
            <div class="row-actions">
              <button type="button" class="btn ghost" onClick={() => setEnding(false)}>
                Keep going
              </button>
              <button
                type="button"
                class="btn primary"
                onClick={async () => {
                  const r = await act(() => mutate(api.sessions.end, { by: currentRole() }));
                  setEnding(false);
                  if (r) setReport(r as Report);
                }}
              >
                End the session
              </button>
            </div>
          }
        >
          <p class="muted">Students still with a teacher are sent back to the hall first.</p>
        </Sheet>
      )}

      {report && (
        <Sheet title="Today's report" onClose={() => setReport(null)}>
          <ReportView report={report} />
        </Sheet>
      )}
    </main>
  );
}

const ROOM = { theory: "Theory", evaluation: "Evaluation" } as const;

async function notNow(callId: Id<"calls">, name: string, room: keyof typeof ROOM) {
  const ok = await act(() => mutate(api.calls.decline, { callId, by: currentRole() }));
  if (!ok) return;
  toast(`${name} not sent. ${ROOM[room]} is told.`, "info", () => {
    void act(() => mutate(api.calls.undoDecline, { callId, by: currentRole() })).then((back) => {
      if (back === false) toast(`Can't bring the call back: ${name}'s plan changed meanwhile.`, "error");
    });
  });
}

/**
 * Rooms asking for students: one slim strip per room, stuck under the header so it shows
 * even when the register is scrolled. Tap × for "not now", Sent when they've gone.
 */
function CallsBand(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const byId = new Map(views.map((v) => [v.s._id as string, v]));
  const waiting = board.calls.filter((c) => c.status === "requested" && !c.pull);
  const pulls = board.calls.filter((c) => c.status === "requested" && c.pull);
  if (waiting.length === 0 && pulls.length === 0) return null;

  const rooms = (["theory", "evaluation"] as const)
    .map((room) => ({ room, calls: waiting.filter((c) => c.room === room) }))
    .filter((r) => r.calls.length > 0);

  return (
    <div class="calls stick" aria-live="assertive">
      {rooms.map(({ room, calls }) => {
        const oldest = Math.min(...calls.map((c) => c.createdAt));
        const late = now - oldest > 60_000;
        return (
          <section key={room} class={`call-strip ${room}${late ? " late" : ""}`} aria-label={`Send to ${ROOM[room]}`}>
            <span class="cs-room">
              <span class="pulse" aria-hidden="true" />
              <span class="cs-room-text">
                <b>{ROOM[room]}</b>
                <small>{shortMin(now - oldest)}</small>
              </span>
            </span>
            <ul class="cs-names">
              {calls.map((c) => {
                const name = byId.get(c.studentId)?.s.name ?? "?";
                return (
                  <li key={c._id} class="cs-chip">
                    <span class="call-name">{name}</span>
                    <button
                      type="button"
                      class="cs-x"
                      aria-label={`Not now: ${name}`}
                      onClick={() => void notNow(c._id, name, room)}
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              class={`btn ${room} cs-send`}
              onClick={async () => {
                const r = await act(() => mutate(api.calls.send, { callIds: calls.map((c) => c._id), by: currentRole() }));
                if (r?.skipped.length) toast(`${r.skipped.join(". ")}.`, "error");
              }}
            >
              {calls.length === 1 ? "Sent" : `Sent ${calls.length}`}
            </button>
          </section>
        );
      })}
      {pulls.map((c) => (
        <p key={c._id} class="pull-note">
          <b>{byId.get(c.studentId)?.s.name ?? "?"}</b> goes from Evaluation straight to Theory. Nothing to do.
        </p>
      ))}
    </div>
  );
}
