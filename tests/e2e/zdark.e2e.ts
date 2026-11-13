// TEMPORARY probe (deleted before any commit): Home, a Level and Me in light and dark, for his review.
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { outOf } from "../../convex/lib/book";
import { readWorkbookHtml } from "../../src/workbookFile";
import U01_BOOK from "../fixtures/workbook-g8-u01.html?raw";
import { addPerson, OWNER_TOKEN } from "../helpers";
import { makeBackend, playwright, serveDist } from "./harness";

type Page = import("playwright").Page;
type Browser = import("playwright").Browser;
const BOOK = readWorkbookHtml(U01_BOOK, "G8_U01_Workbook_source_v3.zip")[0];
const modules = import.meta.glob("../../convex/**/*.ts");
const SHOTS = process.env.SHOTS ?? resolve("test-results/shots");
const W = Number(process.env.W ?? 360);

function fakeKey() {
  const out: { q: number; a?: string; parts?: { p: string; a: string; m: number }[] }[] = [];
  for (let q = 1; q <= 52; q++) {
    const d = q % 10;
    const a = d === 0 && q > 10 ? "சிறப்புப் பெயர்" : d === 9 ? `${q}, ${q + 1}` : d === 7 ? `${q}n − 1` : d === 3 ? `${q * 3} (${q * 3 + 1} உம் ஏற்கலாம்)` : String(q * 3);
    out.push({ q, a });
  }
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `work = **${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}

let browser: Browser;
let site: { url: string; close: () => Promise<void> };
beforeAll(async () => {
  await mkdir(SHOTS, { recursive: true });
  site = await serveDist(resolve("dist"));
  browser = await playwright.chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await site?.close();
});

/** One screen, light then dark (the same pixels of the same moment: only the look changes). */
async function both(p: Page, name: string, full = false) {
  await p.waitForTimeout(900);
  for (const mode of ["light", "dark"] as const) {
    await p.evaluate((m) => {
      if (m === "dark") document.documentElement.dataset.theme = "dark";
      else delete document.documentElement.dataset.theme;
    }, mode);
    await p.waitForTimeout(250);
    await p.screenshot({ path: join(SHOTS, `${name}-${mode}.png`), fullPage: full });
  }
  // The audit, in dark: light surfaces left behind, light stops in gradients, words too faint on what is under them.
  const found = await p.evaluate(() => {
    const lum = (r: number, g: number, b: number) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const rgb = (c: string) => {
      const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").trim().split(/\s+/).join(".")}`;
    const out = new Set<string>();
    const all = [...document.querySelectorAll<HTMLElement>("body *")];
    const bgOf = (el: Element | null): { l: number; grad: boolean; who: string } => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage !== "none") return { l: -1, grad: true, who: name(e) };
        const c = rgb(cs.backgroundColor);
        if (c && c.a > 0.6) return { l: lum(c.r, c.g, c.b), grad: false, who: name(e) };
      }
      return { l: 0, grad: false, who: "page" };
    };
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
      const c = rgb(cs.backgroundColor);
      if (c && c.a > 0.3 && lum(c.r, c.g, c.b) > 0.5 && r.width * r.height > 300) out.add(`LIGHT ${name(el)} ${cs.backgroundColor} ${Math.round(r.width)}x${Math.round(r.height)}`);
      if (cs.backgroundImage.includes("gradient")) {
        const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgb(m[0])!).filter((x) => x.a > 0.3 && lum(x.r, x.g, x.b) > 0.5);
        if (stops.length && r.width * r.height > 300) out.add(`GRAD ${name(el)} ${cs.backgroundImage.slice(0, 110)}`);
      }
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 0);
      if (hasText) {
        const t = rgb(cs.color);
        const b = bgOf(el);
        if (t && !b.grad) {
          const lt = lum(t.r, t.g, t.b);
          const cr = (Math.max(lt, b.l) + 0.05) / (Math.min(lt, b.l) + 0.05);
          if (cr < 3.2) out.add(`FAINT ${name(el)} ${cs.color} on ${b.who} (${cr.toFixed(1)}) "${el.textContent!.trim().slice(0, 16)}"`);
        }
      }
    }
    return [...out];
  });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SHOTS, `${name}.audit.txt`), found.join("\n"));
  if (process.env.STAY !== "dark") await p.evaluate(() => delete document.documentElement.dataset.theme);
}
async function type(p: Page, keys: string[]) {
  for (const k of keys) await p.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
  await p.locator(".f-padkeys .f-key.next").click();
}

