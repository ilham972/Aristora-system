// The slow-phone lab (13 Nov 2026, his ask: "improve the performance ... like a native mobile app"; "you are the one
// who can find where the bottleneck is"): the built family app in Chromium with the processor slowed RATE times (6:
// about a cheap Redmi), a class of 29 with a race and Us open, against the real functions. It measures and prints;
// it checks nothing and is never part of the checks (vitest.perf.config.ts; docs/making-changes.md, "Is the family app
// fast?"). Fake answers only (the repo is public).
// - "perf:"   every tap: the handler, finger to paint, frames over 50 ms; every screen at rest; a finger's scroll.
// - "audit"   every screen at rest: main-thread ms per second (0 is right), and what still runs if not.
// - "seq:"    a tap's work in order. "layout:" what each section of a screen costs. "open:" page start to Home drawn.
// - "lab"     the animations one by one: WHY=1 (Chrome's reason when one is not the graphics chip's), TRIES, PRECSS.
// - "shots:"  whole-page pictures with every animation frozen at AT ms, to compare a change pixel by pixel.
// - "level:"  the Level as it runs live (Check after every question): at rest, on the sheet, on the next question;
//             LIVE=1 samples the owl's squash while its hop really plays (a finished animation can't be frozen).
// - "reveal:" the old one-Check Level's reveal (EACH=0).
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { afterAll, beforeAll, test } from "vitest";
import { api } from "../../convex/_generated/api";
import { secretHash } from "../../convex/lib/auth";
import { outOf } from "../../convex/lib/book";
import { readWorkbookHtml } from "../../src/workbookFile";
import U01_BOOK from "../fixtures/workbook-g8-u01.html?raw";
import { addPerson, OWNER_TOKEN } from "../helpers";
import { makeBackend, playwright, serveDist } from "./harness";

type Page = import("playwright").Page;
type Browser = import("playwright").Browser;

const BOOK = readWorkbookHtml(U01_BOOK, "G8_U01_Workbook_source_v3.zip")[0];
const modules = import.meta.glob("../../convex/**/*.ts");
const RATE = Number(process.env.RATE ?? 6);
const OUT = process.env.PERF_OUT ?? "/tmp/perf.json";

function fakeKey() {
  const out: { q: number; a?: string; parts?: { p: string; a: string; m: number }[] }[] = [];
  for (let q = 1; q <= 52; q++) out.push({ q, a: String(q * 3) });
  for (let q = 53; q <= 73; q++) out.push({ q, parts: [{ p: "i", a: `work = **${q}**`, m: outOf(BOOK.data, q)! }] });
  return out;
}

let browser: Browser;
let site: { url: string; close: () => Promise<void> };
beforeAll(async () => {
  site = await serveDist(resolve("dist"));
  browser = await playwright.chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  await site?.close();
});

const results: Record<string, unknown> = {};

