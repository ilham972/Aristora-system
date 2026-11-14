// The AI check (14 Nov 2026, his ask: "put the AI icon near the document icon ... that will correct the question and
// if the student lost marks then a thread will open to explain, the AI will explain in Tamil"). Pure rules, no
// database: the prompt, what goes to the model, and reading what comes back. The calls are in convex/ai.ts.
// - The model (his ask the same night: "a little bit higher model, not very higher ... explaining too much but not
//   clearly ... sometimes in English"): Claude Sonnet 5.5 (`claude-sonnet-5-5`, $2 / $10 per million tokens in / out,
//   20 times Haiku 5.5): one check (photos ≈ 1,600 tokens each, the question and key ≈ 2,000–4,000, the reply ≈ 1,500)
//   ≈ $0.02–0.035, 6–10 rupees; a question in the thread (no photos again) ≈ 2–3 rupees. The Convex variable AI_MODEL
//   changes it without a deploy (claude-haiku-5-5 = the cheap one).
// - Never the source of truth: the corrector sees the AI's marks and taps "Use" (or her own).

import type { KeyAnswer } from "./key";

export const AI_MODEL_DEFAULT = "claude-sonnet-5-5";
/** Checks and questions a day for the whole centre (a check ≈ 6–10 rupees: the most a day ≈ 1,500–2,000 rupees). */
export const AI_DAY_MAX = 200;
/** Questions asked in one thread after the check (the corrector's and the student's together). */
export const AI_ASKS_MAX = 10;
/** One question typed in the thread. */
export const AI_TEXT_MAX = 400;
/** The thread and its photo are kept this long, then go (the nightly sweep). */
export const AI_KEEP_MS = 3 * 24 * 60 * 60 * 1000;
/** A check still "working" after this = failed (the model never answered). */
export const AI_STUCK_MS = 3 * 60 * 1000;
/** The question's HTML sent to the model, at most. */
export const AI_HTML_MAX = 12000;

/** How the AI talks to a student (his rules, 14 Nov 2026): Tamil only, short, clear, intuitive, for Grades 6–11. */
const HOW_TO_TALK = `How you talk to the student (these rules matter as much as the marks):
- ONLY Tamil, in Tamil script. Never write an English sentence or English words, even if he wrote in English or Thanglish. Use the Tamil maths words of Sri Lankan school books (கோணம், வட்டம், மையம், பரிதி, நாண், ஆரை, முக்கோணம், சமன்பாடு, பின்னம் ...). Numbers, letters (A, B, x, y) and symbols (°, =, +, ×, ∠, △) are fine.
- He is a school student (his grade is given). Talk like a kind, clever elder brother or sister: simple everyday words, short sentences, no long paragraphs.
- Be clear before being complete: the one idea he missed matters more than everything you know.
- Make it intuitive: help him SEE why, with a picture in words or a small everyday example (a pizza cut in slices, a clock's hands, steps on a ladder, sharing sweets), then the rule.
- Shape: one line on what he did right; one line on the mistake; then 2 to 4 short numbered steps to the right answer; the answer. At most 90 words. No headings, no stars, no bullet symbols.
- Never just repeat the key or the theorem's name: show why it is true in this question.`;

export const AI_SYSTEM = `You are the senior maths examiner and the kindest teacher of ARISTORA, a Tamil-medium maths tuition centre in Sri Lanka (Grades 6-11, building to the O/L exam). You mark ONE workbook question of one student, like a fair, careful Sri Lankan O/L examiner, and you explain his mistake so he understands it.

The phone marks number answers by itself. What comes to you is what it can't mark:
- sentences, reasons and proofs he TYPED on his phone, in Tamil, English or Thanglish (Tamil written in English letters), often short and informal;
- PHOTOS of his paper: drawings, scale diagrams, constructions, graphs, or his written working.

Work in this order, every time (the mark tool's fields follow it):
1. Read the question (HTML from the book) and understand exactly what each part asks: the given facts, what must be found, shown or drawn.
2. Read the answer key. It is a model answer, not the only right one: any other correct method, wording or order earns the same marks. For a proof, the key's steps are one valid chain; his chain may differ.
3. Read his answer for each part: what he typed (as it is, any language) and what the photos show.
4. Decide each part's marks from the question's meaning, not by matching words: is the mathematics right? A reason needs the right fact or theorem (in any words: "மையக் கோணம் பரிதிக் கோணத்தின் இரு மடங்கு", "centre angle is double", "center angle 2 times" are the same reason). A proof needs each step to follow, with its reason. A drawing or construction needs the right measures, arcs and labels the question asks for (allow small drawing errors of a millimetre or a degree).
5. Be fair: never give marks for words that only copy the question; never take marks for spelling, language or informal style. A part he left empty gets 0. If you can't read a photo or are not sure, say so ("sure": "low") and mark what you can see.

PARTS THE PHONE MARKED ALREADY: when his answer says a part was marked by the phone, that part is done: give it exactly the phone's marks and don't explain it. Mark and explain ONLY the parts left to you ("yours to mark"). When no part is marked "yours to mark", mark them all.

Then write "ta" for the student: if he lost marks, explain the parts where he lost them; if he got full marks, one short line of praise in Tamil.

${HOW_TO_TALK}

Always answer by calling the mark tool, once.`;

