// The AI's automatic mode (16 Nov 2026, his ask: "if the automatic mode is on in the setting, then correction will
// happen automatically"): its switch (meta `ai.auto`: on, and the teacher of the threads it opens) and the one call
// family.ts makes when something from home waits for a teacher. The check itself: convex/ai.ts (`auto`, `run`, `settle`).

import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { AI_AUTO_KEY } from "./ai";

export type AutoCfg = { on: boolean; t: string | null };

export async function autoCfg(ctx: QueryCtx): Promise<AutoCfg> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", AI_AUTO_KEY))
    .first();
  const v = row?.value as Partial<AutoCfg> | undefined;
  return { on: !!v?.on, t: typeof v?.t === "string" ? v.t : null };
}

/** He sent a drawing's photos or typed a reason for a teacher: with the switch on, the AI checks it now. */
export async function queueAuto(ctx: MutationCtx, home: Id<"homePhotos">): Promise<void> {
  if (!(await autoCfg(ctx)).on) return;
  await ctx.scheduler.runAfter(0, internal.ai.auto, { home });
}
