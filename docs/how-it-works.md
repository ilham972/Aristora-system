# How the class works: every screen and rule, as built

The technical memory of the app, kept with the code and updated in the same commit as the change it describes (moved here from the aristora-system skill on 31 Oct 2026). "Section N" means the skill's section N (0–4 his rules, 6 accounts, 7 status, 8 open questions, 12 decisions) or these files: 5 = `how-it-works.md`, 9 = `map.md`, 10–11 = `making-changes.md`.

**Students.**
- Each student has a grade (6–11), a term (1–3), a stage (`fighter|master|legend|sprint`) and a unit ("his book
  now": the one Correction last opened). **He works on several books at once** (`ce6fe9d`): every book with
  something waiting reaches the rooms (below, "Several books").
- `back` remembers where to return after Exam Sprint.
- `present` is set in Attendance (or by demo load, or the simulation's steps); `lastInAt` = his last arrival (home time = +2 h on the
  Theory page); `archivedAt` = when he was removed (for "removed this month").
- `room` is set while he is with Theory or Evaluation.
- `idleSince`/`idleMs` count out-of-work time; `idleReason` = what he waits for (`correction`, `evaluation`,
  `theory`, joined with +).

**Top bar and tabs (`c360fa3`; Correction moved to the bottom bar in `0e4446b`, his call; the Class tab 3 Nov 2026).**
- Top bar, left: the **Register** (list icon, everyone; it was called Class until 3 Nov 2026, no badge since: its
  count moved to the Class tab), Progress (owner + Reports), the Owner page (owner), **Consultation** (owner + the
  Consultation tick, 5 Nov 2026; its corner count = her consultation's students), the whiteboard (Theory, Evaluation:
  Whole class). Five icons (the owner) fit 320 px with `.top-left.five`. Right: `TopStat`, one capsule = people icon + how many in
  class, the class clock, the link dot (a tap opens Attendance for Correction and the owner), then Settings. No logo,
  no titles. ≤400 / ≤345 px rules; `topFits()`.
- Bottom tabs: **Class** first, for everyone (3 Nov 2026, his call: the Manager page moved here from its button on the
  Correction page, named Class so nobody is shown as "Manager"; the floor-plan icon `ClassMark`; its red count = in the
  hall with no work; below, "The Class tab"), then the jobs the person has: **Correction** (square mark; its count =
  papers handed in, amber, red when someone has no work until marked; the code calls the page `Focus` and stores the
  role as "focus"), **Theory**, **Evaluation** (red count = students with no work waiting for that job). A badge shows
  only while the phone is elsewhere. Four tabs fit a 320 px phone (14 px words, 12.5 px at ≤345). Where a phone opens:
  what it showed last (`aristora.role`: "hall" = the Class tab, "focus", "theory", "evaluation", "class" = the
  Register); nothing kept: a manager (or the owner) on the Class tab, everyone else on her first job's tab. The Register
  just opens (`goRegister`); Settings/Progress go back to `backTo`.
- The job decides the taps, the alerts and `by`: the bottom tab = that job; the Register and the Class tab = the job
  this phone used last (`aristora.job`), else the person's first; a manager's taps on the Class tab are `by: "manager"`.

**Attendance** (a full-page sheet since `3bce3bd`, `AttendanceSheet`; owner + Correction job): from Correction's +
(the grade picked there, no grade row: `only`), the count by the clock or Class's "Sign students in" (grades 6–11
in one row, "here/total", `aristora.attendanceGrade`). That grade's students as pills A–Z, never moving: white = not
here, green = here (✓ + arrival time), grey dashed = went home today. Tap white → signed in, toast with **Undo**
(deletes the visit; `setPresent` `undo`, 5 min). Tap green → "Sign out: going home" / Keep (within 5 min also
"Signed in by mistake? Take it back"; a sheet over the sheet). Calls strip there too. Every visit = a row in
`attendance` (`day`, `inAt`, `outAt`, `sessionId`), closed by sign-out, End the session, a class left open, or
removing the student. **Several at once (2 Nov 2026, his ask; he overruled the old "no sign in everyone" after the
warning):** at the bottom, **Sign in all** / **Sign out all** for that grade (from +) or **Sign in everyone** / **Sign
out everyone** (from the count), each with how many. Sign in = `SignInMany`: a list with every name not in ticked
(those gone home today not ticked; per grade "Tick all / Untick all" in the whole-class list), she unticks whoever
isn't in the hall, "Sign in 12" = `students.setPresentMany` (each exactly one `setPresent`: a real visit; removed and
already-in skipped; at most 200), toast with **Undo** (`undo`: as if they never came). Sign out all (a grade) = a
sheet naming them, then `setPresentMany` false (visits close, calls end, the class goes on). **Sign out everyone =
End the session** (`sessions.end`: the report is saved), except on a simulation phone (its students only). The risk
he accepted: a name ticked who isn't there hides a student who stopped coming and turns red on Theory/Evaluation;
the list (not one blind tap) is the guard. Class, Theory and
Evaluation show **only signed-in students** ("Nobody is signed in yet"); gone-home students with levels to correct
stay at the bottom of Class and Evaluation ("Correct L3").

**The Register (top bar list icon, everyone's view, `c360fa3`; called the Class page until 3 Nov 2026).** `src/correction.tsx` `ClassPage`.
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
  G11-U13 too: marks on questions no longer in the book are ignored by `computeStatus`). **Since 3 Nov 2026 every
  tute goes to OL** (see OL below): the upload never files one under a school grade again.
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
Correction's Fighter card, Evaluation and Theory's teacher questions (`CardAnswer stage` in `src/qcard.tsx`); without
one: "Check his answer in his notebook" (no fetch). Books page **K** = every book of the unit in the app has its key.

**OL: the O/L books (1 Nov 2026, his O/L tracker sheet).** A "grade" of books, not of students: grade 12 shown as
**OL** (`OL`, `gradeName`, `gradeWords`), its 53 topics seeded once from his sheet (`setup.ensure` step 4,
`DATA_VERSION` 2; keys `OL-U01`…`OL-U53`), a unit's `term` = its paper part (1 = Paper I A, 34 topics; 2 = Paper I B,
7; 3 = Paper II A, 6; 4 = Paper II B, 6: his Paper 2's 12 split as the exam's questions 1–6 / 7–12), numbered as on
his sheet (`olNumber`; Paper 2 runs 01–12). Why: a school unit mixes O/L topics (G11 U13 Equations = quadratic +
simultaneous), so O/L essay tutes file under an OL topic (tute.json `"grade": "OL"`; its papers' part must be the
topic's: the upload row and `saveTute` refuse otherwise). Books page: OL after 11 (`BOOK_GRADES`, `.grade-row.g7`),
topics by part. **OL books are for Grade 10 and 11 students** (his rule: OL is "universal" for both; a Grade 10
student stays Grade 10): `setGiven`, `move` and `giveAllOl` accept an OL unit only for them (`checkOl`) and keep his own
grade and term. Correction's units sheet (Grade 10 and 11 students): **OL books ›** at the right of the first section's
line (no extra height: a grade still fits one screen) shows the four parts; there, Books given
has **Give him every OL workbook in the app** (`giveAllOl`: only books in the app, because a given book with nothing
in the app counts as work and 53 of them would hide him from "out of work"; tap again after new books come). Theory
and Evaluation group OL books under an **OL** grade pill (`EVAL_GRADES`/`THEORY_GRADES` + 12; seven fit 320 px). Not
yet: OL in Progress (his OL books are not in his grade's race), in the family app (`worldsOf` = his grade's workbooks
only) and in Class → Move's own picker (Correction's units sheet moves him).

**Every O/L tute is an OL book (3 Nov 2026, his Constructions stuck on Grade 11).** The essay engine (ol-essay skill
§14, `Tute.app_book()`) still writes `"grade": 11` and a Grade 11 unit number, and refuses any other grade; the app's
upload filed every tute under that school unit, whatever grade the Books page showed, and nothing could take a book
off a unit. Now:
- **The upload files a school-grade tute under OL** (`tuteRow` in `src/upload.tsx`): the OL topics of its papers' part
  (`olChoices`: IIA or IIB, six each) as chips (`OlPicks`), the one whose names fit preselected (`olMatch`: English
  whole words, "Sets" in "Sets and probability"; Tamil endings, "அமைப்பு" in "அமைப்புகள்"; scores summed, a tie = no
  pick). Nothing fits, or two fit as well: the row is **pick** ("Which OL topic is it? Tap it below") and isn't saved
  until he taps one. A tap wins over the match; a topic of another part is never taken. A file that says `"OL"` goes
  to its code, no chips. Rows show his sheet's number: "OL · 08 Constructions · topic tute".
- **The same tute left on its school unit by an older upload** (the file's own grade + unit, a tute workbook of the same
  part and title) is moved first (`moveFrom`: "↪ Takes it off Grade 11 · U23 Constructions: its students' work comes
  too."), then the file is saved over it as any re-upload.
- **`catalog.moveTute({unitId, toUnitId})`** (Books permission): a tute from any unit to an OL topic of its part, with
  everything: both books (`tute` kept), keys, printed questions, CSS, and every student's work (progress rows,
  `students.unitId` and `back.unitId`, handouts, drafts, calls; claims dropped: the corrector's phone claims again). His
  grade and term stay. The OL topic has the tute already: its books stay, the other copy goes. Refused before anything
  changes: target not OL, another part, the target holding a non-tute book, no tute on the source, or a student with
  work in both copies (names). History `book-move`. Returns `{students (real ones), kept}`.
- **Books page → a unit's sheet** (`MoveTute` in `src/settings.tsx`): a school unit holding a tute opens with "This is
  an O/L tute: move it to OL" (chips, its topic preselected, Move → "Yes: move it to OL · 12 …"); an OL topic holding
  one has "Wrong topic? Move this tute" under its theory book (a wrong tap is never for good). An OL sheet's title is its
  sheet number ("OL · 12").
- A school unit's term-test workbook that a tute upload had replaced before is gone for good: upload its zip again.

**Questions as printed (31 Oct 2026).** Every upload also cuts each question card out of the zip's book.html
(`src/bookQuestions.ts`: tutes `qq` = Fighter, `pq` = Master; workbooks `si`/`pq` per unit, split at the marks
sheets; the printed number = the card's `qn`; footers and side tabs out) and the book's CSS (fonts, `@page` and
`@media screen` out), cleaned (`cleanHtml`), saved after the book in ~600 KB saves (`catalog.saveQuestions`: the first
takes the old ones away; the server refuses anything that runs, loads or posts: `unsafeHtml`/`unsafeCss`). Own
tables `questions` (unit, stage, q, html) and `bookCss`, `books.qCount`; gone when a re-upload changes the book's
questions (`bookShape`). Read one at a time (`catalog.question`, `catalog.bookCss`) under Correction's, Evaluation's
and Theory's question card: a small page icon in the card's top line (Correction since 2 Nov 2026, Evaluation and
Theory since 3 Nov), only when the book has its questions (`useQuestionShown` + `QuestionIcon`, `src/bookQuestion.tsx`;
stays open from question to question); teaching mode shows it big (below). It draws it in a **shadow root** (the book's `.qn .band .sq`
never meet the app's), cleaned again (`safeFragment`), figures and tables wider than the phone zoomed down, working
space hidden. Books page **Q** = every book has its questions. Old zips: upload them again once (no new chat).

**Theory page (one screen, 31 Oct 2026, his voice note "rebuild the theory page also same like this": the Evaluation
page's layout; `src/theoryFocus.tsx` `TheoryTab`, rules in `src/theoryFocusData.ts`).** No Room button, no Lessons
list: one page, small things in fixed places like Correction. It reuses the Evaluation page's pieces (`.evx-*`, the
shared `src/roomkit.tsx`) in Theory's blue (`.tpx-page`).
- **Pinned:** grades 6–11 in ONE row (`GradeRow`, `theoryGradeRow`) and Fighter / Master / Legend (`KindBar`,
  `theoryStageRow`, `THEORY_STAGES`; Legend pale until its books exist), **in fixed places** like Correction (1 Nov
  2026, his call after "a car whose pedals move"): the 1st, 2nd and 3rd most urgent (`byUrgency` + `withRanks`)
  outlined red, orange, yellow (`.pri1`–`.pri3`); the most urgent already picked; she can pick anything. Counts = everyone who needs Theory, each once; held students (in Evaluation, called by her,
  going home) count but never as urgent (`rowHeat`). Which grade, stage and unit are picked: **her room's book**, the
  same rule as Evaluation (`theoryRows`, `src/roomRows.ts`, below).
- **Under them:** the units that need her (`theoryUnitRow`, `.evx-u`: number + Tamil, red line = no work; the most
  urgent first, holding still 5 s after her touch: `useHeld`), then the
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
  you?" at 20 min) + Clear ↔ Page's pick. Right of it: **Call N**, **Arrived N** (only those Correction SENT: one
  called but not sent, or one who came early: tap his name, then Arrived; 1 Nov 2026), **Done N**
  (those with every question decided: `tAllDecided`).
- **What to teach** (`theorySquares`): Correction's squares, each question ONCE for everyone with her who needs it
  ("D·23 ×2"): one lesson after another (the most students first); a section's teach questions in book order (they
  build on each other), a workbook's the most shared first, the whole unit last. Nobody here yet: those on the way;
  nobody called: the picked lesson's (to prepare). One at a time, **Correction's card** (3 Nov 2026, his ask;
  `CardHead` in `src/qcard.tsx`): one top line = the number as a dark pill, the section's letter and Tamil title or the
  unit (`.tpx-what`), teaching mode's whiteboard icon and the printed question's icon; under it who needs it
  (workbook: "Malik 0/2 · Evaluation 12m" = what he got and who sent it); then **the answer big** (`CardAnswer`:
  a workbook's key, a theory book's when its key is in the app; else "The teacher's question of his book: teach it,
  then the next."). **Fixed at the bottom** (`.fc-pad`): **Not reached** and the big **✓ Taught** ("for 2"):
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
- **Pinned rows, the most urgent already picked** (`byUrgency`: most red, then most waiting; ties keep the natural
  order). She can pick anything; a pick lasts while it has someone. **Her room's book** (the rule of both pages,
  `src/roomRows.ts`): see "The rows show her room's book" below. (1) **Grades 6–11** in ONE row, all six, **in fixed
  places** (1 Nov 2026, his call: "a car whose pedals move"; `gradeRow` keeps the urgency order for the page's pick,
  `GradeRow` draws 6 to 11): number, count, red badge; the 1st, 2nd, 3rd most urgent outlined red, orange, yellow
  (`withRanks`, `.pri1`–`.pri3`); pale = nothing for her. (2) **Fighter / Master / Legend** in fixed places too
  (`stageRow`, `EVAL_STAGES`, the Theory page's `KindBar`, the same outlines; Legend pale: no books yet). (3) **Units**
  that need her: number + Tamil name + count (`unitRow`, `.evx-u`, red line = no work), the most urgent first, holding
  still 5 s after her touch (`useHeld`). (4) **Question groups** (`qGroups`, `.evx-qg`): questions waiting for exactly
  the same students make one pill ("13 · 17", "×2"), red first, then the most students, holding still the same way.
  Theory busy (`canTeachHere`, any grade): **◎ Teach N** at the end of that row, never the page's pick (1 Nov 2026:
  one tap took students Theory was about to call; she taps it, then they are ticked). Above them, when it happens: the bump note and the pull banner (**Send to Theory**).
- **Her room box** (`.evx-room`, left ~¾): her students as pills (`.evx-sp`): with her solid (`s-in`; ✓ green when all
  his questions are decided: `s-done`; ◎ teaching theory: `s-th`), on the way dashed (`s-walk`, minutes), called
  dotted (`s-call`), late red (`s-late`), amber ring = Theory wants him (`s-pull`); then the picked group's students
  (`s-sug`): ticked = dark ✓ (the page ticks red and orange ones, as many as fit; never one going home within 15
  minutes, `leavingAt`/`LEAVING_MS`: his pill says "home 5:10"), grey = unticked. Its line: lock icon + "2 with you ·
  1 coming · room for 3" (amber "Still with you?" at 20 min) + Clear ↔ Page's pick (the words shorten, Clear stays).
  With someone with her, "room for 3" gives way to **"free ~6m"** (1 Nov 2026, his pick: `src/evalPace.ts`): every
  question still open for someone with her once, and those on the way, at HER pace, learnt on her phone
  (`aristora.evalPace`: the time between her Explained / → Theory taps or since Arrived, 15 s–10 min, the middle of
  the last 20; 3 min until she has 3). Free within 4 min, nobody on the way, someone ticked: **"· call now"** in amber
  and the Call button ringed amber (`.evx-call.ahead`): they walk in as she finishes. Right of it, in fixed places:
  **Call N** (or Teach N), **Arrived N** (only those Correction sent, as on Theory), **Done N** (those with every
  question decided: `allDecided`; `calls.finish` for all of them at once).
- **The same mistake by 4+** (`SAME_MISTAKE_N`, a workbook group of 4+ waiting students, 1 Nov 2026, his pick): the
  card (to prepare) says "7 lost Q2: teach it once in Theory?" and **All 7 to Theory** sends those questions to Theory
  for all of them (`workbook.toTheory` each); Theory's page shows them as one lesson ("2 ×7"). The owner's Owner page,
  Now: **Lost by many now** (`hardQuestions`: a book's question lost by 3+ students in class, waiting for Evaluation
  or with Theory, the most first, top 5).
- **The questions** (`sessionQs`): Correction's squares (`.fc-strip .fc-sq`): each question ONCE for everyone with her
  who has it, the most shared first (×2); one per BOOK (key `bookKey:q`: a unit's theory book and its workbook each
  keep their own Q22; with both on screen the theory book's squares carry the section letter, "C·22"); before anyone comes, the picked group's (to prepare). One question at a
  time, **Correction's card** (3 Nov 2026, his ask; `CardHead` in `src/qcard.tsx`): one top line = the number as a
  dark pill, who has it with his marks ("Vimal 0/2", `.fc-qmeta.evx-who`, two lines at most), teaching mode's
  whiteboard icon and the printed question's icon; then **the answer big** (`CardAnswer`: `catalog.key` while open,
  fitted like Correction's; theory books without a key: "Check his answer in his notebook."). **Fixed at the bottom** (Correction's
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

**Teaching mode (Theory and Evaluation, 3 Nov 2026, his ask: teach from the whiteboard looking at the phone instead
of walking to his book; `TeachMode` in `src/qcard.tsx`).** The whiteboard icon on the card's top line (`.fc-tmb`, in
the room's colour) opens the question full screen (`.tm`, z-index 40: over the top bar and the tabs, under sheets and
toasts): on top the book (`LessonName`: grade, unit, Tamil; a theory book's section: "13·D" and its Tamil title) and
Done N when everyone with her is decided (sends them back like the page's Done; with nobody left it closes); the
page's own squares; the card: the number pill and who has it, **the question as printed** (`PrintedQuestion`, the
shadow root zoomed ×1.25, ×1.12 under 340 px; a book without its questions in the app: "look at his book", and the
owner uploads its zip again), **the answer big** (up to 72 px), the page's notes; at the bottom **the page's own
buttons** (Explained / → Theory / Not now; Taught / Not reached): a tap = the same decision for everyone with her, then
the next question, so nothing has to be tapped twice (his first idea, a Next button only, would have left every
question undecided and Done dark). Nobody with her yet (getting ready): only **Next question ›** (the next square;
none with one square). The page's card and pad step aside while it is open; the phone's Back closes it (one history
step, `popstate`), so does ×; it closes by itself when nothing is on her screen. Not on Correction (his call: the book
is in her hand, and a corrector who teaches makes the queue longer).

**Whole class (3 Nov 2026, his ask: "if I am going to teach Grade 10 all students"; `src/wholeClass.tsx`
`WholeClassPage`, rules `src/wholeClassData.ts`, server `convex/teach.ts`).** The top bar's whiteboard (`.teach-btn`,
`page === "teach"`; Theory or Evaluation teachers and the owner: `canTeach`), a page like Theory's: nobody is called,
everyone stays at his desk, she teaches at the board.
- **Rows:** grades 6–11 and OL with how many are here (every grade can be tapped: `GradeRow open`); Fighter / Master =
  the grade's theory books / workbooks in the app (pale when none: `KindBar` `open`); the units with that book in the
  app (how many here are on each); its **sections with teacher questions** (theory book) or its **levels** (workbook),
  each with how many here it is for. The page opens on the grade most are in (then what she picked last, kept on the
  phone: `aristora.wholeClass`), the stage most of them are on, the unit most are on, the first section someone still
  needs / the level with the most waiting; that pick **holds once on screen** (a level "with the most waiting" changes
  after every tap: it jumped away mid-lesson in the first run-through).
- **Who** (his pick when asked: only those on that book count): everyone here in that grade (OL: 10 and 11) as pills
  (`teach.roster`, live). **Ticked by the page** = it is his book now (or given) and the section isn't all taught for
  him / something of that level waits for him (lost marks waiting for Evaluation or Theory). Pale green = done already
  (the line counts them: "6 ticked · 3 taught · 9 here"; no word on every pill); pale dashed = nothing to save for him
  (no book, or nothing of that level waits); a word only where he isn't on this book ("on 14"). She can tick anyone who
  has the book (one who moved on, a new joiner put on an earlier unit is on his own unit: nothing taught before he
  came counts for him, marks are per student); a tap on one without it says he can listen, nothing is saved. Clear ↔
  Page's pick. The first Taught keeps whoever is ticked for the rest of that lesson.
- **The lesson:** Correction's squares (×N = for how many ticked; ✓ = done for them), the card (the dark pill, the
  section or level, the answer big from the key, the printed question's icon and teaching mode: `TeachMode`), and the
  big **✓ Taught for N**: saved at once (`teach.taught`) for each ticked student it changes something for, then the
  next open question; the toast's **Undo** puts back exactly what that tap changed (`teach.untaught`: a "skip" stays a
  skip). Nothing left on a question: **Next question ›**. What it saves: a theory book's teacher question = taught (the
  section's own questions open for him, as after a Theory lesson); a workbook question waiting for Theory = taught,
  waiting for Evaluation = explained. Each changed student: a `board` history line ("Q23 taught at the board (whole
  class)"), seen by that room today (no "no teacher yet" dot), her score +1 question; the page's first tap of a lesson
  (`lesson`: another lesson, or 12 min since her last tap) +1 lesson and the students taught (Theory) / seen
  (Evaluation). Her taps count as Theory when she has it, else Evaluation.

