// Photos from home and what a Check asks of him (4 Nov 2026, his voice notes: "if the student done at home, everything
// will be done at home").
// - A part the phone can't mark (a drawing, a construction, a reason) comes as a photo; a person he picks (the Photos
//   permission) marks it from the photo, and the marks reach his phone as XP.
// - A wrong answer comes with a photo of his working (his rule: required), to see WHY it was wrong; she answers with
//   one tap on its cause (`WHY`), the phone shows it in Tamil beside the key's working (the solution).
// - His limit: without those photos he may do 2 more levels at most (`OWE_LEVELS`); the next waits for the photos. The
//   limit waits on HIM (photo sent), never on the teacher's reply: a slow queue never blocks a student.
// - Nothing is kept: a photo's files go a day after marking (`PHOTO_KEEP_MS`), a retake's at once, a file never
//   attached after a day (`photos.sweep`).

import type { KeyAnswer } from "./key";
import type { MQ } from "./master";

/** Photos for one question. */
export const PHOTO_MAX = 3;
/** The phone sends ~200 KB (1280 px, JPEG); a file bigger than this is refused. */
export const PHOTO_BYTES = 900 * 1024;
/** Upload addresses one phone may ask for in a day (a level's photos, a few retakes). */
export const PHOTO_URLS_PER_DAY = 80;
/** A marked photo's files are deleted this long after marking. */
export const PHOTO_KEEP_MS = 24 * 60 * 60_000;
/** Waiting longer than this: the teachers' count turns red. */
export const PHOTO_LATE_MS = 24 * 60 * 60_000;
/** An uploaded file never attached to a question is deleted after this. */
export const ORPHAN_MS = 24 * 60 * 60_000;
/** Levels he may check at home after one that still owes photos. */
export const OWE_LEVELS = 2;
/** Her own words with a cause or a mark. */
export const NOTE_MAX = 200;

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

/** One photo row, as the rules need it. */
export type PhotoRow = { q: number; kind: PhotoKind; state: "waiting" | "done" | "retake" };

/**
 * The photos a checked level still owes: a part not marked in class and with no photo sent; a wrong answer whose
 * working was not sent and that Evaluation hasn't explained in class (a class correction may also have given its marks
 * back). A retake is owed again. `required` off (Settings → Photos): nothing is owed.
 */
export function owedOf(
  owe: { part: number[]; working: number[] } | undefined,
  rows: PhotoRow[],
  mq: Record<string, MQ>,
  required: boolean,
): { q: number; kind: PhotoKind }[] {
  if (!owe || !required) return [];
  const sent = (q: number, kind: PhotoKind) => rows.some((r) => r.q === q && r.kind === kind && r.state !== "retake");
  const out: { q: number; kind: PhotoKind }[] = [];
  for (const q of owe.part) if (!mq[String(q)] && !sent(q, "part")) out.push({ q, kind: "part" });
  for (const q of owe.working) {
    const r = mq[String(q)];
    if (r?.lost && !r.x && !sent(q, "working")) out.push({ q, kind: "working" });
  }
  return out.sort((a, b) => a.q - b.q || (a.kind === "part" ? -1 : 1));
}

/** One Check of his at home: when, which level, and how many photos it still owes. */
export type CheckDebt = { unitId: string; n: number; at: number; owed: number };

/**
 * His limit (his rule, 4 Nov 2026): "without the explanation for a wrong question they can go 2 levels maximum". The
 * oldest Check that still owes photos, if he has checked `OWE_LEVELS` levels at home since: the next level waits.
 */
export function blockedBy(checks: CheckDebt[]): CheckDebt | null {
  const owing = checks.filter((c) => c.owed > 0).sort((a, b) => a.at - b.at)[0];
  if (!owing) return null;
  const after = checks.filter((c) => c.at > owing.at).length;
  return after >= OWE_LEVELS ? owing : null;
}
