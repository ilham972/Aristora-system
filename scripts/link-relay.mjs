// The Claude link's carrier (run by .github/workflows/link.yml on a branch "link-…"; convex/link.ts).
// Each file in link/ask/ is one sealed request: { fn: "ask" | "tell", id, box }. They go to the app one after another,
// in the order of their names, and each answer is written to link/got/ under the same name: { ok: true, box } (sealed)
// or { ok: false, error }. Nothing is opened here (this job has no key) and no box is ever printed.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";

const url = process.env.CONVEX_URL;
if (!url) throw new Error("CONVEX_URL is not set");
const FN = { ask: ["query", "link:ask"], tell: ["mutation", "link:tell"] };

mkdirSync("link/got", { recursive: true });
let names = [];
try {
  names = readdirSync("link/ask").filter((n) => n.endsWith(".json")).sort();
} catch {
  // no requests on this branch
}
let failed = 0;
for (const name of names) {
  let out;
  try {
    const req = JSON.parse(readFileSync(`link/ask/${name}`, "utf8"));
    const fn = FN[req.fn];
    if (!fn || typeof req.id !== "string" || typeof req.box !== "string") throw new Error("not a request");
    let res;
    for (let tries = 0; ; tries++) {
      res = await fetch(`${url}/api/${fn[0]}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: fn[1], args: { id: req.id, box: req.box }, format: "json" }),
      });
      // A read may be asked again; a save never (the app takes each one once).
      if (res.status < 500 || fn[0] !== "query" || tries >= 2) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const body = await res.json().catch(() => null);
    if (body?.status === "success" && typeof body.value?.box === "string") out = { ok: true, box: body.value.box };
    else out = { ok: false, error: String(body?.errorMessage ?? `HTTP ${res.status}`).slice(0, 600) };
  } catch (e) {
    out = { ok: false, error: String(e?.message ?? e).slice(0, 300) };
  }
  if (!out.ok) failed++;
  writeFileSync(`link/got/${name}`, JSON.stringify(out));
  console.log(`${name}: ${out.ok ? `answered (${out.box.length} letters)` : `failed: ${out.error}`}`);
}
writeFileSync("link/got/done.txt", `${names.length} requests, ${failed} failed\n`);
console.log(`${names.length} requests, ${failed} failed`);
