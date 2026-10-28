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
