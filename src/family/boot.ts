// The look before the first paint (13 Nov 2026). A page's own script must be a file (vercel.json: script-src 'self'),
// so this is the smallest one, named in the page before the body (scripts/build.mjs), kept by the service worker.
// A phone where he chose Dark in Me gets the dark colours (dark.css, its own file: a light phone never waits for it)
// while the page is still being read, so the loading owl is already dark: no white flash at night.
// The teachers' frames (/f/?staff, the owner's #preview=) are part of the teachers' app: always light.
// The same rules live in theme.ts (the switch in Me); keep the two in step.
(() => {
  try {
    if (localStorage.getItem("aristora.family.theme") !== "dark" || /[?&]staff\b/.test(location.search) || location.hash.indexOf("#preview=") === 0) return;
    const pre = document.querySelector<HTMLLinkElement>("link[data-dark]");
    if (!pre) return;
    document.documentElement.dataset.theme = "dark";
    // Written by the page's own reader, so nothing is painted before it has come.
    document.write(`<link rel="stylesheet" href="${pre.getAttribute("href")}" data-dark-on>`);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", "#131129");
  } catch {
    /* private mode: light */
  }
})();
