// The family app on simulated phones (app.aristora.org = /f/ here), against the real functions:
// a family link opens it on Home; the map (each term a World, each unit a Stage), the Stage's Levels; Level 1 and
// Level 2 typed on the pads and checked once each; the reveal, XP, the flame and this week's race; then Correction on
// the class phone: ⌂ on her name and level, Checked, a level with a question the phone left to the corrector; and Home
// with her in class, her day hour by hour. The new look (3 Nov 2026): the centre's class hours, two children on one
// phone, feedback read by the owner, the questions as printed. Fake answers and made-up questions only (the repo is
// public); the book is the U01 skeleton.

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { secretHash } from "../../convex/lib/auth";
import { outOf } from "../../convex/lib/book";
import { readWorkbookHtml } from "../../src/workbookFile";
import U01_BOOK from "../fixtures/workbook-g8-u01.html?raw";
import { addPerson, OWNER_TOKEN } from "../helpers";
import { makeBackend, playwright, serveDist } from "./harness";

type Page = import("playwright").Page;
type Browser = import("playwright").Browser;
type L = import("playwright").Locator;

const BOOK = readWorkbookHtml(U01_BOOK, "G8_U01_Workbook_source_v3.zip")[0];
const modules = import.meta.glob("../../convex/**/*.ts");
const SHOTS = process.env.SHOTS ?? resolve("test-results/shots");
const size = (width: number, height: number) => ({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

/** Fake answers in the shapes of his keys. Level 1 (Q1–10): the phone marks all; Level 2 (Q11–20): Q20 is a name. */
function fakeKey() {
  const out: { q: number; a?: string; parts?: { p: string; a: string; m: number }[] }[] = [];
  for (let q = 1; q <= 52; q++) {
    const d = q % 10;
    const a =
      d === 0 && q > 10 ? "சிறப்புப் பெயர்" : d === 9 ? `${q}, ${q + 1}` : d === 7 ? `${q}n − 1` : d === 3 ? `${q * 3} (${q * 3 + 1} உம் ஏற்கலாம்)` : String(q * 3);
    out.push({ q, a });
  }
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `work = **${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}

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
const contains = (l: L, text: string) => until(async () => (await l.first().innerText()).includes(text), `"${text}" in ${l}`);
async function shot(p: Page, name: string) {
  await p.waitForTimeout(450); // the rise animation
  await p.screenshot({ path: join(SHOTS, `${name}.png`) });
}
async function noSideScroll(p: Page) {
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function open(backend: ReturnType<typeof makeBackend>, url: string, sz = size(360, 740), init?: () => void) {
  const ctx = await browser.newContext(sz);
  await backend.attach(ctx);
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`[${url.slice(-30)} error] ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`[pageerror] ${e.message}`));
  await page.goto(url);
  return page;
}

/** A tab of the bottom bar. */
const tabTo = (p: Page, name: RegExp) => p.locator(".f-tabs").getByRole("button", { name }).click();

/** Inside his Stage: the Level he can play now (the gold one with START) is this one. */
async function playIs(p: Page, level: string) {
  await until(async () => ((await p.locator(".f-lv.play").first().getAttribute("aria-label")) ?? "").startsWith(`${level}:`), `${level} to play in the Stage`);
}

/** From the main tabs: the map, his Stage now (the gold star), its Level to play. */
async function stageNow(p: Page, level: string) {
  await tabTo(p, /Learn/);
  await p.locator(".f-node.s-now").click();
  await playIs(p, level);
}

/** Home's goal for today names his Level now. */
const goalIs = (p: Page, level: string) => contains(p.locator(".f-goal-t"), level);

/** Type one answer on the pad (keys by their names), then → to the next box. */
async function type(p: Page, keys: string[]) {
  for (const k of keys) await p.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
  await p.locator(".f-padkeys .f-key.next").click();
}

