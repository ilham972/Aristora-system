/// <reference types="vite/client" />
// One class, acted out on three phones: Correction, Theory, Evaluation.

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import { makeBackend, playwright, serveDist } from "./harness";

type Page = import("playwright").Page;
type Browser = import("playwright").Browser;

const modules = import.meta.glob("../../convex/**/*.ts");
const SHOTS = process.env.SHOTS ?? resolve("test-results/shots");
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

let browser: Browser;
let site: { url: string; close: () => Promise<void> };
const problems: string[] = [];

beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
  site = await serveDist(resolve("dist"));
  browser = await playwright.chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await site?.close();
});

async function phone(backend: ReturnType<typeof makeBackend>, role: string, size = PHONE): Promise<Page> {
  const ctx = await browser.newContext(size);
  await backend.attach(ctx);
  await ctx.addInitScript((r) => localStorage.setItem("aristora.role", r), role);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`[${role} ${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[${role} pageerror] ${e.message}`));
  await page.goto(site.url);
  return page;
}


// Small waiting checks (Playwright's own expect isn't installed here).
async function until(check: () => Promise<boolean>, what: string, timeout = 6000) {
  const end = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch (e) {
      last = e;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`Timed out waiting for: ${what}${last ? ` (${String(last)})` : ""}`);
}
type L = import("playwright").Locator;
const visible = (l: L) => l.first().waitFor({ state: "visible", timeout: 6000 });
const hidden = (l: L) => l.first().waitFor({ state: "hidden", timeout: 6000 });
const count = (l: L, n: number) => until(async () => (await l.count()) === n, `${n} of ${l}`);
const contains = (l: L, text: string) => until(async () => (await l.first().innerText()).includes(text), `"${text}" in ${l}`);
const lacks = (l: L, text: string) => until(async () => !(await l.first().innerText()).includes(text), `no "${text}" in ${l}`);
const textsAre = (l: L, list: string[]) =>
  until(async () => JSON.stringify((await l.allInnerTexts()).map((x) => x.trim())) === JSON.stringify(list), `${list.join(", ")} in ${l}`);
const attrIs = (l: L, name: string, value: string) => until(async () => (await l.first().getAttribute(name)) === value, `${name}=${value} on ${l}`);
const classLacks = (l: L, cls: string) => until(async () => !((await l.first().getAttribute("class")) ?? "").includes(cls), `no class ${cls} on ${l}`);

const shot = (p: Page, name: string, full = false) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full });

async function studentByName(backend: ReturnType<typeof makeBackend>, name: string) {
  return await backend.t.run(async (ctx) => (await ctx.db.query("students").collect()).find((s) => s.name === name)!);
}

