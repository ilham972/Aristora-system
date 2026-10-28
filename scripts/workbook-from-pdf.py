"""Read an ARISTORA past-paper workbook PDF (the level edition, made by the past-paper-workbook skill) and write
the app's Master book data: parts (question ranges), levels (ranges + printed marks), marks of every question.

usage:  python3 -I scripts/workbook-from-pdf.py BOOK.pdf OUT.json      (needs pdftotext, from poppler-utils)

It prints the parts and levels, the Part II marks, and PROBLEMS (must be "none": every level's questions must add
up to its printed marks). Paste the JSON into KNOWN_WORKBOOKS in convex/lib/book.ts and bump DATA_VERSION in
convex/setup.ts, so every phone's setup.ensure() inserts it. Checked on G7 U08 v1: 8 levels, 74 + 72 = 146 marks.
Part I questions are worth 2 marks each (as printed); the reader assumes that when it checks Part I levels."""
import html, json, re, subprocess, sys
from collections import defaultdict

pdf, out = sys.argv[1], sys.argv[2]
src = subprocess.run(["pdftotext", "-bbox", pdf, "-"], capture_output=True, text=True, check=True).stdout
words = []  # (page, y, x, h, text)
raw = []    # (page, text) in the PDF's own reading order
for pno, pg in enumerate(re.split(r"<page ", src)[1:], 1):
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg):
        words.append((pno, float(m[2]), float(m[1]), float(m[4]) - float(m[2]), html.unescape(m[5])))
        raw.append((pno, html.unescape(m[5])))
words.sort(key=lambda w: (w[0], round(w[1] / 3), w[2]))

def line_of(i):
    p, y = words[i][0], words[i][1]
    return [w for w in words if w[0] == p and abs(w[1] - y) < 4]

# --- level boxes: "Level N ... a – b ... / max" on one line (not the contents page or the marks table)
levels = {}
for i, (p, y, x, h, t) in enumerate(words):
    if t != "Level" or i + 1 >= len(words) or not words[i + 1][4].isdigit():
        continue
    n = int(words[i + 1][4])
    ln = sorted(line_of(i), key=lambda w: w[2])
    texts = [w[4] for w in ln]
    if "/" not in texts:
        continue
    mx = int(texts[texts.index("/") + 1])
    rng = [int(t2) for t2 in texts if t2.isdigit()]
    joined = " ".join(texts)
    m = re.search(r"(\d+)\s*–\s*(\d+)", joined)
    if not m:
        continue
    a, b = int(m[1]), int(m[2])
    levels.setdefault(n, {"n": n, "from": a, "to": b, "max": mx})

# --- parts from the contents rows "பகுதி I · வினாக்கள் 1 – 37"
parts = []
text_all = " ".join(t for (p, t) in raw if p <= 3)
for m in re.finditer(r"பகுதி\s+(I{1,2}|IA|IB|IIA|IIB)\s*·\s*\S+\s+(\d+)\s*–\s*(\d+)", text_all):
    pid, a, b = m[1], int(m[2]), int(m[3])
    if not any(x["id"] == pid for x in parts):
        short = pid in ("I", "IA")
        parts.append({"id": pid, "from": a, "to": b, "kind": "short", "each": 2} if short else {"id": pid, "from": a, "to": b, "kind": "cards"})

# --- question badges (left margin, the badge font) and printed marks "(N புள்ளி…)", in the PDF's reading order
qpos = []  # (page, y, q)
marks = defaultdict(int)
seq = []
for pno, pg in enumerate(re.split(r"<page ", src)[1:], 1):
    for m in re.finditer(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>', pg):
        x0, y0, h, t = float(m[1]), float(m[2]), float(m[4]) - float(m[2]), html.unescape(m[5])
        seq.append((pno, y0, x0, h, t))
for (p, y, x, h, t) in seq:
    if re.fullmatch(r"\d{1,3}", t) and x < 70 and 17.5 < h < 20 and y < 790:
        qpos.append((p, y, int(t)))
qpos.sort()
for i, (p, y, x, h, t) in enumerate(seq):
    if not t.startswith("புள்ளி") or i == 0:
        continue
    mm = re.fullmatch(r"\((\d+)", seq[i - 1][4])
    if not mm:
        continue
    above = [q for (qp, qy, q) in qpos if (qp, qy) <= (p, y + 2)]   # the card whose badge is above this line
    if above:
        marks[above[-1]] += int(mm[1])

data = {"kind": "master", "parts": parts, "levels": [levels[k] for k in sorted(levels)],
        "marks": {str(k): v for k, v in sorted(marks.items())}}
# checks: every question in exactly one level; each level's printed max = its questions' marks (2 each in Part I)
qs = sorted({q for (_, _, q) in qpos})
problems = []
for L in data["levels"]:
    part = next(pp for pp in parts if pp["from"] <= L["from"] <= pp["to"])
    if part["kind"] == "short":
        tot = 2 * (L["to"] - L["from"] + 1)
    else:
        tot = sum(marks.get(q, 0) for q in range(L["from"], L["to"] + 1))
    if tot != L["max"]:
        problems.append(f"Level {L['n']}: questions add up to {tot}, printed {L['max']}")
covered = [q for L in data["levels"] for q in range(L["from"], L["to"] + 1)]
if sorted(covered) != list(range(1, max(covered) + 1)):
    problems.append("levels do not cover every question exactly once")
if qs != list(range(1, len(qs) + 1)):
    problems.append(f"question badges found: {qs}")
json.dump(data, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(json.dumps({k: v for k, v in data.items() if k != "marks"}, ensure_ascii=False))
print("part II marks:", {k: v for k, v in data["marks"].items()})
print("PROBLEMS:", problems or "none")
