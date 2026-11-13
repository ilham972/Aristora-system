// Light by default, dark only from Me (13 Nov 2026, his rule). What must stay true in the files themselves:
// - both apps say "only light" (a browser's own dark never repaints them);
// - the dark colours are one file of plain rules under html[data-theme="dark"] (no nesting: an iPhone 7 can't read it);
// - a white SURFACE in the family app is painted with --card (so it turns dark); only white MARKS on violet stay #fff.
//   A new `background: #fff` fails here: paint it with var(--card), or name it below if it sits on violet.
import { readFileSync } from "node:fs";
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

test("a white surface is painted with --card; only white marks on violet stay white", () => {
  /** White on violet (a play button on the header, a switch's knob, a dash of a header's progress): the same in dark. */
  const ON_VIOLET: Record<string, string[]> = {
    "src/family/family.css": [".f-dashes i.on", ".f-btn.white", ".f-hero .f-caret.many", ".f-hero .f-who.on", ".f-today-go", ".f-livedot", ".f-livedot::after", ".f-wdot.lit i", ".f-switch::after"],
    "src/family/profile.css": [],
    "src/family/usStyle.ts": [".f-lb-n button.on"],
    "src/family/chatStyle.ts": [".c-msgs .f-msg.mine .h-play"],
  };
  for (const [file, ok] of Object.entries(ON_VIOLET)) {
    const white = rules(read(file))
      .filter((r) => /(^|;)\s*background(-color)?:\s*#fff\s*(;|$)/.test(r.body))
      .map((r) => r.sel);
    expect(white, file).toEqual(ok);
  }
});
