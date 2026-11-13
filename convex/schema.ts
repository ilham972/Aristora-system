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
/**
 * Extra permissions beyond the tabs. Feedback (3 Nov 2026, his answer): reads what students send from the family app.
 * Consultation (5 Nov 2026, his ask): the top bar's Consultation page: call any student here to herself, one to one.
 * Community (7 Nov 2026, his answer): posts in the students' Us tab (every teacher cheers and gives shout-outs).
 */
/** A department (8 Nov 2026, his voice note): convex/lib/dept.ts. */
export const dept = v.union(v.literal("fighter"), v.literal("master"), v.literal("management"));
/** The two that teach: a theory book is Fighter's, a workbook Master's. */
export const teachDept = v.union(v.literal("fighter"), v.literal("master"));
/** A page of a person's own bottom bar (convex/lib/dept.ts, Settings → Roles). */
/** One department's day of work (convex/lib/work.ts DeptDay): its number, its parts, each person, each grade. */
const deptDay = v.object({
  day: v.number(),
  total: v.number(),
  parts: v.record(v.string(), v.number()),
  students: v.number(),
  people: v.array(v.object({ name: v.string(), total: v.number(), parts: v.record(v.string(), v.number()), students: v.number() })),
  grades: v.array(v.object({ grade: v.number(), n: v.number() })),
});

export const pageId = v.union(
  v.literal("dash"),
  v.literal("boss"),
  v.literal("class"),
  v.literal("register"),
  v.literal("fighter"),
  v.literal("master"),
  v.literal("correction"),
  v.literal("fees"),
  v.literal("books"),
  v.literal("theory"),
  v.literal("evaluation"),
  v.literal("teach"),
  v.literal("consult"),
  v.literal("progress"),
  v.literal("us"),
);
export const extra = v.union(
  v.literal("students"),
  v.literal("books"),
  v.literal("reports"),
  v.literal("feedback"),
  v.literal("photos"),
  v.literal("consult"),
  v.literal("community"),
  v.literal("money"),
);
/**
 * One line of the Us tab (7 Nov 2026): the owl's own (a birthday, a Stage finished, a first level at home, back in
 * class, days in a row, the week's most improved and champions, yesterday's count) and the teachers' (a post, a
 * shout-out). convex/lib/us.ts has the rules.
 */
export const usKind = v.union(
  v.literal("bday"),
  v.literal("stage"),
  v.literal("home1"),
  v.literal("back"),
  v.literal("flame"),
  v.literal("up"),
  v.literal("champs"),
  v.literal("count"),
  v.literal("post"),
  v.literal("shout"),
  v.literal("ask"),
  /** 8 Nov 2026: a student's 💡 "what I learned" (words and a photo of his working): everyone sees it after a teacher's ✓. */
  v.literal("learn"),
  /**
   * 8 Nov 2026 (the leagues and ranks): a new rank (`x` its index of RANKS), Monday's moves up (`ppl` with `l` the league
   * each reached), the month's most improved (`ppl`, `x` = that month's 1st), a gift a teacher gave by hand (`ppl`, `t`
   * her reason). The ranks and leagues went on 11 Nov 2026: their old lines stay, nobody sees them (lib/us.ts GONE_KINDS).
   */
  v.literal("rank"),
  v.literal("lgup"),
  v.literal("upm"),
  v.literal("gift"),
  /** 11 Nov 2026: a new GOAT (`ppl`: ARISTORA's all-time #1 over every grade). */
  v.literal("goat"),
);
/** What a student is told about in the bell (8 Nov 2026: Us's own alerts). */
export const usInboxKind = v.union(
  v.literal("c"),
  v.literal("r"),
  v.literal("l"),
  v.literal("ok"),
  v.literal("no"),
  v.literal("fix"),
  v.literal("q"),
  v.literal("shout"),
  v.literal("tclap"),
  v.literal("clap"),
  /** 8 Nov 2026 (his voice note: "tagging option, reply option"): someone tagged him (@) in a thread. */
  v.literal("m"),
);
/** What gave a student XP on Us (8 Nov 2026, his answers): an answer ✓, help ✓, a 💡 post ✓, a comment in his words. */
export const usXpKind = v.union(v.literal("ans"), v.literal("help"), v.literal("learn"), v.literal("c"));
/**
 * XP numbers worked out at one moment (convex/lib/race.ts XpNums). Since 8 Nov 2026 also the days he learned that week
 * and the week before (`dm`, `dmp`: bits, Monday = 1) and XP in the month of `mk`, the month before and the one before
 * that (`mo`, `m1`, `m2`); numbers kept before have none (the race rows are built again: RACE_V 2).
 */
const xpFields = {
  wk: v.number(),
  d: v.number(),
  xp: v.number(),
  xpy: v.number(),
  prev: v.number(),
  tot: v.number(),
  dm: v.optional(v.number()),
  dmp: v.optional(v.number()),
  mk: v.optional(v.number()),
  mo: v.optional(v.number()),
  m1: v.optional(v.number()),
  m2: v.optional(v.number()),
};
export const xpNums = v.object(xpFields);
/** His last week in his league (convex/lib/race.ts LeagueResult): Monday's card on his phone. */
export const leagueResult = v.object({
  wk: v.number(),
  l: v.number(),
  p: v.union(v.number(), v.null()),
  m: v.union(v.literal(-1), v.literal(0), v.literal(1)),
  xp: v.number(),
  win: v.boolean(),
  of: v.number(),
  sh: v.optional(v.boolean()),
  pl: v.optional(v.boolean()),
});
/**
 * A photo on Us (7 Nov 2026: a teacher's poster or question, a student's answer or doubt): two copies the phone made,
 * `s` small for the lines (~560 px), `b` big for a tap (1280 px); `w` × `h` = the big one's size.
 */
