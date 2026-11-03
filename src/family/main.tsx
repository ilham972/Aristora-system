// The family app's entry: app.aristora.org (and /f/ on the class system's address, for testing).
import "./fonts/font.css";
import "../splash.css";
import "./family.css";
import "./owl.css";
import { render } from "preact";
import { App } from "./app";
import { keepOwl } from "./ui";

// The living owl of the loading page is drawn again inside the app (the same drawing, no extra bytes).
keepOwl();
render(<App />, document.getElementById("app")!);

// Opens with no signal after the first visit: the page from the network when there is one, else the copy kept on the
// phone; the files (their names change with every version) are kept once fetched. Never in tests.
if (
  "serviceWorker" in navigator &&
  location.pathname.startsWith("/f/") &&
  !(globalThis as { __ARISTORA_TEST_BACKEND__?: unknown }).__ARISTORA_TEST_BACKEND__
) {
  window.addEventListener("load", () => void navigator.serviceWorker.register("/f/sw.js").catch(() => {}));
}
