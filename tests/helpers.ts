// Test helpers: people and signed-in phones, put straight into the test database.

import type { TestConvex } from "convex-test";
import type { Id } from "../convex/_generated/dataModel";
import { EXTRAS, secretHash, TABS, type Extra, type Tab } from "../convex/lib/auth";
import type schema from "../convex/schema";

type T = TestConvex<typeof schema>;

export const OWNER_TOKEN = "owner-phone-token-0123456789abcdefghijklmnopqrstuv";

/** A person with a phone already signed in (with this token). */
export async function addPerson(
  t: T,
  p: { name: string; token: string; role?: "owner" | "teacher"; tabs?: Tab[]; can?: Extra[] },
): Promise<Id<"users">> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const owner = p.role === "owner";
    const userId = await ctx.db.insert("users", {
      name: p.name,
      nameKey: p.name.toLowerCase(),
      role: owner ? "owner" : "teacher",
      tabs: owner ? TABS : (p.tabs ?? ["correction"]),
      can: owner ? EXTRAS : (p.can ?? []),
      active: true,
      createdAt: now,
    });
    await ctx.db.insert("devices", { userId, tokenHash: secretHash("token", p.token), label: "Test phone", createdAt: now, lastSeenAt: now });
    return userId;
  });
}

/** The same test backend, with every query and mutation sent from the phone holding this token. */
export function asPhone(t: T, token: string): T {
  return new Proxy(t, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver) as unknown;
      if (prop === "query" || prop === "mutation") {
        const fn = value as (ref: unknown, args?: Record<string, unknown>) => Promise<unknown>;
        return (ref: unknown, args?: Record<string, unknown>) => fn.call(target, ref, { token, ...(args ?? {}) });
      }
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
}

/** The test backend as the owner's phone. */
export async function asOwner(t: T): Promise<T> {
  await addPerson(t, { name: "Owner", token: OWNER_TOKEN, role: "owner" });
  return asPhone(t, OWNER_TOKEN);
}
