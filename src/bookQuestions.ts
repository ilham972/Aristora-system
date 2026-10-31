// A book's printed questions, cut out of its book.html (the page its PDF was printed from, inside every source zip):
// each question card's HTML and the book's CSS, so a teacher can see a question as printed. Plain string work on the
// print engines' own HTML (no DOM), so the tests run it exactly as the owner's phone does.
// - Topic tutes (ol-essay): ladder cards `qq` (the Fighter book) and past-paper cards `pq` (the Master book).
// - Workbooks (past-paper-workbook): Part I cards `si` and Part II cards `pq`; a term book has several units, each
//   ending with its marks sheet `msh`.
// The printed number is the card's black badge (`qn`), as the students see it.

import { BOOK_CSS_MAX, cleanHtml, QUESTION_HTML_MAX } from "../convex/lib/questions";

const CARD = /<div class="(qq|pq|si)((?: [^"]*)?)" data-q="(\d+)"[^>]*>/g;
const SHEET = /<div class="msh(?: [^"]*)?"/g;
const NUMBER = /<span class="qn(?: q3)?">(\d+)<\/span>/;
/** What the print engine puts inside a card that isn't the question: footers, side tab, working space. */
const NOT_QUESTION = ["fl", "fc", "fr", "tab"];

/** Index just after the </div> closing the <div …> that starts at `start` (-1 when it never closes). */
function divEnd(html: string, start: number): number {
  const re = /<div\b|<\/div\s*>/gi;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    if (m[0][1] === "/") {
      depth--;
      if (depth === 0) return re.lastIndex;
    } else depth++;
  }
  return -1;
}

/** Take out every <div class="name …">…</div> of these names. */
function dropDivs(html: string, names: string[]): string {
  const re = new RegExp(`<div class="(?:${names.join("|")})(?: [^"]*)?"[^>]*>`, "g");
  let out = html;
  for (let m = re.exec(out); m; m = re.exec(out)) {
    const end = divEnd(out, m.index);
    if (end < 0) break;
    out = out.slice(0, m.index) + out.slice(end);
    re.lastIndex = m.index;
  }
  return out;
}

/** Take out every block that starts with this at-rule (nested braces counted). */
function dropBlocks(css: string, start: RegExp): string {
  let out = css;
  for (let m = start.exec(out); m; m = start.exec(out)) {
    const open = out.indexOf("{", m.index);
    if (open < 0) break;
    let depth = 0;
    let end = -1;
    for (let i = open; i < out.length; i++) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}" && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    if (end < 0) break;
    out = out.slice(0, m.index) + out.slice(end);
    start.lastIndex = m.index;
  }
  return out;
}

/** The book's CSS without its fonts, print pages and screen view ("" when it would be too big to keep). */
export function bookCssOf(html: string): string {
  let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
  for (const at of [/@font-face\s*\{/gi, /@page\b[^{]*\{/gi, /@media\s+screen\b[^{]*\{/gi]) css = dropBlocks(css, at);
  css = css.replace(/@import[^;]*;/gi, "").replace(/url\s*\([^)]*\)/gi, "none").replace(/<\s*\//g, "");
  css = css.replace(/\n\s*\n+/g, "\n").trim();
  return css.length <= BOOK_CSS_MAX ? css : "";
}

export type Card = { cls: string; num: number; html: string; at: number };

/** Every question card of a book.html, cleaned: footers and side tabs out, nothing that can run or load. */
export function questionCards(html: string): Card[] {
  const out: Card[] = [];
  CARD.lastIndex = 0;
  for (let m = CARD.exec(html); m; m = CARD.exec(html)) {
    const end = divEnd(html, m.index);
    if (end < 0) continue;
    let card = dropDivs(html.slice(m.index, end), NOT_QUESTION);
    card = cleanHtml(card.replace(/^<div class="([^"]*?) pt( [^"]*)?"/, (_s, a: string, b?: string) => `<div class="${a}${b ?? ""}"`));
    const num = Number(NUMBER.exec(card)?.[1] ?? m[3]);
    if (card.length <= QUESTION_HTML_MAX) out.push({ cls: m[1], num, html: card, at: m.index });
    CARD.lastIndex = end;
  }
  return out;
}

/** A topic tute's questions: the ladder's (Fighter book) and the past papers' (Master book), by printed number. */
export function tuteQuestions(html: string): { css: string; fighter: Map<number, string>; master: Map<number, string> } {
  const fighter = new Map<number, string>();
  const master = new Map<number, string>();
  for (const c of questionCards(html)) (c.cls === "qq" ? fighter : master).set(c.num, c.html);
  return { css: bookCssOf(html), fighter, master };
}

/** A workbook's questions, one map per unit in book order (each unit's cards come before its marks sheet). */
export function workbookQuestions(html: string): { css: string; units: Map<number, string>[] } {
  const sheets = [...html.matchAll(SHEET)].map((m) => m.index ?? 0);
  const units = sheets.map(() => new Map<number, string>());
  for (const c of questionCards(html)) {
    const u = sheets.findIndex((at) => at > c.at);
    if (u >= 0) units[u].set(c.num, c.html);
  }
  return { css: bookCssOf(html), units };
}
