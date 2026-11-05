# Making a change: the loop, the checks, the gotchas

The technical memory of the app, kept with the code and updated in the same commit as the change it describes (moved here from the aristora-system skill on 31 Oct 2026). "Section N" means the skill's section N (0–4 his rules, 6 accounts, 7 status, 8 open questions, 12 decisions) or these files: 5 = `how-it-works.md`, 9 = `map.md`, 10–11 = `making-changes.md`.

## The loop

1. **Plan in one line.** If the request is unclear and expensive to redo, ask first (≤3 multiple-choice
   questions); otherwise build.
2. **Change the code.** Add or adjust a test next to the change: the backend in `tests/*.test.ts`, the UI flow
   in `tests/e2e/class.e2e.ts`.
3. **Run the checks:**

```bash
cd /home/claude/aristora-system
npm run typecheck                    # both tsconfigs (check the exit code: a pipe hides it)
npx vitest run                       # ~10 s
# UI changes also:
CONVEX_URL=https://qualified-fish-602.convex.cloud npm run build
SHOTS=<scratchpad>/shots timeout 580 npx vitest run -c vitest.e2e.config.ts   # ~4 min; -t "Theory" for one
# after adding/removing a convex file or changing a function's args:
npx convex codegen --system-udfs --typecheck disable
```

   **No packages here** (npm ci fails): run the full check on GitHub. Pick a branch of your own, `ci-<topic>` (any
   `ci-*` runs it; one per chat, so parallel chats don't cancel each other). Push the work there with a throwaway
   commit of options: `git checkout -B ci-tmp HEAD && mkdir -p ci && echo "t0* e0*" > ci/pick && git add ci && git
   commit -m "ci options" && git push -f origin ci-tmp:ci-<topic> && git checkout main` (`ci/pick` = screenshot globs
   to send back; optional `ci/e2e-only` = a `-t` filter). The workflow runs typecheck, unit tests, build, Chromium and
   every run-through (~8 min), then commits `ci-report/` (outcome.txt, one log per step, the picked shots) onto the
   same branch. Poll `gh api "repos/ilham972/Aristora-system/actions/runs?branch=ci-<topic>&per_page=1"`, then
   `git fetch origin +ci-<topic>:refs/remotes/origin/ci-<topic>` (the shallow clone fetches main only) and read
   `git show origin/ci-<topic>:ci-report/outcome.txt` (the API says "success" for every step; outcome.txt is the
   truth) and the logs. Green = push main itself (never the ci options commit). Branches stay on GitHub (this proxy
   can't delete them): force-push over yours.
4. **For UI changes, look at the screenshots** at 390, 360 and 320 px, cropped with PIL first. No page scrolls
   sideways (the tests check `scrollWidth`); rows that scroll inside themselves are fine. Also look at one screen
   you did NOT change (Settings) when you add CSS: a class name clash shows there.
5. **Commit and push.**
   - `git add -A`, then scan the diff for secrets and book content.
   - Commit to `main` with a clear message and the attribution lines.
   - `git fetch origin main`; if it moved, `git rebase origin/main`, resolve keeping BOTH features (read the
     other commit first: `git show <sha>`), rerun every check, then `git push origin main`.
6. **Check the deploy.** Wait until
   `gh api repos/ilham972/Aristora-system/commits/<sha>/status --jq .state` says `success`. Poll it in one Bash
   loop of short sleeps (`for i in $(seq 1 40); do …; sleep 8; done`); a lone `sleep` is blocked.
7. **Tell him:** what changed, then "reload system.aristora.org and check: 1… 2… 3…". If the deploy says
   success but the site didn't change, he goes to Vercel → Deployments → the newest one → ⋯ → Promote to
   Production, then Settings → Environments → Production → Branch Tracking = `main`.
8. **Update these docs in the same commit**, then give him the updated skill on the save card (skill section 13).

**Data changes.** `setup.ensure()` runs on every phone but returns early unless `DATA_VERSION` rose. New optional
fields need no data step: old rows simply don't have them.
- **New workbook:** he uploads it (Settings → Books → Upload workbooks). No code. When one is refused, get the
  zip, run the reader on it in a probe test inside `tests/`, fix the reader, add a skeleton fixture.
- **An answer key for a unit he sends:** best, the workbook skill's "answer key only" mode (§4b). Else extract the keys
  from its `uNN.py` through the zip's own engine (`weasyprint` stubbed, `B._assign()`), cross-check with book.html,
  review by hand, add `answer-key.json` (name `…_key.zip`), read it with the app's reader in a probe test, send it.
- **New Fighter book:** only `PILOT_FIGHTER` exists. First turn it into a `KNOWN_FIGHTERS` list (or build an upload
  like the workbooks', see section 8). Sections: `id`, `badge`, `title`, `tamil`, `kind`, `teach`, `solo`, `labels`.
- **Syllabus changes:** `SYLLABUS` seeds only an empty table. To change live units, write an `ensure` step, or
  have him rename them in Settings → Books.

The sandbox shell can't reach `*.convex.cloud` or the site (the proxy blocks it), and WebFetch refuses
system.aristora.org. You can't read live data: ask him for screenshots.

## Security audit

After adding functions, every function must print GUARD except the open ones on purpose: `auth.me`, `auth.setupOwner`,
`auth.peekLink`, `auth.useLink`, `auth.signInPin`, `auth.signOut`, `clock.ping`, and the family app's `family.*` (`peek`
and `join` check the family link; the rest call `familyViewer` / `familyActor`: the family phone only).

```bash
python3 - <<'EOF'
import re,glob
for f in sorted(glob.glob('convex/*.ts')):
    s=open(f).read()
    for m in re.finditer(r'export const (\w+) = (query|mutation|action)\(\{', s):
        h=s[m.end():].split('handler',1)[1][:400]
        print(f, m.group(1), 'GUARD' if ('viewer(' in h or 'actor(' in h) else 'OPEN')
EOF
```

## Gotchas learned the hard way

- **A photo asked again comes back in the same row** (5 Nov 2026, the ⌂ lane): `family.photoSend` patches a retake's
  `homePhotos` row back to "waiting" with a new `at`. Anything that remembers "answered" or "seen" for a photo keys on
  its id AND `at` (`answered` in `src/homeLane.tsx`), or the re-sent photo stays hidden.
- **A live query that reads students' rows runs again on every tap in class** (attendance, moves, `seen` all write
  them). The ⌂ lane's `photos.lane` returns photo rows only (`LaneRow`: id, count, oldest) and the phone takes names
  and grades from the board's views: keep big scans away from `students` in anything a phone keeps open.
- **The family app shows a camera under each teacher part** of a question: in the run-throughs `.f-qcard .f-file`
  finds one per part (`.first()` for one photo).

- **A phone runs the copy it opened, not what you deployed** (5 Nov 2026: his upload of a new answer kind was refused
  by the teachers' app open since before the deploy). Every new kind, button or rule reaches a page that was already
  open only when it loads again: `src/appVersion.ts` does that (the banner, or by itself after 30 min away), and the
  upload sheet says "older copy" with Update. A report like "the new thing isn't there" or "the app doesn't know"
  right after a deploy: first ask him to close the app and open it again (square button, swipe it away). `versionIn`
  reads the page's `script[type="module"][src]` and `link[rel="stylesheet"]`: a stylesheet or module script added at
  run time must carry `data-later` (as `later.ts` does), or that copy always reads "newer" (the banner every time, a
  reload after every half hour away).
- **The level screen is not in the first load any more** (5 Nov 2026): import `play.tsx` only through `level.ts`
  (`useLevel`, `loadLevel`) or from a later file (`preview.tsx` in `parts.ts`); a first-screen file that needs a piece
  of it gets the piece moved out (`next.tsx`: `nextPlay`, `Confetti`). `import type` from it is free.
- **A new lazy file in the family app costs the first load** (5 Nov 2026, the owner's Preview): a dynamic `import()`
  of a file that imports first-load code (the level screen, `net.ts`, preact) makes esbuild split that shared code
  into extra chunks, and the first load grew 1.2 KB (gzip works worse across files) though nothing was added to it.
  A rare screen goes into the later parts (`parts.ts`, reached through `loadParts`), which already share that code.
  Measure before CI: bundle `src/family/main.tsx` with `/opt/npm-tools/node_modules/.bin/esbuild --splitting --minify
  --packages=external`, gzip `main.js` + the chunks it imports statically, compare with `git stash`.
- **The family bundle is in two parts** (4 Nov 2026, the profile): what comes after the first screen (Me, the report,
  the photo editor, the certificate) is imported only through `src/family/later.ts` (`loadParts()`, `useParts()`), never
  straight: one plain `import` from a first-load file brings it back into the first load (the build prints both sizes;
  the first load's budget stops it). Its CSS is its own esbuild entry (`profile.css` → `later-*.css`), named in the page
  (`link rel="prefetch" data-later`) and attached by `later.ts`: CSS imported by a lazily imported file is ALSO copied
  into the entry's CSS (seen: the profile's rules twice). Anything a first-load screen shows (a face in the race, the
  birthday card on Home) keeps its style in `family.css`, or it draws unstyled until the parts arrive.
- **A page's security policy applies in the run-throughs** (the harness serves `vercel.json`'s headers): a picked photo
  opened as `blob:` was blocked until `img-src` allowed `blob:` (4 Nov 2026). A console CSP error = a real bug.
- **`innerText` applies `text-transform`**: a `Tag` is uppercase, so look for "WAITING FOR OK", not "waiting for OK".
- **`getByLabel` matches parts of names, and a `<select>` inside a `<label>` is named with its chosen option too**: "Day"
  matched every heat-map day ("Tuesday …") and never the select. Give such fields an `aria-label` and use
  `{ exact: true }` inside the sheet.
- **An effect keyed on a step re-runs when the step changes**: the photo circle re-centred itself the moment Use this
  photo was tapped (`[src, step.k === "edit"]`). Key an effect on the data it sets up (`[src]`); the run-through checks
  the circle's transform before and while sending (it fails on the old code).
- **Two chats, one counter name**: home-work uploads and profile photos both called theirs `familyDevices.phDay/phN`
  (one limit would have eaten the other). Profile photos count in `pfDay/pfN`; grep a field name before adding one.
- **A class name another chat just added**: `.f-zoom` (the profile's slider) gave the printed question's full-screen
  zoom 30 px of height after the merge; `.f-file` (theirs, `display: none`). After a rebase, grep every class you added
  against the merged CSS (the profile's now: `.f-crop-zoom`, `.f-pickfile`).

- **A pick the page makes from live data must hold once it is on screen.** The whole-class page opened "the level with
  the most waiting"; the first Taught changed the counts and the lesson jumped to another level mid-teaching (3 Nov
  2026, caught by the run-through). Freeze the page's pick once shown (`lessonKey` set by an effect), and freeze a
  page-ticked list at the first action (`ticks` per lesson), or both re-decide after every tap.
- **Theory and Evaluation work counts only what the digest knows** (`digestOf`: room calls, and since 3 Nov 2026 `board`
  events). A new way for a teacher to work (anything not a call) must leave events the digest turns into spans, or her
  card shows her "free while students waited" during that work.

- **Vercel serves a file before any rewrite.** "/" is `index.html` (a file), so the first family app rule (rewrite "/"
  on app.aristora.org → `/f/index.html`) never ran: app.aristora.org showed the teachers' sign-in (`8ee3b16`, his
  screenshot of 1 Nov). Send a host to another page with a **redirect** (redirects run before files), and give links
  the real path (`/f/`). `tests/hosting.test.ts` holds it.

- **CSS class names are global:** `a17ca46` added a `.seg` segmented control and it boxed the Settings menu (which
  is `.seg`) until `e311e74`. Before a new class, grep `\.name\b` ANYWHERE in `styles.css` (not only `^`): `.today`
  exists inside `.pf-chip.today`. Modifiers too: a row chip called `pulse` became the call strip's 10 px `.pulse`
  dot, and bubble colours `.h-red {color:#fff}` turned every list name white when the rows reused `h-red` as a
  modifier; the test class's switch button once took `.tcl` (the block's flex column) and lost its centring. Scope helpers (`.heat i.h-red`) and give modifiers odd names (`.beat`).
- **`.here` is a bare global class** (an 8 px green dot): never use it as a modifier. The Theory page's modifiers are
  `lt-*` (pills) and `rs-*` (room); old `.tp-got`/`.tp-pill` styles were removed with the rebuild.
- The Theory and Evaluation pages' pad must not move: `.tp-body`'s min-height ends where the pad sticks (the 40 px in
  it is the page padding, the pinned rows' pull-up and gap, and the app's 24 px; `--tp-stick-h` = the pinned rows,
  measured by `usePinned`'s callback ref whenever they appear: a page that first rendered "Nobody is signed in" has no
  rows to measure, and a body too short lets the pad float with the content). Change one, change the other.
- A mutation that returns nothing comes back as `null`, and `act()` treats that as failure. Return `true` from
  mutations whose callers check the result.
- Every public function needs `token` in its `args`, because the client always sends it (40–128 characters).
- `state.get` sends every book in use to every phone on each change: never put big data in `books`; give it its own
  table or query (keys, `progress.board`, `calls.lessons`) that a screen opens only when needed. Counters that every
  phone needs (the rooms' scores) live on the session doc, which the board already sends: never a query over
  `events` per tap (thousands of rows a class, every phone, every change). `more` only carries books with something
  waiting, for students in class: keep it that way.
- The Owner page reads `boss.overview` with `fetchOnce` (one answer, again every 5 minutes), never `useQuery`: it reads a
  class's events, and a live query would run again on every tap of every teacher. Its classes are digests kept in the
  report (`report.digest`, v 1): change the digest's shape → raise `v` (old reports are then read again, 3 at most) and
  keep `sumDigests` adding every field. Demo students never count there: an e2e makes them real (`demo: false`).
- A Master student can sit in several Theory groups: count students with `theoryMembers()`, never by summing.
- Master lost marks count only on corrected (`fixed`) levels: `computeMaster` skips the rest.
- The convex-test clock adds about 1 ms per mutation: compare times within half a second. Fake the date
  (`vi.useFakeTimers({ toFake: ["Date"] })`) when "today" matters.
- Read a student AFTER `ensureSession`/`currentSession` (closing yesterday's class signs everyone out).
- Two grade components, don't mix them: `GradeRow` (`src/ui.tsx`, always 6–11: Attendance, Students, Books,
  Progress) and `GradePills` (`src/grades.tsx`, filter with All and only the grades in class: Class, Evaluation).
- Stored workbook marks win over a part's `each` (`outOf`): uploads always save with `replace`.
- Match engine classes loosely (`class="msh(?: [^"]*)?"`); let the sums, strips and totals checks catch errors.
- `tests/*.ts` are type-checked with only `vite/client` types: no `node:fs`, no `__dirname`; fixtures by `?raw`.
  (`tests/e2e` is not type-checked.) Keep the schema type on a test backend: `const fresh = () => convexTest(…)`.
- Vitest swallows `console.log`; a probe writes to a scratchpad file (`await import("node:fs")` inside the test),
  lives inside `tests/`, and is deleted after. Never run vitest with `--root /`.
- A tab with a red count reads "Theory 2" to Playwright: select tabs by class (`.tabs .tab.theory`), not exact name.
- The top bar: every inline count costs ~26 px; 4 icons + the clock fit 320 px only with corner badges (Class) and
  the ≤345 px rules; `topFits()` checks it (a flex overlap isn't sideways scrolling).
- In e2e, wait for the other phone to show a state before acting on it. `contains()` reads the first match's
  `innerText` (follows `text-transform`: "GRADE 7"): capital headings with `says()` (textContent).
- Headless Chrome has no `navigator.share` (e2e fakes it); phones allow it only straight after a tap. iOS 15 Safari
  has no `ctx.roundRect` (`rr()` in `poster.ts` uses `arcTo`). Canvas text uses the phone's fonts (system-ui + Tamil).
- CSS: a `flex-wrap` row pushes a long mark row under its label unless the marks block has `flex: 1 1 0`; an
  `<ol>`/`<ul>` keeps a 40 px indent unless `padding: 0`; a flex column puts each text run on its own line (one span).
- Row controls must fit 360 px (act column ≈218 px): short words under 390 px rather than hidden scrolling.
- Playwright and Chromium are preinstalled. Never run `playwright install`.
- In a full-page screenshot, the fixed header, tab bar and Correction's pad (Save, Next) can appear in the middle, and a
  full-page sheet is drawn half-way down: take sheets with viewport shots (`shot(p, name)`).
  Shots right after a change catch the rise animation half-way: `shot()` waits 260 ms.
- His older unit zips carry an older workbook engine; a U02 unit file imports sympy. Unzip into the scratchpad.
- iPhone Safari may forget the sign-in after more than 7 days without opening the site (Home Screen avoids it).
- The repo isn't prettier-clean and has no prettier config: NEVER `npx prettier --write` a file (it reflows all of it at
  80 columns: a 1,300-line diff). If it happened: `git merge-file` HEAD (ours) with prettier-150(HEAD) as base and
  prettier-150(yours), fix the conflicts, then reverse the hunks that only change whitespace.
- Correction's paper is one student AND one book: its book is `bookId(v)` and its view `viewOfPaper(views, paper)`;
  never move him to correct another book (`moveTo` = Move, a deliberate act), never follow him when his book now changes.
- Several books: never assume `v.s.unitId` is the book of a view, call or queue entry: use `v.unit` / `c.unitId`
  (`withBooks`, `roomCalls`, `teachWork`). Out of work is `v.noWork`, never `st.dry`/`ms.dry` alone (a blocked book
  with a given book that has work is NOT out of work). Rules-test fake views need `others`/`noWork`/`key` (`asView`).
- Tamil in tight boxes: `overflow-wrap: break-word`, never `anywhere` (breaks mid-word). Measure words in Chromium
  before choosing a size (widest unit words ≈120 px at 11.5 px). The unit sheet is tuned to fit Grade 8 (31 units =
  12 rows) in 360 × 640 (`oneShot` in the e2e): any taller header, pill or gap breaks it.
- Theory/Evaluation rows: never build what a room's pills or squares mean from who WAITS only (`candidates`, `planLessons`
  skip anyone called): her room's book falls out of the rows the moment she calls the last of them (his screenshot, 31
  Oct 2026). `roomRows` adds her room's books; keep the rows and the questions on screen about the same book.
