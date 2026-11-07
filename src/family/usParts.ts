// Us, the students' community, in its own file (8 Nov 2026): its tab, a line opened and what students write there,
// with its own style (usStyle.ts). A phone fetches it only once the owner opened Us (later.ts loadUs: right after the
// first screen, then kept by the service worker), and the teachers' Us (staff.tsx) uses it too. Import it through
// loadUs() / useUsParts(), never straight, or it comes back into the first load. Its size has its own budget
// (scripts/build.mjs FAMILY_US_KB).
import { addUsStyle } from "./usStyle";

addUsStyle();

export { UsTab } from "./us";
export { Composer, DoubtSheet, LearnSheet, ThreadScreen } from "./usPost";
