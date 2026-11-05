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
/** The jobs (bottom tabs). Manager (3 Nov 2026): the hall and every room, sending students to any teacher. */
export const tab = v.union(v.literal("correction"), v.literal("theory"), v.literal("evaluation"), v.literal("manager"));
/** Extra permissions beyond the tabs. Feedback (3 Nov 2026, his answer): reads what students send from the family app. */
export const extra = v.union(v.literal("students"), v.literal("books"), v.literal("reports"), v.literal("feedback"), v.literal("photos"));
/** What a family app feedback is about (3 Nov 2026). */
export const feedbackTopic = v.union(
  v.literal("class"),
  v.literal("teachers"),
  v.literal("questions"),
  v.literal("app"),
  v.literal("other"),
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
      /** Sent to Theory at (by Correction or Evaluation); tt = Theory taught it; dk = "?": he couldn't start it. */
      th: v.optional(v.number()),
      tb: v.optional(v.string()),
      tt: v.optional(v.number()),
      dk: v.optional(v.boolean()),
      /** "?" on some parts only ("iii"): he left those blank; the parts he answered keep their marks (dk is set too). */
      dkp: v.optional(v.array(v.string())),
      /**
       * It came back 2 levels later on his phone (4 Nov 2026, his idea): rt = when he answered it again, rg = his marks
       * then. The first marks stay as they were; the marks he won back count as XP that week.
       */
      rt: v.optional(v.number()),
      rg: v.optional(v.number()),
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
/** The simulation's levels (convex/lib/sim.ts PLANS). */
export const simLevel = v.union(v.literal("easy"), v.literal("medium"), v.literal("hard"));
/**
 * One simulated student's steps: his pace (speed) and mistakes (care), when he arrives and goes home, whether he came
 * and went, and the level (workbook) or question (theory book) he works on until when.
 */
export const simKid = v.object({
  id: v.id("students"),
  speed: v.number(),
  care: v.number(),
  inAt: v.number(),
  outAt: v.optional(v.number()),
  came: v.boolean(),
  home: v.boolean(),
  doing: v.optional(v.number()),
  until: v.optional(v.number()),
});
/** One reading of the simulated class (convex/lib/sim.ts SimSample). */
export const simSample = v.object({
  t: v.number(),
  n: v.number(),
  idle: v.number(),
  eq: v.number(),
  es: v.number(),
  ts: v.number(),
  room: v.number(),
  cq: v.number(),
});
const boxAns = v.object({
  v: v.array(v.string()),
  same: v.optional(v.boolean()),
  l: v.optional(v.string()),
  u: v.optional(v.string()),
  j: v.optional(v.string()),
});
/** A part's answer and the way he gives it, as the book engine writes it (convex/lib/key.ts `Ans`; key version 2). */
export const ansKind = v.union(
  v.object({ k: v.union(v.literal("box"), v.literal("fill")), b: v.array(boxAns), any: v.optional(v.boolean()) }),
  // below = names the paper doesn't print, shown under the question (4 Nov 2026)
  v.object({ k: v.literal("choose"), n: v.number(), a: v.number(), items: v.optional(v.array(v.string())), below: v.optional(v.literal(true)) }),
  v.object({ k: v.literal("tf"), a: v.array(v.boolean()), items: v.optional(v.array(v.string())) }),
  v.object({
    k: v.literal("mark"),
    n: v.number(),
    a: v.array(v.number()),
    how: v.optional(v.union(v.literal("line"), v.literal("ring"))),
    items: v.optional(v.array(v.string())),
  }),
  v.object({ k: v.literal("order"), items: v.array(v.string()), a: v.array(v.number()) }),
  v.object({ k: v.literal("match"), l: v.array(v.string()), r: v.array(v.string()), a: v.array(v.number()) }),
  // "is it true? give a reason": ஆம் / இல்லை (a = true for ஆம்), then his typed reason (4 Nov 2026)
  v.object({ k: v.literal("why"), a: v.boolean() }),
  v.object({ k: v.literal("photo") }),
);
/** One question of a workbook's answer key (convex/lib/key.ts): a short answer, or its parts' answers and marks. */
export const keyAnswer = v.object({
  q: v.number(),
  a: v.optional(v.string()),
  parts: v.optional(v.array(v.object({ p: v.string(), a: v.string(), m: v.optional(v.number()), t: v.optional(ansKind) }))),
  t: v.optional(ansKind),
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
    /** One of a topic tute's two books (one printed book: the ladder + the past papers): the other stage is its twin. */
    tute: v.optional(v.boolean()),
  }).index("by_unit_stage", ["unitId", "stage"]),

  /** A book's answer key, read only when a teacher opens a question. Teachers only, never in the code.
   *  stage: whose key (a topic tute brings both); missing = the workbook's (Master), as every key before. */
  keys: defineTable({
    unitId: v.id("units"),
    stage: v.optional(bookStage),
    answers: v.array(keyAnswer),
    updatedAt: v.number(),
  }).index("by_unit", ["unitId"]),

  /**
   * The answer as the phone should read it, typed by a teacher for one part of a workbook's key (4 Nov 2026, his ask:
   * "do you have proper solution"): Settings → Books → See what the phone accepts. a = "36000", "25%", "x = 5, y = 7",
   * or "teacher" (stays with the corrector). Kept apart from the key, so a key uploaded again keeps it.
   */
  phoneFixes: defineTable({
    unitId: v.id("units"),
    q: v.number(),
    p: v.string(),
    a: v.string(),
    by: v.string(),
    at: v.number(),
  }).index("by_unit", ["unitId", "q"]),

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
    /** The family app opens every Stage (unit) for him (else: his unit, books given, and the next after a finished one). */
    openAll: v.optional(v.boolean()),
    /**
     * The family app shows him the O/L syllabus (the O/L topics by paper part) instead of his grade's terms: Grade 10
     * and 11 only (Settings → Students → O/L map, 4 Nov 2026). Unset = his grade's map.
     */
    olMap: v.optional(v.boolean()),
    /** His index number (1001, 1002…, never reused): he types it with his code in the family app. Not secret. */
    index: v.optional(v.number()),
    /**
     * A test student: the simulation's made-up students (1 Nov 2026; before it, the test class of 31 Oct), a class of
     * its own. Only phones showing the simulation see test students (state.get `test`); the real class never does, and
     * they never count (demo is set too). copyOf / testCase: the old test class's copies and cases (no longer made; the
     * tests still build the cases as fixtures).
     */
    test: v.optional(v.boolean()),
    copyOf: v.optional(v.id("students")),
    testCase: v.optional(v.string()),
    /**
     * His birthday, day and month only ("11-04", no year: 4 Nov 2026). He adds it once in the family app (Me); a teacher
     * can clear it (his Family sheet). On the day: the owl's party on his phone, 🎂 by his name in the race and on the
     * teachers' screens.
     */
    bday: v.optional(v.string()),
    /**
     * His photo the teachers said OK to (4 Nov 2026): his family phone, his Family sheet and his classmates' race show
     * it. Only the pointer lives here (every teacher's phone reads this row on every tap); the picture is in
     * profilePhotos. A photo waiting for the OK is a familyAsks row.
     */
    photo: v.optional(v.object({ id: v.id("profilePhotos"), at: v.number() })),
    /** His family turned his photo off for the race (Me → "Show it in the race"); his own phone still shows it. */
    photoHide: v.optional(v.boolean()),
  })
    .index("by_archived", ["archived"])
    .index("by_index", ["index"]),

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

  /**
   * A teacher's stay at the centre (3 Nov 2026, his ask: "arrived time and went time, all done by manager"): one row per
   * stay, marked by the manager (or the owner) on the Class tab. Closed by Went, by End the session, or by a class
   * left open. Her numbers (her card: working, free, free while students waited) count only inside it.
   */
  duty: defineTable({
    userId: v.id("users"),
    /** The day in Sri Lanka: "2026-11-03". */
    day: v.string(),
    inAt: v.number(),
    /** Went (or the class ended). Missing while she is here. */
    outAt: v.optional(v.number()),
    /** Who marked her arrived / went (the manager's or the owner's name). */
    inBy: v.optional(v.string()),
    outBy: v.optional(v.string()),
    /** When the row last changed (Undo works for 5 minutes after a mark). */
    editedAt: v.number(),
  })
    .index("by_user", ["userId", "inAt"])
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
    /**
     * Fighter, a topic tute's ladder done on the family app (4 Nov 2026): each section checked at home (its id ->
     * when, the parts right, the parts the phone marked). Its circles are set too; this is his XP and the phone's Level.
     */
    lh: v.optional(v.record(v.string(), v.object({ t: v.number(), got: v.number(), max: v.number() }))),
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
    /** A call for a test student (the simulation): never in a room's score, nor in Theory's lesson times. */
    test: v.optional(v.boolean()),
    /** Called while he still had work (the teacher saw it coming): each teacher's "ahead" on the Owner page. */
    ahead: v.optional(v.boolean()),
    /**
     * The manager sent him to this teacher (3 Nov 2026): she didn't call him. Her phone says "Raj is coming to you"
     * until she taps Arrived.
     */
    byManager: v.optional(v.boolean()),
    /** A check-in (3 Nov 2026): nothing waits for a teacher, the manager wants a teacher to see him (no teacher yet). */
    visit: v.optional(v.boolean()),
    endedAt: v.optional(v.number()),
    sessionId: v.optional(v.id("sessions")),
  })
    .index("by_status", ["status"])
    .index("by_student_status", ["studentId", "status"])
    // One student's calls today (the Manager page's day, 3 Nov 2026).
    .index("by_student_at", ["studentId", "createdAt"])
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
    /** A workbook level corrected on the Correction page: ms from its first mark to Save (31 Oct 2026, the Owner page). */
    took: v.optional(v.number()),
    /** The signed-in person who did it (by = the tab it was done from). */
    who: v.optional(v.string()),
  })
    .index("by_at", ["at"])
    .index("by_session", ["sessionId"])
    // One student's day on the Manager page (3 Nov 2026).
    .index("by_student", ["studentId", "at"]),

  /** People who can sign in: the owner and teachers. (Parents and students: a later, separate site.) */
  users: defineTable({
    name: v.string(),
    /** Lower-case name, for signing in with a PIN. */
    nameKey: v.string(),
    role: v.union(v.literal("owner"), v.literal("teacher")),
    tabs: v.array(tab),
    can: v.array(extra),
    /**
     * The owner teaches today (3 Nov 2026, his switch in Settings → Account): his room shows on the Manager page and
     * the manager can send him students. Owner only.
     */
    teaching: v.optional(v.boolean()),
    /** SHA-256 of the PIN with this user's id; the PIN itself is never stored. */
    pinHash: v.optional(v.string()),
    /** Wrong PINs in a row, and the lock they caused. */
    fails: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    /** Settings → Feedback: the newest feedback this person has seen (the count on the gear is what came after). */
    feedbackSeenAt: v.optional(v.number()),
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
  /**
   * His family app code (4 digits, made on a teacher's phone): only the owner and Students teachers read it (Family
   * sheet), never the class board (every phone gets every student row). 5 wrong in a row = locked for 15 minutes.
   */
  familyCodes: defineTable({
    studentId: v.id("students"),
    code: v.string(),
    fails: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_student", ["studentId"]),
  familyDevices: defineTable({
    studentId: v.id("students"),
    tokenHash: v.string(),
    label: v.string(),
    createdAt: v.number(),
    lastSeenAt: v.number(),
    revokedAt: v.optional(v.number()),
    /** Feedback sent from this phone today (Sri Lanka day number, count): a few a day at most. */
    fbDay: v.optional(v.number()),
    fbN: v.optional(v.number()),
    /** Photo uploads asked for from this phone today (Sri Lanka day number, count): `PHOTO_URLS_PER_DAY` at most. */
    phDay: v.optional(v.number()),
    phN: v.optional(v.number()),
    /** Profile photos sent from this phone today (Sri Lanka day number, count): `PHOTOS_PER_DAY` at most. */
    pfDay: v.optional(v.number()),
    pfN: v.optional(v.number()),
  })
    .index("by_token", ["tokenHash"])
    .index("by_student", ["studentId"]),
  /**
   * Feedback from the family app (3 Nov 2026, his voice note): a face (1–5) and/or a few words, about the class, the
   * teachers, the questions or the app. `studentId` and `name` only when he sent it with his name; without it, only his
   * grade is kept. The owner and people with Feedback read it (Settings → Feedback).
   */
  familyFeedback: defineTable({
    at: v.number(),
    grade: v.optional(v.number()),
    mood: v.optional(v.number()),
    topic: v.optional(feedbackTopic),
    text: v.optional(v.string()),
    studentId: v.optional(v.id("students")),
    name: v.optional(v.string()),
  }).index("by_at", ["at"]),
  /**
   * What he typed at home, one row per Check (4 Nov 2026, his idea: "show the wrong answer most students put"): each
   * question with boxes, his answers as typed and which boxes were right (per part; null = the teacher's part).
   * Nothing reads it yet: after a few weeks it gives each question's most common wrong answers (a hint after Check,
   * Evaluation's groups). It goes with the student (`wipeStudent`) and moves with a tute (`moveTute`).
   */
  familyAnswers: defineTable({
    studentId: v.id("students"),
    unitId: v.id("units"),
    n: v.number(),
    at: v.number(),
    qs: v.array(v.object({ q: v.number(), a: v.array(v.string()), ok: v.array(v.union(v.array(v.boolean()), v.null())) })),
    /**
     * The photos this Check asks of him (4 Nov 2026): `part` = questions with a part only a teacher can mark (a
     * drawing, a reason), `working` = questions he lost marks on (his working, to see why). Missing on Checks before.
     */
    owe: v.optional(
      v.object({
        part: v.array(v.number()),
        working: v.array(v.number()),
        /** For each `part` question, as at his Check: the marks the teacher gives and the phone's marks on the rest. */
        pm: v.optional(v.array(v.number())),
        pg: v.optional(v.array(v.number())),
      }),
    ),
  })
    .index("by_unit", ["unitId", "at"])
    .index("by_student", ["studentId", "at"]),
  /**
   * Photos from home (4 Nov 2026, his voice notes: "everything corrected at home"). One row per question and kind of a
   * level checked at home: `part` = the part(s) the phone can't mark, marked from the photo by a person he picks (the
   * Photos permission); `working` = his working on a wrong answer, answered with its cause (`why`). His rule: both are
   * required, 2 levels at most without them (`OWE_LEVELS`; Settings → Photos can turn that off). The files live in
   * Convex storage only until a day after marking (`photos.sweep`); a retake's files go at once.
   */
  homePhotos: defineTable({
    studentId: v.id("students"),
    unitId: v.id("units"),
    n: v.number(),
    q: v.number(),
    kind: v.union(v.literal("part"), v.literal("working")),
    /** 1–3 photos; empty once deleted (`gone`), or for his typed reason (`said`). */
    files: v.array(v.id("_storage")),
    /**
     * A part that is his typed reason, no photo (4 Nov 2026, his rule for "is it true? give a reason": ஆம் / இல்லை
     * right, so a teacher reads the reason he typed at his Check). Made by `family.check`; never a retake.
     */
    said: v.optional(v.literal(true)),
    /** Sent (the last time). */
    at: v.number(),
    state: v.union(v.literal("waiting"), v.literal("done"), v.literal("retake")),
    doneAt: v.optional(v.number()),
    /** Who marked it (her name) and her id. */
    by: v.optional(v.string()),
    byId: v.optional(v.id("users")),
    /** A part: her marks for the part(s) the phone left. His working (Correction's ⌂ lane): the new marks she gave. */
    got: v.optional(v.number()),
    /** The cause of a wrong answer, or a remark on a part (`WHY`); her own words (≤ `NOTE_MAX`). */
    why: v.optional(v.string()),
    note: v.optional(v.string()),
    /** He opened her answer on his phone. */
    seen: v.optional(v.number()),
    /** Its files were deleted at. */
    gone: v.optional(v.number()),
  })
    .index("by_student", ["studentId", "unitId", "n", "q"])
    .index("by_state", ["state", "at"])
    .index("by_done", ["doneAt"])
    .index("by_unit", ["unitId"]),
  /**
   * A student's photo (4 Nov 2026, his ask: "they can upload their profiles ... compress it"): square, made small on his
   * phone (≤ 288 px, ~15–30 KB), base64. At most two per student: the one the teachers said OK to (students.photo) and
   * one waiting (its familyAsks row). Read only by the photos' own queries, never by the class's live state.
   */
  profilePhotos: defineTable({
    studentId: v.id("students"),
    data: v.string(),
    type: v.union(v.literal("image/jpeg"), v.literal("image/webp")),
    at: v.number(),
  }).index("by_student", ["studentId"]),
  /**
   * What a student asked the teachers for in the family app (4 Nov 2026, his answers: every new photo waits for his OK
   * before classmates see it; a new name changes everywhere only after his OK): one row per student and kind. `no` =
   * the teachers said no: his phone tells him once, then the row goes. Small rows only (the Settings gear counts them).
   */
  familyAsks: defineTable({
    studentId: v.id("students"),
    kind: v.union(v.literal("photo"), v.literal("name")),
    at: v.number(),
    name: v.optional(v.string()),
    photoId: v.optional(v.id("profilePhotos")),
    no: v.optional(v.number()),
  })
    .index("by_student", ["studentId"])
    .index("by_at", ["at"]),

  /** Small settings: the data version (for one-time updates). */
  meta: defineTable({ key: v.string(), value: v.any() }).index("by_key", ["key"]),

  /**
   * The simulation (1 Nov 2026, his voice note): made-up students (test students, the class only phones showing the
   * simulation see) work through the books in the app; the app plays Correction; Theory and Evaluation practise. One
   * runs at a time. Phones read this row (state.get: the Join banner, SIM in the top bar, the practice score `stats`);
   * the steps' own state is in simPlay, which only the steps and the owner read.
   */
  sims: defineTable({
    status: v.union(v.literal("running"), v.literal("ended")),
    level: simLevel,
    /** Students in it ("+5" adds). */
    count: v.number(),
    minutes: v.number(),
    startedAt: v.number(),
    endsAt: v.number(),
    endedAt: v.optional(v.number()),
    /** How it ended: "time" (its minutes were up) or "owner" (End now). */
    how: v.optional(v.string()),
    /** Who started it. */
    by: v.optional(v.string()),
    seed: v.number(),
    /** The tests take the steps themselves (no steps scheduled). */
    manual: v.optional(v.boolean()),
    /** The rooms' practice score (like session.stats, for the test class): the Theory and Evaluation pages show it. */
    stats: v.optional(v.record(v.string(), v.record(v.string(), v.number()))),
    /**
     * As it ended, in a few numbers (the Owner page's "Before"). The whole scoreboard is in simReports: every phone reads
     * this row on each change of the class, so it stays small.
     */
    summary: v.optional(
      v.object({
        minutes: v.number(),
        rate: v.union(v.number(), v.null()),
        idle: v.number(),
        explained: v.number(),
        taught: v.number(),
        teachers: v.array(v.string()),
      }),
    ),
  })
    .index("by_status", ["status"])
    .index("by_startedAt", ["startedAt"]),

  /** A simulation's scoreboard as it ended (the Owner page's Sim tab; kept after its students are deleted). */
  simReports: defineTable({ simId: v.id("sims"), report: v.any() }).index("by_sim", ["simId"]),

  /** A running simulation's steps: each student's pace and what he is doing, one reading of the class a minute. */
  simPlay: defineTable({
    simId: v.id("sims"),
    /** The chain of steps that may run (a phone starting stalled steps again starts a new chain; the old one stops). */
    chain: v.string(),
    tickAt: v.number(),
    ticks: v.number(),
    kids: v.array(simKid),
    samples: v.array(simSample),
    sampledAt: v.optional(v.number()),
  }).index("by_sim", ["simId"]),
});
