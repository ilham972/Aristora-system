// The family app's offline helper, scope /f/ only (the teachers' app has none and must never get one).
// - The page: from the network when there is one (a new version shows at once), else the copy kept here.
// - Its files (/f/assets/, new names every version: code, style, its one font) and the owl: kept once fetched, and
//   fetched at install.
// - The server's answers (convex.cloud) are never touched.
// 3 (3 Nov 2026): the light purple look, Home and the whole syllabus. 4 (4 Nov 2026): the new palette and its one
// font for Tamil and English (preloaded by the page, so it is kept at install too); the old copies go when this starts.
// 5 (4 Nov 2026): Me's profile; its files come after the first screen, named in the page, so they are kept at install.
// 6 (13 Nov 2026): his Dark from Me. The dark colours (dark-*.css) and the few lines that attach them before the first
// paint (boot-*.js) are named in the page, so they are kept at install: a phone that chose Dark opens dark with no signal.
const CACHE = "aristora-family-6";
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

// Phone alerts (7 Nov 2026): a teacher's answer or message for a child on this phone (the server's push.send). The
// notification opens the app on its bell; an open app is told instead (it opens the bell itself).
// 8 Nov 2026 (his voice note: "the alert need to be give the sound ... instantly ... like WhatsApp"): the phone's own
// sound and a buzz; and while the app is on the screen, no notification: the app itself rings and shows the words.
// 12 Nov 2026 ("the notification sometimes not reaching the students"):
// - Only an Android phone may skip the notification while the app is on the screen. An iPhone counts every push that
//   shows nothing and, after three, cancels this phone's alerts for good; so everywhere else it is always shown.
// - `force` (his own test alert) is always shown: the test is of the phone's real sound.
// - It never ends without one of the two: if telling the open app fails, the notification is shown.
const ANDROID = /Android/.test(self.navigator.userAgent);
self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch (_) {
    d = { body: e.data ? e.data.text() : "" };
  }
  const show = () =>
    self.registration.showNotification(d.title || "ARISTORA", {
      body: d.body || "",
      tag: d.tag || "aristora",
      renotify: true,
      silent: false,
      vibrate: [300, 120, 300, 120, 300],
      timestamp: Date.now(),
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: d.url || "/f/" },
    });
  e.waitUntil(
    (ANDROID && !d.force
      ? self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
          const open = list.find((c) => c.visibilityState === "visible" && new URL(c.url).pathname.startsWith("/f/"));
          if (!open) return show();
          open.postMessage({ k: "new", body: d.body || "", url: d.url || "/f/" });
        })
      : show()
    ).catch(show),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/f/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).pathname.startsWith("/f/") && "focus" in c) {
          // A teacher's shout-out or 👏 opens Us (7 Nov 2026), an answer marked or a reply that post (#us=id), a
          // message that chat (#chat=id, 8 Nov 2026), everything else the bell.
          const k = url.indexOf("#chat=") >= 0 ? "chat" : url.indexOf("#us") >= 0 ? "us" : "bell";
          c.postMessage({ k: k, id: url.split(k === "chat" ? "#chat=" : "#us=")[1] || "" });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
