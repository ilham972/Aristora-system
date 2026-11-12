// A level he checked at home (4 Nov 2026, his voice notes: "everything corrected at home"): where he lost marks, the
// key's working (the solution); on each, the photos the teachers ask for (a part only a teacher can mark: a drawing, a
// construction), and her answers in Tamil when they come. Nothing waits on them (10 Nov 2026: no limit). Shown under the reveal right after Check, and again from the Stage (a level with 📷 or a dot).

import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { BookQ, LevelBook } from "../../convex/lib/homeWork";
import { loadChat, loadParts } from "./later";
import { mutation, NetError, query } from "./net";
import { keepPhotos, keptPhotos, photoKey, PHOTO_MAX, sendKept, sendPhotos, shrink, type Kind } from "./photos";
import { buzz, sound } from "./sound";
import { Icon, Maths, Owl, openRoom, problemWords, showSheet, toast } from "./ui";
import { stamp } from "./bell";

/** The key's working: `**` = the final answer (bold), one line per part. */
export function Solution(props: { text: string }) {
  return (
    <div class="f-sol">
      <span class="f-sol-h">
        <Icon name="bulb" size={15} /> தீர்வு
      </span>
      {props.text.split("\n").map((line, i) => (
        <p key={i}>
          {line.split("**").map((r, j) => (j % 2 ? <b key={j}><Maths s={r} /></b> : <span key={j}>{r}</span>))}
        </p>
      ))}
    </div>
  );
}

/**
 * The camera for one question: up to 3 photos, kept on this phone. `send` = a Send button (after Check); without it
 * (during the level) the photos go by themselves right after Check. Each photo opens his crop first (6 Nov 2026,
 * src/family/crop.tsx); with no parts on the phone (never fetched, no signal), the whole photo as before.
 */
/** Her message's words when she only spoke (convex/lib/photos.ts `VOICE_ONLY`; not imported: it would pull the rules in). */
const VOICE_ONLY = "🎤 குரல் செய்தி";
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Her voice note (12 Nov 2026): one round ▶ and the seconds. Nothing downloads until he taps it (the audio is made on
 * the tap), so a book full of messages costs nothing to open.
 */
function VoicePlay(props: { url: string; sec: number }) {
  const a = useRef<HTMLAudioElement | null>(null);
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  useEffect(() => () => a.current?.pause(), []);
  const tap = () => {
    if (!a.current) {
      const x = new Audio(props.url);
      x.ontimeupdate = () => setAt(x.currentTime);
      x.onended = () => {
        setOn(false);
        setAt(0);
      };
      x.onerror = () => {
        setOn(false);
        toast("இந்தக் குரல் செய்தியை இங்கே இயக்க முடியவில்லை.", true);
      };
      a.current = x;
    }
    const x = a.current;
    if (on) {
      x.pause();
      setOn(false);
    } else {
      void x.play().catch(() => setOn(false));
      setOn(true);
    }
  };
  const left = Math.max(0, props.sec - at);
  return (
    <button type="button" class={`f-voice${on ? " on" : ""}`} onClick={tap} aria-label={on ? "Pause" : "Play the voice message"}>
      <span class="f-voice-b">{on ? <i class="f-voice-pause" /> : <Icon name="play" size={18} />}</span>
      <span class="f-voice-bar">
        <i style={{ width: `${props.sec ? Math.min(100, (at / props.sec) * 100) : 0}%` }} />
      </span>
      <small>{mmss(on || at ? left : props.sec)}</small>
    </button>
  );
}

