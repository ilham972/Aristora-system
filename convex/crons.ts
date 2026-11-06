// Scheduled work. Photos from home (4 Nov 2026): never kept. Every hour the files of photos marked a day ago, of
// levels taken back in class and uploads never attached go (`photos.sweep`).
// The race (7 Nov 2026): every 5 minutes the race rows of students who have none yet (or built with older XP rules)
// are built (`race.fill`: nothing to do once all are ready); Monday 00:05 in Sri Lanka (Sunday 18:35 UTC) last week's
// champions are kept (`race.week`).

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("delete photos marked a day ago", { minuteUTC: 17 }, internal.photos.sweep, {});
crons.interval("build the race rows still missing", { minutes: 5 }, internal.race.fill, {});
crons.weekly("keep last week's race champions", { dayOfWeek: "sunday", hourUTC: 18, minuteUTC: 35 }, internal.race.week, {});

export default crons;
