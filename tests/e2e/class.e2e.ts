/// <reference types="vite/client" />
// One class on the register, acted out on three phones: Correction, Theory, Evaluation.

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { normalizeCode, secretHash } from "../../convex/lib/auth";
import { outOf } from "../../convex/lib/book";
import { readWorkbookHtml } from "../../src/workbookFile";
import U01_BOOK from "../fixtures/workbook-g8-u01.html?raw";
import { addPerson, OWNER_TOKEN } from "../helpers";
import { makeBackend, playwright, serveDist } from "./harness";

// A FAKE answer key for the U01 skeleton, shaped like the engine's answer-key.json (real answers never go in the repo).
const U01_READ = readWorkbookHtml(U01_BOOK, "G8_U01_Workbook_source_v3.zip")[0];
const U01_KEY = {
  kind: "aristora-answer-key",
  version: 1,
  grade: 8,
  units: [
    {
      no: 1,
      code: "U01",
      questions: Array.from({ length: 73 }, (_, i) => {
        const q = i + 1;
        const m = outOf(U01_READ.data, q)!;
        return q <= 52 ? { q, part: "I", marks: 2, a: `A${q}` } : { q, part: "II", marks: m, a: [{ p: "i", a: `work → **B${q}**`, m }] };
      }),
    },
  ],
};

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

/** A class backend with the owner's account (every phone below is the owner's unless it says otherwise). */
async function newClass() {
  const backend = makeBackend(modules);
  await addPerson(backend.t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  return backend;
}

/** A phone on one tab, signed in with this key (null: not signed in), opening `at` (default: the app). */
async function phone(
  backend: ReturnType<typeof makeBackend>,
  role: string,
  size = PHONE,
  token: string | null = OWNER_TOKEN,
  at?: string,
): Promise<Page> {
  const ctx = await browser.newContext(size);
  await backend.attach(ctx);
  await ctx.addInitScript(([r, tk]) => {
    if (sessionStorage.getItem("aristora.test.started")) return; // only on the first load
    sessionStorage.setItem("aristora.test.started", "1");
    // "correction" opens the Class tab (as before 29 Oct 2026), "focus" the Focus page, "theory"/"evaluation" those tabs.
    localStorage.setItem("aristora.role", r!);
    if (tk) localStorage.setItem("aristora.token", tk);
  }, [role, token] as const);
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
  await page.goto(at ?? site.url);
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
/** Like contains, but reads the words as written (headings drawn in capitals look different to innerText). */
const says = (l: L, text: string) => until(async () => ((await l.first().textContent()) ?? "").includes(text), `"${text}" in ${l}`);
const textsAre = (l: L, list: string[]) =>
  until(async () => JSON.stringify((await l.allInnerTexts()).map((x) => x.trim())) === JSON.stringify(list), `${list.join(", ")} in ${l}`);
/** The same names, in any order. */
const namesAre = (l: L, list: string[]) =>
  until(
    async () => JSON.stringify((await l.allInnerTexts()).map((x) => x.trim()).sort()) === JSON.stringify([...list].sort()),
    `${list.join(", ")} in ${l}`,
  );
/** The top bar's buttons (Attendance, Focus, Progress) never run into the clock and Settings. */
const topFits = (p: Page) =>
  p.evaluate(() => {
    const left = document.querySelector(".top-left")!.lastElementChild!.getBoundingClientRect();
    const meta = document.querySelector(".top-meta")!.getBoundingClientRect();
    return left.right <= meta.left + 0.5 && meta.right <= window.innerWidth + 0.5;
  });
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
/** The bottom bar's tabs: Class (everyone's), Theory, Evaluation. */
const tab = (p: Page, name: "Class" | "Theory" | "Evaluation") => p.locator(".tabs").getByRole("button", { name, exact: true });
/** The Theory page: a lesson's card (opened from Soon when it is there). */
async function lessonCard(p: Page, title: string): Promise<L> {
  const card = p.locator(".tp-card", { has: p.locator(".tf-title b", { hasText: title }) });
  const soon = p.locator(".tp-soon", { has: p.locator(".tp-soon-t b", { hasText: title }) });
  await until(async () => (await card.count()) + (await soon.count()) > 0, `the ${title} lesson on the Theory page`);
  if ((await card.count()) === 0) await soon.first().click();
  await visible(card);
  return card;
}
/** A student on a Theory card (tap: ticked or not). */
const chip = (card: L, name: string) => card.locator(".tp-m", { has: card.page().locator("b", { hasText: name }) });
/** Tick exactly these students on a Theory card, then Call. */
async function callOnly(card: L, names: string[]) {
  const chips = card.locator(".tp-m");
  const n = await chips.count();
  for (let i = 0; i < n; i++) {
    const c = chips.nth(i);
    const name = ((await c.locator("b").textContent()) ?? "").trim();
    if (((await c.getAttribute("aria-pressed")) === "true") !== names.includes(name)) await c.click();
  }
  await contains(card.locator(".tp-call"), `Call ${names.length}`);
  await card.locator(".tp-call").click();
}

/** The student, with the marks of the book he is on now (theory-book marks, or the workbook state m). */
async function marksOf(backend: ReturnType<typeof makeBackend>, name: string) {
  return await backend.t.run(async (ctx) => {
    const s = (await ctx.db.query("students").collect()).find((x) => x.name === name)!;
    const all = await ctx.db
      .query("progress")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect();
    const p = all.find((x) => x.unitId === s.unitId && x.stage === s.stage);
    const unit = s.unitId ? await ctx.db.get(s.unitId) : null;
    return { ...s, marks: p?.marks ?? {}, m: p?.m, unitKey: unit?.key, progress: all };
  });
}

test("the register: a whole class on three phones", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  const T = await phone(backend, "theory");
  const E = await phone(backend, "evaluation");

  await visible(C.getByText("No students yet"));
  await visible(C.getByRole("button", { name: /turn on alerts/ })); // phones need one tap before they can make sound
  await C.getByRole("button", { name: "Settings" }).click();
  await count(C.locator(".sound-banner"), 0);
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  // Only the 13 signed in are on the register (Keerthi isn't here yet); no page title or logo in the top bar.
  await count(C.locator(".reg-row"), 13);
  await count(row(C, "Keerthi"), 0);
  await count(C.locator(".top h1, .top .role-mark"), 0);
  await contains(C.getByRole("button", { name: /^Attendance/ }), "13");
  await namesAre(C.locator(".reg-row.rt-red .reg-n"), ["Fathima", "Rizwan", "Vimal"]); // no work (Vimal: every level waits)
  await count(C.locator(".reg-row.rt-yellow"), 1); // Tharun: quiet
  await shot(C, "r01-correction-register", true);
  await shot(T, "r02-theory-page", true);
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

  // --- Theory: the D lesson, everyone who needs it ticked; one tap calls them.
  const dCard = await lessonCard(T, "Completing the square");
  await namesAre(dCard.locator(".tp-m.on b"), ["Ahamed", "Dilan", "Fathima", "Nila"]);
  await shot(T, "r05-theory-next");
  await dCard.getByRole("button", { name: "Call 4" }).click();

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

  // Theory teaches on the Class tab's rows (Theory's "All" lives there now): Fathima the whole section (one tap on D),
  // Ahamed only 23 and 24, Nila nothing yet. Then the Theory page sends everyone back, keeping only those taps.
  await namesAre(T.locator(".tp-room .tp-got b"), ["Ahamed", "Fathima", "Nila"]);
  await tab(T, "Class").click();
  await row(T, "Fathima").getByRole("button", { name: "Section D: mark all theory taught" }).click();
  await circle(row(T, "Ahamed"), 23).click();
  await circle(row(T, "Ahamed"), 24).click();
  await shot(T, "r07-theory-teaching-on-class");
  await tab(T, "Theory").click();
  await T.locator(".tp-room").getByRole("button", { name: "Send everyone back: nothing taught" }).click();
  await contains(T.locator(".toast"), "back to the hall, not taught");
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
  const eCard = await lessonCard(T, "Surds & approximation");
  await contains(chip(eCard, "Kumar").locator("small"), "in Eval"); // listed, not ticked: calling takes him from Evaluation
  expect(await chip(eCard, "Kumar").getAttribute("aria-pressed")).toBe("false");
  await callOnly(eCard, ["Kumar"]);
  await contains(E.locator(".pull-banner"), "Theory wants Kumar now");
  await hears(E, "Theory wants Kumar now.");
  await circle(row(E, "Kumar"), 28).click(); // explained Q28 only
  await shot(E, "r08-evaluation-pull");
  await E.locator(".pull-banner").getByRole("button", { name: "Send to Theory" }).click();
  await until(async () => (await marksOf(backend, "Kumar")).room === "theory", "Kumar in Theory");
  const k = await marksOf(backend, "Kumar");
  expect(k.marks["28"]?.s).toBe("explained");
  expect(k.marks["29"]?.s).toBe("wrong");

  // Same mistake: U13 Q22 wrong for Ahamed and Fathima -> one chip selects both.
  await E.getByRole("button", { name: /got U13 Q22 wrong/ }).click();
  await textsAre(E.locator(".reg-row.sel .reg-n"), ["Ahamed", "Fathima"]);
  await shot(E, "r09-evaluation-same-mistake");
  await E.locator(".call-bar").getByRole("button", { name: "Clear" }).click();

  // Theory: all taught for Kumar (section E) in one tap.
  await T.locator(".tp-room", { hasText: "Kumar" }).getByRole("button", { name: /^Done/ }).click();
  await until(async () => (await marksOf(backend, "Kumar")).marks["34"]?.s === "taught", "Kumar E taught");

  // Theory busy with Tharun -> Evaluation teaches Rizwan section C itself.
  // Both rooms call at once: Correction gets two slim strips and hears both.
  await callOnly(await lessonCard(T, "Expand & simplify"), ["Tharun"]);
  await contains(row(E, "Tharun").locator(".reg-s"), "Called: Theory"); // Evaluation's phone knows Theory is busy
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

  // Attendance (top left): grades 6-11 in one row. Keerthi (Grade 11) arrives: one tap signs her in with the time.
  await C.getByRole("button", { name: /^Attendance/ }).click();
  const grades = C.locator(".grade-row button");
  await textsAre(grades.locator("b"), ["6", "7", "8", "9", "10", "11"]);
  const tops = await grades.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1); // one row
  await C.getByRole("button", { name: /^Grade 11\b/ }).click();
  await contains(C.locator(".attendance .summary"), "Grade 11: 9 of 10 here");
  await contains(C.getByRole("button", { name: /^Grade 7\b/ }), "3/3");
  await textsAre(C.locator(".att-list .ap.in .ap-n"), ["Ahamed", "Dilan", "Fathima", "Kumar", "Nila", "Rizwan", "Sana", "Tharun", "Yasmin"]);
  const keerthi = C.getByRole("button", { name: /^Keerthi:/ });
  await keerthi.click();
  await until(async () => (await marksOf(backend, "Keerthi")).present, "Keerthi signed in");
  await contains(C.locator(".toast"), "Keerthi signed in, ");
  // A wrong tap: Undo takes it back as if it never happened.
  await C.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await until(async () => !(await marksOf(backend, "Keerthi")).present, "Keerthi's sign-in taken back");
  const visitsOf = (name: string) =>
    backend.t.run(async (ctx) => {
      const s = (await ctx.db.query("students").collect()).find((x) => x.name === name)!;
      return await ctx.db
        .query("attendance")
        .withIndex("by_student", (q) => q.eq("studentId", s._id))
        .collect();
    });
  expect(await visitsOf("Keerthi")).toHaveLength(0);
  await keerthi.click();
  await until(async () => (await marksOf(backend, "Keerthi")).present, "Keerthi signed in again");
  await contains(keerthi, "✓");
  await contains(C.locator(".attendance .summary"), "Grade 11: 10 of 10 here");
  expect(await visitsOf("Keerthi")).toHaveLength(1);
  await tab(T, "Class").click();
  await visible(row(T, "Keerthi")); // Theory sees her at once
  await tab(T, "Theory").click();
  await shot(C, "r10a-attendance", true);
  // Tapping someone who is here asks before signing them out.
  await C.getByRole("button", { name: /^Keerthi:/ }).click();
  await contains(C.locator(".sheet h2"), "Keerthi");
  await visible(C.locator(".sheet").getByRole("button", { name: "Sign out: going home" }));
  await C.locator(".sheet").getByRole("button", { name: "Keep" }).click();
  // The phone remembers the last grade on this page.
  await C.getByRole("button", { name: /^Grade 7\b/ }).click();
  await textsAre(C.locator(".att-list .ap-n"), ["Malik", "Priya", "Vimal"]);
  await C.reload();
  await C.getByRole("button", { name: /^Attendance/ }).click();
  await until(async () => (await C.getByRole("button", { name: /^Grade 7\b/ }).getAttribute("aria-pressed")) === "true", "Grade 7 remembered");
  await C.getByRole("button", { name: /^Grade 11\b/ }).click();
  await tab(C, "Class").click();
  await visible(row(C, "Keerthi"));

  // Correction: open Ahamed's whole book from the strip.
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
  // Everyone signed out: an empty register, the visits closed, and the workbook levels still waiting stay reachable.
  await visible(C.getByText("Nobody is signed in yet"));
  await namesAre(C.locator(".gone .reg-n"), ["Malik", "Vimal"]);
  await contains(row(C, "Vimal").locator(".reg-s"), "Correct L8"); // his last level, handed in before he left
  const open = await backend.t.run(async (ctx) => (await ctx.db.query("attendance").collect()).filter((a) => a.outAt === undefined).length);
  expect(open).toBe(0);
  await shot(C, "r11b-correction-after-class", true);
  await C.getByRole("button", { name: "Open Attendance" }).click();
  await count(C.locator(".att-list .ap.in"), 0);
  await count(C.locator(".att-list .ap.left"), 10); // all of Grade 11 went home
  await tab(C, "Class").click();

  // Attendance on the smallest phones (360 px Redmi, 320 px): the six grades stay in one row, nothing sideways.
  for (const [width, grade, name] of [
    [360, 11, "Ahamed"],
    [320, 7, "Malik"],
  ] as const) {
    const small = await phone(backend, "correction", { ...PHONE, viewport: { width, height: 640 } });
    await small.getByRole("button", { name: /^Attendance/ }).click();
    await small.getByRole("button", { name: new RegExp(`^Grade ${grade}\\b`) }).click();
    await small.getByRole("button", { name: new RegExp(`^${name}:`) }).click();
    await until(async () => (await marksOf(backend, name)).present, `${name} signed in`);
    await count(small.locator(".sheet"), 0);
    const rows = await small
      .locator(".grade-row button")
      .evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size);
    expect(rows).toBe(1);
    expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await shot(small, `r13-attendance-${width}px`, true);
    await small.context().close();
  }

  // Small Android phone: nothing spills sideways on any page (two grades in class: Ahamed G11, Malik G7).
  for (const role of ["correction", "theory", "evaluation"]) {
    const small = await phone(backend, role, { ...PHONE, viewport: { width: 360, height: 740 } });
    if (role === "theory") await visible(small.locator(".tp-page .tp-sum"));
    else {
      await visible(row(small, "Ahamed")); // loaded, then measure
      await textsAre(small.locator(".grade-pills .gp b"), ["All", "7", "11"]);
    }
    expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    expect(await topFits(small), "the top bar fits at 360 px").toBe(true);
    await shot(small, `r12-${role}-360px`, true);
    await small.context().close();
  }

  expect(problems, problems.join("\n")).toEqual([]);
});

