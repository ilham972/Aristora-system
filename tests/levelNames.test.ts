// The one pipeline for a level's name (23 Nov 2026, the founder: "make everything synced pipeline, so changing
// something will showup everywhere"): every line asks lvText, which reads the books the app holds right now.
import { afterEach, describe, expect, test } from "vitest";
import { lvLabel } from "../convex/lib/book";
import { levelSource, lvText } from "../src/levelNames";

afterEach(() => {
  for (const k of ["board", "road", "preview"]) levelSource(k, null);
});

describe("lvText", () => {
  const skill = [
    { n: 1, name: "1" },
    { n: 2, name: "2·1" },
    { n: 3, name: "2·2" },
  ];
  const plain = [{ n: 1 }, { n: 2 }];

  test("a skill workbook's level by its name; any other level by its number; nothing known: the number", () => {
    levelSource("board", (u) => (u === "uS" || u === "G8-U04" ? skill : u === "uP" ? plain : null));
    expect([lvText("uS", 3), lvText("G8-U04", 2), lvText("uP", 2), lvText("uX", 7), lvText(null, 4)]).toEqual(["2·2", "2·1", "2", "7", "4"]);
    expect(lvText("uS", "3")).toBe("2·2"); // a history line's number as text
  });

  test("the road's names (nm) and the board's (name) are the same source; the next load changes every line", () => {
    let road = [{ n: 2, nm: "2·1" }];
    levelSource("road", (u) => (u === "uS" ? road : null));
    expect(lvText("uS", 2)).toBe("2·1");
    road = [{ n: 2, nm: "3" }]; // the book changed (a new switch, another cut): the same call says the new name
    expect(lvText("uS", 2)).toBe("3");
    levelSource("road", null);
    expect(lvText("uS", 2)).toBe("2");
  });

  test("lvLabel (a level in hand) and lvText (the unit and its number) say the same", () => {
    levelSource("board", () => skill);
    for (const l of skill) expect(lvText("uS", l.n)).toBe(lvLabel(l));
    expect(lvLabel({ n: 5 })).toBe("5");
  });
});
