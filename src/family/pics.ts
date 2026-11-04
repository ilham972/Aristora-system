// The pictures on this phone (4 Nov 2026): his photo and his classmates' in the race, kept by key (a photo's own id:
// a new picture is a new key), so each picture comes from the server once. The server sends only his own and those
// the teachers said OK to in his grade (family.photos). Shared by the children on this phone; the 40 newest are kept.

import { useEffect, useState } from "preact/hooks";
import { query } from "./net";

const STORE = "aristora.family.pics";
const MAX = 40;
type Kept = Record<string, { u: string; t: number }>;

let kept: Kept | null = null;
const listeners = new Set<() => void>();
const asking = new Set<string>();

function all(): Kept {
  if (kept) return kept;
  try {
    const x = JSON.parse(localStorage.getItem(STORE) ?? "{}") as unknown;
    kept = x && typeof x === "object" ? (x as Kept) : {};
  } catch {
    kept = {};
  }
  return kept;
}

/** The picture for a key (an image address), or null: his letter shows instead. */
export function picOf(key: string | null | undefined): string | null {
  return key ? (all()[key]?.u ?? null) : null;
}

/** Keeps a picture (the oldest go past 40) and tells the screens. */
export function keepPic(key: string, url: string) {
  const k = all();
  k[key] = { u: url, t: Date.now() };
  const keys = Object.keys(k);
  if (keys.length > MAX) {
    for (const x of keys.sort((a, b) => k[a].t - k[b].t).slice(0, keys.length - MAX)) delete k[x];
  }
  try {
    localStorage.setItem(STORE, JSON.stringify(k));
  } catch {
    /* full, or private mode: kept until the page closes */
  }
  for (const f of listeners) f();
}

/** Asks the server once for the pictures this phone doesn't have yet. */
async function want(keys: (string | null | undefined)[]) {
  const k = all();
  const need = [...new Set(keys.filter((x): x is string => !!x && !k[x] && !asking.has(x)))].slice(0, 40);
  if (!need.length) return;
  for (const x of need) asking.add(x);
  try {
    const got = (await query("family:photos", { keys: need })) as Record<string, string>;
    for (const [key, url] of Object.entries(got)) if (url.startsWith("data:image/")) keepPic(key, url);
  } catch {
    /* no signal: the letters stay until next time */
  } finally {
    for (const x of need) asking.delete(x);
  }
}

/** A screen that shows these pictures: fetches the missing ones, and draws again when one arrives. */
export function usePics(keys: (string | null | undefined)[]): void {
  const [, bump] = useState(0);
  const sig = keys.filter(Boolean).join(",");
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    void want(keys);
    return () => {
      listeners.delete(f);
    };
  }, [sig]);
}