**Consultation (5 Nov 2026, his voice note: "sometimes we have to call some student from the hall and teach that one
student only ... the student list of the pending evaluation, the count of each student ... more questions wrong come
first ... how many pending still we have, and how many today ... the system suggests the priority order but still I can
call anyone I want ... not for everyone: the people I pick in Settings"; `src/consult.tsx` `ConsultPage`, rules
`src/consultData.ts`, server `convex/consult.ts` and `calls.create` with `consult`).** The top bar's people-and-bubble
icon, left of the whiteboard (`.cx-btn`; the owner and the **Consultation** tick in Settings → People, `consult`); a
corner count = her consultation's students while she is on another page. What existed (the Class tab's send to
herself with "I'm teaching", her Evaluation page) is the machinery; this is HER list and one page for the whole sitting.
- **Pinned:** Evaluation | Theory in fixed places (`KindBar`, both always open), each with today's count and a red
  badge = students with no work among them; the pick is kept on the phone (`aristora.consultKind`). Under them **Today
  N · M students** (the students here, live) and **All N · M** (+ every student not here: `consult.totals`, read on
  opening, every 3 minutes and after Done; a class left open since an earlier day counts nobody here). Evaluation =
  questions waiting to be explained (wrong answers, lost marks not explained nor sent to Theory), all his books;
  Theory = a workbook's questions sent to Theory + the whole unit as one, a theory book's next section's teacher
  questions (his book now only, as on the Theory page) (`convex/lib/consult.ts`, the same on the phone and the server).
- **The students here** as one row of pills (`.cx-nm`, Correction's names look), **his order** (`consultRows`): the
  most waiting first (ties: no work first, then here longest, then A–Z), with the count; a **red ring** = no work at all
  (his order stays: the ring makes him see the idle boy); **pale** with her name = another teacher called him or has
  him (not callable: a toast says so), after the ones he can call; then everyone with nothing waiting (a **check-in**:
  "is that student well or not"), the one not seen in a consultation for longest first (`students.consultAt`, set by
  Done). Her consultation's students are in her room box instead. The row holds still 5 s after a touch (`useHeld`).
- **Tap = tick** (6 at most with her: `EVAL_CAP`, counting called and on the way); the ticked show in her room box
  (`.s-sug.on`) and their questions open below to prepare (pad pale). **Call N** = `calls.create` `consult` (the
  evaluation room, kind = the pill; any student here, nothing has to wait; refused while another teacher has called him
  or has him). **Correction's phone says only her name** (his answer: "Kumar, go to Ilham.", `callPhrase` `consult`;
  3 minutes: "Kumar hasn't reached Ilham.") and its strip says "Ilham · Consultation" with Sent. Then **Arrived** (those
  Correction sent; one who came by himself: his pill → Arrived), **Done** (everyone with her; one alone: his pill →
  Done: back to work). Nobody bumps, pulls or sends a consultation: Theory, Evaluation and the manager are refused
  ("is called to Ilham (consultation)"); never in the rooms' score; his Evaluation room never shows it
  (`evalRoom`/`evalItems` leave `consult` calls out); the Class tab shows him "with Ilham" (her room) as for any call.
- **The sitting:** their questions as Correction's squares (`consultQs`: each once for everyone with her who has it, all
  their books, "8·13" when two books show), the card (who has it with his marks, the answer big, the printed question,
  teaching mode), and the pad fixed at the bottom: Evaluation **→ Theory · Not now · ✓ Explained**; Theory **Not
  reached · ✓ Taught**. **Each tap is saved at once** (`consult.mark`, his rule "everything saves live"): for everyone
  with her on that square; the same tap again = back; another decision first takes the old one back; then the next
  open square. Saved: a workbook's `x` (explained), `th`+`tb: "consult"` (→ Theory; Explained and → Theory switch),
  `tt` (taught), the whole unit's request cleared (`wu`, the old one kept for the undo); a theory book's wrong answer →
  explained (keeps how many times wrong), → Theory = explained + its section's teacher questions open again (as
  Evaluation's Done does; the undo puts them back exactly from `was`), a teacher question → taught. Not now / Not
  reached is this phone's only (`useRoomDecisions("consult")`: the question stays waiting for the teachers). Only for
  a student with her (Arrived); an undo only of what this consultation did (`since` = the call): what someone did
  before stays. What she did stays on screen as ✓ / T / – (`bookQs`: waiting now, or done since the call), so nothing
  jumps; switching to Theory with him here teaches his theory in the same sitting (Q13 she just sent → Theory is his
  to teach).
- **Done** = `calls.finish` (nothing more to record): `done-consult` in the history with the minutes, `consultAt`,
  `seen.evaluation` (no "no teacher yet" dot). What she didn't reach stays for the Evaluation and Theory teachers.
- History: "called for a consultation", "Q4 explained in consultation", "Q13 sent to Theory in consultation", "taught
  in consultation", "… undone", "consultation finished" (`by: "consult"`). A picked teacher's consultation time counts
  as her working time on her card (it is a call with her as the teacher); the owner is never in those numbers.

**The rows show her room's book (Theory and Evaluation, 31 Oct 2026, his screenshot).** The bug: Raza and Umair
(Grade 9 fractions) were with Evaluation, but the rows said Grade 8 unit 1, Grade 9 was pale and could not be tapped,
and the room box offered Grade 8 students next to them. The rows were built only from who WAITS (`candidates`,
`planLessons` skip anyone called); calling everyone of a book took that book out of the rows, so "with someone in her
room the page picks his book" failed exactly when she had called them all, and the page fell to the most urgent grade
while the questions on screen were still her room's. The rule now (`roomRows`, used by `evalRows` / `theoryRows`):
- Her room's books (the books of the questions on her screen: with her, else on the way) are ALWAYS in the rows:
  their grade and stage never pale, a unit nobody else waits for is added at the END of the unit row (nothing shifts);
  "your room" for a screen reader (the violet dot of 31 Oct went on 1 Nov: he found it ugly and unclear).
- With someone in her room, the page's pick = the book of the question on her screen (two books in her room: tap a
  square of the other book, or a decision moves on to it, and the rows go with it).
- Her own pick (to find who to call next) lasts while it has someone. While she looks at a book that isn't her
  room's, the squares and the card are that book's picked questions (to prepare, the pad pale), never her room's
  under another book's name, with **Back to your room** (`BackToRoom`) in the card. Call, Arrived and "keep him" end
  her pick: the rows show her room again, unless she picked something else while the server answered (`follow(since)`:
  a tap on the next grade right after Call used to be wiped). After Done empties her room: the most urgent.