/** One tap: the handler's time, input → next paint, frames over 50 ms in the next second, the longest frame. */
async function tap(p: Page, name: string, sel: string | (() => Promise<void>), settle = 1200) {
  await p.evaluate(() => {
    const w = window as unknown as { __ev: PerformanceEventTiming[]; __fr: number[]; __on: boolean; __po?: PerformanceObserver; __lo: { d: number; b: number }[]; __lp?: PerformanceObserver };
    w.__ev = [];
    w.__fr = [];
    w.__lo = [];
    w.__on = true;
    w.__po?.disconnect();
    w.__po = new PerformanceObserver((l) => w.__ev.push(...(l.getEntries() as PerformanceEventTiming[])));
    w.__po.observe({ type: "event", durationThreshold: 16, buffered: false } as PerformanceObserverInit);
    w.__lp?.disconnect();
    try {
      w.__lp = new PerformanceObserver((l) => w.__lo.push(...l.getEntries().map((e) => ({ d: e.duration, b: (e as unknown as { blockingDuration: number }).blockingDuration }))));
      w.__lp.observe({ type: "long-animation-frame", buffered: false });
    } catch {
      /* none */
    }
    const f = (t: number) => {
      w.__fr.push(t);
      if (w.__on) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  await p.waitForTimeout(100);
  if (typeof sel === "string") await p.locator(sel).first().click();
  else await sel();
  await p.waitForTimeout(settle);
  const r = await p.evaluate(() => {
    const w = window as unknown as { __ev: PerformanceEventTiming[]; __fr: number[]; __on: boolean; __lo: { d: number; b: number }[] };
    w.__on = false;
    const ev = w.__ev.filter((e) => e.name === "click" || e.name === "pointerup" || e.name === "pointerdown");
    const worst = ev.reduce((a, e) => Math.max(a, e.duration), 0);
    const handler = ev.reduce((a, e) => Math.max(a, e.processingEnd - e.processingStart), 0);
    const gaps = w.__fr.slice(1).map((t, i) => t - w.__fr[i]);
    return {
      tapToPaint: Math.round(worst),
      handler: Math.round(handler),
      frames: gaps.length,
      over34: gaps.filter((g) => g > 34).length,
      over50: gaps.filter((g) => g > 50).length,
      longest: Math.round(Math.max(0, ...gaps)),
      loaf: w.__lo.map((x) => Math.round(x.d)),
      anims: document.getAnimations().length,
      nodes: document.querySelectorAll("*").length,
    };
  });
  results[name] = r;
  console.log(name.padEnd(28), JSON.stringify(r));
  return r;
}

/** A screen left alone: main-thread work per second, by kind (from a trace). */
async function idle(p: Page, name: string, ms = 3000) {
  await browser.startTracing(p, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "gpu"] });
  await p.waitForTimeout(ms);
  const buf = await browser.stopTracing();
  const tr = JSON.parse(buf.toString()) as { traceEvents: { name: string; ph: string; dur?: number; cat: string; tid: number; pid: number }[] };
  const sum: Record<string, number> = {};
  for (const e of tr.traceEvents) {
    if (e.ph !== "X" || !e.dur) continue;
    if (!["Layout", "UpdateLayoutTree", "Paint", "PrePaint", "Layerize", "Commit", "RasterTask", "FunctionCall", "FireAnimationFrame", "CompositeLayers", "UpdateLayerTree", "TimerFire", "EvaluateScript", "ParseHTML", "HitTest", "ImageDecodeTask", "Decode Image"].includes(e.name)) continue;
    sum[e.name] = (sum[e.name] ?? 0) + e.dur / 1000;
  }
  const per = Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round((v / ms) * 1000)]).filter(([, v]) => (v as number) > 0));
  const info = await p.evaluate(() => ({
    anims: document.getAnimations().map((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const n = (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty ?? "?";
      const it = (a.effect?.getComputedTiming().iterations ?? 1) as number;
      return `${n}${it === Infinity ? "∞" : ""}@${t?.tagName.toLowerCase()}.${(t?.getAttribute("class") ?? "").split(" ")[0]}`;
    }),
    nodes: document.querySelectorAll("*").length,
  }));
  const tally: Record<string, number> = {};
  for (const a of info.anims) tally[a] = (tally[a] ?? 0) + 1;
  results[`idle:${name}`] = { msPerSec: per, anims: tally, nodes: info.nodes };
  console.log(`idle:${name}`.padEnd(28), JSON.stringify(per), "anims", info.anims.length, "nodes", info.nodes);
  console.log("   ", JSON.stringify(tally));
}

