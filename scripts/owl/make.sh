#!/bin/sh
# Rebuild the owl from scripts/owl/owl.json: the icons in public/static and the splash's owl in public/index.html.
# Needs python3 and Playwright's Chromium (the tests' browser). Then build and look at the splash before shipping.
set -e
cd "$(dirname "$0")/../.."
out=$(mktemp -d)
python3 -I scripts/owl/build_owl.py scripts/owl/owl.json "$out"
r="node scripts/owl/render.cjs"
cp "$out/icon.svg" public/static/icon.svg
$r "$out/icon.svg" public/static/icon-32.png 32 32
$r "$out/icon-any.svg" public/static/icon-192.png 192 192
$r "$out/icon-any.svg" public/static/icon-512.png 512 512
$r "$out/icon-maskable.svg" public/static/icon-maskable-192.png 192 192
$r "$out/icon-maskable.svg" public/static/icon-maskable-512.png 512 512
$r "$out/icon-apple.svg" public/static/apple-touch-icon.png 180 180
python3 -I - "$out/splash-owl.svg.html" public/index.html <<'PY'
import re, sys
owl = open(sys.argv[1]).read(); page = open(sys.argv[2]).read()
new = re.sub(r'<svg class="owl".*?</svg>', lambda m: owl, page, flags=re.S)
assert '<svg class="owl"' in new
open(sys.argv[2], "w").write(new)
PY
rm -rf "$out"
echo "Owl rebuilt: public/static icons and the splash in public/index.html."
