// The AI check (14 Nov 2026, his ask: "put the AI icon near the document icon ... that will correct the question and
// if the student lost marks then a thread will open to explain, the AI will explain in Tamil"). Pure rules, no
// database: the prompt, what goes to the model, and reading what comes back. The calls are in convex/ai.ts.
// - The model: Claude Haiku 5.5 (`claude-haiku-5-5`), the cheapest Claude that reads photos, ≈ $0.10 / $0.50 per
//   million tokens in / out: one check (a photo ≈ 1,600 tokens, the question and key ≈ 1,500, the reply ≈ 600) costs
//   about $0.0006, under 0.2 rupees. The Convex variable AI_MODEL changes it without a deploy.
// - Never the source of truth: the corrector sees the AI's marks and taps "Use these marks" (or her own).

import type { KeyAnswer } from "./key";

export const AI_MODEL_DEFAULT = "claude-haiku-5-5";
/** Checks and questions a day for the whole centre (each ≈ 0.2 rupees: the most a day ≈ 100 rupees). */
export const AI_DAY_MAX = 500;
/** Questions asked in one thread after the check. */
export const AI_ASKS_MAX = 8;
/** One question typed in the thread. */
export const AI_TEXT_MAX = 400;
/** The thread and its photo are kept this long, then go (the nightly sweep). */
export const AI_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
/** A check still "working" after this = failed (the model never answered). */
export const AI_STUCK_MS = 3 * 60 * 1000;
/** The question's HTML sent to the model, at most. */
export const AI_HTML_MAX = 8000;

export const AI_SYSTEM = `You help the correctors of ARISTORA, a Tamil-medium maths tuition centre in Sri Lanka (Grades 6-11, building to the O/L exam).
A corrector photographed one student's written answer to ONE workbook question. You get the question (as HTML from the book), its answer key and the photo.

Mark it like a fair Sri Lankan O/L examiner:
- Full marks when his final answer equals the key in any equivalent form (2/4 = 1/2 = 0.5, units written or not).
- Part marks for correct method when the final answer is wrong, only up to the question's marks.
- A part he left empty gets 0.
- If the photo is unreadable, is not this question, or you are not sure, set "sure" to "low" and say why.

Reply with ONLY one JSON object, nothing before or after it:
{"read": "what he wrote, short, in English", "parts": [{"p": "i", "got": 1, "max": 2}], "got": 3, "max": 5, "sure": "high", "ta": "..."}
- "parts": one item per part of the key, in its order, with the key's part names; [] when the key has no parts.
- "got": the total; "max": the question's marks.
- "ta": in simple spoken Tamil (Tamil script; numbers, letters and symbols as in maths), for the student:
  if he lost marks: where he went wrong, then the right way step by step, then the right answer, at most 120 words;
  if full marks: one short line of praise.`;

export const AI_FOLLOW = `Now the corrector or the student asks about this question. Answer in simple spoken Tamil (Tamil script; maths in numbers and symbols), short (at most 100 words), plain text, no JSON, no markdown.`;

/** The question's HTML made small for the model: no styles, scripts, drawings or attributes but a class. */
export function questionText(html: string): string {
  const s = html
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " [figure] ")
    .replace(/<img\b[^>]*>/gi, " [figure] ")
    .replace(/<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi, (_m, sl: string, tag: string, attrs: string) => {
      if (sl) return `</${tag}>`;
      const c = /\sclass="([^"]*)"/i.exec(attrs);
      return c ? `<${tag} class="${c[1]}">` : `<${tag}>`;
    })
    .replace(/<(span|div)>\s*<\/\1>/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > AI_HTML_MAX ? `${s.slice(0, AI_HTML_MAX)} …` : s;
}

/** The key's answer for one question, in words the model reads. */
export function keyText(k: KeyAnswer | null | undefined): string {
  if (!k) return "No answer key for this question: work it out yourself.";
  if (k.parts?.length) return k.parts.map((p) => `(${p.p}) ${p.a}${p.m !== undefined ? ` [${p.m} mark${p.m === 1 ? "" : "s"}]` : ""}`).join("\n");
  return k.a ?? "No answer key for this question: work it out yourself.";
}

