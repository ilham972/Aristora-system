// Live class data for this phone: the board from Convex, the syllabus, server time,
// instant (optimistic) marks, toasts.

import { useCallback, useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { fighter, type Fighter, type MasterData } from "../convex/lib/book";
import { EMPTY_MASTER, type MState } from "../convex/lib/master";
import { computeStatus, type Mark, type Marks, type Status } from "../convex/lib/status";
import { SIGNED_OUT } from "../convex/lib/auth";
import { errorText, mutate, phoneToken, savePhoneToken, subscribe, watchLink, type Link } from "./backend";

export type Student = Doc<"students">;
export type Call = Doc<"calls">;
export type Unit = Doc<"units">;
export type BookDoc = Doc<"books">;
export type Progress = Doc<"progress">;
export type Stage = "fighter" | "master" | "legend" | "sprint";
export type Board = {
  students: Student[];
  progress: Record<string, Progress>;
  books: Record<string, BookDoc>;
  calls: Call[];
  session: { _id: Id<"sessions">; startedAt: number; lastActivityAt: number } | null;
  legacy: boolean;
};
export type Role = "correction" | "theory" | "evaluation";
export type Extra = "students" | "books" | "reports";
/** This phone's person, as the server tells it. */
export type Me = {
  _id: Id<"users">;
  name: string;
  role: "owner" | "teacher";
  tabs: Role[];
  can: Extra[];
  hasPin: boolean;
  deviceId: Id<"devices">;
};
export type MeState = { user: Me | null; setupDone: boolean };

export const STAGES: { id: Stage; name: string; short: string }[] = [
  { id: "fighter", name: "Fighter", short: "F" },
  { id: "master", name: "Master", short: "M" },
  { id: "legend", name: "Legend", short: "L" },
  { id: "sprint", name: "Exam Sprint", short: "S" },
];
export const stageName = (s: Stage | null | undefined) => STAGES.find((x) => x.id === s)?.name ?? "No stage";

let board: Board | null = null;
let boardError: string | null = null;
let link: Link = { connected: false, everConnected: false, sending: 0 };
let offset = 0;
let role: Role = "correction";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

let units: Unit[] | null = null;
const unitById = new Map<string, Unit>();
let ensuring = false;
/** Undefined until the server answers who this phone is. */
let me: MeState | undefined;
let stopMe: (() => void) | null = null;
let stopBoard: (() => void) | null = null;

/** One-time data updates on the server (syllabus, books, students from before stages). */
async function ensureData() {
  if (ensuring) return;
  ensuring = true;
  try {
    await mutate(api.setup.ensure, {});
  } catch {
    /* offline: the next board update tries again */
  } finally {
    ensuring = false;
  }
}

export function startStore() {
  watchMe();
  watchLink((l) => {
    link = l;
    emit();
  });
  void syncClock();
  setInterval(() => void syncClock(), 10 * 60_000);
}

/** Who this phone is. Signed in: the class data comes. Signed out (or signed out by the owner): it stops. */
function watchMe() {
  stopMe?.();
  stopMe = subscribe(
    api.auth.me,
    {},
    (value) => {
      me = value;
      if (value.user) {
        if (!value.user.tabs.includes(role)) role = value.user.tabs[0] ?? "correction";
        if (!stopBoard) stopBoard = startBoard();
      } else {
        stopBoard?.();
        stopBoard = null;
        board = null;
        if (phoneToken()) {
          // The key no longer works (signed out from the owner's phone, or unused for months).
          savePhoneToken(null);
          watchMe();
        }
      }
      emit();
    },
    (e) => {
      boardError = errorText(e);
      emit();
    },
  );
}

/** This phone has just signed in with a new key. */
export function signedIn(token: string) {
  savePhoneToken(token);
  me = undefined;
  watchMe();
  emit();
}

/** Sign this phone out. */
export async function signOutHere(): Promise<void> {
  try {
    await mutate(api.auth.signOut, {});
  } catch {
    /* offline: the key is forgotten here anyway */
  }
  stopBoard?.();
  stopBoard = null;
  board = null;
  savePhoneToken(null);
  me = undefined;
  watchMe();
  emit();
}

function startBoard(): () => void {
  void ensureData();
  const stops = [
    subscribe(
      api.state.get,
      {},
      (value) => {
        board = value;
        boardError = null;
        if (value.legacy) void ensureData();
        emit();
      },
      (e) => {
        const text = errorText(e);
        if (text === SIGNED_OUT) return; // the sign-in screen takes over
        boardError = text;
        emit();
      },
    ),
    subscribe(
      api.catalog.units,
      {},
      (value) => {
        units = value;
        unitById.clear();
        for (const u of value) unitById.set(u._id, u);
        emit();
      },
      () => {},
    ),
  ];
  return () => {
    for (const stop of stops) stop();
    board = null;
    boardError = null;
  };
}

export function currentMe(): Me | null {
  return me?.user ?? null;
}

/** Owner, or has this permission (tabs and extras). */
export function may(what: Role | Extra | "owner"): boolean {
  const u = me?.user;
  if (!u) return false;
  if (u.role === "owner") return true;
  if (what === "owner") return false;
  return (u.tabs as string[]).includes(what) || (u.can as string[]).includes(what);
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
  return { board, boardError, link, units, me };
}

export function unitOf(id: string | undefined | null): Unit | null {
  return id ? (unitById.get(id) ?? null) : null;
}
export function allUnits(): Unit[] {
  return units ?? [];
}

// ---- A student's book and his work in it ----

export function bookDocOf(s: Student): BookDoc | null {
  if (!board || !s.unitId || (s.stage !== "fighter" && s.stage !== "master")) return null;
  return board.books[`${s.unitId}:${s.stage}`] ?? null;
}
export function fighterOf(s: Student): Fighter | null {
  const b = bookDocOf(s);
  return b && b.data.kind === "fighter" ? fighter(b.data) : null;
}
export function masterOf(s: Student): MasterData | null {
  const b = bookDocOf(s);
  return b && b.data.kind === "master" ? b.data : null;
}
export function progressOf(s: Student): Progress | null {
  return board?.progress[s._id] ?? null;
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
const statusCache = new WeakMap<object, Status>();
const NO_MARKS: Marks = {};

/** His circles in his theory book, with taps not saved yet shown at once. */
export function marksOf(s: Student): Marks {
  const base = (s.stage === "fighter" ? progressOf(s)?.marks : undefined) ?? NO_MARKS;
  const o = overlay.get(s._id);
  if (!o || o.size === 0) return base;
  const m: Marks = { ...base };
  for (const [q, p] of o) {
    if (p.mark === null) delete m[String(q)];
    else m[String(q)] = p.mark;
  }
  return m;
}

/** Saved circle states only (what a burst of taps starts from). */
export function savedMarks(s: Student): Marks {
  return (s.stage === "fighter" ? progressOf(s)?.marks : undefined) ?? NO_MARKS;
}

export function statusOf(s: Student): Status | null {
  const f = fighterOf(s);
  if (!f) return null;
  const o = overlay.get(s._id);
  if (o && o.size > 0) return computeStatus(marksOf(s), f);
  const p = progressOf(s);
  const key: object = p ?? f.data;
  let st = statusCache.get(key);
  if (!st || !p) {
    st = computeStatus(p?.marks ?? NO_MARKS, f);
    if (p) statusCache.set(key, st);
  }
  return st;
}

/** His workbook state (Master), with explanations and Theory's taps not saved yet shown at once. */
export function masterStateOf(s: Student): MState {
  const base = ((s.stage === "master" ? progressOf(s)?.m : undefined) as MState | undefined) ?? EMPTY_MASTER;
  const o = mOverlay.get(s._id);
  const t = tOverlay.get(s._id);
  if ((!o || o.size === 0) && (!t || t.size === 0)) return base;
  const q = { ...base.q };
  for (const [n, on] of o ?? []) {
    const r = q[String(n)];
    if (!r) continue;
    if (on) q[String(n)] = { ...r, x: r.x ?? now() };
    else {
      const { x: _x, ...rest } = r;
      q[String(n)] = rest;
    }
  }
  for (const [n, on] of t ?? []) {
    const r = q[String(n)];
    if (!r?.th) continue;
    if (on) q[String(n)] = { ...r, tt: r.tt ?? now() };
    else {
      const { tt: _tt, ...rest } = r;
      q[String(n)] = rest;
    }
  }
  return { ...base, q };
}

const mOverlay = new Map<string, Map<number, boolean>>();
const tOverlay = new Map<string, Map<number, boolean>>();

/** Theory taps on a Master question sent to it: taught or not, shown at once. */
export async function setTaught(s: Student, qs: number[], on: boolean): Promise<void> {
  let o = tOverlay.get(s._id);
  if (!o) {
    o = new Map();
    tOverlay.set(s._id, o);
  }
  for (const q of qs) o.set(q, on);
  emit();
  try {
    await mutate(api.workbook.taught, { studentId: s._id, unitId: s.unitId, qs, on, by: role });
  } catch (e) {
    toast(errorText(e), "error");
  } finally {
    for (const q of qs) if (o.get(q) === on) o.delete(q);
    emit();
  }
}

/** Evaluation taps on a Master student's lost-mark question: explained or not, shown at once. */
export async function setExplained(s: Student, qs: number[], on: boolean): Promise<void> {
  let o = mOverlay.get(s._id);
  if (!o) {
    o = new Map();
    mOverlay.set(s._id, o);
  }
  for (const q of qs) o.set(q, on);
  emit();
  try {
    await mutate(api.workbook.explain, { studentId: s._id, unitId: s.unitId, qs, on, by: role });
  } catch (e) {
    toast(errorText(e), "error");
  } finally {
    for (const q of qs) if (o.get(q) === on) o.delete(q);
    emit();
  }
}

/** Show a circle's new state at once, before the server confirms. Returns a token. */
export function putOverlay(studentId: string, q: number, mark: Mark | null): number {
  let o = overlay.get(studentId);
  if (!o) {
    o = new Map();
    overlay.set(studentId, o);
  }
  const token = ++tokens;
  o.set(q, { mark, token });
  emit();
  return token;
}

/** Remove an instant state once the server has it (only if no newer tap replaced it). */
export function dropOverlay(studentId: string, q: number, token: number) {
  const o = overlay.get(studentId);
  if (o?.get(q)?.token === token) {
    o.delete(q);
    emit();
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
