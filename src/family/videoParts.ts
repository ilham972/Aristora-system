// A skill's video player (23 Nov 2026): its own file, fetched only when a Stage has videos (map.tsx loads it as the
// Stage opens), never in the first load or the parts every phone prefetches. hls.js is a file of its own after it
// (src/videoPlay.ts). The service worker keeps both (scripts/build.mjs names them in the page).
export { prepare, VideoScreen } from "./video";
export { addVideoStyle } from "./videoStyle";
export { loadHls } from "../videoPlay";
