#!/usr/bin/env python3
"""Cut a volume of the government's free textbook into one PDF per ARISTORA unit, small enough to upload.

    python3 scripts/gov/split.py <volume.pdf> <units.json> <out-dir> [--part I]

units.json = [{ "key": "G8-U06", "first": 79, "last": 92, "source": "Grade 8 maths, Part I, unit 6" }, …]
where `first` and `last` are the PRINTED page numbers (the contents page's), never the pdf's: a scanned volume often
has pages missing or out of order, so this reads the printed number off every page's footer and cuts by that. Pages
the volume does not hold are reported and that unit is skipped, rather than cutting the wrong pages.

Out: <out-dir>/<key>.pdf and <out-dir>/manifest.json, ready for scripts/gov/upload.ts.

Each unit is squeezed on the way out: the XMP metadata the publisher's tool repeated on every page is dropped, the
objects that repeat are merged, and the photographs are recompressed (the text and the drawings stay vector, so they
stay sharp at any zoom). A Grade 8 unit comes out around 500 KB instead of 900.
"""
import argparse, hashlib, io, json, os, re, subprocess, sys

import pikepdf
from PIL import Image, ImageChops
from pypdf import PdfReader, PdfWriter

#: The footer of the Sri Lankan free textbooks, in the legacy Tamil font the PDFs carry ("இலவசப் பாடநூல்").
FOOTER = "h¡À"
MAX_SIDE = 820  # a photograph never needs more across one of these pages
QUALITY = 45


def printed_pages(pdf: str, n: int, footer: str) -> dict[int, int]:
    """pdf page -> the page number printed on it (missing when the footer has none)."""
    out: dict[int, int] = {}
    for p in range(1, n + 1):
        text = subprocess.run(["pdftotext", "-layout", "-f", str(p), "-l", str(p), pdf, "-"], capture_output=True, text=True).stdout
        lines = [l for l in text.splitlines() if l.strip()]
        for line in reversed(lines[-3:]):
            if footer in line:
                nums = re.findall(r"\b(\d{1,3})\b", line)
                if nums:
                    out[p] = int(nums[-1] if line.strip().endswith(nums[-1]) else nums[0])
                break
    return out


def shrink_images(path: str, out: str) -> None:
    pdf = pikepdf.open(path)
    for obj in pdf.objects:
        if not isinstance(obj, pikepdf.Stream):
            continue
        d = obj.stream_dict
        if str(d.get("/Subtype", "")) != "/Image" or "/SMask" in d or "/ImageMask" in d:
            continue
        try:
            data = obj.read_raw_bytes()
            if str(d.get("/Filter", "")) == "/DCTDecode":
                im = Image.open(io.BytesIO(data))
                im.load()
                # Adobe writes CMYK JPEGs inverted and marks them so; PIL hands them over as they are.
                if im.mode == "CMYK" and "adobe" in im.info:
                    im = ImageChops.invert(im)
            else:
                im = pikepdf.PdfImage(obj).as_pil_image()
        except Exception:
            continue
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        w, h = im.size
        if max(w, h) > MAX_SIDE:
            s = MAX_SIDE / max(w, h)
            im = im.resize((max(1, int(w * s)), max(1, int(h * s))), Image.LANCZOS)
        buf = io.BytesIO()
        im.save(buf, format="JPEG", quality=QUALITY, optimize=True)
        new = buf.getvalue()
        if len(new) >= len(data):
            continue
        for k in ("/DecodeParms", "/Decode", "/Interpolate"):
            if k in d:
                del d[k]
        obj.write(new, filter=pikepdf.Name("/DCTDecode"))
        d["/ColorSpace"] = pikepdf.Name("/DeviceRGB" if im.mode == "RGB" else "/DeviceGray")
        d["/BitsPerComponent"] = 8
        d["/Width"], d["/Height"] = im.size
    pdf.save(out, object_stream_mode=pikepdf.ObjectStreamMode.generate, compress_streams=True, recompress_flate=True)


