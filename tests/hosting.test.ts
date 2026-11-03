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

  test("the family app installs and works offline under /f/ only (the teachers' app never gets a service worker)", () => {
    const m = JSON.parse(MANIFEST) as { start_url: string; scope: string; id: string };
    expect([m.id, m.start_url, m.scope]).toEqual(["/f/", "/f/", "/f/"]);
  });
});