/** A finger's scroll down and up: frames and the long ones. */
async function scroll(p: Page, name: string) {
  const cdp = await p.context().newCDPSession(p);
  await p.evaluate(() => {
    const w = window as unknown as { __fr: number[]; __on: boolean };
    w.__fr = [];
    w.__on = true;
    const f = (t: number) => {
      w.__fr.push(t);
      if (w.__on) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  for (const d of [-1400, -1400, 1400, 1400]) {
    await cdp.send("Input.synthesizeScrollGesture", { x: 180, y: 400, yDistance: d, speed: 1800, gestureSourceType: "touch" });
  }
  const r = await p.evaluate(() => {
    const w = window as unknown as { __fr: number[]; __on: boolean };
    w.__on = false;
    const gaps = w.__fr.slice(1).map((t, i) => t - w.__fr[i]);
    return { frames: gaps.length, over34: gaps.filter((g) => g > 34).length, over50: gaps.filter((g) => g > 50).length, longest: Math.round(Math.max(0, ...gaps)), h: document.documentElement.scrollHeight };
  });
  results[`scroll:${name}`] = r;
  console.log(`scroll:${name}`.padEnd(28), JSON.stringify(r));
  await cdp.detach();
  await p.evaluate(() => window.scrollTo(0, 0));
}

async function phone() {
  // As live: a Level checks after every question (the harness keeps the old one-Check Level unless asked; EACH=0 for it).
  const backend = makeBackend(modules, { each: process.env.EACH !== "0" });
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
  await t.mutation(api.families.setCode, { ...as, studentId: hana, code: "4719" });
  await t.mutation(api.families.setClassHours, { ...as, grade: 8, hours: Array.from({ length: 7 }, () => ({ from: 1, to: 1439 })) });
  // A class of 28 more, each with a Level from home (the race, Us's lines).
  for (let i = 0; i < 28; i++) {
    const id = await add(`${["Amal","Bisma","Cader","Dilan","Eesa","Fahim","Gita"][i % 7]}${String.fromCharCode(97 + Math.floor(i / 7))} ${String.fromCharCode(65 + i % 26)}`, 8);
    const code = `mate-${i}-family-link-0123456789abcdef`;
    const tok = `family-phone-mate-${i}-0123456789abcdefghijklmnopq`;
    await t.mutation(api.families.makeLink, { ...as, studentId: id, codeHash: secretHash("family-link", code) });
    await t.mutation(api.family.join, { code, token: tok, label: "Android" });
    if (i % 3 !== 0) await t.mutation(api.family.check, { token: tok, unitId: u01, n: 1, typed: Array.from({ length: 3 + (i % 7) }, (_, k) => ({ q: k + 1, a: [String((k + 1) * 3)] })) });
  }
  await t.mutation(api.us.setCfg, { ...as, open: true });

  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await backend.attach(ctx);
  const P = await ctx.newPage();
  P.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await P.goto(`${site.url}/f/`);
  await P.getByLabel(/Index/).fill("1001");
  await P.getByLabel("Code").fill("4719");
  await P.getByRole("button", { name: "Sign in" }).click();
  await P.locator(".f-goal-t").first().waitFor();
  await P.waitForTimeout(1500);
  // Level 1 done from home, so the map, the race and Me have something.
  const tok = await P.evaluate(() => {
    const l = JSON.parse(localStorage.getItem("aristora.family.accounts") ?? "[]") as { token: string }[];
    return l[0].token;
  });
  await t.mutation(api.family.check, { token: tok, unitId: u01, n: 1, typed: Array.from({ length: 9 }, (_, k) => ({ q: k + 1, a: [String((k + 1) * 3)] })) });
  await P.reload();
  await P.locator(".f-goal-t").first().waitFor();
  await P.waitForTimeout(2500); // the later parts

  const cdp = await ctx.newCDPSession(P);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: RATE });
  return { P, cdp, ctx };
}
const tabBtn = (n: string) => `.f-tabs button[aria-label="${n}"]`;

test("perf: the family app on a slow phone", async () => {
  const { P } = await phone();

  // Round 1: every tab once (first visit), then again (second visit).
  for (const round of [1, 2]) {
    for (const n of ["Learn", "Us", "Race", "Thread", "Home"]) await tap(P, `tab→${n} #${round}`, tabBtn(n));
  }
  await tap(P, "face→Me", ".f-toprow .f-who");
  await idle(P, "Me");
  await scroll(P, "Me");
  await P.goBack();
  await P.waitForTimeout(600);

  await idle(P, "Home");
  await scroll(P, "Home");
  await tap(P, "tab→Learn", tabBtn("Learn"));
  await idle(P, "Learn");
  await scroll(P, "Learn");
  await tap(P, "Learn→Stage", ".f-node.s-now, .f-node.s-done");
  await idle(P, "Stage");
  await tap(P, "Stage→Level", ".f-lv.play");
  await idle(P, "Level");
  await tap(P, "Level key 1", '.f-padkeys button[aria-label="1"]', 500);
  await tap(P, "Level key →", ".f-padkeys .f-key.next", 700);
  await tap(P, "Level key 2", '.f-padkeys button[aria-label="2"]', 500);
  await tap(P, "Level→Back", 'button[aria-label="Back"]');
  await tap(P, "Stage→Back", 'button[aria-label="Back"]');
  await tap(P, "tab→Us", tabBtn("Us"));
  await idle(P, "Us");
  await scroll(P, "Us");
  await tap(P, "tab→Race", tabBtn("Race"));
  await idle(P, "Race");
  await scroll(P, "Race");
  await tap(P, "Race→mate", ".f-rrow, .f-brow, .f-race-row, [class*=row] button");
  await P.goBack();
  await P.waitForTimeout(500);
  await tap(P, "bell", ".f-bellb");
  await P.goBack();
  await P.waitForTimeout(500);
  await tap(P, "feedback sheet", '.f-fbb[aria-label^="Feedback"]');
  await P.goBack();
  await P.waitForTimeout(500);
  await tap(P, "coin→Shop", ".f-pill.coin, .f-pill.gem");
  writeFileSync(OUT, JSON.stringify(results, null, 1));
});

/** The trace's Animation events: which run on the compositor and why not. */
async function animTrace(p: Page, ms = 1500) {
  await browser.startTracing(p, { categories: ["blink.animations", "devtools.timeline", "disabled-by-default-devtools.timeline"] });
  await p.waitForTimeout(ms);
  const tr = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: { name: string; ph: string; dur?: number; args?: { data?: Record<string, unknown> } }[] };
  const sum: Record<string, number> = {};
  const fails: Record<string, number> = {};
  for (const e of tr.traceEvents) {
    if (e.name === "Animation" && e.args?.data && ("compositeFailed" in e.args.data || "unsupportedProperties" in e.args.data)) {
      const k = `${String(e.args.data.name ?? "")}|fail=${String(e.args.data.compositeFailed)}|${JSON.stringify(e.args.data.unsupportedProperties ?? [])}`;
      fails[k] = (fails[k] ?? 0) + 1;
    }
    if (e.ph !== "X" || !e.dur) continue;
    if (!["Layout", "UpdateLayoutTree", "Paint", "PrePaint", "Layerize", "Commit", "HitTest"].includes(e.name)) continue;
    sum[e.name] = (sum[e.name] ?? 0) + e.dur / 1000;
  }
  const total = Math.round((Object.values(sum).reduce((a, b) => a + b, 0) / ms) * 1000);
  return { total, per: Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round((v / ms) * 1000)])), fails };
}

