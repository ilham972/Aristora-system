// A level he checked at home (4 Nov 2026, his voice notes: "everything corrected at home"): where he lost marks, the
// key's working (the solution); on each, the photos the teachers ask for (his working on a wrong answer; a part only a
// teacher can mark), and her answers in Tamil when they come. His rule: without those photos he may do 2 more levels
// at most. Shown under the reveal right after Check, and again from the Stage (a level with 📷 or a dot).

import { useEffect, useRef, useState } from "preact/hooks";
import type { BookQ, LevelBook } from "../../convex/lib/homeWork";
import { mutation, NetError, query } from "./net";
import { keepPhotos, keptPhotos, photoKey, PHOTO_MAX, sendKept, sendPhotos, shrink, type Kind } from "./photos";
import { buzz, sound } from "./sound";
import { Icon, Owl, pretty, problemWords, toast } from "./ui";

/** The key's working: `**` = the final answer (bold), one line per part. */
export function Solution(props: { text: string }) {
  return (
    <div class="f-sol">
      <span class="f-sol-h">
        <Icon name="bulb" size={15} /> தீர்வு
      </span>
      {props.text.split("\n").map((line, i) => (
        <p key={i}>
          {line.split("**").map((r, j) => (j % 2 ? <b key={j}>{pretty(r)}</b> : <span key={j}>{r}</span>))}
        </p>
      ))}
    </div>
  );
}

/**
 * The camera for one question: up to 3 photos, kept on this phone. `send` = a Send button (after Check); without it
 * (during the level) the photos go by themselves right after Check.
 */
export function Taker(props: { unitId: string; n: number; q: number; kind: Kind; send: boolean; onSent?: () => void }) {
  const key = photoKey(props.unitId, props.n, props.q, props.kind);
  const [blobs, setBlobs] = useState<Blob[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
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
  const keep = (b: Blob[]) => {
    setBlobs(b);
    void keepPhotos(key, b);
  };
  const took = async (e: Event) => {
    const el = e.target as HTMLInputElement;
    const file = el.files?.[0];
    el.value = "";
    if (!file) return;
    try {
      const small = await shrink(file);
      buzz(6);
      sound("pop");
      keep([...blobs, small].slice(0, PHOTO_MAX));
    } catch {
      toast("இந்தப் படத்தைத் திறக்க முடியவில்லை. மீண்டும் எடு.", true);
    }
  };
  const send = async () => {
    setBusy(true);
    try {
      await sendPhotos(props.unitId, props.n, props.q, props.kind, blobs);
      sound("send");
      toast("அனுப்பியாயிற்று ✓ உன் ஆசிரியர் பார்ப்பார்.");
      setBlobs([]);
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
      {props.send && blobs.length > 0 && (
        <button type="button" class="f-btn go f-send" disabled={busy} onClick={() => void send()}>
          {busy ? "…" : `அனுப்பு (${blobs.length})`}
        </button>
      )}
    </div>
  );
}

const WHAT: Record<Kind, string> = {
  working: "உன் வழிமுறையைப் படம் எடுத்து அனுப்பு.",
  part: "உன் விடையைப் படம் எடுத்து அனுப்பு.",
};

function Question(props: { b: BookQ; unitId: string; n: number; onSent: () => void }) {
  const { b } = props;
  const lost = b.got !== null && b.got < b.max;
  return (
    <li class={`f-bq${lost ? " lost" : ""}`}>
      <div class="f-bq-top">
        <b class="f-rq">Q{b.q}</b>
        <span class="f-bq-m">{b.got === null ? "✍ ஆசிரியர்" : `${b.got}/${b.max}`}</span>
      </div>
      {lost && b.typed && b.typed.some((x) => x) && (
        <p class="f-bq-typed">
          நீ போட்டது: <s>{b.typed.map((x) => pretty(x || "–")).join(", ")}</s>
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
            <Icon name="clock" size={14} /> படம் அனுப்பியாயிற்று: ஆசிரியர் பார்ப்பார்.
          </p>
        ) : p.state === "retake" ? (
          <p key={i} class="f-ph-state redo">
            <Icon name="camera" size={14} /> {p.say ?? "மீண்டும் படம் எடு."}
          </p>
        ) : (
          <div key={i} class={`f-answer${p.fresh ? " fresh" : ""}`}>
            <span class="f-answer-h">
              <Icon name="teach" size={15} /> ஆசிரியர்
              {p.kind === "part" && p.got !== null && <b> · {p.got}/{b.teach}</b>}
            </span>
            {p.say && <p>{p.say}</p>}
            {p.note && <p class="f-answer-note">“{p.note}”</p>}
          </div>
        ),
      )}
      {b.owe.map((k) => (
        <div key={k} class="f-owe">
          <p class="f-owe-what">{WHAT[k]}</p>
          <Taker unitId={props.unitId} n={props.n} q={b.q} kind={k} send onSent={props.onSent} />
        </div>
      ))}
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
  const qs = book.qs.filter((q) => q.sol || q.back || q.owe.length || q.photos.length);
  const owed = book.qs.reduce((a, q) => a + q.owe.length, 0);
  return (
    <section class="f-book">
      {props.score && (
        <p class="f-bscore">
          <b>{book.got}</b> / {book.max} XP{book.qs.some((q) => q.got === null) && " · ✍"}
        </p>
      )}
      {owed > 0 && (
        <div class="f-owebar">
          <Icon name="camera" size={18} />
          <p>
            <b>{owed} படங்கள்</b> அனுப்ப வேண்டும்.
            {book.required && " அனுப்பாமல் இன்னும் 2 Level வரை மட்டுமே செய்யலாம்."}
          </p>
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
