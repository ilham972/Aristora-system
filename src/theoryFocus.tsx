// The Theory tab, in three views (the rules are in src/theoryFocusData.ts):
// - Next: lessons to teach, most urgent first. One card per lesson (a theory-book section, or a workbook's questions
//   sent to Theory) with who needs it, ticked; one tap calls them.
// - Room: the lesson going on now, big: what to teach, who is here, "got it" for each. Done marks it taught for those
//   who got it and sends them back to work; anyone "not yet" stays. Who else needs the same lesson now can join.
// - All: the Theory screen as it was (every student, circles, chips): nothing is lost.
// The view follows the room: calling a group shows the Room; when the room empties, Next. "All" stays until changed.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { SectionData } from "../convex/lib/book";
import { mutate } from "./backend";
import { fmtMin, type RoomCall, type View } from "./derive";
import { Theory } from "./rooms";
import { act, currentRole, toast, type Board, type Unit } from "./store";
import { flushTaps } from "./taps";
import {
  defaultTicks,
  joiners,
  memberWords,
  nextLessons,
  redCount,
  roomLessons,
  workbookDone,
  type LessonKind,
  type NextLesson,
  type NextMember,
  type RoomLesson,
} from "./theoryFocusData";
import { Empty } from "./ui";

type TView = "next" | "room" | "all";
const VIEW_KEY = "aristora.theoryView";

function storedAll(): boolean {
  try {
    return localStorage.getItem(VIEW_KEY) === "all";
  } catch {
    return false;
  }
}

/** Call students to Theory (Correction is told and sends them). */
async function callTheory(ids: string[]): Promise<boolean> {
  const res = await act(() =>
    mutate(api.calls.create, { studentIds: ids as Id<"students">[], room: "theory", kind: "theory", by: currentRole() }),
  );
  if (!res) return false;
  for (const r of res.rejected) toast(`${r.name} ${r.reason}.`, "error");
  if (res.created.length) {
    const n = res.created.length;
    const pulled = res.created.filter((c) => c.pull).length;
    toast(
      pulled
        ? `Called ${n}. ${pulled === 1 ? "One comes" : `${pulled} come`} straight after Evaluation.`
        : `Called ${n}. Correction sends ${n === 1 ? "him" : "them"} over.`,
    );
  }
  return res.created.length > 0;
}

export function TheoryTab(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const next = nextLessons(views);
  const { lessons, coming } = roomLessons(board, views, now);
  const inRoom = lessons.reduce((a, l) => a + l.here.length, 0);
  const active = inRoom + coming.length > 0;
  const [view, setView] = useState<TView>(() => (storedAll() ? "all" : active ? "room" : "next"));
  // The view follows the room: someone called or arrived → Room; the room empties → Next. "All" stays.
  const was = useRef(active);
  useEffect(() => {
    if (was.current === active) return;
    was.current = active;
    setView((v) => (v === "all" ? v : active ? "room" : "next"));
  }, [active]);
  const pick = (v: TView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v === "all" ? "all" : "focus");
    } catch {
      /* private mode */
    }
  };
  const red = redCount(next);

  const tabs = (
    <nav class="tf-views" aria-label="Theory views">
      <button type="button" class={`tf-v${view === "next" ? " on" : ""}`} aria-pressed={view === "next"} onClick={() => pick("next")}>
        Next
        {red > 0 && (
          <i class="tf-badge red" aria-label={`${red} with no work`}>
            {red}
          </i>
        )}
      </button>
      <button type="button" class={`tf-v${view === "room" ? " on" : ""}`} aria-pressed={view === "room"} onClick={() => pick("room")}>
        Room
        {inRoom + coming.length > 0 && (
          <i class="tf-badge" aria-label={`${inRoom} with you, ${coming.length} on the way`}>
            {inRoom + coming.length}
          </i>
        )}
      </button>
      <button type="button" class={`tf-v${view === "all" ? " on" : ""}`} aria-pressed={view === "all"} onClick={() => pick("all")}>
        All
      </button>
    </nav>
  );

  if (view === "all") return <Theory board={board} views={views} now={now} top={tabs} />;
  return (
    <main class="page tf-page">
      <div class="stick">{tabs}</div>
      {view === "next" ? (
        <TheoryNext next={next} roomBusy={active} onRoom={() => pick("room")} />
      ) : (
        <TheoryRoom lessons={lessons} coming={coming} next={next} now={now} onNext={() => pick("next")} />
      )}
    </main>
  );
}

// ---------------- A lesson's name ----------------

