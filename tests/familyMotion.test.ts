// The family app's motion stays the graphics chip's work (13 Nov 2026, his ask: "like a native mobile app ... very
// fast", "don't reduce the animations: improve the performance"). Two rules, read from the styles themselves:
// 1. An animation moves only `transform` and `opacity`. Anything else (a shadow, a colour, a size) is painted again by
//    the main thread on every frame: the race's online dot pulsed its shadow, and cost a slow phone a quarter of its
//    time for as long as the race was on the screen.
// 2. An element never gets two animations of `transform` at once. Chrome then keeps both off the graphics chip for
//    good: the owl's cap had its drop-in and its hop on one element, and the hop redrew the whole owl 60 times a second
//    on every screen with an owl. Put one of them on a group inside (src/splash.css, the cap).
// Measured in tests/e2e/familyOpen.e2e.ts; this one names the line.

import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const files: Record<string, string> = {};
for (const f of readdirSync("src/family")) if (/\.css$|Style\.ts$/.test(f)) files[f] = readFileSync(`src/family/${f}`, "utf8");
files["splash.css"] = readFileSync("src/splash.css", "utf8");

/**
 * One-shot flashes (a moment, once): allowed to paint. Never one that repeats. f-flash: a post's colour when it is
 * new. f-bank: the Level's XP counter's ring, half a second on a right answer.
 */
const MAY_PAINT = new Set(["f-flash", "f-bank"]);
/** Two animations on one element that never run together (the owl's splat falls, and 8 s later goes). */
const MAY_PAIR = new Set([".f-splat"]);

const clean = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Every @keyframes: its name and the properties it moves. */
function keyframes(css: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of clean(css).matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
    const props = new Set<string>();
    for (const step of m[2].matchAll(/\{([^{}]*)\}/g)) {
      for (const d of step[1].split(";")) {
        const p = d.split(":")[0].trim();
        if (p && p !== "animation-timing-function") props.add(p);
      }
    }
    out.set(m[1], props);
  }
  return out;
}

/** The animations of one `animation:` value, split at its top-level commas. */
function parts(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

test("the styles are found (the app's, its later parts', the owl's, Us's and the chats')", () => {
  expect(Object.keys(files)).toEqual(expect.arrayContaining(["family.css", "profile.css", "owl.css", "splash.css", "usStyle.ts", "chatStyle.ts"]));
});

test("an animation moves only transform and opacity", () => {
  const odd: string[] = [];
  for (const [file, css] of Object.entries(files)) {
    for (const [name, props] of keyframes(css)) {
      const paints = [...props].filter((p) => p !== "transform" && p !== "opacity");
      if (paints.length && !MAY_PAINT.has(name)) odd.push(`${file}: @keyframes ${name} moves ${paints.join(", ")}`);
    }
  }
  expect(odd).toEqual([]);
});

test("no element gets two animations of transform at once", () => {
  const all = new Map<string, Set<string>>();
  for (const css of Object.values(files)) for (const [k, v] of keyframes(css)) all.set(k, v);
  expect(all.size).toBeGreaterThan(60);
  const odd: string[] = [];
  for (const [file, css] of Object.entries(files)) {
    for (const rule of clean(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = rule[1].trim().replace(/\s+/g, " ");
      for (const d of rule[2].matchAll(/(?:^|;)\s*animation\s*:\s*([^;]+)/g)) {
        const moving = parts(d[1]).filter((a) => a.split(/\s+/).some((w) => all.get(w)?.has("transform")));
        if (moving.length > 1 && !MAY_PAIR.has(sel)) odd.push(`${file}: ${sel} { animation: ${moving.join(", ")} }`);
      }
    }
  }
  expect(odd).toEqual([]);
});
