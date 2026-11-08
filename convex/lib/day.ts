// The centre's calendar and clock: Sri Lanka, UTC+5:30 all year (no daylight saving).
// Server and phones both use these, so "today" and "3:42 PM" mean the same thing everywhere.

export const SL_OFFSET_MS = 330 * 60_000;
export const DAY_MS = 24 * 60 * 60_000;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The day in Sri Lanka: "2026-10-28". */
export function slDay(t: number): string {
  return new Date(t + SL_OFFSET_MS).toISOString().slice(0, 10);
}

/** The month in Sri Lanka: "2026-10". */
export function slMonth(t: number): string {
  return slDay(t).slice(0, 7);
}

/** "3:42 PM", or "3:42" without AM/PM (for tight places). Sri Lanka time. */
export function slClock(t: number, ampm = true): string {
  const d = new Date(t + SL_OFFSET_MS);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return ampm ? `${h12}:${m} ${h < 12 ? "AM" : "PM"}` : `${h12}:${m}`;
}

/** "28 Oct". Sri Lanka date. */
export function slDate(t: number): string {
  const d = new Date(t + SL_OFFSET_MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Days since 1 Jan 1970 in Sri Lanka: consecutive days differ by 1 (streaks). */
export function slDayNo(t: number): number {
  return Math.floor((t + SL_OFFSET_MS) / DAY_MS);
}

/** Midnight in Sri Lanka at the start of this time's day ("today" for a dashboard). */
export function slDayStart(t: number): number {
  return slDayNo(t) * DAY_MS - SL_OFFSET_MS;
}

/** When this week began in Sri Lanka: Monday 00:00 (the family app's weekly points start again then). */
export function slWeekStart(t: number): number {
  const day = slDayNo(t);
  const monday = day - ((new Date(day * DAY_MS).getUTCDay() + 6) % 7);
  return monday * DAY_MS - SL_OFFSET_MS;
}

/** When this month began in Sri Lanka: the 1st, 00:00 (the race's monthly most improved, 8 Nov 2026). */
export function slMonthStart(t: number): number {
  const d = new Date(t + SL_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - SL_OFFSET_MS;
}

/** The start of the month before the month that began at `ms`. */
export function slMonthBefore(ms: number): number {
  return slMonthStart(ms - DAY_MS);
}

/** Whole months from the month of `a` to the month of `b` (b later: more than 0). Sri Lanka months. */
export function monthsApart(a: number, b: number): number {
  const x = new Date(a + SL_OFFSET_MS);
  const y = new Date(b + SL_OFFSET_MS);
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + y.getUTCMonth() - x.getUTCMonth();
}

/**
 * Is today his birthday in Sri Lanka? `bday` = "MM-DD" (day and month only: the family app's Me, 4 Nov 2026). Born on
 * 29 Feb: 28 Feb in a year without it. Both apps use it (the family app's party, the teachers' 🎂).
 */
export function isBirthday(bday: string | null | undefined, now: number): boolean {
  if (!bday) return false;
  const today = slDay(now).slice(5);
  if (bday === today) return true;
  const year = Number(slDay(now).slice(0, 4));
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return bday === "02-29" && today === "02-28" && !leap;
}
