import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { mutate } from "./backend";
import { GoneHome, Register } from "./board";
import { fmtMin, liveSession, shortMin, type View } from "./derive";
import { GradePills, gradesOf, inGrade, needsOf, useGradeFilter } from "./grades";
import { ReportView, type Report } from "./report";
import { act, currentRole, may, toast, type Board, type Role } from "./store";
import { Empty, Sheet } from "./ui";

/** How to tap the rows, for each job (the Class tab shows each teacher's own taps). */
const LEGEND: Record<Role, ComponentChildren> = {
  correction: (
    <>
      Theory book: tap a circle <b class="k-right">once ✓ right</b>, <b class="k-wrong">twice ✗ wrong</b>,{" "}
      <b class="k-slip">3 times ↻ slip</b>; it saves when you stop. Workbook papers: mark them in <b>Focus</b> (the target at
      the top). Tap a name for his buttons (going home, Theory, Move) and his whole book.
    </>
  ),
  theory: (
    <>
      Tap the <b class="k-theory">section letter</b> to mark all its theory taught. Tap a ◎ circle: taught, then skip, then
      clear. Workbook students show the questions sent to you: tap each ◎ when taught. Tap a name for his book and Move. To
      call students: the <b>Theory</b> tab.
    </>
  ),
  evaluation: (
    <>
      Tap a <b class="k-wrong">red circle</b> when you've explained it (it turns <b class="k-explained">violet</b>); tap again
      to undo. Tap a name for his buttons and his whole book. To call students: the <b>Evaluation</b> tab.
    </>
  ),
};

/**
 * The Class tab: everyone's home. The whole class at a glance (who is here, who has no work, who is where), each
 * teacher's own taps on the rows (the job this phone does: Correction's circles, Theory's ◎ and section letters,
 * Evaluation's red circles), and a student's buttons and whole book under his name. Correction also sends called
 * students (the strips at the top), corrects gone-home levels and ends the session.
 */
export function ClassPage(props: { board: Board; views: View[]; now: number; job: Role; onAttendance: () => void }) {
  const { board, now, job } = props;
  const [ending, setEnding] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const canCorrect = may("correction");
  // Only students signed in on Attendance are in the register; the grade pills show the grades in class now.
  const inClass = props.views.filter((v) => v.where !== "absent");
  const grades = gradesOf(inClass);
  const [grade, setGrade] = useGradeFilter(job, grades);
  // One grade at a time if the teacher chose one; the summary and the register follow it.
  const present = inGrade(inClass, grade);
  const red = present.filter((v) => v.tone === "red").length;
  const quiet = present.filter((v) => v.tone === "yellow").length;
  const inRooms = present.filter((v) => v.where === "theory" || v.where === "evaluation").length;
  const toCorrect = present.reduce((a, v) => a + (v.ms?.waiting.length ?? 0), 0);
  const session = liveSession(board, now);

  if (props.views.length === 0) {
    return (
      <main class="page">
        <Empty title="No students yet">
          {may("students")
            ? `Open settings (the gear at the top) to add your students${may("owner") ? ", or load the demo students to try the system" : ""}.`
            : "The owner (or a teacher allowed to add students) adds them in Settings."}
        </Empty>
      </main>
    );
  }

  return (
    <main class="page">
      <div class="stick">
        {canCorrect && <CallsBand board={board} views={props.views} now={now} />}
        <GradePills views={inClass} needs={needsOf(job, board, props.views, now)} filter={grade} onPick={setGrade} />
      </div>

      {inClass.length === 0 ? (
        <div class="empty">
          <p class="empty-title">Nobody is signed in yet</p>
          <p>Students show here once they are signed in on Attendance.</p>
          {canCorrect && (
            <button type="button" class="btn primary" onClick={props.onAttendance}>
              Open Attendance
            </button>
          )}
        </div>
      ) : (
        <>
          <div class="summary" aria-label="Class summary">
            <span class="strong">{present.length} in class</span>
            <span class={red ? "t-red strong" : ""}>{red} with no work</span>
            {toCorrect > 0 && <span class="t-amber strong">{toCorrect === 1 ? "1 level" : `${toCorrect} levels`} to correct</span>}
            <span class={quiet ? "t-yellow strong" : ""}>{quiet} quiet</span>
            <span>{inRooms} in rooms</span>
          </div>
          <Register
            role={job}
            views={present}
            grouped={grade === "all" && grades.length > 1}
            now={now}
            legend={LEGEND[job]}
            onName={() => false}
          />
        </>
      )}

      {job !== "theory" && <GoneHome role={job} views={inGrade(props.views, grade)} now={now} />}

      {canCorrect && session && (
        <div class="end-wrap">
          <p class="muted">Class started {fmtMin(now - session.startedAt)} ago.</p>
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
 * Rooms asking for students: one slim strip per room. The page keeps it stuck under the header (with the grade
 * pills) so it shows even when the register is scrolled. Tap × for "not now", Sent when they've gone.
 */
export function CallsBand(props: { board: Board; views: View[]; now: number }) {
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
