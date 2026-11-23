// A skill's video, full screen (23 Nov 2026, his rules: "very fast and smooth like YouTube ... otherwise students
// never watch that, they skip and go"). Its own file, fetched only near a video (videoParts.ts): the Stage fetches it,
// hls.js and the next video's links as it opens, so ▶ starts at once. Server: convex/familyVideos.ts.
// - The picture at once (its poster), then the stream from where he stopped; a tap anywhere = play / pause; ±10 s; the
//   bar to jump; 1× → 1.25× → 1.5×; full screen sideways (⛶). A wait shows its ring only after 0.4 s.
// - The end: the owl cheers; the stop's next video, else START this Level (when he can play it), else back.
// - His watching goes to the server as it starts, every 15 s while it plays, when he pauses or leaves, and at the end
//   (a beacon when the page goes away). No lock (his pick): nothing here keeps START shut.

import { useEffect, useRef, useState } from "preact/hooks";
import type { StageVideo } from "../../convex/familyVideos";
import { attach } from "../videoPlay";
import { beacon, mutation, words } from "./net";
import { buzz, sound } from "./sound";
import { Icon, Owl } from "./ui";

type Links = { src: string; poster: string; sec: number; ratio: string; at: number };
const SEEN_MS = 15_000;
const RATES = [1, 1.25, 1.5];
const mmss = (s: number) => {
  const t = Math.max(0, Math.floor(s || 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** Links asked for ahead (the Stage, as it opens): one per video, used once, within the hour (they last a few). */
const ahead = new Map<string, { p: Promise<Links>; at: number }>();
const AHEAD_MS = 60 * 60_000;
/** Ask for a video's links before he taps (the Stage calls this as it opens). */
export function prepare(id: string): void {
  const had = ahead.get(id);
  if (had && Date.now() - had.at < AHEAD_MS) return;
  const p = mutation("familyVideos:links", { videoId: id }) as Promise<Links>;
  p.catch(() => ahead.delete(id));
  ahead.set(id, { p, at: Date.now() });
}
function linksOf(id: string): Promise<Links> {
  const had = ahead.get(id);
  ahead.delete(id);
  return had && Date.now() - had.at < AHEAD_MS ? had.p : (mutation("familyVideos:links", { videoId: id }) as Promise<Links>);
}

export function VideoScreen(props: {
  list: StageVideo[];
  /** The Level after this stop, and whether he can START it now. */
  level: number;
  canStart: boolean;
  onStart: () => void;
  /** He tapped back (the phone's Back closes it as one of the app's sheets). */
  onClose: () => void;
  /** It closed, however: the Stage asks for its videos again (watched, how far). */
  onGone: () => void;
}) {
  const [idx, setIdx] = useState(() => Math.max(0, props.list.findIndex((v) => !v.done)));
  const v = props.list[idx];
  const box = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLVideoElement>(null);
  const [links, setLinks] = useState<Links | null>(null);
  const [err, setErr] = useState("");
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [ended, setEnded] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(v?.sec ?? 0);
  const [rate, setRate] = useState(1);
  const [tries, setTries] = useState(0);
  const [chrome, setChrome] = useState(true);
  const sent = useRef({ at: 0, started: false });
  /** Where it was last (the video element is gone once the screen closes). */
  const last = useRef({ pos: 0, dur: 0 });
  const close = () => props.onClose();

  /** Where he is, to the server (at most every 15 s while it plays; always when he stops, leaves or it ends). */
  const report = (end: boolean, force = false) => {
    if (!v || !sent.current.started) return;
    const x = el.current;
    if (x) last.current = { pos: x.currentTime, dur: x.duration || dur };
    const now = Date.now();
    if (!end && !force && now - sent.current.at < SEEN_MS) return;
    sent.current.at = now;
    const args = { videoId: v.id, pos: last.current.pos, dur: last.current.dur || dur, ...(end ? { end: true } : {}) };
    if (force && document.visibilityState === "hidden") beacon("familyVideos:seen", args);
    else void mutation("familyVideos:seen", args).catch(() => {});
  };
  // Closed (his tap, the phone's Back, a new screen): where he got to, then the Stage looks again.
  const reportRef = useRef(report);
  reportRef.current = report;
  useEffect(
    () => () => {
      reportRef.current(false, true);
      props.onGone();
    },
    [],
  );

  useEffect(() => {
    if (!v || !el.current) return;
    const x = el.current;
    let drop: (() => void) | null = null;
    let gone = false;
    setLinks(null);
    setErr("");
    setEnded(false);
    setT(0);
    sent.current = { at: 0, started: false };
    linksOf(v.id)
      .then(async (l) => {
        if (gone) return;
        setLinks(l);
        setDur(l.sec || v.sec);
        x.poster = l.poster;
        drop = await attach(x, l.src, l.at, () => setErr("இந்த video ஓடவில்லை: data அல்லது Wi-Fi பார்த்து மீண்டும் முயல்."));
        if (gone) return drop();
        x.playbackRate = rate;
        // The tap that opened it lets it play with sound; if the phone still says no, the big ▶ waits for his tap.
        x.play().catch(() => setPlaying(false));
      })
      .catch((e: unknown) => !gone && setErr(words(e)));
    return () => {
      gone = true;
      drop?.();
    };
  }, [v?.id, tries]);

  useEffect(() => {
    const hide = () => document.visibilityState === "hidden" && report(false, true);
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, [v?.id]);

  // The chrome hides itself while it plays, and comes back with a tap.
  useEffect(() => {
    if (!playing || !chrome) return;
    const h = setTimeout(() => setChrome(false), 2600);
    return () => clearTimeout(h);
  }, [playing, chrome, t > 0]);

  // A wait shows its ring only after 0.4 s (a short one shows nothing).
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onWaiting = () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    waitTimer.current = setTimeout(() => setWaiting(true), 400);
  };
  const notWaiting = () => {
    if (waitTimer.current) clearTimeout(waitTimer.current);
    setWaiting(false);
  };

  const toggle = () => {
    const x = el.current;
    if (!x || !links) return;
    buzz();
    if (ended) {
      setEnded(false);
      x.currentTime = 0;
    }
    if (x.paused) void x.play().catch(() => {});
    else x.pause();
  };
  const skip = (d: number) => {
    const x = el.current;
    if (!x) return;
    buzz();
    x.currentTime = Math.max(0, Math.min((x.duration || dur) - 0.5, x.currentTime + d));
    setChrome(true);
  };
  const jump = (e: PointerEvent) => {
    const x = el.current;
    const bar = e.currentTarget as HTMLElement;
    if (!x || !(x.duration || dur)) return;
    const r = bar.getBoundingClientRect();
    x.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (x.duration || dur);
    setChrome(true);
  };
  const nextRate = () => {
    const r = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(r);
    if (el.current) el.current.playbackRate = r;
    buzz();
    setChrome(true);
  };
  const full = () => {
    const b = box.current;
    buzz();
    if (!b) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else if (b.requestFullscreen) {
      void b
        .requestFullscreen()
        .then(() => (screen.orientation as { lock?: (o: string) => Promise<void> } | undefined)?.lock?.("landscape"))
        .catch(() => {});
    } else (el.current as { webkitEnterFullscreen?: () => void } | null)?.webkitEnterFullscreen?.();
  };

  if (!v) return null;
  const pct = dur > 0 ? Math.min(100, (t / dur) * 100) : 0;
  const more = idx + 1 < props.list.length;
  return (
    <div class={`f-vp${chrome || !playing ? " ui" : ""}`} ref={box} role="dialog" aria-modal="true" aria-label={v.t}>
      <video
        ref={el}
        class="f-vp-v"
        playsInline
        preload="auto"
        onClick={() => (chrome ? toggle() : setChrome(true))}
        onPlaying={() => {
          notWaiting();
          setPlaying(true);
          if (!sent.current.started) {
            sent.current.started = true;
            sent.current.at = Date.now();
            void mutation("familyVideos:seen", { videoId: v.id, pos: el.current?.currentTime ?? 0, dur: el.current?.duration || dur, start: true }).catch(() => {});
          }
        }}
        onPause={() => {
          setPlaying(false);
          setChrome(true);
          report(false, true);
        }}
        onWaiting={onWaiting}
        onCanPlay={notWaiting}
        onTimeUpdate={() => {
          const x = el.current;
          if (!x) return;
          setT(x.currentTime);
          if (x.duration && Number.isFinite(x.duration)) setDur(x.duration);
          report(false);
        }}
        onEnded={() => {
          setEnded(true);
          setPlaying(false);
          setChrome(true);
          report(true);
          sound("level");
        }}
      />
      {(!links || waiting) && !err && !ended && <i class="f-vp-wait" aria-label="Loading" />}
      <div class="f-vp-top">
        <button type="button" class="f-vp-b" aria-label="Close" onClick={close}>
          <Icon name="back" size={22} />
        </button>
        <p class="f-vp-t">
          <small>{props.list.length > 1 ? `VIDEO ${idx + 1} / ${props.list.length}` : "VIDEO"}</small>
          {v.t}
        </p>
        <button type="button" class="f-vp-b" aria-label="Full screen" onClick={full}>
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      {links && !ended && !err && (
        <div class="f-vp-mid">
          <button type="button" class="f-vp-s" aria-label="Back 10 seconds" onClick={() => skip(-10)}>
            −10
          </button>
          <button type="button" class="f-vp-pp" aria-label={playing ? "Pause" : "Play"} onClick={toggle}>
            {playing ? (
              <svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
                <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
              </svg>
            ) : (
              <Icon name="play" size={36} />
            )}
          </button>
          <button type="button" class="f-vp-s" aria-label="Forward 10 seconds" onClick={() => skip(10)}>
            +10
          </button>
        </div>
      )}
      {!ended && (
        <div class="f-vp-bot">
          <span class="f-vp-time">
            {mmss(t)} / {mmss(dur)}
          </span>
          <div class="f-vp-bar" onPointerDown={jump} role="slider" aria-label="Where in the video" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)}>
            <i style={{ width: `${pct}%` }} />
          </div>
          <button type="button" class="f-vp-rate" onClick={nextRate} aria-label="Speed">
            {rate}×
          </button>
        </div>
      )}
      {err && (
        <div class="f-vp-end">
          <Owl mood="dizzy" class="mid" />
          <p>{err}</p>
          <button type="button" class="f-btn big" onClick={() => setTries((n) => n + 1)}>
            மீண்டும்
          </button>
        </div>
      )}
      {ended && (
        <div class="f-vp-end">
          <Owl mood="cheer" class="mid" />
          <p>சூப்பர்! இப்போ நீயே செய்து பார்.</p>
          {more ? (
            <button type="button" class="f-btn gold big shine" onClick={() => setIdx(idx + 1)}>
              Next video <Icon name="play" size={18} />
            </button>
          ) : props.canStart ? (
            <button
              type="button"
              class="f-btn gold big shine"
              onClick={() => {
                sound("start");
                props.onStart();
              }}
            >
              START · Level {props.level}
            </button>
          ) : null}
          <button type="button" class="f-btn ghost" onClick={close}>
            {more || props.canStart ? "பிறகு" : "சரி"}
          </button>
          <button type="button" class="f-vp-again" onClick={toggle}>
            ↻ மீண்டும் பார்
          </button>
        </div>
      )}
    </div>
  );
}
