// The unit's book by skill as a real PDF file (23 Nov 2026, the founder: "put the share button near the download
// button ... automatically go inside the WhatsApp ... the printing center"). A web page never gets the bytes of
// Chrome's "Save as PDF", and WhatsApp can only be handed a file, so this server makes the file: serverless Chrome
// (@sparticuz/chromium) opens this site's print page (dist/print.html), which lays the book out with the phone's own
// code (src/printEntry.ts → src/skillPrint.ts), and prints it to PDF, A4. The same pages the phone's print gives.
//
// The data comes from Convex with the caller's own sign-in (`skillBook.unit` and `skillBook.questions` check it: the
// owner or Books), so it can print nothing the caller couldn't read; nothing is kept. The page may load nothing but
// this site's print page, its script and its fonts.
//
//   POST /api/pdf  {"token","unitId","only"}  → application/pdf; X-Pages, X-Fonts (1 = the book's fonts came), X-Missing
//   GET  /api/pdf?health=1                    → {"ok":true,"chrome":"HeadlessChrome/…","ms":…}: Chrome starts and
//                                               prints a test page (no data); kept 10 minutes per warm server.

import chromium from "@sparticuz/chromium";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import puppeteer from "puppeteer-core";

/** The production backend (public: it is in the app's own script). ARISTORA_CONVEX_URL overrides it. */
const CONVEX_URL = process.env.ARISTORA_CONVEX_URL || "https://qualified-fish-602.convex.cloud";
/** The sites whose print page this server may open (the class app, and the run-throughs' own server). */
const SITES = /^(system\.aristora\.org|127\.0\.0\.1:\d{2,5}|localhost:\d{2,5})$/;

/** Chrome: the serverless build on Vercel; PDF_CHROME = a Chrome on this machine (the run-throughs). */
export async function launchChrome() {
  if (process.env.PDF_CHROME) return puppeteer.launch({ executablePath: process.env.PDF_CHROME, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: "shell" });
}

/**
 * The book's PDF. `load()` gives what the T page reads (`skillBook.unit`, `skillBook.questions`); `site` is where the
 * print page is ("https://system.aristora.org").
 */
export async function makePdf({ site, load, only = null, year = new Date().getFullYear(), launch = launchChrome }) {
  const { u, printed } = await load();
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (r) => {
      const url = r.url();
      if (url === `${site}/print.html` || url.startsWith(`${site}/assets/`)) void r.continue();
      else void r.abort();
    });
    await page.goto(`${site}/print.html`, { waitUntil: "load", timeout: 25000 });
    await page.waitForFunction(() => typeof window.aristoraBook === "function", { timeout: 15000 });
    const done = await page.evaluate((a) => window.aristoraBook(a), { u, css: printed.css, qs: printed.qs.map((x) => [x.q, x.html]), only, year });
    await page.emulateMediaType("print");
    const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true, timeout: 45000 }));
    return { pdf, ...done };
  } finally {
    await browser.close().catch(() => {});
  }
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function bodyOf(req) {
  if (req.body !== undefined) return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) throw new Error("too big");
  }
  return JSON.parse(raw || "{}");
}

let health = null;

export default async function handler(req, res) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  if (!SITES.test(host)) return json(res, 400, { error: "This server prints only ARISTORA's books." });
  const site = `${/^(127\.0\.0\.1|localhost):/.test(host) ? "http" : "https"}://${host}`;

  if (req.method === "GET") {
    if (!String(req.url ?? "").includes("health=1")) return json(res, 405, { error: "POST a unit." });
    if (health && Date.now() - health.at < 600000) return json(res, 200, health.body);
    const t0 = Date.now();
    try {
      const browser = await launchChrome();
      const chrome = await browser.version();
      const page = await browser.newPage();
      await page.setContent("<html><body><p>ARISTORA · அரிஸ்டோரா</p></body></html>");
      const pdf = await page.pdf({ format: "A4" });
      await browser.close();
      health = { at: Date.now(), body: { ok: true, chrome, bytes: pdf.length, ms: Date.now() - t0 } };
      return json(res, 200, health.body);
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e && e.message ? e.message : e).slice(0, 300), ms: Date.now() - t0 });
    }
  }
  if (req.method !== "POST") return json(res, 405, { error: "POST a unit." });

  let args;
  try {
    args = await bodyOf(req);
  } catch {
    return json(res, 400, { error: "Bad request." });
  }
  const { token, unitId } = args ?? {};
  const only = args?.only ?? null;
  if (typeof token !== "string" || token.length < 8 || token.length > 300 || typeof unitId !== "string" || !/^[a-z0-9]{8,64}$/.test(unitId)) {
    return json(res, 400, { error: "Bad request." });
  }
  if (only !== null && !(Number.isInteger(only) && only >= 0 && only < 100)) return json(res, 400, { error: "Bad level." });

  // The caller's own sign-in, checked by the queries before Chrome starts.
  const convex = new ConvexHttpClient(CONVEX_URL);
  let u;
  let printed;
  try {
    [u, printed] = await Promise.all([convex.query(anyApi.skillBook.unit, { token, unitId }), convex.query(anyApi.skillBook.questions, { token, unitId })]);
  } catch (e) {
    const msg = String(e && e.data ? e.data : (e && e.message) || e);
    return json(res, /sign|allow|permission|owner/i.test(msg) ? 403 : 502, { error: msg.slice(0, 200) });
  }
  if (!u) return json(res, 404, { error: "This unit's questions have no skills yet." });
  if (!printed || !printed.qs || !printed.qs.length) return json(res, 404, { error: "This unit's questions aren't in the app as printed." });

  try {
    const done = await makePdf({ site, load: async () => ({ u, printed }), only });
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${done.file}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Pages", String(done.pages));
    res.setHeader("X-Fonts", done.fonts ? "1" : "0");
    res.setHeader("X-Missing", String(done.missing));
    res.end(done.pdf);
  } catch (e) {
    return json(res, 500, { error: `The PDF couldn't be made: ${String(e && e.message ? e.message : e).slice(0, 200)}` });
  }
}