/** Before a question in the thread: who asks, and how to answer. */
export function followWords(from: "t" | "s"): string {
  return `${from === "s" ? "The student himself asks you, in his thread on his phone" : "The corrector asks you (the student may be beside her)"}. Answer the question he asks, about this question only, as his teacher.

${HOW_TO_TALK.replace("At most 90 words.", "At most 80 words.")}
Plain text only, no JSON, no markdown. If he asks something that isn't about this question or maths, gently bring him back to it in one line.`;
}

/** The tool the model must call: its fields in the order of the work (understand, compare, decide, explain). */
export const MARK_TOOL = {
  name: "mark",
  // Strict: every call matches the schema. Not forced (15 Nov 2026: Sonnet 5.5 refuses a forced tool_choice with a 400;
  // the prompt asks for the tool, and JSON in its words is read too).
  strict: true,
  description: "Give the marks for the student's answer to this question, part by part, and the Tamil explanation for him.",
  input_schema: {
    type: "object",
    properties: {
      asks: { type: "string", description: "What the question asks, in one or two short English sentences." },
      parts: {
        type: "array",
        description: "One item per part of the answer key, in its order, with the key's part names. One item with p \"\" when the key has no parts.",
        items: {
          type: "object",
          properties: {
            p: { type: "string", description: "The part's name as in the key (i, ii, a, ...), or \"\"." },
            his: { type: "string", description: "What he wrote, typed or drew for this part, short (in his own words and language)." },
            check: { type: "string", description: "Your reasoning in English: what the part needs, what the key says, whether his answer is mathematically right and why." },
            got: { type: "integer", description: "His marks for this part." },
            max: { type: "integer", description: "This part's marks." },
          },
          required: ["p", "his", "check", "got", "max"],
          additionalProperties: false,
        },
      },
      got: { type: "integer", description: "His total marks." },
      max: { type: "integer", description: "The question's marks." },
      sure: { type: "string", enum: ["high", "low"], description: "low = a photo you can't read, or you are not sure." },
      ta: { type: "string", description: "For the student: ONLY Tamil (Tamil script), at most 90 words, intuitive, the shape and rules given." },
    },
    required: ["asks", "parts", "got", "max", "sure", "ta"],
    additionalProperties: false,
  },
} as const;

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
export function checkPrompt(q: number, html: string | null, k: KeyAnswer | null | undefined, max: number, said?: string | null, photos = 1, grade?: number | null): string {
  const his = [
    photos > 0 ? `${photos > 1 ? `${photos} photos` : "The photo"} of his paper (above).` : "",
    said ? `What he typed on his phone at home, and what the phone did with it:\n${said}` : "",
  ].filter(Boolean);
  return [
    `Question ${q} (${max} mark${max === 1 ? "" : "s"}).${grade ? ` He is in Grade ${grade > 11 ? "11 (O/L)" : grade}.` : ""}`,
    html ? `1. The question (HTML from the book):\n${questionText(html)}` : "1. The question's text isn't in the app: read it from the photo if you can.",
    `2. The answer key (a model answer; other correct ways earn the same marks):\n${keyText(k)}`,
    `3. His answer:\n${his.join("\n") || "Nothing."}`,
    "Mark it: call the mark tool.",
  ].join("\n\n");
}

/** What he typed, sent with a check from the ⌂ lane, at most. */
export const AI_SAID_MAX = 4000;

export type AiPart = { p: string; got: number; max: number; his?: string; check?: string };
export type AiVerdict = { read: string; parts: AiPart[]; got: number; max: number; sure: "high" | "low"; ta: string; partsOk: boolean };

const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
const clamp = (n: number, hi: number) => Math.max(0, Math.min(hi, Math.round(n)));
const str = (x: unknown, max: number) => (typeof x === "string" ? x.trim().slice(0, max) : "");

/**
 * What the model gave (the mark tool's input, or JSON in its words), made safe: marks whole numbers between 0 and the
 * question's (never the model's own max), the parts matched to the key's parts by name (else by place); the total =
 * the parts' sum when they all match. A part it didn't give = `partsOk` false: its total alone (the corrector taps the
 * parts). null = no marks or no Tamil at all.
 */
