"""The aristora-system skill (the co-founder's brief), with the night of 24 Nov 2026 added: a new unit goes straight into
the app as its skill book (one chat builds, digitizes and tags it; no PDF, no zip), his three picks, and his rule "one
edition a year". Only additions and the "Last updated" line: nothing of the brief is taken out. Run on its SKILL.md:

    python3 -I scripts/skill-updates/aristora-system-2026-11-24.py <SKILL.md now> <SKILL.md new>

Each addition is put at an exact place found once, or nothing is written. A claude.ai chat runs it on its own copy and
gives the founder the result on the save card (his rule)."""
import sys

src_path, dst_path = sys.argv[1], sys.argv[2]
old = open(src_path, encoding="utf-8").read()
s = old
problems = []


def before(anchor, text):
    """`text` put right before `anchor` (found once)."""
    global s
    n = s.count(anchor)
    if n != 1:
        problems.append(f"found {n} times (want 1): {anchor[:80]!r}")
        return
    s = s.replace(anchor, text + anchor)


def after(anchor, text):
    """`text` put right after `anchor` (found once)."""
    global s
    n = s.count(anchor)
    if n != 1:
        problems.append(f"found {n} times (want 1): {anchor[:80]!r}")
        return
    s = s.replace(anchor, anchor + text)


FIRST = "Last updated 2026-11-24, at commit `8dfaf93` ("
n = s.count(FIRST)
if n != 1:
    problems.append(f"found {n} times (want 1): {FIRST!r}")
else:
    # The brief's own habit: one "Last updated" line; the commit before it goes behind "Before it".
    s = s.replace(FIRST, "Last updated 2026-11-25, at commit `bfe4f2d` (each unit's own cover drawing on its skill book's page 1, beside the\n"
                  "term's units, as the workbook skill draws it). Before it: `6314eb2` (a new unit goes straight into the app as its\n"
                  "skill book: one chat builds, digitizes and tags it and saves it whole through the Claude link, `tell` \"workbook\"; no\n"
                  "PDF, no zip; his rule \"one edition a year\"; the past-paper-workbook skill moved to that flow by an exact patch,\n"
                  "scripts/skill-updates/). Before it: `8dfaf93` (")

before("- **The students' rules are his psychology** (5 Nov):",
       "- **One edition a year** (24 Nov 2026, his pick): a printed book's numbers never change while students hold it. A\n"
       "  key, a kind, a word: fixed any time, everywhere at once (and the next download has it). Adding, removing or moving\n"
       "  questions = the unit's next edition (before it is printed, or next year); a bad question meanwhile = 🎁 Free\n"
       "  marks. The app refuses a whole-unit save over a unit students used.\n"
       "- **Claude makes the questions, the app makes the book** (24 Nov 2026, his words: \"I don't want direct PDF from\n"
       "  you ... you just say done ... I can download that directly from the skill page\"): a unit chat's last line is\n"
       "  \"Done\"; he opens Settings → Books → T → Preview → PDF or Share. **The cover drawing stays the skill's** (25 Nov\n"
       "  2026, his words: \"the past paper workbook skill can build beautiful cover page. So we have to use those thing\"):\n"
       "  every unit chat draws it; the app prints it on page 1 beside the term's units.\n")

before("**Not built yet:** the rest of the Master redesign (section 8);",
       "**Built 24 Nov (`6314eb2`): a whole unit straight into the app as its skill book.** His voice note: \"I don't want\n"
       "direct PDF from you ... you just say done\"; his picks: one chat per unit saves it straight in (\"be careful with the\n"
       "skill ... don't sacrifice quality\"), switch all 23 tagged units now (no safety copy of their old marks), one edition\n"
       "a year. Built: `convex/lib/wholeUnit.ts` `makeWholeUnit` (pure: the engine's book, key with kinds, every printed\n"
       "question, style, skills and tags, checked like an upload and a skills save, then made the skill book with the\n"
       "switch's own `skillLevels` + `skillWorkbook`); `link.ts` `tell` \"workbook\" (`saveWhole`: one save, all or nothing;\n"
       "the unit's workbook is its skill book at once, so no \"Use as the workbook\" for a new unit; refused over a unit\n"
       "students used, `workIn`; over any workbook without `again`; `skillsKept` shared with the skills save); the chat's\n"
       "tool `scripts/workbook.ts` (`known`, `lay` = the engine's book.html read by the phone's own reader, now\n"
       "`src/workbookRead.ts`, `check` = the skill-tags check + the app's check + the skill book a line a level, `ship\n"
       "[again]`). Checked on three real units (G8-U04, G9-U27, G10-U31): the book equals the switch's; the biggest save\n"
       "452 KB. The state that night: 24 workbooks in the app (G6 2, G7 7, G8 Term 1 10, G9 3, G10 2), 23 tagged (not\n"
       "G7-U27), none switched yet; the switch's own code passed on all 23 (284 levels → 339 strips; 33 strips of one\n"
       "question; empty levels in G7-U12 S3, S8 and G10-U31 S11). Still to build: 148 of 172 units, 40 of them Term 1.\n\n"
       "**Built 25 Nov (`bfe4f2d`): each unit's cover drawing.** His words: \"each unit need to have cover page when I\n"
       "download ... the past paper workbook skill can build beautiful cover page\"; his pick: the drawing beside the term's\n"
       "units. Built: `convex/lib/cover.ts` (the engine's own figure, 127 × 163 mm at most, checked), table `bookCovers`\n"
       "(only the T page and its PDF read it), the link's `tell` \"cover\" (alone, any time: nothing else moves) and the\n"
       "whole save's `cover`; page 1 = the engine's unit cover (`src/skillPrint.ts` `coverHtml`, `termIndex` ported from the\n"
       "engine, `fitTermIndex`); no drawing = the cover before (its levels listed). The tool: `lay` takes it (only from\n"
       "uNN_cover.py), `ship` sends it, `cover <dir> <KEY> <build>`. Checked on G8-U04's real book with the model harbour:\n"
       "the same cover as the skill's. On 25 Nov no unit in the app had its drawing yet.\n\n")

