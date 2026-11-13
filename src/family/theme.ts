// Light or dark (13 Nov 2026, his rule): the app is light until HE switches Dark on in Me. The phone's or the browser's
// own dark setting changes nothing: a browser that darkens a page by itself picks its own colours (blue = right and
// rose = wrong can shift), so the page says "only light" (public/family/index.html, family.css) and the dark look is
// ours (dark.css, under html[data-theme="dark"]). Kept on this phone like Sound: read before the first screen.

const KEY = "aristora.family.theme";

export function darkOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "dark";
  } catch {
    return false; // private mode: light
  }
}

/** Puts the look on the page (the first thing main.tsx does, before anything is drawn by the app). */
export function showTheme(dark = darkOn()) {
  const root = document.documentElement;
  if (dark) root.dataset.theme = "dark";
  else delete root.dataset.theme;
}

const seen = new Set<(dark: boolean) => void>();
/** Told when he switches (the phone's bar follows: app.tsx). Returns how to stop. */
export function onTheme(fn: (dark: boolean) => void) {
  seen.add(fn);
  return () => void seen.delete(fn);
}

export function setDark(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, "dark");
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: it lasts until the app closes */
  }
  showTheme(on);
  seen.forEach((fn) => fn(on));
}

/** The phone's own bar above the page: the colour at the top of the screen (a header's violet, the same in both
 *  looks, or the page). */
export const barColour = (page: boolean, dark = document.documentElement.dataset.theme === "dark") => (!page ? "#7767f2" : dark ? "#131129" : "#f6f5fd");
