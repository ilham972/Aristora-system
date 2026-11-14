// The day's quests, the chests and the flame shield (14 Nov 2026, his "build completely" on the idea pictures 08 and
// 09). A reason to come back tomorrow that is always about learning:
// - Three quests a day, the same three for every student that day (they can talk about them in class), each one
//   winnable in one sitting: a Level, right answers, answers right in a row, XP. Never Us: a comment never counts.
// - The three done open the day's chest: coins (the Shop's money), never XP (XP stays his marks). A few coins, not
//   always the same (3 to 7 by default): the surprise is the point.
// - A chest on a Stage's road after every 3rd Level (not after the last: the cup is there).
// - A flame shield, bought with coins: a day with no Level and his flame stays. One at a time; it costs the centre
//   nothing (no thing to hand over).
// The owner's numbers: Settings → Shop → Chests and the shield (0 = off). Only from the day they came: a Level finished
// before never opens a chest.

import type { Doc } from "../_generated/dataModel";
import { slDayNo, slDayStart, DAY_MS } from "./day";
import { classCircles, levelDays, levelsSince, xpSince } from "./family";
import type { MState } from "./master";

/** The day the chests came: a Level finished before this never opens one (14 Nov 2026, 6 PM in Sri Lanka). */
export const CHESTS_FROM = Date.UTC(2026, 10, 14, 12, 30);

export type QuestKind = "lv" | "two" | "run" | "right" | "xp";
/** Each quest's number: a Level, two Levels, answers right in a row, right answers, XP. */
export const QUEST_OF: Record<QuestKind, number> = { lv: 1, two: 2, run: 4, right: 8, xp: 15 };
export type Quest = { k: QuestKind; n: number; of: number };

/** The weekdays' second and third quests, in turn (the day's number picks one). */
const PAIRS: [QuestKind, QuestKind][] = [
  ["run", "xp"],
  ["right", "run"],
  ["xp", "right"],
  ["run", "right"],
  ["xp", "run"],
  ["right", "xp"],
];

/** The day's three quests (a Sri Lanka day number): a Level first; Saturday and Sunday, two Levels too. */
export function questKinds(day: number): QuestKind[] {
  const [a, b] = PAIRS[((day % PAIRS.length) + PAIRS.length) % PAIRS.length];
  const weekday = (new Date(day * DAY_MS).getUTCDay() + 6) % 7; // Monday 0 … Sunday 6
  return weekday >= 5 ? ["lv", "two", a] : ["lv", a, b];
}

/** One answer he gave (or a teacher marked) since a moment: when, its question, right or not. */
type Answer = { t: number; q: number; ok: boolean };

/**
 * His answers since a moment, in the order they were marked: a workbook's questions (the first try and a second try
 * when one came back; free marks are not his answers), a theory book's circles in class, and a tute's ladder sections
 * checked at home (its parts right, then the rest).
 */
export function answersSince(rows: Doc<"progress">[], since: number): Answer[] {
  const out: Answer[] = [];
  for (const r of rows) {
    for (const [k, x] of Object.entries(r.m?.q ?? {})) {
      const q = Number(k);
      if (!x.fr && x.t >= since) out.push({ t: x.t, q, ok: !x.lost && !x.dk });
      if (x.rt !== undefined && x.rt >= since) out.push({ t: x.rt, q, ok: (x.rh ?? 0) > 0 || (x.max !== undefined && (x.rg ?? 0) >= x.max) });
    }
    for (const c of classCircles(r)) if (c.t >= since) out.push({ t: c.t, q: 0, ok: c.s === "right" });
    for (const x of Object.values(r.lh ?? {})) {
      if (x.t < since) continue;
      for (let i = 0; i < x.max; i++) out.push({ t: x.t, q: i, ok: i < x.got });
    }
  }
  return out.sort((a, b) => a.t - b.t || a.q - b.q);
}

/** The most answers right one after another. */
export function bestRun(answers: Answer[]): number {
  let best = 0;
  let n = 0;
  for (const a of answers) {
    n = a.ok ? n + 1 : 0;
    best = Math.max(best, n);
  }
  return best;
}