test("zdark: Home, a Level and Me, light and dark", async () => {
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
  await t.run(async (ctx) => {
    for (let q = 1; q <= 10; q++) {
      await ctx.db.insert("questions", {
        unitId: u01,
        stage: "master",
        q,
        html:
          q === 1
            ? `<div class="pq"><span class="qn">1</span><div class="qt">A made-up question: complete the table for the pattern 3, 6, 9, …</div><table class="tb"><tr><th>n</th><td>1</td><td>2</td><td>3</td><td>4</td></tr><tr><th>term</th><td>3</td><td>6</td><td>9</td><td></td></tr></table><svg class="fig" viewBox="0 0 120 60" width="150"><rect x="6" y="14" width="46" height="34" fill="none" stroke="#000" stroke-width="1.4"/><circle cx="88" cy="31" r="18" fill="none" stroke="#000" stroke-width="1.4"/><text x="29" y="35" font-size="9" text-anchor="middle">A</text><text x="88" y="35" font-size="9" text-anchor="middle">B</text></svg></div>`
            : `<div class="pq"><span class="qn">${q}</span><div class="qt">A made-up question number ${q}: find the next term of 3, 6, 9, …</div></div>`,
      });
    }
    await ctx.db.insert("bookCss", {
      unitId: u01,
      stage: "master",
      css: ".qn { font-weight: 700; margin-right: 6px; } .qt { display: inline; } .tb { border-collapse: collapse; margin: 8px 0; } .tb th, .tb td { border: 1px solid #000; padding: 3px 9px; } .tb th { background: #eee; } .fig { display: block; margin: 6px 0; }",
      updatedAt: 0,
    });
    const book = (await ctx.db.query("books").withIndex("by_unit_stage", (x) => x.eq("unitId", u01).eq("stage", "master")).first())!;
    await ctx.db.patch(book._id, { qCount: 10 });
  });
  const hana = await t.mutation(api.students.add, { ...as, name: "Hana K", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.students.add, { ...as, name: "Bilal M", grade: 8, term: 1, stage: "master", unitId: u01 });
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  await t.mutation(api.families.setClassHours, { ...as, grade: 8, hours: Array.from({ length: 7 }, () => ({ from: 1, to: 1439 })) });

  const ctx = await browser.newContext({ viewport: { width: W, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await backend.attach(ctx);
  if (process.env.STAY === "dark") await ctx.addInitScript(() => localStorage.setItem("aristora.family.theme", "dark"));
  const P = await ctx.newPage();
  const errs: string[] = [];
  P.on("pageerror", (e) => errs.push(e.message));
  await P.goto(`${site.url}/f/`);
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await both(P, "00-signin");
  await P.getByRole("button", { name: "Sign in" }).click();
  await P.locator(".f-goal-t").first().waitFor();
  await both(P, "01-home-first", true);
  await P.locator(".f-tabs").getByRole("button", { name: /Learn/ }).click();
  await P.locator(".f-node.s-now").waitFor();
  await both(P, "02-map");
  await P.locator(".f-node.s-now").click();
  await P.locator(".f-lv.play").waitFor();
  await both(P, "03-stage");
  await P.locator(".f-lv.play").click();
  await P.locator(".f-qn").first().waitFor();
  await P.waitForTimeout(600);
  await both(P, "04-level-q1");
  await type(P, ["3"]);
  await type(P, ["6"]);
  await both(P, "05-level-q3");
  await type(P, ["1", "0"]);
  await type(P, ["1", "2"]);
  await type(P, ["1", "5"]);
  await type(P, ["1", "8"]);
  for (const k of ["n", "+", "6", "n", "-"]) await P.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
  await both(P, "06-level-npad");
  await type(P, ["1"]);
  await type(P, ["9", "9"]);
  await type(P, ["1", "0"]);
  await type(P, ["9"]);
  await type(P, ["3", "1"]);
  await P.locator(".f-review").waitFor();
  await both(P, "07-review", true);
  await P.locator(".f-review").getByRole("button", { name: "Check ✓" }).click();
  await P.locator(".f-gain").first().waitFor({ timeout: 20000 });
  await P.waitForTimeout(2500);
  await both(P, "08-result", true);
  await P.goto(`${site.url}/f/`);
  await P.locator(".f-tabs").first().waitFor();
  await P.locator(".f-tabs").getByRole("button", { name: /Home/ }).click();
  await P.locator(".f-goal-t").first().waitFor();
  await both(P, "09-home", true);
  await P.locator(".f-toprow .f-who").first().click();
  await P.locator(".f-set").first().waitFor();
  await P.waitForTimeout(1500);
  await both(P, "10-me", true);
  await both(P, "11-me-top");
  // The switch itself: Me → On this phone → Dark mode; it stays after the app is opened again; off = light again.
  const sw = P.getByRole("button", { name: "Dark mode" });
  await sw.scrollIntoViewIfNeeded();
  const state = async () => ({ theme: await P.evaluate(() => document.documentElement.dataset.theme ?? "light"), bar: await P.evaluate(() => document.querySelector('meta[name="theme-color"]')!.getAttribute("content")), pressed: await P.getByRole("button", { name: "Dark mode" }).getAttribute("aria-pressed").catch(() => "?") });
  const log: unknown[] = [await state()];
  await sw.click();
  await P.waitForTimeout(400);
  log.push(await state());
  await P.screenshot({ path: join(SHOTS, "12-me-switch-on.png") });
  await P.goto(`${site.url}/f/`);
  await P.locator(".f-tabs").first().waitFor();
  await P.waitForTimeout(600);
  log.push({ afterReopen: await P.evaluate(() => document.documentElement.dataset.theme ?? "light"), bar: await P.evaluate(() => document.querySelector('meta[name="theme-color"]')!.getAttribute("content")) });
  await P.screenshot({ path: join(SHOTS, "13-reopened.png") });
  await P.locator(".f-toprow .f-who").first().click();
  await P.getByRole("button", { name: "Dark mode" }).scrollIntoViewIfNeeded();
  await P.getByRole("button", { name: "Dark mode" }).click();
  await P.waitForTimeout(300);
  log.push(await state());
  // The phone's own dark setting changes nothing: a phone set to dark still opens the app light.
  const ctx2 = await browser.newContext({ viewport: { width: W, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: "dark" });
  await backend.attach(ctx2);
  const D = await ctx2.newPage();
  await D.goto(`${site.url}/f/`);
  await D.getByLabel(/Index/).waitFor();
  log.push({ phoneDark: await D.evaluate(() => ({ prefersDark: matchMedia("(prefers-color-scheme: dark)").matches, theme: document.documentElement.dataset.theme ?? "light", bg: getComputedStyle(document.body).backgroundColor, scheme: getComputedStyle(document.documentElement).colorScheme })) });
  await D.screenshot({ path: join(SHOTS, "14-phone-dark-signin.png") });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(join(SHOTS, "switch.json"), JSON.stringify(log, null, 1));
  if (errs.length) console.log("PAGE ERRORS", errs);
}, 180_000);
