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
   **Everything also runs here, from source, with one script** (since 11 Nov 2026: `scripts/here/check.sh`; a
   minute to set up, then seconds a check, instead of a CI round each time): git can clone public repos even when npm
   can't. `scripts/here/check.sh setup` (once per chat: clones convex-js, convex-test, Preact 10.29.8 and fflate into
   `/home/claude/runner/src` and writes the scratch tsconfigs), then `… tc` (both projects; only the repo's own errors
   are shown; 4 lines about `any` in `tests/chime.test.ts` come from the stand-in's types), `… unit [tests/x.test.ts]`
   (one file in a second, all of them in about a minute), `… build` (`dist/`, under a second) and `… e2e "<name part>"
   [class|family]` (a run-through in seconds; screenshots in `/home/claude/runner/shots`; build first, after every CSS
   or page change). How it works: `scripts/here/runner.mjs` bundles one test file with `/opt/npm-tools` esbuild,
   `vitest` = the stand-in beside it (`vitest-standin.mjs`: add a matcher there when a test needs one), the libraries
   from source, `import.meta.glob` of the convex files replaced by a generated map, `?raw` as text, Playwright from
   `/opt/npm-tools` with `/usr/bin/google-chrome`; `scripts/here/build.mjs` runs the repo's own `scripts/build.mjs`
   with the same aliases (fonts and the silent video stubbed). **What only GitHub can judge** (they fail here on main
   too, 11 Nov 2026: run them on a stash before blaming a change): the checks that measure the top bar at 320 px or a
   text's width (no Barlow font here: "the register", "Correction: one page", "Theory: one screen", "Evaluation: one
   screen", "Owner page", "Whole class", "Consultation"), the family "photos from home" (web-push is a stub), and the
   family app's size budgets. So: iterate here, then one `ci-<topic>` round before main.
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

## The Claude link: reading and saving his books from a chat

The owner turns it on (Settings → Books → Claude link → Turn on → Copy the code) and pastes the code into the chat.
Keep the code in the chat's shell only (`export ARISTORA_LINK="ARISTORA-LINK name.key"`), never in a file of the repo;
keep what comes back (his books' content) in the scratchpad, never in the repo.

```bash
cd /home/claude/aristora-system
TSX=/opt/npm-tools/node_modules/tsx/dist/cli.mjs
echo '[{"name":"books","fn":"ask","req":{"op":"books"}}]' > $SCR/req.json
node $TSX scripts/claude-link.ts $SCR/req.json $SCR/link-out        # → $SCR/link-out/books.json (about a minute)
# a unit, then its questions (ask again with "from": next while next is not null):
#   {"name":"u05","fn":"ask","req":{"op":"unit","unitId":"<unitId>"}}
#   {"name":"u05-q1","fn":"ask","req":{"op":"questions","unitId":"<unitId>","from":1}}
# save its kinds (the whole key) and only the questions whose HTML changed:
#   {"name":"save-u05","fn":"tell","req":{"op":"save","unitId":"<unitId>","answers":[…],"items":[{"q":12,"html":"…"}],"dropFixes":true}}
```

- One file of requests = one push to a branch `link-…` (an orphan commit: the carrier's two files and the sealed
  requests) and one run of the "link" job (no install: about 30 seconds); the script waits for the answers, opens
  them, then empties the branch (an empty commit: deleting a branch is refused from a chat). `LINK_BRANCH=link-<topic>`
  pushes over the same branch each time. Requests go in the file's order.
- When the work is done, tell him to tap **Turn off** (Settings → Books → Claude link): the code is in the chat.
- A save is checked like an uploaded zip and is all or nothing; its answer says what was wrong in plain words
  ("Question 12: the book prints 0 blanks, its key uses 1."), else what the phone now marks (`share`: marks, parts
  phone / read / photo, and the photo parts' numbers). Send a unit's whole key (`answers`), never a piece of it.
- "The app took nothing" = the link is off, its 7 days are over, or the code is another link's: ask him for a new code.
- Keep each request under about 1.5 MB (`LINK_SAVE_MAX`; the seal is plain TypeScript, about a tenth of a second a
  megabyte, and a Convex function has one second).
- The functions `link.ask` and `link.tell` print OPEN in the audit below on purpose: the seal is their sign-in.

## Digitize a unit in the app (through the Claude link)

His rule (10 Nov 2026): every answer is given on the phone (a box, a tap, the pad with =, a word, his own words typed);
a photo only for a drawing or a construction. With the link's code in a file outside the repo, everything else in the
scratchpad (his answers and questions never go in the repo):

```bash
cd /home/claude/aristora-system
TSX=/opt/npm-tools/node_modules/tsx/dist/cli.mjs; export ARISTORA_LINK_FILE=$SCR/link-code; D=$SCR/units
node $TSX scripts/digitize.ts pull $D                 # Grade 8 Term 1 (or name units: G8-U03 G8-U04): books, keys, questions
node $TSX scripts/digitize.ts review $D/G8-U03        # what needs a decision: photo parts, gaps, words-only keys, matchings
#   write $D/G8-U03/kinds.ts with scripts/digitize-kinds.ts (its head says how): num, nums, eq, word, pick, why, say,
#   fill, choose, tf, mark, order, match, photo, split (two answers under one sub-question), paper (hide a printed block)
node $TSX scripts/digitize.ts build $D/G8-U03         # every check of the upload + the phone marks the key's answers right
node $TSX scripts/phone-look.ts $D/G8-U03 $SCR/look   # each question drawn as the phone draws it; what runs past the card
node $TSX scripts/digitize.ts push $D G8-U03 G8-U04   # saved in the app, all or nothing a unit; the phone's share back
```

- Local tools need two things the packages would give: esbuild and Playwright are in `/opt/npm-tools`; `fflate` is
  stubbed (a folder `node_modules/fflate` above the repo, exporting `unzipSync`, `zipSync`, `strToU8`).
- `build` refuses anything the upload would refuse, and more: a key's own answer typed on the phone must get its
  marks, nothing typed must get 0, a split's marks must add up to its part's, every part needs a kind (a words-only
  key's parts get the kind the app read from their words: review them).
- A matching question's printed columns: `match(…, { hide: "table" })` or `paper("table")`, else the phone shows them
  above the same pairs as cards, cut off. A matching drawn as a figure: `{ hide: ".qfig" }` (its whole box: hiding the
  svg alone leaves its height empty).
- The form the question asks for (G7, 10 Nov 2026): "simplify" an expression → `simplified("4x + 7y")` (the question
  typed back says the same and is no answer); a fraction "simplify" / "as a mixed number" / "as a decimal" →
  `num(v, { same: true, also })` (6/8 is not taken for 3/4); ascending order → `nums([...])` in order, never `any`
  (the words-only reading takes a list for a set). A set's elements → `members("A =", [...], { letters })`.
- The key's own words stay as the teachers read them (its working: "x + x + 10 = **2x + 10**"); a kind's words only
  where the key has none.
- ✓ / ✗ in a table's empty cells: `tf([...], { cell: true })`. A blank drawn by its style (a box, a dotted line), not
  an `.ab`, is a blank to `fill` too.
- Parts of one sub-question ("name it and find its perimeter"): `split(["பெயர்", 1, pick(…)], ["சுற்றளவு", 1, num(…)])`.
- Never ask twice (10 Nov 2026): a question that prints its own blank (□, "(−15) + □ + (−3) = 34") takes its answer in
  that blank, `fill(…)` (or `fillAfter(n, …)` when the first n blanks are another part's), not a box under it; a printed
  blank for a name that is tapped below is hidden, `"@": paper(".ab")` (`".ab:*"` = every one). A blank raised as a
  power ("2□ × x³") is drawn small and raised by the family app's PAPER_CSS.

## Put one question right (a student's call)

11 Nov 2026, his ask: "if I say the grade, unit and the question number, then immediately go to that place and solve
that problem, without wasting the token". Four commands and one small file, nothing else to read (the link's code in
a file outside the repo, `$B` = a folder in the scratchpad):

```bash
tsx scripts/digitize.ts pull $B G8-U09            # the unit as the app has it now (kinds and slots included)
tsx scripts/digitize.ts show $B/G8-U09 12         # the question in a few lines: words, part labels, key, kind, slots
# $B/G8-U09/kinds.ts: only that question, e.g.  export default { 12: num("1.05", { u: "t" }) };
tsx scripts/digitize.ts ship $B G8-U09            # build (every check) → save → read back and compare
```

- A question decided again starts from its printed page without slots (`unslot`): give its ops again for every part of
  that question that fills blanks, taps options, ticks or underlines (the check on slots says which is missing).
- `rekey(words, kind)` = the key's own answer was wrong; `retype(from, to)` = a printed mistake; `both(a, b)`.
- The pad check (`padProblem`): every answer must be typeable on its box's pad. G8 Mass Q12 "1.05 t" was a box in
  the letter t (a tonne read as algebra; the letters' pad has no decimal point): a unit goes in `u`. `build` on a unit
  with no kinds.ts lists every such answer.
- Answers a teacher typed in the app (Settings → Books) override the key at their parts: `show` prints them, a save
  keeps them; `ship … drop` replaces them (decide those parts in kinds.ts first).

## Security audit

After adding functions, every function must print GUARD except the open ones on purpose: `auth.me`, `auth.setupOwner`,
`auth.peekLink`, `auth.useLink`, `auth.signInPin`, `auth.signOut`, `clock.ping`, and the family app's `family.*` (`peek`
and `join` check the family link; the rest call `familyViewer` / `familyActor`: the family phone only). Also `link.ask`
and `link.tell` (10 Nov 2026, the Claude link): they answer only a request sealed with the link's key (`opened`).
And `coins.shop`, `coins.buy`, `coins.cancel` (10 Nov 2026, the Shop: `familyViewer` / `familyActor`, which the
script's lower-case match misses); `coins.payday` is internal. And `online.beat` (`familyActor`), `online.usage`
and `online.usageDay` (`whose` → `familyViewer`) (12 Nov 2026); `online.sweep` is internal.

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

- **A refused live query looks like "Loading…" for ever** (11 Nov 2026): `useQuery` (`src/live.ts`) gives `undefined`
  on an error, the same as "not here yet". A page's reads must allow every permission that opens the page: the
  Consultation tick alone was refused `catalog.key`, `question` and `bookCss`, so a consultation teacher's card said
  "Loading the answer…" while the owner's phone showed it at once (it looked like a slow phone). A new page or
  permission: list its queries (`grep -o "api\.[a-zA-Z]*\.[a-zA-Z]*"`) and check each one's `viewer(…)` list.
- **The family's later parts are at their budget again** (10 Nov 2026): 44.6 of 47 KB (`FAMILY_LATER_KB`, raised from 42
  for the typed answers, then for the Shop). The level screen is where the next kinds will land: measure with esbuild before CI.
- **A new answer kind or box field goes in four places**: `Ans` / `BoxAns` (`convex/lib/key.ts`, with `ansProblem`), the
  validator `ansKind` / `boxAns` (`convex/schema.ts`), the upload reader's field lists (`kindOf` in
  `src/workbookFile.ts`), and the phone (`typedPart` / `boxWant` in `convex/lib/phone.ts`, `kinds.tsx`, `play.tsx`).
- **The Shop's coins are not XP** (10 Nov 2026): never lower XP or a race number to pay for a thing; buying lowers
  `wallets.n` only. Anything new that gives XP (a new answer kind, a new way to mark) pays coins by itself through
  `xpItems(rows, true)` (convex/lib/family.ts) on the next Monday, unless it is Us XP (not in `xpRows`) or a home
  workbook Level not yet checked (`lv.home && !lv.hc`). A rule that should never pay must stay out of `xpItems`'s `pay`
  path. The weekly pay keeps the XP paid out (`wallets.xp`) and never takes coins back: marks taken back fill first.
- **A file in storage needs a keeper** (10 Nov 2026): `photos.sweep` deletes every image a day old that no row names
  (`homePhotos`, `usFiles`, and since 10 Nov `shopItems.ph`). A new kind of upload must be named there, or it vanishes
  the next day.
- **A new screen for students goes into the later parts** (10 Nov 2026, the Shop): as its own lazy file it cost the first
  load 0.9 KB more (esbuild split the code it shares with the first screen into one more chunk) though nothing was added
  to the first screen; inside `parts.ts` it cost the later parts 2.1 KB (their budget 44 → 47). Its style goes in
  `profile.css` with the parts'.
- **The top row is full** (10 Nov 2026): who, the flame, the XP | coins capsule, the bell, Feedback fill a 320 px phone
  with "1.2k" numbers and no name; under 480 px the name is hidden. One more piece needs one taken out (or the capsule
  to take it). The Shop run-through's `topRowFits` checks every piece is inside the screen and none overlaps.
- **The owner's "top bar fits at 320 px" check fails under load** (10 Nov 2026): with both run-through files at once,
  "Whole class" failed it in one full run and "Consultation" in the next, on a change that doesn't touch the teachers'
  top bar; both passed alone (`-t "Consultation|Whole class"`). Rerun that one alone before blaming a change.

- **Her own app is two layers** (8 Nov 2026): her pages (`users.pages`, the UI) and her jobs (`users.tabs`, the server's
  permissions). The jobs no longer name a department: a Fighter lead has Theory AND Evaluation (both kinds of work on
  her books) and often Correction (Class mode). So never read "has the Correction job" as "is Correction": a Fighter or
  Master person never sends Correction's calls (`mayHandle` in `convex/calls.ts`, `phoneSends` in `src/callRoute.ts`),
  hears only her department's alerts (`alertItems`), and `desk.mark` checks her department against the book. A person
  with no pages keeps the app of before: the run-throughs of the old Theory and Evaluation pages still use that.
- **A reload right after a tab change** (8 Nov 2026): the phone remembers its tab (`aristora.role`) in an effect just
  after the page shows, so a run-through that reloads at once can open the page before (the old "Done 2" flake of the
  Evaluation run-through: it opened the Register). Wait for `localStorage.getItem("aristora.role")` first.
- **The run-throughs' owner has the old bar** (8 Nov 2026): his default bar became Dashboard, Class, Fighter, Master,
  Correction, Us, so `newClass()` in `tests/e2e/class.e2e.ts` gives the test owner the pages those run-throughs were
  written for (Class, Correction, the old Theory and Evaluation pages, Us: his own pages) and `newClass({ defaultBar:
  true })` the real default (the "Owner's own app" run-through). A run-through that opens his phone on "theory" or
  "evaluation" needs those pages; `addPerson` takes `pages`. The family run-throughs' owner has the default bar (they
  use Correction, Class and Us).
- **Preview is the owner's phone pretending** (8 Nov 2026): `currentMe()` / `may()` give the previewed person, the
  data still comes with his sign-in, and every mutation is refused (`LOOK_ONLY` in `src/backend.ts`; only `clock:ping`
  passes). Anything new that writes on its own (a timer, a background save) must expect that refusal quietly.
- **A teacher's tap needs its book's stage on its history line** (`events.stage`, 8 Nov 2026) for her department's
  "cleared today" and "every class" (`work.days`, convex/lib/work.ts): log it on any new tap that explains or teaches (desk, consult and board do), with `stage`.
- **The phone's clock is not the server's**: a "since" the phone sends (the desk page's sitting) must come from
  `now()` in `src/store.ts` (synced), never `Date.now()`, or a phone a few minutes fast hides the squares it just did
  and can't undo them.
- **The Convex bill: what one tap costs** (10 Nov 2026, his first month hit the free plan's limit; top: `state.get`, then
  `focus.claims`, `focus.drafts`, `catalog.key`, `focus.claim`). A live query runs again, whole, on every phone that has
  it open whenever ANY row it read changes, and every run counts all the bytes it reads. `state.get` read every
  student's marks in every book, and a draft tap on Correction rewrote the student's `lastActivityAt` and the class's
  `lastActivityAt`, so each tap re-read the whole class on every phone. Now: phones read `state.live` (students, calls,
  session) and one `state.his` per student (his books; only his own changes wake it), put together in `src/store.ts`
  (`state.get` stays for old phones and the tests; `tests/boardSplit.test.ts` proves the parts add up to it); `touch`
  and the draft tap's student write at most once a minute; "still here" every 45 s (a book free after 2 minutes, not
  1). Before adding a live query, ask: what does it read, and what writes to that on every tap? Never write to
  `students`, `sessions` or `users` on every tap.
- **Every mutation keeps the fees too** (9 Nov 2026, `convex/lib/fn.ts`): `watched` notes the students whose
  `attendance` or `handouts` rows were inserted or deleted (a delete reads the row first), and as the handler ends
  `syncFees` (`convex/lib/feeRows.ts`) adds or removes their class and book charges and rebuilds their `accounts` row.
  So a new way to sign in or give a book is charged by itself; anything else that should charge must go through those
  tables or call `syncOne`. A `t.run` in a test skips it (like the race). Nothing happens before the owner's set-up
  (meta `fees`), so a test without `money.setup` sees no charges. A charge is a row with its amount: changing the fee
  never touches a day already charged.
- **A `hidden` attribute loses to the page's CSS** (9 Nov 2026): `.segc { display: inline-flex }` showed a `hidden`
  segmented row anyway (a run-through still found "Books given"). Leave it out of the render instead.
- **A new card on a page needs its own class names** (9 Nov 2026): the Money and books card first used `.dash-team`, and
  a run-through's `O.locator(".dash-team")` (`.first()`) read it instead of Corrected today's. Name new lines after the
  card (`.mn-dline`).
- **Management's preset is six pages, the most a bar holds** (9 Nov 2026: Dashboard, Class, Correction, Fees, Books,
  Us): adding one of the owner's own pages to it means unticking another (the "Owner's own app" run-through unticks
  Class for the Owner page).
