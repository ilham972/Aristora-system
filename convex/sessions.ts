import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { cleanBy, closeSession, fail, openSession } from "./lib/backend";

/** End of class: everyone out, open calls closed, report written. */
export const end = mutation({
  args: { by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const session = await openSession(ctx);
    if (!session) fail("No session is running.");
    await closeSession(ctx, session, now, cleanBy(args.by));
    const closed = await ctx.db.get(session._id);
    return closed?.report ?? null;
  },
});
