// The level screen (play.tsx: a level, its result, a question full screen, and kinds.tsx under it) comes right after
// the first screen, like Me (later.ts): it was a quarter of the first load and the first screen never shows it (5 Nov
// 2026: room for fractions and the boxes inside the question). The build names it in the page, so the service worker
// keeps it and it opens with no signal. Import it only through loadLevel() / useLevel(), never straight (types are
// fine: `import type`), or it comes back into the first load.
import { useEffect, useState } from "preact/hooks";

type Level = typeof import("./play");

let got: Level | null = null;
let loading: Promise<Level> | null = null;

/** The level screen's module (fetched once; after a failed fetch, the next call tries again). */
export function loadLevel(): Promise<Level> {
  loading ??= import("./play").then(
    (m) => (got = m),
    (e: unknown) => {
      loading = null;
      throw e;
    },
  );
  return loading;
}

/** The level screen once it is here (it starts coming as soon as the app is drawn); with no signal, again every 3 s. */
export function useLevel(): Level | null {
  const [m, setM] = useState<Level | null>(got);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (m) return;
    let gone = false;
    loadLevel().then(
      (x) => {
        if (!gone) setM(x);
      },
      () => {
        if (!gone) setTimeout(() => setTries((n) => n + 1), 3000);
      },
    );
    return () => {
      gone = true;
    };
  }, [tries]);
  return m;
}
