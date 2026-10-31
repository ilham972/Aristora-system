# How the class works: every screen and rule, as built

The technical memory of the app, kept with the code and updated in the same commit as the change it describes (moved here from the aristora-system skill on 31 Oct 2026). "Section N" means the skill's section N (0–4 his rules, 6 accounts, 7 status, 8 open questions, 12 decisions) or these files: 5 = `how-it-works.md`, 9 = `map.md`, 10–11 = `making-changes.md`.

**Students.**
- Each student has a grade (6–11), a term (1–3), a stage (`fighter|master|legend|sprint`) and a unit ("his book
  now": the one Correction last opened). **He works on several books at once** (`ce6fe9d`): every book with
  something waiting reaches the rooms (below, "Several books").
- `back` remembers where to return after Exam Sprint.
- `present` is set in Attendance (or by demo load, or the test class); `lastInAt` = his last arrival (home time = +2 h on the
  Theory page); `archivedAt` = when he was removed (for "removed this month").
- `room` is set while he is with Theory or Evaluation.
- `idleSince`/`idleMs` count out-of-work time; `idleReason` = what he waits for (`correction`, `evaluation`,
  `theory`, joined with +).

**Top bar and tabs (`c360fa3`; Correction moved to the bottom bar in `0e4446b`, his call).**
- Top bar, left: **Class** (list icon, everyone; red corner badge = in the hall with no work), Progress (owner +
  Reports). Right: `TopStat`, one capsule = people icon + how many in class, the class clock, the link dot (a tap
  opens Attendance for Correction and the owner), then Settings. No logo, no titles. ≤400 / ≤345 px rules; `topFits()`.
- Bottom tabs, for the jobs the person has: **Correction** (square mark; its count = papers handed in, amber, red when
  someone has no work until marked; the code calls the page `Focus` and stores the role as "focus"), **Theory**,
  **Evaluation** (red count = students with no work waiting for that job). A badge shows only while the phone is
  elsewhere. A Correction-only phone has one tab; no job at all = no bottom bar (`.app.no-tabs`). Home: the bottom
  tab, else Class. Class just opens (`goClass`); Settings/Progress go back to `backTo`.
- The job decides the taps, the alerts and `by`: the bottom tab = that job; Class (and pages opened from it) = the job
  this phone used last (`aristora.job`), else the person's first.

**Attendance** (a full-page sheet since `3bce3bd`, `AttendanceSheet`; owner + Correction job): from Correction's +
(the grade picked there, no grade row: `only`), the count by the clock or Class's "Sign students in" (grades 6–11
in one row, "here/total", `aristora.attendanceGrade`). That grade's students as pills A–Z, never moving: white = not
here, green = here (✓ + arrival time), grey dashed = went home today. Tap white → signed in, toast with **Undo**
(deletes the visit; `setPresent` `undo`, 5 min). Tap green → "Sign out: going home" / Keep (within 5 min also
"Signed in by mistake? Take it back"; a sheet over the sheet). Calls strip there too. Every visit = a row in
`attendance` (`day`, `inAt`, `outAt`, `sessionId`), closed by sign-out, End the session, a class left open, or
removing the student. **No "sign in everyone"** (it would fake attendance and idle numbers). Class, Theory and
Evaluation show **only signed-in students** ("Nobody is signed in yet"); gone-home students with levels to correct
stay at the bottom of Class and Evaluation ("Correct L3").

**Class page (top bar icon, everyone's view, `c360fa3`).** `src/correction.tsx` `ClassPage`.
- Calls strips (Correction job), then the control panel: grade pills; stage tiles (All/Fighter/Master/Legend…,
  only stages present; red no work / orange running out / yellow quiet); unit pills (only units in use, one grade
  at a time, with counts); status chips = the old summary, now filters (in class / with no work / levels to correct
  / quiet / in rooms; "Show everyone"). Stage/unit/status filters are not remembered. Then the register (each
  teacher's own taps: Correction's ✓✗↻, Theory's ◎ and section letters, Evaluation's red circles and → Theory),
  gone-home list, End the session (Correction). Legend per job (`LEGEND`).
- Every row, the same for everyone (`src/nextData.ts`): **now** = one colour + words (`nowOf`: "C · 3 left",
  "On Level 4", "No work 6m", "Quiet 18m", "In Theory 4m", "Called: Evaluation"); **next** = chips on the strip line
  (`nextOf`: "Theory D ~8m" from his pace, "Eval 2" / "Eval 2 ~4m", "Correct L3", "Theory 2", "then Theory"),
  soonest first, two only if both are short (≤17 chars). A chip beats (`.beat`) only when it is now or ≤5 min.
- Tap a name (or the strip): his **buttons first** (Going home, Needs theory, Back in the hall, Move), then his
  whole book; the marks table still opens any level.

**Several books (`ce6fe9d`, his three answers: one book per call, fair turns, Books given).** `state.get` sends, for
students in class, `more` = their other progress rows with something waiting (`mayBeOpen` → `openWork`: a level
handed in, lost marks not explained, Theory not taught; a book a call names stays while it lasts) and `given` = books
given (handouts) with `work` (`givenWork`/`workLeft`; no book in the app = work). Phone: `buildViews` gives each
student `others` (a View per other book, `home` = his main view), `otherWork`, `noWork` (= his book blocked AND no
given book with work: the ONLY "out of work"; server `dryOf` the same), `key` (student:unit:stage). `withBooks(views)`
feeds `evalQueue` (one entry per book), `theoryGroups` (workbook lessons per book; theory-book sections only for his
book now) and `roomCalls` (a call → the view of its book). Calls carry `books` (`calls.create`); one call at a time
per student. Evaluation: ticking his other book swaps it; her card shows that book only (`evalRoom` `sameBook`);
**keep him for U09** (`calls.keep`: done + a sent call for the next book) when the room has space or nobody
red/orange waits, else "Also waiting: U09 (2)". Fair order (both rooms): no work, then not seen by that room today
(`students.seen[room]`, set on finish/keep; `seenToday`), then stuck / longest wait. Teachers' taps on any book
(`teachWork` in `workbook.ts`; overlays keyed student:unit). Correction: names count handed-in levels of all books
(`waitingAll`); tapping a name whose book now has none opens the book that has one, WITHOUT moving him (31 Oct:
each corrector's paper is her own; below, "Several correctors"). Class rows: "On U09" when his book is blocked but a given book has work;
chips for other books ("U08 Eval 2"). Absent students: book now only.

**Grade pills:** on Class, "All 7 9 11" for the grades in class now (Theory and Evaluation: grades 6–11, `GradeRow`) (hidden with fewer than
2), each with how many are here and a red/amber badge for what waits for this job there. Remembered per job
(`aristora.grade.<job>`); falls back to All when that grade has nobody.

**Fighter (theory book).**
- The book has sections:
  - ladder A–F: teacher questions ("teach", double-ring circles) and solo questions;
  - past papers P, with year labels;
  - final challenge X.
- **Topic tutes (O/L essay books, 31 Oct 2026, his ask): one zip, two books.** An ol-essay source zip carries
  `tute.json`; the upload makes its ladder the unit's Fighter book (sections A–F only, no P/X: `badge` = the letter)
  and its past papers + final challenge the unit's Master book (one part IIA/IIB, **one paper = one level of 10
  marks**, numbers as printed and going on from the ladder: Sets 1–55 + 56–66; `checkMaster` lets a workbook start
  after 1: `firstQuestion`). Both with their keys (`catalog.saveTute`). It replaces the unit's books (the pilot
  G11-U13 too: marks on questions no longer in the book are ignored by `computeStatus`).