test("lab: what the animations on Home cost, and which change removes it", async () => {
  const { P, ctx } = await phone();
  if (process.env.PRECSS) {
    await ctx.addInitScript((css) => {
      const add = () => {
        const st = document.createElement("style");
        st.textContent = css;
        document.head.appendChild(st);
      };
      if (document.head) add();
      else document.addEventListener("readystatechange", add, { once: true });
    }, process.env.PRECSS);
    await P.reload();
    await P.locator(".f-goal-t").first().waitFor();
    await P.waitForTimeout(2500);
  }
  await P.waitForTimeout(1500);
  const base = await animTrace(P);
  console.log("BASE", JSON.stringify(base.per), base.total);
  console.log(JSON.stringify(base.fails, null, 1));
  if (process.env.WHY) {
    await browser.startTracing(P, { categories: ["blink.animations", "devtools.timeline", "disabled-by-default-devtools.timeline", "cc", "blink"] });
    await P.reload();
    await P.locator(".f-goal-t").first().waitFor();
    await P.waitForTimeout(2500);
    const tr = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: { name: string; ph: string; id2?: unknown; args?: { data?: Record<string, unknown> } }[] };
    const by: Record<string, Record<string, unknown>> = {};
    for (const e of tr.traceEvents as unknown as { name: string; id2?: { local?: string }; id?: string; args?: { data?: Record<string, unknown> } }[]) {
      if (e.name !== "Animation" || !e.args?.data) continue;
      const id = e.id2?.local ?? e.id ?? "?";
      by[id] = { ...(by[id] ?? {}), ...e.args.data };
    }
    const seen: Record<string, number> = {};
    for (const d of Object.values(by)) {
      const k = `${String(d.nodeName)} | ${String(d.displayName ?? d.name ?? "")} | fail=${String(d.compositeFailed)} ${JSON.stringify(d.unsupportedProperties ?? "")}`;
      seen[k] = (seen[k] ?? 0) + 1;
    }
    console.log(Object.entries(seen).map(([k, n]) => `${n} ${k}`).join("\n"));
  }
  const tries: Record<string, string> = JSON.parse(process.env.TRIES ?? "{}");
  for (const [name, css] of Object.entries(tries)) {
    const h = await P.addStyleTag({ content: css });
    await P.waitForTimeout(400);
    const r = await animTrace(P);
    console.log(name.padEnd(26), r.total, JSON.stringify(r.per), Object.keys(r.fails).length ? JSON.stringify(r.fails) : "");
    await h.evaluate((n) => (n as HTMLElement).remove());
  }
});

