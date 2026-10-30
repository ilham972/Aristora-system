// The teachers' side of the family app.
//   makeLink    -> a family link for one student (Settings → Students → Family): sent on WhatsApp, one use, 7 days.
//   phones      -> his family's phones and link (the Family sheet).
//   signOutAll  -> every family phone of his signs out; an unused link stops working.
//   setOpenAll  -> "Open every World" for him (else they open in order).
//   answers     -> what the phone accepts for each question of a workbook (teachers check it once per unit).
// Owner, or a teacher with Students. Family phones can't call any of these (viewer / actor).

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { actor, FAMILY_LINK_MS, viewer } from "./lib/auth";
import { asMaster, bookFor, cleanBy, fail, getStudent, log } from "./lib/backend";
import { allPhone, phoneKey, phoneShare, wantWords } from "./lib/phone";

const token = v.optional(v.string());

/** A new family link for him: the code is made on the phone; only its SHA-256 comes here. */
export const makeLink = mutation({
  args: { token, studentId: v.id("students"), codeHash: v.string(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const me = await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (s.archived) fail(`${s.name} was removed. Bring them back first.`);
    if (!/^[0-9a-f]{64}$/.test(args.codeHash)) fail("This phone couldn't make a safe link. Update the browser.");
    const now = Date.now();
    for (const l of await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) await ctx.db.patch(l._id, { cancelledAt: now });
    }
    const taken = await ctx.db
      .query("familyLinks")
      .withIndex("by_code", (q) => q.eq("codeHash", args.codeHash))
      .first();
    if (taken) fail("Try again.");
    const expiresAt = now + FAMILY_LINK_MS;
    await ctx.db.insert("familyLinks", { studentId: s._id, codeHash: args.codeHash, createdAt: now, expiresAt, createdBy: me._id });
    await log(ctx, null, now, { kind: "family-link", by: cleanBy(args.by), studentId: s._id, name: s.name });
    return { expiresAt };
  },
});

/** His family's phones (signed in), his unused link, and whether every World is open for him. */
export const phones = query({
  args: { token, studentId: v.id("students") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "owner", "students");
    const s = await getStudent(ctx, args.studentId);
    const now = Date.now();
    const devices = (await ctx.db
      .query("familyDevices")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()).filter((d) => d.revokedAt === undefined);
    const link = (await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()).find((l) => l.usedAt === undefined && l.cancelledAt === undefined && l.expiresAt > now);
    return {
      phones: devices.map((d) => ({ label: d.label, since: d.createdAt, lastSeenAt: d.lastSeenAt })),
      linkUntil: link?.expiresAt ?? null,
      openAll: !!s.openAll,
    };
  },
});

/** Every family phone of his signs out, and an unused link stops working (a lost phone, a link sent wrongly). */
export const signOutAll = mutation({
  args: { token, studentId: v.id("students"), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    const now = Date.now();
    let n = 0;
    for (const d of await ctx.db
      .query("familyDevices")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (d.revokedAt === undefined) {
        await ctx.db.patch(d._id, { revokedAt: now });
        n++;
      }
    }
    for (const l of await ctx.db
      .query("familyLinks")
      .withIndex("by_student", (q) => q.eq("studentId", s._id))
      .collect()) {
      if (l.usedAt === undefined && l.cancelledAt === undefined) await ctx.db.patch(l._id, { cancelledAt: now });
    }
    await log(ctx, null, now, { kind: "family-off", by: cleanBy(args.by), studentId: s._id, name: s.name, value: String(n) });
    return n;
  },
});

/** "Open every World" for him in the family app (else: in order, from where the teachers put him). */
export const setOpenAll = mutation({
  args: { token, studentId: v.id("students"), on: v.boolean(), by: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await actor(ctx, args.token, ["owner", "students"], args.by);
    const s = await getStudent(ctx, args.studentId);
    if (!!s.openAll === args.on) return true;
    await ctx.db.patch(s._id, { openAll: args.on || undefined });
    await log(ctx, null, Date.now(), { kind: "open-all", by: cleanBy(args.by), studentId: s._id, name: s.name, value: args.on ? "on" : "off" });
    return true;
  },
});

/**
 * What the phone accepts for each question of a workbook, and what it leaves to the corrector: read from the answer
 * key that came with the upload. Teachers only (it holds the answers); fetched only while the list is open.
 */
export const answers = query({
  args: { token, unitId: v.id("units") },
  handler: async (ctx, args) => {
    await viewer(ctx, args.token, "any");
    const book = await bookFor(ctx, args.unitId, "master");
    if (!book) return null;
    const data = asMaster(book);
    const key = await ctx.db
      .query("keys")
      .withIndex("by_unit", (q) => q.eq("unitId", args.unitId))
      .first();
    if (!key) return { share: null, qs: [] };
    const keys = phoneKey(key.answers, data);
    return {
      share: phoneShare(keys),
      qs: [...keys.values()].map((k) => ({
        q: k.q,
        max: k.max,
        phone: allPhone(k),
        parts: k.parts.filter((p) => p.m > 0).map((p) => ({ p: p.p, m: p.m, words: wantWords(p), phone: p.want !== null })),
      })),
    };
  },
});
