// Render an SVG file to a PNG of the given size with Playwright's Chromium (scripts/owl/make.sh).
const { chromium } = require("playwright");
const [, , input, output, w, h] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
  const fs = require("fs");
  const svg = fs.readFileSync(input, "utf8");
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="[^"]*" height="[^"]*"/, `width="${w}" height="${h}"`)}</body></html>`);
  await p.screenshot({ path: output, omitBackground: true, clip: { x: 0, y: 0, width: Number(w), height: Number(h) } });
  await b.close();
})();
