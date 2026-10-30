// The Theory page (rebuilt 30 Oct 2026, the founder's voice note; rules in src/theoryFocusData.ts). Like Correction:
// small things in fixed places, nothing that pushes the page down.
// - Pinned under the top bar: today's score in one line, All / Fighter / Master, then every lesson as a tiny pill in ONE
//   line that scrolls sideways, the most useful first: grade, unit number, the Tamil name, how many need it, and a red
//   (no work now) or amber (soon) line under it. The ranking holds still while she touches it.
// - Under it, the open lesson's students: each with what he needs (his questions, or the part of the section) and what
//   he is doing ("no work 6m", "2 left · out ~5m"). The page ticks who needs it most; she ticks anyone.
// - At the bottom, always in the same two places: Room (everyone she called) and Call.
// - Her room: everyone she called as pills (they never move: dashed while on the way, red when not there after 3
//   minutes); tap one for his file: Arrived, what to teach him with his marks and the answer, his unit, his day. Done
//   sends back everyone who got it.
// Marking taught without calling, a student's whole book and Move are on the Class page (tap his name).

import { useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { SectionData } from "../convex/lib/book";
import { slClock } from "../convex/lib/day";
import type { KeyAnswer } from "../convex/lib/key";
import { mutate } from "./backend";
import { NobodyHere } from "./board";
import type { View } from "./derive";
import { TodayStrip } from "./deck";
import { unitNo } from "./focusData";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { KeyLine, MasterStrip } from "./master";
import { KindBar, ListIcon, RoomIcon, usePinned } from "./roomkit";
import { scoreOf } from "./score";
import { act, currentRole, toast, type Board, type Unit } from "./store";
import { flushTaps } from "./taps";
import {
  defaultTicks,
  HOLD_MS,
  joiners,
  kindCounts,
  LESSON_CAP,
  lessonLength,
  memberWords,
  mShort,
  nextOrder,
  pillTone,
  planLessons,
  roomItems,
  roomLeft,
  roomLessons,
  roomWords,
  sinceWords,
  STAY_MS,
  startIn,
  teachLeft,
  whyWords,
  workbookDone,
  type HeatCount,
  type Lesson,
  type LessonKind,
  type Member,
  type PillOrder,
  type RoomItem,
  type RoomLesson,
} from "./theoryFocusData";
import { tone } from "./tones";

/** Call students to a lesson: each for the book of that lesson (he works on several books at once). */
async function callTheory(picks: View[]): Promise<boolean> {
  const books = picks.flatMap((v) =>
    v.unit && (v.stage === "fighter" || v.stage === "master") ? [{ studentId: v.s._id, unitId: v.unit._id, stage: v.stage }] : [],
  );
  const res = await act(() =>
    mutate(api.calls.create, { studentIds: picks.map((v) => v.s._id), room: "theory", kind: "theory", books, by: currentRole() }),
  );
  if (!res) return false;
  for (const r of res.rejected) toast(`${r.name} ${r.reason}.`, "error");
  if (res.created.length) {
    tone("call");
    const n = res.created.length;
    const pulled = res.created.filter((c) => c.pull).length;
    const bumped = res.created.filter((c) => c.bumped).length;
    toast(
      `${
        pulled
          ? `Called ${n}. ${pulled === 1 ? "One comes" : `${pulled} come`} straight after Evaluation.`
          : `Called ${n}. Correction sends ${n === 1 ? "him" : "them"} over.`
      }${bumped ? ` Evaluation had called ${n === 1 ? "him" : bumped === 1 ? "one of them" : `${bumped} of them`}: she is told.` : ""}`,
    );
  }
  return res.created.length > 0;
}

type Kind = "all" | LessonKind;

export function TheoryTab(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  // How long this teacher's lessons take, learnt from Done (12 min until there are a few).
  const recent = useQuery<{ ms: number[] }>(api.calls.lessons, {});
  const lessonMs = lessonLength(recent?.ms);
  const room = roomLessons(board, views, now);
  const freeIn = startIn(room, lessonMs, now);
  const plan = planLessons(views, now, { lessonMs, startInMs: freeIn });
  const [view, setView] = useState<"lessons" | "room">("lessons");
  const [kind, setKind] = useState<Kind>("all");
  // The lesson she opened (else the first pill), and her ticks per lesson: kept while she switches between them.
  const [sel, setSel] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string[] | null>>({});
  // Her room: whose file is open, who didn't get it, what she didn't reach.
  const [openId, setOpenId] = useState<string | null>(null);
  const [notYet, setNotYet] = useState<string[]>([]);
  const [teachOff, setTeachOff] = useState<Record<string, number[]>>({});
  const [qOff, setQOff] = useState<Record<string, number[]>>({});
  const [wholeOff, setWholeOff] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // The pills' order (held still while she touches them) and when she last touched them.
  const order = useRef<PillOrder | null>(null);
  const touched = useRef(0);

  // The pinned rows' height: toasts sit just above the two buttons at the bottom, never over them.
  const stick = usePinned(view);

  const inClass = views.filter((v) => v.where !== "absent");
  const counts = kindCounts(plan);
  const shownPlan = kind === "all" ? plan : plan.filter((l) => l.kind === kind);
  const ord = nextOrder(order.current, shownPlan, Date.now() - touched.current < HOLD_MS);
  order.current = ord;
  const byKey = new Map(shownPlan.map((l) => [l.key, l]));
  const pills = ord.keys.flatMap((k) => byKey.get(k) ?? []);
  const current = pills.find((l) => l.key === sel) ?? pills[0];
  const going = new Map(room.map((l) => [l.key, l]));
  const items = roomItems(room, now);
  const here = items.filter((it) => it.state === "here");
  const ready = here.filter((it) => !notYet.includes(it.id));
  const open = items.find((it) => it.id === openId) ?? items.find((it) => it.state === "walking" || it.state === "called") ?? items[0];
  const score = scoreOf(board, views, "theory", now);
  const touch = () => {
    touched.current = Date.now();
  };

  // The open lesson: who is ticked (the page's pick until she changes it), how many may come.
  const goingL = current ? going.get(current.key) : undefined;
  const cap = goingL ? roomLeft(goingL) : LESSON_CAP;
  const defaults = current ? (goingL ? joiners(goingL, plan).map((m) => m.v.s._id as string) : defaultTicks(current)) : [];
  const ids = new Set(current?.members.map((m) => m.v.s._id as string) ?? []);
  const chosen = (current ? (picks[current.key] ?? defaults) : []).filter((id) => ids.has(id)).slice(0, cap);
  const toggle = (m: Member) => {
    if (!current) return;
    const id = m.v.s._id as string;
    if (chosen.includes(id)) setPicks({ ...picks, [current.key]: chosen.filter((x) => x !== id) });
    else if (chosen.length >= cap)
      toast(goingL ? (cap === 0 ? "This lesson is full (6). Done first." : `Room for ${cap} more in this lesson.`) : `${LESSON_CAP} at most in one lesson. Untick someone first.`, "error");
    else setPicks({ ...picks, [current.key]: [...chosen, id] });
  };
  const call = async () => {
    if (!current || chosen.length === 0) return;
    setBusy(true);
    const ok = await callTheory(current.members.filter((m) => chosen.includes(m.v.s._id)).map((m) => m.v));
    setBusy(false);
    if (ok) {
      setPicks({ ...picks, [current.key]: null });
      order.current = null; // the ranking catches up at once (her finger is on Call, not on the pills)
    }
  };

  // ---- Her room ----
  const arrive = async (it: RoomItem) => {
    const res = await act(() => mutate(api.calls.arrive, { callIds: [it.rc.c._id], by: currentRole() }));
    if (!res) return;
    for (const s of res.skipped) toast(`${s}.`, "error");
    if (!res.arrived) return;
    tone("tick");
    const callId = it.rc.c._id;
    toast(`${it.name} is here.`, "info", () => void act(() => mutate(api.calls.unarrive, { callId, by: currentRole() })));
    // The next one still on the way opens by itself (they often come together).
    const next = items.find((x) => x.id !== it.id && (x.state === "walking" || x.state === "called"));
    setOpenId(next ? next.id : it.id);
  };
  const cancel = async (it: RoomItem) => {
    const r = await act(() => mutate(api.calls.cancel, { callIds: [it.rc.c._id], by: currentRole() }));
    if (!r) return;
    tone("clear");
    toast(it.state === "walking" ? `${it.name} didn't come: back in the hall.` : `The call for ${it.name} is cancelled.`);
  };
  const done = async (list: RoomItem[], sendBackOnly = false) => {
    const sts = list.flatMap((it) => (it.state === "here" && it.st ? [{ it, st: it.st }] : []));
    if (sts.length === 0) return;
    setBusy(true);
    await flushTaps();
    const finishItems: { callId: Id<"calls">; taught?: number[]; skip?: number[] }[] = [];
    let ok = true;
    for (const { it, st } of sts) {
      const l = it.lesson;
      if (sendBackOnly) {
        finishItems.push({ callId: st.rc.c._id, taught: [], skip: [] });
      } else if (l.kind === "section") {
        const off = new Set(teachOff[l.key] ?? []);
        finishItems.push({ callId: st.rc.c._id, taught: l.teach.filter((q) => !off.has(q)), skip: [] });
      } else {
        const offQ = new Set(qOff[it.id] ?? []);
        const ticked = new Set(st.qs.filter((q) => !offQ.has(q)));
        const d = workbookDone(st.qs, st.whole, ticked, !wholeOff.includes(it.id));
        if (d.all) finishItems.push({ callId: st.rc.c._id });
        else {
          if (d.taught.length) {
            const r = await act(() =>
              mutate(api.workbook.taught, { studentId: st.v.s._id, unitId: st.v.unit?._id ?? st.v.s.unitId, qs: d.taught, on: true, by: currentRole() }),
            );
            if (r === undefined) ok = false;
          }
          finishItems.push({ callId: st.rc.c._id, taught: [] });
        }
      }
    }
    const res = ok ? await act(() => mutate(api.calls.finish, { items: finishItems, by: currentRole() })) : undefined;
    setBusy(false);
    if (!res) return;
    tone(sendBackOnly ? "tick" : "done");
    const goneIds = sts.map((x) => x.it.id);
    const names = sts.map((x) => x.it.name).join(", ");
    const stay = here.filter((it) => !goneIds.includes(it.id)).map((it) => it.name);
    toast(
      `${sendBackOnly ? `${names}: back to the hall, not taught.` : `Saved: ${names} back to work.`}${stay.length ? ` ${stay.join(", ")} stays with you.` : ""}`,
    );
    setNotYet(notYet.filter((id) => !goneIds.includes(id)));
    // Whoever stays starts again from "everything taught": no untick carries over to him by mistake.
    setTeachOff({});
    setQOff({});
    setWholeOff([]);
    order.current = null;
    // The room is empty now: back to the lessons, to pick the next one.
    if (items.length === goneIds.length) setView("lessons");
  };

  if (inClass.length === 0 && room.length === 0) {
    return (
      <main class="page tp-page">
        <NobodyHere />
      </main>
    );
  }
  const roomTone = items.some((it) => it.late) ? "lt-red" : items.some((it) => it.state !== "here") ? "lt-amber" : "";
  const lessonsTone = pills.some((l) => pillTone(l) === "red") ? "lt-red" : "";
  const full = !!goingL && cap === 0;
  return (
    <main class="page tp-page">
      <div class="stick tp-stick" ref={stick}>
        <TodayStrip s={score} room="theory" inClass={inClass.length} compact />
        {view === "lessons" ? (
          <>
            <KindBar
              value={kind}
              items={[
                { id: "all", label: "All", c: counts.all },
                { id: "section", label: "Fighter", c: counts.section },
                { id: "workbook", label: "Master", c: counts.workbook },
              ]}
              onPick={(k) => {
                setKind(k);
                setSel(null);
              }}
            />
            <div class="tp-lrow" onPointerDownCapture={touch} onScrollCapture={touch}>
              {pills.length === 0 ? (
                <p class="tp-none">Nobody needs theory now.</p>
              ) : (
                <HRow as="nav" class="tp-lps" label="Lessons, the most useful first" list={kind} at={current?.key}>
                  {pills.map((l) => (
                    <LessonPill
                      key={l.key}
                      l={l}
                      on={l.key === current?.key}
                      going={going.has(l.key)}
                      onPick={() => {
                        touch();
                        setSel(l.key);
                      }}
                    />
                  ))}
                </HRow>
              )}
            </div>
          </>
        ) : (
          <>
            <RoomHead room={room} items={items} now={now} />
            {items.length === 0 ? (
              <p class="tp-none">Nobody in your room. Call from Lessons.</p>
            ) : (
              <HRow as="nav" class="tp-rps" label="Your room: everyone you called" list="room" at={open?.id}>
                {items.map((it) => (
                  <RoomPill key={it.rc.c._id} it={it} on={it.id === open?.id} stays={notYet.includes(it.id)} now={now} onPick={() => setOpenId(it.id)} />
                ))}
              </HRow>
            )}
          </>
        )}
      </div>

      <div class="tp-body">
        {view === "lessons" ? (
          current ? (
            <LessonList
              key={current.key}
              l={current}
              going={goingL}
              chosen={chosen}
              isDefault={picks[current.key] == null}
              onToggle={toggle}
              onReset={() => setPicks({ ...picks, [current.key]: null })}
            />
          ) : (
            <p class="muted small tp-quiet">Students who need a section, or workbook questions sent to Theory, show here.</p>
          )
        ) : open ? (
          <StudentFile
            key={open.rc.c._id}
            it={open}
            now={now}
            busy={busy}
            got={!notYet.includes(open.id)}
            onGot={() => setNotYet(notYet.includes(open.id) ? notYet.filter((x) => x !== open.id) : [...notYet, open.id])}
            onArrive={() => void arrive(open)}
            onCancel={() => void cancel(open)}
            onSendBack={() => void done([open], true)}
            teachOff={teachOff[open.lesson.key] ?? []}
            onTeach={(q) => {
              const off = teachOff[open.lesson.key] ?? [];
              setTeachOff({ ...teachOff, [open.lesson.key]: off.includes(q) ? off.filter((x) => x !== q) : [...off, q] });
            }}
            qOff={qOff[open.id] ?? []}
            wholeOn={!wholeOff.includes(open.id)}
            onQ={(q, on) => {
              const off = qOff[open.id] ?? [];
              if (on) setQOff({ ...qOff, [open.id]: off.filter((x) => x !== q) });
              else {
                // One question not reached: the whole unit isn't done either.
                setQOff({ ...qOff, [open.id]: [...off.filter((x) => x !== q), q] });
                if (!wholeOff.includes(open.id)) setWholeOff([...wholeOff, open.id]);
              }
            }}
            onWhole={() => setWholeOff(wholeOff.includes(open.id) ? wholeOff.filter((x) => x !== open.id) : [...wholeOff, open.id])}
          />
        ) : null}
        {view === "room" && here.length > 0 && (
          <button type="button" class="link-btn tf-back tp-all-back" disabled={busy} onClick={() => void done(here, true)}>
            Send everyone back: nothing taught
          </button>
        )}

        <div class="tp-pad">
          {view === "lessons" ? (
            <button
              type="button"
              class={`tp-side${roomTone ? ` ${roomTone}` : ""}`}
              disabled={items.length === 0}
              aria-label={`Your room: ${here.length} with you, ${items.length - here.length} on the way`}
              onClick={() => setView("room")}
            >
              <RoomIcon />
              <span>Room</span>
              <b>{items.length}</b>
            </button>
          ) : (
            <button
              type="button"
              class={`tp-side${lessonsTone ? ` ${lessonsTone}` : ""}`}
              aria-label={`Lessons: ${pills.length}`}
              onClick={() => setView("lessons")}
            >
              <ListIcon />
              <span>Lessons</span>
              <b>{pills.length}</b>
            </button>
          )}
          {view === "lessons" ? (
            <button type="button" class="btn theory tp-call" disabled={busy || chosen.length === 0} onClick={() => void call()}>
              {full ? "Lesson full: Done first" : chosen.length === 0 ? "Tick who to call" : `Call ${chosen.length}`}
            </button>
          ) : (
            <button type="button" class="btn theory tp-done" disabled={busy || ready.length === 0} onClick={() => void done(ready)}>
              {here.length === 0
                ? "Done: nobody is here yet"
                : ready.length === 0
                  ? "Nobody ticked: they stay"
                  : `Done: ${ready.length === here.length ? "" : `${ready.length} `}back to work`}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------- The pinned rows ----------------

/** A lesson's name the way he wants it: the grade as a number, the unit number, the Tamil name (a section: its letter and Tamil title). */
export function LessonName(props: { unit: Unit | null; section: SectionData | null; kind: LessonKind }) {
  const { unit, section } = props;
  const ta = props.kind === "section" ? section?.tamil || unit?.ta : unit?.ta;
  return (
    <>
      {unit && (
        <i class="tp-ln-g" aria-hidden="true">
          {unit.grade}
        </i>
      )}
      <b class="tp-ln-n">
        {unit ? unitNo(unit.code) : "?"}
        {props.kind === "section" && section ? `·${section.id}` : ""}
      </b>
      <span class="tp-ln-t" lang="ta">
        {ta}
      </span>
    </>
  );
}

/** Words for a screen reader (and the tests): "Grade 11, unit 13, section D: Completing the square". */
function lessonTitle(l: { kind: LessonKind; section: SectionData | null; unit: Unit | null }): string {
  const u = l.unit ? `Grade ${l.unit.grade}, unit ${unitNo(l.unit.code)}` : "Theory";
  return l.kind === "section" ? `${u}, section ${l.section?.id}: ${l.section?.title}` : `${u}: ${l.unit?.en ?? "workbook"}, workbook`;
}

/** One lesson as a tiny pill: its name, how many need it, and a red or amber line under it. */
function LessonPill(props: { l: Lesson; on: boolean; going: boolean; onPick: () => void }) {
  const { l, on } = props;
  const t = pillTone(l);
  return (
    <button
      type="button"
      class={`tp-lp${t ? ` lt-${t}` : ""}${l.kind === "section" ? " lt-th" : ""}${on ? " on" : ""}${props.going ? " lt-going" : ""}`}
      data-u={t ?? undefined}
      data-lesson={l.label}
      aria-pressed={on}
      aria-label={`${lessonTitle(l)}: ${l.members.length} need it. ${whyWords(l)}${props.going ? ". Going on in your room" : ""}`}
      onClick={props.onPick}
    >
      <LessonName unit={l.unit} section={l.section} kind={l.kind} />
      <i class="tp-lp-c" aria-hidden="true">
        {l.members.length}
      </i>
    </button>
  );
}

/** The room in one line: who is with her, who is on the way, how long. */
function RoomHead(props: { room: RoomLesson[]; items: RoomItem[]; now: number }) {
  const { room, items, now } = props;
  const here = items.filter((it) => it.state === "here").length;
  const coming = items.length - here;
  const lost = items.filter((it) => it.late).length;
  const since = room.reduce<number | null>((a, l) => (l.since === null ? a : a === null ? l.since : Math.min(a, l.since)), null);
  const long = room.some((l) => l.long);
  return (
    <p class={`tp-rhead${long ? " lt-long" : ""}`} aria-label="Your room">
      <span class="strong">{here} with you</span>
      {coming > 0 && <span class={lost ? "t-red strong" : "t-theory strong"}>{coming} on the way</span>}
      {since !== null && now - since >= 60_000 && <span>{long ? `Still with you? ${mShort(now - since)}` : mShort(now - since)}</span>}
    </p>
  );
}

/** Someone she called: dashed while on the way, red when late, amber ring when he didn't get it. */
function RoomPill(props: { it: RoomItem; on: boolean; stays: boolean; now: number; onPick: () => void }) {
  const { it, on } = props;
  const cls = it.state === "here" ? "rs-in" : it.state === "walking" ? "rs-walk" : it.state === "eval" ? "rs-ev" : "rs-call";
  const small = it.state === "here" ? "" : it.state === "walking" ? sinceWords(it.rc.walkMs).trim() : it.state === "eval" ? "Eval" : "called";
  return (
    <button
      type="button"
      class={`tp-rp ${cls}${it.late ? " rs-late" : ""}${props.stays ? " rs-stay" : ""}${on ? " on" : ""}`}
      data-u={it.late ? "red" : undefined}
      data-name={it.name}
      aria-pressed={on}
      aria-label={`${it.name}: ${roomWords(it, props.now)}`}
      onClick={props.onPick}
    >
      {it.name}
      {small && <small>{small}</small>}
    </button>
  );
}

// ---------------- The open lesson ----------------

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

/** What a workbook student brings (his questions, or the whole unit), or the part of a section he still needs. */
function whatOf(m: { v: View; qs: number[]; whole: boolean; teach: number[] }, section: SectionData | null): string {
  if (m.v.ms) return m.whole ? "whole unit" : qList(m.qs);
  return section && m.teach.length < section.teach.length ? qList(m.teach) : "";
}

/** The lesson's students: what each needs and is doing; one tap ticks or unticks. */
function LessonList(props: {
  l: Lesson;
  going?: RoomLesson;
  chosen: string[];
  isDefault: boolean;
  onToggle: (m: Member) => void;
  onReset: () => void;
}) {
  const { l, going } = props;
  const facts = [
    going ? `in your room: ${going.here.length + going.coming.length} · room for ${roomLeft(going)}` : "",
    l.kind === "section"
      ? l.teach.length
        ? `teach ${qList(l.teach)}`
        : ""
      : l.shared.length
        ? `${l.shared.map((s) => `Q${s.q} ×${s.n}`).join(" ")}: teach once`
        : "",
  ].filter(Boolean);
  return (
    <section class="tp-lesson" aria-label={lessonTitle(l)}>
      <div class="tp-lh">
        <span class="tp-lh-t">{facts.join(" · ") || `${l.members.length} need it`}</span>
        <button type="button" class="link-btn tp-reset" disabled={props.isDefault} onClick={props.onReset}>
          Page's pick
        </button>
      </div>
      <ul class="tp-rows" aria-label="Who needs it">
        {l.members.map((m) => {
          const on = props.chosen.includes(m.v.s._id);
          const words = memberWords(m);
          const what = whatOf(m, l.section);
          return (
            <li key={m.v.s._id}>
              <button
                type="button"
                class={`tp-row u-${m.urgency}${on ? " on" : ""}${m.hold ? " lt-hold" : ""}`}
                data-name={m.v.s.name}
                aria-pressed={on}
                aria-label={`${m.v.s.name}: ${words}${what ? `, ${what}` : ""}`}
                onClick={() => props.onToggle(m)}
              >
                <i class="tp-tick" aria-hidden="true" />
                <span class="tp-row-m">
                  <b>{m.v.s.name}</b>
                  <small>{words}</small>
                </span>
                {what && <span class="tp-row-q">{what}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ---------------- His file (the room) ----------------

/** By which room a question was sent to Theory. */
const BY_WORDS: Record<string, string> = { evaluation: "Evaluation", focus: "Correction", correction: "Correction", theory: "Theory", class: "Class" };

/**
 * One student she called, like a doctor's file: where he is (Arrived when he comes in; then "got it" or not), what to
 * teach him with his marks, who sent it and the answer; his unit and his day.
 */
function StudentFile(props: {
  it: RoomItem;
  now: number;
  busy: boolean;
  got: boolean;
  onGot: () => void;
  onArrive: () => void;
  onCancel: () => void;
  onSendBack: () => void;
  teachOff: number[];
  onTeach: (q: number) => void;
  qOff: number[];
  wholeOn: boolean;
  /** Q taught (on) or not reached. */
  onQ: (q: number, on: boolean) => void;
  onWhole: () => void;
}) {
  const { it, now } = props;
  const v = it.rc.v;
  const l = it.lesson;
  const name = it.name;
  const isHere = it.state === "here";
  const qs = v?.ms ? [...v.ms.theory] : [];
  const whole = !!v?.ms?.wholeUnit;
  const mine = v ? teachLeft(v, l.section) : [];
  const off = new Set(props.teachOff);
  const qOff = new Set(props.qOff);
  const main = v ? (v.home ?? v) : undefined;
  const also = main ? main.others.filter((o) => o.key !== v?.key && o.unit).map((o) => unitNo(o.unit!.code)) : [];
  const home = v?.s.lastInAt !== undefined ? v.s.lastInAt + STAY_MS : undefined;
  return (
    <section class="tp-file" aria-label={`${name}'s file`}>
      <div class="tp-fh">
        <span class="tp-fh-t">
          <b class="tp-fname">{name}</b>
          <small class={it.late ? "t-red" : ""}>{roomWords(it, now)}</small>
        </span>
        {isHere ? (
          <button
            type="button"
            class={`tp-gotit${props.got ? " on" : ""}`}
            aria-pressed={props.got}
            aria-label={`${name}: ${props.got ? "got it" : "not yet, stays with you"}`}
            onClick={props.onGot}
          >
            {props.got ? "✓ Got it" : "Not yet: stays"}
          </button>
        ) : (
          <button type="button" class="btn tp-arrive" disabled={props.busy || it.state === "eval"} onClick={props.onArrive}>
            Arrived
          </button>
        )}
      </div>

      <p class="tp-fl">
        <LessonName unit={l.unit} section={l.section} kind={l.kind} />
      </p>

      {l.kind === "section" && l.teach.length > 0 && (
        <div class="tf-teach tp-teach" role="group" aria-label="What you taught">
          <span class="tf-lbl">Taught</span>
          {l.teach.map((q) => {
            const on = !off.has(q);
            return (
              <button
                key={q}
                type="button"
                class={`tf-q${on ? " on" : ""}${mine.includes(q) ? "" : " lt-done"}`}
                aria-pressed={on}
                aria-label={`Q${q} ${on ? "taught" : "not reached"}`}
                onClick={() => props.onTeach(q)}
              >
                Q{q}
              </button>
            );
          })}
        </div>
      )}

      {v?.ms && (
        <>
          {whole && (
            <button
              type="button"
              class={`tf-q tp-whole${props.wholeOn ? " on" : ""}`}
              aria-pressed={props.wholeOn}
              onClick={props.onWhole}
            >
              The whole unit again
            </button>
          )}
          {qs.length > 0 && <FileQuestions v={v} qs={qs} off={qOff} wholeOn={whole && props.wholeOn} now={now} onQ={props.onQ} name={name} />}
        </>
      )}

      <div class="tp-fx">
        {v?.ms && v.mb && (
          <div class="tp-fx-bar">
            <MasterStrip v={v} />
            <small>
              {v.ms.current ? `On L${v.ms.current.n}` : v.ms.finished ? "Finished" : "Every level handed in"}
              {v.ms.sofar.pct !== null ? ` · so far ${v.ms.sofar.pct}%` : ""}
              {v.ms.pending.length ? ` · ${v.ms.pending.length} for Evaluation` : ""}
            </small>
          </div>
        )}
        {v?.st && (
          <small>
            {v.st.finished
              ? "Finished his book"
              : v.st.left === 0
                ? "No work until this lesson"
                : `${v.st.left} question${v.st.left === 1 ? "" : "s"} left before he needs it`}
            {v.pending.length ? ` · ${v.pending.length} wrong, for Evaluation` : ""}
          </small>
        )}
        <small>
          {v?.s.lastInAt !== undefined ? `Came ${slClock(v.s.lastInAt)}` : "Here today"}
          {home !== undefined ? ` · home ~${slClock(home)}` : ""}
          {main?.noWork && main.idleMs ? ` · no work ${mShort(main.idleMs)}` : ""}
        </small>
        {also.length > 0 && <small>Also waiting: unit {also.join(", ")}</small>}
      </div>

      <div class="tp-flinks">
        {isHere ? (
          <button type="button" class="link-btn tf-back" disabled={props.busy} onClick={props.onSendBack}>
            Send {name} back without it
          </button>
        ) : (
          <button type="button" class="link-btn tf-back" disabled={props.busy} aria-label={`Cancel the call for ${name}`} onClick={props.onCancel}>
            {it.state === "walking" ? "Not coming: cancel the call" : "Cancel the call"}
          </button>
        )}
      </div>
    </section>
  );
}

/** His questions for Theory: what he got, who sent it and when, the answer from the key; a tap = taught or not. */
function FileQuestions(props: {
  v: View;
  qs: number[];
  off: Set<number>;
  wholeOn: boolean;
  now: number;
  name: string;
  onQ: (q: number, on: boolean) => void;
}) {
  const { v, qs, off, now } = props;
  // The answer key (teachers only), fetched while his file is open.
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: v.unit?._id ?? v.s.unitId });
  return (
    <ul class="tp-fq" aria-label={`${props.name}'s questions`}>
      {qs.map((q) => {
        const r = v.mm.q[String(q)];
        const on = props.wholeOn || !off.has(q);
        const k = keyQ?.answers.find((a) => a.q === q);
        const marks = r ? (r.dk ? (r.dkp?.length ? `${r.got ?? 0}/${r.max ?? "?"} · ? ${r.dkp.join(" ")}` : "? couldn't start") : r.max !== undefined ? `got ${r.got ?? 0}/${r.max}` : "") : "";
        const sent = r?.th ? `${BY_WORDS[r.tb ?? ""] ?? "sent"} · ${mShort(now - r.th)}` : "";
        return (
          <li key={q}>
            <button
              type="button"
              class={`tf-q${on ? " on" : ""}`}
              aria-pressed={on}
              aria-label={`${props.name} Q${q} ${on ? "taught" : "not taught"}`}
              onClick={() => props.onQ(q, !on)}
            >
              Q{q}
            </button>
            <span class="tp-fq-w">
              <b>{marks}</b>
              {sent && <small>{sent}</small>}
              {r?.x ? <small>explained {slClock(r.x)}</small> : null}
            </span>
            {k && <KeyLine k={k} />}
          </li>
        );
      })}
    </ul>
  );
}
