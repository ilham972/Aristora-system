// The chat's side of the threads link (convex/linkThreads.ts; docs/making-changes.md "Answer the threads"). Run with tsx:
//
//   ARISTORA_LINK_FILE=<a file outside the repo holding the code> tsx scripts/threads.ts pull <out-dir>
//     → <out-dir>/list.json (every open thread), <out-dir>/t/<id>.json (each one whole), <out-dir>/digest.txt (to read)
//   ARISTORA_LINK_FILE=… tsx scripts/threads.ts send <replies.json> <out-dir>
//     → each reply into its thread (one sealed request each, in the file's order); <out-dir>/sent.json
//
// replies.json = [{ "id": "<thread id>", "text": "…", "done": true, "seen": <its msgs, from the digest> }, …]
//   done = the owner's ✓ Understood with it (who said he understood closes; the rest close with their own ✓ tap).
//   seen = the thread's message count when it was read: anyone wrote since, the app refuses that reply (pull again).
// The code is the threads link's (Settings → Community → Claude link for threads: "ARISTORA-THREADS name.key"), kept
// in the chat only. What <out-dir> holds is the students' words and the books' questions: never in the repo.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { exchange, type Req } from "./claude-link";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type Ask = { aid: string; n: string; g?: number; sg: string; rp?: true; su?: true; tu?: true; pw?: true; ph: boolean; ta: number; tw?: number; sw?: number; late?: true; st?: string; got?: number | null; max?: number; parts?: { p: string; ok: boolean | null; typed: string[]; got?: number; m?: number }[]; photo?: { st: string; max: number; photos: number; got?: number; said?: true }; by?: string };
type Line = { id: string; unit: { key: string; grade: number; code: string; en: string; ta: string }; lvl: number; q: number; tname: string; la: number; msgs: number; lt?: string; ln?: string; asks: Ask[] };
type Thread = Line & { ok: boolean; error?: string; html: string | null; key: string | null; max: number | null; kp: { p: string; a: string; m: number | null }[]; talk: { at: number; who: "s" | "t" | "ai"; n: string; t?: string; voice?: number; photos?: number; ask?: true }[] };

