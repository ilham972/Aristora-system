// Correction's ⌂ lane (5 Nov 2026, his voice note: "within one day I get 42 photos ... very hard to check each question
// one by one ... each individual sub question, I want to put the marks ... rotation button"): the photos students send
// from home (the family app), marked inside Correction. His answers: inside Correction, in a lane of its own (the hall's
// names mean "a boy is sitting here waiting": home photos never light them up), only the owner and the people he ticks
// for Photos (Settings → People → Also), build it now.
// - ⌂ on the names row (after +, always in the same place; its count = questions waiting, red after a day) switches the
//   names row to the students with photos waiting, oldest first; again = back to the hall. Someone with Photos but not
//   the Correction job sees only this lane. The grades row keeps its places; its badges count students with photos.
// - A name opens his photos, oldest level first, one question at a time on Correction's card: his photos big (↻ turns
//   one, a tap = full screen, a tap there = 2×), each part with the key's answer, what he typed and its own marks (a
//   part question: the parts the phone left, nothing lit until she taps; his working on a wrong answer: the phone's
//   marks lit, change them when his working earns more), her words. Retake and Save at the bottom like Correction's
//   pad. Save → the next question, the next level, then the next student by itself.
// - A photo is for correction only (6 Nov 2026, his rule): no "why it was wrong", nothing counts as explained (every
//   lost question waits for Evaluation in class). A level the class corrected (his paper) closes its photos by itself;
//   one still on a card only closes.
// - Server: convex/photos.ts (`lane`, `student`, `mark`, `retake`, `question`); Settings → Photos keeps the count, the
//   owner's "Photos required" switch and a button here (src/photoQueue.tsx).

import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { HomePart, LaneRow, PhotoItem } from "../convex/photos";
import { ASK_MAX, NOTE_MAX, PHOTO_LATE_MS, RETAKE, VOICE_ONLY, type RetakeWhy } from "../convex/lib/photos";
import { errorText, mutate, subscribe, upload } from "./backend";
import { BigAnswer } from "./bigAnswer";
import { BookQuestion, useQuestionShown } from "./bookQuestion";
import { TAP_GUARD_MS } from "./focusData";
import { HRow } from "./hrow";
import { useQuery } from "./live";
import type { View } from "./derive";
import { CardHead } from "./qcard";
import { now as serverNow, toast } from "./store";
import { tone } from "./tones";
import { VoicePlay, VoiceRec, type Voice } from "./voiceNote";

// ---- What the lane remembers while the app is open (a reload starts in the hall) ----

type LaneState = { on: boolean; student: string | null; level: string | null; at: string | null };
let lane: LaneState = { on: false, student: null, level: null, at: null };
const subs = new Set<() => void>();

function setLane(next: Partial<LaneState>) {
  lane = { ...lane, ...next };
  for (const f of subs) f();
}

export function useLaneState(): LaneState {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return lane;
}

/** ⌂ on or off (the hall's paper is left first: `Focus`). */
export const setLaneOn = (on: boolean) => setLane({ on });
/** Settings → Photos' button: Correction opens on the lane. */
export const openLane = () => setLane({ on: true });
/** A name in the lane: his photos, from his oldest level. */
export const openStudent = (id: string | null) => setLane({ student: id, level: null, at: null });

/**
 * Questions she answered here (this visit): they keep their square, with her marks, while his level has more. By the
 * photo's row and when it was sent: a photo asked again comes back in the same row, sent later (`family.photoSend`).
 */
type Done = { id: string; at: number; studentId: string; level: string; q: number; kind: PhotoItem["kind"]; total: number | null; max: number };
const answered = (x: PhotoItem) => doneHere.get(x.id)?.at === x.at;
const doneHere = new Map<string, Done>();
/** How far each photo is turned (↻), by question and photo. */
const turns = new Map<string, number>();
/** Each photo's own size (for turning it inside its box). */
const sizes = new Map<string, { w: number; h: number }>();

/** When he sent it (7 Nov 2026, his ask: "uploaded time ... for teachers"): "sent just now", "sent 2 h ago". */
const agoWords = (t: number) => (serverNow() - t < 60_000 ? "just now" : `${ago(t)} ago`);
const sentWords = (t: number) => `sent ${agoWords(t)}`;

