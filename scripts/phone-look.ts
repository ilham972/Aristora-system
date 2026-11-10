// How each printed question of a unit looks on a student's phone, measured (10 Nov 2026, his report: "sometimes some
// figures are cut off"): the app's own drawing (src/questionView.ts drawQuestion, the family app's PAPER_CSS from
// src/family/play.tsx and its font) at a phone's width in Chromium; anything that runs past the card (it is cut off
// there) is listed, and the questions are photographed for a look. Run with tsx, beside scripts/digitize.ts:
//
//   tsx scripts/phone-look.ts <dir>/<KEY> [<shots dir>] [q …]     (out/items.json's questions first when it exists)
import { build } from "/opt/npm-tools/node_modules/esbuild/lib/main.js";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const require = createRequire("/opt/npm-tools/node_modules/");
const { chromium } = require("playwright") as typeof import("playwright");
/** The width the paper gets on a 360 px phone: the level's 16 px sides, the card's 16 px padding. */
const PAPER_W = 360 - 2 * 16 - 2 * 16;

const [udir, shotsArg, ...only] = process.argv.slice(2);
const play = readFileSync(join(repo, "src/family/play.tsx"), "utf8");
const paperCss = /const PAPER_CSS = `([\s\S]*?)`;/.exec(play)![1];
const font = readFileSync(join(repo, "src/family/fonts/baloo-thambi-2.woff2")).toString("base64");
const js = (await build({ stdin: { contents: `import { drawQuestion } from "./src/questionView"; (window as any).drawQuestion = drawQuestion;`, resolveDir: repo, loader: "ts" }, bundle: true, write: false, format: "iife" })).outputFiles[0].text;
const unit = JSON.parse(readFileSync(join(udir, "unit.json"), "utf8")) as { css: string | null };
const html = new Map<number, string>();
for (const f of readdirSync(join(udir, "q"))) html.set(Number(f.slice(0, 3)), readFileSync(join(udir, "q", f), "utf8"));
if (existsSync(join(udir, "out/items.json"))) for (const it of JSON.parse(readFileSync(join(udir, "out/items.json"), "utf8")) as { q: number; html: string }[]) html.set(it.q, it.html);
const qs = (only.length ? only.map(Number) : [...html.keys()]).sort((a, b) => a - b);
const shots = shotsArg && shotsArg !== "-" ? shotsArg : null;
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, deviceScaleFactor: shots ? 2 : 1 });
await page.setContent(`<!doctype html><html><head><style>@font-face { font-family: "Baloo Thambi 2"; src: url(data:font/woff2;base64,${font}) format("woff2"); font-weight: 400 800; }
body { margin: 0; background: #f4f2ff; } #card { margin: 16px; padding: 16px; background: #fff; border-radius: 24px; } #host { width: ${PAPER_W}px; }</style>
<script>${js}</script></head><body><div id="card"><div id="host"></div></div></body></html>`);
let cut = 0;
for (const q of qs) {
  const found = await page.evaluate(
    async ([h, css, extra]) => {
      const host = document.getElementById("host")!;
      host.replaceChildren();
      (host as any).shadowRoot?.replaceChildren();
      (window as any).drawQuestion(host, h, css, extra);
      await document.fonts.ready;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const box = host.shadowRoot!.querySelector(".qv")!.getBoundingClientRect();
      const out: string[] = [];
      host.shadowRoot!.querySelectorAll<HTMLElement>(".qv *").forEach((el) => {
        if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") return;
        const r = el.getBoundingClientRect();
        if (!r.width || getComputedStyle(el).display === "none") return;
        if (r.right > box.right + 0.5) {
          const parentCut = el.parentElement && el.parentElement.getBoundingClientRect().right > box.right + 0.5;
          if (!parentCut || el.tagName.toLowerCase() === "svg") out.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ").join(".")}` : ""} ${Math.round(r.right - box.right)}px past: "${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}"`);
        }
      });
      return { out, h: Math.round(box.height) };
    },
    [html.get(q)!, unit.css ?? "", paperCss] as const,
  );
  if (found.out.length) {
    cut++;
    console.log(`Q${q}: cut off on a 360 px phone\n  ${found.out.slice(0, 6).join("\n  ")}`);
  }
  if (shots) await page.locator("#card").screenshot({ path: join(shots, `q${String(q).padStart(3, "0")}.png`) });
}
console.log(`${qs.length} questions looked at, ${cut} cut off`);
await browser.close();
