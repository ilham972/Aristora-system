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
import { api, internal } from "../../convex/_generated/api";
import { secretHash } from "../../convex/lib/auth";
import { outOf } from "../../convex/lib/book";
import { slDayNo, slWeekStart } from "../../convex/lib/day";
import type { Ans } from "../../convex/lib/key";
import { fromB64, seal, sha256, unseal } from "../../convex/lib/seal";
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
  // A fake microphone, allowed without asking (12 Nov 2026: the teacher's voice note records for real).
  browser = await playwright.chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
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
/** Who is on screen (the top row's face: on a phone his name is its label, not its words: 10 Nov 2026). */
const whoIs = (p: Page, name: string) =>
  until(async () => ((await p.locator(".f-who").first().getAttribute("aria-label")) ?? "").startsWith(name), `${name} on screen`);

/** Type one answer on the pad (keys by their names), then → to the next box. */
async function type(p: Page, keys: string[]) {
  for (const k of keys) await p.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
  await p.locator(".f-padkeys .f-key.next").click();
}

/** A teachers' page signed in with this token (once per tab: a reload keeps what the page did since). */
const signedIn = (token: string) =>
  new Function(`return () => { if (sessionStorage.getItem("t")) return; sessionStorage.setItem("t", "1"); localStorage.setItem("aristora.token", ${JSON.stringify(token)}); }`)() as () => void;

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
  // Q20 is the teacher's: no box, so no pad to tap in vain (4 Nov 2026): "do it on paper", and → where the pad's → is.
  await contains(F.locator(".f-teach"), "தாளில்");
  expect(await F.locator(".f-padkeys").count()).toBe(0);
  await noSideScroll(F);
  await shot(F, "fam03b-teacher-question");
  await F.locator(".f-nextbar .f-key.next").click();
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
  // Q8, wrong in Level 1, comes back at the end of Level 3 (his idea, 4 Nov 2026): right now = half its marks (10 Nov 2026:
  // 2 marks → 1).
  await S.locator(".f-qchip.re", { hasText: "8" }).click();
  await contains(S.locator(".f-again"), "Level 1");
  await contains(S.locator(".f-xpchip.re"), "+1 XP");
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

  // Her Stage's questions are in the app: each question as printed above its boxes, always (his answer, 4 Nov 2026:
  // no switch), its printed number hidden (the card says Q1 once), in the app's own font.
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  expect(await P.locator(".f-qmode").count()).toBe(0);
  const printed = () => P.locator(".f-paper").evaluate((el) => el.shadowRoot?.querySelector(".qv")?.textContent ?? "");
  await until(async () => (await printed()).includes("made-up question number 1"), "Q1 as printed");
  const inQv = (sel: string, prop: "display" | "fontFamily") =>
    P.locator(".f-paper").evaluate((el, [s, k]) => getComputedStyle(el.shadowRoot!.querySelector(s)!)[k as "display"], [sel, prop] as const);
  expect(await inQv(".qn", "display")).toBe("none");
  expect(await inQv(".qt", "fontFamily")).toContain("Baloo Thambi 2");
  await noSideScroll(P);
  await shot(P, "fam14-question-mode");
  await type(P, ["3"]);
  await contains(P.locator(".f-qn"), "Q2");
  await until(async () => (await printed()).includes("made-up question number 2"), "Q2 as printed");
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
  await whoIs(P, "Bilal");
  await contains(P.locator(".f-caret.many"), "2");
  await goalIs(P, "Level 1");
  await shot(P, "fam18-second-child");
  // Switch back to Hana from the top bar: her XP, her map.
  await P.locator(".f-who").click();
  await visible(P.locator(".f-sheet .f-kid", { hasText: "Bilal M" }));
  await shot(P, "fam19-children");
  await P.locator(".f-sheet .f-kid", { hasText: "Hana K" }).click();
  await whoIs(P, "Hana");
  // Bilal signs out of this phone (from Me): Hana stays; his phone key stops on the server.
  await P.locator(".f-who").click();
  await P.locator(".f-sheet .f-kid", { hasText: "Bilal M" }).click();
  await whoIs(P, "Bilal");
  await tabTo(P, /Me$/);
  await P.getByRole("button", { name: /Sign out Bilal/ }).click();
  await P.locator(".f-sure").getByRole("button", { name: "Sign out", exact: true }).click();
  await whoIs(P, "Hana");
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

  // Q1 → Q2 (each question as printed, always). The page never wider than the phone, the pad's bottom on the screen's
  // bottom every frame.
  await key("3");
  const a = await framesOf(P, next);
  await contains(P.locator(".f-qn"), "Q2");
  expect(Math.max(...a.frames.map((f) => f.wide))).toBeLessThanOrEqual(0);
  expect(new Set(a.frames.map((f) => f.pad))).toEqual(new Set([640]));
  expect(a.ys).toEqual([0]);

  // A tall question: he scrolls down to his box, types, → . The page moves once, to the top, with Q3.
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

test("photos from home: a drawing photographed in the level, marked by a person he picks (never his working on a wrong answer); her answer on his phone; the unit gate and its redo", async () => {
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  // Level 1: Q8's key shows its working before the answer; Q10 is two names, (a) and (b) (the teacher marks them from a
  // photo, each its own mark).
  const key = fakeKey().map((k) =>
    k.q === 8
      ? { q: 8, a: "8 × 3 = **24**" }
      : k.q === 10
        ? { q: 10, parts: [{ p: "a", a: "சிறப்புப் பெயர்", m: 1 }, { p: "b", a: "வேறு பெயர்", m: 1 }] }
        : k,
  );
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
  // ↻ stands a sideways photo up (the photo turns, the frame with it); ✕ = no photo added.
  await F.locator(".f-qcard .f-file").first().setInputFiles(paper);
  const canvas = F.locator(".f-cut .f-cut-img canvas");
  await visible(canvas);
  await F.locator(".f-cut").getByRole("button", { name: "Turn the photo" }).click();
  await until(async () => await canvas.evaluate((c) => (c as HTMLCanvasElement).width < (c as HTMLCanvasElement).height), "the photo turned");
  await F.locator(".f-cut").getByRole("button", { name: "Cancel" }).click();
  expect(await F.locator(".f-cut").count()).toBe(0);
  expect(await F.locator(".f-qcard .f-thumb").count()).toBe(0);
  await F.locator(".f-qcard .f-file").first().setInputFiles(paper);
  // His crop first (6 Nov 2026, "very easy for the students ... age 11 also"): the whole photo framed, yellow dots on the
  // corners and sides; a corner and a side dragged, then சரி. What goes is the frame (the photo was 4 : 3, wide).
  const cut = F.locator(".f-cut");
  await visible(cut.locator(".f-cut-img canvas"));
  expect(await cut.locator(".f-cut-g").count()).toBe(8);
  expect(await cut.getByRole("button", { name: "Whole photo" }).isDisabled()).toBe(true);
  const pic = (await cut.locator(".f-cut-pic").boundingBox())!;
  expect(pic.width).toBeGreaterThan(300); // a small photo is shown as big as the screen allows
  await noSideScroll(F);
  await shot(F, "fam-ph00-crop");
  const pull = async (grip: string, dx: number, dy: number) => {
    const g = (await cut.locator(`.f-cut-g.${grip}`).boundingBox())!;
    await F.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await F.mouse.down();
    await F.mouse.move(g.x + g.width / 2 + dx, g.y + g.height / 2 + dy, { steps: 6 });
    await F.mouse.up();
  };
  await pull("br", -pic.width * 0.5, 0);
  await pull("t", 0, pic.height * 0.1);
  const frame = (await cut.locator(".f-cut-box").boundingBox())!;
  expect(frame.width / pic.width).toBeGreaterThan(0.45);
  expect(frame.width / pic.width).toBeLessThan(0.55);
  expect(await cut.getByRole("button", { name: "Whole photo" }).isDisabled()).toBe(false);
  await shot(F, "fam-ph00b-cropped");
  await F.setViewportSize({ width: 320, height: 640 });
  await noSideScroll(F);
  await shot(F, "fam-ph00c-crop-320");
  await F.setViewportSize({ width: 390, height: 844 });
  await cut.getByRole("button", { name: "Use this photo" }).click();
  await visible(F.locator(".f-qcard .f-thumb img"));
  expect(await cut.count()).toBe(0);
  const sizeOf = (img: ReturnType<typeof F.locator>) =>
    img.evaluate(async (i) => {
      const el = i as HTMLImageElement;
      await el.decode().catch(() => {});
      return [el.naturalWidth, el.naturalHeight];
    });
  const [cw, ch] = await sizeOf(F.locator(".f-qcard .f-thumb img"));
  expect(cw / ch).toBeLessThan(0.85); // half the width, 0.9 of the height: taller than wide
  await noSideScroll(F);
  await shot(F, "fam-ph01-camera");
  await F.locator(".f-nextbar .f-key.next").click();
  await F.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();

  // The reveal: 16 of 18 on the phone; below it the book: Q8 with no camera (10 Nov 2026: no photo of his working on a
  // wrong answer; Evaluation explains it in class); the Q10 photo goes by itself.
  await contains(F.locator(".f-big"), "16");
  const q8 = F.locator(".f-bq", { has: F.locator(".f-rq", { hasText: "Q8" }) });
  const q10 = F.locator(".f-bq", { has: F.locator(".f-rq", { hasText: "Q10" }) });
  // Q8 comes back in Level 3: no solution to copy yet (his rule, 4 Nov 2026), a gold note instead.
  await visible(q8.locator(".f-comesback"));
  expect(await q8.locator(".f-sol").count()).toBe(0);
  await contains(q8.locator(".f-bq-typed"), "42");
  await visible(q10.locator(".f-ph-state.wait"));
  expect(await q8.locator(".f-file").count()).toBe(0);
  expect(await F.locator(".f-owebar").count()).toBe(0);
  await noSideScroll(F);
  await shot(F, "fam-ph02-book");

  // Nila (Photos only, no Correction job) on the teachers' app: the gear says 1; Settings opens on Photos, whose button
  // opens Correction's ⌂ lane (5 Nov 2026): her only lane (⌂ dark and fixed, + pale), Hana in amber with her 1.
  const N = await open(backend, site.url, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.token", "nila-photos-token-0123456789abcdefghijklmnopq");
  });
  await contains(N.locator(".gear-n"), "1");
  await N.getByRole("button", { name: /Settings/ }).click();
  await contains(N.locator(".phq-sum"), "1 to mark from 1 student");
  await N.getByRole("button", { name: /Mark them in Correction/ }).click();
  await visible(N.locator(".hl-btn.on"));
  expect(await N.locator(".hl-btn").isDisabled()).toBe(true);
  const hanaPill = N.locator(".fc-names .fc-nm", { hasText: "Hana" });
  await contains(hanaPill, "1");
  await contains(N.locator(".hl-idle"), "1 to mark");
  await shot(N, "fam-ph03-lane");
  await hanaPill.click();
  // Q10 only (his working on Q8 is never asked for). The photo big.
  const card = N.locator(".hl-card");
  await contains(card.locator(".fc-qn"), "10");
  await until(async () => await card.locator(".hl-turned img").first().evaluate((i) => (i as HTMLImageElement).naturalWidth > 0), "the photo loaded");
  // ↻ turns it a quarter: its box takes the turned photo's room (his crop was taller than wide: now wider than tall).
  const before = (await card.locator(".hl-turned").first().boundingBox())!;
  await card.locator(".hl-turn").first().click();
  await until(async () => ((await card.locator(".hl-turned img").first().getAttribute("style")) ?? "").includes("rotate(90deg)"), "the photo turned");
  const after = (await card.locator(".hl-turned").first().boundingBox())!;
  expect(before.height / before.width).toBeGreaterThan(1.1);
  expect(after.width / after.height).toBeGreaterThan(1.1);
  // Full screen keeps the turn; ✕ back.
  await card.locator(".hl-img").first().click();
  await visible(N.locator(".hl-big"));
  expect((await N.locator(".hl-big img").getAttribute("style")) ?? "").toContain("rotate(90deg)");
  await shot(N, "fam-ph03b-full-screen");
  await N.locator(".hl-close").click();
  // Q10 (two names, (a) and (b): hers to mark). No reason chips (6 Nov 2026).
  expect(await card.locator(".fc-pl").allInnerTexts()).toEqual(["a", "b"]);
  expect(await card.locator(".phq-chip").count()).toBe(0);
  await noSideScroll(N);
  await shot(N, "fam-ph04-lane-part");
  await N.setViewportSize({ width: 320, height: 640 });
  await noSideScroll(N);
  await shot(N, "fam-ph04b-lane-part-320");
  await N.setViewportSize({ width: 390, height: 844 });
  expect(await card.locator(".fc-pb.on").count()).toBe(0);
  // Her message first (7 Nov 2026, his voice note: "where is the second sub question's answer ... or give the hint"):
  // Message → her words → Send to him: nothing marked, Q10 leaves the lane until he answers.
  await N.waitForTimeout(400);
  await N.locator(".hl-ask").click();
  await N.locator(".hl-askpad textarea").fill("Where is the answer for (b)?");
  await noSideScroll(N);
  await shot(N, "fam-ph04d-message");
  await N.locator(".hl-askpad").getByRole("button", { name: "Send to him" }).click();
  await contains(N.locator(".hl-idle"), "No photos waiting");

  // Hana's phone (alerts stubbed: this browser has no push service): the bell in the top row says 1 new (Q10 her
  // message), who and where; she turns phone alerts on; a line opens the level's book.
  await F.addInitScript(() => {
    const sub = {
      endpoint: "https://push.example/send/hana",
      toJSON: () => ({ endpoint: "https://push.example/send/hana", keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }),
    };
    const reg = { pushManager: { getSubscription: async () => null, subscribe: async () => sub } };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve(reg), getRegistration: async () => reg, addEventListener() {}, removeEventListener() {}, register: async () => reg },
    });
    const w = window as unknown as { PushManager?: unknown; Notification: unknown };
    w.PushManager ??= function PushManager() {};
    // Headless Chromium says "denied" whatever is granted: the phone's own question, answered yes.
    let perm = "default";
    w.Notification = {
      get permission() {
        return perm;
      },
      requestPermission: async () => (perm = "granted"),
    };
  });
  await F.reload();
  await contains(F.locator(".f-bell-n"), "1");
  await F.locator(".f-bellb").click();
  await contains(F.locator(".f-bellitem.ask"), "Nila கேட்கிறார்: Where is the answer for (b)?");
  await contains(F.locator(".f-bellitem.ask small"), "Level 1 · Q10");
  await F.getByRole("button", { name: "Turn on phone alerts" }).click();
  await until(async () => (await F.locator(".f-pushcard.on").count()) > 0, "alerts on (the server makes its keys first)", 15_000);
  await contains(F.locator(".f-pushcard.on"), "அறிவிப்பு வரும்");
  await noSideScroll(F);
  await shot(F, "fam-ph08b-bell");
  await F.locator(".f-bellitem.ask").click();
  await visible(F.locator(".f-bookscr"));
  // Her message in gold with her name; he answers in words.
  await contains(q10.locator(".f-asked"), "Nila கேட்கிறார்");
  await contains(q10.locator(".f-asked"), "Where is the answer for (b)?");
  await q10.locator(".f-replybox").fill("(b) வேறு பெயர்");
  await noSideScroll(F);
  await shot(F, "fam-ph08c-reply");
  await q10.locator(".f-send").click();
  await visible(q10.locator(".f-ph-state.wait"));

  // Back in Nila's lane: Hana again, the card with her message and his words; now she marks both parts.
  const hanaBack = N.locator(".fc-names .fc-nm", { hasText: "Hana" });
  await contains(hanaBack, "1");
  await hanaBack.click();
  await contains(card.locator(".fc-qn"), "10");
  await contains(card.locator(".hl-asked"), "Where is the answer for (b)?");
  await contains(card.locator(".hl-asked .hl-reply"), "(b) வேறு பெயர்");
  await shot(N, "fam-ph04e-answered");
  // Each part its own row, nothing lit until she taps; Save waits for both.
  expect(await card.locator(".fc-pb.on").count()).toBe(0);
  await N.waitForTimeout(400);
  await card.getByRole("button", { name: "Part a: 1 of 1" }).click();
  expect(await N.locator(".hl-go").isDisabled()).toBe(true);
  await card.getByRole("button", { name: "Part b: 0 of 1" }).click();
  await contains(N.locator(".hl-go"), "1/2");
  await card.getByRole("button", { name: "Part b: 1 of 1" }).click();
  await contains(N.locator(".hl-go"), "2/2");
  await card.locator(".hl-words input").fill("Good: both names right");
  await N.setViewportSize({ width: 360, height: 740 });
  await noSideScroll(N);
  await shot(N, "fam-ph04c-lane-part-360");
  await N.waitForTimeout(400);
  await N.locator(".hl-go").click();
  // Nothing left anywhere: the lane says so, and the gear's count is gone.
  await contains(N.locator(".hl-idle"), "No photos waiting");
  expect(await N.locator(".gear-n").count()).toBe(0);
  expect(await N.locator(".fc-names .fc-nm").count()).toBe(0);
  expect(problems).toEqual([]);

  // The owner fixes how the phone reads an answer (4 Nov 2026, his ask: "do you have proper solution"): Settings → Books
  // → Grade 8 → U01 → See what the phone accepts → only the corrector's → Q20 (a name in this fake key) → its answer →
  // Save; the list shows it with ✎.
  const O = await open(backend, site.url, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  // The owner on Correction: ⌂ after + switches the names row to the lane (nothing waits now) and back to the hall.
  await O.locator(".tabs .tab.correction").click();
  await visible(O.locator(".hl-btn"));
  expect(await O.locator(".hl-btn.on").count()).toBe(0);
  await O.locator(".hl-btn").click();
  await visible(O.locator(".hl-btn.on"));
  await contains(O.locator(".hl-idle"), "No photos waiting");
  await O.locator(".hl-btn").click();
  expect(await O.locator(".hl-btn.on").count()).toBe(0);
  expect(await O.locator(".hl-idle").count()).toBe(0);
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
  // Her words and her marks; who corrected it.
  await contains(q10.locator(".f-answer-note"), "both names right");
  await contains(q10.locator(".f-answer"), "2/2");
  await contains(q10.locator(".f-answer").first(), "திருத்தியவர்: Nila");
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
  // Levels 3 and 4 too (Level 2's drawing still not sent): no limit any more (10 Nov 2026), Level 5 is START.
  await checkEmpty(3);
  await checkEmpty(4);
  await F.getByRole("button", { name: "Back" }).click();
  await playIs(F, "Level 5");
  expect(await F.locator(".f-stopnote").count()).toBe(0);

  // The unit gate (10 Nov 2026): Stage 2 has a workbook too; he finishes Stage 1 far below 75 %. Stage 2 stays shut: its
  // node opens its screen, which says why and goes to Stage 1; Stage 1 offers the redo of his wrong ones.
  const u02 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U02")).first())!._id);
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u02,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key,
  });
  for (const l of BOOK.data.levels.slice(4)) await checkEmpty(l.n);
  await F.reload();
  await tabTo(F, /Learn/);
  await F.getByRole("button", { name: /^Stage 2:/ }).click();
  await contains(F.locator(".f-stopnote"), "75%");
  await noSideScroll(F);
  await shot(F, "fam-gate1-shut");
  await F.locator(".f-stopnote").click();
  const gate = F.locator(".f-gate");
  await contains(gate, "75%");
  await visible(gate.getByRole("button", { name: /Redo/ }));
  await noSideScroll(F);
  await shot(F, "fam-gate2-redo");
  await F.setViewportSize({ width: 320, height: 640 });
  await noSideScroll(F);
  await shot(F, "fam-gate2b-redo-320");
  await F.setViewportSize({ width: 390, height: 844 });
  await gate.getByRole("button", { name: /Redo/ }).click();
  await visible(F.locator(".f-again"));
  expect((await F.locator(".f-prow .f-kicker").innerText()).toLowerCase()).toContain("↻ redo");
  expect(await F.locator(".f-strip .f-qchip:not(.re)").count()).toBe(0); // only his wrong ones, each ↻
  await noSideScroll(F);
  await shot(F, "fam-gate3-redo-level");

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
  const headH = () => P.locator(".f-qhead").evaluate((el) => Math.round(el.getBoundingClientRect().height));

  // The question (always on): the zoom button beside the XP (the row no taller for it), the question not selectable.
  const inPaper = (sel: string) => P.locator(sel).evaluate((el) => el.shadowRoot?.querySelector(".qv")?.textContent ?? "");
  await until(async () => (await inPaper(".f-paper")).includes("made-up question number 1"), "Q1 as printed");
  await visible(P.getByRole("button", { name: "Zoom Q1" }));
  expect(await headH()).toBeLessThanOrEqual(40);
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

