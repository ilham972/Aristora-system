/// <reference types="vite/client" />
// One class on the register, acted out on three phones: Correction, Theory, Evaluation.

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { normalizeCode, secretHash } from "../../convex/lib/auth";
import { KNOWN_WORKBOOKS, outOf } from "../../convex/lib/book";
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
    // "correction" opens the Class tab (as before 29 Oct 2026), "focus" the Correction page (it was Focus), "theory"/"evaluation" those tabs.
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
/** The top bar's buttons (Correction, Class, Progress) never run into the count, the clock and Settings. */
const topFits = (p: Page) =>
  p.evaluate(() => {
    const left = document.querySelector(".top-left")!.lastElementChild!.getBoundingClientRect();
    const meta = document.querySelector(".top-meta")!.getBoundingClientRect();
    return left.right <= meta.left + 0.5 && meta.right <= window.innerWidth + 0.5;
  });
/** A picture of the phone, once the cards have risen in (0.22 s). */
/**
 * The demo dates its work up to 70 minutes back: just after midnight in Sri Lanka that is yesterday, so checks on
 * "today" (arrivals, levels done today) are skipped then.
 */
const nearMidnight = () => {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Colombo", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return h < 2;
};
const shot = async (p: Page, name: string, full = false) => {
  await p.waitForTimeout(260);
  return p.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: full });
};
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
/** The bottom bar's tabs (Correction, Theory, Evaluation: since 30 Oct 2026 Correction is a tab too); Class is the icon at the top. */
const tab = (p: Page, name: "Class" | "Correction" | "Theory" | "Evaluation") =>
  name === "Class" ? p.locator(".top .class-btn") : p.locator(`.tabs .tab.${name.toLowerCase()}`);
/**
 * The Theory page (rebuilt 30 Oct 2026): every lesson is a tiny pill (data-lesson: "U13 D", "U08 workbook"); tapping it
 * opens its students under the pills. Lessons and her room swap with the button at the bottom left.
 */
async function lessonCard(p: Page, label: string): Promise<L> {
  await toLessons(p);
  const pill = p.locator(`.tp-lp[data-lesson="${label}"]`);
  // Fighter (sections, "U13 D") or Master (workbooks, "U08 workbook"): one kind at a time (no All since 31 Oct 2026).
  const kind = p.locator(".tp-kind", { hasText: label.endsWith("workbook") ? "Master" : "Fighter" });
  if ((await pill.count()) === 0 && (await kind.getAttribute("aria-pressed")) !== "true") await kind.click();
  await visible(pill);
  if ((await pill.getAttribute("aria-pressed")) !== "true") await pill.click();
  await until(async () => (await pill.getAttribute("aria-pressed")) === "true", `the ${label} lesson open`);
  return p.locator(".tp-lesson");
}
/** Theory's lessons, or Evaluation's list to call from (the button at the bottom left: Lessons / Waiting). */
async function toLessons(p: Page) {
  const side = p.locator(".tp-pad .tp-side");
  // (A Done that empties her room goes back to the list by itself: wait for whichever comes first.)
  await until(async () => {
    if ((await p.locator(".tp-kinds").count()) > 0) return true;
    const t = (await side.textContent()) ?? "";
    if ((t.includes("Lessons") || t.includes("Waiting")) && (await side.isEnabled())) await side.click({ timeout: 1000 }).catch(() => undefined);
    return false;
  }, "the list");
}
async function toRoom(p: Page) {
  const side = p.locator(".tp-pad .tp-side");
  await visible(side);
  if (((await side.textContent()) ?? "").includes("Room")) {
    await until(async () => !(await side.isDisabled()), "someone in her room");
    await side.click();
  }
  await visible(p.locator(".tp-rhead"));
}
/** Someone she called, as a pill in her room. */
const roomPill = (p: Page, name: string) => p.locator(`.tp-rp[data-name="${name}"]`);
/** The names on these pills (or rows), as data-name says. */
const namesOf = (l: L) => l.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.name ?? ""));
/** His file in her room (his pill tapped). */
async function file(p: Page, name: string): Promise<L> {
  await toRoom(p);
  await roomPill(p, name).click();
  const f = p.locator(".tp-file", { has: p.locator(".tp-fname", { hasText: name }) });
  await visible(f);
  return f;
}
/** Theory taps Arrived for each, as they walk in (Correction sent them). */
async function arrive(p: Page, names: string[]) {
  for (const n of names) {
    const f = await file(p, n);
    await f.getByRole("button", { name: "Arrived" }).click();
    await until(async () => ((await roomPill(p, n).getAttribute("class")) ?? "").includes("rs-in"), `${n} is with her`);
  }
}
/** A student in the open lesson (tap: ticked or not). */
const chip = (card: L, name: string) => card.locator(`.tp-row[data-name="${name}"]`);
/** Tick exactly these students in the open lesson, then Call (the button at the bottom). */
async function callOnly(card: L, names: string[]) {
  const p = card.page();
  const rows = card.locator(".tp-row");
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    const name = (await r.getAttribute("data-name")) ?? "";
    if (((await r.getAttribute("aria-pressed")) === "true") !== names.includes(name)) await r.click();
  }
  await contains(p.locator(".tp-pad .tp-call"), `Call ${names.length}`);
  await p.locator(".tp-pad .tp-call").click();
}
/**
 * The Evaluation page (rebuilt 30 Oct 2026 like Theory): a student on the list to call; in her room, his file (the same
 * helpers as Theory: file, arrive); Call and Done are the buttons at the bottom.
 */
