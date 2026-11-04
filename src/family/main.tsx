// The family app's entry: app.aristora.org (and /f/ on the class system's address, for testing).
import "./fonts/font.css";
import "../splash.css";
import "./family.css";
import "./owl.css";
import { render } from "preact";
import { App } from "./app";
import { loadParts } from "./later";
import { keepOwl } from "./ui";

// Two fingers never zoom (his ask, 4 Nov 2026: "students want to feel like a native app"). Chrome obeys the page's
// user-scalable=no and the CSS touch-action; an iPhone ignores user-scalable=no (since iOS 10), so Safari's own pinch
// gestures are stopped too. They exist only in Safari; nothing here touches scrolling.
if ("GestureEvent" in window) {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener("gesturestart", stop, { passive: false });
  document.addEventListener("gesturechange", stop, { passive: false });
}
// Holding a finger on a picture or a link opens no menu (an app has none); a typing box keeps its own.
document.addEventListener("contextmenu", (e) => {
  if (!(e.target instanceof Element && e.target.closest("input, textarea"))) e.preventDefault();
});

// The living owl of the loading page is drawn again inside the app (the same drawing, no extra bytes).
keepOwl();
// The owner's Preview of a Stage (5 Nov 2026, src/family/preview.tsx): opened from the class system on its own address
// with his sign-in; it lives in the parts fetched after the first screen (its own file would split the level screen's
// code out of the first load, +1.2 KB). Every other phone opens the app.
const look = /^#preview=([a-z0-9]+)$/i.exec(location.hash);
if (look) void loadParts().then((m) => m.startPreview(look[1], document.getElementById("app")!));
else render(<App />, document.getElementById("app")!);

// Opens with no signal after the first visit: the page from the network when there is one, else the copy kept on the
// phone; the files (their names change with every version) are kept once fetched. Never in tests.
if (
  "serviceWorker" in navigator &&
  location.pathname.startsWith("/f/") &&
  !look &&
  !(globalThis as { __ARISTORA_TEST_BACKEND__?: unknown }).__ARISTORA_TEST_BACKEND__
) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/f/sw.js").catch(() => {}));
}