- The app shows ONE page at a time (`app.tsx`): leaving a page unmounts it. Anything a teacher taps that must last
  until a save (Theory/Evaluation decisions) goes through `useRoomDecisions` or a server draft, never plain `useState`.
- After an awaited mutation, never reset what the teacher may have changed meanwhile: compare with its value at the tap
  (`follow(since)`, `setTicks((t) => (t === ticked ? null : t))`): a tap on the next grade right after Call was wiped.
- A function passed straight as `onClick` gets the tap event as its first argument: `onBack={() => follow()}`, never
  `onBack={follow}` once `follow` takes an argument (Back to your room silently did nothing).
- e2e `evPick` taps a row only when it isn't pressed yet: after Done / Call, wait for the toast before picking (a room
  still saving is still her room, so the row looks picked and the tap is skipped).
- e2e: data written with `backend.t.run`/`.mutation` reaches the phones only after `await backend.push()`. Focus
  ignores taps for 350 ms after a question changes (Save 700 ms): e2e taps wait 420 ms first.
- Never animate sideways (`translateX`): a box past the edge makes mobile Chrome shrink the page. Toasts sit at the
  bottom over whatever is there: no Undo in a toast over a pad of buttons.
- A past paper's label is a year, all digits ("2022"): test `shortLabel(q) === String(q)`, never a digits regex.
- `git push` can die with "GnuTLS recv error … non-properly terminated" (the proxy): fetch, then push again.
- SVG animation: nest pivots in `translate(x y)` groups (never `transform-origin`).
- Preact: a `.map` that returns arrays makes one group per item, so a keyed item moving between groups is rebuilt
  and loses its state. Return one flat keyed array (`flatMap`), as the Theory and Evaluation lists do.
