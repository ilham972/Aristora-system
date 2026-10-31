import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { mutate } from "./backend";
import { GoneHome, Register } from "./board";
import { Tiles } from "./deck";
import { fmtMin, isWalking, liveSession, shortMin, WALK_MS, type View } from "./derive";
import { GradePills, gradesOf, inGrade, needsOf, useGradeFilter } from "./grades";
import { nowOf } from "./nextData";
import { ReportView, type Report } from "./report";
import { act, currentRole, may, STAGES, testMode, toast, type Board, type Role, type Stage } from "./store";
import { classPace, type HeatCount } from "./theoryFocusData";
import { Empty, Sheet } from "./ui";

type StatusFilter = "all" | "red" | "correct" | "quiet" | "rooms";

/** Who a status chip shows. */
const STATUS: Record<Exclude<StatusFilter, "all">, (v: View) => boolean> = {
  red: (v) => v.where === "hall" && v.tone === "red",
  correct: (v) => (v.ms?.waiting.length ?? 0) > 0,
  quiet: (v) => v.where === "hall" && v.tone === "yellow",
  rooms: (v) => v.where === "theory" || v.where === "evaluation",
};

/** Rows by colour, for a tile: red = no work, orange = running out soon, yellow = quiet. */
function heatOfRows(vs: View[], now: number): HeatCount {
  const c: HeatCount = { red: 0, orange: 0, yellow: 0, total: vs.length };
  for (const v of vs) {
    const t = nowOf(v, now).tone;
    if (t === "red") c.red++;
    else if (t === "amber") c.orange++;
    else if (t === "yellow") c.yellow++;
  }
  return c;
}

/** How to tap the rows, for each job (the Class page shows each teacher's own taps). */
const LEGEND: Record<Role, ComponentChildren> = {
  correction: (
    <>
      Theory book: tap a circle <b class="k-right">once ✓ right</b>, <b class="k-wrong">twice ✗ wrong</b>,{" "}
      <b class="k-slip">3 times ↻ slip</b>; it saves when you stop. Workbook papers: mark them in <b>Correction</b> (the tab at the
      bottom). Tap a name for his buttons (going home, Theory, Move) and his whole book.
    </>
  ),
  theory: (
    <>
      Tap the <b class="k-theory">section letter</b> to mark all its theory taught. Tap a ◎ circle: taught, then skip, then
      clear. Workbook students show the questions sent to you: tap each ◎ when taught. Tap a name for his book and Move. To
      call students: the <b>Theory</b> page (bottom).
    </>
  ),
  evaluation: (
    <>
      Tap a <b class="k-wrong">red circle</b> when you've explained it (it turns <b class="k-explained">violet</b>); tap again
      to undo. Tap a name for his buttons and his whole book. To call students: the <b>Evaluation</b> page (bottom).
    </>
  ),
};

/**
 * The Class page (the icon at the top): everyone's view of the class. The whole class at a glance (who is here, who has no work, who is where), each
 * teacher's own taps on the rows (the job this phone does: Correction's circles, Theory's ◎ and section letters,
 * Evaluation's red circles), and a student's buttons and whole book under his name. Correction also sends called
 * students (the strips at the top), corrects gone-home levels and ends the session.
 */
