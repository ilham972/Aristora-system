// The printing shops a unit's book goes to (23 Nov 2026, the founder: "I am going to print whole book in the
// communication ... put the share button near the download button ... put the copy number ... sometime if the shop is
// closed, I can select another printing shop"): kept in `meta` under SHOPS_KEY, set from the T page's Share sheet by
// the owner or Books. Pure rules here, shared by the server (convex/skillBook.ts) and the page (src/printShare.tsx).

export const SHOPS_KEY = "printShops";
export const SHOPS_MAX = 10;
export const SHOP_NAME_MAX = 40;
export const COPIES_MAX = 99;

export type PrintShop = { id: string; name: string; phone: string };
export type PrintShops = { shops: PrintShop[]; def: string | null };

/**
 * A WhatsApp number as WhatsApp's links want it: country code and number, digits only. Sri Lankan numbers may be typed
 * the local way ("077 123 4567" → "94771234567"); "+", "00", spaces, dashes and brackets are ignored. null = not a
 * number (9–15 digits after that).
 */
export function phoneDigits(raw: string): string | null {
  let d = raw.trim().replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (/^0\d{9}$/.test(d)) d = `94${d.slice(1)}`;
  return /^[1-9]\d{8,14}$/.test(d) ? d : null;
}

/** A number for people: "+94 77 123 4567" for Sri Lanka, "+" and the digits otherwise. */
export function phoneShown(digits: string): string {
  const m = /^94(\d{2})(\d{3})(\d{4})$/.exec(digits);
  return m ? `+94 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`;
}

/** What is wrong with a list of shops, in plain words; null = nothing. */
export function shopsProblem(s: PrintShops): string | null {
  if (s.shops.length > SHOPS_MAX) return `At most ${SHOPS_MAX} shops.`;
  const ids = new Set<string>();
  for (const x of s.shops) {
    if (!/^[a-z0-9]{1,20}$/.test(x.id) || ids.has(x.id)) return "A shop's inner name is wrong: open the sheet again.";
    ids.add(x.id);
    const name = x.name.trim();
    if (!name || name.length > SHOP_NAME_MAX) return `A shop needs a name of 1 to ${SHOP_NAME_MAX} letters.`;
    if (phoneDigits(x.phone) !== x.phone) return `${name}: the WhatsApp number is wrong (e.g. 077 123 4567, or +94 77 123 4567).`;
  }
  if (s.def !== null && !ids.has(s.def)) return "The default shop isn't in the list.";
  return null;
}

/** The saved value as shops, whatever was saved (anything unreadable is left out); one shop = the default. */
export function shopsOf(value: unknown): PrintShops {
  const v = (value ?? {}) as { shops?: unknown; def?: unknown };
  const shops = (Array.isArray(v.shops) ? v.shops : [])
    .filter((x): x is PrintShop => !!x && typeof x.id === "string" && typeof x.name === "string" && typeof x.phone === "string" && phoneDigits(x.phone) === x.phone)
    .slice(0, SHOPS_MAX)
    .map((x) => ({ id: x.id, name: x.name, phone: x.phone }));
  const def = typeof v.def === "string" && shops.some((x) => x.id === v.def) ? v.def : shops.length === 1 ? shops[0].id : null;
  return { shops, def };
}

/** The message that goes with the PDF: how many copies first (his words: "four copies as a caption"), then the book. */
export function shareCaption(o: { copies: number; both: boolean; grade: number; code: string; ta: string; level: number | null; pages: number }): string {
  const n = Math.min(Math.max(Math.round(o.copies) || 1, 1), COPIES_MAX);
  const what = o.level === null ? "skill book" : `Level ${o.level}`;
  const pages = o.pages > 0 ? ` · ${o.pages} ${o.pages === 1 ? "page" : "pages"}` : "";
  return `Please print ${n} ${n === 1 ? "copy" : "copies"} — A4, ${o.both ? "both sides" : "one side"}.\nG${o.grade} ${o.code} ${o.ta} · ${what}${pages}`;
}

/** WhatsApp's own link to a number with the message typed (no file: WhatsApp takes files only from the share list). */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
