"""The past-paper-workbook skill, moved to the skill-book flow (24 Nov 2026, the founder: "I don't want direct PDF from
you ... you just say done ... I can download that directly from the skill page"; and his warning the same night: "when
you update this skill ... don't remove the context that actually needed ... the experience or information that needed
for the quality output"). Run on the skill's own SKILL.md:

    python3 -I scripts/skill-updates/past-paper-workbook-skill-book.py <SKILL.md now> <SKILL.md new>

- Every change is an exact piece of text, found exactly once, or nothing is written (the skill was changed elsewhere:
  read the message, and change this script, never the skill by hand).
- Only what the app now does goes: the PDF and zip delivered for an upload, the cover drawing, levels fitted by moves
  (fit.py), the term book, the answer key alone (old §4b), the marks upgrade. Every rule of the questions, the answer
  space, the marks, the figures, the keys, the design and the token budget stays word for word.
- Added: the Claude link's side (step 0b), the skills (step 5: the skill-tags skill's rules, word for word where they
  apply), the save (step 6), what to tell him (step 7), the new-edition rule (Edit).
- The engine's files stay byte for byte, but book.py's one override (the engine's own levels may be any size): the
  script proves it.
A claude.ai chat runs this on its own copy (/mnt/skills/…/past-paper-workbook/SKILL.md) and gives the founder the result
on the save card (his rule: skills only on the save card). The script holds no engine code and none of his books."""
import re
import sys

src_path, dst_path = sys.argv[1], sys.argv[2]
old = open(src_path, encoding="utf-8").read()
s = old
problems = []


def rep(a, b):
    """One exact piece of text, found once, replaced."""
    global s
    n = s.count(a)
    if n != 1:
        problems.append(f"found {n} times (want 1): {a[:90]!r}")
        return
    s = s.replace(a, b)


def span(start, end, b):
    """From `start` (found once) to the end of the first `end` after it, replaced."""
    global s
    n = s.count(start)
    if n != 1:
        problems.append(f"start found {n} times (want 1): {start[:90]!r}")
        return
    i = s.index(start)
    j = s.find(end, i)
    if j < 0:
        problems.append(f"end not found after {start[:60]!r}: {end[:60]!r}")
        return
    s = s[:i] + b + s[j + len(end):]


# ---------------------------------------------------------------- the name, the title, what it is
span('description: "Build an ARISTORA Tamil-medium past-paper workbook', 'without rebuilding it."',
     'description: "Build an ARISTORA Tamil-medium past-paper unit straight into the ARISTORA app as its skill book: one '
     'unit per chat from its scanned compilation PDF — every Part I/II question retyped with its answer space and marks, '
     'every figure redrawn, every answer computed with its kind for the phone (load answer-kinds with it), every question '
     'given its skills (the skill-tags rules) — saved whole through the Claude link. The founder downloads the PDF from '
     'the app (Settings → Books → T): no PDF and no zip to upload. Also a new edition of a unit from its source zip."')

rep("# Past-paper workbook — ARISTORA unit books and term books\n",
    "# Past-paper workbook — ARISTORA skill books, straight into the app\n")

