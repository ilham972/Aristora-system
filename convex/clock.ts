import { v } from "convex/values";
import { mutation } from "./_generated/server";

/** Server time, so every phone shows the same timers even if its clock is off. */
export const ping = mutation({
  // Public on purpose: it only tells the time. (Takes the token every call sends.)
  args: { token: v.optional(v.string()) },
  handler: async () => Date.now(),
});
