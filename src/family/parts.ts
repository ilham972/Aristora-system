// Me and its profile parts, one file fetched after the first screen (later.ts says why): import them through
// loadParts() / useParts(), never straight, or they come back into the first load. Their style is its own file too
// (profile.css, attached by loadParts).
export { MeTab } from "./me";
export { ReportScreen } from "./profile";
export { CertSheet } from "./cert";
// A classmate's profile (7 Nov 2026): tap anyone in the race.
export { MateScreen } from "./mate";
// The newer-version check (5 Nov 2026): not needed before the first screen, so here, out of the first load's budget.
export { busyHere, watchUpdates } from "../appVersion";
// The owner's Preview of a Stage (5 Nov 2026): main.tsx starts it only on the class system's address with #preview=.
export { startPreview } from "./preview";
// Cropping a photo of his work before it goes to a teacher (6 Nov 2026): the camera (book.tsx's Taker) opens it.
export { CropSheet } from "./crop";