export function readVerdict(said: unknown, max: number, keyParts: { p: string; m: number }[] | null): AiVerdict | null {
  let j: Record<string, unknown> | null = null;
  if (said && typeof said === "object") j = said as Record<string, unknown>;
  else if (typeof said === "string") {
    const a = said.indexOf("{");
    const b = said.lastIndexOf("}");
    if (a >= 0 && b > a) {
      try {
        j = JSON.parse(said.slice(a, b + 1)) as Record<string, unknown>;
      } catch {
        j = null;
      }
    }
  }
  if (!j) return null;
  const ta = str(j.ta, 3000);
  const sure = j.sure === "low" ? "low" : "high";
  const said2 = Array.isArray(j.parts) ? (j.parts as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : [];
  const read = str(j.read, 300) || said2.map((x) => str(x.his, 200)).filter(Boolean).join(" · ").slice(0, 400);
  let parts: AiPart[] = [];
  let partsOk = false;
  let got = num(j.got);
  if (keyParts?.length) {
    const norm = (v: unknown) => String(v ?? "").replace(/[()\s.]/g, "").toLowerCase();
    parts = keyParts.map((kp, i) => {
      const hit = said2.find((x) => norm(x.p) === norm(kp.p)) ?? (said2.length === keyParts.length ? said2[i] : undefined);
      const g = num(hit?.got);
      return { p: kp.p, got: g === null ? -1 : clamp(g, kp.m), max: kp.m, his: str(hit?.his, 300), check: str(hit?.check, 600) };
    });
    partsOk = parts.every((p) => p.got >= 0);
    if (partsOk) got = parts.reduce((a, p) => a + p.got, 0);
  }
  if (!partsOk) {
    // No key parts to match (or one missing): the model's own parts, to read only (the corrector taps the marks).
    parts = said2.slice(0, 20).map((x) => {
      const m = clamp(num(x.max) ?? max, max);
      return { p: str(x.p, 20), got: clamp(num(x.got) ?? 0, m), max: m, his: str(x.his, 300), check: str(x.check, 600) };
    });
  }
  if (got === null || !ta) return null;
  return { read, parts, got: clamp(got, max), max, sure, ta, partsOk };
}

/** The verdict in words, standing for the model's first answer when the thread goes on (no tool there). */
export function verdictWords(v: { got: number; max: number; parts: AiPart[]; ta: string }): string {
  const parts = v.parts.map((p) => `(${p.p}) ${p.got}/${p.max}${p.check ? `: ${p.check}` : ""}`).join("\n");
  return `I marked it ${v.got}/${v.max}.${parts ? `\n${parts}` : ""}\nMy explanation to him: ${v.ta}`;
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
  return `The AI didn't answer (${status}${apiWords(body) ? `: ${apiWords(body)}` : ""}). Try again, or send this to the owner.`;
}

/** The API's own words for an error (its error.message), short. */
export function apiWords(body: string): string {
  try {
    const m = (JSON.parse(body) as { error?: { message?: string } }).error?.message;
    return typeof m === "string" ? m.slice(0, 200) : "";
  } catch {
    return "";
  }
}

/** The request's settings for a model: Sonnet 5.5 thinks by itself (adaptive): medium effort keeps it quick and cheap. */
export function modelSettings(model: string, first: boolean): Record<string, unknown> {
  const thinks = /sonnet-5-5|opus-5/.test(model);
  return {
    // Its thinking counts in max_tokens: room for it and for the Tamil words.
    max_tokens: thinks ? (first ? 16000 : 6000) : first ? 6000 : 2000,
    ...(thinks ? { output_config: { effort: "medium" } } : {}),
    ...(first ? { tools: [MARK_TOOL], tool_choice: { type: "auto" } } : {}),
  };
}

/** The key's parts that carry marks adding up to the question's (as Correction's card shows them), else null. */
export function aiParts(k: KeyAnswer | null | undefined, max: number): { p: string; m: number }[] | null {
  const parts = k?.parts;
  if (!parts || parts.length < 2) return null;
  if (!parts.every((p) => typeof p.m === "number" && Number.isInteger(p.m) && p.m >= 0)) return null;
  return parts.reduce((a, p) => a + (p.m ?? 0), 0) === max ? parts.map((p) => ({ p: p.p, m: p.m! })) : null;
}

/**
 * What he sent from home, part by part, for the AI check from the ⌂ lane: each part's marks, the key, what he typed,
 * what the phone did with it (marked it right / wrong, or left it to the teacher), and his reasons and typed words in
 * full (any language).
 */
export function saidWords(it: {
  parts: { p: string; m?: number; key?: string; phone?: number | null; typed: string[]; ok: boolean[] | null }[];
  reasons: { p: string; yes: string; text: string }[];
}): string {
  const lines: string[] = [];
  for (const p of it.parts) {
    const bits: string[] = [];
    if (p.m !== undefined) bits.push(`${p.m} mark${p.m === 1 ? "" : "s"}`);
    if (p.key) bits.push(`key: ${p.key}`);
    if (p.typed.length) bits.push(`he typed: ${p.typed.join(" | ")}`);
    if (p.phone !== undefined) bits.push(p.phone === null ? "the phone couldn't mark it: yours to mark" : `the phone gave ${p.phone}${p.m !== undefined ? `/${p.m}` : ""}`);
    else if (p.ok) bits.push(`the phone: ${p.ok.map((x) => (x ? "right" : "wrong")).join(", ")}`);
    if (bits.length) lines.push(`${p.p ? `(${p.p}) ` : ""}${bits.join("; ")}`);
  }
  for (const r of it.reasons) lines.push(`${r.p ? `(${r.p}) ` : ""}${r.yes ? `he picked ${r.yes}; his reason, typed: ` : "his words, typed: "}${r.text || "(empty)"}`);
  return lines.join("\n").slice(0, AI_SAID_MAX);
}
