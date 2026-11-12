// Online explanations (12 Nov 2026). His voice note: "it's not like video class, it's not like Zoom class. It's just
// explaining in the voice note like a WhatsApp ... small tiny pill like explain online ... that will open the new thread
// in the community ... that will ask the photo of the wrong question ... which teacher want to add". The server:
// convex/help.ts (a thread = a room of the chats, `k` "h"). Here, in the chats' own file (never in the first load):
// - AskSheet: the pill's sheet (his photo first, then a teacher; or the thread the question already has).
// - HelpTop: on top of a thread: the question, what each student typed with the wrong parts in rose, how it stands.
// - HelpMenu: the teacher's ⋮ (Explained, Not now, Send to another teacher, hide a name or a photo): never a big
//   button, his words: "mistakenly teachers can press that".
// - VoiceRec / Voice: a voice note (the phone's own recorder: a teacher 2 minutes, a student 1), and its player.
// - HelpList: his explanations (or the teachers' queue) with its filters, on top of Chats.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ChatMsg } from "../../convex/chat";
import type { HelpLine, HelpStart, HelpTeacher } from "../../convex/help";
import type { HelpAsk, HelpHead, HelpPart, HelpPhoto } from "../../convex/lib/helpView";
import { drawQuestion } from "../questionView";
import { keep, mutation, NetError, query, uploadPhoto } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { agoShort, sendPicked, usePicker } from "./talk";
import { Pics } from "./usPost";
import { Avatar, Icon, Maths, problemWords, Sheet, showSheet, toast, Waiting } from "./ui";

const LIST_MS = 20_000;

const STATE: Record<HelpAsk["st"], { ta: string; en: string; cls: string }> = {
  open: { ta: "⏳ காத்திருக்கிறது", en: "Waiting", cls: "open" },
  done: { ta: "✓ விளக்கப்பட்டது", en: "Explained", cls: "done" },
  class: { ta: "✓ வகுப்பில் விளக்கப்பட்டது", en: "Explained in class", cls: "done" },
  skip: { ta: "📚 வகுப்பில் விளக்கம்", en: "In class", cls: "skip" },
};

// ---------------------------------------------------------------- the pill's sheet

/**
 * He sends a wrong question in: a photo of his working (his rule: the photo first), then the teacher. A question that
 * already has a thread: he joins it (its teacher explained it before). Told before he sends: the others who got it
 * wrong see his photo too.
 */