span("For each unit: **every past term-test question** of its scanned compilation PDF", "27 October\n2026).\n",
     """**Since 24 November 2026 a unit goes straight into the app as its skill book** (the founder: "I don't want direct PDF
from you ... you just say done ... I can download that directly from the skill page"). One chat builds the unit, gives
every answer its kind (answer-kinds), gives every question its skills (§4 step 5: the skill-tags rules) and saves the
whole unit through the Claude link (§4 step 6). The app makes the book from it: the questions in skill order (Level n =
skill n; a big skill cut into strips of about 20 marks), numbered, with its cover, contents, marks sheet and pages, the
PDF and the printing (Settings → Books → T: Preview, PDF, Share to the shop). **No PDF and no zip to upload go to the
founder**; the source zip is his backup only.

For each unit: **every past term-test question** of its scanned compilation PDF, retyped in the ARISTORA design (the
approved look of the Grade 8 U01 book, pages 16–32): dotted frame, footer, side tabs, watermark, part bands, Part I
items with sized answer space under each question (no answer boxes: the exam papers have none), Part II cards with
sized working space under each part, every exam figure redrawn, and the **paper-class marking**: every Part II part's
marks (a Part I question is 2), from which the app makes the levels' strips and the unit's marks sheet (total and
percentage). **No ladder, no teacher questions, no answers printed** — the answers go to the teachers and the phones
instead: every build writes `answer-key.json`, the ARISTORA app's answer key with every answer's kind (§1), saved into
the app with the unit. Units are built one per chat (`uNN.py`); the engine's own unit book (`book.py`) is this chat's
check of the questions' HTML — the app prints that same HTML with the engine's CSS and fonts (22–24 November 2026) —
and is never delivered. This is the workbook; the theory book (the ladder) is the `grade-unit-book` skill — never mix
them, never edit that skill. Build directly: the engine is proven (a 10-unit 162-page volume, both paper structures,
the marking pilot G8 U04 v3, the first 18–22 unit G8 U05 v2, unit and term books with the model cover G8 U04, 27
October 2026; 24 units of Grades 6–10 in the app by 24 November 2026).
""")

span("**Which skill when.** A **new unit** (its compilation PDF): this skill only", "this skill, §4b — the key only, nothing rebuilt.\n",
     """**Which skill when.** A **new unit** (its compilation PDF): this skill, with **answer-kinds** loaded beside it (every
answer's kind); it tags the unit too (§4 step 5), so no skill-tags chat follows. **A unit already in the app** (24
units of Grades 6–10 by 24 November 2026, every one with its key, kinds and skills): a wrong key, kind or word in one
question = **aristora-digitize** (job A, no rebuild); a wrong skill on a question = **skill-tags** (its §7, a fix: the
lessons follow it; a printed book keeps its levels); adding, removing or moving questions = a new edition (§4 **Edit**,
only on its rules). `workbook-marks-upgrade` and the answer key alone for an old zip (old §4b) have no work left: every
unit in the app has its marks and its key.
""")

# ---------------------------------------------------------------- §1 rules: what the app does now
rep("`answer-key.json`, numbered as printed, packed in the source zip, never printed in the book.",
    "`answer-key.json`, numbered as printed (the app renumbers them with the book), saved into the app with the unit\n"
    "  (§4 step 6), never printed in the book.")
rep("- **Marks in levels of about 20** (the paper class,", "- **Marks** (the paper class,")
rep("Part I: every question 2 marks; levels of 10 questions — the last level takes the rest, so it has 5–14\n"
    "  (61 → 10 × 5 + 11 = / 22). Part II:", "Part I: every question 2 marks. Part II:")
span("Part II levels are whole questions making 18–22: a level closes at 20", "re-judgments.\n",
     """**The levels are the app's** (24 November 2026): a level a skill (Level n = skill n), a skill over 25
  marks cut into strips of about 20 by the workbook's own rule (a strip closes at 20, or at 18–19 when the next
  question would pass 20; never a question cut; a last strip under 10 marks joins the one before). So never move a
  question or re-judge a mark to make a level: give every part its honest marks. The engine's own levels in book.html
  are only its check: `book.py` lets them be any size.
""")
span("- **Order = the user's easy → hard order** (built by difficulty, not by year); the levels follow it", "gave 22 / 20).\n",
     """- **Order = the user's easy → hard order** (built by difficulty, not by year), inside each part. The app keeps it:
  inside each skill's group the book's own order is the easy → hard order (moved by the students' marks once five of
  them did a question), Part I before Part II. No `fit.py` and no moves for levels any more (the levels are the app's).
""")
span("- **Numbers run on through the unit**", "everything else in Tamil.\n",
     """- **Numbers**: the engine numbers the unit's questions 1 … N, Part II running on from Part I (U04: Part I 1–61, Part
  II 62–79): the chat's working numbers (`skills.json` uses them). The app renumbers the book by skill when it saves it
  (1, 2, 3 … through the skill book) and keeps each engine number inside. "Level n" is in English, everything else in
  Tamil.
""")
span("- **Two books from the same files**", 'never "page 12".\n',
     """- **The book is the app's** (24 November 2026): the founder downloads it from Settings → Books → T (the whole unit or
  one level; Share sends it to the printing shop with the copies and the price). `python3 book.py uNN` still builds the
  engine's unit book: this chat's check of the questions' HTML, never delivered. No term book from here (the app prints
  a unit at a time; a term book would be an app change: ask him).
""")
span("- **Every unit has its own cover illustration**", "unless the user says not now.\n",
     """- **No cover illustration** (24 November 2026): the app's skill book makes its own cover (the unit's name, its
  skills, its levels). The build prints `art: STAND-IN`: right now. (`cover_model.py`, `cover.py` and §6's cover notes
  stay for the day he asks for pictures again.)
""")

