// The family app's offline helper, scope /f/ only (the teachers' app has none and must never get one).
// - The page: from the network when there is one (a new version shows at once), else the copy kept here.
// - Its files (/f/assets/, new names every version: code, style, its one font) and the owl: kept once fetched, and
//   fetched at install.
// - The server's answers (convex.cloud) are never touched.
// 3 (3 Nov 2026): the light purple look, Home and the whole syllabus; the old copies go when this one starts.
const CACHE = "aristora-family-3";
const KEEP = (p) => p.startsWith("/f/assets/") || p === "/icon.svg" || p === "/family.webmanifest";

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const c = await caches.open(CACHE);
      try {
        const page = await fetch(self.registration.scope, { cache: "no-store" });
        const html = await page.clone().text();
        await c.put("/__page", page);
        const files = [...new Set(html.match(/\/f\/assets\/[^"']+/g) || [])];
        await c.addAll([...files, "/icon.svg"]);
      } catch (_) {
        /* kept as it is fetched */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put("/__page", copy));
          }
          return res;
        })
        .catch(() => caches.match("/__page").then((hit) => hit || Response.error())),
    );
    return;
  }
  if (KEEP(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