test("a whole class on three phones", async () => {
  const backend = makeBackend(modules);
  const C = await phone(backend, "correction");
  const T = await phone(backend, "theory");
  const E = await phone(backend, "evaluation");

  // Empty class
  await visible(C.getByText("No students yet"));
  await shot(C, "01-correction-empty");

  // Load demo students from settings
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load 10 demo students" }).click();
  await visible(C.getByText("10 demo students loaded."));
  await C.getByRole("button", { name: "Back to the class" }).click();
  await count(C.locator(".tile"), 10);
  await count(C.locator(".tile.tone-red"), 2); // Fathima, Rizwan out of work
  await count(C.locator(".tile.tone-yellow"), 1); // Tharun quiet 19 min
  await count(C.locator(".tile.tone-grey"), 1); // Keerthi not here
  await shot(C, "02-correction-board", true);

  // Theory list: section D group first (Fathima is out of work there)
  const groupD = T.locator(".group", { hasText: "Completing the square" });
  await visible(groupD);
  await count(groupD.locator(".member"), 4);
  await visible(groupD.getByRole("button", { name: "Call 3 to Theory" }));
  await shot(T, "03-theory-queue", true);

  // Evaluation list: Dilan stuck, Fathima out of work, Kumar ready
  await contains(E.locator(".qrow", { hasText: "Dilan" }), "Stuck on Q18");
  await contains(E.locator(".qrow", { hasText: "Fathima" }), "Out of work");
  await contains(E.locator(".qrow", { hasText: "Kumar" }), "Ready");
  await shot(E, "04-evaluation-queue", true);

  // Theory calls 3 for section D
  await groupD.getByRole("button", { name: "Call 3 to Theory" }).click();
  const callCard = C.locator(".call-card.theory");
  await visible(callCard);
  await textsAre(callCard.locator(".call-name"), ["Fathima", "Ahamed", "Dilan"]);
  await shot(C, "05-correction-call");

  // Dilan is in the toilet: Not now. The other two are sent.
  await callCard.locator("li", { hasText: "Dilan" }).getByRole("button", { name: "Not now" }).click();
  await count(callCard.locator(".call-name"), 2);
  await callCard.getByRole("button", { name: "Sent all 2" }).click();
  await count(C.locator(".call-card"), 0);
  await contains(C.locator(".tile", { hasText: "Ahamed" }), "In Theory");
  await visible(groupD.locator(".member", { hasText: "Dilan" })); // back on the theory list

  // Theory: Done. Ahamed only reached 23-25 and may skip 30.
  const inRoomT = T.locator(".inroom.theory");
  await contains(inRoomT, "With you");
  await inRoomT.getByRole("button", { name: "Done" }).click();
  const doneSheet = T.locator(".sheet");
  const ahamedBlock = doneSheet.locator(".done-block", { hasText: "Ahamed" });
  await ahamedBlock.getByRole("button", { name: "Q26, taught" }).click();
  await ahamedBlock.getByRole("button", { name: "Q30", exact: true }).click();
  await shot(T, "06-theory-done-sheet");
  await doneSheet.getByRole("button", { name: "Save and send back to the hall" }).click();
  await visible(T.getByText("Saved. Back to the hall."));
  const ahamed = await studentByName(backend, "Ahamed");
  expect([23, 24, 25, 26].map((q) => ahamed.marks[String(q)]?.s)).toEqual(["taught", "taught", "taught", undefined]);
  expect(ahamed.marks["30"]?.s).toBe("skip");
  const fathima = await studentByName(backend, "Fathima");
  expect(fathima.marks["26"]?.s).toBe("taught");
  expect(fathima.room).toBeUndefined();
  // Ahamed still needs Q26: he stays on the theory list (R1).
  await visible(groupD.locator(".member", { hasText: "Ahamed" }));

  // Correction marks Ahamed: Q21 right, Q22 wrong, undo, wrong again.
  await C.locator(".tile", { hasText: "Ahamed" }).locator(".tile-main").click();
  const sheet = C.locator(".sheet");
  await visible(sheet.getByRole("heading", { name: "Ahamed" }));
  const row = (q: number) => sheet.locator(".mark-row", { has: C.getByRole("img", { name: new RegExp(`^Q${q}\\b`) }) });
  await row(21).getByRole("button", { name: "Right" }).click();
  await attrIs(row(21).getByRole("button", { name: "Right" }), "aria-pressed", "true");
  await row(22).getByRole("button", { name: "Wrong" }).click();
  await visible(C.locator(".toast", { hasText: "Ahamed: Q22 wrong" }));
  await shot(C, "07-correction-mark-sheet");
  await C.locator(".toast", { hasText: "Ahamed: Q22 wrong" }).getByRole("button", { name: "Undo" }).click();
  await attrIs(row(22).getByRole("button", { name: "Wrong" }), "aria-pressed", "false");
  expect((await studentByName(backend, "Ahamed")).marks["22"]).toBeUndefined();
  await row(22).getByRole("button", { name: "Wrong" }).click();
  await attrIs(row(22).getByRole("button", { name: "Wrong" }), "aria-pressed", "true");
  await sheet.getByRole("button", { name: "Close" }).click();

  // Evaluation calls Kumar (ready). Correction sends him.
  await E.locator(".qrow", { hasText: "Kumar" }).getByRole("button", { name: "Call" }).click();
  await C.locator(".call-card.evaluation").getByRole("button", { name: "Sent Kumar" }).click();
  await contains(E.locator(".inroom.evaluation"), "Kumar");

  // Theory is free and takes Kumar (needs E theory) straight from Evaluation.
  const groupE = T.locator(".group", { hasText: "Surds & approximation" });
  const kumarRow = groupE.locator(".member", { hasText: "Kumar" });
  await contains(kumarRow, "In Evaluation");
  await kumarRow.locator("input[type=checkbox]").check();
  // Only Kumar: untick everyone else in the group (Sana, and Fathima who now needs E too).
  for (const box of await groupE.locator(".member:not(:has-text('Kumar')) input").all()) {
    if (await box.isChecked()) await box.uncheck();
  }
  await groupE.getByRole("button", { name: "Call 1 to Theory" }).click();
  await contains(E.locator(".pull-banner"), "Theory wants Kumar now");
  await contains(C.locator(".pull-note"), "Kumar goes from Evaluation straight to Theory");
  await shot(E, "08-evaluation-pull");

  // Evaluation explains only Q28; Q29 stays waiting. Kumar goes straight to Theory.
  await E.locator(".pull-banner").getByRole("button", { name: "Done" }).click();
  const eSheet = E.locator(".sheet");
  await eSheet.getByRole("button", { name: /^Q29/ }).click();
  await eSheet.getByRole("button", { name: "Save: Kumar goes to Theory" }).click();
  const kumar = await studentByName(backend, "Kumar");
  expect(kumar.marks["28"]?.s).toBe("explained");
  expect(kumar.marks["29"]?.s).toBe("wrong");
  expect(kumar.room).toBe("theory");
  await contains(T.locator(".inroom.theory"), "Kumar");
  await contains(C.locator(".tile", { hasText: "Kumar" }), "In Theory");

  // Same wrong answer: Nila also gets Q22 wrong -> Fathima, Ahamed, Nila.
  await C.locator(".tile", { hasText: "Nila" }).locator(".tile-main").click();
  await C.locator(".sheet .mark-row", { has: C.getByRole("img", { name: /^Q22\b/ }) }).getByRole("button", { name: "Wrong" }).click();
  await C.locator(".sheet").getByRole("button", { name: "Close" }).click();
  const same = E.locator(".same-row", { hasText: "Ahamed" });
  await contains(same, "Nila");
  await contains(same, "Fathima");
  await shot(E, "09-evaluation-same-mistake", true);

  // Theory is busy with Kumar: Evaluation teaches Rizwan section C himself.
  const help = E.locator(".help .qrow", { hasText: "Rizwan" });
  await contains(help, "Needs C theory");
  await help.getByRole("button", { name: "Teach here" }).click();
  await C.locator(".call-card.evaluation").getByRole("button", { name: "Sent Rizwan" }).click();
  await E.locator(".inroom.evaluation").getByRole("button", { name: "Done" }).click();
  await E.locator(".sheet").getByRole("button", { name: "Save and send back to the hall" }).click();
  const rizwan = await studentByName(backend, "Rizwan");
  expect([15, 16, 17].map((q) => rizwan.marks[String(q)]?.s)).toEqual(["taught", "taught", "taught"]);

  // Theory finishes Kumar.
  await T.locator(".inroom.theory").getByRole("button", { name: "Done" }).click();
  await T.locator(".sheet").getByRole("button", { name: "Save and send back to the hall" }).click();
  expect((await studentByName(backend, "Kumar")).marks["34"]?.s).toBe("taught");

  // Keerthi arrives late.
  await C.locator(".tile", { hasText: "Keerthi" }).getByRole("button", { name: "Tap in" }).click();
  await classLacks(C.locator(".tile", { hasText: "Keerthi" }), "tone-grey");
  await shot(C, "10-correction-board-later", true);

  // End of class: report.
  await C.getByRole("button", { name: "End the session" }).click();
  await C.locator(".sheet").getByRole("button", { name: "End the session" }).click();
  await contains(C.locator(".report-hero"), "minutes students sat with nothing to do");
  await shot(C, "11-correction-report", true);
  await C.locator(".sheet").getByRole("button", { name: "Close" }).click();
  await count(C.locator(".tile.tone-grey"), 10);

  // Settings: reports, history, privacy
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "History" }).click();
  await visible(C.locator(".history li").first());
  await shot(C, "12-settings-history");
  await C.getByRole("button", { name: "Privacy" }).click();
  await shot(C, "13-settings-privacy", true);
  await C.getByRole("button", { name: "Reports" }).click();
  await C.locator(".report-row").first().click();
  await shot(C, "14-settings-report", true);

  // Small Android phone: nothing spills sideways.
  const small = await phone(backend, "theory", { ...PHONE, viewport: { width: 360, height: 740 } });
  const width = await small.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(360);
  await shot(small, "15-theory-360px", true);

  expect(problems, problems.join("\n")).toEqual([]);
});

test("adding real students, and the id type", async () => {
  const backend = makeBackend(modules);
  const C = await phone(backend, "correction");
  await C.getByRole("button", { name: "Settings" }).click();
  for (const name of ["Ahamed R", "Fathima N"]) {
    await C.getByLabel("Add a student").fill(name);
    await C.getByRole("button", { name: "Add", exact: true }).click();
    await visible(C.getByText(`Added ${name}.`));
  }
  await C.getByLabel("Add a student").fill("ahamed r");
  await C.getByRole("button", { name: "Add", exact: true }).click();
  await contains(C.locator(".toast.error"), "already on the list");
  await C.getByRole("button", { name: "Back to the class" }).click();
  await C.getByRole("button", { name: "Everyone is here: tap in all 2" }).click();
  await count(C.locator(".tile.tone-red"), 2); // both need section A theory
  const ids: Id<"students">[] = (await backend.t.run(async (ctx) => await ctx.db.query("students").collect())).map((s) => s._id);
  expect(ids).toHaveLength(2);
  expect(problems, problems.join("\n")).toEqual([]);
});