/** One tap under a trace: where its time goes. */
async function tapTrace(p: Page, name: string, sel: string, settle = 900) {
  await browser.startTracing(p, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "v8", "blink.user_timing"] });
  await p.locator(sel).first().click();
  await p.waitForTimeout(settle);
  const tr = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: { name: string; ph: string; dur?: number; ts: number; tid: number; args?: { data?: Record<string, unknown>; beginData?: Record<string, unknown>; elementCount?: number } }[] };
  const sum: Record<string, number> = {};
  const big: string[] = [];
  for (const e of tr.traceEvents) {
    if (e.ph !== "X" || !e.dur) continue;
    if (["Layout", "UpdateLayoutTree", "Paint", "PrePaint", "Layerize", "Commit", "HitTest", "EventDispatch", "FunctionCall", "TimerFire", "FireAnimationFrame", "ParseAuthorStyleSheet", "EvaluateScript", "v8.compile", "RunMicrotasks", "MinorGC", "MajorGC", "ScheduleStyleRecalculation", "Decode Image", "RasterTask", "ParseHTML", "XHRReadyStateChange", "V8.GC_SCAVENGER", "CompileCode"].includes(e.name)) {
      sum[e.name] = (sum[e.name] ?? 0) + e.dur / 1000;
      if (e.dur > 15000) big.push(`${e.name}:${Math.round(e.dur / 1000)}${e.name === "UpdateLayoutTree" ? `(n=${String(e.args?.elementCount ?? "")})` : ""}${e.name === "EventDispatch" ? `(${String(e.args?.data?.type)})` : ""}`);
    }
  }
  console.log(name.padEnd(18), JSON.stringify(Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => (v as number) >= 3))));
  console.log("    big:", big.join(" "));
}

test("where: a tap's time by kind", async () => {
  const { P } = await phone();
  await P.waitForTimeout(1000);
  for (const n of ["Learn", "Us", "Race", "Thread", "Home"]) await tapTrace(P, `tab→${n} #1`, tabBtn(n));
  for (const n of ["Learn", "Race", "Home"]) await tapTrace(P, `tab→${n} #2`, tabBtn(n));
  await tapTrace(P, "face→Me", ".f-toprow .f-who");
  await P.goBack();
  await P.waitForTimeout(500);
  await tapTrace(P, "bell", ".f-bellb");
  await P.goBack();
  await P.waitForTimeout(500);
  await tapTrace(P, "tab→Learn", tabBtn("Learn"));
  await tapTrace(P, "Learn→Stage", ".f-node.s-now, .f-node.s-done");
  await tapTrace(P, "Stage→Level", ".f-lv.play");
});

test("open: a returning phone, from the page's start to Home drawn", async () => {
  const { P } = await phone();
  for (let i = 0; i < 3; i++) {
    await P.reload();
    await P.locator(".f-goal-t").first().waitFor();
    const r = await P.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
      const res = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const js = res.filter((x) => x.name.includes("/f/assets/")).map((x) => `${x.name.split("/").pop()}:${Math.round(x.startTime)}-${Math.round(x.responseEnd)}`);
      return { now: Math.round(performance.now()), dcl: Math.round(nav.domContentLoadedEventEnd), fcp: Math.round(fcp), js };
    });
    console.log("open", JSON.stringify(r));
    await P.waitForTimeout(1500);
  }
});

