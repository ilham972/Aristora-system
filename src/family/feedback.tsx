// Feedback (his voice note, 3 Nov 2026: "the most important feature: get the feedback and improve us"): a face, what
// it is about, a few words; with his name (the default) or without it (then only his grade goes with it). Read by the
// owner and the people he chose (Settings → Feedback). A few a day from one phone (the server says when it's enough).

import { useEffect, useState } from "preact/hooks";
import { mutation } from "./net";
import { buzz, sound } from "./sound";
import { OwlBadge, problemWords, Sheet } from "./ui";

const FACES: { mood: number; face: string; ta: string }[] = [
  { mood: 1, face: "😞", ta: "மிக மோசம்" },
  { mood: 2, face: "🙁", ta: "மோசம்" },
  { mood: 3, face: "😐", ta: "சரி" },
  { mood: 4, face: "🙂", ta: "நன்று" },
  { mood: 5, face: "😍", ta: "மிக நன்று" },
];

/** What it is about: short labels, English (the questions he answers are Tamil: honest answers come in his own words). */
const TOPICS: { id: "class" | "teachers" | "questions" | "app" | "other"; name: string }[] = [
  { id: "class", name: "Class" },
  { id: "teachers", name: "Teachers" },
  { id: "questions", name: "Questions" },
  { id: "app", name: "App" },
  { id: "other", name: "Other" },
];

/** As the server allows (convex/family.ts FEEDBACK_TEXT_MAX). */
const TEXT_MAX = 600;

export function FeedbackSheet(props: { grade: number | null; onClose: () => void }) {
  const [mood, setMood] = useState<number | null>(null);
  const [topic, setTopic] = useState<(typeof TOPICS)[number]["id"] | null>(null);
  const [text, setText] = useState("");
  const [named, setNamed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const ready = mood !== null || text.trim().length > 0;
  // The thank-you closes by itself (and never after the sheet already went).
  useEffect(() => {
    if (!sent) return;
    const id = window.setTimeout(props.onClose, 1800);
    return () => window.clearTimeout(id);
  }, [sent]);

  const send = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await mutation("family:feedback", {
        ...(mood !== null ? { mood } : {}),
        ...(topic ? { topic } : {}),
        ...(text.trim() ? { text: text.trim() } : {}),
        named,
      });
      sound("send");
      setSent(true);
    } catch (e) {
      buzz(40);
      setErr(problemWords(e));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Sheet title="நன்றி!" onClose={props.onClose} class="f-fb-done">
        <div class="f-thanks rise">
          <OwlBadge mood="kiss" class="mid" />
          <b>உன் கருத்தைப் படிப்போம்.</b>
          <small>ஒவ்வொன்றையும் நாங்கள் படிக்கிறோம்.</small>
        </div>
      </Sheet>
    );
  }
  return (
    <Sheet title="Tell ARISTORA" sub="உன் கருத்து எங்களை மேம்படுத்தும்." onClose={props.onClose} class="f-fb">
      <p class="f-fb-q">எப்படி இருக்கிறது?</p>
      <div class="f-faces" role="radiogroup" aria-label="How is it?">
        {FACES.map((f) => (
          <button
            key={f.mood}
            type="button"
            role="radio"
            aria-checked={mood === f.mood}
            aria-label={f.ta}
            class={`f-face${mood === f.mood ? " on" : ""}`}
            onClick={() => {
              buzz();
              sound("tap");
              setMood(mood === f.mood ? null : f.mood);
            }}
          >
            <span aria-hidden="true">{f.face}</span>
          </button>
        ))}
      </div>
      <p class="f-fb-q">எதைப் பற்றி?</p>
      <div class="f-topics" role="group" aria-label="About">
        {TOPICS.map((t) => (
          <button key={t.id} type="button" class={`f-chip-b${topic === t.id ? " on" : ""}`} aria-pressed={topic === t.id} onClick={() => setTopic(topic === t.id ? null : t.id)}>
            {t.name}
          </button>
        ))}
      </div>
      <label class="f-fb-text">
        <textarea
          rows={4}
          maxLength={TEXT_MAX}
          placeholder="என்ன நன்றாக இருந்தது? எதை மாற்றலாம்?"
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        />
        <small>
          {text.length}/{TEXT_MAX}
        </small>
      </label>
      <button type="button" class="f-row f-named" aria-pressed={named} onClick={() => setNamed(!named)}>
        <span class="f-named-w">
          <b>என் பெயருடன் அனுப்பு</b>
          <small>{named ? "உன் பெயரும் போகும்." : `உன் பெயர் போகாது: ${props.grade ? `Grade ${props.grade}` : "உன் Grade"} மட்டும்.`}</small>
        </span>
        <span class={`f-switch${named ? " on" : ""}`} aria-hidden="true" />
      </button>
      {err && (
        <p class="f-err" role="alert">
          {err}
        </p>
      )}
      <button type="button" class="f-btn go big" disabled={!ready || busy} onClick={() => void send()}>
        {busy ? "…" : "Send"}
      </button>
      {!ready && <p class="f-muted small f-center-t">ஒரு முகத்தைத் தொடு அல்லது சில வார்த்தைகள் எழுது.</p>}
    </Sheet>
  );
}
