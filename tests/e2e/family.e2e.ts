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
import { strToU8, zipSync } from "fflate";
import { readWorkbookFiles, readWorkbookHtml, type ReadTute } from "../../src/workbookFile";
import TUTE_HTML from "../fixtures/tute-skeleton.html?raw";
import TUTE_JSON from "../fixtures/tute-skeleton.json?raw";
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

/**
 * Fake answers in the shapes of his keys. Level 1 (Q1–10): the phone marks all; Level 2 (Q11–20): Q20 is a name;
 * Level 3 opens on a percentage (Q21: the % printed after the box), then a ratio (Q22) and a time (Q24).
 */
function fakeKey() {
  const out: { q: number; a?: string; parts?: { p: string; a: string; m: number }[] }[] = [];
  const shapes: Record<number, string> = { 21: "63%", 22: "22 : 25", 24: "1 h 24 min" };
  for (let q = 1; q <= 52; q++) {
    const d = q % 10;
    const a =
      shapes[q] ??
      (d === 0 && q > 10 ? "சிறப்புப் பெயர்" : d === 9 ? `${q}, ${q + 1}` : d === 7 ? `${q}n − 1` : d === 3 ? `${q * 3} (${q * 3 + 1} உம் ஏற்கலாம்)` : String(q * 3));
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
  await F.getByRole("button", { name: "START" }).click();
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
  await F.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();

  // The reveal: 18 of 20, Q8 wrong, +18 XP, a 1-day streak.
  await contains(F.locator(".f-big"), "18");
  await contains(F.locator(".f-big"), "/ 20");
  await until(async () => (await F.locator(".f-rrow.bad").allInnerTexts()).join() .includes("Q8"), "Q8 wrong");
  await contains(F.locator(".f-gain"), "+18 XP");
  await contains(F.locator(".f-gain"), "1 day");
  await noSideScroll(F);
  await shot(F, "fam04-result");

  // Next level from the reveal: Level 2 (Q20 is a name: the teacher marks it).
  await F.getByRole("button", { name: /Next: Level 2/ }).click();
  await contains(F.locator(".f-qn"), "Q11");
  for (const a of [["3", "3"], ["3", "6"], ["3", "9"]]) await type(F, a);
  // She leaves after Q13 and comes back later: the level opens on Q14, where she left (his ask, 4 Nov 2026).
  await contains(F.locator(".f-qn"), "Q14");
  await F.getByRole("button", { name: "Back" }).click();
  await playIs(F, "Level 2");
  await F.locator(".f-lv.play").click();
  await contains(F.locator(".f-qn"), "Q14");
  await visible(F.locator(".f-qchip.on", { hasText: "14" }));
  expect(await F.locator(".f-qchip.full").count()).toBe(3); // Q11–13 still typed
  for (const a of [["4", "2"], ["4", "5"], ["4", "8"]]) await type(F, a);
  for (const k of ["1", "7", "n", "-", "1"]) await F.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
  await F.locator(".f-padkeys .f-key.next").click();
  await type(F, ["5", "4"]);
  await type(F, ["1", "9"]);
  await type(F, ["2", "0"]);
  // Q20 is the teacher's: no box, the pad pale but → goes on; a key says why instead of doing nothing.
  await contains(F.locator(".f-teach"), "தாளில்");
  await visible(F.locator(".f-key.f-keyoff"));
  await F.locator(".f-padkeys").getByRole("button", { name: "5", exact: true }).click({ force: true }); // aria-disabled, still a tap
  await contains(F.locator(".f-toast"), "தாளில்");
  await noSideScroll(F);
  await shot(F, "fam03b-teacher-question");
  await F.locator(".f-padkeys .f-key.next").click();
  await contains(F.locator(".f-review"), "ஆசிரியர் திருத்துவார்");
  await F.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();
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
  // A percentage: she types 63, the % is printed after her box.
  await contains(S.locator(".f-box.on .f-bunit"), "%");
  await S.locator(".f-padkeys").getByRole("button", { name: "6", exact: true }).click();
  await S.locator(".f-padkeys").getByRole("button", { name: "3", exact: true }).click();
  await contains(S.locator(".f-box.on .f-bval"), "63");
  await noSideScroll(S);
  await shot(S, "fam07-level-320");
  // A ratio: two boxes with ":" between them; a time: hours and minutes.
  await S.locator(".f-qchip", { hasText: "22" }).click();
  await contains(S.locator(".f-bjoin"), ":");
  expect(await S.locator(".f-qcard .f-box").count()).toBe(2);
  await noSideScroll(S);
  await shot(S, "fam07c-ratio-320");
  await S.locator(".f-qchip", { hasText: "24" }).click();
  await contains(S.locator(".f-qcard .f-box").nth(1).locator(".f-bunit"), "min");
  await noSideScroll(S);
  await shot(S, "fam07d-time-320");
  // Q8, wrong in Level 1, comes back at the end of Level 3 (his idea, 4 Nov 2026): the marks he lost are his to win back.
  await S.locator(".f-qchip.re", { hasText: "8" }).click();
  await contains(S.locator(".f-again"), "Level 1");
  await contains(S.locator(".f-xpchip.re"), "+2 XP");
  await noSideScroll(S);
  await shot(S, "fam07e-again-320");

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
  await contains(F.locator(".f-today"), "In class now");
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
  await P.getByRole("button", { name: "Sign in" }).click();
  await contains(P.locator(".f-err"), "தவறு");
  await noSideScroll(P);
  await shot(P, "fam11-signin-wrong");
  await P.getByLabel("Code").fill(code);
  await P.getByRole("button", { name: "Sign in" }).click();
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
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 1");
  await contains(P.locator(".f-today"), "Class is on now");
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
  await P.getByRole("button", { name: "Class", exact: true }).click();
  await P.locator(".f-fb-text textarea").fill("Theory class was great today");
  await noSideScroll(P);
  await shot(P, "fam15-feedback");
  await P.getByRole("button", { name: "Send", exact: true }).click();
  await visible(P.locator(".f-thanks"));
  await until(async () => (await P.locator(".f-sheet").count()) === 0, "the sheet closes");
  await P.getByRole("button", { name: /Feedback/ }).click();
  await P.getByRole("radio", { name: "மோசம்", exact: true }).click();
  await P.locator(".f-fb-text textarea").fill("Evaluation was too fast");
  await P.locator(".f-named").click();
  await contains(P.locator(".f-named"), "Grade 8");
  await P.getByRole("button", { name: "Send", exact: true }).click();
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
  // Her profile (4 Nov 2026): her name and index by her photo (her letter until she adds one).
  await contains(P.locator(".f-me-id"), "Hana K");
  await contains(P.locator(".f-me-id"), "#1001");
  expect(await P.locator(".f-medals.grid .f-medal").count()).toBe(9);
  await noSideScroll(P);
  await shot(P, "fam17-me");

  // Her brother on the same phone: + another child (his index and code); the top bar says who is on screen.
  await P.getByRole("button", { name: /Add a child/ }).click();
  await contains(P.locator(".f-h1"), "Add a child");
  await P.getByLabel(/Index/).fill("1002");
  await P.getByLabel("Code").fill("5820");
  await P.getByRole("button", { name: "Sign in" }).click();
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
  await P.getByRole("button", { name: /Sign out Bilal/ }).click();
  await P.locator(".f-sure").getByRole("button", { name: "Sign out", exact: true }).click();
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
  await S.getByRole("button", { name: "Sign in" }).click();
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
  await visible(S.locator(".f-me-id"));
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
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 1");
  await contains(P.locator(".f-goal"), cons.ta);
  await tabTo(P, /Learn/);
  await contains(P.locator(".f-hero .f-title"), cons.ta);
  await contains(P.locator(".f-hero .f-kicker"), "PART 2B"); // the kicker in English letters; the banner below in Tamil
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

/** Every frame while he taps →: how far the page sticks out past the phone, where the pad ends, the page's scroll. */
async function framesOf(p: Page, act: () => Promise<void>) {
  await p.evaluate(() => {
    const w = window as unknown as { __f: { wide: number; pad: number; y: number }[]; __on: boolean };
    w.__f = [];
    w.__on = true;
    const f = () => {
      w.__f.push({
        wide: document.documentElement.scrollWidth - window.visualViewport!.width,
        pad: Math.round(document.querySelector(".f-padkeys")?.getBoundingClientRect().bottom ?? -1),
        y: Math.round(window.scrollY),
      });
      if (w.__on) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await p.waitForTimeout(50);
  await act();
  await p.waitForTimeout(600); // the slide (0.32 s) and the frames after it
  const frames = await p.evaluate(() => {
    const w = window as unknown as { __f: { wide: number; pad: number; y: number }[]; __on: boolean };
    w.__on = false;
    return w.__f;
  });
  return { frames, ys: frames.map((f) => f.y).filter((y, i, a) => i === 0 || y !== a[i - 1]) };
}

/** He scrolls down to his box under a tall printed question (drawn a moment after the question comes). */
const scrollDown = (p: Page, what: string) =>
  until(() => p.evaluate(() => (window.scrollTo(0, document.documentElement.scrollHeight), window.scrollY > 100)), `scrolled down to ${what}`);

test("a level holds still: → never makes the page wider than the phone or moves the pad; a new question starts at the top", async () => {
  // His report (4 Nov 2026): after → the screen bounced. The next question slid in 12px past the phone's edge, so
  // Chrome made its viewport bigger for ~130 ms (the pad dropped 24px and came back); with the questions as printed,
  // the page jumped up to the strip and slid back down to the card.
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
  // Made-up questions as printed, each with a tall figure (taller than the space above the pad).
  await t.run(async (ctx) => {
    for (let q = 1; q <= 10; q++) {
      await ctx.db.insert("questions", {
        unitId: u01,
        stage: "master",
        q,
        html: `<div class="pq"><span class="qn">${q}</span><div class="qt">A made-up question number ${q} with a figure.</div><div class="fig"></div></div>`,
      });
    }
    await ctx.db.insert("bookCss", { unitId: u01, stage: "master", css: ".qn { font-weight: 700; } .fig { height: 420px; margin-top: 8px; background: #eee; }", updatedAt: 0 });
    const book = (await ctx.db.query("books").withIndex("by_unit_stage", (x) => x.eq("unitId", u01).eq("stage", "master")).first())!;
    await ctx.db.patch(book._id, { qCount: 10 });
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });

  const P = await open(backend, `${site.url}/f/`, size(360, 640));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await stageNow(P, "Level 1");
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  const key = (k: string) => P.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).tap();
  const next = () => P.locator(".f-padkeys .f-key.next").tap();

  // Only the boxes: Q1 → Q2. The page never wider than the phone, the pad's bottom on the screen's bottom every frame.
  await key("3");
  const a = await framesOf(P, next);
  await contains(P.locator(".f-qn"), "Q2");
  expect(Math.max(...a.frames.map((f) => f.wide))).toBeLessThanOrEqual(0);
  expect(new Set(a.frames.map((f) => f.pad))).toEqual(new Set([640]));
  expect(a.ys).toEqual([0]);

  // The questions as printed (tall): he scrolls down to his box, types, → . The page moves once, to the top, with Q3.
  await P.locator(".f-qmode").tap();
  await until(async () => (await P.locator(".f-paper").count()) === 1, "Q2 as printed");
  await scrollDown(P, "Q2's box");
  await key("6");
  const b = await framesOf(P, next);
  await contains(P.locator(".f-qn"), "Q3");
  expect(Math.max(...b.frames.map((f) => f.wide))).toBeLessThanOrEqual(0);
  expect(new Set(b.frames.map((f) => f.pad))).toEqual(new Set([640]));
  expect(b.ys.length).toBe(2); // where he was, then the top: never up and back down again
  expect(b.ys[1]).toBe(0);
  await visible(P.locator(".f-qchip.on", { hasText: "3" }));
  await noSideScroll(P);
  await shot(P, "fam28-next-question-top-360");

  // Q3–Q8, then Q9 (two boxes): he scrolls down to them; → to its second box keeps his place; → to Q10 = the top.
  for (const ans of [["9"], ["1", "2"], ["1", "5"], ["1", "8"], ["n", "+", "1"], ["2", "4"]]) {
    for (const k of ans) await key(k);
    await next();
  }
  await contains(P.locator(".f-qn"), "Q9");
  expect(await P.evaluate(() => window.scrollY)).toBe(0);
  await scrollDown(P, "Q9's boxes");
  const y9 = await P.evaluate(() => Math.round(window.scrollY));
  await key("9");
  await next(); // Q9's second box
  await visible(P.locator(".f-box.on", { hasText: "?" }));
  expect(await P.evaluate(() => Math.round(window.scrollY))).toBe(y9);
  await key("1");
  await key("0");
  const c = await framesOf(P, next);
  await contains(P.locator(".f-qn"), "Q10");
  expect(c.ys).toEqual([y9, 0]);
  expect(Math.max(...c.frames.map((f) => f.wide))).toBeLessThanOrEqual(0);

  // His last → opens the review: a new page, at the top too.
  await scrollDown(P, "Q10's box");
  await key("3");
  await key("0");
  await next();
  await contains(P.locator(".f-review"), "சரிபார்க்கவா");
  expect(await P.evaluate(() => window.scrollY)).toBe(0);
  await noSideScroll(P);
  expect(problems).toEqual([]);
});

/** Real fingers on the glass (Chrome's own touch handling: a pinch, a swipe), not Playwright's taps. */
async function fingersOn(p: Page) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const touch = (type: string, pts: { x: number; y: number }[]) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map((q, id) => ({ x: q.x, y: q.y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const move = async (from: { x: number; y: number }[], to: { x: number; y: number }[]) => {
    await touch("touchStart", from);
    for (let i = 1; i <= 12; i++) {
      await touch("touchMove", from.map((f, j) => ({ x: f.x + ((to[j].x - f.x) * i) / 12, y: f.y + ((to[j].y - f.y) * i) / 12 })));
      await new Promise((r) => setTimeout(r, 16));
    }
    await touch("touchEnd", []);
    await p.waitForTimeout(400);
  };
  return {
    /** Two fingers spread apart around (x, y): what zooms a web page. */
    pinch: (x: number, y: number) => move([{ x: x - 30, y }, { x: x + 30, y }], [{ x: x - 90, y }, { x: x + 90, y }]),
    /** One finger dragged across. */
    swipe: (from: { x: number; y: number }, to: { x: number; y: number }) => move([from], [to]),
  };
}
const zoomOf = (p: Page) => p.evaluate(() => window.visualViewport!.scale);

test("an app, not a web page: two fingers never zoom (Home, the map, a Level's pad and question); one finger still scrolls", async () => {
  // His ask (4 Nov 2026): "students want to feel like a native app, so don't zoom when we use two fingers". Before,
  // two thumbs on the pad zoomed the page to 1.5x and pushed the bottom bar off the screen.
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
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });

  const P = await open(backend, `${site.url}/f/`, size(360, 740));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 1");
  const f = await fingersOn(P);
  await f.pinch(180, 400);
  expect(await zoomOf(P)).toBe(1);

  // The map: one finger scrolls it; two fingers still don't zoom.
  await tabTo(P, /Learn/);
  await visible(P.locator(".f-node.s-now"));
  await f.swipe({ x: 180, y: 600 }, { x: 180, y: 200 });
  expect(await P.evaluate(() => window.scrollY)).toBeGreaterThan(150);
  await f.pinch(180, 400);
  expect(await zoomOf(P)).toBe(1);
  await P.evaluate(() => window.scrollTo(0, 0));

  // A Level: two thumbs on the pad, two fingers on the question: no zoom. The question strip still slides sideways.
  await P.locator(".f-node.s-now").click();
  await playIs(P, "Level 1");
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  await f.pinch(180, 620);
  expect(await zoomOf(P)).toBe(1);
  await f.pinch(180, 250);
  expect(await zoomOf(P)).toBe(1);
  const strip = (await P.locator(".f-strip").boundingBox())!;
  const mid = strip.y + strip.height / 2;
  await f.swipe({ x: strip.x + strip.width - 20, y: mid }, { x: strip.x + 20, y: mid });
  expect(await P.locator(".f-strip").evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  await contains(P.locator(".f-qn"), "Q1"); // the fingers typed nothing and moved nothing
  expect(problems).toEqual([]);
});

/** A small made-up drawing on lined paper, as a phone camera would give it (PNG). */
const PAPER_PNG = "iVBORw0KGgoAAAANSUhEUgAAAGAAAABICAIAAACGBWc0AAACGklEQVR42u2cPXLCMBCFzRuqXII6J0iVQ1DT5AY5CzdwQ+0bJEWqFEmbmjqp05LCM54MxmYlrVYr87ZgGH4k+WP36bFje3U6nRrGdIAICIiACIiACIiAlhrr188fUpiJFY0iS4yACIiACEgWm81ueOQudpnOEMfjgRl0IZxwcQdoXFZOCm318vFdfBFP2+f+Sdvtp165XQ0aMuWsuKZev9ESG1OgSEuFpqwYwWFxjZOoICO4peOEEfy7nlsU6bh0KJJEcFtcTgoN/umUZVSmJ912+4h5227fO2zLNZs66XRzbG+vURGdIoWGiugUYYQaez2WzghuXY8TZ4SKiqtIoaFGOpaMUHWb2UCMUKP0WM6Vqydt2VTOOlcuJ93/pGb7cb7p1h4S/v3+ceqth6+3oHnVGelnkHznmuESQSrTjqkMSLjKMzQzBy//ZCZGWQDJ6QgrSP4VdTHSBCT5AYdDDRIX+XfVk0gNkJxOBJqgQXQZoS46wwgzAq/7FwQ2xl+LTigjF076qpG9222bpvk9dLp+Yn5YLXudqkFXiytFlRM1W0WMYOMJ1elIxlQRIxhIT+7IKkYw+MOVI33+jywZPzqJIjXIyelfBqvF4ukkihEWc75uptWiinNQCvaqsOziSi+0ACft59xlywZ2wC5m3GZ20sCWAqpdeqKVG4vcsxSPiBf18opDAiIgAiKghvfuaHjvDpYYg4DC4w9skm3oaYrUiQAAAABJRU5ErkJggg==";

test("photos from home: a drawing photographed in the level, the working on a wrong answer, marked by a person he picks; the solution and her answer on his phone", async () => {
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  // Level 1: Q8's key shows its working before the answer; Q10 is a name (the teacher marks it from a photo).
  const key = fakeKey().map((k) => (k.q === 8 ? { q: 8, a: "8 × 3 = **24**" } : k.q === 10 ? { q: 10, a: "சிறப்புப் பெயர்" } : k));
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key,
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  const code = "hana-photos-link-0123456789ab";
  await t.mutation(api.families.makeLink, { ...as, studentId: hana, codeHash: secretHash("family-link", code) });
  const NILA = "nila-photos-token-0123456789abcdefghijklmnopq";
  await addPerson(t, { name: "Nila", token: NILA, tabs: [], can: ["photos"] });
  const paper = { name: "paper.png", mimeType: "image/png", buffer: Buffer.from(PAPER_PNG, "base64") };

  // Level 1 on the pad; at Q10 (a name: the teacher's) she photographs her paper.
  const F = await open(backend, `${site.url}/f/#join=${code}`);
  await contains(F.locator(".f-h1"), "Hana");
  await F.getByRole("button", { name: "START" }).click();
  await stageNow(F, "Level 1");
  await F.locator(".f-lv.play").click();
  await contains(F.locator(".f-qn"), "Q1");
  for (const a of [["3"], ["6"], ["9"], ["1", "2"], ["1", "5"], ["1", "8"], ["7", "n", "-", "1"], ["4", "2"], ["9"], ["1", "0"]]) await type(F, a);
  await contains(F.locator(".f-qn"), "Q10");
  await contains(F.locator(".f-teach"), "படம் எடு");
  await F.locator(".f-qcard .f-file").setInputFiles(paper);
  await visible(F.locator(".f-qcard .f-thumb img"));
  await noSideScroll(F);
  await shot(F, "fam-ph01-camera");
  await F.locator(".f-padkeys .f-key.next").click();
  await F.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();

  // The reveal: 16 of 18 on the phone; below it the book: Q8 with the key's working and a camera for her working; the
  // Q10 photo goes by itself.
  await contains(F.locator(".f-big"), "16");
  const q8 = F.locator(".f-bq", { has: F.locator(".f-rq", { hasText: "Q8" }) });
  const q10 = F.locator(".f-bq", { has: F.locator(".f-rq", { hasText: "Q10" }) });
  // Q8 comes back in Level 3: no solution to copy yet (his rule, 4 Nov 2026), a gold note instead.
  await visible(q8.locator(".f-comesback"));
  expect(await q8.locator(".f-sol").count()).toBe(0);
  await contains(q8.locator(".f-bq-typed"), "42");
  await visible(q10.locator(".f-ph-state.wait"));
  await contains(F.locator(".f-owebar"), "1 படங்கள்");
  await q8.locator(".f-file").setInputFiles(paper);
  await visible(q8.locator(".f-thumb img"));
  await noSideScroll(F);
  await shot(F, "fam-ph02-book");
  await q8.getByRole("button", { name: /அனுப்பு/ }).click();
  await visible(q8.locator(".f-ph-state.wait"));
  expect(await F.locator(".f-owebar").count()).toBe(0);

  // Nila (Photos only) on the teachers' app: the gear says 2; Settings opens on Photos. Q10: marks 2. Q8: why wrong.
  const N = await open(backend, site.url, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.token", "nila-photos-token-0123456789abcdefghijklmnopq");
  });
  await contains(N.locator(".gear-n"), "2");
  await N.getByRole("button", { name: /Settings/ }).click();
  const item = N.locator(".phq-item");
  await contains(item.locator(".phq-who"), "Q10");
  await visible(item.locator(".phq-ph img"));
  await until(async () => await item.locator(".phq-ph img").evaluate((i) => (i as HTMLImageElement).naturalWidth > 0), "the photo loaded");
  await item.locator(".phq-m", { hasText: "2" }).click();
  await item.locator(".phq-chip", { hasText: "Well done" }).click();
  await shot(N, "fam-ph03-queue-part");
  await item.getByRole("button", { name: /Save/ }).click();
  await contains(item.locator(".phq-who"), "Q8");
  await contains(item.locator(".phq-typed"), "42");
  await contains(item.locator(".phq-key"), "24");
  await item.locator(".phq-chip", { hasText: "Decimal point" }).click();
  await N.locator(".phq-words input").fill("Count the places after the point");
  await shot(N, "fam-ph04-queue-working");
  await item.getByRole("button", { name: /Save/ }).click();
  await contains(N.locator(".phq-sum"), "No photos waiting");
  expect(await N.locator(".gear-n").count()).toBe(0);

  // The owner fixes how the phone reads an answer (4 Nov 2026, his ask: "do you have proper solution"): Settings → Books
  // → Grade 8 → U01 → See what the phone accepts → only the corrector's → Q20 (a name in this fake key) → its answer →
  // Save; the list shows it with ✎.
  const O = await open(backend, site.url, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await O.getByRole("button", { name: "Settings" }).click();
  await O.getByRole("button", { name: "Books", exact: true }).click();
  await O.getByRole("button", { name: /^Grade 8\b/ }).click();
  await O.locator(".unit-list li", { hasText: "U01" }).getByRole("button").first().click();
  await O.getByRole("button", { name: "See what the phone accepts" }).click();
  await O.locator(".pa-only input").check();
  const fixQ = O.locator(".phone-ans-list li", { hasText: "Q20" });
  await contains(fixQ, "corrector: சிறப்புப் பெயர்");
  await fixQ.locator(".pa-fixbtn").click();
  await fixQ.locator(".pa-form input").fill("ரூபா 60");
  await shot(O, "fam-ph07-fix-answer");
  await fixQ.getByRole("button", { name: "Save" }).click();
  await contains(O.locator(".toast").last(), "Q20: saved");
  await O.locator(".pa-only input").uncheck();
  await contains(O.locator(".phone-ans-list li", { hasText: "Q20" }), "60 ✎");
  await noSideScroll(O);

  // Hana: Level 1 has a dot on the Stage; its book has both answers, in Tamil, and Q10's marks.
  await F.reload();
  await stageNow(F, "Level 2");
  await visible(F.locator(".f-lv-dot"));
  await F.locator(".f-lv", { has: F.locator(".f-lv-dot") }).click();
  await visible(F.locator(".f-bookscr"));
  expect((await F.locator(".f-bookscr .f-kicker").innerText()).toLowerCase()).toContain("level 1");
  await contains(q8.locator(".f-answer"), "தசமப் புள்ளி");
  await contains(q8.locator(".f-answer-note"), "Count the places");
  await contains(q10.locator(".f-answer"), "2/2");
  await noSideScroll(F);
  await shot(F, "fam-ph05-answers");
  await F.setViewportSize({ width: 320, height: 640 });
  await noSideScroll(F);
  await shot(F, "fam-ph06-answers-320");
  await F.getByRole("button", { name: "Back" }).click();
  await playIs(F, "Level 2");
  expect(await F.locator(".f-lv-dot").count()).toBe(0); // opened: no longer new

  // A Check whose answer never reached the phone (his report, 4 Nov 2026: "This level is already marked", no summary,
  // the next level shut and no word why). Level 2 typed on the pad, then marked on the server behind the phone's back:
  // Check opens Level 2's book, not the same refusal forever.
  await F.locator(".f-lv.play").click();
  await contains(F.locator(".f-qn"), "Q11");
  await type(F, ["5"]);
  const famToken = await F.evaluate(() => (JSON.parse(localStorage.getItem("aristora.family.accounts") ?? "[]") as { token: string }[])[0].token);
  const checkEmpty = async (n: number) => {
    const lv = await t.query(api.family.level, { token: famToken, unitId: u01, n });
    await t.mutation(api.family.check, { token: famToken, unitId: u01, n, typed: lv.qs.map((q) => ({ q: q.q, a: [] as string[] })) });
  };
  await checkEmpty(2);
  await F.locator(".f-checkpill").click();
  await F.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();
  await visible(F.locator(".f-bookscr"));
  expect((await F.locator(".f-bookscr .f-kicker").innerText()).toLowerCase()).toContain("level 2");
  await contains(F.locator(".f-toast"), "ஏற்கனவே");
  // Levels 3 and 4 too (Level 2 still owes its photos): Level 5 waits, and the Stage says why, where he looks.
  await checkEmpty(3);
  await checkEmpty(4);
  await F.getByRole("button", { name: "Back" }).click();
  await playIs(F, "Level 5");
  await contains(F.locator(".f-stopnote"), "Level 5");
  await contains(F.locator(".f-stopnote"), "Level 2");
  await noSideScroll(F);
  await shot(F, "fam-ph08-photos-first");
  await F.locator(".f-stopnote").click();
  await visible(F.locator(".f-bookscr"));
  expect((await F.locator(".f-bookscr .f-kicker").innerText()).toLowerCase()).toContain("level 2");

  expect(problems).toEqual([]);
});

test("a printed question opens full screen: two fingers zoom only it, one finger moves it, ✕ and Back close it; words can't be selected", async () => {
  // His answers (4 Nov 2026): the app never zooms, so a printed question (10 pt, its tables and figures shrunk to fit)
  // opens full screen to be zoomed; holding a finger on words selects nothing, the typing boxes still can.
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
  // Made-up questions, each with a table far wider than a phone (shrunk to fit on the level).
  const cells = Array.from({ length: 8 }, (_, i) => `<td>${i + 1}</td>`).join("");
  await t.run(async (ctx) => {
    for (let q = 1; q <= 10; q++) {
      await ctx.db.insert("questions", {
        unitId: u01,
        stage: "master",
        q,
        html: `<div class="pq"><span class="qn">${q}</span><div class="qt">A made-up question number ${q}: read the table.</div><table class="tb"><tr><td>Made-up</td>${cells}</tr></table></div>`,
      });
    }
    await ctx.db.insert("bookCss", {
      unitId: u01,
      stage: "master",
      css: ".qn { font-weight: 700; margin-right: 6px; } .qt { display: inline; } .tb { width: 900px; margin-top: 8px; border-collapse: collapse; } .tb td { border: 1px solid #333; padding: 8px; font-size: 14pt; }",
      updatedAt: 0,
    });
    const book = (await ctx.db.query("books").withIndex("by_unit_stage", (x) => x.eq("unitId", u01).eq("stage", "master")).first())!;
    await ctx.db.patch(book._id, { qCount: 10 });
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });

  const P = await open(backend, `${site.url}/f/`, size(360, 740));
  const select = (l: L) => l.first().evaluate((el) => getComputedStyle(el).userSelect);
  await visible(P.getByLabel(/Index/));
  expect(await P.evaluate(() => getComputedStyle(document.body).userSelect)).toBe("none");
  expect(await select(P.getByLabel(/Index/))).toBe("text");
  expect(await select(P.getByLabel("Code"))).toBe("text");
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 1");
  expect(await select(P.locator(".f-goal-t"))).toBe("none");
  await stageNow(P, "Level 1");
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  expect(await P.getByRole("button", { name: /^Zoom/ }).count()).toBe(0); // only with the question on screen
  const headH = () => P.locator(".f-qhead").evaluate((el) => Math.round(el.getBoundingClientRect().height));
  const h0 = await headH();

  // The question on: the zoom button beside the XP (the row as tall as before), the question not selectable.
  await P.locator(".f-qmode").click();
  const inPaper = (sel: string) => P.locator(sel).evaluate((el) => el.shadowRoot?.querySelector(".qv")?.textContent ?? "");
  await until(async () => (await inPaper(".f-paper")).includes("made-up question number 1"), "Q1 as printed");
  await visible(P.getByRole("button", { name: "Zoom Q1" }));
  expect(await headH()).toBe(h0);
  expect(await P.locator(".f-paper").evaluate((el) => getComputedStyle(el.shadowRoot!.querySelector(".qv")!).userSelect)).toBe("none");

  // Full screen: two fingers zoom the question (3x), never the app; one finger moves it.
  await P.getByRole("button", { name: "Zoom Q1" }).click();
  const Z = P.locator(".f-zoom");
  await visible(Z);
  await until(async () => (await inPaper(".f-zpaper")).includes("made-up question number 1"), "Q1 full screen");
  await noSideScroll(P);
  await shot(P, "fam29-question-zoom");
  const scaleOf = () => P.locator(".f-zpaper").evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  const leftOf = () => P.locator(".f-zpaper").evaluate((el) => el.getBoundingClientRect().left);
  expect(await scaleOf()).toBe(1);
  const f = await fingersOn(P);
  await f.pinch(180, 300);
  expect(await scaleOf()).toBeGreaterThan(2);
  expect(await zoomOf(P)).toBe(1);
  const x0 = await leftOf();
  await f.swipe({ x: 300, y: 420 }, { x: 120, y: 420 });
  expect(await leftOf()).toBeLessThan(x0 - 100);
  expect(await zoomOf(P)).toBe(1);
  await noSideScroll(P);
  await shot(P, "fam29b-question-zoomed");

  // ✕ closes it on the same question; a tap on the paper opens it again; the phone's Back closes only it, then the
  // next Back goes up to the Stage as before.
  await Z.getByRole("button", { name: "Close" }).click();
  await until(async () => (await Z.count()) === 0, "the zoom closed");
  await contains(P.locator(".f-qn"), "Q1");
  await P.locator(".f-paper").click();
  await visible(Z);
  await P.goBack();
  await until(async () => (await Z.count()) === 0, "Back closed the zoom");
  await contains(P.locator(".f-qn"), "Q1");
  await P.goBack();
  await playIs(P, "Level 1");
  expect(problems).toEqual([]);
});

test("a tute's ladder on the phone: one road numbered as printed; a teacher question asks, Learn shows it a step a tap; Check sets the circles", async () => {
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  // The FAKE skeleton tute (A: teacher Q1, his Q2; B: teacher Q3, his Q4–5; papers Q6–8) filed under OL · Constructions.
  const cons = (await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_grade", (q) => q.eq("grade", 12)).collect()).find((u) => u.en === "Constructions")))!._id;
  const [r] = readWorkbookFiles([
    { name: "Sample_tute_source.zip", bytes: zipSync({ "tute.json": strToU8(TUTE_JSON), "book.html": strToU8(TUTE_HTML), "content.py": strToU8("") }) },
  ]) as ReadTute[];
  await t.mutation(api.catalog.saveTute, {
    ...as,
    unitId: cons,
    title: r.title!,
    fighter: { sections: r.fighter.sections.map((x) => ({ id: x.id, title: x.title, tamil: x.tamil, teach: x.teach, solo: x.solo })) },
    master: { part: r.part, levels: r.master.levels.map((l) => ({ from: l.from, to: l.to, max: l.max })), marks: r.master.marks! },
    fighterKey: r.fighterKey!,
    masterKey: r.masterKey!,
  });
  for (const stage of ["fighter", "master"] as const) {
    await t.mutation(api.catalog.saveQuestions, { ...as, unitId: cons, stage, first: true, css: r.css, items: [...r.questions[stage]].map(([q, html]) => ({ q, html })) });
  }
  const nila = await t.mutation(api.students.add, { ...as, name: "Nila S", grade: 11, term: 3 });
  await t.mutation(api.families.setOlMap, { ...as, studentIds: [nila], on: true });
  await t.mutation(api.families.setCode, { ...as, studentId: nila, code: "4719" });

  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 1");
  await tabTo(P, /Learn/);
  await P.locator(".f-node.s-now").click();
  // The road: the ladder's A and B are Levels 1 and 2, the papers 3–5 (locked until the ladder is done).
  await playIs(P, "Level 1");
  await until(async () => (await P.locator(".f-lv").count()) === 5, "five Levels on the road");
  expect(await P.locator(".f-lv").nth(2).getAttribute("aria-label")).toMatch(/^Level 3:/);
  await noSideScroll(P);
  await shot(P, "fam28-tute-road");
  await P.locator(".f-lv.play").click();

  // Q1 is a teacher question: did you do it with your teacher? Not yet → Learn, a step a tap, then he does it.
  await contains(P.locator(".f-qn"), "Q1");
  await visible(P.locator(".f-teachask"));
  expect(await P.locator(".f-padkeys").count()).toBe(0);
  await noSideScroll(P);
  await shot(P, "fam29-teacher-question");
  await P.getByRole("button", { name: /கற்றுக்கொள்/ }).click();
  await until(async () => (await P.locator(".f-steps li").count()) === 1, "the first step");
  await P.getByRole("button", { name: /அடுத்த படி/ }).click();
  await until(async () => (await P.locator(".f-steps li").count()) === 2, "the second step");
  await contains(P.locator(".f-steps li").nth(1), "4");
  await noSideScroll(P);
  await shot(P, "fam30-learn-steps");
  await P.getByRole("button", { name: /நீயே செய்/ }).click();
  await type(P, ["3"]);
  await type(P, ["4"]);
  await P.locator(".f-checkpill").click();
  await P.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();
  await visible(P.locator(".f-result"));
  await noSideScroll(P);
  await shot(P, "fam31-ladder-result");
  // The class sees it: Q1 taught (learned at home); the next Level is B (Level 2).
  const p = await t.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (q) => q.eq("studentId", nila)).collect()).find((x) => x.stage === "fighter" && x.unitId === cons));
  expect(p?.marks["1"]?.s).toBe("taught");
  expect(p?.lh?.A).toBeTruthy();

  // 320 px: the choice and the steps fit.
  const S = await open(backend, `${site.url}/f/`, size(320, 568));
  await S.getByLabel(/Index/).fill("1001");
  await S.getByLabel("Code").fill("4719");
  await S.getByRole("button", { name: "Sign in" }).click();
  await goalIs(S, "Level 2");
  await tabTo(S, /Learn/);
  await S.locator(".f-node.s-now").click();
  await playIs(S, "Level 2");
  await S.locator(".f-lv.play").click();
  await visible(S.locator(".f-teachask"));
  await noSideScroll(S);
  await shot(S, "fam32-teacher-question-320");

  expect(problems).toEqual([]);
});

test("Me, his profile: a camera photo made small with its bar, the OK, the race; a name asked; his birthday; the map of 12 weeks; the report; a certificate", async () => {
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
  const bilal = await t.mutation(api.students.add, { ...as, name: "Bilal M", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  await t.mutation(api.families.setCode, { ...as, studentId: bilal, code: "5820" });
  // What the class recorded: two visits, Level 1 corrected in class yesterday (Q2 lost and explained, Q5 lost), Level 2
  // marked at home today.
  const H = 3_600_000;
  const D = 24 * H;
  const now = Date.now();
  const [l1, l2] = BOOK.data.levels;
  await t.run(async (ctx) => {
    for (const back of [D, 8 * D]) {
      const inAt = now - back - 2 * H;
      await ctx.db.insert("attendance", { studentId: hana, day: new Date(inAt + 330 * 60_000).toISOString().slice(0, 10), inAt, outAt: inAt + 2 * H });
    }
    const q: Record<string, { got: number; max: number; lost: boolean; t: number; x?: number }> = {};
    for (let n = l1.from; n <= l1.to; n++) q[String(n)] = { got: 2, max: 2, lost: false, t: now - D };
    q["2"] = { got: 0, max: 2, lost: true, t: now - D, x: now - D + H };
    q["5"] = { got: 1, max: 2, lost: true, t: now - D };
    const m = {
      q,
      lv: {
        [String(l1.n)]: { done: now - D - H, fixed: now - D, got: l1.max - 3 },
        [String(l2.n)]: { done: now - H, fixed: now - H, got: l2.max - 2, by: "home", home: now - H },
      },
    };
    const row = await ctx.db.query("progress").withIndex("by_student_unit_stage", (x) => x.eq("studentId", hana).eq("unitId", u01).eq("stage", "master")).first();
    await ctx.db.patch(row!._id, { m });
  });

  // A camera-sized photo (3000 × 4000, made up in the browser: no real face, no file from anyone).
  const P = await open(backend, `${site.url}/f/`, size(360, 780), () => {
    // The upload waits a moment here, so the bar can be seen (the fake server answers at once).
    const w = window as unknown as { __ARISTORA_TEST_BACKEND__: { mutation(n: string, a: unknown): Promise<unknown> } };
    const real = w.__ARISTORA_TEST_BACKEND__.mutation;
    w.__ARISTORA_TEST_BACKEND__.mutation = async (n, a) => {
      if (n === "family:setPhoto") await new Promise((r) => setTimeout(r, 1200));
      return await real(n, a);
    };
  });
  const camera = await P.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 3000;
    c.height = 4000;
    const g = c.getContext("2d")!;
    const sky = g.createLinearGradient(0, 0, 0, 4000);
    sky.addColorStop(0, "#8fb4e8");
    sky.addColorStop(1, "#3a4fa0");
    g.fillStyle = sky;
    g.fillRect(0, 0, 3000, 4000);
    g.fillStyle = "#e0ac8c";
    g.beginPath();
    g.ellipse(1500, 1750, 600, 760, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#463c96";
    g.fillRect(700, 2600, 1600, 1400);
    // Grain, as a camera's: a photo that doesn't squeeze by itself.
    const img = g.getImageData(0, 0, 3000, 4000);
    let s = 7;
    for (let i = 0; i < img.data.length; i += 4) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      const n = (s % 41) - 20;
      img.data[i] += n;
      img.data[i + 1] += n;
      img.data[i + 2] += n;
    }
    g.putImageData(img, 0, 0);
    const b = await new Promise<Blob>((r) => c.toBlob((x) => r(x!), "image/jpeg", 0.95));
    const u = await new Promise<string>((r) => {
      const f = new FileReader();
      f.onload = () => r(String(f.result));
      f.readAsDataURL(b);
    });
    return u.slice(u.indexOf(",") + 1);
  });
  const cameraBytes = Buffer.from(camera, "base64");
  expect(cameraBytes.length).toBeGreaterThan(1_000_000);
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 3");

  // Me: her photo spot, the map of 12 weeks (yesterday in class, today at home), her class, her report.
  await tabTo(P, /Me$/);
  await contains(P.locator(".f-me-id"), "Hana K");
  await visible(P.locator(".f-heatbox"));
  await until(async () => (await P.locator(".f-heat .f-hc.h1").count()) >= 2, "two days with a Level on the map");
  expect(await P.locator(".f-heat .f-hc.in").count()).toBe(2);
  await contains(P.locator(".f-heat-sum"), "2 days with a Level · 2 in class");
  await contains(P.locator(".f-hday"), "⌂ 1 at home");
  await contains(P.locator(".f-qc .right"), String(l1.to - l1.from - 1));
  await contains(P.locator(".f-qc .learned"), "1");
  await contains(P.locator(".f-qc .tolearn"), "1");
  await noSideScroll(P);
  await shot(P, "fam30-me-profile");
  await P.locator(".f-heatbox").scrollIntoViewIfNeeded();
  await shot(P, "fam31-me-map");
  // Yesterday on the map: its day, hour by hour.
  const yesterday = P.locator(".f-heat button.f-hc.in.h1").last();
  await yesterday.click();
  await contains(P.locator(".f-hday"), "in class");
  await P.locator(".f-hday-go").click();
  await visible(P.locator(".f-sheet .f-tl"));
  await contains(P.locator(".f-sheet .f-tl"), "வகுப்புக்கு வந்தாய்");
  await shot(P, "fam32-me-day");
  await P.locator(".f-sheet .f-x").click();
  await until(async () => (await P.locator(".f-sheet").count()) === 0, "the day closes");

  // Her photo: 3000 × 4000 in; moved and zoomed in the circle; made small on the phone; sent with the bar.
  await P.locator(".f-me-pic input[type=file]").setInputFiles({ name: "camera.jpg", mimeType: "image/jpeg", buffer: cameraBytes });
  // Opening 12 megapixels takes a moment (longer on a busy test machine): the bar says so meanwhile.
  await P.locator(".f-photo-sheet .f-crop.live").waitFor({ state: "visible", timeout: 25_000 });
  await shot(P, "fam33-photo-crop");
  const place = () => P.locator(".f-crop-in").evaluate((el) => (el as HTMLElement).style.transform);
  const centred = await place();
  const box = (await P.locator(".f-crop").boundingBox())!;
  await P.locator(".f-crop-zoom").evaluate((el) => {
    (el as HTMLInputElement).value = "1.5";
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await P.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await P.mouse.down();
  await P.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 40, { steps: 5 });
  await P.mouse.up();
  const moved = await place();
  expect(moved).not.toBe(centred);
  await shot(P, "fam33b-photo-moved");
  await P.getByRole("button", { name: /Use this photo/ }).click();
  await until(async () => (await P.locator(".f-prog").innerText()).includes("Sending"), "Sending", 25_000);
  expect(await place()).toBe(moved); // the circle holds his framing while it goes
  await contains(P.locator(".f-prog small"), "→");
  await noSideScroll(P);
  await shot(P, "fam34-photo-sending");
  await until(async () => (await P.locator(".f-prog").count()) === 0 || (await P.locator(".f-prog").innerText()).includes("Done"), "Done", 25_000);
  await until(async () => (await P.locator(".f-sheet").count()) === 0, "the photo sheet closes");
  await visible(P.locator(".f-me-pic .f-ava.pic img"));
  await contains(P.locator(".f-me-tag"), "WAITING FOR OK"); // a tag: capitals
  await visible(P.locator(".f-who .f-ava.pic img"));
  const [kept] = await t.run(async (ctx) => await ctx.db.query("profilePhotos").collect());
  const bytes = (kept.data.length * 3) / 4;
  expect(bytes).toBeLessThan(45_000);
  expect(bytes).toBeGreaterThan(2_000);
  expect(["image/webp", "image/jpeg"]).toContain(kept.type);
  console.log(`[profile] a ${(cameraBytes.length / 1e6).toFixed(1)} MB photo was sent as ${(bytes / 1000).toFixed(0)} KB (${kept.type})`);
  await shot(P, "fam35-me-photo");

  // Her classmate's race: her letter until the OK.
  const Q = await open(backend, `${site.url}/f/`, size(360, 780));
  await Q.getByLabel(/Index/).fill("1002");
  await Q.getByLabel("Code").fill("5820");
  await Q.getByRole("button", { name: "Sign in" }).click();
  await goalIs(Q, "Level 1");
  await tabTo(Q, /Race/);
  await visible(Q.locator(".f-pod", { hasText: "Hana" }));
  expect(await Q.locator(".f-pod", { hasText: "Hana" }).locator("img").count()).toBe(0);

  // She asks for a new name: it waits for the OK too.
  await P.locator(".f-drow", { hasText: "Name" }).click();
  await P.getByLabel("First name and initial").fill("Hana Fathima K");
  await shot(P, "fam36-name-ask");
  await P.getByRole("button", { name: "Ask for this name" }).click();
  await until(async () => (await P.locator(".f-sheet").count()) === 0, "the name sheet closes");
  await contains(P.locator(".f-drow", { hasText: "Name" }), "Hana Fathima K · waiting for OK");

  // The owner: the gear counts 2; Settings opens on Students: her photo and her name, OK.
  const C = await open(backend, site.url, size(360, 780), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await contains(C.locator(".gear-n"), "2");
  await C.getByRole("button", { name: /Settings/ }).click();
  await until(async () => (await C.locator(".fa-item").count()) === 2, "two asks waiting");
  await visible(C.locator(".fa-item img.fa-pic"));
  await noSideScroll(C);
  await shot(C, "fam37-owner-asks");
  await C.locator(".fa-item", { hasText: "Photo for the race" }).getByRole("button", { name: "OK" }).click();
  await contains(C.locator(".toast").last(), "photo is in the race");
  await C.locator(".fa-item", { hasText: "Hana Fathima K" }).getByRole("button", { name: "OK" }).click();
  await contains(C.locator(".toast").last(), "is Hana Fathima K now");
  await until(async () => (await C.locator(".gear-n").count()) === 0, "nothing waits");
  expect((await t.run(async (ctx) => await ctx.db.get(hana)))!.name).toBe("Hana Fathima K");

  // Her classmate's race now: her face.
  await tabTo(Q, /Home/);
  await tabTo(Q, /Race/);
  await visible(Q.locator(".f-pod", { hasText: "Hana" }).locator("img"));
  await noSideScroll(Q);
  await shot(Q, "fam38-race-photo");

  // Her birthday (today), once: Home's party, 🎂 in the race and on the teachers' list.
  const today = new Date(Date.now() + 330 * 60_000);
  await tabTo(P, /Home/);
  await tabTo(P, /Me$/);
  await contains(P.locator(".f-me-id"), "Hana Fathima K");
  await P.locator(".f-drow", { hasText: "Birthday" }).click();
  await P.locator(".f-sheet").getByLabel("Month", { exact: true }).selectOption(String(today.getUTCMonth() + 1));
  await P.locator(".f-sheet").getByLabel("Day", { exact: true }).selectOption(String(today.getUTCDate()));
  await P.getByRole("button", { name: "Save" }).click();
  await until(async () => (await P.locator(".f-sheet").count()) === 0, "the birthday sheet closes");
  await contains(P.locator(".f-me-name"), "🎂");
  await tabTo(P, /Home/);
  await visible(P.locator(".f-bdaycard"));
  await noSideScroll(P);
  await shot(P, "fam39-birthday");
  await tabTo(Q, /Home/);
  await tabTo(Q, /Race/);
  await contains(Q.locator(".f-pod", { hasText: "Hana" }), "🎂");
  await C.reload();
  await C.getByRole("button", { name: /Settings/ }).click();
  await contains(C.locator(".plain-list li", { hasText: "Hana Fathima K" }).first(), "🎂");

  // Her report: this month, the questions, her Stage; the month on WhatsApp.
  await tabTo(P, /Me$/);
  await P.locator(".f-rep .f-h2-go").click();
  await visible(P.locator(".f-report .f-sc"));
  expect(await P.locator(".f-months button").count()).toBe(3);
  await contains(P.locator(".f-mnum"), "Class days");
  const wa = decodeURIComponent((await P.locator(".f-report .f-wa").getAttribute("href"))!.replace("https://wa.me/?text=", ""));
  expect(wa).toContain("Hana Fathima K · Grade 8");
  expect(wa).toContain("Levels: 2 (⌂ 1 at home)");
  expect(wa).toContain("Stage 1");
  await noSideScroll(P);
  await shot(P, "fam40-report");

  // Every Level of Stage 1 done: its certificate (a picture made on the phone, to share).
  await t.run(async (ctx) => {
    const row = (await ctx.db.query("progress").withIndex("by_student_unit_stage", (x) => x.eq("studentId", hana).eq("unitId", u01).eq("stage", "master")).first())!;
    const lv: Record<string, { done: number; fixed: number; got: number }> = {};
    for (const l of BOOK.data.levels) lv[String(l.n)] = { done: now - H, fixed: now - H, got: l.max - 1 };
    await ctx.db.patch(row._id, { m: { ...row.m!, lv } });
  });
  await P.locator(".f-report .f-round").click();
  await P.locator(".f-rep .f-h2-go").click();
  await visible(P.locator(".f-sc.done .f-sc-cert"));
  await P.locator(".f-sc.done .f-sc-cert").click();
  await P.locator(".f-cert img").waitFor({ state: "visible", timeout: 25_000 });
  const dims = await P.locator(".f-cert img").evaluate((i) => [(i as HTMLImageElement).naturalWidth, (i as HTMLImageElement).naturalHeight]);
  expect(dims).toEqual([1080, 1350]);
  await shot(P, "fam41-certificate");
  await P.locator(".f-cert img").screenshot({ path: join(SHOTS, "fam42-certificate-picture.png") });

  // The smallest phone: Me and the report fit 320 px.
  const S = await open(backend, `${site.url}/f/`, size(320, 568));
  await S.getByLabel(/Index/).fill("1001");
  await S.getByLabel("Code").fill("4719");
  await S.getByRole("button", { name: "Sign in" }).click();
  await visible(S.locator(".f-bdaycard"));
  await tabTo(S, /Me$/);
  await visible(S.locator(".f-heatbox"));
  await noSideScroll(S);
  await shot(S, "fam43-me-320");
  await S.locator(".f-heatbox").scrollIntoViewIfNeeded();
  await shot(S, "fam43b-map-320");
  await S.locator(".f-cls").scrollIntoViewIfNeeded();
  await shot(S, "fam43c-class-report-320");
  await S.locator(".f-set", { hasText: "Your details" }).scrollIntoViewIfNeeded();
  await shot(S, "fam43d-details-320");
  await S.locator(".f-rep .f-h2-go").click();
  await visible(S.locator(".f-report .f-sc"));
  await noSideScroll(S);
  await shot(S, "fam44-report-320");
  await S.locator(".f-report .f-sc").first().scrollIntoViewIfNeeded();
  // Nothing in a Stage's card is wider than the card.
  expect(await S.locator(".f-report .f-sc").first().evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await shot(S, "fam44b-stage-320");
  expect(problems).toEqual([]);
});
