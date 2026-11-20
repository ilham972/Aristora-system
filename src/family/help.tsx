// Online explanations (12 Nov 2026). His voice note: "it's not like video class, it's not like Zoom class. It's just
// explaining in the voice note like a WhatsApp ... small tiny pill like explain online ... that will open the new thread
// in the community ... that will ask the photo of the wrong question ... which teacher want to add". The server:
// convex/help.ts (a thread = a room of the chats, `k` "h"). Here, in the chats' own file (never in the first load):
// - AskSheet: the pill's sheet (his photo first, then a teacher; or the thread the question already has).
// - HelpTop: on top of a thread: the question, what each student typed with the wrong parts in rose, how it stands.
// - HelpMenu: the teacher's ⋮ (Understood, Not now, Send to another teacher, hide a name or a photo): never a big
//   button, his words: "mistakenly teachers can press that".
// - useVoiceRec / Voice: a voice note (the phone's own recorder: a teacher 2 minutes, a student 1; its 🎤 in the write
//   row), and its player.
// - HelpList: his explanations (or the teachers' queue) with its filters, on top of Chats.

import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { ChatMsg } from "../../convex/chat";
import type { HelpLine, HelpStart, HelpTeacher } from "../../convex/help";
import type { HelpAsk, HelpHead, HelpPart, HelpPhoto } from "../../convex/lib/helpView";
import { drawQuestion } from "../questionView";
import { keep, mutation, NetError, query, sameOr, uploadPhoto } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { agoShort, baseOf, sendPicked, usePicker } from "./talk";
import { Pics } from "./usPost";
import { Avatar, Icon, Maths, problemWords, Sheet, showSheet, toast, Waiting } from "./ui";

const LIST_MS = 20_000;