/** A printed question in words: sub-questions on their own lines, figures' labels kept, fractions, powers, blanks. */
export function questionWords(h: string): string {
  return h
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, (svg) => {
      const labels = [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/gi)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()).filter(Boolean);
      return ` [figure${labels.length ? `: ${[...new Set(labels)].join(", ")}` : ""}] `;
    })
    .replace(/<img\b[^>]*>/gi, " [picture] ")
    .replace(/<span class="frc"><span class="nu">([\s\S]*?)<\/span><span class="de">([\s\S]*?)<\/span><\/span>/g, " ($1)/($2) ")
    .replace(/<sup>([\s\S]*?)<\/sup>/g, "^$1")
    .replace(/<sub>([\s\S]*?)<\/sub>/g, "_$1")
    .replace(/<span (?:data-fill="\d*" ?)?(?:class="ab[^"]*"|style="display:inline-block;[^"]*border[^"]*")[^>]*>((?:(?!<\/?span)[\s\S])*?)<\/span>/g, (_, x: string) => `[${x.replace(/<[^>]+>/g, "").replace(/&nbsp;|\s/g, "") || "□"}]`)
    .replace(/<div class="pm"[^>]*>[\s\S]*?<\/div>|<span class="pm"[^>]*>[\s\S]*?<\/span>/g, " ")
    .replace(/<(td|th)\b[^>]*>/gi, " | ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d|table)>|<div class="(rp|sq|si|bl|mcq)\b[^"]*"[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l && l !== "|")
    .join("\n");
}

const STAGE: Record<string, string> = { pend: "PENDING", fol: "FOLLOW-UP", und: "UNDERSTOOD", closed: "closed" };
const time = (ms: number) => new Date(ms).toLocaleString("en-GB", { timeZone: "Asia/Colombo", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const stageOf = (a: Ask) =>
  a.st && a.st !== "open"
    ? `closed (${a.st})`
    : `${STAGE[a.sg] ?? a.sg}${a.rp ? " · HE REPLIED" : ""}${a.su ? " · he tapped ✓" : ""}${a.tu ? " · teacher ✓ given" : ""}${a.pw ? " · photo asked" : ""}${a.late ? " · LATE" : ""}`;

/** One thread as a block of plain words for the chat to read. */
export function threadDigest(i: number, t: Thread): string {
  const out: string[] = [];
  const waiting = t.asks.filter((a) => !a.st || a.st === "open");
  out.push(`#${i} ${t.unit.key} · Grade ${t.unit.grade} ${t.unit.code} ${t.unit.ta || t.unit.en} · Level ${t.lvl} · Q${t.q} · teacher ${t.tname} · ${waiting.length} waiting · seen=${t.msgs} · id=${t.id}`);
  for (const a of t.asks) {
    const marks = a.got !== undefined && a.got !== null ? ` · ${a.got}/${a.max ?? "?"}` : "";
    const parts = (a.parts ?? []).map((p) => `(${p.p || "-"}) ${p.ok === true ? "✓" : p.ok === false ? "✗" : "✍"} ${p.typed.length ? p.typed.map((x) => `"${x}"`).join(" ") : "—"}${p.got !== undefined ? ` [${p.got}/${p.m}]` : ""}`);
    const photo = a.photo ? ` · teacher's part photo ${a.photo.st}${a.photo.got !== undefined ? ` ${a.photo.got}/${a.photo.max}` : ""}${a.photo.said ? " (typed words)" : ""}` : "";
    out.push(`  ${a.n}${a.g ? ` (g${a.g})` : ""}: ${stageOf(a)}${marks}${photo}${a.ta ? ` · since ${time(a.ta)}` : ""}`);
    if (parts.length) out.push(`    typed: ${parts.join(" | ")}`);
  }
  out.push(`  QUESTION: ${t.html ? questionWords(t.html).split("\n").join("\n    ") : "(not in the app: the student's book only)"}`);
  out.push(`  KEY (${t.max ?? "?"} marks): ${t.kp.length ? t.kp.map((k) => `(${k.p || "-"}) ${k.a}${k.m !== null ? ` [${k.m}]` : ""}`).join(" | ") : (t.key ?? "none")}`);
  // The key's own words when they say more than its parts (the working, a model answer).
  const whole = (t.key ?? "").replace(/\n/g, " / ");
  if (whole && t.kp.length && whole !== t.kp.map((k) => `(${k.p}) ${k.a}`).join(" / ")) out.push(`  KEY WHOLE: ${whole.slice(0, 1200)}`);
  out.push("  TALK:");
  for (const m of t.talk) {
    const said = [m.t ? m.t.replace(/\n/g, " ⏎ ") : "", m.voice ? `🎤 voice ${m.voice}s` : "", m.photos ? `📷×${m.photos}` : "", m.ask ? "(came in with this)" : ""].filter(Boolean).join(" ");
    out.push(`    [${m.who}] ${m.n} ${time(m.at)}: ${said || "…"}`);
  }
  return out.join("\n");
}

function outside(dir: string) {
  if (resolve(dir).startsWith(repo + "/")) throw new Error("Keep the threads outside the repo (the students' words).");
}

async function pull(outDir: string) {
  outside(outDir);
  mkdirSync(join(outDir, "t"), { recursive: true });
  const first = await exchange([{ name: "list", fn: "ask", req: { op: "threads" } }]);
  const list = first.list as { ok: boolean; error?: string; now: number; threads: Line[] };
  if (!list.ok) throw new Error(`threads: ${list.error}`);
  writeFileSync(join(outDir, "list.json"), JSON.stringify(list, null, 1));
  const count = (sg: string) => list.threads.filter((t) => t.asks.some((a) => a.sg === sg)).length;
  console.log(`${list.threads.length} open threads: ${count("pend")} with someone Pending, ${list.threads.filter((t) => t.asks.some((a) => a.rp)).length} with a reply waiting, ${count("fol")} Follow-up, ${count("und")} Understood`);
  if (!list.threads.length) return;
  const reqs: Req[] = list.threads.map((t, i) => ({ name: `t${i + 1}`, fn: "ask", req: { op: "thread", id: t.id } }));
  const got = await exchange(reqs);
  const blocks: string[] = [];
  list.threads.forEach((l, i) => {
    const t = got[`t${i + 1}`] as Thread;
    if (!t?.ok) {
      blocks.push(`#${i + 1} ${l.unit.key} Q${l.q} id=${l.id}: NOT READ (${t?.error})`);
      return;
    }
    writeFileSync(join(outDir, "t", `${l.id}.json`), JSON.stringify(t, null, 1));
    blocks.push(threadDigest(i + 1, t));
  });
  writeFileSync(join(outDir, "digest.txt"), blocks.join("\n\n") + "\n");
  console.log(`digest: ${join(outDir, "digest.txt")}`);
}

type Reply = { id: string; text: string; done?: boolean; seen?: number };

async function send(file: string, outDir: string) {
  outside(outDir);
  const replies = JSON.parse(readFileSync(file, "utf8")) as Reply[];
  if (!replies.length) return;
  const reqs: Req[] = replies.map((r, i) => ({ name: `r${i + 1}`, fn: "tell", req: { op: "reply", id: r.id, text: r.text, done: r.done === true, ...(typeof r.seen === "number" ? { seen: r.seen } : {}) } }));
  const got = await exchange(reqs);
  mkdirSync(outDir, { recursive: true });
  const rows = replies.map((r, i) => ({ id: r.id, ...got[`r${i + 1}`] }));
  writeFileSync(join(outDir, "sent.json"), JSON.stringify(rows, null, 1));
  let bad = 0;
  for (const r of rows) {
    if (!r.ok) bad++;
    console.log(r.ok ? `Q${r.q} ${r.id}: sent · closed ${r.closed} · waiting ${r.waiting}` : `${r.id}: NO: ${r.error}`);
  }
  console.log(`${rows.length - bad} sent, ${bad} refused`);
  if (bad) process.exitCode = 1;
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === "pull" && a) return await pull(a);
  if (cmd === "send" && a && b) return await send(a, b);
  throw new Error("usage: threads.ts pull <out-dir> | send <replies.json> <out-dir>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(String((e as Error).message ?? e));
    process.exit(2);
  });
}
