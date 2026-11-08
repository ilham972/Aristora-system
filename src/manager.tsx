// The Class tab (3 Nov 2026, his call: the Manager page moves to the bottom bar for everyone, named Class; the Manager
// page of 2–3 Nov before: "rooms of the teachers and the hall as rectangles", "the manager can send anyone to any
// place", "everything in one view, no scrolling cards"). Every teacher sees it ("they want to know how many students
// stay without work in the hall"); only managers (the Manager job, the owner) act on it. Rules in src/managerData.ts.
// One screen:
// - Three numbers to bring down: levels to correct · students to explain to · students to teach (red = no work).
//   Tap one: the hall lights who it is.
// - A room per teacher marked here (fixed places, by name), coloured by what she is doing now. Her students as pills:
//   called by her phone (dotted), on his way (dashed: her phone calls her until she taps Arrived), with her (solid).
//   Free: the group the page suggests for her (her name on them: nobody can think "the other one takes him"); a
//   manager's tap on the room sends it. Free while work waits: yellow at 2 min, amber at 5. Never red for a teacher.
// - The team line: the correctors here, and everyone not marked here yet (or gone). Tap a name: her card
//   (src/teacherCard.tsx; her own only, the manager everyone's, with Arrived / Went).
// - The hall: everyone else, A–Z, never moving. Outline red = no work, orange = should go now, yellow = waiting on
//   purpose; a dot = no teacher yet today (1 h here); dashed = quiet (no mark for a while).
// - Tap a student: his strip at the bottom (what he is doing, his day as a bar); a manager's has a button per teacher
//   who can take him (or tap a room, or drag him onto it).

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { isBirthday, slClock } from "../convex/lib/day";
import type { Day, SegKind } from "../convex/lib/timeline";
import { joinNames } from "./announce";
import { fetchOnce, mutate } from "./backend";
import type { View } from "./derive";
import { useQuery } from "./live";
import {
  callFor,
  canTake,
  KIND_WORDS,
  managerPlan,
  needOf,
  pillWords,
  shortNames,
  type HallPill,
  type Job,
  type ManagerPlan,
  type Room,
  type RoomPill,
  type SendTask,
  type Teacher,
  type TaskKind,
} from "./managerData";
import { StageUnitSheet } from "./focus";
import { MoveSheet } from "./move";
import { act, type Board, toast } from "./store";
import { lessonLength, mShort, STAY_MS } from "./theoryFocusData";
import { TeacherCard } from "./teacherCard";
import { tone } from "./tones";

/** The manager's taps go in the history as his. */
const BY = "manager";
/** Her stay today (marked by the manager): open while outAt is null. */
export type Stay = { id: string; inAt: number; outAt: number | null; editedAt: number };
export type TeamRow = {
  _id: string;
  name: string;
  role?: string;
  tabs: string[];
  /** A Fighter or Master lead (8 Nov 2026): she walks to the students, so no room of her own (a chip on the team line). */
  desk?: boolean;
  dept?: string | null;
  lastEnd: number | null;
  stay: Stay | null;
};
type Focus = "correct" | "explain" | "teach" | null;
type Sel = { id: string; call?: string } | null;

const jobsOf = (tabs: string[]): Job[] => (["evaluation", "theory"] as const).filter((j) => tabs.includes(j));
/** Marked here now (the owner on his teaching days always is). */
const isHere = (r: TeamRow) => r.role === "owner" || (!!r.stay && r.stay.outAt === null);

/** The page fills the screen between what is above it and the bottom tabs: the hall scrolls inside, not the page. */
function useFill() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const tabs = document.querySelector(".tabs")?.getBoundingClientRect().height ?? 0;
      const top = el.getBoundingClientRect().top + window.scrollY;
      el.style.height = `${Math.max(360, window.innerHeight - top - tabs)}px`;
    };
    fit();
    window.addEventListener("resize", fit);
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
    ro?.observe(document.body);
    return () => {
      window.removeEventListener("resize", fit);
      ro?.disconnect();
    };
  }, []);
  return ref;
}

