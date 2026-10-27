// Live class data for this phone: the board from Convex, server time,
// instant (optimistic) marks, toasts.

import { useCallback, useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { computeStatus, type Mark, type MarkState, type Marks, type Status } from "../convex/lib/status";
import { errorText, mutate, subscribe, watchLink, type Link } from "./backend";

export type Student = Doc<"students">;
export type Call = Doc<"calls">;
export type Board = {
  students: Student[];
  calls: Call[];
  session: { _id: Id<"sessions">; startedAt: number; lastActivityAt: number } | null;
};
export type Role = "correction" | "theory" | "evaluation";

let board: Board | null = null;
let boardError: string | null = null;
let link: Link = { connected: false, everConnected: false, sending: 0 };
let offset = 0;
let role: Role = "correction";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function startStore() {
  subscribe(
    api.state.get,
    {},
    (value) => {
      board = value;
      boardError = null;
      emit();
    },
    (e) => {
      boardError = errorText(e);
      emit();
    },
  );
  watchLink((l) => {
    link = l;
    emit();
  });
  void syncClock();
  setInterval(() => void syncClock(), 10 * 60_000);
}

async function syncClock() {
  try {
    const t0 = Date.now();
    const server = await mutate(api.clock.ping, {});
    const t1 = Date.now();
    if (t1 - t0 < 5_000) offset = server - (t0 + t1) / 2;
    emit();
  } catch {
    /* keep the old offset */
  }
}

/** Time on the server clock, so every phone shows the same timers. */
export function now(): number {
  return Date.now() + offset;
}

function useForceUpdate(): () => void {
  const [, set] = useState(0);
  return useCallback(() => set((x) => x + 1), []);
}

export function useStore() {
  const force = useForceUpdate();
  useEffect(() => {
    listeners.add(force);
    return () => {
      listeners.delete(force);
    };
  }, []);
  return { board, boardError, link };
}

/** Re-render every `ms` so timers move. Returns server time. */
export function useTick(ms: number): number {
  const force = useForceUpdate();
  useEffect(() => {
    const id = setInterval(force, ms);
    return () => clearInterval(id);
  }, [ms]);
  return now();
}

export function setRole(r: Role) {
  role = r;
}
export function currentRole(): Role {
  return role;
}

// ---- Instant marks: show the tap at once, then let the server confirm. ----

type Pending = { mark: Mark | null; token: number };
const overlay = new Map<string, Map<number, Pending>>();
let tokens = 0;
const statusCache = new WeakMap<Student, Status>();

export function marksOf(s: Student): Marks {
  const o = overlay.get(s._id);
  if (!o || o.size === 0) return s.marks;
  const m: Marks = { ...s.marks };
  for (const [q, p] of o) {
    if (p.mark === null) delete m[String(q)];
    else m[String(q)] = p.mark;
  }
  return m;
}

export function statusOf(s: Student): Status {
  const o = overlay.get(s._id);
  if (o && o.size > 0) return computeStatus(marksOf(s));
  let st = statusCache.get(s);
  if (!st) {
    st = computeStatus(s.marks);
    statusCache.set(s, st);
  }
  return st;
}

function withOverlay<T>(s: Student, q: number, mark: Mark | null, run: () => Promise<T>): Promise<T> {
  let o = overlay.get(s._id);
  if (!o) {
    o = new Map();
    overlay.set(s._id, o);
  }
  const token = ++tokens;
  o.set(q, { mark, token });
  emit();
  return run().finally(() => {
    if (o!.get(q)?.token === token) o!.delete(q);
    emit();
  });
}

export async function setMark(s: Student, q: number, state: MarkState | null): Promise<boolean> {
  const prev = marksOf(s)[String(q)] ?? null;
  if ((prev?.s ?? null) === state) return true;
  const n = (prev?.n ?? 0) + (state === "wrong" ? 1 : 0);
  const next: Mark | null = state === null ? null : n ? { s: state, n, t: now() } : { s: state, t: now() };
  try {
    await withOverlay(s, q, next, () => mutate(api.marks.set, { studentId: s._id, q, s: state, by: role }));
    return true;
  } catch (e) {
    toast(errorText(e), "error");
    return false;
  }
}

export async function restoreMark(s: Student, q: number, mark: Mark | null) {
  try {
    await withOverlay(s, q, mark, () => mutate(api.marks.restore, { studentId: s._id, q, mark, by: role }));
  } catch (e) {
    toast(errorText(e), "error");
  }
}

/** Run a change; show its error as a toast. Returns undefined on failure. */
export async function act<T>(run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run();
  } catch (e) {
    toast(errorText(e), "error");
    return undefined;
  }
}

// ---- Toasts ----

export type Toast = { id: number; text: string; kind: "info" | "error"; undo?: () => void };
let toasts: Toast[] = [];
let toastId = 0;
const toastListeners = new Set<() => void>();

export function toast(text: string, kind: Toast["kind"] = "info", undo?: () => void) {
  const id = ++toastId;
  toasts = [{ id, text, kind, undo }];
  for (const l of toastListeners) l();
  setTimeout(() => dismissToast(id), kind === "error" ? 7000 : undo ? 6000 : 3500);
}

export function dismissToast(id: number) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) for (const l of toastListeners) l();
}

export function useToasts(): Toast[] {
  const force = useForceUpdate();
  useEffect(() => {
    toastListeners.add(force);
    return () => {
      toastListeners.delete(force);
    };
  }, []);
  return toasts;
}
