// The family app's offline helper, scope /f/ only (the teachers' app has none and must never get one).
// - The page: from the network when it answers in time (a new version shows at once), else the copy kept here.
//   "In time" since 13 Nov 2026 (his ask: "like a native mobile app ... very fast"): until then a phone with a signal
//   waited for the network however long it took, so on weak data the app was a white screen for seconds before the owl
//   even showed. Now the kept copy opens after WAIT_MS at most, and the network's page is kept for the next open.
// - Its files (/f/assets/, new names every version: code, style, its one font) and the owl: kept once fetched, and
//   fetched whenever a new page is kept. A page is kept only after every file it names is here (keepPage), so the kept
//   copy always opens whole: every screen, with no signal, also after a newer version went online. The page names
//   the files of the first screen, of the parts right after it, and (its "f-keep" line, scripts/build.mjs) Us and the
//   chats, which the page itself fetches only when they open: here they are fetched behind the scenes, so their
//   first open never waits for a download.
// - The server's answers (convex.cloud) are never touched.
// 3 (3 Nov 2026): the light purple look, Home and the whole syllabus. 4 (4 Nov 2026): the new palette and its one
// font for Tamil and English (preloaded by the page, so it is kept at install too); the old copies go when this starts.
// 5 (4 Nov 2026): Me's profile; its files come after the first screen, named in the page, so they are kept at install.
// 6 (13 Nov 2026): his Dark from Me. The dark colours (dark-*.css) and the few lines that attach them before the first
// paint (boot-*.js) are named in the page, so they are kept at install: a phone that chose Dark opens dark with no signal.
const CACHE = "aristora-family-6";
const PAGE = "/__page";
/** How long an open waits for the network's page before the kept copy opens instead. */
const WAIT_MS = 700;
const KEEP = (p) => p.startsWith("/f/assets/") || p === "/icon.svg" || p === "/family.webmanifest";

/**
 * Keeps a page from the network with every file it names: the files first, the page last (a file that won't come
 * leaves the page from before, which has all of its own). `prune`: this page is the one on the screen, so the files of
 * older versions go.
 */
async function keepPage(res, prune) {
  const c = await caches.open(CACHE);
  const html = await res.clone().text();
  const files = [...new Set(html.match(/\/f\/assets\/[^"' ]+/g) || [])];
  const have = new Set((await c.keys()).map((r) => new URL(r.url).pathname));
  await c.addAll([...files, "/icon.svg"].filter((f) => !have.has(f)));
  await c.put(PAGE, res);
  if (prune) {
    for (const f of have) if (f.startsWith("/f/assets/") && !files.includes(f)) await c.delete(f);
  }
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      try {
        const page = await fetch(self.registration.scope, { cache: "no-store" });
        if (page.ok) await keepPage(page, false);
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
  if (req.mode === "navigate" && (url.pathname === "/f/" || url.pathname === "/f/index.html")) {
    e.respondWith(
      (async () => {
        const net = fetch(req).then((res) => ({ res: res, copy: res.ok ? res.clone() : null }));
        // The class app's Us tab (/f/?staff) names a file of its own that is never kept here: the network's page
        // (the kept one only with no signal).
        if (url.search) return net.then((x) => x.res).catch(() => caches.match(PAGE).then((hit) => hit || Response.error()));
        const kept = await caches.match(PAGE);
        if (!kept) {
          return net.then(
            (x) => {
              if (x.copy) e.waitUntil(keepPage(x.copy, true).catch(() => {}));
              return x.res;
            },
            () => Response.error(),
          );
        }
        // The network's page when it answers in time; else the kept copy now, and the network's is kept when it comes.
        const soon = await Promise.race([net.then((x) => (x.copy ? x : null)).catch(() => null), new Promise((r) => setTimeout(r, WAIT_MS, null))]);
        e.waitUntil(net.then((x) => (x.copy ? keepPage(x.copy, !!soon) : undefined)).catch(() => {}));
        return soon ? soon.res : kept;
      })(),
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