export function AskSheet(props: { unitId: string; q: number; onClose: () => void; onDone: (id: string) => void }) {
  const [d, setD] = useState<HelpStart | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tid, setTid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pk = usePicker(2, "உன் வழிமுறை மட்டும் பெட்டிக்குள்: மஞ்சள் புள்ளிகளை இழு.");
  useEffect(() => {
    query("help:start", { unitId: props.unitId, q: props.q }).then(
      (x) => setD(x as HelpStart),
      (e) => setErr(problemWords(e)),
    );
  }, []);
  usePics((d?.teachers ?? []).map((t) => t.pic));
  // Hers already (a teacher asked for his photo), or the question's own thread: no teacher to pick.
  const fixed = d?.mine?.st === "open" || !!d?.thread;
  const send = async () => {
    if (busy || !pk.list.length || (!fixed && !tid)) return;
    setBusy(true);
    try {
      const ph = await sendPicked(pk.list);
      const r = (await mutation("help:ask", { unitId: props.unitId, q: props.q, ...(tid && !fixed ? { tid } : {}), ph })) as { id: string };
      sound("send");
      buzz(8);
      pk.clear();
      props.onDone(r.id);
    } catch (e) {
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. பிறகு அனுப்பு." : problemWords(e), true);
      setBusy(false);
    }
  };
  return (
    <Sheet title={`🎧 Q${props.q} · Explain online`} onClose={props.onClose} class="h-ask">
      {err ? (
        <p class="f-note">{err}</p>
      ) : !d ? (
        <Waiting />
      ) : d.left === 0 && !fixed ? (
        <p class="f-note">இன்றைக்குப் போதுமான கேள்விகள் அனுப்பினாய். மற்றவை நாளை, அல்லது வகுப்பில்.</p>
      ) : (
        <>
          <p class="h-step">
            <b>1</b> உன் வழிமுறையைப் படம் எடு
          </p>
          <div class="h-pics">
            {pk.thumbs}
            {!pk.full && (
              <button type="button" class="f-cam" aria-label="Take a photo" onClick={pk.pick}>
                <Icon name="camera" size={22} />
                <small>{pk.list.length ? "இன்னொன்று" : "படம் எடு"}</small>
              </button>
            )}
          </div>
          <p class="h-step">
            <b>2</b> {fixed ? "விளக்குபவர்" : "யார் விளக்க வேண்டும்?"}
          </p>
          {fixed ? (
            <p class="h-fixed">
              {d.thread ? (
                <>
                  <b>{d.thread.tname} ஆசிரியர்</b>
                  {d.thread.n > 0 && ` · இந்தக் கேள்வியை ஏற்கனவே ${d.thread.n} பேருக்கு விளக்கியுள்ளார்: அதையும் பார்ப்பாய்.`}
                </>
              ) : (
                "உன் ஆசிரியர் காத்திருக்கிறார்."
              )}
            </p>
          ) : (
            <ul class="h-tch" role="radiogroup" aria-label="Teachers">
              {d.teachers.map((t: HelpTeacher) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={tid === t.id}
                    class={tid === t.id ? "on" : ""}
                    onClick={() => {
                      buzz();
                      setTid(t.id);
                    }}
                  >
                    <Avatar name={t.n} size="s" pic={picOf(t.pic)} />
                    <b>{t.n}</b>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p class="h-told">👀 இதே கேள்வியைத் தவறவிட்ட மற்ற மாணவர்களும் உன் படத்தையும் பெயரையும் இந்த thread இல் பார்ப்பார்கள்.</p>
          <button type="button" class="f-btn go h-go" disabled={busy || !pk.list.length || (!fixed && !tid)} onClick={() => void send()}>
            {busy ? "…" : "அனுப்பு"}
          </button>
          {d.left !== null && !fixed && <p class="h-left">இன்று இன்னும் {d.left}</p>}
        </>
      )}
      {pk.picker}
    </Sheet>
  );
}

// ---------------------------------------------------------------- on top of a thread

/**
 * The book's page inside the thread: readable, nothing to tap, and as wide as the phone (12 Nov 2026, his screenshot:
 * "left and right have so much white margin ... makes to scroll too much"): almost no padding, a sub-question's label
 * only as wide as its words, no extra indent.
 */
const PAPER = `.qv{border-radius:10px;padding:6px 4px 2px;font:500 15.5px/1.5 "Baloo Thambi 2","Noto Sans Tamil",system-ui,sans-serif;color:#1c1a3a;-webkit-user-select:none;user-select:none}
.qv :not(svg):not(svg *):not(.mi):not(.mi *){font-family:"Baloo Thambi 2","Noto Sans Tamil",system-ui,sans-serif!important}
.qv .qn,.qv .pm,.qv .mk{display:none!important}
.qv .sq{margin-left:0!important}
.qv .rp{grid-template-columns:auto minmax(0,1fr)!important;column-gap:6px!important;gap:0 6px}
.qv .rl{width:auto!important;min-width:0!important;flex:none;padding:0!important;margin:0!important}
.qv [data-fill]{display:inline-block;min-width:2em;border-bottom:2px dashed #cbc3ff}`;

type Printed = { html: string | null; css: string | null; key?: string | null; kp?: { p: string; a: string }[] };

/** A key's words: **bold** kept, its maths drawn. */
const Rich = (props: { s: string }) => (
  <>
    {props.s.split("**").map((r, i) =>
      i % 2 ? (
        <b key={i}>
          <Maths s={r} />
        </b>
      ) : (
        <span key={i}>{r}</span>
      ),
    )}
  </>
);

/**
 * One sub-question's answer, right under it (12 Nov 2026, his words: "below the each of questions put the student's
 * answer. If it is right, highlight that. If it is wrong, highlight in red ... and also real answer key near that for
 * each sub questions. This answer key is only for teachers"): what he typed (✓ blue, ✗ rose, ✍ the teacher's part),
 * then, for a teacher, the key. `slot` = its place in the printed question; without one it is a row of the plain list.
 */
function Answer(props: { label: string; part?: HelpPart; k?: string; staff: boolean; slot?: string; photo?: HelpPhoto; first?: boolean }) {
  const p = props.part;
  // A part only a teacher marks, photographed at home: her marks, and the photo itself under the first such part.
  const ph = p?.ok === null ? props.photo : undefined;
  const marked = ph?.st === "done" && ph.got !== undefined;
  // In its slot the printed label is right above it: only a split part's note ("பெயர்") is said again.
  const label = props.slot ? (props.label.split(" · ")[1] ?? "") : props.label;
  const typed = p?.typed.some((t) => t);
  return (
    <div class="h-ans" slot={props.slot}>
      {label && <small class="h-al">{label}</small>}
      {p && ph ? (
        <span class={`h-a ${marked ? (ph.got! >= ph.max ? "ok" : "no") : "tch"}`}>
          <i class="h-ai" aria-hidden="true">✍</i>
          {!props.first
            ? props.staff
              ? "in the photo above"
              : "மேலே உள்ள படத்தில்"
            : marked
              ? `${ph.got}/${ph.max}${props.staff && ph.by ? ` · ${ph.by}` : ""}`
              : props.staff
                ? ph.st === "retake"
                  ? "photo asked again"
                  : "photo not marked yet"
                : "இன்னும் திருத்தப்படவில்லை"}
        </span>
      ) : (
        p && (
          <span class={`h-a ${p.ok === false ? "no" : p.ok ? "ok" : "tch"}`}>
            <i class="h-ai" aria-hidden="true">{p.ok === false ? "✗" : p.ok ? "✓" : "✍"}</i>
            {typed ? p.typed.map((t, j) => <Maths key={j} s={`${j ? ", " : ""}${t || "–"}`} />) : p.ok === null ? (props.staff ? "on paper" : "தாளில்") : props.staff ? "blank" : "விடை இல்லை"}
          </span>
        )
      )}
      {ph && props.first && (ph.urls.length ? <div class="h-aph"><Pics ph={ph.urls.map((u) => ({ s: u, b: u, w: 4, h: 3 }))} /></div> : <small class="h-al">{props.staff ? "(photo deleted)" : "(படம் நீக்கப்பட்டது)"}</small>)}
      {ph && props.first && ph.note && <small class="h-anote">{ph.note}</small>}
      {props.staff && props.k && (
        <span class="h-k">
          <i class="h-kt">Key</i> <Rich s={props.k} />
        </span>
      )}
    </div>
  );
}

/**
 * The question as printed, with each part's answer under its own sub-question (the slots of `drawQuestion`, as on a
 * Level). A book whose questions aren't in the app: the same answers as a plain list, part by part. `ask` = whose
 * answers (his own on his phone; the student the teacher picked).
 */
function Printed(props: { id: string; staff: boolean; ask?: HelpAsk }) {
  const host = useRef<HTMLDivElement>(null);
  const [x, setX] = useState<Printed | null>(null);
  useEffect(() => {
    query("help:question", { id: props.id }).then(
      (r) => setX(r as Printed),
      () => setX({ html: null, css: null }),
    );
  }, [props.id]);
  const parts = props.ask?.parts;
  // The parts in the key's order: from the key for a teacher (a student who did it on paper typed nothing), else his own.
  const labels = x?.kp?.map((k) => k.p) ?? parts?.map((p) => p.p) ?? [];
  const sig = labels.join("\n");
  useEffect(() => {
    if (host.current && x?.html) return drawQuestion(host.current, x.html, x.css ?? "", PAPER, labels);
  }, [x, sig]);
  if (!x) return <Waiting />;
  const firstPhoto = parts?.findIndex((p) => p.ok === null) ?? -1;
  const rows = (slots: boolean) =>
    labels.map((l, i) => <Answer key={i} label={l} part={parts?.[i]} k={x.kp?.[i]?.a} staff={props.staff} slot={slots ? `p${i}` : undefined} photo={props.ask?.photo} first={i === firstPhoto} />);
  return (
    <>
      {x.html ? (
        <div class="h-paper" ref={host}>
          {rows(true)}
        </div>
      ) : (
        <>
          <p class="h-none">{props.staff ? "This book's questions aren't in the app (Books → Q): the answers part by part." : "கேள்வி உன் புத்தகத்தில் உள்ளது. உன் விடைகள்:"}</p>
          <div class="h-plist">{rows(false)}</div>
        </>
      )}
      {props.staff && !labels.length && x.key && (
        <p class="h-key">
          <b>Key</b> <Rich s={x.key} />
        </p>
      )}
    </>
  );
}

/**
 * On top of a thread: which question (Stage, Level, Q), each student (how it stands, his marks; a teacher taps one to
 * see his answers, ⋮ on each), and the question with the picked student's answer under each sub-question (the key
 * beside it for a teacher). A student sees only his own answers.
 */
export function HelpTop(props: { id: string; help: HelpHead; staff: boolean; onChange: () => void; onMate: (id: string) => void; onPhoto: () => void }) {
  const h = props.help;
  const [show, setShow] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  usePics(h.asks.map((a) => a.pic));
  const mine = h.asks.find((a) => a.mine);
  const rows = props.staff ? h.asks : h.asks.filter((a) => a.mine);
  const others = h.asks.length - rows.length;
  // Whose answers the question shows: his own; for a teacher the one she tapped, else the first still waiting.
  const shown = props.staff ? (h.asks.find((a) => a.id === sel) ?? h.asks.find((a) => a.st === "open") ?? h.asks[0]) : mine;
  return (
    <section class="h-top" aria-label={`Q${h.q}`}>
      <div class="h-top-h">
        <p>
          <b>Q{h.q}</b>
          <span>
            Stage {h.no} · Level {h.n}
          </span>
          <small>{h.unit}</small>
        </p>
        <button type="button" class={`h-showq${show ? " on" : ""}`} aria-pressed={show} onClick={() => setShow(!show)}>
          {props.staff ? (show ? "Hide" : "Question") : show ? "மூடு" : "கேள்வி"}
        </button>
      </div>
      <ul class="h-asks">
        {rows.map((a) => (
          <li key={a.id} class={`${STATE[a.st].cls}${props.staff && rows.length > 1 && a.id === shown?.id ? " sel" : ""}`}>
            <button
              type="button"
              class="h-who"
              disabled={!props.staff || rows.length < 2}
              aria-pressed={props.staff && rows.length > 1 ? a.id === shown?.id : undefined}
              aria-label={props.staff && rows.length > 1 ? `Show ${a.n}'s answers` : undefined}
              onClick={() => setSel(a.id)}
            >
              <Avatar name={a.n} size="s" pic={picOf(a.pic)} />
              <b>{a.mine ? "நீ" : a.n}</b>
            </button>
            {a.max !== undefined && a.got !== null && a.got !== undefined && (
              <em>
                {a.got}/{a.max}
              </em>
            )}
            <span class="h-st">
              {props.staff ? STATE[a.st].en : STATE[a.st].ta}
              {a.st === "done" && a.by ? ` · ${a.by}` : ""}
              {props.staff && a.st === "open" && !a.ph ? " · no photo yet" : ""}
              {props.staff && (a.hn || a.hp) ? ` · 🙈 ${a.hn && a.hp ? "name, photo" : a.hn ? "name" : "photo"}` : ""}
            </span>
            {props.staff && (
              <button type="button" class="h-dots" aria-label={`More for ${a.n}`} onClick={() => showSheet((close) => <AskMenu a={a} onClose={close} onChange={props.onChange} />)}>
                ⋮
              </button>
            )}
          </li>
        ))}
      </ul>
      {!props.staff && others > 0 && <p class="h-others">+ இதே கேள்வியில் இன்னும் {others} பேர்</p>}
      {show && (
        <>
          {props.staff && rows.length > 1 && shown && <p class="h-whose">{shown.n}'s answers · tap a name for another's</p>}
          <Printed id={props.id} staff={props.staff} ask={shown} />
        </>
      )}
      {!props.staff && mine?.st === "open" && (
        <p class="h-wait">
          {mine.ph ? (
            <>
              <b>{h.tname} ஆசிரியர்</b> பார்த்து விளக்குவார். பதில் வந்ததும் phone சொல்லும்.
            </>
          ) : (
            <button type="button" class="f-btn go" onClick={props.onPhoto}>
              <Icon name="camera" size={18} /> உன் வழிமுறையின் படத்தை அனுப்பு
            </button>
          )}
        </p>
      )}
      {props.staff && (
        <p class="h-wait">
          {h.open ? (
            <>
              Waiting on <b>{h.own ? "you" : h.tname}</b>
              {h.late ? " · ⏰ over 12 hours" : ""}. A voice note alone changes nothing: tap ⋮ → Explained when done.
            </>
          ) : (
            "Closed. It opens again when another student sends this question in."
          )}
        </p>
      )}
    </section>
  );
}

/** One student's ⋮: hide his name or his photo from the thread's other students; Not now (his question waits for the class). */
function AskMenu(props: { a: HelpAsk; onClose: () => void; onChange: () => void }) {
  const a = props.a;
  const [sure, setSure] = useState(false);
  const run = (path: string, args: Record<string, unknown>, said: string) =>
    mutation(path, args).then(
      () => {
        toast(said);
        props.onClose();
        props.onChange();
      },
      (e) => toast(problemWords(e), true),
    );
  return (
    <Sheet title={a.n} sub="Only the thread's other students stop seeing what you hide. He and the teachers still see it." onClose={props.onClose} class="h-menu">
      <button type="button" class="h-mi" onClick={() => void run("help:thide", { aid: a.id, name: !a.hn, photo: !!a.hp }, a.hn ? "His name shows again." : "His name is hidden.")}>
        {a.hn ? "👁 Show his name" : "🙈 Hide his name"}
      </button>
      <button type="button" class="h-mi" onClick={() => void run("help:thide", { aid: a.id, name: !!a.hn, photo: !a.hp }, a.hp ? "His photos show again." : "His photos are hidden.")}>
        {a.hp ? "👁 Show his photos" : "🙈 Hide his photos"}
      </button>
      {a.st === "open" && (
        <button type="button" class="h-mi warn" onClick={() => (sure ? void run("help:tskip", { aid: a.id }, "Left for the class. He is told.") : setSure(true))}>
          {sure ? "Tap again: not explained, it waits for the class" : "📚 Not now (explain in class)"}
        </button>
      )}
    </Sheet>
  );
}

/**
 * The thread's ⋮ (teachers), his words: "just put three dot ... teacher can press like not now or they can press like
 * explain". Explained closes it for everyone waiting and counts in class; Send to another teacher.
 */
export function HelpMenu(props: { id: string; help: HelpHead; onClose: () => void; onChange: () => void }) {
  const h = props.help;
  const [pass, setPass] = useState<HelpTeacher[] | null>(null);
  const [sure, setSure] = useState(false);
  const open = h.asks.filter((a) => a.st === "open");
  const run = (path: string, args: Record<string, unknown>, said: string) =>
    mutation(path, args).then(
      () => {
        sound("send");
        toast(said);
        props.onClose();
        props.onChange();
      },
      (e) => toast(problemWords(e), true),
    );
  return (
    <Sheet title={`Q${h.q} · Stage ${h.no} · Level ${h.n}`} sub={open.length ? `${open.length} waiting: ${open.map((a) => a.n).join(", ")}` : "Nobody is waiting in this thread."} onClose={props.onClose} class="h-menu">
      {pass ? (
        <ul class="h-tch">
          {pass
            .filter((t) => t.id !== h.tid)
            .map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => void run("help:tpass", { id: props.id, to: t.id }, `Sent to ${t.n}.`)}>
                  <Avatar name={t.n} size="s" pic={picOf(t.pic)} />
                  <b>{t.n}</b>
                </button>
              </li>
            ))}
        </ul>
      ) : (
        <>
          <button type="button" class="h-mi go" disabled={!open.length} onClick={() => (sure ? void run("help:tdone", { id: props.id }, `Explained ✓ ${open.length === 1 ? open[0].n : `${open.length} students`}: it counts in class too.`) : setSure(true))}>
            {sure ? `Tap again: explained for ${open.length === 1 ? open[0].n : `all ${open.length}`}` : "✓ Explained (close the thread)"}
          </button>
          <button
            type="button"
            class="h-mi"
            disabled={!open.length}
            onClick={() =>
              query("help:tlist").then(
                (x) => setPass((x as { teachers: HelpTeacher[] }).teachers),
                (e) => toast(problemWords(e), true),
              )
            }
          >
            ➡️ Send to another teacher
          </button>
          <p class="h-note">Not now, and hiding a name or a photo: ⋮ beside each student.</p>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- voice notes

const two = (n: number) => String(n).padStart(2, "0");
const clock = (s: number) => `${Math.floor(s / 60)}:${two(Math.floor(s % 60))}`;

/** What this phone's recorder can make, the kind every phone plays first (AAC in MP4; then Opus in WebM). */
function voiceType(): string | undefined {
  const can = (t: string) => typeof MediaRecorder !== "undefined" && !!MediaRecorder.isTypeSupported?.(t);
  return ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"].find(can);
}

/**
 * A voice note (his words: "explaining in the voice note like a WhatsApp"; students too since his ask of 12 Nov 2026,
 * "please give the voice note feature for students also"): 🎤 starts the phone's own recorder (nothing added to the
 * app), ■ stops (by itself at `max` seconds), then it is heard and sent or dropped.
 */
export function VoiceRec(props: { onSend: (au: { f: string; d: number }) => Promise<unknown>; max: number; staff: boolean }) {
  const MAX = props.max;
  const say = (en: string, ta: string) => toast(props.staff ? en : ta, true);
  const [st, setSt] = useState<"idle" | "rec" | "ready" | "busy">("idle");
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const r = useRef<{ rec?: MediaRecorder; stream?: MediaStream; parts: Blob[]; from: number; blob?: Blob; tick?: number; keep: boolean }>({ parts: [], from: 0, keep: true });
  const free = () => {
    r.current.stream?.getTracks().forEach((t) => t.stop());
    window.clearInterval(r.current.tick);
  };
  useEffect(
    () => () => {
      r.current.keep = false;
      if (r.current.rec?.state === "recording") r.current.rec.stop();
      free();
    },
    [],
  );
  const drop = () => {
    if (url) URL.revokeObjectURL(url);
    setUrl(null);
    r.current.blob = undefined;
    setSecs(0);
    setSt("idle");
  };
  const stop = (keepIt: boolean) => {
    r.current.keep = keepIt;
    if (r.current.rec?.state === "recording") r.current.rec.stop();
    else free();
    if (!keepIt) drop();
  };
  const start = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return say("This phone's browser can't record. Update it, or type the explanation.", "இந்த phone இல் குரல் பதிவு இயலாது. எழுதி அனுப்பு.");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return say("The microphone is blocked: allow it for this site in the browser's settings.", "Microphone தடுக்கப்பட்டுள்ளது: browser settings இல் இந்தத் தளத்துக்கு அனுமதி கொடு.");
    }
    const type = voiceType();
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 24_000 });
    const x = r.current;
    x.rec = rec;
    x.stream = stream;
    x.parts = [];
    x.from = Date.now();
    x.keep = true;
    rec.ondataavailable = (e) => e.data.size && x.parts.push(e.data);
    rec.onstop = () => {
      free();
      if (!x.keep) return;
      const blob = new Blob(x.parts, { type: (rec.mimeType || type || "audio/webm").split(";")[0] });
      const d = Math.max(1, Math.round((Date.now() - x.from) / 1000));
      if (!blob.size) return drop();
      x.blob = blob;
      setSecs(Math.min(d, MAX));
      setUrl(URL.createObjectURL(blob));
      setSt("ready");
    };
    rec.start(1000);
    buzz(10);
    setSecs(0);
    setSt("rec");
    x.tick = window.setInterval(() => {
      const s = Math.floor((Date.now() - x.from) / 1000);
      setSecs(s);
      if (s >= MAX) stop(true);
    }, 500);
  };
  const send = async () => {
    const blob = r.current.blob;
    if (!blob) return;
    setSt("busy");
    try {
      const f = await uploadPhoto(blob);
      await props.onSend({ f, d: secs });
      sound("send");
      drop();
    } catch (e) {
      toast(e instanceof NetError && e.offline ? (props.staff ? "No signal: the voice note is still here, send it again." : "இணையம் இல்லை: பதிவு இங்கேயே உள்ளது, மீண்டும் அனுப்பு.") : problemWords(e), true);
      setSt("ready");
    }
  };
  if (st === "idle")
    return (
      <button type="button" class="h-mic" aria-label="Record a voice note" onClick={() => void start()}>
        🎤 <span>Voice note</span>
      </button>
    );
  return (
    <div class={`h-rec ${st}`} role="group" aria-label="Voice note">
      {st === "rec" ? (
        <>
          <i class="h-dot" aria-hidden="true" />
          <b>
            {clock(secs)} <small>/ {clock(MAX)}</small>
          </b>
          <span class="f-sp" />
          <button type="button" class="h-rb" aria-label="Cancel the recording" onClick={() => stop(false)}>
            ✕
          </button>
          <button type="button" class="h-rb stop" aria-label="Stop recording" onClick={() => stop(true)}>
            ■ Stop
          </button>
        </>
      ) : (
        <>
          {url && <audio src={url} controls preload="metadata" />}
          <button type="button" class="h-rb" aria-label="Delete the voice note" disabled={st === "busy"} onClick={drop}>
            <Icon name="bin" size={18} />
          </button>
          <button type="button" class="h-rb go" disabled={st === "busy"} onClick={() => void send()}>
            {st === "busy" ? "…" : `Send ${clock(secs)}`}
          </button>
        </>
      )}
    </div>
  );
}

/** A voice note in a message: play / pause, a bar, its length. One plays at a time. */
let playing: HTMLAudioElement | null = null;
export function Voice(props: { au: NonNullable<ChatMsg["au"]> }) {
  const el = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  const [bad, setBad] = useState(false);
  const d = props.au.d;
  const tap = () => {
    const a = el.current;
    if (!a) return;
    if (!a.paused) return a.pause();
    if (playing && playing !== a) playing.pause();
    playing = a;
    void a.play().catch(() => setBad(true));
  };
  return (
    <div class={`h-voice${on ? " on" : ""}`}>
      <audio
        ref={el}
        src={props.au.u}
        preload="none"
        onPlay={() => setOn(true)}
        onPause={() => setOn(false)}
        onEnded={() => {
          setOn(false);
          setAt(0);
        }}
        onTimeUpdate={(e) => setAt((e.target as HTMLAudioElement).currentTime)}
        onError={() => setBad(true)}
      />
      <button type="button" class="h-play" aria-label={on ? "Pause" : "Play the voice note"} onClick={tap}>
        {on ? "❚❚" : "▶"}
      </button>
      <span class="h-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, (at / Math.max(1, d)) * 100)}%` }} />
      </span>
      <small>{clock(on || at ? at : d)}</small>
      {bad && <p class="h-bad">இந்த phone இல் இந்தக் குரல் பதிவு ஒலிக்கவில்லை: Chrome ஐ update செய், அல்லது ஆசிரியரிடம் சொல்.</p>}
    </div>
  );
}

// ---------------------------------------------------------------- the lists

type Filter = "open" | "mine" | "all" | "closed";

/**
 * His explanations on top of Chats (the open ones first); for a teacher the queue: Mine (waiting on her, and the
 * ones nobody answered for 12 hours) · Everyone's · Closed, then a student or a unit to narrow it (his words: "we have
 * to put the filters ... for the students or the unit").
 */
export function HelpList(props: { staff: boolean; onRoom: (id: string) => void; /** Shown when he has no thread yet (the Chat tab's first section). */ empty?: ComponentChildren }) {
  const key = props.staff ? "helpT" : "helpMine";
  const [d, setD] = useState<HelpLine[] | null>(() => keep<HelpLine[]>(key));
  const [f, setF] = useState<Filter>(props.staff ? "mine" : "open");
  const [who, setWho] = useState("");
  const [unit, setUnit] = useState("");
  useEffect(() => {
    const load = () =>
      query(props.staff ? "help:tlist" : "help:mine").then(
        (x) => {
          const lines = props.staff ? (x as { lines: HelpLine[] }).lines : (x as HelpLine[]);
          keep(key, lines);
          setD(lines);
        },
        () => {},
      );
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), LIST_MS);
    return () => window.clearInterval(t);
  }, []);
  usePics((d ?? []).map((l) => l.pic));
  if (!d) return null;
  if (!d.length) return props.empty ?? null;
  const open = d.filter((l) => l.st === "open");
  const mineT = open.filter((l) => l.mine || l.late);
  const base = f === "closed" ? d.filter((l) => l.st !== "open") : f === "mine" ? mineT : f === "open" ? open : props.staff ? open : d;
  const units = [...new Map(base.map((l) => [l.unitId, l])).values()];
  const kids = [...new Map(base.map((l) => [l.sid ?? "", l])).values()].filter((l) => l.sid);
  const list = base.filter((l) => (!who || l.sid === who) && (!unit || l.unitId === unit));
  const chips: [Filter, string, number][] = props.staff
    ? [
        ["mine", "Mine", mineT.length],
        ["all", "Everyone's", open.length],
        ["closed", "Closed", d.length - open.length],
      ]
    : [
        ["open", "Waiting", open.length],
        ["all", "All", d.length],
      ];
  return (
    <section class="h-list" aria-label="Online explanations">
      <p class="h-list-h">
        🎧 <b>{props.staff ? "Online explanations" : "Explain online"}</b>
      </p>
      <div class="h-chips" role="tablist">
        {chips.map(([k, w, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={f === k}
            class={f === k ? "on" : ""}
            onClick={() => {
              setF(k);
              setWho("");
              setUnit("");
            }}
          >
            {w} <i>{n}</i>
          </button>
        ))}
      </div>
      {(units.length > 1 || kids.length > 1) && base.length > 4 && (
        <div class="h-chips sub">
          {units.length > 1 &&
            units.map((l) => (
              <button key={l.unitId} type="button" aria-pressed={unit === l.unitId} class={unit === l.unitId ? "on" : ""} onClick={() => setUnit(unit === l.unitId ? "" : l.unitId)}>
                Stage {l.no}
              </button>
            ))}
          {props.staff &&
            kids.length > 1 &&
            kids.map((l) => (
              <button key={l.sid} type="button" aria-pressed={who === l.sid} class={who === l.sid ? "on" : ""} onClick={() => setWho(who === l.sid ? "" : l.sid!)}>
                {l.sn}
              </button>
            ))}
        </div>
      )}
      {list.length === 0 ? (
        <p class="h-none">{props.staff ? (f === "mine" ? "Nothing waits on you." : "Nothing here.") : "எதுவும் காத்திருக்கவில்லை."}</p>
      ) : (
        <ul class="c-rows">
          {list.map((l) => (
            <li key={l.aid}>
              <button type="button" class={`c-row h-row${l.fresh ? " new" : ""}`} onClick={() => props.onRoom(l.id)}>
                {props.staff ? <span class="c-dface"><Avatar name={l.sn ?? "?"} pic={picOf(l.pic)} /></span> : <span class="c-gface">🎧</span>}
                <span class="c-row-w">
                  <b>
                    {props.staff && `${l.sn} · `}Q{l.q}
                    {props.staff && l.g !== undefined && <i class="f-gchip">{l.g}</i>}
                    {l.late && <i class="h-late">⏰</i>}
                  </b>
                  <small>
                    Stage {l.no} · Level {l.n}
                    {l.st === "open" ? (props.staff ? (l.mine ? "" : ` · ${l.tname}`) : ` · ${l.tname}`) : ` · ${props.staff ? STATE[l.st].en : STATE[l.st].ta}`}
                    {l.st === "open" && !l.ph ? (props.staff ? " · no photo yet" : " · 📷 படம் அனுப்பு") : ""}
                  </small>
                </span>
                <span class="c-row-r">
                  <small>{agoShort(l.st === "open" ? l.at : l.la)}</small>
                  {l.fresh && <i class="c-un">{props.staff ? "new" : "1"}</i>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
