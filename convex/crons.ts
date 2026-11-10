// Scheduled work. Photos from home (4 Nov 2026): never kept. Every hour the files of photos marked a day ago, of
// levels taken back in class and uploads never attached go (`photos.sweep`).
// The race (7 Nov 2026): every 5 minutes the race rows of students who have none yet (or built with older XP rules)
// are built (`race.fill`: nothing to do once all are ready); Monday 00:05 in Sri Lanka (Sunday 18:35 UTC) last week's
// champions are kept (`race.week`).
// Each department's work (8 Nov 2026): every 10 minutes the days that are over and not kept yet (`work.fill`: nothing to
// do once yesterday is kept; the first time, back to the first day in the history).
// Us (7 Nov 2026): every day at 00:10 in Sri Lanka (18:40 UTC) the owl's birthdays and yesterday's count, and lines older
// than 30 days go (`us.daily`); Sunday 23:50 in Sri Lanka (18:20 UTC), before the race resets, the week's most improved
// (`us.improved`).
// The Shop (10 Nov 2026): Monday 00:15 in Sri Lanka (Sunday 18:45 UTC) each student's pay day: last week's XP pays coins,
// 5 XP = 1 coin (`coins.payday`, 20 a run; the first pay ran once when the Shop came, from `race.fill`).

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.hourly("delete photos marked a day ago", { minuteUTC: 17 }, internal.photos.sweep, {});
crons.interval("build the race rows still missing", { minutes: 5 }, internal.race.fill, {});
crons.interval("keep each day's work", { minutes: 10 }, internal.work.fill, {});
crons.weekly("keep last week's race champions", { dayOfWeek: "sunday", hourUTC: 18, minuteUTC: 35 }, internal.race.week, {});
crons.daily("the owl's birthdays and yesterday's count in Us", { hourUTC: 18, minuteUTC: 40 }, internal.us.daily, {});
crons.weekly("the week's most improved in Us", { dayOfWeek: "sunday", hourUTC: 18, minuteUTC: 20 }, internal.us.improved, {});
crons.weekly("pay day: last week's XP pays coins", { dayOfWeek: "sunday", hourUTC: 18, minuteUTC: 45 }, internal.coins.payday, {});

export default crons;
