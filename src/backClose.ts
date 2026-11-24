// The phone's Back button closes a full-screen page: one history step while it is open (as teaching mode does).
// Pages open on top of each other (24 Nov 2026: the book's Preview over the T page) each hold their own step: Back
// closes only the top one, and a page closed by its own button takes its step back without closing the one under it.

import { useEffect, useRef } from "preact/hooks";

/** How many pages hold the body still (`body.sb-on`: the page under them doesn't scroll). */
let open = 0;

export function useBackClose(onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const mark = `sb${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    let popped = false;
    try {
      history.pushState({ ...(history.state ?? {}), sb: mark }, "");
    } catch {
      /* no history here */
    }
    const onPop = () => {
      // Back to this page's own step: a page above it went (by Back or by its own button). This one stays.
      if ((history.state as { sb?: string } | null)?.sb === mark) return;
      popped = true;
      close.current();
    };
    window.addEventListener("popstate", onPop);
    if (open++ === 0) document.body.classList.add("sb-on");
    return () => {
      window.removeEventListener("popstate", onPop);
      if (--open === 0) document.body.classList.remove("sb-on");
      if (!popped && (history.state as { sb?: string } | null)?.sb === mark) history.back();
    };
  }, []);
}
