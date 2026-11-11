// The Consultation page (5 Nov 2026, his voice note: "sometimes we have to call some student from the hall and teach
// that one student only ... show the students in the order of the pending evaluation or pending theory ... how many
// pending still we have, and how many we have to do today ... the system suggests the priority order but still I can
// call anyone I want ... not for everyone: the people I pick in Settings"). The top bar's icon left of the whiteboard:
// the owner and the people with the Consultation tick (Settings → People). Rules: src/consultData.ts; server:
// convex/consult.ts (and calls.create with `consult`).
// - Pinned: Evaluation | Theory in fixed places with today's counts; under them Today (the students here) and All
//   (every student, also those not here).
// - The students here as pills in his order: the most waiting first, a red ring = no work, pale = another teacher has
//   him; then everyone with nothing waiting (a check-in), the one not seen in a consultation longest first. Tap = tick.
// - Her room box like Evaluation's (called, on the way, with her) with Call, Arrived and Done beside it. Correction's
//   phone sends them and says only her name ("Kumar, go to Ilham.").
// - Their questions as squares (all their books), one at a time on Correction's card with the answer big; at the
//   bottom, fixed: Evaluation: → Theory, Not now, ✓ Explained; Theory: Not reached, ✓ Taught. Every tap is saved at
//   once (tap again = back) for everyone with her who has that question. Switching to Theory with him here teaches
//   his theory in the same sitting.
// - Done: back to work. What she didn't reach stays for the Evaluation and Theory teachers.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { EVAL_SHOWS, type ConsultKind, type EvalShow } from "../convex/lib/consult";
import { slDayStart } from "../convex/lib/day";
import { joinNames } from "./announce";
import { fetchOnce, mutate } from "./backend";
import { NobodyHere } from "./board";
import { BookQuestion, useQuestionShown } from "./bookQuestion";
import {
  bookLines,
  consultQs,
  consultRoom,
  consultRows,
  consultWords,
  deptTally,
  openOn,
  qKey,
  sqLabel,
  squareLook,
  todayOf,
  WHOLE,
  type ConsultItem,
  type ConsultDraft,
  type ConsultQ,
  type ConsultRow,
  type Local,
  type QState,
  type Show,
} from "./consultData";
import type { View } from "./derive";
import { bookKey, EVAL_CAP, lostWords } from "./evalFocusData";
import { unitNo } from "./focusData";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import { CardAnswer, CardHead, PrintedQuestion, QPill, TeachMode } from "./qcard";
import { useRoomDecisions } from "./roomDecisions";
import { KindBar, LessonName, LockIcon, useHeld, usePinned } from "./roomkit";
import { act, clearToasts, currentMe, testMode, toast, type Board } from "./store";
import { isTeachDept } from "../convex/lib/dept";
import { isBlank } from "./deskData";
import { tone } from "./tones";
import { Sheet } from "./ui";

/** What a consultation's taps are recorded as (the history: "in consultation"). */
const BY = "consult";
/** The same room as Evaluation's: 6 with her at most (his number), counting those called or on the way. */
const CAP = EVAL_CAP;
/** "All" is read again this often while the page is open (it reads every student's books: never live). */
const ALL_MS = 3 * 60_000;

type Decision = "x" | "th" | "tt" | "skip";
type Tot = { qs: number; students: number };
/** `past` / `today`: the wrong questions by when they were corrected (missing on a server older than 12 Nov 2026). */
type Counts = { evaluation: Tot; theory: Tot; past?: Tot; today?: Tot };
type Away = Counts & { fighter?: Counts; master?: Counts };
type DeptPick = "fighter" | "master";

function loadDeptPick(): DeptPick {
  try {
    return localStorage.getItem("aristora.consultDept") === "master" ? "master" : "fighter";
  } catch {
    return "fighter";
  }
}

/** The wrong questions' filter (12 Nov 2026): All (the default), Past or Today, kept on this phone. */
const SHOW_WORD: Record<EvalShow, string> = { all: "All", past: "Past", today: "Today" };
function loadShow(): EvalShow {
  try {
    const x = localStorage.getItem("aristora.consultShow");
    return x === "past" || x === "today" ? x : "all";
  } catch {
    return "all";
  }
}

function loadKind(): ConsultKind | null {
  try {
    const k = localStorage.getItem("aristora.consultKind");
    return k === "theory" || k === "evaluation" ? k : null;
  } catch {
    return null;
  }
}
function saveKind(k: ConsultKind) {
  try {
    localStorage.setItem("aristora.consultKind", k);
  } catch {
    /* private mode */
  }
}