const STATE: Record<HelpAsk["st"], { ta: string; en: string; cls: string }> = {
  open: { ta: "காத்திருக்கிறது", en: "Waiting", cls: "open" },
  done: { ta: "✓ விளக்கப்பட்டது", en: "Explained", cls: "done" },
  class: { ta: "✓ வகுப்பில் விளக்கப்பட்டது", en: "Explained in class", cls: "done" },
  skip: { ta: "வகுப்பில் விளக்கம்", en: "In class", cls: "skip" },
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
const PAPER = `.qv{border-radius:10px;padding:6px 4px 2px;font:500 15.5px/1.5 "Baloo Thambi 2","Noto Sans Tamil",system-ui,sans-serif;color:#1c1a3a;-webkit-user-select:none;user-select:none;background:var(--paper-bg,#fff);filter:var(--paper-f,none)}
::slotted(*){filter:var(--paper-b,none);color:var(--ink,#1c1a3a)}
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
function Answer(props: { label: string; part?: HelpPart; k?: string; staff: boolean; slot?: string; photo?: HelpPhoto; first?: boolean; solo?: boolean }) {
  const p = props.part;
  // A part only a teacher marks, photographed at home: her marks, and the photo itself under the first such part.
  const ph = p?.ok === null ? props.photo : undefined;
  const marked = ph?.st === "done" && ph.got !== undefined;
  // In its slot the printed label is right above it: only a split part's note ("பெயர்") is said again.
  const label = props.slot ? (props.label.split(" · ")[1] ?? "") : props.label;
  const typed = p?.typed.some((t) => t);
  // His typed words for a teacher's part ("show that", "give a reason": `said`), not a photo (13 Nov 2026, his report:
  // the thread said "photo deleted" where his sentence should be). Her marks on the first such part.
  const words = ph?.said ? p!.typed.filter((t) => t).join(" · ") : "";
  const marks = marked ? `${ph!.got}/${ph!.max}${props.staff && ph!.by ? ` · ${ph!.by}` : ""}` : props.staff ? "not marked yet" : "இன்னும் திருத்தப்படவில்லை";
  // Each teacher's part by its own marks (13 Nov 2026, his report: one wrong sub-question turned every one red). Marked
  // before part-by-part marks were kept: right or wrong only when the total says it for all (full, 0, or one part).
  const own = p?.got !== undefined && p.m !== undefined;
  const tone = !marked ? "tch" : own ? (p!.got! >= p!.m! ? "ok" : "no") : ph!.got! >= ph!.max ? "ok" : ph!.got === 0 || props.solo ? "no" : "tch";
  return (
    <div class="h-ans" slot={props.slot}>
      {label && <small class="h-al">{label}</small>}
      {p && ph?.said ? (
        <>
          <span class={`h-a h-say ${tone}`}>
            <i class="h-ai" aria-hidden="true">✍</i>
            {words || (props.staff ? "nothing typed" : "எதுவும் எழுதவில்லை")}
            {own && marked && <em class="h-pm">{`${p.got}/${p.m}`}</em>}
          </span>
          {/* His ask (13 Nov 2026): each sub-question's own marks in its box, no total; the total only for marks kept
              before part by part (we can't split them), and for a teacher who marked it. */}
          {props.first && (own ? props.staff && marked && ph.by && <small class="h-amk">{`✍ ${ph.by}`}</small> : <small class="h-amk">{marks}</small>)}
        </>
      ) : p && ph ? (
        <span class={`h-a ${tone}`}>
          <i class="h-ai" aria-hidden="true">✍</i>
          {own && marked
            ? `${p.got}/${p.m}${props.first && props.staff && ph.by ? ` · ${ph.by}` : ""}`
            : !props.first
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
      {ph && !ph.said && props.first && (ph.urls.length ? <div class="h-aph"><Pics ph={ph.urls.map((u) => ({ s: u, b: u, w: 4, h: 3 }))} /></div> : <small class="h-al">{props.staff ? "(photo deleted)" : "(படம் நீக்கப்பட்டது)"}</small>)}
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
function Printed(props: { id: string; staff: boolean; ask?: HelpAsk; talk?: (b: string) => ComponentChildren; onParts?: (labels: string[]) => void }) {
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
  useEffect(() => {
    if (x) props.onParts?.(labels);
  }, [x, sig]);
  if (!x) return <Waiting />;
  const firstPhoto = parts?.findIndex((p) => p.ok === null) ?? -1;
  const solo = (parts?.filter((p) => p.ok === null).length ?? 0) === 1;
  // Each sub-question's talk after its last key part (a part cut in two for the phone is one printed sub-question).
  const last = new Map(labels.map((l, i) => [baseOf(l), i]));
  const rows = (slots: boolean) =>
    labels.flatMap((l, i) => {
      const t = last.get(baseOf(l)) === i && props.talk?.(baseOf(l));
      return [
        <Answer key={i} label={l} part={parts?.[i]} k={x.kp?.[i]?.a} staff={props.staff} slot={slots ? `p${i}` : undefined} photo={props.ask?.photo} first={i === firstPhoto} solo={solo} />,
        t && (
          <div key={`t${i}`} class="h-tks" slot={slots ? `p${i}` : undefined}>
            {t}
          </div>
        ),
      ];
    });
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

/** A card's short words: where his question stands (a teacher's English, a student's Tamil). */
const cardWords = (a: HelpAsk, staff: boolean) =>
  a.sg === "closed"
    ? staff
      ? STATE[a.st].en
      : STATE[a.st].ta
    : a.sg === "und"
      ? staff
        ? "✓ Understood"
        : "✓ புரிந்தது"
      : a.sg === "pend"
        ? staff
          ? "Pending"
          : "காத்திருக்கிறது"
        : a.rp
          ? staff
            ? "Replied"
            : "பதில் அனுப்பினார்"
          : staff
            ? "Follow-up"
            : "விளக்கம் வந்தது";

/**
 * On top of a thread: which question (Stage, Level, Q), each student's card, and the question with the picked student's
 * answer under each sub-question (the key beside it for a teacher). 16 Nov 2026, his words: "the student card ... is
 * not clickable ... I want to click who I want. So I can see the previous student how answered, next student how
 * answered": the cards are one row (any number of students; it scrolls sideways and keeps the picked one in view), a
 * whole card is the tap, ‹ › step to the previous and next; under them the picked one's state, ✓ Understood and ⋮. A
 * student sees his classmates' cards too, and their answers (his yes: "answers only": never their marks; a name or
 * photo the teacher hid stays hidden).
 */
export function HelpTop(props: {
  id: string;
  help: HelpHead;
  staff: boolean;
  onChange: () => void;
  onMate: (id: string) => void;
  onPhoto: () => void;
  /** The talk under each sub-question (talk.tsx useParts), the whole question's under the question. */
  talk?: (b: string) => ComponentChildren;
  onParts?: (labels: string[]) => void;
  after?: ComponentChildren;
}) {
  const h = props.help;
  const staff = props.staff;
  // The card shown: the one she tapped; else the row the list opened (pickAid) while he still waits (or nobody does);
  // else his own (a student), else the first still waiting.
  const [sel, setSel] = useState<string | null>(null);
  const [pref] = useState(() => {
    const p = pickAid;
    pickAid = null;
    return p;
  });
  const strip = useRef<HTMLUListElement>(null);
  usePics(h.asks.map((a) => a.pic));
  const rows = h.asks;
  const mine = rows.find((a) => a.mine);
  const first = rows.find((a) => a.st === "open");
  const pa = rows.find((a) => a.id === pref && (a.st === "open" || !first));
  const shown = rows.find((a) => a.id === sel) ?? pa ?? (staff ? (first ?? rows[0]) : mine) ?? rows[0];
  const at = shown ? rows.indexOf(shown) : -1;
  const go = (i: number) => {
    const a = rows[(i + rows.length) % rows.length];
    if (!a) return;
    buzz();
    sound("tap");
    setSel(a.id);
  };
  // The picked card in view (the row scrolls by itself, never the page).
  useEffect(() => {
    const el = strip.current;
    const c = el?.querySelector<HTMLElement>("li.sel");
    if (el && c && el.scrollWidth > el.clientWidth) el.scrollTo({ left: c.offsetLeft - (el.clientWidth - c.offsetWidth) / 2, behavior: "smooth" });
  }, [shown?.id, rows.length]);
  const whose = (a: HelpAsk) => (staff ? `${a.n}'s answers` : a.mine ? "உன் விடைகள்" : `${a.n} இன் விடைகள்`);
  return (
    <section class="h-top" aria-label={`Q${h.q}`}>
      {/* Q, Stage and Level are in the thread's header (20 Nov 2026, unslop: said once); here the unit. The question
          always shows (21 Nov 2026: its talk is under its sub-questions; the Hide switch went). */}
      <p class="h-top-h">{h.unit}</p>
      <ul class={`h-asks${rows.length > 1 ? "" : " one"}`} ref={strip} role="tablist" aria-label={staff ? "Students" : "மாணவர்கள்"}>
        {rows.map((a) => (
          <li key={a.id} class={`${STATE[a.st].cls} ${a.sg}${a.rp ? " rp" : ""}${a.st === "open" && a.su ? " und" : ""}${a.id === shown?.id ? " sel" : ""}`}>
            <button type="button" role="tab" class="h-who" aria-selected={a.id === shown?.id} aria-label={whose(a)} onClick={() => a.id !== shown?.id && go(rows.indexOf(a))}>
              <Avatar name={a.n} size="s" pic={picOf(a.pic)} />
              <span class="h-wt">
                <b>{a.mine ? "நீ" : a.n}</b>
                <small class="h-cw">{cardWords(a, staff)}</small>
              </span>
              {a.max !== undefined && a.got !== null && a.got !== undefined && (
                <em>
                  {a.got}/{a.max}
                </em>
              )}
            </button>
          </li>
        ))}
      </ul>
      {shown && rows.length > 1 && (
        <div class="h-nav">
          <button type="button" class="h-pn" aria-label="Previous student" onClick={() => go(at - 1)}>
            ‹
          </button>
          <p class="h-whose">
            {whose(shown)} <small>· {at + 1} / {rows.length}</small>
          </p>
          <button type="button" class="h-pn" aria-label="Next student" onClick={() => go(at + 1)}>
            ›
          </button>
        </div>
      )}
      {staff && shown && (
        <div class={`h-sel ${STATE[shown.st].cls} ${shown.sg}${shown.st === "open" && shown.su ? " und" : ""}`}>
          <span class="h-st">
            {shown.st !== "open" ? STATE[shown.st].en : shown.su ? "✓ He understood · your ✓ closes it" : STAGES.find(([k]) => k === shown.sg)?.[1]}
            {shown.st === "done" && shown.by ? ` · ${shown.by}` : ""}
            {shown.st === "open" && !shown.su ? (shown.tu ? " · you tapped: waiting on him" : shown.pw && !shown.ph ? " · photo asked" : shown.rp ? " · he replied" : "") : ""}
            {shown.hn || shown.hp ? ` · ${shown.hn && shown.hp ? "name, photo" : shown.hn ? "name" : "photo"} hidden` : ""}
          </span>
          {shown.st === "open" && (
            <button
              type="button"
              class={`h-ub${shown.su ? " on" : ""}`}
              disabled={!!shown.tu && !shown.su}
              aria-label={`${shown.n} understood`}
              onClick={() =>
                void mutation("help:tdone", { id: props.id, aid: shown.id }).then(
                  (r) => {
                    sound("send");
                    toast((r as { n: number }).n ? `Closed ✓ ${shown.n} understood: it counts in class too.` : `${shown.n} is asked: it closes when he taps ✓ I understood.`);
                    props.onChange();
                  },
                  (e) => toast(problemWords(e), true),
                )
              }
            >
              ✓ Understood
            </button>
          )}
          <button type="button" class="h-dots" aria-label={`More for ${shown.n}`} onClick={() => showSheet((close) => <AskMenu a={shown} onClose={close} onChange={props.onChange} />)}>
            ⋮
          </button>
        </div>
      )}
      <Printed id={props.id} staff={staff} ask={shown} talk={props.talk} onParts={props.onParts} />
      {props.after}
      {!staff && mine?.st === "open" && (
        <div class="h-wait">
          {mine.pw && !mine.ph && (
            <button type="button" class="f-btn white" onClick={props.onPhoto}>
              <Icon name="camera" size={18} /> உன் வழிமுறையின் படத்தை அனுப்பு
            </button>
          )}
          {mine.su ? (
            <p class="h-und">✓ நீ புரிந்தது என்றாய். ஆசிரியரும் ✓ அழுத்தியதும் thread மூடும்.</p>
          ) : (
            <>
              <p>
                {mine.tu ? (
                  <>
                    <b>{h.tname} ஆசிரியர்</b> விளக்கி முடித்தார். புரிந்ததா?
                  </>
                ) : (
                  <>
                    <b>{h.tname} ஆசிரியர்</b> விளக்குவார். பதில் வந்ததும் phone சொல்லும்.
                  </>
                )}
              </p>
              <button
                type="button"
                class={`f-btn ${mine.tu ? "go" : "white"}`}
                onClick={() =>
                  void mutation("help:understood", { id: props.id }).then(
                    (r) => {
                      sound("send");
                      toast((r as { closed: boolean }).closed ? "✓ முடிந்தது! thread மூடப்பட்டது." : "✓ ஆசிரியருக்குச் சொன்னோம்.");
                      props.onChange();
                    },
                    (e) => toast(problemWords(e), true),
                  )
                }
              >
                ✓ எனக்குப் புரிந்தது
              </button>
            </>
          )}
        </div>
      )}
      {/* One line (20 Nov 2026): who it waits on. How it closes is the ✓ Understood toast's, not a sentence on every thread. */}
      {staff && (
        <p class={`h-wait${h.late ? " late" : ""}`}>
          {h.open ? (
            <>
              Waiting on <b>{h.own ? "you" : h.tname}</b>
              {h.late ? " · over 12 hours" : ""}
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
      {a.st === "open" && (
        <button type="button" class="h-mi go" disabled={a.pw && !a.ph} onClick={() => void run("help:tphoto", { aid: a.id }, "Asked: his phone tells him to send the photo.")}>
          {a.pw && !a.ph ? "📷 Photo asked: waiting for it" : "📷 Ask for his working photo"}
        </button>
      )}
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
 * Her 🤖 in a thread (15 Nov 2026, his ask: "I explain with my voice note but still they can't understand ... put the
 * AI explanation button ... step by step ... in a funny way with emojis"): the AI explains the question again, in a new
 * way, to everyone waiting, and then answers their questions in the thread. Her note tells it what to focus on.
 */
export function AiExplainSheet(props: { id: string; waiting: number; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ state: string; err: string | null; at: number } | null>(null);
  useEffect(() => {
    query("ai:teachState", { id: props.id }).then(
      (r) => setLast(r as typeof last),
      () => undefined,
    );
  }, [props.id]);
  const go = () => {
    if (busy) return;
    setBusy(true);
    mutation("ai:explain", { id: props.id, ...(note.trim() ? { note: note.trim() } : {}) }).then(
      () => {
        sound("send");
        toast("🤖 The AI is writing: its explanation comes into the thread in about half a minute.");
        props.onClose();
      },
      (e) => {
        setBusy(false);
        toast(problemWords(e), true);
      },
    );
  };
  return (
    <Sheet title="🤖 AI explain" sub={`Step by step in Tamil, with a little fun and emojis, for ${props.waiting ? `the ${props.waiting} waiting` : "this thread"}. Then it answers their questions here.`} onClose={props.onClose} class="h-menu h-aix">
      {last?.state === "work" && <p class="h-aix-st">🤖 It is writing now…</p>}
      {last?.state === "fail" && <p class="h-aix-st no">Last time: {last.err}</p>}
      <textarea class="h-aix-note" rows={2} maxLength={400} placeholder="What should it focus on? (not needed)" value={note} onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
      <button type="button" class="h-mi go" disabled={busy || last?.state === "work"} onClick={go}>
        {busy ? "…" : "🤖 Explain now"}
      </button>
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
          <button
            type="button"
            class="h-mi go"
            disabled={!open.length}
            onClick={() =>
              sure
                ? void mutation("help:tdone", { id: props.id }).then(
                    (r) => {
                      const x = r as { n: number; w: number };
                      sound("send");
                      toast(`${x.n ? `Closed ✓ ${x.n}: it counts in class too. ` : ""}${x.w ? `${x.w} still to tap ✓ I understood (they are asked).` : ""}`);
                      props.onClose();
                      props.onChange();
                    },
                    (e) => toast(problemWords(e), true),
                  )
                : setSure(true)
            }
          >
            {sure ? `Tap again: understood for ${open.length === 1 ? open[0].n : `all ${open.length}`}` : "✓ Understood (everyone waiting)"}
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
          <p class="h-note">It closes for a student when he taps ✓ I understood and a teacher taps ✓ Understood. Asking for his photo, Not now, hiding a name or a photo: ⋮ beside each student.</p>
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
 * app), ■ stops (by itself at `max` seconds), then it is heard and sent or dropped. Since 20 Nov 2026 (his yes: "in
 * the write row") two pieces for the write bar (talk.tsx WriteBar `voice`): `mic`, in the send button's place while
 * the box is empty, and `strip`, the recorder that takes the write row's place while it records or waits to be sent.
 */
export function useVoiceRec(props: { onSend: (au: { f: string; d: number }) => Promise<unknown>; max: number; staff: boolean }): { mic: ComponentChildren; strip: ComponentChildren | null; start: () => void } {
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
  const mic = (
    <button type="button" class="f-tb-go h-mic" aria-label="Record a voice note" onClick={() => void start()}>
      <Icon name="mic" size={22} />
    </button>
  );
  // 🎤 under a sub-question (21 Nov 2026) starts it too; a second tap while it records does nothing.
  const go = () => void (st === "idle" && start());
  if (st === "idle") return { mic, strip: null, start: go };
  const strip = (
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
  return { mic, strip, start: go };
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

type Stage = HelpLine["sg"];
/** The pipeline (16 Nov 2026, his words: "pending ... follow-up ... understood ... closed"): the boxes' order and names. */
const STAGES: [Stage, string][] = [
  ["pend", "Pending"],
  ["fol", "Follow-up"],
  ["und", "Understood"],
  ["closed", "Closed"],
];

/** A row opened from the list: whose card the thread's top picks first (HelpTop). */
let pickAid: string | null = null;

/** Waits on this phone: a teacher's every stage but Closed when he wrote last; a student's when the teacher did. */
const needs = (l: HelpLine, staff: boolean) => (staff ? l.sg === "pend" || l.sg === "und" || (l.sg === "fol" && !!l.rp) : l.sg === "fol" && !l.rp);

/** The words under a row (a teacher's English, a student's Tamil), from where it stands. Plain words: the row's stage
 *  dot says the rest (20 Nov 2026, unslop: no emoji in front of every line). */
function said(l: HelpLine, staff: boolean, who: string): string {
  if (l.sg === "closed") return staff ? `${STATE[l.st].en}${l.by ? ` · ${l.by}` : ""}` : STATE[l.st].ta;
  if (l.sg === "und") return staff ? `✓ ${who} understood: your ✓ closes it` : "✓ நீ புரிந்தது என்றாய்";
  if (l.sg === "pend") return staff ? (l.late ? "Nobody answered for 12 hours" : "Not explained yet") : `${l.tname} ஆசிரியர் விளக்குவார்`;
  if (l.rp) return staff ? `${who} replied` : "ஆசிரியரின் பதிலுக்காக";
  if (l.pw && !l.ph) return staff ? "Photo asked" : "படம் அனுப்பு";
  if (l.tu) return staff ? "You tapped ✓ · waiting on him" : "புரிந்ததா? ✓ அழுத்து";
  return staff ? "Waiting on him" : "ஆசிரியர் பதில் அனுப்பினார்";
}

/**
 * The Thread page (16 Nov 2026, his voice note: "I forget to check the message from the students ... everything in one
 * list ... I'm going to scale this up to 100 students, 200 students ... add filters like CRMs ... group the thread by
 * the student's name ... like in the Discord ... the students' profiles in the left side, tiny bar ... the count of each
 * student ... some threads have two or three students: show the three profiles"):
 * - the pipeline: Pending · Follow-up · Understood · Closed, each with its count (a teacher: Mine | All); Follow-up's
 *   red dot = the ones waiting on this phone (her: he replied; him: the teacher answered), first in its list;
 * - the rail on the left: a teacher's students (a student's: his Stages), each with its count in the stage picked;
 * - one row per thread: its students' faces (a group thread: up to three), the question, where it stands.
 */
export function HelpList(props: {
  staff: boolean;
  onRoom: (id: string) => void;
  /** Shown when he has no thread yet (the Chat tab's first section). */
  empty?: ComponentChildren;
  /** A teacher's Mine | All (20 Nov 2026: its switch sits in the tab's header, ChatTab; kept as helpAll). */
  all?: boolean;
}) {
  const staff = props.staff;
  const key = staff ? "helpT" : "helpMine";
  const [d, setD] = useState<HelpLine[] | null>(() => keep<HelpLine[]>(key));
  const all = staff && !!props.all;
  const [sg, setSg] = useState<Stage | null>(null);
  const [pick, setPick] = useState("");
  // Mine ↔ All: the student picked on the rail may not be in the other list.
  useEffect(() => setPick(""), [all]);
  useEffect(() => {
    const load = () =>
      query(staff ? "help:tlist" : "help:mine").then(
        (x) => {
          const lines = staff ? (x as { lines: HelpLine[] }).lines : (x as HelpLine[]);
          keep(key, lines);
          setD((shown) => sameOr(shown, lines));
        },
        () => {},
      );
    void load();
    const t = window.setInterval(() => document.visibilityState === "visible" && void load(), LIST_MS);
    return () => window.clearInterval(t);
  }, []);
  usePics((d ?? []).map((l) => l.pic));
  if (!d) return null;
  // A line from before this version (kept on the phone) has no stage: it waits for the first read.
  if (!d.length || !d[0].sg) return d.length ? <Waiting /> : (props.empty ?? null);
  const tap = (f: () => void) => {
    buzz();
    sound("tap");
    f();
  };
  // Mine: hers, and any nobody answered for 12 hours; All: every teacher's.
  const scope = staff && !all ? d.filter((l) => l.mine || l.late) : d;
  // The rail groups by student (a teacher) or by Stage (a student).
  const grp = (l: HelpLine) => (staff ? (l.sid ?? "") : l.unitId);
  const of = (s: Stage) => scope.filter((l) => l.sg === s && (!pick || grp(l) === pick));
  // The stage on screen: hers, else the first with something waiting on this phone, else the first not empty.
  const at = sg ?? STAGES.find(([s]) => of(s).some((l) => needs(l, staff)))?.[0] ?? STAGES.find(([s]) => of(s).length)?.[0] ?? "pend";
  // A queue for a teacher (the oldest first); the newest first for a student; what waits on this phone first.
  const sorted = (ls: HelpLine[]) =>
    [...ls].sort((a, b) => Number(needs(b, staff)) - Number(needs(a, staff)) || (at === "closed" || !staff ? b.la - a.la : at === "pend" ? a.at - b.at : a.la - b.la));
  const inStage = sorted(scope.filter((l) => l.sg === at));
  const list = inStage.filter((l) => !pick || grp(l) === pick);
  // One row per thread: the lines of its students in this stage, in order.
  const rows = [...list.reduce((m, l) => m.set(l.id, [...(m.get(l.id) ?? []), l]), new Map<string, HelpLine[]>()).values()];
  // The rail: everyone with something in this stage (in the list's order), and the one picked even at 0.
  const rail = [...new Map(inStage.map((l) => [grp(l), l])).values()];
  if (pick && !rail.some((l) => grp(l) === pick)) {
    const was = scope.find((l) => grp(l) === pick);
    if (was) rail.unshift(was);
  }
  const size = (id: string) => (staff ? new Set(d.filter((l) => l.id === id).map((l) => l.sid)).size : (d.find((l) => l.id === id)?.k ?? 1));
  const urgent = (ls: HelpLine[]) => ls.filter((l) => needs(l, staff)).length;
  const open = (ls: HelpLine[]) => {
    pickAid = ls[0].aid;
    props.onRoom(ls[0].id);
  };
  return (
    <section class="h-list" aria-label={staff ? "Online explanations" : "Explain online"}>
      <div class="h-pipe" role="tablist" aria-label="Where it stands">
        {STAGES.map(([s, w]) => {
          const ls = of(s);
          const n = new Set(ls.map((l) => l.id)).size;
          const u = urgent(ls);
          return (
            <button key={s} type="button" role="tab" aria-selected={at === s} class={`${s}${at === s ? " on" : ""}${n ? "" : " zero"}`} onClick={() => tap(() => setSg(s))}>
              <b>{n}</b>
              <small>{w}</small>
              {s === "fol" && u > 0 && <i aria-label={`${u} waiting on you`}>{u}</i>}
            </button>
          );
        })}
      </div>
      <div class="h-body">
        <nav class="h-rail" aria-label={staff ? "Students" : "Stages"}>
          <button type="button" aria-pressed={!pick} class={`h-ri all${pick ? "" : " on"}`} onClick={() => tap(() => setPick(""))}>
            <span class="h-rf">
              <Icon name={staff ? "people" : "map"} size={18} />
            </span>
            <small>All</small>
          </button>
          {rail.map((l) => {
            const g = grp(l);
            const mine = inStage.filter((x) => grp(x) === g);
            const n = new Set(mine.map((x) => x.id)).size;
            return (
              <button key={g} type="button" aria-pressed={pick === g} class={`h-ri${pick === g ? " on" : ""}${n ? "" : " zero"}`} aria-label={staff ? l.sn : `Stage ${l.no}`} onClick={() => tap(() => setPick(pick === g ? "" : g))}>
                {staff ? <Avatar name={l.sn ?? "?"} pic={picOf(l.pic)} /> : <span class="h-rf st">{l.no}</span>}
                <small>{staff ? (l.sn ?? "").split(" ")[0] : `Stage ${l.no}`}</small>
                {n > 0 && <i class={urgent(mine) ? "hot" : ""}>{n}</i>}
              </button>
            );
          })}
        </nav>
        <div class="h-main">
          {rows.length === 0 ? (
            <p class="h-none">{staff ? (at === "pend" ? "Nothing pending." : "Nothing here.") : at === "closed" ? "மூடிய thread இல்லை." : "எதுவும் இல்லை."}</p>
          ) : (
            <ul class="c-rows">
              {rows.map((ls, i) => {
                const l = ls[0];
                const prev = rows[i - 1]?.[0];
                const many = size(l.id);
                // Follow-up in two parts: what waits on this phone, then the rest under a line.
                const cut = at === "fol" && prev && needs(prev, staff) && !needs(l, staff);
                const fresh = ls.some((x) => x.fresh);
                const who = ls.length > 1 ? `${ls[0].sn?.split(" ")[0]} +${ls.length - 1}` : (l.sn ?? "");
                return (
                  <li key={l.id} class={cut ? "cut" : ""}>
                    {cut && <p class="h-cut">{staff ? "Waiting on him" : "ஆசிரியருக்காக"}</p>}
                    <button type="button" class={`c-row h-row ${at}${fresh ? " new" : ""}${needs(l, staff) ? " hot" : ""}`} onClick={() => open(ls)}>
                      {/* A teacher's row: its students' faces; a student's: the teacher who explains (never one icon on every row). */}
                      <span class={`h-faces n${staff ? Math.min(ls.length, 3) : 1}`}>
                        {staff ? ls.slice(0, 3).map((x) => <Avatar key={x.aid} name={x.sn ?? "?"} pic={picOf(x.pic)} />) : <Avatar name={l.tname} />}
                      </span>
                      <span class="c-row-w">
                        <b>
                          {staff && `${who} · `}Q{l.q}
                          {staff && ls.length === 1 && l.g !== undefined && <i class="f-gchip">{l.g}</i>}
                          {many > ls.length && (
                            <i class="h-many" aria-label={`${many} students`}>
                              <Icon name="people" size={13} />
                              {many}
                            </i>
                          )}
                          {l.late && (
                            <i class="h-late" aria-label="Over 12 hours">
                              <Icon name="clock" size={14} />
                            </i>
                          )}
                        </b>
                        <small>
                          Stage {l.no} · Level {l.n}
                          {!staff && l.sg !== "closed" ? ` · ${l.tname}` : ""}
                        </small>
                        <small class="h-say1">{said(l, staff, ls.find((x) => x.rp)?.sn?.split(" ")[0] ?? who.split(" ")[0])}</small>
                      </span>
                      <span class="c-row-r">
                        <small>{agoShort(at === "pend" ? l.at : l.la)}</small>
                        {fresh && <i class="h-new" aria-label="New" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