const evRow = (p: Page, name: string) => p.locator(".ev-c", { has: p.locator(".ev-c-who b", { hasText: name }) });
const evCall = (p: Page) => p.locator(".tp-pad .ev-call");
const evDone = (p: Page) => p.locator(".tp-pad .ev-done");
/** Untick everyone on the Evaluation list (one at a time: each tap re-draws the list). */
async function evClear(p: Page) {
  const on = p.locator(".ev-c.on");
  for (let i = 0; i < 12 && (await on.count()) > 0; i++) {
    const before = await on.count();
    await on.first().click();
    await until(async () => (await on.count()) < before, "one tick less");
  }
  await count(on, 0);
}
/** Tick exactly these students on the Evaluation page (every tick cleared first), then Call at the bottom. */
async function evCallOnly(p: Page, names: string[]) {
  await toLessons(p);
  await visible(evRow(p, names[0]));
  await evClear(p);
  for (const n of names) await evRow(p, n).click();
  await contains(evCall(p), `Call ${names.length}`);
  await evCall(p).click();
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
  await contains(C.locator(".top-stat .ts-n"), "13"); // in class: the count sits with the clock
  await namesAre(C.locator(".reg-row.rt-red .reg-n"), ["Fathima", "Rizwan", "Vimal"]); // no work (Vimal: every level waits)
  await count(C.locator(".reg-row.rt-yellow"), 1); // Tharun: quiet
  await shot(C, "r01-correction-register", true);
  await shot(T, "r02-theory-page", true);
  await shot(E, "r03-evaluation-page", true);

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
  const dCard = await lessonCard(T, "U13 D");
  await namesAre(dCard.locator(".tp-row.on .tp-row-m b"), ["Ahamed", "Dilan", "Fathima", "Nila"]);
  await shot(T, "r05-theory-next");
  await T.locator(".tp-pad").getByRole("button", { name: "Call 4" }).click();

  // Correction hears the names, sees one slim strip; Dilan is out (Not now, undo, Not now), the other three are sent.
  const strip = C.locator(".call-strip.theory");
  await count(strip.locator(".call-name"), 4);
  await hears(C, "Fathima, Ahamed, Dilan and Nila, go to Owner in Theory."); // most urgent first, as Theory picked them
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
  // Sent: they walk to Theory. Correction sees their 3 minutes count down until Theory taps Arrived.
  await count(C.locator(".call-strip:not(.cs-walk)"), 0);
  await namesAre(C.locator(".call-strip.cs-walk .call-name"), ["Ahamed", "Fathima", "Nila"]);
  await contains(C.locator(".call-strip.cs-walk"), "3m left");
  await shot(C, "r06c-correction-walking");
  // Theory's room: the three on the way; she taps Arrived as each walks in. Correction's strip goes.
  await toRoom(T);
  await until(
    async () => JSON.stringify((await namesOf(T.locator(".tp-rp.rs-walk"))).sort()) === '["Ahamed","Fathima","Nila"]',
    "the three on the way in her room",
  );
  await arrive(T, ["Ahamed", "Fathima", "Nila"]);
  await count(C.locator(".call-strip"), 0);

  // Theory teaches on the Class tab's rows (Theory's "All" lives there now): Fathima the whole section (one tap on D),
  // Ahamed only 23 and 24, Nila nothing yet. Then the Theory page sends everyone back, keeping only those taps.
  await tab(T, "Class").click();
  await row(T, "Fathima").getByRole("button", { name: "Section D: mark all theory taught" }).click();
  await circle(row(T, "Ahamed"), 23).click();
  await circle(row(T, "Ahamed"), 24).click();
  await shot(T, "r07-theory-teaching-on-class");
  await tab(T, "Theory").click();
  await toRoom(T);
  await T.getByRole("button", { name: "Send everyone back: nothing taught" }).click();
  await contains(T.locator(".toast"), "back to the hall, not taught");
  const f = await marksOf(backend, "Fathima");
  expect([23, 24, 25, 26].map((q) => f.marks[String(q)]?.s)).toEqual(["taught", "taught", "taught", "taught"]);
  a = await marksOf(backend, "Ahamed");
  expect([23, 24, 25, 26].map((q) => a.marks[String(q)]?.s)).toEqual(["taught", "taught", undefined, undefined]);
  expect((await marksOf(backend, "Nila")).marks["23"]).toBeUndefined();
  expect(f.room).toBeUndefined();

  // --- Evaluation calls Kumar (the page ticked others; she picks him alone); Theory then takes him straight from the
  // evaluation room.
  await evCallOnly(E, ["Kumar"]);
  await hears(C, "Kumar, go to Owner in Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  // He walks over: Evaluation taps Arrived (her room, his file).
  await arrive(E, ["Kumar"]);
  const kh = await file(E, "Kumar");
  const eCard = await lessonCard(T, "U13 E");
  await contains(chip(eCard, "Kumar").locator("small"), "in Eval"); // listed, not ticked: calling takes him from Evaluation
  expect(await chip(eCard, "Kumar").getAttribute("aria-pressed")).toBe("false");
  await callOnly(eCard, ["Kumar"]);
  await contains(E.locator(".pull-banner"), "Theory wants Kumar now");
  await hears(E, "Theory wants Kumar now.");
  // His questions one at a time: she explained Q28, then the page shows Q29.
  await contains(kh.locator(".ev-q-n"), "Q28");
  await kh.getByRole("button", { name: "Explained", exact: true }).click();
  await contains(kh.locator(".ev-q-n"), "Q29");
  await shot(E, "r08-evaluation-pull");
  await E.locator(".pull-banner").getByRole("button", { name: "Send to Theory" }).click();
  await until(async () => (await marksOf(backend, "Kumar")).room === "theory", "Kumar in Theory");
  const k = await marksOf(backend, "Kumar");
  expect(k.marks["28"]?.s).toBe("explained");
  expect(k.marks["29"]?.s).toBe("wrong");

  // Same question: U13 Q22 wrong for Ahamed and Fathima -> one tap ticks both (explain once).
  await toLessons(E); // (sending him to Theory emptied her room: the list is back by itself)
  await E.getByRole("button", { name: /^Same question U13 Q22/ }).click();
  await namesAre(E.locator(".ev-c.on .ev-c-who b"), ["Ahamed", "Fathima"]);
  await shot(E, "r09-evaluation-same-mistake");
  await E.getByRole("button", { name: "Page's pick" }).click();

  // Theory: he walks over from Evaluation (Arrived), then all taught for Kumar (section E) in one tap.
  await arrive(T, ["Kumar"]);
  await T.locator(".tp-pad .tp-done").click();
  await until(async () => (await marksOf(backend, "Kumar")).marks["34"]?.s === "taught", "Kumar E taught");

  // Theory busy with Tharun -> Evaluation teaches Rizwan section C itself.
  // Both rooms call at once: Correction gets two slim strips and hears both.
  await callOnly(await lessonCard(T, "U13 B"), ["Tharun"]);
  const teach = E.locator(".ev-teach"); // Evaluation's page knows Theory is busy
  await visible(teach);
  for (const b of await teach.locator(".tp-m").all()) {
    const who = ((await b.locator("b").textContent()) ?? "").trim();
    if (((await b.getAttribute("aria-pressed")) === "true") !== (who === "Rizwan")) await b.click();
  }
  await teach.getByRole("button", { name: "Teach 1" }).click();
  await count(C.locator(".call-strip"), 2);
  await hears(C, "Rizwan, go to Owner in Evaluation.");
  await shot(C, "r09b-correction-two-rooms");
  const small = await phone(backend, "correction", { ...PHONE, viewport: { width: 360, height: 740 } });
  await count(small.locator(".call-strip"), 2);
  expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(small, "r09c-correction-two-rooms-360px");
  await small.context().close();
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await arrive(E, ["Rizwan"]);
  await contains((await file(E, "Rizwan")).locator(".ev-teaching"), "section C");
  await shot(E, "r09d-evaluation-teaching-theory");
  await contains(evDone(E), "Done: taught");
  await evDone(E).click();
  await until(async () => (await marksOf(backend, "Rizwan")).marks["15"]?.s === "taught", "Rizwan C taught");

  // Settings, Alerts: test the alert on this phone.
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Alerts", exact: true }).click();
  await contains(C.locator(".alert-status"), "Alerts are on");
  await C.getByRole("button", { name: "Test the alert" }).click();
  await until(async () => (await said(C)).some((w) => /^Test\. \w+, go to Theory\.$/.test(w)), "the test alert speaks");
  await shot(C, "r09e-settings-alerts", true);
  await C.getByRole("button", { name: "Back to the class" }).click();

  // Attendance (a full page: the count by the clock, or Correction's +): grades 6-11 in one row. Keerthi (Grade 11)
  // arrives: one tap signs her in with the time.
  await C.locator(".top-stat").click();
  const A = C.locator(".sheet-wrap.fullpage");
  await contains(A.locator(".sheet-title h2"), "Attendance");
  const grades = A.locator(".grade-row button");
  await textsAre(grades.locator("b"), ["6", "7", "8", "9", "10", "11"]);
  const tops = await grades.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1); // one row
  await A.getByRole("button", { name: /^Grade 11\b/ }).click();
  await contains(A.locator(".attendance .summary"), "Grade 11: 9 of 10 here");
  await contains(A.getByRole("button", { name: /^Grade 7\b/ }), "3/3");
  await textsAre(A.locator(".att-list .ap.in .ap-n"), ["Ahamed", "Dilan", "Fathima", "Kumar", "Nila", "Rizwan", "Sana", "Tharun", "Yasmin"]);
  const keerthi = A.getByRole("button", { name: /^Keerthi:/ });
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
  await contains(A.locator(".attendance .summary"), "Grade 11: 10 of 10 here");
  expect(await visitsOf("Keerthi")).toHaveLength(1);
  await tab(T, "Class").click();
  await visible(row(T, "Keerthi")); // Theory sees her at once
  await tab(T, "Theory").click();
  await shot(C, "r10a-attendance"); // the page (a full-page picture would draw the sheet half-way down)
  // Tapping someone who is here asks before signing them out (a sheet over the page).
  await A.getByRole("button", { name: /^Keerthi:/ }).click();
  const out = C.locator(".sheet-wrap:not(.fullpage)");
  await contains(out.locator("h2"), "Keerthi");
  await visible(out.getByRole("button", { name: "Sign out: going home" }));
  await out.getByRole("button", { name: "Keep" }).click();
  await count(out, 0);
  // The phone remembers the last grade on this page.
  await A.getByRole("button", { name: /^Grade 7\b/ }).click();
  await textsAre(A.locator(".att-list .ap-n"), ["Malik", "Priya", "Vimal"]);
  await C.reload();
  await C.locator(".top-stat").click();
  await until(async () => (await A.getByRole("button", { name: /^Grade 7\b/ }).getAttribute("aria-pressed")) === "true", "Grade 7 remembered");
  await A.getByRole("button", { name: /^Grade 11\b/ }).click();
  await A.getByRole("button", { name: "Close" }).click();
  await count(A, 0);
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
  await C.getByRole("button", { name: "Sign students in" }).click();
  await count(A.locator(".att-list .ap.in"), 0);
  if (!nearMidnight()) await count(A.locator(".att-list .ap.left"), 10); // all of Grade 11 went home
  await A.getByRole("button", { name: "Close" }).click();

  // Attendance on the smallest phones (360 px Redmi, 320 px): the six grades stay in one row, nothing sideways.
  for (const [width, grade, name] of [
    [360, 11, "Ahamed"],
    [320, 7, "Malik"],
  ] as const) {
    const small = await phone(backend, "correction", { ...PHONE, viewport: { width, height: 640 } });
    await small.locator(".top-stat").click();
    const sa = small.locator(".sheet-wrap.fullpage");
    await sa.getByRole("button", { name: new RegExp(`^Grade ${grade}\\b`) }).click();
    await sa.getByRole("button", { name: new RegExp(`^${name}:`) }).click();
    await until(async () => (await marksOf(backend, name)).present, `${name} signed in`);
    await count(small.locator(".sheet"), 1); // no "sign out?" question: just the page
    const rows = await sa
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
    if (role === "theory") await visible(small.locator(".tp-page .tp-kinds"));
    else {
      if (role === "correction") await visible(row(small, "Ahamed")); // loaded, then measure
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
  await contains(malik.locator(".reg-s"), "On Level 4");
  await contains(malik.locator(".nx-c.correction"), "Correct L3"); // what he needs next, for everyone who looks
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

  // Priya hands Level 2 in: in Correction (the bottom tab) tap her name, then Later. It waits; she goes on to Level 3.
  await tab(C, "Correction").click();
  await C.locator(".fc-nm", { hasText: "Priya" }).click();
  await contains(C.locator(".fc-lvline"), "Level 2");
  await C.getByRole("button", { name: "Handed in: correct later" }).click();
  await contains(C.locator(".toast"), "Priya: Level 2 handed in");
  await count(C.locator(".fc-paper"), 0);
  await tab(C, "Class").click(); // back to the class
  await contains(tab(C, "Correction").locator(".tab-badge"), "2"); // two papers wait: Priya's L2 and Vimal's L8
  await textsAre(row(C, "Priya").locator(".mk b"), ["L2", "3"]);
  expect((await marksOf(backend, "Priya")).m!.lv["2"]?.done).toBeGreaterThan(0);

  // Evaluation, on the Class page (her taps on its rows): Malik's lost marks are red circles; tap Q24 when it's explained.
  await tab(E, "Class").click();
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
  // Everyone sees where Malik goes next.
  await contains(malik.locator(".nx-c.theory"), "Theory 2");
  await contains(malik.locator(".nx-c.evaluation"), "Eval 1");

  // Evaluation calls Vimal from her page and explains everything in one tap.
  await tab(E, "Evaluation").click();
  await evCallOnly(E, ["Vimal"]);
  await hears(C, "Vimal, go to Owner in Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await arrive(E, ["Vimal"]);
  await contains(evDone(E), "All explained");
  await evDone(E).click();
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
  await contains(row(C, "Vimal").locator(".nx-c.theory"), "Theory 1");
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
  await contains(tm.locator(".nx-c.theory"), "Theory 2");
  await contains(row(T, "Vimal").locator(".reg-s"), "No work");
  await textsAre(row(T, "Vimal").locator(".reg-act .q"), ["57"]);
  // The Theory page: one workbook card for everyone with questions for Theory (no question shared by both); this time
  // Theory takes Malik only.
  await tab(T, "Theory").click();
  const wCard = await lessonCard(T, "U08 workbook");
  await namesAre(wCard.locator(".tp-row-m b"), ["Malik", "Vimal"]);
  expect(await wCard.locator(".tp-lh-t").textContent()).not.toContain("×");
  await contains(chip(wCard, "Vimal").locator("small"), "no work");
  await callOnly(wCard, ["Malik"]);
  await hears(C, "Malik, go to Owner in Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await until(async () => (await marksOf(backend, "Malik")).room === "theory", "Malik on his way to Theory");
  // He walks in: Arrived. His file: his questions for Theory with what he got and who sent them.
  const mf = await file(T, "Malik");
  await mf.getByRole("button", { name: "Arrived" }).click();
  await visible(mf.getByRole("button", { name: "Malik: got it" }));
  await textsAre(mf.locator(".tp-fq .tf-q.on"), ["Q13", "Q17"]);
  await contains(mf.locator(".tp-fq-w").first(), "Evaluation");
  // Q13 taught; the bell rang before Q17: it stays with Theory.
  await mf.getByRole("button", { name: "Malik Q17 taught" }).click();
  await shot(T, "m05-theory-reteach");
  await T.locator(".tp-pad .tp-done").click();
  await until(async () => (await marksOf(backend, "Malik")).room === undefined, "Malik back in the hall");
  let mt = (await marksOf(backend, "Malik")).m!;
  expect(mt.q["13"]?.tt).toBeDefined();
  expect([mt.q["17"]?.th !== undefined, mt.q["17"]?.tt]).toEqual([true, undefined]);
  await visible(T.locator(".tp-pad .tp-side:disabled")); // her room is empty: Theory's phone sees him gone
  await tab(T, "Class").click();
  await textsAre(tm.locator(".reg-act .q"), ["13", "17"]); // Q13 just taught (tap to undo), Q17 still to teach
  await tab(T, "Theory").click();
  await callOnly(await lessonCard(T, "U08 workbook"), ["Malik"]);
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await arrive(T, ["Malik"]);
  await T.locator(".tp-pad .tp-done").click();
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
  await visible(row(small, "Vimal").locator(".strip-tag"));
  for (const name of ["Malik", "Priya", "Vimal"]) {
    const act = row(small, name).locator(".reg-act");
    expect(await act.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${name}'s row fits at 360 px`).toBe(true);
    const strip = row(small, name).locator(".reg-strip");
    expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), `${name}'s next and bar fit at 360 px`).toBe(true);
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

  // Top bar: the count of students in class sits with the class clock (a tap opens Attendance); Progress is an icon.
  const stat = C.locator(".top-stat");
  await contains(stat.locator(".ts-n"), "13");
  expect(await stat.getAttribute("aria-label")).toMatch(/^13 in class, class time \d+:\d\d\. Attendance$/);
  await C.getByRole("button", { name: "Progress", exact: true }).click();

  // Grade 7: three workbook students on U08, ranked by levels done.
  await C.getByRole("button", { name: /^Grade 7:/ }).click();
  const lane = C.locator(".lane", { hasText: "U08 Directed numbers" });
  await textsAre(lane.locator(".lr-name"), ["Vimal", "Malik", "Priya"]);
  await textsAre(lane.locator(".rk"), ["1", "2", "3"]);
  const malik = lane.locator(".lr", { hasText: "Malik" });
  await contains(malik.locator(".lr-nums"), "3/8");
  await contains(malik.locator(".lr-pct"), "85%");
  if (!nearMidnight()) await contains(malik.locator(".lr-meta"), "+3 today");
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
  if (!nearMidnight()) {
    await C.locator(".pf-chip.today").click(); // only who came today: Keerthi isn't in
    await count(f.locator(".lr"), 9);
    await C.locator(".pf-chip.today").click();
  }

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
    // Her job is Correction: the bottom bar has only Correction (Theory and Evaluation are the teachers' pages); Class
    // at the top; she starts on Correction, though the phone last showed Theory.
    await visible(tab(R, "Correction")); // marks papers, + takes attendance
    await visible(R.getByRole("button", { name: /^Class/ })); // and sees the whole class
    await visible(R.getByRole("button", { name: /in class.*\. Attendance$/ })); // the count by the clock: Attendance too
    await textsAre(R.locator(".tabs .tab > span:nth-child(2)"), ["Correction"]);
    expect(await tab(R, "Correction").getAttribute("aria-current")).toBe("page");
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
    await visible(tab(R, "Correction"));
    await textsAre(R.locator(".tabs .tab > span:nth-child(2)"), ["Correction"]);

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

test("Correction: one page (one grade's names in one line, + for attendance, the level bar, his unit), one question at a time, ? on a part, Take back", async () => {
  const backend = await newClass();
  const F = await phone(backend, "focus");
  const E = await phone(backend, "evaluation");
  await F.getByRole("button", { name: "Settings" }).click();
  await F.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(F.getByText(/^14 demo students loaded/));
  await F.getByRole("button", { name: "Back to the class" }).click();
  // Correction is a bottom tab (it was at the top, and was "Focus"), first of the jobs; Class is at the top. The phone
  // opens on Correction.
  await textsAre(F.locator(".tabs .tab > span:nth-child(2)"), ["Correction", "Theory", "Evaluation"]);
  expect(await tab(F, "Correction").getAttribute("aria-current")).toBe("page");
  await count(F.locator(".tabs .tab.on"), 1);
  await count(F.locator(".top .focus-btn"), 0);

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
  const name = (n: string) => F.locator(".fc-nm", { hasText: new RegExp(`^${n}`) });
  /** Flex boxes run their parts onto lines: compare with the spaces squeezed. */
  const says = (l: L, text: string) =>
    until(async () => (await l.first().innerText()).replace(/\s+/g, " ").includes(text), `"${text}" in ${l}`);
  const savedSheet = async () => {
    await tap(F.getByRole("button", { name: /^Saved on this phone/ }));
    await contains(F.locator(".sheet h2"), "Saved on this phone");
  };

  // The grades 6–11, always in the same places (no All), each with "here/total" as on Attendance; one grade's names
  // at a time, A–Z, in ONE line after its +. The youngest grade in shows first; what waits for the corrector in colour,
  // on the names and on their grade.
  await textsAre(F.locator(".fc-grades .gp b"), ["6", "7", "8", "9", "10", "11"]);
  await textsAre(F.locator(".fc-grades .gp small"), ["–", "3/3", "1/1", "1/1", "–", "9/10"]);
  expect(await F.getByRole("button", { name: "Grade 6: no students" }).isDisabled()).toBe(true);
  await visible(F.getByRole("button", { name: "Grade 7: 3 of 3 here, 1 need you now" })); // Vimal red; Malik amber
  await textsAre(F.locator(".fc-nm"), ["Malik", "Priya", "Vimal"]);
  await visible(F.locator(".fc-nm.amber", { hasText: "Malik" })); // L3 handed in
  await visible(F.locator(".fc-nm.red", { hasText: "Vimal" })); // out of work until L8 is corrected
  await tap(F.getByRole("button", { name: /^Grade 9\b/ }));
  await textsAre(F.locator(".fc-nm"), ["Zainab"]);
  await visible(F.locator(".fc-nm.nb", { hasText: "Zainab" })); // Legend: no book in the app
  await tap(F.getByRole("button", { name: /^Grade 11\b/ }));
  await textsAre(F.locator(".fc-nm"), ["Ahamed", "Dilan", "Fathima", "Kumar", "Nila", "Rizwan", "Sana", "Tharun", "Yasmin"]);
  await visible(F.locator(".fc-nm.th", { hasText: "Nila" })); // theory book
  await visible(F.locator(".fc-hint", { hasText: "Tap the name on the paper." }));
  // One line, one pill high, that scrolls sideways (a faded edge says there is more); the page itself never does.
  const namesBox = F.locator(".fc-names");
  expect((await namesBox.boundingBox())!.height).toBeLessThan(45);
  expect(await namesBox.evaluate((e) => e.scrollWidth > e.clientWidth + 10)).toBe(true);
  await visible(F.locator(".hrow.more-r .fc-names"));
  expect(await F.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(F, "f01-focus-names", true);

  // + (first in the names row): this grade's Attendance, the whole page, no grade to pick again. Keerthi arrives:
  // one tap; she joins the names, and the grade says 10/10.
  await tap(F.getByRole("button", { name: "Attendance: Grade 11" }));
  const att = F.locator(".sheet-wrap.fullpage");
  await contains(att.locator(".sheet-title h2"), "Attendance · Grade 11");
  await count(att.locator(".grade-row"), 0);
  await contains(att.locator(".attendance .summary"), "Grade 11: 9 of 10 here");
  await tap(att.getByRole("button", { name: /^Keerthi:/ }));
  await until(async () => (await marksOf(backend, "Keerthi")).present, "Keerthi signed in");
  await contains(F.locator(".toast"), "Keerthi signed in, ");
  await shot(F, "f01b-correction-attendance");
  await tap(att.getByRole("button", { name: "Close" }));
  await count(att, 0);
  await textsAre(F.locator(".fc-nm"), ["Ahamed", "Dilan", "Fathima", "Keerthi", "Kumar", "Nila", "Rizwan", "Sana", "Tharun", "Yasmin"]);
  await contains(F.getByRole("button", { name: /^Grade 11\b/ }), "10/10");
  await tap(F.getByRole("button", { name: /^Grade 7\b/ }));

  // Priya: her paper opens under the names at the level she is on (L2). The names stay; hers is dark.
  await tap(name("Priya"));
  await contains(F.locator(".fc-name"), "Priya");
  await textsAre(F.locator(".fc-bk.on i"), ["8"]); // her book now, dark, in the row of her books
  await visible(F.locator(".fc-nm.on", { hasText: "Priya" }));
  await textsAre(F.locator(".fc-lvbar .fc-lb"), ["1", "2", "3", "4", "5", "6", "7", "8"]);
  await visible(F.locator(".fc-lb.fixed.on, .fc-lb.current.on", { hasText: "2" }));
  await says(F.locator(".fc-lvline"), "Level 2 · Q11–20");
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
  // Saved exactly as the Class page's correct sheet saves it; her next level opens by itself.
  const p2 = (await marksOf(backend, "Priya")).m!;
  expect(p2.lv["2"]).toMatchObject({ got: 16, by: "correction" });
  expect(p2.q["13"]).toMatchObject({ got: 0, max: 2, lost: true });
  expect(p2.q["14"]).toMatchObject({ got: 2, lost: false });
  expect(p2.q["15"]).toMatchObject({ got: 0, dk: true, tb: "correction" });
  await says(F.locator(".fc-lvline"), "Level 3 · Q21–30");
  await contains(F.locator(".fc-qn"), "21");
  await visible(F.locator(".fc-lb.fixed", { hasText: "2" }));

  // Malik: his paper opens at once at the level he handed in (L3, the oldest); every question full; Save.
  await tap(name("Malik"));
  await count(F.locator(".toast"), 0);
  await says(F.locator(".fc-lvline"), "Level 3 · Q21–30 · Part I · handed in 6 min ago");
  await shot(F, "f04-focus-level-bar");
  for (let q = 21; q <= 30; q++) {
    await contains(F.locator(".fc-qn"), String(q));
    await tap(F.locator(".fc-go"));
  }
  await tap(F.getByRole("button", { name: /^Save Malik · 20 \/ 20/ }));
  await contains(F.locator(".toast"), "Saved: Malik, Level 3, 20 / 20.");
  expect((await marksOf(backend, "Malik")).m!.lv["3"]).toMatchObject({ got: 20 });
  await says(F.locator(".fc-lvline"), "Level 4 · Q31–37");

  // It was Priya's Level 3 paper. Take it back (↶ Saved): Malik's Level 3 waits again exactly as before.
  await savedSheet();
  await contains(F.locator(".fc-sv").first(), "Malik · L3 · 20 / 20");
  await tap(F.locator(".fc-sv", { hasText: "Malik" }).getByRole("button", { name: "Take back" }));
  await contains(F.locator(".sheet h2"), "Take back Malik's Level 3?");
  await shot(F, "f05-focus-take-back");
  await tap(F.locator(".sheet").getByRole("button", { name: "Take back" }));
  await contains(F.locator(".toast"), "Taken back: Malik's Level 3 is as it was.");
  const mk = (await marksOf(backend, "Malik")).m!;
  expect(mk.lv["3"].fixed).toBeUndefined();
  expect(mk.lv["3"].done).toBeGreaterThan(0);
  expect(mk.q["21"]).toBeUndefined();
  await contains(F.locator(".fc-carry"), "Marks taken back from Malik (Q21–30)");
  // Tap Priya: her Level 3 opens with those marks, ready to save; then her Level 4 opens by itself.
  await tap(name("Priya"));
  await contains(F.locator(".fc-carried"), "taken back from Malik");
  await says(F.locator(".fc-lvline"), "Level 3 · Q21–30");
  await says(F.locator(".fc-total"), "20 / 20");
  await shot(F, "f06-focus-marks-moved");
  await tap(F.getByRole("button", { name: /^Save Priya · 20 \/ 20/ }));
  await contains(F.locator(".toast"), "Saved: Priya, Level 3, 20 / 20.");
  expect((await marksOf(backend, "Priya")).m!.lv["3"]).toMatchObject({ got: 20, by: "correction" });
  await count(F.locator(".fc-carry"), 0);
  await says(F.locator(".fc-lvline"), "Level 4");
  const kinds = await backend.t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("level-")));
  expect(kinds.filter((e) => e.kind === "level-marks").map((e) => `${e.name} ${e.value}`)).toEqual(["Priya 2 16/20", "Priya 3 20/20"]);
  expect(kinds.find((e) => e.kind === "level-unmarked")).toMatchObject({ name: "Malik", value: "3 20/20" });

  // An old level: tap Level 2 on her bar. Its marks show; Q13 was really right: change it, Save changes, back to Level 4.
  // On the bar, Level 2 has a violet dot (Q13 waits for Evaluation). In its boxes: E on Q13 (hollow: Evaluation hasn't
  // explained it yet), T on Q15 (blank: sent to Theory, not taught yet).
  await visible(F.locator(".fc-lb.fixed.w-eval", { hasText: "2" }));
  await tap(F.locator(".fc-lb", { hasText: "2" }).first());
  await says(F.locator(".fc-lvline"), "Level 2 · Q11–20 · Part I · corrected 16 / 20");
  await contains(F.locator(".fc-remark"), "Corrected before.");
  await visible(F.getByRole("button", { name: "No changes" }));
  await textsAre(F.locator(".fc-sq .fc-ts"), ["E", "T"]);
  await visible(F.locator(".fc-sq", { hasText: "13" }).locator(".fc-ts.eval"));
  await visible(F.locator(".fc-sq", { hasText: "15" }).locator(".fc-ts.theory"));
  expect(await F.locator(".fc-sq", { hasText: "15" }).getAttribute("aria-label")).toBe("Q15: ? blank, sent to Theory, not taught yet");
  await shot(F, "f06e-correction-teacher-marks");
  await tap(F.locator(".fc-sq", { hasText: "13" }));
  await contains(F.locator(".fc-teach.eval"), "Waiting for Evaluation");
  await tap(F.getByRole("button", { name: "Q13: 2 of 2" }));
  await says(F.locator(".fc-total"), "18 / 20");
  await shot(F, "f06c-focus-old-level");
  await tap(F.getByRole("button", { name: /^Save changes · Priya · 18 \/ 20/ }));
  await contains(F.locator(".toast"), "Changed: Priya, Level 2, 18 / 20.");
  expect((await marksOf(backend, "Priya")).m!.q["13"]).toMatchObject({ got: 2, lost: false });
  await says(F.locator(".fc-lvline"), "Level 4");
  await visible(F.locator(".fc-lb.fixed.w-theory", { hasText: "2" })); // only Q15 waits now, for Theory

  // His card (Marks): Going home, Needs theory, Move and the marks table, as on Class; a level there opens it here.
  await tap(name("Malik"));
  await tap(F.getByRole("button", { name: "Malik: his marks and buttons" }));
  await contains(F.locator(".sheet h2"), "Malik");
  await textsAre(F.locator(".sheet .book-acts button"), ["Going home", "Needs theory", "Move: unit or stage"]);
  await visible(F.locator(".sheet .mtable"));
  await shot(F, "f06d-focus-card");
  await tap(F.locator(".sheet").getByRole("button", { name: /^Level 1, questions 1 to 10/ }));
  await count(F.locator(".sheet"), 0);
  await says(F.locator(".fc-lvline"), "Level 1 · Q1–10 · Part I · corrected");

  // While a paper is open, a call still rings on this phone (it is the Correction job) and is sent from here.
  await tap(F.getByRole("button", { name: /^Grade 8\b/ }));
  await textsAre(F.locator(".fc-nm"), ["Nimal"]);
  await tap(name("Nimal"));
  await contains(F.locator(".fc-nokey"), "No answer key for this workbook yet");
  await tap(F.locator(".fc-go"));
  await contains(F.locator(".fc-qn"), "2");
  await evCallOnly(E, ["Malik"]);
  await hears(F, "Malik, go to Owner in Evaluation.");
  await F.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await count(F.locator(".call-strip"), 0); // sent: on the paper's page his 3-minute walk shows no strip (Class shows it)
  await contains(F.locator(".fc-qn"), "2"); // still on his paper, at the same question
  // Switching pages keeps the open paper.
  await tab(F, "Class").click();
  await visible(row(F, "Priya"));
  await textsAre(row(F, "Priya").locator(".mk b"), ["L4"]); // Class sees Focus's saves
  await tab(F, "Correction").click();
  await contains(F.locator(".fc-name"), "Nimal");
  await contains(F.locator(".fc-qn"), "2");
  // No Stop: tapping another name keeps every mark (on the server, for any phone); his paper opens again where it stopped.
  await tap(F.getByRole("button", { name: "Q2: 0 of 2" }));
  await contains(F.locator(".fc-qn"), "3");
  await tap(F.getByRole("button", { name: /^Grade 7\b/ }));
  await tap(name("Priya"));
  const drafts = () => backend.t.run(async (ctx) => (await ctx.db.query("drafts").collect()).map((d) => JSON.stringify(d.q)));
  await until(async () => (await drafts()).join() === JSON.stringify({ "1": { g: 2 }, "2": { g: 0 } }), "Nimal's draft on the server");
  expect((await marksOf(backend, "Nimal")).m?.lv["1"]).toBeUndefined(); // nothing counts until the level is saved
  await tap(F.getByRole("button", { name: /^Grade 8\b/ }));
  await visible(F.locator(".fc-nm.d", { hasText: "Nimal" })); // marked part of the way: a dashed ring
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
  await until(async () => (await drafts()).length === 0, "Nimal's draft gone");

  // His paper is from Level 3: he started U01 before the app. Tap 3 on the bar, mark it; Levels 1–2 count as done on paper.
  await tap(F.locator(".fc-lb", { hasText: "3" }).first());
  await says(F.locator(".fc-lvline"), "Level 3 · Q21–30");
  for (let q = 21; q <= 30; q++) {
    await contains(F.locator(".fc-qn"), String(q));
    await tap(F.locator(".fc-go"));
  }
  await tap(F.getByRole("button", { name: /^Save Nimal · 20 \/ 20/ }));
  await contains(F.locator(".toast"), "Levels 1–2: done before the app.");
  await visible(F.locator(".fc-lb.pre", { hasText: "1" }));
  await says(F.locator(".fc-lvline"), "Level 4");
  expect((await marksOf(backend, "Nimal")).m!.lv["1"]?.pre).toBeGreaterThan(0);

  // His units (the book button before his books): all 31 of Grade 8 on one screen, no scrolling, as small pills (number
  // and Tamil name) under Term 1 / 2 / 3. Each fills as far as he got (green: good marks); his unit now has a dark ring.
  const pill = (n: number) => F.locator(".su-p", { has: F.locator("b", { hasText: new RegExp(`^${n}$`) }) });
  await tap(F.locator(".fc-units"));
  await contains(F.locator(".sheet h2"), "Nimal: units");
  await visible(F.locator(".su-st.master.on"));
  expect(await F.locator(".su-tl").allTextContents()).toEqual(["Term 1", "Term 2", "Term 3"]);
  const units = await F.locator(".su-p b").allTextContents();
  expect(units.length).toBe(31);
  expect(units.slice(0, 3)).toEqual(["1", "2", "3"]);
  await visible(F.locator(".su-p.on.good", { hasText: "1" })); // Levels 1–3 of U01 done, 20 / 20
  expect(await pill(1).getAttribute("style")).toMatch(/--p:\s*(?!0%)\d+%/);
  expect(await pill(1).getAttribute("aria-label")).toMatch(/he is on it now, 3 of \d+ levels done, 100%/);
  await visible(pill(2).and(F.locator(".nb"))); // no workbook in the app: dashed
  const oneShot = () =>
    F.evaluate(() => {
      const all = document.querySelectorAll(".su-p");
      const body = document.querySelector(".sheet-body")!;
      return all[all.length - 1].getBoundingClientRect().bottom <= window.innerHeight && body.scrollTop === 0;
    });
  expect(await oneShot(), "every unit on one screen (390 x 844)").toBe(true);
  await F.setViewportSize({ width: 360, height: 640 });
  expect(await oneShot(), "every unit on one screen (360 x 640)").toBe(true);
  await shot(F, "f15-correction-units-360");
  await F.setViewportSize(PHONE.viewport);
  await shot(F, "f15b-correction-units");
  await tap(pill(2));
  await count(F.locator(".sheet"), 0);
  await contains(F.locator(".toast"), "Nimal: Master · 2");
  await contains(F.locator(".fc-paper .empty-title"), "No workbook for G8 · U02 in the app yet");
  expect((await marksOf(backend, "Nimal")).unitKey).toBe("G8-U02");
  // Back to unit 1: his paper opens there again, at the level he is on (4).
  await tap(F.locator(".fc-units"));
  await tap(pill(1));
  await says(F.locator(".fc-lvline"), "Level 4");
  expect((await marksOf(backend, "Nimal")).unitKey).toBe("G8-U01");
  // Books given: each tap gives that unit's workbook (✓, green) or takes it back; the sheet stays open. Per book:
  // the theory book of the same unit is not given.
  await tap(F.locator(".fc-units"));
  await tap(F.locator(".sheet").getByRole("button", { name: "Books given" }));
  await contains(F.locator(".su-key"), "Books given: tap each workbook you gave him");
  await tap(pill(1));
  await tap(pill(3));
  await visible(pill(1).and(F.locator(".given")).locator(".su-g"));
  await visible(pill(3).and(F.locator(".given")));
  await tap(pill(3));
  await count(F.locator(".su-p.given"), 1);
  await shot(F, "f15c-correction-books-given");
  const handouts = () =>
    backend.t.run(async (ctx) =>
      Promise.all(
        (await ctx.db.query("handouts").collect()).map(async (h) => `${(await ctx.db.get(h.unitId))!.key} ${h.stage}`),
      ),
    );
  await until(async () => JSON.stringify(await handouts()) === JSON.stringify(["G8-U01 master"]), "U01 workbook given");
  await tap(F.locator(".sheet").getByRole("button", { name: "Fighter" }));
  await count(F.locator(".su-p.given"), 0);
  await tap(F.locator(".sheet").getByRole("button", { name: "Close" }));
  await count(F.locator(".sheet"), 0);
  // Opened again: from the server.
  await tap(F.locator(".fc-units"));
  await visible(pill(1).and(F.locator(".given")));
  await tap(F.locator(".sheet").getByRole("button", { name: "Close" }));
  const given = await backend.t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind.startsWith("book-given")));
  expect(given.map((e) => `${e.kind} ${e.value}`)).toEqual([
    "book-given G8-U01 workbook",
    "book-given G8-U03 workbook",
    "book-given-off G8-U03 workbook",
  ]);
  // His books in ONE line under his name: his book now (dark) and every book given to him that he hasn't finished.
  // Give him U03 too: it joins the row; one tap switches his paper to it (no dialog), another tap back.
  await textsAre(F.locator(".fc-bk i"), ["1"]);
  const u03 = await backend.t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U03")).first())!._id);
  await backend.t.mutation(api.students.setGiven, { token: OWNER_TOKEN, id: nimal, unitId: u03, stage: "master", given: true });
  await backend.push();
  await textsAre(F.locator(".fc-bk i"), ["1", "3"]);
  expect(await F.locator(".fc-bookrow").evaluate((e) => e.getBoundingClientRect().height < 44)).toBe(true);
  await shot(F, "f15d-correction-books-row");
  const bk = (n: number) => F.locator(".fc-bk").filter({ has: F.locator("i", { hasText: new RegExp(`^${n}$`) }) });
  await tap(bk(3));
  await contains(F.locator(".toast"), "Nimal: Master · 3");
  await contains(F.locator(".fc-paper .empty-title"), "No workbook for G8 · U03 in the app yet");
  await textsAre(F.locator(".fc-bk.on i"), ["3"]);
  await tap(bk(1));
  await says(F.locator(".fc-lvline"), "Level 4");
  expect((await marksOf(backend, "Nimal")).unitKey).toBe("G8-U01");

  // A theory-book student: his questions in book order, ✓ right / ✗ wrong / ↻ slip, saved like the Class rows' circles.
  await tap(F.getByRole("button", { name: /^Grade 11\b/ }));
  await tap(name("Nila"));
  await textsAre(F.locator(".fc-bk.on i"), ["13"]);
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
  // His notebook ends at Q21: tap the next name. The marks reach the server like the Class rows' taps.
  await tap(name("Kumar"));
  const nila = async () => (await marksOf(backend, "Nila")).marks;
  await until(async () => {
    const m = await nila();
    return m["19"]?.s === "right" && m["20"]?.s === "wrong" && m["21"]?.s === "slip";
  }, "Nila's marks saved");
  expect((await nila())["20"]?.n).toBe(1);
  // Marked on the wrong student? Take back puts them as they were.
  await savedSheet();
  await contains(F.locator(".fc-sv").first(), "Nila · Q19–Q21 · 3 marks");
  await tap(F.locator(".fc-sv", { hasText: "Nila" }).getByRole("button", { name: "Take back" }));
  await contains(F.locator(".sheet h2"), "Take back Nila's marks?");
  await tap(F.locator(".sheet").getByRole("button", { name: "Take back" }));
  await contains(F.locator(".toast"), "Taken back: Nila's marks are as they were.");
  await until(async () => {
    const m = await nila();
    return !m["19"] && !m["20"] && !m["21"];
  }, "Nila's marks back as they were");
  await F.context().close();

  // The smallest phone (320 px): Vimal's last level. Q56 in two parts: he left part ii blank (? on that part only).
  const S = await phone(backend, "focus", { ...PHONE, viewport: { width: 320, height: 568 } });
  const stap = async (l: L) => {
    await S.waitForTimeout(420);
    await l.click();
  };
  await visible(S.locator(".fc-nm").first());
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await topFits(S), "the top bar fits at 320 px").toBe(true);
  await shot(S, "f07-focus-names-320", true);
  await stap(S.locator(".fc-nm", { hasText: "Vimal" }));
  await contains(S.locator(".fc-qn"), "56");
  // The names and grades stay pinned under the top bar (his own name dark); the question scrolls into view by itself.
  const topH = (await S.locator(".top-wrap").boundingBox())!.height;
  const pinned = async () => (await S.locator(".fc-stick").boundingBox())!;
  expect((await pinned()).y).toBeGreaterThanOrEqual(topH - 1);
  expect((await S.locator(".fc-nm.on", { hasText: "Vimal" }).boundingBox())!.y).toBeGreaterThanOrEqual(topH - 1);
  await textsAre(S.locator(".fc-part .fc-pt em"), ["i)", "ii)"]);
  await says(S.locator(".fc-go"), "4 / 4");
  // The parts give the marks: no number row, just "?" (the whole question) and the big button; the parts, the name and
  // the strip on screen above the pad (the tap on the name already turned the alerts banner off).
  await count(S.locator(".fc-nums"), 0);
  await count(S.locator(".sound-banner"), 0);
  await stap(S.getByRole("button", { name: "Part ii: ? left blank" }));
  await says(S.locator(".fc-go"), "2 / 4 ? ii blank");
  await count(S.locator(".fc-go.dk"), 1);
  const padTop = (await S.locator(".fc-pad").boundingBox())!.y;
  const lastPart = (await S.locator(".fc-part").last().boundingBox())!;
  expect(lastPart.y + lastPart.height).toBeLessThanOrEqual(padTop + 1);
  const pin = await pinned();
  expect(lastPart.y).toBeGreaterThanOrEqual(pin.y + pin.height - 1); // the parts: between the pinned names and the pad
  await shot(S, "f08-focus-parts-320");
  // The pad is on screen, with nothing spilling sideways.
  const go = (await S.locator(".fc-go").boundingBox())!;
  expect(go.y + go.height).toBeLessThanOrEqual(568);
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await stap(S.locator(".fc-go"));
  // Q57 is 11 marks: "a part left blank", ? and 0 to 11 all fit, and the pad stays on screen.
  await contains(S.locator(".fc-qn"), "57");
  await count(S.locator(".fc-nums .fc-n"), 13);
  await visible(S.locator(".fc-pblank"));
  const go57 = (await S.locator(".fc-go").boundingBox())!;
  expect(go57.y + go57.height).toBeLessThanOrEqual(568);
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(S, "f09-focus-11-marks-320");
  await stap(S.locator(".fc-go"));
  await says(S.locator(".fc-total"), "13 / 15");
  await contains(S.locator(".fc-sum .ct-dk"), "Q56 (ii): blank, so straight to Theory.");
  await shot(S, "f10-focus-summary-320");
  await stap(S.getByRole("button", { name: /^Save Vimal · 13 \/ 15/ }));
  await contains(S.locator(".toast"), "Saved: Vimal, Level 8, 13 / 15. Theory: Q56.");
  expect((await marksOf(backend, "Vimal")).m!.q["56"]).toMatchObject({ got: 2, max: 4, lost: true, dk: true, dkp: ["ii"] });
  // That was his last level: the unit's marks come by themselves (to write on the marks sheet in his book).
  await visible(S.locator(".fc-over"));
  await until(async () => ((await S.locator(".fc-over-k").textContent()) ?? "") === "Unit 8 finished", "Unit 8 finished");
  await visible(S.locator(".fc-over .mtable"));
  // The usual next step, as on Class → Move: the next workbook of his term (Unit 9, Angles).
  await contains(S.locator(".fc-next"), "Next: Master · 9");
  await shot(S, "f10b-focus-unit-finished-320", true);
  // Nimal's workbook on the smallest phone: the level bar (a big unit) and the questions, each ONE line that keeps
  // the open one in view by itself.
  await stap(S.getByRole("button", { name: /^Grade 8\b/ }));
  await stap(S.locator(".fc-nm", { hasText: "Nimal" }));
  await says(S.locator(".fc-lvline"), "Level 4");
  const inView = (sel: string) =>
    S.locator(sel).evaluate((box) => {
      const on = box.querySelector(".on");
      if (!on) return false;
      const a = on.getBoundingClientRect();
      const b = box.getBoundingClientRect();
      return a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
    });
  const oneLine = (sel: string, h: number) => S.locator(sel).evaluate((e, max) => e.getBoundingClientRect().height < max, h);
  expect(await oneLine(".fc-lvbar", 45)).toBe(true);
  expect(await S.locator(".fc-lvbar").evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  expect(await inView(".fc-lvbar")).toBe(true);
  for (let q = 31; q <= 39; q++) {
    await contains(S.locator(".fc-qn"), String(q));
    await stap(S.locator(".fc-go"));
  }
  await contains(S.locator(".fc-qn"), "40");
  expect(await oneLine(".fc-strip", 52)).toBe(true);
  expect(await S.locator(".fc-strip").evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  await until(() => inView(".fc-strip"), "Q40 in view by itself");
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(S, "f16-correction-one-line-320");
  // Grade 11, then away and back: the open name stays in view by itself (Yasmin, the last).
  await stap(S.getByRole("button", { name: /^Grade 11\b/ }));
  await stap(S.locator(".fc-nm", { hasText: "Yasmin" }));
  await stap(S.getByRole("button", { name: /^Grade 7\b/ }));
  await stap(S.getByRole("button", { name: /^Grade 11\b/ }));
  await until(() => inView(".fc-names"), "Yasmin's name in view by itself");
  // A theory book on the smallest phone: name, question and the three buttons fit.
  await stap(S.locator(".fc-nm", { hasText: "Kumar" }));
  await contains(S.locator(".fc-qn"), "30");
  const right = (await S.locator(".fc-go").boundingBox())!;
  expect(right.y + right.height).toBeLessThanOrEqual(568);
  // His name dark in the pinned row; the question's number in view above the three buttons.
  expect((await S.locator(".fc-nm.on", { hasText: "Kumar" }).boundingBox())!.y).toBeGreaterThanOrEqual(topH - 1);
  const qn = (await S.locator(".fc-qn").boundingBox())!;
  const pin2 = await pinned();
  expect(qn.y).toBeGreaterThanOrEqual(pin2.y + pin2.height - 1);
  expect(qn.y + qn.height).toBeLessThanOrEqual((await S.locator(".fc-pad").last().boundingBox())!.y + 1);
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(S, "f14-focus-theory-320");
  await S.context().close();

  // 360 px: the names and a question.
  const M = await phone(backend, "focus", { ...PHONE, viewport: { width: 360, height: 640 } });
  await visible(M.locator(".fc-nm").first());
  expect(await M.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(M, "f11-focus-names-360", true);
  await M.locator(".fc-nm", { hasText: "Malik" }).click();
  await contains(M.locator(".fc-qn"), "21");
  const g360 = (await M.locator(".fc-go").boundingBox())!;
  expect(g360.y + g360.height).toBeLessThanOrEqual(640);
  await shot(M, "f12-focus-question-360");
  // Signed out (gone home) while his paper is open: Evaluation and Theory don't see him, so it says so; one tap signs
  // him back in.
  const malikId = (await marksOf(backend, "Malik"))._id;
  await backend.t.mutation(api.students.setPresent, { token: OWNER_TOKEN, id: malikId, present: false });
  await backend.push();
  await contains(M.locator(".fc-out"), "Signed out: Evaluation and Theory don't see him.");
  await visible(M.locator(".fc-nm.home.on", { hasText: "Malik" }));
  // The line pushes his paper down: the question comes back into view above the pad by itself.
  await until(async () => {
    const q = (await M.locator(".fc-qn").boundingBox())!;
    const pad = (await M.locator(".fc-pad").last().boundingBox())!;
    return q.y + q.height <= pad.y + 1;
  }, "Q21 above the pad");
  await shot(M, "f12b-correction-signed-out-360");
  await M.locator(".fc-out").getByRole("button", { name: "Sign him in" }).click();
  await count(M.locator(".fc-out"), 0);
  expect((await marksOf(backend, "Malik")).present).toBe(true);
  await M.context().close();
  await E.context().close();
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Theory: lessons as tiny pills, most useful first; her room with Arrived and his file; Correction's 3 minutes; the owl", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  const T = await phone(backend, "theory");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  const marks = async (name: string) => (await marksOf(backend, name)).marks;
  const callBtn = T.locator(".tp-pad .tp-call");
  const doneBtn = T.locator(".tp-pad .tp-done");

  // Pinned under the top bar: today's score in one thin line, Fighter / Master / Legend (the most urgent first and
  // picked; no All since 31 Oct 2026; Legend pale: no books yet), then every lesson of that kind as a tiny pill in ONE
  // line, the most useful first: D gives work to 3 now (Fathima has none, Ahamed and Dilan run out within a lesson). A pill: the grade, the unit number (and section), the Tamil name, how many need it, a red line. No English
  // names, no U-codes, no W badges, nothing pulsing.
  await visible(T.locator(".sc.sc-thin"));
  await count(T.locator(".sc-cheer"), 0);
  await until(
    async () => JSON.stringify(await T.locator(".tp-kind").evaluateAll((els) => els.map((e) => e.firstChild?.textContent))) === '["Fighter","Master","Legend"]',
    "the Fighter, Master and Legend buttons, the most urgent first",
  );
  expect(await T.locator(".tp-kind").first().getAttribute("aria-label")).toMatch(/^Fighter: \d+, 2 very urgent/);
  expect(await T.locator(".tp-kind").first().getAttribute("aria-pressed")).toBe("true");
  await visible(T.locator(".tp-kind:disabled", { hasText: "Legend" }));
  await until(async () => (await T.locator(".tp-lp").first().getAttribute("data-lesson")) === "U13 D", "D first");
  expect(await T.locator(".tp-lp").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.lesson))).toEqual(
    expect.arrayContaining(["U13 B", "U13 C", "U13 D", "U13 E"]),
  );
  const dPill = T.locator('.tp-lp[data-lesson="U13 D"]');
  expect(await dPill.getAttribute("aria-pressed")).toBe("true"); // the first one is open
  await contains(dPill.locator(".tp-ln-g"), "11");
  await contains(dPill.locator(".tp-ln-n"), "13·D");
  expect(await dPill.locator(".tp-ln-t").textContent()).toMatch(/^[^A-Za-z]+$/); // Tamil only
  await contains(dPill.locator(".tp-lp-c"), "4");
  expect(await dPill.getAttribute("class")).toContain("lt-red");
  const pillTops = await T.locator(".tp-lp").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(pillTops).size).toBe(1); // one line
  const stickText = await T.locator(".tp-stick").innerText();
  expect(stickText).not.toMatch(/Completing|Equations|workbook|U13|G11/);
  await count(T.locator(".tf-badge-l, .tp-best, .tp-pill"), 0);
  expect(
    await T.evaluate(() => [...document.querySelectorAll(".tp-page *")].filter((e) => getComputedStyle(e).animationIterationCount === "infinite").length),
  ).toBe(0);
  // Under them, the open lesson: D's students, each with what he needs and is doing.
  const d = await lessonCard(T, "U13 D");
  await contains(d.locator(".tp-lh-t"), "teach Q23–26");
  await namesAre(d.locator(".tp-row-m b"), ["Fathima", "Ahamed", "Dilan", "Nila"]);
  await count(d.locator(".tp-row.on"), 4);
  await contains(chip(d, "Fathima").locator("small"), "no work");
  await contains(chip(d, "Ahamed").locator("small"), "left · out ~"); // what he still has, so she can judge
  // At the bottom, always in the same two places: Room (nobody yet) and Call.
  await contains(callBtn, "Call 4");
  await visible(T.locator(".tp-pad .tp-side:disabled"));
  const padY = async () => Math.round((await T.locator(".tp-pad").boundingBox())!.y);
  const y0 = await padY();
  expect(y0 + 56).toBeLessThanOrEqual(844 - 66); // above the tabs, on screen
  expect(await T.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(T, "t01-theory-page");

  // Nila still has work: leave her out. Call 3: Correction hears it; her room shows 3; nothing moved.
  await chip(d, "Nila").click();
  await contains(callBtn, "Call 3");
  await callBtn.click();
  await contains(T.locator(".toast"), "Called 3. Correction sends them over.");
  await contains(T.locator(".tp-pad .tp-side b"), "3");
  expect(Math.abs((await padY()) - y0)).toBeLessThanOrEqual(2);
  await until(
    async () => (await said(C)).some((s) => ["Fathima", "Ahamed", "Dilan"].every((n) => s.includes(n)) && s.endsWith("go to Owner in Theory.")),
    "Correction hears the three names",
  );
  // Correction is slow: after 3 minutes her room shows it in red.
  await backend.t.run(async (ctx) => {
    for (const c of await ctx.db.query("calls").collect()) if (c.status === "requested") await ctx.db.patch(c._id, { createdAt: c.createdAt - 4 * 60_000 });
  });
  await backend.push();
  await toRoom(T);
  await count(T.locator(".tp-rp.rs-call.rs-late"), 3);
  expect(await roomPill(T, "Fathima").getAttribute("aria-label")).toContain("not sent 4m");
  await shot(T, "t02-theory-room-called-late");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();

  // Sent: they walk over (dashed pills); Correction's phone counts their 3 minutes down.
  await count(T.locator(".tp-rp.rs-walk"), 3);
  await contains(C.locator(".call-strip.cs-walk"), "3m left");
  // Fathima walks in: her file, one tap: Arrived. The next one on the way opens by itself.
  const f1 = await file(T, "Fathima");
  await contains(f1.locator(".tp-fh-t small"), "on the way");
  await f1.getByRole("button", { name: "Arrived" }).click();
  await contains(T.locator(".toast"), "Fathima is here.");
  await visible(T.locator(".tp-file .tp-fname", { hasText: "Ahamed" }));
  await T.locator(".tp-file").getByRole("button", { name: "Arrived" }).click();
  await until(async () => ((await roomPill(T, "Ahamed").getAttribute("class")) ?? "").includes("rs-in"), "Ahamed is with her");
  // Dilan never gets there: after 3 minutes Correction's phone says so and shows him in red; Theory's pill is red too.
  await backend.t.run(async (ctx) => {
    const dilan = (await ctx.db.query("students").collect()).find((x) => x.name === "Dilan")!;
    for (const c of await ctx.db.query("calls").collect())
      if (c.studentId === dilan._id && c.status === "sent") await ctx.db.patch(c._id, { sentAt: c.sentAt! - 4 * 60_000 });
  });
  await backend.push();
  await hears(C, "Dilan hasn't reached Owner in Theory.");
  const lost = C.locator(".call-strip.cs-lost");
  await contains(lost, "Dilan isn't with Owner");
  await count(T.locator(".tp-rp.rs-walk.rs-late"), 1);
  await contains(T.locator(".tp-rhead"), "1 on the way");
  await shot(C, "t03-correction-lost");
  // Correction finds him at his desk: "In the hall". He is back to work; Theory can call him again.
  await lost.getByRole("button", { name: "In the hall" }).click();
  await contains(C.locator(".toast"), "Dilan is back in the hall.");
  await count(C.locator(".call-strip"), 0);
  expect((await marksOf(backend, "Dilan")).room).toBeUndefined();
  await count(T.locator(".tp-rp"), 2);
  expect(Math.abs((await padY()) - y0)).toBeLessThanOrEqual(2); // Room's buttons never moved

  // The lesson: what was taught (the bell rang before Q26), and who got it (Ahamed didn't: he stays).
  const fa = await file(T, "Fathima");
  await textsAre(fa.locator(".tf-teach .tf-q.on"), ["Q23", "Q24", "Q25", "Q26"]);
  await fa.getByRole("button", { name: "Q26 taught" }).click();
  await contains(doneBtn, "Done: back to work");
  await shot(T, "t04-theory-his-file");
  const ah = await file(T, "Ahamed");
  await ah.getByRole("button", { name: "Ahamed: got it" }).click();
  await contains(doneBtn, "Done: 1 back to work");
  await doneBtn.click();
  await contains(T.locator(".toast"), "Saved: Fathima back to work. Ahamed stays with you.");
  await until(async () => (await marks("Fathima"))["25"]?.s === "taught", "Fathima taught Q23-25");
  const fm = await marks("Fathima");
  expect([fm["23"]?.s, fm["24"]?.s, fm["25"]?.s, fm["26"]?.s ?? null]).toEqual(["taught", "taught", "taught", null]);
  expect((await marks("Ahamed"))["23"]).toBeUndefined();
  // Ahamed stays; the ticks start again from "all". He has to go: back to the hall without it (D stays his).
  await count(T.locator(".tp-rp"), 1);
  const ah2 = await file(T, "Ahamed");
  await count(ah2.locator(".tf-teach .tf-q.on"), 4);
  await ah2.getByRole("button", { name: "Send Ahamed back without it" }).click();
  await contains(T.locator(".toast"), "Ahamed: back to the hall, not taught.");
  expect((await marksOf(backend, "Ahamed")).room).toBeUndefined();
  // Her room is empty: back to the lessons by itself.
  await visible(T.locator(".tp-kinds"));

  // Fathima needs only Q26 now; Ahamed and Dilan all of D. Dilan goes first; while D is going on, its pill is blue and
  // Nila joins it.
  const d2 = await lessonCard(T, "U13 D");
  await namesAre(d2.locator(".tp-row-m b"), ["Fathima", "Ahamed", "Dilan", "Nila"]);
  await contains(chip(d2, "Fathima").locator(".tp-row-q"), "Q26");
  await count(chip(d2, "Dilan").locator(".tp-row-q"), 0);
  await callOnly(d2, ["Dilan"]);
  await hears(C, "Dilan, go to Owner in Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();
  const d3 = await lessonCard(T, "U13 D");
  await visible(T.locator('.tp-lp.lt-going[data-lesson="U13 D"]'));
  await contains(d3.locator(".tp-lh-t"), "in your room: 1 · room for 5");
  await callOnly(d3, ["Nila"]);
  await hears(C, "Nila, go to Owner in Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();
  await arrive(T, ["Dilan", "Nila"]);
  await doneBtn.click();
  await until(async () => (await marks("Nila"))["26"]?.s === "taught", "Nila taught Q23-26");
  await until(async () => (await marks("Dilan"))["26"]?.s === "taught", "Dilan taught Q23-26");

  // A workbook lesson: Evaluation sent Malik's Q13 and Q17 to Theory. His file shows them with what he got and who
  // sent them, and his unit. He gets Q13 today; Q17 waits.
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
  const w = await lessonCard(T, "U08 workbook");
  await contains(T.locator('.tp-lp[data-lesson="U08 workbook"] .tp-ln-g'), "7");
  await contains(T.locator('.tp-lp[data-lesson="U08 workbook"] .tp-ln-n'), "8");
  await contains(chip(w, "Malik").locator(".tp-row-q"), "Q13 Q17");
  await shot(T, "t05-theory-workbook-lesson");
  await callOnly(w, ["Malik"]);
  await hears(C, "Malik, go to Owner in Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();
  const mf = await file(T, "Malik");
  await mf.getByRole("button", { name: "Arrived" }).click();
  await visible(mf.getByRole("button", { name: "Malik: got it" }));
  await textsAre(mf.locator(".tp-fq .tf-q.on"), ["Q13", "Q17"]);
  await contains(mf.locator(".tp-fq-w").first(), "Evaluation");
  await visible(mf.locator(".tp-fx .mtrack"));
  await mf.getByRole("button", { name: "Malik Q17 taught" }).click();
  await shot(T, "t05b-theory-file-workbook");
  await doneBtn.click();
  await until(async () => (await marksOf(backend, "Malik")).m!.q["13"]?.tt !== undefined, "Malik Q13 taught");
  const mm = (await marksOf(backend, "Malik")).m!;
  expect(mm.q["17"]).toMatchObject({ th: expect.any(Number) });
  expect(mm.q["17"].tt).toBeUndefined();
  await contains(chip(await lessonCard(T, "U08 workbook"), "Malik").locator(".tp-row-q"), "Q17");

  // Evaluation calls Kumar: Theory lists him on E but doesn't tick him. Theory takes him anyway: Evaluation is told
  // her call went (theory comes first). Then Theory changes its mind: cancel the call in his file.
  const E = await phone(backend, "evaluation");
  await evCallOnly(E, ["Kumar"]);
  const e = await lessonCard(T, "U13 E");
  await contains(chip(e, "Kumar").locator("small"), "Eval called");
  expect(await chip(e, "Kumar").getAttribute("aria-pressed")).toBe("false");
  await callOnly(e, ["Kumar"]);
  await contains(T.locator(".toast"), "Called 1. Correction sends him over. Evaluation had called him: she is told.");
  await contains(E.locator(".bump-note"), "Theory took Kumar first.");
  await shot(E, "t06-evaluation-told");
  const kf = await file(T, "Kumar");
  await kf.getByRole("button", { name: "Cancel the call for Kumar" }).click();
  await count(T.locator(".tp-rp"), 0);
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

  // The smallest phone: the pills in one line, Room and Call fit at the bottom, no sideways scrolling.
  const S = await phone(backend, "theory", { ...PHONE, viewport: { width: 320, height: 568 } });
  await visible(S.locator(".tp-lp").first());
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const fits = await S.evaluate(() =>
    [...document.querySelectorAll(".tp-pad > *, .tp-kind, .tp-row")].every((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= 320.5),
  );
  expect(fits, "every button and row fits at 320 px").toBe(true);
  const sTops = await S.locator(".tp-lp").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(sTops).size).toBe(1);
  const sPad = await S.locator(".tp-pad .tp-call").boundingBox();
  expect(sPad!.y + sPad!.height).toBeLessThanOrEqual(568 - 66 + 1); // on screen, above the tabs
  expect(await topFits(S), "the top bar fits at 320 px").toBe(true);
  await shot(S, "t08-theory-320");
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

test("Evaluation: the page's pick or hers, 3 at once, her room with Arrived, one question at a time with the answer key, today's score", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  const E = await phone(backend, "evaluation");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  // A FAKE answer key for the demo workbook (G7 U08).
  await backend.t.run(async (ctx) => {
    const u = (await ctx.db
      .query("units")
      .withIndex("by_key", (q) => q.eq("key", "G7-U08"))
      .first())!;
    const answers = Array.from({ length: 57 }, (_, i) => (i + 1 === 22 ? { q: 22, a: "−7 + 4 = **−3**" } : { q: i + 1, a: `A${i + 1}` }));
    await ctx.db.insert("keys", { unitId: u._id, answers, updatedAt: Date.now() });
  });
  await backend.push();

  // Who to call: no work / stuck first (red), then waited 10 minutes (orange); what each is doing meanwhile. The page
  // ticks the 3 most urgent (3 with her at most).
  const names = E.locator(".ev-c .ev-c-who b");
  await textsAre(names, ["Dilan", "Vimal", "Fathima", "Malik", "Kumar"]);
  await namesAre(E.locator(".ev-c.on .ev-c-who b"), ["Dilan", "Vimal", "Fathima"]);
  await contains(evCall(E), "Call 3");
  await visible(E.locator(".tp-pad .tp-side:disabled")); // nobody in her room yet
  await visible(E.locator(".sc.sc-thin")); // today's score in one thin line
  await contains(evRow(E, "Dilan").locator(".ev-c-why b"), "stuck: Q18");
  await contains(evRow(E, "Malik").locator(".ev-c-why b"), "waited 40m");
  await contains(evRow(E, "Kumar").locator(".ev-c-why small"), "4 left · out ~"); // still working: she can wait
  expect(await E.getByRole("button", { name: /^Fighter:/ }).getAttribute("aria-label")).toBe("Fighter: 3, 2 very urgent, 1 soon");
  expect(await E.getByRole("button", { name: /^Master:/ }).getAttribute("aria-label")).toBe("Master: 2, 1 very urgent, 1 soon");
  await visible(E.locator(".sc")); // today's score
  expect(await E.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(E, "e01-evaluation-page", true);

  // She looks at the workbooks only, and calls Vimal alone (the page had ticked Malik too).
  await E.getByRole("button", { name: /^Master:/ }).click();
  await textsAre(names, ["Vimal", "Malik"]);
  await namesAre(E.locator(".ev-c.on .ev-c-who b"), ["Vimal", "Malik"]);
  await evRow(E, "Malik").click();
  await contains(evCall(E), "Call 1");
  await evCall(E).click();
  await contains(E.locator(".toast"), "Called 1. Correction sends him over.");
  await hears(C, "Vimal, go to Owner in Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();

  // Her room: Vimal on his way (dashed); Correction counts his 3 minutes. He walks in: Arrived.
  await toRoom(E);
  await visible(roomPill(E, "Vimal").and(E.locator(".rs-walk")));
  await contains(C.locator(".call-strip.evaluation.cs-walk"), "Vimal");
  await arrive(E, ["Vimal"]);
  await count(C.locator(".call-strip"), 0);
  // His file: his questions one at a time, his marks and the key's answer. Q22 explained; Q51 needs theory.
  const vh = await file(E, "Vimal");
  await contains(vh.locator(".ev-left-n"), "2 to explain");
  await contains(vh.locator(".ev-q-n"), "Q22");
  await contains(vh.locator(".ev-q-lost"), "got 0/");
  await contains(vh.locator(".ev-key"), "−3");
  await shot(E, "e02-explaining");
  await vh.getByRole("button", { name: "Explained", exact: true }).click();
  await contains(vh.locator(".ev-q-n"), "Q51");
  await vh.getByRole("button", { name: "→ Theory" }).click();
  await contains(vh.locator(".ev-h-sum"), "1 explained · 1 to Theory");
  await textsAre(vh.locator(".ev-sq.d-x"), ["Q22"]);
  await contains(evDone(E), "Done: back to work");
  await evDone(E).click();
  await contains(E.locator(".toast"), "Saved: Vimal back to work (1 explained, Q51 to Theory).");
  const vm = (await marksOf(backend, "Vimal")).m!;
  expect(vm.q["22"]?.x).toBeDefined();
  expect(vm.q["51"]).toMatchObject({ th: expect.any(Number), tb: "evaluation" });
  expect(vm.q["51"].x).toBeUndefined();

  // Back to everyone (her room is empty: the list is back by itself): she calls three; the room is full, so a fourth
  // can't be ticked.
  await toLessons(E);
  await E.getByRole("button", { name: /^All:/ }).click();
  await evCallOnly(E, ["Dilan", "Fathima", "Kumar"]);
  await contains(E.locator(".ev-next-h small"), "Room full (3 with you)");
  await evRow(E, "Malik").click();
  await contains(E.locator(".toast"), "3 with you at most. Send someone back first.");
  await hears(C, "Dilan, Fathima and Kumar, go to Owner in Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent 3" }).click();
  await arrive(E, ["Dilan", "Fathima", "Kumar"]);
  await count(E.locator(".tp-rp"), 3);
  await count(E.locator(".tp-file"), 1); // one file at a time
  await contains(E.locator(".tp-rhead"), "3 with you");
  await shot(E, "e03-three-with-her");
  await file(E, "Fathima");
  await contains(evDone(E), "All explained");
  await evDone(E).click();
  await until(async () => (await marksOf(backend, "Fathima")).marks["22"]?.s === "explained", "Fathima Q22 explained");
  await count(E.locator(".tp-rp"), 2);
  // Today's score: 2 students explained to, 2 of the 4 called while they still had work.
  await contains(E.locator(".sc-c", { hasText: "seen" }), "2");
  await contains(E.locator(".sc-c", { hasText: "ahead" }), "2/4");

  // The smallest phone: everything fits, the top bar too.
  const S = await phone(backend, "evaluation", { ...PHONE, viewport: { width: 320, height: 568 } });
  await visible(S.locator(".tp-pad .ev-call"));
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const sPad = await S.locator(".tp-pad .ev-call").boundingBox();
  expect(sPad!.y + sPad!.height).toBeLessThanOrEqual(568 - 66 + 1); // on screen, above the tabs
  expect(await topFits(S), "the top bar fits at 320 px").toBe(true);
  await shot(S, "e04-evaluation-320");
  await toRoom(S);
  await S.locator(".tp-rp").first().click();
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(S, "e05-evaluation-file-320");
  await S.context().close();
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Several books at once: every book stays on Evaluation and Theory, one book per call, keep him for the next, given books mean work", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  const E = await phone(backend, "evaluation");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  // A second workbook for Grade 7 (U09: the U08 skeleton again, test only). Malik (lost marks in U08: Q4 Q13 Q17)
  // moves on to U09 while his U08 papers are not explained yet, and loses marks there too (Q2).
  const G7U08 = KNOWN_WORKBOOKS[0].data;
  const ids = await backend.t.run(async (ctx) => {
    const unit = async (key: string) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!;
    const u09 = await unit("G7-U09");
    await ctx.db.insert("books", { unitId: u09._id, stage: "master", data: G7U08, updatedAt: Date.now() });
    const malik = (await ctx.db.query("students").collect()).find((x) => x.name === "Malik")!;
    const vimal = (await ctx.db.query("students").collect()).find((x) => x.name === "Vimal")!;
    return { u08: (await unit("G7-U08"))._id, u09: u09._id, malik: malik._id, vimal: vimal._id };
  });
  await backend.t.mutation(api.students.move, { token: OWNER_TOKEN, id: ids.malik, grade: 7, term: 1, stage: "master", unitId: ids.u09 });
  const l1 = G7U08.levels[0];
  const items = Array.from({ length: l1.to - l1.from + 1 }, (_, i) => ({ q: l1.from + i, got: l1.from + i === 2 ? 0 : 2 }));
  await backend.t.mutation(api.workbook.correct, { token: OWNER_TOKEN, studentId: ids.malik, level: 1, items, by: "correction" });
  // Correction sends U08's Q17 to Theory (his U08 book, though he is on U09 now).
  await backend.t.mutation(api.workbook.toTheory, { token: OWNER_TOKEN, studentId: ids.malik, unitId: ids.u08, qs: [17], on: true, by: "correction" });
  await backend.push();

  // Evaluation lists him once per book: U08 (Q4 Q13) and U09 (Q2). One book per call: ticking his other book swaps.
  const malikRows = E.locator(".ev-c", { has: E.locator(".ev-c-who b", { hasText: "Malik" }) });
  await count(malikRows, 2);
  const u08Row = malikRows.filter({ has: E.locator(".ev-c-who small", { hasText: "· Q4 Q13" }) });
  const u09Row = malikRows.filter({ has: E.locator(".ev-c-who small", { hasText: "· Q2" }) });
  await contains(u08Row.locator(".ev-c-who small"), "8 · Q4 Q13"); // the grade chip, the unit number (no U-codes)
  await contains(u09Row.locator(".ev-c-who small"), "9 · Q2");
  await contains(u08Row.locator(".ev-c-who small .tp-ln-g"), "7");
  await shot(E, "b01-evaluation-two-books", true);
  await evClear(E);
  await u09Row.click();
  await u08Row.click();
  await count(malikRows.and(E.locator(".on")), 1);
  await visible(u08Row.and(E.locator(".on")));
  await contains(evCall(E), "Call 1");
  await evCall(E).click();
  await contains(E.locator(".toast"), "Called 1.");
  const callOf = () =>
    backend.t.run(async (ctx) => (await ctx.db.query("calls").collect()).filter((c) => c.studentId === ids.malik && c.room === "evaluation"));
  expect((await callOf()).map((c) => c.unitId)).toEqual([ids.u08]);
  await hears(C, "Malik, go to Owner in Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();

  // With her (Arrived): U08's questions only. Done, and he stays for U09 (no walk back): the room has space.
  await arrive(E, ["Malik"]);
  const mh = await file(E, "Malik");
  await contains(mh.locator(".tp-fl .tp-ln-n"), "8");
  await contains(mh.locator(".ev-left-n"), "2 to explain");
  await contains(mh.locator(".ev-q-n"), "Q4");
  await shot(E, "b02-evaluation-keep");
  await mh.getByRole("button", { name: "All explained, keep him for unit 9 (1)" }).click();
  await contains(E.locator(".toast"), "Saved: Malik stays for unit 9 (1 to explain).");
  await contains(mh.locator(".tp-fl .tp-ln-n"), "9");
  await contains(mh.locator(".ev-left-n"), "1 to explain");
  await contains(mh.locator(".ev-q-n"), "Q2");
  await contains(evDone(E), "All explained");
  await evDone(E).click();
  await count(E.locator(".tp-rp"), 0);
  const rows = () =>
    backend.t.run(async (ctx) => {
      const all = await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", ids.malik)).collect();
      return { u08: all.find((p) => p.unitId === ids.u08)!.m!, u09: all.find((p) => p.unitId === ids.u09)!.m! };
    });
  const r = await rows();
  expect([r.u08.q["4"]?.x, r.u08.q["13"]?.x, r.u09.q["2"]?.x].every((x) => typeof x === "number")).toBe(true);
  expect(r.u08.q["17"]).toMatchObject({ th: expect.any(Number) }); // still Theory's
  expect((await callOf()).map((c) => `${c.unitId === ids.u08 ? "U08" : "U09"} ${c.status}`)).toEqual(["U08 done", "U09 done"]);
  const kept = await backend.t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "keep"));
  expect(kept.map((e) => `${e.name} ${e.value}`)).toEqual(["Malik U09"]);
  expect((await marksOf(backend, "Malik")).seen?.evaluation).toBeGreaterThan(0);

  // Theory sees his U08 question though he is on U09: the U08 workbook lesson has him.
  const T = await phone(backend, "theory");
  await lessonCard(T, "U08 workbook");
  await visible(chip(T.locator(".tp-lesson"), "Malik"));
  await shot(T, "b03-theory-other-book");
  await T.context().close();

  // Vimal has no work until his Level 8 is corrected (red). Give him the U09 workbook (Books given): he has work.
  await visible(evRow(E, "Vimal").and(E.locator(".h-red")));
  await backend.t.mutation(api.students.setGiven, { token: OWNER_TOKEN, id: ids.vimal, unitId: ids.u09, stage: "master", given: true });
  await backend.push();
  await until(async () => !((await evRow(E, "Vimal").getAttribute("class")) ?? "").includes("h-red"), "Vimal not red any more");
  await contains(evRow(E, "Vimal").locator(".ev-c-why small"), "on U09");
  expect((await marksOf(backend, "Vimal")).idleSince).toBeUndefined(); // the idle clock stopped

  // Correction: his U08 Level 3 (handed in before he moved on) still counts; tapping his name opens U08 there,
  // without moving him (31 Oct 2026: each corrector's paper is her own, he stays on U09 for everyone).
  await tab(C, "Correction").click();
  await C.getByRole("button", { name: /^Grade 7\b/ }).click();
  await visible(C.locator(".fc-nm.amber", { hasText: "Malik" }));
  await C.locator(".fc-nm", { hasText: "Malik" }).click();
  await says(C.locator(".fc-lvline"), "Level 3");
  await textsAre(C.locator(".fc-bk.on i"), ["8"]);
  expect((await marksOf(backend, "Malik")).unitKey).toBe("G7-U09");
  // A second corrector, Kavi: Malik's only book to correct is open on the owner's phone (her first letter, dim).
  // Kavi asks for it; the owner gives it: the owner's paper closes, Kavi's opens on U08 Level 3.
  const KAVI = "kavi-phone-token-0123456789abcdefghijklmnopqrstuvw";
  await addPerson(backend.t, { name: "Kavi", token: KAVI, tabs: ["correction"] });
  const K = await phone(backend, "focus", PHONE, KAVI);
  await K.getByRole("button", { name: /^Grade 7\b/ }).click();
  await visible(K.locator(".fc-nm.fc-held", { hasText: "Malik" }));
  await says(K.locator(".fc-nm", { hasText: "Malik" }).locator(".fc-nm-who"), "O");
  await K.locator(".fc-nm", { hasText: "Malik" }).click();
  await contains(K.locator(".sheet-title"), "Owner has Malik's Unit 8");
  await shot(K, "c01-correction-ask");
  await K.getByRole("button", { name: "Ask Owner" }).click();
  await contains(K.locator(".sheet-body"), "Asked Owner");
  await contains(C.locator(".sheet-title"), "Kavi asks for Malik's Unit 8");
  await shot(C, "c02-correction-give");
  await C.getByRole("button", { name: "Give it to Kavi" }).click();
  await contains(C.locator(".toast"), "Malik's Unit 8 is Kavi's now");
  await count(C.locator(".fc-paper"), 0);
  await says(K.locator(".fc-lvline"), "Level 3");
  await contains(K.locator(".toast"), "Owner gave you Malik's Unit 8");
  await visible(C.locator(".fc-nm.fc-held", { hasText: "Malik" }));
  await shot(K, "c03-correction-given");
  await K.context().close();
  await E.context().close();
  expect(problems, problems.join("\n")).toEqual([]);
});
