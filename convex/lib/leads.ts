// The department leads (8 Nov 2026): a consultation of her department rings on her phone, and she sends him (she walks
// the classrooms; the consultation room has its own teachers).

import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isTeachDept } from "./dept";

/**
 * The people who lead this department (Settings → Roles: the department and the lead tick): its lead teachers, and the
 * owner while he works in it as its lead (8 Nov 2026).
 */
export async function leadsOf(ctx: QueryCtx, d: string | undefined): Promise<Id<"users">[]> {
  if (!isTeachDept(d as never)) return [];
  return (await ctx.db.query("users").collect()).filter((u) => u.active && u.dept === d && !!u.lead).map((u) => u._id);
}
