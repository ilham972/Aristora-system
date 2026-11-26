// Bookings from the website (26 Nov 2026, the founder: the O/L Prediction Paper 2026 is booked on
// aristora.org/ol-prediction-2026 until 30 November; "instead of Google Form ... in our Aristora system app ... a page
// for bookings ... this is temporary"). Pure helpers: what a booking may hold, read the same way by the server and the
// tests. Names and numbers are students' own: they never go into the repo, the history or a log.

/** The offer being booked (one at a time; the page sends it). */
export const BOOK_ITEMS = ["ol-2026"] as const;
export type BookItem = (typeof BOOK_ITEMS)[number];

/** The longest name or referrer kept. */
export const BOOK_TEXT_MAX = 60;
/** At most this many bookings in any 24 hours: a script can't fill the database (a real day is far below it). */
export const BOOK_DAY_CAP = 1500;
/** What the page sends for "nobody told me" (its Tamil words); counted apart in Settings → Bookings. */
export const NOBODY = "யாரும் சொல்லவில்லை";

/** A name or referrer as kept: no control characters, single spaces, at most BOOK_TEXT_MAX letters. */
export function bookText(s: unknown): string {
  if (typeof s !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, BOOK_TEXT_MAX);
}

/** A Sri Lankan mobile number in any usual form (077 123 4567, 77 123 4567, +94 77 123 4567) → 0771234567, or "". */
export function bookPhone(s: unknown): string {
  if (typeof s !== "string") return "";
  let d = s.replace(/\D/g, "");
  if (d.startsWith("94") && d.length === 11) d = "0" + d.slice(2);
  if (d.length === 9 && d.startsWith("7")) d = "0" + d;
  return /^07\d{8}$/.test(d) ? d : "";
}

/** The code the student sees (made on their phone: Convex's own random numbers are seeded). */
export const BOOK_CODE = /^OL26-[A-Z2-9]{4}$/;

export type CleanBooking = { item: BookItem; name: string; phone: string; ref: string; code: string };

/** The booking as kept, or the words of what is wrong (the page checks the same, so a person rarely sees them). */
export function cleanBooking(a: { item: string; name: string; phone: string; ref: string; code: string }): CleanBooking | string {
  if (!(BOOK_ITEMS as readonly string[]).includes(a.item)) return "Unknown item.";
  const name = bookText(a.name);
  if (name.length < 2) return "A name is needed.";
  const phone = bookPhone(a.phone);
  if (!phone) return "A Sri Lankan mobile number is needed.";
  const ref = bookText(a.ref);
  if (ref.length < 2) return "Who told them is needed.";
  const code = typeof a.code === "string" ? a.code.trim().toUpperCase() : "";
  if (!BOOK_CODE.test(code)) return "Bad booking code.";
  return { item: a.item as BookItem, name, phone, ref, code };
}

/** 0771234567 → 077 123 4567 */
export const prettyPhone = (d: string) => (d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : d);

/** The same person booking again (same number and name, any case or spacing) is the same booking. */
export const sameName = (a: string, b: string) => bookText(a).toLowerCase() === bookText(b).toLowerCase();

/**
 * Who brought how many (the commission, his words: "I have to give the commission for my students ... after
 * confirm"): one line per referrer, spelled however they spelled it but counted together (case and spaces), the most
 * first; "nobody" apart.
 */
export function referrals(rows: { ref: string; ok?: number }[]): { nobody: number; byRef: { ref: string; n: number; ok: number }[] } {
  const by = new Map<string, { ref: string; n: number; ok: number }>();
  let nobody = 0;
  for (const r of rows) {
    if (r.ref === NOBODY) {
      nobody++;
      continue;
    }
    const k = bookText(r.ref).toLowerCase();
    const e = by.get(k) ?? { ref: bookText(r.ref), n: 0, ok: 0 };
    e.n++;
    if (r.ok) e.ok++;
    by.set(k, e);
  }
  return { nobody, byRef: [...by.values()].sort((x, y) => y.n - x.n || y.ok - x.ok || x.ref.localeCompare(y.ref)) };
}