def squeeze(src: str, dst: str) -> None:
    pdf = pikepdf.open(src)
    if "/Metadata" in pdf.Root:
        del pdf.Root["/Metadata"]
    for obj in pdf.objects:
        d = obj if isinstance(obj, pikepdf.Dictionary) else (obj.stream_dict if isinstance(obj, pikepdf.Stream) else None)
        if d is None:
            continue
        for k in ("/Metadata", "/PieceInfo", "/LastModified"):
            if k in d:
                try:
                    del d[k]
                except Exception:
                    pass
    pdf.save("/tmp/_gov1.pdf", object_stream_mode=pikepdf.ObjectStreamMode.generate, compress_streams=True, recompress_flate=True)
    w = PdfWriter(clone_from=PdfReader("/tmp/_gov1.pdf"))
    try:
        w.compress_identical_objects()
    except Exception:
        pass
    for page in w.pages:
        try:
            page.compress_content_streams(level=9)
        except Exception:
            pass
    with open("/tmp/_gov2.pdf", "wb") as f:
        w.write(f)
    pikepdf.open("/tmp/_gov2.pdf").save(dst, object_stream_mode=pikepdf.ObjectStreamMode.generate, compress_streams=True, recompress_flate=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("volume")
    ap.add_argument("units")
    ap.add_argument("out")
    ap.add_argument("--footer", default=FOOTER, help="the footer's letters, to find each page's printed number")
    args = ap.parse_args()

    n = int(subprocess.run(["qpdf", "--show-npages", args.volume], capture_output=True, text=True).stdout.strip())
    printed = printed_pages(args.volume, n, args.footer)
    # A page whose footer carries no number (a full-page figure) takes the number after its neighbour's, as a book does.
    taken = set(printed.values())
    for p in list(range(2, n + 1)) + list(range(n - 1, 0, -1)):
        if p in printed:
            continue
        near = printed.get(p - 1)
        guess = near + 1 if near is not None else (printed[p + 1] - 1 if printed.get(p + 1) is not None else None)
        if guess is not None and guess not in taken:
            printed[p] = guess
            taken.add(guess)
    where: dict[int, int] = {}
    for pdf_page, number in sorted(printed.items()):
        where.setdefault(number, pdf_page)
    print(f"{args.volume}: {n} pages, printed {min(where)}-{max(where)} ({len(where)} numbered)")

    os.makedirs(args.out, exist_ok=True)
    rows = []
    for u in json.load(open(args.units)):
        want = list(range(u["first"], u["last"] + 1))
        missing = [p for p in want if p not in where]
        if missing:
            print(f"{u['key']}: SKIPPED, the volume has no printed page {missing[0]}-{missing[-1]} ({len(missing)} of {len(want)})")
            continue
        pages = [where[p] for p in want]
        cut = f"/tmp/_gov-cut-{u['key']}.pdf"
        subprocess.run(["qpdf", args.volume, "--pages", ".", ",".join(str(p) for p in pages), "--", cut], check=True)
        dst = os.path.join(args.out, f"{u['key']}.pdf")
        shrink_images(cut, "/tmp/_gov-img.pdf")
        squeeze("/tmp/_gov-img.pdf", dst)
        os.remove(cut)
        size = os.path.getsize(dst)
        rows.append({
            "key": u["key"],
            "pages": len(pages),
            "bytes": size,
            "sha": hashlib.sha256(open(dst, "rb").read()).hexdigest()[:16],
            "first": u["first"],
            "last": u["last"],
            "source": f"{u['source']}, pages {u['first']}-{u['last']}",
        })
        print(f"{u['key']}  printed {u['first']:>3}-{u['last']:<3} {len(pages):>2} pages  {size / 1024:6.0f} KB")

    path = os.path.join(args.out, "manifest.json")
    old = {r["key"]: r for r in (json.load(open(path)) if os.path.exists(path) else [])}
    for r in rows:
        old[r["key"]] = r
    json.dump(sorted(old.values(), key=lambda r: r["key"]), open(path, "w"), ensure_ascii=False, indent=1)
    print(f"\n{len(rows)} units written, {sum(r['bytes'] for r in rows) / 1024 / 1024:.1f} MB; manifest has {len(old)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
