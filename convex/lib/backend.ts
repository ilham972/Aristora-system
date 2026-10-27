// Backend-only helpers: sessions, the history log, idle tracking.

import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { computeStatus } from "./status";

/** A session with no activity for this long is closed automatically. */
export const STALE_SESSION_MS = 4 * 60 * 60_000;

export function fail(message: string): never {
  throw new ConvexError(message);
}

export function cleanBy(by: string | undefined): string | undefined {
  if (!by) return undefined;
  return by.replace(/[^a-z]/gi, "").slice(0, 16) || undefined;
}

export function cleanName(raw: string): string {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  if (!name) fail("Type a name first.");
  if (name.length > 40) fail("Keep the name under 40 letters.");
  return name;
}

export async function getStudent(ctx: QueryCtx, id: Id<"students">): Promise<Doc<"students">> {
  const s = await ctx.db.get(id);
  if (!s) fail("That student no longer exists. Refresh the page.");
  return s;
}

export async function openSession(ctx: QueryCtx): Promise<Doc<"sessions"> | null> {
  return await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first();
}

type LogInput = {
  kind: string;
  by?: string;
  studentId?: Id<"students">;
  name?: string;
  q?: number;
  value?: string;
  ms?: number;
};

export async function log(
  ctx: MutationCtx,
  session: Doc<"sessions"> | null,
  now: number,
  e: LogInput,
): Promise<void> {
  await ctx.db.insert("events", { at: now, sessionId: session?._id, ...e });
}

/** The open session, closing it first if it was left open from an earlier day. */
export async function currentSession(ctx: MutationCtx, now: number): Promise<Doc<"sessions"> | null> {
  const s = await openSession(ctx);
  if (s && now - s.lastActivityAt > STALE_SESSION_MS) {
    await closeSession(ctx, s, s.lastActivityAt, "auto");
    return null;
  }
  return s;
}

/** The open session, starting one if needed (first student tapped in). */
export async function ensureSession(ctx: MutationCtx, now: number, by?: string): Promise<Doc<"sessions">> {
  const s = await currentSession(ctx, now);
  if (s) return s;
  const id = await ctx.db.insert("sessions", { open: true, startedAt: now, lastActivityAt: now });
  const created = (await ctx.db.get(id))!;
  await log(ctx, created, now, { kind: "session-start", by });
  return created;
}

export async function touch(ctx: MutationCtx, session: Doc<"sessions"> | null, now: number) {
  if (session) await ctx.db.patch(session._id, { lastActivityAt: now });
}

export async function activeCalls(ctx: QueryCtx, studentId: Id<"students">) {
  const requested = await ctx.db
    .query("calls")
    .withIndex("by_student_status", (q) => q.eq("studentId", studentId).eq("status", "requested"))
    .collect();
  const sent = await ctx.db
    .query("calls")
    .withIndex("by_student_status", (q) => q.eq("studentId", studentId).eq("status", "sent"))
    .collect();
  return [...requested, ...sent];
}

async function closeIdle(
  ctx: MutationCtx,
  s: Doc<"students">,
  until: number,
  session: Doc<"sessions"> | null,
) {
  if (s.idleSince === undefined) return;
  const ms = Math.max(0, until - s.idleSince);
  await ctx.db.patch(s._id, { idleSince: undefined, idleReason: undefined, idleMs: s.idleMs + ms });
  if (ms > 0) {
    await log(ctx, session, until, { kind: "idle", studentId: s._id, name: s.name, ms, value: s.idleReason });
  }
}

/**
 * Re-check one student after anything changed: is he sitting in the hall with
 * nothing to do? Starts or stops his idle clock for the session report.
 */
export async function refresh(
  ctx: MutationCtx,
  id: Id<"students">,
  now: number,
  session: Doc<"sessions"> | null,
) {
  const s = await ctx.db.get(id);
  if (!s) return;
  const status = computeStatus(s.marks);
  const idleNow = session !== null && s.present && !s.archived && !s.room && status.dry;
  const reason = status.needs.join("+") || "work";
  if (idleNow) {
    if (s.idleSince === undefined) {
      await ctx.db.patch(id, { idleSince: now, idleReason: reason });
    } else if (s.idleReason !== reason) {
      await closeIdle(ctx, s, now, session);
      await ctx.db.patch(id, { idleSince: now, idleReason: reason });
    }
  } else if (s.idleSince !== undefined) {
    await closeIdle(ctx, s, now, session);
  }
}

