import { describe, expect, test } from "vitest";
import { callPhrase, joinNames, pullPhrase } from "../src/announce";

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

  test("Evaluation hears who Theory is taking", () => {
    expect(pullPhrase(["Kumar"])).toBe("Theory wants Kumar now.");
    expect(pullPhrase([])).toBe("");
  });
});