/** The students not here now (the server, now and then): "All" = them + the students here (live). */
function useAway(): [Away | null, () => void] {
  const [away, setAway] = useState<Away | null>(null);
  const busy = useRef(false);
  const load = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      setAway(await fetchOnce(api.consult.totals, testMode() ? { test: true } : {}));
    } catch {
      // keep the last numbers; "…" until the first answer
    } finally {
      busy.current = false;
    }
  };
  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, ALL_MS);
    return () => clearInterval(id);
  }, []);
  return [away, load];
}

/** How many of her consultation's students are called, on the way or with her: the count on the top bar's icon. */
export function myConsults(board: Board, me: string | null | undefined): number {
  if (!me) return 0;
  return board.calls.filter((c) => c.consult && c.teacherId === me && (c.status === "requested" || c.status === "sent")).length;
}

export function ConsultPage(props: { board: Board; views: View[]; now: number }) {
  const { board, views, now } = props;
  const person = currentMe();
  const me = (person?._id as string | undefined) ?? null;
  // Her department's consultation (8 Nov 2026, his voice note): a Fighter or Master person sees her department's books
  // only (Fighter: No work · Evaluation; Master: one list, blanks in their own colour). The owner (or anyone in no
  // department) switches between the two: Fighter | Master.
  const own: DeptPick | null = person && person.role === "teacher" && isTeachDept(person.dept) ? person.dept : null;
  // The owner working in Fighter or Master (Settings → Roles → your own app) opens on it; he can still switch.
  const [deptPick, setDeptPick] = useState<DeptPick>(() => (person?.role === "owner" && isTeachDept(person.dept) ? person.dept : loadDeptPick()));
  const scope: DeptPick = own ?? deptPick;
  const [kindPick, setKind] = useState<ConsultKind | null>(loadKind);
  // Master: one list (wrong and blank questions to explain); Fighter: No work (theory, its first number) or Evaluation.
  const kind: ConsultKind = scope === "master" ? "evaluation" : (kindPick ?? "theory");
  // All | Past | Today on the wrong questions (12 Nov 2026, his voice note). All and Today also count the levels
  // Correction is marking right now (read live only then).
  const [showPick, setShowPick] = useState<EvalShow>(loadShow);
  const evalOn = kind === "evaluation";
  const draftRows = useQuery<ConsultDraft[]>(api.consult.drafts, {}, !evalOn || showPick === "past");
  const day = slDayStart(now);
  const showOf = (x: EvalShow): Show => ({ show: x, day, drafts: draftRows ?? null });
  const show: Show | undefined = evalOn ? showOf(showPick) : undefined;
  const [ticks, setTicks] = useState<string[]>([]);
  const [at, setAt] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [teaching, setTeaching] = useState(false);
  // A tap shows at once; the board confirms it a moment later (student|question → what she tapped).
  const [opt, setOpt] = useState<Record<string, QState>>({});
  const [away, reloadAway] = useAway();
  const stick = usePinned("cx");
  useEffect(() => {
    document.body.classList.add("evx-on");
    return () => document.body.classList.remove("evx-on");
  }, []);

  // ---- Her room: the students she called to herself ----
  const items = consultRoom(board, views, now, me);
  // What this phone keeps per consultation (Not now, and what an undo needs), until it ends.
  const [locals, setLocals] = useRoomDecisions<Local>(
    "consult",
    items.map((it) => ({ id: it.rc.c._id as string, key: it.id })),
  );
  const here = items.filter((it) => it.state === "here");
  const walkers = items.filter((it) => it.state === "walking");
  const left = Math.max(0, CAP - items.length);
  const live = here.length > 0;

  // ---- The students here, in his order (the Fighter department's No work: the idle ones first) ----
  const rows = consultRows(views, kind, me, scope, scope === "fighter" && kind === "theory", show);
  const held = useHeld(rows, (r) => r.v.s._id as string, (r) => `${r.n}.${r.red}.${r.busy ?? ""}`);
  const callable = new Set(rows.filter((r) => !r.busy).map((r) => r.v.s._id as string));
  const ticked = ticks.filter((id) => callable.has(id)).slice(0, left);
  const tickedRows = ticked.flatMap((id) => rows.find((r) => r.v.s._id === id) ?? []);
  const today = { evaluation: todayOf(views, "evaluation", scope, showOf(evalOn ? showPick : "all")), theory: todayOf(views, "theory", scope) };
  // Each filter's count here (its pill), and the students not here for the picked one (an older server: no split).
  const byShow = Object.fromEntries(EVAL_SHOWS.map((x) => [x, x === showPick && evalOn ? today.evaluation : todayOf(views, "evaluation", scope, showOf(x))])) as Record<EvalShow, ReturnType<typeof todayOf>>;
  const awayHere = away ? (away[scope] ?? away) : null;
  const awayKind = awayHere ? (evalOn && showPick !== "all" ? (awayHere[showPick] ?? awayHere.evaluation) : awayHere[kind]) : null;
  const all = awayKind ? { qs: awayKind.qs + today[kind].qs, students: awayKind.students + today[kind].students } : null;
  // The Fighter department's No work: its students here who sit with no work (his number).
  const noWork = views.filter((v) => v.where !== "absent" && v.noWork && v.kind === "fighter").length;

  // ---- The squares: those with her; nobody yet: those coming (to prepare); nobody called: the ticked ----
  const people = (live ? here : items.length ? items : []).map((it) => ({ it, v: it.v, since: it.rc.c.createdAt, local: locals[it.id] ?? {} }));
  const prep = people.length ? people : tickedRows.map((r) => ({ it: null, v: r.v, since: now, local: {} as Local }));
  const base = consultQs(prep, kind, scope, show);
  // Her taps not confirmed by the board yet.
  const qs: ConsultQ[] = base.map((sq) => ({
    ...sq,
    who: sq.who.map((w) => ({ ...w, state: opt[`${w.it.id}|${sq.key}`] ?? w.state })),
  }));
  const firstOpen = (list: ConsultQ[]) => (live ? list.find((x) => openOn(x).some((w) => w.it.state === "here")) : undefined) ?? list[0];
  const sq = qs.find((x) => x.key === at) ?? firstOpen(qs) ?? null;
  const withHer = sq ? sq.who.filter((w) => w.it.state === "here") : [];
  const n = withHer.length;
  const stage: "fighter" | "master" = sq?.v.ms ? "master" : "fighter";
  const printed = useQuestionShown(sq && sq.q !== WHOLE ? sq.v.unit?._id : undefined, stage);
  useEffect(() => {
    if (teaching && !sq) setTeaching(false); // nothing on her screen any more: back to the page
  }, [teaching, !!sq]);
  // Several books on screen: a square carries its unit's number ("8·13").
  const mixed = new Set(qs.map((x) => bookKey(x.v))).size > 1;
  const tag = (x: ConsultQ) => (mixed && x.v.unit ? `${unitNo(x.v.unit.code)}·` : "");

  const pickShow = (x: EvalShow) => {
    if (x === showPick) return;
    tone("tick");
    setShowPick(x);
    try {
      localStorage.setItem("aristora.consultShow", x);
    } catch {
      /* private mode */
    }
    setAt(null);
    setTeaching(false);
  };
  const pickKind = (k: ConsultKind) => {
    if (k === kind) return;
    tone("tick");
    setKind(k);
    saveKind(k);
    setAt(null);
    setTeaching(false);
  };
  const pickDept = (d: DeptPick) => {
    if (d === scope) return;
    tone("tick");
    setDeptPick(d);
    try {
      localStorage.setItem("aristora.consultDept", d);
    } catch {
      /* private mode */
    }
    setTicks([]);
    setAt(null);
    setTeaching(false);
  };
  const toggle = (r: ConsultRow) => {
    const id = r.v.s._id as string;
    if (r.busy) {
      toast(`${r.v.s.name} is with ${r.busy}. Call him when he is back.`, "error");
      return;
    }
    const on = ticked.includes(id);
    if (!on && ticked.length >= left) {
      toast(left === 0 ? `${CAP} with you at most. Send someone back first.` : `Room for ${left} more (${CAP} at most).`, "error");
      return;
    }
    tone("tick");
    setTicks(on ? ticked.filter((x) => x !== id) : [...ticked, id]);
    setAt(null);
  };

  /** Call the ticked students to her: Correction sends them (and says her name). */
  const call = async () => {
    if (ticked.length === 0) return;
    setBusy(true);
    const asked = ticked;
    const res = await act(() => mutate(api.calls.create, { studentIds: asked as Id<"students">[], room: "evaluation", kind, consult: true, dept: scope, by: BY }));
    setBusy(false);
    if (!res) return;
    for (const r of res.rejected) toast(`${r.name} ${r.reason}.`, "error");
    const got = res.created.length;
    if (!got) return;
    setTicks((t) => t.filter((id) => !asked.includes(id)));
    setAt(null);
    tone("call");
    const names = joinNames(res.created.map((c) => rows.find((r) => r.v.s._id === c.studentId)?.v.s.name ?? "?"));
    // His department's lead sends him (8 Nov 2026): she is in the classrooms; with no lead, Correction as before.
    if (!res.rejected.length)
      toast(`Called ${names}. ${res.toLead ? `The ${scope === "fighter" ? "Fighter" : "Master"} lead` : "Correction"} sends ${got === 1 ? "him" : "them"} to you.`);
  };
  const arrive = async (list: ConsultItem[]) => {
    if (list.length === 0) return;
    const res = await act(() => mutate(api.calls.arrive, { callIds: list.map((it) => it.rc.c._id), by: BY }));
    if (!res) return;
    for (const s of res.skipped) toast(`${s}.`, "error");
    if (!res.arrived) return;
    tone("tick");
    setAt(null);
    setFileId(null);
    const names = joinNames(list.map((it) => it.name));
    if (list.length === 1) {
      const callId = list[0].rc.c._id;
      toast(`${names} is here.`, "info", () => void act(() => mutate(api.calls.unarrive, { callId, by: BY })));
    } else toast(`${names} are here.`);
  };
  const cancel = async (it: ConsultItem) => {
    const r = await act(() => mutate(api.calls.cancel, { callIds: [it.rc.c._id], by: BY }));
    if (!r) return;
    setFileId(null);
    tone("clear");
    toast(it.state === "walking" ? `${it.name} didn't come: back in the hall.` : `The call for ${it.name} is cancelled.`);
  };
  /** Done: back to work. Everything she tapped is saved already. */
  const finish = async (list: ConsultItem[]) => {
    if (list.length === 0) return;
    setBusy(true);
    const res = await act(() => mutate(api.calls.finish, { items: list.map((it) => ({ callId: it.rc.c._id })), by: BY }));
    setBusy(false);
    if (!res) return;
    const rest = { ...latestLocals.current };
    for (const it of list) delete rest[it.id];
    latestLocals.current = rest;
    setLocals(rest);
    setAt(null);
    if (list.some((it) => it.id === fileId)) setFileId(null);
    tone("done");
    toast(`${joinNames(list.map((it) => it.name))} back to work.`);
    void reloadAway();
  };

  /** One student's tap on the open question, saved at once (`on` false: the same tap again, back as it was). */
  const save = async (w: ConsultQ["who"][number], what: "x" | "th" | "tt", on: boolean, q: number): Promise<boolean> => {
    const v = w.v;
    if (!v.unit || (v.stage !== "fighter" && v.stage !== "master")) return false;
    const key = qKey(v, q);
    const mine = latestLocals.current[w.it.id] ?? {};
    const wu = q === WHOLE && !!v.ms;
    const res = await act(() =>
      mutate(api.consult.mark, {
        studentId: v.s._id,
        unitId: v.unit!._id,
        stage: v.stage as "fighter" | "master",
        q,
        what: wu ? "wu" : what,
        on,
        ...(!on && mine.was?.[key] ? { was: mine.was[key] } : {}),
        ...(!on && wu && mine.wu?.[bookKey(v)] ? { reteach: mine.wu[bookKey(v)] } : {}),
        by: BY,
      }),
    );
    if (!res) return false;
    // What the undo needs, and a theory book's "→ Theory" (its square says T), kept on this phone for this consultation.
    const now0 = latestLocals.current[w.it.id] ?? {};
    const next: Local = { ...now0, was: { ...now0.was }, fth: { ...now0.fth }, wu: { ...now0.wu } };
    if (on && res.was.length) next.was![key] = res.was;
    if (!on) delete next.was![key];
    if (v.f && what === "th") {
      if (on) next.fth![key] = true;
      else delete next.fth![key];
    }
    if (wu) {
      if (on && res.reteach) next.wu![bookKey(v)] = res.reteach;
      if (!on) delete next.wu![bookKey(v)];
    }
    const merged = { ...latestLocals.current, [w.it.id]: next };
    latestLocals.current = merged;
    setLocals(merged);
    return true;
  };
  // The newest locals while taps are saved one after another (several students on one square).
  const latestLocals = useRef(locals);
  latestLocals.current = locals;

  const setSkip = (w: ConsultQ["who"][number], key: string, on: boolean) => {
    const mine = latestLocals.current[w.it.id] ?? {};
    const skip = { ...mine.skip };
    if (on) skip[key] = true;
    else delete skip[key];
    const next = { ...latestLocals.current, [w.it.id]: { ...mine, skip } };
    latestLocals.current = next;
    setLocals(next);
  };

  /** The pad: that decision for everyone with her who has this question (tap the same again: back); then the next. */
  const allAre = (d: Decision) => withHer.length > 0 && withHer.every((w) => w.state === d);
  const choose = async (d: Decision) => {
    if (!sq || withHer.length === 0 || busy) return;
    clearToasts();
    const undo = allAre(d);
    const target = sq;
    const list = withHer;
    // Show it at once.
    setOpt((o) => {
      const x = { ...o };
      for (const w of list) x[`${w.it.id}|${target.key}`] = undo ? "open" : d;
      return x;
    });
    if (!undo) {
      if (d === "x" || d === "tt") tone("tick");
      const i = qs.findIndex((x) => x.key === target.key);
      const stillOpen = (x: ConsultQ) => x.key !== target.key && x.who.some((w) => w.it.state === "here" && w.state === "open");
      const to = qs.find((x, j) => j > i && stillOpen(x)) ?? qs.find(stillOpen);
      if (to) setAt(to.key);
      else setAt(target.key);
    }
    // Saved in the background, in order (the next question is already open; her phone sends taps one after another).
    for (const w of list) {
      const key = target.key;
      const was = w.state;
      if (undo) {
        if (d === "skip") setSkip(w, key, false);
        else await save(w, d, false, target.q);
        continue;
      }
      if (was === d) continue;
      // Another decision first goes back (one question, one decision), then this one.
      if (was === "skip") setSkip(w, key, false);
      else if (was !== "open" && !(await save(w, was, false, target.q))) continue;
      if (d === "skip") setSkip(w, key, true);
      else await save(w, d, true, target.q);
    }
    setOpt((o) => {
      const x = { ...o };
      for (const w of list) delete x[`${w.it.id}|${target.key}`];
      return x;
    });
  };

  if (views.every((v) => v.where === "absent") && items.length === 0) {
    return (
      <main class="page ev-page evx-page cx-page">
        <NobodyHere />
      </main>
    );
  }

  const theory = kind === "theory";
  const decidable = live && !!sq && withHer.length > 0;
  const canDecide = decidable && !busy;
  const fighterBook = !!sq?.v.f;
  // → Theory: a workbook's question, or a theory book's ladder question (its section goes back to Theory).
  const theoryOk = !!sq && sq.q !== WHOLE && (!!sq.v.ms || (!!sq.v.f && (() => {
    const sec = sq.v.f!.isQuestion(sq.q) ? sq.v.f!.sectionOf(sq.q) : null;
    return !!sec && sec.kind === "ladder" && sec.teach.length > 0;
  })()));
  const file = items.find((it) => it.id === fileId) ?? null;
  const nextSq = () => {
    if (!sq || qs.length < 2) return;
    setAt(qs[(qs.findIndex((x) => x.key === sq.key) + 1) % qs.length].key);
  };

  const strip = () =>
    qs.length > 0 ? (
      <HRow as="ol" class="fc-strip evx-strip" label={theory ? "The questions to teach" : "The questions to explain"} list={`${kind}:${qs.map((x) => x.key).join(",")}`} at={sq?.key}>
        {qs.map((x) => {
          const look = squareLook(x);
          const withHim = x.who.filter((w) => w.it.state === "here").length;
          // A blank ("?" at correction) is a wrong answer in its own colour (8 Nov 2026).
          const blank = !theory && x.q !== WHOLE && isBlank(x.v, x.q) && !look.sign ? " blank" : "";
          return (
            <li key={x.key}>
              <button
                type="button"
                class={`fc-sq${look.cls}${blank}${x.key === sq?.key ? " on" : ""}`}
                aria-current={x.key === sq?.key ? "step" : undefined}
                aria-label={`${sqLabel(x)}: ${withHim ? `${withHim} with you` : "to prepare"}${look.words ? `, ${look.words}` : blank ? ", left blank" : ""}`}
                onClick={() => setAt(x.key)}
              >
                <small>
                  {tag(x)}
                  {x.q === WHOLE && x.v.ms ? "All" : sqLabel(x).replace(/^Q/, "")}
                </small>
                <b>{look.sign || (x.who.length > 1 ? `×${x.who.length}` : "")}</b>
              </button>
            </li>
          );
        })}
      </HRow>
    ) : (
      <p class="muted small evx-hint">
        {live
          ? theory
            ? "Nothing to teach them now: Evaluation above, or talk with them. Then Done."
            : "Nothing to explain to them now: Theory above, or talk with them (a check-in). Then Done."
          : items.length
            ? "They come to you: tap Arrived when they come in."
            : "Tap a name above, then Call: his questions open here, one at a time."}
      </p>
    );
  /** Who has it: with her (✓ once done), else those coming or ticked. */
  const who = !sq
    ? null
    : sq.who.length === 0
      ? tickedRows
          .filter((r) => [r.v, ...r.v.others].some((b) => qKey(b, sq.q) === sq.key))
          .map((r) => (
            <span key={r.v.s._id}>
              {r.v.s.name}
              {!theory && sq.q !== WHOLE && <small> {lostWords([r.v, ...r.v.others].find((b) => qKey(b, sq.q) === sq.key)!, sq.q)}</small>}
            </span>
          ))
      : sq.who.map((w) => (
          <span key={w.it.id} class={w.state !== "open" ? `d d-${w.state === "tt" ? "x" : w.state}` : ""}>
            {w.it.name}
            {!theory && sq.q !== WHOLE && <small> {lostWords(w.v, sq.q)}</small>}
          </span>
        ));
  const answer = (big: boolean) =>
    !sq ? null : sq.q === WHOLE && sq.v.ms ? (
      <p class="fc-anote">The whole unit was asked for Theory: teach what he needs, then Taught.</p>
    ) : sq.v.unit ? (
      <CardAnswer
        unitId={sq.v.unit._id}
        q={sq.q}
        stage={stage}
        noKey={fighterBook && theory ? "The teacher's question of his book: teach it, then the next." : undefined}
        max={big ? 72 : undefined}
        maxH={big ? 210 : undefined}
      />
    ) : (
      <p class="fc-anote">Check his answer in his notebook.</p>
    );
  const notes = sq && !decidable && (
    <p class="muted small evx-note">{sq.who.length > 0 ? "Tap Arrived when he comes in." : "Call him, then Arrived when he comes in."}</p>
  );
  const pad = (layer: boolean) =>
    layer && !decidable && qs.length < 2 ? null : (
      <div class={`fc-pad evx-pad${theory ? " tpx-pad" : ""}`}>
        {(!layer || decidable) && (
          <div class="fc-row2">
            {!theory && (
              <button
                type="button"
                class={`fc-n evx-b th${allAre("th") ? " on" : ""}`}
                disabled={!canDecide || !theoryOk}
                aria-pressed={allAre("th")}
                onClick={() => void choose("th")}
              >
                <b aria-hidden="true">→</b>
                <small>Theory</small>
              </button>
            )}
            <button type="button" class={`fc-n evx-b skip${allAre("skip") ? " on" : ""}`} disabled={!canDecide} aria-pressed={allAre("skip")} onClick={() => void choose("skip")}>
              <small>{theory ? "Not reached" : "Not now"}</small>
            </button>
          </div>
        )}
        {layer && !decidable ? (
          <button type="button" class="fc-go evx-x tm-next" onClick={nextSq}>
            <b>Next question ›</b>
          </button>
        ) : (
          <button
            type="button"
            class={`fc-go evx-x${allAre(theory ? "tt" : "x") ? " on" : ""}`}
            disabled={!canDecide}
            aria-pressed={allAre(theory ? "tt" : "x")}
            onClick={() => void choose(theory ? "tt" : "x")}
          >
            <span aria-hidden="true">✓</span>
            <b>{theory ? "Taught" : "Explained"}</b>
            {n > 1 && <small>for {n}</small>}
          </button>
        )}
      </div>
    );
  const section = sq?.v.f && sq.q !== WHOLE && sq.v.f.isQuestion(sq.q) ? sq.v.f.sectionOf(sq.q) : null;
  const label = sq ? sqLabel(sq) : "";

  return (
    <main class={`page ev-page evx-page cx-page${theory ? " tpx-page" : ""}`}>
      <div class="stick tp-stick ev-stick" ref={stick}>
        {!own && (
          <KindBar<DeptPick>
            value={scope}
            items={(["fighter", "master"] as const).map((d) => {
              // Its students here who need it (red: with no work).
              const t = deptTally(views, d);
              return { id: d, label: d === "fighter" ? "Fighter" : "Master", c: { total: t.students, red: t.red, orange: 0, yellow: 0 }, open: true };
            })}
            onPick={pickDept}
          />
        )}
        {scope === "fighter" && (
          <KindBar<ConsultKind>
            value={kind}
            items={[
              // His words for the Fighter department's two numbers: the students with no work (they need the next
              // theory) and the wrong answers to explain.
              { id: "theory", label: "No work", c: { total: noWork, red: noWork, orange: 0, yellow: 0 }, open: true },
              { id: "evaluation", label: "Evaluation", c: { total: today.evaluation.qs, red: today.evaluation.red, orange: 0, yellow: 0 }, open: true },
            ]}
            onPick={pickKind}
          />
        )}
        {evalOn && (
          // The wrong questions' filter, in fixed places: All (also the levels being corrected now), Past (corrected
          // before today), Today (corrected today: red while any waits, his "no pending of today's").
          <div class="cx-show" role="group" aria-label="Which wrong questions">
            {EVAL_SHOWS.map((x) => {
              const c = byShow[x];
              return (
                <button
                  key={x}
                  type="button"
                  class={`cx-sh${x === showPick ? " on" : ""}${x === "today" && c.qs > 0 ? " red" : ""}`}
                  aria-pressed={x === showPick}
                  aria-label={`${SHOW_WORD[x]}: ${c.qs} wrong questions, ${c.students} students here`}
                  onClick={() => pickShow(x)}
                >
                  {SHOW_WORD[x]} <b>{c.qs}</b>
                </button>
              );
            })}
          </div>
        )}
        {scope === "fighter" && kind === "theory" ? (
          // The Fighter department's No work (his number): who sits idle now, and who needs his next theory.
          <p class="cx-sum" aria-label={`No work: ${noWork} here; ${today.theory.students} need their next theory`}>
            <span>
              No work <b>{noWork}</b> · {today.theory.students} need theory
            </span>
            <span>
              All <b>{all ? all.students : "…"}</b> {all && all.students === 1 ? "student" : "students"}
            </span>
          </p>
        ) : (
          <p class="cx-sum" aria-label={`${theory ? "To teach" : "To explain"}: today ${today[kind].qs} for ${today[kind].students} students here; all ${all ? `${all.qs} for ${all.students} students` : "loading"}`}>
            {/* "Here" and "Everyone" since 12 Nov 2026 (were Today and All: those are the filter's words now). */}
            <span>
              Here <b>{today[kind].qs}</b> · {today[kind].students} {today[kind].students === 1 ? "student" : "students"}
            </span>
            <span>
              Everyone <b>{all ? all.qs : "…"}</b> · {all ? all.students : "…"}
            </span>
          </p>
        )}
      </div>

      <div class="tp-body evx-body">
        <div class="cx-namebox" onPointerDownCapture={held.touch} onScrollCapture={held.touch}>
          {held.list.length === 0 ? (
            <p class="fc-none cx-none">{items.length ? "Everyone else is with a teacher or not here." : "Nobody here to call."}</p>
          ) : (
            <HRow as="nav" class="fc-names cx-names" label={`Students here, the most ${theory ? "to teach" : "to explain"} first`} list={kind} at={ticked[0] ?? null}>
              {held.list.map((r) => {
                const id = r.v.s._id as string;
                const on = ticked.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    class={`fc-nm cx-nm${on ? " on" : ""}${r.red ? " red" : ""}${r.busy ? " cx-busy" : ""}`}
                    data-name={r.v.s.name}
                    data-u={r.red && !r.busy ? "red" : undefined}
                    aria-pressed={on}
                    aria-label={`${r.v.s.name}: ${r.n ? `${r.n} ${theory ? "to teach" : "to explain"}` : "nothing waiting"}${r.red ? ", no work" : ""}${r.busy ? `, with ${r.busy}` : ""}`}
                    onClick={() => toggle(r)}
                  >
                    {r.v.s.name}
                    {r.n > 0 && <i class="cx-n">{r.n}</i>}
                    {r.busy && <small>{r.busy.split(" ")[0]}</small>}
                  </button>
                );
              })}
            </HRow>
          )}
        </div>
        <section class="evx-room" aria-label="Your consultation">
          <div class="evx-box">
            <p class="evx-bh">
              {here.length > 0 && <LockIcon />}
              <b>{here.length} with you</b>
              {items.length > here.length && <span class={items.some((it) => it.late) ? "t-red strong" : "t-evaluation strong"}>{items.length - here.length} coming</span>}
              <span>{left === 0 ? `full (${CAP})` : `room for ${left}`}</span>
              {ticked.length > 0 && (
                <button type="button" class="link-btn evx-reset" onClick={() => setTicks([])}>
                  Clear
                </button>
              )}
            </p>
            <div class="evx-pills" aria-label="Your consultation and who to call">
              {items.map((it) => (
                <button
                  key={it.rc.c._id}
                  type="button"
                  class={`evx-sp ${it.state === "here" ? "s-in" : it.state === "walking" ? "s-walk" : "s-call"}${it.late ? " s-late" : ""}`}
                  data-name={it.name}
                  aria-label={`${it.name}: ${consultWords(it, now)}. His file`}
                  onClick={() => {
                    clearToasts();
                    setFileId(it.id);
                  }}
                >
                  {it.name}
                  {it.state !== "here" && <small>{consultWords(it, now).replace(/^on the way/, "coming")}</small>}
                </button>
              ))}
              {tickedRows.map((r) => (
                <button
                  key={r.v.s._id}
                  type="button"
                  class="evx-sp s-sug on"
                  data-name={r.v.s.name}
                  aria-pressed="true"
                  aria-label={`${r.v.s.name}: to call (tap to untick)`}
                  onClick={() => toggle(r)}
                >
                  {r.v.s.name}
                </button>
              ))}
              {items.length === 0 && ticked.length === 0 && <p class="evx-none">Nobody with you.</p>}
            </div>
          </div>
          <div class="evx-col">
            <button type="button" class="btn evaluation evx-call" disabled={busy || ticked.length === 0} onClick={() => void call()}>
              {left === 0 ? "Full" : ticked.length ? `Call ${ticked.length}` : "Call"}
            </button>
            <button type="button" class="btn evx-arrive" disabled={busy || walkers.length === 0} onClick={() => void arrive(walkers)}>
              Arrived{walkers.length ? ` ${walkers.length}` : ""}
            </button>
            <button type="button" class="btn evx-done" disabled={busy || here.length === 0} onClick={() => void finish(here)}>
              Done{here.length ? ` ${here.length}` : ""}
            </button>
          </div>
        </section>

        {!teaching && strip()}
        {sq && !teaching && (
          <section class="fc-card evx-card" key={sq.key} aria-label={`${label} and its answer`}>
            <CardHead
              label={label}
              n={sq.q === WHOLE && sq.v.ms ? "All" : <QPill label={label} />}
              meta={who}
              metaCls="evx-who"
              shown={sq.q === WHOLE ? undefined : printed}
              onTeach={sq.q === WHOLE ? undefined : () => {
                clearToasts();
                setTeaching(true);
              }}
            />
            {section && theory && <p class="tpx-what">{section.id} · {section.tamil || section.title}</p>}
            <div class="fc-ans">{answer(false)}</div>
            {printed.open && sq.v.unit && sq.q !== WHOLE && <BookQuestion unitId={sq.v.unit._id} stage={stage} q={sq.q} />}
            {notes}
          </section>
        )}
        {!teaching && pad(false)}
      </div>

      {teaching && sq && (
        <TeachMode
          room={theory ? "theory" : "evaluation"}
          title={<LessonName unit={sq.v.unit} section={section} kind={section ? "section" : "workbook"} />}
          at={sq.key}
          strip={strip()}
          pad={pad(true)}
          done={{ n: here.length, busy, onDone: () => void finish(here).then(() => setTeaching(false)) }}
          onClose={() => setTeaching(false)}
        >
          <section class="fc-card evx-card tm-card" key={sq.key} aria-label={`${label} and its answer`}>
            <CardHead label={label} n={<QPill label={label} />} meta={who} metaCls="evx-who" />
            <PrintedQuestion unitId={sq.v.unit?._id} stage={stage} q={sq.q} />
            <div class="fc-ans">{answer(true)}</div>
            {notes}
          </section>
        </TeachMode>
      )}

      {file && (
        <ConsultFile
          it={file}
          now={now}
          drafts={draftRows}
          busy={busy}
          onClose={() => setFileId(null)}
          onArrive={() => void arrive([file])}
          onCancel={() => void cancel(file)}
          onDone={() => void finish([file])}
        />
      )}
    </main>
  );
}

/** One student of her consultation: where he is, what waits in his books; Arrived / Not coming, or Done for him. */
function ConsultFile(props: { it: ConsultItem; now: number; drafts: readonly ConsultDraft[] | null | undefined; busy: boolean; onClose: () => void; onArrive: () => void; onCancel: () => void; onDone: () => void }) {
  const { it, now } = props;
  const v = it.v;
  const lines = bookLines(v, unitNo, props.drafts);
  const foot =
    it.state === "here" ? (
      <div class="row-actions evx-file-acts">
        <button type="button" class="btn evaluation" disabled={props.busy} onClick={props.onDone}>
          Done: back to work
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
    <Sheet title={it.name} sub={consultWords(it, now)} onClose={props.onClose} foot={foot} cls="evx-file">
      {v.unit && (
        <p class="tp-fl">
          <LessonName unit={v.unit} section={null} kind="workbook" />
        </p>
      )}
      {lines.length ? (
        <ul class="tpx-fq">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p class="ev-teaching muted">Nothing waits in his books: a check-in. How is it going?</p>
      )}
      <div class="tp-fx">
        <small>{v.line}</small>
      </div>
    </Sheet>
  );
}