/** "Q15–17", "Q13 Q17 Q21": question numbers, short. */
function qList(qs: number[]): string {
  if (qs.length === 0) return "";
  const s = [...qs].sort((a, b) => a - b);
  const runs: [number, number][] = [];
  for (const q of s) {
    const last = runs[runs.length - 1];
    if (last && q === last[1] + 1) last[1] = q;
    else runs.push([q, q]);
  }
  return runs.map(([a, b]) => (a === b ? `Q${a}` : b === a + 1 ? `Q${a} Q${b}` : `Q${a}–${b}`)).join(" ");
}

function LessonHead(props: { kind: LessonKind; unit: Unit | null; section: SectionData | null; sub?: ComponentChildren; big?: boolean }) {
  const { kind, unit, section } = props;
  const tag = unit ? `G${unit.grade} · ${unit.code}` : "";
  return (
    <div class={`tf-head${props.big ? " big" : ""}`}>
      <span class={`tf-badge-l${kind === "workbook" ? " wb" : ""}`} aria-hidden="true">
        {kind === "section" ? (section?.badge ?? "?") : "W"}
      </span>
      <span class="tf-title">
        <b>{kind === "section" ? (section?.title ?? "Theory") : `${unit?.en ?? "Workbook"}: workbook`}</b>
        <small lang="ta">{kind === "section" ? section?.tamil : unit?.ta}</small>
        <span class="tf-tag">
          {tag}
          {kind === "section" && section ? ` · section ${section.id}` : ""}
          {props.sub}
        </span>
      </span>
    </div>
  );
}

// ---------------- Next ----------------

function TheoryNext(props: { next: NextLesson[]; roomBusy: boolean; onRoom: () => void }) {
  const { next } = props;
  if (next.length === 0) {
    return (
      <>
        <Empty title="Nobody needs theory now">Students who need a section, or workbook questions sent to Theory, show here.</Empty>
        {props.roomBusy && (
          <button type="button" class="btn ghost wide" onClick={props.onRoom}>
            Back to the room
          </button>
        )}
      </>
    );
  }
  return (
    <>
      {next.map((l, i) => (
        <NextCard key={l.key} l={l} first={i === 0} />
      ))}
      <p class="muted small tf-help">
        Tap a name to leave him out (or to take him out of Evaluation). <b>Call</b> tells Correction to send them; the
        Room shows them as they come.
      </p>
    </>
  );
}

