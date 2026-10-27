// Alerts a busy teacher notices: a loud chime, the student's name read out, a buzz (Android),
// and a screen that stays on so the page keeps running.
//
// Why each part is built this way (phones in use: iPhone 7 Plus on iOS 15, iPhone 11, Redmi Note 9 and 14):
// - Phones only allow sound after a tap on the page, so every tap "arms" the alerts again if needed.
// - An iPhone's silent switch mutes Web Audio but not an <audio> element, so the chime is a real sound
//   file (made here, nothing to download), and the name is read while that file is still playing.
// - A locked screen stops the page, so nothing can ring. The screen wake lock keeps the screen on;
//   phones without it (iPhone 7 Plus) get the old trick: a tiny silent video playing off screen.

import media from "nosleep.js/src/media.js";
import { useEffect, useState } from "preact/hooks";
import { chimeWav, SOUNDS, type AlertKind } from "./chime";

export type { AlertKind } from "./chime";

// ---------- The chime: a WAV file made in memory (see chime.ts) ----------

const urls = new Map<string, string>();

function wavUrl(kind: AlertKind | "silent"): string {
  let url = urls.get(kind);
  if (!url) {
    url = URL.createObjectURL(new Blob([chimeWav(kind)], { type: "audio/wav" }));
    urls.set(kind, url);
  }
  return url;
}

let player: HTMLAudioElement | null = null;
/** The chime has played on this page at least once (so phones allow it from now on). */
let primed = false;

/** Inside a tap: start the one sound player with a moment of silence. Phones then let it play later. */
function prime() {
  try {
    if (!player) {
      player = new Audio();
      player.preload = "auto";
      player.setAttribute("x-webkit-airplay", "deny");
    }
    if (primed) return;
    player.src = wavUrl("silent");
    player.load();
    watch(player.play());
  } catch {
    /* no sound on this phone */
  }
}

function watch(p: Promise<void> | undefined, after?: (ok: boolean) => void) {
  if (!p) {
    primed = true;
    changed();
    after?.(true);
    return;
  }
  p.then(
    () => {
      primed = true;
      changed();
      after?.(true);
    },
    () => after?.(false),
  );
}

// ---------- The voice ----------

let voices: SpeechSynthesisVoice[] = [];
let voiceUnlocked = false;
let speakTimer: number | undefined;

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

function loadVoices() {
  try {
    voices = synth()?.getVoices() ?? [];
  } catch {
    voices = [];
  }
}

/** Indian English reads Tamil names best; then any English voice on the phone. */
function bestVoice(): SpeechSynthesisVoice | undefined {
  if (!voices.length) loadVoices();
  const lang = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();
  for (const want of ["en-in", "en-gb", "en-us", "en"]) {
    const list = voices.filter((v) => (want === "en" ? lang(v).startsWith("en") : lang(v) === want));
    const pick = list.find((v) => v.localService) ?? list[0];
    if (pick) return pick;
  }
  return undefined;
}

let voiceListening = false;

/** iPhones only speak after a first (silent) speech inside a tap. Retried on every tap until one really starts. */
function unlockVoice() {
  const s = synth();
  if (!s || voiceUnlocked) return;
  try {
    if (!voiceListening) {
      voiceListening = true;
      s.addEventListener?.("voiceschanged", loadVoices);
      loadVoices();
    }
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.onstart = u.onend = () => {
      voiceUnlocked = true;
    };
    s.speak(u);
  } catch {
    /* no speech on this phone */
  }
}

function speak(words: string) {
  const s = synth();
  if (!s || !activated()) return;
  try {
    if (s.speaking || s.pending) s.cancel();
    if (s.paused) s.resume();
    const u = new SpeechSynthesisUtterance(words);
    const v = bestVoice();
    if (v) u.voice = v;
    else u.lang = "en-IN";
    u.rate = 0.95;
    u.volume = 1;
    u.onstart = () => {
      voiceUnlocked = true;
    };
    s.speak(u);
  } catch {
    /* no speech on this phone */
  }
}

function hush() {
  window.clearTimeout(speakTimer);
  try {
    const s = synth();
    if (s && (s.speaking || s.pending)) s.cancel();
  } catch {
    /* ignore */
  }
}

const VOICE_KEY = "aristora.voice";

