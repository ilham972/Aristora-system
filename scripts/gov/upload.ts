// Put a grade's government books into the app, unit by unit, through the Claude link (convex/lib/gov.ts).
//
//   ARISTORA_LINK_FILE=<a file outside the repo holding the code> tsx scripts/gov/upload.ts <folder> [G8-U06 …]
//
// <folder> is what scripts/gov/split.py wrote: <key>.pdf for each unit and manifest.json. Each book is cut into parts
// the link can carry, sealed, and saved in order; part 0 clears whatever was there and the last part makes the book
// count, so a run that stops halfway leaves that unit with no book rather than half of one. Units already in the app
// with the same sha are left alone, so running it again only sends what is missing or new.
//
// The books are the government's, not his: they are still kept out of the repo (give a folder outside it).
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { GOV_CHUNK } from "../../convex/lib/gov";
import { exchange, type Req } from "../claude-link";

type Row = { key: string; pages: number; bytes: number; sha: string; source: string };

/** How much base64 one exchange carries (one GitHub run): a unit is never split across two. */
const BATCH = Number(process.env.GOV_BATCH ?? 5_000_000);

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64");

function parts(file: string): { n: number; b64: string }[] {
  const bytes = new Uint8Array(readFileSync(file));
  const out: { n: number; b64: string }[] = [];
  for (let at = 0; at < bytes.length; at += GOV_CHUNK) {
    const slice = bytes.subarray(at, Math.min(at + GOV_CHUNK, bytes.length));
    out.push({ n: slice.length, b64: b64(slice) });
  }
  return out;
}

async function main() {
  const folder = process.argv[2];
  if (!folder) throw new Error("usage: upload.ts <folder with the unit PDFs and manifest.json> [unit keys…]");
  const only = new Set(process.argv.slice(3));
  const rows = (JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8")) as Row[]).filter((r) => !only.size || only.has(r.key));
  if (!rows.length) throw new Error("nothing to send");

  // What the app has now: its unit ids, and the books already there.
  const got = await exchange([{ name: "books", fn: "ask", req: { op: "books" } }]);
  if (!got.books?.ok) throw new Error(`the app did not answer: ${got.books?.error ?? "nothing came back"}`);
  const units = new Map<string, { unitId: string; gov: { sha: string } | null }>(got.books.units.map((u: any) => [u.key, { unitId: u.unitId, gov: u.gov }]));

  const todo: Row[] = [];
  for (const r of rows) {
    const u = units.get(r.key);
    if (!u) console.log(`${r.key}: the app has no such unit — skipped`);
    else if (u.gov?.sha === r.sha) console.log(`${r.key}: already in the app (same book)`);
    else todo.push(r);
  }
  if (!todo.length) return console.log("\nEvery book is already in the app.");

  // Whole units packed into batches: one exchange is one run of the carrier.
  const batches: Row[][] = [];
  let batch: Row[] = [];
  let size = 0;
  for (const r of todo) {
    const want = Math.ceil(r.bytes / 3) * 4;
    if (batch.length && size + want > BATCH) {
      batches.push(batch);
      batch = [];
      size = 0;
    }
    batch.push(r);
    size += want;
  }
  if (batch.length) batches.push(batch);
  console.log(`\n${todo.length} books to send, in ${batches.length} run${batches.length === 1 ? "" : "s"}.`);

  let bad = 0;
  for (const [i, group] of batches.entries()) {
    const reqs: Req[] = [];
    for (const r of group) {
      const ps = parts(join(folder, `${r.key}.pdf`));
      ps.forEach((p, k) =>
        reqs.push({
          name: `${r.key}-${k}`,
          fn: "tell",
          req: { op: "gov", unitId: units.get(r.key)!.unitId, part: k, parts: ps.length, n: p.n, b64: p.b64, pages: r.pages, bytes: r.bytes, sha: r.sha, from: r.source },
        }),
      );
    }
    console.log(`\nrun ${i + 1}/${batches.length}: ${group.length} books, ${reqs.length} parts`);
    const answers = await exchange(reqs);
    for (const r of group) {
      const last = answers[`${r.key}-${Math.ceil(r.bytes / GOV_CHUNK) - 1}`];
      const failed = Object.entries(answers).filter(([n, a]) => n.startsWith(`${r.key}-`) && !a.ok);
      if (last?.ok && !failed.length) console.log(`  ${r.key}: ${last.saved.words}`);
      else {
        bad++;
        console.log(`  ${r.key}: NO — ${failed[0]?.[1].error ?? last?.error ?? "no answer"}`);
      }
    }
  }
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(String((e as Error).message ?? e));
    process.exit(2);
  });
}
