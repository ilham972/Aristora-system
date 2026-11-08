// Who sends a called student (8 Nov 2026, his voice note: "the call ring or alert goes to that department teacher only
// ... previously all the calls went to the correction teacher, now that is changing"). A consultation of the Fighter or
// Master department rings on that department's lead teacher's phone: she is in the classrooms, she tells him to go to
// the consultation room and taps Sent. Every other call is Correction's, as before. Pure (tests/desk.test.ts).

import type { Dept } from "../convex/lib/dept";

/** Nobody sent him this long after his department's lead was called: Correction hears it too (a lead away, a phone off). */
export const LEAD_LATE_MS = 3 * 60_000;

type Who = { role: "owner" | "teacher"; dept?: Dept; lead?: boolean } | null;
type CallLike = { consult?: boolean; dept?: "fighter" | "master"; toLead?: boolean; createdAt: number };

/** This call is for her: she leads its department (a consultation called while it had a lead). */
export const leadSends = (me: Who, c: CallLike) => !!me && me.role === "teacher" && !!me.lead && !!c.consult && !!c.toLead && c.dept === me.dept;

/** Correction's phone sends it: every call, except a department lead's consultation in its first 3 minutes. */
export const correctionSends = (c: CallLike, now: number) => !c.toLead || now - c.createdAt >= LEAD_LATE_MS;

/**
 * Does this phone send (and hear) this call? A Fighter or Master person: only her own department's consultations, and
 * only as its lead (her Correction tab is for homework and papers, not Correction's calls). Everyone else who may send
 * (Correction, the manager, the owner): Correction's calls.
 */
export function phoneSends(me: Who, c: CallLike, now: number): boolean {
  if (leadSends(me, c)) return true;
  if (me && me.role === "teacher" && (me.dept === "fighter" || me.dept === "master")) return false;
  return correctionSends(c, now);
}
