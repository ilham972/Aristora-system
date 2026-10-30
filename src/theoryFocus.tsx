// The Theory page: everything the Theory teacher needs on one screen, for 20–30 students (the rules are in
// src/theoryFocusData.ts).
// - Today's score, and one line: who is with you, who is coming, who has no work, how long your lessons take.
// - The lessons going on: what to teach, who is here ("got it" for each), who is on the way, who can still join.
// - The control panel: All / Fighter / Master with how many need theory (red no work now, orange soon, yellow later),
//   then every lesson as a pill with its numbers. The page picks the most useful (marked Next); the teacher picks any.
//   The picked lesson: who needs it, with what each is doing ("2 left · out ~4m"), ticked (6 at most); one tap calls.
// Marking taught without calling, a student's whole book and Move are on the Class page (tap his name).

import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { SectionData } from "../convex/lib/book";
import { mutate } from "./backend";
import { NobodyHere } from "./board";
import type { RoomCall, View } from "./derive";
import { useQuery } from "./live";
import { Heat, Tiles, TodayStrip } from "./deck";
import { scoreOf } from "./score";
import { act, currentRole, toast, type Board, type Unit } from "./store";
import { flushTaps } from "./taps";
import {
  defaultTicks,
  joiners,
  kindCounts,
  LATE_SEND_MS,
  LESSON_CAP,
  lessonHeat,
  lessonLength,
  memberWords,
  mShort,
  planLessons,
  redCount,
  roomLessons,
  startIn,
  toPlan,
  whyWords,
  workbookDone,
  type LessonKind,
  type Lesson,
  type Member,
  type RoomLesson,
} from "./theoryFocusData";
import { tone } from "./tones";
import { Empty } from "./ui";

/** Call students to Theory (Correction is told and sends them). */
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

export function TheoryTab(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  // How long this teacher's lessons take, learnt from Done (12 min until there are a few).
  const recent = useQuery<{ ms: number[] }>(api.calls.lessons, {});
  const lessonMs = lessonLength(recent?.ms);
  const room = roomLessons(board, views, now);
  const freeIn = startIn(room, lessonMs, now);
  const plan = planLessons(views, now, { lessonMs, startInMs: freeIn });
  const open = toPlan(plan, room);
  const [kind, setKind] = useState<"all" | LessonKind>("all");
  // The lesson she picked (else the page's pick), and her ticks per lesson: kept while she switches between them.
  const [sel, setSel] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string[] | null>>({});
  const inClass = views.filter((v) => v.where !== "absent");
  const withYou = room.reduce((a, l) => a + l.here.length, 0);
  const coming = room.reduce((a, l) => a + l.coming.length, 0);
  const noWork = redCount(plan);
  const listed = new Set([
    ...plan.flatMap((l) => l.members.map((m) => m.v.s._id as string)),
    ...room.flatMap((l) => [...l.here.map((st) => st.v.s._id as string), ...l.coming.map((rc) => rc.c.studentId as string)]),
  ]);
  const others = inClass.filter((v) => !listed.has(v.s._id)).length;
  const counts = kindCounts(open);
  const shown = kind === "all" ? open : open.filter((l) => l.kind === kind);
  // The pills keep one order (book, unit, section), so nothing moves under her finger as minutes pass; the page's
  // pick (the most useful lesson) is marked Next.
  const pills = [...shown].sort(pillOrder);
  const best = shown[0]?.key;
  const current = shown.find((l) => l.key === sel) ?? shown[0];
  const score = scoreOf(board, views, "theory", now);

  if (inClass.length === 0 && room.length === 0) {
    return (
      <main class="page tp-page">
        <NobodyHere />
      </main>
    );
  }
  return (
    <main class="page tp-page">
      <TodayStrip s={score} room="theory" inClass={inClass.length} />
      <div class="summary tp-sum" aria-label="Theory now">
        <span class="strong">{withYou} with you</span>
        {coming > 0 && <span class="t-theory strong">{coming} coming</span>}
        <span class={noWork ? "t-red strong" : ""}>{noWork} with no work</span>
        <span>lessons ~{Math.round(lessonMs / 60_000)} min</span>
        {room.length > 0 && <span>free in ~{mShort(freeIn)}</span>}
      </div>

      {room.map((l) => (
        <RoomBlock key={l.key} l={l} join={joiners(l, plan)} now={now} />
      ))}

      {open.length === 0 && room.length === 0 && (
        <Empty title="Nobody needs theory now">Students who need a section, or workbook questions sent to Theory, show here.</Empty>
      )}

      {open.length > 0 && (
        <section class="tp-list" aria-label="Next">
          <Tiles
            label="Show one kind of book"
            value={kind}
            onPick={(k) => {
              setKind(k);
              setSel(null);
            }}
            items={[
              { id: "all", label: "All", c: counts.all },
              { id: "section", label: "Fighter", c: counts.section },
              { id: "workbook", label: "Master", c: counts.workbook },
            ]}
          />
          <h3 class="tf-h">Next</h3>
          {pills.length === 0 ? (
            <p class="muted small">Nobody here needs this kind of lesson now.</p>
          ) : (
            <div class={`tp-pills${pills.length === 1 ? " one" : ""}`} role="group" aria-label="Lessons">
              {pills.map((l) => (
                <LessonPill key={l.key} l={l} on={l.key === current?.key} best={l.key === best} onPick={() => setSel(l.key)} />
              ))}
            </div>
          )}
          {current && (
            <NextCard
              key={current.key}
              l={current}
              first={current.key === best}
              picked={picks[current.key] ?? null}
              setPicked={(ids) => {
                setPicks({ ...picks, [current.key]: ids });
                if (ids !== null) setSel(current.key);
              }}
            />
          )}
        </section>
      )}

      {others > 0 && (
        <p class="muted small tp-others">
          {others === 1 ? "1 other doesn't" : `${others} others don't`} need theory yet.
        </p>
      )}
      <p class="muted small tf-help">
        The page ticks who needs it most; tick whoever you want ({LESSON_CAP} at most) and tap <b>Call</b>: Correction sends
        them. To mark taught without calling, or to Move a student: <b>Class</b> at the top, tap his name.
      </p>
    </main>
  );
}

