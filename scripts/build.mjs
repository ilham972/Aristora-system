// Builds the phone app into dist/. Run by `npx convex deploy --cmd "npm run build"`,
// which sets CONVEX_URL to the production Convex address.

import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { gzipSync } from "node:zlib";

const url = process.env.CONVEX_URL;
const looksRight = !!url && /^https:\/\/[a-z0-9.-]+\.convex\.cloud\/?$/.test(url);
if (!url || (!looksRight && !process.env.ALLOW_LOCAL_CONVEX_URL)) {
  console.error(`CONVEX_URL is missing or wrong (got "${url ?? ""}"). Build with: npx convex deploy --cmd "npm run build" --cmd-url-env-var-name CONVEX_URL`);
  process.exit(1);
}

// The living owl while an app loads: one copy (public/splash.html) for both pages, so they stay the same exact owl.
const splash = (await readFile("public/splash.html", "utf8")).replace(/<!--[\s\S]*?-->\s*/g, "").trim();
const splashSaying = (slow) => splash.replace("%SLOW%", () => slow);

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });

const result = await build({
  entryPoints: { app: "src/main.tsx" },
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020"],
  outdir: "dist/assets",
  entryNames: "[name]-[hash]",
  assetNames: "[name]-[hash]",
  loader: { ".woff2": "file", ".woff": "file" },
  jsx: "automatic",
  jsxImportSource: "preact",
  define: { __CONVEX_URL__: JSON.stringify(url.replace(/\/$/, "")) },
  legalComments: "none",
  metafile: true,
  logLevel: "info",
});

const outputs = Object.keys(result.metafile.outputs);
const js = outputs.find((f) => f.endsWith(".js"));
const css = outputs.find((f) => f.endsWith(".css"));
if (!js || !css) throw new Error("Build did not produce app JS and CSS");

const html = (await readFile("public/index.html", "utf8"))
  .replace("%SPLASH%", () => splashSaying("Still loading. Check that this phone has mobile data or Wi-Fi."))
  .replace("%CSS%", `/assets/${basename(css)}`)
  .replace("%JS%", `/assets/${basename(js)}`);
await writeFile("dist/index.html", html);
await cp("public/static", "dist", { recursive: true });

const kb = (f) => Math.round(result.metafile.outputs[f].bytes / 1024);
console.log(`Built dist/ for ${url}: ${basename(js)} ${kb(js)} KB, ${basename(css)} ${kb(css)} KB`);

