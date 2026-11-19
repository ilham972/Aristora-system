"""build.py <grade source dir> <out.json>: every unit of one grade's Sakarath source as the app needs it (17 Nov 2026;
docs/making-changes.md "A Sakarath book into the app"). Run with python3 -I from outside the source folder (it imports
the source's own engine: mk.py, plan.py, figs.py and each uNN.py); nothing is printed or built.

Each section (a), (b), ... of a master question is one question of the app, drawn as the book draws it (no working
spaces: the phone puts its own boxes under each part). Each part keeps its answer as the key writes it for people
(**bold** = the final answer) and what it asks for (a drawing or not). A master question is one level (a long one is
cut in two at a section). The kinds are decided next by kinds.ts with the app's own rules (convex/lib/phone.ts)."""
import html as H
import importlib
import json
import os
import re
import subprocess
import sys

src = os.path.abspath(sys.argv[1])
out = os.path.abspath(sys.argv[2])
sys.path.insert(0, src)
os.chdir(src)
_run = subprocess.run


def _fake(cmd, *a, **k):  # the house fonts are only checked, never used: nothing is printed here
    if cmd[:1] == ["fc-list"]:
        class R:
            stdout = "Mukta Malar\nTMuktaLat\nBaloo Thambi 2\nSTIX Two Text\nSTIX Two Math\nDejaVu Sans\nDejaVu Serif\n"
        return R()
    return _run(cmd, *a, **k)


subprocess.run = _fake
import mk  # noqa: E402
import plan  # noqa: E402

LEVEL_MAX = 16          # parts in one level at most (a longer master question is cut at a section)
# A part drawn on paper (the phone asks a photo): the drawing verbs as commands, a mark on a figure or a number line,
# a construction with compass / straight edge / protractor. ("அமைக்க" alone also means "to make (a figure of
# matchsticks)": never on its own.)
DRAW = re.compile(r"வரைக|வரைந்து|வரையுக|நிழற்றுக|வட்டமிடுக|வட்டமிட்டு|"
                  r"(?:உருவில்|எண்கோட்டில்|எண்கோட்டின் மீது|தளத்தில்|வரைபடத்தில்|எண்சட்டத்தில்|வலையில்|அட்டவணையில்)[^.]*?(?:குறி|காட்டு|வரை|இணை|நிரப்பு)|"
                  r"வென்வரிப்பட[^.]*?(?:காட்டு|வரை|குறி)|புள்ளிகளை இணை|கோடிடுக")
TOOLS = re.compile(r"கவராய|நேர் விளிம்பு|பாகைமானி|மூலைமட்ட|அளவுகோல்")


def frac(m):
    a, b = plain(m.group(1)), plain(m.group(2))
    simple = lambda s: re.fullmatch(r"[−-]?[0-9A-Za-z.]+", s) is not None  # noqa: E731
    return f"{a}/{b}" if simple(a) and simple(b) else f"({a})/({b})"


def keytext(h):
    """An answer's HTML as the key's words: the final answer in **bold**, fractions a/b, powers ^."""
    h = re.sub(r"(\d)\s*(<span class=\"frc\">)", r"\1 \2", h)          # 2¾ is "2 3/4"
    h = h.replace("<b>", "\x01").replace("</b>", "\x02")
    for _ in range(3):
        h = re.sub(r'<span class="frc"><span class="nu">((?:(?!<span class="frc">).)*?)</span><span class="de">((?:(?!<span class="frc">).)*?)</span></span>', frac, h)
    h = re.sub(r'<span class="sq">√<span class="sqb">(.*?)</span></span>', lambda m: f"√({plain(m.group(1))})", h)
    h = re.sub(r"<sup>(.*?)</sup>", lambda m: "^" + (plain(m.group(1)) if len(plain(m.group(1))) == 1 else f"({plain(m.group(1))})"), h)
    h = re.sub(r"<sub[^>]*>(.*?)</sub>", r"_\1", h)
    h = re.sub(r'<span class="kb[^"]*">(.*?)</span>', r"[\1]", h)
    t = plain(h)
    t = t.replace("\x01", "**").replace("\x02", "**")
    t = re.sub(r"\*\*\s*\*\*", "", t)                                      # bold runs side by side join
    return re.sub(r"\s+", " ", t).strip()


def plain(h):
    return re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", "", h))).strip()


def phone_html(h):
    """The book's HTML as the phone draws it: the square root's own class (the app's `.sq` is a sub-question), a
    section's lead in the phone's reading size."""
    h = h.replace('class="sq"', 'class="sqr"')
    h = h.replace('<div class="st">', '<div class="st lead2">')
    return h


def section_html(u, blocks, head):
    sub = mk.Unit.__new__(mk.Unit)
    sub.__dict__.update(u.__dict__)
    sub.blocks = blocks
    sub.nq = 1
    sub.band = lambda: ""
    sub._zone = lambda mm: ""
    body = sub.html(0.0)
    return phone_html(head + body)