test("answer kinds: the question's own blanks, an option, ✓ / ✗, words to underline, cards to order, pairs; Check marks them exactly", async () => {
  // A key of version 2 (4 Nov 2026): the book gives each answer and its kind. Made-up questions in the book's shapes.
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  const kinds: Record<number, Ans> = {
    1: { k: "fill", b: [{ v: ["3"] }, { v: ["4"] }] },
    2: { k: "choose", n: 4, a: 2 },
    3: { k: "tf", a: [true, false] },
    4: { k: "mark", n: 4, a: [2, 3] },
    5: { k: "order", items: ["5", "−2", "0"], a: [2, 3, 1] },
    6: { k: "match", l: ["a", "b"], r: ["2", "1"], a: [2, 1] },
    7: { k: "photo" },
    8: { k: "box", b: [{ v: ["15"] }] },
    9: { k: "box", b: [{ v: ["3/4"], same: true }] },
    10: { k: "box", b: [{ v: ["4x + 5y"] }] }, // an answer in two letters (5 Nov 2026): the pad has an x and a y key
  };
  const key = fakeKey().map((k) => (kinds[k.q] ? { ...k, t: kinds[k.q] } : k));
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key,
  });
  const card = (q: number, text: string) => `<div class="si" data-q="${q}" data-b="${q}.0"><span class="qn">${q}</span><div class="sit">${text}</div></div>`;
  const html: Record<number, string> = {
    1: card(1, 'Made-up blanks: 7 + <span class="ab" data-fill="1"></span> = 10 and <span class="ab" data-fill="2"></span> × 2 = 8'),
    2: card(2, 'A made-up choice<div class="mcq"><span data-opt="1"><b>(1)</b>5</span><span data-opt="2"><b>(2)</b>7</span><span data-opt="3"><b>(3)</b>9</span><span data-opt="4"><b>(4)</b>11</span></div>'),
    3: card(3, '<div>(a) Made-up true <span data-tick="1">( )</span></div><div>(b) Made-up false <span data-tick="2">( )</span></div>'),
    4: card(4, 'Underline the made-up ones: <span data-mark="1">10</span>, <span data-mark="2">11</span>, <span data-mark="3">13</span>, <span data-mark="4">14</span>'),
    5: card(5, "Made-up order: 5, −2, 0"),
    6: card(6, "Made-up pairs"),
    7: card(7, "A made-up drawing"),
  };
  await t.run(async (ctx) => {
    for (let q = 1; q <= 10; q++) await ctx.db.insert("questions", { unitId: u01, stage: "master", q, html: html[q] ?? card(q, `A made-up question number ${q}`) });
    await ctx.db.insert("bookCss", { unitId: u01, stage: "master", css: ".qn { font-weight: 700; } .ab { display: inline-block; width: 18mm; height: 7mm; border: 1pt solid #000; }", updatedAt: 0 });
    const book = (await ctx.db.query("books").withIndex("by_unit_stage", (x) => x.eq("unitId", u01).eq("stage", "master")).first())!;
    await ctx.db.patch(book._id, { qCount: 10 });
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });

  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await stageNow(P, "Level 1");
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  const paper = P.locator(".f-paper");
  const nextBar = () => P.locator(".f-nextbar .f-key.next").click();

  // Q1: the question's own blanks are his boxes (no box under it); a tap picks the blank, the pad types in it.
  await visible(paper.locator("[data-fill]").first());
  expect(await P.locator(".f-qcard .f-boxes").count()).toBe(0);
  await P.locator(".f-padkeys").getByRole("button", { name: "3", exact: true }).click();
  await paper.locator("[data-fill]").nth(1).click();
  await P.locator(".f-padkeys").getByRole("button", { name: "4", exact: true }).click();
  await until(async () => (await paper.locator("[data-fill]").allInnerTexts()).join() === "3,4", "both blanks typed");
  await noSideScroll(P);
  await shot(P, "fam40-kind-blanks");
  await P.locator(".f-padkeys .f-key.next").click();

  // Q2: an option tapped in the question; no pad (nothing to type), only →.
  await contains(P.locator(".f-qn"), "Q2");
  expect(await P.locator(".f-padkeys").count()).toBe(0);
  await paper.locator("[data-opt]").nth(1).click();
  await visible(paper.locator("[data-opt].fx-on"));
  await shot(P, "fam41-kind-choose");
  await nextBar();
  // Q3: ✓ and ✗ in each bracket.
  await paper.locator("[data-tick]").nth(0).locator(".fx-tk").nth(0).click();
  await paper.locator("[data-tick]").nth(1).locator(".fx-tk").nth(1).click();
  await shot(P, "fam42-kind-tick");
  await nextBar();
  // Q4: words underlined (one tapped twice is back off).
  for (const i of [1, 0, 0, 2]) await paper.locator("[data-mark]").nth(i).click();
  await until(async () => (await paper.locator("[data-mark].fx-on").count()) === 2, "two words marked"); // painted a frame after the tap
  await nextBar();
  // Q5: cards in order, by two taps each (−2, 0, 5).
  await contains(P.locator(".f-qn"), "Q5");
  const cards = P.locator(".f-ordc");
  await cards.nth(0).click();
  await cards.nth(1).click();
  await cards.nth(1).click();
  await cards.nth(2).click();
  await until(async () => (await cards.allInnerTexts()).join(" ") === "−2 0 5", "the cards in order");
  await noSideScroll(P);
  await shot(P, "fam43-kind-order");
  await nextBar();
  // Q6: pairs, left then right.
  const side = (k: number) => P.locator(".f-matc").nth(k).locator(".f-mi");
  await side(0).nth(0).click();
  await side(1).nth(1).click();
  await side(0).nth(1).click();
  await side(1).nth(0).click();
  await visible(side(1).nth(0).locator(".f-min"));
  await shot(P, "fam44-kind-match");
  await nextBar();
  // Q7: a drawing, on purpose: the photo, → goes on.
  await contains(P.locator(".f-teach"), "படம் எடு");
  await nextBar();
  // Q8–Q10: boxes as always; Q9 is written the book's way (6/8 is not 3/4).
  await type(P, ["1", "5"]);
  await type(P, ["6", "Denominator", "8"]); // a fraction box: 6 over 8 (5 Nov 2026: never a slash)
  // Q10: two letters, the pad's letter keys in × and /'s places; typed in the other order (5y + 4x is as good).
  await contains(P.locator(".f-qn"), "Q10");
  const keys = P.locator(".f-padkeys");
  expect(await keys.getByRole("button", { name: "*", exact: true }).count()).toBe(0);
  await contains(keys.getByRole("button", { name: "squared" }), "□²");
  await noSideScroll(P);
  await shot(P, "fam57-kind-letters");
  for (const k of ["5", "y", "+", "4", "x"]) await keys.getByRole("button", { name: k, exact: true }).click();
  // His letters in maths italic in his box, as on the pad and in the printed book (x is never mistaken for ×).
  await until(async () => (await P.locator(".f-box .f-v").allInnerTexts()).join() === "y,x", "his letters in italic");
  await shot(P, "fam58-kind-letters-typed");
  await keys.locator(".f-key.next").click();
  await P.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();

  // The reveal: every kind marked on the phone, Q9 wrong, Q7 the teacher's: 16 of 18.
  await contains(P.locator(".f-big"), "16");
  await contains(P.locator(".f-big"), "/ 18");
  await until(async () => (await P.locator(".f-rrow.bad").allInnerTexts()).join().includes("Q9"), "Q9 wrong");
  expect(await P.locator(".f-rrow.ok").count()).toBe(8);
  await visible(P.locator(".f-rrow.teach"));
  await noSideScroll(P);
  await shot(P, "fam45-kind-result");
});

test("names and reasons: names to tap under the question; ஆம் / இல்லை and his own words; a wrong pick is 0, a right one waits for the teacher", async () => {
  // 4 Nov 2026, his decisions: a name the paper doesn't print is chosen from the book's names; "is it true? give a
  // reason" = ஆம் / இல்லை, then his reason typed with the phone's own keyboard (no photo). Made-up questions only.
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  const kinds: Record<number, Ans> = {
    1: { k: "choose", n: 4, a: 2, items: ["Made-up name A", "Made-up name B", "Made-up name C", "Made-up name D"], below: true },
    2: { k: "why", a: false },
    3: { k: "why", a: true },
  };
  for (let q = 4; q <= 10; q++) kinds[q] = { k: "box", b: [{ v: [String(q)] }] };
  const key = fakeKey().map((k) => (kinds[k.q] ? { ...k, t: kinds[k.q] } : k));
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key,
  });
  const card = (q: number, text: string) => `<div class="si" data-q="${q}" data-b="${q}.0"><span class="qn">${q}</span><div class="sit">${text}</div></div>`;
  await t.run(async (ctx) => {
    for (let q = 1; q <= 10; q++) await ctx.db.insert("questions", { unitId: u01, stage: "master", q, html: card(q, `A made-up question number ${q}`) });
    await ctx.db.insert("bookCss", { unitId: u01, stage: "master", css: ".qn { font-weight: 700; }", updatedAt: 0 });
    const book = (await ctx.db.query("books").withIndex("by_unit_stage", (x) => x.eq("unitId", u01).eq("stage", "master")).first())!;
    await ctx.db.patch(book._id, { qCount: 10 });
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });

  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await stageNow(P, "Level 1");
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  const nextBar = () => P.locator(".f-nextbar .f-key.next").click();

  // Q1: the four names under the question (the paper prints none); no pad, nothing to type.
  const names = P.locator(".f-pkn .f-pkb");
  await until(async () => (await names.count()) === 4, "four names under the question");
  expect(await P.locator(".f-padkeys").count()).toBe(0);
  await names.nth(1).click();
  await visible(P.locator(".f-pkn .f-pkb.on"));
  await noSideScroll(P);
  await shot(P, "fam46-kind-names");
  await nextBar();
  // Q2: ஆம் / இல்லை, then his reason with the phone's own keyboard (still no pad).
  await contains(P.locator(".f-qn"), "Q2");
  expect(await P.locator(".f-padkeys").count()).toBe(0);
  await P.locator(".f-pk.yn .f-pkb").nth(1).click(); // இல்லை: right
  await P.locator(".f-whyt textarea").fill("Made-up reason in Thanglish: 15 x 15 = 225, so not 125");
  await visible(P.locator(".f-pk.yn .f-pkb.on"));
  await noSideScroll(P);
  await shot(P, "fam47-kind-why");
  await nextBar();
  // Q3: the wrong pick (ஆம் is right).
  await contains(P.locator(".f-qn"), "Q3");
  await P.locator(".f-pk.yn .f-pkb").nth(1).click();
  await P.locator(".f-whyt textarea").fill("Made-up");
  await nextBar();
  // Q4–Q10: boxes as always.
  for (let q = 4; q <= 10; q++) await type(P, String(q).split(""));
  await P.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();

  // The reveal: Q1 and Q4–Q10 right, Q3 wrong (0 at once), Q2 the teacher's: 16 of the 18 the phone marks.
  await contains(P.locator(".f-big"), "16");
  await contains(P.locator(".f-big"), "/ 18");
  await until(async () => (await P.locator(".f-rrow.bad").allInnerTexts()).join().includes("Q3"), "Q3 wrong");
  await visible(P.locator(".f-rrow.teach"));
  await noSideScroll(P);
  await shot(P, "fam48-kind-why-result");
  // The teacher reads his words in the Photos queue: no photo, nothing for him to send.
  const items = await t.query(api.photos.queue, as);
  expect(items.map((i) => [i.q, i.said, i.urls.length])).toEqual([[2, true, 0]]);
  expect(items[0].reasons).toEqual([{ p: "", yes: "இல்லை", text: "Made-up reason in Thanglish: 15 x 15 = 225, so not 125" }]);
  // His reason in the ⌂ lane (12 Nov 2026, the founder: "message button not working ... no photo"): no Retake (nothing to
  // take again), Message works; its box has the voice note's Record button.
  const O = await open(backend, site.url, size(390, 844), signedIn(OWNER_TOKEN));
  await O.getByRole("button", { name: /Settings/ }).click();
  await O.getByRole("button", { name: /Mark them in Correction/ }).click();
  await O.locator(".fc-names .fc-nm").first().click();
  const lane = O.locator(".hl-card");
  await contains(lane.locator(".fc-qn"), "2");
  expect(await O.locator(".hl-acts .hl-again").count()).toBe(1);
  expect(await O.locator(".hl-ask").isDisabled()).toBe(false);
  await noSideScroll(O);
  await shot(O, "fam48b-lane-reason-message");
  await O.waitForTimeout(400);
  await O.locator(".hl-ask").click();
  await visible(O.locator(".hl-askpad .vn-rec"));
  await O.locator(".hl-askpad textarea").fill("Why is the reason so short?");
  // Her voice note: Record (the fake microphone), the red dot and the time, Stop; Send waits while it records.
  await O.context().grantPermissions(["microphone"]);
  await O.locator(".vn-rec").click();
  await visible(O.locator(".vn-row.rec"));
  expect(await O.locator(".hl-askpad").getByRole("button", { name: "Send to him" }).isDisabled()).toBe(true);
  await shot(O, "fam48c-lane-voice-recording");
  await O.waitForTimeout(1600);
  await O.locator(".vn-stop").click();
  await visible(O.locator(".hl-askpad .vn-play"));
  await noSideScroll(O);
  await shot(O, "fam48d-lane-reason-message-pad");
  await O.locator(".hl-askpad").getByRole("button", { name: "Send to him" }).click();
  await until(async () => (await t.query(api.photos.queue, as)).length === 0, "her message went to him");
  const asked = await t.run(async (ctx) => (await ctx.db.query("homePhotos").collect()).find((r) => r.state === "ask")!);
  expect(asked).toMatchObject({ ask: "Why is the reason so short?", said: true });
  expect(asked.askSec).toBeGreaterThanOrEqual(1);
  const file = await t.run(async (ctx) => await ctx.db.system.get(asked.askVoice!));
  expect(file!.contentType).toMatch(/^audio\//);
  // His phone: her words with ▶ and the seconds, and a box for his answer (no photo needed).
  await P.reload();
  await contains(P.locator(".f-bell-n"), "1");
  await P.locator(".f-bellb").click();
  await contains(P.locator(".f-bellitem.ask"), "Owner கேட்கிறார்: Why is the reason so short?");
  await P.locator(".f-bellitem.ask").click();
  await visible(P.locator(".f-bookscr"));
  const q2 = P.locator(".f-bq", { has: P.locator(".f-rq", { hasText: "Q2" }) });
  await contains(q2.locator(".f-asked"), "Why is the reason so short?");
  await visible(q2.locator(".f-asked .f-voice"));
  await contains(P.locator(".f-owebar"), "பதில் அனுப்பு");
  // ▶ plays it (the audio is made on the tap).
  await q2.locator(".f-voice").click();
  await visible(q2.locator(".f-voice.on"));
  await noSideScroll(P);
  await shot(P, "fam48e-phone-voice-message");
  await q2.locator(".f-voice").click();
  // He answers in words alone: back in her lane with his answer and her voice note.
  await q2.locator(".f-replybox").fill("Made-up longer reason");
  await q2.locator(".f-send").click();
  await until(async () => (await t.query(api.photos.queue, as)).length === 1, "his answer came back");
  await O.locator(".fc-names .fc-nm", { hasText: "Hana" }).click();
  await contains(O.locator(".hl-asked .hl-reply"), "Made-up longer reason");
  await visible(O.locator(".hl-asked .vn-play"));
  await shot(O, "fam48f-lane-his-answer");
});

test("typed words and equations: an equation on the pad with =, a name in letters, his own words for a teacher, two answers under one sub-question; no photo anywhere", async () => {
  // 10 Nov 2026, his rule: "if student need to write the answer, then we can put the typing box"; a photo is only for a
  // drawing. His screenshots: "build an equation in x" and "name the shape and find its perimeter" asked for photos.
  // Made-up questions only.
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  const key = fakeKey().map((k) => {
    if (k.q === 1) return { q: 1, a: "2x + 5 = 25", t: { k: "box" as const, b: [{ v: ["2x + 5 = 25"] }] } };
    if (k.q === 2) return { q: 2, a: "AOB", t: { k: "box" as const, b: [{ v: ["AOB", "BOA"], w: true, l: "∠" }] } };
    if (k.q === 3) return { q: 3, a: "his own words", t: { k: "say" as const } };
    if (k.q === 4)
      return {
        q: 4,
        parts: [
          { p: "i · பெயர்", a: "Made-up name B", m: 1, t: { k: "choose" as const, n: 3, a: 2, items: ["Made-up name A", "Made-up name B", "Made-up name C"], below: true as const } },
          { p: "i · சுற்றளவு", a: "**20** cm", m: 1, t: { k: "box" as const, b: [{ v: ["20"], u: "cm" }] } },
        ],
      };
    // Q5: a power above 2 (□ⁿ on the pad, 10 Nov 2026).
    if (k.q === 5) return { q: 5, a: "x⁶", t: { k: "box" as const, b: [{ v: ["x^6"] }] } };
    return k.q <= 10 ? { q: k.q, a: String(k.q), t: { k: "box" as const, b: [{ v: [String(k.q)] }] } } : k;
  });
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key,
  });
  const card = (q: number, text: string) => `<div class="si" data-q="${q}" data-b="${q}.0"><span class="qn">${q}</span><div class="sit">${text}</div></div>`;
  // Q4 as a question with two sub-questions; a block for the printed book only (a matching's columns) never shows.
  const q4 =
    '<div class="si" data-q="4" data-b="4.0"><span class="qn">4</span><div class="sit">A made-up shape question' +
    '<div class="rp"><span class="rl">(i)</span><span>Name it and find its perimeter</span></div>' +
    '<div class="rp"><span class="rl">(ii)</span><span>A made-up second sub-question</span></div>' +
    '<div data-paper="1" class="made-up-columns">ONLY ON PAPER</div></div></div>';
  await t.run(async (ctx) => {
    for (let q = 1; q <= 10; q++) await ctx.db.insert("questions", { unitId: u01, stage: "master", q, html: q === 4 ? q4 : card(q, `A made-up question number ${q}`) });
    await ctx.db.insert("bookCss", { unitId: u01, stage: "master", css: ".qn { font-weight: 700; } .rp { display: flex; }", updatedAt: 0 });
    const book = (await ctx.db.query("books").withIndex("by_unit_stage", (x) => x.eq("unitId", u01).eq("stage", "master")).first())!;
    await ctx.db.patch(book._id, { qCount: 10 });
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });

  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await stageNow(P, "Level 1");
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  const nextBar = () => P.locator(".f-nextbar .f-key.next").click();
  const noPhoto = async () => {
    expect(await P.locator(".f-teachq").count()).toBe(0);
    expect(await P.getByText("படம் எடு").count()).toBe(0);
  };

  // Q1: an equation. The pad has "=" (→ in a row of its own); his terms may be on either side.
  await visible(P.locator(".f-padkeys").getByRole("button", { name: "=", exact: true }));
  await visible(P.locator(".f-padkeys .f-key.next.wide"));
  await noPhoto();
  await noSideScroll(P);
  await shot(P, "famtw1-equation");
  await type(P, ["2", "5", "=", "5", "+", "2", "x"]);
  await noSideScroll(P);
  // Q2: a name in letters, typed with the phone's own keyboard in the box itself: no pad.
  await contains(P.locator(".f-qn"), "Q2");
  expect(await P.locator(".f-padkeys").count()).toBe(0);
  await noPhoto();
  await P.locator(".f-box.w .f-bword").fill("b o a");
  await visible(P.locator(".f-box.w.has"));
  await noSideScroll(P);
  await shot(P, "famtw2-word");
  await nextBar();
  // Q3: his own words for a teacher (no ஆம் / இல்லை, no photo).
  await contains(P.locator(".f-qn"), "Q3");
  expect(await P.locator(".f-pk.yn").count()).toBe(0);
  await noPhoto();
  await P.locator(".f-say textarea").fill("Made-up words in Thanglish: rendu pakkamum samam");
  await shot(P, "famtw3-say");
  await nextBar();
  // Q4: one printed sub-question, two answers under it (a name to tap, then a number), before sub-question (ii);
  // what is for the printed book only isn't drawn.
  await contains(P.locator(".f-qn"), "Q4");
  await until(async () => (await P.locator(".f-paper .f-part").count()) === 2, "two answer rows in the question");
  const order = await P.locator(".f-paper").evaluate((host) => {
    const out: string[] = [];
    host.shadowRoot!.querySelectorAll(".rp, slot[name]").forEach((el) => out.push(el.matches("slot") ? (el as HTMLSlotElement).name : (el.querySelector(".rl")?.textContent ?? "")));
    return out.join(" ");
  });
  expect(order).toBe("(i) p0 p1 (ii)");
  expect(await P.locator(".f-paper").evaluate((host) => getComputedStyle(host.shadowRoot!.querySelector("[data-paper]")!).display)).toBe("none");
  await noPhoto();
  await P.locator(".f-pkn .f-pkb").nth(1).click();
  await P.locator(".f-paper .f-box").first().click();
  await noSideScroll(P);
  await shot(P, "famtw4-two-answers");
  await type(P, ["2", "0"]);
  // Q5: x⁶ with □ⁿ (its exponent's digits after it), drawn up.
  await contains(P.locator(".f-qn"), "Q5");
  for (const k of ["x", "power", "6"]) await P.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
  await contains(P.locator(".f-box.on"), "⁶");
  await noSideScroll(P);
  await shot(P, "famtw7-power");
  await P.locator(".f-padkeys .f-key.next").click();
  // Q6–Q10: boxes as always.
  for (let q = 6; q <= 10; q++) await type(P, String(q).split(""));
  await P.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();

  // The reveal: everything the phone marks is right (18 of 18); Q3 waits for the teacher, who reads his words.
  await contains(P.locator(".f-big"), "18");
  await contains(P.locator(".f-big"), "/ 18");
  expect(await P.locator(".f-rrow.bad").count()).toBe(0);
  await visible(P.locator(".f-rrow.teach"));
  await noSideScroll(P);
  await shot(P, "famtw5-typed-result");
  const items = await t.query(api.photos.queue, as);
  expect(items.map((i) => [i.q, i.said, i.urls.length])).toEqual([[3, true, 0]]);
  expect(items[0].reasons).toEqual([{ p: "", yes: "", text: "Made-up words in Thanglish: rendu pakkamum samam" }]);
});

