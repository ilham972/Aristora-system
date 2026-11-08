/// <reference types="vite/client" />
// One class on the register, acted out on three phones: Correction, Theory, Evaluation.

import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, expect, test } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import { normalizeCode, secretHash } from "../../convex/lib/auth";
import { KNOWN_WORKBOOKS, outOf } from "../../convex/lib/book";
import { digestOf, type DCall, type DEvent } from "../../convex/lib/boss";
import { readWorkbookFiles, readWorkbookHtml, type ReadTute } from "../../src/workbookFile";
import U01_BOOK from "../fixtures/workbook-g8-u01.html?raw";
import TUTE_BOOK from "../fixtures/tute-skeleton.html?raw";
import TUTE_JSON from "../fixtures/tute-skeleton.json?raw";
import { makeCases } from "../cases";
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
/**
 * The bottom bar's tabs: Class (everyone's since 3 Nov 2026: the hall and the rooms, the Manager page before),
 * Correction, Theory, Evaluation. The Register (everyone's rows; it was called Class) is the list icon at the top.
 */
const tab = (p: Page, name: "Register" | "Class" | "Correction" | "Theory" | "Evaluation") =>
  name === "Register" ? p.locator(".top .class-btn") : p.locator(`.tabs .tab.${name.toLowerCase()}`);
/** The names on these pills (or rows), as data-name says. */
const namesOf = (l: L) => l.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.name ?? ""));
/**
 * The Evaluation and Theory pages (one screen each, 31 Oct 2026; the same pieces): rows of grades, stages (.tp-kind),
 * units and question groups or lessons (.evx-qg: "22 · 51", "D", "13 · 17"), each the most urgent first; her room box
 * (pills: .evx-sp, offers .s-sug) with Call, Arrived and Done beside it; the questions as Correction's squares, one
 * question, and the pad (Evaluation: → Theory, Not now, Explained; Theory: Not reached, Taught).
 */
