// Scheduled work. Photos from home (4 Nov 2026): never kept. Every hour the files of photos marked a day ago, of
// levels taken back in class and uploads never attached go (`photos.sweep`).

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("delete photos marked a day ago", { minuteUTC: 17 }, internal.photos.sweep, {});

export default crons;
