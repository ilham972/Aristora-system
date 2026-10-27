// Builds the phone app into dist/. Run by `npx convex deploy --cmd "npm run build"`,
// which sets CONVEX_URL to the production Convex address.

import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename } from "node:path";

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
