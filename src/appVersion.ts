// Is a newer copy of the app online? (5 Nov 2026, his "I can't upload this": his phone had kept the teachers' app open
// since before the night's update, and its old upload reader refused a zip the new app takes. Nothing ever told a page
// it was old, and the offline banner even says "Don't close this page".) A page names its own code and style, whose
// names change with every version (scripts/build.mjs: [name]-[hash]), so a copy compares the names it runs with the
// page online. A page left open looks each time it comes back to the screen: back after half an hour with nothing to
// lose, it loads again by itself; otherwise the teachers' app says so (its update banner), and the upload sheet asks
// for Update before it reads a zip with old code. Import-free: the family app uses it too (in its later parts).

const MIN = 60_000;

/** A page's version: its code and style as it names them (the family app's later style, attached at run time, apart). */
export function versionIn(doc: ParentNode): string {
  return [...doc.querySelectorAll('script[type="module"][src], link[rel="stylesheet"]:not([data-later])')]
    .map((e) => e.getAttribute("src") ?? e.getAttribute("href") ?? "")
    .sort()
    .join(" ");
}

/**
 * True when the page online (`page`: "/" for the teachers, "/f/" for the family app) names other files than this copy
 * runs: a newer version is out. False whenever it can't tell (no signal, a slow answer, no page here): never a reload
 * on a guess.
 */
export async function newerOnline(page: string, wait = 5000): Promise<boolean> {
  const stop = new AbortController();
  const late = setTimeout(() => stop.abort(), wait);
  try {
    const mine = versionIn(document);
    if (!mine) return false;
    const res = await fetch(page, { cache: "no-store", signal: stop.signal });
    if (!res.ok) return false;
    const online = versionIn(new DOMParser().parseFromString(await res.text(), "text/html"));
    return online !== "" && online !== mine;
  } catch {
    return false;
  } finally {
    clearTimeout(late);
  }
}

/** Something on the page a reload would lose: words typed (or files picked), or a sheet open. */
export function busyHere(doc: ParentNode = document): boolean {
  if (doc.querySelector('[role="dialog"]')) return true;
  for (const el of doc.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea")) {
    if (/^(checkbox|radio|range|hidden|button|submit|reset|color)$/i.test(el.type)) continue;
    if (el.value.trim()) return true;
  }
  return false;
}

export type Watch = {
  /** The page to compare with: "/" (the teachers' app) or "/f/" (the family app). */
  page: string;
  /** Nothing would be lost by loading the page again now (nothing being sent, nothing typed, no sheet open). */
  safe: () => boolean;
  /** A newer version, and no reload now: the teachers' update banner. */
  onNewer?: () => void;
  /** Back on the screen after at least this long: look online (so at most once in this long). */
  checkAfter?: number;
  /** Back after at least this long, a newer version and nothing to lose: the page loads again by itself. */
  reloadAfter?: number;
};

export type WatchEnv = {
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
  now: () => number;
  newer: () => Promise<boolean>;
  reload: () => void;
};

/** Look for a newer version each time the page comes back to the screen (a phone keeps a page open for days). */
export function watchUpdates(w: Watch, env?: Partial<WatchEnv>): () => void {
  const e: WatchEnv = {
    doc: env?.doc ?? document,
    now: env?.now ?? (() => Date.now()),
    newer: env?.newer ?? (() => newerOnline(w.page)),
    reload: env?.reload ?? (() => location.reload()),
  };
  const checkAfter = w.checkAfter ?? MIN;
  const reloadAfter = w.reloadAfter ?? 30 * MIN;
  let left = 0;
  let looking = false;
  const seen = () => {
    if (e.doc.visibilityState !== "visible") {
      left = left || e.now();
      return;
    }
    const away = left ? e.now() - left : 0;
    left = 0;
    if (away < checkAfter || looking) return;
    looking = true;
    void e.newer().then((yes) => {
      looking = false;
      if (!yes) return;
      if (away >= reloadAfter && w.safe()) e.reload();
      else w.onNewer?.();
    });
  };
  e.doc.addEventListener("visibilitychange", seen);
  return () => e.doc.removeEventListener("visibilitychange", seen);
}

const REOPEN = "aristora.reopen";

/** Load the newer version now; `where` = the Settings section to open once it is back (Books, after an upload). */
export function updateNow(where?: string): void {
  try {
    if (where) sessionStorage.setItem(REOPEN, where);
  } catch {
    /* private mode: it opens where it always does */
  }
  location.reload();
}

/** The Settings section an update asked to open (once). */
export function takeReopen(): string | null {
  try {
    const w = sessionStorage.getItem(REOPEN);
    sessionStorage.removeItem(REOPEN);
    return w;
  } catch {
    return null;
  }
}
