// A line of Us opened, and what students write there. Part of Us's own file (usParts.ts: fetched by a phone once Us is
// open), for the students' Us and the teachers' (staff.tsx: the same screens with her sign-in; net.ts sends her calls to
// the teachers' functions).
// - Pics: a line's photos (the small copies: ~40 KB each in the feed); a tap shows the big one full screen, a tap there
//   zooms (the page itself never zooms).
// - Composer: words and photos (the camera or the gallery, cropped first: crop.tsx), then Send. Each photo goes as two
//   copies: 1280 px for a tap, 560 px for the lines.
// - ThreadScreen (7 Nov 2026 for questions and doubts; 8 Nov 2026 every line, his voice note: "if I go to inside any
//   thread, that feel like boring ... who appreciating, who correcting ... student can chat inside each thread"): the
//   line, who cheered (faces, teachers first), a question's answers (his rule: hidden until he sends his own, then the
//   ones a teacher marked right, with names; since 8 Nov 2026 blurred, not locked: Veil), and the talk: comments with
//   names, oldest first, a reply showing the message it answers, @tags, reactions, a teacher's ✓ or her correction
//   with her name (talk.tsx: Bubble, WriteBar); at the bottom his words (one-tap words for a child, his own for +1
//   XP). A doubt's talk is its replies (the one who asked is never named). A teacher sees every name and ✓ ✗ ✎ ✕.
// - DoubtSheet: his doubt, and who sees it (teachers, seniors, both: his choice). LearnSheet: his 💡, what he learned.
// The words a student reads are Tamil; buttons English.

