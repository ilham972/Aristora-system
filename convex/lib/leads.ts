// The department leads (8 Nov 2026): a consultation of her department rings on her phone, and she sends him (she walks
// the classrooms; the consultation room has its own teachers).

import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isTeachDept } from "./dept";

/** The active teachers who lead this department (Settings → Roles: the department and the lead tick). */
export async function leadsOf(ctx: QueryCtx, d: string | undefined): Promise<Id<"users">[]> {
  if (!isTeachDept(d as never)) return [];
  return (await ctx.db.query("users").collect()).filter((u) => u.active && u.role === "teacher" && u.dept === d && !!u.lead).map((u) => u._id);
}
