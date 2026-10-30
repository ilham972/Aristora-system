// The Evaluation page (rebuilt 30 Oct 2026, like the Theory page; rules in src/evalFocusData.ts). Small things in
// fixed places, nothing that pushes the page down.
// - Pinned under the top bar: today's score in one thin line; Theory's notes (it took your student first, or wants him
//   now); then the grades and All / Fighter / Master (or, in her room, who is with her and everyone she called).
// - Under them, who to call: the same question for 2+ as tiny pills (explain once), then everyone most urgent first,
//   with his questions, why, and what he does meanwhile; the page ticks its best guess, she ticks anyone (3 at most).
//   Theory is busy: teach it here. Gone home with levels to correct.
// - At the bottom, always in the same two places: Room (everyone she called) and Call; in her room: Waiting and Done.
// - Her room: everyone she called as pills that never move (dashed while on the way, red when not there after 3
//   minutes); tap one for his file: Arrived, then his questions one at a time with the answer key (→ Theory, Not now,
//   Explained), keep him for his next book, his unit and his day.
// Tapping red circles without calling, → Theory without calling, a student's book and Move: the Class page.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { slClock } from "../convex/lib/day";
import type { KeyAnswer } from "../convex/lib/key";
import { mutate } from "./backend";
import { GoneHome, NobodyHere } from "./board";
import { TodayStrip } from "./deck";
import type { View } from "./derive";
import {
  canTeachHere,
  candidates,
  decisionWords,
  defaultEvalTicks,
  EVAL_CAP,
  evalCounts,
  evalItems,
  evalLeft,
  evalRoom,
  evalWords,
  finishPlan,
  lostWords,
  nextBooks,
  qLabel,
  sameGroups,
  type Cand,
  type Decision,
  type EvalFilter,
  type EvalHere,
  type EvalItem,
} from "./evalFocusData";
import { unitNo } from "./focusData";
import { GradePills, gradesOf, inGrade, needsOf, useGradeFilter } from "./grades";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { KeyLine, MasterStrip } from "./master";
import { KindBar, ListIcon, RoomIcon, usePinned } from "./roomkit";
import { scoreOf } from "./score";
import { act, currentMe, currentRole, toast, type Board } from "./store";
import { flushTaps } from "./taps";
import { LessonName } from "./theoryFocus";
import { classPace, mShort, sinceWords, STAY_MS } from "./theoryFocusData";
import { tone } from "./tones";

type Decisions = Record<string, Record<number, Decision | undefined>>;

/**
 * Call students to her room: to explain, or (Theory busy) to teach theory herself. Correction sends them. Each is
 * called for one book (the one on his row): he works on several at once.
 */
async function callEval(picks: View[], kind: "evaluation" | "theory"): Promise<boolean> {
  const books = picks.flatMap((v) =>
    v.unit && (v.stage === "fighter" || v.stage === "master") ? [{ studentId: v.s._id, unitId: v.unit._id, stage: v.stage }] : [],
  );
  const res = await act(() =>
    mutate(api.calls.create, { studentIds: picks.map((v) => v.s._id), room: "evaluation", kind, books, by: currentRole() }),
  );
  if (!res) return false;
  for (const r of res.rejected) toast(`${r.name} ${r.reason}.`, "error");
  const n = res.created.length;
  if (n) {
    tone("call");
    toast(`Called ${n}. Correction sends ${n === 1 ? "him" : "them"} over.`);
  }
  return n > 0;
}

/** "U09" → "unit 9": how he names a book (no U-codes on screen). */
const unitWords = (v: View | undefined) => (v?.unit ? `unit ${unitNo(v.unit.code)}` : "his other book");

