// The government's own textbook, unit by unit (23 Nov 2026, his ask: "for the extra context, I have to put the
// government book syllabus here ... so the AI can read this and build the videos from here"). One unit = the PDF of
// that unit's pages of the free Grade 6-11 textbook, uploaded through the Claude link and read back through it when a
// chat builds that unit's videos from its skills (Settings → Books → T).
//
// It must never make the app heavier (his rule the same night: "don't make app heavy"):
// - the pages live in `govParts`, a table of its own that NO phone, board, class page or family screen ever reads;
// - nothing is added to `units` or `books`, so no live query a phone keeps open is woken when a book is uploaded;
// - the app itself only ever learns that a unit HAS one, and how big it is (`govBooks`, a row of numbers): that is
//   what colours the unit's number on Settings → Books;
// - the bytes move twice only: the upload, and a chat asking for that one unit. Never "just in case".
//
// A book arrives in parts (the link carries at most LINK_CHUNK in one go). Part 0 clears whatever was there, so a
// unit shows no book while its parts are being replaced; the last part writes the `govBooks` row, which is what makes
// the book count as there. All or nothing: a chat that dies halfway leaves the unit empty, not half a book.

/** The most base64 letters one part may carry (one save and one answer of the Claude link hold this easily). */
export const GOV_PART_MAX = 400_000;
/** The raw bytes one part is cut to before it is turned into base64 (4 letters carry 3 bytes). */
export const GOV_CHUNK = 300_000;
/** The most a unit's book may weigh. */
export const GOV_BYTES_MAX = 8_000_000;
/** The most pages one unit's chapter may have. */
export const GOV_PAGES_MAX = 80;
/** The most parts one book may be cut into. */
export const GOV_PARTS_MAX = 40;
/** The longest note about where the pages came from ("Grade 8 maths, Part I, unit 6, pages 79-92"). */
export const GOV_FROM_MAX = 160;

/** One part of one unit's book, as the Claude link brings it. */
export type GovPart = {
  /** Which part this is, 0 first, and how many the book has in all. */
  part: number;
  parts: number;
  /** The raw bytes this part carries, and those bytes as base64. */
  n: number;
  b64: string;
  /** The whole book: its pages, its bytes, a short name of its source, and a sha256 head to tell versions apart. */
  pages: number;
  bytes: number;
  sha: string;
  from: string;
};

const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
const SHA = /^[0-9a-f]{8,64}$/;
const whole = (n: unknown, lo: number, hi: number) => typeof n === "number" && Number.isInteger(n) && n >= lo && n <= hi;

/** base64 is 4 letters for every 3 bytes, padded. */
export const b64Length = (bytes: number) => 4 * Math.ceil(bytes / 3);

/** How many bytes a padded base64 string carries, exactly (-1: it is not padded base64). */
export function bytesIn(b64: string): number {
  if (b64.length === 0 || b64.length % 4 !== 0) return -1;
  return (b64.length / 4) * 3 - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
}

/** What is wrong with a part the link brought ("" = nothing). */
export function partProblem(p: Partial<GovPart>): string {
  if (!whole(p.parts, 1, GOV_PARTS_MAX)) return `A book comes in 1 to ${GOV_PARTS_MAX} parts.`;
  if (!whole(p.part, 0, (p.parts as number) - 1)) return `Part ${String(p.part)} is not one of this book's ${p.parts} parts.`;
  if (!whole(p.pages, 1, GOV_PAGES_MAX)) return `A unit's chapter has 1 to ${GOV_PAGES_MAX} pages.`;
  if (!whole(p.bytes, 1, GOV_BYTES_MAX)) return `A unit's book weighs at most ${Math.round(GOV_BYTES_MAX / 1024 / 1024)} MB.`;
  if (!whole(p.n, 1, GOV_CHUNK * 2)) return "That part carries nothing, or far too much.";
  if (typeof p.b64 !== "string" || !B64.test(p.b64)) return "That part is not base64.";
  if (p.b64.length > GOV_PART_MAX) return `One part carries at most ${GOV_PART_MAX} letters; cut the book into more parts.`;
  if (bytesIn(p.b64) !== p.n) return `Part ${p.part}: those letters do not carry ${p.n} bytes (pad the base64).`;
  if ((p.n as number) > (p.bytes as number)) return "A part carries more than the whole book.";
  if (typeof p.sha !== "string" || !SHA.test(p.sha)) return "The book needs a sha256 (hex) to tell its versions apart.";
  if (typeof p.from !== "string" || !p.from.trim() || p.from.length > GOV_FROM_MAX) return `Say where the pages came from, in up to ${GOV_FROM_MAX} letters.`;
  return "";
}

/** What is wrong once every part is in ("" = nothing). */
export function wholeProblem(parts: { i: number; n: number }[], want: { parts: number; bytes: number }): string {
  if (parts.length !== want.parts) return `${parts.length} of ${want.parts} parts are here: send the missing ones again.`;
  const seen = new Set(parts.map((p) => p.i));
  for (let i = 0; i < want.parts; i++) if (!seen.has(i)) return `Part ${i} never came: send the book again.`;
  const bytes = parts.reduce((a, p) => a + p.n, 0);
  if (bytes !== want.bytes) return `The parts carry ${bytes} bytes, not the book's ${want.bytes}.`;
  return "";
}

/** "14 pages · 626 KB", for the Books page and the link's answers. */
export function govWords(pages: number, bytes: number): string {
  return `${pages} page${pages === 1 ? "" : "s"} · ${bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`}`;
}