const round1 = (min: number) => Math.round(min * 10) / 10;

/** Close a session: stop idle clocks, send everyone home, write the report. */
export async function closeSession(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  endAt: number,
  by?: string,
) {
  const students = await ctx.db.query("students").withIndex("by_archived", (q) => q.eq("archived", false)).collect();
  for (const s of students) await closeIdle(ctx, s, endAt, session);

  for (const status of ["requested", "sent"] as const) {
    const open = await ctx.db.query("calls").withIndex("by_status", (q) => q.eq("status", status)).collect();
    for (const c of open) await ctx.db.patch(c._id, { status: status === "sent" ? "done" : "cancelled", endedAt: endAt });
  }
  for (const s of students) {
    await ctx.db.patch(s._id, { present: false, room: undefined, idleSince: undefined, idleMs: 0 });
  }

  const report = await buildReport(ctx, session, endAt);
  await ctx.db.patch(session._id, { open: false, endedAt: endAt, lastActivityAt: endAt, report });
  await log(ctx, session, endAt, { kind: "session-end", by, ms: endAt - session.startedAt });
}

type Row = {
  name: string;
  idleMin: number;
  idleTheoryMin: number;
  idleEvalMin: number;
  right: number;
  wrong: number;
  slip: number;
};

async function buildReport(ctx: MutationCtx, session: Doc<"sessions">, endAt: number) {
  const events = await ctx.db.query("events").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
  const calls = await ctx.db.query("calls").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();

  const rows = new Map<string, Row>();
  const row = (id: string, name: string) => {
    let r = rows.get(id);
    if (!r) {
      r = { name, idleMin: 0, idleTheoryMin: 0, idleEvalMin: 0, right: 0, wrong: 0, slip: 0 };
      rows.set(id, r);
    }
    return r;
  };
  let explained = 0;
  for (const e of events) {
    if (!e.studentId) continue;
    const r = row(e.studentId, e.name ?? "?");
    if (e.kind === "idle" && e.ms) {
      const min = e.ms / 60_000;
      r.idleMin += min;
      if ((e.value ?? "").includes("theory")) r.idleTheoryMin += min;
      else r.idleEvalMin += min;
    }
    if (e.kind === "mark" && (e.value === "right" || e.value === "wrong" || e.value === "slip")) r[e.value]++;
    if (e.kind === "explained") explained += Number(e.value ?? 0);
  }

  const sittings = (kind: "theory" | "evaluation") => {
    const groups = new Map<string, { start: number; end: number; students: number }>();
    for (const c of calls) {
      if (c.kind !== kind || c.status !== "done" || !c.sentAt || !c.endedAt) continue;
      const g = groups.get(c.group) ?? { start: c.sentAt, end: c.endedAt, students: 0 };
      g.start = Math.min(g.start, c.sentAt);
      g.end = Math.max(g.end, c.endedAt);
      g.students++;
      groups.set(c.group, g);
    }
    const mins = [...groups.values()].map((g) => (g.end - g.start) / 60_000);
    const students = [...groups.values()].reduce((a, g) => a + g.students, 0);
    return {
      sittings: mins.length,
      students,
      avgMin: mins.length ? round1(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
      maxMin: mins.length ? round1(Math.max(...mins)) : null,
    };
  };

  const list = [...rows.values()]
    .map((r) => ({
      ...r,
      idleMin: round1(r.idleMin),
      idleTheoryMin: round1(r.idleTheoryMin),
      idleEvalMin: round1(r.idleEvalMin),
    }))
    .sort((a, b) => b.idleMin - a.idleMin || a.name.localeCompare(b.name));
  const sum = (f: (r: Row) => number) => list.reduce((a, r) => a + f(r), 0);
  const marked = sum((r) => r.right + r.wrong + r.slip);
  return {
    startedAt: session.startedAt,
    endedAt: endAt,
    minutes: Math.round((endAt - session.startedAt) / 60_000),
    idleMin: round1(sum((r) => r.idleMin)),
    idleTheoryMin: round1(sum((r) => r.idleTheoryMin)),
    idleEvalMin: round1(sum((r) => r.idleEvalMin)),
    marks: { right: sum((r) => r.right), wrong: sum((r) => r.wrong), slip: sum((r) => r.slip) },
    wrongRate: marked ? Math.round((sum((r) => r.wrong) / marked) * 100) : null,
    theory: sittings("theory"),
    evaluation: { ...sittings("evaluation"), explained },
    students: list,
  };
}
