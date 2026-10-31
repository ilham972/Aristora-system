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
- The CEO page reads `ceo.overview` with `fetchOnce` (one answer, again every 5 minutes), never `useQuery`: it reads a
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
- **Two classes on one server** (31 Oct 2026): test students (`students.test`) are the test class: `state.get` and
  `progress.board` send one class (`test`), never both. Anything new that counts or lists students across the school
  must skip test students (`s.test`: the rooms' scores, the report, Theory's lesson times use `calls.test`; demo is set
  on them too, so "demo never counts" places already skip them). They share the session: never let a test-mode phone
  end it (End the session is hidden there).
- The Theory and Evaluation pages are the same one-screen pieces (`.evx-*`, `src/roomkit.tsx`); Theory's colours come
  from `.tpx-page`. Change a shared piece and look at BOTH pages' shots. The e2e `ev*` helpers drive both pages.
- Demo work is dated 30–70 min back: just after Sri Lanka midnight it is "yesterday" and "today" checks fail. The
  e2e guards them with `nearMidnight()` (Asia/Colombo hour < 2); don't "fix" a test that fails only then.
- `overflow-x: auto` clips vertically too: rings and lifts inside a one-line row need padding in the row (no
  `translateY` on the open level). Items in a no-wrap flex row shrink unless `flex: none`.
- Playwright's click scrolls a covered element into view: check what must be on screen BEFORE such a click (the old
  "name y > 0" check passed while the name sat under the top bar).
- A sheet over a sheet (sign out over Attendance): `body.locked` is counted (`openSheets`), never removed by the inner
  one. A toast can cover a sheet's title: Correction clears toasts when a sheet opens.
