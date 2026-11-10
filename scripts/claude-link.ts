// The chat's side of the Claude link (convex/link.ts; docs/making-changes.md "The Claude link"). Run with tsx:
//
//   ARISTORA_LINK="ARISTORA-LINK name.key" tsx scripts/claude-link.ts <requests.json> <out-dir>
//
// requests.json = [{ "name": "u05", "fn": "ask" | "tell", "req": { "op": "unit", "unitId": "…" } }, …]
// Each request is sealed with the link's key and pushed onto a branch "link-…" of this repo (nothing but the carrier's
// two files and the sealed requests: an orphan commit, pushed over the one before); the GitHub job carries them to the
// app and writes the sealed answers back; this script waits for them, opens them and writes <out-dir>/<name>.json.
// The code comes from the owner (Settings → Books → Claude link) and lives only in the chat: never in a file of the
// repo, never in a commit. What <out-dir> holds is his books' content: keep it outside the repo.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fromB64, seal, unseal } from "../convex/lib/seal";

type Req = { name: string; fn: "ask" | "tell"; req: Record<string, unknown> };

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 }).toString();

function code(): { id: string; key: Uint8Array } {
  const m = /([A-Za-z0-9]{8,24})\.([A-Za-z0-9_-]{43})\s*$/.exec((process.env.ARISTORA_LINK ?? "").trim());
  const key = m ? fromB64(m[2]) : null;
  if (!m || !key || key.length !== 32) throw new Error('ARISTORA_LINK is not a link code ("ARISTORA-LINK name.key").');
  return { id: m[1], key };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [file, outDir] = process.argv.slice(2);
  if (!file || !outDir) throw new Error("usage: claude-link.ts <requests.json> <out-dir>");
  if (resolve(outDir).startsWith(repo + "/")) throw new Error("Keep the answers outside the repo (his books' content).");
  const { id, key } = code();
  const reqs = JSON.parse(readFileSync(file, "utf8")) as Req[];
  const branch = process.env.LINK_BRANCH ?? `link-${randomBytes(4).toString("hex")}`;
  if (!/^link-[a-z0-9-]+$/.test(branch)) throw new Error("LINK_BRANCH must be link-…");

  // An orphan commit: the carrier and the sealed requests, nothing else.
  const work = mkdtempSync(join(tmpdir(), "link-"));
  mkdirSync(join(work, ".github/workflows"), { recursive: true });
  mkdirSync(join(work, "scripts"), { recursive: true });
  mkdirSync(join(work, "link/ask"), { recursive: true });
  cpSync(join(repo, ".github/workflows/link.yml"), join(work, ".github/workflows/link.yml"));
  cpSync(join(repo, "scripts/link-relay.mjs"), join(work, "scripts/link-relay.mjs"));
  writeFileSync(join(work, "vercel.json"), JSON.stringify({ git: { deploymentEnabled: false } }));
  const nonces = new Map<string, string>();
  const t0 = Date.now();
  reqs.forEach((r, i) => {
    const nonce = randomBytes(16);
    // Each request its own time, in order: the app takes a save only when it is newer than the last one it took.
    const box = seal(key, nonce, JSON.stringify({ ...r.req, t: t0 + i }));
    const name = `${String(i + 1).padStart(3, "0")}-${r.name}.json`;
    nonces.set(name, r.name);
    writeFileSync(join(work, "link/ask", name), JSON.stringify({ fn: r.fn, id, box }));
  });
  git(work, "init", "-q", "-b", branch);
  git(work, "add", "-A");
  git(work, "-c", "user.name=claude", "-c", "user.email=noreply@anthropic.com", "commit", "-q", "-m", `${reqs.length} sealed request${reqs.length === 1 ? "" : "s"}`);
  const sent = git(work, "rev-parse", "HEAD").trim();
  const remote = git(repo, "remote", "get-url", "origin").trim();
  for (let tries = 0; ; tries++) {
    try {
      git(work, "push", "-q", "--force", remote, `HEAD:refs/heads/${branch}`);
      break;
    } catch (e) {
      if (tries >= 2) throw e;
      await sleep(4000);
    }
  }
  console.log(`sent ${reqs.length} request${reqs.length === 1 ? "" : "s"} on ${branch} (${sent.slice(0, 7)}); waiting for the answers…`);

  // The answers: a commit on top of ours, with link/got/done.txt.
  const ref = `refs/remotes/origin/${branch}`;
  const until = Date.now() + Number(process.env.LINK_WAIT_MS ?? 8 * 60_000);
  let done = false;
  while (Date.now() < until) {
    await sleep(8000);
    try {
      git(repo, "fetch", "-q", "origin", `+refs/heads/${branch}:${ref}`);
      const head = git(repo, "rev-parse", ref).trim();
      if (head !== sent && git(repo, "ls-tree", "--name-only", ref, "link/got/").includes("done.txt")) {
        done = true;
        break;
      }
    } catch {
      // not there yet
    }
  }
  if (!done) throw new Error(`No answer on ${branch} yet: look at the repo's Actions page ("link"), then run again.`);
  mkdirSync(outDir, { recursive: true });
  let bad = 0;
  for (const [name, short] of nonces) {
    let answer: unknown;
    try {
      const got = JSON.parse(git(repo, "show", `${ref}:link/got/${name}`)) as { ok: boolean; box?: string; error?: string };
      if (!got.ok) answer = { ok: false, error: `the carrier: ${got.error}` };
      else if (!got.box) answer = { ok: false, error: "The app took nothing: the link is off, its 7 days are over, or this is not its code." };
      else {
        const opened = unseal(key, got.box);
        answer = opened ? JSON.parse(opened.words) : { ok: false, error: "An answer this code can't open." };
      }
    } catch (e) {
      answer = { ok: false, error: `no answer file: ${String((e as Error).message).slice(0, 200)}` };
    }
    if (!(answer as { ok?: boolean }).ok) bad++;
    writeFileSync(join(outDir, `${short}.json`), JSON.stringify(answer));
    const a = answer as { ok?: boolean; error?: string };
    console.log(`${short}: ${a.ok ? "ok" : `NO: ${a.error}`}`);
  }
  rmSync(work, { recursive: true, force: true });
  if (existsSync(join(repo, "link"))) console.log("note: a link/ folder is in the repo's working tree: never commit it to main.");
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(String((e as Error).message ?? e));
  process.exit(2);
});
