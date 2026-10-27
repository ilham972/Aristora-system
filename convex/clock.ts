import { mutation } from "./_generated/server";

/** Server time, so every phone shows the same timers even if its clock is off. */
export const ping = mutation({
  args: {},
  handler: async () => Date.now(),
});