import type { ComponentChildren, VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { UsCheer, UsItem, UsPic, UsReply, UsThread, UsVeil } from "../../convex/lib/us";
import { keep, mutation, NetError, query } from "./net";
import { picOf, usePics } from "./pics";
import { buzz, sound } from "./sound";
import { Bubble, jumpTo, ReactorsSheet, seedUrl, sendPicked, usePicker, WriteBar, type Sent, type Taggable } from "./talk";
import { Avatar, Icon, Owl, problemWords, Sheet, showSheet, toast, Waiting } from "./ui";
import { ago, ASK, Face, KIND, LineWords, markSeen, MARK, seenAt, Who } from "./us";

// The photos picked for a message live in talk.tsx (8 Nov 2026: the chats use them too); here for the teachers' tools.
export { pickedOf, sendPicked } from "./talk";
export type { Picked, Sent } from "./talk";

/** Who a doubt is for, in his words. */
export const AUD: Record<string, string> = { t: "ஆசிரியர்கள்", s: "மூத்த மாணவர்கள்", ts: "ஆசிரியர்கள் + மூத்தவர்கள்" };
/** A comment's letters (convex/lib/us.ts TALK_MAX). */
const TALK_MAX = 200;
/** The open thread reads again this often while it is on screen (someone may be writing). */
const POLL_MS = 20_000;

/**
 * One-tap words under a line (a copy of convex/lib/us.ts QUICK: tests/usTalk.test.ts checks they match): 👏 with words,
 * never XP.
 */
const QUICK = {
  bday: ["🎂 பிறந்தநாள் வாழ்த்துகள்!", "🎉 இனிய நாள்!", "🥳 சூப்பர் நாளாகட்டும்!"],
  win: ["🎉 வாழ்த்துகள்!", "💪 சூப்பர்!", "🔥 தொடர்ந்து செய்!", "👏 அருமை!"],
  hi: ["👋 வருக!", "🎉 வாழ்த்துகள்!", "💪 சேர்ந்து கற்போம்!"],
  learn: ["💡 நல்ல குறிப்பு!", "🙏 நன்றி!", "👏 அருமை!"],
  post: ["🙏 நன்றி!", "👍 சரி!", "✅ செய்கிறேன்!"],
  talk: ["🙏 நன்றி!", "💡 புரிந்தது!", "🤔 எப்படி?"],
} as const;
function quickOf(m: Pick<UsItem, "k" | "qn">): readonly string[] {
  if (m.k === "bday") return QUICK.bday;
  if (m.k === "home1" || m.k === "back") return QUICK.hi;
  if (m.k === "learn") return QUICK.learn;
  if (m.k === "ask" || m.qn) return QUICK.talk;
  if (m.k === "post" || m.k === "count") return QUICK.post;
  return QUICK.win;
}

/** A photo full screen (the big copy); a tap zooms in and out; several: dots to the next. A teacher: ⬇ and Share at the bottom. */
function Big(props: { ph: UsPic[]; i: number; onClose: () => void; save?: Omit<SaveInfo, "urls"> }) {
  const [i, setI] = useState(props.i);
  const [z, setZ] = useState(false);
  const p = props.ph[i] ?? props.ph[0];
  return (
    <div class="f-lb" role="dialog" aria-modal="true" aria-label="Photo">
      <div class={`f-lb-in${z ? " z" : ""}`} onClick={() => setZ(!z)}>
        <img src={p.b} alt="" width={p.w} height={p.h} />
      </div>
      <button type="button" class="f-round f-lb-x" aria-label="Close" onClick={props.onClose}>
        <Icon name="close" size={22} />
      </button>
      {props.save && tools && (
        <div class="f-lb-save">
          <tools.Save x={{ ...props.save, urls: [p.b] }} />
        </div>
      )}
      {props.ph.length > 1 && (
        <div class="f-lb-n">
          {props.ph.map((_, j) => (
            <button
              key={j}
              type="button"
              class={j === i ? "on" : ""}
              aria-label={`Photo ${j + 1}`}
              onClick={() => {
                setI(j);
                setZ(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Teachers' own tools (8 Nov 2026): 🔍 "find the mistake" (a wrong answer asked again without the name) and ⬇ Download
 * / Share under a student's photos (his rule: away from ✕). staff.tsx hands them over (setStaffTools), so students'
 * phones never download them; without them nothing shows.
 */
export type SaveInfo = { urls: string[]; name: string; text: string };
export type SpotProps = { r: UsReply; q: UsItem; onClose: () => void; onDone: () => void };
export type StaffTools = { Spot: (p: SpotProps) => VNode; Save: (p: { x: SaveInfo }) => VNode };
let tools: StaffTools | null = null;
export function setStaffTools(t: StaffTools): void {
  tools = t;
}

/** The words a teacher sends with a student's photo (8 Nov 2026): his name only on an answer marked right. */
function shareWords(r: Pick<UsReply, "ok" | "n">): string {
  if (r.ok === true && r.n) return `✓ ${r.n} இன் சரியான விடை! 🎉 நீயும் ARISTORA app இல் உன் விடையை அனுப்பு: app.aristora.org`;
  if (r.ok === false) return "🔍 இந்த விடையில் என்ன தவறு? ARISTORA app இல் சொல்: app.aristora.org";
  return "📝 ARISTORA app இல் வந்த ஒரு விடை. நீயும் உன் விடையை அனுப்பு: app.aristora.org";
}
const fileBase = (at: number) => `aristora-${new Date(at).toISOString().slice(0, 10)}`;

/** A line's photos (small copies; one alone keeps its shape up to a height); a tap: the big one. `save`: a teacher's ⬇ and Share. */
export function Pics(props: { ph: UsPic[]; save?: Omit<SaveInfo, "urls"> }) {
  const one = props.ph.length === 1;
  return (
    <>
    <div class={`f-pics n${Math.min(props.ph.length, 3)}`}>
      {props.ph.map((p, i) => (
        <button
          key={p.s}
          type="button"
          class="f-pic"
          aria-label={`Photo ${i + 1}`}
          style={one ? { aspectRatio: `${p.w} / ${p.h}` } : undefined}
          onClick={(e) => {
            e.stopPropagation();
            buzz();
            showSheet((close) => <Big ph={props.ph} i={i} onClose={close} save={props.save} />);
          }}
        >
          <img src={p.s} alt="" loading="lazy" decoding="async" />
        </button>
      ))}
    </div>
    {props.save && tools && <tools.Save x={{ ...props.save, urls: props.ph.map((p) => p.b) }} />}
    </>
  );
}

/** Words and photos, then Send: an answer, a doubt, a 💡 post, a teacher's post. `onSend` gets the words and the photos (uploaded). */
export function Composer(props: {
  ph: string;
  go: string;
  say?: string;
  crop?: string;
  max?: number;
  /** The words to start with (a teacher's starter, a 💡 sentence). */
  init?: string;
  onSend: (text: string, ph: Sent[]) => Promise<unknown>;
}) {
  const max = props.max ?? 2;
  const [t, setT] = useState(props.init ?? "");
  const [busy, setBusy] = useState(false);
  const pk = usePicker(max, props.crop);
  const empty = !t.trim() && !pk.list.length;
  const send = async () => {
    if (busy || empty) return;
    setBusy(true);
    try {
      const ph = await sendPicked(pk.list);
      await props.onSend(t.trim(), ph);
      sound("send");
      pk.clear();
      setT("");
    } catch (e) {
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. பிறகு அனுப்பு." : problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="f-uc">
      <textarea class="f-replybox" rows={3} maxLength={300} placeholder={props.ph} aria-label={props.ph} value={t} onInput={(e) => setT((e.target as HTMLTextAreaElement).value)} />
      <div class="f-take-row">
        {pk.thumbs}
        {!pk.full && (
          <button type="button" class="f-cam" aria-label="Add a photo" onClick={pk.pick}>
            <Icon name="camera" size={22} />
            <small>{pk.list.length ? "இன்னொன்று" : "படம்"}</small>
          </button>
        )}
        {pk.picker}
        <button type="button" class="f-btn go f-uc-go" disabled={busy || empty} onClick={() => void send()}>
          {busy ? "…" : props.go}
        </button>
      </div>
      {props.say && <p class="f-uc-say">{props.say}</p>}
    </div>
  );
}

/** The grades a post is for, in a few letters. */
export const gradesWords = (gs?: number[]) => (gs ? `Grade ${gs.join(", ")}` : "எல்லோருக்கும்");

/** Who wrote a message, as the one looking may know (lib/us.ts replyOf sends a name only when he may see it). */
function whoOf(r: UsReply, staff: boolean): string {
  if (r.tch) return r.n ?? "ஆசிரியர்";
  if (r.mine) return "நீ";
  if (r.ask && !staff) return "கேட்டவர்";
  return r.n ?? "மாணவர்";
}

/**
 * Made-up words under the blur, never a classmate's (the server sends none, only about how many lines): if a child
 * squints, they only tease ("send yours first").
 */
const FAKE = ["🙈 உன் விடையை அனுப்பு, பிறகு பார் ", "✍️ முதலில் நீ, பிறகு நான் ", "🤫 ஆசிரியர் சரி என்றால் திறக்கும் ", "🔐 இது ஒரு ரகசிய விடை "];

/**
 * The answers he may not see yet, blurred (8 Nov 2026, his voice note: "instead of showing nothing, we can show the blur
 * option ... student will eager to put their answer ... this will give so much community vibe"): each answer as a card
 * with no face and no name, its photo as a few squares of colour blurred, its words made-up and blurred. A tap on one:
 * write yours first. (A server from before sends no `veil`: lock tiles, as before.)
 */
function Veil(props: { n: number; sent: boolean; v?: UsVeil[]; onGo?: () => void }) {
  const cards = (props.v ?? []).slice(-12);
  const extra = props.n - cards.length;
  const tease = () => {
    buzz(12);
    sound("boing");
    if (props.sent) toast("ஆசிரியர் சரி என்றதும் இது திறக்கும் 🔓");
    else props.onGo?.();
  };
  return (
    <section class="f-locks f-veil" aria-label={`${props.n} hidden`}>
      <p>
        {props.sent
          ? `இன்னும் ${props.n} விடைகள் மறைவில். ஆசிரியர் சரி என்றவை மட்டும் இங்கே தெரியும்.`
          : `${props.n} பேர் விடை அனுப்பினார்கள். நீ அனுப்பிய பின், ஆசிரியர் சரி என்ற விடைகள் தெரியும்.`}
      </p>
      {cards.length ? (
        <ol class="f-veil-l">
          {cards.map((x, i) => (
            <li key={i} class="f-veil-c" style={{ "--i": String(i) }} onClick={tease}>
              <span class="f-veil-ava" />
              <div class="f-veil-w">
                <i class="f-veil-n" />
                {x.w > 0 && (
                  <p class="f-veil-t" aria-hidden="true">
                    {FAKE[i % FAKE.length].repeat(x.w).slice(0, x.w * 28)}
                  </p>
                )}
                {x.p > 0 && (
                  <div class="f-veil-ph">
                    {Array.from({ length: Math.min(2, x.p) }, (_, j) => {
                      const u = x.z[j] ? seedUrl(x.z[j]) : null;
                      return <span key={j}>{u ? <img src={u} alt="" /> : null}</span>;
                    })}
                  </div>
                )}
              </div>
              <b class="f-veil-lock" aria-hidden="true">
                <Icon name="lock" size={15} />
              </b>
            </li>
          ))}
        </ol>
      ) : (
        <div class="f-locks-g" aria-hidden="true">
          {Array.from({ length: Math.min(props.n, 12) }, (_, i) => (
            <i key={i}>
              <Icon name="lock" size={18} />
            </i>
          ))}
        </div>
      )}
      {extra > 0 && <b class="f-veil-more">+{extra}</b>}
      {!props.sent && props.onGo && (
        <button type="button" class="f-btn go f-veil-go" onClick={props.onGo}>
          ✍️ உன் விடையை அனுப்பு: மறைவு விலகும்
        </button>
      )}
    </section>
  );
}

/** ✎ A teacher's words to him with her mark (only he sees them): an answer to her question. */
function NoteSheet(props: { r: UsReply; q: boolean; onClose: () => void; onMark: (ok: boolean, note: string) => Promise<unknown> }) {
  const [t, setT] = useState(props.r.note ?? "");
  const go = (ok: boolean) => void props.onMark(ok, t).then(props.onClose);
  return (
    <Sheet title={`✎ Your words to ${props.r.n ?? "the student"}`} sub="அவருக்கு மட்டும் தெரியும்: ஒரு குறிப்பு, ஒரு hint, ஒரு வாழ்த்து." onClose={props.onClose}>
      <textarea class="f-replybox" rows={3} maxLength={200} value={t} aria-label="Your words" onInput={(e) => setT((e.target as HTMLTextAreaElement).value)} />
      <div class="f-ur-two">
        <button type="button" class="f-btn go" onClick={() => go(true)}>
          ✓ Right
        </button>
        {props.q && (
          <button type="button" class="f-btn white" onClick={() => go(false)}>
            ✗ Not right
          </button>
        )}
      </div>
    </Sheet>
  );
}

/** ✎ A teacher's correction on a reply or a comment: everyone who sees it reads it, with her name (8 Nov 2026). */
function FixSheet(props: { r: UsReply; onClose: () => void; onFix: (t: string | null) => Promise<unknown> }) {
  const [t, setT] = useState(props.r.fix ?? "");
  return (
    <Sheet title="✎ Correct it" sub="இதைப் பார்க்கும் எல்லோருக்கும் உங்கள் பெயருடன் தெரியும்: சரியான வழி, ஒரு குறிப்பு." onClose={props.onClose}>
      <textarea class="f-replybox" rows={3} maxLength={200} value={t} aria-label="Your correction" onInput={(e) => setT((e.target as HTMLTextAreaElement).value)} />
      <div class="f-ur-two">
        <button type="button" class="f-btn go" disabled={!t.trim()} onClick={() => void props.onFix(t.trim()).then(props.onClose)}>
          ✎ Save
        </button>
        {props.r.fix ? (
          <button type="button" class="f-btn white" onClick={() => void props.onFix(null).then(props.onClose)}>
            Take it away
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}

/** ✗ "Not this time" for a 💡 post: her words to him (only he sees them). */
function NotNowSheet(props: { onClose: () => void; onSend: (note: string) => Promise<unknown> }) {
  const [t, setT] = useState("");
  return (
    <Sheet title="Not this time" sub="அவருக்கு மட்டும் தெரியும்: என்ன சேர்க்கலாம், எதைத் திருத்தலாம்." onClose={props.onClose}>
      <textarea class="f-replybox" rows={3} maxLength={200} value={t} aria-label="Your words" onInput={(e) => setT((e.target as HTMLTextAreaElement).value)} />
      <button type="button" class="f-btn white" style={{ width: "100%", marginTop: "12px" }} onClick={() => void props.onSend(t.trim()).then(props.onClose)}>
        ✗ Not this time
      </button>
    </Sheet>
  );
}

/** Who cheered a line, everyone (teachers first); a student's name opens his profile. */
function CheersSheet(props: { tc: string[]; cheers: UsCheer[]; onClose: () => void; onMate: (id: string) => void }) {
  usePics(props.cheers.map((c) => c.pic));
  return (
    <Sheet title={`👏 ${props.tc.length + props.cheers.length}`} sub="பாராட்டியவர்கள்" onClose={props.onClose} class="f-cheers">
      <ul class="f-cheer-l">
        {props.tc.map((n) => (
          <li key={`t.${n}`} class="tch">
            <Avatar name={n} size="s" />
            <b>{n}</b>
            <i>ஆசிரியர்</i>
          </li>
        ))}
        {props.cheers.map((c) => (
          <li key={c.sid}>
            <button
              type="button"
              onClick={() => {
                props.onClose();
                props.onMate(c.sid);
              }}
            >
              <Avatar name={c.n} size="s" pic={picOf(c.pic)} />
              <b>{c.n}</b>
              {c.g !== undefined && <i class="f-gchip">{c.g}</i>}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/** A message of the talk, an answer or a reply, as a Bubble (talk.tsx): its name as he may know it, its marks under it. */
function Msg(props: {
  r: UsReply;
  staff: boolean;
  onMate: (id: string) => void;
  /** A teacher's buttons and ⚑ (made by the screen); none on his own answer at the top. */
  acts?: ComponentChildren;
  me?: string;
  quote?: { n: string; t?: string; ph?: boolean } | null;
  onReply?: () => void;
  onReact?: (e: string | null) => void;
  onWho?: () => void;
  cls?: string;
  /** Under its marks (a teacher's "find the mistake"). */
  below?: ComponentChildren;
}) {
  const r = props.r;
  const name = whoOf(r, props.staff);
  return (
    <Bubble
      x={{ ...r, n: name, rx: r.rx ?? (r.lk ? { c: r.lk } : undefined), my: r.my ?? (r.liked ? "c" : undefined) }}
      cls={`${r.ok === true ? "ok" : r.ok === false ? "no" : ""}${props.quote !== undefined ? " re" : ""}${props.cls ? ` ${props.cls}` : ""}`}
      ava={r.ask && !props.staff ? <span class="f-uk-emo k-ask">🙋</span> : undefined}
      tags={
        <>
          {r.tch && <i class="f-msg-tag">ஆசிரியர்</i>}
          {!r.tch && r.g !== undefined && <i class="f-gchip">{r.g}</i>}
          {props.staff && r.ask && <i class="f-msg-tag ask">asked</i>}
        </>
      }
      quote={props.quote}
      onQuote={() => jumpTo(r.rt ?? r.re ?? "")}
      pics={r.ph && <Pics ph={r.ph} save={props.staff && !r.tch ? { name: fileBase(r.at), text: shareWords(r) } : undefined} />}
      me={props.me}
      onMate={props.onMate}
      onReply={props.onReply}
      onReact={props.onReact}
      onWho={props.onWho}
      acts={props.acts}
    >
      {r.ok === true ? <p class="f-msg-ok">✓ சரி · {r.okBy} ஆசிரியர்</p> : r.ok === false ? <p class="f-msg-no">✗ சரியில்லை · {r.okBy} ஆசிரியர்</p> : null}
      {r.fix && (
        <p class="f-msg-fix">
          <b>✎ {r.fixBy} ஆசிரியர்:</b> {r.fix}
        </p>
      )}
      {r.note && <p class="f-ur-note">💬 {r.note}</p>}
      {props.below}
    </Bubble>
  );
}

/** Lines opened on this phone: each counts once for its "👀" (the server counts once too). */
function viewOnce(id: string) {
  const seen = keep<string[]>("usViewed") ?? [];
  if (seen.includes(id)) return;
  keep("usViewed", [id, ...seen].slice(0, 300));
  void mutation("us:view", { id }).catch(() => {});
}

/**
 * A line opened (a tap on its card, or on a phone alert: #us=id). `staff` = a teacher (her calls go to the teachers'
 * functions: net.ts); the server decides what each one sees.
 */
export function ThreadScreen(props: { id: string; staff?: boolean; me?: string; onBack: () => void; onMate: (id: string) => void }) {
  const [d, setD] = useState<UsThread | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sure, setSure] = useState<string | null>(null);
  const [told, setTold] = useState<string[]>([]);
  const [re, setRe] = useState<{ id: string; n: string; t?: string } | null>(null);
  const [clapped, setClapped] = useState(false);
  // When he last opened it (before this time): the talk's "new" line goes above what came after.
  const [since] = useState(() => seenAt(props.id));
  const st = !!props.staff;
  const load = () =>
    query("us:thread", { id: props.id }).then(
      (x) => {
        const t = x as UsThread;
        setD(t);
        if (t.clapped) setClapped(true);
        setErr(null);
      },
      (e) => setErr(problemWords(e)),
    );
  useEffect(() => {
    void load();
    if (!st) viewOnce(props.id);
    markSeen(props.id);
    // While it is on screen, the talk comes in (someone may be writing): never in the background.
    const tick = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => window.clearInterval(tick);
  }, [props.id]);
  usePics([...(d?.cheers ?? []).slice(0, 8).map((c) => c.pic), ...(d?.talk ?? []).map((r) => r.pic), ...(d?.list ?? []).map((r) => r.pic), d?.m.pic, d?.m.bp]);
  // After any change the Us tab reads its lines again when it opens.
  const after = () => {
    keep("usAt", 0);
    markSeen(props.id);
    return load();
  };
  const act = (path: string, args: Record<string, unknown>, said?: string) =>
    mutation(path, { id: props.id, ...args }).then(
      (r) => {
        buzz();
        if (said) toast(said);
        void after();
        return r;
      },
      (e) => toast(problemWords(e), true),
    );
  const twice = (key: string, go: () => unknown) => {
    if (sure !== key) return setSure(key);
    setSure(null);
    void go();
  };
  const report = (rid?: string) => {
    setTold([...told, rid ?? props.id]);
    void act("us:report", rid ? { rid } : {}, "⚑ நன்றி. ஆசிரியர்கள் பார்ப்பார்கள்.");
  };
  // A reaction (8 Nov 2026): shown at once, then the server's counts.
  const react = (r: UsReply, e: string | null) => {
    if (!d) return;
    const was = r.my ?? (r.liked ? "c" : undefined);
    const rx: Record<string, number> = { ...(r.rx ?? (r.lk ? { c: r.lk } : {})) };
    if (was) rx[was] = Math.max(0, (rx[was] ?? 1) - 1);
    if (e) rx[e] = (rx[e] ?? 0) + 1;
    for (const k of Object.keys(rx)) if (!rx[k]) delete rx[k];
    const bump = (x: UsReply): UsReply => (x.id === r.id ? { ...x, rx, my: e ?? undefined, liked: !!e, lk: Object.values(rx).reduce((a, n) => a + n, 0) } : x);
    setD({ ...d, list: d.list.map(bump), talk: d.talk?.map(bump) });
    mutation("us:react", { aid: r.id, e }).catch((err) => {
      toast(problemWords(err), true);
      void load();
    });
  };
  const clap = () => {
    if (!d || clapped || d.m.mine) return;
    buzz();
    sound("pop");
    setClapped(true);
    const cl = keep<string[]>("usClapped") ?? [];
    keep("usClapped", [d.m.id, ...cl].slice(0, 200));
    setD({ ...d, m: { ...d.m, c: d.m.c + 1 } });
    mutation(st ? "us:tclap" : "us:clap", { id: d.m.id }).then(after, (e) => toast(problemWords(e), true));
  };
  const m: UsItem | undefined = d?.m;
  const q = !!m?.qn;
  const ask = m?.k === "ask";
  const mine = d?.list.find((r) => r.mine && !r.tch);
  // The talk: a doubt's replies; any other line's comments.
  const talk = ask ? (d?.list ?? []) : (d?.talk ?? []);
  const canTalk = !!d && (st || (ask ? !!d.can.reply : !!d.can.talk));
  const teach = (r: UsReply): ComponentChildren => {
    const answer = q && !r.c;
    const replyOnDoubt = ask && !r.tch && !r.ask;
    return (
      <>
        {st && (answer || replyOnDoubt) && (
          <button type="button" class={`f-ur-b ok${r.ok === true ? " on" : ""}`} aria-label="Right" aria-pressed={r.ok === true} onClick={() => void act("us:mark", { id: r.id, ok: r.ok === true ? null : true })}>
            ✓
          </button>
        )}
        {st && answer && (
          <button
            type="button"
            class={`f-ur-b no${r.ok === false ? " on" : ""}`}
            aria-label="Not right"
            aria-pressed={r.ok === false}
            onClick={() => void act("us:mark", { id: r.id, ok: r.ok === false ? null : false }, r.ok === false ? undefined : "✗ Marked. 🔍 You can ask everyone to find the mistake.")}
          >
            ✗
          </button>
        )}
        {st && !r.tch && !r.ask && (
          <button
            type="button"
            class="f-ur-b"
            aria-label={answer ? "Your words" : "Correct it"}
            onClick={() =>
              showSheet((close) =>
                answer ? (
                  <NoteSheet r={r} q={q} onClose={close} onMark={(ok, note) => act("us:mark", { id: r.id, ok, note })} />
                ) : (
                  <FixSheet r={r} onClose={close} onFix={(t) => act("us:fix", { id: r.id, text: t })} />
                ),
              )
            }
          >
            ✎
          </button>
        )}
        <span class="f-sp" />
        {st && r.rp ? (
          <button type="button" class="f-ur-b flag" onClick={() => void act("us:unflag", { rid: r.id }, "Kept.")}>
            ⚑ {r.rp} · Keep
          </button>
        ) : null}
        {st && (
          <button type="button" class="f-ur-b" aria-label="Remove" onClick={() => twice(r.id, () => act("us:drop", { rid: r.id }, "Removed."))}>
            {sure === r.id ? "Remove?" : <Icon name="bin" size={18} />}
          </button>
        )}
        {!st && !r.mine && !r.tch && !told.includes(r.id) && (
          <button type="button" class="f-msg-rep" aria-label="Report" onClick={() => report(r.id)}>
            ⚑
          </button>
        )}
      </>
    );
  };
  // A wrong answer asked again without the name (8 Nov 2026): said under it, where she just marked it, so she knows she can.
  const spotOf = (r: UsReply): ComponentChildren => {
    const answer = q && !r.c;
    return (
      <>
      {st && answer && r.ok === false && m && tools ? (
        r.spot ? (
          <p class="f-spot-done">🔍 Asked everyone on Us (no name)</p>
        ) : (
          <button type="button" class="f-spot-go" onClick={() => showSheet((close) => tools!.Spot({ r, q: m, onClose: close, onDone: () => void after() }))}>
            🔍 Find the mistake: ask everyone (no name)
          </button>
        )
      ) : null}
      </>
    );
  };
  const send = (text: string, ph: Sent[], mt: string[]) => {
    const args = { text, ...(ph.length ? { ph } : {}), ...(re ? { re: re.id } : {}), ...(mt.length ? { mt } : {}) };
    return mutation(ask ? "us:reply" : "us:comment", { id: props.id, ...args }).then(async (r) => {
      setRe(null);
      await after();
      window.setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }), 60);
      return r;
    });
  };
  // Each message by id: a reply shows what it answers (the message exactly; before 8 Nov 2026 the chain's first).
  const byId = new Map<string, UsReply>([...(d?.list ?? []), ...(d?.talk ?? [])].map((r) => [r.id, r]));
  const quoteOf = (r: UsReply) => {
    const to = r.rt ?? r.re;
    if (!to) return undefined;
    const x = byId.get(to);
    return x ? { n: whoOf(x, st), t: x.t, ph: !!x.ph?.length } : null;
  };
  const firstNew = since ? talk.findIndex((r) => r.at > since && !r.mine) : -1;
  // People he can tag: everyone named in this thread to him (never a teacher: tags tell students).
  const people: Taggable[] = [];
  const addP = (sid?: string, n?: string, pic?: string, g?: number) => {
    if (sid && n && sid !== props.me && !people.some((p) => p.id === sid)) people.push({ id: sid, n, ...(pic ? { pic } : {}), ...(g !== undefined ? { g } : {}) });
  };
  if (m && (m.k !== "ask" || st)) addP(m.sid, m.n, m.pic, m.g);
  for (const p of m?.ppl ?? []) addP(p.sid, p.n, p.pic, p.g);
  for (const r of [...talk, ...(q ? (d?.list ?? []) : [])]) if (!r.tch && !r.mine && !(r.ask && !st)) addP(r.sid, r.n, r.pic, r.g);
  const toAnswer = () => {
    const box = document.querySelector<HTMLTextAreaElement>(".f-ut-c textarea");
    box?.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => box?.focus(), 350);
  };
  /** A message of this thread with its quote, reactions, Reply and a teacher's buttons. */
  const msgIn = (r: UsReply) => {
    const answer = q && !r.c;
    return (
      <Msg
        key={r.id}
        r={r}
        staff={st}
        onMate={props.onMate}
        me={props.me}
        quote={quoteOf(r)}
        acts={teach(r)}
        onReply={answer ? undefined : () => setRe({ id: r.id, n: whoOf(r, st), ...(r.t ? { t: r.t } : {}) })}
        onReact={(e) => react(r, e)}
        onWho={() => showSheet((close) => <ReactorsSheet load={() => query(st ? "us:treactors" : "us:reactors", { aid: r.id }) as Promise<never>} onClose={close} />)}
        below={spotOf(r)}
      />
    );
  };
  const allCheers = (d?.cheers?.length ?? 0) + (m?.tc?.length ?? 0);
  const button = m ? (ASK[m.k] ?? "👏") : "👏";

  return (
    <div class={`f-ut${canTalk ? " talking" : ""}`}>
      <header class="f-hero us">
        <div class="f-toprow">
          <button type="button" class="f-round on-brand" aria-label="Back" onClick={props.onBack}>
            <Icon name="back" size={20} />
          </button>
          <b class="f-ut-h">{!m ? "" : `${m.qn ? "❓" : MARK[m.k]} ${m.qn ? "Question" : KIND[m.k]}`}</b>
          <span class="f-sp" />
          {m?.vw ? (
            <span class="f-ut-vw" aria-label={`${m.vw} opened it`}>
              <Icon name="eye" size={18} />
              {m.vw}
            </span>
          ) : null}
        </div>
      </header>
      {!d && !err && <Waiting />}
      {err && !d && <p class="f-lead f-center-t">{err}</p>}
      {d && m && (
        <>
          <article class="f-card f-ut-m rise">
            <div class="f-uk-h">
              <Face m={m} onMate={props.onMate} />
              <div class="f-uk-who">
                <p>
                  <Who m={m} onMate={props.onMate} />
                </p>
                <small class="f-uk-what">
                  {m.spot ? `🔍 தவறைக் கண்டுபிடி · ${gradesWords(m.gs)}` : m.k === "post" ? gradesWords(m.gs) : m.k === "ask" ? `🙋 ${AUD[m.aud ?? "t"]}` : `${MARK[m.k]} ${KIND[m.k]}`} · {ago(m.at)}
                </small>
              </div>
            </div>
            {m.k === "stage" || m.k === "flame" ? (
              <p class="f-uk-win big">
                {m.k === "stage" ? `🏁 Stage ${m.x ?? ""}` : `🔥 ${m.x}`}
                <small>{m.k === "stage" ? m.t : "நாட்கள் தொடர்ந்து"}</small>
              </p>
            ) : null}
            <div class="f-uk-b">
              <LineWords m={m} onMate={props.onMate} />
              {m.ph && !m.spot && (
                <Pics
                  ph={m.ph}
                  save={
                    st && (m.k === "ask" || m.k === "learn")
                      ? { name: fileBase(m.at), text: m.k === "learn" && m.lst === "ok" && m.n ? `💡 ${m.n} கற்றது! ARISTORA app இல் பார்: app.aristora.org` : "🙋 ஒரு மாணவரின் கேள்வி. உதவ: ARISTORA app, app.aristora.org" }
                      : undefined
                  }
                />
              )}
            </div>
            {m.k === "learn" && m.lst === "w" && <p class="f-uk-state wait">⏳ {st ? `Waiting for a teacher's ✓: only ${m.n ?? "the student"} and the teachers see it.` : "ஆசிரியர் ✓ கொடுத்ததும் எல்லோருக்கும் தெரியும். இப்போது உனக்கும் ஆசிரியர்களுக்கும் மட்டும்."}</p>}
            {m.k === "learn" && m.lst === "no" && <p class="f-uk-state no">இந்த முறை இல்லை{m.note ? `: ${m.note}` : ""}</p>}
            {m.k === "learn" && m.lst === "ok" && m.by && <p class="f-uk-state ok">✓ {m.by} ஆசிரியர் எல்லோருக்கும் காட்டினார்</p>}
            {st && d.can.approve && (
              <div class="f-ur-two">
                <button type="button" class={`f-btn ${m.lst === "ok" ? "white" : "go"}`} onClick={() => void act("us:approve", { ok: m.lst === "ok" ? null : true }, m.lst === "ok" ? "Waiting again." : `✓ Shown to everyone: +5 XP for ${m.n ?? "the student"}.`)}>
                  {m.lst === "ok" ? "Hide again" : "✓ Show to everyone"}
                </button>
                <button type="button" class="f-btn white" onClick={() => showSheet((close) => <NotNowSheet onClose={close} onSend={(note) => act("us:approve", { ok: false, note })} />)}>
                  ✗ Not this time
                </button>
              </div>
            )}
            {m.k !== "count" && m.k !== "ask" && !m.qn && (
              <div class="f-ut-cheer">
                {m.mine ? (
                  <span class="f-us-you">
                    <i>உனக்கு</i>
                    {button} {m.c}
                  </span>
                ) : (
                  <button type="button" class={`f-us-clap${clapped ? " done" : ""}`} aria-pressed={clapped} aria-label={`${button} ${m.c}`} onClick={clap}>
                    {button}
                    <b>{m.c > 0 ? m.c : ""}</b>
                  </button>
                )}
                {allCheers > 0 && (
                  <button
                    type="button"
                    class="f-ut-who"
                    onClick={() => showSheet((close) => <CheersSheet tc={m.tc ?? []} cheers={d.cheers ?? []} onClose={close} onMate={props.onMate} />)}
                  >
                    <span class="f-uk-faces">
                      {(m.tc ?? []).slice(0, 2).map((n) => (
                        <span key={`t${n}`} class="tch">
                          <Avatar name={n} size="s" />
                        </span>
                      ))}
                      {(d.cheers ?? []).slice(0, 4 - Math.min(2, m.tc?.length ?? 0)).map((c) => (
                        <span key={c.sid}>
                          <Avatar name={c.n} size="s" pic={picOf(c.pic)} />
                        </span>
                      ))}
                    </span>
                    <small>
                      {[...(m.tc ?? []).map((n) => `${n} ஆசிரியர்`), ...(d.cheers ?? []).map((c) => c.n)].slice(0, 2).join(", ")}
                      {allCheers > 2 ? ` +${allCheers - 2}` : ""} ›
                    </small>
                  </button>
                )}
              </div>
            )}
            {!st && d.can.report && !told.includes(props.id) && (
              <button type="button" class="f-ur-rep" onClick={() => report()}>
                ⚑ Report
              </button>
            )}
            {st && (ask || m.k === "learn") && (
              <div class="f-ur-acts">
                <span class="f-sp" />
                {m.rp ? (
                  <button type="button" class="f-ur-b flag" onClick={() => void act("us:unflag", {}, "Kept.")}>
                    ⚑ {m.rp} · Keep
                  </button>
                ) : null}
                <button type="button" class="f-ur-b" aria-label="Remove it" onClick={() => twice("m", () => act("us:drop", {}, "Removed.").then(props.onBack))}>
                  {sure === "m" ? "Remove it?" : <Icon name="bin" size={18} />}
                </button>
              </div>
            )}
          </article>
          {q && !st && d.can.answer && (
            <section class="f-card f-ut-c rise" aria-label="Your answer">
              <h2 class="f-h2">✍️ உன் விடை</h2>
              <Composer
                ph="உன் விடையை இங்கே எழுது (அல்லது படம் எடு)"
                go="Send"
                say="🔒 ஒருமுறை மட்டும்: அனுப்பிய பின் மாற்ற முடியாது. உன் விடை ஆசிரியருக்கு மட்டும்; சரி என்றால், விடை அனுப்பிய எல்லோருக்கும் உன் பெயருடன் தெரியும். அனுப்பியதும் பேச்சும் திறக்கும்."
                crop="மஞ்சள் புள்ளிகளை இழு: உன் விடை மட்டும் பெட்டிக்குள் இருக்கட்டும்."
                onSend={(text, ph) => mutation("us:answer", { id: props.id, text, ph }).then(() => toast("✍️ அனுப்பியாயிற்று! ஆசிரியர் பார்ப்பார்.")).then(after)}
              />
            </section>
          )}
          {q && st && (
            <p class="f-ut-sum">
              {m.an ?? 0} answers · ✓ {m.okN ?? 0} · waiting {m.wN ?? 0}
            </p>
          )}
          {q && d.list.length > 0 && (
            <ol class="f-msgs">
              {!st && mine && <li class="f-ur-head">உன் விடை</li>}
              {!st && mine && <Msg r={mine} staff={false} onMate={props.onMate} me={props.me} />}
              {!st && mine && mine.ok === undefined && <li class="f-ur-wait">⏳ ஆசிரியர் பார்த்ததும் இங்கே தெரியும்.</li>}
              {!st && d.list.some((r) => !r.mine) && <li class="f-ur-head">✓ சரியான விடைகள்</li>}
              {d.list
                .filter((r) => st || !r.mine)
                .map(msgIn)}
            </ol>
          )}
          {q && !st && d.hidden > 0 && <Veil n={d.hidden} sent={!!mine} v={d.veil} onGo={toAnswer} />}
          <section class="f-talk" aria-label="Talk">
            <h2 class="f-h2">
              💬 {ask ? "பதில்கள்" : "பேச்சு"} <small>{talk.length + (d.talkHidden ?? 0) || ""}</small>
            </h2>
            {d.talkHidden ? (
              <div class="f-talk-lock">
                <ol class="f-veil-talk" aria-hidden="true">
                  {Array.from({ length: Math.min(4, d.talkHidden) }, (_, i) => (
                    <li key={i} class={i % 2 ? "r" : ""}>
                      <span class="f-veil-ava" />
                      <i style={{ width: `${48 + ((i * 23) % 38)}%` }} />
                    </li>
                  ))}
                </ol>
                <p>
                  <Icon name="lock" size={18} />
                  <span>
                    {d.talkHidden} பேர் இதைப் பற்றிப் பேசுகிறார்கள். உன் விடையை அனுப்பியதும் பேச்சு திறக்கும்.
                  </span>
                </p>
              </div>
            ) : talk.length === 0 ? (
              <div class="f-talk-none">
                <Owl mood="wave" class="tiny" still />
                <p>
                  {st
                    ? ask
                      ? "No reply yet: be the first."
                      : "Nobody has written yet."
                    : ask
                      ? m.mine
                        ? "இன்னும் பதில் இல்லை. பதில் வந்ததும் சொல்வோம்."
                        : "இன்னும் பதில் இல்லை. முதல் பதில் நீயா?"
                      : "இன்னும் யாரும் எழுதவில்லை. முதலில் நீ!"}
                </p>
              </div>
            ) : (
              <ol class="f-msgs">
                {talk.flatMap((r, i) => [...(i === firstNew ? [<li key="new" class="f-new-div">புதியவை</li>] : []), msgIn(r)])}
              </ol>
            )}
          </section>
          {canTalk && (
            <WriteBar
              quick={st ? undefined : quickOf(m)}
              max={st ? 300 : TALK_MAX}
              hint={st ? "Write…" : "உன் வார்த்தைகள்…"}
              photos={st || ask}
              re={re}
              onUnRe={() => setRe(null)}
              people={people}
              onSend={send}
            />
          )}
        </>
      )}
    </div>
  );
}

/** 🙋 His doubt: words and photos, and who sees it (teachers, seniors, both: his choice; Grade 11 and no grade: teachers). */
export function DoubtSheet(props: { grade: number | null; onClose: () => void; onDone: () => void }) {
  const top = props.grade === null || props.grade >= 11;
  const [aud, setAud] = useState<"t" | "s" | "ts">(top ? "t" : "ts");
  const opts: ["t" | "s" | "ts", string][] = [
    ["t", "Teachers"],
    ["s", "Seniors"],
    ["ts", "Both"],
  ];
  return (
    <Sheet title="🙋 Ask a doubt" sub="கேள்வியின் படம், உன் working, புரியாத இடம்: எழுது, படம் எடு." onClose={props.onClose} class="f-doubt">
      {!top && (
        <>
          <p class="f-doubt-l">யார் பார்க்கலாம்?</p>
          <div class="f-seg3" role="group" aria-label="Who sees it">
            {opts.map(([k, l]) => (
              <button
                key={k}
                type="button"
                class={aud === k ? "on" : ""}
                aria-pressed={aud === k}
                onClick={() => {
                  buzz();
                  setAud(k);
                }}
              >
                {l}
              </button>
            ))}
          </div>
          {aud !== "t" && <p class="f-doubt-l s">மூத்த மாணவர்கள் = Grade {props.grade! + 1}–11.</p>}
        </>
      )}
      <Composer
        ph="உன் சந்தேகம்…"
        go="Send"
        say="🔒 உன் பெயர் ஆசிரியர்களுக்கு மட்டும் தெரியும். ஆசிரியர்கள் எல்லாவற்றையும் பார்ப்பார்கள்."
        crop="மஞ்சள் புள்ளிகளை இழு: கேள்வி அல்லது உன் working மட்டும் பெட்டிக்குள்."
        onSend={(text, ph) =>
          mutation("us:doubt", { text, ph, aud }).then(() => {
            toast("🙋 அனுப்பியாயிற்று! பதில் வந்ததும் சொல்வோம்.");
            keep("usAt", 0);
            props.onDone();
            props.onClose();
          })
        }
      />
    </Sheet>
  );
}

/** How a 💡 post can start (a child who doesn't know what to write taps one). */
const LEARN_STARTS = ["இன்று கற்றது: ", "நினைவில் வைக்க ஒரு வழி: ", "நான் செய்த தவறு, இப்போது புரிந்தது: "];

/**
 * 💡 What he learned (8 Nov 2026, his answer: students post too, "after a teacher's ✓"): his words and a photo of his
 * working. Only he and the teachers see it until a teacher shows it to everyone (+5 XP). Explaining is how he learns
 * best.
 */
export function LearnSheet(props: { onClose: () => void; onDone: () => void }) {
  const [start, setStart] = useState("");
  return (
    <Sheet
      title="💡 நான் கற்றது"
      sub="இன்று புரிந்த ஒன்றை உன் வார்த்தைகளில் எழுது: ஒரு விதி, ஒரு வழி, ஒரு தவறு. ஆசிரியர் ✓ கொடுத்ததும் எல்லோருக்கும் தெரியும்: +5 XP."
      onClose={props.onClose}
      class="f-learn"
    >
      <div class="f-learn-s" role="group" aria-label="Start with">
        {LEARN_STARTS.map((s) => (
          <button
            key={s}
            type="button"
            class={start === s ? "on" : ""}
            onClick={() => {
              buzz();
              setStart(s);
            }}
          >
            {s.replace(/: $/, "")}
          </button>
        ))}
      </div>
      <Composer
        key={start}
        init={start}
        ph="எழுது… (உன் working இன் படமும் போடலாம்)"
        go="Send"
        say="🔒 ஆசிரியர் பார்க்கும் வரை உனக்கும் ஆசிரியர்களுக்கும் மட்டும்."
        crop="மஞ்சள் புள்ளிகளை இழு: உன் working மட்டும் பெட்டிக்குள்."
        onSend={(text, ph) =>
          mutation("us:learn", { text, ph }).then(() => {
            toast("💡 அனுப்பியாயிற்று! ஆசிரியர் ✓ கொடுத்ததும் எல்லோருக்கும் தெரியும்.");
            keep("usAt", 0);
            props.onDone();
            props.onClose();
          })
        }
      />
    </Sheet>
  );
}