export function EvaluationPage(props: { board: Board; views: View[]; now: number }) {
  const { board, now } = props;
  const all = props.views;
  const inClass = all.filter((v) => v.where !== "absent");
  const grades = gradesOf(inClass);
  const [grade, setGrade] = useGradeFilter("evaluation", grades);
  const views = inGrade(all, grade);
  const [view, setView] = useState<"list" | "room">("list");
  const [kind, setKind] = useState<EvalFilter>("all");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [teachPick, setTeachPick] = useState<string[] | null>(null);
  const [dec, setDec] = useState<Decisions>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The pinned rows' height: toasts sit just above the two buttons at the bottom, never over them.
  const stick = usePinned(view);
  const pace = classPace(all);

  // The room and Theory's notes are never filtered.
  // Her own room (31 Oct 2026): another Evaluation teacher's students are hers.
  const me = currentMe()?._id ?? null;
  const room = evalRoom(board, all, now, me);
  const items = evalItems(board, all, now, me);
  const left = evalLeft(room);
  const everyone = candidates(views, now, pace);
  const counts = evalCounts(everyone);
  const list = kind === "all" ? everyone : everyone.filter((c) => c.kind === kind);
  const groups = sameGroups(list);
  // Ticks are books (View.key): one book per student per call.
  const callable = new Map(list.filter((c) => !c.hold).map((c) => [c.v.key, c]));
  const chosen = (picked ?? defaultEvalTicks(list, left)).filter((k) => callable.has(k)).slice(0, left);
  // He stays for his next book when the room has space, or nobody urgent waits for it.
  const canKeep = left > 0 || !list.some((c) => !c.hold && c.heat !== "yellow");
  const teach = inGrade(inClass, grade).filter((v) => canTeachHere(board, v));
  const teachChosen = (teachPick ?? teach.slice(0, left).map((v) => v.s._id as string)).filter((id) => teach.some((v) => v.s._id === id));
  const byId = new Map(all.map((v) => [v.s._id as string, v]));
  const bumped = board.calls.filter(
    (c) => c.room === "theory" && c.bumped && (!c.bumpedFrom || c.bumpedFrom === me) && byId.get(c.studentId)?.where !== "absent",
  );
  const pulls = room.here.filter((h) => h.v.pulled);
  const score = scoreOf(board, all, "evaluation", now);
  const open = items.find((it) => it.id === openId) ?? items.find((it) => it.state !== "here") ?? items[0];
  const waitingRed = everyone.some((c) => !c.hold && c.heat === "red");

  const toggle = (c: Cand) => {
    const id = c.v.key;
    if (c.hold) {
      toast(`${c.v.s.name}: ${c.hold}. Theory comes first.`, "error");
      return;
    }
    // One book per call: ticking his other book swaps it.
    const same = chosen.find((k) => k !== id && callable.get(k)?.v.s._id === c.v.s._id);
    if (chosen.includes(id)) setPicked(chosen.filter((x) => x !== id));
    else if (same) setPicked(chosen.map((k) => (k === same ? id : k)));
    else if (left === 0) toast(`${EVAL_CAP} with you at most. Send someone back first.`, "error");
    else if (chosen.length >= left) toast(`Room for ${left} more (${EVAL_CAP} with you at most). Untick someone first.`, "error");
    else setPicked([...chosen, id]);
  };

  /** After Done: the next one with her opens; an empty room goes back to the list. */
  const after = (goneId: string) => {
    const rest = items.filter((it) => it.id !== goneId);
    if (rest.length === 0) setView("list");
    else setOpenId((rest.find((it) => it.state === "here") ?? rest[0]).id);
  };

  /** Done with this book, and he stays for his next one (no walk back to the hall). */
  const keep = async (h: EvalHere, next: View, how: "all" | "decided") => {
    if (!next.unit || (next.stage !== "fighter" && next.stage !== "master")) return;
    setBusy(true);
    await flushTaps();
    const p = finishPlan(h, dec[h.v.key] ?? {}, how === "all");
    let ok = true;
    if (p.theoryQs.length) {
      ok = !!(await act(() =>
        mutate(api.workbook.toTheory, { studentId: h.v.s._id, unitId: h.v.unit?._id ?? h.v.s.unitId, qs: p.theoryQs, on: true, by: currentRole() }),
      ));
    }
    const item = { callId: h.rc.c._id, explained: p.explained, ...(p.reteach ? { reteach: p.reteach } : {}) };
    const res = ok ? await act(() => mutate(api.calls.keep, { item, unitId: next.unit!._id, stage: next.stage as "fighter" | "master", by: currentRole() })) : undefined;
    setBusy(false);
    if (!res) return;
    const { [h.v.key]: _gone, ...rest } = dec;
    setDec(rest);
    tone("done");
    toast(`Saved: ${h.v.s.name} stays for ${unitWords(next)} (${next.pending.length} to explain).`);
  };

  /** Send one student back (Done), or to Theory when Theory wants him now. */
  const finish = async (h: EvalHere, how: "all" | "decided" | "nothing") => {
    setBusy(true);
    await flushTaps();
    const id = h.v.key;
    let ok = true;
    let item: { callId: Id<"calls">; explained?: number[]; reteach?: string; taught?: number[]; skip?: number[] };
    let words = "";
    if (h.kind === "theory") {
      item = how === "nothing" ? { callId: h.rc.c._id, taught: [], skip: [] } : { callId: h.rc.c._id };
      words = how === "nothing" ? "not taught" : "taught";
    } else {
      const p = how === "nothing" ? { explained: [], theoryQs: [] as number[], reteach: undefined } : finishPlan(h, dec[id] ?? {}, how === "all");
      if (p.theoryQs.length) {
        ok = !!(await act(() =>
          mutate(api.workbook.toTheory, { studentId: h.v.s._id, unitId: h.v.unit?._id ?? h.v.s.unitId, qs: p.theoryQs, on: true, by: currentRole() }),
        ));
      }
      item = { callId: h.rc.c._id, explained: p.explained, ...(p.reteach ? { reteach: p.reteach } : {}) };
      const th = p.theoryQs.length ? p.theoryQs.map((q) => qLabel(h.v, q)).join(" ") : p.reteach ? `section ${p.reteach}` : "";
      words = [`${p.explained.length} explained`, th ? `${th} to Theory` : ""].filter(Boolean).join(", ");
    }
    const res = ok ? await act(() => mutate(api.calls.finish, { items: [item], by: currentRole() })) : undefined;
    setBusy(false);
    if (!res) return;
    const { [id]: _gone, ...rest } = dec;
    setDec(rest);
    tone(how === "nothing" ? "tick" : "done");
    toast(h.v.pulled ? `${h.v.s.name} goes to Theory now (${words}).` : `Saved: ${h.v.s.name} back to work (${words}).`);
    after(h.v.s._id);
  };

  const arrive = async (it: EvalItem) => {
    const res = await act(() => mutate(api.calls.arrive, { callIds: [it.h.rc.c._id], by: currentRole() }));
    if (!res) return;
    for (const s of res.skipped) toast(`${s}.`, "error");
    if (!res.arrived) return;
    tone("tick");
    const callId = it.h.rc.c._id;
    toast(`${it.name} is here.`, "info", () => void act(() => mutate(api.calls.unarrive, { callId, by: currentRole() })));
    // He stays open: she starts on his questions (the next one on the way has his own pill).
    setOpenId(it.id);
  };
  const cancel = async (it: EvalItem) => {
    const r = await act(() => mutate(api.calls.cancel, { callIds: [it.h.rc.c._id], by: currentRole() }));
    if (!r) return;
    tone("clear");
    toast(it.state === "walking" ? `${it.name} didn't come: back in the hall.` : `The call for ${it.name} is cancelled.`);
  };

  if (inClass.length === 0 && room.here.length === 0) {
    return (
      <main class="page ev-page">
        <NobodyHere />
        <GoneHome role="evaluation" views={views} now={now} />
      </main>
    );
  }

  // The open file's Done (at the bottom): what it does for him.
  const oh = open?.state === "here" ? open.h : undefined;
  const oDecided = oh ? oh.qs.filter((x) => (dec[oh.v.key] ?? {})[x] !== undefined).length : 0;
  const doneHow: "all" | "decided" = !oh || oh.v.pulled || oh.qs.length === 0 ? "decided" : oh.kind === "theory" || oDecided === 0 ? "all" : "decided";
  const doneLabel = !oh
    ? "Done"
    : oh.kind === "theory"
      ? "Done: taught"
      : oh.v.pulled
        ? "Send to Theory"
        : oh.qs.length === 0 || oDecided > 0
          ? "Done: back to work"
          : "All explained";
  const roomTone = items.some((it) => it.late) ? "lt-red" : items.some((it) => it.state !== "here") ? "lt-amber" : "";

  return (
    <main class="page ev-page">
      <div class="stick tp-stick ev-stick" ref={stick}>
        <TodayStrip s={score} room="evaluation" inClass={inClass.length} compact />
        {bumped.length > 0 && (
          <p class="bump-note" role="status">
            <b>Theory took {bumped.map((c) => byId.get(c.studentId)?.s.name ?? "?").join(", ")} first.</b> Call {bumped.length === 1 ? "him" : "them"} again
            after Theory.
          </p>
        )}
        {pulls.map((h) => (
          <div key={h.rc.c._id} class="pull-banner" role="alert">
            <p>
              <b>Theory wants {h.v.s.name} now.</b>
              <small>What you marked Explained is saved; the rest stays waiting.</small>
            </p>
            <button type="button" class="btn small" disabled={busy} onClick={() => void finish(h, "decided")}>
              Send to Theory
            </button>
          </div>
        ))}
        {view === "list" ? (
          <>
            <GradePills views={inClass} needs={needsOf("evaluation", board, all, now)} filter={grade} onPick={setGrade} />
            <KindBar
              value={kind}
              items={[
                { id: "all", label: "All", c: counts.all },
                { id: "fighter", label: "Fighter", c: counts.fighter },
                { id: "master", label: "Master", c: counts.master },
              ]}
              onPick={(k) => {
                setKind(k);
                setPicked(null);
              }}
            />
          </>
        ) : (
          <>
            <EvalRoomHead items={items} now={now} />
            {items.length === 0 ? (
              <p class="tp-none">Nobody in your room. Call from the list.</p>
            ) : (
              <HRow as="nav" class="tp-rps" label="Your room: everyone you called" list="room" at={open?.id}>
                {items.map((it) => (
                  <RoomPill key={it.h.rc.c._id} it={it} on={it.id === open?.id} now={now} onPick={() => setOpenId(it.id)} />
                ))}
              </HRow>
            )}
          </>
        )}
      </div>

      <div class="tp-body">
        {view === "list" ? (
          <section class="ev-next" aria-label="Call next">
            {groups.length > 0 && (
              <HRow as="nav" class="ev-sames" label="The same question for 2 or more: explain it once" list={kind} at={null}>
                {groups.map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    class="ev-same"
                    aria-label={`Same question ${g.label}: tick ${g.members.map((m) => m.v.s.name).join(", ")}`}
                    onClick={() => {
                      const ids = g.members.map((m) => m.v.key).slice(0, Math.max(left, 0));
                      if (ids.length === 0) toast(`${EVAL_CAP} with you at most. Send someone back first.`, "error");
                      else setPicked(ids);
                    }}
                  >
                    <b>
                      {g.members[0].v.unit ? `${unitNo(g.members[0].v.unit.code)}·` : ""}
                      {qLabel(g.members[0].v, g.q)}
                    </b>
                    <i>×{g.members.length}</i>
                  </button>
                ))}
              </HRow>
            )}
            <div class="tp-lh ev-next-h">
              <small class={`tp-lh-t${left === 0 ? " t-amber" : ""}`}>
                {left === 0 ? `Room full (${EVAL_CAP} with you)` : `room for ${left}`}
                {groups.length > 0 ? " · same question: tap it to tick them" : ""}
              </small>
              <button type="button" class="link-btn tp-reset" onClick={() => setPicked(picked === null ? [] : null)}>
                {picked === null ? "Clear" : "Page's pick"}
              </button>
            </div>
            {list.length === 0 ? (
              <p class="muted small tp-quiet">Nothing to explain now: wrong answers and lost marks show here as soon as they are marked.</p>
            ) : (
              <ul class="ev-list" aria-label="Who to call">
                {list.flatMap((c, i) => {
                  const laterStart = (c.heat === "yellow" || !!c.hold) && (i === 0 || (list[i - 1].heat !== "yellow" && !list[i - 1].hold));
                  return [
                    ...(laterStart ? [<li key="later" class="ev-later">Later</li>] : []),
                    <li key={c.v.key}>
                      <CandRow c={c} on={chosen.includes(c.v.key)} named={grade === "all" && grades.length > 1} onTap={() => toggle(c)} />
                    </li>,
                  ];
                })}
              </ul>
            )}
            {teach.length > 0 && (
              <section class="ev-teach" aria-label="Theory is busy: teach it here">
                <p>
                  <b>Theory is busy.</b> No work until they get theory: teach it here.
                </p>
                <div class="ev-teach-names">
                  {teach.map((v) => {
                    const on = teachChosen.includes(v.s._id);
                    return (
                      <button
                        key={v.s._id}
                        type="button"
                        class={`tp-m u-red${on ? " on" : ""}`}
                        aria-pressed={on}
                        onClick={() => setTeachPick(on ? teachChosen.filter((x) => x !== v.s._id) : [...teachChosen, v.s._id])}
                      >
                        <b>{v.s.name}</b>
                        <small>{v.st?.nextTheory ? `section ${v.st.nextTheory}` : "workbook"}</small>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  class="btn theory"
                  disabled={busy || teachChosen.length === 0 || left === 0}
                  onClick={async () => {
                    if (teachChosen.length > left) {
                      toast(`Room for ${left} more (${EVAL_CAP} with you at most).`, "error");
                      return;
                    }
                    setBusy(true);
                    if (await callEval(teach.filter((v) => teachChosen.includes(v.s._id)), "theory")) setTeachPick(null);
                    setBusy(false);
                  }}
                >
                  {left === 0 ? "Room full" : `Teach ${teachChosen.length}`}
                </button>
              </section>
            )}
            <GoneHome role="evaluation" views={views} now={now} />
          </section>
        ) : open ? (
          <EvalFile
            key={open.h.rc.c._id}
            it={open}
            now={now}
            busy={busy}
            dec={dec[open.h.v.key] ?? {}}
            setDec={(d) => setDec({ ...dec, [open.h.v.key]: d })}
            onArrive={() => void arrive(open)}
            onCancel={() => void cancel(open)}
            onSendBack={() => void finish(open.h, "nothing")}
            next={open.state === "here" && open.h.kind === "evaluation" && !open.h.v.pulled ? nextBooks(open.h.v)[0] : undefined}
            canKeep={canKeep}
            onKeep={(next, how) => void keep(open.h, next, how)}
          />
        ) : null}

        <div class="tp-pad">
          {view === "list" ? (
            <button
              type="button"
              class={`tp-side${roomTone ? ` ${roomTone}` : ""}`}
              disabled={items.length === 0}
              aria-label={`Your room: ${room.here.length} with you, ${items.length - room.here.length} on the way`}
              onClick={() => setView("room")}
            >
              <RoomIcon />
              <span>Room</span>
              <b>{items.length}</b>
            </button>
          ) : (
            <button
              type="button"
              class={`tp-side${waitingRed ? " lt-red" : ""}`}
              aria-label={`Waiting for you: ${everyone.filter((c) => !c.hold).length}`}
              onClick={() => setView("list")}
            >
              <ListIcon />
              <span>Waiting</span>
              <b>{everyone.filter((c) => !c.hold).length}</b>
            </button>
          )}
          {view === "list" ? (
            <button
              type="button"
              class="btn evaluation ev-call"
              disabled={busy || chosen.length === 0}
              onClick={async () => {
                setBusy(true);
                if (await callEval(chosen.flatMap((k) => { const c = callable.get(k); return c ? [c.v] : []; }), "evaluation")) setPicked(null);
                setBusy(false);
              }}
            >
              {left === 0 ? `Room full (${EVAL_CAP})` : chosen.length === 0 ? "Tick who to call" : `Call ${chosen.length}`}
            </button>
          ) : (
            <button type="button" class="btn evaluation ev-done" disabled={busy || !oh} onClick={() => oh && void finish(oh, doneHow)}>
              {doneLabel}
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

/** Her room in one line: who is with her, who is on the way, how many fit. */
function EvalRoomHead(props: { items: EvalItem[]; now: number }) {
  const here = props.items.filter((it) => it.state === "here");
  const coming = props.items.length - here.length;
  const lost = props.items.some((it) => it.late);
  const long = here.find((it) => it.h.rc.long);
  return (
    <p class={`tp-rhead${long ? " lt-long" : ""}`} aria-label="Your room">
      <span class="strong">{here.length} with you</span>
      {coming > 0 && <span class={lost ? "t-red strong" : "t-evaluation strong"}>{coming} on the way</span>}
      <span>{long ? `Still with you? ${mShort(long.h.rc.minutes)}` : `${EVAL_CAP} at most`}</span>
    </p>
  );
}

/** Someone she called: dashed while on the way, red when late. */
function RoomPill(props: { it: EvalItem; on: boolean; now: number; onPick: () => void }) {
  const { it, on } = props;
  const cls = it.state === "here" ? "rs-in" : it.state === "walking" ? "rs-walk" : "rs-call";
  const small = it.state === "here" ? (it.h.v.pulled ? "Theory" : "") : it.state === "walking" ? sinceWords(it.h.rc.walkMs).trim() : "called";
  return (
    <button
      type="button"
      class={`tp-rp ev-rp ${cls}${it.late ? " rs-late" : ""}${it.h.v.pulled ? " rs-stay" : ""}${on ? " on" : ""}`}
      data-u={it.late ? "red" : undefined}
      data-name={it.name}
      aria-pressed={on}
      aria-label={`${it.name}: ${evalWords(it, props.now)}${it.h.v.pulled ? ", Theory wants him" : ""}`}
      onClick={props.onPick}
    >
      {it.name}
      {small && <small>{small}</small>}
    </button>
  );
}

// ---------------- Call next: one student ----------------

/** One student to call: tick, name, his questions (and his book when it matters), why, what he does meanwhile. */
function CandRow(props: { c: Cand; on: boolean; named: boolean; onTap: () => void }) {
  const { c, on } = props;
  const qs = c.qs.map((q) => qLabel(c.v, q));
  const shown = qs.length > 4 ? [...qs.slice(0, 3), `+${qs.length - 3}`] : qs;
  const book = (props.named || c.kind === "master" || !!c.v.home || c.v.others.length > 0) && c.v.unit;
  return (
    <button
      type="button"
      class={`ev-c h-${c.heat}${on ? " on" : ""}${c.hold ? " hold" : ""}`}
      data-name={c.v.s.name}
      aria-pressed={on}
      aria-label={`${c.v.s.name}: ${c.why}${c.work ? `, ${c.work}` : ""}${c.hold ? `, ${c.hold}` : ""}`}
      onClick={props.onTap}
    >
      <span class="ev-tick" aria-hidden="true" />
      <span class="ev-c-who">
        <b>{c.v.s.name}</b>
        <small>
          {book && (
            <>
              <i class="tp-ln-g">{c.v.unit!.grade}</i> <span class="tp-ln-n">{unitNo(c.v.unit!.code)}</span>
              {" · "}
            </>
          )}
          {shown.join(" ")}
        </small>
      </span>
      <span class="ev-c-why">
        <b>{c.hold ?? c.why}</b>
        {c.work && <small>{c.work}</small>}
      </span>
    </button>
  );
}

// ---------------- Her room: one student's file ----------------

const DEC_WORDS: Record<Decision, string> = { x: "explained", th: "to Theory", skip: "not now" };

/**
 * One student she called, like a doctor's file: where he is (Arrived when he comes in), his book, then his questions
 * one at a time with what he got and the answer key (→ Theory, Not now, Explained: on to the next by itself); keep him
 * for his next book; his unit and his day. Done is the button at the bottom.
 */
function EvalFile(props: {
  it: EvalItem;
  now: number;
  busy: boolean;
  dec: Record<number, Decision | undefined>;
  setDec: (d: Record<number, Decision | undefined>) => void;
  onArrive: () => void;
  onCancel: () => void;
  onSendBack: () => void;
  /** His next book with something to explain (one book per call): keep him for it, or call him again later. */
  next?: View;
  canKeep: boolean;
  onKeep: (next: View, how: "all" | "decided") => void;
}) {
  const { it, dec, now } = props;
  const h = it.h;
  const v = h.v;
  const isHere = it.state === "here";
  const firstOpen = h.qs.findIndex((q) => dec[q] === undefined);
  const [at, setAt] = useState<number | null>(null);
  const idx = Math.min(at ?? (firstOpen < 0 ? Math.max(0, h.qs.length - 1) : firstOpen), Math.max(0, h.qs.length - 1));
  const q = h.qs[idx];
  const decided = h.qs.filter((x) => dec[x] !== undefined).length;
  const theoryOk = !!v.f || !!v.ms;
  // The answer key (teachers only), fetched while his file is open.
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: v.unit?._id ?? v.s.unitId });
  const k = v.ms ? keyQ?.answers.find((a) => a.q === q) : undefined;
  const main = v.home ?? v;
  const home = v.s.lastInAt !== undefined ? v.s.lastInAt + STAY_MS : undefined;
  const nextWords = props.next ? `${unitWords(props.next)} (${props.next.pending.length})` : "";

  const choose = (d: Decision) => {
    const next = { ...dec, [q]: dec[q] === d ? undefined : d };
    props.setDec(next);
    if (d === "x" && next[q] === "x") tone("tick");
    if (next[q] === undefined) return;
    // On to the next question nobody decided yet (after this one), else stay.
    const after = h.qs.findIndex((x, i) => i > idx && next[x] === undefined);
    const before = h.qs.findIndex((x) => next[x] === undefined);
    const to = after >= 0 ? after : before;
    if (to >= 0) setAt(to);
  };

  return (
    <section class={`tp-file ev-file${h.rc.long ? " long" : ""}`} aria-label={`${it.name}'s file`}>
      <div class="tp-fh">
        <span class="tp-fh-t">
          <b class="tp-fname ev-h-name">{it.name}</b>
          <small class={it.late ? "t-red" : ""}>{evalWords(it, now)}</small>
        </span>
        {isHere ? (
          <span class="ev-left-n">{h.kind === "theory" ? "theory" : h.qs.length ? `${h.qs.length - decided} to explain` : "done"}</span>
        ) : (
          <button type="button" class="btn tp-arrive" disabled={props.busy} onClick={props.onArrive}>
            Arrived
          </button>
        )}
      </div>

      {v.unit && (
        <p class="tp-fl">
          <LessonName unit={v.unit} section={null} kind="workbook" />
        </p>
      )}

      {h.kind === "theory" ? (
        <p class="ev-teaching">
          You teach <b>{v.st?.nextTheory ? `section ${v.st.nextTheory}` : v.ms ? "his workbook questions" : "theory"}</b> (Theory was busy).
        </p>
      ) : h.qs.length === 0 ? (
        <p class="ev-teaching muted">Nothing left to explain.</p>
      ) : (
        <>
          <div class="ev-strip" role="group" aria-label={`${it.name}'s questions`}>
            {h.qs.map((x, i) => (
              <button
                key={x}
                type="button"
                class={`ev-sq${i === idx ? " now" : ""}${dec[x] ? ` d-${dec[x]}` : ""}`}
                aria-label={`${qLabel(v, x)}${dec[x] ? `: ${DEC_WORDS[dec[x]!]}` : ""}`}
                aria-current={i === idx ? "true" : undefined}
                onClick={() => setAt(i)}
              >
                {qLabel(v, x)}
              </button>
            ))}
          </div>
          <div class="ev-q" key={q}>
            <div class="ev-q-top">
              <b class="ev-q-n">{v.f ? v.f.longLabel(q) : `Q${q}`}</b>
              <span class="ev-q-lost">{v.ms ? `got ${lostWords(v, q)}` : lostWords(v, q)}</span>
            </div>
            {!v.ms ? (
              <p class="ev-key muted">Check his answer in his notebook.</p>
            ) : keyQ === undefined ? (
              <p class="ev-key muted">Loading the answer…</p>
            ) : k ? (
              <div class="ev-key">
                <small>Answer</small>
                <KeyLine k={k} />
              </div>
            ) : (
              <p class="ev-key muted">{keyQ === null ? "No answer key for this workbook yet." : "No answer for this question in the key."}</p>
            )}
            <div class="ev-q-acts">
              {theoryOk && (
                <button type="button" class={`ev-b th${dec[q] === "th" ? " on" : ""}`} aria-pressed={dec[q] === "th"} onClick={() => choose("th")}>
                  → Theory
                </button>
              )}
              <button type="button" class={`ev-b skip${dec[q] === "skip" ? " on" : ""}`} aria-pressed={dec[q] === "skip"} onClick={() => choose("skip")}>
                Not now
              </button>
              <button type="button" class={`ev-b x${dec[q] === "x" ? " on" : ""}`} aria-pressed={dec[q] === "x"} onClick={() => choose("x")}>
                {dec[q] === "x" ? "✓ Explained" : "Explained"}
              </button>
            </div>
          </div>
          {decided > 0 && <p class="ev-h-sum">{decisionWords(h, dec)}</p>}
        </>
      )}

      {props.next &&
        (props.canKeep ? (
          <button type="button" class="btn ghost ev-keep" disabled={props.busy} onClick={() => props.onKeep(props.next!, decided === 0 ? "all" : "decided")}>
            {decided === 0 ? "All explained" : "Done"}, keep him for {nextWords}
          </button>
        ) : (
          <p class="ev-also muted small">Also waiting: {nextWords}. Others need the room: call him again later.</p>
        ))}

      <div class="tp-fx">
        {v.ms && v.mb && (
          <div class="tp-fx-bar">
            <MasterStrip v={v} />
            <small>
              {v.ms.current ? `On L${v.ms.current.n}` : v.ms.finished ? "Finished" : "Every level handed in"}
              {v.ms.sofar.pct !== null ? ` · so far ${v.ms.sofar.pct}%` : ""}
              {v.ms.theory.length ? ` · ${v.ms.theory.length} for Theory` : ""}
            </small>
          </div>
        )}
        {v.st && (
          <small>
            {v.st.finished ? "Finished his book" : v.st.left === 0 ? "No work until these are explained or taught" : `${v.st.left} left in his section`}
          </small>
        )}
        <small>
          {v.s.lastInAt !== undefined ? `Came ${slClock(v.s.lastInAt)}` : "Here today"}
          {home !== undefined ? ` · home ~${slClock(home)}` : ""}
          {main.noWork && main.idleMs ? ` · no work ${mShort(main.idleMs)}` : ""}
        </small>
      </div>

      <div class="tp-flinks">
        {isHere ? (
          <button type="button" class="link-btn tf-back" disabled={props.busy} onClick={props.onSendBack}>
            {h.kind === "theory" ? "Send back: not taught" : "Send back: nothing explained"}
          </button>
        ) : (
          <button type="button" class="link-btn tf-back" disabled={props.busy} aria-label={`Cancel the call for ${it.name}`} onClick={props.onCancel}>
            {it.state === "walking" ? "Not coming: cancel the call" : "Cancel the call"}
          </button>
        )}
      </div>
    </section>
  );
}
