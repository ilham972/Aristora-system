// The message with a book's PDF for the printing shop (23 Nov 2026): the copies and the price worked out.
import { describe, expect, test } from "vitest";
import { PAPER_RS, papersOf, shareCaption } from "../src/printCost";

describe("the printing shop's message", () => {
  test("papers: two pages a paper, an odd page count takes one more page", () => {
    expect([papersOf(18), papersOf(17), papersOf(1), papersOf(0)]).toEqual([9, 9, 1, 0]);
    expect(PAPER_RS).toBe(7);
  });

  test("his example: 18 pages, one copy = 9 papers × Rs. 7 = Rs. 63", () => {
    expect(shareCaption(1, 18)).toBe("Please print 1 copy — A4, both sides.\n18 pages → 9 papers × Rs. 7 = Rs. 63");
  });

  test("more copies: the price multiplies by them too; 17 pages count as 18", () => {
    expect(shareCaption(4, 17)).toBe("Please print 4 copies — A4, both sides.\n17 pages → 9 papers × Rs. 7 × 4 copies = Rs. 252");
    expect(shareCaption(2, 1)).toBe("Please print 2 copies — A4, both sides.\n1 page → 1 paper × Rs. 7 × 2 copies = Rs. 14");
  });
});
