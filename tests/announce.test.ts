import { describe, expect, test } from "vitest";
import { callPhrase, joinNames, lostPhrase, pullPhrase } from "../src/announce";

describe("what the phones say", () => {
  test("names are joined the way people say them", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Rimas"])).toBe("Rimas");
    expect(joinNames(["Ahamed", "Nila"])).toBe("Ahamed and Nila");
    expect(joinNames(["Ahamed", " Dilan ", "Fathima", "Nila"])).toBe("Ahamed, Dilan, Fathima and Nila");
    expect(joinNames(["Rimas  M", ""])).toBe("Rimas M");
  });

  test("Correction hears each room once, Theory first", () => {
    expect(callPhrase([{ name: "Rimas", room: "theory" }])).toBe("Rimas, go to Theory.");
    expect(
      callPhrase([
        { name: "Kumar", room: "evaluation" },
        { name: "Ahamed", room: "theory" },
        { name: "Nila", room: "theory" },
      ]),
    ).toBe("Ahamed and Nila, go to Theory. Kumar, go to Evaluation.");
    expect(callPhrase([])).toBe("");
  });

  test("each teacher has her own room: Correction says her name (31 Oct 2026)", () => {
    expect(callPhrase([{ name: "Raj", room: "evaluation", teacher: "Nila" }])).toBe("Raj, go to Nila in Evaluation.");
    expect(
      callPhrase([
        { name: "Raj", room: "evaluation", teacher: "Nila" },
        { name: "Kumar", room: "evaluation", teacher: "Sara" },
        { name: "Ahamed", room: "theory", teacher: "Fathima" },
        { name: "Zara", room: "evaluation", teacher: "Nila" },
      ]),
    ).toBe("Ahamed, go to Fathima in Theory. Raj and Zara, go to Nila in Evaluation. Kumar, go to Sara in Evaluation.");
    expect(lostPhrase([{ name: "Kumar", room: "theory", teacher: "Fathima" }])).toBe("Kumar hasn't reached Fathima in Theory.");
  });

  test("Evaluation hears who Theory is taking", () => {
    expect(pullPhrase(["Kumar"])).toBe("Theory wants Kumar now.");
    expect(pullPhrase([])).toBe("");
  });

  test("Correction hears who was sent to Theory and isn't there after 3 minutes", () => {
    expect(lostPhrase([{ name: "Kumar", room: "theory" }])).toBe("Kumar hasn't reached Theory.");
    expect(lostPhrase([{ name: "Kumar", room: "theory" }, { name: "Nila", room: "theory" }])).toBe("Kumar and Nila haven't reached Theory.");
    expect(lostPhrase([{ name: "Kumar", room: "theory" }, { name: "Zara", room: "evaluation" }])).toBe(
      "Kumar hasn't reached Theory. Zara hasn't reached Evaluation.",
    );
    expect(lostPhrase([])).toBe("");
  });
});