export function Taker(props: { unitId: string; n: number; q: number; kind: Kind; send: boolean; reply?: boolean; onSent?: () => void }) {
  const key = photoKey(props.unitId, props.n, props.q, props.kind);
  const [blobs, setBlobs] = useState<Blob[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // His words back to her message (with or without a photo).
  const [words, setWords] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let gone = false;
    void keptPhotos(key).then((b) => !gone && setBlobs(b));
    return () => {
      gone = true;
    };
  }, [key]);
  useEffect(() => {
    const u = blobs.map((b) => URL.createObjectURL(b));
    setUrls(u);
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [blobs]);
  const now = useRef(blobs);
  now.current = blobs;
  const keep = (b: Blob[]) => {
    setBlobs(b);
    void keepPhotos(key, b);
  };
  const add = (small: Blob) => {
    buzz(6);
    sound("pop");
    keep([...now.current, small].slice(0, PHOTO_MAX));
  };
  const took = async (e: Event) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    const parts = await loadParts().catch(() => null);
    if (
      parts &&
      showSheet((close) => (
        <parts.CropSheet
          file={file}
          onClose={close}
          onDone={(b) => {
            close();
            add(b);
          }}
        />
      ))
    )
      return;
    try {
      add(await shrink(file));
    } catch {
      toast("இந்தப் படத்தைத் திறக்க முடியவில்லை. மீண்டும் எடு.", true);
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      await sendPhotos(props.unitId, props.n, props.q, props.kind, blobs, props.reply ? words.trim() : undefined);
      sound("send");
      toast("அனுப்பியாயிற்று ✓ உன் ஆசிரியர் பார்ப்பார்.");
      setBlobs([]);
      setWords("");
      props.onSent?.();
    } catch (e) {
      toast(e instanceof NetError && e.offline ? "இணையம் இல்லை. படங்கள் phone இல் உள்ளன: பிறகு அனுப்பு." : problemWords(e), true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class={`f-take ${props.kind}`}>
      <div class="f-take-row">
        {urls.map((u, i) => (
          <span key={u} class="f-thumb">
            <img src={u} alt={`படம் ${i + 1}`} />
            <button type="button" class="f-thumb-x" aria-label={`Remove photo ${i + 1}`} onClick={() => keep(blobs.filter((_, j) => j !== i))}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
        {blobs.length < PHOTO_MAX && (
          <button type="button" class="f-cam" onClick={() => input.current?.click()} aria-label="Take a photo">
            <Icon name="camera" size={22} />
            <small>{blobs.length ? "இன்னொன்று" : "படம் எடு"}</small>
          </button>
        )}
        <input ref={input} type="file" accept="image/*" capture="environment" class="f-file" onChange={(e) => void took(e)} />
      </div>
      {props.reply && (
        <textarea
          class="f-replybox"
          rows={2}
          maxLength={300}
          aria-label="Your answer to the teacher"
          placeholder="உன் விடையை இங்கே எழுது"
          value={words}
          onInput={(e) => setWords((e.target as HTMLTextAreaElement).value)}
        />
      )}
      {props.send && (blobs.length > 0 || (props.reply && words.trim())) && (
        <button type="button" class="f-btn go f-send" disabled={busy} onClick={() => void send()}>
          {busy ? "…" : blobs.length ? `அனுப்பு (${blobs.length})` : "அனுப்பு"}
        </button>
      )}
    </div>
  );
}

const WHAT: Record<Kind, string> = {
  working: "உன் வழிமுறையைப் படம் எடுத்து அனுப்பு.",
  part: "உன் விடையைப் படம் எடுத்து அனுப்பு.",
};

/**
 * The pill on a question he lost marks on (12 Nov 2026, his words: "small tiny pill like explain online ... asking help
 * for that wrong question"): his photo and a teacher (the chats' own file, fetched on the tap), then its thread. Sent
 * already: how it stands, and a tap opens the thread.
 */
const HELP_ST = { open: "⏳ காத்திருக்கிறது", done: "✓ விளக்கப்பட்டது", class: "✓ வகுப்பில்", skip: "📚 வகுப்பில்" } as const;
function HelpPill(props: { hp: NonNullable<BookQ["hp"]>; unitId: string; n: number; q: number }) {
  const { hp } = props;
  const back = { unitId: props.unitId, n: props.n };
  const [busy, setBusy] = useState(false);
  const ask = () => {
    setBusy(true);
    loadChat()
      .then((c) => showSheet((close) => <c.AskSheet unitId={props.unitId} q={props.q} onClose={close} onDone={(id) => openRoom(id, back)} />))
      .catch((e) => toast(problemWords(e), true))
      .finally(() => setBusy(false));
  };
  return (
    <button type="button" class={`f-hpill${hp === "can" ? "" : ` ${hp.st}`}`} disabled={busy} onClick={() => (hp === "can" ? ask() : openRoom(hp.id, back))}>
      🎧 {hp === "can" ? "Explain online" : HELP_ST[hp.st]}
    </button>
  );
}

function Question(props: { b: BookQ; unitId: string; n: number; onSent: () => void }) {
  const { b } = props;
  const lost = b.got !== null && b.got < b.max;
  if (b.free) {
    // Out of the syllabus (the owner's free marks, 5 Nov 2026): its marks his, nothing to send.
    return (
      <li class="f-bq free">
        <div class="f-bq-top">
          <b class="f-rq">Q{b.q}</b>
          <span class="f-bq-m">
            {b.max}/{b.max}
          </span>
        </div>
        <p class="f-ph-state f-bq-free">🎁 இலவசப் புள்ளிகள்: இந்தக் கேள்வி உன் பாடத்திட்டத்தில் இல்லை.</p>
      </li>
    );
  }
  return (
    <li class={`f-bq${lost ? " lost" : ""}`}>
      <div class="f-bq-top">
        <b class="f-rq">Q{b.q}</b>
        {b.hp && <HelpPill hp={b.hp} unitId={props.unitId} n={props.n} q={b.q} />}
        <span class="f-bq-m">{b.got === null ? "✍ ஆசிரியர்" : `${b.got}/${b.max}`}</span>
      </div>
      {lost && b.typed && b.typed.some((x) => x) && (
        <p class="f-bq-typed">
          நீ போட்டது:{" "}
          <s>
            {b.typed.map((x, i) => (
              <Fragment key={i}>
                {i ? ", " : ""}
                <Maths s={x || "–"} />
              </Fragment>
            ))}
          </s>
        </p>
      )}
      {b.sol && <Solution text={b.sol} />}
      {b.back && (
        <p class="f-ph-state f-comesback">
          ↻ இந்தக் கேள்வி பின்னர் ஒரு Level இல் மீண்டும் வரும். தீர்வு அதன் பின்.
        </p>
      )}
      {b.photos.map((p, i) =>
        p.state === "waiting" ? (
          <p key={i} class="f-ph-state wait">
            <Icon name="clock" size={14} /> {p.said ? "உன் காரணத்தை ஆசிரியர் வாசிப்பார்." : `அனுப்பியது ${stamp(p.at)}: ஆசிரியர் பார்ப்பார்.`}
          </p>
        ) : p.state === "retake" ? (
          <p key={i} class="f-ph-state redo">
            <Icon name="camera" size={14} /> {p.by ? `${p.by}: ` : ""}
            {p.say ?? "மீண்டும் படம் எடு."}
            {p.when ? ` (${stamp(p.when)})` : ""}
          </p>
        ) : p.state === "ask" ? (
          // Her message before marking (7 Nov 2026): her name and her words; he answers below (a photo or words).
          <div key={i} class={`f-answer f-asked${p.fresh ? " fresh" : ""}`}>
            <span class="f-answer-h">
              <Icon name="chat" size={15} /> {p.by ?? "ஆசிரியர்"} கேட்கிறார்
            </span>
            {p.voice && <VoicePlay url={p.voice} sec={p.sec ?? 0} />}
            {!(p.voice && p.ask === VOICE_ONLY) && <p>{p.ask}</p>}
            {p.when && <small class="f-answer-when">{stamp(p.when)}</small>}
          </div>
        ) : (
          <div key={i} class={`f-answer${p.fresh ? " fresh" : ""}`}>
            {/* Who corrected it (7 Nov 2026, his ask: "they want the credit"). */}
            <span class="f-answer-h">
              <Icon name="teach" size={15} /> {p.by ? `திருத்தியவர்: ${p.by}` : "ஆசிரியர்"}
              {p.kind === "part" && p.got !== null && <b> · {p.got}/{b.teach}</b>}
            </span>
            {p.say && <p>{p.say}</p>}
            {p.note && <p class="f-answer-note">“{p.note}”</p>}
            {/* When he sent it and when she corrected it. */}
            <small class="f-answer-when">
              அனுப்பியது {stamp(p.at)}
              {p.when ? ` · திருத்தியது ${stamp(p.when)}` : ""}
            </small>
          </div>
        ),
      )}
      {b.owe.map((k) => {
        // Her message waits for his answer: a photo, or his words, or both.
        const asked = b.photos.some((p) => p.kind === k && p.state === "ask");
        return (
          <div key={k} class="f-owe">
            <p class="f-owe-what">{asked ? "ஆசிரியருக்குப் பதில் அனுப்பு: படம் எடு, அல்லது கீழே எழுது." : WHAT[k]}</p>
            <Taker unitId={props.unitId} n={props.n} q={b.q} kind={k} send reply={asked} onSent={props.onSent} />
          </div>
        );
      })}
    </li>
  );
}

/**
 * What this level asks of him and what came back: the questions with a solution, a photo to send or her answer (the
 * right ones need nothing). `score` = the level's marks on top (its own screen).
 */
export function Book(props: { unitId: string; n: number; initial?: LevelBook | null; score?: boolean }) {
  const [book, setBook] = useState<LevelBook | null>(props.initial ?? null);
  const [err, setErr] = useState<string | null>(null);
  const load = () =>
    query("family:book", { unitId: props.unitId, n: props.n })
      .then((b) => setBook(b as LevelBook))
      .catch((e) => setErr(problemWords(e)));
  useEffect(() => {
    let gone = false;
    // Photos taken during the level (or kept with no signal) go first; then the book again.
    void sendKept(props.unitId, props.n).then((sent) => {
      if (!gone && (sent || !props.initial)) void load();
    });
    return () => {
      gone = true;
    };
  }, [props.unitId, props.n]);
  useEffect(() => {
    if (book?.qs.some((q) => q.photos.some((p) => p.fresh))) void mutation("family:seen", { unitId: props.unitId, n: props.n }).catch(() => {});
  }, [book]);
  if (err && !book) return <p class="f-note">{err}</p>;
  if (!book) return <p class="f-note">…</p>;
  const qs = book.qs.filter((q) => !q.free && (q.sol || q.back || q.owe.length || q.photos.length || q.hp));
  const free = book.qs.filter((q) => q.free);
  const owed = book.qs.reduce((a, q) => a + q.owe.length, 0);
  // Her messages waiting for his answer (12 Nov 2026: also on a question with no photo): the bar says answer her.
  const asks = book.qs.filter((q) => q.photos.some((p) => p.state === "ask")).length;
  return (
    <section class="f-book">
      {props.score && (
        <p class="f-bscore">
          <b>{book.got}</b> / {book.max} XP{book.qs.some((q) => q.got === null) && " · ✍"}
        </p>
      )}
      {book.cn && (
        // Who checked it in class (7 Nov 2026, his ask: "they want the credit").
        <p class="f-checkedby">
          <Icon name="check" size={15} /> வகுப்பில் திருத்தியவர்: <b>{book.cn}</b>
          {book.hcAt ? <small> · {stamp(book.hcAt)}</small> : null}
        </p>
      )}
      {owed > 0 && (
        <div class="f-owebar">
          <Icon name={asks ? "chat" : "camera"} size={18} />
          {asks ? (
            <p>
              ஆசிரியர் <b>{asks} கேள்வி</b> பற்றிக் கேட்கிறார்: பதில் அனுப்பு.
            </p>
          ) : (
            <p>
              <b>{owed} படங்கள்</b> அனுப்ப வேண்டும்.
            </p>
          )}
        </div>
      )}
      {qs.length === 0 ? (
        <div class="f-center f-pad">
          <Owl mood="cheer" class="mid" />
          <p class="f-lead">எல்லாம் சரி! தீர்வு தேவையில்லை.</p>
        </div>
      ) : (
        <ul class="f-bqs">
          {qs.map((b) => (
            <Question key={b.q} b={b} unitId={props.unitId} n={props.n} onSent={() => void load()} />
          ))}
        </ul>
      )}
      {free.length > 0 && (
        <ul class="f-bqs">
          {free.map((b) => (
            <Question key={b.q} b={b} unitId={props.unitId} n={props.n} onSent={() => void load()} />
          ))}
        </ul>
      )}
    </section>
  );
}

/** The level's book from the Stage: its own screen. */
export function BookScreen(props: { unitId: string; n: number; no: number; title: string; onBack: () => void }) {
  return (
    <div class="f-bookscr">
      <header class="f-ptop">
        <button type="button" class="f-round" aria-label="Back" onClick={props.onBack}>
          <Icon name="back" size={20} />
        </button>
        <div class="f-bookt">
          <p class="f-kicker">
            Stage {props.no} · Level {props.n}
          </p>
          <b>{props.title}</b>
        </div>
      </header>
      <Book unitId={props.unitId} n={props.n} score />
    </div>
  );
}
