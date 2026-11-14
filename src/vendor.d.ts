// The two tiny silent videos from NoSleep.js (MIT), used to keep older iPhones awake.
declare module "nosleep.js/src/media.js" {
  const media: { webm: string; mp4: string };
  export default media;
}
// A font file: esbuild's file loader gives its address (scripts/build.mjs).
declare module "*.woff2" {
  const url: string;
  export default url;
}