test("the family app: join, a level on the pad, Check once, the reveal, XP and the board; Correction's ⌂ and Checked", async () => {
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key: fakeKey(),
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.students.add, { ...as, name: "Bilal M", grade: 8, term: 1, stage: "master", unitId: u01 });
  const code = "hana-family-link-0123456789ab";
  await t.mutation(api.families.makeLink, { ...as, studentId: hana, codeHash: secretHash("family-link", code) });

  // The family link: hello, Start; Home with today's goal; the map; the Stage.
  const F = await open(backend, `${site.url}/f/#join=${code}`); // as the family link: app.aristora.org/f/#join=…
  await contains(F.locator(".f-h1"), "Hana");
  await shot(F, "fam00-join");
  await F.getByRole("button", { name: "தொடங்கு" }).click();
  await goalIs(F, "Level 1");
  expect(await F.evaluate(() => location.hash)).toBe(""); // the code leaves the address bar
  await noSideScroll(F);
  await shot(F, "fam01-home");
  await tabTo(F, /Learn/);
  await visible(F.locator('.f-world[aria-label="World 1"]'));
  await contains(F.locator(".f-hero .f-cont"), "Level 1");
  await noSideScroll(F);
  await shot(F, "fam01b-map");
  await F.locator(".f-node.s-now").click();
  await playIs(F, "Level 1");
  await noSideScroll(F);
  await shot(F, "fam01c-stage");

  // Level 1 on the pad: Q1–Q7 and Q9–Q10 right (Q3 with the answer also accepted, Q9 the other way round), Q8 wrong.
  await F.locator(".f-lv.play").click();
  await contains(F.locator(".f-qn"), "Q1");
  await type(F, ["3"]);
  await type(F, ["6"]);
  await type(F, ["1", "0"]);
  await type(F, ["1", "2"]);
  await type(F, ["1", "5"]);
  await type(F, ["1", "8"]);
  await contains(F.locator(".f-qn"), "Q7");
  await visible(F.locator(".f-padkeys.x")); // an answer in n: the n pad
  for (const k of ["n", "+", "6", "n", "-"]) await F.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
  await contains(F.locator(".f-box.on .f-bval"), "n + 6n −".replace(/ /g, "")); // shown with a real minus
  await shot(F, "fam02-level-n-pad");
  await type(F, ["1"]);
  await type(F, ["9", "9"]);
  await type(F, ["1", "0"]);
  await type(F, ["9"]);
  await type(F, ["3", "0"]);
  await contains(F.locator(".f-review"), "சரிபார்க்கவா");
  await noSideScroll(F);
  await shot(F, "fam03-review");
  await F.locator(".f-review").getByRole("button", { name: "சரிபார் ✓" }).click();

  // The reveal: 18 of 20, Q8 wrong, +18 XP, a 1-day streak.
  await contains(F.locator(".f-big"), "18");
  await contains(F.locator(".f-big"), "/ 20");
  await until(async () => (await F.locator(".f-rrow.bad").allInnerTexts()).join() .includes("Q8"), "Q8 wrong");
  await contains(F.locator(".f-gain"), "+18 XP");
  await contains(F.locator(".f-gain"), "1 நாள்");
  await noSideScroll(F);
  await shot(F, "fam04-result");

  // Next level from the reveal: Level 2 (Q20 is a name: the teacher marks it).
  await F.getByRole("button", { name: /அடுத்த Level 2/ }).click();
  await contains(F.locator(".f-qn"), "Q11");
  for (const a of [["3", "3"], ["3", "6"], ["3", "9"], ["4", "2"], ["4", "5"], ["4", "8"]]) await type(F, a);
  for (const k of ["1", "7", "n", "-", "1"]) await F.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
  await F.locator(".f-padkeys .f-key.next").click();
  await type(F, ["5", "4"]);
  await type(F, ["1", "9"]);
  await type(F, ["2", "0"]);
  await contains(F.locator(".f-teach"), "ஆசிரியர்");
  await F.locator(".f-padkeys .f-key.next").click();
  await contains(F.locator(".f-review"), "ஆசிரியர் திருத்துவார்");
  await F.locator(".f-review").getByRole("button", { name: "சரிபார் ✓" }).click();
  await contains(F.locator(".f-big"), "18");
  await contains(F.locator(".f-big"), "/ 18");
  await visible(F.locator(".f-rrow.teach"));
  await F.getByRole("button", { name: /^Stage 1/ }).click();

  // The Stage: Levels 1 and 2 marked at home (⌂), Level 3 next; XP 36; the flame lit.
  await playIs(F, "Level 3");
  await contains(F.locator(".f-pill.gem"), "36");
  await visible(F.locator(".f-pill.fire.lit"));
  expect(await F.locator(".f-lv.s-check").count()).toBe(2);
  await shot(F, "fam05-stage-after");
  await F.getByRole("button", { name: "Back" }).click(); // to the map
  await F.locator(".f-toprow .f-pill.gem").click(); // the XP opens the race
  await contains(F.locator(".f-pod.me"), "36");
  await contains(F.locator(".f-pass.top"), "முதலிடத்தில்");
  await noSideScroll(F);
  await shot(F, "fam06-board");

  // A small phone (already signed in): the pad and the boxes fit 320 px.
  await t.run(async (ctx) => {
    await ctx.db.insert("familyDevices", {
      studentId: hana,
      tokenHash: secretHash("family-token", "family-phone-token-small-0123456789abcdefghijklmnop"),
      label: "Small",
      createdAt: Date.now(),
      lastSeenAt: Date.now(),
    });
  });
  const S = await open(backend, `${site.url}/f/index.html`, size(320, 568), () => {
    if (!sessionStorage.getItem("t")) {
      sessionStorage.setItem("t", "1");
      localStorage.setItem("aristora.family.token", "family-phone-token-small-0123456789abcdefghijklmnop");
    }
  });
  await goalIs(S, "Level 3");
  await noSideScroll(S);
  await shot(S, "fam07a-home-320");
  await stageNow(S, "Level 3");
  await noSideScroll(S);
  await shot(S, "fam07b-stage-320");
  await S.locator(".f-lv.play").click();
  await contains(S.locator(".f-qn"), "Q21");
  await noSideScroll(S);
  await shot(S, "fam07-level-320");

  // Correction (the class phone): Hana is in; ⌂ on her name; Level 1 opens with the phone's marks: Checked.
  await t.mutation(api.students.setPresent, { ...as, id: hana, present: true });
  const C = await open(backend, site.url, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
    localStorage.setItem("aristora.grade.focus", "8");
  });
  const pill = C.locator(".fc-nm", { hasText: "Hana K" });
  await visible(pill);
  await visible(pill.locator(".fc-nm-h"));
  await pill.click();
  await contains(C.locator(".fc-lvline"), "marked at home 18 / 20");
  await visible(C.locator(".fc-lb.home"));
  await contains(C.locator(".fc-remark"), "Marked at home");
  await shot(C, "fam08-correction-home");
  await C.waitForTimeout(800); // Save/Checked lights after 700 ms
  await C.locator(".fc-hcheck").click();
  await contains(C.locator(".toast").last(), "Checked: Hana K, Level 1");
  // Level 2 opens next: Q20 is the corrector's to mark (no Checked until it is).
  await contains(C.locator(".fc-lvline"), "Level 2");
  await contains(C.locator(".fc-warn"), "Q20");
  expect(await C.locator(".fc-hcheck").count()).toBe(0);
  await shot(C, "fam09-correction-home-q20");

  // The family app: Home shows her in class now and her day hour by hour (in, the two levels marked at home); the
  // Stage shows Level 1 checked (done), Level 2 still ⌂.
  await F.reload();
  await tabTo(F, /Home/);
  await contains(F.locator(".f-today"), "இப்போது வகுப்பில்");
  await contains(F.locator(".f-tl"), "வகுப்புக்கு வந்தாய்");
  await contains(F.locator(".f-tl"), "வீட்டில், phone இல்");
  expect(await F.locator(".f-tl .f-tli.h-home").count()).toBe(2);
  await noSideScroll(F);
  await shot(F, "fam09b-home-in-class");
  await stageNow(F, "Level 3");
  await until(async () => (await F.locator(".f-lv.s-check").count()) === 1, "Level 1 checked");
  expect(await F.locator(".f-lv.s-done").count()).toBe(1);

  expect(problems).toEqual([]);
});

