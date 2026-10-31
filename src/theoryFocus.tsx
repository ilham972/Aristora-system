// The Theory page: one screen (31 Oct 2026, his voice note: "rebuild the theory page also same like" the Evaluation
// page; rules in src/theoryFocusData.ts). Like Correction: small things in fixed places, the buttons she taps fast at
// the bottom.
// - Pinned: grades 6–11 and Fighter / Master / Legend. Under them, the units that need her (number + Tamil) and the
//   lessons: a theory book's sections, or a workbook's questions that the same students need ("13 · 17") and the whole
//   unit again. Each row the most urgent first and already picked; she can pick anything. The lessons row holds still
//   while she touches it (5 s). With someone in her room the rows show the book of the question on her screen, marked
//   with a dot, even when nobody else waits for it (src/roomRows.ts).
// - Her room: a box of student pills (6 at most): with her (solid; a lock on the box), on the way (dashed), called
//   (dotted), finishing in Evaluation first, late (red); then the picked lesson's students, ticked by the page (everyone
//   who can come, no work first; with someone already with her, only those who need it now); tap = untick (grey).
//   Beside it, always in the same places: Call, Arrived, Done.
// - What to teach as tiny squares (like Correction), one at a time: who needs it, his marks, who sent it, the answer.
//   At the bottom, fixed: Not reached and the big Taught: one tap counts for everyone with her who needs it.
// - Tap someone in her room: his file (Arrived, his questions taught or not, send him back, cancel the call).
// Marking taught without calling, a student's whole book and Move: the Class page (tap his name).

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { slClock } from "../convex/lib/day";
import { joinNames } from "./announce";
import { mutate } from "./backend";
import { NobodyHere } from "./board";
import { heatWords, TodayStrip } from "./deck";
import type { View } from "./derive";
import { unitNo } from "./focusData";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { MasterStrip } from "./master";
import { AnswerKey, BackToRoom, GradeRow, KindBar, LessonName, LockIcon, usePinned } from "./roomkit";
import { QuestionToggle } from "./bookQuestion";
import { scoreOf } from "./score";
import { act, bookDocAt, clearToasts, currentMe, currentRole, toast, type Board } from "./store";
import { flushTaps } from "./taps";
import {
  decOf,
  HOLD_MS,
  holdOrder,
  itemKey,
  LESSON_CAP,
  lessonLength,
  lessonPills,
  lessonPillSig,
  memberWords,
  mShort,
  needsOf,
  planLessons,
  roomItems,
  roomLessons,
  roomWords,
  sinceWords,
  STAY_MS,
  startIn,
  tAllDecided,
  tDecisionWords,
  theoryFinish,
  theoryRows,
  theorySquares,
  tUndecided,
  type LessonPill,
  type Member,
  type PillOrder,
  type RoomItem,
  type TDecision,
  type TDecisions,
  type TheorySquare,
  type TheoryStage,
  type TQ,
} from "./theoryFocusData";
import { tone } from "./tones";
import { Sheet } from "./ui";

export { LessonName } from "./roomkit";

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

/** What she picked in the rows (anything left out: the page's pick, the most urgent). */
type Pick = { grade?: number; stage?: TheoryStage; unit?: string; pill?: string };

/** "13", "All": a square's words. */
const qShort = (q: TQ) => (q === "whole" ? "All" : String(q));
/** By which room a question was sent to Theory. */
const BY_WORDS: Record<string, string> = { evaluation: "Evaluation", focus: "Correction", correction: "Correction", theory: "Theory", class: "Class" };

/** A workbook question for Theory, for her: what he got ("got 0/2", "? couldn't start") and who sent it, when. */
function qWords(v: View, q: TQ, now: number): string {
  if (q === "whole") return "the whole unit";
  const r = v.mm.q[String(q)];
  if (!r) return "";
  const marks = r.dk ? (r.dkp?.length ? `${r.got ?? 0}/${r.max ?? "?"} · ? ${r.dkp.join(" ")}` : "? couldn't start") : r.max !== undefined ? `${r.got ?? 0}/${r.max}` : "";
  const sent = r.th ? `${BY_WORDS[r.tb ?? ""] ?? "sent"}${sinceWords(now - r.th)}` : "";
  return [marks, sent].filter(Boolean).join(" · ");
}

