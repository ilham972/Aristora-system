# Map: where everything is

The technical memory of the app, kept with the code and updated in the same commit as the change it describes (moved here from the aristora-system skill on 31 Oct 2026). "Section N" means the skill's section N (0–4 his rules, 6 accounts, 7 status, 8 open questions, 12 decisions) or these files: 5 = `how-it-works.md`, 9 = `map.md`, 10–11 = `making-changes.md`.

## His words → the file

| He says | Go to |
|---|---|
| sign-in screen, setup, link sign-in, PIN screen | `src/signin.tsx`: `SignIn`, `LinkSignIn`, `OwnerSetup`, `PinSignIn`, `PinSheet` |
| header / top bar, Class/Progress icons, the count + clock capsule, tab bar (Correction, Theory, Evaluation), which tabs and job, alerts banner, loading | `src/app.tsx`: `App` (`page`: board/class/settings/progress, `tab` (correction/theory/evaluation), `home`, `base`, `backTo` + `toggle`, `goClass`, `canCorrect`, `canProgress`, `shown`, `papers`/`papersRed` (Correction's tab count), `idleNow` (Class badge), `attOpen` (Attendance from the count or Class), tab badges (`tb-amber`)), `TopStat` (count, clock, `LinkDot`), `TABS`, `JOBS`, `loadStart` ("focus" = the Correction tab), `loadJob`, `classJob`, `role`; `alertItems` (Correction: calls, `lost` = not at Theory 3 min after Sent), `sayFor`, `LinkBanner` |
| Progress page, progress sheet, race per unit, who finished what, filters | `src/progress.tsx`: `Progress`, `Filters`, `Units`/`LaneCard`/`RaceRow`/`RaceBar`, `Term`, `PosterSheet`; the lists in `src/progressData.ts`: `buildLanes`, `buildTerm`, `stageCounts`, `dayTotals`, `usualTerm`, `filtered` |
| CEO page / owner dashboard: pending workload, today's numbers, do I need another teacher, students a day, Fighter vs Master, money, who is leaving, books missing | `src/ceo.tsx`: `CeoPage` (`useTab`, `useOverview` = `fetchOnce` + 5 min), `NowTab`/`Advice`/`RoomCard`, `TodayTab`/`ClassLine`/`History`/`personWords`, `TeamTab`/`Verdict`/`StageTable`, `BusinessTab`/`MoneyCard`; pieces `Tile`, `Dot`, `Meter`, `Bars` (tap to read; `sel`/`onPick` share one reading), `Names`; lists and words `src/ceoData.ts`: `nowOf` (+`RoomNow`), `adviceOf`, `classDays`, `teamLoad` (`TEAM_CLASSES` 10), `idleRate`/`idleTone`/`busyTone`, `usual`, `risksOf`, `matrixOf`, `cameWeek`, `attendanceBars`, `minWords`, `rs`, `dayWords`, `GUESS`; arithmetic `convex/lib/ceo.ts` |
| one student's sheet, individual progress, the parents' WhatsApp image, rank switch, teacher's note | `src/studentSheet.tsx`: `StudentSheet` (`Body`, `UnitRow`, `Bar`, `Grid`, `Num`), `ShareSheet`, `RankOf`; the model and image `src/studentReport.ts`: `buildModel` (`Model`, `UnitLine`), `drawReport` (`HEAD`, `GAP`, `FOOT_TOP`, `levelBar`, `wrap`, `WEEK_TA`), `reportFile`, `lastWords`, `nth`; server `progress.report` |
| the poster, WhatsApp share, poster Tamil words | `src/poster.ts`: `paginate`, `drawPoster`, `drawPage`/`header`/`totals`/`laneBlock`/`row`/`footer`, `posterDate`, `posterFiles`, `shareFiles`, `saveFiles` |
| Attendance (full-page sheet), signing students in, arrival time, grade badges 6–11 | `src/attendance.tsx`: `AttendanceSheet` (`grade`, `only`); the grade row is `GradeRow`/`useGrade`/`GRADES` in `src/ui.tsx` |
| grade pills on Class/Evaluation ("All 7 9 11", badges) | `src/grades.tsx`: `GradePills`, `needsOf`, `gradesOf`, `useGradeFilter` (per job), `inGrade` (Correction has its own fixed 6–11: `GradeBar`) |
| Class page / class tab / home tab (top bar icon): control panel (stage tiles, unit pills, status chips), call strips (+ walking to Theory, "isn't in Theory": Reached / In the hall), empty class, gone home, End the session, legend per job | `src/correction.tsx`: `ClassPage` (`job`, `LEGEND`, `STATUS`, `heatOfRows`, `unitsOf`), `CallsBand` (exported, also in Attendance and Correction; one strip per teacher; `.cs-walk`, `.cs-lost`) |
| Correction page (ex-Focus): pinned names row with + and fixed grades, his unit chip (unit pills popover, Books given), Marks card, signed-out line, also handed in (other books), level bar (E/T dots), one question at a time, E/T on boxes, ? on a part, Later, saving on another name, the next level, unit finished, drafts, theory books, Take back | `src/focus.tsx`: `Focus` (`.fc-stick`, `useFocusGrade`), `NameBar` (+ and the names), `GradeBar`, `StageUnitSheet` (`mode` move/given, `flip`, `UnitCell`), `SavedSheet`, `PaperView`, `PaperHead`, `SignedOut`, `AlsoHandedIn`, `TeachLine`/`TEACH_WORDS`, `LevelBar`/`LevelLine`, `MasterPaperView`, `OverView`, `NoBookView`, `useCardInView`, `Marking`, `Strip`, `QuestionCard`, `GoButton`, `Summary`, `FighterPaperView`/`FighterStrip`/`FighterCard`, `qLabel`; module functions `paperFor`/`paperAt`/`masterAt`/`remarkAt`, `saveLevel`, `leave`, `openFor` (his book with something to correct, never moving him)/`openBook`/`openLevel`, `moveTo` (a book he hasn't started), one corrector per book: `holdFor`/`claimBook`/`stillHere`/`lostBook`, `GiveSheet`, `AskSheet` (module state `holding`, `asking`, `latestClaims`), `takeBackLevel`/`takeBackMarks` (module state: `openPaper`, `saved`, `carry`, `latestDrafts`); rules in `src/focusData.ts`: `bookId` (a view's own book), `viewOfPaper`, `bookToOpen`, `heldOne`, `focusPills`, `focusGrade`, `gradeNeeds`, `autoLevel`, `nextOpen`, `nextBook`, `levelLook`, `unitDone`, `savedGiven`/`sameGiven`, `unitNo`, `nothingWhy`, `candidates`, `openLevels`, `markedParts`, `marksOf`, `sumOf`, `blankWords`, `nextIndex`, `routeOf`, `itemsOf`, `beforeOf`, `carryLevel`, `fighterQueue`, `extendQueue`, `draftOf`, `fromDraft`, `resumeAt`, `focusNeeds`, `TAP_GUARD_MS`; saving in `src/focusSave.ts`: `queueDraft`, `dropDraft`, `setFighterMark`, `flushFocus`; the one-line rows in `src/hrow.tsx`: `HRow` (`list`, `at`, `idle`), `edgesOf`, `centreOf` |
| Theory page / theory tab (one screen, 31 Oct 2026, like Evaluation): grades 6–11, Fighter/Master/Legend, units, lessons (sections; a workbook's questions by the same students; whole unit), her room box with Call / Arrived / Done, the squares, one question with who needs it and the answer, Not reached / Taught at the bottom, his file | `src/theoryFocus.tsx`: `TheoryTab` (`pick` = her picks per row, `ticks`, `dec` per book, `at` = open square, `fileId`, `order` + `touched` (the lessons row's hold), `choose` (a decision for everyone with her who needs it), `cycle` (his own, in his file), `finish` (decided / all / nothing), `arrive` (several), `cancel`), `callTheory`, `LessonPillButton`, `squareOf`, `RoomPill`, `TheoryFileSheet`, `qWords` (marks + who sent), `qShort`; rules `src/theoryFocusData.ts`: one screen `THEORY_GRADES`, `rowHeat`, `tallyLessons`, `lessonGrade`, `theoryGradeRow`, `theoryStageRow`, `theoryUnitRow`, `lessonPills` (`LessonPill`), `lessonPillSig`, `holdOrder`, `needsOf`, `theorySquares` (`TheorySquare`, `TQ`), `TDecision`/`TDecisions`, `itemKey`, `decOf`, `tUndecided`, `tAllDecided`, `theoryFinish`, `tDecisionWords`; the plan `paceOf`, `classPace`, `outInOf`, `lessonLength`, `planLessons` (`memberOf`, `memberOrder`, `lessonOrder`), `defaultTicks`, `memberWords`, `whyWords`, `redCount`, `kindCounts`, `lessonHeat`, `heatOf`, `roomLessons` (here = arrived; coming = called or walking), `startIn`, `roomLeft`, `joiners`, `toPlan`, `workbookDone`, `teachLeft`, `lessonKey`, `pillTone`, `nextOrder`/`PillOrder`/`HOLD_MS`, `roomItems` (`RoomItem`, states here/walking/called/eval, `late`), `roomWords`, `sinceWords` (no "0m"); `LESSON_CAP` 6, `LESSON_MS` 12 min, `PACE_MS` 4, `WAIT_MS` 20, `LATE_SEND_MS` 3, `STAY_MS` 2 h |
| Evaluation page / evaluation tab (one screen, 31 Oct 2026): grades 6–11, Fighter/Master/Legend, units, question groups (each the most urgent first), her room box with Call / Arrived / Done, the questions as squares, one question with the answer, → Theory / Not now / Explained at the bottom, his file, keep him for his next book, teach here, pull banner, bump note | `src/evalFocus.tsx`: `EvaluationPage` (`pick` = her picks per row, `ticks`, `dec` per book, `at` = open question, `fileId`, `finish` (several at once), `keep`, `arrive` (several), `cancel`, `choose` (a decision for everyone with her who has it)), `callEval`, `RoomPill`, `squareOf`, `EvalFileSheet`, `TEACH`; rules `src/evalFocusData.ts`: `EVAL_CAP` 6, `EVAL_GRADES`, `tally`, `bookGrade`, `gradeRow`, `stageRow`, `unitRow`, `qGroups` (same students → one pill), `sessionQs`, `undecided`, `allDecided`, `candidates` (why/work/heat/hold; one per book), `workWords`, `evalRoom`/`evalItems`/`evalWords` (with `me`: her room), `evalLeft`, `canTeachHere`, `finishPlan`, `decisionWords`, `lostWords`, `nextBooks`, `qLabel` (and the old list's `evalCounts`, `sameGroups`, `defaultEvalTicks`, still tested); shared with the Theory page: `src/roomkit.tsx` (`GradeRow`, `KindBar`, `LessonName`, `AnswerKey`, `LockIcon`, `usePinned`), `byUrgency`/`NO_HEAT` in `src/theoryFocusData.ts` |
| a register row: now and next, circles, → Theory, the opened row and its buttons | `src/board.tsx`: `Register` (`pace`; holds the sheets), `Book` (buttons first: Going home, Needs theory, Back in the hall, Move; then the book), `theoryCircles`, `masterCircles`, `Actions` (per job and book), `GoneHome`, `NobodyHere`; now/next words in `src/nextData.ts`: `nowOf` ("On U09"), `nextOf` (+ other books' chips), `SOON_MS` 5 min |
| what a row means, queues, groups, same mistake, is the class live, several books, on the way to Theory | `src/derive.ts`: `buildViews` (+`others`, `noWork`, `otherWork`, `key`), `bookView`, `withBooks`, `waitingAll`, `seenToday`, `liveSession`/`STALE_MS`, `theoryGroups`, `theoryMembers`, `evalQueue`, `evalUrgencyOf`, `sameMistakes`, `roomCalls` (`walking`, `walkMs`, `lost`; with `me`: her own room, `isMine`), `isWalking`, `WALK_MS` 3 min, `roomBusy` |
| the tiny progress pills / workbook bar and its L markers, marks table, correct sheet, ?, lost marks to Evaluation/Theory, Needs theory sheet, answers while correcting | `src/master.tsx`: `KeyLine`, `markerRuns`, `MasterStrip` (pre levels pale), `theoryWords`, `theoryChoices`, `TheorySheet`, `MasterBook` (pre = "✓ / max"; "E 2" / "T 1" = still waiting), `CorrectSheet` (`dk`, keeps `dkp`, `route`, Handed in / Not handed in, fetches `catalog.key`) |
| moving a student (next unit or stage, Exam Sprint) | `src/move.tsx`: `nextSteps`, `MoveSheet` (Correction's unit chip and Next mirror it: `moveTo`, `nextBook`) |
| the family app (app.aristora.org): the join link, Worlds, levels, the number and n pads, Check, the reveal, XP, streak, this week's board; Settings → Students → Family; what the phone accepts | `src/family/app.tsx` (`App`), `src/family/net.ts` (plain HTTP to Convex: `query`, `mutation`, `peek`, `join`, the family token), `src/family/sound.ts`, `src/family/family.css`, `src/family/main.tsx`; `public/family/` (`index.html`, `sw.js`, `family.webmanifest`); teachers' sheet `src/familySheet.tsx` (`FamilySheet`, `PhoneAnswers`, `familyUrl`) |
| Settings tabs and who sees them | `src/settings.tsx`: `SETTINGS_TABS` |
| Students page (grade filter + add, rename, remove, bring back) and its numbers; the test class (copy a grade, the extra test students, delete them, this phone's switch) | `src/settings.tsx`: `Students` (`testing`: the test class's list, no Add form, the test students' notes), `StudentNumbers`, `TestClass`, `TestSwitch` (also in `Account`), `Demo`; the maths in `src/stats.ts`; the phone's choice `testMode`/`setTestMode` in `src/store.ts` (`aristora.testClass`); TEST in the top bar: `TopStat` `test` in `src/app.tsx` |
| Books page, F/M/K pills, typing in a workbook, renaming units | `src/settings.tsx`: `Books`, `UnitSheet` |
| upload workbooks, unit zip, "mastery book" files, answer key file, the O/L essay tute zip ("fighter + mastery"), questions in the app | `src/upload.tsx`: `UploadBooks`, `uploadRows` (`tuteRow`, `howMany`), `saveQuestions` (batches); the reader `src/workbookFile.ts`: `readWorkbookFiles`, `readWorkbookHtml`, `readKeyFile`, `attachKey`, `nameHint`, `readTuteFile` (`ReadTute`); the cards `src/bookQuestions.ts`: `questionCards`, `tuteQuestions`, `workbookQuestions`, `bookCssOf`; showing one `src/bookQuestion.tsx`: `QuestionToggle`, `BookQuestion` (shadow root, `PHONE_CSS`, `safeFragment`); the server's check `convex/lib/questions.ts`: `unsafeHtml`, `unsafeCss`, `cleanHtml`, `QUESTIONS_BATCH_MAX` |
| Alerts page (test, voice, "Sounds on my taps", phone setup steps); the small sounds | `src/settings.tsx`: `Alerts`; alerts in `src/sound.ts`, `src/chime.ts` (kinds call/pull/red/lost), `src/announce.ts` (`callPhrase`, `pullPhrase`, `lostPhrase`: by room, then teacher: "go to Nila in Evaluation"); tap sounds in `src/tones.ts` (`tone`, `armTones`, `tonesOn`) |
| Reports | `src/settings.tsx`: `Reports`; `src/report.tsx`: `ReportView`; built server-side in `closeSession` (`convex/lib/backend.ts`) |
| History lines (wording) | `src/settings.tsx`: `describe()` (+ book-given, keep), `History` |
| Account page (PIN, sign out, privacy notes) | `src/settings.tsx`: `Account` |
| People page (owner): add a teacher, jobs, phones, links | `src/settings.tsx`: `People`, `PersonSheet` ("Jobs" with `TAB_HELP`), `LinkSheet`, `TAB_NAMES`/`EXTRA_NAMES` |
| tapping circles, saving, undo | `src/taps.ts`: `nextState`, `canTap`, `tap`, `tapSection`, `flushTaps` (save after 900 ms) |
| circle look, sheets (`full` = the whole screen; `cls` = one sheet's own look; `openSheets` counts the lock), toasts, empty boxes, grade row | `src/ui.tsx`: `Q`, `Sheet`, `Toasts`, `Empty`, `STATE_WORDS`, `GradeRow`, `useGrade` |
| data on the phone, who is signed in, permissions in the UI, instant taps | `src/store.ts`: `startStore`, `watchMe`, `signedIn`, `signOutHere`, `may()`, `currentMe`, `act()`, `toast()`, `clearToasts()`, `bookDocAt`, `masterStateOf`/`masterStateIn` (+ overlays keyed student:unit), `setExplained`/`setTaught` (`unitId`) |
| talking to Convex, the phone's key | `src/backend.ts` (`subscribe`, `fetchOnce` (one answer, the CEO page), `mutate`, `randomKey`, `deviceLabel`, `errorText`); `src/live.ts` `useQuery` |
| control panel pieces, today's score | `src/deck.tsx`: `Tiles`, `Heat`, `heatWords`, `TodayStrip` (`compact`: one line, the Theory page); numbers in `src/score.ts`: `scoreOf`, `cheerOf` |
| colours, sizes, layout | `src/styles.css` (≈8,100 lines; grep the class): Frame `.att-btn`, `.att-n`, `.class-btn` (corner badge), bottom tabs `.tabs .tab .tab-mark .tab-badge .tb-amber`, `.prog-btn` + the ≤400 and ≤345 px tightening, `.top-stat .ts-ic .ts-n .ts-sep`, `.app.no-tabs`; one-line rows `.hrow .hrow-in .more-l .more-r .hrow-dot`; full-page sheet `.sheet-wrap.fullpage`; Buttons; Circles; Call strips; Register; Master bar `.mtrack .mk`; next chips `.nx .nx-c` (+`.now`, `.beat`); `.to-theory`; Settings menu **`.seg`** (Settings only, never reuse the name); correct sheet `.ct-* .segc`; Needs theory `.th-*`; Grade pills `.grade-pills`; Attendance; `.stats`; Upload; Progress `.pg-* .pf-chip .lane .lr .rk .fbar .tg .tc .poster-*`; Correction `.fc-*` (pinned `.fc-stick`, names `.fc-namerow .fc-add .fc-names .fc-nm .fc-none`, grades `.fc-tools .fc-grades .fc-savedbtn`, `.fc-unit`, level bar `.fc-lvbar .fc-lb` (+`.w-eval .w-theory`), E/T `.fc-ts .fc-teach`, `.fc-out`, `.fc-bookrow .fc-units .fc-books .fc-bk-n` (his books), `.fc-over`, `.fc-pblank`), its unit sheet `.su-sheet .su-all .su-bar .su-term .su-tl .su-grid .su-p` (`--p` fill; `.good .mid .low .plain .th .nb .on .given`) `.su-w .su-g .su-key`, marks table `.mt-w`, `body.fc-marking`, `.app[data-tab="focus"] .toast`; Splash `.splash .owl .owl-* @keyframes owl-*`; Theory page: one screen since 31 Oct 2026 = the Evaluation page's `.evx-*` pieces in Theory's blue (`.tpx-page` block near the very end: `.tpx-pad`, `.evx-qg.tpx-sec` (a section pill), `.qg-going`, `.s-ev`, `.s-hold`, `.tpx-what`, file `.ev-sq.tq` (+`.d-t .d-n`), `.tpx-fq`); still used from the 30 Oct block: `.tp-page .tp-stick .tp-body .tp-none`, `.tp-kinds .tp-kind`, `.tp-ln-*`, `.tp-fl .tp-fx .tp-fx-bar`, `.btn.tp-arrive`, `.sc.sc-thin` (its old pills, rows, Room/Call pad and file classes are left over, unused); the test class (very end): `.app.test-mode .top`, `.clock.ts-test`, `.tcl .tcl-switch .segc-b.tclb .tcl-note .tcl-case .tcl-del`; shared: `.tf-q .tf-teach .tf-lbl .tf-back .tp-m` (Teach chips); Evaluation's rebuilt block at the very end (`.ev-same` pills, `.ev-c` rows, `.ev-file`, `.ev-call .ev-done`); Evaluation `.ev-*` (keep him: `.btn.ghost.ev-keep`, `.ev-also`); control panel `.tiles .tile`, `.heat i.h-red/.h-orange/.h-yellow`, `.sc .sc-c .sc-cheer`, `.unit-pills .unit-p`, `.st-chips .st-chip`; `@keyframes rise`; `.bump-note`. CEO page `.ceo-*` (one block at the very end: `.ceo-tabs`, `.ceo-card`, `.ceo-say`, `.ceo-tile` (+`.t-red/.t-amber/.t-green`), `.ceo-hero`, `.ceo-cap`, `.ceo-sure`, `.ceo-room`, `.ceo-verdict`, `.ceo-plus`, `.ceo-meter`, `.ceo-bars .ceo-plot .ceo-col .ceo-xm .ceo-read`, `.ceo-names .ceo-nm`, `.ceo-people`, `.ceo-table`, `.ceo-money`), the top bar's `.ceo-btn`; one student's sheet `.sr-*` (`.sr-sheet`, `.sr-card`, `.sr-grid`, `.sr-unit`, `.sr-num`, `.sr-note`), names that open it `.pg-open`. Colour tokens at the top (`--red`, `--amber`, `--green`, `--theory`, `--evaluation`, each with `-ink`, `-soft`). |

## The workbook file the upload reads (contract with the workbook engine)

`book.html` from the engine's `collection_book.py` (level edition; it is in every unit source zip):
- marks sheet after each unit: `<div class="msh">` (or `msh pt` with a page footer inside, when it starts a
  page) … `<small> · அலகு N · Tamil name</small>` … `<table class="mtb">`, a row per part
  `<td class="c0">பகுதி I</td>`, a cell per level `<td><em>Level 6</em><i>53 – 57</i><b>/ 18</b></td>`, part total
  `<td class="cz">…<b>/ 104</b>`, unit total `<span class="mso">/ 230</span>`. A part with more than 9 levels
  (`SHEET_COLS`, engine of U03 v4) wraps: name and total get `rowspan`, the next row has no name cell and its
  outer cells carry `style=` borders.
- questions in order: short `<div class="si[ pt]" data-q=…>` (2 marks), cards `<div class="pq …" data-q=…>`; the
  printed number `<span class="qn">N</span>`; Part II marks `<span class="pm">(3 …` or `<div class="mk">(3 …`;
  level strips `<span class="lvo">/ 18</span>`; grade from the footer "தரம் 8"; English name from
  `UNIT 1 · Number patterns · PART`.
- The engine's page pass appends " pt" to ANY block that starts a page and puts the footer inside it: always
  match classes as `class="name(?: [^"]*)?"`, never exactly.
- `data-q` is global in a merged volume; printed numbers restart at 1 per unit (the reader splits by sheet).
- Engines differ per unit zip (U01/U07/U10 same; U05 and U03 v4 newer). If a future engine changes these,
  uploads say "No marks sheet inside" and nothing is saved: ask him for that zip, fix `src/workbookFile.ts`, add a
  skeleton of it to `tests/fixtures/` (regex-token method: keep si/pq starts, qn, pm, mk, level strips, the sheet;
  replace the sheet's footer drawing with a stub), not the books.
- `answer-key.json` (same zip): `{"kind": "aristora-answer-key", "version": 1, "grade": 8, "units": [{"no": 1,
  "code": "U01", "en", "ta", "questions": [{"q": 1, "part": "I", "marks": 2, "a": "15"}, {"q": 53, "part": "II",
  "marks": 3, "a": [{"p": "i", "a": "6", "m": 1}, …]}]}]}`. Plain text; `**…**` = the final answer. Written by
  the engine's `answer_key(B)` / `write_answer_key(B)` (past-paper-workbook skill, also its `answer_key.py`).
- `tute.json` (an ol-essay source zip; its engine's `Tute.app_book()`): `{"kind": "aristora-tute", "version": 1,
  "grade": 11, "unit": {"no": 24, "code", "en", "ta"}, "title", "fighter": {"sections": [{"id": "A", "tamil",
  "title", "teach": [1], "solo": [2]}], "answers": [{"q": 1, "a"} | {"q": 3, "parts": [{"p", "a"}]}]}, "master":
  {"part": "IIB", "levels": [{"n", "from": 56, "to": 56, "max": 10}], "questions": [{"q": 56, "label": "2016",
  "marks": 10}], "answers": [{"q": 56, "parts": [{"p": "i", "a", "m": 2}]}]}}`. Its book.html: ladder cards
  `<div class="qq[ pt]" data-q="N">`, paper cards `pq` (data-q = the printed number), the running footer
  `fl fc fr tab` inside a page's first card. Fixture: `tests/fixtures/tute-skeleton.*` (a FAKE tute from the engine).

## Server (`convex/`)

| File | What's in it |
|---|---|
| `schema.ts` | every table: `units`, `books` (+`keyCount`, `qCount`), `keys` (+`stage`: missing = the workbook's), `questions` (unit, stage, q, html; by_book), `bookCss`, `students` (+`seen` per room), `progress` (`m.q` rows with x/th/tb/tt/dk/dkp, `m.lv` done/fixed/got/pre), `calls` (+`pull`, `bumped`/`bumpedFrom`, `unitId`/`stage` = its book, `walk`/`arrivedAt` = on the way / there, `teacherId`/`teacher` = who called: her room), `sessions` (+`stats[room][key]`), `events` (with `who`), `attendance` (by_student, by_day), `meta`, `users`, `devices`, `links`, `drafts` (Focus), `claims` (one corrector per book: student, unit, user, name, seenAt, ask, kept), `handouts` (books given: student, unit, stage, at, by; by_student), `familyLinks`/`familyDevices` (the family app; `students.openAll`, `lv.home`/`lv.hc` = checked at home / looked at by the corrector); validators `keyAnswer`, `masterState` (reused by `uncorrect`), `draftMark` |
| `lib/auth.ts` | `viewer`, `actor`, `allowed`, `deviceOf`, `SIGNED_OUT`, `secretHash`, `pinHash`, `checkPin`, `normalizeCode`, `publicUser` |
| `lib/backend.ts` | `readDigest` (one class's events (`DIGEST_EVENTS` 8,000 at most), calls and visits → `digestOf`; `buildReport` keeps it as `report.digest`), `fail`, `log` (+who, + `took`), `rememberActor`, sessions (`currentSession`, `ensureSession`, `closeSession`), visits (`startVisit`, `endVisit`, `lastVisit`, `UNDO_IN_MS`), `refresh`/`dryOf` (idle tracking; a given book with work = not dry; `closeIdle` adds the room waits), `addStats`/`STAT_ROOMS` (the rooms' scores), `placeOf`/`workPlace` (his book now), `masterPlace` (any workbook of his), `mustHoldBook` (one corrector per book), `progressFor`, `ensureProgress`, `bookFor`, `masterState`; several books: `givenWork` (+`done`), `bookState` (work, done), `workLeft`, `openWork`, `mayBeOpen` |
| `lib/day.ts` | Sri Lanka calendar: `slDay` ("2026-10-28"), `slMonth`, `slClock` ("3:42 PM"), `slDate` ("28 Oct"), `DAY_MS` |
| `lib/status.ts` | the Fighter rules engine `computeStatus` and its constants, urgencies |
| `lib/master.ts` | the Master engine `computeMaster` (levels, waiting, `pre`, `pending`, `theory`, `wholeUnit`, `reteach`, percentages, dry/needs incl. theory), `forTheory`, `teachState` (eval/explained/theory/taught), `levelWaits`, `partTotals`, `masterEvalUrgency` |
| `lib/progress.ts` | Progress maths, shared: `summarizeMaster`/`summarizeFighter`, `daysBetween`, `pace`, `ranks` (competition ranking 1, 2, 2, 4) |
| `lib/book.ts` | book types, `fighter()`, `checkFighter`, `checkMaster` (a workbook may start after 1: `firstQuestion`), `outOf`, `levelOutOf`, `partOf`, `partsForGrade`, `PILOT_FIGHTER`, `PILOT_UNIT`, `KNOWN_WORKBOOKS` |
| `lib/key.ts` | answer keys: `KeyAnswer`/`KeyPart`, `checkKey`, `checkFighterKey` (a theory book's), `boldRuns`, `lastQuestion`; `lib/backend.ts` `keyRow` (a book's key row) |
| `lib/syllabus.ts` | `SYLLABUS` (seed only), `unitKey`, `termOf(now)` (Jan–Apr = 1, May–Aug = 2, Sep–Dec = 3) |
| `lib/owner.ts` | the owner setup code's hash (env `ARISTORA_SETUP_SHA256` overrides it) |
| `auth.ts` | `me`, `setupOwner`, `peekLink`, `useLink`, `signInPin`, `setPin`, `signOut` |
| `people.ts` | owner only: `list`, `add`, `update`, `remove`, `makeLink`, `cancelLink`, `signOutDevice`, `clearPin` |
| `progress.ts` | `board({grade, test})` (Reports; `test`: the test class's students): the grade's units (with book sizes) and every student's cells for all his units of the grade, came today, today's day; `student({studentId})` (Correction/Evaluation/Theory, the unit sheet): his `UnitCell`s (done, total, pct, evaluation, theory, finished) and `given`; `report({studentId})` (Reports, his sheet): his visits, every book (cell, each level's done/fixed/got/pre/home, explained and taught times, what waits), his finished calls, his grade's units with book sizes |
| `ceo.ts` | the CEO page, owner only: `overview` (classes of the last 28 days as digests: stored `report.digest`, else read again (the open class; 3 legacy at most); attendance per day for 56 days; students with days/hours in 4 weeks and the 4 before; joined/left this month; learning this week/last (levels, marks, home), units finished this month, below 50% in 2 weeks; books per grade and "no workbook yet" for next units; family phones; money; the team), `setMoney` (meta `ceo.money`: fee, corrector, teacher; whole rupees) |
| `lib/ceo.ts` | the CEO arithmetic, pure: `digestOf` (one class: `Digest` v 1 with stages, rooms, idle, lost, people, the 15-minute `line`), `shareOut` (one person's minutes, overlaps once, shared), `sumDigests`, `loadOf` (`Load`: need/people/busy/idleFor/cap/limit/perDay/stage/speeds/sure), `verdictOf`, `withOneMore`, `moneyOf`; constants `LEVEL_MS` 3 min, `LEVEL_MAX_MS` 12, `CHECK_MS` 1, `MARK_MAX_MS` 90 s, `VISIT_MAX_MS` 45 min, `BUSY_OK` 0.8, `OVER_BUSY` 0.85, `OVER_IDLE` 6, `NEAR_BUSY` 0.65, `NEAR_IDLE` 3 |
| `state.ts` | `get` (the board every phone watches: one class's students (`test`: the test class), progress, books in use, `more` (other books with something waiting, in class), `given` (books given + work), their requested + sent calls, session + its `stats`, `tests` = how many test students), `archived` (+`test`), `history` (account lines owner-only), `sessions` (not a class only test students used) |
| `students.ts` | `add`, `move`, `setGiven` (Books given: his grade's units only; idempotent; logs `book-given`/`-off`; refreshes his idle clock), `rename`, `setArchived`, `setPresent` (Attendance: visit rows, `undo`) |
| `attendance.ts` | `day` (one Sri Lanka day's visits; Correction job) |
| `marks.ts` | Fighter circles: `set`, `restore`, `setMany`, `restoreMany`, `skipSection` |
| `workbook.ts` | (`correct` logs `took` = its draft's first mark → Save, kept when ≤ 1 h) Master, on any book he has work in (`masterWork` = `masterPlace`; never moves him; `correct` refuses a book another corrector holds): `levelDone`, `undoDone`, `correct` (+`dk`, `dkp`, `to`; returns `pre`), `uncorrect` (Take back, `UNCORRECT_MS`), `explain`, `toTheory`, `taught`, `reteach`; `markBefore`/`unmarkBefore` (levels done before the app), `homeChecked` (⌂ levels) |
| `focus.ts` | Correction's drafts: `drafts` (all, ≤500), `mark` (any book of his: `masterPlace`; merge `set`/`clear` into a level's draft, `dkp` too; refuses a corrected level, bad marks, parts not adding up, a book someone else holds; deletes drafts of corrected levels, other books' only after 2 days), `drop`; one corrector per book: `claims` (query), `claim` (+`ping`), `release`, `ask`, `unask`, `answer` (give/keep) |
| `lib/claims.ts` | `CLAIM_PING_MS` 20 s, `CLAIM_LIVE_MS` 60 s, `Claim`, `claimLive`, `heldBy` (server and phones) |
| `calls.ts` | `create` (`books`: the book per student; theory first: cancels Evaluation's request and sets `bumped`; returns `pull`, `bumped`; stats calls/ahead), `send` (`sendNow`: a theory call gets `walk`), `decline`, `undoDecline`, `cancel` (requested, or walking = never got there: `not-reached`), `arrive` (`arrivedAt`; requested = sent and here at once; Theory, Evaluation, Correction), `unarrive` (2 min, `UNDO_ARRIVE_MS`), `finish` (via `record()` → `{value, n}`; stats done/qs, a Theory finish = 1 lesson; ms from Arrived), `release`, `keep` (Evaluation: done + stays for his next book), `lessons` (query, Theory: the last 20 theory lessons' Arrived (else sent)→done ms); finish/keep set `students.seen[room]` |
| `family.ts` | the family phone (`app.aristora.org`): `peek`, `join` (the WhatsApp link, one use, 7 days), `hello`, `signOut`, `me` (Worlds, levels, XP, streak), `level` (each question's boxes, never the answers), `check` (marks a whole level once with the key; saves it with ⌂), `board` (this week in his grade) |
| `families.ts` | the teachers' side (owner or Students): `makeLink`, `phones`, `signOutAll`, `setOpenAll`, `answers` |
| `lib/family.ts`, `lib/phone.ts` | his Worlds (`worldsOf`, `levelStates`, `weekXp`, `streakOf`); home marking from the key (`phoneKey`, `markQuestion`, `boxCount`, `wantWords`, `allPhone`, `phoneShare`) |
| `catalog.ts` | `units`, `books` (+`keyCount`, `qCount`), `key` (+`stage`), `question`, `bookCss`, `saveWorkbook` (+`key`; drops the questions when the book's numbers change), `saveTute` (a topic tute: both books + both keys, `saveTuteBook`, `bookShape`), `saveQuestions`, `renameUnit` |
| `sessions.ts` | `end` (End the session) |
| `setup.ts` | `ensure()`: one-time data updates; `DATA_VERSION` (1) |
| `demo.ts` | owner only: `load` (14 students: 10 G11 Fighter, Malik/Priya/Vimal G7 Master, Zainab G9 Legend; the 13 in class get visits; Keerthi is not in; only into an empty real class), `remove` (`test`: the test students, else the demo ones; `wipe`: calls, progress, visits, handouts, drafts, claims); the test class: `testInfo` (query: real students per grade, copies, cases), `copyGrade` (`testName`, `copyOf`), `cases` (`F_CASES`, `M_CASES`, `caseMaster`, `twoWorkbooks`: the extra test students), `TEST_CAP` 120 |
| `clock.ts` | `ping` (server time, public) |

## Tests (`tests/`)

- `status.test.ts`: the rules. `backend.test.ts`: students, calls (theory first + `bumped`, `calls.lessons` Theory
  only), sessions, reports, and "each room's score for the class" (calls, ahead, done, lessons, qs, waits); "the test
  class" (a grade copied with its levels and books given, again = start over; the extra test students each in his
  situation; only `state.get({test})` shows them; never in the score or the report; delete only them; owner only; the
  120 limit counts real students).
- `master.test.ts`: syllabus, stages, workbooks, Move; "Master: Theory comes after Correction and Evaluation";
  "Correction's unit sheet" (`teachState`/`levelWaits`, `progress.student` cells, `setGiven` on/off/grade/permissions);
  "Several books at once" (`more`/`given`, a call for U08 while on U09, `keep`, teacher taps on another book, idle
  stops when a book with work is given; two correctors at once: claims, ask/give/keep, a quiet phone, drafts kept). Fake views in rules tests go through `tests/views.ts` `asView`.
- `derive.test.ts`: Theory groups for workbook students, from fake views.
- `progress.test.ts`: ranks, pace, class days; `progress.board`; owner/Reports only. Fake time 2026-10-28 15:00.
- `auth.test.ts`, `attendance.test.ts`, `stats.test.ts`.
- `workbookFile.test.ts` (fixtures = skeletons of his real books), `answerKey.test.ts` (FAKE keys), `tute.test.ts`
  (a FAKE tute: two books, keys by book, questions cut, cleaned, stored and dropped, refusals).
- `focus.test.ts` (Correction rules: name pills, the grade shown, grade badges, the level that opens, the next level
  and workbook, re-mark, ? on a part), `uncorrect.test.ts` (Take back, done before the app, `dkp`), `drafts.test.ts`,
  `hrow.test.ts` (the one-line row: centring, edges, hidden red/amber).
- `theoryFocus.test.ts`: the Theory page rules (pace, out-in, starving, cap 6, holds, rooms, joiners, lesson length;
  the pills holding still `nextOrder`; on the way vs with her, late, `roomItems`/`roomWords`; one screen: the rows,
  held students counted not urgent, the lesson pills (sections; a workbook's questions by the same students; whole unit),
  the squares (book order for a section), Done for a section and a workbook, the preview before anyone is called). `backend.test.ts`
  also: Arrived (walk, came before Sent, lesson time from Arrived, history ms), undo Arrived, never got there
  (cancel a walking call), who may tap Arrived.
- `evalFocus.test.ts`: the Evaluation page rules, every row's now/next (`nowOf`/`nextOf`), a room's score.
- `ceo.test.ts`: `shareOut`, one class's digest (who came, Correction timed/untimed/answers/waits, Evaluation shared,
  Theory lessons, idle by cause, each person's room, the 15-minute line, demo never), `loadOf` (need, cap, limit, a day,
  busy, speeds, sure, Fighter vs Master, one more), `verdictOf`, `sumDigests`, `moneyOf`; the server: `took` on a
  Correction save, the live digest, the stored digest after End the session, owner only, `setMoney`, `progress.report`.
- `family.test.ts`: the family app (links, Worlds, home marking, ⌂ levels); `e2e/family.e2e.ts`: a family link, two
  levels typed and checked, the reveal, XP, streak, the board, then ⌂ and Checked on Correction.
- `taps`, `announce`, `chime`, `sha256`. `helpers.ts`: `asOwner(t)`, `asPhone(t, token)`, `addPerson(t, {...})`,
  `OWNER_TOKEN`.
- `e2e/class.e2e.ts`: nine run-throughs on simulated phones (real functions, fake backend in `e2e/harness.ts`):
  1. a whole class (Fighter, calls from Theory cards, Theory's taps on the Class rows, Send everyone back, pulls,
     alerts, Attendance from the count by the clock, report, gone-home list, 360/320 px, the top bar fits);
  2. Master (markers, the marks table's correct sheet + key, Correction Later = handed in, Evaluation → Theory, ?, the
     workbook card, partial Done, whole unit), grade pills, Students, Books (typing, uploading with a key, K pill);
  3. Progress (race, chips, Term grid, Came today, the poster); 4. accounts (a Correction-only teacher: no
     bottom bar, Correction + Class at the top, the count opens Attendance, starts on Correction); 5. the iPhone 7
     Plus keep-awake fallback; 6. Correction (fixed grades with here/total, one-line names, + signs Keerthi in, the
     level that opens + the next one, re-mark with E/T on the boxes and dots on the bar, the card, done before the app,
     the unit sheet (31 pills, terms, one shot at 390 × 844 and 360 × 640, Books given + handouts + history), drafts
     across names, ? on one part, unit finished + Next, Take back; 320 px: one-line level bar and strip that keep the
     open one in view, the question scrolled into view under the pinned rows; 360 px: signed out → the line, Sign him in);
  7. the Theory page (one screen: grades 11 first, Fighter, unit 13 in Tamil, D first; D's four ticked, Call 3 with the
     pad not moving; not sent 4m red in her room; Sent = on the way; Arrived from two files; Dilan never arrives:
     Correction hears "Dilan hasn't reached Owner in Theory", In the hall; Taught Q23–25 for 2, Q26 not reached; Ahamed's
     Q25 undone in his file: he stays, Done 1, then Not taught; D again: the preview says who needs which, Dilan then
     Nila join (blue count), Taught ×4, Done 2; the workbook pill "13 · 17" with marks and who sent them, Q13 taught
     and Q17 not reached; Evaluation told, cancel; Class as Theory; 320 px) and the owl; 8. the Evaluation page (one screen: grades 11 then 7, Fighter
     first, unit 13 in Tamil, Q22 for Fathima and Ahamed first; Call 2, Sent 2, Arrived 2 at once, Explained for 2,
     Done 2; Grade 7 Master: Vimal's Q22 with the key, Q51 → Theory, his file, Done; two more called from two
     groups; today's score; 320 px: grades in one row, the big button above the tabs, his file); 9. several books (Malik
     on U09 with U08 unexplained: two rows, swap, call for U08, keep him for U09, Theory's U08 lesson, Vimal given
     U09 = not red, Correction opens U08's handed-in level without moving him; a second corrector Kavi: dim "O",
     Ask Owner, Give it to Kavi, her paper opens on Level 3); 10. the CEO page (demo students made real, three earlier
     classes as stored digests (`pastDigest`), a timed correction today: Now's rooms and advice, Today's idle number,
     meters, people, history; Team: Evaluation red "Needs another person", the limit, one more person; Business: money
     saved, Keerthi leaving → her sheet; Team in rupees; Progress → Malik's sheet → the 1080 × 1350 image with rank "2nd of
     3 on Unit 8" and a 4-line note, shared; a Reports teacher has no CEO icon; 360/320 px: the top bar fits, no tab
     scrolls sideways); 11. the test class (Grade 7 copied: TEST in the top bar, the copies in the list; the extra test
     students with their notes; Evaluation in the test class: two already in her room, the 7 who lost Q2 get 4 ticks;
     Theory: Starving D first, held ones not ticked; Nila's phone sees none of them, switches in Settings → Account,
     then 6 ticked of 7; the owner deletes them and is back in the class).
- `phone(backend, "correction")` opens Class (Correction job), `"focus"` the Correction page, `"theory"` the Theory page,
  `"evaluation"` that page. Helpers: `tab(p, "Class")` (= `.top .class-btn`; Theory/Evaluation by class `.tab.theory`),
  `namesOf`; Evaluation and Theory (one screen each): `evPick` (grade, stage, unit, group), `evFind`, `evOffer`/`evPill`, `evCallOnly` (untick one at a time: `.all()`
  goes stale as the box re-draws), `evArrive`, `evFile`, `evCall`/`evArrived`/`evDone`; the same helpers drive the Theory page (one screen: `evPick` group = a lesson "D" / "13 · 17");
  `evCallOnly(p, names)` (Clear, tick, Call), `says()` (text as written, for capital headings), `topFits()`, `shot()`
  (waits 260 ms for the rise animation), `nearMidnight()`.
- Phones are signed in by `newClass()` plus `phone(backend, role, size, token, at)`. Any console error fails.

## Other files

- `scripts/build.mjs`: esbuild bundles `src/main.tsx` into `dist/` with the Convex address; refuses without
  `CONVEX_URL`. `scripts/vercel-build.sh`: Vercel's build (`convex deploy` + build on `main`).
- `scripts/workbook-from-pdf.py`: the old way for a PDF-only workbook. Prefer the upload.
- `vercel.json`: security headers and the CSP; app.aristora.org → the family app (`/f/index.html`);
  `git.deploymentEnabled` keeps Vercel off `ci-check` and every `ci-*` branch. `scripts/build.mjs` also builds the
  family app (`dist/f/`, 50 KB budget).
  `public/`: the page, icons (`icon-512.png` is the poster's logo).
- `.github/workflows/check.yml`: the full check on a GitHub machine for `ci-check` and any `ci-*` branch (one per
  chat; the report comes back onto the same branch: `making-changes.md`).
- localStorage: `aristora.token`, `.role` (class | theory | evaluation | focus = Correction), `.job` (Class's job), `.testClass` (this phone shows the test class),
  `.voice`, `.tones`, `.lastGrade`, `.attendanceGrade`, `.booksGrade`, `.progressGrade`, `.progressView`, `.ceoTab`,
  `.grade.<job>` (and `.focus`), `.legend.<job>`, `.askPin`; sessionStorage `aristora.focus.saved`.
