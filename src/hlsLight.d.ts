// hls.js's light build (no subtitles, no other audio tracks, no DRM: none needed) has the same types as the full one;
// its package names no types for it (src/videoPlay.ts).
declare module "hls.js/light" {
  export * from "hls.js";
  export { default } from "hls.js";
}
