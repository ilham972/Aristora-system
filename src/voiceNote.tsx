// Her voice note with a message to a student (12 Nov 2026, the founder: "add the voice note feature, so I can ask them
// why you not put the answer ... be careful, this is a web app: it must not get heavy or lag").
// - No library: the phone's own recorder (MediaRecorder). Mono, ~24 kbps, at most VOICE_SEC: a minute is about 180 KB.
// - The microphone is opened only when she taps Record and closed the moment she stops (or leaves the card).
// - Recorded as MP4 (AAC) where the phone can (every Chrome since 2024, every iPhone): it plays on every student's phone,
//   old iPhones included. Else WebM (Opus).
// - Playing: the audio is made on the tap, so a card with a voice note costs nothing until it is played.

import { useEffect, useRef, useState } from "preact/hooks";
import { VOICE_SEC } from "../convex/lib/photos";
import { toast } from "./store";

const TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

/** The recording the phone can make (null: it can't record here). */
export function voiceType(): string | null {
  if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return null;
  const ok = (t: string) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  };
  return TYPES.find(ok) ?? "";
}

export const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export type Voice = { blob: Blob; sec: number };

const Mic = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v3.5" />
  </svg>
);
const Play = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
    <path d="M8 5.5v13l10.5-6.5z" />
  </svg>
);
const Pause = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor">
    <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
  </svg>
);
const Bin = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 7h14M9.5 7V4.5h5V7M7 7l1 13h8l1-13" />
  </svg>
);

/**
 * Record, stop, listen, delete: one row under her message's box. `onVoice` gets the recording (null = none);
 * `onBusy` says whether it is recording (Send waits).
 */
export function VoiceRec(props: { onVoice: (v: Voice | null) => void; onBusy: (on: boolean) => void; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "asking" | "rec" | "done">("idle");
  const [sec, setSec] = useState(0);
  const [voice, setVoice] = useState<Voice | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const tick = useRef<number | undefined>(undefined);
  const began = useRef(0);
  const gone = useRef(false);

  const release = () => {
    window.clearInterval(tick.current);
    tick.current = undefined;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };
  // Leaving the card mid-recording: the microphone closes and nothing is kept.
  useEffect(
    () => () => {
      gone.current = true;
      const r = rec.current;
      rec.current = null;
      if (r && r.state !== "inactive") {
        r.ondataavailable = null;
        r.onstop = null;
        try {
          r.stop();
        } catch {
          /* already stopped */
        }
      }
      release();
    },
    [],
  );

  const start = async () => {
    const type = voiceType();
    if (type === null) {
      toast("This phone can't record here. Type your message instead.");
      return;
    }
    setState("asking");
    let s: MediaStream;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setState("idle");
      const name = (e as { name?: string })?.name;
      toast(
        name === "NotFoundError" || name === "NotReadableError"
          ? "No microphone works on this phone right now (another app may be using it). Type your message instead."
          : "Allow the microphone: Chrome → ⋮ → Settings → Site settings → Microphone → system.aristora.org.",
      );
      return;
    }
    if (gone.current) {
      s.getTracks().forEach((t) => t.stop());
      return;
    }
    stream.current = s;
    let r: MediaRecorder;
    try {
      r = new MediaRecorder(s, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 24_000 });
    } catch {
      release();
      setState("idle");
      toast("This phone can't record here. Type your message instead.");
      return;
    }
    const chunks: Blob[] = [];
    r.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    r.onstop = () => {
      const took = Math.min(VOICE_SEC, Math.max(1, Math.round((Date.now() - began.current) / 1000)));
      release();
      if (gone.current) return;
      props.onBusy(false);
      const base = (r.mimeType || type || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: base });
      if (!blob.size) {
        setState("idle");
        toast("Nothing was recorded. Try again.");
        return;
      }
      const v = { blob, sec: took };
      setVoice(v);
      setSec(took);
      setState("done");
      props.onVoice(v);
    };
    rec.current = r;
    began.current = Date.now();
    setSec(0);
    r.start();
    setState("rec");
    props.onBusy(true);
    tick.current = window.setInterval(() => {
      const t = (Date.now() - began.current) / 1000;
      setSec(t);
      // A minute at most: it stops by itself.
      if (t >= VOICE_SEC) stop();
    }, 250);
  };
  const stop = () => {
    const r = rec.current;
    rec.current = null;
    window.clearInterval(tick.current);
    if (r && r.state !== "inactive") r.stop();
  };
  const drop = () => {
    setVoice(null);
    setSec(0);
    setState("idle");
    props.onVoice(null);
  };

  if (state === "rec")
    return (
      <div class="vn-row rec">
        <span class="vn-dot" aria-hidden="true" />
        <b class="vn-t">{mmss(sec)}</b>
        <small class="vn-max">/ {mmss(VOICE_SEC)}</small>
        <button type="button" class="btn vn-stop" onClick={stop}>
          Stop
        </button>
      </div>
    );
  if (state === "done" && voice)
    return (
      <div class="vn-row">
        <VoicePlay blob={voice.blob} sec={voice.sec} />
        <button type="button" class="vn-icon" aria-label="Delete the voice note" disabled={props.disabled} onClick={drop}>
          <Bin />
        </button>
      </div>
    );
  return (
    <button type="button" class="btn ghost vn-rec" disabled={props.disabled || state === "asking"} onClick={() => void start()}>
      <Mic /> {state === "asking" ? "…" : "Record a voice note"}
    </button>
  );
}

/** A voice note to listen to: from the server (`url`) or just recorded (`blob`). Made on the first tap. */
export function VoicePlay(props: { url?: string; blob?: Blob; sec: number }) {
  const a = useRef<HTMLAudioElement | null>(null);
  const local = useRef<string | null>(null);
  const [on, setOn] = useState(false);
  const [at, setAt] = useState(0);
  useEffect(
    () => () => {
      a.current?.pause();
      if (local.current) URL.revokeObjectURL(local.current);
    },
    [],
  );
  const tap = () => {
    if (!a.current) {
      const src = props.url ?? (props.blob ? (local.current = URL.createObjectURL(props.blob)) : "");
      const x = new Audio(src);
      x.ontimeupdate = () => setAt(x.currentTime);
      x.onended = () => {
        setOn(false);
        setAt(0);
      };
      x.onerror = () => {
        setOn(false);
        toast("This voice note can't play here.");
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
    <button type="button" class={`vn-play${on ? " on" : ""}`} onClick={tap} aria-label={on ? "Pause" : "Play the voice note"}>
      <span class="vn-b">{on ? <Pause /> : <Play />}</span>
      <span class="vn-bar">
        <i style={{ width: `${props.sec ? Math.min(100, (at / props.sec) * 100) : 0}%` }} />
      </span>
      <small>{mmss(on || at ? left : props.sec)}</small>
    </button>
  );
}
