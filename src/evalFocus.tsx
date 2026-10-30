// The Evaluation page: everything the Evaluation teacher needs, for 20–30 students (the rules are in
// src/evalFocusData.ts). Built like the Theory page, and like Focus where she works.
// - Today's score. Theory's notes: it took your student first, or wants him now.
// - With you (3 at most): his questions one at a time, with the answer key: Explained, → Theory, Not now.
//   "All explained" or Done sends him back to work. Who is on the way.
// - The control panel: grades, then All / Fighter / Master with how many wait (red very urgent, orange ready, yellow
//   later). The list: the same question for 2+ (explain once), then everyone, most urgent first, with what each is
//   doing meanwhile. The page ticks its best guess; she calls whoever she wants (1, 2 or 3).
// - Theory is busy: teach it here. Gone home with levels to correct.
// Tapping red circles without calling, → Theory without calling, a student's book and Move: the Class page.

import { useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { KeyAnswer } from "../convex/lib/key";
import { mutate } from "./backend";
import { GoneHome, NobodyHere } from "./board";
import { Tiles, TodayStrip } from "./deck";
import type { View } from "./derive";
import {
  canTeachHere,
  candidates,
  decisionWords,
  defaultEvalTicks,
  EVAL_CAP,
  evalCounts,
  evalLeft,
  evalRoom,
  finishPlan,
  lostWords,
  nextBooks,
  qLabel,
  sameGroups,
  type Cand,
  type Decision,
  type EvalFilter,
  type EvalHere,
} from "./evalFocusData";
import { GradePills, gradesOf, inGrade, needsOf, useGradeFilter } from "./grades";
import { useQuery } from "./live";
import { KeyLine } from "./master";
import { scoreOf } from "./score";
import { act, currentRole, toast, type Board } from "./store";
import { flushTaps } from "./taps";
import { Coming } from "./theoryFocus";
import { classPace, mShort } from "./theoryFocusData";
import { tone } from "./tones";
import { Empty } from "./ui";

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

export function EvaluationPage(props: { board: Board; views: View[]; now: number }) {
  const { board, now } = props;
  const all = props.views;
  const inClass = all.filter((v) => v.where !== "absent");
  const grades = gradesOf(inClass);
  const [grade, setGrade] = useGradeFilter("evaluation", grades);
  const views = inGrade(all, grade);
  const [kind, setKind] = useState<EvalFilter>("all");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [teachPick, setTeachPick] = useState<string[] | null>(null);
  const [dec, setDec] = useState<Decisions>({});
  const [busy, setBusy] = useState(false);
  const pace = classPace(all);

  // The room and Theory's notes are never filtered.
  const room = evalRoom(board, all, now);
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
  const bumped = board.calls.filter((c) => c.room === "theory" && c.bumped && byId.get(c.studentId)?.where !== "absent");
  const pulls = room.here.filter((h) => h.v.pulled);
  const here = inGrade(inClass, grade);
  const listed = new Set([...everyone.map((c) => c.v.s._id as string), ...room.here.map((h) => h.v.s._id as string), ...room.coming.map((rc) => rc.c.studentId as string)]);
  const others = here.filter((v) => !listed.has(v.s._id)).length;
  const score = scoreOf(board, all, "evaluation", now);

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
    toast(`Saved: ${h.v.s.name} stays for ${next.unit.code} (${next.pending.length} to explain).`);
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
  };

  if (inClass.length === 0 && room.here.length === 0) {
    return (
      <main class="page ev-page">
        <NobodyHere />
        <GoneHome role="evaluation" views={views} now={now} />
      </main>
    );
  }

  return (
    <main class={`page ev-page${chosen.length ? " with-bar" : ""}`}>
      <TodayStrip s={score} room="evaluation" inClass={inClass.length} />
      {bumped.length > 0 && (
        <p class="bump-note" role="status">
          <b>Theory took {bumped.map((c) => byId.get(c.studentId)?.s.name ?? "?").join(", ")} first.</b> Your call was cancelled: call{" "}
          {bumped.length === 1 ? "him" : "them"} again after Theory.
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

      {(room.here.length > 0 || room.coming.length > 0) && (
        <section class="tf-card ev-room" aria-label="With you">
          <p class="tf-kicker">
            With you · {room.here.length}/{EVAL_CAP}
            {room.coming.length > 0 ? ` · ${room.coming.length} coming` : ""}
          </p>
          {room.here.map((h, i) => (
            <HereCard
              key={h.rc.c._id}
              h={h}
              first={i === 0}
              now={now}
              dec={dec[h.v.key] ?? {}}
              setDec={(d) => setDec({ ...dec, [h.v.key]: d })}
              busy={busy}
              onFinish={(how) => void finish(h, how)}
              next={h.kind === "evaluation" && !h.v.pulled ? nextBooks(h.v)[0] : undefined}
              canKeep={canKeep}
              onKeep={(next, how) => void keep(h, next, how)}
            />
          ))}
          {room.coming.length > 0 && <Coming calls={room.coming} now={now} />}
        </section>
      )}

      <div class="ev-panel">
        <GradePills views={inClass} needs={needsOf("evaluation", board, all, now)} filter={grade} onPick={setGrade} />
        {everyone.length > 0 && (
          <Tiles
            label="Show one kind of book"
            value={kind}
            onPick={(k) => {
              setKind(k);
              setPicked(null);
            }}
            items={[
              { id: "all", label: "All", c: counts.all },
              { id: "fighter", label: "Fighter", c: counts.fighter },
              { id: "master", label: "Master", c: counts.master },
            ]}
          />
        )}
      </div>

      {list.length === 0 && room.here.length === 0 && (
        <Empty title="Nothing to explain now">Wrong answers and lost marks show here as soon as they are marked.</Empty>
      )}

      {list.length > 0 && (
        <section class="ev-next" aria-label="Call next">
          <div class="ev-next-h">
            <h3 class="tf-h">Call next</h3>
            <small class={left === 0 ? "t-amber" : ""}>{left === 0 ? `Room full (${EVAL_CAP} with you)` : `room for ${left}`}</small>
          </div>
          {groups.slice(0, 3).map((g) => (
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
              <span class="ev-same-q">{g.label}</span>
              <span class="ev-same-t">
                <b>Same question ×{g.members.length}</b>
                <small>{g.members.map((m) => m.v.s.name).join(", ")}: explain once</small>
              </span>
              <span class="ev-same-go" aria-hidden="true">
                Tick
              </span>
            </button>
          ))}
          <ul class="ev-list">
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
        </section>
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

      {others > 0 && (
        <p class="muted small tp-others">
          {others === 1 ? "1 other has" : `${others} others have`} nothing for you now.
        </p>
      )}
      <p class="muted small tf-help">
        The page ticks who needs you most; tick whoever you want ({EVAL_CAP} with you at most) and tap <b>Call</b>. To mark
        explained or send to Theory without calling: <b>Class</b> at the top, tap his name.
      </p>
      <GoneHome role="evaluation" views={views} now={now} />

      {chosen.length > 0 && (
        <div class="call-bar evaluation" role="region" aria-label="Call">
          <div class="call-bar-text">
            <b>
              {chosen
                .map((k) => {
                  const c = callable.get(k);
                  return c ? (c.v.home || c.v.others.length ? `${c.v.s.name} ${c.v.unit?.code ?? ""}`.trim() : c.v.s.name) : "?";
                })
                .join(", ")}
            </b>
            <small>{picked === null ? "The page's pick: tap names to change it" : `${chosen.length} ticked`}</small>
          </div>
          <button type="button" class="btn ghost small" onClick={() => setPicked([])}>
            Clear
          </button>
          <button
            type="button"
            class="btn evaluation"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              if (await callEval(chosen.flatMap((k) => { const c = callable.get(k); return c ? [c.v] : []; }), "evaluation")) setPicked(null);
              setBusy(false);
            }}
          >
            Call {chosen.length}
          </button>
        </div>
      )}
    </main>
  );
}

// ---------------- Call next: one student ----------------

function CandRow(props: { c: Cand; on: boolean; named: boolean; onTap: () => void }) {
  const { c, on } = props;
  const qs = c.qs.map((q) => qLabel(c.v, q));
  const shown = qs.length > 4 ? [...qs.slice(0, 3), `+${qs.length - 3}`] : qs;
  return (
    <button
      type="button"
      class={`ev-c h-${c.heat}${on ? " on" : ""}${c.hold ? " hold" : ""}`}
      aria-pressed={on}
      aria-label={`${c.v.s.name}: ${c.why}${c.work ? `, ${c.work}` : ""}${c.hold ? `, ${c.hold}` : ""}`}
      onClick={props.onTap}
    >
      <span class="ev-tick" aria-hidden="true" />
      <span class="ev-c-who">
        <b>{c.v.s.name}</b>
        <small>
          {props.named || c.kind === "master" || c.v.home || c.v.others.length ? `${c.v.tag} · ` : ""}
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

// ---------------- With you: one student ----------------

/** The answer key's answer for a workbook question (it comes only while she has the student). */
function KeyFor(props: { v: View; q: number }) {
  const keyQ = useQuery<{ answers: KeyAnswer[] } | null>(api.catalog.key, { unitId: props.v.unit?._id ?? props.v.s.unitId });
  if (keyQ === undefined) return <p class="ev-key muted">Loading the answer…</p>;
  const k = keyQ?.answers.find((a) => a.q === props.q);
  if (!k) return <p class="ev-key muted">{keyQ === null ? "No answer key for this workbook yet." : "No answer for this question in the key."}</p>;
  return (
    <div class="ev-key">
      <small>Answer</small>
      <KeyLine k={k} />
    </div>
  );
}

const DEC_WORDS: Record<Decision, string> = { x: "explained", th: "to Theory", skip: "not now" };

function HereCard(props: {
  h: EvalHere;
  first: boolean;
  now: number;
  dec: Record<number, Decision | undefined>;
  setDec: (d: Record<number, Decision | undefined>) => void;
  busy: boolean;
  onFinish: (how: "all" | "decided" | "nothing") => void;
  /** His next book with something to explain (one book per call): keep him for it, or call him again later. */
  next?: View;
  canKeep: boolean;
  onKeep: (next: View, how: "all" | "decided") => void;
}) {
  const { h, dec, now } = props;
  const nextWords = props.next ? `${props.next.unit?.code ?? "his other book"} (${props.next.pending.length})` : "";
  const v = h.v;
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open ?? props.first;
  const firstOpen = h.qs.findIndex((q) => dec[q] === undefined);
  const [at, setAt] = useState<number | null>(null);
  const idx = Math.min(at ?? (firstOpen < 0 ? Math.max(0, h.qs.length - 1) : firstOpen), Math.max(0, h.qs.length - 1));
  const q = h.qs[idx];
  const minutes = now - (h.rc.c.sentAt ?? h.rc.c.createdAt);
  const decided = h.qs.filter((x) => dec[x] !== undefined).length;
  const theoryOk = !!v.f || !!v.ms;

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

  const head = (
    <button type="button" class="ev-h-head" aria-expanded={isOpen} onClick={() => setOpen(!isOpen)}>
      <b class="ev-h-name">{v.s.name}</b>
      <span class="ev-h-tag">
        {v.tag}
        {h.kind === "theory" ? ` · teach ${v.st?.nextTheory ?? "theory"}` : h.qs.length ? ` · ${h.qs.length - decided} to explain` : ""}
      </span>
      <span class={`ev-h-min${h.rc.long ? " long" : ""}`}>{h.rc.long ? `Still with you? ${mShort(minutes)}` : minutes >= 60_000 ? mShort(minutes) : ""}</span>
      <span class="ev-h-go" aria-hidden="true">
        {isOpen ? "▾" : "›"}
      </span>
    </button>
  );

  if (!isOpen) return <div class={`ev-h closed${h.rc.long ? " long" : ""}`}>{head}</div>;

  return (
    <div class={`ev-h${h.rc.long ? " long" : ""}${v.pulled ? " pulled" : ""}`} aria-label={`${v.s.name} with you`}>
      {head}
      {h.kind === "theory" ? (
        <>
          <p class="ev-teaching">
            You teach <b>{v.st?.nextTheory ? `section ${v.st.nextTheory}` : v.ms ? "his workbook questions" : "theory"}</b> (Theory was busy).
          </p>
          <div class="ev-h-acts">
            <button type="button" class="link-btn" disabled={props.busy} onClick={() => props.onFinish("nothing")}>
              Send back: not taught
            </button>
            <button type="button" class="btn theory" disabled={props.busy} onClick={() => props.onFinish("all")}>
              Done: taught
            </button>
          </div>
        </>
      ) : h.qs.length === 0 ? (
        <>
          <p class="ev-teaching muted">Nothing left to explain.</p>
          <div class="ev-h-acts">
            <button type="button" class="btn evaluation" disabled={props.busy} onClick={() => props.onFinish("decided")}>
              Done: back to work
            </button>
          </div>
        </>
      ) : (
        <>
          <div class="ev-strip" role="group" aria-label={`${v.s.name}'s questions`}>
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
            {v.ms ? <KeyFor v={v} q={q} /> : <p class="ev-key muted">Check his answer in his notebook.</p>}
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
          <div class="ev-h-acts">
            {decided === 0 ? (
              <>
                <button type="button" class="link-btn" disabled={props.busy} onClick={() => props.onFinish("nothing")}>
                  Send back: nothing explained
                </button>
                <button type="button" class="btn evaluation" disabled={props.busy} onClick={() => props.onFinish("all")}>
                  All explained: back to work
                </button>
              </>
            ) : (
              <>
                <span class="ev-h-sum">{decisionWords(h, dec)}</span>
                <button type="button" class="btn evaluation" disabled={props.busy} onClick={() => props.onFinish("decided")}>
                  Done: back to work
                </button>
              </>
            )}
          </div>
          {props.next &&
            (props.canKeep ? (
              <button
                type="button"
                class="btn ghost ev-keep"
                disabled={props.busy}
                onClick={() => props.onKeep(props.next!, decided === 0 ? "all" : "decided")}
              >
                {decided === 0 ? "All explained" : "Done"}, keep him for {nextWords}
              </button>
            ) : (
              <p class="ev-also muted small">Also waiting: {nextWords}. Others need the room: call him again later.</p>
            ))}
        </>
      )}
    </div>
  );
}

