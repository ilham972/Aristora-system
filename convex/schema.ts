import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const markState = v.union(
  v.literal("taught"),
  v.literal("skip"),
  v.literal("right"),
  v.literal("wrong"),
  v.literal("slip"),
  v.literal("explained"),
);
export const markValue = v.object({ s: markState, n: v.optional(v.number()), t: v.number() });
export const room = v.union(v.literal("theory"), v.literal("evaluation"));
export const callStatus = v.union(
  v.literal("requested"),
  v.literal("sent"),
  v.literal("done"),
  v.literal("cancelled"),
  v.literal("declined"),
);

export default defineSchema({
  students: defineTable({
    name: v.string(),
    archived: v.boolean(),
    demo: v.optional(v.boolean()),
    present: v.boolean(),
    /** Question number ("1".."61") -> circle state. */
    marks: v.record(v.string(), markValue),
    /** Set while he is with a room teacher. */
    room: v.optional(room),
    /** Last mark, return from a room, or arrival. Drives "check on him". */
    lastActivityAt: v.optional(v.number()),
    /** Last time a room teacher finished with him. Breaks ties in the queues. */
    lastSeenAt: v.optional(v.number()),
    /** Idle tracking for the end-of-session report. */
    idleSince: v.optional(v.number()),
    idleReason: v.optional(v.string()),
    idleMs: v.number(),
  }).index("by_archived", ["archived"]),

  calls: defineTable({
    studentId: v.id("students"),
    room,
    /** What happens in the room. The evaluation room can also teach theory. */
    kind: room,
    status: callStatus,
    group: v.string(),
    /** Section to teach, for theory calls. */
    section: v.optional(v.string()),
    /** Theory is taking him straight from the evaluation room. */
    pull: v.optional(v.boolean()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    sessionId: v.optional(v.id("sessions")),
  })
    .index("by_status", ["status"])
    .index("by_student_status", ["studentId", "status"])
    .index("by_session", ["sessionId"]),

  sessions: defineTable({
    open: v.boolean(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    lastActivityAt: v.number(),
    report: v.optional(v.any()),
  })
    .index("by_open", ["open"])
    .index("by_startedAt", ["startedAt"]),

  /** Everything that happens, with the time. The history for later speed predictions. */
  events: defineTable({
    at: v.number(),
    sessionId: v.optional(v.id("sessions")),
    kind: v.string(),
    by: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
    name: v.optional(v.string()),
    q: v.optional(v.number()),
    value: v.optional(v.string()),
    ms: v.optional(v.number()),
  })
    .index("by_at", ["at"])
    .index("by_session", ["sessionId"]),
});
