# How the class works: every screen and rule, as built

The technical memory of the app, kept with the code and updated in the same commit as the change it describes (moved here from the aristora-system skill on 31 Oct 2026). "Section N" means the skill's section N (0–4 his rules, 6 accounts, 7 status, 8 open questions, 12 decisions) or these files: 5 = `how-it-works.md`, 9 = `map.md`, 10–11 = `making-changes.md`.

**Students.**
- Each student has a grade (6–11), a term (1–3), a stage (`fighter|master|legend|sprint`) and a unit ("his book
  now": the one Correction last opened). **He works on several books at once** (`ce6fe9d`): every book with
  something waiting reaches the rooms (below, "Several books").
- `back` remembers where to return after Exam Sprint.
- `present` is set in Attendance (or by demo load); `lastInAt` = his last arrival (home time = +2 h on the
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

**Grade pills:** on Class and the Evaluation page, "All 7 9 11" for the grades in class now (hidden with fewer than
2), each with how many are here and a red/amber badge for what waits for this job there. Remembered per job
(`aristora.grade.<job>`); falls back to All when that grade has nobody.

**Fighter (theory book).**
- The book has sections:
  - ladder A–F: teacher questions ("teach", double-ring circles) and solo questions;
  - past papers P, with year labels;
  - final challenge X.
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
- Theory ticks names on a lesson card and taps **Call**; Evaluation ticks names on its page. Correction's phone says
  "Ahamed and Nila, go to Theory" every 30 seconds until Correction taps Sent or × (not now, undoable).
- Theory comes first: Theory can take a student straight out of Evaluation (pull: Evaluation hears "Theory wants
  Kumar now" and taps "Send to Theory"). Theory calling someone Evaluation had **called** cancels her call: the
  theory call carries `bumped`, and Evaluation's page says "Theory took Kumar first" while it lasts.
- When Theory is busy, Evaluation can teach theory itself ("Teach").
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
  Replaces / Already in the app / refused-with-reason, and one tap saves them (`saveWorkbook` with `replace`).
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

**Theory page (rebuilt 30 Oct 2026, `b4ac688`, his voice note; `src/theoryFocus.tsx`, rules in `src/theoryFocusData.ts`).**
Like Correction: small things in fixed places.
- **Pinned** (`.tp-stick`): today's score in one thin line (`TodayStrip compact`), All / Fighter / Master (`KindBar`,
  pale at 0, red count), then every lesson as a tiny pill in ONE sideways line (`HRow`), the most useful first
  (`planLessons`): grade chip, unit number (Fighter: "13·D"), the Tamil name (Fighter: the section's Tamil title),
  how many need it; a red (no work now / starving) or amber (soon) line under it (`pillTone`); Fighter = blue left
  edge; a lesson going on in her room = blue count (`lt-going`). The order holds still (`nextOrder`): it re-ranks
  only when a lesson comes or goes or its colour or count changes, never within 5 s of her last touch on the row
  (`HOLD_MS`); after Call or Done at once. The first pill is open by default; the open one shows its whole name.
- **The open lesson** (`LessonList`): one line of facts ("teach Q23–26", "Q13 ×2: teach once", "in your room: 1 ·
  room for 5") + Page's pick; one row per student: tick, name, what he does (`memberWords`), what he needs ("Q13
  Q17", "whole unit", "Q26"). A lesson going on: ticks only who can join, up to its room left ("Lesson full: Done
  first").
- **Fixed at the bottom** (`.tp-pad`, sticky; `.tp-body` min-height puts it in the same place on a short page):
  left **Room N** (amber line = someone on the way, red = late) / in her room **Lessons N**; right **Call N** /
  **Done**. Toasts sit just above them (`body.tp-padded`).
- **Her room** (`roomItems`): everyone she called, pills in call order that never move: dashed = called or on the way
  (`rs-call`, `rs-walk`), red line = not sent 3 min or not there 3 min after Sent (`rs-late`), solid = with her
  (`rs-in`), amber ring = didn't get it (`rs-stay`). The line above: "2 with you · 1 on the way · 9m" (amber "Still
  with you?" at 20 min).
- **His file** (`StudentFile`, "like a doctor"): name, where he is, ONE big button in a fixed place: **Arrived**
  (then the next one on the way opens by itself) → **✓ Got it / Not yet: stays**. His lesson (grade, unit, Tamil);
  Fighter: the teach questions as toggles ("Taught"; untick what the bell stopped); workbook (`FileQuestions`): each
  question for Theory with what he got ("got 0/2", "? couldn't start"), who sent it and when, explained at, the
  answer (`catalog.key` while open), Whole unit toggle; his unit bar (`MasterStrip`, "On L4 · so far 85% · 1 for
  Evaluation") or Fighter's "N questions left before he needs it"; came / home times, no work; other books waiting.
  Links: Send him back without it / Cancel the call. **Done** sends back everyone with her who got it
  (`calls.finish`; part-taught workbook: `workbook.taught` first); an empty room goes back to Lessons by itself.
  Not in the file yet: past lessons (needs an events query by student, section 8).
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

**Evaluation page (rebuilt like Theory, `17919d8`; `src/evalFocus.tsx` `EvaluationPage`, rules in `src/evalFocusData.ts`).**
- **3 with her at once** (`EVAL_CAP`, his number), counting those called or on the way. Shared pieces with Theory in
  `src/roomkit.tsx` (`KindBar`, `usePinned`, the icons) and the `.tp-*` styles (pinned rows, pad, room pills, file).
- **Pinned:** today's score in one line; the bump note ("Theory took Kumar first.") and the pull banner ("Theory wants
  Kumar now" → **Send to Theory**: sends what she marked) when they happen; then the grade pills and All / Fighter /
  Master (list) or the room line + her room's pills (room).
- **The list** (`candidates`, evalQueue order, one entry per book): same question for 2+ as tiny pills in one line
  ("13·Q22 ×2": a tap ticks them); "room for N" / "Room full (3 with you)" + Clear ↔ Page's pick; rows (`CandRow`,
  `.ev-c` + `h-red/h-orange/h-yellow`): tick, name, his questions (grade chip + unit number when it matters, never
  U-codes), why ("stuck: Q18", "no work 6m", "waited 14m", "ready in 4m") and what he does meanwhile; "Later"
  divider; someone Theory has is listed, not callable. The page ticks the most urgent that fit (`defaultEvalTicks`).
  **Theory is busy** (`canTeachHere`): tick, "Teach N". Gone home with levels to correct at the end.
- **Fixed at the bottom:** **Room N** / **Call N** (`ev-call`); in her room **Waiting N** / **Done** (`ev-done`) for the
  open file: "All explained" (nothing decided), "Done: back to work", "Done: taught" (teaching theory), "Send to
  Theory" (Theory wants him).
- **Her room** (`evalItems`, `evalWords`): everyone she called, pills in call order (`rs-call`, `rs-walk`, `rs-in`,
  `rs-late`; amber ring = Theory wants him). **His file** (`EvalFile`): name, where he is, **Arrived** (a fixed place)
  → "N to explain"; his book (grade, unit number, Tamil); his questions as a strip, ONE at a time with what he got and
  the answer (`catalog.key` while open), **→ Theory / Not now / Explained** (next by itself; tap again = undo); "1
  explained · 1 to Theory · 1 stays"; **keep him for unit 9 (1)** (`calls.keep`) or "Also waiting"; his unit bar and
  day; Send back: nothing explained / Cancel the call. Done (`finishPlan`): a theory book's "→ Theory" sends its
  section back (`reteach`); workbook → `workbook.toTheory` first. An empty room goes back to the list.

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
- Owner-only: People (user management), demo students, and the account lines of the history (sign-ins, PINs,
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