export function TheoryTab(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  // How long this teacher's lessons take, learnt from Done (12 min until there are a few).
  const recent = useQuery<{ ms: number[] }>(api.calls.lessons, {});
  const lessonMs = lessonLength(recent?.ms);
  // Her own room (31 Oct 2026): another Theory teacher's students are hers.
  const me = currentMe()?._id ?? null;
  const room = roomLessons(board, views, now, me);
  const freeIn = startIn(room, lessonMs, now);
  const plan = planLessons(views, now, { lessonMs, startInMs: freeIn });
  const items = roomItems(room, now);
  const left = Math.max(0, LESSON_CAP - items.length);
  const [pick, setPick] = useState<Pick>({});
  const [ticks, setTicks] = useState<{ pill: string; ids: string[] } | null>(null);
  const [dec, setDec] = useState<TDecisions>({});
  const [at, setAt] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The lessons row's order (held still while she touches it) and when she last touched it.
  const order = useRef<PillOrder | null>(null);
  const touched = useRef(0);
  const stick = usePinned("tpx");
  useEffect(() => {
    document.body.classList.add("evx-on");
    return () => document.body.classList.remove("evx-on");
  }, []);
  const touch = () => {
    touched.current = Date.now();
  };

  const inClass = views.filter((v) => v.where !== "absent");

  // ---- Her room's squares: each question once for everyone with her who needs it (nobody here yet: on the way) ----
  const here = items.filter((it) => it.state === "here");
  const live = here.length > 0;
  const roomSqs = theorySquares(items, null);
  const atRoom = roomSqs.find((x) => x.key === at);
  /** The question that opens by itself: the first one somebody with her still needs decided (else the first). */
  const firstOpen = (list: TheorySquare[]) => (live ? list.find((x) => tUndecided(x, dec).length > 0) : undefined) ?? list[0];

  // ---- The rows: always the book of the question on her screen (his screenshot, 31 Oct 2026: src/roomRows.ts) ----
  const rows = theoryRows(pick, plan, roomSqs, atRoom ?? firstOpen(roomSqs));
  const { grades, grade, stages, stage, units } = rows;
  const unitKey = rows.unit;
  const unit = units.find((u) => u.key === unitKey) ?? null;
  const onRoom = rows.onRoom;
  const inBook = (x: TheorySquare) => x.unit?._id === unitKey && x.kind === stage;
  // On her room's book: the open question there (it decides the lesson pill too).
  const roomSq = onRoom ? ((atRoom && inBook(atRoom) ? atRoom : firstOpen(roomSqs.filter(inBook))) ?? null) : null;
  const roomL = roomSq?.who[0]?.lesson;
  /** Back to her room: her pick ends, the rows show her room's book again (else the most urgent). */
  const follow = () => setPick((p) => (Object.keys(p).length ? {} : p));
  const ranked = unit ? lessonPills(unit) : [];
  const ord = holdOrder(
    order.current,
    ranked.map((p) => ({ key: p.key, sig: lessonPillSig(p) })),
    Date.now() - touched.current < HOLD_MS,
  );
  order.current = ord;
  const byKey = new Map(ranked.map((p) => [p.key, p]));
  const pills = ord.keys.flatMap((k) => byKey.get(k) ?? []);
  const going = new Set(room.filter((l) => l.here.length + l.coming.length > 0).map((l) => l.key));
  const pillKey =
    pick.pill && pills.some((p) => p.key === pick.pill)
      ? pick.pill
      : (roomL && pills.find((p) => p.lesson.key === roomL.key && p.lesson.kind === "section")?.key) ?? pills[0]?.key ?? null;
  const pill = pills.find((p) => p.key === pillKey) ?? null;
  const pickRow = (p: Pick) => {
    setPick(p);
    setTicks(null);
  };

  // ---- Who the page offers for that lesson, and who she ticked ----
  const offers: Member[] = pill?.members ?? [];
  const locked = items.some((it) => it.state === "here");
  // The page ticks everyone who can come (no work first); with a lesson going on, only those who need it now.
  const pagePick = offers.filter((m) => !m.hold && (!locked || m.urgent)).map((m) => m.v.s._id as string);
  const chosen = (ticks && ticks.pill === pillKey ? ticks.ids : pagePick).filter((id) => offers.some((m) => m.v.s._id === id)).slice(0, left);
  const toggle = (m: Member) => {
    if (!pillKey) return;
    const id = m.v.s._id as string;
    const on = chosen.includes(id);
    if (!on && chosen.length >= left) {
      toast(left === 0 ? `${LESSON_CAP} with you at most. Done first.` : `Room for ${left} more (${LESSON_CAP} at most). Untick someone first.`, "error");
      return;
    }
    tone("tick");
    setTicks({ pill: pillKey, ids: on ? chosen.filter((x) => x !== id) : [...chosen, id] });
  };
  const call = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    const ok = await callTheory(offers.filter((m) => chosen.includes(m.v.s._id)).map((m) => m.v));
    setBusy(false);
    if (ok) {
      setTicks(null);
      order.current = null; // the ranking catches up at once (her finger is on Call, not on the row)
      follow(); // called: the rows go back to her room
    }
  };

  // ---- Her room: who is with her, on the way, done ----
  const walkers = items.filter((it) => it.state === "walking" || it.state === "called");
  const done = items.filter((it) => tAllDecided(it, dec));
  const file = items.find((it) => it.id === fileId) ?? null;
  const score = scoreOf(board, views, "theory", now);

  // ---- What to teach on her screen: her room's while the rows show her room's book; while she looks at another
  // book to call someone, the picked lesson's (to prepare), never her room's under another book's name ----
  const browsing = !onRoom && roomSqs.length > 0;
  const sqs = onRoom ? roomSqs : items.length === 0 || browsing ? theorySquares([], pill) : [];
  const sq = onRoom ? roomSq : (sqs.find((x) => x.key === at) ?? sqs[0] ?? null);
  const mixed = new Set(sqs.map((x) => x.unit?._id)).size > 1;
  const withHer = sq ? sq.who.filter((it) => it.state === "here") : [];
  const allAre = (d: TDecision) => !!sq && withHer.length > 0 && withHer.every((it) => decOf(dec, it)[String(sq.q)] === d);
  const canDecide = live && withHer.length > 0 && !busy;
  // Before anyone is called: who among those offered needs this question.
  const preview = sq && sq.who.length === 0 ? offers.filter((m) => (sq.q === "whole" ? m.whole : sq.kind === "section" ? m.teach.includes(sq.q) : m.qs.includes(sq.q))) : [];

  /** One tap: for everyone with her who needs it (the same again: undone); then the next question to decide. */
  const choose = (d: TDecision) => {
    if (!sq || !canDecide) return;
    const undo = allAre(d);
    const next: TDecisions = { ...dec };
    for (const it of withHer) next[itemKey(it)] = { ...(next[itemKey(it)] ?? {}), [String(sq.q)]: undo ? undefined : d };
    setDec(next);
    if (undo) return;
    if (d === "t") tone("tick");
    const i = sqs.findIndex((x) => x.key === sq.key);
    const open = (x: TheorySquare) => tUndecided(x, next).length > 0;
    const to = sqs.find((x, j) => j > i && open(x)) ?? sqs.find(open);
    if (!to) return;
    setAt(to.key);
    if (!inBook(to)) follow(); // the next question is another book of her room's: the rows go with it
  };
  /** His own decision on one question (his file): taught → not reached → not decided. */
  const cycle = (it: RoomItem, q: TQ) => {
    const k = itemKey(it);
    const cur = decOf(dec, it)[String(q)];
    const nextD: TDecision | undefined = cur === undefined ? "t" : cur === "t" ? "n" : undefined;
    setDec({ ...dec, [k]: { ...(dec[k] ?? {}), [String(q)]: nextD } });
  };

  /** Send students back (Done). `all`: what she didn't decide = taught; `nothing`: back without the lesson. */
  const finish = async (list: RoomItem[], how: "decided" | "all" | "nothing") => {
    const sts = list.filter((it) => it.state === "here" && it.st);
    if (sts.length === 0) return;
    setBusy(true);
    await flushTaps();
    const out: { callId: Id<"calls">; taught?: number[]; skip?: number[] }[] = [];
    let ok = true;
    for (const it of sts) {
      const callId = it.rc.c._id;
      if (how === "nothing") {
        out.push({ callId, taught: [], skip: [] });
        continue;
      }
      const p = theoryFinish(it, decOf(dec, it), how === "all");
      if (p.kind === "section") out.push({ callId, taught: p.taught, skip: [] });
      else if (p.done.all) out.push({ callId });
      else {
        if (p.done.taught.length) {
          const v = it.st!.v;
          const r = await act(() => mutate(api.workbook.taught, { studentId: v.s._id, unitId: v.unit?._id ?? v.s.unitId, qs: (p.done as { taught: number[] }).taught, on: true, by: currentRole() }));
          if (r === undefined) ok = false;
        }
        out.push({ callId, taught: [] });
      }
    }
    const res = ok ? await act(() => mutate(api.calls.finish, { items: out, by: currentRole() })) : undefined;
    setBusy(false);
    if (!res) return;
    const rest = { ...dec };
    for (const it of sts) delete rest[itemKey(it)];
    setDec(rest);
    setAt(null);
    if (sts.some((it) => it.id === fileId)) setFileId(null);
    order.current = null;
    tone(how === "nothing" ? "tick" : "done");
    const names = joinNames(sts.map((it) => it.name));
    const stay = here.filter((it) => !sts.includes(it)).map((it) => it.name);
    toast(`${how === "nothing" ? `${names}: back to the hall, not taught.` : `Saved: ${names} back to work.`}${stay.length ? ` ${joinNames(stay)} ${stay.length === 1 ? "stays" : "stay"} with you.` : ""}`);
  };

  /** They came in: everyone on the way (Arrived beside her room), or one from his file. */
  const arrive = async (list: RoomItem[]) => {
    if (list.length === 0) return;
    const res = await act(() => mutate(api.calls.arrive, { callIds: list.map((it) => it.rc.c._id), by: currentRole() }));
    if (!res) return;
    for (const s of res.skipped) toast(`${s}.`, "error");
    if (!res.arrived) return;
    tone("tick");
    setAt(null); // the lesson starts: the first open question opens, and the rows show its book
    follow();
    const names = joinNames(list.map((it) => it.name));
    if (list.length === 1) {
      const callId = list[0].rc.c._id;
      toast(`${names} is here.`, "info", () => void act(() => mutate(api.calls.unarrive, { callId, by: currentRole() })));
    } else toast(`${names} are here.`);
  };
  const cancel = async (it: RoomItem) => {
    const r = await act(() => mutate(api.calls.cancel, { callIds: [it.rc.c._id], by: currentRole() }));
    if (!r) return;
    setFileId(null);
    tone("clear");
    toast(it.state === "walking" ? `${it.name} didn't come: back in the hall.` : `The call for ${it.name} is cancelled.`);
  };

  if (inClass.length === 0 && items.length === 0) {
    return (
      <main class="page tp-page tpx-page">
        <NobodyHere />
      </main>
    );
  }

  const long = here.find((it) => it.rc.long);
  const late = items.some((it) => it.late);
  const n = withHer.length;
  const stageWords = stage === "legend" ? "Legend" : stage === "section" ? "Fighter" : "Master";

  return (
    <main class="page tp-page ev-page evx-page tpx-page">
      <div class="stick tp-stick ev-stick" ref={stick}>
        <GradeRow rows={grades} value={grade} onPick={(g) => pickRow({ grade: g })} />
        <KindBar<TheoryStage> value={stage} items={stages} onPick={(s) => pickRow({ grade: grade ?? undefined, stage: s })} />
      </div>

      <div class="tp-body evx-body">
        <div class="evx-rowbox">
          {units.length === 0 ? (
            <p class="tp-none">Nobody needs theory {grade === null ? "now" : `in Grade ${grade} ${stageWords}`}.</p>
          ) : (
            <HRow as="nav" class="evx-units" label="Units that need you, the most urgent first" list={units.map((u) => u.key).join(",")} at={unitKey}>
              {units.map((u) => {
                const on = u.key === unitKey;
                const mine = u.room;
                return (
                  <button
                    key={u.key}
                    type="button"
                    class={`evx-u${on ? " on" : ""}${u.c.red ? " ur" : ""}`}
                    data-u={u.c.red ? "red" : undefined}
                    aria-pressed={on}
                    aria-label={`Unit ${unitNo(u.unit.code)}: ${u.c.total}, ${heatWords(u.c)}${mine ? ", your room" : ""}`}
                    onClick={() => pickRow({ grade: grade ?? undefined, stage, unit: u.key })}
                  >
                    {mine && <span class="evx-me" aria-hidden="true" />}
                    <span class="tp-ln-n">{unitNo(u.unit.code)}</span>
                    <span class="tp-ln-t" lang="ta">
                      {u.unit.ta || u.unit.en}
                    </span>
                    {(u.c.total > 0 || !mine) && <i class="evx-n">{u.c.total}</i>}
                  </button>
                );
              })}
            </HRow>
          )}
        </div>
        {pills.length > 0 && (
          <div class="tpx-lrow" onPointerDownCapture={touch} onScrollCapture={touch}>
            <HRow as="nav" class="evx-qgs" label="Lessons, the most urgent first" list={pills.map((p) => p.key).join(",")} at={pillKey}>
              {pills.map((p) => (
                <LessonPillButton
                  key={p.key}
                  p={p}
                  on={p.key === pillKey}
                  going={going.has(p.lesson.key)}
                  onPick={() => {
                    touch();
                    pickRow({ grade: grade ?? undefined, stage, unit: unitKey ?? undefined, pill: p.key });
                  }}
                />
              ))}
            </HRow>
          </div>
        )}
        <section class="evx-room" aria-label="Your room">
          <div class="evx-box">
            <p class={`evx-bh${long ? " lt-long" : ""}`}>
              {here.length > 0 && <LockIcon />}
              <b>{here.length} with you</b>
              {items.length > here.length && <span class={late ? "t-red strong" : "t-theory strong"}>{items.length - here.length} coming</span>}
              <span>{long ? `Still with you? ${mShort(long.rc.minutes)}` : left === 0 ? `full (${LESSON_CAP})` : `room for ${left}`}</span>
              {offers.length > 0 && (
                <button type="button" class="link-btn evx-reset" onClick={() => setTicks(ticks && ticks.pill === pillKey ? null : { pill: pillKey!, ids: [] })}>
                  {ticks && ticks.pill === pillKey ? "Page's pick" : "Clear"}
                </button>
              )}
            </p>
            <div class="evx-pills" aria-label="Your room and who to call">
              {items.map((it) => (
                <RoomPill
                  key={it.rc.c._id}
                  it={it}
                  dec={dec}
                  now={now}
                  onPick={() => {
                    clearToasts();
                    setFileId(it.id);
                  }}
                />
              ))}
              {offers.map((m) => {
                const on = chosen.includes(m.v.s._id);
                return (
                  <button
                    key={m.v.key}
                    type="button"
                    class={`evx-sp s-sug sg-${m.hold ? "yellow" : m.urgency === "red" ? "red" : m.urgency === "amber" ? "orange" : "yellow"}${on ? " on" : ""}${m.hold ? " s-hold" : ""}`}
                    data-name={m.v.s.name}
                    aria-pressed={on}
                    aria-label={`${m.v.s.name}: ${memberWords(m)}`}
                    onClick={() => toggle(m)}
                  >
                    {m.v.s.name}
                    {m.hold && <small>{m.hold === "home" ? "home" : "Eval"}</small>}
                  </button>
                );
              })}
              {items.length === 0 && offers.length === 0 && <p class="evx-none">Nobody to call now.</p>}
            </div>
          </div>
          <div class="evx-col">
            <button type="button" class="btn theory evx-call" disabled={busy || chosen.length === 0} onClick={() => void call()}>
              {left === 0 ? "Full" : chosen.length ? `Call ${chosen.length}` : "Call"}
            </button>
            <button type="button" class="btn evx-arrive" disabled={busy || walkers.length === 0} onClick={() => void arrive(walkers)}>
              Arrived{walkers.length ? ` ${walkers.length}` : ""}
            </button>
            <button type="button" class="btn evx-done" disabled={busy || done.length === 0} onClick={() => void finish(done, "decided")}>
              Done{done.length ? ` ${done.length}` : ""}
            </button>
          </div>
        </section>

        {sqs.length > 0 ? (
          <HRow as="ol" class="fc-strip evx-strip" label="What to teach" list={sqs.map((x) => x.key).join(",")} at={sq?.key}>
            {sqs.map((x) => {
              const st = squareOf(x, dec);
              return (
                <li key={x.key}>
                  <button
                    type="button"
                    class={`fc-sq${st.cls}${x.key === sq?.key ? " on" : ""}`}
                    aria-current={x.key === sq?.key ? "step" : undefined}
                    aria-label={`${x.q === "whole" ? "The whole unit" : `Q${x.q}`}: ${x.who.length ? `${x.who.length} ${x.who.some((it) => it.state === "here") ? "with you" : "on the way"}` : "to prepare"}${st.words ? `, ${st.words}` : ""}`}
                    onClick={() => {
                      setAt(x.key);
                      if (onRoom && !inBook(x)) follow(); // another book of her room's: the rows go with it
                    }}
                  >
                    <small>
                      {mixed && x.unit ? `${unitNo(x.unit.code)}·` : ""}
                      {x.kind === "section" && x.section ? `${x.section.id}·` : ""}
                      {qShort(x.q)}
                    </small>
                    <b>{st.sign || (x.who.length > 1 ? `×${x.who.length}` : "")}</b>
                  </button>
                </li>
              );
            })}
          </HRow>
        ) : (
          <p class="muted small evx-hint">
            {browsing ? (
              <>
                Not your room's book. <BackToRoom onBack={follow} />
              </>
            ) : items.length ? (
              "Nothing left to teach to your room: Done sends them back."
            ) : (
              "Pick a lesson above, then Call: what to teach opens here, one at a time."
            )}
          </p>
        )}

        {sq && (
          <section class="fc-card evx-card tpx-card" key={sq.key} aria-label={`${sq.q === "whole" ? "The whole unit" : `Q${sq.q}`}: what to teach`}>
            <div class="fc-q">
              <span class={`fc-qn${sq.q === "whole" ? " evx-yr" : ""}`}>
                {sq.q === "whole" ? (
                  "All"
                ) : (
                  <>
                    <small>Q</small>
                    {sq.q}
                  </>
                )}
              </span>
              <div class="fc-ans">
                <p class="tpx-what">
                  {sq.kind === "section" && sq.section ? (
                    <>
                      <b>{sq.section.id}</b> <span lang="ta">{sq.section.tamil}</span>
                    </>
                  ) : sq.q === "whole" ? (
                    "The whole unit again"
                  ) : (
                    <>
                      Unit {sq.unit ? unitNo(sq.unit.code) : "?"} <span lang="ta">{sq.unit?.ta}</span>
                    </>
                  )}
                </p>
                <p class="evx-who">
                  {sq.who.length === 0
                    ? preview.length
                      ? preview.map((m) => (
                          <span key={m.v.key}>
                            {m.v.s.name} <small>{sq.kind === "workbook" ? qWords(m.v, sq.q, now) || memberWords(m) : memberWords(m)}</small>
                          </span>
                        ))
                      : "Nobody to teach it to yet."
                    : sq.who.map((it) => {
                        const d = decOf(dec, it)[String(sq.q)];
                        const v = it.st?.v ?? it.rc.v;
                        return (
                          <span key={it.rc.c._id} class={d ? `d d-${d === "t" ? "x" : "skip"}` : ""}>
                            {it.name} <small>{it.state !== "here" ? roomWords(it, now) : v && sq.kind === "workbook" ? qWords(v, sq.q, now) : ""}</small>
                          </span>
                        );
                      })}
                </p>
                {sq.kind === "workbook" && typeof sq.q === "number" && sq.unit ? (
                  <AnswerKey unitId={sq.unit._id} q={sq.q} />
                ) : sq.kind === "section" ? (
                  <>
                    <p class="muted small">The teacher's question of his book: teach it, then the next.</p>
                    {typeof sq.q === "number" && sq.unit && !!bookDocAt(sq.unit._id, "fighter")?.keyCount && (
                      <AnswerKey unitId={sq.unit._id} q={sq.q} stage="fighter" />
                    )}
                  </>
                ) : null}
                {typeof sq.q === "number" && sq.unit && (
                  <QuestionToggle unitId={sq.unit._id} stage={sq.kind === "section" ? "fighter" : "master"} q={sq.q} />
                )}
                {(!live || sq.who.length === 0) && (
                  <p class="muted small">
                    {sq.who.length > 0 ? "Tap Arrived when they come in." : "Call them, then Arrived when they come in."}
                    {browsing && (
                      <>
                        {" "}
                        <BackToRoom onBack={follow} />
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        <div class="fc-pad evx-pad tpx-pad">
          <div class="fc-row2">
            <button type="button" class={`fc-n evx-b skip${allAre("n") ? " on" : ""}`} disabled={!canDecide} aria-pressed={allAre("n")} onClick={() => choose("n")}>
              <small>Not reached</small>
            </button>
          </div>
          <button type="button" class={`fc-go evx-x${allAre("t") ? " on" : ""}`} disabled={!canDecide} aria-pressed={allAre("t")} onClick={() => choose("t")}>
            <span aria-hidden="true">✓</span>
            <b>Taught</b>
            {n > 1 && <small>for {n}</small>}
          </button>
        </div>
      </div>

      <div class="evx-foot">
        {here.length > 0 && (
          <button type="button" class="link-btn tf-back tpx-all-back" disabled={busy} onClick={() => void finish(here, "nothing")}>
            Send everyone back: nothing taught
          </button>
        )}
        <TodayStrip s={score} room="theory" inClass={inClass.length} compact />
      </div>

      {file && (
        <TheoryFileSheet
          it={file}
          now={now}
          busy={busy}
          dec={decOf(dec, file)}
          onClose={() => setFileId(null)}
          onCycle={(q) => cycle(file, q)}
          onArrive={() => void arrive([file])}
          onCancel={() => void cancel(file)}
          onFinish={(how) => void finish([file], how)}
        />
      )}
    </main>
  );
}

/** A lesson in the row: a section (its letter and Tamil title), or a workbook's questions (or the whole unit), and how many need it. */
function LessonPillButton(props: { p: LessonPill; on: boolean; going: boolean; onPick: () => void }) {
  const { p, on } = props;
  const l = p.lesson;
  const section = l.kind === "section";
  return (
    <button
      type="button"
      class={`evx-qg qg-${p.heat}${section ? " tpx-sec" : ""}${on ? " on" : ""}${props.going ? " qg-going" : ""}`}
      data-u={p.heat === "red" ? "red" : p.heat === "orange" ? "amber" : undefined}
      data-lesson={section ? `${l.unit?.code ?? "?"} ${l.section?.id ?? "?"}` : `${l.unit?.code ?? "?"} ${p.label}`}
      aria-pressed={on}
      aria-label={`${section ? `Section ${p.label}: ${l.section?.title ?? ""}` : p.whole ? "The whole unit again" : `Questions ${p.label}`}: ${joinNames(p.members.map((m) => m.v.s.name))}${props.going ? ". Going on in your room" : ""}`}
      onClick={props.onPick}
    >
      <b>{p.label}</b>
      {section && l.section && (
        <span class="tp-ln-t" lang="ta">
          {l.section.tamil}
        </span>
      )}
      <i>{section ? p.members.length : `×${p.members.length}`}</i>
    </button>
  );
}

/** A question's square: what was decided for the students with her (all of them, or some). */
function squareOf(x: TheorySquare, dec: TDecisions): { cls: string; sign: string; words: string } {
  const ds = x.who.filter((it) => it.state === "here").map((it) => decOf(dec, it)[String(x.q)]);
  if (ds.length === 0 || ds.every((d) => d === undefined)) return { cls: "", sign: "", words: "" };
  if (ds.some((d) => d === undefined)) return { cls: " part", sign: "", words: "some done" };
  if (ds.every((d) => d === "t")) return { cls: " dk", sign: "✓", words: "taught" };
  if (ds.every((d) => d === "n")) return { cls: " was", sign: "–", words: "not reached" };
  return { cls: " part", sign: "✓", words: "decided" };
}

/** Someone she called: solid with her (✓ when all his questions are decided), dashed on the way, dotted called, red late. */
function RoomPill(props: { it: RoomItem; dec: TDecisions; now: number; onPick: () => void }) {
  const { it } = props;
  const finished = tAllDecided(it, props.dec);
  const cls = it.state === "here" ? (finished ? "s-done" : "s-in") : it.state === "walking" ? "s-walk" : it.state === "eval" ? "s-ev" : "s-call";
  const small = it.state === "walking" ? sinceWords(it.rc.walkMs).trim() : it.state === "eval" ? "Eval" : "";
  return (
    <button
      type="button"
      class={`evx-sp ${cls}${it.late ? " s-late" : ""}`}
      data-u={it.late ? "red" : undefined}
      data-name={it.name}
      aria-label={`${it.name}: ${roomWords(it, props.now)}${finished ? ", all done" : ""}`}
      onClick={props.onPick}
    >
      {finished && <span aria-hidden="true">✓ </span>}
      {it.name}
      {small && <small>{small}</small>}
    </button>
  );
}

const DEC_WORDS: Record<TDecision, string> = { t: "taught", n: "not reached" };

/**
 * One student she called, like a doctor's file: where he is (Arrived), his lesson, what to teach him (tap one: taught,
 * not reached, not decided), his unit and his day; Done for him, send him back without it, or cancel the call.
 */
function TheoryFileSheet(props: {
  it: RoomItem;
  now: number;
  busy: boolean;
  dec: Record<string, TDecision | undefined>;
  onClose: () => void;
  onCycle: (q: TQ) => void;
  onArrive: () => void;
  onCancel: () => void;
  onFinish: (how: "decided" | "all" | "nothing") => void;
}) {
  const { it, dec, now } = props;
  const v = it.st?.v ?? it.rc.v;
  const l = it.lesson;
  const isHere = it.state === "here";
  const qs = needsOf(it);
  const decided = qs.filter((q) => dec[String(q)] !== undefined).length;
  const main = v ? (v.home ?? v) : undefined;
  const also = main ? main.others.filter((o) => o.key !== v?.key && o.unit).map((o) => unitNo(o.unit!.code)) : [];
  const home = v?.s.lastInAt !== undefined ? v.s.lastInAt + STAY_MS : undefined;
  const foot = isHere ? (
    <div class="row-actions evx-file-acts">
      <button type="button" class="btn ghost" disabled={props.busy} onClick={() => props.onFinish("nothing")}>
        Not taught
      </button>
      <button type="button" class="btn theory" disabled={props.busy} onClick={() => props.onFinish(decided > 0 ? "decided" : "all")}>
        {decided > 0 || qs.length === 0 ? "Done: back to work" : "All taught"}
      </button>
    </div>
  ) : (
    <div class="row-actions evx-file-acts">
      <button type="button" class="btn ghost" disabled={props.busy} onClick={props.onCancel}>
        {it.state === "walking" ? "Not coming" : "Cancel the call"}
      </button>
      <button type="button" class="btn tp-arrive" disabled={props.busy || it.state === "eval"} onClick={props.onArrive}>
        {it.state === "eval" ? "In Evaluation first" : "Arrived"}
      </button>
    </div>
  );
  return (
    <Sheet title={it.name} sub={roomWords(it, now)} onClose={props.onClose} foot={foot} cls="evx-file">
      <p class="tp-fl">
        <LessonName unit={l.unit} section={l.section} kind={l.kind} />
      </p>
      {qs.length === 0 ? (
        <p class="ev-teaching muted">Nothing left to teach him here.</p>
      ) : (
        <>
          <div class="ev-strip" role="group" aria-label={`${it.name}'s questions`}>
            {qs.map((q) => {
              const d = dec[String(q)];
              return (
                <button
                  key={String(q)}
                  type="button"
                  class={`ev-sq tq${d ? ` d-${d}` : ""}`}
                  disabled={!isHere}
                  aria-label={`${it.name} ${q === "whole" ? "the whole unit" : `Q${q}`}${d ? `: ${DEC_WORDS[d]}` : ""}`}
                  onClick={() => props.onCycle(q)}
                >
                  {q === "whole" ? "Whole unit" : `Q${q}`}
                </button>
              );
            })}
          </div>
          <p class="ev-h-sum">
            {decided > 0 ? tDecisionWords(it, dec) : isHere ? `${qs.length} to teach: the squares on the page, or tap one here (taught, not reached).` : `${qs.length} to teach.`}
          </p>
          {l.kind === "workbook" && v && (
            <ul class="tpx-fq" aria-label={`${it.name}'s questions for Theory`}>
              {qs
                .filter((q): q is number => q !== "whole")
                .map((q) => (
                  <li key={q}>
                    <b>Q{q}</b> {qWords(v, q, now)}
                    {v.mm.q[String(q)]?.x ? <small> · explained {slClock(v.mm.q[String(q)]!.x!)}</small> : null}
                  </li>
                ))}
            </ul>
          )}
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
    </Sheet>
  );
}