// ---- The family app (app.aristora.org; also /f/ here): its own small bundle, nothing of the teachers' app. ----
// Students open it on any phone and any signal: its first load must stay light. Over the budget, the build stops.
// 4 Nov 2026: 50 → 56 KB for the owl's acting (its whole-body moods, tap reactions and surprise visits, ~6 KB); 56 → 58
// the same day: the photos from home (55.6) and a printed question full screen + no selection (~1.5 KB). No dead CSS
// to cut (every class nobody names is built in the code: moods, states, places). 58 → 60 the same day: a tute's ladder
// on the phone, teacher questions and Learn (58.7).
// 4 Nov 2026, the profile: split in two. The first load (the entry and the chunks it imports, its style, its page) has
// this budget; Me and its profile parts (src/family/parts.ts: Me, the map of 12 weeks, the report, the photo editor,
// the certificate; their style profile.css) come right after the first screen with their own budget, and are named in
// the page (prefetch) so the service worker keeps them at install: they work with no signal like the rest. 60 → 62: what
// the first screens show of it (faces in the race, the top row and the children; the birthday party on Home; the way to
// the report and a certificate; the loader) and the split's own cost (two files compress a little less than one): 61.3.
// 62 → 66 the same evening: the answer kinds, the heart of the app (his voice note: "the most important place ... not
// in the working condition"): the question's own blanks as boxes, options and ✓ / ✗ to tap, words to underline, cards
// to order, pairs to match, the question in the app's font (they are the level screen: in the first load).
// 5 Nov 2026: the level screen (play.tsx and kinds.tsx, a quarter of the first load) moved into the parts right after
// the first screen (src/family/level.ts), named in the page like Me's: the first screen never shows it, and both budgets
// were full (65.3 / 66 and 15.8 / 16) with fractions and the boxes inside the question still to come. Later 16 → 32: it
// holds the level screen that left the first load (nothing a phone didn't already fetch) and those two.
// 7 Nov 2026, the race for everyone (his yes: "Race + profiles"): later 32 → 36 for a classmate's profile and cheers
// (32.9; fetched once, then kept by the service worker); the race's two lists and the grade cup are in the first load
// (58.6 / 66).
const FAMILY_BUDGET_KB = 66;
const FAMILY_LATER_KB = 42;
// 7 Nov 2026, the class app's Us tab: the family app's teachers' screens (src/family/staff.tsx, opened as /f/?staff
// inside the class app) are their own file: never prefetched by a student's phone, so outside both budgets above,
// with their own (a teacher's phone fetches them once, the first time she opens Us).
const FAMILY_STAFF_KB = 8;
await mkdir("dist/f/assets", { recursive: true });
const fam = await build({
  // profile.css: the style of the parts that come after the first screen (src/family/later.ts attaches it).
  entryPoints: { fam: "src/family/main.tsx", later: "src/family/profile.css" },
  bundle: true,
  minify: true,
  format: "esm",
  splitting: true,
  target: ["es2020"],
  outdir: "dist/f/assets",
  entryNames: "[name]-[hash]",
  chunkNames: "[name]-[hash]",
  assetNames: "[name]-[hash]",
  // One font for Tamil and English together (Baloo Thambi 2, weights 500–800, ~57 KB: src/family/fonts/; preloaded,
  // fetched once and kept by the service worker; not counted in the budget).
  loader: { ".woff2": "file", ".woff": "file" },
  jsx: "automatic",
  jsxImportSource: "preact",
  define: { __CONVEX_URL__: JSON.stringify(url.replace(/\/$/, "")) },
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
});
const famOuts = fam.metafile.outputs;
const famJs = Object.keys(famOuts).find((f) => famOuts[f].entryPoint === "src/family/main.tsx");
const famCss = famJs && famOuts[famJs].cssBundle;
const famFont = Object.keys(famOuts).find((f) => f.endsWith(".woff2"));
if (!famJs || !famCss || !famFont) throw new Error("Build did not produce the family app's JS, CSS and font");
/** Every JS file one reaches by import statements (what the browser must fetch before it runs). */
const staticOf = (start) => {
  const seen = new Set([start]);
  const walk = (f) => {
    for (const i of famOuts[f].imports) {
      if (i.kind === "import-statement" && i.path.endsWith(".js") && !seen.has(i.path)) {
        seen.add(i.path);
        walk(i.path);
      }
    }
  };
  walk(start);
  return seen;
};
const first = staticOf(famJs);
const laterCss = Object.keys(famOuts).find((f) => famOuts[f].entryPoint === "src/family/profile.css");
if (!laterCss) throw new Error("Build did not produce the family app's later style");
// The teachers' Us (7 Nov 2026): what only staff.tsx reaches is theirs (not prefetched, not in the students' budgets);
// what it shares with the students' later parts (the Us tab, a profile) stays theirs (students fetch it anyway).
const staffJs = Object.keys(famOuts).find((f) => famOuts[f].entryPoint === "src/family/staff.tsx");
if (!staffJs) throw new Error("Build did not produce the family app's teachers' screens (src/family/staff.tsx)");
const studentsLater = new Set(
  Object.keys(famOuts)
    .filter((f) => f.endsWith(".js") && famOuts[f].entryPoint && f !== staffJs && !first.has(f))
    .flatMap((f) => [...staticOf(f)]),
);
const staffOnly = [...staticOf(staffJs)].filter((f) => !first.has(f) && !studentsLater.has(f));
const later = [...Object.keys(famOuts).filter((f) => f.endsWith(".js") && !first.has(f) && !staffOnly.includes(f)), laterCss];
const asset = (f) => `/f/assets/${basename(f)}`;
const preload = [
  ...[...first].filter((f) => f !== famJs).map((f) => `<link rel="modulepreload" href="${asset(f)}">`),
  ...later.map((f) =>
    f === laterCss ? `<link rel="prefetch" href="${asset(f)}" as="style" data-later>` : `<link rel="prefetch" href="${asset(f)}" as="script" crossorigin>`,
  ),
].join("\n");
const famHtml = (await readFile("public/family/index.html", "utf8"))
  .replace("%SPLASH%", () => splashSaying("இன்னும் வருகிறது… இந்த phone இல் data அல்லது Wi-Fi உள்ளதா பார்."))
  .replace("%FONT%", asset(famFont))
  .replace("%CSS%", asset(famCss))
  .replace("%PRELOAD%", () => preload)
  .replace("%JS%", asset(famJs));
await writeFile("dist/f/index.html", famHtml);
await cp("public/family/sw.js", "dist/f/sw.js");
await cp("public/family/family.webmanifest", "dist/family.webmanifest");
const gz = async (f) => gzipSync(await readFile(f)).length;
let wire = (await gz(famCss)) + gzipSync(famHtml).length;
for (const f of first) wire += await gz(f);
let after = 0;
for (const f of later) after += await gz(f);
let staffKb = 0;
for (const f of staffOnly) staffKb += await gz(f);
console.log(
  `Built the family app: ${basename(famJs)} + ${basename(famCss)}, ${(wire / 1024).toFixed(1)} KB over the wire on the first load (budget ${FAMILY_BUDGET_KB} KB), ${(after / 1024).toFixed(1)} KB right after it (budget ${FAMILY_LATER_KB} KB), the teachers' Us ${(staffKb / 1024).toFixed(1)} KB (budget ${FAMILY_STAFF_KB} KB)`,
);
if (staffKb > FAMILY_STAFF_KB * 1024) {
  console.error(`The family app's teachers' screens are ${(staffKb / 1024).toFixed(1)} KB: over their ${FAMILY_STAFF_KB} KB budget.`);
  process.exit(1);
}
if (wire > FAMILY_BUDGET_KB * 1024) {
  console.error(`The family app's first load is ${(wire / 1024).toFixed(1)} KB: over its ${FAMILY_BUDGET_KB} KB budget. Make it lighter before it ships.`);
  process.exit(1);
}
if (after > FAMILY_LATER_KB * 1024) {
  console.error(`The family app's later parts (the level screen, Me) are ${(after / 1024).toFixed(1)} KB: over their ${FAMILY_LATER_KB} KB budget. Make them lighter before they ship.`);
  process.exit(1);
}