units = []
for row in plan.PLAN:
    name = f"u{row[0]:02d}"
    if not os.path.exists(name + ".py"):
        continue
    u = importlib.import_module(name).unit()
    # master questions → sections → parts (u.key is in the parts' order)
    ki = 0
    qs = []          # master questions: [ {n, secs: [ {label, blocks, parts: [...] } ] } ]
    cur_q = None
    cur_s = None
    for i, b in enumerate(u.blocks):
        if b["kind"] == "q":
            cur_q = dict(n=b["n"], secs=[])
            qs.append(cur_q)
            cur_s = None
            continue
        if cur_q is None:
            cur_q = dict(n=1, secs=[])
            qs.append(cur_q)
        if b["kind"] == "sec":
            cur_s = dict(label=b["label"], blocks=[b], parts=[], lead=plain(b["lead"]))
            cur_q["secs"].append(cur_s)
            continue
        if cur_s is None:
            cur_s = dict(label="", blocks=[], parts=[], lead="")
            cur_q["secs"].append(cur_s)
        if b["kind"] == "sp":
            # a drawing area: the part before it is drawn on paper (the phone asks a photo)
            if cur_s["parts"]:
                cur_s["parts"][-1]["draw"] = True
            continue
        assert b["kind"] == "p", b["kind"]
        k = u.key[ki]
        ki += 1
        text = plain(b["text"])
        cur_s["blocks"].append(b)
        tools = bool(TOOLS.search(text) or TOOLS.search(cur_s["lead"]))
        draw = bool(DRAW.search(text)) or (tools and bool(re.search(r"அமைக்க|வரை|குறி", text)))
        cur_s["parts"].append(dict(p=b["label"], a=keytext(k["ans"]), skill=k["skill"], text=text, lead=cur_s["lead"],
                                   draw=draw, sp=b["sp"]))
    assert ki == len(u.key)
    out_qs = []
    levels = []
    q_no = 0
    for mq in qs:
        tag = f"{u.no}{'ABCDEFGHIJKLMNOP'[mq['n'] - 1]}" if u.nq > 1 else f"{u.no}"  # O/L U26: nine (A–I)
        first = q_no + 1
        run = 0
        for si, s in enumerate(mq["secs"]):
            if not s["parts"]:
                continue
            q_no += 1
            head = f'<div class="qsep"><span>வினா {tag}</span><i></i></div>' if u.nq > 1 else ""
            out_qs.append(dict(q=q_no, tag=tag, sec=s["label"], html=section_html(u, s["blocks"], head), parts=s["parts"]))
            n = len(s["parts"])
            if run and run + n > LEVEL_MAX:
                levels.append([first, q_no - 1])
                first = q_no
                run = 0
            run += n
        if q_no >= first:
            levels.append([first, q_no])
    units.append(dict(no=u.no, code=f"U{u.no:02d}", ta=u.ta, en=u.en, term=u.term, questions=out_qs, levels=levels))

css = mk.CSS
css = re.sub(r"@page\s*\{[^}]*\}", "", css)
css = css.replace(".sq {", ".sqr {")
# The angle's hat (A B̂ C: one letter in <span class="hat">): Grade 9's book draws it with an SVG picture in its style,
# and a book's style in the app may hold no url(…) (convex/lib/questions.ts unsafeCss); the same chevron, drawn with two
# borders instead. Only that rule: Grade 10's and the O/L book's hat is a "^" of their own (.hat::after), kept as it is.
css = re.sub(r"\.hat\s*\{[^}]*url\([^}]*\}",
             ".hat { display: inline-block; position: relative; line-height: 1; padding-top: .3em; }\n"
             ".hat::before { content: \"\"; position: absolute; left: 50%; top: .1em; width: .26em; height: .26em;"
             " box-sizing: border-box; border-top: .065em solid currentColor; border-left: .065em solid currentColor;"
             " transform: translateX(-50%) rotate(45deg); }", css)
# On a phone (the app draws it in a card ~300 px wide): figures shrink to the card, a figure beside the text goes under
# it when there is no room, a long label ("(viii)") keeps its space, calculator keys wrap (19 Nov 2026: Grade 9 U11's
# ON → 2 → 4 → + → 9 → ÷ → 3 → = ran 97 px past the card).
css += """
.fg { max-width: 100% !important; height: auto !important; }
.fg svg { display: block; max-width: 100%; width: 100%; height: auto; }
.row { flex-wrap: wrap; row-gap: 2mm; }
.row > .col { min-width: 55%; }
.fgc { margin-left: 0; max-width: 100%; }
.fgb { max-width: 100%; overflow: hidden; }
.rl { width: auto; min-width: 8.6mm; padding-right: .35em; }
.pt { margin-left: 0; }
table.gt { max-width: 100%; }
table.gt td, table.gt th { padding: .3mm 1.2mm; }
.fgb > div { min-width: 0; max-width: 100%; }
.fgb > div[style*="flex-direction:column"] { width: 100%; }
.tf, .m { white-space: normal; }
.keys { white-space: normal; display: inline-flex; flex-wrap: wrap; align-items: center; row-gap: 1.2mm; max-width: 100%; vertical-align: middle; }
.qv table.gt.sm td, .qv table.gt.sm th { font-size: 14px !important; padding: .2mm 1mm; }
"""
# The O/L book (19 Nov 2026): GRADE "OL" is the app's grade 12; its units are its own (their names and part go with
# each request: convex/link.ts saveSakarath).
GRADE = 12 if plan.GRADE == "OL" else plan.GRADE
json.dump(dict(grade=GRADE, ver=plan.VER, css=css.strip(), units=units), open(out, "w"), ensure_ascii=False)
print(GRADE, len(units), "units", sum(len(x["questions"]) for x in units), "questions",
      sum(len(q["parts"]) for x in units for q in x["questions"]), "parts",
      sum(len(x["levels"]) for x in units), "levels")