export function ago(t: number): string {
  const min = Math.max(0, Math.round((serverNow() - t) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} days`;
}

/** A student in the lane: his name and grade from the board, his photos' count and oldest from the server. */
export type LaneStudent = { id: string; name: string; grade: number | null; n: number; at: number };

export const isLate = (s: { at: number }) => serverNow() - s.at > PHOTO_LATE_MS;

/**
 * Every student with photos waiting, oldest first (Photos people only; nothing asked for anyone else). Students the
 * board doesn't have (removed: the hourly sweep closes their photos) are left out.
 */
export function useLaneList(allowed: boolean, views: View[]): LaneStudent[] | undefined {
  const [rows, setRows] = useState<LaneRow[] | undefined>(undefined);
  useEffect(() => {
    if (!allowed) return;
    return subscribe(
      api.photos.lane,
      {},
      (x) => setRows(x),
      () => setRows(undefined),
    );
  }, [allowed]);
  if (!allowed || !rows) return undefined;
  const byId = new Map(views.map((v) => [v.s._id as string, v.s]));
  return rows.flatMap((r) => {
    const s = byId.get(r.id);
    return s ? [{ id: r.id as string, name: s.name, grade: s.grade ?? null, n: r.n, at: r.at }] : [];
  });
}

/** Each grade's students with photos (the grades row's badges in the lane). */
export function laneGrades(list: LaneStudent[] | undefined): Map<number, { n: number; late: boolean }> {
  const out = new Map<number, { n: number; late: boolean }>();
  for (const s of list ?? []) {
    if (s.grade === null) continue;
    const g = out.get(s.grade) ?? { n: 0, late: false };
    out.set(s.grade, { n: g.n + 1, late: g.late || isLate(s) });
  }
  return out;
}

// ---- The names row's ⌂ and the lane's names ----

/** ⌂ after + on the names row: the questions waiting (red when one waited over a day); dark while the lane is on. */
export function HomeButton(props: { list: LaneStudent[] | undefined; on: boolean; locked: boolean; onTap: () => void }) {
  const n = (props.list ?? []).reduce((s, x) => s + x.n, 0);
  const late = (props.list ?? []).some(isLate);
  return (
    <button
      type="button"
      class={`hl-btn${props.on ? " on" : n ? (late ? " late" : " wait") : ""}`}
      aria-pressed={props.on}
      disabled={props.locked}
      aria-label={`${props.on ? "Back to the hall" : "Photos from home"}${n ? `: ${n} to mark${late ? ", one waited over a day" : ""}` : ": none waiting"}`}
      onClick={props.onTap}
    >
      <span aria-hidden="true">⌂</span>
      {n > 0 && (
        <b class="hl-btn-n" aria-hidden="true">
          {n > 99 ? "99+" : n}
        </b>
      )}
    </button>
  );
}

/** The names row in the lane: this grade's students with photos, oldest first (red: waiting over a day). */
export function HomeNames(props: { list: LaneStudent[] | undefined; grade: number; openId: string | null }) {
  const shown = (props.list ?? []).filter((s) => s.grade === props.grade);
  if (props.list === undefined) return <p class="fc-none">Loading the photos…</p>;
  if (shown.length === 0) return <p class="fc-none">No photos from Grade {props.grade}.</p>;
  return (
    <HRow as="nav" class="fc-names" label={`Grade ${props.grade}: photos from home, oldest first`} list={`home${props.grade}`} at={props.openId}>
      {shown.map((s) => {
        const on = s.id === props.openId;
        const tone = isLate(s) ? "red" : "amber";
        return (
          <button
            key={s.id}
            type="button"
            class={`fc-nm ${tone}${on ? " on" : ""}`}
            data-u={tone}
            aria-pressed={on}
            aria-label={`${s.name}: ${s.n} to mark from home, since ${ago(s.at)}`}
            onClick={() => openStudent(s.id)}
          >
            {s.name}
            <i class="fc-nm-n" aria-hidden="true">
              {s.n}
            </i>
          </button>
        );
      })}
    </HRow>
  );
}

// ---- The lane's page ----

/**
 * Under the pinned rows: his photos (a name open) or how many wait. A student with nothing left: the next one by
 * himself (this grade first, oldest first), else "every photo is marked".
 */
export function LaneBody(props: { list: LaneStudent[] | undefined; grade: number | null; onGrade: (g: number) => void }) {
  const st = useLaneState();
  const { list } = props;
  const next = (gone: string) => {
    const left = (list ?? []).filter((s) => s.id !== gone);
    const pick = left.find((s) => s.grade === props.grade) ?? left[0] ?? null;
    const was = list?.find((s) => s.id === gone)?.name;
    openStudent(pick ? pick.id : null);
    if (pick && pick.grade !== null && pick.grade !== props.grade) props.onGrade(pick.grade);
    toast(pick ? `${was ? `${was} done. ` : ""}Next: ${pick.name}.` : "Every photo from home is marked.");
  };
  if (st.student) {
    const s = list?.find((x) => x.id === st.student);
    return <HomePaper key={st.student} studentId={st.student} name={s?.name ?? ""} onEmpty={() => next(st.student!)} />;
  }
  const total = (list ?? []).reduce((a, x) => a + x.n, 0);
  const oldest = list?.[0];
  return (
    <section class="hl-idle" aria-label="Photos from home">
      <b class={oldest && isLate(oldest) ? "late" : ""}>
        {list === undefined ? "Loading…" : total === 0 ? "No photos waiting" : `${total} to mark · oldest ${ago(oldest!.at)}`}
      </b>
      <p class="muted small">
        From the family app: drawings, parts the phone can't mark, and the working on wrong answers. Tap a name: his photos
        open, one question at a time, each part with its own marks. <b>⌂</b> again = back to the hall. A photo goes a day
        after it is marked.
      </p>
    </section>
  );
}

type Row = { id: string; q: number; kind: PhotoItem["kind"]; it: PhotoItem | null; done: Done | null };
type Lvl = { key: string; it: PhotoItem; rows: Row[]; waiting: number };

const levelKey = (it: { unit: { id: string }; n: number }) => `${it.unit.id}:${it.n}`;

/** His levels with photos (the server's order) and each level's questions (waiting, and answered here). */
function levelsOf(items: PhotoItem[], studentId: string): Lvl[] {
  const out: Lvl[] = [];
  for (const it of items) {
    const key = levelKey(it);
    let l = out.find((x) => x.key === key);
    if (!l) out.push((l = { key, it, rows: [], waiting: 0 }));
    l.rows.push({ id: it.id, q: it.q, kind: it.kind, it, done: null });
    l.waiting++;
  }
  for (const d of doneHere.values()) {
    if (d.studentId !== studentId || items.some((x) => x.id === d.id)) continue;
    // A level he has nothing left in goes (the paper moves on); one with questions left keeps her squares.
    out.find((x) => x.key === d.level)?.rows.push({ id: d.id, q: d.q, kind: d.kind, it: null, done: d });
  }
  for (const l of out) l.rows.sort((a, b) => a.q - b.q || (a.kind === "part" ? -1 : 1));
  return out;
}

/** One student's photos: his levels, the open level's questions, one question at a time. */
function HomePaper(props: { studentId: string; name: string; onEmpty: () => void }) {
  const all = useQuery<PhotoItem[]>(api.photos.student, { studentId: props.studentId as Id<"students"> });
  const st = useLaneState();
  // One she just answered is gone at once (the server's list follows a moment later): never the old card again.
  const items = all?.filter((x) => !answered(x));
  const empty = items !== undefined && items.length === 0;
  useEffect(() => {
    if (empty) props.onEmpty();
  }, [empty]);
  // The next question: back up to its squares, so his photo shows from its top (she had scrolled down to the pad).
  const loading = items === undefined;
  useLayoutEffect(() => {
    const strip = document.querySelector<HTMLElement>(".hl-paper .fc-strip");
    if (!strip) return;
    const stick = document.querySelector<HTMLElement>(".fc-stick");
    const dy = strip.getBoundingClientRect().top - ((stick ? stick.getBoundingClientRect().bottom : 0) + 4);
    if (dy >= 0) return;
    if (typeof window.scrollBy === "function") window.scrollBy({ top: dy, behavior: "smooth" });
    else window.scrollTo(0, window.scrollY + dy);
  }, [st.at, loading]);
  if (items === undefined) return <p class="fc-hint">Loading {props.name ? `${props.name}'s` : "his"} photos…</p>;
  if (items.length === 0) return <p class="fc-hint">Nothing left from {props.name || "him"}.</p>;
  const levels = levelsOf(items, props.studentId);
  // The open question: hers, if it still waits; else the first waiting one of the open level, else of his first level.
  const cur = items.find((x) => x.id === st.at) ?? null;
  const lvl = (cur && levels.find((l) => l.key === levelKey(cur))) ?? levels.find((l) => l.key === st.level && l.waiting > 0) ?? levels[0];
  const open = cur ?? lvl.rows.find((r) => r.it)!.it!;
  const rows = lvl.rows;
  const at = rows.findIndex((r) => r.id === open.id);
  const waiting = rows.filter((r) => r.it);
  // After hers: the next waiting one, this level first, then his next levels, then back round to any she skipped.
  const order = levels.flatMap((l) => l.rows.flatMap((r) => (r.it ? [r.it] : [])));
  const after = order.length > 1 ? order[(order.findIndex((x) => x.id === open.id) + 1) % order.length] : null;
  const prev = at > 0 ? rows.slice(0, at).reverse().find((r) => r.it)?.it ?? null : null;
  const many = new Set(levels.map((l) => l.it.unit.id)).size > 1;
  const go = (it: PhotoItem) => setLane({ level: levelKey(it), at: it.id });
  const hc = open.hc;
  return (
    <div class="fc-paper hl-paper">
      <HRow class="fc-lvbar hl-lvbar" label={`${props.name}'s levels with photos`} list={props.studentId} at={lvl.key}>
        {levels.map((l) => {
          const on = l.key === lvl.key;
          return (
            <button
              key={l.key}
              type="button"
              class={`fc-lb hl-lb${on ? " on" : ""}`}
              aria-pressed={on}
              aria-label={`${l.it.unit.key.replace(/^G\d+-/, "")} Level ${l.it.n}: ${l.waiting} to mark`}
              onClick={() => go(l.rows.find((r) => r.it)!.it!)}
            >
              {many ? `${unitShort(l.it.unit.key)}·${l.it.n}` : l.it.n}
            </button>
          );
        })}
      </HRow>
      <p class="fc-lvline hl-lvline">
        <b>Level {lvl.it.n}</b> · {lvl.it.unit.key.replace(/^G\d+-/, "")} {lvl.it.unit.ta} · {waiting.length} to mark
        {hc ? " · checked in class" : ""}
      </p>
      <HRow as="ol" class="fc-strip" label="His questions with photos in this level" list={lvl.key} at={open.id}>
        {rows.map((r) => {
          const on = r.id === open.id;
          const d = r.done;
          const look = d ? (d.total === null ? " hl-sq-back" : d.total >= d.max ? " full" : d.total === 0 ? " zero" : " part") : "";
          return (
            <li key={r.id}>
              <button
                type="button"
                class={`fc-sq${look}${on ? " on" : ""}`}
                aria-current={on ? "step" : undefined}
                aria-label={`Q${r.q}: ${d ? (d.total === null ? "photo asked again" : `marked ${d.total} of ${d.max}`) : r.kind === "working" ? "wrong answer, to look at" : "to mark"}`}
                disabled={!r.it}
                onClick={() => r.it && go(r.it)}
              >
                <small>{r.q}</small>
                <b>{d ? (d.total === null ? "R" : d.total) : ""}</b>
              </button>
            </li>
          );
        })}
      </HRow>
      <HomeCard
        key={open.id}
        it={open}
        back={prev ? { label: `Q${prev.q}`, short: String(prev.q), go: () => go(prev) } : null}
        hasNext={!!after}
        onDone={(total) => {
          doneHere.set(open.id, { id: open.id, at: open.at, studentId: props.studentId, level: levelKey(open), q: open.q, kind: open.kind, total, max: open.max });
          if (after) go(after);
          else setLane({ at: null });
        }}
      />
    </div>
  );
}

/** "G8-U02" → "2"; "OL-U17" → "17". */
const unitShort = (key: string) => key.replace(/^[A-Z0-9]+-U?0*/, "") || key;

function HomeCard(props: {
  it: PhotoItem;
  back: { label: string; short: string; go: () => void } | null;
  hasNext: boolean;
  onDone: (total: number | null) => void;
}) {
  const { it } = props;
  const part = it.kind === "part";
  // Corrected in class meanwhile (his paper: the level, or this part): nothing to mark, Close only closes it.
  const inClass = it.hc || (part && it.got !== null);
  // Each part as the phone left it: its marks where it marked, nothing lit where it is hers (never "untouched = full").
  const [marks, setMarks] = useState<(number | null)[]>(() => it.parts.map((p) => p.phone));
  const [one, setOne] = useState<number | null>(part ? null : it.got);
  // A part question that can't be split: the phone's parts as one row of their own (as the phone gave them).
  const [phoneOne, setPhoneOne] = useState<number>(it.phoneGot);
  const [note, setNote] = useState("");
  const [retake, setRetake] = useState(false);
  // Her message back to him (7 Nov 2026): the pad turns into a box to write it.
  const [asking, setAsking] = useState(false);
  const [askText, setAskText] = useState("");
  // Her voice note with it (12 Nov 2026), and whether she is recording right now (Send waits).
  const [voice, setVoice] = useState<Voice | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [big, setBig] = useState<number | null>(null);
  const shown = useQuestionShown(it.unit.id, "master", it.hasQ);
  // A new card (keyed by its photo): taps in its first moment were meant for the last one (Correction's guard; Save
  // twice as long, as it sits where the last card's Save was).
  const born = useRef(Date.now());

  // Every part takes her marks (7 Nov 2026, his report: he typed it wrong, his paper has it right: "I want to give the
  // marks"): a part question = the parts the phone left (unlit until she taps) and the phone's own parts (lit as the
  // phone gave them, hers to change); his working = the whole question's.
  const edit = it.split && !inClass;
  const left = it.parts.map((p) => part && p.phone === null);
  const herGot = part ? (it.split ? (marks.every((g, j) => !left[j] || g !== null) ? marks.reduce<number>((s, g, j) => s + (left[j] ? (g ?? 0) : 0), 0) : null) : one) : null;
  // The phone's parts now (as the phone gave them, or as she changed them).
  const phoneNow = part ? (it.split ? marks.reduce<number>((s, g, j) => s + (left[j] ? 0 : (g ?? 0)), 0) : phoneOne) : 0;
  const total = inClass ? it.got : part ? (herGot === null ? null : phoneNow + herGot) : it.split ? marks.reduce<number>((s, g) => s + (g ?? 0), 0) : one;
  const lost = total !== null && total < it.max;
  const ready = !busy && (inClass || total !== null);
  const look = total === null ? "" : total >= it.max ? "" : total === 0 ? " zero" : " part";

  const tap = (fn: () => void) => {
    if (Date.now() - born.current < TAP_GUARD_MS) return;
    tone("tick");
    fn();
  };
  // Explain online (12 Nov 2026, his idea: "put the headset icon same like in the consult page"; built after marking,
  // his yes: before her marks a photo question isn't lost, so there is nothing to explain yet). Always in its place on
  // the pad, pale until the marks she tapped are below the maximum; one tap = Save, then his thread opens with her as
  // its teacher (Consultation's call: `help.tcall`). His photo and her marks are in the thread already.
  const canOnline = ready && lost && !inClass && !it.student.demo;
  const save = async (online = false) => {
    if (Date.now() - born.current < TAP_GUARD_MS * 2 || !ready || (online && !canOnline)) return;
    setBusy(true);
    setErr(null);
    try {
      await mutate(api.photos.mark, {
        id: it.id,
        ...(part && !inClass && herGot !== null ? { got: herGot } : {}),
        ...(part && !inClass && total !== null && phoneNow !== it.phoneGot ? { total } : {}),
        ...(!part && !inClass && total !== null && total !== it.got ? { total } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      });
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
      return;
    }
    const first = it.student.name.split(" ")[0];
    if (!online) tone("done");
    else {
      // Her marks are saved whatever happens next: a thread that can't open (Us closed on the phones) is only said.
      try {
        await mutate(api.help.tcall, { studentId: it.student.id, unitId: it.unit.id, q: it.q });
        tone("call");
        toast(`🎧 Q${it.q} saved ${total}/${it.max}. ${first}'s thread is open: explain in Us → Thread.`);
      } catch (e) {
        tone("done");
        toast(`Q${it.q} saved ${total}/${it.max}, but no thread: ${errorText(e)}`);
      }
    }
    props.onDone(total);
  };
  const again = async (w: RetakeWhy) => {
    setBusy(true);
    setErr(null);
    try {
      await mutate(api.photos.retake, { id: it.id, why: w });
      tone("clear");
      toast(`Q${it.q}: he takes the photo again (${RETAKE[w].en.toLowerCase()}).`);
      props.onDone(null);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };

  const sendAsk = async () => {
    const text = askText.trim();
    if ((!text && !voice) || busy || recording) return;
    setBusy(true);
    setErr(null);
    try {
      const v = voice ? ((await upload(api.photos.voiceUrl, voice.blob)) as Id<"_storage">) : undefined;
      await mutate(api.photos.ask, { id: it.id, text, ...(v && voice ? { voice: v, sec: voice.sec } : {}) });
      tone("clear");
      toast(`Q${it.q}: your message went to ${it.student.name}. It comes back here when he answers.`);
      props.onDone(null);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  };

  // Each part's row (or the one row, when the parts can't take their own marks): `slots` = in the printed question.
  const rows = (slots: boolean) =>
    it.split ? (
      it.parts.map((p, j) => (
        <PartRow
          key={j}
          slot={slots ? `p${j}` : undefined}
          p={p}
          it={it}
          g={marks[j]}
          edit={edit}
          one={it.parts.length === 1}
          label={part && p.phone !== null ? `The phone gave ${p.phone}/${p.m}: change it if his paper shows more` : undefined}
          onMark={(g) =>
            tap(() => {
              const next = [...marks];
              next[j] = g;
              setMarks(next);
            })
          }
        />
      ))
    ) : (
      // The parts can't take their own marks (the phone read it differently at his Check): one row, as then; a part
      // question's phone parts in a row of their own under it (hers to change too). In the printed question: after it.
      <>
        <PartRow
          p={{ p: "", m: part ? it.teach : it.max, key: it.key, phone: null, typed: it.typed ?? [], ok: it.ok?.flatMap((x) => x ?? []) ?? null }}
          it={it}
          g={part ? one : (one ?? it.got)}
          edit={!inClass}
          one
          label={part && it.teach < it.max ? "Marks for the parts the phone left" : undefined}
          onMark={(g) => tap(() => setOne(g))}
        />
        {part && it.teach < it.max && (
          <PartRow
            p={{ p: "", m: it.max - it.teach, key: "", phone: it.phoneGot, typed: [], ok: null }}
            it={it}
            g={phoneOne}
            edit={!inClass}
            one
            bare
            label={`The phone's parts: it gave ${it.phoneGot}/${it.max - it.teach}. Change it if his paper shows more`}
            onMark={(g) => tap(() => setPhoneOne(g))}
          />
        )}
      </>
    );
  const kindWords = it.said ? "his reason to read" : part ? "to mark" : "wrong answer";
  const canRetake = !it.said && it.urls.length > 0;
  return (
    <>
      <section class={`fc-card hl-card ${it.kind}`} aria-label={`Question ${it.q}, ${it.max} marks, ${kindWords}`}>
        <CardHead
          label={`Q${it.q}`}
          n={
            <>
              <small>Q</small>
              {it.q}
            </>
          }
          meta={`${it.max} mark${it.max === 1 ? "" : "s"} · ${kindWords} · ${sentWords(it.at)}`}
          back={props.back}
          shown={shown}
        />
        {/* Her message and his answer first: what she reads before the photo. */}
        {it.ask && (
          <div class="hl-asked">
            <p>
              <small>
                {it.askBy ?? "You"} asked{it.askAt ? ` · ${agoWords(it.askAt)}` : ""}
              </small>{" "}
              {!(it.voice && it.ask === VOICE_ONLY) && it.ask}
            </p>
            {it.voice && <VoicePlay url={it.voice} sec={it.voiceSec ?? 0} />}
            <p class="hl-reply">
              <small>His answer · {sentWords(it.at)}</small> {it.reply ?? <span class="muted">(a new photo, no words)</span>}
            </p>
          </div>
        )}
        {/* His typed reason has no photo, unless he answered her message with one (12 Nov 2026). */}
        {(!it.said || it.urls.length > 0) && (
          <div class="hl-shots">
            {it.urls.map((u, i) => (
              <Shot key={u} url={u} turnKey={`${it.id}:${i}`} label={`Photo ${i + 1}${it.urls.length > 1 ? ` of ${it.urls.length}` : ""}`} onBig={() => setBig(i)} />
            ))}
            {it.urls.length === 0 && <p class="fc-anote">The photo is gone.</p>}
          </div>
        )}
        {inClass && (
          <p class="hl-note">
            Corrected in class already{it.got !== null ? ` (${it.got}/${it.max})` : ""}: Close it.{lost ? " Evaluation explains it in class." : ""}
          </p>
        )}
        {/* The printed question's icon on (13 Nov 2026, his ask: "the question, then the answer ... same like in the
            thread"): each part's row (the key, what he typed, her marks) under its own sub-question. */}
        {shown.open ? (
          <BookQuestion unitId={it.unit.id} stage="master" q={it.q} parts={it.split ? it.parts.map((p) => p.p) : []}>
            {rows(true)}
          </BookQuestion>
        ) : (
          <ul class="fc-parts hl-parts">{rows(false)}</ul>
        )}
        <label class="phq-words hl-words">
          <span class="phq-lab">Your words (optional, he reads them)</span>
          <input type="text" maxLength={NOTE_MAX} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} />
        </label>
        {err && <p class="phq-err">{err}</p>}
      </section>

      <div class="fc-pad hl-pad">
        {asking ? (
          <div class="hl-askpad" role="group" aria-label="Your message to him">
            <textarea
              rows={3}
              maxLength={ASK_MAX}
              placeholder={`Ask ${it.student.name.split(" ")[0]}: why is the answer empty? where is (b)? or a hint. Nothing is marked until he answers.`}
              value={askText}
              onInput={(e) => setAskText((e.target as HTMLTextAreaElement).value)}
            />
            <VoiceRec onVoice={setVoice} onBusy={setRecording} disabled={busy} />
            <div class="hl-askacts">
              <button
                type="button"
                class="btn ghost"
                disabled={busy}
                onClick={() => {
                  setAsking(false);
                  setVoice(null);
                  setRecording(false);
                }}
              >
                Cancel
              </button>
              <button type="button" class="btn" disabled={busy || recording || (!askText.trim() && !voice)} onClick={() => void sendAsk()}>
                {busy ? "…" : "Send to him"}
              </button>
            </div>
          </div>
        ) : retake ? (
          <div class="hl-retake" role="group" aria-label="What is wrong with the photo">
            {(Object.keys(RETAKE) as RetakeWhy[]).map((w) => (
              <button key={w} type="button" class="btn ghost" disabled={busy} onClick={() => void again(w)}>
                {RETAKE[w].en}
              </button>
            ))}
            <button type="button" class="btn ghost" onClick={() => setRetake(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div class={`hl-acts${canRetake ? "" : " one"}`}>
            {/* Retake only where there is a photo to take again (12 Nov 2026: his typed reason has none, so no button). */}
            {canRetake && (
              <button type="button" class="fc-n hl-again" disabled={busy || inClass} onClick={() => setRetake(true)}>
                <small>Retake</small>
              </button>
            )}
            {/* Her message before marking (7 Nov 2026), on every card since 12 Nov 2026 (words or her voice). */}
            <button type="button" class="fc-n hl-again hl-ask" disabled={busy || inClass} onClick={() => setAsking(true)}>
              <small>Message</small>
            </button>
            <button
              type="button"
              class="fc-n hl-onl"
              disabled={!canOnline}
              aria-label={
                canOnline
                  ? `Save ${total}/${it.max} and explain Q${it.q} online to ${it.student.name}: open his thread`
                  : `Explain Q${it.q} online: only once the marks you tap are below ${it.max}`
              }
              onClick={() => void save(true)}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
                <rect x="3" y="13.5" width="4.5" height="6.5" rx="1.6" />
                <rect x="16.5" y="13.5" width="4.5" height="6.5" rx="1.6" />
              </svg>
            </button>
            <button type="button" class={`fc-go hl-go${look}`} disabled={!ready} onClick={() => void save()}>
              {busy ? (
                "…"
              ) : total === null && !inClass ? (
                <small>{part ? "Tap the marks for each part" : "Tap the marks"}</small>
              ) : (
                // Two lines since the headphones took room on the pad (12 Nov 2026): the words small, her marks big
                // under them, so nothing is cut at 320 px.
                <>
                  <span class="hl-go-l">
                    {inClass ? "Close" : "Save"}
                    {props.hasNext && " · next"}
                  </span>
                  {total !== null && (
                    <b>
                      {total}/{it.max}
                    </b>
                  )}
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {big !== null && it.urls[big] && <Viewer url={it.urls[big]} turnKey={`${it.id}:${big}`} onClose={() => setBig(null)} />}
    </>
  );
}

/**
 * One part: its label, the key's answer big, what he typed (in a box of its own, 13 Nov 2026, his words: "student
 * answers look like part of the answer key ... no color code or any boxes or outline": outlined green when all right,
 * red when any is wrong, each box ✓ / ✗), then its marks in one row under it, the same place on every part
 * (Correction's card). A part the phone marked, in a part question: its marks as the phone gave them, not hers to
 * change. `slot`: its place in the printed question (the icon on).
 */
function PartRow(props: {
  slot?: string;
  p: HomePart;
  it: PhotoItem;
  g: number | null;
  edit: boolean;
  one: boolean;
  label?: string;
  /** No answer of its own (a part question's phone parts, when its parts can't be split): the label only. */
  bare?: boolean;
  onMark: (g: number) => void;
}) {
  const { p, it } = props;
  const reason = it.reasons.find((r) => r.p === p.p);
  const name = p.p || "";
  return (
    <li class={`fc-part hl-part${props.one || !name ? " hl-one" : ""}${props.edit ? "" : " hl-ro"}`} slot={props.slot}>
      {!props.one && name && <em class="fc-pl">{name}</em>}
      <div class="hl-pans">
        {props.bare ? null : p.key ? (
          <BigAnswer text={p.key.replace(/\n/g, " / ")} max={44} maxH={110} />
        ) : (
          <p class="fc-anote">{it.key ? "Not in the key for this part: check it yourself." : "No answer key: check his answer yourself."}</p>
        )}
        {reason ? (
          <div class="hl-typed tch">
            <small class="hl-tl">His reason</small>
            <p>
              <b>{reason.yes}</b> <span class="hl-said">{reason.text || <span class="muted">(no reason written)</span>}</span>
            </p>
          </div>
        ) : (
          p.typed.some((x) => x) && (
            <div class={`hl-typed ${typedTone(p)}`}>
              <small class="hl-tl">He typed</small>
              <p>
                {p.typed.map((x, i) => {
                  const ok = p.ok?.[i];
                  return (
                    <b key={i} class={p.ok === null ? "hl-tch" : ok ? "hl-ok" : "hl-bad"}>
                      {p.ok !== null && (
                        <i aria-hidden="true">{ok ? "✓" : "✗"}</i>
                      )}
                      {x || "(empty)"}
                    </b>
                  );
                })}
              </p>
            </div>
          )
        )}
        {props.label && <p class="hl-plab">{props.label}</p>}
      </div>
      {props.edit ? (
        <span class="fc-pm" style={{ "--n": String(p.m + 1) }} role="group" aria-label={`${name ? `Part ${name}` : `Q${it.q}`}, out of ${p.m}`}>
          {Array.from({ length: p.m + 1 }, (_, g) => {
            const on = props.g === g;
            return (
              <button
                key={g}
                type="button"
                class={`fc-pb${on ? " on" : ""}${g === p.m ? " full" : g === 0 ? " zero" : ""}`}
                aria-pressed={on}
                aria-label={`${name ? `Part ${name}` : `Q${it.q}`}: ${g} of ${p.m}`}
                onClick={() => props.onMark(g)}
              >
                {g}
              </button>
            );
          })}
        </span>
      ) : (
        <p class="hl-phone">
          {props.g === null ? "–" : `${props.g}/${p.m}`}
          <small>{p.phone !== null && it.kind === "part" ? " the phone's" : ""}</small>
        </p>
      )}
    </li>
  );
}

/** His typed answer's box: "ok" every box right, "no" any wrong, "tch" the teacher's to judge (no key marked it). */
const typedTone = (p: HomePart) => (p.ok === null ? "tch" : p.typed.every((_, i) => p.ok![i]) ? "ok" : "no");

// ---- His photos: big, turned with ↻, full screen with a tap ----

function Shot(props: { url: string; turnKey: string; label: string; onBig: () => void }) {
  const [turn, setTurn] = useState(turns.get(props.turnKey) ?? 0);
  return (
    <figure class="hl-shot">
      <button type="button" class="hl-img" aria-label={`${props.label}: full screen`} onClick={props.onBig}>
        <Turned url={props.url} turn={turn} alt={props.label} width="100%" />
      </button>
      <TurnButton
        turnKey={props.turnKey}
        label={props.label}
        onTurn={(t) => {
          setTurn(t);
        }}
      />
    </figure>
  );
}

function TurnButton(props: { turnKey: string; label: string; onTurn: (t: number) => void; cls?: string }) {
  return (
    <button
      type="button"
      class={`hl-turn${props.cls ? ` ${props.cls}` : ""}`}
      aria-label={`Turn ${props.label.toLowerCase()}`}
      onClick={() => {
        const t = ((turns.get(props.turnKey) ?? 0) + 90) % 360;
        turns.set(props.turnKey, t);
        props.onTurn(t);
      }}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 12a8 8 0 1 1-2.35-5.65" />
        <path d="M20 4v5h-5" />
      </svg>
    </button>
  );
}

/**
 * The photo turned by 0, 90, 180 or 270 degrees inside a box as wide as asked and as tall as the turned photo, so the
 * page around it never overlaps it (the box, not the picture, takes the room).
 */
function Turned(props: { url: string; turn: number; alt: string; width: string; fit?: boolean }) {
  const [size, setSize] = useState(sizes.get(props.url) ?? null);
  const side = props.turn % 180 !== 0;
  const w = size?.w ?? 4;
  const h = size?.h ?? 3;
  const bw = side ? h : w;
  const bh = side ? w : h;
  // Full screen: as big as fits the screen (the whole photo seen); else as wide as asked.
  const width = props.fit ? `min(100vw, calc(100vh * ${bw} / ${bh}))` : props.width;
  const img: Record<string, string> = side
    ? { width: `${(w / h) * 100}%`, height: `${(h / w) * 100}%`, transform: `translate(-50%, -50%) rotate(${props.turn}deg)` }
    : { width: "100%", height: "100%", transform: `translate(-50%, -50%)${props.turn ? ` rotate(${props.turn}deg)` : ""}` };
  return (
    <span class={`hl-turned${size ? "" : " wait"}`} style={{ width, aspectRatio: `${bw} / ${bh}` }}>
      <img
        src={props.url}
        alt={props.alt}
        draggable={false}
        style={img}
        onLoad={(e) => {
          const i = e.currentTarget as HTMLImageElement;
          if (!i.naturalWidth) return;
          const s = { w: i.naturalWidth, h: i.naturalHeight };
          sizes.set(props.url, s);
          setSize(s);
        }}
      />
    </span>
  );
}

/** Full screen: the whole photo; a tap = twice as big (scroll it), again = back; ↻ turns it; ✕ closes. */
function Viewer(props: { url: string; turnKey: string; onClose: () => void }) {
  const [turn, setTurn] = useState(turns.get(props.turnKey) ?? 0);
  const [zoom, setZoom] = useState(false);
  return (
    <div class={`hl-big${zoom ? " zoom" : ""}`} role="dialog" aria-label="The photo, full screen">
      <button type="button" class="hl-bigimg" aria-label={zoom ? "Smaller" : "Twice as big"} onClick={() => setZoom(!zoom)}>
        <Turned url={props.url} turn={turn} alt="The photo, full screen" width="200vw" fit={!zoom} />
      </button>
      <div class="hl-bigbar">
        <TurnButton turnKey={props.turnKey} label="The photo" cls="big" onTurn={setTurn} />
        <button type="button" class="hl-close" aria-label="Close" onClick={props.onClose}>
          ✕
        </button>
      </div>
    </div>
  );
}