- Taps (Class rows and the opened book):
  - Correction on solo circles: once ✓ right, twice ✗ wrong, three times ↻ slip. Taps save 0.9 s after the
    last tap, and the toast has Undo.
  - Theory on ◎ circles: taught → skip → clear. Tapping the section letter marks all its theory taught.
  - Evaluation on red circles: they turn violet (explained).
- Rules (`convex/lib/status.ts`):
  - A section's ladder opens when its teach questions are taught or skipped.
  - Amber at 2 ladder questions left; red at 0 ("out of work").
  - A wrong answer is ready for Evaluation after 10 minutes (sooner if he has nothing else to do).
  - 3 wrong answers waiting in one section stop that section; a question wrong twice is "stuck".
  - Past papers open once every ladder question has been tried; the final challenge comes after every past
    paper.
  - "Quiet" (yellow) means no mark for 15 minutes (40 on papers). After 20 minutes in a room, the room asks
    "Still with you?".

**Calls.**
- Theory and Evaluation tick names in their room box (one screen each) and tap **Call**. Correction's phone says
  "Ahamed and Nila, go to Theory" every 30 seconds until Correction taps Sent or × (not now, undoable).
- Theory comes first: Theory can take a student straight out of Evaluation (pull: Evaluation hears "Theory wants
  Kumar now" and taps "Send to Theory"). Theory calling someone Evaluation had **called** cancels her call: the
  theory call carries `bumped`, and Evaluation's page says "Theory took Kumar first" while it lasts.
- When Theory is busy, Evaluation can teach theory itself ("Teach").
- **Each teacher her own room** (31 Oct 2026, his answer: "Correction says her name"). A call carries who called
  (`teacherId`, `teacher`; `calls.create`, kept by `calls.keep`). Correction hears "Raj and Zara, go to Nila in
  Evaluation." (`callPhrase` groups by room, then teacher; `lostPhrase` "Kumar hasn't reached Fathima in Theory."); one
  call strip per teacher (her name first, then the room). Her page's room = her calls only (`roomCalls(…, me)`,
  `isMine`; calls without a teacher are everyone's): Arrived, Done, her lessons, her 3 (Evaluation) count only hers.
  Another teacher's student isn't suggested (the server says "is already called to Evaluation (Nila)"). Pulls go to the
  Evaluation teacher who has him; a bump note only to the teacher whose call Theory cancelled (`bumpedFrom`). Class
  rows: "With Nila 4m", "Going to Nila 1m", "Not with Nila 4m", "Called: Nila". The score stays per room.
- Status flow: `requested → sent → done | cancelled | declined`. `section: "R"` is a Master theory call.
- **Arrived (30 Oct, `b4ac688`; Evaluation too since `17919d8`):** a call Correction sent is **on his way** (`walk:
  true`, set by `sendNow`) until the room's teacher taps **Arrived** (`arrivedAt`, `calls.arrive`: that room's
  teacher or Correction; a still-requested
  call = he came by himself: sent and arrived at once; `calls.unarrive` within 2 min). Correction's phone: a quiet
  dashed strip "To Theory · Kumar 2m left" (on Class and Attendance; NOT on the Correction page itself: `CallsBand
  paper`, it pushed the paper under the pad at 320 px); at 3 min (`WALK_MS`) a red strip + the voice "Kumar hasn't reached
  Theory." (alert kind `lost`, every 30 s) with **Reached** (`arrive`) / **In the hall** (`calls.cancel` now also ends
  a walking call: room cleared, history `not-reached` with the walk ms). Class rows: "Going to Theory 1m", red "Not in
  Theory 4m" (or Evaluation). Lesson length and "Still with you?" count from Arrived. "Keep him" calls and calls sent
  before this have no `walk`: they count as there. Lost walking minutes are NOT idle minutes yet (section 8).

**Master (past-paper workbook), exactly as printed by the workbook engine ("level edition").**
- Parts: I/II for Grades 6–9; IA/IB/IIA/IIB for Grades 10–11. Part I is worth 2 marks a question. Part II
  questions carry the marks printed in the book. Question numbers run on through the unit (Part II continues
  after Part I, e.g. G8 U01: Part I 1–52, Part II 53–73).
- Levels `{n, from, to, max}`: Part I by tens (20 marks; the last Part I level takes the rest, so 10–28), Part II
  by whole questions of 18–22 marks (the engine's `_levels`). The unit total is the sum of the levels
  (G7 U08 = 146, G8 U01 = 230, G8 U02 = 223, G8 U03 = 467 in 24 levels).
- **Getting workbooks in: he uploads them himself** in Settings → Books → **Upload workbooks**: one or many unit
  source zips (or book.html) from the workbook chats. The phone reads them (no AI, no deploy), shows New /
  Replaces / Already in the app / refused-with-reason, and one tap saves them (`saveWorkbook` with `replace`). A tute
  zip is one row "topic tute" (both books, both keys, the questions): "Save 1 tute" (`saveTute`).
- The unit % = marks ÷ book total. "So far %" counts corrected levels only.
- **The bar under the row** shows where he is: a marker ▼ "L3 4" over the level he works on (dark) and each waiting
  level (amber); neighbours share one marker; near the ends it leans inwards (`markerRuns`, `.mk`).
- **The flow (Correction → Evaluation → Theory):**
  1. The student hands a level in. In Correction the corrector taps his name: the paper opens at the level to correct;
     **Later** = handed in, correct later (the waiting clock starts; he carries on with the next level), or mark it
     now. (Also: Class → his name → the level in his marks table.)
  2. Marking (Correction, or the correct sheet): full marks by default, lower the questions that lost marks; **?** = he
     couldn't start it (0 marks, straight to Theory); in a Part II question, ? on one part only (`dkp`: the parts he
     answered keep their marks; the question goes to Theory). The answer key shows under each question. Then "Lost
     marks go to Evaluation | Theory": always Evaluation unless the corrector picks Theory (`routeOf`; the old "Theory
     when under half" default hid weak students from Evaluation: removed in `2b3e2cf`). The toast says where each went.
  3. Evaluation explains lost marks (her page, one question at a time; or red → violet on the Class rows). When she
     finds he needs theory: **→ Theory** (her page, his row, or "Needs theory" in the open book: pick the
     questions or "the whole unit again"). He keeps working; Theory calls him when ready.
  4. Theory sees his questions as ◎ circles on the Class rows and a workbook pill/card on the Theory page ("Q13 ×2"
     = shared). Calls him, ticks what was taught, Done; untaught questions stay for the next call.
  5. Every Class row says where he goes next, for everyone: chips "Correct L3", "Eval 1", "Theory 2".