test("Master: workbook levels corrected, lost marks explained, re-teach, Exam Sprint and back", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  const T = await phone(backend, "theory");
  const E = await phone(backend, "evaluation");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  await count(C.locator(".reg-row"), 13);

  // Grade pills: every tab can look at one grade; each pill says what waits for this teacher there.
  await textsAre(C.locator(".grade-pills .gp b"), ["All", "7", "9", "11"]); // numbers only, one row
  await until(async () => (await C.locator(".reg-grade").allTextContents()).join("|") === "Grade 7|Grade 9|Grade 11", "grade headers");
  // Correction: Vimal (G7) waits for marks = red; Tharun (G11) is quiet = amber; nothing in G9.
  expect(await C.getByRole("button", { name: /^Grade 7:/ }).getAttribute("aria-label")).toBe("Grade 7: 3 here, 1 need you now");
  expect(await C.getByRole("button", { name: /^Grade 11:/ }).getAttribute("aria-label")).toBe("Grade 11: 9 here, 1 need you soon");
  expect(await C.getByRole("button", { name: /^Grade 9:/ }).getAttribute("aria-label")).toBe("Grade 9: 1 here");
  await C.getByRole("button", { name: /^Grade 7:/ }).click();
  await count(C.locator(".reg-row"), 3);
  await count(C.locator(".reg-grade"), 0);
  await contains(C.locator(".summary"), "1 with no work");
  await shot(C, "m00-correction-grade-7");
  await C.getByRole("button", { name: /^All grades:/ }).click();
  await count(C.locator(".reg-row"), 13);
  // Theory, on the Class tab (its rows are Theory's), looks at Grade 11 only (the phone remembers it).
  await tab(T, "Class").click();
  await T.getByRole("button", { name: /^Grade 11:/ }).click();
  await count(T.locator(".reg-row"), 9); // Keerthi isn't signed in

  // Correction sees every grade in one register. Malik handed Level 3 in 6 minutes ago and is on Level 4.
  // No level buttons on the rows any more (papers are marked in Focus): his words and his bar say it.
  const malik = row(C, "Malik");
  await count(C.locator(".reg-row .lv-pill"), 0);
  await contains(malik.locator(".reg-s"), "Correct L3 6m");
  await contains(malik.locator(".strip-tag"), "G7 · U08");
  await contains(row(C, "Zainab").locator(".strip-tag"), "G9 · U21");
  await contains(row(C, "Vimal").locator(".reg-s"), "No work"); // every level handed in, waiting for marks
  // The bar shows where each one is: Malik's L3 (waiting, amber) and L4 (working, dark) share one marker.
  await textsAre(malik.locator(".mk b"), ["L3", "4"]);
  await textsAre(row(C, "Vimal").locator(".mk b"), ["L8"]);
  await textsAre(row(C, "Priya").locator(".mk b"), ["L2"]);
  await shot(C, "m01-correction-three-grades", true);

  // G7 U08 gets an answer key (a fake one): the correction sheet shows each answer under its marks.
  await backend.t.run(async (ctx) => {
    const u = (await ctx.db
      .query("units")
      .withIndex("by_key", (q) => q.eq("key", "G7-U08"))
      .first())!;
    const answers = Array.from({ length: 57 }, (_, i) => {
      const q = i + 1;
      if (q === 24) return { q, a: "−3 + 5 = **2**" };
      return q <= 37 ? { q, a: `A${q}` } : { q, parts: [{ p: "i", a: `a longer working line, then → **B${q}**`, m: 2 }, { p: "ii", a: `C${q}` }] };
    });
    await ctx.db.insert("keys", { unitId: u._id, answers, updatedAt: Date.now() });
  });

  // Tap his name: his buttons come first (going home, Theory, Move), then his book. Level 3 in the marks table: all
  // full marks, then Q24 lost both marks.
  await malik.locator(".reg-name").click();
  await textsAre(malik.locator(".book-acts button"), ["Going home", "Needs theory", "Move: unit or stage"]);
  await malik.getByRole("button", { name: /^Level 3, questions 21 to 30/ }).click();
  const sheet = C.locator(".sheet");
  await contains(sheet.locator("h2"), "Malik · Level 3");
  await contains(sheet.locator(".ct-row", { hasText: "Q24" }).locator(".ct-key"), "−3 + 5 = 2");
  await contains(sheet.locator(".ct-row", { hasText: "Q24" }).locator(".ct-key b"), "2");
  await contains(sheet.locator(".ct-row", { hasText: "Q25" }).locator(".ct-key"), "A25");
  await sheet.getByRole("button", { name: "All full marks" }).click();
  await contains(sheet.locator(".ct-sum"), "20 / 20 · 100%");
  await sheet.getByRole("button", { name: "Q24: 0 of 2" }).click();
  await contains(sheet.locator(".ct-sum"), "18 / 20 · 90%");
  await shot(C, "m02-correct-level");
  await sheet.getByRole("button", { name: "Save 18 / 20" }).click();
  await contains(C.locator(".toast"), "Malik: Level 3 18 / 20. Unit 36% so far.");
  let m = (await marksOf(backend, "Malik")).m!;
  expect(m.lv["3"]).toMatchObject({ got: 18, by: "correction" });
  expect(m.q["24"]).toMatchObject({ got: 0, max: 2, lost: true });
  expect(m.q["25"]).toMatchObject({ got: 2, max: 2, lost: false });
  await textsAre(malik.locator(".mk b"), ["L4"]);
  await malik.locator(".reg-name").click(); // closes his book

  // Priya hands Level 2 in: in Focus (the target at the top) tap her name, then Later. It waits; she goes on to Level 3.
  await C.getByRole("button", { name: /^Focus/ }).click();
  await C.locator(".fc-pill", { hasText: "Priya" }).click();
  await contains(C.locator(".fc-where"), "L2");
  await C.getByRole("button", { name: "Handed in: correct later" }).click();
  await contains(C.locator(".toast"), "Priya: Level 2 handed in");
  await count(C.locator(".fc-paper"), 0);
  await contains(C.getByRole("button", { name: /^Focus/ }), "2"); // two papers wait: Priya's L2 and Vimal's L8
  await C.getByRole("button", { name: /^Focus/ }).click(); // back to the class
  await textsAre(row(C, "Priya").locator(".mk b"), ["L2", "3"]);
  expect((await marksOf(backend, "Priya")).m!.lv["2"]?.done).toBeGreaterThan(0);

  // Evaluation: Malik's lost marks are red circles; tap Q24 when it's explained.
  const em = row(E, "Malik");
  await textsAre(em.locator(".reg-act .q"), ["4", "13", "17", "24"]);
  await shot(E, "m03-evaluation-lost-marks", true);
  await em.locator(".reg-act").getByRole("button", { name: /^Q24\b/ }).click();
  await until(async () => (await marksOf(backend, "Malik")).m!.q["24"]?.x !== undefined, "Malik Q24 explained");
  await until(async () => (await em.locator(".reg-act .q[data-s=explained]").count()) === 1, "Q24 turns violet");

  // Evaluation sees Malik forgot the theory behind Q13 and Q17: "→ Theory" sends them; he carries on working.
  await em.getByRole("button", { name: "Malik needs theory: choose the questions" }).click();
  const ts = E.locator(".sheet");
  await contains(ts.locator("h2"), "Malik · Needs theory");
  await textsAre(ts.locator(".th-q.on b"), ["Q4", "Q13", "Q17"]); // the ones not explained yet
  await ts.getByRole("button", { name: "Q4", exact: true }).click();
  await textsAre(ts.locator(".th-q.on b"), ["Q13", "Q17"]);
  await shot(E, "m03b-evaluation-needs-theory");
  await ts.getByRole("button", { name: "Send to Theory" }).click();
  await contains(E.locator(".toast"), "Malik: Q13 Q17 for Theory. He carries on; Theory calls him.");
  expect((await marksOf(backend, "Malik")).m!.q["13"]).toMatchObject({ th: expect.any(Number), tb: "evaluation" });
  await textsAre(em.locator(".reg-act .q"), ["4", "24"]);
  // Correction sees where Malik goes next.
  await contains(malik.locator(".to-chip.theory b"), "2");
  await contains(malik.locator(".to-chip.evaluation b"), "1");

  // Evaluation calls Vimal, explains everything in the room.
  await row(E, "Vimal").locator(".reg-name").click();
  await E.locator(".call-bar").getByRole("button", { name: "Call 1" }).click();
  await hears(C, "Vimal, go to Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await contains(E.locator(".inroom.evaluation"), "Vimal");
  await E.locator(".inroom.evaluation").getByRole("button", { name: "All explained" }).click();
  await until(async () => {
    const v = (await marksOf(backend, "Vimal")).m!;
    return v.q["22"]?.x !== undefined && v.q["51"]?.x !== undefined;
  }, "Vimal Q22 and Q51 explained");

  // Correction marks Vimal's Level 8 (his marks table): he couldn't even start Q57 ("?"), so it goes straight to Theory.
  await row(C, "Vimal").locator(".reg-strip").click();
  await row(C, "Vimal").getByRole("button", { name: /^Level 8, questions 56 to 57/ }).click();
  const vs = C.locator(".sheet");
  await contains(vs.locator("h2"), "Vimal · Level 8");
  await vs.getByRole("button", { name: "All full marks" }).click();
  await vs.getByRole("button", { name: "Q57: couldn't start it (to Theory)" }).click();
  await contains(vs.locator(".ct-dk"), "Q57: couldn't start, so straight to Theory.");
  await shot(C, "m03c-correct-question-mark");
  await vs.getByRole("button", { name: /^Save / }).click();
  await contains(C.locator(".toast"), "Theory: Q57.");
  expect((await marksOf(backend, "Vimal")).m!.q["57"]).toMatchObject({ dk: true, got: 0, tb: "correction" });
  await contains(row(C, "Vimal").locator(".to-chip.theory b"), "1");
  await row(C, "Vimal").locator(".reg-strip").click(); // closes his book

  // Correction opens Malik's workbook (the marks table) and asks for the unit to be taught again.
  await malik.locator(".reg-strip").click();
  await visible(malik.locator(".mtable"));
  await contains(malik.locator(".mt-unit"), "52 / 146");
  await shot(C, "m04-correction-marks-table", true);
  await visible(malik.getByRole("button", { name: "Theory: Q13 Q17 ✓" }));
  // Theory is looking at Grade 11: the Grade 7 pill lights up for Malik.
  const g7 = T.getByRole("button", { name: /^Grade 7:/ });
  await until(async () => /need you/.test((await g7.getAttribute("aria-label")) ?? ""), "Theory's Grade 7 pill shows Malik");
  await visible(g7.locator(".gp-badge"));
  await shot(T, "m04b-theory-grade-7-waiting");
  await g7.click();
  await count(T.locator(".reg-row"), 3);

  // Theory sees the questions sent to it: Malik Q13 Q17 (still working), Vimal Q57 (nothing else to do: red).
  const tm = row(T, "Malik");
  await textsAre(tm.locator(".reg-act .q"), ["13", "17"]);
  await contains(tm.locator(".reg-s"), "Q13 Q17");
  await contains(row(T, "Vimal").locator(".reg-s"), "No work");
  await textsAre(row(T, "Vimal").locator(".reg-act .q"), ["57"]);
  // The Theory page: one workbook card for everyone with questions for Theory (no question shared by both); this time
  // Theory takes Malik only.
  await tab(T, "Theory").click();
  const wCard = await lessonCard(T, "Directed numbers: workbook");
  await namesAre(wCard.locator(".tp-m b"), ["Malik", "Vimal"]);
  expect(await wCard.locator(".tf-tag").textContent()).not.toContain("×");
  await contains(chip(wCard, "Vimal").locator("small"), "no work");
  await callOnly(wCard, ["Malik"]);
  await hears(C, "Malik, go to Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  const wRoom = T.locator(".tp-room", { hasText: "Directed numbers: workbook" });
  await says(wRoom.locator(".tf-kicker"), "With you");
  await count(wRoom.locator(".tp-c"), 0); // sent: he is in the room
  await until(async () => (await marksOf(backend, "Malik")).room === "theory", "Malik in Theory");
  // Q13 taught; the bell rang before Q17: it stays with Theory.
  await wRoom.getByRole("button", { name: "Malik Q17 taught" }).click();
  await shot(T, "m05-theory-reteach");
  await wRoom.getByRole("button", { name: /^Done/ }).click();
  await until(async () => (await marksOf(backend, "Malik")).room === undefined, "Malik back in the hall");
  let mt = (await marksOf(backend, "Malik")).m!;
  expect(mt.q["13"]?.tt).toBeDefined();
  expect([mt.q["17"]?.th !== undefined, mt.q["17"]?.tt]).toEqual([true, undefined]);
  await count(T.locator(".tp-room"), 0); // Theory's phone sees him gone before calling again
  await tab(T, "Class").click();
  await textsAre(tm.locator(".reg-act .q"), ["13", "17"]); // Q13 just taught (tap to undo), Q17 still to teach
  await tab(T, "Theory").click();
  await callOnly(await lessonCard(T, "Directed numbers: workbook"), ["Malik"]);
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await T.locator(".tp-room", { hasText: "Malik" }).getByRole("button", { name: /^Done/ }).click();
  await until(async () => (await marksOf(backend, "Malik")).m!.q["17"]?.tt !== undefined, "Q17 taught");
  await visible(malik.getByRole("button", { name: "Needs theory", exact: true }));
  // The whole unit can be asked from the open book too, and taken back.
  await malik.getByRole("button", { name: "Needs theory", exact: true }).click();
  const ws = C.locator(".sheet");
  await contains(ws.locator("h2"), "Malik · Needs theory");
  await ws.getByRole("button", { name: "Q4", exact: true }).click(); // only the unit, not Q4
  await ws.getByLabel("The whole unit again (he forgot it all)").check();
  await ws.getByRole("button", { name: "Send to Theory" }).click();
  await until(async () => (await marksOf(backend, "Malik")).m!.reteach !== undefined, "whole unit asked");
  await malik.getByRole("button", { name: "Theory: Whole unit ✓" }).click();
  await C.locator(".sheet").getByLabel("The whole unit again (he forgot it all)").uncheck();
  await C.locator(".sheet").getByRole("button", { name: "Take back from Theory" }).click();
  await until(async () => (await marksOf(backend, "Malik")).m!.reteach === undefined, "whole unit taken back");
  mt = (await marksOf(backend, "Malik")).m!;
  expect(mt.q["4"]?.th).toBeUndefined();

  // Exam Sprint before the exam, then back to the same workbook with nothing lost.
  const priya = row(C, "Priya");
  await priya.locator(".reg-strip").click();
  await priya.getByRole("button", { name: "Move: unit or stage" }).click();
  await contains(C.locator(".sheet h2"), "Move Priya");
  await shot(C, "m06-move-sheet");
  await C.locator(".sheet").getByRole("button", { name: "Exam Sprint: the exam is close" }).click();
  await contains(C.locator(".toast"), "Priya: Exam Sprint, Grade 7, Term 1.");
  let p = await marksOf(backend, "Priya");
  expect(p.stage).toBe("sprint");
  expect(p.back).toMatchObject({ stage: "master", term: 1 });
  await contains(priya.locator(".strip-tag b"), "S");
  await priya.getByRole("button", { name: "Move: unit or stage" }).click();
  await C.locator(".sheet").getByRole("button", { name: /^Back to Master: U08/ }).click();
  await until(async () => (await marksOf(backend, "Priya")).stage === "master", "Priya back in Master");
  p = await marksOf(backend, "Priya");
  expect(p.unitKey).toBe("G7-U08");
  expect(p.back).toBeUndefined();
  expect(p.m!.lv["1"]?.fixed).toBeGreaterThan(0);
  expect(p.m!.lv["2"]?.done).toBeGreaterThan(0);
  await textsAre(priya.locator(".mk b"), ["L2", "3"]);

  // Settings → Students: the grade pill filters the list and is the grade of the new student; the owner's numbers.
  await C.getByRole("button", { name: "Settings" }).click();
  await contains(C.locator(".stats"), "+14 demo, not counted");
  await contains(C.locator(".stats .stat").first(), "0");
  await contains(C.getByRole("button", { name: /^Grade 11\b/ }), "10");
  await C.getByRole("button", { name: /^Grade 7\b/ }).click();
  await contains(C.locator(".add-form label"), "Add a student to Grade 7");
  await textsAre(C.locator(".settings-body > .plain-list .st-who > span:first-child"), ["MalikDemo", "PriyaDemo", "VimalDemo"]);
  await C.getByLabel("Add a student to Grade 7").fill("Hana M");
  await C.getByRole("button", { name: "Add", exact: true }).click();
  await contains(C.locator(".toast"), "Added Hana M to Grade 7");
  await textsAre(C.locator(".settings-body > .plain-list .st-who > span:first-child"), ["Hana M", "MalikDemo", "PriyaDemo", "VimalDemo"]);
  await contains(C.locator(".list-title"), "Grade 7 · 4 students");
  await contains(C.locator(".stats .stat").first(), "1");
  await contains(C.locator(".stats .stat").nth(1), "+1");
  expect((await marksOf(backend, "Hana M")).grade).toBe(7);
  await C.getByRole("button", { name: /^Grade 9\b/ }).click();
  await textsAre(C.locator(".settings-body > .plain-list .st-who > span:first-child"), ["ZainabDemo"]);
  await shot(C, "m06b-students-page", true);
  await C.getByRole("button", { name: /^Grade 7\b/ }).click();

  // Owner: a new workbook from its contents page and marks table (Grade 8 U01).
  await C.getByRole("button", { name: "Books", exact: true }).click();
  await C.locator(".unit-list").getByRole("button", { name: /^U01/ }).first().click();
  const us = C.locator(".sheet");
  await us.getByLabel("Part I ends at question", { exact: true }).fill("30");
  await us.getByLabel("Part II ends at question", { exact: true }).fill("45");
  await us.getByRole("button", { name: "Part I in tens" }).click();
  await count(us.locator(".wb-lr"), 3);
  await us.getByRole("button", { name: "Add a level" }).click();
  await us.getByLabel("Level 4: last question").fill("38");
  await us.getByLabel("Level 4: marks").fill("20");
  await us.getByRole("button", { name: "Add a level" }).click();
  await us.getByLabel("Level 5: last question").fill("45");
  await us.getByLabel("Level 5: marks").fill("25");
  await contains(us.locator(".wb-levels .muted"), "Total: 105 marks");
  await shot(C, "m07-books-workbook-form");
  await us.getByRole("button", { name: "Save the workbook" }).click();
  await contains(C.locator(".toast"), "U01 workbook saved: 5 levels.");
  const saved = await backend.t.run(async (ctx) => {
    const u = await ctx.db
      .query("units")
      .withIndex("by_key", (q) => q.eq("key", "G8-U01"))
      .first();
    return await ctx.db
      .query("books")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", u!._id).eq("stage", "master"))
      .first();
  });
  expect(saved?.data).toMatchObject({
    kind: "master",
    parts: [
      { id: "I", from: 1, to: 30, kind: "short", each: 2 },
      { id: "II", from: 31, to: 45, kind: "cards" },
    ],
  });
  expect((saved?.data as { levels: { max: number }[] }).levels.map((l) => l.max)).toEqual([20, 20, 20, 20, 25]);
  await shot(C, "m08-books-grade8", true);

  // Upload workbooks: the unit zips from the workbook chats, read on the phone, checked, saved in one tap.
  // U01's real book replaces the typed one; a broken U02 is refused with the reason.
  const zipOf = (html: string, key?: unknown) =>
    Buffer.from(
      zipSync({
        "book.html": strToU8(html),
        "u01.py": strToU8("# not read"),
        ...(key ? { "answer-key.json": strToU8(JSON.stringify(key)) } : {}),
      }),
    );
  const brokenU02 = U01_BOOK.replace("அலகு 1 · எண்கோலங்கள்", "அலகு 2 · சுற்றளவு").replace(
    '<span class="qn">53</span>\n<span class="pm">(1 புள்ளி)',
    '<span class="qn">53</span>\n<span class="pm">(2 புள்ளிகள்)',
  );
  const upload = C.locator(".upload-btn input[type=file]");
  await upload.setInputFiles([
    { name: "G8_U01_Workbook_source_v3.zip", mimeType: "application/zip", buffer: zipOf(U01_BOOK, U01_KEY) },
    { name: "G8_U02_Workbook_source_v1.zip", mimeType: "application/zip", buffer: zipOf(brokenU02) },
  ]);
  const up = C.locator(".sheet");
  await contains(up.locator("h2"), "2 workbooks found");
  await contains(up.locator(".up-replace"), "G8 · U01");
  await contains(up.locator(".up-replace"), "Part I 1–52 · Part II 53–73 · 12 levels · 230 marks");
  await contains(up.locator(".up-replace .up-state"), "Replaces the one in the app (5 levels, 105 marks)");
  await contains(up.locator(".up-replace .up-key.ok"), "✓ Answer key: all 73 questions");
  await contains(up.locator(".up-bad"), "Level 6 prints / 18, but its questions add up to 19.");
  await shot(C, "m08b-upload-workbooks");
  await up.getByRole("button", { name: "Save 1 workbook" }).click();
  await contains(C.locator(".toast"), "Saved G8 · U01 Number patterns with its answer key");
  const keyRow = C.locator(".unit-list li", { hasText: "U01" });
  await textsAre(keyRow.locator("i.has"), ["M", "K"]);
  await shot(C, "m08c-books-with-key", true);
  expect(await backend.t.run(async (ctx) => (await ctx.db.query("keys").collect()).map((k) => k.answers.length).sort())).toEqual([57, 73]);
  const uploaded = await backend.t.run(async (ctx) => {
    const u = await ctx.db
      .query("units")
      .withIndex("by_key", (q) => q.eq("key", "G8-U01"))
      .first();
    return (await ctx.db
      .query("books")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", u!._id).eq("stage", "master"))
      .first())!.data as { levels: { max: number }[]; marks: Record<string, number> };
  });
  expect(uploaded.levels.map((l) => l.max)).toEqual([20, 20, 20, 20, 24, 18, 22, 20, 19, 18, 20, 9]);
  expect(uploaded.marks["63"]).toBe(11);
  await contains(C.getByRole("button", { name: /^Grade 8\b/ }), "1/");
  // The same book again without a key: nothing to save, the key stays.
  await upload.setInputFiles([{ name: "G8_U01_Workbook_source_v3.zip", mimeType: "application/zip", buffer: zipOf(U01_BOOK) }]);
  await contains(C.locator(".sheet .up-same .up-state"), "Already in the app");
  await contains(C.locator(".sheet .up-same .up-key"), "Keeps the answer key already in the app");
  await visible(C.locator(".sheet").getByRole("button", { name: "Nothing to save" }));
  await C.locator(".sheet").getByRole("button", { name: "Cancel" }).click();
  await C.getByRole("button", { name: "Back to the class" }).click();

  // Small Android phone: the correction sheet and the marks table fit.
  const small = await phone(backend, "correction", { ...PHONE, viewport: { width: 360, height: 740 } });
  await visible(row(small, "Vimal").locator(".to-chip.theory"));
  await contains(row(small, "Vimal").locator(".to-chip.theory"), "Th");
  for (const name of ["Malik", "Priya", "Vimal"]) {
    const act = row(small, name).locator(".reg-act");
    expect(await act.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${name}'s row fits at 360 px`).toBe(true);
  }
  await shot(small, "m08d-master-rows-360px");
  // Vimal's Level 8, corrected with a "?": opened again from his marks table, Part II answers under the marks.
  await row(small, "Vimal").locator(".reg-strip").click();
  await row(small, "Vimal").getByRole("button", { name: /^Level 8, questions 56 to 57/ }).click();
  await visible(small.locator(".sheet .ct-list"));
  await contains(small.locator(".sheet .ct-row", { hasText: "Q56" }).locator(".ct-key"), "B56");
  await visible(small.locator(".sheet").getByRole("button", { name: "Q57: couldn't start it (to Theory)", pressed: true }));
  expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const box = (await small.locator(".sheet").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  await shot(small, "m09-correct-level-360px");
  await small.locator(".sheet").getByRole("button", { name: "Close" }).click();
  await visible(row(small, "Vimal").locator(".mtable"));
  expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(small, "m10-marks-table-360px", true);
  await small.context().close();

  expect(problems, problems.join("\n")).toEqual([]);
});

test("Progress: one grade's race per unit, who finished what, and the poster for the parents", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();

  // Top bar: Attendance is its icon and the count; Progress sits next to it.
  const att = C.getByRole("button", { name: "Attendance: 13 in class" });
  await visible(att);
  expect((await att.innerText()).trim()).toBe("13");
  await C.getByRole("button", { name: "Progress", exact: true }).click();

  // Grade 7: three workbook students on U08, ranked by levels done.
  await C.getByRole("button", { name: /^Grade 7:/ }).click();
  const lane = C.locator(".lane", { hasText: "U08 Directed numbers" });
  await textsAre(lane.locator(".lr-name"), ["Vimal", "Malik", "Priya"]);
  await textsAre(lane.locator(".rk"), ["1", "2", "3"]);
  const malik = lane.locator(".lr", { hasText: "Malik" });
  await contains(malik.locator(".lr-nums"), "3/8");
  await contains(malik.locator(".lr-pct"), "85%");
  await contains(malik.locator(".lr-meta"), "+3 today");
  await count(malik.locator(".rbar i"), 8);
  await count(malik.locator(".rbar i.wait"), 1);
  const chips = async () => (await C.locator(".pf-chip").allTextContents()).map((x) => x.replace(/\s+/g, " ").trim());
  await until(async () => JSON.stringify(await chips()) === JSON.stringify(["Master 3", "Came today 3"]), "stage and today chips");
  await shot(C, "p01-progress-units-grade-7", true);
  // The Grade 7 poster (workbook levels as blocks), kept for a look.
  await C.getByRole("button", { name: "Share poster" }).click();
  await visible(C.locator(".sheet canvas.poster-page"));
  const png7 = await C.locator(".sheet canvas.poster-page").first().evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"));
  await (await import("node:fs/promises")).writeFile(join(SHOTS, "p04a-poster-grade-7.png"), Buffer.from(png7.split(",")[1], "base64"));
  await C.locator(".sheet").getByRole("button", { name: "Close" }).click();

  // Term: who finished what. Vimal is furthest; a tap tells the details.
  await C.getByRole("button", { name: "Term", exact: true }).click();
  await visible(C.locator(".tg"));
  const first = C.locator(".tg-row:not(.tg-head)").first();
  await contains(first.locator(".tg-name"), "Vimal");
  const cell = first.locator(".tc.cur");
  await count(cell, 1);
  await cell.click();
  await contains(C.locator(".toast"), "Vimal · U08 · Master: 8 of 8 levels");
  await shot(C, "p02-progress-term-grade-7", true);

  // Grade 11: the theory book race (Fighter), the term grid fits 320 px.
  await C.getByRole("button", { name: /^Grade 11:/ }).click();
  await C.getByRole("button", { name: "Units", exact: true }).click();
  const f = C.locator(".lane", { hasText: "U13" });
  await count(f.locator(".lr"), 10);
  await count(f.locator(".fbar.f"), 10);
  await C.locator(".pf-chip.today").click(); // only who came today: Keerthi isn't in
  await count(f.locator(".lr"), 9);
  await C.locator(".pf-chip.today").click();

  // The poster: drawn on the phone, 1080 × 1350, shared through the phone's share sheet.
  await C.getByRole("button", { name: "Share poster" }).click();
  const ps = C.locator(".sheet");
  await contains(ps.locator("h2"), "Poster · Grade 11");
  await visible(ps.locator("canvas.poster-page"));
  expect(await ps.locator("canvas.poster-page").first().evaluate((c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([
    1080, 1350,
  ]);
  await visible(ps.getByRole("button", { name: /^Share/ }));
  await count(ps.locator("canvas.poster-page"), 1); // ten students fit one image
  await shot(C, "p03-poster-sheet");
  const png = await ps.locator("canvas.poster-page").first().evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"));
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SHOTS, "p04-poster-grade-11.png"), Buffer.from(png.split(",")[1], "base64"));
  // Marks off: the images are drawn again.
  await ps.getByLabel("Marks %").uncheck();
  await visible(ps.locator("canvas.poster-page"));
  await visible(ps.getByRole("button", { name: /^Share/ }));
  // A phone that can share files: the PNGs go to the share sheet.
  await C.evaluate(() => {
    const nav = navigator as unknown as { canShare: () => boolean; share: (d: { files: File[] }) => Promise<void> };
    nav.canShare = () => true;
    nav.share = async (d) => {
      (window as unknown as { __shared: string[] }).__shared = d.files.map((x) => `${x.name}|${x.type}|${x.size > 5000}`);
    };
  });
  await ps.getByRole("button", { name: /^Share/ }).click();
  await until(async () => ((await C.evaluate(() => (window as unknown as { __shared?: string[] }).__shared)) ?? []).length > 0, "shared");
  const shared = await C.evaluate(() => (window as unknown as { __shared: string[] }).__shared);
  expect(shared[0]).toMatch(/^ARISTORA-Grade11-\d{4}-\d{2}-\d{2}(-1)?\.png\|image\/png\|true$/);
  // Save: the images download (a computer, or a phone that can't share).
  const [dl] = await Promise.all([C.waitForEvent("download"), ps.getByRole("button", { name: "Save" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^ARISTORA-Grade11-.*\.png$/);
  await ps.getByRole("button", { name: "Close" }).click();

  // Small phones: the page and the top bar fit, no sideways scrolling.
  for (const width of [360, 320]) {
    const small = await phone(backend, "correction", { ...PHONE, viewport: { width, height: 700 } });
    await small.getByRole("button", { name: "Progress", exact: true }).click();
    await visible(small.locator(".lane"));
    expect(await small.evaluate(() => document.documentElement.scrollWidth), `units at ${width} px`).toBeLessThanOrEqual(width);
    await small.getByRole("button", { name: "Term", exact: true }).click();
    await visible(small.locator(".tg"));
    expect(await small.evaluate(() => document.documentElement.scrollWidth), `term at ${width} px`).toBeLessThanOrEqual(width);
    await shot(small, `p05-progress-term-${width}px`, true);
    await small.context().close();
  }

  expect(problems, problems.join("\n")).toEqual([]);
});

test("accounts: the owner sets up, adds a teacher, her phone signs in with the link and is signed out again", async () => {
  const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
  const CODE = "TEST-C0DE-1234-ABCD-WXYZ";
  env.ARISTORA_SETUP_SHA256 = secretHash("setup", normalizeCode(CODE));
  try {
    const backend = makeBackend(modules); // nobody has an account yet
    const O = await phone(backend, "correction", PHONE, null, `${site.url}/#setup=${CODE}`);
    await visible(O.getByRole("heading", { name: "Set up the owner account" }));
    expect(await O.getByLabel("Setup code").inputValue()).toBe(CODE);
    await O.getByLabel("Your name").fill("Ilham");
    await O.getByLabel("Choose a PIN (6 digits)").fill("482913");
    await O.getByLabel("The same PIN again").fill("482913");
    await shot(O, "a01-owner-setup");
    await O.getByRole("button", { name: "Set up", exact: true }).click();
    await visible(O.getByText("No students yet"));
    expect(new URL(O.url()).hash).toBe(""); // the code is gone from the address bar
    await contains(O.locator(".toast"), "Welcome, Ilham");

    // A phone that isn't signed in sees only the sign-in screen.
    const stranger = await phone(backend, "correction", PHONE, null);
    await visible(stranger.getByRole("heading", { name: "Sign in" }));
    await count(stranger.locator(".reg-row, .tabs"), 0);
    await shot(stranger, "a02-sign-in");
    await stranger.context().close();

    // The owner adds Rimas (Correction only) and gets her sign-in link.
    await O.getByRole("button", { name: "Settings" }).click();
    await O.getByRole("button", { name: "People", exact: true }).click();
    await O.getByRole("button", { name: "Add a teacher" }).click();
    const add = O.locator(".sheet");
    await add.getByRole("button", { name: "Add, then send the sign-in link" }).click(); // no name yet: it says so
    await contains(O.locator(".toast"), "Type the teacher's name first");
    await add.getByLabel("Name (first name and initial)").fill("Rimas");
    await shot(O, "a03-add-teacher");
    await add.getByRole("button", { name: "Add, then send the sign-in link" }).click();
    await contains(O.locator(".sheet h2"), "Sign-in link for Rimas");
    const url = await O.locator(".sheet .link-text").inputValue();
    expect(url).toMatch(/\/#join=[A-Za-z0-9_-]{22}$/);
    const wa = (await O.locator(".sheet").getByRole("link", { name: "Send on WhatsApp" }).getAttribute("href"))!;
    expect(wa.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(wa)).toContain(url);
    await shot(O, "a04-link-sheet");
    await O.locator(".sheet").getByRole("button", { name: "Close" }).click();
    await contains(O.locator(".person", { hasText: "Rimas" }), "link waiting until");

    // Rimas taps the link on her phone: one tap, then a PIN for later.
    const R = await phone(backend, "theory", PHONE, null, url);
    await visible(R.getByText("This link signs in"));
    await shot(R, "a05-link-sign-in");
    await R.getByRole("button", { name: "Sign in as Rimas" }).click();
    await contains(R.locator(".sheet h2"), "Choose a PIN");
    await R.locator(".sheet").getByLabel("New PIN (6 digits)").fill("583920");
    await R.locator(".sheet").getByLabel("The same PIN again").fill("583920");
    await R.locator(".sheet").getByRole("button", { name: "Save PIN" }).click();
    await contains(R.locator(".toast"), "PIN saved");
    expect(new URL(R.url()).hash).toBe("");
    // Her job is Correction: the Class tab (everyone's), Attendance and Focus at the top; no Theory tab, though the phone
    // last showed Theory.
    await textsAre(R.locator(".tabs .tab"), ["Class"]);
    await contains(R.locator(".tabs .tab.on"), "Class");
    await visible(R.getByRole("button", { name: /^Attendance/ })); // Correction takes attendance
    await visible(R.getByRole("button", { name: /^Focus/ })); // and marks papers
    await R.getByRole("button", { name: "Settings" }).click();
    await textsAre(R.locator(".seg button"), ["Alerts", "Reports", "History", "Account"]); // no People: owner only
    await shot(R, "a05b-teacher-settings", true);
    await R.getByRole("button", { name: "Back to the class" }).click();
    // The same link can't be used again.
    const again = await phone(backend, "correction", PHONE, null, url);
    await visible(again.getByText("already used"));
    await again.context().close();

    // The owner sees her phone and signs it out; her phone shows the sign-in screen at once.
    await contains(O.locator(".person", { hasText: "Rimas" }), "1 phone signed in");
    await O.locator(".person", { hasText: "Rimas" }).getByRole("button", { name: "Change" }).click();
    await shot(O, "a06-person-phones");
    await O.locator(".sheet").getByRole("button", { name: "Sign out", exact: true }).click();
    await contains(O.locator(".toast"), "Rimas:");
    await visible(R.getByRole("heading", { name: "Sign in" }));
    expect(await R.evaluate(() => localStorage.getItem("aristora.token"))).toBeNull();

    // She signs back in with her name and PIN (a wrong PIN first).
    await R.getByLabel("Your name").fill("rimas");
    await R.getByLabel("PIN (6 digits)").fill("583921");
    await R.getByRole("button", { name: "Sign in", exact: true }).click();
    await visible(R.getByText("don't match"));
    await R.getByLabel("PIN (6 digits)").fill("583920");
    await R.getByRole("button", { name: "Sign in", exact: true }).click();
    await textsAre(R.locator(".tabs .tab"), ["Class"]);

    // The history names who did each thing.
    await O.locator(".sheet").getByRole("button", { name: "Close" }).click();
    await O.getByRole("button", { name: "History", exact: true }).click();
    await contains(O.locator(".history"), "made a sign-in link for Rimas");
    await contains(O.locator(".history"), "signed in a phone (with PIN)");
    await shot(O, "a07-history", true);

    // Small Android phone: the sign-in screen and People fit.
    const small = await phone(backend, "correction", { ...PHONE, viewport: { width: 360, height: 740 } }, null);
    await visible(small.getByRole("heading", { name: "Sign in" }));
    expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await shot(small, "a08-sign-in-360px");
    await small.context().close();
    await O.setViewportSize({ width: 360, height: 740 });
    await O.getByRole("button", { name: "People", exact: true }).click();
    expect(await O.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
    await shot(O, "a09-people-360px", true);
  } finally {
    delete env.ARISTORA_SETUP_SHA256;
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

test("a phone without the screen wake lock (iPhone 7 Plus) keeps the screen on with the silent video", async () => {
  const backend = await newClass();
  const ctx = await browser.newContext(PHONE);
  await backend.attach(ctx);
  await ctx.addInitScript((tk) => {
    Object.defineProperty(Navigator.prototype, "wakeLock", { get: () => undefined, configurable: true });
    localStorage.setItem("aristora.role", "correction");
    localStorage.setItem("aristora.token", tk);
  }, OWNER_TOKEN);
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

test("Focus: one question at a time, names that never move, a paper taken back and given to the right student", async () => {
  const backend = await newClass();
  const F = await phone(backend, "focus");
  const E = await phone(backend, "evaluation");
  await F.getByRole("button", { name: "Settings" }).click();
  await F.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(F.getByText(/^14 demo students loaded/));
  await F.getByRole("button", { name: "Back to the class" }).click();
  // Focus is at the top (the target): the Correction job. The tabs are Class, Theory, Evaluation; the phone opens on Focus.
  await textsAre(F.locator(".tabs .tab > span:nth-child(2)"), ["Class", "Theory", "Evaluation"]);
  expect(await F.getByRole("button", { name: /^Focus/ }).getAttribute("aria-pressed")).toBe("true");
  await count(F.locator(".tabs .tab.on"), 0);

  // G7 U08 gets a FAKE answer key (Q56 in parts with their marks); a Grade 8 student joins on U01 (no key).
  const answers = Array.from({ length: 57 }, (_, i) => {
    const q = i + 1;
    if (q === 56) return { q, parts: [{ p: "i", a: "work → **B56**", m: 2 }, { p: "ii", a: "C56", m: 2 }] };
    return { q, a: q <= 37 ? `A${q}` : `B${q}` };
  });
  const u01 = await backend.t.run(async (ctx) => {
    const unit = async (key: string) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!;
    const u08 = await unit("G7-U08");
    await ctx.db.insert("keys", { unitId: u08._id, answers, updatedAt: Date.now() });
    const b = (await ctx.db
      .query("books")
      .withIndex("by_unit_stage", (q) => q.eq("unitId", u08._id).eq("stage", "master"))
      .first())!;
    await ctx.db.patch(b._id, { keyCount: answers.length });
    const g8 = await unit("G8-U01");
    await ctx.db.insert("books", { unitId: g8._id, stage: "master", data: U01_READ.data, updatedAt: Date.now() });
    return g8._id;
  });
  const nimal = await backend.t.mutation(api.students.add, { token: OWNER_TOKEN, name: "Nimal", grade: 8, term: 1, stage: "master", unitId: u01 });
  await backend.t.mutation(api.students.setPresent, { token: OWNER_TOKEN, id: nimal, present: true });
  await backend.push(); // the phones see what changed outside them

  // A person corrects at a human pace: never two taps within the double-tap guard.
  const tap = async (l: L) => {
    await F.waitForTimeout(420);
    await l.click();
  };
  const name = (n: string) => F.locator(".fc-pill", { has: F.locator(".fc-pn", { hasText: n }) });
  /** Flex boxes run their parts onto lines: compare with the spaces squeezed. */
  const says = (l: L, text: string) =>
    until(async () => (await l.first().innerText()).replace(/\s+/g, " ").includes(text), `"${text}" in ${l}`);

  // The names: A–Z per grade (workbook and theory-book students), each with what his paper can be; grade pills filter.
  await textsAre(F.locator(".grade-pills .gp b"), ["All", "7", "8", "11"]);
  await until(
    async () => (await F.locator(".fc-group .fc-h").allTextContents()).join("|") === "Grade 7|Grade 8|Grade 11",
    "grade headers",
  );
  await textsAre(F.locator(".fc-pill .fc-pn"), ["Malik", "Priya", "Vimal", "Nimal", "Ahamed", "Dilan", "Kumar", "Nila", "Sana", "Tharun", "Yasmin"]);
  await textsAre(name("Malik").locator(".fc-tags i"), ["L3", "L4"]);
  await count(name("Malik").locator(".fc-tags i.w"), 1); // L3 handed in
  await visible(F.locator(".fc-pill.red", { hasText: "Vimal" })); // out of work until L8 is corrected
  await textsAre(name("Nimal").locator(".fc-tags i"), ["L1", "no key"]);
  // Theory book: the next question he can do (a past paper by its year), and how many more.
  await textsAre(name("Nila").locator(".fc-tags i"), ["Q19", "+3"]);
  await textsAre(name("Yasmin").locator(".fc-tags i"), ["2022", "+8"]);
  await contains(F.locator(".fc-nothing"), "Nothing to mark now: Fathima (waits for D theory), Rizwan (waits for C theory).");
  expect(await F.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(F, "f01-focus-names", true);

  // Priya: one level open, so it opens at once. The names hide while her paper is open.
  await tap(name("Priya"));
  await contains(F.locator(".fc-name"), "Priya");
  await contains(F.locator(".fc-where"), "G7 · U08 · L2 · Q11–20");
  await count(F.locator(".fc-pill"), 0);
  await count(F.locator(".grade-pills"), 0);
  await contains(F.locator(".fc-qn"), "11");
  await contains(F.locator(".fc-ans"), "A11");
  await contains(F.locator(".fc-qmeta"), "Part I · 2 marks");
  await shot(F, "f02-focus-question");
  // Full marks is the big button; the next question comes by itself.
  await tap(F.locator(".fc-go"));
  await contains(F.locator(".fc-qn"), "12");
  // A double tap gives ONE mark: Q12 full, and Q13 is on screen, not skipped.
  await F.waitForTimeout(420);
  await F.locator(".fc-go").dblclick();
  await contains(F.locator(".fc-qn"), "13");
  await textsAre(F.locator(".fc-sq b"), ["2", "2", "", "", "", "", "", "", "", ""]);
  // Q13 wrong, Q14 one mark, Q15 blank (?), the rest full.
  await tap(F.getByRole("button", { name: "Q13: 0 of 2" }));
  await tap(F.getByRole("button", { name: "Q14: 1 of 2" }));
  await tap(F.getByRole("button", { name: "Q15: blank, couldn't start it (to Theory)" }));
  for (const q of [16, 17, 18, 19, 20]) {
    await contains(F.locator(".fc-qn"), String(q));
    await tap(F.locator(".fc-go"));
  }
  await says(F.locator(".fc-total"), "15 / 20");
  await contains(F.locator(".fc-sum .ct-dk"), "Q15: blank, so straight to Theory.");
  await visible(F.locator(".segc-b.evaluation.on"));
  // He spots Q14 was really right: tap it in the strip, give 2, and he is back at the level's marks.
  await tap(F.locator(".fc-sq", { hasText: "14" }));
  await contains(F.locator(".fc-qn"), "14");
  await visible(F.locator(".fc-n.on", { hasText: "1" }));
  await says(F.locator(".fc-go"), "1 / 2"); // the big button keeps his mark until he changes it
  await tap(F.getByRole("button", { name: "Q14: 2 of 2" }));
  await says(F.locator(".fc-total"), "16 / 20");
  await shot(F, "f03-focus-summary");
  await tap(F.getByRole("button", { name: /^Save Priya · 16 \/ 20/ }));
  await contains(F.locator(".toast"), "Saved: Priya, Level 2, 16 / 20. Theory: Q15. Evaluation: Q13.");
  // Saved exactly as the Correction tab saves it.
  const p2 = (await marksOf(backend, "Priya")).m!;
  expect(p2.lv["2"]).toMatchObject({ got: 16, by: "correction" });
  expect(p2.q["13"]).toMatchObject({ got: 0, max: 2, lost: true });
  expect(p2.q["14"]).toMatchObject({ got: 2, lost: false });
  expect(p2.q["15"]).toMatchObject({ got: 0, dk: true, tb: "correction" });
  await textsAre(name("Priya").locator(".fc-tags i"), ["L3"]);
  await contains(F.locator(".fc-sv").first(), "Priya · L2 · 16 / 20");
  // The list survives a reload of the page (Chrome may reload a tab left in the background).
  await F.reload();
  await contains(F.locator(".fc-sv").first(), "Priya · L2 · 16 / 20");
  await visible(F.locator(".fc-sv").first().getByRole("button", { name: "Take back" }));

  // Malik has two levels open: the phone asks which one this paper is (no toast left over the pad).
  await tap(name("Malik"));
  await count(F.locator(".toast"), 0);
  await contains(F.locator(".fc-ask"), "Which level is this paper?");
  await textsAre(F.locator(".fc-lv b"), ["Level 3", "Level 4"]);
  await contains(F.locator(".fc-lv.w small"), "handed in 6 min ago");
  await shot(F, "f04-focus-which-level");
  await tap(F.locator(".fc-lv", { hasText: "Level 3" }));
  await contains(F.locator(".fc-where"), "L3 · Q21–30");
  for (let q = 21; q <= 30; q++) {
    await contains(F.locator(".fc-qn"), String(q));
    await tap(F.locator(".fc-go"));
  }
  await tap(F.getByRole("button", { name: /^Save Malik · 20 \/ 20/ }));
  await contains(F.locator(".toast"), "Saved: Malik, Level 3, 20 / 20.");
  expect((await marksOf(backend, "Malik")).m!.lv["3"]).toMatchObject({ got: 20 });

  // It was Priya's Level 3 paper. Take it back: Malik's Level 3 waits again exactly as before, out of the report.
  await tap(F.locator(".fc-sv", { hasText: "Malik" }).getByRole("button", { name: "Take back" }));
  await contains(F.locator(".sheet h2"), "Take back Malik's Level 3?");
  await shot(F, "f05-focus-take-back");
  await tap(F.locator(".sheet").getByRole("button", { name: "Take back" }));
  await contains(F.locator(".toast"), "Taken back: Malik's Level 3 is as it was.");
  const mk = (await marksOf(backend, "Malik")).m!;
  expect(mk.lv["3"].fixed).toBeUndefined();
  expect(mk.lv["3"].done).toBeGreaterThan(0);
  expect(mk.q["21"]).toBeUndefined();
  await contains(F.locator(".fc-sv.back"), "taken back");
  await textsAre(name("Malik").locator(".fc-tags i"), ["L3", "L4"]);
  await contains(F.locator(".fc-carry"), "Marks taken back from Malik (Q21–30)");
  // Tap Priya: her Level 3 opens with those marks, ready to save.
  await tap(name("Priya"));
  await contains(F.locator(".fc-carried"), "taken back from Malik");
  await contains(F.locator(".fc-where"), "L3 · Q21–30");
  await says(F.locator(".fc-total"), "20 / 20");
  await shot(F, "f06-focus-marks-moved");
  await tap(F.getByRole("button", { name: /^Save Priya · 20 \/ 20/ }));
  await contains(F.locator(".toast"), "Saved: Priya, Level 3, 20 / 20.");
  expect((await marksOf(backend, "Priya")).m!.lv["3"]).toMatchObject({ got: 20, by: "correction" });
  await count(F.locator(".fc-carry"), 0);
  const kinds = await backend.t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("level-")));
  expect(kinds.filter((e) => e.kind === "level-marks").map((e) => `${e.name} ${e.value}`)).toEqual(["Priya 2 16/20", "Priya 3 20/20"]);
  expect(kinds.find((e) => e.kind === "level-unmarked")).toMatchObject({ name: "Malik", value: "3 20/20" });

  // While a paper is open, a call still rings on this phone (it is the Correction job) and is sent from here.
  await tap(F.getByRole("button", { name: /^Grade 8:/ }));
  await textsAre(F.locator(".fc-pill .fc-pn"), ["Nimal"]);
  await tap(name("Nimal"));
  await contains(F.locator(".fc-nokey"), "No answer key for this workbook yet");
  await tap(F.locator(".fc-go"));
  await contains(F.locator(".fc-qn"), "2");
  await row(E, "Malik").locator(".reg-name").click();
  await E.locator(".call-bar").getByRole("button", { name: "Call 1" }).click();
  await hears(F, "Malik, go to Evaluation.");
  await F.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await count(F.locator(".call-strip"), 0);
  await contains(F.locator(".fc-qn"), "2"); // still on his paper, at the same question
  // Switching pages keeps the open paper.
  await tab(F, "Class").click();
  await visible(row(F, "Priya"));
  await textsAre(row(F, "Priya").locator(".mk b"), ["L4"]); // the Class tab sees Focus's saves
  await F.getByRole("button", { name: /^Focus/ }).click();
  await contains(F.locator(".fc-name"), "Nimal");
  await contains(F.locator(".fc-qn"), "2");
  // Stop in the middle: every mark is kept (on the server, for any phone) and the paper opens again where it stopped.
  await tap(F.getByRole("button", { name: "Q2: 0 of 2" }));
  await contains(F.locator(".fc-qn"), "3");
  await tap(F.getByRole("button", { name: "Stop: every mark is kept" }));
  await count(F.locator(".fc-paper"), 0);
  const drafts = () => backend.t.run(async (ctx) => (await ctx.db.query("drafts").collect()).map((d) => JSON.stringify(d.q)));
  await until(async () => (await drafts()).join() === JSON.stringify({ "1": { g: 2 }, "2": { g: 0 } }), "Nimal's draft on the server");
  expect((await marksOf(backend, "Nimal")).m?.lv["1"]).toBeUndefined(); // nothing counts until the level is saved
  await textsAre(name("Nimal").locator(".fc-tags i"), ["L1 2/10", "no key"]);
  await tap(name("Nimal"));
  await contains(F.locator(".fc-resumed"), "2 already marked");
  await contains(F.locator(".fc-qn"), "3");
  await textsAre(F.locator(".fc-sq b"), ["2", "0", "", "", "", "", "", "", "", ""]);
  await shot(F, "f06b-focus-resumed");
  // Marks put on the wrong student are cleared (asked first).
  await tap(F.locator(".fc-resumed").getByRole("button", { name: "Clear them" }));
  await contains(F.locator(".sheet h2"), "Clear Nimal's marks on Level 1?");
  await tap(F.locator(".sheet").getByRole("button", { name: "Clear the marks" }));
  await textsAre(F.locator(".fc-sq b"), ["", "", "", "", "", "", "", "", "", ""]);
  await contains(F.locator(".fc-qn"), "1");
  await until(async () => (await drafts()).length === 0, "Nimal's draft gone");
  await tap(F.getByRole("button", { name: "Stop: every mark is kept" }));

  // A theory-book student: his questions in book order, ✓ right / ✗ wrong / ↻ slip, saved like the Correction tab's circles.
  await tap(F.getByRole("button", { name: /^Grade 11:/ }));
  await tap(name("Nila"));
  await contains(F.locator(".fc-where"), "G11 · U13 · theory book");
  await contains(F.locator(".fc-qn"), "19");
  await contains(F.locator(".fc-qmeta"), "Section C · Forming the equation");
  await textsAre(F.locator(".fc-strip .fc-sq small"), ["19", "20", "21", "22"]);
  await shot(F, "f13-focus-theory-book");
  await tap(F.getByRole("button", { name: "Q19: right" }));
  await contains(F.locator(".fc-qn"), "20");
  await tap(F.getByRole("button", { name: "Q20: wrong" }));
  await tap(F.getByRole("button", { name: "Q21: slip" }));
  await contains(F.locator(".fc-qn"), "22");
  await textsAre(F.locator(".fc-strip .fc-sq b"), ["✓", "✗", "↻", ""]);
  // His notebook ends at Q21: Stop. The marks reach the server like the Correction tab's taps.
  await tap(F.getByRole("button", { name: "Stop: every mark is kept" }));
  const nila = async () => (await marksOf(backend, "Nila")).marks;
  await until(async () => {
    const mk = await nila();
    return mk["19"]?.s === "right" && mk["20"]?.s === "wrong" && mk["21"]?.s === "slip";
  }, "Nila's marks saved");
  expect((await nila())["20"]?.n).toBe(1);
  await contains(F.locator(".fc-sv").first(), "Nila · Q19–Q21 · 3 marks");
  // Marked on the wrong student? Take back puts them as they were.
  await tap(F.locator(".fc-sv", { hasText: "Nila" }).getByRole("button", { name: "Take back" }));
  await contains(F.locator(".sheet h2"), "Take back Nila's marks?");
  await tap(F.locator(".sheet").getByRole("button", { name: "Take back" }));
  await contains(F.locator(".toast"), "Taken back: Nila's marks are as they were.");
  await until(async () => {
    const mk = await nila();
    return !mk["19"] && !mk["20"] && !mk["21"];
  }, "Nila's marks back as they were");
  await F.context().close();

  // The smallest phone (320 px): Vimal's last level. Q56 in two parts: tap the wrong part, the big button adds up.
  const S = await phone(backend, "focus", { ...PHONE, viewport: { width: 320, height: 568 } });
  const stap = async (l: L) => {
    await S.waitForTimeout(420);
    await l.click();
  };
  await visible(S.locator(".fc-pill").first());
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // Four tabs fit: every label inside its tab.
  expect(
    await S.evaluate(() =>
      [...document.querySelectorAll(".tabs .tab")].every((t) => (t.children[1] as HTMLElement).getBoundingClientRect().width <= t.getBoundingClientRect().width - 4),
    ),
  ).toBe(true);
  await shot(S, "f07-focus-names-320", true);
  await stap(S.locator(".fc-pill", { hasText: "Vimal" }));
  await contains(S.locator(".fc-qn"), "56");
  await textsAre(S.locator(".fc-part .fc-pt em"), ["i)", "ii)"]);
  await says(S.locator(".fc-go"), "4 / 4");
  // The parts give the marks: no number row, just "?" and the big button; every part, the name and the strip on
  // screen above the pad (the tap on the name already turned the alerts banner off).
  await count(S.locator(".fc-nums"), 0);
  await count(S.locator(".sound-banner"), 0);
  const padTop = (await S.locator(".fc-pad").boundingBox())!.y;
  const lastPart = (await S.locator(".fc-part").last().boundingBox())!;
  expect(lastPart.y + lastPart.height).toBeLessThanOrEqual(padTop);
  expect((await S.locator(".fc-name").boundingBox())!.y).toBeGreaterThan(0);
  expect((await S.locator(".fc-strip").boundingBox())!.y).toBeGreaterThan(0);
  await stap(S.getByRole("button", { name: "Part ii: 0 of 2" }));
  await says(S.locator(".fc-go"), "2 / 4");
  await count(S.locator(".fc-go.part"), 1);
  await shot(S, "f08-focus-parts-320");
  // The pad is on screen, above the tabs, with nothing spilling sideways.
  const go = (await S.locator(".fc-go").boundingBox())!;
  expect(go.y + go.height).toBeLessThanOrEqual(568 - 66);
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await stap(S.locator(".fc-go"));
  // Q57 is 11 marks: ? and 0 to 11 all fit, and the pad stays on screen.
  await contains(S.locator(".fc-qn"), "57");
  await count(S.locator(".fc-nums .fc-n"), 13);
  const go57 = (await S.locator(".fc-go").boundingBox())!;
  expect(go57.y + go57.height).toBeLessThanOrEqual(568 - 66);
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(S, "f09-focus-11-marks-320");
  await stap(S.locator(".fc-go"));
  await says(S.locator(".fc-total"), "13 / 15");
  await shot(S, "f10-focus-summary-320");
  await stap(S.getByRole("button", { name: /^Save Vimal · 13 \/ 15/ }));
  await contains(S.locator(".toast"), "Saved: Vimal, Level 8, 13 / 15. Evaluation: Q56.");
  expect((await marksOf(backend, "Vimal")).m!.q["56"]).toMatchObject({ got: 2, max: 4, lost: true });
  // A theory book on the smallest phone: name, question and the three buttons fit above the tabs.
  await stap(S.locator(".fc-pill", { hasText: "Kumar" }));
  await contains(S.locator(".fc-qn"), "30");
  const right = (await S.locator(".fc-go").boundingBox())!;
  expect(right.y + right.height).toBeLessThanOrEqual(568 - 66);
  expect((await S.locator(".fc-name").boundingBox())!.y).toBeGreaterThan(0);
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(S, "f14-focus-theory-320");
  await stap(S.getByRole("button", { name: "Stop: every mark is kept" }));
  await S.context().close();

  // 360 px: the names and a question.
  const M = await phone(backend, "focus", { ...PHONE, viewport: { width: 360, height: 640 } });
  await visible(M.locator(".fc-pill").first());
  expect(await M.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(M, "f11-focus-names-360", true);
  await M.locator(".fc-pill", { hasText: "Malik" }).click();
  await M.locator(".fc-lv", { hasText: "Level 4" }).click();
  await contains(M.locator(".fc-qn"), "31");
  const g360 = (await M.locator(".fc-go").boundingBox())!;
  expect(g360.y + g360.height).toBeLessThanOrEqual(640 - 66);
  await shot(M, "f12-focus-question-360");
  await M.context().close();
  await E.context().close();
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Theory: one page for the whole class (lessons going on, Next, Soon); Evaluation told; the owl while loading", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  const T = await phone(backend, "theory");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  const marks = async (name: string) => (await marksOf(backend, name)).marks;
  const titles = T.locator(".tp-card .tf-title b, .tp-soon-t b");

  // One line on top; Next: the 3 lessons to teach now, most useful first, with who needs each (ticked) and why. Soon: the
  // rest, one line each. D gives work to 3 now (Fathima has none; Ahamed and Dilan run out within a lesson).
  await contains(T.locator(".tp-sum"), "2 with no work"); // Fathima and Rizwan
  await contains(T.locator(".tp-sum"), "lessons ~12 min");
  await namesAre(titles, ["Completing the square", "Forming the equation", "Expand & simplify", "Surds & approximation"]);
  await count(T.locator(".tp-card"), 3);
  await count(T.locator(".tp-soon"), 1);
  // (the heading is drawn in capitals: read its text, not its look)
  await until(async () => (await T.locator(".tp-card").first().locator(".tf-kicker").textContent()) === "Teach next", "Teach next");
  await count(T.locator(".tp-card.first.u-red"), 1); // somebody has no work
  const d = await lessonCard(T, "Completing the square");
  await contains(d.locator(".tf-title b"), "Completing the square");
  expect(await T.locator(".tp-card").first().locator(".tf-title b").textContent()).toBe("Completing the square");
  await contains(d.locator(".tf-tag"), "G11 · U13 · section D · teach Q23–26");
  await contains(d.locator(".tp-why"), "3 need it now");
  await namesAre(d.locator(".tp-m b"), ["Fathima", "Ahamed", "Dilan", "Nila"]);
  await count(d.locator(".tp-m.on"), 4);
  await contains(chip(d, "Fathima").locator("small"), "no work");
  await contains(chip(d, "Ahamed").locator("small"), "out in");
  // Names three to a line.
  const tops = await d.locator(".tp-m").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(tops.filter((t) => t === tops[0])).toHaveLength(3);
  expect(await T.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(T, "t01-theory-page", true);

  // Nila still has work: leave her out. Call 3: Correction hears it; the lesson shows them on the way.
  await chip(d, "Nila").click();
  await contains(d.locator(".tp-call"), "Call 3");
  await d.locator(".tp-call").click();
  await contains(T.locator(".toast"), "Called 3. Correction sends them over.");
  const room = T.locator(".tp-room", { has: T.locator(".tf-title b", { hasText: "Completing the square" }) });
  await says(room.locator(".tf-kicker"), "Starting: 3 on the way");
  await namesAre(room.locator(".tp-c b"), ["Fathima", "Ahamed", "Dilan"]);
  await until(
    async () => (await said(C)).some((s) => ["Fathima", "Ahamed", "Dilan"].every((n) => s.includes(n)) && s.endsWith("go to Theory.")),
    "Correction hears the three names",
  );
  // Correction is slow: after 3 minutes Theory's phone shows it in red too.
  await backend.t.run(async (ctx) => {
    for (const c of await ctx.db.query("calls").collect()) if (c.status === "requested") await ctx.db.patch(c._id, { createdAt: c.createdAt - 4 * 60_000 });
  });
  await backend.push();
  await count(room.locator(".tp-c.late"), 3);
  await contains(room.locator(".tp-c.late").first(), "not sent 4m");
  await shot(T, "t02-theory-on-the-way-late", true);
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();

  // The lesson: what was taught; each student "got it". The bell rang before Q26; Dilan didn't get it.
  await says(room.locator(".tf-kicker"), "With you");
  await namesAre(room.locator(".tp-got b"), ["Fathima", "Ahamed", "Dilan"]);
  await textsAre(room.locator(".tf-teach .tf-q.on"), ["Q23", "Q24", "Q25", "Q26"]);
  await count(room.locator(".tp-c"), 0);
  // The others don't vanish: Next still lists the next lessons under it.
  await visible(T.locator(".tp-list .tf-h", { hasText: "Next" }));
  await shot(T, "t03-theory-with-you", true);
  await room.getByRole("button", { name: "Q26 taught" }).click();
  await room.getByRole("button", { name: "Dilan: got it" }).click();
  await contains(room.locator(".tp-got:not(.on)"), "Dilan");
  await contains(room.getByRole("button", { name: /^Done/ }), "Done: 2 back to work");
  await room.getByRole("button", { name: /^Done/ }).click();
  // (they arrived together: A–Z)
  await contains(T.locator(".toast"), "Saved: Ahamed, Fathima back to work. Dilan stays with you.");
  for (const who of ["Fathima", "Ahamed"]) {
    await until(async () => (await marks(who))["25"]?.s === "taught", `${who} taught Q23-25`);
    const mk = await marks(who);
    expect([mk["23"]?.s, mk["24"]?.s, mk["25"]?.s, mk["26"]?.s ?? null]).toEqual(["taught", "taught", "taught", null]);
  }
  expect((await marks("Dilan"))["23"]).toBeUndefined();
  // Dilan stays; the lesson's ticks start again from "all"; who else needs D now can join (Nila runs out within it).
  await namesAre(room.locator(".tp-got b"), ["Dilan"]);
  await count(room.locator(".tf-teach .tf-q.on"), 4);
  await contains(room.locator(".tf-join"), "Nila");
  await room.getByRole("button", { name: /^Call Nila to join/ }).click();
  await namesAre(room.locator(".tp-c b"), ["Nila"]);
  // Dilan has to go: back to the hall without it (D stays on his list).
  await room.getByRole("button", { name: "Send Dilan back without it" }).click();
  await contains(T.locator(".toast"), "Dilan: back to the hall, not taught.");
  expect((await marksOf(backend, "Dilan")).room).toBeUndefined();
  // Nila arrives: Done for her, every teach question.
  await hears(C, "Nila, go to Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();
  await namesAre(room.locator(".tp-got b"), ["Nila"]);
  await room.getByRole("button", { name: /^Done/ }).click();
  await until(async () => (await marks("Nila"))["26"]?.s === "taught", "Nila taught Q23-26");
  await count(T.locator(".tp-room"), 0);
  // Fathima and Ahamed still need Q26 (the bell rang): back on the D card with just that; Dilan needs all of D.
  const d2 = await lessonCard(T, "Completing the square");
  await namesAre(d2.locator(".tp-m b"), ["Fathima", "Ahamed", "Dilan"]);
  await contains(chip(d2, "Fathima").locator(".tp-what"), "Q26");
  await count(chip(d2, "Dilan").locator(".tp-what"), 0);
  await contains(d2.locator(".tf-tag"), "teach Q23–26");

  // A workbook lesson: Evaluation sent Malik's Q13 and Q17 to Theory. He gets Q13 today; Q17 waits.
  await backend.t.run(async (ctx) => {
    const s = (await ctx.db.query("students").collect()).find((x) => x.name === "Malik")!;
    const p = (await ctx.db
      .query("progress")
      .withIndex("by_student_unit_stage", (q) => q.eq("studentId", s._id).eq("unitId", s.unitId!).eq("stage", "master"))
      .first())!;
    const m = p.m!;
    const now = Date.now();
    await ctx.db.patch(p._id, { m: { ...m, q: { ...m.q, "13": { ...m.q["13"], th: now, tb: "evaluation" }, "17": { ...m.q["17"], th: now, tb: "evaluation" } } } });
  });
  await backend.push();
  const w = await lessonCard(T, "Directed numbers: workbook");
  await contains(w.locator(".tf-tag"), "G7 · U08");
  await contains(chip(w, "Malik").locator(".tp-what"), "Q13 Q17");
  await shot(T, "t04-theory-workbook-card", true);
  await callOnly(w, ["Malik"]);
  await hears(C, "Malik, go to Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();
  const wr = T.locator(".tp-room", { has: T.locator(".tf-title b", { hasText: "Directed numbers: workbook" }) });
  await textsAre(wr.locator(".tf-rs-qs .tf-q.on"), ["Q13", "Q17"]);
  await wr.getByRole("button", { name: "Malik Q17 taught" }).click();
  await shot(T, "t05-theory-room-workbook", true);
  await wr.getByRole("button", { name: /^Done/ }).click();
  await until(async () => (await marksOf(backend, "Malik")).m!.q["13"]?.tt !== undefined, "Malik Q13 taught");
  const mm = (await marksOf(backend, "Malik")).m!;
  expect(mm.q["17"]).toMatchObject({ th: expect.any(Number) });
  expect(mm.q["17"].tt).toBeUndefined();
  await contains(chip(await lessonCard(T, "Directed numbers: workbook"), "Malik").locator(".tp-what"), "Q17");

  // Evaluation calls Kumar: Theory lists him on the E card but doesn't tick him. Theory takes him anyway: Evaluation
  // is told her call went (theory comes first). Then Theory changes its mind: × cancels the call.
  const E = await phone(backend, "evaluation");
  await row(E, "Kumar").locator(".reg-name").click();
  await E.locator(".call-bar").getByRole("button", { name: "Call 1" }).click();
  const e = await lessonCard(T, "Surds & approximation");
  await contains(chip(e, "Kumar").locator("small"), "Eval called");
  expect(await chip(e, "Kumar").getAttribute("aria-pressed")).toBe("false");
  await callOnly(e, ["Kumar"]);
  await contains(T.locator(".toast"), "Called 1. Correction sends him over. Evaluation had called him: she is told.");
  await contains(E.locator(".bump-note"), "Theory took Kumar first.");
  await shot(E, "t06-evaluation-told");
  const er = T.locator(".tp-room", { hasText: "Kumar" });
  await er.getByRole("button", { name: "Cancel the call for Kumar" }).click();
  await count(T.locator(".tp-room"), 0);
  await count(E.locator(".bump-note"), 0);
  await E.context().close();

  // Theory's "All" is the Class tab now: every student, ◎ circles and section letters, his book and Move.
  await tab(T, "Class").click();
  await visible(row(T, "Dilan").getByRole("button", { name: "Section D: mark all theory taught" }));
  await row(T, "Dilan").locator(".reg-name").click();
  await visible(row(T, "Dilan").getByRole("button", { name: "Move: unit or stage" }));
  await count(row(T, "Dilan").getByRole("button", { name: /going home/ }), 1); // the owner may (a Theory teacher may not)
  await shot(T, "t07-class-as-theory");
  await tab(T, "Theory").click();

  // The smallest phone: the page fits, names three to a line, no sideways scrolling.
  const S = await phone(backend, "theory", { ...PHONE, viewport: { width: 320, height: 568 } });
  await visible(S.locator(".tp-card").first());
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const g of await S.locator(".tp-grid").all()) expect(await g.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  expect(await topFits(S), "the top bar fits at 320 px").toBe(true);
  await shot(S, "t08-theory-320", true);
  await S.context().close();

  // The owl while loading (a phone that isn't a test browser keeps it on screen at least 1.2 s), then the app.
  const ctx = await browser.newContext(PHONE);
  await backend.attach(ctx);
  await ctx.addInitScript((tk) => {
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    localStorage.setItem("aristora.role", "correction");
    localStorage.setItem("aristora.token", tk);
  }, OWNER_TOKEN);
  const O = await ctx.newPage();
  O.on("pageerror", (e) => problems.push(`[owl pageerror] ${e.message}`));
  await O.goto(site.url);
  await visible(O.locator("#splash .owl .owl-head"));
  await contains(O.locator("#splash .splash-name"), "ARISTORA");
  expect(await O.locator("#splash .owl-lid").count()).toBe(2);
  await shot(O, "t09-owl-splash");
  await until(async () => (await O.locator("#splash").count()) === 0, "the owl goes once the class is loaded", 6000);
  await visible(O.locator(".reg-row").first());
  // The install details: the manifest with the owl icons, the tab icon, the Apple icon.
  const man = await O.evaluate(async () => (await fetch("/manifest.webmanifest")).json());
  expect(man).toMatchObject({ short_name: "ARISTORA", display: "standalone", background_color: "#16213E" });
  expect(man.icons.map((i: { src: string; purpose: string }) => `${i.src} ${i.purpose}`)).toEqual([
    "/icon-192.png any",
    "/icon-512.png any",
    "/icon-maskable-192.png maskable",
    "/icon-maskable-512.png maskable",
  ]);
  for (const f of ["/icon.svg", "/icon-32.png", "/apple-touch-icon.png", ...man.icons.map((i: { src: string }) => i.src)]) {
    expect(await O.evaluate(async (f) => (await fetch(f)).status, f), f).toBe(200);
  }
  expect(await O.locator('link[rel="apple-touch-icon"]').getAttribute("href")).toBe("/apple-touch-icon.png");
  await ctx.close();
  expect(problems, problems.join("\n")).toEqual([]);
});