/** The pills' one order: theory books first (by unit and section), then workbooks. */
function pillOrder(a: Lesson, b: Lesson): number {
  return (
    Number(a.kind === "workbook") - Number(b.kind === "workbook") ||
    (a.unit?.grade ?? 0) - (b.unit?.grade ?? 0) ||
    a.label.localeCompare(b.label, undefined, { numeric: true })
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

function lessonSub(l: Lesson): string {
  return l.kind === "section" ? (l.teach.length ? ` · teach ${qList(l.teach)}` : "") : l.shared.length ? ` · ${l.shared.map((s) => `Q${s.q} ×${s.n}`).join(" ")}` : "";
}

function lessonTitle(l: { kind: LessonKind; section: SectionData | null; unit: Unit | null }): string {
  return l.kind === "section" ? `Section ${l.section?.id}: ${l.section?.title}` : `${l.unit?.code} workbook`;
}

/** What a workbook student brings (his questions, or the whole unit), or the part of a section he still needs. */
function whatOf(m: { v: View; qs: number[]; whole: boolean; teach: number[] }, section: SectionData | null): string {
  if (m.v.ms) return m.whole ? "whole unit" : qList(m.qs);
  return section && m.teach.length < section.teach.length ? qList(m.teach) : "";
}

// ---------------- Next ----------------

/** One lesson as a pill: its letter, its name, and how many need it (red no work now, orange soon, yellow later). */
function LessonPill(props: { l: Lesson; on: boolean; best: boolean; onPick: () => void }) {
  const { l, on } = props;
  const heat = lessonHeat(l);
  const hue = l.starving || heat.red ? "red" : heat.orange ? "amber" : "green";
  return (
    <button
      type="button"
      class={`tp-pill u-${hue}${on ? " on" : ""}${l.starving ? " starving" : ""}`}
      aria-pressed={on}
      aria-label={`${lessonTitle(l)}: ${heat.total} need it. ${whyWords(l)}${props.best ? ". The page's pick" : ""}`}
      onClick={props.onPick}
    >
      {props.best && <i class="tp-best">Next</i>}
      <span class={`tf-badge-l sm${l.kind === "workbook" ? " wb" : ""}`} aria-hidden="true">
        {l.kind === "section" ? (l.section?.badge ?? "?") : "W"}
      </span>
      <span class="tp-pill-t">
        <b>{l.kind === "section" ? (l.section?.title ?? "Theory") : `${l.unit?.en ?? "Workbook"}: workbook`}</b>
        <span class="tp-pill-sub">
          <Heat c={heat} />
          <small>{l.unit ? `G${l.unit.grade} ${l.unit.code}` : ""}</small>
        </span>
      </span>
    </button>
  );
}

function NextCard(props: { l: Lesson; first: boolean; picked: string[] | null; setPicked: (ids: string[] | null) => void }) {
  const { l, first, picked, setPicked } = props;
  const [busy, setBusy] = useState(false);
  const ids = new Set(l.members.map((m) => m.v.s._id as string));
  const chosen = (picked ?? defaultTicks(l)).filter((id) => ids.has(id));
  const on = new Set(chosen);
  const toggle = (m: Member) => {
    const id = m.v.s._id as string;
    if (on.has(id)) setPicked(chosen.filter((x) => x !== id));
    else if (chosen.length >= LESSON_CAP) toast(`${LESSON_CAP} at most in one lesson. Untick someone first.`, "error");
    else setPicked([...chosen, id]);
  };
  const hue = l.starving || l.members.some((m) => m.outIn === 0 && !m.hold) ? "red" : l.frees > 0 ? "amber" : "green";
  return (
    <section class={`tf-card tp-card u-${hue}${first ? " first" : ""}`} aria-label={lessonTitle(l)}>
      <p class="tf-kicker">{first ? (l.frees > 0 ? "Teach next" : "Nobody is waiting. Teach ahead:") : "Your pick"}</p>
      <LessonHead kind={l.kind} unit={l.unit} section={l.section} sub={lessonSub(l)} />
      <p class={`tp-why u-${hue}`}>{whyWords(l)}</p>
      <ul class="tp-grid" aria-label="Who needs it">
        {l.members.map((m) => (
          <li key={m.v.s._id}>
            <MemberChip m={m} on={on.has(m.v.s._id)} what={whatOf(m, l.section)} onTap={() => toggle(m)} />
          </li>
        ))}
      </ul>
      <div class="tp-acts">
        <button
          type="button"
          class="btn theory wide tp-call"
          disabled={busy || chosen.length === 0}
          onClick={async () => {
            setBusy(true);
            if (await callTheory(l.members.filter((m) => chosen.includes(m.v.s._id)).map((m) => m.v))) setPicked(null);
            setBusy(false);
          }}
        >
          {chosen.length === 0 ? "Tick who to call" : `Call ${chosen.length}`}
        </button>
        {picked !== null && (
          <button type="button" class="btn ghost small" onClick={() => setPicked(null)}>
            Page's pick
          </button>
        )}
      </div>
    </section>
  );
}

function MemberChip(props: { m: Member; on: boolean; what: string; onTap: () => void }) {
  const { m, on, what } = props;
  const words = memberWords(m);
  return (
    <button
      type="button"
      class={`tp-m u-${m.urgency}${on ? " on" : ""}${m.hold ? " hold" : ""}`}
      aria-pressed={on}
      aria-label={`${m.v.s.name}: ${words}${what ? `, ${what}` : ""}`}
      onClick={props.onTap}
    >
      <b>{m.v.s.name}</b>
      <small>{words}</small>
      {what && <small class="tp-what">{what}</small>}
    </button>
  );
}

// ---------------- A lesson going on ----------------

function RoomBlock(props: { l: RoomLesson; join: Member[]; now: number }) {
  const { l, now } = props;
  const teachAll = l.teach;
  // What he taught (a section's teach questions: untick the ones the bell stopped), and who got it.
  const [teach, setTeach] = useState<number[] | null>(null);
  const [notYet, setNotYet] = useState<string[]>([]);
  // Workbook: each student's questions (all ticked unless untapped) and the whole unit.
  const [qOff, setQOff] = useState<Record<string, number[]>>({});
  const [wholeOff, setWholeOff] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const taught = new Set(teach ?? teachAll);
  const ready = l.here.filter((st) => !notYet.includes(st.v.s._id));
  const minutes = l.since === null ? 0 : now - l.since;

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
              mutate(api.workbook.taught, { studentId: st.v.s._id, unitId: st.v.unit?._id ?? st.v.s.unitId, qs: d.taught, on: true, by: currentRole() }),
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
    tone(sendBackOnly ? "tick" : "done");
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

  const kicker =
    l.here.length === 0
      ? `Starting: ${l.coming.length} on the way`
      : l.long
        ? `Still with you? ${mShort(minutes)}`
        : `With you${minutes >= 60_000 ? ` · ${mShort(minutes)}` : ""}`;
  return (
    <section
      class={`tf-card room tp-room${l.long ? " long" : ""}${l.here.length === 0 ? " starting" : ""}`}
      aria-label={l.kind === "section" ? `Teaching section ${l.section?.id}` : "Teaching workbook questions"}
    >
      <p class="tf-kicker">{kicker}</p>
      <LessonHead kind={l.kind} unit={l.unit} section={l.section} sub={l.kind === "section" && teachAll.length ? ` · teach ${qList(teachAll)}` : ""} />

      {l.kind === "section" && teachAll.length > 0 && l.here.length > 0 && (
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

      {l.here.length > 0 && l.kind === "section" && (
        <ul class="tp-grid" aria-label="Who is here">
          {l.here.map((st) => {
            const id = st.v.s._id as string;
            const got = !notYet.includes(id);
            const what = whatOf({ v: st.v, qs: st.qs, whole: st.whole, teach: st.teach }, l.section);
            return (
              <li key={id}>
                <button
                  type="button"
                  class={`tp-got${got ? " on" : ""}`}
                  aria-pressed={got}
                  aria-label={`${st.v.s.name}: ${got ? "got it" : "not yet, stays with you"}`}
                  onClick={() => setNotYet(got ? [...notYet, id] : notYet.filter((x) => x !== id))}
                >
                  <b>{st.v.s.name}</b>
                  <small>{got ? "✓ got it" : "not yet: stays"}</small>
                  {what && <small class="tp-what">{what}</small>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {l.here.length > 0 && l.kind === "workbook" && (
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
                {(st.qs.length > 0 || st.whole) && (
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
              </li>
            );
          })}
        </ul>
      )}

      {l.here
        .filter((st) => notYet.includes(st.v.s._id))
        .map((st) => (
          <button key={st.v.s._id} type="button" class="link-btn tf-back" disabled={busy} onClick={() => void done([st], true)}>
            Send {st.v.s.name} back without it
          </button>
        ))}

      {l.coming.length > 0 && <Coming calls={l.coming} now={now} />}

      {l.here.length > 0 && (
        <button type="button" class="btn theory big wide" disabled={busy || ready.length === 0} onClick={() => void done()}>
          {ready.length === 0 ? "Nobody ticked: they stay" : `Done: ${ready.length === l.here.length ? "" : `${ready.length} `}back to work`}
        </button>
      )}

      {props.join.length > 0 && (
        <div class="tf-join" aria-label="Can join now">
          <span class="tf-lbl">Join now</span>
          {props.join.map((m) => (
            <button
              key={m.v.s._id}
              type="button"
              class={`tf-jn u-${m.urgency}`}
              aria-label={`Call ${m.v.s.name} to join (${memberWords(m)})`}
              disabled={busy}
              onClick={() => void callTheory([m.v])}
            >
              <b>+ {m.v.s.name}</b>
              <small>{memberWords(m)}</small>
            </button>
          ))}
        </div>
      )}

      {l.here.length > 0 && (
        <button type="button" class="link-btn tf-back tp-all-back" disabled={busy} onClick={() => void done(l.here, true)}>
          Send everyone back: nothing taught
        </button>
      )}
    </section>
  );
}

/** Called, not here yet: on the way (red when Correction hasn't sent him for 3 minutes), or finishing in Evaluation. */
export function Coming(props: { calls: RoomCall[]; now: number }) {
  const { calls, now } = props;
  return (
    <ul class="tp-coming" aria-label="On the way">
      {calls.map((rc) => {
        const name = rc.v?.s.name ?? "?";
        const waited = now - rc.c.createdAt;
        const late = !rc.c.pull && waited >= LATE_SEND_MS;
        return (
          <li key={rc.c._id} class={`tp-c${late ? " late" : ""}${rc.c.pull ? " pull" : ""}`}>
            <b>{name}</b>
            <small>{rc.c.pull ? "in Eval first" : late ? `not sent ${mShort(waited)}` : `coming${waited >= 60_000 ? ` ${mShort(waited)}` : ""}`}</small>
            <button
              type="button"
              class="cs-x"
              aria-label={`Cancel the call for ${name}`}
              onClick={() => void act(() => mutate(api.calls.cancel, { callIds: [rc.c._id], by: currentRole() }))}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
