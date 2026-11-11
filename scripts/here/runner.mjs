// Runs one of the repo's test files in a chat that can't install npm packages (docs/making-changes.md, "No packages
// here"): esbuild (from /opt/npm-tools) bundles it with the libraries' source (scripts/here/setup.sh clones them) and a
// small vitest stand-in. From the repo: node scripts/here/runner.mjs tests/money.test.ts ["name part"]
// A run-through: TZ=Asia/Colombo NODE_PATH=/opt/npm-tools/node_modules node scripts/here/runner.mjs tests/e2e/class.e2e.ts "Fees and books"
import { createRequire } from "node:module";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire("/opt/npm-tools/node_modules/");
const esbuild = require("esbuild");
const HERE = process.env.HERE ?? "/home/claude/runner"; // the libraries' source (src/), the bundles (out/), the stubs
const S = `${HERE}/src`;
const MINE = dirname(fileURLToPath(import.meta.url));
const REPO = process.cwd();
const file = resolve(process.argv[2]);
const filter = process.argv[3] ?? "";

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else if (/\.(ts|js)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}
const convexFiles = await walk(join(REPO, "convex"));

const alias = {
  vitest: `${MINE}/vitest-standin.mjs`,
  "convex-test": `${S}/convex-test/index.ts`,
  "convex/server": `${S}/convex-js/src/server/index.ts`,
  "convex/values": `${S}/convex-js/src/values/index.ts`,
  "convex/browser": `${S}/convex-js/src/browser/index.ts`,
  preact: `${S}/preact/src/index.js`,
  "preact/hooks": `${S}/preact/hooks/src/index.js`,
  "preact/jsx-runtime": `${S}/preact/jsx-runtime/src/index.js`,
  fflate: `${S}/fflate/src/index.ts`,
  "web-push": `${HERE}/stubs/web-push.mjs`,
};

const plugin = {
  name: "from-source",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (a) => {
      if (alias[a.path]) return { path: alias[a.path] };
      if (a.path.endsWith("?raw")) return { path: resolve(a.resolveDir, a.path.slice(0, -4)), namespace: "raw" };
      return null;
    });
    build.onLoad({ filter: /.*/, namespace: "raw" }, async (a) => ({ contents: await readFile(a.path, "utf8"), loader: "text" }));
    // import.meta.glob("../convex/**/*.ts") → a map of () => import(...); with eager + ?raw → the files' text.
    build.onLoad({ filter: /tests\/.*\.ts$/ }, async (a) => {
      let src = await readFile(a.path, "utf8");
      if (!src.includes("import.meta.glob")) return null;
      const dir = dirname(a.path);
      const pre = [];
      let n = 0;
      src = src.replace(/import\.meta\.glob\(\s*"((?:\.\.\/)+)convex\/(\*\*\/)?\*\.ts"\s*(,\s*\{[^}]*\})?\s*\)/g, (_m, up, deep, opts) => {
        const base = resolve(dir, up, "convex");
        const list = convexFiles.filter((f) => (deep ? true : dirname(f) === base)).filter((f) => f.endsWith(".ts") || deep);
        if (opts && /raw/.test(opts)) {
          const names = list.map((f) => {
            const v = `__raw${n++}`;
            pre.push(`import ${v} from ${JSON.stringify(`${f}?raw`)};`);
            return `${JSON.stringify(`${up}convex/${relative(base, f)}`)}: ${v}`;
          });
          return `{${names.join(",")}}`;
        }
        return `{${list.map((f) => `${JSON.stringify(`${up}convex/${relative(base, f)}`)}: () => import(${JSON.stringify(f)})`).join(",")}}`;
      });
      return { contents: pre.join("\n") + src, loader: "ts", resolveDir: dir };
    });
  },
};

await mkdir(`${HERE}/out`, { recursive: true });
await mkdir(`${HERE}/stubs`, { recursive: true });
await writeFile(`${HERE}/stubs/web-push.mjs`, "export default { setVapidDetails() {}, sendNotification: async () => ({}), generateVAPIDKeys: () => ({ publicKey: 'p', privateKey: 'k' }) };\n");
const name = relative(REPO, file).replace(/[^\w]+/g, "_");
const entry = `${HERE}/out/${name}.entry.mjs`;
await writeFile(entry, `import { __run } from ${JSON.stringify(alias.vitest)};\nimport ${JSON.stringify(file)};\nconst n = await __run(${JSON.stringify(filter)});\nprocess.exit(n ? 1 : 0);\n`);
const outfile = `${HERE}/out/${name}.mjs`;
const t0 = Date.now();
await esbuild.build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  jsx: "automatic",
  jsxImportSource: "preact",
  plugins: [plugin],
  logLevel: "error",
  sourcemap: "inline",
  external: ["playwright"],
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  define: { "import.meta.vitest": "undefined" },
});
console.log(`bundled ${relative(REPO, file)} in ${Date.now() - t0} ms`);
if (/e2e/.test(file)) {
  // The run-throughs: Playwright from /opt/npm-tools with this machine's Chrome.
  const pw = require("playwright");
  const launch = pw.chromium.launch.bind(pw.chromium);
  pw.chromium.launch = (o = {}) => launch({ ...o, executablePath: "/usr/bin/google-chrome", args: [...(o.args ?? []), "--no-sandbox"] });
}
await import(pathToFileURL(outfile).href);
