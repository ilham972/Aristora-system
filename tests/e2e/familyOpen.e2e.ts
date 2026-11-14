// The family app's open, for real (13 Nov 2026, his ask: "like a native mobile app ... very fast"): its service worker
// (public/family/sw.js) in Chromium against a server that can be slow, down, or a newer version.
// - A phone with a weak signal opens the copy kept on it after 0.7 s at most (before: it waited for the network however
//   long that took, a white screen); with no network, at once.
// - A kept copy always opens whole: every file its page names is kept before the page is (Us and the chats too, which
//   the page itself fetches only when they open), and the old version's files stay until the new page is on the screen.
// - A newer version shows at once when the network answers in time; else at the next open.
// And every screen at rest leaves the phone alone: no animation is worked out on the main thread (the owl's cap was,
// 60 times a second, on every screen with an owl). No backend here: the app stops at its sign-in.

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { playwright } from "./harness";

type Page = import("playwright").Page;
type Browser = import("playwright").Browser;

const DIST = resolve("dist");
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".png": "image/png" };
/** The server's state: how long the page takes, which version is online, whether it answers at all. */
const S = { delay: 0, version: 1, down: false, missing: 0 };
let browser: Browser;
let srv: http.Server;
let base = "";
let page1 = "";
let css = "";

/** A "new version": the same app with its style under a new name, and a mark to tell the versions apart. */
const pageOf = (v: number) => (v === 1 ? page1 : page1.replace(css, `v${v}-${css}`).replace("<title>", `<meta name="v" content="${v}"><title>`));