# ---------------------------------------------------------------- §2 inputs
span("- **Unit chat**: the unit's compilation PDF and the grade", "the next edit here draws the illustration).\n",
     """- **Unit chat**: the unit's compilation PDF, the grade (unit number and name come from the page title; the Tamil
  name and the term from the term plan) and the **Claude link's code** ("ARISTORA-LINK name.key": Settings → Books →
  Claude link → Turn on → Copy the code; ask for it in your first message when it is missing). **Edit** (a new
  edition): the unit's source zip (the backup a build chat attached), what to change, and the code.
""")

# ---------------------------------------------------------------- §4 the unit chat
rep("**1. Read** — page images in halves at full resolution;",
    """**0b. The app's side** (once a chat; the same as the skill-tags and aristora-digitize skills):
1. `add_repo` (owner `ilham972`, repo `Aristora-system`, access `push`), then run the clone command it gives, into
   `/home/claude/aristora-system`. No `npm install`.
2. Keep his code in a file outside the repo, never in a reply, a file you send, or the repo:
   `mkdir -p ~/work/app && printf '%s\\n' 'ARISTORA-LINK name.key' > ~/work/app/link-code && chmod 600 ~/work/app/link-code`
3. Start every command that uses the app's tools with this line (the shell forgets between calls):
   ```bash
   cd /home/claude/aristora-system && export ARISTORA_LINK_FILE=~/work/app/link-code && A=~/work/app && W="node /opt/npm-tools/node_modules/tsx/dist/cli.mjs scripts/workbook.ts"
   ```
   (no tsx there: `W="npx tsx scripts/workbook.ts"`). A command that talks to the app takes 1–2 minutes (a GitHub job
   carries it): give it a 10-minute timeout, never two at once, never poll GitHub.
4. `$W known $A G9-U05` (the unit's key): whether it has a workbook in the app already (then step 6's `again` rule),
   and `$A/known.txt`, the skills other units of this grade and earlier have. Do it now: it decides how you name skills.

**1. Read** — page images in halves at full resolution;""")

rep("""by the marking rules in §1, whole questions making levels of 18–22 (`python3 digest.py uNN` prints the
  running totals and where each level ends; a level passing 22 → write `../levers.py` and run once
  `python3 fit.py uNN ../levers.py`);""",
    """by the marking rules in §1 (`python3 digest.py uNN` prints every question with its marks: read it once to see
  that the same kind of part got the same marks everywhere; its LEVELS block is the old books': nothing to do there);""")

span("**3b. Cover** (§6): write `uNN_cover.py`", "at most one fix round.\n",
     "**3b. No cover** (24 November 2026): the app makes the skill book's cover. No `uNN_cover.py`; the build's\n"
     "`art: STAND-IN` is right.\n")

rep("→ `art: uNN_cover.py`, overflow [], portable ok, gaps [],\nmarks [], cover [], the levels line as planned,",
    "→ `art: STAND-IN`, overflow [], portable ok, gaps [],\nmarks [], cover [], the levels line (the engine's own: any size),")
rep("contact sheet once (55 dpi: the back of the cover lists the\nlevels, the side tab steps down from Part I to Part II);",
    "contact sheet once (55 dpi: the questions' HTML, as the app will print it);")

