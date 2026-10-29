// A room's score for today's class (the Theory and Evaluation pages): what the teacher did, and how long students sat
// with no work waiting for her. The counts come from the server (session.stats); the waits going on now are added
// here. Two numbers pull against each other, like a game: "ahead" (called before he ran out of work) rewards calling
// early, the waits punish calling the wrong ones.

import type { View } from "./derive";
import type { Board } from "./store";

export type Room = "theory" | "evaluation";

export type Score = {
  /** Students called; called while they still had work. */
  calls: number;
  ahead: number;
  /** Students taught or explained (sent back from the room); Theory's lessons; questions explained or taught. */
  done: number;
  lessons: number;
  qs: number;
  /** Minutes students sat with no work waiting for this room today (waits going on now included); the longest. */
  waitMs: number;
  maxWaitMs: number;
  /** Out of work right now, waiting for this room. */
  waitingNow: number;
};

export function scoreOf(board: Board, views: View[], room: Room, now: number): Score {
  const st = (board.session?.stats ?? {})[room] ?? {};
  let waitMs = st.waitMs ?? 0;
  let maxWaitMs = st.maxWaitMs ?? 0;
  let waitingNow = 0;
  for (const v of views) {
    if (v.where !== "hall" || v.s.idleSince === undefined) continue;
    if (!(v.s.idleReason ?? "").split("+").includes(room)) continue;
    const ms = Math.max(0, now - v.s.idleSince);
    waitMs += ms;
    maxWaitMs = Math.max(maxWaitMs, ms);
    waitingNow++;
  }
  return {
    calls: st.calls ?? 0,
    ahead: st.ahead ?? 0,
    done: st.done ?? 0,
    lessons: st.lessons ?? 0,
    qs: st.qs ?? 0,
    waitMs,
    maxWaitMs,
    waitingNow,
  };
}

/** One line of encouragement (or coaching), only when it says something true about today. */
export function cheerOf(s: Score, inClass: number): { tone: "green" | "amber"; text: string } | null {
  if (s.maxWaitMs >= 20 * 60_000) return { tone: "amber", text: "Someone waited 20+ min today. Call the no-work names first." };
  if (s.calls >= 4 && s.ahead / s.calls >= 0.75) return { tone: "green", text: "Ahead of the class: most came before they ran out of work." };
  if (inClass > 0 && s.waitingNow === 0 && s.done > 0) return { tone: "green", text: "Nobody is waiting for you now." };
  return null;
}