export function ManagerPage(props: { board: Board; views: View[]; now: number; canManage: boolean; meId: string }) {
  const { board, views, now, canManage } = props;
  const rows = useQuery<TeamRow[]>(api.people.team, {});
  const recent = useQuery<{ ms: number[] }>(api.calls.lessons, {});
  const [sel, setSel] = useState<Sel>(null);
  // A teacher's card (hers, or anyone's for a manager), or another teacher's strip (what she is doing now).
  const [card, setCard] = useState<TeamRow | null>(null);
  const [look, setLook] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [busy, setBusy] = useState(false);
  const [moving, setMoving] = useState<View | null>(null);
  const [giving, setGiving] = useState<View | null>(null);
  const fill = useFill();
  // The page is one screen: the app's bottom spare space goes (the hall scrolls inside).
  useEffect(() => {
    document.body.classList.add("mg2-on");
    return () => document.body.classList.remove("mg2-on");
  }, []);
  // Rooms: the Theory and Evaluation teachers (and the owner teaching). Correctors sit at the team line.
  const roomRows = (rows ?? []).filter((r) => jobsOf(r.tabs).length > 0 && !r.desk);
  const team: Teacher[] = roomRows.map((r) => ({
    id: r._id,
    name: r.name,
    jobs: jobsOf(r.tabs),
    lastEnd: r.lastEnd,
    inAt: r.stay && r.stay.outAt === null ? r.stay.inAt : null,
    owner: r.role === "owner",
  }));
  const away = new Set(roomRows.filter((r) => !isHere(r)).map((r) => r._id));
  const plan = managerPlan(board, views, now, team, { lessonMs: lessonLength(recent?.ms), away });
  const inClass = views.filter((v) => v.where !== "absent");
  const rowOf = (id: string) => (rows ?? []).find((r) => r._id === id) ?? null;
  // The team line: correctors here (her desk), then everyone not marked here (or gone), A–Z.
  // A Fighter or Master lead walks to the students: her chip there too (no room).
  const desks = (rows ?? []).filter((r) => (jobsOf(r.tabs).length === 0 || r.desk) && r.role !== "owner" && isHere(r));
  const outIds = new Set(plan.away.map((t) => t.id));
  const out = (rows ?? []).filter((r) => r.role !== "owner" && !isHere(r) && (outIds.has(r._id) || jobsOf(r.tabs).length === 0 || !!r.desk));
  /** A teacher tapped: her card (hers; anyone's for a manager), else what she is doing now. */
  const openTeacher = (id: string) => {
    const r = rowOf(id);
    if (!r) return;
    tone("tick");
    setSel(null);
    if (r.role !== "owner" && (canManage || r._id === props.meId)) setCard(r);
    else setLook((x) => (x === id ? null : id));
  };

  // The student he tapped: in the hall, or a pill in a room (its call).
  const hallSel = sel && !sel.call ? plan.hall.find((p) => p.v.s._id === sel.id) : undefined;
  const roomSel = sel?.call ? findPill(plan, sel.call) : undefined;
  useEffect(() => {
    if (sel && !hallSel && !roomSel) setSel(null); // he went home, or into a room: the strip closes
  });

  /** Send these students to her: they walk there, her phone calls her until she taps Arrived. Undo for 2 minutes. */
  const send = async (who: View[], t: Teacher, kind: TaskKind) => {
    const call = callFor(t, kind);
    if (!call) {
      const job = kind === "theory" ? "Theory or Evaluation" : "Evaluation";
      toast(`${t.name} doesn't do ${KIND_WORDS[kind]}. Settings → People → ${t.name} → tick ${job}.`, "error");
      return;
    }
    setBusy(true);
    const books = call.visit
      ? undefined
      : who.flatMap((v) => (v.unit && (v.stage === "fighter" || v.stage === "master") ? [{ studentId: v.s._id, unitId: v.unit._id, stage: v.stage }] : []));
    const res = await act(() =>
      mutate(api.calls.create, {
        studentIds: who.map((v) => v.s._id),
        room: call.room,
        kind: call.kind,
        ...(books ? { books } : {}),
        ...(call.visit ? { visit: true } : {}),
        teacherId: t.id as Id<"users">,
        by: BY,
      }),
    );
    setBusy(false);
    if (!res) return;
    for (const r of res.rejected) toast(`${r.name} ${r.reason}.`, "error");
    const ids = res.created.map((c) => c.callId);
    if (!ids.length) return;
    tone("call");
    // (He may have tapped someone else meanwhile: only the strip of a student who went closes.)
    setSel((s) => (s && who.some((v) => v.s._id === s.id) ? null : s));
    const names = who.filter((v) => res.created.some((c) => c.studentId === v.s._id)).map((v) => v.s.name);
    toast(`${joinNames(names)} → ${t.name}${kind === "visit" ? " (check-in)" : ""}.`, "info", () => {
      void act(() => mutate(api.calls.unsend, { callIds: ids, by: BY })).then((r) => r && toast("Taken back: back in the hall."));
    });
  };
  const sendTask = (t: SendTask) => (t.to ? send(t.who.map((w) => w.v), t.to, t.kind) : undefined);
  /** One student to one room: what he needs now decides what for (lost marks, theory, else a check-in). */
  const sendOne = (v: View, r: Room) => {
    const need = needOf(v);
    void send([need.v], r.t, need.kind);
  };

  /**
   * Tap a room. The manager: the student he tapped goes there; else (free) the group the page suggests; else her card.
   * Everyone else: her card (her own) or what she is doing.
   */
  const tapRoom = (r: Room) => {
    if (!canManage) return openTeacher(r.t.id);
    if (hallSel) return sendOne(hallSel.v, r);
    if (r.free && r.suggest && !busy) return void sendTask(r.suggest);
    openTeacher(r.t.id);
  };

  // ---- Drag a hall student onto a room (hold him, then move): the same as tap him, tap the room ----
  const drag = useRef<{ id: string; x: number; y: number; timer: number; on: boolean; pid: number; el: HTMLElement } | null>(null);
  const [ghost, setGhost] = useState<{ name: string; x: number; y: number; over: string | null } | null>(null);
  // The click that follows a drop on the same hall pill is not a tap.
  const dragged = useRef<{ id: string; at: number } | null>(null);
  const roomAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-room]") as HTMLElement | null)?.dataset.room ?? null;
  const noScroll = (e: TouchEvent) => e.preventDefault();
  const endDrag = () => {
    const d = drag.current;
    if (d) window.clearTimeout(d.timer);
    drag.current = null;
    document.removeEventListener("touchmove", noScroll);
    setGhost(null);
  };
  const onDown = (e: PointerEvent, p: HallPill) => {
    if (!canManage || e.button !== 0 || busy) return;
    const el = e.currentTarget as HTMLElement;
    const d = { id: p.v.s._id, x: e.clientX, y: e.clientY, on: false, pid: e.pointerId, el, timer: 0 };
    d.timer = window.setTimeout(() => {
      if (drag.current !== d) return;
      d.on = true;
      try {
        el.setPointerCapture(d.pid);
      } catch {
        /* the finger already left */
      }
      document.addEventListener("touchmove", noScroll, { passive: false });
      navigator.vibrate?.(25);
      setGhost({ name: p.v.s.name, x: d.x, y: d.y, over: null });
    }, 220);
    drag.current = d;
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (!d.on) {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) endDrag(); // a scroll, not a hold
      return;
    }
    setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY, over: roomAt(e.clientX, e.clientY) } : g));
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.on) {
      dragged.current = { id: d.id, at: Date.now() };
      const id = roomAt(e.clientX, e.clientY);
      const r = plan.rooms.find((x) => x.t.id === id);
      const p = plan.hall.find((x) => x.v.s._id === d.id);
      if (r && p) sendOne(p.v, r);
    }
    endDrag();
  };
  useEffect(() => endDrag, []);

  if (inClass.length === 0) {
    return (
      <div class="mg2" ref={fill}>
        <p class="mg2-empty">Nobody is signed in yet. Sign students in from the count at the top.</p>
      </div>
    );
  }

  const lit = focus ? new Set(plan.counts[focus].ids) : null;
  const pick = (id: string, call?: string) => {
    const dr = dragged.current;
    if (!call && dr && dr.id === id && Date.now() - dr.at < 400) return; // the click after a drop
    tone("tick");
    setLook(null);
    setSel((s) => (s && s.id === id && s.call === call ? null : { id, call }));
  };
  // While a student is picked, the rooms that can take him light up (what he goes for decides): the manager's only.
  const need = hallSel && canManage ? needOf(hallSel.v) : null;
  const looked = look ? (plan.rooms.find((r) => r.t.id === look) ?? null) : null;
  const lookRow = look ? rowOf(look) : null;

  return (
    <div class={`mg2${ghost ? " dragging" : ""}`} ref={fill}>
      <div class="mg2-counts" role="group" aria-label="What waits">
        {(
          [
            ["correct", "to correct", plan.counts.correct],
            ["explain", "to explain", plan.counts.explain],
            ["teach", "to teach", plan.counts.teach],
          ] as const
        ).map(([k, word, c]) => (
          <button
            key={k}
            type="button"
            class={`mg2-n n-${k}${c.n === 0 ? " zero" : ""}${focus === k ? " on" : ""}${c.red ? " red" : ""}`}
            aria-pressed={focus === k}
            aria-label={`${c.n} ${word}${c.red ? `, ${c.red} with no work` : ""}`}
            onClick={() => setFocus(focus === k ? null : k)}
          >
            <b>{c.n}</b>
            <span>{word}</span>
            {c.red > 0 && <small>{c.red} no work</small>}
          </button>
        ))}
      </div>

      <div class={`mg2-rooms n${Math.min(plan.rooms.length, 4)}`}>
        {plan.rooms.map((r) => (
          <RoomBox
            key={r.t.id}
            r={r}
            now={now}
            mine={r.t.id === props.meId}
            target={!!need && canTake(r.t, need.kind)}
            over={ghost?.over === r.t.id}
            selCall={sel?.call}
            onTap={() => tapRoom(r)}
            onName={() => openTeacher(r.t.id)}
            onPill={(p) => pick(p.v.s._id, p.key)}
          />
        ))}
        {plan.rooms.length === 0 && (
          <p class="mg2-note">
            {rows === undefined
              ? "Loading the teachers…"
              : roomRows.length === 0
                ? "No Theory or Evaluation teacher: Settings → People → tick Theory or Evaluation for her."
                : canManage
                  ? "Nobody is marked here yet: tap a name below when she comes."
                  : "No teacher is marked here yet."}
          </p>
        )}
      </div>
      {(desks.length > 0 || out.length > 0) && (
        <div class="mg2-team" role="group" aria-label="Teachers">
          {desks.map((r) => (
            <button
              key={r._id}
              type="button"
              class={`mg2-desk${r._id === props.meId ? " me" : ""}${r.desk ? ` walk ${r.dept ?? ""}` : ""}`}
              aria-label={`${r.name}: ${r.desk ? `${r.dept === "master" ? "Master" : "Fighter"}, walks the classrooms` : "Correction"}, here since ${slClock(r.stay!.inAt)}`}
              onClick={() => openTeacher(r._id)}
            >
              {r.desk ? (
                <i class="mg2-walk" aria-hidden="true">{r.dept === "master" ? "M" : "F"}</i>
              ) : (
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                </svg>
              )}
              {r.name}
            </button>
          ))}
          {out.map((r) => (
            <button
              key={r._id}
              type="button"
              class={`mg2-off${r._id === props.meId ? " me" : ""}`}
              disabled={!canManage && r._id !== props.meId}
              onClick={() => openTeacher(r._id)}
            >
              {r.name} <span>{r.stay?.outAt ? `went ${slClock(r.stay.outAt, false)}` : "not here"}</span>
              {canManage && !r.stay?.outAt && <b>Arrived?</b>}
            </button>
          ))}
        </div>
      )}

      <section class="mg2-hall" aria-label="The hall">
        <div class="mg2-hh">
          <b>Hall</b>
          <span class="mg2-hn">{plan.hall.length}</span>
          <span class="mg2-legend" aria-hidden="true">
            <i class="lg h-red" />
            no work <i class="lg h-orange" />
            send <i class="lg h-yellow" />
            waits <i class="lg-dot" />
            no teacher yet
          </span>
        </div>
        <div class="mg2-hp" onPointerMove={(e) => onMove(e as unknown as PointerEvent)} onPointerUp={(e) => onUp(e as unknown as PointerEvent)} onPointerCancel={endDrag}>
          {plan.hall.map((p) => (
            <button
              key={p.v.s._id}
              type="button"
              data-name={p.v.s.name}
              class={`mg2-p${p.heat ? ` h-${p.heat}` : ""}${p.noTeacher ? " nt" : ""}${p.quiet ? " qt" : ""}${p.offApp ? " off" : ""}${p.finished ? " fin" : ""}${sel && !sel.call && sel.id === p.v.s._id ? " on" : ""}${lit && !lit.has(p.v.s._id) ? " dim" : ""}`}
              aria-pressed={!!sel && !sel.call && sel.id === p.v.s._id}
              aria-label={`${p.v.s.name}: ${hallWords(p, now)}`}
              onPointerDown={(e) => onDown(e as unknown as PointerEvent, p)}
              onClick={() => pick(p.v.s._id)}
            >
              {p.v.s.name}
              {isBirthday(p.v.s.bday, now) && <span class="bday-tag"> 🎂</span>}
              {p.heat === "red" && p.v.idleMs !== undefined && p.v.idleMs >= 60_000 && <small>{mShort(p.v.idleMs)}</small>}
            </button>
          ))}
          {plan.hall.length === 0 && <p class="mg2-note">Everyone is with a teacher or on the way.</p>}
        </div>
      </section>

      {hallSel && (
        <HallStrip
          p={hallSel}
          plan={plan}
          now={now}
          busy={busy}
          canManage={canManage}
          onSend={(r) => sendOne(hallSel.v, r)}
          onMove={() => setMoving(hallSel.v)}
          onGive={() => setGiving(hallSel.v.home ?? hallSel.v)}
          onClose={() => setSel(null)}
        />
      )}
      {roomSel && (
        <RoomStrip
          r={roomSel.r}
          p={roomSel.p}
          now={now}
          busy={busy}
          canManage={canManage}
          setBusy={setBusy}
          // The answer comes a moment later: if he tapped someone else meanwhile, that strip stays.
          onClose={() => setSel((s) => (s?.call === roomSel.p.key ? null : s))}
        />
      )}
      {ghost && (
        <div class="mg2-ghost" style={{ left: `${ghost.x}px`, top: `${ghost.y}px` }} aria-hidden="true">
          {ghost.name}
        </div>
      )}
      {!sel && lookRow && <TeacherStrip row={lookRow} r={looked} now={now} onClose={() => setLook(null)} />}
      {moving && <MoveSheet v={moving} onClose={() => setMoving(null)} />}
      {giving && <StageUnitSheet v={giving} mode="given" onClose={() => setGiving(null)} />}
      {card && (
        <TeacherCard
          userId={card._id}
          name={card.name}
          canManage={canManage}
          stay={rowOf(card._id)?.stay ?? null}
          onClose={() => setCard(null)}
        />
      )}
    </div>
  );
}

