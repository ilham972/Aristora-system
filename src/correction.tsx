import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { mutate } from "./backend";
import { fmtMin, type View } from "./derive";
import { ReportView, type Report } from "./report";
import { StudentSheet } from "./student-sheet";
import { act, currentRole, type Board } from "./store";
import { Empty, Q, Sheet } from "./ui";

export function Correction(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const [openId, setOpenId] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const open = views.find((v) => v.s._id === openId);

  const present = views.filter((v) => v.where !== "absent");
  const absent = views.filter((v) => v.where === "absent");
  const red = present.filter((v) => v.tone === "red").length;
  const quiet = present.filter((v) => v.tone === "yellow").length;
  const inRooms = present.filter((v) => v.where === "theory" || v.where === "evaluation").length;

  const tapIn = (id: string) =>
    act(() => mutate(api.students.setPresent, { id: id as View["s"]["_id"], present: true, by: currentRole() }));

  if (views.length === 0) {
    return (
      <main class="page">
        <Empty title="No students yet">Open settings (the gear at the top) to add your students, or load 10 demo students to try the system.</Empty>
      </main>
    );
  }

  return (
    <main class="page">
      <CallsBand board={board} views={views} now={now} />

      <div class="summary" aria-label="Class summary">
        {present.length === 0 ? (
          <span>No one is tapped in yet. Tap students in as they arrive.</span>
        ) : (
          <>
            <span class={red ? "t-red strong" : ""}>{red} out of work</span>
            <span class={quiet ? "t-yellow strong" : ""}>{quiet} to check</span>
            <span>{inRooms} in rooms</span>
            <span>{absent.length} not here</span>
          </>
        )}
      </div>

      <ul class="tiles">
        {views.map((v) => (
          <li key={v.s._id}>
            <div class={`tile tone-${v.tone}`}>
              <button type="button" class="tile-main" onClick={() => setOpenId(v.s._id)}>
                <span class="tile-name">{v.s.name}</span>
                <span class="tile-line">{v.line}</span>
                {v.where !== "absent" && v.st.doable.length > 0 && (
                  <span class="tile-qs">
                    {v.st.doable.slice(0, 3).map((q) => (
                      <Q key={q} q={q} s={v.marks[String(q)]?.s} size="sm" />
                    ))}
                  </span>
                )}
              </button>
              {v.st.pending.length > 0 && v.where !== "absent" && (
                <span class="tile-x" aria-label={`${v.st.pending.length} wrong waiting for evaluation`}>
                  ✗{v.st.pending.length}
                </span>
              )}
              {v.where === "absent" && (
                <button type="button" class="tile-in" onClick={() => void tapIn(v.s._id)}>
                  Tap in
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {absent.length > 1 && present.length === 0 && (
        <button
          type="button"
          class="btn ghost wide"
          onClick={async () => {
            for (const v of absent) await tapIn(v.s._id);
          }}
        >
          Everyone is here: tap in all {absent.length}
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

      {open && <StudentSheet view={open} onClose={() => setOpenId(null)} />}

      {ending && (
        <Sheet
          title="End the session?"
          sub="Everyone is tapped out, open calls are closed, and today's report is saved."
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
          <p class="muted">Students who are still with a teacher are sent back to the hall first.</p>
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

/** The alert band: rooms asking for students. Correction sends them. */
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
    <div class="calls" aria-live="assertive">
      {rooms.map(({ room, calls }) => {
        const oldest = Math.min(...calls.map((c) => c.createdAt));
        const late = now - oldest > 60_000;
        return (
          <section key={room} class={`call-card ${room}${late ? " late" : ""}`}>
            <header>
              <h2>
                <span class="pulse" aria-hidden="true" />
                {room === "theory" ? "Theory" : "Evaluation"} wants
              </h2>
              <span class="call-age">{fmtMin(now - oldest)}</span>
            </header>
            <ul>
              {calls.map((c) => {
                const v = byId.get(c.studentId);
                return (
                  <li key={c._id}>
                    <span class="call-name">{v?.s.name ?? "?"}</span>
                    {c.kind === "theory" && c.room === "evaluation" && <span class="call-tag">for theory</span>}
                    <button
                      type="button"
                      class="btn ghost small"
                      onClick={() => void act(() => mutate(api.calls.decline, { callId: c._id, by: currentRole() }))}
                    >
                      Not now
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              class={`btn ${room} wide big`}
              onClick={() =>
                void act(() => mutate(api.calls.send, { callIds: calls.map((c) => c._id), by: currentRole() }))
              }
            >
              {calls.length === 1 ? `Sent ${byId.get(calls[0].studentId)?.s.name ?? ""}` : `Sent all ${calls.length}`}
            </button>
          </section>
        );
      })}
      {pulls.map((c) => (
        <p key={c._id} class="pull-note">
          {byId.get(c.studentId)?.s.name ?? "?"} goes from Evaluation straight to Theory. Nothing to do.
        </p>
      ))}
    </div>
  );
}