test("index and code: the Family sheet shows them (the code made on the phone); a family phone signs in with them", async () => {
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key: fakeKey(),
  });
  await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });

  // The owner: Settings → Students → Grade 8 → Hana K (#1001) → Family: her index and a code made on this phone.
  const C = await open(backend, site.url, size(360, 740), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await C.getByRole("button", { name: "Settings" }).click();
  await C.getByRole("button", { name: /^Grade 8\b/ }).click();
  const row = C.locator(".settings-body > .plain-list li", { hasText: "Hana K" });
  await contains(row.locator(".st-who small"), "#1001");
  await row.getByRole("button", { name: "Family" }).click();
  const idcode = C.locator(".fam-idcode b");
  await until(async () => /^\d{4}$/.test((await idcode.nth(1).innerText()).trim()), "her code");
  expect((await idcode.nth(0).innerText()).trim()).toBe("1001");
  const code = (await idcode.nth(1).innerText()).trim();
  await contains(C.locator(".fam-how"), "types these");
  await noSideScroll(C);
  await shot(C, "fam10-family-sheet");

  // A family phone with no link: index and code. A wrong code first.
  const P = await open(backend, `${site.url}/f/`, size(360, 740));
  await visible(P.locator(".f-form"));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill(code === "0001" ? "0002" : "0001");
  await P.getByRole("button", { name: "உள்நுழை" }).click();
  await contains(P.locator(".f-err"), "தவறு");
  await noSideScroll(P);
  await shot(P, "fam11-signin-wrong");
  await P.getByLabel("Code").fill(code);
  await P.getByRole("button", { name: "உள்நுழை" }).click();
  await goalIs(P, "Level 1");
  await shot(P, "fam12-signed-in");

  expect(problems).toEqual([]);
});

