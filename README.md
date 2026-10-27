# Aristora class board

One live board for three teachers, each on their own phone:

- **Correction** walks the hall, marks every ladder answer (✓ right, ✗ wrong, ↻ careless slip), taps students in and out, and sends called students to the rooms.
- **Theory** sees who needs which section next, grouped by section and sorted by urgency. Then he calls a group.
- **Evaluation** sees the wrong answers waiting to be explained. When Theory is busy, he can also teach theory.

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
