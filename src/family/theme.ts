// Light or dark (13 Nov 2026, his rule): the app is light until HE switches Dark on in Me. The phone's or the browser's
// own dark setting changes nothing: a browser that darkens a page by itself picks its own colours (blue = right and
// rose = wrong can shift), so the page says "only light" (public/family/index.html, family.css) and the dark look is
// ours (dark.css, under html[data-theme="dark"]). Kept on this phone like Sound.
// dark.css is its own file (the first load's budget is for everyone; dark is for those who chose it): the page names
// it (`<link rel="prefetch" data-dark>`, so the service worker keeps it), boot.ts attaches it before the first paint
// on a phone that chose Dark, and the switch attaches it here.

const KEY = "aristora.family.theme";

/** The teachers' frames (the class app's Us, the owner's Preview) are the teachers' app: always light. */
const teachers = () => /[?&]staff\b/.test(location.search) || location.hash.indexOf("#preview=") === 0;

export function darkOn(): boolean {
  try {
    return localStorage.getItem(KEY) === "dark" && !teachers();
  } catch {
    return false; // private mode: light
  }
}

/** The dark colours, attached once; done when they are here (or can't come: no signal and never kept). */
function colours(): Promise<void> {
  if (document.querySelector('link[rel="stylesheet"][data-dark-on]')) return Promise.resolve();
  const pre = document.querySelector<HTMLLinkElement>("link[data-dark]");
  if (!pre) return Promise.resolve();
  return new Promise((done) => {
    const l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = pre.href;
    l.setAttribute("data-dark-on", "");
    l.onload = () => done();
    l.onerror = () => {
      l.remove();
      done();
    };
    document.head.appendChild(l);
  });
}

/** Puts the look on the page. Dark waits for its colours (a moment the first time), so nothing is half painted. */
export function showTheme(dark = darkOn()): Promise<void> {
  const root = document.documentElement;
  if (!dark) {
    delete root.dataset.theme;
    return Promise.resolve();
  }
  return colours().then(() => {
    if (document.querySelector('link[rel="stylesheet"][data-dark-on]')) root.dataset.theme = "dark";
  });
}

/**
 * Once per phone, only on a phone set to dark: where Dark is. Until 13 Nov 2026 such a phone's browser could darken the
 * app by itself; from the day the page says "only light" that student opens a white app and would think we broke it.
 * Nothing switches by itself (his rule): the owl only says where the switch is.
 */
export function darkNews(): string | null {
  try {
    if (teachers() || localStorage.getItem(KEY + ".told") || localStorage.getItem(KEY) === "dark") return null;
    if (!matchMedia("(prefers-color-scheme: dark)").matches) return null;
    localStorage.setItem(KEY + ".told", "1");
    return "இப்போது Dark mode உண்டு: Me இல் இயக்கு 🌙";
  } catch {
    return null;
  }
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
  void showTheme(on).then(() => seen.forEach((fn) => fn(on)));
}

/** The phone's own bar above the page: the colour at the top of the screen (a header's violet, the same in both
 *  looks, or the page). */
export const barColour = (page: boolean, dark = document.documentElement.dataset.theme === "dark") => (!page ? "#7767f2" : dark ? "#131129" : "#f6f5fd");
