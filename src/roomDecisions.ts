// Her taps in her room, kept on this phone until Done (the audit, 31 Oct 2026). Evaluation: explained / to Theory /
// not now; Theory: taught / not reached; a consultation (5 Nov 2026): Not now and what an undo needs (its taps
// themselves are saved on the server at once). They lived only in the page, so opening Class, Settings or another tab, or the
// page loading again (Chrome drops a tab in the background; a reload after a deploy), lost them all, and "All explained"
// in his file then marked as explained even the questions she had sent to Theory.
//
// Kept per CALL: a new call for the same student starts empty (yesterday's "not now" never decides today's question).
// Stored in localStorage (this phone only; the page falls back to memory when storage is refused). Entries of calls
// that ended are dropped after 12 hours.

import { useState } from "preact/hooks";

/** One call in her room: its id, and the key her decisions use for his book ("student:unit:stage"). */
export type DecCall = { id: string; key: string };
type Saved<D> = Record<string, { k: string; d: D; at: number }>;

const KEEP_MS = 12 * 60 * 60_000;
const memory: Record<string, Saved<unknown>> = {};
const storeKey = (room: string) => `aristora.dec.${room}`;

function read<D>(room: string): Saved<D> {
  try {
    const raw = localStorage.getItem(storeKey(room));
    if (raw) return JSON.parse(raw) as Saved<D>;
  } catch {
    // no storage (private mode) or a broken entry: memory below
  }
  return (memory[room] as Saved<D> | undefined) ?? {};
}

function write<D>(room: string, saved: Saved<D>) {
  memory[room] = saved as Saved<unknown>;
  try {
    localStorage.setItem(storeKey(room), JSON.stringify(saved));
  } catch {
    // memory keeps them while the app is open
  }
}

/** Her decisions for the calls in her room now (by his book's key), as she left them. */
export function loadDecisions<D>(room: string, calls: readonly DecCall[]): Record<string, D> {
  const saved = read<D>(room);
  const out: Record<string, D> = {};
  for (const c of calls) {
    const s = saved[c.id];
    if (s && s.k === c.key) out[c.key] = s.d;
  }
  return out;
}

/** Keep her decisions for these calls (a student with none: his entry goes); old entries of ended calls go too. */
export function saveDecisions<D extends object>(room: string, calls: readonly DecCall[], dec: Record<string, D>, now: number) {
  const saved = read<D>(room);
  const next: Saved<D> = {};
  for (const [id, s] of Object.entries(saved)) if (now - s.at < KEEP_MS) next[id] = s;
  for (const c of calls) {
    const d = dec[c.key];
    if (d && Object.values(d).some((x) => x !== undefined)) next[c.id] = { k: c.key, d, at: now };
    else delete next[c.id];
  }
  write(room, next);
}

/**
 * useState for her decisions, kept on this phone: starts from what she left for the calls in her room, and every
 * change is saved at once.
 */
export function useRoomDecisions<D extends object>(room: "evaluation" | "theory" | "consult", calls: readonly DecCall[]): [Record<string, D>, (next: Record<string, D>) => void] {
  const [dec, setDec] = useState<Record<string, D>>(() => loadDecisions<D>(room, calls));
  const set = (next: Record<string, D>) => {
    setDec(next);
    saveDecisions(room, calls, next, Date.now());
  };
  return [dec, set];
}
