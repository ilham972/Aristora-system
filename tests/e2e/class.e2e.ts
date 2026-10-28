/// <reference types="vite/client" />
// One class on the register, acted out on three phones: Correction, Theory, Evaluation.

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterAll, beforeAll, expect, test } from "vitest";
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
const textsAre = (l: L, list: string[]) =>
  until(async () => JSON.stringify((await l.allInnerTexts()).map((x) => x.trim())) === JSON.stringify(list), `${list.join(", ")} in ${l}`);
/** The same names, in any order. */
const namesAre = (l: L, list: string[]) =>
  until(
    async () => JSON.stringify((await l.allInnerTexts()).map((x) => x.trim()).sort()) === JSON.stringify([...list].sort()),
    `${list.join(", ")} in ${l}`,
  );
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
  await count(row(T, "Keerthi"), 0);
  await count(C.locator(".top h1, .top .role-mark"), 0);
  await contains(C.getByRole("button", { name: /^Attendance/ }), "13");
  await namesAre(C.locator(".reg-row.rt-red .reg-n"), ["Fathima", "Rizwan", "Vimal"]); // no work (Vimal: every level waits)
  await count(C.locator(".reg-row.rt-yellow"), 1); // Tharun: quiet
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

  // Same mistake: U13 Q22 wrong for Ahamed and Fathima -> one chip selects both.
  await E.getByRole("button", { name: /got U13 Q22 wrong/ }).click();
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
  await visible(row(T, "Keerthi")); // Theory sees her at once
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
  await C.locator(".tabs").getByRole("button", { name: "Correction" }).click();
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
  await C.locator(".tabs").getByRole("button", { name: "Correction" }).click();

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

  // Small Android phone: nothing spills sideways on any tab (two grades in class: Ahamed G11, Malik G7).
  for (const role of ["correction", "theory", "evaluation"]) {
    const small = await phone(backend, role, { ...PHONE, viewport: { width: 360, height: 740 } });
    await visible(row(small, "Ahamed")); // loaded, then measure
    await textsAre(small.locator(".grade-pills .gp b"), ["All", "7", "11"]);
    expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
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
  // Theory looks at Grade 11 only (the phone remembers it).
  await T.getByRole("button", { name: /^Grade 11:/ }).click();
  await count(T.locator(".reg-row"), 9); // Keerthi isn't signed in

  // Correction sees every grade in one register. Malik handed Level 3 in 6 minutes ago and is on Level 4.
  const malik = row(C, "Malik");
  await textsAre(malik.locator(".lv-pill b"), ["L3", "L4"]);
  await contains(malik.locator(".reg-s"), "Correct L3 6m");
  await contains(malik.locator(".strip-tag"), "G7 · U08");
  await contains(row(C, "Zainab").locator(".strip-tag"), "G9 · U21");
  await textsAre(row(C, "Vimal").locator(".lv-pill b"), ["L8"]);
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

  // Correct Level 3: all full marks, then Q24 lost both marks.
  await malik.locator(".lv-pill.waiting").click();
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
  await textsAre(malik.locator(".lv-pill b"), ["L4"]);

  // Priya hands Level 2 in: it waits, and she goes on to Level 3.
  await row(C, "Priya").locator(".lv-pill").click();
  await C.locator(".sheet").getByRole("button", { name: "Handed in: correct later" }).click();
  await contains(C.locator(".toast"), "Priya: Level 2 handed in");
  await textsAre(row(C, "Priya").locator(".lv-pill b"), ["L2", "L3"]);
  await count(row(C, "Priya").locator(".lv-pill.waiting"), 1);
  expect((await marksOf(backend, "Priya")).m!.lv["2"]?.done).toBeGreaterThan(0);

  // Evaluation: Malik's lost marks are red circles; tap Q24 when it's explained.
  const em = row(E, "Malik");
  await textsAre(em.locator(".reg-act .q"), ["4", "13", "17", "24"]);
  await shot(E, "m03-evaluation-lost-marks", true);
  await em.locator(".reg-act").getByRole("button", { name: /^Q24\b/ }).click();
  await until(async () => (await marksOf(backend, "Malik")).m!.q["24"]?.x !== undefined, "Malik Q24 explained");
  await until(async () => (await em.locator(".reg-act .q[data-s=explained]").count()) === 1, "Q24 turns violet");

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

  // Correction opens Malik's workbook (the marks table) and asks for the unit to be taught again.
  await malik.locator(".reg-strip").click();
  await visible(malik.locator(".mtable"));
  await contains(malik.locator(".mt-unit"), "52 / 146");
  await shot(C, "m04-correction-marks-table", true);
  await malik.getByRole("button", { name: "Needs theory again" }).click();
  await visible(malik.getByRole("button", { name: "Re-teach asked ✓" }));
  // Theory is looking at Grade 11: the Grade 7 pill lights up for Malik.
  const g7 = T.getByRole("button", { name: /^Grade 7:/ });
  await until(async () => /need you/.test((await g7.getAttribute("aria-label")) ?? ""), "Theory's Grade 7 pill shows Malik");
  await visible(g7.locator(".gp-badge"));
  await shot(T, "m04b-theory-grade-7-waiting");
  await g7.click();
  await count(T.locator(".reg-row"), 3);

  // Theory: one chip selects everyone waiting for a re-teach; Sent; sent back early keeps the request.
  await T.getByRole("button", { name: /need re-teaching of U08/ }).click();
  await textsAre(T.locator(".reg-row.sel .reg-n"), ["Malik"]);
  await T.locator(".call-bar").getByRole("button", { name: "Call 1" }).click();
  await hears(C, "Malik, go to Theory.");
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await visible(T.locator(".inroom.theory").getByRole("img", { name: "section ↺" }));
  await count(T.locator(".inroom.theory .ir-chip.coming"), 0); // sent: he is in the room
  await until(async () => (await marksOf(backend, "Malik")).room === "theory", "Malik in Theory");
  await shot(T, "m05-theory-reteach");
  await T.locator(".inroom.theory").getByRole("button", { name: "Send back", exact: true }).click();
  await until(async () => (await marksOf(backend, "Malik")).room === undefined, "Malik back in the hall");
  expect((await marksOf(backend, "Malik")).m!.reteach).toBeDefined();
  await T.getByRole("button", { name: /need re-teaching of U08/ }).click();
  await T.locator(".call-bar").getByRole("button", { name: "Call 1" }).click();
  await C.locator(".call-strip.theory").getByRole("button", { name: "Sent" }).click();
  await T.locator(".inroom.theory").getByRole("button", { name: "All taught" }).click();
  await until(async () => (await marksOf(backend, "Malik")).m!.reteach === undefined, "re-teach done");
  await visible(malik.getByRole("button", { name: "Needs theory again" }));

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
  await textsAre(priya.locator(".lv-pill b"), ["L2", "L3"]);

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
  await row(small, "Vimal").locator(".lv-pill").click();
  await visible(small.locator(".sheet .ct-list"));
  await contains(small.locator(".sheet .ct-row", { hasText: "Q56" }).locator(".ct-key"), "B56");
  expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const box = (await small.locator(".sheet").boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  await shot(small, "m09-correct-level-360px");
  await small.locator(".sheet").getByRole("button", { name: "Close" }).click();
  await row(small, "Vimal").locator(".reg-strip").click();
  await visible(row(small, "Vimal").locator(".mtable"));
  expect(await small.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await shot(small, "m10-marks-table-360px", true);
  await small.context().close();

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
    // Only her tab, though the phone last showed Theory.
    await textsAre(R.locator(".tabs .tab"), ["Correction"]);
    await contains(R.locator(".tabs .tab.on"), "Correction");
    await visible(R.getByRole("button", { name: /^Attendance/ })); // Correction takes attendance
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
    await textsAre(R.locator(".tabs .tab"), ["Correction"]);

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
