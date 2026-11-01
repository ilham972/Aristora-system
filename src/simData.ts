// The simulation's words on the owner's phone (the CEO page's Sim tab, Settings → Students): what happened, each
// teacher's line, whether a room kept up. The numbers come from convex/lib/sim.ts (simBoard), read by convex/sim.ts.

import type { Digest } from "../convex/lib/ceo";
import { PLANS, roomLoad, ROBOT, type SimLevel, type SimSample, type TeacherLine } from "../convex/lib/sim";
import type { FeedEvent } from "../convex/sim";
import { minWords, ROOM_NAME, type Tone } from "./ceoData";

export const LEVEL_NAME: Record<SimLevel, string> = { easy: PLANS.easy.name, medium: PLANS.medium.name, hard: PLANS.hard.name };

const ROOM_WORD: Record<string, string> = { theory: "Theory", evaluation: "Evaluation", correction: "Correction" };
const room = (v: string | undefined) => ROOM_WORD[v ?? ""] ?? "a room";
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
/** Who did it: a teacher by name; the app (playing Correction) as "The app". */
const whoOf = (e: FeedEvent) => (!e.who || e.who === ROBOT ? "The app" : e.who);
const mins = (ms: number | undefined) => minWords((ms ?? 0) / 60_000);
const unitWord = (key: string | undefined) => {
  const m = /U(\d+)$/.exec(key ?? "");
  return m ? `unit ${Number(m[1])}` : "his next unit";
};

/** One line of what happened, in plain words, with a colour when it matters (red: someone sat with no work). */
export function feedText(e: FeedEvent): { text: string; tone: Tone | "plain" } {
  const n = e.name ?? "Someone";
  const v = e.value ?? "";
  switch (e.kind) {
    case "sim-start": {
      const [level, count, minutes] = v.split(" ");
      return { text: `Simulation started: ${LEVEL_NAME[level as SimLevel] ?? level}, ${count} students, ${minutes} min`, tone: "plain" };
    }
    case "sim-add":
      return { text: `${plural(Number(v) || 0, "more student")} came in`, tone: "plain" };
    case "sim-level":
      return { text: `Now ${LEVEL_NAME[v as SimLevel] ?? v}`, tone: "plain" };
    case "sim-end":
      return { text: v === "time" ? "Time is up: the simulation ended" : "The simulation was ended", tone: "plain" };
    case "in":
      return { text: `${n} came in`, tone: "plain" };
    case "out":
      return { text: v === "finished" ? `${n} finished his books and went home` : `${n} went home`, tone: "plain" };
    case "level-done":
      return { text: `${n} handed in Level ${v}`, tone: "plain" };
    case "level-marks": {
      const [lvl, marks] = v.split(" ");
      return { text: `${whoOf(e)} corrected ${n}'s Level ${lvl}: ${marks ?? ""}`.trim(), tone: "plain" };
    }
    case "mark":
      return v === "wrong"
        ? { text: `${n} got Q${e.q ?? "?"} wrong`, tone: "amber" }
        : v === "slip"
          ? { text: `${n} slipped on Q${e.q ?? "?"}`, tone: "plain" }
          : { text: `${whoOf(e)} marked ${n}'s Q${e.q ?? "?"} ${v}`, tone: "plain" };
    case "call":
      return { text: `${whoOf(e)} called ${n} to ${room(v.split("/")[0])}${v.includes("/pull") ? " (from Evaluation)" : ""}`, tone: "plain" };
    case "sent":
      return { text: `${n} went to ${room(v)}`, tone: "plain" };
    case "arrived":
      return e.who === ROBOT
        ? { text: `${n} was in ${room(v)} 3 min and nobody tapped Arrived`, tone: "amber" }
        : { text: `${whoOf(e)}: ${n} arrived (${Math.round((e.ms ?? 0) / 1000)} s walk)`, tone: "plain" };
    case "explained":
      return { text: `${whoOf(e)} explained ${plural(Number(v) || 0, "question")} to ${n}`, tone: "green" };
    case "to-theory":
      return { text: `${whoOf(e)} sent ${v} to Theory for ${n}`, tone: "plain" };
    case "taught":
      return { text: `${whoOf(e)} taught ${n} ${plural(Number(v) || 0, "question")}`, tone: "green" };
    case "done-evaluation":
      return { text: `${whoOf(e)} sent ${n} back to work (${mins(e.ms)} with her)`, tone: "green" };
    case "done-theory":
      return { text: `${whoOf(e)} finished ${n}'s lesson (${mins(e.ms)})`, tone: "green" };
    case "keep":
      return { text: `${whoOf(e)} kept ${n} for ${unitWord(e.unit)}`, tone: "plain" };
    case "idle": {
      const why = v
        .split("+")
        .filter((x) => ROOM_WORD[x])
        .map((x) => ROOM_WORD[x]);
      return { text: `${n} sat ${mins(e.ms)} with no work${why.length ? `, waiting for ${why.join(" or ")}` : ""}`, tone: (e.ms ?? 0) >= 5 * 60_000 ? "red" : "amber" };
    }
    case "not-reached":
      return { text: `${n} never reached ${room(v)}`, tone: "amber" };
    case "cancel":
      return { text: `${whoOf(e)} cancelled ${n}'s call`, tone: "plain" };
    case "move":
      return { text: `${n} finished his unit: on to ${unitWord(e.unit)}`, tone: "green" };
    case "bumped":
      return { text: `Theory took ${n} first`, tone: "plain" };
    default:
      return { text: `${n}: ${e.kind}`, tone: "plain" };
  }
}