span("**5. Deliver** (versioned names, `VER` in book.py):", "at most one question.\n",
     """Then `python3 kinds.py verify` → `every slot matches its key` (answer-kinds).

**5. Skills** (24 November 2026; the skill-tags skill's rules, word for word where they apply: that skill stays for
fixes). ARISTORA teaches the skill, not the question: when students get questions wrong, the app groups them by skill
and a teacher gives ONE short lesson for that skill, and the printed book's levels are its skills (Level n = skill n).
Bad skills = useless lessons and a badly cut book, so think like a maths teacher.
1. `$W lay $A G9-U05 ~/work/U`: the engine's book.html and answer-key.json read with the phone's own reader (a book the
   app would refuse is refused here, in the app's words), laid out in `$A/G9-U05/` with `sheet.txt` (every question in
   a line or two, in the engine's numbers: `Q<number> [marks] the question => the key's answer`; under a long question
   each part `"label" [marks] words => answer`; `[fig]` a figure, `[ ]` a printed blank). You typed every question:
   read `sheet.txt` once only when they are not fresh (a long chat). Grep `$A/known.txt` for your unit's methods
   (`grep -i "fraction" $A/known.txt`): the skills other units already have.
2. **A skill = ONE method that a teacher can explain in about six minutes with one example. After that lesson a
   student can do every question tagged with it.**
   - Name it by what the student **does**: a verb and its object. Good: "Add two negative numbers" · "Find the nth
     term of a pattern that grows by the same number" · "Open a bracket with a minus sign in front". Bad: "Directed
     numbers" (a topic) · "Word problems" · "Hard questions" · "Mixed" · "Other".
   - Two tests for every skill: (1) **One lesson:** would one short lesson put right every question in it? No: split
     it. (2) **Same wall:** would a student who fails one of them fail the others for the same reason? No: split it.
     Yes for two skills: join them.
   - **Never split a skill by + and − (or × and ÷) alone.** The founder joined "add two directed numbers" and
     "subtract two directed numbers" into one skill (13 Nov): one lesson teaches both, and a student who fails one
     fails the other. Two operations are two skills only when the second needs a new idea (a sign rule, another
     formula).
   - The same method with other numbers, or inside a story = the same skill. A new step, a new idea, another formula
     = another skill.
   - Most units have **6 to 14** skills. A skill should have 3 or more questions. A skill with one question: join it
     to the nearest skill, unless nothing else in the unit needs that method.
   - **Number them in the order a teacher would teach them** (S1 first): the book prints them in that order, and a
     question that needs several of this unit's skills is printed in the level of its **last** one (S3 + S4 in Level
     4), after that skill's own questions. A question that needs only other units' skills goes at the end of Level 1.
3. Which skills a question gets: one, two or three. These are past-paper questions: one question often needs more than
   one method.
   - **First = the main skill:** the step that decides the question, where a student who gets it wrong most probably
     breaks. An easy step and a hard step: the hard one first.
   - **Then every other skill of your list that the key's working really uses**, three in all at most. Examples with
     unit 4's numbers (S2 add or subtract two directed numbers, S4 three or more numbers, S5 the sign rule of × and ÷,
     S9 a power of a negative number): a power, then a sum: `["S9", "S2"]`. Three numbers with a product inside:
     `["S4", "S5"]`.
   - Never list a skill the working doesn't show (not "every question needs adding"). Most questions carry one or two
     skills; three is rare.
   - Why: when a student is wrong, the app looks at his other answers, drops the skills he has already shown, and
     gives him only the lesson he lacks. A missing skill in the list = a wrong lesson.
   - A long question: tag the **whole question** only when all its parts carry the same skills. Otherwise tag it
     **part by part** (most long past-paper questions), with the part labels exactly as the sheet prints them in quotes.
   - A question that needs a skill of **another unit** (in known.txt): give it that id in full ("G8-U04-S2"). Never
     make a second skill for the same method.
   - `eg` = the skill's plainest question (short, typical, no trick): the teacher teaches the lesson with it. It is
     that question's number. The question must carry the skill **first**; best, one that needs this skill alone.
   - Names: English, 60 letters at most. Tamil: the same meaning in plain school Tamil, with the words the questions
     themselves use.
   - How to work: list the methods you see; fix the list of skills; go down the questions from the first to the last
     and give each its skills; write the file in one go.
4. Write `$A/G9-U05/skills.json` (ids "S1", "S2" … in teaching order; another unit's skill in full; every question
   number once, in the engine's numbers):
   ```json
   { "skills": [ { "id": "S1", "en": "Add two negative numbers", "ta": "இரு மறை எண்களைக் கூட்டல்", "eg": 4 } ],
     "tags": { "1": "S1", "3": ["S2", "S1"], "53": { "i": "S1", "ii": ["S2", "S1"] }, "60": "G8-U04-S2" } }
   ```
   A value is a skill (`"S1"`), a list with the main one first (`["S2", "S1"]`), or `{ "part label": a skill or a list }`
   with **every** part of that question.
5. `$W check $A G9-U05`: first the skill-tags check (every mistake at once, a table of each skill, LOOK AGAIN lines a
   teacher would ask), then the app's own check of the whole unit (the same function the app runs), then **THE SKILL
   BOOK**: a line a level, as the T page will show it and the PDF print it. Fix every WRONG line. Think about every LOOK
   AGAIN line — above all "no level of its own" (every question that needs that skill also needs a later one: if it
   is only a step of the later skill, join them; else keep it, and its level number is skipped in print), "one
   question", and a level over 80 marks — then change skills.json or keep it, and check again until READY.

**6. Into the app**: `$W ship $A G9-U05` (1–2 minutes): the whole unit in one save, all or nothing, then read back
and compared; it must end with `IN THE APP, read back the same`. The unit's workbook is its skill book at once (no "Use
as the workbook" for it: nothing of a student's to clear). Its answer lists the levels and what the phone marks.
- "has a workbook in the app already": its book may be printed. Ask the founder (AskUserQuestion: "G9-U05 is in the
  app already. Is its book printed, or given to students?"); only on "no", `$W ship $A G9-U05 again`. The app refuses
  any unit students used, `again` or not: then only fixes (aristora-digitize), and a new edition waits for next year.
- "That request was already taken": another chat saved at the same moment: ship again once. "The app took nothing":
  the link is off or its 7 days are over: ask him for a new code. The same error twice: stop and show him the last
  lines.
- Attach the source zip (`book.py` printed its name: `out/GN_UNN_Workbook_source_vK.zip`) as his backup, one line: he
  keeps it and never uploads it; a new edition starts from it.

**7. Tell the founder** (≤ two screens, plain words, numbered):
1. "Done: G9-U05 is in the app as its skill book: N questions, M skills, L levels (S strips)."
2. The skills: id · Tamil name · English name · how many questions.
3. "Check it: Settings → Books → Grade 9 → G9-U05 → T (green) → the eye (Preview). Then PDF, or Share to the shop."
4. What the phone marks by itself, the photo questions (drawings only), merges, dropped sub-parts, typo fixes,
   anything doubtful; at most one question.
5. When he is done for the day: "Settings → Books → Claude link → Turn off."
""")

