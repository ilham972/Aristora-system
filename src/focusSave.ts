// The Focus tab saves as it goes, so Stop never loses a mark:
// - workbook levels: each mark is kept as a draft on the server (focus.mark) 0.9 s after the last tap on that paper,
//   or at once on Stop, on another paper, or when the phone hides the page. Saving the level (workbook.correct)
//   drops the draft.
// - theory books: right / wrong / slip go to marks.setMany the same way the Correction tab's circles do (only the
//   final state of each question, so a quick wrong → right never counts a wrong answer), and show at once on the
//   phone (overlay) before the server has them. No toast: the strip shows each mark.

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Mark, MarkState } from "../convex/lib/status";
import { errorText, mutate } from "./backend";
import type { Given } from "./focusData";
import { currentRole, dropOverlay, now, putOverlay, toast } from "./store";

export const SAVE_AFTER_MS = 900;

type Timer = ReturnType<typeof setTimeout> | null;

// ---- Workbook drafts ----

type DraftItem = { q: number; g: number; dk?: boolean; p?: number[]; dkp?: string[] };
type DraftJob = { studentId: string; unitId: string; level: number; set: Map<number, DraftItem>; clear: Set<number>; timer: Timer };
const draftJobs = new Map<string, DraftJob>();
const draftKey = (studentId: string, level: number) => `${studentId}:${level}`;

/** Keep one question's marks (null = forget them) in a level's draft. */
export function queueDraft(studentId: string, unitId: string, level: number, q: number, given: Given | null, parts?: number[]) {
  const key = draftKey(studentId, level);
  let job = draftJobs.get(key);
  if (!job || job.unitId !== unitId) {
    job = { studentId, unitId, level, set: new Map(), clear: new Set(), timer: null };
    draftJobs.set(key, job);
  }
  if (given) {
    job.clear.delete(q);
    const item: DraftItem =
      given.dk && given.dkp?.length ? { q, g: given.g, dk: true, dkp: [...given.dkp] } : given.dk ? { q, g: 0, dk: true } : { q, g: given.g };
    if (parts && (!given.dk || given.dkp?.length)) item.p = parts;
    job.set.set(q, item);
  } else {
    job.set.delete(q);
    job.clear.add(q);
  }
  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(() => void commitDraft(key), SAVE_AFTER_MS);
}

async function commitDraft(key: string): Promise<boolean> {
  const job = draftJobs.get(key);
  if (!job) return true;
  draftJobs.delete(key);
  if (job.timer) clearTimeout(job.timer);
  if (job.set.size === 0 && job.clear.size === 0) return true;
  try {
    await mutate(api.focus.mark, {
      studentId: job.studentId as Id<"students">,
      unitId: job.unitId as Id<"units">,
      level: job.level,
      set: [...job.set.values()],
      clear: [...job.clear],
      by: currentRole(),
    });
    return true;
  } catch (e) {
    toast(errorText(e), "error");
    return false;
  }
}

/** Forget a level's draft: it was saved, or its marks were thrown away. */
export async function dropDraft(studentId: string, unitId: string, level: number): Promise<void> {
  const key = draftKey(studentId, level);
  const job = draftJobs.get(key);
  if (job?.timer) clearTimeout(job.timer);
  draftJobs.delete(key);
  try {
    await mutate(api.focus.drop, { studentId: studentId as Id<"students">, unitId: unitId as Id<"units">, level, by: currentRole() });
  } catch (e) {
    toast(errorText(e), "error");
  }
}

// ---- Theory-book marks ----

type FighterJob = {
  studentId: string;
  unitId: string;
  base: Map<number, Mark | null>;
  next: Map<number, MarkState | null>;
  tokens: Map<number, number>;
  timer: Timer;
};
const fighterJobs = new Map<string, FighterJob>();

/**
 * One question of a theory book set to right / wrong / slip (or back to `saved`, how it was). Shown at once; saved
 * when the taps on that student stop. `saved` = the question's mark on the server before this burst.
 */
export function setFighterMark(studentId: string, unitId: string, q: number, s: MarkState | null, saved: Mark | null) {
  let job = fighterJobs.get(studentId);
  if (!job) {
    job = { studentId, unitId, base: new Map(), next: new Map(), tokens: new Map(), timer: null };
    fighterJobs.set(studentId, job);
  }
  if (!job.base.has(q)) job.base.set(q, saved);
  const base = job.base.get(q) ?? null;
  const n = (base?.n ?? 0) + (s === "wrong" && base?.s !== "wrong" ? 1 : 0);
  const mark: Mark | null = s === null ? null : n ? { s, n, t: now() } : { s, t: now() };
  job.next.set(q, s);
  job.tokens.set(q, putOverlay(studentId, q, mark));
  if (job.timer) clearTimeout(job.timer);
  job.timer = setTimeout(() => void commitFighter(studentId), SAVE_AFTER_MS);
}

async function commitFighter(studentId: string): Promise<boolean> {
  const job = fighterJobs.get(studentId);
  if (!job) return true;
  fighterJobs.delete(studentId);
  if (job.timer) clearTimeout(job.timer);
  const items = [...job.next].filter(([q, s]) => (job.base.get(q)?.s ?? null) !== s).map(([q, s]) => ({ q, s }));
  const drop = () => {
    for (const [q, token] of job.tokens) dropOverlay(studentId, q, token);
  };
  if (items.length === 0) {
    drop();
    return true;
  }
  try {
    await mutate(api.marks.setMany, { studentId: studentId as Id<"students">, unitId: job.unitId as Id<"units">, items, by: currentRole() });
    drop();
    return true;
  } catch (e) {
    drop();
    toast(errorText(e), "error");
    return false;
  }
}

/** Save every waiting mark now (Stop, another paper, Save, or the page hidden). True when all went through. */
export async function flushFocus(): Promise<boolean> {
  const results = await Promise.all([...[...draftJobs.keys()].map(commitDraft), ...[...fighterJobs.keys()].map(commitFighter)]);
  return results.every(Boolean);
}

/** Something not sent yet for this student (the phone shows it already). */
export function focusUnsaved(studentId: string): boolean {
  if (fighterJobs.has(studentId)) return true;
  for (const job of draftJobs.values()) if (job.studentId === studentId) return true;
  return false;
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flushFocus();
  });
  window.addEventListener("pagehide", () => void flushFocus());
}
