// The founder's numbers on the Students page: how many students, growth this month, who is coming,
// and who has quietly stopped coming. Demo students never count.

import { DAY_MS, slMonth } from "../convex/lib/day";

/** Attendance was first recorded on this day (when the Attendance page went live): nobody is "away" before it. */
export const ATTENDANCE_SINCE = new Date("2026-10-28T00:00:00+05:30").getTime();
/** Not seen for this many days: a student at risk of dropping out. */
export const AWAY_DAYS = 14;

export type StatStudent = {
  _id: string;
  _creationTime: number;
  name: string;
  grade?: number;
  demo?: boolean;
  lastInAt?: number;
};
export type StatRemoved = { name: string; demo: boolean; created: number; archivedAt: number | null };

/** Whole days since he last came; never signed in: since he was added, or since attendance began. */
export function daysAway(s: StatStudent, now: number, since = ATTENDANCE_SINCE): number {
  const from = s.lastInAt ?? Math.max(s._creationTime, since);
  return Math.max(0, Math.floor((now - from) / DAY_MS));
}

export function studentStats(active: StatStudent[], removed: StatRemoved[], now: number, since = ATTENDANCE_SINCE) {
  const real = active.filter((s) => !s.demo);
  const gone = removed.filter((r) => !r.demo);
  const month = slMonth(now);
  // Added this month, counting the ones already removed again (they joined, then left).
  const added = real.filter((s) => slMonth(s._creationTime) === month).length + gone.filter((r) => slMonth(r.created) === month).length;
  const left = gone.filter((r) => r.archivedAt !== null && slMonth(r.archivedAt) === month).length;
  const week = real.filter((s) => s.lastInAt !== undefined && now - s.lastInAt < 7 * DAY_MS).length;
  const away = real
    .map((s) => ({ s, days: daysAway(s, now, since) }))
    .filter((x) => x.days >= AWAY_DAYS)
    .sort((a, b) => b.days - a.days || a.s.name.localeCompare(b.s.name));
  return {
    total: real.length,
    demo: active.length - real.length,
    added,
    left,
    week,
    away,
    /** Attendance is too new for a full week or two of numbers yet. */
    newWeek: now - since < 7 * DAY_MS,
    newAway: now - since < AWAY_DAYS * DAY_MS,
  };
}