- A list re-ranked every 10 s moves under the finger: keep the buttons in one fixed order and show the rank with a
  tag (Theory's pills + "Next"); keep what the teacher touched (her ticks, her pick).
- Demo marks share one time (the right answers 30 min ago): demo paces are null, so the class pace is 4 min.
- **Two classes on one server** (31 Oct 2026; since 1 Nov the simulation's made-up students): test students
  (`students.test`): `state.get` and `progress.board` send one class (`test`), never both. Anything new that counts or
  lists students across the school must skip test students (`s.test`: the report, Theory's lesson times use
  `calls.test`; demo is set on them too, so "demo never counts" places already skip them). A room's score goes through
  `roomStats` (a test student's into the running simulation's `sims.stats`), never `addStats` straight. They share the
  session: never let a simulation phone end it (End the session is hidden there); the simulation closes a class only it
  used when it ends.
- **The simulation's steps** (`convex/sim.ts`): a handler that schedules `internal.sim.tick` needs its return type
  written out (`handler: async (ctx, args): Promise<…> =>`): its type depends on this file's through the generated API (a
  cycle: "implicitly has type any"). The steps never `touch` the session every 5 s (every phone redraws on a session
  change): once a minute, with the reading. Tests: `start` with `manual: true` (no steps scheduled; a scheduled timer
  in convex-test is a real one), the steps by hand with `raw.mutation(internal.sim.tick, {simId, chain, manual: true})`
  on the RAW backend (the `asOwner` proxy adds `token`, which an internal function refuses), the clock moved with
  `vi.setSystemTime`. The run-through starts it from the phone (not manual: one real step may come after 5 s), so it sets
  `manual` on the `sims` row at once and takes the steps with `simStep`. One student's step throwing never stops the
  others (try/catch per student; validate before writing).
- innerText of a **flex row** with element children puts a line break around each child (`<b>Running</b> · Hard` reads
  "Running\n· Hard"): a line the e2e reads with `contains` is a plain block with inline children (`.sim-now`).
- The Theory and Evaluation pages are the same one-screen pieces (`.evx-*`, `src/roomkit.tsx`); Theory's colours come
  from `.tpx-page`. Change a shared piece and look at BOTH pages' shots. The e2e `ev*` helpers drive both pages.
- Demo work is dated 30–70 min back: just after Sri Lanka midnight it is "yesterday" and "today" checks fail. The
  e2e guards them with `nearMidnight()` (Asia/Colombo hour < 2); don't "fix" a test that fails only then. Not guarded
  yet (4 Nov 2026, 00:10 Sri Lanka, failing on main too): "Attendance: sign in all…" (Keerthi in the many-sheet),
  "Class tab: everyone's…" and "Teacher card: a real day…" (her three numbers). Between 00:00 and 02:00, check the
  same run-throughs on main (`ci/e2e-only`) before blaming your change.
- `overflow-x: auto` clips vertically too: rings and lifts inside a one-line row need padding in the row (no
  `translateY` on the open level). Items in a no-wrap flex row shrink unless `flex: none`.
- Playwright's click scrolls a covered element into view: check what must be on screen BEFORE such a click (the old
  "name y > 0" check passed while the name sat under the top bar).