- Out of work = no level left to do but something to correct, explain or teach. Every level done with only Theory
  left = red, knocks Theory. Finished = every level corrected (or `pre`), nothing for Evaluation or Theory.
- **Done before the app** (`0e67580`): a level handed in or corrected gives the levels before it with no record
  `lv.pre = now` (`markBefore`, `workbook.ts`): done on paper, no marks (pale on the bar, "✓ / max" in the marks
  table, done but not today on Progress), so he isn't "On Level 1". Take back / undo hand-in remove them
  (`unmarkBefore`, same timestamp); the save's toast says "Levels 1–2: done before the app."
- Data per question (`MQ`): `got/max/lost/t`, `x` explained at, `th` sent to Theory at, `tb` by which tab, `tt`
  taught at, `dk` = "?", `dkp` = only these parts blank (with dk; got < max). `m.reteach` = the whole unit asked.
  Marking a level again the same way (blank parts too) keeps x/th/tt; new marks start over. Lost marks count only
  on corrected levels.

**Answer keys.** The unit's source zip carries `answer-key.json` (the engine writes it; an old zip gets it from a
past-paper-workbook chat in "answer key only" mode, §4b); he uploads the zip as usual ("Same book: adds its answer
key"). The reader checks numbers, each question's marks and the grade. Own table `keys`, never in `books`; fetched
(`catalog.key`) only while a level or an Evaluation card is open; teachers + owner only, never the parents'/students'
sites. Final answer bold from `**…**`, never HTML; Books page K pill. A re-upload without a key keeps it.
**One key per book** (`keys.stage`; a row without one = the workbook's, as before): `catalog.key {stage}`,
`keyRow(ctx, unit, stage)` (the family app reads the workbook's). A theory book's key (topic tutes) shows on
Correction's Fighter card, Evaluation (`AnswerKey stage`) and Theory's teacher questions; without one: "Check his
answer in his notebook" (no fetch). Books page **K** = every book of the unit in the app has its key.

**Questions as printed (31 Oct 2026).** Every upload also cuts each question card out of the zip's book.html
(`src/bookQuestions.ts`: tutes `qq` = Fighter, `pq` = Master; workbooks `si`/`pq` per unit, split at the marks
sheets; the printed number = the card's `qn`; footers and side tabs out) and the book's CSS (fonts, `@page` and
`@media screen` out), cleaned (`cleanHtml`), saved after the book in ~600 KB saves (`catalog.saveQuestions`: the first
takes the old ones away; the server refuses anything that runs, loads or posts: `unsafeHtml`/`unsafeCss`). Own
tables `questions` (unit, stage, q, html) and `bookCss`, `books.qCount`; gone when a re-upload changes the book's
questions (`bookShape`). Read one at a time (`catalog.question`, `catalog.bookCss`) under Correction's, Evaluation's
and Theory's question card: **Show the question** (`QuestionToggle`, `src/bookQuestion.tsx`; always there, pale with
no text in the app; stays open from question to question) draws it in a **shadow root** (the book's `.qn .band .sq`
never meet the app's), cleaned again (`safeFragment`), figures and tables wider than the phone zoomed down, working
space hidden. Books page **Q** = every book has its questions. Old zips: upload them again once (no new chat).

**Theory page (one screen, 31 Oct 2026, his voice note "rebuild the theory page also same like this": the Evaluation
page's layout; `src/theoryFocus.tsx` `TheoryTab`, rules in `src/theoryFocusData.ts`).** No Room button, no Lessons
list: one page, small things in fixed places like Correction. It reuses the Evaluation page's pieces (`.evx-*`, the
shared `src/roomkit.tsx`) in Theory's blue (`.tpx-page`).
- **Pinned:** grades 6–11 in ONE row (`GradeRow`, `theoryGradeRow`) and Fighter / Master / Legend (`KindBar`,
  `theoryStageRow`; Legend pale until its books exist). Each the most urgent first (`byUrgency`) and already picked;
  she can pick anything. Counts = everyone who needs Theory, each once; held students (in Evaluation, called by her,
  going home) count but never as urgent (`rowHeat`). Which grade, stage and unit are picked: **her room's book**, the
  same rule as Evaluation (`theoryRows`, `src/roomRows.ts`, below).
- **Under them:** the units that need her (`theoryUnitRow`, `.evx-u`: number + Tamil, red line = no work), then the
  lessons (`lessonPills`, `.evx-qg`): a theory book's sections ("D" + its Tamil title, how many; the plan's order,
  the most useful first: `planLessons`), or a workbook's questions sent to Theory grouped by the students who need
  them (the same students = one pill: "13 · 17 ×2"; the most urgent, then the most students) and "Whole unit". The
  lessons row holds still 5 s after her touch (`holdOrder`, `lessonPillSig`); a lesson going on in her room has a blue
  count (`qg-going`).
- **Her room box** (`.evx-room`, left ~¾, `LESSON_CAP` 6 at most, counting those called or on the way): her pills
  (`roomItems`): with her solid (`s-in`; ✓ green when every question of his is decided: `s-done`), on the way dashed
  (`s-walk`, minutes), called dotted (`s-call`), finishing in Evaluation first (`s-ev`, "Eval": Theory took him from
  Evaluation, he comes when she sends him), late red (`s-late`: not sent 3 min, or not there 3 min after Sent). Then the
  picked lesson's students (`s-sug`): the page ticks everyone who can come, no work first (`memberOrder`), as many as
  fit; with someone already with her (the lock), only those who need it now (joiners); held ones listed with a tag
  ("Eval", "home", dashed), not ticked. Its line: lock + "2 with you · 1 coming · room for 3" (amber "Still with
  you?" at 20 min) + Clear ↔ Page's pick. Right of it: **Call N**, **Arrived N** (everyone on the way), **Done N**
  (those with every question decided: `tAllDecided`).
- **What to teach** (`theorySquares`): Correction's squares, each question ONCE for everyone with her who needs it
  ("D·23 ×2"): one lesson after another (the most students first); a section's teach questions in book order (they
  build on each other), a workbook's the most shared first, the whole unit last. Nobody here yet: those on the way;
  nobody called: the picked lesson's (to prepare). One at a time (`.fc-card`): the section's letter and Tamil title, or
  the unit; who needs it (workbook: "Malik 0/2 · Evaluation 12m" = what he got and who sent it); the answer
  (`AnswerKey`, workbooks). **Fixed at the bottom** (`.fc-pad`): **Not reached** and the big **✓ Taught** ("for 2"):
  one tap = that decision for everyone with her who needs it (tap again = undo), then the next open question. Arrived
  opens the first open question (on both pages). The rows keep the picked pill in view when they re-rank.
- **Done** (`theoryFinish`): a section: the teach questions marked Taught (`calls.finish` `taught`; Not reached stay his,
  so the lesson comes back); a workbook: `workbookDone` (all taught = `{callId}`; else `workbook.taught` for the taught
  ones first, the rest stay for Theory). **Send everyone back: nothing taught** at the end of the page.
- **His file** (tap his pill: `TheoryFileSheet`, a sheet, `cls="evx-file"`): where he is; his lesson (grade, unit,
  Tamil); his questions as toggles (tap: taught → not reached → not decided: one student who didn't get it stays
  with her while the others go); workbook: each question's marks, who sent it, explained at; his unit bar
  (`MasterStrip`) or "N questions left before he needs it"; came / home / no work; other books waiting. Here: **Not
  taught** / **All taught** or **Done: back to work**; not here: **Not coming** / **Cancel the call** and **Arrived**
  ("In Evaluation first" while Evaluation still has him).
- At the end: today's score (`TodayStrip compact`). Toasts sit above the pad (`body.evx-on`).
- **The rules (agreed 2026-10-29):** minutes, not questions. Pace = time between his answers (marks given together
  share it; a lesson or a 25-min break starts again; ≥3 answers), else the class's middle pace, else 4 min. Out in =
  questions left × pace. A lesson's worth = how many it gives work to who are out of work now or will be before
  Theory is free again (`startIn` + lesson length), 6 at most. Order: starving first (out of work 20 min, or a
  workbook question waiting 40), then most freed, then longest wait, soonest out, size. A workbook question
  waiting 20 min counts like no work. Ticked by default: everyone who can come, no work first, **6 at most**.
  Listed but not ticked: in Evaluation (calling = pull), called by Evaluation, going home (arrival + 2 h) before he
  could practise one question. Lesson length = middle of the last 20 theory lessons, Arrived (else sent) to Done
  (`calls.lessons`, 3–40 min), 12 until there are 3.
- His capacity arithmetic ("do I need 4 teachers?"): a theory-book student needs a ~12-min lesson every ~30 min;
  one Theory teacher gives ~10 lessons in 2 h (groups of 3–5 keep 8–12 busy); more = a second person teaching
  theory (Evaluation can, "Teach"). Workbook days: 3 is enough (corrector + Theory + Evaluation).

**Evaluation page (one screen, 31 Oct 2026, his voice note; `src/evalFocus.tsx` `EvaluationPage`, rules in
`src/evalFocusData.ts`).** No Room button: everything on one page, small things in fixed places like Correction.
- **6 with her at once** (`EVAL_CAP`, his number on 31 Oct; was 3), counting those called or on the way. Her room =
  her own calls (each Evaluation teacher has her own: `evalRoom`/`evalItems` with `me`).
- **Pinned rows, each the most urgent first and already picked** (`byUrgency`: most red, then most waiting; ties keep
  the natural order). She can pick anything; a pick lasts while it has someone. **Her room's book** (the rule of both
  pages, `src/roomRows.ts`): see "The rows show her room's book" below. (1) **Grades 6–11** in ONE row, all six
  (`gradeRow`, `.evx-g`: number, count, red badge; pale = nothing for her). (2) **Fighter / Master / Legend**
  (`stageRow`, the Theory page's `KindBar`; Legend pale: no books yet). (3) **Units** that need her: number + Tamil
  name + count (`unitRow`, `.evx-u`, red line = no work). (4)
  **Question groups** (`qGroups`, `.evx-qg`): questions waiting for exactly the same students make one pill ("13 ·
  17", "×2"), red first, then the most students. Theory busy (`canTeachHere`, any grade): **◎ Teach N** at the end of
  that row. Above them, when it happens: the bump note and the pull banner (**Send to Theory**).
- **Her room box** (`.evx-room`, left ~¾): her students as pills (`.evx-sp`): with her solid (`s-in`; ✓ green when all
  his questions are decided: `s-done`; ◎ teaching theory: `s-th`), on the way dashed (`s-walk`, minutes), called
  dotted (`s-call`), late red (`s-late`), amber ring = Theory wants him (`s-pull`); then the picked group's students
  (`s-sug`): ticked = dark ✓ (the page ticks red and orange ones, as many as fit), grey = unticked. Its line: lock icon
  + "2 with you · 1 coming · room for 3" (amber "Still with you?" at 20 min) + Clear ↔ Page's pick (the words shorten, Clear stays). Right of it, in
  fixed places: **Call N** (or Teach N), **Arrived N** (everyone on the way), **Done N** (those with every question
  decided: `allDecided`; `calls.finish` for all of them at once).
- **The questions** (`sessionQs`): Correction's squares (`.fc-strip .fc-sq`): each question ONCE for everyone with her
  who has it, the most shared first (×2); before anyone comes, the picked group's (to prepare). One question at a
  time like Correction's card (`.fc-card`, `.fc-qn`): who has it with his marks ("Vimal 0/2"), the answer (`EvalKey`:
  `catalog.key` while open; theory books: "Check his answer in his notebook."). **Fixed at the bottom** (Correction's
  pad, `.fc-pad`): **→ Theory** and **Not now** side by side, the big **✓ Explained** ("for 2"): one tap = that
  decision for everyone with her who has it (tap again = undo), then the next open question. Pale until someone
  arrived. Squares: ✓ explained, T Theory, – not now, amber = some done.
- **His file** (tap his pill: `EvalFileSheet`, a sheet): where he is, his book, his questions with what was decided
  ("1 explained · 1 to Theory · 1 stays"), **keep him for unit 9 (1)** (`calls.keep`) or "Also waiting", his unit
  bar and day; Arrived / Not coming (Cancel the call), or Nothing explained / All explained / Done: back to work /
  Done: taught / Send to Theory. Done (`finishPlan`): a theory book's "→ Theory" sends its section back
  (`reteach`); workbook → `workbook.toTheory` first.
- At the end: today's score (`TodayStrip compact`) and who went home with levels to correct (`GoneHome`). Toasts sit
  above the pad (`body.evx-on`).

**The rows show her room's book (Theory and Evaluation, 31 Oct 2026, his screenshot).** The bug: Raza and Umair
(Grade 9 fractions) were with Evaluation, but the rows said Grade 8 unit 1, Grade 9 was pale and could not be tapped,
and the room box offered Grade 8 students next to them. The rows were built only from who WAITS (`candidates`,
`planLessons` skip anyone called); calling everyone of a book took that book out of the rows, so "with someone in her
room the page picks his book" failed exactly when she had called them all, and the page fell to the most urgent grade
while the questions on screen were still her room's. The rule now (`roomRows`, used by `evalRows` / `theoryRows`):
- Her room's books (the books of the questions on her screen: with her, else on the way) are ALWAYS in the rows:
  their grade and stage never pale, a unit nobody else waits for is added at the END of the unit row (nothing shifts),
  each with a dot in the room's colour (`.evx-me`: violet on Evaluation, blue on Theory).
- With someone in her room, the page's pick = the book of the question on her screen (two books in her room: tap a
  square of the other book, or a decision moves on to it, and the rows go with it).
- Her own pick (to find who to call next) lasts while it has someone. While she looks at a book that isn't her
  room's, the squares and the card are that book's picked questions (to prepare, the pad pale), never her room's
  under another book's name, with **Back to your room** (`BackToRoom`) in the card. Call, Arrived and "keep him" end
  her pick: the rows show her room again. After Done empties her room: the most urgent, as before.

**Today's score and sounds (`c360fa3`).** Per room, for the class: `session.stats[room]` = calls, ahead (called
while he still had work), done (sent back from the room), lessons (Theory's Done taps), qs (explained or taught),
waitMs / maxWaitMs (out-of-work time waiting for that room, closed waits; correction too). Server: `addStats` in
`calls.create`, `calls.finish` (via `record`'s n) and `closeIdle`. Phone: `scoreOf` adds the waits going on now;
`TodayStrip` (`src/deck.tsx`): "lessons · taught · ahead 5/6 · waits 14m" and one true line (`cheerOf`). Ahead
rewards calling early, waits punish calling the wrong ones: a game in tension. Sounds: `src/tones.ts` (Web Audio,
never cuts a call): call, tick, done; Settings → Alerts → "Sounds on my taps" (`aristora.tones`). Cards, pills and
rows rise in (`@keyframes rise`, 8 px up, never sideways); buttons press (scale); reduced motion off.

**Logo, install, the loading owl (`35ecace`).** Icons in `public/static` (`icon-512` = the poster's logo) +
`manifest.webmanifest` (standalone, navy); no service worker (old versions after deploys). Install: Android Chrome
⋮ → Install app; iPhone Share → Add to Home Screen (its OWN storage: sign in again). Splash `#splash` in
`public/index.html` ("Still loading…" after 8 s), `hideSplash()` (`src/splash.ts`, ≥1.2 s); `sh scripts/owl/make.sh`
rebuilds icons + splash from `scripts/owl/owl.json` (animations: "Splash" in `styles.css`).

**Correction page (ex-"Focus": `src/focus.tsx`; one page since `0e67580`, one-line rows since `3bce3bd`).** Kills his
two errors: marks on the wrong question and on the wrong student. Meant for the paid corrector.
- **Pinned under the top bar** (`.fc-stick`, with the calls): the names row and the grades; the paper scrolls under
  them. Names row: **+** first, always in the same place (that grade's Attendance, full page), then the grade's tiny
  pills A–Z in ONE line that scrolls sideways (`HRow`, `src/hrow.tsx`): the open one dark and kept in the middle by
  itself; faded edges = more; a red/amber dot on an edge = someone who waits is hidden there (`data-u`). Tones: red =
  no work until corrected, amber = handed in ("2" = levels, all his books), blue edge = theory book, dashed ring =
  marked part of the way, grey dashed = gone home with levels to correct. No grade in yet: "Nobody from Grade 11 is
  in yet: tap +".
- **Grades 6–11** always in the same places, no All (`GradeBar`): "here/total" under each number, red/amber badge
  (`gradeNeeds`); a grade with no students at all is pale and disabled; any other can be picked even with nobody in
  (`focusGrade(chosen, here, all)`, remembered in `aristora.grade.focus`; it never jumps by itself; a paper opened
  from elsewhere switches to his grade). **↶ Saved** at the end, always there (pale until the first save).
- No Stop: another name (`leave()`) saves a level marked to the end that changed ("(saved as you moved on)").
- **Several correctors at once** (31 Oct 2026, his voice note: two correctors fought over Raj). Each phone's paper is
  its own: a paper = one student AND one of his books (`bookId(v)`, `viewOfPaper`). Opening another book never moves
  him (`masterPlace` on the server: correct, hand in, drafts and Take back work on any book he has a progress row in;
  before, `moveTo` moved him and every other corrector's paper followed him). A name opens his book with something to
  correct (`bookToOpen`: book now, else a book with a level handed in, else one marked at home); his books row opens a
  book of his the same way (a book he hasn't started still moves him, as before). His paper never jumps to another
  book by itself: if its book has nothing more, it closes ("that book has nothing more to correct now").
  **One corrector per book:** the open book is claimed (`claims` table, `convex/focus.ts`: `claim`, `release`;
  `src/focus.tsx` `holdFor`/`claimBook`); her phone says "still here" every 20 s while the page is on screen
  (`stillHere`, `CLAIM_PING_MS`); a minute of silence (phone locked, other tab) and anyone can take it ("Nisha's phone
  was quiet for a minute: …yours now"). Another corrector's name pill shows her first letter (`.fc-nm-who`); dim
  (`.fc-held`) when his only book to correct is hers. Tapping it: `AskSheet` "Nisha has Raj's Unit 8" → **Ask Nisha**
  → her phone shows `GiveSheet` (a sheet, nothing under her finger moves; a soft tone) **Give it to Kavi** (her paper
  closes, her marks go with the book: they are server drafts) / **Keep it** ("Nisha keeps Raj's Unit 8"). The server
  refuses marks and saves on a book someone else holds live (`mustHoldBook` in `focus.mark` and `workbook.correct`).
  Drafts of his other books are never wiped by marks on one book (only drafts of corrected levels; others after 2
  days). Not covered: the Class page's correct sheet doesn't claim (it is refused while someone holds the book).
- **His paper:** name huge; **Later** (`workbook.levelDone`); **Marks** = Class's `Book` in a sheet; signed out (gone
  home, or never signed in): an amber line "Signed out: Evaluation and Theory don't see him" + **Sign him in**
  (`SignedOut`). **His books in one line** under his name (`BookRow`, `e34a29c`, another chat): a book button first
  (`.fc-units`, like + on the names row) opens the units sheet; then his books (`booksOf`: his book now dark, every
  book given and not finished, any other book with a level handed in = amber count), fixed order by unit number; one
  tap = `moveTo` (no dialog). Given books carry `work` and `done` (`bookState` in `convex/lib/backend.ts`). The unit
  chip and "Also handed in" are gone. The units sheet = `StageUnitSheet` (full page, `cls="su-sheet"`, `2b3e2cf`): Fighter |
  Master and **Move him | Books given**, then EVERY unit of his grade on one screen, no scrolling (Grade 8's 31 =
  12 rows of 3 fit 360 × 640), small pills "N Tamil" under TERM 1 / 2 / 3 dividers (term 0 = Extra). A pill fills as
  far as he got (`progress.student`: levels done of the book; colour = his marks % good/mid/low, blue = theory book),
  violet number = waiting for Evaluation, blue = for Theory, ✓ = book given, dark ring = his unit, dashed = no book in
  the app. Move him: one tap = `moveTo` → `students.move` with the unit's term (the new book opens once the board
  shows him there). Books given: each tap = `students.setGiven` (table `handouts`, per unit AND book: workbook or
  theory book; optimistic `flip`; the sheet stays open; history "book given / taken back"; it also refreshes his idle
  clock: a given book with work = not out of work).
- **Level bar** (`LevelBar`, one line, the open level in the middle): corrected by marks colour, handed in amber, draft
  dashed, his ringed, pre pale; a violet / blue dot = a corrected level whose lost marks still wait for Evaluation /
  Theory (`levelWaits`). The level opens by itself (`autoLevel`: his draft, else the oldest handed in, else his
  level); a corrected one opens to check or change (`remark`: "Save changes", "Back to Level N").
- One question on screen; the strip above it (`Strip`, theory book `FighterStrip`: every question, one line, the
  open one in the middle): number, the key's answer, one tap: the big button gives what is shown (full by default;
  NEVER "untouched = full"), a number gives that, "? blank" = dk; key parts: each part's marks or ? for that part
  (`dkp`); no key parts: a "part blank" toggle. Next by itself; taps within 350 ms ignored, Save lights after 700 ms.
  On a corrected level each lost question's box has **E** or **T** on its corner (`teachState`: hollow = waiting for
  Evaluation / sent to Theory, filled = explained / taught); the open question says it in words with the time
  (`TeachLine`).
  On a short phone the question (or the level's marks) scrolls itself into view between the pinned rows and the pad
  (`useCardInView`; a new student starts from the top).
- **Save → the next level opens** (`nextOpen`); after the last, `OverView` "Unit 8 finished": total, %, the marks
  table and one tap on (`nextBook`: the term's next workbook, else Legend, as Move). Summary: total, "?", lost
  marks → Evaluation | Theory (Evaluation unless picked), "Save <name> · 14 / 20"; no Undo toast.
- **Drafts** (`convex/focus.ts`, table `drafts`): every mark on the server 0.9 s after the last tap; any phone resumes;
  counts nowhere until Save. Theory book: doable questions in book order (`fighterQueue`), ✗ / ↻ / big ✓
  (`setFighterMark` → `marks.setMany`); no key ("Check his answer in the notebook").
- **Take back** (last 5 saves on this phone, `aristora.focus.saved`): a level → `workbook.uncorrect` (as before; its
  `level-marks` event deleted; refused after 30 min, if corrected again, or once explained / sent / taught; its marks
  wait 10 min for the right name); theory marks → `marks.restoreMany` (refused if changed since).
- Toasts take no taps; while a paper is open they sit just under the pinned rows (`--fc-stick-h`), at the bottom
  when a sheet is open. Switching pages keeps the open paper.

**Progress (top bar; owner + Reports).** One grade at a time (`aristora.progressGrade`); stage chips, "Came today".
**Units** = a race per unit and stage (levels done or solo questions done, then marks, then pace; rank colours,
green dot = came today, "3/8", marks %, level blocks or a fill bar, "+3 today", "3/day"). **Term** = students × the
term's units (furthest book per square; tap for details). Pace = per class day he came. **Share poster** (his call:
marks and ranking, after my warning; switches Marks %, Ranking, Only who came today): 1080 × 1350 PNGs, Tamil first;
Share = the phone's share sheet (WhatsApp), Save downloads.

**One student's sheet (31 Oct 2026, his ask: "the individual progress sheet I share on WhatsApp to the parents").**
Progress → tap any name (Units race or Term grid; also the names on the CEO page) → `StudentSheet`
(`src/studentSheet.tsx`, full page): his book now (bar, level, pace), attendance (days in the last 4 weeks, a 4 × 7 dot
grid Monday first, last came, hours, minutes a visit), his term's units (bar, done/of, %, ✓), this week vs last week
(levels, marks, days), teachers' help in 4 weeks (questions explained / taught, Evaluation visits, Theory lessons),
what waits now, best and weakest unit. Built by `buildModel` (`src/studentReport.ts`) from `progress.report` (owner +
Reports; read only while open). **Share with parents**: one 1080 × 1350 image, Tamil first (`drawReport`, the poster's
drawing helpers): header with the owl and his name, attendance grid, now + level bar, the term as unit squares (fill =
how far, ✓, ring = now), this week, optional rank, optional note, footer. Switches: Marks % (on), **Rank in his unit**
(off by default, his choice 31 Oct: "2nd of 3 on Unit 8" from the Progress race, `RankOf` reads `progress.board` only
when on), a note (never saved, wraps to 4 lines). Share = the phone's share sheet (`shareFiles`), Save downloads
`ARISTORA-<name>-<day>.png`.

**The CEO page (owner only, 31 Oct 2026, his voice note: "I want to think like a CEO").** A gauge icon in the top bar
after Progress (`ceo-btn`, owner only: per-teacher numbers and money). Built around his decisions, not every number.
Four tabs (`aristora.ceoTab`):
- **Now** (from the board every phone already has, no extra reads; `nowOf` in `src/ceoData.ts`): up to 3 advice lines
  (`adviceOf`: who has no work and which room can free them, Correction behind → "Evaluation is free: she can correct",
  Theory lessons waiting while Evaluation is free → Teach, a walk that never arrived, calls not sent); tiles in class /
  no work / running out; a card per room: what waits (levels / questions + students / students + lessons), minutes of
  work at the measured speed (else his guesses 3 min a level, 2 a question, 12 a lesson, marked "guess"), how long its
  usual people take to clear it, the oldest wait, how many have no work until then, with her / on the way; the no-work
  names (tap = his sheet); grades here; today so far.
- **Today** (the day's classes summed): the headline **idle minutes per student-hour** (under 3 good, 3–6 watch, 6+
  bad; the usual = the middle of the earlier days; what they waited for), tiles (came, student-hours, most at once,
  levels corrected/handed in/%, explained, lessons, answers marked, wait for Correction, walks that never arrived), each
  room's busy share as a meter (over 85% = the queue grows), the class every 15 minutes as three small bar rows on one
  time line (in class / no work / levels waiting; tap = one reading for that moment), each person (room, minutes busy,
  levels with minutes each, lessons, students), the last class days (idle bars + table).
- **Team** (the last 10 finished class days, `loadOf`): how sure (none / early < 3 classes or 15 student-hours / fair /
  good ≥ 8), what the team can carry (students at once at 80% busy, the limit room, students a day = at once × class
  length ÷ stay, average and busiest), a verdict per room (`verdictOf`: red "Needs another person" at 85% busy or 6
  idle min an hour waiting for it; amber "Near the limit" at 65% / 3; green "OK: room for ~N more at once"; the
  arithmetic "people × 48 ÷ need"; one more person: the new limit (`withOneMore`) and, with money, her cost in students'
  fees), Fighter vs Master teacher minutes per student-hour per room (+ idle, hours seen; "not enough of both" under 2
  student-hours each), speeds (a level, an answer, a question, a lesson, idle).
- **Business**: money (his 3 numbers once: average fee, a corrector's pay, a teacher's pay → fees from students still
  coming, the team's cost from the usual people per room, what is left, cost per student, fees at risk from students
  away 2+ weeks; `ceo.setMoney`, meta `ceo.money`, owner only); students (+joined, −left this month, grade × stage
  table); attendance (came this week, days a week each, slipping, 14-day bars); quietly leaving (`risksOf`: 14+ days red,
  7–13 amber, coming half as often as the 4 weeks before; tap = his sheet); learning (levels and marks this week vs last,
  units finished this month, levels checked at home, below 50% in 2 weeks); books (workbooks/units, keys, theory books
  per grade; "no workbook yet" for the next unit of students 70%+ through theirs); the family app (students with it).
- **How the numbers are made** (`convex/lib/ceo.ts`, `digestOf`, pure and tested): one class = its events, calls and
  visits. Teacher minutes per person: Evaluation/Theory = Arrived (else Sent) → Done of each call she finished (45 min
  at most; calls the class's end closed don't count), overlaps once, shared among the students with her; Correction =
  each level from its draft's first mark to Save (**`took` on the `level-marks` event, timed since 31 Oct 2026** in
  `workbook.correct`; untimed = 3 min, at most 12), a home level checked or a re-mark = 1 min, a theory-book answer =
  the time since her previous mark (90 s at most). A person counts in the room where she spent most minutes. Students:
  visit minutes, most at once, stage by what he worked on. Idle by what he waited for (two rooms = half each). The
  digest is kept in the class report when it ends (`report.digest`, v 1); the class going on and the 3 newest classes
  ended before digests existed are read again by `ceo.overview` (owner only, `fetchOnce` on opening and every 5 minutes
  while on screen, never a live query). Demo students never count.

**The test class (31 Oct 2026, his voice note: "create demo students accounts for test ... dilrash test ... same stage,
unit and levels ... and add extra demo accounts").** Test students are a class of their own on the same server
(`students.test`, with `demo` too): **only a phone showing the test class sees them** (`state.get({test})` sends a
phone one class's students and their calls; `progress.board({test})` too); the real class never sees them, and they
never count (reports `buildReport`, the CEO page, the Students numbers, the rooms' scores: `addStats` skips test
students, `calls.lessons` skips test calls `calls.test`, the 120 limit counts real students only). Owner only
(Settings → Students → **Test class**, `demo.ts`):
- **Copy Grade N's students** (`demo.copyGrade`): every real student of the grade (the Students page's grade row) as
  "Dilrash R test" (`testName`, `copyOf`): the same grade, term, stage, book now, every book's levels and marks
  (`progress` rows copied), books given (`handouts`), signed in now; again = they start over from the real ones.
- **Add the extra test students** (`demo.cases`): one for every situation of the Theory and Evaluation pages, named by
  it, with a note in the list (`testCase`): Grade 11 theory book: No work D, Starving D (25 min: D first), Soon D, Later
  D, Seen D (Theory had him today), In Eval D (in the maker's Evaluation room), Eval called (called by her), Home soon
  (goes home in 5 min), No work C, Ready 20, Fresh 21 (not ready), Stuck 19, Stopped C; Grade 7 workbook: Lost 4·9
  a/b/c (one pill), Lost 13 a/b, Lost 13·17 (Q13 with others, Q17 alone), Crowd 1–7 (Q2: 6 at most), All done 51 (no
  work), Theory 13·17, Theory 13 (Q13 ×2), Whole unit, Couldn't 4 (? on Q4, no work), Gone home (a level to correct);
  and Two books (two workbooks of one grade, Grade 8 first) when a grade has two. Again = they start over.
- **This phone shows: The class | Test class (N)** (`TestSwitch`, also in Settings → Account for any teacher while test
  students exist; `aristora.testClass` on the phone, `setTestMode` starts the board again). A phone in the test class:
  a striped pink top bar and **TEST** where the class clock is; the Students list shows test students (no Add form);
  End the session is hidden (it would sign everyone out). **Delete the test students** (`demo.remove({test})`: them and
  their calls, books, visits, books given, drafts and claims). They share the class's session: making them starts one
  if none is open (a class only test students used has an empty report and isn't listed in Reports).

**Moving a student.** Class → his name → Move: the usual next step in one tap (next unit, Master from the first unit,
next workbook, Legend, Exam Sprint, back after the sprint, next term, up a grade), or pick grade, term, stage and
unit. A teacher always confirms.

**Sessions.** The first student signed in starts one; it closes itself after 4 h with no activity (phones treat a
class quiet for 4 h as over: `liveSession`). "End the session" (Class, Correction job) saves the report: idle
minutes per student, workbook levels, waits.

**Alerts.** Correction (its page, and Class on a Correction phone) hears calls; Theory and Evaluation hear a knock
when a student runs out of work; Evaluation also hears pulls. One tap first (the amber banner). The screen stays on
(wake lock, or a silent video on old iPhones); a locked phone can't ring.

**Settings → Students.** (+ **Family**: the family app, above.) The grade row (6–11; `aristora.lastGrade`) filters the list and is the new student's grade.
Owner/Reports see: students now, added / removed this month, came in the last 7 days, not seen for 2+ weeks (tap →
names: "call the parents"; from 28 Oct 2026, `ATTENDANCE_SINCE`; rows red at 14+ days). Removed listed per grade.

**The family app (app.aristora.org, `8ee3b16`, another chat, his voice note of 30 Oct).** Levels done at home
made a pile for the corrector in class. Now the student does the level on paper, types its answers in the family app
on the family phone, taps **Check** once per level and sees ✓ / ✗ at once; the class sees his marks before he walks in.
- Its own tiny bundle (`src/family/`, ~16 KB over the wire; `scripts/build.mjs` stops the build over 50 KB), no fonts,
  no client library (Convex's plain HTTP API, `src/family/net.ts`). app.aristora.org → `/f/index.html` (`vercel.json`;
  also `/f/` on system.aristora.org); a service worker there only: it opens with no signal after the first visit.
- Words: Tamil first, no school words: a unit = a **World**, marks = **XP** (1 mark = 1 XP), his streak, this week's
  board in his grade. Only the level he is on can be played (the first with no record): the paper book is the truth.
- Join: Settings → Students → his name → **Family** (`FamilySheet`): a family link on WhatsApp (one use, 7 days); the
  family phones and Sign out; **Open every World** (else they open in order: his unit now, books given, levels done
  there, the next after a finished one). Books → a workbook: how much the phone marks and exactly what it accepts per
  question (`PhoneAnswers`, `families.answers`).
- The server marks with the uploaded answer keys (`convex/lib/phone.ts`): numbers, several numbers, answers in n (same
  values for n = 1..7), labelled answers (x = 52), "also accepted" notes. Names, yes/no with a reason, "show that",
  drawings and anything unclear stay with the corrector (a wrong ✗ on a right answer is worse). The answers never reach
  the phone (it gets only each answer's shape).
- A level checked at home is a marked level with ⌂ (`lv.home`): Evaluation and Theory see its lost marks at once.
  Correction: ⌂ on his name and the level; it opens with the phone's marks: **Checked** (`workbook.homeChecked`), or
  change a mark / mark what the phone left (that checks it too, `lv.hc`).
- Family phones have their own tables (`familyLinks`, `familyDevices`: SHA-256 of code and token) and hash tag: they
  can never pass a teacher's check; every function in `convex/family.ts` checks the family phone. The teachers' side
  (`convex/families.ts`) = the owner or a teacher with Students.

## Accounts and security (built 2026-10-28)

**Who.**
- One owner and teachers.
- Teachers get jobs (`correction`, `theory`, `evaluation`; People shows them as "Jobs" with what each opens) and
  extras:
  - `students`: add, rename, remove;
  - `books`: workbooks (typing and uploading) and unit names;
  - `reports`: Reports, History, the Students page numbers, and **Progress** (page and poster).
- Everyone signed in sees Class. Correction job = the Correction page and Attendance (`setPresent`, `attendance.day`;
  `by: "attendance"`), Books given (`students.setGiven`), sending called students, Going home, Back in the hall, End
  the session. `progress.student` (the unit sheet's numbers) = Correction, Evaluation or Theory.
- Workbook permissions: `correct`, `uncorrect`, `levelDone`, `toTheory`, `reteach`, and Correction's drafts
  (`focus.drafts`/`mark`/`drop`) = Correction or Evaluation; `explain` = Evaluation; `taught` = Theory or Evaluation.
  `calls.lessons` = Theory; `calls.keep` = Evaluation.
- Owner-only: People (user management), demo students, the test class, and the account lines of the history (sign-ins, PINs,
  links, people changes).
- The permission names are `Perm` in `convex/lib/auth.ts`: jobs, extras, `"owner"`, `"any"`.

**Signing in.**
- The owner set up once with a one-time setup code (2026-10-28). That code is spent.
- The owner adds a teacher in Settings → People, "Send on WhatsApp": the link `/#join=<code>` works once, for 24 h;
  that phone stays signed in; then a 6-digit PIN, the backup for signing in on another phone.
- 5 wrong PINs lock the PIN for 15 minutes, doubling up to 24 hours. Weak PINs (123456, 111111) are refused.
- The owner can sign out any phone (it drops to the sign-in screen at once), clear a PIN, or remove a teacher.
- A phone unused for 120 days signs out by itself.

**Mechanics.**
- The browser makes the keys with `crypto.getRandomValues`: a 32-byte token per phone, a 16-byte link code.
  The database stores only SHA-256 (`convex/lib/sha256.ts`, pure TypeScript). A token must be 40–128 characters.
- Why the browser makes them: random numbers in Convex queries and mutations are seeded, not secret.
- PIN hash = sha256(`aristora:pin:<userId>:<pin>`).
- `src/backend.ts` adds `token` to every call. Every public function takes `token: v.optional(v.string())` and
  first calls one of:
  - `await viewer(ctx, args.token, ...perms)` (queries);
  - `await actor(ctx, args.token, [perms], args.by)` (mutations). It checks `by` is one of the person's jobs
    (only when `by` is a job name) and remembers who, so `log()` writes `who` on every history line.
- Open on purpose: `auth.me`, `auth.setupOwner` (only while no account exists), `auth.peekLink`, `auth.useLink`,
  `auth.signInPin`, `auth.signOut`, `clock.ping`.
- The CSP (`vercel.json`): `img-src 'self' data:` (no `blob:`): show generated images as canvases, not
  `<img src=blob:>`.
