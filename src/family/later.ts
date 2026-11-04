// What the first screen doesn't need (4 Nov 2026): Me, his profile (the map of 12 weeks, the class card, the report and
// its screen, the photo editor, the certificate, the name and birthday sheets). Their own file (parts.ts; its style is
// profile.css), fetched right after the first screen and kept by the phone like every other file (the service worker),
// so the app opens as fast as before they came (scripts/build.mjs: the first load's budget, and theirs).
// Small pieces the main screens need (his profile's numbers, a Stage's %) stay here.

import { useEffect, useState } from "preact/hooks";
import type { FamilyProfile } from "../../convex/family";
import type { StageLine } from "../../convex/lib/profile";
import { MONTH } from "./home";
import { keep, query } from "./net";

export type Parts = typeof import("./parts");

let mod: Parts | null = null;
let loading: Promise<Parts> | null = null;

/**
 * Their style: its own file (esbuild would copy a lazy file's CSS into the first load's), named in the page by the
 * build (`<link rel="prefetch" data-later>`, so the service worker keeps it) and attached here; the parts wait for it
 * (no unstyled moment).
 */
function style(): Promise<void> {
  const pre = document.querySelector<HTMLLinkElement>('link[rel="prefetch"][data-later]');
  if (!pre || document.querySelector('link[rel="stylesheet"][data-later]')) return Promise.resolve();
  return new Promise((done) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = pre.href;
    l.dataset.later = "1";
    l.onload = () => done();
    l.onerror = () => done();
    document.head.appendChild(l);
  });
}

/** The parts, fetched once (again after a failure: no signal the first time). */
export function loadParts(): Promise<Parts> {
  if (!loading) {
    loading = Promise.all([import("./parts"), style()]).then(
      ([m]) => (mod = m),
      (e) => {
        loading = null;
        throw e;
      },
    );
  }
  return loading;
}

/** The parts once here (null for a moment the first time: the screen draws without them). */
export function useParts(): Parts | null {
  const [m, setM] = useState<Parts | null>(mod);
  useEffect(() => {
    if (!m) void loadParts().then(setM, () => {});
  }, []);
  return m;
}

/** His profile's numbers (family.profile), kept for this child: the screen shows the last ones at once. */
export function useProfile(): FamilyProfile | null {
  const [p, setP] = useState<FamilyProfile | null>(() => keep<FamilyProfile>("profile"));
  useEffect(() => {
    query("family:profile")
      .then((x) => {
        keep("profile", x);
        setP(x as FamilyProfile);
      })
      .catch(() => {});
  }, []);
  return p;
}

/** His marks in a Stage, as a whole percentage (null = no marked Level there). */
export const pctOf = (s: Pick<StageLine, "got" | "max">) => (s.max > 0 ? Math.round((s.got / s.max) * 100) : null);

/** "11-04" → "4 Nov". */
export const bdayWords = (b: string) => `${Number(b.slice(3))} ${MONTH[Number(b.slice(0, 2)) - 1]}`;