- A sheet over a sheet (sign out over Attendance): `body.locked` is counted (`openSheets`), never removed by the inner
  one. A toast can cover a sheet's title: Correction clears toasts when a sheet opens.
- **Photos and file storage** (4 Nov 2026): a mutation that fails undoes its `ctx.storage.delete` too, so a refused
  upload is left to the hourly sweep (never delete then `fail`). The sweep deletes only image files nobody references:
  any other stored file (a voice note one day) must be referenced by a row before an hour passes, or kept out of the
  sweep. convex-test can't return a Blob from `t.run` (send bytes); its `getUrl` ends with the file's base64 sha256
  (it may hold "/"): the e2e harness serves those addresses from its storage (`context.route`) and takes the family
  app's uploads through `__abUpload`. Playwright: `setInputFiles` on the hidden `.f-file` input is the camera. Two
  Checks in one test share a `Date`: order Checks by `_creationTime`, not `at`.
- **The family bundle is at ~58.7 of 60 KB** (4 Nov 2026: 58.7 after a tute's ladder and Learn (+~1.3 KB, budget 58 → 60); 55.6 after the photos (+3.6 KB), 56.0 after the questions
  that come back (words were shortened to fit), then the printed question full screen and no selection (+1.5 KB); the
  budget went 56 → 58 for that, with no dead CSS to cut: every class the scan finds unnamed is built in the code). The
  next family feature needs room: trim first (the owl's moods are ~6 KB), and weigh what it is worth before raising
  the budget again (each KB ≈ 20 ms on slow 3G, first open only; the service worker keeps the files).
- **XP is `xpItems`** (4 Nov 2026): every place that sums XP (the week, the race, the bars, the best week, ever) goes
  through it, so the marks won back on a second try count everywhere at once. Never sum `lv.got` by hand again.
- **A comma is not always a list** (4 Nov 2026): "ரூ. 1,250" was split into two boxes. `money()` runs before any
  `topSplit` in `wantsOf`; a new shape with commas inside one answer must be joined there first, with a test that a
  list ("70, 85", "3,6,9", "100,121,144") stays a list.
- **Read a key only through `phoneKeyFor`** (4 Nov 2026): it adds the teachers' fixes (`phoneFixes`). A new reader of
  the key that calls `phoneKey` directly would mark against answers the owner already corrected.
- **A level's screen is loaded once, when it opens**: a reader or key change while a student is inside a level
  reaches his phone only when he opens the level again. Check compares the boxes his screen showed (`typed[].b`) and
  sends a mismatch to the teacher. Tell him to close (✕) and reopen the level to see a fix.
- **Changing how a key reads changes past Checks too**: the reader runs on every request, so a question the phone
  could not read yesterday has a box today, also in levels already checked. Anything stored at Check (the photos owed)
  keeps its own numbers (`owe.pm`/`pg`, `partMarks`); test the old-row fallback.
- **A key's answer shapes** (`convex/lib/phone.ts`, 4 Nov 2026): a new unit or shape goes in `UNIT_WORDS` (normalized
  form: `cm^2`, longest first is automatic) with a test in `tests/family.test.ts`; a one-letter unit only with a space
  before it (else "5m", an answer in m, breaks). `notes()` drops any bracket with a comma, so a whole-answer point or
  set is read before it (`itemOf` on the whole text). Playwright won't click an `aria-disabled` key (the pale pad):
  `click({ force: true })`, as a finger would.