test("the Claude link: the owner turns it on in Settings → Books, the code is shown once; a request sealed with it is answered; Turn off ends it", async () => {
  // 10 Nov 2026, his ask: "create the direct pipeline ... directly digitalize from here". The code is made on his phone.
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const MALA = "books-teacher-token-link-0123456789abcdefghijklm";
  await addPerson(t, { name: "Mala", token: MALA, tabs: ["correction"], can: ["books"] });
  await t.mutation(api.setup.ensure, { token: OWNER_TOKEN });
  const O = await open(backend, site.url, size(360, 780), signedIn(OWNER_TOKEN));
  await O.getByRole("button", { name: "Settings" }).click();
  await O.getByRole("button", { name: "Books", exact: true }).click();
  const cardOf = (p: Page) => p.locator(".cl-card");
  await contains(cardOf(O), "Off.");
  await cardOf(O).getByRole("button", { name: /^Turn on the Claude link/ }).click();
  await contains(cardOf(O), "On until");
  const code = await cardOf(O).locator(".cl-code").inputValue();
  expect(code).toMatch(/^ARISTORA-LINK [A-Za-z0-9]{12}\.[A-Za-z0-9_-]{43}$/);
  await noSideScroll(O);
  await shot(O, "famtw6-claude-link");
  // The chat's side: a request sealed with the code is answered, sealed; without the code, nothing.
  const [, id, secret] = /^ARISTORA-LINK (\w+)\.(.+)$/.exec(code)!;
  const linkKey = fromB64(secret)!;
  const nonce = sha256(new TextEncoder().encode("a made-up nonce")).subarray(0, 16);
  const got = await t.query(api.link.ask, { id, box: seal(linkKey, nonce, JSON.stringify({ op: "books", t: Date.now() })) });
  const answer = JSON.parse(unseal(linkKey, got.box)!.words) as { ok: boolean; units: { key: string }[] };
  expect(answer.ok).toBe(true);
  expect(answer.units.some((u) => u.key === "G8-U01")).toBe(true);
  expect(await t.query(api.link.ask, { id, box: seal(new Uint8Array(32), nonce, JSON.stringify({ op: "books", t: Date.now() })) })).toEqual({ box: "" });
  // A Books teacher never sees the card.
  const M = await open(backend, site.url, size(360, 780), signedIn(MALA));
  await M.getByRole("button", { name: "Settings" }).click();
  await M.getByRole("button", { name: "Books", exact: true }).click();
  await visible(M.locator(".upload-btn"));
  expect(await cardOf(M).count()).toBe(0);
  // Turn off (asked once more): the code is worth nothing.
  await cardOf(O).getByRole("button", { name: "Turn off" }).click();
  await cardOf(O).getByRole("button", { name: "Yes, turn it off" }).click();
  await contains(cardOf(O), "Off.");
  expect(await t.query(api.link.ask, { id, box: seal(linkKey, nonce, JSON.stringify({ op: "books", t: Date.now() })) })).toEqual({ box: "" });
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

test("the race for everyone: this week, all time and the GOAT, not started yet, the grade cup, 👑, a profile, a cheer, the weekly coins", async () => {
  const before = problems.length;
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const unit = async (key: string) => await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", key)).first())!._id);
  const u01 = await unit("G8-U01");
  const g9 = await unit("G9-U01");
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key: fakeKey(),
  });
  const add = async (name: string, grade: number, unitId?: typeof u01) =>
    await t.mutation(api.students.add, { ...as, name, grade, term: 1, stage: "master", ...(unitId ? { unitId } : {}) });
  const hana = await add("Hana K", 8, u01);
  const bilal = await add("Bilal M", 8, u01);
  await add("Dev P", 8, u01); // never joined the app, no work this week: still in the race
  const ravi = await add("Ravi S", 9);
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  await t.mutation(api.families.setCode, { ...as, studentId: bilal, code: "5820" });
  // Class work, no app: Bilal's levels corrected in class (one last week: last week's champion), Ravi's in Grade 9.
  const now = Date.now();
  const lv = (t0: number, got: number) => ({ done: t0, fixed: t0 + 60_000, got, by: "correction" });
  await t.run(async (ctx) => {
    const m = { q: {}, lv: { "1": lv(now - 7 * 86_400_000, 18), "2": lv(now - 60_000, 12) } };
    const p = await ctx.db.query("progress").withIndex("by_student_unit_stage", (q) => q.eq("studentId", bilal).eq("unitId", u01).eq("stage", "master")).first();
    if (p) await ctx.db.patch(p._id, { m, updatedAt: now });
    else await ctx.db.insert("progress", { studentId: bilal, unitId: u01, stage: "master", marks: {}, m, startedAt: 0, updatedAt: now });
    await ctx.db.insert("progress", { studentId: ravi, unitId: g9, stage: "master", marks: {}, m: { q: {}, lv: { "1": lv(now - 30_000, 26) } }, startedAt: 0, updatedAt: now });
  });
  // The race rows built again from that work, as on the live server (the all-time places and the GOAT read them).
  await t.run(async (ctx) => {
    for (const r of await ctx.db.query("raceRows").collect()) await ctx.db.delete(r._id);
  });
  await t.mutation(internal.race.fill, {});

  // 11 Nov 2026 (his voice note: "everything is gone" every Monday; his answers): this week in his grade first, then all
  // time in his grade, then the GOAT (every grade, all time: Bilal, 30 XP ever, passes Ravi's 26).
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 1");
  await tabTo(P, /Race/);
  // This week · Grade 8: Bilal on top (👑 last week's #1, the GOAT's ring), the coins for #1, Dev and Hana not started.
  await contains(P.locator(".f-hero .f-kicker"), "THIS WEEK · GRADE 8");
  await contains(P.locator(".f-rtabs button.on"), "This week");
  await contains(P.locator(".f-pod.p1"), "Bilal");
  await visible(P.locator(".f-pod.p1 .f-wcrown"));
  await visible(P.locator(".f-pod.p1 .f-rface.goat .f-goatchip"));
  await contains(P.locator(".f-podnote"), "+50 coins");
  await contains(P.locator(".f-notyet"), "Dev");
  await contains(P.locator(".f-notyet .f-nyc.me"), "You");
  expect(await P.locator(".f-notyet .f-nyc").count()).toBe(2);
  await contains(P.locator(".f-pass"), "race இல் சேர்வாய்");
  await visible(P.locator(".f-gcup"));
  expect(await P.locator(".f-gcupl li").count()).toBe(2);
  await contains(P.locator(".f-gcupl li").first(), "1/1"); // Grade 9: all of it learned
  // Gone for good (11 Nov 2026): the leagues and the rank badges.
  expect(await P.locator(".f-lroad, .f-rkb, .f-rank-c, .f-wsave").count()).toBe(0);
  await noSideScroll(P);
  await shot(P, "fam57-race-week");
  // All time · Grade 8: XP ever (Bilal 30), never reset.
  await P.locator(".f-rtabs").getByRole("button", { name: "All time" }).click();
  await contains(P.locator(".f-hero .f-kicker"), "ALL TIME · GRADE 8");
  await contains(P.locator(".f-hero .f-hsub"), "never resets");
  await contains(P.locator(".f-pod.p1"), "Bilal");
  await contains(P.locator(".f-pod.p1 .f-pod-xp"), "30");
  expect(await P.locator(".f-wcrown").count()).toBe(0);
  await contains(P.locator(".f-pass"), "என்றும் இருக்கும்");
  await noSideScroll(P);
  await shot(P, "fam57a-race-all-time");
  // The GOAT: Bilal on his own card with the medal, Ravi (Grade 9) next, grades as numbers.
  await P.locator(".f-rtabs").getByRole("button", { name: "GOAT" }).click();
  await contains(P.locator(".f-hero .f-kicker"), "ALL TIME · ARISTORA");
  await contains(P.locator(".f-goatc"), "Bilal M");
  await contains(P.locator(".f-goatc .f-goatc-xp"), "30 XP");
  await visible(P.locator(".f-goatc svg.f-goat"));
  await contains(P.locator(".f-board li").first(), "Ravi S");
  await contains(P.locator(".f-board li").first().locator(".f-gchip"), "9");
  await noSideScroll(P);
  await shot(P, "fam58-race-goat");
  // The list he picked stays: back on the race, still the GOAT.
  await tabTo(P, /Home/);
  await tabTo(P, /Race/);
  await contains(P.locator(".f-rtabs button.on"), "GOAT");

  // Bilal's profile from the GOAT's card: the medal under his name, this week and all time; a cheer, once a day.
  await P.locator(".f-goatc").click();
  await contains(P.locator(".f-mate .f-me-name"), "Bilal M");
  await contains(P.locator(".f-mate .f-everl.goat"), "GOAT");
  await contains(P.locator(".f-mate-pl"), "This week");
  await contains(P.locator(".f-mate-pl"), "All time");
  await contains(P.locator(".f-mate .f-sc"), "2 / 12 Levels");
  await visible(P.locator(".f-mate .f-heatbox"));
  await P.getByRole("button", { name: /Cheer Bilal/ }).click();
  await contains(P.locator(".f-clap"), "Cheered today");
  await contains(P.locator(".f-clap small"), "1 👏");
  await noSideScroll(P);
  await shot(P, "fam59-mate");
  await P.getByRole("button", { name: "Back" }).click();
  await visible(P.locator(".f-rtabs"));

  // Bilal's phone: Me wears the GOAT medal and says who cheered him this week.
  const B = await open(backend, `${site.url}/f/`, size(360, 780));
  await B.getByLabel(/Index/).fill("1002");
  await B.getByLabel("Code").fill("5820");
  await B.getByRole("button", { name: "Sign in" }).click();
  await goalIs(B, "Level");
  await tabTo(B, /Me$/);
  await contains(B.locator(".f-everl.goat"), "GOAT");
  await contains(B.locator(".f-clapped"), "Hana K");
  await noSideScroll(B);
  await shot(B, "fam60-me-goat");

  // The smallest phone: the three lists and a profile fit 320 px.
  const S = await open(backend, `${site.url}/f/`, size(320, 640));
  await S.getByLabel(/Index/).fill("1001");
  await S.getByLabel("Code").fill("4719");
  await S.getByRole("button", { name: "Sign in" }).click();
  await goalIs(S, "Level 1");
  await tabTo(S, /Race/);
  await S.locator(".f-rtabs").getByRole("button", { name: "This week" }).click();
  await visible(S.locator(".f-gcup"));
  await noSideScroll(S);
  await shot(S, "fam61-race-320");
  await S.locator(".f-rtabs").getByRole("button", { name: "GOAT" }).click();
  await visible(S.locator(".f-goatc"));
  await noSideScroll(S);
  await shot(S, "fam61b-goat-320");
  await S.locator(".f-goatc").click();
  await contains(S.locator(".f-mate .f-me-name"), "Bilal M");
  await visible(S.locator(".f-mate .f-sc"));
  await noSideScroll(S);
  await shot(S, "fam62-mate-320");

  // The owner: Settings → Race: last week's champions (Bilal, Grade 8's coins), the weekly coins and the cup's gift;
  // Monday's run keeps the week and the cup's gift, Monday's pay adds the coins.
  const C = await open(backend, site.url, size(360, 780), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await C.getByRole("button", { name: /Settings/ }).click();
  await C.locator(".seg").getByRole("button", { name: /^Race/ }).click();
  await contains(C.locator(".rc-champs li", { hasText: "ARISTORA" }), "Bilal M");
  await contains(C.locator(".rc-champs li", { hasText: "👑 8" }), "Bilal M");
  await contains(C.locator(".rc-champs li", { hasText: "👑 8" }), "+50");
  await C.getByLabel(/Each grade's weekly #1/).fill("80");
  await C.getByLabel(/Grade cup/).fill("🍬 A sweet");
  await C.getByRole("button", { name: "Save the prizes" }).click();
  await contains(C.locator(".toast").last(), "Prizes saved");
  await t.mutation(internal.race.week, {});
  await t.mutation(internal.coins.payday, {});
  await backend.push();
  await contains(C.locator(".rc-champs li", { hasText: "👑 8" }), "+80");
  await contains(C.locator(".rc-gifts li").first(), "Bilal M");
  await contains(C.locator(".rc-gifts li").first(), "Grade cup");
  await noSideScroll(C);
  await shot(C, "fam63-settings-race");
  // The poster: one image for the WhatsApp group.
  await C.evaluate(() => {
    const nav = navigator as unknown as { canShare: () => boolean; share: (d: { files: File[] }) => Promise<void> };
    nav.canShare = () => true;
    nav.share = async (d) => {
      const w = window as unknown as { __shared: string[]; __poster?: string };
      w.__shared = d.files.map((x) => `${x.name}|${x.type}|${x.size > 5000}`);
      const r = new FileReader();
      r.onload = () => (w.__poster = String(r.result));
      r.readAsDataURL(d.files[0]);
    };
  });
  await C.getByRole("button", { name: "Share poster" }).click();
  await until(async () => !!(await C.evaluate(() => (window as unknown as { __poster?: string }).__poster)), "the poster shared");
  const shared = await C.evaluate(() => (window as unknown as { __shared: string[] }).__shared);
  expect(shared[0]).toMatch(/^ARISTORA-champions-\d{4}-\d{2}-\d{2}\.png\|image\/png\|true$/);
  const poster = await C.evaluate(() => (window as unknown as { __poster: string }).__poster);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SHOTS, "fam64-champions-poster.png"), Buffer.from(poster.split(",")[1], "base64"));

  // Bilal's phone on Home: the gold card (Grade 8's #1, +80 coins with his pay) and the cup's gift card.
  await tabTo(B, /Home/);
  await B.reload();
  await goalIs(B, "Level");
  await contains(B.locator(".f-payc.won .f-tag"), "GRADE 8 · #1");
  await contains(B.locator(".f-payc.won"), "+80 coins");
  await contains(B.locator(".f-giftc"), "🍬 A sweet");
  await noSideScroll(B);
  await shot(B, "fam65-coins-home");
  await C.locator(".rc-gifts li", { hasText: "Bilal M" }).getByRole("button", { name: "Given" }).click();
  await contains(C.locator(".toast").last(), "given");
  await until(async () => (await C.locator(".rc-box > .rc-gifts > li", { hasText: "Bilal M" }).count()) === 0, "Bilal's gift given");
  await B.reload();
  await goalIs(B, "Level");
  expect(await B.locator(".f-giftc").count()).toBe(0);
  // A gift by hand (8 Nov 2026, his ask): Hana, a sweet, why; her phone's card says why.
  await C.getByRole("button", { name: "🎁 Give a gift now" }).click();
  await C.locator(".rc-grades").getByRole("button", { name: /^8/ }).click();
  await C.locator(".rc-pick li", { hasText: "Hana K" }).getByRole("checkbox").check();
  await C.locator(".rc-give").getByLabel("The gift", { exact: true }).fill("🍬 A sweet");
  await C.locator(".rc-give").getByLabel(/Why/).fill("7 days in a row");
  await noSideScroll(C);
  await shot(C, "fam65c-give-gift");
  await C.getByRole("button", { name: "Give to 1 student" }).click();
  await contains(C.locator(".toast").last(), "1 student");
  await tabTo(P, /Home/);
  await P.reload();
  await goalIs(P, "Level 1");
  await contains(P.locator(".f-giftc"), "உனக்கு ஒரு பரிசு");
  await contains(P.locator(".f-giftc"), "🎁 7 days in a row");
  await shot(P, "fam65d-gift-by-hand");
  for (const p of [P, B, S, C]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});

test("Us: closed until the owner opens it; the owl's guide; his welcome; the owl's lines, a shout-out and a post; one tap each; a teacher's 👏", async () => {
  const before = problems.length;
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
  const add = async (name: string, grade: number) => await t.mutation(api.students.add, { ...as, name, grade, term: 1, stage: "master", unitId: u01 });
  const hana = await add("Hana K", 8);
  const bilal = await add("Bilal M", 8);
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  // Bilal's first level from home (his family phone, through the server): the owl welcomes him.
  const FAM_B = "family-phone-bilal-us-0123456789abcdefghijklmnop";
  await t.mutation(api.families.makeLink, { ...as, studentId: bilal, codeHash: secretHash("family-link", "bilal-us-family-link-0123456789") });
  await t.mutation(api.family.join, { code: "bilal-us-family-link-0123456789", token: FAM_B, label: "Android" });
  await t.mutation(api.family.check, { token: FAM_B, unitId: u01, n: 1, typed: [1, 2, 3, 4, 5, 6, 8].map((q) => ({ q, a: [String(q * 3)] })) });
  // Yesterday's count and last week's champions (the owl's morning and Monday lines).
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("usMoments", { k: "count", x: 12, at: now - 5 * 3600_000, day: 0, demo: false, c: 0 });
    await ctx.db.insert("usMoments", { k: "champs", ppl: [{ sid: bilal, n: "Bilal M", g: 8, a: true }], at: now - 26 * 3600_000, day: 0, demo: false, c: 3 });
  });

  // Hana's phone: four tabs while Us is closed.
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 1");
  expect(await P.locator(".f-tabs .f-tab").count()).toBe(4);

  // The owner: Settings → Community (his switches): why and how it should feel, then Open.
  const C = await open(backend, site.url, size(360, 780), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await C.getByRole("button", { name: /Settings/ }).click();
  await C.locator(".seg").getByRole("button", { name: /^Community/ }).click();
  await contains(C.locator(".us-why"), "How it should feel");
  await contains(C.locator(".us-open"), "Closed");
  await C.locator(".us-open").getByRole("button", { name: "Open" }).click();
  await contains(C.locator(".toast").last(), "open on every phone");
  await shot(C, "fam66-settings-community");
  await C.getByRole("button", { name: "Back to the class" }).click();
  // The class app's Us tab (7 Nov 2026, his ask): the family app's own screens inside it, with his sign-in. His guide
  // the first time; then a shout-out to Hana and a post to everyone.
  await C.locator(".tabs .tab.us").click();
  const U = C.frameLocator("iframe.us-frame");
  await contains(U.locator(".f-us-guide h2"), "மாணவர்கள் பார்ப்பது");
  await U.locator(".f-us-guide").getByRole("button", { name: "அடுத்து" }).click();
  await U.locator(".f-us-guide").getByRole("button", { name: "அடுத்து" }).click();
  await U.locator(".f-us-guide").getByRole("button", { name: "தொடங்கு!" }).click();
  await contains(U.locator(".t-me"), "Owner");
  await U.locator(".t-head").getByRole("button", { name: /Shout-out/ }).click();
  const sh = U.locator(".f-sheet");
  await sh.getByRole("button", { name: "Grade 8" }).click();
  await sh.getByRole("button", { name: "Hana K" }).click();
  await sh.getByRole("button", { name: "எப்போதும் விடாமுயற்சி" }).click();
  await sh.getByRole("button", { name: /Send/ }).click();
  await contains(U.locator(".f-toast"), "shout-out போனது");
  await U.locator(".t-head").getByRole("button", { name: /Post/ }).click();
  await sh.getByRole("button", { name: "Tip" }).click();
  await sh.locator("textarea").pressSequentially("எப்போதும் working எழுது.");
  await sh.getByRole("button", { name: /Post/ }).last().click();
  await contains(U.locator(".f-toast"), "எல்லோருக்கும் போனது");
  await contains(U.locator(".f-uk.k-post"), "இன்றைய குறிப்பு");
  await contains(U.locator(".f-uk.k-shout"), "Hana K");
  expect(await C.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shot(C, "fam66b-class-us-tab");

  // Hana's phone: the Us tab once she opens the app again; the owl's guide the first time (three cards).
  await P.reload();
  await goalIs(P, "Level 1");
  await until(async () => (await P.locator(".f-tabs .f-tab").count()) === 5, "the Us tab");
  await tabTo(P, /^Us$/);
  await contains(P.locator(".f-us-guide h2"), "இது Us");
  await noSideScroll(P);
  await shot(P, "fam67-us-guide");
  await P.locator(".f-us-guide").getByRole("button", { name: "அடுத்து" }).click();
  await contains(P.locator(".f-us-guide h2"), "தொடு, திற, எழுது");
  await P.locator(".f-us-guide").getByRole("button", { name: "அடுத்து" }).click();
  await P.locator(".f-us-guide").getByRole("button", { name: "தொடங்கு!" }).click();
  // The welcome, today's count, and the lines: the post, her own shout-out (no button: who cheered), Bilal's welcome.
  await contains(P.locator(".f-us-welcome"), "ARISTORA");
  await contains(P.locator(".f-hero.us .f-hsub"), "இன்று 1 பேர்");
  await contains(P.locator(".f-uk.k-post"), "இன்றைய குறிப்பு");
  await contains(P.locator(".f-uk.k-shout.mine"), "விடாமுயற்சி");
  await visible(P.locator(".f-uk.k-shout.mine .f-us-you"));
  const welcome = P.locator(".f-uk.k-home1");
  await contains(welcome, "Bilal M");
  await welcome.locator(".f-us-clap").click();
  await until(async () => (await welcome.locator(".f-us-clap").getAttribute("aria-pressed")) === "true", "her welcome tapped");
  await contains(welcome.locator(".f-us-clap"), "1");
  await contains(P.locator(".f-uk.k-champs"), "🏆");
  // Each card says what it is and when (8 Nov 2026: the liveliest first, no day headings).
  await contains(P.locator(".f-uk.k-home1 .f-uk-what"), "வீட்டிலிருந்து முதல் Level");
  await noSideScroll(P);
  await shot(P, "fam68-us-feed");
  // A name opens that classmate's profile.
  // 8 Nov 2026: the owl writes the line; his face (and his name) in its words open his profile.
  await welcome.locator(".f-uk-about .f-tapface").click();
  await contains(P.locator(".f-mate .f-me-name"), "Bilal M");
  await P.getByRole("button", { name: "Back" }).click();
  await visible(P.locator(".f-us-list"));

  // The class app's Us tab shows her tap once it reads again (each opening of the tab); his 👏 shows his name on the
  // phones. The Race there: every grade, a name = that student's profile with a shout-out instead of a cheer.
  await C.locator(".tabs .tab.class").click();
  await C.locator(".tabs .tab.us").click();
  const bilalLine = U.locator(".f-uk.k-home1");
  await contains(bilalLine.locator(".f-us-clap"), "1");
  await bilalLine.getByRole("button", { name: "Cheer" }).click();
  await until(async () => (await bilalLine.getByRole("button", { name: "You cheered" }).count()) === 1, "the owner's 👏");
  await U.locator(".t-seg").getByRole("button", { name: "Race" }).click();
  await U.locator(".t-grades").getByRole("button", { name: "Grade 8" }).click();
  await visible(U.locator(".f-pod.p1, .f-notyet").first());
  // 11 Nov 2026: this week, all time (her grade row stays) and the GOAT (every grade: no grade row).
  await U.locator(".f-rtabs").getByRole("button", { name: "All time" }).click();
  await contains(U.locator(".f-hero .f-kicker"), "ALL TIME · GRADE 8");
  await visible(U.locator(".t-grades"));
  await visible(U.locator(".f-pod.p1, .f-notyet").first());
  expect(await U.locator(".f-lroad, .f-rank-c").count()).toBe(0);
  await noSideScroll(C);
  await shot(C, "fam71b-teacher-all-time");
  await U.locator(".f-rtabs").getByRole("button", { name: "GOAT" }).click();
  await U.locator(".f-goatc", { hasText: "Bilal" }).click();
  await contains(U.locator(".f-mate .f-me-name"), "Bilal M");
  await visible(U.getByRole("button", { name: /Shout-out for Bilal/ }));
  await shot(C, "fam66c-class-us-mate");
  await U.getByRole("button", { name: "Back" }).click();
  await visible(U.locator(".f-rtabs"));
  // The tab reads its lines again once a minute at most (flipping tabs reads nothing): a minute later, as here.
  await tabTo(P, /Home/);
  await P.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.endsWith(".usAt")) localStorage.removeItem(k);
  });
  await tabTo(P, /^Us$/);
  await contains(P.locator(".f-uk.k-home1 .f-uk-tc"), "Owner ஆசிரியர்");
  // Yesterday's count asks for a Level today: its button opens his Level now.
  await P.locator(".f-uk.k-count").getByRole("button", { name: /இன்று நானும்/ }).click();
  await visible(P.locator(".f-padkeys"));
  await P.getByRole("button", { name: "Back" }).first().click();

  // The smallest phone: the tab and its lines fit 320 px.
  const S = await open(backend, `${site.url}/f/`, size(320, 640));
  await S.getByLabel(/Index/).fill("1001");
  await S.getByLabel("Code").fill("4719");
  await S.getByRole("button", { name: "Sign in" }).click();
  await goalIs(S, "Level 1");
  await tabTo(S, /^Us$/);
  await S.locator(".f-us-guide").getByRole("button", { name: "அடுத்து" }).click();
  await S.locator(".f-us-guide").getByRole("button", { name: "அடுத்து" }).click();
  await S.locator(".f-us-guide").getByRole("button", { name: "தொடங்கு!" }).click();
  await visible(S.locator(".f-uk.k-home1"));
  await noSideScroll(S);
  await shot(S, "fam69-us-320");
  for (const p of [P, C, S]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});

