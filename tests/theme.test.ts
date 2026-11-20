// Light by default, dark only from Me (13 Nov 2026, his rule). What must stay true in the files themselves:
// - both apps say "only light" (a browser's own dark never repaints them);
// - the dark colours are one file of plain rules under html[data-theme="dark"] (no nesting: an iPhone 7 can't read it);
// - a white SURFACE in the family app is painted with --card (so it turns dark); only white MARKS on violet stay #fff.
//   A new `background: #fff` fails here: paint it with var(--card), or name it below if it sits on violet.
import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const read = (f: string) => readFileSync(f, "utf8");
const rules = (css: string) =>
  [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}`]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].replace(/\s+/g, " ").trim(), body: m[2] }));

test("both apps say only light: the phone's or the browser's own dark changes nothing", () => {
  for (const page of ["public/index.html", "public/family/index.html"]) expect(read(page)).toContain('<meta name="color-scheme" content="only light">');
  expect(read("src/styles.css")).toMatch(/color-scheme: only light;/);
  expect(read("src/family/family.css")).toMatch(/color-scheme: only light;/);
});

test("the dark colours: plain rules under his switch, nothing else", () => {
  const css = read("src/family/dark.css");
  expect(css).not.toMatch(/^\s*&/m); // no nesting (Safari before 16.5)
  // One selector a rule (lists go inside :is()), so none can leak into the light look.
  for (const r of rules(css)) expect(r.sel.replace(/:is\([^)]*\)/g, "").split(",").every((s) => s.trim().startsWith('html[data-theme="dark"]')), r.sel).toBe(true);
  expect(css).toMatch(/color-scheme: only dark;/);
  // The page names the file and the script that attaches it before the first paint.
  expect(read("public/family/index.html")).toContain("%BOOT%");
  expect(read("src/family/boot.ts")).not.toMatch(/^import /m);
});

/** Every file that paints the family app (the Level's and the owl's style are strings in their own files). */
const STYLES = ["src/family/family.css", "src/family/profile.css", "src/family/usStyle.ts", "src/family/chatStyle.ts", "src/family/levelStyle.ts", "src/family/buddyStyle.ts"];

test("every file that paints the family app is checked here (a new style file joins STYLES)", () => {
  const painters = readdirSync("src/family").filter((f) => f.endsWith(".css") || /Style\.ts$/.test(f));
  const checked = new Set([...STYLES.map((f) => f.slice("src/family/".length)), "dark.css", "owl.css"]);
  expect(painters.filter((f) => !checked.has(f))).toEqual([]);
});

test("an ink on its own SOLID colour (START's brown on gold) is pinned in dark.css, where an ink turns light", () => {
  // In dark, --gold-ink (and every -ink) is a LIGHT colour, made for a dark card. On solid gold it vanishes: such a rule
  // must be in dark.css's "On a solid colour" list, which keeps the light look's ink there.
  const pins = read("src/family/dark.css");
  const missing: string[] = [];
  for (const file of STYLES)
    for (const r of rules(read(file))) {
      const decl = (p: string) => r.body.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${p}:`)) ?? "";
      const ink = decl("color").match(/var\(--(gold|flame|gem|right|wrong)-ink\)/);
      if (!ink) continue;
      // The words sit on the first colour the background names (a gradient's first stop, a ring's centre): its own solid
      // colour or bright stop (--gold, --gold-hi) needs the pin; its -soft tint (dark in dark) does not.
      const first = `${decl("background")} ${decl("background-color")}`.match(/var\(--([a-z0-9-]+)\)/);
      if (!first || !new RegExp(`^${ink[1]}(-hi)?$`).test(first[1])) continue;
      for (const sel of r.sel.split(",").map((x) => x.trim())) if (!pins.includes(sel)) missing.push(`${file}: ${sel}`);
    }
  expect(missing).toEqual([]);
});

test("a white surface is painted with --card; only white marks on violet stay white", () => {
  /** White on violet (a play button on the header, a switch's knob, a dash of a header's progress): the same in dark. */
  const ON_VIOLET: Record<string, string[]> = {
    "src/family/family.css": [".f-dashes i.on", ".f-btn.white", ".f-hero .f-caret.many", ".f-hero .f-who.on", ".f-today-go", ".f-livedot", ".f-livedot::after", ".f-wdot.lit i", ".f-switch::after"],
    "src/family/profile.css": [],
    "src/family/usStyle.ts": [".f-lb-n button.on"],
    "src/family/chatStyle.ts": [".c-msgs .f-msg.mine .h-play"],
    "src/family/levelStyle.ts": [],
    "src/family/buddyStyle.ts": [],
  };
  for (const [file, ok] of Object.entries(ON_VIOLET)) {
    const white = rules(read(file))
      .filter((r) => /(^|;)\s*background(-color)?:\s*#fff\s*(;|$)/.test(r.body))
      .map((r) => r.sel);
    expect(white, file).toEqual(ok);
  }
});