const evCall = (p: Page) => p.locator(".evx-call");
const evArrived = (p: Page) => p.locator(".evx-arrive");
const evDone = (p: Page) => p.locator(".evx-done");
/** Someone in her room box (with her, on the way, called) or offered there (by name). */
const evPill = (p: Page, name: string) => p.locator(`.evx-sp[data-name="${name}"]`);
const evOffer = (p: Page, name: string) => p.locator(`.evx-sp.s-sug[data-name="${name}"]`);
/** Pick in the rows: a grade, a stage, a unit (its number), a question group (its numbers as shown: "22 · 51"). */
async function evPick(p: Page, o: { grade?: string; stage?: string; unit?: string; group?: string }) {
  const tapOn = async (l: L, what: string) => {
    await visible(l);
    if ((await l.getAttribute("aria-pressed")) !== "true") await l.click();
    await until(async () => (await l.getAttribute("aria-pressed")) === "true", what);
  };
  if (o.grade) await tapOn(p.locator(".evx-g").filter({ has: p.locator("b", { hasText: new RegExp(`^${o.grade}$`) }) }), `Grade ${o.grade}`);
  if (o.stage) await tapOn(p.locator(".tp-kind", { hasText: o.stage }), o.stage);
  if (o.unit) await tapOn(p.locator(".evx-u").filter({ has: p.locator(".tp-ln-n", { hasText: new RegExp(`^${o.unit}$`) }) }), `unit ${o.unit}`);
  if (o.group) await tapOn(p.locator(".evx-qg").filter({ has: p.locator("b").getByText(o.group, { exact: true }) }).first(), `questions ${o.group}`);
}
/** Find a student to call: grade by grade, stage, unit and question group, until his pill is offered in the box. */
async function evFind(p: Page, name: string) {
  // (The page may still be loading: look again until he shows up.)
  await until(async () => {
    if ((await evOffer(p, name).count()) > 0) return true;
    const grades = p.locator(".evx-g:not(:disabled)");
    for (let g = 0; g < (await grades.count()); g++) {
      await grades.nth(g).click();
      const stages = p.locator(".tp-kind:not(:disabled)");
      for (let k = 0; k < (await stages.count()); k++) {
        await stages.nth(k).click();
        const units = p.locator(".evx-u");
        for (let u = 0; u < (await units.count()); u++) {
          await units.nth(u).click();
          const groups = p.locator(".evx-qg");
          for (let i = 0; i < (await groups.count()); i++) {
            if (!((await groups.nth(i).getAttribute("aria-label")) ?? "").includes(name)) continue;
            await groups.nth(i).click();
            return true;
          }
        }
      }
    }
    return false;
  }, `${name} offered on the Evaluation page`);
  await visible(evOffer(p, name));
}
/** Tick exactly these students in her room box (found first; every other tick cleared), then Call. */
async function evCallOnly(p: Page, names: string[]) {
  await evFind(p, names[0]);
  const on = p.locator(".evx-sp.s-sug.on");
  for (let i = 0; i < 12 && (await on.count()) > 0; i++) {
    const before = await on.count();
    await on.first().click();
    await until(async () => (await on.count()) < before, "one tick less");
  }
  for (const n of names) await evOffer(p, n).click();
  await contains(evCall(p), `Call ${names.length}`);
  await evCall(p).click();
}
/** They walk in: Arrived beside her room (everyone on the way). */
async function evArrive(p: Page, names: string[]) {
  for (const n of names) await until(async () => /\bs-(walk|call)\b/.test((await evPill(p, n).getAttribute("class")) ?? ""), `${n} on the way`);
  await evArrived(p).click();
  // 12 s: with every run-through's phones on one machine, an Arrived can take longer than the usual 6 s to come back.
  for (const n of names) await until(async () => /\bs-(in|done|th)\b/.test((await evPill(p, n).getAttribute("class")) ?? ""), `${n} is with her`, 12_000);
}
/** His file (his pill in her room tapped): a sheet. */
async function evFile(p: Page, name: string): Promise<L> {
  await evPill(p, name).click();
  const f = p.locator(".sheet-wrap.evx-file .sheet", { has: p.locator(".sheet-title", { hasText: name }) });
  await visible(f);
  return f;
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

  // --- Theory (one screen): Grade 11, Fighter, unit 13, section D, the most urgent and already picked; everyone who
  // needs it ticked in her room box; one tap calls them.
  await evPick(T, { grade: "11", stage: "Fighter", unit: "13", group: "D" });
  await namesAre(T.locator(".evx-sp.s-sug.on"), ["Ahamed", "Dilan", "Fathima", "Nila"]);
  await shot(T, "r05-theory-next");
  await contains(evCall(T), "Call 4");
  await evCall(T).click();

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
  // Theory's room: the three on the way; she taps Arrived as they walk in. Correction's strip goes.
  await until(
    async () => JSON.stringify((await namesOf(T.locator(".evx-sp.s-walk"))).sort()) === '["Ahamed","Fathima","Nila"]',
    "the three on the way in her room",
  );
  await evArrive(T, ["Ahamed", "Fathima", "Nila"]);
  await count(C.locator(".call-strip"), 0);

  // Theory teaches on the Class tab's rows (Theory's "All" lives there now): Fathima the whole section (one tap on D),
  // Ahamed only 23 and 24, Nila nothing yet. Then the Theory page sends everyone back, keeping only those taps.
  await tab(T, "Register").click();
  await row(T, "Fathima").getByRole("button", { name: "Section D: mark all theory taught" }).click();
  await circle(row(T, "Ahamed"), 23).click();
  await circle(row(T, "Ahamed"), 24).click();
  await shot(T, "r07-theory-teaching-on-class");
  await tab(T, "Theory").click();
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
  // He walks over: Evaluation taps Arrived (beside her room box).
  await evArrive(E, ["Kumar"]);
  await evPick(T, { grade: "11", stage: "Fighter", unit: "13", group: "E" });
  await contains(evOffer(T, "Kumar"), "Eval"); // listed, not ticked: calling takes him from Evaluation
  expect(await evOffer(T, "Kumar").getAttribute("aria-label")).toContain("in Eval");
  expect(await evOffer(T, "Kumar").getAttribute("aria-pressed")).toBe("false");
  await evCallOnly(T, ["Kumar"]);
  await contains(E.locator(".pull-banner"), "Theory wants Kumar now");
  await hears(E, "Theory wants Kumar now.");
  // His questions one at a time (Correction's squares): she explained Q28, then the page shows Q29.
  await contains(E.locator(".evx-card .fc-qn"), "28");
  await E.locator(".evx-x").click();
  await contains(E.locator(".evx-card .fc-qn"), "29");
  await shot(E, "r08-evaluation-pull");
  await E.locator(".pull-banner").getByRole("button", { name: "Send to Theory" }).click();
  await until(async () => (await marksOf(backend, "Kumar")).room === "theory", "Kumar in Theory");
  const k = await marksOf(backend, "Kumar");
  expect(k.marks["28"]?.s).toBe("explained");
  expect(k.marks["29"]?.s).toBe("wrong");

  // Same question: U13 Q22 wrong for Ahamed and Fathima -> one pill "22", both in her room box (explain once).
  await evPick(E, { grade: "11", stage: "Fighter", unit: "13", group: "22" });
  expect(await namesOf(E.locator(".evx-sp.s-sug"))).toEqual(["Ahamed", "Fathima"]);
  await shot(E, "r09-evaluation-same-mistake");

  // Theory: he walks over from Evaluation (Arrived), then all taught for Kumar (section E) in one tap (his file).
  await evArrive(T, ["Kumar"]);
  await (await evFile(T, "Kumar")).getByRole("button", { name: "All taught" }).click();
  await until(async () => (await marksOf(backend, "Kumar")).marks["34"]?.s === "taught", "Kumar E taught");

  // Theory busy with Tharun -> Evaluation teaches Rizwan section C itself.
  // Both rooms call at once: Correction gets two slim strips and hears both.
  await evPick(T, { grade: "11", stage: "Fighter", unit: "13", group: "B" });
  await evCallOnly(T, ["Tharun"]);
  const teach = E.locator(".evx-qg.evx-teach"); // Evaluation's page knows Theory is busy: Teach, at the end of the row
  await visible(teach);
  await teach.click();
  const on = E.locator(".evx-sp.s-sug.on");
  for (let i = 0; i < 12 && (await on.count()) > 0; i++) {
    const before = await on.count();
    await on.first().click();
    await until(async () => (await on.count()) < before, "one tick less");
  }
  await evOffer(E, "Rizwan").click();
  await contains(evCall(E), "Teach 1");
  await evCall(E).click();
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
  await evArrive(E, ["Rizwan"]);
  const rf = await evFile(E, "Rizwan");
  await contains(rf.locator(".ev-teaching"), "section C");
  await shot(E, "r09d-evaluation-teaching-theory");
  await rf.getByRole("button", { name: "Done: taught" }).click();
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
  await tab(T, "Register").click();
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
    else if (role === "evaluation") await count(small.locator(".evx-grades .evx-g"), 7); // grades 6-11 and OL, one row
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
  await tab(T, "Register").click();
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
  await tab(C, "Register").click(); // back to the class
  await contains(tab(C, "Correction").locator(".tab-badge"), "2"); // two papers wait: Priya's L2 and Vimal's L8
  await textsAre(row(C, "Priya").locator(".mk b"), ["L2", "3"]);
  expect((await marksOf(backend, "Priya")).m!.lv["2"]?.done).toBeGreaterThan(0);

  // Evaluation, on the Class page (her taps on its rows): Malik's lost marks are red circles; tap Q24 when it's explained.
  await tab(E, "Register").click();
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
  await evArrive(E, ["Vimal"]);
  await (await evFile(E, "Vimal")).getByRole("button", { name: "All explained" }).click();
  await until(async () => {
    const v = (await marksOf(backend, "Vimal")).m!;
    return v.q["22"]?.x !== undefined && v.q["51"]?.x !== undefined;
  }, "Vimal Q22 and Q51 explained");

  // Correction marks Vimal's Level 8 (his marks table): he couldn't even start Q57 ("?"): a lost mark like the others
  // since 8 Nov 2026; he forgot the theory, so the corrector sends the level's lost marks to Theory.
  await row(C, "Vimal").locator(".reg-strip").click();
  await row(C, "Vimal").getByRole("button", { name: /^Level 8, questions 56 to 57/ }).click();
  const vs = C.locator(".sheet");
  await contains(vs.locator("h2"), "Vimal · Level 8");
  await vs.getByRole("button", { name: "All full marks" }).click();
  await vs.getByRole("button", { name: "Q57: couldn't start it (blank)" }).click();
  await contains(vs.locator(".ct-dk"), "Q57: couldn't start, so it goes with the lost marks.");
  await vs.locator(".ct-route .segc-b.theory").click();
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
  // The Theory page: Grade 7, Master, unit 8: the questions sent to Theory as pills, the same students' questions in
  // one: Vimal's Q57 (no work: red) first, then Malik's Q13 and Q17 (one pill: only he needs them). Theory takes Malik.
  await tab(T, "Theory").click();
  await evPick(T, { grade: "7", stage: "Master", unit: "8" });
  await textsAre(T.locator(".evx-qg b"), ["57", "13 · 17"]);
  expect(await evOffer(T, "Vimal").getAttribute("aria-label")).toContain("no work");
  await evPick(T, { group: "13 · 17" });
  expect(await namesOf(T.locator(".evx-sp.s-sug"))).toEqual(["Malik"]);
  await evCallOnly(T, ["Malik"]);
  await hears(C, "Malik, go to Owner in Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await until(async () => (await marksOf(backend, "Malik")).room === "theory", "Malik on his way to Theory");
  // He walks in: Arrived. His questions as squares, each with what he got and who sent it; his file says the same.
  await evArrive(T, ["Malik"]);
  await textsAre(T.locator(".evx-strip .fc-sq small"), ["13", "17"]);
  await contains(T.locator(".evx-who"), "Malik 0/2 · Evaluation");
  const mf = await evFile(T, "Malik");
  await contains(mf.locator(".tpx-fq"), "Evaluation");
  await mf.getByRole("button", { name: "Close" }).click();
  // Q13 taught; the bell rang before Q17: Not reached (it stays with Theory). Done.
  await T.locator(".evx-x").click();
  await contains(T.locator(".evx-card .fc-qn"), "17");
  await T.locator(".evx-b.skip").click();
  await shot(T, "m05-theory-reteach");
  await contains(evDone(T), "Done 1");
  await evDone(T).click();
  await until(async () => (await marksOf(backend, "Malik")).room === undefined, "Malik back in the hall");
  let mt = (await marksOf(backend, "Malik")).m!;
  expect(mt.q["13"]?.tt).toBeDefined();
  expect([mt.q["17"]?.th !== undefined, mt.q["17"]?.tt]).toEqual([true, undefined]);
  await count(T.locator(".evx-sp:not(.s-sug)"), 0); // her room is empty: Theory's phone sees him gone
  await tab(T, "Register").click();
  await textsAre(tm.locator(".reg-act .q"), ["13", "17"]); // Q13 just taught (tap to undo), Q17 still to teach
  await tab(T, "Theory").click();
  await evPick(T, { grade: "7", stage: "Master", unit: "8", group: "17" });
  await evCallOnly(T, ["Malik"]);
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await evArrive(T, ["Malik"]);
  await T.locator(".evx-x").click();
  await contains(evDone(T), "Done 1");
  await evDone(T).click();
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
  await visible(small.locator(".sheet").getByRole("button", { name: "Q57: couldn't start it (blank)", pressed: true }));
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
  // (Just after midnight the demo's visits are yesterday's: no "Came today" then.)
  if (!nearMidnight()) await until(async () => JSON.stringify(await chips()) === JSON.stringify(["Master 3", "Came today 3"]), "stage and today chips");
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
    // Her job is Correction: the bottom bar has the Class tab (everyone's) and Correction (Theory and Evaluation are the
    // teachers' pages); the Register at the top; she starts on Correction, though the phone last showed Theory.
    await visible(tab(R, "Correction")); // marks papers, + takes attendance
    await visible(R.getByRole("button", { name: /^Register/ })); // and sees everyone's rows
    await visible(R.getByRole("button", { name: /in class.*\. Attendance$/ })); // the count by the clock: Attendance too
    await textsAre(R.locator(".tabs .tab > span:nth-child(2)"), ["Class", "Correction", "Us"]);
    expect(await tab(R, "Correction").getAttribute("aria-current")).toBe("page");
    await R.getByRole("button", { name: "Settings" }).click();
    // No People: owner only. Race (7 Nov 2026): Reports sees last week's champions and their poster (no prizes).
    // Community (7 Nov 2026) is the owner's switches; the teachers' side is the Us tab at the bottom.
    await textsAre(R.locator(".seg button"), ["Race", "Alerts", "Reports", "History", "Account"]);
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
    await textsAre(R.locator(".tabs .tab > span:nth-child(2)"), ["Class", "Correction", "Us"]);

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
  // Correction is a bottom tab (it was at the top, and was "Focus"), first of the jobs after the Class tab (everyone's
  // since 3 Nov 2026); the Register is at the top. The phone opens on Correction.
  await textsAre(F.locator(".tabs .tab > span:nth-child(2)"), ["Class", "Correction", "Theory", "Evaluation", "Us"]);
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
  // No big name on the paper (3 Nov 2026, his call): hers is dark in the names row; the top row starts with the book
  // button (the Manager button left for the bottom bar's Class tab the same day).
  await count(F.locator(".fc-name"), 0);
  await visible(F.locator(".fc-nm.on", { hasText: "Priya" }));
  await visible(F.locator(".fc-head .fc-head-tools > .fc-units:first-child"));
  await count(F.locator(".fc-mgr"), 0);
  await textsAre(F.locator(".fc-bk.on i"), ["8"]); // her book now, dark, in the row of her books
  await visible(F.locator(".fc-nm.on", { hasText: "Priya" }));
  await textsAre(F.locator(".fc-lvbar .fc-lb"), ["1", "2", "3", "4", "5", "6", "7", "8"]);
  await visible(F.locator(".fc-lb.fixed.on, .fc-lb.current.on", { hasText: "2" }));
  await says(F.locator(".fc-lvline"), "Level 2 · Q11–20");
  await contains(F.locator(".fc-qn"), "11");
  await contains(F.locator(".fc-ans .ka-h"), "A11");
  await contains(F.locator(".fc-qmeta"), "2 marks");
  expect(await F.locator(".fc-card").getAttribute("aria-label")).toBe("Question 11, Part I, 2 marks");
  // The answer is the big thing (2 Nov 2026, his ask): one line, far bigger than the question's number; no pale
  // "No question text" line under it.
  const big = await F.locator(".fc-ans .ka").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
  expect(big).toBeGreaterThanOrEqual(56);
  await count(F.locator(".fc-card .bq-btn, .fc-card .fc-qdoc"), 0);
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
  await tap(F.getByRole("button", { name: "Q15: blank, couldn't start it" }));
  for (const q of [16, 17, 18, 19, 20]) {
    await contains(F.locator(".fc-qn"), String(q));
    await tap(F.locator(".fc-go"));
  }
  await says(F.locator(".fc-total"), "15 / 20");
  await contains(F.locator(".fc-sum .ct-dk"), "Q15: blank, it goes with the lost marks.");
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
  await contains(F.locator(".toast"), "Saved: Priya, Level 2, 16 / 20. Evaluation: Q13 Q15.");
  // Saved exactly as the Class page's correct sheet saves it; her next level opens by itself.
  const p2 = (await marksOf(backend, "Priya")).m!;
  expect(p2.lv["2"]).toMatchObject({ got: 16, by: "correction" });
  expect(p2.q["13"]).toMatchObject({ got: 0, max: 2, lost: true });
  expect(p2.q["14"]).toMatchObject({ got: 2, lost: false });
  expect(p2.q["15"]).toMatchObject({ got: 0, dk: true });
  expect(p2.q["15"].th).toBeUndefined(); // a blank waits with the wrong answers (8 Nov 2026)
  await says(F.locator(".fc-lvline"), "Level 3 · Q21–30");
  await contains(F.locator(".fc-qn"), "21");
  await visible(F.locator(".fc-lb.fixed", { hasText: "2" }));

  // The sheet button (a bar chart, 2 Nov 2026): what waits for her in this book, with how long; one tap opens it.
  await tap(F.getByRole("button", { name: /^This book's questions/ }));
  await namesAre(F.locator(".br-todo .br-ck b"), ["Malik", "Vimal"]);
  await contains(F.locator(".br-todo .br-ck-h"), "To correct · 2");
  await shot(F, "f06f-sheet-to-correct");
  await tap(F.locator(".br-todo .br-ck", { hasText: "Malik" }));
  await count(F.locator(".br-sheet"), 0);
  await says(F.locator(".fc-lvline"), "Level 3 · Q21–30");
  await visible(F.locator(".fc-nm.on", { hasText: "Malik" }));
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
  // explained it yet), and E on Q15 too (a blank waits with the wrong answers since 8 Nov 2026).
  await visible(F.locator(".fc-lb.fixed.w-eval", { hasText: "2" }));
  await tap(F.locator(".fc-lb", { hasText: "2" }).first());
  await says(F.locator(".fc-lvline"), "Level 2 · Q11–20 · Part I · corrected 16 / 20");
  await contains(F.locator(".fc-remark"), "Corrected before.");
  await visible(F.getByRole("button", { name: "No changes" }));
  await textsAre(F.locator(".fc-sq .fc-ts"), ["E", "E"]);
  await visible(F.locator(".fc-sq", { hasText: "13" }).locator(".fc-ts.eval"));
  await visible(F.locator(".fc-sq", { hasText: "15" }).locator(".fc-ts.eval"));
  expect(await F.locator(".fc-sq", { hasText: "15" }).getAttribute("aria-label")).toBe("Q15: ? blank, waiting for Evaluation");
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
  await visible(F.locator(".fc-lb.fixed.w-eval", { hasText: "2" })); // only Q15 waits now, for Evaluation

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
  await contains(F.locator(".fc-card .fc-anote"), "No answer key for this workbook yet");
  await tap(F.locator(".fc-go"));
  await contains(F.locator(".fc-qn"), "2");
  await evCallOnly(E, ["Malik"]);
  await hears(F, "Malik, go to Owner in Evaluation.");
  await F.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await count(F.locator(".call-strip"), 0); // sent: on the paper's page his 3-minute walk shows no strip (Class shows it)
  await contains(F.locator(".fc-qn"), "2"); // still on his paper, at the same question
  // Switching pages keeps the open paper.
  await tab(F, "Register").click();
  await visible(row(F, "Priya"));
  await textsAre(row(F, "Priya").locator(".mk b"), ["L4"]); // Class sees Focus's saves
  await tab(F, "Correction").click();
  await visible(F.locator(".fc-nm.on", { hasText: "Nimal" }));
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
  expect(await F.locator(".su-tl > span").allTextContents()).toEqual(["Term 1", "Term 2", "Term 3"]);
  await count(F.locator(".su-olb"), 0); // OL books are for Grade 10 and 11 students: no switch for Grade 8
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
  // The whole book in two rows (1 Nov 2026, his ask): the sections (A–F, P, ★) like the level bar, then the open
  // section's questions only (C: Q15–Q22, teacher questions blue), open at the first he can do.
  await textsAre(F.locator(".fc-secbar .fc-lb"), ["A", "B", "C", "D", "E", "F", "P", "★"]);
  await textsAre(F.locator(".fc-secbar .fc-lb.on"), ["C"]);
  await textsAre(F.locator(".fc-strip .fc-sq small"), ["15", "16", "17", "18", "19", "20", "21", "22"]);
  await count(F.locator(".fc-strip .fc-sq.fc-tq"), 3);
  await textsAre(F.locator(".fc-strip .fc-sq.on small"), ["19"]);
  expect(await F.locator(".fc-strip").evaluate((el) => el.scrollWidth <= el.clientWidth + 1), "one section fits without scrolling").toBe(true);
  await shot(F, "f13-focus-theory-book");
  await tap(F.getByRole("button", { name: "Q19: right" }));
  await contains(F.locator(".fc-qn"), "20");
  await tap(F.getByRole("button", { name: "Q20: wrong" }));
  await tap(F.getByRole("button", { name: "Q21: slip" }));
  await contains(F.locator(".fc-qn"), "22");
  const marksOn = (ns: string[]) =>
    F.evaluate(
      (ns) =>
        [...document.querySelectorAll(".fc-strip .fc-sq")]
          .filter((b) => ns.includes(b.querySelector("small")?.textContent ?? ""))
          .map((b) => b.querySelector("b")?.textContent ?? ""),
      ns,
    );
  await until(async () => JSON.stringify(await marksOn(["19", "20", "21", "22"])) === JSON.stringify(["✓", "✗", "↻", ""]), "Q19–Q22 marked");
  // His notebook ends at Q21: tap the next name. The marks reach the server like the Class rows' taps.
  await tap(name("Kumar"));
  const nila = async () => (await marksOf(backend, "Nila")).marks;
  await until(async () => {
    const m = await nila();
    return m["19"]?.s === "right" && m["20"]?.s === "wrong" && m["21"]?.s === "slip";
  }, "Nila's marks saved");
  expect((await nila())["20"]?.n).toBe(1);
  // Back to Nila (1 Nov 2026, his report: marks looked lost after switching students): every saved mark shows in the
  // strip and on the card; the slip waits for his redo (faint).
  await tap(name("Nila"));
  await until(async () => JSON.stringify(await marksOn(["19", "20", "21", "22"])) === JSON.stringify(["✓", "✗", "", ""]), "Nila's saved marks shown");
  await tap(F.locator(".fc-strip").getByRole("button", { name: "Q19: right" }));
  await contains(F.locator(".fc-now"), "Saved: ✓ right.");
  await shot(F, "f13b-focus-theory-saved");
  // This book's questions (2 Nov 2026, his ask): every student against every question on one screen, Nila ringed.
  await tap(F.getByRole("button", { name: /^This book's questions/ }));
  await visible(F.locator(".br-r.me", { hasText: "Nila" }));
  await count(F.locator(".br-r.me"), 1);
  await textsAre(F.locator(".br-head .br-qs i"), ["A", "B", "C", "D", "E", "F", "P", "\u2605"]);
  await count(F.locator(".br-r.me .br-qs i"), 61);
  // Her marks today on Q19–Q21 show as right / wrong / slip in Nila's row (Section C zoomed: Q15–Q22).
  await tap(F.locator(".br-zoom").getByRole("button", { name: "Section C" }));
  await textsAre(F.locator(".br-head .br-qs i"), ["15", "16", "17", "18", "19", "20", "21", "22"]);
  const nilaC = await F.locator(".br-r.me .br-qs i").evaluateAll((els) => els.map((e) => e.className));
  expect(nilaC.slice(4, 7)).toEqual(["q-right", "q-wrong", "q-slip"]);
  await tap(F.locator(".br-zoom").getByRole("button", { name: "All" }));
  expect(
    await F.locator(".br-sheet .sheet-body").evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    "the whole class in one shot",
  ).toBe(true);
  // Blur for the group: the last three; the first can't be blurred.
  await tap(F.locator(".br-blur").getByRole("button", { name: "Last 3" }));
  await count(F.locator(".br-nm.blur"), 3);
  await tap(F.locator(".br-rows .br-r").first().locator(".br-nm"));
  await count(F.locator(".br-nm.blur"), 3);
  await contains(F.locator(".br-sheet .sheet-foot .btn.primary"), "Share to the group · 3 blurred");
  await shot(F, "f13d-focus-book-sheet");
  // The image for the group (Save = the same file Share sends): white, nobody ringed, three names blurred.
  const [raceDl] = await Promise.all([F.waitForEvent("download"), F.locator(".br-sheet .sheet-foot").getByRole("button", { name: "Save" }).click()]);
  expect(raceDl.suggestedFilename()).toMatch(/^ARISTORA-TheoryBook-G11-U13-\d{4}-\d\d-\d\d\.png$/);
  await raceDl.saveAs(join(SHOTS, "f13e-sheet-image.png"));
  await F.keyboard.press("Escape");
  await count(F.locator(".br-sheet"), 0);
  await tap(name("Kumar"));
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
  // He went home: the home icon beside Marks (1 Nov 2026, his ask), one tap; his paper keeps "Sign him in" (the undo).
  await tap(name("Kumar"));
  await tap(F.getByRole("button", { name: /went home: sign him out$/ }));
  await contains(F.locator(".toast"), "went home");
  await visible(F.locator(".fc-out"));
  expect(await F.locator(".fc-gohome").isDisabled()).toBe(true);
  await shot(F, "f13c-focus-went-home");
  await tap(F.locator(".fc-out").getByRole("button", { name: "Sign him in" }));
  await until(async () => !(await F.locator(".fc-gohome").isDisabled()), "Kumar signed in again");
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
  await textsAre(S.locator(".fc-part .fc-pl"), ["i", "ii"]);
  // Each part: its answer big (the working small above it), its marks in one row under it.
  await textsAre(S.locator(".fc-part .ka-h"), ["B56", "C56"]);
  await textsAre(S.locator(".fc-part .ka-w"), ["work →"]);
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
  await contains(S.locator(".fc-sum .ct-dk"), "Q56 (ii): blank, it goes with the lost marks.");
  await shot(S, "f10-focus-summary-320");
  await stap(S.getByRole("button", { name: /^Save Vimal · 13 \/ 15/ }));
  await contains(S.locator(".toast"), "Saved: Vimal, Level 8, 13 / 15. Evaluation: Q56.");
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

test("Attendance: sign in all / sign out all for one grade (Correction's +), everyone for the whole class (the count), Undo", async () => {
  const backend = await newClass();
  const F = await phone(backend, "focus");
  await F.getByRole("button", { name: "Settings" }).click();
  await F.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(F.getByText(/^14 demo students loaded/));
  await F.getByRole("button", { name: "Back to the class" }).click();
  const att = F.locator(".sheet-wrap.fullpage");
  const ask = F.locator(".sheet-wrap:not(.fullpage)");
  const many = F.locator(".sheet-wrap.att-many");
  const present = async (names: string[]) => Promise.all(names.map(async (n) => (await marksOf(backend, n)).present));
  const G11 = ["Ahamed", "Dilan", "Fathima", "Keerthi", "Kumar", "Nila", "Rizwan", "Sana", "Tharun", "Yasmin"];

  // Grade 11 from +: 9 of 10 here. At the bottom: Sign in all (Keerthi) and Sign out all (9).
  await F.getByRole("button", { name: /^Grade 11\b/ }).click();
  await F.getByRole("button", { name: "Attendance: Grade 11" }).click();
  await contains(att.locator(".sheet-title h2"), "Attendance · Grade 11");
  await visible(att.getByRole("button", { name: "Sign in all: 1 not here" }));
  // Sign out all: a sheet asks, naming them. Nine go home; the class goes on (Grade 7 stays in).
  await att.getByRole("button", { name: "Sign out all: 9 here" }).click();
  await contains(ask.locator("h2"), "Sign out Grade 11?");
  await contains(ask.locator(".sheet-title p"), "9 students go home now.");
  await contains(ask.locator(".atm-names"), "Ahamed, Dilan, Fathima");
  await shot(F, "a01-attendance-sign-out-grade");
  await ask.getByRole("button", { name: "Sign out 9" }).click();
  await contains(F.locator(".toast"), "9 students signed out");
  await until(async () => (await present(G11)).every((p) => !p), "Grade 11 went home");
  expect((await present(["Malik", "Priya", "Vimal", "Zainab"])).every(Boolean)).toBe(true);
  await contains(att.locator(".attendance .summary"), "Grade 11: 0 of 10 here");
  expect(await backend.t.run(async (ctx) => (await ctx.db.query("sessions").collect()).filter((s) => s.open).length)).toBe(1);

  // Sign in all: a list with everyone ticked but those who went home today (Keerthi only). She ticks two more: 3.
  await att.getByRole("button", { name: "Sign in all: 10 not here" }).click();
  await contains(many.locator("h2"), "Sign in Grade 11");
  await contains(many.locator(".sheet-title p"), "Untick anyone who isn't in the hall.");
  await textsAre(many.locator(".atm.on .ap-n"), ["Keerthi"]);
  await count(many.locator(".atm-h"), 0); // one grade: no grade headings
  await many.getByRole("button", { name: /^Ahamed:/ }).click();
  await many.getByRole("button", { name: /^Dilan:/ }).click();
  await textsAre(many.locator(".atm.on .ap-n"), ["Ahamed", "Dilan", "Keerthi"]);
  await shot(F, "a02-attendance-sign-in-list");
  await many.getByRole("button", { name: "Sign in 3" }).click();
  await count(many, 0);
  await contains(F.locator(".toast"), "3 students signed in, ");
  await until(async () => (await present(["Ahamed", "Dilan", "Keerthi"])).every(Boolean), "three signed in");
  // A wrong list: Undo takes all three back, as if they never came.
  await F.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await contains(F.locator(".toast"), "Sign-in taken back for 3 students.");
  await until(async () => (await present(["Ahamed", "Dilan", "Keerthi"])).every((p) => !p), "taken back");
  const keerthiVisits = await backend.t.run(async (ctx) => {
    const k = (await ctx.db.query("students").collect()).find((s) => s.name === "Keerthi")!;
    return (await ctx.db.query("attendance").withIndex("by_student", (q) => q.eq("studentId", k._id)).collect()).length;
  });
  expect(keerthiVisits).toBe(0);
  await att.getByRole("button", { name: "Close" }).click();
  await count(att, 0);

  // The count by the clock: the whole class. Sign in everyone = the list by grade (Tick all per grade).
  await F.locator(".top-stat").click();
  await contains(att.locator(".sheet-title h2"), "Attendance");
  await att.getByRole("button", { name: "Sign in everyone: 10 not here" }).click();
  await textsAre(many.locator(".atm-h b"), ["Grade 11"]);
  await contains(many.locator(".atm-h"), "1 of 10");
  await many.getByRole("button", { name: "Tick all" }).click();
  await contains(many.locator(".atm-h"), "10 of 10");
  await many.getByRole("button", { name: "Sign in 10" }).click();
  await until(async () => (await present(G11)).every(Boolean), "all of Grade 11 in");
  // Sign out everyone = End the session: everyone out, the class closed with its report.
  await att.getByRole("button", { name: "Sign out everyone: 14 here" }).click();
  await contains(ask.locator("h2"), "Sign out everyone and end the class?");
  await contains(ask.locator(".sheet-title p"), "14 students go home now, open calls close, and today's report is saved.");
  await shot(F, "a03-attendance-sign-out-everyone");
  await ask.getByRole("button", { name: "Sign out everyone" }).click();
  await contains(F.locator(".toast"), "Class ended: everyone signed out.");
  const sessions = await backend.t.run(async (ctx) => (await ctx.db.query("sessions").collect()).map((s) => ({ open: s.open, report: !!s.report })));
  expect(sessions.at(-1)).toEqual({ open: false, report: true });
  expect(await backend.t.run(async (ctx) => (await ctx.db.query("students").collect()).filter((s) => s.present).length)).toBe(0);
  await visible(att.getByRole("button", { name: /^Sign in everyone/ }));
  expect(await att.getByRole("button", { name: /^Sign out everyone/ }).isDisabled()).toBe(true);
  await F.context().close();

  // The smallest phone: the two buttons side by side, nothing sideways.
  const S = await phone(backend, "focus", { ...PHONE, viewport: { width: 320, height: 568 } });
  await S.locator(".top-stat").click();
  const foot = S.locator(".sheet-wrap.fullpage .att-all");
  await visible(foot);
  const boxes = await foot.locator(".btn").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
  expect(new Set(boxes).size).toBe(1);
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(S, "a04-attendance-320");
  await S.context().close();
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Theory: one screen like Evaluation: grade, stage, unit and lesson rows; her room box with Call, Arrived and Done; Taught for everyone with her; Correction's 3 minutes; the owl", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  const T = await phone(backend, "theory");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  const marks = async (name: string) => (await marksOf(backend, name)).marks;
  const roomPills = T.locator(".evx-sp:not(.s-sug)");

  // The rows, each the most urgent first and already picked: Grade 11 (Fathima and Rizwan have no work), the other
  // grades pale; Fighter (Master and Legend pale); unit 13 in Tamil; then its sections, D first (it gives work to the
  // most). No English names, no U-codes, nothing pulsing.
  const grades = T.locator(".evx-g");
  await until(async () => JSON.stringify(await grades.locator("b").allTextContents()) === '["6","7","8","9","10","11","OL"]', "the grades in their places");
  const t11 = T.locator(".evx-g").filter({ has: T.locator("b", { hasText: /^11$/ }) });
  await until(async () => (await t11.getAttribute("aria-pressed")) === "true", "Grade 11 picked");
  expect(await t11.getAttribute("class")).toContain("pri1"); // the most urgent: red outline
  await count(T.locator(".evx-g:disabled"), 6); // OL pale too
  expect(new Set(await grades.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
  await until(
    async () => JSON.stringify(await T.locator(".tp-kind").evaluateAll((els) => els.map((e) => e.firstChild?.textContent))) === '["Fighter","Master","Legend"]',
    "the Fighter, Master and Legend buttons, the most urgent first",
  );
  expect(await T.locator(".tp-kind").first().getAttribute("aria-label")).toMatch(/^Fighter: 8, 2 very urgent/);
  expect(await T.locator(".tp-kind").first().getAttribute("aria-pressed")).toBe("true");
  await visible(T.locator(".tp-kind:disabled", { hasText: "Legend" }));
  await textsAre(T.locator(".evx-u .tp-ln-n"), ["13"]);
  expect(await T.locator(".evx-u .tp-ln-t").textContent()).toMatch(/^[^A-Za-z]+$/); // Tamil only
  await until(async () => (await T.locator(".evx-qg b").first().textContent()) === "D", "D first");
  expect((await T.locator(".evx-qg b").allTextContents()).sort()).toEqual(["B", "C", "D", "E"]);
  const dPill = T.locator(".evx-qg").filter({ has: T.locator("b").getByText("D", { exact: true }) });
  expect(await dPill.getAttribute("aria-pressed")).toBe("true");
  expect(await dPill.locator(".tp-ln-t").textContent()).toMatch(/^[^A-Za-z]+$/); // the section's Tamil title
  await contains(dPill.locator("i"), "4");
  expect(await dPill.getAttribute("class")).toContain("qg-red");
  expect(new Set(await T.locator(".evx-qg").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
  expect(await T.locator(".evx-qgs").innerText()).not.toMatch(/Completing|Equations|workbook|U13|G11/);
  expect(
    await T.evaluate(() => [...document.querySelectorAll(".tp-page *")].filter((e) => getComputedStyle(e).animationIterationCount === "infinite").length),
  ).toBe(0);
  // Her room box: D's four, ticked by the page (no work first); beside it Call 4, Arrived and Done pale.
  expect(await namesOf(T.locator(".evx-sp.s-sug"))).toEqual(["Fathima", "Ahamed", "Dilan", "Nila"]);
  await count(T.locator(".evx-sp.s-sug.on"), 4);
  expect(await evOffer(T, "Fathima").getAttribute("aria-label")).toContain("no work");
  expect(await evOffer(T, "Ahamed").getAttribute("aria-label")).toContain("left · out ~"); // what he still has, so she can judge
  await contains(evCall(T), "Call 4");
  await visible(evArrived(T).and(T.locator(":disabled")));
  await visible(evDone(T).and(T.locator(":disabled")));
  await contains(T.locator(".evx-bh"), "room for 6");
  // What to teach, to prepare before they come: D's four teacher questions, the first with who needs it; the pad pale.
  await textsAre(T.locator(".evx-strip .fc-sq small"), ["D·23", "D·24", "D·25", "D·26"]);
  await contains(T.locator(".evx-card .fc-qn"), "23");
  await contains(T.locator(".evx-card .tpx-what"), "D");
  await contains(T.locator(".evx-card .evx-who"), "Fathima");
  await visible(T.locator(".evx-x:disabled"));
  await visible(T.locator(".evx-foot .sc.sc-thin")); // today's score, at the end
  expect(await T.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const padY = async () => Math.round((await T.locator(".evx-pad").boundingBox())!.y);
  const y0 = await padY();
  expect(y0 + 56).toBeLessThanOrEqual(844 - 66); // above the tabs, on screen
  await shot(T, "t01-theory-page");

  // Nila still has work: leave her out. Call 3: Correction hears it with her name; her room shows them called.
  await evOffer(T, "Nila").click();
  await contains(evCall(T), "Call 3");
  await evCall(T).click();
  await contains(T.locator(".toast"), "Called 3. Correction sends them over.");
  await until(
    async () => (await said(C)).some((s) => ["Fathima", "Ahamed", "Dilan"].every((n) => s.includes(n)) && s.endsWith("go to Owner in Theory.")),
    "Correction hears the three names",
  );
  await count(T.locator(".evx-sp.s-call"), 3);
  await contains(T.locator(".evx-bh"), "room for 3");
  expect(Math.abs((await padY()) - y0)).toBeLessThanOrEqual(2);
  // Correction is slow: after 3 minutes her room shows it in red.
  await backend.t.run(async (ctx) => {
    for (const c of await ctx.db.query("calls").collect()) if (c.status === "requested") await ctx.db.patch(c._id, { createdAt: c.createdAt - 4 * 60_000 });
  });
  await backend.push();
  await count(T.locator(".evx-sp.s-call.s-late"), 3);
  expect(await evPill(T, "Fathima").getAttribute("aria-label")).toContain("not sent 4m");
  await shot(T, "t02-theory-room-called-late");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();

  // Sent: they walk over (dashed pills); Correction's phone counts their 3 minutes down.
  await count(T.locator(".evx-sp.s-walk"), 3);
  await contains(C.locator(".call-strip.cs-walk"), "3m left");
  // Fathima and Ahamed walk in: their files, Arrived (one at a time; Arrived beside the box takes everyone on the way).
  for (const name of ["Fathima", "Ahamed"]) {
    const f = await evFile(T, name);
    await contains(f.locator(".sheet-title p"), "on the way");
    await f.getByRole("button", { name: "Arrived" }).click();
    await contains(T.locator(".toast"), `${name} is here.`);
    await until(async () => /\bs-in\b/.test((await evPill(T, name).getAttribute("class")) ?? ""), `${name} is with her`);
    await f.getByRole("button", { name: "Close" }).click();
  }
  await visible(T.locator(".evx-bh .evx-lock"));
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
  await count(T.locator(".evx-sp.s-walk.s-late"), 1);
  await contains(T.locator(".evx-bh"), "1 coming");
  await shot(C, "t03-correction-lost");
  // Correction finds him at his desk: "In the hall". He is back to work; Theory can call him again.
  await lost.getByRole("button", { name: "In the hall" }).click();
  await contains(C.locator(".toast"), "Dilan is back in the hall.");
  await count(C.locator(".call-strip"), 0);
  expect((await marksOf(backend, "Dilan")).room).toBeUndefined();
  await count(roomPills, 2);
  expect(Math.abs((await padY()) - y0)).toBeLessThanOrEqual(2); // the pad never moved

  // The lesson: Q23 to Q25 taught for both (one tap each, the next opens by itself); the bell rang before Q26.
  await textsAre(T.locator(".evx-strip .fc-sq small"), ["D·23", "D·24", "D·25", "D·26"]);
  await contains(T.locator(".evx-x"), "for 2");
  for (const q of ["23", "24", "25"]) {
    await contains(T.locator(".evx-card .fc-qn"), q);
    await T.locator(".evx-x").click();
  }
  await contains(T.locator(".evx-card .fc-qn"), "26");
  await T.locator(".evx-b.skip").click();
  await count(T.locator(".evx-sp.s-done"), 2);
  await contains(evDone(T), "Done 2");
  // Her taps stay on her phone until Done (the audit, 31 Oct 2026): another page in between keeps them.
  await tab(T, "Register").click();
  await visible(T.locator(".reg-row").first());
  await tab(T, "Theory").click();
  await contains(evDone(T), "Done 2");
  await shot(T, "t04-theory-teaching");
  // Ahamed didn't get Q25: in his file, his Q25 back to not decided. He stays; Done sends Fathima back.
  const ah = await evFile(T, "Ahamed");
  await contains(ah.locator(".ev-h-sum"), "3 taught · 1 not reached");
  await ah.getByRole("button", { name: "Ahamed Q25: taught" }).click();
  await ah.getByRole("button", { name: "Ahamed Q25: not reached" }).click();
  await contains(ah.locator(".ev-h-sum"), "1 to do");
  await shot(T, "t04b-theory-his-file");
  await ah.getByRole("button", { name: "Close" }).click();
  await contains(evDone(T), "Done 1");
  await evDone(T).click();
  await contains(T.locator(".toast"), "Saved: Fathima back to work. Ahamed stays with you.");
  await until(async () => (await marks("Fathima"))["25"]?.s === "taught", "Fathima taught Q23-25");
  const fm = await marks("Fathima");
  expect([fm["23"]?.s, fm["24"]?.s, fm["25"]?.s, fm["26"]?.s ?? null]).toEqual(["taught", "taught", "taught", null]);
  expect((await marks("Ahamed"))["23"]).toBeUndefined();
  // Ahamed has to go: back to the hall without it (D stays his).
  await count(roomPills, 1);
  await (await evFile(T, "Ahamed")).getByRole("button", { name: "Not taught" }).click();
  await contains(T.locator(".toast"), "Ahamed: back to the hall, not taught.");
  expect((await marksOf(backend, "Ahamed")).room).toBeUndefined();
  await count(roomPills, 0);

  // D again: Fathima needs only Q26 now; the others all of it (the preview says who needs which). Dilan goes first;
  // while D is going on its count is blue, and Nila joins it.
  await evPick(T, { grade: "11", stage: "Fighter", unit: "13", group: "D" });
  await T.locator(".evx-strip .fc-sq", { hasText: "D·23" }).click();
  await until(async () => !(await T.locator(".evx-card .evx-who").innerText()).includes("Fathima"), "Q23: not Fathima");
  await T.locator(".evx-strip .fc-sq", { hasText: "D·26" }).click();
  await contains(T.locator(".evx-card .evx-who"), "Fathima");
  await evCallOnly(T, ["Dilan"]);
  await hears(C, "Dilan, go to Owner in Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();
  await visible(T.locator(".evx-qg.qg-going").filter({ has: T.locator("b").getByText("D", { exact: true }) }));
  await contains(T.locator(".evx-bh"), "room for 5");
  await evCallOnly(T, ["Nila"]);
  await hears(C, "Nila, go to Owner in Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();
  // Her phone must show Nila walking (Sent reached it) before Arrived: an Arrived tapped while Nila was still only
  // called took Dilan alone (a race in the test, seen 2 Nov 2026 under load).
  await until(async () => /\bs-walk\b/.test((await evPill(T, "Nila").getAttribute("class")) ?? ""), "Nila on her way");
  await evArrive(T, ["Dilan", "Nila"]);
  // Teaching mode (3 Nov 2026): the lesson full screen: the unit and its section on top (Tamil), the squares, the
  // question (this pilot book has none in the app: the note), Taught for both = the next question by itself; Done in the
  // view sends them back and closes it.
  await T.locator(".evx-card .fc-tmb").click();
  const tm = T.locator(".tm");
  await visible(tm);
  await contains(tm.locator(".tm-title .tp-ln-n"), "13·D");
  expect(await tm.locator(".tm-title .tp-ln-t").textContent()).toMatch(/^[^A-Za-z]+$/);
  await textsAre(tm.locator(".fc-strip .fc-sq small"), ["D·23", "D·24", "D·25", "D·26"]);
  await contains(tm.locator(".fc-qmeta.evx-who"), "Dilan");
  await contains(tm.locator(".fc-qmeta.evx-who"), "Nila");
  await visible(tm.locator(".tm-noq"));
  await contains(tm.locator(".evx-x"), "for 2");
  expect(await T.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(T, "t10-teaching-mode");
  for (const q of ["23", "24", "25", "26"]) {
    await contains(tm.locator(".fc-qn"), q);
    await tm.locator(".evx-x").click();
  }
  await contains(tm.locator(".tm-done"), "Done 2");
  await tm.locator(".tm-done").click();
  await count(T.locator(".tm"), 0);
  await until(async () => (await marks("Nila"))["26"]?.s === "taught", "Nila taught Q23-26");
  await until(async () => (await marks("Dilan"))["26"]?.s === "taught", "Dilan taught Q23-26");

  // A workbook lesson: Evaluation sent Malik's Q13 and Q17 to Theory. Grade 7, Master, unit 8: one pill for both (he
  // alone needs them). His squares show what he got and who sent them; his file too, and his unit.
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
  await evPick(T, { grade: "7", stage: "Master", unit: "8", group: "13 · 17" });
  expect(await namesOf(T.locator(".evx-sp.s-sug"))).toEqual(["Malik"]);
  await shot(T, "t05-theory-workbook-lesson");
  await evCallOnly(T, ["Malik"]);
  await hears(C, "Malik, go to Owner in Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: /^Sent/ }).click();
  await evArrive(T, ["Malik"]);
  await textsAre(T.locator(".evx-strip .fc-sq small"), ["13", "17"]);
  // His screenshot (31 Oct 2026): nobody else needs Malik's lesson, yet the rows stay on it (Grade 7, Master, unit 8,
  // each marked hers for a screen reader) and the box offers nobody from another book.
  const onGrade = async () => T.locator(".evx-g.on b").textContent();
  await until(async () => (await onGrade()) === "7", "her room's grade stays picked");
  expect(await T.locator(".evx-g.on").getAttribute("aria-label")).toContain("your room");
  await contains(T.locator(".tp-kind.on"), "Master");
  await textsAre(T.locator(".evx-u.on .tp-ln-n"), ["8"]);
  expect(await T.locator(".evx-u.on").getAttribute("aria-label")).toContain("your room");
  await count(T.locator(".evx-sp.s-sug"), 0);
  // She looks at Grade 11 for the next lesson: its rows and its lesson (to prepare, the pad pale); back to her room.
  await evPick(T, { grade: "11" });
  await textsAre(T.locator(".evx-u.on .tp-ln-n"), ["13"]);
  await visible(T.locator(".evx-x:disabled"));
  await shot(T, "t05c-theory-another-book");
  await T.locator(".evx-card .evx-back").click();
  await until(async () => (await onGrade()) === "7", "back to her room's grade");
  await textsAre(T.locator(".evx-strip .fc-sq small"), ["13", "17"]);
  await contains(T.locator(".evx-who"), "Malik 0/2 · Evaluation");
  await visible(T.locator(".evx-card .fc-anote", { hasText: "No answer key for this workbook yet." }));
  const mf = await evFile(T, "Malik");
  await contains(mf.locator(".tpx-fq"), "Q17");
  await visible(mf.locator(".tp-fx .mtrack"));
  await shot(T, "t05b-theory-file-workbook");
  await mf.getByRole("button", { name: "Close" }).click();
  // He gets Q13 today; Q17 waits (Not reached).
  await T.locator(".evx-x").click();
  await T.locator(".evx-b.skip").click();
  await evDone(T).click();
  await until(async () => (await marksOf(backend, "Malik")).m!.q["13"]?.tt !== undefined, "Malik Q13 taught");
  // Saved: her room is empty, so the rows show the most urgent again (Grade 11) until she picks.
  await contains(T.locator(".toast"), "Saved: Malik back to work.");
  await until(async () => (await onGrade()) === "11", "the most urgent grade");
  const mm = (await marksOf(backend, "Malik")).m!;
  expect(mm.q["17"]).toMatchObject({ th: expect.any(Number) });
  expect(mm.q["17"].tt).toBeUndefined();
  await evPick(T, { grade: "7", stage: "Master", unit: "8" });
  await textsAre(T.locator(".evx-qg b"), ["17"]);

  // Evaluation calls Kumar: Theory lists him on E but doesn't tick him. Theory takes him anyway: Evaluation is told
  // her call went (theory comes first). Then Theory changes its mind: cancel the call in his file.
  const E = await phone(backend, "evaluation");
  await evCallOnly(E, ["Kumar"]);
  await evPick(T, { grade: "11", stage: "Fighter", unit: "13", group: "E" });
  await until(async () => ((await evOffer(T, "Kumar").getAttribute("aria-label")) ?? "").includes("Eval called"), "Kumar: Eval called");
  expect(await evOffer(T, "Kumar").getAttribute("aria-pressed")).toBe("false");
  await evCallOnly(T, ["Kumar"]);
  await contains(T.locator(".toast"), "Called 1. Correction sends him over. Evaluation had called him: she is told.");
  await contains(E.locator(".bump-note"), "Theory took Kumar first.");
  await shot(E, "t06-evaluation-told");
  await (await evFile(T, "Kumar")).getByRole("button", { name: "Cancel the call" }).click();
  await count(roomPills, 0);
  await count(E.locator(".bump-note"), 0);
  await E.context().close();

  // Theory's "All" is the Class tab now: every student, ◎ circles and section letters, his book and Move.
  await tab(T, "Register").click();
  await visible(row(T, "Dilan").getByRole("button", { name: "Section D: mark all theory taught" }));
  await row(T, "Dilan").locator(".reg-name").click();
  await visible(row(T, "Dilan").getByRole("button", { name: "Move: unit or stage" }));
  await count(row(T, "Dilan").getByRole("button", { name: /going home/ }), 1); // the owner may (a Theory teacher may not)
  await shot(T, "t07-class-as-theory");
  await tab(T, "Theory").click();

  // The smallest phone: the grades in one row, the room box and its buttons fit, the big Taught on screen above the
  // tabs, no sideways scrolling.
  const S = await phone(backend, "theory", { ...PHONE, viewport: { width: 320, height: 568 } });
  await visible(S.locator(".evx-call"));
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(new Set(await S.locator(".evx-g").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
  const fits = await S.evaluate(() =>
    [...document.querySelectorAll(".evx-col .btn, .tp-kind, .evx-box")].every((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= 320.5),
  );
  expect(fits, "every button fits at 320 px").toBe(true);
  const big = await S.locator(".evx-x").boundingBox();
  expect(big!.y + big!.height).toBeLessThanOrEqual(568 - 66 + 1); // on screen, above the tabs
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

test("Evaluation: one screen: grade, stage, unit and questions the most urgent first; her room box with Call, Arrived and Done; one question for everyone with her", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  const E = await phone(backend, "evaluation");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  // A FAKE answer key for the demo workbook (G7 U08); Ahamed got Q22 wrong too, 12 minutes ago (Fathima has it).
  await backend.t.run(async (ctx) => {
    const u = (await ctx.db
      .query("units")
      .withIndex("by_key", (q) => q.eq("key", "G7-U08"))
      .first())!;
    const answers = Array.from({ length: 57 }, (_, i) => (i + 1 === 22 ? { q: 22, a: "−7 + 4 = **−3**" } : { q: i + 1, a: `A${i + 1}` }));
    await ctx.db.insert("keys", { unitId: u._id, answers, updatedAt: Date.now() });
    const a = (await ctx.db.query("students").collect()).find((x) => x.name === "Ahamed")!;
    const p = (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", a._id)).collect()).find((x) => x.unitId === a.unitId)!;
    await ctx.db.patch(p._id, { marks: { ...(p.marks ?? {}), "22": { s: "wrong", n: 1, t: Date.now() - 12 * 60_000 } } });
  });
  await backend.push();

  // The grades in fixed places (1 Nov 2026), the most urgent already picked: Grade 11 (Dilan stuck, Fathima no work)
  // outlined red, then 7 orange; the grades with nothing for her pale. All six in ONE row.
  const grades = E.locator(".evx-g");
  await until(async () => JSON.stringify(await grades.locator("b").allTextContents()) === '["6","7","8","9","10","11","OL"]', "the grades in their places");
  const g11 = E.locator(".evx-g").filter({ has: E.locator("b", { hasText: /^11$/ }) });
  await until(async () => (await g11.getAttribute("aria-pressed")) === "true", "Grade 11 picked");
  expect(await g11.getAttribute("class")).toContain("pri1");
  expect(await E.locator(".evx-g").filter({ has: E.locator("b", { hasText: /^7$/ }) }).getAttribute("class")).toContain("pri2");
  // The outline really is the red of "very urgent" (the page's own --red).
  const red = await E.evaluate(() => {
    const d = document.createElement("div");
    d.style.color = "var(--red)";
    document.body.append(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  });
  expect(await g11.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe(red);
  await count(E.locator(".evx-g:disabled"), 5); // OL pale too
  expect(new Set(await grades.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
  await until(
    async () => JSON.stringify(await E.locator(".tp-kind").evaluateAll((els) => els.map((e) => e.firstChild?.textContent))) === '["Fighter","Master","Legend"]',
    "Fighter first",
  );
  expect(await E.getByRole("button", { name: /^Fighter:/ }).getAttribute("aria-label")).toBe("Fighter: 4, 2 very urgent, 2 soon, most urgent 1st");
  await visible(E.locator(".tp-kind:disabled", { hasText: "Legend" }));
  await textsAre(E.locator(".evx-u .tp-ln-n"), ["13"]);
  expect(await E.locator(".evx-u .tp-ln-t").textContent()).toMatch(/^[^A-Za-z]+$/); // Tamil only
  // The questions the same students got wrong: Q22 for Fathima and Ahamed first (explain once), Dilan's Q18, Kumar's.
  await textsAre(E.locator(".evx-qg b"), ["22", "18", "28 · 29"]);
  expect(await E.locator(".evx-qg").first().getAttribute("aria-pressed")).toBe("true");
  // Her room box: both offered and ticked; beside it Call 2, and Arrived and Done pale.
  expect(await namesOf(E.locator(".evx-sp.s-sug"))).toEqual(["Fathima", "Ahamed"]);
  await count(E.locator(".evx-sp.s-sug.on"), 2);
  await contains(evCall(E), "Call 2");
  await visible(evArrived(E).and(E.locator(":disabled")));
  await visible(evDone(E).and(E.locator(":disabled")));
  await contains(E.locator(".evx-bh"), "room for 6");
  // The question as Correction shows it, to prepare before they come: Q22; the pad pale until they are with her.
  await contains(E.locator(".evx-card .fc-qn"), "22");
  await visible(E.locator(".evx-x:disabled"));
  await visible(E.locator(".evx-foot .sc.sc-thin")); // today's score, at the end
  expect(await E.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(E, "e01-evaluation-page");

  // Call 2: Correction says her name; Sent. On their way (dashed), then Arrived (both at once).
  await evCall(E).click();
  await contains(E.locator(".toast"), "Called 2. Correction sends them over.");
  await hears(C, "Fathima and Ahamed, go to Owner in Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent 2" }).click();
  await visible(evPill(E, "Fathima").and(E.locator(".s-walk")));
  await contains(evArrived(E), "Arrived 2");
  await contains(C.locator(".call-strip.evaluation.cs-walk"), "Fathima");
  await evArrive(E, ["Fathima", "Ahamed"]);
  await count(C.locator(".call-strip"), 0);
  await contains(E.locator(".evx-bh"), "2 with you");
  await visible(E.locator(".evx-bh .evx-lock"));
  // Free in ~3 min (one question for both, 3 min until her phone learns her pace), nobody on the way, Dilan and Kumar
  // waiting for unit 13: call now, the Call button lit (1 Nov 2026).
  await contains(E.locator(".evx-bh"), "free ~3m · call now");
  await visible(E.locator(".evx-call.ahead"));
  // Q22 once for both: Explained (for 2); their pills are done; Done 2 sends both back.
  await textsAre(E.locator(".evx-strip .fc-sq small"), ["22"]);
  await contains(E.locator(".evx-who"), "Fathima");
  await contains(E.locator(".evx-who"), "Ahamed");
  await contains(E.locator(".evx-x"), "for 2");
  await shot(E, "e02-explaining");
  await E.locator(".evx-x").click();
  await count(E.locator(".evx-sp.s-done"), 2);
  await contains(evDone(E), "Done 2");
  // Her taps stay on her phone until Done (the audit, 31 Oct 2026): another page, or the page loaded again, lost them.
  await tab(E, "Register").click();
  await visible(E.locator(".reg-row").first());
  await tab(E, "Evaluation").click();
  await contains(evDone(E), "Done 2");
  await E.reload();
  await contains(evDone(E), "Done 2");
  await textsAre(E.locator(".evx-strip .fc-sq.s-explained small"), ["22"]);
  await evDone(E).click();
  await contains(E.locator(".toast"), "Saved: Fathima and Ahamed back to work.");
  await until(
    async () => (await marksOf(backend, "Fathima")).marks["22"]?.s === "explained" && (await marksOf(backend, "Ahamed")).marks["22"]?.s === "explained",
    "Q22 explained for both",
  );

  // The workbooks: Grade 7, Master, unit 8: Vimal's Q22 Q51 (no work: red) before Malik's Q4 Q13 Q17.
  await evPick(E, { grade: "7", stage: "Master", unit: "8" });
  await textsAre(E.locator(".evx-qg b"), ["22 · 51", "4 · 13 · 17"]);
  await evPick(E, { group: "22 · 51" });
  expect(await namesOf(E.locator(".evx-sp.s-sug"))).toEqual(["Vimal"]);
  await evCall(E).click();
  await hears(C, "Vimal, go to Owner in Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();
  await evArrive(E, ["Vimal"]);
  // His questions one at a time with his marks and the key's answer, big as on Correction's card (3 Nov 2026): the
  // number a dark pill in the top line with who has it, then the answer.
  await textsAre(E.locator(".evx-strip .fc-sq small"), ["22", "51"]);
  await contains(E.locator(".evx-card .fc-qhead .fc-qn"), "22");
  await contains(E.locator(".evx-card .fc-qhead .evx-who"), "Vimal 0/");
  await contains(E.locator(".evx-card .fc-ans .ka-h"), "−3");
  await count(E.locator(".evx-card .fc-qdoc"), 0); // the printed question is an icon, only when the book has its questions
  // Teaching mode (3 Nov 2026, his ask: teach from the whiteboard looking at the phone): the whole screen; the book on
  // top, the squares, the question (this demo workbook has none in the app: the note says so), the answer big, and the
  // page's own buttons: Explained = the next question, → Theory; Done appears; the phone's Back closes it.
  await E.locator(".evx-card .fc-tmb").click();
  const tm = E.locator(".tm");
  await visible(tm);
  await contains(tm.locator(".tm-title .tp-ln-n"), "8");
  await textsAre(tm.locator(".fc-strip .fc-sq small"), ["22", "51"]);
  await contains(tm.locator(".fc-qn"), "22");
  await contains(tm.locator(".fc-qmeta.evx-who"), "Vimal");
  await visible(tm.locator(".tm-noq"));
  await contains(tm.locator(".fc-ans .ka-h"), "−3");
  const tmBox = (await tm.boundingBox())!;
  expect(tmBox.y).toBe(0);
  expect(tmBox.height).toBeGreaterThanOrEqual(843); // over the top bar and the tabs
  await count(E.locator(".evx-card"), 1); // the page's card steps aside while the view is open
  expect(await E.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(E, "e08-teaching-mode");
  await tm.locator(".evx-x").click();
  await contains(tm.locator(".fc-qn"), "51");
  await tm.locator(".evx-b.th").click();
  await contains(tm.locator(".tm-done"), "Done 1");
  await E.goBack({ waitUntil: "commit" }); // Android's Back button
  await count(E.locator(".tm"), 0);
  await contains(E.locator(".evx-card .fc-qn"), "51");
  await textsAre(E.locator(".evx-strip .fc-sq.s-explained small"), ["22"]);
  await count(E.locator(".evx-strip .fc-sq.dk"), 1);
  // His file (his pill): what was decided, his unit, his day; Done sends him back.
  const vf = await evFile(E, "Vimal");
  await contains(vf.locator(".ev-h-sum"), "1 explained · 1 to Theory");
  await contains(vf.locator(".tp-fl .tp-ln-n"), "8");
  await shot(E, "e03-evaluation-file");
  await vf.getByRole("button", { name: "Done: back to work" }).click();
  await contains(E.locator(".toast"), "Saved: Vimal back to work.");
  const vm = (await marksOf(backend, "Vimal")).m!;
  expect(vm.q["22"]?.x).toBeDefined();
  expect(vm.q["51"]).toMatchObject({ th: expect.any(Number), tb: "evaluation" });
  expect(vm.q["51"].x).toBeUndefined();

  // Two more, from two groups: Dilan (Q18) and Kumar (Q28 Q29) wait in her room together, called (dotted).
  await evCallOnly(E, ["Dilan"]);
  await evCallOnly(E, ["Kumar"]);
  await count(E.locator(".evx-sp.s-call"), 2);
  await contains(E.locator(".evx-bh"), "room for 4");
  // Today's score: 3 explained to so far.
  await contains(E.locator(".sc-c", { hasText: "seen" }), "3");

  // His screenshot (31 Oct 2026): nobody else waits for unit 13 now, yet the rows stay on her room's book (Grade 11,
  // Fighter, unit 13, each marked hers for a screen reader), the box offers nobody from another book, and the questions on screen
  // are theirs. Grade 7 still shows Malik waiting.
  const onGrade = (p: Page) => p.locator(".evx-g.on b").textContent();
  await until(async () => (await onGrade(E)) === "11", "her room's grade stays picked");
  expect(await E.locator(".evx-g.on").getAttribute("aria-label")).toContain("your room");
  expect(await E.locator(".tp-kind.on").getAttribute("aria-label")).toContain("your room");
  await contains(E.locator(".tp-kind.on"), "Fighter");
  await textsAre(E.locator(".evx-u.on .tp-ln-n"), ["13"]);
  expect(await E.locator(".evx-u.on").getAttribute("aria-label")).toContain("your room");
  await count(E.locator(".evx-sp.s-sug"), 0);
  await textsAre(E.locator(".evx-strip .fc-sq small"), ["18", "28", "29"]);
  await visible(E.locator(".evx-g:not(:disabled)", { hasText: "7" }));
  await shot(E, "e06-room-rows");
  // To call Malik next she taps Grade 7: the rows, the box and the question on screen are unit 8's (to prepare, the pad
  // pale); "Back to your room" shows her room's again.
  await evPick(E, { grade: "7" });
  await textsAre(E.locator(".evx-u.on .tp-ln-n"), ["8"]);
  expect(await namesOf(E.locator(".evx-sp.s-sug"))).toEqual(["Malik"]);
  await textsAre(E.locator(".evx-strip .fc-sq small"), ["4", "13", "17"]);
  await contains(E.locator(".evx-who"), "Malik");
  await visible(E.locator(".evx-x:disabled"));
  expect(await E.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(E, "e07-another-book");
  await E.locator(".evx-card .evx-back").click();
  await until(async () => (await onGrade(E)) === "11", "back to her room's grade");
  await textsAre(E.locator(".evx-strip .fc-sq small"), ["18", "28", "29"]);
  // She calls Malik from Grade 7: two books in her room. The rows show the book of the question on her screen; a tap on
  // a square of the other book takes them there.
  await evPick(E, { grade: "7" });
  await contains(evCall(E), "Call 1");
  await evCall(E).click();
  await contains(E.locator(".toast"), "Called 1.");
  await contains(E.locator(".evx-bh"), "room for 3");
  await textsAre(E.locator(".evx-strip .fc-sq small"), ["8·4", "8·13", "8·17", "13·18", "13·28", "13·29"]);
  await until(async () => (await onGrade(E)) === "7", "the open question's grade");
  await textsAre(E.locator(".evx-u.on .tp-ln-n"), ["8"]);
  await E.locator(".evx-strip .fc-sq", { hasText: "13·18" }).click();
  await until(async () => (await onGrade(E)) === "11", "the rows go with the question");
  await textsAre(E.locator(".evx-u.on .tp-ln-n"), ["13"]);
  await contains(E.locator(".evx-card .fc-qn"), "18");

  // The smallest phone: the grades in one row, the big button on screen above the tabs, the top bar fits.
  const S = await phone(backend, "evaluation", { ...PHONE, viewport: { width: 320, height: 568 } });
  await visible(S.locator(".evx-call"));
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(new Set(await S.locator(".evx-g").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
  const big = await S.locator(".evx-x").boundingBox();
  expect(big!.y + big!.height).toBeLessThanOrEqual(568 - 66 + 1);
  expect(await topFits(S), "the top bar fits at 320 px").toBe(true);
  await shot(S, "e04-evaluation-320");
  // Teaching mode on the smallest phone before anyone is with her (getting ready): the big button goes on to the next
  // square; × closes it.
  await S.locator(".evx-card .fc-tmb").click();
  const stm = S.locator(".tm");
  await visible(stm.locator(".tm-next"));
  const firstQ = await stm.locator(".fc-qn").innerText();
  await stm.locator(".tm-next").click();
  await until(async () => (await stm.locator(".fc-qn").innerText()) !== firstQ, "the next square");
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const nextBox = (await stm.locator(".tm-next").boundingBox())!;
  expect(nextBox.y + nextBox.height).toBeLessThanOrEqual(568 + 1);
  await shot(S, "e09-teaching-mode-320");
  await stm.locator(".tm-x").click();
  await count(S.locator(".tm"), 0);
  await evFile(S, "Dilan");
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

  // Evaluation shows him once per book: Grade 7, Master, then unit 8 (Q4 Q13) and unit 9 (Q2). One book per call.
  await evPick(E, { grade: "7", stage: "Master" });
  await textsAre(E.locator(".evx-u .tp-ln-n"), ["8", "9"]);
  await shot(E, "b01-evaluation-two-books");
  await evPick(E, { unit: "8", group: "4 · 13" });
  expect(await namesOf(E.locator(".evx-sp.s-sug"))).toEqual(["Malik"]);
  await evCallOnly(E, ["Malik"]);
  await contains(E.locator(".toast"), "Called 1.");
  const callOf = () =>
    backend.t.run(async (ctx) => (await ctx.db.query("calls").collect()).filter((c) => c.studentId === ids.malik && c.room === "evaluation"));
  expect((await callOf()).map((c) => c.unitId)).toEqual([ids.u08]);
  await hears(C, "Malik, go to Owner in Evaluation.");
  await C.locator(".call-strip.evaluation").getByRole("button", { name: "Sent" }).click();

  // With her (Arrived): U08's questions only. Done, and he stays for U09 (no walk back): the room has space.
  await evArrive(E, ["Malik"]);
  await textsAre(E.locator(".evx-strip .fc-sq small"), ["4", "13"]);
  const mh = await evFile(E, "Malik");
  await contains(mh.locator(".tp-fl .tp-ln-n"), "8");
  await shot(E, "b02-evaluation-keep");
  await mh.getByRole("button", { name: "All explained, keep him for unit 9 (1)" }).click();
  await contains(E.locator(".toast"), "Saved: Malik stays for unit 9 (1 to explain).");
  await textsAre(E.locator(".evx-strip .fc-sq small"), ["2"]);
  await E.locator(".evx-x").click();
  await contains(evDone(E), "Done 1");
  await evDone(E).click();
  await count(E.locator(".evx-sp:not(.s-sug)"), 0);
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

  // Theory sees his U08 question though he is on U09: Grade 7, Master, unit 8, Q17 has him.
  const T = await phone(backend, "theory");
  await evPick(T, { grade: "7", stage: "Master", unit: "8", group: "17" });
  await visible(evOffer(T, "Malik"));
  await shot(T, "b03-theory-other-book");
  await T.context().close();

  // Vimal has no work until his Level 8 is corrected (red). Give him the U09 workbook (Books given): he has work.
  await evPick(E, { grade: "7", stage: "Master", unit: "8" });
  const vimalQs = E.locator(".evx-qg").filter({ has: E.locator("b").getByText("22 · 51", { exact: true }) });
  await visible(vimalQs.and(E.locator(".qg-red")));
  await backend.t.mutation(api.students.setGiven, { token: OWNER_TOKEN, id: ids.vimal, unitId: ids.u09, stage: "master", given: true });
  await backend.push();
  await until(async () => !((await vimalQs.getAttribute("class")) ?? "").includes("qg-red"), "Vimal not red any more");
  await evPick(E, { group: "22 · 51" });
  expect(await evOffer(E, "Vimal").getAttribute("aria-label")).toContain("on U09");
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


/** A finished class of two hours on an earlier day: 12 Master students, timed corrections, a busy Evaluation. */
function pastDigest(start: number, ids: string[]) {
  const min = (n: number) => start + n * 60_000;
  const end = min(120);
  const events: DEvent[] = [];
  const calls: DCall[] = [];
  ids.forEach((id, i) => {
    for (const k of [1, 2]) {
      const at = min(15 + i * 4 + (k - 1) * 50);
      events.push({ at: at - 6 * 60_000, kind: "level-done", who: "Nisha", studentId: id, unit: "G7-U08", value: String(k) });
      events.push({ at, kind: "level-marks", who: "Nisha", studentId: id, unit: "G7-U08", value: `${k} 16/20`, ms: 6 * 60_000, took: 3 * 60_000 });
    }
    // Evaluation one after another, 9 minutes each: busy 90% of the class.
    calls.push({ studentId: id, room: "evaluation", kind: "evaluation", status: "done", group: `e${i}`, createdAt: min(8 + 9 * i), sentAt: min(9 + 9 * i), arrivedAt: min(10 + 9 * i), endedAt: min(19 + 9 * i), teacher: "Fathima" });
    events.push({ at: min(19 + 9 * i), kind: "explained", who: "Fathima", studentId: id, value: "2" });
    if (i < 4) events.push({ at: min(40 + i), kind: "idle", studentId: id, value: "evaluation", ms: 9 * 60_000 });
  });
  for (let l = 0; l < 3; l++) {
    for (const id of ids.slice(l * 4, l * 4 + 4)) {
      calls.push({ studentId: id, room: "theory", kind: "theory", status: "done", group: `t${l}`, createdAt: min(30 + 30 * l), sentAt: min(31 + 30 * l), arrivedAt: min(32 + 30 * l), endedAt: min(44 + 30 * l), teacher: "Nila" });
    }
  }
  const visits = ids.map((id) => ({ studentId: id, inAt: start, outAt: end }));
  return digestOf({ start, end, events, calls, visits, students: ids.map((id) => ({ _id: id, stage: "master" })), stats: { theory: { qs: 9 } } });
}

test("Owner page: now, today, team, business, money; one student's sheet for his parents", async () => {
  const backend = await newClass();
  const O = await phone(backend, "correction");
  await O.getByRole("button", { name: "Settings" }).click();
  await O.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(O.getByText(/^14 demo students loaded/));
  await O.getByRole("button", { name: "Back to the class" }).click();

  // The Owner page never counts demo students: make them real. Three earlier classes, and Keerthi gone for 20 days.
  const DAY = 24 * 60 * 60_000;
  const ids = await backend.t.run(async (ctx) => {
    const all = await ctx.db.query("students").collect();
    for (const x of all) await ctx.db.patch(x._id, { demo: false, ...(x.name === "Keerthi" ? { lastInAt: Date.now() - 20 * DAY } : {}) });
    return all.filter((x) => x.name !== "Keerthi").map((x) => x._id as string);
  });
  await backend.t.run(async (ctx) => {
    for (const k of [3, 2, 1]) {
      const start = Date.now() - k * DAY - 3 * 60 * 60_000;
      const digest = pastDigest(start, ids.slice(0, 12));
      await ctx.db.insert("sessions", { open: false, startedAt: start, endedAt: start + 120 * 60_000, lastActivityAt: start + 120 * 60_000, report: { digest } });
      const day = new Date(start + 330 * 60_000).toISOString().slice(0, 10);
      for (const id of ids.slice(0, 12)) await ctx.db.insert("attendance", { studentId: id as never, day, inAt: start, outAt: start + 120 * 60_000 });
    }
  });
  // Today: Malik's handed-in level corrected on the Correction page way (a draft first: the level is timed).
  const malik = await backend.t.run(async (ctx) => {
    const m = (await ctx.db.query("students").collect()).find((x) => x.name === "Malik")!;
    const p = (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", m._id)).collect()).find((x) => x.stage === "master")!;
    const lv = Object.entries(p.m!.lv).find(([, l]) => l.done && !l.fixed)!;
    return { id: m._id, unitId: p.unitId, level: Number(lv[0]) };
  });
  const lvl = KNOWN_WORKBOOKS.find((w) => w.grade === 7)!.data.levels.find((l) => l.n === malik.level)!;
  const items = Array.from({ length: lvl.to - lvl.from + 1 }, (_, i) => ({ q: lvl.from + i, got: 2 }));
  await backend.t.mutation(api.focus.mark, { token: OWNER_TOKEN, studentId: malik.id, unitId: malik.unitId, level: malik.level, set: [{ q: lvl.from, g: 2 }], by: "correction" });
  await backend.t.mutation(api.workbook.correct, { token: OWNER_TOKEN, studentId: malik.id, unitId: malik.unitId, level: malik.level, items, by: "correction" });
  await backend.push();

  // The owner's top bar has the Owner icon, and it still fits.
  expect(await topFits(O)).toBe(true);
  await O.getByRole("button", { name: "Owner: the whole business" }).click();

  // Now: who is here, who has no work, minutes of work waiting in each room.
  await visible(O.locator(".boss-room.r-correction"));
  await contains(O.locator(".boss-tile").first(), "13");
  await count(O.locator(".boss-room"), 3);
  await visible(O.locator(".boss-say").first());
  await shot(O, "boss01-now", true);

  // Today: the idle number first, the work, each room's busy share, each person.
  await O.getByRole("button", { name: "Today", exact: true }).click();
  await visible(O.locator(".boss-hero"));
  await says(O.locator(".boss-h"), "Today");
  await contains(O.locator(".boss-tile", { hasText: "levels corrected" }), "1");
  await count(O.locator(".boss-meter"), 3);
  await visible(O.locator(".boss-people li", { hasText: "Owner" }));
  await visible(O.locator(".boss-table"));
  await shot(O, "boss02-today", true);

  // Team: three earlier classes; Evaluation busy 90% = needs another person; the limit and one more person.
  await O.getByRole("button", { name: "Team", exact: true }).click();
  await count(O.locator(".boss-verdict"), 3);
  await contains(O.locator(".boss-sure"), "3 classes");
  await contains(O.locator(".boss-verdict.t-red"), "Evaluation");
  await contains(O.locator(".boss-verdict.t-red"), "Needs another person");
  await contains(O.locator(".boss-cap"), "students at once");
  await contains(O.locator(".boss-cap"), "The limit is Evaluation");
  await contains(O.locator(".boss-plus"), "One more person here");
  await contains(O.locator(".boss-facts"), "3 min");
  await shot(O, "boss03-team", true);

  // Business: the money numbers once, then rupees; Keerthi is leaving; her sheet opens from the list.
  await O.getByRole("button", { name: "Business", exact: true }).click();
  await O.getByLabel("Average monthly fee per student").fill("2500");
  await O.getByLabel("A corrector's pay a month").fill("20000");
  await O.getByLabel("A teacher's pay a month (Theory, Evaluation)").fill("35000");
  await O.locator(".boss-money").getByRole("button", { name: "Save" }).click();
  await visible(O.locator(".boss-money .boss-tile"));
  await contains(O.locator(".boss-money"), "Rs 2,500");
  await contains(O.locator(".boss-money"), "at risk");
  expect(await backend.t.run(async (ctx) => (await ctx.db.query("meta").collect()).find((x) => x.key === "boss.money")?.value?.fee)).toBe(2500);
  await visible(O.locator(".boss-mx"));
  await shot(O, "boss04-business", true);
  await O.locator(".boss-nm", { hasText: "Keerthi" }).click();
  await contains(O.locator(".sr-sheet .sheet-title h2"), "Keerthi");
  await contains(O.locator('.sr-sheet .sr-card[aria-label="Attendance"] .sr-line'), "Last came: 20 days ago");
  await O.locator(".sr-sheet").getByRole("button", { name: "Close" }).click();
  // Team with money: what one more person costs, in students' fees.
  await O.getByRole("button", { name: "Team", exact: true }).click();
  await contains(O.locator(".boss-verdict.t-red .boss-plus"), "the fees of 14 students");

  // Progress → Malik: his whole sheet; Share with parents: one Tamil-first image, rank off until switched on.
  await O.getByRole("button", { name: "Progress", exact: true }).click();
  await O.getByRole("button", { name: /^Grade 7:/ }).click();
  await O.getByRole("button", { name: "Malik: his whole sheet" }).click();
  const sheet = O.locator(".sr-sheet");
  await contains(sheet.locator(".sheet-title h2"), "Malik");
  await visible(sheet.locator(".sr-card", { hasText: "Now" }).locator(".sr-unit.cur"));
  await count(sheet.locator(".sr-grid i.sr-d"), 28);
  await shot(O, "boss05-student-sheet", true);
  await sheet.getByRole("button", { name: "Share with parents" }).click();
  const share = O.locator(".sheet-wrap:not(.sr-sheet) .sheet");
  await visible(share.locator("canvas.poster-page"));
  expect(await share.locator("canvas.poster-page").evaluate((c) => [(c as HTMLCanvasElement).width, (c as HTMLCanvasElement).height])).toEqual([1080, 1350]);
  await visible(share.getByRole("button", { name: "Share", exact: true }));
  const { writeFile } = await import("node:fs/promises");
  const save = async (name: string) => {
    const png = await share.locator("canvas.poster-page").evaluate((c) => (c as HTMLCanvasElement).toDataURL("image/png"));
    await writeFile(join(SHOTS, name), Buffer.from(png.split(",")[1], "base64"));
  };
  await save("boss06-parents-image.png");
  await share.getByLabel("Rank in his unit").check();
  await contains(share.locator(".sr-rank"), "2nd of 3 on Unit 8");
  await share.locator("textarea").fill(
    "Malik works hard and his Part II answers are getting better every week. Please make sure he comes on Thursday and Saturday, and brings his workbook every day.",
  );
  await O.waitForTimeout(700);
  await visible(share.getByRole("button", { name: "Share", exact: true }));
  await save("boss07-parents-image-rank-note.png");
  await shot(O, "boss08-share-sheet");
  await O.evaluate(() => {
    const nav = navigator as unknown as { canShare: () => boolean; share: (d: { files: File[] }) => Promise<void> };
    nav.canShare = () => true;
    nav.share = async (d) => {
      (window as unknown as { __shared: string[] }).__shared = d.files.map((x) => `${x.name}|${x.type}|${x.size > 5000}`);
    };
  });
  await share.getByRole("button", { name: "Share", exact: true }).click();
  await until(async () => ((await O.evaluate(() => (window as unknown as { __shared?: string[] }).__shared)) ?? []).length > 0, "shared");
  expect((await O.evaluate(() => (window as unknown as { __shared: string[] }).__shared))[0]).toMatch(/^ARISTORA-Malik-\d{4}-\d{2}-\d{2}\.png\|image\/png\|true$/);

  // A teacher, even with Reports, has no Owner icon.
  const NILA = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx";
  await addPerson(backend.t, { name: "Nila", token: NILA, tabs: ["theory"], can: ["reports"] });
  const N = await phone(backend, "theory", PHONE, NILA);
  await visible(N.getByRole("button", { name: "Progress", exact: true }));
  await count(N.getByRole("button", { name: "Owner: the whole business" }), 0);
  await N.context().close();

  // Small phones: the top bar fits with four icons, no page scrolls sideways.
  for (const width of [360, 320]) {
    const small = await phone(backend, "correction", { ...PHONE, viewport: { width, height: 700 } });
    await visible(small.getByRole("button", { name: "Owner: the whole business" }));
    expect(await topFits(small), `top bar at ${width} px`).toBe(true);
    await small.getByRole("button", { name: "Owner: the whole business" }).click();
    for (const tab of ["Now", "Today", "Team", "Business"]) {
      await small.getByRole("button", { name: tab, exact: true }).click();
      await visible(small.locator(".boss-card").first());
      expect(await small.evaluate(() => document.documentElement.scrollWidth), `${tab} at ${width} px`).toBeLessThanOrEqual(width);
      await shot(small, `boss09-${tab.toLowerCase()}-${width}px`, true);
    }
    await small.getByRole("button", { name: "Progress", exact: true }).click();
    await small.getByRole("button", { name: /^Grade 7:/ }).click();
    await small.getByRole("button", { name: "Malik: his whole sheet" }).click();
    await visible(small.locator(".sr-sheet .sr-unit.cur"));
    expect(await small.evaluate(() => document.documentElement.scrollWidth), `sheet at ${width} px`).toBeLessThanOrEqual(width);
    await shot(small, `boss10-sheet-${width}px`);
    await small.context().close();
  }
  expect(problems, problems.join("\n")).toEqual([]);
});

/** The simulation's steps, by hand (the run-throughs make it `manual`: no steps of its own). */
async function simStep(backend: ReturnType<typeof makeBackend>, n = 1) {
  const play = await backend.t.run(async (ctx) => (await ctx.db.query("simPlay").collect())[0]);
  for (let i = 0; i < n; i++) await backend.t.mutation(internal.sim.tick, { simId: play.simId, chain: play.chain, manual: true });
  await backend.push();
}

test("Simulation: the owner starts it, a teacher joins from the banner, the app sends whom she calls, the Owner page shows her numbers", async () => {
  const backend = await newClass();
  const O = await phone(backend, "evaluation");
  const NILA = "nila-eval-token-0123456789abcdefghijklmnopqrstuvw";
  await addPerson(backend.t, { name: "Nila", token: NILA, tabs: ["evaluation", "theory"] });
  const N = await phone(backend, "evaluation", PHONE, NILA);

  // Settings → Students → Simulation (owner): Hard, 10 students, 30 minutes.
  await O.getByRole("button", { name: "Settings" }).click();
  const sim = O.locator("section.sim");
  await contains(sim, "Books it uses: Grade 7 (1 workbook) · Grade 11 (1 theory book).");
  await sim.getByRole("button", { name: "Hard", exact: true }).click();
  await contains(sim.locator(".sim-words").first(), "Theory books and workbooks, every grade");
  await sim.getByRole("button", { name: "10 students", exact: true }).click();
  await sim.getByRole("button", { name: "30 minutes", exact: true }).click();
  await sim.scrollIntoViewIfNeeded();
  await shot(O, "s01-sim-settings");
  await sim.getByRole("button", { name: "Start: 10 students · Hard · 30 min" }).click();
  await contains(O.locator(".toast"), "Simulation started: 10 students (Grade 7, 11). This phone shows it now.");
  // The run-through takes the steps itself.
  await backend.t.run(async (ctx) => {
    for (const x of await ctx.db.query("sims").collect()) await ctx.db.patch(x._id, { manual: true });
  });
  await visible(O.locator(".app.test-mode"));
  await contains(O.locator(".top-stat .clock"), "SIM");
  await contains(sim.locator(".sim-now"), "Running · Hard · 10 students");
  await count(O.locator(".plain-list .demo-tag", { hasText: "Sim" }), await O.locator(".plain-list > li").count());
  await shot(O, "s02-sim-running");
  expect(await O.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // Nila's phone shows the class: the banner, one tap and she is in it.
  await contains(N.locator(".sim-banner"), "Simulation on: Hard · 10 students");
  await shot(N, "s03-join-banner");
  await N.locator(".sim-banner").click();
  await visible(N.locator(".app.test-mode"));
  await count(N.locator(".sim-banner"), 0);
  await says(N.locator(".evx-foot .sc-lbl"), "Practice"); // drawn in capitals: read as written

  // Her page offers the most urgent; she calls them.
  await visible(N.locator(".evx-sp.s-sug"));
  if ((await N.locator(".evx-sp.s-sug.on").count()) === 0) await N.locator(".evx-sp.s-sug").first().click();
  await until(async () => /Call [1-9]/.test(await evCall(N).innerText()), "someone to call");
  await evCall(N).click();
  const called = await backend.t.run(async (ctx) => (await ctx.db.query("calls").collect()).filter((c) => c.status === "requested"));
  expect(called.length).toBeGreaterThan(0);
  expect(called.every((c) => c.test && c.teacher === "Nila")).toBe(true);
  const names = await backend.t.run(async (ctx) => {
    const out: string[] = [];
    for (const c of called) out.push((await ctx.db.get(c.studentId))!.name);
    return out;
  });
  // The app plays Correction: it sends them a little later (here: their calls made a minute ago, one step).
  await backend.t.run(async (ctx) => {
    for (const c of called) await ctx.db.patch(c._id, { createdAt: c.createdAt - 60_000 });
  });
  await simStep(backend);
  for (const n of names) await until(async () => /\bs-walk\b/.test((await evPill(N, n).getAttribute("class")) ?? ""), `${n} on the way`);
  await shot(N, "s04-sent-by-the-app");
  await evArrive(N, names);
  // Explained, question by question, for everyone with her; then Done.
  for (let i = 0; i < 40 && (await N.locator(".evx-sp.s-done").count()) < names.length; i++) {
    await N.locator(".evx-x").click();
    await N.waitForTimeout(450);
  }
  await contains(evDone(N), `Done ${names.length}`);
  await evDone(N).click();
  await contains(N.locator(".toast"), "back to work");
  await simStep(backend, 2);

  // The Owner page → Sim: Nila's numbers, where the work waits, what happened.
  await O.getByRole("button", { name: /^Owner/ }).click();
  await O.locator(".boss-tabs").getByRole("button", { name: /^Simulation/ }).click();
  const t = O.locator(".sim-t", { hasText: "Nila" });
  await contains(t, "Evaluation");
  await contains(t, "explained");
  await contains(t, `Called ${names.length}`);
  await contains(O.locator(".sim-head"), "Simulation · Hard · 10 students");
  await visible(O.locator(".sim-feed li", { hasText: "Nila" }));
  await shot(O, "s05-boss-sim");
  await shot(O, "s05-boss-sim-full", true);
  for (const width of [360, 320]) {
    const small = await phone(backend, "evaluation", { ...PHONE, viewport: { width, height: 740 } });
    await small.getByRole("button", { name: /^Owner/ }).click();
    await small.locator(".boss-tabs").getByRole("button", { name: /^Simulation/ }).click();
    await visible(small.locator(".sim-t", { hasText: "Nila" }));
    expect(await small.evaluate(() => document.documentElement.scrollWidth), `Sim tab at ${width} px`).toBeLessThanOrEqual(width);
    expect(await topFits(small), `top bar at ${width} px`).toBe(true);
    await shot(small, `s06-boss-sim-${width}px`, true);
    await small.context().close();
  }

  // End now (the Owner page): everyone goes home; the scoreboard stays. Nila's phone: back to the class.
  await O.locator(".sim-head").getByRole("button", { name: "End now" }).click();
  await O.locator(".sheet").getByRole("button", { name: "End it" }).click();
  await contains(O.locator(".toast"), "The simulation ended.");
  await contains(O.locator(".sim-head .sim-st"), "Ended");
  await visible(O.locator(".sim-head").getByRole("button", { name: "Start another simulation" }));
  await contains(N.locator(".sim-banner.over"), "The simulation is over.");
  await N.locator(".sim-banner.over").click();
  await count(N.locator(".app.test-mode"), 0);
  const left = await backend.t.run(async (ctx) => (await ctx.db.query("students").collect()).filter((x) => x.test && x.present).length);
  expect(left).toBe(0);
  await N.context().close();
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Theory and Evaluation in every situation (the old test class's students, a fixture); only a phone showing the simulation sees them", async () => {
  const backend = await newClass();
  const O = await phone(backend, "evaluation");
  await O.getByRole("button", { name: "Settings" }).click();
  await O.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(O.getByText(/^14 demo students loaded/));
  // The real class here; the fixture adds a test student for every situation, two in the owner's Evaluation room.
  await backend.t.run(async (ctx) => {
    for (const x of await ctx.db.query("students").collect()) await ctx.db.patch(x._id, { demo: false });
    const owner = (await ctx.db.query("users").collect()).find((u) => u.role === "owner")!;
    await makeCases(ctx, owner);
  });
  await backend.push();
  const NILA = "nila-eval-token-0123456789abcdefghijklmnopqrstuvw";
  await addPerson(backend.t, { name: "Nila", token: NILA, tabs: ["evaluation", "theory"] });
  const N = await phone(backend, "evaluation", PHONE, NILA);

  // This phone shows the simulation's class (Settings → Account): SIM in the top bar.
  await O.getByRole("button", { name: "Account", exact: true }).click();
  await O.locator(".sim-switch").getByRole("button", { name: /^Simulation/ }).click();
  await visible(O.locator(".app.test-mode"));
  await contains(O.locator(".top-stat .clock"), "SIM");
  await contains(O.locator(".sim-switch .segc-b.simb"), "Simulation (32)");
  await O.getByRole("button", { name: "Students", exact: true }).click();
  await O.getByRole("button", { name: /^Grade 11\b/ }).click();
  await visible(O.locator(".tcl-case", { hasText: "Theory: needs section D, no work for 6 min" }));
  await shot(O, "x01-test-class-settings");
  await O.getByRole("button", { name: "Back to the class" }).click();

  // Evaluation: two of them are in her room already (one with her, one called), so the 7 who lost Q2 get 4 ticks.
  await visible(evPill(O, "In Eval D").and(O.locator(".s-in")));
  await visible(evPill(O, "Eval called").and(O.locator(".s-call")));
  await evPick(O, { grade: "7", stage: "Master", unit: "8", group: "2" });
  await count(O.locator(".evx-sp.s-sug"), 7);
  await count(O.locator(".evx-sp.s-sug.on"), 4);
  await contains(evCall(O), "Call 4"); // room for 4 (with someone with her the line says when she is free instead)
  await shot(O, "x02-test-class-evaluation");
  // Theory: D first (Starving D has waited 25 minutes), held students listed but not ticked.
  await tab(O, "Theory").click();
  await evPick(O, { grade: "11", stage: "Fighter", unit: "13", group: "D" });
  await until(async () => (await namesOf(O.locator(".evx-sp.s-sug")))[0] === "Starving D", "Starving D first");
  await count(O.locator(".evx-sp.s-sug.on"), 6);
  expect(await evOffer(O, "Home soon").getAttribute("aria-pressed")).toBe("false");
  await contains(evOffer(O, "Home soon"), "home");
  await contains(evOffer(O, "In Eval D"), "Eval");
  await shot(O, "x03-test-class-theory");

  // Nila's phone shows the class: no test student anywhere. Her Settings offer the switch.
  await evPick(N, { grade: "7", stage: "Master", unit: "8" });
  await count(N.locator('.evx-sp[data-name="Crowd 1"]'), 0);
  await count(N.locator(".app.test-mode"), 0);
  await N.getByRole("button", { name: "Settings" }).click();
  await N.getByRole("button", { name: "Account", exact: true }).click();
  await shot(N, "x04-test-class-switch");
  await N.locator(".sim-switch").getByRole("button", { name: /^Simulation/ }).click();
  await visible(N.locator(".app.test-mode"));
  await N.getByRole("button", { name: "Back to the class" }).click();
  // In her own room (empty), the 7 who lost Q2: 6 ticked, never more (his number).
  await evPick(N, { grade: "7", stage: "Master", unit: "8", group: "2" });
  await count(N.locator(".evx-sp.s-sug"), 7);
  await count(N.locator(".evx-sp.s-sug.on"), 6);
  await contains(N.locator(".evx-bh"), "room for 6");
  await N.context().close();

  // The same mistake by 7 (Q2 of unit 8): one Theory lesson instead of explaining it 7 times (1 Nov 2026). Her room is
  // busy (Grade 11), so the card shows Q2 to prepare, with the suggestion; one tap sends Q2 to Theory for all 7, and
  // Theory sees them as one lesson.
  await tab(O, "Evaluation").click();
  await evPick(O, { grade: "7", stage: "Master", unit: "8", group: "2" });
  const tl = O.locator(".evx-card .evx-tl");
  await contains(tl, "7 lost Q2: teach it once in Theory?");
  await shot(O, "x05-same-mistake");
  await tl.getByRole("button", { name: "All 7 to Theory" }).click();
  await contains(O.locator(".toast"), "Sent to Theory: Q2 for 7.");
  await tab(O, "Theory").click();
  await evPick(O, { grade: "7", stage: "Master", unit: "8" });
  await visible(O.locator(".evx-qg").filter({ hasText: "×7" }));

  // The owner deletes them (Settings → Students → Simulation): only test students go; this phone shows the class again.
  await O.getByRole("button", { name: "Settings" }).click();
  await O.locator("section.sim").getByRole("button", { name: "Delete the 32 made-up students" }).click();
  await O.locator(".sheet").getByRole("button", { name: "Delete them" }).click();
  await contains(O.locator(".toast"), "Deleted 32 made-up students. This phone shows the class again.");
  await count(O.locator(".app.test-mode"), 0);
  const left = await backend.t.run(async (ctx) => (await ctx.db.query("students").collect()).map((x) => ({ name: x.name, test: !!x.test })));
  expect(left.filter((x) => x.test)).toEqual([]);
  expect(left).toHaveLength(14);
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Topic tute: one zip = the unit's theory book and workbook, both answer keys, every question as printed", async () => {
  const backend = await newClass();
  const C = await phone(backend, "focus");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));

  // The FAKE tute as the essay engine files it (under Grade 11's Constructions, U23): the upload puts it in OL (3 Nov
  // 2026, his rule: an O/L tute is an OL book), on its topic of Paper II B by name, even with Grade 11 picked on the page.
  const json = JSON.parse(TUTE_JSON);
  json.unit = { no: 23, code: "U23", en: "Constructions", ta: "அமைப்புகள்" };
  const zip = Buffer.from(zipSync({ "book.html": strToU8(TUTE_BOOK), "tute.json": strToU8(JSON.stringify(json)), "content.py": strToU8("") }));
  await C.getByRole("button", { name: "Books", exact: true }).click();
  await C.getByRole("button", { name: /^Grade 11\b/ }).click();
  await C.locator(".upload-btn input[type=file]").setInputFiles([{ name: "Constructions_tute_source.zip", mimeType: "application/zip", buffer: zip }]);
  const up = C.locator(".sheet");
  await contains(up.locator(".up-new"), "OL · 08 Constructions · topic tute");
  await contains(up.locator(".up-new"), "Theory book: A–B, 5 questions (2 with the teacher) · Workbook: Paper II B 6–8, 3 levels, 30 marks");
  await contains(up.locator(".up-new .up-state"), "New: theory book + workbook");
  await contains(up.locator(".up-new"), "✓ Answer keys: ladder all 5 · past papers all 3");
  await contains(up.locator(".up-new"), "✓ Questions as printed: ladder all 5 · past papers all 3");
  await textsAre(up.locator(".ol-pick.on"), ["08 Constructions"]);
  await shot(C, "t01-upload-tute");
  await contains(up.locator("h2"), "1 tute found");
  await up.getByRole("button", { name: "Save 1 tute" }).click();
  await contains(C.locator(".toast"), "Saved OL · 08 Constructions · topic tute: its theory book and workbook, with their answer keys");
  const u49 = C.locator(".unit-list li", { hasText: "Constructions" }); // the page went to OL by itself
  await textsAre(u49.locator("i.has"), ["F", "M", "K", "Q"]);
  const counts = await backend.t.run(async (ctx) => {
    const u = (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "OL-U49")).first())!;
    const books = await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", u._id)).collect();
    return books.map((b) => [b.stage, b.keyCount, b.qCount]).sort();
  });
  expect(counts).toEqual([
    ["fighter", 5, 5],
    ["master", 3, 3],
  ]);
  await shot(C, "t02-books-ol", true);

  // A Grade 11 student moved onto its theory book (as Correction's units sheet → OL books does), nothing taught yet (his
  // screenshot, 1 Nov: "That's every question he can do now" and nothing to see): Correction shows the whole book by
  // section, every question with its answer; Q2 opens (his first not right), its section's teacher question not taught.
  const { kumar, kumarId, ol49 } = await backend.t.run(async (ctx) => {
    const s = (await ctx.db.query("students").collect()).find((x) => x.grade === 11 && x.present && x.stage === "fighter")!;
    const u = (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "OL-U49")).first())!;
    return { kumar: s.name, kumarId: s._id, ol49: u._id };
  });
  await backend.t.mutation(api.students.move, { token: OWNER_TOKEN, id: kumarId, grade: 12, term: 4, stage: "fighter", unitId: ol49 });
  await backend.push();
  await C.getByRole("button", { name: "Back to the class" }).click();
  await C.locator(".fc-grades").getByRole("button", { name: /^Grade 11\b|^11\b/ }).first().click();
  await C.locator(".fc-nm", { hasText: new RegExp(`^${kumar}`) }).first().click();
  const card = C.locator(".fc-card.fighter");
  await contains(card.locator(".fc-qmeta"), "Section A · First part");
  await contains(card, "Section A's teacher questions aren't taught yet");
  await contains(card.locator(".fc-ans .ka-h"), "A1 B2");
  await textsAre(C.locator(".fc-secbar .fc-lb"), ["A", "B"]);
  await textsAre(C.locator(".fc-strip .fc-sq small"), ["1", "2"]);
  // Section B: one tap opens its first question (its teacher question not taught: Q4, the first he can do, or Q3).
  await C.locator(".fc-secbar").getByRole("button", { name: /^Section B/ }).click();
  await textsAre(C.locator(".fc-strip .fc-sq small"), ["3", "4", "5"]);
  await C.locator(".fc-secbar").getByRole("button", { name: /^Section A/ }).click();
  await textsAre(C.locator(".fc-strip .fc-sq small"), ["1", "2"]);
  // Q1, the teacher question: its answer, and the pad stays in place but marks nothing (Theory teaches it).
  await C.locator(".fc-strip .fc-sq").first().click();
  await contains(card, "Teacher question (Theory teaches it): not taught yet.");
  await textsAre(card.locator(".fc-ans .fc-pl"), ["i", "ii"]);
  await textsAre(card.locator(".fc-ans .ka-h"), ["3", "4"]);
  expect(await C.locator(".fc-pad .fc-n.wrong").isDisabled()).toBe(true);
  await shot(C, "t03a-correction-teacher-question");
  // Its other book (the past papers) sits beside it; one tap opens it with its answers, and he stays on the ladder.
  await C.locator(".fc-bk", { has: C.locator("b.st-master") }).click();
  await contains(C.locator(".fc-card").first(), "முதல் விடை");
  await shot(C, "t03b-correction-tute-papers");
  expect(await backend.t.run(async (ctx) => (await ctx.db.query("students").collect()).find((x) => x.name === kumar)!.stage)).toBe("fighter");
  await C.locator(".fc-bk", { has: C.locator("b.st-fighter") }).click();
  await visible(C.locator(".fc-card.fighter"));
  await C.locator(".fc-strip .fc-sq").nth(1).click();
  await contains(card.locator(".fc-ans .ka-h"), "A1 B2");
  const toggle = card.getByRole("button", { name: /^Show .+ as printed$/ });
  await toggle.click();
  await until(
    async () => (await card.locator(".bq-view").evaluate((el) => el.shadowRoot?.querySelector(".qv .qs")?.textContent ?? "")).includes("மாதிரி வினா இரண்டு"),
    "the printed question in its shadow root",
  );
  const fits = await card.locator(".bq-view").evaluate((el) => {
    const box = el.shadowRoot!.querySelector(".qv") as HTMLElement;
    const fig = el.shadowRoot!.querySelector(".dg") as HTMLElement;
    return { fits: box.scrollWidth <= box.clientWidth + 1, zoom: fig.style.zoom, footer: !!el.shadowRoot!.querySelector(".fl, .fc, .fr, .tab") };
  });
  expect(fits.fits).toBe(true); // the 150 mm figure shrinks to the phone
  expect(Number(fits.zoom)).toBeLessThan(1);
  expect(fits.footer).toBe(false);
  expect(await C.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(C, "t03-correction-fighter-question");

  // Class's view of the opened question stays unstyled by the book (its CSS lives only in the shadow root).
  expect(await C.locator(".fc-qn").first().evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgb(17, 17, 17)");

  // Theory teaches section A from teaching mode (3 Nov 2026): its teacher question as printed, larger than on the card
  // and still inside the phone, then its answer big.
  const T = await phone(backend, "theory");
  await evPick(T, { grade: "OL", stage: "Fighter", unit: "49", group: "A" });
  await contains(T.locator(".evx-card .fc-qn"), "1");
  await T.locator(".evx-card .fc-tmb").click();
  const tq = T.locator(".tm .tm-q .bq-view");
  await until(
    async () => (await tq.evaluate((el) => el.shadowRoot?.querySelector(".qv")?.textContent ?? "")).trim().length > 0,
    "the printed question in teaching mode",
  );
  const big = await tq.evaluate((el) => {
    const box = el.shadowRoot!.querySelector(".qv") as HTMLElement;
    return { zoom: Number(getComputedStyle(el).zoom), fits: box.scrollWidth <= box.clientWidth + 1, right: el.getBoundingClientRect().right };
  });
  expect(big.zoom).toBeGreaterThan(1);
  expect(big.fits).toBe(true);
  expect(big.right).toBeLessThanOrEqual(390);
  await textsAre(T.locator(".tm .fc-ans .ka-h"), ["3", "4"]);
  expect(await T.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(T, "t11-teaching-mode-printed");
  expect(problems.filter((x) => !x.includes("[focus warning]"))).toEqual([]);
});

test("OL: the O/L books by paper part; a tute filed under its topic; a Grade 11 student given one, or the whole OL", async () => {
  const backend = await newClass();
  const C = await phone(backend, "focus");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));

  // Books: OL after 11 in the grade row; its 53 topics under the four parts, numbered as on his tracker sheet.
  await C.getByRole("button", { name: "Books", exact: true }).click();
  await C.locator(".grade-row").getByRole("button", { name: /^OL\b/ }).click();
  await textsAre(C.locator(".settings-body .block-title"), [
    "பகுதி 1A · Paper I · Part A",
    "பகுதி 1B · Paper I · Part B",
    "பகுதி 2A · Paper II · Part A",
    "பகுதி 2B · Paper II · Part B",
  ]);
  const u44 = C.locator(".unit-list li", { hasText: "Simultaneous equations" });
  await contains(u44.locator("b"), "03");
  await contains(C.locator(".unit-list li", { hasText: "Sets and probability" }).locator("b"), "12");
  const json = JSON.parse(TUTE_JSON);
  json.grade = "OL";
  json.unit = { no: 44, code: "U44", en: "Simultaneous equations", ta: "ஒருங்கமை சமன்பாடு" };
  json.master.part = "IIA";
  const zip = Buffer.from(zipSync({ "book.html": strToU8(TUTE_BOOK), "tute.json": strToU8(JSON.stringify(json)), "content.py": strToU8("") }));
  await C.locator(".upload-btn input[type=file]").setInputFiles([{ name: "Simultaneous_tute_source.zip", mimeType: "application/zip", buffer: zip }]);
  await contains(C.locator(".sheet .up-new"), "OL · 03 Simultaneous equations · topic tute");
  await C.locator(".sheet").getByRole("button", { name: "Save 1 tute" }).click();
  await contains(C.locator(".toast"), "Saved OL · 03 Simultaneous equations · topic tute");
  await textsAre(u44.locator("i.has"), ["F", "M", "K", "Q"]);
  await shot(C, "o01-books-ol");
  const narrow = await phone(backend, "focus", { ...PHONE, viewport: { width: 320, height: 640 } });
  await narrow.getByRole("button", { name: "Settings" }).click();
  await narrow.getByRole("button", { name: "Books", exact: true }).click();
  const row = narrow.locator(".grade-row");
  await shot(narrow, "o02-books-grade-row-320");
  const fit = await row.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth, h: Math.round(el.getBoundingClientRect().height), n: el.children.length }));
  expect(fit.sw <= fit.cw + 1 && fit.h < 70, `seven grades in one row at 320 px: ${JSON.stringify(fit)}`).toBe(true);

  // Correction: a Grade 11 student's units sheet → OL books: the four parts; the whole OL in one tap (only the books in
  // the app: Simultaneous equations); then he moves onto it and stays Grade 11.
  await C.getByRole("button", { name: "Back to the class" }).click();
  await C.locator(".fc-grades").getByRole("button", { name: /^Grade 11\b|^11\b/ }).first().click();
  const kumar = await backend.t.run(async (ctx) => (await ctx.db.query("students").collect()).find((x) => x.grade === 11 && x.present)!.name);
  await C.locator(".fc-nm", { hasText: new RegExp(`^${kumar}`) }).first().click();
  await C.waitForTimeout(420);
  await C.locator(".fc-units").click();
  await C.locator(".su-olb").click();
  const parts = ["பகுதி 1A · Paper I · Part A", "பகுதி 1B · Paper I · Part B", "பகுதி 2A · Paper II · Part A", "பகுதி 2B · Paper II · Part B"];
  await until(async () => JSON.stringify(await C.locator(".su-tl > span").allTextContents()) === JSON.stringify(parts), "the four parts"); // drawn in capitals
  await visible(C.locator(".su-olb", { hasText: "Grade 11 ›" }));
  await C.locator(".sheet .su-st.master").click();
  await C.locator(".sheet").getByRole("button", { name: "Books given" }).click();
  await C.locator(".su-olall", { hasText: "Give him every OL workbook in the app (1)" }).click();
  await contains(C.locator(".toast"), `${kumar}: 1 OL workbook given.`);
  await visible(C.locator(".su-olall", { hasText: "Take back every OL workbook (1)" }));
  await shot(C, "o03-units-sheet-ol");
  await C.locator(".sheet").getByRole("button", { name: "Move him" }).click();
  await C.locator(".su-p", { hasText: "ஒருங்கமை சமன்பாடு" }).click();
  await contains(C.locator(".toast"), `${kumar}: Master · OL 3 ஒருங்கமை சமன்பாடு.`);
  const s = await backend.t.run(async (ctx) => {
    const st = (await ctx.db.query("students").collect()).find((x) => x.name === kumar)!;
    const u = (await ctx.db.get(st.unitId!))!;
    return [st.grade, st.stage, u.key];
  });
  expect(s).toEqual([11, "master", "OL-U44"]);
  expect(problems.filter((x) => !x.includes("warning]"))).toEqual([]);
});

test("OL: a tute an older upload left on Grade 11 goes to OL with its students: by uploading it again, or Move on its sheet", async () => {
  const backend = await newClass();
  const C = await phone(backend, "focus");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));

  // His situation (3 Nov 2026): the essay engine writes "grade": 11, so his Constructions and Sets tutes sat on Grade
  // 11's U23 and U24, a student worked in one of them, and nothing could take them off.
  const zipOf = (no: number, en: string, ta: string) => {
    const json = JSON.parse(TUTE_JSON);
    json.unit = { no, code: `U${no}`, en, ta };
    json.title = ta;
    return zipSync({ "book.html": strToU8(TUTE_BOOK), "tute.json": strToU8(JSON.stringify(json)), "content.py": strToU8("") });
  };
  const unitOf = async (key: string) => await backend.t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
  const oldUpload = async (no: number, en: string, ta: string) => {
    const [r] = readWorkbookFiles([{ name: `${en}_tute_source.zip`, bytes: zipOf(no, en, ta) }]) as ReadTute[];
    const unitId = await unitOf(`G11-U${no}`);
    await backend.t.mutation(api.catalog.saveTute, {
      token: OWNER_TOKEN,
      unitId,
      title: r.title!,
      fighter: { sections: r.fighter.sections.map((x) => ({ id: x.id, title: x.title, tamil: x.tamil, teach: x.teach, solo: x.solo })) },
      master: { part: r.part, levels: r.master.levels.map((l) => ({ from: l.from, to: l.to, max: l.max })), marks: r.master.marks! },
      fighterKey: r.fighterKey!,
      masterKey: r.masterKey!,
    });
    for (const stage of ["fighter", "master"] as const) {
      await backend.t.mutation(api.catalog.saveQuestions, { token: OWNER_TOKEN, unitId, stage, first: true, css: r.css, items: [...r.questions[stage]].map(([q, html]) => ({ q, html })) });
    }
    return unitId;
  };
  const g23 = await oldUpload(23, "Constructions", "அமைப்புகள்");
  await oldUpload(24, "Sets", "தொடைகள்");
  const kumar = await backend.t.run(async (ctx) => (await ctx.db.query("students").collect()).find((x) => x.grade === 11 && x.present && x.stage === "fighter")!);
  await backend.t.mutation(api.students.move, { token: OWNER_TOKEN, id: kumar._id, grade: 11, term: 3, stage: "fighter", unitId: g23 });
  await backend.t.run(async (ctx) => {
    const now = Date.now();
    const marks = { "2": { s: "right" as const, t: now } };
    const p = await ctx.db
      .query("progress")
      .withIndex("by_student_unit_stage", (q) => q.eq("studentId", kumar._id).eq("unitId", g23).eq("stage", "fighter"))
      .first();
    if (p) await ctx.db.patch(p._id, { marks });
    else await ctx.db.insert("progress", { studentId: kumar._id, unitId: g23, stage: "fighter", marks, startedAt: now, updatedAt: now });
  });
  await backend.push();

  // 1. He uploads the zip again with OL picked: it goes to OL · 08 Constructions and takes the Grade 11 copy off, with
  //    his student's work.
  await C.getByRole("button", { name: "Books", exact: true }).click();
  await C.locator(".grade-row").getByRole("button", { name: /^OL\b/ }).click();
  await C.locator(".upload-btn input[type=file]").setInputFiles([
    { name: "Constructions_tute_source.zip", mimeType: "application/zip", buffer: Buffer.from(zipOf(23, "Constructions", "அமைப்புகள்")) },
  ]);
  const up = C.locator(".sheet .up-new");
  await contains(up, "OL · 08 Constructions · topic tute");
  await contains(up.locator(".up-state"), "New: theory book + workbook");
  await contains(up, "↪ Takes it off Grade 11 · U23 Constructions: its students' work comes too.");
  await textsAre(up.locator(".ol-pick"), [
    "07 Arithmetic and geometric progressions",
    "08 Constructions",
    "09 Volume and logarithms",
    "10 Theorems on rectilinear plane figures",
    "11 Circle theorems",
    "12 Sets and probability",
  ]);
  await textsAre(up.locator(".ol-pick.on"), ["08 Constructions"]);
  expect(await C.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(C, "o11-upload-moves-off-grade11");
  await C.locator(".sheet").getByRole("button", { name: "Save 1 tute" }).click();
  await contains(C.locator(".toast"), "Saved OL · 08 Constructions · topic tute: its theory book and workbook, with their answer keys. Taken off Grade 11 · U23 Constructions.");
  await textsAre(C.locator(".unit-list li", { hasText: "Constructions" }).locator("i.has"), ["F", "M", "K", "Q"]);
  const after = await backend.t.run(async (ctx) => {
    const s = (await ctx.db.get(kumar._id))!;
    const u = (await ctx.db.get(s.unitId!))!;
    const rows = await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", kumar._id)).collect();
    const left = await ctx.db.query("books").withIndex("by_unit_stage", (q) => q.eq("unitId", g23)).collect();
    return { at: [u.key, s.grade, s.stage], mark: rows.find((p) => p.unitId === s.unitId && p.stage === "fighter")?.marks["2"]?.s, left: left.length };
  });
  expect(after).toEqual({ at: ["OL-U49", 11, "fighter"], mark: "right", left: 0 });

  // 2. Or on the unit's own sheet (a 320 px phone): Grade 11 → U24 Sets → Move to OL, its topic picked by name, two taps.
  const N = await phone(backend, "focus", { ...PHONE, viewport: { width: 320, height: 640 } });
  await N.getByRole("button", { name: "Settings" }).click();
  await N.getByRole("button", { name: "Books", exact: true }).click();
  await N.getByRole("button", { name: /^Grade 11\b/ }).click();
  await N.locator(".unit-list li", { hasText: "U24" }).getByRole("button").click();
  const sheet = N.locator(".sheet");
  await says(sheet.locator(".ol-move .block-title"), "This is an O/L tute: move it to OL");
  await textsAre(sheet.locator(".ol-pick.on"), ["12 Sets and probability"]);
  expect(await N.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(N, "o12-unit-sheet-move-320");
  await sheet.getByRole("button", { name: "Move to OL · 12 Sets and probability" }).click();
  await sheet.getByRole("button", { name: "Yes: move it to OL · 12 Sets and probability" }).click();
  await contains(N.locator(".toast"), "Moved to OL · 12 Sets and probability: both books. Grade 11 · U24 has no book now.");
  const sets = N.locator(".unit-list li", { hasText: "Sets and probability" }); // the page went to OL
  await textsAre(sets.locator("i.has"), ["F", "M", "K", "Q"]);
  // On OL, a wrong topic is never for good: its sheet offers to move it on.
  await sets.getByRole("button").click();
  await visible(N.locator(".sheet").getByRole("button", { name: "Wrong topic? Move this tute" }));
  await shot(N, "o13-ol-sheet-wrong-topic-320");
  await N.locator(".sheet").getByRole("button", { name: "Close" }).click();
  // Grade 11's Constructions and Sets have no book left.
  await N.getByRole("button", { name: /^Grade 11\b/ }).click();
  await textsAre(N.locator(".unit-list li", { hasText: "U23" }).locator("i.has"), []);
  await textsAre(N.locator(".unit-list li", { hasText: "U24" }).locator("i.has"), []);
  expect(problems.filter((x) => !x.includes("warning]"))).toEqual([]);
});

test("Class tab: everyone's, the manager acts (arrived / went, send any student: one tap, tap-tap, drag); her phone calls her until Arrived; his day; check-ins; each teacher's card", async () => {
  const backend = await newClass();
  const SHANTHI = "shanthi-phone-token-0123456789abcdefghijklmnopq";
  const KAVI = "kavi-phone-token-0123456789abcdefghijklmnopqrstu";
  await addPerson(backend.t, { name: "Shanthi", token: SHANTHI, tabs: ["evaluation"] });
  await addPerson(backend.t, { name: "Meena", token: "meena-phone-token-0123456789abcdefghijklmnopqrs", tabs: ["theory"] });
  // The corrector who also manages (his hire, 3 Nov 2026): the Manager job ticked in People.
  await addPerson(backend.t, { name: "Kavi", token: KAVI, tabs: ["correction", "manager"] });
  await backend.t.mutation(api.setup.ensure, { token: OWNER_TOKEN });
  await backend.t.mutation(api.demo.load, { token: OWNER_TOKEN });
  // Real students (demo students never count in anyone's numbers: the teachers' cards below read them).
  await backend.t.run(async (ctx) => {
    for (const x of await ctx.db.query("students").collect()) await ctx.db.patch(x._id, { demo: false });
  });
  const M = await phone(backend, "focus", PHONE, KAVI);
  const S = await phone(backend, "evaluation", PHONE, SHANTHI);
  const room = (name: string) => M.locator(".mg2-room", { has: M.locator(".mg2-rn", { hasText: name }) });
  const hall = (name: string) => M.locator(`.mg2-p[data-name="${name}"]`);
  const inRoom = (r: string, name: string) => room(r).locator(`.mg2-sp[data-name="${name}"]`);
  const card = (p: Page) => p.locator(".sheet-wrap.tcard .sheet");

  // The Class tab is first in the bottom bar, for everyone (3 Nov 2026, his call: the Manager page moves there; named
  // Class, nobody is shown as "Manager"); no Manager button on the Correction page any more.
  await textsAre(M.locator(".tabs .tab > span:nth-child(2)"), ["Class", "Correction", "Us"]);
  await textsAre(S.locator(".tabs .tab > span:nth-child(2)"), ["Class", "Evaluation", "Us"]);
  await count(M.locator(".fc-mgr"), 0);
  // Its count while she is elsewhere: students in the hall with no work (the Register's icon has none any more).
  await visible(tab(M, "Class").locator(".tab-badge"));
  await count(M.locator(".top .class-btn .att-n"), 0);
  await tab(M, "Class").click();
  expect(await tab(M, "Class").getAttribute("aria-current")).toBe("page");

  // Nobody marked here yet: no rooms; the team line names them. The manager marks each arrived from her card.
  await contains(M.locator(".mg2-rooms .mg2-note"), "Nobody is marked here yet");
  await count(M.locator(".mg2-off"), 3);
  for (const n of ["Kavi", "Meena", "Shanthi"]) await contains(M.locator(".mg2-off", { hasText: n }), "not here");
  await M.locator(".mg2-off", { hasText: "Shanthi" }).click();
  await visible(card(M));
  await contains(card(M).locator(".sheet-title p"), "Not marked here: tap Arrived when she comes.");
  await shot(M, "m10-class-arrived");
  await card(M).locator(".tc-ctl").getByRole("button", { name: "Now" }).click();
  await contains(M.locator(".toast"), "Shanthi arrived ");
  await contains(card(M).locator(".sheet-title p"), "Arrived ");
  await card(M).getByRole("button", { name: "Close" }).click();
  await M.locator(".mg2-off", { hasText: "Meena" }).click();
  await card(M).locator(".tc-ctl").getByRole("button", { name: "15m ago" }).click();
  await contains(M.locator(".toast"), "Meena arrived ");
  await card(M).getByRole("button", { name: "Close" }).click();
  // Her own: Kavi marks herself (a corrector: her desk on the team line, a pen).
  await M.locator(".mg2-off", { hasText: "Kavi" }).click();
  await card(M).locator(".tc-ctl").getByRole("button", { name: "Now" }).click();
  await card(M).getByRole("button", { name: "Close" }).click();
  await textsAre(M.locator(".mg2-desk"), ["Kavi"]);
  await count(M.locator(".mg2-off"), 0);

  // The three numbers to bring down; a room per teacher (A–Z, both free); the hall A–Z, coloured by what waits.
  await textsAre(M.locator(".mg2-n span"), ["to correct", "to explain", "to teach"]);
  await contains(M.locator(".mg2-n.n-correct b"), "2"); // Malik's L3, Vimal's L8
  await textsAre(M.locator(".mg2-room .mg2-rn"), ["Meena", "Shanthi"]);
  await contains(room("Shanthi").locator(".mg2-rh span"), "free");
  await contains(room("Shanthi").locator(".mg2-sug"), "Evaluation · no work");
  await contains(room("Shanthi").locator(".mg2-sn"), "→ Vimal, Malik");
  await contains(room("Meena").locator(".mg2-sw"), "Theory D · no work");
  await textsAre(M.locator(".mg2-p"), ["Ahamed", "Dilan", "Fathima", "Kumar", "Malik", "Nila", "Priya", "Rizwan", "Sana", "Tharun", "Vimal", "Yasmin", "Zainab"]);
  for (const n of ["Fathima", "Rizwan", "Vimal"]) expect(await hall(n).getAttribute("class")).toContain("h-red");
  expect(await hall("Zainab").getAttribute("class")).toContain("off"); // on paper (Legend)
  // One screen: nothing scrolls, sideways or down (the hall scrolls inside itself when the class is big).
  const oneScreen = (p: Page) =>
    p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight + 1);
  expect(await oneScreen(M)).toBe(true);
  await shot(M, "m11-manager");

  // A number lights who it is: "to correct" = Malik and Vimal; again = all.
  await M.locator(".mg2-n.n-correct").click();
  await namesAre(M.locator(".mg2-p:not(.dim)"), ["Malik", "Vimal"]);
  await M.locator(".mg2-n.n-correct").click();
  await count(M.locator(".mg2-p.dim"), 0);

  // One tap on a free room sends what it suggests: Vimal and Malik walk to Shanthi (dashed); Undo; again.
  await room("Shanthi").click();
  await contains(M.locator(".toast"), "Vimal and Malik → Shanthi.");
  await textsAre(room("Shanthi").locator(".mg2-sp.s-walking"), ["Vimal", "Malik"]);
  await count(hall("Vimal"), 0);
  // Her phone calls her until she taps Arrived (they are on their way to her, she didn't call them).
  await hears(S, "Vimal and Malik are coming to you.");
  await visible(S.locator('.evx-sp.s-walk[data-name="Vimal"]'));
  await M.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await contains(M.locator(".toast"), "Taken back");
  await count(room("Shanthi").locator(".mg2-sp"), 0);
  await visible(hall("Vimal"));
  await room("Shanthi").click();
  await textsAre(room("Shanthi").locator(".mg2-sp.s-walking"), ["Vimal", "Malik"]);
  await contains(evArrived(S), "Arrived 2");
  await evArrived(S).click();
  await textsAre(room("Shanthi").locator(".mg2-sp.s-here"), ["Vimal", "Malik"]);
  await contains(room("Shanthi").locator(".mg2-rd"), "Evaluation");

  // Drag: hold Rizwan (no work, needs Theory C), move him onto Meena's room.
  const from = (await hall("Rizwan").boundingBox())!;
  const to = (await room("Meena").boundingBox())!;
  await M.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await M.mouse.down();
  await M.waitForTimeout(350);
  await visible(M.locator(".mg2-ghost", { hasText: "Rizwan" }));
  await M.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  expect(await room("Meena").getAttribute("class")).toContain("over");
  await M.mouse.up();
  await contains(M.locator(".toast"), "Rizwan → Meena.");
  await visible(inRoom("Meena", "Rizwan").and(M.locator(".s-walking")));
  // Meena has no phone today: tap him in her room, "He's with her".
  await inRoom("Meena", "Rizwan").click();
  await contains(M.locator(".mg2-strip .mg2-sl"), "on his way to Meena");
  await M.locator(".mg2-strip").getByRole("button", { name: "He's with her" }).click();
  await visible(inRoom("Meena", "Rizwan").and(M.locator(".s-here")));
  await contains(room("Meena").locator(".mg2-rd"), "Theory C");

  // Both teachers busy and Fathima has no work: she needn't sit. Give a book (Books given): the unit sheet opens there.
  await contains(M.locator(".toast"), "Rizwan is with Meena.");
  await hall("Fathima").click();
  await contains(M.locator(".mg2-strip .mg2-busy"), "Every teacher is busy: give him a book");
  await M.locator(".mg2-strip").getByRole("button", { name: "Give a book" }).click();
  const units = M.locator(".sheet", { has: M.locator(".sheet-title", { hasText: "Fathima: units" }) });
  await visible(units);
  expect(await units.locator(".su-modes .segc-b.on").textContent()).toMatch(/given/i);
  await shot(M, "m12b-manager-give-book");
  await units.getByRole("button", { name: "Close" }).click();
  await hall("Fathima").click(); // her strip closes

  // A teacher sees the same tab (his ask: "how many students stay without work in the hall") but can't send anyone:
  // no drag, no buttons on a student's strip; her own name opens her card; another teacher's room says what she does.
  // (The class began an hour ago and the teachers came 40 minutes ago: enough of a day to compare with the others.)
  await backend.t.run(async (ctx) => {
    for (const x of await ctx.db.query("sessions").collect()) if (x.open) await ctx.db.patch(x._id, { startedAt: Date.now() - 60 * 60_000 });
    for (const d of await ctx.db.query("duty").collect()) await ctx.db.patch(d._id, { inAt: Date.now() - 40 * 60_000 });
  });
  await backend.push();
  await tab(S, "Class").click();
  const sRoom = (name: string) => S.locator(".mg2-room", { has: S.locator(".mg2-rn", { hasText: name }) });
  await textsAre(S.locator(".mg2-room .mg2-rn"), ["Meena", "Shanthi"]);
  expect(await sRoom("Shanthi").getAttribute("class")).toContain("mine");
  await S.locator('.mg2-p[data-name="Priya"]').click();
  await contains(S.locator(".mg2-strip .mg2-sh b"), "Priya");
  await count(S.locator(".mg2-strip .mg2-acts"), 0);
  await sRoom("Meena").click();
  await contains(S.locator(".mg2-strip .mg2-sl"), "here since");
  await contains(S.locator(".mg2-strip .mg2-why"), "Rizwan: Theory");
  await count(card(S), 0);
  await sRoom("Shanthi").locator(".mg2-rn").click();
  await visible(card(S));
  await contains(card(S).locator(".sheet-title h2"), "Shanthi: your day");
  await count(card(S).locator(".tc-ctl"), 0); // the manager marks arrived / went, not her
  await until(async () => (await card(S).locator(".tc-tile").count()) === 3, "her three numbers");
  await textsAre(card(S).locator(".tc-tile span"), ["working", "free", "free while students waited"]);
  await visible(card(S).locator(".tc-track i.k-w"));
  await contains(card(S).locator(".tc-cmp h3"), "You and the others");
  expect(await oneScreen(S)).toBe(true);
  await shot(S, "m16-teacher-card");
  await card(S).getByRole("button", { name: "Close" }).click();
  // Never red for a teacher (his rule): nothing on her Class tab is drawn in red but the students with no work.
  const reds = await S.evaluate(() =>
    [...document.querySelectorAll(".mg2-room *, .mg2-room, .mg2-team *")].filter((e) => {
      const c = getComputedStyle(e);
      return [c.color, c.borderColor, c.backgroundColor].some((x) => x === "rgb(220, 35, 56)" || x === "rgb(163, 17, 42)");
    }).length,
  );
  expect(reds).toBe(0);

  // Tap-tap with his strip: Priya has nothing waiting: a check-in. Only Shanthi can take one (Meena: Theory only).
  // (Right after "He's with her": the answer arriving a moment later must not close Priya's strip.)
  await hall("Priya").click();
  const strip = M.locator(".mg2-strip");
  await contains(strip.locator(".mg2-sh b"), "Priya");
  await until(async () => (await strip.locator(".mg2-day i").count()) > 0, "her day as a bar");
  await contains(strip.locator(".mg2-dayt"), "no teacher yet");
  await textsAre(strip.locator(".mg2-to b"), ["→ Shanthi"]);
  await contains(strip.locator(".mg2-to small"), "busy · ~14m left"); // Vimal's 2 questions + Malik's 3, ~3 min each
  await shot(M, "m12-manager-strip");
  await strip.locator(".mg2-to").click();
  await contains(M.locator(".toast"), "Priya → Shanthi (check-in).");

  // Shanthi's phone: Done for Vimal and Malik (all explained); Priya's check-in: Arrived, the hint, Done.
  const ids = await backend.t.run(async (ctx) => {
    const calls = (await ctx.db.query("calls").collect()).filter((c) => c.status === "sent" && c.teacher === "Shanthi");
    const names = new Map((await ctx.db.query("students").collect()).map((s) => [s._id as string, s.name]));
    return calls.map((c) => ({ id: c._id, name: names.get(c.studentId)!, visit: !!c.visit }));
  });
  await backend.t.mutation(api.calls.finish, { token: SHANTHI, items: ids.filter((x) => !x.visit).map((x) => ({ callId: x.id, explained: [] })) });
  await backend.push();
  await until(async () => (await room("Shanthi").locator(".mg2-sp").count()) === 1, "only Priya left with Shanthi");
  await tab(S, "Evaluation").click();
  await evArrived(S).click();
  await contains(S.locator(".evx-hint"), "Check-in: Priya. Look at his book with him: how is it going? Then Done.");
  await shot(S, "m13-teacher-check-in");
  await evDone(S).click();
  await until(async () => (await room("Shanthi").locator(".mg2-sp").count()) === 0, "Shanthi free");
  const priya = await marksOf(backend, "Priya");
  expect(priya.seen?.evaluation).toBeGreaterThan(0);

  // A teacher free 6 minutes while work waits for her: her room goes amber (never red), knocking.
  await backend.t.run(async (ctx) => {
    for (const c of await ctx.db.query("calls").collect()) if (c.teacher === "Shanthi" && c.endedAt) await ctx.db.patch(c._id, { endedAt: Date.now() - 6 * 60_000 });
    for (const x of await ctx.db.query("sessions").collect()) if (x.open) await ctx.db.patch(x._id, { startedAt: Date.now() - 60 * 60_000 });
    for (const d of await ctx.db.query("duty").collect()) await ctx.db.patch(d._id, { inAt: Date.now() - 60 * 60_000 });
  });
  await backend.push();
  await until(async () => ((await room("Shanthi").getAttribute("class")) ?? "").includes("a-amber"), "Shanthi's room amber");
  await shot(M, "m14-manager-free-amber");

  // The manager reads anyone's card: Shanthi's, with Went and her arrival moved; her numbers (free while students
  // waited: yellow, never red).
  await room("Shanthi").locator(".mg2-rn").click();
  await visible(card(M));
  await contains(card(M).locator(".sheet-title h2"), "Shanthi");
  await visible(card(M).locator(".tc-ctl").getByRole("button", { name: "5 minutes earlier" }));
  await until(async () => (await card(M).locator(".tc-tile").count()) === 3, "her three numbers");
  await shot(M, "m17-manager-card");
  await card(M).getByRole("button", { name: "Close" }).click();

  // She forgot Done: tap him in her room, Back to the hall (twice: nothing gets marked).
  await inRoom("Meena", "Rizwan").click();
  await M.locator(".mg2-strip").getByRole("button", { name: "Back to the hall" }).click();
  await M.locator(".mg2-strip").getByRole("button", { name: "Yes: back, nothing marked" }).click();
  await visible(hall("Rizwan"));
  await contains(M.locator(".toast"), "Rizwan: back in the hall.");

  // Meena went home: her card, Went now (Undo on the message: here again); then went for good.
  await room("Meena").locator(".mg2-rn").click();
  await card(M).locator(".tc-ctl").getByRole("button", { name: "Now" }).click();
  await contains(M.locator(".toast"), "Meena went ");
  await card(M).getByRole("button", { name: "Close" }).click();
  await count(room("Meena"), 0);
  await contains(M.locator(".mg2-off", { hasText: "Meena" }), "went");
  await M.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await visible(room("Meena"));

  // The Correction tab: the Correction page, no Manager button; the Class tab comes back to the hall.
  await tab(M, "Correction").click();
  await visible(M.locator(".fc-namerow"));
  await count(M.locator(".mg2"), 0);
  await tab(M, "Class").click();
  await visible(M.locator(".mg2-room").first());

  // The owner teaches today (his switch in Settings → Account, his only): his room on the Class tab; a student sent to
  // him calls his phone on any page ("Open Evaluation" on the Correction page). Off: the room goes. Never on the team
  // line, never a card.
  const O = await phone(backend, "focus");
  await O.getByRole("button", { name: "Settings" }).click();
  await O.getByRole("button", { name: "Account", exact: true }).click();
  await O.locator(".teach-switch").getByRole("button", { name: "I'm teaching" }).click();
  await contains(O.locator(".toast"), "You teach today");
  await visible(room("Owner"));
  await O.getByRole("button", { name: "Settings" }).click(); // back to his Correction page
  await hall("Kumar").click();
  await room("Owner").click();
  await contains(M.locator(".toast"), "Kumar → Owner.");
  await hears(O, "Kumar is coming to you. Open Evaluation.");
  await M.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await O.getByRole("button", { name: "Settings" }).click();
  await O.getByRole("button", { name: "Account", exact: true }).click();
  await O.locator(".teach-switch").getByRole("button", { name: "Not teaching" }).click();
  await count(room("Owner"), 0);
  // The owner's own phone: four tabs in one row.
  await textsAre(O.locator(".tabs .tab > span:nth-child(2)"), ["Class", "Correction", "Theory", "Evaluation", "Us"]);
  await O.context().close();

  // Small phones: one screen, nothing sideways, the tabs in one row (the owner's four too).
  for (const width of [360, 320]) {
    const P = await phone(backend, "hall", { ...PHONE, viewport: { width, height: 640 } }, KAVI);
    await visible(P.locator(".mg2-room").first());
    expect(await oneScreen(P)).toBe(true);
    await shot(P, `m15-manager-${width}`);
    await P.context().close();
    const Q = await phone(backend, "hall", { ...PHONE, viewport: { width, height: 640 } });
    await visible(Q.locator(".mg2-room").first());
    expect(await oneScreen(Q)).toBe(true);
    const tabsFit = await Q.evaluate(() =>
      [...document.querySelectorAll(".tabs .tab > span:nth-child(2)")].every((e) => e.scrollWidth <= e.clientWidth + 1),
    );
    expect(tabsFit).toBe(true);
    await shot(Q, `m15b-owner-tabs-${width}`);
    await Q.context().close();
  }
  expect(problems.filter((p) => p.startsWith("[hall") || p.startsWith("[focus") || p.startsWith("[evaluation"))).toEqual([]);
});

test("Teacher card: a real day (working, free, free while students waited, the others, her week) on one screen; her own only", async () => {
  const backend = await newClass();
  const SHANTHI = "shanthi-phone-token-0123456789abcdefghijklmnopq";
  const KAVI = "kavi-phone-token-0123456789abcdefghijklmnopqrstu";
  await addPerson(backend.t, { name: "Shanthi", token: SHANTHI, tabs: ["evaluation"] });
  await addPerson(backend.t, { name: "Meena", token: "meena-phone-token-0123456789abcdefghijklmnopqrs", tabs: ["theory"] });
  await addPerson(backend.t, { name: "Kavi", token: KAVI, tabs: ["correction", "manager"] });
  await backend.t.mutation(api.setup.ensure, { token: OWNER_TOKEN });
  await backend.t.mutation(api.demo.load, { token: OWNER_TOKEN });
  const MIN = 60_000;
  // An hour and a half of class: Shanthi here 80 minutes, five students explained; Meena two lessons. While Shanthi
  // sat free (50 → 40 minutes ago) Malik waited for Evaluation with no work. Two earlier class days kept in reports.
  await backend.t.run(async (ctx) => {
    const now = Date.now();
    const at = (m: number) => now - m * MIN;
    const users = await ctx.db.query("users").collect();
    const id = (n: string) => users.find((u) => u.name === n)!._id;
    const students = await ctx.db.query("students").collect();
    for (const x of students) await ctx.db.patch(x._id, { demo: false, idleSince: undefined, idleReason: undefined });
    const sid = (n: string) => students.find((x) => x.name === n)!._id;
    const session = (await ctx.db.query("sessions").collect()).find((x) => x.open)!;
    await ctx.db.patch(session._id, { startedAt: at(90) });
    for (const x of await ctx.db.query("attendance").collect()) await ctx.db.patch(x._id, { inAt: at(90) });
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date(now));
    await ctx.db.insert("duty", { userId: id("Shanthi"), day, inAt: at(80), inBy: "Kavi", editedAt: at(80) });
    await ctx.db.insert("duty", { userId: id("Meena"), day, inAt: at(85), inBy: "Kavi", editedAt: at(85) });
    const visit = async (who: string, student: string, kind: "evaluation" | "theory", from: number, to: number, group: string) =>
      ctx.db.insert("calls", {
        studentId: sid(student),
        room: kind,
        kind,
        status: "done",
        group,
        createdAt: at(from + 1),
        sentAt: at(from + 1),
        walk: true,
        arrivedAt: at(from),
        endedAt: at(to),
        teacherId: id(who),
        teacher: who,
        sessionId: session._id,
      });
    await visit("Shanthi", "Vimal", "evaluation", 74, 68, "e1");
    await visit("Shanthi", "Sana", "evaluation", 62, 52, "e2");
    await visit("Shanthi", "Nila", "evaluation", 39, 31, "e3");
    await visit("Shanthi", "Kumar", "evaluation", 25, 18, "e4");
    await visit("Shanthi", "Priya", "evaluation", 12, 6, "e5");
    await visit("Meena", "Rizwan", "theory", 70, 50, "t1");
    await visit("Meena", "Fathima", "theory", 70, 50, "t1");
    await visit("Meena", "Dilan", "theory", 30, 12, "t2");
    await ctx.db.insert("events", { at: at(40), sessionId: session._id, kind: "idle", studentId: sid("Malik"), name: "Malik", ms: 10 * MIN, value: "evaluation" });
    // Two earlier class days (kept in their reports).
    for (const [ago, here, work, missed] of [
      [2, 120, 70, 12],
      [1, 110, 80, 0],
    ] as const) {
      const start = now - ago * 24 * 60 * MIN;
      const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date(start));
      const person = (name: string, uid: string, jobs: string[], room: string, h: number, w: number, m: number) => ({
        name, id: uid, jobs, room, min: { correction: 0, evaluation: room === "evaluation" ? w : 0, theory: room === "theory" ? w : 0 },
        levels: 0, checks: 0, marks: 0, visits: 6, lessons: room === "theory" ? 3 : 0, students: 6, hereMin: h, workMin: w, freeMin: h - w, missedMin: m,
      });
      await ctx.db.insert("sessions", {
        open: false,
        startedAt: start,
        endedAt: start + 2 * 60 * MIN,
        lastActivityAt: start + 2 * 60 * MIN,
        report: {
          digest: {
            v: 1,
            day: d,
            people: [
              person("Shanthi", id("Shanthi"), ["evaluation"], "evaluation", here, work, missed),
              person("Meena", id("Meena"), ["theory"], "theory", 120, 60, 20),
            ],
          },
        },
      });
    }
  });
  await backend.push();
  for (const width of [390, 360, 320]) {
    const S = await phone(backend, "hall", { ...PHONE, viewport: { width, height: width === 390 ? 844 : 640 } }, SHANTHI);
    const mine = S.locator(".mg2-room.mine .mg2-rn");
    await visible(mine);
    await mine.click();
    const c = S.locator(".sheet-wrap.tcard .sheet");
    await contains(c.locator(".sheet-title h2"), "Shanthi: your day");
    await until(async () => (await c.locator(".tc-tile").count()) === 3, "three numbers");
    // Working: from each call (he walks to her) to Done: 7 + 11 + 9 + 8 + 7 = 42; free 80 − 42 = 38; Malik waited for
    // Evaluation 50 → 40 minutes ago while she sat free from 52 (after her first 2 free minutes): 10.
    await until(async () => (await c.locator(".tc-tile b").allInnerTexts()).join() !== "", "numbers");
    expect(await c.locator(".tc-tile b").allInnerTexts()).toEqual(["42m", "38m", "10m"]);
    await contains(c.locator(".tc-tile.t-warn span"), "free while students waited");
    await contains(c.locator(".tc-done"), "5 students seen");
    await count(c.locator(".tc-days .tc-day"), 3);
    expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await shot(S, `m18-card-real-${width}`);
    // One screen: the card's body never scrolls.
    const [sh, ch, sheetH, vh] = await c.locator(".sheet-body").evaluate((e) => [e.scrollHeight, e.clientHeight, e.parentElement!.getBoundingClientRect().height, window.innerHeight]);
    console.log("CARD", width, sh, ch, sheetH, vh);
    expect(sh).toBeLessThanOrEqual(ch + 1);
    // Meena's room: what she is doing, never her card.
    await S.locator(".mg2-room", { has: S.locator(".mg2-rn", { hasText: "Meena" }) }).locator(".mg2-rn").click({ force: true }).catch(() => undefined);
    await S.context().close();
  }
});

test("Whole class: the top bar's whiteboard; any grade, book, section or level; ticked = saved for them; Taught for all at once, Undo; teaching mode; a corrector doesn't see it", async () => {
  const backend = await newClass();
  const C = await phone(backend, "correction");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  const T = await phone(backend, "theory");
  const marks = async (name: string) => (await marksOf(backend, name)).marks;

  // The top bar's whiteboard opens it: every grade can be tapped (6–11 and OL in one row); Grade 11 opens (most are in
  // it), Fighter, unit 13, and the first section someone still needs (B: Tharun).
  await T.getByRole("button", { name: /^Whole class/ }).click();
  const W = T.locator(".wc-page");
  await visible(W);
  await until(async () => JSON.stringify(await W.locator(".evx-g b").allTextContents()) === '["6","7","8","9","10","11","OL"]', "the grades");
  await count(W.locator(".evx-g:disabled"), 0);
  expect(new Set(await W.locator(".evx-g").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
  await until(async () => (await W.locator(".evx-g.on b").textContent()) === "11", "Grade 11");
  await contains(W.locator(".tp-kind.on"), "Fighter");
  await textsAre(W.locator(".evx-u .tp-ln-n"), ["13"]);
  await until(async () => (await W.locator(".evx-qg b").allTextContents()).join(",") === "A,B,C,D,E,F", "the sections with teacher questions");
  await until(async () => (await W.locator(".evx-qg.on b").textContent()) === "B", "B: the first someone needs");
  expect(await namesOf(W.locator(".evx-sp.on"))).toEqual(["Tharun"]);

  // Section D: all nine here are listed; the six who still need D are ticked, the three taught show it.
  await W.locator(".evx-qg").filter({ has: T.locator("b").getByText("D", { exact: true }) }).click();
  await until(async () => (await namesOf(W.locator(".evx-sp"))).length === 9, "everyone here in Grade 11");
  expect(await namesOf(W.locator(".evx-sp.on"))).toEqual(["Ahamed", "Dilan", "Fathima", "Nila", "Rizwan", "Tharun"]);
  // The three taught already: pale green, counted once in the box's line (no "taught" on every pill).
  expect(await namesOf(W.locator(".evx-sp.wc-done"))).toEqual(["Kumar", "Sana", "Yasmin"]);
  await count(W.locator(".evx-sp small"), 0);
  await contains(W.locator(".evx-bh"), "6 ticked");
  await contains(W.locator(".evx-bh"), "3 taught");
  await textsAre(W.locator(".evx-strip .fc-sq small"), ["D·23", "D·24", "D·25", "D·26"]);
  await contains(W.locator(".evx-card .fc-qhead .fc-qn"), "23");
  await contains(W.locator(".evx-x"), "for 6");
  expect(await T.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(T, "wc01-whole-class");

  // Tharun isn't ready (he hasn't done C): untick him. Taught Q23 for five at once; Q24 opens by itself.
  await W.locator(".evx-sp", { hasText: "Tharun" }).click();
  await contains(W.locator(".evx-x"), "for 5");
  await W.locator(".evx-x").click();
  await contains(T.locator(".toast"), "Q23 taught for 5.");
  await contains(W.locator(".evx-card .fc-qn"), "24");
  await until(async () => (await marks("Ahamed"))["23"]?.s === "taught" && (await marks("Rizwan"))["23"]?.s === "taught", "Q23 taught for five");
  expect((await marks("Tharun"))["23"]).toBeUndefined();
  expect((await marks("Kumar"))["23"]?.s).toBe("taught"); // he had it already
  // Undo (a wrong tap): Q23 as it was, the card back on it.
  await T.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await until(async () => (await marks("Ahamed"))["23"] === undefined, "Q23 undone");
  await contains(W.locator(".evx-card .fc-qn"), "23");
  // Teaching mode: the book on top (13·D, Tamil), the squares, Taught for 5 inside; it saves and goes on.
  await W.locator(".evx-card .fc-tmb").click();
  const tm = T.locator(".tm");
  await visible(tm);
  await contains(tm.locator(".tm-title .tp-ln-n"), "13·D");
  await textsAre(tm.locator(".fc-strip .fc-sq small"), ["D·23", "D·24", "D·25", "D·26"]);
  await contains(tm.locator(".evx-x"), "for 5");
  await shot(T, "wc02-teaching-mode");
  for (const q of ["23", "24", "25", "26"]) {
    await contains(tm.locator(".fc-qn"), q);
    await tm.locator(".evx-x").click();
    await contains(T.locator(".toast"), `Q${q} taught for 5.`);
  }
  // All four taught: every square ✓, the big button only goes on.
  await count(tm.locator(".fc-strip .fc-sq.dk"), 4);
  await visible(tm.locator(".tm-next"));
  await tm.locator(".tm-x").click();
  await count(T.locator(".tm"), 0);
  await until(async () => (await marks("Nila"))["26"]?.s === "taught", "Nila taught D");
  const nila = await marks("Nila");
  expect([nila["23"]?.s, nila["24"]?.s, nila["25"]?.s, nila["26"]?.s]).toEqual(["taught", "taught", "taught", "taught"]);
  // Her score: one lesson (the Undo and the rest are the same lesson), five students, the questions.
  const st = await backend.t.run(async (ctx) => (await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first())!.stats ?? {});
  expect(st.theory).toMatchObject({ lessons: 1, done: 5, qs: 20 });
  // The history says where it happened.
  const ev = await backend.t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "board").length);
  expect(ev).toBe(25); // 5 for Q23, undone, then 4 × 5

  // Grade 7: its workbook (they are all on Master); the level with the most waiting (L2: Malik's Q13 and Q17). Priya and
  // Vimal have nothing of L2 waiting: pale, nothing saved for them; a tap says why.
  await W.locator(".evx-g").filter({ has: T.locator("b", { hasText: /^7$/ }) }).click();
  await until(async () => (await W.locator(".tp-kind.on").textContent())?.startsWith("Master") ?? false, "Master");
  await until(async () => (await W.locator(".evx-qg.on b").textContent()) === "L2", "Level 2");
  await textsAre(W.locator(".evx-qg b"), ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"]);
  expect(await namesOf(W.locator(".evx-sp.on"))).toEqual(["Malik"]);
  expect(await namesOf(W.locator(".evx-sp.wc-no"))).toEqual(["Priya", "Vimal"]);
  await W.locator(".evx-sp", { hasText: "Priya" }).click();
  await contains(T.locator(".toast"), "Priya has nothing of this level waiting");
  await contains(W.locator(".evx-card .fc-qn"), "13");
  await W.locator(".evx-x").click();
  await contains(W.locator(".evx-card .fc-qn"), "17");
  await until(async () => (await marksOf(backend, "Malik")).m!.q["13"]?.x !== undefined, "Malik's Q13 explained at the board");
  await shot(T, "wc03-workbook-level");

  // The smallest phone: the owner's four top icons and the clock fit; the grades in one row; the big button on screen.
  const S = await phone(backend, "theory", { ...PHONE, viewport: { width: 320, height: 568 } });
  await visible(S.getByRole("button", { name: /^Whole class/ }));
  expect(await topFits(S), "the owner's top bar fits at 320 px").toBe(true);
  await S.getByRole("button", { name: /^Whole class/ }).click();
  await visible(S.locator(".wc-page .evx-x"));
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(new Set(await S.locator(".wc-page .evx-g").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
  const big = await S.locator(".wc-page .evx-x").boundingBox();
  expect(big!.y + big!.height).toBeLessThanOrEqual(568 - 66 + 1);
  await shot(S, "wc04-whole-class-320");
  await S.context().close();

  // A corrector (Correction only) has no whiteboard in her top bar.
  await addPerson(backend.t, { name: "Kavi", token: "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwx", tabs: ["correction"] });
  const K = await phone(backend, "focus", PHONE, "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwx");
  await visible(K.locator(".top-left .class-btn"));
  await count(K.getByRole("button", { name: /^Whole class/ }), 0);
  await K.context().close();
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Consultation: the top bar's icon left of the whiteboard (the owner, the Consultation tick); his order with counts; Today and All; Call to herself (Correction says her name); Arrived; each tap saved at once; Theory in the same sitting; Done; a check-in", async () => {
  const backend = await newClass();
  const C = await phone(backend, "focus");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  await C.getByRole("button", { name: "Back to the class" }).click();
  const O = await phone(backend, "evaluation");

  // The owner's top bar: Register, Progress, Owner, Consultation, Whole class (his place for it: left of the whiteboard).
  await visible(O.locator(".top .cx-btn"));
  const icons = await O.locator(".top-left > button").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").split(":")[0]));
  expect(icons).toEqual(["Register", "Progress", "Owner", "Consultation", "Whole class"]);
  expect(await topFits(O)).toBe(true);
  await O.locator(".top .cx-btn").click();
  const P = O.locator(".cx-page");
  await visible(P);
  // The departments (8 Nov 2026, his voice note: "remove Evaluation and Theory, instead put Fighter and Master"): the
  // owner switches. Fighter first: No work (its students who sit with no work: Fathima, Rizwan) and Evaluation.
  const firsts = (l: L) => l.evaluateAll((els) => els.map((e) => e.firstChild?.textContent ?? ""));
  await until(async () => JSON.stringify(await firsts(P.locator(".tp-kinds").first().locator(".tp-kind"))) === '["Fighter","Master"]', "Fighter | Master");
  await contains(P.locator(".tp-kinds").first().locator(".tp-kind.on"), "Fighter");
  await until(async () => JSON.stringify(await firsts(P.locator(".tp-kinds").nth(1).locator(".tp-kind"))) === '["No work","Evaluation"]', "No work | Evaluation");
  await until(
    async () => ((await P.locator(".tp-kinds").nth(1).locator(".tp-kind.on").getAttribute("aria-label")) ?? "").startsWith("No work: 2"),
    "No work: 2",
  );
  expect((await namesOf(P.locator(".cx-nm.red"))).slice(0, 2)).toEqual(["Fathima", "Rizwan"]);
  expect((await namesOf(P.locator(".cx-nm"))).slice(0, 2)).toEqual(["Fathima", "Rizwan"]);
  await shot(O, "cx00-consultation-fighter");
  // Fighter's Evaluation: the theory books' wrong answers only (Kumar 2, Fathima 1, Dilan 1).
  await P.locator(".tp-kinds").nth(1).locator(".tp-kind", { hasText: "Evaluation" }).click();
  await says(P.locator(".cx-sum"), "Today 4 · 3 students");
  expect((await namesOf(P.locator(".cx-nm"))).slice(0, 3)).toEqual(["Kumar", "Fathima", "Dilan"]);
  // Master: one list, the workbooks' lost marks (blanks too): 5 questions for Malik and Vimal (nobody away has any).
  await P.locator(".tp-kinds").first().locator(".tp-kind", { hasText: "Master" }).click();
  await contains(P.locator(".tp-kinds").first().locator(".tp-kind.on"), "Master");
  await count(P.locator(".tp-kinds"), 1);
  await says(P.locator(".cx-sum"), "Today 5 · 2 students");
  await says(P.locator(".cx-sum"), "All 5 · 2");
  // His order: the most to explain first, then everyone else A–Z. A red ring: no work in a workbook (Vimal).
  await until(async () => (await namesOf(P.locator(".cx-nm"))).length === 13, "the 13 here");
  expect(await namesOf(P.locator(".cx-nm"))).toEqual(["Malik", "Vimal", "Ahamed", "Dilan", "Fathima", "Kumar", "Nila", "Priya", "Rizwan", "Sana", "Tharun", "Yasmin", "Zainab"]);
  expect(await P.locator(".cx-nm").evaluateAll((els) => els.slice(0, 2).map((e) => e.querySelector(".cx-n")?.textContent))).toEqual(["3", "2"]);
  expect(await namesOf(P.locator(".cx-nm.red"))).toEqual(["Vimal"]);
  expect(await O.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(O, "cx01-consultation");

  // Tick Malik: his questions to prepare (Q4, Q13, Q17) and the answer; nothing to decide before he comes.
  await P.locator(".cx-nm", { hasText: "Malik" }).click();
  await visible(P.locator('.evx-sp.s-sug.on[data-name="Malik"]'));
  await textsAre(P.locator(".evx-strip .fc-sq small"), ["4", "13", "17"]);
  await contains(P.locator(".evx-card .fc-qn"), "4");
  await visible(P.locator(".evx-card .fc-ans"));
  await until(async () => await P.locator(".fc-go.evx-x").isDisabled(), "Explained waits for him");
  await P.locator(".evx-call").click();
  await contains(O.locator(".toast"), "Called Malik. Correction sends him to you.");
  await visible(P.locator('.evx-sp.s-call[data-name="Malik"]'));
  await count(P.locator('.cx-nm[data-name="Malik"]'), 0);
  // Correction's phone: only her name (his answer, 5 Nov 2026), a strip of its own with Sent.
  await hears(C, "Malik, go to Owner.");
  const strip = C.locator(".call-strip", { hasText: "Consultation" });
  await visible(strip);
  await strip.getByRole("button", { name: "Sent" }).click();
  await visible(P.locator('.evx-sp.s-walk[data-name="Malik"]'));
  // Another teacher can't take him now (nobody bumps, pulls or sends a consultation).
  await addPerson(backend.t, { name: "Nila T", token: "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx", tabs: ["evaluation"] });
  const malikId = (await marksOf(backend, "Malik"))._id;
  const r = await backend.t.mutation(api.calls.create, {
    token: "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx",
    studentIds: [malikId],
    room: "evaluation",
    kind: "evaluation",
    by: "evaluation",
  });
  expect(r.rejected.map((x) => x.reason)).toEqual(["is with Owner (consultation)"]);

  // He walks in: Arrived. Q4 explained (saved at once: gone from Evaluation's list), the next opens by itself.
  await P.locator(".evx-arrive").click();
  await contains(O.locator(".toast"), "Malik is here.");
  await visible(P.locator('.evx-sp.s-in[data-name="Malik"]'));
  await contains(P.locator(".evx-card .fc-qn"), "4");
  await P.locator(".fc-go.evx-x").click();
  await contains(P.locator(".evx-card .fc-qn"), "13");
  await until(async () => (await marksOf(backend, "Malik")).m?.q["4"]?.x !== undefined, "Q4 explained on the server");
  await count(P.locator(".evx-strip .fc-sq.d-x"), 1);
  await says(P.locator(".cx-sum"), "Today 4 · 2 students");
  // Q13 → Theory (T); Q17 Not now (it stays waiting for the Evaluation teachers).
  await P.locator(".fc-n.evx-b.th").click();
  await contains(P.locator(".evx-card .fc-qn"), "17");
  await until(async () => (await marksOf(backend, "Malik")).m?.q["13"]?.tb === "consult", "Q13 sent to Theory here");
  await P.locator(".fc-n.evx-b.skip").click();
  await count(P.locator(".evx-strip .fc-sq.d-th"), 1);
  await count(P.locator(".evx-strip .fc-sq.d-skip"), 1);
  // A square tapped again: back. Explained on Q4 again = not explained.
  await P.locator(".evx-strip .fc-sq").first().click();
  await contains(P.locator(".evx-card .fc-qn"), "4");
  await P.locator(".fc-go.evx-x").click();
  await until(async () => (await marksOf(backend, "Malik")).m?.q["4"]?.x === undefined, "Q4 explained, undone");
  await P.locator(".fc-go.evx-x").click(); // and explained after all
  await until(async () => (await marksOf(backend, "Malik")).m?.q["4"]?.x !== undefined, "Q4 explained again");
  await shot(O, "cx02-with-him");

  // His Evaluation tab never shows the consultation in her Evaluation room.
  await O.locator(".tabs .tab.evaluation").click();
  await visible(O.locator(".evx-page:not(.cx-page)"));
  await count(O.locator('.evx-page .evx-sp.s-in[data-name="Malik"]'), 0);
  await visible(O.locator(".top .cx-btn .cx-badge"));
  await O.locator(".top .cx-btn").click();
  await visible(P);

  // Q13 sent to Theory waits on the Master page's Theory (the Master department teaches its own theory, his answer of
  // 8 Nov 2026); the Fighter view never shows a workbook's questions, even with him here.
  await P.locator(".tp-kinds").first().locator(".tp-kind", { hasText: "Fighter" }).click();
  await count(P.locator(".evx-strip .fc-sq"), 0);
  await shot(O, "cx03-fighter-with-him");
  await P.locator(".tp-kinds").first().locator(".tp-kind", { hasText: "Master" }).click();
  await textsAre(P.locator(".evx-strip .fc-sq small"), ["4", "13", "17"]);

  // Done: back to work; what he didn't reach (Q17) stays for the teachers. The history says where it happened.
  await P.locator(".evx-done").click();
  await contains(O.locator(".toast"), "Malik back to work.");
  await visible(P.locator('.cx-nm[data-name="Malik"]'));
  const malik = await marksOf(backend, "Malik");
  expect(malik.room).toBeUndefined();
  expect(malik.consultAt).toBeDefined();
  expect(malik.m?.q["17"]?.x).toBeUndefined();
  const ev = await backend.t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "consult" || e.kind === "done-consult"));
  expect(ev.map((e) => [e.kind, e.q ?? null, e.value])).toEqual([
    ["consult", 4, "explained"],
    ["consult", 13, "to-theory"],
    ["consult", 4, "unexplained"],
    ["consult", 4, "explained"],
    ["done-consult", null, "evaluation"],
  ]);
  // Each tap names its book's department (the dashboard's "cleared today").
  expect(ev.filter((e) => e.kind === "consult").every((e) => e.stage === "master")).toBe(true);
  // Never the Evaluation room's score.
  const st = await backend.t.run(async (ctx) => (await ctx.db.query("sessions").withIndex("by_open", (q) => q.eq("open", true)).first())!.stats ?? {});
  expect(st.evaluation?.calls ?? 0).toBe(0);

  // A check-in: Priya has nothing waiting; she comes, they talk, Done.
  await P.locator(".cx-nm", { hasText: "Priya" }).click();
  await P.locator(".evx-call").click();
  await contains(O.locator(".toast"), "Called Priya.");
  await hears(C, "Priya, go to Owner.");
  await C.locator(".call-strip", { hasText: "Consultation" }).getByRole("button", { name: "Sent" }).click();
  await P.locator('.evx-sp[data-name="Priya"]').click();
  await O.locator(".sheet").getByRole("button", { name: "Arrived" }).click();
  await contains(P.locator(".evx-hint"), "a check-in");
  await P.locator(".evx-done").click();
  await contains(O.locator(".toast"), "Priya back to work.");
  // Settings → History says it.
  await O.getByRole("button", { name: /^Settings/ }).click();
  await O.getByRole("button", { name: "History", exact: true }).click();
  await visible(O.getByText("Q4 explained in consultation").first());
  await visible(O.getByText("consultation finished").first());
  await O.getByRole("button", { name: /^Settings/ }).click();

  // The smallest phone: five icons, the count, the clock and Settings in one row; the page fits.
  const S = await phone(backend, "evaluation", { ...PHONE, viewport: { width: 320, height: 568 } });
  await visible(S.locator(".top .cx-btn"));
  expect(await topFits(S), "the owner's five icons fit at 320 px").toBe(true);
  await S.locator(".top .cx-btn").click();
  await visible(S.locator(".cx-page .cx-nm").first());
  expect(await S.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(S, "cx04-consultation-320");
  await S.context().close();

  // The Consultation tick alone: the icon (and nothing of the rooms); a corrector without it: no icon.
  await addPerson(backend.t, { name: "Rani", token: "rani-phone-token-0123456789abcdefghijklmnopqrstuvwx", tabs: [], can: ["consult"] });
  const R = await phone(backend, "hall", PHONE, "rani-phone-token-0123456789abcdefghijklmnopqrstuvwx");
  await visible(R.locator(".top .cx-btn"));
  await count(R.getByRole("button", { name: /^Whole class/ }), 0);
  await R.locator(".top .cx-btn").click();
  await visible(R.locator(".cx-page .cx-nm").first());
  await R.context().close();
  await addPerson(backend.t, { name: "Kavi", token: "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwx", tabs: ["correction"] });
  const K = await phone(backend, "focus", PHONE, "kavi-phone-token-0123456789abcdefghijklmnopqrstuvwx");
  await visible(K.locator(".top-left .class-btn"));
  await count(K.locator(".top .cx-btn"), 0);
  await K.context().close();
  expect(problems, problems.join("\n")).toEqual([]);
});

test("Departments: Settings → Roles gives each teacher her own app; Preview looks only; Fighter and Master save each tap at once with no Call; her dashboard; Homework | Class; a Master consultation rings on the Master lead's phone, not Correction's", async () => {
  const backend = await newClass();
  const C = await phone(backend, "focus");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Load demo students (three grades)" }).click();
  await visible(C.getByText(/^14 demo students loaded/));
  const NILA = "nila-dept-token-0123456789abcdefghijklmnopqrstuvwxyz01";
  const MEERA = "meera-dept-token-0123456789abcdefghijklmnopqrstuvwxyz0";
  const SANA = "sana-dept-token-0123456789abcdefghijklmnopqrstuvwxyz01";
  await addPerson(backend.t, { name: "Nila", token: NILA, tabs: ["theory", "evaluation"] });
  await addPerson(backend.t, { name: "Meera", token: MEERA, tabs: ["theory", "evaluation"] });
  await addPerson(backend.t, { name: "Sana", token: SANA, tabs: [], can: ["consult"] });

  // Settings → Roles: the three departments (nobody in them yet), everyone else, the owner's own app.
  await C.getByRole("button", { name: "Roles", exact: true }).click();
  const R = C.locator(".roles");
  await visible(R.locator(".role-dept.rd-fighter"));
  await count(R.locator(".role-dept"), 5);
  await count(R.locator(".rd-none .role-p"), 3);
  expect(await C.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(C, "d01-roles");
  const sheet = C.locator(".role-sheet .sheet");
  const setRole = async (name: string, dept: string, lead: boolean) => {
    await R.locator(".role-p", { hasText: name }).click();
    await visible(sheet);
    await sheet.getByRole("button", { name: dept, exact: true }).click();
    await sheet.getByRole("radio", { name: lead ? /^Lead teacher/ : /^Consultation teacher/ }).check();
  };
  // Nila leads Fighter: his six pages, ticked by the department's place.
  await setRole("Nila", "Fighter", true);
  const ticked = () => sheet.locator(".role-pages .perm").evaluateAll((els) => els.filter((e) => (e.querySelector("input") as HTMLInputElement).checked).map((e) => e.querySelector("span")!.firstChild!.textContent));
  await until(async () => JSON.stringify(await ticked()) === JSON.stringify(["Dashboard", "Fighter", "Correction", "Teach", "Consult", "Us"]), "his six");
  await shot(C, "d02-role-sheet");
  await sheet.getByRole("button", { name: "Save" }).click();
  await contains(C.locator(".toast"), "Nila's app is saved");
  await setRole("Meera", "Master", true);
  await until(async () => JSON.stringify(await ticked()) === JSON.stringify(["Dashboard", "Master", "Correction", "Consult", "Us"]), "the Master lead's five");
  await sheet.getByRole("button", { name: "Save" }).click();
  await contains(C.locator(".toast"), "Meera's app is saved");
  await setRole("Sana", "Master", false);
  await until(async () => JSON.stringify(await ticked()) === JSON.stringify(["Consult", "Us"]), "a consultation teacher's two");
  await sheet.getByRole("button", { name: "Save" }).click();
  await contains(R.locator(".rd-master"), "Meera");
  await contains(R.locator(".rd-master .role-tag.lead"), "Lead");
  const meera = await backend.t.run(async (ctx) => (await ctx.db.query("users").collect()).find((u) => u.name === "Meera")!);
  expect(meera).toMatchObject({ dept: "master", lead: true, tabs: ["correction", "theory", "evaluation"], can: ["photos", "consult"] });

  // Nila's phone: her six at the bottom, in one row; her dashboard first: her department's question, answered.
  const N = await phone(backend, "dash", PHONE, NILA);
  const bar = (p: Page) => p.locator(".tabs .tab").evaluateAll((els) => els.map((e) => (e.getAttribute("aria-label") ?? "").split(",")[0]));
  await until(async () => JSON.stringify(await bar(N)) === JSON.stringify(["Dashboard", "Fighter", "Correction", "Teach", "Consult", "Us"]), "her bar");
  await count(N.locator(".top .cx-btn, .top .teach-btn"), 0); // Consult and Teach are her tabs: not in the top bar
  await contains(N.locator(".dash-who"), "Nila");
  await contains(N.locator(".dash-who small"), "Fighter department · lead");
  await says(N.locator(".dash-ask"), "How many students have no work?");
  await until(async () => (await N.locator(".dash-n b").textContent()) === "2", "2 with no work (Fathima, Rizwan)");
  await visible(N.locator(".dash-g.red", { hasText: "11" }));
  await shot(N, "d03-dashboard");

  // Her Fighter page: Grade 11, Theory first; a section's lesson with its students ticked; no Call, no Arrived, no Done.
  await N.locator(".tabs .tab.fighter").click();
  const F = N.locator(".dk-page");
  await visible(F);
  await contains(F.locator(".evx-g.on"), "11");
  await until(async () => (await F.locator(".tp-kind.on").evaluate((e) => e.firstChild?.textContent)) === "Theory", "Theory first");
  await count(F.locator(".evx-call, .evx-arrive, .evx-done"), 0);
  await visible(F.locator(".evx-qg.tpx-sec.on"));
  expect((await namesOf(F.locator(".evx-sp.s-sug.on"))).length).toBeGreaterThan(0);
  const q = Number(await F.locator(".evx-strip .fc-sq.on small").textContent());
  // Who has this square: everyone ticked who needs its teacher question.
  const at = await F.locator(".evx-card .evx-who > span").evaluateAll((els) => els.map((e) => (e.firstChild?.textContent ?? "").trim()));
  expect(at.length).toBeGreaterThan(0);
  expect(await N.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(N, "d04-fighter-theory");
  // Taught: saved at once for everyone ticked (no Done), the next square opens.
  await F.locator(".fc-go.evx-x").click();
  for (const name of at)
    await until(async () => ((await marksOf(backend, name)).marks as Record<string, { s: string }>)[String(q)]?.s === "taught", `${name} Q${q} taught`);
  await visible(F.locator(".evx-strip .fc-sq.d-x"));
  expect((await backend.t.run(async (ctx) => (await ctx.db.query("events").collect()).filter((e) => e.kind === "desk"))).length).toBe(at.length);
  // Evaluation: the theory books' wrong answers. Fathima's Q22, explained at her desk.
  await F.locator(".tp-kind", { hasText: "Evaluation" }).click();
  await F.locator(".evx-qg", { hasText: "22" }).click();
  expect(await namesOf(F.locator(".evx-sp.s-sug.on"))).toEqual(["Fathima"]);
  await contains(F.locator(".fc-go.evx-x"), "Explained");
  await F.locator(".fc-go.evx-x").click();
  await until(async () => ((await marksOf(backend, "Fathima")).marks as Record<string, { s: string }>)["22"]?.s === "explained", "Fathima Q22 explained");
  await shot(N, "d05-fighter-evaluation");

  // Correction: Homework | Class, Homework first (her Correction is mostly the photos from home).
  await N.locator(".tabs .tab.correction").click();
  await visible(N.locator(".fc-modes .segc-b.on", { hasText: "Homework" }));
  await N.locator(".fc-modes .segc-b", { hasText: "Class" }).click();
  await visible(N.locator(".fc-modes .segc-b.on", { hasText: "Class" }));
  await visible(N.locator(".fc-names .fc-nm").first());
  await shot(N, "d06-correction-modes");
  // Teach: freestyle teaching at the board, a tab of hers.
  await N.locator(".tabs .tab.teach").click();
  await visible(N.locator(".wc-page, .tpx-page").first());

  // The smallest phone: her six tabs fit, the Fighter page doesn't scroll sideways.
  const N3 = await phone(backend, "fighter", { ...PHONE, viewport: { width: 320, height: 568 } }, NILA);
  await visible(N3.locator(".dk-page"));
  expect(await N3.evaluate(() => [...document.querySelectorAll(".tabs .tab")].every((t) => t.scrollWidth <= t.clientWidth + 1))).toBe(true);
  expect(await N3.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(N3, "d07-fighter-320");
  await N3.locator(".tabs .tab.dash").click();
  await visible(N3.locator(".dash-q"));
  expect(await N3.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(N3, "d08-dashboard-320");
  await N3.context().close();

  // Meera's Master page: Grade 7, Evaluation first; a blank ("?") in its own colour; Explained saved at once.
  await backend.t.run(async (ctx) => {
    const s = (await ctx.db.query("students").collect()).find((x) => x.name === "Malik")!;
    const p = (await ctx.db.query("progress").withIndex("by_student", (x) => x.eq("studentId", s._id)).collect()).find((x) => x.stage === "master")!;
    const m = p.m!;
    await ctx.db.patch(p._id, { m: { ...m, q: { ...m.q, "13": { ...m.q["13"], got: 0, dk: true } } } });
  });
  const M = await phone(backend, "master", PHONE, MEERA);
  const MP = M.locator(".dk-page");
  await visible(MP);
  await contains(MP.locator(".evx-g.on"), "7");
  await until(async () => (await MP.locator(".tp-kind.on").evaluate((e) => e.firstChild?.textContent)) === "Evaluation", "Evaluation first");
  await MP.locator(".evx-qg", { hasText: "13" }).click();
  expect(await namesOf(MP.locator(".evx-sp.s-sug.on"))).toEqual(["Malik"]);
  await visible(MP.locator(".evx-strip .fc-sq.blank"));
  await contains(MP.locator(".evx-strip .fc-sq.blank small"), "13");
  await shot(M, "d09-master-blank");
  await MP.locator(".evx-strip .fc-sq", { hasText: "4" }).first().click();
  await MP.locator(".fc-go.evx-x").click();
  await until(async () => (await marksOf(backend, "Malik")).m?.q["4"]?.x !== undefined, "Malik Q4 explained at his desk");

  // Sana, the Master department's consultation teacher: her app is Consult and Us; one list (no bars).
  const SN = await phone(backend, "consult", PHONE, SANA);
  await until(async () => JSON.stringify(await bar(SN)) === JSON.stringify(["Consult", "Us"]), "Sana's bar");
  const SP = SN.locator(".cx-page");
  await visible(SP);
  await count(SP.locator(".tp-kinds"), 0);
  await SP.locator(".cx-nm", { hasText: "Vimal" }).click();
  await SP.locator(".evx-call").click();
  await contains(SN.locator(".toast"), "Called Vimal. The Master lead sends him to you.");
  // The Master lead's phone says it, on her own page, with Sent; Correction's phone stays quiet.
  await hears(M, "Vimal, go to Sana.");
  const strip = M.locator(".call-strip", { hasText: "Sana" });
  await visible(strip);
  await shot(M, "d10-master-lead-sends");
  await C.getByRole("button", { name: "Back to the class" }).click();
  await count(C.locator(".call-strip", { hasText: "Sana" }), 0);
  await strip.getByRole("button", { name: "Sent" }).click();
  await until(async () => (await marksOf(backend, "Vimal")).room === "evaluation", "Vimal on his way to Sana");
  await SP.locator(".evx-arrive").click();
  await contains(SN.locator(".toast"), "Vimal is here.");
  await SP.locator(".fc-go.evx-x").click();
  await until(async () => Object.values((await marksOf(backend, "Vimal")).m?.q ?? {}).some((r) => r.x !== undefined), "Vimal: one explained in consultation");
  await SP.locator(".evx-done").click();
  await contains(SN.locator(".toast"), "Vimal back to work.");

  // The owner previews Meera's app: her bar, a banner, nothing saved; Exit = back to Roles.
  await C.getByRole("button", { name: /^Settings/ }).click();
  await C.getByRole("button", { name: "Roles", exact: true }).click();
  await R.locator(".role-p", { hasText: "Meera" }).click();
  await sheet.getByRole("button", { name: "Preview" }).click();
  await visible(C.locator(".pv-banner"));
  await until(async () => JSON.stringify(await bar(C)) === JSON.stringify(["Dashboard", "Master", "Correction", "Consult", "Us"]), "Meera's bar in the preview");
  await C.locator(".tabs .tab.master").click();
  await visible(C.locator(".dk-page"));
  await C.locator(".dk-page .fc-go.evx-x").click();
  await contains(C.locator(".toast"), "Preview: look only. Nothing is saved.");
  await shot(C, "d11-preview");
  await C.locator(".pv-banner").getByRole("button", { name: "Exit" }).click();
  await visible(C.locator(".roles"));
  await count(C.locator(".pv-banner"), 0);
  expect(problems, problems.join("\n")).toEqual([]);
});

// Last in this file: it loads a page again (5 Nov 2026, his upload refused by the teachers' app open since the night
// before). The page online names other code than this copy runs: a newer version went out while it was open.
test("Update: an older copy of the app says so at the upload, and Update opens Settings → Books again", async () => {
  const backend = await newClass();
  const C = await phone(backend, "focus");
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: "Books", exact: true }).click();
  const online = (await readFile(resolve("dist/index.html"), "utf8")).replace(/(<script type="module" src="[^"]+)"/, '$1?newer"');
  await C.route(/\/$/, (r) => (r.request().resourceType() === "fetch" ? r.fulfill({ status: 200, contentType: "text/html", body: online }) : r.fallback()));
  await C.locator(".upload-btn input[type=file]").setInputFiles([
    { name: "G8_U01_Workbook_source_v5.zip", mimeType: "application/zip", buffer: Buffer.from(zipSync({ "book.html": strToU8(U01_BOOK) })) },
  ]);
  const up = C.locator(".sheet");
  await contains(up, "This phone has an older copy of the app");
  await count(up.getByRole("button", { name: /^Save/ }), 0);
  await shot(C, "m08d-upload-older-copy");
  await up.getByRole("button", { name: "Update the app" }).click();
  // The page loads again and opens where he was: Settings → Books, ready to upload.
  await visible(C.getByRole("button", { name: "Books", exact: true, pressed: true }));
  await visible(C.locator(".upload-btn"));
  await count(C.locator(".sheet"), 0);
  await C.unroute(/\/$/);
  await C.context().close();
});