- **The family app keeps everything per child** (3 Nov 2026: several children on one phone): use `keep()` from
  `src/family/net.ts` (it prefixes the child's id), never `localStorage` straight; the sound switch is the one
  phone-wide setting. A request answered after the parent switched child is dropped (`loadMe` checks `current()`).
- **The loading owl has one copy**, `public/splash.html`; both pages hold `%SPLASH%` (the build fills it, with each
  app's own "still loading" words). Change the owl there; its styles are `src/splash.css` (shared; `.splash-name` uses
  `--cond` with a fallback). The family app draws the same owl again from the page (`keepOwl()` before it goes).
- **The family bundle imports only small, import-free files from the teachers' side** (`src/questionView.ts`,
  `src/splash.ts`) and TYPES from `convex/`. Anything that pulls `convex/_generated/api`, the store or `live.ts` would
  blow its 50 KB budget.
- **The family app's owl is one drawing with moods** (`Owl mood=…` in `src/family/ui.tsx`): the marks are added into
  the splash's SVG (`HEAD` inside the head so they turn with it, `ROUND` around it) and each mood's CSS stops or holds
  the splash's own animations (`.f-owl .mood-*` in `family.css`). Every copy gets its own eye-socket ids (`owlSeq`):
  two owls must never share a clipPath id. Colours: `--owl-*` in `:root`.
