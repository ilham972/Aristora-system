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
  .replace("%CSS%", `/assets/${basename(css)}`)
  .replace("%JS%", `/assets/${basename(js)}`);
await writeFile("dist/index.html", html);
await cp("public/static", "dist", { recursive: true });

const kb = (f) => Math.round(result.metafile.outputs[f].bytes / 1024);
console.log(`Built dist/ for ${url}: ${basename(js)} ${kb(js)} KB, ${basename(css)} ${kb(css)} KB`);

// ---- The family app (app.aristora.org; also /f/ here): its own small bundle, nothing of the teachers' app. ----
// Students open it on any phone and any signal: it must stay light. Over the budget, the build stops.
const FAMILY_BUDGET_KB = 50;
await mkdir("dist/f/assets", { recursive: true });
const fam = await build({
  entryPoints: { fam: "src/family/main.tsx" },
  bundle: true,
  minify: true,
  format: "esm",
  target: ["es2020"],
  outdir: "dist/f/assets",
  entryNames: "[name]-[hash]",
  assetNames: "[name]-[hash]",
  jsx: "automatic",
  jsxImportSource: "preact",
  define: { __CONVEX_URL__: JSON.stringify(url.replace(/\/$/, "")) },
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
});
const famOut = Object.keys(fam.metafile.outputs);
const famJs = famOut.find((f) => f.endsWith(".js"));
const famCss = famOut.find((f) => f.endsWith(".css"));
if (!famJs || !famCss) throw new Error("Build did not produce the family app's JS and CSS");
const famHtml = (await readFile("public/family/index.html", "utf8"))
  .replace("%CSS%", `/f/assets/${basename(famCss)}`)
  .replace("%JS%", `/f/assets/${basename(famJs)}`);
await writeFile("dist/f/index.html", famHtml);
await cp("public/family/sw.js", "dist/sw.js");
await cp("public/family/sw.js", "dist/f/sw.js");
await cp("public/family/family.webmanifest", "dist/family.webmanifest");
const gz = async (f) => gzipSync(await readFile(f)).length;
const wire = (await gz(famJs)) + (await gz(famCss)) + gzipSync(famHtml).length;
console.log(`Built the family app: ${basename(famJs)} + ${basename(famCss)}, ${(wire / 1024).toFixed(1)} KB over the wire (budget ${FAMILY_BUDGET_KB} KB)`);
if (wire > FAMILY_BUDGET_KB * 1024) {
  console.error(`The family app is ${(wire / 1024).toFixed(1)} KB: over its ${FAMILY_BUDGET_KB} KB budget. Make it lighter before it ships.`);
  process.exit(1);
}