test("Us posts and doubts: a teacher's question with a photo for Grade 8; her answer hidden until marked; ✓ shows it; her doubt to seniors; a teacher's reply", async () => {
  // 7 Nov 2026, his voice notes: "teachers will put the posters ... the screenshot of the question ... when students
  // answer the post, don't show up their name for others ... class mate can see the answer after they submit their own
  // answer ... if the answer is only correct by teacher"; doubts for "teacher or senior students ... or both".
  const before = problems.length;
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
  const add = async (name: string, grade: number) => await t.mutation(api.students.add, { ...as, name, grade, term: 1, stage: "master", unitId: u01 });
  const hana = await add("Hana K", 8);
  const bilal = await add("Bilal M", 8);
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  const FAM_B = "family-phone-bilal-qn-0123456789abcdefghijklmnop";
  await t.mutation(api.families.makeLink, { ...as, studentId: bilal, codeHash: secretHash("family-link", "bilal-qn-family-link-0123456789") });
  await t.mutation(api.family.join, { code: "bilal-qn-family-link-0123456789", token: FAM_B, label: "Android" });
  await t.mutation(api.us.setCfg, { ...as, open: true });
  const paper = { name: "paper.png", mimeType: "image/png", buffer: Buffer.from(PAPER_PNG, "base64") };

  // The class app's Us tab: ✍️ Post → Grade 8, ❓ Question, a photo of the question (cropped), a line of words.
  const C = await open(backend, site.url, size(390, 820), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await C.locator(".tabs .tab.us").click();
  const U = C.frameLocator("iframe.us-frame");
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await U.locator(".f-us-guide").getByRole("button", { name: b }).click();
  await U.locator(".t-head").getByRole("button", { name: /Post/ }).click();
  const sh = U.locator(".f-sheet");
  await sh.getByRole("button", { name: "Grade 8" }).click();
  await sh.getByRole("button", { name: /Question to answer/ }).click();
  await contains(sh.locator(".t-note"), "ஒருவர் விடை மற்றவருக்குத் தெரியாது");
  await sh.locator(".f-file").setInputFiles(paper);
  await U.locator(".f-cut").getByRole("button", { name: "Use this photo" }).click();
  await visible(sh.locator(".f-thumb img"));
  await sh.locator("textarea").pressSequentially("x + 3 = 15 எனின் x = ?");
  await shot(C, "fam80-post-question");
  await sh.getByRole("button", { name: /Post/ }).last().click();
  await contains(U.locator(".f-toast"), "Grade 8 க்கு போனது");
  const q = U.locator(".f-uk.k-post");
  await contains(q, "0 answers");
  await visible(q.locator(".f-pics img"));
  const mid = await t.run(async (ctx) => (await ctx.db.query("usMoments").collect()).find((m) => m.qn)!._id);
  // Bilal answers first (his phone, through the server): words and a photo (its blurred squares made on his phone).
  const pngFile = async () => await t.run(async (ctx) => await ctx.storage.store(new Blob([Buffer.from(PAPER_PNG, "base64")], { type: "image/png" })));
  await t.mutation(api.us.answer, { token: FAM_B, id: mid, text: "x = 18", ph: [{ s: await pngFile(), b: await pngFile(), w: 96, h: 72, z: "4x3:fffeee238ffffff238238eeeeeefff238fff" }] });

  // Hana's phone: the question with its photo; one classmate answered (a locked card: nothing of his).
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level 1");
  await until(async () => (await P.locator(".f-tabs .f-tab").count()) === 5, "the Us tab");
  await tabTo(P, /^Us$/);
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await P.locator(".f-us-guide").getByRole("button", { name: b }).click();
  const line = P.locator(".f-uk.k-post");
  await contains(line, "Owner ஆசிரியர்");
  await contains(line.locator(".f-uk-what"), "Grade 8");
  await contains(line.locator(".f-uk-state"), "1 பேர் விடை அனுப்பினார்கள்");
  await visible(line.locator(".f-pics img"));
  await noSideScroll(P);
  await shot(P, "fam81-us-question-line");
  // Her photo full screen (the big copy), and back.
  await line.locator(".f-pic").click();
  await visible(P.locator(".f-lb img"));
  await P.locator(".f-lb").getByRole("button", { name: "Close" }).click();
  await until(async () => (await P.locator(".f-lb").count()) === 0, "the photo closes");
  await line.getByRole("button", { name: "✍️ Answer" }).click();
  await contains(P.locator(".f-locks"), "1 பேர் விடை அனுப்பினார்கள்");
  // Blurred, not locked (8 Nov 2026): his card with no face, no name, made-up words under the blur.
  await visible(P.locator(".f-veil-c"));
  await visible(P.locator(".f-veil-ph img"));
  await visible(P.locator(".f-veil-go"));
  expect(await P.locator(".f-ut").innerText()).not.toContain("Bilal");
  expect(await P.locator(".f-ut img[src^='http']").count()).toBe(1);
  await P.locator(".f-veil").scrollIntoViewIfNeeded();
  await shot(P, "fam82b-us-answers-blurred");
  expect(await P.locator(".f-ut").innerText()).not.toContain("x = 18");
  await shot(P, "fam82-us-answer-locked");
  // Her answer: words and a photo of her working; once only.
  await P.locator(".f-ut-c textarea").pressSequentially("x = 12");
  await P.locator(".f-ut-c .f-file").setInputFiles(paper);
  await P.locator(".f-cut").getByRole("button", { name: "Use this photo" }).click();
  await visible(P.locator(".f-ut-c .f-thumb img"));
  await P.locator(".f-ut-c").getByRole("button", { name: "Send" }).click();
  await contains(P.locator(".f-toast"), "அனுப்பியாயிற்று");
  await contains(P.locator(".f-msg.mine"), "x = 12");
  await visible(P.locator(".f-msg.mine .f-pics img"));
  await contains(P.locator(".f-ur-wait"), "ஆசிரியர் பார்த்ததும்");
  await contains(P.locator(".f-locks"), "இன்னும் 1 விடைகள் மறைவில்");
  expect(await P.locator(".f-ut-c textarea").count()).toBe(0);
  await noSideScroll(P);
  await shot(P, "fam83-us-answer-sent");

  // The teacher opens the question: both answers with their names; ✓ Hana's, ✗ Bilal's with her words.
  await C.locator(".tabs .tab.class").click();
  await C.locator(".tabs .tab.us").click();
  await contains(q, "2 answers");
  await q.getByRole("button", { name: "Mark ›" }).click();
  const hanaA = U.locator(".f-msg", { hasText: "Hana K" });
  const bilalA = U.locator(".f-msg", { hasText: "Bilal M" });
  await contains(hanaA, "x = 12");
  await contains(bilalA, "x = 18");
  await hanaA.getByRole("button", { name: "Right", exact: true }).click();
  await until(async () => (await hanaA.getAttribute("class"))!.includes("ok"), "Hana's answer marked right");
  await bilalA.getByRole("button", { name: "Your words" }).click();
  await U.locator(".f-sheet textarea").pressSequentially("3 ஐக் கழி");
  await U.locator(".f-sheet").getByRole("button", { name: /Not right/ }).click();
  await until(async () => (await bilalA.getAttribute("class"))!.includes(" no"), "Bilal's answer marked not right");
  await contains(U.locator(".f-ut-sum"), "✓ 1");
  await shot(C, "fam84-class-us-marking");
  await U.getByRole("button", { name: "Back" }).click();
  await visible(U.locator(".f-us-list"));

  // Hana: her answer marked right; Bilal's (marked wrong) never shows to her: still one locked.
  await P.getByRole("button", { name: "Back" }).click();
  await visible(P.locator(".f-us-list"));
  await contains(line.locator(".f-uk-state"), "✓ உன் விடை சரி!");
  await line.locator(".f-uk-who").click();
  await contains(P.locator(".f-msg.mine.ok"), "Owner ஆசிரியர்");
  await contains(P.locator(".f-locks"), "இன்னும் 1");
  expect(await P.locator(".f-ut").innerText()).not.toContain("x = 18");
  // Bilal (through the server): Hana's right answer with her name, his own with the teacher's words.
  const b = await t.query(api.us.thread, { token: FAM_B, id: mid });
  expect(b.list.map((r) => [r.n, r.ok, r.note ?? null])).toEqual([
    ["Bilal M", false, "3 ஐக் கழி"],
    ["Hana K", true, null],
  ]);

  // Her doubt: Seniors, words; nameless to students, her name for teachers.
  await P.getByRole("button", { name: "Back" }).click();
  await P.getByRole("button", { name: "Ask a doubt" }).click();
  const ds = P.locator(".f-sheet.f-doubt");
  await ds.getByRole("button", { name: "Seniors" }).click();
  await contains(ds.locator(".f-doubt-l.s"), "Grade 9–11");
  await ds.locator("textarea").pressSequentially("பின்னங்களை எப்படிக் கூட்டுவது?");
  await shot(P, "fam85-us-doubt-sheet");
  await ds.getByRole("button", { name: "Send" }).click();
  await contains(P.locator(".f-toast"), "பதில் வந்ததும்");
  const mine = P.locator(".f-uk.k-ask.mine");
  await contains(mine, "உன் சந்தேகம்");
  await contains(mine.locator(".f-uk-what"), "மூத்த மாணவர்கள்");
  await P.locator(".f-us-fl").getByRole("button", { name: "🙋 Doubts" }).click();
  expect(await P.locator(".f-uk").count()).toBe(1);
  await P.locator(".f-us-fl").getByRole("button", { name: "All" }).click();

  // The teacher: To do counts it; she opens it (Hana's name), replies.
  await C.locator(".tabs .tab.class").click();
  await C.locator(".tabs .tab.us").click();
  await contains(U.locator(".f-us-fl"), "To do · 1");
  await U.locator(".f-us-fl").getByRole("button", { name: /To do/ }).click();
  const dl = U.locator(".f-uk.k-ask");
  await contains(dl, "Hana K");
  await contains(dl.locator(".f-gchip"), "8");
  await dl.getByRole("button", { name: "Reply ›" }).click();
  await U.locator(".f-tb-in").pressSequentially("பகுதிகளை ஒன்றாக்கு: புத்தகம் பக்கம் 12.");
  await U.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await contains(U.locator(".f-msg.tch"), "பக்கம் 12");
  await contains(U.locator(".f-msg.tch .f-msg-tag"), "ஆசிரியர்");
  await shot(C, "fam86-class-us-doubt-reply");

  // Hana opens her doubt: the teacher's reply.
  await mine.locator(".f-uk-who").click();
  await contains(P.locator(".f-msg.tch"), "பக்கம் 12");
  await noSideScroll(P);
  await shot(P, "fam87-us-doubt-replied");
  for (const p of [P, C]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});

test("Us talk: a birthday opened; one-tap words and her own (+1 XP); a reply and a 👏 in her bell; her 💡 post shown by a teacher", async () => {
  // 8 Nov 2026, his voice note: "if I go to inside any thread, that feel like boring ... who appreciating, who correcting
  // ... student can chat inside each thread"; his answers: comments "like the hall", XP for comments (not claps), 💡 posts
  // after a teacher's ✓. Made-up students and words.
  const before = problems.length;
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  const add = async (name: string, grade: number) => await t.mutation(api.students.add, { ...as, name, grade, term: 1, stage: "master", unitId: u01 });
  const hana = await add("Hana K", 8);
  const bilal = await add("Bilal M", 8);
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  const FAM_B = "family-phone-bilal-talk-0123456789abcdefghijklmn";
  await t.mutation(api.families.makeLink, { ...as, studentId: bilal, codeHash: secretHash("family-link", "bilal-talk-family-link-0123456789") });
  await t.mutation(api.family.join, { code: "bilal-talk-family-link-0123456789", token: FAM_B, label: "Android" });
  await t.mutation(api.us.setCfg, { ...as, open: true });
  const bday = await t.run(async (ctx) => await ctx.db.insert("usMoments", { k: "bday", sid: bilal, n: "Bilal M", g: 8, at: Date.now() - 3600_000, day: 0, demo: false, c: 0 }));

  // Hana's phone: Us, the birthday card, opened.
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await until(async () => (await P.locator(".f-tabs .f-tab").count()) === 5, "the Us tab");
  await tabTo(P, /^Us$/);
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await P.locator(".f-us-guide").getByRole("button", { name: b }).click();
  const card = P.locator(".f-uk.k-bday");
  await contains(card, "Bilal M");
  await contains(card.locator(".f-uk-what"), "பிறந்தநாள்");
  await card.locator(".f-us-clap").click();
  await until(async () => (await card.locator(".f-us-clap").getAttribute("aria-pressed")) === "true", "her 🎂");
  await card.locator(".f-uk-who").click();
  await contains(P.locator(".f-talk-none"), "முதலில் நீ");
  await visible(P.locator(".f-ut-cheer .f-us-clap.done"));
  await shot(P, "fam90-us-thread-empty");
  // One tap: a one-tap word (no XP); then her own words (+1 XP).
  await P.locator(".f-tb-q").getByRole("button", { name: "🎂 பிறந்தநாள் வாழ்த்துகள்!" }).click();
  await contains(P.locator(".f-msg.mine"), "பிறந்தநாள் வாழ்த்துகள்");
  await P.locator(".f-tb-in").pressSequentially("இனிய பிறந்தநாள் Bilal, சூப்பர் நாளாகட்டும்");
  await P.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await contains(P.locator(".f-toast"), "+1 XP");
  await until(async () => (await P.locator(".f-msg.mine").count()) === 2, "her two comments");
  expect((await t.query(api.family.me, { token: (await hanaToken(P))! })).xp).toBe(1);

  // Bilal (through the server): a reply under her words, and a 👏 on them.
  const th = await t.query(api.us.thread, { token: FAM_B, id: bday });
  const hers = th.talk!.find((r) => r.t?.startsWith("இனிய"))!;
  expect(hers).toMatchObject({ n: "Hana K", g: 8 });
  await t.mutation(api.us.comment, { token: FAM_B, id: bday, text: "நன்றி Hana! 🙏", re: hers.id });
  await t.mutation(api.us.like, { token: FAM_B, aid: hers.id });
  // The open thread reads again by itself (every 20 s while on screen): his reply with hers quoted above it (8 Nov
  // 2026: "we don't know which message is for which one"), her 👏 under her words.
  await until(async () => (await P.locator(".f-msg.re").count()) === 1, "Bilal's reply quoting hers", 30_000);
  const his = P.locator(".f-msg.re");
  await contains(his, "நன்றி Hana");
  await contains(his.locator(".f-msg-q"), "இனிய பிறந்தநாள்");
  await contains(P.locator(".f-msg.mine .f-rx").first(), "1");
  // She reacts ❤️ to his reply (😊, then the bar), and answers him with a tag (@ and a tap on his name).
  await his.getByRole("button", { name: "React", exact: true }).click();
  await P.locator(".f-rxbar").getByRole("button", { name: "React ❤️" }).click();
  await contains(his.locator(".f-rx.on"), "❤️");
  await his.getByRole("button", { name: "↩ Reply" }).click();
  await contains(P.locator(".f-tb-re"), "Bilal M");
  await P.locator(".f-tb-in").pressSequentially("@Bil");
  await P.locator(".f-tb-at").getByRole("button", { name: /Bilal M/ }).click();
  await P.locator(".f-tb-in").pressSequentially("நாளை சந்திப்போம்");
  await P.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await until(async () => (await P.locator(".f-msg.re").count()) === 2, "her reply quoting his");
  await contains(P.locator(".f-msg.re").last().locator(".f-at"), "@Bilal M");
  await contains(P.locator(".f-msg.re").last().locator(".f-msg-q"), "நன்றி Hana");
  await noSideScroll(P);
  await shot(P, "fam91-us-thread-talk");

  // Her bell: the reply and the 👏 (Us's lines with her teachers' answers); a tap opens the line.
  await P.getByRole("button", { name: "Back" }).click();
  await P.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (k.endsWith(".usAt")) localStorage.removeItem(k);
  });
  await tabTo(P, /Home/);
  await until(async () => /: 2 new/.test((await P.locator(".f-bellb").getAttribute("aria-label")) ?? ""), "two new in the bell");
  await P.locator(".f-bellb").click();
  // The bell's page (8 Nov 2026): alerts said plainly on top, then today's lines with a face each.
  await visible(P.locator(".f-bellscr .f-pushcard.big"));
  await contains(P.locator(".f-bell-day").first(), "இன்று");
  await contains(P.locator(".f-belllist"), "உனக்குப் பதில்");
  await contains(P.locator(".f-belllist"), "பாராட்டினார்");
  await visible(P.locator(".f-bellitem.us.r .f-bell-face"));
  await noSideScroll(P);
  await shot(P, "fam92-bell-us");
  // Us only: the chip.
  await P.locator(".f-bell-chips").getByRole("button", { name: "Us" }).click();
  await until(async () => (await P.locator(".f-bellitem:not(.us)").count()) === 0, "only Us's lines");
  await P.locator(".f-bellitem.us.r").click();
  await contains(P.locator(".f-msg.re").first(), "நன்றி Hana");
  // Back from a line opened in the bell: the bell again, then Back to Us.
  await P.getByRole("button", { name: "Back" }).click();
  await visible(P.locator(".f-bellscr"));
  await P.getByRole("button", { name: "Back" }).click();

  // Her 💡: what she learned (a starter, her words); only she and the teachers see it until a ✓.
  await visible(P.locator(".f-us-say"));
  await P.locator(".f-us-say").click();
  const ls = P.locator(".f-sheet.f-learn");
  await ls.getByRole("button", { name: "இன்று கற்றது" }).click();
  await ls.locator("textarea").pressSequentially("பின்னங்களைக் கூட்ட முதலில் பகுதிகளைச் சமமாக்க வேண்டும்");
  await shot(P, "fam93-us-learn-sheet");
  await ls.getByRole("button", { name: "Send" }).click();
  await contains(P.locator(".f-toast"), "ஆசிரியர் ✓");
  const lc = P.locator(".f-uk.k-learn.mine");
  await contains(lc.locator(".f-uk-state"), "ஆசிரியர் ✓ கொடுத்ததும்");
  expect((await t.query(api.us.feed, { token: FAM_B })).items.some((x) => x.k === "learn")).toBe(false);

  // The class app's Us tab: To do → Check › → ✓ Show to everyone (+5 XP for her).
  const C = await open(backend, site.url, size(390, 820), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await C.locator(".tabs .tab.us").click();
  const U = C.frameLocator("iframe.us-frame");
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await U.locator(".f-us-guide").getByRole("button", { name: b }).click();
  await U.locator(".f-us-fl").getByRole("button", { name: /To do/ }).click();
  await U.locator(".f-uk.k-learn").getByRole("button", { name: "Check ›" }).click();
  await U.getByRole("button", { name: "✓ Show to everyone" }).click();
  await contains(U.locator(".f-toast"), "Shown to everyone");
  await contains(U.locator(".f-uk-state.ok"), "எல்லோருக்கும் காட்டினார்");
  await shot(C, "fam94-class-us-learn-shown");
  expect((await t.query(api.us.feed, { token: FAM_B })).items.find((x) => x.k === "learn")).toMatchObject({ n: "Hana K", lst: "ok", by: "Owner" });
  // +1 her own words, +1 her tagged reply to Bilal (own words too), +5 the 💡 shown.
  expect((await t.query(api.family.me, { token: (await hanaToken(P))! })).xp).toBe(7);

  // The smallest phone: the thread and its bar fit 320 px.
  await P.setViewportSize({ width: 320, height: 640 });
  await tabTo(P, /^Us$/);
  await P.locator(".f-uk.k-bday .f-uk-who").click();
  await visible(P.locator(".f-tb-in"));
  await noSideScroll(P);
  await shot(P, "fam95-us-thread-320");
  for (const p of [P, C]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});

/** The family key this phone keeps for the child on screen (its token: to ask the server what his phone sees). */
async function hanaToken(p: Page): Promise<string | null> {
  return await p.evaluate(() => {
    const cur = localStorage.getItem("aristora.family.current");
    const list = JSON.parse(localStorage.getItem("aristora.family.accounts") ?? "[]") as { id: string; token: string }[];
    return list.find((a) => a.id === cur)?.token ?? null;
  });
}

test("Us people: her photo on her lines; the owl writes the automatic lines; a face opens the profile; a wrong answer saved, shared and asked again without the name", async () => {
  // 8 Nov 2026, his voice note: "we don't have any features to edit the profile photo for the teachers ... teachers like
  // to download that photo ... put the share button ... we have doubts group ... if that is wrong, teacher can repost that
  // ... who can find what the problem here ... don't show the student's name ... the automatic message ... feel like
  // that's come from owl ... profile is not clickable in the community page". Made-up students and words.
  const before = problems.length;
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  const add = async (name: string, grade: number) => await t.mutation(api.students.add, { ...as, name, grade, term: 1, stage: "master", unitId: u01 });
  const hana = await add("Hana K", 8);
  const bilal = await add("Bilal M", 8);
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  const FAM_B = "family-phone-bilal-ppl-0123456789abcdefghijklmno";
  await t.mutation(api.families.makeLink, { ...as, studentId: bilal, codeHash: secretHash("family-link", "bilal-ppl-family-link-0123456789") });
  await t.mutation(api.family.join, { code: "bilal-ppl-family-link-0123456789", token: FAM_B, label: "Android" });
  await t.mutation(api.us.setCfg, { ...as, open: true });
  await t.run(async (ctx) => await ctx.db.insert("usMoments", { k: "bday", sid: bilal, n: "Bilal M", g: 8, at: Date.now() - 3600_000, day: 0, demo: false, c: 0 }));
  // The owner's question for Grade 8; Bilal's wrong answer with a photo of his paper (through the server).
  const qid = await t.mutation(api.us.post, { ...as, text: "x + 3 = 15 எனின் x = ?", gs: [8], qn: true });
  const file = async () => await t.run(async (ctx) => await ctx.storage.store(new Blob([Buffer.from(PAPER_PNG, "base64")], { type: "image/png" })));
  await t.mutation(api.us.answer, { token: FAM_B, id: qid, text: "x = 18", ph: [{ s: await file(), b: await file(), w: 96, h: 72 }] });

  // The class app's Us tab: her picture at the top → her photo (made small on her phone) → on her post.
  const C = await open(backend, site.url, size(390, 820), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await C.locator(".tabs .tab.us").click();
  const U = C.frameLocator("iframe.us-frame");
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await U.locator(".f-us-guide").getByRole("button", { name: b }).click();
  await visible(U.locator(".t-me .t-cam"));
  await U.locator(".t-me").click();
  await contains(U.locator(".t-sheet"), "Students see it");
  await U.locator(".t-sheet .f-file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: Buffer.from(PAPER_PNG, "base64") });
  await U.locator(".f-photo-sheet .f-crop.live").waitFor({ state: "visible", timeout: 25_000 });
  await U.getByRole("button", { name: /Use this photo/ }).click();
  await contains(U.locator(".f-toast"), "Your photo is on Us");
  await visible(U.locator(".t-me .f-ava.pic img"));
  expect(await t.run(async (ctx) => (await ctx.db.query("staffPhotos").collect()).length)).toBe(1);
  // The owl's line: its face is the owl in the mood of the moment, its name the owl's.
  const owlLine = U.locator(".f-uk.k-bday");
  await visible(owlLine.locator(".f-uk-owl .f-owl"));
  await contains(owlLine.locator(".f-uk-who"), "ஆந்தை");
  await shot(C, "fam96-class-us-her-photo");

  // Her question opened: Bilal's answer with ⬇ Download and Share under his photo (the bin stays at the end of the row).
  await U.locator(".f-uk.k-post").getByRole("button", { name: "Mark ›" }).click();
  const ans = U.locator(".f-msg").filter({ hasText: "x = 18" });
  await visible(ans.locator(".f-pics img"));
  const save = ans.locator(".f-save");
  await visible(save);
  const [dl] = await Promise.all([C.waitForEvent("download"), save.getByRole("button", { name: /Download/ }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^aristora-\d{4}-\d\d-\d\d\.png$/);
  await contains(U.locator(".f-toast"), "Saved on this phone");
  // Share: the phone's share sheet (stood in for here) gets the picture and the words, without his name (not marked).
  await U.locator("body").evaluate(() => {
    const w = window as unknown as { __shared?: unknown };
    Object.assign(navigator, {
      canShare: () => true,
      share: async (d: { files: File[]; text: string }) => {
        w.__shared = { n: d.files.length, name: d.files[0].name, text: d.text };
      },
    });
  });
  await save.getByRole("button", { name: /Share/ }).click();
  await until(async () => !!(await U.locator("body").evaluate(() => (window as unknown as { __shared?: unknown }).__shared)), "the share sheet");
  const shared = (await U.locator("body").evaluate(() => (window as unknown as { __shared?: unknown }).__shared)) as { n: number; name: string; text: string };
  expect(shared.n).toBe(1);
  expect(shared.text).toContain("app.aristora.org");
  expect(shared.text).not.toContain("Bilal");
  // ✗: then "find the mistake" right there; the sheet: the answer without the name, ✂ to cut a name out of the paper.
  await ans.getByRole("button", { name: "Not right" }).click();
  await contains(U.locator(".f-toast"), "find the mistake");
  await ans.locator(".f-spot-go").click();
  const sp = U.locator(".f-sheet").filter({ hasText: "Find the mistake" });
  await contains(sp.locator(".f-spot-a"), "x = 18");
  await visible(sp.locator(".f-spot-pics img"));
  await shot(C, "fam97-class-us-spot-sheet");
  await sp.getByRole("button", { name: "✂ Cut" }).click();
  await U.locator(".f-cut").getByRole("button", { name: "Use this photo" }).click();
  await visible(sp.locator(".f-spot-pics img"));
  await sp.getByRole("button", { name: /Post for everyone/ }).click();
  await contains(U.locator(".f-toast"), "for Grade 8");
  await contains(ans.locator(".f-spot-done"), "Asked everyone");
  const spot = await t.run(async (ctx) => (await ctx.db.query("usMoments").collect()).find((m) => m.src));
  expect(spot).toMatchObject({ k: "post", qn: true, gs: [8], src: qid, sw: "x = 18", byN: "Owner" });
  expect(spot!.ph).toHaveLength(1);
  expect(spot!.sid).toBeUndefined();

  // Hana's phone: the owl's birthday line (a tap on Bilal's face = his profile), her teacher's photo on the post, and
  // the "find the mistake": the question above, a student's answer, no name anywhere.
  const P = await open(backend, `${site.url}/f/`, size(390, 820));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await until(async () => (await P.locator(".f-tabs .f-tab").count()) === 5, "the Us tab");
  await tabTo(P, /^Us$/);
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await P.locator(".f-us-guide").getByRole("button", { name: b }).click();
  const bd = P.locator(".f-uk.k-bday");
  await visible(bd.locator(".f-uk-owl .f-owl"));
  await contains(bd.locator(".f-uk-who"), "ஆந்தை");
  await contains(bd.locator(".f-uk-about"), "Bilal M");
  await visible(P.locator(".f-uk.k-post .f-uk-face .f-ava.pic img").first());
  const sc = P.locator(".f-uk.k-post").filter({ has: P.locator(".f-spot-a") });
  await contains(sc.locator(".f-uk-what"), "தவறைக் கண்டுபிடி");
  await contains(sc.locator(".f-spot-q"), "x + 3 = 15");
  await contains(sc.locator(".f-spot-a"), "x = 18");
  await visible(sc.locator(".f-spot-a .f-pics img"));
  expect(await sc.innerText()).not.toContain("Bilal");
  await visible(sc.getByRole("button", { name: "🔍 கண்டுபிடி" }));
  await noSideScroll(P);
  await sc.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shot(P, "fam98-us-spot-card");
  await bd.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await shot(P, "fam98b-us-owl-line");
  await bd.locator(".f-uk-about .f-tapface").click();
  await contains(P.locator(".f-mate .f-me-name"), "Bilal M");
  await P.getByRole("button", { name: "Back" }).click();
  await visible(P.locator(".f-us-list"));
  // The smallest phone: the find-the-mistake card fits 320 px.
  await P.setViewportSize({ width: 320, height: 640 });
  await noSideScroll(P);
  await sc.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await shot(P, "fam99-us-spot-320");
  for (const p of [P, C]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});

test("Us groups and chats: his grade's group with a reply, a tag and a reaction; two boys message, a girl can't; Members; a teacher's chat and her number; a group she makes; the owner reads every chat", async () => {
  // 8 Nov 2026, his voice note: "students want to forget the WhatsApp ... we need group ... like a Discord ... private
  // messaging ... the girl students and boy students can't message each other ... teacher can message anyone". His
  // answers: groups like the hall, teachers make groups, each grade its own. Made-up students and words.
  const before = problems.length;
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  const add = async (name: string, grade: number) => await t.mutation(api.students.add, { ...as, name, grade, term: 1, stage: "master", unitId: u01 });
  const arun = await add("Arun K", 8);
  const bilal = await add("Bilal M", 8);
  const hana = await add("Hana K", 8);
  const kumar = await t.mutation(api.students.add, { ...as, name: "Kumar P", grade: 11, term: 1, stage: "fighter" });
  await t.mutation(api.students.setSex, { ...as, ids: [arun, bilal, kumar], sex: "b" });
  await t.mutation(api.students.setSex, { ...as, ids: [hana], sex: "g" });
  await t.mutation(api.families.setCode, { ...as, studentId: arun, code: "4719" });
  const phone = async (sid: typeof arun, key: string) => {
    const tok = `family-phone-${key}-chat-`.padEnd(48, "x");
    const code = `${key}-chat-family-link-0123456789`;
    await t.mutation(api.families.makeLink, { ...as, studentId: sid, codeHash: secretHash("family-link", code) });
    await t.mutation(api.family.join, { code, token: tok, label: "Android" });
    return tok;
  };
  const FAM_B = await phone(bilal, "bilal");
  const FAM_H = await phone(hana, "hana");
  const FAM_K = await phone(kumar, "kumar");
  await t.mutation(api.us.setCfg, { ...as, open: true });

  // Arun's phone: Us → Groups → his grade's group (there before anyone wrote); his hello.
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await until(async () => (await P.locator(".f-tabs .f-tab").count()) === 5, "the Us tab");
  await tabTo(P, /^Us$/);
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await P.locator(".f-us-guide").getByRole("button", { name: b }).click();
  await P.locator(".f-us-seg").getByRole("tab", { name: /Groups/ }).click();
  const g8 = P.locator(".c-row", { hasText: "Grade 8" });
  await contains(g8, "முதலில் நீ");
  await noSideScroll(P);
  await shot(P, "fam100-us-groups");
  await g8.click();
  await contains(P.locator(".c-head-w"), "Grade 8");
  await P.locator(".f-tb-in").pressSequentially("எல்லோருக்கும் வணக்கம்! 👋");
  await P.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await contains(P.locator(".f-msg.mine"), "எல்லோருக்கும் வணக்கம்");
  // Bilal answers him with a quote and a tag (his phone, through the server); Arun's open chat shows it in seconds.
  const gid = (await t.query(api.chat.rooms, { token: FAM_B })).groups[0].id;
  const hello = (await t.query(api.chat.room, { token: FAM_B, id: gid })).msgs[0];
  await t.mutation(api.chat.send, { token: FAM_B, id: gid, text: "@Arun K வணக்கம்! நாளை வருகிறாயா?", re: hello.id, mt: [arun] });
  await until(async () => (await P.locator(".f-msg.re").count()) === 1, "Bilal's reply in the open group", 15_000);
  await contains(P.locator(".f-msg.re .f-msg-q"), "எல்லோருக்கும் வணக்கம்");
  await contains(P.locator(".f-msg.re .f-at"), "@Arun K");
  await P.locator(".f-msg.re").getByRole("button", { name: "React", exact: true }).click();
  await P.locator(".f-rxbar").getByRole("button", { name: "React 😂" }).click();
  await contains(P.locator(".f-msg.re .f-rx.on"), "😂");
  await until(async () => (await t.query(api.chat.room, { token: FAM_B, id: gid })).msgs[1].rx?.l === 1, "his 😂 on the server");
  // Anyone in his grade's group can be tagged, also a classmate who hasn't written yet: @Ha → Hana K.
  await P.locator(".f-tb-in").pressSequentially("@Ha");
  await P.locator(".f-tb-at").getByRole("button", { name: /Hana K/ }).click();
  await P.locator(".f-tb-in").pressSequentially("நீயும் வா!");
  await P.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await until(async () => (await t.query(api.chat.room, { token: FAM_H, id: gid })).msgs.some((m) => m.t === "@Hana K நீயும் வா!" && m.mt?.[0]?.n === "Hana K"), "Hana tagged");
  await contains(P.locator(".f-msg.mine .f-at").last(), "@Hana K");
  await noSideScroll(P);
  await shot(P, "fam101-us-grade-group");

  // Chats → New chat → Members: boys any grade and teachers have 💬, Hana (a girl) none.
  await P.getByRole("button", { name: "Back" }).click();
  await P.locator(".f-us-seg").getByRole("tab", { name: /Chats/ }).click();
  await P.locator(".c-tools").getByRole("button", { name: /புதிய chat/ }).click();
  await contains(P.locator(".c-rule"), "மாணவர்களுடனும்");
  const row = (n: string) => P.locator(".c-people li", { hasText: n });
  await visible(row("Hana K"));
  expect(await row("Hana K").locator(".c-dm").count()).toBe(0);
  await visible(row("Kumar P").locator(".c-dm"));
  await visible(row("Owner").locator(".c-dm"));
  await noSideScroll(P);
  await shot(P, "fam102-us-members");
  await row("Bilal M").locator(".c-dm").click();
  await contains(P.locator(".c-head-w"), "Bilal M");
  await contains(P.locator(".c-safe"), "பாதுகாப்புக்காக");
  expect(await P.locator(".f-tb-cam").count()).toBe(0);
  await P.locator(".f-tb-in").pressSequentially("Q5 இன் விடை என்ன?");
  await P.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await contains(P.locator(".f-msg.mine"), "Q5 இன் விடை");
  const dmB = (await t.query(api.chat.rooms, { token: FAM_B })).dms[0];
  expect(dmB).toMatchObject({ name: "Arun K", un: 1, lt: "Q5 இன் விடை என்ன?" });
  await t.mutation(api.chat.send, { token: FAM_B, id: dmB.id, text: "36 என்று நினைக்கிறேன் 🤔" });
  await until(async () => (await P.locator(".f-msg:not(.mine)").count()) === 1, "Bilal's answer in the open chat", 15_000);
  await shot(P, "fam103-us-dm");
  // His rule on the server: never a boy and a girl; a Grade 11 boy is fine.
  await expect(t.mutation(api.chat.dm, { token: FAM_H, to: `s:${arun}` })).rejects.toThrow();
  expect((await t.mutation(api.chat.dm, { token: FAM_K, to: `s:${arun}` })).id).toBeTruthy();

  // Arun writes to the owner from Members: the class app's Us tab shows her number while she is elsewhere.
  await P.getByRole("button", { name: "Back" }).click();
  await P.getByRole("button", { name: "Back" }).click();
  await P.locator(".c-tools").getByRole("button", { name: /புதிய chat/ }).click();
  await row("Owner").locator(".c-dm").click();
  await visible(P.locator(".f-tb-cam"));
  await P.locator(".f-tb-in").pressSequentially("Sir, நாளை வகுப்பு உண்டா?");
  await P.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await contains(P.locator(".f-msg.mine"), "நாளை வகுப்பு");
  const C = await open(backend, site.url, size(390, 820), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await contains(C.locator(".tabs .tab.us .tab-badge"), "1");
  await C.locator(".tabs .tab.us").click();
  const U = C.frameLocator("iframe.us-frame");
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await U.locator(".f-us-guide").getByRole("button", { name: b }).click();
  await U.locator(".f-us-seg").getByRole("tab", { name: /Chats/ }).click();
  await U.locator(".c-row", { hasText: "Arun K" }).click();
  await contains(U.locator(".f-msg"), "நாளை வகுப்பு");
  await U.locator(".f-tb-in").pressSequentially("ஆம் Arun, 4 மணிக்கு 👍");
  await U.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await contains(U.locator(".f-msg.mine"), "4 மணிக்கு");
  await until(async () => (await t.query(api.chat.room, { token: (await hanaToken(P))!, id: (await t.query(api.chat.rooms, { token: (await hanaToken(P))! })).dms.find((x) => x.tch)!.id })).msgs.length === 2, "her answer on his side");
  await shot(C, "fam104-class-us-chat");
  // A group she makes: O/L doubts for Grade 11 (Kumar sees it; Arun doesn't).
  await U.getByRole("button", { name: "Back" }).click();
  await U.locator(".f-us-seg").getByRole("tab", { name: /Groups/ }).click();
  await U.locator(".c-tools").getByRole("button", { name: /New group/ }).click();
  await U.locator(".c-gsheet .c-gname").first().fill("O/L doubts");
  await U.locator(".c-gsheet .c-chips").getByRole("button", { name: "11", exact: true }).click();
  await U.locator(".c-gsheet").getByRole("button", { name: "Make the group" }).click();
  await contains(U.locator(".c-head-w"), "O/L doubts");
  expect((await t.query(api.chat.rooms, { token: FAM_K })).groups.map((x) => x.name)).toEqual(["Grade 11", "O/L doubts"]);
  expect((await t.query(api.chat.rooms, { token: (await hanaToken(P))! })).groups.map((x) => x.name)).toEqual(["Grade 8"]);
  // The owner reads every private chat (look only).
  await U.getByRole("button", { name: "Back" }).click();
  await U.locator(".f-us-seg").getByRole("tab", { name: /Chats/ }).click();
  await U.locator(".c-tools").getByRole("button", { name: /Every chat/ }).click();
  await U.locator(".c-row", { hasText: "Arun K · Bilal M" }).click();
  await contains(U.locator(".c-cant"), "Only the two of them");
  await shot(C, "fam105-class-every-chat");
  // Settings → Students → Grade 8 → Boys and girls: all 3 set; Arun's Boy tapped off (teachers only until set), on again.
  await C.getByRole("button", { name: /Settings/ }).click();
  await C.getByRole("button", { name: /^Grade 8\b/ }).click();
  await contains(C.locator(".sex-line small"), "All 3 set");
  await C.locator(".sex-line").click();
  await contains(C.locator(".olm-sheet .olm-top b"), "2 boys · 1 girl");
  const arunRow = C.locator(".sex-kids li", { hasText: "Arun K" });
  await arunRow.getByRole("button", { name: /Boy/ }).click();
  await contains(C.locator(".olm-sheet .olm-top b"), "1 boy · 1 girl · 1 not set");
  await until(async () => (await t.run(async (ctx) => await ctx.db.get(arun)))?.sex === undefined, "Arun not set on the server");
  await arunRow.getByRole("button", { name: /Boy/ }).click();
  await until(async () => (await t.run(async (ctx) => await ctx.db.get(arun)))?.sex === "b", "Arun a boy again");
  await visible(C.locator(".sex-done"));
  await noSideScroll(C);
  await shot(C, "fam107-class-boys-girls");
  await C.locator(".olm-sheet").getByRole("button", { name: "Close" }).click();
  await contains(C.locator(".sex-line small"), "All 3 set");

  // The smallest phone: the group and its bar fit 320 px.
  await P.setViewportSize({ width: 320, height: 640 });
  await P.getByRole("button", { name: "Back" }).click();
  await P.getByRole("button", { name: "Back" }).click();
  await P.locator(".f-us-seg").getByRole("tab", { name: /Groups/ }).click();
  await P.locator(".c-row", { hasText: "Grade 8" }).click();
  await visible(P.locator(".f-tb-in"));
  await noSideScroll(P);
  await shot(P, "fam106-us-group-320");
  for (const p of [P, C]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});

test("the owner's Preview: Settings → Books → a unit → every level open on the phone's own screen, look only; nobody else", async () => {
  // 5 Nov 2026, his ask: check every question of a unit without doing its levels in order; his answers: only him, only
  // looking. Made-up questions only.
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const BOOKS = "books-teacher-token-preview-0123456789abcdefghij";
  await addPerson(t, { name: "Mala", token: BOOKS, tabs: ["correction"], can: ["books"] });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u01 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G8-U01")).first())!._id);
  const kinds: Record<number, Ans> = {
    41: { k: "choose", n: 4, a: 3, items: ["Made-up name A", "Made-up name B", "Made-up name C", "Made-up name D"], below: true },
    42: { k: "why", a: true },
  };
  await t.mutation(api.catalog.saveWorkbook, {
    ...as,
    unitId: u01,
    parts: BOOK.data.parts.map((p) => ({ id: p.id, to: p.to, ...(p.each ? { each: p.each } : {}) })),
    levels: BOOK.data.levels.map((l) => ({ to: l.to, max: l.max })),
    marks: BOOK.data.marks ?? {},
    replace: true,
    key: fakeKey().map((k) => {
      const m = outOf(BOOK.data, k.q)!;
      // Level 6: Q53 in two parts (their boxes under each sub-question), Q54 an answer in n over 2, Q55 a mixed number.
      if (k.q === 53)
        return { q: 53, parts: [{ p: "i", a: "**5**", m: Math.floor(m / 2), t: { k: "box", b: [{ v: ["5"] }] } }, { p: "ii", a: "**6**", m: m - Math.floor(m / 2), t: { k: "box", b: [{ v: ["6"] }] } }] };
      if (k.q === 54) return { q: 54, parts: [{ p: "i", a: "n(n + 1)/2", m, t: { k: "box", b: [{ v: ["n(n + 1)/2"] }] } }] };
      if (k.q === 55) return { q: 55, parts: [{ p: "i", a: "**1 3/4**", m, t: { k: "box", b: [{ v: ["1 3/4"] }] } }] };
      return kinds[k.q] ? { ...k, t: kinds[k.q] } : k;
    }),
  });
  const card = (q: number, text: string) => `<div class="si" data-q="${q}" data-b="${q}.0"><span class="qn">${q}</span><div class="sit">${text}</div></div>`;
  const essay = (q: number, subs: string[]) =>
    `<div class="pq pqc" data-q="${q}"><div class="bk" data-b="${q}.0"><div class="pqh"><span class="qn">${q}</span></div><p class="lead2">A made-up pattern question number ${q}</p></div>` +
    subs.map((x, i) => `<div class="bk" data-b="${q}.${i + 1}"><div class="rp in"><span class="rl">(${"i".repeat(i + 1)})</span><span>${x}</span></div><div class="wz" style="height:8mm"></div></div>`).join("") +
    "</div>";
  // Q41 as the engine prints a question with its figure beside the text (5 Nov 2026: G8 U01 Q48 and Q50 showed none).
  const side = (q: number) =>
    `<div class="si" data-q="${q}" data-b="${q}.0"><div class="sih"><span class="qn">${q}</span><div class="sib"><div class="sit">A made-up question with a figure beside it, long enough to fill the line</div></div>` +
    `<div class="sif"><div class="dg" style="width:58mm;height:20mm"><svg viewBox="0 0 120 40" width="100%" height="100%"><circle cx="20" cy="20" r="15"/><rect x="60" y="5" width="50" height="30"/></svg></div></div></div></div>`;
  await t.run(async (ctx) => {
    for (let q = 41; q <= 52; q++) await ctx.db.insert("questions", { unitId: u01, stage: "master", q, html: q === 41 ? side(q) : card(q, `A made-up question number ${q}`) });
    await ctx.db.insert("questions", { unitId: u01, stage: "master", q: 53, html: essay(53, ["The first made-up sub-question", "The second made-up sub-question"]) });
    for (const q of [54, 55]) await ctx.db.insert("questions", { unitId: u01, stage: "master", q, html: essay(q, [`Its only made-up sub-question, ${q}`]) });
    await ctx.db.insert("bookCss", { unitId: u01, stage: "master", css: ".qn { font-weight: 700; } .sih { display: flex; } .sif { flex: none; } .si .sih { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; }", updatedAt: 0 });
  });

  // The owner: Books → Grade 8 → U01 → Preview on the phone.
  const O = await open(backend, site.url, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await O.getByRole("button", { name: "Settings" }).click();
  await O.getByRole("button", { name: "Books", exact: true }).click();
  await O.getByRole("button", { name: /^Grade 8\b/ }).click();
  await O.locator(".unit-list li", { hasText: "U01" }).getByRole("button").first().click();
  await O.getByRole("link", { name: /^Preview on the phone/ }).click();
  const says = (l: L, text: string) => until(async () => ((await l.first().textContent()) ?? "").includes(text), `"${text}" in ${l}`); // capitals in CSS
  await says(O.locator(".f-look .f-kicker"), "Preview · only you");
  await until(async () => (await O.locator(".f-look-levels button").count()) === BOOK.data.levels.length, "every level listed");
  await shot(O, "fam49-preview-levels");

  // Level 5 straight away (no level before it done): the level screen students get, Check off.
  await O.locator(".f-look-levels button", { hasText: "Level 5" }).first().click();
  await contains(O.locator(".f-qn"), "Q41");
  await until(async () => (await O.locator(".f-pkn .f-pkb").count()) === 4, "Q41's four names under the question");
  // Its figure is on the card, not cut off beside the text.
  const fig = await O.locator(".f-paper .sif svg").first().boundingBox();
  const paper = await O.locator(".f-paper .qv").first().boundingBox();
  expect(!!fig && !!paper && fig.width > 100 && fig.x >= paper.x && fig.x + fig.width <= paper.x + paper.width + 1).toBe(true);
  await says(O.locator(".f-checkpill"), "Preview");
  expect(await O.getByRole("button", { name: "Check" }).count()).toBe(0);
  await shot(O, "fam50-preview-level5");
  await O.locator(".f-qchip", { hasText: "42" }).first().click();
  await until(async () => (await O.locator(".f-pk.yn .f-pkb").count()) === 2, "Q42's ஆம் / இல்லை");
  await visible(O.locator(".f-whyt"));
  await noSideScroll(O);

  // Level 6: each part's boxes right under its own sub-question, inside the printed question (5 Nov 2026, his ask).
  await O.getByRole("button", { name: "Back" }).first().click();
  await O.locator(".f-look-levels button", { hasText: "Level 6" }).first().click();
  await contains(O.locator(".f-qn"), "Q53");
  await until(async () => (await O.locator(".f-paper > .f-part").count()) === 2, "Q53's two parts inside the question");
  const box = async (l: L) => (await l.first().boundingBox())!;
  const [one, two] = [await box(O.locator(".f-paper .rp .rl", { hasText: "(i)" })), await box(O.locator(".f-paper .rp .rl", { hasText: "(ii)" }))];
  const [r1, r2] = [await box(O.locator(".f-paper > .f-part").nth(0)), await box(O.locator(".f-paper > .f-part").nth(1))];
  expect(r1.y > one.y && r1.y + r1.height <= two.y && r2.y > two.y).toBe(true);
  await shot(O, "fam51-preview-parts");
  // A fraction: the numerator over a line over the denominator, typed a cell at a time (never a slash).
  await O.locator(".f-qchip", { hasText: "55" }).first().click();
  await until(async () => (await O.locator(".f-box.frac .f-fc").count()) === 3, "Q55's whole number and fraction");
  const key = (name: string) => O.getByRole("button", { name, exact: true }).click();
  await key("1");
  await O.locator(".f-padkeys .f-key.next").click(); // → to the numerator ("Done" here: Q55 is the level's last box)
  await key("3");
  await key("Denominator");
  await key("4");
  await until(async () => (await O.locator(".f-box.frac .f-fc").allTextContents()).join(" ") === "1 3 4", "1 3/4 in its cells");
  await shot(O, "fam52-preview-fraction");
  await O.locator(".f-qchip", { hasText: "54" }).first().click();
  await until(async () => (await O.locator(".f-box.frac .f-fc").count()) === 2, "Q54's numerator and denominator");
  for (const k of ["n", "(", "n", "+", "1", ")", "Denominator", "2"]) await key(k);
  await until(async () => (await O.locator(".f-box.frac .f-fc").allTextContents()).join(" ") === "n(n+1) 2", "n(n+1) over 2");
  const sent = await O.evaluate((u) => JSON.parse(localStorage.getItem(`aristora.family.look.draft.${u}.6`) ?? "{}"), u01);
  expect([sent[54]?.[0], sent[55]?.[0]]).toEqual(["n(n+1)/2", "1 3/4"]);
  await noSideScroll(O);

  // Back to the levels, then to the class system on Settings → Books.
  await O.getByRole("button", { name: "Back" }).first().click();
  await O.getByRole("button", { name: "Back to the class system" }).click();
  await visible(O.getByRole("button", { name: "Books", exact: true, pressed: true }));
  await O.context().close();

  // Nobody else: a teacher with Books has no Preview, and the address alone says no.
  const B = await open(backend, site.url, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.token", "books-teacher-token-preview-0123456789abcdefghij");
  });
  await B.getByRole("button", { name: "Settings" }).click();
  await B.getByRole("button", { name: "Books", exact: true }).click();
  await B.getByRole("button", { name: /^Grade 8\b/ }).click();
  await B.locator(".unit-list li", { hasText: "U01" }).getByRole("button").first().click();
  await visible(B.getByRole("button", { name: "See what the phone accepts" }));
  expect(await B.getByRole("link", { name: /^Preview on the phone/ }).count()).toBe(0);
  await B.goto(`${site.url}/f/#preview=${u01}`);
  await contains(B.locator(".f-look [role=alert]"), "Preview is for the owner only.");
  await B.context().close();
});

test("free marks: the owner gives a question's marks from his Preview; a student meets a gift and gets them; Correction too", async () => {
  // 5 Nov 2026, his ask: a question out of the syllabus stays in the printed book (its numbers stay) and everyone gets
  // its marks; his answers: the students who did its level already get them too, and Correction gives them in class.
  const before = problems.length;
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
  // Bilal's Level 1 was corrected in class before: Q3 lost its 2 marks.
  const items = Array.from({ length: 10 }, (_, i) => ({ q: i + 1, got: i + 1 === 3 ? 0 : 2 }));
  await t.mutation(api.workbook.correct, { ...as, studentId: bilal, unitId: u01, level: 1, items, by: "correction" });
  const code = "hana-free-marks-link-0123456789";
  await t.mutation(api.families.makeLink, { ...as, studentId: hana, codeHash: secretHash("family-link", code) });

  // The owner's Preview, Level 1, Q3: free marks for everyone (asked once more first).
  const O = await open(backend, `${site.url}/f/#preview=${u01}`, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await O.locator(".f-look-levels button", { hasText: "Level 1" }).first().click();
  await contains(O.locator(".f-qn"), "Q1");
  await O.locator(".f-qchip", { hasText: /^3$/ }).click();
  await contains(O.locator(".f-qn"), "Q3");
  await O.getByRole("button", { name: /Free marks for everyone/ }).click();
  await contains(O.locator(".f-freesw"), "also the ones who did this level already");
  await O.getByRole("button", { name: "Yes, free marks" }).click();
  await contains(O.locator(".f-toast"), "Q3: free marks for everyone (2). 1 student who did this level got them now.");
  await contains(O.locator(".f-free-h"), "இலவசப் புள்ளிகள்");
  await visible(O.getByRole("button", { name: "Take back the free marks" }));
  await visible(O.locator(".f-qchip.free", { hasText: /^3$/ }));
  await noSideScroll(O);
  await shot(O, "fam53-preview-free");
  await O.setViewportSize({ width: 320, height: 640 }); // the smallest phone: the switch fits
  await noSideScroll(O);
  await shot(O, "fam53b-preview-free-320");
  await O.setViewportSize({ width: 390, height: 844 });
  await O.getByRole("button", { name: "Back" }).first().click();
  await contains(O.locator(".f-look-levels button").first(), "1 free");
  await O.context().close();
  // Them too: Bilal's Level 1 has its 2 marks now, and Q3 is no longer Evaluation's.
  const bilalM = await t.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student_unit_stage", (q) => q.eq("studentId", bilal).eq("unitId", u01).eq("stage", "master")).first())!.m!);
  expect(bilalM.lv["1"].got).toBe(20);
  expect(bilalM.q["3"]).toMatchObject({ got: 2, lost: false });

  // Hana's Level 1: Q3 is a gift (no pad, no question to do), → goes on; Check gives her its marks.
  const F = await open(backend, `${site.url}/f/#join=${code}`);
  await F.getByRole("button", { name: "START" }).click();
  await stageNow(F, "Level 1");
  await F.locator(".f-lv.play").click();
  await contains(F.locator(".f-qn"), "Q1");
  await type(F, ["3"]);
  await type(F, ["6"]);
  await contains(F.locator(".f-qn"), "Q3");
  await contains(F.locator(".f-free"), "பாடத்திட்டத்தில் இல்லை");
  expect(await F.locator(".f-padkeys").count()).toBe(0);
  expect(await F.locator(".f-freesw").count()).toBe(0); // the owner's switch is never on a student's phone
  await noSideScroll(F);
  await shot(F, "fam54-free-card");
  await F.setViewportSize({ width: 320, height: 640 });
  await noSideScroll(F);
  await shot(F, "fam54b-free-card-320");
  await F.setViewportSize({ width: 360, height: 740 });
  await F.locator(".f-nextbar .f-key.next").click();
  await contains(F.locator(".f-qn"), "Q4");
  for (const a of [["1", "2"], ["1", "5"], ["1", "8"], ["7", "n", "-", "1"], ["2", "4"], ["9"], ["1", "0"], ["3", "0"]]) await type(F, a);
  await contains(F.locator(".f-review"), "இலவசப் புள்ளிகள் (+2 XP)");
  await F.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();
  await contains(F.locator(".f-big"), "/ 20");
  await contains(F.locator(".f-gain"), "+20 XP");
  await visible(F.locator(".f-rrow", { hasText: "Q3" }).locator(".f-rmarks i.g"));
  await contains(F.locator(".f-bq.free"), "இலவசப் புள்ளிகள்");
  await noSideScroll(F);
  await shot(F, "fam55-free-result");
  await F.context().close();

  // Correction: another free question (Q12, Level 2) is given already on Bilal's paper; she never marks it.
  await t.mutation(api.preview.setFree, { ...as, unitId: u01, q: 12, free: true });
  await t.mutation(api.students.setPresent, { ...as, id: bilal, present: true });
  const C = await open(backend, site.url, size(390, 844), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
    localStorage.setItem("aristora.grade.focus", "8");
  });
  await C.locator(".fc-nm", { hasText: "Bilal M" }).click();
  await visible(C.locator(".fc-sq.free", { hasText: "12" }));
  await until(async () => ((await C.locator(".fc-card").getAttribute("aria-label")) ?? "").startsWith("Question 11,"), "Q11 first");
  await C.locator(".fc-go").click(); // Q11 full marks: Q12 is given already, so Q13 is next
  await until(async () => ((await C.locator(".fc-card").getAttribute("aria-label")) ?? "").startsWith("Question 13,"), "Q13 after Q11");
  await C.waitForTimeout(800);
  await C.locator(".fc-sq.free", { hasText: "12" }).click();
  await contains(C.locator(".fc-freenote"), "out of the syllabus");
  await contains(C.locator(".fc-go"), "free");
  await noSideScroll(C);
  await shot(C, "fam56-correction-free");
  await C.setViewportSize({ width: 320, height: 640 });
  await noSideScroll(C);
  await shot(C, "fam56b-correction-free-320");
  await C.context().close();
  expect(problems.slice(before)).toEqual([]);
});

/** The top row holds every piece in one line: nothing past the screen's edge, no two pieces on top of each other. */
async function topRowFits(p: Page) {
  const r = await p.evaluate(() =>
    [...document.querySelectorAll(".f-main .f-toprow > *")].map((e) => {
      const b = e.getBoundingClientRect();
      return { l: b.left, r: b.right, w: b.width, cls: e.className };
    }),
  );
  const w = await p.evaluate(() => window.innerWidth);
  expect(r.length, "the top row is there").toBeGreaterThan(4);
  for (let i = 0; i < r.length; i++) {
    expect(r[i].r, `${r[i].cls} inside the screen`).toBeLessThanOrEqual(w - 4);
    if (i > 0 && r[i].w > 0 && r[i - 1].w > 0) expect(r[i].l, `${r[i].cls} after ${r[i - 1].cls}`).toBeGreaterThanOrEqual(r[i - 1].r - 0.5);
  }
  // His face is never squeezed away (the avatar at least).
  expect(r[0].w).toBeGreaterThanOrEqual(38);
}

test("the Shop: the owner's things with a photo; last week's pay; the coin on the top row; PAYDAY; buying, the gold card, Cancel; Coins back and Given; 320 px", async () => {
  const before = problems.length;
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
  // Eleven days in a row of class work, made-up marks: 1,240 XP ever (a long number for the top row), 840 of it last
  // week (7 days × 120), 400 before it, and today and this Monday with no marks (the flame: 11).
  const DAY = 86_400_000;
  const monday = slWeekStart(Date.now());
  await t.run(async (ctx) => {
    const lv: Record<string, { done: number; fixed: number; got: number; by: string }> = {};
    const day = (i: number) => monday - i * DAY + 10 * 3_600_000;
    const work: [number, number][] = [
      ...[1, 2, 3, 4, 5, 6, 7].map((i) => [day(i), 120] as [number, number]),
      [day(8), 100],
      [day(8) + 3_600_000, 100],
      [day(9), 200],
      [monday + 60_000, 0],
      [Date.now() - 60_000, 0],
    ];
    work.forEach(([when, got], i) => (lv[String(i + 1)] = { done: when, fixed: when + 30_000, got, by: "correction" }));
    const p = await ctx.db.query("progress").withIndex("by_student_unit_stage", (q) => q.eq("studentId", hana).eq("unitId", u01).eq("stage", "master")).first();
    if (p) await ctx.db.patch(p._id, { m: { q: {}, lv }, updatedAt: Date.now() });
    else await ctx.db.insert("progress", { studentId: hana, unitId: u01, stage: "master", marks: {}, m: { q: {}, lv }, startedAt: 0, updatedAt: Date.now() });
  });

  // The owner: Settings → Shop: a sticker with a photo (made small on the phone), an ice cream, chicken fries.
  const C = await open(backend, site.url, size(360, 780), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "focus");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await C.getByRole("button", { name: /Settings/ }).click();
  await C.locator(".seg").getByRole("button", { name: /^Shop/ }).click();
  await contains(C.locator(".settings-body.sh"), "Nothing yet");
  const png = await C.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 900;
    const g = c.getContext("2d")!;
    g.fillStyle = "#6C5CE7";
    g.fillRect(0, 0, 900, 900);
    g.fillStyle = "#ffc23d";
    g.beginPath();
    g.arc(450, 450, 300, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(360, 400, 70, 0, Math.PI * 2);
    g.arc(540, 400, 70, 0, Math.PI * 2);
    g.fill();
    return c.toDataURL("image/png").split(",")[1];
  });
  const addThing = async (name: string, price: string, many: string, shelf: RegExp, photo = false) => {
    await C.getByRole("button", { name: "+ Add a thing" }).click();
    const S = C.locator(".sh-sheet");
    if (photo) {
      await S.getByLabel("Photo").setInputFiles({ name: "sticker.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
      await visible(S.locator(".sh-pic.big img"));
    }
    await S.getByLabel("Name").fill(name);
    await S.getByLabel("Price (coins)").fill(price);
    await S.getByLabel("How many").fill(many);
    await S.getByRole("button", { name: shelf }).click();
    if (photo) await shot(C, "shop01-settings-add");
    await S.getByRole("button", { name: "Add to the Shop" }).click();
    await contains(C.locator(".toast").last(), "saved");
  };
  await addThing("🦉 Owl sticker", "20", "30", /Owl things/, true);
  await addThing("🍦 Ice cream", "150", "", /Treats/);
  await addThing("🍗 Chicken fries", "450", "", /Treats/);
  await contains(C.locator(".sh-list").first(), "🦉 Owl sticker");
  await visible(C.locator(".sh-list .sh-pic img"));
  await contains(C.locator(".sh-list").nth(1), "no end");
  await noSideScroll(C);
  await shot(C, "shop02-settings-shop");

  // The Shop came: the fill starts the first pay (last week's XP only: 840 → 168 coins).
  await t.mutation(internal.race.fill, {});
  await t.mutation(internal.coins.payday, {});

  // Hana's phone: PAYDAY on Home, her coins on the top row (every piece fits), the Shop.
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level");
  await contains(P.locator(".f-payc"), "+168");
  await contains(P.locator(".f-pill.coin"), "168");
  await contains(P.locator(".f-pill.gem"), "1,240");
  await topRowFits(P);
  await noSideScroll(P);
  await shot(P, "shop03-home-payday");
  await P.locator(".f-payc").getByRole("button", { name: "Shop" }).click();
  await contains(P.locator(".f-shop .f-kicker"), "SHOP");
  await contains(P.locator(".f-shop-n"), "168");
  await contains(P.locator(".f-shop-hi"), "XP = உன் rank");
  await visible(P.locator(".f-shi", { hasText: "Owl sticker" }).locator("img"));
  await contains(P.locator(".f-shi.can").first(), "Owl sticker");
  await visible(P.locator(".f-shi", { hasText: "Chicken fries" }).locator(".f-shbar"));
  await contains(P.locator(".f-shlines"), "PAYDAY");
  await noSideScroll(P);
  await shot(P, "shop04-shop");
  await P.getByRole("button", { name: "OK!" }).click();
  await until(async () => (await P.locator(".f-shop-hi").count()) === 0, "the owl's line closes for good");
  // Chicken fries: not enough coins yet.
  await P.locator(".f-shi", { hasText: "Chicken fries" }).click();
  await contains(P.locator(".f-buy"), "இன்னும் 282");
  expect(await P.locator(".f-buy").getByRole("button", { name: /282 more/ }).isDisabled()).toBe(true);
  await shot(P, "shop05-short");
  await P.locator(".f-buy").getByRole("button", { name: "Close" }).click();
  // The ice cream: 168 → 18.
  await P.locator(".f-shi", { hasText: "Ice cream" }).click();
  await contains(P.locator(".f-buy"), "18");
  await shot(P, "shop06-buy-sheet");
  await P.locator(".f-buy").getByRole("button", { name: /Buy · 150/ }).click();
  await contains(P.locator(".f-toast"), "வாங்கினாய்");
  await contains(P.locator(".f-shop-n"), "18");
  await contains(P.locator(".f-shop-orders"), "🍦 Ice cream");
  await noSideScroll(P);
  await shot(P, "shop07-bought");
  // Home: his gold card; Cancel asks once more, then the coins come back.
  await P.getByRole("button", { name: "Back" }).click();
  await contains(P.locator(".f-giftc.bought"), "நீ வாங்கியது");
  await contains(P.locator(".f-pill.coin"), "18");
  expect(await P.locator(".f-payc").count()).toBe(0); // he opened the Shop: PAYDAY is seen
  await shot(P, "shop08-home-card");
  await P.locator(".f-giftc.bought").getByRole("button", { name: "Cancel" }).click();
  await P.locator(".f-giftc.bought").getByRole("button", { name: /Coins back\? Tap again/ }).click();
  await contains(P.locator(".f-toast"), "150 coins");
  await until(async () => (await P.locator(".f-giftc.bought").count()) === 0, "the card goes");
  await contains(P.locator(".f-pill.coin"), "168");
  // The sticker this time (from the top row's coin).
  await P.locator(".f-pill.coin").click();
  await P.locator(".f-shi", { hasText: "Owl sticker" }).click();
  await P.locator(".f-buy").getByRole("button", { name: /Buy · 20/ }).click();
  await contains(P.locator(".f-shop-n"), "148");

  // The owner: Race → Gifts to give: what to buy, Coins back (asks once more), then Given.
  await C.locator(".seg").getByRole("button", { name: /^Race/ }).click();
  await contains(C.locator(".sh-buy"), "🦉 Owl sticker × 1");
  await contains(C.locator(".rc-gifts li").first(), "bought in the Shop · 20 coins");
  await noSideScroll(C);
  await shot(C, "shop09-gifts-to-give");
  await C.locator(".rc-gifts li").first().getByRole("button", { name: "Coins back" }).click();
  await C.locator(".rc-gifts li").first().getByRole("button", { name: "Sure?" }).click();
  await contains(C.locator(".toast").last(), "20 coins back");
  await until(async () => (await C.locator(".rc-box > .rc-gifts > li").count()) === 0, "the card goes");
  await P.getByRole("button", { name: "Back" }).click();
  await P.reload();
  await contains(P.locator(".f-pill.coin"), "168");
  await P.locator(".f-pill.coin").click();
  await contains(P.locator(".f-shlines"), "Coins back");
  await P.locator(".f-shi", { hasText: "Owl sticker" }).click();
  await P.locator(".f-buy").getByRole("button", { name: /Buy · 20/ }).click();
  await contains(P.locator(".f-shop-n"), "148");
  await backend.push();
  await C.locator(".rc-gifts li", { hasText: "Hana K" }).getByRole("button", { name: "Given" }).click();
  await contains(C.locator(".toast").last(), "given");
  await P.getByRole("button", { name: "Back" }).click();
  await P.reload();
  await goalIs(P, "Level");
  expect(await P.locator(".f-giftc.bought").count()).toBe(0);
  // Settings → Shop: the month's coins, the sticker one less in stock.
  await C.locator(".seg").getByRole("button", { name: /^Shop/ }).click();
  await contains(C.locator(".sh-nums"), "168");
  await contains(C.locator(".sh-list").first(), "29 left");

  // The smallest phone: the top row in one line, the Shop.
  const S = await open(backend, `${site.url}/f/`, size(320, 640));
  await S.getByLabel(/Index/).fill("1001");
  await S.getByLabel("Code").fill("4719");
  await S.getByRole("button", { name: "Sign in" }).click();
  await goalIs(S, "Level");
  await contains(S.locator(".f-pill.coin"), "148");
  await topRowFits(S);
  await noSideScroll(S);
  await shot(S, "shop10-home-320");
  await tabTo(S, /Race/);
  await visible(S.locator(".f-main .f-toprow"));
  await topRowFits(S);
  await S.locator(".f-pill.coin").click();
  await contains(S.locator(".f-shop-n"), "148");
  await noSideScroll(S);
  await shot(S, "shop11-shop-320");
  // A 393 px phone (a Redmi Note): every piece fits; his face, not his name (Home greets him by name).
  const R = await open(backend, `${site.url}/f/`, size(393, 820));
  await R.getByLabel(/Index/).fill("1001");
  await R.getByLabel("Code").fill("4719");
  await R.getByRole("button", { name: "Sign in" }).click();
  await goalIs(R, "Level");
  await contains(R.locator(".f-pill.coin"), "148");
  await topRowFits(R);
  expect(await R.locator(".f-main .f-toprow .f-name").isVisible()).toBe(false);
  await contains(R.locator(".f-greet"), "Hana");
  await shot(R, "shop12-home-393");
  for (const p of [P, S, C, R]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});

test("online and studying: the green dot and the pencil, Studying now and Online, a classmate's state, his study bars and day totals; his own day with its times; the owner's switch", async () => {
  const before = problems.length;
  const backend = makeBackend(modules);
  const t = backend.t;
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  const as = { token: OWNER_TOKEN };
  await t.mutation(api.setup.ensure, as);
  const u08 = await t.run(async (ctx) => (await ctx.db.query("units").withIndex("by_key", (q) => q.eq("key", "G7-U08")).first())!._id);
  const add = async (name: string) => await t.mutation(api.students.add, { ...as, name, grade: 7, term: 1, stage: "master", unitId: u08 });
  const hana = await add("Hana K");
  const bilal = await add("Bilal M");
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  // Bilal's stays (made up): in the app now (a Level inside it), earlier, and on days before.
  const now = Date.now();
  const M = 60_000;
  await t.run(async (ctx) => {
    const stay = async (from: number, min: number, lv: number, live = false) =>
      await ctx.db.insert("appTime", {
        sid: bilal,
        day: slDayNo(from),
        from,
        to: live ? now - 20_000 : from + (min + 3) * M,
        ms: min * M,
        lv: lv * M,
        ...(live ? { inLv: true, st: 8 } : { bye: true }),
      });
    await stay(now - 42 * M, 40, 25, true);
    for (let d = 1; d <= 12; d++) await stay(now - d * 86_400_000 - 60 * M, 20 + ((d * 37) % 70), (d * 13) % 30);
    await stay(now - 2 * 86_400_000 - 300 * M, 35, 10);
  });

  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await goalIs(P, "Level");
  await tabTo(P, /Race/);
  // Studying now: Bilal inside a Level of Stage 8 (the pencil); Online: Hana (this phone) on the Race tab.
  await contains(P.locator(".f-onl"), "Studying now");
  await contains(P.locator(".f-onl"), "Stage 8");
  await contains(P.locator(".f-onl"), "Online");
  await visible(P.locator(".f-onl .f-on.lv"));
  await noSideScroll(P);
  await P.locator(".f-onl").scrollIntoViewIfNeeded();
  await shot(P, "online01-race");
  // Bilal's profile: the pencil on his photo, "Studying · Stage 8"; his study bars (Week and Month, no Day for a classmate).
  await P.locator(".f-onl-c").filter({ hasText: "Bilal" }).click();
  await contains(P.locator(".f-mate .f-me-name"), "Bilal M");
  await contains(P.locator(".f-mate .f-seen.lv"), "Studying · Stage 8");
  await visible(P.locator(".f-mate .f-me-pic .f-on.lv"));
  await shot(P, "online02-mate-top");
  await P.locator(".f-usage").scrollIntoViewIfNeeded();
  await contains(P.locator(".f-usage h2"), "Study time");
  expect(await P.locator(".f-utabs button").count()).toBe(2);
  await P.locator(".f-utabs").getByRole("button", { name: "Week" }).click();
  await visible(P.locator(".f-usage .f-ubar.hot"));
  await noSideScroll(P);
  await shot(P, "online03-week");
  await P.locator(".f-utabs").getByRole("button", { name: "Month" }).click();
  expect(await P.locator(".f-usage .f-ubar").count()).toBe(30);
  await shot(P, "online04-month");
  // His bar: that day's study and app time, never the times he came and went.
  await P.locator(".f-usage .f-ubar.hot").click();
  await contains(P.locator(".f-usheet .f-ustats"), "Studied");
  await contains(P.locator(".f-usheet .f-ustats .lv"), "25 m");
  await contains(P.locator(".f-usheet"), "🔒");
  expect(await P.locator(".f-ustays").count()).toBe(0);
  await shot(P, "online05-mate-day");
  await P.getByRole("button", { name: "Close" }).click();
  // His own Me: Day / Week / Month; today's bar = his own times.
  await P.getByRole("button", { name: "Back" }).click();
  await tabTo(P, /Me/);
  await P.locator(".f-usage").scrollIntoViewIfNeeded();
  await P.locator(".f-utabs").getByRole("button", { name: "Day" }).click();
  await until(async () => (await P.locator(".f-usage .f-ubar").count()) === 24, "24 hours");
  await shot(P, "online06-me-day");
  await P.locator(".f-usage .f-ubar").first().click();
  await visible(P.locator(".f-ustays li"));
  await contains(P.locator(".f-ustays li.on"), "now");
  await noSideScroll(P);
  await shot(P, "online07-me-sheet");
  await P.getByRole("button", { name: "Close" }).click();
  // The owner's switch off: no last seen, no classmate's bars; his own stays.
  await t.mutation(api.race.setSeen, { ...as, on: false });
  await tabTo(P, /Race/);
  await P.locator(".f-brow, .f-pod, .f-nyc").filter({ hasText: "Bilal" }).first().click();
  await contains(P.locator(".f-mate .f-me-name"), "Bilal M");
  await visible(P.locator(".f-mate .f-heatbox"));
  expect(await P.locator(".f-mate .f-seen, .f-mate .f-usage").count()).toBe(0);
  await P.getByRole("button", { name: "Back" }).click();
  await tabTo(P, /Me/);
  await visible(P.locator(".f-usage"));
  // A 320 px phone: the sheet and the bars fit.
  await t.mutation(api.race.setSeen, { ...as, on: true });
  const S = await open(backend, `${site.url}/f/`, size(320, 640));
  await S.getByLabel(/Index/).fill("1001");
  await S.getByLabel("Code").fill("4719");
  await S.getByRole("button", { name: "Sign in" }).click();
  await goalIs(S, "Level");
  await tabTo(S, /Race/);
  await S.locator(".f-onl-c").filter({ hasText: "Bilal" }).click();
  await S.locator(".f-utabs").getByRole("button", { name: "Week" }).click();
  await S.locator(".f-usage").scrollIntoViewIfNeeded();
  await noSideScroll(S);
  await shot(S, "online08-week-320");
  await S.locator(".f-usage .f-ubar.hot").click();
  await contains(S.locator(".f-usheet"), "Studied");
  await noSideScroll(S);
  await shot(S, "online09-sheet-320");
  for (const p of [P, S]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});

test("Explain online: the pill on a wrong question after Check; her photo and a teacher; the thread with what she typed; the teacher's voice note and ⋮ Explained; the next student joins; a name hidden; Consultation's icon", async () => {
  // 12 Nov 2026, his voice note: "I don't want to explain everything on my classroom ... explaining in the voice note
  // like a WhatsApp ... small tiny pill like explain online ... that will open the new thread in the community". His
  // answers: the explanation stays on its question (the next student joins and sees everything; a teacher can hide a
  // name or a photo), she picks the teacher, no limit a day, and only Explained makes it explained. Made-up students.
  const before = problems.length;
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
    // Q8 has two sub-questions here (a mark each): the thread shows each one's answer under it.
    key: fakeKey().map((k) => (k.q === 8 ? { q: 8, parts: [{ p: "i", a: "24", m: 1 }, { p: "ii", a: "48", m: 1 }] } : k)),
  });
  // The book's questions as printed (made-up words): Q8 with its (i) and (ii).
  await t.run(async (ctx) => {
    const q8 =
      '<div class="qq"><span class="qn">8</span><div class="qt">A made-up question with two parts</div>' +
      '<div class="rp"><span class="rl">(i)</span><span>A made-up first part</span></div>' +
      '<div class="rp"><span class="rl">(ii)</span><span>A made-up second part</span></div></div>';
    for (let q = 1; q <= 10; q++) await ctx.db.insert("questions", { unitId: u01, stage: "master", q, html: q === 8 ? q8 : `<div class="qq"><span class="qn">${q}</span><div class="qt">A made-up question number ${q}</div></div>` });
    await ctx.db.insert("bookCss", { unitId: u01, stage: "master", css: ".qn { font-weight: 700; } .rp { display: flex; }", updatedAt: 0 });
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  const mira = await t.mutation(api.students.add, { ...as, name: "Mira J", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  const NILA = "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx";
  await addPerson(t, { name: "Nila", token: NILA, tabs: ["evaluation"] });
  const MIRA = "family-phone-mira-help-".padEnd(48, "x");
  await t.mutation(api.families.makeLink, { ...as, studentId: mira, codeHash: secretHash("family-link", "mira-help-family-link-0123456789") });
  await t.mutation(api.family.join, { code: "mira-help-family-link-0123456789", token: MIRA, label: "Android" });
  await t.mutation(api.us.setCfg, { ...as, open: true });
  const paper = { name: "paper.png", mimeType: "image/png", buffer: Buffer.from(PAPER_PNG, "base64") };
  const askOf = async (sid: typeof hana, q: number) =>
    await t.run(async (ctx) => await ctx.db.query("helpAsks").withIndex("by_sid", (x) => x.eq("sid", sid).eq("unitId", u01).eq("q", q)).first());
  const mq = async (sid: typeof hana, q: number) =>
    (await t.run(async (ctx) => (await ctx.db.query("progress").withIndex("by_student", (x) => x.eq("studentId", sid)).first())?.m))?.q[String(q)];

  // Hana's phone: Level 1 on the pad, Q8 wrong; Check.
  const P = await open(backend, `${site.url}/f/`, size(360, 780));
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await until(async () => (await P.locator(".f-tabs .f-tab").count()) === 5, "the Us tab");
  await stageNow(P, "Level 1");
  await P.locator(".f-lv.play").click();
  await contains(P.locator(".f-qn"), "Q1");
  for (const a of [["3"], ["6"], ["1", "0"], ["1", "2"], ["1", "5"], ["1", "8"], ["n", "+", "6", "n", "-", "1"], ["9", "9"], ["4", "8"], ["1", "0"], ["9"], ["3", "0"]]) await type(P, a);
  await P.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();
  await contains(P.locator(".f-big"), "19");

  // The pill on Q8 (the only one with marks lost: its (i)): her photo first, then the teacher; Send waits for both.
  const q8 = P.locator(".f-bq", { has: P.locator(".f-rq", { hasText: "Q8" }) });
  await contains(q8.locator(".f-hpill"), "Explain online");
  expect(await P.locator(".f-hpill").count()).toBe(1);
  await noSideScroll(P);
  await shot(P, "help01-pill");
  await q8.locator(".f-hpill").click();
  const sheet = P.locator(".h-ask");
  await visible(sheet.locator(".h-tch"));
  expect(await sheet.locator(".h-tch b").allInnerTexts()).toEqual(["Nila", "Owner"]);
  const go = sheet.getByRole("button", { name: "அனுப்பு" });
  expect(await go.isDisabled()).toBe(true);
  await sheet.locator(".f-file").setInputFiles(paper);
  await P.locator(".f-cut").getByRole("button", { name: "Use this photo" }).click();
  await visible(sheet.locator(".f-thumb"));
  expect(await go.isDisabled()).toBe(true); // no teacher yet
  await sheet.getByRole("radio", { name: /Nila/ }).click();
  await contains(sheet.locator(".h-told"), "மற்ற மாணவர்களும்");
  await noSideScroll(P);
  await shot(P, "help02-ask-sheet");
  await go.click();

  // Her thread: Q8 on top, what she typed in rose, waiting on Nila; her photo as its first message.
  await contains(P.locator(".h-top-h"), "Q8");
  await contains(P.locator(".h-top-h"), "Stage 1 · Level 1");
  // The question as printed, open, nearly as wide as the phone; her answer under each sub-question: (i) wrong in rose,
  // (ii) right in blue. Never the key on her phone.
  const yOf = async (l: L) => (await l.first().boundingBox())!.y;
  await contains(P.locator(".h-paper .h-a.no"), "99");
  await contains(P.locator(".h-paper .h-a.ok"), "48");
  const y = [await yOf(P.locator(".h-paper .rl", { hasText: "(i)" })), await yOf(P.locator(".h-a.no")), await yOf(P.locator(".h-paper .rl", { hasText: "(ii)" })), await yOf(P.locator(".h-a.ok"))];
  expect([...y].sort((a, b) => a - b)).toEqual(y);
  expect(await P.locator(".h-k").count()).toBe(0);
  const paperBox = (await P.locator(".h-paper").boundingBox())!;
  expect(paperBox.x).toBeLessThanOrEqual(10);
  expect(paperBox.width).toBeGreaterThanOrEqual(340);
  await contains(P.locator(".h-wait"), "Nila ஆசிரியர்");
  await visible(P.locator(".f-msg.mine .f-pics img, .f-msg.mine img").first());
  expect(await askOf(hana, 8)).toMatchObject({ st: "open", ph: true, from: "s" });
  await noSideScroll(P);
  await shot(P, "help03-thread-student");

  // Nila's class app: the Us tab's number; Us → Chats → Online explanations → Mine: Hana · Q8.
  const C = await open(backend, site.url, size(390, 820), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "evaluation");
    localStorage.setItem("aristora.token", "nila-phone-token-0123456789abcdefghijklmnopqrstuvwx");
  });
  await contains(C.locator(".tabs .tab.us .tab-badge"), "1");
  await C.locator(".tabs .tab.us").click();
  const U = C.frameLocator("iframe.us-frame");
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await U.locator(".f-us-guide").getByRole("button", { name: b }).click();
  await U.locator(".f-us-seg").getByRole("tab", { name: /Chats/ }).click();
  await contains(U.locator(".h-list-h"), "Online explanations");
  await contains(U.locator(".h-chips button.on"), "Mine 1");
  const line = U.locator(".h-row", { hasText: "Hana K · Q8" });
  await contains(line, "Stage 1 · Level 1");
  await shot(C, "help04-teacher-queue");
  await line.click();
  // The thread for her: the key on Question, what Hana typed, her photo; nothing explained yet.
  await contains(U.locator(".h-paper .h-a.no"), "99");
  await contains(U.locator(".h-paper .h-a.ok"), "48");
  expect((await U.locator(".h-paper .h-k").allInnerTexts()).map((x) => x.replace(/\s+/g, " ").trim())).toEqual(["Key 24", "Key 48"]);
  await noSideScroll(C);
  await shot(C, "help04b-teacher-card");
  await contains(U.locator(".h-wait"), "Waiting on you");
  // Her voice note: Record (the fake microphone), the time, Stop, listen, Send.
  await U.locator(".h-mic").click();
  await visible(U.locator(".h-rec.rec .h-dot"));
  await C.waitForTimeout(1600);
  await U.locator(".h-rec").getByRole("button", { name: "Stop recording" }).click();
  await visible(U.locator(".h-rec.ready audio"));
  await shot(C, "help05-voice-ready");
  await U.locator(".h-rec").getByRole("button", { name: /^Send/ }).click();
  await visible(U.locator(".f-msg.mine .h-voice"));
  const voice = await t.run(async (ctx) => (await ctx.db.query("usChat").collect()).find((c) => c.au));
  expect(voice!.au!.d).toBeGreaterThanOrEqual(1);
  expect((await t.run(async (ctx) => await ctx.db.system.get(voice!.au!.f)))!.contentType).toMatch(/^audio\//);
  await U.locator(".f-tb-in").pressSequentially("முதலில் 8 ஐ 3 ஆல் பெருக்கு.");
  await U.locator(".f-tb").getByRole("button", { name: "Send" }).click();
  await contains(U.locator(".f-msg.mine").last(), "8 ஐ 3 ஆல்");
  // A voice note alone explains nothing (his rule).
  expect((await mq(hana, 8))?.x).toBeUndefined();
  await noSideScroll(C);
  await shot(C, "help06-thread-teacher");

  // Hana's open thread shows it in seconds; ▶ plays it.
  await until(async () => (await P.locator(".f-msg:not(.mine) .h-voice").count()) === 1, "her voice note on Hana's phone", 20_000);
  await P.locator(".h-voice .h-play").click();
  await until(async () => (await P.locator(".h-voice.on").count()) === 1 || (await P.locator(".h-voice small").innerText()) !== "0:00", "the voice note playing");
  expect(await P.locator(".h-bad").count()).toBe(0);
  await shot(P, "help07-voice-student");

  // Hana answers with a voice note of her own (his ask, 12 Nov 2026: students too; 1 minute at most).
  await P.locator(".h-mic").click();
  await visible(P.locator(".h-rec.rec .h-dot"));
  await contains(P.locator(".h-rec.rec small"), "1:00");
  await P.waitForTimeout(1300);
  await P.locator(".h-rec").getByRole("button", { name: "Stop recording" }).click();
  await P.locator(".h-rec").getByRole("button", { name: /^Send/ }).click();
  await visible(P.locator(".f-msg.mine .h-voice"));
  await until(async () => (await t.run(async (ctx) => (await ctx.db.query("usChat").collect()).filter((c) => c.au).length)) === 2, "her voice note on the server");
  await noSideScroll(P);
  await shot(P, "help07b-voice-from-student");

  // ⋮ → Explained (two taps: never by mistake): explained in class too, the thread shuts for her.
  await U.locator(".h-more").click();
  const menu = U.locator(".h-menu");
  await contains(menu, "1 waiting: Hana K");
  await shot(C, "help08-menu");
  await menu.getByRole("button", { name: /Explained/ }).click();
  expect((await askOf(hana, 8))!.st).toBe("open");
  await menu.getByRole("button", { name: /Tap again/ }).click();
  await until(async () => (await askOf(hana, 8))!.st === "done", "Hana's question explained");
  expect((await mq(hana, 8))?.x).toBeDefined();
  await contains(U.locator(".h-wait"), "Closed");
  await until(async () => (await P.locator(".c-cant").count()) === 1, "her thread shut on her phone", 20_000);
  await contains(P.locator(".c-cant"), "விளக்கம் முடிந்தது");
  // Back: the Level's book she came from; the pill says how it stands.
  await P.getByRole("button", { name: "Back" }).click();
  await visible(P.locator(".f-bookscr"));
  await contains(P.locator(".f-bq", { has: P.locator(".f-rq", { hasText: "Q8" }) }).locator(".f-hpill"), "விளக்கப்பட்டது");
  await shot(P, "help09-pill-done");

  // Mira got Q8 wrong too (her phone, through the server): the same thread, with everything in it; not explained yet.
  await t.mutation(api.family.check, { token: MIRA, unitId: u01, n: 1, typed: [{ q: 1, a: ["3"] }, { q: 8, a: ["41", "48"] }] });
  const tid = (await askOf(hana, 8))!.rid;
  expect((await t.query(api.help.start, { token: MIRA, unitId: u01, q: 8 })).thread).toMatchObject({ id: tid, tname: "Nila", n: 1 });
  const png = async () => await t.run(async (ctx) => await ctx.storage.store(new Blob([Buffer.from(PAPER_PNG, "base64")], { type: "image/png" })));
  expect((await t.mutation(api.help.ask, { token: MIRA, unitId: u01, q: 8, ph: [{ s: await png(), b: await png(), w: 96, h: 72 }] })).id).toBe(tid);
  const hers = await t.query(api.chat.room, { token: MIRA, id: tid });
  expect(hers.msgs.map((m) => m.n)).toEqual(["Hana K", "Nila", "Nila", "Hana K", "Mira J"]);
  expect(hers.msgs[1].au).toBeDefined();
  expect((await mq(mira, 8))?.x).toBeUndefined();
  // Nila's open thread: Mira waits; ⋮ on Hana → her name hidden from Mira's phone.
  await until(async () => (await U.locator(".h-asks li").count()) === 2, "Mira in the thread", 20_000);
  await contains(U.locator(".h-asks li.open"), "Mira J");
  // The question shows the one still waiting (Mira: 41); a tap on Hana's name shows hers (99).
  await contains(U.locator(".h-whose"), "Mira J's answers");
  await contains(U.locator(".h-paper .h-a.no"), "41");
  await U.locator(".h-asks li", { hasText: "Hana K" }).locator(".h-who").click();
  await contains(U.locator(".h-whose"), "Hana K's answers");
  await contains(U.locator(".h-paper .h-a.no"), "99");
  await shot(C, "help09b-teacher-two");
  await U.locator(".h-asks li", { hasText: "Hana K" }).locator(".h-dots").click();
  await U.locator(".h-menu").getByRole("button", { name: /Hide his name/ }).click();
  await until(async () => (await t.query(api.chat.room, { token: MIRA, id: tid })).msgs[0].n === "மாணவர்", "Hana's name hidden from Mira");
  await contains(U.locator(".h-asks li", { hasText: "Hana K" }).locator(".h-st"), "🙈 name");
  await noSideScroll(C);
  await shot(C, "help10-two-students");

  // Consultation's icon (the owner's phone): Mira's Q8 has its thread (filled); her Q2 gets one, she is asked for a photo.
  const O = await open(backend, site.url, size(390, 820), () => {
    if (sessionStorage.getItem("t")) return;
    sessionStorage.setItem("t", "1");
    localStorage.setItem("aristora.role", "evaluation");
    localStorage.setItem("aristora.token", "owner-phone-token-0123456789abcdefghijklmnopqrstuv");
  });
  await t.mutation(api.students.setPresent, { ...as, id: mira, present: true });
  await O.getByRole("button", { name: "Consultation" }).click();
  await O.locator(".tp-kinds").first().locator(".tp-kind", { hasText: "Master" }).click();
  await O.locator(".cx-nm", { hasText: "Mira" }).click();
  await visible(O.locator(".evx-card .fc-onl"));
  await shot(O, "help12-consult-card");
  await O.locator(".evx-card .fc-onl").click();
  await contains(O.locator(".toast"), "Thread open for Mira");
  const qNow = Number((await O.locator(".evx-card .fc-qn").innerText()).replace(/\D/g, ""));
  expect(await askOf(mira, qNow)).toMatchObject({ st: "open", from: "t", ph: false });
  await until(async () => (await O.locator(".evx-card .fc-onl.on").count()) === 1, "the icon filled");
  expect((await t.query(api.help.mine, { token: MIRA })).find((l) => l.q === qNow)).toMatchObject({ ph: false, from: "t", tname: "Owner" });
  await noSideScroll(O);

  // The smallest phone: Hana's thread fits 320 px.
  await P.setViewportSize({ width: 320, height: 640 });
  await P.locator(".f-bq", { has: P.locator(".f-rq", { hasText: "Q8" }) }).locator(".f-hpill").click();
  await visible(P.locator(".h-top"));
  await noSideScroll(P);
  await shot(P, "help13-thread-320");
  // Her explanations sit on top of her Chats: this one, closed (Waiting 0 · All 1).
  for (const scr of [".f-bookscr", ".f-lv", ".f-tabs"]) {
    await P.getByRole("button", { name: "Back" }).first().click();
    await visible(P.locator(scr));
  }
  await tabTo(P, /^Us$/);
  for (const b of ["அடுத்து", "அடுத்து", "தொடங்கு!"]) await P.locator(".f-us-guide").getByRole("button", { name: b }).click();
  await P.locator(".f-us-seg").getByRole("tab", { name: /Chats/ }).click();
  await contains(P.locator(".h-list-h"), "Explain online");
  await contains(P.locator(".h-chips button.on"), "Waiting 0");
  await P.locator(".h-chips").getByRole("tab", { name: /All/ }).click();
  await contains(P.locator(".h-row"), "Q8");
  await contains(P.locator(".h-row"), "விளக்கப்பட்டது");
  await noSideScroll(P);
  await shot(P, "help14-my-list-320");
  for (const p of [P, C, O]) await p.context().close();
  expect(problems.slice(before)).toEqual([]);
});