- **No green in the family app** (his ask): ✓ is blue (`--right`), avatars use `hueOf`'s palette. Its words for
  students: a term is a World, a unit is a Stage (teachers' screens say "Open every Stage" too), levels are Levels.
- **The family app's colours each have one meaning** (4 Nov 2026, `:root` of `family.css`): violet = the app, gold =
  START and wins, flame = days in a row, gem pink = XP, blue = right, rose = wrong. A new piece picks the colour of its
  meaning; never a big flat gold or pink surface, never gold behind the owl (that fight was his complaint). The owl is
  white inside `.f-hero` and `.f-today` (violet), light violet elsewhere.
- **The family app's words** (4 Nov 2026): English for chrome and game words (tabs, buttons, days M T W T F S S, times,
  labels, World/Stage/Level/XP), Tamil for the owl's voice and every sentence; never one thing in both languages. No
  letter-spacing on Tamil (kickers are English only). The run-through finds buttons by these words: change both.
- **The family app's font** (`src/family/fonts/baloo-thambi-2.woff2`, OFL): Baloo Thambi 2 from `google/fonts`
  (`ofl/baloothambi2/BalooThambi2[wght].ttf`; clone with `--filter=blob:none --no-checkout --depth 1` and a sparse
  checkout of that folder, the whole repo is gigabytes), cut with fontTools: `fonttools varLib.instancer F wght=500:800`
  then `pyftsubset` with `--unicodes="U+0020-007E,U+00A0,U+00B2-00B3,U+00B7,U+00D7,U+0B80-0BFF,U+200B-200D,U+2013-2014,
  U+2018-201D,U+2022,U+2026,U+2212,U+25CC" --layout-features="ccmp,locl,akhn,rphf,pref,blwf,half,pstf,abvf,pres,abvs,
  blws,psts,haln,cjct,nukt,init,calt,liga,rlig,kern,dist,mark,mkmk,abvm,blwm,tnum" --flavor=woff2` (~57 KB; Tamil's
  shaping needs the layout features). A sign it lacks (✓ ✗ ✍ ⌫ →) falls back to the phone's font. Weights 500–800
  only: use 500 for body, 700 bold, 800 display. The page preloads it (`%FONT%`, filled by `scripts/build.mjs`).