beforeAll(async () => {
  page1 = await readFile(join(DIST, "f/index.html"), "utf8");
  css = /\/f\/assets\/(fam-[A-Z0-9]+\.css)/.exec(page1)![1];
  srv = http.createServer((req, res) => {
    void (async () => {
      const path = new URL(req.url ?? "/", "http://x").pathname;
      if (S.down) return void req.socket.destroy();
      try {
        if (path === "/f/") {
          if (S.delay) await new Promise((r) => setTimeout(r, S.delay));
          return void res.writeHead(200, { "content-type": TYPES[".html"] }).end(pageOf(S.version));
        }
        let p = path;
        const m = /^\/f\/assets\/v(\d+)-(.+)$/.exec(p);
        // As on Vercel: only the version online has its files; an older version's are gone.
        if (m) {
          if (Number(m[1]) !== S.version || S.missing === Number(m[1])) throw new Error("gone");
          p = `/f/assets/${m[2]}`;
        } else if (p.endsWith(css) && S.version !== 1) throw new Error("gone");
        const body = await readFile(join(DIST, p));
        res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream", ...(p.startsWith("/f/assets/") ? { "cache-control": "public, max-age=31536000, immutable" } : {}) }).end(body);
      } catch {
        res.writeHead(404).end("Not found");
      }
    })();
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  browser = await playwright.chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await new Promise((r) => srv?.close(() => r(null)));
});

async function until(check: () => Promise<boolean>, what: string, timeout = 10_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      if (await check()) return;
    } catch {
      /* the page is loading */
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

/** What the worker keeps: every file's path, the kept page's version and the files that page names. */
const kept = (p: Page) =>
  p.evaluate(async () => {
    const c = await caches.open("aristora-family-6");
    const keys = (await c.keys()).map((r) => new URL(r.url).pathname);
    const page = (await (await c.match("/__page"))?.text()) ?? "";
    return { keys, v: page ? (/name="v" content="(\d+)"/.exec(page)?.[1] ?? "1") : "", named: [...new Set(page.match(/\/f\/assets\/[^"' ]+/g) ?? [])] };
  });
/** The version of the page on the screen. */
const shown = (p: Page) => p.evaluate(() => document.querySelector('meta[name="v"]')?.getAttribute("content") ?? "1");
/** Opens the app; how long until its page is there. */
async function open(p: Page, path = "/f/") {
  const t = Date.now();
  await p.goto(base + path, { waitUntil: "domcontentloaded" });
  return Date.now() - t;
}
const drawn = (p: Page) => until(() => p.evaluate(() => !!document.querySelector(".f-signin")), "the app drawn");

test("the open: the kept copy when the network is slow or gone, always whole; a newer version at once or at the next open", async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  const P = await ctx.newPage();

  // The first visit: the worker keeps the page with every file it names; Us and the chats without being opened; never
  // the teachers' file.
  await open(P);
  await until(() => P.evaluate(() => navigator.serviceWorker.controller !== null), "the worker controls the page");
  await until(async () => (await kept(P)).v === "1", "the page kept");
  let c = await kept(P);
  expect(c.named.length).toBeGreaterThan(10);
  expect(c.named.filter((f) => !c.keys.includes(f))).toEqual([]);
  expect(c.keys.some((k) => /\/usParts-/.test(k))).toBe(true);
  expect(c.keys.some((k) => /\/chatParts-/.test(k))).toBe(true);
  expect(c.keys.some((k) => /\/staff-/.test(k))).toBe(false);

  // A slow network (the page takes 4 s): the kept copy opens after about 0.7 s.
  S.delay = 4000;
  let ms = await open(P);
  expect(ms).toBeGreaterThan(600);
  expect(ms).toBeLessThan(2500);
  await drawn(P);
  S.delay = 0;
  await P.waitForTimeout(3600); // the slow answer comes and is kept

  // No network at all: at once.
  S.down = true;
  ms = await open(P);
  expect(ms).toBeLessThan(600);
  await drawn(P);
  S.down = false;

  // A new version on a network that answers in time: on the screen at once; kept; the old version's files go.
  S.version = 2;
  await open(P);
  expect(await shown(P)).toBe("2");
  await until(async () => (await kept(P)).v === "2" && !(await kept(P)).keys.includes(`/f/assets/${css}`), "version 2 kept, version 1's style gone");

  // A newer version on a slow network: the kept one opens now, with its own files (the server no longer has them); the
  // newer one is kept behind the scenes and the running one's files stay; the next open is the newer one.
  S.version = 3;
  S.delay = 2500;
  ms = await open(P);
  expect(await shown(P)).toBe("2");
  expect(ms).toBeLessThan(2000);
  await until(() => P.evaluate(() => getComputedStyle(document.body).fontFamily.includes("Baloo")), "version 2's style from the phone");
  await until(async () => (await kept(P)).v === "3", "version 3 kept behind the scenes");
  c = await kept(P);
  expect(c.keys).toContain(`/f/assets/v3-${css}`);
  expect(c.keys).toContain(`/f/assets/v2-${css}`);
  S.delay = 0;
  await open(P);
  expect(await shown(P)).toBe("3");
  await until(async () => !(await kept(P)).keys.includes(`/f/assets/v2-${css}`), "version 2's files gone");

  // A version one of whose files won't come: never kept (the kept copy is always whole).
  S.version = 4;
  S.missing = 4;
  S.delay = 1500;
  await open(P);
  expect(await shown(P)).toBe("3");
  await P.waitForTimeout(2500);
  expect((await kept(P)).v).toBe("3");
  S.missing = 0;

  // The class app's Us tab (/f/?staff) names a file never kept here: always the network's page.
  S.delay = 1200;
  ms = await open(P, "/f/?staff");
  expect(ms).toBeGreaterThanOrEqual(1200);
  S.delay = 0;
  S.version = 1;
  await ctx.close();
});

test("the living owl leaves the phone alone: at rest, no animation is worked out on the main thread", async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  // No worker here: the page as the server sends it.
  await ctx.addInitScript(() => Object.defineProperty(navigator, "serviceWorker", { value: undefined }));
  const P = await ctx.newPage();
  await open(P);
  await drawn(P); // the sign-in: the big living owl, waving
  await P.waitForTimeout(1600); // its entrance and the cap's drop are over
  // Every animation still running is the graphics chip's: only transform and opacity, and never two on one element
  // (two animations of transform on one element: Chrome keeps both on the main thread, as the owl's cap was).
  const odd = await P.evaluate(() => {
    const out: string[] = [];
    const seen = new Map<Element, number>();
    for (const a of document.getAnimations()) {
      if (a.playState !== "running") continue;
      const e = a.effect as KeyframeEffect;
      const t = e.target;
      if (!t) continue;
      const props = new Set(e.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))));
      const name = `${(a as CSSAnimation).animationName ?? "transition"} on .${t.getAttribute("class") ?? t.tagName}`;
      for (const p of props) if (p !== "transform" && p !== "opacity") out.push(`${name}: animates ${p}`);
      if (props.has("transform")) {
        seen.set(t, (seen.get(t) ?? 0) + 1);
        if (seen.get(t) === 2) out.push(`${name}: a second animation of transform on one element`);
      }
    }
    return out;
  });
  expect(odd).toEqual([]);
  expect(await P.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length)).toBeGreaterThan(5); // the owl is alive
  // And the proof: two seconds of the living owl cost the main thread next to nothing (before: about a quarter of it).
  await browser.startTracing(P, { categories: ["devtools.timeline"] });
  await P.waitForTimeout(2000);
  const trace = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: { name: string; ph: string; dur?: number }[] };
  const work = trace.traceEvents.filter((e) => e.ph === "X" && ["Layout", "UpdateLayoutTree", "Paint", "PrePaint", "Layerize"].includes(e.name)).reduce((a, e) => a + (e.dur ?? 0), 0) / 1000;
  expect(work).toBeLessThan(40); // ms of 2 s; with the cap on the main thread it was 112 here, and about 450 on a slow phone
  await ctx.close();
});