export function ClassPage(props: { board: Board; views: View[]; now: number; job: Role; onAttendance: () => void }) {
  const { board, now, job } = props;
  const [ending, setEnding] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const canCorrect = may("correction");
  // Only students signed in (Attendance) are in the register; the grade pills show the grades in class now.
  const inClass = props.views.filter((v) => v.where !== "absent");
  const grades = gradesOf(inClass);
  const [grade, setGrade] = useGradeFilter(job, grades);
  // The control panel: grade, then stage (Fighter, Master ...), then unit (only the units in use, one grade at a time),
  // then what they are doing (the status chips). Every button shows how many; the register follows them all.
  const [stage, setStage] = useState<"all" | Stage>("all");
  const [unit, setUnit] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const pace = classPace(props.views);
  const inGradeNow = inGrade(inClass, grade);
  const stages = STAGES.filter((st) => inGradeNow.some((v) => v.stage === st.id));
  const stageOn = stage !== "all" && stages.some((st) => st.id === stage) ? stage : "all";
  const byStage = stageOn === "all" ? inGradeNow : inGradeNow.filter((v) => v.stage === stageOn);
  const oneGrade = grade !== "all" || grades.length === 1;
  const units = oneGrade ? unitsOf(byStage) : [];
  const unitOn = unit !== "all" && units.some((u) => u.id === unit) ? unit : "all";
  const present = unitOn === "all" ? byStage : byStage.filter((v) => v.s.unitId === unitOn);
  const red = present.filter(STATUS.red).length;
  const quiet = present.filter(STATUS.quiet).length;
  const inRooms = present.filter(STATUS.rooms).length;
  const toCorrect = present.reduce((a, v) => a + (v.ms?.waiting.length ?? 0), 0);
  const statusOn: StatusFilter =
    status === "all" || (status === "red" && red) || (status === "quiet" && quiet) || (status === "rooms" && inRooms) || (status === "correct" && toCorrect)
      ? status
      : "all";
  const rows = statusOn === "all" ? present : present.filter(STATUS[statusOn]);
  const filtered = stageOn !== "all" || unitOn !== "all" || statusOn !== "all";
  const session = liveSession(board, now);
  const chip = (id: StatusFilter, n: number, words: string, cls = "") => (
    <button
      type="button"
      class={`st-chip${cls ? ` ${cls}` : ""}${statusOn === id ? " on" : ""}${n === 0 && id !== "all" ? " zero" : ""}`}
      aria-pressed={statusOn === id}
      disabled={n === 0 && id !== "all"}
      onClick={() => setStatus(statusOn === id ? "all" : id)}
    >
      {words}
    </button>
  );

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
          <p>Students show here once they are signed in (Correction: + by the grades).</p>
          {canCorrect && (
            <button type="button" class="btn primary" onClick={props.onAttendance}>
              Sign students in
            </button>
          )}
        </div>
      ) : (
        <>
          {stages.length > 1 && (
            <Tiles
              label="Show one stage"
              value={stageOn}
              onPick={(id) => {
                setStage(id);
                setUnit("all");
              }}
              items={[
                { id: "all" as const, label: "All", c: heatOfRows(inGradeNow, now) },
                ...stages.map((st) => ({ id: st.id, label: st.id === "sprint" ? "Sprint" : st.name, c: heatOfRows(inGradeNow.filter((v) => v.stage === st.id), now) })),
              ]}
            />
          )}
          {units.length > 1 && (
            <nav class="unit-pills" aria-label="Show one unit">
              {units.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  class={`unit-p${unitOn === u.id ? " on" : ""}`}
                  aria-pressed={unitOn === u.id}
                  aria-label={`Unit ${u.code}: ${u.n} here`}
                  onClick={() => setUnit(unitOn === u.id ? "all" : u.id)}
                >
                  <b>{u.code}</b>
                  <small>{u.n}</small>
                </button>
              ))}
            </nav>
          )}
          <div class="summary st-chips" aria-label="Class summary">
            {chip("all", present.length, `${present.length} in class`, "strong")}
            {chip("red", red, `${red} with no work`, red ? "t-red strong" : "")}
            {toCorrect > 0 && chip("correct", toCorrect, `${toCorrect === 1 ? "1 level" : `${toCorrect} levels`} to correct`, "t-amber strong")}
            {chip("quiet", quiet, `${quiet} quiet`, quiet ? "t-yellow strong" : "")}
            {chip("rooms", inRooms, `${inRooms} in rooms`)}
          </div>
          {rows.length === 0 ? (
            <div class="empty">
              <p class="empty-title">Nobody here matches</p>
              <button
                type="button"
                class="btn ghost"
                onClick={() => {
                  setStage("all");
                  setUnit("all");
                  setStatus("all");
                }}
              >
                Show everyone
              </button>
            </div>
          ) : (
            <Register
              role={job}
              views={rows}
              grouped={grade === "all" && grades.length > 1}
              now={now}
              pace={pace}
              legend={LEGEND[job]}
              onName={() => false}
            />
          )}
          {filtered && rows.length > 0 && (
            <button
              type="button"
              class="link-btn show-all"
              onClick={() => {
                setStage("all");
                setUnit("all");
                setStatus("all");
              }}
            >
              Show everyone ({inGradeNow.length})
            </button>
          )}
        </>
      )}

      {job !== "theory" && <GoneHome role={job} views={inGrade(props.views, grade)} now={now} />}

      {canCorrect && session && testMode() && (
        <p class="muted end-wrap">The test class: End the session is on the real class's phones only (it signs everyone out).</p>
      )}
      {canCorrect && session && !testMode() && (
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

/** The units these students are on (only those), with how many on each, in book order. */
function unitsOf(vs: View[]): { id: string; code: string; n: number }[] {
  const by = new Map<string, { id: string; code: string; n: number }>();
  for (const v of vs) {
    if (!v.unit) continue;
    const u = by.get(v.unit._id) ?? { id: v.unit._id as string, code: v.unit.code, n: 0 };
    u.n++;
    by.set(v.unit._id, u);
  }
  return [...by.values()].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
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
 * Sent to a room (30 Oct 2026): a quiet strip counts his 3 minutes down until its teacher taps Arrived; after 3 minutes
 * a red strip (and the phone says so) until Correction finds him: "Reached" (he is there) or "In the hall" (back to work).
 * `paper` (the Correction page): no countdown strip, so the paper keeps its room on small phones; the red one still shows.
 */
export function CallsBand(props: { board: Board; views: View[]; now: number; paper?: boolean }) {
  const { board, views, now } = props;
  const byId = new Map(views.map((v) => [v.s._id as string, v]));
  const waiting = board.calls.filter((c) => c.status === "requested" && !c.pull);
  const pulls = board.calls.filter((c) => c.status === "requested" && c.pull);
  const walked = (c: Board["calls"][number]) => now - (c.sentAt ?? c.createdAt);
  const walking = board.calls.filter(isWalking);
  const onWay = props.paper ? [] : walking.filter((c) => walked(c) < WALK_MS);
  const lost = walking.filter((c) => walked(c) >= WALK_MS);
  if (waiting.length === 0 && pulls.length === 0 && onWay.length === 0 && lost.length === 0) return null;
  const nameOf = (c: { studentId: string }) => byId.get(c.studentId)?.s.name ?? "?";

  // One strip per teacher (31 Oct 2026: each Theory or Evaluation teacher has her own room): her name first, so
  // Correction sends each student to the right table.
  type Call = Board["calls"][number];
  const byTeacher = (list: Call[]) => {
    const out: { key: string; room: "theory" | "evaluation"; teacher: string; calls: Call[] }[] = [];
    for (const room of ["theory", "evaluation"] as const)
      for (const c of list) {
        if (c.room !== room) continue;
        const teacher = c.teacher ?? "";
        const g = out.find((x) => x.room === room && x.teacher === teacher);
        if (g) g.calls.push(c);
        else out.push({ key: `${room}:${c.teacherId ?? ""}`, room, teacher, calls: [c] });
      }
    return out;
  };
  const toWhom = (room: "theory" | "evaluation", teacher: string) => (teacher ? `${teacher} in ${ROOM[room]}` : ROOM[room]);

  return (
    <div class="calls" aria-live="assertive">
      {byTeacher(waiting).map(({ key, room, teacher, calls }) => {
        const oldest = Math.min(...calls.map((c) => c.createdAt));
        const late = now - oldest > 60_000;
        return (
          <section key={key} class={`call-strip ${room}${late ? " late" : ""}`} aria-label={`Send to ${toWhom(room, teacher)}`}>
            <span class="cs-room">
              <span class="pulse" aria-hidden="true" />
              <span class="cs-room-text">
                <b>{teacher || ROOM[room]}</b>
                <small>
                  {teacher ? `${ROOM[room]} · ` : ""}
                  {shortMin(now - oldest)}
                </small>
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
      {byTeacher(onWay).map(({ key, room, teacher, calls: list }) => {
        return (
          <section key={key} class={`call-strip ${room} cs-walk`} aria-label={`On the way to ${toWhom(room, teacher)}`}>
            <span class="cs-room-text">
              <b>To {teacher || ROOM[room]}</b>
              <small>{teacher ? `${ROOM[room]} · walking` : "walking"}</small>
            </span>
            <ul class="cs-names">
              {list.map((c) => (
                <li key={c._id} class="cs-chip">
                  <span class="call-name">{nameOf(c)}</span>
                  <small class="cs-left">{Math.max(1, Math.ceil((WALK_MS - walked(c)) / 60_000))}m left</small>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {lost.map((c) => {
        const name = nameOf(c);
        return (
          <section key={c._id} class="call-strip cs-lost" aria-label={`${name} hasn't reached ${toWhom(c.room, c.teacher ?? "")}`}>
            <span class="cs-lost-t">
              <b>{name}</b> isn't {c.teacher ? `with ${c.teacher}` : `in ${ROOM[c.room]}`} · {Math.floor(walked(c) / 60_000)}m
            </span>
            <button
              type="button"
              class="btn small cs-reached"
              onClick={async () => {
                const r = await act(() => mutate(api.calls.arrive, { callIds: [c._id], by: currentRole() }));
                if (r?.arrived) toast(`${name} reached ${ROOM[c.room]}.`);
              }}
            >
              Reached
            </button>
            <button
              type="button"
              class="btn ghost small cs-hall"
              onClick={async () => {
                const r = await act(() => mutate(api.calls.cancel, { callIds: [c._id], by: currentRole() }));
                if (r) toast(`${name} is back in the hall. ${ROOM[c.room]} can call him again.`);
              }}
            >
              In the hall
            </button>
          </section>
        );
      })}
    </div>
  );
}
