// A book's printed questions in the app (teachers only; read while a question is open).
// - They come from the book.html inside the unit's source zip: the owner's phone cuts each question card out of it
//   (src/bookQuestions.ts) when he uploads the zip, together with the book's CSS (fonts and print rules removed).
// - They live in their own tables (`questions`, `bookCss`), never in `books` (the board sends books to every phone)
//   and never in the code (the repo is public; these are his books' content).
// - Phones draw them inside a shadow root after cleaning them again (src/bookQuestion.tsx). This file is the
//   server's check: nothing that can run, load or post is ever stored.

export const QUESTION_HTML_MAX = 200_000; // one question card (figures included)
export const BOOK_CSS_MAX = 120_000;
export const QUESTIONS_BATCH_MAX = 600_000; // what one save sends (a book goes in a few saves)

/** Why this HTML can't be stored ("" = fine): scripts, frames, forms, links, event handlers, javascript: URLs. */
export function unsafeHtml(html: string): string {
  if (/<\s*\/?\s*(script|iframe|frame|object|embed|link|meta|base|form|input|button|textarea|select|foreignobject|use|animate|set|image|img|video|audio|source)\b/i.test(html)) {
    return "it holds a tag the app never shows";
  }
  if (/<[^>]*\son[a-z]+\s*=/i.test(html)) return "it holds an event handler";
  // url(#hatch) points inside the same figure (an SVG pattern): fine. Any other URL loads something.
  if (/javascript:|vbscript:|srcdoc|xlink:href|\shref\s*=|\ssrc\s*=|url\s*\(\s*(?!['"]?#)|expression\s*\(/i.test(html)) {
    return "it links to something";
  }
  return "";
}

/** Why this CSS can't be stored ("" = fine): imports, URLs (fonts, images), anything that closes the style. */
export function unsafeCss(css: string): string {
  if (/@import|url\s*\(|expression\s*\(|javascript:|<\s*\//i.test(css)) return "the book's style links to something";
  return "";
}

/** The same rules, applied: what can't be stored is taken out (the owner's phone cleans every card before saving). */
export function cleanHtml(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\s*\/?\s*(script|style|iframe|frame|object|embed|link|meta|base|form|input|button|textarea|select|foreignobject|use|animate|set|image|img|video|audio|source)\b[^>]*>/gi, "")
    .replace(/\s(on[a-z]+|href|src|xlink:href|srcdoc|action|formaction)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s[\w:-]+\s*=\s*"[^"]*(?:url\s*\(\s*(?!['"]?#)|expression\s*\(|javascript:|vbscript:)[^"]*"/gi, "");
}
