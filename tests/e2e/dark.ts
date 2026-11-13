// Every screen of the family app in dark, for the eye and for an audit (13 Nov 2026: his Dark from Me means every
// colour is decided twice). Not a run-through: `shot()` in family.e2e.ts calls `darkShot` when DARK=1, so
//   DARK=1 SHOTS=<folder> npx vitest run -c vitest.e2e.config.ts tests/e2e/family.e2e.ts [-t "<a run-through>"]
// leaves, beside each screenshot, `<name>-dark.png` and `<name>.audit.txt`: light surfaces left behind (LIGHT), light
// stops in gradients (GRAD), words fainter than 3.2 : 1 on what is under them (FAINT). Gold on gold and white on violet
// are in the list on purpose: read it, don't obey it. It can't see inside a printed question, a ::before or an SVG.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
type Page = import("playwright").Page;

export async function goDark(p: Page, on: boolean) {
  await p.evaluate(async (dark) => {
    if (!dark) return void delete document.documentElement.dataset.theme;
    const pre = document.querySelector<HTMLLinkElement>("link[data-dark]");
    if (pre && !document.querySelector("link[data-dark-on]"))
      await new Promise<void>((done) => {
        const l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = pre.href;
        l.setAttribute("data-dark-on", "");
        l.onload = l.onerror = () => done();
        document.head.appendChild(l);
      });
    document.documentElement.dataset.theme = "dark";
  }, on);
}

export async function audit(p: Page): Promise<string[]> {
  return p.evaluate(() => {
    const lum = (r: number, g: number, b: number) => {
      const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const rgb = (c: string) => {
      const m = c.match(/rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/);
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
    };
    const name = (el: Element) => `${el.tagName.toLowerCase()}.${(el.getAttribute("class") ?? "").trim().split(/\s+/).join(".")}`;
    const path = (el: Element) => (el.parentElement ? `${name(el.parentElement)} > ` : "") + name(el);
    const stopsOf = (img: string) => [...img.matchAll(/rgba?\([^)]+\)/g)].map((m) => rgb(m[0])!).filter((x) => x.a > 0.3);
    const out = new Set<string>();
    const bgOf = (el: Element | null): { l: number; who: string } => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage.includes("gradient")) {
          const st = stopsOf(cs.backgroundImage);
          if (st.length) return { l: st.reduce((a, x) => a + lum(x.r, x.g, x.b), 0) / st.length, who: name(e) + "(grad)" };
        }
        const c = rgb(cs.backgroundColor);
        if (c && c.a > 0.6) return { l: lum(c.r, c.g, c.b), who: name(e) };
      }
      return { l: 0, who: "page" };
    };
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width < 6 || r.height < 6) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity === 0) continue;
      const c = rgb(cs.backgroundColor);
      if (c && c.a > 0.3 && lum(c.r, c.g, c.b) > 0.5 && r.width * r.height > 300) out.add(`LIGHT ${path(el)} ${cs.backgroundColor}`);
      if (cs.backgroundImage.includes("gradient") && r.width * r.height > 300) {
        const st = stopsOf(cs.backgroundImage).filter((x) => lum(x.r, x.g, x.b) > 0.5);
        if (st.length) out.add(`GRAD ${path(el)} ${cs.backgroundImage.slice(0, 90)}`);
      }
      if ([...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim().length > 0)) {
        const t = rgb(cs.color);
        const b = bgOf(el);
        if (t) {
          const lt = lum(t.r, t.g, t.b);
          const cr = (Math.max(lt, b.l) + 0.05) / (Math.min(lt, b.l) + 0.05);
          if (cr < 3.2) out.add(`FAINT ${path(el)} ${cs.color} on ${b.who} (${cr.toFixed(1)})`);
        }
      }
    }
    return [...out];
  });
}

/** After a screenshot: the same screen in dark, its audit, then as it was (the run-through goes on). */
export async function darkShot(p: Page, dir: string, name: string) {
  if (!process.env.DARK || !new URL(p.url()).pathname.startsWith("/f/") || p.url().includes("staff")) return;
  const was = await p.evaluate(() => document.documentElement.dataset.theme === "dark");
  await goDark(p, true);
  await p.waitForTimeout(500); // a change of look animates every transition on the page
  await p.screenshot({ path: join(dir, `${name}-dark.png`) });
  await writeFile(join(dir, `${name}.audit.txt`), (await audit(p)).join("\n") + "\n");
  await goDark(p, was);
}
