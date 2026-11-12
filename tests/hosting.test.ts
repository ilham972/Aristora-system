// Where each app is served (vercel.json). Vercel serves a file before any rewrite, so app.aristora.org/ (where
// index.html, the teachers' page, is a file) reaches the family app only with a redirect, which runs first.

import { describe, expect, test } from "vitest";
import MANIFEST from "../public/family/family.webmanifest?raw";
import VERCEL from "../vercel.json?raw";

type Rule = { source: string; destination: string; permanent?: boolean; has?: { type: string; value: string }[] };
const config = JSON.parse(VERCEL) as { redirects?: Rule[]; rewrites?: Rule[]; headers: unknown[] };

describe("the two addresses", () => {
  test("app.aristora.org/ redirects to the family app under /f/; nothing rewrites / (index.html would win)", () => {
    const r = (config.redirects ?? []).find((x) => x.source === "/");
    expect(r).toEqual({ source: "/", has: [{ type: "host", value: "app.aristora.org" }], destination: "/f/", permanent: false });
    expect((config.rewrites ?? []).some((x) => x.source === "/")).toBe(false);
    expect(config.headers.length).toBeGreaterThan(0); // the CSP and security headers stay
  });

  test("the family app's files (new names every version: code, style, its font) are kept a year by the phone", () => {
    const rules = config.headers as { source: string; headers: { key: string; value: string }[] }[];
    const fam = rules.find((r) => r.source === "/f/assets/(.*)");
    expect(fam?.headers).toEqual([{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]);
  });

  test("pictures: the page's own (data: and blob:: the photo a student picks opens as a blob) and Convex's (photos from home); scripts only the site's", () => {
    const rules = config.headers as { source: string; headers: { key: string; value: string }[] }[];
    const csp = rules.find((r) => r.source === "/((?!f/).*)")!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    const img = /img-src ([^;]+);/.exec(csp)![1].split(" ");
    expect(img).toEqual(expect.arrayContaining(["'self'", "data:", "blob:"]));
    expect(img.every((x) => ["'self'", "data:", "blob:", "https://*.convex.cloud"].includes(x))).toBe(true);
    expect(csp).toContain("script-src 'self';");
    expect(csp).toContain("object-src 'none'");
  });

  test("framing: the teachers' app never (frame-ancestors 'none'); the family app only by its own address (the class app's Us tab, 7 Nov 2026)", () => {
    const rules = config.headers as { source: string; headers: { key: string; value: string }[] }[];
    const csp = (source: string) => rules.find((r) => r.source === source)!.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp("/((?!f/).*)")).toContain("frame-ancestors 'none'");
    expect(csp("/f/(.*)")).toContain("frame-ancestors 'self'");
    // The same rules otherwise: only the framing differs.
    expect(csp("/f/(.*)").split("frame-ancestors")[0]).toBe(csp("/((?!f/).*)").split("frame-ancestors")[0]);
    const page = (path: string) => rules.filter((r) => new RegExp(`^${r.source.replace("(.*)", ".*")}$`).test(path)).map((r) => r.source);
    expect(page("/")).toEqual(["/((?!f/).*)"]);
    expect(page("/f/")).toEqual(["/f/(.*)"]);
    expect(page("/f/assets/fam-1.js")).toEqual(["/f/assets/(.*)", "/f/(.*)"]);
  });

  test("the family app installs and works offline under /f/ only (the teachers' app never gets a service worker)", () => {
    const m = JSON.parse(MANIFEST) as { start_url: string; scope: string; id: string };
    expect([m.id, m.start_url, m.scope]).toEqual(["/f/", "/f/", "/f/"]);
  });

  test("voice notes (12 Nov 2026): the teachers' app and its Us frame may use the microphone; both apps play audio from storage", () => {
    const rules = config.headers as { source: string; headers: { key: string; value: string }[] }[];
    const head = (src: string, key: string) => rules.find((r) => r.source === src)?.headers.find((h) => h.key === key)?.value ?? "";
    expect(head("/((?!f/).*)", "Permissions-Policy")).toContain("microphone=(self)");
    // The teachers' Us tab is the family app's page in a frame (/f/?staff): a teacher records her explanation there
    // (an online explanation's thread), so /f/ may use the microphone too. Students still never record: their screens
    // have no recorder and the server refuses a student's voice note (tests/help.test.ts).
    expect(head("/f/(.*)", "Permissions-Policy")).toContain("microphone=(self)");
    for (const src of ["/((?!f/).*)", "/f/(.*)"]) expect(head(src, "Content-Security-Policy")).toMatch(/media-src [^;]*https:\/\/\*\.convex\.cloud/);
  });
});