- **Nothing may stick out past the phone's edge, not even for one frame** (4 Nov 2026, his report "the screen bounces
  after →"): the next question slid in from 28px to the right, 12px past the edge; for ~130 ms Chrome on a phone made
  its viewport bigger (393 × 780 → 405 × 804) and every fixed thing moved (the pad dropped 24px, then came back).
  `noSideScroll` never saw it (it looks once, after the motion). A screen with sideways motion is clipped
  (`overflow-x: hidden; overflow-x: clip`: `.f-play`, `.f-result`), and the run-through checks every frame
  (`framesOf` in `family.e2e.ts`). To see what moves, record each frame in Playwright (`requestAnimationFrame`:
  `scrollWidth`, `innerHeight`, a fixed element's rect, `scrollY`).
- **Fingers in a run-through**: Playwright's `tap()` is one finger. A pinch or a swipe needs real touch events over the
  Chrome DevTools protocol (`Input.dispatchTouchEvent`, after `Emulation.setTouchEmulationEnabled` with
  `maxTouchPoints: 5`, or a second finger never lands): `fingersOn` in `family.e2e.ts`. `Input.synthesizePinchGesture`
  and `synthesizeScrollGesture` do nothing in this headless Chrome (a 5,000px page didn't move), so a test built on them
  passes on broken code: make it fail on the old code first. A page zoomed by a pinch stays zoomed
  (`Emulation.setPageScaleFactor` 1 resets it; `resetPageScaleFactor` doesn't).
- **Long-press can't be acted out here**: this headless Chrome never selects a word under a held finger (Android's
  touch selection), even on a page that allows it, so the run-through checks the rule itself (`user-select` is `none`
  on words and the printed question, `text` on the typing boxes). Never put `user-select: none` on `*` or on inputs:
  an iPhone then can't type in the box.
- **Our own gestures** (`QuestionZoom`): the element gets `touch-action: none` (the browser then sends every finger as
  pointer events and does nothing itself), the fingers move a child by `transform` only, its layout size
  (`offsetWidth`) is unchanged by the transform, and a `ResizeObserver` keeps it in bounds when the drawing grows.
- **`scrollIntoView` scrolls every scroller up the chain, the page too**: a chip centred in its row also pulled the
  page up to the row, and the card's own smooth scroll took it back down (the same bounce, with the questions as
  printed). To move a row sideways, scroll the row (`row.scrollTo`); move the page only on purpose, in a layout effect
  (before the screen is drawn).
- **Motion in the family app is transform and opacity only** (no animated box-shadow, blur or layout): a cheap Redmi
  stays smooth. A small owl is `still` (only its mood moves): a living owl is eight SVG animations repainted on the
  main thread. Loops only where the eye should go (the header's owl, START's halo, a waiting START's light).
- **The owl lab** (4 Nov 2026): to judge a mood, bundle a tiny page that renders every mood (`Owl mood=…` from
  `src/family/owl.tsx`, the family CSS, `public/splash.html` for `keepOwl`) with the repo's esbuild (`format: "iife"`,
  `nodePaths` = the repo's node_modules: a module script won't load over file://), then in Playwright pause every
  animation at a time (`document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms })`) and screenshot.
  Marks are in the drawing's coordinates (eyes 559,603 / 703,603; beak tip 629,708; shoulders 618,722 / 644,722);
  a mark that animates sits in `at(x, y, …)` so it turns or scales around its own anchor. Over the budget? It was 50 KB
  until the owl's acting, 56 until the photos and the zoomed question, 58 since: weigh what a feature is worth before raising it again.
- **Look at the family app**: `npm ci` works here now (4 Nov 2026), so `npm run build` and the run-throughs run as on
  GitHub (`SHOTS=<scratchpad>/shots npx vitest run -c vitest.e2e.config.ts tests/e2e/family.e2e.ts`, ~45 s; `fam*`
  shots at 360 and 320 px). Without packages: esbuild is in `/opt/npm-tools`, Preact's source can come from GitHub,
  and a fake `window.__ARISTORA_TEST_BACKEND__` answers its calls. The GitHub check is still the judge.
- **A new extra permission** (like `feedback`): `convex/schema.ts` `extra`, `convex/lib/auth.ts` (`Extra`, `EXTRAS`,
  `PERM_WORDS`), `src/store.ts` `Extra`, `src/settings.tsx` `EXTRA_NAMES`/`EXTRA_HELP` (typecheck refuses until all
  are there). The owner gets it by himself (`EXTRAS`).
- **The map's road** (`src/family/map.tsx`): its SVG stretches only sideways (`preserveAspectRatio="none"`, x in % of
  the width, y in px, `vector-effect: non-scaling-stroke` so the line keeps its width); the stops are HTML buttons at the
  same (x %, y px). Change `spot` and both follow.
- **A hook before any early return**: the teachers' `App` returns early while loading or signed out; the gear's
  feedback count (`useFeedbackNew`) sits above those returns.

**Answer kinds (4 Nov 2026).**
- The slots in a printed question are `data-fill`, `data-opt`, `data-tick`, `data-mark`, never `data-b`: the book
  engine's cards (`<div class="si" data-q="12" data-b="12.0">`) and blocks already use `data-b` and `data-q`.
- A level's typed list per question is still one string a slot (`boxCount` counts pick boxes too), so Check's `b`
  (boxes shown) and the stale check work unchanged; a tap that changes several slots (✓ / ✗, marked words, cards,
  pairs) must write them in one update (`setRun`): two `set` calls in one handler lose the first.
- Playwright's CSS locators pierce the paper's open shadow root: `P.locator(".f-paper [data-opt]")` taps an option.
- The family bundle is ~62 KB with the kinds (budget 64 KB since that evening): `PAPER_CSS` is a string in the JS.
