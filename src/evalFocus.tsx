// The Evaluation page: one screen (31 Oct 2026, his voice note; rules in src/evalFocusData.ts). Like Correction:
// small things in fixed places, and the buttons she taps fast at the bottom.
// - Pinned: Theory's notes (it took your student first, or wants him now); grades 6–11, Fighter / Master / Legend,
//   the units that need her (number + Tamil), and the questions the same students got wrong ("13 · 17"). Each row the
//   most urgent first and already picked; she can pick anything. With someone in her room the rows show the book of
//   the question on her screen, marked with a dot, even when nobody else waits for it (src/roomRows.ts).
// - Her room: a box of student pills (two rows, 6 at most): with her (solid; a lock on the box), on the way (dashed),
//   called (dotted), late (red); then the ones the page picked for those questions (ticked; tap = untick: grey). Right
//   of it, always in the same places: Call, Arrived, Done. Tap someone in her room: his file.
// - The questions to explain as tiny squares (like Correction), one at a time with the answer; at the bottom, fixed:
//   → Theory, Not now and the big Explained: one tap counts for everyone with her who has that question.
// - Theory is busy: "Teach" at the end of the questions row. Today's score and who went home with levels to correct
//   at the end. Red circles / → Theory without calling, a student's book and Move: the Class page.

import { useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { slClock } from "../convex/lib/day";
import { joinNames } from "./announce";
import { mutate } from "./backend";
import { GoneHome, NobodyHere } from "./board";
import { heatWords, TodayStrip } from "./deck";
import type { View } from "./derive";
import {
  allDecided,
  bookKey,
  canTeachHere,
  candidates,
  decisionWords,
  EVAL_CAP,
  evalItems,
  evalRoom,
  evalRows,
  evalWords,
  finishPlan,
  lostWords,
  nextBooks,
  qGroups,
  qLabel,
  sessionQs,
  undecided,
  type Decision,
  type EvalHere,
  type EvalItem,
  type EvalStage,
  type SessionQ,
} from "./evalFocusData";
import { unitNo } from "./focusData";
import { HRow } from "./hrow";
import { MasterStrip } from "./master";
import { AnswerKey, BackToRoom, GradeRow, KindBar, LockIcon, usePinned } from "./roomkit";
import { QuestionToggle } from "./bookQuestion";
import { scoreOf } from "./score";
import { act, clearToasts, currentMe, currentRole, toast, type Board } from "./store";
import { flushTaps } from "./taps";
import { LessonName } from "./roomkit";
import { classPace, mShort, sinceWords, STAY_MS, type Heat } from "./theoryFocusData";
import { tone } from "./tones";
import { Sheet } from "./ui";

type Decisions = Record<string, Record<number, Decision | undefined>>;
/** What she picked in the rows (anything left out: the page's pick, the most urgent). */
type Pick = { grade?: number; stage?: EvalStage; unit?: string; group?: string };
/** The questions row's last pill when Theory is busy: she teaches theory herself. */
const TEACH = "teach";
/** Someone the page offers for the picked questions (or to teach): ticked = called with Call. */
type Offer = { key: string; v: View; heat: Heat; why: string; work: string };

/**
 * Call students to her room: to explain, or (Theory busy) to teach theory herself. Correction sends them (and says
 * her name). Each is called for one book: he works on several at once.
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
/** "13", "C3", "2016": a question in a square or a pill (the Q goes, the book's own label stays). */
const short = (v: View, q: number) => qLabel(v, q).replace(/^Q/, "");

export function EvaluationPage(props: { board: Board; views: View[]; now: number }) {
  const { board, now } = props;
  const all = props.views;
  const inClass = all.filter((v) => v.where !== "absent");
  // Her own room (31 Oct 2026): another Evaluation teacher's students are hers.
  const me = currentMe()?._id ?? null;
  const room = evalRoom(board, all, now, me);
  const items = evalItems(board, all, now, me);
  const left = Math.max(0, EVAL_CAP - items.length);
  const [pick, setPick] = useState<Pick>({});
  const [ticks, setTicks] = useState<{ group: string; keys: string[] } | null>(null);
  const [dec, setDec] = useState<Decisions>({});
  const [at, setAt] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The pinned rows' height (the page ends where the pad sticks); toasts sit above the pad.
  const stick = usePinned("evx");
  useEffect(() => {
    document.body.classList.add("evx-on");
    return () => document.body.classList.remove("evx-on");
  }, []);

  // ---- Her room's questions: each once for everyone with her who has it (nobody with her yet: those on the way) ----
  const walkers = items.filter((it) => it.state !== "here");
  const evalHere = room.here.filter((h) => h.kind === "evaluation");
  const live = evalHere.length > 0;
  const roomQs = sessionQs(
    evalHere,
    walkers.map((it) => it.h),
  );
  // (A student being taught theory here has no questions: with only him, the rows are as if her room were empty.)
  const atRoom = roomQs.find((x) => x.key === at);
  /** The question that opens by itself: the first one somebody with her still needs decided (else the first). */
  const firstOpen = (list: SessionQ[]) => (live ? list.find((x) => undecided(x, dec).length > 0) : undefined) ?? list[0];

  // ---- The rows: always the book of the question on her screen (his screenshot, 31 Oct 2026: src/roomRows.ts) ----
  const everyone = candidates(all, now, classPace(all));
  const rows = evalRows(pick, everyone, roomQs, atRoom ?? firstOpen(roomQs));
  const { grades, grade, stages, stage, units } = rows;
  const unitKey = rows.unit;
  const unit = units.find((u) => u.key === unitKey) ?? null;
  const groups = unit ? qGroups(unit.cands) : [];
  /** Back to her room: her pick ends, the rows show her room's book again (else the most urgent). */
  const follow = () => setPick((p) => (Object.keys(p).length ? {} : p));
  // Theory is busy and someone has no work until he gets theory: she can teach it (any grade: he has nothing for her).
  const teach = inClass.filter((v) => canTeachHere(board, v));
  const groupKey =
    pick.group && (groups.some((g) => g.key === pick.group) || (pick.group === TEACH && teach.length > 0))
      ? pick.group
      : (groups[0]?.key ?? (teach.length ? TEACH : null));
  const group = groups.find((g) => g.key === groupKey) ?? null;

  // ---- Who the page offers for those questions (or to teach), and who she ticked ----
  const offers: Offer[] =
    groupKey === TEACH
      ? teach.map((v) => ({ key: v.key, v, heat: "red", why: v.st?.nextTheory ? `section ${v.st.nextTheory}` : "his workbook", work: "" }))
      : (group?.cands ?? []).map((c) => ({ key: c.v.key, v: c.v, heat: c.heat, why: c.why, work: c.work }));
  // The page ticks who is ready (no work, stuck, waited 10 min), as many as fit; "later" ones she ticks herself.
  const pagePick = offers.filter((o) => groupKey === TEACH || o.heat !== "yellow").map((o) => o.key);
  const chosen = (ticks && ticks.group === groupKey ? ticks.keys : pagePick).filter((k) => offers.some((o) => o.key === k)).slice(0, left);
  const toggle = (o: Offer) => {
    if (!groupKey) return;
    const on = chosen.includes(o.key);
    if (!on && chosen.length >= left) {
      toast(left === 0 ? `${EVAL_CAP} with you at most. Send someone back first.` : `Room for ${left} more (${EVAL_CAP} at most). Untick someone first.`, "error");
      return;
    }
    tone("tick");
    setTicks({ group: groupKey, keys: on ? chosen.filter((k) => k !== o.key) : [...chosen, o.key] });
  };
  const pickRow = (p: Pick) => {
    setPick(p);
    setTicks(null);
  };

  // ---- Her room: who is with her, on the way, done ----
  const done = room.here.filter((h) => !h.v.pulled && allDecided(h, dec));
  const byId = new Map(all.map((v) => [v.s._id as string, v]));
  const bumped = board.calls.filter(
    (c) => c.room === "theory" && c.bumped && (!c.bumpedFrom || c.bumpedFrom === me) && byId.get(c.studentId)?.where !== "absent",
  );
  const pulls = room.here.filter((h) => h.v.pulled);
  const score = scoreOf(board, all, "evaluation", now);
  const file = items.find((it) => it.id === fileId) ?? null;

  // ---- The questions on her screen: her room's while the rows show her room's book (the open one in that book);
  // while she looks at another book to call someone, that book's picked questions (to prepare), never her room's ----
  const onRoom = rows.onRoom;
  const browsing = !onRoom && roomQs.length > 0;
  const picked = !onRoom && (items.length === 0 || browsing) && group ? sessionQs([], [], { v: group.cands[0].v, qs: group.qs }) : [];
  const qs = onRoom ? roomQs : picked;
  const inBook = (x: SessionQ) => bookKey(x.v) === unitKey;
  const sq = onRoom ? ((atRoom && inBook(atRoom) ? atRoom : firstOpen(roomQs.filter(inBook))) ?? null) : (qs.find((x) => x.key === at) ?? qs[0] ?? null);
  const mixed = new Set(qs.map((x) => x.v.unit?._id)).size > 1;
  const allAre = (d: Decision) => !!sq && sq.who.length > 0 && sq.who.every((h) => (dec[h.v.key] ?? {})[sq.q] === d);
  const canDecide = live && !!sq && sq.who.length > 0 && !busy;
  // Before anyone is called: who among those offered has the question on screen.
  const preview = sq && sq.who.length === 0 ? offers.filter((o) => o.v.pending.includes(sq.q) && o.v.unit?._id === sq.v.unit?._id).map((o) => o.v) : [];

  /** One tap: for everyone with her who has this question (tap the same again: undone); then the next question. */
  const choose = (d: Decision) => {
    if (!sq || !canDecide) return;
    const undo = allAre(d);
    const next: Decisions = { ...dec };
    for (const h of sq.who) next[h.v.key] = { ...(next[h.v.key] ?? {}), [sq.q]: undo ? undefined : d };
    setDec(next);
    if (undo) return;
    if (d === "x") tone("tick");
    const i = qs.findIndex((x) => x.key === sq.key);
    const open = (x: SessionQ) => undecided(x, next).length > 0;
    const to = qs.find((x, j) => j > i && open(x)) ?? qs.find(open);
    if (!to) return;
    setAt(to.key);
    if (!inBook(to)) follow(); // the next question is another book of her room's: the rows go with it
  };

  /** Send students back (Done), or to Theory when Theory wants him now. `all`: what she didn't decide = explained. */
  const finish = async (hs: EvalHere[], how: "decided" | "all" | "nothing") => {
    if (hs.length === 0) return;
    setBusy(true);
    await flushTaps();
    let ok = true;
    const out: { callId: Id<"calls">; explained?: number[]; reteach?: string; taught?: number[]; skip?: number[] }[] = [];
    for (const h of hs) {
      if (h.kind === "theory") {
        out.push(how === "nothing" ? { callId: h.rc.c._id, taught: [], skip: [] } : { callId: h.rc.c._id });
        continue;
      }
      const p = how === "nothing" ? { explained: [] as number[], theoryQs: [] as number[], reteach: undefined } : finishPlan(h, dec[h.v.key] ?? {}, how === "all");
      if (p.theoryQs.length) {
        ok =
          ok &&
          !!(await act(() =>
            mutate(api.workbook.toTheory, { studentId: h.v.s._id, unitId: h.v.unit?._id ?? h.v.s.unitId, qs: p.theoryQs, on: true, by: currentRole() }),
          ));
      }
      out.push({ callId: h.rc.c._id, explained: p.explained, ...(p.reteach ? { reteach: p.reteach } : {}) });
    }
    const res = ok ? await act(() => mutate(api.calls.finish, { items: out, by: currentRole() })) : undefined;
    setBusy(false);
    if (!res) return;
    const rest = { ...dec };
    for (const h of hs) delete rest[h.v.key];
    setDec(rest);
    setAt(null);
    if (hs.some((h) => h.v.s._id === fileId)) setFileId(null);
    tone(how === "nothing" ? "tick" : "done");
    const names = joinNames(hs.map((h) => h.v.s.name));
    toast(hs.length === 1 && hs[0].v.pulled ? `${names} goes to Theory now.` : how === "nothing" ? `${names} back to work.` : `Saved: ${names} back to work.`);
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
    setFileId(null);
    follow(); // his next book: the rows show it
    tone("done");
    toast(`Saved: ${h.v.s.name} stays for ${unitWords(next)} (${next.pending.length} to explain).`);
  };

  /** They came in: everyone on the way (Arrived at the right), or one from his file. */
  const arrive = async (list: EvalItem[]) => {
    if (list.length === 0) return;
    const res = await act(() => mutate(api.calls.arrive, { callIds: list.map((it) => it.h.rc.c._id), by: currentRole() }));
    if (!res) return;
    for (const s of res.skipped) toast(`${s}.`, "error");
    if (!res.arrived) return;
    tone("tick");
    setAt(null); // they are here: the first open question opens, and the rows show its book
    follow();
    const names = joinNames(list.map((it) => it.name));
    if (list.length === 1) {
      const callId = list[0].h.rc.c._id;
      toast(`${names} is here.`, "info", () => void act(() => mutate(api.calls.unarrive, { callId, by: currentRole() })));
    } else toast(`${names} are here.`);
  };
  const cancel = async (it: EvalItem) => {
    const r = await act(() => mutate(api.calls.cancel, { callIds: [it.h.rc.c._id], by: currentRole() }));
    if (!r) return;
    setFileId(null);
    tone("clear");
    toast(it.state === "walking" ? `${it.name} didn't come: back in the hall.` : `The call for ${it.name} is cancelled.`);
  };

  if (inClass.length === 0 && room.here.length === 0) {
    return (
      <main class="page ev-page evx-page">
        <NobodyHere />
        <GoneHome role="evaluation" views={all} now={now} />
      </main>
    );
  }

  const label = groupKey === TEACH ? "Teach" : "Call";
  const long = room.here.find((h) => h.rc.long);
  const late = items.some((it) => it.late);
  const n = sq?.who.length ?? 0;
  const theoryOk = !!sq && (!!sq.v.f || !!sq.v.ms);

  return (
    <main class="page ev-page evx-page">
      <div class="stick tp-stick ev-stick" ref={stick}>
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
            <button type="button" class="btn small" disabled={busy} onClick={() => void finish([h], "decided")}>
              Send to Theory
            </button>
          </div>
        ))}
        <GradeRow rows={grades} value={grade} onPick={(g) => pickRow({ grade: g })} />
        <KindBar<EvalStage> value={stage} items={stages} onPick={(s) => pickRow({ grade: grade ?? undefined, stage: s })} />
      </div>

      <div class="tp-body evx-body">
        <div class="evx-rowbox">
          {units.length === 0 ? (
            <p class="tp-none">Nothing to explain {grade === null ? "now" : `in Grade ${grade} ${stage === "legend" ? "Legend" : stage === "fighter" ? "Fighter" : "Master"}`}.</p>
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
        {(groups.length > 0 || teach.length > 0) && (
          <HRow as="nav" class="evx-qgs" label="Questions the same students got wrong, the most urgent first" list={groups.map((g) => g.key).join(",")} at={groupKey}>
            {groups.map((g) => {
              const on = g.key === groupKey;
              const v = g.cands[0].v;
              const words = g.qs.length > 4 ? [...g.qs.slice(0, 3).map((q) => short(v, q)), `+${g.qs.length - 3}`] : g.qs.map((q) => short(v, q));
              return (
                <button
                  key={g.key}
                  type="button"
                  class={`evx-qg qg-${g.heat}${on ? " on" : ""}`}
                  data-u={g.heat === "red" ? "red" : g.heat === "orange" ? "amber" : undefined}
                  aria-pressed={on}
                  aria-label={`${g.qs.map((q) => qLabel(v, q)).join(", ")}: ${joinNames(g.cands.map((c) => c.v.s.name))}`}
                  onClick={() => pickRow({ grade: grade ?? undefined, stage, unit: unitKey ?? undefined, group: g.key })}
                >
                  <b>{words.join(" · ")}</b>
                  <i>×{g.cands.length}</i>
                </button>
              );
            })}
            {teach.length > 0 && (
              <button
                key={TEACH}
                type="button"
                class={`evx-qg evx-teach${groupKey === TEACH ? " on" : ""}`}
                aria-pressed={groupKey === TEACH}
                aria-label={`Theory is busy: teach ${joinNames(teach.map((v) => v.s.name))} yourself`}
                onClick={() => pickRow({ grade: grade ?? undefined, stage, unit: unitKey ?? undefined, group: TEACH })}
              >
                <b>◎ Teach</b>
                <i>{teach.length}</i>
              </button>
            )}
          </HRow>
        )}
        <section class="evx-room" aria-label="Your room">
          <div class="evx-box">
            <p class={`evx-bh${long ? " lt-long" : ""}`}>
              {room.here.length > 0 && <LockIcon />}
              <b>{room.here.length} with you</b>
              {walkers.length > 0 && <span class={late ? "t-red strong" : "t-evaluation strong"}>{walkers.length} coming</span>}
              <span>{long ? `Still with you? ${mShort(long.rc.minutes)}` : left === 0 ? `full (${EVAL_CAP})` : `room for ${left}`}</span>
              {offers.length > 0 && (
                <button type="button" class="link-btn evx-reset" onClick={() => setTicks(ticks && ticks.group === groupKey ? null : { group: groupKey!, keys: [] })}>
                  {ticks && ticks.group === groupKey ? "Page's pick" : "Clear"}
                </button>
              )}
            </p>
            <div class="evx-pills" aria-label="Your room and who to call">
              {items.map((it) => (
                <RoomPill
                  key={it.h.rc.c._id}
                  it={it}
                  dec={dec}
                  now={now}
                  onPick={() => {
                    clearToasts();
                    setFileId(it.id);
                  }}
                />
              ))}
              {offers.map((o) => {
                const on = chosen.includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    class={`evx-sp s-sug sg-${o.heat}${on ? " on" : ""}`}
                    data-name={o.v.s.name}
                    aria-pressed={on}
                    aria-label={`${o.v.s.name}: ${o.why}${o.work ? `, ${o.work}` : ""}`}
                    onClick={() => toggle(o)}
                  >
                    {o.v.s.name}
                  </button>
                );
              })}
              {items.length === 0 && offers.length === 0 && <p class="evx-none">Nobody to call now.</p>}
            </div>
          </div>
          <div class="evx-col">
            <button
              type="button"
              class="btn evaluation evx-call"
              disabled={busy || chosen.length === 0}
              onClick={async () => {
                setBusy(true);
                const who = offers.filter((o) => chosen.includes(o.key)).map((o) => o.v);
                if (await callEval(who, groupKey === TEACH ? "theory" : "evaluation")) {
                  setTicks(null);
                  follow(); // called: the rows go back to her room
                }
                setBusy(false);
              }}
            >
              {left === 0 ? "Full" : chosen.length ? `${label} ${chosen.length}` : label}
            </button>
            <button type="button" class="btn evx-arrive" disabled={busy || walkers.length === 0} onClick={() => void arrive(walkers)}>
              Arrived{walkers.length ? ` ${walkers.length}` : ""}
            </button>
            <button type="button" class="btn evx-done" disabled={busy || done.length === 0} onClick={() => void finish(done, "decided")}>
              Done{done.length ? ` ${done.length}` : ""}
            </button>
          </div>
        </section>

        {qs.length > 0 ? (
          <HRow as="ol" class="fc-strip evx-strip" label="The questions to explain" list={qs.map((x) => x.key).join(",")} at={sq?.key}>
            {qs.map((x) => {
              const st = squareOf(x, dec);
              return (
                <li key={x.key}>
                  <button
                    type="button"
                    class={`fc-sq${st.cls}${x.key === sq?.key ? " on" : ""}`}
                    aria-current={x.key === sq?.key ? "step" : undefined}
                    aria-label={`${qLabel(x.v, x.q)}: ${x.who.length ? `${x.who.length} with you` : "to prepare"}${st.words ? `, ${st.words}` : ""}`}
                    onClick={() => {
                      setAt(x.key);
                      if (onRoom && !inBook(x)) follow(); // another book of her room's: the rows go with it
                    }}
                  >
                    <small>
                      {mixed && x.v.unit ? `${unitNo(x.v.unit.code)}·` : ""}
                      {short(x.v, x.q)}
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
            ) : room.here.some((h) => h.kind === "theory") ? (
              "Teaching theory: tap his name, then Done: taught."
            ) : items.length ? (
              "Nothing left to explain to your room: Done sends them back."
            ) : (
              "Pick the questions above, then Call: they open here, one at a time."
            )}
          </p>
        )}

        {sq && (
          <section class="fc-card evx-card" key={sq.key} aria-label={`${qLabel(sq.v, sq.q)} and its answer`}>
            <div class="fc-q">
              <span class={`fc-qn${/^Q\d+$/.test(qLabel(sq.v, sq.q)) ? "" : " evx-yr"}`}>
                {/^Q\d+$/.test(qLabel(sq.v, sq.q)) ? (
                  <>
                    <small>Q</small>
                    {sq.q}
                  </>
                ) : (
                  qLabel(sq.v, sq.q)
                )}
              </span>
              <div class="fc-ans">
                <p class="evx-who">
                  {sq.who.length === 0
                    ? preview.length
                      ? preview.map((v) => (
                          <span key={v.key}>
                            {v.s.name} <small>{lostWords(v, sq.q)}</small>
                          </span>
                        ))
                      : "Nobody with you has it."
                    : sq.who.map((h) => {
                        const d = (dec[h.v.key] ?? {})[sq.q];
                        return (
                          <span key={h.v.key} class={d ? `d d-${d}` : ""}>
                            {h.v.s.name} <small>{lostWords(h.v, sq.q)}</small>
                          </span>
                        );
                      })}
                </p>
                {sq.v.unit ? (
                  <AnswerKey unitId={sq.v.unit._id} q={sq.q} stage={sq.v.ms ? "master" : "fighter"} />
                ) : (
                  <p class="muted small">Check his answer in his notebook.</p>
                )}
                <QuestionToggle unitId={sq.v.unit?._id} stage={sq.v.ms ? "master" : "fighter"} q={sq.q} />
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

        <div class="fc-pad evx-pad">
          <div class="fc-row2">
            <button
              type="button"
              class={`fc-n evx-b th${allAre("th") ? " on" : ""}`}
              disabled={!canDecide || !theoryOk}
              aria-pressed={allAre("th")}
              onClick={() => choose("th")}
            >
              <b aria-hidden="true">→</b>
              <small>Theory</small>
            </button>
            <button type="button" class={`fc-n evx-b skip${allAre("skip") ? " on" : ""}`} disabled={!canDecide} aria-pressed={allAre("skip")} onClick={() => choose("skip")}>
              <small>Not now</small>
            </button>
          </div>
          <button type="button" class={`fc-go evx-x${allAre("x") ? " on" : ""}`} disabled={!canDecide} aria-pressed={allAre("x")} onClick={() => choose("x")}>
            <span aria-hidden="true">✓</span>
            <b>Explained</b>
            {n > 1 && <small>for {n}</small>}
          </button>
        </div>
      </div>

      <div class="evx-foot">
        <TodayStrip s={score} room="evaluation" inClass={inClass.length} compact />
        <GoneHome role="evaluation" views={all} now={now} />
      </div>

      {file && (
        <EvalFileSheet
          it={file}
          now={now}
          busy={busy}
          dec={dec[file.h.v.key] ?? {}}
          next={file.state === "here" && file.h.kind === "evaluation" && !file.h.v.pulled ? nextBooks(file.h.v)[0] : undefined}
          canKeep={left > 0 || !everyone.some((c) => !c.hold && c.heat !== "yellow")}
          onClose={() => setFileId(null)}
          onArrive={() => void arrive([file])}
          onCancel={() => void cancel(file)}
          onFinish={(how) => void finish([file.h], how)}
          onKeep={(next, how) => void keep(file.h, next, how)}
        />
      )}
    </main>
  );
}

/** A question's square: what was decided for the students with her (all of them, or some). */
function squareOf(x: SessionQ, dec: Decisions): { cls: string; sign: string; words: string } {
  const ds = x.who.map((h) => (dec[h.v.key] ?? {})[x.q]);
  if (ds.length === 0 || ds.every((d) => d === undefined)) return { cls: "", sign: "", words: "" };
  if (ds.some((d) => d === undefined)) return { cls: " part", sign: "", words: "some done" };
  if (ds.every((d) => d === "x")) return { cls: " s-explained", sign: "✓", words: "explained" };
  if (ds.every((d) => d === "th")) return { cls: " dk", sign: "T", words: "to Theory" };
  if (ds.every((d) => d === "skip")) return { cls: " was", sign: "–", words: "not now" };
  return { cls: " part", sign: "✓", words: "decided" };
}

/** Someone she called: solid with her (✓ when all his questions are done), dashed on the way, dotted called, red late. */
function RoomPill(props: { it: EvalItem; dec: Decisions; now: number; onPick: () => void }) {
  const { it } = props;
  const finished = it.state === "here" && allDecided(it.h, props.dec);
  const cls =
    it.state === "here" ? (it.h.kind === "theory" ? "s-th" : finished ? "s-done" : "s-in") : it.state === "walking" ? "s-walk" : "s-call";
  const small = it.state === "walking" ? sinceWords(it.h.rc.walkMs).trim() : it.h.kind === "theory" && it.state === "here" ? "◎" : "";
  return (
    <button
      type="button"
      class={`evx-sp ${cls}${it.late ? " s-late" : ""}${it.h.v.pulled ? " s-pull" : ""}`}
      data-u={it.late ? "red" : undefined}
      data-name={it.name}
      aria-label={`${it.name}: ${evalWords(it, props.now)}${finished ? ", all done" : ""}${it.h.v.pulled ? ", Theory wants him" : ""}`}
      onClick={props.onPick}
    >
      {finished && <span aria-hidden="true">✓ </span>}
      {it.name}
      {small && <small>{small}</small>}
    </button>
  );
}

const DEC_WORDS: Record<Decision, string> = { x: "explained", th: "to Theory", skip: "not now" };

/**
 * One student she called, like a doctor's file: where he is (Arrived), his book, his questions with what was
 * decided, his unit and his day; send him back, keep him for his next book, or cancel the call.
 */
function EvalFileSheet(props: {
  it: EvalItem;
  now: number;
  busy: boolean;
  dec: Record<number, Decision | undefined>;
  next?: View;
  canKeep: boolean;
  onClose: () => void;
  onArrive: () => void;
  onCancel: () => void;
  onFinish: (how: "decided" | "all" | "nothing") => void;
  onKeep: (next: View, how: "all" | "decided") => void;
}) {
  const { it, dec, now } = props;
  const h = it.h;
  const v = h.v;
  const isHere = it.state === "here";
  const decided = h.qs.filter((q) => dec[q] !== undefined).length;
  const main = v.home ?? v;
  const home = v.s.lastInAt !== undefined ? v.s.lastInAt + STAY_MS : undefined;
  const nextWords = props.next ? `${unitWords(props.next)} (${props.next.pending.length})` : "";
  const foot = isHere ? (
    <div class="row-actions evx-file-acts">
      <button type="button" class="btn ghost" disabled={props.busy} onClick={() => props.onFinish("nothing")}>
        {h.kind === "theory" ? "Not taught" : "Nothing explained"}
      </button>
      <button type="button" class="btn evaluation" disabled={props.busy} onClick={() => props.onFinish(h.kind === "theory" || decided > 0 ? "decided" : "all")}>
        {h.kind === "theory" ? "Done: taught" : v.pulled ? "Send to Theory" : decided > 0 || h.qs.length === 0 ? "Done: back to work" : "All explained"}
      </button>
    </div>
  ) : (
    <div class="row-actions evx-file-acts">
      <button type="button" class="btn ghost" disabled={props.busy} onClick={props.onCancel}>
        {it.state === "walking" ? "Not coming" : "Cancel the call"}
      </button>
      <button type="button" class="btn tp-arrive" disabled={props.busy} onClick={props.onArrive}>
        Arrived
      </button>
    </div>
  );
  return (
    <Sheet title={it.name} sub={evalWords(it, now)} onClose={props.onClose} foot={foot} cls="evx-file">
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
            {h.qs.map((x) => (
              <span key={x} class={`ev-sq${dec[x] ? ` d-${dec[x]}` : ""}`} aria-label={`${qLabel(v, x)}${dec[x] ? `: ${DEC_WORDS[dec[x]!]}` : ""}`}>
                {qLabel(v, x)}
              </span>
            ))}
          </div>
          <p class="ev-h-sum">{decided > 0 ? decisionWords(h, dec) : `${h.qs.length} to explain: the squares on the page, one at a time.`}</p>
        </>
      )}
      {props.next &&
        isHere &&
        (props.canKeep ? (
          <button type="button" class="btn ghost ev-keep" disabled={props.busy} onClick={() => props.next && props.onKeep(props.next, decided === 0 ? "all" : "decided")}>
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
          <small>{v.st.finished ? "Finished his book" : v.st.left === 0 ? "No work until these are explained or taught" : `${v.st.left} left in his section`}</small>
        )}
        <small>
          {v.s.lastInAt !== undefined ? `Came ${slClock(v.s.lastInAt)}` : "Here today"}
          {home !== undefined ? ` · home ~${slClock(home)}` : ""}
          {main.noWork && main.idleMs ? ` · no work ${mShort(main.idleMs)}` : ""}
        </small>
      </div>
    </Sheet>
  );
}