/** The first message: the question, its key, its marks (the photo goes before it). */
export function checkPrompt(q: number, html: string | null, k: KeyAnswer | null | undefined, max: number): string {
  return [
    `Question ${q} (${max} mark${max === 1 ? "" : "s"}).`,
    html ? `The question:\n${questionText(html)}` : "The question's text isn't in the app: read it from the photo if you can.",
    `The answer key:\n${keyText(k)}`,
    "Mark the student's answer in the photo. Reply with the JSON only.",
  ].join("\n\n");
}

export type AiPart = { p: string; got: number; max: number };
export type AiVerdict = { read: string; parts: AiPart[]; got: number; max: number; sure: "high" | "low"; ta: string };

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
const clamp = (n: number, hi: number) => Math.max(0, Math.min(hi, Math.round(n)));

/**
 * What the model said, made safe: marks whole numbers between 0 and the question's (never the model's own max), the
 * parts matched to the key's parts by name (a part it didn't give = null: the corrector decides), the total = the
 * parts' sum when there are parts. null = not a verdict (the thread says so).
 */
export function readVerdict(text: string, max: number, keyParts: { p: string; m: number }[] | null): AiVerdict | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text.slice(a, b + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const ta = typeof j.ta === "string" ? j.ta.trim() : "";
  const read = typeof j.read === "string" ? j.read.trim().slice(0, 300) : "";
  const sure = j.sure === "low" ? "low" : "high";
  let parts: AiPart[] = [];
  let got: number | null;
  if (keyParts?.length) {
    const said = Array.isArray(j.parts) ? (j.parts as Record<string, unknown>[]) : [];
    const norm = (s: unknown) => String(s ?? "").replace(/[()\s.]/g, "").toLowerCase();
    parts = keyParts.map((kp, i) => {
      const hit = said.find((x) => norm(x?.p) === norm(kp.p)) ?? (said.length === keyParts.length ? said[i] : undefined);
      const g = num(hit?.got);
      return { p: kp.p, got: g === null ? -1 : clamp(g, kp.m), max: kp.m };
    });
    if (parts.some((p) => p.got < 0)) return null;
    got = parts.reduce((s, p) => s + p.got, 0);
  } else {
    got = num(j.got);
  }
  if (got === null || !ta) return null;
  return { read, parts, got: clamp(got, max), max, sure, ta: ta.slice(0, 2000) };
}

/** The model's words for a question in the thread: plain text, no markdown stars or hashes, not too long. */
export function cleanReply(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#+\s*/gm, "")
    .trim()
    .slice(0, 2000);
}

/** Base64 of a file's bytes (Convex's own runtime has no Buffer). */
export function base64Of(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** What the model's error means for the corrector. */
export function failWords(status: number, body: string): string {
  if (status === 401 || status === 403) return "The AI key is wrong or switched off. The owner checks ANTHROPIC_API_KEY in Convex.";
  if (status === 400 && /credit|billing|balance/i.test(body)) return "The AI account has no credit left. The owner adds credit at console.anthropic.com.";
  if (status === 429 || status === 529 || status >= 500) return "The AI is busy right now. Try again in a minute.";
  return `The AI didn't answer (${status}). Try again.`;
}

/** The key's parts that carry marks adding up to the question's (as Correction's card shows them), else null. */
export function aiParts(k: KeyAnswer | null | undefined, max: number): { p: string; m: number }[] | null {
  const parts = k?.parts;
  if (!parts || parts.length < 2) return null;
  if (!parts.every((p) => typeof p.m === "number" && Number.isInteger(p.m) && p.m >= 0)) return null;
  return parts.reduce((a, p) => a + (p.m ?? 0), 0) === max ? parts.map((p) => ({ p: p.p, m: p.m! })) : null;
}