**Her taps are kept on her phone until Done (Theory and Evaluation; the audit, 31 Oct 2026).** Explained / → Theory /
Not now and Taught / Not reached lived only in the page: the app shows one page at a time, so opening Class, Settings
or another tab, or the page loading again (Chrome drops a tab in the background), lost them, and "All explained" in his
file then marked as explained even the questions she had sent to Theory. Now `useRoomDecisions` (`src/roomDecisions.ts`)
keeps them in localStorage `aristora.dec.evaluation` / `.theory`, per CALL (a new call starts empty), dropped at Done
and 12 hours after a call ends; memory when storage is refused. This phone only (another phone doesn't see them).

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

**A printed question's side figure** (5 Nov 2026, his Preview: G8 U01 Q48 and Q50 showed no figure): the engine
prints a Part I figure beside the text (`.si .sih` a grid: number, text, `.sif`). On a phone it takes its own row across
the card (`PHONE_CSS` in `src/questionView.ts`: `grid-column: 1 / -1; grid-row: 2`): placed by its column alone, it went
beside the text again once the family app hid the printed number, in a column 0 px wide, and the card cut it off.

**A phone with an old copy (5 Nov 2026, his "I can't upload this").** A page left open keeps the code it loaded,
for days (the offline banner even says "Don't close this page"): his phone still had the night before's copy, whose
upload reader didn't know reasons, and refused the U01 v5 zip the new app takes ("Question 62: an answer kind the app
doesn't know"). `src/appVersion.ts`: a page names its code and style (`[name]-[hash]`), so `newerOnline(page)`
compares the names this copy runs (`versionIn(document)`) with the page online (fetched with no cache; false whenever
it can't tell). Each time the page comes back to the screen (`watchUpdates`): away at least a minute → it looks; a
newer version → **the banner under the header** ("A new version of the app is ready. Tap here to update.", `UpdateBanner`
in `app.tsx`, waits for unsent taps); away at least half an hour with nothing to lose (online, no tap waiting, nothing
typed, no sheet open: `busyHere`) → it loads the new one by itself. Never while she is on the screen. **The upload
sheet** looks too, while the zips are read: older → "This phone has an older copy of the app" and **Update the app**
in place of Save (nothing is saved from an old reader); the page loads again on Settings → Books (`updateNow("books")`,
`takeReopen`: a one-time note in sessionStorage). The family app the same, only after half an hour away and with no
banner (its drafts and place are kept; `sendingNow` in `net.ts`: no Check or photo on its way); its check lives in its
later parts (`parts.ts`), out of the first load's budget.

**Correction page (ex-"Focus": `src/focus.tsx`; one page since `0e67580`, one-line rows since `3bce3bd`).** Kills his
two errors: marks on the wrong question and on the wrong student. Meant for the paid corrector.
- **Pinned under the top bar** (`.fc-stick`, with the calls): the names row and the grades; the paper scrolls under
  them. Names row: **+** first, always in the same place (that grade's Attendance, full page), then the grade's tiny
  pills A–Z in ONE line that scrolls sideways (`HRow`, `src/hrow.tsx`): the open one dark and kept in the middle by
  itself; faded edges = more; a red/amber dot on an edge = someone who waits is hidden there (`data-u`). Tones: red =
  no work until corrected, amber = handed in ("2" = levels, all his books), blue edge = theory book, dashed ring =
  marked part of the way, grey dashed = gone home with levels to correct. No grade in yet: "Nobody from Grade 11 is
  in yet: tap +". For the owner and Photos people, **⌂** after + (always there for them): the photos from home, in a
  lane of their own (5 Nov 2026: "Marking them: Correction's ⌂ lane", under "Corrected at home"); the hall's names
  never light up for a photo.
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
  **A topic tute's two books go together** (1 Nov 2026, his ask: "master and fighter answers when I switch"): both
  books saved by a tute upload carry `books.tute`; his books row always shows the twin of his book now (`booksOf`),
  the board sends the twin's row even with nothing waiting (`state.get`), a move onto a tute book makes both rows,
  and a tap opens the twin without moving him (no row yet: `students.openTwin` makes it, then it opens). A paper
  finds its book by unit AND stage (`viewOfPaper`: the two books share their unit). Tutes uploaded before the mark got it
  from data step 6 (`DATA_VERSION` 4: a workbook starting after question 1 + a theory book in its unit).
  **One corrector per book:** the open book is claimed (`claims` table, `convex/focus.ts`: `claim`, `release`;
  `src/focus.tsx` `holdFor`/`claimBook`); her phone says "still here" every 20 s while the page is on screen
  (`stillHere`, `CLAIM_PING_MS`); a minute of silence (phone locked, other tab) and anyone can take it ("Nisha's phone
  was quiet for a minute: …yours now"). Another corrector's name pill shows her first letter (`.fc-nm-who`); dim
  (`.fc-held`) when his only book to correct is hers. Tapping it: `AskSheet` "Nisha has Raj's Unit 8" → **Ask Nisha**
  → her phone shows `GiveSheet` (a sheet, nothing under her finger moves; a soft tone) **Give it to Kavi** (her paper
  closes, her marks go with the book: they are server drafts) / **Keep it** ("Nisha keeps Raj's Unit 8"). The server
  refuses marks and saves on a book someone else holds live (`mustHoldBook` in `focus.mark` and `workbook.correct`).
  Drafts of his other books are never wiped by marks on one book (only drafts of corrected levels; others after 2
  days). Not covered: the Register's correct sheet doesn't claim (it is refused while someone holds the book).
- **His paper:** (3 Nov 2026, his call: no big name: his is dark in the names row) the top row starts with the
  **book button** (`UnitsButton`, moved up from the books row: all his units, Move him / Books given; the Manager
  button that stood before it left for the bottom bar's Class tab the same day); then **Later** (`workbook.levelDone`); **question-sheet button** (`.fc-racebtn`, a bar chart on its side since 2 Nov 2026 (his ask: a stats icon, not a grid), left of the home icon; 1 Nov 2026 a race, rebuilt 2 Nov 2026 on his words: it is for the corrector to check her work, not a leaderboard): `BookRaceSheet` in `src/bookRace.tsx`, query `progress.book` (every student who has worked in the book or is on it; Correction / Theory / Evaluation / Reports; per-question states + the book's sections or levels, never its content; `waits` = his levels handed in and not corrected, and marked at home not checked). On top, for her (2 Nov 2026, his words "am I correcting properly? am I missing anything?"): **To correct · N** (workbook: `waitsOf`, oldest first, "Malik L3 6 min" / "⌂ check"; one tap = `openWaiting` → his level opens; none = "✓ Nothing waits for you in this book") and **Most lost marks** (`lostMost`: questions where half or more of at least 3 marked lost marks: a hard question or a wrong key/marking; tap = zoom to its level, its number red). Level numbers too narrow for their columns shrink or hide (never "9101112"). Every student (furthest first, `bookRace`) against every question (`sheetOf`): theory book right / wrong / slip / explained / knew it / **left out** (unmarked while a later one is marked) / not done, teacher questions taught / skipped / not taught; workbook full / part / no marks / ? / explained / taught / handed in / before the app / not done. ONE screen (rows shrink: `--n`), chips All or one section / level zoomed with question numbers, a legend of the states shown, the paper's student ringed. **Blur**: tap a name, or Last 3 / All but top 3 / None (`blurPick`; never ranks 1–3, `mayBlur`); blurred on the phone too. **Share to the group** / Save = one white 1080-wide PNG (`src/racePoster.ts` `drawSheet`: English except the unit's Tamil name, no logo bands, the whole book, nobody ringed, chosen names smudged by down-and-up scaling (iOS 15 has no canvas filter), height grows with the class; since 2 Nov 2026: a small gap between levels instead of lines through the table, level numbers only where they fit, column names once ("levels" "marks" / "questions" "today"), one meaning per column (a workbook's marks %, "–" before any correction; a theory book's +N today), no "0 finished", the group sees "Handed in" (not "to correct")); **home icon** (`.fc-gohome`, left of Marks, 1 Nov 2026, his ask: signing out took + → find him → sign out): one tap = `students.setPresent` false (`by: "attendance"`), toast "Raj went home, 8:42 pm.", his name leaves the names row (unless a level waits), his paper stays with **Sign him in** (the undo); pale while he is signed out; **Marks** = Class's `Book` in a sheet; signed out (gone
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
  open one in the middle). **The card (2 Nov 2026, his ask: correctors were slow because the answer was small text
  beside a huge number, wrapped, under notes):** one top line (`CardHead`): the number as a dark pill "Q21", its marks,
  ‹ back, the printed question's icon; then **the answer, big** (`BigAnswer` in `src/bigAnswer.tsx`, rules in
  `src/answerText.ts`): the largest size that fits (64 px on one line down to 32, then 2–3 lines; `fitAnswer`), never
  broken beside = + − × ÷ (`glue`), fractions stacked as written (`mathPieces`: "3/4", "2 3/4", "(x + 1)/2"; units
  like km/h stay), powers raised; a key "working = **answer**" shows the working small above the answer
  (`shownLines`), " / " = a line break; parts: the part's name in a chip, its answer big, its mark buttons in one
  full row under it (the same place on every part). No key / not in the key / loading: one line where the answer
  goes (`.fc-anote`); "Clear marks" is in the level line, the resumed note one line. Then one tap: the big button gives what is shown (full by default;
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
  counts nowhere until Save. Theory book (1 Nov 2026, his screenshot: a book whose section A waited for Theory
  showed nothing): **the whole book in two rows** (1 Nov 2026, his ask: one row of 61 needed too much scrolling), like
  a workbook: row 1 = its sections (`FighterSecBar`, the level bar's buttons `.fc-lvbar.fc-secbar`: A–F, P = past papers,
  ★ = final challenge; `sectionLook`: all right green, all marked amber, the one he is on outlined, the open one
  ringed; violet dot = wrong ones waiting for Evaluation, blue dot = teacher questions not taught; a tap =
  `sectionStart`: the first he can do there, else the first not right), row 2 = the open section's questions only
  (`sectionQs`; teacher questions double-ringed AND filled blue `.fc-tq`); marking the last of a section moves both rows
  to the next by itself (`nextSolo`). Opening at the first question he can do (`fighterQueue`), else his
  first solo one not right; every question with its answer (the theory book's key) and "Show the question"; ✗ / ↻ /
  big ✓ (`setFighterMark` → `marks.setMany`), then the next solo question (`nextSolo`). **Every tap is saved live** (0.9 s after the last tap on that student and book, at once on another name, Stop or the phone hidden; no Save button, Done at the end only closes the paper). 1 Nov 2026, his report "Fighter marks not saving": marks on a theory book that wasn't his book now (a tute's theory book while he is on its workbook, a book given) were refused and vanished; now `fighterPlace` takes any theory book he has work in (never moves him), and the phone's instant marks are kept per book. Coming back to a student shows every saved mark in colour (the strip) and "Saved: ✓ right" on the card; only a question he must redo (slip, explained) shows faintly. A question of a section whose
  teacher questions aren't taught: marked only if he did it (a line says so). A teacher question: its answer and
  "Teacher question (Theory teaches it): taught / skipped / not taught yet"; ✗ ↻ pale, the big button = Next question.
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
Share = the phone's share sheet (WhatsApp), Save downloads. Audit 2 Nov 2026 (his "wrong text, something repeated"):
the column names sit once in each unit's header ("Levels" "Marks" / "வினாக்கள் · Q" "இன்று · Today"), not under every
row; a theory book's blue "76%" (how far, read as a score) is gone: its second column is +N today; a workbook's is
its marks; zero day-totals are left out; the foot is the level colours' key (80%+, 50–79%, < 50%, Handed in, On it now)
instead of the header's name and date again.

**One student's sheet (31 Oct 2026, his ask: "the individual progress sheet I share on WhatsApp to the parents").**
Progress → tap any name (Units race or Term grid; also the names on the Owner page) → `StudentSheet`
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

**The Class tab (3 Nov 2026, his voice note: "2 teachers not taking any students: each thinks the other will take
him"; "make the manager page the Class tab in the bottom bar; the other teachers can see it, they can't drag and drop;
they want to know how many students stay without work in the hall"). It was the Manager page (2 Nov 2026; rebuilt 3
Nov: "teachers silently take rest", "the manager can send anyone to any place", "rooms of the teachers and the hall as
rectangles", "everything in one view"), opened by a button on the Correction page until the same day.** The teachers
keep their own pages (Call, Arrived, Done); the Class tab shows the hall and every teacher's room on ONE screen (no
cards, no question numbers, no Back buttons). **Everyone** sees it; only **managers** act (`canManage`: the owner and
the **Manager job**, Settings → People → tick Manager; any other job or none: it no longer needs Correction): send any
student to any teacher, mark teachers arrived / went, read every teacher's card. A teacher taps a student: his strip,
his day, no buttons; no drag; her own name (underlined): her card; another teacher's room: what she is doing
(`TeacherStrip`: here since, doing, her students, the students the page suggests for her), never her numbers. The
suggestion on a free room names its students: the cure for "she will take him" (both teachers see whose they are).
The phone hears what its last job hears; a manager's taps are recorded `by: "manager"`. Page `src/manager.tsx`
`ManagerPage` (`canManage`, `meId`); rules, pure and tested, `src/managerData.ts` `managerPlan`
(`tests/manager.test.ts`, the run-throughs "Class tab: …" and "Teacher card: …").
- **Who is here** (3 Nov 2026, his ask: "arrived time and went time, all done by manager"): a teacher has a room only
  while the manager has marked her here (`people.team` `stay`; `isHere`; the owner teaching always is); until then,
  and after she went, a dashed chip on the **team line** ("Nila not here Arrived?" for the manager, "went 5:40 PM").
  A room with students still shows. The correctors here sit on the team line too (a pen chip each). Tap any name:
  her card (below). Free since = her last Done today, else her arrival, else the class's start. (The old "not here"
  link on a room, remembered on one phone only, is gone.)
- **The owner teaches** (3 Nov 2026, his ask: "only for me"): Settings → Account → **Not teaching / I'm teaching**
  (`TeachingSwitch`, `people.setTeaching`, owner only; `users.teaching`; history "teaching today: on"). On: his room
  on the Class tab (Theory and Evaluation; never marked arrived: his switch), the manager sends him students and his
  phone calls him on any page ("Kumar is coming to you. Open Evaluation."). Off when he goes out: the room goes. He is
  never on the team line, never has a card, never in the teachers' numbers ("not including me").
- **The three numbers** (`.mg2-counts`): levels **to correct** · students **to explain** · students **to teach**, each
  with "N no work" in red. Tap one: the hall dims everyone else (`counts.*.ids`).
- **A room per teacher here** (`people.team`: active teachers with Theory or Evaluation marked here, by name; fixed
  places), coloured by what she is doing now (blue Theory, violet Evaluation/check-in; `doing`): her students as pills
  (her calls only, both rooms): **called** by her phone (dotted; the manager taps him → Send now / Not now), **on his
  way** (dashed; amber after 3 min = she hasn't tapped Arrived), **with her** (solid); "12m · ~3m left" (each question
  once × 3 min, a lesson its usual length, `calls.lessons`), "over" (yellow; amber while students in the hall have no
  work, with "7 have no work: finish now": 3 Nov 2026, Zuhar 49 min with two while seven sat 61 min). **Free**: green, "free 6m" (since her last Done today,
  `people.team` `lastEnd`, else her arrival, else the class's start), and the group the page suggests for her
  ("Evaluation · no work / → Vimal, Malik"); **a manager's tap on the room sends it** (no suggestion, no student
  picked: her card). Free while there is work for her: **yellow at 2 min, amber at 5** (`FREE_YELLOW_MS`,
  `FREE_AMBER_MS`; his "teachers rest silently"); over her time: yellow, **amber** (knocking) while students in the hall
  have no work. **Never red for a teacher** (3 Nov 2026, his rule now that every teacher sees it: "red says they are
  doing wrong"): rooms, a late walk ("not taken", amber), the room's notes and its suggestion's words are yellow or
  amber. Students with no work stay red (the same red as every page: one student, one colour). The name in the room's
  head is its own button (`.mg2-rn`): her card / what she does.
- **The hall** (`.mg2-hall`, the big rectangle; scrolls inside, the page never does): everyone not called and not in a
  room, A–Z, never moving. Outline **red** = no work (his minutes), **orange** = should go now (in a due group),
  **yellow** = waiting on purpose; a violet **dot** = no Theory or Evaluation teacher yet today after an hour here
  (`noTeacherYet`, `NO_TEACHER_MS`, from `students.seen`; his "premium feeling"); dashed = quiet; grey = on paper;
  green = finished his book (Move him on).
- **Sending** (`calls.create` with `teacherId`, manager only): **tap a student, tap a room**; or **hold him and drag**
  him onto a room (pointer events, 220 ms hold, the page doesn't scroll while dragging; a ghost follows the finger);
  or one tap on a free room (its suggestion). What he goes for decides the call (`needOf`, `callFor`): a theory-book
  student with no work who needs a lesson → Theory; lost marks / wrong answers → Evaluation; theory waiting →
  Theory; nothing waits → a **check-in** (`visit`: the evaluation room; she looks at his book; on paper too). A room
  takes only what her jobs allow (Evaluation and check-ins: the Evaluation job; Theory: the Theory job, else an
  Evaluation teacher teaches it in her room, kind theory); the server checks it too ("Fathima doesn't do
  Evaluation. Settings → People → Fathima → tick Evaluation."). He walks there at once (sent, walking,
  `byManager`); toast "Vimal and Malik → Shanthi." with **Undo** for 2 min (`calls.unsend`, his own sends only).
  Never while a teacher has called him ("…: send him there") or has him.
- **Her phone** (his pick: "call her until Arrived"): a manager's send says "Vimal and Malik are coming to you." (alert
  kind `coming`, its own chime, `comingPhrase`) every 30 s until she taps **Arrived** (on her other page: "… Open
  Evaluation."; that tab's badge in the room's colour, `tb-coming`). Then she works as usual and taps Done. A
  check-in on her Evaluation page: "Check-in: Priya. Look at his book with him: how is it going? Then Done."
  (history: "check-in finished").
- **His strip** (tap a student; `.mg2-strip`, at the bottom; everyone): name, what he is doing (`v.line`), why ("waits
  for Zara (hands in L1 ~5m)", "no teacher yet, here 1h 12m"), **his day** as a bar from sign-in to home time (2 h):
  working green, no work red, walking grey, Theory blue, Evaluation/check-in violet ("teachers 12m (2×) · no work
  6m"; `manager.day`, read once and every 30 s; `convex/lib/timeline.ts` `dayOf`), and (the manager's only) a button
  per teacher who can take him (the suggested one filled; "busy · ~6m left"). No work (red) or finished: **Give a book** (the unit sheet
  in Books given mode, `StageUnitSheet mode="given"`): when every teacher is busy it is the first button, with "Every
  teacher is busy: give him a book; he works on it until one is free." (3 Nov 2026: 7 sat 61 min while both teachers
  explained). A pill in a room: **He's with her** (Arrived for her: her
  phone may be off), **Back to the hall** (walking: cancel; with her: `calls.release` after "Yes: back, nothing
  marked"), **Undo**.
- **Suggestions** (`managerPlan`): the hold rule groups (below) go to free teachers who can take them, worst first
  (red, the most with no work, the biggest, Theory before Evaluation), Theory to a Theory teacher first. A free teacher
  with nothing due gets **those held for a group** ("Nila is free: no need to wait": holding only saves teacher
  minutes, and hers are free), then a section **ahead**, then **check-ins**: the quiet first, then those with no
  teacher yet, the longest here first, 3 at most (`CHECKIN_N`; never one with something waiting).
- **The hold rule** (his pick, 2 Nov 2026: "Hold, 20 min max"; `holdOf`): he keeps working while others who will lose
  the same question catch up, so it is explained once. He goes now when any one is true: no work (red) · stuck or a
  section stopped (red) · 3 have the same question (`GROUP_N`) · his first question waited 20 min (`HOLD_MS`) · he
  goes home within 20 min · nobody else in class is coming to his questions. Who is coming (`followersOf`): same book,
  in class, hasn't done that question: a level handed in and not corrected (now), or the level he is on (or before
  it) at his own pace (`levelPaceOf`: the middle of the gaps between his hand-ins today, else 30 min); a theory-book
  question he can do now at his pace; not one who goes home first. When one goes, those of his book who share a
  question go with him. Theory: a workbook's questions wait for more too (20 min); **Theory first**: a theory-book
  student with no work who needs a section goes to that lesson; his wrong answers wait.
- The manager's server powers (`manager` in `actor`): `calls.create` for any teacher, `unsend`, Correction's hall taps
  (`send`, `decline`, `undoDecline`, `cancel`, `arrive`, `unarrive`, `release`), `duty.mark` / `move` / `undo`, and
  any teacher's `duty.card`. Everyone signed in reads `people.team` and `manager.day` (the Class tab is everyone's).

**Teachers' stays and cards (3 Nov 2026, his voice note: "make a dashboard for them; it feels like their own, but it
makes them feel guilty if they don't work; don't use red, that tells them they are wrong: yellow for warnings, green;
show their own work, free time, how much better than the other teachers, not including me; later I pay by
performance, not now; arrived time and went time, all done by the manager").** Server `convex/duty.ts`, numbers
`convex/lib/boss.ts` (`digestOf` with `team` + `stays`), phone `src/teacherCard.tsx` (`TeacherCard`, `StayControls`).
- **Arrived / went** (`duty` table: one row per stay, `userId`, `day`, `inAt`, `outAt`, `inBy`/`outBy`, `editedAt`):
  the manager or the owner, on her card: **Arrived** now / 5 / 15 / 30 min ago (`duty.mark` `here`, `ago` ≤ 120;
  twice is refused: "Nila is here since 4:30 PM."; back after she went: not before she went); when she is here:
  **Went** now / 5 / 15 / 30 min ago, and "She came at 4:30: earlier or later?" −10 / −5 / +5 / +10 min (`duty.move`:
  today only, never after she went or now, never into an earlier stay). **Undo** on the message for 5 minutes
  (`duty.undo`: the arrival goes; Went taken back = here again). **End the session** (and a class closed as stale)
  closes every stay still open at the class's end (`endStays` in `closeSession`, `outBy: "class end"`): a forgotten
  Went never runs on. A stay left open on an earlier day with no class to close it counts nothing (`outBy:
  "unknown"`, closed where it began, when she is marked again). Only a teacher with a job (not the owner, not someone
  with only Manager). History: "Nila arrived 4:30 PM" (`duty` events, `who` = the manager).
- **Her numbers** (per class, inside her stay; the class going on read again, ended classes from their report
  `report.digest`, v 1, optional fields, so older classes simply have none): **here**; **working** (a Theory or
  Evaluation teacher: from a student called to her (walking, with her) to Done, overlaps once, and her whole-class
  lessons at the board (`board` events: each Taught tap = the time since her previous one, at most 12 min, the first of
  a run 4 min, `BOARD_*`; a run on one unit = one lesson, students shared); a corrector: each level
  / answer and the 3 minutes after it, the walk to the next paper); **free** = here − working; **free while work waited**
  (the yellow number): free while a student sat with no work waiting for one of HER jobs (Evaluation for an Evaluation
  teacher, Theory for a Theory teacher; a student called by anyone is not waiting), after the first 2 minutes of each
  free stretch (the Class tab's yellow); a corrector: free while papers waited (handed in, not corrected) or a student
  waited for Correction. The class going on counts the students out of work right now too (`readDigest`'s `waitsNow`).
  A manager's managing isn't measured: no free numbers for her (her correcting shows). The owner is never in it.
  Worked but not marked here: her work counts, no stay numbers. Demo students never count.
- **Her card** (tap her name on the Class tab: her room's name, her desk or her chip; `duty.card`, `fetchOnce` on
  opening and every minute while open, never live): **hers only** (his pick, 3 Nov 2026: "her own + the others'
  average"); the manager and the owner read anyone's. Title "Shanthi: your day" (hers) or her name; "Arrived 4:38 PM ·
  here 1h 20m" / "Went …" / "Not marked here". Three tiles: a room teacher **working** (green when at or above the
  others, yellow 10 points below) · **free** (never coloured) · **free while students waited** (green at 0 or no more
  than the others, else yellow); a corrector: levels corrected · free · free while papers waited, "papers waited N on
  average"; a manager: correcting · levels, "managing isn't counted". "5 students seen · 2 lessons". Her stay as a bar
  (working green, free grey, free while work waited yellow; `segs`). **You and the others**: today, the others'
  average (same work: room teachers with room teachers, correctors with correctors; 15+ minutes here; never the owner
  or a manager): working % and free while students waited (correctors: levels an hour), you vs others as two bars.
  **This week**: a column a class day (working % its height; the day's letter yellow when work waited while she was
  free), "working 62% · others 49% · free while waited 22m". The manager's part at the bottom (above). No red anywhere
  on it. One screen at 390 / 360 / 320 px (`@media (max-width: 345px), (max-height: 700px)` tightens it).
- Not built (his "pay by performance later"): pay from these numbers. Before money depends on them: a month of them, the
  manager marking every day, and the rule that pays for "free while students waited" falling (a slow teacher looks
  busy, so busy minutes alone must never be paid).

**The Owner page (owner only, 31 Oct 2026, his voice note: "I want to think like a Owner").** A gauge icon in the top bar
after Progress (`boss-btn`, owner only: per-teacher numbers and money). Built around his decisions, not every number.
Five tabs (`aristora.bossTab`; the fifth, **Sim**, is the simulation's scoreboard: below, "The simulation"):
- **Now** (from the board every phone already has, no extra reads; `nowOf` in `src/bossData.ts`): up to 3 advice lines
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
  time line (in class / no work / levels waiting; tap = one reading for that moment), each person (room, minutes busy, here / free / free while work waited since 3 Nov 2026,
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
  away 2+ weeks; `boss.setMoney`, meta `boss.money`, owner only); students (+joined, −left this month, grade × stage
  table); attendance (came this week, days a week each, slipping, 14-day bars); quietly leaving (`risksOf`: 14+ days red,
  7–13 amber, coming half as often as the 4 weeks before; tap = his sheet); learning (levels and marks this week vs last,
  units finished this month, levels checked at home, below 50% in 2 weeks); books (workbooks/units, keys, theory books
  per grade; "no workbook yet" for the next unit of students 70%+ through theirs); the family app (students with it).
- **How the numbers are made** (`convex/lib/boss.ts`, `digestOf`, pure and tested): one class = its events, calls and
  visits. Teacher minutes per person: Evaluation/Theory = Arrived (else Sent) → Done of each call she finished (45 min
  at most; calls the class's end closed don't count), overlaps once, shared among the students with her; Correction =
  each level from its draft's first mark to Save (**`took` on the `level-marks` event, timed since 31 Oct 2026** in
  `workbook.correct`; untimed = 3 min, at most 12), a home level checked or a re-mark = 1 min, a theory-book answer =
  the time since her previous mark (90 s at most). A person counts in the room where she spent most minutes. Students:
  visit minutes, most at once, stage by what he worked on. Idle by what he waited for (two rooms = half each). The
  digest is kept in the class report when it ends (`report.digest`, v 1); the class going on and the 3 newest classes
  ended before digests existed are read again by `boss.overview` (owner only, `fetchOnce` on opening and every 5 minutes
  while on screen, never a live query). Demo students never count.

**The simulation (1 Nov 2026, his voice note: "upgrade the test feature ... like a simulation ... the correction will
happen automatically ... easy, medium and hard ... set the students count ... I want to see the performance of each
teacher in the Owner dashboard").** Practice for the Theory and Evaluation teachers before a real class. It replaced the
test class of 31 Oct (copy a grade, the extra test students: his words "remove that test feature"; the extra test
students live on as a test fixture, `tests/cases.ts` `makeCases`). Server `convex/sim.ts`, pure rules
`convex/lib/sim.ts`, phones `src/sim.tsx` (controls, switch, banner) and `src/simTab.tsx` (the Owner page's Sim tab).
- **Start** (owner: Settings → Students → **Simulation**, or the Owner page → Sim): **Easy / Medium / Hard**, **students**
  5–30, **minutes** 20–60 (the phone remembers the last choice: `aristora.simLevel/Count/Minutes`). The books it uses are
  listed ("Grade 7 (1 workbook) · Grade 11 (1 theory book)"); a real class signed in = an amber line (it never mixes, but
  practise after the class). Start (`sim.start`): the last simulation's made-up students go, new ones are made (test
  students: `test` + `demo`, the class only phones showing the simulation see; nothing counts), spread by `planSim` over
  the grades with the most books and over their books (each book someone before any has two), theory-book students as
  the level says when the app has a theory book. This phone switches to the simulation.
- **The levels** (`PLANS`): Easy = workbooks only, 2 grades, a level every 9–14 min, 1 question in 10 loses marks, all
  in from the start. Medium = 25% theory-book students, 3 grades, 6–10 min, 1 in 5, a few late, a few leave. Hard = 40%
  theory books, every grade, 4–7 min, 1 in 3, a third late (first 10 min), some go home early (their home time is set
  so the pages don't tick them), half of the workbook students one or two levels from the end of their unit (they run
  out of work soon: the pressure on Evaluation). Each student has his own speed (×0.75–1.3) and care (×0.6–1.5); each
  book has 1–3 hard questions many lose (the same mistake by many, as in a class). Times are compressed (a real level is
  ~30 min) so a 30-minute practice has a class's worth of work.
- **Where they start** (`masterStart`, `fighterStart`): a workbook student on a level, the levels before it done (the
  last one or two corrected a few minutes ago by the app; their lost marks waiting for Evaluation and "?"s for Theory
  when he starts with work waiting, else already explained), the earlier ones done on paper before the app. A
  theory-book student: Theory taught the sections before his next one, he did their questions (one or two wrong when he
  starts with work waiting), all of them (he needs Theory now) or all but 1–3.
- **The steps** (`sim.tick`, every 5 s, scheduled; the tests take them by hand: `manual`): each student arrives at his
  time (signed in, a visit), works on his level or question at his pace (time with a teacher or walking doesn't count),
  hands a level in (`level-done`), answers a theory-book question (marked at once: right / wrong / slip; a redo after
  Evaluation is mostly right). **The app plays Correction** (history `who` = "Simulation", `by` = correction): it corrects
  each level 30–90 s after it was handed in, unless a person has his book open on the Correction page (a corrector can
  practise too: one corrector per book) (`markLevel`: marks lost at the level's rate, some "?": 0 and straight to
  Theory; lost marks to Evaluation), sends a called student 8–25 s after the call (Sent: he walks), and when nobody taps
  Arrived for 3 minutes says he reached the room (Correction's Reached; the Owner page counts it as her missed Arrived). A
  finished book: the next workbook of his grade (a theory book: its own unit's workbook first), else he goes home. One
  reading of the class a minute (`SimSample`: in class, no work, questions and students for Evaluation, students for
  Theory, with a teacher, levels for Correction), two hours kept. One student's trouble never stops the others (his step
  is tried again). The class (session) is touched once a minute, not every step (every phone redraws on it).
- **While it runs** (owner): its clock, Easy / Medium / Hard **from now on** (`sim.setLevel`: the pace and mistakes of
  what they do next), **+5 students** (`sim.add`, 40 at most, they walk in now), **End now** (`sim.end`). Its time up
  ends it too. The end: open calls close, everyone goes home (idle minutes closed), the scoreboard is kept on the
  simulation (`simReports`, its own table: every phone reads the `sims` row, which keeps only a small `summary`); a class
  only the simulation used is closed (else a real class later the same day would
  carry its clock and its report).
- **Teachers' phones**: a phone showing the class while a simulation runs gets a pink banner **"Simulation on: Hard ·
  10 students · Join"** (one tap: this phone shows the simulation); a phone in the simulation once it is over: **"The
  simulation is over · Back to the class"**. Settings → Account → **This phone shows: The class | Simulation (N)** (any
  teacher, while made-up students exist). A phone in the simulation: the striped pink top bar with **SIM** where the class
  clock is; the score line under Theory and Evaluation says **Practice** and shows the simulation's own score
  (`sims.stats`: `roomStats` in `convex/lib/backend.ts` sends a test student's calls, Done, lessons, questions and waits
  there, never to the class's). A phone in a running simulation checks every 45 s that its steps still go
  (`sim.nudge`: no step for 30 s = a new chain of steps; the old one stops itself), and so does the Owner page.
- **The Owner page → Sim** (owner; `sim.board` read every 15 s while open, `fetchOnce`, never a live query): the
  simulation and its controls; the headline **idle minutes per student-hour** (under 3 good, 6+ the team can't carry
  this load; waiting for Evaluation / Theory / Correction); **No work now** (names, minutes, what for: tap = his sheet);
  **Where the work waits** (questions and students for Evaluation, students for Theory, levels for the app; ↑/↓ = grew or
  shrank over 5 minutes); **Did each room keep up?** (after 10 minutes and at the end: idle minutes an hour waiting for
  that room, 6+ "needs another person at this load", 3–6 near the limit, else kept up: `roomLoad`); **Each teacher**
  (per person and room, `simBoard`: questions explained or lessons and questions taught, students, sent to Theory; calls
  and how many before he ran out of work (`calls.ahead`, set by `calls.create` / `keep` on every call since 1 Nov);
  minutes a student; Arrived tapped / forgotten / seconds from Sent; busy share as a meter); **Minute by minute** (no
  work, questions for Evaluation, students for Theory: tap a minute); **The app as Correction** (levels corrected,
  answers marked, students sent, Arrived it had to say); **What is happening** (the last 60 lines, newest first, in plain
  words: `feedText`; red = someone sat 5+ minutes with no work); **Before** (`sim.past`, read once: the earlier
  simulations' level, students, idle an hour, explained, taught: where the idle minutes start to climb is what the team
  can carry). A dot on the Sim tab while one runs.
- **Delete the N made-up students** (Settings → Students → Simulation, when none runs; `demo.remove({test})`, refused
  while one runs): they go with their marks, calls, visits; the scoreboards stay. Starting another replaces them anyway.
- Two classes on one server, as before: `state.get({test})` sends a phone one class (the simulation's made-up students,
  or the real class) and `sim` (the simulation running or ended in the last 12 hours); `tests` = how many made-up
  students. End the session is hidden in the simulation.

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
On Grade 10 and 11 a line above the list, **O/L map on the phone** ("12 of 30 see the O/L syllabus"), opens the O/L map
sheet (the family app, below); a ticked student's row says **O/L** by his name.
Owner/Reports see: students now, added / removed this month, came in the last 7 days, not seen for 2+ weeks (tap →
names: "call the parents"; from 28 Oct 2026, `ATTENDANCE_SINCE`; rows red at 14+ days). Removed listed per grade.

**The family app (app.aristora.org, `8ee3b16`, another chat, his voice note of 30 Oct; rebuilt 3 Nov 2026).**
Levels done at home made a pile for the corrector in class. Now the student does the level on paper, types its answers
in the family app on the family phone, taps **Check** once per level and sees ✓ / ✗ at once; the class sees his marks
before he walks in. Since 3 Nov 2026 it is also **the institute's student app** (his voice note: "this is also the
learning app of our education institute"): one profile, his class times, what he did in class each day, his progress.
- Its own small bundle (`src/family/`), **in two parts since the profile** (4 Nov 2026): the first load (the entry, the
  chunk it imports, its style, its page: ~61 KB over the wire; `scripts/build.mjs` stops the build over 62 KB: 50 until
  the owl's acting, ~6 KB; 56 until the photos and the zoomed question; 58 until a tute's ladder and Learn; 60 until the
  profile's faces, birthday and the split) and, right after the first screen, **Me and its profile parts**
  (`src/family/parts.ts`: Me, the report, the photo editor, the certificate, ~14 KB, budget 16 KB; their style is its
  own file, `profile.css`, attached by `later.ts`: esbuild would copy a lazy file's CSS into the first load's). The
  page names them (`<link rel="prefetch">`), so the service worker keeps them at install and they work with no signal;
  the app fetches them right after the first screen (`useParts` in `App`). Import them only through `later.ts`
  (`loadParts`, `useParts`), never straight, or they come back into the first load. What the first screens show of the
  profile (faces, the birthday card, a finished Stage's certificate button) keeps its style in `family.css`.
  **One font for Tamil and English** (Baloo Thambi 2, weights 500–800, one variable file
  cut to Tamil + Latin, ~57 KB: `src/family/fonts/`, preloaded by the page, kept by the service worker, not in the
  budget; 4 Nov 2026: the phone's own Tamil fonts differ on every phone, Tamil Sangam MN on iPhones, and never matched
  the English words beside them), no client library (Convex's plain HTTP API, `src/family/net.ts`). It lives under
  `/f/` on both addresses; family links are app.aristora.org/f/#join=…, and app.aristora.org/ redirects to /f/
  (`vercel.json`, a redirect: a rewrite of "/" never runs, Vercel serves index.html first). A service worker under /f/
  only (cache `aristora-family-5`): it opens with no signal after the first visit.
- **An app, not a web page** (his ask, 4 Nov 2026: "students want to feel like a native app, so don't zoom when we use
  two fingers"): two fingers never zoom, on every screen, by three locks: the page's `maximum-scale=1,
  user-scalable=no` (`public/family/index.html`: Chrome), `html { touch-action: pan-x pan-y }` (Chrome even when a
  phone's "force enable zoom" overrides the page; iPhones from iOS 13), and Safari's own pinch stopped in `main.tsx`
  (`gesturestart`/`gesturechange`: an iPhone ignores user-scalable=no since iOS 10; no listener that could slow
  scrolling). One finger still scrolls every page, the map and the question strip; double tap never zoomed. Before,
  two thumbs on the pad zoomed it to 1.5x and the bottom bar went off the screen. Only Chrome is checked here (the
  run-through pinches with real touch events); an iPhone is not.
  - **A printed question opens full screen** (his answer the same day: a printed question is 10 pt and its wide tables
    and diagrams are shrunk to fit, down to 0.35x, so they could only be read by zooming): the 🔍 button beside the XP
    (only while the question is on screen; the row stays as tall) or a tap on the paper opens `QuestionZoom`: two
    fingers zoom only the question (1x to 4x, the point under the fingers stays under them), one finger moves it, a
    double tap zooms to 2.5x or back, ✕ or the phone's Back closes it on the same question (it is a sheet in `App`:
    `openSheet("zoom")`). A Tamil hint "இரண்டு விரல்களால் பெரிதாக்கு" until it is zoomed. The app itself still never zooms.
  - **Holding a finger on words selects nothing** (his answer: no blue handles, no Copy bar; no "Search" from a tap
    on a word either): `user-select: none` on the body and on the printed question; the typing boxes (sign-in,
    feedback) stay `text` (an iPhone can't type into a box that can't be selected); holding a picture or a link opens
    no menu (`-webkit-touch-callout: none`, `contextmenu` stopped in `main.tsx` outside typing boxes).
- **Its look** (his voice notes and the two pictures he liked, 3 Nov 2026; the palette rebuilt 4 Nov 2026 after his
  review: "the yellow behind the purple owl is not beautiful"): for every grade, 6 to 11 (his words: a night sky is
  fine for Grade 7, silly for Grade 11), so light and calm. **Big surfaces are only ARISTORA's violet** (`--brand`
  #6C5CE7: headers with rounded bottoms, buttons, progress), white cards and a pale lavender page. **Every other colour
  is small and has one meaning on every screen**: gold = START and what he wins (trophies, the crown, PERSONAL BEST; a
  coin with a highlight and a darker edge, never a big flat yellow), the orange **flame** = days in a row (no lamp:
  he didn't want a religious sign), the pink **gem** = XP (nothing else is pink), blue = right (✓, the days he came),
  rose = wrong (✗, signing out). **No green anywhere.** Each World on the map is its own shade of violet (violet,
  purple, indigo); the race's podium is gold, silver, bronze; his own row is violet. Tappable things press down (a 3D
  edge); cards that are not buttons lie flat. Motion: transform and opacity only (smooth on a cheap phone); things
  rise, pop and press; the next question slides in; a light passes over a waiting START; START's coin breathes out a
  halo; the progress bar flashes as he types; XP and the flame jump in the top row when they grow; "reduce motion"
  stops it all. Inspiration for the motion and the habit loop (a goal a day, the flame, the reveal, the race), never
  copied: ARISTORA's own owl, colours and words.
- **The owl** is ARISTORA's logo, the loading page's own drawing (`Owl`/`keepOwl` in `owl.tsx`: the app keeps the
  splash's SVG, no extra bytes): **white on violet** (headers, today's class: the logo's own white owl), light violet
  on white, with a dark cap and a gold tassel, living (blinks, looks, tilts, breathes). In headers on a soft glow with
  a shadow under its feet (`OwlBadge`; the turning yellow burst is gone, 4 Nov 2026); speaking in a bubble on the map
  (`OwlSays`). Small owls stand still and only their mood moves (`still`: the bubble, today's class, the timeline,
  "loading"), so at most one or two owls live on a screen (each living owl is eight SVG animations).
- **The owl acts with its whole body** (4 Nov 2026, his ask: "more emotions from the whole body... funny, so they never
  forget it and talk about it in class"; inspiration for the acting only, ARISTORA's own drawing). A mood (`Mood`,
  `owl.tsx` + `owl.css`) = marks drawn into the owl (inside the head they turn with it: `HEAD`; around it: `ROUND`) +
  motion: the whole owl squashes, stretches, bounces, leans and shakes (the `<svg>` itself), its head, wings, pupils,
  lids and cap move around their own pivots. The moods: **happy** and **cheer** (eyes closed in a smile, a hop, gold
  sparkles), **think** (a brow, "?"), **sad**, **sleep** (z z), **wave**, **love** (heart eyes beating, a blush, hearts
  rising, swaying), **star** (gold star eyes turning, "wow", stretching tall), **dizzy** (spiral eyes, a wobbling head,
  stars going round), **cry** (lids low, tears falling, sobbing), **laugh** (eyes squeezed > <, beak wide open,
  shaking), **kiss** (lips puckering, a heart floating off, leaning in), **shock** (huge eyes, tiny pupils, "O", a jump,
  the cap pops, "!"), **shy** (looking away, blushing, wing-tips over its beak), **cool** (sunglasses slide down, a
  smirk), **champ** (a gold medal swinging, wings out), **party** (a horn unrolling, confetti, bouncing), **grumpy**
  (brows down, wings crossed, steam, a tapping foot), **strong** (a headband with flying tails, a wing pumping,
  sweat), **sneeze** (a breath in, ACHOO, the cap flies off and lands, feathers), **fly** (wings flapping).
  **The moments:** Home waves (happy once today's Level is done; **grumpy after 6 PM with a flame to keep and no Level
  yet**, `flameAtRisk`, also the map's coach); a finished Stage = champ; the reveal thinks, then acts the score (every
  mark = star, 90% = party, 70% = cheer, below = strong: a headband to keep going), then champ with a medal when a
  trophy comes; #1 in the race = cool, racing = strong; Me = cheer when today is done, **cry when the flame went out**
  (0 days after a run), else asleep; feedback sent = kiss; a new student's link = love; an error = dizzy.
  **Tap an owl** (headers, the coach, the reveal once done): a random reaction for 2.6 s (laugh, shy, kiss, love,
  shock, cool, star, party, sneeze; each its own sound), **five taps within 2 s: dizzy** (`useOwlTap`).
- **The owl's surprise visits** (4 Nov 2026, his ask: "the bird comes in an unpredictable way and does funny stuff,
  like pooping"; `surprise.tsx`): it peeks in from the side (shy), naps on the bottom bar (tap: it jumps awake), sneezes
  its cap off, flies across, or flies over and drops a **white splat on the glass** (tap it: wiped off, else gone in 9
  s). **Only on Home, Learn, Race and Me**, never in a Level or the reveal (my call, told him: a gag while he types an
  answer from his paper costs a wrong answer), never over a sheet; the first after 25–45 s, then every 1.5–3 min, at
  most 4 a visit; the splat 2 in 11. **Me → Owl surprises** turns them off (one switch for the phone, like Sound: a
  parent who doesn't like the joke); off for "reduce motion" and in tests.
- **The loading page** (his ask, 3 Nov: "the same exact loading page"; 4 Nov: "dark purple and a static logo, I don't
  like it; first impression is the best impression"): one owl drawing, `public/splash.html`, put into both pages by
  the build at `%SPLASH%` (each its own "still loading" words; Tamil here), styles `src/splash.css` (the teachers'
  navy) and, for this app, `owl.css` (**our light lavender, the light violet owl falling in from above the screen,
  squashing as it lands, bouncing, then waving**; the bar colour `#ece7ff`), gone with `hideSplash()` once there is
  something real to show (at least 1.2 s from the start so it doesn't flash). No spinner anywhere: while something
  loads, the thinking owl.
- **Sounds** (`sound.ts`, made on the phone, no files): a tap, a key click, a bell for each right answer that climbs a
  step with each one in a row, a soft low note for a wrong one, a fanfare for a Level (a brighter one for every mark),
  a trophy, a Stage opening, the flame of a new day, feedback sent; the owl's own cartoon noises (a giggle, a boing,
  ACHOO, a kiss, a party toot, a dizzy warble, a splat, a wipe's squeak, a whoosh, a tweet). On unless Me → Sound is
  off.
- **Words** (his ask, 4 Nov 2026: "a mix of both; some places English is appropriate, M for Monday"): **English for
  the app's chrome and game words**: the tabs (Home, Learn, Race, Me), buttons (START, Check, Next, Send, Sign in,
  Back), days and times (M T W T F S S, Wed · 4 Nov, 3:30 PM, in 2 h 10 min, ends in 4d 6h), labels (Today's goal,
  Class week, XP this week, Trophies, Total XP, Best streak) and game words (World, Stage, Level, XP, IN A ROW, NEW
  TROPHY, PERSONAL BEST, a trophy's name). **Tamil for the owl's voice and every sentence**: the greeting, praise in
  the reveal (அருமை!), nudges (இன்று ஒரு Level செய்து தீயை மூட்டு!), what happened and what to do (errors, locked,
  soon, the timeline of a day), the feedback questions, how to win a trophy, and the syllabus itself (unit names, term
  names). **Never the same words twice** in two languages on one screen (the old "Tamil · English" pairs are gone). A
  spaced-out kicker is English only ("WORLD 1 · TERM 1"; spaced Tamil reads badly); a header title gets a smaller size
  when its longest word is long (`titleSize`: a Tamil word never breaks in the middle). No school words: a school term
  = a **World** (its banner on the map: முதலாம் தவணை), a unit = a **Stage**, its workbook's levels = **Levels**, marks
  = **XP** (1 mark = 1 XP), days in a row = his flame. Only the level he is on can be played (the first with no
  record): the paper book is the truth.
- **Screens.** On every tab the top row: who is on screen (his letter on his colour, his name, ▾ or how many children;
  tap = the children on this phone), his flame (days in a row; lit once he did a Level today; tap = Me), his XP ever
  (tap = the race), **Feedback** (💬); XP and the flame jump once when they grew (back from a Level). A floating bottom
  bar: **Home**, **Learn**, **Race**, **Me** (the one on screen a violet pill with its name; its icon hops).
  - **Home** (`home.tsx`, the institute's side): the date ("WED · 4 NOV") and வணக்கம்; **today's class** (`TodayCard`:
    "In class now · since 3:12 PM", "Class is on now · till 6:30 PM", "Today 3:30 PM – 6:30 PM · in 2 h 10 min", or
    "Next class: Tomorrow / Thu": one of his usual days first), with his Stage in class and how far he is; **today's
    goal** (`GoalCard`: his Level now and START, and "இன்று ஒரு Level செய்தால் 6 நாள் தொடர்!"); **his class week**
    (M T W T F S S: the class days from the centre's hours, a blue dot on the days he came, a ring on his usual days,
    "Your day"; tap a day); **on his birthday** a card at the top (the cake in a gold ring, confetti, HAPPY BIRTHDAY,
    the owl's wishes in Tamil, the party sound once that day; the header owl in its party mood: `BdayCard`);
    **that day hour by hour** (`Timeline`,
    `family.day`: signed in, Theory or Evaluation with whom and the questions taught or explained, a Level marked in
    class, handed in, or checked at home (⌂), signed out); **his last classes** (`family.classes.recent`: when, how
    many Levels, with whom; tap = that day). Never his waiting time in the hall.
  - **Learn** (`map.tsx`, his "put the whole syllabus of his grade; each term a World; press a unit, see its levels"):
    a purple header with his Stage now (World and term, its Tamil and English names, "STAGE 3", dashes for its Levels
    done, **Continue** = his Level now in one tap); the owl's word for today (keep the flame, how close the Stage is);
    then every World of his grade: a banner (World number, the term's name, Stages done) over a winding lavender road
    with a dashed middle (violet up to where he is), its Stages as round stops with their names beside them: done =
    violet ✓, **his Stage now** = the big gold coin with a star, a halo breathing out of it and **START**, opened =
    its progress as a ring, locked = 🔒 (tap: why), a unit whose workbook is not in the app yet = dashed, "soon"; a
    trophy at each World's end (gold when every Stage is done). `worldGroups` groups `me.worlds` by `term` (by paper
    part on the O/L map, `me.ol`), then the `other` Stages as one more World; each World has its Tamil name (the
    banner) and an English one for a header's kicker (`en`: "Term 2", "Part 1A", "O/L"). A World's road is drawn
    only when it comes near the screen (`content-visibility` on `.f-roadbox`: a long map stays smooth).
  - **A Stage** (`StageScreen`): its header (World, names, "STAGE n", dashes) and its Levels on a smaller road: done =
    purple with the XP won under it (★ for every mark; ⌂ = checked at home, waiting for the corrector's look), with
    the teacher = pale with a clock, done before the app = pale ✓, **his Level now** = the gold one with START, later =
    🔒; a trophy at the end. A Stage the phone can't mark yet, or locked, says so. **Every Level done: Certificate**
    (below the trophy).
  - **A Level**: ✕, a progress bar (answers typed, "3/9"; a light runs along it at each answer; gold when every box has
    one), "Stage 3 · Level 4", Check; the next question slides in, each key gives the answer a small push;
    the question strip, one question at a time, his own pad (numbers, or the n pad), Check once (review first).
    **The screen holds still on →** (his report, 4 Nov 2026: "the whole screen bounces up and comes back"): the slide
    is clipped at the phone's edge (`.f-play`), so the page never gets wider than the phone and the pad never moves;
    the strip glides sideways to his chip by itself (never the page); a new question, and the review after his last
    →, is a new page: if he had scrolled down (a tall printed question), it starts at the top, set before the screen
    is drawn. → to another box of the same question keeps his place.
    A box shows a unit after his number when the answer has one ("63 %", "? cm²", "? h" "? min": printed, never typed)
    and a ratio's ":" between its boxes. **A question only the teacher marks** (no box): "இதைத் தாளில் செய்: உன் ஆசிரியர்
    வகுப்பில் திருத்துவார்" and **no pad**: only → in its place (`NextBar`; 4 Nov 2026: before, a pale pad that did
    nothing made a student think the app was broken). **He comes back to where he left** (his ask, 4 Nov 2026): the question he was
    on is kept per level on the phone (`spot.<unit>.<n>`, per child, cleared at Check) and the level opens there, its
    chip in view; a level begun before that opens on his first empty box. His typed answers were already kept.
    **The question, always** (his answer, 4 Nov 2026: "always show the question"; the eye switch of 3 Nov is gone): each
    question as printed above its answers whenever the Stage's questions are in the app (`family.questions`: the
    level's questions and the book's CSS once per Stage, kept with the level for no signal; drawn in a shadow root by
    `src/questionView.ts`, shared with the teachers' "Show the question"). On the phone it wears the app's clothes
    (`PAPER_CSS`, his ask "I want beautiful font for the questions"): Baloo Thambi 2 at 17 px (letters of maths stay
    in italics), the printed number and marks hidden (the card says Q9 once: his screenshot showed it twice), the
    source line small and pale. Without the Stage's questions (Books page **Q** not lit) only the answers show.
    **The answer kinds** (his voice note, 4 Nov 2026: "we can't always rely on the keyboard"; `src/family/kinds.tsx`):
    when the key gives a part's kind (version 2, below), the question itself takes the answer where the book marks it:
    its **blanks are his boxes** (`data-fill`: tap one, the pad types in it; no box under the question), **options**
    are tapped (`data-opt`), each statement's **bracket becomes ✓ and ✗** (`data-tick`), **words or numbers are
    underlined or circled** with a tap (`data-mark`, a second tap undoes); **cards to order** (drag one onto another
    or tap two) and **pairs to match** (left, then its partner; a pair wears one number) sit under it. A question
    with nothing to type has no pad, only →. A question whose printed HTML lacks the slots (or no questions in the
    app) shows the same options, ✓ / ✗ or words under it instead, and the boxes as before. His answers stay one list a
    question (an option's number, "1" / "0" for ✓ / ✗ and marked words, each place's card number, each pair's right
    side), so Check, the drafts and the reveal didn't change; the reveal shows marked words as one ✓ or ✗.
  - **The reveal** (`Result`): the thinking owl inside a **ring that fills as his marks come in** (gold when every mark is
    his), then his answers one question at a time (a bell climbing for each right one in a row, a low note for a wrong
    one; each ✓ ✗ pops), the score jumping up with each mark, "5 IN A ROW!", then the owl's mood and its word by the
    score (அருமை!), confetti, +XP, the flame (it lights with its sound if this was today's first Level: a card where
    **yesterday's number rolls up to today's**, "1 day streak", and the owl's word), PERSONAL BEST, every trophy this
    level just won ("NEW TROPHY!", a light passing over it), each question ✓ ✗ ✍; **what next stays at the bottom**
    (sticky): the map button and "Next: Level 4" side by side, or the Stage. A tap shows it all at once (and tests
    and "reduce motion" skip the wait).
  - **The race** (`family.board`; rebuilt 7 Nov 2026, his voice note: students who never joined weren't on it, class
    work "is also progress", "can we show the whole institute ranking? ... two tabs"): **every student of ARISTORA**,
    on the app or not (first name and initial), XP this week **from class and home** (below: what counts). Two lists
    in the header, **Grade 8 | ARISTORA** (kept per child, `raceList`): his grade, or everyone (each name with its
    grade as a number). The top three on a podium (gold, silver, bronze; the gold crown on this week's first; "You"),
    the rest as rows with how they **moved since yesterday** (▲2 blue, ▼1 grey, ▲ alone = new in the race today;
    never red), **👑 = last week's champion of that list** (the most XP last week; ties share it), then **"இன்னும்
    தொடங்கவில்லை"**: everyone with 0 XP this week as name chips with **no number** (my call, told him: the push of
    being seen not racing, without a "#47 of 47" to laugh at), his row violet wherever he is; "இன்னும் 12 XP எடுத்தால்
    Bilal ஐ முந்துவாய்!" (to pass the one above; before he starts: "ஒரு Level செய்: நீயும் race இல் சேர்வாய்!"), when the
    week ends. On ARISTORA the **grade cup** (his pick): each grade's share of students who learned this week (made XP),
    "18/20" as a bar, best first, his grade violet, the leader gold (fair whatever a grade's books, and it pulls back the
    ones who stopped coming). **Tap anyone** = his profile (below); his own row = Me. **Faces** (4 Nov 2026, his pick):
    a student's photo once the teachers said OK and his family shows it (`RaceRow.pic`; since 7 Nov any grade's, the
    ARISTORA list), his own always on his phone; 🎂 by a name on that student's birthday. The kept race shows at once
    (`useBoard`, per child), then the new one. Rules in `convex/lib/race.ts` (`placed`, `champsOf`, `passOf`, `cupOf`),
    shared by the phone and the server. **Leagues**: in 2–3 weeks (his yes, 7 Nov 2026), once the weeks hold real XP.
  - **What counts as XP** (7 Nov 2026, his voice note: "if they did the question from the classroom or from the home,
    whatever, they are progressing"): a workbook level's marks the day he handed it in (corrected in class, or checked
    at home: as before), marks won back by a question that came back, a tute's ladder section checked at home (its
    parts right), and since 7 Nov **a theory-book question the class marked right: 1 XP** the moment it was marked
    (`classCircles` in `convex/lib/family.ts`; not a circle the home check wrote, nor a question of a section checked
    at home: `lh.q`). Being taught or explained is never XP (XP = marks: nobody wins XP by getting things wrong). A day
    the class marked his theory questions (right, wrong or a slip) lights his flame too (`levelDays`). Today only Grade
    8 (3 Stages) and the O/L tutes can be played at home: Grades 6, 7, 9, 10 earn XP in class only (told him: the
    ARISTORA list leans to them until more units are digitized; each grade's list stays fair).
  - **The race kept ready** (7 Nov 2026; the free plan's 1 GB of reading a month: the old race read every classmate's
    whole history at each open, the whole ARISTORA would read everyone's): one small `raceRows` row per student (his
    name, grade, photo key, birthday, removed/demo, and XP numbers as worked out at a moment: `wk`, `d`, `xp`, `xpy`
    (this week before that day), `prev`, `tot`; `numsAt` reads them at any later moment), one `raceParts` row per
    progress row. **Every mutation** goes through `convex/lib/fn.ts` (`mutation`, `internalMutation`): its db is
    watched, and as it ends the progress rows it wrote get their part again and his race row adds his parts up; a
    student's name, grade, photo, birthday or removal is copied; a missing row or one built with older rules (`RACE_V`)
    is built again from all his rows. `race.fill` (every 5 min) builds the ones still missing, 20 a run, then notes
    meta `raceV` and does nothing more; until then the race works out the old way from everyone's rows (`raceList`).
    `race.week` (Monday 00:05 Sri Lanka) keeps last week's champions in `raceWeeks` (each grade's top 3, ARISTORA's,
    the grade cup) and adds a week won to each #1's race row (`w` in his grade, `wa` in ARISTORA): his profile counts
    them (and the gifts will read them). Phones from before 7 Nov read `top` / `me` / `count` from the same answer until
    they load the new version (remove after 21 Nov 2026).
  - **A classmate's profile** (7 Nov 2026, his ask: "every profile want to be clickable ... even one student can look
    another student"; his answer: **Everything**; `src/family/mate.tsx`, a later part; `family.mate`): his face, name,
    grade, 👑 weeks won (his grade, ARISTORA), his flame and his week, XP ever, best run, Levels; **👏 Cheer** (one tap,
    no words: `family.cheer`, once a day per classmate, 30 a day, never himself; "இந்த வாரம் 3 👏"); this week's place
    in his grade and in ARISTORA (from the race on the phone); trophies; his 12 weeks (no hour-by-hour for a classmate);
    his class (days and hours, usual days, last class); his questions (Right / Learned / To learn) and every Stage with
    its ring. **The owner's switch** (Settings → Race, on by default: his choice; my escape hatch if a parent complains):
    off = no marks on a classmate's profile (% right, questions, each Stage's marks: the ring shows Levels done); his
    own Me keeps them. Never his account, his day hour by hour, WhatsApp or a certificate. **Who cheered him** shows
    on Home and Me ("👏 Hana K, Raj M and 3 others ... இந்த வாரம் உன்னை உற்சாகப்படுத்தினார்கள்!": `me.cheers`, this week).
  - **Gifts from the centre** (7 Nov 2026, his ask: "gift cards ... ice-cream or chicken fries"; no votes, my call told
    him: votes turn into a popularity contest): the owner sets a prize for each win in **Settings → Race** (empty = no
    gift): 👑 each grade's champion, 🏆 the ARISTORA champion (he is his grade's too: both gifts), 🥇 the grade cup
    (every student who learned that week in the grade with the best share). `race.week` (Monday 00:05) makes a `gifts`
    row for each winner with the prize as it is then. His phone shows a gold card on Home and Me ("நீ வென்றாய்! 🍦 Ice
    cream · 👑 Grade 8 champion · week of 2 Nov · இதை உன் ஆசிரியரிடம் காட்டு") until a teacher taps **Given** (owner or
    Manager: Settings → Race → Gifts to give; the toast's Undo, or Given lately → Undo). The gear counts the gifts
    waiting for the owner and the Manager (`race.giftCount`), and Settings opens on Race when nothing else waits.
  - **The champions poster** (7 Nov 2026, his pick: "Monday poster"; `src/champions.ts`): Settings → Race → Last
    week's champions (owner, Reports, Manager): ARISTORA's top 3 and each grade's champion and the cup as a list, then
    **Share poster** / Save: one 1080 × 1350 PNG drawn on the phone (ARISTORA's top 3 as medals, each grade's 👑, the
    grade cup; first names and initials, never marks or a last place) for the WhatsApp group and the hall wall. Before
    Monday's run kept the week (`raceWeeks`) it is worked out from the race ("Worked out now").
  - **Me = his profile** (4 Nov 2026, his voice note: "a proper profile page for the students ... as simple as
    possible"; `me.tsx`, one of the parts that come right after the first screen): a violet header with **his photo**
    (88 px; tap = the camera or the gallery: his photo, below), his name (🎂 on his birthday), grade and index ("Photo ·
    waiting for OK" while it waits); then his flame as the big number (PERSONAL BEST when it is his best), the owl
    (asleep until today's Level; party on his birthday; cry when the flame went out), this week as seven circles. Below:
    XP ever, his longest run, Levels done; a word from the teachers when they said no to his photo or his name (read
    once: OK); **12 weeks** (`HeatMap`, his ask: "the heat map of how the student is doing at home and in the
    classroom"): a column a week, Monday on top, a day darker for each Level he finished that day (at home ⌂ or in
    class: the day he handed it in or the phone marked it; a tute's ladder section too), a blue dot = he came to class,
    the days before his first day here a faint dot (never empty boxes: weeks he never had would tell him he is lazy);
    tap a day = its Levels, ⌂, XP (counted as the race counts it: `xpItems`), in class; **See** = that day hour by hour
    (Home's timeline, `family.day`, now the last 90 days). Not a year (a year on a phone is dots, and empty months
    shame) and not app opens (they reward scrolling, not learning). **Class** (`ClassCard`): this month and last (days
    he came, hours in class: sign-in to sign-out, 8 h at most a visit; never waiting time), the days he usually comes
    (blue), his last class. **Report** (`ReportCard`): his questions in a child's words, **Right** (full marks, blue),
    **Learned** (lost marks a teacher then explained in Evaluation or taught in Theory, violet), **To learn** (still
    waiting, rose; never the word "wrong": his request was "how many wrong", my answer: the same numbers, and a mistake
    becomes a win once explained, as the class works), his Stage now (its ring = his marks, its Levels), **See all**,
    **Send on WhatsApp**. Then XP this week as bars per day (`me.dayXp`); his place in his grade's race (`myPlace`;
    "Not in the race yet" before his first XP of the week); the **trophies**
    (`trophiesOf`, server; names in English, how to win in Tamil: First Level, 3- / 7- / 30-day streak (his best run),
    Perfect (a Level with every mark), 5 × Perfect, Stage clear (one Level of it in the app at least), 100 and 300 XP
    week; won ones gold, the rest pale with a lock and how to win them); **Your details**: Name (asked: below),
    Birthday (once: below), Photo in the race (on/off), Remove photo; **On this phone**: the children, Sound, Owl
    surprises. Opening Me asks the server again (what the teachers just said OK to shows at once).
  - **The report** (Me → Report → See all; `ReportScreen`, a screen of its own, Back = Me): his name, grade, index and
    photo; **This month / last month / the one before** (`family.profile.months`): class days, hours in class, Levels
    (⌂ at home), XP, and that month's questions (Right / Learned / To learn); then **every Stage** he was given or has
    Levels in, in map order (`stageLines`): its ring (his marks over its marked Levels; gold at 100%), its Levels
    (dashes, done / all, ⌂ at home), its questions, "Given 28 Oct · Started 30 Oct · Finished 12 Nov", and
    **Certificate** when every Level is done. **Send on WhatsApp** (fixed at the bottom; his pick) opens WhatsApp with
    the chosen month as a message for his parents (`waText`: his name and grade, "Hana இன் November 2026 அறிக்கை",
    class days and hours, Levels, XP, questions, each Stage with its % and Levels, app.aristora.org): the parent picks
    the contact. Never a class ranking.
  - **His photo** (his voice note: "they can upload their profiles ... we don't have enough space ... compress ... show
    the progress bar"; `photo.tsx`; not the photos from home, below, which are his work): tap his photo on Me → the
    phone's camera or gallery → a sheet: "Opening your photo" (a moving bar, the file's size) → the photo in a circle:
    drag to move, the slider to zoom, ↻ to turn → **Use this photo** → one bar with both real steps: **Making it
    small** (on the phone: a 288 px square, WebP, else JPEG, smaller until under 30 KB; the line under the bar shows
    it, "6.1 MB → 18 KB") then **Sending** (the bytes as they go: an XMLHttpRequest with upload progress) → Done. A
    12 MB camera photo leaves the phone as ~10–30 KB; the server keeps nothing over 45 KB (`photoProblem`: only JPEG or
    WebP, checked by its first bytes). Space: 120 students × 2 photos × 30 KB = 7 MB of the free plan's 500 MB. The real
    limit is the free plan's **1 GB a month of database reading**: the class's live state reads every student's row on
    every tap, so the picture never sits on the student's row (only a pointer, `students.photo`); it is in
    `profilePhotos`, read only by `family.photos` (by key, his own and his grade's approved ones) and the teachers'
    asks and Family sheet. Each phone keeps pictures by key (`pics.ts`, the 40 newest): a picture comes from the server
    once. **His own phone shows it at once; his classmates only after the teachers' OK** (his answer: "Also the race
    (classmates)": every new photo waits for the OK). A new photo while one waits replaces it; the one in the race stays
    until the new one's OK. 6 a day from one phone (`familyDevices.pfDay/pfN`; the photos from home count apart,
    `phDay/phN`). His family can keep it out of the race (Me → Photo in the race: off; my escape hatch for a parent who
    doesn't want a daughter's face in front of the class); Remove photo = his letter again. Teachers' class screens
    (Correction, the Manager) don't show faces yet.
  - **A new name** (his answer: "Class name, after your OK"; `NameSheet`): Me → Your details → Name → "First name and
    initial" → Ask for this name. It changes **everywhere only after the teachers' OK** (the class's name is how the
    hall and the race know him; a child renaming himself "KING" or a classmate's name would break both). Letters of any
    script, 2–30, 3 words at most; never another student's name (as Rename); one ask at a time (a new one replaces it;
    20 s between two); Cancel takes it back. OK = Rename (the same history line); No = his phone says so once.
  - **His birthday** (his pick: "the owl throws him a party, his teachers see a 🎂"; `BdaySheet`): Me → Your details →
    Birthday → day and month (no year) → Save, **once** (a change goes through a teacher: his Family sheet → Clear
    birthday; so nobody gets a party every day). On the day (Sri Lanka, `isBirthday` in `convex/lib/day.ts`; born on 29
    Feb = 28 Feb in a year without it): Home's party card, the owl's party mood on Home and Me, 🎂 by his name on Me, in
    the race (my addition: classmates can wish him) and on the teachers' Correction names row, the Manager's hall and
    Settings → Students.
  - **A Stage's certificate** (his pick: "to share on WhatsApp status: free advertising"; `cert.tsx`): a 1080 × 1350
    picture made on the phone (a canvas): ARISTORA's violet, the logo's owl (its own paths from /icon.svg drawn as
    shapes, so the picture can always be saved), CERTIFICATE, "Stage 3 complete!", the Tamil name, his photo (or his
    letter) in a gold ring with a star, his name, his % and Levels, the day he finished it, ARISTORA. **Share** (the
    phone's share sheet: WhatsApp, status) or **Save**. From the report's finished Stages and a finished Stage's
    screen.
- **A topic tute's ladder on the phone** (4 Nov 2026, his ask: "fighter and master are both mixed ... the question
  numbers start from one for OL books"; the phone showed Constructions from Q53 only). An O/L tute is one printed book:
  the ladder (sections A–F, Q1–52 in Constructions), then the past papers (Q53 on). The app keeps its two books; the
  phone shows them as **one Stage on one road, numbered as printed**: each ladder section is a Level (A = Level 1, B =
  Level 2 …), then each paper one more Level (`convex/lib/ladder.ts`: `ladderOf` (a workbook with `tute` and its theory
  book), `ladderKeys` (the ladder's key prints no marks: 1 mark a part), `secQs`, `secDone`). On the phone a ladder
  Level is n < 0 (-1 = A; `WorldLevel.d` = its number on the road, `lb`/`lt` its letter and Tamil title); the papers
  keep their own n (shown as n + the sections). His answers: **in order, like Levels**, and the papers wait for the
  ladder unless he already started them.
  - A section is done when he checked it at home (`progress.lh[section]`: when, parts right, parts) or when every circle
    of it is marked in class. Its questions as printed are the theory book's pages (`family.questions`, n < 0).
  - **A teacher question** (blue on the contents page; his idea): the phone asks "did you do this with your teacher?":
    yes = he types it; no = **Learn** (`family.learn`: the ladder key's working, one step a tap; only a teacher
    question of the section he is on), then he does the same question himself. His own questions: typed as usual.
    (Videos for Learn: his idea; a pilot of 3 for Constructions A later, if the steps prove themselves.)
  - **Check** (`checkLadder`): marked with the ladder's key and written into the class's circles as Correction would:
    his own question right = ✓, wrong = ✗ (Evaluation explains it); a teacher question right = taught (he learned
    it), wrong = left for Theory; a circle the class already marked stays; what the phone can't mark stays for the
    corrector on paper (no photos for the ladder). XP = parts right (`xpRows` adds `lh` to XP, days in a row, Levels,
    the race). History line `ladder-home`. The result has no solutions book (the class explains).
- **The O/L map** (4 Nov 2026, his ask: "who will see the O level syllabus, and who will see the Grade 11 syllabus?";
  his answers: "I tick them", topics "one by one", and "now I want to show specific unit today ... that's what I
  taught lastly"). The O/L topics are their own grade (OL = 12, `term` = the paper part), so before this no phone
  showed them and Grade 11 (no workbooks yet) showed three empty Worlds.
  - **Who:** a tick per student (`students.olMap`, `families.setOlMap`: one or many at once, ≤200; the owner or a
    teacher with Students; Grade 10 and 11 only, every student checked before any changes; history line `ol-map`).
    Where: **Settings → Students → 10 or 11 → O/L map on the phone** (`OlMapSheet`, `src/olMap.tsx`: "12 of 30 ticked",
    **All** / **None**, then each student with a tick, his index and his book now; saved as you tap), or his
    **Family** sheet (the **O/L map** tick under Open every Stage).
  - **A ticked student's phone** (`worldsOf`, `olMapOn`): the 53 O/L topics instead of his grade's terms; each paper part
    a World (World 1 · பகுதி 1A … World 4 · பகுதி 2B, `PART_TA`; the kicker "WORLD 1 · PART 1A"), each topic a Stage numbered as on his sheet
    (`olNumber`: Paper I A 01–34, I B 01–07, Paper II 01–12), topics without a workbook "soon". Stages open as on a
    grade's map (his topic now, books given, levels done, the next after a finished one, Open every Stage) and **the
    first topic in the app opens by itself** (the chain starts open: the class may not have put him on an O/L book
    yet). The hero says O/L and "ஒவ்வொரு பகுதியும் ஒரு World." His race stays his grade's.
  - **Today's topic** (the sheet's middle block, `families.olTopics`: the O/L topics with a workbook in the app, in his
    sheet's order, with who in the grade has each given): **Give** = that workbook given to every ticked student who
    hasn't it (`students.giveMany`: Books given for each, as on Correction, ≤200, all checked first (Grade 10/11 for an
    O/L book, his grade for a school one), only a book in the app; each logged `book-given`, each one's idle clock
    refreshed). It opens on their phones, and **Continue goes to it**: `nextPlay` takes his Stage now first, then the
    **newest book given** (`World.given`), then the map's order (this holds on every map). "✓ Given" (all ticked have
    it) = tap to take it back from them; the toast has Undo.
  - **Nothing lost in between** (the `other` Stages, one more World at the end): an unticked Grade 10 or 11 student
    still sees the O/L books he has (his book now, given, or levels done) as a World "O/L"; a ticked one sees his
    grade's books he has the same way ("Grade 11"). Always open; only books with a workbook. So untick → tick → untick
    never hides a level he did, and his trophies stay.
- **Class hours** (Settings → Class hours, the owner; his answers, 3 Nov 2026: "you set the hours", then "different
  grades have different time schedules"): **each grade its own** (the grade row 6–11, its days with a time each, the
  number under a grade = its class days; Save saves that grade only; what he typed for another grade waits until he
  saves it). `families.setClassHours({ grade, hours })`, meta `classHours` = `{ "6": [7 days], … }` (minutes after
  midnight, Sri Lanka; null = no class). The first evening it was one list for every grade: such a list still counts
  for each grade until that grade gets its own (`gradeHoursOf`). The family app's Home shows a student **his grade's**
  hours as his week and "next class" (`hoursOf(ctx, grade)`). The days he usually comes are worked out from his
  attendance: a weekday he came on in at least 2 of the last 4 weeks (`usualDays`); nothing to type. `family.classes`
  and `family.day` read only what the class already records (attendance, calls to a teacher, workbook levels).
- **Two children on one phone** (his ask: parents with two children). Each child = one family key (`familyDevices`
  row); the phone keeps the list (`aristora.family.accounts`, the one on screen `aristora.family.current`) and sends
  the key of the child on screen. Everything kept on the phone is kept per child (`keep()` = `aristora.family.<id>.…`:
  his screens, typed answers, a level's form and questions, the tab). Add another = his index
  and code (or his link); switch = tap a child (top row, or Me); sign out = Me → "Bilal: வெளியேறு" → yes (the key
  stops on the server; the next child is on screen; the last → the sign-in). The same child twice (his link, then his
  code): the newer stays, the older is signed out (`me.index`). A child signed out by the class leaves the list by
  himself. Up to 6. A phone from before (one key at `aristora.family.token`) becomes the first child with all it kept.
- **Feedback** (his voice note: "the most important feature: get the feedback and improve us"; `FeedbackSheet`, "Tell
  ARISTORA"): எப்படி இருக்கிறது? a face (😞🙁😐🙂😍 = 1–5), எதைப் பற்றி? (Class / Teachers / Questions / App / Other),
  up to 600 letters, Send; **with his
  name** by default, one switch sends it **without** (then only his grade is kept and no history line is written: his
  answer, 3 Nov 2026, "he chooses"). A face or words is enough; 5 a day from one phone. Read in the teachers' app:
  **Settings → Feedback** by the owner and anyone with the **Feedback** permission (Settings → People → Also; his
  answer: "me and selected people"); the Settings gear shows how many came since that person last read them, and
  Settings opens on Feedback then. The page: the last 7 days (how many, the faces, the average), All / Unhappy / With
  words, newest first, "New" since you last read; a named one shows his name and grade, else "A Grade 8 student".
- Sign in (his answer, 1 Nov): his **index number** (1001, 1002…, never reused: `students.index`, given by
  `students.add` and the data step v2; demo and test students have none; on his Students row as #1001) and a
  **4-digit code** (`familyCodes`, made on the teacher's phone with secure random, never an easy one; only the owner
  and Students teachers read it, on his Family sheet; never on the class board). app.aristora.org asks for both
  (`family.signIn`, open): a wrong code or an unknown index answer the same; 5 wrong in a row lock it 15 minutes;
  New code replaces it and clears a lock. Why not the index alone: a classmate could Check his level with wrong
  answers. Forgot them: the class sends them again (his Family sheet). The WhatsApp link (one use, 7 days) stays as
  a shortcut; the message carries the index and code too.
- Settings → Students → his name → **Family** (`FamilySheet`): index and code, New code, Send it on WhatsApp; the
  family phones and Sign out; **Open every Stage** (else they open in order: his unit now, books given, levels done
  there, the next after a finished one); Grade 10 and 11: **O/L map** (above); **Profile (family app)**: his photo,
  whether it shows in the race, his birthday, a new photo or name waiting (OK / No here too), Remove photo, Clear
  birthday (`families.profileOf`, `dropPhoto`, `clearBday`). Books → a workbook: how much the phone marks and exactly
  what it accepts per question (`PhoneAnswers`, `families.answers`).
- **Settings → Students → Waiting for your OK** (4 Nov 2026, `src/familyAsks.tsx`): at the top, only when something
  waits: each ask with the student's name, grade and when, a photo's picture ("Photo for the race", or "A new photo
  (the old one stays until OK)") or "Wants the name: …", **OK** / **No** (`families.asks`, `families.answer`). The
  owner and teachers with Students answer (the same people who rename students). The Settings gear counts what waits
  (with the photos from home to mark and new feedback: `families.askCount`, small rows only) and Settings opens on
  Students then (after Photos); its button shows the count. History lines: photo sent / OK / not accepted / removed,
  name asked / OK / not accepted, birthday added / cleared.
- **Answer kinds** (key version 2, 4 Nov 2026, his voice note and screenshot: Stage 10 was all photos, and the guesser
  marked 11/4 right for "write 11/4 as a mixed number", 6/8 right for "simplify 6/8", a backwards order right for
  "ascending order", every ✓ / ✗ question a photo): the book engine writes each part's answer and its kind (`t`:
  box, fill, choose, tf, mark, order, match, photo; `convex/lib/key.ts` `Ans`, checked by `ansProblem` and the box
  rules; refused at upload in plain words). Nothing is then read from the key's words: a part without a kind is the
  teacher's. Marking (`typedPart`, `markPart`): a box = any of its accepted answers; `same` = written the book's way
  (`formKey`: 11/4, 2 3/4 and 2.75 differ, 6/8 is not 3/4, 0.50 is 0.5; `exprKey` for answers in a letter); an option
  all or nothing; ✓ / ✗ and pairs a share per right one; cards in order all or nothing; marked words = the right ones
  he marked less the wrong ones (marking everything gets 0). The phone gets how to ask (`Ui`: the cards, the pairs'
  sides, how many options), never the answers. Teachers read the answer and what he typed in words (`wantWords`,
  `slotWords`: "✓ ✗ ✓", "underline: 23, 29", "−3, −1, 0, 2"). The upload also checks that the printed question has
  as many slots as the key uses (`slotProblem`), else the zip is refused (the book and its key differ).
  **Names and reasons** (4 Nov 2026, his screenshot: a digitized question asking a pattern's name still asked
  for a photo; his answers: names as choices "build it now"; reasons: "first two buttons for yes or no, if
  that's wrong don't need to check the reason ... give the box for typing, they write in Thanglish, teacher will read
  the reason, but don't put the image upload option"): a **name** the paper doesn't print = choose with `below` and
  its names (`items`): the phone shows them under the question, one a line (`.f-pkn`), he taps the one he wrote; no
  printed slots are needed. **"Is it true? Give a reason"** = `why` (`a` = true for ஆம்): ஆம் / இல்லை to tap and a box
  for his reason in his own words, typed with the phone's own keyboard (never the app's pad; ≤ 300 letters,
  `REASON_MAX`). A wrong ஆம் / இல்லை = the part's 0 at once (nothing to read, and no working photo when that is the
  question's only loss: `lostOutsideReasons`); a right one leaves the part to a teacher: the Check puts his typed reason
  in Settings → Photos at once (a part row with no files, `said`), so he owes nothing and the level never waits for it;
  she reads ஆம் / இல்லை and his words (`reasonsOf`) and gives the part's marks. A reason question never comes back
  (`allPhone` / `phonePart`: the phone can't mark it alone) and its marks count as the teacher's in "See what the
  phone accepts". A drawing and "show that" stay photos.
- The server marks with the uploaded answer keys (`convex/lib/phone.ts`; a key without kinds, version 1): numbers,
  several numbers, answers in n (same values for n = 1..7), labelled answers (x = 52), "also accepted" notes. Since 4 Nov 2026 (his screenshot: "0.25 as a
  percentage" was the teacher's, so whole Percentages Stages were): a number with its unit (25%, 45°, −3 °C, 12 cm,
  24 cm², 250 ml; the unit inside the bold or just after it, "**25**%"), several units in order (2 h 30 min, 3 kg 250
  g, 3 மணி 20 நிமிடம்), ratios in order (2 : 3, "**2** : **3**"), points as x then y ((2, 3), P(4, 0)) and one set of
  numbers in any order ({1, 2, 3}, A = {…}). He types only the numbers. A one-letter unit needs a space ("5 m" = 5
  metres; "5m" stays an answer in m: before, "5 m" was read as an answer in m and his 5 got ✗). Names, yes/no with a
  reason, "show that", drawings, letters in a set, two sets, clock times with a.m./p.m. and anything unclear stay with
  the corrector (a wrong ✗ on a right answer is worse). The answers never reach the phone (it gets only each answer's
  shape, its unit and a ratio's ":"). A box he skipped goes as "" (✗). Settings → Books → a workbook → "See what the
  phone accepts" lists each answer as the key writes it ("2 : 3", "1 h 45 min", "{3, 6, 9} (any order)"), and for a
  part the corrector marks, the key's own words ("corrector: சிறப்புப் பெயர்"): the shape the phone couldn't read.
  **Money** (4 Nov 2026, his screenshot from Grade 9 fractions: "ரூபா 550 இன் 7/11" asked for a photo while "ரூ 750 இன்
  7/10" had a box; the keys copy each paper's word): ரூபா, ரூபாய், ரூ., Rs., LKR before the number, "/=" or "/-" after
  it, and thousands commas are read (`money`, `bare`): "ரூ. 1,250" used to become two boxes (1 and 250) and his 1250 got
  ✗. With money in the answer every thousands comma goes; without, only a number of two groups ("12,500"): "100,121,144"
  stays three terms. A key read differently later never strands a photo already owed (`partMarks`, below).
  **The proper solution** (4 Nov 2026, his second Grade 9 screenshot: "why this problem continues again and again"):
  the keys are free text written differently for each paper, so (1) the reader takes the general shapes: thousands
  with a space ("ரூ. 36 000", thin spaces too), ONE number among words inside the bold ("**மொத்தம் 36000**": bold is
  the final answer; never with =, +, ×, ^ or a letter beside the number), a label inside the bold ("**x = 36000**"),
  and working with no bold that is only arithmetic ending in "= a number" ("60000 × 3/5 = 36000"; "= 7²" stays a
  "show that"); (2) **the owner or a Books teacher fixes any answer in 10 seconds**: Settings → Books → the unit → See
  what the phone accepts → "Only the N the corrector marks" → tap a part → type the answer as the phone should read it
  → Save (or "Corrector marks it", "Back to the key"); table `phoneFixes` (unit, q, p, a, by, at), read through
  `phoneKeyFor` by every reader of the key (the phone's level, Check, the book, Photos), refused when the phone can't
  read it, kept when the key is uploaded again, moved with a tute; the list marks it ✎; history "the phone's answer for
  Q30: 36000"; (3) **a screen opened before a key changed never costs marks**: a level's questions are loaded once
  when it opens, so the phone sends how many boxes it showed for each question (`typed[].b`); a question the server
  now reads with other boxes goes to the teacher whole (a photo, `pm` = its marks), never ✗ for a box he didn't see;
  a question that came back but wasn't on his screen isn't marked (it comes back next time). Phones from before `b`
  are marked as before.
- **Fractions are written over a line** (5 Nov 2026, his rule after Preview, G8 U01 Q55: "students don't writing
  fractions with slash, they know only denominator and numerator ... fraction line is horizontal"). A box whose answer
  is a fraction ("3/4"), a mixed number ("1 3/4") or an answer in one letter over something ("n(n + 1)/2", "(n + 1)/2")
  is drawn as one: the numerator over a line over the denominator, the whole number first when mixed (`fracLook` sets
  `Box.f`; the key needs nothing new, every unit at once). He types a cell at a time: → and ␣ go to the next cell, then
  on; the pad's fraction key (a box over a line over a box, in place of "/") goes down to the denominator; ⌫ on an
  empty cell goes back; a tap on a cell picks it. What he types is still sent as one answer, as the server reads it
  ("1 3/4", "7/4", "n(n+1)/2", "(n+1)/(2n)"; `fracJoin`), so marking didn't change (7/4 = 1 3/4 unless the form is the
  point).
- **Answers in several letters** (5 Nov 2026, his report on G8 U05 Algebraic expressions, Level 1: "every question
  asking to take a photo ... then why we digitalizing?"). A box the book gives may hold an answer in 2 or 3 letters
  ("5x + 3y", "4pq", "2a(a + 5b)"), not only one letter: the upload took one letter only, so the book sent them to
  photos. The pad keeps every key in its place: the 1st letter where the one-letter pad has its letter, a 2nd and 3rd
  letter take × and /'s places (letters side by side multiply: 6xy needs no ×), and x² reads □² (it squares what is
  before it). The server works his answer out at 9 points (`POINTS_MANY`: each letter its own value, never 0) and
  compares it with the book's, so 3y + 5x is as good as 5x + 3y and 4qp as 4pq; a box the book marks `same` (simplify,
  factorise) takes only the forms it lists (the book lists every order of the terms). Letters side by side multiply
  only in such a box: everywhere else two letters are a word, as before, and "cm", "kg", "min" … are never letters
  multiplied. A 4th letter, a cube or an equation ("=") is not on the pad: those stay photos. One letter marks exactly
  as before (n = 1 … 7). **Letters are drawn in maths italic** (a serif italic, as the printed book does) on the pad's
  letter keys, in his boxes and blanks, in what he typed and in the final answers of the reveal and the book: in the
  app's font x looked like the × key. A unit after a number ("44 cm") and a part's label ("ii)") stay upright.
- **The answer boxes under each sub-question** (5 Nov 2026, his ask: "essay questions have so many sub questions ...
  after each sub question, I want to put the answer box"). When the question is printed on the phone, each part's row
  (its boxes, names, ஆம் / இல்லை, cards, pairs, or "do it on paper") sits inside the printed question right under its
  own sub-question: the paper's shadow root gets a named slot after each part's printed block (`slotParts`: the part's
  label against the printed `.rl`, the whole label or its last word, in printed order; after the sub-question's figure
  and the rest of its words, up to the next labelled one), and the row is the paper's child with that slot. A part that
  matches no printed label (a Part I question with two answers, a part printed without a label) goes to the end of the
  question, as before. A tap on a row never opens the question full screen.
- **The level screen comes after the first screen** (5 Nov 2026): `play.tsx` (a level, its result, a question full
  screen; `kinds.tsx` under it) was a quarter of the first load and the first screen never shows it, and both budgets
  were full; it is fetched right after the first screen (`level.ts`, named in the page so the service worker keeps it),
  and opening a level shows the waiting owl until it is here (on slow data, once). The first load went from 65.3 to
  about 55 KB.
- **The owner's Preview** (5 Nov 2026, his ask: check every question of a digitized unit "without answering the level
  one"; his answers: **only the owner** ("that's me only"), **only looking**, never for students or other teachers: a
  student must finish a level to see the next). Settings → Books → the unit → **Preview on the phone: every level open
  (only you)** (`PhoneAnswers`, `may("owner")`; a unit with a key) opens the family app on the class system's own
  address (`/f/#preview=<unit>`), which reads his teachers' sign-in from that address's storage (`aristora.token`):
  every level listed, a tap = the real level screen (`Play` with `look`: the question, its boxes, names, ஆம் / இல்லை,
  the pad), the pill says Preview, no Check, "Back to the class system" lands on Settings → Books (`takeReopen`).
  Server: `convex/preview.ts` (`unit`, `level`, `questions`), queries only (nothing can be written), `viewer(…,
  "owner")`, the same form as `family.level` without a student (no questions coming back, no locks; a change to one
  goes to the other). The phone side sends nothing else while it is on (`lookWith` in `net.ts`: only these three reads
  go out, with his token, and his free marks below; what it keeps is under `look`, apart from any child). On
  app.aristora.org there is no teachers' sign-in: the server says no. It lives in the family's later parts
  (`parts.ts`): its own file split the level screen's code out of the first load (+1.2 KB). Tute ladders (n < 0)
  aren't in it yet.
- **Free marks for a question out of the syllabus** (5 Nov 2026, his ask: the past papers have questions his students
  can't do; removing them would change the printed book's numbers, so "we have to make that as a all marks question
  ... giving free marks for that without doing"; his answers: the students who did its level already get them too,
  and Correction gives them in class). In his Preview, under every question: **🎁 Free marks for everyone (N)**, asked
  once more ("Yes, free marks"), and **Take back the free marks** on a free one (`FreeSwitch` in `play.tsx`; the
  only change `net.ts` lets out in Preview). Server `preview.setFree` (the owner only; every question of its level
  must have its marks): the workbook's `data.free` lists them (kept when the same book is uploaded again, gone with a
  book of other questions); **every student's level marked already gets the marks at once** (`setFreeIn`: the
  question's row becomes full marks, `fr` keeps the row before, the level's `got` follows, so XP, the race, reports,
  Evaluation and Theory all follow with no rule of their own; taking it back puts the row and the total back), and
  his "out of work" clock follows (`refresh`). Its photos waiting for a teacher close (`homePhotos.free`: he leaves
  Correction's ⌂ lane and Settings → Photos' count if nothing else waits; a teacher who still had his card open is
  told "This question is free marks now" at Save or Retake; taken back, they wait again, or go if their files went: he
  is asked again). Only a workbook **with an answer key** has a Preview, so only those have the switch; a unit
  without a key gets it once it is digitized (Correction would honour `free` on any workbook). **A level marked later**: the phone shows no
  question to do but a gift (`FreeCard`: confetti, "இலவசப் புள்ளிகள்! இந்தக் கேள்வி உன் பாடத்திட்டத்தில் இல்லை …",
  → goes on; a gold chip), its marks at Check (`free: true` in the result: 🎁 on its row, and in the level's book);
  Correction opens the level with its marks given (`withFree`: the strip's box gold and dashed, its card says "Free
  marks … nothing to mark", the big button only goes on; the Class page's level sheet shows "Free marks" in place of
  its buttons) and the server gives them whatever is tapped (`workbook.correct`). It never comes back in a later level. Settings → Books lists the free questions under the
  phone's share; the history: "Q55: free marks for everyone (out of the syllabus), 12 students who did its level got
  them now".
- **What he typed is kept** (4 Nov 2026, his idea: "show the wrong answer most students put"): every Check saves a row
  in `familyAnswers` (student, unit, level, time; each question with boxes: his answers as typed and which boxes were
  right). Nothing reads it yet; after a few weeks it gives each question's most common wrong answers (a hint after
  Check, Evaluation's groups: next, ask him). It goes when the student is wiped (demo, practice) and moves with a tute
  (`moveTute`). His chips idea (tap one of four for every answer) was turned down with him: guessing pays XP, the exam
  gives a blank line, the answer would be on the screen, and chips hide the mistakes nobody predicted. Chips are for
  names only (built 4 Nov 2026: choose `below`, above).
- **Corrected at home: solutions and photos** (4 Nov 2026, his voice notes: "if the student done at home, everything
  will be done at home"; `convex/lib/photos.ts` the rules, `convex/lib/homeWork.ts` the reads, `convex/photos.ts` the
  teachers' side, `src/family/book.tsx`, `src/family/photos.ts`, `src/photoQueue.tsx`):
  - **The level's book** (`family.book`, also returned by `check`): after Check, every question he lost marks on shows
    the key's working (`sol`, `**` bold = the final answer; his decision: only the ones he got wrong, only after his
    one Check) and what he typed (struck out). The reveal shows it under the rows; the Stage opens it again by tapping a
    level marked at home (`hm`). The right ones need nothing and are not listed. **A wrong one that comes back hides
    its solution** (his report, 4 Nov 2026: "they can go back to Level 1 and get the answer from there"): while it is
    still to come back (`comesBack`: the `retryPool` test, and a level at least 2 after its own not handed in) the book
    shows "↻ … மீண்டும் வரும். தீர்வு அதன் பின்." (`back`, `.f-comesback`) instead of `sol`; after his second try
    (right or wrong), or once the book is finished without it, the solution shows. His working photo is still asked.
  - **A level the server already has** (4 Nov 2026, his screenshot: Check said "This level is already marked", no
    summary, the next level shut): the phone keeps a level while he types, so a Check whose answer was lost (the signal
    dropped just after it) or a level a teacher marked in class kept showing the old level. Now, when opening the level
    or at Check, "already marked" clears what the phone kept for it and opens its book (marked at home) with "Level n
    ஏற்கனவே சரிபார்க்கப்பட்டது", or says the teacher marked it; any other refusal (photos first, levels in order) is said
    instead of the old level (`Play`: `marked`, `gone`, `onMarked`).
  - **Photos he owes** (`familyAnswers.owe`, written at Check, with each part question's marks as at that Check:
    `pm` the teacher's share, `pg` the phone's; `partMarks` reads them, and for an older Check a question the phone now
    reads is the teacher's whole): `part` = a question with a part only a teacher can mark
    (a drawing; a name or a reason the key gives no kind): during the level its card has a camera ("இதைத் தாளில் செய்து
    படம் எடு"), the photos are kept on the phone and go by themselves after Check. A typed reason (kind `why`) is never
    a photo: when every part the question left is a reason, the Check itself puts its row in the queue (`said`,
    `sayReason`), so nothing is owed for it; `working` = his working on each question he lost marks on
    (his rule, against my warning about the load: required). 1–3 photos a question, shrunk on the phone to ~200 KB
    (1280 px JPEG; drawing it again drops the camera's location), kept in IndexedDB per child until sent (no signal:
    next time the book opens), uploaded to Convex storage (`family.photoUrl`, 80 a day a phone; `family.photoSend`:
    images ≤ 900 KB; sending again replaces until she answers). Owed = not sent, not marked or explained in class (none
    once the class corrected the level); a retake is owed again (`owedOf`).
  - **His crop first** (6 Nov 2026, the founder's ask: "give me the crop feature for the student, so teacher can do the
    correction easily ... very easy for the students ... age 11 also"; `src/family/crop.tsx` `CropSheet`, rules in
    `src/family/frame.ts`): every photo he picks opens full screen, dark: "படத்தை வெட்டு" and one line ("மஞ்சள்
    புள்ளிகளை இழு: உன் விடை மட்டும் பெட்டிக்குள் இருக்கட்டும்."), the photo as big as the screen allows (small ones
    too), a yellow box around the **whole photo** (so சரி alone sends it as before: nothing lost if he doesn't
    understand), 8 big yellow dots (corners 52 px, sides 44 px to touch; they pulse 3 times at first), the box itself
    slides, outside it dark. Never smaller than 12 % of a side (`CROP_MIN`). Three buttons: திருப்பு (↻ a quarter
    clockwise, the box turns with the page: `turnedFrame`), முழுப் படம் (back to the whole photo; pale when it is), and
    the gold சரி; ✕ (or the phone's Back) = no photo added. What goes is cut from a copy with its long side 2560 px,
    then made small as before (`jpegOf`: long side 1280, JPEG): a cropped part reaches the teacher sharper and smaller.
    Its script is one of the parts after the first screen (`parts.ts`, opened by `Taker` through `loadParts` and
    `showSheet`); its style is in `family.css` (the later budget was full). No parts on the phone, or no app to show it
    (`showSheet` false): the whole photo, as before.
  - **His limit** (his rule: "without the explanation for a wrong question they can go 2 levels maximum"): once he has
    checked 2 more levels at home after the oldest level that still owes photos, the next level waits (`blockedBy`,
    in `playable` and `me.blocked`): the Stage says it above the road (`.f-stopnote`: "Level 5 திறக்க, முதலில் Stage 3 ·
    Level 2 இன் 9 படங்களை அனுப்பு", a tap opens that level's book, in any Stage), START and Continue open that book too. It waits on HIM
    (photo sent), never on the teacher's reply. The Stage shows each level's owed count (📷 n) and a dot for her answers
    he hasn't opened (`nw`; `family.seen` when the book opens). Settings → Photos (the owner) turns "required" off
    (`photos.setRequired`, meta `photos.required`): then nothing waits; photos can still be sent.
  - **Marking them: Correction's ⌂ lane** (5 Nov 2026, `src/homeLane.tsx`; his voice note: "within one day I get 42
    photos ... very hard to check each question one by one ... each individual sub question, I want to put the marks
    ... rotation button"; his answers: inside Correction, its own lane, Photos people only, build it now). Until then
    Settings → Photos showed one photo at a time with one row of marks for the whole question.
    - **Who:** the owner and the people he ticks **Photos** (Settings → People → Also). The gear's count still adds the
      photos waiting (red when one waited over a day; Settings opens on Photos then): Settings → Photos keeps how many
      wait and since when, the owner's "Photos required" switch and **⌂ Mark them in Correction** (`PhotoQueue`,
      `onPhotos` → `openLane`). Someone with Photos but **not** the Correction job gets the Correction tab with only the
      lane (⌂ dark and fixed, + pale; its tab's number = the photos waiting; her phone keeps her own job's alerts, never
      Correction's calls: `photosOnly` in `app.tsx`).
    - **The lane, never mixed into the hall** (my warning, his yes: a name lit on the names row means "a boy is sitting
      here waiting"; home photos there would take the corrector away from idle students): **⌂** after **+** on the
      names row, always in the same place (`HomeButton`: the questions waiting, amber, red after a day; dark while on).
      On: + pale in its place, the names row = this grade's students with photos, oldest first (`HomeNames`: amber, red
      after a day, the count on each), the grades row keeps its places with badges = students with photos
      (`laneGrades`); entering it leaves the hall's paper (a level marked to the end saves itself, the book is free
      again) and shows the grade with the oldest photo if this one has none (once). ⌂ again = back to the hall. A reload
      starts in the hall. Who and how many come from `photos.lane` (photo rows only: his name and grade from the board,
      so a tap in class never runs it again).
    - **His photos** (`HomePaper`, `photos.student`: his waiting photos, oldest level first, then the book's order, a
      part before his working): his levels with photos (one line; "unit·level" when several units), the open level's
      line (Level, unit number + Tamil, how many to mark, "checked in class"), its questions as Correction's squares (one
      she answered keeps its square with her marks; R = asked again), then one question on **Correction's card**: Q,
      marks, "to mark" / "wrong answer" / "his reason to read", ‹ back, the printed question's icon (`catalog.question`
      allows Photos now). **His photos big**, as wide as the card: **↻** in the corner turns one a quarter (the box takes
      the turned photo's room: `Turned`; remembered while the app is open), a tap = full screen (the whole photo, turned
      the same, ↻ and ✕; a tap there = 2×, scroll it).
    - **Each sub-question its own marks** (`PartRow`, `photos.partsOf`): each part with its label, the key's answer big
      (`BigAnswer`), what he typed (right green, wrong red) or his reason (ஆம் / இல்லை + his words), then its marks in
      one row (Correction's part row). A part question: the parts the phone left, nothing lit until she taps (never
      "untouched = full"); the phone's own parts show "x/m the phone's"; Save adds them (`got` = her share, as before).
      His working on a wrong answer: the phone's marks lit, she changes them when his working earns more (method marks)
      or less (`photos.mark` `total`); full marks and the question is no longer lost. One row of marks (0 … `teach`, or 0 … max) when the parts can't
      be split: a unit with **no key** (the app doesn't know its sub-questions: only a key gives them) or a question the
      phone read differently at his Check (`split`).
    - Then her own words (optional, he reads them). **No reason** (6 Nov 2026, the founder's rule: "the photo is for
      correction only, not for explanation"): the "why it was wrong" chips and the part remarks are gone. The pad, fixed
      at the bottom like Correction's: **Retake** (blurry / wrong page / cut off: asks him again and deletes the files at
      once; pale for a typed reason or one corrected in class) and **Save x/max · next** (green full, amber part, red
      0); Correction's tap guard (350 ms, Save 700 ms after a new card). Save → the next question, then his next level, then round to any she skipped, then the
      next student by himself (this grade first, oldest first; "Hana done. Next: Omar."), then "Every photo from home is
      marked". The next card scrolls back to its squares, so the photo shows from its top.
    - The marks count at once (the level's `got`, XP; history "marked from his photo"; old rows still show `WHY[..].ta`
      and "photo-why"). **A photo never counts as explained**: every question still lost waits for Evaluation in class
      (`x` is never set here; only Evaluation, or the question coming back right, explains it). `why` is still accepted
      from a page opened before 6 Nov 2026, and ignored.
    - **Corrected in class = the photos close** (6 Nov 2026, his report: a photo of a level already corrected in class
      asked "why it was wrong", and saving it would have marked it explained, so Evaluation would skip it): when
      Correction saves a level marked at home (`workbook.correct`) or taps ⌂ Checked (`workbook.homeChecked`), every
      photo still waiting for that level closes (`closeClassPhotos`: `cls`, `seen`, its files go a day later like any
      marked photo); his phone says "வகுப்பில் திருத்தப்பட்டது: விளக்கம் வகுப்பில்." (`CLASS_SAY`), owes no photo for
      that level (`homeChecks`: `hc` = nothing owed, so his 2-level limit no longer waits on it) and can't send one
      (`photoSend`: `LevelBook.hc`); his wrong answers stay lost for Evaluation. A card still open meanwhile says
      "Corrected in class already (x/y): Close it." and Close only closes (`mark` → `already`); photos left waiting
      from before this (or a race) close in the hourly sweep. Class still checks his paper (⌂ Checked: his answer,
      "the class check is enough"). `photos.queue` (20 at a time, the old page's) stays for a page still open.
  - **Questions that come back** (his idea: "even after explanation they will forget, so the same question will come
    again in their path; if they do it correctly, bonus points"): a question he lost marks on (at home or in class) that
    the phone can mark entirely comes back at the end of a level at least 2 later in the same book (`retryPool`:
    `RETRY_GAP` 2, `RETRY_PER_LEVEL` 3, the oldest first, one second try each). The chip says ↻8, the card "Level 1 இல்
    தவறியது" and "↻ +2 XP" (the marks he lost). At Check (`family.check`, the same pool computed before anything
    changes): his new marks are kept beside the first ones (`MQ.rt`, `rg`: the unit's marks, Progress and the reports
    keep the first try); right = explained (`x`: Evaluation skips it, and its working photo is no longer owed); the marks
    he won back count as XP the day he won them (`xpItems`: never more than he lost, so a wrong first answer never pays).
    A ↻ question is printed too (`family.questions` adds the same pool; 4 Nov 2026 it said
    "இந்தக் கேள்வி இன்னும் phone இல் இல்லை" because only the level's own questions came).
    The reveal: "↻ பழைய கேள்விகள் 1/2 · +2 XP" and the XP pill includes them. History: "old questions back on the
    phone (Q8): 1/1 right" (`retry-home`). A re-mark of the old level in class drops its `rt` (it may come back once
    more).
  - **Nothing kept**: an hourly cron (`convex/crons.ts` → `photos.sweep`) deletes the files of photos marked a day ago
    (the marks and her answer stay), of photos waiting on a level taken back in class or of a removed student, and
    image uploads never attached after a day. A removed (wiped) student's photos go with him; a tute's move takes them.
- A level checked at home is a marked level with ⌂ (`lv.home`): Evaluation and Theory see its lost marks at once.
  Correction: ⌂ on his name and the level; it opens with the phone's marks: **Checked** (`workbook.homeChecked`), or
  change a mark / mark what the phone left (that checks it too, `lv.hc`).
- Family phones have their own tables (`familyLinks`, `familyDevices`: SHA-256 of code and token) and hash tag: they
  can never pass a teacher's check; every function in `convex/family.ts` checks the family phone. The teachers' side
  (`convex/families.ts`) = the owner or a teacher with Students (Feedback: the owner or a teacher with Feedback; Class
  hours: the owner; students' asks, a photo for the race or a new name: the owner or Students). A profile photo goes
  only to his own phone and, once the teachers said OK and his family shows it, to his grade's phones
  (`family.photos` checks each picture: his, or an approved one of a classmate in his grade, not hidden, not removed);
  it is an image address built from its checked type (`picUrl`), never a page or a script.
- Later, not now (his words, 3 Nov 2026): the app may serve other centres one day (a SaaS); today it is only for
  ARISTORA's own students (a sign-in comes from the class). The centre's name sits in one place (`BRAND`) and the
  colours in `:root` of `family.css`. Gifts for winners: his idea, not built.

## Accounts and security (built 2026-10-28)

**Who.**
- One owner and teachers.
- Teachers get jobs (`correction`, `theory`, `evaluation`, `manager` (3 Nov 2026: the Class tab's powers: send any
  student to any teacher, mark teachers arrived / went, every teacher's card; with any job or alone); People shows them
  as "Jobs" with what each opens) and extras:
  - `students`: add, rename, remove;
  - `books`: workbooks (typing and uploading) and unit names;
  - `reports`: Reports, History, the Students page numbers, and **Progress** (page and poster);
  - `feedback` (3 Nov 2026, his answer "me and selected people"): Settings → Feedback, what students send from the
    family app, and its count on the Settings gear (`families.feedback`, `feedbackNew`, `feedbackSeen`);
  - `photos` (4 Nov 2026, his answer "people I pick"): marking the photos students send from home, in Correction's ⌂
    lane since 5 Nov 2026 (the Correction tab with only the lane for someone without the Correction job), Settings →
    Photos and its count on the gear (`photos.count`, `lane`, `student`, `queue`, `question`, `mark`, `retake`,
    `required`; `catalog.question` and `catalog.bookCss` for the printed question); turning "photos required" on or off
    is the owner's (`photos.setRequired`).
  - `consult` (5 Nov 2026, his ask "not for everyone, the people I pick"): the top bar's Consultation page:
    `consult.totals`, `calls.create` with `consult` (to herself only), and on her OWN consultation's calls `arrive`,
    `unarrive`, `cancel`, `finish` (`ownConsult` in `calls.ts`), and `consult.mark` (only for a student with her). It
    gives nothing of the rooms (the Evaluation page's `workbook.explain` etc. still need Evaluation).
- Everyone signed in sees the Class tab and the Register, reads `people.team` and `manager.day`, and her own card
  (`duty.card`). Correction job = the Correction page and Attendance (`setPresent`, `attendance.day`;
  `by: "attendance"`), Books given (`students.setGiven`), sending called students, Going home, Back in the hall, End
  the session. `progress.student` (the unit sheet's numbers) = Correction, Evaluation or Theory.
- Workbook permissions: `correct`, `uncorrect`, `levelDone`, `toTheory`, `reteach`, and Correction's drafts
  (`focus.drafts`/`mark`/`drop`) = Correction or Evaluation; `explain` = Evaluation; `taught` = Theory or Evaluation.
  `calls.lessons` = Theory or Manager; `calls.keep` = Evaluation. Manager job = the Class tab's powers: `calls.create`
  for any teacher (`teacherId`, `visit`), `unsend`, Correction's hall taps on calls (`send`, `decline`, `undoDecline`,
  `cancel`, `arrive`, `unarrive`, `release`), `duty.mark` / `move` / `undo`, any teacher's `duty.card`. The owner's own
  switch: `people.setTeaching`.
- Owner-only: People (user management), demo students, the simulation (start, +5, level, End, delete its students; the
  steps' nudge is any signed-in phone), and the account lines of the history (sign-ins, PINs,
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
