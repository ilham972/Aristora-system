/// <reference types="vite/client" />
// One class on the register, acted out on three phones: Correction, Theory, Evaluation.

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { makeBackend, playwright, serveDist } from "./harness";

type Page = import("playwright").Page;
type Browser = import("playwright").Browser;
type L = import("playwright").Locator;

const modules = import.meta.glob("../../convex/**/*.ts");
const SHOTS = process.env.SHOTS ?? resolve("test-results/shots");
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const SAVE_WAIT = 1400; // taps save ~0.9 s after the last tap

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
  // Headless Chrome has no voices: record what the phone would say instead.
  await ctx.addInitScript(() => {
    const said: string[] = [];
    const fake = {
      speaking: false,
      pending: false,
      paused: false,
      getVoices: () => [],
      speak: (u: SpeechSynthesisUtterance) => {
        if (u.text.trim()) said.push(u.text);
      },
      cancel() {},
      pause() {},
      resume() {},
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: fake, configurable: true });
    (window as unknown as { __said: string[] }).__said = said;
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`[${role} ${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[${role} pageerror] ${e.message}`));
  await page.goto(site.url);
  return page;
}

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
const visible = (l: L) => l.first().waitFor({ state: "visible", timeout: 6000 });
const count = (l: L, n: number) => until(async () => (await l.count()) === n, `${n} of ${l}`);
const contains = (l: L, text: string) => until(async () => (await l.first().innerText()).includes(text), `"${text}" in ${l}`);
const textsAre = (l: L, list: string[]) =>
  until(async () => JSON.stringify((await l.allInnerTexts()).map((x) => x.trim())) === JSON.stringify(list), `${list.join(", ")} in ${l}`);
const shot = (p: Page, name: string, full = false) => p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full });
const said = (p: Page) => p.evaluate(() => (window as unknown as { __said: string[] }).__said);
const hears = async (p: Page, words: string) => {
  try {
    await until(async () => (await said(p)).includes(words), `phone says "${words}"`);
  } catch (e) {
    throw new Error(`${(e as Error).message}; it said: ${JSON.stringify(await said(p))}`);
  }
};
const row = (p: Page, name: string) => p.locator(".reg-row", { has: p.locator(".reg-n", { hasText: name }) });
const circle = (r: L, q: number) => r.locator(".reg-act").getByRole("button", { name: new RegExp(`^Q${q}\\b`) });

async function marksOf(backend: ReturnType<typeof makeBackend>, name: string) {
  return await backend.t.run(async (ctx) => (await ctx.db.query("students").collect()).find((s) => s.name === name)!);
}