export const usPhoto = v.object({
  s: v.id("_storage"),
  b: v.id("_storage"),
  w: v.number(),
  h: v.number(),
  /**
   * 8 Nov 2026 (his voice note: "instead of using locking feature, why we can't make like blurring feature"): the photo
   * as a few coloured squares ("6x4:" then 3 hex digits a square, at most 6 on the long side), made on the phone. A
   * classmate who hasn't answered yet sees it blurred: the colours of a page, never a word or a number of it.
   */
  z: v.optional(v.string()),
});
/** Who a student is for private messages (8 Nov 2026, his rule: a boy and a girl student never message each other). */
export const sexKind = v.union(v.literal("b"), v.literal("g"));
/** Who a student's doubt is for (7 Nov 2026, his words: "teacher or senior students ... or both"). */
export const usAud = v.union(v.literal("t"), v.literal("s"), v.literal("ts"));
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
  /** Out of the syllabus: everyone gets these questions' marks without doing them (the owner's Preview, 5 Nov 2026). */
  free: v.optional(v.array(v.number())),
});
/** One corrected question (lib/master.ts `MQ`), without `fr`. */
const mqFields = {
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
  /** Right on that second try (10 Nov 2026, his rule): the marks it added (half the question's, whole), in the level's. */
  rh: v.optional(v.number()),
};
export const masterState = v.object({
  q: v.record(
    v.string(),
    v.object({
      ...mqFields,
      /** Free marks (out of the syllabus): the row as it was before, for when it isn't free any more; "none" = no row. */
      fr: v.optional(v.union(v.object(mqFields), v.literal("none"))),
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
      /** Who checked it in class (her name as in People; 7 Nov 2026: his phone says who corrected it). */
      cn: v.optional(v.string()),
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
  // a word or a name in letters, typed with his phone's keyboard (10 Nov 2026)
  w: v.optional(v.boolean()),
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
  // his own words, typed: a teacher reads them (10 Nov 2026: "explain", "show that"; never a photo)
  v.object({ k: v.literal("say") }),
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

  /**
   * A workbook's skills and each question's skill (13 Nov 2026, his "instead of find common questions, we have to find
   * the common skills"; convex/lib/skills.ts): one row per book, saved whole through the Claude link (`tell` "skills").
   * skills = the unit's own ("G8-U05-S3": Tamil and English names, `eg` = the question a lesson shows); tags = each
   * question's skills, or each part's (`p`): `s` the main one, `x` up to two more its solution uses; its own unit's or
   * an earlier unit's. Names only: never a question's words.
   */
  skillTags: defineTable({
    unitId: v.id("units"),
    stage: bookStage,
    skills: v.array(v.object({ id: v.string(), ta: v.string(), en: v.string(), eg: v.optional(v.number()) })),
    tags: v.array(v.object({ q: v.number(), p: v.optional(v.string()), s: v.string(), x: v.optional(v.array(v.string())) })),
    by: v.string(),
    updatedAt: v.number(),
  }).index("by_book", ["unitId", "stage"]),

  /**
   * The Claude link (10 Nov 2026, his ask: "create the direct pipeline ... directly digitalize from here"): while it is
   * on, a Claude chat holding its code reads the books and saves each question's answer kinds (convex/link.ts). id =
   * its public name (in every request); key = its secret (base64url, 32 bytes), made on the owner's phone, shown to him
   * once and never sent to any phone again: every request and answer is sealed with it (convex/lib/seal.ts). last =
   * the newest request taken (an older one is refused: nothing can be sent twice). One row at most.
   */
  claudeLinks: defineTable({
    id: v.string(),
    key: v.string(),
    by: v.string(),
    at: v.number(),
    until: v.number(),
    last: v.optional(v.number()),
    usedAt: v.optional(v.number()),
    uses: v.optional(v.number()),
  }).index("by_link", ["id"]),

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
    /** His last consultation's Done (5 Nov 2026): the Consultation page puts the one not seen longest first. */
    consultAt: v.optional(v.number()),
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
    /**
     * Boy or girl (8 Nov 2026, his rule for private messages: "girl student and boy student can't message each other ...
     * boy can chat another boy, girl can chat another girl, whatever grade"; teachers anyone). Set by the owner and the
     * Students tick (Settings → Students → Boys and girls); unset = he messages teachers only, and only teachers him.
     */
    sex: v.optional(sexKind),
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
    /**
     * Opened on his phone only, no printed copy (the O/L map's "every OL book in the app", 9 Nov 2026): never charged,
     * never taken from the stock.
     */
    noCopy: v.optional(v.boolean()),
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
    lh: v.optional(
      v.record(
        v.string(),
        // q (7 Nov 2026): the section's questions, so a class mark inside it never counts as XP a second time.
        v.object({ t: v.number(), got: v.number(), max: v.number(), q: v.optional(v.array(v.number())) }),
      ),
    ),
    startedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_student_unit_stage", ["studentId", "unitId", "stage"])
    .index("by_student", ["studentId"])
    // Every student's workbook of one unit (the owner's free marks reach them all at once, convex/preview.ts).
    .index("by_unit_stage", ["unitId", "stage"]),

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
    /**
     * A consultation (5 Nov 2026, his ask): the owner or a Consultation person called him to herself from the top bar's
     * Consultation page, any student here, nothing has to wait for her. Always the evaluation room (kind = what she picked:
     * Evaluation or Theory); her taps are saved one by one (`consult.mark`), Done records nothing more. Theory never
     * bumps or pulls him from it; Correction's phone says only her name ("Kumar, go to Ilham.").
     */
    consult: v.optional(v.boolean()),
    /**
     * A consultation's department (8 Nov 2026): Fighter (theory books) or Master (workbooks). `toLead`: that department
     * had a lead teacher when he was called, so her phone says it and she sends him (she is in the classrooms);
     * Correction hears it only when nobody sends him for 3 minutes. No lead: Correction, as before.
     */
    dept: v.optional(teachDept),
    toLead: v.optional(v.boolean()),
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
    /** The book a teacher's tap was on (8 Nov 2026: desk, consult, board): its department's dashboard counts it. */
    stage: v.optional(bookStage),
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
    /**
     * Her department (8 Nov 2026, his voice note: "assign the responsibility to each teacher"), and whether she is its
     * lead (walks from grade to grade; her department's consultation calls ring on her phone). Settings → Roles.
     */
    dept: v.optional(dept),
    lead: v.optional(v.boolean()),
    /**
     * Her own app: the pages of her bottom bar (convex/lib/dept.ts). Unset = the app of before (Class, her jobs' pages,
     * Us). With pages set her jobs follow from them (people.setRole).
     */
    pages: v.optional(v.array(pageId)),
    /** SHA-256 of the PIN with this user's id; the PIN itself is never stored. */
    pinHash: v.optional(v.string()),
    /** Wrong PINs in a row, and the lock they caused. */
    fails: v.optional(v.number()),
    lockedUntil: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    /** Settings → Feedback: the newest feedback this person has seen (the count on the gear is what came after). */
    feedbackSeenAt: v.optional(v.number()),
    /**
     * Her photo (8 Nov 2026, his ask: "we don't have any features to edit the profile photo for the teachers"): on her
     * posts, shout-outs and replies in Us; set in the class app's Us tab (her picture at the top). A staffPhotos row.
     */
    photo: v.optional(v.object({ id: v.id("staffPhotos"), at: v.number() })),
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
   * Convex storage until a day after marking, or until their question is explained if he lost marks on it (12 Nov
   * 2026, 30 days at most: `photos.sweep`, `PHOTO_HOLD_MS`); a retake's files go at once.
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
    /** ask = a teacher's message back to him (7 Nov 2026): nothing marked until he answers it (a photo or words). */
    state: v.union(v.literal("waiting"), v.literal("done"), v.literal("retake"), v.literal("ask")),
    doneAt: v.optional(v.number()),
    /** Who marked it (her name) and her id. */
    by: v.optional(v.string()),
    byId: v.optional(v.id("users")),
    /** A part: her marks for the part(s) the phone left. His working (Correction's ⌂ lane): the new marks she gave. */
    got: v.optional(v.number()),
    /**
     * A part, marked part by part (13 Nov 2026, his report: an essay question with one wrong sub-question showed every
     * sub-question red in the thread): her marks for each part of the phone key (null = the phone's part). Old rows:
     * missing (only the total is known).
     */
    pm: v.optional(v.array(v.union(v.number(), v.null()))),
    /** The cause of a wrong answer, or a remark on a part (`WHY`); her own words (≤ `NOTE_MAX`). */
    why: v.optional(v.string()),
    note: v.optional(v.string()),
    /** He opened her answer on his phone. */
    seen: v.optional(v.number()),
    /** Its files were deleted at. */
    gone: v.optional(v.number()),
    /** Closed because its question became free marks (the owner's Preview); open again if it isn't free any more. */
    free: v.optional(v.literal(true)),
    /** Closed because the class corrected its level (his paper, 6 Nov 2026): nothing for a teacher to mark. */
    cls: v.optional(v.literal(true)),
    /**
     * A teacher's message before marking (7 Nov 2026, his voice note: "where is the second sub question's answer ... or
     * we can give the hint"): her words (≤ `ASK_MAX`), her name, when; kept after he answers, for her card.
     */
    ask: v.optional(v.string()),
    askBy: v.optional(v.string()),
    askAt: v.optional(v.number()),
    /** His words back to her message (≤ `REASON_MAX`), with or without new photos. */
    reply: v.optional(v.string()),
    /**
     * Her voice note with the message (12 Nov 2026): one audio file (≤ `VOICE_SEC`, ≤ `VOICE_BYTES`) and its seconds.
     * It goes with the photos' files (a day after marking, `photos.sweep`), and when she sends a new message.
     */
    askVoice: v.optional(v.id("_storage")),
    askSec: v.optional(v.number()),
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
  /** A teacher's photo (8 Nov 2026): made small on her phone as a student's is; shown at once (no OK); one per teacher. */
  staffPhotos: defineTable({
    userId: v.id("users"),
    data: v.string(),
    type: v.union(v.literal("image/jpeg"), v.literal("image/webp")),
    at: v.number(),
  }).index("by_user", ["userId"]),
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
   * Each day's work of each department, kept once the day is over (8 Nov 2026, his "the progress also always saved ...
   * yesterday 100 questions correction, today 300 corrections"): convex/lib/work.ts counts it from the history, at
   * midnight in Sri Lanka (convex/work.ts fill: the days still missing, every 10 minutes); its dashboard's "Every
   * class" shows them. Real students only; a day with nothing done is kept too (empty), so no day is counted twice.
   */
  workDays: defineTable({
    day: v.number(),
    fighter: deptDay,
    master: deptDay,
    management: deptDay,
    /** The day's events read (at most WORK_EVENTS). */
    events: v.number(),
    at: v.number(),
  }).index("by_day", ["day"]),
  /**
   * Phone alerts (7 Nov 2026, his ask: "even though we corrected, students don't know"): a family phone that turned them
   * on for a child (the bell → Turn on). The push service's address and keys, as the phone's browser gave them; the
   * phone (`deviceId`) must still be signed in for an alert to go. Gone with the student, or when the push service
   * says the address is dead (404 / 410).
   */
  pushSubs: defineTable({
    studentId: v.id("students"),
    deviceId: v.id("familyDevices"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    at: v.number(),
    /**
     * How its last alert went (12 Nov 2026: before, a failed send left no trace and the founder couldn't know why a
     * student heard nothing): `ok` = when the phone's push service last took one; `bad` = its answer when it refused
     * or never answered (0), after the tries; cleared by the next one that goes. `tst` = his last test alert.
     */
    ok: v.optional(v.number()),
    bad: v.optional(v.number()),
    tst: v.optional(v.number()),
  })
    .index("by_student", ["studentId"])
    .index("by_endpoint", ["endpoint"]),
  /**
   * An alert waiting to go to a child's phones: a teacher's answers come in bursts (a whole level marked in a minute),
   * so they gather here for `PUSH_WAIT_MS` and go as one notification (push.send). `n` = how many, `text` = the last.
   */
  pushOut: defineTable({
    studentId: v.id("students"),
    n: v.number(),
    text: v.string(),
    at: v.number(),
    /** Where a tap opens the app (7 Nov 2026: "#us" for a teacher's shout-out or 👏); missing = the bell. */
    url: v.optional(v.string()),
  }).index("by_student", ["studentId"]),

  /**
   * Us, the students' community (7 Nov 2026, his voice notes: "the app is not feel like a community ... students want to
   * use this app continuously"): one line of the feed. The owl writes most of them by itself (convex/lib/us.ts); the
   * teachers write posts (the Community tick) and shout-outs (any teacher). Students never type: one tap (👏 🎂 👋 🙏)
   * adds to `c` (one per student: usClaps), `cn` keeps the first three names, `tc` the teachers who cheered (their names
   * show on the phones). `sid` / `n` / `g` / `pic` = the student it is about (as the race shows him: his photo only when
   * OK'd and shown); `ppl` = several (the champions, the most improved); `x` / `t` = a number and words (the Stage's
   * number and Tamil name, the days in a row, yesterday's count, a post, a shout-out's reason); `to` = a post to one
   * grade only; `by` / `byN` = the teacher. `demo` = a demo or test student's line: only those phones see it. Kept 30
   * days (`us.daily`).
   * Posts and doubts (7 Nov 2026, his voice note: "teachers will put the posters ... the screenshot of the question ...
   * students also can post by attaching the photo to ask their doubts"): `gs` = the grades a post is for (none =
   * everyone; `to` was one grade before); `ph` = photos; `qn` = a question: students answer (usAnswers; `an` answers,
   * `okN` marked right, `wN` waiting for a teacher). `k: "ask"` = a student's doubt: `sid` asked it (his name only for
   * teachers), `aud` who it is for, `an` replies, `tr` a teacher replied, `rpBy` students who reported it.
   */
  usMoments: defineTable({
    k: usKind,
    sid: v.optional(v.id("students")),
    n: v.optional(v.string()),
    g: v.optional(v.number()),
    pic: v.optional(v.string()),
    ppl: v.optional(
      v.array(v.object({ sid: v.id("students"), n: v.string(), g: v.optional(v.number()), pic: v.optional(v.string()), a: v.optional(v.boolean()), l: v.optional(v.number()) })),
    ),
    unit: v.optional(v.id("units")),
    x: v.optional(v.number()),
    t: v.optional(v.string()),
    to: v.optional(v.number()),
    by: v.optional(v.id("users")),
    byN: v.optional(v.string()),
    at: v.number(),
    day: v.number(),
    demo: v.boolean(),
    c: v.number(),
    cn: v.optional(v.array(v.string())),
    tc: v.optional(v.array(v.object({ id: v.id("users"), n: v.string() }))),
    pin: v.optional(v.boolean()),
    gs: v.optional(v.array(v.number())),
    ph: v.optional(v.array(usPhoto)),
    qn: v.optional(v.boolean()),
    an: v.optional(v.number()),
    okN: v.optional(v.number()),
    wN: v.optional(v.number()),
    aud: v.optional(usAud),
    tr: v.optional(v.boolean()),
    rpBy: v.optional(v.array(v.id("students"))),
    /**
     * The talk (8 Nov 2026, his voice note: "student can chat inside each thread ... who appreciating, who correcting"):
     * `cm` comments (usAnswers with k "c"), `la` the last thing written in it (the feed puts the liveliest first), `lp`
     * the last three people who wrote (faces on the card; never the one who asked a doubt), `vw` students who opened it,
     * `rpm` messages in it under a report (the teachers' To do).
     */
    cm: v.optional(v.number()),
    la: v.optional(v.number()),
    lp: v.optional(v.array(v.object({ n: v.string(), pic: v.optional(v.string()), tch: v.optional(v.boolean()), u: v.optional(v.id("users")) }))),
    vw: v.optional(v.number()),
    rpm: v.optional(v.number()),
    /** A 💡 post: a teacher's ✓ shows it to everyone (true), or "not this time" (false: only he sees it, with `note`). */
    ok: v.optional(v.boolean()),
    okBy: v.optional(v.string()),
    note: v.optional(v.string()),
    /**
     * "Find the mistake" (8 Nov 2026, his voice note: "if that is wrong, teacher can repost that ... who can find what the
     * problem here ... don't show the student's name"): a teacher's question made from an answer marked ✗. `src` = the
     * question it came from (its words and photos show above it), `sw` = the answer's words; its photos are this line's
     * `ph` (copies her phone made: she may cut a name out). Never whose: no id, no name.
     */
    src: v.optional(v.id("usMoments")),
    sw: v.optional(v.string()),
  })
    .index("by_feed", ["demo", "at"])
    .index("by_sid", ["sid", "k"])
    .index("by_kind", ["k", "day"])
    .index("by_pin", ["pin", "at"]),
  /** A student's one tap on a line of Us (one per student and line). */
  usClaps: defineTable({
    mid: v.id("usMoments"),
    sid: v.id("students"),
    at: v.number(),
    /** Who (8 Nov 2026: the thread shows the faces of who cheered), as the race shows him. */
    n: v.optional(v.string()),
    pic: v.optional(v.string()),
  }).index("by_mid", ["mid", "sid"]),
  /**
   * A student's answer to a teacher's question, or a reply on a doubt (a student's: `sid`; a teacher's: `by`), 7 Nov
   * 2026. `n` / `g` = the name and grade (a student's shown to students only once a teacher marked it right: `ok`);
   * `ok` true ✓ / false ✗ (none = waiting), `okBy` who marked, `note` her words to him (only he sees them); `rpBy`
   * students who reported it. One answer per student and question, never changed (his rule: classmates see the right
   * answers only after sending their own).
   */
  usAnswers: defineTable({
    mid: v.id("usMoments"),
    sid: v.optional(v.id("students")),
    by: v.optional(v.id("users")),
    n: v.string(),
    g: v.optional(v.number()),
    t: v.optional(v.string()),
    ph: v.optional(v.array(usPhoto)),
    at: v.number(),
    ok: v.optional(v.boolean()),
    okBy: v.optional(v.string()),
    note: v.optional(v.string()),
    rpBy: v.optional(v.array(v.id("students"))),
    demo: v.boolean(),
    /**
     * The talk (8 Nov 2026): `k` "c" = a comment (on any line; on a question only for those who answered); none = an
     * answer to a question or a reply on a doubt, as before. `re` = the message it answers (one level: the first of
     * the chain). `lk` 👏 on it (one per person: usLikes), `ln` the first three names. `fix` = a teacher's correction
     * everyone who sees it reads (`fixBy` her name). `pic` = the writer's face (as the race shows him).
     */
    k: v.optional(v.literal("c")),
    re: v.optional(v.id("usAnswers")),
    lk: v.optional(v.number()),
    ln: v.optional(v.array(v.string())),
    fix: v.optional(v.string()),
    fixBy: v.optional(v.string()),
    pic: v.optional(v.string()),
    /** A teacher asked everyone to find its mistake (8 Nov 2026): that question (no name on it). */
    spot: v.optional(v.id("usMoments")),
    /**
     * 8 Nov 2026 (his voice note: "we don't know which message is for which one ... tagging option, reply option"): the
     * message it answers exactly (`re` stays the first of the chain, for phones from before), the students it tags
     * (`mt`: id and name; each is told), the reactions on it by kind (`rx`: convex/lib/chat.ts RX; `lk` = all of them).
     */
    rt: v.optional(v.id("usAnswers")),
    mt: v.optional(v.array(v.object({ s: v.id("students"), n: v.string() }))),
    rx: v.optional(v.record(v.string(), v.number())),
  })
    .index("by_mid", ["mid", "sid"])
    .index("by_sid", ["sid", "at"]),
  /** Every file a photo on Us holds (both copies): the hourly sweep keeps these, and deletes uploads nobody attached. */
  usFiles: defineTable({ f: v.id("_storage") }).index("by_f", ["f"]),
  /** A 👏 on a message of the talk (8 Nov 2026): one per person (`who` = a student's id, or a teacher's). */
  usLikes: defineTable({
    aid: v.id("usAnswers"),
    who: v.string(),
    at: v.number(),
    /**
     * 8 Nov 2026 (his voice note: "we can put so many emojis ... we can see everything, who are doing, what are doing"):
     * which reaction (convex/lib/chat.ts RX: c 👏 h ❤️ l 😂 f 🔥 k 💯 i 💡 t 🤔 p 🙏; none = 👏), and who (a name and face).
     */
    e: v.optional(v.string()),
    n: v.optional(v.string()),
    pic: v.optional(v.string()),
  }).index("by_aid", ["aid", "who"]),
  /** A student opened a line (8 Nov 2026: "👀 34" on it): once each, never his own line. */
  usViews: defineTable({ mid: v.id("usMoments"), sid: v.id("students"), at: v.number() }).index("by_mid", ["mid", "sid"]),
  /**
   * What the bell tells a student about Us (8 Nov 2026, his voice note: "they don't know what's going on ... otherwise
   * they will forget our app"): a comment on his line, a reply to him, 👏 on his comment or his line (gathered while
   * unread: `x` how many), a teacher's ✓ (`x` = XP won) or her words, a new question for him, a shout-out. `n` = who
   * (the last one), `t` = a few of the words. Kept 30 days; `seen` once he opened the bell.
   */
  usInbox: defineTable({
    sid: v.id("students"),
    k: usInboxKind,
    mid: v.id("usMoments"),
    aid: v.optional(v.id("usAnswers")),
    n: v.string(),
    tch: v.optional(v.boolean()),
    pic: v.optional(v.string()),
    t: v.optional(v.string()),
    x: v.optional(v.number()),
    at: v.number(),
    seen: v.boolean(),
  })
    .index("by_sid", ["sid", "at"])
    .index("by_seen", ["sid", "seen"])
    .index("by_mid", ["mid"]),
  /**
   * XP from Us (8 Nov 2026, his answers): one row per thing that gave XP (`ref` = the answer, reply, comment or post),
   * so taking it back (a teacher's ✓ taken back, a comment removed) takes the same XP from the same day. His race row
   * keeps the sum (raceRows.us); these rows are kept 31 days (after that nothing can take them back).
   */
  usXp: defineTable({ sid: v.id("students"), at: v.number(), xp: v.number(), k: usXpKind, ref: v.string() })
    .index("by_sid", ["sid", "at"])
    .index("by_ref", ["ref"])
    .index("by_at", ["at"]),

  /**
   * Groups and private messages in Us (8 Nov 2026, his voice note: "students want to forget the WhatsApp when it comes to
   * the community ... we need group ... like a Discord ... private messaging options"; his answers: boys and girls together
   * in groups, like the hall; teachers make groups; each grade its own). One row per group or private chat.
   * - A group (`k` "g"): `gg` = a grade's own group (made the first time someone writes or opens it), else `gs` grades and
   *   `sids` students picked by a teacher; `name`, `emo`; `ro` = only teachers write. Every teacher is in every group.
   * - A private chat (`k` "d"): `pp` = its two people ("s:<student>" or "u:<teacher>"), `key` = both joined (one chat a
   *   pair). His rule decides who may start one (convex/lib/chat.ts mayMessage).
   * `la` / `lt` / `ln` / `lw` = the last message (when, a few words, who, whose key), `n` messages, `rv` = bumps when an
   * older message changes (a reaction, a removal), so an open chat reads its page again.
   */
  usRooms: defineTable({
    k: v.union(v.literal("g"), v.literal("d"), v.literal("h")),
    /**
     * An online explanation's thread (12 Nov 2026, `k` "h": convex/help.ts): one per question of a workbook (`hu` the
     * unit, `hn` its level, `hq` the question; `key` = "h:<unit>:<q>"), `ht` = the teacher it waits on now. Its students
     * are its helpAsks rows; every teacher may open it. Its messages are kept (`usChat.kp`).
     */
    hu: v.optional(v.id("units")),
    hn: v.optional(v.number()),
    hq: v.optional(v.number()),
    ht: v.optional(v.id("users")),
    name: v.optional(v.string()),
    emo: v.optional(v.string()),
    gg: v.optional(v.number()),
    gs: v.optional(v.array(v.number())),
    sids: v.optional(v.array(v.id("students"))),
    ro: v.optional(v.boolean()),
    by: v.optional(v.id("users")),
    pp: v.optional(v.array(v.string())),
    key: v.optional(v.string()),
    la: v.number(),
    lt: v.optional(v.string()),
    ln: v.optional(v.string()),
    lw: v.optional(v.string()),
    n: v.number(),
    rv: v.number(),
    demo: v.boolean(),
    at: v.number(),
  })
    .index("by_kind", ["demo", "k", "la"])
    .index("by_key", ["key"])
    .index("by_grade", ["demo", "gg"]),
  /**
   * Who has read a group or a private chat up to when (`rd`), per person ("s:<id>" / "u:<id>"). A private chat's two
   * seats are made with it (`d`: how his chat list finds it); a group's when he first opens it. `blk` = he blocked the
   * other one of a private chat (the other can't write to him).
   */
  usSeats: defineTable({
    rid: v.id("usRooms"),
    who: v.string(),
    rd: v.number(),
    d: v.optional(v.boolean()),
    blk: v.optional(v.boolean()),
  })
    .index("by_who", ["who", "rid"])
    .index("by_room", ["rid", "who"]),
  /**
   * A message in a group or a private chat (8 Nov 2026): a student's (`sid`) or a teacher's (`by`); `n` / `g` / `pic` the
   * name, grade and face (as the race shows him); words and / or photos; `re` the message it answers; `mt` the students it
   * tags; `rx` reactions by kind (usChatRx: one per person); `rpBy` students who reported it (two hide it from students).
   * Kept 30 days (`chat.sweep`, `by_at`), as Us's lines.
   */
  usChat: defineTable({
    rid: v.id("usRooms"),
    sid: v.optional(v.id("students")),
    by: v.optional(v.id("users")),
    n: v.string(),
    g: v.optional(v.number()),
    pic: v.optional(v.string()),
    t: v.optional(v.string()),
    ph: v.optional(v.array(usPhoto)),
    re: v.optional(v.id("usChat")),
    mt: v.optional(v.array(v.object({ s: v.id("students"), n: v.string() }))),
    rx: v.optional(v.record(v.string(), v.number())),
    rpBy: v.optional(v.array(v.id("students"))),
    /**
     * 12 Nov 2026, an online explanation's thread: `au` = a teacher's voice note (its file and its seconds); `ak` = the
     * message a student came in with (his photo of his working: helpAsks); `kp` = kept past the 30 days (an explanation
     * serves the next student who gets the question wrong: HELP_KEEP_MS).
     */
    au: v.optional(v.object({ f: v.id("_storage"), d: v.number() })),
    ak: v.optional(v.id("helpAsks")),
    kp: v.optional(v.boolean()),
    at: v.number(),
    demo: v.boolean(),
  })
    .index("by_room", ["rid", "at"])
    .index("by_sid", ["sid", "at"])
    .index("by_at", ["at"])
    .index("by_keep", ["kp", "at"]),
  /** A reaction on a chat message (one per person: `who` "s:<id>" / "u:<id>"; `e` the kind, `n` / `pic` who). */
  usChatRx: defineTable({ cid: v.id("usChat"), who: v.string(), e: v.string(), n: v.string(), pic: v.optional(v.string()) })
    .index("by_cid", ["cid", "who"])
    .index("by_who", ["who"]),

  /**
   * A wrong question a student wants explained online (12 Nov 2026, his voice note: "I don't want to explain everything
   * on my classroom ... explaining in the voice note like a WhatsApp ... that will open the new thread in the
   * community"). One row per student and question; `rid` = the question's thread (usRooms `k` "h": the next student who
   * gets it wrong joins the same thread and sees what was explained). `tid` = the teacher it waits on (he picks; she can
   * send it to another), `ta` since when, `tw` when a teacher last wrote in the thread for it. `st`: open → done (the
   * teacher tapped Explained: the question counts as explained in class too) / class (explained in class first: it
   * closed by itself) / skip (Not now: it waits for the class). `from` "t" = a teacher asked for it (Consultation), his
   * photo still to come (`ph` false). `hn` / `hp` = a teacher hid his name / his photos from the thread's other students.
   */
  helpAsks: defineTable({
    rid: v.id("usRooms"),
    sid: v.id("students"),
    unitId: v.id("units"),
    n: v.number(),
    q: v.number(),
    tid: v.id("users"),
    ta: v.number(),
    tw: v.optional(v.number()),
    st: v.union(v.literal("open"), v.literal("done"), v.literal("class"), v.literal("skip")),
    from: v.union(v.literal("s"), v.literal("t")),
    ph: v.boolean(),
    /** A teacher asked for his photo (13 Nov 2026: never by default, only her 📷 Ask for his photo). */
    pw: v.optional(v.boolean()),
    /**
     * 13 Nov 2026, his rule "both persons need to press the understand button. Then that thread will be closed": he
     * tapped "I understood" (`su`), the teacher tapped Understood (`tu`, by `tub`). Both = explained (st "done").
     */
    su: v.optional(v.number()),
    tu: v.optional(v.number()),
    tub: v.optional(v.id("users")),
    hn: v.optional(v.boolean()),
    hp: v.optional(v.boolean()),
    by: v.optional(v.string()),
    at: v.number(),
    doneAt: v.optional(v.number()),
    demo: v.boolean(),
  })
    .index("by_sid", ["sid", "unitId", "q"])
    .index("by_room", ["rid", "at"])
    .index("by_st", ["st", "at"]),

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

  /**
   * The race, kept ready (7 Nov 2026, his voice note: every student on it, class work counted, his grade and the whole
   * ARISTORA). One small row per student: who he is (copied from his row) and his XP numbers as they were worked out
   * (`wk` that week's Monday, `d` that day: convex/lib/race.ts reads them at any later moment). Every mutation keeps it
   * fresh (convex/lib/fn.ts), so the race reads ~120 small rows, never every student's whole history (the free plan's
   * 1 GB of reading a month). `w` / `wa` = weeks he won in his grade / in ARISTORA (the weekly champions). `v` = the XP
   * rules it was built with (RACE_V): an older one is built again.
   */
  raceRows: defineTable({
    sid: v.id("students"),
    n: v.string(),
    g: v.optional(v.number()),
    demo: v.boolean(),
    gone: v.boolean(),
    pic: v.optional(v.string()),
    bd: v.optional(v.string()),
    ...xpFields,
    w: v.optional(v.number()),
    wa: v.optional(v.number()),
    v: v.number(),
    /**
     * The part of these numbers that came from Us (8 Nov 2026: an answer or help a teacher ticked, a 💡 post, comments
     * in his own words: convex/lib/usXp.ts). Counted in the race; never in the flame, "who learned today" or the grade
     * cup (those are about Levels).
     */
    us: v.optional(xpNums),
    /** His boy / girl (8 Nov 2026): the Members page says who he may message without reading every student row. */
    sx: v.optional(sexKind),
    /**
     * The leagues and ranks (8 Nov 2026, his voice note: "they feel like they are losing what they earned"): his league
     * (`lg`, 1–5; missing = the first), set each Monday by `race.week` (and once when the leagues came: `race.fill`); his
     * last week in it (`lr`: Monday's card); the highest rank he reached (`rk`, an index of RANKS: never down). Out since
     * 11 Nov 2026 (his answers): no longer written or read; kept for the rows that have them.
     */
    lg: v.optional(v.number()),
    lr: v.optional(leagueResult),
    rk: v.optional(v.number()),
  })
    .index("by_sid", ["sid"])
    .index("by_list", ["demo", "gone"]),

  /** One progress row's XP numbers (the race row adds them up; a write works out only the row it touched). */
  raceParts: defineTable({
    pid: v.id("progress"),
    sid: v.id("students"),
    ...xpFields,
  })
    .index("by_pid", ["pid"])
    .index("by_sid", ["sid"]),

  /**
   * A finished week's champions (Monday 00:05 in Sri Lanka, `race.week`): each grade's top 3 (k "g") and ARISTORA's (k
   * "a"), and the grade cup (the share of each grade that learned that week). The poster and the gifts read it.
   */
  raceWeeks: defineTable({
    wk: v.number(),
    top: v.array(v.object({ sid: v.id("students"), n: v.string(), g: v.optional(v.number()), xp: v.number(), k: v.union(v.literal("g"), v.literal("a")), place: v.number() })),
    cup: v.array(v.object({ g: v.number(), n: v.number(), of: v.number() })),
    /** 8 Nov 2026 (the leagues, out since 11 Nov 2026): each league's winner(s) (`l` 1–5), and how many moved up and down. */
    lw: v.optional(v.array(v.object({ l: v.number(), sid: v.id("students"), n: v.string(), g: v.optional(v.number()), xp: v.number() }))),
    lup: v.optional(v.number()),
    ldown: v.optional(v.number()),
    /**
     * 11 Nov 2026 (his answers): each grade's weekly coins: its winner (the #1, or the next when the #1 won them the week
     * before), his XP that week and the coins (`c`); Monday's pay (coins.payday) adds them to his coins.
     */
    cw: v.optional(v.array(v.object({ g: v.number(), sid: v.id("students"), n: v.string(), xp: v.number(), c: v.number() }))),
  }).index("by_wk", ["wk"]),

  /**
   * A gift from the centre (7 Nov 2026, his ask: "gift cards ... ice-cream or chicken fries"): made by `race.week` for
   * last week's winners when the owner set a prize for that win (Settings → Race: `g` each grade's champion, `a`
   * ARISTORA's, `cup` every student who learned in the grade that won the cup). His phone shows it until a teacher taps
   * Given (`open` false, who and when).
   */
  gifts: defineTable({
    sid: v.id("students"),
    n: v.string(),
    g: v.optional(v.number()),
    wk: v.number(),
    /**
     * The win: `g` / `a` (each grade's and ARISTORA's champion: until 8 Nov 2026), `cup`, and since 8 Nov 2026 (his
     * answers) `lg` a league's winner (`l` the league), `mi` the month's most improved (`wk` = that month's 1st), `own` a
     * gift a teacher gave by hand (`why`, her words).
     */
    kind: v.union(v.literal("g"), v.literal("a"), v.literal("cup"), v.literal("lg"), v.literal("mi"), v.literal("own"), v.literal("shop")),
    what: v.string(),
    at: v.number(),
    open: v.boolean(),
    givenAt: v.optional(v.number()),
    by: v.optional(v.string()),
    l: v.optional(v.number()),
    why: v.optional(v.string()),
    /** 10 Nov 2026, the Shop (`shop`): what he bought (`item`) for how many coins (`c`); his card until Given. */
    c: v.optional(v.number()),
    item: v.optional(v.id("shopItems")),
  })
    .index("by_open", ["open", "at"])
    .index("by_sid", ["sid", "open"]),

  /**
   * The Shop (10 Nov 2026, his voice note: "I have diamonds and I don't know what to do with the diamonds"): what a
   * student can buy with his coins, set by the owner in Settings → Shop. `p` = its price in coins (1 coin = Rs 1 of the
   * shop's price), `st` = how many are left (missing = no end), `sh` = its shelf (owl things, treats), `on` = on the
   * phones, `ph` = its photo (a file the hourly sweep keeps).
   */
  shopItems: defineTable({
    n: v.string(),
    p: v.number(),
    st: v.optional(v.number()),
    sh: v.union(v.literal("owl"), v.literal("treat")),
    on: v.boolean(),
    ph: v.optional(v.id("_storage")),
    at: v.number(),
  }).index("by_on", ["on"]),

  /**
   * A student's coins (10 Nov 2026): `n` = the coins he has; `xp` = the XP already paid out (every Monday last week's XP
   * pays, 5 XP = 1 coin: convex/lib/coins.ts); `wk` = the Monday of his last pay, `last` = its coins (Home's PAYDAY card);
   * `paid` / `spent` = coins ever paid and spent.
   */
  wallets: defineTable({
    sid: v.id("students"),
    n: v.number(),
    xp: v.number(),
    wk: v.number(),
    last: v.number(),
    paid: v.number(),
    spent: v.number(),
  }).index("by_sid", ["sid"]),

  /** Each change to a student's coins: a Monday's pay, a thing bought, coins given back (`w` = what, in words). */
  coinLog: defineTable({
    sid: v.id("students"),
    at: v.number(),
    n: v.number(),
    /** `win` (11 Nov 2026): his grade's weekly coins (`w` = the grade and the week). */
    k: v.union(v.literal("pay"), v.literal("buy"), v.literal("back"), v.literal("win")),
    w: v.optional(v.string()),
  })
    .index("by_sid", ["sid", "at"])
    .index("by_at", ["at"]),

  /** A cheer (👏, 7 Nov 2026): one tap on a classmate's profile, no words; one a day per classmate. */
  cheers: defineTable({
    to: v.id("students"),
    from: v.id("students"),
    name: v.string(),
    at: v.number(),
    day: v.number(),
  })
    .index("by_to", ["to", "at"])
    .index("by_from", ["from", "day"]),
  // Time in the family app (12 Nov 2026, convex/online.ts): one row per stay (the app on his screen; a beat a minute),
  // `ms` in the app, `lv` of it inside a Level; `bye` = he left it. Online, last seen and the bars on a profile come from
  // here; rows older than KEEP_DAYS go (the daily sweep).
  appTime: defineTable({
    sid: v.id("students"),
    day: v.number(),
    from: v.number(),
    to: v.number(),
    ms: v.number(),
    lv: v.number(),
    bye: v.optional(v.boolean()),
    inLv: v.optional(v.boolean()),
    st: v.optional(v.number()),
  })
    .index("by_sid", ["sid", "to"])
    .index("by_sid_day", ["sid", "day"])
    .index("by_to", ["to"]),

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

  /**
   * Fees (9 Nov 2026, his voice note: "some students not giving me fees ... I don't know who give and who didn't"): each
   * student's ledger, one row a line (convex/lib/money.ts has the rules). The charges come by themselves from what the
   * app knows (convex/lib/feeRows.ts keeps them in step): a day he was signed in = class (his fee that day), a printed
   * book given = book (its price then); owe / credit = an old debt or credit the owner typed once. pay = money he gave,
   * `to` = the charges he said it was for (the rest pays his oldest). Never on a teacher's open page whole: `accounts`
   * keeps each student's sums.
   */
  fees: defineTable({
    sid: v.id("students"),
    /**
     * class / book / owe = charges, pay / credit = money; off = a class taken off because he never came that day (11 Nov
     * 2026: Rs 0, a line for the owner to see who took it off and when; it counts as nothing).
     */
    k: v.union(v.literal("class"), v.literal("book"), v.literal("owe"), v.literal("pay"), v.literal("credit"), v.literal("off")),
    /** Whole rupees, never below 0. */
    a: v.number(),
    /** The day in Sri Lanka ("2026-11-09"): the class, the book given, the payment. */
    day: v.string(),
    at: v.number(),
    /** A book: its unit and stage (a topic tute: one printed book, charged as its theory book). */
    u: v.optional(v.id("units")),
    st: v.optional(bookStage),
    /** A payment: the charges it was for. */
    to: v.optional(v.array(v.id("fees"))),
    /** A book given before its price was set: Rs 0 until the owner types the price. */
    np: v.optional(v.boolean()),
    /** Waived by the owner (when, his name): counts as nothing. */
    w: v.optional(v.number()),
    wb: v.optional(v.string()),
    /** Free because he is a free student (11 Nov 2026): a book at Rs 0 that never takes a price, a charge wiped when he was made free. */
    fr: v.optional(v.boolean()),
    /** Who took the money / gave the book. */
    by: v.optional(v.string()),
    note: v.optional(v.string()),
  })
    .index("by_sid", ["sid", "at"])
    .index("by_day", ["day"])
    .index("by_book", ["u", "st"]),

  /**
   * Each student's account kept ready (like the race rows): what the Fees and Books pages and his family phone read,
   * never his whole ledger. Rebuilt from his `fees` rows whenever one changes. `fee` = his own class fee (the owner's),
   * else the centre's. name / grade / gone: copied, so the lists never read the students' rows.
   */
  accounts: defineTable({
    sid: v.id("students"),
    name: v.string(),
    grade: v.optional(v.number()),
    gone: v.optional(v.boolean()),
    owe: v.number(),
    cr: v.number(),
    c: v.number(),
    b: v.number(),
    o: v.number(),
    since: v.optional(v.string()),
    bu: v.array(v.string()),
    np: v.number(),
    paid: v.number(),
    last: v.optional(v.number()),
    lastA: v.optional(v.number()),
    came: v.optional(v.string()),
    fee: v.optional(v.number()),
    /** His books are free (11 Nov 2026, the owner's switch): a printed book given is a Rs 0 line, the copy still leaves the stock. */
    fb: v.optional(v.boolean()),
    at: v.number(),
  }).index("by_sid", ["sid"]),

  /**
   * Money out (9 Nov 2026): print = copies printed at the shop (copies × papers × the paper's cost, his Rs 7), staff = a
   * person paid (`uid`), other = anything else (rent, light). The owner's Business tab adds them up; staff and other are
   * the owner's only.
   */
  cash: defineTable({
    k: v.union(v.literal("print"), v.literal("staff"), v.literal("other")),
    a: v.number(),
    day: v.string(),
    at: v.number(),
    u: v.optional(v.id("units")),
    st: v.optional(bookStage),
    copies: v.optional(v.number()),
    papers: v.optional(v.number()),
    uid: v.optional(v.id("users")),
    note: v.optional(v.string()),
    by: v.optional(v.string()),
  }).index("by_day", ["day"]),

  /**
   * A printed book (9 Nov 2026, his answer: "I set each book's price manually, but show the cost of each book"): its
   * papers (the cost = papers × the paper's cost), the price he types, and its copies kept ready: `printed` (copies
   * recorded at the shop) and `given` (copies charged to students since the fees began), both kept by every change.
   * Counted in hand: `base` copies when `basePrinted` / `baseGiven` were the counts. In hand now = base + printed since
   * − given since (no count yet: printed − given).
   */
  shop: defineTable({
    u: v.id("units"),
    st: bookStage,
    papers: v.optional(v.number()),
    price: v.optional(v.number()),
    printed: v.number(),
    given: v.number(),
    base: v.optional(v.number()),
    basePrinted: v.optional(v.number()),
    baseGiven: v.optional(v.number()),
    baseAt: v.optional(v.number()),
    at: v.number(),
  }).index("by_book", ["u", "st"]),
});
