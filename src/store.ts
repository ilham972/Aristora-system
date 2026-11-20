// Live class data for this phone: the board from Convex, the syllabus, server time,
// instant (optimistic) marks, toasts.

import { useCallback, useEffect, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { fighter, type Fighter, type MasterData } from "../convex/lib/book";
import { EMPTY_MASTER, type MState } from "../convex/lib/master";
import { computeStatus, type Mark, type Marks, type Status } from "../convex/lib/status";
import { SIGNED_OUT } from "../convex/lib/auth";
import type { Dept, PageId } from "../convex/lib/dept";
import type { SimInfo } from "../convex/sim";
import { isSkbGrade, isSkGrade, skbGrade, skGrade } from "../convex/lib/sakarath";
import { OL } from "../convex/lib/syllabus";
import { errorText, mutate, phoneToken, savePhoneToken, setLookOnly, subscribe, watchLink, type Link } from "./backend";

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
  /** Students in class: their other books with something waiting (missing on an old server). */
  more?: Record<string, Progress[]>;
  /** Books given to them (not their book now): does each still have work? */
  given?: Record<string, { unitId: Id<"units">; stage: "fighter" | "master"; work: boolean; done?: boolean }[]>;
  /** Students in class holding the printed Sakarath book (19 Nov 2026): their rows in its units, for Correction. */
  sk?: Record<string, Progress[]>;
  calls: Call[];
  /** stats[room][key]: each room's score for this class (src/score.ts); missing on an old server. */
  session: { _id: Id<"sessions">; startedAt: number; lastActivityAt: number; stats?: Record<string, Record<string, number>> } | null;
  legacy: boolean;
  /** How many test students there are (the simulation's: a phone showing it sees only them); missing on an old server. */
  tests?: number;
  /** The simulation running or just ended (the Join banner, SIM in the top bar); missing on an old server. */
  sim?: SimInfo | null;
  /**
   * Attendance mode off (12 Nov 2026, the switch on Attendance): every student shows on every page, signed in or not;
   * missing on an old server = on.
   */
  attOff?: boolean;
};
export type Role = "correction" | "theory" | "evaluation";
/** A person's jobs (Settings → People): the three pages, and Manager (3 Nov 2026: the hall and every room). */
export type Job = Role | "manager";
/** What a tap is recorded as (`by`): the page's job, or the Manager page. */
export type By = Role | "manager";
export type Extra = "students" | "books" | "reports" | "feedback" | "photos" | "consult" | "community" | "money";
/** This phone's person, as the server tells it. */
export type Me = {
  _id: Id<"users">;
  name: string;
  role: "owner" | "teacher";
  tabs: Job[];
  can: Extra[];
  hasPin: boolean;
  /** The owner teaches today (his switch in Settings → Account): his room on the Manager page. */
  teaching?: boolean;
  /** Her department and whether she leads it (8 Nov 2026, Settings → Roles). */
  dept?: Dept;
  lead?: boolean;
  /** Her own app: the pages of her bottom bar. Unset = the app of before. */
  pages?: PageId[];
  /** Her photo's key (set in the Us tab): us.pics gives the picture. */
  photo?: string;
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
let role: By = "correction";
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

let units: Unit[] | null = null;
const unitById = new Map<string, Unit>();
/** Each unit's Sakarath book's own unit, by its unit's key (17 Nov 2026, convex/lib/sakarath.ts). */
const skByKey = new Map<string, Unit>();
let ensuring = false;
/** Undefined until the server answers who this phone is. */
let me: MeState | undefined;
let stopMe: (() => void) | null = null;
let stopBoard: (() => void) | null = null;

// ---- The simulation (1 Nov 2026; the test class of 31 Oct before it): a phone showing it sees only the simulation's
// made-up students (test students), a phone in the class only the real ones. Each phone chooses (Settings, or the Join
// banner); the choice stays on the phone.
const TEST_KEY = "aristora.testClass";
let test = (() => {
  try {
    return localStorage.getItem(TEST_KEY) === "1";
  } catch {
    return false;
  }
})();

/** This phone shows the simulation (test students only). */
export function testMode(): boolean {
  return test;
}

/** Switch this phone between the class and the simulation: its board starts again with the other class. */
export function setTestMode(on: boolean) {
  if (on === test) return;
  test = on;
  try {
    if (on) localStorage.setItem(TEST_KEY, "1");
    else localStorage.removeItem(TEST_KEY);
  } catch {
    /* private mode: for this visit only */
  }
  if (stopBoard) {
    stopBoard();
    stopBoard = startBoard();
  }
  emit();
}

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
  // In the owner's Preview, "Sign out" only ends the preview (his phone stays signed in).
  if (preview) {
    endPreview();
    return;
  }
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

/**
 * The board in parts (10 Nov 2026, the Convex limit: every tap re-read every student's marks on every phone; 20 Nov 2026,
 * 200 students: every tap still re-read every student's row): `state.list` (the class list's ids: changes only when a
 * student joins or leaves), `state.light` (the open calls, the session) and one `state.his` per student (his row and his
 * books), each re-read only when its own rows change. Put together here into the same board `state.get` gives, the
 * students in the list's order (tests/boardSplit.test.ts). Shown once every student's part came (or after 4 s), so a page
 * never opens half-filled.
 */
type His = {
  /** His row (null: removed since the list came). */
  s?: Student | null;
  progress: Progress | null;
  books: Record<string, BookDoc>;
  more: Progress[] | null;
  given: NonNullable<Board["given"]>[string] | null;
  sk?: Progress[] | null;
};
type Light = Omit<Board, "students" | "legacy" | "progress" | "books" | "more" | "given" | "sk" | "tests">;
type List = { ids: string[]; tests: number };
function startBoard(): () => void {
  void ensureData();
  let light: Light | null = null;
  let list: List | null = null;
  const his = new Map<string, His>();
  const hisStops = new Map<string, () => void>();
  let ready = false;
  const readyTimer = window.setTimeout(() => {
    ready = true;
    build();
  }, 4000);
  function build() {
    if (!light || !list) return;
    if (!ready && list.ids.some((id) => !his.has(id))) return;
    ready = true;
    const students: Student[] = [];
    const progress: Board["progress"] = {};
    const books: Board["books"] = {};
    const more: NonNullable<Board["more"]> = {};
    const given: NonNullable<Board["given"]> = {};
    const sk: NonNullable<Board["sk"]> = {};
    for (const id of list.ids) {
      const h = his.get(id);
      // His part not here yet (a slow phone, after 4 s): he joins the board when it comes.
      if (!h?.s) continue;
      students.push(h.s);
      if (h.progress) progress[id] = h.progress;
      Object.assign(books, h.books);
      if (h.more) more[id] = h.more;
      if (h.given) given[id] = h.given;
      if (h.sk) sk[id] = h.sk;
    }
    // Students from before grades and stages: the phone runs setup.ensure first (it used to be the server's `legacy`).
    const legacy = students.some((s) => !s.stage);
    if (legacy) void ensureData();
    // The open calls of this board's class only (the server sends both classes': the real one's and the simulation's).
    const ours = new Set(list.ids);
    board = { ...light, calls: light.calls.filter((c) => ours.has(c.studentId)), tests: list.tests, students, legacy, progress, books, more, given, sk };
    boardError = null;
    emit();
  }
  const follow = (ids: string[]) => {
    const want = new Set(ids);
    for (const [id, stop] of hisStops) {
      if (want.has(id)) continue;
      stop();
      hisStops.delete(id);
      his.delete(id);
    }
    for (const id of ids) {
      if (hisStops.has(id)) continue;
      hisStops.set(
        id,
        subscribe(
          api.state.his,
          { id: id as Id<"students"> },
          (value) => {
            his.set(id, value as His);
            build();
          },
          () => {},
        ),
      );
    }
  };
  const stops = [
    subscribe(
      api.state.list,
      test ? { test: true } : {},
      (value) => {
        list = value as List;
        follow(list.ids);
        build();
      },
      (e) => {
        const text = errorText(e);
        if (text === SIGNED_OUT) return; // the sign-in screen takes over
        boardError = text;
        emit();
      },
    ),
    subscribe(
      api.state.light,
      test ? { test: true } : {},
      (value) => {
        light = value as Light;
        build();
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
        // A Sakarath book's unit (grade 106, 107 …) is never a unit of the syllabus: only its name is looked up. Nor
        // is the printed Sakarath book's own unit (206, 207 …: one stock item per grade, 19 Nov 2026).
        units = value.filter((u) => !isSkGrade(u.grade));
        unitById.clear();
        skByKey.clear();
        for (const u of value) {
          unitById.set(u._id, u);
          if (isSkGrade(u.grade) && !isSkbGrade(u.grade)) skByKey.set(u.key.replace(/-SK$/, ""), u);
        }
        emit();
      },
      () => {},
    ),
  ];
  return () => {
    window.clearTimeout(readyTimer);
    for (const stop of stops) stop();
    for (const stop of hisStops.values()) stop();
    hisStops.clear();
    board = null;
    boardError = null;
  };
}

export function currentMe(): Me | null {
  return preview ?? me?.user ?? null;
}

/** Owner, or has this permission (tabs and extras). */
export function may(what: Job | Extra | "owner"): boolean {
  const u = preview ?? me?.user;
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
  return { board, boardError, link, units, me: preview && me?.user ? { ...me, user: preview } : me };
}

// ---- The owner's Preview of someone's app (8 Nov 2026, Settings → Roles) ----
// The phone shows her app (her pages, her permissions, her own room and consultations), with his sign-in for the
// data, and saves nothing (src/backend.ts: LOOK_ONLY). A banner says so, with Exit.
let preview: Me | null = null;
let previewFrom: "roles" | null = null;
export function startPreview(p: Omit<Me, "deviceId" | "hasPin">) {
  const owner = me?.user;
  if (!owner || owner.role !== "owner") return;
  preview = { ...p, hasPin: false, deviceId: owner.deviceId };
  previewFrom = "roles";
  setLookOnly(true);
  emit();
}
export function endPreview(): "roles" | null {
  const from = previewFrom;
  preview = null;
  previewFrom = null;
  setLookOnly(false);
  emit();
  return from;
}
/** The person being previewed (the owner's phone), or null. */
export const previewing = (): Me | null => preview;

export function unitOf(id: string | undefined | null): Unit | null {
  return id ? (unitById.get(id) ?? null) : null;
}
export function allUnits(): Unit[] {
  return units ?? [];
}
/** A unit's Sakarath book's own unit (Settings → Books → S), or null. */
export function skUnitOf(u: Unit): Unit | null {
  return skByKey.get(u.key) ?? null;
}
/** The O/L Sakarath book's own units (19 Nov 2026: none of them is an O/L topic), in the book's order. */
export function olSkUnits(): Unit[] {
  return skUnitsIn(OL);
}
/** A grade's Sakarath units (the O/L book's own for OL), in the book's order: Correction's units row. */
export function skUnitsIn(grade: number): Unit[] {
  return [...unitById.values()].filter((u) => u.grade === skGrade(grade)).sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}
/** The printed Sakarath book of a grade (19 Nov 2026: one stock item, a unit of its own), or null. */
export function skbUnitIn(grade: number): Unit | null {
  for (const u of unitById.values()) if (u.grade === skbGrade(grade)) return u;
  return null;
}
/** Is this the printed Sakarath book's own unit? */
export function isSkb(id: string | null | undefined): boolean {
  const u = unitOf(id);
  return !!u && isSkbGrade(u.grade);
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

export function setRole(r: By) {
  role = r;
}
/** The job this phone's taps are recorded as: the page it is on (the Manager page: "manager"). */
export function currentRole(): By {
  return role;
}

// ---- Instant marks: show the tap at once, then let the server confirm. ----

/** `unit`: the theory book it belongs to (missing = his book now: the Class board's taps). */
type Pending = { mark: Mark | null; token: number; unit?: string };
const overlay = new Map<string, Map<number, Pending>>();
let tokens = 0;
const statusCache = new WeakMap<object, Status>();
const NO_MARKS: Marks = {};

/** His circles in his theory book, with taps not saved yet shown at once. */
export function marksOf(s: Student): Marks {
  const base = (s.stage === "fighter" ? progressOf(s)?.marks : undefined) ?? NO_MARKS;
  return s.stage === "fighter" ? bookMarks(s._id, s.unitId ?? null, base) : base;
}

/** One theory book's circles (`base` = what the server has) with taps not saved yet shown at once. */
export function bookMarks(studentId: string, unitId: string | null, base: Marks): Marks {
  const o = overlay.get(studentId);
  if (!o || o.size === 0) return base;
  let m: Marks | null = null;
  for (const [q, p] of o) {
    if (p.unit && p.unit !== unitId) continue;
    m ??= { ...base };
    if (p.mark === null) delete m[String(q)];
    else m[String(q)] = p.mark;
  }
  return m ?? base;
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

/** A book's doc (any unit and stage), if the board has it. */
export function bookDocAt(unitId: string, stage: string): BookDoc | null {
  return board?.books[`${unitId}:${stage}`] ?? null;
}

/** His workbook state (Master), with explanations and Theory's taps not saved yet shown at once. */
export function masterStateOf(s: Student): MState {
  const base = ((s.stage === "master" ? progressOf(s)?.m : undefined) as MState | undefined) ?? EMPTY_MASTER;
  return withMasterTaps(base, `${s._id}:${s.unitId}`);
}

/** His state in another workbook of his (he works on several at once), with taps not saved yet. */
export function masterStateIn(s: Student, p: Progress): MState {
  return withMasterTaps(((p.m as MState | undefined) ?? EMPTY_MASTER) as MState, `${s._id}:${p.unitId}`);
}

function withMasterTaps(base: MState, key: string): MState {
  const o = mOverlay.get(key);
  const t = tOverlay.get(key);
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

/** Theory taps on a Master question sent to it: taught or not, shown at once. `unitId`: the book (default: his now). */
export async function setTaught(s: Student, qs: number[], on: boolean, unitId?: Id<"units">): Promise<void> {
  const u = unitId ?? s.unitId;
  let o = tOverlay.get(`${s._id}:${u}`);
  if (!o) {
    o = new Map();
    tOverlay.set(`${s._id}:${u}`, o);
  }
  for (const q of qs) o.set(q, on);
  emit();
  try {
    await mutate(api.workbook.taught, { studentId: s._id, unitId: u, qs, on, by: role });
  } catch (e) {
    toast(errorText(e), "error");
  } finally {
    for (const q of qs) if (o.get(q) === on) o.delete(q);
    emit();
  }
}

/** Evaluation taps on a Master student's lost-mark question: explained or not, shown at once. `unitId`: the book. */
export async function setExplained(s: Student, qs: number[], on: boolean, unitId?: Id<"units">): Promise<void> {
  const u = unitId ?? s.unitId;
  let o = mOverlay.get(`${s._id}:${u}`);
  if (!o) {
    o = new Map();
    mOverlay.set(`${s._id}:${u}`, o);
  }
  for (const q of qs) o.set(q, on);
  emit();
  try {
    await mutate(api.workbook.explain, { studentId: s._id, unitId: u, qs, on, by: role });
  } catch (e) {
    toast(errorText(e), "error");
  } finally {
    for (const q of qs) if (o.get(q) === on) o.delete(q);
    emit();
  }
}

/** Show a circle's new state at once, before the server confirms. Returns a token. */
export function putOverlay(studentId: string, q: number, mark: Mark | null, unit?: string): number {
  let o = overlay.get(studentId);
  if (!o) {
    o = new Map();
    overlay.set(studentId, o);
  }
  const token = ++tokens;
  o.set(q, unit ? { mark, token, unit } : { mark, token });
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

/** Remove every toast (the Focus tab opening a paper: nothing may sit over its number pad). */
export function clearToasts() {
  if (toasts.length === 0) return;
  toasts = [];
  for (const l of toastListeners) l();
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
