// Tapping circles on the register. Each tap moves a circle to its next state at
// once; the change is saved when the taps on that student stop (SAVE_AFTER_MS),
// so tapping past "wrong" on the way to "slip" never counts a wrong answer.

import { api } from "../convex/_generated/api";
import type { Mark, MarkState } from "../convex/lib/status";
import { longLabel, sectionById, typeOf } from "../convex/lib/unit";
import { errorText, mutate } from "./backend";
import { currentRole, dropOverlay, marksOf, now, putOverlay, toast, type Role, type Student } from "./store";

export const SAVE_AFTER_MS = 900;

const WORDS: Record<MarkState, string> = {
  taught: "taught",
  skip: "skipped",
  right: "right",
  wrong: "wrong",
  slip: "slip",
  explained: "explained",
};

/** What one more tap does, for this teacher. undefined = this teacher can't change it. */
export function nextState(
  role: Role,
  q: number,
  current: MarkState | null,
  base: MarkState | null,
): MarkState | null | undefined {
  const type = typeOf(q);
  if (role === "correction") {
    if (type !== "solo") return undefined;
    // right -> wrong -> slip -> back to how it was (empty, or explained/skip for a redo)
    const back = base === "right" || base === "wrong" || base === "slip" ? null : base;
    const ring: (MarkState | null)[] = ["right", "wrong", "slip", back];
    return ring[(ring.indexOf(current) + 1) % ring.length];
  }
  if (role === "theory") {
    if (type === "teach") {
      const ring: (MarkState | null)[] = ["taught", "skip", null];
      return ring[(ring.indexOf(current) + 1) % ring.length];
    }
    // Theory may mark a ladder question as "skip" before the student does it.
    if (base === null || base === "skip") return current === "skip" ? null : "skip";
    return undefined;
  }
  // Evaluation: wrong <-> explained. A taught circle can be cleared (re-teach).
  if (type === "solo") {
    if (base === "wrong" || base === "explained") return current === "explained" ? "wrong" : "explained";
    return undefined;
  }
  if (base === "taught") return current === "taught" ? null : "taught";
  return undefined;
}

export function canTap(role: Role, q: number, base: MarkState | null): boolean {
  return nextState(role, q, base, base) !== undefined;
}

type Burst = {
  student: Student;
  base: Map<number, Mark | null>;
  next: Map<number, MarkState | null>;
  tokens: Map<number, number>;
  timer: ReturnType<typeof setTimeout> | null;
};
const bursts = new Map<string, Burst>();

export function isUnsaved(studentId: string, q: number): boolean {
  return bursts.get(studentId)?.next.has(q) ?? false;
}

function burstFor(student: Student): Burst {
  let b = bursts.get(student._id);
  if (!b) {
    b = { student, base: new Map(), next: new Map(), tokens: new Map(), timer: null };
    bursts.set(student._id, b);
  }
  b.student = student;
  return b;
}

function show(b: Burst, q: number, next: MarkState | null) {
  const base = b.base.get(q) ?? null;
  const n = (base?.n ?? 0) + (next === "wrong" && base?.s !== "wrong" ? 1 : 0);
  const mark: Mark | null = next === null ? null : n ? { s: next, n, t: now() } : { s: next, t: now() };
  b.next.set(q, next);
  b.tokens.set(q, putOverlay(b.student._id, q, mark));
}

function schedule(b: Burst) {
  if (b.timer) clearTimeout(b.timer);
  b.timer = setTimeout(() => void commit(b.student._id), SAVE_AFTER_MS);
}

/** One tap on one circle. Returns false if this teacher can't change it. */
export function tap(student: Student, q: number): boolean {
  const role = currentRole();
  const b = burstFor(student);
  if (!b.base.has(q)) b.base.set(q, student.marks[String(q)] ?? null);
  const base = b.base.get(q)?.s ?? null;
  const current = marksOf(student)[String(q)]?.s ?? null;
  const next = nextState(role, q, current, base);
  if (next === undefined) {
    if (b.next.size === 0) bursts.delete(student._id);
    return false;
  }
  show(b, q, next);
  schedule(b);
  return true;
}

/** Theory: tap the section letter = all its teacher questions taught (tap again = back). */
export function tapSection(student: Student, sectionId: string) {
  const sec = sectionById(sectionId);
  if (!sec || sec.teach.length === 0) return;
  const b = burstFor(student);
  for (const q of sec.teach) if (!b.base.has(q)) b.base.set(q, student.marks[String(q)] ?? null);
  const shown = marksOf(student);
  const allTaught = sec.teach.every((q) => shown[String(q)]?.s === "taught");
  for (const q of sec.teach) {
    const base = b.base.get(q)?.s ?? null;
    show(b, q, allTaught ? (base === "taught" ? null : base) : "taught");
  }
  schedule(b);
}

async function commit(studentId: string): Promise<void> {
  const b = bursts.get(studentId);
  if (!b) return;
  bursts.delete(studentId);
  if (b.timer) clearTimeout(b.timer);
  const items = [...b.next].filter(([q, s]) => (b.base.get(q)?.s ?? null) !== s).map(([q, s]) => ({ q, s }));
  const drop = () => {
    for (const [q, token] of b.tokens) dropOverlay(studentId, q, token);
  };
  if (items.length === 0) {
    drop();
    return;
  }
  try {
    const res = await mutate(api.marks.setMany, { studentId: b.student._id, items, by: currentRole() });
    drop();
    const words = items.map((it) => `${longLabel(it.q)} ${it.s ? WORDS[it.s] : "cleared"}`).join(", ");
    toast(`${b.student.name}: ${words}`, "info", () => void undo(b.student, res.prev));
  } catch (e) {
    drop();
    toast(errorText(e), "error");
  }
}

async function undo(student: Student, prev: { q: number; mark: Mark | null }[]) {
  if (prev.length === 0) return;
  const tokens = prev.map((p) => [p.q, putOverlay(student._id, p.q, p.mark)] as const);
  try {
    await mutate(api.marks.restoreMany, { studentId: student._id, items: prev, by: currentRole() });
  } catch (e) {
    toast(errorText(e), "error");
  } finally {
    for (const [q, token] of tokens) dropOverlay(student._id, q, token);
  }
}

/** Save every waiting tap now (before Done, or when the page is hidden). */
export async function flushTaps(): Promise<void> {
  await Promise.all([...bursts.keys()].map((id) => commit(id)));
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushTaps();
  });
  window.addEventListener("pagehide", () => void flushTaps());
}
