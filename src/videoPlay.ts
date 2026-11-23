// Plays a video's stream (HLS) in a <video>, the same in both apps (23 Nov 2026, his rule: "very fast and smooth like
// YouTube"). Imports nothing up front (the family app takes it): Safari's own player where it has one (iPhone, iPad,
// Mac: no code to fetch at all), hls.js elsewhere (Android Chrome, PCs), fetched only when a video is about to play
// and kept by the phone. Every host serves HLS (Mux now, Bunny or Cloudflare later): nothing here knows the host.
// - Starts small for an instant start (its first guess of the signal is low), then sharpens as the signal allows,
//   never bigger than the screen needs (data); a weak signal drops quality before it stops to load.
// - A dropped connection is retried by itself; a broken stream says so once (`onFail`).

type HlsModule = typeof import("hls.js/light");
let hls: Promise<HlsModule> | null = null;

/** hls.js, once (call it early, e.g. when a Stage with videos opens, so ▶ never waits for it). */
export function loadHls(): Promise<HlsModule> {
  hls ??= import("hls.js/light").catch((e: unknown) => {
    hls = null;
    throw e;
  });
  return hls;
}

/** Apple's browsers play HLS themselves, better than any script (iPhone 7 on iOS 15 too). */
export function nativeHls(video: HTMLVideoElement): boolean {
  const apple = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.vendor ?? "").includes("Apple");
  return apple && video.canPlayType("application/vnd.apple.mpegurl") !== "";
}

/** Play `src` in `video` from `at` seconds. Returns how to let go of it (call it when the screen closes). */
export async function attach(video: HTMLVideoElement, src: string, at: number, onFail: (why: string) => void): Promise<() => void> {
  const seekOnce = () => {
    if (at > 0 && video.currentTime < 0.5) video.currentTime = at;
  };
  if (nativeHls(video)) {
    video.addEventListener("loadedmetadata", seekOnce, { once: true });
    video.src = src;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }
  const { default: Hls } = await loadHls();
  if (!Hls.isSupported()) {
    // No Media Source here: the browser's own player, if it has one.
    video.addEventListener("loadedmetadata", seekOnce, { once: true });
    video.src = src;
    return () => {
      video.removeAttribute("src");
      video.load();
    };
  }
  const h = new Hls({
    startPosition: at > 0 ? at : -1,
    // A low first guess of the signal: the first seconds come fast, then it climbs.
    abrEwmaDefaultEstimate: 600_000,
    capLevelToPlayerSize: true,
    maxBufferLength: 30,
    backBufferLength: 30,
    enableWorker: true,
  });
  let media = 0;
  let net = 0;
  let gone = false;
  h.on(Hls.Events.ERROR, (_e, d) => {
    if (!d.fatal || gone) return;
    if (d.type === Hls.ErrorTypes.NETWORK_ERROR && net++ < 3) return h.startLoad();
    if (d.type === Hls.ErrorTypes.MEDIA_ERROR && media++ < 2) return h.recoverMediaError();
    onFail(d.details ?? "error");
  });
  // Playing again after a weak moment resets the count of retries.
  h.on(Hls.Events.FRAG_LOADED, () => {
    net = 0;
  });
  h.loadSource(src);
  h.attachMedia(video);
  return () => {
    gone = true;
    h.destroy();
  };
}