function NextCard(props: { l: NextLesson; first: boolean }) {
  const { l, first } = props;
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const ids = new Set(l.members.map((m) => m.v.s._id as string));
  const chosen = (picked ?? defaultTicks(l)).filter((id) => ids.has(id));
  const on = new Set(chosen);
  const toggle = (id: string) => setPicked(on.has(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  const sub =
    l.kind === "section"
      ? ` · teach ${qList(l.teach)}`
      : l.shared.length
        ? ` · ${l.shared.map((s) => `Q${s.q} ×${s.n}`).join(" ")}`
        : "";
  const title = l.kind === "section" ? `Section ${l.section?.id}: ${l.section?.title}` : `${l.unit?.code} workbook`;
  return (
    <section class={`tf-card u-${l.urgency}${first ? " first" : ""}`} aria-label={title}>
      {first && <p class="tf-kicker">{l.urgency === "green" ? "Nobody is waiting. Teach ahead:" : "Teach next"}</p>}
      <LessonHead kind={l.kind} unit={l.unit} section={l.section} sub={sub} big={first} />
      <ul class="tf-who" aria-label="Who needs it">
        {l.members.map((m) => (
          <li key={m.v.s._id}>
            <Member m={m} on={on.has(m.v.s._id)} onTap={() => toggle(m.v.s._id)} section={l.section} />
          </li>
        ))}
      </ul>
      <button
        type="button"
        class={`btn theory ${first ? "big " : ""}wide tf-call`}
        disabled={busy || chosen.length === 0}
        onClick={async () => {
          setBusy(true);
          if (await callTheory(chosen)) setPicked(null);
          setBusy(false);
        }}
      >
        {chosen.length === 0 ? "Tick who to call" : `Call ${chosen.length}`}
      </button>
    </section>
  );
}

function Member(props: { m: NextMember; on: boolean; onTap: () => void; section?: SectionData | null }) {
  const { m, on } = props;
  // Workbook: his questions. Section: only when he needs part of it (an earlier lesson stopped part way).
  const what = m.v.ms
    ? m.whole
      ? "whole unit"
      : qList(m.qs)
    : props.section && m.teach.length < props.section.teach.length
      ? qList(m.teach)
      : "";
  return (
    <button
      type="button"
      class={`tf-st u-${m.urgency}${on ? " on" : ""}`}
      aria-pressed={on}
      aria-label={`${m.v.s.name}: ${memberWords(m)}${what ? `, ${what}` : ""}`}
      onClick={props.onTap}
    >
      <span class="tf-tick" aria-hidden="true">
        {on ? "✓" : ""}
      </span>
      <b>{m.v.s.name}</b>
      <small>
        {memberWords(m)}
        {what ? ` · ${what}` : ""}
      </small>
    </button>
  );
}

// ---------------- Room ----------------

function TheoryRoom(props: { lessons: RoomLesson[]; coming: RoomCall[]; next: NextLesson[]; now: number; onNext: () => void }) {
  const { lessons, coming, now } = props;
  if (lessons.length === 0 && coming.length === 0) {
    return (
      <div class="empty">
        <p class="empty-title">Nobody with you</p>
        <p>Call the next lesson: the students show here as they come.</p>
        <button type="button" class="btn theory" onClick={props.onNext}>
          See who's next
        </button>
      </div>
    );
  }
  return (
    <>
      {lessons.map((l) => (
        <RoomCard key={l.key} l={l} next={props.next} now={now} />
      ))}
      {coming.length > 0 && (
        <section class="tf-coming" aria-label="On the way">
          <h3 class="tf-h">On the way</h3>
          <ul>
            {coming.map((rc) => (
              <li key={rc.c._id} class="tf-cm">
                <b>{rc.v?.s.name ?? "?"}</b>
                <small>
                  {rc.c.pull ? "finishing in Evaluation, then comes" : `called ${fmtMin(rc.minutes)} ago · Correction sends him`}
                  {rc.v?.st?.nextTheory ? ` · section ${rc.c.section}` : rc.v?.ms ? " · workbook" : ""}
                </small>
                <button
                  type="button"
                  class="cs-x"
                  aria-label={`Cancel the call for ${rc.v?.s.name ?? "this student"}`}
                  onClick={() => void act(() => mutate(api.calls.cancel, { callIds: [rc.c._id], by: currentRole() }))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function RoomCard(props: { l: RoomLesson; next: NextLesson[]; now: number }) {
  const { l, now } = props;
  // The teach questions anyone here still needs (an earlier lesson may have stopped part way).
  const teachAll = l.teach;
  // What he taught (a section's teach questions; untick the ones the bell stopped), and who got it.
  const [teach, setTeach] = useState<number[] | null>(null);
  const [notYet, setNotYet] = useState<string[]>([]);
  // Workbook: each student's questions (all ticked unless untapped) and the whole unit.
  const [qOff, setQOff] = useState<Record<string, number[]>>({});
  const [wholeOff, setWholeOff] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const taught = new Set(teach ?? teachAll);
  const ready = l.here.filter((st) => !notYet.includes(st.v.s._id));
  const join = joiners(l, props.next);
  const minutes = now - l.since;

  const done = async (list = ready, sendBackOnly = false) => {
    if (list.length === 0) return;
    setBusy(true);
    await flushTaps();
    const items: { callId: Id<"calls">; taught?: number[]; skip?: number[] }[] = [];
    let ok = true;
    for (const st of list) {
      if (sendBackOnly) {
        items.push({ callId: st.rc.c._id, taught: [], skip: [] });
      } else if (l.kind === "section") {
        items.push({ callId: st.rc.c._id, taught: teachAll.filter((q) => taught.has(q)), skip: [] });
      } else {
        const off = new Set(qOff[st.v.s._id] ?? []);
        const ticked = new Set(st.qs.filter((q) => !off.has(q)));
        const d = workbookDone(st.qs, st.whole, ticked, !wholeOff.includes(st.v.s._id));
        if (d.all) items.push({ callId: st.rc.c._id });
        else {
          if (d.taught.length) {
            const r = await act(() =>
              mutate(api.workbook.taught, { studentId: st.v.s._id, unitId: st.v.s.unitId, qs: d.taught, on: true, by: currentRole() }),
            );
            if (r === undefined) ok = false;
          }
          items.push({ callId: st.rc.c._id, taught: [] });
        }
      }
    }
    const res = ok ? await act(() => mutate(api.calls.finish, { items, by: currentRole() })) : undefined;
    setBusy(false);
    if (!res) return;
    const names = list.map((st) => st.v.s.name).join(", ");
    const stay = l.here.filter((st) => !list.includes(st)).map((st) => st.v.s.name);
    toast(
      `${sendBackOnly ? `${names}: back to the hall, not taught.` : `Saved: ${names} back to work.`}${stay.length ? ` ${stay.join(", ")} stays with you.` : ""}`,
    );
    setNotYet(notYet.filter((id) => l.here.some((st) => st.v.s._id === id && !list.includes(st))));
    // Whoever stays starts again from "everything taught": no untick carries over to him by mistake.
    setTeach(null);
    setQOff({});
    setWholeOff([]);
  };

  const what =
    l.kind === "section"
      ? teachAll.length
        ? ` · teach ${qList(teachAll)}`
        : ""
      : "";
  return (
    <section class={`tf-card room${l.long ? " long" : ""}`} aria-label={l.kind === "section" ? `Teaching section ${l.section?.id}` : "Teaching workbook questions"}>
      <p class="tf-kicker">
        {l.long ? `Still with you? ${fmtMin(minutes)}` : `With you${minutes >= 60_000 ? ` · ${fmtMin(minutes)}` : ""}`}
      </p>
      <LessonHead kind={l.kind} unit={l.unit} section={l.section} sub={what} big />

      {l.kind === "section" && teachAll.length > 0 && (
        <div class="tf-teach" role="group" aria-label="What you taught">
          <span class="tf-lbl">Taught</span>
          {teachAll.map((q) => (
            <button
              key={q}
              type="button"
              class={`tf-q${taught.has(q) ? " on" : ""}`}
              aria-pressed={taught.has(q)}
              aria-label={`Q${q} ${taught.has(q) ? "taught" : "not reached"}`}
              onClick={() => setTeach(taught.has(q) ? [...taught].filter((x) => x !== q) : [...taught, q])}
            >
              Q{q}
            </button>
          ))}
        </div>
      )}

      <ul class="tf-room" aria-label="Who is here">
        {l.here.map((st) => {
          const id = st.v.s._id as string;
          const got = !notYet.includes(id);
          const off = new Set(qOff[id] ?? []);
          const wholeOn = st.whole && !wholeOff.includes(id);
          return (
            <li key={id} class={`tf-rs${got ? "" : " stays"}`}>
              <div class="tf-rs-top">
                <b class="tf-rs-name">{st.v.s.name}</b>
                <button
                  type="button"
                  class={`tf-got${got ? " on" : ""}`}
                  aria-pressed={got}
                  aria-label={`${st.v.s.name}: ${got ? "got it" : "not yet, stays with you"}`}
                  onClick={() => setNotYet(got ? [...notYet, id] : notYet.filter((x) => x !== id))}
                >
                  {got ? "✓ Got it" : "Not yet: stays"}
                </button>
              </div>
              {l.kind === "workbook" && (st.qs.length > 0 || st.whole) && (
                <div class="tf-rs-qs" role="group" aria-label={`${st.v.s.name}'s questions`}>
                  {st.whole && (
                    <button
                      type="button"
                      class={`tf-q${wholeOn ? " on" : ""}`}
                      aria-pressed={wholeOn}
                      onClick={() => setWholeOff(wholeOn ? [...wholeOff, id] : wholeOff.filter((x) => x !== id))}
                    >
                      Whole unit
                    </button>
                  )}
                  {st.qs.map((q) => {
                    const qOn = wholeOn || !off.has(q);
                    return (
                      <button
                        key={q}
                        type="button"
                        class={`tf-q${qOn ? " on" : ""}`}
                        aria-pressed={qOn}
                        aria-label={`${st.v.s.name} Q${q} ${qOn ? "taught" : "not taught"}`}
                        onClick={() => {
                          if (qOn) {
                            setQOff({ ...qOff, [id]: [...off, q] });
                            if (wholeOn) setWholeOff([...wholeOff, id]);
                          } else setQOff({ ...qOff, [id]: [...off].filter((x) => x !== q) });
                        }}
                      >
                        Q{q}
                      </button>
                    );
                  })}
                </div>
              )}
              {!got && (
                <button type="button" class="link-btn tf-back" disabled={busy} onClick={() => void done([st], true)}>
                  Send {st.v.s.name} back without it
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <button type="button" class="btn theory big wide" disabled={busy || ready.length === 0} onClick={() => void done()}>
        {ready.length === 0 ? "Nobody ticked: they stay" : `Done: ${ready.length === l.here.length ? "" : `${ready.length} `}back to work`}
      </button>

      {join.length > 0 && (
        <div class="tf-join" aria-label="Also needs this now">
          <span class="tf-lbl">Also needs this now</span>
          {join.slice(0, 4).map((m) => (
            <button
              key={m.v.s._id}
              type="button"
              class={`tf-jn u-${m.urgency}`}
              aria-label={`Call ${m.v.s.name} to join (${memberWords(m)})`}
              disabled={busy}
              onClick={() => void callTheory([m.v.s._id])}
            >
              <b>+ {m.v.s.name}</b>
              <small>{memberWords(m)}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
