// The family app's entry: app.aristora.org (and /f/ on the class system's address, for testing).
import { render } from "preact";
import { App } from "./app";
import "./family.css";

render(<App />, document.getElementById("app")!);

// Opens with no signal after the first visit: the page from the network when there is one, else the copy kept on the
// phone; the files (their names change with every version) are kept once fetched. Never in tests.
if ("serviceWorker" in navigator && !(globalThis as { __ARISTORA_TEST_BACKEND__?: unknown }).__ARISTORA_TEST_BACKEND__) {
  const sw = location.pathname.startsWith("/f/") ? "/f/sw.js" : "/sw.js";
  window.addEventListener("load", () => void navigator.serviceWorker.register(sw).catch(() => {}));
}
