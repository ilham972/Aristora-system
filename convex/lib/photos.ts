// Photos from home and what a Check asks of him (4 Nov 2026, his voice notes: "if the student done at home, everything
// will be done at home").
// - A part the phone can't mark (a drawing, a construction, a reason) comes as a photo; a person he picks (the Photos
//   permission) marks it from the photo, and the marks reach his phone as XP.
// - No photo of his working on a wrong answer any more (10 Nov 2026, his rule: "a nightmare": the teachers looked again
//   at levels already corrected; 42 photos a day). Wrong answers wait for Evaluation in class. Old Checks' `working`
//   lists are ignored (`owedOf`); their waiting photos were deleted (`photos.dropWorking`). And no 2-level limit: the
//   unit gate decides instead (`lib/family.ts`: 75 % or every lost question explained opens the next Stage).
// - Nothing is kept: a photo's files go a day after marking (`PHOTO_KEEP_MS`), a retake's at once, a file never
//   attached after a day (`photos.sweep`).

import type { KeyAnswer } from "./key";
import type { MQ } from "./master";
import { markQuestion, type KeyQ } from "./phone";

/** Photos for one question. */
export const PHOTO_MAX = 3;
/** The phone sends ~200 KB (1280 px, JPEG); a file bigger than this is refused. */
export const PHOTO_BYTES = 900 * 1024;
/** Upload addresses one phone may ask for in a day (a level's photos, a few retakes). */
export const PHOTO_URLS_PER_DAY = 80;
/** A marked photo's files are deleted this long after marking. */
export const PHOTO_KEEP_MS = 24 * 60 * 60_000;
/**
 * A marked photo is kept past that day while its question still waits to be explained (12 Nov 2026, his words: "don't
 * delete that until explain that question in the classroom or in the online ... in the thread we have to show
 * everything that student done"): he lost marks on it, on any sub-question, and nobody explained or taught it yet.
 * At most this long after marking (mine: a question nobody ever explains must not keep its photos for ever).
 */
export const PHOTO_HOLD_MS = 30 * 24 * 60 * 60_000;
/** Waiting longer than this: the teachers' count turns red. */
export const PHOTO_LATE_MS = 24 * 60 * 60_000;
/** An uploaded file never attached to a question is deleted after this. */
export const ORPHAN_MS = 24 * 60 * 60_000;
/** Her own words with a cause or a mark. */
export const NOTE_MAX = 200;
/** A teacher's message back to him (the ⌂ card's Ask, 7 Nov 2026). */
export const ASK_MAX = 300;
/**
 * Her voice note with the message (12 Nov 2026, his ask: "why you not put the answer?" said, not typed). The teacher's
 * phone records it small (mono, ~24 kbps: a minute ≈ 180 KB); a bigger file is refused. It plays only when he taps it.
 */
export const VOICE_SEC = 60;
export const VOICE_BYTES = 700 * 1024;
/** Her message's words when she only spoke (the bell, the alert and the log read it; the cards show the player). */
export const VOICE_ONLY = "🎤 குரல் செய்தி";

export type PhotoKind = "part" | "working";

/**
 * Her one tap: the cause of a wrong answer (`working`) or a remark on a marked part (`part`). The teachers' app shows
 * `en`; his phone shows `ta`, a sentence in the owl's voice.
 */
export const WHY = {
  slip: { kind: "working", en: "Careless slip", ta: "சிறிய கவனக்குறைவு. விடையை எழுதிய பின் ஒருமுறை சரிபார்." },
  point: { kind: "working", en: "Decimal point", ta: "தசமப் புள்ளியை நகர்த்தும்போது கவனம்." },
  sign: { kind: "working", en: "Sign + / −", ta: "+, − குறிகளில் கவனம்." },
  method: { kind: "working", en: "Wrong method", ta: "முறை தவறு. தீர்வைப் படிப்படியாகப் பார்." },
  copy: { kind: "working", en: "Copied the question wrong", ta: "கேள்வியிலுள்ள எண்களைச் சரியாகப் பார்த்து எழுது." },
  unfinished: { kind: "working", en: "Didn't finish", ta: "கடைசிப் படி வரை செய்து முடி." },
  unit: { kind: "both", en: "Unit", ta: "விடையுடன் சரியான அலகை எழுது." },
  lesson: { kind: "working", en: "Needs the lesson again", ta: "இந்தப் பாடத்தை மீண்டும் படிக்க வேண்டும்: வகுப்பில் கேள்." },
  ruler: { kind: "part", en: "Use a ruler", ta: "அடிமட்டத்தைப் பயன்படுத்து." },
  label: { kind: "part", en: "Label it", ta: "பெயர்களையும் அளவுகளையும் குறி." },
  working: { kind: "part", en: "Show working", ta: "வழிமுறையைக் காட்டு." },
  neat: { kind: "part", en: "Neater", ta: "இன்னும் நேர்த்தியாக எழுது." },
  good: { kind: "part", en: "Well done", ta: "சிறப்பு!" },
} as const satisfies Record<string, { kind: PhotoKind | "both"; en: string; ta: string }>;
export type Why = keyof typeof WHY;
export const isWhy = (x: string): x is Why => Object.prototype.hasOwnProperty.call(WHY, x);

