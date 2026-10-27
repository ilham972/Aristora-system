# Aristora class board

One live class register for three teachers, each on their own phone. Every tab shows all students, one row each:
the circles that matter right now (big, tap them) and the whole book as a thin colour strip (every question lined up
across the class). Tap the strip or the name to open a student's whole book.

- **Correction** walks the hall and marks answers by tapping circles: once ✓ right, twice ✗ wrong, three times ↻ slip.
  Taps save when you stop tapping. He signs students in and sends called students to the rooms.
- **Theory** taps names to pick who to call (or a "Next to teach" chip to pick a whole section group), then marks
  theory by tapping ◎ circles or the section letter.
- **Evaluation** taps names to call, and taps red circles to mark them explained. When Theory is busy, he can teach theory too.

## Alerts

- **Correction's phone** chimes and reads the names out: "Ahamed and Nila, go to Theory." It repeats every 30 seconds
  until he taps Sent or × (not now). Calls show as one slim strip per room, stuck under the header.
- **Evaluation** hears "Theory wants Kumar now." Theory and Evaluation hear a knock when a student runs out of work.
- A phone needs one tap on the page before it may make sound (the amber banner). After that every tap re-arms it.
- The page keeps the screen on (screen wake lock; on iPhones without it, a tiny silent video). A locked phone can't
  ring: a web page can't wake a phone. Settings → Alerts has a Test button and the phone settings to change.

Live at https://system.aristora.org. The pilot unit is Grade 11 Quadratic equations (questions 1–61, from the book's contents page).

## The rules (in `convex/lib/status.ts`)

- A section's ladder opens when all its teacher questions are taught (or skipped).
- Amber at 2 ladder questions left, red at 0 ("out of work").
- Wrong answers wait about 10 minutes before evaluation, unless the student has nothing else to do.
- 3 wrong answers waiting in one section stop that section; an answer wrong twice is "stuck".
- Past papers open once every ladder question has been tried; the final challenge after every past paper.
- Theory comes first: Theory can take a student straight from the evaluation room. Whatever wasn't explained stays waiting.
- Idle minutes (in the hall, nothing to do) are counted for the end-of-session report.

## How it deploys

Every push to `main` deploys on Vercel. `vercel.json` runs
`scripts/vercel-build.sh`, which checks the Convex key, pushes the Convex backend and builds the phone app.
The `CONVEX_DEPLOY_KEY` lives only in Vercel's environment variables. **Never commit keys or passwords: this repo is public.**

## There is no login

Anyone with the link, or with the database address in this code, can read and change the class data.
Use first name and initial only. Every change is listed in Settings → History.

## Code

- `convex/`: database schema, functions, and the shared rules engine (`lib/`)
- `src/`: the phone app (Preact)
- `tests/`: rules and backend tests (`npm test`); a three-phone run-through in `tests/e2e`
  (`npm run build` with `CONVEX_URL` set, then `npx vitest run -c vitest.e2e.config.ts`)
