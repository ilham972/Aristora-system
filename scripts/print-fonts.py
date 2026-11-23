"""print-fonts.py — the workbook engine's own fonts for the app's printed books (src/printFonts/, 22 Nov 2026).

The past-paper-workbook engine (WeasyPrint) sets its books in TMuktaLat (Mukta's Latin letters and digits at 115%, so
English and numbers sit level with the Tamil), Mukta Malar (Tamil), Baloo Thambi 2 (headings, badges), STIX Two Text
italic (maths letters), STIX Two Math and DejaVu Sans (symbols). An upload keeps the questions' HTML and CSS but not
the fonts (they were base64 inside book.html; the app's CSP allows fonts from the app only), so the app ships the
same fonts, cut to what a book prints, as static WOFF2 files (a variable font prints as a Type 3 font in Chrome's
PDF: thin and blurry in some viewers). They are fetched only when a book is printed.

Run once after `python3 setup_fonts.py` of the ol-essay skill (it installs the engine's exact fonts in
~/.local/share/fonts, TMuktaLat included):  python3 scripts/print-fonts.py
All the fonts are under the SIL Open Font License (DejaVu: the Bitstream Vera licence): src/printFonts/OFL.txt."""
import os

from fontTools import subset
from fontTools.ttLib import TTFont

SRC = os.path.expanduser("~/.local/share/fonts")
DEJAVU = "/usr/share/fonts/truetype/dejavu"
OUT = os.path.join(os.path.dirname(__file__), "..", "src", "printFonts")

R = lambda a, b: list(range(a, b + 1))  # noqa: E731
LATIN = R(0x20, 0x7E) + R(0xA0, 0xFF) + R(0x2010, 0x2044) + [0x2212, 0x00D7, 0x00F7, 0x2032, 0x2033, 0x20B9]
TAMIL = R(0x0B80, 0x0BFF) + [0x200B, 0x200C, 0x200D, 0x25CC, 0x0964, 0x0965]
GREEK = R(0x0370, 0x03FF)
MATH = (R(0x2100, 0x214F) + R(0x2190, 0x21FF) + R(0x2200, 0x22FF) + R(0x2300, 0x23FF) + R(0x25A0, 0x25FF)
        + R(0x27C0, 0x27FF) + R(0x2980, 0x29FF) + R(0x2A00, 0x2AFF) + R(0x2B00, 0x2B2F))
# DejaVu serves what the others lack: ✓ ✗ (the papers' tick boxes; .mk2), stars, ballot boxes, circled numbers, dingbats
SYMBOLS = R(0x2190, 0x21FF) + R(0x2460, 0x2473) + R(0x25A0, 0x25FF) + [0x2605, 0x2606, 0x2610, 0x2611, 0x2612] \
    + R(0x2660, 0x2667) + R(0x2700, 0x27BF)

# (source file, output name, unicodes)
FONTS = [
    *[(f"{SRC}/TMuktaLat-{w}.ttf", f"tmuktalat-{n}", None) for n, w in
      ((400, "Regular"), (500, "Medium"), (600, "SemiBold"), (700, "Bold"), (800, "ExtraBold"))],
    *[(f"{SRC}/MuktaMalar-{w}.ttf", f"muktamalar-{n}", TAMIL + LATIN) for n, w in
      ((400, "Regular"), (500, "Medium"), (600, "SemiBold"), (700, "Bold"), (800, "ExtraBold"))],
    *[(f"{SRC}/BalooThambi2-{w}.ttf", f"baloothambi2-{n}", TAMIL + LATIN) for n, w in
      ((500, "Medium"), (600, "SemiBold"), (700, "Bold"), (800, "ExtraBold"))],
    (f"{SRC}/STIXTwoText-Italic.ttf", "stixtwotext-400i", LATIN + GREEK),
    (f"{SRC}/STIXTwoText-BoldItalic.ttf", "stixtwotext-700i", LATIN + GREEK),
    (f"{SRC}/STIXTwoMath-Regular.ttf", "stixtwomath-400", MATH + GREEK + R(0x20, 0x7E)),
    (f"{DEJAVU}/DejaVuSans.ttf", "dejavusans-400", SYMBOLS + R(0x20, 0x7E)),
    (f"{DEJAVU}/DejaVuSans-Bold.ttf", "dejavusans-700", SYMBOLS + R(0x20, 0x7E)),
]


def cut(src, name, unicodes):
    f = TTFont(src)
    opts = subset.Options()
    opts.layout_features = ["*"]          # every Tamil shaping feature (conjuncts, vowel signs) and kerning
    opts.name_IDs = ["*"]
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.hinting = False                  # print only: hints only weigh
    opts.drop_tables += ["MATH", "DSIG"]  # the browser sets text, not equations
    opts.flavor = "woff2"
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=unicodes if unicodes is not None else list(f.getBestCmap().keys()))
    sub.subset(f)
    path = os.path.join(OUT, f"{name}.woff2")
    f.flavor = "woff2"
    f.save(path)
    return os.path.getsize(path)


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    total = 0
    for src, name, uni in FONTS:
        size = cut(src, name, uni)
        total += size
        print(f"{name:22s} {size // 1024:4d} KB")
    print(f"total {total // 1024} KB")
