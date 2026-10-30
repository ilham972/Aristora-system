// One corrector per book on the Correction page (31 Oct 2026). Two correctors can each have one of a student's books
// open (he works on several at once); the same book is one corrector's at a time, so nobody marks a paper twice.
// The rules the server and the phones share.

/** Her phone says "still here" this often while a book is open (and the page is on screen). */
export const CLAIM_PING_MS = 20_000;
/** After this much silence (phone locked, page closed, no signal) anyone can take her book. */
export const CLAIM_LIVE_MS = 60_000;

export type Claim = {
  studentId: string;
  unitId: string;
  userId: string;
  name: string;
  at: number;
  seenAt: number;
  /** Another corrector asked for this book: the holder gives it or keeps it. */
  ask?: { userId: string; name: string; at: number };
  /** The holder kept it when this corrector asked. */
  kept?: { userId: string; at: number };
};

/** Still hers: her phone spoke in the last minute. */
export function claimLive(c: { seenAt: number }, now: number): boolean {
  return now - c.seenAt < CLAIM_LIVE_MS;
}

/** The live claim on this book by someone else (null = free, or mine, or her phone went quiet). */
export function heldBy(claims: readonly Claim[] | null | undefined, me: string | null | undefined, studentId: string, unitId: string | null | undefined, now: number): Claim | null {
  if (!claims || !unitId) return null;
  const c = claims.find((x) => x.studentId === studentId && x.unitId === unitId);
  return c && c.userId !== me && claimLive(c, now) ? c : null;
}