test("audit: every screen left alone", async () => {
  const { P } = await phone();
  await P.waitForTimeout(800);
  const go = async (name: string, act: () => Promise<void>) => {
    await act();
    await P.waitForTimeout(1300);
    const r = await animTrace(P, 2000);
    const an = await P.evaluate(() =>
      document.getAnimations().filter((a) => a.playState === "running").map((a) => {
        const e = a.effect as KeyframeEffect;
        const t = e.target as Element | null;
        const props = [...new Set(e.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))];
        return `${(a as CSSAnimation).animationName ?? "transition"}@${t?.tagName.toLowerCase()}.${(t?.getAttribute("class") ?? "").replace(/ /g, ".")}${e.pseudoElement ?? ""}[${props.join(",")}]`;
      }),
    );
    const odd = an.filter((x) => !/\[(transform|opacity|transform,opacity|opacity,transform)\]$/.test(x));
    console.log(name.padEnd(14), String(r.total).padStart(4), "ms/s", JSON.stringify(r.per), odd.length ? `NOT transform/opacity: ${odd.join(" ")}` : "");
    if (r.total > 25) console.log("     running:", [...new Set(an)].join(" "));
  };
  await go("Home", async () => {});
  await go("Learn", () => P.locator(tabBtn("Learn")).click());
  await go("Stage", () => P.locator(".f-node.s-now, .f-node.s-done").first().click());
  await go("Level", () => P.locator(".f-lv.play").first().click());
  await P.goBack();
  await P.goBack();
  await P.waitForTimeout(400);
  await go("Us", () => P.locator(tabBtn("Us")).click());
  await go("Race", () => P.locator(tabBtn("Race")).click());
  await go("Thread", () => P.locator(tabBtn("Thread")).click());
  await go("Me", () => P.locator(".f-toprow .f-who").first().click());
  await P.goBack();
  await P.waitForTimeout(400);
  await go("Bell", () => P.locator(".f-bellb").first().click());
  await P.goBack();
  await P.waitForTimeout(400);
  await go("Shop", () => P.locator(".f-pill.coin, .f-pill.gem").first().click());
});

/** One tap: the work from the finger to the first frames, in order. */
async function tapSeq(p: Page, name: string, sel: string) {
  await browser.startTracing(p, { categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "toplevel"] });
  await p.locator(sel).first().click();
  await p.waitForTimeout(700);
  const tr = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: { name: string; ph: string; dur?: number; ts: number; tid: number; pid: number; args?: { data?: Record<string, unknown>; elementCount?: number; beginData?: Record<string, unknown> } }[] };
  const ev = tr.traceEvents.filter((e) => e.ph === "X" && e.dur);
  const click = ev.find((e) => e.name === "EventDispatch" && e.args?.data?.type === "click");
  if (!click) return console.log(name, "no click");
  const names = ["EventDispatch", "UpdateLayoutTree", "Layout", "PrePaint", "Paint", "Layerize", "Commit", "FunctionCall", "TimerFire", "FireAnimationFrame", "MinorGC", "MajorGC", "ParseHTML", "RunMicrotasks", "HitTest", "IntersectionObserverController::computeIntersections", "Decode Image"];
  const seq = ev
    .filter((e) => e.tid === click.tid && e.pid === click.pid && e.ts >= click.ts && e.ts < click.ts + 450_000 && names.includes(e.name) && (e.dur ?? 0) >= 4000)
    .sort((a, b) => a.ts - b.ts)
    .map((e) => `${Math.round((e.ts - click.ts) / 1000)}:${e.name === "UpdateLayoutTree" ? `Style(${String(e.args?.elementCount ?? "")})` : e.name === "EventDispatch" ? `Ev(${String(e.args?.data?.type)})` : e.name}=${Math.round((e.dur ?? 0) / 1000)}`);
  console.log(name.padEnd(14), seq.join("  "));
}