- **Running the checks here with no npm**: `scripts/here/check.sh` (step 3 above; since 11 Nov 2026 the runner is in
  the repo, nothing to rebuild in a new chat).
- **A pad that stays on the page needs its own guards** (11 Nov 2026, the Fees and Books pages; before, the money sheet
  closed after Paid). (1) After Paid the ticks are cleared and Paid waits for the student's lines to come back
  (`paidOn === d`), and the server refuses a payment whose ticked charges are all paid (`money.pay`): a second tap or a
  second phone takes nothing. (2) "Sure? Tap again" ignores a second tap within 450 ms (`SURE_MS`): a double tap is not
  a yes. (3) A tap on a name always picks (never unpicks): a double tap must not empty the pad. (4) The page's own
  ticks (Stock) are put in state once shown (`auto`), or a student signing in adds a name to "Give to 3".
- **A sheet inside a sticking pad opens under the top bar** (11 Nov 2026): `.fc-pad` is `position: sticky; z-index: 5`,
  its own layer, so a `Sheet` rendered inside it can never rise above the header (Playwright: "top-wrap intercepts
  pointer events"). Render the sheet beside the pad (`DeskFor` returns the pad and the sheet as siblings).
- **A state's class on a pill must not be a button's class** (11 Nov 2026): the paid pill was `.mnx-paid`, the same as
  the big Paid button, and grew to 58 px. The names' states are `.mnx-s-*` (money) and `.mnx-b-*` (books); grep a new
  class in `src/styles.css` AND in the `.tsx` files before using it.
- **The desk pages' layout sums** (`.mnx-body`, like `.tp-body`): its `min-height` ends where the pad sticks, so
  `.mnx-page` has no bottom padding (`.mn-page`'s 18 px lifted the pad at the end of a long list); the pinned rows'
  height is `--mnx-stick-h` (`useDeskPage`), the pad's `--mnx-pad-h` (`DeskPad`), and the toasts sit above the pad
  (`body.mnx-desk .toasts`; a tab with no pad sets it to 0). The chips' row is an `HRow`: a ticked chip is `.tk`, never
  `.on` (`.on` is what `HRow` centres, and a tick must not scroll the row).
- **A row in `fees` that is not money** (11 Nov 2026): `k: "off"` (a class taken off, Rs 0) lives in the ledger so his
  sheet and the Business tab can show it; `replay` skips it (Rs 0), `isCharge` is false. Anything new that lists a
  student's lines must know it (`History`). `money.business` names students from every account, then from the student's
  row: one whose only line is an `off` has an empty account, or none.

- **A consultation is an evaluation-room call with `consult: true`** (5 Nov 2026). Anything that lists a teacher's
  Evaluation room must leave it out (`evalRoom`, `evalItems`), anything that bumps, pulls or sends a student must refuse
  it (`calls.create`'s `inConsult`), and Correction's words and strips name only her (`callPhrase` `consult`,
  `CallsBand`). A new place that reads `c.room === "evaluation"` as "with an Evaluation teacher": check `c.consult`.
- **Fake timers + convex-test: every mutation of a test runs at the same millisecond** (+1). A rule like "done before
  this consultation" (`since` = the call) can't tell them apart: move the clock (`vi.setSystemTime(Date.now() + MIN)`)
  between "before" and the call, and compare saved times within half a second (`now()` in `tests/consult.test.ts`).

- **A photo asked again comes back in the same row** (5 Nov 2026, the ⌂ lane): `family.photoSend` patches a retake's
  `homePhotos` row back to "waiting" with a new `at`. Anything that remembers "answered" or "seen" for a photo keys on
  its id AND `at` (`answered` in `src/homeLane.tsx`), or the re-sent photo stays hidden.
- **A new package** (7 Nov 2026, web-push: the first deploy failed twice over): Vercel installs with `npm ci --omit=dev`,
  so (1) package.json and package-lock.json must agree exactly (pin the version in package.json, then `npm install
  --package-lock-only`; a hand edit of package.json alone makes `npm ci` refuse), and (2) anything the server needs at
  deploy, its types too (`@types/web-push`: Convex typechecks `convex/` while deploying), goes in `dependencies`. Check
  it before pushing: copy package*.json, tsconfig.json, convex, src, scripts, public into an empty folder, `npm ci
  --omit=dev`, `npx tsc -p convex --noEmit`, `npm run build`.
- **Phone alerts in tests** (7 Nov 2026): a mutation that calls `alertStudent` schedules `push.send` only when a phone
  of that child turned alerts on; a test that turns them on fakes `setTimeout` too (`vi.useFakeTimers({ toFake: ["Date",
  "setTimeout"] })`) so nothing is sent, and reads `_scheduled_functions` (names like `push:send`). `push.ts` is "use
  node" (web-push): unit tests run in edge-runtime and must never run it; the run-throughs (node) may. Headless
  Chromium says `Notification.permission` "denied" whatever `grantPermissions` says: the run-through stubs
  `Notification`, `navigator.serviceWorker` and `PushManager` in an init script. To check web-push itself, send to a
  local https server and decrypt with `http_ece` (done once on 7 Nov 2026: 201, the Tamil text intact).
- **A second try's half marks are in two places on purpose** (10 Nov 2026): `rh` on the question and inside its level's
  `got` (`secondTry`), so every reader of a level's marks (Progress, the gate, the reports) counts them with no change.
  `xpItems` gives `rh` on the day of the second try and takes it off the question's `t` (the level's day). Anything new
  that rewrites a level's `got` from its questions must add `rh` back, or the half marks vanish.
- **The redo is level n = 0** (10 Nov 2026): ladder levels are n < 0, workbook levels n ≥ 1. `props.n > 0` on the phone
  means "a real workbook level" (photos, its book); keep it that way.
- **Explained (`MQ.x`) means a teacher explained it, or he got it right on a second try** (6 Nov 2026, the founder's rule: "the photo is for correction
  only"): marking (a photo, a level's Save) never sets `x`; only Evaluation (or a question that came back right) does.
  Setting it from a photo once made Evaluation skip questions nobody explained. And anything new that sets `lv.hc` (a
  home level corrected in class) calls `closeClassPhotos` (`lib/homeWork.ts`), or its photos wait in the ⌂ lane for
  nothing.
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
- **A question's marks have one more source: free marks** (5 Nov 2026, `convex/lib/free.ts`): anything that marks a
  master level (the phone's `check`, `workbook.correct`, a new way to come) gives a free question (`isFree`) its full
  marks first and skips its own rule, with `freeRow(max, the row before, now)` so `fr` keeps what to give back; a
  reader that picks questions to do again (`retryPool`, `comesBack`) skips them; the ⌂ lane's `photos.mark` never
  meets one (its photo closed with `homePhotos.free`; Save says why). A rule that rewrites `books.data`
  keeps `free` (`saveWorkbook` does on a same-shape upload). Rows with `fr` are students' marks like any other: don't
  read `fr` anywhere but `setFreeIn`.
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
- The bottom bar's six tabs are 53 px each on a 320 px phone (8 Nov 2026): a tab's count (`.tab-badge`, absolute)
  counts in the tab's `scrollWidth`, so `.tabs.n6 .tab-badge` sits closer and smaller; a check that "every tab's words
  fit" fails on the badge first. A segmented row (`.segc`, overflow hidden) inside a sheet's flex column shrinks to
  nothing and the sheet's body takes its clicks ("intercepts pointer events"): give it `flex: none`.
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
  upload is left to the hourly sweep (never delete then `fail`). The sweep deletes image and audio files nobody
  references a day after they were made (12 Nov 2026): a voice note must be referenced the moment it is sent (the home
  lane's by its row's `askVoice`; a thread's by a mark in `usFiles`, like a photo on Us). convex-test can't return a Blob from `t.run` (send bytes); its `getUrl` ends with the file's base64 sha256
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

**The race kept ready (7 Nov 2026).**
- **Every mutation comes from `convex/lib/fn.ts`**, never from `./_generated/server` (`tests/race.test.ts` reads every
  server file and fails on it): its db is watched, and as the mutation ends the progress rows it wrote and the students
  it added, renamed, moved, removed (or whose photo or birthday changed) reach `raceRows` / `raceParts`. A new server
  file: `import { mutation } from "./lib/fn";`. A mutation that skips it leaves the race stale for those students.
- **Writes in a test's `t.run`/`raw.run` skip the wrapper** (they are not mutations): the race rows don't follow. Until
  meta `raceV` says the rows are ready the race works out the old way (from everyone's rows), so old tests that seed
  progress straight still see it; a test of the rows runs `internal.race.fill` first (it builds what is missing, then
  sets `raceV`). One progress row per student and book in a fixture (`students.add` with a unit already made one: patch
  it), or the map and the race disagree (the map reads the first row, XP adds both).
- **What counts as XP changes in one place** (`xpItems`, `levelDays` in `convex/lib/family.ts`): then add 1 to
  `RACE_V` (`convex/lib/raceRows.ts`; 2 since 8 Nov 2026: days learned and the months): every row is built again by
  `race.fill` (20 a run, again at once while rows are left); until it is done the race reads everyone's rows the old
  way. A new field of `XpNums` must be optional in `xpFields` (old rows) and `sameNums` must say "not the same" when
  it is missing, or old rows are never rebuilt.
- **A race row's numbers are as of the moment they were worked out** (`wk`, `d`): read them only through `numsAt`
  (`raceRowOut`), never `row.xp` straight (on Monday it is last week's).
- **The family's budgets** (7 Nov 2026, after the race and profiles): first load 58.5 of 66 KB, later parts 32.7 of 36
  (raised 32 → 36 with his yes for profiles). `convex/lib/race.ts` is pure and imports only `./day`: keep it so (the
  phone imports it). Since 8 Nov 2026 the race tab is a later part (`raceTab.tsx`, `goat.tsx` via `parts.ts`; its
  style in `profile.css`, which loads with the parts); `board.tsx` keeps only what the first load needs (`useBoard`,
  `Cheered`, `GiftCards`, `PayCard`, `endsIn`). Budgets after the three lists and the GOAT (11 Nov 2026, the leagues and
  ranks out): first load 63.7 of 66, later parts 43.4 of 47, Us 24.1 of 28, the chats 7.9 of 20, the teachers' Us 7.8 of 8.
- **The old race for old phones**: `family.board` still sends `top` / `me` / `count` (phones that opened the app
  before 7 Nov read them until they load the new version). The new field is `you`, not `me`. Remove after 21 Nov 2026.
- **The race's lists, the GOAT and the champions read through `raceList`**, never `raceRows` straight: before `raceV`
  says the rows are ready they are stale or missing, and `raceList` works either way. What reads the rows only when
  ready (`family.me` / `family.mate` `ever`, `goatWatch`) says nothing until then. A test that patches race rows inserts
  meta `raceV` = `RACE_V` first (`ready()` in `tests/goat.test.ts`), or the race ignores the patch; a run-through that
  writes progress rows straight (not through a mutation) deletes the race rows and runs `race.fill` (rows a student's
  `add` built stay at 0 XP otherwise).
- **The weekly coins and Monday's pay are two runs** (`race.week` 00:05 keeps `raceWeeks.cw`, `coins.payday` 00:15 adds
  them): payday only pays a wallet not yet paid this Monday, and `race.week` adds them itself when the pay came first
  (`winNow`), so either order pays once.
- **CSS class names are global, across the family app's files too**: the race's face was `.f-face`, also the feedback
  sheet's face buttons (its `display` leaked both ways); since 11 Nov 2026 the race's is `.f-rface`.
- **convex-test's clock never goes back**: a mutation runs at the later of the fake time and the last commit, so a test
  can't set the date earlier than a write it already made (a month test written backwards gave wrong months and
  hung). Write week and month stories forwards (Nov → Dec 1).
- **Something weekly that starts on a Monday shows its first week's 0 first** (9 Nov 2026: he woke at 2 AM to "everything
  started from zero"; on 11 Nov 2026 students still read it as "everything is gone"): what a student earned must stay
  visible as a list of its own (the All time list), not only in a sentence or a card.
- **A change to `race.week` deployed on a Monday after 00:05 waits a week**: that week is already in `raceWeeks`. The
  weekly coins (11 Nov 2026) first run on Monday 16 Nov.

**Us, the students' community (7 Nov 2026).**
- **The owl's lines are written by hooks** in the mutations that finish things (`convex/lib/us.ts`): `homeMoments` in
  `family.check` and `checkLadder` (a first level from home, days in a row), `stageMoment` in `family.check` and
  `workbook.correct` (a whole Stage), `backMoment` in `startVisit` (welcome back), `coinsMoment` / `champsMoment` in `race.week`, `goatMoment` in `race.fill`;
  birthdays, yesterday's count and the most improved come from crons (`us.daily`, `us.improved`). A new way to mark a
  level at home or to finish a Stage calls the same helper, or the community never hears of it. Each helper dedupes
  (once per Stage, per milestone and day, per day for birthdays and welcome back).
- **The count of who learned today rides on the race rows**: `writeRow` (`convex/lib/raceRows.ts`) calls `noteToday`
  with the student's XP today before and after (real students only): +1 from none to some, −1 back to none. It never
  scans anything. `lib/us.ts` must not import `lib/raceRows.ts` or `lib/family.ts` (a cycle through `writeRow`); pass
  what it needs (the streak, the home levels) from the caller.
- **Lines copy who the student is** (name, grade, photo key from his race row, OK'd and shown) when written: a rename or
  a new photo shows on new lines only. A wiped student's lines go (`wipeStudent` → `dropMoment`); a removed one's stay
  until they are 30 days old.
- **A demo or test student's lines are `demo: true`**: only demo phones read them (`feedOf(ctx, demo, …)`); the
  teachers' page reads the real ones. Tests that seed a line with `raw.run` must set `demo`, `day` and `c`.
- **The phone never builds the tab before the owner opens it** (`me.us`); the e2e opens it from Settings → Community
  (`.us-open` → Open) and reloads the phone. Its style is in `family.css` (the first load: the later budget was full);
  the code is a later part (`parts.UsTab`). Budgets after Us: first load 62.3 of 66 KB, later parts 35.4 of 36 (then
  62.9 / 35.6 with the teachers' tab, below). The next later part: ask him to raise it (he was asked 7 Nov, it wasn't
  needed), or put its style in the first load too.
- **The teachers' side is the class app's Us tab** (the same evening): an iframe of `/f/?staff` (`src/usFrame.tsx`) running
  `src/family/staff.tsx` with the class system's sign-in. Three things it needs: (1) **`frame-ancestors 'self'` under
  `/f/` only** (`vercel.json`, two rules: `/f/(.*)` and `/((?!f/).*)` with `'none'`; the e2e server reads the same
  rules, `tests/hosting.test.ts` pins them): with `'none'` the frame stays blank (`chrome-error://`). (2) **`staff.tsx`
  imports only types and Preact**: any import of the students' modules makes esbuild split the students' first load
  differently (measured: +1.1 KB for an import of `../splash`, `./board`, `./later`...; Preact alone still costs ~0.4 KB:
  its own chunk). It gets what it uses from `main.tsx` (`Kit`); `tests/usStaff.test.ts` fails on a value import.
  (3) Its own budget (`FAMILY_STAFF_KB` 8, 4.6 used): `scripts/build.mjs` keeps what only `staff.tsx` reaches out of the
  students' prefetch and budgets. Budgets after it: first load 62.9 of 66, later parts 35.6 of 36.
- **The class app's bottom bar has Us for everyone**: every run-through that lists the tab words ends with "Us"; five
  tabs for the owner (`.tabs.n5`: 13 px, 11 px at ≤345). Us is nobody's job: `role` follows her job as on Class.
- **`tests/teach.test.ts` is the Whole class page's** (and `shown === "teach"` in `app.tsx` is that page): the family
  app's teachers' screens are "staff" everywhere (`staff.tsx`, `?staff`, `staffWith`, `usStaff.test.ts`). Check a test
  file doesn't exist before writing one (that evening a new `teach.test.ts` replaced it for a moment).
- **Posts and doubts (the same night): who sees what is decided on the server only.** `lib/us.ts` `seesLine` (a line on
  his phone), `replyShows` (a reply), `replyOf` (which fields of an answer or reply: a name only to teachers, to him, on
  a teacher's words, or once marked right, and never the asker's), `itemOf(m, me, staff)` (a doubt's `sid` / `n` /
  `pic` only to teachers and him); `us.thread` filters the answers BEFORE it makes any photo address (a Convex file
  address opens for anyone who has it: an address sent is a photo shown). A new field on a line or an answer: decide
  there who gets it. `tests/usPosts.test.ts` checks the JSON a classmate gets has no name, words or address of a hidden
  answer.
- **A photo is two files** (small 560 px for the lines, big 1280 px for a tap: `usPost.tsx` `pickedOf`), checked and
  marked in `usFiles` by `takePhotos` (`convex/us.ts`: images, sizes `SMALL_BYTES` / `PHOTO_BYTES`, never used twice).
  Anything new that stores a file must mark it the same way or keep it out of `photos.sweep` (which deletes unmarked
  images a day old), and delete it with its row (`dropPhotos`). The sweep reads a 6-hour window of `_storage` by
  creation time (`by_creation_time` on the system table), never the whole table.
- **Class names**: `.f-ask` (Me's name sheet) and `.f-big` (the reveal's score) were taken; the doubt sheet is
  `.f-doubt`, the photo viewer `.f-lb`. Before a new `.f-*` class, grep both CSS files.
- **Budgets after posts and doubts** (his yes, 7 Nov 2026: later parts 36 → 42): first load 63.1 of 66, later parts
  41.0 of 42 (`usPost.tsx` and its style in `profile.css`), the teachers' Us 5.0 of 8. Old lines are deleted by
  `us.sweep` (scheduled by `us.daily`): unit tests that check the 30 days call it themselves.
- **Teachers' own tools in Us go in `staff.tsx`** (8 Nov 2026: Download / Share, find the mistake): Us's file draws them only
  through `setStaffTools` (usPost.tsx), so students' phones never download them; `staff.tsx` still imports only types and
  Preact (`U` = Us's file once loaded: `pickedOf`, `sendPicked`, `CropSheet`; `Kit` gives `Icon`, `picOf`, `usePics`).
  Their style is in `usStyle.ts` (the teachers' file was nearly full). Budgets after it: first load 62.9 of 66, later
  34.6 of 42, Us 18.0 of 20, the teachers' 7.5 of 8 (ask him before raising one). A teacher's photo is a `staffPhotos`
  row read as she is now (`staffPics` in `us.ts`: never copy her photo key into a line; `lp` keeps her id `u`). "Find the
  mistake" never stores who answered on the new line: its photos are copies her phone made (she may cut a name out),
  `src` points at the question, not the answer (`tests/usPeople.test.ts` reads a student's JSON for the name and id).
- **Us is its own file since the talk** (8 Nov 2026): `src/family/usParts.ts` (the tab, a line opened, the sheets) with
  its style as a string (`usStyle.ts`, attached once as it loads: a `<style>`, which the version check ignores), out of
  the later parts, with its own budget (`FAMILY_US_KB` 20 in `scripts/build.mjs`: what only `usParts.ts` reaches; not
  prefetched, `useUsParts` fetches it once `me.us`). Import Us only through `later.ts` `loadUs` / `useUsParts` (the
  teachers' Us: `K.useUsParts`). The bell's sheet moved to the later parts (`bellSheet.tsx`; Tamil words compress badly:
  they cost the first load 0.7 KB). Budgets after it (scratch build, matches CI to 0.2 KB): first load 62.9 of 66, later
  parts 34.6 of 42, Us 16.4 of 20, the teachers' Us 5.1 of 8.
- **The talk: who sees what, again only on the server** (8 Nov 2026). A comment is a `usAnswers` row with `k: "c"`
  (`isTalk`): every count, list and rule that read answers and replies must keep them apart (`an` = answers or
  replies, `cm` = comments; `mineOf` finds his answer, never a comment). A question's talk is for those who answered
  (`talkOpen`): the feed's faces (`lp`) too, else the faces say who answered. `us.thread` sends no message the student
  may not see and no `sid` unless the name shows. `tests/usTalk.test.ts` checks a classmate's JSON before his answer.
- **XP from Us lives in the race row** (`raceRows.us`, `lib/usXp.ts`): never a progress row, so `xpItems` / `levelDays`
  never see it (the flame stays Levels), and `RACE_V` didn't change. A new thing that gives XP on Us calls `giveXp` with
  its own `ref` and kind, and whatever removes it calls `takeXp` (a teacher's removal: before `dropAnswer` /
  `dropMoment`, which never take XP: `lib/usTalk.ts` must not import the race rows, `lib/ladder.ts` → `lib/backend.ts`
  → `lib/usTalk.ts` would close a cycle). Anything showing a student's XP adds `usNow` (family.me, a check's reveal,
  `mateOf`), and the grade cup takes `RaceRow.u` / `up` out.
- **The one-tap words are in two places** (`QUICK` in `convex/lib/us.ts`, for "no XP", and its copy in `usPost.tsx`):
  `tests/usTalk.test.ts` reads the phone's file and fails if they differ. So are the reactions (`RX` in
  `convex/lib/chat.ts` and `talk.tsx`: `tests/chat.test.ts`).
- **The chats are their own file** (8 Nov 2026, groups and private chats): `src/family/chatParts.ts` (`chat.tsx`, its
  style `chatStyle.ts`), budget `FAMILY_CHAT_KB` 20 = what only it reaches; what it shares with Us (`talk.tsx`: the
  bubble, reactions, tags, the write bar, the photo picker) is counted in Us's file. Import the chats only through
  `later.ts` `loadChat` / `useChatParts` (the teachers' Us: `K.useChatParts`, handed over by `main.tsx`). The teachers'
  Us file is near its 8 KB (7.8): put new teacher screens in Us's or the chats' file, not in `staff.tsx`. Budgets after
  it (scratch build): first load 63.7 of 66, later parts 35.7 of 42, Us 23.7 of 28, the chats 7.9 of 20.
- **Chats: who may write is decided on the server, on every call** (`access` in `convex/chat.ts`, `mayMessage` in
  `convex/lib/chat.ts`): opening, sending, reacting, reporting, a new private chat. A student's boy / girl can change, so
  never store "may message" anywhere: compute it. The race rows keep `sx` for the Members list (`RACE_IDENTITY`
  copies `sex`), the student row is the truth. A teacher's call is `chat:t*` (the family app's `net.ts` maps the
  students' names; add a new one to `STAFF` / `STAFF_CHANGES`, or the teachers' Us refuses it).
- **A line's reply has two ids**: `re` = the chain's first (the one-level tree, counts, who is told as before) and `rt` =
  the message actually answered (the quote). Old replies have only `re`. In chats there is one: `re` = the message
  answered (no tree).
- **The blur sends no answer**: `veilOf` gives colour squares (`z`, made on the phone at upload: `seedOf` in
  `talk.tsx`), an approximate line count and the photo count, nothing else. Never add a field to `UsVeil` that comes
  from the answer's words, name, id or files; `tests/chat.test.ts` reads a classmate's JSON before his answer.
- **Chats poll, they don't subscribe** (the family app has no websocket client): an open chat asks every 4 s with
  `since` (only new messages) and `rv` (bumped by `chat.react`, `report`, `tkeep`, `tdrop`, `block`, `roomAfter`: then
  the whole page). Anything that changes an old message must bump the room's `rv`, or open phones never see it.
- **Kept 30 days**: `chat.sweep` (from `us.daily`) deletes old messages with their photos (`usFiles` marks too) and
  reactions; `wipeStudent` calls `wipeChats`. A new table holding a student's chat things must be cleaned in both.
- **Run-throughs on a machine without the class app's fonts**: seven class run-throughs that measure the top bar at
  320 px or a strip's height fail there (they did on the commit before the chats too); CI is the judge. A stand-in for
  the web push library must return real-looking keys (a 65-byte P-256 public key, base64url), or the photos
  run-through's "alerts on" waits forever (the phone decodes the key before it subscribes).
- **Two voice recorders, on purpose** (12 Nov 2026, two chats the same night): `src/voiceNote.tsx` (the class app's home
  lane, 60 s) and `src/family/help.tsx` `VoiceRec` (an explanation's thread in the Us frame, 2 minutes). The Us frame is
  the family app's page (`/f/?staff`): it can't import the teachers' store, so it has its own. Recording there needs
  three things at once: `Permissions-Policy: microphone=(self)` on `/f/` (vercel.json; students' screens simply have no
  recorder and the server refuses a student's voice note), `allow="microphone"` on the iframe (`usFrame.tsx`), and
  `media-src https://*.convex.cloud` to play it. `tests/hosting.test.ts` holds the headers.
- **An explanation's thread is a chat room** (`usRooms` `k: "h"`): anything that lists or counts rooms by kind must say
  what it does with "h" (`lineOf` maps it out of the chat lists; `access` has its own branch; `wipeChats` drops a removed student's
  messages in it by `sid` and calls `wipeHelp` for his rows). Its top card (`head.help`) comes only on a full read: the phone keeps it between the
  short reads, and a change that must show (Explained, a name hidden, a new student) bumps the room's `rv`
  (`bumpRoom`). A run-through reaches a thread's teacher side through `C.frameLocator("iframe.us-frame")`; the fake
  microphone is on for every family run-through (`--use-fake-device-for-media-stream`).