span("**Edit**: the block below (the zip's files with the engine refreshed from this skill", "else a new drawing).\n",
     """**Edit** (a new edition of a unit in the app; the founder's rule, 24 November 2026: **one edition a year**). A wrong
key, kind or word in one question is not an edition: **aristora-digitize** fixes it in the app, nothing rebuilt.
Adding, removing or moving questions changes the printed numbers, so only while nobody holds its printed book and no
student has used it (the app refuses a used unit, whatever you send). Then: the block below (the zip's files with the
engine refreshed from this skill, the zip's grade, term, version and plan kept), change only the lines asked (find
them with grep), bump `VER`, build (step 4), `lay` again (it replaces the unit's folder; keep `skills.json`: give the
new questions their skills and check every tag, the engine's numbers moved), `check`, ask the founder whether its book
is printed, and only on "no" `ship … again`. A crop (PNG) of each changed spot in the reply.
""")
span("Edit the source `uNN.py`, never the delivered HTML", "with the `workbook-marks-upgrade` skill (source zip only).\n",
     "Edit the source `uNN.py`, never the generated HTML (the next build would overwrite a hand edit, and page numbers,\n"
     "contents and footers are recomputed only from the source).\n")
span("**4b. Answer key only** (an old unit's source zip", "delivered as `…_key.zip`.\n",
     "(Old §4b, the answer key alone for an old zip, is gone: every unit in the app has its key and its kinds, 24 November\n"
     "2026.)\n")

