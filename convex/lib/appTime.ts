// Online, last seen and time in the app (12 Nov 2026, his voice note: "each student want to know which student is online
// right now ... a green dot ... closed a few minutes ago or few hours ago ... the graph, bar graph, how many hours studied
// each day ... press any bar ... the time they come and go"). Told him straight: an open app is not studying (kids leave
// it open to look online), app hours reward the slow, and a child's night-time "last seen" shown to every classmate is
// the screenshot that makes a parent delete the app. His answers after the warning: online = the app open, classmates
// see everything, the bars = time in the app, and the bar's sheet also shows the minutes inside Levels. The way back if
// a parent complains: Settings → Race → "Classmates see online, last seen and app time" (off: his own phone still shows
// him his own time).
//
// 12 Nov 2026, 1:40 AM, his change of mind ("I agree your recommendation ... if the student online show online, if
// studies show studying ... sorry for previous overrule"): two states, **Online** (the app open) and **Studying** (inside
// a Level, with its Stage); classmates see last seen **by day only** and the **study bars** (minutes inside Levels); the
// come and go times stay with him (his phone: him and his parents). The owner's switch stays.
//
// The phone beats once a minute while the app is on the screen (and once more when it leaves it: `bye`). Each beat
// adds the time since the one before (at most BEAT_MAX_MS: a phone asleep in a pocket adds nothing) to the open stay;
// a beat after GAP_MS, after a `bye`, or on a new Sri Lanka day starts a new stay. Pure, so the arithmetic is tested.

import { DAY_MS, SL_OFFSET_MS, slDayNo } from "./day";

/** The phone beats this often while the app is on the screen. */
export const BEAT_MS = 60_000;
/** One beat adds at most this (a beat that comes late: the phone was asleep or offline). */
export const BEAT_MAX_MS = 90_000;
/** Online = a beat this recent and no `bye` since. */
export const ONLINE_MS = 150_000;
/** A beat this long after the last one starts a new stay. */
export const GAP_MS = 3 * 60_000;
/** Stays are kept this long (the month's bars reach back 30 days). */
export const KEEP_DAYS = 62;
/** The days the bars show (the month: today and the 29 before). */
export const BAR_DAYS = 30;

/** A stay in the app: `from` the first beat, `to` the last; `ms` in the app, `lv` of it inside a Level. */
export type Stay = {
  day: number;
  from: number;
  to: number;
  ms: number;
  lv: number;
  bye?: boolean;
  /** Inside a Level at the last beat (studying now), and that Level's Stage number. */
  inLv?: boolean;
  st?: number;
};

/**
 * One beat on his last stay (null: none yet). `add`: a new stay to insert; otherwise `patch` for the last one.
 * `lv`: the phone was inside a Level since the last beat.
 */
export function beatOn(
  last: Stay | null,
  now: number,
  lv: boolean,
  bye: boolean,
  at: { inLv?: boolean; st?: number } = {},
): { add: Stay } | { patch: Partial<Stay> } {
  const day = slDayNo(now);
  // Where he is now: inside a Level (and its Stage) or not; a bye leaves it.
  const here = { inLv: !bye && !!at.inLv, st: !bye && at.inLv && at.st ? at.st : undefined };
  if (!last || last.bye || now - last.to > GAP_MS || last.day !== day || now < last.to) {
    return { add: { day, from: now, to: now, ms: 0, lv: 0, ...(bye ? { bye: true } : {}), ...(here.inLv ? { inLv: true } : {}), ...(here.st ? { st: here.st } : {}) } };
  }
  const step = Math.min(now - last.to, BEAT_MAX_MS);
  return { patch: { to: now, ms: last.ms + step, lv: last.lv + (lv ? step : 0), ...(bye ? { bye: true } : {}), inLv: here.inLv, st: here.st } };
}

/** Studying now: online and inside a Level at the last beat. */
export function isStudying(last: Pick<Stay, "to" | "bye" | "inLv"> | null, now: number): boolean {
  return isOnline(last, now) && !!last?.inLv;
}

/** A classmate's last seen, by day only (12 Nov 2026: no minutes, no night-time stamps): "Today", "Yesterday", "Mon", "2 Nov". */
export function seenDayWords(day: number | null, now: number): string | null {
  if (day === null) return null;
  const days = slDayNo(now) - day;
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  const d = new Date(day * DAY_MS);
  if (days < 7) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}

/** Online now: his last stay beat within ONLINE_MS and he didn't leave. */
export function isOnline(last: Pick<Stay, "to" | "bye"> | null, now: number): boolean {
  return !!last && !last.bye && now - last.to <= ONLINE_MS && now >= last.to - 60_000;
}

/** One day's bar: time in the app and inside Levels (ms). */
export type DayBar = { d: number; ms: number; lv: number };

/** The bars of the last BAR_DAYS days, oldest first (a day with no stay = 0). */
export function dayBars(stays: Stay[], now: number): DayBar[] {
  const today = slDayNo(now);
  const out: DayBar[] = [];
  for (let d = today - BAR_DAYS + 1; d <= today; d++) out.push({ d, ms: 0, lv: 0 });
  for (const s of stays) {
    const b = out[s.day - (today - BAR_DAYS + 1)];
    if (!b) continue;
    b.ms += s.ms;
    b.lv += s.lv;
  }
  return out;
}

/** Minutes in each hour of one day (24 numbers), each stay's time (`ms`, or `lv`: inside Levels) spread over its hours. */
export function hourBars(stays: Pick<Stay, "from" | "to" | "ms" | "lv">[], day: number, of: "ms" | "lv" = "ms"): number[] {
  const out = new Array<number>(24).fill(0);
  const start = day * DAY_MS - SL_OFFSET_MS;
  for (const s of stays) {
    const span = Math.max(1, s.to - s.from);
    if (s.to <= s.from) {
      const h = Math.floor((s.from - start) / 3_600_000);
      if (h >= 0 && h < 24) out[h] += s[of] / 60_000;
      continue;
    }
    for (let h = 0; h < 24; h++) {
      const a = Math.max(s.from, start + h * 3_600_000);
      const b = Math.min(s.to, start + (h + 1) * 3_600_000);
      if (b > a) out[h] += ((b - a) / span) * (s[of] / 60_000);
    }
  }
  return out.map((m) => Math.round(m));
}

/** "Online", "5 min ago", "2 h ago", "Yesterday", "Mon", "3 Nov": when he was last in the app (null: never). */
export function seenWords(at: number | null, online: boolean, now: number): string | null {
  if (online) return "Online";
  if (at === null) return null;
  const min = Math.max(0, Math.floor((now - at) / 60_000));
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const days = slDayNo(now) - slDayNo(at);
  if (days === 0) return `${Math.floor(min / 60)} h ago`;
  if (days === 1) return "Yesterday";
  const d = new Date(at + SL_OFFSET_MS);
  if (days < 7) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}

/** "1 h 25 m", "40 m", "0 m": a time on a bar or a sheet. */
export function spanWords(ms: number): string {
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} m`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} m` : `${m / 60} h`;
}