test("seq: a tap's first frames", async () => {
  const { P } = await phone();
  await P.waitForTimeout(800);
  for (const n of ["Learn", "Us", "Race", "Home", "Learn", "Race", "Home"]) await tapSeq(P, `tab→${n}`, tabBtn(n));
  await tapSeq(P, "face→Me", ".f-toprow .f-who");
  await P.goBack();
  await P.waitForTimeout(500);
  await tapSeq(P, "tab→Race", tabBtn("Race"));
  await tapSeq(P, "Race→mate", ".f-pod, li.rise button, li.rise");
});

test("layout: what Me's sections cost", async () => {
  const { P } = await phone();
  await P.waitForTimeout(800);
  for (const how of ["me", "race", "learn", "home"]) {
    if (how === "me") await P.locator(".f-toprow .f-who").first().click();
    else await P.locator(tabBtn(how === "race" ? "Race" : how === "learn" ? "Learn" : "Home")).click();
    await P.waitForTimeout(1500);
    const r = await P.evaluate(() => {
      const main = document.querySelector("main.f-main") as HTMLElement;
      const kids = [...main.children] as HTMLElement[];
      const time = (f: () => void) => {
        const t = performance.now();
        f();
        void document.body.offsetHeight;
        return performance.now() - t;
      };
      const whole = (() => {
        main.style.display = "none";
        void document.body.offsetHeight;
        return time(() => (main.style.display = ""));
      })();
      const out: string[] = [];
      for (const k of kids) {
        k.style.display = "none";
        void document.body.offsetHeight;
        const t = time(() => (k.style.display = ""));
        out.push(`${k.tagName.toLowerCase()}.${k.className.split(" ").slice(0, 2).join(".")}(${k.querySelectorAll("*").length}n,${Math.round(k.getBoundingClientRect().height)}px)=${Math.round(t)}`);
      }
      return { whole: Math.round(whole), out };
    });
    console.log(how, "whole style+layout", r.whole, "ms |", r.out.join("  "));
    if (how === "me") {
      await P.goBack();
      await P.waitForTimeout(400);
    }
  }
});

test("shots: every main screen, whole page", async () => {
  const { P, cdp } = await phone();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const dir = process.env.SHOTS ?? "/tmp/shots";
  await P.addInitScript((at) => ((window as unknown as { __at?: number }).__at = at), Number(process.env.AT ?? 3000));
  await P.evaluate((at) => ((window as unknown as { __at?: number }).__at = at), Number(process.env.AT ?? 3000));
  const snap = async (name: string) => {
    await P.waitForTimeout(900);
    // Every animation at its end, so two runs draw the same picture.
    await P.evaluate(() =>
      document.getAnimations().forEach((a) => {
        a.pause();
        a.currentTime = Number((window as unknown as { __at?: number }).__at ?? 3000);
      }),
    );
    await P.waitForTimeout(150);
    await P.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  };
  await snap("home");
  await P.locator(tabBtn("Learn")).click();
  await snap("learn");
  await P.locator(tabBtn("Us")).click();
  await snap("us");
  await P.locator(tabBtn("Race")).click();
  await snap("race");
  await P.locator(".f-pod").first().click();
  await snap("mate");
  await P.goBack();
  await P.locator(tabBtn("Thread")).click();
  await snap("thread");
  await P.locator(".f-toprow .f-who").first().click();
  await snap("me");
});

test("reveal: a Level checked, the reveal's frames and the screen at rest", async () => {
  const { P } = await phone();
  await P.waitForTimeout(800);
  await P.locator(tabBtn("Learn")).click();
  await P.locator(".f-node.s-now, .f-node.s-done").first().click();
  await P.locator(".f-lv.play").first().click();
  await P.locator(".f-qn").first().waitFor();
  // Level 2 (Q11–20): the fake key's answers, the last one wrong.
  const n0 = Number(((await P.locator(".f-qn").first().innerText()).match(/\d+/) ?? ["11"])[0]);
  for (let q = n0; q < n0 + 10; q++) {
    if (await P.locator(".f-review").count()) break;
    for (const k of String(q === n0 + 9 ? 7 : q * 3)) await P.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
    await P.locator(".f-padkeys .f-key.next").click();
    await P.waitForTimeout(120);
  }
  await P.locator(".f-review").first().waitFor();
  await tap(P, "Check → the reveal", '.f-review button:has-text("Check")', 6000);
  const r = await animTrace(P, 2000);
  console.log("the reveal at rest", r.total, "ms/s", JSON.stringify(r.per));
  const an = await P.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").map((a) => `${(a as CSSAnimation).animationName ?? "transition"}@${((a.effect as KeyframeEffect).target as Element | null)?.getAttribute("class") ?? ""}`));
  console.log("  running:", [...new Set(an)].join(" "));
});

