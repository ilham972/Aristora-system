// The loading owl (#splash in public/index.html): it moves (blinks, looks around, tilts its head, its tassel swings)
// while the app loads, from the very first paint, before any of this code has arrived. The app calls hideSplash()
// once its first real screen is ready (the class, the sign-in, or an error to read). Its styles: "Splash" in
// styles.css.

/** The owl stays at least this long after the page starts (it pops in and blinks once), so a fast load doesn't flash. */
const MIN_MS = 1200;
const FADE_MS = 320;
let hidden = false;

/**
 * `min`: the family app's owl falls in and lands in 0.8 s (owl.css fs-drop), so there the app shows at 0.85 s (14 Nov
 * 2026, his yes: a slow phone has Home ready at about 0.6 s and waited for the owl on every open); the teachers' owl
 * keeps its 1.2 s.
 */
export function hideSplash(min = MIN_MS): void {
  if (hidden) return;
  hidden = true;
  const el = typeof document !== "undefined" ? document.getElementById("splash") : null;
  if (!el) return;
  // Test browsers (automation) skip the wait, so every test starts on the real screen.
  const fast = typeof navigator !== "undefined" && navigator.webdriver === true;
  const wait = fast ? 0 : Math.max(0, min - performance.now());
  setTimeout(() => {
    el.classList.add("out");
    setTimeout(() => el.remove(), fast ? 0 : FADE_MS);
  }, wait);
}