function findPill(plan: ManagerPlan, call: string): { r: Room; p: RoomPill } | undefined {
  for (const r of plan.rooms) {
    const p = r.pills.find((x) => x.key === call);
    if (p) return { r, p };
  }
  return undefined;
}

/** A hall student in a few words, for a screen reader and his strip. */
function hallWords(p: HallPill, now: number): string {
  const bits: string[] = [];
  if (p.heat === "red") bits.push(p.v.idleMs !== undefined && p.v.idleMs >= 60_000 ? `no work ${mShort(p.v.idleMs)}` : "no work");
  else if (p.heat === "orange") bits.push(`send now: ${p.task?.who.find((w) => w.v.s._id === p.v.s._id)?.why ?? ""}`);
  else if (p.held) bits.push(p.held.why);
  if (p.noTeacher) bits.push(`no teacher yet, here ${mShort(now - (p.v.s.lastInAt ?? now))}`);
  if (p.quiet) bits.push(`no mark for ${mShort(p.v.quietMs ?? 0)}`);
  if (p.offApp) bits.push("on paper");
  if (p.finished) bits.push("finished his book");
  return bits.join(" · ") || p.v.line;
}

// ---------------- A teacher's room ----------------

function roomState(r: Room, now: number): string {
  if (r.free) return r.freeSince === null || now - r.freeSince < 60_000 ? "free" : `free ${mShort(now - r.freeSince)}`;
  if (r.since === null) return r.pills.some((p) => p.state === "walking") ? "coming" : "called";
  const spent = now - r.since;
  const left = r.over ? "over" : r.leftMs ? `~${mShort(Math.max(60_000, r.leftMs))} left` : "";
  return [spent >= 60_000 ? mShort(spent) : "", left].filter(Boolean).join(" · ") || "now";
}

