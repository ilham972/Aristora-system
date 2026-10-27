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
/** The four stages of a term: Fighter (theory books), Master (past-paper workbooks), Legend (whole papers),
 * Exam Sprint (the compacted book just before an exam). */
export const stage = v.union(v.literal("fighter"), v.literal("master"), v.literal("legend"), v.literal("sprint"));
export const bookStage = v.union(v.literal("fighter"), v.literal("master"));
export const partId = v.union(
  v.literal("I"),
  v.literal("II"),
  v.literal("IA"),
  v.literal("IB"),
  v.literal("IIA"),
  v.literal("IIB"),
);

export const fighterData = v.object({
  kind: v.literal("fighter"),
  sections: v.array(
    v.object({
      id: v.string(),
      badge: v.string(),
      title: v.string(),
      tamil: v.string(),
      kind: v.union(v.literal("ladder"), v.literal("past"), v.literal("final")),
      teach: v.array(v.number()),
      solo: v.array(v.number()),
    }),
  ),
  labels: v.optional(v.record(v.string(), v.string())),
});
export const masterData = v.object({
  kind: v.literal("master"),
  parts: v.array(
    v.object({
      id: partId,
      from: v.number(),
      to: v.number(),
      kind: v.union(v.literal("short"), v.literal("cards")),
      each: v.optional(v.number()),
    }),
  ),
  levels: v.array(v.object({ n: v.number(), from: v.number(), to: v.number(), max: v.number() })),
  marks: v.optional(v.record(v.string(), v.number())),
});
export const masterState = v.object({
  q: v.record(
    v.string(),
    v.object({
      got: v.optional(v.number()),
      max: v.optional(v.number()),
      lost: v.boolean(),
      t: v.number(),
      x: v.optional(v.number()),
    }),
  ),
  lv: v.record(
    v.string(),
    v.object({
      done: v.optional(v.number()),
      fixed: v.optional(v.number()),
      by: v.optional(v.string()),
      got: v.optional(v.number()),
    }),
  ),
  reteach: v.optional(v.object({ at: v.number(), by: v.optional(v.string()) })),
});

export default defineSchema({
  /** The syllabus: Grade 6-11, every unit in term order. Seeded once, then edited in the app. */
  units: defineTable({
    grade: v.number(),
    code: v.string(), // "U03"
    key: v.string(), // "G8-U03"
    term: v.number(), // 1-3; 0 = an extra book outside the term plan
    en: v.string(),
    ta: v.string(),
    order: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_grade", ["grade", "order"]),

  /** A unit's books: its Fighter theory book and its Master workbook, as the app needs them. */
  books: defineTable({
    unitId: v.id("units"),
    stage: bookStage,
    /** The book's own title when it differs from the unit (a topic tute, e.g. Quadratic equations). */
    title: v.optional(v.string()),
    data: v.union(fighterData, masterData),
    updatedAt: v.number(),
  }).index("by_unit_stage", ["unitId", "stage"]),

  students: defineTable({
    name: v.string(),
    archived: v.boolean(),
    demo: v.optional(v.boolean()),
    present: v.boolean(),
    grade: v.optional(v.number()),
    term: v.optional(v.number()),
    stage: v.optional(stage),
    /** The unit he works on now (Fighter and Master). */
    unitId: v.optional(v.id("units")),
    /** Where to go back to after Exam Sprint. */
    back: v.optional(v.object({ stage, unitId: v.optional(v.id("units")), term: v.number() })),
    /** Before October 2026: the pilot unit's marks lived here (moved into progress). */
    marks: v.optional(v.record(v.string(), markValue)),
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

  /** One student's work in one book: theory-book circles (Fighter) or workbook levels and marks (Master). */
  progress: defineTable({
    studentId: v.id("students"),
    unitId: v.id("units"),
    stage: bookStage,
    /** Fighter: question number -> circle state. */
    marks: v.record(v.string(), markValue),
    /** Master: levels and marks. */
    m: v.optional(masterState),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_student_unit_stage", ["studentId", "unitId", "stage"])
    .index("by_student", ["studentId"]),

  calls: defineTable({
    studentId: v.id("students"),
    room,
    /** What happens in the room. The evaluation room can also teach theory. */
    kind: room,
    status: callStatus,
    group: v.string(),
    /** Section to teach, for theory calls ("R" = re-teach a Master unit). */
    section: v.optional(v.string()),
    /** The unit and book the call is about. */
    unitId: v.optional(v.id("units")),
    stage: v.optional(bookStage),
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
    /** "G8-U03" */
    unit: v.optional(v.string()),
    q: v.optional(v.number()),
    value: v.optional(v.string()),
    ms: v.optional(v.number()),
  })
    .index("by_at", ["at"])
    .index("by_session", ["sessionId"]),

  /** Small settings: the data version (for one-time updates). */
  meta: defineTable({ key: v.string(), value: v.any() }).index("by_key", ["key"]),
});