after("## 8. Open questions and next ideas (ask him; don't decide alone)\n",
      "\n**The skill-book flow** (24 Nov 2026, `6314eb2`): (1) the pilot: the first new unit built by the patched\n"
      "past-paper-workbook skill, `ship`ped, and his Preview on the T page; (2) then the lighter skill (stage 2): the engine's\n"
      "code out of SKILL.md (the model never reads it: about 35,000 tokens a unit chat), every rule kept, proven by the same\n"
      "unit built both ways giving the same book.html; (3) **New edition** (before next year's printing): a skill book\n"
      "rebuilt from its tags after the year (`skillWorkbook` over a skill workbook, `was` composed), its marks archived; (4)\n"
      "the source zip kept in the app (a table like `govParts`), so an edition needs no backup zip on his phone; (5)\n"
      "one-question levels (33 of 339 strips) and empty skill levels: does he want small skills joined into one strip?;\n"
      "(6) Grade 11: O/L topic tutes or unit books?; term books from the app?; \"everyone up a grade\" in one tap for\n"
      "January; (7) the 24 units in the app need their cover drawings: from their source zips (uNN_cover.py, units drawn\n"
      "after 27 Oct) or new ones, a chat with `scripts/workbook.ts cover` (a few units a chat).\n")

after("## 12. Decision log (newest first; the details are in each commit message and `docs/`)\n",
      "\n- 2026-11-25 (`bfe4f2d`): **each unit's cover drawing on its skill book.** His words: the workbook skill's \"one\n"
      "  powerful thing\" is its cover, and the skill book's PDF has none (\"not look attractive\"); \"if you not remove\n"
      "  the part in past paper workbook skill ... first please confirm\". Mine: I had taken the drawing step out of the\n"
      "  skill's patch (the app had its own text cover): told him not to save the cards yet, put the step back word for\n"
      "  word, and built the app's side. His pick: the drawing beside the term's units, this unit pulled out (as the skill\n"
      "  draws it), the levels and skills on the back of the cover.\n"
      "- 2026-11-24 (`6314eb2`): **a unit straight into the app as its skill book.** His voice note: the skill book is the\n"
      "  book (\"each skill considered as each level\"), \"I don't want direct PDF from you ... you just say done\", his fear of\n"
      "  \"Use as the workbook\" (\"everything will be changed\"), and \"what is your job?\". Mine: Claude makes the questions,\n"
      "  the app makes the book; one chat per unit (type, solve, kinds, marks, skills, save) instead of three plus an\n"
      "  upload; the switch read in the code and run on a copy of all 23 units' real data (all pass), so his fear had facts:\n"
      "  it renumbers one unit and clears only that unit's marks (XP, flame, race kept), every screen follows, the old\n"
      "  printed book stops matching, and moving questions is off after it. His picks: straight in (yes, with \"be careful\n"
      "  ... don't remove the experience\"), **switch all 23 now** (I recommended a safety copy of the old marks and a pilot\n"
      "  first; he chose all now, no copy), **one edition a year**. Built: the whole-unit save and its tool; the skill moved\n"
      "  by an exact patch: every rule and lesson kept, the engine byte for byte but book.py's two lines (the levels are the\n"
      "  app's; nothing to draw), the skill-tags rules in word for word; lighter later, after a pilot.\n")

if problems:
    print("NOT WRITTEN: the skill isn't the one this script was made for:\n  " + "\n  ".join(problems))
    sys.exit(1)
assert s.startswith(old[:150]) and len(s) > len(old)
# Nothing taken out: every line of the brief before is still in it, in the same order.
lines_old = [x for x in old.split("\n") if not x.startswith("Last updated 2026-11-24, at commit `8dfaf93` (")]
lines_new = s.split("\n")
it = iter(lines_new)
assert all(any(x == y for y in it) for x in lines_old), "a line of the brief went missing"
open(dst_path, "w", encoding="utf-8").write(s)
print(f"written {dst_path}: {len(old)} → {len(s)} letters; every line of the brief before is still in it, in order")