/** Why she asked for the photo again (his phone shows it). */
export const RETAKE = {
  blur: { en: "Blurry or dark", ta: "படம் தெளிவாக இல்லை. வெளிச்சத்தில் மீண்டும் எடு." },
  page: { en: "Wrong page", ta: "இது வேறு கேள்வி. சரியான பக்கத்தை எடு." },
  cut: { en: "Cut off", ta: "விடை முழுவதும் படத்தில் வரவில்லை." },
} as const;
export type RetakeWhy = keyof typeof RETAKE;
export const isRetake = (x: string): x is RetakeWhy => Object.prototype.hasOwnProperty.call(RETAKE, x);

/** The key's answer for one question, as the phone shows it after Check (bold marks `**` kept: the phone bolds them). */
export function keyText(k: KeyAnswer | undefined): string {
  if (!k) return "";
  if (k.parts?.length) return k.parts.map((p) => `(${p.p}) ${p.a}`).join("\n");
  return k.a ?? "";
}

/**
 * A part question's marks: the teacher's share and what the phone gave on the rest, as at his Check (stored since
 * 4 Nov 2026). An older Check: worked out now; a question the phone reads now but couldn't then (a key shape learned
 * later, "ரூபா 350") is the teacher's whole, so its photo is still marked and never strands him.
 */
export function partMarks(
  owe: { part: number[]; pm?: number[]; pg?: number[] } | undefined,
  q: number,
  k: KeyQ,
  typed: string[] | null,
): { teach: number; phoneGot: number } {
  const i = owe?.part.indexOf(q) ?? -1;
  if (i >= 0 && owe?.pm?.[i] !== undefined && owe.pg?.[i] !== undefined) return { teach: owe.pm[i], phoneGot: owe.pg[i] };
  const teach = k.parts.filter((p) => !p.want).reduce((a, p) => a + p.m, 0);
  if (teach === 0) return { teach: k.max, phoneGot: 0 };
  return { teach, phoneGot: typed ? markQuestion(k, typed).phoneGot : 0 };
}

/** One photo row, as the rules need it. */
export type PhotoRow = { q: number; kind: PhotoKind; state: "waiting" | "done" | "retake" | "ask" };

/**
 * The photos a checked level still owes: a part only a teacher marks (a drawing, a construction), not marked in class and
 * with no photo sent. A retake, or a teacher's message not answered yet, is owed again. `required` off (Settings →
 * Photos): no photo is owed, but her message still waits for his answer (12 Nov 2026: she asked him; the switch is about
 * photos, not about answering her). His working on a wrong answer is never owed (10 Nov 2026): an old Check's `working`
 * is ignored.
 */
export function owedOf(
  owe: { part: number[]; working: number[] } | undefined,
  rows: PhotoRow[],
  mq: Record<string, MQ>,
  required: boolean,
): { q: number; kind: PhotoKind }[] {
  if (!owe) return [];
  const asked = (q: number) => rows.some((r) => r.q === q && r.kind === "part" && r.state === "ask");
  // A retake, or a teacher's message he hasn't answered yet (7 Nov 2026), is owed again.
  const sent = (q: number) => rows.some((r) => r.q === q && r.kind === "part" && r.state !== "retake" && r.state !== "ask");
  return owe.part
    .filter((q) => !mq[String(q)] && (required ? !sent(q) : asked(q)))
    .sort((a, b) => a - b)
    .map((q) => ({ q, kind: "part" as const }));
}