test("level: the Level with its owl, at rest, after a right answer, on the next question", async () => {
  const { P } = await phone();
  await P.waitForTimeout(800);
  await P.locator(tabBtn("Learn")).click();
  await P.locator(".f-node.s-now, .f-node.s-done").first().click();
  await P.locator(".f-lv.play").first().click();
  await P.locator(".f-qn").first().waitFor();
  await P.waitForTimeout(1200);
  const say = async (name: string) => {
    const r = await animTrace(P, 2000);
    const an = await P.evaluate(() => [...new Set(document.getAnimations().filter((a) => a.playState === "running").map((a) => `${(a as CSSAnimation).animationName ?? "transition"}@${((a.effect as KeyframeEffect).target as Element | null)?.getAttribute("class") ?? ""}`))]);
    console.log(name.padEnd(30), String(r.total).padStart(4), "ms/s", JSON.stringify(r.per));
    if (r.total > 15) console.log("    running:", an.join(" "));
  };
  await say("the Level, nothing typed");
  for (let i = 0; i < 3; i++) {
    const q = Number(((await P.locator(".f-qn").first().innerText()).match(/\d+/) ?? ["0"])[0]);
    for (const k of String(q * 3)) await P.locator(".f-padkeys").getByRole("button", { name: k, exact: true }).click();
    if (process.env.LIVE) {
      // The hop as it plays: the squash (the squash group times the landing group inside it) against the hop's own clock.
      await P.locator(".f-padkeys .f-key.next").click();
      const rows = await P.evaluate(
        () =>
          new Promise<string[]>((done) => {
            const out: string[] = [];
            const t0 = performance.now();
            const step = () => {
              const hop = document.querySelector(".fbowl .ob-hop");
              const sq = document.querySelector(".fbowl .ob-sq");
              const land = document.querySelector(".fbowl .ob-land");
              if (hop && sq) {
                const m = (e: Element | null) => (e ? new DOMMatrix(getComputedStyle(e).transform === "none" ? "" : getComputedStyle(e).transform) : new DOMMatrix());
                const c = m(sq).multiply(m(land));
                const at = Number(hop.getAnimations()[0]?.currentTime ?? -1);
                out.push(`${Math.round(at)}:${c.a.toFixed(3)},${c.d.toFixed(3)}`);
              }
              if (performance.now() - t0 < 2200) requestAnimationFrame(step);
              else done(out);
            };
            requestAnimationFrame(step);
          }),
      );
      const pick = [60, 110, 280, 300, 545, 610, 640, 900, 1180, 1230, 1260, 1290, 1320, 1500];
      console.log("LIVE", q, pick.map((t) => rows.reduce((best, r) => (Math.abs(Number(r.split(":")[0]) - t) < Math.abs(Number(best.split(":")[0]) - t) ? r : best), rows[0] ?? "-1:0,0")).join("  "));
    } else
    await tap(P, `Q${q} Check`, ".f-padkeys .f-key.next", 1800);
    await say(`Q${q} after Check (the sheet)`);
    // The owl's hop on the sheet, frozen at a few moments, to compare a change of its animations.
    if (process.env.SHOTS) {
      for (const at of [300, 900, 1270, 2000]) {
        await P.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), at);
        await P.waitForTimeout(120);
        await P.screenshot({ path: `${process.env.SHOTS}/level-q${q}-${at}.png` });
      }
      await P.evaluate(() => document.getAnimations().forEach((a) => a.play()));
    }
    await tap(P, `Q${q} Continue`, () => P.getByRole("button", { name: "Continue" }).click(), 1500);
    await say(`after Q${q}, the next question`);
  }
});
