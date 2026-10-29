// One row that scrolls sideways (src/hrow.tsx): where it scrolls to, and what its edges say is hidden.
import { describe, expect, test } from "vitest";
import { centreOf, edgesOf } from "../src/hrow";

describe("one line that scrolls sideways", () => {
  test("the open one comes to the middle, never past either end", () => {
    // A row 300 px wide showing 1000 px of pills.
    expect(centreOf(480, 520, 300, 1000)).toBe(350); // its middle (500) in the middle of the view
    expect(centreOf(10, 50, 300, 1000)).toBe(0); // near the start: the start
    expect(centreOf(960, 1000, 300, 1000)).toBe(700); // near the end: the end
    expect(centreOf(100, 140, 300, 280)).toBe(0); // everything fits: no scrolling
  });

  test("faded edges where there is more; a red or amber dot where someone who waits is hidden", () => {
    const pills = [
      { a: 0, b: 60, u: null },
      { a: 65, b: 125, u: "amber" as const },
      { a: 130, b: 190, u: null },
      { a: 400, b: 460, u: "red" as const },
      { a: 465, b: 525, u: "amber" as const },
    ];
    // At the start, 300 px in view: nothing to the left; more to the right, and the red one is there.
    expect(edgesOf(0, 300, 525, pills)).toEqual({ l: false, r: true, ul: null, ur: "red" });
    // Scrolled to the end: Malik's amber is hidden on the left; nothing more to the right.
    expect(edgesOf(225, 525, 525, pills)).toEqual({ l: true, r: false, ul: "amber", ur: null });
    // Everything in view: no edges, no dots.
    expect(edgesOf(0, 525, 525, pills)).toEqual({ l: false, r: false, ul: null, ur: null });
    // A pill half under the faded edge counts as hidden (its middle is under the fade).
    expect(edgesOf(0, 470, 525, pills).ur).toBe("amber");
  });
});
