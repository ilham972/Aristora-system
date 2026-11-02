// One student's day (the Manager page, 3 Nov 2026, his ask: "how the time spent with the teachers, in the hall, or
// doing the work"): from his sign-in to now, in pieces: working, no work (waiting), walking to a room, with a teacher
// (theory, explaining, a check-in). Pure, so it is tested (tests/timeline.test.ts); the query is convex/manager.ts.

export type SegKind = "work" | "idle" | "walk" | "theory" | "evaluation" | "visit";
export type Seg = { from: number; to: number; kind: SegKind; teacher?: string };

export type DayCall = {
  status: string;
  kind: "theory" | "evaluation";
  visit?: boolean;
  teacher?: string;
  sentAt?: number;
  arrivedAt?: number;
  walk?: boolean;
  endedAt?: number;
};
export type DayIn = {
  now: number;
  /** His visits today (sign-in to sign-out; still here = no outAt). */
  visits: { inAt: number; outAt?: number }[];
  /** Out of work, waiting for a teacher or Correction. */
  idles: { from: number; to: number }[];
  calls: DayCall[];
};
export type Day = {
  segs: Seg[];
  /** His first sign-in today, null when he didn't come. */
  from: number | null;
  to: number;
  /** With a teacher: how long, and how many times (each call he was with her). */
  teacherMs: number;
  contacts: number;
  idleMs: number;
  walkMs: number;
  workMs: number;
};

type Over = { from: number; to: number; kind: SegKind; teacher?: string; rank: number };

/** Higher wins where pieces overlap: in a room > walking > no work > working. */
const RANK: Record<SegKind, number> = { visit: 3, theory: 3, evaluation: 3, walk: 2, idle: 1, work: 0 };

export function dayOf(d: DayIn): Day {
  const visits = d.visits
    .map((v) => ({ from: v.inAt, to: Math.min(v.outAt ?? d.now, d.now) }))
    .filter((v) => v.to > v.from)
    .sort((a, b) => a.from - b.from);
  const over: Over[] = [];
  for (const i of d.idles) if (i.to > i.from) over.push({ from: i.from, to: Math.min(i.to, d.now), kind: "idle", rank: RANK.idle });
  let contacts = 0;
  for (const c of d.calls) {
    if (c.sentAt === undefined) continue; // called, never sent: he stayed in the hall
    const end = Math.min(c.endedAt ?? d.now, d.now);
    if (c.walk) {
      const walkEnd = Math.min(c.arrivedAt ?? end, end);
      if (walkEnd > c.sentAt) over.push({ from: c.sentAt, to: walkEnd, kind: "walk", rank: RANK.walk });
    }
    // With her: from Arrived (calls before 30 Oct 2026 have no walk: from Sent), until Done. Not reached = no time.
    const start = c.walk ? c.arrivedAt : c.sentAt;
    if (start === undefined || c.status === "cancelled" || end <= start) continue;
    const kind: SegKind = c.visit ? "visit" : c.kind === "theory" ? "theory" : "evaluation";
    over.push({ from: start, to: end, kind, teacher: c.teacher, rank: RANK[kind] });
    contacts++;
  }
  // Cut the day at every edge, then each piece is what covers it (the highest rank), inside his visits only.
  const cuts = new Set<number>();
  for (const v of visits) cuts.add(v.from).add(v.to);
  for (const o of over) cuts.add(o.from).add(o.to);
  const points = [...cuts].sort((a, b) => a - b);
  const segs: Seg[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i];
    const b = points[i + 1];
    const mid = (a + b) / 2;
    if (!visits.some((v) => v.from <= mid && mid < v.to)) continue;
    let top: Over | null = null;
    for (const o of over) if (o.from <= mid && mid < o.to && (!top || o.rank > top.rank)) top = o;
    const kind: SegKind = top?.kind ?? "work";
    const teacher = top?.teacher;
    const last = segs[segs.length - 1];
    if (last && last.to === a && last.kind === kind && last.teacher === teacher) last.to = b;
    else segs.push(teacher ? { from: a, to: b, kind, teacher } : { from: a, to: b, kind });
  }
  const sum = (k: (s: Seg) => boolean) => segs.filter(k).reduce((n, s) => n + (s.to - s.from), 0);
  return {
    segs,
    from: visits[0]?.from ?? null,
    to: d.now,
    teacherMs: sum((s) => RANK[s.kind] === 3),
    contacts,
    idleMs: sum((s) => s.kind === "idle"),
    walkMs: sum((s) => s.kind === "walk"),
    workMs: sum((s) => s.kind === "work"),
  };
}
