// The class app's Us tab (7 Nov 2026, his voice note: "build the tab for the teachers on the Aristora system app ... if
// they want to go community, they can immediately switch the tab ... the same UI UX that you used in the family app").
// The students' community with the family app's own screens and look (src/family/staff.tsx), inside this app: an iframe
// of /f/?staff on this same address, so it reads this phone's sign-in (nothing new to remember) and adds nothing to the
// class app's own files (it loads the family app's small ones). Made the first time the tab opens and kept while the app
// is open, so switching back is instant and the class app's alerts keep ringing meanwhile; each opening asks it for the
// newest lines.

import { useEffect, useRef, useState } from "preact/hooks";
import { api } from "../convex/_generated/api";
import { subscribe } from "./backend";

/** Her private chats in Us with something new (8 Nov 2026: convex/chat.ts tunread), live: the Us tab's number. */
export function useChatNew(on: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return;
    return subscribe(
      api.chat.tunread,
      {},
      (v) => setN(v),
      () => setN(0),
    );
  }, [on]);
  return n;
}

export function UsFrame(props: { open: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [made, setMade] = useState(props.open);
  useEffect(() => {
    if (!props.open) return;
    setMade(true);
    ref.current?.contentWindow?.postMessage({ k: "us-refresh" }, location.origin);
  }, [props.open]);
  if (!made) return null;
  return <iframe ref={ref} class={`us-frame${props.open ? " on" : ""}`} src="/f/?staff" title="Us: the students' community" />;
}