/** Today's quests and how far he is (each at most its number). */
export function questsOf(rows: Doc<"progress">[], now: number): Quest[] {
  const since = slDayStart(now);
  let answers: Answer[] | null = null;
  const all = () => (answers ??= answersSince(rows, since));
  const count = (k: QuestKind): number => {
    if (k === "lv" || k === "two") return levelsSince(rows, since);
    if (k === "xp") return Math.max(0, xpSince(rows, since));
    if (k === "right") return all().filter((a) => a.ok).length;
    return bestRun(all());
  };
  return questKinds(slDayNo(now)).map((k) => ({ k, n: Math.min(count(k), QUEST_OF[k]), of: QUEST_OF[k] }));
}

export const questsDone = (qs: Quest[]) => qs.length > 0 && qs.every((q) => q.n >= q.of);

// ---- The owner's numbers (meta "chests") ----

export type ChestSet = { d: number; r: number; s: number };
/** The defaults: the day's chest 5 coins (3 to 7), a road chest 3, the shield 30 coins. */
export const CHEST_DEFAULT: ChestSet = { d: 5, r: 3, s: 30 };
/** The most coins a chest may give, and the most a shield may cost. */
export const CHEST_MAX = 50;
export const SHIELD_MAX = 1000;

export function chestSetOf(value: unknown): ChestSet {
  const v = (value ?? {}) as Partial<ChestSet>;
  const n = (x: unknown, d: number, max: number) => (typeof x === "number" && Number.isInteger(x) && x >= 0 && x <= max ? x : d);
  return { d: n(v.d, CHEST_DEFAULT.d, CHEST_MAX), r: n(v.r, CHEST_DEFAULT.r, CHEST_MAX), s: n(v.s, CHEST_DEFAULT.s, SHIELD_MAX) };
}

/** The day's chest: `base` coins give base−2 … base+2 (at least 1); a small chest (1 or 2) is always the same. */
export function chestCoins(base: number, random: number): number {
  if (base <= 2) return base;
  return Math.max(1, base - 2 + Math.min(4, Math.floor(random * 5)));
}

// ---- A Stage's road chests ----

export const ROAD_EVERY = 3;
export type RoadChest = { n: number; s: "ready" | "open" | "old" | "wait"; c?: number };

/** The Levels with a chest after them on a workbook's road of these Levels: every 3rd, never the last. */
export function roadChestLevels(levels: number[]): number[] {
  const last = Math.max(...levels);
  return levels.filter((n) => n > 0 && n % ROAD_EVERY === 0 && n < last);
}

/** Can Level n's chest open: its Level finished (handed in, or marked) since the chests came. */
export function roadChestState(m: MState | undefined, n: number): "ready" | "old" | "wait" {
  const lv = m?.lv[String(n)];
  const t = lv && !lv.pre ? (lv.done ?? lv.fixed) : undefined;
  if (t === undefined) return lv?.pre ? "old" : "wait";
  return t < CHESTS_FROM ? "old" : "ready";
}

/** The Level he is on in a workbook: the one after the last he finished (or had done before); 1 when none. */
export function levelOn(m: MState | undefined): number {
  let last = 0;
  for (const [k, lv] of Object.entries(m?.lv ?? {})) {
    const n = Number(k);
    if (n > last && (lv.done !== undefined || lv.fixed !== undefined || lv.pre !== undefined)) last = n;
  }
  return last + 1;
}

// ---- The flame shield ----

/** At most this many kept days are remembered (a year and more of shields). */
export const KEPT_MAX = 400;

/**
 * The days that keep his flame besides his Levels: the days a shield kept (`sd` on his wallet), and yesterday when he
 * holds a shield, yesterday is the only day missing and the night's job (coins.shields) hasn't written it down yet.
 */
export function shieldDays(rows: Doc<"progress">[], w: Pick<Doc<"wallets">, "sh" | "sd"> | null, now: number): number[] {
  const kept = [...(w?.sd ?? [])];
  if (!w || (w.sh ?? 0) < 1) return kept;
  const days = levelDays(rows);
  for (const d of kept) days.add(d);
  const y = slDayNo(now) - 1;
  if (!days.has(y) && days.has(y - 1)) kept.push(y);
  return kept;
}

/** Does yesterday need his shield: no Level yesterday, and his flame was alive the day before (Levels or kept days). */
export function shieldNeeded(rows: Doc<"progress">[], kept: number[], today: number): boolean {
  const days = levelDays(rows);
  for (const d of kept) days.add(d);
  return !days.has(today - 1) && days.has(today - 2);
}
