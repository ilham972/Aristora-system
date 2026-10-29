# The ARISTORA owl, from its traced parts (owl.json: the logo's board, tassel, head, eye sockets, wings as paths; irises
# and pupils as circles; traced once from the founder's logo with potrace, edges smoothed). Builds the icon SVGs
# (favicon, "any", maskable, Apple) and the splash's moving owl (each part in its own group, pivots as nested
# translates; its animations are "Splash" in src/styles.css). Run scripts/owl/make.sh to rebuild everything.
import json, re, sys, math
o = json.load(open(sys.argv[1])); outdir = sys.argv[2]
NAVY = "#16213e"
L, R = o["eyes"]
x0, y0, x1, y1 = o["bbox"]
cx_owl, cy_owl = (x0 + x1) / 2, (y0 + y1) / 2

def pts(d):
    n = [float(v) for v in re.findall(r"-?\d+\.?\d*", d)]
    return list(zip(n[0::2], n[1::2]))
allp = [p for k in ["board", "tassel", "head"] for p in pts(o[k])] + [p for w in o["wings"] for p in pts(w)]

def static_owl(eye=NAVY):
    """The logo as it is printed: white parts, eyes in the background colour."""
    c = lambda e, k: f'<circle cx="{e[k][0]}" cy="{e[k][1]}" r="{e[k][2]}"/>'
    return (f'<g fill="#fff"><path d="{o["wings"][0]}"/><path d="{o["wings"][1]}"/><path d="{o["head"]}"/>'
            f'<path d="{o["board"]}"/><path d="{o["tassel"]}"/></g>'
            f'<g fill="{eye}"><path d="{o["sockets"][0]}"/><path d="{o["sockets"][1]}"/></g>'
            f'<g fill="#fff">{c(L, "iris")}{c(R, "iris")}</g><g fill="{eye}">{c(L, "pupil")}{c(R, "pupil")}</g>')

def icon_svg(size, frac, rounded, mode="box"):
    """A square icon: navy (rounded or full-bleed) with the owl centred, `frac` = owl height / size (box mode)
    or the owl's farthest point within `frac` of the half-size (circle mode, for maskable icons)."""
    if mode == "box":
        s = frac * size / (y1 - y0)
    else:
        rmax = max(math.hypot(px - cx_owl, py - cy_owl) for px, py in allp)
        s = frac * (size / 2) / rmax
    tx, ty = size / 2 - s * cx_owl, size / 2 - s * cy_owl
    bg = f'<rect width="{size}" height="{size}" rx="{size * 0.22:.1f}" fill="{NAVY}"/>' if rounded else f'<rect width="{size}" height="{size}" fill="{NAVY}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {size} {size}" width="{size}" height="{size}">{bg}'
            f'<g transform="translate({tx:.2f} {ty:.2f}) scale({s:.5f})">{static_owl()}</g></svg>')

# Icons: favicon (rounded, owl big), "any" (rounded), maskable (full-bleed, owl inside the safe circle), Apple (full-bleed).
open(f"{outdir}/icon.svg", "w").write(icon_svg(512, 0.84, True))
open(f"{outdir}/icon-any.svg", "w").write(icon_svg(512, 0.80, True))
open(f"{outdir}/icon-maskable.svg", "w").write(icon_svg(512, 0.78, False, "circle"))
open(f"{outdir}/icon-apple.svg", "w").write(icon_svg(512, 0.72, False))

# The splash owl: the same shapes, cut into parts that move. Pivots are placed with nested translates, so every CSS
# animation only rotates/scales around its own (0,0): no transform-origin quirks on any browser.
def piv(x, y, cls, inner):
    return f'<g transform="translate({x} {y})"><g class="{cls}"><g transform="translate({-x} {-y})">{inner}</g></g></g>'

def eye(e, i, side):
    sock = o["sockets"][i]
    ix, iy, ir = e["iris"]; px, py, pr = e["pupil"]
    sx = [p[0] for p in pts(sock)]; sy = [p[1] for p in pts(sock)]
    lx, top, bot = (min(sx) + max(sx)) / 2, min(sy), max(sy)
    # The lid: a white ellipse above the socket that slides down to close the eye (leaving a thin crescent).
    rx, ry = (max(sx) - min(sx)) * 0.9, (bot - top) * 0.62
    lid_cy = top - ry - 4
    return (f'<clipPath id="owl-sock-{side}"><path d="{o["lidclips"][i]}"/></clipPath>'
            f'<path class="owl-dark" d="{sock}"/>'
            f'<g class="owl-look-{side}"><circle class="owl-white" cx="{ix}" cy="{iy}" r="{ir}"/>'
            f'<circle class="owl-dark owl-pupil-{side}" cx="{px}" cy="{py}" r="{pr}"/></g>'
            f'<g clip-path="url(#owl-sock-{side})"><ellipse class="owl-white owl-lid" cx="{lx:.1f}" cy="{lid_cy:.1f}" rx="{rx:.1f}" ry="{ry:.1f}"/></g>'), (bot - top) * 0.88 + 4

le, travel = eye(L, 0, "l")
re_, _ = eye(R, 1, "r")
lw, rw = o["wings"]
splash = (
    f'<svg class="owl" viewBox="{x0 - 20} {y0 - 70} {x1 - x0 + 40} {y1 - y0 + 90}" aria-hidden="true" focusable="false">'
    + piv(631, 937, "owl-body",
          piv(618, 722, "owl-wing-l", f'<path class="owl-white" d="{lw}"/>')
          + piv(644, 722, "owl-wing-r", f'<path class="owl-white" d="{rw}"/>'))
    + piv(631, 690, "owl-head",
          f'<path class="owl-white" d="{o["head"]}"/>' + le + re_
          + f'<g class="owl-cap"><path class="owl-white" d="{o["board"]}"/>'
          + piv(411, 402, "owl-tassel", f'<path class="owl-white" d="{o["tassel"]}"/>') + '</g>')
    + '</svg>'
)
open(f"{outdir}/splash-owl.svg.html", "w").write(splash)
json.dump({"lidTravel": round(travel, 1), "eyes": o["eyes"]}, open(f"{outdir}/owl-meta.json", "w"))
print("splash chars", len(splash), "lid travel", round(travel, 1))
