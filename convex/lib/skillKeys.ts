// Permanent skill keys in the database (23 Nov 2026; the rules: lib/skills.ts carryKeys). One counter (meta
// SKILL_SEQ_KEY) hands out "k1", "k2" … so a key is never given twice, whatever happens to the skills.

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { SKILL_SEQ_KEY, skillKeyOf, type Skill } from "./skills";

/** New keys for one mutation; `save` writes the counter back once, at the end. */
export async function keyMaker(ctx: MutationCtx): Promise<{ fresh: () => string; save: () => Promise<void> }> {
  const row = await ctx.db
    .query("meta")
    .withIndex("by_key", (q) => q.eq("key", SKILL_SEQ_KEY))
    .first();
  const start = Number(row?.value) || 0;
  let n = start;
  return {
    fresh: () => skillKeyOf(++n),
    save: async () => {
      if (n === start) return;
      if (row) await ctx.db.patch(row._id, { value: n });
      else await ctx.db.insert("meta", { key: SKILL_SEQ_KEY, value: n });
    },
  };
}

/** A unit's skills row with a key on every skill (an older row gets its keys now, once). */
export async function keyedRow(ctx: MutationCtx, row: Doc<"skillTags">): Promise<Doc<"skillTags">> {
  if (row.skills.every((s) => s.k)) return row;
  const keys = await keyMaker(ctx);
  const skills: Skill[] = row.skills.map((s) => (s.k ? s : { ...s, k: keys.fresh() }));
  await ctx.db.patch(row._id, { skills });
  await keys.save();
  return { ...row, skills };
}

/** How many videos each skill key of a unit has (any kind, any state). */
export async function videosByKey(ctx: QueryCtx, unitId: Id<"units">): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  for (const r of await ctx.db
    .query("videos")
    .withIndex("by_unit", (q) => q.eq("unitId", unitId))
    .collect()) {
    out.set(r.sk, (out.get(r.sk) ?? 0) + 1);
  }
  return out;
}
