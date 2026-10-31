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

/** The three working tabs (rooms) a teacher can be allowed. */
export const tab = v.union(v.literal("correction"), v.literal("theory"), v.literal("evaluation"));
/** Extra permissions beyond the tabs. */
export const extra = v.union(v.literal("students"), v.literal("books"), v.literal("reports"));

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
      /** Sent to Theory at (by Correction or Evaluation); tt = Theory taught it; dk = "?": he couldn't start it. */
      th: v.optional(v.number()),
      tb: v.optional(v.string()),
      tt: v.optional(v.number()),
      dk: v.optional(v.boolean()),
      /** "?" on some parts only ("iii"): he left those blank; the parts he answered keep their marks (dk is set too). */
      dkp: v.optional(v.array(v.string())),
    }),
  ),
  lv: v.record(
    v.string(),
    v.object({
      done: v.optional(v.number()),
      fixed: v.optional(v.number()),
      by: v.optional(v.string()),
      got: v.optional(v.number()),
      /** Done on paper before the app: a later level was handed in or corrected while this one had no record. */
      pre: v.optional(v.number()),
      /** Marked at home by the phone (the family app), at; hc = the corrector looked at his working (Checked). */
      home: v.optional(v.number()),
      hc: v.optional(v.number()),
    }),
  ),
  reteach: v.optional(v.object({ at: v.number(), by: v.optional(v.string()) })),
});
/** One question of a Focus draft: marks given so far, "?" (dk; dkp = only these parts blank), the part marks (p). */
export const draftMark = v.object({
  g: v.number(),
  dk: v.optional(v.boolean()),
  p: v.optional(v.array(v.number())),
  dkp: v.optional(v.array(v.string())),
});
/** One question of a workbook's answer key (convex/lib/key.ts): a short answer, or its parts' answers and marks. */
export const keyAnswer = v.object({
  q: v.number(),
  a: v.optional(v.string()),
  parts: v.optional(v.array(v.object({ p: v.string(), a: v.string(), m: v.optional(v.number()) }))),
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
    /** How many answers its key has (the key itself is in `keys`); missing = no key. */
    keyCount: v.optional(v.number()),
    /** How many of its questions are in `questions` (read from the uploaded book.html); missing = none. */
    qCount: v.optional(v.number()),
  }).index("by_unit_stage", ["unitId", "stage"]),

  /** A book's answer key, read only when a teacher opens a question. Teachers only, never in the code.
   *  stage: whose key (a topic tute brings both); missing = the workbook's (Master), as every key before. */
  keys: defineTable({
    unitId: v.id("units"),
    stage: v.optional(bookStage),
    answers: v.array(keyAnswer),
    updatedAt: v.number(),
  }).index("by_unit", ["unitId"]),

  /** Each printed question of a book as the book draws it (cleaned HTML), read only while a teacher opens it.
   *  Teachers only, never in the code (his books' content). */
  questions: defineTable({
    unitId: v.id("units"),
    stage: bookStage,
    q: v.number(),
    html: v.string(),
  }).index("by_book", ["unitId", "stage", "q"]),

  /** The book's own CSS (fonts and print rules removed), to draw its questions. One row per book. */
  bookCss: defineTable({
    unitId: v.id("units"),
    stage: bookStage,
    css: v.string(),
    updatedAt: v.number(),
  }).index("by_book", ["unitId", "stage"]),

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
    /** Last time each room finished with him: "not seen today" goes first on the Evaluation and Theory pages. */
    seen: v.optional(v.object({ theory: v.optional(v.number()), evaluation: v.optional(v.number()) })),
    /** Idle tracking for the end-of-session report. */
    idleSince: v.optional(v.number()),
    idleReason: v.optional(v.string()),
    idleMs: v.number(),
    /** When he last arrived (signed in on Attendance). Every visit is in the attendance table. */
    lastInAt: v.optional(v.number()),
    /** When he was removed from the class (for "left this month"). */
    archivedAt: v.optional(v.number()),
    /** The family app opens every World for him (else: his unit, books given, and the next after a finished one). */
    openAll: v.optional(v.boolean()),
    /**
     * A test student (31 Oct 2026): the test class, a class of its own. Only phones in test mode see test students
     * (state.get `test`); the real class never does, and they never count (demo is set too). copyOf = the real student
     * he copies (his grade, stage, books, levels and books given, as they were when copied); testCase = what an extra
     * test student is for ("Theory: needs D, no work 6 min").
     */
    test: v.optional(v.boolean()),
    copyOf: v.optional(v.id("students")),
    testCase: v.optional(v.string()),
  }).index("by_archived", ["archived"]),

  /**
   * Focus tab: a workbook level marked part of the way (stopped at Q6, or marked as the student goes), kept until the
   * level is saved with workbook.correct. A draft counts nowhere: not in the level's marks, not for Evaluation or
   * Theory, not in reports. q = question number → marks given (dk = "?"), p = the part marks tapped.
   */
  drafts: defineTable({
    studentId: v.id("students"),
    unitId: v.id("units"),
    level: v.number(),
    q: v.record(v.string(), draftMark),
    updatedAt: v.number(),
    by: v.optional(v.string()),
  }).index("by_student", ["studentId"]),

  /**
   * Who has a student's book open on the Correction page (31 Oct 2026): one corrector per book at a time, so two
   * correctors never mark the same paper; two can each have one of his books. Her phone says it is still there every
   * 20 s (seenAt); after a minute of silence (phone locked, page closed) anyone can take it. Another corrector can ask
   * for it (ask); the holder gives it (the claim moves to the asker) or keeps it (kept).
   */
  claims: defineTable({
    studentId: v.id("students"),
    unitId: v.id("units"),
    userId: v.id("users"),
    name: v.string(),
    at: v.number(),
    seenAt: v.number(),
    ask: v.optional(v.object({ userId: v.id("users"), name: v.string(), at: v.number() })),
    kept: v.optional(v.object({ userId: v.id("users"), at: v.number() })),
  })
    .index("by_paper", ["studentId", "unitId"])
    .index("by_user", ["userId"]),

  /**
   * Books handed to a student (a unit's theory book or workbook), ticked in Correction's unit sheet: which books he
   * has, so nobody photographs the shelf again. One row per student, unit and book; untick = the row goes.
   */
  handouts: defineTable({
    studentId: v.id("students"),
    unitId: v.id("units"),
    stage: bookStage,
    at: v.number(),
    by: v.optional(v.string()),
  }).index("by_student", ["studentId"]),

  /** The attendance register: one row per visit, when he arrived and when he left. */
  attendance: defineTable({
    studentId: v.id("students"),
    /** The day in Sri Lanka: "2026-10-28". */
    day: v.string(),
    inAt: v.number(),
    /** Signed out, or the session ended. Missing while he is in class. */
    outAt: v.optional(v.number()),
    sessionId: v.optional(v.id("sessions")),
  })
    .index("by_student", ["studentId", "inAt"])
    .index("by_day", ["day", "inAt"]),

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
    /** This theory call cancelled Evaluation's call for him (theory comes first): her phone tells her so. */
    bumped: v.optional(v.boolean()),
    createdAt: v.number(),
    sentAt: v.optional(v.number()),
    /**
     * Sent to a room (30 Oct 2026): he walks there and its teacher taps Arrived (arrivedAt). Until then he is on his
     * way; after 3 minutes Correction is told to look for him. Calls without it (older calls, "keep him") count as there
     * once sent.
     */
    walk: v.optional(v.boolean()),
    arrivedAt: v.optional(v.number()),
    /**
     * The teacher who called him (31 Oct 2026): each Theory or Evaluation teacher has her own room. Correction says her
     * name ("Kumar, go to Nila in Evaluation"); only her phone shows him in her room. Calls without it are shared.
     */
    teacherId: v.optional(v.id("users")),
    teacher: v.optional(v.string()),
    /** This theory call cancelled the Evaluation call of this teacher (her phone says "Theory took Kumar first"). */
    bumpedFrom: v.optional(v.id("users")),
    /** A call for a test student (the test class): never in a room's score, nor in Theory's lesson times. */
    test: v.optional(v.boolean()),
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
    /**
     * Each room's score for this class (the Theory and Evaluation pages show it): stats[room][key] = a number.
     * calls / ahead (called while he still had work) / done (students taught or explained) / lessons (Theory's Done
     * taps that taught something) / qs (questions explained or taught) / waitMs, maxWaitMs (out-of-work time spent
     * waiting for that room, closed waits only). Rooms: theory, evaluation, correction (waits only).
     */
    stats: v.optional(v.record(v.string(), v.record(v.string(), v.number()))),
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
    /** A workbook level corrected on the Correction page: ms from its first mark to Save (31 Oct 2026, the CEO page). */
    took: v.optional(v.number()),
    /** The signed-in person who did it (by = the tab it was done from). */
    who: v.optional(v.string()),
  })
    .index("by_at", ["at"])
    .index("by_session", ["sessionId"]),

  /** People who can sign in: the owner and teachers. (Parents and students: a later, separate site.) */
  users: defineTable({
    name: v.string(),
    /** Lower-case name, for signing in with a PIN. */
    nameKey: v.string(),
    role: v.union(v.literal("owner"), v.literal("teacher")),
    tabs: v.array(tab),
    can: v.array(extra),
    /** SHA-256 of the PIN with this user's id; the PIN itself is never stored. */
    pinHash: v.optional(v.string()),
    /** Wrong PINs in a row, and the lock they caused. */
    fails: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
  }).index("by_name", ["nameKey"]),

  /** A signed-in phone. It keeps a random token; only the token's SHA-256 is stored here. */
  devices: defineTable({
    userId: v.id("users"),
    tokenHash: v.string(),
    label: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_user", ["userId"]),

  /** One-tap sign-in links (sent on WhatsApp): one use, 24 hours. Only the code's SHA-256 is stored. */
  links: defineTable({
    userId: v.id("users"),
    codeHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_code", ["codeHash"])
    .index("by_user", ["userId"]),

  /**
   * The family app (app.aristora.org): a student's family signs in with a link sent on WhatsApp (one use, 7 days).
   * A family phone sees only its own child, through convex/family.ts; it can never pass as a teacher's phone (its own
   * table and its own hash tag). Only SHA-256 of the code and the token are stored.
   */
  familyLinks: defineTable({
    studentId: v.id("students"),
    codeHash: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
    cancelledAt: v.optional(v.number()),
    createdBy: v.optional(v.id("users")),
  })
    .index("by_code", ["codeHash"])
    .index("by_student", ["studentId"]),
  familyDevices: defineTable({
    studentId: v.id("students"),
    tokenHash: v.string(),
    label: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_student", ["studentId"]),

  /** Small settings: the data version (for one-time updates). */
  meta: defineTable({ key: v.string(), value: v.any() }).index("by_key", ["key"]),
});
