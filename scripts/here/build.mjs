// Builds dist/ in a chat that can't install npm packages: the repo's own scripts/build.mjs, with esbuild from
// /opt/npm-tools and the libraries taken from source (scripts/here/setup.sh clones them); the fonts and the silent
// video are stubs. From the repo: CONVEX_URL=https://qualified-fish-602.convex.cloud node scripts/here/build.mjs
// (The family app's size budgets are GitHub's to judge: source builds differ by a little.)
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const HERE = process.env.HERE ?? "/home/claude/runner";
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const src = await readFile(`${REPO}/scripts/build.mjs`, "utf8");
const head = `
import { createRequire as __cr } from "node:module";
const __req = __cr("/opt/npm-tools/node_modules/");
const __esbuild = __req("esbuild");
const __S = ${JSON.stringify(HERE)} + "/src";
const __alias = {
  preact: __S + "/preact/src/index.js",
  "preact/hooks": __S + "/preact/hooks/src/index.js",
  "preact/jsx-runtime": __S + "/preact/jsx-runtime/src/index.js",
  "convex/browser": __S + "/convex-js/src/browser/index.ts",
  "convex/server": __S + "/convex-js/src/server/index.ts",
  "convex/values": __S + "/convex-js/src/values/index.ts",
  fflate: __S + "/fflate/src/index.ts",
  "nosleep.js/src/media.js": ${JSON.stringify(HERE)} + "/stubs/nosleep-media.mjs",
};
const __plugin = {
  name: "from-source",
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      if (__alias[a.path]) return { path: __alias[a.path] };
      if (a.path.startsWith("@fontsource/")) return { path: ${JSON.stringify(HERE)} + "/stubs/empty.css" };
      return null;
    });
  },
};
const build = (o) => __esbuild.build({ ...o, plugins: [...(o.plugins ?? []), __plugin] });
`;
if (!src.includes('import { build } from "esbuild";')) throw new Error("build.mjs changed: its esbuild import is not where it was");
await mkdir(`${HERE}/stubs`, { recursive: true });
await writeFile(`${HERE}/stubs/nosleep-media.mjs`, 'const media = { webm: "data:video/webm;base64,", mp4: "data:video/mp4;base64," };\nexport default media;\n');
await writeFile(`${HERE}/stubs/empty.css`, "/* the fonts are not installed here */\n");
// The real script reads and writes from the repo's folder (src/, public/, dist/): run its copy from there.
const copy = `${HERE}/build-here.mjs`;
await writeFile(copy, src.replace('import { build } from "esbuild";', head));
process.chdir(REPO);
await import(pathToFileURL(copy).href);