test("the new look: class hours and Home, the map, the questions as printed, feedback the owner reads, two children on one phone, the race and Me", async () => {
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key: fakeKey(),
  });
  // Level 1's questions as printed (made-up text in the book's shapes) and the book's style.
  await t.run(async (ctx) => {
    for (let q = 1; q <= 10; q++) {
      await ctx.db.insert("questions", {
        unitId: u01,
        stage: "master",
        q,
        html: `<div class="pq"><span class="qn">${q}</span><div class="qt">A made-up question number ${q}: find the next term of 3, 6, 9, …</div></div>`,
      });
    }
    await ctx.db.insert("bookCss", { unitId: u01, stage: "master", css: ".qn { font-weight: 700; margin-right: 6px; } .qt { display: inline; }", updatedAt: 0 });
    const book = (await ctx.db.query("books").withIndex("by_unit_stage", (x) => x.eq("unitId", u01).eq("stage", "master")).first())!;
    await ctx.db.patch(book._id, { qCount: 10 });
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  const bilal = await t.mutation(api.students.add, { ...as, name: "Bilal M", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  await t.mutation(api.families.setCode, { ...as, studentId: bilal, code: "5820" });
  // Grade 8's class hours (the owner, Settings → Class hours; each grade its own): open all day, every day, here.
  await t.mutation(api.families.setClassHours, { ...as, grade: 8, hours: Array.from({ length: 7 }, () => ({ from: 1, to: 1439 })) });

  // Hana signs in with her index and code: Home (the class is on now, her goal, her week), then the map.
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "உள்நுழை" }).click();
  await goalIs(P, "Level 1");
  await contains(P.locator(".f-today"), "இப்போது வகுப்பு நடக்கிறது");
  await visible(P.locator(".f-weekstrip .f-wd.today.open"));
  await contains(P.locator(".f-dayhours"), "12:01 AM – 11:59 PM");
  await noSideScroll(P);
  await shot(P, "fam13-home");
  await tabTo(P, /Learn/);
  await visible(P.locator(".f-hero .f-owlbadge .owl")); // the loading page's own owl, drawn again
  await noSideScroll(P);
  await shot(P, "fam13b-map");
  await P.locator(".f-node.s-now").click();
  await playIs(P, "Level 1");

  // No workbook with her: the switch shows each question as printed above its boxes; it stays on for the next one.
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  expect(await P.locator(".f-paper").count()).toBe(0);
  await P.locator(".f-qmode").click();
  const printed = () => P.locator(".f-paper").evaluate((el) => el.shadowRoot?.querySelector(".qv")?.textContent ?? "");
  await until(async () => (await printed()).includes("made-up question number 1"), "Q1 as printed");
  await noSideScroll(P);
  await shot(P, "fam14-question-mode");
  await type(P, ["3"]);
  await contains(P.locator(".f-qn"), "Q2");
  await until(async () => (await printed()).includes("made-up question number 2"), "Q2 as printed");
  await P.locator(".f-qmode").click(); // off: only the boxes
  await until(async () => (await P.locator(".f-paper").count()) === 0, "no question when off");
  await P.getByRole("button", { name: "Back" }).click(); // the Level → its Stage
  await playIs(P, "Level 1");
  await P.getByRole("button", { name: "Back" }).click(); // the Stage → the map
  await visible(P.locator(".f-world"));

  // Feedback: a face, what about, a few words, with her name; then one without it.
  await P.getByRole("button", { name: /Feedback/ }).click();
  await visible(P.locator(".f-sheet.f-fb"));
  await P.getByRole("radio", { name: "மிக நன்று", exact: true }).click();
  await P.getByRole("button", { name: "வகுப்பு", exact: true }).click();
  await P.locator(".f-fb-text textarea").fill("Theory class was great today");
  await noSideScroll(P);
  await shot(P, "fam15-feedback");
  await P.getByRole("button", { name: "அனுப்பு", exact: true }).click();
  await visible(P.locator(".f-thanks"));
  await until(async () => (await P.locator(".f-sheet").count()) === 0, "the sheet closes");
  await P.getByRole("button", { name: /Feedback/ }).click();
  await P.getByRole("radio", { name: "மோசம்", exact: true }).click();
  await P.locator(".f-fb-text textarea").fill("Evaluation was too fast");
  await P.locator(".f-named").click();
  await contains(P.locator(".f-named"), "Grade 8");
  await P.getByRole("button", { name: "அனுப்பு", exact: true }).click();
  await visible(P.locator(".f-thanks"));
  const rows = await t.run(async (ctx) => await ctx.db.query("familyFeedback").collect());
  expect(rows.map((r) => [r.mood, r.name ?? null, r.text])).toEqual([
    [5, "Hana K", "Theory class was great today"],
    [2, null, "Evaluation was too fast"],
  ]);

  // The race and Me.
  await until(async () => (await P.locator(".f-sheet").count()) === 0, "the sheet closes");
  await tabTo(P, /Race/);
  await visible(P.locator(".f-race"));
  await noSideScroll(P);
  await shot(P, "fam16-race");
  await tabTo(P, /Me$/);
  await contains(P.locator(".f-profile"), "Hana K");
  await contains(P.locator(".f-profile"), "#1001");
  expect(await P.locator(".f-medals.grid .f-medal").count()).toBe(9);
  await noSideScroll(P);
  await shot(P, "fam17-me");

  // Her brother on the same phone: + another child (his index and code); the top bar says who is on screen.
  await P.getByRole("button", { name: /இன்னொரு பிள்ளையைச் சேர்/ }).click();
  await contains(P.locator(".f-h1"), "இன்னொரு பிள்ளை");
  await P.getByLabel(/Index/).fill("1002");
  await P.getByLabel("Code").fill("5820");
  await P.getByRole("button", { name: "உள்நுழை" }).click();
  await contains(P.locator(".f-who"), "Bilal");
  await contains(P.locator(".f-caret.many"), "2");
  await goalIs(P, "Level 1");
  await shot(P, "fam18-second-child");
  // Switch back to Hana from the top bar: her XP, her map.
  await P.locator(".f-who").click();
  await visible(P.locator(".f-sheet .f-kid", { hasText: "Bilal M" }));
  await shot(P, "fam19-children");
  await P.locator(".f-sheet .f-kid", { hasText: "Hana K" }).click();
  await contains(P.locator(".f-who"), "Hana");
  // Bilal signs out of this phone (from Me): Hana stays; his phone key stops on the server.
  await P.locator(".f-who").click();
  await P.locator(".f-sheet .f-kid", { hasText: "Bilal M" }).click();
  await contains(P.locator(".f-who"), "Bilal");
  await tabTo(P, /Me$/);
  await P.getByRole("button", { name: /Bilal: வெளியேறு/ }).click();
  await P.getByRole("button", { name: "ஆம், வெளியேறு", exact: true }).click();
  await contains(P.locator(".f-who"), "Hana");
  await until(async () => (await P.locator(".f-caret.many").count()) === 0, "one child left");
  const bilalPhones = await t.run(async (ctx) => await ctx.db.query("familyDevices").withIndex("by_student", (q) => q.eq("studentId", bilal)).collect());
  expect(bilalPhones.every((d) => d.revokedAt !== undefined)).toBe(true);

  // The owner's phone: the gear counts 2 new; Settings opens on Feedback; then the count goes.
  const C = await open(backend, site.url, size(360, 780), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await contains(C.locator(".gear-n"), "2");
  await C.getByRole("button", { name: /Settings/ }).click();
  await until(async () => (await C.locator(".fbk-item").count()) === 2, "two feedback rows");
  await contains(C.locator(".fbk-item").first(), "A Grade 8 student");
  await contains(C.locator(".fbk-item").nth(1), "Hana K");
  await contains(C.locator(".fbk-item").nth(1), "Theory class was great today");
  await until(async () => (await C.locator(".gear-n").count()) === 0, "the count goes once read");
  await noSideScroll(C);
  await shot(C, "fam20-owner-feedback");
  // Settings → Class hours: each grade its own; Grade 8's hours set above, one row a day; Sunday off, saved; Grade 7
  // has none.
  await C.getByRole("button", { name: "Class hours", exact: true }).click();
  const ch = C.locator(".settings-body.ch");
  await ch.getByRole("button", { name: /^Grade 8\b/ }).click();
  await contains(ch.getByRole("button", { name: /^Grade 8\b/ }), "7d");
  await until(async () => (await C.locator(".ch-list > li").count()) === 7, "seven days");
  expect(await C.getByLabel("Monday starts").inputValue()).toBe("00:01");
  expect(await C.getByLabel("Monday ends").inputValue()).toBe("23:59");
  await C.locator(".ch-list > li").nth(6).locator('input[type="checkbox"]').click();
  await C.getByRole("button", { name: "Save Grade 8's hours" }).click();
  await contains(C.locator(".toast").last(), "Grade 8's class hours saved");
  const saved = await t.query(api.families.classHours, as);
  expect(saved["8"][6]).toBe(null);
  expect(saved["8"][0]).toEqual({ from: 1, to: 1439 });
  expect(saved["7"].every((d) => d === null)).toBe(true);
  await noSideScroll(C);
  await shot(C, "fam20b-class-hours");

  // The smallest phone: Home, the map, the race, Me and the feedback sheet fit 320 px.
  const S = await open(backend, `${site.url}/f/`, size(320, 568));
  await S.getByLabel(/Index/).fill("1001");
  await S.getByLabel("Code").fill("4719");
  await S.getByRole("button", { name: "உள்நுழை" }).click();
  await goalIs(S, "Level 1");
  await noSideScroll(S);
  await shot(S, "fam21-home-320");
  await tabTo(S, /Learn/);
  await visible(S.locator(".f-world"));
  await noSideScroll(S);
  await shot(S, "fam21b-map-320");
  await tabTo(S, /Race/);
  await visible(S.locator(".f-race"));
  await noSideScroll(S);
  await tabTo(S, /Me$/);
  await visible(S.locator(".f-profile"));
  await noSideScroll(S);
  await shot(S, "fam22-me-320");
  await S.getByRole("button", { name: /Feedback/ }).click();
  await visible(S.locator(".f-sheet.f-fb"));
  await noSideScroll(S);
  await shot(S, "fam23-feedback-320");

  expect(problems).toEqual([]);
});

test("the O/L map: the owner ticks Grade 11 for the O/L syllabus and gives today's topic; the phone shows the paper parts and goes to it", async () => {
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const ol = (await t.run(async (ctx) => await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 12)).collect())).sort(
    (a, b) => a.term - b.term || a.order - b.order,
  );
  const cons = ol.find((u) => u.term === 4 && u.en === "Constructions")!; // 08 on his sheet (Paper II B)
  // Two O/L workbooks (skeletons with a fake key): the first topic (Paper I A, 01) and Constructions.
  for (const u of [ol[0], cons]) {
    await t.mutation(api.catalog.saveWorkbook, {
      ...as,
      unitId: u._id,
      parts: [{ id: "IA", to: 10, each: 2 }],
      levels: [
        { to: 5, max: 10 },
        { to: 10, max: 10 },
      ],
      replace: true,
      key: Array.from({ length: 10 }, (_, i) => ({ q: i + 1, a: String((i + 1) * 3) })),
    });
  }
  const nila = await t.mutation(api.students.add, { ...as, name: "Nila S", grade: 11, term: 3 });
  const ravi = await t.mutation(api.students.add, { ...as, name: "Ravi T", grade: 11, term: 3 });
  await t.mutation(api.families.setCode, { ...as, studentId: nila, code: "4719" });

  // The owner: Settings → Students → 11 → "O/L map on the phone" (0 of 2) → All → Give Constructions.
  const C = await open(backend, site.url, size(360, 780), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await C.getByRole("button", { name: /Settings/ }).click();
  await C.getByRole("button", { name: /^Grade 11\b/ }).click();
  await contains(C.locator(".olm-line small"), "0 of 2 see the O/L syllabus");
  await C.locator(".olm-line").click();
  await visible(C.locator(".olm-sheet"));
  await contains(C.locator(".olm-top b"), "0 of 2 ticked");
  await until(async () => (await C.locator(".olm-topics li").count()) === 2, "the two O/L topics with a workbook");
  await contains(C.locator(".olm-topics li").first(), "Paper 1A");
  await C.locator(".olm-top").getByRole("button", { name: "All", exact: true }).click();
  await contains(C.locator(".olm-top b"), "2 of 2 ticked");
  await until(async () => (await t.run(async (ctx) => [await ctx.db.get(nila), await ctx.db.get(ravi)])).every((s) => s?.olMap === true), "both ticked");
  const row = C.locator(".olm-topics li", { hasText: cons.ta });
  await row.getByRole("button", { name: /^Give/ }).click();
  await contains(row.locator(".btn"), "✓ Given");
  await contains(C.locator(".toast").last(), "open on 2 phones");
  const given = await t.run(async (ctx) => await ctx.db.query("handouts").collect());
  expect(given.filter((h) => h.unitId === cons._id && h.stage === "master").map((h) => h.studentId).sort()).toEqual([nila, ravi].sort());
  await noSideScroll(C);
  await shot(C, "fam24-ol-sheet");
  // Ravi unticked there: his grade's map again. The list shows O/L on Nila only; her Family sheet has the tick on.
  await C.locator(".olm-kid", { hasText: "Ravi T" }).locator("input").click();
  await contains(C.locator(".olm-top b"), "1 of 2 ticked");
  await until(async () => (await t.run(async (ctx) => await ctx.db.get(ravi)))?.olMap === undefined, "Ravi unticked");
  await C.locator(".olm-sheet").getByRole("button", { name: "Close" }).click();
  await contains(C.locator(".olm-line small"), "1 of 2");
  await visible(C.locator(".settings-body > .plain-list li", { hasText: "Nila S" }).locator(".ol-tag"));
  expect(await C.locator(".settings-body > .plain-list li", { hasText: "Ravi T" }).locator(".ol-tag").count()).toBe(0);
  await noSideScroll(C);
  await shot(C, "fam25-ol-students");
  await C.locator(".settings-body > .plain-list li", { hasText: "Nila S" }).getByRole("button", { name: "Family" }).click();
  await until(async () => await C.locator(".fam-open", { hasText: "O/L map" }).locator("input").isChecked(), "her O/L tick on the Family sheet");

  // Nila's phone: the O/L map, each paper part a World; today's topic is the one to do (Continue → its Level 1).
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "உள்நுழை" }).click();
  await goalIs(P, "Level 1");
  await contains(P.locator(".f-goal"), cons.ta);
  await tabTo(P, /Learn/);
  await contains(P.locator(".f-hero .f-title"), cons.ta);
  await contains(P.locator(".f-hero .f-kicker"), "பகுதி 2B");
  await until(async () => (await P.locator(".f-wbanner").count()) === 4, "four Worlds: the paper parts");
  await contains(P.locator(".f-wbanner").first(), "பகுதி 1A");
  await contains(P.locator(".f-wbanner").nth(3), "பகுதி 2B");
  await noSideScroll(P);
  await shot(P, "fam26-ol-map");
  await P.locator(".f-cont").click();
  await contains(P.locator(".f-qn"), "Q1");
  await noSideScroll(P);

  // The smallest phone: the sheet fits 320 px.
  const S = await open(backend, site.url, size(320, 568), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await S.getByRole("button", { name: /Settings/ }).click();
  await S.getByRole("button", { name: /^Grade 11\b/ }).click();
  await noSideScroll(S);
  await S.locator(".olm-line").click();
  await visible(S.locator(".olm-topics"));
  await noSideScroll(S);
  await shot(S, "fam27-ol-sheet-320");

  expect(problems).toEqual([]);
});
