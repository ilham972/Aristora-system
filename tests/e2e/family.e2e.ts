// The family app on simulated phones (app.aristora.org = /f/ here), against the real functions:
// a family link opens it; Level 1 and Level 2 are typed on the pads and checked once each; the reveal, XP, streak and
// this week's board; then Correction on the class phone: ⌂ on her name and level, Checked, and a level with a question
// the phone left to the corrector. Fake answers only (the repo is public); the book is the U01 skeleton.

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

  // The family link: hello, Start.
  const F = await open(backend, `${site.url}/f/index.html#join=${code}`);
  await contains(F.locator(".f-h1"), "Hana");
  await shot(F, "fam00-join");
  await F.getByRole("button", { name: "தொடங்கு" }).click();
  await contains(F.locator(".f-next"), "Level 1");
  await contains(F.locator(".f-world").first(), "World 1");
  expect(await F.evaluate(() => location.hash)).toBe(""); // the code leaves the address bar
  await noSideScroll(F);
  await shot(F, "fam01-home");

  // Level 1 on the pad: Q1–Q7 and Q9–Q10 right (Q3 with the answer also accepted, Q9 the other way round), Q8 wrong.
  await F.locator(".f-next").click();
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
  await contains(F.locator(".f-gain"), "🔥 1");
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
  await F.getByRole("button", { name: "Worlds" }).click();

  // Home: Levels 1 and 2 marked at home (⌂), Level 3 next; XP this week 36.
  await contains(F.locator(".f-next"), "Level 3");
  await contains(F.locator(".f-chip.xp"), "36");
  expect(await F.locator(".f-world").first().locator(".f-node.s-check").count()).toBe(2);
  await shot(F, "fam05-home-after");
  await F.locator(".f-chip.xp").click();
  await contains(F.locator(".f-brow.me"), "Hana K");
  await contains(F.locator(".f-brow.me"), "36");
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
  await contains(S.locator(".f-next"), "Level 3");
  await S.locator(".f-next").click();
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

  // The family app shows Level 1 as checked (done), Level 2 still ⌂.
  await F.reload();
  await contains(F.locator(".f-next"), "Level 3");
  expect(await F.locator(".f-world").first().locator(".f-node.s-check").count()).toBe(1);

  expect(problems).toEqual([]);
});
