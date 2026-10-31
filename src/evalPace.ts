// How long Evaluation takes per explanation, learnt on her own phone (1 Nov 2026, his pick: "free in ~6 min" and call
// the next ones ahead). Each Explained or → Theory tap is one explanation (one tap counts once, however many students
// with her share the question); its length is the time since her last such tap, or since they arrived. Gaps under 15
// seconds (a quick run of taps) and over 10 minutes (a break, a chat) don't count. 3 minutes until she has done 3.

const KEY = "aristora.evalPace";
/** Her pace until the phone has learnt it. */
export const PACE_DEFAULT_MS = 3 * 60_000;
/** Call the next ones this long before she is free: Correction sends them, they walk over (about 3 minutes). */
export const CALL_AHEAD_MS = 4 * 60_000;
const MIN_GAP = 15_000;
const MAX_GAP = 10 * 60_000;
const KEEP = 20;

type Saved = { last?: number; gaps: number[] };
let memory: Saved = { gaps: [] };

function read(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Saved;
      if (Array.isArray(s.gaps)) return s;
    }
  } catch {
    // no storage: memory
  }
  return memory;
}

function write(s: Saved) {
  memory = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // memory keeps it while the app is open
  }
}

/** They came in (Arrived): the next explanation is timed from now. */
export function noteStart(now: number) {
  write({ ...read(), last: now });
}

/** She explained a question (Explained or → Theory): one more length learnt. */
export function noteExplained(now: number) {
  const s = read();
  const gaps = [...s.gaps];
  if (s.last !== undefined) {
    const gap = now - s.last;
    if (gap >= MIN_GAP && gap <= MAX_GAP) gaps.push(gap);
  }
  write({ last: now, gaps: gaps.slice(-KEEP) });
}

/** Her pace: the middle of her recent explanations (3 at least), else 3 minutes. */
export function paceOf(gaps: readonly number[]): number {
  if (gaps.length < 3) return PACE_DEFAULT_MS;
  const s = [...gaps].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Her pace as this phone knows it now. */
export function evalPaceMs(): number {
  return paceOf(read().gaps);
}

/**
 * When she is free: every question still open for someone with her (each once: one explanation for all who share
 * it), and those on the way, at her pace. Call ahead: free within 4 minutes, nobody on the way yet, room left and
 * someone ticked: call now, and they walk in as she finishes.
 */
export function freeIn(o: { open: number; coming: number; pace: number }): number {
  return (o.open + o.coming) * o.pace;
}
export function callAhead(o: { live: boolean; freeInMs: number; coming: number; left: number; ticked: number }): boolean {
  return o.live && o.coming === 0 && o.left > 0 && o.ticked > 0 && o.freeInMs <= CALL_AHEAD_MS;
}