test("the register: a whole class on three phones", async () => {
  const backend = makeBackend(modules);
  const C = await phone(backend, "correction");
  const T = await phone(backend, "theory");
  const E = await phone(backend, "evaluation");

  await visible(C.getByText("No students yet"));
  await visible(C.getByRole("button", { name: /turn on alerts/ })); // phones need one tap before they can make sound
  await C.getByRole("button", { name: "Settings" }).click();
  await count(C.locator(".sound-banner"), 0);
  await C.getByRole("button", { name: "Load 10 demo students" }).click();
  await visible(C.getByText("10 demo students loaded."));
  await C.getByRole("button", { name: "Back to the class" }).click();
  await count(C.locator(".reg-row"), 10);
  await count(C.locator(".reg-row.rt-red"), 2); // Fathima, Rizwan: no work
  await count(C.locator(".reg-row.rt-yellow"), 1); // Tharun: quiet
  await count(C.locator(".reg-row.absent"), 1); // Keerthi
  await shot(C, "r01-correction-register", true);
  await shot(T, "r02-theory-register", true);
  await shot(E, "r03-evaluation-register", true);

  // --- Correction: 1 tap right, 2 taps wrong, 3 taps slip (and no false "wrong").
  const ahamed = row(C, "Ahamed");
  await circle(ahamed, 21).click();
  await circle(ahamed, 22).click();
  await circle(ahamed, 22).click();
  await until(async () => (await circle(ahamed, 22).getAttribute("aria-label"))!.includes("wrong"), "Q22 shows wrong at once");
  const tharun = row(C, "Tharun");
  for (let i = 0; i < 3; i++) await circle(tharun, 7).click();
  await shot(C, "r04-correction-tapping");
  await C.waitForTimeout(SAVE_WAIT);
  let a = await marksOf(backend, "Ahamed");
  expect(a.marks["21"]?.s).toBe("right");
  expect(a.marks["22"]).toMatchObject({ s: "wrong", n: 1 });
  const th = await marksOf(backend, "Tharun");
  expect(th.marks["7"]?.s).toBe("slip");
  expect(th.marks["7"]?.n).toBeUndefined(); // passing through "wrong" didn't count

  // Undo from the toast
  await circle(row(C, "Nila"), 19).click();
  await C.waitForTimeout(SAVE_WAIT);
  await contains(C.locator(".toast"), "Nila: Q19 right");
  await C.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await until(async () => (await marksOf(backend, "Nila")).marks["19"] === undefined, "Nila Q19 undone");

  // --- Theory: select the D group with one tap, call them.
  await T.getByRole("button", { name: /students who need section D/ }).click();
  await textsAre(T.locator(".reg-row.sel .reg-n"), ["Ahamed", "Dilan", "Fathima", "Nila"]);
  await shot(T, "r05-theory-selected");
  await T.locator(".call-bar").getByRole("button", { name: "Call 4" }).click();

  // Correction hears the names, sees one slim strip; Dilan is out (Not now, undo, Not now), the other three are sent.
  const strip = C.locator(".call-strip.theory");
  await count(strip.locator(".call-name"), 4);
  await hears(C, "Fathima, Ahamed, Dilan and Nila, go to Theory."); // most urgent first, as Theory picked them
  expect((await strip.boundingBox())!.height).toBeLessThan(110); // was a 300 px card
  await shot(C, "r06-correction-call");
  await C.evaluate(() => window.scrollTo(0, 400));
  await until(async () => ((await strip.boundingBox())?.y ?? 0) < 120, "the strip stays under the header");
  await shot(C, "r06b-correction-call-scrolled");
  await C.evaluate(() => window.scrollTo(0, 0));
  await strip.getByRole("button", { name: "Not now: Dilan" }).click();
  await count(strip.locator(".call-name"), 3);
  await contains(C.locator(".toast"), "Dilan not sent");
  await C.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await count(strip.locator(".call-name"), 4);
  await strip.getByRole("button", { name: "Not now: Dilan" }).click();
  await count(strip.locator(".call-name"), 3);
  await strip.getByRole("button", { name: "Sent 3" }).click();
  await count(C.locator(".call-strip"), 0);

  // Theory teaches: Fathima the whole section (one tap on D), Ahamed only 23 and 24, Nila nothing yet.
  await contains(T.locator(".inroom.theory"), "Fathima");
  await row(T, "Fathima").getByRole("button", { name: "Section D: mark all theory taught" }).click();
  await circle(row(T, "Ahamed"), 23).click();
  await circle(row(T, "Ahamed"), 24).click();
  await shot(T, "r07-theory-teaching");
  expect((await T.locator(".inroom.theory").boundingBox())!.height).toBeLessThan(110);
  await T.locator(".inroom.theory").getByRole("button", { name: "Send back", exact: true }).click();
  await contains(T.locator(".toast"), "Back to the hall");
  const f = await marksOf(backend, "Fathima");
  expect([23, 24, 25, 26].map((q) => f.marks[String(q)]?.s)).toEqual(["taught", "taught", "taught", "taught"]);
  a = await marksOf(backend, "Ahamed");
  expect([23, 24, 25, 26].map((q) => a.marks[String(q)]?.s)).toEqual(["taught", "taught", undefined, undefined]);
  expect((await marksOf(backend, "Nila")).marks["23"]).toBeUndefined();
  expect(f.room).toBeUndefined();

  // --- Evaluation calls Kumar; Theory then takes him straight from the evaluation room.
  await row(E, "Kumar").locator(".reg-name").click();
  await E.locator(".call-bar").getByRole("button", { name: "Call 1" }).click();
  await hears(C, "Kumar, go to Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await contains(E.locator(".inroom.evaluation"), "Kumar");
  await row(T, "Kumar").locator(".reg-name").click();
  await T.locator(".call-bar").getByRole("button", { name: "Call 1" }).click();
  await contains(E.locator(".pull-banner"), "Theory wants Kumar now");
  await hears(E, "Theory wants Kumar now.");
  await circle(row(E, "Kumar"), 28).click(); // explained Q28 only
  await shot(E, "r08-evaluation-pull");
  await E.locator(".pull-banner").getByRole("button", { name: "Send to Theory" }).click();
  await until(async () => (await marksOf(backend, "Kumar")).room === "theory", "Kumar in Theory");
  const k = await marksOf(backend, "Kumar");
  expect(k.marks["28"]?.s).toBe("explained");
  expect(k.marks["29"]?.s).toBe("wrong");

  // Same mistake: Q22 wrong for Ahamed and Fathima -> one chip selects both.
  await E.getByRole("button", { name: /got Q22 wrong/ }).click();
  await textsAre(E.locator(".reg-row.sel .reg-n"), ["Ahamed", "Fathima"]);
  await shot(E, "r09-evaluation-same-mistake");
  await E.locator(".call-bar").getByRole("button", { name: "Clear" }).click();

  // Theory: all taught for Kumar (section E) in one tap.
  await T.locator(".inroom.theory").getByRole("button", { name: "All taught" }).click();
  await until(async () => (await marksOf(backend, "Kumar")).marks["34"]?.s === "taught", "Kumar E taught");

  // Theory busy with Tharun -> Evaluation teaches Rizwan section C itself.
  // Both rooms call at once: Correction gets two slim strips and hears both.
  await row(T, "Tharun").locator(".reg-name").click();
  await T.locator(".call-bar").getByRole("button", { name: "Call 1" }).click();
  await row(E, "Rizwan").locator(".reg-name").click();
  await E.locator(".call-bar").getByRole("button", { name: "Teach 1" }).click();
  await count(C.locator(".call-strip"), 2);
  await hears(C, "Rizwan, go to Evaluation.");
  await shot(C, "r09b-correction-two-rooms");
  const small = await phone(backend, "correction", { ...PHONE, viewport: { width: 360, height: 740 } });
  await count(small.locator(".call-strip"), 2);
  expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(small, "r09c-correction-two-rooms-360px");
  await small.context().close();
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await visible(E.locator(".inroom.evaluation").getByRole("img", { name: "section C" }));
  await shot(E, "r09d-evaluation-teaching-theory");
  await E.locator(".inroom.evaluation").getByRole("button", { name: "All taught" }).click();
  await until(async () => (await marksOf(backend, "Rizwan")).marks["15"]?.s === "taught", "Rizwan C taught");

  // Settings, Alerts: test the alert on this phone.
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Alerts", exact: true }).click();
  await contains(C.locator(".alert-status"), "Alerts are on");
  await C.getByRole("button", { name: "Test the alert" }).click();
  await until(async () => (await said(C)).some((w) => /^Test\. \w+, go to Theory\.$/.test(w)), "the test alert speaks");
  await shot(C, "r09e-settings-alerts", true);
  await C.getByRole("button", { name: "Back to the class" }).click();

  // Correction: Keerthi arrives (tap her name); open Ahamed's whole book from the strip.
  await row(C, "Keerthi").locator(".reg-name").click();
  await until(async () => (await marksOf(backend, "Keerthi")).present, "Keerthi signed in");
  await row(C, "Ahamed").locator(".reg-strip").click();
  await visible(row(C, "Ahamed").locator(".book-open"));
  await shot(C, "r10-correction-whole-book", true);
  await row(C, "Ahamed").locator(".book-open").getByRole("button", { name: /^Q18\b/ }).click(); // right -> wrong
  await C.waitForTimeout(SAVE_WAIT);
  expect((await marksOf(backend, "Ahamed")).marks["18"]?.s).toBe("wrong");

  // End of class
  await C.getByRole("button", { name: "End the session" }).click();
  await C.locator(".sheet").getByRole("button", { name: "End the session" }).click();
  await contains(C.locator(".report-hero"), "minutes students sat with nothing to do");
  await shot(C, "r11-report", true);
  await C.locator(".sheet").getByRole("button", { name: "Close" }).click();
  await count(C.locator(".reg-row.absent"), 10);

  // Small Android phone: nothing spills sideways on any tab.
  for (const role of ["correction", "theory", "evaluation"]) {
    const small = await phone(backend, role, { ...PHONE, viewport: { width: 360, height: 740 } });
    expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await shot(small, `r12-${role}-360px`, true);
    await small.context().close();
  }

  expect(problems, problems.join("\n")).toEqual([]);
});

test("a phone without the screen wake lock (iPhone 7 Plus) keeps the screen on with the silent video", async () => {
  const backend = makeBackend(modules);
  const ctx = await browser.newContext(PHONE);
  await backend.attach(ctx);
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "wakeLock", { get: () => undefined, configurable: true });
    localStorage.setItem("aristora.role", "correction");
  });
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") problems.push(`[old phone ${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[old phone pageerror] ${e.message}`));
  await page.goto(site.url);
  const videoPlaying = () => page.evaluate(() => !!document.querySelector("video") && !document.querySelector("video")!.paused);

  await page.getByRole("button", { name: /turn on alerts/ }).click();
  await until(videoPlaying, "the silent video plays");
  await count(page.locator(".sound-banner"), 0);

  // The phone was locked and opened again: the video stopped, so the banner asks for one tap.
  await page.evaluate(() => document.querySelector("video")!.pause());
  await visible(page.getByRole("button", { name: /keep the screen on/ }));
  await page.getByRole("button", { name: /keep the screen on/ }).click();
  await until(videoPlaying, "the video plays again");
  await count(page.locator(".sound-banner"), 0);
  await ctx.close();
  expect(problems, problems.join("\n")).toEqual([]);
});