/** "Theory D · no work", "Evaluation · 2", "Check-in · 3": what the suggested group is for (the names follow). */
function sugWords(t: SendTask): string {
  const what = `${KIND_WORDS[t.kind]}${t.section ? ` ${t.section}` : ""}`;
  if (t.who.some((w) => w.red)) return `${what} · no work`;
  if (t.ahead) return `${what} · ahead`;
  return t.who.length > 1 ? `${what} · ${t.who.length}` : what;
}

/** "Theory D", "Evaluation", "Check-in": what she is doing (her room's colour). */
function doingWords(r: Room): string {
  if (!r.doing) return "";
  if (r.doing !== "theory") return KIND_WORDS[r.doing];
  const sec = r.pills.find((p) => p.state === "here" && p.kind === "theory")?.rc.c.section;
  return sec && sec !== "R" ? `Theory ${sec}` : "Theory";
}

function RoomBox(props: {
  r: Room;
  now: number;
  /** This phone's own room (her name underlined: her card). */
  mine: boolean;
  target: boolean;
  over: boolean;
  selCall?: string;
  onTap: () => void;
  onName: () => void;
  onPill: (p: RoomPill) => void;
}) {
  const { r, now } = props;
  const cls = [
    "mg2-room",
    `d-${r.doing ?? (r.free ? "free" : "coming")}`,
    r.alarm ? `a-${r.alarm}` : "",
    props.target ? "target" : "",
    props.over ? "over" : "",
    r.away ? "away" : "",
    props.mine ? "mine" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const sug = r.free ? r.suggest : null;
  return (
    <div
      class={cls}
      data-room={r.t.id}
      role="button"
      tabIndex={0}
      aria-label={`${r.t.name}: ${roomState(r, now)}${sug ? `, suggested ${joinNames(sug.who.map((w) => w.v.s.name))}` : ""}`}
      onClick={props.onTap}
      onKeyDown={(e) => {
        if (e.key === "Enter") props.onTap();
      }}
    >
      <div class="mg2-rh">
        <button
          type="button"
          class="mg2-rn"
          aria-label={`${r.t.name}${props.mine ? ": your card" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            props.onName();
          }}
        >
          {r.t.name}
        </button>
        <span>{roomState(r, now)}</span>
      </div>
      {r.doing && <div class="mg2-rd">{doingWords(r)}</div>}
      {r.note && <div class="mg2-note-r">{r.note}</div>}
      {r.pills.length > 0 && (
        <div class="mg2-rp">
          {r.pills.map((p) => (
            <button
              key={p.key}
              type="button"
              data-name={p.v.s.name}
              class={`mg2-sp s-${p.state} mk-${p.kind}${p.late ? " late" : ""}${props.selCall === p.key ? " on" : ""}`}
              aria-label={`${p.v.s.name}: ${pillWords(p)}`}
              onClick={(e) => {
                e.stopPropagation();
                props.onPill(p);
              }}
            >
              {p.v.s.name}
            </button>
          ))}
        </div>
      )}
      {sug && (
        <div class={`mg2-sug h-${sug.heat} mk-${sug.kind}`}>
          <span class="mg2-sw">{sugWords(sug)}</span>
          <span class="mg2-sn">→ {shortNames(sug.who.map((w) => w.v.s.name))}</span>
        </div>
      )}
      {r.free && !sug && <div class="mg2-sug none">nothing for her now</div>}
    </div>
  );
}

// ---------------- His strip (the student he tapped) ----------------

const SEG_WORDS: Record<SegKind, string> = {
  work: "working",
  idle: "no work",
  walk: "walking",
  theory: "Theory",
  evaluation: "Evaluation",
  visit: "check-in",
};

/** His day as a bar: from his sign-in to his usual home time (2 h), what each part was. Read once, then every 30 s. */
function DayBar(props: { v: View; now: number }) {
  const { v } = props;
  const [day, setDay] = useState<Day | null>(null);
  useEffect(() => {
    let live = true;
    const load = () =>
      void fetchOnce(api.manager.day, { studentId: v.s._id })
        .then((d) => {
          if (live) setDay(d);
        })
        .catch(() => undefined);
    load();
    const id = window.setInterval(load, 30_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [v.s._id]);
  if (!day || day.from === null) return <div class="mg2-day wait" />;
  const from = day.from;
  const end = Math.max(props.now, from + STAY_MS);
  const span = Math.max(1, end - from);
  const pct = (t: number) => `${(((t - from) / span) * 100).toFixed(2)}%`;
  return (
    <div class="mg2-dayw">
      <div class="mg2-day" role="img" aria-label={`His day: ${day.segs.map((s) => `${SEG_WORDS[s.kind]} ${mShort(s.to - s.from)}`).join(", ")}`}>
        {day.segs.map((s) => (
          <i key={s.from} class={`g-${s.kind}`} style={{ left: pct(s.from), width: `${(((s.to - s.from) / span) * 100).toFixed(2)}%` }} />
        ))}
        <b class="mg2-now" style={{ left: pct(Math.min(props.now, end)) }} />
      </div>
      <div class="mg2-dayl">
        <span>{slClock(from, false)}</span>
        <span class="mg2-dayt">
          {day.contacts ? `teachers ${mShort(day.teacherMs)} (${day.contacts}×)` : "no teacher yet"}
          {day.idleMs >= 60_000 ? ` · no work ${mShort(day.idleMs)}` : ""}
        </span>
        <span>home {slClock(from + STAY_MS, false)}</span>
      </div>
    </div>
  );
}

function HallStrip(props: {
  p: HallPill;
  plan: ManagerPlan;
  now: number;
  busy: boolean;
  /** The manager: a button per teacher who can take him, Give a book, Move him on. Everyone else only looks. */
  canManage: boolean;
  onSend: (r: Room) => void;
  onMove: () => void;
  onGive: () => void;
  onClose: () => void;
}) {
  const { p, plan, now } = props;
  // Every teacher who could take him is busy: he needn't sit. Another book, and he works until one is free.
  const allBusy = plan.rooms.every((r) => r.away || !r.free);
  const need = needOf(p.v);
  const suggested = p.task?.to?.id;
  const rooms = plan.rooms.filter((r) => !r.away && canTake(r.t, need.kind));
  const why = hallWords(p, now);
  return (
    <section class="mg2-strip" aria-label={p.v.s.name}>
      <div class="mg2-sh">
        <b>{p.v.s.name}</b>
        <span class="mg2-sl">{p.v.line}</span>
        <button type="button" class="mg2-x" aria-label="Close" onClick={props.onClose}>
          ×
        </button>
      </div>
      {why !== p.v.line && <p class={`mg2-why${p.heat ? ` h-${p.heat}` : ""}`}>{why}</p>}
      <DayBar v={p.v} now={now} />
      {props.canManage && p.heat === "red" && allBusy && (
        <p class="mg2-why mg2-busy">Every teacher is busy: give him a book; he works on it until one is free.</p>
      )}
      {props.canManage && (
      <div class="mg2-acts">
        {p.finished && (
          <button type="button" class="btn small" onClick={props.onMove}>
            Move him on
          </button>
        )}
        {(p.heat === "red" || p.finished) && (
          <button type="button" class={`btn small mg2-give${p.heat === "red" && allBusy ? "" : " ghost"}`} onClick={props.onGive}>
            Give a book
          </button>
        )}
        {rooms.map((r) => (
          <button
            key={r.t.id}
            type="button"
            class={`btn small mg2-to mk-${need.kind}${r.t.id === suggested ? " best" : " ghost"}`}
            disabled={props.busy}
            onClick={() => props.onSend(r)}
          >
            <b>→ {r.t.name}</b>
            <small>{r.free ? KIND_WORDS[need.kind] : `busy · ${roomState(r, now)}`}</small>
          </button>
        ))}
        {rooms.length === 0 && <span class="mg2-note">Nobody here does {KIND_WORDS[need.kind]}.</span>}
      </div>
      )}
    </section>
  );
}

function RoomStrip(props: {
  r: Room;
  p: RoomPill;
  now: number;
  busy: boolean;
  /** The manager: Send now, He's with her, Back to the hall, Undo. Everyone else only looks. */
  canManage: boolean;
  setBusy: (b: boolean) => void;
  onClose: () => void;
}) {
  const { r, p, now } = props;
  const [sure, setSure] = useState(false);
  const c = p.rc.c;
  const run = async (fn: () => Promise<unknown>, done: string) => {
    props.setBusy(true);
    const res = await act(fn);
    props.setBusy(false);
    if (res === undefined) return;
    tone("tick");
    toast(done);
    props.onClose();
  };
  const name = p.v.s.name;
  const undo = !!c.byManager && c.sentAt !== undefined && now - c.sentAt < 2 * 60_000 && p.state === "walking";
  return (
    <section class="mg2-strip" aria-label={name}>
      <div class="mg2-sh">
        <b>{name}</b>
        <span class="mg2-sl">
          {p.state === "called" ? `called by ${r.t.name}` : p.state === "walking" ? `on his way to ${r.t.name}` : `with ${r.t.name}`} · {pillWords(p)}
        </span>
        <button type="button" class="mg2-x" aria-label="Close" onClick={props.onClose}>
          ×
        </button>
      </div>
      {p.state === "walking" && p.late && <p class="mg2-why h-amber">{r.t.name} hasn't tapped Arrived. Is he there? Tell her.</p>}
      <DayBar v={p.v} now={now} />
      {props.canManage && (
      <div class="mg2-acts">
        {p.state === "called" && (
          <>
            <button type="button" class="btn small" disabled={props.busy} onClick={() => void run(() => mutate(api.calls.send, { callIds: [c._id], by: BY }), `${name} → ${r.t.name}.`)}>
              Send now
            </button>
            <button type="button" class="btn small ghost" disabled={props.busy} onClick={() => void run(() => mutate(api.calls.decline, { callId: c._id, by: BY }), `${name}: not now.`)}>
              Not now
            </button>
          </>
        )}
        {p.state === "walking" && (
          <button type="button" class="btn small" disabled={props.busy} onClick={() => void run(() => mutate(api.calls.arrive, { callIds: [c._id], by: BY }), `${name} is with ${r.t.name}.`)}>
            He's with her
          </button>
        )}
        {undo && (
          <button type="button" class="btn small ghost" disabled={props.busy} onClick={() => void run(() => mutate(api.calls.unsend, { callIds: [c._id], by: BY }), `Taken back: ${name} is in the hall.`)}>
            Undo
          </button>
        )}
        {p.state === "walking" && !undo && (
          <button type="button" class="btn small ghost" disabled={props.busy} onClick={() => void run(() => mutate(api.calls.cancel, { callIds: [c._id], by: BY }), `${name}: back in the hall.`)}>
            Back to the hall
          </button>
        )}
        {p.state === "here" &&
          (sure ? (
            <button type="button" class="btn small danger" disabled={props.busy} onClick={() => void run(() => mutate(api.calls.release, { studentId: p.v.s._id, by: BY }), `${name}: back in the hall.`)}>
              Yes: back, nothing marked
            </button>
          ) : (
            <button type="button" class="btn small ghost" onClick={() => setSure(true)}>
              Back to the hall
            </button>
          ))}
        {p.state === "here" && <span class="mg2-note">{r.t.name} taps Done on her phone.</span>}
      </div>
      )}
    </section>
  );
}

/**
 * Another teacher tapped (3 Nov 2026, his ask: "when they press any teacher they can see what's going on"): what she is
 * doing now, since when she is here, her students. Never her numbers (her card is hers and the manager's).
 */
function TeacherStrip(props: { row: TeamRow; r: Room | null; now: number; onClose: () => void }) {
  const { row, r, now } = props;
  const here = row.role === "owner" ? null : row.stay;
  const since = here ? (here.outAt === null ? `here since ${slClock(here.inAt, false)}` : `went ${slClock(here.outAt, false)}`) : row.role === "owner" ? "" : "not marked here";
  const doing = r ? [doingWords(r), roomState(r, now)].filter(Boolean).join(" · ") : jobsOf(row.tabs).length ? "" : "Correction";
  return (
    <section class="mg2-strip" aria-label={row.name}>
      <div class="mg2-sh">
        <b>{row.name}</b>
        <span class="mg2-sl">{[since, doing].filter(Boolean).join(" · ")}</span>
        <button type="button" class="mg2-x" aria-label="Close" onClick={props.onClose}>
          ×
        </button>
      </div>
      {r && r.pills.length > 0 && (
        <p class="mg2-why">{r.pills.map((p) => `${p.v.s.name}: ${pillWords(p)}`).join(" · ")}</p>
      )}
      {r?.free && r.suggest && (
        <p class="mg2-why">
          For {row.name} now: {joinNames(r.suggest.who.map((w) => w.v.s.name))}
        </p>
      )}
    </section>
  );
}