/** A teacher's lines: what she did, how she called, her Arrived taps. */
export function teacherWords(t: TeacherLine): { main: string; calls: string; arrived: string } {
  const main =
    t.room === "evaluation"
      ? [plural(t.qs, "question") + " explained", plural(t.students, "student"), t.toTheory ? `${t.toTheory} to Theory` : null].filter(Boolean).join(" · ")
      : [plural(t.lessons, "lesson"), `${t.qs} taught`, plural(t.students, "student")].join(" · ");
  const calls = t.calls
    ? `Called ${t.calls} · ${t.ahead} before they ran out of work${t.perVisitMin !== null ? ` · ${minWords(t.perVisitMin)} a student` : ""}`
    : "Called nobody yet";
  const arrived =
    t.arrived + t.missed > 0
      ? `Arrived tapped ${t.arrived}${t.missed ? ` · forgot ${t.missed}` : ""}${t.walkSec !== null ? ` · ${t.walkSec} s from Sent` : ""}`
      : "";
  return { main, calls, arrived };
}

/** How busy she was: green under 65% of the time, amber to 85%, red above (the queue grows). */
export function busyToneOf(share: number | null): Tone {
  if (share === null) return "grey";
  return share > 0.85 ? "red" : share > 0.65 ? "amber" : "green";
}

/** Did the room keep up with this load? The CEO page's thresholds: idle minutes per student-hour waiting for it. */
export function roomVerdict(d: Digest, r: "evaluation" | "theory", people: number): { tone: Tone; head: string; why: string } {
  const { tone, rate } = roomLoad(d, r);
  const name = ROOM_NAME[r];
  if (rate === null) return { tone: "grey", head: "Too early to say", why: `${name}: a few more minutes of students first.` };
  const why = `Students sat ${minWords(d.idle[r])} with no work waiting for ${name} (${rate} min an hour each)${people ? ` · ${plural(people, "person")}` : ""}.`;
  if (tone === "red") return { tone, head: `${name} needs another person at this load`, why };
  if (tone === "amber") return { tone, head: `${name} is near the limit`, why };
  return { tone, head: `${name} kept up`, why };
}

/** The class's headline (idle minutes per student-hour): under 3 good, 3–6 watch, 6+ bad. */
export function rateTone(rate: number | null): Tone {
  if (rate === null) return "grey";
  return rate >= 6 ? "red" : rate >= 3 ? "amber" : "green";
}

/** Up, down or the same over the last 5 readings (minutes): is the room's queue growing? */
export function trendOf(samples: SimSample[], key: "eq" | "es" | "ts" | "idle" | "cq"): "up" | "down" | "flat" {
  if (samples.length < 3) return "flat";
  const now = samples[samples.length - 1][key];
  const before = samples[Math.max(0, samples.length - 6)][key];
  return now > before ? "up" : now < before ? "down" : "flat";
}

/** "12 of 30 min", "Ended after 30 min". */
export function clockWords(m: { done: number; total: number; left: number }, ended: boolean): string {
  return ended ? `Ended after ${m.done} min` : `${m.done} of ${m.total} min · ${m.left} left`;
}