/** Read names out loud on this phone (on unless turned off in Settings). */
export function voiceOn(): boolean {
  try {
    return localStorage.getItem(VOICE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setVoiceOn(on: boolean) {
  try {
    localStorage.setItem(VOICE_KEY, on ? "on" : "off");
  } catch {
    /* private mode */
  }
  changed();
}

// ---------- Ring ----------

let tapped = false;

/** The person has tapped this page at least once (phones need that for sound, speech and buzz). */
function activated(): boolean {
  const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return ua ? ua.hasBeenActive : tapped;
}

/** Chime, buzz, then say the words (if names are on). */
export function ring(kind: AlertKind, words?: string) {
  const s = SOUNDS[kind];
  if (activated()) {
    try {
      navigator.vibrate?.(s.vibrate);
    } catch {
      /* no buzz on iPhones */
    }
  }
  hush();
  const say = words && voiceOn() ? words : "";
  const sayAfter = (ms: number) => {
    if (say) speakTimer = window.setTimeout(() => speak(say), ms);
  };
  const p = player;
  if (!p) {
    sayAfter(0);
    return;
  }
  try {
    p.pause();
    p.src = wavUrl(kind);
    watch(p.play(), (ok) => sayAfter(ok ? s.speakAt * 1000 : 0));
  } catch {
    sayAfter(0);
  }
}

/** The Settings "Test" button. */
export function testAlert(name: string) {
  armAlerts();
  ring("call", `Test. ${name}, go to Theory.`);
}

// ---------- Keep the screen on ----------

type Sentinel = { addEventListener(t: "release", cb: () => void): void };
let lock: Sentinel | null = null;
let asking = false;
let video: HTMLVideoElement | null = null;
let wantAwake = false;

function wakeLockApi() {
  return (navigator as Navigator & { wakeLock?: { request(t: "screen"): Promise<Sentinel> } }).wakeLock;
}

/** Phones where the wake lock is missing or unreliable also get the silent video. */
function needsVideo(): boolean {
  if (!wakeLockApi()) return true; // iPhone 7 Plus (iOS 15) and older browsers
  // iPhone home-screen app: the wake lock did nothing there before iOS 18.4.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

async function holdScreen() {
  const wl = wakeLockApi();
  if (!wl || lock || asking || document.visibilityState !== "visible") return;
  asking = true;
  try {
    const l = await wl.request("screen");
    lock = l;
    l.addEventListener("release", () => {
      if (lock === l) lock = null;
      changed();
    });
  } catch {
    lock = null;
  } finally {
    asking = false;
    changed();
  }
}

function playVideo() {
  try {
    if (!video) {
      const v = document.createElement("video");
      v.setAttribute("playsinline", "");
      v.setAttribute("webkit-playsinline", "");
      v.setAttribute("x-webkit-airplay", "deny");
      v.setAttribute("aria-hidden", "true");
      v.tabIndex = -1;
      Object.assign(v.style, { position: "absolute", left: "-100%", top: "-100%", pointerEvents: "none" });
      for (const [type, src] of [
        ["webm", media.webm],
        ["mp4", media.mp4],
      ] as const) {
        const source = document.createElement("source");
        source.src = src;
        source.type = `video/${type}`;
        v.appendChild(source);
      }
      v.addEventListener("loadedmetadata", () => {
        if (v.duration <= 1) v.loop = true;
        // iPhones (mp4): a looping video lets the phone sleep, so jump back before the end instead.
        else
          v.addEventListener("timeupdate", () => {
            if (v.currentTime > 0.5) v.currentTime = Math.random();
          });
      });
      v.addEventListener("playing", changed);
      v.addEventListener("pause", changed);
      document.body.appendChild(v);
      video = v;
    }
    if (video.paused) void video.play().catch(changed);
  } catch {
    /* no video on this phone */
  }
}

// ---------- Arming, state ----------

/** Run on every tap: turns sound, voice and keep-awake on (again) where needed. Cheap when all is on. */
export function armAlerts() {
  tapped = true;
  prime();
  unlockVoice();
  try {
    // iPhone (iOS 17+): page sound plays even with the silent switch on.
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session && session.type !== "playback") session.type = "playback";
  } catch {
    /* older phones */
  }
  wantAwake = true;
  void holdScreen();
  if (needsVideo()) playVideo();
  changed();
}

/** Arm on any tap anywhere on the page, for as long as the page is open. */
export function listenForTaps(): () => void {
  const events = ["pointerup", "touchend", "click", "keydown"] as const;
  for (const e of events) window.addEventListener(e, armAlerts, { capture: true, passive: true });
  return () => {
    for (const e of events) window.removeEventListener(e, armAlerts, { capture: true });
  };
}

export type AlertsState = {
  /** Sound can play. */
  on: boolean;
  /** Something needs one tap (first visit, or the iPhone video stopped). */
  needTap: boolean;
  /** How the screen is kept on. */
  awake: "lock" | "video" | "off";
  voice: boolean;
};

export function alertsState(): AlertsState {
  const videoOn = !!video && !video.paused;
  return {
    on: primed,
    needTap: !primed || (wantAwake && needsVideo() && !videoOn),
    awake: lock ? "lock" : videoOn ? "video" : "off",
    voice: voiceOn(),
  };
}

const listeners = new Set<() => void>();
let last = "";

function changed() {
  const now = JSON.stringify(alertsState());
  if (now === last) return;
  last = now;
  for (const l of listeners) l();
}

export function useAlertsState(): AlertsState {
  const [s, set] = useState(alertsState);
  useEffect(() => {
    const l = () => set(alertsState());
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, []);
  return s;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !wantAwake) return;
    void holdScreen();
    // Coming back to the page: try the video again (an iPhone may want a tap; the banner asks for it).
    if (needsVideo() && video?.paused) void video.play().catch(changed);
    changed();
  });
}
