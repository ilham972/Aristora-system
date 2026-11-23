// What the printing shop is told with a book's PDF (23 Nov 2026, the founder: "I can send the how many copies, at the
// same time how many rupees I want to pay to them"): the copies, and the price worked out. A paper (one sheet, printed
// on both sides: two pages) costs Rs. 7 at his shop; an odd page count takes one more page (17 → 18 pages = 9 papers).

/** Rupees for one paper (a sheet printed on both sides) at his printing shop. Tell a chat when the shop's price changes. */
export const PAPER_RS = 7;
export const COPIES_MAX = 99;

/** Papers for a book of `pages` pages printed on both sides: 18 → 9, 17 → 9. */
export function papersOf(pages: number): number {
  return Math.ceil(Math.max(0, pages) / 2);
}

/**
 * The message with the PDF, two lines: "Please print 4 copies — A4, both sides." and the price worked out,
 * "18 pages → 9 papers × Rs. 7 × 4 copies = Rs. 252" (one copy: "… 9 papers × Rs. 7 = Rs. 63").
 */
export function shareCaption(copies: number, pages: number): string {
  const papers = papersOf(pages);
  const total = papers * PAPER_RS * copies;
  const first = `Please print ${copies} ${copies === 1 ? "copy" : "copies"} — A4, both sides.`;
  const price = `${pages} ${pages === 1 ? "page" : "pages"} → ${papers} ${papers === 1 ? "paper" : "papers"} × Rs. ${PAPER_RS}${copies > 1 ? ` × ${copies} copies` : ""} = Rs. ${total}`;
  return `${first}\n${price}`;
}