# ---------------------------------------------------------------- §5 the term book, §6 design, §8 tokens, §9 files
span("## 5. Term chat (the term book)\n", "\n## 6. Design",
     """## 5. Term book

Not from here any more (24 November 2026): the app prints a unit's skill book (Settings → Books → T: the whole unit or
one level). If the founder asks for a term book, it is an app change (the aristora-system skill).

## 6. Design""")
rep("## 6. Design (built into the engine — readable, never cramped, but every mm of space earned by an answer)\n",
    "## 6. Design (built into the engine — readable, never cramped, but every mm of space earned by an answer)\n"
    "The engine's pages below are this chat's check; the founder's PDF is the app's: the same HTML and CSS, the app's own\n"
    "cover, contents, strips and pages (the T page).\n")
span("## 8. Token budget\n", "read once; no build, no scans.\n",
     """## 8. Token budget
Two image reads per compilation page; questions only when needed; `uNN.py` in 1–3 writes; one build with QA; every
contact sheet once; zooms only on redrawn figures. Marking: one `digest.py` printout, not the unit file again. No
cover, no level fitting. Skills: from what you typed (`sheet.txt` only when the questions aren't fresh), `skills.json`
in one write, `check` until READY, one `ship`. The app's commands: `known` once, `ship` once (1–2 minutes each).
""")
rep("without a build: write, check against book.html, review, pack — §4b).\n",
    "without a build: write, check against book.html, review, pack — §4b).\n\n"
    "The app's side is in the repo, not here: `scripts/workbook.ts` (`known`, `lay`, `check`, `ship`) and\n"
    "`scripts/skills.ts`, cloned in step 0b; the rules they share with the app are `convex/lib/wholeUnit.ts`.\n"
    "`cover_model.py`, `cover.py`, `fit.py` and `answer_key.py` wait unused (no cover, levels by skill, every key in the app).\n")

# ---------------------------------------------------------------- the engine: book.py's one override
rep("""                             pack_source, page_fill, phantom_gaps, portable_check)

GRADE, VOL, VER, YEARS = """, """                             pack_source, page_fill, phantom_gaps, portable_check)
import collection_book

# The levels are the app's (24 November 2026: a level a skill, a big skill cut into strips of about 20 marks): the
# engine's own levels in book.html are only its check, so they may be any size (no fit.py, no moves for levels).
collection_book.LEVEL_MAX = 999

GRADE, VOL, VER, YEARS = """)

rep('''              f"art: STAND-IN — no {mods[0]}_cover.py yet: draw the unit's illustration (past-paper-workbook §6)")''',
    '''              "art: STAND-IN (right: the app makes the skill book's cover; nothing to draw)")''')

if problems:
    print("NOT WRITTEN: the skill isn't the one this script was made for:\n  " + "\n  ".join(problems))
    sys.exit(1)


# ---------------------------------------------------------------- proof: the engine files, byte for byte
def files(text):
    return {m.group(1): m.group(2) for m in re.finditer(r"### (\S+\.py)[^\n]*\n```python\n(.*?)```", text, re.S)}


a, b = files(old), files(s)
assert set(a) == set(b), f"the engine's files changed: {sorted(set(a) ^ set(b))}"
changed = [n for n in a if a[n] != b[n]]
assert changed == ["book.py"], f"engine files changed: {changed}"
extra = b["book.py"].replace(a["book.py"].split("\nGRADE, VOL")[0], "", 1)
assert b["book.py"].count("collection_book.LEVEL_MAX = 999") == 1 and len(b["book.py"]) - len(a["book.py"]) < 400
open(dst_path, "w", encoding="utf-8").write(s)
print(f"written {dst_path}: {len(old)} → {len(s)} letters; the engine's {len(a)} files the same byte for byte, "
      f"but book.py's override ({len(b['book.py']) - len(a['book.py'])} letters)")
